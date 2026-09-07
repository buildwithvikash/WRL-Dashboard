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
