import React, { useRef, useEffect, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { Table, TableHeader, TableRow, TableHead, TableBody } from '@/components/tables/PlatformTable';
import { formatIDR, formatNum, formatPct, renderGR, parseNum, getGrHTML } from '@/lib/formatters';
import { CONFIG } from '@/lib/config';
import { isCpasSalesAdType } from '@/lib/creative-classifier';

interface DigitalMediaViewProps {
  mediaKPIs: any;
  dashboardContext: string;
  setDashboardContext: (c: string) => void;
  granularity: string;
  isDarkMode: boolean;
  chartTypeEngine: 'combo' | 'bar' | 'line';
  setChartTypeEngine: (t: 'combo' | 'bar' | 'line') => void;
  chartMetricsMedia: string[];
  handleToggleMetric: (engine: 'media' | 'commerce', value: string) => void;
  ctxCurData: any[];
  ctxPrevData: any[];
  ctxChartData: any[];
  globalDates: any;
  tableColFilter1: string;
  setTableColFilter1: (v: string) => void;
  tableColFilter2: string;
  setTableColFilter2: (v: string) => void;
  onSwitchSubPage?: (subPage: 'media' | 'creativeReport') => void;
}

export default function DigitalMediaView({
  mediaKPIs,
  dashboardContext,
  setDashboardContext,
  granularity,
  isDarkMode,
  chartTypeEngine,
  setChartTypeEngine,
  chartMetricsMedia,
  handleToggleMetric,
  ctxCurData,
  ctxPrevData,
  ctxChartData,
  globalDates,
  tableColFilter1,
  setTableColFilter1,
  tableColFilter2,
  setTableColFilter2,
  onSwitchSubPage
}: DigitalMediaViewProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const groupedData: Record<string, any> = {};

    if (granularity === 'weekly' && globalDates) {
      const weeksFound = new Set<string>();
      ctxCurData.forEach(r => { if (r.bucket && r.bucket.startsWith('W')) weeksFound.add(r.bucket); });
      ctxPrevData.forEach(r => { if (r.bucket && r.bucket.startsWith('W')) weeksFound.add(r.bucket); });
      const weeks = Array.from(weeksFound).sort((a, b) => parseInt(a.replace('W','')) - parseInt(b.replace('W','')));

      const appendMtdSeries = (data: any[], periodStart: Date, periodEnd: Date) => {
        const running = { spend: 0, imp: 0, clicks: 0, views: 0 };
        weeks.forEach(w => {
          const weekNum = parseInt(w.replace('W', ''));
          const periodDate = new Date(periodStart);
          periodDate.setDate(periodDate.getDate() + (weekNum * 7) - 1);
          if (periodDate > periodEnd) periodDate.setTime(periodEnd.getTime());

          data.filter(r => r.bucket === w).forEach(row => {
            running.spend += parseNum(row['Ad Spend']);
            running.imp += parseNum(row['Impressions']);
            running.clicks += parseNum(row['Combined Clicks']);
            running.views += parseNum(row['Views']) + parseNum(row['Views 6s']);
          });

          const fmtStr = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
          groupedData[`MTD ${fmtStr(periodDate)}`] = { ...running };
        });
      };

      appendMtdSeries(ctxPrevData, globalDates.prevStart, globalDates.prevMtdEnd);
      appendMtdSeries(ctxCurData, globalDates.curStart, globalDates.curMtdEnd);
    } else {
      const sortedData = [...ctxChartData].sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
      sortedData.forEach(row => {
        const d = row.parsedDate;
        let label = "";
        if (granularity === 'monthly') {
          const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          label = `${mNames[d.getMonth()]} ${d.getFullYear()}`;
        } else {
          label = `${d.getDate()}/${d.getMonth()+1}`;
        }

        if (!groupedData[label]) groupedData[label] = { spend: 0, imp: 0, clicks: 0, views: 0 };
        groupedData[label].spend += parseNum(row['Ad Spend']);
        groupedData[label].imp += parseNum(row['Impressions']);
        groupedData[label].clicks += parseNum(row['Combined Clicks']);
        groupedData[label].views += parseNum(row['Views']) + parseNum(row['Views 6s']);
      });
    }

    const labels = Object.keys(groupedData);
    if (labels.length === 0) return;
    const datasets: any[] = [];
    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    const configs: any = {
      'spend': { label: 'Spend', data: labels.map(l => groupedData[l].spend), color: '#4f46e5', bg: '#4f46e5', defaultType: 'bar' },
      'imp': { label: 'Impr', data: labels.map(l => groupedData[l].imp), color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', defaultType: 'line' },
      'clicks': { label: 'Clicks', data: labels.map(l => groupedData[l].clicks), color: '#84cc16', bg: 'transparent', defaultType: 'line' },
      'views': { label: 'Views', data: labels.map(l => groupedData[l].views), color: '#f59e0b', bg: 'transparent', defaultType: 'line' },
      'ctr': { label: 'CTR', data: labels.map(l => groupedData[l].imp>0 ? (groupedData[l].clicks/groupedData[l].imp)*100 : 0), color: '#ec4899', bg: 'transparent', defaultType: 'line' },
      'vtr': { label: 'VTR', data: labels.map(l => groupedData[l].imp>0 ? (groupedData[l].views/groupedData[l].imp)*100 : 0), color: '#06b6d4', bg: 'transparent', defaultType: 'line' }
    };

    chartMetricsMedia.forEach((key, idx) => {
      const c = configs[key];
      const assignedType = chartTypeEngine === 'combo' ? c.defaultType : chartTypeEngine;
      datasets.push({
        label: c.label,
        data: c.data,
        type: assignedType,
        backgroundColor: c.bg,
        borderColor: c.color,
        yAxisID: idx === 0 ? 'y' : 'y1',
        tension: 0.4,
        fill: assignedType === 'line' && key === 'imp',
        borderWidth: 3,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderRadius: assignedType === 'bar' ? 6 : 0
      });
    });

    chartInstance.current = new Chart(ctx, {
      type: chartTypeEngine === 'line' ? 'line' : 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: 'easeInOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: { 
          legend: { 
            position: 'bottom', 
            labels: { 
              usePointStyle: true, 
              pointStyle: 'rectRounded', 
              boxWidth: 16, 
              boxHeight: 6,
              color: isDarkMode ? '#cbd5e1' : '#475569'
            } 
          },
          tooltip: { animation: { duration: 0 } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b' } },
          y: { type: 'linear', display: true, position: 'left', grid: { color: isDarkMode ? '#334155' : '#e2e8f0' }, border: { dash: [4, 4] }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b' } },
          y1: { type: 'linear', display: datasets.length > 1, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b' } }
        }
      }
    });

    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [ctxChartData, ctxCurData, ctxPrevData, globalDates, chartMetricsMedia, granularity, isDarkMode, chartTypeEngine]);

  const generatePlatformSummaryBodyHTML = useCallback(() => {
    const filterPlatform = (rows: any[], plat: 'Overall' | 'Meta' | 'TikTok') => {
      if (plat === 'Overall') return rows;
      return rows.filter(r => {
        const p = String(r[CONFIG.media.colPlatform] || '').toLowerCase();
        if (plat === 'Meta') return p.includes('meta') || p.includes('facebook') || p.includes('ig') || p.includes('instagram');
        return p.includes('tiktok');
      });
    };

    const calcSum = (rows: any[]) => {
      let spend = 0, imp = 0, clicks = 0, v6 = 0, v15 = 0, gmv = 0, purchase = 0;
      rows.forEach(r => {
        spend += parseNum(r['Ad Spend'] || r['Spend']);
        imp += parseNum(r['Impressions'] || r['Impression']);
        clicks += parseNum(r['Combined Clicks'] || r['Clicks']);
        v6 += parseNum(r['Views 6s'] || r['6s View']);
        v15 += parseNum(r['Views'] || r['15s View']);
        gmv += parseNum(r['GMV'] || r['gmv']);
        purchase += parseNum(
          r['Purchases With Shared Items'] ||
          r['Purchase'] ||
          r['Purchases'] ||
          r['purchase']
        );
      });
      return {
        spend,
        imp,
        clicks,
        v6,
        v15,
        gmv,
        purchase,
        cpm: imp > 0 ? (spend / imp) * 1000 : 0,
        ctr: imp > 0 ? clicks / imp : 0,
        vtr6: imp > 0 ? v6 / imp : 0,
        vtr15: imp > 0 ? v15 / imp : 0,
        roas: spend > 0 ? gmv / spend : 0,
        cr: clicks > 0 ? purchase / clicks : 0,
        cpp: purchase > 0 ? spend / purchase : 0
      };
    };

    const getPlatformMetricNames = (plat: 'Overall' | 'Meta' | 'TikTok') => {
      const base = [
        { name: 'Spend', key: 'spend', fmt: formatIDR, isInv: false },
        { name: 'Impression', key: 'imp', fmt: formatNum, isInv: false },
        { name: 'CPM', key: 'cpm', fmt: formatIDR, isInv: true },
        { name: 'CTR', key: 'ctr', fmt: formatPct, isInv: false },
        { name: 'VTR (6s)', key: 'vtr6', fmt: formatPct, isInv: false },
        { name: 'VTR (15s)', key: 'vtr15', fmt: formatPct, isInv: false }
      ];

      if (plat === 'Meta') {
        return [
          ...base,
          { name: 'GMV', key: 'gmv', fmt: formatIDR, isInv: false },
          { name: 'Purchase', key: 'purchase', fmt: formatNum, isInv: false },
          { name: 'ROAS', key: 'roas', fmt: (v: number) => `${(Number(v) || 0).toFixed(2)}x`, isInv: false },
          { name: 'CR', key: 'cr', fmt: formatPct, isInv: false },
          { name: 'CPP', key: 'cpp', fmt: formatIDR, isInv: true }
        ];
      }

      return base;
    };

    const platforms: ('Overall' | 'Meta' | 'TikTok')[] = ['Overall', 'Meta', 'TikTok'];

    let tbody = '';

    if (granularity === 'monthly') {
      platforms.forEach(plat => {
        const curTotals = calcSum(filterPlatform(ctxCurData, plat));
        const prevTotals = calcSum(filterPlatform(ctxPrevData, plat));
        const metricNames = getPlatformMetricNames(plat);

        metricNames.forEach((m, i) => {
          const curV = (curTotals as any)[m.key];
          const prevV = (prevTotals as any)[m.key];
          let rowCls = i % 2 === 0 ? (isDarkMode ? 'bg-slate-800' : 'bg-white') : (isDarkMode ? 'bg-[#1e293b]' : 'bg-slate-50');
          if (i === 0) rowCls += ' group-start';
          if (i === metricNames.length - 1) rowCls += ' group-end';

          tbody += `<tr class="${rowCls} hover:${isDarkMode ? 'bg-indigo-900/30' : 'bg-indigo-50/50'} transition-colors">`;
          if (i === 0) {
            tbody += `<td rowspan="${metricNames.length}" class="px-4 py-3 sticky-col font-bold ${isDarkMode ? 'text-slate-200 bg-slate-800' : 'text-slate-900 bg-white'} align-top whitespace-normal break-words">${plat}</td>`;
          }
          tbody += `<td class="px-4 py-3 sticky-col-2 ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'} font-medium tracking-wide border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.name}</td>`;
          tbody += `<td class="px-4 py-3 text-right font-mono font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt(curV)}</td>`;
          tbody += `<td class="px-4 py-3 text-right font-mono font-medium text-slate-400 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt(prevV)}</td>`;
          tbody += getGrHTML(curV, prevV, m.isInv, isDarkMode);
          tbody += `</tr>`;
        });
      });
    } else if (granularity === 'weekly' && globalDates) {
      const weeksFound = new Set<string>(); ctxCurData.forEach(r => weeksFound.add(r.bucket)); ctxPrevData.forEach(r => weeksFound.add(r.bucket));
      const weeks = Array.from(weeksFound).sort((a, b) => parseInt(a.replace('W','')) - parseInt(b.replace('W','')));

      platforms.forEach(plat => {
        const curRows = filterPlatform(ctxCurData, plat);
        const prevRows = filterPlatform(ctxPrevData, plat);
        const curTotal = calcSum(curRows);
        const prevTotal = calcSum(prevRows);
        const metricNames = getPlatformMetricNames(plat);

        metricNames.forEach((m, i) => {
          let rowCls = i % 2 === 0 ? (isDarkMode ? 'bg-slate-800' : 'bg-white') : (isDarkMode ? 'bg-[#1e293b]' : 'bg-slate-50');
          if (i === 0) rowCls += ' group-start';
          if (i === metricNames.length - 1) rowCls += ' group-end';

          tbody += `<tr class="${rowCls} hover:${isDarkMode ? 'bg-indigo-900/30' : 'bg-indigo-50/50'} transition-colors">`;
          if (i === 0) {
            tbody += `<td rowspan="${metricNames.length}" class="px-4 py-3 sticky-col font-bold ${isDarkMode ? 'text-slate-200 bg-slate-800' : 'text-slate-900 bg-white'} align-top whitespace-normal break-words">${plat}</td>`;
          }
          tbody += `<td class="px-4 py-3 sticky-col-2 ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'} font-medium tracking-wide border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.name}</td>`;

          let curCumulRows: any[] = [];
          let prevCumulRows: any[] = [];

          weeks.forEach(w => {
            curCumulRows = curCumulRows.concat(curRows.filter(r => r.bucket === w));
            prevCumulRows = prevCumulRows.concat(prevRows.filter(r => r.bucket === w));
            const wc = (calcSum(curCumulRows) as any)[m.key];
            const wp = (calcSum(prevCumulRows) as any)[m.key];

            tbody += `<td class="px-4 py-3 text-right font-mono font-semibold border-l ${isDarkMode ? 'border-slate-700' : 'border-slate-200'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt(wc)}</td>
                      <td class="px-4 py-3 text-right font-mono font-medium text-slate-400 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt(wp)}</td>
                      ${getGrHTML(wc, wp, m.isInv, isDarkMode)}`;
          });

          const curTotVal = (curTotal as any)[m.key];
          const prevTotVal = (prevTotal as any)[m.key];
          tbody += `<td class="px-4 py-3 text-right font-mono border-l ${isDarkMode ? 'border-indigo-500 text-indigo-300 bg-indigo-950/50' : 'border-slate-200 text-indigo-700 bg-indigo-50/50'} font-bold border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt(curTotVal)}</td>
                    <td class="px-4 py-3 text-right font-mono font-medium text-slate-500 ${isDarkMode ? 'bg-indigo-950/50' : 'bg-indigo-50/50'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt(prevTotVal)}</td>
                    ${getGrHTML(curTotVal, prevTotVal, m.isInv, isDarkMode)}</tr>`;
        });
      });
    } else if (granularity === 'daily') {
      const daysFound = new Set<string>(); ctxCurData.forEach(r => daysFound.add(r.bucket)); const days = Array.from(daysFound).sort();

      platforms.forEach(plat => {
        const platRows = filterPlatform(ctxCurData, plat);
        const totalSum = calcSum(platRows);
        const metricNames = getPlatformMetricNames(plat);

        metricNames.forEach((m, i) => {
          let rowCls = i % 2 === 0 ? (isDarkMode ? 'bg-slate-800' : 'bg-white') : (isDarkMode ? 'bg-[#1e293b]' : 'bg-slate-50');
          if (i === 0) rowCls += ' group-start';
          if (i === metricNames.length - 1) rowCls += ' group-end';

          tbody += `<tr class="${rowCls} hover:${isDarkMode ? 'bg-indigo-900/30' : 'bg-indigo-50/50'} transition-colors">`;
          if (i === 0) {
            tbody += `<td rowspan="${metricNames.length}" class="px-4 py-3 sticky-col font-bold ${isDarkMode ? 'text-slate-200 bg-slate-800' : 'text-slate-900 bg-white'} align-top whitespace-normal break-words">${plat}</td>`;
          }
          tbody += `<td class="px-4 py-3 sticky-col-2 ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'} font-medium tracking-wide border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.name}</td>`;

          days.forEach(d => {
            const daySum = calcSum(platRows.filter(r => r.bucket === d));
            tbody += `<td class="px-4 py-3 text-right font-mono font-semibold border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt((daySum as any)[m.key])}</td>`;
          });
          tbody += `<td class="px-4 py-3 text-right font-mono font-bold ${isDarkMode ? 'text-indigo-300 bg-indigo-950/50 border-l border-indigo-800/50' : 'text-indigo-700 bg-indigo-50/50 border-l border-indigo-100'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${m.fmt((totalSum as any)[m.key])}</td></tr>`;
        });
      });
    }

    return tbody;
  }, [ctxCurData, ctxPrevData, granularity, globalDates, isDarkMode]);

  const generateTableHTML = useCallback(() => {
    const cnf = CONFIG.media;
    const getBaseMetrics = () => ({ spend:0, imp:0, clicks:0, views15s:0, views6s:0, consiSize:0, gmv:0, purchase:0 });
    
    const sumMetricsData = (target: any, row: any) => {
      target.spend += parseNum(row["Ad Spend"] || row["Spend"]); target.imp += parseNum(row["Impressions"] || row["Impression"]);
      target.clicks += parseNum(row["Combined Clicks"] || row["Clicks"]); target.views15s += parseNum(row["Views"] || row["15s View"]);
      target.views6s += parseNum(row["Views 6s"] || row["6s View"]); target.consiSize += parseNum(row[cnf.colConsiSize]); 
      target.gmv += parseNum(row["GMV"] || row["gmv"]);
      target.purchase += parseNum(row["Purchases With Shared Items"] || row["Purchase"] || row["Purchases"] || row["purchase"]);
    };

    const getDisplayMetricsArray = (g: any, adTypeLower: string) => {
      const m = [
        { name: "Cost", raw: g.spend, fmt: formatIDR(g.spend), isInv: false }, { name: "Impression", raw: g.imp, fmt: formatNum(g.imp), isInv: false },
        { name: "Clicks", raw: g.clicks, fmt: formatNum(g.clicks), isInv: false }, { name: "Views (6s)", raw: g.views6s, fmt: formatNum(g.views6s), isInv: false },
        { name: "Views (15s)", raw: g.views15s, fmt: formatNum(g.views15s), isInv: false }, { name: "CTR", raw: g.imp>0?(g.clicks/g.imp):0, fmt: formatPct(g.imp>0?(g.clicks/g.imp):0), isInv: false },
        { name: "VTR (6s)", raw: g.imp>0?(g.views6s/g.imp):0, fmt: formatPct(g.imp>0?(g.views6s/g.imp):0), isInv: false }, { name: "VTR (15s)", raw: g.imp>0?(g.views15s/g.imp):0, fmt: formatPct(g.imp>0?(g.views15s/g.imp):0), isInv: false },
        { name: "CPM", raw: g.imp>0?((g.spend/g.imp)*1000):0, fmt: formatIDR(g.imp>0?((g.spend/g.imp)*1000):0), isInv: true }
      ];
      if (adTypeLower.includes("tiktok consideration")) {
        m.push({ name: "Consi Size", raw: g.consiSize, fmt: formatNum(g.consiSize), isInv: false }); m.push({ name: "Consi Rate", raw: g.imp>0?(g.consiSize/g.imp):0, fmt: formatPct(g.imp>0?(g.consiSize/g.imp):0), isInv: false });
        m.push({ name: "CPCo", raw: g.consiSize>0?(g.spend/g.consiSize):0, fmt: formatIDR(g.consiSize>0?(g.spend/g.consiSize):0), isInv: true });
      }
      if (adTypeLower.includes("cpas shopee") || adTypeLower.includes("cpas view content") || adTypeLower.includes("cpas sales") || adTypeLower.includes("conversion")) {
        m.push({ name: "GMV", raw: g.gmv, fmt: formatIDR(g.gmv), isInv: false });
        m.push({ name: "Purchase", raw: g.purchase, fmt: formatNum(g.purchase), isInv: false });
        m.push({ name: "ROAS", raw: g.spend>0?(g.gmv/g.spend):0, fmt: (g.spend>0?(g.gmv/g.spend):0).toFixed(2)+"x", isInv: false });
        m.push({ name: "CR", raw: g.clicks>0?(g.purchase/g.clicks):0, fmt: formatPct(g.clicks>0?(g.purchase/g.clicks):0), isInv: false });
        m.push({ name: "CPP", raw: g.purchase>0?(g.spend/g.purchase):0, fmt: formatIDR(g.purchase>0?(g.spend/g.purchase):0), isInv: true });
      }
      return m;
    };

    const dim1Set = new Set<string>(); const dim2Set = new Set<string>();
    ctxCurData.forEach(r => {
      dim1Set.add(String(r[cnf.colAdType]));
      dim2Set.add(String(r[cnf.colFormat]));
    });

    const filterRow = (k1: string, k2: string) => {
      if (tableColFilter1 && tableColFilter1 !== 'All') {
        if (isCpasSalesAdType(tableColFilter1)) {
          if (!isCpasSalesAdType(k1)) return false;
        } else if (k1 !== tableColFilter1) {
          return false;
        }
      }
      if (tableColFilter2 && tableColFilter2 !== 'All' && k2 !== tableColFilter2) return false;
      return true;
    };

    let thead = ''; let tbody = '';
    const thClass = `px-4 py-4 font-bold text-slate-100 bg-[#0f172a]`;

    if (granularity === 'monthly') {
      thead = `<tr>
        <th class="sticky-col ${thClass}">Ad Type</th>
        <th class="sticky-col-2 ${thClass}">Format</th>
        <th class="sticky-col-3 ${thClass}">Metric</th>
        <th class="px-4 py-4 text-right font-bold text-white bg-[#0f172a] sticky top-0 border-b border-slate-700">This Month</th>
        <th class="px-4 py-4 text-right font-bold text-slate-400 bg-[#0f172a] sticky top-0 border-b border-slate-700">Prev Month</th>
        <th class="px-4 py-4 text-right font-bold text-white bg-[#0f172a] sticky top-0 border-b border-slate-700">GR%</th>
      </tr>`;
      
      const grouped: any = {};
      const process = (data: any[], keyName: string) => {
        data.forEach(r => {
          const k1 = String(r[cnf.colAdType]); const k2 = String(r[cnf.colFormat]);
          if (!filterRow(k1, k2)) return;
          const k = k1 + '_|_' + k2;
          if(!grouped[k]) grouped[k] = { cur: getBaseMetrics(), prev: getBaseMetrics(), dim1: k1, dim2: k2 };
          sumMetricsData(grouped[k][keyName], r);
        });
      };
      process(ctxCurData, 'cur'); process(ctxPrevData, 'prev');

      Object.values(grouped).forEach((g: any) => {
        const adTypeStr = String(g.dim1).toLowerCase();
        const mCur = getDisplayMetricsArray(g.cur, adTypeStr); const mPrev = getDisplayMetricsArray(g.prev, adTypeStr);
        mCur.forEach((mc, i) => {
          const mp = mPrev[i]; 
          let rowCls = i%2===0 ? (isDarkMode ? 'bg-slate-800' : 'bg-white') : (isDarkMode ? 'bg-[#1e293b]' : 'bg-slate-50'); 
          if(i===0) rowCls += ' group-start';
          if(i===mCur.length - 1) rowCls += ' group-end';
          
          tbody += `<tr class="${rowCls} hover:${isDarkMode ? 'bg-indigo-900/30' : 'bg-indigo-50/50'} transition-colors">`;
          if(i===0){
            tbody += `<td rowspan="${mCur.length}" class="px-4 py-3 sticky-col font-bold ${isDarkMode ? 'text-slate-200 bg-slate-800' : 'text-slate-900 bg-white'} align-top whitespace-normal break-words">${g.dim1}</td>`;
            tbody += `<td rowspan="${mCur.length}" class="px-4 py-3 sticky-col-2 font-medium ${isDarkMode ? 'text-slate-400 bg-slate-800' : 'text-slate-600 bg-white'} align-top whitespace-normal break-words">${g.dim2}</td>`;
          }
          tbody += `<td class="px-4 py-3 sticky-col-3 ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'} font-medium tracking-wide border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mc.name}</td>`;
          tbody += `<td class="px-4 py-3 text-right font-mono font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mc.fmt}</td>`;
          tbody += `<td class="px-4 py-3 text-right font-mono font-medium text-slate-400 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mp.fmt}</td>`;
          tbody += getGrHTML(mc.raw, mp.raw, mc.isInv, isDarkMode);
          tbody += '</tr>';
        });
      });
    } else if (granularity === 'weekly' && globalDates) {
      const weeksFound = new Set<string>(); ctxCurData.forEach(r => weeksFound.add(r.bucket)); ctxPrevData.forEach(r => weeksFound.add(r.bucket));
      const weeks = Array.from(weeksFound).sort((a, b) => parseInt(a.replace('W','')) - parseInt(b.replace('W',''))); 
      thead = `<tr>
        <th class="sticky-col ${thClass}">Ad Type</th>
        <th class="sticky-col-2 ${thClass}">Format</th>
        <th class="sticky-col-3 ${thClass}">Metric</th>`;
      weeks.forEach(w => {
        const weekNum = parseInt(w.replace('W', ''));
        let curD = new Date(globalDates.curStart); curD.setDate(curD.getDate() + (weekNum * 7) - 1); if (curD > globalDates.curMtdEnd) curD = new Date(globalDates.curMtdEnd);
        let prevD = new Date(globalDates.prevStart); prevD.setDate(prevD.getDate() + (weekNum * 7) - 1); if (prevD > globalDates.prevMtdEnd) prevD = new Date(globalDates.prevMtdEnd);
        const fmtStr = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
        thead += `<th class="px-4 py-4 text-right bg-[#0f172a] border-l border-slate-700 font-bold text-white sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD ${fmtStr(curD)}</th>
                  <th class="px-4 py-4 text-right text-slate-400 bg-[#0f172a] font-bold sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD ${fmtStr(prevD)}</th>
                  <th class="px-4 py-4 text-right bg-[#0f172a] font-bold text-white sticky top-0 border-b border-slate-700 whitespace-nowrap">GR%</th>`;
      });
      thead += `<th class="px-4 py-4 text-right border-l border-indigo-500 text-indigo-300 font-bold bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD Total Cur</th>
                <th class="px-4 py-4 text-right text-slate-400 bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD Total Prev</th>
                <th class="px-4 py-4 text-right text-indigo-300 font-bold bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">Total GR%</th>
              </tr>`;

      const grouped: any = {};
      const process = (data: any[], keyName: string) => {
        data.forEach(r => {
          const k1 = String(r[cnf.colAdType]); const k2 = String(r[cnf.colFormat]);
          if (!filterRow(k1, k2)) return;
          const k = k1 + '_|_' + k2;
          if(!grouped[k]) { grouped[k] = { curTotal: getBaseMetrics(), prevTotal: getBaseMetrics(), weeks: {}, dim1: k1, dim2: k2 }; weeks.forEach(w => grouped[k].weeks[w] = { cur: getBaseMetrics(), prev: getBaseMetrics() }); }
          sumMetricsData(grouped[k][keyName+"Total"], r);
          if(grouped[k].weeks[r.bucket]) sumMetricsData(grouped[k].weeks[r.bucket][keyName], r);
        });
      };
      process(ctxCurData, 'cur'); process(ctxPrevData, 'prev');

      Object.values(grouped).forEach((g: any) => {
        const adTypeStr = String(g.dim1).toLowerCase();
        const curTotM = getDisplayMetricsArray(g.curTotal, adTypeStr); const prevTotM = getDisplayMetricsArray(g.prevTotal, adTypeStr);
        const weekM: any = {}; let curCumul = getBaseMetrics(); let prevCumul = getBaseMetrics();
        
        weeks.forEach(w => { 
          Object.keys(curCumul).forEach(k => (curCumul as any)[k] += g.weeks[w].cur[k]); Object.keys(prevCumul).forEach(k => (prevCumul as any)[k] += g.weeks[w].prev[k]);
          weekM[w] = { cur: getDisplayMetricsArray(curCumul, adTypeStr), prev: getDisplayMetricsArray(prevCumul, adTypeStr) }; 
        });

        curTotM.forEach((mc, i) => {
          let rowCls = i%2===0 ? (isDarkMode ? 'bg-slate-800' : 'bg-white') : (isDarkMode ? 'bg-[#1e293b]' : 'bg-slate-50'); 
          if(i===0) rowCls += ' group-start';
          if(i===curTotM.length - 1) rowCls += ' group-end';
          tbody += `<tr class="${rowCls} hover:${isDarkMode ? 'bg-indigo-900/30' : 'bg-indigo-50/50'} transition-colors">`;
          if(i===0){
            tbody += `<td rowspan="${curTotM.length}" class="px-4 py-3 sticky-col font-bold ${isDarkMode ? 'text-slate-200 bg-slate-800' : 'text-slate-900 bg-white'} align-top whitespace-normal break-words">${g.dim1}</td>`;
            tbody += `<td rowspan="${curTotM.length}" class="px-4 py-3 sticky-col-2 font-medium ${isDarkMode ? 'text-slate-400 bg-slate-800' : 'text-slate-600 bg-white'} align-top whitespace-normal break-words">${g.dim2}</td>`;
          }
          tbody += `<td class="px-4 py-3 sticky-col-3 ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'} font-medium tracking-wide border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mc.name}</td>`;
          weeks.forEach(w => {
            const wc = weekM[w].cur[i], wp = weekM[w].prev[i];
            tbody += `<td class="px-4 py-3 text-right font-mono font-semibold border-l ${isDarkMode ? 'border-slate-700' : 'border-slate-200'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${wc.fmt}</td>
                      <td class="px-4 py-3 text-right font-mono font-medium text-slate-400 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${wp.fmt}</td>
                      ${getGrHTML(wc.raw, wp.raw, wc.isInv, isDarkMode)}`;
          });
          const mp = prevTotM[i];
          tbody += `<td class="px-4 py-3 text-right font-mono border-l ${isDarkMode ? 'border-indigo-500 text-indigo-300 bg-indigo-950/50' : 'border-slate-200 text-indigo-700 bg-indigo-50/50'} font-bold border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mc.fmt}</td>
                    <td class="px-4 py-3 text-right font-mono font-medium text-slate-500 ${isDarkMode ? 'bg-indigo-950/50' : 'bg-indigo-50/50'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mp.fmt}</td>
                    ${getGrHTML(mc.raw, mp.raw, mc.isInv, isDarkMode)}</tr>`;
        });
      });
    } else if (granularity === 'daily') {
      const daysFound = new Set<string>(); ctxCurData.forEach(r => daysFound.add(r.bucket)); const days = Array.from(daysFound).sort(); 
      thead = `<tr>
        <th class="sticky-col ${thClass}">Ad Type</th>
        <th class="sticky-col-2 ${thClass}">Format</th>
        <th class="sticky-col-3 ${thClass}">Metric</th>`;
      days.forEach(d => { 
        const parts = d.split('-'); const dt = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2])); 
        thead += `<th class="px-4 py-4 text-right font-bold text-white bg-[#0f172a] sticky top-0 border-b border-slate-700 whitespace-nowrap">${dt.getDate()} ${dt.toLocaleString('en-GB', { month: 'short' })}</th>`; 
      });
      thead += `<th class="px-4 py-4 text-right text-indigo-300 border-l border-slate-700 font-bold bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">Period Total</th></tr>`;

      const grouped: any = {};
      ctxCurData.forEach(r => {
        const k1 = String(r[cnf.colAdType]); const k2 = String(r[cnf.colFormat]);
        if (!filterRow(k1, k2)) return;
        const k = k1 + '_|_' + k2;
        if(!grouped[k]) { grouped[k] = { total: getBaseMetrics(), days: {}, dim1: k1, dim2: k2 }; days.forEach(d => grouped[k].days[d] = getBaseMetrics()); }
        sumMetricsData(grouped[k].total, r); sumMetricsData(grouped[k].days[r.bucket], r);
      });

      Object.values(grouped).forEach((g: any) => {
        const adTypeStr = String(g.dim1).toLowerCase();
        const totM = getDisplayMetricsArray(g.total, adTypeStr);
        const dayM: any = {}; days.forEach(d => { dayM[d] = getDisplayMetricsArray(g.days[d], adTypeStr); });

        totM.forEach((mc, i) => {
          let rowCls = i%2===0 ? (isDarkMode ? 'bg-slate-800' : 'bg-white') : (isDarkMode ? 'bg-[#1e293b]' : 'bg-slate-50'); 
          if(i===0) rowCls += ' group-start';
          if(i===totM.length - 1) rowCls += ' group-end';
          tbody += `<tr class="${rowCls} hover:${isDarkMode ? 'bg-indigo-900/30' : 'bg-indigo-50/50'} transition-colors">`;
          if(i===0){
            tbody += `<td rowspan="${totM.length}" class="px-4 py-3 sticky-col font-bold ${isDarkMode ? 'text-slate-200 bg-slate-800' : 'text-slate-900 bg-white'} align-top whitespace-normal break-words">${g.dim1}</td>`;
            tbody += `<td rowspan="${totM.length}" class="px-4 py-3 sticky-col-2 font-medium ${isDarkMode ? 'text-slate-400 bg-slate-800' : 'text-slate-600 bg-white'} align-top whitespace-normal break-words">${g.dim2}</td>`;
          }
          tbody += `<td class="px-4 py-3 sticky-col-3 ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'} font-medium tracking-wide border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mc.name}</td>`;
          days.forEach(d => { tbody += `<td class="px-4 py-3 text-right font-mono font-semibold border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${dayM[d][i].fmt}</td>`; });
          tbody += `<td class="px-4 py-3 text-right font-mono font-bold ${isDarkMode ? 'text-indigo-300 bg-indigo-950/50 border-l border-indigo-800/50' : 'text-indigo-700 bg-indigo-50/50 border-l border-indigo-100'} border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}">${mc.fmt}</td></tr>`;
        });
      });
    }

    return { head: thead, body: tbody, uniqueDim1: Array.from(dim1Set).sort(), uniqueDim2: Array.from(dim2Set).sort() };
  }, [ctxCurData, ctxPrevData, granularity, globalDates, tableColFilter1, tableColFilter2, isDarkMode]);

  const tableData = generateTableHTML();

  return (
    <div className="w-full space-y-6">
      {onSwitchSubPage && (
        <div className={`p-3.5 rounded-md border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex p-1 rounded-md border ${isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
              <button
                type="button"
                onClick={() => onSwitchSubPage('media')}
                className="px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-2 bg-indigo-600 text-white shadow-sm transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Campaign Overview
              </button>
              <button
                type="button"
                onClick={() => onSwitchSubPage('creativeReport')}
                className={`px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Creative Report
              </button>
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Switch to Creative Report for ad-level video previews and daily creative metrics
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 mb-6">
        <div onClick={() => setDashboardContext('Overall')} className={`bg-indigo-600 rounded-3xl p-5 lg:p-6 shadow-lg transition-all cursor-pointer hover:-translate-y-1 ${dashboardContext === 'Overall' ? 'ring-4 ring-indigo-300 shadow-indigo-600/40' : ''}`}>
          <div className="flex justify-between items-center mb-8"><h3 className="text-sm font-black text-indigo-100 uppercase tracking-widest">Overall Media</h3><div className="p-2.5 bg-white/20 rounded-xl"><svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg></div></div>
          <div className="space-y-4">
            <div className="flex justify-between items-end border-b border-indigo-500 pb-3"><span className="text-xs font-bold text-indigo-200">Spend</span><div className="text-right flex items-center justify-end gap-2"><span className="font-black text-[clamp(1.1rem,2vw,1.5rem)] text-white leading-none">{formatIDR(mediaKPIs.overall.spend)}</span>{renderGR(mediaKPIs.overall.spend, mediaKPIs.overall.pSpend, false, isDarkMode)}</div></div>
            <div className="flex justify-between items-end border-b border-indigo-500 pb-3"><span className="text-xs font-bold text-indigo-200">Impr</span><div className="text-right flex items-center justify-end gap-2"><span className="font-black text-[clamp(1.1rem,2vw,1.5rem)] text-white leading-none">{formatNum(mediaKPIs.overall.impr)}</span>{renderGR(mediaKPIs.overall.impr, mediaKPIs.overall.pImpr, false, isDarkMode)}</div></div>
            <div className="flex justify-between items-end pt-1"><span className="text-xs font-bold text-indigo-200">Engage</span><div className="text-right flex items-center justify-end gap-2"><span className="font-black text-[clamp(1.1rem,2vw,1.5rem)] text-white leading-none">{formatNum(mediaKPIs.overall.engage)}</span>{renderGR(mediaKPIs.overall.engage, mediaKPIs.overall.pEngage, false, isDarkMode)}</div></div>
          </div>
        </div>
        <div onClick={() => setDashboardContext('Meta')} className={`bg-blue-600 rounded-md p-5 lg:p-6 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 ${dashboardContext === 'Meta' ? 'ring-2 ring-blue-400' : ''}`}>
          <div className="flex justify-between items-center mb-8"><h3 className="text-sm font-bold text-blue-100 uppercase tracking-widest">Meta</h3><div className="p-2 bg-white/20 rounded-md"><svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></div></div>
          <div className="space-y-4">
            <div className="flex justify-between items-end border-b border-blue-400 pb-3"><span className="text-xs font-semibold text-blue-100">Spend</span><div className="text-right flex items-center justify-end gap-2"><span className="font-bold text-lg sm:text-xl text-white leading-none">{formatIDR(mediaKPIs.meta.spend)}</span>{renderGR(mediaKPIs.meta.spend, mediaKPIs.meta.pSpend, false, isDarkMode)}</div></div>
            <div className="flex justify-between items-end border-b border-blue-400 pb-3"><span className="text-xs font-semibold text-blue-100">Impr</span><div className="text-right flex items-center justify-end gap-2"><span className="font-bold text-lg sm:text-xl text-white leading-none">{formatNum(mediaKPIs.meta.impr)}</span>{renderGR(mediaKPIs.meta.impr, mediaKPIs.meta.pImpr, false, isDarkMode)}</div></div>
            <div className="flex justify-between items-end pt-1"><span className="text-xs font-semibold text-blue-100">Engage</span><div className="text-right flex items-center justify-end gap-2"><span className="font-bold text-lg sm:text-xl text-white leading-none">{formatNum(mediaKPIs.meta.engage)}</span>{renderGR(mediaKPIs.meta.engage, mediaKPIs.meta.pEngage, false, isDarkMode)}</div></div>
          </div>
        </div>
        <div onClick={() => setDashboardContext('TikTok')} className={`rounded-md p-5 lg:p-6 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 ${isDarkMode ? 'bg-[#0f172a] border border-slate-800' : 'bg-slate-900 text-white'} ${dashboardContext === 'TikTok' ? 'ring-2 ring-slate-400' : ''}`}>
          <div className="flex justify-between items-center mb-8"><h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">TikTok</h3><div className="p-2 bg-white/20 rounded-md"><svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg></div></div>
          <div className="space-y-4">
            <div className="flex justify-between items-end border-b border-slate-700 pb-3"><span className="text-xs font-semibold text-slate-400">Spend</span><div className="text-right flex items-center justify-end gap-2"><span className="font-bold text-lg sm:text-xl text-white leading-none">{formatIDR(mediaKPIs.tiktok.spend)}</span>{renderGR(mediaKPIs.tiktok.spend, mediaKPIs.tiktok.pSpend, false, isDarkMode)}</div></div>
            <div className="flex justify-between items-end border-b border-slate-700 pb-3"><span className="text-xs font-semibold text-slate-400">Impr</span><div className="text-right flex items-center justify-end gap-2"><span className="font-bold text-lg sm:text-xl text-white leading-none">{formatNum(mediaKPIs.tiktok.impr)}</span>{renderGR(mediaKPIs.tiktok.impr, mediaKPIs.tiktok.pImpr, false, isDarkMode)}</div></div>
            <div className="flex justify-between items-end pt-1"><span className="text-xs font-semibold text-slate-400">Engage</span><div className="text-right flex items-center justify-end gap-2"><span className="font-bold text-lg sm:text-xl text-white leading-none">{formatNum(mediaKPIs.tiktok.engage)}</span>{renderGR(mediaKPIs.tiktok.engage, mediaKPIs.tiktok.pEngage, false, isDarkMode)}</div></div>
          </div>
        </div>
      </div>
      
      <div className={`p-5 sm:p-6 rounded-md border shadow-sm mb-6 ${isDarkMode ? 'bg-[#0f172a] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-7 gap-4">
          <div>
            <h2 className="text-base font-bold tracking-tight">{dashboardContext} Historical Trend</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-normal">
              {granularity === 'monthly' ? 'Displaying data for the past 3 months' : granularity === 'weekly' ? 'MTD Comparison Analytics' : 'Daily Analytics'}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-md border border-slate-200 dark:border-slate-800">
              {(['combo', 'bar', 'line'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setChartTypeEngine(t)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all ${chartTypeEngine === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-md border w-full xl:w-auto shadow-sm ${isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 text-slate-400">Metrics</span>
              {[{id:'spend',l:'Spend', c:'bg-indigo-600'}, {id:'imp',l:'Impr', c:'bg-emerald-500'}, {id:'clicks',l:'Clicks', c:'bg-lime-500'}, {id:'views',l:'Views', c:'bg-amber-500'}, {id:'ctr',l:'CTR', c:'bg-pink-500'}, {id:'vtr',l:'VTR', c:'bg-teal-500'}].map(m => {
                const isActive = chartMetricsMedia.includes(m.id);
                return (
                  <button key={m.id} onClick={() => handleToggleMetric('media', m.id)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm ${isActive ? `${m.c} text-white` : isDarkMode ? 'bg-[#111827] text-slate-300 hover:bg-slate-800' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                    {m.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div key={`chart-media-${dashboardContext}-${chartTypeEngine}-${chartMetricsMedia.join('-')}`} className="w-full h-[380px] chart-appearance-animate">
          <canvas ref={chartRef}></canvas>
        </div>
      </div>

      <div className={`rounded-md border shadow-sm overflow-hidden mb-6 ${isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className={`p-4 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-800 bg-[#090d16]' : 'border-slate-200 bg-white'}`}>
          <div>
            <h2 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Platform Summary Rollup</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">Core performance across platforms (Spend, Impression, CPM, CTR, VTR)</p>
          </div>
        </div>
        <div className="overflow-auto max-h-[400px] relative w-full">
          <Table className={isDarkMode ? 'text-slate-200' : 'text-slate-700'}>
            <TableHeader>
              {granularity === 'monthly' && (
                <TableRow className="border-b border-slate-700 bg-[#090d16]">
                  <TableHead className="sticky-col text-slate-100 bg-[#090d16]">Platform</TableHead>
                  <TableHead className="sticky-col-2 text-slate-100 bg-[#090d16]">Metric</TableHead>
                  <TableHead className="text-right text-white bg-[#090d16] sticky top-0 border-b border-slate-700">This Month</TableHead>
                  <TableHead className="text-right text-slate-400 bg-[#090d16] sticky top-0 border-b border-slate-700">Prev Month</TableHead>
                  <TableHead className="text-right text-white bg-[#090d16] sticky top-0 border-b border-slate-700">GR%</TableHead>
                </TableRow>
              )}
              {granularity === 'weekly' && globalDates && (() => {
                const weeksFound = new Set<string>(); ctxCurData.forEach(r => weeksFound.add(r.bucket)); ctxPrevData.forEach(r => weeksFound.add(r.bucket));
                const weeks = Array.from(weeksFound).sort((a, b) => parseInt(a.replace('W','')) - parseInt(b.replace('W','')));
                return (
                  <TableRow className="border-b border-slate-700 bg-[#090d16]">
                    <TableHead className="sticky-col text-slate-100 bg-[#090d16]">Platform</TableHead>
                    <TableHead className="sticky-col-2 text-slate-100 bg-[#090d16]">Metric</TableHead>
                    {weeks.map(w => {
                      const weekNum = parseInt(w.replace('W', ''));
                      let curD = new Date(globalDates.curStart); curD.setDate(curD.getDate() + (weekNum * 7) - 1); if (curD > globalDates.curMtdEnd) curD = new Date(globalDates.curMtdEnd);
                      let prevD = new Date(globalDates.prevStart); prevD.setDate(prevD.getDate() + (weekNum * 7) - 1); if (prevD > globalDates.prevMtdEnd) prevD = new Date(globalDates.prevMtdEnd);
                      const fmtStr = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
                      return (
                        <React.Fragment key={w}>
                          <TableHead className="text-right bg-[#090d16] border-l border-slate-700 text-white sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD {fmtStr(curD)}</TableHead>
                          <TableHead className="text-right text-slate-400 bg-[#090d16] sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD {fmtStr(prevD)}</TableHead>
                          <TableHead className="text-right bg-[#090d16] text-white sticky top-0 border-b border-slate-700 whitespace-nowrap">GR%</TableHead>
                        </React.Fragment>
                      );
                    })}
                    <TableHead className="text-right border-l border-indigo-500 text-indigo-300 bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD Total Cur</TableHead>
                    <TableHead className="text-right text-slate-400 bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">MTD Total Prev</TableHead>
                    <TableHead className="text-right text-indigo-300 bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">Total GR%</TableHead>
                  </TableRow>
                );
              })()}
              {granularity === 'daily' && (() => {
                const daysFound = new Set<string>(); ctxCurData.forEach(r => daysFound.add(r.bucket)); const days = Array.from(daysFound).sort();
                return (
                  <TableRow className="border-b border-slate-700 bg-[#090d16]">
                    <TableHead className="sticky-col text-slate-100 bg-[#090d16]">Platform</TableHead>
                    <TableHead className="sticky-col-2 text-slate-100 bg-[#090d16]">Metric</TableHead>
                    {days.map(d => {
                      const parts = d.split('-'); const dt = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
                      return (
                        <TableHead key={d} className="text-right text-white bg-[#090d16] sticky top-0 border-b border-slate-700 whitespace-nowrap">
                          {dt.getDate()} {dt.toLocaleString('en-GB', { month: 'short' })}
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-right text-indigo-300 border-l border-slate-700 bg-[#020617] sticky top-0 border-b border-slate-700 whitespace-nowrap">Period Total</TableHead>
                  </TableRow>
                );
              })()}
            </TableHeader>
            <TableBody dangerouslySetInnerHTML={{ __html: generatePlatformSummaryBodyHTML() }} />
          </Table>
        </div>
      </div>

      <div className={`rounded-md border shadow-sm overflow-hidden mb-6 ${isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className={`p-4 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${isDarkMode ? 'border-slate-800 bg-[#111827]/50' : 'border-slate-100 bg-white'}`}>
          <h2 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Analysis Table</h2>
        </div>
        <div className="overflow-auto max-h-[850px] relative w-full rounded-b-md">
          <table className={`min-w-full text-left text-[clamp(12px,1vw,14px)] whitespace-nowrap border-separate [border-spacing:0] ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
            <thead dangerouslySetInnerHTML={{ __html: tableData.head }} />
            <tbody dangerouslySetInnerHTML={{ __html: tableData.body }} />
          </table>
        </div>
      </div>
    </div>
  );
}