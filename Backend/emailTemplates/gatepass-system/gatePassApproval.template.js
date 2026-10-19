import transporter from "../../config/email.config.js";

// "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DD  |  HH:mm:ss" for easier scanning.
const formatDateTime = (str) => {
  if (!str) return "—";
  const [date, time] = str.split(" ");
  return time ? `${date}&nbsp;&nbsp;|&nbsp;&nbsp;${time}` : date;
};

// Sent to the Dept Head (on request creation) or HR (once Dept Head
// approves) with one-click Approve/Reject links — see gatepass.controller.js
// for how approveUrl/rejectUrl are signed (JWT, short expiry, not the old
// bare-code pattern the deleted Manpower module used).
//
// Built table-based with bgcolor attributes (not just CSS) plus a
// color-scheme meta tag opting out of dark mode entirely — Gmail's/Outlook's
// automatic dark-mode remapping otherwise strips <div> background colors
// while leaving "vivid" ones (the blue header) alone, which made the field
// labels unreadable against a suddenly-black body.
export const sendGatePassApprovalMail = async ({
  to,
  cc,
  approverName,
  stageLabel,
  pass,
  approveUrl,
  rejectUrl,
  trialRecipient, // set only when GATEPASS_TRIAL_EMAIL redirected this send
}) => {
  try {
    const FONT = "Arial, Helvetica, sans-serif";
    const INK = "#1e293b";
    const MUTED = "#64748b";
    const typeBadge = `<span style="display:inline-block;background-color:#dbeafe;color:#1d4ed8;font-family:${FONT};font-weight:bold;font-size:12px;padding:3px 12px;border-radius:12px;">${pass.type}</span>`;

    const fields = [
      ["Employee", `<strong>${pass.empName}</strong> (${pass.empCode})`],
      ["Department", pass.deptName || "—"],
      ["Pass Type", typeBadge],
      ["Place of Visit", pass.placeOfVisit || "—"],
      ["Reason", pass.reason || "—"],
      ["Out Date &amp; Time", formatDateTime(pass.outDateTime)],
      ...(pass.expectedInDateTime ? [["Expected Return", formatDateTime(pass.expectedInDateTime)]] : []),
      ["Returning?", pass.comingBack],
    ];

    const fieldRows = fields.map(([label, value], i) => {
      const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      const isLast = i === fields.length - 1;
      return `
      <tr>
        <td width="160" valign="top" bgcolor="${bg}" style="background-color:${bg};padding:12px 16px;font-family:${FONT};font-size:13px;font-weight:bold;color:${MUTED};${isLast ? "" : "border-bottom:1px solid #eef2f7;"}">
          ${label}
        </td>
        <td valign="top" bgcolor="${bg}" style="background-color:${bg};padding:12px 16px;font-family:${FONT};font-size:14px;color:${INK};${isLast ? "" : "border-bottom:1px solid #eef2f7;"}">
          ${value}
        </td>
      </tr>`;
    }).join("");

    const trialBannerRow = trialRecipient ? `
      <tr>
        <td bgcolor="#fef3c7" style="background-color:#fef3c7;border-bottom:1px solid #fde68a;padding:12px 24px;">
          <p style="margin:0;font-family:${FONT};font-size:12px;color:#92400e;">
            <strong>⚠ TRIAL MODE:</strong> Redirected email. Intended recipient:
            <a href="mailto:${trialRecipient}" style="color:#92400e;text-decoration:underline;">${trialRecipient}</a>
          </p>
        </td>
      </tr>` : "";

    const mailOptions = {
      from: { name: "WRL Gate Pass System", address: process.env.SMTP_USER },
      to,
      ...(cc?.length ? { cc } : {}),
      subject: `${trialRecipient ? "[TRIAL] " : ""}Gate Pass Approval Needed — ${pass.empName} (${pass.empCode})`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Gate Pass Approval</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f6;" bgcolor="#eef1f6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f6" style="background-color:#eef1f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"
          style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">

          <!-- Header -->
          <tr>
            <td align="center" bgcolor="#1d4ed8" style="background-color:#1d4ed8;padding:28px 20px;">
              <div style="font-family:${FONT};font-size:20px;font-weight:bold;color:#ffffff;">Western Refrigeration Pvt. Ltd.</div>
              <div style="font-family:${FONT};font-size:13px;color:#dbeafe;margin-top:6px;">Gate Pass Approval Request</div>
            </td>
          </tr>

          ${trialBannerRow}

          <!-- Greeting -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding:26px 24px 18px;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:16px;color:${INK};">
                Hi <strong>${approverName || ""}</strong>,
              </p>
              <p style="margin:0;font-family:${FONT};font-size:14px;color:${MUTED};">
                An out-pass request requires your review and approval${stageLabel ? ` as ${stageLabel}` : ""}.
              </p>
            </td>
          </tr>

          <!-- Details card -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                ${fieldRows}
              </table>
            </td>
          </tr>

          <!-- Buttons -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 24px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#16a34a" style="background-color:#16a34a;border-radius:8px;">
                    <a href="${approveUrl}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">✓ Approve Request</a>
                  </td>
                  <td width="14" style="font-size:0;line-height:0;">&nbsp;</td>
                  <td bgcolor="#dc2626" style="background-color:#dc2626;border-radius:8px;">
                    <a href="${rejectUrl}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">✕ Reject Request</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:18px 24px 24px;">
              <p style="margin:0;font-family:${FONT};font-size:11px;color:${MUTED};text-align:center;">
                This link is valid for 5 days and can only be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="#f8fafc" style="background-color:#f8fafc;padding:16px;border-top:1px solid #eef2f7;">
              <p style="margin:0;font-family:${FONT};font-size:11px;color:${MUTED};">
                © ${new Date().getFullYear()} MES Team | Western Refrigeration Pvt. Ltd.
              </p>
              <p style="margin:4px 0 0;font-family:${FONT};font-size:10px;color:#94a3b8;">
                This is a system-generated email. Please do not reply directly.
              </p>
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

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("[GatePass] Approval mail error:", error.message);
    return false;
  }
};
