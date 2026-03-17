import React, { useState, useMemo } from 'react';
import { LeagueState, Team, GameResult, ChampionshipRecord, SeasonAwards, AwardWinner } from '../types';
import TeamBadge from './TeamBadge';
import { Trophy, Calendar, Target, TrendingUp, ChevronDown, ChevronUp, History as HistoryIcon, Star, ChevronRight } from 'lucide-react';

interface FranchiseHistoryProps {
  league: LeagueState;
  initialTeamId?: string;
  onBack?: () => void;
}

interface SeasonRecord {
  year: number;
  wins: number;
  losses: number;
  winPct: string;
  playoffResult: string;
  isChampion: boolean;
}

type HistoryView = 'franchise' | 'league';
type LeagueSortKey = 'year' | 'champion' | 'runnerUp' | 'finalsMvp' | 'mvp' | 'dpoy' | 'smoy' | 'mip' | 'roy';

const FranchiseHistory: React.FC<FranchiseHistoryProps> = ({ league, initialTeamId, onBack }) => {
  const [historyView, setHistoryView] = useState<HistoryView>('franchise');
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
      let playoffResult = 'Missed Playoffs';
      const isChampion = league.championshipHistory?.some(c => c.year === year && c.championId === selectedTeamId) || false;

      if (isChampion) {
        playoffResult = 'Won Championship';
      } else {
        const runnerUp = league.championshipHistory?.find(c => c.year === year && c.runnerUpId === selectedTeamId);
        if (runnerUp) {
          playoffResult = 'Lost Finals';
        } else if (league.awardHistory?.find(a => a.year === year)) {
          playoffResult = wins + losses >= 82 && wins > 41 ? 'Playoffs' : 'Missed Playoffs';
        }
      }

      records.push({ year, wins, losses, winPct, playoffResult, isChampion });
    });

    return records;
  }, [league.history, league.season, league.championshipHistory, selectedTeamId, selectedTeam, league.awardHistory]);

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
      years: `${seasonRecords.length}; ${startYear}-${(startYear+1).toString().slice(-2)} to ${endYear}-${(endYear+1).toString().slice(-2)}`
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
        events.push({ day, icon: '🏆', label: `Season ${c.year} — Won Championship (${c.seriesScore} vs ${c.runnerUpName})`, colour: 'text-amber-400' });
      else if (c.runnerUpId === selectedTeamId)
        events.push({ day, icon: '🥈', label: `Season ${c.year} — Lost Finals vs ${c.championName}`, colour: 'text-slate-300' });
    });
    teamAwards.forEach(a =>
      events.push({ day: a.year * 82, icon: a.icon, label: `Season ${a.year} — ${a.name} wins ${a.award} (${a.statsLabel})`, colour: 'text-slate-300' })
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
          {/* View switcher */}
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
                      <div className="flex items-center gap-2">Year {sortConfig.key === 'year' && (sortConfig.direction === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}</div>
                    </th>
                    <th className="px-8 py-4">Record (W-L)</th>
                    <th className="px-8 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('winPct')}>
                      <div className="flex items-center gap-2">Win % {sortConfig.key === 'winPct' && (sortConfig.direction === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}</div>
                    </th>
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
                        {record.year}-{(record.year+1).toString().slice(-2)}
                      </td>
                      <td className="px-8 py-5 font-mono text-slate-300">{record.wins}-{record.losses}</td>
                      <td className="px-8 py-5 font-mono text-slate-400">{record.winPct}</td>
                      <td className="px-8 py-5">
                        <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          record.isChampion ? 'bg-amber-500 text-slate-950' :
                          record.playoffResult === 'Lost Finals' ? 'bg-slate-700 text-white' :
                          record.playoffResult === 'Playoffs' ? 'bg-slate-800 text-slate-300' :
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
                    <span className="font-mono text-xs text-amber-500 font-bold">Season {a.year}</span>
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
                          { key: 'smoy',      label: 'SMOY' },
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
                                  {row.year}-{(row.year + 1).toString().slice(-2)}
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
                                        { key: 'sixthMan', label: 'SMOY',  icon: '⚡' },
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
        </>
      )}
    </div>
  );
};

export default FranchiseHistory;
