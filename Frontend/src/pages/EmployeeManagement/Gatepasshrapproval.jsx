import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import Loader from "../../components/ui/Loader.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx"
import GatePassApprovalQueue from "../../components/employeeManagement/Gatepassapprovalqueue.jsx"

const GatePassHRApproval = () => {
  const { passes, initialLoading, refreshing, actionId, fetchPasses, decide } =
    useGatePasses();
  const [nameDrafts, setNameDrafts] = useState({});

  const queue = useMemo(
    () => passes.filter((p) => p.status === "Pending HR"),
    [passes],
  );

  const badges = useMemo(
    () => ({
      "/gatepass/depthead": passes.filter(
        (p) => p.status === "Pending Dept Head",
      ).length,
      "/gatepass/hr-approval": queue.length,
      "/gatepass/security": passes.filter(
        (p) => p.status === "Approved" || p.status === "Out",
      ).length,
    }),
    [passes, queue],
  );

  const handleDecision = async (id, stage, decision) => {
    const name = (nameDrafts[id] || "").trim();
    if (!name) {
      toast.error("Please enter your name first.");
      return;
    }
    await decide(id, stage, decision, name);
  };

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        title="HR Approval"
        subtitle="Requests cleared by the department head, waiting on HR"
        stats={[{ label: "Pending", value: queue.length, tone: "amber" }]}
        refreshing={refreshing}
        onRefresh={() => fetchPasses()}
      />

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <GatePassApprovalQueue
            queue={queue}
            stage="hr"
            nameDrafts={nameDrafts}
            setNameDrafts={setNameDrafts}
            actionId={actionId}
            onDecision={handleDecision}
          />
        </div>
      </div>
    </div>
  );
};

export default GatePassHRApproval;
