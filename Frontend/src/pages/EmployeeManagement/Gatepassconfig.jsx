import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Settings2, Building2, Mail, Plus, Pencil, Trash2, X, Save,
  RefreshCcw, Search, UserRound, CheckSquare, Square, DownloadCloud,
} from "lucide-react";
import { baseURL } from "../../assets/assets.js";
import Loader from "../../components/ui/Loader.jsx";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx";
import { Spinner, EmptyState } from "../../components/employeeManagement/Gatepassui.jsx";

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const FieldLabel = ({ children }) => (
  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{children}</label>
);

const EMPTY_DEPT_FORM = {
  deptCode: "", deptName: "", businessUnitName: "", location: "",
  deptHeadName: "", deptHeadEmail: "", deptHeadMobNo: "",
  deptManagerEmail: "", deptSubManagerEmail: "",
  divisionManagerEmail: "", divisionOtherEmail: "",
};

// Add/Edit a single department's approval config.
const DeptConfigModal = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial || EMPTY_DEPT_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(initial?.id);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.deptName?.trim()) return toast.error("Department name is required");
    setSaving(true);
    try {
      if (isEdit) {
        await axios.put(`${baseURL}gatepass/dept-config/${initial.id}`, form);
      } else {
        await axios.post(`${baseURL}gatepass/dept-config`, form);
      }
      toast.success(isEdit ? "Department config updated" : "Department config added");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" /> {isEdit ? "Edit" : "Add"} Department Config
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><FieldLabel>Department Name *</FieldLabel><input className={inputCls} value={form.deptName} onChange={set("deptName")} /></div>
          <div>
            <FieldLabel>Business Unit Name</FieldLabel>
            <input className={inputCls} value={form.businessUnitName || ""} onChange={set("businessUnitName")} placeholder="e.g. MFG. ENGINEERING" />
            <p className="text-[10px] text-slate-400 mt-1">Only needed if it differs from Department Name — a gate pass matches either.</p>
          </div>
          <div><FieldLabel>Dept Code</FieldLabel><input className={inputCls} value={form.deptCode || ""} onChange={set("deptCode")} /></div>
          <div><FieldLabel>Location</FieldLabel><input className={inputCls} value={form.location || ""} onChange={set("location")} placeholder="e.g. Tadgam Plant" /></div>
          <div><FieldLabel>Dept Head Name</FieldLabel><input className={inputCls} value={form.deptHeadName || ""} onChange={set("deptHeadName")} /></div>
          <div><FieldLabel>Dept Head Email</FieldLabel><input type="email" className={inputCls} value={form.deptHeadEmail || ""} onChange={set("deptHeadEmail")} /></div>
          <div><FieldLabel>Dept Head Mobile</FieldLabel><input className={inputCls} value={form.deptHeadMobNo || ""} onChange={set("deptHeadMobNo")} /></div>
          <div><FieldLabel>Dept Manager Email (CC)</FieldLabel><input type="email" className={inputCls} value={form.deptManagerEmail || ""} onChange={set("deptManagerEmail")} /></div>
          <div><FieldLabel>Dept Sub-Manager Email (CC)</FieldLabel><input type="email" className={inputCls} value={form.deptSubManagerEmail || ""} onChange={set("deptSubManagerEmail")} /></div>
          <div><FieldLabel>Division Manager Email</FieldLabel><input type="email" className={inputCls} value={form.divisionManagerEmail || ""} onChange={set("divisionManagerEmail")} /></div>
          <div><FieldLabel>Division Other Email</FieldLabel><input type="email" className={inputCls} value={form.divisionOtherEmail || ""} onChange={set("divisionOtherEmail")} /></div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer">
            {saving ? <Spinner cls="w-4 h-4" /> : <Save className="w-4 h-4" />} {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Pull department contacts from the CLMS directory and bulk-add/refresh them
// into the local, editable config table. `open`/`onClose` are controlled by
// the parent so this can be triggered from more than one place (toolbar
// button, empty-state call-to-action) without duplicate modal instances.
const SyncFromDirectory = ({ open, onClose, existingNames, onSynced }) => {
  const [loading, setLoading] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${baseURL}gatepass/dept-directory`);
      setDirectory(res.data?.data || []);
    } catch {
      toast.error("Failed to load directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return directory.filter((d) => !s || d.deptName?.toLowerCase().includes(s));
  }, [directory, search]);

  const toggle = (name) => setSelected((set) => {
    const next = new Set(set);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((d) => d.deptName)));
  };

  const handleSync = async () => {
    if (selected.size === 0) return toast.error("Select at least one department");
    setSyncing(true);
    try {
      const res = await axios.post(`${baseURL}gatepass/dept-config/sync`, { deptNames: [...selected] });
      toast.success(`Synced ${res.data.total} department(s) — ${res.data.created} added, ${res.data.updated} updated`);
      setSelected(new Set());
      onClose();
      onSynced();
    } catch (err) {
      toast.error(err.response?.data?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <DownloadCloud className="w-4 h-4 text-blue-500" /> Sync from Directory
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className={`${inputCls} pl-9`} placeholder="Search department…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={toggleAll} className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap cursor-pointer">
            {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="py-10 text-center"><Spinner cls="w-6 h-6 mx-auto text-blue-400" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No departments found" />
          ) : (
            filtered.map((d) => {
              const isSelected = selected.has(d.deptName);
              const alreadySynced = existingNames.has(d.deptName);
              return (
                <button
                  key={d.deptName}
                  onClick={() => toggle(d.deptName)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50/60 transition-colors text-left cursor-pointer"
                >
                  {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" /> : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {d.deptName}
                      {d.businessUnitName && d.businessUnitName !== d.deptName && (
                        <span className="ml-1.5 text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">aka {d.businessUnitName}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{d.deptHeadName || "No head set"} {d.deptHeadEmail ? `· ${d.deptHeadEmail}` : ""}</p>
                  </div>
                  {alreadySynced && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Already added</span>}
                </button>
              );
            })
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">{selected.size} selected</p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">Cancel</button>
            <button onClick={handleSync} disabled={syncing || selected.size === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer">
              {syncing ? <Spinner cls="w-4 h-4" /> : <DownloadCloud className="w-4 h-4" />} {syncing ? "Syncing…" : `Sync ${selected.size || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const HRConfigCard = () => {
  const [form, setForm] = useState({ hrName: "", hrEmail: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${baseURL}gatepass/hr-config`);
      if (res.data?.data) setForm({ hrName: res.data.data.hrName || "", hrEmail: res.data.data.hrEmail || "" });
    } catch {
      toast.error("Failed to load HR config");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${baseURL}gatepass/hr-config`, form);
      toast.success("HR approver saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
        <UserRound className="w-3.5 h-3.5 text-blue-500" /> HR Approver
      </p>
      <p className="text-[11px] text-slate-400 mb-3">
        Receives the "Pending HR" approval email for every department — unlike Dept Head, HR isn't per-department.
      </p>
      {loading ? (
        <Spinner cls="w-4 h-4 text-blue-400" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <FieldLabel>HR Name</FieldLabel>
            <input className={inputCls} value={form.hrName} onChange={(e) => setForm((f) => ({ ...f, hrName: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>HR Email</FieldLabel>
            <input type="email" className={inputCls} value={form.hrEmail} onChange={(e) => setForm((f) => ({ ...f, hrEmail: e.target.value }))} />
          </div>
          <button onClick={handleSave} disabled={saving} className="sm:col-span-2 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer w-fit">
            {saving ? <Spinner cls="w-4 h-4" /> : <Save className="w-4 h-4" />} {saving ? "Saving…" : "Save HR Approver"}
          </button>
        </div>
      )}
    </div>
  );
};

const GatePassConfig = () => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // { } for add, {...row} for edit
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [syncOpen, setSyncOpen] = useState(false);

  const fetchConfigs = async () => {
    try {
      const res = await axios.get(`${baseURL}gatepass/dept-config`);
      setConfigs(res.data?.data || []);
    } catch {
      toast.error("Failed to load department configs");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchConfigs(); }, []);

  const existingNames = useMemo(() => new Set(configs.map((c) => c.deptName)), [configs]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return configs.filter((c) => !s || c.deptName?.toLowerCase().includes(s) || c.businessUnitName?.toLowerCase().includes(s) || c.location?.toLowerCase().includes(s));
  }, [configs, search]);

  const handleDelete = async () => {
    try {
      await axios.delete(`${baseURL}gatepass/dept-config/${deleteTarget.id}`);
      toast.success("Deleted");
      setDeleteTarget(null);
      fetchConfigs();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  const configuredCount = configs.filter((c) => c.deptHeadEmail).length;

  if (loading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        icon={Settings2}
        title="Gate Pass Config"
        subtitle="Manage department locations, approval contacts, and who gets approval emails"
        stats={[
          { label: "Departments", value: configs.length, tone: "slate" },
          { label: "Email-Ready", value: configuredCount, tone: "emerald" },
        ]}
        refreshing={loading}
        onRefresh={fetchConfigs}
      />

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        <HRConfigCard />

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500" /> Department Approval Contacts
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setSyncOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all cursor-pointer">
                <DownloadCloud className="w-3.5 h-3.5" /> Sync from Directory
              </button>
              <button onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Add Department
              </button>
              <button onClick={fetchConfigs} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 cursor-pointer">
                <RefreshCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative mb-3 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className={`${inputCls} pl-9`} placeholder="Search department or location…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {filtered.length === 0 ? (
            configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <Building2 className="w-10 h-10 text-slate-200" strokeWidth={1.2} />
                <div>
                  <p className="text-sm font-semibold text-slate-600">No department configs yet</p>
                  <p className="text-xs text-slate-400 mt-0.5">Pull in real department contacts from the CLMS directory to get started.</p>
                </div>
                <button onClick={() => setSyncOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer">
                  <DownloadCloud className="w-4 h-4" /> Sync from Directory
                </button>
              </div>
            ) : (
              <EmptyState title="No departments match your search" subtitle="Try a different search term." />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    {["Department", "Dept Head", "Email", "CC", ""].map((h) => (
                      <th key={h} className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-blue-50/40 transition-colors even:bg-slate-50/40">
                      <td className="px-3 py-2 border-b border-slate-100 font-semibold text-slate-800 whitespace-nowrap">
                        {c.deptName}
                        {c.businessUnitName && c.businessUnitName !== c.deptName && (
                          <span className="block text-[10px] font-normal text-slate-400">aka {c.businessUnitName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-slate-600 whitespace-nowrap">{c.deptHeadName || "—"}</td>
                      <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                        {c.deptHeadEmail ? (
                          <span className="flex items-center gap-1 text-emerald-700"><Mail className="w-3 h-3" /> {c.deptHeadEmail}</span>
                        ) : (
                          <span className="text-amber-600 text-[10px] font-semibold bg-amber-50 px-2 py-0.5 rounded-full">No email — web only</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-slate-400 whitespace-nowrap">
                        {[c.deptManagerEmail, c.deptSubManagerEmail].filter(Boolean).length || "—"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setModal(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <SyncFromDirectory open={syncOpen} onClose={() => setSyncOpen(false)} existingNames={existingNames} onSynced={fetchConfigs} />

      {modal && <DeptConfigModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={fetchConfigs} />}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <Trash2 className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">Delete Config?</h3>
            <p className="text-sm text-slate-500 mt-1">
              Remove the approval config for <strong>{deleteTarget.deptName}</strong>? Dept Head email approval for this department will stop working until re-added.
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GatePassConfig;
