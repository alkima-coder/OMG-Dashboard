import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  formatCurrency,
  formatNum,
  formatPct,
  parseNum,
} from "@/lib/formatters";

export interface AccountItem {
  account: string; // holds the Live Type name — this modal now groups by Live Type, not by individual Account
  brand: string;
  platform: string;
  adType: string;
  accountsCount: number; // distinct Accounts rolled up into this Live Type bucket
  expense: number;
  gmv: number;
  orders: number;
  views: number;
  views10s: number;
  roas: number; // GMV / Spend
  cr: number; // Orders / Live Views (0..1)
  viewRetention: number; // Live Views 10s / Live Views (0..1)
  cpa: number;
}

interface AccountPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  title?: string;
  subtitle?: string;
  isDarkMode: boolean;
  currencySymbol?: string; // e.g. "Rp" (default) or "RM" for the Malaysia region toggle
}

// Tolerant column lookup, same convention used across the rest of the Commerce Tracker.
const getCol = (row: any, ...keys: string[]) => {
  for (const k of keys) {
    const target = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = Object.keys(row).find(
      (key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === target,
    );
    if (found !== undefined && row[found] !== undefined && row[found] !== "") {
      return row[found];
    }
  }
  return "";
};

// Aggregates raw ad rows by "Live Type" (not by individual Account) — this
// modal shows a Live Type breakdown for whatever Platform / Live Type scope
// it was opened with, with the number of distinct Accounts rolled into each
// Live Type bucket shown as its own column.
export function aggregateAccountData(rows: any[]): AccountItem[] {
  const map = new Map<string, AccountItem>();
  const accountsByGroup = new Map<string, Set<string>>();

  rows.forEach((r) => {
    const liveType =
      String(getCol(r, "Live Type") || "Unspecified").trim() || "Unspecified";

    const exp = parseNum(r["Cost"]);
    const gmv = parseNum(r["GMV"]);
    const orders = parseNum(
      r["Items Sold"] ||
        r["Item sold"] ||
        r["items_sold"] ||
        r["Orders"] ||
        r["Order"],
    );
    const views = parseNum(getCol(r, "Live Views"));
    const views10s = parseNum(getCol(r, "Live Views 10s"));
    const platform = String(r["Platform"] || "").trim();
    const account = String(getCol(r, "Account") || "").trim();

    if (!accountsByGroup.has(liveType))
      accountsByGroup.set(liveType, new Set());
    if (account) accountsByGroup.get(liveType)!.add(account);

    if (!map.has(liveType)) {
      map.set(liveType, {
        account: liveType,
        brand: "",
        platform,
        adType: liveType,
        accountsCount: 0,
        expense: exp,
        gmv,
        orders,
        views,
        views10s,
        roas: exp > 0 ? gmv / exp : 0,
        cr: views > 0 ? orders / views : 0,
        viewRetention: views > 0 ? views10s / views : 0,
        cpa: orders > 0 ? exp / orders : 0,
      });
    } else {
      const item = map.get(liveType)!;
      item.expense += exp;
      item.gmv += gmv;
      item.orders += orders;
      item.views += views;
      item.views10s += views10s;
      item.roas = item.expense > 0 ? item.gmv / item.expense : 0;
      item.cr = item.views > 0 ? item.orders / item.views : 0;
      item.viewRetention = item.views > 0 ? item.views10s / item.views : 0;
      item.cpa = item.orders > 0 ? item.expense / item.orders : 0;
    }
  });

  const result = Array.from(map.values());
  result.forEach((item) => {
    item.accountsCount = accountsByGroup.get(item.account)?.size || 0;
  });
  return result.sort((a, b) => b.gmv - a.gmv);
}

export interface LiveTypeAccountRow {
  account: string;
  brand: string;
  expense: number;
  gmv: number;
  views: number;
  orders: number;
  roas: number;
  cr: number;
  viewRetention: number;
}

// Breaks a single Live Type bucket back down into the individual Accounts
// that make it up — shown in the "Live Type Detail" popup so the aggregate
// number can always be traced back to who's actually driving it.
function aggregateAccountsForLiveType(
  rows: any[],
  liveType: string,
): LiveTypeAccountRow[] {
  const map = new Map<string, LiveTypeAccountRow>();

  rows.forEach((r) => {
    const rowLiveType =
      String(getCol(r, "Live Type") || "Unspecified").trim() || "Unspecified";
    if (rowLiveType !== liveType) return;

    const account = String(getCol(r, "Account") || "").trim();
    if (!account) return;

    const exp = parseNum(r["Cost"]);
    const gmv = parseNum(r["GMV"]);
    const orders = parseNum(
      r["Items Sold"] ||
        r["Item sold"] ||
        r["items_sold"] ||
        r["Orders"] ||
        r["Order"],
    );
    const views = parseNum(getCol(r, "Live Views"));
    const views10s = parseNum(getCol(r, "Live Views 10s"));
    const brand = String(getCol(r, "Brand fx", "Brand") || "").trim();

    if (!map.has(account)) {
      map.set(account, {
        account,
        brand,
        expense: exp,
        gmv,
        views,
        orders,
        roas: exp > 0 ? gmv / exp : 0,
        cr: views > 0 ? orders / views : 0,
        viewRetention: 0,
      });
      (map.get(account) as any).views10s = views10s;
    } else {
      const item = map.get(account)! as any;
      item.expense += exp;
      item.gmv += gmv;
      item.orders += orders;
      item.views += views;
      item.views10s += views10s;
      item.roas = item.expense > 0 ? item.gmv / item.expense : 0;
      item.cr = item.views > 0 ? item.orders / item.views : 0;
    }
  });

  return Array.from(map.values())
    .map((item: any) => ({
      ...item,
      viewRetention: item.views > 0 ? item.views10s / item.views : 0,
    }))
    .sort((a, b) => b.gmv - a.gmv);
}

export default function AccountPerformanceModal({
  isOpen,
  onClose,
  rows,
  title = "Account Performance Breakdown",
  subtitle,
  isDarkMode,
  currencySymbol = "Rp",
}: AccountPerformanceModalProps) {
  const formatIDR = (num: number) => formatCurrency(num, currencySymbol);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<
    "gmv" | "expense" | "views" | "roas" | "cr" | "viewRetention"
  >("gmv");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<AccountItem | null>(null);
  const [detailSort, setDetailSort] = useState<{
    col:
      | "account"
      | "brand"
      | "expense"
      | "gmv"
      | "roas"
      | "cr"
      | "viewRetention";
    dir: "asc" | "desc";
  } | null>(null);
  const PER_PAGE = 10;

  const handleDetailSort = (
    col:
      | "account"
      | "brand"
      | "expense"
      | "gmv"
      | "roas"
      | "cr"
      | "viewRetention",
  ) => {
    setDetailSort((prev) => {
      if (prev && prev.col === col)
        return { col, dir: prev.dir === "asc" ? "desc" : "asc" };
      return {
        col,
        dir: col === "account" || col === "brand" ? "asc" : "desc",
      };
    });
  };

  const detailSortArrow = (
    col:
      | "account"
      | "brand"
      | "expense"
      | "gmv"
      | "roas"
      | "cr"
      | "viewRetention",
  ) =>
    detailSort && detailSort.col === col
      ? detailSort.dir === "asc"
        ? " ▲"
        : " ▼"
      : "";

  const accountList = useMemo(() => aggregateAccountData(rows), [rows]);

  // When this drill-down only has one Live Type in scope (the common case —
  // the scope was already narrowed to one Live Type before this modal even
  // opened), there is nothing useful the intermediate "list of Live Types"
  // screen can show — it would always have exactly one row. Skip it entirely
  // and go straight to that Live Type's account list, computed synchronously
  // (not via an effect, so there is no first-render flash of the list screen).
  const singleGroup = accountList.length === 1 ? accountList[0] : null;
  const activeDetail = singleGroup || detailItem;
  // Closing the detail view: if it was reached by clicking a row in a
  // multi-Live-Type list, go back to that list; if it's the only Live Type
  // in scope, there is no list to go back to, so close the whole modal.
  const closeDetail = () => (singleGroup ? onClose() : setDetailItem(null));

  // Dismiss on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isOpen) return;
      if (activeDetail) {
        closeDetail();
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, activeDetail]);

  // Accounts that roll up into whichever Live Type is currently shown in the
  // detail view — shown as a list instead of a single aggregate card.
  const detailAccounts = useMemo(() => {
    const list = activeDetail
      ? aggregateAccountsForLiveType(rows, activeDetail.account)
      : [];
    if (!detailSort) return list;
    const { col, dir } = detailSort;
    return [...list].sort((a, b) => {
      if (col === "account" || col === "brand") {
        const va = String((a as any)[col] || "").toLowerCase();
        const vb = String((b as any)[col] || "").toLowerCase();
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const va = Number((a as any)[col]) || 0;
      const vb = Number((b as any)[col]) || 0;
      return dir === "asc" ? va - vb : vb - va;
    });
  }, [rows, activeDetail, detailSort]);

  const filtered = useMemo(() => {
    let list = accountList;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((item) => item.account.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const diff = a[sortField] - b[sortField];
      return sortAsc ? diff : -diff;
    });
  }, [accountList, searchTerm, sortField, sortAsc]);

  const totalGmv = useMemo(
    () => accountList.reduce((acc, i) => acc + i.gmv, 0),
    [accountList],
  );
  const totalExpense = useMemo(
    () => accountList.reduce((acc, i) => acc + i.expense, 0),
    [accountList],
  );
  const totalViews = useMemo(
    () => accountList.reduce((acc, i) => acc + i.views, 0),
    [accountList],
  );

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  // Rendered through a Portal straight into document.body, so this modal
  // (and the nested "Account Detail" popup inside it) always centers on the
  // real browser viewport — even if some ancestor elsewhere on the page has
  // a lingering CSS transform (e.g. left over from a fade/scale animation
  // with animation-fill-mode: forwards), which would otherwise turn "fixed"
  // positioning into "centered on that ancestor" instead of "centered on
  // screen", making the popup appear far from where it was opened.
  return createPortal(
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[250] grid place-items-center p-3 sm:p-6 overflow-hidden transition-all duration-300 animate-[fadeIn_0.2s_ease-out] ${
        activeDetail ? "" : "bg-slate-950/75 backdrop-blur-sm"
      }`}>
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

      {/* Main Live Type list — only shown when there's more than one Live Type
          in scope to list; skipped entirely (see `singleGroup` above) when
          there's just one, and hidden while the detail popup is open so the
          two don't stack behind each other (one modal card visible at a time). */}
      {!activeDetail && (
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
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4.418 0-8 1.79-8 4v2h16v-2c0-2.21-3.582-4-8-4z"></path>
                  </svg>
                </div>
                <h3
                  className={`text-base sm:text-lg font-black tracking-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  {title}
                </h3>
              </div>
              {subtitle && (
                <p
                  className={`text-xs mt-1 font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-900"}`}>
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
                Live Types:{" "}
                <b className="text-indigo-600 dark:text-indigo-400 font-mono text-sm">
                  {accountList.length}
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
                Views:{" "}
                <b className="text-amber-700 dark:text-amber-400 font-mono text-sm">
                  {formatNum(totalViews)}
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
                placeholder="Filter Live Type..."
                className={`w-full py-2 px-3 rounded-md text-xs font-semibold border outline-none shadow-sm transition-all ${
                  isDarkMode
                    ? "bg-[#111827] border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500"
                    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-500"
                }`}
              />
            </div>
          </div>

          {/* Account Data Table */}
          <div className="overflow-auto flex-1 p-4 sm:p-6">
            {filtered.length === 0 ? (
              <div
                className={`text-center py-16 text-sm font-bold ${isDarkMode ? "text-slate-300" : "text-slate-900"}`}>
                No account records found for this specific date / dimension.
              </div>
            ) : (
              <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-black uppercase tracking-wider bg-black text-white">
                    <th className="py-3 px-3 w-12 text-center">#</th>
                    <th className="py-3 px-4 min-w-[200px]">Live Type</th>
                    <th className="py-3 px-4 min-w-[100px] text-center">
                      Accounts
                    </th>
                    <th
                      onClick={() => {
                        setSortField("expense");
                        setSortAsc(!sortAsc);
                      }}
                      className="py-3 px-4 text-right cursor-pointer hover:text-blue-400">
                      Spend{" "}
                      {sortField === "expense" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      onClick={() => {
                        setSortField("gmv");
                        setSortAsc(!sortAsc);
                      }}
                      className="py-3 px-4 text-right cursor-pointer hover:text-blue-400 font-extrabold">
                      GMV {sortField === "gmv" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      onClick={() => {
                        setSortField("views");
                        setSortAsc(!sortAsc);
                      }}
                      className="py-3 px-4 text-right cursor-pointer hover:text-blue-400">
                      Views {sortField === "views" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      onClick={() => {
                        setSortField("roas");
                        setSortAsc(!sortAsc);
                      }}
                      className="py-3 px-4 text-right cursor-pointer hover:text-blue-400">
                      ROI {sortField === "roas" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th className="py-3 px-4 text-right text-slate-400">CIR</th>
                    <th
                      onClick={() => {
                        setSortField("cr");
                        setSortAsc(!sortAsc);
                      }}
                      className="py-3 px-4 text-right cursor-pointer hover:text-blue-400">
                      CR {sortField === "cr" ? (sortAsc ? "▲" : "▼") : ""}
                    </th>
                    <th
                      onClick={() => {
                        setSortField("viewRetention");
                        setSortAsc(!sortAsc);
                      }}
                      className="py-3 px-4 text-right cursor-pointer hover:text-blue-400">
                      View Retention{" "}
                      {sortField === "viewRetention"
                        ? sortAsc
                          ? "▲"
                          : "▼"
                        : ""}
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
                        key={`${item.account}-${idx}`}
                        onClick={() => setDetailItem(item)}
                        title="Click to see the accounts in this Live Type"
                        className={`cursor-pointer transition-colors ${
                          isDarkMode
                            ? "hover:bg-blue-900/30 text-slate-200"
                            : "hover:bg-blue-50 text-slate-800"
                        }`}>
                        <td
                          className={`py-3 px-3 text-center font-mono ${isDarkMode ? "text-slate-300" : "text-slate-900"}`}>
                          {(page - 1) * PER_PAGE + idx + 1}
                        </td>
                        <td
                          className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400"
                          title={item.account}>
                          {item.account}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-center">
                          {item.accountsCount}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-900"}`}>
                          {formatIDR(item.expense)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 dark:text-emerald-400">
                          {formatIDR(item.gmv)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-800"}`}>
                          {formatNum(item.views)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                          {item.roas.toFixed(2)}x
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-medium ${isDarkMode ? "text-slate-300" : "text-slate-900"}`}>
                          {formatPct(0)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                          {formatPct(item.cr)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                          {formatPct(item.viewRetention)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setDetailItem(item)}
                            title="View Live Type detail"
                            aria-label="View Live Type detail"
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
              <span
                className={isDarkMode ? "text-slate-400" : "text-slate-900"}>
                Showing {(page - 1) * PER_PAGE + 1} -{" "}
                {Math.min(page * PER_PAGE, filtered.length)} of{" "}
                {filtered.length} live types
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
      )}

      {/* ACCOUNT DETAIL POPUP */}
      {activeDetail && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            closeDetail();
          }}
          className="fixed inset-0 z-[280] bg-slate-950/60 backdrop-blur-sm grid place-items-center p-4 animate-[fadeIn_0.15s_ease-out]">
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-3xl max-h-[85vh] flex flex-col rounded-md border shadow-2xl overflow-hidden modal-animate-scale ${
              isDarkMode
                ? "bg-[#0b1120] border-slate-800 text-slate-100"
                : "bg-white border-slate-300 text-slate-900 shadow-slate-400/40"
            }`}>
            <div
              className={`px-6 py-4 border-b flex items-start justify-between gap-4 shrink-0 ${
                isDarkMode
                  ? "border-slate-800 bg-[#0f172a]"
                  : "border-slate-200 bg-slate-50"
              }`}>
              <div className="min-w-0">
                <p
                  className={`text-[11px] font-black uppercase tracking-wider ${isDarkMode ? "text-slate-500" : "text-slate-900"}`}>
                  Live Type Detail
                </p>
                <h4
                  className={`text-sm font-bold mt-0.5 break-words ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  {activeDetail.account}
                  {activeDetail.platform && (
                    <span
                      className={`font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-900"}`}>
                      {" "}
                      | {activeDetail.platform}
                    </span>
                  )}
                </h4>
                <p
                  className={`text-xs mt-1 font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-900"}`}>
                  {detailAccounts.length} accounts &middot; Spend{" "}
                  {formatIDR(activeDetail.expense)} &middot; GMV{" "}
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {formatIDR(activeDetail.gmv)}
                  </span>{" "}
                  &middot; ROI{" "}
                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                    {activeDetail.roas.toFixed(2)}x
                  </span>
                </p>
              </div>
              <button
                onClick={closeDetail}
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

            <div className="overflow-auto flex-1">
              {detailAccounts.length === 0 ? (
                <p
                  className={`text-xs p-6 ${isDarkMode ? "text-slate-300" : "text-slate-900"}`}>
                  No accounts found for this Live Type in the selected scope.
                </p>
              ) : (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="sticky top-0 bg-black text-white">
                    <tr>
                      <th
                        onClick={() => handleDetailSort("account")}
                        className="px-5 py-2.5 font-bold uppercase tracking-wider cursor-pointer hover:text-blue-400">
                        Account{detailSortArrow("account")}
                      </th>
                      <th
                        onClick={() => handleDetailSort("brand")}
                        className="px-5 py-2.5 font-bold uppercase tracking-wider cursor-pointer hover:text-blue-400">
                        Brand{detailSortArrow("brand")}
                      </th>
                      <th
                        onClick={() => handleDetailSort("expense")}
                        className="px-5 py-2.5 font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-400">
                        Spend{detailSortArrow("expense")}
                      </th>
                      <th
                        onClick={() => handleDetailSort("gmv")}
                        className="px-5 py-2.5 font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-400">
                        GMV{detailSortArrow("gmv")}
                      </th>
                      <th
                        onClick={() => handleDetailSort("roas")}
                        className="px-5 py-2.5 font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-400">
                        ROI{detailSortArrow("roas")}
                      </th>
                      <th
                        onClick={() => handleDetailSort("cr")}
                        className="px-5 py-2.5 font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-400">
                        CR{detailSortArrow("cr")}
                      </th>
                      <th
                        onClick={() => handleDetailSort("viewRetention")}
                        className="px-5 py-2.5 font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-400">
                        View Retention{detailSortArrow("viewRetention")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailAccounts.map((a, idx) => (
                      <tr
                        key={a.account}
                        className={`border-b transition-colors ${
                          isDarkMode
                            ? "border-slate-800/80 hover:bg-blue-900/30"
                            : "border-slate-100 hover:bg-blue-50"
                        } ${idx % 2 === 0 ? "" : isDarkMode ? "bg-slate-900/40" : "bg-slate-50"}`}>
                        <td className="px-5 py-2.5 font-semibold">
                          {a.account}
                        </td>
                        <td
                          className={`px-5 py-2.5 font-medium ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>
                          {a.brand || "-"}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono">
                          {formatIDR(a.expense)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatIDR(a.gmv)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">
                          {a.roas.toFixed(2)}x
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono">
                          {formatPct(a.cr)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono">
                          {formatPct(a.viewRetention)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
