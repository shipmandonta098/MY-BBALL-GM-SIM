
import React, { useState, useMemo } from 'react';
import { LeagueState, SeasonAwards, AwardWinner, Player, Coach, Team } from '../types';

interface AwardsProps {
  league: LeagueState;
  onScout: (player: Player) => void;
  onScoutCoach: (coach: Coach) => void;
  onManageTeam: (teamId: string) => void;
}

type AwardsTab = 'races' | 'current' | 'history';

const Awards: React.FC<AwardsProps> = ({ league, onScout, onScoutCoach, onManageTeam }) => {
  const [activeTab, setActiveTab] = useState<AwardsTab>('races');
  const [historyYear, setHistoryYear] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });

  const allPlayers = useMemo(() => league.teams.flatMap(t => t.roster), [league.teams]);
  const allTeams = league.teams;

  const awardRaces = useMemo(() => {
    const getPPG = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.points / p.stats.gamesPlayed : 0;
    const getRPG = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.rebounds / p.stats.gamesPlayed : 0;
    const getAPG = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.assists / p.stats.gamesPlayed : 0;
    const getBPG = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.blocks / p.stats.gamesPlayed : 0;
    const getSPG = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.steals / p.stats.gamesPlayed : 0;
    const getPER = (p: Player) => {
      if (p.stats.gamesPlayed === 0) return 0;
      const val = (p.stats.points + p.stats.rebounds + p.stats.assists + p.stats.steals + p.stats.blocks) 
                - (p.stats.fga - p.stats.fgm) - (p.stats.fta - p.stats.ftm) - p.stats.tov;
      return val / p.stats.gamesPlayed;
    };

    const mvp = allPlayers
      .filter(p => p.stats.gamesPlayed > 5)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const ppg = getPPG(p);
        const rpg = getRPG(p);
        const apg = getAPG(p);
        const per = getPER(p);
        const score = (ppg * 1.2) + (rpg * 0.8) + (apg * 1.0) + (per * 1.5) + (team.wins * 0.5);
        return { player: p, team, score, stats: { PPG: ppg.toFixed(1), TRB: rpg.toFixed(1), AST: apg.toFixed(1), PER: per.toFixed(1) } };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const dpoy = allPlayers
      .filter(p => p.stats.gamesPlayed > 5)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const bpg = getBPG(p);
        const spg = getSPG(p);
        const rpg = getRPG(p);
        const score = (bpg * 4) + (spg * 3) + (rpg * 0.5) + (p.attributes.defense * 0.1) + (team.wins * 0.2);
        return { player: p, team, score, stats: { BPG: bpg.toFixed(1), SPG: spg.toFixed(1), TRB: rpg.toFixed(1), DREB: (p.stats.defReb / p.stats.gamesPlayed).toFixed(1) } };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const roy = allPlayers
      .filter(p => p.stats.gamesPlayed > 5 && p.draftInfo.year === league.season)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const ppg = getPPG(p);
        const rpg = getRPG(p);
        const apg = getAPG(p);
        const score = (ppg * 1.5) + (rpg * 1.0) + (apg * 1.2);
        return { player: p, team, score, stats: { PPG: ppg.toFixed(1), TRB: rpg.toFixed(1), AST: apg.toFixed(1), OVR: p.rating } };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const smoy = allPlayers
      .filter(p => p.stats.gamesPlayed > 5 && p.stats.gamesStarted < p.stats.gamesPlayed * 0.5)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const ppg = getPPG(p);
        const rpg = getRPG(p);
        const apg = getAPG(p);
        const score = (ppg * 1.5) + (rpg * 0.8) + (apg * 1.0) + (team.wins * 0.2);
        return { player: p, team, score, stats: { PPG: ppg.toFixed(1), TRB: rpg.toFixed(1), AST: apg.toFixed(1), MIN: (p.stats.minutes / p.stats.gamesPlayed).toFixed(1) } };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const mip = allPlayers
      .filter(p => p.stats.gamesPlayed > 10 && p.careerStats.length > 0)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const lastSeason = p.careerStats[p.careerStats.length - 1];
        const lastPPG = lastSeason.gamesPlayed > 0 ? lastSeason.points / lastSeason.gamesPlayed : 0;
        const currentPPG = getPPG(p);
        const ppgJump = currentPPG - lastPPG;
        const score = (ppgJump * 10) + (p.rating - (p.rating - 5)) * 2; // Simple growth score
        return { player: p, team, score, stats: { "PPG Jump": ppgJump.toFixed(1), "Curr PPG": currentPPG.toFixed(1), "Prev PPG": lastPPG.toFixed(1), OVR: p.rating } };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const coy = allTeams
      .map(t => {
        const coach = t.staff.headCoach;
        if (!coach) return null;
        const expectedWins = (t.roster.reduce((acc, p) => acc + p.rating, 0) / t.roster.length - 70) * 0.8 + 30;
        const winsOverExpected = t.wins - expectedWins;
        const score = (t.wins * 1.0) + (winsOverExpected * 2.0);
        return { coach, team: t, score, stats: { Wins: t.wins, Losses: t.losses, Record: `${t.wins}-${t.losses}`, "W vs Exp": winsOverExpected.toFixed(1) } };
      })
      .filter(c => c !== null)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 10);

    return { mvp, dpoy, roy, smoy, mip, coy };
  }, [allPlayers, allTeams, league.season]);

  const currentAwards = league.currentSeasonAwards || (league.awardHistory && league.awardHistory[0]);
  const allCoaches = useMemo(() => league.teams.flatMap(t => [t.staff.headCoach]), [league.teams]);

  const viewAwards = historyYear 
    ? league.awardHistory?.find(a => a.year === historyYear) 
    : currentAwards;

  const AwardCard = ({ title, winner, icon }: { title: string, winner: AwardWinner, icon: string }) => {
    const isCoach = !!winner.coachId;
    const isGM = !!winner.gmId;
    const team = league.teams.find(t => t.id === winner.teamId);

    const handleClick = () => {
      if (isCoach) {
        const coach = allCoaches.find(c => c?.id === winner.coachId);
        if (coach) onScoutCoach(coach);
      } else if (!isGM) {
        const player = allPlayers.find(p => p.id === winner.playerId);
        if (player) onScout(player);
      }
    };

    return (
      <div 
        onClick={handleClick}
        className={`bg-slate-900 border border-slate-800 rounded-3xl p-8 hover:border-amber-500/50 transition-all cursor-pointer shadow-2xl group relative overflow-hidden ${isGM ? 'lg:col-span-3' : ''}`}
      >
        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all">
          <span className="text-9xl">{icon}</span>
        </div>
        <div className="relative z-10">
          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-4">{title}</h4>
          <h3 className="text-3xl font-display font-bold text-white uppercase mb-1 group-hover:text-amber-500 transition-colors">{winner.name}</h3>
          <div className="flex items-center gap-2 mb-4">
             <img src={team?.logo} className="w-5 h-5 rounded" alt="" />
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{winner.teamName}</p>
          </div>
          <p className="text-lg font-mono text-emerald-400 font-bold mb-4">{winner.statsLabel}</p>
          {winner.blurb && (
            <p className="text-sm text-slate-500 italic leading-relaxed border-t border-slate-800/50 pt-4">
              "{winner.blurb}"
            </p>
          )}
        </div>
      </div>
    );
  };

  const TeamList = ({ title, ids, label }: { title: string, ids: string[], label: string }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-6 pb-2 border-b border-slate-800">{title}</h3>
      <div className="space-y-4">
        {ids.map((id, idx) => {
          const player = allPlayers.find(p => p.id === id);
          const team = league.teams.find(t => t.roster.some(rp => rp.id === id));
          return (
            <div 
              key={id} 
              onClick={() => player && onScout(player)}
              className="flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-slate-700 font-bold w-4">#{idx+1}</span>
                <div>
                  <p className="font-bold text-slate-200 uppercase text-sm group-hover:text-amber-500 transition-colors">{player?.name || 'Unknown'}</p>
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{team?.name} • {player?.position}</p>
                </div>
              </div>
              <span className="text-[10px] font-black text-slate-800 uppercase">{player?.rating} OVR</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const RaceTable = ({ title, candidates, columns }: { title: string, candidates: any[], columns: string[] }) => {
    const [localSort, setLocalSort] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });

    const sortedCandidates = useMemo(() => {
      return [...candidates].sort((a, b) => {
        let valA = localSort.key === 'score' ? a.score : parseFloat(a.stats[localSort.key]);
        let valB = localSort.key === 'score' ? b.score : parseFloat(b.stats[localSort.key]);
        
        if (isNaN(valA)) valA = a.stats[localSort.key];
        if (isNaN(valB)) valB = b.stats[localSort.key];

        if (valA < valB) return localSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return localSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }, [candidates, localSort]);

    const toggleSort = (key: string) => {
      setLocalSort(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
    };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-sm font-black uppercase tracking-[0.3em] text-amber-500">{title} Race</h3>
          <button className="text-[9px] font-black uppercase text-slate-500 hover:text-white transition-colors">More: Edit Awards</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50">
                <th className="p-4 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800">#</th>
                <th className="p-4 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800">Name</th>
                <th className="p-4 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800">Team</th>
                {columns.map(col => (
                  <th 
                    key={col} 
                    onClick={() => toggleSort(col)}
                    className="p-4 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800 text-right cursor-pointer hover:text-amber-500 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      {col}
                      {localSort.key === col && (
                        <span>{localSort.direction === 'desc' ? '↓' : '↑'}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCandidates.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 3} className="p-12 text-center text-slate-600 italic text-sm">
                    No candidates yet... Keep simulating to see the race heat up.
                  </td>
                </tr>
              ) : (
                sortedCandidates.map((c, idx) => (
                  <tr 
                    key={c.player?.id || c.coach?.id} 
                    onClick={() => c.player ? onScout(c.player) : onScoutCoach(c.coach)}
                    className={`group cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${idx < 3 ? 'bg-emerald-500/5' : ''}`}
                  >
                    <td className="p-4">
                      <span className={`text-xs font-mono font-bold ${idx === 0 ? 'text-amber-500' : 'text-slate-600'}`}>{idx + 1}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white group-hover:text-amber-500 transition-colors">{c.player?.name || c.coach?.name}</span>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          {c.player ? `${c.player.position} • ${c.player.age}y` : 'Head Coach'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div 
                        className="flex items-center gap-2 cursor-pointer group/team hover:opacity-80 transition-opacity"
                        onClick={() => onManageTeam(c.team.id)}
                      >
                         <img src={c.team.logo} className="w-4 h-4 rounded-sm" alt="" referrerPolicy="no-referrer" />
                         <span className="text-[10px] font-bold text-slate-400 uppercase group-hover/team:text-amber-500 transition-colors">{c.team.name} ({c.team.wins}-{c.team.losses})</span>
                      </div>
                    </td>
                    {columns.map(col => (
                      <td key={col} className="p-4 text-right">
                        <span className={`text-xs font-mono font-bold ${idx < 3 ? 'text-emerald-400' : 'text-slate-300'}`}>{c.stats[col]}</span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Dynasty <span className="text-amber-500">Trophies</span></h2>
            <div className="flex gap-4">
               <button 
                 onClick={() => { setActiveTab('races'); setHistoryYear(null); }}
                 className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${activeTab === 'races' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
               >
                 Award Races
               </button>
               <button 
                 onClick={() => { setActiveTab('current'); setHistoryYear(null); }}
                 className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${activeTab === 'current' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
               >
                 Last Winners
               </button>
               <button 
                 onClick={() => setActiveTab('history')}
                 className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${activeTab === 'history' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
               >
                 Award History
               </button>
            </div>
          </div>
          {activeTab === 'history' && (
            <select 
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-amber-500"
              value={historyYear || ''}
              onChange={(e) => setHistoryYear(parseInt(e.target.value))}
            >
              <option value="">Select Season...</option>
              {league.awardHistory?.map(a => <option key={a.year} value={a.year}>{a.year} Season</option>)}
            </select>
          )}
        </div>
      </header>

      {activeTab === 'races' && (
        <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <RaceTable title="MVP" candidates={awardRaces.mvp} columns={['PPG', 'TRB', 'AST', 'PER']} />
            <RaceTable title="DPOY" candidates={awardRaces.dpoy} columns={['BPG', 'SPG', 'TRB', 'DREB']} />
            <RaceTable title="ROY" candidates={awardRaces.roy} columns={['PPG', 'TRB', 'AST', 'OVR']} />
            <RaceTable title="6th Man" candidates={awardRaces.smoy} columns={['PPG', 'TRB', 'AST', 'MIN']} />
            <RaceTable title="MIP" candidates={awardRaces.mip} columns={['PPG Jump', 'Curr PPG', 'Prev PPG', 'OVR']} />
            <RaceTable title="Coach" candidates={awardRaces.coy} columns={['Wins', 'Losses', 'Record', 'W vs Exp']} />
          </div>
        </div>
      )}

      {activeTab === 'current' && !viewAwards && (
        <div className="py-40 text-center border-2 border-dashed border-slate-800 rounded-[3rem] text-slate-700">
           <p className="font-display text-4xl uppercase tracking-tighter mb-4 opacity-50">End of Season Gala Awaits</p>
           <p className="text-[10px] font-black uppercase tracking-[0.4em]">Awards are finalized after the regular season concludes.</p>
        </div>
      )}

      {viewAwards && (
        <div className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AwardCard title="Most Valuable Player" winner={viewAwards.mvp} icon="🏆" />
            <AwardCard title="Defensive Player" winner={viewAwards.dpoy} icon="🛡️" />
            <AwardCard title="Rookie of the Year" winner={viewAwards.roy} icon="✨" />
            <AwardCard title="Executive of the Year" winner={viewAwards.executiveOfTheYear} icon="💼" />
            <AwardCard title="Sixth Man of Year" winner={viewAwards.sixthMan} icon="⚡" />
            <AwardCard title="Most Improved" winner={viewAwards.mip} icon="📈" />
            <AwardCard title="Coach of the Year" winner={viewAwards.coy} icon="🧠" />
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-display font-bold uppercase text-white tracking-tight flex items-center gap-4">
               <span className="h-px flex-1 bg-slate-800"></span>
               Honorary Teams
               <span className="h-px flex-1 bg-slate-800"></span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
              <TeamList title="All-NBA First" ids={viewAwards.allNbaFirst} label="1st" />
              <TeamList title="All-NBA Second" ids={viewAwards.allNbaSecond} label="2nd" />
              <TeamList title="All-NBA Third" ids={viewAwards.allNbaThird} label="3rd" />
              <TeamList title="All-Defensive" ids={viewAwards.allDefensive} label="DEF" />
              <TeamList title="All-Rookie" ids={viewAwards.allRookie} label="RCK" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && !historyYear && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {league.awardHistory?.map(awards => (
             <button 
                key={awards.year}
                onClick={() => setHistoryYear(awards.year)}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-left hover:border-amber-500 transition-all group"
             >
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{awards.year} Season</p>
                <p className="text-2xl font-display font-bold text-white uppercase group-hover:text-amber-500 transition-colors">Season Records</p>
                <div className="mt-4 flex items-center gap-2">
                   <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs">👑</div>
                   <p className="text-xs font-bold text-slate-400">MVP: {awards.mvp.name}</p>
                </div>
             </button>
           ))}
        </div>
      )}
    </div>
  );
};

export default Awards;
