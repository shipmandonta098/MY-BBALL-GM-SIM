import React, { useState, useMemo } from 'react';
import { LeagueState, Player, Team, Position } from '../types';
import TeamBadge from './TeamBadge';

interface StatsProps {
  league: LeagueState;
  onViewRoster?: (teamId: string) => void;
  onManageTeam?: (teamId: string) => void;
  onViewPlayer?: (player: Player) => void;
}

type StatTab = 'leaderboards' | 'advanced' | 'compare' | 'teams' | 'players';
type PlayerSubTab = 'traditional' | 'advanced' | 'per36' | 'shooting';

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

  const allPlayers = useMemo(() => {
    return league.teams.flatMap(t => t.roster.map(p => ({ ...p, teamName: t.name, teamLogo: t.logo })));
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
      const pf = roster.reduce((s, p) => s + p.stats.pf, 0);
      const pts = roster.reduce((s, p) => s + p.stats.points, 0);
      
      const games = t.wins + t.losses;
      const winPct = games > 0 ? t.wins / games : 0;
      const avgAge = roster.reduce((s, p) => s + p.age, 0) / (roster.length || 1);
      
      const twopm = fgm - threepm;
      const twopa = fga - threepa;
      
      // Calculate MOV from league history
      let ptsScored = 0;
      let ptsAllowed = 0;
      league.history.forEach(g => {
        if (g.homeTeamId === t.id) {
          ptsScored += g.homeScore;
          ptsAllowed += g.awayScore;
        } else if (g.awayTeamId === t.id) {
          ptsScored += g.awayScore;
          ptsAllowed += g.homeScore;
        }
      });
      const mov = games > 0 ? (ptsScored - ptsAllowed) / games : 0;
      
      return {
        id: t.id,
        name: t.name,
        logo: t.logo,
        games,
        wins: t.wins,
        losses: t.losses,
        winPct,
        avgAge,
        fgm,
        fga,
        fgPct: fga > 0 ? fgm / fga : 0,
        threepm,
        threepa,
        threePct: threepa > 0 ? threepm / threepa : 0,
        twopm,
        twopa,
        twoPct: twopa > 0 ? twopm / twopa : 0,
        ftm,
        fta,
        ftPct: fta > 0 ? ftm / fta : 0,
        orb,
        drb,
        trb,
        ast,
        stl,
        blk,
        tov,
        pf,
        pts,
        mov
      };
    });
  }, [league.teams, league.history]);

  // Advanced Stats Calculation
  const calculateAdvanced = (p: Player) => {
    const gp = Math.max(1, p.stats.gamesPlayed);
    const ppg = p.stats.points / gp;
    const rpg = p.stats.rebounds / gp;
    const apg = p.stats.assists / gp;
    
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

    return { eFG, TS, USG, PER, ppg, rpg, apg };
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

  const LeaderTable = ({ statKey, label }: { statKey: string, label: string }) => {
    const sorted = [...filteredLeaders].sort((a, b) => {
      const aVal = (a.adv as any)[statKey] || (a.stats as any)[statKey] / Math.max(1, a.stats.gamesPlayed);
      const bVal = (b.adv as any)[statKey] || (b.stats as any)[statKey] / Math.max(1, b.stats.gamesPlayed);
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
                       <span className="font-bold text-slate-200 uppercase tracking-tight">{p.name}</span>
                       <button onClick={() => toggleCompare(p.id)} className={`text-[10px] p-1 rounded ${compareList.includes(p.id) ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'} hover:scale-105 transition-all`}>Compare</button>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2">
                          <img src={p.teamLogo} className="w-5 h-5 opacity-50" alt="" />
                          <span className="text-[10px] font-black text-slate-500 uppercase">{p.teamName}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right font-display font-bold text-amber-500 text-lg">
                      {val.toFixed(statKey === 'PER' ? 1 : statKey === 'TS' || statKey === 'eFG' ? 3 : 1)}
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
                    <img src={p.teamLogo} className="w-12 h-12 mx-auto mb-4 opacity-30 group-hover:opacity-60 transition-opacity" alt="" />
                    <h4 className="text-2xl font-display font-bold text-white uppercase">{p.name}</h4>
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

    // Aggregate stats per player
    const playerRows = useMemo(() => {
      return league.teams.flatMap(team =>
        team.roster.map(p => {
          const gp  = Math.max(1, p.stats.gamesPlayed);
          const min = p.stats.minutes;
          const pts = p.stats.points;
          const reb = p.stats.rebounds;
          const ast = p.stats.assists;
          const stl = p.stats.steals;
          const blk = p.stats.blocks;
          const tov = p.stats.tov;
          const fgm = p.stats.fgm;
          const fga = p.stats.fga;
          const tpm = p.stats.threepm;
          const tpa = p.stats.threepa;
          const ftm = p.stats.ftm;
          const fta = p.stats.fta;
          const pm  = p.stats.plusMinus;

          const ppg = pts / gp;
          const rpg = reb / gp;
          const apg = ast / gp;
          const spg = stl / gp;
          const bpg = blk / gp;
          const tpg = tov / gp;
          const mpg = min / gp;
          const fgPct  = fga > 0 ? fgm / fga : 0;
          const tpPct  = tpa > 0 ? tpm / tpa : 0;
          const ftPct  = fta > 0 ? ftm / fta : 0;
          // 2-pt (mid + post) derived
          const twom = fgm - tpm;
          const twoa = fga - tpa;
          const twoPct = twoa > 0 ? twom / twoa : 0;
          // Advanced
          const per = min > 0
            ? (pts + reb + ast + stl + blk - (fga - fgm) - (fta - ftm) - tov) / min * 30
            : 0;
          const ts  = (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0;
          const usg = min > 0 ? (fga + 0.44 * fta + tov) / min : 0;
          const bpm = gp > 0 ? pm / gp : 0;
          const vorp = bpm * (gp / 82) * 2.7;
          const pmPg = gp > 0 ? pm / gp : 0;
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
            gp, mpg, ppg, rpg, apg, spg, bpg, tpg,
            fgm, fga, fgPct, tpm, tpa, tpPct, ftm, fta, ftPct,
            twom, twoa, twoPct,
            per, ts, usg, bpm, vorp, pmPg,
            p36pts: p36(pts), p36reb: p36(reb), p36ast: p36(ast),
            p36stl: p36(stl), p36blk: p36(blk), p36tov: p36(tov),
            p36fgPct: fgPct, p36tpPct: tpPct, p36ftPct: ftPct,
          };
        })
      );
    }, [league.teams]);

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

        {/* Sub-tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['traditional', 'advanced', 'per36', 'shooting'] as PlayerSubTab[]).map(t => (
            <button
              key={t}
              onClick={() => { setPlayerSubTab(t); setSortKey(t === 'advanced' ? 'per' : t === 'shooting' ? 'fgPct' : 'ppg'); setSortDir('desc'); setPage(0); }}
              className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${
                playerSubTab === t ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'
              }`}
            >
              {t === 'per36' ? 'Per 36' : t}
            </button>
          ))}
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
                    <Th k="mpg" label="MPG" />
                    <Th k="ppg" label="PPG" />
                    <Th k="rpg" label="RPG" />
                    <Th k="apg" label="APG" />
                    <Th k="spg" label="SPG" />
                    <Th k="bpg" label="BPG" />
                    <Th k="tpg" label="TPG" />
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
                    <Th k="fga"    label="FGA" />
                    <Th k="fgPct"  label="FG%" />
                    <Th k="tpa"    label="3PA" />
                    <Th k="tpPct"  label="3P%" />
                    <Th k="fta"    label="FTA" />
                    <Th k="ftPct"  label="FT%" />
                    <Th k="twoa"   label="2PA" />
                    <Th k="twoPct" label="2P%" />
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
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.mpg)}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold text-amber-400">{fix1(r.ppg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.rpg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.apg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.spg)}</td>
                        <td className="px-2 py-3 text-center font-mono">{fix1(r.bpg)}</td>
                        <td className="px-2 py-3 text-center font-mono text-rose-400/70">{fix1(r.tpg)}</td>
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
                        <td className="px-2 py-3 text-center font-mono">{r.fga}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold">{pct(r.fgPct)}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.tpa}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.tpa > 0 ? pct(r.tpPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.fta}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.fta > 0 ? pct(r.ftPct) : '—'}</td>
                        <td className="px-2 py-3 text-center font-mono">{r.twoa}</td>
                        <td className="px-2 py-3 text-center font-mono font-bold">{r.twoa > 0 ? pct(r.twoPct) : '—'}</td>
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
    const [sortKey, setSortKey] = useState<keyof typeof teamStats[0]>('winPct');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const sortedTeams = useMemo(() => {
      return [...teamStats]
        .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
          const aVal = a[sortKey];
          const bVal = b[sortKey];
          if (typeof aVal === 'string' || typeof bVal === 'string') {
             return sortDir === 'asc' 
               ? String(aVal).localeCompare(String(bVal))
               : String(bVal).localeCompare(String(aVal));
          }
          return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [sortKey, sortDir, searchTerm]);

    const avgRow = useMemo(() => {
      const count = teamStats.length || 1;
      const sum = (key: keyof typeof teamStats[0]) => teamStats.reduce((s, t) => s + (t[key] as number), 0);
      
      const fgm = sum('fgm') / count;
      const fga = sum('fga') / count;
      const threepm = sum('threepm') / count;
      const threepa = sum('threepa') / count;
      const twopm = sum('twopm') / count;
      const twopa = sum('twopa') / count;
      const ftm = sum('ftm') / count;
      const fta = sum('fta') / count;
      const orb = sum('orb') / count;
      const drb = sum('drb') / count;
      const trb = sum('trb') / count;
      const ast = sum('ast') / count;
      const stl = sum('stl') / count;
      const blk = sum('blk') / count;
      const tov = sum('tov') / count;
      const pf = sum('pf') / count;
      const pts = sum('pts') / count;
      const mov = sum('mov') / count;

      return {
        games: sum('games') / count,
        wins: sum('wins') / count,
        losses: sum('losses') / count,
        winPct: sum('winPct') / count,
        avgAge: sum('avgAge') / count,
        fgm,
        fga,
        fgPct: fga > 0 ? fgm / fga : 0,
        threepm,
        threepa,
        threePct: threepa > 0 ? threepm / threepa : 0,
        twopm,
        twopa,
        twoPct: twopa > 0 ? twopm / twopa : 0,
        ftm,
        fta,
        ftPct: fta > 0 ? ftm / fta : 0,
        orb,
        drb,
        trb,
        ast,
        stl,
        blk,
        tov,
        pf,
        pts,
        mov
      };
    }, [teamStats]);

    const handleSort = (key: keyof typeof teamStats[0]) => {
      if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      else {
        setSortKey(key);
        setSortDir('desc');
      }
    };

    const SortIcon = ({ k }: { k: keyof typeof teamStats[0] }) => {
      if (sortKey !== k) return <span className="ml-1 opacity-20">↕</span>;
      return <span className="ml-1 text-amber-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/50">
                <th className="px-4 py-4 cursor-pointer hover:text-white" onClick={() => handleSort('winPct')}># <SortIcon k="winPct" /></th>
                <th className="px-4 py-4 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>Team <SortIcon k="name" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('games')}>G <SortIcon k="games" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('wins')}>W <SortIcon k="wins" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('losses')}>L <SortIcon k="losses" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('winPct')}>% <SortIcon k="winPct" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('avgAge')}>Age <SortIcon k="avgAge" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fgm')}>FG <SortIcon k="fgm" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fga')}>FGA <SortIcon k="fga" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fgPct')}>FG% <SortIcon k="fgPct" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('threepm')}>3P <SortIcon k="threepm" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('threepa')}>3PA <SortIcon k="threepa" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('threePct')}>3P% <SortIcon k="threePct" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('twopm')}>2P <SortIcon k="twopm" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('twopa')}>2PA <SortIcon k="twopa" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('twoPct')}>2P% <SortIcon k="twoPct" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ftm')}>FT <SortIcon k="ftm" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('fta')}>FTA <SortIcon k="fta" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ftPct')}>FT% <SortIcon k="ftPct" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('orb')}>ORB <SortIcon k="orb" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('drb')}>DRB <SortIcon k="drb" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('trb')}>TRB <SortIcon k="trb" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('ast')}>AST <SortIcon k="ast" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('tov')}>TOV <SortIcon k="tov" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('stl')}>STL <SortIcon k="stl" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('blk')}>BLK <SortIcon k="blk" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pf')}>PF <SortIcon k="pf" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pts')}>PTS <SortIcon k="pts" /></th>
                <th className="px-2 py-4 text-center cursor-pointer hover:text-white" onClick={() => handleSort('mov')}>MOV <SortIcon k="mov" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {sortedTeams.map((t, idx) => (
                <tr 
                  key={t.id} 
                  className="hover:bg-slate-800/30 transition-all cursor-pointer group"
                  onClick={() => onManageTeam?.(t.id)}
                >
                  <td className="px-4 py-4 font-mono text-xs text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <TeamBadge team={t} size="xs" />
                      <span className="font-display font-bold text-slate-200 group-hover:text-amber-500 transition-colors uppercase">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.games}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs text-emerald-400">{t.wins}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs text-rose-400">{t.losses}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{(t.winPct * 100).toFixed(1)}%</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.avgAge.toFixed(1)}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.fgm}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.fga}</td>
                  <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.fgPct > 0.48 ? 'text-emerald-400' : 'text-rose-400'}`}>{(t.fgPct * 100).toFixed(1)}%</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.threepm}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.threepa}</td>
                  <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.threePct > 0.38 ? 'text-emerald-400' : 'text-rose-400'}`}>{(t.threePct * 100).toFixed(1)}%</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.twopm}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.twopa}</td>
                  <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.twoPct > 0.52 ? 'text-emerald-400' : 'text-rose-400'}`}>{(t.twoPct * 100).toFixed(1)}%</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.ftm}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.fta}</td>
                  <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.ftPct > 0.8 ? 'text-emerald-400' : 'text-rose-400'}`}>{(t.ftPct * 100).toFixed(1)}%</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.orb}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.drb}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.trb}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.ast}</td>
                  <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.tov < 12 * t.games ? 'text-emerald-400' : 'text-rose-400'}`}>{t.tov}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.stl}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.blk}</td>
                  <td className="px-2 py-4 text-center font-mono text-xs">{t.pf}</td>
                  <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.pts / (t.games || 1) > 110 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.pts}</td>
                  <td className={`px-2 py-4 text-center font-mono text-xs font-bold ${t.mov > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.mov.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-950/80 font-black text-slate-400 border-t-2 border-slate-800">
                <td className="px-4 py-4" colSpan={2}>League Average</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.games.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.wins.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.losses.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{(avgRow.winPct * 100).toFixed(1)}%</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.avgAge.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.fgm.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.fga.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{(avgRow.fgPct * 100).toFixed(1)}%</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.threepm.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.threepa.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{(avgRow.threePct * 100).toFixed(1)}%</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.twopm.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.twopa.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{(avgRow.twoPct * 100).toFixed(1)}%</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.ftm.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.fta.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{(avgRow.ftPct * 100).toFixed(1)}%</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.orb.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.drb.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.trb.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.ast.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.tov.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.stl.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.blk.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.pf.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.pts.toFixed(1)}</td>
                <td className="px-2 py-4 text-center font-mono text-xs">{avgRow.mov.toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           <LeaderTable statKey="ppg" label="Scoring" />
           <LeaderTable statKey="rpg" label="Rebounding" />
           <LeaderTable statKey="apg" label="Assisting" />
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