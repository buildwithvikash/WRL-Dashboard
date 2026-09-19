import sql from "mssql";
import { AppError } from "./AppError.js";

const MAX_ATTEMPTS = 2000;

// Next Users.UserCode — "<Series><yy><zero-padded SLNo>" (e.g. 1 + 26 + 001 =
// 126001), driven by IDMaster/IDValue exactly as signup always did. Takes a
// request factory so callers can run it against a pool (signup) or inside a
// transaction (admin create-user, where the UPDLOCK keeps two concurrent
// creates from being handed the same number). Skips over any code that's
// already taken in Users, since the ERP that shares this table also mints codes.
export const generateUserCode = async (newRequest) => {
  const idMasterRes = await newRequest().query(`
    SELECT Series, NoOfDigit FROM IDMaster WHERE IDTable = 'USERS'
  `);
  if (idMasterRes.recordset.length === 0) {
    throw new AppError("IDMaster config missing", 500);
  }

  // IDValue.SLNo is a BIGINT, which the driver hands back as a string — without
  // Number() below, `SLNo + 1` concatenates ("22" + 1 = "221").
  let Series = Number(idMasterRes.recordset[0].Series);
  const NoOfDigit = Number(idMasterRes.recordset[0].NoOfDigit);
  const year = new Date().getFullYear().toString().slice(-2);
  const maxLimit = Math.pow(10, NoOfDigit) - 1;

  const idValueRes = await newRequest()
    .input("year", sql.VarChar, year)
    .query(`
      SELECT SLNo FROM IDValue WITH (UPDLOCK, HOLDLOCK)
      WHERE IDTable = 'USERS' AND Year = @year
    `);

  let slno = idValueRes.recordset.length > 0 ? Number(idValueRes.recordset[0].SLNo) + 1 : 1;
  let seriesChanged = false;
  let userCode = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && userCode === null; attempt++) {
    if (slno > maxLimit) {
      Series += 1;
      seriesChanged = true;
      slno = 1;
    }
    const candidate = `${Series}${year}${String(slno).padStart(NoOfDigit, "0")}`;
    const taken = await newRequest()
      .input("code", sql.Int, Number(candidate))
      .query(`SELECT 1 FROM Users WHERE UserCode = @code`);
    if (taken.recordset.length === 0) userCode = candidate;
    else slno += 1;
  }

  if (userCode === null) throw new AppError("Could not allocate a free UserCode.", 500);

  if (seriesChanged) {
    await newRequest()
      .input("series", sql.Int, Series)
      .query(`UPDATE IDMaster SET Series = @series WHERE IDTable = 'USERS'`);
  }

  await newRequest()
    .input("year", sql.VarChar, year)
    .input("slno", sql.Int, slno)
    .query(`
      IF EXISTS (SELECT 1 FROM IDValue WHERE IDTable = 'USERS' AND Year = @year)
        UPDATE IDValue SET SLNo = @slno WHERE IDTable = 'USERS' AND Year = @year
      ELSE
        INSERT INTO IDValue (IDTable, Year, SLNo) VALUES ('USERS', @year, @slno)
    `);

  return userCode;
};
