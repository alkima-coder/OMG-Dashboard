import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface CompileOptions {
  rawData: any[];
  extraSheetsData: { mediaApi: any[]; commerce: any[] };
  selectedPeriod: { start: string; end: string; label: string };
  parseNum: (val: any) => number;
  parseSheetDate: (val: any) => Date | null;
  toYMD: (val: any) => string;
}

export async function exportMediaSignalToExcel({ rawData, extraSheetsData, selectedPeriod, parseNum, parseSheetDate, toYMD }: CompileOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Media Signal Tracker';
  workbook.created = new Date();
  const clean = (value: any) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const brands = Array.from(new Set(rawData.map(row => String(row['Brand'] || '').trim()).filter(Boolean))).sort();
  if (!brands.length) { alert('No brand data available to export.'); return; }

  const start = parseSheetDate(selectedPeriod.start); if (start) start.setHours(0, 0, 0, 0);
  const end = parseSheetDate(selectedPeriod.end); if (end) end.setHours(23, 59, 59, 999);
  const find = (row: any, names: string[]) => {
    for (const name of names) {
      const key = Object.keys(row).find(existing => existing.toLowerCase().trim() === name.toLowerCase().trim());
      if (key !== undefined && row[key] !== undefined && row[key] !== '') return row[key];
    }
    return '';
  };
  const usedNames = new Set<string>();
  const sheetName = (brand: string) => {
    const base = brand.replace(/[:\\/?*\[\]]/g, '').slice(0, 31) || 'Brand';
    let name = base; let suffix = 2;
    while (usedNames.has(name)) { const tail = ` (${suffix++})`; name = `${base.slice(0, 31 - tail.length)}${tail}`; }
    usedNames.add(name); return name;
  };
  const border: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD3D3D3' } }, left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } }, right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
  };

  for (const brand of brands) {
    const target = clean(brand);
    const subset = rawData.filter(row => {
      if (clean(row['Brand']) !== target) return false;
      if (toYMD(row['Start Date'] || row['start_date']) !== selectedPeriod.start || toYMD(row['End Date'] || row['end_date']) !== selectedPeriod.end) return false;
      const status = String(find(row, ['Status', 'status', 'Type'])).toLowerCase().trim();
      return status.includes('actual') || (!status.includes('plan') && status !== '');
    });
    const sum = (names: string[]) => subset.reduce((total, row) => total + parseNum(find(row, names)), 0);
    const impressions = sum(['Impressions', 'Total Impressions']);
    const paidImpressions = sum(['Paid Impressions']);
    const organicImpressions = sum(['Organic Impressions']);
    const engagements = sum(['Engagements', 'Total Engagements']);
    const paidEngagements = sum(['Paid Engagements']);
    const organicEngagements = sum(['Organic Engagements']);
    const views100 = sum(['Video Views At 100', 'Video Views At 100%', 'video_views_at_100']);
    const views6s = sum(['6 Sec Video Views', '6-sec Video Views', '6_sec_video_views']);
    const shares = sum(['Shares']); const comments = sum(['Comments']); const likes = sum(['Likes']);
    const clicks = sum(['Clicks']); const searchVolume = sum(['Search Volume', 'Search Volumes', 'search_volume']);
    const productCardClicks = sum(['Product Card Clicks', 'product_card_clicks']);
    let spendAwareness = 0, spendConsideration = 0, spendConversionMedia = 0, totalMediaSpend = 0, impAwareness = 0, impConsideration = 0;
    if (extraSheetsData.mediaApi?.length && start && end) extraSheetsData.mediaApi.forEach(row => {
      const platform = String(row['Platform'] || '').toLowerCase().trim();
      if (!platform.includes('tiktok') || clean(row['Brand'] || row['Brand fx']) !== target) return;
      const date = parseSheetDate(row['Date']); if (!date || date < start || date > end) return;
      const funnel = String(row['Funnel'] || row['KPI'] || '').toLowerCase().trim();
      const spend = parseNum(row['Ad Spend'] || row['Spend'] || row['Expense']); const imp = parseNum(row['Impressions'] || row['Impression']);
      totalMediaSpend += spend;
      if (funnel.includes('awareness')) { spendAwareness += spend; impAwareness += imp; }
      else if (funnel.includes('consideration')) { spendConsideration += spend; impConsideration += imp; }
      else if (funnel.includes('conversion')) spendConversionMedia += spend;
    });
    let gmvCommerce = 0, itemsSold = 0, spendConversionComm = 0;
    if (extraSheetsData.commerce?.length && start && end) extraSheetsData.commerce.forEach(row => {
      const platform = String(row['Platform'] || '').toLowerCase().trim();
      if (!platform.includes('tiktok') || clean(row['Brand fx'] || row['Brand']) !== target) return;
      const date = parseSheetDate(row['Date']); if (!date || date < start || date > end) return;
      gmvCommerce += parseNum(row['GMV']); 
      itemsSold += parseNum(row['Items Sold']) || parseNum(row['Item sold']) || parseNum(row['items_sold']) || parseNum(row['Orders']); 
      spendConversionComm += parseNum(row['Expense']);
    });
    const gmv = gmvCommerce || sum(['GMV Ads', 'gmv_ads', 'GMV']);
    const sold = itemsSold || sum(['Items Sold', 'Item sold', 'items_sold', 'Orders']);
    const spendConversion = spendConversionComm || spendConversionMedia || sum(['Spend Conversion', 'spend_conversion']);
    const impConversion = Math.max(0, paidImpressions - impAwareness - impConsideration);
    const totalSpend = Math.max(spendAwareness + spendConsideration + spendConversion, totalMediaSpend) || sum(['Total TikTok Spend', 'Total TikTok', 'Ad Spend', 'Spend', 'total_spend']);
    const pct = (value: number, total: number) => total > 0 ? value / total : 0;
    const periodLabel = `${selectedPeriod.start} to ${selectedPeriod.end}`;
    const rows: Array<{ cat?: string; metric?: string; val?: number | string; type?: string }> = [
      { metric: 'Metrics', val: periodLabel, type: 'header' }, { cat: 'Sales', metric: 'TikTok', val: gmv }, { type: 'blank' },
      { cat: 'Scale Signal', metric: 'Impressions', val: impressions }, { metric: 'Paid', val: paidImpressions }, { metric: 'Organic', val: organicImpressions }, { metric: '% Organic', val: pct(organicImpressions, impressions), type: 'pct' },
      { cat: 'ER', metric: 'Engagements', val: engagements }, { metric: 'Paid', val: paidEngagements }, { metric: 'Organic', val: organicEngagements }, { metric: '% Organic', val: pct(organicEngagements, engagements), type: 'pct' },
      { cat: 'Attention Signal', metric: 'Video Views at 100%', val: views100 }, { metric: 'Shares', val: shares }, { metric: 'Comments', val: comments }, { metric: 'Likes', val: likes }, { metric: '6-sec Video Views', val: views6s },
      { cat: 'Intent Signal', metric: 'Clicks', val: clicks }, { metric: 'Search Volumes', val: searchVolume }, { cat: 'Commerce Signal', metric: 'Product Card Clicks', val: productCardClicks },
      { cat: 'Commerce Performance', metric: 'GMV Ads', val: gmv }, { metric: 'AOV', val: sold > 0 ? gmv / sold : 0 }, { metric: 'Item sold', val: sold }, { metric: 'CR', val: pct(sold, clicks), type: 'pct' },
      { cat: 'Engagement Performance', metric: 'CTR', val: pct(clicks, impressions), type: 'pct' }, { metric: 'VTR', val: pct(views6s, paidImpressions), type: 'pct' }, { metric: 'ER %', val: pct(paidEngagements, paidImpressions), type: 'pct' }, { type: 'blank' },
      { cat: 'Audience Acquisition', metric: 'New Awareness Audience', val: sum(['New Awareness Audience', 'new_awareness_audience']) }, { metric: 'New Consideration Audience', val: sum(['New Consideration Audience', 'new_consideration_audience']) }, { metric: 'New Conversion Audience', val: sum(['New Conversion Audience', 'new_conversion_audience']) }, { type: 'blank' },
      { cat: 'Funnel Delivery & Spend', metric: 'Impression Awareness', val: impAwareness }, { metric: 'CPM Awareness', val: impAwareness > 0 ? spendAwareness / impAwareness * 1000 : 0 }, { metric: 'Impression Consideration', val: impConsideration }, { metric: 'CPM Consideration', val: impConsideration > 0 ? spendConsideration / impConsideration * 1000 : 0 }, { metric: 'Impression Conversion', val: impConversion }, { metric: 'CPM Conversion', val: impConversion > 0 ? spendConversion / impConversion * 1000 : 0 }, { type: 'blank' },
      { cat: 'Ads Spend', metric: 'Funnel', val: periodLabel, type: 'subhead' }, { metric: 'Awareness', val: spendAwareness }, { metric: 'Consideration', val: spendConsideration }, { metric: 'Conversion', val: spendConversion }, { metric: 'Total TikTok', val: totalSpend, type: 'total' }, { metric: 'Awareness %', val: pct(spendAwareness, totalSpend), type: 'pct' }, { metric: 'Consideration %', val: pct(spendConsideration, totalSpend), type: 'pct' }, { metric: 'Conversion %', val: pct(spendConversion, totalSpend), type: 'pct' }, { metric: 'Total TikTok %', val: 1, type: 'total' }
    ];
    const worksheet = workbook.addWorksheet(sheetName(brand));
    worksheet.columns = [{ width: 28 }, { width: 34 }, { width: 24 }];
    rows.forEach(item => {
      const row = worksheet.addRow([item.cat || '', item.metric || '', item.val ?? '']);
      if (item.type === 'blank') { row.height = 12; return; }
      row.height = 20;
      row.eachCell((cell, column) => {
        cell.font = { name: 'Calibri', size: 11, bold: ['header', 'subhead', 'total'].includes(item.type || '') };
        cell.border = border; cell.alignment = { vertical: 'middle', horizontal: column === 3 ? 'right' : item.type === 'header' || item.type === 'subhead' ? 'center' : 'left' };
        if (item.type === 'subhead') { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }; cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; }
        if (item.type === 'total') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        if (column === 3 && typeof item.val === 'number') cell.numFmt = item.type === 'pct' || (item.type === 'total' && item.val <= 1) ? '0.00%' : '#,##0';
      });
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Media_Signal_All_Brands_${selectedPeriod.start}_to_${selectedPeriod.end}.xlsx`);
}

export interface PidExportItem {
  cluster: string;
  cid: string;
  skuName: string;
  pid: string;
  dailyData: Record<string, {
    spend: number;
    adsGmv: number;
    sales: number;
    roas: number;
    cir: number;
    displayDate: string;
  }>;
}

export async function exportPidPushRankToExcel(
  items: PidExportItem[],
  dates: string[],
  displayDates: Record<string, string>,
  periodLabel: string
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PID Push Rank Tracker';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('PID Push Rank');
  const border: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
  };

  // Row 1: Merged dates
  const row1Values: (string | number)[] = ['', '', '', ''];
  // Row 2: Sub-headers
  const row2Values: (string | number)[] = ['Cluster', 'CID', 'SKU Name', 'PID'];

  dates.forEach((d) => {
    const disp = displayDates[d] || d;
    row1Values.push(disp, '', '', '', '');
    row2Values.push('Spend', 'Ads GMV', 'Sales', 'ROAS', 'CIR');
  });

  const headerRow1 = worksheet.addRow(row1Values);
  const headerRow2 = worksheet.addRow(row2Values);

  headerRow1.height = 24;
  headerRow2.height = 22;

  // Merge columns in Row 1 for each date
  let startCol = 5;
  dates.forEach(() => {
    worksheet.mergeCells(1, startCol, 1, startCol + 4);
    startCol += 5;
  });

  // Style Header Row 1
  headerRow1.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = border;
  });

  // Style Header Row 2
  headerRow2.eachCell((cell, colNum) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.alignment = { vertical: 'middle', horizontal: colNum > 4 ? 'right' : 'left' };
    cell.border = border;
  });

  // Add Data Rows
  items.forEach((item) => {
    const rowVals: (string | number)[] = [
      item.cluster || '',
      item.cid || '',
      item.skuName || '',
      item.pid || ''
    ];

    dates.forEach((d) => {
      const rec = item.dailyData[d] || { spend: 0, adsGmv: 0, sales: 0, roas: 0, cir: 0 };
      rowVals.push(rec.spend, rec.adsGmv, rec.sales, rec.roas, rec.cir ? rec.cir / 100 : 0);
    });

    const dataRow = worksheet.addRow(rowVals);
    dataRow.height = 20;

    dataRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = border;
      if (colNum <= 4) {
        cell.alignment = { vertical: 'middle', horizontal: colNum === 4 || colNum === 2 ? 'center' : 'left' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        const subColIdx = (colNum - 5) % 5;
        if (subColIdx === 0 || subColIdx === 1 || subColIdx === 2) {
          cell.numFmt = '#,##0';
        } else if (subColIdx === 3) {
          cell.numFmt = '0.00';
        } else if (subColIdx === 4) {
          cell.numFmt = '0.00%';
        }
      }
    });
  });

  // Set column widths
  worksheet.getColumn(1).width = 20; // Cluster
  worksheet.getColumn(2).width = 22; // CID
  worksheet.getColumn(3).width = 40; // SKU Name
  worksheet.getColumn(4).width = 24; // PID
  for (let c = 5; c <= 4 + dates.length * 5; c++) {
    worksheet.getColumn(c).width = 14;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `PID_Push_Rank_Tracker_${periodLabel.replace(/\s+/g, '_')}.xlsx`
  );
}

export interface PidMtdExportItem {
  cluster: string;
  cid: string;
  skuName: string;
  pid: string;
  curSpend: number;
  prevSpend: number;
  spendGr: number;
  curAdsGmv: number;
  prevAdsGmv: number;
  adsGmvGr: number;
  curSales: number;
  prevSales: number;
  salesGr: number;
  curRoas: number;
  prevRoas: number;
  roasGr: number;
  curCir: number;
  prevCir: number;
  cirGr: number;
  weeksData?: Record<string, {
    spend: { cur: number; prev: number; gr: number };
    adsGmv: { cur: number; prev: number; gr: number };
    sales: { cur: number; prev: number; gr: number };
    roas: { cur: number; prev: number; gr: number };
    cir: { cur: number; prev: number; gr: number };
  }>;
}

export async function exportPidPushRankMtdToExcel(
  items: PidMtdExportItem[],
  granularity: 'weekly' | 'monthly',
  weeks: string[],
  weekLabels: Record<string, { curLabel: string; prevLabel: string }>,
  periodLabel: string
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PID Push Rank Tracker';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('PID Push Rank MTD');
  const border: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
  };

  const isWeekly = granularity === 'weekly' && weeks.length > 0;

  if (isWeekly) {
    const row1Values: (string | number)[] = ['Cluster', 'CID', 'SKU Name', 'PID', 'Metric'];
    const row2Values: (string | number)[] = ['', '', '', '', ''];

    weeks.forEach((w) => {
      const lbl = weekLabels[w] || { curLabel: `MTD ${w}`, prevLabel: `MTD Prev ${w}` };
      row1Values.push(lbl.curLabel, lbl.prevLabel, 'GR%');
      row2Values.push('Current', 'Previous', 'Growth Rate');
    });

    row1Values.push('MTD Total Cur', 'MTD Total Prev', 'Total GR%');
    row2Values.push('Current Total', 'Previous Total', 'Total Growth');

    const hRow1 = worksheet.addRow(row1Values);
    const hRow2 = worksheet.addRow(row2Values);
    hRow1.height = 24;
    hRow2.height = 20;

    hRow1.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = border;
    });

    hRow2.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = border;
    });

    items.forEach((item) => {
      const metrics: Array<{ key: 'spend' | 'adsGmv' | 'sales' | 'roas' | 'cir'; label: string; fmt: 'num' | 'decimal' | 'pct' }> = [
        { key: 'spend', label: 'Spend', fmt: 'num' },
        { key: 'adsGmv', label: 'Ads GMV', fmt: 'num' },
        { key: 'sales', label: 'Sales', fmt: 'num' },
        { key: 'roas', label: 'ROAS', fmt: 'decimal' },
        { key: 'cir', label: 'CIR', fmt: 'pct' }
      ];

      metrics.forEach((m) => {
        const rowVals: (string | number)[] = [
          item.cluster || '',
          item.cid || '',
          item.skuName || '',
          item.pid || '',
          m.label
        ];

        weeks.forEach((w) => {
          const wData = item.weeksData?.[w]?.[m.key] || { cur: 0, prev: 0, gr: 0 };
          rowVals.push(
            m.fmt === 'pct' ? wData.cur / 100 : wData.cur,
            m.fmt === 'pct' ? wData.prev / 100 : wData.prev,
            wData.gr
          );
        });

        const curTot = m.key === 'spend' ? item.curSpend : m.key === 'adsGmv' ? item.curAdsGmv : m.key === 'sales' ? item.curSales : m.key === 'roas' ? item.curRoas : item.curCir;
        const prevTot = m.key === 'spend' ? item.prevSpend : m.key === 'adsGmv' ? item.prevAdsGmv : m.key === 'sales' ? item.prevSales : m.key === 'roas' ? item.prevRoas : item.prevCir;
        const grTot = m.key === 'spend' ? item.spendGr : m.key === 'adsGmv' ? item.adsGmvGr : m.key === 'sales' ? item.salesGr : m.key === 'roas' ? item.roasGr : item.cirGr;

        rowVals.push(
          m.fmt === 'pct' ? curTot / 100 : curTot,
          m.fmt === 'pct' ? prevTot / 100 : prevTot,
          grTot
        );

        const dataRow = worksheet.addRow(rowVals);
        dataRow.height = 19;
        dataRow.eachCell((cell, colNum) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = border;
          if (colNum <= 5) {
            cell.alignment = { vertical: 'middle', horizontal: colNum === 4 || colNum === 2 ? 'center' : 'left' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            const isGr = (colNum - 5) % 3 === 0;
            if (isGr) {
              cell.numFmt = '0.00%';
            } else if (m.fmt === 'num') {
              cell.numFmt = '#,##0';
            } else if (m.fmt === 'decimal') {
              cell.numFmt = '0.00';
            } else if (m.fmt === 'pct') {
              cell.numFmt = '0.00%';
            }
          }
        });
      });
    });
  } else {
    // Monthly layout
    const hRow = worksheet.addRow([
      'Cluster', 'CID', 'SKU Name', 'PID', 'Metric', 'This Month', 'Prev Month', 'GR%'
    ]);
    hRow.height = 24;
    hRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = border;
    });

    items.forEach((item) => {
      const rowsDef: Array<{ label: string; cur: number; prev: number; gr: number; fmt: 'num' | 'decimal' | 'pct' }> = [
        { label: 'Spend', cur: item.curSpend, prev: item.prevSpend, gr: item.spendGr, fmt: 'num' },
        { label: 'Ads GMV', cur: item.curAdsGmv, prev: item.prevAdsGmv, gr: item.adsGmvGr, fmt: 'num' },
        { label: 'Sales', cur: item.curSales, prev: item.prevSales, gr: item.salesGr, fmt: 'num' },
        { label: 'ROAS', cur: item.curRoas, prev: item.prevRoas, gr: item.roasGr, fmt: 'decimal' },
        { label: 'CIR', cur: item.curCir, prev: item.prevCir, gr: item.cirGr, fmt: 'pct' }
      ];

      rowsDef.forEach((m) => {
        const rowVals: (string | number)[] = [
          item.cluster || '',
          item.cid || '',
          item.skuName || '',
          item.pid || '',
          m.label,
          m.fmt === 'pct' ? m.cur / 100 : m.cur,
          m.fmt === 'pct' ? m.prev / 100 : m.prev,
          m.gr
        ];

        const dataRow = worksheet.addRow(rowVals);
        dataRow.height = 19;
        dataRow.eachCell((cell, colNum) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = border;
          if (colNum <= 5) {
            cell.alignment = { vertical: 'middle', horizontal: colNum === 4 || colNum === 2 ? 'center' : 'left' };
          } else if (colNum === 8) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '0.00%';
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            if (m.fmt === 'num') cell.numFmt = '#,##0';
            else if (m.fmt === 'decimal') cell.numFmt = '0.00';
            else if (m.fmt === 'pct') cell.numFmt = '0.00%';
          }
        });
      });
    });
  }

  worksheet.getColumn(1).width = 18; // Cluster
  worksheet.getColumn(2).width = 20; // CID
  worksheet.getColumn(3).width = 38; // SKU Name
  worksheet.getColumn(4).width = 22; // PID
  worksheet.getColumn(5).width = 14; // Metric
  for (let c = 6; c <= worksheet.columnCount; c++) {
    worksheet.getColumn(c).width = 14;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `PID_Push_Rank_MTD_${periodLabel.replace(/\s+/g, '_')}.xlsx`
  );
}