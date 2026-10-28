import React, { useState } from 'react';
import { formatIDR, formatNum, parseNum } from '@/lib/formatters';
import { getDrivePreviewLink, getInstagramEmbedLink, getTikTokEmbedLink } from '@/lib/mediaUtils';
import { CREATIVES_PER_PAGE } from '@/lib/config';

interface TopCreativeViewProps {
  creativeData: any[];
  isDarkMode: boolean;
}

export default function TopCreativeView({ creativeData, isDarkMode }: TopCreativeViewProps) {
  const [creativePage, setCreativePage] = useState(1);

  return (
    <div className="w-full">
      <div className="space-y-4">
        {creativeData.length === 0 ? (
          <div className="bg-white dark:bg-[#0f172a] p-8 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm text-center">
            <p className="text-slate-500 dark:text-slate-400 font-bold">No creative data found for the selected filters.</p>
          </div>
        ) : (
          creativeData
            .slice((creativePage - 1) * CREATIVES_PER_PAGE, creativePage * CREATIVES_PER_PAGE)
            .map((row, index) => {
              const driveLink = getDrivePreviewLink(row['Creative Link']);
              const igEmbed = getInstagramEmbedLink(row['Social Link'] || row['Creative Link']);
              const ttEmbed = getTikTokEmbedLink(row['Social Link'] || row['Creative Link']);
              const iframeSrc = ttEmbed || igEmbed || driveLink;
              const adType = String(row['Ad Type'] || '').toLowerCase();

              return (
                <div
                  key={index}
                  className={`rounded-md border shadow-sm overflow-hidden flex flex-col xl:flex-row transition-all hover:shadow-lg ${
                    isDarkMode ? 'bg-[#0f172a] border-slate-800 hover:border-indigo-500/50' : 'bg-white border-slate-200 hover:border-indigo-400'
                  }`}
                >
                  <div className="w-full xl:w-3/12 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-800 relative bg-[#090d16]">
                    {iframeSrc ? (
                      <iframe src={iframeSrc} className="w-full h-full min-h-[280px]" frameBorder="0" allowFullScreen></iframe>
                    ) : (
                      <div className="w-full h-full min-h-[280px] flex items-center justify-center text-xs text-slate-500 font-medium">
                        No Preview Available
                      </div>
                    )}
                  </div>

                  <div className="w-full xl:w-9/12 p-5 md:p-6 flex flex-col">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-4">
                      <h3 className={`text-sm md:text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} line-clamp-2`}>
                        {row['Ad Name'] || 'Unknown Ad'}
                      </h3>

                      {row['Social Link'] && row['Social Link'] !== '-' && (
                        <a
                          href={row['Social Link']}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`shrink-0 px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 shadow-sm transition-transform hover:-translate-y-0.5 ${
                            isDarkMode ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-900 text-white hover:bg-indigo-600'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Social Link
                        </a>
                      )}
                    </div>

                    <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 p-4 rounded-md border ${isDarkMode ? 'bg-[#111827] border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                      <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Spend</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatIDR(parseNum(row['Spend']))}</p></div>
                      <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Impressions</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatNum(parseNum(row['Impressions']))}</p></div>
                      <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>CTR</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{row['CTR'] || '-'}</p></div>
                      <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>CPM</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatIDR(parseNum(row['CPM']))}</p></div>

                      <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>VTR (6s)</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{row['VTR (6s)'] || '-'}</p></div>
                      <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>VTR (15s)</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{row['VTR (15s)'] || '-'}</p></div>
                      <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>CPCo</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{row['CPCo (Cost/Result)'] || '-'}</p></div>
                      {adType.includes('cpas') && (
                        <>
                          <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Purchases</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatNum(parseNum(row['Purchases']))}</p></div>
                          <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>GMV</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatIDR(parseNum(row['GMV']))}</p></div>
                          <div><p className={`font-bold mb-1.5 text-[10px] uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>ROAS</p><p className={`font-mono font-bold text-[clamp(14px,1vw,16px)] text-emerald-500`}>{parseNum(row['ROAS']).toFixed(2)}x</p></div>
                        </>
                      )}
                    </div>

                    <div className="mt-auto">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Creative Analysis
                        </h4>
                      </div>
                      <div className={`p-3 rounded-md text-sm leading-relaxed border font-medium ${isDarkMode ? 'bg-indigo-950/40 text-indigo-200 border-indigo-900/50' : 'bg-indigo-50/60 text-indigo-900 border-indigo-100'}`}>
                        {row['Insights'] || 'No insights available.'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {creativeData.length > CREATIVES_PER_PAGE && (
        <div className="flex justify-center items-center space-x-3 mt-8 mb-8">
          <button
            disabled={creativePage === 1}
            onClick={() => { setCreativePage(p => p - 1); window.scrollTo(0, 0); }}
            className={`px-4 py-2 border rounded-md font-bold text-xs shadow-sm transition-all disabled:opacity-40 ${
              isDarkMode ? 'bg-[#0f172a] border-slate-700 hover:bg-slate-800 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            Previous
          </button>
          <span className={`px-4 py-2 font-bold rounded-md border text-xs ${
            isDarkMode ? 'bg-indigo-900/40 text-indigo-300 border-indigo-800' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
          }`}>
            Page {creativePage} of {Math.ceil(creativeData.length / CREATIVES_PER_PAGE)}
          </span>
          <button
            disabled={creativePage === Math.ceil(creativeData.length / CREATIVES_PER_PAGE)}
            onClick={() => { setCreativePage(p => p + 1); window.scrollTo(0, 0); }}
            className={`px-4 py-2 border rounded-md font-bold text-xs shadow-sm transition-all disabled:opacity-40 ${
              isDarkMode ? 'bg-[#0f172a] border-slate-700 hover:bg-slate-800 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}