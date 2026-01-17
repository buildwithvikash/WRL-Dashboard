import nodemailer from "nodemailer";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
dotenv.config();

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT), // ensure number
  secure: process.env.SMTP_PORT === "465", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // optional, only if needed
  },
});

// -------------------- Visitor Pass Email --------------------
export const sendVisitorPassEmail = async ({
  to,
  cc,
  photoPath,
  visitorName,
  visitorContact,
  visitorEmail,
  company,
  city,
  visitorId,
  allowOn,
  allowTill,
  departmentToVisit,
  employeeToVisit,
  purposeOfVisit,
}) => {
  try {
    if (!to) {
      console.warn("No recipient email provided");
      return false;
    }

    const currentYear = new Date().getFullYear();

    const mailOptions = {
      from: {
        name: "WRL Security Team",
        address: "security.tadgam@westernequipments.com",
      },
      to,
      cc,
      subject: `Visitor Pass Generated for ${visitorName}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Visitor Pass Notification</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f0f0f0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f0f0; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: #2575fc; color: #fff; padding: 20px; text-align: center;">
                      <h2 style="margin: 0">Visitor Pass Notification</h2>
                    </td>
                  </tr>

                  <!-- Image & Info -->
                  <tr>
                    <td style="padding: 20px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <!-- Left: Image -->
                          <td width="50%" align="center" valign="middle" style="padding-right: 10px;">
                            <div style="width: 150px; height: 150px; border-radius: 50%; overflow: hidden; display: inline-block;">
                              <img
                                src="${photoPath}"
                                alt="Visitor Image"
                                width="150"
                                height="150"
                                style="display: block; object-fit: cover;"
                              />
                            </div>
                          </td>

                          <!-- Right: Details -->
                          <td width="50%" valign="top" style="font-size: 14px; color: #333;">
                            <p><strong>Name:</strong> ${visitorName}</p>
                            <p><strong>Contact:</strong> ${visitorContact}</p>
                            <p><strong>Email:</strong> ${visitorEmail}</p>
                            <p><strong>Company:</strong> ${company}</p>
                            <p><strong>City:</strong> ${city || "N/A"}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Additional Details -->
                  <tr>
                    <td style="background-color: #f4f4f4; padding: 20px; font-size: 14px; color: #555;">
                      <table width="100%" cellpadding="5" cellspacing="0" border="0">
                        <tr>
                          <td width="50%" style="vertical-align: top;">
                            <p><strong>Visitor ID:</strong> ${visitorId}</p>
                            <p><strong>Allow On:</strong> ${new Date(
                              allowOn
                            ).toLocaleString()}</p>
                            <p><strong>Department to Visit:</strong> ${departmentToVisit}</p>
                          </td>
                          <td width="50%" style="vertical-align: top;">
                          <p><strong>Purpose of Visit:</strong> ${purposeOfVisit}</p>
                            <p><strong>Allow Till:</strong> ${
                              allowTill
                                ? new Date(allowTill).toLocaleString()
                                : "N/A"
                            }</p>
                             <p><strong>Employee to Visit:</strong> ${employeeToVisit}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9f9f9; text-align: center; padding: 10px; font-size: 12px; color: #666;">
                      © ${currentYear} WRL Tool Report — This is an automated message.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `Visitor pass email sent to ${to} (cc: ${cc || "none"}) — Message ID: ${
        info.messageId
      }`
    );
    return true;
  } catch (error) {
    console.error("Failed to send visitor pass email:", error);
    return false;
  }
};

// -------------------- Visitor Report Email --------------------
export const sendVisitorReportEmail = async (visitors) => {
  try {
    if (!Array.isArray(visitors) || visitors.length === 0) {
      console.warn("No visitor data to email.");
      return false;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Visitor Report");

    worksheet.columns = [
      { header: "Sr.", key: "sr", width: 6 },
      { header: "Name", key: "visitor_name", width: 25 },
      { header: "Contact", key: "contact_no", width: 15 },
      { header: "Email", key: "email", width: 25 },
      { header: "Company", key: "company", width: 20 },
      { header: "City", key: "city", width: 15 },
      { header: "State", key: "state", width: 15 },
      { header: "Department", key: "department_name", width: 15 },
      { header: "Employee", key: "employee_name", width: 20 },
      { header: "Purpose", key: "purpose_of_visit", width: 25 },
      { header: "Check In", key: "check_in_time", width: 22 },
      { header: "Check Out", key: "check_out_time", width: 22 },
    ];

    visitors.forEach((v, i) => {
      worksheet.addRow({
        sr: i + 1,
        visitor_name: v.visitor_name,
        contact_no: v.contact_no,
        email: v.email,
        company: v.company,
        city: v.city,
        state: v.state,
        department_name: v.department_name,
        employee_name: v.employee_name,
        purpose_of_visit: v.purpose_of_visit,
        check_in_time: v.check_in_time
          ? new Date(v.check_in_time).toLocaleString()
          : "-",
        check_out_time: v.check_out_time
          ? new Date(v.check_out_time).toLocaleString()
          : "Currently In",
      });
    });

    // Style header row
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
    });

    // ? Write file to buffer (no temp file needed)
    const buffer = await workbook.xlsx.writeBuffer();

    const mailOptions = {
      from: {
        name: "WRL Visitor Reports",
        address: "security.tadgam@westernequipments.com",
      },
      to: "vikash.kumar@westernequipments.com",
      subject: "Visitor Report - Excel Summary",
      text: "Please find attached the latest visitor report (Excel format) for your reference.\n\nRegards,\nWRL Security Department",
      attachments: [
        {
          filename: `visitor-report-${
            new Date().toISOString().split("T")[0]
          }.xlsx`,
          content: buffer,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Visitor report email with Excel sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending visitor report email:", error);
    return false;
  }
};

// -------------------- Gate Entry Alert Email --------------------
export const sendGateEntryAlertEmail = async (gateEntries) => {
  try {
    if (!Array.isArray(gateEntries) || gateEntries.length === 0) {
      console.warn("No Gate Entry data to email.");
      return false;
    }

    const headers = [
      "GATE ENTRY NUMBER",
      "GATE ENTRY DATE",
      "PO NUMBER",
      "LINE ITEM",
      "PO DATE",
      "INVOICE VALUE",
      "BASIC RATE",
      "HSN CODE AS PER INVOICE",
      "GRN:103",
      "GRN:101 /105",
      "SUPPLIER CODE",
      "SUPPLIER NAME",
      "INVOICE NO.",
      "INVOICE DATE",
      "ITEM CODE",
      "DESCRIPTION OF THE GOODS",
      "UOM",
      "INVOICE QTY.",
      "RECEIVED QTY.",
      "DISCREPANCY",
      "MATERIAL GROUP",
      "VEHICLE NO.",
      "DELIVERY TYPE",
      "VEHICLE NAME",
      "VEHICLE TYPE",
      "FUEL TYPE",
      "TOTAL CARRYING CAPACITY OF THE VEHICLE",
      "REMARKS",
    ];

    const tableRows = gateEntries
      .map(
        (entry) => `
      <tr>${headers.map((h, i) => `<td>${entry[i] || ""}</td>`).join("")}</tr>
    `
      )
      .join("");

    const html = `
      <html>
      <head>
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 5px; }
          th { background-color: #2575fc; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>Gate Entry Report</h2>
        <table>
          <thead><tr>${headers
            .map((h) => `<th>${h}</th>`)
            .join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p>Regards,<br/>WRL Security Team</p>
      </body>
      </html>
    `;

    const mailOptions = {
      from: { name: "WRL Inward Alert", address: process.env.SMTP_USER },
      to: "vikash.kumar@westernequipments.com", //sujith.s@westernequipments.com
      cc: [
        "rahul.bagul@westernequipments.com",
        "shubhanshu.dixit@westernequipments.com",
        "shubham.singh@westernequipments.com",
        "ashutosh.jena@westernequipments.com",
        "jenish.gandhi@westernequipments.com",
        "mayank.garg@westernequipments.com",
        "devesh.gaur@westernequipments.com",
        "vinay.yadav@westernequipments.com",
        "rushikesh.naik@westernequipments.com",
        "harshal.prajapati@westernequipments.com",
        "vaikunth.surve@westernequipments.com",
      ],
      subject: "Gate Entry Report",
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Gate Entry report email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending Gate Entry email:", error);
    return false;
  }
};

// -------------------- Calibration Alert Email --------------------
export function sendMail(to, asset, subject, reportLink = "#") {
  if (!to) return;

  const status =
    asset.Status == "Valid"
      ? "Calibrated"
      : asset.Status == "Expired"
      ? "Expired ❌"
      : "Due Soon ⚠";

  const html = `
    <div style="font-family:Arial;padding:15px">
    <h2 style="color:#1a73e8">${subject}</h2>

    <table border="1" cellspacing="0" cellpadding="7" 
        style="border-collapse:collapse;width:100%;font-size:14px;margin-top:10px">

    <tr style="background:#cfe2ff;font-weight:bold;text-align:center">
        <td>Equipment</td>
        <td>ID No</td>
        <td>Least Count</td>
        <td>Range</td>
        <td>Location</td>
        <td>Last Calibrated</td>
        <td>Next Calibration</td>
        <td>Status</td>
        <td>Escalation</td>
        <td>Calibration Report</td>
        <td>Remarks</td>
    </tr>

    <tr style="text-align:center">
        <td>${asset.EquipmentName}</td>
        <td>${asset.IdentificationNo}</td>
        <td>${asset.LeastCount}</td>
        <td>${asset.RangeValue}</td>
        <td>${asset.Location}</td>

        <td>${asset.LastCalibrationDate ?? "-"}</td>
        <td>${asset.ValidTill ?? "-"}</td>

        <td><b>${status}</b></td>

        <td>${asset.EscalationLevel ?? "Not Escalated"}</td>

        <td>
        <a href="${reportLink}" 
           style="color:#007bff;text-decoration:underline" 
           target="_blank">View Report</a>
        </td>

        <td>${asset.Remarks ?? "-"}</td>
    </tr>
    </table>

    <p style="margin-top:10px;color:#e62e2e;font-weight:bold">
    ⚠ Kindly take required action to avoid calibration expiry.</p>

    </div>
    `;

  transporter.sendMail(
    { from: `Calibration System <${process.env.MAIL_ID}>`, to, subject, html },
    (err) =>
      err
        ? console.log("Mail Send Error:", err)
        : console.log("📩 Mail sent to", to)
  );
}

// -------------------- Training Assigned Email --------------------
export const sendTrainingAssignedEmail = async ({
  to,
  trainerName,
  trainingTitle,
  trainingType,
  mode,
  startDateTime,
  endDateTime,
  location,
}) => {
  try {
    if (!to) {
      console.warn("No trainer email provided");
      return false;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Training Assignment</title>
</head>
<body style="margin:0; padding:20px; background:#f4f6f8; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">

        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#ffffff; border-radius:10px; overflow:hidden;
                 box-shadow:0 4px 12px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background:#1e40af; padding:20px 26px; color:#ffffff;">
              <h2 style="margin:0; font-size:22px; font-weight:600;">
                📘 Training Assignment Notification
              </h2>
              <p style="margin:6px 0 0; font-size:13px; opacity:0.9;">
                Trainer Assignment Details
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:26px; color:#374151; font-size:14px; line-height:1.7;">

              <p style="margin-top:0;">
                Dear <b>${trainerName}</b>,
              </p>

              <p>
                You have been officially assigned as a <b>Trainer</b> for the
                following training program. Please find the details below:
              </p>

              <!-- DETAILS TABLE -->
              <table width="100%" cellpadding="10" cellspacing="0"
                style="border-collapse:collapse; margin-top:18px; font-size:13px;">
                
                <tr style="background:#f8fafc;">
                  <td width="38%" style="border:1px solid #e5e7eb; font-weight:600;">
                    Training Title
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${trainingTitle}
                  </td>
                </tr>

                <tr>
                  <td style="border:1px solid #e5e7eb; font-weight:600;">
                    Training Type
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${trainingType}
                  </td>
                </tr>

                <tr style="background:#f8fafc;">
                  <td style="border:1px solid #e5e7eb; font-weight:600;">
                    Mode
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${mode}
                  </td>
                </tr>

                <tr>
                  <td style="border:1px solid #e5e7eb; font-weight:600;">
                    Schedule
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${new Date(startDateTime)}
                    <br/>
                    <span style="color:#6b7280;">to</span>
                    <br/>
                    ${new Date(endDateTime)}
                  </td>
                </tr>

                <tr style="background:#f8fafc;">
                  <td style="border:1px solid #e5e7eb; font-weight:600;">
                    Location
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${location || "Online"}
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <div
                style="margin-top:22px; padding:16px;
                       background:#eef2ff;
                       border-left:5px solid #1e40af;
                       border-radius:4px;"
              >
                <p style="margin:0 0 8px; font-weight:600;">
                  🔗 Training Portal Access
                </p>
                <p style="margin:0 0 6px; font-size:13px;">
                  Please log in to the Training Portal for complete details,
                  materials, and attendance tracking.
                </p>
                <a
                  href="http://10.100.95.161:3000"
                  target="_blank"
                  style="color:#1e40af; font-weight:600; text-decoration:none;"
                >
                  http://10.100.95.161:3000
                </a>
              </div>

              <!-- SIGNATURE -->
              <p style="margin-top:26px;">
                Regards,<br/>
                <b>WRL HR Team</b>
              </p>

              <!-- AUTO MAIL NOTE -->
              <p style="margin-top:20px; font-size:12px; color:#6b7280;">
                ⚠️ This is an <b>automated system-generated email</b>.
                Please do not reply to this message.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td
              style="background:#f9fafb;
                     text-align:center;
                     padding:14px;
                     font-size:12px;
                     color:#6b7280;"
            >
              © ${new Date().getFullYear()} Western Refrigeration.
              All rights reserved.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;

    await transporter.sendMail({
      from: {
        name: "WRL Training System",
        address: process.env.SMTP_USER,
      },
      to,
      subject: "New Training Assigned",
      html,
    });

    console.log("📩 Training mail sent to:", to);
    return true;
  } catch (error) {
    console.error("Training mail error:", error);
    return false;
  }
};

// -------------------- Training Nomination Email (Employees) --------------------
export const sendTrainingNominationEmail = async ({
  to,
  employeeName,
  trainingTitle,
  trainingType,
  mode,
  startDateTime,
  endDateTime,
  location,
  attachments = [],
}) => {
  if (!to) return false;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Training Scheduled</title>
</head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">

        <table width="620" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:10px;
                 box-shadow:0 6px 18px rgba(0,0,0,0.08);
                 overflow:hidden;">

          <!-- HEADER -->
          <tr>
            <td style="background:#0f766e;padding:20px 24px;color:#ffffff;">
              <h2 style="margin:0;font-size:22px;font-weight:600;">
                Training Scheduled
              </h2>
              <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">
                Training Notification
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:26px;color:#374151;font-size:14px;line-height:1.7;">

              <p style="margin-top:0;">
                Dear <b>${employeeName}</b>,
              </p>

              <p>
                We are pleased to inform you that your training has been
                <b>successfully scheduled</b>. Please find the details below:
              </p>

              <!-- DETAILS TABLE -->
              <table width="100%" cellpadding="10" cellspacing="0"
                style="border-collapse:collapse;margin-top:18px;font-size:13px;">
                
                <tr style="background:#f0fdfa;">
                  <td width="35%" style="border:1px solid #e5e7eb;font-weight:600;">
                    Training Title
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${trainingTitle}
                  </td>
                </tr>

                <tr>
                  <td style="border:1px solid #e5e7eb;font-weight:600;">
                    Training Type
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${trainingType}
                  </td>
                </tr>

                <tr style="background:#f0fdfa;">
                  <td style="border:1px solid #e5e7eb;font-weight:600;">
                    Mode
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${mode}
                  </td>
                </tr>

                <tr>
                  <td style="border:1px solid #e5e7eb;font-weight:600;">
                    Schedule
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${new Date(startDateTime)}
                    <br/>
                    <span style="color:#6b7280;">to</span>
                    <br/>
                    ${new Date(endDateTime)}
                  </td>
                </tr>

                <tr style="background:#f0fdfa;">
                  <td style="border:1px solid #e5e7eb;font-weight:600;">
                    Location
                  </td>
                  <td style="border:1px solid #e5e7eb;">
                    ${location || "Online"}
                  </td>
                </tr>
              </table>

              <!-- PORTAL CTA -->
              <div
                style="margin-top:22px;padding:16px;
                       background:#ecfeff;
                       border-left:5px solid #0f766e;
                       border-radius:4px;"
              >
                <p style="margin:0 0 8px;font-weight:600;">
                  Training Portal Access
                </p>
                <p style="margin:0 0 6px;font-size:13px;">
                  Please log in to the Training Portal for training materials,
                  attendance, and further updates.
                </p>
                <a
                  href="http://10.100.95.161:3000"
                  target="_blank"
                  style="color:#0f766e;font-weight:600;text-decoration:none;"
                >
                  http://10.100.95.161:3000
                </a>
              </div>

              <!-- FOOT NOTE -->
              <p style="margin-top:22px;font-size:12px;color:#6b7280;">
                This is an <b>automated system-generated email</b>.
                Please do not reply to this message.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td
              style="background:#f9fafb;text-align:center;
                     padding:14px;font-size:12px;color:#6b7280;"
            >
              © ${new Date().getFullYear()} Western Refrigeration.
              All rights reserved.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;

  await transporter.sendMail({
    from: {
      name: "WRL Training System",
      address: process.env.SMTP_USER,
    },
    to,
    subject: "Training Nomination Notification",
    html,
    attachments,
  });

  return true;
};

// -------------------- Training Nomination Email (HOD) --------------------
// export const sendTrainingNominationHODEmail = async ({
//   to,
//   hodName,
//   departmentName,
//   trainingTitle,
//   startDateTime,
//   endDateTime,
//   employees, // [{ EmployeeId, EmployeeName }]
// }) => {
//   if (!to) return false;

//   const employeeRows = employees
//     .map(
//       (e) => `
//       <tr>
//         <td style="border:1px solid #e5e7eb;padding:6px;">${e.EmployeeId}</td>
//         <td style="border:1px solid #e5e7eb;padding:6px;">${e.EmployeeName}</td>
//       </tr>`
//     )
//     .join("");

//   const html = `
//   <!DOCTYPE html>
//   <html>
//   <body style="font-family:Arial;background:#f4f6f8;padding:20px;">
//     <table width="100%" cellpadding="0" cellspacing="0">
//       <tr>
//         <td align="center">
//           <table width="650" style="background:#fff;border-radius:8px;padding:24px;">
//             <tr>
//               <td style="background:#7c2d12;color:#fff;padding:16px;border-radius:8px 8px 0 0;">
//                 <h2 style="margin:0;">📋 Department Training Notification</h2>
//               </td>
//             </tr>

//             <tr>
//               <td style="padding:20px;color:#374151;">
//                 <p>Dear <b>${hodName}</b>,</p>

//                 <p>
//                   The following employees from <b>${departmentName}</b> have been
//                   nominated for the training <b>${trainingTitle}</b>.
//                 </p>

//                 <p>
//                   <b>Schedule:</b>
//                   ${new Date(startDateTime).toLocaleString()} →
//                   ${new Date(endDateTime).toLocaleString()}
//                 </p>

//                 <table width="100%" cellpadding="6" cellspacing="0"
//                   style="border-collapse:collapse;margin-top:12px;">
//                   <tr style="background:#fef3c7;">
//                     <th style="border:1px solid #e5e7eb;">Employee ID</th>
//                     <th style="border:1px solid #e5e7eb;">Employee Name</th>
//                   </tr>
//                   ${employeeRows}
//                 </table>

//                 <p style="margin-top:20px;">
//                   Regards,<br/><b>WRL HR Team</b>
//                 </p>

//                 <p style="font-size:12px;color:#6b7280;">
//                   ⚠️ This is an automated email. Please do not reply.
//                 </p>
//               </td>
//             </tr>
//           </table>
//         </td>
//       </tr>
//     </table>
//   </body>
//   </html>
//   `;

//   await transporter.sendMail({
//     from: {
//       name: "WRL Training System",
//       address: process.env.SMTP_USER,
//     },
//     to,
//     subject: "Employees Nominated for Training",
//     html,
//   });

//   return true;
// };

// -------------------- Verify SMTP --------------------
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP Connection Error:", error);
  } else {
    console.log("SMTP Server is ready to send emails");
  }
});
