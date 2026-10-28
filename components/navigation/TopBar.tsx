'use client';

import React from 'react';
import {
  Sun,
  Moon,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface TopBarProps {
  currentView: 'login' | 'welcome' | 'home' | 'dashboard';
  activeEngine: 'media' | 'creativeReport' | 'commerce' | 'creative' | 'signal' | 'sku' | 'pidRank' | null;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export default function TopBar({
  currentView,
  activeEngine,
  isDarkMode,
  onToggleTheme,
  isFullscreen,
  onToggleFullscreen,
}: TopBarProps) {
  const viewTitles: Record<string, { title: string; subtitle: string }> = {
    home: {
      title: 'General Overview',
      subtitle: 'Cross-channel media, commerce, and SKU macro performance overview',
    },
    media: {
      title: 'Digital Media',
      subtitle: 'Paid media performance, ad spend, impressions, CTR, and CPC analytics',
    },
    creativeReport: {
      title: 'Creative Report',
      subtitle: 'Ad group and creative-level daily performance, video previews, CTR, VTR, and CPM analytics',
    },
    commerce: {
      title: 'Commerce Tracker',
      subtitle: 'E-commerce revenue, GMV, orders, CIR, and store dynamics',
    },
    sku: {
      title: 'PID & SKU Performance',
      subtitle: 'Individual product performance, revenue, units, and inventory tracking',
    },
    pidRank: {
      title: 'PID Push Rank Tracker',
      subtitle: 'Live rank tracking, daily performance, and operational adjustments',
    },
    creative: {
      title: 'Top Creative',
      subtitle: 'Ad creative assets, spend allocation, ROAS, and video performance',
    },
    signal: {
      title: 'TikTok Media Signal Tracker',
      subtitle: 'Campaign signal hierarchy, bidding strategies, and delivery health',
    },
  };

  const key = currentView === 'home' ? 'home' : (activeEngine || 'home');
  const currentMeta = viewTitles[key] || viewTitles.home;

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-[#090d16] border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Title & Subtitle */}
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {currentMeta.title}
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
          {currentMeta.subtitle}
        </p>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-slate-300" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="p-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}

