import { useState, useMemo, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { baseURL } from "../../../assets/assets";
import ExportButton from "../../../components/ui/ExportButton";
import {
  Search,
  X,
  Loader2,
  Package,
  Factory,
  TrendingUp,
  CalendarDays,
  ChevronUp,
  ChevronDown,
  PackageOpen,
  BarChart3,
  History,
  Calendar,
  CalendarRange,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
  ClipboardList,
  UserRound,
  Barcode,
  Layers3,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

const PAGE_SIZE = 100;

const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const pad = (number) => String(number).padStart(2, "0");

const formatDateOnly = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const Spinner = ({ cls = "w-4 h-4" }) => (
  <Loader2 className={`animate-spin ${cls}`} />
);

const SortIcon = ({ active, dir }) => (
  <span className="inline-flex flex-col ml-1">
    <ChevronUp
      className={`w-2.5 h-2.5 -mb-0.5 ${
        active && dir === "asc" ? "text-blue-500" : "text-slate-400"
      }`}
    />
    <ChevronDown
      className={`w-2.5 h-2.5 ${
        active && dir === "desc" ? "text-blue-500" : "text-slate-400"
      }`}
    />
  </span>
);

const StatusPill = ({ children, color = "slate" }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
        colors[color] || colors.slate
      }`}
    >
      {children}
    </span>
  );
};

const KpiCard = ({ icon: Icon, label, value, sub, colorCls }) => (
  <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5 hover:shadow-sm transition-shadow min-w-0">
    <div className={`${colorCls} p-2 rounded-lg shrink-0`}>
      <Icon className="w-4 h-4" />
    </div>

    <div className="min-w-0">
      <p className="text-base font-black text-slate-900 leading-tight">
        {formatNumber(value)}
      </p>
      <p className="text-[10px] text-slate-500 font-medium truncate">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 truncate">{sub}</p>}
    </div>
  </div>
);

const getCabinetKey = (row) =>
  `${row.PSNo ?? ""}|${row.DocNo ?? ""}|${row.CabinetSerial ?? ""}`;

const getComponentCount = (row) =>
  Number(row.ComponentCount ?? row.components?.length ?? 0);

/* ─────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────── */

const ScrapDetails = () => {
  /* Date range */
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeRange, setActiveRange] = useState(null);

  /* Data */
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCabinets, setTotalCabinets] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  /* UI */
  const [loading, setLoading] = useState(false);
  const [queried, setQueried] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({
    key: null,
    dir: "asc",
  });
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  /* ─────────────────────────────────────────────
     FETCH CABINET DATA + KPI SUMMARY
  ───────────────────────────────────────────── */

  const fetchData = useCallback(async (start, end, requestedPage = 1) => {
    setLoading(true);

    try {
      const params = {
        startDate: start,
        endDate: end,
        page: requestedPage,
        limit: PAGE_SIZE,
      };

      const [tableResult, summaryResult] = await Promise.allSettled([
        axios.get(`${baseURL}prod/scrap-details`, { params }),
        axios.get(`${baseURL}prod/scrap-details-summary`, {
          params: { startDate: start, endDate: end },
        }),
      ]);

      if (
        tableResult.status === "fulfilled" &&
        tableResult.value?.data?.success
      ) {
        const response = tableResult.value.data;
        const meta = response.meta || {};

        setRows(response.data || []);
        setTotalCabinets(Number(meta.total ?? meta.count ?? 0));
        setTotalPages(
          Number(
            meta.totalPages ??
              Math.ceil(Number(meta.total ?? meta.count ?? 0) / PAGE_SIZE),
          ),
        );
        setPage(Number(meta.page ?? requestedPage));
      } else {
        setRows([]);
        setTotalCabinets(0);
        setTotalPages(0);

        const error =
          tableResult.status === "rejected" ? tableResult.reason : null;

        toast.error(
          error?.response?.data?.message || "Failed to fetch scrap details.",
        );
      }

      if (
        summaryResult.status === "fulfilled" &&
        summaryResult.value?.data?.success
      ) {
        setKpis(summaryResult.value.data.data || null);
      } else {
        setKpis(null);

        if (summaryResult.status === "rejected") {
          toast.error(
            summaryResult.reason?.response?.data?.message ||
              "Failed to fetch scrap summary.",
          );
        }
      }
    } catch (error) {
      console.error("Scrap details fetch failed:", error);
      toast.error(
        error.response?.data?.message ||
          "Something went wrong while fetching scrap details.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /* ─────────────────────────────────────────────
     QUICK DATE RANGE
  ───────────────────────────────────────────── */

  const runQuickRange = (start, end, rangeKey) => {
    setStartDate(start);
    setEndDate(end);
    setActiveRange(rangeKey);
    setQueried(true);
    setSearch("");
    setSort({ key: null, dir: "asc" });
    setExpandedRows(new Set());
    setPage(1);

    fetchData(start, end, 1);
  };

  const handleToday = () => {
    const today = formatDateOnly(new Date());
    runQuickRange(today, today, "today");
  };

  const handleYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const date = formatDateOnly(yesterday);
    runQuickRange(date, date, "yesterday");
  };

  const handleMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    runQuickRange(formatDateOnly(firstDay), formatDateOnly(now), "month");
  };

  /* ─────────────────────────────────────────────
     EXPORT
  ───────────────────────────────────────────── */

  const fetchExportData = async () => {
    if (!startDate || !endDate) {
      toast.error("Select a date range first.");
      return [];
    }

    try {
      const response = await axios.get(`${baseURL}prod/export-scrap-details`, {
        params: {
          startDate,
          endDate,
        },
      });

      if (!response?.data?.success) {
        toast.error("Failed to prepare export data.");
        return [];
      }

      const cabinets = response.data.data || [];

      // Flatten nested component data for a useful spreadsheet export.
      // Cabinet details remain available on every component row.
      return cabinets.flatMap((cabinet) => {
        const components = cabinet.components?.length
          ? cabinet.components
          : [null];

        return components.map((component) => ({
          CabinetSerial: cabinet.CabinetSerial ?? "",
          PSNo: cabinet.PSNo ?? "",
          DocNo: cabinet.DocNo ?? "",
          ScrapReason: cabinet.Remark ?? "",
          UserID: cabinet.UserID ?? "",
          UserName: cabinet.UserName ?? "",
          ScrapDate: cabinet.ScrapDate ? formatDateTime(cabinet.ScrapDate) : "",
          LastStation: cabinet.LastStation ?? "",
          ProductionLine: cabinet.ProductionLineName ?? "",
          ComponentCount: getComponentCount(cabinet),
          ComponentSerial: component?.ComponentSerial ?? "",
          Material: component?.Material ?? "",
          MaterialCode: component?.MatCode ?? "",
          MaterialName: component?.MaterialName ?? "",
          Department: component?.Department ?? "",
          Route: component?.Route ?? "",
          ComponentProductionLine: component?.ProductionLineName ?? "",
          ComponentScrapDate: component?.ScrapDate
            ? formatDateTime(component.ScrapDate)
            : "",
        }));
      });
    } catch (error) {
      console.error("Scrap export failed:", error);
      toast.error(
        error.response?.data?.message || "Failed to fetch scrap export data.",
      );
      return [];
    }
  };

  /* ─────────────────────────────────────────────
     SEARCH
  ───────────────────────────────────────────── */

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return rows;

    return rows.filter((row) => {
      const cabinetValues = [
        row.CabinetSerial,
        row.PSNo,
        row.DocNo,
        row.Remark,
        row.UserID,
        row.UserName,
        row.LastStation,
        row.LineCode,
        row.ProductionLineName,
      ];

      const componentValues = (row.components || []).flatMap((component) => [
        component.ComponentSerial,
        component.Material,
        component.MatCode,
        component.MaterialName,
        component.Department,
        component.Route,
        component.ProductionLineName,
      ]);

      return [...cabinetValues, ...componentValues].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(query),
      );
    });
  }, [rows, search]);

  /* ─────────────────────────────────────────────
     SORT
  ───────────────────────────────────────────── */

  const displayRows = useMemo(() => {
    if (!sort.key) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      let first = a[sort.key];
      let second = b[sort.key];

      if (sort.key === "ComponentCount") {
        first = getComponentCount(a);
        second = getComponentCount(b);

        return sort.dir === "asc" ? first - second : second - first;
      }

      if (sort.key === "ScrapDate") {
        first = new Date(first || 0).getTime();
        second = new Date(second || 0).getTime();

        return sort.dir === "asc" ? first - second : second - first;
      }

      first = String(first ?? "");
      second = String(second ?? "");

      const comparison = first.localeCompare(second, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      return sort.dir === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, sort]);

  const toggleSort = (key) => {
    setSort((previous) =>
      previous.key === key
        ? {
            key,
            dir: previous.dir === "asc" ? "desc" : "asc",
          }
        : { key, dir: "asc" },
    );
  };

  /* ─────────────────────────────────────────────
     EXPAND / COLLAPSE COMPONENTS
  ───────────────────────────────────────────── */

  const toggleExpanded = (row) => {
    const key = getCabinetKey(row);

    setExpandedRows((previous) => {
      const next = new Set(previous);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  const expandAll = () => {
    setExpandedRows(new Set(displayRows.map(getCabinetKey)));
  };

  const collapseAll = () => {
    setExpandedRows(new Set());
  };

  /* ─────────────────────────────────────────────
     STYLES
  ───────────────────────────────────────────── */

  const rangeBtnCls = (active, base) =>
    `flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
      active
        ? `${base} text-white shadow-sm ring-2 ring-offset-1 ring-slate-300`
        : `${base} text-white shadow-sm opacity-90 hover:opacity-100`
    }`;

  const sortHeader = (label, key, align = "left") => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap cursor-pointer hover:bg-slate-200 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      <span
        className={`flex items-center ${
          align === "right" ? "justify-end" : ""
        }`}
      >
        {label}
        <SortIcon active={sort.key === key} dir={sort.dir} />
      </span>
    </th>
  );

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      {/* Fixed page header */}
      <div className="z-30 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3 shadow-sm shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
            Scrap Details
          </h1>
          <p className="text-[11px] text-slate-400">
            Cabinet-wise scrap records and{" "}
            <span className="text-blue-600 font-semibold">
              component traceability
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex flex-col items-center px-4 py-1.5 rounded-lg bg-blue-50 border border-blue-100 min-w-[100px]">
            <span className="text-xl font-bold font-mono text-blue-700">
              {formatNumber(totalCabinets)}
            </span>
            <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wide">
              Cabinets
            </span>
          </div>

          <div className="hidden md:flex flex-col items-center px-4 py-1.5 rounded-lg bg-violet-50 border border-violet-100 min-w-[100px]">
            <span className="text-xl font-bold font-mono text-violet-700">
              {formatNumber(kpis?.totalComponents ?? 0)}
            </span>
            <span className="text-[10px] text-violet-500 font-medium uppercase tracking-wide">
              Components
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-3 min-h-0">
        {/* Date range actions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleYesterday}
              disabled={loading}
              className={rangeBtnCls(
                activeRange === "yesterday",
                "bg-amber-500 hover:bg-amber-600",
              )}
            >
              {loading && activeRange === "yesterday" ? (
                <Spinner />
              ) : (
                <History className="w-4 h-4" />
              )}
              Yesterday
            </button>

            <button
              onClick={handleToday}
              disabled={loading}
              className={rangeBtnCls(
                activeRange === "today",
                "bg-emerald-600 hover:bg-emerald-700",
              )}
            >
              {loading && activeRange === "today" ? (
                <Spinner />
              ) : (
                <Calendar className="w-4 h-4" />
              )}
              Today
            </button>

            <button
              onClick={handleMonth}
              disabled={loading}
              className={rangeBtnCls(
                activeRange === "month",
                "bg-indigo-600 hover:bg-indigo-700",
              )}
            >
              {loading && activeRange === "month" ? (
                <Spinner />
              ) : (
                <CalendarRange className="w-4 h-4" />
              )}
              Month
            </button>

            {queried && rows.length > 0 && (
              <ExportButton
                fetchData={fetchExportData}
                filename="Scrap_Details"
              />
            )}

            {queried && startDate && endDate && (
              <span className="ml-1 text-[11px] text-slate-400">
                Showing:{" "}
                <span className="font-semibold text-slate-600">
                  {formatDate(startDate)} – {formatDate(endDate)}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* KPI cards */}
        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 shrink-0">
            <KpiCard
              icon={Package}
              label="Total Cabinets"
              value={kpis.totalCabinets ?? kpis.totalScrapRecords}
              colorCls="bg-blue-50 text-blue-500"
            />

            <KpiCard
              icon={Layers3}
              label="Total Components"
              value={kpis.totalComponents}
              colorCls="bg-violet-50 text-violet-500"
            />

            <KpiCard
              icon={Factory}
              label="Material Types"
              value={kpis.materialCount}
              colorCls="bg-emerald-50 text-emerald-500"
            />

            <KpiCard
              icon={CalendarDays}
              label="Scrap Days"
              value={kpis.scrapDays}
              colorCls="bg-amber-50 text-amber-500"
            />

            <KpiCard
              icon={TrendingUp}
              label="Average Cabinets / Day"
              value={Number(kpis.averageScrapPerDay || 0).toFixed(1)}
              colorCls="bg-rose-50 text-rose-500"
            />
          </div>
        )}

        {/* Main table panel */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[360px]">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 shrink-0 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                Cabinet Records
              </span>

              {queried && (
                <StatusPill color="blue">
                  {formatNumber(totalCabinets)} cabinets
                </StatusPill>
              )}

              {search && (
                <StatusPill color="amber">
                  {formatNumber(filteredRows.length)} matched
                </StatusPill>
              )}

              {displayRows.length > 0 && (
                <>
                  <button
                    onClick={expandAll}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-50"
                  >
                    Expand all
                  </button>
                  <button
                    onClick={collapseAll}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100"
                  >
                    Collapse all
                  </button>
                </>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search cabinet, component, user..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 w-56 sm:w-72"
              />

              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Table content */}
          <div className="flex-1 overflow-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full min-h-[220px] gap-2 text-blue-600">
                <Spinner cls="w-5 h-5" />
                <span className="text-sm">Loading scrap details...</span>
              </div>
            ) : (
              <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap w-10">
                      Open
                    </th>

                    <th className="px-3 py-2.5 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">
                      Sr. No.
                    </th>

                    {sortHeader("Cabinet Serial", "CabinetSerial")}
                    {sortHeader("PSNo", "PSNo")}
                    {sortHeader("DocNo", "DocNo")}
                    {sortHeader("Scrap Reason", "Remark")}
                    {sortHeader("Operator", "UserName")}
                    {sortHeader("Scrap Date", "ScrapDate")}
                    {sortHeader("Last Station", "LastStation")}
                    {sortHeader("Production Line", "ProductionLineName")}
                    {sortHeader("Components", "ComponentCount", "right")}
                  </tr>
                </thead>

                <tbody>
                  {displayRows.map((row, index) => {
                    const key = getCabinetKey(row);
                    const isExpanded = expandedRows.has(key);
                    const componentCount = getComponentCount(row);

                    return (
                      <>
                        {/* Main cabinet row */}
                        <tr
                          key={key}
                          onClick={() => toggleExpanded(row)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded
                              ? "bg-blue-50/70"
                              : "hover:bg-blue-50/60 even:bg-slate-50/40"
                          }`}
                        >
                          <td className="px-3 py-2 border-b border-slate-100">
                            <button
                              type="button"
                              aria-label={
                                isExpanded
                                  ? "Collapse component details"
                                  : "Expand component details"
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded(row);
                              }}
                              className={`w-7 h-7 inline-flex items-center justify-center rounded-lg border transition-colors ${
                                isExpanded
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600"
                              }`}
                            >
                              {isExpanded ? (
                                <ChevronDownIcon className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 text-slate-400 font-mono">
                            {(page - 1) * PAGE_SIZE + index + 1}
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                                <Package className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-semibold text-slate-800">
                                {row.CabinetSerial || "—"}
                              </span>
                            </div>
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 text-slate-600 font-mono whitespace-nowrap">
                            {row.PSNo || "—"}
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 text-slate-600 font-mono whitespace-nowrap">
                            {row.DocNo || "—"}
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 min-w-[180px] max-w-[260px]">
                            <span
                              title={row.Remark || ""}
                              className="block truncate text-slate-700"
                            >
                              {row.Remark || "—"}
                            </span>
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <UserRound className="w-3.5 h-3.5 text-slate-400" />
                              <span>{row.UserName || row.UserID || "—"}</span>
                            </div>
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 text-slate-500 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                              {formatDateTime(row.ScrapDate)}
                            </span>
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 text-slate-600 whitespace-nowrap">
                            {row.LastStation || "—"}
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <StatusPill color="violet">
                              {row.ProductionLineName || row.LineCode || "—"}
                            </StatusPill>
                          </td>

                          <td className="px-3 py-2 border-b border-slate-100 text-right">
                            <span className="inline-flex items-center justify-center min-w-8 px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-bold font-mono">
                              {formatNumber(componentCount)}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded component detail row */}
                        {isExpanded && (
                          <tr key={`${key}-components`}>
                            <td
                              colSpan={12}
                              className="p-0 border-b border-slate-200"
                            >
                              <div className="bg-slate-50 px-5 py-4">
                                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                                  <div className="flex items-start gap-2">
                                    <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                      <Barcode className="w-4 h-4" />
                                    </div>

                                    <div>
                                      <h3 className="text-sm font-bold text-slate-800">
                                        Component Details
                                      </h3>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        Cabinet:{" "}
                                        <span className="font-semibold text-slate-700">
                                          {row.CabinetSerial}
                                        </span>
                                        <span className="mx-1.5 text-slate-300">
                                          ·
                                        </span>
                                        PSNo:{" "}
                                        <span className="font-mono text-slate-700">
                                          {row.PSNo}
                                        </span>
                                      </p>
                                    </div>
                                  </div>

                                  <StatusPill color="blue">
                                    {formatNumber(componentCount)} components
                                  </StatusPill>
                                </div>

                                {row.components?.length > 0 ? (
                                  <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                                    <table className="min-w-full text-xs text-left border-separate border-spacing-0">
                                      <thead>
                                        <tr className="bg-slate-100">
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Sr. No.
                                          </th>
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Component Serial
                                          </th>
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Material Code
                                          </th>
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Material Name
                                          </th>
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Department
                                          </th>
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Route
                                          </th>
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Production Line
                                          </th>
                                          <th className="px-3 py-2.5 border-b border-slate-200 font-semibold text-slate-600 whitespace-nowrap">
                                            Scrap Date
                                          </th>
                                        </tr>
                                      </thead>

                                      <tbody>
                                        {row.components.map(
                                          (component, componentIndex) => (
                                            <tr
                                              key={`${component.ComponentSerial}-${componentIndex}`}
                                              className="hover:bg-blue-50/60 even:bg-slate-50/50 transition-colors"
                                            >
                                              <td className="px-3 py-2.5 border-b border-slate-100 text-slate-400 font-mono">
                                                {componentIndex + 1}
                                              </td>

                                              <td className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">
                                                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                                                  <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                  {component.ComponentSerial ||
                                                    "—"}
                                                </span>
                                              </td>

                                              <td className="px-3 py-2.5 border-b border-slate-100 font-mono text-slate-600 whitespace-nowrap">
                                                {component.MatCode ||
                                                  component.Material ||
                                                  "—"}
                                              </td>

                                              <td className="px-3 py-2.5 border-b border-slate-100 text-slate-700 whitespace-nowrap">
                                                {component.MaterialName || "—"}
                                              </td>

                                              <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 whitespace-nowrap">
                                                {component.Department || "—"}
                                              </td>

                                              <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 whitespace-nowrap">
                                                {component.Route || "—"}
                                              </td>

                                              <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 whitespace-nowrap">
                                                {component.ProductionLineName ||
                                                  component.LineCode ||
                                                  "—"}
                                              </td>

                                              <td className="px-3 py-2.5 border-b border-slate-100 text-slate-500 whitespace-nowrap">
                                                {formatDateTime(
                                                  component.ScrapDate,
                                                )}
                                              </td>
                                            </tr>
                                          ),
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-slate-400">
                                    <PackageOpen className="w-8 h-8 opacity-50" />
                                    <div>
                                      <p className="text-xs font-semibold text-slate-600">
                                        No component records found
                                      </p>
                                      <p className="text-[11px] mt-1">
                                        No component serials are available for
                                        this cabinet.
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}

                  {!loading && queried && displayRows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <PackageOpen
                            className="w-12 h-12 opacity-20"
                            strokeWidth={1.2}
                          />
                          <p className="text-sm">
                            {search
                              ? `No scrap records match "${search}".`
                              : "No scrap data found for the selected range."}
                          </p>
                          {search && (
                            <button
                              onClick={() => setSearch("")}
                              className="text-blue-500 text-xs font-semibold hover:underline"
                            >
                              Clear search
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!queried && (
                    <tr>
                      <td colSpan={12} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <BarChart3
                            className="w-12 h-12 opacity-20"
                            strokeWidth={1.2}
                          />
                          <p className="text-sm">
                            Select{" "}
                            <span className="text-blue-600 font-semibold">
                              Yesterday, Today, or Month
                            </span>{" "}
                            to view scrap records.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {queried && !loading && totalCabinets > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-100 bg-white shrink-0 flex-wrap">
              <p className="text-[11px] text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {(page - 1) * PAGE_SIZE + (rows.length ? 1 : 0)}
                </span>
                {" – "}
                <span className="font-semibold text-slate-700">
                  {(page - 1) * PAGE_SIZE + rows.length}
                </span>
                {" of "}
                <span className="font-semibold text-slate-700">
                  {formatNumber(totalCabinets)}
                </span>{" "}
                cabinets
              </p>

              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    const nextPage = page - 1;
                    setExpandedRows(new Set());
                    fetchData(startDate, endDate, nextPage);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                <span className="text-[11px] font-medium text-slate-500 px-1">
                  Page {page} of {Math.max(1, totalPages)}
                </span>

                <button
                  disabled={page >= totalPages || loading}
                  onClick={() => {
                    const nextPage = page + 1;
                    setExpandedRows(new Set());
                    fetchData(startDate, endDate, nextPage);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScrapDetails;
