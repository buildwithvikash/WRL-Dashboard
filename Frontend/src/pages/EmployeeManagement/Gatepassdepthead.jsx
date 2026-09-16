import { useMemo } from "react";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { UserCheck2 } from "lucide-react";
import Loader from "../../components/ui/Loader.jsx";
import useGatePasses from "../../hooks/Usegatepasses.js";
import GatePassHeader from "../../components/employeeManagement/Gatepassheader.jsx";
import GatePassApprovalQueue from "../../components/employeeManagement/Gatepassapprovalqueue.jsx";

const formatWait = (mins) => {
  if (mins < 60) return `${Math.floor(mins)}m`;
  return `${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m`;
};

const GatePassDeptHead = () => {
  const { passes, initialLoading, refreshing, actionId, fetchPasses, decide } =
    useGatePasses();
  const { user } = useSelector((store) => store.auth);
  const approverName = user?.name || "";

  const queue = useMemo(
    () => passes.filter((p) => p.status === "Pending Dept Head"),
    [passes],
  );

  const oldestWait = useMemo(() => {
    if (queue.length === 0) return "—";
    const oldest = [...queue].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    return formatWait((Date.now() - new Date(oldest.createdAt).getTime()) / 60000);
  }, [queue]);

  const handleDecision = async (id, stage, decision) => {
    if (!approverName) {
      toast.error("Could not determine your logged-in name.");
      return;
    }
    await decide(id, stage, decision, approverName);
  };

  if (initialLoading) return <Loader />;

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      <GatePassHeader
        icon={UserCheck2}
        title="Department Head Approval"
        subtitle="Requests waiting on department head sign-off"
        stats={[
          { label: "Pending", value: queue.length, tone: "amber" },
          { label: "Oldest Wait", value: oldestWait, tone: "blue" },
        ]}
        refreshing={refreshing}
        onRefresh={() => fetchPasses()}
      />

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <GatePassApprovalQueue
            queue={queue}
            stage="depthead"
            approverName={approverName}
            actionId={actionId}
            onDecision={handleDecision}
          />
        </div>
      </div>
    </div>
  );
};

export default GatePassDeptHead;
