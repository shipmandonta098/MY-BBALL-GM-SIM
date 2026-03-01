
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ScheduleGame, Team, GameResult, GamePlayerLine, Player, LeagueState, PlayByPlayEvent } from '../types';
import TeamBadge from './TeamBadge';
import { Play, Pause, FastForward, X, Trophy, TrendingUp, Clock } from 'lucide-react';

interface LiveGameModalProps {
  game: ScheduleGame;
  homeTeam: Team;
  awayTeam: Team;
  season: number;
  league: LeagueState;
  rivalryLevel?: string;
  onComplete: (result: GameResult) => void;
  onUpdate?: (liveGame: LeagueState['liveGame']) => void;
  onClose: () => void;
}

interface GameEvent {
  time: string;
  quarter: number;
  text: string;
  type: 'score' | 'miss' | 'turnover' | 'foul' | 'highlight' | 'info';
}

const LiveGameModal: React.FC<LiveGameModalProps> = ({ 
  game, 
  homeTeam, 
  awayTeam, 
  season, 
  league,
  rivalryLevel = 'Ice Cold', 
  onComplete, 
  onUpdate,
  onClose 
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [quarter, setQuarter] = useState(1);
  const [timeLeft, setTimeLeft] = useState(720);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [homeQScore, setHomeQScore] = useState<number[]>([0, 0, 0, 0]);
  const [awayQScore, setAwayQScore] = useState<number[]>([0, 0, 0, 0]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [homeStats, setHomeStats] = useState<Record<string, Partial<GamePlayerLine>>>({});
  const [awayStats, setAwayStats] = useState<Record<string, Partial<GamePlayerLine>>>({});
  const [isChippy, setIsChippy] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'away' | 'combined'>('combined');
  const logRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    if (onUpdate) {
      onUpdate({
        gameId: game.id,
        homeScore,
        awayScore,
        quarter,
        timeLeft,
        events: events.map(e => ({
          time: e.time,
          text: e.text,
          type: e.type === 'highlight' ? 'info' : e.type,
          quarter: e.quarter
        })),
        homeStats,
        awayStats,
        homeQScore,
        awayQScore
      });
    }
  }, [homeScore, awayScore, quarter, timeLeft, events, homeStats, awayStats, homeQScore, awayQScore]);
  
  // Initialize stats trackers
  useEffect(() => {
    const init = (team: Team) => {
      const s: Record<string, Partial<GamePlayerLine>> = {};
      team.roster.forEach(p => {
        s[p.id] = { 
          playerId: p.id, 
          name: p.name, 
          pts: 0, 
          reb: 0, 
          ast: 0, 
          stl: 0, 
          blk: 0, 
          fgm: 0, 
          fga: 0, 
          min: 0, 
          threepm: 0, 
          threepa: 0, 
          ftm: 0, 
          fta: 0, 
          tov: 0, 
          pf: 0, 
          techs: 0, 
          flagrants: 0, 
          plusMinus: 0, 
          ejected: false 
        };
      });
      return s;
    };
    setHomeStats(init(homeTeam));
    setAwayStats(init(awayTeam));
  }, [homeTeam, awayTeam]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const generatePlay = () => {
    const isHomePossession = Math.random() > 0.5;
    const offTeam = isHomePossession ? homeTeam : awayTeam;
    const defTeam = isHomePossession ? awayTeam : homeTeam;
    
    // Pick 5 starters for logic (simulating active lineups)
    const offPlayers = offTeam.roster.slice(0, 5);
    const defPlayers = defTeam.roster.slice(0, 5);
    const shooter = offPlayers[Math.floor(Math.random() * offPlayers.length)];
    const defender = defPlayers[Math.floor(Math.random() * defPlayers.length)];

    const timePassed = Math.floor(Math.random() * 15) + 5;
    const newTime = Math.max(0, timeLeft - timePassed);
    
    let eventText = "";
    let eventType: GameEvent['type'] = 'info';
    let ptsGain = 0;

    const roll = Math.random() * 100;
    const rivalryMod = ['Hot', 'Red Hot'].includes(rivalryLevel) ? 1.5 : 1.0;
    
    // Logic tied to attributes/traits
    if (roll < 2) { // Technical Foul
      const p = shooter;
      let techChance = 1.0;
      if (p.personalityTraits.includes('Diva/Star') || p.personalityTraits.includes('Tough/Alpha')) techChance *= 1.2;
      if (p.personalityTraits.includes('Leader')) techChance *= 0.9;
      
      if (Math.random() < techChance * rivalryMod) {
        eventText = `${p.name} tech'd for taunt! 1 FT for ${defTeam.name}.`;
        eventType = 'foul';
        updatePlayerStat(isHomePossession, p.id, 'techs', 1);
        setIsChippy(true);
        if (isHomePossession) setAwayScore(s => s + 1); else setHomeScore(s => s + 1);
      } else {
        eventText = `${p.name} called for a loose ball foul.`;
        updatePlayerStat(isHomePossession, p.id, 'pf', 1);
      }
    } else if (roll < 3) { // Flagrant Foul
      const p = defender;
      const isF2 = Math.random() < 0.1 || (rivalryLevel === 'Red Hot' && Math.random() < 0.3);
      eventText = isF2 ? `FLAGRANT 2! ${p.name} ejected for excessive contact!` : `Flagrant 1 on ${p.name}. Unnecessary contact.`;
      eventType = 'foul';
      updatePlayerStat(!isHomePossession, p.id, 'flagrants', isF2 ? 2 : 1);
      if (isF2) updatePlayerStat(!isHomePossession, p.id, 'ejected', 1 as any);
      setIsChippy(true);
      if (isHomePossession) setHomeScore(s => s + 2); else setAwayScore(s => s + 2);
    } else if (roll < 10) { // Turnover
      eventText = `${shooter.name} loses the handle! Turnover ${offTeam.name}.`;
      eventType = 'turnover';
      updatePlayerStat(isHomePossession, shooter.id, 'tov', 1);
    } else if (roll < 20) { // Foul
      eventText = `${defender.name} reaches in on ${shooter.name}. Personal foul!`;
      eventType = 'foul';
      updatePlayerStat(!isHomePossession, defender.id, 'pf', 1);
    } else { // Shot attempt
      const isThree = Math.random() < 0.38; // Modern NBA 3pt frequency
      const successChance = isThree ? shooter.attributes.shooting3pt : shooter.attributes.shooting;
      
      // Defensive impact: Use team defense and individual defender
      const defRating = (defender.attributes.perimeterDef + defTeam.roster.reduce((acc, p) => acc + p.attributes.defensiveIQ, 0) / defTeam.roster.length) / 2;
      const contestedModifier = (defRating / 3);
      
      // Base threshold for a "make" is higher to lower FG%
      // NBA average FG% is ~47%, 3PT% is ~36%
      const baseThreshold = isThree ? 62 : 55;
      const finalChance = (successChance - contestedModifier) + (Math.random() * 30 - 15);
      
      updatePlayerStat(isHomePossession, shooter.id, 'fga', 1);
      if (isThree) updatePlayerStat(isHomePossession, shooter.id, 'threepa', 1);

      if (finalChance > baseThreshold) { // Make
        const isDunk = shooter.attributes.jumping > 85 && !isThree && Math.random() > 0.7;
        const pts = isThree ? 3 : 2;
        eventText = isDunk 
          ? `BOOM! ${shooter.name} detonates on ${defender.name} with a thunderous slam!` 
          : `${shooter.name} pulls up from ${isThree ? 'deep' : 'midrange'}... BUCKET!`;
        
        if (isHomePossession) {
          setHomeScore(s => s + pts);
          setHomeQScore(prev => {
            const next = [...prev];
            next[quarter - 1] += pts;
            return next;
          });
        } else {
          setAwayScore(s => s + pts);
          setAwayQScore(prev => {
            const next = [...prev];
            next[quarter - 1] += pts;
            return next;
          });
        }
        
        eventType = 'score';
        ptsGain = pts;
        updatePlayerStat(isHomePossession, shooter.id, 'pts', pts);
        updatePlayerStat(isHomePossession, shooter.id, 'fgm', 1);
        if (isThree) updatePlayerStat(isHomePossession, shooter.id, 'threepm', 1);
      } else { // Miss
        const isBlock = defender.attributes.blocks > 80 && Math.random() > 0.8;
        if (isBlock) {
          eventText = `NOT TODAY! ${defender.name} sends ${shooter.name}'s shot into the stands!`;
          updatePlayerStat(!isHomePossession, defender.id, 'blk', 1);
        } else {
          eventText = `${shooter.name} looks for the shot, but it rims out.`;
        }
        eventType = 'miss';
        
        // Rebound
        const rebber = Math.random() > 0.7 ? offPlayers[Math.floor(Math.random()*5)] : defPlayers[Math.floor(Math.random()*5)];
        const isOffReb = offPlayers.some(p => p.id === rebber.id);
        updatePlayerStat(isOffReb ? isHomePossession : !isHomePossession, rebber.id, 'reb', 1);
        eventText += ` Rebound by ${rebber.name}.`;
      }
    }

    const newEvent: GameEvent = {
      time: formatTime(newTime),
      quarter,
      text: eventText,
      type: eventType
    };

    setEvents(prev => [...prev, newEvent].slice(-50)); // Keep log sane
    setTimeLeft(newTime);
  };

  const updatePlayerStat = (isHome: boolean, pid: string, stat: keyof GamePlayerLine, val: number) => {
    const setter = isHome ? setHomeStats : setAwayStats;
    setter(prev => ({
      ...prev,
      [pid]: { ...prev[pid], [stat]: ((prev[pid] as any)[stat] || 0) + val }
    }));
  };

  const simRest = () => {
    setIsPlaying(false);
    // Fast simulation to end
    let currentHomeScore = homeScore;
    let currentAwayScore = awayScore;
    let currentQuarter = quarter;
    let currentTimeLeft = timeLeft;
    let currentHomeQScore = [...homeQScore];
    let currentAwayQScore = [...awayQScore];
    let currentHomeStats = { ...homeStats };
    let currentAwayStats = { ...awayStats };
    let currentEvents = [...events];

    const updateStatInternal = (isHome: boolean, pid: string, stat: keyof GamePlayerLine, val: number) => {
      const stats = isHome ? currentHomeStats : currentAwayStats;
      stats[pid] = { ...stats[pid], [stat]: ((stats[pid] as any)[stat] || 0) + val };
    };

    while (currentQuarter <= 4 || (currentQuarter > 4 && currentHomeScore === currentAwayScore)) {
      while (currentTimeLeft > 0) {
        const isHomePossession = Math.random() > 0.5;
        const offTeam = isHomePossession ? homeTeam : awayTeam;
        const offPlayers = offTeam.roster.slice(0, 5);
        const shooter = offPlayers[Math.floor(Math.random() * offPlayers.length)];
        
        const timePassed = Math.floor(Math.random() * 15) + 5;
        currentTimeLeft = Math.max(0, currentTimeLeft - timePassed);

        const roll = Math.random() * 100;
        if (roll > 60) { // Score
          const pts = Math.random() > 0.4 ? 2 : 3;
          if (isHomePossession) {
            currentHomeScore += pts;
            currentHomeQScore[currentQuarter - 1] = (currentHomeQScore[currentQuarter - 1] || 0) + pts;
          } else {
            currentAwayScore += pts;
            currentAwayQScore[currentQuarter - 1] = (currentAwayQScore[currentQuarter - 1] || 0) + pts;
          }
          updateStatInternal(isHomePossession, shooter.id, 'pts', pts);
          updateStatInternal(isHomePossession, shooter.id, 'fgm', 1);
          updateStatInternal(isHomePossession, shooter.id, 'fga', 1);
        } else {
          updateStatInternal(isHomePossession, shooter.id, 'fga', 1);
        }
      }

      if (currentQuarter >= 4 && currentHomeScore !== currentAwayScore) break;
      currentQuarter++;
      currentTimeLeft = currentQuarter > 4 ? 300 : 720;
      if (currentHomeQScore.length < currentQuarter) currentHomeQScore.push(0);
      if (currentAwayQScore.length < currentQuarter) currentAwayQScore.push(0);
    }

    const margin = currentHomeScore - currentAwayScore;
    const homePlayerStats = (Object.values(currentHomeStats) as GamePlayerLine[]).map(s => ({ ...s, plusMinus: margin }));
    const awayPlayerStats = (Object.values(currentAwayStats) as GamePlayerLine[]).map(s => ({ ...s, plusMinus: -margin }));
    const allLines = [...homePlayerStats, ...awayPlayerStats].sort((a, b) => b.pts - a.pts);

    const res: GameResult = {
      id: game.id,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: currentHomeScore,
      awayScore: currentAwayScore,
      quarterScores: { home: currentHomeQScore, away: currentAwayQScore },
      homePlayerStats,
      awayPlayerStats,
      topPerformers: allLines.slice(0, 3).map(l => ({ playerId: l.playerId, points: l.pts, rebounds: l.reb, assists: l.ast })),
      playByPlay: currentEvents.map(e => ({ time: e.time, text: e.text, type: e.type === 'highlight' ? 'info' : e.type, quarter: e.quarter })),
      date: game.day,
      season: season,
      isOvertime: currentQuarter > 4,
      isBuzzerBeater: Math.abs(currentHomeScore - currentAwayScore) <= 2 && Math.random() < 0.2,
      isComeback: false,
      isChippy: isChippy
    };
    onComplete(res);
  };

  const leagueLeaders = useMemo(() => {
    const allPlayers = league.teams.flatMap(t => t.roster);
    const topScorers = [...allPlayers].sort((a, b) => (b.stats.points / (b.stats.gamesPlayed || 1)) - (a.stats.points / (a.stats.gamesPlayed || 1))).slice(0, 5);
    return topScorers.map(p => `${p.name.split(' ').pop()?.toUpperCase()} ${(p.stats.points / (p.stats.gamesPlayed || 1)).toFixed(1)} PPG`).join(' • ');
  }, [league.teams]);

  useEffect(() => {
    let timer: number;
    if (isPlaying && timeLeft > 0) {
      timer = window.setInterval(() => {
        generatePlay();
      }, 1000 / speed);
    } else if (timeLeft === 0 && quarter < 4) {
      setQuarter(q => q + 1);
      setTimeLeft(720);
      setEvents(prev => [...prev, { time: "12:00", quarter: quarter+1, text: `--- Start of Quarter ${quarter+1} ---`, type: 'info' }]);
    } else if (timeLeft === 0 && quarter >= 4) {
      if (homeScore === awayScore) {
        setQuarter(q => q + 1);
        setTimeLeft(300); // 5 mins for OT
        setEvents(prev => [...prev, { time: "5:00", quarter: quarter + 1, text: `--- Start of Overtime ${quarter - 3} ---`, type: 'info' }]);
      } else {
        // Game Over
        setIsPlaying(false);
      }
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeLeft, quarter, speed]);

  const finishGame = () => {
    const margin = homeScore - awayScore;
    const homePlayerStats = (Object.values(homeStats) as GamePlayerLine[]).map(s => ({
      ...s,
      plusMinus: margin
    }));
    const awayPlayerStats = (Object.values(awayStats) as GamePlayerLine[]).map(s => ({
      ...s,
      plusMinus: -margin
    }));
    const allLines = [...homePlayerStats, ...awayPlayerStats].sort((a, b) => b.pts - a.pts);

    const isBuzzerBeater = Math.abs(homeScore - awayScore) <= 2 && Math.random() < 0.3;
    const isComeback = (homeQScore[0] + homeQScore[1] < awayQScore[0] + awayQScore[1] - 15 && homeScore > awayScore) || 
                       (awayQScore[0] + awayQScore[1] < homeQScore[0] + homeQScore[1] - 15 && awayScore > homeScore);

    const res: GameResult = {
      id: game.id,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore,
      awayScore,
      quarterScores: {
        home: homeQScore,
        away: awayQScore
      },
      homePlayerStats,
      awayPlayerStats,
      topPerformers: allLines.slice(0, 3).map(l => ({
        playerId: l.playerId,
        points: l.pts,
        rebounds: l.reb,
        assists: l.ast
      })),
      playByPlay: events.map(e => ({
        time: e.time,
        text: e.text,
        type: e.type === 'highlight' ? 'info' : e.type,
        quarter: e.quarter
      })),
      date: game.day,
      season: season,
      isOvertime: quarter > 4,
      isBuzzerBeater,
      isComeback,
      isChippy: isChippy
    };
    onComplete(res);
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950 flex flex-col animate-in fade-in duration-500 font-sans">
      {/* Top Fixed Bar - Broadcast Style */}
      <div className="bg-slate-900 border-b border-slate-800 h-20 flex items-center px-8 justify-between shadow-2xl z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4 bg-slate-950 px-6 py-2 rounded-full border border-slate-800 shadow-inner">
            <div className="flex items-center gap-3">
              <TeamBadge team={homeTeam} size="xs" />
              <span className="text-xl font-display font-black text-white">{homeTeam.city.substring(0, 3).toUpperCase()}</span>
              <span className="text-3xl font-display font-black text-amber-500">{homeScore}</span>
            </div>
            <div className="w-px h-6 bg-slate-800 mx-2"></div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-display font-black text-amber-500">{awayScore}</span>
              <span className="text-xl font-display font-black text-white">{awayTeam.city.substring(0, 3).toUpperCase()}</span>
              <TeamBadge team={awayTeam} size="xs" />
            </div>
            <div className="w-px h-6 bg-slate-800 mx-4"></div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-black text-white uppercase">Q{quarter}</span>
              <span className="text-[10px] font-mono text-slate-500">{formatTime(timeLeft)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800">
            <button 
              onClick={() => setIsPlaying(!isPlaying)} 
              className={`p-2 rounded-lg transition-all ${isPlaying ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
              <FastForward size={14} className="text-slate-600" />
              <input 
                type="range" min="0.5" max="5" step="0.5" 
                value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="text-[10px] font-black text-slate-500 w-6">{speed}x</span>
            </div>
          </div>
          
          <button 
            onClick={simRest}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-900/20 flex items-center gap-2"
          >
            <TrendingUp size={14} />
            Exit & Sim Rest
          </button>
          
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Play-by-Play Feed (Left 65%) */}
        <div className="flex-[0.65] flex flex-col bg-slate-950 border-r border-slate-800 overflow-hidden">
          <div className="p-4 bg-slate-900/30 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Live Play-by-Play</h3>
            </div>
            <span className="text-[10px] font-bold text-slate-600 uppercase">Day {game.day} • Season {season}</span>
          </div>
          
          <div ref={logRef} className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth scrollbar-thin scrollbar-thumb-slate-800">
            {events.map((e, i) => {
              const isLatest = i >= events.length - 3;
              const isScore = e.type === 'score';
              const isTurnover = e.type === 'turnover';
              
              return (
                <div 
                  key={i} 
                  className={`flex gap-8 group animate-in slide-in-from-bottom-2 duration-500 ${isScore ? 'bg-amber-500/5 -mx-8 px-8 py-4 border-y border-amber-500/10' : ''}`}
                >
                  <div className="w-16 shrink-0 flex flex-col items-center pt-1">
                    <span className="text-[10px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors">{e.time}</span>
                    <span className="text-[8px] font-black text-slate-800 uppercase">Q{e.quarter}</span>
                  </div>
                  <div className="flex-1">
                    <p className={`leading-relaxed transition-all duration-500 ${
                      isLatest ? 'text-lg font-bold' : 'text-sm font-medium'
                    } ${
                      isScore ? 'text-white' : 
                      isTurnover ? 'text-orange-400' : 
                      e.type === 'foul' ? 'text-rose-400' :
                      'text-slate-400'
                    }`}>
                      {e.text}
                    </p>
                  </div>
                </div>
              );
            })}
            
            {timeLeft === 0 && quarter >= 4 && homeScore !== awayScore && (
              <div className="py-20 text-center space-y-8 animate-in zoom-in duration-700">
                <div className="space-y-2">
                  <p className="text-xs font-black text-amber-500 uppercase tracking-[0.5em]">Game Concluded</p>
                  <h2 className="text-6xl font-display font-black text-white uppercase tracking-tighter">Final Buzzer</h2>
                </div>
                <button 
                  onClick={finishGame}
                  className="px-16 py-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-3xl uppercase rounded-[2rem] transition-all shadow-2xl shadow-amber-500/40 active:scale-95 flex items-center gap-4 mx-auto"
                >
                  <Trophy size={32} />
                  Confirm Result
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Box Score Sidebar (Right 35%) */}
        <div className="flex-[0.35] flex flex-col bg-slate-900/50 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex gap-2">
            {(['combined', 'home', 'away'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                  activeTab === tab ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'combined' ? 'Box' : tab === 'home' ? homeTeam.city.substring(0, 3) : awayTeam.city.substring(0, 3)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-800">
            {/* Team Totals */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'PTS', val: activeTab === 'away' ? awayScore : activeTab === 'home' ? homeScore : homeScore + awayScore },
                { label: 'REB', val: activeTab === 'away' ? (Object.values(awayStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.reb||0),0) : activeTab === 'home' ? (Object.values(homeStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.reb||0),0) : (Object.values(homeStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.reb||0),0) + (Object.values(awayStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.reb||0),0) },
                { label: 'AST', val: activeTab === 'away' ? (Object.values(awayStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.ast||0),0) : activeTab === 'home' ? (Object.values(homeStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.ast||0),0) : (Object.values(homeStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.ast||0),0) + (Object.values(awayStats) as Partial<GamePlayerLine>[]).reduce((a,b)=>a+(b.ast||0),0) },
                { label: 'FG%', val: '44%' }
              ].map(stat => (
                <div key={stat.label} className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-center">
                  <p className="text-[8px] font-black text-slate-600 uppercase mb-1">{stat.label}</p>
                  <p className="text-lg font-display font-bold text-white">{stat.val}</p>
                </div>
              ))}
            </div>

            {/* Player Lines */}
            <div className="space-y-6">
              {(activeTab === 'combined' || activeTab === 'home') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <TeamBadge team={homeTeam} size="xs" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{homeTeam.name}</h4>
                  </div>
                  <div className="space-y-1">
                    {(Object.values(homeStats) as Partial<GamePlayerLine>[]).sort((a,b) => (b.pts||0) - (a.pts||0)).map((p, idx) => (
                      <div key={p.playerId} className={`flex justify-between items-center py-2 px-3 rounded-lg hover:bg-slate-800/30 transition-colors ${idx < 5 ? 'font-bold text-white' : 'text-slate-400'}`}>
                        <div className="flex flex-col">
                          <span className="text-xs truncate max-w-[120px]">{p.name}</span>
                          <span className="text-[8px] text-slate-600 uppercase font-black">{idx < 5 ? 'Starter' : 'Bench'}</span>
                        </div>
                        <div className="flex items-center gap-4 font-mono text-[10px]">
                          <span className="w-6 text-center text-amber-500">{p.pts}</span>
                          <span className="w-6 text-center">{p.reb}</span>
                          <span className="w-6 text-center">{p.ast}</span>
                          <span className={`w-8 text-right ${p.plusMinus! > 0 ? 'text-emerald-500' : p.plusMinus! < 0 ? 'text-rose-500' : ''}`}>
                            {p.plusMinus! > 0 ? `+${p.plusMinus}` : p.plusMinus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(activeTab === 'combined' || activeTab === 'away') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <TeamBadge team={awayTeam} size="xs" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{awayTeam.name}</h4>
                  </div>
                  <div className="space-y-1">
                    {(Object.values(awayStats) as Partial<GamePlayerLine>[]).sort((a,b) => (b.pts||0) - (a.pts||0)).map((p, idx) => (
                      <div key={p.playerId} className={`flex justify-between items-center py-2 px-3 rounded-lg hover:bg-slate-800/30 transition-colors ${idx < 5 ? 'font-bold text-white' : 'text-slate-400'}`}>
                        <div className="flex flex-col">
                          <span className="text-xs truncate max-w-[120px]">{p.name}</span>
                          <span className="text-[8px] text-slate-600 uppercase font-black">{idx < 5 ? 'Starter' : 'Bench'}</span>
                        </div>
                        <div className="flex items-center gap-4 font-mono text-[10px]">
                          <span className="w-6 text-center text-amber-500">{p.pts}</span>
                          <span className="w-6 text-center">{p.reb}</span>
                          <span className="w-6 text-center">{p.ast}</span>
                          <span className={`w-8 text-right ${p.plusMinus! > 0 ? 'text-emerald-500' : p.plusMinus! < 0 ? 'text-rose-500' : ''}`}>
                            {p.plusMinus! > 0 ? `+${p.plusMinus}` : p.plusMinus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Collapsible Bar - League Ticker */}
      <div className="bg-slate-900 border-t border-slate-800 h-12 flex items-center overflow-hidden relative group">
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-slate-900 to-transparent z-10"></div>
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-slate-900 to-transparent z-10"></div>
        
        <div className="flex gap-16 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap animate-marquee">
          <div className="flex items-center gap-4">
            <TrendingUp size={12} className="text-amber-500" />
            <span>League Leaders: {leagueLeaders}</span>
          </div>
          <div className="flex items-center gap-4">
            <Clock size={12} className="text-orange-500" />
            <span>Trade Deadline: {55 - league.currentDay > 0 ? `${55 - league.currentDay} Days Remaining` : 'Deadline Passed'}</span>
          </div>
          <div className="flex items-center gap-4">
            <Trophy size={12} className="text-emerald-500" />
            <span>Season {season} Championship Race is Heating Up</span>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
};

export default LiveGameModal;
