import React, { useState, useMemo, useEffect } from 'react';
import { parseNum, formatNum, cleanPid, getGr, getGrHTML, renderGR, formatPct } from '@/lib/formatters';
import { toYMD, parseSheetDate, getMediaDates, getWeekBucket } from '@/lib/dateUtils';
import { exportPidPushRankToExcel, exportPidPushRankMtdToExcel, PidMtdExportItem } from '@/lib/excelExport';
import PidMetricDetailModal, { MetricType } from './PidMetricDetailModal';
import { AddAdjustmentModal, AdjustmentLogsDrawer, normalizeAdjustment } from './PidAdjustmentModal';

interface PidPushRankTrackerViewProps {
  commerceData: any[];
  categoryData: any[];
  salesData: any[];
  cidData: any[];
  adjustments: any[];
  pushRankData?: any[];
  isDarkMode: boolean;
  onAddAdjustment: (data: any) => Promise<void>;
  onUpdateAdjustmentStatus: (id: string, status: 'Pending' | 'Adjusted', user: string) => Promise<void>;
  onUpdateActionTaken?: (id: string, actionTaken: string, user: string) => Promise<void>;
  onSyncData?: () => void;
  isLoading?: boolean;
  filters?: {
    brand?: string;
    platform?: string;
    adType?: string;
    cluster?: string;
    search?: string;
    [key: string]: any;
  };
  dateMonth?: string;
  granularity?: string;
  dateDailyStart?: string;
  dateDailyEnd?: string;
  dateWeekly?: string;
}

interface DailyRecord {
  date: string;       // YMD
  displayDate: string;// e.g. '1 Sep 2026'
  spend: number;
  adsGmv: number;
  sales: number;
  roas: number;
  cir: number;
}

interface MtdWeekRecord {
  spend: { cur: number; prev: number; gr: number };
  adsGmv: { cur: number; prev: number; gr: number };
  sales: { cur: number; prev: number; gr: number };
  roas: { cur: number; prev: number; gr: number };
  cir: { cur: number; prev: number; gr: number };
}

interface MtdRecord {
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
  weeks: Record<string, MtdWeekRecord>;
}

interface PidItem {
  pid: string;
  skuName: string;
  cluster: string;
  cid: string;
  brand: string;
  platform: string;
  adTypes: Set<string>;
  isPushRank?: boolean;
  dailyData: Record<string, DailyRecord>;
  totalSpend: number;
  totalAdsGmv: number;
  totalSales: number;
  overallRoas: number;
  overallCir: number;
  mtdData: MtdRecord;
}

const cleanStr = (v: any) => String(v || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');

const formatDisplayDate = (ymd: string): string => {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const d = parseInt(parts[2], 10);
  const m = parseInt(parts[1], 10);
  const y = parts[0];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1] || ''} ${y}`;
};

export default function PidPushRankTrackerView({
  commerceData,
  categoryData,
  salesData,
  cidData,
  adjustments,
  pushRankData = [],
  isDarkMode,
  onAddAdjustment,
  onUpdateAdjustmentStatus,
  onUpdateActionTaken,
  onSyncData,
  isLoading = false,
  filters,
  dateMonth,
  granularity = 'monthly',
  dateDailyStart,
  dateDailyEnd,
  dateWeekly
}: PidPushRankTrackerViewProps) {
  // Filters derived from Sidebar props
  const selectedBrand = filters?.brand || 'All';
  const selectedPlatform = filters?.platform || 'All';
  const selectedAdType = filters?.adType || 'All';
  const selectedCluster = filters?.cluster || 'All';
  const searchTerm = filters?.search || '';

  // Local Controls State
  const [pushRankOnly, setPushRankOnly] = useState(false);
  const [sortField, setSortField] = useState<'cluster' | 'skuName' | 'pid' | 'spend' | 'adsGmv' | 'sales' | 'roas' | 'cir'>('spend');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  // Table options: 'auto' | 'mtd' | 'daily'
  // When 'auto', the view is determined by the sidebar date range granularity:
  // 'daily' -> Daily Breakdown table
  // 'weekly' / 'monthly' -> MTD Performance POV table
  const [tableOption, setTableOption] = useState<'auto' | 'mtd' | 'daily'>('auto');
  const [mtdLayout, setMtdLayout] = useState<'rows' | 'compact'>('rows');
  const [showClusterRollup, setShowClusterRollup] = useState(true);

  // Sync tableOption whenever granularity changes in sidebar
  useEffect(() => {
    setTableOption('auto');
  }, [granularity]);

  const effectiveView: 'mtd' | 'daily' = useMemo(() => {
    if (tableOption === 'mtd') return 'mtd';
    if (tableOption === 'daily') return 'daily';
    return granularity === 'daily' ? 'daily' : 'mtd';
  }, [tableOption, granularity]);

  // Reset pagination on filter or date changes
  useEffect(() => {
    setPage(1);
  }, [selectedBrand, selectedPlatform, selectedAdType, selectedCluster, searchTerm, dateMonth, granularity, dateDailyStart, dateDailyEnd, dateWeekly, pushRankOnly, effectiveView, mtdLayout]);

  // Modals State
  const [activeDrilldown, setActiveDrilldown] = useState<{
    pidItem: PidItem | null;
    metric: MetricType;
  } | null>(null);

  const [addAdjustmentModal, setAddAdjustmentModal] = useState<{
    isOpen: boolean;
    data?: {
      date: string;
      pid: string;
      skuName: string;
      metric: string;
      value?: number;
    };
  }>({ isOpen: false });

  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState(false);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // 1. Build Category / Cluster Map from 'PID CATEGORY'
  const categoryMap = useMemo(() => {
    const map = new Map<string, { cluster: string; skuName?: string; brand?: string; platform?: string }>();
    categoryData.forEach((row) => {
      const pid = cleanPid(row['PID']);
      if (!pid) return;
      const cluster = cleanStr(row['Class​'] || row['Class'] || row['CLASS'] || row['Cluster'] || row['CLUSTER']);
      const skuName = cleanStr(row['Nama Produk​'] || row['Nama Produk'] || row['Product Name']);
      const brand = cleanStr(row['Brand']);
      const platform = cleanStr(row['Platform']);
      map.set(pid, { cluster: cluster || 'Unclassified', skuName, brand, platform });
    });
    return map;
  }, [categoryData]);

  // 2. Build CID Map from 'PID CID' and 'Commerce'
  const cidMap = useMemo(() => {
    const map = new Map<string, string>();
    cidData.forEach((row) => {
      const pid = cleanPid(row['PID']);
      const cid = cleanStr(row['CID']);
      if (pid && cid && !map.has(pid)) {
        map.set(pid, cid);
      }
    });
    return map;
  }, [cidData]);

  // 3. Build Push Rank Set from 'Push Rank' sheet (col D "Status" = "PUSH RANK")
  const pushRankSet = useMemo(() => {
    const set = new Set<string>();
    if (!Array.isArray(pushRankData)) return set;
    pushRankData.forEach((row) => {
      const status = cleanStr(row['Status'] || row['status'] || row['STATUS']);
      if (status.toUpperCase().includes('PUSH RANK')) {
        const rawSkuId = cleanPid(row['SKU ID'] || row['SKU ID​'] || row['PID'] || row['Sku Id']);
        if (rawSkuId) {
          set.add(rawSkuId);
          set.add(rawSkuId.replace(/\.0$/, ''));
        }
        const skuName = cleanStr(row['SKU Name'] || row['Nama Produk']);
        if (skuName) set.add(skuName.toLowerCase());
      }
    });
    return set;
  }, [pushRankData]);

  // 4. Collect all distinct months and dates available
  const { allAvailableDates, availableMonths } = useMemo(() => {
    const datesSet = new Set<string>();
    const monthsSet = new Set<string>();

    const addDate = (raw: any) => {
      const ymd = toYMD(raw);
      if (ymd && ymd.length === 10 && ymd.startsWith('202')) {
        datesSet.add(ymd);
        monthsSet.add(ymd.slice(0, 7)); // YYYY-MM
      }
    };

    commerceData.forEach((r) => addDate(r['Date']));
    salesData.forEach((r) => addDate(r['Date']));

    const sortedDates = Array.from(datesSet).sort();
    const sortedMonths = Array.from(monthsSet).sort().reverse();
    return { allAvailableDates: sortedDates, availableMonths: sortedMonths };
  }, [commerceData, salesData]);

  // Derive active month without triggering cascading renders
  const activeMonth = useMemo(() => {
    if (dateMonth && availableMonths.includes(dateMonth)) return dateMonth;
    if (dateMonth) return dateMonth;
    if (availableMonths.length > 0) {
      const sep = availableMonths.find(m => m.endsWith('-09'));
      return sep || availableMonths[0];
    }
    return '';
  }, [dateMonth, availableMonths]);

  // Global dates for MTD calculation (aligns with DigitalMedia / CommerceTracker)
  const globalDates = useMemo(() => {
    if (granularity === 'weekly') {
      const targetStr = dateWeekly || (allAvailableDates.length > 0 ? allAvailableDates[allAvailableDates.length - 1] : '');
      if (!targetStr) return null;
      const p = targetStr.split('-');
      if (p.length !== 3) return null;
      const targetDate = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      return getMediaDates(targetDate, 'weekly');
    }
    // monthly or fallback for mtd
    const targetMonth = dateMonth || activeMonth || (availableMonths.length > 0 ? availableMonths[0] : '');
    if (!targetMonth) return null;
    const p = targetMonth.split('-');
    if (p.length !== 2) return null;
    const targetDate = new Date(Number(p[0]), Number(p[1]), 0);
    return getMediaDates(targetDate, 'monthly');
  }, [granularity, dateWeekly, dateMonth, activeMonth, allAvailableDates, availableMonths]);

  // MTD Weeks list and date labels (for weekly MTD presentation)
  const { mtdWeeks, mtdWeekDateLabels } = useMemo(() => {
    if (granularity !== 'weekly' || !globalDates) {
      return { mtdWeeks: [] as string[], mtdWeekDateLabels: {} as Record<string, { curLabel: string; prevLabel: string; curD: Date; prevD: Date }> };
    }

    const weeksSet = new Set<string>();
    const checkDate = (rawDate: any) => {
      const dt = parseSheetDate(rawDate);
      if (!dt || isNaN(dt.getTime())) return;
      dt.setHours(0, 0, 0, 0);
      if (dt >= globalDates.curStart && dt <= globalDates.curMtdEnd) {
        weeksSet.add('W' + getWeekBucket(dt, globalDates.curStart));
      }
      if (dt >= globalDates.prevStart && dt <= globalDates.prevMtdEnd) {
        weeksSet.add('W' + getWeekBucket(dt, globalDates.prevStart));
      }
    };

    commerceData.forEach(r => checkDate(r['Date']));
    salesData.forEach(r => checkDate(r['Date']));

    if (weeksSet.size === 0) {
      const maxW = getWeekBucket(globalDates.curMtdEnd, globalDates.curStart);
      for (let i = 1; i <= Math.max(1, maxW); i++) weeksSet.add('W' + i);
    }

    const sortedWeeks = Array.from(weeksSet).sort(
      (a, b) => parseInt(a.replace('W', '')) - parseInt(b.replace('W', ''))
    );

    const fmtStr = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
    const dateLabels: Record<string, { curLabel: string; prevLabel: string; curD: Date; prevD: Date }> = {};

    sortedWeeks.forEach(w => {
      const weekNum = parseInt(w.replace('W', ''));
      let curD = new Date(globalDates.curStart);
      curD.setDate(curD.getDate() + (weekNum * 7) - 1);
      if (curD > globalDates.curMtdEnd) curD = new Date(globalDates.curMtdEnd);

      let prevD = new Date(globalDates.prevStart);
      prevD.setDate(prevD.getDate() + (weekNum * 7) - 1);
      if (prevD > globalDates.prevMtdEnd) prevD = new Date(globalDates.prevMtdEnd);

      dateLabels[w] = {
        curLabel: `MTD ${fmtStr(curD)}`,
        prevLabel: `MTD ${fmtStr(prevD)}`,
        curD,
        prevD
      };
    });

    return { mtdWeeks: sortedWeeks, mtdWeekDateLabels: dateLabels };
  }, [granularity, globalDates, commerceData, salesData]);

  // Sync date range based on active month or custom sidebar range for daily table
  const activeDates = useMemo(() => {
    if (granularity === 'daily' && dateDailyStart && dateDailyEnd) {
      return allAvailableDates.filter(d => d >= dateDailyStart && d <= dateDailyEnd);
    }
    if (granularity === 'weekly' && dateWeekly) {
      const monthPrefix = dateWeekly.slice(0, 7);
      return allAvailableDates.filter(d => d.startsWith(monthPrefix) && d <= dateWeekly);
    }
    if (!activeMonth) return allAvailableDates.slice(-14);
    return allAvailableDates.filter(d => d.startsWith(activeMonth));
  }, [allAvailableDates, activeMonth, granularity, dateDailyStart, dateDailyEnd, dateWeekly]);

  // 5. Aggregate PID Performance Data (Both Daily & MTD)
  const pidItems = useMemo(() => {
    const pidsMap = new Map<string, {
      pid: string;
      skuName: string;
      cluster: string;
      cid: string;
      brand: string;
      platform: string;
      adTypes: Set<string>;
      daily: Map<string, { spend: number; adsGmv: number; sales: number }>;
      mtdCur: { spend: number; adsGmv: number; sales: number };
      mtdPrev: { spend: number; adsGmv: number; sales: number };
      weeksRaw: Record<string, { cur: { spend: number; adsGmv: number; sales: number }; prev: { spend: number; adsGmv: number; sales: number } }>;
    }>();

    const getOrCreate = (pid: string, defaultSku = '', defaultBrand = '', defaultPlatform = '', defaultCid = '') => {
      const cleanP = cleanPid(pid);
      let item = pidsMap.get(cleanP);
      if (!item) {
        const catInfo = categoryMap.get(cleanP);
        const mappedCid = cidMap.get(cleanP) || defaultCid;
        const weeksRaw: Record<string, any> = {};
        mtdWeeks.forEach(w => {
          weeksRaw[w] = {
            cur: { spend: 0, adsGmv: 0, sales: 0 },
            prev: { spend: 0, adsGmv: 0, sales: 0 }
          };
        });

        item = {
          pid: cleanP,
          skuName: defaultSku || catInfo?.skuName || 'Product',
          cluster: catInfo?.cluster || 'Unclassified',
          cid: mappedCid || '-',
          brand: catInfo?.brand || defaultBrand || '',
          platform: catInfo?.platform || defaultPlatform || '',
          adTypes: new Set<string>(),
          daily: new Map(),
          mtdCur: { spend: 0, adsGmv: 0, sales: 0 },
          mtdPrev: { spend: 0, adsGmv: 0, sales: 0 },
          weeksRaw
        };
        pidsMap.set(cleanP, item);
      } else {
        if (!item.skuName || item.skuName === 'Product') {
          if (defaultSku) item.skuName = defaultSku;
        }
        if (!item.cid || item.cid === '-') {
          if (defaultCid) item.cid = defaultCid;
        }
        if (!item.brand && defaultBrand) item.brand = defaultBrand;
        if (!item.platform && defaultPlatform) item.platform = defaultPlatform;
      }
      return item;
    };

    // Pre-populate with all classified PIDs from PID CATEGORY
    categoryData.forEach((row) => {
      const pid = cleanPid(row['PID']);
      if (pid) {
        getOrCreate(
          pid,
          cleanStr(row['Nama Produk​'] || row['Nama Produk']),
          cleanStr(row['Brand']),
          cleanStr(row['Platform'])
        );
      }
    });

    const isWeekly = granularity === 'weekly' && Boolean(globalDates);
    const isMonthly = (granularity === 'monthly' || !isWeekly) && Boolean(globalDates);

    // Populate Commerce Data (Spend, Ads GMV)
    commerceData.forEach((row) => {
      const pid = cleanPid(row['PID']);
      if (!pid) return;

      const dateYmd = toYMD(row['Date']);
      if (!dateYmd) return;

      const rowDate = parseSheetDate(row['Date']);
      if (rowDate) rowDate.setHours(0, 0, 0, 0);

      const exp = parseNum(row['Expense'] || row['Spend'] || row['Cost'] || 0);
      const gmv = parseNum(row['GMV'] || row['Ads GMV'] || 0);
      const skuName = cleanStr(row['SKU Name'] || row['Ad Name'] || row['Product Name']);
      const brand = cleanStr(row['Brand fx'] || row['Brand']);
      const platform = cleanStr(row['Platform']);
      const cid = cleanStr(row['PID / CID'] || row['CID']);
      const adType = cleanStr(row['Ad Type'] || row['Ad Type fx']);

      const item = getOrCreate(pid, skuName, brand, platform, cid);
      if (adType) item.adTypes.add(adType);

      // If specific Ad Type selected, only accumulate for that Ad Type
      if (selectedAdType !== 'All' && adType.toLowerCase() !== selectedAdType.toLowerCase()) {
        return;
      }

      // 1. Daily tracking map
      let dayRec = item.daily.get(dateYmd);
      if (!dayRec) {
        dayRec = { spend: 0, adsGmv: 0, sales: 0 };
        item.daily.set(dateYmd, dayRec);
      }
      dayRec.spend += exp;
      dayRec.adsGmv += gmv;

      // 2. MTD current & previous accumulation
      if (globalDates && rowDate) {
        if (isWeekly) {
          if (rowDate >= globalDates.curStart && rowDate <= globalDates.curMtdEnd) {
            item.mtdCur.spend += exp;
            item.mtdCur.adsGmv += gmv;
            const w = 'W' + getWeekBucket(rowDate, globalDates.curStart);
            if (item.weeksRaw[w]) {
              item.weeksRaw[w].cur.spend += exp;
              item.weeksRaw[w].cur.adsGmv += gmv;
            }
          }
          if (rowDate >= globalDates.prevStart && rowDate <= globalDates.prevMtdEnd) {
            item.mtdPrev.spend += exp;
            item.mtdPrev.adsGmv += gmv;
            const w = 'W' + getWeekBucket(rowDate, globalDates.prevStart);
            if (item.weeksRaw[w]) {
              item.weeksRaw[w].prev.spend += exp;
              item.weeksRaw[w].prev.adsGmv += gmv;
            }
          }
        } else if (isMonthly) {
          if (rowDate >= globalDates.curStart && rowDate <= globalDates.curMonthEnd) {
            item.mtdCur.spend += exp;
            item.mtdCur.adsGmv += gmv;
          }
          if (rowDate >= globalDates.prevStart && rowDate <= globalDates.prevMonthEnd) {
            item.mtdPrev.spend += exp;
            item.mtdPrev.adsGmv += gmv;
          }
        }
      }
    });

    // Populate PID SALES Data
    salesData.forEach((row) => {
      const pid = cleanPid(row['PID']);
      if (!pid) return;

      const dateYmd = toYMD(row['Date']);
      if (!dateYmd) return;

      const rowDate = parseSheetDate(row['Date']);
      if (rowDate) rowDate.setHours(0, 0, 0, 0);

      const sales = parseNum(row['Sales'] || 0);
      const brand = cleanStr(row['Brand']);

      const item = getOrCreate(pid, '', brand, '');

      // 1. Daily tracking map
      let dayRec = item.daily.get(dateYmd);
      if (!dayRec) {
        dayRec = { spend: 0, adsGmv: 0, sales: 0 };
        item.daily.set(dateYmd, dayRec);
      }
      dayRec.sales += sales;

      // 2. MTD current & previous accumulation
      if (globalDates && rowDate) {
        if (isWeekly) {
          if (rowDate >= globalDates.curStart && rowDate <= globalDates.curMtdEnd) {
            item.mtdCur.sales += sales;
            const w = 'W' + getWeekBucket(rowDate, globalDates.curStart);
            if (item.weeksRaw[w]) {
              item.weeksRaw[w].cur.sales += sales;
            }
          }
          if (rowDate >= globalDates.prevStart && rowDate <= globalDates.prevMtdEnd) {
            item.mtdPrev.sales += sales;
            const w = 'W' + getWeekBucket(rowDate, globalDates.prevStart);
            if (item.weeksRaw[w]) {
              item.weeksRaw[w].prev.sales += sales;
            }
          }
        } else if (isMonthly) {
          if (rowDate >= globalDates.curStart && rowDate <= globalDates.curMonthEnd) {
            item.mtdCur.sales += sales;
          }
          if (rowDate >= globalDates.prevStart && rowDate <= globalDates.prevMonthEnd) {
            item.mtdPrev.sales += sales;
          }
        }
      }
    });

    // Convert into final array of PidItem
    const result: PidItem[] = [];
    pidsMap.forEach((val) => {
      const dailyData: Record<string, DailyRecord> = {};
      let totalSpend = 0;
      let totalAdsGmv = 0;
      let totalSales = 0;

      activeDates.forEach((d) => {
        const dRec = val.daily.get(d) || { spend: 0, adsGmv: 0, sales: 0 };
        const spend = dRec.spend;
        const adsGmv = dRec.adsGmv;
        const sales = dRec.sales;

        const roas = spend > 0 ? adsGmv / spend : 0;
        const cir = sales > 0 ? (spend / sales) * 100 : 0;

        totalSpend += spend;
        totalAdsGmv += adsGmv;
        totalSales += sales;

        dailyData[d] = {
          date: d,
          displayDate: formatDisplayDate(d),
          spend,
          adsGmv,
          sales,
          roas,
          cir
        };
      });

      const overallRoas = totalSpend > 0 ? totalAdsGmv / totalSpend : 0;
      const overallCir = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0;

      // Cumulative weekly MTD progression calculation
      const weeksData: Record<string, MtdWeekRecord> = {};
      let curCumSpend = 0;
      let curCumAdsGmv = 0;
      let curCumSales = 0;
      let prevCumSpend = 0;
      let prevCumAdsGmv = 0;
      let prevCumSales = 0;

      mtdWeeks.forEach((w) => {
        const wCur = val.weeksRaw[w]?.cur || { spend: 0, adsGmv: 0, sales: 0 };
        const wPrev = val.weeksRaw[w]?.prev || { spend: 0, adsGmv: 0, sales: 0 };

        curCumSpend += wCur.spend;
        curCumAdsGmv += wCur.adsGmv;
        curCumSales += wCur.sales;

        prevCumSpend += wPrev.spend;
        prevCumAdsGmv += wPrev.adsGmv;
        prevCumSales += wPrev.sales;

        const curR = curCumSpend > 0 ? curCumAdsGmv / curCumSpend : 0;
        const prevR = prevCumSpend > 0 ? prevCumAdsGmv / prevCumSpend : 0;
        const curC = curCumSales > 0 ? (curCumSpend / curCumSales) * 100 : 0;
        const prevC = prevCumSales > 0 ? (prevCumSpend / prevCumSales) * 100 : 0;

        weeksData[w] = {
          spend: { cur: curCumSpend, prev: prevCumSpend, gr: getGr(curCumSpend, prevCumSpend) },
          adsGmv: { cur: curCumAdsGmv, prev: prevCumAdsGmv, gr: getGr(curCumAdsGmv, prevCumAdsGmv) },
          sales: { cur: curCumSales, prev: prevCumSales, gr: getGr(curCumSales, prevCumSales) },
          roas: { cur: curR, prev: prevR, gr: getGr(curR, prevR) },
          cir: { cur: curC, prev: prevC, gr: getGr(curC, prevC) }
        };
      });

      // MTD Totals
      const curSpend = val.mtdCur.spend;
      const prevSpend = val.mtdPrev.spend;
      const curAdsGmv = val.mtdCur.adsGmv;
      const prevAdsGmv = val.mtdPrev.adsGmv;
      const curSales = val.mtdCur.sales;
      const prevSales = val.mtdPrev.sales;

      const curRoas = curSpend > 0 ? curAdsGmv / curSpend : 0;
      const prevRoas = prevSpend > 0 ? prevAdsGmv / prevSpend : 0;
      const curCir = curSales > 0 ? (curSpend / curSales) * 100 : 0;
      const prevCir = prevSales > 0 ? (prevSpend / prevSales) * 100 : 0;

      const mtdData: MtdRecord = {
        curSpend,
        prevSpend,
        spendGr: getGr(curSpend, prevSpend),
        curAdsGmv,
        prevAdsGmv,
        adsGmvGr: getGr(curAdsGmv, prevAdsGmv),
        curSales,
        prevSales,
        salesGr: getGr(curSales, prevSales),
        curRoas,
        prevRoas,
        roasGr: getGr(curRoas, prevRoas),
        curCir,
        prevCir,
        cirGr: getGr(curCir, prevCir),
        weeks: weeksData
      };

      const pidClean = cleanPid(val.pid);
      const isPushRank = pushRankSet.has(pidClean) ||
        pushRankSet.has(pidClean.replace(/\.0$/, '')) ||
        Boolean(val.skuName && pushRankSet.has(val.skuName.toLowerCase()));

      result.push({
        pid: val.pid,
        skuName: val.skuName,
        cluster: val.cluster,
        cid: val.cid,
        brand: val.brand,
        platform: val.platform,
        adTypes: val.adTypes,
        isPushRank,
        dailyData,
        totalSpend,
        totalAdsGmv,
        totalSales,
        overallRoas,
        overallCir,
        mtdData
      });
    });

    return result;
  }, [categoryData, categoryMap, cidMap, commerceData, salesData, activeDates, pushRankSet, selectedAdType, globalDates, granularity, mtdWeeks]);

  // Apply Filter and Sorting
  const filteredItems = useMemo(() => {
    let list = pidItems;

    if (selectedBrand !== 'All') {
      const b = selectedBrand.toLowerCase();
      list = list.filter((i) => i.brand.toLowerCase().includes(b));
    }

    if (selectedPlatform !== 'All') {
      const p = selectedPlatform.toLowerCase();
      list = list.filter((i) => i.platform.toLowerCase().includes(p));
    }

    if (selectedAdType !== 'All') {
      const target = selectedAdType.toLowerCase();
      list = list.filter((i) =>
        Array.from(i.adTypes).some((t) => t.toLowerCase() === target) ||
        i.totalSpend > 0 ||
        i.totalAdsGmv > 0
      );
    }

    if (selectedCluster !== 'All') {
      const c = selectedCluster.toLowerCase();
      list = list.filter((i) => i.cluster.toLowerCase() === c);
    }

    if (pushRankOnly) {
      list = list.filter((i) => i.isPushRank);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (i) =>
          i.pid.toLowerCase().includes(q) ||
          i.skuName.toLowerCase().includes(q) ||
          i.cid.toLowerCase().includes(q) ||
          i.cluster.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortField === 'cluster' || sortField === 'skuName' || sortField === 'pid') {
        const valA = String(a[sortField] || '').toLowerCase();
        const valB = String(b[sortField] || '').toLowerCase();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      let diff = 0;
      if (effectiveView === 'mtd') {
        if (sortField === 'spend') diff = a.mtdData.curSpend - b.mtdData.curSpend;
        else if (sortField === 'adsGmv') diff = a.mtdData.curAdsGmv - b.mtdData.curAdsGmv;
        else if (sortField === 'sales') diff = a.mtdData.curSales - b.mtdData.curSales;
        else if (sortField === 'roas') diff = a.mtdData.curRoas - b.mtdData.curRoas;
        else if (sortField === 'cir') diff = a.mtdData.curCir - b.mtdData.curCir;
      } else {
        if (sortField === 'spend') diff = a.totalSpend - b.totalSpend;
        else if (sortField === 'adsGmv') diff = a.totalAdsGmv - b.totalAdsGmv;
        else if (sortField === 'sales') diff = a.totalSales - b.totalSales;
        else if (sortField === 'roas') diff = a.overallRoas - b.overallRoas;
        else if (sortField === 'cir') diff = a.overallCir - b.overallCir;
      }

      return sortAsc ? diff : -diff;
    });
  }, [pidItems, selectedBrand, selectedPlatform, selectedAdType, selectedCluster, pushRankOnly, searchTerm, sortField, sortAsc, effectiveView]);

  const pushRankCount = useMemo(() => pidItems.filter((i) => i.isPushRank).length, [pidItems]);

  // Summary KPIs (Both MTD and Daily)
  const summaryKPIs = useMemo(() => {
    const totalPids = filteredItems.length;

    // Daily totals
    const totalSpend = filteredItems.reduce((acc, i) => acc + i.totalSpend, 0);
    const totalAdsGmv = filteredItems.reduce((acc, i) => acc + i.totalAdsGmv, 0);
    const totalSales = filteredItems.reduce((acc, i) => acc + i.totalSales, 0);
    const overallRoas = totalSpend > 0 ? totalAdsGmv / totalSpend : 0;
    const overallCir = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0;

    // MTD Totals
    const mtdCurSpend = filteredItems.reduce((acc, i) => acc + i.mtdData.curSpend, 0);
    const mtdPrevSpend = filteredItems.reduce((acc, i) => acc + i.mtdData.prevSpend, 0);
    const mtdCurAdsGmv = filteredItems.reduce((acc, i) => acc + i.mtdData.curAdsGmv, 0);
    const mtdPrevAdsGmv = filteredItems.reduce((acc, i) => acc + i.mtdData.prevAdsGmv, 0);
    const mtdCurSales = filteredItems.reduce((acc, i) => acc + i.mtdData.curSales, 0);
    const mtdPrevSales = filteredItems.reduce((acc, i) => acc + i.mtdData.prevSales, 0);

    const mtdCurRoas = mtdCurSpend > 0 ? mtdCurAdsGmv / mtdCurSpend : 0;
    const mtdPrevRoas = mtdPrevSpend > 0 ? mtdPrevAdsGmv / mtdPrevSpend : 0;
    const mtdCurCir = mtdCurSales > 0 ? (mtdCurSpend / mtdCurSales) * 100 : 0;
    const mtdPrevCir = mtdPrevSales > 0 ? (mtdPrevSpend / mtdPrevSales) * 100 : 0;

    return {
      totalPids,
      totalSpend,
      totalAdsGmv,
      totalSales,
      overallRoas,
      overallCir,
      mtdCurSpend,
      mtdPrevSpend,
      mtdCurAdsGmv,
      mtdPrevAdsGmv,
      mtdCurSales,
      mtdPrevSales,
      mtdCurRoas,
      mtdPrevRoas,
      mtdCurCir,
      mtdPrevCir
    };
  }, [filteredItems]);

  // Cluster Summary Rollup (Aggregated for MTD POV)
  const clusterRollup = useMemo(() => {
    if (effectiveView !== 'mtd') return [];

    const clustersMap = new Map<string, {
      cluster: string;
      curSpend: number;
      prevSpend: number;
      curAdsGmv: number;
      prevAdsGmv: number;
      curSales: number;
      prevSales: number;
      weeks: Record<string, { curSpend: number; prevSpend: number; curAdsGmv: number; prevAdsGmv: number; curSales: number; prevSales: number }>;
    }>();

    const getOrCreateCluster = (cl: string) => {
      let c = clustersMap.get(cl);
      if (!c) {
        const weeksObj: Record<string, any> = {};
        mtdWeeks.forEach(w => {
          weeksObj[w] = { curSpend: 0, prevSpend: 0, curAdsGmv: 0, prevAdsGmv: 0, curSales: 0, prevSales: 0 };
        });
        c = {
          cluster: cl,
          curSpend: 0,
          prevSpend: 0,
          curAdsGmv: 0,
          prevAdsGmv: 0,
          curSales: 0,
          prevSales: 0,
          weeks: weeksObj
        };
        clustersMap.set(cl, c);
      }
      return c;
    };

    filteredItems.forEach((item) => {
      const c = getOrCreateCluster(item.cluster || 'Unclassified');
      c.curSpend += item.mtdData.curSpend;
      c.prevSpend += item.mtdData.prevSpend;
      c.curAdsGmv += item.mtdData.curAdsGmv;
      c.prevAdsGmv += item.mtdData.prevAdsGmv;
      c.curSales += item.mtdData.curSales;
      c.prevSales += item.mtdData.prevSales;

      mtdWeeks.forEach((w) => {
        const wData = item.mtdData.weeks[w];
        if (wData && c.weeks[w]) {
          c.weeks[w].curSpend += wData.spend.cur;
          c.weeks[w].prevSpend += wData.spend.prev;
          c.weeks[w].curAdsGmv += wData.adsGmv.cur;
          c.weeks[w].prevAdsGmv += wData.adsGmv.prev;
          c.weeks[w].curSales += wData.sales.cur;
          c.weeks[w].prevSales += wData.sales.prev;
        }
      });
    });

    const rows = Array.from(clustersMap.values()).sort((a, b) => b.curSpend - a.curSpend);
    return rows;
  }, [filteredItems, effectiveView, mtdWeeks]);

  // Paginated Items
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filteredItems.slice(start, start + PER_PAGE);
  }, [filteredItems, page]);

  const totalPages = Math.ceil(filteredItems.length / PER_PAGE) || 1;

  const normalizedAdjustments = useMemo(() => {
    return (adjustments || []).map(normalizeAdjustment);
  }, [adjustments]);

  // Pending adjustments count
  const pendingAdjustmentsCount = useMemo(() => {
    return normalizedAdjustments.filter((a) => a.status !== 'Adjusted').length;
  }, [normalizedAdjustments]);

  // Check if PID + Date has adjustment
  const getAdjustment = (pid: string, displayDate: string, ymd: string) => {
    const cPid = cleanPid(pid);
    return normalizedAdjustments.find((a) => {
      const matchPid = cleanPid(a.pid) === cPid;
      if (!matchPid) return false;
      const d = (a.date || '').toLowerCase();
      return (
        d === displayDate.toLowerCase() ||
        d === ymd.toLowerCase() ||
        toYMD(a.date) === ymd
      );
    });
  };

  // Check if PID has any adjustment in period or week
  const getPidMtdAdjustment = (pid: string, metricKey: string, weekStr?: string) => {
    const cPid = cleanPid(pid);
    return normalizedAdjustments.find((a) => {
      if (cleanPid(a.pid) !== cPid) return false;
      const mLower = (a.metric || '').toLowerCase().trim();
      const matchMetric = mLower === 'general' || mLower.includes(metricKey.toLowerCase());
      if (!matchMetric) return false;

      if (weekStr && globalDates && mtdWeekDateLabels[weekStr]) {
        const aDate = parseSheetDate(a.date);
        if (aDate) {
          aDate.setHours(0, 0, 0, 0);
          return aDate >= globalDates.curStart && aDate <= mtdWeekDateLabels[weekStr].curD;
        }
      }

      if (globalDates) {
        const aDate = parseSheetDate(a.date);
        if (aDate) {
          aDate.setHours(0, 0, 0, 0);
          return aDate >= globalDates.curStart && aDate <= (globalDates.curMonthEnd || globalDates.curMtdEnd);
        }
      }

      return true;
    });
  };

  const handleExportExcel = async () => {
    const periodLabel = activeMonth || (globalDates ? toYMD(globalDates.curMtdEnd) : 'Period');

    if (effectiveView === 'mtd') {
      const exportMtdItems: PidMtdExportItem[] = filteredItems.map((item) => ({
        cluster: item.cluster,
        cid: item.cid,
        skuName: item.skuName,
        pid: item.pid,
        curSpend: item.mtdData.curSpend,
        prevSpend: item.mtdData.prevSpend,
        spendGr: item.mtdData.spendGr,
        curAdsGmv: item.mtdData.curAdsGmv,
        prevAdsGmv: item.mtdData.prevAdsGmv,
        adsGmvGr: item.mtdData.adsGmvGr,
        curSales: item.mtdData.curSales,
        prevSales: item.mtdData.prevSales,
        salesGr: item.mtdData.salesGr,
        curRoas: item.mtdData.curRoas,
        prevRoas: item.mtdData.prevRoas,
        roasGr: item.mtdData.roasGr,
        curCir: item.mtdData.curCir,
        prevCir: item.mtdData.prevCir,
        cirGr: item.mtdData.cirGr,
        weeksData: item.mtdData.weeks
      }));

      const weekLabelsMap: Record<string, { curLabel: string; prevLabel: string }> = {};
      mtdWeeks.forEach((w) => {
        if (mtdWeekDateLabels[w]) {
          weekLabelsMap[w] = {
            curLabel: mtdWeekDateLabels[w].curLabel,
            prevLabel: mtdWeekDateLabels[w].prevLabel
          };
        }
      });

      await exportPidPushRankMtdToExcel(
        exportMtdItems,
        granularity === 'weekly' ? 'weekly' : 'monthly',
        mtdWeeks,
        weekLabelsMap,
        periodLabel
      );
    } else {
      const displayDatesMap: Record<string, string> = {};
      activeDates.forEach((d) => {
        displayDatesMap[d] = formatDisplayDate(d);
      });
      await exportPidPushRankToExcel(filteredItems, activeDates, displayDatesMap, periodLabel);
    }
  };

  // High contrast color classes
  const mainText = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const secText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const borderCol = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const cardBg = isDarkMode ? 'bg-[#0f172a]' : 'bg-white';
  const tableFreezeBg = isDarkMode ? 'bg-[#0f172a]' : 'bg-white';
  const tableFreezeHoverBg = isDarkMode ? 'group-hover:bg-[#1a253a]' : 'group-hover:bg-slate-100';
  const tableRowHoverBg = isDarkMode ? 'hover:bg-[#131d33]' : 'hover:bg-slate-50';

  const tableTotalWidth = useMemo(() => {
    if (effectiveView === 'daily') {
      return 130 + 140 + 280 + 160 + (activeDates.length * 420);
    }
    if (mtdLayout === 'rows') {
      if (granularity === 'weekly') {
        return 130 + 140 + 280 + 160 + 110 + (mtdWeeks.length * 310) + 330;
      }
      return 130 + 140 + 280 + 160 + 110 + 360;
    }
    // compact
    return 130 + 140 + 280 + 160 + (5 * 270);
  }, [effectiveView, mtdLayout, granularity, activeDates.length, mtdWeeks.length]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Top Settings Action Bar */}
      <div className={`p-4 rounded-md border ${borderCol} ${cardBg} shadow-sm flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsLogsDrawerOpen(true)}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-2 border shadow-sm ${
              isDarkMode
                ? 'bg-indigo-500/10 text-indigo-300 hover:bg-indigo-600 hover:text-white border-indigo-500/30'
                : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-600 hover:text-white border-indigo-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Adjustment Logs
            {pendingAdjustmentsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {pendingAdjustmentsCount} Pending
              </span>
            )}
          </button>

          <button
            onClick={() => setAddAdjustmentModal({ isOpen: true })}
            className="px-3 py-2 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            + New Adjustment
          </button>

          {/* Push Rank PID Filter Toggle */}
          <button
            onClick={() => {
              setPushRankOnly(!pushRankOnly);
              setPage(1);
            }}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-2 border shadow-sm ${
              pushRankOnly
                ? 'bg-rose-600 text-white border-rose-600'
                : isDarkMode
                ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-600 hover:text-white border-rose-500/30'
                : 'bg-rose-50 text-rose-900 hover:bg-rose-600 hover:text-white border-rose-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${pushRankOnly ? 'bg-white' : 'bg-rose-500 animate-pulse'}`} />
            Push Rank Only ({pushRankCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className={`px-3 py-2 rounded-md text-xs font-semibold border transition-colors flex items-center gap-2 ${
              isDarkMode
                ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 border-slate-700'
                : 'bg-slate-100 text-slate-900 hover:bg-slate-200 border-slate-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Excel {effectiveView === 'mtd' ? '(MTD)' : '(Daily)'}
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total PIDs */}
        <div className={`p-4 rounded-md border ${borderCol} ${cardBg} shadow-sm`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${secText}`}>Total PIDs</div>
          <div className={`text-lg sm:text-xl font-bold mt-1 tracking-tight ${mainText}`}>{summaryKPIs.totalPids}</div>
          <div className={`text-[10px] font-normal mt-0.5 ${secText}`}>
            {effectiveView === 'mtd'
              ? `${granularity === 'weekly' ? 'Weekly MTD Cut-off' : 'Full Month MTD'}`
              : `${activeDates.length} Days Tracking`}
          </div>
        </div>

        {/* Spend */}
        <div className={`p-4 rounded-md border ${borderCol} ${cardBg} shadow-sm`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${secText}`}>Total Spend</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-lg sm:text-xl font-bold tracking-tight ${mainText}`}>
              Rp {formatNum(effectiveView === 'mtd' ? summaryKPIs.mtdCurSpend : summaryKPIs.totalSpend)}
            </span>
            {effectiveView === 'mtd' && renderGR(summaryKPIs.mtdCurSpend, summaryKPIs.mtdPrevSpend, true, isDarkMode)}
          </div>
          <div className={`text-[10px] font-normal mt-0.5 ${secText}`}>
            {effectiveView === 'mtd'
              ? `vs Prev: Rp ${formatNum(summaryKPIs.mtdPrevSpend)}`
              : 'Commerce Expense'}
          </div>
        </div>

        {/* Ads GMV */}
        <div className={`p-4 rounded-md border ${borderCol} ${cardBg} shadow-sm`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${secText}`}>Total Ads GMV</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-lg sm:text-xl font-bold tracking-tight ${mainText}`}>
              Rp {formatNum(effectiveView === 'mtd' ? summaryKPIs.mtdCurAdsGmv : summaryKPIs.totalAdsGmv)}
            </span>
            {effectiveView === 'mtd' && renderGR(summaryKPIs.mtdCurAdsGmv, summaryKPIs.mtdPrevAdsGmv, false, isDarkMode)}
          </div>
          <div className={`text-[10px] font-normal mt-0.5 ${secText}`}>
            {effectiveView === 'mtd'
              ? `vs Prev: Rp ${formatNum(summaryKPIs.mtdPrevAdsGmv)}`
              : 'Paid Advertising'}
          </div>
        </div>

        {/* Sales */}
        <div className={`p-4 rounded-md border ${borderCol} ${cardBg} shadow-sm`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${secText}`}>Total Sales</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-lg sm:text-xl font-bold tracking-tight ${mainText}`}>
              Rp {formatNum(effectiveView === 'mtd' ? summaryKPIs.mtdCurSales : summaryKPIs.totalSales)}
            </span>
            {effectiveView === 'mtd' && renderGR(summaryKPIs.mtdCurSales, summaryKPIs.mtdPrevSales, false, isDarkMode)}
          </div>
          <div className={`text-[10px] font-normal mt-0.5 ${secText}`}>
            {effectiveView === 'mtd'
              ? `vs Prev: Rp ${formatNum(summaryKPIs.mtdPrevSales)}`
              : 'PID Sales Sheet'}
          </div>
        </div>

        {/* ROAS */}
        <div className={`p-4 rounded-md border ${borderCol} ${cardBg} shadow-sm`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${secText}`}>Blended ROAS</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-lg sm:text-xl font-bold tracking-tight ${mainText}`}>
              {effectiveView === 'mtd'
                ? (summaryKPIs.mtdCurRoas > 0 ? `${summaryKPIs.mtdCurRoas.toFixed(2)}x` : '-')
                : (summaryKPIs.overallRoas > 0 ? `${summaryKPIs.overallRoas.toFixed(2)}x` : '-')}
            </span>
            {effectiveView === 'mtd' && renderGR(summaryKPIs.mtdCurRoas, summaryKPIs.mtdPrevRoas, false, isDarkMode)}
          </div>
          <div className={`text-[10px] font-normal mt-0.5 ${secText}`}>
            {effectiveView === 'mtd'
              ? `vs Prev: ${summaryKPIs.mtdPrevRoas > 0 ? `${summaryKPIs.mtdPrevRoas.toFixed(2)}x` : '-'}`
              : 'Ads GMV / Spend'}
          </div>
        </div>

        {/* CIR */}
        <div className={`p-4 rounded-md border ${borderCol} ${cardBg} shadow-sm`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${secText}`}>Blended CIR</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-lg sm:text-xl font-bold tracking-tight ${mainText}`}>
              {effectiveView === 'mtd'
                ? (summaryKPIs.mtdCurCir > 0 ? `${summaryKPIs.mtdCurCir.toFixed(2)}%` : '-')
                : (summaryKPIs.overallCir > 0 ? `${summaryKPIs.overallCir.toFixed(2)}%` : '-')}
            </span>
            {effectiveView === 'mtd' && renderGR(summaryKPIs.mtdCurCir, summaryKPIs.mtdPrevCir, true, isDarkMode)}
          </div>
          <div className={`text-[10px] font-normal mt-0.5 ${secText}`}>
            {effectiveView === 'mtd'
              ? `vs Prev: ${summaryKPIs.mtdPrevCir > 0 ? `${summaryKPIs.mtdPrevCir.toFixed(2)}%` : '-'}`
              : 'Spend / Sales'}
          </div>
        </div>
      </div>

      {/* 3. Cluster Summary Rollup (Presented in MTD POV like Platform Summary Rollup in Commerce / Digital Media) */}
      {effectiveView === 'mtd' && clusterRollup.length > 0 && (
        <div className={`rounded-md border ${borderCol} shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`p-4 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-800 bg-[#111827]/50' : 'border-slate-100 bg-slate-50/70'}`}>
            <div>
              <h2 className={`font-black uppercase tracking-wider text-xs sm:text-sm ${mainText}`}>
                Cluster Summary Rollup
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal">
                {granularity === 'weekly'
                  ? 'Weekly MTD progression and growth rate by PID category cluster'
                  : 'Monthly MTD comparison and growth rate by PID category cluster'}
              </p>
            </div>
            <button
              onClick={() => setShowClusterRollup(!showClusterRollup)}
              className={`text-xs font-semibold px-2.5 py-1 rounded border transition-colors ${
                isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-white'
              }`}
            >
              {showClusterRollup ? 'Hide Rollup ▲' : 'Show Rollup ▼'}
            </button>
          </div>

          {showClusterRollup && (
            <div className="overflow-auto max-h-[360px] relative w-full">
              <table className={`w-full text-left text-xs whitespace-nowrap border-separate [border-spacing:0] ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                <thead>
                  <tr className="border-b border-slate-700 bg-[#090d16]">
                    <th className="sticky top-0 left-0 z-40 bg-[#090d16] text-slate-100 font-bold px-3 py-2.5 border-r border-b border-slate-700 w-[140px] min-w-[140px]">Cluster</th>
                    <th className="sticky top-0 left-[140px] z-40 bg-[#090d16] text-slate-100 font-bold px-3 py-2.5 border-r border-b border-slate-700 w-[110px] min-w-[110px]">Metric</th>

                    {granularity === 'monthly' && (
                      <>
                        <th className="sticky top-0 text-right text-white bg-[#090d16] px-4 py-2.5 font-bold border-b border-slate-700">This Month</th>
                        <th className="sticky top-0 text-right text-slate-400 bg-[#090d16] px-4 py-2.5 font-bold border-b border-slate-700">Prev Month</th>
                        <th className="sticky top-0 text-right text-white bg-[#090d16] px-4 py-2.5 font-bold border-b border-slate-700">GR%</th>
                      </>
                    )}

                    {granularity === 'weekly' && (
                      <>
                        {mtdWeeks.map((w) => {
                          const lbl = mtdWeekDateLabels[w] || { curLabel: `MTD ${w}`, prevLabel: `MTD Prev ${w}` };
                          return (
                            <React.Fragment key={`cluster-th-${w}`}>
                              <th className="sticky top-0 text-right bg-[#090d16] border-l border-slate-700 text-white px-3 py-2.5 font-bold border-b border-slate-700 whitespace-nowrap">
                                {lbl.curLabel}
                              </th>
                              <th className="sticky top-0 text-right text-slate-400 bg-[#090d16] px-3 py-2.5 font-bold border-b border-slate-700 whitespace-nowrap">
                                {lbl.prevLabel}
                              </th>
                              <th className="sticky top-0 text-right bg-[#090d16] text-white px-3 py-2.5 font-bold border-b border-slate-700 whitespace-nowrap">
                                GR%
                              </th>
                            </React.Fragment>
                          );
                        })}
                        <th className="sticky top-0 text-right border-l border-indigo-500 text-indigo-300 bg-[#020617] px-4 py-2.5 font-bold border-b border-slate-700 whitespace-nowrap">
                          MTD Total Cur
                        </th>
                        <th className="sticky top-0 text-right text-slate-400 bg-[#020617] px-4 py-2.5 font-bold border-b border-slate-700 whitespace-nowrap">
                          MTD Total Prev
                        </th>
                        <th className="sticky top-0 text-right text-indigo-300 bg-[#020617] px-4 py-2.5 font-bold border-b border-slate-700 whitespace-nowrap">
                          Total GR%
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {clusterRollup.map((c) => {
                    const metrics = [
                      { key: 'spend', name: 'Spend', isInv: true, fmt: (v: number) => v > 0 ? formatNum(v) : '-' },
                      { key: 'adsGmv', name: 'Ads GMV', isInv: false, fmt: (v: number) => v > 0 ? formatNum(v) : '-' },
                      { key: 'sales', name: 'Sales', isInv: false, fmt: (v: number) => v > 0 ? formatNum(v) : '-' },
                      { key: 'roas', name: 'ROAS', isInv: false, fmt: (v: number) => v > 0 ? `${v.toFixed(2)}x` : '-' },
                      { key: 'cir', name: 'CIR', isInv: true, fmt: (v: number) => v > 0 ? `${v.toFixed(2)}%` : '-' }
                    ];

                    const cRoas = c.curSpend > 0 ? c.curAdsGmv / c.curSpend : 0;
                    const pRoas = c.prevSpend > 0 ? c.prevAdsGmv / c.prevSpend : 0;
                    const cCir = c.curSales > 0 ? (c.curSpend / c.curSales) * 100 : 0;
                    const pCir = c.prevSales > 0 ? (c.prevSpend / c.prevSales) * 100 : 0;

                    const curTotMap: Record<string, number> = {
                      spend: c.curSpend,
                      adsGmv: c.curAdsGmv,
                      sales: c.curSales,
                      roas: cRoas,
                      cir: cCir
                    };
                    const prevTotMap: Record<string, number> = {
                      spend: c.prevSpend,
                      adsGmv: c.prevAdsGmv,
                      sales: c.prevSales,
                      roas: pRoas,
                      cir: pCir
                    };

                    return metrics.map((m, mIdx) => {
                      const isEven = mIdx % 2 === 0;
                      const rowCls = isEven
                        ? isDarkMode ? 'bg-[#0f172a]' : 'bg-white'
                        : isDarkMode ? 'bg-[#111827]' : 'bg-slate-50';
                      const isLastMetric = mIdx === metrics.length - 1;

                      return (
                        <tr key={`cluster-${c.cluster}-${m.key}`} className={`${rowCls} hover:${isDarkMode ? 'bg-indigo-900/20' : 'bg-indigo-50/40'} transition-colors`}>
                          {mIdx === 0 && (
                            <td
                              rowSpan={5}
                              className={`sticky left-0 z-20 px-3 py-2 font-bold align-top border-r ${borderCol} ${isDarkMode ? 'bg-[#0f172a] text-slate-100' : 'bg-white text-slate-900'} ${isLastMetric ? `border-b ${borderCol}` : ''}`}
                            >
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                isDarkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}>
                                {c.cluster}
                              </span>
                            </td>
                          )}

                          <td className={`sticky left-[140px] z-20 px-3 py-2 font-medium tracking-wide border-r border-b ${borderCol} ${isDarkMode ? 'bg-[#0f172a] text-slate-300' : 'bg-white text-slate-700'}`}>
                            {m.name}
                          </td>

                          {granularity === 'monthly' && (
                            <>
                              <td className={`px-4 py-2 text-right font-mono font-bold border-b ${borderCol} ${mainText}`}>
                                {m.fmt(curTotMap[m.key])}
                              </td>
                              <td className={`px-4 py-2 text-right font-mono font-medium border-b ${borderCol} text-slate-400`}>
                                {m.fmt(prevTotMap[m.key])}
                              </td>
                              <td
                                className={`px-4 py-2 text-right font-mono font-bold border-b ${borderCol}`}
                                dangerouslySetInnerHTML={{ __html: getGrHTML(curTotMap[m.key], prevTotMap[m.key], m.isInv, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }}
                              />
                            </>
                          )}

                          {granularity === 'weekly' && (
                            <>
                              {mtdWeeks.map((w) => {
                                const wData = c.weeks[w] || { curSpend: 0, prevSpend: 0, curAdsGmv: 0, prevAdsGmv: 0, curSales: 0, prevSales: 0 };
                                const wRoasCur = wData.curSpend > 0 ? wData.curAdsGmv / wData.curSpend : 0;
                                const wRoasPrev = wData.prevSpend > 0 ? wData.prevAdsGmv / wData.prevSpend : 0;
                                const wCirCur = wData.curSales > 0 ? (wData.curSpend / wData.curSales) * 100 : 0;
                                const wCirPrev = wData.prevSales > 0 ? (wData.prevSpend / wData.prevSales) * 100 : 0;

                                const curVal = m.key === 'spend' ? wData.curSpend : m.key === 'adsGmv' ? wData.curAdsGmv : m.key === 'sales' ? wData.curSales : m.key === 'roas' ? wRoasCur : wCirCur;
                                const prevVal = m.key === 'spend' ? wData.prevSpend : m.key === 'adsGmv' ? wData.prevAdsGmv : m.key === 'sales' ? wData.prevSales : m.key === 'roas' ? wRoasPrev : wCirPrev;

                                return (
                                  <React.Fragment key={`cluster-${c.cluster}-${w}-${m.key}`}>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold border-l border-b ${borderCol} ${mainText}`}>
                                      {m.fmt(curVal)}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono font-medium text-slate-400 border-b ${borderCol}`}>
                                      {m.fmt(prevVal)}
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-right font-mono font-bold border-b ${borderCol}`}
                                      dangerouslySetInnerHTML={{ __html: getGrHTML(curVal, prevVal, m.isInv, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }}
                                    />
                                  </React.Fragment>
                                );
                              })}

                              <td className={`px-4 py-2 text-right font-mono font-bold border-l border-b ${borderCol} ${isDarkMode ? 'text-indigo-300 bg-indigo-950/40 border-indigo-900/50' : 'text-indigo-700 bg-indigo-50/50 border-indigo-100'}`}>
                                {m.fmt(curTotMap[m.key])}
                              </td>
                              <td className={`px-4 py-2 text-right font-mono font-medium text-slate-400 border-b ${borderCol} ${isDarkMode ? 'bg-indigo-950/20' : 'bg-indigo-50/30'}`}>
                                {m.fmt(prevTotMap[m.key])}
                              </td>
                              <td
                                className={`px-4 py-2 text-right font-mono font-bold border-b ${borderCol}`}
                                dangerouslySetInnerHTML={{ __html: getGrHTML(curTotMap[m.key], prevTotMap[m.key], m.isInv, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }}
                              />
                            </>
                          )}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. Tracking Table Card with Frozen Columns & Table Options */}
      <div className={`rounded-md border ${borderCol} shadow-sm overflow-hidden ${cardBg}`}>
        {/* Table Options Header */}
        <div className={`p-4 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${isDarkMode ? 'border-slate-800 bg-[#111827]/50' : 'border-slate-100 bg-white'}`}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`font-black uppercase tracking-wider text-xs sm:text-sm ${mainText}`}>
                PID Performance & Push Rank Tracking
              </h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                effectiveView === 'mtd'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {effectiveView === 'mtd' ? 'MTD POV' : 'Daily POV'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {effectiveView === 'mtd'
                ? `MTD Performance comparison (${granularity === 'weekly' ? 'Weekly progression' : 'Monthly comparison'}) · Click any metric cell to inspect details`
                : `Daily tracking across ${activeDates.length} days · Click any metric cell to inspect details`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Table Option Pill Switcher */}
            <div className={`flex items-center p-1 rounded-md border ${isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
              <button
                onClick={() => setTableOption('mtd')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  effectiveView === 'mtd'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                MTD POV
              </button>
              <button
                onClick={() => setTableOption('daily')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  effectiveView === 'daily'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Daily Breakdown
              </button>
            </div>

            {/* Layout switch when in MTD POV */}
            {effectiveView === 'mtd' && (
              <div className={`flex items-center p-1 rounded-md border ${isDarkMode ? 'bg-[#090d16] border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <button
                  onClick={() => setMtdLayout('rows')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    mtdLayout === 'rows'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Metric Rows Layout (Exact Digital Media / Commerce Tracker style)"
                >
                  Metric Rows
                </button>
                <button
                  onClick={() => setMtdLayout('compact')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    mtdLayout === 'compact'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Compact Layout (1 Row per PID with Metric Columns)"
                >
                  Compact PID
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Custom Table CSS for sticky columns */}
        <style dangerouslySetInnerHTML={{ __html: `
          .pid-tracker-table { border-collapse: separate !important; border-spacing: 0 !important; table-layout: fixed !important; }
          .pid-tracker-table thead tr.pid-header-row-1 th { position: sticky !important; top: 0px !important; }
          .pid-tracker-table thead tr.pid-header-row-2 th { position: sticky !important; top: 38px !important; }

          .pid-tracker-table thead tr.pid-header-row-1 th.pid-freeze-col,
          .pid-tracker-table thead tr.pid-header-row-2 th.pid-freeze-col {
            position: sticky !important;
            z-index: 60 !important;
            background-color: #0f172a !important;
            color: #ffffff !important;
          }

          .pid-tracker-table .pid-col-1 { position: sticky !important; left: 0px !important; width: 130px !important; min-width: 130px !important; max-width: 130px !important; }
          .pid-tracker-table .pid-col-2 { position: sticky !important; left: 130px !important; width: 140px !important; min-width: 140px !important; max-width: 140px !important; }
          .pid-tracker-table .pid-col-3 { position: sticky !important; left: 270px !important; width: 280px !important; min-width: 280px !important; max-width: 280px !important; }
          .pid-tracker-table .pid-col-4 { position: sticky !important; left: 550px !important; width: 160px !important; min-width: 160px !important; max-width: 160px !important; }
          .pid-tracker-table .pid-col-5 { position: sticky !important; left: 710px !important; width: 110px !important; min-width: 110px !important; max-width: 110px !important; }

          .pid-tracker-table thead tr.pid-header-row-1 th.pid-scroll-header { position: sticky !important; top: 0px !important; z-index: 30 !important; background-color: #0f172a !important; color: #ffffff !important; }
          .pid-tracker-table thead tr.pid-header-row-2 th.pid-scroll-header { position: sticky !important; top: 38px !important; z-index: 30 !important; background-color: #182338 !important; color: #ffffff !important; }

          .pid-tracker-table tbody td.pid-freeze-col { position: sticky !important; z-index: 20 !important; }
          .pid-tracker-table tbody td:not(.pid-freeze-col) { position: static !important; z-index: 1 !important; }
        `}} />

        <div className="overflow-auto max-h-[75vh]">
          {/* ============================================================== */}
          {/* VIEW OPTION A: MTD PERFORMANCE POV (METRIC ROWS LAYOUT)        */}
          {/* ============================================================== */}
          {effectiveView === 'mtd' && mtdLayout === 'rows' && (
            <table
              className="pid-tracker-table table-fixed text-left border-separate border-spacing-0 text-xs whitespace-nowrap"
              style={{ tableLayout: 'fixed', width: `${tableTotalWidth}px`, minWidth: '100%' }}
            >
              <colgroup>
                <col style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} />
                <col style={{ width: '140px', minWidth: '140px', maxWidth: '140px' }} />
                <col style={{ width: '280px', minWidth: '280px', maxWidth: '280px' }} />
                <col style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }} />
                <col style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }} />
                {granularity === 'weekly' ? (
                  <>
                    {mtdWeeks.flatMap((w) => [
                      <col key={`${w}-c`} style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }} />,
                      <col key={`${w}-p`} style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }} />,
                      <col key={`${w}-g`} style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} />
                    ])}
                    <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                    <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                    <col style={{ width: '95px', minWidth: '95px', maxWidth: '95px' }} />
                  </>
                ) : (
                  <>
                    <col style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} />
                    <col style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} />
                    <col style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }} />
                  </>
                )}
              </colgroup>

              <thead className="font-bold uppercase tracking-wider text-[11px]">
                <tr className="pid-header-row-1 border-b border-slate-700/40 h-[38px]">
                  <th
                    onClick={() => handleSort('cluster')}
                    className="pid-freeze-col pid-col-1 w-[130px] min-w-[130px] max-w-[130px] py-2.5 px-3 border-r border-slate-700 bg-[#0f172a] text-white font-black cursor-pointer hover:underline select-none align-middle text-left"
                  >
                    <div className="w-[104px] truncate">
                      Cluster {sortField === 'cluster' ? (sortAsc ? '▲' : '▼') : ''}
                    </div>
                  </th>

                  <th className="pid-freeze-col pid-col-2 w-[140px] min-w-[140px] max-w-[140px] py-2.5 px-3 border-r border-slate-700 bg-[#0f172a] text-white font-black align-middle text-left">
                    <div className="w-[114px] truncate">CID</div>
                  </th>

                  <th
                    onClick={() => handleSort('skuName')}
                    className="pid-freeze-col pid-col-3 w-[280px] min-w-[280px] max-w-[280px] py-2.5 px-4 border-r border-slate-700 bg-[#0f172a] text-white font-black cursor-pointer hover:underline select-none align-middle text-left"
                  >
                    <div className="w-[248px] truncate">
                      SKU Name {sortField === 'skuName' ? (sortAsc ? '▲' : '▼') : ''}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('pid')}
                    className="pid-freeze-col pid-col-4 w-[160px] min-w-[160px] max-w-[160px] py-2.5 px-3 border-r border-slate-700 bg-[#0f172a] text-white font-black cursor-pointer hover:underline select-none align-middle text-left"
                  >
                    <div className="w-[134px] truncate">
                      PID {sortField === 'pid' ? (sortAsc ? '▲' : '▼') : ''}
                    </div>
                  </th>

                  <th className="pid-freeze-col pid-col-5 w-[110px] min-w-[110px] max-w-[110px] py-2.5 px-3 border-r-2 border-slate-600 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.3)] bg-[#0f172a] text-white font-black align-middle text-left">
                    Metric
                  </th>

                  {granularity === 'weekly' ? (
                    <>
                      {mtdWeeks.map((w) => {
                        const lbl = mtdWeekDateLabels[w] || { curLabel: `MTD ${w}`, prevLabel: `MTD Prev ${w}` };
                        return (
                          <React.Fragment key={`hdr-${w}`}>
                            <th className="pid-scroll-header py-2.5 px-3 text-right border-l border-b border-slate-700 bg-[#0f172a] text-white font-black whitespace-nowrap">
                              {lbl.curLabel}
                            </th>
                            <th className="pid-scroll-header py-2.5 px-3 text-right text-slate-400 bg-[#0f172a] font-bold border-b border-slate-700 whitespace-nowrap">
                              {lbl.prevLabel}
                            </th>
                            <th className="pid-scroll-header py-2.5 px-3 text-right bg-[#0f172a] text-white font-bold border-b border-slate-700 whitespace-nowrap">
                              GR%
                            </th>
                          </React.Fragment>
                        );
                      })}
                      <th className="pid-scroll-header py-2.5 px-4 text-right border-l border-indigo-500 text-indigo-300 bg-[#020617] font-bold border-b border-slate-700 whitespace-nowrap">
                        MTD Total Cur
                      </th>
                      <th className="pid-scroll-header py-2.5 px-4 text-right text-slate-400 bg-[#020617] font-bold border-b border-slate-700 whitespace-nowrap">
                        MTD Total Prev
                      </th>
                      <th className="pid-scroll-header py-2.5 px-4 text-right text-indigo-300 bg-[#020617] font-bold border-b border-slate-700 whitespace-nowrap">
                        Total GR%
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="pid-scroll-header py-2.5 px-4 text-right text-white bg-[#0f172a] font-bold border-b border-slate-700">
                        This Month
                      </th>
                      <th className="pid-scroll-header py-2.5 px-4 text-right text-slate-400 bg-[#0f172a] font-bold border-b border-slate-700">
                        Prev Month
                      </th>
                      <th className="pid-scroll-header py-2.5 px-4 text-right text-white bg-[#0f172a] font-bold border-b border-slate-700">
                        GR%
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {paginatedItems.map((item) => {
                  const metricRows = [
                    { key: 'spend' as MetricType, name: 'Spend', isInv: true, fmt: (v: number) => v > 0 ? formatNum(v) : '-' },
                    { key: 'adsGmv' as MetricType, name: 'Ads GMV', isInv: false, fmt: (v: number) => v > 0 ? formatNum(v) : '-' },
                    { key: 'sales' as MetricType, name: 'Sales', isInv: false, fmt: (v: number) => v > 0 ? formatNum(v) : '-' },
                    { key: 'roas' as MetricType, name: 'ROAS', isInv: false, fmt: (v: number) => v > 0 ? `${v.toFixed(2)}x` : '-' },
                    { key: 'cir' as MetricType, name: 'CIR', isInv: true, fmt: (v: number) => v > 0 ? `${v.toFixed(2)}%` : '-' }
                  ];

                  return metricRows.map((m, mIdx) => {
                    const isLast = mIdx === metricRows.length - 1;
                    const rowBorderBottom = isLast ? 'border-b-2 border-slate-600 dark:border-slate-700' : `border-b ${borderCol}`;
                    const rowBg = mIdx % 2 === 0
                      ? isDarkMode ? 'bg-[#0f172a]' : 'bg-white'
                      : isDarkMode ? 'bg-[#111827]' : 'bg-slate-50';

                    const adj = getPidMtdAdjustment(item.pid, m.key);
                    const hasAdj = Boolean(adj);

                    return (
                      <tr key={`pid-${item.pid}-${m.key}`} className={`group ${rowBg} ${tableRowHoverBg} transition-colors`}>
                        {/* Frozen Column 1: Cluster (rowspan=5) */}
                        {mIdx === 0 && (
                          <td
                            rowSpan={5}
                            className={`pid-freeze-col pid-col-1 w-[130px] min-w-[130px] max-w-[130px] py-3 px-3 border-r ${borderCol} border-b-2 border-slate-600 dark:border-slate-700 ${tableFreezeBg} ${tableFreezeHoverBg} align-top truncate`}
                          >
                            <div className="w-[104px] max-w-[104px] truncate">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border truncate max-w-[104px] ${
                                  isDarkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
                                }`}
                                title={item.cluster}
                              >
                                {item.cluster}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Frozen Column 2: CID (rowspan=5) */}
                        {mIdx === 0 && (
                          <td
                            rowSpan={5}
                            className={`pid-freeze-col pid-col-2 w-[140px] min-w-[140px] max-w-[140px] py-3 px-3 border-r ${borderCol} border-b-2 border-slate-600 dark:border-slate-700 font-mono text-[11px] font-semibold ${tableFreezeBg} ${tableFreezeHoverBg} ${secText} align-top select-all truncate`}
                          >
                            <div className="w-[114px] max-w-[114px] truncate" title={item.cid || '-'}>
                              {item.cid || '-'}
                            </div>
                          </td>
                        )}

                        {/* Frozen Column 3: SKU Name (rowspan=5) */}
                        {mIdx === 0 && (
                          <td
                            rowSpan={5}
                            className={`pid-freeze-col pid-col-3 w-[280px] min-w-[280px] max-w-[280px] py-3 px-4 border-r ${borderCol} border-b-2 border-slate-600 dark:border-slate-700 ${tableFreezeBg} ${tableFreezeHoverBg} align-top truncate`}
                            title={item.skuName}
                          >
                            <div className="w-[248px] max-w-[248px] truncate">
                              <div className={`font-bold truncate max-w-[248px] leading-snug ${mainText}`} title={item.skuName}>
                                {item.skuName}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                                {item.brand && (
                                  <span className={`text-[10px] font-semibold ${secText} truncate max-w-[110px] shrink-0`} title={item.brand}>
                                    {item.brand}
                                  </span>
                                )}
                                {item.isPushRank && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                    Push Rank PID
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Frozen Column 4: PID (rowspan=5) */}
                        {mIdx === 0 && (
                          <td
                            rowSpan={5}
                            className={`pid-freeze-col pid-col-4 w-[160px] min-w-[160px] max-w-[160px] py-3 px-3 border-r ${borderCol} border-b-2 border-slate-600 dark:border-slate-700 font-mono text-[11px] font-black ${tableFreezeBg} ${tableFreezeHoverBg} ${mainText} align-top select-all truncate`}
                          >
                            <div className="w-[134px] max-w-[134px] truncate" title={cleanPid(item.pid)}>
                              {cleanPid(item.pid)}
                            </div>
                          </td>
                        )}

                        {/* Frozen Column 5: Metric */}
                        <td
                          onClick={() => setActiveDrilldown({ pidItem: item, metric: m.key })}
                          className={`pid-freeze-col pid-col-5 w-[110px] min-w-[110px] max-w-[110px] py-2 px-3 border-r-2 ${isDarkMode ? 'border-slate-600' : 'border-slate-300'} shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)] ${rowBorderBottom} font-bold text-xs ${tableFreezeBg} ${tableFreezeHoverBg} ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} cursor-pointer hover:text-indigo-400`}
                        >
                          {m.name}
                        </td>

                        {/* Scrolling Timeline Columns */}
                        {granularity === 'weekly' ? (
                          <>
                            {mtdWeeks.map((w) => {
                              const wMetric = item.mtdData.weeks[w]?.[m.key] || { cur: 0, prev: 0, gr: 0 };
                              const curVal = wMetric.cur;
                              const prevVal = wMetric.prev;
                              const weekAdj = getPidMtdAdjustment(item.pid, m.key, w);

                              return (
                                <React.Fragment key={`cell-${item.pid}-${w}-${m.key}`}>
                                  <td
                                    onClick={() => setActiveDrilldown({ pidItem: item, metric: m.key })}
                                    className={`w-[110px] min-w-[110px] max-w-[110px] py-2 px-3 text-right font-mono border-l ${rowBorderBottom} ${borderCol} cursor-pointer hover:bg-indigo-500/10 transition-colors`}
                                    title={weekAdj ? `${m.name}: ${m.fmt(curVal)}\nAdjustment: ${weekAdj.adjustment}` : `Click to view ${m.name} details`}
                                  >
                                    <div className="relative inline-flex items-center justify-end w-full">
                                      <span className={curVal > 0 ? `${mainText} font-bold` : `${secText}`}>
                                        {m.fmt(curVal)}
                                      </span>
                                      {weekAdj && (
                                        <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                                      )}
                                    </div>
                                  </td>
                                  <td className={`w-[110px] min-w-[110px] max-w-[110px] py-2 px-3 text-right font-mono text-slate-400 ${rowBorderBottom} ${borderCol}`}>
                                    {m.fmt(prevVal)}
                                  </td>
                                  <td
                                    className={`w-[90px] min-w-[90px] max-w-[90px] py-2 px-2 text-right font-mono font-bold ${rowBorderBottom} ${borderCol}`}
                                    dangerouslySetInnerHTML={{ __html: getGrHTML(curVal, prevVal, m.isInv, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }}
                                  />
                                </React.Fragment>
                              );
                            })}

                            {/* MTD Total Columns */}
                            {(() => {
                              const curTotal = m.key === 'spend' ? item.mtdData.curSpend : m.key === 'adsGmv' ? item.mtdData.curAdsGmv : m.key === 'sales' ? item.mtdData.curSales : m.key === 'roas' ? item.mtdData.curRoas : item.mtdData.curCir;
                              const prevTotal = m.key === 'spend' ? item.mtdData.prevSpend : m.key === 'adsGmv' ? item.mtdData.prevAdsGmv : m.key === 'sales' ? item.mtdData.prevSales : m.key === 'roas' ? item.mtdData.prevRoas : item.mtdData.prevCir;

                              return (
                                <>
                                  <td
                                    onClick={() => setActiveDrilldown({ pidItem: item, metric: m.key })}
                                    className={`w-[120px] min-w-[120px] max-w-[120px] py-2 px-3 text-right font-mono font-bold border-l border-indigo-500/60 ${rowBorderBottom} ${
                                      isDarkMode ? 'text-indigo-300 bg-indigo-950/40' : 'text-indigo-700 bg-indigo-50/50'
                                    } cursor-pointer hover:underline`}
                                    title={hasAdj ? `${m.name} Total: ${m.fmt(curTotal)}\nAdjustment: ${adj?.adjustment}` : `Click to view ${m.name} details`}
                                  >
                                    <div className="relative inline-flex items-center justify-end w-full">
                                      <span>{m.fmt(curTotal)}</span>
                                      {hasAdj && (
                                        <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                                      )}
                                    </div>
                                  </td>
                                  <td className={`w-[120px] min-w-[120px] max-w-[120px] py-2 px-3 text-right font-mono text-slate-400 ${rowBorderBottom} ${borderCol} ${isDarkMode ? 'bg-indigo-950/20' : 'bg-indigo-50/30'}`}>
                                    {m.fmt(prevTotal)}
                                  </td>
                                  <td
                                    className={`w-[95px] min-w-[95px] max-w-[95px] py-2 px-2 text-right font-mono font-bold ${rowBorderBottom} ${borderCol}`}
                                    dangerouslySetInnerHTML={{ __html: getGrHTML(curTotal, prevTotal, m.isInv, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }}
                                  />
                                </>
                              );
                            })()}
                          </>
                        ) : (
                          /* Monthly Columns */
                          (() => {
                            const curVal = m.key === 'spend' ? item.mtdData.curSpend : m.key === 'adsGmv' ? item.mtdData.curAdsGmv : m.key === 'sales' ? item.mtdData.curSales : m.key === 'roas' ? item.mtdData.curRoas : item.mtdData.curCir;
                            const prevVal = m.key === 'spend' ? item.mtdData.prevSpend : m.key === 'adsGmv' ? item.mtdData.prevAdsGmv : m.key === 'sales' ? item.mtdData.prevSales : m.key === 'roas' ? item.mtdData.prevRoas : item.mtdData.prevCir;

                            return (
                              <>
                                <td
                                  onClick={() => setActiveDrilldown({ pidItem: item, metric: m.key })}
                                  className={`w-[130px] min-w-[130px] max-w-[130px] py-2 px-4 text-right font-mono font-bold ${rowBorderBottom} ${borderCol} cursor-pointer hover:bg-indigo-500/10 transition-colors`}
                                  title={hasAdj ? `${m.name}: ${m.fmt(curVal)}\nAdjustment: ${adj?.adjustment}` : `Click to view ${m.name} details`}
                                >
                                  <div className="relative inline-flex items-center justify-end w-full">
                                    <span className={curVal > 0 ? `${mainText} font-bold` : `${secText}`}>
                                      {m.fmt(curVal)}
                                    </span>
                                    {hasAdj && (
                                      <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                                    )}
                                  </div>
                                </td>
                                <td className={`w-[130px] min-w-[130px] max-w-[130px] py-2 px-4 text-right font-mono text-slate-400 ${rowBorderBottom} ${borderCol}`}>
                                  {m.fmt(prevVal)}
                                </td>
                                <td
                                  className={`w-[100px] min-w-[100px] max-w-[100px] py-2 px-3 text-right font-mono font-bold ${rowBorderBottom} ${borderCol}`}
                                  dangerouslySetInnerHTML={{ __html: getGrHTML(curVal, prevVal, m.isInv, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }}
                                />
                              </>
                            );
                          })()
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          )}

          {/* ============================================================== */}
          {/* VIEW OPTION B: MTD COMPACT PID VIEW (1 ROW PER PID)            */}
          {/* ============================================================== */}
          {effectiveView === 'mtd' && mtdLayout === 'compact' && (
            <table
              className="pid-tracker-table table-fixed text-left border-separate border-spacing-0 text-xs whitespace-nowrap"
              style={{ tableLayout: 'fixed', width: `${tableTotalWidth}px`, minWidth: '100%' }}
            >
              <thead className="font-bold uppercase tracking-wider text-[11px]">
                <tr className="pid-header-row-1 border-b border-slate-700/40 h-[38px]">
                  <th onClick={() => handleSort('cluster')} className="pid-freeze-col pid-col-1 w-[130px] min-w-[130px] py-2.5 px-3 border-r border-slate-700 bg-[#0f172a] text-white font-black cursor-pointer align-middle">
                    Cluster {sortField === 'cluster' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="pid-freeze-col pid-col-2 w-[140px] min-w-[140px] py-2.5 px-3 border-r border-slate-700 bg-[#0f172a] text-white font-black align-middle">
                    CID
                  </th>
                  <th onClick={() => handleSort('skuName')} className="pid-freeze-col pid-col-3 w-[280px] min-w-[280px] py-2.5 px-4 border-r border-slate-700 bg-[#0f172a] text-white font-black cursor-pointer align-middle">
                    SKU Name {sortField === 'skuName' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th onClick={() => handleSort('pid')} className="pid-freeze-col pid-col-4 w-[160px] min-w-[160px] py-2.5 px-3 border-r-2 border-slate-600 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.3)] bg-[#0f172a] text-white font-black cursor-pointer align-middle">
                    PID {sortField === 'pid' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th colSpan={3} className="pid-scroll-header text-center py-2 px-3 border-r border-b border-slate-700 bg-[#0f172a] text-white font-black">Spend</th>
                  <th colSpan={3} className="pid-scroll-header text-center py-2 px-3 border-r border-b border-slate-700 bg-[#0f172a] text-white font-black">Ads GMV</th>
                  <th colSpan={3} className="pid-scroll-header text-center py-2 px-3 border-r border-b border-slate-700 bg-[#0f172a] text-white font-black">Sales</th>
                  <th colSpan={3} className="pid-scroll-header text-center py-2 px-3 border-r border-b border-slate-700 bg-[#0f172a] text-white font-black">ROAS</th>
                  <th colSpan={3} className="pid-scroll-header text-center py-2 px-3 border-r border-b border-slate-700 bg-[#0f172a] text-white font-black">CIR</th>
                </tr>
                <tr className="pid-header-row-2 border-b border-slate-700 h-[36px]">
                  <th className="pid-freeze-col pid-col-1 w-[130px] py-1 px-3 border-r border-b border-slate-700 bg-[#0f172a]">&nbsp;</th>
                  <th className="pid-freeze-col pid-col-2 w-[140px] py-1 px-3 border-r border-b border-slate-700 bg-[#0f172a]">&nbsp;</th>
                  <th className="pid-freeze-col pid-col-3 w-[280px] py-1 px-4 border-r border-b border-slate-700 bg-[#0f172a]">&nbsp;</th>
                  <th className="pid-freeze-col pid-col-4 w-[160px] py-1 px-3 border-r-2 border-b border-slate-600 bg-[#0f172a]">&nbsp;</th>
                  {['Spend', 'Ads GMV', 'Sales', 'ROAS', 'CIR'].map((_, idx) => (
                    <React.Fragment key={`sub-c-${idx}`}>
                      <th className="pid-scroll-header py-1 px-2 text-right border-r border-b border-slate-700 bg-[#182338] text-white w-[90px]">Current</th>
                      <th className="pid-scroll-header py-1 px-2 text-right border-r border-b border-slate-700 bg-[#182338] text-slate-300 w-[90px]">Previous</th>
                      <th className="pid-scroll-header py-1 px-2 text-right border-r border-b border-slate-700 bg-[#182338] text-white w-[75px]">GR%</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => (
                  <tr key={`compact-${item.pid}`} className={`group hover:${tableRowHoverBg} transition-colors border-b ${borderCol}`}>
                    <td className={`pid-freeze-col pid-col-1 py-2.5 px-3 border-r border-b ${borderCol} ${tableFreezeBg} truncate font-bold`}>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border truncate max-w-[104px] ${
                        isDarkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}>
                        {item.cluster}
                      </span>
                    </td>
                    <td className={`pid-freeze-col pid-col-2 py-2.5 px-3 border-r border-b ${borderCol} font-mono text-[11px] ${tableFreezeBg} ${secText} truncate`}>
                      {item.cid || '-'}
                    </td>
                    <td className={`pid-freeze-col pid-col-3 py-2.5 px-4 border-r border-b ${borderCol} ${tableFreezeBg} truncate`} title={item.skuName}>
                      <div className={`font-bold truncate max-w-[248px] ${mainText}`}>{item.skuName}</div>
                      {item.isPushRank && (
                        <span className="inline-flex items-center gap-1 mt-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-500/15 text-rose-500 border border-rose-500/30">
                          Push Rank
                        </span>
                      )}
                    </td>
                    <td className={`pid-freeze-col pid-col-4 py-2.5 px-3 border-r-2 border-b ${isDarkMode ? 'border-slate-600' : 'border-slate-400'} font-mono text-[11px] font-black ${tableFreezeBg} ${mainText} truncate`}>
                      {cleanPid(item.pid)}
                    </td>

                    {/* Spend */}
                    <td onClick={() => setActiveDrilldown({ pidItem: item, metric: 'spend' })} className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol} cursor-pointer hover:bg-indigo-500/10`}>
                      {item.mtdData.curSpend > 0 ? formatNum(item.mtdData.curSpend) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono text-slate-400 border-r border-b ${borderCol}`}>
                      {item.mtdData.prevSpend > 0 ? formatNum(item.mtdData.prevSpend) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol}`} dangerouslySetInnerHTML={{ __html: getGrHTML(item.mtdData.curSpend, item.mtdData.prevSpend, true, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }} />

                    {/* Ads GMV */}
                    <td onClick={() => setActiveDrilldown({ pidItem: item, metric: 'adsGmv' })} className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol} cursor-pointer hover:bg-indigo-500/10`}>
                      {item.mtdData.curAdsGmv > 0 ? formatNum(item.mtdData.curAdsGmv) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono text-slate-400 border-r border-b ${borderCol}`}>
                      {item.mtdData.prevAdsGmv > 0 ? formatNum(item.mtdData.prevAdsGmv) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol}`} dangerouslySetInnerHTML={{ __html: getGrHTML(item.mtdData.curAdsGmv, item.mtdData.prevAdsGmv, false, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }} />

                    {/* Sales */}
                    <td onClick={() => setActiveDrilldown({ pidItem: item, metric: 'sales' })} className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol} cursor-pointer hover:bg-indigo-500/10`}>
                      {item.mtdData.curSales > 0 ? formatNum(item.mtdData.curSales) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono text-slate-400 border-r border-b ${borderCol}`}>
                      {item.mtdData.prevSales > 0 ? formatNum(item.mtdData.prevSales) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol}`} dangerouslySetInnerHTML={{ __html: getGrHTML(item.mtdData.curSales, item.mtdData.prevSales, false, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }} />

                    {/* ROAS */}
                    <td onClick={() => setActiveDrilldown({ pidItem: item, metric: 'roas' })} className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol} cursor-pointer hover:bg-indigo-500/10`}>
                      {item.mtdData.curRoas > 0 ? `${item.mtdData.curRoas.toFixed(2)}x` : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono text-slate-400 border-r border-b ${borderCol}`}>
                      {item.mtdData.prevRoas > 0 ? `${item.mtdData.prevRoas.toFixed(2)}x` : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol}`} dangerouslySetInnerHTML={{ __html: getGrHTML(item.mtdData.curRoas, item.mtdData.prevRoas, false, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }} />

                    {/* CIR */}
                    <td onClick={() => setActiveDrilldown({ pidItem: item, metric: 'cir' })} className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol} cursor-pointer hover:bg-indigo-500/10`}>
                      {item.mtdData.curCir > 0 ? `${item.mtdData.curCir.toFixed(2)}%` : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono text-slate-400 border-r border-b ${borderCol}`}>
                      {item.mtdData.prevCir > 0 ? `${item.mtdData.prevCir.toFixed(2)}%` : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono font-bold border-r border-b ${borderCol}`} dangerouslySetInnerHTML={{ __html: getGrHTML(item.mtdData.curCir, item.mtdData.prevCir, true, isDarkMode).replace(/<td[^>]*>/, '').replace(/<\/td>/, '') }} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ============================================================== */}
          {/* VIEW OPTION C: DAILY BREAKDOWN TABLE (ORIGINAL DAILY TRACKING) */}
          {/* ============================================================== */}
          {effectiveView === 'daily' && (
            <table
              className="pid-tracker-table table-fixed text-left border-separate border-spacing-0 text-xs whitespace-nowrap"
              style={{ tableLayout: 'fixed', width: `${tableTotalWidth}px`, minWidth: '100%' }}
            >
              <colgroup>
                <col style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} />
                <col style={{ width: '140px', minWidth: '140px', maxWidth: '140px' }} />
                <col style={{ width: '280px', minWidth: '280px', maxWidth: '280px' }} />
                <col style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }} />
                {activeDates.flatMap((d) => [
                  <col key={`${d}-sp`} style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} />,
                  <col key={`${d}-gm`} style={{ width: '95px', minWidth: '95px', maxWidth: '95px' }} />,
                  <col key={`${d}-sa`} style={{ width: '95px', minWidth: '95px', maxWidth: '95px' }} />,
                  <col key={`${d}-ro`} style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }} />,
                  <col key={`${d}-ci`} style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }} />
                ])}
              </colgroup>

              <thead className="font-bold uppercase tracking-wider text-[11px]">
                <tr className="pid-header-row-1 border-b border-slate-700/40 h-[38px]">
                  <th
                    onClick={() => handleSort('cluster')}
                    className="pid-freeze-col pid-col-1 w-[130px] min-w-[130px] max-w-[130px] pt-2.5 pb-1 px-3 border-r border-slate-700 bg-[#0f172a] text-white font-black cursor-pointer hover:underline select-none align-bottom text-left"
                  >
                    <div className="w-[104px] truncate">
                      Cluster {sortField === 'cluster' ? (sortAsc ? '▲' : '▼') : ''}
                    </div>
                  </th>

                  <th className="pid-freeze-col pid-col-2 w-[140px] min-w-[140px] max-w-[140px] pt-2.5 pb-1 px-3 border-r border-slate-700 bg-[#0f172a] text-white font-black align-bottom text-left">
                    <div className="w-[114px] truncate">CID</div>
                  </th>

                  <th
                    onClick={() => handleSort('skuName')}
                    className="pid-freeze-col pid-col-3 w-[280px] min-w-[280px] max-w-[280px] pt-2.5 pb-1 px-4 border-r border-slate-700 bg-[#0f172a] text-white font-black cursor-pointer hover:underline select-none align-bottom text-left"
                  >
                    <div className="w-[248px] truncate">
                      SKU Name {sortField === 'skuName' ? (sortAsc ? '▲' : '▼') : ''}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('pid')}
                    className="pid-freeze-col pid-col-4 w-[160px] min-w-[160px] max-w-[160px] pt-2.5 pb-1 px-3 border-r-2 border-slate-600 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.3)] bg-[#0f172a] text-white font-black cursor-pointer hover:underline select-none align-bottom text-left"
                  >
                    <div className="w-[134px] truncate">
                      PID {sortField === 'pid' ? (sortAsc ? '▲' : '▼') : ''}
                    </div>
                  </th>

                  {activeDates.map((dateStr) => (
                    <th
                      key={dateStr}
                      colSpan={5}
                      className="pid-scroll-header py-2.5 px-3 text-center border-r border-b border-slate-700 bg-[#0f172a] text-white font-black tracking-wide h-[38px]"
                    >
                      {formatDisplayDate(dateStr)}
                    </th>
                  ))}
                </tr>

                <tr className="pid-header-row-2 border-b border-slate-700 h-[36px]">
                  <th className="pid-freeze-col pid-col-1 w-[130px] min-w-[130px] max-w-[130px] py-1 px-3 border-r border-b border-slate-700 bg-[#0f172a] select-none">&nbsp;</th>
                  <th className="pid-freeze-col pid-col-2 w-[140px] min-w-[140px] max-w-[140px] py-1 px-3 border-r border-b border-slate-700 bg-[#0f172a] select-none">&nbsp;</th>
                  <th className="pid-freeze-col pid-col-3 w-[280px] min-w-[280px] max-w-[280px] py-1 px-4 border-r border-b border-slate-700 bg-[#0f172a] select-none">&nbsp;</th>
                  <th className="pid-freeze-col pid-col-4 w-[160px] min-w-[160px] max-w-[160px] py-1 px-3 border-r-2 border-b border-slate-600 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.3)] bg-[#0f172a] select-none">&nbsp;</th>

                  {activeDates.map((dateStr) => (
                    <React.Fragment key={`sub-${dateStr}`}>
                      <th className="pid-scroll-header w-[90px] min-w-[90px] max-w-[90px] py-2 px-2 text-right font-black border-r border-b border-slate-700 bg-[#182338] text-white">Spend</th>
                      <th className="pid-scroll-header w-[95px] min-w-[95px] max-w-[95px] py-2 px-2 text-right font-black border-r border-b border-slate-700 bg-[#182338] text-white">Ads GMV</th>
                      <th className="pid-scroll-header w-[95px] min-w-[95px] max-w-[95px] py-2 px-2 text-right font-black border-r border-b border-slate-700 bg-[#182338] text-white">Sales</th>
                      <th className="pid-scroll-header w-[70px] min-w-[70px] max-w-[70px] py-2 px-2 text-right font-black border-r border-b border-slate-700 bg-[#182338] text-white">ROAS</th>
                      <th className="pid-scroll-header w-[70px] min-w-[70px] max-w-[70px] py-2 px-2 text-right font-black border-r border-b border-slate-700 bg-[#182338] text-white">CIR</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {paginatedItems.map((item) => (
                  <tr key={item.pid} className={`group transition-colors ${tableRowHoverBg}`}>
                    <td className={`pid-freeze-col pid-col-1 w-[130px] min-w-[130px] max-w-[130px] py-3 px-3 border-r border-b ${borderCol} ${tableFreezeBg} ${tableFreezeHoverBg} truncate`}>
                      <div className="w-[104px] max-w-[104px] truncate">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border truncate max-w-[104px] ${
                            isDarkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                          title={item.cluster}
                        >
                          {item.cluster}
                        </span>
                      </div>
                    </td>

                    <td className={`pid-freeze-col pid-col-2 w-[140px] min-w-[140px] max-w-[140px] py-3 px-3 border-r border-b ${borderCol} font-mono text-[11px] font-semibold ${tableFreezeBg} ${tableFreezeHoverBg} ${secText} select-all truncate`}>
                      <div className="w-[114px] max-w-[114px] truncate" title={item.cid || '-'}>
                        {item.cid || '-'}
                      </div>
                    </td>

                    <td className={`pid-freeze-col pid-col-3 w-[280px] min-w-[280px] max-w-[280px] py-3 px-4 border-r border-b ${borderCol} ${tableFreezeBg} ${tableFreezeHoverBg} truncate`} title={item.skuName}>
                      <div className="w-[248px] max-w-[248px] truncate">
                        <div className={`font-bold truncate max-w-[248px] leading-snug ${mainText}`} title={item.skuName}>
                          {item.skuName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                          {item.brand && (
                            <span className={`text-[10px] font-semibold ${secText} truncate max-w-[110px] shrink-0`} title={item.brand}>
                              {item.brand}
                            </span>
                          )}
                          {item.isPushRank && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Push Rank PID
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className={`pid-freeze-col pid-col-4 w-[160px] min-w-[160px] max-w-[160px] py-3 px-3 border-r-2 border-b ${isDarkMode ? 'border-slate-600' : 'border-slate-400'} shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)] font-mono text-[11px] font-black ${tableFreezeBg} ${tableFreezeHoverBg} ${mainText} select-all truncate`}>
                      <div className="w-[134px] max-w-[134px] truncate" title={cleanPid(item.pid)}>
                        {cleanPid(item.pid)}
                      </div>
                    </td>

                    {/* Daily Metric Cells */}
                    {activeDates.map((dateStr) => {
                      const rec = item.dailyData[dateStr] || {
                        date: dateStr,
                        displayDate: formatDisplayDate(dateStr),
                        spend: 0,
                        adsGmv: 0,
                        sales: 0,
                        roas: 0,
                        cir: 0
                      };

                      const adj = getAdjustment(item.pid, rec.displayDate, dateStr);
                      const metricLower = (adj?.metric || '').toLowerCase().trim();
                      const hasSpendAdj = Boolean(adj && (metricLower === 'spend' || metricLower.includes('spend') || metricLower === 'general'));
                      const hasAdsGmvAdj = Boolean(adj && (metricLower.includes('gmv') || metricLower === 'general'));
                      const hasSalesAdj = Boolean(adj && (metricLower === 'sales' || metricLower === 'general'));
                      const hasRoasAdj = Boolean(adj && (metricLower === 'roas' || metricLower === 'general'));
                      const hasCirAdj = Boolean(adj && (metricLower === 'cir' || metricLower === 'general'));

                      return (
                        <React.Fragment key={`cell-${item.pid}-${dateStr}`}>
                          <td
                            onClick={() => setActiveDrilldown({ pidItem: item, metric: 'spend' })}
                            className={`w-[90px] min-w-[90px] max-w-[90px] py-2.5 px-2 text-right font-mono border-r border-b ${borderCol} cursor-pointer transition-colors hover:bg-indigo-500/10`}
                            title={hasSpendAdj ? `Spend: ${rec.spend > 0 ? formatNum(rec.spend) : '-'}\nAdjustment: ${adj?.adjustment}` : 'Click to view Spend details'}
                          >
                            <div className="relative inline-flex items-center justify-end w-full">
                              <span className={rec.spend > 0 ? `${mainText} font-bold` : `${secText}`}>
                                {rec.spend > 0 ? formatNum(rec.spend) : '-'}
                              </span>
                              {hasSpendAdj && (
                                <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                              )}
                            </div>
                          </td>

                          <td
                            onClick={() => setActiveDrilldown({ pidItem: item, metric: 'adsGmv' })}
                            className={`w-[95px] min-w-[95px] max-w-[95px] py-2.5 px-2 text-right font-mono border-r border-b ${borderCol} cursor-pointer transition-colors hover:bg-indigo-500/10`}
                            title={hasAdsGmvAdj ? `Ads GMV: ${rec.adsGmv > 0 ? formatNum(rec.adsGmv) : '-'}\nAdjustment: ${adj?.adjustment}` : 'Click to view Ads GMV details'}
                          >
                            <div className="relative inline-flex items-center justify-end w-full">
                              <span className={rec.adsGmv > 0 ? `${mainText} font-bold` : `${secText}`}>
                                {rec.adsGmv > 0 ? formatNum(rec.adsGmv) : '-'}
                              </span>
                              {hasAdsGmvAdj && (
                                <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                              )}
                            </div>
                          </td>

                          <td
                            onClick={() => setActiveDrilldown({ pidItem: item, metric: 'sales' })}
                            className={`w-[95px] min-w-[95px] max-w-[95px] py-2.5 px-2 text-right font-mono border-r border-b ${borderCol} cursor-pointer transition-colors hover:bg-indigo-500/10`}
                            title={hasSalesAdj ? `Sales: ${rec.sales > 0 ? formatNum(rec.sales) : '-'}\nAdjustment: ${adj?.adjustment}` : 'Click to view Sales details'}
                          >
                            <div className="relative inline-flex items-center justify-end w-full">
                              <span className={rec.sales > 0 ? `${mainText} font-bold` : `${secText}`}>
                                {rec.sales > 0 ? formatNum(rec.sales) : '-'}
                              </span>
                              {hasSalesAdj && (
                                <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                              )}
                            </div>
                          </td>

                          <td
                            onClick={() => setActiveDrilldown({ pidItem: item, metric: 'roas' })}
                            className={`w-[70px] min-w-[70px] max-w-[70px] py-2.5 px-2 text-right font-mono border-r border-b ${borderCol} cursor-pointer transition-colors hover:bg-indigo-500/10`}
                            title={hasRoasAdj ? `ROAS: ${rec.roas > 0 ? rec.roas.toFixed(2) : '-'}\nAdjustment: ${adj?.adjustment}` : 'Click to view ROAS details'}
                          >
                            <div className="relative inline-flex items-center justify-end w-full">
                              <span className={rec.roas > 0 ? `${mainText} font-bold` : `${secText}`}>
                                {rec.roas > 0 ? rec.roas.toFixed(2) : '-'}
                              </span>
                              {hasRoasAdj && (
                                <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                              )}
                            </div>
                          </td>

                          <td
                            onClick={() => setActiveDrilldown({ pidItem: item, metric: 'cir' })}
                            className={`w-[70px] min-w-[70px] max-w-[70px] py-2.5 px-2 text-right font-mono border-r border-b ${borderCol} cursor-pointer transition-colors hover:bg-indigo-500/10`}
                            title={hasCirAdj ? `CIR: ${rec.cir > 0 ? `${rec.cir.toFixed(2)}%` : '-'}\nAdjustment: ${adj?.adjustment}` : 'Click to view CIR details'}
                          >
                            <div className="relative inline-flex items-center justify-end w-full">
                              <span className={rec.cir > 0 ? `${mainText} font-bold` : `${secText}`}>
                                {rec.cir > 0 ? `${rec.cir.toFixed(2)}%` : '-'}
                              </span>
                              {hasCirAdj && (
                                <span className="absolute -top-1.5 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0f172a]" />
                              )}
                            </div>
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 5. Pagination & Table Footer */}
        <div className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 ${borderCol} ${isDarkMode ? 'bg-[#101827]' : 'bg-slate-100'}`}>
          <div className={`text-xs ${secText}`}>
            Showing <span className={`font-bold ${mainText}`}>{paginatedItems.length}</span> of <span className={`font-bold ${mainText}`}>{filteredItems.length}</span> PIDs.
            <span className="ml-2 font-medium">
              {effectiveView === 'mtd'
                ? '(Frozen PID identification columns. Click any metric cell to inspect historical details)'
                : '(First 4 columns are frozen. Click any metric cell to open single-metric popup)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                isDarkMode
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                  : 'border-slate-300 hover:bg-slate-200 text-slate-800'
              }`}
            >
              Previous
            </button>
            <span className={`text-xs font-bold px-2 ${mainText}`}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
                isDarkMode
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                  : 'border-slate-300 hover:bg-slate-200 text-slate-800'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 6. Drilldown Single-Metric Modal */}
      {activeDrilldown && (
        <PidMetricDetailModal
          isOpen={true}
          onClose={() => setActiveDrilldown(null)}
          pidItem={activeDrilldown.pidItem}
          initialMetric={activeDrilldown.metric}
          dates={activeDates}
          isDarkMode={isDarkMode}
          adjustments={normalizedAdjustments}
          onOpenAddAdjustment={(date, pid, skuName, metric, value) => {
            setAddAdjustmentModal({
              isOpen: true,
              data: { date, pid: cleanPid(pid), skuName, metric, value }
            });
          }}
        />
      )}

      {/* 7. Add Adjustment Modal */}
      <AddAdjustmentModal
        isOpen={addAdjustmentModal.isOpen}
        onClose={() => setAddAdjustmentModal({ isOpen: false })}
        initialData={addAdjustmentModal.data}
        onSubmit={onAddAdjustment}
        isDarkMode={isDarkMode}
      />

      {/* 8. Adjustment Logs Drawer */}
      <AdjustmentLogsDrawer
        isOpen={isLogsDrawerOpen}
        onClose={() => setIsLogsDrawerOpen(false)}
        logs={normalizedAdjustments}
        onUpdateStatus={onUpdateAdjustmentStatus}
        onUpdateActionTaken={onUpdateActionTaken}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
