import React, { useState, useMemo } from 'react';
import { LeagueState, Player, Team, Position } from '../types';
import TeamBadge from './TeamBadge';
import { PlayerLink } from '../context/NavigationContext';

interface StatsProps {
  league: LeagueState;
  onViewRoster?: (teamId: string) => void;
  onManageTeam?: (teamId: string) => void;
  onViewPlayer?: (player: Player) => void;
}

type StatTab = 'leaderboards' | 'advanced' | 'compare' | 'teams' | 'players';
type PlayerSubTab = 'traditional' | 'advanced' | 'per36' | 'shooting' | 'totals';
type PlayerStatsView = 'season' | 'career';

const Stats: React.FC<StatsProps> = ({ league, onViewRoster, onManageTeam, onViewPlayer }) => {
  const [activeTab, setActiveTab] = useState<StatTab>('leaderboards');
  const [compareList, setCompareList] = useState<string[]>([]);
  const [minGames, setMinGames] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [playerSubTab, setPlayerSubTab] = useState<PlayerSubTab>('traditional');
  const [sortKey, setSortKey] = useState<string>('ppg');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [playerStatsView, setPlayerStatsView] = useState<PlayerStatsView>('season');

  const allPlayers = useMemo(() => {
    return league.teams.flatMap(t => t.roster.map(p => ({
      ...p,
      teamName: t.name,
      teamLogo: t.logo,
      teamPrimaryColor: t.primaryColor,
      teamSecondaryColor: t.secondaryColor,
      teamAbbreviation: t.abbreviation,
    })));
  }, [league.teams]);

  const teamStats = useMemo(() => {
    return league.teams.map(t => {
      const roster = t.roster;
      const fgm = roster.reduce((s, p) => s + p.stats.fgm, 0);
      const fga = roster.reduce((s, p) => s + p.stats.fga, 0);
      const threepm = roster.reduce((s, p) => s + p.stats.threepm, 0);
      const threepa = roster.reduce((s, p) => s + p.stats.threepa, 0);
      const ftm = roster.reduce((s, p) => s + p.stats.ftm, 0);
      const fta = roster.reduce((s, p) => s + p.stats.fta, 0);
      const orb = roster.reduce((s, p) => s + p.stats.offReb, 0);
      const drb = roster.reduce((s, p) => s + p.stats.defReb, 0);
      const trb = roster.reduce((s, p) => s + p.stats.rebounds, 0);
      const ast = roster.reduce((s, p) => s + p.stats.assists, 0);
      const stl = roster.reduce((s, p) => s + p.stats.steals, 0);
      const blk = roster.reduce((s, p) => s + p.stats.blocks, 0);
      const tov = roster.reduce((s, p) => s + p.stats.tov, 0);
      const pf  = roster.reduce((s, p) => s + p.stats.pf, 0);
      const pts = roster.reduce((s, p) => s + p.stats.points, 0);

      const games = t.wins + t.losses;
      const winPct = games > 0 ? t.wins / games : 0;
      const avgAge = roster.reduce((s, p) => s + p.age, 0) / (roster.length || 1);
      const twopm = fgm - threepm;
      const twopa = fga - threepa;

      // Opponent box-score totals from game history
      let ptsScored = 0, ptsAllowed = 0;
      let oppFgm = 0, oppFga = 0, oppThreepm = 0, oppThreepa = 0;
      let oppFtm = 0, oppFta = 0;
      let oppOrb = 0, oppDrb = 0, oppTrb = 0;
      let oppAst = 0, oppStl = 0, oppBlk = 0, oppTov = 0, oppPf = 0;

      league.history.forEach(g => {
        let oppLines: typeof g.homePlayerStats;
        if (g.homeTeamId === t.id) {
          ptsScored += g.homeScore; ptsAllowed += g.awayScore;
          oppLines = g.awayPlayerStats;
        } else if (g.awayTeamId === t.id) {
          ptsScored += g.awayScore; ptsAllowed += g.homeScore;
          oppLines = g.homePlayerStats;
        } else { return; }
        (oppLines || []).forEach(p => {
          if (p.dnp) return;
          oppFgm += p.fgm; oppFga += p.fga;
          oppThreepm += p.threepm; oppThreepa += p.threepa;
          oppFtm += p.ftm; oppFta += p.fta;
          oppOrb += p.offReb; oppDrb += p.defReb; oppTrb += p.reb;
          oppAst += p.ast; oppStl += p.stl; oppBlk += p.blk;
          oppTov += p.tov; oppPf += p.pf;
        });
      });

      const mov = games > 0 ? (ptsScored - ptsAllowed) / games : 0;
      const gp  = Math.max(1, games);

      // Possessions estimate (Hollinger): FGA - ORB + TOV + 0.44*FTA
      const poss    = Math.max(1, fga - orb + tov + 0.44 * fta);
      const oppPoss = Math.max(1, oppFga - oppOrb + oppTov + 0.44 * oppFta);
      const ortg    = ptsScored  / poss    * 100;
      const drtg    = ptsAllowed / oppPoss * 100;

      return {
        id: t.id, name: t.name, logo: t.logo,
        games, wins: t.wins, losses: t.losses, winPct, avgAge,
        // Traditional per-game
        fgm: fgm / gp, fga: fga / gp, fgPct: fga > 0 ? fgm / fga : 0,
        threepm: threepm / gp, threepa: threepa / gp, threePct: threepa > 0 ? threepm / threepa : 0,
        twopm: twopm / gp, twopa: twopa / gp, twoPct: twopa > 0 ? twopm / twopa : 0,
        ftm: ftm / gp, fta: fta / gp, ftPct: fta > 0 ? ftm / fta : 0,
        orb: orb / gp, drb: drb / gp, trb: trb / gp,
        ast: ast / gp, stl: stl / gp, blk: blk / gp,
        tov: tov / gp, pf: pf / gp, pts: pts / gp, mov,
        // Advanced
        eFGPct:      fga > 0 ? (fgm + 0.5 * threepm) / fga : 0,
        tsPct:       (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0,
        pace:        (poss + oppPoss) / (2 * gp),
        ortg,
        drtg,
        netRtg:      ortg - drtg,
        tovPct:      (fga + 0.44 * fta + tov) > 0 ? tov / (fga + 0.44 * fta + tov) * 100 : 0,
        astTov:      tov > 0 ? ast / tov : 0,
        astPct:      fgm > 0 ? ast / fgm * 100 : 0,
        orbPct:      (orb + oppDrb) > 0 ? orb / (orb + oppDrb) * 100 : 0,
        drbPct:      (drb + oppOrb) > 0 ? drb / (drb + oppOrb) * 100 : 0,
        // Opponent per-game
        oppPts:      ptsAllowed / gp,
        oppFgm:      oppFgm / gp, oppFga: oppFga / gp, oppFgPct: oppFga > 0 ? oppFgm / oppFga : 0,
        oppThreepm:  oppThreepm / gp, oppThreepa: oppThreepa / gp,
        oppThreePct: oppThreepa > 0 ? oppThreepm / oppThreepa : 0,
        oppFtm:      oppFtm / gp, oppFta: oppFta / gp, oppFtPct: oppFta > 0 ? oppFtm / oppFta : 0,
        oppOrb:      oppOrb / gp, oppDrb: oppDrb / gp, oppTrb: oppTrb / gp,
        oppAst:      oppAst / gp, oppStl: oppStl / gp, oppBlk: oppBlk / gp,
        oppTov:      oppTov / gp, oppPf: oppPf / gp,
      };
    });
  }, [league.teams, league.history]);

  // Advanced Stats Calculation
  const calculateAdvanced = (p: Player) => {
    const gp = Math.max(1, p.stats.gamesPlayed);
    const ppg = p.stats.points / gp;
    const rpg = p.stats.rebounds / gp;
    const apg = p.stats.assists / gp;
    const spg = p.stats.steals / gp;
    const bpg = p.stats.blocks / gp;
    const tpm = p.stats.threepm / gp;
    const fgPct = p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0;
    const tpPct = p.stats.threepa > 0 ? p.stats.threepm / p.stats.threepa : 0;

    // eFG%: (FGM + 0.5 * 3PM) / FGA
    const eFG = p.stats.fga > 0 ? (p.stats.fgm + 0.5 * p.stats.threepm) / p.stats.fga : 0;

    // TS%: PTS / (2 * (FGA + 0.44 * FTA))
    const TS = (p.stats.fga + 0.44 * p.stats.fta) > 0 ? p.stats.points / (2 * (p.stats.fga + 0.44 * p.stats.fta)) : 0;

    // Usage% (Estimated): (FGA + 0.44 * FTA + TOV) per minute relative to team
    const USG = p.stats.minutes > 0 ? (p.stats.fga + 0.44 * p.stats.fta + p.stats.tov) / p.stats.minutes : 0;

    // Simplified PER: (PTS + REB + AST + STL + BLK - MissedFG - MissedFT - TOV) / MIN
    const PER = p.stats.minutes > 0 ?
      (p.stats.points + p.stats.rebounds + p.stats.assists + p.stats.steals + p.stats.blocks - (p.stats.fga - p.stats.fgm) - (p.stats.fta - p.stats.ftm) - p.stats.tov) / p.stats.minutes * 30
      : 0;

    return { eFG, TS, USG, PER, ppg, rpg, apg, spg, bpg, tpm, fgPct, tpPct };
  };

  const filteredLeaders = useMemo(() => {
    return allPlayers
      .filter(p => p.stats.gamesPlayed >= minGames && p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(p => ({ ...p, adv: calculateAdvanced(p) }));
  }, [allPlayers, minGames, searchTerm]);

  const toggleCompare = (id: string) => {
    if (compareList.includes(id)) setCompareList(prev => prev.filter(i => i !== id));
    else if (compareList.length < 4) setCompareList(prev => [...prev, id]);
  };

  const LeaderTable = ({ statKey, label, fmt }: { statKey: string; label: string; fmt?: (v: number) => string }) => {
    const sorted = [...filteredLeaders].sort((a, b) => {
      const aVal = (a.adv as any)[statKey] ?? (a.stats as any)[statKey] / Math.max(1, a.stats.gamesPlayed) ?? 0;
      const bVal = (b.adv as any)[statKey] ?? (b.stats as any)[statKey] / Math.max(1, b.stats.gamesPlayed) ?? 0;
      return bVal - aVal;
    }).slice(0, 25);

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
          <h3 className="text-xl font-display font-bold uppercase text-white">{label} Leaders</h3>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Top 25</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4">Rank</th>
                <th className="px-6 py-4">Player</th>
                <th className="px-6 py-4">Team</th>
                <th className="px-6 py-4 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {sorted.map((p, idx) => {
                const val = (p.adv as any)[statKey] || (p.stats as any)[statKey] / Math.max(1, p.stats.gamesPlayed);
                return (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-all">
                    <td className="px-6 py-4 font-display font-bold text-slate-600">#{idx + 1}</td>
                    <td className="px-6 py-4 flex items-center gap-3">
                       <PlayerLink playerId={p.id} name={p.name} className="font-bold text-slate-200 uppercase tracking-tight" />
                       <button onClick={() => toggleCompare(p.id)} className={`text-[10px] p-1 rounded ${compareList.includes(p.id) ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'} hover:scale-105 transition-all`}>Compare</button>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2">
                          <TeamBadge
                            team={{ name: p.teamName, primaryColor: (p as any).teamPrimaryColor ?? '#888', secondaryColor: (p as any).teamSecondaryColor ?? '#333', logo: p.teamLogo, abbreviation: (p as any).teamAbbreviation }}
                            size="xs"
                          />
                          <span className="text-[10px] font-black text-slate-500 uppercase">{p.teamName}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right font-display font-bold text-amber-500 text-lg">
                      {fmt ? fmt(val) : val.toFixed(statKey === 'PER' ? 1 : statKey === 'TS' || statKey === 'eFG' ? 3 : 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const PlayerComparison = () => {
    const players = allPlayers.filter(p => compareList.includes(p.id)).map(p => ({ ...p, adv: calculateAdvanced(p) }));
    if (players.length === 0) return (
      <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem] text-slate-600">
         <p className="font-display text-2xl uppercase tracking-widest mb-2">Comparison Dock Empty</p>
         <p className="text-[10px] font-black uppercase tracking-widest">Add up to 4 players from the leaderboards</p>
      </div>
    );

    return (
      <div className="space-y-8 animate-in zoom-in-95 duration-500">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {players.map(p => (
              <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group">
                 <button onClick={() => toggleCompare(p.id)} className="absolute top-4 right-4 text-slate-600 hover:text-rose-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
                 <div className="text-center mb-6">
                    <div className="flex justify-center mb-4">
                      <TeamBadge
                        team={{ name: p.teamName, primaryColor: (p as any).teamPrimaryColor ?? '#888', secondaryColor: (p as any).teamSecondaryColor ?? '#333', logo: p.teamLogo, abbreviation: (p as any).teamAbbreviation }}
                        size="lg"
                      />
                    </div>
                    <PlayerLink playerId={p.id} name={p.name} className="text-2xl font-display font-bold text-white uppercase" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{p.teamName} • {p.position}</p>
                 </div>
                 <div className="space-y-4">
                    {[
                      { l: 'PER', v: p.adv.PER.toFixed(1) },
                      { l: 'PPG', v: p.adv.ppg.toFixed(1) },
                      { l: 'RPG', v: p.adv.rpg.toFixed(1) },
                      { l: 'APG', v: p.adv.apg.toFixed(1) },
                      { l: 'TS%', v: (p.adv.TS * 100).toFixed(1) + '%' },
                      { l: 'Usage', v: p.adv.USG.toFixed(2) }
                    ].map(s => (
                      <div key={s.l} className="flex justify-between items-center border-b border-slate-800/50 pb-2">
                         <span className="text-[10px] font-black text-slate-500 uppercase">{s.l}</span>
                         <span className="font-display font-bold text-slate-200">{s.v}</span>
                      </div>
                    ))}
                 </div>
              </div>
            ))}
         </div>

         {/* Radar Visualization Placeholder */}
         <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 h-96 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `radial-gradient(#f59e0b 1px, transparent 1px)`, backgroundSize: '20px 20px' }}></div>
            <div className="text-center space-y-4">
               <svg className="w-24 h-24 mx-auto text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
               <p className="font-display text-xl text-slate-500 uppercase tracking-[0.3em]">Statistical Overlay Active</p>
               <p className="text-[10px] text-slate-600 font-bold uppercase">Visualizing data clusters for {players.length} entities</p>
            </div>
         </div>
      </div>
    );
  };

  // ─── PLAYER STATS TABLE ────────────────────────────────────────────────
  const PlayerStatsTable = () => {
    const PAGE_SIZE = 25;
    const positions: Array<'ALL' | Position> = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

    // Aggregate stats per player (season or career)
    const playerRows = useMemo(() => {
      return league.teams.flatMap(team =>
        team.roster.map(p => {
          // ── Source stats: current season or summed career ─────────────────
          let gp: number, min: number, pts: number, reb: number, ast: number;
          let stl: number, blk: number, tov: number, fgm: number, fga: number;
          let tpm: number, tpa: number, ftm: number, fta: number, pm: number;
          let gs: number, orb: number, drb: number, pf: number;

          if (playerStatsView === 'career' && p.careerStats && p.careerStats.length > 0) {
            const cs = p.careerStats;
            const sum = <K extends keyof typeof cs[0]>(k: K) =>
              cs.reduce((acc, s) => acc + ((s[k] as number) ?? 0), 0);
            gp  = sum('gamesPlayed');
            gs  = sum('gamesStarted');
            min = sum('minutes');
            pts = sum('points');
            reb = sum('rebounds');
            ast = sum('assists');
            stl = sum('steals');
            blk = sum('blocks');
            tov = sum('tov');
            fgm = sum('fgm');
            fga = sum('fga');
            tpm = sum('threepm');
            tpa = sum('threepa');
            ftm = sum('ftm');
            fta = sum('fta');
            orb = sum('offReb');
            drb = sum('defReb');
            pf  = sum('pf');
            pm  = sum('plusMinus');
          } else {
            gp  = p.stats.gamesPlayed;
            gs  = p.stats.gamesStarted ?? 0;
            min = p.stats.minutes;
            pts = p.stats.points;
            reb = p.stats.rebounds;
            ast = p.stats.assists;
            stl = p.stats.steals;
            blk = p.stats.blocks;
            tov = p.stats.tov;
            fgm = p.stats.fgm;
            fga = p.stats.fga;
            tpm = p.stats.threepm;
            tpa = p.stats.threepa;
            ftm = p.stats.ftm;
            fta = p.stats.fta;
            orb = p.stats.offReb ?? 0;
            drb = p.stats.defReb ?? 0;
            pf  = p.stats.pf ?? 0;
            pm  = p.stats.plusMinus;
          }

          const gpSafe = Math.max(1, gp);
          const ppg  = pts / gpSafe;
          const rpg  = reb / gpSafe;
          const apg  = ast / gpSafe;
          const spg  = stl / gpSafe;
          const bpg  = blk / gpSafe;
          const tpg  = tov / gpSafe;
          const mpg  = min / gpSafe;
          const orbPg = orb / gpSafe;
          const drbPg = drb / gpSafe;
          const pfPg  = pf  / gpSafe;
          const fgmPg = fgm / gpSafe;
          const fgaPg = fga / gpSafe;
          const tpmPg = tpm / gpSafe;
          const tpaPg = tpa / gpSafe;
          const ftmPg = ftm / gpSafe;
          const ftaPg = fta / gpSafe;
          const fgPct  = fga > 0 ? fgm / fga : 0;
          const tpPct  = tpa > 0 ? tpm / tpa : 0;
          const ftPct  = fta > 0 ? ftm / fta : 0;
          // 2-pt derived
          const twom   = fgm - tpm;
          const twoa   = fga - tpa;
          const twoPct = twoa > 0 ? twom / twoa : 0;
          const twomPg = twom / gpSafe;
          const twoaPg = twoa / gpSafe;
          // EFG%
          const efg = fga > 0 ? (fgm + 0.5 * tpm) / fga : 0;
          // Advanced
          const per = min > 0
            ? (pts + reb + ast + stl + blk - (fga - fgm) - (fta - ftm) - tov) / min * 30
            : 0;
          const ts  = (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0;
          const usg = min > 0 ? (fga + 0.44 * fta + tov) / min : 0;
          const bpm = gpSafe > 0 ? pm / gpSafe : 0;
          const vorp = bpm * (gpSafe / 82) * 2.7;
          const pmPg = gpSafe > 0 ? pm / gpSafe : 0;
          // Per 36
          const p36 = (stat: number) => min > 0 ? (stat / min) * 36 : 0;

          return {
            id: p.id,
            player: p,
            name: p.name,
            teamId: team.id,
            teamName: team.name,
            team,
            pos: p.position,
            gp, gs, mpg, ppg, rpg, apg, spg, bpg, tpg,
            orbPg, drbPg, pfPg,
            fgm, fga, fgPct, tpm, tpa, tpPct, ftm, fta, ftPct,
            fgmPg, fgaPg, tpmPg, tpaPg, ftmPg, ftaPg,
            twom, twoa, twoPct, twomPg, twoaPg, efg,
            per, ts, usg, bpm, vorp, pmPg,
            p36pts: p36(pts), p36reb: p36(reb), p36ast: p36(ast),
            p36stl: p36(stl), p36blk: p36(blk), p36tov: p36(tov),
            p36fgPct: fgPct, p36tpPct: tpPct, p36ftPct: ftPct,
            // Raw totals (used by the Totals subtab)
            totalPts: pts, totalReb: reb, totalAst: ast,
            totalStl: stl, totalBlk: blk, totalTov: tov,
            totalMin: min, totalFgm: fgm, totalFga: fga,
            totalTpm: tpm, totalTpa: tpa, totalFtm: ftm, totalFta: fta,
            totalOrb: orb, totalDrb: drb,
          };
        })
      );
    }, [league.teams, playerStatsView]);

    // Filter
    const filtered = useMemo(() => {
      return playerRows.filter(r => {
        if (r.gp < minGames) return false;
        if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (teamFilter !== 'ALL' && r.teamId !== teamFilter) return false;
        if (posFilter !== 'ALL' && r.pos !== posFilter) return false;
        return true;
      });
    }, [playerRows, minGames, searchTerm, teamFilter, posFilter]);

    // Sort
    const sorted = useMemo(() => {
      return [...filtered].sort((a, b) => {
        const av = (a as any)[sortKey] ?? 0;
        const bv = (b as any)[sortKey] ?? 0;
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    }, [filtered, sortKey, sortDir]);

    const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

    const handleSort = (key: string) => {
      if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setSortKey(key); setSortDir('desc'); setPage(0); }
    };
    const Th = ({ k, label, right }: { k: string; label: string; right?: boolean }) => (
      <th
        className={`px-2 py-3 text-center cursor-pointer select-none whitespace-nowrap transition-colors hover:text-white ${
          sortKey === k ? 'text-amber-500' : 'text-slate-500'
        }`}
        onClick={() => handleSort(k)}
      >
        {label}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
      </th>
    );

    const pct = (v: number) => (v * 100).toFixed(1) + '%';
    const fix1 = (v: number) => v.toFixed(1);
    const fix2 = (v: number) => v.toFixed(2);

    const rowTint = (rank: number) => {
      if (rank === 0) return 'bg-yellow-500/10';
      if (rank === 1) return 'bg-slate-400/10';
      if (rank === 2) return 'bg-amber-700/10';
      return '';
    };

    // Spotlight leaders
    const scoringLeader  = [...playerRows].sort((a, b) => b.ppg - a.ppg)[0];
    const assistsLeader  = [...playerRows].sort((a, b) => b.apg - a.apg)[0];
    const reboundsLeader = [...playerRows].sort((a, b) => b.rpg - a.rpg)[0];
    const blocksLeader   = [...playerRows].sort((a, b) => b.bpg - a.bpg)[0];

    const SpotCard = ({ title, row, stat, label }: { title: string; row: typeof playerRows[0] | undefined; stat: number; label: string }) => (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-2">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</span>
        {row ? (
          <>
            <span className="font-display font-bold text-white uppercase text-lg leading-none">{row.name}</span>
            <div className="flex items-center gap-2">
              <TeamBadge team={row.team} size="xs" />
              <span className="text-[10px] font-black text-slate-500 uppercase">{row.teamName}</span>
            </div>
            <span className="text-3xl font-display font-bold text-amber-500">{fix1(stat)}</span>
            <span className="text-[10px] font-black text-slate-600 uppercase">{label}</span>
          </>
        ) : <span className="text-slate-600">—</span>}
      </div>
    );

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Spotlight */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SpotCard title="Scoring Leader"  row={scoringLeader}  stat={scoringLeader?.ppg  ?? 0} label="PPG" />
          <SpotCard title="Assists Leader"  row={assistsLeader}  stat={assistsLeader?.apg  ?? 0} label="APG" />
          <SpotCard title="Rebounds Leader" row={reboundsLeader} stat={reboundsLeader?.rpg ?? 0} label="RPG" />
          <SpotCard title="Blocks Leader"   row={blocksLeader}   stat={blocksLeader?.bpg   ?? 0} label="BPG" />
        </div>

        {/* Season / Career toggle */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-full p-0.5">
            {(['season', 'career'] as PlayerStatsView[]).map(v => (
              <button
                key={v}
                onClick={() => { setPlayerStatsView(v); setPage(0); }}
                className={`px-5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all ${
                  playerStatsView === v ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-white'
                }`}
              >{v}</button>
            ))}
          </div>
          {/* Sub-tabs */}
          <div className="flex gap-2 flex-wrap">
            {(['traditional', 'advanced', 'per36', 'shooting', 'totals'] as PlayerSubTab[]).map(t => (
              <button
                key={t}
                onClick={() => {
                  setPlayerSubTab(t);
                  setSortKey(t === 'advanced' ? 'per' : t === 'shooting' ? 'fgPct' : t === 'totals' ? 'totalPts' : 'ppg');
                  setSortDir('desc');
                  setPage(0);
                }}
                className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${
                  playerSubTab === t ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'
                }`}
              >
                {t === 'per36' ? 'Per 36' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/50">
                  <th className="px-3 py-3 text-slate-500 text-center sticky left-0 bg-slate-950/90 z-10">#</th>
                  <th className="px-4 py-3 text-slate-500 sticky left-8 bg-slate-950/90 z-10 whitespace-nowrap">Player</th>
                  <th className="px-2 py-3 text-slate-500 text-center">Team</th>
                  <th className="px-2 py-3 text-slate-500 text-center">Pos</th>
                  <Th k="gp"  label="GP" />
                  {playerSubTab === 'traditional' && (<>
                    <Th k="gs"  label="GS" />
                    <Th k="mpg" label="MPG" />
                    <Th k="ppg" label="PPG" />
                    <Th k="orbPg" label="ORB" />
                    <Th k="drbPg" label="DRB" />
                    <Th k="rpg" label="RPG" />
                    <Th k="apg" label="APG" />
                    <Th k="spg" label="SPG" />
                    <Th k="bpg" label="BPG" />
                    <Th k="tpg" label="TPG" />
                    <Th k="pfPg" label="PF" />
                    <Th k="fgPct" label="FG%" />
                    <Th k="tpPct" label="3P%" />
                    <Th k="ftPct" label="FT%" />
                  </>)}
                  {playerSubTab === 'advanced' && (<>
                    <Th k="per"  label="PER" />
                    <Th k="ts"   label="TS%" />
                    <Th k="usg"  label="USG%" />
                    <Th k="bpm"  label="BPM" />
                    <Th k="vorp" label="VORP" />
                    <Th k="pmPg" label="+/-" />
                  </>)}
                  {playerSubTab === 'per36' && (<>
                    <Th k="mpg"    label="MPG" />
                    <Th k="p36pts" label="PTS" />
                    <Th k="p36reb" label="REB" />
                    <Th k="p36ast" label="AST" />
                    <Th k="p36stl" label="STL" />
                    <Th k="p36blk" label="BLK" />
                    <Th k="p36tov" label="TOV" />
                    <Th k="p36fgPct" label="FG%" />
                    <Th k="p36tpPct" label="3P%" />
                    <Th k="p36ftPct" label="FT%" />
                  </>)}
                  {playerSubTab === 'shooting' && (<>
                    <Th k="fgmPg"  label="FGM" />
                    <Th k="fgaPg"  label="FGA" />
                    <Th k="fgPct"  label="FG%" />
                    <Th k="efg"    label="EFG%" />
                    <Th k="tpmPg"  label="3PM" />
                    <Th k="tpaPg"  label="3PA" />
                    <Th k="tpPct"  label="3P%" />
                    <Th k="twomPg" label="2PM" />
                    <Th k="twoaPg" label="2PA" />
                    <Th k="twoPct" label="2P%" />
                    <Th k="ftmPg"  label="FTM" />
                    <Th k="ftaPg"  label="FTA" />
                    <Th k="ftPct"  label="FT%" />
                  </>)}
                  {playerSubTab === 'totals' && (<>
                    <Th k="gs"       label="GS" />
                    <Th k="totalMin" label="MIN" />
                    <Th k="totalPts" label="PTS" />
                    <Th k="totalOrb" label="ORB" />
                    <Th k="totalDrb" label="DRB" />
                    <Th k="totalReb" label="REB" />
                    <Th k="totalAst" label="AST" />
                    <Th k="totalStl" label="STL" />
                    <Th k="totalBlk" label="BLK" />
                    <Th k="totalTov" label="TOV" />
                    <Th k="totalFgm" label="FGM" />
                    <Th k="totalFga" label="FGA" />
                    <Th k="fgPct"    label="FG%" />
                    <Th k="totalTpm" label="3PM" />
                    <Th k="totalTpa" label="3PA" />
                    <Th k="tpPct"    label="3P%" />
                    <Th k="totalFtm" label="FTM" />
                    <Th k="totalFta" label="FTA" />
                    <Th k="ftPct"    label="FT%" />
                  </>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {paged.map((r, idx) => {
                  const globalRank = page * PAGE_SIZE + idx;
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-800/40 transition-all cursor-pointer ${rowTint(globalRank)}`}
                      onClick={() => onViewPlayer?.(r.player)}
                    >
                      <td className="px-3 py-3 text-center font-mono text-slate-500 sticky left-0 bg-slate-900/95 z-10 text-xs">
                        {globalRank + 1}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-200 uppercase tracking-tight whitespace-nowrap sticky left-8 bg-slate-900/95 z-10">
                        {r.name}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <TeamBadge team={r.team} size="xs" />
                      </td>
                      <td className="px-2 py-3 text-center text-slate-400 font-black text-[10px] uppercase">{r.pos}</td>
                      <td className="px-2 py-3 text-center font-mono">{r.gp}</td>
                      {playerSubTab === 'traditional' && (<>
                        <td className="px-2 py-3 text-center font-mono text-slate-400">{r.gs}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.mpg)}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold text-amber-400">{fix1(r.ppg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.orbPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.drbPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.rpg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.apg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.spg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.bpg)}</td>
                        <td className="px-2 py-3 text-center font-mono text-rose-400/70">{fix1(r.tpg)}</td>
                        <td className="px-2 py-3 text-center font-mono text-slate-400">{fix1(r.pfPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{pct(r.fgPct)}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.tpa > 0 ? pct(r.tpPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.fta > 0 ? pct(r.ftPct) : '—'}</td>
                      </>)}
                      {playerSubTab === 'advanced' && (<>
                        <td className="px-2 py-3 text-center font-mono font-bold text-amber-400">{fix1(r.per)}</td>
                        <td className="px-2 py-3 text-center font-mono">{pct(r.ts)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix2(r.usg)}</td>
                        <td className={`px-2 py-3 text-center font-mono font-bold ${r.bpm >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fix1(r.bpm)}</td>
                        <td className={`px-2 py-3 text-center font-mono font-bold ${r.vorp >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fix2(r.vorp)}</td>
                        <td className={`px-2 py-3 text-center font-mono font-bold ${r.pmPg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{r.pmPg >= 0 ? '+' : ''}{fix1(r.pmPg)}</td>
                      </>)}
                      {playerSubTab === 'per36' && (<>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.mpg)}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold text-amber-400">{fix1(r.p36pts)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.p36reb)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.p36ast)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.p36stl)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.p36blk)}</td>
                        <td className="px-2 py-3 text-center font-mono text-rose-400/70">{fix1(r.p36tov)}</td>
                        <td className="px-2 py-3 text-center font-mono">{pct(r.p36fgPct)}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.tpa > 0 ? pct(r.p36tpPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.fta > 0 ? pct(r.p36ftPct) : '—'}</td>
                      </>)}
                      {playerSubTab === 'shooting' && (<>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.fgmPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.fgaPg)}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold">{pct(r.fgPct)}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold text-sky-400">{r.fga > 0 ? pct(r.efg) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.tpmPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.tpaPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.tpa > 0 ? pct(r.tpPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.twomPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.twoaPg)}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold">{r.twoa > 0 ? pct(r.twoPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.ftmPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.ftaPg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.fta > 0 ? pct(r.ftPct) : '—'}</td>
                      </>)}
                      {playerSubTab === 'totals' && (<>
                        <td className="px-2 py-3 text-center font-mono text-slate-400">{r.gs}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalMin}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold text-amber-400">{r.totalPts}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalOrb}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalDrb}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalReb}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalAst}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalStl}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalBlk}</td>
                        <td className="px-2 py-3 text-center font-mono text-rose-400/70">{r.totalTov}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalFgm}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalFga}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold">{r.fga > 0 ? pct(r.fgPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalTpm}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalTpa}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.tpa > 0 ? pct(r.tpPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalFtm}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.totalFta}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.fta > 0 ? pct(r.ftPct) : '—'}</td>
                      </>)}
                    </tr>
                  );
                })}
                {paged.length === 0 && (
                  <tr><td colSpan={20} className="py-16 text-center text-slate-600 font-display uppercase tracking-widest">No players match filters</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/60 bg-slate-950/30">
              <span className="text-[10px] font-black text-slate-500 uppercase">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="px-4 py-2 text-[10px] font-black uppercase rounded-lg bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
                >Prev</button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-8 h-8 text-[10px] font-black rounded-lg transition-colors ${
                      i === page ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'
                    }`}
                  >{i + 1}</button>
                ))}
                <button
                  disabled={page === totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 text-[10px] font-black uppercase rounded-lg bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── TEAM STATS TABLE ────────────────────────────────────────────────────
  const TeamStatsTable = () => {
    type TeamSubTab = 'traditional' | 'advanced' | 'opponent';
    const [teamSubTab, setTeamSubTab] = useState<TeamSubTab>('traditional');
    const [sortKey, setSortKey] = useState<string>('winPct');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const sortedTeams = useMemo(() => {
      return [...teamStats]
        .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
          const aVal = (a as Record<string, unknown>)[sortKey];
          const bVal = (b as Record<string, unknown>)[sortKey];
          if (typeof aVal === 'string' || typeof bVal === 'string')
            return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
          return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [sortKey, sortDir, searchTerm]);

    const avg = useMemo(() => {
      const n = teamStats.length || 1;
      const s = (k: string) => teamStats.reduce((acc, t) => acc + ((t as Record<string, unknown>)[k] as number), 0) / n;
      return { games: s('games'), wins: s('wins'), losses: s('losses'), winPct: s('winPct'), avgAge: s('avgAge'),
        fgm: s('fgm'), fga: s('fga'), fgPct: s('fgPct'), threepm: s('threepm'), threepa: s('threepa'), threePct: s('threePct'),
        twopm: s('twopm'), twopa: s('twopa'), twoPct: s('twoPct'), ftm: s('ftm'), fta: s('fta'), ftPct: s('ftPct'),
        orb: s('orb'), drb: s('drb'), trb: s('trb'), ast: s('ast'), stl: s('stl'), blk: s('blk'), tov: s('tov'), pf: s('pf'), pts: s('pts'), mov: s('mov'),
        eFGPct: s('eFGPct'), tsPct: s('tsPct'), pace: s('pace'), ortg: s('ortg'), drtg: s('drtg'), netRtg: s('netRtg'),
        tovPct: s('tovPct'), astTov: s('astTov'), astPct: s('astPct'), orbPct: s('orbPct'), drbPct: s('drbPct'),
        oppPts: s('oppPts'), oppFgm: s('oppFgm'), oppFga: s('oppFga'), oppFgPct: s('oppFgPct'),
        oppThreepm: s('oppThreepm'), oppThreepa: s('oppThreepa'), oppThreePct: s('oppThreePct'),
        oppFtm: s('oppFtm'), oppFta: s('oppFta'), oppFtPct: s('oppFtPct'),
        oppOrb: s('oppOrb'), oppDrb: s('oppDrb'), oppTrb: s('oppTrb'),
        oppAst: s('oppAst'), oppStl: s('oppStl'), oppBlk: s('oppBlk'), oppTov: s('oppTov'), oppPf: s('oppPf'),
      };
    }, [teamStats]);

    const handleSort = (key: string) => {
      if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setSortKey(key); setSortDir('desc'); }
    };
    const Si = ({ k }: { k: string }) =>
      sortKey !== k ? <span className="ml-1 opacity-20">↕</span> : <span className="ml-1 text-amber-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;

    // Shared leading columns (rank + team + G/W/L/%)
    const LeadTh = () => <>
      <th className="px-4 py-4 cursor-pointer hover:text-white" onClick={() => handleSort('winPct')}># <Si k="winPct" /></th>
      <th className="px-4 py-4 cursor-pointer hover:text-white sticky left-0 bg-slate-950/90" onClick={() => handleSort('name')}>Team <Si k="name" /></th>
      <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('games')}>G <Si k="games" /></th>
      <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('wins')}>W <Si k="wins" /></th>
      <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('losses')}>L <Si k="losses" /></th>
      <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('winPct')}>% <Si k="winPct" /></th>
    </>;
    const LeadTd = ({ t, idx }: { t: typeof sortedTeams[0]; idx: number }) => <>
      <td className="px-4 py-4 font-mono text-xs text-slate-500">{idx + 1}</td>
      <td className="px-4 py-4 sticky left-0 bg-slate-900 group-hover:bg-slate-800/60 transition-colors">
        <div className="flex items-center gap-3">
          <TeamBadge team={t} size="xs" />
          <span className="font-display font-bold text-slate-200 group-hover:text-amber-500 transition-colors uppercase">{t.name}</span>
        </div>
      </td>
      <td className="px-2 py-4 text-center font-mono text-xs">{t.games}</td>
      <td className="px-2 py-4 text-center font-mono text-xs text-emerald-400">{t.wins}</td>
      <td className="px-2 py-4 text-center font-mono text-xs text-rose-400">{t.losses}</td>
      <td className="px-2 py-4 text-center font-mono text-xs">{(t.winPct * 100).toFixed(1)}%</td>
    </>;
    const LeadAvg = () => <>
      <td className="px-2 py-4 text-center font-mono text-xs">{avg.games.toFixed(1)}</td>
      <td className="px-2 py-4 text-center font-mono text-xs">{avg.wins.toFixed(1)}</td>
      <td className="px-2 py-4 text-center font-mono text-xs">{avg.losses.toFixed(1)}</td>
      <td className="px-2 py-4 text-center font-mono text-xs">{(avg.winPct * 100).toFixed(1)}%</td>
    </>;

    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    const n1  = (v: number) => v.toFixed(1);
    const n2  = (v: number) => v.toFixed(2);

    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Sub-tab pills */}
        <div className="flex gap-2 flex-wrap">
          {(['traditional', 'advanced', 'opponent'] as TeamSubTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setTeamSubTab(tab); setSortKey(tab === 'advanced' ? 'netRtg' : tab === 'opponent' ? 'oppPts' : 'winPct'); setSortDir('desc'); }}
              className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border ${
                teamSubTab === tab
                  ? tab === 'advanced'  ? 'bg-purple-500 border-purple-400 text-white'
                  : tab === 'opponent' ? 'bg-blue-500 border-blue-400 text-white'
                  : 'bg-amber-500 border-amber-400 text-slate-950'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white hover:border-slate-600'
              }`}
            >{tab}</button>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            {/* ── TRADITIONAL ─────────────────────────────────────────── */}
            {teamSubTab === 'traditional' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/50">
                    <LeadTh />
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('avgAge')}>Age <Si k="avgAge" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fgm')}>FG <Si k="fgm" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fga')}>FGA <Si k="fga" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fgPct')}>FG% <Si k="fgPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('threepm')}>3P <Si k="threepm" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('threepa')}>3PA <Si k="threepa" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('threePct')}>3P% <Si k="threePct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('twopm')}>2P <Si k="twopm" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('twopa')}>2PA <Si k="twopa" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('twoPct')}>2P% <Si k="twoPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ftm')}>FT <Si k="ftm" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fta')}>FTA <Si k="fta" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ftPct')}>FT% <Si k="ftPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('orb')}>ORB <Si k="orb" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('drb')}>DRB <Si k="drb" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('trb')}>TRB <Si k="trb" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ast')}>AST <Si k="ast" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('tov')}>TOV <Si k="tov" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('stl')}>STL <Si k="stl" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('blk')}>BLK <Si k="blk" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pf')}>PF <Si k="pf" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pts')}>PTS <Si k="pts" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('mov')}>MOV <Si k="mov" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {sortedTeams.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition-all cursor-pointer group" onClick={() => onManageTeam?.(t.id)}>
                      <LeadTd t={t} idx={idx} />
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.avgAge)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.fgm)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.fga)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.fgPct > 0.48 ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.fgPct)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.threepm)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.threepa)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.threePct > 0.38 ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.threePct)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.twopm)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.twopa)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.twoPct > 0.52 ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.twoPct)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.ftm)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.fta)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.ftPct > 0.8 ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.ftPct)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.orb)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.drb)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.trb)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.ast)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.tov < 12 ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.tov)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.stl)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.blk)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.pf)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.pts > 110 ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.pts)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.mov > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.mov)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950/80 font-black text-slate-400 border-t-2 border-slate-800">
                    <td className="px-4 py-4" colSpan={2}>League Avg</td>
                    <LeadAvg />
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.avgAge)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.fgm)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.fga)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.fgPct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.threepm)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.threepa)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.threePct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.twopm)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.twopa)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.twoPct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.ftm)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.fta)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.ftPct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.orb)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.drb)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.trb)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.ast)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.tov)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.stl)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.blk)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.pf)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.pts)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.mov)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* ── ADVANCED ────────────────────────────────────────────── */}
            {teamSubTab === 'advanced' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/50">
                    <LeadTh />
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pts')}>PTS <Si k="pts" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pace')}>Pace <Si k="pace" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ortg')}>ORtg <Si k="ortg" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('drtg')}>DRtg <Si k="drtg" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('netRtg')}>NetRtg <Si k="netRtg" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('eFGPct')}>eFG% <Si k="eFGPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('tsPct')}>TS% <Si k="tsPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('tovPct')}>TOV% <Si k="tovPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('astTov')}>AST/TO <Si k="astTov" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('astPct')}>AST% <Si k="astPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('orbPct')}>ORB% <Si k="orbPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('drbPct')}>DRB% <Si k="drbPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('mov')}>MOV <Si k="mov" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {sortedTeams.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition-all cursor-pointer group" onClick={() => onManageTeam?.(t.id)}>
                      <LeadTd t={t} idx={idx} />
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.pts > avg.pts ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.pts)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.pace)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.ortg > avg.ortg ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.ortg)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.drtg < avg.drtg ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.drtg)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.netRtg > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.netRtg > 0 ? '+' : ''}{n1(t.netRtg)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.eFGPct > avg.eFGPct ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.eFGPct)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.tsPct > avg.tsPct ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.tsPct)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.tovPct < avg.tovPct ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.tovPct)}%</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.astTov > avg.astTov ? 'text-emerald-400' : 'text-rose-400'}`}>{n2(t.astTov)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.astPct)}%</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.orbPct > avg.orbPct ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.orbPct)}%</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.drbPct > avg.drbPct ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.drbPct)}%</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.mov > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.mov > 0 ? '+' : ''}{n1(t.mov)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950/80 font-black text-slate-400 border-t-2 border-slate-800">
                    <td className="px-4 py-4" colSpan={2}>League Avg</td>
                    <LeadAvg />
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.pts)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.pace)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.ortg)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.drtg)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">—</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.eFGPct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.tsPct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.tovPct)}%</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n2(avg.astTov)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.astPct)}%</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.orbPct)}%</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.drbPct)}%</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">—</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* ── OPPONENT ────────────────────────────────────────────── */}
            {teamSubTab === 'opponent' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/50">
                    <LeadTh />
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppPts')}>OppPTS <Si k="oppPts" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppFgm')}>OppFG <Si k="oppFgm" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppFga')}>OppFGA <Si k="oppFga" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppFgPct')}>OppFG% <Si k="oppFgPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppThreepm')}>Opp3P <Si k="oppThreepm" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppThreepa')}>Opp3PA <Si k="oppThreepa" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppThreePct')}>Opp3P% <Si k="oppThreePct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppFtm')}>OppFT <Si k="oppFtm" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppFta')}>OppFTA <Si k="oppFta" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppFtPct')}>OppFT% <Si k="oppFtPct" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppOrb')}>OppORB <Si k="oppOrb" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppDrb')}>OppDRB <Si k="oppDrb" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppTrb')}>OppTRB <Si k="oppTrb" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppAst')}>OppAST <Si k="oppAst" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppTov')}>OppTOV <Si k="oppTov" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppStl')}>OppSTL <Si k="oppStl" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('oppBlk')}>OppBLK <Si k="oppBlk" /></th>
                    <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('drtg')}>DRtg <Si k="drtg" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {sortedTeams.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition-all cursor-pointer group" onClick={() => onManageTeam?.(t.id)}>
                      <LeadTd t={t} idx={idx} />
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppPts < avg.oppPts ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.oppPts)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppFgm)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppFga)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppFgPct < avg.oppFgPct ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.oppFgPct)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppThreepm)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppThreepa)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppThreePct < avg.oppThreePct ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.oppThreePct)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppFtm)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppFta)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppFtPct < avg.oppFtPct ? 'text-emerald-400' : 'text-rose-400'}`}>{pct(t.oppFtPct)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppOrb < avg.oppOrb ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.oppOrb)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppDrb)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppTrb < avg.oppTrb ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.oppTrb)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppAst < avg.oppAst ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.oppAst)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.oppTov > avg.oppTov ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.oppTov)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppStl)}</td>
                      <td className="px-2 py-4 text-center font-mono text-xs">{n1(t.oppBlk)}</td>
                      <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.drtg < avg.drtg ? 'text-emerald-400' : 'text-rose-400'}`}>{n1(t.drtg)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950/80 font-black text-slate-400 border-t-2 border-slate-800">
                    <td className="px-4 py-4" colSpan={2}>League Avg</td>
                    <LeadAvg />
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppPts)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppFgm)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppFga)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.oppFgPct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppThreepm)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppThreepa)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.oppThreePct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppFtm)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppFta)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{pct(avg.oppFtPct)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppOrb)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppDrb)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppTrb)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppAst)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppTov)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppStl)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.oppBlk)}</td>
                    <td className="px-2 py-4 text-center font-mono text-xs">{n1(avg.drtg)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -ml-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">League Intelligence</h2>
            <div className="flex gap-2 flex-wrap">
              {(['leaderboards', 'advanced', 'compare', 'teams', 'players'] as StatTab[]).map(t => (
                <button 
                  key={t}
                  onClick={() => { setActiveTab(t); setPage(0); }}
                  className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${activeTab === t ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                >
                  {t === 'teams' ? 'Team Stats' : t === 'players' ? 'Player Stats' : t}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex gap-3 w-full lg:w-auto items-center flex-wrap">
             <div className="flex-1 lg:w-52 relative">
                <input 
                  type="text" 
                  placeholder={activeTab === 'teams' ? 'Filter Team...' : 'Filter Player...'} 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                />
             </div>
             {activeTab === 'players' && (
               <>
                 <select
                   className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs font-black text-slate-400 focus:outline-none focus:border-amber-500/50"
                   value={teamFilter}
                   onChange={e => { setTeamFilter(e.target.value); setPage(0); }}
                 >
                   <option value="ALL">All Teams</option>
                   {league.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                 </select>
                 <div className="flex gap-1">
                   {(['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as Array<'ALL' | 'PG' | 'SG' | 'SF' | 'PF' | 'C'>).map(pos => (
                     <button
                       key={pos}
                       onClick={() => { setPosFilter(pos as any); setPage(0); }}
                       className={`text-[10px] font-black px-2 py-2 rounded-lg transition-all ${
                         posFilter === pos ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'
                       }`}
                     >{pos}</button>
                   ))}
                 </div>
               </>
             )}
             <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-600 uppercase">Min GP</span>
                <input 
                  type="number" 
                  className="bg-transparent text-amber-500 font-display font-bold w-12 focus:outline-none" 
                  value={minGames} 
                  onChange={(e) => { setMinGames(parseInt(e.target.value) || 0); setPage(0); }} 
                />
             </div>
          </div>
        </div>
      </header>

      {activeTab === 'leaderboards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <LeaderTable statKey="ppg" label="Scoring" />
          <LeaderTable statKey="rpg" label="Rebounding" />
          <LeaderTable statKey="apg" label="Assists" />
          <LeaderTable statKey="spg" label="Steals" />
          <LeaderTable statKey="bpg" label="Blocks" />
          <LeaderTable statKey="fgPct" label="FG%" fmt={v => (v * 100).toFixed(1) + '%'} />
          <LeaderTable statKey="tpm"   label="3-Pointers Made" />
          <LeaderTable statKey="tpPct" label="3-Point %" fmt={v => (v * 100).toFixed(1) + '%'} />
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           <LeaderTable statKey="PER" label="Efficiency (PER)" />
           <LeaderTable statKey="TS" label="True Shooting" />
           <LeaderTable statKey="eFG" label="eFG%" />
        </div>
      )}

      {activeTab === 'compare' && <PlayerComparison />}

      {activeTab === 'teams' && <TeamStatsTable />}

      {activeTab === 'players' && <PlayerStatsTable />}
    </div>
  );
};

export default Stats;