"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { CONFIG, defaultFilters } from '@/lib/config';
import { parseNum, formatIDR, formatNum, formatPct, isValidBrandName, cleanPid } from '@/lib/formatters';
import { parseSheetDate, toYMD, getMediaDates, getWeekBucket } from '@/lib/dateUtils';
import LoginView from '@/components/auth/LoginView';
import WelcomeView from '@/components/navigation/WelcomeView';
import Sidebar from '@/components/navigation/Sidebar';
import TopBar from '@/components/navigation/TopBar';
import GeneralOverviewView from '@/components/views/GeneralOverviewView';
import DigitalMediaView from '@/components/views/DigitalMediaView';
import CommerceTrackerView from '@/components/views/CommerceTrackerView';
import SkuPerformanceView from '@/components/views/SkuPerformanceView';
import TopCreativeView from '@/components/views/TopCreativeView';
import CreativeReportView from '@/components/views/CreativeReportView';
import MediaSignalView from '@/components/views/MediaSignalView';
import PidPushRankTrackerView from '@/components/views/PidPushRankTrackerView';
import { normalizeAdjustment } from '@/components/views/PidAdjustmentModal';
import { hydrateCreativeReportData } from '@/lib/mediaUtils';
import { isCpasSalesAdType } from '@/lib/creative-classifier';

const getColVal = (row: any, ...keys: string[]) => {
  if (!row) return "";
  for (const k of keys) {
    const target = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = Object.keys(row).find(
      (existing) => existing.toLowerCase().replace(/[^a-z0-9]/g, "") === target,
    );
    if (found !== undefined && row[found] !== undefined && row[found] !== "") {
      return row[found];
    }
  }
  return "";
};

export default function DashboardApp() {
  const [currentView, setCurrentView] = useState<
    "login" | "welcome" | "home" | "dashboard"
  >("login");
  const [userRole, setUserRole] = useState<'planner' | 'viewer'>('planner');
  const [activeEngine, setActiveEngine] = useState<
    "media" | "creativeReport" | "commerce" | "creative" | "signal" | "sku" | "pidRank" | null
  >(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isCreativeLearningMode, setIsCreativeLearningMode] = useState(false);

  const dataCache = useRef<Record<string, any[]>>({});
  const [rawData, setRawData] = useState<any[]>([]);
  const [cirDailyData, setCirDailyData] = useState<any[]>([]);
  const [extraSheetsData, setExtraSheetsData] = useState<{
    mediaApi: any[];
    commerce: any[];
  }>({ mediaApi: [], commerce: [] });
  const [homeMediaData, setHomeMediaData] = useState<any[]>([]);
  const [homeCommerceData, setHomeCommerceData] = useState<any[]>([]);
  const [pidRankData, setPidRankData] = useState<{
    commerce: any[];
    category: any[];
    sales: any[];
    cid: any[];
    adjustments: any[];
    pushRank: any[];
  }>({
    commerce: [],
    category: [],
    sales: [],
    cid: [],
    adjustments: [],
    pushRank: [],
  });

  const [filters, setFilters] = useState(defaultFilters);
  const [selectedSignalPeriod, setSelectedSignalPeriod] = useState<string>("");
  const [granularity, setGranularity] = useState("monthly");
  const [dateMonth, setDateMonth] = useState("");
  const [dateWeekly, setDateWeekly] = useState("");
  const [dateDailyStart, setDateDailyStart] = useState("");
  const [dateDailyEnd, setDateDailyEnd] = useState("");

  const [homeBrand, setHomeBrand] = useState("All");
  const [homePeriods, setHomePeriods] = useState<string[]>([]);
  const [homeMomentumMetrics, setHomeMomentumMetrics] = useState<string[]>([
    "spend",
    "commerceGmv",
  ]);

  const [tableColFilter1, setTableColFilter1] = useState("All");
  const [tableColFilter2, setTableColFilter2] = useState("All");

  const [dashboardContext, setDashboardContext] = useState("Overall");
  const [chartMetricsMedia, setChartMetricsMedia] = useState<string[]>([
    "spend",
    "imp",
  ]);
  const [chartMetricsComm, setChartMetricsComm] = useState<string[]>([
    "exp",
    "gmv",
  ]);

  const [chartTypeEngine, setChartTypeEngine] = useState<
    "combo" | "bar" | "line"
  >("combo");
  const [homeMomentumType, setHomeMomentumType] = useState<
    "bar" | "line" | "area"
  >("bar");

  useEffect(() => {
    Chart.defaults.font.family = "'Nunito Sans', sans-serif";
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const today = new Date();
    const yyyy_mm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const yyyy_mm_dd = `${yyyy_mm}-${String(today.getDate()).padStart(2, "0")}`;
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const start_yyyy_mm_dd = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

    setDateMonth(yyyy_mm);
    setDateWeekly(yyyy_mm_dd);
    setDateDailyStart(start_yyyy_mm_dd);
    setDateDailyEnd(yyyy_mm_dd);
    setHomePeriods([yyyy_mm]);

    // Login is required on every page load. Remove any legacy auth flags that
    // earlier builds stored in localStorage (they allowed bypassing the login page).
    try {
      localStorage.removeItem('pc_aio_authenticated');
      localStorage.removeItem('pc_aio_active_engine');
      localStorage.removeItem('pc_aio_current_view');
      sessionStorage.removeItem('pc_aio_user_role');
    } catch {}
  }, []);

  const loadData = async (
    engine: "media" | "creativeReport" | "commerce" | "creative" | "signal" | "sku" | "pidRank",
    forceSync = false,
  ) => {
    setDashboardContext("Overall");
    setTableColFilter1("All");
    setTableColFilter2("All");

    if (forceSync) {
      if (engine === "sku" || engine === "commerce") {
        dataCache.current[CONFIG.commerce.sheet] = undefined as any;
        dataCache.current["CIR DAILY"] = undefined as any;
      } else if (engine === "pidRank") {
        dataCache.current[CONFIG.pidRank.sheetCommerce] = undefined as any;
        dataCache.current[CONFIG.pidRank.sheetCategory] = undefined as any;
        dataCache.current[CONFIG.pidRank.sheetSales] = undefined as any;
        dataCache.current[CONFIG.pidRank.sheetCid] = undefined as any;
        dataCache.current[CONFIG.pidRank.sheetAdjustments] = undefined as any;
        dataCache.current[CONFIG.pidRank.sheetPushRank] = undefined as any;
      } else {
        dataCache.current[CONFIG[engine].sheet] = undefined as any;
      }
      if (engine === "signal") {
        dataCache.current["Media API"] = undefined as any;
        dataCache.current["Commerce"] = undefined as any;
      }
    }

    setIsLoading(true);
    try {
      const fetchSheet = async (sheetName: string) => {
        if (!forceSync && dataCache.current[sheetName])
          return dataCache.current[sheetName];
        const res = await fetch("/api/sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getData", sheetName }),
        });
        const result = await res.json();
        if (result.success && result.compactCreativeReport) {
          const hydrated = hydrateCreativeReportData(result.compactCreativeReport);
          dataCache.current[sheetName] = hydrated;
          return hydrated;
        }
        if (result.success && Array.isArray(result.data)) {
          dataCache.current[sheetName] = result.data;
          return result.data;
        }
        return [];
      };

      if (engine === "commerce") {
        const [commData, cirData] = await Promise.all([
          fetchSheet(CONFIG.commerce.sheet),
          fetchSheet("CIR DAILY"),
        ]);
        setRawData(commData);
        setCirDailyData(cirData);
      } else if (engine === "sku") {
        const commData = await fetchSheet(CONFIG.commerce.sheet);
        setRawData(commData);
      } else if (engine === "pidRank") {
        const [commData, catData, sData, cData, adjData, prData] =
          await Promise.all([
            fetchSheet(CONFIG.pidRank.sheetCommerce),
            fetchSheet(CONFIG.pidRank.sheetCategory),
            fetchSheet(CONFIG.pidRank.sheetSales),
            fetchSheet(CONFIG.pidRank.sheetCid),
            fetchSheet(CONFIG.pidRank.sheetAdjustments),
            fetchSheet(CONFIG.pidRank.sheetPushRank),
          ]);
        const normalizedAdj = Array.isArray(adjData) ? adjData.map(normalizeAdjustment) : [];
        setPidRankData({
          commerce: commData,
          category: catData,
          sales: sData,
          cid: cData,
          adjustments: normalizedAdj,
          pushRank: prData,
        });

        // If data has dates and current dateMonth is empty or not in data, align dateMonth to latest data month
        const mSet = new Set<string>();
        commData.forEach((r: any) => {
          const y = toYMD(r['Date']);
          if (y && y.length === 10) mSet.add(y.slice(0, 7));
        });
        if (mSet.size > 0 && (!dateMonth || !mSet.has(dateMonth))) {
          const sorted = Array.from(mSet).sort().reverse();
          const target = sorted.find(m => m.endsWith('-09')) || sorted[0];
          setDateMonth(target);
        }
      } else if (engine === "signal") {
        const [signalData, mediaApiData, commerceData] = await Promise.all([
          fetchSheet("Media Signal"),
          fetchSheet("Media API"),
          fetchSheet("Commerce"),
        ]);
        setRawData(signalData);
        setExtraSheetsData({ mediaApi: mediaApiData, commerce: commerceData });
      } else {
        const data = await fetchSheet(CONFIG[engine].sheet);
        setRawData(data);
      }
    } catch (err) {
      console.error(err);
      alert("Network error loading sheet data.");
    }
    setIsLoading(false);
  };

  const handleAddAdjustment = async (data: any) => {
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addAdjustment", ...data }),
      });
      const result = await res.json();
      if (result.success && result.adjustment) {
        const norm = normalizeAdjustment(result.adjustment);
        setPidRankData((prev) => ({
          ...prev,
          adjustments: [norm, ...prev.adjustments],
        }));
      } else {
        throw new Error(result.error || "Failed to save adjustment");
      }
    } catch (err: any) {
      alert(err.message || "Error saving adjustment");
      throw err;
    }
  };

  const handleUpdateAdjustmentStatus = async (
    id: string,
    status: "Pending" | "Adjusted",
    user: string,
  ) => {
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateAdjustmentStatus",
          id,
          status,
          userName: user,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setPidRankData((prev) => ({
          ...prev,
          adjustments: prev.adjustments.map((a) =>
            a.id === id || a.ID === id
              ? normalizeAdjustment({ ...a, status, updatedAt: result.updatedAt, updatedBy: user })
              : a,
          ),
        }));
      } else {
        throw new Error(result.error || "Failed to update adjustment");
      }
    } catch (err: any) {
      alert(err.message || "Error updating status");
      throw err;
    }
  };

  const handleUpdateActionTaken = async (
    id: string,
    actionTaken: string,
    user: string,
  ) => {
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateActionTaken",
          id,
          actionTaken,
          userName: user,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setPidRankData((prev) => ({
          ...prev,
          adjustments: prev.adjustments.map((a) =>
            a.id === id || a.ID === id
              ? normalizeAdjustment({
                  ...a,
                  actionTaken,
                  "Action Taken": actionTaken,
                  updatedAt: result.updatedAt,
                  updatedBy: user,
                })
              : a,
          ),
        }));
      } else {
        throw new Error(result.error || "Failed to update action taken");
      }
    } catch (err: any) {
      alert(err.message || "Error updating action taken");
      throw err;
    }
  };

  const selectEngine = (
    engine: "media" | "creativeReport" | "commerce" | "creative" | "signal" | "sku" | "pidRank",
  ) => {
    setActiveEngine(engine);
    setCurrentView("dashboard");
    loadData(engine);
  };

  const loadHomeData = async (forceSync = false) => {
    setIsLoading(true);
    try {
      if (forceSync) {
        dataCache.current["Media API"] = undefined as any;
        dataCache.current["Commerce"] = undefined as any;
      }

      const fetchSheet = async (sheetName: string) => {
        if (!forceSync && dataCache.current[sheetName])
          return dataCache.current[sheetName];
        const res = await fetch("/api/sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getData", sheetName }),
        });
        const result = await res.json();
        if (result.success) {
          dataCache.current[sheetName] = result.data;
          return result.data;
        }
        return [];
      };

      const [mediaData, commerceData] = await Promise.all([
        fetchSheet("Media API"),
        fetchSheet("Commerce"),
      ]);
      setHomeMediaData(mediaData);
      setHomeCommerceData(commerceData);
    } catch {
      alert("Network error loading Home data.");
    }
    setIsLoading(false);
  };

  const selectHome = (forceSync = false) => {
    setActiveEngine(null);
    setCurrentView("home");
    loadHomeData(forceSync);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setTableColFilter1("All");
    setTableColFilter2("All");
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  };

  const getDependentOptions = (colName: string, filterKeyToExclude: string) => {
    if (!rawData || rawData.length === 0) return ["All"];
    const activeCfgKey =
      activeEngine === "sku" ? "commerce" : activeEngine || "media";
    const cfg = CONFIG[activeCfgKey] as any;

    let filtered = rawData;
    if (filterKeyToExclude !== "brand" && filters.brand !== "All")
      filtered = filtered.filter(
        (r) => String(r[cfg.colBrand]) === filters.brand,
      );
    if (activeEngine === "media") {
      if (filterKeyToExclude !== "funnel" && filters.funnel !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colFunnel]) === filters.funnel,
        );
      if (filterKeyToExclude !== "adType" && filters.adType !== "All") {
        if (isCpasSalesAdType(filters.adType)) {
          filtered = filtered.filter((r) => isCpasSalesAdType(String(r[cfg.colAdType])));
        } else {
          filtered = filtered.filter((r) => String(r[cfg.colAdType]) === filters.adType);
        }
      }
      if (filterKeyToExclude !== "format" && filters.format !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colFormat]) === filters.format,
        );
    }
    if (activeEngine === "creativeReport") {
      if (filterKeyToExclude !== "platform" && filters.platform !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colPlatform]) === filters.platform,
        );
      if (filterKeyToExclude !== "adType" && filters.adType !== "All") {
        if (isCpasSalesAdType(filters.adType)) {
          filtered = filtered.filter((r) => isCpasSalesAdType(String(r[cfg.colAdType])));
        } else {
          filtered = filtered.filter((r) => String(r[cfg.colAdType]) === filters.adType);
        }
      }
      if (filterKeyToExclude !== "kpi" && filters.kpi && filters.kpi !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colKpi]) === filters.kpi,
        );
      if (filterKeyToExclude !== "format" && filters.format !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colFormat]) === filters.format,
        );
      if (filterKeyToExclude !== "pillar" && filters.pillar && filters.pillar !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colPillar]) === filters.pillar,
        );
    }
    if (activeEngine === "commerce" || activeEngine === "creative") {
      if (filterKeyToExclude !== "adType" && filters.adType !== "All") {
        if (isCpasSalesAdType(filters.adType)) {
          filtered = filtered.filter((r) => isCpasSalesAdType(String(r[cfg.colAdType])));
        } else {
          filtered = filtered.filter((r) => String(r[cfg.colAdType]) === filters.adType);
        }
      }
    }
    if (activeEngine === "creative") {
      if (filterKeyToExclude !== "period" && filters.period !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colPeriod]) === filters.period,
        );
      if (filterKeyToExclude !== "platform" && filters.platform !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colPlatform]) === filters.platform,
        );
      if (filterKeyToExclude !== "format" && filters.format !== "All")
        filtered = filtered.filter(
          (r) => String(r[cfg.colFormat]) === filters.format,
        );
    }

    const unique = Array.from(new Set(filtered.map((r) => r[colName]))).filter(
      (v) => {
        if (!v || String(v).trim() === "") return false;
        if (colName.toLowerCase().includes("brand")) return isValidBrandName(v);
        return true;
      },
    );
    if ((activeEngine === "creativeReport" || activeEngine === "media") && colName === cfg.colAdType) {
      if (unique.some((u: any) => isCpasSalesAdType(String(u))) && !unique.includes("CPAS Sales")) {
        unique.push("CPAS Sales");
      }
    }
    return ["All", ...unique.sort()];
  };

  const handleToggleMetric = (engine: "media" | "commerce", value: string) => {
    const setState =
      engine === "media" ? setChartMetricsMedia : setChartMetricsComm;
    const current =
      engine === "media" ? [...chartMetricsMedia] : [...chartMetricsComm];
    if (current.includes(value)) {
      if (current.length === 1) return;
      setState(current.filter((m) => m !== value));
    } else {
      if (current.length >= 3) {
        alert("Max 3 metrics for chart.");
        return;
      }
      setState([...current, value]);
    }
  };

  const signalPeriods = useMemo(() => {
    if (activeEngine !== "signal" || rawData.length === 0) return [];
    const unique = new Map<string, { start: string; end: string }>();
    rawData.forEach((r) => {
      const s = toYMD(r["Start Date"] || r["start_date"]);
      const e = toYMD(r["End Date"] || r["end_date"]);
      if (s && e) {
        const key = `${s}_to_${e}`;
        if (!unique.has(key)) unique.set(key, { start: s, end: e });
      }
    });

    const list = Array.from(unique.entries()).map(([key, val]) => ({
      key,
      start: val.start,
      end: val.end,
      label: `${val.start} to ${val.end}`,
    }));

    return list.sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
    );
  }, [rawData, activeEngine]);

  useEffect(() => {
    if (
      activeEngine === "signal" &&
      signalPeriods.length > 0 &&
      !selectedSignalPeriod
    ) {
      setSelectedSignalPeriod(signalPeriods[0].key);
    }
  }, [activeEngine, signalPeriods, selectedSignalPeriod]);

  const signalCompiled = useMemo(() => {
    if (
      activeEngine !== "signal" ||
      rawData.length === 0 ||
      !selectedSignalPeriod
    )
      return null;

    const currentPeriodObj = signalPeriods.find(
      (p) => p.key === selectedSignalPeriod,
    );
    if (!currentPeriodObj) return null;

    const shiftMonth = (value: string) => {
      const date = parseSheetDate(value);
      if (!date || isNaN(date.getTime())) return "";
      const targetMonth = date.getMonth() - 1;
      const lastDay = new Date(
        date.getFullYear(),
        targetMonth + 1,
        0,
      ).getDate();
      const shifted = new Date(
        date.getFullYear(),
        targetMonth,
        Math.min(date.getDate(), lastDay),
      );
      return toYMD(shifted);
    };
    const prevPeriodObj = {
      start: shiftMonth(currentPeriodObj.start),
      end: shiftMonth(currentPeriodObj.end),
    };

    const cleanStr = (s: any) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const targetBrand = cleanStr(filters.brand);

    const findVal = (row: any, candidates: string[]) => {
      for (const cand of candidates) {
        const found = Object.keys(row).find(
          (k) => k.toLowerCase().trim() === cand.toLowerCase().trim(),
        );
        if (
          found !== undefined &&
          row[found] !== undefined &&
          row[found] !== ""
        ) {
          return row[found];
        }
      }
      return "";
    };

    const compilePeriod = (
      periodObj: { start: string; end: string } | null,
      isPlanOnly = false,
    ) => {
      if (!periodObj) return null;

      const pStart = parseSheetDate(periodObj.start);
      if (pStart) pStart.setHours(0, 0, 0, 0);
      const pEnd = parseSheetDate(periodObj.end);
      if (pEnd) pEnd.setHours(23, 59, 59, 999);

      const signalSubset = rawData.filter((row) => {
        const b = cleanStr(row["Brand"]);
        if (targetBrand !== "all" && b !== targetBrand) return false;
        const s = toYMD(row["Start Date"] || row["start_date"]);
        const e = toYMD(row["End Date"] || row["end_date"]);
        if (s !== periodObj.start || e !== periodObj.end) return false;

        const statusVal = String(findVal(row, ["Status", "status", "Type"]))
          .toLowerCase()
          .trim();
        return isPlanOnly
          ? statusVal.includes("plan")
          : statusVal.includes("actual") ||
              (!statusVal.includes("plan") && statusVal !== "");
      });

      const sumSignal = (keys: string[]) => {
        return signalSubset.reduce((acc, row) => {
          const val = findVal(row, keys);
          return acc + parseNum(val);
        }, 0);
      };

      const impressions = sumSignal(["Impressions", "Total Impressions"]);
      const paidImpressions = sumSignal(["Paid Impressions"]);
      const organicImpressions = sumSignal(["Organic Impressions"]);
      const engagements = sumSignal(["Engagements", "Total Engagements"]);
      const paidEngagements = sumSignal(["Paid Engagements"]);
      const organicEngagements = sumSignal(["Organic Engagements"]);
      const views100 = sumSignal([
        "Video Views At 100",
        "Video Views At 100%",
        "video_views_at_100",
      ]);
      const views6s = sumSignal([
        "6 Sec Video Views",
        "6-sec Video Views",
        "6_sec_video_views",
      ]);
      const shares = sumSignal(["Shares"]);
      const comments = sumSignal(["Comments"]);
      const likes = sumSignal(["Likes"]);
      const clicks = sumSignal(["Clicks"]);
      const searchVolume = sumSignal([
        "Search Volume",
        "Search Volumes",
        "search_volume",
      ]);
      const productCardClicks = sumSignal([
        "Product Card Clicks",
        "product_card_clicks",
      ]);
      const newAwareness = sumSignal([
        "New Awareness Audience",
        "new_awareness_audience",
      ]);
      const newConsideration = sumSignal([
        "New Consideration Audience",
        "new_consideration_audience",
      ]);
      const newConversion = sumSignal([
        "New Conversion Audience",
        "new_conversion_audience",
      ]);

      let spendAwareness = 0;
      let spendConsideration = 0;
      let spendConversionMedia = 0;
      let totalMediaSpend = 0;
      let impAwareness = 0;
      let impConsideration = 0;

      if (
        !isPlanOnly &&
        extraSheetsData.mediaApi &&
        extraSheetsData.mediaApi.length > 0 &&
        pStart &&
        pEnd
      ) {
        extraSheetsData.mediaApi.forEach((row) => {
          const plat = String(row["Platform"] || "")
            .toLowerCase()
            .trim();
          const b = cleanStr(row["Brand"] || row["Brand fx"]);
          if (!plat.includes("tiktok")) return;
          if (targetBrand !== "all" && b !== targetBrand) return;
          const rDate = parseSheetDate(row["Date"]);
          if (!rDate || rDate < pStart || rDate > pEnd) return;

          const f = String(row["Funnel"] || row["KPI"] || "")
            .toLowerCase()
            .trim();
          const s = parseNum(row["Ad Spend"] || row["Spend"] || row["Expense"]);
          const i = parseNum(row["Impressions"] || row["Impression"]);

          totalMediaSpend += s;
          if (f.includes("awareness")) {
            spendAwareness += s;
            impAwareness += i;
          } else if (f.includes("consideration")) {
            spendConsideration += s;
            impConsideration += i;
          } else if (f.includes("conversion")) {
            spendConversionMedia += s;
          }
        });
      }

      let gmvCommerce = 0;
      let itemsSold = 0;
      let spendConversionComm = 0;

      if (
        !isPlanOnly &&
        extraSheetsData.commerce &&
        extraSheetsData.commerce.length > 0 &&
        pStart &&
        pEnd
      ) {
        extraSheetsData.commerce.forEach((row) => {
          const plat = String(row["Platform"] || "")
            .toLowerCase()
            .trim();
          const b = cleanStr(row["Brand fx"] || row["Brand"]);
          if (!plat.includes("tiktok")) return;
          if (targetBrand !== "all" && b !== targetBrand) return;
          const rDate = parseSheetDate(row["Date"]);
          if (!rDate || rDate < pStart || rDate > pEnd) return;

          gmvCommerce += parseNum(row["GMV"]);
          itemsSold +=
            parseNum(row["Items Sold"]) ||
            parseNum(row["Item sold"]) ||
            parseNum(row["items_sold"]) ||
            parseNum(row["Orders"]);
          spendConversionComm += parseNum(row["Expense"]);
        });
      }

      const signalSpend = sumSignal([
        "Total TikTok Spend",
        "Total TikTok",
        "Ad Spend",
        "Spend",
        "total_spend",
      ]);
      const spendConversion =
        spendConversionComm ||
        spendConversionMedia ||
        sumSignal(["Spend Conversion", "spend_conversion"]);
      const totalSpend = isPlanOnly
        ? signalSpend ||
          sumSignal([
            "Spend Awareness",
            "Spend Consideration",
            "Spend Conversion",
          ])
        : Math.max(
            spendAwareness + spendConsideration + spendConversion,
            totalMediaSpend,
          ) || signalSpend;

      const impConversion = isPlanOnly
        ? 0
        : sumSignal(["Impression Conversion", "imp_conversion"]) ||
          Math.max(0, paidImpressions - impAwareness - impConsideration);
      const gmvAds = gmvCommerce || sumSignal(["GMV Ads", "gmv_ads", "GMV"]);
      const finalItemsSold =
        itemsSold ||
        sumSignal(["Items Sold", "Item sold", "items_sold", "Orders"]);

      return {
        impressions,
        paidImpressions,
        organicImpressions,
        pctOrganicImp: impressions > 0 ? organicImpressions / impressions : 0,
        engagements,
        paidEngagements,
        organicEngagements,
        pctOrganicEng: engagements > 0 ? organicEngagements / engagements : 0,
        views100,
        views6s,
        shares,
        comments,
        likes,
        clicks,
        searchVolume,
        productCardClicks,
        gmvAds,
        itemsSold: finalItemsSold,
        aov: finalItemsSold > 0 ? gmvAds / finalItemsSold : 0,
        cr: clicks > 0 ? finalItemsSold / clicks : 0,
        ctr: impressions > 0 ? clicks / impressions : 0,
        vtr: paidImpressions > 0 ? views6s / paidImpressions : 0,
        er: paidImpressions > 0 ? paidEngagements / paidImpressions : 0,
        newAwareness,
        newConsideration,
        newConversion,
        costPerConsi:
          newConsideration > 0 ? spendConsideration / newConsideration : 0,
        costPerConv: newConversion > 0 ? spendConversion / newConversion : 0,
        impAwareness,
        impConsideration,
        impConversion,
        cpmAwareness:
          impAwareness > 0 ? (spendAwareness / impAwareness) * 1000 : 0,
        cpmConsideration:
          impConsideration > 0
            ? (spendConsideration / impConsideration) * 1000
            : 0,
        cpmConversion:
          impConversion > 0 ? (spendConversion / impConversion) * 1000 : 0,
        spendAwareness,
        spendConsideration,
        spendConversion,
        totalSpend,
      };
    };

    const actual = compilePeriod(currentPeriodObj, false);
    const plan = compilePeriod(currentPeriodObj, true);
    const prev = compilePeriod(prevPeriodObj, false);

    const computeAch = (act: number, pln: number) => {
      if (pln <= 0) return act > 0 ? 1 : 0;
      return act / pln;
    };

    return {
      actual,
      plan,
      prev,
      computeAch,
      currentPeriod: currentPeriodObj,
      prevPeriod: prevPeriodObj,
    };
  }, [
    rawData,
    extraSheetsData,
    filters.brand,
    activeEngine,
    selectedSignalPeriod,
    signalPeriods,
  ]);

  const signalHierarchyGroups = useMemo(() => {
    if (!signalCompiled) return [];

    const metric = (
      name: string,
      key: string,
      fmt: (value: number) => string,
      isInv = false,
      overridePlan?: number,
    ) => ({
      name,
      act: (signalCompiled.actual as any)?.[key],
      pln:
        overridePlan !== undefined
          ? overridePlan
          : (signalCompiled.plan as any)?.[key],
      prv: (signalCompiled.prev as any)?.[key],
      fmt,
      isInv,
    });

    return [
      {
        category: "Scale Signal",
        rows: [
          metric("Total Impressions", "impressions", formatNum),
          metric("Paid Impressions", "paidImpressions", formatNum),
          metric("Organic Impressions", "organicImpressions", formatNum),
          metric("% Organic Impressions", "pctOrganicImp", formatPct),
        ],
      },
      {
        category: "Engagement Signal & Performance",
        rows: [
          metric("Total Engagements", "engagements", formatNum),
          metric("Paid Engagements", "paidEngagements", formatNum),
          metric("Organic Engagements", "organicEngagements", formatNum),
          metric("% Organic Engagements", "pctOrganicEng", formatPct),
          metric("CTR", "ctr", formatPct),
          metric("VTR", "vtr", formatPct),
          metric("ER %", "er", formatPct),
        ],
      },
      {
        category: "Attention Signal",
        rows: [
          metric("Video Views at 100%", "views100", formatNum),
          metric("6-sec Video Views", "views6s", formatNum),
          metric("Shares", "shares", formatNum),
          metric("Comments", "comments", formatNum),
          metric("Likes", "likes", formatNum),
        ],
      },
      {
        category: "Intent Signal",
        rows: [
          metric("Clicks", "clicks", formatNum),
          metric("Search Volumes", "searchVolume", formatNum),
        ],
      },
      {
        category: "Commerce Signal & Performance",
        rows: [
          metric("Product Card Clicks", "productCardClicks", formatNum),
          metric("GMV Ads", "gmvAds", formatIDR),
          metric("Items Sold", "itemsSold", formatNum),
          metric("AOV", "aov", formatIDR),
          metric("CR %", "cr", formatPct),
        ],
      },
      {
        category: "Audience Acquisition & Efficiency",
        rows: [
          metric("New Awareness Audience", "newAwareness", formatNum),
          metric("New Consideration Audience", "newConsideration", formatNum),
          metric("New Conversion Audience", "newConversion", formatNum),
          metric("Cost per new Consi", "costPerConsi", formatIDR, true),
          metric("Cost per new Conversion", "costPerConv", formatIDR, true),
        ],
      },
      {
        category: "Funnel Delivery & Spend Breakdown",
        rows: [
          metric("Impression Awareness", "impAwareness", formatNum),
          metric("CPM Awareness", "cpmAwareness", formatIDR, true),
          metric("Impression Consideration", "impConsideration", formatNum),
          metric("CPM Consideration", "cpmConsideration", formatIDR, true),
          metric("Impression Conversion", "impConversion", formatNum, false, 0),
          metric("CPM Conversion", "cpmConversion", formatIDR, true),
          metric("Spend Awareness", "spendAwareness", formatIDR, false),
          metric("Spend Consideration", "spendConsideration", formatIDR, false),
          metric("Spend Conversion", "spendConversion", formatIDR, false),
          metric("Total TikTok Spend", "totalSpend", formatIDR, false),
        ],
      },
    ];
  }, [signalCompiled]);

  const pidRankOptions = useMemo(() => {
    const brands = new Set<string>();
    const platforms = new Set<string>();
    const adTypes = new Set<string>();
    const clusters = new Set<string>();

    const clean = (v: any) => String(v || '').trim();

    (pidRankData.category || []).forEach((row: any) => {
      const b = clean(row['Brand']);
      if (b && isValidBrandName(b)) brands.add(b);
      const p = clean(row['Platform']);
      if (p) platforms.add(p);
      const c = clean(row['Class​'] || row['Class'] || row['CLASS'] || row['Cluster'] || row['CLUSTER']);
      if (c) clusters.add(c);
    });

    (pidRankData.commerce || []).forEach((row: any) => {
      const b = clean(row['Brand fx'] || row['Brand']);
      if (b && isValidBrandName(b)) brands.add(b);
      const p = clean(row['Platform']);
      if (p) platforms.add(p);
      const t = clean(row['Ad Type'] || row['Ad Type fx']);
      if (t && t !== '-') adTypes.add(t);
    });

    return {
      brands: ['All', ...Array.from(brands).sort()],
      platforms: ['All', ...Array.from(platforms).sort()],
      adTypes: ['All', ...Array.from(adTypes).sort()],
      clusters: ['All', ...Array.from(clusters).sort()]
    };
  }, [pidRankData]);

  const { curData, prevData, chartData, creativeData, globalDates } =
    useMemo(() => {
      if (
        !activeEngine ||
        activeEngine === "signal" ||
        activeEngine === "pidRank" ||
        rawData.length === 0
      )
        return {
          curData: [],
          prevData: [],
          chartData: [],
          creativeData: [],
          globalDates: null,
        };
      const activeCfgKey = activeEngine === "sku" ? "commerce" : activeEngine;
      const cfg: any = CONFIG[activeCfgKey as keyof typeof CONFIG];

      const filteredBase = rawData.filter((row) => {
        if (
          filters.brand !== "All" &&
          String(row[cfg.colBrand]) !== filters.brand
        )
          return false;
        if (activeEngine === "media") {
          if (
            filters.funnel !== "All" &&
            String(row[cfg.colFunnel]) !== filters.funnel
          )
            return false;
          if (filters.adType !== "All") {
            const rowVal = String(row[cfg.colAdType]);
            if (isCpasSalesAdType(filters.adType)) {
              if (!isCpasSalesAdType(rowVal)) return false;
            } else if (rowVal !== filters.adType) {
              return false;
            }
          }
          if (
            filters.format !== "All" &&
            String(row[cfg.colFormat]) !== filters.format
          )
            return false;
        }
        if (activeEngine === "creativeReport") {
          if (
            filters.platform !== "All" &&
            String(row[cfg.colPlatform]) !== filters.platform
          )
            return false;
          if (filters.adType !== "All") {
            const rowVal = String(row[cfg.colAdType]);
            if (isCpasSalesAdType(filters.adType)) {
              if (!isCpasSalesAdType(rowVal)) return false;
            } else if (rowVal !== filters.adType) {
              return false;
            }
          }
          if (
            filters.kpi &&
            filters.kpi !== "All" &&
            String(row[cfg.colKpi]) !== filters.kpi
          )
            return false;
          if (
            filters.format !== "All" &&
            String(row[cfg.colFormat]) !== filters.format
          )
            return false;
          if (
            filters.pillar &&
            filters.pillar !== "All" &&
            String(row[cfg.colPillar]) !== filters.pillar
          )
            return false;
        }
        if (
          activeEngine === "commerce" &&
          filters.adType !== "All" &&
          String(row[cfg.colAdType]) !== filters.adType
        )
          return false;
        if (activeEngine === "creative") {
          if (
            filters.period !== "All" &&
            String(row[cfg.colPeriod]) !== filters.period
          )
            return false;
          if (
            filters.platform !== "All" &&
            String(row[cfg.colPlatform]) !== filters.platform
          )
            return false;
          if (filters.adType !== "All") {
            const rowVal = String(row[cfg.colAdType]);
            if (isCpasSalesAdType(filters.adType)) {
              if (!isCpasSalesAdType(rowVal)) return false;
            } else if (rowVal !== filters.adType) {
              return false;
            }
          }
          if (
            filters.format !== "All" &&
            String(row[cfg.colFormat]) !== filters.format
          )
            return false;
        }
        return true;
      });

      if (activeEngine === "creative")
        return {
          curData: [],
          prevData: [],
          chartData: [],
          creativeData: filteredBase,
          globalDates: null,
        };

      let cData: any[] = [];
      let pData: any[] = [];
      let chData: any[] = [];
      let dates: any = null;
      let dStart: any = null;
      let dEnd: any = null;

      if (granularity === "monthly" && dateMonth) {
        const p = dateMonth.split("-");
        dates = getMediaDates(
          new Date(Number(p[0]), Number(p[1]), 0),
          "monthly",
        );
      } else if (granularity === "weekly" && dateWeekly) {
        const p = dateWeekly.split("-");
        dates = getMediaDates(
          new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])),
          "weekly",
        );
      } else if (granularity === "daily" && dateDailyStart && dateDailyEnd) {
        const s = dateDailyStart.split("-");
        dStart = new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]));
        const e = dateDailyEnd.split("-");
        dEnd = new Date(
          Number(e[0]),
          Number(e[1]) - 1,
          Number(e[2]),
          23,
          59,
          59,
        );
      }

      filteredBase.forEach((row) => {
        const rowDate = parseSheetDate(row[cfg.colDate]);
        if (!rowDate) return;
        rowDate.setHours(0, 0, 0, 0);
        row.parsedDate = rowDate;

        if (granularity === "monthly" && dates) {
          if (rowDate >= dates.curStart && rowDate <= dates.curMonthEnd) {
            row.bucket = "Month";
            cData.push(row);
          }
          if (rowDate >= dates.prevStart && rowDate <= dates.prevMonthEnd) {
            row.bucket = "Month";
            pData.push(row);
          }
          if (rowDate >= dates.chartStart && rowDate <= dates.curMonthEnd) {
            let chartRow = { ...row };
            chartRow.chartBucket = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, "0")}`;
            chData.push(chartRow);
          }
        } else if (granularity === "weekly" && dates) {
          if (rowDate >= dates.curStart && rowDate <= dates.curMtdEnd) {
            row.bucket = "W" + getWeekBucket(rowDate, dates.curStart);
            cData.push(row);
          }
          if (rowDate >= dates.prevStart && rowDate <= dates.prevMtdEnd) {
            row.bucket = "W" + getWeekBucket(rowDate, dates.prevStart);
            pData.push(row);
          }
        } else if (granularity === "daily" && dStart && dEnd) {
          if (rowDate >= dStart && rowDate <= dEnd) {
            row.bucket = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, "0")}-${String(rowDate.getDate()).padStart(2, "0")}`;
            cData.push(row);
            chData.push(row);
          }
        }
      });

      return {
        curData: cData,
        prevData: pData,
        chartData: chData,
        creativeData: [],
        globalDates: dates,
      };
    }, [
      rawData,
      filters,
      activeEngine,
      granularity,
      dateMonth,
      dateWeekly,
      dateDailyStart,
      dateDailyEnd,
    ]);

  // --- CIR DAILY DATA PIPELINE (WITH BRAND FX / BRAND COMPATIBILITY) ---
  const { cirCurData, cirPrevData } = useMemo(() => {
    if (
      activeEngine !== "commerce" ||
      !cirDailyData ||
      cirDailyData.length === 0
    ) {
      return { cirCurData: [], cirPrevData: [] };
    }

    const filteredCir = cirDailyData.filter((row) => {
      if (filters.brand !== "All") {
        const rowBrand = String(row["Brand fx"] || row["Brand"] || "")
          .trim()
          .toLowerCase();
        if (rowBrand !== filters.brand.trim().toLowerCase()) return false;
      }
      return true;
    });

    let cData: any[] = [];
    let pData: any[] = [];
    let dates: any = null;
    let dStart: any = null;
    let dEnd: any = null;

    if (granularity === "monthly" && dateMonth) {
      const p = dateMonth.split("-");
      dates = getMediaDates(new Date(Number(p[0]), Number(p[1]), 0), "monthly");
    } else if (granularity === "weekly" && dateWeekly) {
      const p = dateWeekly.split("-");
      dates = getMediaDates(
        new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])),
        "weekly",
      );
    } else if (granularity === "daily" && dateDailyStart && dateDailyEnd) {
      const s = dateDailyStart.split("-");
      dStart = new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]));
      const e = dateDailyEnd.split("-");
      dEnd = new Date(Number(e[0]), Number(e[1]) - 1, Number(e[2]), 23, 59, 59);
    }

    filteredCir.forEach((row) => {
      const rawDateStr = getColVal(row, "Date", "Tanggal");
      const rowDate = parseSheetDate(rawDateStr);
      if (!rowDate) return;
      rowDate.setHours(0, 0, 0, 0);

      const rowCopy = { ...row, parsedDate: rowDate };

      if (granularity === "monthly" && dates) {
        if (rowDate >= dates.curStart && rowDate <= dates.curMonthEnd) {
          rowCopy.bucket = "Month";
          cData.push(rowCopy);
        }
        if (rowDate >= dates.prevStart && rowDate <= dates.prevMonthEnd) {
          rowCopy.bucket = "Month";
          pData.push(rowCopy);
        }
      } else if (granularity === "weekly" && dates) {
        if (rowDate >= dates.curStart && rowDate <= dates.curMtdEnd) {
          rowCopy.bucket = "W" + getWeekBucket(rowDate, dates.curStart);
          cData.push(rowCopy);
        }
        if (rowDate >= dates.prevStart && rowDate <= dates.prevMtdEnd) {
          rowCopy.bucket = "W" + getWeekBucket(rowDate, dates.prevStart);
          pData.push(rowCopy);
        }
      } else if (granularity === "daily" && dStart && dEnd) {
        if (rowDate >= dStart && rowDate <= dEnd) {
          rowCopy.bucket = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, "0")}-${String(rowDate.getDate()).padStart(2, "0")}`;
          cData.push(rowCopy);
        }
      }
    });

    return { cirCurData: cData, cirPrevData: pData };
  }, [
    cirDailyData,
    filters.brand,
    activeEngine,
    granularity,
    dateMonth,
    dateWeekly,
    dateDailyStart,
    dateDailyEnd,
  ]);

  const { ctxCurData, ctxPrevData, ctxChartData } = useMemo(() => {
    if (
      dashboardContext === "Overall" ||
      activeEngine === "creative" ||
      activeEngine === "signal" ||
      activeEngine === "sku"
    ) {
      return {
        ctxCurData: curData,
        ctxPrevData: prevData,
        ctxChartData: chartData,
      };
    }
    const match = dashboardContext.toLowerCase();
    const filterFn = (row: any) => {
      const p = String(
        row[CONFIG[activeEngine as "media" | "commerce"].colPlatform] || "",
      ).toLowerCase();
      if (match === "meta")
        return (
          p.includes("meta") ||
          p.includes("facebook") ||
          p.includes("ig") ||
          p.includes("instagram")
        );
      return p.includes(match);
    };
    return {
      ctxCurData: curData.filter(filterFn),
      ctxPrevData: prevData.filter(filterFn),
      ctxChartData: chartData.filter(filterFn),
    };
  }, [curData, prevData, chartData, dashboardContext, activeEngine]);

  const mediaKPIs = useMemo(() => {
    let totals = {
      overall: {
        spend: 0,
        impr: 0,
        engage: 0,
        pSpend: 0,
        pImpr: 0,
        pEngage: 0,
      },
      meta: { spend: 0, impr: 0, engage: 0, pSpend: 0, pImpr: 0, pEngage: 0 },
      tiktok: { spend: 0, impr: 0, engage: 0, pSpend: 0, pImpr: 0, pEngage: 0 },
    };
    const calc = (data: any[], isPrev: boolean) => {
      if (activeEngine !== "media") return;
      data.forEach((row) => {
        const s = parseNum(row["Ad Spend"]);
        const i = parseNum(row["Impressions"]);
        const e =
          parseNum(row["Combined Clicks"]) +
          parseNum(row["Views"]) +
          parseNum(row["Views 6s"]);
        const plat = String(row[CONFIG.media.colPlatform] || "").toLowerCase();

        if (isPrev) {
          totals.overall.pSpend += s;
          totals.overall.pImpr += i;
          totals.overall.pEngage += e;
          if (plat.includes("meta") || plat.includes("ig")) {
            totals.meta.pSpend += s;
            totals.meta.pImpr += i;
            totals.meta.pEngage += e;
          } else if (plat.includes("tiktok")) {
            totals.tiktok.pSpend += s;
            totals.tiktok.pImpr += i;
            totals.tiktok.pEngage += e;
          }
        } else {
          totals.overall.spend += s;
          totals.overall.impr += i;
          totals.overall.engage += e;
          if (plat.includes("meta") || plat.includes("ig")) {
            totals.meta.spend += s;
            totals.meta.impr += i;
            totals.meta.engage += e;
          } else if (plat.includes("tiktok")) {
            totals.tiktok.spend += s;
            totals.tiktok.impr += i;
            totals.tiktok.engage += e;
          }
        }
      });
    };
    calc(curData, false);
    calc(prevData, true);
    return totals;
  }, [curData, prevData, activeEngine]);

  const commerceKPIs = useMemo(() => {
    let totals = {
      overall: { exp: 0, gmv: 0, pExp: 0, pGmv: 0 },
      tiktok: { exp: 0, gmv: 0, pExp: 0, pGmv: 0 },
      shopee: { exp: 0, gmv: 0, pExp: 0, pGmv: 0 },
    };
    const calc = (data: any[], isPrev: boolean) => {
      if (activeEngine !== "commerce" && activeEngine !== "sku") return;
      data.forEach((row) => {
        const e = parseNum(row["Expense"]);
        const g = parseNum(row["GMV"]);
        const plat = String(
          row[CONFIG.commerce.colPlatform] || "",
        ).toLowerCase();

        if (isPrev) {
          totals.overall.pExp += e;
          totals.overall.pGmv += g;
          if (plat.includes("tiktok")) {
            totals.tiktok.pExp += e;
            totals.tiktok.pGmv += g;
          } else if (plat.includes("shopee")) {
            totals.shopee.pExp += e;
            totals.shopee.pGmv += g;
          }
        } else {
          totals.overall.exp += e;
          totals.overall.gmv += g;
          if (plat.includes("tiktok")) {
            totals.tiktok.exp += e;
            totals.tiktok.gmv += g;
          } else if (plat.includes("shopee")) {
            totals.shopee.exp += e;
            totals.shopee.gmv += g;
          }
        }
      });
    };
    calc(curData, false);
    calc(prevData, true);
    const calcRoas = (g: number, e: number) =>
      e > 0 ? (g / e).toFixed(2) + "x" : "0.00x";
    return {
      overall: {
        ...totals.overall,
        roas: calcRoas(totals.overall.gmv, totals.overall.exp),
        pRoas: calcRoas(totals.overall.pGmv, totals.overall.pExp),
        roasNum:
          totals.overall.exp > 0 ? totals.overall.gmv / totals.overall.exp : 0,
        pRoasNum:
          totals.overall.pExp > 0
            ? totals.overall.pGmv / totals.overall.pExp
            : 0,
      },
      tiktok: {
        ...totals.tiktok,
        roas: calcRoas(totals.tiktok.gmv, totals.tiktok.exp),
        pRoas: calcRoas(totals.tiktok.pGmv, totals.tiktok.pExp),
        roasNum:
          totals.tiktok.exp > 0 ? totals.tiktok.gmv / totals.tiktok.exp : 0,
        pRoasNum:
          totals.tiktok.pExp > 0 ? totals.tiktok.pGmv / totals.tiktok.pExp : 0,
      },
      shopee: {
        ...totals.shopee,
        roas: calcRoas(totals.shopee.gmv, totals.shopee.exp),
        pRoas: calcRoas(totals.shopee.pGmv, totals.shopee.pExp),
        roasNum:
          totals.shopee.exp > 0 ? totals.shopee.gmv / totals.shopee.exp : 0,
        pRoasNum:
          totals.shopee.pExp > 0 ? totals.shopee.pGmv / totals.shopee.pExp : 0,
      },
    };
  }, [curData, prevData, activeEngine]);

  const homeBrandOptions = useMemo(() => {
    const brands = new Set<string>();
    homeMediaData.forEach((row) => {
      const brand = String(row["Brand"] || "").trim();
      if (isValidBrandName(brand)) brands.add(brand);
    });
    homeCommerceData.forEach((row) => {
      const brand = String(row["Brand fx"] || "").trim();
      if (isValidBrandName(brand)) brands.add(brand);
    });
    return ["All", ...Array.from(brands).sort()];
  }, [homeMediaData, homeCommerceData]);

  const availableHomeMonths = useMemo(() => {
    const months = new Set<string>();
    const addDate = (dStr: any) => {
      const d = parseSheetDate(dStr);
      if (d && !isNaN(d.getTime())) {
        months.add(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        );
      }
    };
    homeMediaData.forEach((r) => addDate(r["Date"]));
    homeCommerceData.forEach((r) => addDate(r["Date"]));
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [homeMediaData, homeCommerceData]);

  const handleToggleHomeMonth = (month: string) => {
    setHomePeriods((prev) => {
      if (prev.includes(month)) {
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== month);
      } else {
        return [...prev, month].sort();
      }
    });
  };

  const homeSummary = useMemo(() => {
    if (!homePeriods.length) return null;

    const normalizeDate = (value: any) => {
      const date = parseSheetDate(value);
      if (!date || isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const getMonthRanges = (periodList: string[]) => {
      return periodList.map((p) => {
        const [year, month] = p.split("-").map(Number);
        return {
          start: new Date(year, month - 1, 1),
          end: new Date(year, month, 0, 23, 59, 59, 999),
        };
      });
    };

    const getPrevMonthRanges = (periodList: string[]) => {
      return periodList.map((p) => {
        const [year, month] = p.split("-").map(Number);
        return {
          start: new Date(year, month - 2, 1),
          end: new Date(year, month - 1, 0, 23, 59, 59, 999),
        };
      });
    };

    const currentRanges = getMonthRanges(homePeriods);
    const previousRanges = getPrevMonthRanges(homePeriods);

    const inRanges = (
      date: Date | null,
      ranges: { start: Date; end: Date }[],
    ) => {
      if (!date) return false;
      return ranges.some((r) => date >= r.start && date <= r.end);
    };

    const matchesBrand = (value: any) =>
      homeBrand === "All" || String(value || "").trim() === homeBrand;
    const mediaRows = homeMediaData.filter((row) => matchesBrand(row["Brand"]));
    const commerceRows = homeCommerceData.filter((row) =>
      matchesBrand(row["Brand fx"]),
    );

    const currentMedia = mediaRows.filter((row) =>
      inRanges(normalizeDate(row["Date"]), currentRanges),
    );
    const previousMedia = mediaRows.filter((row) =>
      inRanges(normalizeDate(row["Date"]), previousRanges),
    );
    const currentCommerce = commerceRows.filter((row) =>
      inRanges(normalizeDate(row["Date"]), currentRanges),
    );
    const previousCommerce = commerceRows.filter((row) =>
      inRanges(normalizeDate(row["Date"]), previousRanges),
    );

    const sum = (rows: any[], field: string) =>
      rows.reduce((total, row) => total + parseNum(row[field]), 0);
    const mediaMetrics = (rows: any[]) => {
      const spend = sum(rows, "Ad Spend");
      const impressions = sum(rows, "Impressions");
      const clicks = sum(rows, "Combined Clicks");
      const views6s = sum(rows, "Views 6s");
      const views15s = sum(rows, "Views");
      const engagement = clicks + views6s + views15s;
      const views = views15s + views6s;
      return {
        spend,
        impressions,
        clicks,
        views,
        engagement,
        ctr: impressions ? clicks / impressions : 0,
        vtr: impressions ? views / impressions : 0,
      };
    };
    const commerceMetrics = (rows: any[]) => {
      const expense = sum(rows, "Expense");
      const impressions = rows.reduce(
        (acc, row) =>
          acc +
          (parseNum(row["Impression"]) || parseNum(row["Impressions"]) || 0),
        0,
      );
      const clicks = rows.reduce(
        (acc, row) =>
          acc +
          (parseNum(row["Clicks"]) || parseNum(row["Combined Clicks"]) || 0),
        0,
      );
      const gmv = sum(rows, "GMV");
      const orders = rows.reduce(
        (total, row) =>
          total +
          parseNum(
            row["Items Sold"] ||
              row["Item sold"] ||
              row["items_sold"] ||
              row["Orders"],
          ),
        0,
      );
      return {
        expense,
        impressions,
        clicks,
        gmv,
        orders,
        roas: expense ? gmv / expense : 0,
      };
    };
    const groupSum = (rows: any[], key: string, value: string) => {
      const grouped = new Map<string, number>();
      rows.forEach((row) => {
        const label = String(row[key] || "Unspecified").trim() || "Unspecified";
        grouped.set(label, (grouped.get(label) || 0) + parseNum(row[value]));
      });
      return Array.from(grouped, ([label, total]) => ({ label, total })).sort(
        (a, b) => b.total - a.total,
      );
    };
    const mergeGroups = (...lists: { label: string; total: number }[][]) => {
      const merged = new Map<string, number>();
      lists
        .flat()
        .forEach((item) =>
          merged.set(item.label, (merged.get(item.label) || 0) + item.total),
        );
      return Array.from(merged, ([label, total]) => ({ label, total })).sort(
        (a, b) => b.total - a.total,
      );
    };

    const latestSortedMonth = [...homePeriods].sort().pop() || "";
    const [latestYear, latestMonth] = latestSortedMonth.split("-").map(Number);
    const monthKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const trend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(latestYear, latestMonth - 1 - (5 - index), 1);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const media = mediaMetrics(
        mediaRows.filter((row) =>
          inRanges(normalizeDate(row["Date"]), [{ start, end }]),
        ),
      );
      const commerce = commerceMetrics(
        commerceRows.filter((row) =>
          inRanges(normalizeDate(row["Date"]), [{ start, end }]),
        ),
      );
      return {
        key: monthKey(date),
        label: date.toLocaleString("en-GB", { month: "short" }),
        spend: media.spend + commerce.expense,
        mediaSpend: media.spend,
        commerceExpense: commerce.expense,
        impressions: media.impressions + commerce.impressions,
        clicks: media.clicks + commerce.clicks,
        engagement: media.engagement + commerce.clicks,
        commerceGmv: commerce.gmv,
        orders: commerce.orders,
      };
    });

    // YTD: Januari sampai bulan terakhir pada tahun periode terpilih, dipisah per sumber data
    const ytdMonths = Array.from({ length: latestMonth }, (_, index) => {
      const start = new Date(latestYear, index, 1);
      const end = new Date(latestYear, index + 1, 0, 23, 59, 59, 999);
      const media = mediaMetrics(
        mediaRows.filter((row) =>
          inRanges(normalizeDate(row["Date"]), [{ start, end }]),
        ),
      );
      const commerce = commerceMetrics(
        commerceRows.filter((row) =>
          inRanges(normalizeDate(row["Date"]), [{ start, end }]),
        ),
      );
      return {
        key: monthKey(start),
        label: start.toLocaleString("en-GB", { month: "short" }),
        media,
        commerce,
      };
    });
    const ytdTrend = {
      all: ytdMonths.map((m) => ({
        key: m.key,
        label: m.label,
        spend: m.media.spend + m.commerce.expense,
        impressions: m.media.impressions + m.commerce.impressions,
        clicks: m.media.clicks + m.commerce.clicks,
        engagement: m.media.engagement + m.commerce.clicks,
        commerceGmv: m.commerce.gmv,
        orders: m.commerce.orders,
      })),
      media: ytdMonths.map((m) => ({
        key: m.key,
        label: m.label,
        spend: m.media.spend,
        impressions: m.media.impressions,
        clicks: m.media.clicks,
        engagement: m.media.engagement,
        commerceGmv: 0,
        orders: 0,
      })),
      commerce: ytdMonths.map((m) => ({
        key: m.key,
        label: m.label,
        spend: m.commerce.expense,
        impressions: m.commerce.impressions,
        clicks: m.commerce.clicks,
        engagement: m.commerce.clicks,
        commerceGmv: m.commerce.gmv,
        orders: m.commerce.orders,
      })),
    };

    const funnelTrend = trend.map((item) => {
      const date = new Date(`${item.key}-01T00:00:00`);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const mRows = mediaRows.filter((row) =>
        inRanges(normalizeDate(row["Date"]), [{ start, end }]),
      );
      const cRows = commerceRows.filter((row) =>
        inRanges(normalizeDate(row["Date"]), [{ start, end }]),
      );
      const mix = mergeGroups(
        groupSum(mRows, "Funnel", "Ad Spend"),
        groupSum(cRows, "Funnel", "Expense"),
      ).slice(0, 4);
      return { ...item, mix };
    });

    const platformTrend = trend.map((item) => {
      const date = new Date(`${item.key}-01T00:00:00`);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const mRows = mediaRows.filter((row) =>
        inRanges(normalizeDate(row["Date"]), [{ start, end }]),
      );
      const cRows = commerceRows.filter((row) =>
        inRanges(normalizeDate(row["Date"]), [{ start, end }]),
      );
      const mPlat = groupSum(mRows, "Platform", "Ad Spend");
      const cPlat = groupSum(cRows, "Platform", "Expense");
      const combined = new Map<string, number>();
      mPlat
        .concat(cPlat)
        .forEach((p) =>
          combined.set(p.label, (combined.get(p.label) || 0) + p.total),
        );
      const mix = Array.from(combined, ([label, total]) => ({ label, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 4);
      return { ...item, mix };
    });

    const current = {
      media: mediaMetrics(currentMedia),
      commerce: commerceMetrics(currentCommerce),
    };
    const previous = {
      media: mediaMetrics(previousMedia),
      commerce: commerceMetrics(previousCommerce),
    };

    const currentTotalSpend = current.media.spend + current.commerce.expense;
    const previousTotalSpend = previous.media.spend + previous.commerce.expense;

    const currentTotalImpressions =
      current.media.impressions + current.commerce.impressions;
    const previousTotalImpressions =
      previous.media.impressions + previous.commerce.impressions;

    const currentTotalEngagement =
      current.media.engagement + current.commerce.clicks;
    const previousTotalEngagement =
      previous.media.engagement + previous.commerce.clicks;

    const maxOf = (items: { total: number }[]) =>
      Math.max(...items.map((item) => item.total), 1);
    const platformMix = groupSum(currentMedia, "Platform", "Ad Spend").concat(
      groupSum(currentCommerce, "Platform", "Expense"),
    );
    const platformTotals = Array.from(
      platformMix.reduce(
        (map, item) =>
          map.set(item.label, (map.get(item.label) || 0) + item.total),
        new Map<string, number>(),
      ),
      ([label, total]) => ({ label, total }),
    ).sort((a, b) => b.total - a.total);

    const formattedPeriodLabel =
      homePeriods.length === 1
        ? new Date(`${homePeriods[0]}-01`).toLocaleString("en-GB", {
            month: "long",
            year: "numeric",
          })
        : `${homePeriods.length} Months Selected (${homePeriods.sort().join(", ")})`;

    return {
      current,
      previous,
      currentTotalSpend,
      previousTotalSpend,
      currentTotalImpressions,
      previousTotalImpressions,
      currentTotalEngagement,
      previousTotalEngagement,
      trend,
      ytdTrend,
      ytdYear: latestYear,
      funnelTrend,
      platformTrend,
      funnelMix: mergeGroups(
        groupSum(currentMedia, "Funnel", "Ad Spend"),
        groupSum(currentCommerce, "Funnel", "Expense"),
      ).slice(0, 5),
      formatMix: groupSum(currentMedia, "Format", "Ad Spend").slice(0, 6),
      platformMix: platformTotals.slice(0, 5),
      maxOf,
      periodLabel: formattedPeriodLabel,
    };
  }, [homeMediaData, homeCommerceData, homeBrand, homePeriods]);

  if (currentView === "login") {
    return <LoginView onLoginSuccess={(role) => { setUserRole(role); setCurrentView("welcome"); }} />;
  }

  if (currentView === "welcome") {
    return (
      <WelcomeView
        onSelectHome={() => selectHome()}
        onSelectEngine={(engine) => selectEngine(engine)}
      />
    );
  }

  return (
    <div
      className="dashboard-shell w-full min-h-screen flex font-sans transition-colors duration-200 bg-[#f8fafc] text-slate-900 dark:bg-[#090d16] dark:text-slate-100">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 9999px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.5); }
        
        table { border-collapse: separate !important; border-spacing: 0 !important; }
        table:not(.pid-tracker-table) thead th { position: sticky !important; top: 0 !important; z-index: 30 !important; background-color: #090d16 !important; }
        thead th.sticky-col { position: sticky !important; top: 0 !important; left: 0px !important; z-index: 60 !important; background-color: #090d16 !important; width: 180px !important; min-width: 180px !important; max-width: 180px !important; border-right: 1px solid #1e293b !important; border-bottom: 2px solid #1e293b !important; }
        thead th.sticky-col-2 { position: sticky !important; top: 0 !important; left: 180px !important; z-index: 60 !important; background-color: #090d16 !important; width: 180px !important; min-width: 180px !important; max-width: 180px !important; border-right: 1px solid #1e293b !important; border-bottom: 2px solid #1e293b !important; }
        thead th.sticky-col-3 { position: sticky !important; top: 0 !important; left: 360px !important; z-index: 60 !important; background-color: #090d16 !important; width: 120px !important; min-width: 120px !important; max-width: 120px !important; border-right: 1px solid #1e293b !important; border-bottom: 2px solid #1e293b !important; box-shadow: 4px 0 10px -3px rgba(0,0,0,0.3) !important; }
        tbody td.sticky-col { position: sticky !important; left: 0px !important; z-index: 20 !important; width: 180px !important; min-width: 180px !important; max-width: 180px !important; border-right: 1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'} !important; }
        tbody td.sticky-col-2 { position: sticky !important; left: 180px !important; z-index: 20 !important; width: 180px !important; min-width: 180px !important; max-width: 180px !important; border-right: 1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'} !important; }
        tbody td.sticky-col-3 { position: sticky !important; left: 360px !important; z-index: 20 !important; width: 120px !important; min-width: 120px !important; max-width: 120px !important; border-right: 1px solid ${isDarkMode ? '#1e293b' : '#e2e8f0'} !important; box-shadow: 4px 0 10px -3px rgba(0,0,0,0.08) !important; }

        /* PID Push Rank Tracker Table: 4 Frozen Columns + Multi-level Sticky Header */
        .pid-tracker-table { border-collapse: separate !important; border-spacing: 0 !important; table-layout: fixed !important; }
        .pid-tracker-table thead tr.pid-header-row-1 th { position: sticky !important; top: 0px !important; }
        .pid-tracker-table thead tr.pid-header-row-2 th { position: sticky !important; top: 38px !important; }

        /* Pinned Corner Headers: z-index 60 guarantees they stay ABOVE scrolling date/metric headers (z-30) */
        .pid-tracker-table thead tr.pid-header-row-1 th.pid-freeze-col,
        .pid-tracker-table thead tr.pid-header-row-2 th.pid-freeze-col {
          position: sticky !important;
          z-index: 60 !important;
          background-color: #0f172a !important;
          color: #ffffff !important;
        }

        /* 4 Frozen Column Widths and Offsets */
        .pid-tracker-table .pid-col-1 { position: sticky !important; left: 0px !important; width: 130px !important; min-width: 130px !important; max-width: 130px !important; }
        .pid-tracker-table .pid-col-2 { position: sticky !important; left: 130px !important; width: 140px !important; min-width: 140px !important; max-width: 140px !important; }
        .pid-tracker-table .pid-col-3 { position: sticky !important; left: 270px !important; width: 280px !important; min-width: 280px !important; max-width: 280px !important; }
        .pid-tracker-table .pid-col-4 { position: sticky !important; left: 550px !important; width: 160px !important; min-width: 160px !important; max-width: 160px !important; }

        /* Scrolling Date & Metric Headers: z-index 30 (slide UNDERNEATH z-60 pinned corner headers during horizontal scroll) */
        .pid-tracker-table thead tr.pid-header-row-1 th.pid-scroll-header { position: sticky !important; top: 0px !important; z-index: 30 !important; background-color: #0f172a !important; color: #ffffff !important; }
        .pid-tracker-table thead tr.pid-header-row-2 th.pid-scroll-header { position: sticky !important; top: 38px !important; z-index: 30 !important; background-color: #182338 !important; color: #ffffff !important; }

        /* Frozen Body Cells: z-index 20 (slide under z-60/z-30 headers, stay above z-1 body data cells) */
        .pid-tracker-table tbody td.pid-freeze-col { position: sticky !important; z-index: 20 !important; }
        .pid-tracker-table tbody td:not(.pid-freeze-col) { position: static !important; z-index: 1 !important; }
        tr.group-start:not(:first-child) td { border-top: 2.5px solid ${isDarkMode ? '#64748b' : '#94a3b8'} !important; }
        tr.group-start td[rowspan] { border-bottom: 2.5px solid ${isDarkMode ? '#64748b' : '#94a3b8'} !important; }
        tr.group-end td { border-bottom: 2.5px solid ${isDarkMode ? '#64748b' : '#94a3b8'} !important; }

        .dashboard-shell .rounded-3xl,
        .dashboard-shell .rounded-2xl,
        .dashboard-shell .rounded-xl,
        .dashboard-shell .rounded-\[2rem\] { border-radius: 0.375rem !important; }
        
        @keyframes pageFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .view-transition-container {
          animation: pageFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes chartAppearance {
          0% {
            opacity: 0;
            transform: scale(0.985) translateY(8px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .chart-appearance-animate {
          animation: chartAppearance 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .dropdown-arrow { background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'/%3e%3c/svg%3e"); background-position: right center; background-repeat: no-repeat; background-size: 1rem 1rem; }
        select option { background-color: #090d16; color: #f1f5f9; padding: 10px; }
      `,
        }}
      />

      {isLoading && (
        <div className="fixed inset-0 z-[300] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h3 className="font-bold text-white text-sm tracking-wide">
            Fetching Data...
          </h3>
        </div>
      )}

      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        currentView={currentView}
        activeEngine={activeEngine}
        onSelectHome={() => selectHome()}
        onSelectEngine={(engine) => selectEngine(engine)}
        isDarkMode={isDarkMode}
        granularity={granularity}
        setGranularity={setGranularity}
        dateMonth={dateMonth}
        setDateMonth={setDateMonth}
        dateWeekly={dateWeekly}
        setDateWeekly={setDateWeekly}
        dateDailyStart={dateDailyStart}
        setDateDailyStart={setDateDailyStart}
        dateDailyEnd={dateDailyEnd}
        setDateDailyEnd={setDateDailyEnd}
        homeBrand={homeBrand}
        setHomeBrand={setHomeBrand}
        homeBrandOptions={homeBrandOptions}
        homePeriods={homePeriods}
        availableHomeMonths={availableHomeMonths}
        onToggleHomeMonth={handleToggleHomeMonth}
        onSyncHomeData={() => loadHomeData(true)}
        selectedSignalPeriod={selectedSignalPeriod}
        setSelectedSignalPeriod={setSelectedSignalPeriod}
        signalPeriods={signalPeriods}
        filters={filters}
        onFilterChange={handleFilterChange}
        onResetFilters={resetFilters}
        getDependentOptions={getDependentOptions}
        onSyncLiveData={() => loadData(activeEngine as any, true)}
        isLoading={isLoading}
        pidRankOptions={pidRankOptions}
        isCreativeLearningMode={isCreativeLearningMode}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar
          currentView={currentView}
          activeEngine={activeEngine}
          isDarkMode={isDarkMode}
          onToggleTheme={() => setIsDarkMode((prev) => !prev)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />

        <main className="flex-1 p-6 md:p-8 overflow-y-auto w-full">
          <div
            key={currentView === "home" ? "home" : activeEngine || "dashboard"}
            className="view-transition-container space-y-6 w-full">
          {currentView === "home" && homeSummary && (
            <GeneralOverviewView
              homeSummary={homeSummary}
              isDarkMode={isDarkMode}
              homeMomentumMetrics={homeMomentumMetrics}
              setHomeMomentumMetrics={setHomeMomentumMetrics}
              homeMomentumType={homeMomentumType}
              setHomeMomentumType={setHomeMomentumType}
            />
          )}

          {activeEngine === "media" && (
            <DigitalMediaView
              mediaKPIs={mediaKPIs}
              dashboardContext={dashboardContext}
              setDashboardContext={setDashboardContext}
              granularity={granularity}
              isDarkMode={isDarkMode}
              chartTypeEngine={chartTypeEngine}
              setChartTypeEngine={setChartTypeEngine}
              chartMetricsMedia={chartMetricsMedia}
              handleToggleMetric={handleToggleMetric}
              ctxCurData={ctxCurData}
              ctxPrevData={ctxPrevData}
              ctxChartData={ctxChartData}
              globalDates={globalDates}
              tableColFilter1={filters.adType}
              setTableColFilter1={(v) => handleFilterChange("adType", v)}
              tableColFilter2={filters.format}
              setTableColFilter2={(v) => handleFilterChange("format", v)}
              onSwitchSubPage={(sub) => selectEngine(sub)}
            />
          )}

          {activeEngine === "creativeReport" && (
            <CreativeReportView
              rawData={rawData}
              curData={curData}
              prevData={prevData}
              globalDates={globalDates}
              granularity={granularity}
              isDarkMode={isDarkMode}
              dashboardContext={dashboardContext}
              setDashboardContext={setDashboardContext}
              onSwitchSubPage={(sub) => selectEngine(sub)}
              filters={filters}
              onLearningModeChange={setIsCreativeLearningMode}
              userRole={userRole}
            />
          )}

          {activeEngine === "commerce" && (
            <CommerceTrackerView
              commerceKPIs={commerceKPIs}
              dashboardContext={dashboardContext}
              setDashboardContext={setDashboardContext}
              granularity={granularity}
              isDarkMode={isDarkMode}
              chartTypeEngine={chartTypeEngine}
              setChartTypeEngine={setChartTypeEngine}
              chartMetricsComm={chartMetricsComm}
              handleToggleMetric={handleToggleMetric}
              ctxCurData={ctxCurData}
              ctxPrevData={ctxPrevData}
              ctxChartData={ctxChartData}
              cirCurData={cirCurData}
              cirPrevData={cirPrevData}
              globalDates={globalDates}
              tableColFilter1={tableColFilter1}
              setTableColFilter1={setTableColFilter1}
              tableColFilter2={tableColFilter2}
              setTableColFilter2={setTableColFilter2}
            />
          )}

          {activeEngine === "sku" && (
            <SkuPerformanceView
              ctxCurData={ctxCurData}
              isDarkMode={isDarkMode}
              filters={filters}
              onFilterChange={handleFilterChange}
              brandOptions={getDependentOptions(
                CONFIG.commerce.colBrand,
                "brand",
              )}
            />
          )}

          {activeEngine === "pidRank" && (
            <PidPushRankTrackerView
              commerceData={pidRankData.commerce}
              categoryData={pidRankData.category}
              salesData={pidRankData.sales}
              cidData={pidRankData.cid}
              adjustments={pidRankData.adjustments}
              pushRankData={pidRankData.pushRank}
              isDarkMode={isDarkMode}
              onAddAdjustment={handleAddAdjustment}
              onUpdateAdjustmentStatus={handleUpdateAdjustmentStatus}
              onUpdateActionTaken={handleUpdateActionTaken}
              onSyncData={() => loadData("pidRank", true)}
              isLoading={isLoading}
              filters={filters}
              dateMonth={dateMonth}
              granularity={granularity}
              dateDailyStart={dateDailyStart}
              dateDailyEnd={dateDailyEnd}
              dateWeekly={dateWeekly}
            />
          )}

          {activeEngine === "creative" && (
            <TopCreativeView
              creativeData={creativeData}
              isDarkMode={isDarkMode}
            />
          )}

          {activeEngine === "signal" && signalCompiled && (
            <MediaSignalView
              signalCompiled={signalCompiled}
              signalHierarchyGroups={signalHierarchyGroups}
              rawData={rawData}
              extraSheetsData={extraSheetsData}
              isDarkMode={isDarkMode}
              userRole={userRole}
              signalPeriods={signalPeriods}
              filters={filters}
            />
          )}
        </div>
      </main>
    </div>
  </div>
  );
}
