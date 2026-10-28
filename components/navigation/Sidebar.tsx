import React from 'react';
import { CONFIG, selectClass, dateClass, dateClassDark } from '@/lib/config';

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  currentView: 'login' | 'welcome' | 'home' | 'dashboard';
  activeEngine: 'media' | 'creativeReport' | 'commerce' | 'creative' | 'signal' | 'sku' | 'pidRank' | null;
  onSelectHome: () => void;
  onSelectEngine: (engine: 'media' | 'creativeReport' | 'commerce' | 'creative' | 'signal' | 'sku' | 'pidRank') => void;
  isDarkMode: boolean;
  granularity: string;
  setGranularity: (v: string) => void;
  dateMonth: string;
  setDateMonth: (v: string) => void;
  dateWeekly: string;
  setDateWeekly: (v: string) => void;
  dateDailyStart: string;
  setDateDailyStart: (v: string) => void;
  dateDailyEnd: string;
  setDateDailyEnd: (v: string) => void;
  homeBrand: string;
  setHomeBrand: (v: string) => void;
  homeBrandOptions: string[];
  homePeriods: string[];
  availableHomeMonths: string[];
  onToggleHomeMonth: (m: string) => void;
  onSyncHomeData: () => void;
  selectedSignalPeriod: string;
  setSelectedSignalPeriod: (v: string) => void;
  signalPeriods: { key: string; start: string; end: string; label: string }[];
  filters: any;
  onFilterChange: (k: string, v: string) => void;
  onResetFilters: () => void;
  getDependentOptions: (col: string, exclude: string) => string[];
  onSyncLiveData: () => void;
  isLoading?: boolean;
  pidRankOptions?: {
    brands: string[];
    platforms: string[];
    adTypes: string[];
    clusters: string[];
  };
  isCreativeLearningMode?: boolean;
}

export default function Sidebar(props: SidebarProps) {
  const {
    isSidebarOpen, setIsSidebarOpen, currentView, activeEngine,
    onSelectHome, onSelectEngine, isDarkMode, granularity, setGranularity,
    dateMonth, setDateMonth, dateWeekly, setDateWeekly, dateDailyStart,
    setDateDailyStart, dateDailyEnd, setDateDailyEnd, homeBrand, setHomeBrand,
    homeBrandOptions, homePeriods, availableHomeMonths, onToggleHomeMonth,
    onSyncHomeData, selectedSignalPeriod, setSelectedSignalPeriod, signalPeriods,
    filters, onFilterChange, onResetFilters, getDependentOptions, onSyncLiveData,
    isLoading, pidRankOptions, isCreativeLearningMode
  } = props;

  const [isMediaGroupOpen, setIsMediaGroupOpen] = React.useState(true);
  const [isCommerceGroupOpen, setIsCommerceGroupOpen] = React.useState(true);

  return (
    <aside className={`${isSidebarOpen ? 'w-[280px]' : 'w-[72px]'} bg-[#090d16] border-r border-slate-800/80 h-screen sticky top-0 overflow-y-auto overflow-x-hidden flex-shrink-0 transition-all duration-300 ease-in-out z-40 text-slate-300 flex flex-col`}>
      <div className={`h-20 border-b border-slate-800 flex items-center bg-[#090d16] sticky top-0 z-20 transition-all ${isSidebarOpen ? 'px-5 justify-between' : 'justify-center px-0'}`}>
        {isSidebarOpen ? (
          <>
            <div className="flex flex-col justify-center overflow-hidden">
              <h1 className="text-sm font-bold text-white tracking-tight leading-tight">OMG</h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Dashboard</p>
            </div>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Collapse sidebar"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Expand sidebar"
            className="w-10 h-10 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        )}
      </div>

      <div className="pt-4 pb-4 px-3 space-y-1.5 border-b border-slate-800">
        {isSidebarOpen ? (
          <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 transition-opacity">Workspaces</p>
        ) : (
          <div className="w-8 h-[1px] bg-slate-800 mx-auto my-2" />
        )}

        <button
          onClick={onSelectHome}
          title="General Overview"
          className={`w-full rounded-md text-xs flex items-center font-semibold transition-colors ${
            isSidebarOpen ? 'px-3 py-2.5 gap-3' : 'justify-center p-3'
          } ${
            currentView === 'home'
              ? 'bg-indigo-600/15 text-white border border-indigo-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <svg className={`w-4 h-4 shrink-0 ${currentView === 'home' ? 'text-indigo-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l9-9 9 9M5 10v10h14V10M9 20v-6h6v6"></path></svg>
          {isSidebarOpen && <span className="truncate">General Overview</span>}
        </button>

        {/* Digital Media Collapsible Group */}
        <div className="space-y-1">
          <button
            onClick={() => {
              if (isSidebarOpen) {
                setIsMediaGroupOpen((prev) => !prev);
              } else {
                onSelectEngine('media');
              }
            }}
            title="Digital Media (Click to show/hide sub-pages)"
            className={`w-full rounded-md text-xs flex items-center font-semibold transition-colors ${
              isSidebarOpen ? 'px-3 py-2.5 gap-3' : 'justify-center p-3'
            } ${
              activeEngine === 'media' || activeEngine === 'creativeReport'
                ? 'bg-indigo-600/15 text-white border border-indigo-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <svg className={`w-4 h-4 shrink-0 ${activeEngine === 'media' || activeEngine === 'creativeReport' ? 'text-indigo-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            {isSidebarOpen && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="truncate">Digital Media</span>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isMediaGroupOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
          </button>

          {isSidebarOpen ? (
            isMediaGroupOpen && (
              <div className="pl-6 pr-1 space-y-1 border-l border-slate-800 ml-5 py-0.5">
                <button
                  onClick={() => onSelectEngine('media')}
                  className={`w-full rounded-md px-2.5 py-1.5 text-[11px] flex items-center gap-2 font-semibold transition-colors ${
                    activeEngine === 'media'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeEngine === 'media' ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className="truncate">Campaign Overview</span>
                </button>
                <button
                  onClick={() => onSelectEngine('creativeReport')}
                  className={`w-full rounded-md px-2.5 py-1.5 text-[11px] flex items-center gap-2 font-semibold transition-colors ${
                    activeEngine === 'creativeReport'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeEngine === 'creativeReport' ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className="truncate">Creative Report</span>
                </button>
              </div>
            )
          ) : (
            <button
              onClick={() => onSelectEngine('creativeReport')}
              title="Creative Report (Digital Media Sub-Page)"
              className={`w-full rounded-md text-xs flex items-center justify-center p-2.5 transition-colors ${
                activeEngine === 'creativeReport'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            </button>
          )}
        </div>

        {/* Commerce Collapsible Group */}
        <div className="space-y-1">
          <button
            onClick={() => {
              if (isSidebarOpen) {
                setIsCommerceGroupOpen((prev) => !prev);
              } else {
                onSelectEngine('commerce');
              }
            }}
            title="Commerce (Click to show/hide sub-pages)"
            className={`w-full rounded-md text-xs flex items-center font-semibold transition-colors ${
              isSidebarOpen ? 'px-3 py-2.5 gap-3' : 'justify-center p-3'
            } ${
              activeEngine === 'commerce' || activeEngine === 'sku' || activeEngine === 'pidRank'
                ? 'bg-indigo-600/15 text-white border border-indigo-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <svg className={`w-4 h-4 shrink-0 ${activeEngine === 'commerce' || activeEngine === 'sku' || activeEngine === 'pidRank' ? 'text-indigo-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            {isSidebarOpen && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="truncate">Commerce</span>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isCommerceGroupOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
          </button>

          {isSidebarOpen ? (
            isCommerceGroupOpen && (
              <div className="pl-6 pr-1 space-y-1 border-l border-slate-800 ml-5 py-0.5">
                <button
                  onClick={() => onSelectEngine('commerce')}
                  className={`w-full rounded-md px-2.5 py-1.5 text-[11px] flex items-center gap-2 font-semibold transition-colors ${
                    activeEngine === 'commerce'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeEngine === 'commerce' ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className="truncate">Commerce Tracker</span>
                </button>
                <button
                  onClick={() => onSelectEngine('sku')}
                  className={`w-full rounded-md px-2.5 py-1.5 text-[11px] flex items-center gap-2 font-semibold transition-colors ${
                    activeEngine === 'sku'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeEngine === 'sku' ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className="truncate">PID & SKU Analytics</span>
                </button>
                <button
                  onClick={() => onSelectEngine('pidRank')}
                  className={`w-full rounded-md px-2.5 py-1.5 text-[11px] flex items-center gap-2 font-semibold transition-colors ${
                    activeEngine === 'pidRank'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeEngine === 'pidRank' ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className="truncate">PID Push Rank Tracker</span>
                </button>
              </div>
            )
          ) : (
            <>
              <button
                onClick={() => onSelectEngine('sku')}
                title="PID & SKU Analytics (Commerce Sub-Page)"
                className={`w-full rounded-md text-xs flex items-center justify-center p-2.5 transition-colors ${
                  activeEngine === 'sku'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              </button>
              <button
                onClick={() => onSelectEngine('pidRank')}
                title="PID Push Rank Tracker (Commerce Sub-Page)"
                className={`w-full rounded-md text-xs flex items-center justify-center p-2.5 transition-colors ${
                  activeEngine === 'pidRank'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
              </button>
            </>
          )}
        </div>

        {/* Media Signal Standalone Page */}
        <button
          onClick={() => onSelectEngine('signal')}
          title="Media Signal"
          className={`w-full rounded-md text-xs flex items-center font-semibold transition-colors ${
            isSidebarOpen ? 'px-3 py-2.5 gap-3' : 'justify-center p-3'
          } ${
            activeEngine === 'signal'
              ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <svg className={`w-4 h-4 shrink-0 ${activeEngine === 'signal' ? 'text-emerald-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          {isSidebarOpen && <span className="truncate">Media Signal</span>}
        </button>
      </div>

      {isSidebarOpen && !(activeEngine === 'creativeReport' && isCreativeLearningMode) && (
        <div className="p-4 space-y-4 flex-1">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filters</p>
            <button
              onClick={onSyncLiveData}
              disabled={isLoading}
              title="Refresh / Sync Live Data"
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {currentView !== 'home' && activeEngine !== 'creative' && activeEngine !== 'signal' && (
            <div className="bg-[#111827] p-3 rounded-md border border-slate-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-400">Date Range</label>
                <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="bg-transparent text-indigo-400 text-xs font-bold outline-none cursor-pointer appearance-none pr-6 text-right dropdown-arrow bg-[length:10px_10px] bg-[position:right_center]">
                  <option value="monthly">Monthly</option><option value="weekly">Weekly MTD</option><option value="daily">Daily</option>
                </select>
              </div>
              {granularity === 'monthly' && <input type="month" value={dateMonth} onChange={(e) => setDateMonth(e.target.value)} className={isDarkMode ? dateClassDark : dateClass} />}
              {granularity === 'weekly' && <input type="date" value={dateWeekly} onChange={(e) => setDateWeekly(e.target.value)} className={isDarkMode ? dateClassDark : dateClass} />}
              {granularity === 'daily' && (
                <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center w-full">
                  <input type="date" value={dateDailyStart} onChange={(e) => setDateDailyStart(e.target.value)} className={`${isDarkMode ? dateClassDark : dateClass} !px-1 !text-xs w-full min-w-0`} />
                  <span className="text-slate-500 font-bold text-center">-</span>
                  <input type="date" value={dateDailyEnd} onChange={(e) => setDateDailyEnd(e.target.value)} className={`${isDarkMode ? dateClassDark : dateClass} !px-1 !text-xs w-full min-w-0`} />
                </div>
              )}
            </div>
          )}


          {currentView === 'home' && (
            <div className="bg-[#111827] p-3.5 rounded-md border border-slate-800 space-y-3 shadow-sm">
              <label className="block text-xs font-semibold text-slate-400">Home Filters</label>
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Brand</span>
                <select value={homeBrand} onChange={(e) => setHomeBrand(e.target.value)} className={selectClass}>
                  {homeBrandOptions.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-slate-400 font-semibold">Select Months</span>
                  <span className="text-[10px] text-indigo-400 font-medium">{homePeriods.length} selected</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 bg-[#090d16] p-2 rounded-md border border-slate-800">
                  {availableHomeMonths.map(m => {
                    const isSelected = homePeriods.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onToggleHomeMonth(m)}
                        className={`w-full text-left px-2 py-1 rounded text-xs font-medium flex items-center justify-between transition-colors ${
                          isSelected ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <span>{m}</span>
                        {isSelected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={onSyncHomeData} className="w-full bg-[#111827] hover:bg-indigo-600 text-white font-semibold py-2 rounded-md border border-slate-700 hover:border-indigo-500 transition-all text-xs">Sync Home Data</button>
            </div>
          )}

          {activeEngine === 'signal' && (
            <div className="space-y-3 px-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Period Range</label>
                <select value={selectedSignalPeriod} onChange={(e) => setSelectedSignalPeriod(e.target.value)} className={selectClass}>
                  {signalPeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {currentView !== 'home' && (
            <div className="space-y-3 px-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Brand</label>
                <select value={filters.brand} onChange={(e) => onFilterChange('brand', e.target.value)} className={selectClass}>
                  {(activeEngine === 'pidRank' && pidRankOptions
                    ? pidRankOptions.brands
                    : getDependentOptions(CONFIG[activeEngine === 'sku' ? 'commerce' : (activeEngine || 'media')].colBrand, 'brand')
                  ).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {activeEngine === 'pidRank' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Platform</label>
                    <select
                      value={filters.platform || 'All'}
                      onChange={(e) => onFilterChange('platform', e.target.value)}
                      className={selectClass}
                    >
                      {(pidRankOptions?.platforms || ['All']).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ad Type</label>
                    <select
                      value={filters.adType || 'All'}
                      onChange={(e) => onFilterChange('adType', e.target.value)}
                      className={selectClass}
                    >
                      {(pidRankOptions?.adTypes || ['All']).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Cluster / Class</label>
                    <select
                      value={filters.cluster || 'All'}
                      onChange={(e) => onFilterChange('cluster', e.target.value)}
                      className={selectClass}
                    >
                      {(pidRankOptions?.clusters || ['All']).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Search PID / SKU</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search PID or SKU..."
                        value={filters.search || ''}
                        onChange={(e) => onFilterChange('search', e.target.value)}
                        className="w-full bg-[#111827] border border-slate-700 text-white py-2 px-3 pl-8 rounded-md text-xs font-medium shadow-sm outline-none focus:border-slate-500 placeholder-slate-400 hover:border-slate-600 transition-colors"
                      />
                      <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                </>
              )}
              {activeEngine === 'media' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Funnel</label>
                    <select value={filters.funnel} onChange={(e) => onFilterChange('funnel', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.media.colFunnel, 'funnel').map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ad Type / Platform</label>
                    <select value={filters.adType} onChange={(e) => onFilterChange('adType', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.media.colAdType, 'adType').map(o => (
                        <option key={o} value={o}>
                          {o === 'All' ? 'All Ad Types / Platforms' : o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Format / Ad Type</label>
                    <select value={filters.format} onChange={(e) => onFilterChange('format', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.media.colFormat, 'format').map(o => (
                        <option key={o} value={o}>
                          {o === 'All' ? 'All Formats / Ad Types' : o}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {activeEngine === 'creativeReport' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Platform</label>
                    <select value={filters.platform} onChange={(e) => onFilterChange('platform', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.creativeReport.colPlatform, 'platform').map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ad Type</label>
                    <select value={filters.adType} onChange={(e) => onFilterChange('adType', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.creativeReport.colAdType, 'adType').map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">KPI</label>
                    <select value={filters.kpi || 'All'} onChange={(e) => onFilterChange('kpi', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.creativeReport.colKpi, 'kpi').map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Format</label>
                    <select value={filters.format} onChange={(e) => onFilterChange('format', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.creativeReport.colFormat, 'format').map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">Pillar</label>
                    <select value={filters.pillar || 'All'} onChange={(e) => onFilterChange('pillar', e.target.value)} className={selectClass}>
                      {getDependentOptions(CONFIG.creativeReport.colPillar, 'pillar').map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </>
              )}
              {(activeEngine === 'commerce' || activeEngine === 'creative') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ad Type</label>
                  <select value={filters.adType} onChange={(e) => onFilterChange('adType', e.target.value)} className={selectClass}>
                    {getDependentOptions(CONFIG[activeEngine === 'commerce' ? 'commerce' : 'creative'].colAdType, 'adType').map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              )}
              {activeEngine === 'creative' && (
                <>
                  <div><label className="block text-xs font-semibold text-slate-400 mb-1.5">Period</label><select value={filters.period} onChange={(e) => onFilterChange('period', e.target.value)} className={selectClass}>{getDependentOptions(CONFIG.creative.colPeriod, 'period').map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                  <div><label className="block text-xs font-semibold text-slate-400 mb-1.5">Platform</label><select value={filters.platform} onChange={(e) => onFilterChange('platform', e.target.value)} className={selectClass}>{getDependentOptions(CONFIG.creative.colPlatform, 'platform').map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                  <div><label className="block text-xs font-semibold text-slate-400 mb-1.5">Format</label><select value={filters.format} onChange={(e) => onFilterChange('format', e.target.value)} className={selectClass}>{getDependentOptions(CONFIG.creative.colFormat, 'format').map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                </>
              )}
              <button onClick={onResetFilters} className="w-full border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white font-semibold py-2 rounded-md transition-colors text-xs">Reset Filters</button>
            </div>
          )}
        </div>
      )}

      {isSidebarOpen && (
        <div className="p-4 bg-[#090d16] border-t border-slate-800 mt-auto">
          <button onClick={onSyncLiveData} className="w-full bg-[#111827] hover:bg-indigo-600 text-white font-semibold py-2.5 rounded-md border border-slate-700 hover:border-indigo-500 shadow-sm transition-all flex justify-center items-center gap-2 text-xs tracking-wide">Sync Live Data</button>
        </div>
      )}

    </aside>
  );
}