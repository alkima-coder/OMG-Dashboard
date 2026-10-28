/**
 * Reverse-Funnel Media Planning Simulator Engine
 * 
 * Mathematical pipeline to reverse-engineer full-funnel media requirements
 * (Impressions, Attention touchpoints, Engagements, Clicks, Funnel Spend, ROAS)
 * from a Target GMV using time-decay weighted historical Media Signal cohorts.
 */

import { parseNum, isValidBrandName } from '@/lib/formatters';
import { parseSheetDate, toYMD } from '@/lib/dateUtils';

export interface CohortMetrics {
  cohortKey: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  brand: string;
  // Sales & Commerce
  gmv: number;
  aov: number;
  itemsSold: number;
  cr: number; // Items Sold / Clicks
  productCardClicks: number;
  // Intent
  clicks: number;
  searchVolume: number;
  // Engagement
  totalEngagements: number;
  paidEngagements: number;
  organicEngagements: number;
  pctOrganicEng: number;
  // Attention Touchpoints
  views100: number;
  views6s: number;
  shares: number;
  comments: number;
  likes: number;
  // Scale / Impressions
  totalImpressions: number;
  paidImpressions: number;
  organicImpressions: number;
  pctOrganicImp: number;
  // Performance Rates
  ctr: number;
  vtr: number; // 6s Views / Paid Imp
  erPct: number; // Paid Eng / Paid Imp
  // Audience Acquisition
  newAudienceAwareness: number;
  newAudienceConsideration: number;
  newAudienceConversion: number;
  // Funnel Delivery
  impAwareness: number;
  cpmAwareness: number;
  impConsideration: number;
  cpmConsideration: number;
  impConversion: number;
  cpmConversion: number;
  // Funnel Spend
  spendAwareness: number;
  spendConsideration: number;
  spendConversion: number;
  totalSpend: number;
}

export type DecayMode = 'exponential' | 'linear' | 'equal';

export interface TimeDecaySettings {
  halfLifeDays: number; // Default 30, slider 7-90
  decayMode: DecayMode;
  useDurationNormalization: boolean; // Default true (D_i multiplier)
  referenceDate?: string; // Default max(endDate)
}

export interface CohortWeightBreakdown {
  cohortKey: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  ageDays: number;
  rawWeight: number;
  normalizedWeight: number; // Sum = 1.0
  gmv: number;
}

export interface WeightedBaselineRatios {
  // Commerce & Intent
  weightedAOV: number;
  itemPerPccRatio: number; // Item sold / Product Card Clicks
  clickToItemCR: number; // Item sold / Clicks
  searchPerClickRatio: number; // Search Volume / Clicks
  // Engagement & Attention
  pccPerPaidEngRatio: number; // Product Card Clicks / Paid Engagements
  paidEngShare: number; // Paid Eng / Total Eng
  organicEngShare: number; // Organic Eng / Total Eng
  unattributedEngShare: number; // 1 - (Paid + Organic) / Total
  touchpointToPaidEngRatio: {
    views100: number;
    views6s: number;
    likes: number;
    shares: number;
    comments: number;
  };
  // Scale / Impressions
  paidErRate: number; // Paid Eng / Paid Imp
  paidImpShare: number; // Paid Imp / Total Imp
  organicImpShare: number; // Organic Imp / Total Imp
  // Funnel Ratios
  funnelImpShare: {
    awareness: number;
    consideration: number;
    conversion: number;
  };
  funnelCPM: {
    awareness: number;
    consideration: number;
    conversion: number;
  };
  newAudiencePerImp: {
    awareness: number;
    consideration: number;
    conversion: number;
  };
  // Baseline Cohort Summary
  cohortCount: number;
  latestGMV: number;
  latestStartDate: string;
  latestEndDate: string;
  latestCohortDays: number;
  latestCohortMonthDays: number;
  dailyRunRateGMV: number;
  projectedFullMonthGMV: number;
  projectedFullMonthSpend: number;
  pacingCumulativeGMV: number;
  pacingCumulativeSpend: number;
  weights: CohortWeightBreakdown[];
}

export interface SimulatorOverrides {
  weightedAOV?: number;
  clickToItemCR?: number;
  paidErRate?: number;
  funnelImpShare?: {
    awareness?: number;
    consideration?: number;
    conversion?: number;
  };
  funnelCPM?: {
    awareness?: number;
    consideration?: number;
    conversion?: number;
  };
}

export interface FunnelOutputStage {
  stage: 'Awareness' | 'Consideration' | 'Conversion';
  impSharePct: number;
  requiredImpressions: number;
  cpm: number;
  requiredSpend: number;
  spendSharePct: number;
  projectedNewAudience: number;
}

export interface ReverseFunnelOutput {
  targetGMV: number;
  // Summary KPIs
  totalRequiredSpend: number;
  projectedROAS: number; // Conversion ROAS: targetGMV / targetFunnelSpend.conversion
  conversionROAS: number; // Strictly from conversion spend
  blendedROAS: number; // Blended across full-funnel spend
  requiredPaidImpressions: number;
  requiredPaidEngagements: number;
  requiredItemsSold: number;
  // Commerce Layer
  targetItemsSold: number;
  targetProductCardClicks: number;
  // Intent Layer
  targetClicks: number;
  targetSearchVolumes: number;
  // Engagement & Attention Layer
  targetPaidEngagements: number;
  targetTotalEngagements: number;
  targetOrganicEngagements: number;
  targetTouchpoints: {
    views100: number;
    views6s: number;
    likes: number;
    shares: number;
    comments: number;
  };
  // Scale Layer
  targetPaidImpressions: number;
  targetTotalImpressions: number;
  targetOrganicImpressions: number;
  // Funnel Layer
  funnelStages: {
    awareness: FunnelOutputStage;
    consideration: FunnelOutputStage;
    conversion: FunnelOutputStage;
  };
  // Active Ratios used in calculation (Baseline + Overrides)
  activeRatios: {
    aov: number;
    cr: number;
    erRate: number;
    funnelImpShare: { awareness: number; consideration: number; conversion: number };
    funnelCPM: { awareness: number; consideration: number; conversion: number };
  };
  // Dynamic Modeling Indicators
  dynamics?: {
    scaleRatio: number;
    roasElasticityMultiplier: number;
    funnelEngMultiplier: number;
    effectiveErRate: number;
    blendedCPM: number;
  };
}

/**
 * Safe division with zero guard
 */
export function safeDiv(num: number, denom: number, fallback = 0): number {
  if (!denom || isNaN(denom) || denom === 0) return fallback;
  const res = num / denom;
  return isNaN(res) || !isFinite(res) ? fallback : res;
}

/**
 * Computes cohort duration in days from start and end dates
 */
export function getDurationDays(startDate: string, endDate: string): number {
  try {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (isNaN(s) || isNaN(e)) return 1;
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  } catch {
    return 1;
  }
}

export type CampaignPhaseType =
  | 'dd_ramp'
  | 'dd_peak'
  | 'dd_cool'
  | 'bau'
  | 'payday_ramp'
  | 'payday_peak'
  | 'payday_cool'
  // Backward-compatibility aliases
  | 'dd_kickoff'
  | 'dd_teaser'
  | 'dd_warmup'
  | 'dd_dday'
  | 'dd_post'
  | 'bau_spike'
  | 'payday'
  | 'payday_close';

export interface DailyPacingPoint {
  day: number;
  dateStr: string;
  spendPct: number;
  gmvPct: number;
  phase: CampaignPhaseType;
  label: string;
}

export interface DailyPlanScheduleItem extends DailyPacingPoint {
  plannedSpend: number;
  plannedGMV: number;
  plannedConvSpend: number;
  dailyROAS: number;
}

/**
 * Returns agile daily pacing curve with strictly TWO peaks:
 * 1. Double Date Peak (Day = Month, e.g. Day 9 for Sept, Day 10 for Oct, Day 11 for Nov, Day 12 for Dec)
 * 2. Payday Peak on Day 25
 * Features gradual ramp-up before both peaks, gradual cooldown after both peaks,
 * and pure flat BAU for all intermediate days (no second mega peak, no random campaign spikes).
 */
export function getDailyPacingCurve(dateStr?: string): DailyPacingPoint[] {
  let date = dateStr ? parseSheetDate(dateStr) : null;
  if (!date || isNaN(date.getTime())) {
    date = new Date();
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const daysInMonth = new Date(year, month, 0).getDate();
  const ddDay = Math.min(daysInMonth, month);

  interface RawPoint {
    day: number;
    dateStr: string;
    spendRaw: number;
    gmvRaw: number;
    phase: CampaignPhaseType;
    label: string;
  }

  const rawPoints: RawPoint[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

    // PEAK 1: Double Date Peak (Day = Month)
    if (d === ddDay) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.165,
        gmvRaw: 0.155,
        phase: 'dd_peak',
        label: `${month}.${month} Double Date Peak`,
      });
    }
    // Gradual Increase leading into Double Date
    else if (d === ddDay - 1) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.065,
        gmvRaw: 0.060,
        phase: 'dd_ramp',
        label: `${month}.${month} Eve Surge`,
      });
    } else if (d === ddDay - 2) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.048,
        gmvRaw: 0.046,
        phase: 'dd_ramp',
        label: `${month}.${month} Warm-up Surge`,
      });
    } else if (d === ddDay - 3) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.036,
        gmvRaw: 0.036,
        phase: 'dd_ramp',
        label: `${month}.${month} Teaser Build`,
      });
    } else if (d === ddDay - 4) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.028,
        gmvRaw: 0.028,
        phase: 'dd_ramp',
        label: `${month}.${month} Teaser Build`,
      });
    } else if (d < ddDay - 4) {
      const denom = Math.max(1, ddDay - 4);
      const val = 0.015 + (d / denom) * 0.010;
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: val,
        gmvRaw: val,
        phase: 'dd_ramp',
        label: 'Early Kick-off',
      });
    }
    // Gradual Decrease following Double Date
    else if (d === ddDay + 1) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.028,
        gmvRaw: 0.028,
        phase: 'dd_cool',
        label: `${month}.${month} Cooldown`,
      });
    } else if (d === ddDay + 2) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.018,
        gmvRaw: 0.018,
        phase: 'dd_cool',
        label: `${month}.${month} Cooldown`,
      });
    }
    // PEAK 2: Payday Peak on Day 25 Only
    else if (d === 25) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.080,
        gmvRaw: 0.080,
        phase: 'payday_peak',
        label: 'Payday Peak (25th)',
      });
    }
    // Gradual Increase leading into Payday (Days 22, 23, 24)
    else if (d === 24) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.048,
        gmvRaw: 0.048,
        phase: 'payday_ramp',
        label: 'Payday Eve Warm-up',
      });
    } else if (d === 23) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.030,
        gmvRaw: 0.030,
        phase: 'payday_ramp',
        label: 'Payday Teaser',
      });
    } else if (d === 22) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.019,
        gmvRaw: 0.019,
        phase: 'payday_ramp',
        label: 'Payday Ramp',
      });
    }
    // Gradual Decrease following Payday (26th onwards - NO mega peak, smooth cooldown)
    else if (d === 26) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.048,
        gmvRaw: 0.048,
        phase: 'payday_cool',
        label: 'Payday Cooldown',
      });
    } else if (d === 27) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.032,
        gmvRaw: 0.032,
        phase: 'payday_cool',
        label: 'Payday Cooldown',
      });
    } else if (d === 28) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.022,
        gmvRaw: 0.022,
        phase: 'payday_cool',
        label: 'Payday Cooldown',
      });
    } else if (d === 29) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.016,
        gmvRaw: 0.016,
        phase: 'payday_cool',
        label: 'Payday Cooldown',
      });
    } else if (d === 30) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.013,
        gmvRaw: 0.013,
        phase: 'payday_cool',
        label: 'Payday Cooldown',
      });
    } else if (d === 31) {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.011,
        gmvRaw: 0.011,
        phase: 'payday_cool',
        label: 'Month-End Cooldown',
      });
    }
    // ALL OTHER DAYS: Flat BAU (No random special campaign spikes)
    else {
      rawPoints.push({
        day: d,
        dateStr: dStr,
        spendRaw: 0.0110,
        gmvRaw: 0.0108,
        phase: 'bau',
        label: 'Flat BAU',
      });
    }
  }

  // Exact normalization so sum(spendPct) = 1.0000 and sum(gmvPct) = 1.0000
  const sumS = rawPoints.reduce((acc, p) => acc + p.spendRaw, 0);
  const sumG = rawPoints.reduce((acc, p) => acc + p.gmvRaw, 0);

  return rawPoints.map(p => ({
    day: p.day,
    dateStr: p.dateStr,
    spendPct: sumS > 0 ? p.spendRaw / sumS : 1 / daysInMonth,
    gmvPct: sumG > 0 ? p.gmvRaw / sumG : 1 / daysInMonth,
    phase: p.phase,
    label: p.label,
  }));
}

export const OCTOBER_2026_DAILY_PACING: DailyPacingPoint[] = getDailyPacingCurve('2026-10-01');

/**
 * Computes cumulative campaign pacing shares for a date range (startDate to endDate)
 * Uses the non-linear Double Date + Payday campaign curve instead of flat linear days.
 */
export function getCumulativePacingShares(startDate: string, endDate: string): {
  cumGMV: number;
  cumSpend: number;
  isFullMonth: boolean;
  startDay: number;
  endDay: number;
} {
  const curve = getDailyPacingCurve(endDate || startDate);
  const dStart = parseSheetDate(startDate);
  const dEnd = parseSheetDate(endDate);

  if (!dStart || !dEnd || isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) {
    return { cumGMV: 1.0, cumSpend: 1.0, isFullMonth: true, startDay: 1, endDay: curve.length };
  }

  const startDay = dStart.getDate();
  const endDay = dEnd.getDate();
  const isFullMonth = startDay === 1 && endDay >= curve.length;

  let cumGMV = 0;
  let cumSpend = 0;

  curve.forEach(p => {
    if (p.day >= startDay && p.day <= endDay) {
      cumGMV += p.gmvPct;
      cumSpend += p.spendPct;
    }
  });

  return {
    cumGMV: Math.min(1.0, Math.max(0.01, cumGMV)),
    cumSpend: Math.min(1.0, Math.max(0.01, cumSpend)),
    isFullMonth,
    startDay,
    endDay,
  };
}

/**
 * Generates full-month daily planned schedule from targetGMV and reverse-funnel spend
 */
export function generateDailyPacingSchedule(
  targetGMV: number,
  totalSpend: number,
  convSpend: number,
  monthRefDate?: string
): DailyPlanScheduleItem[] {
  const curve = getDailyPacingCurve(monthRefDate);
  return curve.map(pt => {
    const plannedGMV = Math.round(targetGMV * pt.gmvPct);
    const plannedSpend = Math.round(totalSpend * pt.spendPct);
    const plannedConvSpend = Math.round(convSpend * pt.spendPct);
    const dailyROAS = safeDiv(plannedGMV, plannedConvSpend);
    return {
      ...pt,
      plannedSpend,
      plannedGMV,
      plannedConvSpend,
      dailyROAS,
    };
  });
}

/**
 * Step A: Compute Time-Decay Weights across historical cohorts
 */
export function computeTimeDecayWeights(
  cohorts: CohortMetrics[],
  settings: TimeDecaySettings
): CohortWeightBreakdown[] {
  if (cohorts.length === 0) return [];

  // 1. Reference date: max(endDate) or user-specified
  let maxTime = -Infinity;
  let tMaxStr = settings.referenceDate || '';

  if (!tMaxStr) {
    cohorts.forEach(c => {
      const t = new Date(c.endDate).getTime();
      if (!isNaN(t) && t > maxTime) {
        maxTime = t;
        tMaxStr = c.endDate;
      }
    });
  } else {
    maxTime = new Date(tMaxStr).getTime();
  }

  const H = Math.max(7, Math.min(90, settings.halfLifeDays || 30));
  const ln2OverH = Math.LN2 / H;

  // 2. Compute raw weights w'_i
  const rawList = cohorts.map(c => {
    const dEnd = new Date(c.endDate).getTime();
    const ageDays = isNaN(dEnd) || isNaN(maxTime)
      ? 0
      : Math.max(0, Math.round((maxTime - dEnd) / (1000 * 60 * 60 * 24)));
    
    const D_i = settings.useDurationNormalization ? (c.durationDays || getDurationDays(c.startDate, c.endDate)) : 1;

    let timeDecayFactor = 1.0;
    if (settings.decayMode === 'exponential') {
      timeDecayFactor = Math.exp(-ln2OverH * ageDays);
    } else if (settings.decayMode === 'linear') {
      // Linear decay down to minimum floor over 2*H days
      timeDecayFactor = Math.max(0.01, 1 - ageDays / (2 * H));
    } else {
      // Equal
      timeDecayFactor = 1.0;
    }

    const rawWeight = D_i * timeDecayFactor;

    return {
      cohortKey: c.cohortKey,
      startDate: c.startDate,
      endDate: c.endDate,
      durationDays: D_i,
      ageDays,
      rawWeight,
      gmv: c.gmv,
    };
  });

  // 3. Normalize weights so sum(W_i) = 1.0
  const sumRaw = rawList.reduce((acc, r) => acc + r.rawWeight, 0);

  return rawList.map(r => ({
    cohortKey: r.cohortKey,
    startDate: r.startDate,
    endDate: r.endDate,
    durationDays: r.durationDays,
    ageDays: r.ageDays,
    rawWeight: r.rawWeight,
    normalizedWeight: sumRaw > 0 ? r.rawWeight / sumRaw : safeDiv(1, rawList.length),
    gmv: r.gmv,
  }));
}

/**
 * Step B: Compute Time-Decayed Baseline Efficiency Ratios
 * 
 * Never averages raw volumes across cohorts. Computes efficiency ratios inside each
 * cohort first, then takes the weighted sum using W_i.
 */
export function computeWeightedBaselineRatios(
  cohorts: CohortMetrics[],
  settings: TimeDecaySettings
): WeightedBaselineRatios {
  if (cohorts.length === 0) {
    return {
      weightedAOV: 100000,
      itemPerPccRatio: 0.01,
      clickToItemCR: 0.01,
      searchPerClickRatio: 0.2,
      pccPerPaidEngRatio: 0.04,
      paidEngShare: 0.8,
      organicEngShare: 0.2,
      unattributedEngShare: 0,
      touchpointToPaidEngRatio: { views100: 0.44, views6s: 0.65, likes: 0.08, shares: 0.006, comments: 0.0005 },
      paidErRate: 0.14,
      paidImpShare: 0.84,
      organicImpShare: 0.16,
      funnelImpShare: { awareness: 0.57, consideration: 0.32, conversion: 0.11 },
      funnelCPM: { awareness: 1500, consideration: 3600, conversion: 9000 },
      newAudiencePerImp: { awareness: 0.3, consideration: 0.03, conversion: 0.0003 },
      cohortCount: 0,
      latestGMV: 0,
      latestStartDate: '',
      latestEndDate: '',
      latestCohortDays: 30,
      latestCohortMonthDays: 30,
      dailyRunRateGMV: 0,
      projectedFullMonthGMV: 0,
      projectedFullMonthSpend: 0,
      pacingCumulativeGMV: 1,
      pacingCumulativeSpend: 1,
      weights: [],
    };
  }

  const weightBreakdown = computeTimeDecayWeights(cohorts, settings);
  const weightMap = new Map<string, number>();
  weightBreakdown.forEach(w => weightMap.set(w.cohortKey, w.normalizedWeight));

  let weightedAOV = 0;
  let itemPerPccRatio = 0;
  let clickToItemCR = 0;
  let searchPerClickRatio = 0;

  let pccPerPaidEngRatio = 0;
  let paidEngShare = 0;
  let organicEngShare = 0;
  let unattributedEngShare = 0;

  const touchpointToPaidEngRatio = {
    views100: 0,
    views6s: 0,
    likes: 0,
    shares: 0,
    comments: 0,
  };

  let paidErRate = 0;
  let paidImpShare = 0;
  let organicImpShare = 0;

  const rawFunnelImpShare = { awareness: 0, consideration: 0, conversion: 0 };
  const funnelCPM = { awareness: 0, consideration: 0, conversion: 0 };
  const newAudiencePerImp = { awareness: 0, consideration: 0, conversion: 0 };

  let latestCohort: CohortMetrics | null = null;

  cohorts.forEach(c => {
    const W_i = weightMap.get(c.cohortKey) || 0;
    if (W_i <= 0) return;

    if (!latestCohort || c.endDate > latestCohort.endDate) {
      latestCohort = c;
    }

    // 1. Commerce & Intent
    const aov_i = c.aov > 0 ? c.aov : safeDiv(c.gmv, c.itemsSold);
    weightedAOV += W_i * aov_i;

    itemPerPccRatio += W_i * safeDiv(c.itemsSold, c.productCardClicks);
    clickToItemCR += W_i * (c.cr > 0 ? c.cr : safeDiv(c.itemsSold, c.clicks));
    searchPerClickRatio += W_i * safeDiv(c.searchVolume, c.clicks);

    // 2. Engagement & Attention
    pccPerPaidEngRatio += W_i * safeDiv(c.productCardClicks, c.paidEngagements);
    paidEngShare += W_i * safeDiv(c.paidEngagements, c.totalEngagements);
    organicEngShare += W_i * safeDiv(c.organicEngagements, c.totalEngagements);
    unattributedEngShare += W_i * Math.max(0, 1 - safeDiv(c.paidEngagements + c.organicEngagements, c.totalEngagements));

    touchpointToPaidEngRatio.views100 += W_i * safeDiv(c.views100, c.paidEngagements);
    touchpointToPaidEngRatio.views6s += W_i * safeDiv(c.views6s, c.paidEngagements);
    touchpointToPaidEngRatio.likes += W_i * safeDiv(c.likes, c.paidEngagements);
    touchpointToPaidEngRatio.shares += W_i * safeDiv(c.shares, c.paidEngagements);
    touchpointToPaidEngRatio.comments += W_i * safeDiv(c.comments, c.paidEngagements);

    // 3. Scale (Impressions)
    paidErRate += W_i * (c.erPct > 0 ? c.erPct : safeDiv(c.paidEngagements, c.paidImpressions));
    paidImpShare += W_i * safeDiv(c.paidImpressions, c.totalImpressions);
    organicImpShare += W_i * safeDiv(c.organicImpressions, c.totalImpressions);

    // 4. Funnel Allocation & CPM
    rawFunnelImpShare.awareness += W_i * safeDiv(c.impAwareness, c.paidImpressions);
    rawFunnelImpShare.consideration += W_i * safeDiv(c.impConsideration, c.paidImpressions);
    rawFunnelImpShare.conversion += W_i * safeDiv(c.impConversion, c.paidImpressions);

    funnelCPM.awareness += W_i * (c.cpmAwareness > 0 ? c.cpmAwareness : safeDiv(c.spendAwareness, c.impAwareness) * 1000);
    funnelCPM.consideration += W_i * (c.cpmConsideration > 0 ? c.cpmConsideration : safeDiv(c.spendConsideration, c.impConsideration) * 1000);
    funnelCPM.conversion += W_i * (c.cpmConversion > 0 ? c.cpmConversion : safeDiv(c.spendConversion, c.impConversion) * 1000);

    newAudiencePerImp.awareness += W_i * safeDiv(c.newAudienceAwareness, c.impAwareness);
    newAudiencePerImp.consideration += W_i * safeDiv(c.newAudienceConsideration, c.impConsideration);
    newAudiencePerImp.conversion += W_i * safeDiv(c.newAudienceConversion, c.impConversion);
  });

  // Normalize funnelImpShare so sum = 1.0
  const sumFunnelShares = rawFunnelImpShare.awareness + rawFunnelImpShare.consideration + rawFunnelImpShare.conversion;
  const funnelImpShare = {
    awareness: sumFunnelShares > 0 ? rawFunnelImpShare.awareness / sumFunnelShares : 0.57,
    consideration: sumFunnelShares > 0 ? rawFunnelImpShare.consideration / sumFunnelShares : 0.32,
    conversion: sumFunnelShares > 0 ? rawFunnelImpShare.conversion / sumFunnelShares : 0.11,
  };

  const resolvedLatestCohort: CohortMetrics | null = latestCohort || cohorts[0] || null;
  const latestGMV = resolvedLatestCohort ? resolvedLatestCohort.gmv : 0;
  const latestSpend = resolvedLatestCohort ? resolvedLatestCohort.totalSpend : 0;
  const latestStartDate = resolvedLatestCohort ? resolvedLatestCohort.startDate : '';
  const latestEndDate = resolvedLatestCohort ? resolvedLatestCohort.endDate : '';
  const latestCohortDays = resolvedLatestCohort
    ? Math.max(1, resolvedLatestCohort.durationDays || getDurationDays(latestStartDate, latestEndDate))
    : 30;

  let latestCohortMonthDays = 30;
  if (latestEndDate) {
    const d = parseSheetDate(latestEndDate);
    if (d && !isNaN(d.getTime())) {
      latestCohortMonthDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    }
  }

  // Non-linear pacing-aware projection based on Double Date + Payday campaign distribution:
  const pacingShares = getCumulativePacingShares(latestStartDate, latestEndDate);
  const pacingCumulativeGMV = pacingShares.cumGMV;
  const pacingCumulativeSpend = pacingShares.cumSpend;

  const dailyRunRateGMV = safeDiv(latestGMV, latestCohortDays);
  // Full-month projection: divide latest MTD GMV/Spend by cumulative pacing share (e.g. 62.4% GMV / 64.06% Spend for Oct 1-16)
  const projectedFullMonthGMV = Math.round(safeDiv(latestGMV, pacingCumulativeGMV));
  const projectedFullMonthSpend = Math.round(safeDiv(latestSpend, pacingCumulativeSpend));

  return {
    weightedAOV: weightedAOV || 100000,
    itemPerPccRatio: itemPerPccRatio || 0.01,
    clickToItemCR: clickToItemCR || 0.0125,
    searchPerClickRatio: searchPerClickRatio || 0.18,
    pccPerPaidEngRatio: pccPerPaidEngRatio || 0.042,
    paidEngShare: paidEngShare || 0.8,
    organicEngShare: organicEngShare || 0.16,
    unattributedEngShare: unattributedEngShare || 0.04,
    touchpointToPaidEngRatio,
    paidErRate: paidErRate || 0.14,
    paidImpShare: paidImpShare || 0.84,
    organicImpShare: organicImpShare || 0.16,
    funnelImpShare,
    funnelCPM,
    newAudiencePerImp,
    cohortCount: cohorts.length,
    latestGMV,
    latestStartDate,
    latestEndDate,
    latestCohortDays,
    latestCohortMonthDays,
    dailyRunRateGMV,
    projectedFullMonthGMV,
    projectedFullMonthSpend,
    pacingCumulativeGMV,
    pacingCumulativeSpend,
    weights: weightBreakdown,
  };
}

/**
 * Step C: Reverse-Funnel Target Computation
 * 
 * Computes all touchpoints, impressions, and funnel spend given targetGMV and optional overrides.
 */
export function computeReverseFunnel(
  baseline: WeightedBaselineRatios,
  targetGMV: number,
  overrides?: SimulatorOverrides
): ReverseFunnelOutput {
  const gmv = Math.max(0, targetGMV);

  // 1. GMV Scale Dynamics & ROAS Elasticity (Diminishing Marginal Returns / Scale Efficiency)
  // When target GMV scales down towards core high-intent buyers, ROAS increases significantly (8x-15x as observed in historical cohorts).
  // When target GMV scales up aggressively, efficiency normalizes due to audience saturation.
  // Reference GMV uses projected full-month baseline (since target GMV input is full-month).
  const baselineRefGMV = baseline.projectedFullMonthGMV > 0
    ? baseline.projectedFullMonthGMV
    : (baseline.latestGMV > 0 ? baseline.latestGMV : gmv);

  const scaleRatio = baselineRefGMV > 0 ? gmv / baselineRefGMV : 1.0;
  const clampedScale = Math.max(0.05, Math.min(10.0, scaleRatio));

  // Dynamic ROAS elasticity: stronger efficiency boost when scaling down (< 1.0)
  // Derived from cross-cohort TikTok shop brand data (low GMV cohorts achieve 8.5x-15x ROAS vs 5x-6x at peak scale)
  const roasElasticity = clampedScale < 1.0 ? 0.38 : 0.20;
  const roasElasticityMultiplier = Math.pow(clampedScale, -roasElasticity);
  const crElasticityMultiplier = Math.pow(clampedScale, clampedScale < 1.0 ? -0.15 : -0.08);

  // Upper Funnel (Awareness & Consideration) scaling elasticity:
  // At lower GMV targets, brands run lean performance marketing without massive cold-audience reach.
  // Upper-funnel impressions scale adaptively with super-linear elasticity (1.30) so lower targets don't carry bloated costs.
  // At baseline (clampedScale = 1.0), upperFunnelFactor is exactly 1.0000, preserving exact baseline benchmarks.
  const upperFunnelScale = clampedScale < 1.0
    ? Math.pow(clampedScale, 1.30)
    : Math.pow(clampedScale, 1.10);
  const upperFunnelFactor = clampedScale > 0 ? (upperFunnelScale / clampedScale) : 1.0;

  // 2. Funnel Allocation Mix Dynamics on Engagement Rate & 6s Video Views
  // Historical data shows Consideration delivers ~2.2x higher engagement rate and ~10x higher 6s VTR vs Awareness.
  const rawAwShare = overrides?.funnelImpShare?.awareness ?? baseline.funnelImpShare.awareness;
  const rawCoShare = overrides?.funnelImpShare?.consideration ?? baseline.funnelImpShare.consideration;
  const rawCvShare = overrides?.funnelImpShare?.conversion ?? baseline.funnelImpShare.conversion;
  const sumShares = rawAwShare + rawCoShare + rawCvShare;

  const activeFunnelImpShare = {
    awareness: sumShares > 0 ? rawAwShare / sumShares : baseline.funnelImpShare.awareness,
    consideration: sumShares > 0 ? rawCoShare / sumShares : baseline.funnelImpShare.consideration,
    conversion: sumShares > 0 ? rawCvShare / sumShares : baseline.funnelImpShare.conversion,
  };

  const activeFunnelCPM = {
    awareness: overrides?.funnelCPM?.awareness ?? baseline.funnelCPM.awareness,
    consideration: overrides?.funnelCPM?.consideration ?? baseline.funnelCPM.consideration,
    conversion: overrides?.funnelCPM?.conversion ?? baseline.funnelCPM.conversion,
  };

  // Funnel engagement weights (Consideration is primary engagement driver)
  const wAw = 0.70;
  const wCo = 2.20;
  const wCv = 0.35;
  const omegaBase = baseline.funnelImpShare.awareness * wAw + baseline.funnelImpShare.consideration * wCo + baseline.funnelImpShare.conversion * wCv;
  const omegaActive = activeFunnelImpShare.awareness * wAw + activeFunnelImpShare.consideration * wCo + activeFunnelImpShare.conversion * wCv;
  const funnelEngMultiplier = omegaBase > 0 ? omegaActive / omegaBase : 1.0;

  const activeErRate = (overrides?.paidErRate !== undefined && overrides.paidErRate > 0
    ? overrides.paidErRate
    : baseline.paidErRate) * funnelEngMultiplier;

  const activeCR = (overrides?.clickToItemCR !== undefined && overrides.clickToItemCR > 0
    ? overrides.clickToItemCR
    : baseline.clickToItemCR) * crElasticityMultiplier;

  const activeAOV = overrides?.weightedAOV !== undefined && overrides.weightedAOV > 0
    ? overrides.weightedAOV
    : baseline.weightedAOV;

  // 3. Layer 1: Commerce Layer
  const targetItemsSold = safeDiv(gmv, activeAOV);
  const targetProductCardClicks = safeDiv(targetItemsSold, baseline.itemPerPccRatio);

  // 4. Layer 2: Intent Layer
  const targetClicks = safeDiv(targetItemsSold, activeCR);
  const targetSearchVolumes = targetClicks * baseline.searchPerClickRatio;

  // 5. Layer 3: Engagement & Attention Layer
  const targetPaidEngagements = safeDiv(targetProductCardClicks, baseline.pccPerPaidEngRatio);
  const targetTotalEngagements = safeDiv(targetPaidEngagements, baseline.paidEngShare);
  const targetOrganicEngagements = targetTotalEngagements * baseline.organicEngShare;

  const views6sMultiplier = baseline.funnelImpShare.consideration > 0
    ? activeFunnelImpShare.consideration / baseline.funnelImpShare.consideration
    : 1.0;
  const effectiveViews6sRatio = baseline.touchpointToPaidEngRatio.views6s * (0.5 + 0.5 * views6sMultiplier);

  const targetTouchpoints = {
    views100: targetPaidEngagements * baseline.touchpointToPaidEngRatio.views100,
    views6s: targetPaidEngagements * effectiveViews6sRatio,
    likes: targetPaidEngagements * baseline.touchpointToPaidEngRatio.likes,
    shares: targetPaidEngagements * baseline.touchpointToPaidEngRatio.shares,
    comments: targetPaidEngagements * baseline.touchpointToPaidEngRatio.comments,
  };

  // 6. Layer 4: Scale (Impressions) Layer
  const baseTargetPaidImpressions = safeDiv(targetPaidEngagements, activeErRate);

  // Funnel Impressions:
  // Conversion impressions scale directly with conversion demand
  const cvImp = baseTargetPaidImpressions * activeFunnelImpShare.conversion;
  // Awareness and Consideration impressions adaptively scale with upperFunnelFactor
  const awImp = baseTargetPaidImpressions * activeFunnelImpShare.awareness * upperFunnelFactor;
  const coImp = baseTargetPaidImpressions * activeFunnelImpShare.consideration * upperFunnelFactor;

  const targetPaidImpressions = awImp + coImp + cvImp;
  const targetTotalImpressions = safeDiv(targetPaidImpressions, baseline.paidImpShare);
  const targetOrganicImpressions = targetTotalImpressions * baseline.organicImpShare;

  // 7. Layer 5: Funnel Spend & Audience Layer
  const awSpend = safeDiv(awImp, 1000) * activeFunnelCPM.awareness;
  const coSpend = safeDiv(coImp, 1000) * activeFunnelCPM.consideration;
  // Conversion spend incorporates ROAS elasticity (scaling efficiency when GMV target is lowered)
  const cvSpend = (safeDiv(cvImp, 1000) * activeFunnelCPM.conversion) / roasElasticityMultiplier;

  const awAudience = awImp * baseline.newAudiencePerImp.awareness;
  const coAudience = coImp * baseline.newAudiencePerImp.consideration;
  const cvAudience = cvImp * baseline.newAudiencePerImp.conversion;

  const totalRequiredSpend = awSpend + coSpend + cvSpend;
  const conversionROAS = safeDiv(gmv, cvSpend);
  const blendedROAS = safeDiv(gmv, totalRequiredSpend);
  // User specification: ROAS should be calculated strictly from conversion spend
  const projectedROAS = conversionROAS;

  const awarenessStage: FunnelOutputStage = {
    stage: 'Awareness',
    impSharePct: activeFunnelImpShare.awareness * 100,
    requiredImpressions: awImp,
    cpm: activeFunnelCPM.awareness,
    requiredSpend: awSpend,
    spendSharePct: safeDiv(awSpend, totalRequiredSpend) * 100,
    projectedNewAudience: awAudience,
  };

  const considerationStage: FunnelOutputStage = {
    stage: 'Consideration',
    impSharePct: activeFunnelImpShare.consideration * 100,
    requiredImpressions: coImp,
    cpm: activeFunnelCPM.consideration,
    requiredSpend: coSpend,
    spendSharePct: safeDiv(coSpend, totalRequiredSpend) * 100,
    projectedNewAudience: coAudience,
  };

  const conversionStage: FunnelOutputStage = {
    stage: 'Conversion',
    impSharePct: activeFunnelImpShare.conversion * 100,
    requiredImpressions: cvImp,
    cpm: activeFunnelCPM.conversion,
    requiredSpend: cvSpend,
    spendSharePct: safeDiv(cvSpend, totalRequiredSpend) * 100,
    projectedNewAudience: cvAudience,
  };

  const blendedCPM = targetPaidImpressions > 0 ? (totalRequiredSpend / targetPaidImpressions) * 1000 : 0;

  return {
    targetGMV: gmv,
    totalRequiredSpend,
    projectedROAS,
    conversionROAS,
    blendedROAS,
    requiredPaidImpressions: targetPaidImpressions,
    requiredPaidEngagements: targetPaidEngagements,
    requiredItemsSold: targetItemsSold,
    targetItemsSold,
    targetProductCardClicks,
    targetClicks,
    targetSearchVolumes,
    targetPaidEngagements,
    targetTotalEngagements,
    targetOrganicEngagements,
    targetTouchpoints,
    targetPaidImpressions,
    targetTotalImpressions,
    targetOrganicImpressions,
    funnelStages: {
      awareness: awarenessStage,
      consideration: considerationStage,
      conversion: conversionStage,
    },
    activeRatios: {
      aov: activeAOV,
      cr: activeCR,
      erRate: activeErRate,
      funnelImpShare: activeFunnelImpShare,
      funnelCPM: activeFunnelCPM,
    },
    dynamics: {
      scaleRatio,
      roasElasticityMultiplier,
      funnelEngMultiplier,
      effectiveErRate: activeErRate,
      blendedCPM,
    },
  };
}

/**
 * Extracts list of unique, valid brands from rawData
 */
export function extractAvailableBrands(rawData: any[]): string[] {
  if (!Array.isArray(rawData)) return [];
  const set = new Set<string>();
  rawData.forEach(row => {
    const b = String(row['Brand'] || row['Brand fx'] || '').trim();
    if (isValidBrandName(b)) {
      set.add(b);
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Fuzzy brand matching across sheets:
 * Handles variations like 'Wardah PC' <-> 'Wardah', 'Earth' <-> 'Earth Love Life'.
 */
export function isBrandMatch(rowBrand: any, targetBrand: any): boolean {
  const cleanA = String(rowBrand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = String(targetBrand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  return false;
}

function cleanStr(val: any): string {
  return String(val || '').toLowerCase().trim();
}

function findVal(row: any, keys: string[]): any {
  for (const k of keys) {
    const matchedKey = Object.keys(row).find(
      existing => existing.toLowerCase().trim() === k.toLowerCase().trim()
    );
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
      return row[matchedKey];
    }
  }
  return '';
}

/**
 * Extracts all historical CohortMetrics for a selected brand across the provided signalPeriods.
 * Always isolates performance to the specific selected brand (never blending all brands).
 */
export function extractAllBrandCohorts(
  rawData: any[],
  extraSheetsData: { mediaApi?: any[]; commerce?: any[] },
  targetBrand: string,
  signalPeriods: Array<{ start: string; end: string; key: string; label: string }>
): CohortMetrics[] {
  if (!Array.isArray(rawData) || !Array.isArray(signalPeriods) || signalPeriods.length === 0) {
    return [];
  }

  // Ensure historical performance is strictly isolated to a specific brand, never blending all brands.
  let effectiveBrand = targetBrand;
  if (!effectiveBrand || cleanStr(effectiveBrand) === 'all' || cleanStr(effectiveBrand) === 'all brands') {
    const brands = extractAvailableBrands(rawData);
    effectiveBrand = brands[0] || 'Earth';
  }

  const cohorts: CohortMetrics[] = [];

  signalPeriods.forEach(period => {
    const pStart = parseSheetDate(period.start);
    if (pStart) pStart.setHours(0, 0, 0, 0);
    const pEnd = parseSheetDate(period.end);
    if (pEnd) pEnd.setHours(23, 59, 59, 999);

    // 1. Filter rawData (Media Signal sheet) strictly for effectiveBrand
    const signalSubset = rawData.filter(row => {
      const b = row['Brand'];
      if (!isBrandMatch(b, effectiveBrand)) return false;
      const s = toYMD(row['Start Date'] || row['start_date']);
      const e = toYMD(row['End Date'] || row['end_date']);
      if (s !== period.start || e !== period.end) return false;

      const statusVal = cleanStr(findVal(row, ['Status', 'status', 'Type']));
      return statusVal.includes('actual') || (!statusVal.includes('plan') && statusVal !== '');
    });

    if (signalSubset.length === 0) {
      return;
    }

    const sumSignal = (keys: string[]) => {
      return signalSubset.reduce((acc, row) => acc + parseNum(findVal(row, keys)), 0);
    };

    const impressions = sumSignal(['Impressions', 'Total Impressions']);
    const paidImpressions = sumSignal(['Paid Impressions']);
    const organicImpressions = sumSignal(['Organic Impressions']);
    const engagements = sumSignal(['Engagements', 'Total Engagements']);
    const paidEngagements = sumSignal(['Paid Engagements']);
    const organicEngagements = sumSignal(['Organic Engagements']);
    const views100 = sumSignal(['Video Views At 100', 'Video Views At 100%', 'video_views_at_100']);
    const views6s = sumSignal(['6 Sec Video Views', '6-sec Video Views', '6_sec_video_views']);
    const shares = sumSignal(['Shares']);
    const comments = sumSignal(['Comments']);
    const likes = sumSignal(['Likes']);
    const clicks = sumSignal(['Clicks']);
    const searchVolume = sumSignal(['Search Volume', 'Search Volumes', 'search_volume']);
    const productCardClicks = sumSignal(['Product Card Clicks', 'product_card_clicks']);
    const newAwareness = sumSignal(['New Awareness Audience', 'new_awareness_audience']);
    const newConsideration = sumSignal(['New Consideration Audience', 'new_consideration_audience']);
    const newConversion = sumSignal(['New Conversion Audience', 'new_conversion_audience']);

    let spendAwareness = 0;
    let spendConsideration = 0;
    let spendConversionMedia = 0;
    let totalMediaSpend = 0;
    let impAwareness = 0;
    let impConsideration = 0;

    // 2. Aggregate TikTok Media API (Awareness & Consideration strictly TikTok platform and effectiveBrand only)
    if (extraSheetsData.mediaApi && extraSheetsData.mediaApi.length > 0 && pStart && pEnd) {
      extraSheetsData.mediaApi.forEach(row => {
        const plat = cleanStr(row['Platform'] || row['platform'] || row['Channel'] || row['channel']);
        const b = row['Brand'] || row['Brand fx'] || row['brand'];
        // Strictly TikTok platform only
        if (!plat.includes('tiktok')) return;
        if (!isBrandMatch(b, effectiveBrand)) return;
        const rDate = parseSheetDate(row['Date'] || row['date']);
        if (!rDate || rDate < pStart || rDate > pEnd) return;

        const f = cleanStr(row['Funnel'] || row['KPI'] || row['funnel'] || row['kpi']);
        const s = parseNum(row['Ad Spend'] || row['Spend'] || row['Expense'] || row['spend'] || row['ad_spend']);
        const i = parseNum(row['Impressions'] || row['Impression'] || row['impressions']);

        totalMediaSpend += s;
        if (f.includes('awareness')) {
          spendAwareness += s;
          impAwareness += i;
        } else if (f.includes('consideration')) {
          spendConsideration += s;
          impConsideration += i;
        } else if (f.includes('conversion')) {
          spendConversionMedia += s;
        }
      });
    }

    // 3. Aggregate TikTok Commerce (TikTok Shop GMV & Orders strictly effectiveBrand only)
    let gmvCommerce = 0;
    let itemsSold = 0;
    let spendConversionComm = 0;

    if (extraSheetsData.commerce && extraSheetsData.commerce.length > 0 && pStart && pEnd) {
      extraSheetsData.commerce.forEach(row => {
        const plat = cleanStr(row['Platform'] || row['platform'] || row['Channel'] || row['channel']);
        const b = row['Brand fx'] || row['Brand'] || row['brand'];
        // Strictly TikTok Shop only
        if (!plat.includes('tiktok')) return;
        if (!isBrandMatch(b, effectiveBrand)) return;
        const rDate = parseSheetDate(row['Date'] || row['date']);
        if (!rDate || rDate < pStart || rDate > pEnd) return;

        gmvCommerce += parseNum(row['GMV'] || row['gmv']);
        itemsSold +=
          parseNum(row['Items Sold']) ||
          parseNum(row['Item sold']) ||
          parseNum(row['items_sold']) ||
          parseNum(row['Orders']) ||
          parseNum(row['orders']);
        spendConversionComm += parseNum(row['Expense'] || row['expense'] || row['Ad Spend']);
      });
    }

    const gmv = gmvCommerce || sumSignal(['GMV Ads', 'gmv_ads', 'GMV']);
    const finalItemsSold = itemsSold || sumSignal(['Items Sold', 'Item sold', 'items_sold', 'Orders']);
    const spendConversion = spendConversionComm || spendConversionMedia || sumSignal(['Spend Conversion', 'spend_conversion']);
    const impConversion = Math.max(0, paidImpressions - impAwareness - impConsideration);
    const totalSpend = Math.max(spendAwareness + spendConsideration + spendConversion, totalMediaSpend) || sumSignal(['Total TikTok Spend', 'Total TikTok', 'Ad Spend', 'Spend', 'total_spend']);

    const aov = finalItemsSold > 0 ? gmv / finalItemsSold : 0;
    const cr = clicks > 0 ? finalItemsSold / clicks : 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const vtr = paidImpressions > 0 ? views6s / paidImpressions : 0;
    const erPct = paidImpressions > 0 ? paidEngagements / paidImpressions : 0;

    const cpmAwareness = impAwareness > 0 ? (spendAwareness / impAwareness) * 1000 : 0;
    const cpmConsideration = impConsideration > 0 ? (spendConsideration / impConsideration) * 1000 : 0;
    const cpmConversion = impConversion > 0 ? (spendConversion / impConversion) * 1000 : 0;

    const durationDays = getDurationDays(period.start, period.end);

    cohorts.push({
      cohortKey: period.key,
      startDate: period.start,
      endDate: period.end,
      durationDays,
      brand: targetBrand,
      gmv,
      aov,
      itemsSold: finalItemsSold,
      cr,
      productCardClicks,
      clicks,
      searchVolume,
      totalEngagements: engagements,
      paidEngagements,
      organicEngagements,
      pctOrganicEng: engagements > 0 ? organicEngagements / engagements : 0,
      views100,
      views6s,
      shares,
      comments,
      likes,
      totalImpressions: impressions,
      paidImpressions,
      organicImpressions,
      pctOrganicImp: impressions > 0 ? organicImpressions / impressions : 0,
      ctr,
      vtr,
      erPct,
      newAudienceAwareness: newAwareness,
      newAudienceConsideration: newConsideration,
      newAudienceConversion: newConversion,
      impAwareness,
      cpmAwareness,
      impConsideration,
      cpmConsideration,
      impConversion,
      cpmConversion,
      spendAwareness,
      spendConsideration,
      spendConversion,
      totalSpend,
    });
  });

  return cohorts.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
}
