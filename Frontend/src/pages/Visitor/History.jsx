import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { CgProfile } from "react-icons/cg";
import {
  FaEye,
  FaUsers,
  FaSearch,
  FaChevronLeft,
  FaChevronRight,
  FaBuilding,
  FaRedo,
  FaDoorOpen,
} from "react-icons/fa";
import { MdHistory, MdFilterList } from "react-icons/md";
import { baseURL } from "../../assets/assets";
import { formatISODateString } from "../../utils/dateUtils";
import ProfilePanel from "../../components/visitor/ProfilePanel.jsx";

/* ==================== Stat Card ==================== */
const StatCard = ({ icon: Icon, title, value, color, sub }) => (
  <div className="bg-white shadow-md rounded-xl p-4 flex items-center gap-4 border border-gray-100">
    <div className={`shrink-0 p-3 rounded-xl ${color}`}>
      <Icon className="text-white text-xl" />
    </div>
    <div className="min-w-0">
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{title}</p>
      <h2 className="text-2xl font-bold text-gray-800 leading-tight">{value}</h2>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

/* ==================== Presence Badge ==================== */
const PresenceBadge = ({ checkedOut }) =>
  checkedOut ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Checked Out
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> On Site
    </span>
  );

const History = () => {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [companies, setCompanies] = useState(0);
  const [currentlyOnSite, setCurrentlyOnSite] = useState(0);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce free-text search so every keystroke doesn't trigger a request.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change re-queries from page 1 — a stale offset combined with
  // a narrower filter used to silently return an empty page.
  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, from, to, status]);

  const fetchVisitors = async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (debouncedSearch) params.search = debouncedSearch;
      if (from) params.from = from;
      if (to) params.to = to;
      if (status !== "all") params.status = status;

      const res = await axios.get(`${baseURL}visitor/history`, { params });
      if (res.data?.success) {
        setVisitors(res.data.data || []);
        setTotalCount(res.data.totalCount || 0);
        setCompanies(res.data.companies || 0);
        setCurrentlyOnSite(res.data.currentlyOnSite || 0);
      } else {
        toast.error(res.data?.message || "Failed to fetch visitors");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch visitors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVisitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, debouncedSearch, from, to, status]);

  const clearFilters = () => {
    setSearch("");
    setFrom("");
    setTo("");
    setStatus("all");
  };

  const hasActiveFilters = search || from || to || status !== "all";

  // Single "Clear and Apply" action — clears filters when any are active,
  // otherwise just re-runs the current query (a manual refresh).
  const handleClearApply = () => {
    if (hasActiveFilters) clearFilters();
    else fetchVisitors();
  };

  const viewProfile = async (visitor) => {
    setSelectedId(visitor.id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${baseURL}visitor/details/${visitor.id}`);
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

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="h-full overflow-y-auto bg-gray-100 p-4 max-w-full">
      {/* Page Title */}
      <div className="text-center mb-5">
        <h1 className="text-3xl font-bold text-gray-800">Visitor History</h1>
        <p className="text-sm text-gray-500 mt-1">
          Search and review every visitor who has ever checked in, with their full visit timeline.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        {/* ==================== Left column ==================== */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* ==================== Stats Cards ==================== */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              icon={FaUsers}
              title="All Visitors Found"
              value={totalCount}
              color="bg-blue-500"
              sub={hasActiveFilters ? "Matching current filters" : "All-time"}
            />
            <StatCard
              icon={FaDoorOpen}
              title="Currently On-Site"
              value={currentlyOnSite}
              color="bg-green-500"
              sub="Not yet checked out"
            />
            <StatCard
              icon={FaBuilding}
              title="Unique Companies"
              value={companies}
              color="bg-purple-500"
              sub={hasActiveFilters ? "Matching current filters" : "All-time"}
            />
            <StatCard
              icon={MdHistory}
              title="Page"
              value={`${currentPage} / ${totalPages}`}
              color="bg-amber-500"
              sub={`${visitors.length} on this page`}
            />
          </div>

          {/* ==================== Filters Section ==================== */}
          <div className="bg-white shadow-md rounded-xl p-6 border border-gray-100">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
              <MdFilterList className="text-blue-500" /> Tools &amp; Filters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Search */}
              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                  <input
                    type="text"
                    placeholder="Search by name or company across all visitors..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* From Date */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Date Range</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* To Date */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Status */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Status Filter</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="all">All Statuses</option>
                  <option value="onsite">On Site</option>
                  <option value="checkedout">Checked Out</option>
                </select>
              </div>

              {/* Clear and Apply */}
              <div className="md:col-span-2">
                <button
                  onClick={handleClearApply}
                  className="w-full px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-blue-600 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FaRedo className="text-xs" /> Clear and Apply
                </button>
              </div>
            </div>
          </div>

          {/* ==================== Visitors Table ==================== */}
          <div className="bg-white shadow-md rounded-xl p-6 border border-gray-100">
            {/* Table Header with Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Visitor Records</h3>

              <div className="flex items-center gap-4">
                {/* Per Page */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">Per page:</label>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setOffset(0);
                    }}
                    className="border border-gray-300 rounded-lg p-1.5 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => offset > 0 && setOffset(offset - limit)}
                    disabled={offset === 0}
                    className={`p-2 rounded-lg text-sm transition ${
                      offset > 0
                        ? "bg-blue-500 text-white hover:bg-blue-600 cursor-pointer shadow-md"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <FaChevronLeft />
                  </button>

                  <span className="text-sm text-gray-600 font-medium px-2">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => offset + limit < totalCount && setOffset(offset + limit)}
                    disabled={offset + limit >= totalCount}
                    className={`p-2 rounded-lg text-sm transition ${
                      offset + limit < totalCount
                        ? "bg-blue-500 text-white hover:bg-blue-600 cursor-pointer shadow-md"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <FaChevronRight />
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin h-10 w-10 border-b-2 border-blue-500 rounded-full mx-auto" />
                <p className="text-gray-500 text-sm mt-4">Loading visitor history...</p>
              </div>
            ) : visitors.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-left text-xs font-semibold text-gray-600">Profile</th>
                      <th className="p-3 text-left text-xs font-semibold text-gray-600">Company</th>
                      <th className="p-3 text-left text-xs font-semibold text-gray-600">Last Visit</th>
                      <th className="p-3 text-left text-xs font-semibold text-gray-600">Status</th>
                      <th className="p-3 text-left text-xs font-semibold text-gray-600">Primary Host</th>
                      <th className="p-3 text-center text-xs font-semibold text-gray-600">Total Visits</th>
                      <th className="p-3 text-center text-xs font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitors.map((v, index) => {
                      const isSelected = selectedId === v.id;
                      return (
                        <tr
                          key={v.id || index}
                          onClick={() => viewProfile(v)}
                          className={`border-b border-gray-100 transition-colors cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-blue-50/40"}`}
                        >
                          {/* Visitor Name + Photo */}
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              {v.photo_url ? (
                                <img
                                  src={v.photo_url}
                                  alt={v.visitor_name}
                                  className="w-10 h-10 rounded-full object-cover border-2 border-blue-300"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-300">
                                  <CgProfile className="text-xl text-gray-400" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-gray-800">{v.visitor_name}</p>
                                <p className="text-xs text-gray-400">{v.contact_no || "No contact"}</p>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 text-gray-700">{v.company || "—"}</td>
                          <td className="p-3 text-gray-700">{formatISODateString(v.check_in_time) || "—"}</td>

                          <td className="p-3">
                            <PresenceBadge checkedOut={Boolean(v.check_out_time)} />
                          </td>

                          <td className="p-3 text-gray-700">
                            <p className="text-gray-800">{v.employee_name || "—"}</p>
                            <p className="text-xs text-gray-400">{v.department_name || "—"}</p>
                          </td>

                          <td className="p-3 text-center">
                            <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 font-bold text-xs px-2.5 py-1 rounded-full">
                              {v.total_passes ?? 0}
                            </span>
                          </td>

                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {isSelected ? (
                              <button
                                onClick={() => viewProfile(v)}
                                className="px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md hover:bg-blue-600 transition cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <FaEye /> View Profile &amp; Timeline
                              </button>
                            ) : (
                              <button
                                onClick={() => viewProfile(v)}
                                title="View Profile & Timeline"
                                className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 cursor-pointer"
                              >
                                <FaEye />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16">
                <FaUsers className="text-6xl text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-500">No visitors found</h3>
                <p className="text-gray-400 text-sm mt-1">
                  {hasActiveFilters ? "Try adjusting your search or date filters" : "No visitors have checked in yet"}
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-blue-600 transition cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}

            {/* Bottom Pagination Info */}
            {visitors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-2">
                <p className="text-xs text-gray-400">
                  Showing {offset + 1}–{Math.min(offset + limit, totalCount)} of {totalCount} visitors
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Per Page:</label>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setOffset(0);
                    }}
                    className="border border-gray-300 rounded-lg p-1 text-xs bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-xs text-gray-400">{currentPage} / {totalPages}</span>
                  <button
                    onClick={() => offset + limit < totalCount && setOffset(offset + limit)}
                    disabled={offset + limit >= totalCount}
                    className={`p-1.5 rounded-lg text-xs transition ${
                      offset + limit < totalCount
                        ? "bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <FaChevronRight />
                  </button>
                </div>
              </div>
            )}
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

export default History;
