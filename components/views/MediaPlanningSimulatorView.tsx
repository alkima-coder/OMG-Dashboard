import React, { useState, useMemo, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import {
  CohortMetrics,
  TimeDecaySettings,
  SimulatorOverrides,
  extractAllBrandCohorts,
  extractAvailableBrands,
  computeWeightedBaselineRatios,
  computeReverseFunnel,
  DecayMode,
} from '@/lib/media-planner-engine';
import { formatIDR, formatNum, formatPct } from '@/lib/formatters';
import { parseSheetDate } from '@/lib/dateUtils';
import MediaPlanningPlaybookModal from './MediaPlanningPlaybookModal';

// Defensive Error Boundary to prevent crashing the dashboard
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class PlannerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Planner Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-200 text-center max-w-2xl mx-auto my-12">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 flex items-center justify-center font-bold text-lg">
            !
          </div>
          <h2 className="text-lg font-bold mb-1">Media Planning Simulator Temporarily Unavailable</h2>
          <p className="text-xs text-rose-700 dark:text-rose-300/80 mb-5 font-mono">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
          >
            Try Reloading Simulator
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface MediaPlanningSimulatorViewProps {
  rawData: any[];
  extraSheetsData: { mediaApi?: any[]; commerce?: any[] };
  signalPeriods: Array<{ start: string; end: string; key: string; label: string }>;
  isDarkMode: boolean;
  initialBrand?: string;
}

function MediaPlanningSimulatorContent({
  rawData,
  extraSheetsData,
  signalPeriods,
  isDarkMode,
  initialBrand = 'all',
}: MediaPlanningSimulatorViewProps) {
  // 1. Brand selection (strictly per-brand)
  const availableBrands = useMemo(() => extractAvailableBrands(rawData), [rawData]);
  const [selectedBrand, setSelectedBrand] = useState<string>(() => {
    if (initialBrand && initialBrand.toLowerCase() !== 'all') return initialBrand;
    return availableBrands[0] || 'Earth';
  });

  useEffect(() => {
    if (initialBrand && initialBrand.toLowerCase() !== 'all' && initialBrand !== selectedBrand) {
      setSelectedBrand(initialBrand);
      setOverrides({});
    } else if ((!selectedBrand || selectedBrand === 'all') && availableBrands.length > 0) {
      setSelectedBrand(availableBrands[0]);
    }
  }, [initialBrand, availableBrands, selectedBrand]);

  // 2. Time-decay configuration
  const [decaySettings, setDecaySettings] = useState<TimeDecaySettings>({
    halfLifeDays: 30,
    decayMode: 'exponential',
    useDurationNormalization: true,
  });

  const [showWeightsBreakdown, setShowWeightsBreakdown] = useState<boolean>(false);
  const [showPlaybook, setShowPlaybook] = useState<boolean>(false);

  // 3. Extract cohorts for the selected brand
  const brandCohorts = useMemo<CohortMetrics[]>(() => {
    return extractAllBrandCohorts(rawData, extraSheetsData, selectedBrand, signalPeriods);
  }, [rawData, extraSheetsData, selectedBrand, signalPeriods]);

  // 4. Compute weighted baseline ratios
  const baseline = useMemo(() => {
    return computeWeightedBaselineRatios(brandCohorts, decaySettings);
  }, [brandCohorts, decaySettings]);

  // 5. Full-Month Projected Baseline & Target GMV state
  const fullMonthBaseline = baseline.projectedFullMonthGMV > 0
    ? baseline.projectedFullMonthGMV
    : (baseline.latestGMV > 0 ? baseline.latestGMV : 100000000);

  const [targetGMVInput, setTargetGMVInput] = useState<number>(0);

  useEffect(() => {
    if (fullMonthBaseline > 0 && (targetGMVInput === 0 || targetGMVInput === null)) {
      setTargetGMVInput(fullMonthBaseline);
    }
  }, [fullMonthBaseline, targetGMVInput]);

  const handleBrandChange = (newBrand: string) => {
    setSelectedBrand(newBrand);
    const cohorts = extractAllBrandCohorts(rawData, extraSheetsData, newBrand, signalPeriods);
    const newBaseline = computeWeightedBaselineRatios(cohorts, decaySettings);
    const newFullMonth = newBaseline.projectedFullMonthGMV > 0
      ? newBaseline.projectedFullMonthGMV
      : newBaseline.latestGMV;
    if (newFullMonth > 0) {
      setTargetGMVInput(newFullMonth);
    }
    setOverrides({});
  };

  // 6. User overrides (Always Balanced Growth by default, user can adjust CPMs and Shares)
  const [overrides, setOverrides] = useState<SimulatorOverrides>({});

  const handleResetOverrides = () => {
    setOverrides({});
  };

  const applyGmvPreset = (multiplier: number) => {
    const baseVal = fullMonthBaseline;
    setTargetGMVInput(Math.round(baseVal * multiplier));
  };

  // 7. Calculate Reverse-Funnel targets
  const simulation = useMemo(() => {
    const gmv = targetGMVInput > 0 ? targetGMVInput : fullMonthBaseline;
    return computeReverseFunnel(baseline, gmv, overrides);
  }, [baseline, targetGMVInput, fullMonthBaseline, overrides]);

  const {
    funnelStages,
    totalRequiredSpend,
    projectedROAS,
    conversionROAS,
    blendedROAS,
    requiredPaidImpressions,
    requiredPaidEngagements,
    requiredItemsSold,
  } = simulation;

  // Target Planning Month state
  const defaultPlanningMonth = useMemo(() => {
    if (baseline.latestEndDate) {
      const d = parseSheetDate(baseline.latestEndDate);
      if (d && !isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      }
    }
    return '2026-10-01';
  }, [baseline.latestEndDate]);

  const [selectedPlanningMonth, setSelectedPlanningMonth] = useState<string>(defaultPlanningMonth);

  useEffect(() => {
    if (defaultPlanningMonth) {
      setSelectedPlanningMonth(defaultPlanningMonth);
    }
  }, [defaultPlanningMonth]);

  const currentMonthInfo = useMemo(() => {
    const d = parseSheetDate(selectedPlanningMonth);
    const m = d && !isNaN(d.getTime()) ? d.getMonth() + 1 : 10;
    const y = d && !isNaN(d.getTime()) ? d.getFullYear() : 2026;
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const daysInMonth = new Date(y, m, 0).getDate();
    return {
      monthNum: m,
      monthName: monthNames[m] || 'October',
      year: y,
      ddDay: m,
      ddLabel: `${m}.${m}`,
      daysInMonth,
    };
  }, [selectedPlanningMonth]);

  return (
    <div className="w-full space-y-6">
      {/* 1. PLANNER CONTROL HEADER */}
      <div className={`p-5 rounded-xl border shadow-sm space-y-5 transition-colors ${
        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white">
                Planner Engine
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                TikTok Ecosystem Only
              </span>
              <h2 className={`text-xl font-extrabold tracking-tight ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}>
                Reverse-Funnel Media Planning Simulator
              </h2>
            </div>
            <p className={`text-xs font-medium mt-1 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Reverse-engineer impressions, touchpoints, and required ad spend strictly for <strong>TikTok Shop GMV</strong> using time-decay historical baselines.
            </p>
          </div>

          {/* Action Header Controls: Brand, Month, and Playbook Button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className={`text-xs font-bold uppercase tracking-wider ${
                isDarkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                Brand Plan:
              </label>
              <select
                value={selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                {availableBrands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className={`text-xs font-bold uppercase tracking-wider ${
                isDarkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                Planning Month:
              </label>
              <select
                value={selectedPlanningMonth}
                onChange={(e) => setSelectedPlanningMonth(e.target.value)}
                className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option value="2026-07-01">July 2026 (7.7 D-Day Peak)</option>
                <option value="2026-08-01">August 2026 (8.8 D-Day Peak)</option>
                <option value="2026-09-01">September 2026 (9.9 D-Day Peak)</option>
                <option value="2026-10-01">October 2026 (10.10 D-Day Peak)</option>
                <option value="2026-11-01">November 2026 (11.11 D-Day Peak)</option>
                <option value="2026-12-01">December 2026 (12.12 D-Day Peak)</option>
              </select>
            </div>

            {/* Playbook Button */}
            <button
              type="button"
              onClick={() => setShowPlaybook(true)}
              className={`px-3.5 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-sm ${
                isDarkMode
                  ? 'bg-indigo-950/40 text-indigo-300 border-indigo-700/60 hover:bg-indigo-900/50 hover:text-white'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-900'
              }`}
              title="Open Media Planning Playbook & Framework Guide"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Planning Playbook</span>
            </button>
          </div>
        </div>

        {/* Row 2: Target GMV Controls & Time-Decay Weighting */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Target GMV Input & Presets (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className={`text-xs font-bold uppercase tracking-wider ${
                isDarkMode ? 'text-indigo-400' : 'text-indigo-700'
              }`}>
                Target TikTok Shop GMV (Full-Month Target)
              </label>
              {baseline.latestGMV > 0 && (
                <div className={`text-xs text-left sm:text-right flex flex-wrap gap-2 items-center ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>
                    Latest Actual: <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{formatIDR(baseline.latestGMV)}</strong>
                    <span className="text-[10px] ml-1">({baseline.latestCohortDays}d MTD)</span>
                  </span>
                  <span className={isDarkMode ? 'text-slate-600' : 'text-slate-300'}>•</span>
                  <span>
                    Full-Month Run-Rate: <strong className={isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}>{formatIDR(baseline.projectedFullMonthGMV)}</strong>
                    <span className="text-[10px] ml-1">({((baseline.pacingCumulativeGMV || 1) * 100).toFixed(1)}% paced)</span>
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold ${
                  isDarkMode ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  Rp
                </span>
                <input
                  type="number"
                  min={0}
                  step={1000000}
                  value={targetGMVInput || ''}
                  onChange={(e) => setTargetGMVInput(Math.max(0, Number(e.target.value)))}
                  placeholder="Enter full month TikTok Shop target GMV..."
                  className={`w-full pl-11 pr-4 py-2.5 rounded-lg border font-mono font-bold text-base outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                    isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Quick Presets based on Full-Month Run-Rate */}
              <div className={`inline-flex rounded-lg shadow-sm border overflow-hidden shrink-0 ${
                isDarkMode ? 'border-slate-700' : 'border-slate-300'
              }`}>
                {[
                  { label: '0.5x', mult: 0.5, title: 'Target -50% (High Efficiency)' },
                  { label: '0.75x', mult: 0.75, title: 'Target -25% (Efficiency focus)' },
                  { label: '1x Run-Rate', mult: 1.0, title: 'Target 1x Full-Month Projected Baseline' },
                  { label: '+25%', mult: 1.25, title: 'Target +25% vs Baseline Run-Rate' },
                  { label: '+50%', mult: 1.5, title: 'Target +50% vs Baseline Run-Rate' },
                  { label: '2x', mult: 2.0, title: 'Target 2x vs Baseline Run-Rate' },
                ].map((btn, idx) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => applyGmvPreset(btn.mult)}
                    title={btn.title}
                    className={`px-2.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
                      idx > 0 ? (isDarkMode ? 'border-l border-slate-700' : 'border-l border-slate-300') : ''
                    } ${
                      isDarkMode
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`flex flex-wrap items-center justify-between text-xs font-mono gap-1 pt-0.5 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-600'
            }`}>
              <span>Formatted: <strong className={isDarkMode ? 'text-indigo-400' : 'text-indigo-700'}>{formatIDR(targetGMVInput || 0)}</strong></span>
              {fullMonthBaseline > 0 && targetGMVInput > 0 && (
                <span>
                  Growth: <strong className={targetGMVInput >= fullMonthBaseline ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-700') : (isDarkMode ? 'text-amber-400' : 'text-amber-700')}>
                    {targetGMVInput >= fullMonthBaseline ? '+' : ''}{(((targetGMVInput - fullMonthBaseline) / fullMonthBaseline) * 100).toFixed(1)}% vs Run-Rate
                  </strong>
                </span>
              )}
              {simulation.dynamics && simulation.dynamics.scaleRatio !== 1 && (
                <span>
                  Scale Efficiency:{' '}
                  <strong className={simulation.dynamics.roasElasticityMultiplier >= 1 ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-700') : (isDarkMode ? 'text-amber-400' : 'text-amber-700')}>
                    {simulation.dynamics.roasElasticityMultiplier >= 1 ? '+' : ''}{((simulation.dynamics.roasElasticityMultiplier - 1) * 100).toFixed(1)}% ROAS
                  </strong>
                </span>
              )}
            </div>
          </div>

          {/* Time-Decay Settings Controls (5 cols) */}
          <div className={`lg:col-span-5 p-4 rounded-xl border space-y-3 transition-colors ${
            isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${
                isDarkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                Time-Decay Model
              </span>
              <button
                type="button"
                onClick={() => setShowWeightsBreakdown(v => !v)}
                className={`text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                  isDarkMode ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-800'
                }`}
              >
                <span>{brandCohorts.length} Cohorts Loaded</span>
                <span>{showWeightsBreakdown ? '(Hide)' : '(View Weights)'}</span>
              </button>
            </div>

            {/* Decay Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium w-16 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Mode:</span>
              <div className={`inline-flex rounded-lg p-0.5 border text-xs ${
                isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-white'
              }`}>
                {(['exponential', 'linear', 'equal'] as DecayMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDecaySettings(s => ({ ...s, decayMode: mode }))}
                    className={`px-2.5 py-1 rounded text-xs font-bold capitalize transition-colors cursor-pointer ${
                      decaySettings.decayMode === mode
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Half-Life Slider */}
            {decaySettings.decayMode !== 'equal' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Half-Life (H):</span>
                  <span className={`font-mono font-bold ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>
                    {decaySettings.halfLifeDays} days
                  </span>
                </div>
                <input
                  type="range"
                  min={7}
                  max={90}
                  step={1}
                  value={decaySettings.halfLifeDays}
                  onChange={(e) => setDecaySettings(s => ({ ...s, halfLifeDays: Number(e.target.value) }))}
                  className="w-full accent-indigo-600 cursor-pointer h-1.5 rounded-lg bg-slate-200 dark:bg-slate-700"
                />
                <div className={`flex justify-between text-[10px] font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <span>7d (Recent)</span>
                  <span>30d (Default)</span>
                  <span>90d (Broad)</span>
                </div>
              </div>
            )}

            {/* Duration Normalization */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className={`flex items-center gap-2 cursor-pointer font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <input
                  type="checkbox"
                  checked={decaySettings.useDurationNormalization}
                  onChange={(e) => setDecaySettings(s => ({ ...s, useDurationNormalization: e.target.checked }))}
                  className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Weight proportional to duration (days in cohort)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Weights Breakdown Drawer */}
        {showWeightsBreakdown && (
          <div className={`p-4 rounded-xl border space-y-2.5 transition-colors ${
            isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <h4 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Time-Decayed Cohort Weight Distribution ({selectedBrand})
              </h4>
              <span className={`text-[11px] font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Sum of Weights = 100.00%
              </span>
            </div>

            {baseline.weights.length === 0 ? (
              <p className={`text-xs italic py-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                No historical cohorts found for {selectedBrand}. Simulator using default industry efficiency benchmarks.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className={`border-b text-[10px] font-bold uppercase tracking-wider ${
                      isDarkMode ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-600'
                    }`}>
                      <th className="py-2 px-3">Cohort Period</th>
                      <th className="py-2 px-3 text-right">Duration</th>
                      <th className="py-2 px-3 text-right">Age (vs Latest)</th>
                      <th className="py-2 px-3 text-right">Cohort GMV</th>
                      <th className="py-2 px-3 text-right">Normalized Weight</th>
                      <th className="py-2 px-4 w-40">Impact Visual</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-200'}`}>
                    {baseline.weights.map((wb) => (
                      <tr key={wb.cohortKey} className={isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100/50'}>
                        <td className={`py-2 px-3 font-mono font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {wb.startDate} to {wb.endDate}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {wb.durationDays} days
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {wb.ageDays} days ago
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
                          {formatIDR(wb.gmv)}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                          {(wb.normalizedWeight * 100).toFixed(2)}%
                        </td>
                        <td className="py-2 px-4">
                          <div className={`w-full h-2 rounded-full overflow-hidden ${
                            isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                          }`}>
                            <div
                              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(0, wb.normalizedWeight * 100))}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. TOP KPI SUMMARY STRIP (6 CARDS WITH HIGH CONTRAST) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Target GMV */}
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between border-t-2 border-t-indigo-600 ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-[11px] font-bold uppercase tracking-wider ${
                isDarkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                Target TikTok GMV
              </p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
              }`}>
                {baseline.latestCohortMonthDays || 30}d Month
              </span>
            </div>
            <h3 className={`text-xl font-extrabold font-mono ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}>
              {formatIDR(targetGMVInput || 0)}
            </h3>
          </div>
          <div className={`text-[11px] mt-2 pt-2 border-t font-mono ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'
          }`}>
            <span>~{formatIDR(Math.round((targetGMVInput || 0) / (baseline.latestCohortMonthDays || 30)))}/day</span>
          </div>
        </div>

        {/* Card 2: Required Shop Ad Spend (Conversion) */}
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between border-t-2 border-t-rose-500 ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-[11px] font-bold uppercase tracking-wider ${
                isDarkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                Required Shop Ad Spend
              </p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold font-mono border ${
                isDarkMode ? 'bg-rose-950/40 text-rose-300 border-rose-800/40' : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {((funnelStages.conversion.requiredSpend / (targetGMVInput || fullMonthBaseline)) * 100).toFixed(1)}% CIR
              </span>
            </div>
            <h3 className={`text-xl font-extrabold font-mono ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}>
              {formatIDR(funnelStages.conversion.requiredSpend)}
            </h3>
            <p className={`text-[11px] mt-0.5 font-medium ${
              isDarkMode ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Direct Shop Conversion Ads
            </p>
          </div>
          <div className={`text-[10px] mt-2 pt-2 border-t flex justify-between items-center font-mono ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'
          }`}>
            <span>Branding: {formatIDR(funnelStages.awareness.requiredSpend + funnelStages.consideration.requiredSpend)}</span>
            <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Total: {formatIDR(totalRequiredSpend)}</span>
          </div>
        </div>

        {/* Card 3: Projected ROAS */}
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between border-t-2 border-t-emerald-500 ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className={`text-[11px] font-bold uppercase tracking-wider ${
                isDarkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                TikTok Shop ROAS
              </p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${
                isDarkMode ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                Conv Only
              </span>
            </div>
            <h3 className={`text-xl font-black font-mono ${
              isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
            }`}>
              {projectedROAS > 0 ? `${projectedROAS.toFixed(2)}x` : '-'}
            </h3>
          </div>
          <div className={`text-[10px] mt-2 pt-2 border-t flex justify-between items-center font-mono ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'
          }`}>
            <span>GMV / Conv Spend</span>
            <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Blended: {blendedROAS > 0 ? `${blendedROAS.toFixed(2)}x` : '-'}
            </span>
          </div>
        </div>

        {/* Card 4: Required Paid Impressions */}
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between border-t-2 ${
          isDarkMode ? 'bg-slate-900 border-slate-800 border-t-slate-600' : 'bg-white border-slate-200 border-t-slate-400'
        }`}>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              TikTok Paid Imp
            </p>
            <h3 className={`text-xl font-extrabold font-mono ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}>
              {formatNum(requiredPaidImpressions)}
            </h3>
          </div>
          <p className={`text-[11px] mt-2 pt-2 border-t ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'
          }`}>
            Full-Funnel TikTok Ads
          </p>
        </div>

        {/* Card 5: Required Paid Engagements */}
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between border-t-2 ${
          isDarkMode ? 'bg-slate-900 border-slate-800 border-t-slate-600' : 'bg-white border-slate-200 border-t-slate-400'
        }`}>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Paid Engagements
            </p>
            <h3 className={`text-xl font-extrabold font-mono ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}>
              {formatNum(requiredPaidEngagements)}
            </h3>
          </div>
          <p className={`text-[11px] mt-2 pt-2 border-t ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'
          }`}>
            Upper-Funnel Driver
          </p>
        </div>

        {/* Card 6: Required Items Sold */}
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between border-t-2 ${
          isDarkMode ? 'bg-slate-900 border-slate-800 border-t-slate-600' : 'bg-white border-slate-200 border-t-slate-400'
        }`}>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              TikTok Items Sold
            </p>
            <h3 className={`text-xl font-extrabold font-mono ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}>
              {formatNum(requiredItemsSold)}
            </h3>
          </div>
          <p className={`text-[11px] mt-2 pt-2 border-t font-mono ${
            isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'
          }`}>
            @ {formatIDR(simulation.activeRatios.aov)} AOV
          </p>
        </div>
      </div>

      {/* 3. FUNNEL BUDGET ALLOCATION SECTION (PRIMARY OUTPUT) */}
      <div className={`p-5 rounded-xl border shadow-sm space-y-4 transition-colors ${
        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
          isDarkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div>
            <h3 className={`text-base font-bold tracking-tight ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}>
              TikTok Funnel Budget Allocation & Delivery Matrix
            </h3>
            <p className={`text-xs mt-0.5 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Ad spend and impression distribution across Awareness, Consideration, and Shop Conversion funnels.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetOverrides}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Reset to Historical Baseline
            </button>
          </div>
        </div>

        {/* Stacked Progress Bar (Spend Split) */}
        <div className="space-y-1.5">
          <div className={`flex justify-between text-[11px] font-bold uppercase tracking-wider ${
            isDarkMode ? 'text-slate-400' : 'text-slate-600'
          }`}>
            <span>Spend Distribution by Funnel Stage</span>
            <span>Total: <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{formatIDR(totalRequiredSpend)}</strong></span>
          </div>

          <div className={`w-full h-7 rounded-lg overflow-hidden flex border ${
            isDarkMode ? 'border-slate-800 bg-slate-800' : 'border-slate-200 bg-slate-100'
          }`}>
            <div
              className="bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold font-mono transition-all duration-500 overflow-hidden px-1"
              style={{ width: `${Math.max(2, funnelStages.awareness.spendSharePct)}%` }}
              title={`Awareness: ${funnelStages.awareness.spendSharePct.toFixed(1)}% (${formatIDR(funnelStages.awareness.requiredSpend)})`}
            >
              Awareness {funnelStages.awareness.spendSharePct.toFixed(0)}%
            </div>
            <div
              className="bg-slate-500 dark:bg-slate-600 flex items-center justify-center text-white text-[10px] font-bold font-mono transition-all duration-500 overflow-hidden px-1"
              style={{ width: `${Math.max(2, funnelStages.consideration.spendSharePct)}%` }}
              title={`Consideration: ${funnelStages.consideration.spendSharePct.toFixed(1)}% (${formatIDR(funnelStages.consideration.requiredSpend)})`}
            >
              Consideration {funnelStages.consideration.spendSharePct.toFixed(0)}%
            </div>
            <div
              className="bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold font-mono transition-all duration-500 overflow-hidden px-1"
              style={{ width: `${Math.max(2, funnelStages.conversion.spendSharePct)}%` }}
              title={`Conversion: ${funnelStages.conversion.spendSharePct.toFixed(1)}% (${formatIDR(funnelStages.conversion.requiredSpend)})`}
            >
              Conversion {funnelStages.conversion.spendSharePct.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Interactive Funnel Table with Clean High Contrast */}
        <div className="overflow-x-auto w-full pt-1">
          <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
            <thead>
              <tr className={`border-b text-xs font-bold uppercase tracking-wider ${
                isDarkMode ? 'bg-slate-800/80 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}>
                <th className="py-3 px-4">Funnel Stage</th>
                <th className="py-3 px-4 text-right">Impression Share (%)</th>
                <th className="py-3 px-4 text-right">Required Impressions</th>
                <th className="py-3 px-4 text-right">Weighted CPM (IDR)</th>
                <th className="py-3 px-4 text-right">Required Spend (IDR)</th>
                <th className="py-3 px-4 text-right">Spend Share (%)</th>
                <th className="py-3 px-4 text-right">Projected New Audience</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-mono text-xs ${
              isDarkMode ? 'divide-slate-800' : 'divide-slate-200'
            }`}>
              {/* Awareness Row */}
              <tr className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-sans font-bold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>TikTok Awareness</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={100}
                      value={Number(funnelStages.awareness.impSharePct.toFixed(2))}
                      onChange={(e) => {
                        const val = Number(e.target.value) / 100;
                        setOverrides(o => ({
                          ...o,
                          funnelImpShare: {
                            ...o.funnelImpShare,
                            awareness: val,
                          }
                        }));
                      }}
                      className={`w-20 px-2 py-1 rounded border text-right font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500 ${
                        isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>%</span>
                  </div>
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(funnelStages.awareness.requiredImpressions)}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Rp</span>
                    <input
                      type="number"
                      step={10}
                      min={0}
                      value={Math.round(funnelStages.awareness.cpm)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setOverrides(o => ({
                          ...o,
                          funnelCPM: {
                            ...o.funnelCPM,
                            awareness: val,
                          }
                        }));
                      }}
                      className={`w-24 px-2 py-1 rounded border text-right font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500 ${
                        isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                  {formatIDR(funnelStages.awareness.requiredSpend)}
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {funnelStages.awareness.spendSharePct.toFixed(2)}%
                </td>
                <td className={`py-3 px-4 text-right ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {formatNum(funnelStages.awareness.projectedNewAudience)}
                </td>
              </tr>

              {/* Consideration Row */}
              <tr className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-sans font-bold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                  <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>TikTok Consideration</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={100}
                      value={Number(funnelStages.consideration.impSharePct.toFixed(2))}
                      onChange={(e) => {
                        const val = Number(e.target.value) / 100;
                        setOverrides(o => ({
                          ...o,
                          funnelImpShare: {
                            ...o.funnelImpShare,
                            consideration: val,
                          }
                        }));
                      }}
                      className={`w-20 px-2 py-1 rounded border text-right font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500 ${
                        isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>%</span>
                  </div>
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(funnelStages.consideration.requiredImpressions)}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Rp</span>
                    <input
                      type="number"
                      step={10}
                      min={0}
                      value={Math.round(funnelStages.consideration.cpm)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setOverrides(o => ({
                          ...o,
                          funnelCPM: {
                            ...o.funnelCPM,
                            consideration: val,
                          }
                        }));
                      }}
                      className={`w-24 px-2 py-1 rounded border text-right font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500 ${
                        isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>
                  {formatIDR(funnelStages.consideration.requiredSpend)}
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {funnelStages.consideration.spendSharePct.toFixed(2)}%
                </td>
                <td className={`py-3 px-4 text-right ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {formatNum(funnelStages.consideration.projectedNewAudience)}
                </td>
              </tr>

              {/* Conversion Row */}
              <tr className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-sans font-bold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>TikTok Conversion (Shop Ads)</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={100}
                      value={Number(funnelStages.conversion.impSharePct.toFixed(2))}
                      onChange={(e) => {
                        const val = Number(e.target.value) / 100;
                        setOverrides(o => ({
                          ...o,
                          funnelImpShare: {
                            ...o.funnelImpShare,
                            conversion: val,
                          }
                        }));
                      }}
                      className={`w-20 px-2 py-1 rounded border text-right font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500 ${
                        isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>%</span>
                  </div>
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(funnelStages.conversion.requiredImpressions)}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center gap-1">
                    <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Rp</span>
                    <input
                      type="number"
                      step={10}
                      min={0}
                      value={Math.round(funnelStages.conversion.cpm)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setOverrides(o => ({
                          ...o,
                          funnelCPM: {
                            ...o.funnelCPM,
                            conversion: val,
                          }
                        }));
                      }}
                      className={`w-24 px-2 py-1 rounded border text-right font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500 ${
                        isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  {formatIDR(funnelStages.conversion.requiredSpend)}
                </td>
                <td className={`py-3 px-4 text-right font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {funnelStages.conversion.spendSharePct.toFixed(2)}%
                </td>
                <td className={`py-3 px-4 text-right ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {formatNum(funnelStages.conversion.projectedNewAudience)}
                </td>
              </tr>

              {/* Total Summary Row */}
              <tr className={`border-t-2 font-bold ${
                isDarkMode ? 'bg-slate-800/80 text-white border-slate-700' : 'bg-slate-100 text-slate-900 border-slate-300'
              }`}>
                <td className="py-3.5 px-4 font-sans uppercase tracking-wider text-xs">
                  Total TikTok Funnel
                </td>
                <td className={`py-3.5 px-4 text-right ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  100.00%
                </td>
                <td className={`py-3.5 px-4 text-right font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(requiredPaidImpressions)}
                </td>
                <td className={`py-3.5 px-4 text-right ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Blended
                </td>
                <td className={`py-3.5 px-4 text-right text-sm font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatIDR(totalRequiredSpend)}
                </td>
                <td className={`py-3.5 px-4 text-right ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  100.00%
                </td>
                <td className={`py-3.5 px-4 text-right ${isDarkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                  {formatNum(
                    funnelStages.awareness.projectedNewAudience +
                    funnelStages.consideration.projectedNewAudience +
                    funnelStages.conversion.projectedNewAudience
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Dynamic Funnel Delivery Notes */}
        {simulation.dynamics && (
          <div className={`p-4 rounded-lg border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            isDarkMode ? 'bg-slate-800/50 border-slate-700/60 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="space-y-0.5">
              <div>
                <strong className={`font-sans ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Historical Delivery Dynamics:
                </strong>{' '}
                <span>
                  Blended CPM: <strong className="font-mono">{formatIDR(Math.round(simulation.dynamics.blendedCPM))}</strong> •{' '}
                  Effective ER%: <strong className="font-mono">{formatPct(simulation.dynamics.effectiveErRate)}</strong> •{' '}
                  Engagement Multiplier:{' '}
                  <strong className="font-mono">
                    {simulation.dynamics.funnelEngMultiplier.toFixed(2)}x
                  </strong>
                </span>
              </div>
              <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Consideration proportion drives engagement intensity and 6s video views, while Awareness optimizes blended CPM to maximize top-of-funnel reach.
              </p>
            </div>
            {simulation.dynamics.scaleRatio !== 1 && (
              <div className={`text-left md:text-right shrink-0 pt-2 md:pt-0 border-t md:border-t-0 ${
                isDarkMode ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <span className={`text-[10px] uppercase font-bold block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  ROAS Elasticity
                </span>
                <span className={`font-bold font-mono text-sm ${
                  simulation.dynamics.roasElasticityMultiplier >= 1
                    ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-700')
                    : (isDarkMode ? 'text-amber-400' : 'text-amber-700')
                }`}>
                  {simulation.dynamics.roasElasticityMultiplier >= 1 ? '+' : ''}{((simulation.dynamics.roasElasticityMultiplier - 1) * 100).toFixed(1)}% ROAS Efficiency
                </span>
                <span className={`text-[10px] block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {simulation.dynamics.roasElasticityMultiplier >= 1 ? 'Focus on core high-intent' : 'Broader audience scaling'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. REVERSE-FUNNEL STEP-BY-STEP PIPELINE VISUALIZER */}
      <div className={`p-5 rounded-xl border shadow-sm space-y-5 transition-colors ${
        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className={`pb-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <h3 className={`text-base font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            Reverse-Funnel Step-by-Step Pipeline Visualizer
          </h3>
          <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Transparent breakdown of intermediate ratios and reverse scaling from TikTok Shop GMV to required scale touchpoints.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* STEP 1: Commerce Demand */}
          <div className={`p-4 rounded-lg border space-y-3 ${
            isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-800 border-slate-300'
              }`}>
                Step 1
              </span>
              <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Commerce Demand
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Target TikTok Shop GMV
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatIDR(targetGMVInput || 0)}
                </span>
              </div>

              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Weighted AOV:</span>
                  <span className="font-mono">{formatIDR(simulation.activeRatios.aov)}</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Required Items Sold
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetItemsSold)}
                </span>
              </div>

              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Item / PCC Ratio:</span>
                  <span className="font-mono">{(baseline.itemPerPccRatio * 100).toFixed(2)}%</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Product Card Clicks
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetProductCardClicks)}
                </span>
              </div>
            </div>
          </div>

          {/* STEP 2: Intent Signal */}
          <div className={`p-4 rounded-lg border space-y-3 ${
            isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-800 border-slate-300'
              }`}>
                Step 2
              </span>
              <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Intent Signal
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Click-to-Item CR:</span>
                  <span className="font-mono">{formatPct(simulation.activeRatios.cr)}</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Required Clicks
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetClicks)}
                </span>
              </div>

              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Search / Click Ratio:</span>
                  <span className="font-mono">{(baseline.searchPerClickRatio * 100).toFixed(2)}%</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Search Volumes
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetSearchVolumes)}
                </span>
              </div>

              <div className={`p-2.5 rounded border text-[11px] space-y-1 font-sans ${
                isDarkMode ? 'bg-slate-900 border-slate-750 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
              }`}>
                <span>Conversion Rate Formula:</span>
                <p className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">Clicks = Items Sold / CR</p>
              </div>
            </div>
          </div>

          {/* STEP 3: Engagement & Attention */}
          <div className={`p-4 rounded-lg border space-y-3 ${
            isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-800 border-slate-300'
              }`}>
                Step 3
              </span>
              <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                ER & Attention
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>PCC / Paid Eng:</span>
                  <span className="font-mono">{(baseline.pccPerPaidEngRatio * 100).toFixed(2)}%</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Paid Engagements
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetPaidEngagements)}
                </span>
              </div>

              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Total Eng (Paid+Org):</span>
                  <span className="font-mono">{formatNum(simulation.targetTotalEngagements)}</span>
                </div>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Organic Share:</span>
                  <span className="font-mono">{formatPct(baseline.organicEngShare)}</span>
                </div>
              </div>

              {/* Attention Touchpoints Breakdown */}
              <div className={`p-2.5 rounded border space-y-1 text-[10px] ${
                isDarkMode ? 'bg-slate-900 border-slate-750 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
              }`}>
                <span className={`text-[9px] uppercase tracking-wider font-sans block font-bold ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Attention Touchpoints Required
                </span>
                <div className="flex justify-between">
                  <span>6s Video Views:</span>
                  <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{formatNum(simulation.targetTouchpoints.views6s)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>100% Views:</span>
                  <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{formatNum(simulation.targetTouchpoints.views100)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Likes:</span>
                  <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{formatNum(simulation.targetTouchpoints.likes)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4: Scale Signal */}
          <div className={`p-4 rounded-lg border space-y-3 ${
            isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-800 border-slate-300'
              }`}>
                Step 4
              </span>
              <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Scale Impressions
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Paid ER Rate:</span>
                  <span className="font-mono">{formatPct(simulation.activeRatios.erRate)}</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Paid Impressions
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetPaidImpressions)}
                </span>
              </div>

              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Paid Imp Share:</span>
                  <span className="font-mono">{formatPct(baseline.paidImpShare)}</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Total Impressions
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetTotalImpressions)}
                </span>
              </div>

              <div className={`p-2.5 rounded border space-y-1 ${
                isDarkMode ? 'bg-slate-900 border-slate-750' : 'bg-white border-slate-200'
              }`}>
                <div className={`flex justify-between items-center text-[10px] font-sans ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <span>Organic Imp Share:</span>
                  <span className="font-mono">{formatPct(baseline.organicImpShare)}</span>
                </div>
                <span className={`text-[10px] uppercase font-semibold font-sans block ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Organic Impressions
                </span>
                <span className={`font-bold text-sm block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatNum(simulation.targetOrganicImpressions)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Media Planning Playbook Modal */}
      <MediaPlanningPlaybookModal
        isOpen={showPlaybook}
        onClose={() => setShowPlaybook(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}

export default function MediaPlanningSimulatorView(props: MediaPlanningSimulatorViewProps) {
  return (
    <PlannerErrorBoundary>
      <MediaPlanningSimulatorContent {...props} />
    </PlannerErrorBoundary>
  );
}
