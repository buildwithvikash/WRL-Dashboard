import sql from "mssql";
import { dbConfig2 } from "../../config/db.config.js";
import { tryCatch } from "../../utils/tryCatch.js";
import { AppError } from "../../utils/AppError.js";

export const getDispatchMasterBySession = tryCatch(async (req, res) => {
  // Accepts either a Session_ID or an FGSerialNo in the same field — resolves
  // it to the owning Session_ID, then returns every FG under that session.
  const { searchValue, sessionId } = req.query;
  const term = searchValue || sessionId;

  if (!term) {
    throw new AppError(
      "Missing required query parameter: searchValue (Session ID or FG Serial No.).",
      400,
    );
  }

  const query = `
    DECLARE @SessionID VARCHAR(200);

    SELECT TOP 1
        @SessionID = Session_ID
    FROM DispatchMaster
    WHERE Session_ID = @SearchValue
       OR FGSerialNo = @SearchValue;

    IF OBJECT_ID('tempdb..#FGList') IS NOT NULL
        DROP TABLE #FGList;

    SELECT DISTINCT
        CAST(FGSerialNo AS VARCHAR(50)) AS FGSerialNo
    INTO #FGList
    FROM DispatchMaster
    WHERE Session_ID = @SessionID;

    DECLARE @FG_IN_LIST NVARCHAR(MAX);
    SELECT @FG_IN_LIST = STRING_AGG('''' + FGSerialNo + '''', ',') FROM #FGList;
    IF @FG_IN_LIST IS NULL SET @FG_IN_LIST = 'NULL';

    -- Escaped for safe embedding inside the OPENQUERY string literal below.
    DECLARE @FG_IN_LIST_ESCAPED NVARCHAR(MAX);
    SET @FG_IN_LIST_ESCAPED = REPLACE(@FG_IN_LIST, '''', '''''');

    -- Escaped for safe concatenation into the dynamic SQL string below.
    DECLARE @SessionIDEscaped NVARCHAR(200) = REPLACE(ISNULL(@SessionID, ''), '''', '''''');

    DECLARE @sql NVARCHAR(MAX);

    SET @sql = N'
    SELECT
        DM.ModelName,
        mb.Serial        AS FG_Serial,
        mb.VSerial       AS AssetCode,

        -- Serial2 = ''<NFCID>/<CustomerQR>''
        LEFT(mb.Serial2, CHARINDEX(''/'', mb.Serial2 + ''/'') - 1) AS NFCID,
        SUBSTRING(
            mb.Serial2,
            CHARINDEX(''/'', mb.Serial2 + ''/'') + 1,
            LEN(mb.Serial2)
        ) AS CustomerQR,

        mb.CreatedOn
    FROM DispatchMaster AS DM
    INNER JOIN OPENQUERY(
        WRL_SERVER,
        ''
        SELECT
            Serial,
            VSerial,
            Serial2,
            CreatedOn
        FROM Garuda_WRL_LIVE.dbo.MaterialBarcode
        WHERE Serial IN (' + @FG_IN_LIST_ESCAPED + ')
        ''
    ) mb
        ON mb.Serial COLLATE SQL_Latin1_General_CP1_CI_AS
         = DM.FGSerialNo COLLATE SQL_Latin1_General_CP1_CI_AS
    WHERE DM.Session_ID = ''' + @SessionIDEscaped + ''';';

    EXEC (@sql);
  `;

  const pool = await new sql.ConnectionPool(dbConfig2).connect();

  try {
    const result = await pool
      .request()
      .input("SearchValue", sql.VarChar, term)
      .query(query);

    res.json({
      success: true,
      message: "FG Casting data retrieved successfully.",
      data: result.recordset ?? [],
    });
  } catch (error) {
    throw new AppError(`Failed to fetch FG Casting data:${error.message}`, 500);
  } finally {
    await pool.close();
  }
});
