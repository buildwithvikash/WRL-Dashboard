import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { FaFileAlt, FaSearch, FaUsers, FaPaperPlane, FaEye } from "react-icons/fa";
import DateTimePicker from "../../components/ui/DateTimePicker";
import SelectField from "../../components/ui/SelectField";
import { baseURL } from "../../assets/assets";
import Loader from "../../components/ui/Loader";
import { formatISODateString } from "../../utils/dateUtils";
import ProfilePanel from "../../components/visitor/ProfilePanel.jsx";

const QUICK_FILTERS = [
  { key: "yday", label: "Yesterday" },
  { key: "tday", label: "Today" },
  { key: "mtd", label: "Month To Date" },
];

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [visitors, setVisitors] = useState([]);
  const [ydayLoading, setYdayLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [searchParams, setSearchParams] = useState({ term: "", field: "all" });
  const [companyFilter, setCompanyFilter] = useState("all");
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyResults, setCompanyResults] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const formatDate = (date) => {
    const pad = (n) => (n < 10 ? "0" + n : n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const fetchVisitorData = async (start, end, setLoader) => {
    try {
      setLoader(true);
      setVisitors([]);
      const res = await axios.get(`${baseURL}visitor/repot`, {
        params: { startTime: start, endTime: end },
      });
      if (res?.data?.success) setVisitors(res.data.data || []);
    } catch (error) {
      console.error("Failed to fetch visitor data:", error);
      toast.error("Failed to fetch visitor data.");
    } finally {
      setLoader(false);
    }
  };

  const fetchYdayVisitorData = () => {
    const now = new Date();
    const today8AM = new Date(now);
    today8AM.setHours(8, 0, 0, 0);
    const yesterday8AM = new Date(today8AM);
    yesterday8AM.setDate(today8AM.getDate() - 1);
    setCompanyFilter("all");
    setStartTime(formatDate(yesterday8AM));
    setEndTime(formatDate(today8AM));
    fetchVisitorData(formatDate(yesterday8AM), formatDate(today8AM), setYdayLoading);
  };

  const fetchTdayVisitorData = () => {
    const now = new Date();
    const today8AM = new Date(now);
    today8AM.setHours(8, 0, 0, 0);
    setCompanyFilter("all");
    setStartTime(formatDate(today8AM));
    setEndTime(formatDate(now));
    fetchVisitorData(formatDate(today8AM), formatDate(now), setTodayLoading);
  };

  const fetchMTDVisitorData = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 8, 0, 0);
    setCompanyFilter("all");
    setStartTime(formatDate(startOfMonth));
    setEndTime(formatDate(now));
    fetchVisitorData(formatDate(startOfMonth), formatDate(now), setMonthLoading);
  };

  const QUICK_ACTIONS = {
    yday: fetchYdayVisitorData,
    tday: fetchTdayVisitorData,
    mtd: fetchMTDVisitorData,
  };
  const quickLoading = { yday: ydayLoading, tday: todayLoading, mtd: monthLoading };

  const fetchVisitors = async () => {
    if (!startTime || !endTime) return toast.error("Please select the Time Range.");
    setCompanyFilter("all");
    await fetchVisitorData(startTime, endTime, setLoading);
  };

  // Default to Today's data on first load instead of sitting empty until a
  // quick filter is clicked.
  useEffect(() => {
    fetchTdayVisitorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full all-time company directory (not scoped to the loaded date range) so
  // the filter can find a company even if they haven't visited recently.
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${baseURL}visitor/companies`);
        if (res.data?.success) setCompanyOptions(res.data.data || []);
      } catch (err) {
        console.error("Failed to fetch companies:", err);
      }
    })();
  }, []);

  // Picking a company searches ALL of its visits, regardless of date — a
  // company's visits can easily fall outside whatever range happens to be
  // loaded, so filtering the already-narrow date-range list client-side
  // silently showed nothing. This replaces the table's data source entirely
  // while a company is selected.
  useEffect(() => {
    if (companyFilter === "all") {
      setCompanyResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setCompanyLoading(true);
      try {
        const res = await axios.get(`${baseURL}visitor/search-by-company`, {
          params: { company: companyFilter },
        });
        if (!cancelled && res.data?.success) setCompanyResults(res.data.data || []);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to search company visits:", err);
          toast.error("Failed to search company visits.");
        }
      } finally {
        if (!cancelled) setCompanyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyFilter]);

  const isCompanySearch = companyFilter !== "all";
  const baseRows = isCompanySearch ? companyResults : visitors;

  const filteredReports = baseRows.filter((item) => {
    const { term, field } = searchParams;
    if (!term) return true;
    const lowerTerm = term.toLowerCase();
    const safeLower = (value) => (value ? value.toLowerCase() : "");

    switch (field) {
      case "name":
        return safeLower(item.visitor_name).includes(lowerTerm);
      case "contactno":
        return safeLower(item.contact_no).includes(lowerTerm);
      case "email":
        return safeLower(item.email).includes(lowerTerm);
      case "company":
        return safeLower(item.company).includes(lowerTerm);
      case "purpose":
        return safeLower(item.purpose_of_visit).includes(lowerTerm);
      default:
        return (
          safeLower(item.visitor_name).includes(lowerTerm) ||
          safeLower(item.contact_no).includes(lowerTerm) ||
          safeLower(item.email).includes(lowerTerm) ||
          safeLower(item.company).includes(lowerTerm) ||
          safeLower(item.purpose_of_visit).includes(lowerTerm)
        );
    }
  });

  // One row per unique visitor (their most recent visit in the current
  // filtered range), with a count of how many visits they made within it —
  // the flat report is per-visit, but the redesigned table is per-person.
  const groupedVisitors = useMemo(() => {
    const latestByKey = new Map();
    const countByKey = new Map();
    for (const r of filteredReports) {
      const key = r.id ?? r.contact_no ?? r.visitor_name;
      countByKey.set(key, (countByKey.get(key) || 0) + 1);
      const existing = latestByKey.get(key);
      if (!existing || new Date(r.check_in_time) > new Date(existing.check_in_time)) {
        latestByKey.set(key, r);
      }
    }
    return [...latestByKey.entries()]
      .map(([key, row]) => ({ ...row, visitsInRange: countByKey.get(key) }))
      .sort((a, b) => new Date(b.check_in_time) - new Date(a.check_in_time));
  }, [filteredReports]);

  const handleSendReport = async () => {
    if (!filteredReports.length) return toast.error("No report data to send.");
    try {
      const res = await axios.post(`${baseURL}visitor/send-report`, {
        visitors: filteredReports,
      });
      res?.data?.success
        ? toast.success("Report sent successfully!")
        : toast.error(res?.data?.message || "Failed to send report.");
    } catch (error) {
      console.error("Failed to send report:", error);
      toast.error("Failed to send report.");
    }
  };

  const viewProfile = async (row) => {
    setSelectedId(row.id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${baseURL}visitor/details/${row.id}`);
      if (res.data?.success) {
        const logs = res.data.visit_logs || [];
        setDetail({ visitor: res.data.visitor, logs, host: logs[0] || null });
      } else {
        toast.error(res.data?.message || "Failed to fetch visitor details");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch visitor details");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeProfile = () => {
    setSelectedId(null);
    setDetail(null);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-100 p-4 max-w-full">
      {/* Page Title */}
      <h1 className="text-3xl font-bold text-center mb-4 text-gray-800">
        Visitors Reports
      </h1>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        {/* ==================== Left column ==================== */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* ==================== Filters Section ==================== */}
          <div className="bg-white shadow-md rounded-xl p-6 border border-gray-100">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">
              Filters &amp; Quick Actions
            </h3>

            <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-end flex-wrap">
              {/* Date Range & Query */}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Select Date Range</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <DateTimePicker value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  <DateTimePicker value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  <button
                    onClick={fetchVisitors}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-blue-600 transition cursor-pointer flex items-center gap-2"
                  >
                    {loading ? <Loader /> : <><FaSearch className="text-xs" /> Apply Filters</>}
                  </button>
                </div>
              </div>

              {/* Company */}
              <div className="w-56">
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-sm font-semibold text-gray-700">Company</label>
                  {companyLoading && <div className="animate-spin h-3 w-3 border-b-2 border-blue-500 rounded-full" />}
                </div>
                <SelectField
                  placeholder="Search companies…"
                  options={[{ value: "all", label: "All Companies" }, ...companyOptions.map((c) => ({ value: c, label: c }))]}
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                />
                {isCompanySearch && (
                  <p className="text-[10px] text-gray-400 mt-1">Showing all-time visits for this company — date range is ignored.</p>
                )}
              </div>

              {/* Search */}
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Search</label>
                  <input
                    type="text"
                    placeholder="Search visitor..."
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={searchParams.term}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, term: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Field</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={searchParams.field}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, field: e.target.value }))}
                  >
                    <option value="all">All Fields</option>
                    <option value="name">Name</option>
                    <option value="contactno">Contact No.</option>
                    <option value="email">Email</option>
                    <option value="company">Company</option>
                    <option value="purpose">Purpose</option>
                  </select>
                </div>
              </div>

              {/* Quick Filters */}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Quick Filters</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_FILTERS.map((q) => (
                    <button
                      key={q.key}
                      onClick={QUICK_ACTIONS[q.key]}
                      className="px-3 py-2 bg-white border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:border-blue-400 hover:text-blue-600 transition cursor-pointer"
                    >
                      {quickLoading[q.key] ? <Loader /> : q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ==================== Visitors Table ==================== */}
          <div className="bg-white shadow-md rounded-xl p-6 border border-gray-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-blue-500">
                    <FaUsers className="text-white text-lg" />
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">Total Unique Visitors</p>
                    <h2 className="text-2xl font-bold text-gray-800">{groupedVisitors.length}</h2>
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Total Visits</p>
                  <h2 className="text-2xl font-bold text-gray-800">{filteredReports.length}</h2>
                </div>
              </div>

              <button
                onClick={handleSendReport}
                className="px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-purple-600 transition cursor-pointer flex items-center gap-2"
              >
                <FaPaperPlane className="text-xs" /> Send Report
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-2">
              Visitors Report Table · one row per visitor, most recent visit {isCompanySearch ? "for this company" : "in range"}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    {["Sr. No", "Type", "Name", "Contact", "Company", "Check In", "Check Out", "Duration", "Visited Employee", "Dept.", "Token", "Actions"].map((h) => (
                      <th key={h} className="p-2.5 border-b border-gray-200 text-left font-semibold text-gray-600 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedVisitors.length > 0 ? (
                    groupedVisitors.map((v, i) => {
                      const isSelected = selectedId === v.id;
                      return (
                        <tr
                          key={v.id ?? i}
                          className={`border-b border-gray-100 transition-colors cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                          onClick={() => viewProfile(v)}
                        >
                          <td className="p-2.5 text-gray-700">{i + 1}</td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap">{v.visit_type || "—"}</td>
                          <td className="p-2.5 font-medium text-gray-800 whitespace-nowrap">{v.visitor_name || "—"}</td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap">{v.contact_no || "—"}</td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap">{v.company || "—"}</td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap font-mono text-[11px]">{formatISODateString(v.check_in_time) || "—"}</td>
                          <td className="p-2.5 whitespace-nowrap font-mono text-[11px]">
                            {v.check_out_time ? (
                              <span className="text-gray-700">{formatISODateString(v.check_out_time)}</span>
                            ) : (
                              <span className="text-emerald-600 font-bold">Currently In</span>
                            )}
                          </td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap">{v.visit_duration || "—"}</td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap">{v.employee_name || "—"}</td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap">{v.department_name || "—"}</td>
                          <td className="p-2.5 text-gray-700 whitespace-nowrap font-mono text-[11px]">{v.token || "—"}</td>
                          <td className="p-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => viewProfile(v)}
                              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <FaEye className="text-[10px]" /> View Profile
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="text-center py-12">
                        <FaFileAlt className="text-5xl text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No visitors found.</p>
                        <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or date range</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ==================== Right column ==================== */}
        <div className="xl:sticky xl:top-4 h-[calc(100vh-6rem)]">
          <ProfilePanel visitorId={selectedId} detail={detail} loading={detailLoading} onClose={closeProfile} />
        </div>
      </div>
    </div>
  );
};

export default Reports;
