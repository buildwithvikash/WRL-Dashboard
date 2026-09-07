import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { LogOut, LogIn } from "lucide-react";
import Loader from "../../components/ui/Loader.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx";
import {
  Spinner,
  StatusBadge,
  EmptyState,
} from "../../components/employeeManagement/Gatepassui.jsx";

const SecurityCard = ({
  pass,
  icon: Icon,
  label,
  busy,
  value,
  onNameChange,
  onAction,
}) => (
  <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-semibold text-slate-800">
          {pass.empName}{" "}
          <span className="text-slate-400 font-normal">· {pass.empCode}</span>
        </p>
        <p className="text-xs text-slate-400">
          {pass.deptName} · {pass.placeOfVisit}
        </p>
      </div>
      <StatusBadge status={pass.status} />
    </div>
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <input
        placeholder="Supervisor name"
        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <button
        disabled={busy}
        onClick={onAction}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white transition-all cursor-pointer disabled:opacity-50"
      >
        {busy ? (
          <Spinner cls="w-3.5 h-3.5" />
        ) : (
          <Icon className="w-3.5 h-3.5" />
        )}
        {label}
      </button>
    </div>
  </div>
);

const GatePassSecurityGate = () => {
  const {
    passes,
    initialLoading,
    refreshing,
    actionId,
    fetchPasses,
    security,
  } = useGatePasses();
  const [nameDrafts, setNameDrafts] = useState({});

  const readyForOut = useMemo(
    () => passes.filter((p) => p.status === "Approved"),
    [passes],
  );
  const currentlyOut = useMemo(
    () => passes.filter((p) => p.status === "Out"),
    [passes],
  );

  const badges = useMemo(
    () => ({
      "/gatepass/depthead": passes.filter(
        (p) => p.status === "Pending Dept Head",
      ).length,
      "/gatepass/hr-approval": passes.filter((p) => p.status === "Pending HR")
        .length,
      "/gatepass/security": readyForOut.length + currentlyOut.length,
    }),
    [passes, readyForOut, currentlyOut],
  );

  const handleAction = async (id, direction) => {
    const name = (nameDrafts[id] || "").trim();
    if (!name) {
      toast.error("Please enter the supervisor's name first.");
      return;
    }
    await security(id, direction, name);
  };

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        title="Security Gate"
        subtitle="Log employees out and back in at the gate"
        stats={[
          { label: "Ready", value: readyForOut.length, tone: "emerald" },
          { label: "Out", value: currentlyOut.length, tone: "blue" },
        ]}
        refreshing={refreshing}
        onRefresh={() => fetchPasses()}
      />

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            Ready for Gate Out
          </p>
          <p className="text-xs text-slate-400 mb-3">
            Approved passes waiting to exit.
          </p>
          {readyForOut.length === 0 ? (
            <EmptyState
              title="Nothing to release"
              subtitle="Approved passes will appear here."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {readyForOut.map((p) => (
                <SecurityCard
                  key={p.id}
                  pass={p}
                  icon={LogOut}
                  label="Mark Gate Out"
                  busy={actionId === p.id}
                  value={nameDrafts[p.id] || ""}
                  onNameChange={(v) =>
                    setNameDrafts((d) => ({ ...d, [p.id]: v }))
                  }
                  onAction={() => handleAction(p.id, "out")}
                />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            Currently Out
          </p>
          <p className="text-xs text-slate-400 mb-3">
            Log the return when the employee is back.
          </p>
          {currentlyOut.length === 0 ? (
            <EmptyState
              title="Everyone's in"
              subtitle="No one is currently marked out."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {currentlyOut.map((p) => (
                <SecurityCard
                  key={p.id}
                  pass={p}
                  icon={LogIn}
                  label="Mark Gate In"
                  busy={actionId === p.id}
                  value={nameDrafts[p.id] || ""}
                  onNameChange={(v) =>
                    setNameDrafts((d) => ({ ...d, [p.id]: v }))
                  }
                  onAction={() => handleAction(p.id, "in")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GatePassSecurityGate;
