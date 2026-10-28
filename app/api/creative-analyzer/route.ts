import { NextResponse } from 'next/server';
import {
  buildCohortId,
  classifyCreativeCohort,
  RawCreativeInput,
} from '@/lib/creative-classifier';
import {
  getAllCachedCreativeLearnings,
  getCachedLearningByCohort,
  upsertCachedCreativeLearning,
} from '@/lib/sheets-ai-cache';
import {
  analyzeCreativeCohortWithGemini,
  selectTopCreativesForPrompt,
} from '@/lib/gemini-creative-analyzer';

// In-memory lock so concurrent browser requests for the same cohort never trigger duplicate calls
const inFlightCohortLocks = new Map<string, Promise<any>>();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand') || '';
    const adType = searchParams.get('adType') || '';
    const format = searchParams.get('format') || '';
    const weekKey = searchParams.get('weekKey') || '';
    const explicitCohortId = searchParams.get('cohortId') || '';

    const allCached = await getAllCachedCreativeLearnings();

    const targetCohortId =
      explicitCohortId ||
      (brand || adType || weekKey || format
        ? buildCohortId(brand || 'ALL', adType || 'ALL', weekKey || 'CURRENT', format)
        : '');

    const matchedRow = targetCohortId
      ? allCached.find(r => r.cohort_id.toUpperCase() === targetCohortId.toUpperCase()) || null
      : null;

    return NextResponse.json({
      success: true,
      cohortId: targetCohortId,
      cachedRow: matchedRow,
      cachedCohorts: allCached.map(r => ({
        cohort_id: r.cohort_id,
        creative_signature_hash: r.creative_signature_hash,
        brand: r.brand,
        ad_type: r.ad_type,
        week_key: r.week_key,
        analyzed_at: r.analyzed_at,
        ai_report_markdown: r.ai_report_markdown,
        classified_creatives_json: r.classified_creatives_json,
      })),
    });
  } catch (error: any) {
    console.error('[GET /api/creative-analyzer] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to read cached learnings from Google Sheets.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      brand = 'All Brands',
      adType = 'All Ad Types',
      format = 'All Formats',
      weekKey = 'Current Period',
      creatives = [] as RawCreativeInput[],
      forceRefresh = false,
      customApiKey = '',
      userRole = 'planner',
    } = body;

    if (userRole === 'viewer') {
      return NextResponse.json(
        {
          success: false,
          error: 'Viewer access does not have permission to generate AI insights.',
        },
        { status: 403 }
      );
    }

    if (!Array.isArray(creatives) || creatives.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No creative rows found in the selected Brand / Ad Type / Format / Week cohort.',
        },
        { status: 400 }
      );
    }

    // 1. Run deterministic Spend-Weighted classifier conditioned on Brand + Ad Type/KPI + Format
    const cohortResult = classifyCreativeCohort(creatives, {
      brandLabel: brand,
      adTypeLabel: adType,
      formatLabel: format,
      weekKey,
      groupByBrandAndAdType: true,
    });

    const { cohortId, creativeSignatureHash } = cohortResult;

    // 2. Check Google Sheets cache first
    const existingRow = await getCachedLearningByCohort(cohortId);
    if (
      existingRow &&
      existingRow.creative_signature_hash === creativeSignatureHash &&
      existingRow.ai_report_markdown &&
      !forceRefresh
    ) {
      return NextResponse.json({
        success: true,
        cacheStatus: 'HIT',
        reason: 'Cohort creative_signature_hash matches cached Google Sheets record.',
        cohortId,
        creativeSignatureHash,
        cachedRow: existingRow,
        classification: cohortResult,
      });
    }

    // 3. New top creatives detected (or forceRefresh requested) — deduplicate concurrent requests via in-memory lock
    const lockKey = `${cohortId}__${creativeSignatureHash}__${forceRefresh ? 'force' : 'auto'}`;
    if (inFlightCohortLocks.has(lockKey)) {
      const sharedResult = await inFlightCohortLocks.get(lockKey)!;
      return NextResponse.json(sharedResult);
    }

    const taskPromise = (async () => {
      const analysis = await analyzeCreativeCohortWithGemini(cohortResult, {
        customApiKey,
      });

      const selectedSummary = selectTopCreativesForPrompt(cohortResult);
      const compactJson = JSON.stringify({
        benchmarks: cohortResult.benchmarks,
        counts: cohortResult.counts,
        topWinners: selectedSummary.topWinners.map(c => ({
          id: c.id,
          creativeName: c.creativeName,
          adGroup: c.adGroup,
          pillar: c.pillar,
          brand: c.brand,
          platform: c.platform,
          adType: c.adType,
          kpi: c.kpi,
          format: c.format,
          creativeLink: c.creativeLink,
          status: c.status,
          statusLabel: c.statusLabel,
          qrVsMedianPct: Number(c.qrVsMedianPct.toFixed(1)),
          weightedQualityPct: Number(c.metrics.weightedQualityPct.toFixed(2)),
          spend: Math.round(c.metrics.spend),
          medianSpend: Math.round(c.benchmarks.medianSpend),
          medianQRPct: Number((c.benchmarks.medianQR * 100).toFixed(2)),
          impressions: Math.round(c.metrics.impressions),
          clicks: Math.round(c.metrics.clicks),
          views6s: Math.round(c.metrics.views6s),
          views15s: Math.round(c.metrics.views15s),
          purchase: Math.round(c.metrics.purchase || 0),
          gmv: Math.round(c.metrics.gmv || 0),
          roas: Number((c.metrics.roas || 0).toFixed(2)),
          cr: Number((c.metrics.cr || 0).toFixed(2)),
          qualityRatePct: Number(c.metrics.qualityRatePct.toFixed(2)),
          retention6sTo15s: Number(c.metrics.retention6sTo15s.toFixed(2)),
          vtr6s: Number(c.metrics.vtr6s.toFixed(2)),
          vtr15s: Number(c.metrics.vtr15s.toFixed(2)),
          ctr: Number(c.metrics.ctr.toFixed(2)),
          cpm: Math.round(c.metrics.cpm),
        })),
      });

      const nowIso = new Date().toISOString();
      const savedRow = await upsertCachedCreativeLearning({
        cohort_id: cohortId,
        creative_signature_hash: creativeSignatureHash,
        brand,
        ad_type: format && format !== 'All Formats' ? `${adType} | ${format}` : adType,
        week_key: weekKey,
        analyzed_at: nowIso,
        classified_creatives_json: compactJson,
        ai_report_markdown: analysis.markdown,
      });

      return {
        success: true,
        cacheStatus: existingRow ? 'UPDATED_NEW_CREATIVES' : 'CREATED_NEW_COHORT',
        modelUsed: analysis.modelUsed,
        cohortId,
        creativeSignatureHash,
        cachedRow: savedRow,
        classification: cohortResult,
      };
    })();

    inFlightCohortLocks.set(lockKey, taskPromise);

    try {
      const responsePayload = await taskPromise;
      return NextResponse.json(responsePayload);
    } finally {
      inFlightCohortLocks.delete(lockKey);
    }
  } catch (error: any) {
    console.error('[POST /api/creative-analyzer] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to analyze creative cohort.',
      },
      { status: 500 }
    );
  }
}
