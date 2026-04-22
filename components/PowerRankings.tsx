import React, { useState, useMemo, useEffect } from 'react';
import { LeagueState, Team, PowerRankingEntry, PowerRankingSnapshot } from '../types';
import TeamBadge from './TeamBadge';
import { generateTeamComparisonInsight } from '../services/geminiService';
import { fmtSalary } from '../utils/formatters';
import { PlayerLink } from '../context/NavigationContext';

interface PowerRankingsProps {
  league: LeagueState;
  onViewRoster: (teamId: string) => void;
  onManageTeam: (teamId: string) => void;
}

const PowerRankings: React.FC<PowerRankingsProps> = ({ league, onViewRoster, onManageTeam }) => {
  const [activeTab, setActiveTab] = useState<'rankings' | 'comparison'>('rankings');
  const [compareId1, setCompareId1] = useState<string>(league.userTeamId);
  const [compareId2, setCompareId2] = useState<string>(league.teams.find(t => t.id !== league.userTeamId)?.id || '');
  const [insight, setInsight] = useState<string>('');
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  const snapshots = league.powerRankingHistory || [];
  const latestSnapshot = snapshots[snapshots.length - 1];

  const teamData = useMemo(() => {
    return league.teams.map(team => {
      const winPct = team.wins / (team.wins + team.losses || 1);
      const teamOvr = Math.round(team.roster.reduce((sum, p) => sum + p.rating, 0) / team.roster.length);
      const teamGames = league.history.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
      let totalDiff = 0;
      teamGames.forEach(g => {
        const isHome = g.homeTeamId === team.id;
        totalDiff += isHome ? (g.homeScore - g.awayScore) : (g.awayScore - g.homeScore);
      });
      const netRating = teamGames.length > 0 ? (totalDiff / teamGames.length).toFixed(1) : '0.0';
      
      const ranking = latestSnapshot?.rankings.find(r => r.teamId === team.id);
      const history = snapshots.map(s => s.rankings.find(r => r.teamId === team.id)?.rank || 30).reverse().slice(0, 10).reverse();

      return {
        ...team,
        ovr: teamOvr,
        netRating,
        winPct,
        rank: ranking?.rank || '-',
        change: ranking?.prevRank ? ranking.prevRank - (ranking?.rank || 30) : 0,
        history
      };
    });
  }, [league.teams, league.history, latestSnapshot, snapshots]);

  const sortedRankings = useMemo(() => {
    return [...teamData].sort((a, b) => {
      if (a.rank === '-') return 1;
      if (b.rank === '-') return -1;
      return (a.rank as number) - (b.rank as number);
    });
  }, [teamData]);

  const topMovers = useMemo(() => {
    return [...teamData]
      .filter(t => t.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 3);
  }, [teamData]);

  const handleComparisonInsight = async () => {
    const t1 = league.teams.find(t => t.id === compareId1);
    const t2 = league.teams.find(t => t.id === compareId2);
    if (!t1 || !t2) return;
    setIsGeneratingInsight(true);
    const text = await generateTeamComparisonInsight(t1, t2);
    setInsight(text);
    setIsGeneratingInsight(false);
  };

  const TeamComparisonCard = ({ team, side }: { team: Team, side: 'left' | 'right' }) => {
    const ovr = Math.round(team.roster.reduce((a,b)=>a+b.rating,0)/team.roster.length);
    const top5 = team.roster.sort((a,b)=>b.rating-a.rating).slice(0, 5);
    const cap = team.budget - team.roster.reduce((s,p)=>s+p.salary,0);

    return (
      <div className={`bg-slate-900/50 border border-slate-800 rounded-[2rem] p-8 flex flex-col gap-8 transition-all ${side === 'left' ? 'hover:border-amber-500/30' : 'hover:border-blue-500/30'}`}>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 shrink-0">
             <TeamBadge team={team} size="xl" />
          </div>
          <div>
            <h3 className="text-3xl font-display font-bold uppercase text-white leading-none">{team.name}</h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">{team.city} • {team.conference}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <p className="text-[10px] text-slate-500 font-black uppercase mb-1">OVR Rating</p>
              <p className="text-3xl font-display font-black text-white">{ovr}</p>
           </div>
           <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Cap Space</p>
              <p className={`text-xl font-mono font-bold ${cap > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>{fmtSalary(Math.abs(cap))}{cap < 0 ? ' over' : ''}</p>
           </div>
        </div>

        <div className="space-y-4">
           <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600 border-b border-slate-800 pb-2">Franchise Core</h4>
           {top5.map(p => (
              <div key={p.id} className="flex justify-between items-center">
                 <PlayerLink player={p} name={p.name} className="text-sm font-bold text-slate-300 uppercase tracking-tight" />
                 <span className="text-sm font-display font-bold text-amber-500">{p.rating}</span>
              </div>
           ))}
        </div>

        <div className="mt-auto pt-6 border-t border-slate-800 flex justify-between items-center">
           <div>
              <p className="text-[10px] text-slate-500 font-black uppercase">Coach Scheme</p>
              <p className="text-sm font-bold text-white uppercase">{team.activeScheme}</p>
           </div>
           <div className="text-right">
              <p className="text-[10px] text-slate-500 font-black uppercase">Status</p>
              <p className="text-sm font-bold text-amber-500 uppercase">{team.finances.ownerGoal}</p>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Power <span className="text-amber-500">Rankings</span></h2>
            <div className="flex gap-2">
               <button 
                onClick={() => setActiveTab('rankings')}
                className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'rankings' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
               >
                 Weekly Ranks
               </button>
               <button 
                onClick={() => setActiveTab('comparison')}
                className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'comparison' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
               >
                 Comparison Hub
               </button>
            </div>
          </div>

          {activeTab === 'rankings' && (
             <div className="flex gap-4">
                {topMovers.map(t => (
                   <div key={t.id} className="bg-slate-950/50 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-3">
                      <TeamBadge team={t} size="xs" />
                      <div>
                         <p className="text-[8px] font-black text-slate-600 uppercase">Top Mover</p>
                         <p className={`text-xs font-bold ${t.change > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                            {t.name} {t.change > 0 ? '↑' : '↓'} {Math.abs(t.change)}
                         </p>
                      </div>
                   </div>
                ))}
             </div>
          )}
        </div>
      </header>

      {activeTab === 'rankings' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  <th className="px-8 py-6">Rank</th>
                  <th className="px-8 py-6">Team</th>
                  <th className="px-8 py-6 text-center">Record</th>
                  <th className="px-8 py-6 text-center">Net Rtg</th>
                  <th className="px-8 py-6 text-center">L10</th>
                  <th className="px-8 py-6 text-center">Trend (10w)</th>
                  <th className="px-8 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {sortedRankings.map((team, idx) => (
                  <tr key={team.id} className={`group hover:bg-slate-800/30 transition-all ${team.id === league.userTeamId ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-4">
                          <span className={`text-2xl font-display font-black ${idx < 3 ? 'text-amber-500' : idx < 10 ? 'text-white' : 'text-slate-600'}`}>
                             {idx + 1}
                          </span>
                          {team.change !== 0 && (
                             <span className={`text-[10px] font-black ${team.change > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {team.change > 0 ? '↑' : '↓'}{Math.abs(team.change)}
                             </span>
                          )}
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-4 cursor-pointer group/team" onClick={() => onManageTeam(team.id)}>
                          <TeamBadge team={team} size="md" />
                          <div>
                             <p className={`font-display font-bold uppercase text-lg ${team.id === league.userTeamId ? 'text-amber-500' : 'text-white group-hover/team:text-amber-500'} transition-all`}>{team.name}</p>
                             <p className="text-[10px] text-slate-500 font-bold uppercase">{team.city}</p>
                          </div>
                       </div>
                    </td>
                    <td className="px-8 py-6 text-center font-mono font-bold text-slate-300">
                       {team.wins}-{team.losses}
                    </td>
                    <td className="px-8 py-6 text-center font-display font-bold text-xl text-white">
                       {team.netRating}
                    </td>
                    <td className="px-8 py-6 text-center font-mono text-sm text-slate-400">
                       {team.lastTen.filter(r => r === 'W').length}-{team.lastTen.filter(r => r === 'L').length}
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex items-end justify-center gap-0.5 h-10">
                          {team.history.map((rank, i) => (
                             <div 
                              key={i} 
                              className={`w-1.5 rounded-t-full transition-all ${rank <= 5 ? 'bg-amber-500' : rank <= 15 ? 'bg-slate-500' : 'bg-slate-800'}`}
                              style={{ height: `${((31-rank)/30)*100}%` }}
                             ></div>
                          ))}
                       </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <button 
                        onClick={() => onViewRoster(team.id)}
                        className="px-4 py-2 bg-slate-800 hover:bg-amber-500 text-slate-400 hover:text-slate-950 text-[10px] font-black uppercase rounded-lg transition-all"
                       >
                         View Roster
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {teamData.length === 0 && (
               <div className="py-40 text-center opacity-30 italic">Rankings will update after Week 1 simulations.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in zoom-in-95 duration-500">
           <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl flex flex-col md:flex-row items-end gap-6 relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-slate-800/50 hidden md:block"></div>
              
              <div className="flex-1 space-y-2 w-full">
                 <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Select Team A</label>
                 <select 
                    value={compareId1} 
                    onChange={(e) => setCompareId1(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold text-lg focus:outline-none focus:border-amber-500/50"
                 >
                    {league.teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
                 </select>
              </div>

              <div className="z-10 bg-slate-800 w-12 h-12 rounded-full flex items-center justify-center font-display font-black text-slate-400 shrink-0 border-4 border-slate-900">VS</div>

              <div className="flex-1 space-y-2 w-full">
                 <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Select Team B</label>
                 <select 
                    value={compareId2} 
                    onChange={(e) => setCompareId2(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold text-lg focus:outline-none focus:border-blue-500/50"
                 >
                    {league.teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
                 </select>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {league.teams.find(t => t.id === compareId1) && (
                 <TeamComparisonCard team={league.teams.find(t => t.id === compareId1)!} side="left" />
              )}
              {league.teams.find(t => t.id === compareId2) && (
                 <TeamComparisonCard team={league.teams.find(t => t.id === compareId2)!} side="right" />
              )}
           </div>

           <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                 <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
              </div>
              
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
                 <div className="flex-1 space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500">Gemini Matchup Forecast</h3>
                    {insight ? (
                       <p className="text-2xl font-medium italic text-slate-200 leading-relaxed animate-in slide-in-from-bottom-2">
                          "{insight}"
                       </p>
                    ) : (
                       <p className="text-xl text-slate-500 italic">Select teams and run analysis to see technical insights.</p>
                    )}
                 </div>
                 <div className="shrink-0 text-center space-y-6">
                    <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8">
                       <p className="text-[10px] font-black text-slate-600 uppercase mb-2">Win Probability</p>
                       <div className="flex items-center gap-6">
                          <span className="text-4xl font-display font-black text-amber-500">
                             {compareId1 && compareId2 ? (
                                Math.round(50 + (league.teams.find(t=>t.id===compareId1)!.wins - league.teams.find(t=>t.id===compareId2)!.wins) * 2)
                             ) : 50}%
                          </span>
                          <div className="w-32 h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                             <div className="h-full bg-amber-500" style={{ width: '65%' }}></div>
                          </div>
                          <span className="text-4xl font-display font-black text-blue-400">35%</span>
                       </div>
                    </div>
                    <button 
                      onClick={handleComparisonInsight}
                      disabled={isGeneratingInsight || !compareId1 || !compareId2}
                      className="px-12 py-5 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-slate-950 font-display font-bold uppercase rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
                    >
                       {isGeneratingInsight ? 'Processing Data...' : 'Generate AI Analysis'}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PowerRankings;