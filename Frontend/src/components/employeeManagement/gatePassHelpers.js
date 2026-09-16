import toast from "react-hot-toast";

// "YYYY-MM-DD HH:mm:ss" (as returned by the API) -> a compact, readable
// local string. Used everywhere a pass timestamp is displayed.
export const formatDateTime = (str) => {
  if (!str) return "—";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const inDateRange = (dateStr, range) => {
  if (range === "all" || !dateStr) return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (range === "today") return isSameDay(d, now);
  if (range === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return isSameDay(d, y);
  }
  if (range === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return d >= from;
  }
  return true;
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Opens a small print-ready slip for one gate pass in a new window — used by
// the Security Gate and Reports pages' "re-print"/"download" actions.
export const printGatePassSlip = (pass) => {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) {
    toast.error("Please allow pop-ups to print the pass.");
    return;
  }
  w.document.write(`
    <html>
      <head>
        <title>Gate Pass — ${esc(pass.empName)}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #1e293b; }
          h1 { font-size: 16px; margin: 0 0 2px; }
          .sub { color: #64748b; font-size: 11px; margin: 0 0 18px; }
          .row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid #eef2f7; font-size: 12.5px; }
          .label { color: #64748b; }
          .value { font-weight: 600; text-align: right; }
        </style>
      </head>
      <body>
        <h1>Western Refrigeration Pvt. Ltd.</h1>
        <p class="sub">Gate Pass Slip · Pass #${esc(pass.id)}</p>
        <div class="row"><span class="label">Employee</span><span class="value">${esc(pass.empName)} (${esc(pass.empCode)})</span></div>
        <div class="row"><span class="label">Department</span><span class="value">${esc(pass.deptName)}</span></div>
        <div class="row"><span class="label">Type</span><span class="value">${esc(pass.type)}</span></div>
        <div class="row"><span class="label">Place of Visit</span><span class="value">${esc(pass.placeOfVisit)}</span></div>
        <div class="row"><span class="label">Reason</span><span class="value">${esc(pass.reason)}</span></div>
        <div class="row"><span class="label">Out Date/Time</span><span class="value">${esc(formatDateTime(pass.outDateTime))}</span></div>
        <div class="row"><span class="label">Expected Return</span><span class="value">${esc(pass.comingBack === "No" ? "Not returning today" : formatDateTime(pass.expectedInDateTime))}</span></div>
        <div class="row"><span class="label">Status</span><span class="value">${esc(pass.status)}</span></div>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
};

// Flat, friendly-column-named row shape shared by every Gate Pass export.
export const toExportRow = (p) => ({
  "Employee Code": p.empCode,
  "Employee Name": p.empName,
  "Department": p.deptName,
  "Contact No": p.contactNo,
  "Place of Visit": p.placeOfVisit,
  "Reason": p.reason,
  "Type": p.type,
  "Coming Back": p.comingBack,
  "Out Date Time": p.outDateTime,
  "Expected In": p.expectedInDateTime,
  "Status": p.status,
  "Dept Head": p.deptHeadName,
  "Dept Head At": p.deptHeadAt,
  "HR": p.hrName,
  "HR At": p.hrAt,
  "Gate Out By": p.securityOutName,
  "Gate Out At": p.gateOutAt,
  "Gate In By": p.securityInName,
  "Gate In At": p.gateInAt,
  "Created At": p.createdAt,
});
