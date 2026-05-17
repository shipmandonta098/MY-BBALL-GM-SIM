import React, { useState } from 'react';
import { PlayerDevChange } from '../types';

interface Props {
  changes: PlayerDevChange[];
  season: number;
  onViewRoster: () => void;
  onBeginPreseason: () => void;
}

type SortKey = 'ovrDelta' | 'potDelta' | 'age' | 'name';

const Delta: React.FC<{ val: number; size?: 'sm' | 'lg' }> = ({ val, size = 'sm' }) => {
  if (val === 0) return <span className={`${size === 'lg' ? 'text-lg' : 'text-sm'} font-black text-slate-600`}>—</span>;
  const cls = val > 0
    ? size === 'lg' ? 'text-emerald-400 text-lg font-black' : 'text-emerald-400 text-sm font-bold'
    : size === 'lg' ? 'text-rose-400 text-lg font-black' : 'text-rose-400 text-sm font-bold';
  return <span className={cls}>{val > 0 ? `+${val}` : val}</span>;
};

const DevReportModal: React.FC<Props> = ({ changes, season, onViewRoster, onBeginPreseason }) => {
  const [sortKey, setSortKey] = useState<SortKey>('ovrDelta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const improved = changes.filter(c => c.ovrAfter > c.ovrBefore).length;
  const declined = changes.filter(c => c.ovrAfter < c.ovrBefore).length;
  const stable   = changes.length - improved - declined;

  const biggestGain    = [...changes].sort((a, b) => (b.ovrAfter - b.ovrBefore) - (a.ovrAfter - a.ovrBefore))[0];
  const biggestDecline = [...changes].sort((a, b) => (a.ovrAfter - a.ovrBefore) - (b.ovrAfter - b.ovrBefore))[0];

  const sorted = [...changes].sort((a, b) => {
    let av = 0, bv = 0;
    if (sortKey === 'ovrDelta') { av = a.ovrAfter - a.ovrBefore; bv = b.ovrAfter - b.ovrBefore; }
    else if (sortKey === 'potDelta') { av = a.potAfter - a.potBefore; bv = b.potAfter - b.potBefore; }
    else if (sortKey === 'age') { av = a.age; bv = b.age; }
    else { return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); }
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortTh: React.FC<{ label: string; k: SortKey }> = ({ label, k }) => (
    <th
      className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white transition-colors whitespace-nowrap select-none"
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  );

  return (
    <div className="fixed inset-0 z-[9500] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.7)] overflow-hidden">

        {/* Header */}
        <div className="px-10 pt-10 pb-6 border-b border-slate-800 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">Season {season} · Offseason</p>
              <h1 className="text-4xl font-display font-bold uppercase tracking-tight text-white leading-none">
                Player <span className="text-sky-400">Development</span>
              </h1>
            </div>
            <div className="flex gap-3 mt-1">
              <div className="text-center px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                <div className="text-2xl font-display font-black text-emerald-400">{improved}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500/70">Improved</div>
              </div>
              <div className="text-center px-4 py-2 bg-slate-800 border border-slate-700 rounded-2xl">
                <div className="text-2xl font-display font-black text-slate-400">{stable}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">Stable</div>
              </div>
              <div className="text-center px-4 py-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl">
                <div className="text-2xl font-display font-black text-rose-400">{declined}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-rose-500/70">Declined</div>
              </div>
            </div>
          </div>

          {/* Spotlight: biggest gain / biggest decline */}
          {(biggestGain || biggestDecline) && (
            <div className="flex gap-3 mt-5">
              {biggestGain && (biggestGain.ovrAfter - biggestGain.ovrBefore) > 0 && (
                <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl">
                  <span className="text-xl">📈</span>
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500/60">Biggest Riser</div>
                    <div className="text-sm font-bold text-white">{biggestGain.name}
                      <span className="ml-2 text-emerald-400 font-black">+{biggestGain.ovrAfter - biggestGain.ovrBefore} OVR</span>
                      {biggestGain.hadFocus && <span className="ml-1 text-[9px] text-sky-400 font-black">🎯 Focus</span>}
                    </div>
                    <div className="text-[10px] text-slate-500">{biggestGain.position} · Age {biggestGain.age} · {biggestGain.ovrBefore} → {biggestGain.ovrAfter}</div>
                  </div>
                </div>
              )}
              {biggestDecline && (biggestDecline.ovrAfter - biggestDecline.ovrBefore) < 0 && (
                <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-rose-500/8 border border-rose-500/20 rounded-2xl">
                  <span className="text-xl">📉</span>
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-rose-500/60">Biggest Decline</div>
                    <div className="text-sm font-bold text-white">{biggestDecline.name}
                      <span className="ml-2 text-rose-400 font-black">{biggestDecline.ovrAfter - biggestDecline.ovrBefore} OVR</span>
                    </div>
                    <div className="text-[10px] text-slate-500">{biggestDecline.position} · Age {biggestDecline.age} · {biggestDecline.ovrBefore} → {biggestDecline.ovrAfter}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable table */}
        <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 z-10">
              <tr>
                <SortTh label="Player" k="name" />
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">POS</th>
                <SortTh label="Age" k="age" />
                <SortTh label="OVR Δ" k="ovrDelta" />
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">OVR</th>
                <SortTh label="POT Δ" k="potDelta" />
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">POT</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Focus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sorted.map(c => {
                const ovrD = c.ovrAfter - c.ovrBefore;
                const potD = c.potAfter - c.potBefore;
                const rowCls = ovrD > 2 ? 'bg-emerald-500/4' : ovrD < -1 ? 'bg-rose-500/4' : '';
                return (
                  <tr key={c.playerId} className={`hover:bg-slate-800/50 transition-colors ${rowCls}`}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-white">{c.name}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-[10px] font-black text-slate-500 border border-slate-700 rounded px-1.5 py-0.5 uppercase">{c.position}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-slate-400">{c.age}</span>
                    </td>
                    <td className="px-4 py-3 text-center"><Delta val={ovrD} /></td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-slate-500">{c.ovrBefore}</span>
                      <span className="text-slate-700 mx-1">→</span>
                      <span className="text-sm font-black text-white">{c.ovrAfter}</span>
                    </td>
                    <td className="px-4 py-3 text-center"><Delta val={potD} /></td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-slate-500">{c.potBefore}</span>
                      <span className="text-slate-700 mx-1">→</span>
                      <span className="text-sm font-bold text-slate-300">{c.potAfter}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.hadFocus && <span className="text-sky-400 text-xs font-bold">🎯</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div className="px-10 py-6 border-t border-slate-800 flex justify-between items-center gap-4 shrink-0">
          <button
            onClick={onViewRoster}
            className="px-6 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm hover:bg-slate-700 transition-all"
          >
            View Full Roster ↗
          </button>
          <button
            onClick={onBeginPreseason}
            className="px-10 py-4 rounded-2xl bg-sky-500 text-white font-display font-black text-sm uppercase tracking-widest hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20"
          >
            Begin Preseason →
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevReportModal;
