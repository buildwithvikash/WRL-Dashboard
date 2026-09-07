import { Check, X } from "lucide-react";
import { Spinner, StatusBadge, EmptyState } from "./Gatepassui";

/**
 * Renders a list of pending passes with a name field + Approve/Reject.
 * Used identically by the Dept Head page (stage="depthead") and the
 * HR Approval page (stage="hr") — only the queue contents differ.
 */
const GatePassApprovalQueue = ({
  queue,
  stage,
  nameDrafts,
  setNameDrafts,
  actionId,
  onDecision,
}) => {
  if (queue.length === 0) {
    return (
      <EmptyState
        title="Queue is empty"
        subtitle="Nothing waiting on you right now."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {queue.map((p) => {
        const isBusy = actionId === p.id;
        return (
          <div
            key={p.id}
            className="border border-slate-200 rounded-lg p-4 bg-slate-50/50"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {p.empName}{" "}
                  <span className="text-slate-400 font-normal">
                    · {p.empCode}
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  {p.deptName} · {p.type} · Out: {p.outDateTime}
                </p>
              </div>
              <StatusBadge status={p.status} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
              <div>
                <span className="block text-slate-400 uppercase text-[10px]">
                  Place of Visit
                </span>
                {p.placeOfVisit}
              </div>
              <div>
                <span className="block text-slate-400 uppercase text-[10px]">
                  Reason
                </span>
                {p.reason}
              </div>
              <div>
                <span className="block text-slate-400 uppercase text-[10px]">
                  Contact
                </span>
                {p.contactNo}
              </div>
              <div>
                <span className="block text-slate-400 uppercase text-[10px]">
                  Coming Back?
                </span>
                {p.comingBack}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <input
                placeholder="Your name"
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={nameDrafts[p.id] || ""}
                onChange={(e) =>
                  setNameDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                }
              />
              <button
                disabled={isBusy}
                onClick={() => onDecision(p.id, stage, "Approved")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer disabled:opacity-50"
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
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-red-300 text-red-600 hover:bg-red-50 transition-all cursor-pointer disabled:opacity-50"
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
