import React, { useState, useMemo } from 'react';
import { formatIDR, formatNum, formatPct, cleanPid } from '@/lib/formatters';
import { toYMD } from '@/lib/dateUtils';

export type MetricType = 'spend' | 'adsGmv' | 'sales' | 'roas' | 'cir';

interface DailyRecord {
  date: string;       // e.g. '2026-09-01'
  displayDate: string;// e.g. '1 Sep 2026'
  spend: number;
  adsGmv: number;
  sales: number;
  roas: number;
  cir: number;
}

interface PidMetricDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pidItem: {
    pid: string;
    skuName: string;
    cluster: string;
    cid: string;
    brand: string;
    platform: string;
    dailyData: Record<string, DailyRecord>;
  } | null;
  initialMetric?: MetricType;
  dates: string[]; // List of YMD dates in chronological order
  isDarkMode: boolean;
  onOpenAddAdjustment: (date: string, pid: string, skuName: string, metric: string, value: number) => void;
  adjustments?: any[];
}

const METRIC_CONFIG: Record<MetricType, { label: string; unit: string; format: (v: number) => string }> = {
  spend: {
    label: 'Spend',
    unit: 'IDR',
    format: (v: number) => formatIDR(v)
  },
  adsGmv: {
    label: 'Ads GMV',
    unit: 'IDR',
    format: (v: number) => formatIDR(v)
  },
  sales: {
    label: 'Sales',
    unit: 'IDR',
    format: (v: number) => formatIDR(v)
  },
  roas: {
    label: 'ROAS',
    unit: 'x',
    format: (v: number) => (v > 0 ? `${v.toFixed(2)}x` : '-')
  },
  cir: {
    label: 'CIR',
    unit: '%',
    format: (v: number) => (v > 0 ? `${v.toFixed(2)}%` : '-')
  }
};

export default function PidMetricDetailModal({
  isOpen,
  onClose,
  pidItem,
  initialMetric = 'spend',
  dates,
  isDarkMode,
  onOpenAddAdjustment,
  adjustments = []
}: PidMetricDetailModalProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>(initialMetric);

  // Sync selected metric when initialMetric changes
  React.useEffect(() => {
    if (initialMetric) setSelectedMetric(initialMetric);
  }, [initialMetric, isOpen]);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const rows = useMemo(() => {
    if (!pidItem) return [];

    return dates.map((d, idx) => {
      const record = pidItem.dailyData[d] || {
        date: d,
        displayDate: d,
        spend: 0,
        adsGmv: 0,
        sales: 0,
        roas: 0,
        cir: 0
      };

      const val = record[selectedMetric] || 0;

      // Calculate DoD
      let dodVal = 0;
      let dodPct = 0;
      if (idx > 0) {
        const prevDate = dates[idx - 1];
        const prevRecord = pidItem.dailyData[prevDate];
        const prevVal = prevRecord ? (prevRecord[selectedMetric] || 0) : 0;
        dodVal = val - prevVal;
        dodPct = prevVal > 0 ? ((val - prevVal) / prevVal) * 100 : 0;
      }

      // Find adjustments for this PID and date
      const cPid = cleanPid(pidItem.pid);
      const adjForDay = adjustments.filter((a) => {
        const matchPid = cleanPid(a.pid || a.PID) === cPid;
        if (!matchPid) return false;
        const dStr = (a.date || a.Date || '').toLowerCase();
        return (
          dStr === record.displayDate.toLowerCase() ||
          dStr === d.toLowerCase() ||
          toYMD(a.date || a.Date) === d
        );
      });

      return {
        date: d,
        displayDate: record.displayDate,
        value: val,
        dodVal,
        dodPct,
        adjustments: adjForDay
      };
    });
  }, [pidItem, dates, selectedMetric, adjustments]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (!rows.length) return { total: 0, avg: 0, max: 0, min: 0 };
    const values = rows.map((r) => r.value).filter((v) => v > 0);
    const total = rows.reduce((acc, r) => acc + r.value, 0);
    const avg = values.length ? total / values.length : 0;
    const max = values.length ? Math.max(...values) : 0;
    const min = values.length ? Math.min(...values) : 0;
    return { total, avg, max, min };
  }, [rows]);

  if (!isOpen || !pidItem) return null;

  const currentCfg = METRIC_CONFIG[selectedMetric];

  // Theme tokens
  const mainText = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const secText = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const borderCol = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const bgModal = isDarkMode ? 'bg-[#0f172a]' : 'bg-white';
  const bgHeader = isDarkMode ? 'bg-[#131d33]' : 'bg-slate-50';
  const bgSubHeader = isDarkMode ? 'bg-[#0c1222]' : 'bg-slate-100/70';
  const bgCard = isDarkMode ? 'bg-[#1e293b]/70 border-slate-800' : 'bg-slate-50 border-slate-200';
  const tableHeadBg = 'bg-[#0f172a] text-white';

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-md shadow-2xl overflow-hidden border ${borderCol} ${bgModal}`}
      >
        {/* Modal Header */}
        <div className={`p-6 border-b flex items-start justify-between ${borderCol} ${bgHeader}`}>
          <div className="space-y-1 pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider border ${
                  isDarkMode
                    ? 'bg-slate-800 text-slate-200 border-slate-700'
                    : 'bg-slate-200 text-slate-800 border-slate-300'
                }`}
              >
                {pidItem.cluster || 'No Cluster'}
              </span>
              <span className={`text-xs font-mono ${secText}`}>PID: {pidItem.pid}</span>
              {pidItem.cid && (
                <span className={`text-xs font-mono ${secText}`}>CID: {pidItem.cid}</span>
              )}
            </div>
            <h2 className={`text-base font-bold line-clamp-2 leading-tight ${mainText}`}>
              {pidItem.skuName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              Daily Single-Metric View: <span className={`font-semibold ${mainText}`}>{currentCfg.label}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className={`p-2 rounded-md transition-colors shrink-0 ${
              isDarkMode
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metric Switcher Tabs */}
        <div className={`px-6 pt-3 pb-3 border-b flex flex-wrap gap-2 ${borderCol} ${bgSubHeader}`}>
          {(['spend', 'adsGmv', 'sales', 'roas', 'cir'] as MetricType[]).map((m) => {
            const cfg = METRIC_CONFIG[m];
            const isAct = selectedMetric === m;
            return (
              <button
                key={m}
                onClick={() => setSelectedMetric(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                  isAct
                    ? isDarkMode
                      ? 'bg-slate-100 text-slate-950 border-white shadow-sm'
                      : 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : isDarkMode
                    ? 'bg-[#1e293b] text-slate-400 hover:text-slate-200 border-slate-700'
                    : 'bg-white text-slate-700 hover:text-slate-950 border-slate-300'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Summary Stats Cards */}
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`p-4 rounded-md border ${bgCard}`}>
            <div className={`text-[10px] font-extrabold uppercase tracking-wider ${secText}`}>
              {selectedMetric === 'roas' || selectedMetric === 'cir' ? 'Average' : 'Total'}
            </div>
            <div className={`text-lg font-black mt-1 ${mainText}`}>
              {selectedMetric === 'roas' || selectedMetric === 'cir'
                ? currentCfg.format(stats.avg)
                : currentCfg.format(stats.total)}
            </div>
          </div>

          <div className={`p-4 rounded-md border ${bgCard}`}>
            <div className={`text-[10px] font-extrabold uppercase tracking-wider ${secText}`}>Daily Average</div>
            <div className={`text-lg font-black mt-1 ${mainText}`}>
              {currentCfg.format(stats.avg)}
            </div>
          </div>

          <div className={`p-4 rounded-md border ${bgCard}`}>
            <div className={`text-[10px] font-extrabold uppercase tracking-wider ${secText}`}>Peak Value</div>
            <div className={`text-lg font-black mt-1 ${mainText}`}>
              {currentCfg.format(stats.max)}
            </div>
          </div>

          <div className={`p-4 rounded-md border ${bgCard}`}>
            <div className={`text-[10px] font-extrabold uppercase tracking-wider ${secText}`}>Lowest Value</div>
            <div className={`text-lg font-black mt-1 ${mainText}`}>
              {currentCfg.format(stats.min)}
            </div>
          </div>
        </div>

        {/* Focused Daily Table */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className={`rounded-md border overflow-hidden ${borderCol}`}>
            <table className="w-full text-left border-collapse text-xs">
              <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${borderCol} ${tableHeadBg}`}>
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">{currentCfg.label}</th>
                  <th className="py-3 px-4 text-right">DoD Change</th>
                  <th className="py-3 px-4">Adjustment / Notes</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCol}`}>
                {rows.map((row, idx) => (
                  <tr
                    key={row.date}
                    className={`transition-colors ${
                      isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <td className={`py-3 px-4 font-bold ${mainText}`}>
                      {row.displayDate}
                    </td>

                    <td className={`py-3 px-4 text-right font-black font-mono text-sm ${mainText}`}>
                      {currentCfg.format(row.value)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {idx === 0 ? (
                        <span className={`font-mono ${secText}`}>-</span>
                      ) : (
                        <span
                          className={`font-bold font-mono ${
                            row.dodVal > 0
                              ? isDarkMode
                                ? 'text-emerald-400'
                                : 'text-emerald-700'
                              : row.dodVal < 0
                              ? isDarkMode
                                ? 'text-rose-400'
                                : 'text-rose-700'
                              : secText
                          }`}
                        >
                          {row.dodVal > 0 ? '+' : ''}
                          {row.dodPct.toFixed(1)}%
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {row.adjustments.length > 0 ? (
                        <div className="space-y-1">
                          {row.adjustments.map((adj) => (
                            <div key={adj.id || adj.adjustment} className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                  adj.status === 'Adjusted'
                                    ? isDarkMode
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : isDarkMode
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-amber-100 text-amber-900 border-amber-300'
                                }`}
                              >
                                {adj.status || 'Pending'}
                              </span>
                              <span
                                className={`truncate max-w-[220px] font-medium ${mainText}`}
                                title={adj.adjustment}
                              >
                                {adj.adjustment}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className={`italic text-[11px] ${secText}`}>No notes</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() =>
                          onOpenAddAdjustment(
                            row.displayDate,
                            pidItem.pid,
                            pidItem.skuName,
                            currentCfg.label,
                            row.value
                          )
                        }
                        className={`px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-colors ${
                          isDarkMode
                            ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border-slate-700'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-900 hover:text-white border-slate-300'
                        }`}
                      >
                        + Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${borderCol} ${bgHeader}`}>
          <div className={`text-xs ${secText}`}>
            Showing only <span className={`font-bold ${mainText}`}>{currentCfg.label}</span> performance across {dates.length} days.
          </div>
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-colors ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

