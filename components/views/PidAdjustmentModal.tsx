import React, { useState, useMemo } from 'react';
import { formatIDR, cleanPid } from '@/lib/formatters';

export interface AdjustmentLogItem {
  id: string;
  date: string;
  pid: string;
  skuName: string;
  metric: string;
  adjustment: string;
  status: 'Pending' | 'Adjusted' | string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  actionTaken?: string;
  'Action Taken'?: string;
  [key: string]: any;
}

export const normalizeAdjustment = (item: any): AdjustmentLogItem => {
  if (!item) return {} as any;
  const id = String(item.id || item.ID || '').trim();
  const date = String(item.date || item.Date || '').trim();
  const pid = cleanPid(item.pid || item.PID || '');
  const skuName = String(item.skuName || item['SKU Name'] || item.sku_name || '').trim();
  const metric = String(item.metric || item.Metric || '').trim();
  const adjustment = String(item.adjustment || item.Adjustment || '').trim();
  const status = String(item.status || item.Status || 'Pending').trim() || 'Pending';
  const createdBy = String(item.createdBy || item['Created By'] || item.created_by || '').trim();
  const createdAt = String(item.createdAt || item['Created At'] || item.created_at || '').trim();
  const updatedAt = String(item.updatedAt || item['Updated At'] || item.updated_at || '').trim();
  const updatedBy = String(item.updatedBy || item['Updated By'] || item.updated_by || '').trim();
  const actionTaken = String(item.actionTaken || item['Action Taken'] || item.action_taken || '').trim();

  return {
    ...item,
    id,
    ID: id,
    date,
    Date: date,
    pid,
    PID: pid,
    skuName,
    'SKU Name': skuName,
    metric,
    Metric: metric,
    adjustment,
    Adjustment: adjustment,
    status,
    Status: status,
    createdBy,
    'Created By': createdBy,
    createdAt,
    'Created At': createdAt,
    updatedAt,
    'Updated At': updatedAt,
    updatedBy,
    'Updated By': updatedBy,
    actionTaken,
    'Action Taken': actionTaken
  };
};

interface AddAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    date: string;
    pid: string;
    skuName: string;
    metric: string;
    value?: number;
  };
  onSubmit: (data: {
    date: string;
    pid: string;
    skuName: string;
    metric: string;
    adjustment: string;
    userName: string;
  }) => Promise<void>;
  isDarkMode: boolean;
}

export function AddAdjustmentModal({
  isOpen,
  onClose,
  initialData,
  onSubmit,
  isDarkMode
}: AddAdjustmentModalProps) {
  const [date, setDate] = useState(initialData?.date || '');
  const [pid, setPid] = useState(cleanPid(initialData?.pid || ''));
  const [skuName, setSkuName] = useState(initialData?.skuName || '');
  const [metric, setMetric] = useState(initialData?.metric || 'Spend');
  const [adjustment, setAdjustment] = useState('');
  const [userName, setUserName] = useState('samuelgeorgiofc');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (initialData) {
      setDate(initialData.date || '');
      setPid(cleanPid(initialData.pid || ''));
      setSkuName(initialData.skuName || '');
      setMetric(initialData.metric || 'Spend');
    }
  }, [initialData, isOpen]);

  // Handle escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustment.trim()) {
      setError('Please provide adjustment notes.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit({
        date,
        pid: cleanPid(pid),
        skuName,
        metric,
        adjustment,
        userName: userName.trim() || 'User'
      });
      setAdjustment('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit adjustment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const mainText = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const secText = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const labelText = isDarkMode ? 'text-slate-400' : 'text-slate-700';
  const borderCol = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const inputBg = isDarkMode ? 'bg-[#1e293b] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900';

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`relative w-full max-w-lg rounded-md shadow-2xl overflow-hidden border ${borderCol} ${
          isDarkMode ? 'bg-[#0f172a]' : 'bg-white'
        }`}
      >
        <div className={`p-5 border-b flex items-center justify-between ${borderCol} ${isDarkMode ? 'bg-[#131d33]' : 'bg-slate-50'}`}>
          <div>
            <h3 className={`text-base font-black ${mainText}`}>Add Performance Adjustment</h3>
            <p className={`text-xs ${secText}`}>Record operational notes and adjustment logs in Google Sheets.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className={`p-1.5 rounded-md transition-colors ${
              isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-500 font-bold">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${labelText}`}>Date</label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className={`w-full py-2 px-3 rounded-md font-bold border outline-none focus:ring-2 focus:ring-indigo-500 ${inputBg}`}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${labelText}`}>Target Metric</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className={`w-full py-2 px-3 rounded-md font-bold border outline-none focus:ring-2 focus:ring-indigo-500 ${inputBg}`}
              >
                <option value="Spend">Spend</option>
                <option value="Ads GMV">Ads GMV</option>
                <option value="Sales">Sales</option>
                <option value="ROAS">ROAS</option>
                <option value="CIR">CIR</option>
                <option value="General">General / Strategy</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${labelText}`}>Product ID (PID)</label>
            <input
              type="text"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              required
              className={`w-full py-2 px-3 rounded-md font-mono font-bold border outline-none focus:ring-2 focus:ring-indigo-500 ${inputBg}`}
            />
          </div>

          <div>
            <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${labelText}`}>SKU Name</label>
            <input
              type="text"
              value={skuName}
              onChange={(e) => setSkuName(e.target.value)}
              className={`w-full py-2 px-3 rounded-md font-bold border outline-none focus:ring-2 focus:ring-indigo-500 ${inputBg}`}
            />
          </div>

          <div>
            <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${labelText}`}>
              Adjustment Notes / Action Plan
            </label>
            <textarea
              rows={4}
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="e.g. Budget increased by 20% due to ROAS > 10x; SKU ranking pushed to top 3."
              required
              className={`w-full p-3 rounded-md border outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed font-medium ${inputBg}`}
            />
          </div>

          <div>
            <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${labelText}`}>Submitted By</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
              className={`w-full py-2 px-3 rounded-md font-bold border outline-none focus:ring-2 focus:ring-indigo-500 ${inputBg}`}
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${
                isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                isDarkMode
                  ? 'bg-slate-100 hover:bg-white text-slate-950 shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-white shadow-md'
              }`}
            >
              {isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Saving to Sheet...
                </>
              ) : (
                'Save Adjustment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AdjustmentLogsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AdjustmentLogItem[];
  onUpdateStatus: (id: string, newStatus: 'Pending' | 'Adjusted', userName: string) => Promise<void>;
  onUpdateActionTaken?: (id: string, actionTaken: string, userName: string) => Promise<void>;
  isDarkMode: boolean;
}

export function AdjustmentLogsDrawer({
  isOpen,
  onClose,
  logs,
  onUpdateStatus,
  onUpdateActionTaken,
  isDarkMode
}: AdjustmentLogsDrawerProps) {
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Action Taken Dialog Modal state
  const [actionTakenModal, setActionTakenModal] = useState<{
    isOpen: boolean;
    item: AdjustmentLogItem | null;
    currentText: string;
    userName: string;
  }>({
    isOpen: false,
    item: null,
    currentText: '',
    userName: 'samuelgeorgiofc'
  });
  const [isSavingAction, setIsSavingAction] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const normalizedLogs = useMemo(() => {
    return (logs || []).map(normalizeAdjustment);
  }, [logs]);

  const filteredLogs = normalizedLogs.filter(log => {
    if (filterStatus !== 'All' && log.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (log.pid || '').toLowerCase().includes(q) ||
        (log.skuName || '').toLowerCase().includes(q) ||
        (log.adjustment || '').toLowerCase().includes(q) ||
        (log.metric || '').toLowerCase().includes(q) ||
        (log.createdBy || '').toLowerCase().includes(q) ||
        (log.actionTaken || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleToggleStatus = async (item: AdjustmentLogItem) => {
    const targetStatus = item.status === 'Adjusted' ? 'Pending' : 'Adjusted';
    setUpdatingId(item.id);
    try {
      await onUpdateStatus(item.id, targetStatus as any, 'samuelgeorgiofc');
    } catch {
      alert('Failed to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isOpen) return null;

  const mainText = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const secText = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const borderCol = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const bgModal = isDarkMode ? 'bg-[#0f172a]' : 'bg-white';
  const bgHeader = isDarkMode ? 'bg-[#131d33]' : 'bg-slate-50';
  const bgSubHeader = isDarkMode ? 'bg-[#0c1222]' : 'bg-slate-100/70';
  const tableHeadBg = 'bg-[#0f172a] text-white';

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`relative w-full max-w-7xl w-[95vw] max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border ${borderCol} ${bgModal}`}
      >
        {/* Header */}
        <div className={`p-6 border-b flex items-center justify-between ${borderCol} ${bgHeader}`}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-lg font-black ${mainText}`}>Adjustment Logs</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isDarkMode
                    ? 'bg-slate-800 text-slate-200 border-slate-700'
                    : 'bg-slate-200 text-slate-800 border-slate-300'
                }`}
              >
                {logs.length} Total
              </span>
            </div>
            <p className={`text-xs ${secText}`}>
              Operational track records stored in sheet &apos;Adjustment Logs&apos;. Update status to collaborate seamlessly.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className={`p-2 rounded-xl transition-colors ${
              isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Filters */}
        <div className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${borderCol} ${bgSubHeader}`}>
          <div className="flex items-center gap-2">
            {(['All', 'Pending', 'Adjusted'] as string[]).map((st) => {
              const isAct = filterStatus === st;
              return (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    isAct
                      ? isDarkMode
                        ? 'bg-slate-100 text-slate-950 border-white shadow-sm font-black'
                        : 'bg-slate-900 text-white border-slate-900 shadow-sm font-black'
                      : isDarkMode
                      ? 'bg-[#1e293b] text-slate-400 hover:text-slate-200 border-slate-700'
                      : 'bg-white text-slate-700 hover:text-slate-950 border-slate-300'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[240px]">
            <input
              type="text"
              placeholder="Search by PID, SKU, note, author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full py-1.5 px-3 pl-8 rounded-xl text-xs font-medium border outline-none focus:ring-2 focus:ring-indigo-500 ${
                isDarkMode ? 'bg-[#1e293b] border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
            <svg className={`w-4 h-4 absolute left-2.5 top-2.5 ${secText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        {/* Logs Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredLogs.length === 0 ? (
            <div className={`text-center py-12 ${secText}`}>
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-sm font-bold">No adjustments found matching filter.</p>
            </div>
          ) : (
            <div className={`rounded-xl border overflow-x-auto ${borderCol}`}>
              <table className="w-full text-left border-collapse text-xs min-w-[1050px]">
                <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${borderCol} ${tableHeadBg}`}>
                  <tr>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">PID & SKU</th>
                    <th className="py-3 px-3">Metric</th>
                    <th className="py-3 px-3">Adjustment Notes</th>
                    <th className="py-3 px-3">Logged By</th>
                    <th className="py-3 px-3">Last Updated</th>
                    <th className="py-3 px-3 min-w-[200px]">Action Taken</th>
                    <th className={`py-3 px-3 text-center w-[160px] min-w-[160px] sticky right-0 z-20 ${tableHeadBg} border-l border-slate-700 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)]`}>Action</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${borderCol}`}>
                  {filteredLogs.map((log) => {
                    const isAdjusted = log.status === 'Adjusted';
                    const isUpdating = updatingId === log.id;
                    const actionTakenText = log.actionTaken || log['Action Taken'] || '';
                    return (
                      <tr key={log.id} className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-100/70'}>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                              isAdjusted
                                ? isDarkMode
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : isDarkMode
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {log.status || 'Pending'}
                          </span>
                        </td>

                        <td className={`py-3 px-3 font-bold whitespace-nowrap ${mainText}`}>
                          {log.date}
                        </td>

                        <td className="py-3 px-3 max-w-[220px]">
                          <div className={`font-mono text-[11px] ${secText}`}>{cleanPid(log.pid)}</div>
                          <div className={`font-bold truncate leading-snug ${mainText}`} title={log.skuName}>
                            {log.skuName}
                          </div>
                        </td>

                        <td className={`py-3 px-3 font-bold whitespace-nowrap ${mainText}`}>
                          {log.metric}
                        </td>

                        <td className="py-3 px-3 max-w-[240px]">
                          <p className={`font-medium leading-snug break-words ${mainText}`}>
                            {log.adjustment}
                          </p>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className={`font-bold ${mainText}`}>{log.createdBy}</div>
                          <div className={`text-[10px] ${secText}`}>
                            {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : ''}
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {log.updatedAt ? (
                            <>
                              <div className={`font-bold ${mainText}`}>{log.updatedBy || 'Updated'}</div>
                              <div className={`text-[10px] ${secText}`}>
                                {new Date(log.updatedAt).toLocaleString()}
                              </div>
                            </>
                          ) : (
                            <span className={secText}>-</span>
                          )}
                        </td>

                        {/* Action Taken Column */}
                        <td className="py-3 px-3 min-w-[200px] max-w-[260px]">
                          {actionTakenText ? (
                            <div className="space-y-1">
                              <p className={`font-medium leading-snug break-words text-xs ${mainText}`}>
                                {actionTakenText}
                              </p>
                              <button
                                onClick={() => setActionTakenModal({
                                  isOpen: true,
                                  item: log,
                                  currentText: actionTakenText,
                                  userName: 'samuelgeorgiofc'
                                })}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:text-indigo-400 hover:underline transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Edit Action
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setActionTakenModal({
                                isOpen: true,
                                item: log,
                                currentText: '',
                                userName: 'samuelgeorgiofc'
                              })}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
                                isDarkMode
                                  ? 'bg-indigo-500/10 text-indigo-300 hover:bg-indigo-600 hover:text-white border-indigo-500/30'
                                  : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-600 hover:text-white border-indigo-200'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                              </svg>
                              Input Next Step
                            </button>
                          )}
                        </td>

                        {/* Action Column (Sticky Right) */}
                        <td className={`py-3 px-3 text-center whitespace-nowrap w-[160px] min-w-[160px] sticky right-0 z-10 border-l ${borderCol} ${isDarkMode ? 'bg-[#0f172a]' : 'bg-white'} shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.15)]`}>
                          <button
                            onClick={() => handleToggleStatus(log)}
                            disabled={isUpdating}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 mx-auto ${
                              isAdjusted
                                ? isDarkMode
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                                : isDarkMode
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black'
                                : 'bg-emerald-700 hover:bg-emerald-800 text-white font-black'
                            }`}
                          >
                            {isUpdating ? (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : isAdjusted ? (
                              'Revert to Pending'
                            ) : (
                              'Mark Adjusted ✓'
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${borderCol} ${bgHeader}`}>
          <div className={`text-xs ${secText}`}>
            Changes are saved live to <span className={`font-mono font-bold ${mainText}`}>Adjustment Logs</span> sheet in Google Spreadsheet.
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

      {/* Action Taken Input/Edit Modal Dialog */}
      {actionTakenModal.isOpen && actionTakenModal.item && (
        <div className="fixed inset-0 z-[280] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border ${borderCol} ${bgModal}`}>
            <div className={`p-5 border-b flex items-center justify-between ${borderCol} ${bgHeader}`}>
              <div>
                <h3 className={`text-base font-black ${mainText}`}>Action Taken / Next Step Detail</h3>
                <p className={`text-xs ${secText}`}>
                  Record operational actions taken for {actionTakenModal.item.pid}
                </p>
              </div>
              <button
                onClick={() => setActionTakenModal({ isOpen: false, item: null, currentText: '', userName: 'samuelgeorgiofc' })}
                className={`p-1.5 rounded-xl transition-colors ${
                  isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!actionTakenModal.item || !onUpdateActionTaken) return;
                setIsSavingAction(true);
                try {
                  await onUpdateActionTaken(
                    actionTakenModal.item.id,
                    actionTakenModal.currentText.trim(),
                    actionTakenModal.userName.trim() || 'samuelgeorgiofc'
                  );
                  actionTakenModal.item.actionTaken = actionTakenModal.currentText.trim();
                  actionTakenModal.item['Action Taken'] = actionTakenModal.currentText.trim();
                  setActionTakenModal({ isOpen: false, item: null, currentText: '', userName: 'samuelgeorgiofc' });
                } catch (err: any) {
                  alert(err.message || 'Failed to save action taken.');
                } finally {
                  setIsSavingAction(false);
                }
              }}
              className="p-5 space-y-4"
            >
              {/* Context Summary */}
              <div className={`p-3 rounded-xl border text-xs space-y-1 ${borderCol} ${bgSubHeader}`}>
                <div className="flex justify-between">
                  <span className={secText}>Date & Metric:</span>
                  <span className={`font-bold ${mainText}`}>{actionTakenModal.item.date} • {actionTakenModal.item.metric}</span>
                </div>
                <div className="flex justify-between">
                  <span className={secText}>SKU:</span>
                  <span className={`font-bold truncate max-w-[280px] ${mainText}`} title={actionTakenModal.item.skuName}>
                    {actionTakenModal.item.skuName}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-700/30">
                  <span className={secText}>Adjustment Note: </span>
                  <span className={`font-medium ${mainText}`}>{actionTakenModal.item.adjustment}</span>
                </div>
              </div>

              {/* Action Taken Input */}
              <div>
                <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${mainText}`}>
                  Action Taken / Next Step Detail <span className={`text-[10px] font-normal lowercase ${secText}`}>(optional, can be edited)</span>
                </label>
                <textarea
                  rows={4}
                  value={actionTakenModal.currentText}
                  onChange={(e) => setActionTakenModal(prev => ({ ...prev, currentText: e.target.value }))}
                  placeholder="Detail operational next steps taken (e.g. reduced bid by 15%, paused creative, restocked inventory, changed targeting)..."
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-medium border outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed ${
                    isDarkMode ? 'bg-[#1e293b] border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Operator Name */}
              <div>
                <label className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1 ${mainText}`}>
                  Action Taken By
                </label>
                <input
                  type="text"
                  value={actionTakenModal.userName}
                  onChange={(e) => setActionTakenModal(prev => ({ ...prev, userName: e.target.value }))}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold border outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isDarkMode ? 'bg-[#1e293b] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActionTakenModal({ isOpen: false, item: null, currentText: '', userName: 'samuelgeorgiofc' })}
                  disabled={isSavingAction}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                    isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAction}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
                >
                  {isSavingAction ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Saving to Sheet...
                    </>
                  ) : (
                    'Save Action Taken'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

