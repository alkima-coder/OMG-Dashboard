'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatIDR, formatNum, formatPct, renderGR, parseNum } from '@/lib/formatters';
import { parseSheetDate, toYMD } from '@/lib/dateUtils';
import { parseCreativeLinks, ParsedCreativeMediaItem } from '@/lib/mediaUtils';
import {
  classifyCreativeCohort,
  ClassifiedCreativeRow,
  CreativeClassificationStatus,
  CohortBenchmarks,
  CLASSIFICATION_META,
  buildCohortId,
  normalizeCreativeVideoKey,
  isCpasSalesAdType,
  selectTopCohortWinners,
} from '@/lib/creative-classifier';

interface CreativeReportViewProps {
  rawData?: any[];
  curData: any[];
  prevData: any[];
  globalDates: any;
  granularity: string;
  isDarkMode: boolean;
  dashboardContext: string;
  setDashboardContext: (c: string) => void;
  onSwitchSubPage: (subPage: 'media' | 'creativeReport') => void;
  filters: any;
  onLearningModeChange?: (active: boolean) => void;
  userRole?: 'planner' | 'viewer';
}

interface CreativeMetrics {
  spend: number;
  imp: number;
  clicks: number;
  v6: number;
  v15: number;
  purchase: number;
  gmv: number;
  engagement: number;
  er: number;
  roas: number;
  cr: number;
  cpm: number;
  ctr: number;
  vtr6: number;
  vtr15: number;
  qualityRate: number;
  retention6to15: number;
  cpc: number;
  cpv6: number;
  cpv15: number;
}

interface AggregatedCreativeRow {
  key: string;
  brand: string;
  platform: string;
  adType: string;
  kpi: string;
  format: string;
  adGroup: string;
  pillar: string;
  creativeName: string;
  creativeLink: string;
  mediaItems: ParsedCreativeMediaItem[];
  creativeCount: number;
  cur: CreativeMetrics;
  prev: CreativeMetrics;
  status: CreativeClassificationStatus;
  statusLabel: string;
  qrVsMedianPct: number;
  weightedQualityPct: number;
  isSpendValid: boolean;
  benchmarks: CohortBenchmarks;
  bucketsCur: Record<string, CreativeMetrics>;
  bucketsPrev: Record<string, CreativeMetrics>;
  dailyMap: Record<string, { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase: number; gmv: number; engagement: number }>;
}

interface CachedCohortLearningItem {
  cohort_id: string;
  creative_signature_hash: string;
  brand: string;
  ad_type: string;
  week_key: string;
  analyzed_at: string;
  ai_report_markdown: string;
  classified_creatives_json: string;
}

export interface TueSunWeekOption {
  key: string;
  startYMD: string;
  endYMD: string;
  label: string;
}

/**
 * Generates Tuesday - Sunday weekly date ranges for a given YYYY-MM month,
 * displaying the exact dates directly (e.g., "Week 2: 6 - 11 Oct (Tue–Sun)").
 */
function buildTueSunWeeksForMonth(yyyyMm: string): TueSunWeekOption[] {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return [];
  const [yStr, mStr] = yyyyMm.split('-');
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIdx)) return [];

  const firstDayOfMonth = new Date(year, monthIdx, 1);
  const lastDayOfMonth = new Date(year, monthIdx + 1, 0);
  const monthShort = firstDayOfMonth.toLocaleString('en-GB', { month: 'short' });
  const monthFullLabel = firstDayOfMonth.toLocaleString('en-GB', { month: 'short', year: 'numeric' });

  const fmtYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const options: TueSunWeekOption[] = [
    {
      key: 'ALL_MONTH',
      startYMD: fmtYMD(firstDayOfMonth),
      endYMD: fmtYMD(lastDayOfMonth),
      label: `All Weeks in ${monthFullLabel} (1 - ${lastDayOfMonth.getDate()} ${monthShort})`,
    },
  ];

  // Find the first Tuesday on or before the 1st of the month whose Sunday falls in this month
  const cursor = new Date(year, monthIdx, 1);
  const daysSinceTuesday = (cursor.getDay() - 2 + 7) % 7;
  cursor.setDate(cursor.getDate() - daysSinceTuesday);

  let weekNum = 1;
  while (cursor <= lastDayOfMonth) {
    const tue = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const sun = new Date(tue.getFullYear(), tue.getMonth(), tue.getDate() + 5); // Tuesday + 5 days = Sunday

    // Include this Tuesday-Sunday window if its Sunday is on/after the 1st of the month
    if (sun >= firstDayOfMonth) {
      const startYMD = fmtYMD(tue);
      const endYMD = fmtYMD(sun);
      const tueMon = tue.toLocaleString('en-GB', { month: 'short' });
      const sunMon = sun.toLocaleString('en-GB', { month: 'short' });
      const dateRangeText =
        tue.getMonth() === sun.getMonth()
          ? `${tue.getDate()} - ${sun.getDate()} ${sunMon}`
          : `${tue.getDate()} ${tueMon} - ${sun.getDate()} ${sunMon}`;

      options.push({
        key: `${startYMD}..${endYMD}`,
        startYMD,
        endYMD,
        label: `Week ${weekNum}: ${dateRangeText} (Tue–Sun)`,
      });
      weekNum++;
    }

    cursor.setDate(cursor.getDate() + 7);
  }

  return options;
}

const emptyRaw = () => ({ spend: 0, imp: 0, clicks: 0, v6: 0, v15: 0, purchase: 0, gmv: 0, engagement: 0 });

const finalizeMetrics = (
  raw: { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase?: number; gmv?: number; engagement?: number },
  adType?: string
): CreativeMetrics => {
  const { spend, imp, clicks, v6, v15 } = raw;
  const purchase = raw.purchase || 0;
  const gmv = raw.gmv || 0;
  const engagement = raw.engagement || 0;
  const er = imp > 0 ? engagement / imp : 0;
  const roas = spend > 0 ? gmv / spend : 0;
  const cr = clicks > 0 ? purchase / clicks : 0;

  const isCpas = isCpasSalesAdType(adType);

  let qualityRate = 0;
  if (isCpas) {
    // For CPAS Sales: Quality Rate evaluates actual conversion performance (Purchases, GMV, and ROAS)
    const baseRate = imp > 0 ? (clicks + 0.5 * v6 + v15 + (purchase * 25)) / imp : 0;
    const roasScale = spend > 0 ? (roas > 0 ? Math.min(3.0, Math.max(0.2, roas / 2.5)) : 0.15) : 1.0;
    const gmvScale = gmv > 0 ? (1 + 0.1 * Math.min(2, Math.log10(1 + gmv / 1000000))) : (spend > 0 ? 0.5 : 1.0);
    qualityRate = baseRate * roasScale * gmvScale;
  } else {
    qualityRate = imp > 0 ? (clicks + v6 + v15) / imp : 0;
  }

  return {
    spend,
    imp,
    clicks,
    v6,
    v15,
    purchase,
    gmv,
    engagement,
    er,
    roas,
    cr,
    cpm: imp > 0 ? (spend / imp) * 1000 : 0,
    ctr: imp > 0 ? clicks / imp : 0,
    vtr6: imp > 0 ? v6 / imp : 0,
    vtr15: imp > 0 ? v15 / imp : 0,
    qualityRate,
    retention6to15: v6 > 0 ? v15 / v6 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpv6: v6 > 0 ? spend / v6 : 0,
    cpv15: v15 > 0 ? spend / v15 : 0,
  };
};

type SortField =
  | 'spend'
  | 'qualityRate'
  | 'imp'
  | 'clicks'
  | 'v6'
  | 'v15'
  | 'cpm'
  | 'ctr'
  | 'er'
  | 'vtr6'
  | 'vtr15'
  | 'purchase'
  | 'gmv'
  | 'roas'
  | 'cr';

interface MetricFilterConfig {
  mode: 'none' | 'manual' | 'average';
  underVal: string;
  aboveVal: string;
  avgTier: 'below' | 'average' | 'above' | null;
}

const isMetricFilterActive = (cfg?: MetricFilterConfig): boolean => {
  if (!cfg || cfg.mode === 'none') return false;
  if (cfg.mode === 'manual') {
    return cfg.underVal.trim() !== '' || cfg.aboveVal.trim() !== '';
  }
  if (cfg.mode === 'average') {
    return cfg.avgTier === 'below' || cfg.avgTier === 'average' || cfg.avgTier === 'above';
  }
  return false;
};

const ALL_METRIC_DEFS: {
  key: SortField;
  label: string;
  shortLabel: string;
  fmt: (v: number) => string;
  isInv: boolean;
  cpasOnly?: boolean;
  unit?: '%' | 'Rp' | 'x' | '';
}[] = [
  { key: 'spend', label: 'Spend', shortLabel: 'Spend', fmt: formatIDR, isInv: false, unit: 'Rp' },
  { key: 'gmv', label: 'GMV', shortLabel: 'GMV', fmt: formatIDR, isInv: false, cpasOnly: true, unit: 'Rp' },
  { key: 'roas', label: 'ROAS', shortLabel: 'ROAS', fmt: (v: number) => `${v.toFixed(2)}x`, isInv: false, cpasOnly: true, unit: 'x' },
  { key: 'purchase', label: 'Purchase', shortLabel: 'Purchase', fmt: formatNum, isInv: false, cpasOnly: true, unit: '' },
  { key: 'cr', label: 'Conversion Rate (CR)', shortLabel: 'CR', fmt: formatPct, isInv: false, cpasOnly: true, unit: '%' },
  { key: 'qualityRate', label: 'Quality Rate', shortLabel: 'Quality Rate', fmt: formatPct, isInv: false, unit: '%' },
  { key: 'imp', label: 'Impression', shortLabel: 'Impr', fmt: formatNum, isInv: false, unit: '' },
  { key: 'clicks', label: 'Clicks', shortLabel: 'Clicks', fmt: formatNum, isInv: false, unit: '' },
  { key: 'v6', label: '6s Views', shortLabel: '6s View', fmt: formatNum, isInv: false, unit: '' },
  { key: 'v15', label: '15s Views', shortLabel: '15s View', fmt: formatNum, isInv: false, unit: '' },
  { key: 'cpm', label: 'CPM', shortLabel: 'CPM', fmt: formatIDR, isInv: true, unit: 'Rp' },
  { key: 'ctr', label: 'CTR', shortLabel: 'CTR', fmt: formatPct, isInv: false, unit: '%' },
  { key: 'er', label: 'ER%', shortLabel: 'ER%', fmt: formatPct, isInv: false, unit: '%' },
  { key: 'vtr6', label: 'VTR (6s)', shortLabel: 'VTR 6s', fmt: formatPct, isInv: false, unit: '%' },
  { key: 'vtr15', label: 'VTR (15s)', shortLabel: 'VTR 15s', fmt: formatPct, isInv: false, unit: '%' },
];

export default function CreativeReportView({
  rawData,
  curData,
  prevData,
  globalDates,
  granularity,
  isDarkMode,
  dashboardContext,
  setDashboardContext,
  onSwitchSubPage,
  filters,
  onLearningModeChange,
  userRole,
}: CreativeReportViewProps) {
  const isPlanner = userRole === 'planner' || !userRole;
  const [viewMode, setViewMode] = useState<'leaderboard' | 'matrix' | 'ai_learnings'>('leaderboard');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CreativeClassificationStatus>('ALL');
  const [matrixLayout, setMatrixLayout] = useState<'compact' | 'multi'>('compact');
  const [matrixMetric, setMatrixMetric] = useState<SortField>('spend');
  const [linkFilter, setLinkFilter] = useState<'all' | 'with_link' | 'no_link'>('all');
  const [localAdGroup, setLocalAdGroup] = useState<string>('All');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [metricFilters, setMetricFilters] = useState<Partial<Record<SortField, MetricFilterConfig>>>({});
  const [openFilterMetric, setOpenFilterMetric] = useState<SortField | null>(null);
  const [filterPopoverPos, setFilterPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Creative Learning Engine interconnected filters & dual period settings
  const [aiBrandFilter, setAiBrandFilter] = useState<string>('All Brands');
  const [aiPlatformFilter, setAiPlatformFilter] = useState<string>('All Platforms');
  const [aiAdTypeFilter, setAiAdTypeFilter] = useState<string>('All Ad Types');
  const [aiFormatFilter, setAiFormatFilter] = useState<string>('All Formats');
  const [aiPillarFilter, setAiPillarFilter] = useState<string>('All Pillars');

  // Period Settings: Primary ('weekly_month' = Month + Tue-Sun Week) vs Secondary ('custom_range' = Dynamic Calendar Range)
  const [aiPeriodMode, setAiPeriodMode] = useState<'weekly_month' | 'custom_range'>('weekly_month');
  const [aiSelectedMonth, setAiSelectedMonth] = useState<string>('');
  const [aiSelectedWeekRange, setAiSelectedWeekRange] = useState<string>('ALL_MONTH');
  const [aiCustomStart, setAiCustomStart] = useState<string>('');
  const [aiCustomEnd, setAiCustomEnd] = useState<string>('');

  const [cachedLearningsList, setCachedLearningsList] = useState<CachedCohortLearningItem[]>([]);
  const [isLoadingCache, setIsLoadingCache] = useState<boolean>(false);
  const [isAnalyzingCohort, setIsAnalyzingCohort] = useState<boolean>(false);
  const [aiFeedbackMsg, setAiFeedbackMsg] = useState<string>('');
  const [hasLoadedSheetCache, setHasLoadedSheetCache] = useState<boolean>(false);
  const [customGeminiKey, setCustomGeminiKey] = useState<string>('');
  const [showApiKeyConfig, setShowApiKeyConfig] = useState<boolean>(false);
  const [showPlaybookModal, setShowPlaybookModal] = useState<boolean>(false);
  const [showSpendCredibilityDetails, setShowSpendCredibilityDetails] = useState<boolean>(false);

  // CPAS Sales detection (applies when CPAS Sales or CPAS Shopee is chosen)
  const isCpasSales = useMemo(() => {
    return isCpasSalesAdType(filters?.adType) || isCpasSalesAdType(aiAdTypeFilter);
  }, [filters?.adType, aiAdTypeFilter]);

  // Dynamic metrics: ROAS, Conversion Rate (CR), Purchase, and GMV appear ONLY for CPAS Sales
  const activeMetricDefs = useMemo(() => {
    return ALL_METRIC_DEFS.filter(m => !m.cpasOnly || isCpasSales);
  }, [isCpasSales]);

  // Fallback sortField and matrixMetric if switching away from CPAS Sales
  useEffect(() => {
    if (!isCpasSales && (sortField === 'purchase' || sortField === 'gmv' || sortField === 'roas' || sortField === 'cr')) {
      setSortField('spend');
    }
  }, [isCpasSales, sortField]);

  useEffect(() => {
    if (!isCpasSales && (matrixMetric === 'purchase' || matrixMetric === 'gmv' || matrixMetric === 'roas' || matrixMetric === 'cr')) {
      setMatrixMetric('spend');
    }
  }, [isCpasSales, matrixMetric]);

  // Notify parent when entering/leaving Creative Learning Engine so sidebar filters are hidden
  useEffect(() => {
    onLearningModeChange?.(viewMode === 'ai_learnings');
    return () => {
      onLearningModeChange?.(false);
    };
  }, [viewMode, onLearningModeChange]);

  // Load saved optional custom Gemini API key from localStorage on mount
  useEffect(() => {
    try {
      const savedKey = window.localStorage.getItem('omg_gemini_api_key') || window.localStorage.getItem('pc_aio_gemini_api_key') || '';
      if (savedKey) setCustomGeminiKey(savedKey);
    } catch {
      // ignore storage errors
    }
  }, []);

  // Passive GET to load cached rows from Google Sheets `AI_Creative_Learnings` (0 Gemini tokens)
  const fetchCachedLearningsFromSheet = useCallback(async () => {
    setIsLoadingCache(true);
    try {
      const res = await fetch('/api/creative-analyzer');
      const data = await res.json();
      if (data?.success && Array.isArray(data.cachedCohorts)) {
        setCachedLearningsList(data.cachedCohorts);
        setHasLoadedSheetCache(true);
      }
    } catch (err) {
      console.warn('Could not fetch cached learnings:', err);
    } finally {
      setIsLoadingCache(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'ai_learnings' && !hasLoadedSheetCache && !isLoadingCache) {
      fetchCachedLearningsFromSheet();
    }
  }, [viewMode, hasLoadedSheetCache, isLoadingCache, fetchCachedLearningsFromSheet]);

  // Modal state for popup video player
  const [selectedCreative, setSelectedCreative] = useState<AggregatedCreativeRow | null>(null);
  const [activeAssetIdx, setActiveAssetIdx] = useState<number>(0);
  const [tiktokPlayerMode, setTiktokPlayerMode] = useState<'direct' | 'embed'>('direct');
  const [tiktokSourceIdx, setTiktokSourceIdx] = useState<number>(0);
  const [tiktokStream, setTiktokStream] = useState<{
    playUrl: string;
    wmPlayUrl?: string;
    backupPlayUrls?: string[];
    proxyPlayUrl?: string;
    coverUrl?: string;
    title?: string;
    authorName?: string;
    authorHandle?: string;
    isAd?: boolean;
    isCommerce?: boolean;
  } | null>(null);
  const [isResolvingStream, setIsResolvingStream] = useState<boolean>(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedCreative) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [selectedCreative]);

  useEffect(() => {
    if (!selectedCreative) {
      setTiktokStream(null);
      setTiktokSourceIdx(0);
      setIsResolvingStream(false);
      return;
    }
    const activeMedia = selectedCreative.mediaItems[activeAssetIdx] || selectedCreative.mediaItems[0];
    if (!activeMedia || activeMedia.sourceType !== 'tiktok') {
      setTiktokStream(null);
      setTiktokSourceIdx(0);
      setIsResolvingStream(false);
      return;
    }

    let cancelled = false;
    setIsResolvingStream(true);
    setTiktokStream(null);
    setTiktokSourceIdx(0);
    setTiktokPlayerMode('direct');

    const proxyFallbackUrl = `/api/tiktok-video?stream=1&url=${encodeURIComponent(activeMedia.rawUrl)}`;
    const directIdFallbackUrl = activeMedia.videoId
      ? `https://www.tikwm.com/video/media/play/${activeMedia.videoId}.mp4`
      : '';

    fetch(`/api/tiktok-video?url=${encodeURIComponent(activeMedia.rawUrl)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.success && data?.video?.playUrl) {
          const allUrls = Array.from(
            new Set(
              [
                data.video.playUrl,
                data.video.wmPlayUrl,
                ...(data.video.backupPlayUrls || []),
                directIdFallbackUrl,
                proxyFallbackUrl,
              ].filter(Boolean)
            )
          );
          if (data.video.coverUrl) {
            clientThumbCache.set(activeMedia.rawUrl, toProxiedThumbUrl(data.video.coverUrl));
          }
          setTiktokStream({
            ...data.video,
            playUrl: allUrls[0],
            backupPlayUrls: allUrls,
            proxyPlayUrl: proxyFallbackUrl,
          });
          setTiktokSourceIdx(0);
          setTiktokPlayerMode('direct');
        } else {
          // Even if metadata lookup failed, keep HTML5 player mode using server stream proxy + direct ID fallback
          const fallbackUrls = [proxyFallbackUrl, directIdFallbackUrl].filter(Boolean);
          setTiktokStream({
            playUrl: fallbackUrls[0],
            backupPlayUrls: fallbackUrls,
            proxyPlayUrl: proxyFallbackUrl,
          });
          setTiktokSourceIdx(0);
          setTiktokPlayerMode('direct');
        }
        setIsResolvingStream(false);
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackUrls = [proxyFallbackUrl, directIdFallbackUrl].filter(Boolean);
        setTiktokStream({
          playUrl: fallbackUrls[0],
          backupPlayUrls: fallbackUrls,
          proxyPlayUrl: proxyFallbackUrl,
        });
        setTiktokSourceIdx(0);
        setTiktokPlayerMode('direct');
        setIsResolvingStream(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCreative, activeAssetIdx]);

  const openCreativeModal = (row: AggregatedCreativeRow) => {
    setActiveAssetIdx(0);
    setTiktokSourceIdx(0);
    setTiktokPlayerMode('direct');
    setSelectedCreative(row);
  };

  const closeCreativeModal = () => {
    setSelectedCreative(null);
  };

  // Platform KPIs (Overall, Meta, TikTok) across curData and prevData
  const platformKPIs = useMemo(() => {
    const rawTotals = {
      overall: { cur: emptyRaw(), prev: emptyRaw() },
      meta: { cur: emptyRaw(), prev: emptyRaw() },
      tiktok: { cur: emptyRaw(), prev: emptyRaw() },
    };

    const accumulate = (rows: any[], side: 'cur' | 'prev') => {
      rows.forEach(r => {
        const s = parseNum(r['Spend']);
        const i = parseNum(r['Impression']);
        const c = parseNum(r['Clicks']);
        const v6 = parseNum(r['6s View']);
        const v15 = parseNum(r['15s View']);
        const eng = parseNum(r['Engagement'] || r['Engagements'] || r['engagement']);
        const plat = String(r['Platform'] || '').toLowerCase();

        rawTotals.overall[side].spend += s;
        rawTotals.overall[side].imp += i;
        rawTotals.overall[side].clicks += c;
        rawTotals.overall[side].v6 += v6;
        rawTotals.overall[side].v15 += v15;
        rawTotals.overall[side].engagement += eng;

        if (plat.includes('meta') || plat.includes('ig') || plat.includes('facebook')) {
          rawTotals.meta[side].spend += s;
          rawTotals.meta[side].imp += i;
          rawTotals.meta[side].clicks += c;
          rawTotals.meta[side].v6 += v6;
          rawTotals.meta[side].v15 += v15;
          rawTotals.meta[side].engagement += eng;
        } else if (plat.includes('tiktok')) {
          rawTotals.tiktok[side].spend += s;
          rawTotals.tiktok[side].imp += i;
          rawTotals.tiktok[side].clicks += c;
          rawTotals.tiktok[side].v6 += v6;
          rawTotals.tiktok[side].v15 += v15;
          rawTotals.tiktok[side].engagement += eng;
        }
      });
    };

    accumulate(curData, 'cur');
    accumulate(prevData, 'prev');

    return {
      overall: { cur: finalizeMetrics(rawTotals.overall.cur), prev: finalizeMetrics(rawTotals.overall.prev) },
      meta: { cur: finalizeMetrics(rawTotals.meta.cur), prev: finalizeMetrics(rawTotals.meta.prev) },
      tiktok: { cur: finalizeMetrics(rawTotals.tiktok.cur), prev: finalizeMetrics(rawTotals.tiktok.prev) },
    };
  }, [curData, prevData]);

  // Filter by dashboardContext (Overall / Meta / TikTok)
  const { ctxCur, ctxPrev } = useMemo(() => {
    if (dashboardContext === 'Overall') return { ctxCur: curData, ctxPrev: prevData };
    const target = dashboardContext.toLowerCase();
    const matchPlat = (r: any) => {
      const p = String(r['Platform'] || '').toLowerCase();
      if (target === 'meta') return p.includes('meta') || p.includes('ig') || p.includes('facebook');
      return p.includes(target);
    };
    return {
      ctxCur: curData.filter(matchPlat),
      ctxPrev: prevData.filter(matchPlat),
    };
  }, [curData, prevData, dashboardContext]);

  // Available Ad Groups for quick filter
  const adGroupOptions = useMemo(() => {
    const set = new Set<string>();
    ctxCur.forEach(r => {
      const ag = String(r['Ad Group'] || '').trim();
      if (ag) set.add(ag);
    });
    ctxPrev.forEach(r => {
      const ag = String(r['Ad Group'] || '').trim();
      if (ag) set.add(ag);
    });
    return ['All', ...Array.from(set).sort()];
  }, [ctxCur, ctxPrev]);

  // Aggregate rows at Creative + Ad Group level and run Deterministic Classifier (0 AI tokens)
  const { allClassifiedRows, statusFilteredRows, statusCounts, weeksList, daysList } = useMemo(() => {
    const map = new Map<string, {
      brand: string;
      platform: string;
      adType: string;
      kpi: string;
      format: string;
      adGroup: string;
      pillar: string;
      creativeName: string;
      creativeLink: string;
      creativeSet: Set<string>;
      curRaw: { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase: number; gmv: number; engagement: number };
      prevRaw: { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase: number; gmv: number; engagement: number };
      bucketsCurRaw: Record<string, { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase: number; gmv: number; engagement: number }>;
      bucketsPrevRaw: Record<string, { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase: number; gmv: number; engagement: number }>;
      dailyMap: Record<string, { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase: number; gmv: number; engagement: number }>;
    }>();

    const weeksFound = new Set<string>();
    const daysFound = new Set<string>();

    const processRow = (r: any, isPrev: boolean) => {
      const brand = String(r['Brand'] || '').trim();
      const platform = String(r['Platform'] || '').trim();
      const adType = String(r['Ad Type'] || '').trim();
      const kpi = String(r['KPI'] || '').trim();
      const format = String(r['Format'] || '').trim();
      const adGroup = String(r['Ad Group'] || '').trim();
      const pillar = String(r['Pillar'] || '').trim();
      const creativeName = String(r['Creative Name'] || '').trim();
      const creativeLink = String(r['Creative Link'] || '').trim();

      if (localAdGroup !== 'All' && adGroup !== localAdGroup) return;

      const combinedSearch = `${filters.search || ''} ${localSearch || ''}`.trim().toLowerCase();
      if (combinedSearch) {
        const hay = `${creativeName} ${adGroup} ${pillar} ${brand} ${platform} ${adType} ${format}`.toLowerCase();
        if (!hay.includes(combinedSearch)) return;
      }

      const key = `${brand}||${platform}||${adGroup}||${pillar}||${creativeName}`;

      let entry = map.get(key);
      if (!entry) {
        entry = {
          brand,
          platform,
          adType,
          kpi,
          format,
          adGroup,
          pillar,
          creativeName,
          creativeLink: creativeLink && creativeLink !== '-' && creativeLink.toUpperCase() !== '#N/A' ? creativeLink : '',
          creativeSet: new Set<string>(),
          curRaw: emptyRaw(),
          prevRaw: emptyRaw(),
          bucketsCurRaw: {},
          bucketsPrevRaw: {},
          dailyMap: {},
        };
        map.set(key, entry);
      } else if (!entry.creativeLink && creativeLink && creativeLink !== '-' && creativeLink.toUpperCase() !== '#N/A') {
        entry.creativeLink = creativeLink;
      }

      if (creativeName) entry.creativeSet.add(creativeName);

      const s = parseNum(r['Spend']);
      const i = parseNum(r['Impression']);
      const c = parseNum(r['Clicks']);
      const v6 = parseNum(r['6s View']);
      const v15 = parseNum(r['15s View']);
      const purchase = parseNum(r['Purchase'] || r['Purchases']);
      const gmv = parseNum(r['GMV']);
      const engagement = parseNum(r['Engagement'] || r['Engagements'] || r['engagement']);

      const targetRaw = isPrev ? entry.prevRaw : entry.curRaw;
      targetRaw.spend += s;
      targetRaw.imp += i;
      targetRaw.clicks += c;
      targetRaw.v6 += v6;
      targetRaw.v15 += v15;
      targetRaw.purchase += purchase;
      targetRaw.gmv += gmv;
      targetRaw.engagement += engagement;

      const bucket = String(r.bucket || '');
      if (bucket) {
        if (granularity === 'weekly' && bucket.startsWith('W')) weeksFound.add(bucket);
        if (granularity === 'daily' && !isPrev) daysFound.add(bucket);

        const bMap = isPrev ? entry.bucketsPrevRaw : entry.bucketsCurRaw;
        if (!bMap[bucket]) bMap[bucket] = emptyRaw();
        bMap[bucket].spend += s;
        bMap[bucket].imp += i;
        bMap[bucket].clicks += c;
        bMap[bucket].v6 += v6;
        bMap[bucket].v15 += v15;
        bMap[bucket].purchase += purchase;
        bMap[bucket].gmv += gmv;
        bMap[bucket].engagement += engagement;
      }

      if (!isPrev && r.parsedDate instanceof Date && !isNaN(r.parsedDate.getTime())) {
        const dKey = `${r.parsedDate.getFullYear()}-${String(r.parsedDate.getMonth() + 1).padStart(2, '0')}-${String(r.parsedDate.getDate()).padStart(2, '0')}`;
        if (!entry.dailyMap[dKey]) entry.dailyMap[dKey] = emptyRaw();
        entry.dailyMap[dKey].spend += s;
        entry.dailyMap[dKey].imp += i;
        entry.dailyMap[dKey].clicks += c;
        entry.dailyMap[dKey].v6 += v6;
        entry.dailyMap[dKey].v15 += v15;
        entry.dailyMap[dKey].purchase += purchase;
        entry.dailyMap[dKey].gmv += gmv;
        entry.dailyMap[dKey].engagement += engagement;
      }
    };

    ctxCur.forEach(r => processRow(r, false));
    ctxPrev.forEach(r => processRow(r, true));

    const sortedWeeks = Array.from(weeksFound).sort((a, b) => parseInt(a.replace('W', '')) - parseInt(b.replace('W', '')));
    const sortedDays = Array.from(daysFound).sort();

    const baseRows: Omit<
      AggregatedCreativeRow,
      'status' | 'statusLabel' | 'qrVsMedianPct' | 'weightedQualityPct' | 'isSpendValid' | 'benchmarks'
    >[] = [];

    map.forEach((entry, key) => {
      const mediaItems = parseCreativeLinks(entry.creativeLink);
      if (linkFilter === 'with_link' && mediaItems.length === 0) return;
      if (linkFilter === 'no_link' && mediaItems.length > 0) return;

      // Skip rows that have 0 activity in current period
      const hasCur = entry.curRaw.spend > 0 || entry.curRaw.imp > 0 || entry.curRaw.clicks > 0 || entry.curRaw.v6 > 0 || entry.curRaw.v15 > 0 || entry.curRaw.purchase > 0 || entry.curRaw.gmv > 0;
      if (!hasCur) return;

      const bucketsCur: Record<string, CreativeMetrics> = {};
      const bucketsPrev: Record<string, CreativeMetrics> = {};

      if (granularity === 'weekly') {
        const runCur = emptyRaw();
        const runPrev = emptyRaw();
        sortedWeeks.forEach(w => {
          const cW = entry.bucketsCurRaw[w];
          if (cW) {
            runCur.spend += cW.spend;
            runCur.imp += cW.imp;
            runCur.clicks += cW.clicks;
            runCur.v6 += cW.v6;
            runCur.v15 += cW.v15;
            runCur.purchase += cW.purchase;
            runCur.gmv += cW.gmv;
            runCur.engagement += cW.engagement;
          }
          const pW = entry.bucketsPrevRaw[w];
          if (pW) {
            runPrev.spend += pW.spend;
            runPrev.imp += pW.imp;
            runPrev.clicks += pW.clicks;
            runPrev.v6 += pW.v6;
            runPrev.v15 += pW.v15;
            runPrev.purchase += pW.purchase;
            runPrev.gmv += pW.gmv;
            runPrev.engagement += pW.engagement;
          }
          bucketsCur[w] = finalizeMetrics({ ...runCur }, entry.adType);
          bucketsPrev[w] = finalizeMetrics({ ...runPrev }, entry.adType);
        });
      } else if (granularity === 'daily') {
        sortedDays.forEach(d => {
          bucketsCur[d] = finalizeMetrics(entry.bucketsCurRaw[d] || emptyRaw(), entry.adType);
        });
      }

      baseRows.push({
        key,
        brand: entry.brand,
        platform: entry.platform,
        adType: entry.adType,
        kpi: entry.kpi,
        format: entry.format,
        adGroup: entry.adGroup,
        pillar: entry.pillar,
        creativeName: entry.creativeName,
        creativeLink: entry.creativeLink,
        mediaItems,
        creativeCount: entry.creativeSet.size,
        cur: finalizeMetrics(entry.curRaw, entry.adType),
        prev: finalizeMetrics(entry.prevRaw, entry.adType),
        bucketsCur,
        bucketsPrev,
        dailyMap: entry.dailyMap,
      });
    });

    // Deduplicate baseRows by canonical video link: consider same video link as same creative and keep highest row data
    const dedupedBaseMap = new Map<string, (typeof baseRows)[0]>();
    baseRows.forEach(r => {
      const vKey = normalizeCreativeVideoKey(r.creativeLink, r.key);
      const ex = dedupedBaseMap.get(vKey);
      if (
        !ex ||
        r.cur.spend > ex.cur.spend ||
        (r.cur.spend === ex.cur.spend && r.cur.gmv > ex.cur.gmv) ||
        (r.cur.spend === ex.cur.spend && r.cur.imp > ex.cur.imp)
      ) {
        dedupedBaseMap.set(vKey, r);
      }
    });
    const uniqueBaseRows = Array.from(dedupedBaseMap.values());

    // Run deterministic classifier across uniqueBaseRows grouped by Brand + Ad Type + Format
    const cohortClassified = classifyCreativeCohort(
      uniqueBaseRows.map(r => ({
        key: r.key,
        brand: r.brand,
        platform: r.platform,
        adType: r.adType,
        kpi: r.kpi,
        format: r.format,
        adGroup: r.adGroup,
        pillar: r.pillar,
        creativeName: r.creativeName,
        creativeLink: r.creativeLink,
        spend: r.cur.spend,
        impressions: r.cur.imp,
        clicks: r.cur.clicks,
        views6s: r.cur.v6,
        views15s: r.cur.v15,
        purchase: r.cur.purchase,
        gmv: r.cur.gmv,
      })),
      {
        brandLabel: filters?.brand || 'All Brands',
        adTypeLabel: filters?.adType || 'All Ad Types',
        formatLabel: filters?.format || 'All Formats',
        weekKey: 'Current-Period',
        groupByBrandAndAdType: true,
        deduplicateByVideoLink: true,
      }
    );

    const classifiedLookup = new Map(cohortClassified.creatives.map(c => [c.id, c]));

    const fullRows: AggregatedCreativeRow[] = uniqueBaseRows.map(r => {
      const cls = classifiedLookup.get(r.key);
      return {
        ...r,
        status: cls?.status || 'BASELINE',
        statusLabel: cls?.statusLabel || CLASSIFICATION_META.BASELINE.label,
        qrVsMedianPct: cls?.qrVsMedianPct ?? 0,
        weightedQualityPct: cls?.metrics.weightedQualityPct ?? r.cur.qualityRate * 100,
        isSpendValid: cls?.metrics.isSpendValid ?? r.cur.spend > 0,
        benchmarks: cls?.benchmarks || cohortClassified.benchmarks,
      };
    });

    fullRows.sort((a, b) => {
      const valA = a.cur[sortField] || 0;
      const valB = b.cur[sortField] || 0;
      if (valA !== valB) return sortDir === 'desc' ? valB - valA : valA - valB;
      return b.cur.spend - a.cur.spend;
    });

    const filteredByStatus =
      statusFilter === 'ALL' ? fullRows : fullRows.filter(r => r.status === statusFilter);

    return {
      allClassifiedRows: fullRows,
      statusFilteredRows: filteredByStatus,
      statusCounts: cohortClassified.counts,
      weeksList: sortedWeeks,
      daysList: sortedDays,
    };
  }, [ctxCur, ctxPrev, localAdGroup, localSearch, filters.search, filters.brand, filters.adType, filters.format, linkFilter, granularity, sortField, sortDir, statusFilter]);

  // Compute arithmetic average for each metric across the cohort matching the applied sidebar & topbar filters
  const metricCohortAverages = useMemo(() => {
    const avgs: Record<SortField, number> = {
      spend: 0,
      gmv: 0,
      roas: 0,
      purchase: 0,
      cr: 0,
      qualityRate: 0,
      imp: 0,
      clicks: 0,
      v6: 0,
      v15: 0,
      cpm: 0,
      ctr: 0,
      er: 0,
      vtr6: 0,
      vtr15: 0,
    };
    const count = allClassifiedRows.length;
    if (count === 0) return avgs;
    ALL_METRIC_DEFS.forEach(m => {
      let sum = 0;
      for (let i = 0; i < count; i++) {
        sum += allClassifiedRows[i].cur[m.key] || 0;
      }
      avgs[m.key] = sum / count;
    });
    return avgs;
  }, [allClassifiedRows]);

  // Apply per-column metric filters (Manual Under/Above or Cohort Average Tier)
  const aggregatedRows = useMemo(() => {
    const activeKeys = (Object.keys(metricFilters) as SortField[]).filter(k =>
      isMetricFilterActive(metricFilters[k])
    );
    if (activeKeys.length === 0) return statusFilteredRows;

    return statusFilteredRows.filter(row => {
      for (const mKey of activeKeys) {
        const cfg = metricFilters[mKey]!;
        const mDef = ALL_METRIC_DEFS.find(d => d.key === mKey);
        const rawVal = row.cur[mKey] || 0;

        if (cfg.mode === 'manual') {
          // Percentage metrics are displayed as 0-100%, so compare manual input against percentage scale
          const cmpVal = mDef?.unit === '%' ? rawVal * 100 : rawVal;
          if (cfg.underVal.trim() !== '') {
            const u = parseFloat(cfg.underVal.replace(/,/g, ''));
            if (!isNaN(u) && cmpVal > u) return false;
          }
          if (cfg.aboveVal.trim() !== '') {
            const a = parseFloat(cfg.aboveVal.replace(/,/g, ''));
            if (!isNaN(a) && cmpVal < a) return false;
          }
        } else if (cfg.mode === 'average' && cfg.avgTier) {
          const avg = metricCohortAverages[mKey] || 0;
          const lowBound = avg * 0.9;
          const highBound = avg * 1.1;
          if (cfg.avgTier === 'below' && !(rawVal < lowBound)) return false;
          if (cfg.avgTier === 'average' && !(rawVal >= lowBound && rawVal <= highBound)) return false;
          if (cfg.avgTier === 'above' && !(rawVal > highBound)) return false;
        }
      }
      return true;
    });
  }, [statusFilteredRows, metricFilters, metricCohortAverages]);

  const activeMetricFilterKeys = useMemo(
    () => (Object.keys(metricFilters) as SortField[]).filter(k => isMetricFilterActive(metricFilters[k])),
    [metricFilters]
  );

  // Close column filter popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!openFilterMetric) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setOpenFilterMetric(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenFilterMetric(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openFilterMetric]);

  const handleToggleMetricFilterMenu = (e: React.MouseEvent<HTMLButtonElement>, key: SortField) => {
    e.stopPropagation();
    if (openFilterMetric === key) {
      setOpenFilterMetric(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const popoverWidth = 272;
    const left = Math.max(12, Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 12));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 310);
    setFilterPopoverPos({ top, left });
    setOpenFilterMetric(key);
  };

  const updateMetricManualFilter = (key: SortField, field: 'underVal' | 'aboveVal', val: string) => {
    setMetricFilters(prev => {
      const existing = prev[key] || { mode: 'none', underVal: '', aboveVal: '', avgTier: null };
      const updated = {
        ...existing,
        [field]: val,
        avgTier: null,
      };
      const hasAny = updated.underVal.trim() !== '' || updated.aboveVal.trim() !== '';
      updated.mode = hasAny ? 'manual' : 'none';
      return { ...prev, [key]: updated };
    });
  };

  const updateMetricAverageTier = (key: SortField, tier: 'below' | 'average' | 'above') => {
    setMetricFilters(prev => {
      const existing = prev[key] || { mode: 'none', underVal: '', aboveVal: '', avgTier: null };
      const isSame = existing.mode === 'average' && existing.avgTier === tier;
      return {
        ...prev,
        [key]: isSame
          ? { mode: 'none', underVal: '', aboveVal: '', avgTier: null }
          : { mode: 'average', underVal: '', aboveVal: '', avgTier: tier },
      };
    });
  };

  const clearSingleMetricFilter = (key: SortField) => {
    setMetricFilters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    setPage(1);
  }, [dashboardContext, localAdGroup, localSearch, filters, linkFilter, granularity, statusFilter, metricFilters]);

  const totalPages = Math.max(1, Math.ceil(aggregatedRows.length / pageSize));
  const pagedRows = useMemo(
    () => aggregatedRows.slice((page - 1) * pageSize, page * pageSize),
    [aggregatedRows, page, pageSize]
  );

  const maxSpendInList = useMemo(
    () => Math.max(...allClassifiedRows.map(r => r.cur.spend), 1),
    [allClassifiedRows]
  );

  const activeContextKPI = useMemo(() => {
    if (dashboardContext === 'Meta') return platformKPIs.meta;
    if (dashboardContext === 'TikTok') return platformKPIs.tiktok;
    return platformKPIs.overall;
  }, [dashboardContext, platformKPIs]);

  // Full dataset source for Creative Learning Engine (uses full rawData so it works independently when sidebar filters are hidden)
  const learningDataset = useMemo(() => {
    const base = rawData && rawData.length > 0 ? rawData : curData;
    return base
      .map(r => {
        const ymd = r._ymd || toYMD(r['Date']);
        return {
          ...r,
          _ymd: ymd,
          _month: ymd && ymd.length >= 7 ? ymd.slice(0, 7) : '',
        };
      })
      .filter(r => r._ymd && r._ymd.length === 10);
  }, [rawData, curData]);

  // Available months in dataset sorted newest first (e.g., ["2026-10", "2026-09", ...])
  const availableLearningMonths = useMemo(() => {
    const mSet = new Set<string>();
    learningDataset.forEach(r => {
      if (r._month) mSet.add(r._month);
    });
    return Array.from(mSet).sort().reverse();
  }, [learningDataset]);

  // Initialize default Month and default Custom Start/End dates from the latest available month in data
  useEffect(() => {
    if (availableLearningMonths.length > 0 && (!aiSelectedMonth || !availableLearningMonths.includes(aiSelectedMonth))) {
      const latestMonth = availableLearningMonths[0];
      setAiSelectedMonth(latestMonth);
      setAiSelectedWeekRange('ALL_MONTH');

      // Also initialize custom calendar range to latest month's min/max dates
      const datesInLatest = learningDataset
        .filter(r => r._month === latestMonth)
        .map(r => r._ymd as string)
        .sort();
      if (datesInLatest.length > 0) {
        setAiCustomStart(datesInLatest[0]);
        setAiCustomEnd(datesInLatest[datesInLatest.length - 1]);
      }
    }
  }, [availableLearningMonths, aiSelectedMonth, learningDataset]);

  // Tuesday - Sunday weekly ranges for the currently selected month
  const tueSunWeeksForSelectedMonth = useMemo(
    () => buildTueSunWeeksForMonth(aiSelectedMonth),
    [aiSelectedMonth]
  );

  // Reset week range to ALL_MONTH if the selected week key is not in the new month's week list
  useEffect(() => {
    if (
      tueSunWeeksForSelectedMonth.length > 0 &&
      !tueSunWeeksForSelectedMonth.some(w => w.key === aiSelectedWeekRange)
    ) {
      setAiSelectedWeekRange('ALL_MONTH');
    }
  }, [tueSunWeeksForSelectedMonth, aiSelectedWeekRange]);

  // Active Period bounds (startYMD .. endYMD) and human-readable period key for Creative Learning Engine
  const activeLearningPeriod = useMemo(() => {
    if (aiPeriodMode === 'custom_range' && aiCustomStart && aiCustomEnd) {
      const s = aiCustomStart <= aiCustomEnd ? aiCustomStart : aiCustomEnd;
      const e = aiCustomStart <= aiCustomEnd ? aiCustomEnd : aiCustomStart;
      return {
        startYMD: s,
        endYMD: e,
        weekKey: `${s}_to_${e}`,
        label: `${s} to ${e}`,
      };
    }

    const foundWeek =
      tueSunWeeksForSelectedMonth.find(w => w.key === aiSelectedWeekRange) ||
      tueSunWeeksForSelectedMonth[0];

    if (foundWeek) {
      return {
        startYMD: foundWeek.startYMD,
        endYMD: foundWeek.endYMD,
        weekKey: foundWeek.key === 'ALL_MONTH' ? `MONTH_${aiSelectedMonth}` : foundWeek.key,
        label: foundWeek.label,
      };
    }

    return {
      startYMD: '',
      endYMD: '',
      weekKey: 'Selected-Period',
      label: 'Selected Period',
    };
  }, [aiPeriodMode, aiCustomStart, aiCustomEnd, tueSunWeeksForSelectedMonth, aiSelectedWeekRange, aiSelectedMonth]);

  // Rows filtered strictly by the active Period Setting (Primary Tue-Sun Week / Month OR Secondary Flexible Date Range)
  const periodFilteredRows = useMemo(() => {
    if (!activeLearningPeriod.startYMD || !activeLearningPeriod.endYMD) return learningDataset;
    return learningDataset.filter(
      r => r._ymd >= activeLearningPeriod.startYMD && r._ymd <= activeLearningPeriod.endYMD
    );
  }, [learningDataset, activeLearningPeriod]);

  // Interconnected (Dependent / Cascading) Filter Options:
  // Selecting Brand A filters Platform, Ad Type/KPI, Format, and Pillar to ONLY options valid for Brand A (and vice versa).
  const {
    aiBrandOptions,
    aiPlatformOptions,
    aiAdTypeOptions,
    aiFormatOptions,
    aiPillarOptions,
  } = useMemo(() => {
    const matchesDim = (
      r: any,
      ignoreDim: 'brand' | 'platform' | 'adType' | 'format' | 'pillar'
    ) => {
      if (ignoreDim !== 'brand' && aiBrandFilter !== 'All Brands' && String(r['Brand'] || '').trim() !== aiBrandFilter) {
        return false;
      }
      if (
        ignoreDim !== 'platform' &&
        aiPlatformFilter !== 'All Platforms' &&
        String(r['Platform'] || '').trim() !== aiPlatformFilter
      ) {
        return false;
      }
      if (
        ignoreDim !== 'adType' &&
        aiAdTypeFilter !== 'All Ad Types'
      ) {
        const rowType = String(r['Ad Type'] || r['KPI'] || '').trim();
        if (isCpasSalesAdType(aiAdTypeFilter)) {
          if (!isCpasSalesAdType(rowType)) return false;
        } else if (rowType !== aiAdTypeFilter) {
          return false;
        }
      }
      if (
        ignoreDim !== 'format' &&
        aiFormatFilter !== 'All Formats' &&
        String(r['Format'] || '').trim() !== aiFormatFilter
      ) {
        return false;
      }
      if (
        ignoreDim !== 'pillar' &&
        aiPillarFilter !== 'All Pillars' &&
        String(r['Pillar'] || '').trim() !== aiPillarFilter
      ) {
        return false;
      }
      return true;
    };

    const brands = new Set<string>();
    const platforms = new Set<string>();
    const adTypes = new Set<string>();
    const formats = new Set<string>();
    const pillars = new Set<string>();

    periodFilteredRows.forEach(r => {
      const b = String(r['Brand'] || '').trim();
      const p = String(r['Platform'] || '').trim();
      const at = String(r['Ad Type'] || r['KPI'] || '').trim();
      const fmt = String(r['Format'] || '').trim();
      const pil = String(r['Pillar'] || '').trim();

      if (b && b !== '-' && matchesDim(r, 'brand')) brands.add(b);
      if (p && p !== '-' && matchesDim(r, 'platform')) platforms.add(p);
      if (at && at !== '-' && matchesDim(r, 'adType')) adTypes.add(at);
      if (fmt && fmt !== '-' && matchesDim(r, 'format')) formats.add(fmt);
      if (pil && pil !== '-' && matchesDim(r, 'pillar')) pillars.add(pil);
    });

    const adTypesList = Array.from(adTypes);
    if (adTypesList.some(at => isCpasSalesAdType(at)) && !adTypesList.includes('CPAS Sales')) {
      adTypesList.push('CPAS Sales');
    }

    return {
      aiBrandOptions: ['All Brands', ...Array.from(brands).sort()],
      aiPlatformOptions: ['All Platforms', ...Array.from(platforms).sort()],
      aiAdTypeOptions: ['All Ad Types', ...adTypesList.sort()],
      aiFormatOptions: ['All Formats', ...Array.from(formats).sort()],
      aiPillarOptions: ['All Pillars', ...Array.from(pillars).sort()],
    };
  }, [
    periodFilteredRows,
    aiBrandFilter,
    aiPlatformFilter,
    aiAdTypeFilter,
    aiFormatFilter,
    aiPillarFilter,
  ]);

  // Auto-reset any dependent filter if its selected value is no longer available under the new condition
  useEffect(() => {
    if (aiBrandFilter !== 'All Brands' && !aiBrandOptions.includes(aiBrandFilter)) {
      setAiBrandFilter('All Brands');
    }
    if (aiPlatformFilter !== 'All Platforms' && !aiPlatformOptions.includes(aiPlatformFilter)) {
      setAiPlatformFilter('All Platforms');
    }
    if (aiAdTypeFilter !== 'All Ad Types' && !aiAdTypeOptions.includes(aiAdTypeFilter)) {
      setAiAdTypeFilter('All Ad Types');
    }
    if (aiFormatFilter !== 'All Formats' && !aiFormatOptions.includes(aiFormatFilter)) {
      setAiFormatFilter('All Formats');
    }
    if (aiPillarFilter !== 'All Pillars' && !aiPillarOptions.includes(aiPillarFilter)) {
      setAiPillarFilter('All Pillars');
    }
  }, [
    aiBrandFilter,
    aiPlatformFilter,
    aiAdTypeFilter,
    aiFormatFilter,
    aiPillarFilter,
    aiBrandOptions,
    aiPlatformOptions,
    aiAdTypeOptions,
    aiFormatOptions,
    aiPillarOptions,
  ]);

  // Compute live cohort classification conditioned on Brand + Platform + Ad Type/KPI + Format + Pillar + Period
  const aiLiveCohort = useMemo(() => {
    const filteredRaw = periodFilteredRows.filter(r => {
      if (aiBrandFilter !== 'All Brands' && String(r['Brand'] || '').trim() !== aiBrandFilter) return false;
      if (aiPlatformFilter !== 'All Platforms' && String(r['Platform'] || '').trim() !== aiPlatformFilter) return false;
      if (aiAdTypeFilter !== 'All Ad Types') {
        const rowType = String(r['Ad Type'] || r['KPI'] || '').trim();
        if (isCpasSalesAdType(aiAdTypeFilter)) {
          if (!isCpasSalesAdType(rowType)) return false;
        } else if (rowType !== aiAdTypeFilter) {
          return false;
        }
      }
      if (aiFormatFilter !== 'All Formats' && String(r['Format'] || '').trim() !== aiFormatFilter) return false;
      if (aiPillarFilter !== 'All Pillars' && String(r['Pillar'] || '').trim() !== aiPillarFilter) return false;
      return true;
    });

    // Step 1: Group daily rows by creative instance, taking the highest row data if duplicate on the same date
    const groupedByCreative = new Map<
      string,
      {
        brand: string;
        platform: string;
        adType: string;
        kpi: string;
        format: string;
        adGroup: string;
        pillar: string;
        creativeName: string;
        creativeLink: string;
        dailyRows: Map<string, { spend: number; imp: number; clicks: number; v6: number; v15: number; purchase: number; gmv: number }>;
      }
    >();

    filteredRaw.forEach(r => {
      const brand = String(r['Brand'] || '').trim();
      const platform = String(r['Platform'] || '').trim();
      const adType = String(r['Ad Type'] || '').trim();
      const kpi = String(r['KPI'] || '').trim();
      const format = String(r['Format'] || '').trim();
      const adGroup = String(r['Ad Group'] || '').trim();
      const pillar = String(r['Pillar'] || '').trim();
      const creativeName = String(r['Creative Name'] || '').trim();
      const creativeLink = String(r['Creative Link'] || '').trim();
      const k = `${brand}||${platform}||${adGroup}||${pillar}||${creativeName}`;

      if (!groupedByCreative.has(k)) {
        groupedByCreative.set(k, {
          brand,
          platform,
          adType,
          kpi,
          format,
          adGroup,
          pillar,
          creativeName,
          creativeLink: creativeLink && creativeLink !== '-' ? creativeLink : '',
          dailyRows: new Map(),
        });
      }
      const item = groupedByCreative.get(k)!;
      if (!item.creativeLink && creativeLink && creativeLink !== '-') {
        item.creativeLink = creativeLink;
      }

      const dKey = String(r._ymd || r['Date'] || '');
      const s = parseNum(r['Spend']);
      const imp = parseNum(r['Impression']);
      const clk = parseNum(r['Clicks']);
      const v6 = parseNum(r['6s View']);
      const v15 = parseNum(r['15s View']);
      const purchase = parseNum(r['Purchase'] || r['Purchases']);
      const gmv = parseNum(r['GMV']);

      const exDay = item.dailyRows.get(dKey);
      if (
        !exDay ||
        s > exDay.spend ||
        (s === exDay.spend && gmv > exDay.gmv) ||
        (s === exDay.spend && imp > exDay.imp)
      ) {
        item.dailyRows.set(dKey, { spend: s, imp, clicks: clk, v6, v15, purchase, gmv });
      }
    });

    const creativeInstanceList = Array.from(groupedByCreative.entries())
      .map(([key, val]) => {
        let spend = 0;
        let impressions = 0;
        let clicks = 0;
        let views6s = 0;
        let views15s = 0;
        let purchase = 0;
        let gmv = 0;
        val.dailyRows.forEach(d => {
          spend += d.spend;
          impressions += d.imp;
          clicks += d.clicks;
          views6s += d.v6;
          views15s += d.v15;
          purchase += d.purchase;
          gmv += d.gmv;
        });
        return {
          key,
          brand: val.brand,
          platform: val.platform,
          adType: val.adType,
          kpi: val.kpi,
          format: val.format,
          adGroup: val.adGroup,
          pillar: val.pillar,
          creativeName: val.creativeName,
          creativeLink: val.creativeLink,
          spend,
          impressions,
          clicks,
          views6s,
          views15s,
          purchase,
          gmv,
        };
      })
      .filter(i => i.spend > 0 || i.impressions > 0);

    // Step 2: Deduplicate by video link (consider same video link as same creative; take highest row data if duplicate)
    return classifyCreativeCohort(creativeInstanceList, {
      brandLabel: aiBrandFilter,
      adTypeLabel: aiAdTypeFilter,
      formatLabel: aiFormatFilter,
      weekKey: activeLearningPeriod.weekKey,
      groupByBrandAndAdType: true,
      deduplicateByVideoLink: true,
    });
  }, [
    periodFilteredRows,
    aiBrandFilter,
    aiPlatformFilter,
    aiAdTypeFilter,
    aiFormatFilter,
    aiPillarFilter,
    activeLearningPeriod.weekKey,
  ]);

  // Match active cohort against cached Google Sheets rows
  const activeCachedLearning = useMemo(() => {
    const targetId = buildCohortId(
      aiBrandFilter,
      aiAdTypeFilter,
      activeLearningPeriod.weekKey,
      aiFormatFilter
    ).toUpperCase();
    return cachedLearningsList.find(c => c.cohort_id.toUpperCase() === targetId) || null;
  }, [cachedLearningsList, aiBrandFilter, aiAdTypeFilter, aiFormatFilter, activeLearningPeriod.weekKey]);

  const isSignatureMatchingCache = useMemo(() => {
    if (!activeCachedLearning) return false;
    return activeCachedLearning.creative_signature_hash === aiLiveCohort.creativeSignatureHash;
  }, [activeCachedLearning, aiLiveCohort.creativeSignatureHash]);

  // Top 2-3 Spend-Weighted Winning Creatives (deduplicated by video link) for the One-Slider Report
  const aiSummaryHighlights = useMemo(() => {
    const pillarMap = new Map<string, { name: string; spend: number; imp: number; clicks: number; v6: number; v15: number; count: number; weightedSum: number }>();
    aiLiveCohort.creatives.forEach(c => {
      const pName = (c.pillar || c.format || c.adGroup || 'Core Messaging').trim() || 'Core Messaging';
      if (!pillarMap.has(pName)) {
        pillarMap.set(pName, { name: pName, spend: 0, imp: 0, clicks: 0, v6: 0, v15: 0, count: 0, weightedSum: 0 });
      }
      const p = pillarMap.get(pName)!;
      p.spend += c.metrics.spend;
      p.imp += c.metrics.impressions;
      p.clicks += c.metrics.clicks;
      p.v6 += c.metrics.views6s;
      p.v15 += c.metrics.views15s;
      p.weightedSum += c.metrics.weightedQualityPct;
      p.count += 1;
    });

    const rankedPillars = Array.from(pillarMap.values())
      .filter(p => p.imp > 0)
      .map(p => ({
        ...p,
        qrPct: ((p.clicks + p.v6 + p.v15) / p.imp) * 100,
        avgWeightedPct: p.weightedSum / Math.max(1, p.count),
        vtr6Pct: (p.v6 / p.imp) * 100,
        retPct: p.v6 > 0 ? (p.v15 / p.v6) * 100 : 0,
      }))
      .sort((a, b) => b.avgWeightedPct - a.avgWeightedPct);

    const optList = [...aiLiveCohort.creatives]
      .filter(c => c.status === 'OPTIMIZED_TOP')
      .sort((a, b) => b.metrics.weightedQualityRate - a.metrics.weightedQualityRate);

    const potList = [...aiLiveCohort.creatives]
      .filter(c => c.status === 'POTENTIAL_GEM')
      .sort((a, b) => b.metrics.weightedQualityRate - a.metrics.weightedQualityRate);

    // Build Top 3 Winners list deduplicated by videoKey
    // For CPAS Sales / CPAS Shopee: prioritizes highest GMV generated (excluding very low ROAS compared to cohort)
    // For other ad types: preserves standard Spend-Weighted Quality Rate ranking
    const topWinners = selectTopCohortWinners(aiLiveCohort.creatives, aiAdTypeFilter);

    return {
      winningPillar: rankedPillars[0] || null,
      topOptimized: optList[0] || null,
      topPotential: potList[0] || null,
      topWinners,
    };
  }, [aiLiveCohort, aiAdTypeFilter]);

  const handleTriggerCohortAnalysis = async (forceRefresh = false) => {
    if (!customGeminiKey?.trim()) {
      setShowApiKeyConfig(true);
      setAiFeedbackMsg('Please enter your Gemini API Key in Key Config to run AI Creative Analysis.');
      return;
    }

    if (aiLiveCohort.creatives.length === 0) {
      setAiFeedbackMsg('No active creatives in the selected Brand / Platform / Ad Type / Format / Period cohort.');
      return;
    }

    setIsAnalyzingCohort(true);
    setAiFeedbackMsg('');

    try {
      const res = await fetch('/api/creative-analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: aiBrandFilter,
          adType: aiAdTypeFilter,
          format: aiFormatFilter,
          weekKey: activeLearningPeriod.weekKey,
          forceRefresh,
          customApiKey: customGeminiKey,
          creatives: aiLiveCohort.creatives.map(c => ({
            key: c.id,
            brand: c.brand,
            platform: c.platform,
            adType: c.adType,
            kpi: c.kpi,
            format: c.format,
            adGroup: c.adGroup,
            pillar: c.pillar,
            creativeName: c.creativeName,
            creativeLink: c.creativeLink,
            spend: c.metrics.spend,
            impressions: c.metrics.impressions,
            clicks: c.metrics.clicks,
            views6s: c.metrics.views6s,
            views15s: c.metrics.views15s,
            purchase: c.metrics.purchase,
            gmv: c.metrics.gmv,
          })),
        }),
      });

      const data = await res.json();
      if (!data?.success) {
        setAiFeedbackMsg(`Error: ${data?.error || 'Analysis failed.'}`);
        return;
      }

      if (data.cachedRow) {
        setCachedLearningsList(prev => {
          const filtered = prev.filter(
            item => item.cohort_id.toUpperCase() !== String(data.cachedRow.cohort_id || '').toUpperCase()
          );
          return [...filtered, data.cachedRow];
        });
      }

      if (data.cacheStatus === 'HIT') {
        setAiFeedbackMsg('Up to Date: No new top creatives detected — loaded directly from Google Sheets cache.');
      } else {
        setAiFeedbackMsg('Synced to Google Sheets • Creative Learning Engine report updated.');
      }
    } catch (err: any) {
      setAiFeedbackMsg(`Request failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsAnalyzingCohort(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleExportExcel = async () => {
    if (aggregatedRows.length === 0) {
      alert('No creative data available to export.');
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'OMG Dashboard';
    wb.created = new Date();
    const ws = wb.addWorksheet('Creative Report');

    const baseColumns: any[] = [
      { header: 'Brand', key: 'brand', width: 14 },
      { header: 'Platform', key: 'platform', width: 12 },
      { header: 'Ad Type', key: 'adType', width: 22 },
      { header: 'KPI', key: 'kpi', width: 22 },
      { header: 'Format', key: 'format', width: 18 },
      { header: 'Ad Group', key: 'adGroup', width: 32 },
      { header: 'Pillar', key: 'pillar', width: 18 },
      { header: 'Creative Name', key: 'creativeName', width: 42 },
      { header: 'Classification Status', key: 'statusLabel', width: 24 },
      { header: 'Quality Rate %', key: 'qrCur', width: 16 },
      { header: 'QR vs Cohort Median %', key: 'qrVsMed', width: 20 },
      { header: 'Creative Link', key: 'creativeLink', width: 38 },
      { header: 'Spend', key: 'spendCur', width: 16 },
    ];

    if (isCpasSales) {
      baseColumns.push(
        { header: 'GMV', key: 'gmvCur', width: 18 },
        { header: 'ROAS', key: 'roasCur', width: 14 },
        { header: 'Purchase', key: 'purchaseCur', width: 14 },
        { header: 'Conversion Rate %', key: 'crCur', width: 18 }
      );
    }

    baseColumns.push(
      { header: 'Impressions', key: 'impCur', width: 18 },
      { header: 'Clicks', key: 'clicksCur', width: 14 },
      { header: '6s Views', key: 'v6Cur', width: 16 },
      { header: '15s Views', key: 'v15Cur', width: 16 },
      { header: 'CPM', key: 'cpmCur', width: 14 },
      { header: 'CTR %', key: 'ctrCur', width: 12 },
      { header: 'ER %', key: 'erCur', width: 12 },
      { header: 'VTR 6s %', key: 'vtr6Cur', width: 14 },
      { header: 'VTR 15s %', key: 'vtr15Cur', width: 14 }
    );

    ws.columns = baseColumns;

    ws.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF090D16' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });

    aggregatedRows.forEach(r => {
      const rowData: Record<string, any> = {
        brand: r.brand,
        platform: r.platform,
        adType: r.adType,
        kpi: r.kpi,
        format: r.format,
        adGroup: r.adGroup,
        pillar: r.pillar || '-',
        creativeName: r.creativeName,
        statusLabel: r.statusLabel,
        qrCur: Number((r.cur.qualityRate * 100).toFixed(2)),
        qrVsMed: Number(r.qrVsMedianPct.toFixed(1)),
        creativeLink: r.creativeLink || '-',
        spendCur: Math.round(r.cur.spend),
        impCur: Math.round(r.cur.imp),
        clicksCur: Math.round(r.cur.clicks),
        v6Cur: Math.round(r.cur.v6),
        v15Cur: Math.round(r.cur.v15),
        cpmCur: Math.round(r.cur.cpm),
        ctrCur: Number((r.cur.ctr * 100).toFixed(2)),
        erCur: Number((r.cur.er * 100).toFixed(2)),
        vtr6Cur: Number((r.cur.vtr6 * 100).toFixed(2)),
        vtr15Cur: Number((r.cur.vtr15 * 100).toFixed(2)),
      };

      if (isCpasSales) {
        rowData.gmvCur = Math.round(r.cur.gmv);
        rowData.roasCur = Number(r.cur.roas.toFixed(2));
        rowData.purchaseCur = Math.round(r.cur.purchase);
        rowData.crCur = Number((r.cur.cr * 100).toFixed(2));
      }

      ws.addRow(rowData);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Creative_AdGroup_Report_${granularity}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Helper to render the compact low-res video/image thumbnail button inside table cells
  const renderThumbnailButton = (row: AggregatedCreativeRow) => (
    <CreativePreviewThumbButton
      row={row}
      isDarkMode={isDarkMode}
      onOpen={() => openCreativeModal(row)}
    />
  );

  const linkedCount = useMemo(
    () => aggregatedRows.filter(r => r.mediaItems.length > 0).length,
    [aggregatedRows]
  );

  return (
    <div className="w-full space-y-6">
      {/* Sub-Navigation Bar: Digital Media Campaign Overview vs Creative & Ad Group Report */}
      <div className={`p-3.5 rounded-md border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex p-1 rounded-md border ${isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
            <button
              type="button"
              onClick={() => onSwitchSubPage('media')}
              className={`px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all ${
                isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Campaign Overview
            </button>
            <button
              type="button"
              onClick={() => onSwitchSubPage('creativeReport')}
              className="px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-2 bg-indigo-600 text-white shadow-sm transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Creative Report
            </button>
          </div>

          <div className="hidden xl:flex items-center gap-2 pl-2">
            <span className={`px-2.5 py-1 rounded text-[11px] font-bold border ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
              {aggregatedRows.length.toLocaleString()} Active Creatives
            </span>
            <span className={`px-2.5 py-1 rounded text-[11px] font-bold border ${isDarkMode ? 'bg-indigo-950/50 border-indigo-800/60 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
              {linkedCount.toLocaleString()} Video Previews Ready
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {isPlanner && (
          <button
            type="button"
            onClick={() => setShowPlaybookModal(true)}
            className={`px-3.5 py-2 rounded-md border font-bold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer ${
              isDarkMode
                ? 'bg-[#111827] border-indigo-500/50 text-indigo-300 hover:bg-indigo-950/60 hover:text-white'
                : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Playbook
          </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Excel
          </button>
        </div>
      </div>

      {/* Platform Context Cards (Overall / Meta / TikTok) - Shown in Leaderboard & Matrix POV */}
      {viewMode !== 'ai_learnings' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
            <div
              onClick={() => setDashboardContext('Overall')}
              className={`bg-indigo-600 rounded-md p-5 lg:p-6 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 ${
                dashboardContext === 'Overall' ? 'ring-2 ring-indigo-300' : ''
              }`}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-indigo-100 uppercase tracking-widest">Overall Creative Media</h3>
                <div className="p-2 bg-white/20 rounded-md">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <div className="space-y-3.5">
                <div className="flex justify-between items-end border-b border-indigo-500 pb-2.5">
                  <span className="text-xs font-semibold text-indigo-200">Spend</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-lg sm:text-xl text-white leading-none">{formatIDR(platformKPIs.overall.cur.spend)}</span>
                    {renderGR(platformKPIs.overall.cur.spend, platformKPIs.overall.prev.spend, false, isDarkMode)}
                  </div>
                </div>
                <div className="flex justify-between items-end border-b border-indigo-500 pb-2.5">
                  <span className="text-xs font-semibold text-indigo-200">Impressions</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-lg sm:text-xl text-white leading-none">{formatNum(platformKPIs.overall.cur.imp)}</span>
                    {renderGR(platformKPIs.overall.cur.imp, platformKPIs.overall.prev.imp, false, isDarkMode)}
                  </div>
                </div>
                <div className="flex justify-between items-end pt-0.5">
                  <span className="text-xs font-semibold text-indigo-200">Clicks / CTR</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-base sm:text-lg text-white leading-none">
                      {formatNum(platformKPIs.overall.cur.clicks)} <span className="text-indigo-200 text-xs">({formatPct(platformKPIs.overall.cur.ctr)})</span>
                    </span>
                    {renderGR(platformKPIs.overall.cur.ctr, platformKPIs.overall.prev.ctr, false, isDarkMode)}
                  </div>
                </div>
              </div>
            </div>

            <div
              onClick={() => setDashboardContext('Meta')}
              className={`bg-blue-600 rounded-md p-5 lg:p-6 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 ${
                dashboardContext === 'Meta' ? 'ring-2 ring-blue-300' : ''
              }`}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-blue-100 uppercase tracking-widest">Meta Creatives</h3>
                <div className="p-2 bg-white/20 rounded-md">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                </div>
              </div>
              <div className="space-y-3.5">
                <div className="flex justify-between items-end border-b border-blue-400 pb-2.5">
                  <span className="text-xs font-semibold text-blue-100">Spend</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-lg sm:text-xl text-white leading-none">{formatIDR(platformKPIs.meta.cur.spend)}</span>
                    {renderGR(platformKPIs.meta.cur.spend, platformKPIs.meta.prev.spend, false, isDarkMode)}
                  </div>
                </div>
                <div className="flex justify-between items-end border-b border-blue-400 pb-2.5">
                  <span className="text-xs font-semibold text-blue-100">Impressions</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-lg sm:text-xl text-white leading-none">{formatNum(platformKPIs.meta.cur.imp)}</span>
                    {renderGR(platformKPIs.meta.cur.imp, platformKPIs.meta.prev.imp, false, isDarkMode)}
                  </div>
                </div>
                <div className="flex justify-between items-end pt-0.5">
                  <span className="text-xs font-semibold text-blue-100">Clicks / CTR</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-base sm:text-lg text-white leading-none">
                      {formatNum(platformKPIs.meta.cur.clicks)} <span className="text-blue-100 text-xs">({formatPct(platformKPIs.meta.cur.ctr)})</span>
                    </span>
                    {renderGR(platformKPIs.meta.cur.ctr, platformKPIs.meta.prev.ctr, false, isDarkMode)}
                  </div>
                </div>
              </div>
            </div>

            <div
              onClick={() => setDashboardContext('TikTok')}
              className={`rounded-md p-5 lg:p-6 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 ${
                isDarkMode ? 'bg-[#0f172a] border border-slate-800' : 'bg-slate-900 text-white'
              } ${dashboardContext === 'TikTok' ? 'ring-2 ring-slate-400' : ''}`}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">TikTok Creatives</h3>
                <div className="p-2 bg-white/20 rounded-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-3.5">
                <div className="flex justify-between items-end border-b border-slate-700 pb-2.5">
                  <span className="text-xs font-semibold text-slate-400">Spend</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-lg sm:text-xl text-white leading-none">{formatIDR(platformKPIs.tiktok.cur.spend)}</span>
                    {renderGR(platformKPIs.tiktok.cur.spend, platformKPIs.tiktok.prev.spend, false, isDarkMode)}
                  </div>
                </div>
                <div className="flex justify-between items-end border-b border-slate-700 pb-2.5">
                  <span className="text-xs font-semibold text-slate-400">Impressions</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-lg sm:text-xl text-white leading-none">{formatNum(platformKPIs.tiktok.cur.imp)}</span>
                    {renderGR(platformKPIs.tiktok.cur.imp, platformKPIs.tiktok.prev.imp, false, isDarkMode)}
                  </div>
                </div>
                <div className="flex justify-between items-end pt-0.5">
                  <span className="text-xs font-semibold text-slate-400">Clicks / CTR</span>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className="font-bold text-base sm:text-lg text-white leading-none">
                      {formatNum(platformKPIs.tiktok.cur.clicks)} <span className="text-slate-400 text-xs">({formatPct(platformKPIs.tiktok.cur.ctr)})</span>
                    </span>
                    {renderGR(platformKPIs.tiktok.cur.ctr, platformKPIs.tiktok.prev.ctr, false, isDarkMode)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Efficiency & Video View Strip for Active Context */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: '6s Video Views', cur: activeContextKPI.cur.v6, prev: activeContextKPI.prev.v6, fmt: formatNum, inv: false },
              { label: '15s Video Views', cur: activeContextKPI.cur.v15, prev: activeContextKPI.prev.v15, fmt: formatNum, inv: false },
              { label: 'CPM Efficiency', cur: activeContextKPI.cur.cpm, prev: activeContextKPI.prev.cpm, fmt: formatIDR, inv: true },
              { label: 'CTR %', cur: activeContextKPI.cur.ctr, prev: activeContextKPI.prev.ctr, fmt: formatPct, inv: false },
              { label: 'VTR (6s) %', cur: activeContextKPI.cur.vtr6, prev: activeContextKPI.prev.vtr6, fmt: formatPct, inv: false },
              { label: 'VTR (15s) %', cur: activeContextKPI.cur.vtr15, prev: activeContextKPI.prev.vtr15, fmt: formatPct, inv: false },
            ].map((card, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-md border shadow-sm flex flex-col justify-between ${
                  isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{card.label}</span>
                <div className="flex items-end justify-between gap-1.5">
                  <span className={`font-mono font-bold text-sm sm:text-base leading-none ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {card.fmt(card.cur)}
                  </span>
                  {renderGR(card.cur, card.prev, card.inv, isDarkMode)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Main Creative & Ad Group Table Container */}
      <div className={`rounded-md border shadow-sm overflow-hidden ${isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`}>
        {/* Table Control Bar */}
        <div className={`p-4 border-b space-y-3 ${isDarkMode ? 'border-slate-800 bg-[#090d16]' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {viewMode === 'ai_learnings'
                  ? 'Creative Learning Engine'
                  : `${dashboardContext} Creative Report`}
              </h2>
            </div>

            {/* Table POV Switcher: Leaderboard vs Period Breakdown Matrix vs AI Creative Learnings */}
            <div className="flex flex-wrap items-center gap-2">
              <div className={`inline-flex p-1 rounded-md border ${isDarkMode ? 'bg-[#111827] border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setViewMode('leaderboard')}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'leaderboard'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Creative Leaderboard
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('matrix')}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'matrix'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {granularity === 'monthly' ? 'Monthly Breakdown POV' : granularity === 'weekly' ? 'Weekly MTD Matrix POV' : 'Daily Breakdown POV'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('ai_learnings')}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'ai_learnings'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Creative Learning Engine</span>
                </button>
              </div>
            </div>
          </div>

          {/* Secondary Filters Row: Search, Ad Group Filter, Link Status, Matrix Controls */}
          {viewMode !== 'ai_learnings' && (
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                  {/* Local Search */}
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Search Creative Name, Ad Group or Pillar..."
                      value={localSearch}
                      onChange={e => setLocalSearch(e.target.value)}
                      className={`w-full py-1.5 pl-8 pr-3 rounded-md border text-xs font-medium outline-none transition-colors ${
                        isDarkMode
                          ? 'bg-[#111827] border-slate-700 text-white placeholder-slate-400 focus:border-indigo-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                      }`}
                    />
                    <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {/* Ad Group Dropdown */}
                  <select
                    value={localAdGroup}
                    onChange={e => setLocalAdGroup(e.target.value)}
                    className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none max-w-[220px] truncate ${
                      isDarkMode
                        ? 'bg-[#111827] border-slate-700 text-indigo-300'
                        : 'bg-slate-50 border-slate-300 text-indigo-700'
                    }`}
                  >
                    <option value="All">All Ad Groups ({adGroupOptions.length - 1})</option>
                    {adGroupOptions.slice(1).map(ag => (
                      <option key={ag} value={ag}>{ag}</option>
                    ))}
                  </select>

                  {/* Link Filter */}
                  <div className={`inline-flex p-0.5 rounded-md border ${isDarkMode ? 'bg-[#111827] border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'with_link', label: 'Has Video' },
                      { id: 'no_link', label: 'No Link' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setLinkFilter(opt.id as any)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                          linkFilter === opt.id
                            ? 'bg-indigo-600 text-white'
                            : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Matrix Mode Controls */}
                {viewMode === 'matrix' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={`inline-flex p-0.5 rounded-md border ${isDarkMode ? 'bg-[#111827] border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                      <button
                        type="button"
                        onClick={() => setMatrixLayout('compact')}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                          matrixLayout === 'compact' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Compact Rows
                      </button>
                      <button
                        type="button"
                        onClick={() => setMatrixLayout('multi')}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                          matrixLayout === 'multi' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Metric Rows
                      </button>
                    </div>

                    {matrixLayout === 'compact' && (
                      <select
                        value={matrixMetric}
                        onChange={e => setMatrixMetric(e.target.value as SortField)}
                        className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none ${
                          isDarkMode ? 'bg-[#111827] border-slate-700 text-amber-300' : 'bg-slate-50 border-slate-300 text-amber-700'
                        }`}
                      >
                        {activeMetricDefs.map(m => (
                          <option key={m.key} value={m.key}>Metric: {m.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Deterministic Quality Classifier Quick Filter Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/40">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                  Quality Tier:
                </span>
                {[
                  {
                    id: 'ALL' as const,
                    label: 'All',
                    count: statusCounts.total,
                    activeClass: 'bg-indigo-600 text-white border-indigo-500',
                    inactiveClass: isDarkMode ? 'bg-[#111827] border-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200',
                  },
                  {
                    id: 'OPTIMIZED_TOP' as const,
                    label: 'Optimized Top',
                    count: statusCounts.optimizedTop,
                    activeClass: 'bg-emerald-600 text-white border-emerald-500',
                    inactiveClass: isDarkMode ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/60' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
                  },
                  {
                    id: 'POTENTIAL_GEM' as const,
                    label: 'Potential',
                    count: statusCounts.potentialGem,
                    activeClass: 'bg-violet-600 text-white border-violet-500',
                    inactiveClass: isDarkMode ? 'bg-violet-950/30 border-violet-500/30 text-violet-300 hover:bg-violet-950/60' : 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100',
                  },
                  {
                    id: 'INEFFICIENT_SPEND' as const,
                    label: 'High Spend / Low Quality',
                    count: statusCounts.inefficientSpend,
                    activeClass: 'bg-rose-600 text-white border-rose-500',
                    inactiveClass: isDarkMode ? 'bg-rose-950/30 border-rose-500/30 text-rose-300 hover:bg-rose-950/60' : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
                  },
                ].map(pill => {
                  const isActive = statusFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setStatusFilter(pill.id)}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isActive ? pill.activeClass : pill.inactiveClass
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                        isActive ? 'bg-black/25 text-white' : isDarkMode ? 'bg-slate-800/80 text-slate-300' : 'bg-white/80 text-slate-700'
                      }`}>
                        {pill.count}
                      </span>
                    </button>
                  );
                })}

                {activeMetricFilterKeys.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                    {activeMetricFilterKeys.map(k => {
                      const def = ALL_METRIC_DEFS.find(d => d.key === k);
                      const cfg = metricFilters[k]!;
                      const summary =
                        cfg.mode === 'average'
                          ? cfg.avgTier === 'below'
                            ? 'Below Avg'
                            : cfg.avgTier === 'average'
                            ? 'Average'
                            : 'Above Avg'
                          : [
                              cfg.aboveVal.trim() ? `≥ ${cfg.aboveVal}${def?.unit === '%' ? '%' : ''}` : '',
                              cfg.underVal.trim() ? `≤ ${cfg.underVal}${def?.unit === '%' ? '%' : ''}` : '',
                            ]
                              .filter(Boolean)
                              .join(' & ');
                      return (
                        <span
                          key={k}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isDarkMode
                              ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300'
                              : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          }`}
                        >
                          <span>{def?.shortLabel || k}: {summary}</span>
                          <button
                            type="button"
                            onClick={() => clearSingleMetricFilter(k)}
                            className="hover:text-rose-400 ml-0.5 cursor-pointer"
                            title={`Remove ${def?.label || k} filter`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setMetricFilters({})}
                      className="text-[10px] font-bold text-rose-400 hover:text-rose-300 underline px-1 cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* TABLE VIEW 1: CREATIVE & AD GROUP LEADERBOARD */}
        {viewMode === 'leaderboard' && (
          <div className="overflow-auto max-h-[760px] relative w-full">
            <table className={`min-w-full text-left text-xs whitespace-nowrap border-separate [border-spacing:0] ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
              <thead>
                <tr>
                  <th
                    style={{ position: 'sticky', top: 0, left: 0, zIndex: 60, width: 84, minWidth: 84, maxWidth: 84, backgroundColor: '#090d16' }}
                    className="px-3 py-3.5 font-bold text-slate-100 border-b border-r border-slate-800 text-center"
                  >
                    Preview
                  </th>
                  <th
                    style={{ position: 'sticky', top: 0, left: 84, zIndex: 60, width: 325, minWidth: 325, maxWidth: 325, backgroundColor: '#090d16' }}
                    className="px-4 py-3.5 font-bold text-slate-100 border-b border-r border-slate-800 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.3)]"
                  >
                    Creative Name & Ad Group
                  </th>
                  {activeMetricDefs.map(m => {
                    const isSorted = sortField === m.key;
                    const isFiltered = isMetricFilterActive(metricFilters[m.key]);
                    const isMenuOpen = openFilterMetric === m.key;
                    return (
                      <th
                        key={m.key}
                        style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#090d16' }}
                        className="px-3.5 py-3 text-right font-bold text-slate-100 border-b border-slate-800 select-none"
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSort(m.key)}
                            className="inline-flex items-center gap-1 hover:text-indigo-300 transition-colors cursor-pointer"
                            title={`Sort by ${m.label}`}
                          >
                            <span>{m.label}</span>
                            {isSorted ? (
                              <span className="text-indigo-400 text-[10px]">{sortDir === 'desc' ? '▼' : '▲'}</span>
                            ) : (
                              <span className="text-slate-600 text-[10px]">↕</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={e => handleToggleMetricFilterMenu(e, m.key)}
                            title={`Filter ${m.label}`}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              isFiltered
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : isMenuOpen
                                ? 'bg-slate-800 text-indigo-300'
                                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/70'
                            }`}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={2 + activeMetricDefs.length} className="px-6 py-12 text-center text-slate-400 font-semibold">
                      No creative records match the current filters and date range.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, idx) => {
                    const rowBg = idx % 2 === 0
                      ? (isDarkMode ? 'bg-slate-900' : 'bg-white')
                      : (isDarkMode ? 'bg-[#131c2e]' : 'bg-slate-50/80');
                    const spendPct = Math.min(100, (row.cur.spend / maxSpendInList) * 100);

                    const statusBadgeStyle =
                      row.status === 'OPTIMIZED_TOP'
                        ? isDarkMode
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : row.status === 'POTENTIAL_GEM'
                        ? isDarkMode
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                          : 'bg-violet-50 text-violet-700 border border-violet-300'
                        : row.status === 'INEFFICIENT_SPEND'
                        ? isDarkMode
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-rose-50 text-rose-700 border border-rose-300'
                        : '';

                    return (
                      <tr
                        key={row.key}
                        className={`${rowBg} hover:${isDarkMode ? 'bg-indigo-950/30' : 'bg-indigo-50/50'} transition-colors`}
                      >
                        {/* Sticky Col 1: Small Video Thumbnail */}
                        <td
                          style={{ position: 'sticky', left: 0, zIndex: 20, width: 84, minWidth: 84, maxWidth: 84 }}
                          className={`px-2.5 py-2.5 border-b border-r align-middle ${rowBg} ${
                            isDarkMode ? 'border-slate-800' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center">
                            {renderThumbnailButton(row)}
                          </div>
                        </td>

                        {/* Sticky Col 2: Creative Name + Ad Group + Status & Pillar Badges */}
                        <td
                          style={{ position: 'sticky', left: 84, zIndex: 20, width: 325, minWidth: 325, maxWidth: 325 }}
                          className={`px-4 py-2.5 border-b border-r align-middle whitespace-normal shadow-[4px_0_10px_-3px_rgba(0,0,0,0.08)] ${rowBg} ${
                            isDarkMode ? 'border-slate-800' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => openCreativeModal(row)}
                              className={`text-left font-bold text-xs leading-snug line-clamp-2 hover:text-indigo-400 transition-colors cursor-pointer ${
                                isDarkMode ? 'text-slate-100' : 'text-slate-900'
                              }`}
                              title={row.creativeName}
                            >
                              {row.creativeName || 'Unnamed Creative'}
                            </button>
                            <p className="text-[11px] text-slate-400 font-medium line-clamp-1" title={`Ad Group: ${row.adGroup}`}>
                              <span className="text-slate-500">Ad Group:</span> {row.adGroup || '-'}
                            </p>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {row.status !== 'BASELINE' ? (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight ${statusBadgeStyle}`}>
                                  {row.statusLabel}
                                </span>
                              ) : !row.isSpendValid && row.cur.spend > 0 ? (
                                <span
                                  title={`Spend (${formatIDR(row.cur.spend)}) is below the minimum valid spend floor (${formatIDR(row.benchmarks.minValidSpend)}) for ${row.brand} • ${row.adType || row.kpi} • ${row.format || 'Format'}`}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                    isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-600'
                                  }`}
                                >
                                  Low Spend (Unvalidated)
                                </span>
                              ) : null}
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                row.platform.toLowerCase().includes('tiktok')
                                  ? 'bg-pink-500/15 text-pink-400 border border-pink-500/30'
                                  : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              }`}>
                                {row.platform}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {row.brand}
                              </span>
                              {row.pillar && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  isDarkMode ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  {row.pillar}
                                </span>
                              )}
                              {row.format && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                  isDarkMode ? 'bg-slate-800/80 text-slate-400' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {row.format}
                                </span>
                              )}
                              {row.adType && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium truncate max-w-[130px] ${
                                  isDarkMode ? 'bg-indigo-950/60 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                                }`} title={row.adType}>
                                  {row.adType}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Metric Columns (Creative Level: Current Period Value Only + Quality Rate vs Condition Median) */}
                        {activeMetricDefs.map(m => {
                          const curVal = row.cur[m.key];
                          const vsMed = row.qrVsMedianPct;
                          const vsMedSign = vsMed >= 0 ? '+' : '';
                          return (
                            <td
                              key={m.key}
                              className={`px-4 py-2.5 text-right font-mono align-middle border-b ${
                                isDarkMode ? 'border-slate-800/80' : 'border-slate-100'
                              }`}
                            >
                              <div className="flex flex-col items-end justify-center gap-0.5">
                                <span className={`font-bold text-xs ${
                                  m.key === 'roas' && curVal >= 3
                                    ? isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                                    : isDarkMode ? 'text-slate-100' : 'text-slate-800'
                                }`}>
                                  {m.fmt(curVal)}
                                </span>
                                {m.key === 'qualityRate' && row.benchmarks.medianQR > 0 && (
                                  <>
                                    <span
                                      title={`Condition Standard (${row.brand} • ${row.adType || row.kpi} • ${row.format || 'All'}): Median QR = ${formatPct(row.benchmarks.medianQR)}, Median Spend = ${formatIDR(row.benchmarks.medianSpend)}`}
                                      className={`text-[10px] font-semibold ${
                                        vsMed >= 15
                                          ? isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                                          : vsMed <= -15
                                          ? isDarkMode ? 'text-rose-400' : 'text-rose-600'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      ({vsMedSign}{Math.round(vsMed)}% vs median)
                                    </span>
                                    <span className="text-[9px] text-indigo-400 font-semibold">
                                      Weighted: {row.weightedQualityPct.toFixed(1)}%
                                    </span>
                                  </>
                                )}
                                {m.key === 'spend' && (
                                  <div className={`w-20 h-1 rounded-full overflow-hidden mt-0.5 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${spendPct}%` }} />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Metric Column Filter Mini Setting Popover */}
        {openFilterMetric && filterPopoverPos && (() => {
          const mDef = ALL_METRIC_DEFS.find(d => d.key === openFilterMetric);
          if (!mDef) return null;
          const cfg = metricFilters[openFilterMetric] || {
            mode: 'none',
            underVal: '',
            aboveVal: '',
            avgTier: null,
          };
          const avgRaw = metricCohortAverages[openFilterMetric] || 0;
          const lowBound = avgRaw * 0.9;
          const highBound = avgRaw * 1.1;
          const hasFilter = isMetricFilterActive(cfg);

          return (
            <div
              ref={filterPopoverRef}
              style={{
                position: 'fixed',
                top: filterPopoverPos.top,
                left: filterPopoverPos.left,
                width: 272,
                zIndex: 9999,
              }}
              className={`rounded-md border shadow-xl p-3.5 text-xs space-y-3 ${
                isDarkMode
                  ? 'bg-[#0b1120] border-slate-700 text-slate-200'
                  : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2 border-slate-800/60">
                <div>
                  <p className="font-bold text-xs">{mDef.label} Filter</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Cohort Avg: <span className="font-bold text-indigo-400">{mDef.fmt(avgRaw)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasFilter && (
                    <button
                      type="button"
                      onClick={() => clearSingleMetricFilter(openFilterMetric)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenFilterMetric(null)}
                    className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Option 1: Manual Fill (Under XX, Above XX) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    1. Manual Fill {mDef.unit ? `(${mDef.unit})` : ''}
                  </span>
                  {cfg.mode === 'manual' && (
                    <span className="text-[9px] font-bold text-indigo-400">Active</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Under (≤)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder={mDef.unit === '%' ? 'e.g. 5.0' : 'Max...'}
                      value={cfg.underVal}
                      onChange={e => updateMetricManualFilter(openFilterMetric, 'underVal', e.target.value)}
                      className={`w-full py-1.5 px-2 rounded border text-xs font-mono outline-none ${
                        isDarkMode
                          ? 'bg-[#111827] border-slate-700 text-white focus:border-indigo-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Above (≥)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder={mDef.unit === '%' ? 'e.g. 1.5' : 'Min...'}
                      value={cfg.aboveVal}
                      onChange={e => updateMetricManualFilter(openFilterMetric, 'aboveVal', e.target.value)}
                      className={`w-full py-1.5 px-2 rounded border text-xs font-mono outline-none ${
                        isDarkMode
                          ? 'bg-[#111827] border-slate-700 text-white focus:border-indigo-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Option 2: Cohort Average Tier (3 Sub-Options computed from applied sidebar & topbar filters) */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    2. vs Filtered Average
                  </span>
                  {cfg.mode === 'average' && (
                    <span className="text-[9px] font-bold text-indigo-400">Active</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    {
                      id: 'below' as const,
                      label: 'Below Average',
                      hint: `< ${mDef.fmt(lowBound)}`,
                    },
                    {
                      id: 'average' as const,
                      label: 'Average',
                      hint: `${mDef.fmt(lowBound)} – ${mDef.fmt(highBound)}`,
                    },
                    {
                      id: 'above' as const,
                      label: 'Above Average',
                      hint: `> ${mDef.fmt(highBound)}`,
                    },
                  ].map(opt => {
                    const selected = cfg.mode === 'average' && cfg.avgTier === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateMetricAverageTier(openFilterMetric, opt.id)}
                        className={`w-full px-2.5 py-1.5 rounded border text-left flex items-center justify-between transition-colors cursor-pointer ${
                          selected
                            ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                            : isDarkMode
                            ? 'bg-[#111827] border-slate-700 text-slate-300 hover:border-slate-500'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <span className={`text-[10px] font-mono ${selected ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* TABLE VIEW 2: PERIOD / MTD / DAILY BREAKDOWN MATRIX */}
        {viewMode === 'matrix' && (
          <div className="overflow-auto max-h-[760px] relative w-full">
            <table className={`min-w-full text-left text-xs whitespace-nowrap border-separate [border-spacing:0] ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
              <thead>
                <tr>
                  <th
                    style={{ position: 'sticky', top: 0, left: 0, zIndex: 60, width: 84, minWidth: 84, maxWidth: 84, backgroundColor: '#090d16' }}
                    className="px-3 py-3.5 font-bold text-slate-100 border-b border-r border-slate-800 text-center"
                  >
                    Preview
                  </th>
                  <th
                    style={{ position: 'sticky', top: 0, left: 84, zIndex: 60, width: 280, minWidth: 280, maxWidth: 280, backgroundColor: '#090d16' }}
                    className="px-4 py-3.5 font-bold text-slate-100 border-b border-r border-slate-800"
                  >
                    Creative & Ad Group
                  </th>
                  {matrixLayout === 'multi' && (
                    <th
                      style={{ position: 'sticky', top: 0, left: 364, zIndex: 60, width: 110, minWidth: 110, maxWidth: 110, backgroundColor: '#090d16' }}
                      className="px-3 py-3.5 font-bold text-slate-100 border-b border-r border-slate-800 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.3)]"
                    >
                      Metric
                    </th>
                  )}

                  {granularity === 'monthly' && (
                    <th style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#090d16' }} className="px-4 py-3.5 text-right font-bold text-white border-b border-slate-800">Selected Month</th>
                  )}

                  {granularity === 'weekly' && globalDates && weeksList.map(w => {
                    const weekNum = parseInt(w.replace('W', ''));
                    let curD = new Date(globalDates.curStart); curD.setDate(curD.getDate() + (weekNum * 7) - 1); if (curD > globalDates.curMtdEnd) curD = new Date(globalDates.curMtdEnd);
                    const fmtStr = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
                    return (
                      <th key={w} style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#090d16' }} className="px-4 py-3.5 text-right font-bold text-white border-b border-l border-slate-800">
                        MTD {fmtStr(curD)}
                      </th>
                    );
                  })}
                  {granularity === 'weekly' && (
                    <th style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#020617' }} className="px-4 py-3.5 text-right font-bold text-indigo-300 border-b border-l border-indigo-500/50">
                      MTD Total
                    </th>
                  )}

                  {granularity === 'daily' && daysList.map(d => {
                    const parts = d.split('-');
                    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    return (
                      <th key={d} style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#090d16' }} className="px-3.5 py-3.5 text-right font-bold text-white border-b border-slate-800">
                        {dt.getDate()} {dt.toLocaleString('en-GB', { month: 'short' })}
                      </th>
                    );
                  })}
                  {granularity === 'daily' && (
                    <th style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#020617' }} className="px-4 py-3.5 text-right font-bold text-indigo-300 border-b border-l border-slate-700">
                      Period Total
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, idx) => {
                  const metricsToRender = matrixLayout === 'compact'
                    ? [activeMetricDefs.find(m => m.key === matrixMetric) || activeMetricDefs[0]]
                    : activeMetricDefs;

                  const statusBadgeStyle =
                    row.status === 'OPTIMIZED_TOP'
                      ? isDarkMode
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                      : row.status === 'POTENTIAL_GEM'
                      ? isDarkMode
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                        : 'bg-violet-50 text-violet-700 border border-violet-300'
                      : row.status === 'INEFFICIENT_SPEND'
                      ? isDarkMode
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-rose-50 text-rose-700 border border-rose-300'
                      : '';

                  return metricsToRender.map((m, mIdx) => {
                    const isFirst = mIdx === 0;
                    const isLast = mIdx === metricsToRender.length - 1;
                    const baseRowBg = (idx + mIdx) % 2 === 0
                      ? (isDarkMode ? 'bg-slate-900' : 'bg-white')
                      : (isDarkMode ? 'bg-[#131c2e]' : 'bg-slate-50/80');

                    return (
                      <tr
                        key={`${row.key}-${m.key}`}
                        className={`${baseRowBg} ${isFirst && matrixLayout === 'multi' ? 'group-start' : ''} ${isLast && matrixLayout === 'multi' ? 'group-end' : ''}`}
                      >
                        {isFirst && (
                          <>
                            <td
                              rowSpan={metricsToRender.length}
                              style={{ position: 'sticky', left: 0, zIndex: 20, width: 84, minWidth: 84, maxWidth: 84 }}
                              className={`px-2.5 py-2.5 border-b border-r align-top ${baseRowBg} ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}
                            >
                              <div className="flex items-center justify-center">
                                {renderThumbnailButton(row)}
                              </div>
                            </td>
                            <td
                              rowSpan={metricsToRender.length}
                              style={{ position: 'sticky', left: 84, zIndex: 20, width: 280, minWidth: 280, maxWidth: 280 }}
                              className={`px-4 py-2.5 border-b border-r align-top whitespace-normal ${baseRowBg} ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}
                            >
                              <button
                                type="button"
                                onClick={() => openCreativeModal(row)}
                                className={`text-left font-bold text-xs line-clamp-2 hover:text-indigo-400 cursor-pointer ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
                              >
                                {row.creativeName}
                              </button>
                              <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{row.adGroup}</p>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {row.status !== 'BASELINE' && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadgeStyle}`}>
                                    {row.statusLabel}
                                  </span>
                                )}
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/15 text-indigo-400">
                                  {row.platform} • {row.brand}
                                </span>
                                {row.pillar && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    isDarkMode ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}>
                                    {row.pillar}
                                  </span>
                                )}
                              </div>
                            </td>
                          </>
                        )}

                        {matrixLayout === 'multi' && (
                          <td
                            style={{ position: 'sticky', left: 364, zIndex: 20, width: 110, minWidth: 110, maxWidth: 110 }}
                            className={`px-3 py-2.5 font-semibold border-b border-r ${baseRowBg} ${isDarkMode ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-700'}`}
                          >
                            {m.shortLabel}
                          </td>
                        )}

                        {granularity === 'monthly' && (
                          <td className={`px-4 py-2.5 text-right font-mono font-bold border-b ${isDarkMode ? 'border-slate-800 text-slate-100' : 'border-slate-100 text-slate-800'}`}>
                            {m.fmt(row.cur[m.key])}
                          </td>
                        )}

                        {granularity === 'weekly' && weeksList.map(w => {
                          const wCur = row.bucketsCur[w]?.[m.key] || 0;
                          return (
                            <td key={w} className={`px-4 py-2.5 text-right font-mono font-semibold border-b border-l ${isDarkMode ? 'border-slate-800 text-slate-200' : 'border-slate-200 text-slate-800'}`}>
                              {m.fmt(wCur)}
                            </td>
                          );
                        })}
                        {granularity === 'weekly' && (
                          <td className={`px-4 py-2.5 text-right font-mono font-bold border-b border-l ${isDarkMode ? 'border-indigo-500/40 bg-indigo-950/30 text-indigo-300' : 'border-indigo-200 bg-indigo-50/50 text-indigo-700'}`}>
                            {m.fmt(row.cur[m.key])}
                          </td>
                        )}

                        {granularity === 'daily' && daysList.map(d => {
                          const dVal = row.bucketsCur[d]?.[m.key] || 0;
                          return (
                            <td key={d} className={`px-3.5 py-2.5 text-right font-mono border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                              {m.fmt(dVal)}
                            </td>
                          );
                        })}
                        {granularity === 'daily' && (
                          <td className={`px-4 py-2.5 text-right font-mono font-bold border-b border-l ${isDarkMode ? 'border-indigo-800/50 bg-indigo-950/40 text-indigo-300' : 'border-indigo-100 bg-indigo-50/50 text-indigo-700'}`}>
                            {m.fmt(row.cur[m.key])}
                          </td>
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE VIEW 3: CREATIVE LEARNING ENGINE (Executive One-Slider Report synced with Google Sheets) */}
        {viewMode === 'ai_learnings' && (
          <div className="p-4 lg:p-6 space-y-5">
            {/* Interconnected Condition Filters (Brand, Platform, Ad Type/KPI, Format, Pillar) + Dual Period Settings */}
            <div className={`p-4 rounded-md border space-y-4 ${
              isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              {/* Row 1: Interconnected Condition Filters */}
              <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-3.5 border-b border-slate-800/70">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Brand Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Brand</label>
                    <select
                      value={aiBrandFilter}
                      onChange={e => setAiBrandFilter(e.target.value)}
                      className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none ${
                        isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {aiBrandOptions.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {/* Platform Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Platform</label>
                    <select
                      value={aiPlatformFilter}
                      onChange={e => setAiPlatformFilter(e.target.value)}
                      className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none ${
                        isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {aiPlatformOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* Ad Type / KPI Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ad Type / KPI</label>
                    <select
                      value={aiAdTypeFilter}
                      onChange={e => setAiAdTypeFilter(e.target.value)}
                      className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none max-w-[210px] truncate ${
                        isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {aiAdTypeOptions.map(at => (
                        <option key={at} value={at}>{at}</option>
                      ))}
                    </select>
                  </div>

                  {/* Format Standard Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Format Standard</label>
                    <select
                      value={aiFormatFilter}
                      onChange={e => setAiFormatFilter(e.target.value)}
                      className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none max-w-[180px] truncate ${
                        isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {aiFormatOptions.map(fmt => (
                        <option key={fmt} value={fmt}>{fmt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pillar Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pillar</label>
                    <select
                      value={aiPillarFilter}
                      onChange={e => setAiPillarFilter(e.target.value)}
                      className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none max-w-[180px] truncate ${
                        isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {aiPillarOptions.map(pil => (
                        <option key={pil} value={pil}>{pil}</option>
                      ))}
                    </select>
                  </div>

                  {(aiBrandFilter !== 'All Brands' ||
                    aiPlatformFilter !== 'All Platforms' ||
                    aiAdTypeFilter !== 'All Ad Types' ||
                    aiFormatFilter !== 'All Formats' ||
                    aiPillarFilter !== 'All Pillars') && (
                    <button
                      type="button"
                      onClick={() => {
                        setAiBrandFilter('All Brands');
                        setAiPlatformFilter('All Platforms');
                        setAiAdTypeFilter('All Ad Types');
                        setAiFormatFilter('All Formats');
                        setAiPillarFilter('All Pillars');
                      }}
                      className={`px-2.5 py-1.5 rounded-md border text-xs font-bold transition-colors cursor-pointer ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>

                {/* Cache Status Badge + Incremental Sync Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {isLoadingCache ? (
                    <span className="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      Reading cached learnings...
                    </span>
                  ) : activeCachedLearning ? (
                    <div className={`px-3 py-1.5 rounded-md border text-xs font-semibold flex items-center gap-2 ${
                      isDarkMode
                        ? 'bg-slate-900 border-slate-700 text-slate-200'
                        : 'bg-white border-slate-300 text-slate-700'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${isSignatureMatchingCache ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                      <span>
                        Synced in Sheet •{' '}
                        <strong>
                          {activeCachedLearning.analyzed_at
                            ? new Date(activeCachedLearning.analyzed_at).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Saved'}
                        </strong>
                        {!isSignatureMatchingCache && ' • New Top Creatives Detected'}
                      </span>
                    </div>
                  ) : (
                    <div className={`px-3 py-1.5 rounded-md border text-xs font-semibold flex items-center gap-2 ${
                      isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-white border-slate-300 text-slate-600'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      <span>Not yet synced for this cohort</span>
                    </div>
                  )}

                  {isPlanner && (
                    <>
                      <button
                        type="button"
                        disabled={isAnalyzingCohort || aiLiveCohort.creatives.length === 0}
                        onClick={() => handleTriggerCohortAnalysis(false)}
                        className="px-3.5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                      >
                        {isAnalyzingCohort ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Watching Videos & Generating Report...</span>
                          </>
                        ) : (
                          <span>Generate One-Slider Report</span>
                        )}
                      </button>

                      {activeCachedLearning && (
                        <button
                          type="button"
                          disabled={isAnalyzingCohort}
                          onClick={() => handleTriggerCohortAnalysis(true)}
                          title="Force refresh One-Slider Report and update Google Sheets cache"
                          className={`px-2.5 py-2 rounded-md border text-xs font-bold transition-colors cursor-pointer ${
                            isDarkMode
                              ? 'bg-[#111827] border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Refresh Report
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowApiKeyConfig(v => !v)}
                        title="Configure Engine API Key"
                        className={`px-2.5 py-2 rounded-md border text-xs font-bold transition-colors cursor-pointer ${
                          !customGeminiKey
                            ? isDarkMode
                              ? 'bg-amber-950/40 border-amber-600/50 text-amber-300 hover:text-amber-200'
                              : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                            : isDarkMode
                              ? 'bg-[#111827] border-slate-700 text-slate-400 hover:text-white'
                              : 'bg-white border-slate-300 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {customGeminiKey ? 'API Key Config' : 'Set API Key'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: Dual Period Settings (Option 1: Month + Tue–Sun Weekly Range | Option 2: Dynamic Flexible Calendar Range) */}
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Period Mode Toggle */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Period Settings Mode</label>
                    <div className={`inline-flex p-0.5 rounded-md border ${
                      isDarkMode ? 'bg-[#111827] border-slate-700' : 'bg-white border-slate-300'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setAiPeriodMode('weekly_month')}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                          aiPeriodMode === 'weekly_month'
                            ? 'bg-indigo-600 text-white'
                            : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        1. Month &amp; Weekly (Tue–Sun)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiPeriodMode('custom_range')}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                          aiPeriodMode === 'custom_range'
                            ? 'bg-indigo-600 text-white'
                            : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        2. Flexible Calendar Range
                      </button>
                    </div>
                  </div>

                  {aiPeriodMode === 'weekly_month' ? (
                    <>
                      {/* Primary Option Part A: Choose Month */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Month</label>
                        <select
                          value={aiSelectedMonth}
                          onChange={e => {
                            setAiSelectedMonth(e.target.value);
                            setAiSelectedWeekRange('ALL_MONTH');
                          }}
                          className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none ${
                            isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        >
                          {availableLearningMonths.map(ym => {
                            const [yy, mm] = ym.split('-').map(Number);
                            const dt = new Date(yy, (mm || 1) - 1, 1);
                            const label = dt.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
                            return (
                              <option key={ym} value={ym}>{label}</option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Primary Option Part B: Choose Tuesday – Sunday Weekly Range */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Weekly Date Range (Tue – Sun)
                        </label>
                        <select
                          value={aiSelectedWeekRange}
                          onChange={e => setAiSelectedWeekRange(e.target.value)}
                          className={`dropdown-arrow py-1.5 pl-3 pr-8 rounded-md border text-xs font-bold outline-none ${
                            isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        >
                          {tueSunWeeksForSelectedMonth.map(w => (
                            <option key={w.key} value={w.key}>{w.label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    /* Secondary Option: Dynamic Flexible Calendar Date Range */
                    <div className="flex flex-wrap items-end gap-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From Date</label>
                        <input
                          type="date"
                          value={aiCustomStart}
                          onChange={e => setAiCustomStart(e.target.value)}
                          className={`py-1.5 px-3 rounded-md border text-xs font-mono font-bold outline-none ${
                            isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To Date</label>
                        <input
                          type="date"
                          value={aiCustomEnd}
                          onChange={e => setAiCustomEnd(e.target.value)}
                          className={`py-1.5 px-3 rounded-md border text-xs font-mono font-bold outline-none ${
                            isDarkMode ? 'bg-[#111827] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Period Summary Pill */}
                <div className={`px-3 py-1.5 rounded border text-xs flex items-center gap-2 ${
                  isDarkMode ? 'bg-[#111827] border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <span className="text-slate-400 font-semibold">Active Period:</span>
                  <strong className={`font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activeLearningPeriod.label}</strong>
                  <span className="text-slate-500">•</span>
                  <span className="font-semibold">
                    {aiLiveCohort.creatives.length} Unique Videos
                  </span>
                </div>
              </div>
            </div>

            {isPlanner && showApiKeyConfig && (
              <div className={`p-3.5 rounded-md border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                isDarkMode ? 'bg-[#111827] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="text-xs space-y-0.5">
                  <p className="font-bold">Creative Learning Engine API Key</p>
                  <p className="text-slate-400">
                    Submit your Gemini API Key manually to generate AI insights and creative reports.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="password"
                    placeholder="Enter Gemini API Key..."
                    value={customGeminiKey}
                    onChange={e => {
                      const val = e.target.value.trim();
                      setCustomGeminiKey(val);
                      try {
                        if (val) {
                          window.localStorage.setItem('omg_gemini_api_key', val);
                        } else {
                          window.localStorage.removeItem('omg_gemini_api_key');
                          window.localStorage.removeItem('pc_aio_gemini_api_key');
                        }
                      } catch {
                        // ignore
                      }
                    }}
                    className={`py-1.5 px-3 rounded-md border text-xs font-mono w-full sm:w-64 outline-none ${
                      isDarkMode ? 'bg-[#090d16] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            )}

            {aiFeedbackMsg && (
              <div className={`px-3.5 py-2.5 rounded-md border text-xs font-semibold flex items-center justify-between ${
                aiFeedbackMsg.startsWith('Error') || aiFeedbackMsg.startsWith('Request failed')
                  ? isDarkMode ? 'bg-rose-950/40 border-rose-500/40 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'
                  : isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}>
                <span>{aiFeedbackMsg}</span>
                <button type="button" onClick={() => setAiFeedbackMsg('')} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">Close</button>
              </div>
            )}

            {/* Condition Benchmarks Strip (Brand + Platform + Ad Type/KPI + Format Standard) */}
            <div className={`px-4 py-2.5 rounded-md border flex flex-wrap items-center justify-between gap-3 text-xs ${
              isDarkMode ? 'bg-[#090d16] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  <strong className="text-slate-400">Condition Standard:</strong>{' '}
                  <code className={`font-mono text-[11px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    {aiBrandFilter} • {aiPlatformFilter} • {aiAdTypeFilter} • {aiFormatFilter}
                    {aiPillarFilter !== 'All Pillars' ? ` • ${aiPillarFilter}` : ''}
                  </code>
                </span>
                <span>
                  <strong className="text-slate-400">Median QR:</strong>{' '}
                  <strong className={`font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{(aiLiveCohort.benchmarks.medianQR * 100).toFixed(2)}%</strong>
                </span>
                <span>
                  <strong className="text-slate-400">75th Pct QR:</strong>{' '}
                  <strong className={`font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{(aiLiveCohort.benchmarks.p75QR * 100).toFixed(2)}%</strong>
                </span>
                <span>
                  <strong className="text-slate-400">Median Spend:</strong>{' '}
                  <strong className={`font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{formatIDR(aiLiveCohort.benchmarks.medianSpend)}</strong>
                </span>
                <span>
                  <strong className="text-slate-400">Min Valid Spend Floor:</strong>{' '}
                  <strong className={`font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{formatIDR(aiLiveCohort.benchmarks.minValidSpend)}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className={`px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                  isDarkMode ? 'bg-[#111827] border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {aiLiveCohort.counts.optimizedTop} Optimized Top
                </span>
                <span className={`px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                  isDarkMode ? 'bg-[#111827] border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  {aiLiveCohort.counts.potentialGem} Potential
                </span>
                <span className={`px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                  isDarkMode ? 'bg-[#111827] border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  {aiLiveCohort.counts.inefficientSpend} High Spend / Low QR
                </span>
              </div>
            </div>

            {/* EXECUTIVE ONE-SLIDER REPORT: DIRECTLY ATTACHED TOP 2-3 CREATIVES (HTML5 VIDEO PLAYER + FULL DATA) */}
            {aiSummaryHighlights.topWinners.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Top {aiSummaryHighlights.topWinners.length} Performing Creatives
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {aiSummaryHighlights.topWinners.map((winner, idx) => (
                    <InlineCreativeShowcaseCard
                      key={winner.id}
                      rank={idx + 1}
                      creative={winner}
                      isDarkMode={isDarkMode}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Cached Markdown One-Slider Report Renderer */}
            {activeCachedLearning?.ai_report_markdown ? (
              <div className={`p-5 lg:p-6 rounded-md border space-y-4 ${
                isDarkMode ? 'bg-[#090d16] border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                {renderStyledMarkdownReport(
                  activeCachedLearning.ai_report_markdown,
                  isDarkMode,
                  urlOrName => {
                    const matched = aggregatedRows.find(
                      r =>
                        (urlOrName && r.creativeLink && r.creativeLink.includes(urlOrName)) ||
                        (aiSummaryHighlights.topOptimized && r.key === aiSummaryHighlights.topOptimized.id)
                    );
                    if (matched) {
                      openCreativeModal(matched);
                      return true;
                    }
                    return false;
                  }
                )}
              </div>
            ) : (
              <div className={`p-8 rounded-md border text-center space-y-2 ${
                isDarkMode ? 'bg-[#090d16] border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <p className="text-sm font-bold text-indigo-400">
                  No Saved Report Yet for {aiBrandFilter} • {aiPlatformFilter} • {aiAdTypeFilter} • {aiFormatFilter} ({activeLearningPeriod.label})
                </p>
                {isPlanner && (
                  <p className="text-xs max-w-lg mx-auto">
                    Click <strong>&ldquo;Generate One-Slider Report&rdquo;</strong> above to generate the hook breakdown, data proof table, and creative next steps for this selection.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pagination Footer */}
        {viewMode !== 'ai_learnings' && (
          <div className={`px-4 py-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3 ${
            isDarkMode ? 'bg-[#090d16] border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span>
                Showing <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{aggregatedRows.length === 0 ? 0 : (page - 1) * pageSize + 1}</strong> to{' '}
                <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{Math.min(page * pageSize, aggregatedRows.length)}</strong> of{' '}
                <strong className={isDarkMode ? 'text-white' : 'text-slate-900'}>{aggregatedRows.length}</strong> items
              </span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className={`py-1 px-2 rounded border text-xs font-bold outline-none ${
                  isDarkMode ? 'bg-[#111827] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors disabled:opacity-40 ${
                  isDarkMode ? 'bg-[#111827] border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Previous
              </button>
              <span className="text-xs font-bold px-2">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors disabled:opacity-40 ${
                  isDarkMode ? 'bg-[#111827] border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* POPUP VIDEO PLAYER & CREATIVE ANALYTICS MODAL (native <dialog closedby="any">) */}
      <dialog
        ref={dialogRef}
        // @ts-ignore - closedby="any" is modern HTML light-dismiss attribute per modern-web-guidance
        closedby="any"
        onClose={closeCreativeModal}
        onClick={e => {
          // Light-dismiss backdrop click fallback for browsers without native closedby="any"
          if (e.target === e.currentTarget) {
            closeCreativeModal();
          }
        }}
        className="backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm bg-transparent p-0 m-auto max-w-5xl w-[95vw] rounded-md shadow-2xl outline-none open:flex"
      >
        {selectedCreative && (() => {
          const activeMedia = selectedCreative.mediaItems[activeAssetIdx] || selectedCreative.mediaItems[0];
          const dailyEntries = Object.entries(selectedCreative.dailyMap).sort((a, b) => b[0].localeCompare(a[0]));

          return (
            <div
              className={`w-full rounded-md border overflow-hidden flex flex-col lg:flex-row max-h-[90vh] ${
                isDarkMode ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              {/* Left Column: Embedded / Direct Video Player */}
              <div className="w-full lg:w-[380px] shrink-0 bg-[#090d16] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
                {/* Asset / Slide Switcher Header */}
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {selectedCreative.mediaItems.length > 1 ? (
                      selectedCreative.mediaItems.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveAssetIdx(idx)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            activeAssetIdx === idx
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          Slide {idx + 1}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live Creative Player
                      </span>
                    )}

                    {activeMedia?.sourceType === 'tiktok' && (
                      <div className="inline-flex p-0.5 rounded bg-slate-900 border border-slate-800 ml-1">
                        <button
                          type="button"
                          onClick={() => {
                            setTiktokSourceIdx(0);
                            setTiktokPlayerMode('direct');
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            tiktokPlayerMode === 'direct' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                          title="HTML5 Direct MP4 Stream (Supports TikTok Shop & Spark Ads)"
                        >
                          HTML5 Player
                        </button>
                        <button
                          type="button"
                          onClick={() => setTiktokPlayerMode('embed')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            tiktokPlayerMode === 'embed' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                          title="Official TikTok Embed Iframe"
                        >
                          Embed
                        </button>
                      </div>
                    )}
                  </div>

                  {activeMedia?.rawUrl && (
                    <a
                      href={activeMedia.rawUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <span>Open Link</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>

                {/* Video Player Container */}
                <div className="flex-1 min-h-[420px] lg:min-h-[520px] relative flex flex-col items-center justify-center bg-[#050811]">
                  {activeMedia?.sourceType === 'tiktok' && isResolvingStream ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                      <div className="w-9 h-9 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-semibold text-slate-300">Loading HTML5 video stream...</p>
                    </div>
                  ) : activeMedia?.sourceType === 'tiktok' && tiktokPlayerMode === 'direct' && tiktokStream?.playUrl ? (
                    (() => {
                      const allSources =
                        tiktokStream.backupPlayUrls && tiktokStream.backupPlayUrls.length > 0
                          ? tiktokStream.backupPlayUrls
                          : [
                              tiktokStream.playUrl,
                              tiktokStream.wmPlayUrl,
                              `/api/tiktok-video?stream=1&url=${encodeURIComponent(activeMedia.rawUrl)}`,
                            ].filter(Boolean) as string[];
                      const currentSrc = allSources[tiktokSourceIdx] || allSources[0];

                      return (
                        <div className="w-full h-full flex flex-col justify-between bg-[#050811]">
                          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
                            <video
                              key={currentSrc}
                              src={currentSrc}
                              poster={tiktokStream.coverUrl}
                              controls
                              autoPlay
                              playsInline
                              // @ts-ignore
                              referrerPolicy="no-referrer"
                              onError={() => {
                                if (tiktokSourceIdx + 1 < allSources.length) {
                                  setTiktokSourceIdx(prev => prev + 1);
                                } else {
                                  setTiktokPlayerMode('embed');
                                }
                              }}
                              className="w-full h-full max-h-[470px] object-contain bg-black"
                            />
                          </div>
                          {(tiktokStream.authorHandle || tiktokStream.title || tiktokStream.isCommerce) && (
                            <div className="px-3.5 py-2.5 bg-[#090d16] border-t border-slate-800/80 text-left space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-white truncate">
                                  @{tiktokStream.authorHandle || tiktokStream.authorName || 'tiktok'}
                                </span>
                                {(tiktokStream.isCommerce || tiktokStream.isAd) && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                    TikTok Shop / Commercial Ad
                                  </span>
                                )}
                              </div>
                              {tiktokStream.title && (
                                <p className="text-[10px] text-slate-400 line-clamp-2 leading-snug">{tiktokStream.title}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : activeMedia?.embedUrl ? (
                    <iframe
                      key={activeMedia.embedUrl}
                      src={activeMedia.embedUrl}
                      className="w-full h-full min-h-[420px] lg:min-h-[520px]"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  ) : activeMedia?.rawUrl ? (
                    <div className="p-6 text-center space-y-4">
                      <div className="w-12 h-12 rounded-md bg-slate-800 text-indigo-400 flex items-center justify-center mx-auto">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white mb-1">External Creative Asset</p>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto break-all line-clamp-2">{activeMedia.rawUrl}</p>
                      </div>
                      <a
                        href={activeMedia.rawUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
                      >
                        Open Asset in New Tab
                      </a>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-500 text-xs font-semibold">
                      No Creative Link Available for this Row
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Creative Details, Full Metrics & Daily Trend */}
              <div className="flex-1 flex flex-col overflow-y-auto p-5 lg:p-6 space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-600 text-white">
                        {selectedCreative.platform}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                        {selectedCreative.brand}
                      </span>
                      {selectedCreative.pillar && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDarkMode ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                          {selectedCreative.pillar}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${isDarkMode ? 'bg-slate-800 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`}>
                        {selectedCreative.adType}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                        Format: {selectedCreative.format || '-'}
                      </span>
                      {selectedCreative.status && selectedCreative.status !== 'BASELINE' && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          selectedCreative.status === 'OPTIMIZED_TOP'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : selectedCreative.status === 'POTENTIAL_GEM'
                              ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}>
                          {selectedCreative.statusLabel}
                        </span>
                      )}
                    </div>
                    <h3 className={`text-base font-bold leading-snug break-words ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {selectedCreative.creativeName}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      <span className="font-semibold text-slate-500">Ad Group:</span> {selectedCreative.adGroup} •{' '}
                      <span className="font-semibold text-slate-500">KPI:</span> {selectedCreative.kpi}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeCreativeModal}
                    aria-label="Close modal"
                    className={`p-2 rounded-md border transition-colors shrink-0 cursor-pointer ${
                      isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Metric Grid */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                    Selected Period Performance
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {ALL_METRIC_DEFS.filter(m => !m.cpasOnly || isCpasSalesAdType(selectedCreative.adType)).map(m => (
                      <div
                        key={m.key}
                        className={`p-3 rounded-md border ${
                          isDarkMode ? 'bg-[#111827] border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{m.label}</p>
                        <div className="flex items-end justify-between gap-2">
                          <span className={`font-mono font-bold text-sm ${
                            m.key === 'roas' && (selectedCreative.cur[m.key] || 0) >= 3
                              ? isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                              : isDarkMode ? 'text-white' : 'text-slate-900'
                          }`}>
                            {m.fmt(selectedCreative.cur[m.key] || 0)}
                          </span>
                          {m.key === 'qualityRate' && selectedCreative.qrVsMedianPct !== undefined && selectedCreative.benchmarks?.medianQR > 0 && (
                            <span className={`text-[10px] font-mono font-bold ${
                              selectedCreative.qrVsMedianPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              ({selectedCreative.qrVsMedianPct >= 0 ? '+' : ''}{Math.round(selectedCreative.qrVsMedianPct)}% vs median)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Delivery Breakdown inside Modal */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Daily Delivery Log ({dailyEntries.length} Active Days in Period)
                  </h4>
                  <div className={`overflow-auto max-h-[220px] rounded-md border ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                    <table className="min-w-full text-left text-xs whitespace-nowrap">
                      <thead>
                        <tr className="bg-[#090d16] text-slate-200">
                          <th className="px-3 py-2 font-bold">Date</th>
                          <th className="px-3 py-2 text-right font-bold">Spend</th>
                          {isCpasSalesAdType(selectedCreative.adType) && (
                            <>
                              <th className="px-3 py-2 text-right font-bold text-amber-300">GMV</th>
                              <th className="px-3 py-2 text-right font-bold text-emerald-400">ROAS</th>
                              <th className="px-3 py-2 text-right font-bold text-indigo-300">Purchase</th>
                              <th className="px-3 py-2 text-right font-bold text-cyan-300">CR</th>
                            </>
                          )}
                          <th className="px-3 py-2 text-right font-bold">Impr</th>
                          <th className="px-3 py-2 text-right font-bold">Clicks</th>
                          <th className="px-3 py-2 text-right font-bold">6s View</th>
                          <th className="px-3 py-2 text-right font-bold">15s View</th>
                          <th className="px-3 py-2 text-right font-bold">CTR</th>
                          <th className="px-3 py-2 text-right font-bold">VTR 6s</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyEntries.length === 0 ? (
                          <tr>
                            <td colSpan={isCpasSalesAdType(selectedCreative.adType) ? 12 : 8} className="px-3 py-4 text-center text-slate-500">
                              No daily rows in current period.
                            </td>
                          </tr>
                        ) : (
                          dailyEntries.map(([dStr, dMetrics], idx) => {
                            const dm = finalizeMetrics(dMetrics, selectedCreative.adType);
                            const isCpasRow = isCpasSalesAdType(selectedCreative.adType);
                            return (
                              <tr
                                key={dStr}
                                className={idx % 2 === 0 ? (isDarkMode ? 'bg-slate-900' : 'bg-white') : (isDarkMode ? 'bg-[#131c2e]' : 'bg-slate-50')}
                              >
                                <td className="px-3 py-2 font-mono font-semibold">{dStr}</td>
                                <td className="px-3 py-2 text-right font-mono font-bold">{formatIDR(dm.spend)}</td>
                                {isCpasRow && (
                                  <>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-amber-400">{formatIDR(dm.gmv)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">{dm.roas.toFixed(2)}x</td>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-indigo-300">{formatNum(dm.purchase)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-cyan-300">{formatPct(dm.cr)}</td>
                                  </>
                                )}
                                <td className="px-3 py-2 text-right font-mono">{formatNum(dm.imp)}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatNum(dm.clicks)}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatNum(dm.v6)}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatNum(dm.v15)}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatPct(dm.ctr)}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatPct(dm.vtr6)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </dialog>

      {/* PLAYBOOK MODAL: User Guide, Setup, API Key Config, Metrics, Calculations & Insight Basis */}
      {showPlaybookModal && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setShowPlaybookModal(false);
          }}
          className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-3 sm:pt-5 px-4 pb-4 overflow-y-auto"
        >
          <div
            className={`w-full max-w-4xl max-h-[90vh] rounded-md border shadow-2xl overflow-hidden flex flex-col ${
              isDarkMode ? 'bg-[#0f172a] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${
              isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-widest block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  User Guide &amp; Methodology
                </span>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Creative Learning Engine — Playbook
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPlaybookModal(false)}
                className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors cursor-pointer ${
                  isDarkMode
                    ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Close Playbook
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs leading-relaxed">
              {/* Section 1: Quick Start & What to Setup / Choose */}
              <div className={`p-4 rounded-md border space-y-3 ${
                isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  1. How to Use &amp; What to Choose
                </h4>
                <ol className={`list-decimal pl-5 space-y-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <li>
                    <strong>Switch to Creative Learning Engine:</strong> Click the <strong>&ldquo;Creative Learning Engine&rdquo;</strong> button on the top-right view switcher.
                  </li>
                  <li>
                    <strong>Select Your Campaign Filters:</strong> Choose your target <strong>Brand</strong>, <strong>Platform</strong> (TikTok / Meta), <strong>Ad Type / KPI</strong>, <strong>Format Standard</strong>, and <strong>Pillar</strong>. The filters automatically adapt to your selection so you only see options available for that Brand and period.
                  </li>
                  <li>
                    <strong>Choose Your Evaluation Period:</strong>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li>
                        <strong>Option 1 — Month &amp; Weekly (Tue–Sun):</strong> Select a Month first, then pick a <strong>Tuesday – Sunday</strong> weekly cycle (e.g., <code>Week 2: 6 - 11 Oct (Tue–Sun)</code>) or view the full month.
                      </li>
                      <li>
                        <strong>Option 2 — Flexible Calendar Range:</strong> Pick any custom <code>From Date</code> and <code>To Date</code> on the calendar.
                      </li>
                    </ul>
                  </li>
                  <li>
                    <strong>Watch &amp; Review the Top 3 Performing Creatives:</strong> The Top 3 winning videos for your selected condition appear at the top of the report. You can play the videos directly on the page and compare their metrics against the benchmark standard.
                  </li>
                  <li>
                    <strong>Generate or Refresh the One-Slider Report:</strong> If a report has already been generated for your selected filters and period, it will appear automatically below the videos. To generate a new report (or update an existing one when new winning ads appear), click <strong>&ldquo;Generate One-Slider Report&rdquo;</strong> or <strong>&ldquo;Refresh Report&rdquo;</strong>.
                  </li>
                </ol>
              </div>

              {/* Section 2: Personal API Key Configuration */}
              <div className={`p-4 rounded-md border space-y-2.5 ${
                isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  2. How to Setup a Personal API Key (Optional)
                </h4>
                <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                  A default key is already active so you can generate reports immediately. If you prefer to use your own personal API key:
                </p>
                <ul className={`list-disc pl-5 space-y-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <li>
                    Click the <strong>&ldquo;Key Config&rdquo;</strong> button on the top-right of the filter bar.
                  </li>
                  <li>
                    Paste your personal API key into the input box. It will be remembered automatically on your browser for future reports.
                  </li>
                  <li>
                    To switch back to the default key at any time, simply clear the input box.
                  </li>
                </ul>
              </div>

              {/* Section 3: Core Metrics & Formulas */}
              <div className={`p-4 rounded-md border space-y-3 ${
                isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  3. Metrics &amp; Calculation Guide
                </h4>
                <div className="overflow-x-auto rounded border border-slate-800">
                  <table className="min-w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#050811] text-slate-200">
                        <th className="px-3 py-2 font-bold border-b border-slate-800">Metric</th>
                        <th className="px-3 py-2 font-bold border-b border-slate-800">Calculation</th>
                        <th className="px-3 py-2 font-bold border-b border-slate-800">What It Tells You</th>
                      </tr>
                    </thead>
                    <tbody className={isDarkMode ? 'divide-y divide-slate-800 text-slate-300' : 'divide-y divide-slate-200 text-slate-700'}>
                      <tr>
                        <td className="px-3 py-2 font-bold">Raw Quality Rate (QR)</td>
                        <td className="px-3 py-2 font-mono">(Clicks + 6s Views + 15s Views) / Impressions</td>
                        <td className="px-3 py-2">Overall engagement power combining hook views, hold views, and clicks per impression.</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold align-top">
                          <div className="flex flex-col items-start gap-1.5">
                            <span>Spend Credibility</span>
                            <button
                              type="button"
                              onClick={() => setShowSpendCredibilityDetails(v => !v)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold transition-colors cursor-pointer ${
                                showSpendCredibilityDetails
                                  ? isDarkMode
                                    ? 'bg-slate-200 border-slate-200 text-slate-900'
                                    : 'bg-slate-900 border-slate-900 text-white'
                                  : isDarkMode
                                    ? 'bg-[#111827] border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <span>Details</span>
                              <svg
                                className={`w-3 h-3 transition-transform duration-200 ${showSpendCredibilityDetails ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono align-top">min(1.15, sqrt(Spend / Condition Median Spend))</td>
                        <td className="px-3 py-2 align-top">Validates whether a creative&apos;s quality is proven with meaningful budget rather than tiny test spend.</td>
                      </tr>
                      {showSpendCredibilityDetails && (
                        <tr>
                          <td colSpan={3} className={`p-4 ${isDarkMode ? 'bg-[#0b1120]' : 'bg-white'}`}>
                            <div className="space-y-4">
                              {/* Intro + Mathematical Formula Box */}
                              <div className="space-y-2">
                                <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                                  <strong>Spend Credibility</strong> acts as a statistical confidence weight that prevents low-spend ads with lucky early metrics (small sample sizes) from outranking proven, high-spend winners.
                                </p>
                                <p className={`text-[11px] font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                  The formula is defined as:
                                </p>
                                <div className={`my-2 py-4 px-5 rounded-md border flex items-center justify-center overflow-x-auto ${
                                  isDarkMode ? 'bg-[#050811] border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'
                                }`}>
                                  <div className="inline-flex items-center gap-2 font-serif text-sm sm:text-base tracking-wide whitespace-nowrap">
                                    <span className="font-semibold">Spend Credibility</span>
                                    <span>=</span>
                                    <span className="font-semibold">min</span>
                                    <span className="text-2xl font-light leading-none">(</span>
                                    <span className="font-mono font-semibold">1.15</span>
                                    <span>,</span>
                                    <div className="inline-flex items-center">
                                      <span className="text-xl font-light mr-0.5 select-none">&radic;</span>
                                      <div className="inline-flex flex-col items-center border-t border-current px-2 pt-0.5 text-xs sm:text-sm font-sans">
                                        <span className="font-semibold pb-0.5">Spend</span>
                                        <span className={`w-full border-t ${isDarkMode ? 'border-slate-400' : 'border-slate-700'}`} />
                                        <span className="font-semibold pt-0.5">Condition Median Spend</span>
                                      </div>
                                    </div>
                                    <span className="text-2xl font-light leading-none">)</span>
                                  </div>
                                </div>
                              </div>

                              {/* 1. Breakdown of the Components */}
                              <div className="space-y-2">
                                <h5 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                  1. Breakdown of the Components
                                </h5>
                                <ul className={`list-disc pl-5 space-y-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                  <li>
                                    <code className="font-mono font-bold">Spend / Condition Median Spend</code> <strong>(Relative Volume):</strong> Compares an individual creative&apos;s spend against the median spend of its peer group (&ldquo;Condition&rdquo;&mdash;same Brand, Ad Type/KPI, and Format). Using the <strong>median</strong> rather than the average prevents a single hero ad with massive budget from skewing the baseline upward.
                                  </li>
                                  <li>
                                    <code className="font-mono font-bold">&radic;...</code> <strong>(Square Root Dampening):</strong> Applying a square root creates a diminishing-returns curve. In statistics, sample confidence scales with the square root of the sample size (<code className="font-mono">1/&radic;n</code>). Practically, this means an ad with 25% of the median spend isn&apos;t penalized by 75%; instead, <code className="font-mono">&radic;0.25 = 0.50</code>, giving it a <strong>50% credibility weight</strong>.
                                  </li>
                                  <li>
                                    <code className="font-mono font-bold">min(1.15, ...)</code> <strong>(The Ceiling Cap):</strong> Caps the maximum multiplier at <strong>1.15</strong> (a 15% bonus). Once a creative reaches roughly <strong>1.32x</strong> the median spend (<code className="font-mono">&radic;1.3225 = 1.15</code>), its performance is considered fully validated at scale. Any additional budget beyond that point won&apos;t keep inflating its score, ensuring the metric measures <em>creative quality</em> rather than just <em>budget allocation</em>.
                                  </li>
                                </ul>
                              </div>

                              {/* 2. Practical Example Scenario from a Median Spend */}
                              <div className="space-y-2">
                                <h5 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                  2. Example Scenario: How It Works Across Spending Levels
                                </h5>
                                <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                                  Suppose for your selected condition (e.g., <em>Brand A &bull; TikTok &bull; Video Format</em>), the <strong>Condition Median Spend is Rp 1,000,000</strong>. Here is how Spend Credibility evaluates 5 creatives at different spending levels:
                                </p>
                                <div className="overflow-x-auto rounded border border-slate-800">
                                  <table className="min-w-full text-left text-[11px] border-collapse">
                                    <thead>
                                      <tr className="bg-[#050811] text-slate-200">
                                        <th className="px-2.5 py-1.5 font-bold border-b border-slate-800">Spending Level</th>
                                        <th className="px-2.5 py-1.5 font-bold border-b border-slate-800">Creative Spend</th>
                                        <th className="px-2.5 py-1.5 font-bold border-b border-slate-800">Formula Step</th>
                                        <th className="px-2.5 py-1.5 font-bold border-b border-slate-800">Credibility</th>
                                        <th className="px-2.5 py-1.5 font-bold border-b border-slate-800">Impact on Ranking (Raw QR &rarr; Weighted QR)</th>
                                      </tr>
                                    </thead>
                                    <tbody className={isDarkMode ? 'divide-y divide-slate-800 text-slate-300' : 'divide-y divide-slate-200 text-slate-700'}>
                                      <tr>
                                        <td className="px-2.5 py-1.5 font-semibold">Tiny Test (0.09x Med)</td>
                                        <td className="px-2.5 py-1.5 font-mono">Rp 90,000</td>
                                        <td className="px-2.5 py-1.5 font-mono">min(1.15, &radic;0.09)</td>
                                        <td className="px-2.5 py-1.5 font-mono font-bold">0.30 (30%)</td>
                                        <td className="px-2.5 py-1.5">A fluke <span className="font-mono">25.0%</span> Raw QR becomes <strong className="font-mono">7.5%</strong> (prevented from false #1 rank).</td>
                                      </tr>
                                      <tr>
                                        <td className="px-2.5 py-1.5 font-semibold">Quarter Med (0.25x Med)</td>
                                        <td className="px-2.5 py-1.5 font-mono">Rp 250,000</td>
                                        <td className="px-2.5 py-1.5 font-mono">min(1.15, &radic;0.25)</td>
                                        <td className="px-2.5 py-1.5 font-mono font-bold">0.50 (50%)</td>
                                        <td className="px-2.5 py-1.5">A <span className="font-mono">20.0%</span> Raw QR becomes <strong className="font-mono">10.0%</strong> (dampened, not overly punished).</td>
                                      </tr>
                                      <tr>
                                        <td className="px-2.5 py-1.5 font-semibold">Median Spend (1.00x Med)</td>
                                        <td className="px-2.5 py-1.5 font-mono">Rp 1,000,000</td>
                                        <td className="px-2.5 py-1.5 font-mono">min(1.15, &radic;1.00)</td>
                                        <td className="px-2.5 py-1.5 font-mono font-bold">1.00 (100%)</td>
                                        <td className="px-2.5 py-1.5">A <span className="font-mono">16.0%</span> Raw QR keeps its full <strong className="font-mono">16.0%</strong> score (beats low-spend flukes).</td>
                                      </tr>
                                      <tr>
                                        <td className="px-2.5 py-1.5 font-semibold">Validated Scale (1.32x Med)</td>
                                        <td className="px-2.5 py-1.5 font-mono">Rp 1,322,500</td>
                                        <td className="px-2.5 py-1.5 font-mono">min(1.15, &radic;1.3225)</td>
                                        <td className="px-2.5 py-1.5 font-mono font-bold">1.15 (115% Cap)</td>
                                        <td className="px-2.5 py-1.5">A <span className="font-mono">16.0%</span> Raw QR earns the max scale bonus &rarr; <strong className="font-mono">18.4%</strong>.</td>
                                      </tr>
                                      <tr>
                                        <td className="px-2.5 py-1.5 font-semibold">Hero Budget (5.00x Med)</td>
                                        <td className="px-2.5 py-1.5 font-mono">Rp 5,000,000</td>
                                        <td className="px-2.5 py-1.5 font-mono">min(1.15, &radic;5.00 = 2.24)</td>
                                        <td className="px-2.5 py-1.5 font-mono font-bold">1.15 (115% Cap)</td>
                                        <td className="px-2.5 py-1.5">Capped at <strong className="font-mono">1.15x</strong> so huge budget alone cannot inflate a weak creative.</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className={`px-3 py-2 font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Spend-Weighted QR</td>
                        <td className="px-3 py-2 font-mono">Raw Quality Rate × Spend Credibility</td>
                        <td className="px-3 py-2">Primary score used to rank the Top Performing Creatives (balances quality with spend scale).</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold">6s VTR (Hook Rate)</td>
                        <td className="px-3 py-2 font-mono">(6s Views / Impressions) × 100%</td>
                        <td className="px-3 py-2">Scroll-stopping power in the first 3–6 seconds of the video.</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold">15s VTR (Hold Rate)</td>
                        <td className="px-3 py-2 font-mono">(15s Views / Impressions) × 100%</td>
                        <td className="px-3 py-2">How effectively the main storyline keeps viewers watching through 15 seconds.</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold">Hold Ratio (15s / 6s)</td>
                        <td className="px-3 py-2 font-mono">(15s Views / 6s Views) × 100%</td>
                        <td className="px-3 py-2">Percentage of hooked viewers (at 6s) who stayed until 15s.</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold">CTR &amp; CPM</td>
                        <td className="px-3 py-2 font-mono">(Clicks / Impr) × 100% | (Spend / Impr) × 1,000</td>
                        <td className="px-3 py-2">Call-to-action click response and cost efficiency per 1,000 impressions.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 4: Condition Standards & Classification Tiers */}
              <div className={`p-4 rounded-md border space-y-3 ${
                isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  4. Benchmark Standards &amp; Creative Categorization
                </h4>
                <ul className={`list-disc pl-5 space-y-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <li>
                    <strong>Fair Apples-to-Apples Standard (<code>Brand + Ad Type/KPI + Format</code>):</strong> Because different brands, objectives, and formats naturally perform differently, each creative is judged against the <strong>Median (50th percentile)</strong> and <strong>Top 25% (75th percentile)</strong> of its own specific Brand, Ad Type/KPI, and Format group.
                  </li>
                  <li>
                    <strong>Minimum Valid Spend Floor:</strong> A creative must reach at least <code>25th Percentile Spend</code> (or <code>30% of Median Spend</code>) before its quality score is considered valid. Ads with very low spend are marked as <em>Low Spend (Unvalidated)</em> so small-budget flukes do not outrank proven ads.
                  </li>
                </ul>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                  <div className={`p-3 rounded border ${isDarkMode ? 'bg-emerald-950/25 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="font-bold text-emerald-400">Optimized Top Creative</div>
                    <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      High quality rate proven at strong spend scale. These are your primary winning ads to replicate and learn from.
                    </p>
                  </div>
                  <div className={`p-3 rounded border ${isDarkMode ? 'bg-violet-950/25 border-violet-500/30' : 'bg-violet-50 border-violet-200'}`}>
                    <div className="font-bold text-violet-400">Potential Creative</div>
                    <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Passes the minimum valid spend threshold with strong engagement metrics, or carries high spend with solid weighted quality.
                    </p>
                  </div>
                  <div className={`p-3 rounded border ${isDarkMode ? 'bg-rose-950/25 border-rose-500/30' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="font-bold text-rose-400">High Spend, Low Quality</div>
                    <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Spending above the median benchmark but delivering below-standard engagement (&lt;85% of median QR). Needs a new opening hook or angle pivot.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 5: Insight Basis (What Is Inside the One-Slider Report) */}
              <div className={`p-4 rounded-md border space-y-2.5 ${
                isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  5. Insight Basis (How the One-Slider Report Evaluates Your Ads)
                </h4>
                <ul className={`list-disc pl-5 space-y-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <li>
                    <strong>Opening Hook Breakdown (0–3 Seconds):</strong> Evaluates both the <strong>Verbatim Spoken/Text Hook</strong> (exact words spoken or shown on screen in the first 3 seconds) and the <strong>Visual Hook</strong> (what happens visually to stop the scroll), then classifies the <strong>Main Communication Approach</strong> (e.g., <em>User Pain Point/Problem, Ingredient/Product Education, Social Proof/Review, Relatable POV, Hard Promo</em>).
                  </li>
                  <li>
                    <strong>The Data Proof (Why It Won):</strong> Compares each winning creative&apos;s Spend, CPM, 6s VTR (Hook), 15s VTR (Hold), Hold Ratio (15s/6s), and CTR directly against the Campaign/Other Average to explain how the hook impacted 6s VTR/CPM and how the storyline drove 15s retention and clicks.
                  </li>
                  <li>
                    <strong>Qualitative Breakdown (Why This Approach Works):</strong> Explains the <em>Hook Psychology</em> (why the opening line stopped the scroll) and the <em>Message Flow (3s–15s)</em> (how the video transitioned from the hook into the product solution without losing viewers).
                  </li>
                  <li>
                    <strong>Creative Next Steps (Iteration Roadmap):</strong> Focuses strictly on creative and messaging actions—providing 2 new verbatim hook scripts using the winning communication approach, 1 simple visual variation to recut the opening 3 seconds, and 1 angle pivot to re-script underperforming ads.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Strips decorative emojis from headings/text to keep the Executive One-Slider Report clean.
 */
function stripDecorativeIcons(text: string): string {
  return text.replace(/[🏆🎬📊🧠🚀✅⚠️✨🟢🟡⚙️]/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Lightweight, zero-dependency Markdown renderer for the Executive One-Slider Report.
 * Handles headings (###), blockquotes (>), Markdown tables (| ... |), bullet lists, links, and inline bold/italic/code.
 */
function renderInlineMarkdown(
  rawText: string,
  isDarkMode: boolean,
  onOpenPreview?: (urlOrName: string) => boolean
): React.ReactNode {
  const text = stripDecorativeIcons(rawText);
  const tokenRegex = /(\*\*\[[^\]]+\]\([^)]+\)\*\*|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Bold Link: **[Label](url)** or Link: [Label](url)
    const linkMatch = part.match(/^(?:\*\*)?\[([^\]]+)\]\(([^)]+)\)(?:\*\*)?$/);
    if (linkMatch) {
      const label = stripDecorativeIcons(linkMatch[1]);
      const href = linkMatch[2].trim();
      return (
        <button
          key={idx}
          type="button"
          onClick={() => {
            if (onOpenPreview && onOpenPreview(href !== '#' ? href : label)) {
              return;
            }
            if (href && href !== '#') {
              window.open(href, '_blank', 'noopener,noreferrer');
            }
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer"
        >
          <span>{label}</span>
        </button>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className={isDarkMode ? 'text-indigo-200 italic' : 'text-indigo-900 italic'}>
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
            isDarkMode ? 'bg-slate-800 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderStyledMarkdownReport(
  markdown: string,
  isDarkMode: boolean,
  onOpenPreview?: (urlOrName: string) => boolean
): React.ReactNode {
  const lines = markdown.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^---+$/.test(trimmed)) {
      elements.push(
        <hr key={`hr-${i}`} className={`my-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`} />
      );
      i++;
      continue;
    }

    // Blockquote block (> ...) used for Top Performing Creative summary box in One-Slider Report
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, '').trim());
        i++;
      }
      elements.push(
        <div
          key={`quote-${i}`}
          className={`p-4 rounded-md border-l-4 space-y-2 ${
            isDarkMode
              ? 'bg-[#111827] border-l-indigo-500 border border-slate-800 text-slate-200'
              : 'bg-indigo-50/50 border-l-indigo-600 border border-indigo-100 text-slate-800'
          }`}
        >
          {quoteLines.map((qLine, qIdx) => {
            const cleanQ = qLine.replace(/^(\*|-)\s+/, '');
            const isBullet = /^(\*|-)\s+/.test(qLine);
            return (
              <div key={qIdx} className={`text-xs sm:text-[13px] leading-relaxed ${isBullet ? 'pl-3 border-l border-slate-700/60' : ''}`}>
                {renderInlineMarkdown(cleanQ, isDarkMode, onOpenPreview)}
              </div>
            );
          })}
        </div>
      );
      continue;
    }

    // Markdown Table block
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parseTableCells = (rowStr: string) =>
          rowStr
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(c => c.trim());

        const headers = parseTableCells(tableLines[0]);
        const bodyRows = tableLines
          .slice(1)
          .filter(line => !/^\|?[\s\-:|]+\|?$/.test(line))
          .map(parseTableCells);

        elements.push(
          <div
            key={`table-${i}`}
            className={`my-3 overflow-x-auto rounded-md border ${
              isDarkMode ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <table className="min-w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#090d16] text-white">
                  {headers.map((h, hIdx) => (
                    <th key={hIdx} className="px-3.5 py-2.5 font-bold border-b border-slate-800">
                      {renderInlineMarkdown(h, true, onOpenPreview)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((rCells, rIdx) => (
                  <tr
                    key={rIdx}
                    className={`border-b last:border-0 ${
                      rIdx % 2 === 0
                        ? isDarkMode
                          ? 'bg-[#0f172a] border-slate-800/80'
                          : 'bg-white border-slate-200'
                        : isDarkMode
                          ? 'bg-[#131c2e] border-slate-800/80'
                          : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    {rCells.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3.5 py-2.5 align-top leading-relaxed font-mono first:font-sans">
                        {renderInlineMarkdown(cell, isDarkMode, onOpenPreview)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3
          key={`h3-${i}`}
          className={`text-sm sm:text-base font-bold pt-3 pb-1 border-b ${
            isDarkMode ? 'text-indigo-300 border-slate-800' : 'text-indigo-700 border-slate-200'
          }`}
        >
          {renderInlineMarkdown(trimmed.slice(4), isDarkMode, onOpenPreview)}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2
          key={`h2-${i}`}
          className={`text-base sm:text-lg font-bold pt-3 pb-1 ${
            isDarkMode ? 'text-white' : 'text-slate-900'
          }`}
        >
          {renderInlineMarkdown(trimmed.slice(3), isDarkMode, onOpenPreview)}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h4
          key={`h4-${i}`}
          className={`text-xs sm:text-sm font-bold pt-2 ${
            isDarkMode ? 'text-emerald-300' : 'text-emerald-700'
          }`}
        >
          {renderInlineMarkdown(trimmed.slice(5), isDarkMode, onOpenPreview)}
        </h4>
      );
      i++;
      continue;
    }

    // Unordered or Ordered Lists (including nested sub-bullets)
    if (/^(\*|-|\d+\.)\s+/.test(trimmed)) {
      const listItems: { text: string; indent: boolean }[] = [];
      while (i < lines.length && /^(\s*)(\*|-|\d+\.)\s+/.test(lines[i])) {
        const leadingSpaces = (lines[i].match(/^(\s*)/)?.[1] || '').length;
        listItems.push({
          text: lines[i].trim().replace(/^(\*|-|\d+\.)\s+/, ''),
          indent: leadingSpaces >= 2,
        });
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1.5 pl-4 list-disc text-xs sm:text-[13px] leading-relaxed">
          {listItems.map((item, idx) => (
            <li
              key={idx}
              className={`${item.indent ? 'ml-4 list-[circle]' : ''} ${
                isDarkMode ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              {renderInlineMarkdown(item.text, isDarkMode, onOpenPreview)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Standard Paragraph
    elements.push(
      <p key={`p-${i}`} className={`text-xs sm:text-[13px] leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
        {renderInlineMarkdown(trimmed, isDarkMode, onOpenPreview)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

/**
 * Directly Embedded Video + Full Performance Data Card for the One-Slider Report.
 * Automatically resolves TikTok direct streams or renders Instagram/Drive embeds inline
 * alongside full creative performance and Condition Standard (Brand + Ad Type + Format) benchmarks.
 */
function InlineCreativeShowcaseCard({
  rank,
  creative,
  isDarkMode,
}: {
  rank: number;
  creative: ClassifiedCreativeRow;
  isDarkMode: boolean;
}) {
  const mediaItems = useMemo(() => parseCreativeLinks(creative.creativeLink), [creative.creativeLink]);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [playMode, setPlayMode] = useState<'direct' | 'embed'>('direct');
  const [sourceIdx, setSourceIdx] = useState(0);
  const [streamData, setStreamData] = useState<{
    videoUrl: string | null;
    wmPlayUrl?: string | null;
    backupPlayUrls?: string[];
    proxyPlayUrl?: string | null;
    coverUrl?: string | null;
    title?: string | null;
    author?: string | null;
  } | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);

  const activeItem = mediaItems[activeMediaIdx] || mediaItems[0] || null;

  const resolveTikTokStream = (rawUrl: string, forceRefresh = false) => {
    setStreamLoading(true);
    setSourceIdx(0);
    setPlayMode('direct');
    const proxyEndpoint = `/api/tiktok-video?stream=1&url=${encodeURIComponent(rawUrl)}`;
    fetch(`/api/tiktok-video?url=${encodeURIComponent(rawUrl)}${forceRefresh ? '&t=' + Date.now() : ''}`)
      .then(res => res.json())
      .then(data => {
        const resolvedPlayUrl = data?.video?.playUrl || data?.video?.wmPlayUrl || data?.videoUrl || null;
        const backupUrls: string[] = Array.isArray(data?.video?.backupPlayUrls)
          ? data.video.backupPlayUrls
          : [resolvedPlayUrl, data?.video?.wmPlayUrl, data?.proxyPlayUrl || proxyEndpoint].filter(Boolean);
        if (!backupUrls.includes(proxyEndpoint)) {
          backupUrls.push(proxyEndpoint);
        }

        const rawCover = data?.video?.coverUrl || data?.coverUrl || null;
        const proxiedCover = rawCover ? toProxiedThumbUrl(rawCover) : null;
        if (proxiedCover) {
          clientThumbCache.set(rawUrl, proxiedCover);
        }

        setStreamData({
          videoUrl: resolvedPlayUrl || proxyEndpoint,
          wmPlayUrl: data?.video?.wmPlayUrl || null,
          backupPlayUrls: backupUrls,
          proxyPlayUrl: data?.proxyPlayUrl || proxyEndpoint,
          coverUrl: proxiedCover,
          title: data?.video?.title || data?.title || null,
          author: data?.video?.authorHandle || data?.video?.authorName || data?.author || null,
        });
        setPlayMode('direct');
      })
      .catch(() => {
        setStreamData({
          videoUrl: proxyEndpoint,
          backupPlayUrls: [proxyEndpoint],
          proxyPlayUrl: proxyEndpoint,
        });
        setPlayMode('direct');
      })
      .finally(() => {
        setStreamLoading(false);
      });
  };

  useEffect(() => {
    if (!activeItem || activeItem.sourceType !== 'tiktok') {
      setStreamData(null);
      setStreamLoading(false);
      setSourceIdx(0);
      return;
    }

    resolveTikTokStream(activeItem.rawUrl);
  }, [activeItem?.rawUrl, activeItem?.sourceType]);

  const tiktokStreamCandidates = useMemo(() => {
    if (!activeItem || activeItem.sourceType !== 'tiktok') return [];
    const proxyUrl = `/api/tiktok-video?stream=1&url=${encodeURIComponent(activeItem.rawUrl)}`;
    const candidates = [
      ...(streamData?.backupPlayUrls || []),
      streamData?.videoUrl,
      streamData?.wmPlayUrl,
      streamData?.proxyPlayUrl,
      proxyUrl,
    ].filter((u): u is string => Boolean(u && u.trim()));
    return Array.from(new Set(candidates));
  }, [activeItem, streamData]);

  const activeTikTokVideoSrc = tiktokStreamCandidates[sourceIdx] || streamData?.videoUrl || null;

  const statusMeta = CLASSIFICATION_META[creative.status];
  const m = creative.metrics;
  const qrDelta =
    creative.benchmarks.medianQR > 0
      ? ((m.qualityRate - creative.benchmarks.medianQR) / creative.benchmarks.medianQR) * 100
      : 0;
  const spendDelta =
    creative.benchmarks.medianSpend > 0
      ? ((m.spend - creative.benchmarks.medianSpend) / creative.benchmarks.medianSpend) * 100
      : 0;

  // Check if a non-TikTok asset is a direct .mp4 file
  const isDirectMp4Link = Boolean(
    activeItem &&
      activeItem.sourceType !== 'tiktok' &&
      /\.mp4(\?|$)/i.test(activeItem.rawUrl)
  );

  return (
    <div
      className={`rounded-md border overflow-hidden flex flex-col lg:flex-row ${
        isDarkMode ? 'bg-[#0b1120] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      {/* Left Column: Inline HTML5 Video Player */}
      <div className="w-full lg:w-[270px] xl:w-[295px] shrink-0 bg-[#050811] flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        {/* Player Top Controls */}
        <div className="px-3 py-2 bg-[#090d16] border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
              #{rank} Top Creative
            </span>
            {activeItem && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                {activeItem.sourceType}
              </span>
            )}
          </div>
          {activeItem?.sourceType === 'tiktok' && (
            <div className="flex items-center rounded p-0.5 bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSourceIdx(0);
                  setPlayMode('direct');
                }}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer ${
                  playMode === 'direct' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                HTML5 Player
              </button>
              <button
                type="button"
                onClick={() => setPlayMode('embed')}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer ${
                  playMode === 'embed' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Embed
              </button>
            </div>
          )}
        </div>

        {/* Video Viewport */}
        <div className="relative w-full h-[390px] flex items-center justify-center bg-black overflow-hidden">
          {!activeItem ? (
            <div className="text-center p-4 text-slate-500 text-xs">
              No video link attached for this creative.
            </div>
          ) : activeItem.sourceType === 'tiktok' && streamLoading ? (
            <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
              <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <span>Loading HTML5 video player...</span>
            </div>
          ) : activeItem.sourceType === 'tiktok' && playMode === 'direct' && activeTikTokVideoSrc ? (
            <video
              key={activeTikTokVideoSrc}
              src={activeTikTokVideoSrc}
              poster={streamData?.coverUrl || undefined}
              controls
              playsInline
              preload="metadata"
              {...({ referrerPolicy: "no-referrer" } as any)}
              onError={() => {
                if (sourceIdx + 1 < tiktokStreamCandidates.length) {
                  setSourceIdx(prev => prev + 1);
                } else {
                  setPlayMode('embed');
                }
              }}
              className="w-full h-full object-contain bg-black"
            />
          ) : isDirectMp4Link ? (
            <video
              key={activeItem.rawUrl}
              src={activeItem.rawUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full object-contain bg-black"
            />
          ) : activeItem.embedUrl ? (
            <div className="relative w-full h-full flex flex-col">
              {activeItem.sourceType === 'tiktok' && (
                <div className="px-2.5 py-1 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Fallback Embed Mode</span>
                  <button
                    type="button"
                    onClick={() => resolveTikTokStream(activeItem.rawUrl, true)}
                    className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold hover:bg-indigo-500 cursor-pointer"
                  >
                    Retry HTML5 Stream
                  </button>
                </div>
              )}
              <iframe
                key={activeItem.embedUrl}
                src={activeItem.embedUrl}
                className="w-full flex-1 border-0 bg-black"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                title={creative.creativeName}
              />
            </div>
          ) : (
            <div className="text-center p-4 space-y-2">
              <p className="text-xs text-slate-400">Preview requires external player</p>
              <a
                href={activeItem.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"
              >
                Open Creative Link
              </a>
            </div>
          )}
        </div>

        {/* Bottom Media Bar (Carousel Switcher + External Link) */}
        <div className="px-3 py-2 bg-[#090d16] border-t border-slate-800 flex items-center justify-between gap-2">
          {mediaItems.length > 1 ? (
            <div className="flex items-center gap-1 overflow-x-auto">
              {mediaItems.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveMediaIdx(idx)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    activeMediaIdx === idx
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  #{idx + 1}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 truncate">
              {streamData?.author ? `@${streamData.author}` : creative.platform || 'Creative Video'}
            </span>
          )}
          {activeItem?.rawUrl && (
            <a
              href={activeItem.rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 shrink-0"
            >
              Open Source ↗
            </a>
          )}
        </div>
      </div>

      {/* Right Column: Full Creative Metadata, Condition Standard & Performance Breakdown */}
      <div className="flex-1 p-4 flex flex-col justify-between gap-3">
        <div className="space-y-2.5">
          {/* Header Badges */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${
                  isDarkMode ? statusMeta.darkBadgeClass : statusMeta.lightBadgeClass
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotColor}`} />
                {creative.statusLabel}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  isDarkMode ? 'bg-slate-800/90 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {creative.brand}
              </span>
              {creative.platform && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    isDarkMode ? 'bg-slate-800/90 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {creative.platform}
                </span>
              )}
              {(creative.adType || creative.kpi) && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    isDarkMode ? 'bg-slate-800/90 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {creative.adType || creative.kpi}
                </span>
              )}
              {creative.format && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    isDarkMode ? 'bg-slate-800/90 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Format: {creative.format}
                </span>
              )}
              {creative.pillar && (
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    isDarkMode ? 'bg-slate-800/90 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Pillar: {creative.pillar}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Spend Credibility: {((m.spendCredibility || 0) * 100).toFixed(0)}%
            </span>
          </div>

          {/* Creative Name & Ad Group */}
          <div>
            <h5 className={`text-sm font-bold leading-snug break-words ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {creative.creativeName}
            </h5>
            {creative.adGroup && (
              <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Ad Group: <span className="font-medium">{creative.adGroup}</span>
              </p>
            )}
          </div>

          {/* Condition Standard Bar (Brand + Ad Type/KPI + Format Median Standard) */}
          <div
            className={`p-2.5 rounded border text-[11px] flex flex-wrap items-center justify-between gap-2 ${
              isDarkMode ? 'bg-[#111827] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Condition Standard ({creative.brand} • {creative.adType || creative.kpi || 'All'} • {creative.format || 'All Formats'})
              </span>
              <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Cohort Size: <strong>{creative.benchmarks.cohortSize}</strong> creatives | Min Valid Spend:{' '}
                <strong className="font-mono">{formatIDR(creative.benchmarks.minValidSpend)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <div>
                <span className="text-[10px] text-slate-400 block">Median Spend</span>
                <strong>{formatIDR(creative.benchmarks.medianSpend)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Median QR</span>
                <strong>{formatPct(creative.benchmarks.medianQR)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Top 25% QR</span>
                <strong>{formatPct(creative.benchmarks.p75QR)}</strong>
              </div>
            </div>
          </div>

          {/* Primary Metrics Grid (matching popup modal) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className={`p-2 rounded border ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[9px] uppercase font-bold text-slate-400">Spend (vs Med)</div>
              <div className={`text-xs font-bold font-mono mt-0.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatIDR(m.spend)}
              </div>
              <div className={`text-[10px] font-mono ${spendDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {spendDelta >= 0 ? '+' : ''}
                {spendDelta.toFixed(0)}% vs med
              </div>
            </div>

            <div className={`p-2 rounded border ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[9px] uppercase font-bold text-slate-400">Spend-Weighted QR</div>
              <div className="text-xs font-bold font-mono mt-0.5 text-indigo-400">
                {formatPct(m.weightedQualityRate)}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Raw QR: {formatPct(m.qualityRate)} ({qrDelta >= 0 ? '+' : ''}{qrDelta.toFixed(0)}%)
              </div>
            </div>

            <div className={`p-2 rounded border ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[9px] uppercase font-bold text-slate-400">6s VTR (Hook)</div>
              <div className={`text-xs font-bold font-mono mt-0.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {m.vtr6s.toFixed(2)}%
              </div>
              <div className="text-[10px] font-mono text-slate-400">{formatNum(m.views6s)} views</div>
            </div>

            <div className={`p-2 rounded border ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[9px] uppercase font-bold text-slate-400">15s VTR &amp; Hold Ratio</div>
              <div className={`text-xs font-bold font-mono mt-0.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {m.vtr15s.toFixed(2)}%
              </div>
              <div className="text-[10px] font-mono text-emerald-400">
                Hold: {m.retention6sTo15s.toFixed(1)}%
              </div>
            </div>

            <div className={`p-2 rounded border ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[9px] uppercase font-bold text-slate-400">CTR &amp; Clicks</div>
              <div className={`text-xs font-bold font-mono mt-0.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {m.ctr.toFixed(2)}%
              </div>
              <div className="text-[10px] font-mono text-slate-400">{formatNum(m.clicks)} clicks</div>
            </div>

            <div className={`p-2 rounded border ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[9px] uppercase font-bold text-slate-400">CPM</div>
              <div className={`text-xs font-bold font-mono mt-0.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatIDR(m.cpm)}
              </div>
              <div className="text-[10px] font-mono text-slate-400">{formatNum(m.impressions)} imps</div>
            </div>

            <div className={`p-2 rounded border col-span-2 ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[9px] uppercase font-bold text-slate-400">Categorization Rationale</div>
              <div className={`text-[11px] mt-0.5 leading-snug ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {creative.actionRecommendation || statusMeta.description}
              </div>
            </div>
          </div>
        </div>

        {streamData?.title && (
          <div
            className={`px-2.5 py-1.5 rounded border text-[11px] ${
              isDarkMode ? 'bg-slate-900/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <span className="font-bold text-indigo-400 mr-1.5">Extracted Caption / Hook Text:</span>
            <span className="italic">{streamData.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Client-side in-memory cache and concurrency queue for low-resolution preview thumbnails
 * so scrolling or paginating never re-fetches already resolved thumbnails, and bursts of
 * TikTok / Instagram thumbnail lookups never overwhelm upstream resolvers.
 */
const clientThumbCache = new Map<string, string>();
const clientThumbInFlight = new Map<string, Promise<string | null>>();
let activeThumbFetches = 0;
const MAX_CONCURRENT_THUMB_FETCHES = 3;
const thumbFetchWaitQueue: Array<() => void> = [];

function toProxiedThumbUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/api/tiktok-video')) return trimmed;
  if (trimmed.includes('drive.google.com/thumbnail')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    return `/api/tiktok-video?proxyImg=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function fetchRemoteThumbnailQueued(rawUrl: string): Promise<string | null> {
  const cached = clientThumbCache.get(rawUrl);
  if (cached) return Promise.resolve(cached);

  const existing = clientThumbInFlight.get(rawUrl);
  if (existing) return existing;

  const task = new Promise<string | null>(resolve => {
    const run = async () => {
      activeThumbFetches++;
      try {
        const res = await fetch(`/api/tiktok-video?thumbOnly=1&url=${encodeURIComponent(rawUrl)}`);
        if (res.ok) {
          const data = await res.json();
          const resolvedCover = data?.coverUrl ? toProxiedThumbUrl(data.coverUrl) : null;
          if (resolvedCover) {
            clientThumbCache.set(rawUrl, resolvedCover);
            resolve(resolvedCover);
            return;
          }
        }
        resolve(null);
      } catch {
        resolve(null);
      } finally {
        activeThumbFetches--;
        clientThumbInFlight.delete(rawUrl);
        const next = thumbFetchWaitQueue.shift();
        if (next) next();
      }
    };

    if (activeThumbFetches < MAX_CONCURRENT_THUMB_FETCHES) {
      run();
    } else {
      thumbFetchWaitQueue.push(run);
    }
  });

  clientThumbInFlight.set(rawUrl, task);
  return task;
}

/**
 * Vertical Portrait Video/Image Thumbnail Preview Button (`w-[50px] h-[68px]`)
 * - Aligned vertically with the table cell form and 9:16 short-form video aspect ratio.
 * - Uses `IntersectionObserver` so thumbnails are only fetched for visible table rows.
 * - Supports Google Drive (`sz=w240`), TikTok (oEmbed + TikWM fallback), and Instagram (OpenGraph + Embed fallback)
 *   streamed through the same-origin image proxy so thumbnails never fail due to CDN hotlink/CORP restrictions.
 */
function CreativePreviewThumbButton({
  row,
  isDarkMode,
  onOpen,
}: {
  row: any;
  isDarkMode: boolean;
  onOpen: () => void;
}) {
  const mediaItems = useMemo(() => parseCreativeLinks(row.creativeLink), [row.creativeLink]);
  const primary = mediaItems[0];
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    if (!primary) return null;
    if (primary.thumbnailUrl) return primary.thumbnailUrl;
    return clientThumbCache.get(primary.rawUrl) || null;
  });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const needsRemoteThumb = Boolean(
    primary && (primary.sourceType === 'tiktok' || primary.sourceType === 'instagram')
  );

  useEffect(() => {
    if (!primary) return;
    setImgLoaded(false);
    setImgError(false);

    if (primary.thumbnailUrl) {
      setThumbUrl(primary.thumbnailUrl);
      return;
    }

    const cached = clientThumbCache.get(primary.rawUrl);
    if (cached) {
      setThumbUrl(cached);
      return;
    }

    setThumbUrl(null);
  }, [primary?.rawUrl, primary?.thumbnailUrl]);

  useEffect(() => {
    const el = btnRef.current;
    if (!el || !primary || thumbUrl || !needsRemoteThumb) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [primary, thumbUrl, needsRemoteThumb]);

  useEffect(() => {
    if (!isVisible || !primary || !needsRemoteThumb || thumbUrl) return;

    let cancelled = false;
    fetchRemoteThumbnailQueued(primary.rawUrl).then(resolvedCover => {
      if (!cancelled && resolvedCover) {
        setThumbUrl(resolvedCover);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isVisible, primary, needsRemoteThumb, thumbUrl]);

  if (!primary) {
    return (
      <div
        className={`w-[50px] h-[68px] rounded-md border flex flex-col items-center justify-center text-[9px] font-medium ${
          isDarkMode ? 'bg-slate-800/40 border-slate-700/60 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-400'
        }`}
      >
        No Link
      </div>
    );
  }

  const badgeGradient =
    primary.sourceType === 'tiktok'
      ? 'from-slate-900 via-pink-950 to-cyan-950 border-pink-500/40'
      : primary.sourceType === 'instagram'
      ? 'from-purple-950 via-pink-900 to-amber-900 border-pink-500/40'
      : primary.sourceType === 'drive'
      ? 'from-emerald-950 via-teal-900 to-slate-900 border-emerald-500/40'
      : 'from-indigo-950 via-slate-900 to-slate-800 border-indigo-500/40';

  const sourceTag =
    primary.sourceType === 'tiktok'
      ? 'TikTok'
      : primary.sourceType === 'instagram'
      ? 'IG Reel'
      : primary.sourceType === 'drive'
      ? 'G-Drive'
      : 'Video';

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onOpen}
      title={`Click to preview ${row.creativeName || 'creative'}`}
      className={`group relative w-[50px] h-[68px] rounded-md border bg-gradient-to-br ${badgeGradient} flex flex-col items-center justify-center overflow-hidden shadow-sm hover:scale-105 hover:shadow-md transition-all cursor-pointer`}
    >
      {/* Low-res vertical lazy thumbnail image when available */}
      {thumbUrl && !imgError && (
        <img
          src={thumbUrl}
          alt={row.creativeName || 'Creative preview'}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-200 ${
            imgLoaded ? 'opacity-95 group-hover:opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Subtle dark vignette for legibility */}
      <div
        className={`absolute inset-0 transition-colors ${
          imgLoaded && !imgError
            ? 'bg-gradient-to-t from-black/80 via-black/15 to-black/10 group-hover:from-black/65 group-hover:via-transparent'
            : 'bg-black/20 group-hover:bg-black/5'
        }`}
      />

      {/* Centered Play icon badge */}
      <div className="relative z-10 w-5 h-5 rounded-full bg-black/55 backdrop-blur-[1px] border border-white/35 flex items-center justify-center text-white group-hover:bg-indigo-600 group-hover:border-indigo-400 transition-colors shadow-sm">
        <span className="text-[9px] leading-none ml-0.5">▶</span>
      </div>

      {/* Bottom Platform / Slide count label */}
      <span className="absolute bottom-1 inset-x-0 z-10 text-center text-[7.5px] font-bold uppercase tracking-wider text-white/95 drop-shadow leading-none px-0.5 truncate">
        {mediaItems.length > 1 ? `${mediaItems.length} Slides` : sourceTag}
      </span>
    </button>
  );
}






