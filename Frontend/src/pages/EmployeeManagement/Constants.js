export const TYPE_OPTIONS = [
  { value: "Official", label: "Official" },
  { value: "Personal", label: "Personal" },
];

export const COMING_BACK_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

export const STATUS_FILTER_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "Pending Dept Head", label: "Pending Dept Head" },
  { value: "Pending HR", label: "Pending HR" },
  { value: "Approved", label: "Approved" },
  { value: "Out", label: "Out" },
  { value: "Completed", label: "Completed" },
  { value: "Rejected", label: "Rejected" },
];

export const STATUS_STYLES = {
  "Pending Dept Head": "bg-amber-50 text-amber-700 border-amber-200",
  "Pending HR": "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Out: "bg-blue-50 text-blue-700 border-blue-200",
  Completed: "bg-slate-100 text-slate-500 border-slate-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
};

export const EMPTY_FORM = {
  empCode: "",
  empName: "",
  deptName: "",
  contactNo: "",
  placeOfVisit: "",
  reason: "",
  type: "Official",
  comingBack: "Yes",
  outDateTime: "",
  expectedInDateTime: "",
};

// ── Pipeline (Requested → Dept Head → HR → Gate Out → Gate In) ────────────
// The single source of truth for how a pass's lifecycle maps to a visual
// step sequence — used by the StatusPipeline component wherever a pass is
// shown (request list, approval queues, security gate, reports).
export const STAGE_SEQUENCE = [
  { key: "requested", label: "Requested" },
  { key: "depthead", label: "Dept Head" },
  { key: "hr", label: "HR" },
  { key: "gateOut", label: "Gate Out" },
  { key: "gateIn", label: "Gate In" },
];

const STATUS_TO_ACTIVE_INDEX = {
  "Pending Dept Head": 1,
  "Pending HR": 2,
  Approved: 3,
  Out: 4,
};

// Returns which steps are done, which one is currently active (awaiting
// action), and — for a rejected pass — which step it was rejected at, so
// the pipeline can render a clean "progress stopped here" state instead of
// just a generic red badge.
export const getPipelineInfo = (pass) => {
  if (pass.status === "Rejected") {
    // HR only gets a chance to act after Dept Head approved, so hrAt being
    // set means the rejection happened at the HR step, not Dept Head's.
    const rejectedIndex = pass.hrAt ? 2 : 1;
    return { completedUpTo: rejectedIndex - 1, activeIndex: null, rejectedIndex };
  }
  if (pass.status === "Completed") {
    return { completedUpTo: 4, activeIndex: null, rejectedIndex: null };
  }
  const activeIndex = STATUS_TO_ACTIVE_INDEX[pass.status] ?? 0;
  return { completedUpTo: activeIndex - 1, activeIndex, rejectedIndex: null };
};
