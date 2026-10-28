import React, { useState, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { formatIDR, formatNum, formatPct, getGr } from "@/lib/formatters";

interface GeneralOverviewViewProps {
  homeSummary: any;
  isDarkMode: boolean;
  homeMomentumMetrics: string[];
  setHomeMomentumMetrics: React.Dispatch<React.SetStateAction<string[]>>;
  homeMomentumType: "bar" | "line" | "area";
  setHomeMomentumType: (type: "bar" | "line" | "area") => void;
}

export default function GeneralOverviewView({
  homeSummary,
  isDarkMode,
  homeMomentumMetrics,
  setHomeMomentumMetrics,
  homeMomentumType,
  setHomeMomentumType,
}: GeneralOverviewViewProps) {
  const [isMomentumDropdownOpen, setIsMomentumDropdownOpen] = useState(false);
  const [momentumSource, setMomentumSource] = useState<
    "media" | "commerce" | "all"
  >("all");
  const momentumDropdownRef = useRef<HTMLDivElement>(null);

  // Tutup dropdown Metrics saat klik di luar atau tekan Escape
  useEffect(() => {
    if (!isMomentumDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        momentumDropdownRef.current &&
        !momentumDropdownRef.current.contains(e.target as Node)
      ) {
        setIsMomentumDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMomentumDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMomentumDropdownOpen]);

  const homeSurface = isDarkMode
    ? "bg-[#0f172a] border-slate-800"
    : "bg-white border-slate-200";
  const homeHeading = isDarkMode ? "text-white" : "text-slate-900";
  const homeMuted = isDarkMode ? "text-slate-400" : "text-slate-500";

  const allMetricOptions = [
    { key: "spend", label: "Spend", color: "#6366f1", fmt: formatIDR },
    {
      key: "commerceGmv",
      label: "Commerce GMV",
      color: "#10b981",
      fmt: formatIDR,
    },
    {
      key: "impressions",
      label: "Impressions",
      color: "#06b6d4",
      fmt: formatNum,
    },
    { key: "clicks", label: "Clicks", color: "#84cc16", fmt: formatNum },
    {
      key: "engagement",
      label: "Engagement",
      color: "#f59e0b",
      fmt: formatNum,
    },
    { key: "orders", label: "Orders", color: "#ec4899", fmt: formatNum },
  ];

  // Sumber Media tidak punya GMV/Orders, jadi dua metrik itu disembunyikan
  const metricOptions =
    momentumSource === "media"
      ? allMetricOptions.filter(
          (m) => m.key !== "commerceGmv" && m.key !== "orders",
        )
      : allMetricOptions;

  const activeMetricConfigs = metricOptions.filter((m) =>
    homeMomentumMetrics.includes(m.key),
  );

  const momentumData =
    homeSummary.ytdTrend?.[momentumSource] ?? homeSummary.trend;

  const handleChangeMomentumSource = (source: "media" | "commerce" | "all") => {
    setMomentumSource(source);
    setIsMomentumDropdownOpen(false);
    if (source === "media") {
      setHomeMomentumMetrics((prev) => {
        const valid = prev.filter((k) => k !== "commerceGmv" && k !== "orders");
        return valid.length ? valid : ["spend"];
      });
    }
  };

  const handleToggleMomentumMetric = (metricKey: string) => {
    setHomeMomentumMetrics((prev) => {
      if (prev.includes(metricKey)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== metricKey);
      } else {
        if (prev.length >= 2) return [prev[1], metricKey];
        return [...prev, metricKey];
      }
    });
  };

  const growth = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return "-";
    const rate = getGr(current, previous);
    return `${rate >= 0 ? "+" : ""}${formatPct(rate)}`;
  };

  const metricCard = (
    label: string,
    value: string,
    change: string,
    gradId: string,
    hexColor: string,
    chartData: { label: string; val: number }[],
    fmt: (val: number) => string,
  ) => {
    const isPositive = change.startsWith("+");
    const isNeutral = change === "-";
    const badgeClass = isNeutral
      ? isDarkMode
        ? "text-slate-400"
        : "text-slate-500"
      : isPositive
        ? "text-emerald-500"
        : "text-rose-500";

    return (
      <div
        className={`${homeSurface} border shadow-sm rounded-md flex flex-col justify-between overflow-hidden h-[180px] pt-4 pb-0 relative`}>
        <div className="px-4 flex items-center justify-between mb-1 z-10">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider ${homeMuted}`}>
            {label}
          </span>
          <span className={`text-xs font-bold tracking-tight ${badgeClass}`}>
            {change}
          </span>
        </div>

        <div className="px-4 z-10 mb-2">
          <strong
            className={`text-lg sm:text-xl font-bold ${homeHeading} tracking-tight block leading-tight`}>
            {value}
          </strong>
        </div>

        <div className="h-16 w-full mt-auto">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hexColor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={hexColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide padding={{ left: 0, right: 0 }} />
              <RechartsTooltip
                isAnimationActive={false}
                animationDuration={0}
                wrapperStyle={{ zIndex: 50, outline: "none" }}
                contentStyle={{
                  backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
                  borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                  borderRadius: "0.5rem",
                  fontSize: "11px",
                  padding: "4px 8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
                formatter={(v: any) => [fmt(Number(v)), label]}
                labelStyle={{
                  color: isDarkMode ? "#94a3b8" : "#64748b",
                  fontWeight: 600,
                }}
              />
              <Area
                type="monotone"
                dataKey="val"
                stroke={hexColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const mixBars = (
    items: { label: string; total: number }[],
    colors: string[],
  ) => (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No data for this period.</p>
      ) : (
        items.map((item, index) => (
          <div
            key={item.label}
            className="group relative cursor-pointer"
            title={`${item.label}: ${formatIDR(item.total)}`}>
            <div
              className={`flex justify-between text-xs font-bold ${isDarkMode ? "text-slate-300" : "text-slate-600"} mb-1`}>
              <span className="truncate pr-3">{item.label}</span>
              <span>{formatIDR(item.total)}</span>
            </div>
            <div
              className={`h-2 rounded-full ${isDarkMode ? "bg-slate-700" : "bg-slate-100"} overflow-hidden`}>
              <div
                className={`h-full rounded-full ${colors[index % colors.length]}`}
                style={{
                  width: `${Math.max(3, (item.total / homeSummary.maxOf(items)) * 100)}%`,
                }}></div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderStackBars = (
    trendData: {
      key: string;
      label: string;
      mix: { label: string; total: number }[];
    }[],
  ) => {
    const stackColors = [
      "bg-indigo-500",
      "bg-emerald-500",
      "bg-amber-400",
      "bg-cyan-400",
    ];
    const BAR_AREA_PX = 112; // harus sama dengan h-28 pada container bar
    const MIN_LABEL_PX = 12; // segmen lebih pendek dari ini tidak diberi label (persen tetap ada di tooltip)
    const max = Math.max(
      ...trendData.map((item) =>
        item.mix.reduce((total, mix) => total + mix.total, 0),
      ),
      1,
    );
    return (
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/60">
        <div
          className={`h-28 flex items-end gap-2 border-b ${isDarkMode ? "border-slate-700" : "border-slate-200"} pb-0`}>
          {trendData.map((item) => {
            const total =
              item.mix.reduce((sum, mix) => sum + mix.total, 0) || 1;
            const stackHeightPct = Math.max(6, (total / max) * 100);
            return (
              <div
                key={item.key}
                className="flex-1 h-full flex items-end group relative cursor-pointer">
                <div
                  className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col gap-1 p-2 rounded-lg text-[10px] font-bold shadow-xl z-30 pointer-events-none whitespace-nowrap border ${
                    isDarkMode
                      ? "bg-[#0f172a] text-white border-slate-700"
                      : "bg-white text-slate-800 border-slate-200"
                  }`}>
                  <span className="text-slate-400 font-extrabold border-b border-slate-200 dark:border-slate-700 pb-0.5">
                    {item.label}
                  </span>
                  {item.mix.map((mix) => (
                    <div
                      key={mix.label}
                      className="flex items-center justify-between gap-3">
                      <span>{mix.label}</span>
                      <span className="text-indigo-400 font-mono">
                        {formatIDR(mix.total)} ({formatPct(mix.total / total)})
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className="w-full flex flex-col-reverse transition-all duration-300 ease-out"
                  style={{ height: `${stackHeightPct}%` }}>
                  {item.mix.map((mix, index) => {
                    const share = mix.total / total;
                    const segmentPx =
                      share * (stackHeightPct / 100) * BAR_AREA_PX;
                    return (
                      <div
                        key={mix.label}
                        className={`w-full ${stackColors[index % stackColors.length]} first:rounded-b-sm last:rounded-t-sm flex items-center justify-center overflow-hidden`}
                        style={{ height: `${share * 100}%` }}>
                        {segmentPx >= MIN_LABEL_PX && (
                          <span
                            className={`text-[9px] font-black leading-none text-white`}>
                            {Math.round(share * 100)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div
          className={`flex justify-between pt-1.5 text-[9px] font-bold ${homeMuted}`}>
          {trendData.map((item) => (
            <span key={item.key}>{item.label}</span>
          ))}
        </div>
      </div>
    );
  };

  const mixDonut = (
    items: { label: string; total: number }[],
    colors: string[],
    centerLabel: string,
  ) => {
    const total = items.reduce((sum, item) => sum + item.total, 0) || 1;
    let start = 0;
    const gradient = items
      .map((item, index) => {
        const end = start + (item.total / total) * 100;
        const slice = `${colors[index % colors.length]} ${start}% ${end}%`;
        start = end;
        return slice;
      })
      .join(", ");

    return (
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-full shrink-0 relative flex items-center justify-center shadow-inner"
          style={{
            background: `conic-gradient(${gradient || "#e2e8f0 0 100%"})`,
          }}>
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full ${isDarkMode ? "bg-[#090d16]" : "bg-white"} flex items-center justify-center shadow`}>
            <span
              className={`text-[10px] font-black uppercase tracking-wider ${homeHeading}`}>
              {centerLabel}
            </span>
          </div>
        </div>
        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <tbody>
              {items.slice(0, 5).map((item, index) => (
                <tr
                  key={item.label}
                  className="border-b border-transparent hover:bg-slate-500/5 transition-colors group relative cursor-pointer"
                  title={`${item.label}: ${formatIDR(item.total)} (${formatPct(item.total / total)})`}>
                  <td className="py-1 pr-2 w-4">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{
                        backgroundColor: colors[index % colors.length],
                      }}></span>
                  </td>
                  <td
                    className={`py-1 pr-2 font-bold text-xs max-w-[110px] truncate ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}>
                    {item.label}
                  </td>
                  <td className="py-1 px-2 text-right font-mono text-xs font-bold text-indigo-400">
                    {formatPct(item.total / total)}
                  </td>
                  <td
                    className={`py-1 pl-2 text-right font-mono text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>
                    {formatIDR(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-1">
            Performance snapshot
          </p>
          <p className="text-sm text-slate-500 font-medium">
            {homeSummary.periodLabel} across paid media and commerce channels
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCard(
          "Media spend",
          formatIDR(homeSummary.currentTotalSpend),
          growth(homeSummary.currentTotalSpend, homeSummary.previousTotalSpend),
          "gradSpend",
          "#6366f1",
          homeSummary.trend.map((item: any) => ({
            label: item.label,
            val: item.spend,
          })),
          formatIDR,
        )}
        {metricCard(
          "Impressions",
          formatNum(homeSummary.currentTotalImpressions),
          growth(
            homeSummary.currentTotalImpressions,
            homeSummary.previousTotalImpressions,
          ),
          "gradImp",
          "#06b6d4",
          homeSummary.trend.map((item: any) => ({
            label: item.label,
            val: item.impressions,
          })),
          formatNum,
        )}
        {metricCard(
          "Commerce GMV",
          formatIDR(homeSummary.current.commerce.gmv),
          growth(
            homeSummary.current.commerce.gmv,
            homeSummary.previous.commerce.gmv,
          ),
          "gradGmv",
          "#10b981",
          homeSummary.trend.map((item: any) => ({
            label: item.label,
            val: item.commerceGmv,
          })),
          formatIDR,
        )}
        {metricCard(
          "Engagement",
          formatNum(homeSummary.currentTotalEngagement),
          growth(
            homeSummary.currentTotalEngagement,
            homeSummary.previousTotalEngagement,
          ),
          "gradEng",
          "#f59e0b",
          homeSummary.trend.map((item: any) => ({
            label: item.label,
            val: item.engagement,
          })),
          formatNum,
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <div
          className={`${homeSurface} border rounded-2xl p-5 shadow-sm xl:col-span-7 flex flex-col justify-between`}>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
              <div>
                <h2 className={`text-base font-black ${homeHeading}`}>YTD</h2>
                <p className={`text-xs ${homeMuted} mt-0.5`}>
                  {homeSummary.ytdYear
                    ? `Jan - ${momentumData[momentumData.length - 1]?.label ?? ""} ${homeSummary.ytdYear} · `
                    : ""}
                  Trend comparison across selected metrics
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={momentumSource}
                  onChange={(e) =>
                    handleChangeMomentumSource(
                      e.target.value as "media" | "commerce" | "all",
                    )
                  }
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm cursor-pointer outline-none ${isDarkMode ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-800"}`}>
                  <option value="media">Media</option>
                  <option value="commerce">Commerce</option>
                  <option value="all">All</option>
                </select>

                <div className="relative" ref={momentumDropdownRef}>
                  <button
                    type="button"
                    onClick={() =>
                      setIsMomentumDropdownOpen(!isMomentumDropdownOpen)
                    }
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-sm ${isDarkMode ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-800"}`}>
                    <span>Metrics ({homeMomentumMetrics.length}/2)</span>
                    <span className="text-[10px]">▼</span>
                  </button>

                  {isMomentumDropdownOpen && (
                    <div
                      className={`absolute right-0 mt-2 w-52 rounded-xl shadow-xl border p-2 z-50 ${isDarkMode ? "bg-[#0f172a] border-slate-700" : "bg-white border-slate-200"}`}>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1">
                        Select up to 2
                      </p>
                      {metricOptions.map((m) => {
                        const isChecked = homeMomentumMetrics.includes(m.key);
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => handleToggleMomentumMetric(m.key)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors ${isChecked ? "bg-indigo-600 text-white" : isDarkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"}`}>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: m.color }}></span>
                              <span>{m.label}</span>
                            </div>
                            {isChecked && <span>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  {(["bar", "line", "area"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setHomeMomentumType(type)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${homeMomentumType === type ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {homeMomentumType === "bar" ? (
                  <BarChart
                    data={momentumData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDarkMode ? "#334155" : "#f1f5f9"}
                    />
                    <XAxis
                      dataKey="label"
                      stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) =>
                        val >= 1000000
                          ? `${(val / 1000000).toFixed(0)}M`
                          : val >= 1000
                            ? `${(val / 1000).toFixed(0)}k`
                            : val
                      }
                    />
                    {activeMetricConfigs.length > 1 && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) =>
                          val >= 1000000
                            ? `${(val / 1000000).toFixed(0)}M`
                            : val >= 1000
                              ? `${(val / 1000).toFixed(0)}k`
                              : val
                        }
                      />
                    )}
                    <RechartsTooltip
                      isAnimationActive={false}
                      animationDuration={0}
                      contentStyle={{
                        backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                        borderRadius: "0.75rem",
                        fontSize: "12px",
                      }}
                      formatter={(v: any, name: any) => {
                        const cfg = activeMetricConfigs.find(
                          (m) => m.label === name,
                        );
                        return [cfg ? cfg.fmt(Number(v)) : v, name];
                      }}
                    />
                    {activeMetricConfigs.map((cfg, idx) => (
                      <Bar
                        key={cfg.key}
                        yAxisId={idx === 1 ? "right" : "left"}
                        dataKey={cfg.key}
                        name={cfg.label}
                        fill={cfg.color}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    ))}
                  </BarChart>
                ) : homeMomentumType === "line" ? (
                  <LineChart
                    data={momentumData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDarkMode ? "#334155" : "#f1f5f9"}
                    />
                    <XAxis
                      dataKey="label"
                      stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) =>
                        val >= 1000000
                          ? `${(val / 1000000).toFixed(0)}M`
                          : val >= 1000
                            ? `${(val / 1000).toFixed(0)}k`
                            : val
                      }
                    />
                    {activeMetricConfigs.length > 1 && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) =>
                          val >= 1000000
                            ? `${(val / 1000000).toFixed(0)}M`
                            : val >= 1000
                              ? `${(val / 1000).toFixed(0)}k`
                              : val
                        }
                      />
                    )}
                    <RechartsTooltip
                      isAnimationActive={false}
                      animationDuration={0}
                      contentStyle={{
                        backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                        borderRadius: "0.75rem",
                        fontSize: "12px",
                      }}
                      formatter={(v: any, name: any) => {
                        const cfg = activeMetricConfigs.find(
                          (m) => m.label === name,
                        );
                        return [cfg ? cfg.fmt(Number(v)) : v, name];
                      }}
                    />
                    {activeMetricConfigs.map((cfg, idx) => (
                      <Line
                        key={cfg.key}
                        yAxisId={idx === 1 ? "right" : "left"}
                        type="monotone"
                        dataKey={cfg.key}
                        name={cfg.label}
                        stroke={cfg.color}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                ) : (
                  <AreaChart
                    data={momentumData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      {activeMetricConfigs.map((cfg) => (
                        <linearGradient
                          key={cfg.key}
                          id={`areaGrad-${cfg.key}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1">
                          <stop
                            offset="5%"
                            stopColor={cfg.color}
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor={cfg.color}
                            stopOpacity={0.0}
                          />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDarkMode ? "#334155" : "#f1f5f9"}
                    />
                    <XAxis
                      dataKey="label"
                      stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) =>
                        val >= 1000000
                          ? `${(val / 1000000).toFixed(0)}M`
                          : val >= 1000
                            ? `${(val / 1000).toFixed(0)}k`
                            : val
                      }
                    />
                    {activeMetricConfigs.length > 1 && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke={isDarkMode ? "#94a3b8" : "#64748b"}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) =>
                          val >= 1000000
                            ? `${(val / 1000000).toFixed(0)}M`
                            : val >= 1000
                              ? `${(val / 1000).toFixed(0)}k`
                              : val
                        }
                      />
                    )}
                    <RechartsTooltip
                      isAnimationActive={false}
                      animationDuration={0}
                      contentStyle={{
                        backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
                        borderColor: isDarkMode ? "#334155" : "#e2e8f0",
                        borderRadius: "0.75rem",
                        fontSize: "12px",
                      }}
                      formatter={(v: any, name: any) => {
                        const cfg = activeMetricConfigs.find(
                          (m) => m.label === name,
                        );
                        return [cfg ? cfg.fmt(Number(v)) : v, name];
                      }}
                    />
                    {activeMetricConfigs.map((cfg, idx) => (
                      <Area
                        key={cfg.key}
                        yAxisId={idx === 1 ? "right" : "left"}
                        type="monotone"
                        dataKey={cfg.key}
                        name={cfg.label}
                        stroke={cfg.color}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill={`url(#areaGrad-${cfg.key})`}
                      />
                    ))}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div
            className={`flex flex-wrap gap-4 mt-3 text-[11px] font-bold ${homeMuted}`}>
            {activeMetricConfigs.map((cfg) => (
              <span key={cfg.key} className="flex items-center gap-1.5">
                <i
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: cfg.color }}></i>
                {cfg.label}
              </span>
            ))}
          </div>
        </div>

        <div
          className={`${homeSurface} border rounded-2xl p-5 shadow-sm xl:col-span-5 flex flex-col justify-between`}>
          <div>
            <h2 className={`text-base font-black ${homeHeading} mb-1`}>
              Platform mix
            </h2>
            <p className={`text-xs ${homeMuted} mb-4`}>
              Investment across platform
            </p>
            {mixDonut(
              homeSummary.platformMix,
              ["#6366f1", "#10b981", "#f59e0b", "#06b6d4", "#ec4899"],
              "MIX",
            )}
          </div>
          <div className="mt-auto">
            {renderStackBars(homeSummary.platformTrend)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`${homeSurface} border rounded-2xl p-5 shadow-sm`}>
          <h2 className={`text-base font-black ${homeHeading} mb-1`}>
            Funnel mix
          </h2>
          <p className={`text-xs ${homeMuted} mb-3`}>
            Media &amp; commerce spend by funnel
          </p>
          {mixDonut(
            homeSummary.funnelMix,
            ["#4f46e5", "#10b981", "#f59e0b", "#06b6d4", "#ec4899"],
            "MIX",
          )}
          {renderStackBars(homeSummary.funnelTrend)}
        </div>
        <div className={`${homeSurface} border rounded-2xl p-5 shadow-sm`}>
          <h2 className={`text-base font-black ${homeHeading} mb-1`}>
            Format mix
          </h2>
          <p className={`text-xs ${homeMuted} mb-4`}>
            Media investment by format
          </p>
          {mixBars(homeSummary.formatMix, [
            "bg-violet-500",
            "bg-blue-500",
            "bg-teal-500",
            "bg-orange-400",
          ])}
        </div>
        <div className={`${homeSurface} border rounded-2xl p-5 shadow-sm`}>
          <h2 className={`text-base font-black ${homeHeading} mb-1`}>
            Core Metrics
          </h2>
          <p className={`text-xs ${homeMuted} mb-4`}>
            Core media efficiency metrics
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`${isDarkMode ? "bg-[#090d16]" : "bg-slate-50"} rounded-xl p-3`}>
              <span className={`text-[10px] font-bold ${homeMuted}`}>CTR</span>
              <strong className={`block text-lg ${homeHeading} mt-1`}>
                {formatPct(homeSummary.current.media.ctr)}
              </strong>
            </div>
            <div
              className={`${isDarkMode ? "bg-[#090d16]" : "bg-slate-50"} rounded-xl p-3`}>
              <span className={`text-[10px] font-bold ${homeMuted}`}>VTR</span>
              <strong className={`block text-lg ${homeHeading} mt-1`}>
                {formatPct(homeSummary.current.media.vtr)}
              </strong>
            </div>
            <div
              className={`${isDarkMode ? "bg-[#090d16]" : "bg-slate-50"} rounded-xl p-3`}>
              <span className={`text-[10px] font-bold ${homeMuted}`}>ROAS</span>
              <strong className={`block text-lg ${homeHeading} mt-1`}>
                {homeSummary.current.commerce.roas.toFixed(2)}x
              </strong>
            </div>
            <div
              className={`${isDarkMode ? "bg-[#090d16]" : "bg-slate-50"} rounded-xl p-3`}>
              <span className={`text-[10px] font-bold ${homeMuted}`}>
                Clicks
              </span>
              <strong className={`block text-lg ${homeHeading} mt-1`}>
                {formatNum(homeSummary.current.media.clicks)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
