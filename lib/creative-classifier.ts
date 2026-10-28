export type CreativeClassificationStatus =
  | 'OPTIMIZED_TOP'
  | 'POTENTIAL_GEM'
  | 'INEFFICIENT_SPEND'
  | 'BASELINE';

export const CLASSIFICATION_META: Record<
  CreativeClassificationStatus,
  {
    label: string;
    shortLabel: string;
    description: string;
    darkBadgeClass: string;
    lightBadgeClass: string;
    dotColor: string;
  }
> = {
  OPTIMIZED_TOP: {
    label: 'Optimized Top Creative',
    shortLabel: 'Optimized Top',
    description: 'Strong spend-weighted quality proven at meaningful spend scale.',
    darkBadgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    lightBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    dotColor: 'bg-emerald-400',
  },
  POTENTIAL_GEM: {
    label: 'Potential Creative',
    shortLabel: 'Potential',
    description: 'High quality rate above minimum valid spend floor — prime candidate to scale.',
    darkBadgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    lightBadgeClass: 'bg-violet-50 text-violet-700 border-violet-300',
    dotColor: 'bg-violet-400',
  },
  INEFFICIENT_SPEND: {
    label: 'High Spend / Low Quality',
    shortLabel: 'High Spend / Low Quality',
    description: 'High spend with quality well below Brand / Ad Type / Format median.',
    darkBadgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    lightBadgeClass: 'bg-rose-50 text-rose-700 border-rose-300',
    dotColor: 'bg-rose-400',
  },
  BASELINE: {
    label: 'Standard',
    shortLabel: 'Standard',
    description: 'Baseline delivery or low-spend unvalidated test.',
    darkBadgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    lightBadgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    dotColor: 'bg-slate-400',
  },
};

export function isCpasSalesAdType(adType?: string | null): boolean {
  if (!adType) return false;
  const s = adType.toLowerCase().trim();
  return (
    s === 'cpas sales' ||
    s === 'cpas shopee' ||
    s === 'cpas conversion' ||
    s === 'cpas' ||
    (s.includes('cpas') && !s.includes('awareness') && !s.includes('traffic') && !s.includes('view content'))
  );
}

export interface RawCreativeInput {
  key?: string;
  brand: string;
  platform: string;
  adType: string;
  kpi?: string;
  format?: string;
  adGroup: string;
  pillar?: string;
  creativeName: string;
  creativeLink?: string;
  spend: number | string;
  impressions: number | string;
  clicks: number | string;
  views6s: number | string;
  views15s: number | string;
  purchase?: number | string;
  gmv?: number | string;
}

export interface ClassifiedCreativeMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  views6s: number;
  views15s: number;
  purchase: number;
  gmv: number;
  roas: number;
  cr: number; // Conversion rate: (purchase / clicks) * 100
  qualityRate: number; // Raw Ratio: (clicks + views_6s + views_15s) / impressions, or CPAS composite conversion quality
  qualityRatePct: number; // Raw Percentage: qualityRate * 100
  weightedQualityRate: number; // Spend-validated & scale-weighted quality ratio
  weightedQualityPct: number; // Spend-weighted quality percentage
  spendCredibility: number; // 0..1 credibility factor based on spend vs cohort median spend
  isSpendValid: boolean; // True if spend >= minValidSpend floor for the Brand + AdType/KPI + Format cohort
  retention6sTo15s: number; // Percentage: (views_15s / views_6s) * 100
  vtr6s: number; // Percentage: (views_6s / impressions) * 100
  vtr15s: number; // Percentage: (views_15s / impressions) * 100
  ctr: number; // Percentage: (clicks / impressions) * 100
  cpm: number; // IDR: (spend / impressions) * 1000
}

export interface CohortBenchmarks {
  cohortKey: string;
  brand: string;
  adType: string;
  format: string;
  sampleSize: number;
  cohortSize: number;
  benchmarkPoolSize: number;
  medianQR: number; // Raw QR median (0..1)
  p75QR: number; // Raw QR 75th percentile (0..1)
  medianWeightedQR: number; // Spend-weighted QR median (0..1)
  p75WeightedQR: number; // Spend-weighted QR 75th percentile (0..1)
  medianSpend: number;
  p25Spend: number;
  p75Spend: number;
  minValidSpend: number; // Minimum spend required for Quality Rate to be considered valid
}

export interface ClassifiedCreativeRow {
  id: string;
  videoKey: string;
  brand: string;
  platform: string;
  adType: string;
  kpi: string;
  format: string;
  adGroup: string;
  pillar: string;
  creativeName: string;
  creativeLink: string;
  metrics: ClassifiedCreativeMetrics;
  status: CreativeClassificationStatus;
  statusLabel: string;
  actionRecommendation: string;
  qrVsMedianPct: number; // Raw QR vs Brand+AdType+Format median QR (%)
  weightedVsMedianPct: number; // Spend-weighted QR vs Brand+AdType+Format median (%)
  benchmarks: CohortBenchmarks;
}

export interface CohortClassificationResult {
  cohortId: string;
  creativeSignatureHash: string;
  brand: string;
  adType: string;
  format: string;
  weekKey: string;
  benchmarks: CohortBenchmarks;
  creatives: ClassifiedCreativeRow[];
  counts: {
    total: number;
    optimizedTop: number;
    potentialGem: number;
    inefficientSpend: number;
    baseline: number;
  };
}

/**
 * Extracts a canonical video key from a creative link so identical video links
 * (even across different Ad Groups, Creative Names, or query parameters) are
 * recognized as the exact same creative asset.
 */
export function normalizeCreativeVideoKey(rawLink?: string, fallbackId?: string): string {
  const raw = String(rawLink || '').trim();
  if (
    raw &&
    raw !== '-' &&
    raw.toUpperCase() !== '#N/A' &&
    raw.toUpperCase() !== 'N/A' &&
    raw.toLowerCase() !== 'none'
  ) {
    const urlMatches = raw.match(/https?:\/\/[^\s"'<>]+/gi);
    if (urlMatches && urlMatches.length > 0) {
      const firstUrl = urlMatches[0].replace(/[.,;)]+$/, '');
      const lower = firstUrl.toLowerCase();

      // 1. Canonical TikTok video ID
      const ttMatch = firstUrl.match(/tiktok\.com\/(?:@[^/]+\/video|v|embed\/v2|player\/v1)\/(\d+)/i);
      if (ttMatch && ttMatch[1]) {
        return `video:tiktok:${ttMatch[1]}`;
      }

      // 2. Canonical Instagram Reel / Post shortcode
      const igMatch = firstUrl.match(/instagram\.com\/(?:reel|p|tv)\/([a-zA-Z0-9_-]+)/i);
      if (igMatch && igMatch[1]) {
        return `video:ig:${igMatch[1]}`;
      }

      // 3. Canonical Google Drive file ID
      const driveMatch =
        firstUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) ||
        firstUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
      if (driveMatch && driveMatch[1]) {
        return `video:drive:${driveMatch[1]}`;
      }

      // 4. Generic URL normalized without query string or trailing slash
      const cleanUrl = lower.split('?')[0].replace(/\/+$/, '');
      return `video:url:${cleanUrl}`;
    }
  }
  return `name:${String(fallbackId || '').trim().toLowerCase()}`;
}

/**
 * Deduplicates creative inputs by video link:
 * - Reads the video link (`creativeLink`).
 * - Considers the same video link as the same creative so it will never be pulled twice.
 * - Takes the highest row data (highest Spend, then highest Impressions) if there is a duplicate.
 */
export function deduplicateInputsByVideoLink(inputs: RawCreativeInput[]): RawCreativeInput[] {
  const byVideoKey = new Map<string, RawCreativeInput>();

  for (const item of inputs) {
    const fallbackId =
      item.key ||
      `${item.brand || ''}||${item.platform || ''}||${item.adGroup || ''}||${item.creativeName || ''}`;
    const vKey = normalizeCreativeVideoKey(item.creativeLink, fallbackId);

    const existing = byVideoKey.get(vKey);
    if (!existing) {
      byVideoKey.set(vKey, item);
      continue;
    }

    const curSpend = safeParseMetricNumber(item.spend);
    const exSpend = safeParseMetricNumber(existing.spend);
    const curImp = safeParseMetricNumber(item.impressions);
    const exImp = safeParseMetricNumber(existing.impressions);
    const curGmv = safeParseMetricNumber(item.gmv);
    const exGmv = safeParseMetricNumber(existing.gmv);

    // Take the highest row data when duplicate video links exist (highest spend, then highest GMV, then highest impressions)
    if (
      curSpend > exSpend ||
      (curSpend === exSpend && curGmv > exGmv) ||
      (curSpend === exSpend && curImp > exImp)
    ) {
      byVideoKey.set(vKey, item);
    }
  }

  return Array.from(byVideoKey.values());
}

/**
 * Safely parses numeric values from numbers or formatted currency/percentage strings (e.g., "Rp 5.918.190", "7,65%")
 */
export function safeParseMetricNumber(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (val === null || val === undefined) return 0;
  let s = String(val).trim();
  if (!s || s === '-' || s.toUpperCase() === '#N/A' || s.toUpperCase() === 'N/A') return 0;

  s = s.replace(/Rp\.?\s*/gi, '').replace(/IDR\s*/gi, '').replace(/%/g, '').trim();

  const dotCount = (s.match(/\./g) || []).length;
  const commaCount = (s.match(/,/g) || []).length;

  if (dotCount > 1 && commaCount === 0) {
    s = s.replace(/\./g, '');
  } else if (dotCount >= 1 && commaCount === 1 && s.lastIndexOf('.') < s.lastIndexOf(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (commaCount > 1 && dotCount === 0) {
    s = s.replace(/,/g, '');
  } else if (commaCount === 1 && dotCount === 0) {
    const parts = s.split(',');
    if (parts[1] && parts[1].length !== 3) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(',', '');
    }
  } else {
    s = s.replace(/,/g, '');
  }

  const parsed = Number(s.replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Computes linear-interpolated percentile (0..1) on a numeric array.
 */
export function computePercentile(values: number[], p: number): number {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const clampedP = Math.max(0, Math.min(1, p));
  const idx = clampedP * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Computes Spend-Validated & Spend-Weighted Quality Score given raw qualityRate, spend, and cohort spend benchmarks.
 */
export function computeSpendWeightedQuality(
  rawQualityRate: number,
  spend: number,
  medianSpend: number,
  p25Spend: number
): {
  weightedQualityRate: number;
  weightedQualityPct: number;
  spendCredibility: number;
  isSpendValid: boolean;
  minValidSpend: number;
} {
  const minValidSpend = Math.max(p25Spend, medianSpend * 0.35);
  const isSpendValid = spend > 0 && (medianSpend <= 0 || spend >= minValidSpend);

  if (spend <= 0 || rawQualityRate <= 0) {
    return {
      weightedQualityRate: 0,
      weightedQualityPct: 0,
      spendCredibility: 0,
      isSpendValid: false,
      minValidSpend,
    };
  }

  const refMedian = Math.max(1, medianSpend);
  const spendCredibility = spend / (spend + refMedian * 0.65);

  const spendScaleFactor = isSpendValid
    ? 1 + 0.38 * Math.min(2.2, Math.log1p(spend / refMedian))
    : spendCredibility * 0.65;

  const weightedQualityRate = rawQualityRate * spendCredibility * spendScaleFactor;

  return {
    weightedQualityRate,
    weightedQualityPct: weightedQualityRate * 100,
    spendCredibility,
    isSpendValid,
    minValidSpend,
  };
}

/**
 * Computes core metrics for a single creative row (before cohort spend-weighting is attached).
 * For "CPAS SALES", quality rate specifically factors in Purchases, GMV, and ROAS.
 */
export function calculateCreativeCoreMetrics(input: {
  spend: number | string;
  impressions: number | string;
  clicks: number | string;
  views6s: number | string;
  views15s: number | string;
  purchase?: number | string;
  gmv?: number | string;
  adType?: string;
  kpi?: string;
}): ClassifiedCreativeMetrics {
  const spend = Math.max(0, safeParseMetricNumber(input.spend));
  const impressions = Math.max(0, safeParseMetricNumber(input.impressions));
  const clicks = Math.max(0, safeParseMetricNumber(input.clicks));
  const views6s = Math.max(0, safeParseMetricNumber(input.views6s));
  const views15s = Math.max(0, safeParseMetricNumber(input.views15s));
  const purchase = Math.max(0, safeParseMetricNumber(input.purchase));
  const gmv = Math.max(0, safeParseMetricNumber(input.gmv));

  const roas = spend > 0 ? gmv / spend : 0;
  const cr = clicks > 0 ? (purchase / clicks) * 100 : 0;

  const isCpas = isCpasSalesAdType(input.adType || input.kpi);

  let qualityRate = 0;
  if (isCpas) {
    // CPAS Sales Quality Rate: evaluates Purchase volume, GMV scale, and ROAS efficiency
    // High ROAS, solid purchases and verified GMV significantly boost quality rate
    // Zero purchases / zero GMV severely penalizes quality rate
    const baseRate = impressions > 0 ? (clicks + 0.5 * views6s + views15s + (purchase * 25)) / impressions : 0;
    const roasScale = spend > 0 ? (roas > 0 ? Math.min(3.0, Math.max(0.2, roas / 2.5)) : 0.15) : 1.0;
    const gmvScale = gmv > 0 ? (1 + 0.1 * Math.min(2, Math.log10(1 + gmv / 1000000))) : (spend > 0 ? 0.5 : 1.0);
    qualityRate = baseRate * roasScale * gmvScale;
  } else {
    qualityRate = impressions > 0 ? (clicks + views6s + views15s) / impressions : 0;
  }

  const qualityRatePct = qualityRate * 100;
  const retention6sTo15s = views6s > 0 ? (views15s / views6s) * 100 : 0;
  const vtr6s = impressions > 0 ? (views6s / impressions) * 100 : 0;
  const vtr15s = impressions > 0 ? (views15s / impressions) * 100 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

  return {
    spend,
    impressions,
    clicks,
    views6s,
    views15s,
    purchase,
    gmv,
    roas,
    cr,
    qualityRate,
    qualityRatePct,
    weightedQualityRate: qualityRate,
    weightedQualityPct: qualityRatePct,
    spendCredibility: spend > 0 ? 1 : 0,
    isSpendValid: spend > 0,
    retention6sTo15s,
    vtr6s,
    vtr15s,
    ctr,
    cpm,
  };
}

/**
 * Deterministic lightweight string hash (djb2 + hex) for signature detection.
 */
export function hashStringDeterministic(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(13, '0');
}

export function buildCohortId(
  brand: string,
  adType: string,
  weekKey: string,
  format?: string
): string {
  const norm = (s: string) =>
    String(s || 'ALL')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();
  const fmtPart =
    format && format.trim() && format.trim().toUpperCase() !== 'ALL' && format.trim().toUpperCase() !== 'ALL FORMATS'
      ? `__${norm(format)}`
      : '';
  return `${norm(brand)}__${norm(adType)}${fmtPart}__${norm(weekKey)}`;
}

/**
 * Computes dynamic cohort benchmarks for a group of creatives conditioned on:
 * Brand + Ad Type / KPI + Format.
 */
export function computeCohortBenchmarks(
  rowsWithMetrics: { metrics: ClassifiedCreativeMetrics }[],
  brand: string,
  adType: string,
  format = 'All Formats'
): CohortBenchmarks {
  const activeRows = rowsWithMetrics.filter(r => r.metrics.impressions > 0 || r.metrics.spend > 0);
  const highImpPool = activeRows.filter(r => r.metrics.impressions >= 1000);

  let benchmarkPool = highImpPool;
  if (benchmarkPool.length < 3 && activeRows.length > 0) {
    const sortedByImp = [...activeRows].sort((a, b) => b.metrics.impressions - a.metrics.impressions);
    const top80Count = Math.max(1, Math.ceil(sortedByImp.length * 0.8));
    benchmarkPool = sortedByImp.slice(0, top80Count);
  }

  const spendValues = benchmarkPool.filter(r => r.metrics.spend > 0).map(r => r.metrics.spend);
  const medianSpend = computePercentile(spendValues, 0.5);
  const p25Spend = computePercentile(spendValues, 0.25);
  const p75Spend = computePercentile(spendValues, 0.75);
  const minValidSpend = Math.max(p25Spend, medianSpend * 0.35);

  const validSpendPool = benchmarkPool.filter(r => r.metrics.spend >= minValidSpend);
  const qrPool = validSpendPool.length >= 2 ? validSpendPool : benchmarkPool;

  const qrValues = qrPool.map(r => r.metrics.qualityRate);
  const medianQR = computePercentile(qrValues, 0.5);
  const p75QR = computePercentile(qrValues, 0.75);

  const weightedValues = qrPool.map(
    r => computeSpendWeightedQuality(r.metrics.qualityRate, r.metrics.spend, medianSpend, p25Spend).weightedQualityRate
  );
  const medianWeightedQR = computePercentile(weightedValues, 0.5);
  const p75WeightedQR = computePercentile(weightedValues, 0.75);

  return {
    cohortKey: `${brand}||${adType}||${format}`,
    brand,
    adType,
    format,
    sampleSize: activeRows.length,
    cohortSize: activeRows.length,
    benchmarkPoolSize: qrPool.length,
    medianQR,
    p75QR,
    medianWeightedQR,
    p75WeightedQR,
    medianSpend,
    p25Spend,
    p75Spend,
    minValidSpend,
  };
}

export function classifyCreativeStatus(
  metrics: ClassifiedCreativeMetrics,
  benchmarks: CohortBenchmarks
): CreativeClassificationStatus {
  const { qualityRate, weightedQualityRate, spend, impressions, isSpendValid } = metrics;
  const { medianQR, p75QR, medianWeightedQR, p75WeightedQR, medianSpend, p75Spend, minValidSpend } = benchmarks;

  if (impressions <= 0 || spend <= 0) {
    return 'BASELINE';
  }

  if (!isSpendValid || spend < minValidSpend) {
    return 'BASELINE';
  }

  const hasScaleSpend = spend >= medianSpend * 0.85;
  const hasHighSpend = spend >= p75Spend || (medianSpend > 0 && spend >= medianSpend * 1.35);

  const isTopWeightedQuality =
    weightedQualityRate > 0 &&
    (weightedQualityRate >= p75WeightedQR ||
      (medianWeightedQR > 0 && weightedQualityRate >= medianWeightedQR * 1.15));

  const isHighRawQuality =
    qualityRate > 0 &&
    (qualityRate >= p75QR || (medianQR > 0 && qualityRate >= medianQR * 1.2));

  if (
    (hasScaleSpend && (isTopWeightedQuality || isHighRawQuality)) ||
    (hasHighSpend && medianQR > 0 && qualityRate >= medianQR * 0.82)
  ) {
    return 'OPTIMIZED_TOP';
  }

  if (spend >= minValidSpend && !hasScaleSpend && (isHighRawQuality || isTopWeightedQuality)) {
    return 'POTENTIAL_GEM';
  }

  const isPoorQuality = medianQR > 0 ? qualityRate < medianQR * 0.8 : qualityRate === 0;
  if (spend >= medianSpend && isPoorQuality) {
    return 'INEFFICIENT_SPEND';
  }

  return 'BASELINE';
}

function buildActionRecommendation(
  status: CreativeClassificationStatus,
  metrics: ClassifiedCreativeMetrics,
  bench: CohortBenchmarks
): string {
  if (!metrics.isSpendValid) {
    return 'Low spend below condition minimum floor — needs more delivery before quality rate is statistically valid.';
  }
  switch (status) {
    case 'OPTIMIZED_TOP':
      return metrics.spend >= bench.p75Spend
        ? 'High-spend scale winner sustaining strong quality above condition benchmark.'
        : 'Proven top-quartile spend-weighted quality above condition median spend.';
    case 'POTENTIAL_GEM':
      return 'High quality rate above minimum valid spend floor with room to scale toward median spend.';
    case 'INEFFICIENT_SPEND':
      return 'High spend with quality below 80% of condition median — prioritize hook/angle iteration.';
    default:
      return 'Baseline delivery within normal range for this Brand, Ad Type, and Format.';
  }
}

/**
 * Classifies a list of creatives where:
 * 1. Duplicate video links are deduplicated (keeping the highest row data so the same video link is never pulled twice).
 * 2. Each creative's median benchmark is pulled based on condition: Brand + Ad Type / KPI + Format.
 */
export function classifyCreativeCohort(
  inputs: RawCreativeInput[],
  options?: {
    brandLabel?: string;
    adTypeLabel?: string;
    formatLabel?: string;
    weekKey?: string;
    groupByBrandAndAdType?: boolean;
    deduplicateByVideoLink?: boolean;
  }
): CohortClassificationResult {
  const brandLabel = options?.brandLabel || 'All Brands';
  const adTypeLabel = options?.adTypeLabel || 'All Ad Types';
  const formatLabel = options?.formatLabel || 'All Formats';
  const weekKey = options?.weekKey || 'Current-Period';
  const useConditionBenchmarks = options?.groupByBrandAndAdType ?? true;
  const shouldDeduplicate = options?.deduplicateByVideoLink ?? true;

  const sourceInputs = shouldDeduplicate ? deduplicateInputsByVideoLink(inputs) : inputs;

  // Step 1: Calculate base metrics for all rows
  const prepared = sourceInputs.map(item => {
    const metrics = calculateCreativeCoreMetrics(item);
    const id =
      item.key ||
      `${item.brand || ''}||${item.platform || ''}||${item.adGroup || ''}||${item.pillar || ''}||${item.creativeName || ''}`;
    const videoKey = normalizeCreativeVideoKey(item.creativeLink, id);
    const b = (item.brand || 'Unknown').trim();
    const at = (item.adType || item.kpi || item.platform || 'Unknown').trim();
    const fmt = (item.format || 'Standard').trim();
    return {
      raw: item,
      id,
      videoKey,
      brand: b,
      adTypeKey: at,
      formatKey: fmt,
      conditionKey: `${b}||${at}||${fmt}`,
      fallbackKey: `${b}||${at}`,
      metrics,
    };
  });

  // Step 2: Build condition benchmarks per (Brand + Ad Type/KPI + Format), with fallback to (Brand + Ad Type/KPI) if < 2 items
  const conditionGroups = new Map<string, typeof prepared>();
  const fallbackGroups = new Map<string, typeof prepared>();

  prepared.forEach(item => {
    if (!conditionGroups.has(item.conditionKey)) conditionGroups.set(item.conditionKey, []);
    conditionGroups.get(item.conditionKey)!.push(item);

    if (!fallbackGroups.has(item.fallbackKey)) fallbackGroups.set(item.fallbackKey, []);
    fallbackGroups.get(item.fallbackKey)!.push(item);
  });

  const conditionBenchmarks = new Map<string, CohortBenchmarks>();
  conditionGroups.forEach((items, cKey) => {
    const [b, at, fmt] = cKey.split('||');
    if (items.length >= 2) {
      conditionBenchmarks.set(cKey, computeCohortBenchmarks(items, b, at, fmt));
    } else {
      const fbItems = fallbackGroups.get(`${b}||${at}`) || items;
      conditionBenchmarks.set(cKey, computeCohortBenchmarks(fbItems, b, at, fmt));
    }
  });

  const overallBenchmarks = computeCohortBenchmarks(prepared, brandLabel, adTypeLabel, formatLabel);

  // Step 3: Enrich each creative with its Spend-Weighted Quality Score and classify against its Brand+AdType/KPI+Format benchmark
  const classified: ClassifiedCreativeRow[] = prepared.map(item => {
    const bench =
      (useConditionBenchmarks && conditionBenchmarks.get(item.conditionKey)) || overallBenchmarks;

    const weighted = computeSpendWeightedQuality(
      item.metrics.qualityRate,
      item.metrics.spend,
      bench.medianSpend,
      bench.p25Spend
    );

    const enrichedMetrics: ClassifiedCreativeMetrics = {
      ...item.metrics,
      weightedQualityRate: weighted.weightedQualityRate,
      weightedQualityPct: weighted.weightedQualityPct,
      spendCredibility: weighted.spendCredibility,
      isSpendValid: weighted.isSpendValid,
    };

    const status = classifyCreativeStatus(enrichedMetrics, bench);
    const qrVsMedianPct =
      bench.medianQR > 0 ? ((enrichedMetrics.qualityRate - bench.medianQR) / bench.medianQR) * 100 : 0;
    const weightedVsMedianPct =
      bench.medianWeightedQR > 0
        ? ((enrichedMetrics.weightedQualityRate - bench.medianWeightedQR) / bench.medianWeightedQR) * 100
        : qrVsMedianPct;

    return {
      id: item.id,
      videoKey: item.videoKey,
      brand: item.brand,
      platform: (item.raw.platform || '').trim(),
      adType: (item.raw.adType || '').trim(),
      kpi: (item.raw.kpi || '').trim(),
      format: (item.raw.format || '').trim(),
      adGroup: (item.raw.adGroup || '').trim(),
      pillar: (item.raw.pillar || '').trim(),
      creativeName: (item.raw.creativeName || '').trim(),
      creativeLink: (item.raw.creativeLink || '').trim(),
      metrics: enrichedMetrics,
      status,
      statusLabel: CLASSIFICATION_META[status].label,
      actionRecommendation: buildActionRecommendation(status, enrichedMetrics, bench),
      qrVsMedianPct,
      weightedVsMedianPct,
      benchmarks: bench,
    };
  });

  // Sort classified creatives by Spend-Weighted Quality Score desc
  classified.sort((a, b) => b.metrics.weightedQualityRate - a.metrics.weightedQualityRate);

  // Step 4: Compute deterministic signature hash from sorted notable creative IDs
  const notableForSignature = classified
    .filter(c => c.status === 'OPTIMIZED_TOP' || c.status === 'POTENTIAL_GEM' || c.status === 'INEFFICIENT_SPEND')
    .map(c => `${c.status}:${c.videoKey}:${Math.round(c.metrics.spend)}`)
    .sort();

  const signaturePayload =
    notableForSignature.length > 0
      ? notableForSignature.join('|')
      : classified
          .slice(0, 10)
          .map(c => `BASE:${c.videoKey}:${Math.round(c.metrics.spend)}`)
          .sort()
          .join('|');

  const creativeSignatureHash = `sig_${hashStringDeterministic(signaturePayload)}_${notableForSignature.length}`;
  const cohortId = buildCohortId(brandLabel, adTypeLabel, weekKey, formatLabel);

  const counts = {
    total: classified.length,
    optimizedTop: classified.filter(c => c.status === 'OPTIMIZED_TOP').length,
    potentialGem: classified.filter(c => c.status === 'POTENTIAL_GEM').length,
    inefficientSpend: classified.filter(c => c.status === 'INEFFICIENT_SPEND').length,
    baseline: classified.filter(c => c.status === 'BASELINE').length,
  };

  return {
    cohortId,
    creativeSignatureHash,
    brand: brandLabel,
    adType: adTypeLabel,
    format: formatLabel,
    weekKey,
    benchmarks: overallBenchmarks,
    creatives: classified,
    counts,
  };
}

/**
 * Selects the Top 2-3 Performing Creatives for the cohort (deduplicated by canonical video key).
 * - For CPAS Sales / CPAS Shopee: Pulls considering higher weight from GMV generated (highest GMV pulled),
 *   EXCEPT when a creative has very low ROAS compared to the cohort.
 * - For non-CPAS (all other ad types): Preserves standard Spend-Weighted Quality Rate ranking.
 */
export function selectTopCohortWinners(
  creatives: ClassifiedCreativeRow[],
  adTypeLabel?: string
): ClassifiedCreativeRow[] {
  if (!creatives || creatives.length === 0) return [];

  const isCpas = isCpasSalesAdType(adTypeLabel) || creatives.some(c => isCpasSalesAdType(c.adType || c.kpi));

  if (isCpas) {
    // 1. Compute cohort-level ROAS reference benchmarks
    const activeWithSpend = creatives.filter(c => c.metrics.spend > 0);
    const validRoasValues = activeWithSpend.map(c => c.metrics.roas || 0).filter(r => r > 0);
    const medianRoas = computePercentile(validRoasValues, 0.5);
    const totalSpend = activeWithSpend.reduce((acc, c) => acc + c.metrics.spend, 0);
    const totalGmv = activeWithSpend.reduce((acc, c) => acc + (c.metrics.gmv || 0), 0);
    const aggRoas = totalSpend > 0 ? totalGmv / totalSpend : 0;
    const refCohortRoas = Math.max(medianRoas, aggRoas);

    // 2. Filter criteria: A creative is excluded if it has very low ROAS compared to the cohort
    // Very low ROAS = no GMV/ROAS (roas <= 0), classified as INEFFICIENT_SPEND, or ROAS < 60% of cohort ROAS
    const isVeryLowRoas = (c: ClassifiedCreativeRow): boolean => {
      const r = c.metrics.roas || 0;
      const g = c.metrics.gmv || 0;
      if (g <= 0 || r <= 0) return true;
      if (c.status === 'INEFFICIENT_SPEND') return true;
      if (refCohortRoas > 0 && r < refCohortRoas * 0.60) return true;
      return false;
    };

    const activeCandidates = creatives.filter(c => c.metrics.spend > 0 || c.metrics.impressions > 0);

    // 3. Healthy candidates sorted primarily by highest GMV desc (with ROAS as tie-breaker)
    const healthyPool = activeCandidates
      .filter(c => (c.metrics.gmv || 0) > 0 && !isVeryLowRoas(c))
      .sort((a, b) => {
        const gmvDiff = (b.metrics.gmv || 0) - (a.metrics.gmv || 0);
        if (Math.abs(gmvDiff) > 1000) return gmvDiff;
        return (b.metrics.roas || 0) - (a.metrics.roas || 0);
      });

    // 4. Pull top 3 unique creatives deduplicated by canonical video key
    const topWinners: ClassifiedCreativeRow[] = [];
    const seenVideoKeys = new Set<string>();

    for (const item of healthyPool) {
      const vKey = item.videoKey || normalizeCreativeVideoKey(item.creativeLink, item.id);
      if (!seenVideoKeys.has(vKey)) {
        seenVideoKeys.add(vKey);
        topWinners.push(item);
      }
      if (topWinners.length >= 3) break;
    }

    // Fallback: If fewer than 3 creatives pass the strict ROAS threshold, backfill from remaining active creatives sorted by GMV
    if (topWinners.length < 3) {
      const remainingPool = activeCandidates
        .filter(c => !seenVideoKeys.has(c.videoKey || normalizeCreativeVideoKey(c.creativeLink, c.id)))
        .sort((a, b) => (b.metrics.gmv || 0) - (a.metrics.gmv || 0));

      for (const item of remainingPool) {
        const vKey = item.videoKey || normalizeCreativeVideoKey(item.creativeLink, item.id);
        if (!seenVideoKeys.has(vKey)) {
          seenVideoKeys.add(vKey);
          topWinners.push(item);
        }
        if (topWinners.length >= 3) break;
      }
    }

    return topWinners;
  }

  // Non-CPAS standard logic (unchanged): ranked by Spend-Weighted Quality Rate
  const optList = [...creatives]
    .filter(c => c.status === 'OPTIMIZED_TOP')
    .sort((a, b) => b.metrics.weightedQualityRate - a.metrics.weightedQualityRate);

  const potList = [...creatives]
    .filter(c => c.status === 'POTENTIAL_GEM')
    .sort((a, b) => b.metrics.weightedQualityRate - a.metrics.weightedQualityRate);

  const validList = [...creatives]
    .filter(c => c.metrics.isSpendValid && c.metrics.spend > 0)
    .sort((a, b) => b.metrics.weightedQualityRate - a.metrics.weightedQualityRate);

  const topWinners: ClassifiedCreativeRow[] = [];
  const seenVideoKeys = new Set<string>();
  for (const item of [...optList, ...potList, ...validList, ...creatives]) {
    const vKey = item.videoKey || normalizeCreativeVideoKey(item.creativeLink, item.id);
    if (!seenVideoKeys.has(vKey) && (item.metrics.spend > 0 || item.metrics.impressions > 0)) {
      seenVideoKeys.add(vKey);
      topWinners.push(item);
    }
    if (topWinners.length >= 3) break;
  }

  return topWinners;
}
