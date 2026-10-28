import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { formatIDR, formatNum, parseNum } from "@/lib/formatters";

export interface SkuItem {
  pid: string;
  skuName: string;
  platform: string;
  brand: string;
  adType: string;
  expense: number;
  gmv: number;
  orders: number;
  roas: number;
  cpa: number;
}

interface SkuPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  title?: string;
  subtitle?: string;
  isDarkMode: boolean;
}

export function aggregateSkuData(rows: any[]): SkuItem[] {
  const getCol = (row: any, ...keys: string[]) => {
    for (const k of keys) {
      const target = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      const found = Object.keys(row).find(
        (key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === target,
      );
      if (
        found !== undefined &&
        row[found] !== undefined &&
        row[found] !== ""
      ) {
        return row[found];
      }
    }
    return "";
  };

  const map = new Map<string, SkuItem>();

  rows.forEach((r) => {
    const pid = String(
      getCol(r, "PID / CID", "PID/CID", "PID", "pid", "CID", "Product ID") ||
        "",
    ).trim();
    const skuName = String(
      getCol(r, "SKU Name", "SKU", "Ad Name", "Product Name") || "",
    ).trim();

    if (!pid && !skuName) return;

    const key = `${pid}_||_${skuName}`;
    const exp = parseNum(
      getCol(r, "Cost", "Spend", "Spent", "Ad Spend", "Biaya", "Expense"),
    );
    const gmv = parseNum(r["GMV"]);
    const orders = parseNum(
      r["Items Sold"] ||
        r["Item sold"] ||
        r["items_sold"] ||
        r["Orders"] ||
        r["Order"],
    );
    const platform = String(r["Platform"] || "").trim();
    const brand = String(r["Brand fx"] || r["Brand"] || "").trim();
    const adType = String(r["Live Type"] || "").trim();

    if (!map.has(key)) {
      map.set(key, {
        pid: pid || "-",
        skuName: skuName || "Unnamed Product",
        platform,
        brand,
        adType,
        expense: exp,
        gmv,
        orders,
        roas: exp > 0 ? gmv / exp : 0,
        cpa: orders > 0 ? exp / orders : 0,
      });
    } else {
      const item = map.get(key)!;
      item.expense += exp;
      item.gmv += gmv;
      item.orders += orders;
      item.roas = item.expense > 0 ? item.gmv / item.expense : 0;
      item.cpa = item.orders > 0 ? item.expense / item.orders : 0;
    }
  });

  return Array.from(map.values()).sort((a, b) => b.gmv - a.gmv);
}

export const truncatePid = (pid: string, len = 7) => {
  if (!pid) return "-";
  return pid.length > len ? `${pid.slice(0, len)}...` : pid;
};

export default function SkuPerformanceModal({
  isOpen,
  onClose,
  rows,
  title = "PID & SKU Performance Breakdown",
  subtitle,
  isDarkMode,
}: SkuPerformanceModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<
    "pid" | "skuName" | "gmv" | "expense" | "orders" | "roas" | "cpa"
  >("gmv");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<SkuItem | null>(null);
  const PER_PAGE = 10;

  // Dismiss on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isOpen) return;
      if (detailItem) {
        setDetailItem(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, detailItem]);

  const skuList = useMemo(() => aggregateSkuData(rows), [rows]);

  const filtered = useMemo(() => {
    let list = skuList;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (item) =>
          item.pid.toLowerCase().includes(q) ||
          item.skuName.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      if (sortField === "pid" || sortField === "skuName") {
        const diff = a[sortField].localeCompare(b[sortField]);
        return sortAsc ? diff : -diff;
      }
      const diff = a[sortField] - b[sortField];
      return sortAsc ? diff : -diff;
    });
  }, [skuList, searchTerm, sortField, sortAsc]);

  const totalGmv = useMemo(
    () => skuList.reduce((acc, i) => acc + i.gmv, 0),
    [skuList],
  );
  const totalExpense = useMemo(
    () => skuList.reduce((acc, i) => acc + i.expense, 0),
    [skuList],
  );
  const totalOrders = useMemo(
    () => skuList.reduce((acc, i) => acc + i.orders, 0),
    [skuList],
  );

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  // Rendered through a Portal straight into document.body, so this modal
  // (and the nested "Product Detail" popup inside it) always centers on the
  // real browser viewport — even if some ancestor elsewhere on the page has
  // a lingering CSS transform (e.g. left over from a fade/scale animation
  // with animation-fill-mode: forwards), which would otherwise turn "fixed"
  // positioning into "centered on that ancestor" instead of "centered on
  // screen", making the popup appear far from where it was opened.
  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[250] bg-slate-950/75 backdrop-blur-sm grid place-items-center p-3 sm:p-6 overflow-hidden transition-all duration-300 animate-[fadeIn_0.2s_ease-out]">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes modalPop {
          0% { opacity: 0; transform: scale(0.96) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-animate-scale {
          animation: modalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `,
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-6xl max-h-[88vh] rounded-md border shadow-2xl flex flex-col overflow-hidden modal-animate-scale ${
          isDarkMode
            ? "bg-[#0b1120] border-slate-800 text-slate-100"
            : "bg-white border-slate-300 text-slate-900 shadow-slate-400/40"
        }`}>
        {/* Modal Header */}
        <div
          className={`px-6 py-4.5 border-b flex items-center justify-between shrink-0 ${
            isDarkMode
              ? "border-slate-800 bg-[#0f172a]"
              : "border-slate-200 bg-slate-50"
          }`}>
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-md shadow-md">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                </svg>
              </div>
              <h3
                className={`text-base sm:text-lg font-black tracking-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                {title}
              </h3>
            </div>
            {subtitle && (
              <p
                className={`text-xs mt-1 font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                {subtitle}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className={`p-2 rounded-md border transition-colors ${
              isDarkMode
                ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Modal KPI Strip & Search */}
        <div
          className={`px-6 py-3 border-b flex flex-wrap gap-4 items-center justify-between text-xs font-bold ${
            isDarkMode
              ? "border-slate-800 bg-slate-900/60 text-slate-300"
              : "border-slate-200 bg-slate-100/70 text-slate-700"
          }`}>
          <div className="flex flex-wrap items-center gap-5 sm:gap-7">
            <span>
              SKUs:{" "}
              <b className="text-indigo-600 dark:text-indigo-400 font-mono text-sm">
                {skuList.length}
              </b>
            </span>
            <span>
              GMV:{" "}
              <b className="text-emerald-700 dark:text-emerald-400 font-mono text-sm">
                {formatIDR(totalGmv)}
              </b>
            </span>
            <span>
              Spend:{" "}
              <b
                className={`${isDarkMode ? "text-slate-200" : "text-slate-900"} font-mono text-sm`}>
                {formatIDR(totalExpense)}
              </b>
            </span>
            <span>
              Orders:{" "}
              <b className="text-amber-700 dark:text-amber-400 font-mono text-sm">
                {formatNum(totalOrders)}
              </b>
            </span>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Filter PID or SKU Name..."
              className={`w-full py-2 px-3 rounded-md text-xs font-semibold border outline-none shadow-sm transition-all ${
                isDarkMode
                  ? "bg-[#111827] border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500"
                  : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-500"
              }`}
            />
          </div>
        </div>

        {/* SKU Data Table */}
        <div className="overflow-auto flex-1 p-4 sm:p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm font-bold">
              No PID or SKU records found for this specific date / dimension.
            </div>
          ) : (
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead>
                <tr
                  className={`border-b text-[11px] font-black uppercase tracking-wider text-white ${
                    isDarkMode
                      ? "border-slate-800 bg-slate-900/90"
                      : "border-slate-300 bg-slate-700"
                  }`}>
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th
                    onClick={() => {
                      setSortField("pid");
                      setSortAsc(sortField === "pid" ? !sortAsc : true);
                    }}
                    className="py-3 px-4 w-36 cursor-pointer hover:text-indigo-300">
                    PID {sortField === "pid" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th
                    onClick={() => {
                      setSortField("skuName");
                      setSortAsc(sortField === "skuName" ? !sortAsc : true);
                    }}
                    className="py-3 px-4 min-w-[280px] cursor-pointer hover:text-indigo-300">
                    SKU Name{" "}
                    {sortField === "skuName" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th
                    onClick={() => {
                      setSortField("expense");
                      setSortAsc(sortField === "expense" ? !sortAsc : false);
                    }}
                    className="py-3 px-4 text-right cursor-pointer hover:text-indigo-300">
                    Spend {sortField === "expense" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th
                    onClick={() => {
                      setSortField("orders");
                      setSortAsc(sortField === "orders" ? !sortAsc : false);
                    }}
                    className="py-3 px-4 text-right cursor-pointer hover:text-indigo-300">
                    Orders {sortField === "orders" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th
                    onClick={() => {
                      setSortField("gmv");
                      setSortAsc(sortField === "gmv" ? !sortAsc : false);
                    }}
                    className="py-3 px-4 text-right cursor-pointer text-emerald-300 font-extrabold">
                    GMV (Ranked){" "}
                    {sortField === "gmv" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th
                    onClick={() => {
                      setSortField("roas");
                      setSortAsc(sortField === "roas" ? !sortAsc : false);
                    }}
                    className="py-3 px-4 text-right cursor-pointer hover:text-indigo-300">
                    ROAS {sortField === "roas" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th
                    onClick={() => {
                      setSortField("cpa");
                      setSortAsc(sortField === "cpa" ? !sortAsc : true);
                    }}
                    className="py-3 px-4 text-right cursor-pointer hover:text-indigo-300">
                    CPA {sortField === "cpa" ? (sortAsc ? "▲" : "▼") : ""}
                  </th>
                  <th className="py-3 px-4 text-center">Detail</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y ${isDarkMode ? "divide-slate-800/80" : "divide-slate-200"}`}>
                {filtered
                  .slice((page - 1) * PER_PAGE, page * PER_PAGE)
                  .map((item, idx) => (
                    <tr
                      key={`${item.pid}-${idx}`}
                      className={`transition-colors ${
                        isDarkMode
                          ? "hover:bg-slate-800/40 text-slate-200"
                          : "hover:bg-indigo-50/50 text-slate-800"
                      }`}>
                      <td className="py-3 px-3 text-center text-slate-400 font-mono">
                        {(page - 1) * PER_PAGE + idx + 1}
                      </td>
                      <td
                        className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400"
                        title={item.pid}>
                        {truncatePid(item.pid)}
                      </td>
                      <td
                        className="py-3 px-4 font-semibold max-w-sm truncate"
                        title={item.skuName}>
                        {item.skuName}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-900"}`}>
                        {formatIDR(item.expense)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-800"}`}>
                        {formatNum(item.orders)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 dark:text-emerald-400">
                        {formatIDR(item.gmv)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-300">
                        {item.roas.toFixed(2)}x
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-medium ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                        {item.orders > 0 ? formatIDR(item.cpa) : "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setDetailItem(item)}
                          title="Lihat detail produk"
                          aria-label="Lihat detail produk"
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                            isDarkMode
                              ? "border-slate-700 text-indigo-300 hover:bg-indigo-500/10 hover:border-indigo-500"
                              : "border-slate-300 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400"
                          }`}>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                          </svg>
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Pagination */}
        {filtered.length > PER_PAGE && (
          <div
            className={`px-6 py-3 border-t flex items-center justify-between text-xs font-bold shrink-0 ${
              isDarkMode
                ? "border-slate-800 bg-[#0f172a]"
                : "border-slate-200 bg-slate-50"
            }`}>
            <span className={isDarkMode ? "text-slate-400" : "text-slate-600"}>
              Showing {(page - 1) * PER_PAGE + 1} -{" "}
              {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}{" "}
              SKUs
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

      {/* PRODUCT DETAIL POPUP */}
      {detailItem && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setDetailItem(null);
          }}
          className="fixed inset-0 z-[280] bg-slate-950/60 backdrop-blur-sm grid place-items-center p-4 animate-[fadeIn_0.15s_ease-out]">
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-md border shadow-2xl overflow-hidden modal-animate-scale ${
              isDarkMode
                ? "bg-[#0b1120] border-slate-800 text-slate-100"
                : "bg-white border-slate-300 text-slate-900 shadow-slate-400/40"
            }`}>
            <div
              className={`px-6 py-4 border-b flex items-start justify-between gap-4 ${
                isDarkMode
                  ? "border-slate-800 bg-[#0f172a]"
                  : "border-slate-200 bg-slate-50"
              }`}>
              <div className="min-w-0">
                <p
                  className={`text-[11px] font-black uppercase tracking-wider ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  Product Detail
                </p>
                <h4
                  className={`text-sm font-bold mt-0.5 break-words ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  {detailItem.skuName}
                </h4>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                aria-label="Close detail"
                className={`p-2 rounded-md border transition-colors shrink-0 ${
                  isDarkMode
                    ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                    : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.2"
                    d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
              <div className="col-span-2">
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  PID / CID
                </p>
                <p
                  className={`font-mono font-bold text-sm break-all ${isDarkMode ? "text-indigo-300" : "text-indigo-600"}`}>
                  {detailItem.pid}
                </p>
              </div>

              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  Platform
                </p>
                <p className="font-semibold">{detailItem.platform || "-"}</p>
              </div>
              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  Brand
                </p>
                <p className="font-semibold">{detailItem.brand || "-"}</p>
              </div>
              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  Account Type
                </p>
                <p className="font-semibold">{detailItem.adType || "-"}</p>
              </div>
              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  Orders
                </p>
                <p className="font-mono font-bold">
                  {formatNum(detailItem.orders)}
                </p>
              </div>
              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  Spend
                </p>
                <p className="font-mono font-bold">
                  {formatIDR(detailItem.expense)}
                </p>
              </div>
              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  GMV
                </p>
                <p className="font-mono font-black text-emerald-700 dark:text-emerald-400">
                  {formatIDR(detailItem.gmv)}
                </p>
              </div>
              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  ROAS
                </p>
                <p className="font-mono font-bold text-indigo-600 dark:text-indigo-300">
                  {detailItem.roas.toFixed(2)}x
                </p>
              </div>
              <div>
                <p
                  className={`font-black uppercase tracking-wider text-[10px] mb-1 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                  CPA
                </p>
                <p className="font-mono font-bold">
                  {detailItem.orders > 0 ? formatIDR(detailItem.cpa) : "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
