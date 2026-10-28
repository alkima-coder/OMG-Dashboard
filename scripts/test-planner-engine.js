/**
 * Unit Test Benchmark Verification for Reverse-Funnel Media Planning Simulator
 * Validates against Section 5 benchmark data (2026-10-01 to 2026-10-16)
 */

function safeDiv(num, denom, fallback = 0) {
  if (!denom || isNaN(denom) || denom === 0) return fallback;
  const res = num / denom;
  return isNaN(res) || !isFinite(res) ? fallback : res;
}

function computeTimeDecayWeights(cohorts, settings) {
  if (cohorts.length === 0) return [];
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

  const rawList = cohorts.map(c => {
    const dEnd = new Date(c.endDate).getTime();
    const ageDays = isNaN(dEnd) || isNaN(maxTime)
      ? 0
      : Math.max(0, Math.round((maxTime - dEnd) / (1000 * 60 * 60 * 24)));
    const D_i = settings.useDurationNormalization ? (c.durationDays || 1) : 1;
    let timeDecayFactor = 1.0;
    if (settings.decayMode === 'exponential') {
      timeDecayFactor = Math.exp(-ln2OverH * ageDays);
    } else if (settings.decayMode === 'linear') {
      timeDecayFactor = Math.max(0.01, 1 - ageDays / (2 * H));
    } else {
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

function computeWeightedBaselineRatios(cohorts, settings) {
  const weightBreakdown = computeTimeDecayWeights(cohorts, settings);
  const weightMap = new Map();
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

  let latestGMV = 0;
  let latestEndDate = '';

  cohorts.forEach(c => {
    const W_i = weightMap.get(c.cohortKey) || 0;
    if (W_i <= 0) return;

    if (!latestEndDate || c.endDate > latestEndDate) {
      latestEndDate = c.endDate;
      latestGMV = c.gmv;
    }

    const aov_i = c.aov > 0 ? c.aov : safeDiv(c.gmv, c.itemsSold);
    weightedAOV += W_i * aov_i;

    itemPerPccRatio += W_i * safeDiv(c.itemsSold, c.productCardClicks);
    clickToItemCR += W_i * (c.cr > 0 ? c.cr : safeDiv(c.itemsSold, c.clicks));
    searchPerClickRatio += W_i * safeDiv(c.searchVolume, c.clicks);

    pccPerPaidEngRatio += W_i * safeDiv(c.productCardClicks, c.paidEngagements);
    paidEngShare += W_i * safeDiv(c.paidEngagements, c.totalEngagements);
    organicEngShare += W_i * safeDiv(c.organicEngagements, c.totalEngagements);
    unattributedEngShare += W_i * Math.max(0, 1 - safeDiv(c.paidEngagements + c.organicEngagements, c.totalEngagements));

    touchpointToPaidEngRatio.views100 += W_i * safeDiv(c.views100, c.paidEngagements);
    touchpointToPaidEngRatio.views6s += W_i * safeDiv(c.views6s, c.paidEngagements);
    touchpointToPaidEngRatio.likes += W_i * safeDiv(c.likes, c.paidEngagements);
    touchpointToPaidEngRatio.shares += W_i * safeDiv(c.shares, c.paidEngagements);
    touchpointToPaidEngRatio.comments += W_i * safeDiv(c.comments, c.paidEngagements);

    paidErRate += W_i * (c.erPct > 0 ? c.erPct : safeDiv(c.paidEngagements, c.paidImpressions));
    paidImpShare += W_i * safeDiv(c.paidImpressions, c.totalImpressions);
    organicImpShare += W_i * safeDiv(c.organicImpressions, c.totalImpressions);

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

  const sumFunnelShares = rawFunnelImpShare.awareness + rawFunnelImpShare.consideration + rawFunnelImpShare.conversion;
  const funnelImpShare = {
    awareness: sumFunnelShares > 0 ? rawFunnelImpShare.awareness / sumFunnelShares : 0.57,
    consideration: sumFunnelShares > 0 ? rawFunnelImpShare.consideration / sumFunnelShares : 0.32,
    conversion: sumFunnelShares > 0 ? rawFunnelImpShare.conversion / sumFunnelShares : 0.11,
  };

  return {
    weightedAOV,
    itemPerPccRatio,
    clickToItemCR,
    searchPerClickRatio,
    pccPerPaidEngRatio,
    paidEngShare,
    organicEngShare,
    unattributedEngShare,
    touchpointToPaidEngRatio,
    paidErRate,
    paidImpShare,
    organicImpShare,
    funnelImpShare,
    funnelCPM,
    newAudiencePerImp,
    cohortCount: cohorts.length,
    latestGMV,
    weights: weightBreakdown,
  };
}

function computeReverseFunnel(baseline, targetGMV, overrides) {
  const gmv = Math.max(0, targetGMV);
  const baselineRefGMV = baseline.latestGMV > 0 ? baseline.latestGMV : gmv;
  const scaleRatio = baselineRefGMV > 0 ? gmv / baselineRefGMV : 1.0;
  const clampedScale = Math.max(0.1, Math.min(10.0, scaleRatio));
  const roasElasticity = 0.18;
  const roasElasticityMultiplier = Math.pow(clampedScale, -roasElasticity);
  const crElasticityMultiplier = Math.pow(clampedScale, -0.10);

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

  const activeAOV = overrides?.weightedAOV ?? baseline.weightedAOV;

  const targetItemsSold = safeDiv(gmv, activeAOV);
  const targetProductCardClicks = safeDiv(targetItemsSold, baseline.itemPerPccRatio);
  const targetClicks = safeDiv(targetItemsSold, activeCR);
  const targetSearchVolumes = targetClicks * baseline.searchPerClickRatio;

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

  const targetPaidImpressions = safeDiv(targetPaidEngagements, activeErRate);
  const targetTotalImpressions = safeDiv(targetPaidImpressions, baseline.paidImpShare);
  const targetOrganicImpressions = targetTotalImpressions * baseline.organicImpShare;

  const awImp = targetPaidImpressions * activeFunnelImpShare.awareness;
  const coImp = targetPaidImpressions * activeFunnelImpShare.consideration;
  const cvImp = targetPaidImpressions * activeFunnelImpShare.conversion;

  const awSpend = safeDiv(awImp, 1000) * activeFunnelCPM.awareness;
  const coSpend = safeDiv(coImp, 1000) * activeFunnelCPM.consideration;
  const cvSpend = (safeDiv(cvImp, 1000) * activeFunnelCPM.conversion) / roasElasticityMultiplier;

  const totalRequiredSpend = awSpend + coSpend + cvSpend;

  return {
    targetGMV: gmv,
    totalRequiredSpend,
    targetItemsSold,
    targetProductCardClicks,
    targetClicks,
    targetSearchVolumes,
    targetPaidEngagements,
    targetTotalEngagements,
    targetPaidImpressions,
    targetTotalImpressions,
    targetTouchpoints,
    funnelStages: {
      awareness: { requiredSpend: awSpend },
      consideration: { requiredSpend: coSpend },
      conversion: { requiredSpend: cvSpend },
    },
  };
}

const benchmarkCohort = {
  cohortKey: '2026-10-01_to_2026-10-16',
  startDate: '2026-10-01',
  endDate: '2026-10-16',
  durationDays: 16,
  brand: 'Wardah',
  gmv: 320244795,
  aov: 111080.400624,
  itemsSold: 2883,
  cr: 0.012537,
  productCardClicks: 324754,
  clicks: 229959,
  searchVolume: 43290,
  totalEngagements: 9614067,
  paidEngagements: 7700265,
  organicEngagements: 1545758,
  pctOrganicEng: 0.160781,
  views100: 3384504,
  views6s: 4990147,
  shares: 45608,
  comments: 3566,
  likes: 592239,
  totalImpressions: 65142446,
  paidImpressions: 54799208,
  organicImpressions: 10343238,
  pctOrganicImp: 0.158779,
  ctr: 0.00353,
  vtr: 0.091062,
  erPct: 0.140518,
  newAudienceAwareness: 9447665,
  newAudienceConsideration: 521949,
  newAudienceConversion: 1998,
  impAwareness: 31261144,
  cpmAwareness: 1527.680465,
  impConsideration: 17684415,
  cpmConsideration: 3658.429583,
  impConversion: 5853649,
  cpmConversion: 9091.963321,
  spendAwareness: 47757039,
  spendConsideration: 64697187,
  spendConversion: 53221162,
  totalSpend: 165675388,
};

const settings = {
  halfLifeDays: 30,
  decayMode: 'exponential',
  useDurationNormalization: true,
};

const baseline = computeWeightedBaselineRatios([benchmarkCohort], settings);
const output = computeReverseFunnel(baseline, 320244795);

console.log('--- REVERSE-FUNNEL UNIT TEST BENCHMARK ---');
function check(name, actual, expected, tolPct = 0.01) {
  const diffPct = Math.abs((actual - expected) / expected) * 100;
  const passed = diffPct <= tolPct;
  console.log(
    `${passed ? '✓' : '✗'} ${name}: Actual = ${actual.toLocaleString('en-US', { maximumFractionDigits: 2 })}, Expected = ${expected.toLocaleString('en-US', { maximumFractionDigits: 2 })} (Diff = ${diffPct.toFixed(4)}%)`
  );
  if (!passed) {
    throw new Error(`Benchmark check failed for ${name}! Diff = ${diffPct.toFixed(4)}% exceeds ${tolPct}%`);
  }
}

check('targetItemsSold', output.targetItemsSold, 2883);
check('targetProductCardClicks', output.targetProductCardClicks, 324754);
check('targetClicks', output.targetClicks, 229959);
check('targetPaidEngagements', output.targetPaidEngagements, 7700265);
check('targetTotalEngagements', output.targetTotalEngagements, 9614067);
check('targetPaidImpressions', output.targetPaidImpressions, 54799208);
check('targetTotalImpressions', output.targetTotalImpressions, 65142446);
check('targetFunnelSpend.Awareness', output.funnelStages.awareness.requiredSpend, 47757039);
check('targetFunnelSpend.Consideration', output.funnelStages.consideration.requiredSpend, 64697187);
check('targetFunnelSpend.Conversion', output.funnelStages.conversion.requiredSpend, 53221162);
check('totalRequiredSpend', output.totalRequiredSpend, 165675388);
const conversionROAS = safeDiv(output.targetGMV, output.funnelStages.conversion.requiredSpend);
check('conversionROAS (GMV / Conv Spend)', conversionROAS, 6.01725);

console.log('\nALL 12 BENCHMARK VERIFICATION CHECKS PASSED PERFECTLY!');

