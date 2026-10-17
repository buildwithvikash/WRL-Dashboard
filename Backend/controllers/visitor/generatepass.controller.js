import sql from "mssql";
import { dbConfig3 } from "../../config/db.config.js";
import { tryCatch } from "../../utils/tryCatch.js";
import { AppError } from "../../utils/AppError.js";

// Generate Visitor Pass
export const generateVisitorPass = tryCatch(async (req, res, next) => {
  const {
    name,
    contactNo,
    email,
    company,
    noOfPeople,
    nationality,
    identityType,
    identityNo,
    address,
    country,
    state,
    city,
    vehicleDetails,
    allowOn,
    allowTill,
    departmentTo,
    employeeTo,
    visitType,
    token,
    specialInstruction,
    purposeOfVisit,
    createdBy,
    visitorPhoto,
    companions,
  } = req.body;

  if (!name || !contactNo) {
    throw new AppError("Name and contact number are required", 400);
  }

  const pool = await new sql.ConnectionPool(dbConfig3).connect();

  const existingVisitor = await pool
    .request()
    .input("ContactNo", sql.VarChar(20), contactNo)
    .query(`SELECT visitor_id FROM visitors WHERE contact_no = @ContactNo`);

  let visitorId;

  if (existingVisitor.recordset.length) {
    visitorId = existingVisitor.recordset[0].visitor_id;
  } else {
    const insertVisitor = await pool
      .request()
      .input("VisitorId", sql.VarChar(50), `WRLV${Date.now()}`)
      .input("Name", sql.NVarChar(255), name)
      .input("ContactNo", sql.VarChar(20), contactNo).query(`
        INSERT INTO visitors (visitor_id, name, contact_no)
        OUTPUT inserted.visitor_id
        VALUES (@VisitorId, @Name, @ContactNo)
      `);

    visitorId = insertVisitor.recordset[0].visitor_id;
  }

  if (!visitorId) {
    throw new AppError("Failed to create visitor", 500);
  }

  // Keep the visitor's profile (History/Reports read it from `visitors`) in
  // step with what was captured on this pass; blank fields keep old values.
  // LEFT() matches the narrower `visitors` column widths.
  await pool
    .request()
    .input("VisitorId", sql.VarChar(50), visitorId)
    .input("Name", sql.NVarChar(255), name)
    .input("Photo", sql.Text, visitorPhoto || null)
    .input("Email", sql.VarChar(255), email || null)
    .input("Company", sql.VarChar(255), company || null)
    .input("Nationality", sql.VarChar(100), nationality || null)
    .input("IdentityType", sql.VarChar(50), identityType || null)
    .input("IdentityNo", sql.VarChar(100), identityNo || null)
    .input("Address", sql.Text, address || null)
    .input("Country", sql.VarChar(100), country || null)
    .input("State", sql.VarChar(100), state || null)
    .input("City", sql.VarChar(100), city || null)
    .input("VehicleDetails", sql.VarChar(100), vehicleDetails || null).query(`
      UPDATE visitors SET
        name            = LEFT(@Name, 150),
        photo_url       = COALESCE(@Photo, photo_url),
        email           = COALESCE(@Email, email),
        company         = COALESCE(LEFT(@Company, 100), company),
        nationality     = COALESCE(LEFT(@Nationality, 50), nationality),
        identity_type   = COALESCE(@IdentityType, identity_type),
        identity_no     = COALESCE(@IdentityNo, identity_no),
        address         = COALESCE(@Address, address),
        country         = COALESCE(LEFT(@Country, 50), country),
        state           = COALESCE(LEFT(@State, 50), state),
        city            = COALESCE(LEFT(@City, 50), city),
        vehicle_details = COALESCE(@VehicleDetails, vehicle_details)
      WHERE visitor_id = @VisitorId
    `);

  const passId = `WRLVP${Date.now()}`;

  await pool
    .request()
    .input("PassId", sql.VarChar(50), passId)
    .input("VisitorId", sql.VarChar(50), visitorId)
    .input("VisitorPhoto", sql.Text, visitorPhoto || null)
    .input("VisitorName", sql.VarChar(255), name)
    .input("VisitorContactNo", sql.VarChar(20), contactNo)
    .input("VisitorEmail", sql.VarChar(255), email || null)
    .input("DepartmentTo", sql.VarChar(50), departmentTo || null)
    .input("EmployeeTo", sql.VarChar(50), employeeTo || null)
    .input("VisitType", sql.VarChar(50), visitType || null)
    .input("NoOfPeople", sql.Int, noOfPeople || 1)
    .input("AllowOn", sql.DateTime, allowOn ? new Date(allowOn) : null)
    .input("AllowTill", sql.DateTime, allowTill ? new Date(allowTill) : null)
    .input("SpecialInstructions", sql.Text, specialInstruction || null)
    .input("CreatedBy", sql.VarChar(50), createdBy ? String(createdBy) : null)
    .input("Company", sql.VarChar(255), company || null)
    .input("Nationality", sql.VarChar(100), nationality || null)
    .input("IdentityType", sql.VarChar(50), identityType || null)
    .input("IdentityNo", sql.VarChar(100), identityNo || null)
    .input("Address", sql.Text, address || null)
    .input("Country", sql.VarChar(100), country || null)
    .input("State", sql.VarChar(100), state || null)
    .input("City", sql.VarChar(100), city || null)
    .input("VehicleDetails", sql.VarChar(100), vehicleDetails || null)
    .input("Status", sql.VarChar(10), "1")
    .input("PurposeOfVisit", sql.VarChar(255), purposeOfVisit || null)
    .input("Token", sql.NVarChar(50), token || null).query(`
      INSERT INTO visitor_passes (
        pass_id, visitor_id, visitor_photo, visitor_name, visitor_contact_no,
        visitor_email, department_to_visit, employee_to_visit, visit_type,
        no_of_people, allow_on, allow_till, special_instructions, created_by,
        company, nationality, identity_type, identity_no, address, country,
        state, city, vehicle_details, status, purpose_of_visit, token
      ) VALUES (
        @PassId, @VisitorId, @VisitorPhoto, @VisitorName, @VisitorContactNo,
        @VisitorEmail, @DepartmentTo, @EmployeeTo, @VisitType,
        @NoOfPeople, @AllowOn, @AllowTill, @SpecialInstructions, @CreatedBy,
        @Company, @Nationality, @IdentityType, @IdentityNo, @Address, @Country,
        @State, @City, @VehicleDetails, @Status, @PurposeOfVisit, @Token
      )
    `);

  for (const person of Array.isArray(companions) ? companions : []) {
    if (!person?.name && !person?.photo && !person?.phone) continue;
    await pool
      .request()
      .input("PassId", sql.VarChar(50), passId)
      .input("Name", sql.VarChar(255), person.name || null)
      .input("Phone", sql.VarChar(20), person.phone || null)
      .input("Photo", sql.Text, person.photo || null)
      .query(
        `INSERT INTO VisitorPassCompanions (PassId, Name, Phone, Photo) VALUES (@PassId, @Name, @Phone, @Photo)`,
      );
  }

  await pool.close();

  res.status(201).json({
    success: true,
    message: "Visitor pass generated successfully",
    data: { visitorId, passId },
  });
});

// Fetch Previous Pass
export const fetchPreviousPass = tryCatch(async (req, res, next) => {
  const { contactNo } = req.query;

  if (!contactNo) {
    throw new AppError("Contact number is required", 400);
  }

  const pool = await new sql.ConnectionPool(dbConfig3).connect();
  const result = await pool
    .request()
    .input("ContactNo", sql.VarChar(20), contactNo)
    .query(`SELECT * FROM visitors WHERE contact_no = @ContactNo`);

  await pool.close();

  if (!result.recordset.length) {
    throw new AppError("No previous visitor found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Previous visitor fetched successfully",
    data: result.recordset[0],
  });
});

// Get Visitor Pass Details
export const getVisitorPassDetails = tryCatch(async (req, res, next) => {
  const { passId } = req.params;

  if (!passId) {
    throw new AppError("Pass ID is required", 400);
  }

  const pool = await new sql.ConnectionPool(dbConfig3).connect();

  try {
    const result = await pool.request().input("PassId", sql.VarChar(50), passId)
      .query(`
        SELECT
          vp.pass_id,
          vp.visitor_photo,
          vp.visitor_name,
          vp.visitor_contact_no,
          vp.visitor_email,
          vp.allow_on,
          vp.allow_till,
          vp.special_instructions,
          vp.purpose_of_visit,
          vp.company,
          vp.department_to_visit,
          vp.employee_to_visit,
          d.department_name,
          u.name AS employee_name,
          v.city
        FROM visitor_passes vp
        LEFT JOIN visitors v
          ON v.visitor_id = vp.visitor_id
        LEFT JOIN departments d
          ON vp.department_to_visit = d.deptCode
        LEFT JOIN users u
          ON vp.employee_to_visit = u.employee_id
        WHERE vp.pass_id = @PassId
      `);

    if (!result.recordset.length) {
      throw new AppError("Visitor pass not found", 404);
    }

    const companionsResult = await pool
      .request()
      .input("PassId", sql.VarChar(50), passId).query(`
        SELECT
          Name AS name,
          Phone AS phone,
          Photo AS photo
        FROM VisitorPassCompanions
        WHERE PassId = @PassId
      `);

    const pass = result.recordset[0];

    res.status(200).json({
      success: true,
      message: "Visitor pass details fetched successfully",
      data: {
        ...pass,
        companions: companionsResult.recordset,
      },
    });
  } finally {
    await pool.close();
  }
});
