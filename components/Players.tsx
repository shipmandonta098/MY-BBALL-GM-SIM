import React, { useState, useMemo } from 'react';
import { LeagueState, Player, Position, PersonalityTrait } from '../types';
import TeamBadge from './TeamBadge';

interface PlayersProps {
  league: LeagueState;
  onViewPlayer: (player: Player) => void;
}

type SubTab = 'ratings' | 'bios';

// ─── Trait abbreviation map ─────────────────────────────────
const TRAIT_ABBR: Record<PersonalityTrait, string> = {
  'Leader':              'LE',
  'Diva/Star':           'DI',
  'Loyal':               'LO',
  'Professional':        'PR',
  'Gym Rat':             'GR',
  'Lazy':                'LA',
  'Clutch':              'CL',
  'Tough/Alpha':         'TA',
  'Friendly/Team First': 'FF',
  'Money Hungry':        'MH',
  'Hot Head':            'HH',
  'Workhorse':           'WH',
  'Streaky':             'ST',
};

const TRAIT_COLORS: Record<PersonalityTrait, string> = {
  'Leader':              'bg-amber-500/20 text-amber-400',
  'Diva/Star':           'bg-purple-500/20 text-purple-400',
  'Loyal':               'bg-sky-500/20 text-sky-400',
  'Professional':        'bg-emerald-500/20 text-emerald-400',
  'Gym Rat':             'bg-lime-500/20 text-lime-400',
  'Lazy':                'bg-slate-500/20 text-slate-400',
  'Clutch':              'bg-rose-500/20 text-rose-400',
  'Tough/Alpha':         'bg-orange-500/20 text-orange-400',
  'Friendly/Team First': 'bg-teal-500/20 text-teal-400',
  'Money Hungry':        'bg-yellow-500/20 text-yellow-400',
  'Hot Head':            'bg-red-500/20 text-red-400',
  'Workhorse':           'bg-blue-500/20 text-blue-400',
  'Streaky':             'bg-violet-500/20 text-violet-400',
};

const POT_GRADE = (pot: number): { label: string; cls: string } => {
  if (pot >= 90) return { label: 'A', cls: 'text-amber-400 font-bold' };
  if (pot >= 80) return { label: 'B', cls: 'text-emerald-400 font-bold' };
  if (pot >= 70) return { label: 'C', cls: 'text-slate-200 font-bold' };
  return { label: 'D', cls: 'text-slate-500 font-bold' };
};

const attrColor = (v: number) => {
  if (v >= 90) return 'text-amber-400';
  if (v >= 80) return 'text-emerald-400';
  if (v >= 70) return 'text-sky-400';
  if (v >= 60) return 'text-slate-300';
  return 'text-slate-500';
};

const PAGE_SIZES = [25, 50, 100] as const;

const Players: React.FC<PlayersProps> = ({ league, onViewPlayer }) => {
  const [subTab, setSubTab] = useState<SubTab>('ratings');
  const [sortKey, setSortKey] = useState<string>('rating');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);

  // Filter state
  const [search, setSearch]           = useState('');
  const [teamFilter, setTeamFilter]   = useState('ALL');
  const [posFilter, setPosFilter]     = useState<'ALL' | Position>('ALL');
  const [minAge, setMinAge]           = useState('');
  const [maxAge, setMaxAge]           = useState('');
  const [minOvr, setMinOvr]           = useState('');
  const [maxOvr, setMaxOvr]           = useState('');
  const [faOnly, setFaOnly]           = useState(false);
  const [myTeamOnly, setMyTeamOnly]   = useState(false);

  const userTeamId = league.userTeamId;

  // ─── Build flat player list including FAs ──────────────────
  const allRows = useMemo(() => {
    const teamPlayers = league.teams.flatMap(t =>
      t.roster.map(p => ({ player: p, team: t, isFreeAgent: false }))
    );
    const faPlayers = (league.freeAgents || []).map(p => ({
      player: p,
      team: null as typeof league.teams[0] | null,
      isFreeAgent: true,
    }));
    return [...teamPlayers, ...faPlayers];
  }, [league.teams, league.freeAgents]);

  // ─── Filter ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const minAgeN = minAge ? parseInt(minAge) : 0;
    const maxAgeN = maxAge ? parseInt(maxAge) : 999;
    const minOvrN = minOvr ? parseInt(minOvr) : 0;
    const maxOvrN = maxOvr ? parseInt(maxOvr) : 99;

    return allRows.filter(({ player: p, team, isFreeAgent }) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (teamFilter !== 'ALL') {
        if (isFreeAgent && teamFilter !== 'FA') return false;
        if (!isFreeAgent && team?.id !== teamFilter) return false;
      }
      if (posFilter !== 'ALL' && p.position !== posFilter) return false;
      if (p.age < minAgeN || p.age > maxAgeN) return false;
      if (p.rating < minOvrN || p.rating > maxOvrN) return false;
      if (faOnly && !isFreeAgent) return false;
      if (myTeamOnly && team?.id !== userTeamId) return false;
      return true;
    });
  }, [allRows, search, teamFilter, posFilter, minAge, maxAge, minOvr, maxOvr, faOnly, myTeamOnly, userTeamId]);

  // ─── Sort ──────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = getSortVal(sortKey, a.player, a.team, league);
      const bv = getSortVal(sortKey, b.player, b.team, league);
      if (typeof av === 'string' && typeof bv === 'string')
        return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [filtered, sortKey, sortDir]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); setPage(0); }
  };

  const resetPage = () => setPage(0);

  // ─── Column header component ───────────────────────────────
  const Th = ({ k, label, title }: { k: string; label: string; title?: string }) => (
    <th
      title={title}
      className={`px-1 py-2 text-center cursor-pointer select-none whitespace-nowrap transition-colors hover:text-white text-[9px] tracking-wider uppercase font-black ${
        sortKey === k ? 'text-amber-500' : 'text-slate-500'
      }`}
      onClick={() => handleSort(k)}
    >
      {label}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  // ─── Row helpers ───────────────────────────────────────────
  const isUserPlayer = (team: typeof league.teams[0] | null) => team?.id === userTeamId;
  const isRookie     = (p: Player) => (league.season - (p.draftInfo?.year ?? league.season)) <= 2;
  const isInjured    = (p: Player) => p.status === 'Injured';
  const isHoF        = (p: Player) => p.careerStats.length >= 10 && p.rating >= 88;

  const rowBg = (p: Player, team: typeof league.teams[0] | null) => {
    if (isHoF(p))         return 'bg-amber-500/5 hover:bg-amber-500/10';
    if (isUserPlayer(team)) return 'bg-sky-500/5 hover:bg-sky-500/10';
    return 'hover:bg-slate-800/40';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-40">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -ml-40 -mt-40 pointer-events-none" />
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-1">Players</h2>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {sorted.length} players — Season {league.season}
              </p>
            </div>
            {/* Sub-tabs */}
            <div className="flex gap-2">
              {(['ratings', 'bios'] as SubTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setSubTab(t); setSortKey(t === 'ratings' ? 'rating' : 'name'); setSortDir(t === 'ratings' ? 'desc' : 'asc'); resetPage(); }}
                  className={`text-[10px] font-black uppercase tracking-widest px-5 py-2 rounded-full transition-all ${
                    subTab === t ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Filter Bar ─────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <input
              type="text"
              placeholder="Search player..."
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50 w-48"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
            />
            {/* Team */}
            <select
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-black text-slate-400 focus:outline-none focus:border-amber-500/50"
              value={teamFilter}
              onChange={e => { setTeamFilter(e.target.value); resetPage(); }}
            >
              <option value="ALL">All Teams</option>
              <option value="FA">Free Agents</option>
              {league.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {/* Position pills */}
            <div className="flex gap-1">
              {(['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as Array<'ALL' | Position>).map(pos => (
                <button
                  key={pos}
                  onClick={() => { setPosFilter(pos); resetPage(); }}
                  className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-all ${
                    posFilter === pos ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            {/* Age range */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
              <span className="text-slate-500 font-black uppercase">Age</span>
              <input type="number" placeholder="Min" className="w-12 bg-transparent text-slate-300 focus:outline-none text-center" value={minAge} onChange={e => { setMinAge(e.target.value); resetPage(); }} />
              <span className="text-slate-600">–</span>
              <input type="number" placeholder="Max" className="w-12 bg-transparent text-slate-300 focus:outline-none text-center" value={maxAge} onChange={e => { setMaxAge(e.target.value); resetPage(); }} />
            </div>
            {/* OVR range */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
              <span className="text-slate-500 font-black uppercase">OVR</span>
              <input type="number" placeholder="Min" className="w-12 bg-transparent text-slate-300 focus:outline-none text-center" value={minOvr} onChange={e => { setMinOvr(e.target.value); resetPage(); }} />
              <span className="text-slate-600">–</span>
              <input type="number" placeholder="Max" className="w-12 bg-transparent text-slate-300 focus:outline-none text-center" value={maxOvr} onChange={e => { setMaxOvr(e.target.value); resetPage(); }} />
            </div>
            {/* Toggles */}
            <button
              onClick={() => { setFaOnly(v => !v); setMyTeamOnly(false); resetPage(); }}
              className={`text-[10px] font-black uppercase px-3 py-2 rounded-lg border transition-all ${faOnly ? 'bg-amber-500 text-slate-950 border-amber-500' : 'border-slate-700 text-slate-500 hover:text-white'}`}
            >FA Only</button>
            <button
              onClick={() => { setMyTeamOnly(v => !v); setFaOnly(false); resetPage(); }}
              className={`text-[10px] font-black uppercase px-3 py-2 rounded-lg border transition-all ${myTeamOnly ? 'bg-sky-500 text-slate-950 border-sky-500' : 'border-slate-700 text-slate-500 hover:text-white'}`}
            >My Team</button>
            {/* Clear */}
            {(search || teamFilter !== 'ALL' || posFilter !== 'ALL' || minAge || maxAge || minOvr || maxOvr || faOnly || myTeamOnly) && (
              <button
                onClick={() => { setSearch(''); setTeamFilter('ALL'); setPosFilter('ALL'); setMinAge(''); setMaxAge(''); setMinOvr(''); setMaxOvr(''); setFaOnly(false); setMyTeamOnly(false); resetPage(); }}
                className="text-[10px] font-black uppercase px-3 py-2 rounded-lg text-slate-600 hover:text-rose-400 transition-colors"
              >✕ Clear</button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Table ──────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {subTab === 'ratings' ? (
                <>
                  {/* Group label row */}
                  <tr className="text-[9px] font-black uppercase tracking-widest bg-slate-950/70 border-b border-slate-800/50">
                    <th colSpan={6} />
                    <th colSpan={6} className="px-2 py-1 text-center text-amber-500/60 border-l border-slate-800/40">Scoring & Shooting</th>
                    <th colSpan={6} className="px-2 py-1 text-center text-sky-500/60 border-l border-slate-800/40">Defense & Boards</th>
                    <th colSpan={4} className="px-2 py-1 text-center text-emerald-500/60 border-l border-slate-800/40">IQ & Playmaking</th>
                    <th colSpan={5} className="px-2 py-1 text-center text-violet-500/60 border-l border-slate-800/40">Physicality</th>
                  </tr>
                  <tr className="text-slate-500 bg-slate-950/50 border-b border-slate-800">
                    <th className="w-8 px-2 py-2 text-center text-[9px] font-black text-slate-600">#</th>
                    <Th k="name"     label="Name" />
                    <Th k="position" label="Pos" />
                    <Th k="teamName" label="Team" />
                    <Th k="age"      label="Age" />
                    <Th k="rating"   label="OVR" />
                    <Th k="shooting"      label="SHT" title="Shooting" />
                    <Th k="layups" label="LAY" title="Layups" />
                    <Th k="dunks" label="DNK" title="Dunks" />
                    <Th k="shootingMid"   label="MID" title="Mid-Range" />
                    <Th k="shooting3pt"   label="3PT" title="3-Point" />
                    <Th k="freeThrow"     label="FT"  title="Free Throw" />
                    <Th k="postScoring"   label="POST" title="Post Scoring" />
                    <Th k="defense"       label="DEF" title="Defense" />
                    <Th k="perimeterDef"  label="PER" title="Perimeter Defense" />
                    <Th k="interiorDef"   label="INT" title="Interior Defense" />
                    <Th k="steals"        label="STL" title="Steals" />
                    <Th k="blocks"        label="BLK" title="Blocks" />
                    <Th k="rebounding"    label="REB" title="Rebounding" />
                    <Th k="offensiveIQ"   label="OIQ" title="Offensive IQ" />
                    <Th k="defensiveIQ"   label="DIQ" title="Defensive IQ" />
                    <Th k="passing"       label="PASS" title="Passing" />
                    <Th k="ballHandling"  label="BH"  title="Ball Handling" />
                    <Th k="athleticism"   label="ATH" title="Athleticism" />
                    <Th k="speed"         label="SPD" title="Speed" />
                    <Th k="strength"      label="STR" title="Strength" />
                    <Th k="jumping"       label="VRT" title="Vertical / Jumping" />
                    <Th k="stamina"       label="STA" title="Stamina" />
                  </tr>
                </>
              ) : (
                <tr className="text-slate-500 bg-slate-950/50 border-b border-slate-800">
                  <th className="w-8 px-2 py-2 text-center text-[9px] font-black text-slate-600">#</th>
                  <Th k="name"       label="Name" />
                  <Th k="position"   label="Pos" />
                  <Th k="jerseyNumber" label="#" title="Jersey Number" />
                  <Th k="teamName"   label="Team" />
                  <Th k="age"        label="Age" />
                  <Th k="height"     label="Ht" title="Height" />
                  <Th k="weight"     label="Wt" title="Weight (lbs)" />
                  <th className="px-2 py-2 text-[9px] font-black text-slate-500 uppercase text-center whitespace-nowrap">Personality</th>
                  <Th k="salary"     label="Salary" />
                  <Th k="contractYears" label="Exp" title="Contract years remaining" />
                  <Th k="morale"     label="Mood" />
                  <Th k="country"    label="Country" />
                  <Th k="college"    label="College" />
                  <Th k="draftYear"  label="Draft Yr" />
                  <Th k="draftPick"  label="Pick" />
                  <Th k="seasonsPro" label="Pro Yrs" title="Seasons Pro" />
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {paged.map(({ player: p, team, isFreeAgent }, idx) => {
                const globalRank = page * pageSize + idx;
                const rookie = isRookie(p);
                const injured = isInjured(p);
                const hof = isHoF(p);
                const seasonsPro = league.season - (p.draftInfo?.year ?? league.season);
                const pot = POT_GRADE(p.potential);
                const traits = (p.personalityTraits || []).slice(0, 3);

                return (
                  <tr
                    key={p.id}
                    className={`cursor-pointer transition-all ${rowBg(p, team)}`}
                    onClick={() => onViewPlayer(p)}
                  >
                    {/* Rank */}
                    <td className="px-2 py-2.5 text-center text-[10px] text-slate-600 font-mono">
                      {hof && <span title="Hall of Fame caliber" className="text-amber-500">★</span>}
                      {!hof && globalRank + 1}
                    </td>

                    {/* Name */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {rookie  && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Rookie (≤2 seasons pro)" />}
                        {injured && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title={`Injured: ${p.injuryType}`} />}
                        <span className="font-bold text-slate-200 text-xs uppercase tracking-tight">{p.name}</span>
                        {subTab === 'ratings' && traits.map(trait => (
                          <span
                            key={trait}
                            title={trait}
                            className={`text-[8px] px-1 py-0.5 rounded font-black ${TRAIT_COLORS[trait]}`}
                          >
                            {TRAIT_ABBR[trait] ?? trait.slice(0, 2).toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Position */}
                    <td className="px-1 py-2.5 text-center text-[10px] font-black text-slate-400 uppercase">{p.position}</td>

                    {subTab === 'ratings' ? (
                      <>
                        {/* Team */}
                        <td className="px-2 py-2.5 text-center">
                          {isFreeAgent
                            ? <span className="text-[9px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">FA</span>
                            : team ? <TeamBadge team={team} size="xs" /> : null
                          }
                        </td>
                        {/* Age */}
                        <td className="px-1 py-2.5 text-center text-xs font-mono text-slate-400">{p.age}</td>
                        {/* OVR */}
                        <td className={`px-1 py-2.5 text-center text-sm font-display font-bold ${attrColor(p.rating)}`}>{p.rating}</td>
                        {/* Scoring & Shooting */}
                        {(['shooting','layups','dunks','shootingMid','shooting3pt','freeThrow','postScoring'] as const).map(k => (
                          <td key={k} className={`px-1 py-2.5 text-center text-xs font-mono ${attrColor(p.attributes[k])}`}>
                            {p.attributes[k]}
                          </td>
                        ))}
                        {/* Defense & Boards */}
                        {(['defense','perimeterDef','interiorDef','steals','blocks','rebounding'] as const).map(k => (
                          <td key={k} className={`px-1 py-2.5 text-center text-xs font-mono ${attrColor(p.attributes[k])}`}>
                            {p.attributes[k]}
                          </td>
                        ))}
                        {/* IQ & Playmaking */}
                        {(['offensiveIQ','defensiveIQ','passing','ballHandling'] as const).map(k => (
                          <td key={k} className={`px-1 py-2.5 text-center text-xs font-mono ${attrColor(p.attributes[k])}`}>
                            {p.attributes[k]}
                          </td>
                        ))}
                        {/* Physicality */}
                        {(['athleticism','speed','strength','jumping','stamina'] as const).map(k => (
                          <td key={k} className={`px-1 py-2.5 text-center text-xs font-mono ${attrColor(p.attributes[k])}`}>
                            {p.attributes[k]}
                          </td>
                        ))}
                        {/* POT */}
                      </>
                    ) : (
                      <>
                        {/* Jersey # */}
                        <td className="px-1 py-2.5 text-center text-xs font-mono text-slate-500">#{p.jerseyNumber}</td>
                        {/* Team */}
                        <td className="px-2 py-2.5 text-center">
                          {isFreeAgent
                            ? <span className="text-[9px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">FA</span>
                            : team ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <TeamBadge team={team} size="xs" />
                                <span className="text-[9px] font-black text-slate-500 uppercase hidden lg:block">{team.abbreviation}</span>
                              </div>
                            ) : null
                          }
                        </td>
                        {/* Age */}
                        <td className="px-1 py-2.5 text-center text-xs font-mono text-slate-400">{p.age}</td>
                        {/* Height */}
                        <td className="px-2 py-2.5 text-center text-xs font-mono text-slate-300 whitespace-nowrap">{p.height}</td>
                        {/* Weight */}
                        <td className="px-1 py-2.5 text-center text-xs font-mono text-slate-400">{p.weight}</td>
                        {/* Personality */}
                        <td className="px-2 py-2.5 max-w-[160px]">
                          <div className="flex flex-wrap gap-1">
                            {(p.personalityTraits || []).map(trait => (
                              <span
                                key={trait}
                                title={trait}
                                className={`text-[8px] px-1.5 py-0.5 rounded font-black whitespace-nowrap ${TRAIT_COLORS[trait]}`}
                              >
                                {TRAIT_ABBR[trait] ?? trait.slice(0, 2).toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </td>
                        {/* Contract */}
                        <td className="px-2 py-2.5 text-center whitespace-nowrap">
                          <span className="text-[10px] font-black text-slate-300">
                            ${(p.salary / 1_000_000).toFixed(1)}M
                          </span>
                          <span className="text-[9px] text-slate-600 ml-1">/{p.contractYears}yr</span>
                        </td>
                        {/* Exp (remaining years) */}
                        <td className="px-1 py-2.5 text-center text-xs font-mono text-slate-400">{p.contractYears}</td>
                        {/* Mood / Morale */}
                        <td className="px-2 py-2.5 text-center whitespace-nowrap">
                          <span className={`text-xs font-bold ${p.morale >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {p.morale >= 50 ? '▲' : '▼'} {p.morale}
                          </span>
                        </td>
                        {/* Country */}
                        <td className="px-2 py-2.5 text-center text-[10px] text-slate-400 whitespace-nowrap">
                          {p.country || '—'}
                        </td>
                        {/* College */}
                        <td className="px-2 py-2.5 text-[10px] text-slate-400 max-w-[120px] truncate whitespace-nowrap">
                          {p.college || '—'}
                        </td>
                        {/* Draft Year */}
                        <td className="px-1 py-2.5 text-center text-xs font-mono text-slate-400">
                          {p.draftInfo?.year ?? '—'}
                        </td>
                        {/* Draft Pick */}
                        <td className="px-2 py-2.5 text-center text-[10px] text-slate-400 whitespace-nowrap">
                          {p.draftInfo ? `R${p.draftInfo.round} #${p.draftInfo.pick}` : '—'}
                        </td>
                        {/* Seasons Pro */}
                        <td className="px-1 py-2.5 text-center text-xs font-mono text-slate-400">
                          {Math.max(0, seasonsPro)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={30} className="py-20 text-center text-slate-600 font-display uppercase tracking-widest text-lg">
                    No players match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination footer ──────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-slate-800/60 bg-slate-950/30">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-500 uppercase">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length} players
            </span>
            <div className="flex gap-1 items-center">
              <span className="text-[9px] font-black text-slate-600 uppercase">Per page</span>
              {PAGE_SIZES.map(n => (
                <button
                  key={n}
                  onClick={() => { setPageSize(n); setPage(0); }}
                  className={`text-[9px] px-2 py-1 rounded font-black transition-all ${pageSize === n ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                >{n}</button>
              ))}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-[9px] font-black uppercase rounded-lg bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
              >Prev</button>
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                const pageIdx = totalPages <= 10 ? i : Math.max(0, Math.min(page - 4, totalPages - 10)) + i;
                return (
                  <button
                    key={pageIdx}
                    onClick={() => setPage(pageIdx)}
                    className={`w-7 h-7 text-[9px] font-black rounded-lg transition-colors ${pageIdx === page ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
                  >{pageIdx + 1}</button>
                );
              })}
              <button
                disabled={page === totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-[9px] font-black uppercase rounded-lg bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
              >Next</button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Legend ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 px-2 text-[9px] font-black text-slate-600 uppercase tracking-widest">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Rookie (≤2 seasons)</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Injured</span>
        <span className="flex items-center gap-1.5"><span className="w-8 h-3 rounded bg-sky-500/10 inline-block border border-sky-500/20" /> Your team</span>
        <span className="flex items-center gap-1.5"><span className="w-8 h-3 rounded bg-amber-500/10 inline-block border border-amber-500/20" /> HOF caliber</span>
        <span className="flex items-center gap-1.5"><span className="text-amber-400">★</span> = Hall of Fame caliber rank</span>
      </div>
    </div>
  );
};

// ─── Sort value extractor ────────────────────────────────────
function getSortVal(
  key: string,
  p: Player,
  team: { id: string; name: string; abbreviation: string } | null,
  league: LeagueState
): number | string {
  switch (key) {
    case 'name':          return p.name;
    case 'position':      return p.position;
    case 'teamName':      return team?.name ?? 'ZZZ';
    case 'age':           return p.age;
    case 'rating':        return p.rating;
    case 'potential':     return p.potential;
    case 'salary':        return p.salary;
    case 'contractYears': return p.contractYears;
    case 'morale':        return p.morale;
    case 'jerseyNumber':  return p.jerseyNumber;
    case 'height':        return p.height;
    case 'weight':        return p.weight;
    case 'country':       return p.country ?? '';
    case 'college':       return p.college ?? '';
    case 'draftYear':     return p.draftInfo?.year ?? 0;
    case 'draftPick':     return (p.draftInfo?.round ?? 9) * 100 + (p.draftInfo?.pick ?? 99);
    case 'seasonsPro':    return league.season - (p.draftInfo?.year ?? league.season);
    default:
      return (p.attributes as any)[key] ?? 0;
  }
}

export default Players;
