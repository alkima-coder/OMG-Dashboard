import React from 'react';

interface WelcomeViewProps {
  onSelectHome: () => void;
  onSelectEngine: (engine: 'media' | 'commerce' | 'creative' | 'signal') => void;
}

export default function WelcomeView({ onSelectHome, onSelectEngine }: WelcomeViewProps) {
  return (
    <div className="welcome-screen fixed inset-0 z-[100] bg-[#090d16] flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-6xl w-full text-center">
        <h1 className="text-[clamp(2.5rem,5vw,4rem)] font-black text-white mb-4 tracking-tight">Welcome to OMG Dashboard</h1>
        <p className="text-slate-400 mb-16 text-[clamp(1rem,1.5vw,1.25rem)] font-medium">Please select the tracker you wish to launch. You can navigate between them at any time.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          <button onClick={onSelectHome} className="bg-[#111827] p-8 rounded-md hover:bg-[#1e293b] transition-all group border border-indigo-500/20">
            <div className="w-14 h-14 mx-auto bg-indigo-600 text-white rounded-md flex items-center justify-center mb-6">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12h18M3 6h18M3 18h18"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">General Overview</h2>
            <p className="text-xs text-slate-400">Cross-channel performance summary.</p>
          </button>

          <button onClick={() => onSelectEngine('media')} className="bg-[#111827] p-8 rounded-md hover:bg-[#1e293b] transition-all group border border-slate-800">
            <div className="w-14 h-14 bg-indigo-500 text-white rounded-md flex items-center justify-center mb-6">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Digital Media</h2>
            <p className="text-xs text-slate-400">Full-funnel media metrics.</p>
          </button>

          <button onClick={() => onSelectEngine('commerce')} className="bg-[#111827] p-8 rounded-md hover:bg-[#1e293b] transition-all group border border-slate-800">
            <div className="w-14 h-14 bg-emerald-500 text-white rounded-md flex items-center justify-center mb-6">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Commerce Tracker</h2>
            <p className="text-xs text-slate-400">Revenue and ROAS metrics.</p>
          </button>

          <button onClick={() => onSelectEngine('creative')} className="bg-[#111827] p-8 rounded-md hover:bg-[#1e293b] transition-all group border border-slate-800">
            <div className="w-14 h-14 bg-lime-500 text-white rounded-md flex items-center justify-center mb-6">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Top Creative</h2>
            <p className="text-xs text-slate-400">Winning creative assets.</p>
          </button>

          <button onClick={() => onSelectEngine('signal')} className="bg-[#111827] p-8 rounded-md hover:bg-[#1e293b] transition-all group border border-emerald-500/20">
            <div className="w-14 h-14 bg-emerald-600 text-white rounded-md flex items-center justify-center mb-6">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Media Signal</h2>
            <p className="text-xs text-slate-400">TikTok Actual vs Plan.</p>
          </button>
        </div>
      </div>
    </div>
  );
}