import React, { useState, useMemo } from 'react';
import { LeagueState, Team, GameResult, ChampionshipRecord } from '../types';
import TeamBadge from './TeamBadge';
import { Trophy, Calendar, Target, TrendingUp, ChevronDown, ChevronUp, History as HistoryIcon } from 'lucide-react';

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

const FranchiseHistory: React.FC<FranchiseHistoryProps> = ({ league, initialTeamId, onBack }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || league.userTeamId);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SeasonRecord; direction: 'asc' | 'desc' }>({
    key: 'year',
    direction: 'desc',
  });

  const selectedTeam = useMemo(() => 
    league.teams.find(t => t.id === selectedTeamId) || league.teams[0]
  , [league.teams, selectedTeamId]);

  const seasonRecords = useMemo(() => {
    const records: SeasonRecord[] = [];
    const seasons: number[] = Array.from<number>(new Set(league.history.map(g => g.season))).sort((a: number, b: number) => b - a);
    
    // If current season has games, include it
    const currentSeason = league.season;
    if (!seasons.includes(currentSeason)) {
      seasons.unshift(currentSeason);
    }

    seasons.forEach(year => {
      const seasonGames = league.history.filter(g => g.season === year && (g.homeTeamId === selectedTeamId || g.awayTeamId === selectedTeamId));
      
      let wins = 0;
      let losses = 0;
      
      if (year === league.season) {
        // Current season wins/losses are on the team object
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
      
      // Determine playoff result
      let playoffResult = 'Missed Playoffs';
      const isChampion = league.championshipHistory?.some(c => c.year === year && c.championId === selectedTeamId) || false;
      
      if (isChampion) {
        playoffResult = 'Won Championship';
      } else {
        const runnerUp = league.championshipHistory?.find(c => c.year === year && c.runnerUpId === selectedTeamId);
        if (runnerUp) {
          playoffResult = 'Lost Finals';
        } else {
          // Check playoff bracket history if available (this might need more complex logic if we don't store full bracket history)
          // For now, let's simplify or check if they were in the bracket
          if (league.awardHistory?.find(a => a.year === year)) {
             // If awards exist for that year, the season is over. 
             // We'd need a better way to track deep playoff runs if they didn't make finals.
             // For now, let's just use "Playoffs" if they had a good record or we can find them in history
             // Actually, the championshipHistory only has finals.
             playoffResult = wins + losses >= 82 && wins > 41 ? 'Playoffs' : 'Missed Playoffs';
          }
        }
      }

      records.push({
        year,
        wins,
        losses,
        winPct,
        playoffResult,
        isChampion
      });
    });

    return records;
  }, [league.history, league.season, league.championshipHistory, selectedTeamId, selectedTeam, league.awardHistory]);

  const sortedRecords = useMemo(() => {
    const sorted = [...seasonRecords];
    sorted.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
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
      totalWins,
      totalLosses,
      winPct,
      championships,
      playoffApps,
      years: `${seasonRecords.length}; ${startYear}-${(startYear+1).toString().slice(-2)} to ${endYear}-${(endYear+1).toString().slice(-2)}`
    };
  }, [seasonRecords, league.season]);

  const handleSort = (key: keyof SeasonRecord) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header & Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          {onBack && (
            <button onClick={onBack} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors">
              <ChevronDown className="rotate-90" />
            </button>
          )}
          <div className="flex items-center gap-6">
            <TeamBadge team={selectedTeam} size="xl" />
            <div>
              <h1 className="text-5xl font-display font-black text-white uppercase tracking-tighter leading-none">
                {selectedTeam.city} <span className="text-amber-500">{selectedTeam.name}</span>
              </h1>
              <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs mt-2">Franchise History & Legacy</p>
            </div>
          </div>
        </div>

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
      </div>

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
              {sortedRecords.map((record, idx) => (
                <tr 
                  key={record.year} 
                  className={`group transition-colors ${record.isChampion ? 'bg-amber-500/10 hover:bg-amber-500/20' : 'hover:bg-slate-800/30'}`}
                >
                  <td className="px-8 py-5 font-display font-bold text-white text-lg">
                    {record.year}-{(record.year+1).toString().slice(-2)}
                  </td>
                  <td className="px-8 py-5 font-mono text-slate-300">
                    {record.wins}-{record.losses}
                  </td>
                  <td className="px-8 py-5 font-mono text-slate-400">
                    {record.winPct}
                  </td>
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
    </div>
  );
};

export default FranchiseHistory;
