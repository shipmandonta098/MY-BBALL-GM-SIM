
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
  teamId?: string;           // which team performed the action
  possessionBefore?: string; // teamId that had possession entering the play
  possessionAfter?: string;  // teamId that has possession leaving the play
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
  // Tracks which team currently has possession — updated each play
  const possessionRef = useRef<string>('');

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

    // Jump ball — find centers (or highest jumping player)
    const getCenter = (team: Team) => {
      const centers = team.roster.filter(p => p.position === 'C' || p.position === 'PF');
      const pool = centers.length > 0 ? centers : team.roster.slice(0, 5);
      return pool.reduce((best, p) => (p.attributes?.jumping ?? 0) > (best.attributes?.jumping ?? 0) ? p : best, pool[0]);
    };
    const homeC = getCenter(homeTeam);
    const awayC = getCenter(awayTeam);
    const homeJump = homeC?.attributes?.jumping ?? 60;
    const awayJump = awayC?.attributes?.jumping ?? 60;
    const homeWinsTip = Math.random() < (homeJump / (homeJump + awayJump));
    const tipWinner = homeWinsTip ? homeC : awayC;
    const tipWinnerTeam = homeWinsTip ? homeTeam : awayTeam;
    const hcName = homeC?.name ?? homeTeam.name;
    const acName = awayC?.name ?? awayTeam.name;
    const twName = tipWinner?.name ?? tipWinnerTeam.name;
    const abbrevLocal = (name: string) => { const p = name.trim().split(/\s+/); return p.length < 2 ? name : `${p[0].charAt(0)}. ${p.slice(1).join(' ')}`; };
    possessionRef.current = tipWinnerTeam.id;
    setEvents([
      {
        time: '12:00',
        quarter: 1,
        text: `Jump ball: ${abbrevLocal(hcName)} vs. ${abbrevLocal(acName)}. ${abbrevLocal(twName)} wins the tip (${tipWinnerTeam.city} ${tipWinnerTeam.name}).`,
        type: 'info',
        teamId: tipWinnerTeam.id,
        possessionBefore: tipWinnerTeam.id,
        possessionAfter: tipWinnerTeam.id,
      }
    ]);
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

  const abbrev = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    return `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
  };

  const getStat = (isHome: boolean, pid: string, stat: keyof GamePlayerLine): number => {
    const map = isHome ? homeStats : awayStats;
    return (map[pid] as any)?.[stat] ?? 0;
  };

  const generatePlay = () => {
    // Use tracked possession; fall back to random only before jump ball resolves
    const possessionTeamId = possessionRef.current || (Math.random() > 0.5 ? homeTeam.id : awayTeam.id);
    const isHomePossession = possessionTeamId === homeTeam.id;
    const possessionBefore = possessionTeamId;
    // Default: possession stays — overridden below for turnovers, makes, def rebounds
    let possessionAfter = possessionBefore;
    const offTeam = isHomePossession ? homeTeam : awayTeam;
    const defTeam = isHomePossession ? awayTeam : homeTeam;
    
    const offPlayers = offTeam.roster.slice(0, 5);
    const defPlayers = defTeam.roster.slice(0, 5);
    const shooter = offPlayers[Math.floor(Math.random() * offPlayers.length)];
    const defender = defPlayers[Math.floor(Math.random() * defPlayers.length)];

    const timePassed = Math.floor(Math.random() * 15) + 5;
    const newTime = Math.max(0, timeLeft - timePassed);
    
    let eventText = "";
    let eventType: GameEvent['type'] = 'info';
    const rivalryMod = ['Hot', 'Red Hot'].includes(rivalryLevel) ? 1.5 : 1.0;

    const tov_types = ['Lost Ball Turnover', 'Bad Pass Turnover', 'Step Out of Bounds Turnover', 'Offensive Foul Turnover'];
    const foul_types = ['Shooting Foul', 'Personal Take Foul', 'Loose Ball Foul', 'Illegal Screen'];
    const shot2_types_make = ['Driving Layup', 'Floating Jump Shot', 'Turnaround Mid-range Jumper', 'Pull-up Jump Shot', 'Running Layup', 'Putback Layup'];
    const shot2_types_miss = ['Driving Layup', 'Floating Jump Shot', 'Turnaround Jumper', 'Pull-up Mid-range', 'Running Floater', 'Hook Shot'];
    const shot3_types_make = ['3pt Jump Shot', 'Corner 3-pointer', 'Step Back 3-pointer', 'Pull-up 3pt Shot', 'Catch-and-Shoot 3'];
    const shot3_types_miss = ['3pt Jump Shot', 'Step Back 3-pointer', 'Pull-up 3pt Shot', 'Turnaround 3-pointer', 'Catch-and-Shoot 3'];
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    const roll = Math.random() * 100;

    if (roll < 2) { // Technical Foul
      const p = shooter;
      let techChance = 1.0;
      if (p.personalityTraits.includes('Diva/Star') || p.personalityTraits.includes('Tough/Alpha')) techChance *= 1.2;
      if (p.personalityTraits.includes('Leader')) techChance *= 0.9;
      if (Math.random() < techChance * rivalryMod) {
        const newTechs = getStat(isHomePossession, p.id, 'techs') + 1;
        eventText = `${abbrev(p.name)} Technical Foul. (${newTechs} tech${newTechs !== 1 ? 's' : ''})`;
        eventType = 'foul';
        updatePlayerStat(isHomePossession, p.id, 'techs', 1);
        setIsChippy(true);
        if (isHomePossession) setAwayScore(s => s + 1); else setHomeScore(s => s + 1);
      } else {
        const newPf = getStat(isHomePossession, p.id, 'pf') + 1;
        eventText = `${abbrev(p.name)} Loose Ball Foul. (${newPf} foul${newPf !== 1 ? 's' : ''})`;
        eventType = 'foul';
        updatePlayerStat(isHomePossession, p.id, 'pf', 1);
      }
    } else if (roll < 3) { // Flagrant Foul
      const p = defender;
      const isF2 = Math.random() < 0.1 || (rivalryLevel === 'Red Hot' && Math.random() < 0.3);
      eventText = isF2
        ? `${abbrev(p.name)} Flagrant 2 Foul — EJECTED.`
        : `${abbrev(p.name)} Flagrant 1 Foul.`;
      eventType = 'foul';
      updatePlayerStat(!isHomePossession, p.id, 'flagrants', isF2 ? 2 : 1);
      if (isF2) updatePlayerStat(!isHomePossession, p.id, 'ejected', 1 as any);
      setIsChippy(true);
      if (isHomePossession) setHomeScore(s => s + 2); else setAwayScore(s => s + 2);
    } else if (roll < 5) { // Steal
      const stealer = defPlayers[Math.floor(Math.random() * defPlayers.length)];
      const newStl = getStat(!isHomePossession, stealer.id, 'stl') + 1;
      const newTov = getStat(isHomePossession, shooter.id, 'tov') + 1;
      eventText = `${abbrev(stealer.name)} Steal (${newStl} steal${newStl !== 1 ? 's' : ''}). ${abbrev(shooter.name)} ${pick(tov_types)} (${newTov} TO)`;
      eventType = 'turnover';
      updatePlayerStat(!isHomePossession, stealer.id, 'stl', 1);
      updatePlayerStat(isHomePossession, shooter.id, 'tov', 1);
      possessionAfter = defTeam.id; // steal → possession to stealing team
    } else if (roll < 10) { // Turnover (no steal)
      const tovType = pick(tov_types);
      const newTov = getStat(isHomePossession, shooter.id, 'tov') + 1;
      eventText = `${abbrev(shooter.name)} ${tovType} (${newTov} turnover${newTov !== 1 ? 's' : ''})`;
      eventType = 'turnover';
      updatePlayerStat(isHomePossession, shooter.id, 'tov', 1);
      possessionAfter = defTeam.id; // turnover → possession switches
    } else if (roll < 16) { // Personal Foul
      const foulType = pick(foul_types);
      const newPf = getStat(!isHomePossession, defender.id, 'pf') + 1;
      eventText = `${abbrev(defender.name)} ${foulType} (${newPf} foul${newPf !== 1 ? 's' : ''})`;
      eventType = 'foul';
      updatePlayerStat(!isHomePossession, defender.id, 'pf', 1);
    } else if (roll < 19) { // Assist + make (no shot attempt tracking separately)
      const assister = offPlayers.filter(p => p.id !== shooter.id)[Math.floor(Math.random() * 4)] ?? shooter;
      const pts = Math.random() > 0.35 ? 2 : 3;
      const shotType = pts === 3 ? pick(shot3_types_make) : pick(shot2_types_make);
      const newPts = getStat(isHomePossession, shooter.id, 'pts') + pts;
      const newAst = getStat(isHomePossession, assister.id, 'ast') + 1;
      eventText = `${abbrev(shooter.name)} ${shotType}: Made (${newPts} pts). ${abbrev(assister.name)} ${newAst} assist${newAst !== 1 ? 's' : ''}`;
      eventType = 'score';
      if (isHomePossession) {
        setHomeScore(s => s + pts);
        setHomeQScore(prev => { const n = [...prev]; n[quarter - 1] += pts; return n; });
      } else {
        setAwayScore(s => s + pts);
        setAwayQScore(prev => { const n = [...prev]; n[quarter - 1] += pts; return n; });
      }
      updatePlayerStat(isHomePossession, shooter.id, 'pts', pts);
      updatePlayerStat(isHomePossession, shooter.id, 'fgm', 1);
      updatePlayerStat(isHomePossession, shooter.id, 'fga', 1);
      if (pts === 3) { updatePlayerStat(isHomePossession, shooter.id, 'threepm', 1); updatePlayerStat(isHomePossession, shooter.id, 'threepa', 1); }
      updatePlayerStat(isHomePossession, assister.id, 'ast', 1);
      possessionAfter = defTeam.id; // made basket → possession switches
    } else { // Normal shot attempt
      const isThree = Math.random() < 0.38;
      const successChance = isThree ? (shooter.attributes?.shooting3pt ?? 50) : (shooter.attributes?.shooting ?? 50);
      const defRating = ((defender.attributes?.perimeterDef ?? 50) + defTeam.roster.reduce((acc, p) => acc + (p.attributes?.defensiveIQ ?? 50), 0) / defTeam.roster.length) / 2;
      const contestedModifier = defRating / 3;
      const baseThreshold = isThree ? 62 : 55;
      const finalChance = (successChance - contestedModifier) + (Math.random() * 30 - 15);

      updatePlayerStat(isHomePossession, shooter.id, 'fga', 1);
      if (isThree) updatePlayerStat(isHomePossession, shooter.id, 'threepa', 1);

      if (finalChance > baseThreshold) { // Make
        const pts = isThree ? 3 : 2;
        const isDunk = (shooter.attributes?.jumping ?? 0) > 85 && !isThree && Math.random() > 0.7;
        const shotType = isDunk ? 'Slam Dunk' : isThree ? pick(shot3_types_make) : pick(shot2_types_make);
        const newPts = getStat(isHomePossession, shooter.id, 'pts') + pts;
        eventText = `${abbrev(shooter.name)} ${shotType}: Made. (${newPts} points)`;
        eventType = 'score';

        if (isHomePossession) {
          setHomeScore(s => s + pts);
          setHomeQScore(prev => { const n = [...prev]; n[quarter - 1] += pts; return n; });
        } else {
          setAwayScore(s => s + pts);
          setAwayQScore(prev => { const n = [...prev]; n[quarter - 1] += pts; return n; });
        }
        updatePlayerStat(isHomePossession, shooter.id, 'pts', pts);
        updatePlayerStat(isHomePossession, shooter.id, 'fgm', 1);
        if (isThree) updatePlayerStat(isHomePossession, shooter.id, 'threepm', 1);
        possessionAfter = defTeam.id; // made basket → possession switches
      } else { // Miss
        const isBlock = (defender.attributes?.blocks ?? 0) > 80 && Math.random() > 0.8;
        if (isBlock) {
          const newBlk = getStat(!isHomePossession, defender.id, 'blk') + 1;
          const shotType = isThree ? pick(shot3_types_miss) : pick(shot2_types_miss);
          eventText = `${abbrev(shooter.name)} ${shotType}: Missed. ${abbrev(defender.name)} Blocked Shot (${newBlk} block${newBlk !== 1 ? 's' : ''})`;
          updatePlayerStat(!isHomePossession, defender.id, 'blk', 1);
        } else {
          const shotType = isThree ? pick(shot3_types_miss) : pick(shot2_types_miss);
          eventText = `${abbrev(shooter.name)} ${shotType}: Missed.`;
        }
        eventType = 'miss';

        // Rebound
        const isOffRebChance = Math.random() > 0.72;
        const rebPool = isOffRebChance ? offPlayers : defPlayers;
        const rebber = rebPool[Math.floor(Math.random() * rebPool.length)];
        const isOffReb = isOffRebChance;
        const rebIsHome = isOffReb ? isHomePossession : !isHomePossession;
        const newReb = getStat(rebIsHome, rebber.id, 'reb') + 1;
        const rebType = isOffReb ? 'Offensive Rebound' : 'Defensive Rebound';
        eventText += ` ${abbrev(rebber.name)} ${rebType} (${newReb} reb${newReb !== 1 ? 's' : ''})`;
        updatePlayerStat(rebIsHome, rebber.id, 'reb', 1);
        // OFF reb → possession stays; DEF reb → possession switches
        if (!isOffReb) possessionAfter = defTeam.id;
      }
    }

    possessionRef.current = possessionAfter;
    const newEvent: GameEvent = {
      time: formatTime(newTime),
      quarter,
      text: eventText,
      type: eventType,
      teamId: isHomePossession ? homeTeam.id : awayTeam.id,
      possessionBefore,
      possessionAfter,
    };

    setEvents(prev => [...prev, newEvent].slice(-80));
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
          
          <div ref={logRef} className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth scrollbar-thin scrollbar-thumb-slate-800">
            {events.map((e, i) => {
              const isLatest = i >= events.length - 3;
              const isScore = e.type === 'score';
              const isTurnover = e.type === 'turnover';
              const isInfo = e.type === 'info';
              const actingTeam = e.teamId ? (e.teamId === homeTeam.id ? homeTeam : awayTeam) : null;

              if (isInfo && !e.teamId) {
                // Section dividers (quarter start, etc.) — no logo, centered
                return (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-slate-800/60"></div>
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.25em] whitespace-nowrap">{e.text}</span>
                    <div className="h-px flex-1 bg-slate-800/60"></div>
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 group animate-in slide-in-from-bottom-2 duration-300 rounded-2xl px-3 py-2 transition-all ${
                    isScore
                      ? 'bg-amber-500/5 border border-amber-500/10 shadow-sm'
                      : isLatest
                      ? 'bg-slate-900/50'
                      : 'hover:bg-slate-900/30'
                  }`}
                >
                  {/* Team Logo */}
                  <div className="shrink-0 w-7 h-7 mt-0.5">
                    {actingTeam ? (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center border"
                        style={{
                          backgroundColor: actingTeam.primaryColor + '20',
                          borderColor: actingTeam.primaryColor + '40'
                        }}
                      >
                        <TeamBadge team={actingTeam} size="xs" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
                        <span className="text-[8px] text-slate-600 font-black">🏀</span>
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <div className="shrink-0 flex flex-col items-end w-12 pt-0.5">
                    <span className="text-[10px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors leading-tight">{e.time}</span>
                    <span className="text-[8px] font-black text-slate-800 uppercase leading-tight">Q{e.quarter}</span>
                  </div>

                  {/* Play Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`leading-snug transition-all duration-300 ${
                      isLatest ? 'text-base font-bold' : 'text-sm font-medium'
                    } ${
                      isScore
                        ? 'text-white'
                        : isTurnover
                        ? 'text-orange-400'
                        : e.type === 'foul'
                        ? 'text-rose-400'
                        : isInfo
                        ? 'text-amber-400'
                        : 'text-slate-400'
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
