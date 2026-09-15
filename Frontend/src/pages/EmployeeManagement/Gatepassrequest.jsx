import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Search } from "lucide-react";
import { baseURL } from "../../assets/assets.js";
import SelectField from "../../components/ui/SelectField.jsx";
import DateTimePicker from "../../components/ui/DateTimePicker.jsx";
import Loader from "../../components/ui/Loader.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx"
import { Spinner, StatusBadge, EmptyState } from "../../components/employeeManagement/Gatepassui.jsx"
import { TYPE_OPTIONS, COMING_BACK_OPTIONS, EMPTY_FORM } from "./Constants.js";

const REQUIRED_FIELDS = [
  "empCode",
  "empName",
  "deptName",
  "contactNo",
  "placeOfVisit",
  "reason",
  "outDateTime",
];

// Type-ahead search against the employee badge directory (Backend reads
// pool4/CLMS's Name table) — picking a match auto-fills name + contact so
// the requester only has to remember the employee code.
const EmployeeCodeLookup = ({ value, onSelect, onChange }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`${baseURL}gatepass/search-employee`, { params: { q: query } });
        setSuggestions(res.data?.data || []);
        setOpen(true);
      } catch {
        // Non-fatal — the field stays freely editable either way.
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <input
          className="w-full border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={value}
          onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="e.g. WRLZ0242"
          autoComplete="off"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300">
          {searching ? <Spinner cls="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
        </span>
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="py-1 max-h-56 overflow-auto">
            {suggestions.map((s) => (
              <button
                key={s.empCode}
                type="button"
                onClick={() => { onSelect(s); setOpen(false); }}
                className="w-full flex flex-col items-start px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
              >
                <span className="font-semibold text-slate-800">{s.empName?.trim()}</span>
                <span className="text-slate-400">{s.empCode} · {s.contactNo || "no phone"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const GatePassRequest = () => {
  const { passes, initialLoading, refreshing, fetchPasses, createPass } =
    useGatePasses();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const recentRequests = useMemo(
    () =>
      [...passes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [passes],
  );

  const badges = useMemo(
    () => ({
      "/gatepass/depthead": passes.filter(
        (p) => p.status === "Pending Dept Head",
      ).length,
      "/gatepass/hr-approval": passes.filter((p) => p.status === "Pending HR")
        .length,
      "/gatepass/security": passes.filter(
        (p) => p.status === "Approved" || p.status === "Out",
      ).length,
    }),
    [passes],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const missing = REQUIRED_FIELDS.filter((f) => !form[f]?.trim?.());
    if (missing.length) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    const ok = await createPass(form);
    if (ok) setForm(EMPTY_FORM);
    setSubmitting(false);
  };

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        title="Request Gate Pass"
        subtitle="Submit a new out-pass request for Dept Head and HR approval"
        stats={[
          {
            label: "Pending",
            value:
              badges["/gatepass/depthead"] + badges["/gatepass/hr-approval"],
            tone: "amber",
          },
        ]}
        refreshing={refreshing}
        onRefresh={() => fetchPasses()}
      />

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            New Gate Pass Request
          </p>
          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap gap-3 items-end"
          >
            <div className="min-w-[160px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Employee Code
              </label>
              <EmployeeCodeLookup
                value={form.empCode}
                onChange={(v) => setForm((f) => ({ ...f, empCode: v }))}
                onSelect={(emp) =>
                  setForm((f) => ({
                    ...f,
                    empCode: emp.empCode,
                    empName: emp.empName?.trim() || f.empName,
                    contactNo: emp.contactNo || f.contactNo,
                  }))
                }
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Employee Name
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.empName}
                onChange={handleChange("empName")}
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Department
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.deptName}
                onChange={handleChange("deptName")}
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Contact No.
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.contactNo}
                onChange={handleChange("contactNo")}
              />
            </div>
            <div className="min-w-[190px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Place of Visit
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.placeOfVisit}
                onChange={handleChange("placeOfVisit")}
              />
            </div>
            <div className="min-w-[190px] flex-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Reason
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.reason}
                onChange={handleChange("reason")}
              />
            </div>

            <div className="min-w-[150px] flex-1">
              <SelectField
                label="Pass Type"
                options={TYPE_OPTIONS}
                value={form.type}
                onChange={handleChange("type")}
              />
            </div>
            <div className="min-w-[150px] flex-1">
              <SelectField
                label="Coming Back?"
                options={COMING_BACK_OPTIONS}
                value={form.comingBack}
                onChange={handleChange("comingBack")}
              />
            </div>
            <div className="min-w-[190px] flex-1">
              <DateTimePicker
                label="Out Date & Time"
                name="outDateTime"
                value={form.outDateTime}
                onChange={handleChange("outDateTime")}
              />
            </div>
            <div className="min-w-[190px] flex-1">
              <DateTimePicker
                label="Expected In (optional)"
                name="expectedInDateTime"
                value={form.expectedInDateTime}
                onChange={handleChange("expectedInDateTime")}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                submitting
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200"
              }`}
            >
              {submitting && <Spinner cls="w-4 h-4" />}
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>
        </div>

        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 overflow-auto">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Recent Requests
          </p>
          {recentRequests.length === 0 ? (
            <EmptyState
              title="No passes yet"
              subtitle="Submit a request above to get started."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {recentRequests.map((p) => (
                <div
                  key={p.id}
                  className="border border-slate-100 rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-[180px]">
                    <p className="text-sm font-semibold text-slate-800">
                      {p.empName}{" "}
                      <span className="text-slate-400 font-normal">
                        · {p.empCode}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.deptName} · {p.type} · {p.placeOfVisit}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">{p.outDateTime}</div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GatePassRequest;
