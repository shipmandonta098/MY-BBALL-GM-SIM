
import React, { useState } from 'react';
import { GameResult, Team, GamePlayerLine } from '../types';
import TeamBadge from './TeamBadge';
import { PlayerLink, TeamLink } from '../context/NavigationContext';

interface BoxScoreModalProps {
  result: GameResult;
  homeTeam: Team;
  awayTeam: Team;
  onClose: () => void;
}

const BoxScoreModal: React.FC<BoxScoreModalProps> = ({ result, homeTeam, awayTeam, onClose }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'pbp'>('stats');
  const isHomeWinner = result.homeScore > result.awayScore;

  // Build period column labels dynamically: Q1–Q4 + OT1, OT2, OT3 if overtime
  const numPeriods = result.quarterScores.home.length;
  const periodLabels = Array.from({ length: numPeriods }, (_, i) =>
    i < 4 ? `${i + 1}Q` : `OT${i - 3}`
  );
  const otPeriods = numPeriods - 4; // 0 = regulation, 1 = OT, 2 = 2OT, 3 = 3OT

  // Convert raw quarter number (5, 6, 7) to a display label for PBP
  const quarterLabel = (q: number) => q <= 4 ? `Q${q}` : `OT${q - 4}`;

  const StatTable = ({ team, stats }: { team: Team, stats: GamePlayerLine[] }) => {
    const active = stats.filter(l => !l.dnp && l.min > 0).sort((a, b) => b.pts - a.pts);
    const dnp    = stats.filter(l => !!l.dnp || l.min === 0);
    const sum = (key: keyof GamePlayerLine) => active.reduce((acc, l) => acc + ((l[key] as number) || 0), 0);
    const totals = {
      min: sum('min'), pts: sum('pts'), reb: sum('reb'), ast: sum('ast'),
      stl: sum('stl'), blk: sum('blk'), tov: sum('tov'),
      fgm: sum('fgm'), fga: sum('fga'),
      threepm: sum('threepm'), threepa: sum('threepa'),
      ftm: sum('ftm'), fta: sum('fta'),
    };
    const fgPct  = totals.fga  > 0 ? `${Math.round(totals.fgm  / totals.fga  * 100)}%` : '—';
    const tpPct  = totals.threepa > 0 ? `${Math.round(totals.threepm / totals.threepa * 100)}%` : '—';
    const ftPct  = totals.fta  > 0 ? `${Math.round(totals.ftm  / totals.fta  * 100)}%` : '—';
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <TeamBadge team={team} size="md" />
          <TeamLink teamId={team.id} name={`${team.city} ${team.name}`} className="text-xl font-display font-bold uppercase text-white" />
        </div>

        {/* Player table — no totals row */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-4">Player</th>
                <th className="px-2 py-4 text-center">MIN</th>
                <th className="px-2 py-4 text-center">PTS</th>
                <th className="px-2 py-4 text-center">REB</th>
                <th className="px-2 py-4 text-center">AST</th>
                <th className="px-2 py-4 text-center">STL</th>
                <th className="px-2 py-4 text-center">BLK</th>
                <th className="px-2 py-4 text-center">FG%</th>
                <th className="px-2 py-4 text-center">3P%</th>
                <th className="px-2 py-4 text-center">FT%</th>
                <th className="px-2 py-4 text-center">+/-</th>
                <th className="px-2 py-4 text-center">TO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {active.map(line => (
                <tr key={line.playerId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-4 font-bold text-slate-200 uppercase tracking-tight">
                    <PlayerLink playerId={line.playerId} name={line.name} className="font-bold text-slate-200 uppercase tracking-tight" />
                  </td>
                  <td className="px-2 py-4 text-center font-mono">{line.min}</td>
                  <td className="px-2 py-4 text-center font-display font-bold text-sm text-amber-500">{line.pts}</td>
                  <td className="px-2 py-4 text-center font-mono">{line.reb}</td>
                  <td className="px-2 py-4 text-center font-mono">{line.ast}</td>
                  <td className="px-2 py-4 text-center font-mono text-slate-500">{line.stl}</td>
                  <td className="px-2 py-4 text-center font-mono text-slate-500">{line.blk}</td>
                  <td className="px-2 py-4 text-center">
                    <span className="block font-mono text-[10px] text-slate-200">{line.fgm}-{line.fga}</span>
                    <span className="block font-mono text-[9px] text-orange-400">{line.fga > 0 ? `${Math.round(line.fgm / line.fga * 100)}%` : '—'}</span>
                  </td>
                  <td className="px-2 py-4 text-center">
                    <span className="block font-mono text-[10px] text-slate-400">{line.threepm}-{line.threepa}</span>
                    <span className="block font-mono text-[9px] text-orange-400">{line.threepa > 0 ? `${Math.round(line.threepm / line.threepa * 100)}%` : '—'}</span>
                  </td>
                  <td className="px-2 py-4 text-center">
                    <span className="block font-mono text-[10px] text-slate-400">{line.ftm}-{line.fta}</span>
                    <span className="block font-mono text-[9px] text-orange-400">{line.fta > 0 ? `${Math.round(line.ftm / line.fta * 100)}%` : '—'}</span>
                  </td>
                  <td className={`px-2 py-4 text-center font-mono font-bold ${line.plusMinus > 0 ? 'text-emerald-500' : line.plusMinus < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                    {line.plusMinus > 0 ? `+${line.plusMinus}` : line.plusMinus}
                  </td>
                  <td className="px-2 py-4 text-center font-mono text-rose-500/50">{line.tov}</td>
                </tr>
              ))}
              {dnp.length > 0 && (
                <>
                  <tr className="border-t border-slate-700/50">
                    <td colSpan={12} className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">Did Not Play</td>
                  </tr>
                  {dnp.map(line => (
                    <tr key={line.playerId} className="bg-rose-950/10">
                      <td className="px-4 py-3 font-bold text-rose-500/70 uppercase tracking-tight">
                        <PlayerLink playerId={line.playerId} name={line.name} className="font-bold text-rose-500/70 uppercase tracking-tight" />
                      </td>
                      <td colSpan={11} className="px-2 py-3 text-[10px] font-black uppercase tracking-widest text-rose-500/50">
                        DNP – {line.dnp}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Team Totals card — separate from player rows */}
        <div className="rounded-2xl border border-orange-500/30 bg-slate-950/60 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-orange-500/20 bg-orange-500/5">
            <TeamBadge team={team} size="sm" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400">Team Totals — {team.city} {team.name}</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 px-5 py-4">
            {[
              { label: 'PTS', value: <span className="text-amber-500 font-bold">{totals.pts}</span> },
              { label: 'REB', value: totals.reb },
              { label: 'AST', value: totals.ast },
              { label: 'STL', value: totals.stl },
              { label: 'BLK', value: totals.blk },
              { label: 'TO',  value: <span className="text-rose-400">{totals.tov}</span> },
              { label: 'FG',  value: <>{totals.fgm}-{totals.fga} <span className="text-orange-400">{fgPct}</span></> },
              { label: '3P',  value: <>{totals.threepm}-{totals.threepa} <span className="text-orange-400">{tpPct}</span></> },
              { label: 'FT',  value: <>{totals.ftm}-{totals.fta} <span className="text-orange-400">{ftPct}</span></> },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-2 min-w-[80px]">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                <span className="font-mono font-bold text-sm text-slate-200">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[3000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-6xl h-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header HUD */}
        <div className="p-8 md:p-12 border-b border-slate-800 bg-slate-900/50 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 blur-[100px] rounded-full -mr-48 -mt-48"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-12">
               <div className="text-center">
                  <TeamBadge team={homeTeam} size="xl" className="mb-4 mx-auto" />
                  <p className={`text-6xl font-display font-black leading-none ${isHomeWinner ? 'text-white' : 'text-slate-600'}`}>{result.homeScore}</p>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.4em] mt-2">Home</p>
               </div>
               <div className="flex flex-col items-center">
                  <span className="px-6 py-2 bg-slate-800 text-slate-400 text-xs font-black uppercase rounded-full border border-slate-700 mb-2">
                    Final{otPeriods > 0 ? `/${otPeriods === 1 ? 'OT' : otPeriods === 2 ? '2OT' : '3OT'}` : ''}
                  </span>
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">
                    {otPeriods > 0 ? (otPeriods === 1 ? 'Overtime' : otPeriods === 2 ? 'Double Overtime' : 'Triple Overtime') : 'Regular Season'}
                  </p>
               </div>
               <div className="text-center">
                  <TeamBadge team={awayTeam} size="xl" className="mb-4 mx-auto" />
                  <p className={`text-6xl font-display font-black leading-none ${!isHomeWinner ? 'text-white' : 'text-slate-600'}`}>{result.awayScore}</p>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.4em] mt-2">Away</p>
               </div>
            </div>

            {/* Quarterly Table — extends to OT1/OT2/OT3 when applicable */}
            <div className="bg-slate-950/60 rounded-2xl p-6 border border-slate-800 min-w-[300px]">
               <table className="w-full text-center">
                  <thead className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
                     <tr>
                        <th className="pb-2 text-left">TEAM</th>
                        {periodLabels.map(label => (
                          <th key={label} className={`pb-2 ${label.startsWith('OT') ? 'text-amber-400' : ''}`}>{label}</th>
                        ))}
                        <th className="pb-2 text-white">TOT</th>
                     </tr>
                  </thead>
                  <tbody className="text-xs font-mono font-bold">
                     <tr className="border-b border-slate-800/50">
                        <td className="py-2 text-left text-slate-400 uppercase font-display">{homeTeam.name}</td>
                        {result.quarterScores.home.map((s, i) => (
                          <td key={i} className={`py-2 ${i >= 4 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{s}</td>
                        ))}
                        <td className="py-2 text-white">{result.homeScore}</td>
                     </tr>
                     <tr>
                        <td className="py-2 text-left text-slate-400 uppercase font-display">{awayTeam.name}</td>
                        {result.quarterScores.away.map((s, i) => (
                          <td key={i} className={`py-2 ${i >= 4 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{s}</td>
                        ))}
                        <td className="py-2 text-white">{result.awayScore}</td>
                     </tr>
                  </tbody>
               </table>
            </div>
          </div>
          
          <button onClick={onClose} className="absolute top-8 right-8 p-3 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors z-20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 shrink-0">
           <button 
             onClick={() => setActiveTab('stats')}
             className={`px-10 py-5 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${activeTab === 'stats' ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
           >
              Box Score Stats
              {activeTab === 'stats' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500"></div>}
           </button>
           <button 
             onClick={() => setActiveTab('pbp')}
             className={`px-10 py-5 text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${activeTab === 'pbp' ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
           >
              Play-By-Play Log
              {activeTab === 'pbp' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500"></div>}
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
          {activeTab === 'stats' ? (
             <div className="space-y-16">
                {result.aiRecap && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-8 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                       <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-2">Gemini Tactical Recap</h4>
                    <p className="text-xl italic font-medium leading-relaxed text-slate-200">"{result.aiRecap}"</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-16 pb-20">
                  <StatTable team={homeTeam} stats={result.homePlayerStats} />
                  <StatTable team={awayTeam} stats={result.awayPlayerStats} />
                </div>
             </div>
          ) : (
             <div className="max-w-3xl mx-auto space-y-4 pb-20">
                {result.playByPlay?.map((event, i) => (
                   <div key={i} className="flex gap-8 p-6 bg-slate-950/40 border border-slate-800 rounded-2xl hover:border-amber-500/20 transition-all">
                      <span className={`text-xs font-mono w-20 shrink-0 font-bold ${event.quarter > 4 ? 'text-amber-500' : 'text-slate-600'}`}>{quarterLabel(event.quarter)} {event.time}</span>
                      <p className={`text-sm font-medium leading-relaxed ${event.type === 'score' ? 'text-white font-bold' : 'text-slate-400'}`}>
                         {event.text}
                      </p>
                   </div>
                ))}
                {(!result.playByPlay || result.playByPlay.length === 0) && (
                   <div className="py-20 text-center text-slate-600 italic">No detailed play-by-play log available for this archived game.</div>
                )}
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BoxScoreModal;