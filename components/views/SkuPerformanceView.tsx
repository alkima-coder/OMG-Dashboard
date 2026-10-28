import React, { useState, useMemo } from "react";
import { formatIDR, formatNum } from "@/lib/formatters";
import { aggregateSkuData } from "./SkuPerformanceModal";

interface SkuPerformanceViewProps {
  ctxCurData: any[];
  isDarkMode: boolean;
  filters: any;
  onFilterChange: (k: string, v: string) => void;
  brandOptions: string[];
}

type SortField =
  | "pid"
  | "skuName"
  | "platform"
  | "expense"
  | "orders"
  | "gmv"
  | "roas"
  | "cpa";

export default function SkuPerformanceView({
  ctxCurData,
  isDarkMode,
  filters,
  onFilterChange,
  brandOptions,
}: SkuPerformanceViewProps) {
  const [platformFilter, setPlatformFilter] = useState("All");
  const [adTypeFilter, setAdTypeFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("gmv");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const skuList = useMemo(() => aggregateSkuData(ctxCurData), [ctxCurData]);

  // Extract unique Ad Types available dynamically
  const adTypeOptions = useMemo(() => {
    const types = new Set<string>();
    skuList.forEach((item) => {
      if (item.adType && item.adType.trim() !== "") {
        types.add(item.adType.trim());
      }
    });
    return ["All", ...Array.from(types).sort()];
  }, [skuList]);

  // Filter SKUs
  const filtered = useMemo(() => {
    let list = skuList;

    if (platformFilter !== "All") {
      const match = platformFilter.toLowerCase();
      list = list.filter((item) => item.platform.toLowerCase().includes(match));
    }

    if (adTypeFilter !== "All") {
      const match = adTypeFilter.toLowerCase();
      list = list.filter((item) => item.adType.toLowerCase() === match);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (item) =>
          item.pid.toLowerCase().includes(q) ||
          item.skuName.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      if (
        sortField === "pid" ||
        sortField === "skuName" ||
        sortField === "platform"
      ) {
        const va = String(a[sortField] || "").toLowerCase();
        const vb = String(b[sortField] || "").toLowerCase();
        const diff = va.localeCompare(vb);
        return sortAsc ? diff : -diff;
      }
      const diff = (a[sortField] as number) - (b[sortField] as number);
      return sortAsc ? diff : -diff;
    });
  }, [skuList, platformFilter, adTypeFilter, searchTerm, sortField, sortAsc]);

  const totalGmv = useMemo(
    () => filtered.reduce((acc, i) => acc + i.gmv, 0),
    [filtered],
  );
  const totalExpense = useMemo(
    () => filtered.reduce((acc, i) => acc + i.expense, 0),
    [filtered],
  );
  const totalOrders = useMemo(
    () => filtered.reduce((acc, i) => acc + i.orders, 0),
    [filtered],
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(
        field === "pid" || field === "skuName" || field === "platform",
      );
    }
  };

  const sortArrow = (field: SortField) =>
    sortField === field ? (sortAsc ? " ▲" : " ▼") : "";

  // --- EXCEL EXPORT (uses the SheetJS "xlsx" package — run `npm install xlsx`
  // if it isn't already a dependency) — exports exactly what's currently
  // filtered/sorted on screen, not the whole unfiltered dataset.
  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const exportRows = filtered.map((item, idx) => ({
      "#": idx + 1,
      PID: item.pid,
      "SKU Name": item.skuName,
      Platform: item.platform || "-",
      Spend: item.expense,
      Orders: item.orders,
      GMV: item.gmv,
      ROAS: Number(item.roas.toFixed(2)),
      CPA: item.orders > 0 ? Math.round(item.cpa) : 0,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = [
      { wch: 4 },
      { wch: 18 },
      { wch: 40 },
      { wch: 12 },
      { wch: 16 },
      { wch: 10 },
      { wch: 16 },
      { wch: 8 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PID & SKU Performance");
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `PID_SKU_Performance_${dateStr}.xlsx`);
  };

  // Shared dropdown class with full light/dark contrast
  const selectStyle = `py-2 px-3 rounded-md text-xs font-bold outline-none border transition-all cursor-pointer ${
    isDarkMode
      ? "bg-[#111827] border-slate-700 text-slate-100 hover:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
      : "bg-slate-50 border-slate-300 text-slate-800 hover:border-indigo-500 focus:ring-2 focus:ring-indigo-500 shadow-sm"
  }`;

  return (
    <div className="w-full space-y-5">
      {/* Top Filter & Search Bar */}
      <div
        className={`p-5 rounded-md border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isDarkMode
            ? "bg-[#0f172a] border-slate-800"
            : "bg-white border-slate-200"
        }`}>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Brand Filter */}
          <div>
            <label
              className={`text-[10px] font-extrabold block mb-1 uppercase tracking-wider ${
                isDarkMode ? "text-slate-400" : "text-slate-600"
              }`}>
              Brand
            </label>
            <select
              value={filters.brand}
              onChange={(e) => onFilterChange("brand", e.target.value)}
              className={selectStyle}>
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Platform Filter */}
          <div>
            <label
              className={`text-[10px] font-extrabold block mb-1 uppercase tracking-wider ${
                isDarkMode ? "text-slate-400" : "text-slate-600"
              }`}>
              Platform
            </label>
            <select
              value={platformFilter}
              onChange={(e) => {
                setPlatformFilter(e.target.value);
                setPage(1);
              }}
              className={selectStyle}>
              <option value="All">All Platforms</option>
              <option value="Shopee">Shopee</option>
              <option value="TikTok">TikTok</option>
            </select>
          </div>

          {/* Ad Type Filter */}
          <div>
            <label
              className={`text-[10px] font-extrabold block mb-1 uppercase tracking-wider ${
                isDarkMode ? "text-slate-400" : "text-slate-600"
              }`}>
              Ad Type
            </label>
            <select
              value={adTypeFilter}
              onChange={(e) => {
                setAdTypeFilter(e.target.value);
                setPage(1);
              }}
              className={selectStyle}>
              {adTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-end gap-3 w-full md:w-auto">
          {/* Search Input */}
          <div className="w-full md:w-80">
            <label
              className={`text-[10px] font-extrabold block mb-1 uppercase tracking-wider ${
                isDarkMode ? "text-slate-400" : "text-slate-600"
              }`}>
              Search SKU / PID
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search PID or Product Name..."
              className={`w-full py-2 px-3.5 rounded-md text-xs font-semibold border outline-none transition-all shadow-sm ${
                isDarkMode
                  ? "bg-[#111827] border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500"
                  : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white"
              }`}
            />
          </div>

          {/* Download Excel Button */}
          <button
            onClick={handleExportExcel}
            title="Download data (sesuai filter & sort saat ini) sebagai Excel"
            className={`shrink-0 inline-flex items-center gap-2 py-2 px-4 rounded-md text-xs font-bold border shadow-sm transition-all ${
              isDarkMode
                ? "bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500"
                : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
            }`}>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
              />
            </svg>
            Download Excel
          </button>
        </div>
      </div>

      {/* Summary KPI Cards with High Contrast */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={`p-4 rounded-md border shadow-sm ${
            isDarkMode
              ? "bg-[#0f172a] border-slate-800"
              : "bg-white border-slate-200"
          }`}>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider block mb-1 ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}>
            Total SKU GMV
          </span>
          <h3 className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatIDR(totalGmv)}
          </h3>
        </div>

        <div
          className={`p-4 rounded-md border shadow-sm ${
            isDarkMode
              ? "bg-[#0f172a] border-slate-800"
              : "bg-white border-slate-200"
          }`}>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider block mb-1 ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}>
            Total Ad Spend
          </span>
          <h3 className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatIDR(totalExpense)}
          </h3>
        </div>

        <div
          className={`p-4 rounded-md border shadow-sm ${
            isDarkMode
              ? "bg-[#0f172a] border-slate-800"
              : "bg-white border-slate-200"
          }`}>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider block mb-1 ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}>
            Total Orders
          </span>
          <h3
            className={`text-lg sm:text-xl font-bold ${
              isDarkMode ? "text-white" : "text-slate-900"
            }`}>
            {formatNum(totalOrders)}
          </h3>
        </div>
      </div>

      {/* Main Table */}
      <div
        className={`rounded-md border shadow-sm overflow-hidden ${
          isDarkMode
            ? "bg-[#0f172a] border-slate-800"
            : "bg-white border-slate-200"
        }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead>
              <tr className="border-b border-slate-700 text-[11px] font-black uppercase tracking-wider bg-[#090d16] text-white">
                <th className="py-4 px-4 w-14 text-center">#</th>
                <th
                  onClick={() => toggleSort("pid")}
                  className="py-4 px-4 w-40 cursor-pointer hover:text-blue-400 select-none">
                  PID{sortArrow("pid")}
                </th>
                <th
                  onClick={() => toggleSort("skuName")}
                  className="py-4 px-4 min-w-[320px] cursor-pointer hover:text-blue-400 select-none">
                  SKU Name{sortArrow("skuName")}
                </th>
                <th
                  onClick={() => toggleSort("platform")}
                  className="py-4 px-4 w-28 cursor-pointer hover:text-blue-400 select-none">
                  Platform{sortArrow("platform")}
                </th>
                <th
                  onClick={() => toggleSort("expense")}
                  className="py-4 px-4 text-right cursor-pointer hover:text-blue-400 select-none">
                  Spend{sortArrow("expense")}
                </th>
                <th
                  onClick={() => toggleSort("orders")}
                  className="py-4 px-4 text-right cursor-pointer hover:text-blue-400 select-none">
                  Orders{sortArrow("orders")}
                </th>
                <th
                  onClick={() => toggleSort("gmv")}
                  className="py-4 px-4 text-right cursor-pointer hover:text-blue-400 select-none">
                  GMV (Highest){sortArrow("gmv")}
                </th>
                <th
                  onClick={() => toggleSort("roas")}
                  className="py-4 px-4 text-right cursor-pointer hover:text-blue-400 select-none">
                  ROAS{sortArrow("roas")}
                </th>
                <th
                  onClick={() => toggleSort("cpa")}
                  className="py-4 px-4 text-right cursor-pointer hover:text-blue-400 select-none">
                  CPA{sortArrow("cpa")}
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-slate-200"}`}>
              {filtered
                .slice((page - 1) * PER_PAGE, page * PER_PAGE)
                .map((item, idx) => (
                  <tr
                    key={`${item.pid}-${idx}`}
                    className={`transition-colors ${
                      isDarkMode
                        ? "hover:bg-blue-900/30 text-slate-200"
                        : "hover:bg-blue-50 text-slate-800"
                    }`}>
                    <td
                      className={`py-3.5 px-4 text-center font-mono ${
                        isDarkMode ? "text-slate-400" : "text-slate-500"
                      }`}>
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {item.pid}
                    </td>
                    <td
                      className={`py-3.5 px-4 font-semibold max-w-md truncate ${
                        isDarkMode ? "text-slate-200" : "text-slate-900"
                      }`}
                      title={item.skuName}>
                      {item.skuName}
                    </td>
                    <td
                      className={`py-3.5 px-4 font-bold ${
                        isDarkMode ? "text-slate-300" : "text-slate-800"
                      }`}>
                      {item.platform || "-"}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-mono font-bold ${
                        isDarkMode ? "text-slate-200" : "text-slate-900"
                      }`}>
                      {formatIDR(item.expense)}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-mono font-bold ${
                        isDarkMode ? "text-slate-200" : "text-slate-900"
                      }`}>
                      {formatNum(item.orders)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                      {formatIDR(item.gmv)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                      {item.roas.toFixed(2)}x
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-mono font-semibold ${
                        isDarkMode ? "text-slate-400" : "text-slate-600"
                      }`}>
                      {item.orders > 0 ? formatIDR(item.cpa) : "-"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        {filtered.length > PER_PAGE && (
          <div
            className={`px-6 py-4 border-t flex items-center justify-between text-xs font-bold ${
              isDarkMode
                ? "border-slate-800 bg-[#090d16] text-slate-400"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}>
            <span>
              Page {page} of {Math.ceil(filtered.length / PER_PAGE)} (
              {filtered.length} SKUs total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className={`px-3 py-1.5 rounded-md border font-bold disabled:opacity-30 transition-all ${
                  isDarkMode
                    ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                    : "border-slate-300 text-slate-700 bg-white hover:bg-slate-100 shadow-sm"
                }`}>
                Previous
              </button>
              <button
                disabled={page === Math.ceil(filtered.length / PER_PAGE)}
                onClick={() => setPage((p) => p + 1)}
                className={`px-3 py-1.5 rounded-md border font-bold disabled:opacity-30 transition-all ${
                  isDarkMode
                    ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                    : "border-slate-300 text-slate-700 bg-white hover:bg-slate-100 shadow-sm"
                }`}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
