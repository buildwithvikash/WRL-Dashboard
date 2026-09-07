import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { baseURL } from "../assets/assets.js";

/**
 * Central data hook for the Gate Pass module. Each page (Request, Dept Head,
 * HR Approval, Security Gate, Reports) imports this so there is exactly one
 * place that talks to the API — pages just render subsets of `passes` and
 * call the actions relevant to them.
 */
export default function useGatePasses() {
  const [passes, setPasses] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState(null);

  const fetchPasses = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setRefreshing(true);
      const res = await axios.get(`${baseURL}gatepass/list`);
      if (res?.data?.success) setPasses(res.data.data);
    } catch {
      toast.error("Failed to load gate passes.");
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createPass = useCallback(
    async (form) => {
      try {
        const res = await axios.post(`${baseURL}gatepass/create`, form);
        if (res?.data?.success) {
          toast.success("Request submitted to Dept Head.");
          await fetchPasses({ silent: true });
          return true;
        }
        return false;
      } catch (err) {
        toast.error(
          err?.response?.data?.message || "Failed to submit gate pass.",
        );
        return false;
      }
    },
    [fetchPasses],
  );

  const decide = useCallback(
    async (id, stage, decision, name) => {
      try {
        setActionId(id);
        const res = await axios.put(`${baseURL}gatepass/${id}/${stage}`, {
          name,
          decision,
        });
        if (res?.data?.success) {
          toast.success(
            decision === "Approved" ? "Approved and forwarded." : "Rejected.",
          );
          await fetchPasses({ silent: true });
          return true;
        }
        return false;
      } catch (err) {
        toast.error(err?.response?.data?.message || "Action failed.");
        return false;
      } finally {
        setActionId(null);
      }
    },
    [fetchPasses],
  );

  const security = useCallback(
    async (id, direction, name) => {
      try {
        setActionId(id);
        const res = await axios.put(
          `${baseURL}gatepass/${id}/security/${direction}`,
          { name },
        );
        if (res?.data?.success) {
          toast.success(
            direction === "out" ? "Gate out logged." : "Gate in logged.",
          );
          await fetchPasses({ silent: true });
          return true;
        }
        return false;
      } catch (err) {
        toast.error(err?.response?.data?.message || "Action failed.");
        return false;
      } finally {
        setActionId(null);
      }
    },
    [fetchPasses],
  );

  const fetchExportData = useCallback(async (params = {}) => {
    try {
      const res = await axios.get(`${baseURL}gatepass/export`, { params });
      return res?.data?.success ? res.data.data : [];
    } catch {
      toast.error("Failed to fetch export data.");
      return [];
    }
  }, []);

  return {
    passes,
    initialLoading,
    refreshing,
    actionId,
    fetchPasses,
    createPass,
    decide,
    security,
    fetchExportData,
  };
}
