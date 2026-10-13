import sql from "mssql";

export const generateTemplateCode = async () => {
  const pool = global.pool3;

  const result = await pool
    .request()
    .output("Code", sql.VarChar(50))
    .execute("GenerateTemplateCode");
  return result.output.Code;
};

export const generateAuditCode = async (prefix = "AUD") => {
  const pool = global.pool3;

  const result = await pool
    .request()
    .input("Prefix", sql.VarChar(10), prefix)
    .output("Code", sql.VarChar(50))
    .execute("GenerateAuditCode");
  return result.output.Code;
};
