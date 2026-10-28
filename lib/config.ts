export const CONFIG = {
  media: { sheet: "Media API", colDate: "Date", colBrand: "Brand", colPlatform: "Platform", colFunnel: "Funnel", colAdType: "KPI", colFormat: "Format", colConsiSize: "Result" },
  commerce: { sheet: "Commerce", colDate: "Date", colBrand: "Brand fx", colPlatform: "Platform", colAdType: "Ad Type" },
  creative: { sheet: "Creative Raw", colPeriod: "Period", colBrand: "Brand", colPlatform: "Platform", colAdType: "Ad Type", colFormat: "Format" },
  creativeReport: {
    sheet: "Creative Report",
    colDate: "Date",
    colBrand: "Brand",
    colPlatform: "Platform",
    colAdType: "Ad Type",
    colKpi: "KPI",
    colFormat: "Format",
    colAdGroup: "Ad Group",
    colPillar: "Pillar",
    colCreativeName: "Creative Name",
    colCreativeLink: "Creative Link"
  },
  signal: { sheet: "Media Signal", colBrand: "Brand", colStatus: "Status", colDateStart: "Start Date", colDateEnd: "End Date" },
  pidRank: {
    sheetCommerce: "Commerce",
    sheetCategory: "PID CATEGORY",
    sheetSales: "PID SALES",
    sheetCid: "PID CID",
    sheetAdjustments: "Adjustment Logs",
    sheetPushRank: "Push Rank",
    colBrand: "Brand fx",
    colDate: "Date",
    colPlatform: "Platform",
    colAdType: "Ad Type"
  }
};

export const selectClass = "w-full bg-[#111827] border border-slate-700 text-white py-2 px-3 rounded-md text-xs font-semibold shadow-sm outline-none focus:border-slate-500 cursor-pointer appearance-none dropdown-arrow hover:border-slate-600 transition-colors";
export const dateClass = "w-full bg-white border border-slate-200 text-slate-800 py-2 px-3 rounded-md text-xs font-bold shadow-sm outline-none focus:border-slate-400 cursor-pointer text-center";
export const dateClassDark = "w-full bg-[#111827] border border-slate-700 text-white py-2 px-3 rounded-md text-xs font-bold shadow-sm outline-none focus:border-slate-500 cursor-pointer text-center";
export const defaultFilters = { brand: 'All', funnel: 'All', platform: 'All', adType: 'All', kpi: 'All', format: 'All', pillar: 'All', period: 'All', cluster: 'All', adGroup: 'All', search: '' };
export const CREATIVES_PER_PAGE = 8;