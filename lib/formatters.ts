import React from 'react';

export const parseNum = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const parsed = Number(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(parsed) ? 0 : parsed;
};

export const formatIDR = (num: number): string => 
  (Number(num) || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export const formatCurrency = (num: number, symbol?: string): string => {
  const formatted = (Number(num) || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  return symbol !== undefined ? `${symbol} ${formatted}` : formatIDR(num);
};

export const formatNum = (num: number): string => 
  (Number(num) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export const formatPct = (num: number): string => 
  ((Number(num) || 0) * 100).toFixed(2) + "%";

export const getGr = (cur: number, prev: number): number => {
  if (prev === 0 && cur === 0) return 0;
  if (prev === 0 && cur > 0) return 1; 
  if (prev === 0 && cur < 0) return -1;
  return (cur - prev) / prev;
};

export const isValidBrandName = (brand: any): boolean => {
  const s = String(brand || '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower !== '-' && lower !== 'na' && lower !== 'n/a' && lower !== 'null' && lower !== 'undefined';
};

export const renderGR = (cur: number, prev: number, isInv = false, isDarkMode = false) => {
  if (prev === 0 && cur === 0) return React.createElement("span", { className: "text-[10px] ml-2 font-bold opacity-40" }, "-");
  const gr = getGr(cur, prev);
  let color = isDarkMode ? "text-slate-200 bg-slate-700/50" : "text-white bg-white/30";
  let arrow = "";
  if (gr > 0) {
    color = isInv ? "text-white bg-rose-500/60" : "text-white bg-emerald-500/60";
    arrow = "▲";
  } else if (gr < 0) {
    color = isInv ? "text-white bg-emerald-500/60" : "text-white bg-rose-500/60";
    arrow = "▼";
  } else {
    return React.createElement("span", { className: `text-[10px] ml-2 px-1.5 py-0.5 rounded font-bold ${color}` }, "-");
  }
  return React.createElement(
    "span",
    { className: `text-[11px] ml-2 px-1.5 py-0.5 rounded font-bold tracking-wide backdrop-blur-sm shadow-sm ${color}` },
    `${arrow} ${formatPct(Math.abs(gr))}`
  );
};

export const getGrHTML = (cur: number, prev: number, invertColors = false, isDarkMode = false): string => {
  const gr = getGr(cur, prev);
  if (cur === 0 && prev === 0) return `<td class="px-4 py-3 text-right font-mono font-medium text-slate-400 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">0.00%</td>`;
  let color = isDarkMode ? "text-slate-400" : "text-slate-500";
  if (gr > 0) color = invertColors ? "text-red-600 bg-red-50" : "text-emerald-700 bg-emerald-50";
  if (gr < 0) color = invertColors ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50";
  
  if (isDarkMode) {
    if (gr > 0) color = invertColors ? "text-red-400 bg-red-500/10" : "text-emerald-400 bg-emerald-500/10";
    if (gr < 0) color = invertColors ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10";
  }
  return `<td class="px-4 py-3 text-right font-mono font-bold border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}"><span class="px-2.5 py-1 rounded-lg ${color}">${formatPct(Math.abs(gr))}</span></td>`;
};

export const cleanPid = (val: any): string => {
  if (val === null || val === undefined) return '';
  let str = String(val).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!str || str === '-') return str;
  // If scientific notation e.g. 1.84619E+15 or 1.84619e+15 or contains +15
  if (/[eE]\+?\d+/.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch {
      // fallback to original str
    }
  }
  // Strip trailing .0
  str = str.replace(/\.0+$/, '');
  return str;
};