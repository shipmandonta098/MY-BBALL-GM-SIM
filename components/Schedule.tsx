import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LeagueState, Team, ScheduleGame, Player, RivalryStats, GameResult } from '../types';
import TeamBadge from './TeamBadge';

interface ScheduleProps {
  league: LeagueState;
  onSimulate: (mode: 'next' | 'day' | 'week' | 'month' | 'season' | 'to-game' | 'x-games' | 'single-instant', targetGameId?: string, numGames?: number) => void;
  onScout: (player: Player) => void;
  onWatchLive?: (gameId: string) => void;
  onViewBoxScore: (result: GameResult, home: Team, away: Team) => void;
  onManageTeam?: (teamId: string) => void;
}

const Schedule: React.FC<ScheduleProps> = ({ league, onSimulate, onScout, onWatchLive, onViewBoxScore, onManageTeam }) => {
  const [viewMode, setViewMode] = useState<'team' | 'league'>('team');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(league.userTeamId);
  const [selectedDay, setSelectedDay] = useState<number>(league.currentDay);
  
  const listRef = useRef<HTMLDivElement>(null);

  const selectedTeam = useMemo(() => 
    league.teams.find(t => t.id === selectedTeamId) || league.teams.find(t => t.id === league.userTeamId)!
  , [league.teams, selectedTeamId, league.userTeamId]);

  const teamSchedule = useMemo(() => 
    league.schedule
      .filter(g => g.homeTeamId === selectedTeam.id || g.awayTeamId === selectedTeam.id)
      .sort((a, b) => a.day - b.day)
  , [league.schedule, selectedTeam.id]);

  const dailySchedule = useMemo(() => 
    league.schedule
      .filter(g => g.day === selectedDay)
      .sort((a, b) => (a.gameNumber || 0) - (b.gameNumber || 0))
  , [league.schedule, selectedDay]);

  const stats = useMemo(() => {
    const played = teamSchedule.filter(g => g.played);
    const homeLeft = teamSchedule.filter(g => !g.played && g.homeTeamId === selectedTeam.id).length;
    const awayLeft = teamSchedule.filter(g => !g.played && g.awayTeamId === selectedTeam.id).length;
    
    let b2bsTotal = 0;
    let b2bsPlayed = 0;
    teamSchedule.forEach(g => {
      const isSelectedHome = g.homeTeamId === selectedTeam.id;
      if (isSelectedHome ? g.homeB2B : g.awayB2B) {
        b2bsTotal++;
        if (g.played) b2bsPlayed++;
      }
    });

    return {
      played: played.length,
      left: 82 - played.length,
      homeLeft,
      awayLeft,
      b2bsLeft: Math.max(0, b2bsTotal - b2bsPlayed),
      b2bsTotal
    };
  }, [teamSchedule, selectedTeam.id]);

  const nextFiveDifficulty = useMemo(() => {
    const upcoming = teamSchedule.filter(g => !g.played).slice(0, 5);
    return upcoming.map(g => {
      const oppId = g.homeTeamId === selectedTeam.id ? g.awayTeamId : g.homeTeamId;
      const opp = league.teams.find(t => t.id === oppId)!;
      const oppOvr = Math.round(opp.roster.reduce((acc, p) => acc + p.rating, 0) / opp.roster.length);
      return Math.min(100, (oppOvr - 65) * 3);
    });
  }, [teamSchedule, league.teams, selectedTeam.id]);

  useEffect(() => {
    if (viewMode === 'team') {
      const nextGameIdx = teamSchedule.findIndex(g => !g.played);
      if (nextGameIdx !== -1) {
        setTimeout(() => {
          const el = document.getElementById(`game-${teamSchedule[nextGameIdx].id}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [teamSchedule, viewMode]);

  const getRivalryLevel = (stats: RivalryStats | undefined) => {
    if (!stats || stats.totalGames <= 2) return { label: 'Ice Cold', icon: '❄️', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
    
    const score = stats.totalGames + 
                  (stats.playoffSeriesCount * 5) + 
                  (stats.buzzerBeaters * 3) + 
                  (stats.comebacks * 2) + 
                  (stats.otGames * 2) + 
                  stats.badBloodScore;

    if (stats.totalGames >= 20 && score >= 30) return { label: 'Red Hot', icon: '🔥🔥', color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
    if (stats.totalGames >= 16) return { label: 'Hot', icon: '🔥', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
    if (stats.totalGames >= 8) return { label: 'Warm', icon: '🔥', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    if (stats.totalGames >= 3) return { label: 'Cold', icon: '🧊', color: 'text-blue-300', bg: 'bg-blue-400/10', border: 'border-blue-400/20' };
    return { label: 'Ice Cold', icon: '❄️', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
  };

  const GameCard = ({ game, index, focusTeamId }: { game: ScheduleGame, index: number, focusTeamId?: string }) => {
    const displayTeamId = focusTeamId || game.homeTeamId;
    const isHome = game.homeTeamId === displayTeamId;
    const homeTeam = league.teams.find(t => t.id === game.homeTeamId)!;
    const awayTeam = league.teams.find(t => t.id === game.awayTeamId)!;
    const focusTeam = league.teams.find(t => t.id === displayTeamId)!;
    const opp = isHome ? awayTeam : homeTeam;
    
    const result = game.played ? league.history.find(h => h.id === game.id) : null;
    const isWin = result ? (isHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore) : null;
    const isB2B = isHome ? game.homeB2B : game.awayB2B;
    const b2bNum = isHome ? game.homeB2BCount : game.awayB2BCount;
    
    const scheduleToUse = viewMode === 'team' ? teamSchedule : dailySchedule;
    const isNext = !game.played && (index === 0 || scheduleToUse[index-1]?.played);
    
    // Rivalry Stats
    const rivalry = league.rivalryHistory?.find(r => 
      (r.team1Id === homeTeam.id && r.team2Id === awayTeam.id) || 
      (r.team1Id === awayTeam.id && r.team2Id === homeTeam.id)
    );
    const rivalryLevel = getRivalryLevel(rivalry);
    const isChippy = (rivalry?.badBloodScore || 0) > 15;

    const focusWins = rivalry ? (rivalry.team1Id === displayTeamId ? rivalry.team1Wins : rivalry.team2Wins) : 0;
    const oppWins = rivalry ? (rivalry.team1Id === displayTeamId ? rivalry.team2Wins : rivalry.team1Wins) : 0;
    const lastFive = rivalry?.lastFiveGames.map(g => {
      const focusWon = (rivalry.team1Id === displayTeamId && g === 'team1') || (rivalry.team1Id !== displayTeamId && g === 'team2');
      return focusWon ? 'W' : 'L';
    }) || [];

    // Milestones
    const isDeadline = game.gameNumber === 50;
    const isAllStar = game.gameNumber === 52;

    return (
      <div className="space-y-4">
        {viewMode === 'team' && isDeadline && !game.played && (
          <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl flex items-center justify-between group shadow-lg shadow-rose-500/5 animate-pulse">
             <div className="flex items-center gap-4">
                <span className="text-2xl">🚨</span>
                <div>
                   <h4 className="text-rose-500 font-display font-black uppercase tracking-widest text-lg">Trade Deadline</h4>
                   <p className="text-[10px] text-rose-500/70 font-bold uppercase">Front office frenzy! Final chance to move assets.</p>
                </div>
             </div>
             <div className="px-4 py-1.5 bg-rose-500 text-white text-[10px] font-black uppercase rounded-lg">Frenzy Mode</div>
          </div>
        )}

        {viewMode === 'team' && isAllStar && !game.played && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-center justify-between group shadow-lg shadow-amber-500/5">
             <div className="flex items-center gap-4">
                <span className="text-2xl">⭐</span>
                <div>
                   <h4 className="text-amber-500 font-display font-black uppercase tracking-widest text-lg">All-Star Weekend</h4>
                   <p className="text-[10px] text-amber-500/70 font-bold uppercase">Rest & Showcase events. Star morale boost.</p>
                </div>
             </div>
             <div className="px-4 py-1.5 bg-amber-500 text-slate-950 text-[10px] font-black uppercase rounded-lg">Break Week</div>
          </div>
        )}

        <div 
          id={`game-${game.id}`}
          className={`group relative bg-slate-900 border ${isNext ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-xl' : 'border-slate-800'} rounded-3xl p-6 transition-all hover:border-slate-600 ${game.played ? 'opacity-70' : ''}`}
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex flex-col items-center md:items-start min-w-[120px]">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                {viewMode === 'team' ? `GAME ${game.gameNumber}/82` : `DAY ${game.day}`}
              </span>
              {isB2B && viewMode === 'team' && (
                <span className="mt-1 px-2 py-0.5 bg-rose-500/20 text-rose-500 text-[9px] font-black uppercase rounded border border-rose-500/20">
                  B2B #{b2bNum}/{stats.b2bsTotal}
                </span>
              )}
              
              {/* Rivalry Meter Badge */}
              <div className="mt-3 relative group/rivalry">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${rivalryLevel.bg} ${rivalryLevel.border} cursor-help transition-all hover:scale-105 ${isChippy ? 'animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.4)] border-rose-500/50' : ''}`}>
                  <span className="text-xs">{rivalryLevel.icon}</span>
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${rivalryLevel.color}`}>
                    {rivalryLevel.label}
                  </span>
                </div>
                
                {/* Tooltip */}
                <div className="absolute bottom-full left-0 mb-2 w-64 p-4 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl opacity-0 invisible group-hover/rivalry:opacity-100 group-hover/rivalry:visible transition-all z-[60] pointer-events-none">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Rivalry History</span>
                      <span className={`text-[10px] font-black uppercase ${rivalryLevel.color}`}>{rivalryLevel.label}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-center">
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Record</p>
                        <p className="text-lg font-display font-bold text-white">{focusWins} - {oppWins}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Bad Blood</p>
                        <p className={`text-lg font-display font-bold ${isChippy ? 'text-rose-500' : 'text-slate-300'}`}>{rivalry?.badBloodScore || 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Last 5</p>
                        <div className="flex gap-1 mt-1">
                          {lastFive.length > 0 ? lastFive.map((r, i) => (
                            <span key={i} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-black ${r === 'W' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'}`}>
                              {r}
                            </span>
                          )) : <span className="text-[9px] text-slate-600 italic">No history</span>}
                        </div>
                      </div>
                    </div>
                    {rivalry?.lastGameResult && (
                      <div className="pt-2 border-t border-slate-800">
                        <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Last Meeting</p>
                        <p className="text-[10px] text-slate-300">
                          {rivalry.lastGameResult.winnerId === displayTeamId ? 'You' : opp.name} won {rivalry.lastGameResult.score} (Season {rivalry.lastGameResult.season}, Day {rivalry.lastGameResult.day})
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col sm:flex-row items-center justify-between gap-6 w-full">
              <div className="flex items-center gap-6">
                <div 
                  className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 relative overflow-hidden shrink-0 group-hover:scale-110 transition-transform cursor-pointer"
                  onClick={() => onManageTeam?.(opp.id)}
                >
                  <TeamBadge team={opp} size="lg" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black uppercase ${isHome ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isHome ? '🏠 HOME' : '🛫 AWAY'}
                    </span>
                    <h3 
                      onClick={() => onManageTeam?.(opp.id)}
                      className="text-2xl font-display font-bold uppercase text-white hover:text-amber-500 transition-colors cursor-pointer"
                    >
                      {opp.city} {opp.name}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                    OVR: {Math.round(opp.roster.reduce((s,p)=>s+p.rating,0)/opp.roster.length)} • {opp.wins}-{opp.losses}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center sm:items-end w-full sm:w-auto">
                {game.played && result ? (
                  <div className="flex flex-col items-center sm:items-end gap-2">
                    <div className="text-right">
                      <span className={`text-4xl font-display font-black ${isWin ? 'text-emerald-400' : 'text-rose-500'}`}>
                        {isWin ? 'WIN' : 'LOSS'}
                      </span>
                      <p className="text-xl font-mono text-slate-300">
                        {isHome ? `${result.homeScore}-${result.awayScore}` : `${result.awayScore}-${result.homeScore}`}
                      </p>
                    </div>
                    <button 
                      onClick={() => onViewBoxScore(result, homeTeam, awayTeam)}
                      className="px-4 py-1.5 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-lg border border-amber-500/20 transition-all"
                    >
                      View Box Score
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto justify-center">
                    <button 
                      onClick={() => onSimulate('single-instant', game.id)}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-xl border border-amber-500/20 transition-all shadow-lg hover:shadow-amber-500/20"
                    >
                      Simulate
                    </button>
                    <button 
                      onClick={() => onWatchLive && onWatchLive(game.id)}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-500/20 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-emerald-500/20"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      Watch Live
                    </button>
                    <button 
                      onClick={() => onSimulate('to-game', game.id)}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                    >
                      Sim To
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 relative z-10">
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button 
              onClick={() => setViewMode('team')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'team' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Team Schedule
            </button>
            <button 
              onClick={() => setViewMode('league')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'league' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              League Schedule
            </button>
          </div>

          {viewMode === 'team' ? (
            <select 
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold px-4 py-2 rounded-xl focus:outline-none focus:border-amber-500 transition-colors"
            >
              {league.teams.sort((a,b) => a.city.localeCompare(b.city)).map(t => (
                <option key={t.id} value={t.id}>{t.city} {t.name}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Day</span>
              <input 
                type="range" min="1" max="200" 
                value={selectedDay} 
                onChange={(e) => setSelectedDay(parseInt(e.target.value))}
                className="w-48 accent-amber-500"
              />
              <span className="text-sm font-mono text-amber-500 font-bold">Day {selectedDay}</span>
            </div>
          )}
        </div>

        {viewMode === 'team' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10 text-center md:text-left">
            <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Season Progress</p>
              <p className="text-3xl font-display font-bold text-white uppercase">{stats.played} / 82</p>
              <div className="h-1 bg-slate-800 rounded-full mt-2 overflow-hidden w-full">
                <div className="h-full bg-amber-500" style={{ width: `${(stats.played/82)*100}%` }}></div>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Split Left</p>
              <p className="text-3xl font-display font-bold text-slate-300 uppercase">{stats.homeLeft}H / {stats.awayLeft}A</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">B2Bs Left</p>
              <p className="text-3xl font-display font-bold text-rose-500 uppercase">{stats.b2bsLeft}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Next 5 Intensity</p>
              <div className="flex gap-1 items-end h-8 mt-1 justify-center md:justify-start">
                {nextFiveDifficulty.map((d, i) => (
                  <div key={i} className="w-2 bg-amber-500 rounded-t-sm" style={{ height: `${d}%` }}></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'league' && (
          <div className="relative z-10 space-y-6">
            <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">League-Wide Schedule</p>
              <div className="flex items-baseline gap-4">
                <p className="text-3xl font-display font-bold text-white uppercase">Day {selectedDay}</p>
                <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-black text-amber-500 uppercase tracking-widest">
                  {dailySchedule.length} Games
                </span>
              </div>
            </div>

            {dailySchedule.length > 0 && (
              <div className="overflow-x-auto pb-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
                  {dailySchedule.map(game => {
                    const home = league.teams.find(t => t.id === game.homeTeamId)!;
                    const away = league.teams.find(t => t.id === game.awayTeamId)!;
                    const result = game.played ? league.history.find(h => h.id === game.id) : null;
                    const isUserGame = game.homeTeamId === league.userTeamId || game.awayTeamId === league.userTeamId;
                    return (
                      <div
                        key={game.id}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border transition-all ${isUserGame ? 'bg-amber-500/5 border-amber-500/30' : 'bg-slate-950/50 border-slate-800'}`}
                      >
                        {/* Away Team */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700 shrink-0">
                            <TeamBadge team={away} size="sm" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-0.5">🛫 Away</p>
                            <p className="text-xs font-bold text-slate-200 truncate">{away.city} <span className="text-slate-400">{away.name}</span></p>
                            <p className="text-[9px] text-slate-600 font-bold">{away.wins}-{away.losses}</p>
                          </div>
                        </div>

                        {/* Score or VS */}
                        <div className="shrink-0 text-center px-1">
                          {result ? (
                            <div className="text-center">
                              <p className="text-[10px] font-black font-mono text-white leading-tight">{result.awayScore}</p>
                              <p className="text-[8px] text-slate-600 font-bold">—</p>
                              <p className="text-[10px] font-black font-mono text-white leading-tight">{result.homeScore}</p>
                            </div>
                          ) : (
                            <span className="text-[9px] font-black text-slate-600 uppercase">@</span>
                          )}
                        </div>

                        {/* Home Team */}
                        <div className="flex items-center gap-2 flex-1 min-w-0 flex-row-reverse text-right">
                          <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700 shrink-0" style={{ borderColor: home.primaryColor + '40' }}>
                            <TeamBadge team={home} size="sm" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-0.5">🏠 Home</p>
                            <p className="text-xs font-bold text-slate-200 truncate"><span className="text-slate-400">{home.city}</span> <span className="font-black" style={{ color: home.primaryColor }}>{home.name}</span></p>
                            <p className="text-[9px] text-slate-600 font-bold">{home.wins}-{home.losses}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Advanced Sim Controls */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center sticky top-0 z-50 py-4 px-6 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex flex-wrap gap-2">
           <button 
            onClick={() => onSimulate('day')}
            className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-amber-500/50 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            Sim Day
          </button>
          <button 
            onClick={() => onSimulate('week')}
            className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-amber-500/50 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            Sim Week
          </button>
          <button 
            onClick={() => onSimulate('month')}
            className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-amber-500/50 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            Sim Month
          </button>
          <button 
            onClick={() => onSimulate('season')}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:scale-105 active:scale-95"
          >
            Sim Season
          </button>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              Live Tracking
           </div>
        </div>
      </div>

      <div className="space-y-4 max-w-5xl mx-auto">
        {viewMode === 'league' && dailySchedule.length > 0 && (
          <div className="flex items-center gap-4 px-2 pt-2">
            <div className="h-px flex-1 bg-slate-800"></div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Game Details</span>
            <div className="h-px flex-1 bg-slate-800"></div>
          </div>
        )}
        {(viewMode === 'team' ? teamSchedule : dailySchedule).map((game, i) => {
          const scheduleToUse = viewMode === 'team' ? teamSchedule : dailySchedule;
          const isNext = !game.played && (i === 0 || scheduleToUse[i-1]?.played);
          return (
            <React.Fragment key={game.id}>
              {viewMode === 'team' && isNext && (
                <div className="py-8 flex items-center gap-6">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-500/50"></div>
                  <span className="text-xs font-black text-amber-500 uppercase tracking-[0.4em]">Upcoming Action</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-500/50"></div>
                </div>
              )}
              <GameCard game={game} index={i} focusTeamId={viewMode === 'team' ? selectedTeamId : undefined} />
            </React.Fragment>
          );
        })}
        {viewMode === 'league' && dailySchedule.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-slate-500 font-medium uppercase tracking-widest">No games scheduled for Day {selectedDay}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Schedule;
