
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LeagueState, SeasonAwards, AwardWinner, Player, Coach, Team } from '../types';
import TeamBadge from './TeamBadge';
import { PlayerLink } from '../context/NavigationContext';
import { rawUPER, normalizePER, leagueAvgRawUPER } from '../utils/playerUtils';

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

  // Track previous score-based rankings to compute movement arrows
  const prevRanksRef = useRef<Record<string, Record<string, number>>>({});
  const [rankDeltas, setRankDeltas] = useState<Record<string, Record<string, number>>>({});

  const allPlayers = useMemo(() => league.teams.flatMap(t => t.roster), [league.teams]);
  const allTeams = league.teams;

  // League-average rawUPER for normalized PER (lg avg = 15.0)
  const lgAvgRaw = useMemo(
    () => leagueAvgRawUPER(allPlayers.map(p => p.stats)),
    [allPlayers],
  );

  const awardRaces = useMemo(() => {
    // ── Season context ───────────────────────────────────────────────────────
    // Use the maximum team record (wins+losses) so the threshold scales with
    // actual games played rather than a fixed cutoff.
    const maxGamesPlayed = Math.max(...league.teams.map(t => t.wins + t.losses), 0);
    // Minimum GP to appear in a race: 1 game during first week, scales to 5+ by mid-season
    const minGP = maxGamesPlayed < 5 ? 1 : maxGamesPlayed < 15 ? 3 : 5;
    const seasonActive = !league.isOffseason && maxGamesPlayed > 0;

    const getPPG  = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.points  / p.stats.gamesPlayed : 0;
    const getRPG  = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.rebounds / p.stats.gamesPlayed : 0;
    const getAPG  = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.assists  / p.stats.gamesPlayed : 0;
    const getBPG  = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.blocks   / p.stats.gamesPlayed : 0;
    const getSPG  = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.steals   / p.stats.gamesPlayed : 0;
    const getMPG  = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.minutes  / p.stats.gamesPlayed : 0;
    const getFGPct = (p: Player) => p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0;
    const getPER  = (p: Player) => normalizePER(rawUPER(p.stats), lgAvgRaw);

    // ── Eligibility helpers ──────────────────────────────────────────────────
    // True first-year player only:
    //   Gate 1 — careerStats.length > 0 means the player completed ≥1 prior season
    //            (snapshotPlayerStats runs at season-end and appends an entry).
    //            This is the authoritative non-rookie signal — age & draftInfo alone
    //            are unreliable when players are generated or signed mid-simulation.
    //   Gate 2 — drafted this season OR (no completed seasons AND played ≥1 game).
    const isRookie = (p: Player): boolean => {
      if ((p.careerStats?.length ?? 0) > 0) return false; // definitive veteran gate
      return p.draftInfo?.year === league.season || p.stats.gamesPlayed >= 1;
    };

    // True bench player: not in starting rotation and started < 35% of games
    const isBenchPlayer = (p: Player) => {
      if (p.status === 'Starter') return false;
      const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id));
      if (!team) return false;
      if (Object.values(team.rotation?.starters ?? {}).includes(p.id)) return false;
      const gp = Math.max(1, p.stats.gamesPlayed);
      return (p.stats.gamesStarted ?? 0) <= Math.floor(gp * 0.35);
    };

    // ── MVP ──────────────────────────────────────────────────────────────────
    const mvp = allPlayers
      .filter(p => p.stats.gamesPlayed >= minGP)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const ppg = getPPG(p), rpg = getRPG(p), apg = getAPG(p), per = getPER(p);
        const fgPct = getFGPct(p);
        const score = (ppg * 1.2) + (rpg * 0.8) + (apg * 1.0) + (per * 1.5) + (team.wins * 0.5);
        return { player: p, team, score, stats: { PPG: ppg.toFixed(1), TRB: rpg.toFixed(1), AST: apg.toFixed(1), FG: `${(fgPct * 100).toFixed(1)}%`, PER: per.toFixed(1), GP: p.stats.gamesPlayed } };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // ── DPOY ─────────────────────────────────────────────────────────────────
    const dpoy = allPlayers
      .filter(p => p.stats.gamesPlayed >= minGP)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const bpg = getBPG(p), spg = getSPG(p), rpg = getRPG(p);
        const dreb = p.stats.gamesPlayed > 0 ? p.stats.defReb / p.stats.gamesPlayed : 0;
        const score = (bpg * 4) + (spg * 3) + (rpg * 0.5) + (p.attributes?.defense ?? 0) * 0.1 + (team.wins * 0.2);
        return { player: p, team, score, stats: { BPG: bpg.toFixed(1), SPG: spg.toFixed(1), TRB: rpg.toFixed(1), DREB: dreb.toFixed(1), GP: p.stats.gamesPlayed } };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // ── ROY ──────────────────────────────────────────────────────────────────
    // Only true first-year players (isRookie gate). Score blends production,
    // efficiency, and win contribution so it matches real ROY voting factors.
    const roy = allPlayers
      .filter(p => p.stats.gamesPlayed >= minGP && isRookie(p))
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const ppg = getPPG(p), rpg = getRPG(p), apg = getAPG(p);
        const spg = getSPG(p), bpg = getBPG(p);
        const fgPct = getFGPct(p);
        const gp = Math.max(1, p.stats.gamesPlayed);
        const missesPerGame = (p.stats.fga - p.stats.fgm) / gp;
        const eff = ppg + rpg + apg + spg + bpg - missesPerGame;
        const score =
          (ppg  * 1.5) +
          (rpg  * 1.0) +
          (apg  * 1.2) +
          (fgPct * 8)  +   // efficiency gate — rewards accurate rookies
          (team.wins * 0.3) + // win contribution
          (spg  * 0.5) +
          (bpg  * 0.5) +
          (p.rating * 0.05);
        return {
          player: p, team, score,
          isRookieBadge: true,
          stats: {
            PPG:   ppg.toFixed(1),
            TRB:   rpg.toFixed(1),
            AST:   apg.toFixed(1),
            'FG%': `${(fgPct * 100).toFixed(1)}%`,
            EFF:   eff.toFixed(1),
            GP:    p.stats.gamesPlayed,
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // ── 6th Man / Woman ───────────────────────────────────────────────────────
    const smoy = allPlayers
      .filter(p => p.stats.gamesPlayed >= minGP && isBenchPlayer(p))
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const ppg = getPPG(p), rpg = getRPG(p), apg = getAPG(p), mpg = getMPG(p);
        const score = (ppg * 1.5) + (rpg * 0.8) + (apg * 1.0) + (team.wins * 0.2);
        return { player: p, team, score, stats: { PPG: ppg.toFixed(1), TRB: rpg.toFixed(1), AST: apg.toFixed(1), MIN: mpg.toFixed(1), GP: p.stats.gamesPlayed } };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // ── MIP ──────────────────────────────────────────────────────────────────
    const mip = allPlayers
      .filter(p => p.stats.gamesPlayed >= minGP && p.careerStats.length > 0)
      .map(p => {
        const team = allTeams.find(t => t.roster.some(rp => rp.id === p.id))!;
        const lastSeason = p.careerStats[p.careerStats.length - 1];
        const lastPPG = lastSeason.gamesPlayed > 0 ? lastSeason.points / lastSeason.gamesPlayed : 0;
        const currentPPG = getPPG(p);
        const ppgJump = currentPPG - lastPPG;
        const score = (ppgJump * 10) + (p.rating - (p.rating - 5)) * 2;
        return { player: p, team, score, stats: { 'PPG Jump': ppgJump.toFixed(1), 'Curr PPG': currentPPG.toFixed(1), 'Prev PPG': lastPPG.toFixed(1), OVR: p.rating, GP: p.stats.gamesPlayed } };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // ── COY ──────────────────────────────────────────────────────────────────
    const coy = allTeams
      .map(t => {
        const coach = t.staff.headCoach;
        if (!coach) return null;
        const avgOVR = t.roster.length > 0
          ? t.roster.reduce((acc, p) => acc + p.rating, 0) / t.roster.length
          : 70;
        const expectedWins = (avgOVR - 70) * 0.8 + 30;
        const winsOverExpected = t.wins - expectedWins;
        const score = (t.wins * 1.0) + (winsOverExpected * 2.0);
        return { coach, team: t, score, stats: { Wins: t.wins, Losses: t.losses, Record: `${t.wins}-${t.losses}`, 'W vs Exp': winsOverExpected.toFixed(1) } };
      })
      .filter(c => c !== null)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 15);

    return { mvp, dpoy, roy, smoy, mip, coy, maxGamesPlayed, seasonActive };
  }, [allPlayers, allTeams, league.season, league.isOffseason, league.teams, lgAvgRaw]);

  // Recompute rank-movement deltas whenever awardRaces changes
  useEffect(() => {
    const raceKeys = ['mvp', 'dpoy', 'roy', 'smoy', 'mip', 'coy'] as const;
    const newDeltas: Record<string, Record<string, number>> = {};

    for (const key of raceKeys) {
      const candidates = awardRaces[key] as any[];
      const prev = prevRanksRef.current[key] ?? {};
      const current: Record<string, number> = {};
      newDeltas[key] = {};

      candidates.forEach((c, idx) => {
        const id: string = c.player?.id ?? c.coach?.id ?? '';
        current[id] = idx + 1;
        if (id in prev) {
          newDeltas[key][id] = prev[id] - (idx + 1); // positive = moved up, negative = fell
        }
      });

      prevRanksRef.current[key] = current;
    }

    setRankDeltas(newDeltas);
  }, [awardRaces]);

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
          <PlayerLink playerId={winner.playerId} name={winner.name} className="text-3xl font-display font-bold text-white uppercase mb-1 group-hover:text-amber-500 transition-colors block" />
          <div className="flex items-center gap-2 mb-4">
             {team && <TeamBadge team={team} size="xs" />}
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

  const RankArrow = ({ delta }: { delta?: number }) => {
    if (delta === undefined || delta === 0) return <span className="text-slate-700 text-[9px] font-black">—</span>;
    if (delta > 0) return <span className="text-emerald-400 text-[9px] font-black leading-none">↑{delta}</span>;
    return <span className="text-rose-400 text-[9px] font-black leading-none">↓{Math.abs(delta)}</span>;
  };

  const RaceTable = ({ title, candidates, columns, gamesPlayed, seasonActive, deltas, subtitle, showRookieBadge }: {
    title: string;
    candidates: any[];
    columns: string[];
    gamesPlayed: number;
    seasonActive: boolean;
    deltas?: Record<string, number>;
    subtitle?: string;
    showRookieBadge?: boolean;
  }) => {
    const allCols = [...columns, 'GP'];
    const [localSort, setLocalSort] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: columns[0], direction: 'desc' });

    const sortedCandidates = useMemo(() => {
      return [...candidates].sort((a, b) => {
        const rawA = localSort.key === 'GP' ? a.stats.GP : a.stats[localSort.key];
        const rawB = localSort.key === 'GP' ? b.stats.GP : b.stats[localSort.key];
        const valA = typeof rawA === 'string' ? parseFloat(rawA) : rawA;
        const valB = typeof rawB === 'string' ? parseFloat(rawB) : rawB;
        if (isNaN(valA) || isNaN(valB)) return String(rawA ?? '').localeCompare(String(rawB ?? ''));
        return localSort.direction === 'asc' ? valA - valB : valB - valA;
      });
    }, [candidates, localSort]);

    const toggleSort = (key: string) => {
      setLocalSort(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
      }));
    };

    const leader = candidates[0]; // score-rank #1 is always index 0 in candidates

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              <h3 className="text-sm font-black uppercase tracking-[0.3em] text-amber-500">{title} Race</h3>
              {subtitle && <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            {leader && (
              <span className="text-[10px] font-bold text-slate-500 truncate">
                Leader: <span className="text-white">{leader.player?.name || leader.coach?.name}</span>
              </span>
            )}
          </div>
          <span className="text-[9px] font-black uppercase text-slate-600 shrink-0">
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
          </span>
        </div>

        {candidates.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            {!seasonActive ? (
              <>
                <p className="text-slate-500 font-bold text-sm">Season hasn't started yet</p>
                <p className="text-[10px] text-slate-700 font-black uppercase tracking-widest">Race begins after tip-off</p>
              </>
            ) : (
              <>
                <p className="text-slate-400 font-bold text-sm">🔥 Race heating up after {gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''}</p>
                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Candidates being tracked — check back soon</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50">
                  <th className="p-3 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800 whitespace-nowrap"># ±</th>
                  <th className="p-3 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800">Name</th>
                  <th className="p-3 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800">Team</th>
                  {allCols.map(col => (
                    <th
                      key={col}
                      onClick={() => toggleSort(col)}
                      className={`p-3 text-[9px] font-black uppercase tracking-widest border-b border-slate-800 text-right cursor-pointer transition-colors select-none ${
                        localSort.key === col ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {col}{localSort.key === col ? (localSort.direction === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCandidates.map((c, idx) => (
                  <tr
                    key={c.player?.id || c.coach?.id}
                    onClick={() => c.player ? onScout(c.player) : onScoutCoach(c.coach)}
                    className={`group cursor-pointer border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors ${
                      idx === 0 ? 'bg-amber-500/5' : idx < 3 ? 'bg-emerald-500/3' : ''
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-mono font-black ${
                          idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-900' : 'text-slate-700'
                        }`}>{idx + 1}</span>
                        <RankArrow delta={deltas?.[c.player?.id ?? c.coach?.id ?? '']} />
                      </div>
                    </td>
                    <td className="p-3 min-w-[130px]">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 leading-tight">
                          <span className="text-sm font-bold text-white group-hover:text-amber-500 transition-colors">
                            {c.player?.name || c.coach?.name}
                          </span>
                          {showRookieBadge && c.isRookieBadge && (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 leading-none shrink-0">R</span>
                          )}
                        </div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          {c.player ? `${c.player.position} · ${c.player.age}y` : 'Head Coach'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 min-w-[110px]">
                      <div
                        className="flex items-center gap-1.5 cursor-pointer hover:opacity-75 transition-opacity"
                        onClick={e => { e.stopPropagation(); onManageTeam(c.team.id); }}
                      >
                        <TeamBadge team={c.team} size="xs" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase group-hover/team:text-amber-500 whitespace-nowrap">
                          {c.team.abbreviation} {c.team.wins}-{c.team.losses}
                        </span>
                      </div>
                    </td>
                    {allCols.map(col => {
                      const val = col === 'GP' ? c.stats.GP : c.stats[col];
                      return (
                        <td key={col} className="p-3 text-right whitespace-nowrap">
                          <span className={`text-xs font-mono font-bold ${
                            idx === 0 ? 'text-amber-400' : idx < 3 ? 'text-emerald-400' : 'text-slate-300'
                          }`}>{val}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
          {awardRaces.seasonActive && (
            <div className="flex items-center gap-3 px-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Live — {awardRaces.maxGamesPlayed} game{awardRaces.maxGamesPlayed !== 1 ? 's' : ''} played · Updates after every game
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RaceTable title="MVP"   candidates={awardRaces.mvp}  columns={['PPG', 'TRB', 'AST', 'FG', 'PER']}          gamesPlayed={awardRaces.maxGamesPlayed} seasonActive={awardRaces.seasonActive} deltas={rankDeltas.mvp} />
            <RaceTable title="DPOY"  candidates={awardRaces.dpoy} columns={['BPG', 'SPG', 'TRB', 'DREB']}               gamesPlayed={awardRaces.maxGamesPlayed} seasonActive={awardRaces.seasonActive} deltas={rankDeltas.dpoy} />
            <RaceTable title="ROY"   candidates={awardRaces.roy}  columns={['PPG', 'TRB', 'AST', 'FG%', 'EFF']}         gamesPlayed={awardRaces.maxGamesPlayed} seasonActive={awardRaces.seasonActive} deltas={rankDeltas.roy} subtitle="First-Year Players Only" showRookieBadge />
            <RaceTable title={league.settings.playerGenderRatio === 100 ? '6th Woman' : '6th Man'} candidates={awardRaces.smoy} columns={['PPG', 'TRB', 'AST', 'MIN']} gamesPlayed={awardRaces.maxGamesPlayed} seasonActive={awardRaces.seasonActive} deltas={rankDeltas.smoy} />
            <RaceTable title="MIP"   candidates={awardRaces.mip}  columns={['PPG Jump', 'Curr PPG', 'Prev PPG', 'OVR']}  gamesPlayed={awardRaces.maxGamesPlayed} seasonActive={awardRaces.seasonActive} deltas={rankDeltas.mip} />
            <RaceTable title="Coach" candidates={awardRaces.coy}  columns={['Wins', 'Losses', 'Record', 'W vs Exp']}     gamesPlayed={awardRaces.maxGamesPlayed} seasonActive={awardRaces.seasonActive} deltas={rankDeltas.coy} />
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
            <AwardCard title={league.settings.playerGenderRatio === 100 ? 'Sixth Woman of Year' : 'Sixth Man of Year'} winner={viewAwards.sixthMan} icon="⚡" />
            <AwardCard title="Most Improved" winner={viewAwards.mip} icon="📈" />
            <AwardCard title="Coach of the Year" winner={viewAwards.coy} icon="🧠" />
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-display font-bold uppercase text-white tracking-tight flex items-center gap-4">
               <span className="h-px flex-1 bg-slate-800"></span>
               Honorary Teams
               <span className="h-px flex-1 bg-slate-800"></span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-6">
              <TeamList title="All-NBA First" ids={viewAwards.allNbaFirst} label="1st" />
              <TeamList title="All-NBA Second" ids={viewAwards.allNbaSecond} label="2nd" />
              <TeamList title="All-NBA Third" ids={viewAwards.allNbaThird} label="3rd" />
              <TeamList title="All-Defensive 1st" ids={viewAwards.allDefensive} label="DEF" />
              <TeamList title="All-Defensive 2nd" ids={viewAwards.allDefensiveSecond ?? []} label="DEF2" />
              <TeamList title="All-Rookie 1st" ids={viewAwards.allRookie} label="RCK" />
              <TeamList title="All-Rookie 2nd" ids={viewAwards.allRookieSecond ?? []} label="RCK2" />
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
