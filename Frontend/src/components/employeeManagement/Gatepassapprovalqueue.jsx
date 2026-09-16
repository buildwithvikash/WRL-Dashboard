import { useMemo } from "react";
import { Check, X, MapPin, MessageSquare, Phone, Repeat2, UserRound } from "lucide-react";
import { Spinner, StatusBadge, EmptyState, Avatar, ElapsedBadge, StatusPipeline } from "./Gatepassui";

/**
 * Renders a list of pending passes with Approve/Reject actions, actioned as
 * the logged-in user (approverName) — no free-text name entry. Used
 * identically by the Dept Head page (stage="depthead") and the HR Approval
 * page (stage="hr") — only the queue contents differ. Oldest-first so
 * nobody gets skipped waiting behind newer requests.
 */
const GatePassApprovalQueue = ({
  queue,
  stage,
  approverName,
  actionId,
  onDecision,
}) => {
  const sorted = useMemo(
    () => [...queue].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [queue],
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="Queue is empty"
        subtitle="Nothing waiting on you right now."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((p, idx) => {
        const isBusy = actionId === p.id;
        const isOldest = idx === 0;
        return (
          <div
            key={p.id}
            className={`relative border rounded-xl p-4 bg-white transition-all hover:shadow-md ${
              isOldest ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"
            }`}
          >
            {isOldest && (
              <span className="absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-white shadow-sm">
                OLDEST WAITING
              </span>
            )}

            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Avatar name={p.empName} empCode={p.empCode} />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {p.empName}{" "}
                    <span className="text-slate-400 font-normal">· {p.empCode}</span>
                  </p>
                  <p className="text-xs text-slate-400">{p.deptName} · {p.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ElapsedBadge since={p.createdAt} />
                <StatusBadge status={p.status} />
              </div>
            </div>

            <div className="mt-3">
              <StatusPipeline pass={p} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs bg-slate-50/70 rounded-lg p-3">
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] tracking-wide">Place of Visit</span>
                  <span className="text-slate-700 font-medium">{p.placeOfVisit || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] tracking-wide">Reason</span>
                  <span className="text-slate-700 font-medium">{p.reason || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] tracking-wide">Contact</span>
                  <span className="text-slate-700 font-medium">{p.contactNo || "—"}</span>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Repeat2 className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-slate-400 uppercase text-[9px] tracking-wide">Coming Back?</span>
                  <span className={`font-semibold ${p.comingBack === "Yes" ? "text-emerald-600" : "text-slate-500"}`}>
                    {p.comingBack}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 bg-slate-50">
                <UserRound className="w-3.5 h-3.5 text-slate-400" />
                {approverName || "—"}
              </span>
              <button
                disabled={isBusy}
                onClick={() => onDecision(p.id, stage, "Approved")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-100"
              >
                {isBusy ? (
                  <Spinner cls="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Approve
              </button>
              <button
                disabled={isBusy}
                onClick={() => onDecision(p.id, stage, "Rejected")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border border-red-300 text-red-600 hover:bg-red-50 transition-all cursor-pointer disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GatePassApprovalQueue;
