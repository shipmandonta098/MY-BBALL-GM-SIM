import React, { useState, useMemo } from 'react';
import { LeagueState, Team, GameResult, ChampionshipRecord, SeasonAwards, AwardWinner, RivalryStats } from '../types';
import TeamBadge from './TeamBadge';
import { Trophy, Calendar, Target, TrendingUp, ChevronDown, ChevronUp, History as HistoryIcon, Star, ChevronRight } from 'lucide-react';

interface FranchiseHistoryProps {
  league: LeagueState;
  initialTeamId?: string;
  onBack?: () => void;
  /** Controls which sub-tab opens by default. Defaults to 'franchise'. */
  initialView?: HistoryView;
  /** When true, hides the internal Franchise/League switcher (used when the parent nav already handles tab routing). */
  hideViewSwitcher?: boolean;
}

interface SeasonRecord {
  year: number;
  wins: number;
  losses: number;
  winPct: string;
  playoffResult: string;
  isChampion: boolean;
  coach: string;
}

type HistoryView = 'franchise' | 'league';
type LeagueSortKey = 'year' | 'champion' | 'runnerUp' | 'finalsMvp' | 'mvp' | 'dpoy' | 'smoy' | 'mip' | 'roy';

const FranchiseHistory: React.FC<FranchiseHistoryProps> = ({ league, initialTeamId, onBack, initialView = 'franchise', hideViewSwitcher = false }) => {
  const [historyView, setHistoryView] = useState<HistoryView>(initialView);
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || league.userTeamId);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SeasonRecord; direction: 'asc' | 'desc' }>({
    key: 'year',
    direction: 'desc',
  });
  const [leagueSortConfig, setLeagueSortConfig] = useState<{ key: LeagueSortKey; direction: 'asc' | 'desc' }>({
    key: 'year',
    direction: 'desc',
  });
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());

  const selectedTeam = useMemo(() =>
    league.teams.find(t => t.id === selectedTeamId) || league.teams[0]
  , [league.teams, selectedTeamId]);

  // ─── Franchise-view data ────────────────────────────────────────────────────

  /** Parse a coach name out of a hiring transaction description. */
  const parseCoachName = (desc: string): string => {
    const m = desc.match(/(?:hired|named|promoted)\s+(.+?)\s+(?:as\s|to\s|Interim)/i);
    if (m?.[1]) return m[1].trim();
    // Fallback: strip team name prefix and trailing "Head Coach." suffix
    return desc.replace(/\.$/, '').split(' ').slice(1, -3).join(' ') || '—';
  };

  /**
   * Build a Map<seasonYear, coachName> using chronological hiring events.
   * We sort hirings by realTimestamp (wall-clock order) and assign them to
   * seasons proportionally, since game timestamps reset each season and
   * cannot be used to identify which season a hiring occurred in.
   */
  const coachBySeason = useMemo(() => {
    const result = new Map<number, string>();
    const hirings = (league.transactions ?? [])
      .filter(tx => tx.type === 'hiring' && tx.teamIds.includes(selectedTeamId))
      .sort((a, b) => a.realTimestamp - b.realTimestamp);

    const sortedYears = [...(league.history.map(g => g.season)).concat([league.season])]
      .filter((y, i, arr) => arr.indexOf(y) === i)
      .sort((a, b) => a - b);

    sortedYears.forEach((year, idx) => {
      if (hirings.length === 0) {
        result.set(year, selectedTeam.staff?.headCoach?.name ?? '—');
        return;
      }
      // Proportionally map season index to hiring index
      const hiringIdx = Math.min(hirings.length - 1, Math.floor(idx * hirings.length / sortedYears.length));
      result.set(year, parseCoachName(hirings[hiringIdx].description));
    });

    // Always use actual live coach for the current season
    const currentCoach = selectedTeam.staff?.headCoach?.name;
    if (currentCoach) result.set(league.season, currentCoach);

    return result;
  }, [league.transactions, league.history, league.season, selectedTeamId, selectedTeam]);

  const seasonRecords = useMemo(() => {
    const records: SeasonRecord[] = [];
    const seasons: number[] = Array.from<number>(new Set(league.history.map(g => g.season))).sort((a: number, b: number) => b - a);

    const currentSeason = league.season;
    if (!seasons.includes(currentSeason)) seasons.unshift(currentSeason);

    seasons.forEach(year => {
      const seasonGames = league.history.filter(g => g.season === year && (g.homeTeamId === selectedTeamId || g.awayTeamId === selectedTeamId));
      let wins = 0; let losses = 0;

      if (year === league.season) {
        wins = selectedTeam.wins;
        losses = selectedTeam.losses;
      } else {
        seasonGames.forEach(g => {
          const isHome = g.homeTeamId === selectedTeamId;
          const won = isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
          if (won) wins++; else losses++;
        });
      }

      const winPct = (wins + losses > 0) ? (wins / (wins + losses)).toFixed(3) : '.000';
      const isChampion = league.championshipHistory?.some(c => c.year === year && c.championId === selectedTeamId) || false;
      const seasonComplete = league.championshipHistory?.some(c => c.year === year) ||
                             (year < league.season) ||
                             (year === league.season && league.isOffseason);

      let playoffResult: string;
      if (!seasonComplete) {
        // Season has not concluded yet — don't assume missed playoffs
        playoffResult = wins + losses === 0 ? 'Not Started' : 'In Progress';
      } else if (isChampion) {
        playoffResult = 'Won Championship';
      } else {
        const runnerUp = league.championshipHistory?.find(c => c.year === year && c.runnerUpId === selectedTeamId);
        if (runnerUp) {
          playoffResult = 'Lost Finals';
        } else if (league.awardHistory?.find(a => a.year === year)) {
          playoffResult = wins + losses >= 82 && wins > 41 ? 'Playoffs' : 'Missed Playoffs';
        } else {
          playoffResult = 'Missed Playoffs';
        }
      }

      const coach = coachBySeason.get(year) ?? '—';
      records.push({ year, wins, losses, winPct, playoffResult, isChampion, coach });
    });

    return records;
  }, [league.history, league.season, league.championshipHistory, selectedTeamId, selectedTeam, league.awardHistory, league.isOffseason, coachBySeason]);

  const sortedRecords = useMemo(() => {
    const sorted = [...seasonRecords];
    sorted.sort((a, b) => {
      const aVal = a[sortConfig.key]; const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [seasonRecords, sortConfig]);

  const vitals = useMemo(() => {
    const totalWins = seasonRecords.reduce((acc, r) => acc + r.wins, 0);
    const totalLosses = seasonRecords.reduce((acc, r) => acc + r.losses, 0);
    const winPct = (totalWins + totalLosses > 0) ? (totalWins / (totalWins + totalLosses)).toFixed(3) : '.000';
    const championships = seasonRecords.filter(r => r.isChampion).map(r => r.year);
    const playoffApps = seasonRecords.filter(r => r.playoffResult !== 'Missed Playoffs').length;
    const startYear = seasonRecords.length > 0 ? Math.min(...seasonRecords.map(r => r.year)) : league.season;
    const endYear = league.season;
    return {
      totalWins, totalLosses, winPct, championships, playoffApps,
      years: `${seasonRecords.length}; ${startYear-1}-${startYear.toString().slice(-2)} to ${endYear-1}-${endYear.toString().slice(-2)}`
    };
  }, [seasonRecords, league.season]);

  const teamAwards = useMemo(() => {
    const awardDefs: { key: keyof SeasonAwards; label: string; icon: string }[] = [
      { key: 'mvp',       label: 'MVP',              icon: '🏆' },
      { key: 'dpoy',      label: 'Def. Player of Year', icon: '🛡️' },
      { key: 'roy',       label: 'Rookie of Year',   icon: '🌟' },
      { key: 'sixthMan',  label: '6th Man of Year',  icon: '⚡' },
      { key: 'mip',       label: 'Most Improved',    icon: '📈' },
      { key: 'coy',       label: 'Coach of Year',    icon: '🎯' },
    ];
    return (league.awardHistory ?? []).flatMap(season =>
      awardDefs.flatMap(({ key, label, icon }) => {
        const winner = season[key] as AwardWinner | undefined;
        if (!winner || winner.teamId !== selectedTeamId) return [];
        return [{ year: season.year, award: label, icon, name: winner.name, statsLabel: winner.statsLabel ?? '' }];
      })
    ).sort((a, b) => b.year - a.year);
  }, [league.awardHistory, selectedTeamId]);

  const coachHistory = useMemo(() => {
    return (league.transactions ?? [])
      .filter(tx => (tx.type === 'hiring' || tx.type === 'firing') && tx.teamIds.includes(selectedTeamId))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [league.transactions, selectedTeamId]);

  const keyTimeline = useMemo(() => {
    type TimelineEvent = { day: number; icon: string; label: string; colour: string };
    const events: TimelineEvent[] = [];
    (league.championshipHistory ?? []).forEach(c => {
      const day = c.year * 82;
      if (c.championId === selectedTeamId)
        events.push({ day, icon: '🏆', label: `${c.year-1}-${c.year.toString().slice(-2)} — Won Championship (${c.seriesScore} vs ${c.runnerUpName})`, colour: 'text-amber-400' });
      else if (c.runnerUpId === selectedTeamId)
        events.push({ day, icon: '🥈', label: `${c.year-1}-${c.year.toString().slice(-2)} — Lost Finals vs ${c.championName}`, colour: 'text-slate-300' });
    });
    teamAwards.forEach(a =>
      events.push({ day: a.year * 82, icon: a.icon, label: `${a.year-1}-${a.year.toString().slice(-2)} — ${a.name} wins ${a.award} (${a.statsLabel})`, colour: 'text-slate-300' })
    );
    coachHistory.forEach(tx =>
      events.push({ day: tx.timestamp, icon: tx.type === 'hiring' ? '✅' : '🚫', label: tx.description, colour: tx.type === 'hiring' ? 'text-emerald-400' : 'text-rose-400' })
    );
    return events.sort((a, b) => b.day - a.day);
  }, [league.championshipHistory, teamAwards, coachHistory, selectedTeamId]);

  const handleSort = (key: keyof SeasonRecord) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // ─── League Season Summaries data ──────────────────────────────────────────

  // Completed seasons: have awards AND (not current season unless offseason)
  const seasonSummaries = useMemo(() => {
    const awardMap = new Map<number, SeasonAwards>();
    (league.awardHistory ?? []).forEach(a => awardMap.set(a.year, a));
    const champMap = new Map<number, ChampionshipRecord>();
    (league.championshipHistory ?? []).forEach(c => champMap.set(c.year, c));

    // A season is "complete" when the championship has been decided
    // Fall back to award years where year < current (in case of legacy saves without champ records)
    const years = new Set<number>();
    champMap.forEach((_, y) => years.add(y));
    // For legacy saves: also include award years < current season that have no champ record
    // (shows award data but championship columns show "—")
    awardMap.forEach((_, y) => {
      if (y < league.season || league.isOffseason) years.add(y);
    });

    return Array.from(years)
      .filter(y => awardMap.has(y))   // must have awards at minimum
      .map(y => ({ year: y, awards: awardMap.get(y)!, champ: champMap.get(y) }))
      .sort((a, b) => b.year - a.year);
  }, [league.awardHistory, league.championshipHistory, league.season, league.isOffseason]);

  const sortedSummaries = useMemo(() => {
    const getVal = (row: typeof seasonSummaries[0], key: LeagueSortKey): string => {
      switch (key) {
        case 'year':       return String(row.year);
        case 'champion':   return row.champ?.championName ?? '';
        case 'runnerUp':   return row.champ?.runnerUpName ?? '';
        case 'finalsMvp':  return row.champ?.finalsMvp ?? '';
        case 'mvp':        return row.awards.mvp?.name ?? '';
        case 'dpoy':       return row.awards.dpoy?.name ?? '';
        case 'smoy':       return row.awards.sixthMan?.name ?? '';
        case 'mip':        return row.awards.mip?.name ?? '';
        case 'roy':        return row.awards.roy?.name ?? '';
        default:           return '';
      }
    };
    return [...seasonSummaries].sort((a, b) => {
      const av = getVal(a, leagueSortConfig.key);
      const bv = getVal(b, leagueSortConfig.key);
      const cmp = leagueSortConfig.key === 'year' ? Number(av) - Number(bv) : av.localeCompare(bv);
      return leagueSortConfig.direction === 'desc' ? -cmp : cmp;
    });
  }, [seasonSummaries, leagueSortConfig]);

  const handleLeagueSort = (key: LeagueSortKey) => {
    setLeagueSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const toggleExpand = (year: number) => {
    setExpandedSeasons(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  };

  const SortIcon = ({ col, current, dir }: { col: string; current: string; dir: 'asc' | 'desc' }) =>
    col === current
      ? (dir === 'desc' ? <ChevronDown size={10} className="inline ml-0.5" /> : <ChevronUp size={10} className="inline ml-0.5" />)
      : <ChevronDown size={10} className="inline ml-0.5 opacity-20" />;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          {onBack && (
            <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors">
              <ChevronDown className="rotate-90" />
            </button>
          )}
          <div className="flex items-center gap-6">
            {historyView === 'franchise' && <TeamBadge team={selectedTeam} size="xl" />}
            {historyView === 'league' && <Star size={40} className="text-amber-500" />}
            <div>
              <h1 className="text-5xl font-display font-black text-white uppercase tracking-tighter leading-none">
                {historyView === 'franchise'
                  ? <>{selectedTeam.city} <span className="text-amber-500">{selectedTeam.name}</span></>
                  : <>League <span className="text-amber-500">Season Log</span></>}
              </h1>
              <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs mt-2">
                {historyView === 'franchise' ? 'Franchise History & Legacy' : 'All-Time Season Summaries'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 items-end">
          {/* View switcher — hidden when parent nav already handles routing */}
          {!hideViewSwitcher && (
            <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
              <button
                onClick={() => setHistoryView('franchise')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  historyView === 'franchise' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Franchise
              </button>
              <button
                onClick={() => setHistoryView('league')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  historyView === 'league' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Season Log
              </button>
            </div>
          )}

          {/* Franchise selector — only in franchise view */}
          {historyView === 'franchise' && (
            <div className="w-full md:w-72">
              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 ml-1">Select Franchise</label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors appearance-none cursor-pointer"
              >
                {league.teams.sort((a,b) => a.city.localeCompare(b.city)).map(t => (
                  <option key={t.id} value={t.id}>{t.city} {t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          FRANCHISE VIEW
      ════════════════════════════════════════════════════════════════ */}
      {historyView === 'franchise' && (
        <>
          {/* Vitals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Calendar size={64} className="text-amber-500" />
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Seasons</p>
              <p className="text-2xl font-display font-bold text-white">{vitals.years}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Target size={64} className="text-emerald-500" />
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">All-Time Record</p>
              <p className="text-2xl font-display font-bold text-white">
                {vitals.totalWins}-{vitals.totalLosses} <span className="text-slate-500 text-lg ml-2">{vitals.winPct}</span>
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp size={64} className="text-blue-500" />
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Playoff Appearances</p>
              <p className="text-4xl font-display font-bold text-white">{vitals.playoffApps}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Trophy size={64} className="text-amber-500" />
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Championships</p>
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-display font-bold text-amber-500">{vitals.championships.length}</p>
                {vitals.championships.length > 0 && (
                  <p className="text-[10px] font-mono text-slate-500 uppercase">{vitals.championships.join(', ')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Season Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div className="flex items-center gap-3">
                <HistoryIcon className="text-amber-500" size={20} />
                <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">Season-by-Season Results</h3>
              </div>
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">via Hoops Dynasty Sim</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="px-8 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('year')}>
                      <div className="flex items-center gap-2">Season {sortConfig.key === 'year' && (sortConfig.direction === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}</div>
                    </th>
                    <th className="px-8 py-4">Record (W-L)</th>
                    <th className="px-8 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('winPct')}>
                      <div className="flex items-center gap-2">Win % {sortConfig.key === 'winPct' && (sortConfig.direction === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}</div>
                    </th>
                    <th className="px-8 py-4">Coach</th>
                    <th className="px-8 py-4">Playoff Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {sortedRecords.map((record) => (
                    <tr
                      key={record.year}
                      className={`group transition-colors ${record.isChampion ? 'bg-amber-500/10 hover:bg-amber-500/20' : 'hover:bg-slate-800/30'}`}
                    >
                      <td className="px-8 py-5 font-display font-bold text-white text-lg">
                        {record.year-1}-{record.year.toString().slice(-2)}
                      </td>
                      <td className="px-8 py-5 font-mono text-slate-300">{record.wins}-{record.losses}</td>
                      <td className="px-8 py-5 font-mono text-slate-400">{record.winPct}</td>
                      <td className="px-8 py-5 text-sm text-slate-300 font-medium">{record.coach}</td>
                      <td className="px-8 py-5">
                        <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          record.isChampion ? 'bg-amber-500 text-slate-950' :
                          record.playoffResult === 'Lost Finals' ? 'bg-slate-700 text-white' :
                          record.playoffResult === 'Playoffs' ? 'bg-slate-800 text-slate-300' :
                          record.playoffResult === 'In Progress' ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50' :
                          record.playoffResult === 'Not Started' ? 'text-slate-700' :
                          'text-slate-600'
                        }`}>
                          {record.playoffResult}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Awards Won */}
          {teamAwards.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50">
                <Trophy className="text-amber-500" size={20} />
                <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">Awards &amp; Honours</h3>
              </div>
              <div className="divide-y divide-slate-800/40">
                {teamAwards.map((a, i) => (
                  <div key={i} className="flex items-center gap-5 px-8 py-4 hover:bg-slate-800/20 transition-colors">
                    <span className="text-2xl w-8 text-center">{a.icon}</span>
                    <div className="flex-1">
                      <p className="font-display font-bold text-white uppercase text-sm">{a.name}</p>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{a.award} · {a.statsLabel}</p>
                    </div>
                    <span className="font-mono text-xs text-amber-500 font-bold">{a.year-1}-{a.year.toString().slice(-2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coach History */}
          {coachHistory.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50">
                <HistoryIcon className="text-blue-400" size={20} />
                <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">Coach History</h3>
              </div>
              <div className="divide-y divide-slate-800/40">
                {coachHistory.map(tx => (
                  <div key={tx.id} className="flex items-start gap-5 px-8 py-4 hover:bg-slate-800/20 transition-colors">
                    <span className="text-lg mt-0.5">{tx.type === 'hiring' ? '✅' : '🚫'}</span>
                    <p className={`text-sm flex-1 ${tx.type === 'hiring' ? 'text-emerald-300' : 'text-rose-300'}`}>{tx.description}</p>
                    <span className="font-mono text-[10px] text-slate-600 whitespace-nowrap">Day {tx.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Events Timeline */}
          {keyTimeline.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50">
                <TrendingUp className="text-purple-400" size={20} />
                <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">Franchise Timeline</h3>
              </div>
              <div className="relative px-8 py-6 space-y-4">
                <div className="absolute left-[3.5rem] top-0 bottom-0 w-px bg-slate-800 pointer-events-none" />
                {keyTimeline.map((ev, i) => (
                  <div key={i} className="flex items-start gap-5 relative">
                    <span className="z-10 text-lg w-8 text-center shrink-0">{ev.icon}</span>
                    <p className={`text-sm leading-relaxed ${ev.colour}`}>{ev.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Head-to-Head Records */}
          <FranchiseH2H league={league} selectedTeam={selectedTeam} />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          LEAGUE SEASON LOG VIEW
      ════════════════════════════════════════════════════════════════ */}
      {historyView === 'league' && (
        <>
          {seasonSummaries.length === 0 ? (
            <div className="py-40 text-center border-2 border-dashed border-slate-800 rounded-[3rem] text-slate-700">
              <Trophy size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-display text-3xl uppercase tracking-tighter mb-2 opacity-50">No Completed Seasons</p>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Finish a full season and playoffs to see data here.</p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <Trophy className="text-amber-500" size={20} />
                  <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">All-Time Season Summaries</h3>
                  <span className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {seasonSummaries.length} seasons
                  </span>
                </div>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest hidden md:block">Click row to expand · click header to sort</p>
              </div>

              {/* Scrollable table — mobile gets horizontal scroll */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" style={{ minWidth: '900px' }}>
                  <thead>
                    <tr className="bg-slate-950/60 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                      {(
                        [
                          { key: 'year',      label: 'Season' },
                          { key: 'champion',  label: 'Champion' },
                          { key: 'runnerUp',  label: 'Runner-Up' },
                          { key: 'finalsMvp', label: 'Finals MVP' },
                          { key: 'mvp',       label: 'MVP' },
                          { key: 'dpoy',      label: 'DPOY' },
                          { key: 'smoy',      label: league.settings.playerGenderRatio === 100 ? 'SWOY' : 'SMOY' },
                          { key: 'mip',       label: 'MIP' },
                          { key: 'roy',       label: 'ROY' },
                        ] as { key: LeagueSortKey; label: string }[]
                      ).map(col => (
                        <th
                          key={col.key}
                          className="px-5 py-4 cursor-pointer hover:text-white transition-colors whitespace-nowrap select-none"
                          onClick={() => handleLeagueSort(col.key)}
                        >
                          {col.label}
                          <SortIcon col={col.key} current={leagueSortConfig.key} dir={leagueSortConfig.direction} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {sortedSummaries.map((row) => {
                      const isExpanded = expandedSeasons.has(row.year);
                      const isChampionUser = row.champ?.championId === league.userTeamId;
                      const isRunnerUpUser = row.champ?.runnerUpId === league.userTeamId;
                      const userInvolved = isChampionUser || isRunnerUpUser;
                      const champTeam = row.champ ? league.teams.find(t => t.id === row.champ!.championId) : undefined;

                      return (
                        <React.Fragment key={row.year}>
                          {/* Main row */}
                          <tr
                            className={`group cursor-pointer transition-colors ${
                              isChampionUser
                                ? 'bg-amber-500/10 hover:bg-amber-500/15'
                                : isRunnerUpUser
                                ? 'bg-slate-800/30 hover:bg-slate-800/50'
                                : 'hover:bg-slate-800/20'
                            }`}
                            onClick={() => toggleExpand(row.year)}
                          >
                            {/* Season year */}
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <ChevronRight
                                  size={14}
                                  className={`text-slate-600 transition-transform shrink-0 ${isExpanded ? 'rotate-90 text-amber-500' : 'group-hover:text-slate-400'}`}
                                />
                                <span className="font-display font-bold text-white text-base">
                                  {row.year-1}-{row.year.toString().slice(-2)}
                                </span>
                                {userInvolved && (
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                    isChampionUser ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-300'
                                  }`}>
                                    {isChampionUser ? '🏆 Champs' : '🥈 Finalist'}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Champion */}
                            <td className="px-5 py-4 whitespace-nowrap">
                              {row.champ ? (
                                <div className="flex items-center gap-2">
                                  {champTeam && <TeamBadge team={champTeam} size="xs" />}
                                  <span className={`text-sm font-bold ${isChampionUser ? 'text-amber-400' : 'text-white'}`}>
                                    {row.champ.championName}
                                  </span>
                                </div>
                              ) : <span className="text-slate-600 text-xs">—</span>}
                            </td>

                            {/* Runner-Up */}
                            <td className="px-5 py-4 whitespace-nowrap">
                              {row.champ ? (
                                <span className={`text-sm ${isRunnerUpUser ? 'text-slate-200 font-bold' : 'text-slate-400'}`}>
                                  {row.champ.runnerUpName}
                                </span>
                              ) : <span className="text-slate-600 text-xs">—</span>}
                            </td>

                            {/* Finals MVP */}
                            <td className="px-5 py-4 whitespace-nowrap">
                              {row.champ?.finalsMvp
                                ? <span className="text-sm text-amber-300 font-semibold">{row.champ.finalsMvp}</span>
                                : <span className="text-slate-600 text-xs">—</span>}
                            </td>

                            {/* Season awards */}
                            {(['mvp', 'dpoy', 'sixthMan', 'mip', 'roy'] as (keyof SeasonAwards)[]).map(key => {
                              const w = row.awards[key] as AwardWinner | undefined;
                              const isUser = w?.teamId === league.userTeamId;
                              return (
                                <td key={key} className="px-5 py-4 whitespace-nowrap">
                                  {w ? (
                                    <div>
                                      <span className={`text-sm ${isUser ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{w.name}</span>
                                      <p className="text-[9px] text-slate-600 truncate max-w-[120px]">{w.teamName}</p>
                                    </div>
                                  ) : <span className="text-slate-600 text-xs">—</span>}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr className={isChampionUser ? 'bg-amber-500/5' : 'bg-slate-950/40'}>
                              <td colSpan={9} className="px-5 pb-5 pt-1">
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 grid grid-cols-1 md:grid-cols-3 gap-5">

                                  {/* Finals result */}
                                  <div>
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">Finals Result</p>
                                    {row.champ ? (
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                          {champTeam && <TeamBadge team={champTeam} size="sm" />}
                                          <div>
                                            <p className="font-display font-bold text-amber-400 text-sm uppercase">{row.champ.championName}</p>
                                            <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Champion · Series {row.champ.seriesScore}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3 opacity-60">
                                          {(() => { const t = league.teams.find(x => x.id === row.champ!.runnerUpId); return t ? <TeamBadge team={t} size="sm" /> : null; })()}
                                          <div>
                                            <p className="font-display font-bold text-slate-300 text-sm uppercase">{row.champ.runnerUpName}</p>
                                            <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Runner-Up</p>
                                          </div>
                                        </div>
                                        <div className="pt-1 flex items-center gap-2">
                                          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Finals MVP:</span>
                                          <span className="text-amber-300 text-sm font-bold">{row.champ.finalsMvp}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-slate-600 text-xs">Championship data not available for this season.</p>
                                    )}
                                  </div>

                                  {/* Individual awards */}
                                  <div>
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">Individual Awards</p>
                                    <div className="space-y-1.5">
                                      {([
                                        { key: 'mvp',      label: 'MVP',   icon: '🏆' },
                                        { key: 'dpoy',     label: 'DPOY',  icon: '🛡️' },
                                        { key: 'sixthMan', label: league.settings.playerGenderRatio === 100 ? 'SWOY' : 'SMOY',  icon: '⚡' },
                                        { key: 'mip',      label: 'MIP',   icon: '📈' },
                                        { key: 'roy',      label: 'ROY',   icon: '🌟' },
                                        { key: 'coy',      label: 'COY',   icon: '🎯' },
                                      ] as { key: keyof SeasonAwards; label: string; icon: string }[]).map(({ key, label, icon }) => {
                                        const w = row.awards[key] as AwardWinner | undefined;
                                        if (!w) return null;
                                        return (
                                          <div key={key} className="flex items-center gap-2">
                                            <span className="text-sm w-5 shrink-0">{icon}</span>
                                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest w-10 shrink-0">{label}</span>
                                            <span className={`text-xs font-bold ${w.teamId === league.userTeamId ? 'text-amber-400' : 'text-slate-300'}`}>{w.name}</span>
                                            <span className="text-[9px] text-slate-600 hidden sm:inline">· {w.statsLabel}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* All-NBA */}
                                  <div>
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">All-League Teams</p>
                                    {row.awards.allNbaFirst?.length > 0 && (
                                      <div className="mb-2">
                                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">1st Team</p>
                                        {row.awards.allNbaFirst.map((name, i) => (
                                          <p key={i} className="text-xs text-slate-300">{name}</p>
                                        ))}
                                      </div>
                                    )}
                                    {row.awards.allNbaSecond?.length > 0 && (
                                      <div className="mb-2">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">2nd Team</p>
                                        {row.awards.allNbaSecond.map((name, i) => (
                                          <p key={i} className="text-xs text-slate-500">{name}</p>
                                        ))}
                                      </div>
                                    )}
                                    {row.awards.allNbaThird?.length > 0 && (
                                      <div>
                                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">3rd Team</p>
                                        {row.awards.allNbaThird.map((name, i) => (
                                          <p key={i} className="text-xs text-slate-600">{name}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile hint */}
              <div className="p-4 border-t border-slate-800 flex items-center justify-between">
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">
                  {sortedSummaries.length} completed season{sortedSummaries.length !== 1 ? 's' : ''} · tap any row to expand
                </p>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600">
                    <span className="w-2 h-2 rounded-sm bg-amber-500/40 inline-block" /> Your title
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    <span className="w-2 h-2 rounded-sm bg-amber-400/20 inline-block" /> Your finalist
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* League-wide H2H records */}
          <LeagueH2H league={league} />
        </>
      )}
    </div>
  );
};

// ─── Franchise H2H table ───────────────────────────────────────────────────────
const FranchiseH2H: React.FC<{ league: LeagueState; selectedTeam: Team }> = ({ league, selectedTeam }) => {
  const [collapsed, setCollapsed] = useState(false);

  const rows = league.teams
    .filter(t => t.id !== selectedTeam.id && t.status !== 'Inactive')
    .map(t => {
      const r = (league.rivalryHistory ?? []).find(
        r => (r.team1Id === selectedTeam.id && r.team2Id === t.id) ||
             (r.team1Id === t.id && r.team2Id === selectedTeam.id)
      );
      const isT1 = r?.team1Id === selectedTeam.id;
      const myW   = r ? (isT1 ? r.team1Wins : r.team2Wins) : 0;
      const oppW  = r ? (isT1 ? r.team2Wins : r.team1Wins) : 0;
      const sMyW  = r?.seasonH2H ? (isT1 ? r.seasonH2H.team1Wins : r.seasonH2H.team2Wins) : 0;
      const sOppW = r?.seasonH2H ? (isT1 ? r.seasonH2H.team2Wins : r.seasonH2H.team1Wins) : 0;
      return { team: t, myW, oppW, sMyW, sOppW, total: myW + oppW };
    })
    .sort((a, b) => {
      if ((a.team.conference === selectedTeam.conference) !== (b.team.conference === selectedTeam.conference))
        return a.team.conference === selectedTeam.conference ? -1 : 1;
      return b.total - a.total;
    });

  const hasSeason = rows.some(r => r.sMyW + r.sOppW > 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
      <button
        className="w-full flex items-center justify-between p-8 border-b border-slate-800 bg-slate-900/50 hover:bg-slate-800/30 transition-colors"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-3">
          <Target className="text-blue-400" size={20} />
          <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">Head-to-Head Records</h3>
          <span className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {selectedTeam.city} {selectedTeam.name}
          </span>
        </div>
        <span className="text-slate-500 text-lg">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/20">
                <th className="px-8 py-3">Opponent</th>
                <th className="px-8 py-3 text-center">All-Time</th>
                {hasSeason && <th className="px-8 py-3 text-center">This Season</th>}
                <th className="px-8 py-3 text-center">Edge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {rows.map(({ team: t, myW, oppW, sMyW, sOppW, total }) => {
                const edge = myW - oppW;
                const dominated    = myW >= 4 && oppW === 0 && total >= 4;
                const dominated_by = oppW >= 4 && myW === 0 && total >= 4;
                const sameConf = t.conference === selectedTeam.conference;
                return (
                  <tr key={t.id} className={`hover:bg-slate-800/20 transition-colors ${sameConf ? '' : 'opacity-60'}`}>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <TeamBadge team={t} size="sm" />
                        <div>
                          <p className="text-sm font-bold text-slate-200">{t.city} {t.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-black uppercase ${t.conference === 'Eastern' ? 'text-blue-500' : 'text-red-500'}`}>
                              {t.conference.slice(0, 4)}
                            </span>
                            {dominated && <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded uppercase">Dominates</span>}
                            {dominated_by && <span className="text-[9px] font-black text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase">Dominated</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-center">
                      {total === 0
                        ? <span className="text-slate-600 font-mono text-xs">—</span>
                        : <span className={`font-mono font-bold text-sm ${edge > 0 ? 'text-emerald-400' : edge < 0 ? 'text-rose-400' : 'text-slate-300'}`}>{myW}–{oppW}</span>
                      }
                    </td>
                    {hasSeason && (
                      <td className="px-8 py-4 text-center">
                        {sMyW + sOppW === 0
                          ? <span className="text-slate-600 font-mono text-xs">—</span>
                          : <span className={`font-mono font-bold text-sm ${sMyW > sOppW ? 'text-emerald-400' : sMyW < sOppW ? 'text-rose-400' : 'text-slate-300'}`}>{sMyW}–{sOppW}</span>
                        }
                      </td>
                    )}
                    <td className="px-8 py-4 text-center">
                      {total === 0
                        ? <span className="text-slate-700 text-xs">—</span>
                        : edge === 0
                        ? <span className="text-[10px] font-black text-amber-400 uppercase">Even</span>
                        : <span className={`text-[10px] font-black uppercase ${edge > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{edge > 0 ? `+${edge}` : edge}</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-8 py-3 border-t border-slate-800 text-[9px] font-black text-slate-700 uppercase tracking-widest">
            Same-conference opponents shown at full opacity · cross-conference dimmed
          </div>
        </div>
      )}
    </div>
  );
};

// ─── League-wide H2H table ─────────────────────────────────────────────────────
const LeagueH2H: React.FC<{ league: LeagueState }> = ({ league }) => {
  const [collapsed, setCollapsed] = useState(false);

  const pairRows = useMemo(() => {
    return (league.rivalryHistory ?? [])
      .filter(r => r.totalGames > 0)
      .map(r => {
        const t1 = league.teams.find(t => t.id === r.team1Id);
        const t2 = league.teams.find(t => t.id === r.team2Id);
        if (!t1 || !t2) return null;
        const sT1 = r.seasonH2H?.team1Wins ?? 0;
        const sT2 = r.seasonH2H?.team2Wins ?? 0;
        const lopsided = (r.team1Wins === 0 || r.team2Wins === 0) && r.totalGames >= 4;
        return { r, t1, t2, sT1, sT2, lopsided };
      })
      .filter(Boolean)
      .sort((a, b) => b!.r.totalGames - a!.r.totalGames) as {
        r: RivalryStats; t1: Team; t2: Team;
        sT1: number; sT2: number; lopsided: boolean;
      }[];
  }, [league.rivalryHistory, league.teams]);

  const hasSeason = pairRows.some(p => p.sT1 + p.sT2 > 0);

  if (pairRows.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
      <button
        className="w-full flex items-center justify-between p-8 border-b border-slate-800 bg-slate-900/50 hover:bg-slate-800/30 transition-colors"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-3">
          <Target className="text-blue-400" size={20} />
          <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">League Head-to-Head Records</h3>
          <span className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {pairRows.length} matchups
          </span>
        </div>
        <span className="text-slate-500 text-lg">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: '600px' }}>
            <thead>
              <tr className="text-[9px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/20">
                <th className="px-8 py-3">Team A</th>
                <th className="px-8 py-3 text-center">All-Time</th>
                <th className="px-8 py-3">Team B</th>
                {hasSeason && <th className="px-8 py-3 text-center">This Season</th>}
                <th className="px-8 py-3 text-center">GP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {pairRows.map(({ r, t1, t2, sT1, sT2, lopsided }) => {
                const t1Leads = r.team1Wins > r.team2Wins;
                const t2Leads = r.team2Wins > r.team1Wins;
                return (
                  <tr key={`${r.team1Id}-${r.team2Id}`} className={`hover:bg-slate-800/20 transition-colors ${lopsided ? 'bg-amber-500/[0.03]' : ''}`}>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <TeamBadge team={t1} size="sm" />
                        <span className={`text-sm font-bold ${t1Leads ? 'text-emerald-400' : t2Leads ? 'text-slate-500' : 'text-slate-300'}`}>
                          {t1.abbreviation}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {lopsided && <span className="text-[9px] font-black text-amber-400 uppercase">Dominant</span>}
                        <span className={`font-mono font-bold text-sm ${t1Leads ? 'text-emerald-400' : t2Leads ? 'text-rose-400' : 'text-slate-300'}`}>
                          {r.team1Wins}–{r.team2Wins}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <TeamBadge team={t2} size="sm" />
                        <span className={`text-sm font-bold ${t2Leads ? 'text-emerald-400' : t1Leads ? 'text-slate-500' : 'text-slate-300'}`}>
                          {t2.abbreviation}
                        </span>
                      </div>
                    </td>
                    {hasSeason && (
                      <td className="px-8 py-4 text-center">
                        {sT1 + sT2 === 0
                          ? <span className="text-slate-600 font-mono text-xs">—</span>
                          : <span className={`font-mono text-sm font-bold ${sT1 > sT2 ? 'text-emerald-400' : sT1 < sT2 ? 'text-rose-400' : 'text-slate-300'}`}>
                              {sT1}–{sT2}
                            </span>
                        }
                      </td>
                    )}
                    <td className="px-8 py-4 text-center font-mono text-xs text-slate-500">{r.totalGames}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-8 py-3 border-t border-slate-800 text-[9px] font-black text-slate-700 uppercase tracking-widest">
            Sorted by most games played · "Dominant" = perfect record with 4+ games
          </div>
        </div>
      )}
    </div>
  );
};

export default FranchiseHistory;
