import React from 'react';

interface MediaPlanningPlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function MediaPlanningPlaybookModal({
  isOpen,
  onClose,
  isDarkMode,
}: MediaPlanningPlaybookModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl max-h-[88vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden ${
          isDarkMode ? 'bg-[#0f172a] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isDarkMode ? 'border-slate-800 bg-[#111827]' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isDarkMode ? 'bg-indigo-950 text-indigo-400 border border-indigo-800/60' : 'bg-indigo-100 text-indigo-700'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Media Planning Simulator Playbook</h2>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Methodology, Reverse-Funnel Pipeline, and Scale Dynamics Guide
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
            }`}
            title="Close Playbook"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm leading-relaxed">
          {/* Section 1: Overview */}
          <div className="space-y-2">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${
              isDarkMode ? 'text-indigo-400' : 'text-indigo-600'
            }`}>
              1. Executive Overview & Objective
            </h3>
            <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
              The Reverse-Funnel Media Planning Simulator is designed specifically for <strong>TikTok Shop GMV planning</strong>. Traditional media planning guesses spend forward, often leading to budget disconnects. In contrast, this engine inputs a business <strong>Target GMV</strong> and reverse-engineers all intermediate requirements: items sold, product card clicks, searches, engagements, impressions, and required ad spend per funnel stage.
            </p>
          </div>

          {/* Section 2: 5-Layer Mathematical Pipeline */}
          <div className="space-y-3">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${
              isDarkMode ? 'text-indigo-400' : 'text-indigo-600'
            }`}>
              2. Reverse-Funnel 5-Layer Pipeline
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={`p-3.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 block mb-1">
                  Layer 1: Commerce Demand
                </span>
                <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Target Items Sold = Target GMV / Weighted AOV<br />
                  Product Card Clicks = Items Sold / (Item per PCC Ratio)
                </p>
              </div>

              <div className={`p-3.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 block mb-1">
                  Layer 2: Intent Signal
                </span>
                <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Required Clicks = Items Sold / Click-to-Item CR<br />
                  Search Volumes = Clicks × Search-to-Click Ratio
                </p>
              </div>

              <div className={`p-3.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 block mb-1">
                  Layer 3: Engagement & Attention
                </span>
                <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Paid Engagements = PCC / (PCC per Paid Eng Ratio)<br />
                  Total Engagements = Paid Engagements / Paid Eng Share<br />
                  Attention Touchpoints = Paid Eng × Touchpoint Ratios (6s Views, 100% Views, Likes, Shares, Comments)
                </p>
              </div>

              <div className={`p-3.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 block mb-1">
                  Layer 4: Scale (Impressions)
                </span>
                <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Target Paid Impressions = Paid Engagements / Paid ER%<br />
                  Total Impressions = Paid Impressions / Paid Imp Share<br />
                  Organic Impressions = Total Impressions × Organic Imp Share
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-lg border ${
              isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 block mb-1">
                Layer 5: Funnel Delivery & Ad Spend
              </span>
              <p className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Funnel Impressions [Awareness, Consideration, Conversion] = Paid Imp × Funnel Imp Share<br />
                Funnel Spend [Stage] = (Funnel Imp / 1,000) × Stage CPM<br />
                Total Required Spend = Awareness Spend + Consideration Spend + Conversion Spend<br />
                <strong>TikTok Shop ROAS = Target GMV / Conversion Spend</strong> (Direct Shop Ads ROAS)
              </p>
            </div>
          </div>

          {/* Section 3: Time-Decay Weighting */}
          <div className="space-y-2">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${
              isDarkMode ? 'text-indigo-400' : 'text-indigo-600'
            }`}>
              3. Time-Decay Weighting Methodology
            </h3>
            <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
              Consumer conversion behavior and platform ad costs evolve constantly. Instead of treating older cohorts equally, the system applies an exponential time-decay model:
            </p>
            <div className={`p-3 rounded font-mono text-xs ${
              isDarkMode ? 'bg-slate-900 border border-slate-800 text-indigo-300' : 'bg-slate-100 border border-slate-200 text-indigo-800'
            }`}>
              w_i = Duration_i × exp(-ln(2) / HalfLife × AgeDays_i)
            </div>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              The configurable half-life (default 30 days) ensures recent campaign dynamics carry the greatest weight. Crucially, conversion ratios are calculated <strong>inside each cohort first</strong> before weighting, preventing raw volume distortions.
            </p>
          </div>

          {/* Section 4: Scale Efficiency & ROAS Elasticity */}
          <div className="space-y-2">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${
              isDarkMode ? 'text-indigo-400' : 'text-indigo-600'
            }`}>
              4. Non-Linear Scale Efficiency & ROAS Elasticity
            </h3>
            <p className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
              Marketing does not scale linearly. Historical TikTok data confirms that:
            </p>
            <ul className={`list-disc pl-5 space-y-1.5 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              <li>
                <strong>Lower GMV Targets (Lean Efficiency):</strong> When planned GMV is below baseline run-rate, conversion spend concentrates strictly on core high-intent buyers, repeat purchasers, and active product cards. Conversion ROAS increases naturally from ~5.5x–6.0x up to <strong>8.5x–12.0x+</strong>.
              </li>
              <li>
                <strong>Higher GMV Targets (Scale Saturation):</strong> Aggressive GMV targets require reaching colder prospects and competing for marginal impressions, which naturally normalizes ROAS.
              </li>
              <li>
                <strong>Adaptive Upper-Funnel Pacing:</strong> Lower sales targets do not require millions of broad-reach awareness impressions. Upper-funnel campaigns scale adaptively so brands avoid bloated branding expenses.
              </li>
            </ul>
          </div>

          {/* Section 5: Spend Guidelines & CIR Targets */}
          <div className="space-y-2">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${
              isDarkMode ? 'text-indigo-400' : 'text-indigo-600'
            }`}>
              5. Cost-to-Income Ratio (CIR) Benchmarks
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className={`p-3 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                  Shop Ads (Conversion CIR)
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold block mb-1">
                  Healthy Range: 8% – 18%
                </span>
                <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
                  The direct advertising cost spent on Product Shopping Ads, Live Shopping Ads, and Video Shopping Ads to capture GMV.
                </p>
              </div>

              <div className={`p-3 rounded-lg border ${
                isDarkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                  Full-Funnel (Total CIR)
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold block mb-1">
                  Healthy Range: 25% – 45%
                </span>
                <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
                  Total TikTok ad spend including TopView/Reach (Awareness) and Traffic/Views (Consideration) to feed the top of the funnel.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-3.5 border-t flex justify-end items-center ${
          isDarkMode ? 'border-slate-800 bg-[#111827]' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
          >
            Got it, back to Simulator
          </button>
        </div>
      </div>
    </div>
  );
}
