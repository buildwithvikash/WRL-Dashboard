import sql from "mssql";
import { dbConfig1 } from "../../../config/db.config.js"; // Adjust this path to your project
import { tryCatch } from "../../../utils/try-catch.js"; // Adjust if your project uses another path
import { AppError } from "../../../utils/app-error.js"; // Adjust if your project uses another path

/* -------------------------------------------------------------------------- */
/* Database connection                                                        */
/* -------------------------------------------------------------------------- */

let poolPromise;

const getPool = async () => {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig1).connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
};

/* -------------------------------------------------------------------------- */
/* Request parameters                                                         */
/* -------------------------------------------------------------------------- */

const extractParams = (query = {}) => {
  const { startDate, endDate } = query;

  if (!startDate || !endDate) {
    throw new AppError("startDate and endDate are required.", 400);
  }

  // Validate YYYY-MM-DD date values.
  const isValidDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  };

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new AppError("Please provide valid dates in YYYY-MM-DD format.", 400);
  }

  if (startDate > endDate) {
    throw new AppError("startDate cannot be after endDate.", 400);
  }

  const pageValue = Number.parseInt(query.page, 10);
  const limitValue = Number.parseInt(query.limit, 10);

  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;

  const limit =
    Number.isInteger(limitValue) && limitValue > 0
      ? Math.min(limitValue, 500)
      : 100;

  // Use an exclusive upper boundary so the entire end date is included.
  const endDateObject = new Date(`${endDate}T00:00:00.000Z`);
  endDateObject.setUTCDate(endDateObject.getUTCDate() + 1);

  const endDateExclusive = endDateObject.toISOString().slice(0, 10);

  return {
    startDate,
    endDate,
    endDateExclusive,
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

/* -------------------------------------------------------------------------- */
/* Shared SQL                                                                 */
/* -------------------------------------------------------------------------- */

/*
    Relationship used:

    fgs.PSNo = mb.DocNo
    mb.Serial = cabinet serial
    fgs.Serial = serial recorded in the scrap transaction

    A cabinet is grouped by:
    PSNo + DocNo + CabinetSerial

    The cabinet serial itself is excluded from the component list.
*/

const BASE_FROM = `
    FROM FGScrap AS fgs

    INNER JOIN Users AS u
        ON u.UserID = fgs.UserID

    INNER JOIN MaterialBarcode AS mb
        ON mb.DocNo = fgs.PSNo

    INNER JOIN Material AS m
        ON m.MatCode = mb.Material

    INNER JOIN ProductionLine AS pl
        ON pl.LineCode = m.Route

    WHERE fgs.ScrapDate >= @startDate
      AND fgs.ScrapDate < @endDateExclusive
`;

const SCRAP_SELECT = `
    SELECT
        fgs.Serial AS ComponentSerial,
        fgs.PSNo AS PSNo,
        fgs.Remark AS Remark,
        fgs.UserID AS UserID,
        u.UserName AS UserName,
        fgs.ScrapDate AS ScrapDate,
        fgs.LastStation AS LastStation,

        mb.Serial AS CabinetSerial,
        mb.DocNo AS DocNo,
        mb.Material AS Material,
        mb.Department AS Department,

        m.MatCode AS MatCode,
        m.Name AS MaterialName,
        m.Route AS Route,

        pl.LineCode AS LineCode,
        pl.Name AS ProductionLineName

    ${BASE_FROM}
`;

const GROUPED_SCRAP_CTE = `
    WITH BaseRows AS (
        ${SCRAP_SELECT}
    ),

    CabinetGroups AS (
        SELECT
            PSNo,
            DocNo,
            CabinetSerial,

            MAX(Remark) AS Remark,
            MAX(UserID) AS UserID,
            MAX(UserName) AS UserName,
            MIN(ScrapDate) AS ScrapDate,
            MAX(LastStation) AS LastStation,
            MAX(LineCode) AS LineCode,
            MAX(ProductionLineName) AS ProductionLineName,

            COUNT(
                DISTINCT CASE
                    WHEN ComponentSerial <> CabinetSerial
                    THEN ComponentSerial
                END
            ) AS ComponentCount

        FROM BaseRows

        GROUP BY
            PSNo,
            DocNo,
            CabinetSerial
    )
`;

/* -------------------------------------------------------------------------- */
/* SQL request helpers                                                        */
/* -------------------------------------------------------------------------- */

const buildRequest = (pool, params) => {
  const request = pool.request();

  request.input("startDate", sql.Date, params.startDate);

  request.input("endDateExclusive", sql.Date, params.endDateExclusive);

  return request;
};

const parseGroupedRows = (rows = []) => {
  return rows.map((row) => {
    let components = [];

    if (row.ComponentsJson) {
      try {
        components = JSON.parse(row.ComponentsJson);
      } catch (error) {
        throw new AppError("Unable to parse component details.", 500);
      }
    }

    const { ComponentsJson, ...cabinet } = row;

    return {
      ...cabinet,
      components,
    };
  });
};

/* -------------------------------------------------------------------------- */
/* GET /scrap/scrap-details                                                   */
/* Cabinet-wise paginated scrap details                                      */
/* -------------------------------------------------------------------------- */

export const getScrapDetails = tryCatch(async (req, res) => {
  const params = extractParams(req.query);
  const pool = await getPool();

  // Count distinct cabinet groups, not component records.
  const countRequest = buildRequest(pool, params);

  const countResult = await countRequest.query(`
        ${GROUPED_SCRAP_CTE}

        SELECT COUNT(*) AS totalCabinets
        FROM CabinetGroups;
    `);

  const totalCabinets = countResult.recordset[0]?.totalCabinets ?? 0;

  // Fetch one row per cabinet, including nested component details.
  const dataRequest = buildRequest(pool, params);

  dataRequest.input("offset", sql.Int, params.offset);
  dataRequest.input("limit", sql.Int, params.limit);

  const dataResult = await dataRequest.query(`
        ${GROUPED_SCRAP_CTE}

        SELECT
            g.PSNo,
            g.DocNo,
            g.CabinetSerial,
            g.Remark,
            g.UserID,
            g.UserName,
            g.ScrapDate,
            g.LastStation,
            g.LineCode,
            g.ProductionLineName,
            g.ComponentCount,

            (
                SELECT DISTINCT
                    c.ComponentSerial AS ComponentSerial,
                    c.Material AS Material,
                    c.Department AS Department,
                    c.MatCode AS MatCode,
                    c.MaterialName AS MaterialName,
                    c.Route AS Route,
                    c.LineCode AS LineCode,
                    c.ProductionLineName AS ProductionLineName,
                    c.ScrapDate AS ScrapDate,
                    c.LastStation AS LastStation

                FROM BaseRows AS c

                WHERE c.PSNo = g.PSNo
                  AND c.DocNo = g.DocNo
                  AND c.CabinetSerial = g.CabinetSerial
                  AND c.ComponentSerial <> c.CabinetSerial

                ORDER BY
                    c.ComponentSerial,
                    c.MatCode,
                    c.MaterialName,
                    c.Department,
                    c.Route,
                    c.LineCode,
                    c.ProductionLineName,
                    c.ScrapDate,
                    c.LastStation

                FOR JSON PATH
            ) AS ComponentsJson

        FROM CabinetGroups AS g

        ORDER BY
            g.ScrapDate DESC,
            g.CabinetSerial ASC

        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY;
    `);

  const data = parseGroupedRows(dataResult.recordset);

  res.status(200).json({
    success: true,
    message: "Scrap details fetched successfully.",
    data,
    meta: {
      page: params.page,
      limit: params.limit,
      count: totalCabinets,
      total: totalCabinets,
      totalPages: Math.ceil(totalCabinets / params.limit),
    },
  });
});

/* -------------------------------------------------------------------------- */
/* GET /scrap/export-scrap-details                                            */
/* All matching cabinets and their components                                */
/* -------------------------------------------------------------------------- */

export const getScrapDetailsExportData = tryCatch(async (req, res) => {
  const params = extractParams(req.query);
  const pool = await getPool();

  const countRequest = buildRequest(pool, params);

  const countResult = await countRequest.query(`
        ${GROUPED_SCRAP_CTE}

        SELECT COUNT(*) AS totalCabinets
        FROM CabinetGroups;
    `);

  const totalCabinets = countResult.recordset[0]?.totalCabinets ?? 0;

  const dataRequest = buildRequest(pool, params);

  const dataResult = await dataRequest.query(`
        ${GROUPED_SCRAP_CTE}

        SELECT
            g.PSNo,
            g.DocNo,
            g.CabinetSerial,
            g.Remark,
            g.UserID,
            g.UserName,
            g.ScrapDate,
            g.LastStation,
            g.LineCode,
            g.ProductionLineName,
            g.ComponentCount,

            (
                SELECT DISTINCT
                    c.ComponentSerial AS ComponentSerial,
                    c.Material AS Material,
                    c.Department AS Department,
                    c.MatCode AS MatCode,
                    c.MaterialName AS MaterialName,
                    c.Route AS Route,
                    c.LineCode AS LineCode,
                    c.ProductionLineName AS ProductionLineName,
                    c.ScrapDate AS ScrapDate,
                    c.LastStation AS LastStation

                FROM BaseRows AS c

                WHERE c.PSNo = g.PSNo
                  AND c.DocNo = g.DocNo
                  AND c.CabinetSerial = g.CabinetSerial
                  AND c.ComponentSerial <> c.CabinetSerial

                ORDER BY
                    c.ComponentSerial,
                    c.MatCode,
                    c.MaterialName,
                    c.Department,
                    c.Route,
                    c.LineCode,
                    c.ProductionLineName,
                    c.ScrapDate,
                    c.LastStation

                FOR JSON PATH
            ) AS ComponentsJson

        FROM CabinetGroups AS g

        ORDER BY
            g.ScrapDate DESC,
            g.CabinetSerial ASC;
    `);

  const data = parseGroupedRows(dataResult.recordset);

  res.status(200).json({
    success: true,
    message: "Scrap details export data fetched successfully.",
    data,
    meta: {
      count: totalCabinets,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* GET /scrap/scrap-details-summary                                           */
/* Scrap summary for the selected date range                                  */
/* -------------------------------------------------------------------------- */

export const getScrapDetailsSummary = tryCatch(async (req, res) => {
  const params = extractParams(req.query);
  const pool = await getPool();

  const request = buildRequest(pool, params);

  const result = await request.query(`
        ${GROUPED_SCRAP_CTE},

        Summary AS (
            SELECT
                COUNT(*) AS TotalCabinets,

                COALESCE(
                    SUM(ComponentCount),
                    0
                ) AS TotalComponents

            FROM CabinetGroups
        ),

        RawSummary AS (
            SELECT
                COUNT(DISTINCT ComponentSerial) AS UniqueBarcodes,

                COUNT(DISTINCT MatCode) AS MaterialCount,

                COUNT(DISTINCT UserID) AS UserCount,

                COUNT(
                    DISTINCT CONVERT(date, ScrapDate)
                ) AS ScrapDays

            FROM BaseRows
        )

        SELECT
            s.TotalCabinets,
            s.TotalComponents,
            r.UniqueBarcodes,
            r.MaterialCount,
            r.UserCount,
            r.ScrapDays,

            CAST(
                CASE
                    WHEN r.ScrapDays > 0
                    THEN
                        1.0 * s.TotalCabinets / r.ScrapDays
                    ELSE 0
                END
                AS DECIMAL(18, 2)
            ) AS AverageScrapPerDay

        FROM Summary AS s
        CROSS JOIN RawSummary AS r;
    `);

  const summary = result.recordset[0] ?? {};

  res.status(200).json({
    success: true,
    message: "Scrap details summary fetched successfully.",

    data: {
      // Kept for compatibility with the existing frontend.
      totalScrapRecords: summary.TotalCabinets ?? 0,

      totalCabinets: summary.TotalCabinets ?? 0,
      totalComponents: summary.TotalComponents ?? 0,

      uniqueBarcodes: summary.UniqueBarcodes ?? 0,
      materialCount: summary.MaterialCount ?? 0,
      userCount: summary.UserCount ?? 0,
      scrapDays: summary.ScrapDays ?? 0,

      averageScrapPerDay: summary.AverageScrapPerDay ?? 0,

      dateRange: {
        from: params.startDate,
        to: params.endDate,
      },
    },
  });
});
