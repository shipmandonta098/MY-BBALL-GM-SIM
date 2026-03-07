
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

interface PlayerFatigueData {
  minutesPlayed:      number; // cumulative game-minutes on floor
  fatigueLevel:       number; // 0–100
  isOnFloor:          boolean;
  consecutiveMinutes: number; // current uninterrupted stint
}

type SubReason = 'FATIGUE' | 'FOUL_TROUBLE' | 'COLD_STREAK' | 'TACTICAL' | 'QUARTER_BREAK';

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
  // Tracks last live play type to gate technical foul eligibility
  const lastPlayTypeRef = useRef<string>('');
  // Substitution / fatigue system refs
  const lineupRef           = useRef<{ home: string[]; away: string[] }>({ home: [], away: [] });
  const fatigueRef          = useRef<Record<string, PlayerFatigueData>>({});
  const gameSecondsRef      = useRef(0);   // elapsed game-seconds this quarter
  const lastSubCheckHome    = useRef(0);   // gameSecondsRef at last home periodic check
  const lastSubCheckAway    = useRef(0);   // gameSecondsRef at last away periodic check
  const quarterBreakPending = useRef(false);
  // Tendencies system refs
  const coachFrustrationRef = useRef<{ home: number; away: number }>({ home: 0, away: 0 });
  const streakRef = useRef<Record<string, { consecutive: number; lastMade: boolean }>>({}); 

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
          offReb: 0,
          defReb: 0,
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

    // Lineup and fatigue initialisation
    lineupRef.current = {
      home: homeTeam.roster.slice(0, 5).map(p => p.id),
      away: awayTeam.roster.slice(0, 5).map(p => p.id),
    };
    const ft: Record<string, PlayerFatigueData> = {};
    homeTeam.roster.forEach((p, i) => {
      ft[p.id] = { minutesPlayed: 0, fatigueLevel: 0, isOnFloor: i < 5, consecutiveMinutes: 0 };
    });
    awayTeam.roster.forEach((p, i) => {
      ft[p.id] = { minutesPlayed: 0, fatigueLevel: 0, isOnFloor: i < 5, consecutiveMinutes: 0 };
    });
    fatigueRef.current      = ft;
    gameSecondsRef.current  = 0;
    lastSubCheckHome.current = 0;
    lastSubCheckAway.current = 0;

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

  const posGroup = (pos: string): 'Guard' | 'Wing' | 'Big' =>
    (pos === 'PG' || pos === 'SG') ? 'Guard' : pos === 'C' ? 'Big' : 'Wing';

  const generatePlay = () => {
    // Use tracked possession; fall back to random only before jump ball resolves
    const possessionTeamId = possessionRef.current || (Math.random() > 0.5 ? homeTeam.id : awayTeam.id);
    const isHomePossession = possessionTeamId === homeTeam.id;
    const possessionBefore = possessionTeamId;
    // Default: possession stays — overridden below for turnovers, makes, def rebounds
    let possessionAfter = possessionBefore;
    let overrideTeamId: string | undefined; // BUG 1 FIX: for steals, badge shows defender
    const offTeam = isHomePossession ? homeTeam : awayTeam;
    const defTeam = isHomePossession ? awayTeam : homeTeam;
    
    // Use live lineup (updated by substitutions) rather than static roster order
    const liveHomeIds = lineupRef.current.home.length === 5 ? lineupRef.current.home : homeTeam.roster.slice(0, 5).map(p => p.id);
    const liveAwayIds = lineupRef.current.away.length === 5 ? lineupRef.current.away : awayTeam.roster.slice(0, 5).map(p => p.id);
    const offPlayers = (isHomePossession ? liveHomeIds : liveAwayIds)
      .map(id => offTeam.roster.find(p => p.id === id))
      .filter(Boolean) as Player[];
    const defPlayers = (isHomePossession ? liveAwayIds : liveHomeIds)
      .map(id => defTeam.roster.find(p => p.id === id))
      .filter(Boolean) as Player[];
    if (!offPlayers.length || !defPlayers.length) return;
    const shooter = offPlayers[Math.floor(Math.random() * offPlayers.length)];
    const defender = defPlayers[Math.floor(Math.random() * defPlayers.length)];

    // ── Coach Badge Effects (computed fresh each possession) ──────────────
    const _offBadges = (isHomePossession ? homeTeam : awayTeam).staff?.headCoach?.badges ?? [];
    const _defBadges = (isHomePossession ? awayTeam : homeTeam).staff?.headCoach?.badges ?? [];
    const isClutchTime = quarter >= 4 && timeLeft <= 120 && Math.abs(homeScore - awayScore) <= 5;
    const badge = {
      offArch:     _offBadges.includes('Offensive Architect'),
      devGenius:   _offBadges.includes('Developmental Genius'),
      paceMaster:  _offBadges.includes('Pace Master'),
      starHandler: _offBadges.includes('Star Handler'),
      offClutch:   isClutchTime && _offBadges.includes('Clutch Specialist'),
      defGuru:     _defBadges.includes('Defensive Guru'),
      defClutch:   isClutchTime && _defBadges.includes('Clutch Specialist'),
    };
    // Developmental Genius: young (≤23) on-floor players get +5 to all attributes
    const devBoost      = (p: Player) => badge.devGenius && p.age <= 23 ? 5 : 0;
    // Clutch Specialist (off): all player ratings +6 in crunch time (≤2:00, score diff ≤5)
    const clutchBoost   = badge.offClutch ? 6 : 0;
    // Defensive Guru: opp FG −8%, opp 3PT additional −5%
    const defGuruFgPen  = badge.defGuru   ? 8 : 0;
    const defGuru3Pen   = badge.defGuru   ? 5 : 0;
    // Clutch Specialist (def): opp FG −5% in crunch time
    const defClutchPen  = badge.defClutch ? 5 : 0;
    // Offensive Architect: 3PT accuracy +8%, 3PT attempt rate 38% → 43%
    const offArch3Boost = badge.offArch   ? 8 : 0;
    const threePtRate   = 0.38 + (badge.offArch ? 0.05 : 0);
    // Pace Master: transition/fast-break bucket fires more often (+4 to roll threshold)
    const paceBoost     = badge.paceMaster ? 4 : 0;

    const timePassed = Math.floor(Math.random() * 15) + 5;
    const newTime = Math.max(0, timeLeft - timePassed);

    // Advance fatigue clock
    gameSecondsRef.current += timePassed;
    updateFatigue(timePassed);

    let eventText = "";
    let eventType: GameEvent['type'] = 'info';
    const rivalryMod = ['Hot', 'Red Hot'].includes(rivalryLevel) ? 1.5 : 1.0;
    // Accumulate multiple events (e.g. foul + free throws) to push as one batch
    const batchEvents: GameEvent[] = [];
    const makeEvent = (text: string, type: GameEvent['type'], teamId: string | undefined,
      pBefore: string, pAfter: string): GameEvent => ({
      time: formatTime(newTime), quarter, text, type, teamId, possessionBefore: pBefore, possessionAfter: pAfter
    });

    // Unified turnover table: type is rolled FIRST; steal credit is derived from the type.
    // This prevents impossible combinations like "Steal + Step Out of Bounds".
    type TovType = 'STOLEN' | 'BAD_PASS' | 'LOST_BALL' | 'OFFENSIVE_FOUL' | 'TRAVEL' | 'SHOT_CLOCK' | 'STEP_OUT' | 'OTHER';
    const TOV_TABLE: { type: TovType; weight: number; hasSteal: boolean }[] = [
      { type: 'BAD_PASS',       weight: 35, hasSteal: true  }, // intercepted pass → stealer credited
      { type: 'STOLEN',         weight: badge.defGuru ? 30 : 25, hasSteal: true  }, // direct strip/poke
      { type: 'LOST_BALL',      weight: 20, hasSteal: true  }, // loose ball stripped
      { type: 'OFFENSIVE_FOUL', weight: 12, hasSteal: false },
      { type: 'TRAVEL',         weight: 10, hasSteal: false },
      { type: 'SHOT_CLOCK',     weight: 8,  hasSteal: false },
      { type: 'STEP_OUT',       weight: 3,  hasSteal: false }, // never combined with a steal
      { type: 'OTHER',          weight: 2,  hasSteal: false },
    ];
    const pickTovEntry = () => {
      const total = TOV_TABLE.reduce((s, t) => s + t.weight, 0);
      let r = Math.random() * total;
      for (const t of TOV_TABLE) { r -= t.weight; if (r <= 0) return t; }
      return TOV_TABLE[0];
    };
    const non_shooting_fouls = ['Personal Take Foul', 'Loose Ball Foul', 'Illegal Screen'];
    const shot2_types_make = ['Driving Layup', 'Floating Jump Shot', 'Turnaround Mid-range Jumper', 'Pull-up Jump Shot', 'Running Layup', 'Putback Layup'];
    const shot2_types_miss = ['Driving Layup', 'Floating Jump Shot', 'Turnaround Jumper', 'Pull-up Mid-range', 'Running Floater', 'Hook Shot'];
    const shot3_types_make = ['3pt Jump Shot', 'Corner 3-pointer', 'Step Back 3-pointer', 'Pull-up 3pt Shot', 'Catch-and-Shoot 3'];
    const shot3_types_miss = ['3pt Jump Shot', 'Step Back 3-pointer', 'Pull-up 3pt Shot', 'Turnaround 3-pointer', 'Catch-and-Shoot 3'];
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    // ── Helpers ──────────────────────────────────────────────────────────────
    const makeFTSequence = (
      fouledPlayer: typeof shooter,
      fouledTeamIsHome: boolean,
      numFTs: number,
      foulEventText: string,
      pBefore: string
    ) => {
      const fouledTeam = fouledTeamIsHome ? homeTeam : awayTeam;
      const oppTeam   = fouledTeamIsHome ? awayTeam : homeTeam;
      // Foul event itself
      batchEvents.push(makeEvent(foulEventText, 'foul', oppTeam.id, pBefore, pBefore));
      updatePlayerStat(!fouledTeamIsHome, defender.id, 'pf', 1);
      // Generate each free throw
      let lastFTMade = false;
      for (let i = 1; i <= numFTs; i++) {
        const ftSkill = fouledPlayer.attributes?.freeThrow ?? 70;
        lastFTMade = Math.random() * 100 < ftSkill;
        const newFtm = getStat(fouledTeamIsHome, fouledPlayer.id, 'ftm') + (lastFTMade ? 1 : 0);
        const newFta = getStat(fouledTeamIsHome, fouledPlayer.id, 'fta') + i;
        const ftText = `${abbrev(fouledPlayer.name)} Free Throw ${i} of ${numFTs}: ${lastFTMade ? 'Made' : 'Missed'}. (${newFtm}/${newFta} FT)`;
        // Possession stays with fouled team throughout FT sequence
        batchEvents.push(makeEvent(ftText, lastFTMade ? 'score' : 'miss', fouledTeam.id, pBefore, pBefore));
        if (lastFTMade) {
          updatePlayerStat(fouledTeamIsHome, fouledPlayer.id, 'ftm', 1);
          updatePlayerStat(fouledTeamIsHome, fouledPlayer.id, 'pts', 1);
          updatePlusMinus(fouledTeamIsHome, 1);
          if (fouledTeamIsHome) {
            setHomeScore(s => s + 1);
            setHomeQScore(prev => { const n = [...prev]; n[quarter - 1] += 1; return n; });
          } else {
            setAwayScore(s => s + 1);
            setAwayQScore(prev => { const n = [...prev]; n[quarter - 1] += 1; return n; });
          }
        }
        updatePlayerStat(fouledTeamIsHome, fouledPlayer.id, 'fta', 1);
      }
      // After last FT: if made → possession to opponent; if missed → live rebound (off team keeps ~28%)
      if (lastFTMade) {
        possessionAfter = oppTeam.id;
      } else {
        const offRebChance = Math.random() > 0.72;
        possessionAfter = offRebChance ? fouledTeam.id : oppTeam.id;
        const rebberPool = offRebChance ? fouledTeam.roster.slice(0, 5) : oppTeam.roster.slice(0, 5);
        const rebber = rebberPool[Math.floor(Math.random() * rebberPool.length)];
        const rebIsHome = offRebChance ? fouledTeamIsHome : !fouledTeamIsHome;
        updatePlayerStat(rebIsHome, rebber.id, 'reb', 1);
        updatePlayerStat(rebIsHome, rebber.id, offRebChance ? 'offReb' : 'defReb', 1);
        batchEvents[batchEvents.length - 1].text += ` ${abbrev(rebber.name)} ${offRebChance ? 'Offensive' : 'Defensive'} Rebound.`;
      }
      // Fix possessionAfter on the last event
      batchEvents[batchEvents.length - 1].possessionAfter = possessionAfter;
    };

    // ── Tech foul helper (only call in eligible moments) ─────────────────────
    const tryTech = (eligibleTeamIsHome: boolean): boolean => {
      const techEligible = ['score', 'miss'].includes(lastPlayTypeRef.current);
      if (!techEligible) return false;
      const techRoll = Math.random();
      const player = (eligibleTeamIsHome ? offPlayers : defPlayers)[0];
      if (!player?.id) return false;
      let threshold = 0.025; // 2.5% base
      if (player.personalityTraits?.includes('Professional')) return false; // Professional never gets a tech
      if (player.personalityTraits?.includes('Diva/Star') || player.personalityTraits?.includes('Tough/Alpha')) threshold *= 1.4 * rivalryMod;
      if (player.personalityTraits?.includes('Hot Head')) threshold *= 1.8 * rivalryMod;
      if (player.personalityTraits?.includes('Leader')) threshold *= 0.7;
      if (techRoll > threshold) return false;

      const newTechs = getStat(eligibleTeamIsHome, player.id, 'techs') + 1;
      const techText = `${abbrev(player.name)} Technical Foul. (${newTechs} tech${newTechs !== 1 ? 's' : ''})`;
      // Tech: opponent shoots 1 FT, then original possession resumes
      batchEvents.push(makeEvent(techText, 'foul', eligibleTeamIsHome ? offTeam.id : defTeam.id, possessionBefore, possessionBefore));
      updatePlayerStat(eligibleTeamIsHome, player.id, 'techs', 1);
      setIsChippy(true);
      // Opponent gets 1 FT
      const oppIsHome = !eligibleTeamIsHome;
      const oppPlayers = (oppIsHome ? homeTeam : awayTeam).roster.slice(0, 5).filter(p => p?.id);
      const ftShooter = oppPlayers[Math.floor(Math.random() * oppPlayers.length)];
      const ftMade = Math.random() < 0.75; // tech FTs ~75% make rate
      const ftText = `${abbrev(ftShooter.name)} Technical Free Throw: ${ftMade ? 'Made' : 'Missed'}.`;
      batchEvents.push(makeEvent(ftText, ftMade ? 'score' : 'miss', oppIsHome ? homeTeam.id : awayTeam.id, possessionBefore, possessionBefore));
      if (ftMade) {
        updatePlayerStat(oppIsHome, ftShooter.id, 'ftm', 1);
        updatePlayerStat(oppIsHome, ftShooter.id, 'pts', 1);      updatePlusMinus(oppIsHome, 1);        if (oppIsHome) { setHomeScore(s => s + 1); } else { setAwayScore(s => s + 1); }
      }
      updatePlayerStat(oppIsHome, ftShooter.id, 'fta', 1);
      // Original possession resumes — possessionAfter stays as possessionBefore
      return true;
    };

    // ── Personality & Tendency Effects ────────────────────────────────────
    const frustSide = (isHomePossession ? 'home' : 'away') as 'home' | 'away';
    const shooterTraits = shooter.personalityTraits ?? [];
    const shooterTend   = shooter.tendencies;
    // Streaky: ±shot bonus for 2+ consecutive makes/misses
    const streakData  = streakRef.current[shooter.id] ?? { consecutive: 0, lastMade: false };
    const streakBonus = shooterTraits.includes('Streaky')
      ? ( streakData.lastMade  && streakData.consecutive >= 2 ?  10
        : !streakData.lastMade && streakData.consecutive >= 2 ?  -8 : 0)
      : 0;
    // Conflict: iso-heavy vs Offensive Architect
    if (badge.offArch && (shooterTend?.offensiveTendencies.isoHeavy ?? 50) > 60) {
      const isoProb = shooterTraits.includes('Lazy') ? 0.50 : shooterTraits.includes('Professional') ? 0.10 : 0.30;
      if (Math.random() < isoProb) coachFrustrationRef.current[frustSide] = Math.min(100, coachFrustrationRef.current[frustSide] + 3);
    }
    // Conflict: post-up vs Pace Master
    if (badge.paceMaster && (shooterTend?.offensiveTendencies.postUp ?? 50) > 65 && !shooterTraits.includes('Leader')) {
      if (Math.random() < 0.25) coachFrustrationRef.current[frustSide] = Math.min(100, coachFrustrationRef.current[frustSide] + 2);
    }
    // Conflict: gambles vs Defensive Guru → defensive breakdown event
    if (badge.defGuru && (shooterTend?.defensiveTendencies.gambles ?? 50) > 60) {
      const gambleProb = shooterTraits.includes('Hot Head') ? 0.40 : 0.25;
      if (Math.random() < gambleProb) {
        coachFrustrationRef.current[frustSide] = Math.min(100, coachFrustrationRef.current[frustSide] + 4);
        batchEvents.push(makeEvent(`${abbrev(shooter.name)} gambles on defense — breakdown!`, 'turnover', defTeam.id, possessionBefore, possessionBefore));
      }
    }
    // Frustration milestones: 50+ → timeout event; 75+ → force substitution
    const curFrust = coachFrustrationRef.current[frustSide];
    if (curFrust >= 75 && curFrust < 80) {
      runSubstitutions(isHomePossession ? homeTeam : awayTeam, isHomePossession, batchEvents, newTime, 'FATIGUE');
      coachFrustrationRef.current[frustSide] = Math.max(0, curFrust - 20);
    } else if (curFrust >= 50 && curFrust < 55) {
      batchEvents.push(makeEvent(`TIMEOUT — scheme breakdown! Coach frustration: ${curFrust}`, 'info', offTeam.id, possessionBefore, possessionBefore));
      coachFrustrationRef.current[frustSide] = Math.max(0, curFrust - 15);
    }

    const roll = Math.random() * 100;

    if (roll < 1) { // Flagrant Foul
      const p = defender;
      const isF2 = Math.random() < 0.1 || (rivalryLevel === 'Red Hot' && Math.random() < 0.3);
      eventText = isF2
        ? `${abbrev(p.name)} Flagrant 2 Foul — EJECTED.`
        : `${abbrev(p.name)} Flagrant 1 Foul.`;
      eventType = 'foul';
      updatePlayerStat(!isHomePossession, p.id, 'flagrants', isF2 ? 2 : 1);
      if (isF2) updatePlayerStat(!isHomePossession, p.id, 'ejected', 1 as any);
      setIsChippy(true);
      // Flagrant → 2 FTs for the fouled team + possession
      makeFTSequence(shooter, isHomePossession, 2, eventText, possessionBefore);
      eventText = ''; // already pushed via batch
    } else if (roll < 10) { // Turnover — type rolled first; steal credit derived from type (never independent)
      const tovEntry = pickTovEntry();
      const newTov = getStat(isHomePossession, shooter.id, 'tov') + 1;
      updatePlayerStat(isHomePossession, shooter.id, 'tov', 1);
      possessionAfter = defTeam.id;
      eventType = 'turnover';

      if (tovEntry.hasSteal) {
        // STOLEN / BAD_PASS / LOST_BALL → stealer gets credit
        const stealer = defPlayers[Math.floor(Math.random() * defPlayers.length)];
        const newStl = getStat(!isHomePossession, stealer.id, 'stl') + 1;
        updatePlayerStat(!isHomePossession, stealer.id, 'stl', 1);
        overrideTeamId = defTeam.id; // badge shows stealing (defensive) team
        if (tovEntry.type === 'STOLEN') {
          eventText = `${abbrev(stealer.name)} Steal (${newStl} stl). ${abbrev(shooter.name)} Turnover (${newTov} TO).`;
        } else if (tovEntry.type === 'BAD_PASS') {
          eventText = `${abbrev(stealer.name)} Steal (${newStl} stl). ${abbrev(shooter.name)} Bad Pass Turnover (${newTov} TO).`;
        } else { // LOST_BALL
          eventText = `${abbrev(stealer.name)} Steal (${newStl} stl). ${abbrev(shooter.name)} Lost Ball Turnover (${newTov} TO).`;
        }
      } else if (tovEntry.type === 'STEP_OUT') {
        // No defender mentioned — impossible to have a steal here
        eventText = `${abbrev(shooter.name)} Steps Out of Bounds. (${newTov} TO).`;
      } else if (tovEntry.type === 'TRAVEL') {
        eventText = `${abbrev(shooter.name)} Travel Violation. (${newTov} TO).`;
      } else if (tovEntry.type === 'OFFENSIVE_FOUL') {
        const chargeTaker = defPlayers[Math.floor(Math.random() * defPlayers.length)];
        updatePlayerStat(!isHomePossession, chargeTaker.id, 'pf', 1);
        eventText = `${abbrev(shooter.name)} Offensive Foul. Charge taken by ${abbrev(chargeTaker.name)}. (${newTov} TO).`;
      } else if (tovEntry.type === 'SHOT_CLOCK') {
        eventText = `Shot Clock Violation — ${offTeam.name} Turnover. (${newTov} TO).`;
      } else {
        eventText = `${abbrev(shooter.name)} Turnover (${newTov} TO).`;
      }
    } else if (roll < 15) { // Non-shooting Personal Foul (Loose Ball, Illegal Screen, Take Foul)
      const foulType = pick(non_shooting_fouls);
      const newPf = getStat(!isHomePossession, defender.id, 'pf') + 1;
      eventText = `${abbrev(defender.name)} ${foulType} (${newPf} foul${newPf !== 1 ? 's' : ''})`;
      eventType = 'foul';
      updatePlayerStat(!isHomePossession, defender.id, 'pf', 1);
      // possession stays — fouled team inbounds
    } else if (roll < 20) { // Shooting Foul — mandatory FT sequence
      const isThreePtFoul = Math.random() < 0.20;
      const numFTs = isThreePtFoul ? 3 : 2;
      const foulText = `${abbrev(defender.name)} Shooting Foul on ${abbrev(shooter.name)} (${isThreePtFoul ? '3-pt' : '2-pt'} attempt). ${numFTs} free throws.`;
      updatePlayerStat(!isHomePossession, defender.id, 'pf', 1);
      makeFTSequence(shooter, isHomePossession, numFTs, foulText, possessionBefore);
      eventText = ''; // pushed via batch
    } else if (roll < 23) { // And-One shooting foul (shot was made)
      const isThree = Math.random() < 0.1;
      const pts = isThree ? 3 : 2;
      const shotType = isThree ? pick(shot3_types_make) : pick(shot2_types_make);
      const newPts = getStat(isHomePossession, shooter.id, 'pts') + pts;
      const makeText = `${abbrev(shooter.name)} ${shotType}: Made AND FOUL! (${newPts} pts)`;
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
      if (isThree) { updatePlayerStat(isHomePossession, shooter.id, 'threepm', 1); updatePlayerStat(isHomePossession, shooter.id, 'threepa', 1); }
      updatePlusMinus(isHomePossession, pts);
      // And-one → 1 FT, then possession switches after
      batchEvents.push(makeEvent(makeText, 'score', offTeam.id, possessionBefore, possessionBefore));
      makeFTSequence(shooter, isHomePossession, 1, `${abbrev(defender.name)} Shooting Foul (And-One). 1 free throw.`, possessionBefore);
      // After and-one FT sequence, possession goes to defense regardless
      possessionAfter = defTeam.id;
      batchEvents[batchEvents.length - 1].possessionAfter = possessionAfter;
      eventText = '';
    } else if (roll < (27 + paceBoost)) { // Assist + make (Pace Master: more transition buckets)
      const assister = offPlayers.filter(p => p.id !== shooter.id)[Math.floor(Math.random() * 4)] ?? shooter;
      const pts = Math.random() > 0.35 ? 2 : 3;
      const shotType = pts === 3 ? pick(shot3_types_make) : pick(shot2_types_make);
      const newPts = getStat(isHomePossession, shooter.id, 'pts') + pts;
      const newAst = getStat(isHomePossession, assister.id, 'ast') + 1;
      // BUG 4 FIX: canonical assist format
      eventText = `${abbrev(shooter.name)} ${shotType}: Made. (${newPts} pts). Assist by ${abbrev(assister.name)} (${newAst} ast).`;
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
      updatePlusMinus(isHomePossession, pts);
      possessionAfter = defTeam.id; // made basket → possession switches
      // After a made basket is an eligible moment for a tech taunt
      tryTech(isHomePossession);
    } else { // Normal shot attempt
      const isThree = Math.random() < threePtRate; // Offensive Architect: 38% → 43%

      // ── Cinematic ISO / Drive / Post-Up pre-event (non-3pt, ~50% chance) ──────
      if (!isThree && Math.random() < 0.50) {
        const tendOff  = shooterTend?.offensiveTendencies;
        const isoW     = tendOff?.isoHeavy       ?? 50;
        const driveW   = tendOff?.driveToBasket  ?? 50;
        const postW    = tendOff?.postUp          ?? 50;
        const totalW   = isoW + driveW + postW;
        const roll2    = Math.random() * totalW;
        const action   = roll2 < isoW ? 'ISO' : roll2 < isoW + driveW ? 'DRIVE' : 'POST_UP';
        const n = abbrev(shooter.name);
        const d = abbrev(defender.name);
        let setup = '';
        let attack = '';
        if (action === 'ISO') {
          const setups  = [
            `${n} calls for the isolation.`,
            `${n} waves teammates away — this is one-on-one.`,
            `${n} sizes up ${d} at the top of the arc.`,
            `${n} demands the ball and clears out the paint.`,
          ];
          const attacks = [
            `${n} attacks off the dribble, probing ${d}'s stance.`,
            `${n} crosses over and drives hard to his spot.`,
            `${n} creates separation with a hesitation move.`,
            `${n} makes his move — ${d} has to stay in front.`,
          ];
          setup  = setups[Math.floor(Math.random()  * setups.length)];
          attack = attacks[Math.floor(Math.random() * attacks.length)];
        } else if (action === 'DRIVE') {
          const setups  = [
            `${n} surveys the floor at the wing.`,
            `${n} receives off the screen and sizes up the lane.`,
            `${n} dribbles towards the paint, looking to attack.`,
            `${n} reads the defense and probes the interior.`,
          ];
          const attacks = [
            `${n} explodes to the rim — ${d} scrambles to cut him off!`,
            `${n} splits the defense in the paint!`,
            `${n} drives baseline, shoulder down, into contact!`,
            `${n} goes full speed into the lane!`,
          ];
          setup  = setups[Math.floor(Math.random()  * setups.length)];
          attack = attacks[Math.floor(Math.random() * attacks.length)];
        } else { // POST_UP
          const setups  = [
            `${n} catches on the block and backs down ${d}.`,
            `${n} establishes deep position in the post.`,
            `${n} seals off ${d} on the low block.`,
            `${n} sets up in the mid-post, calling for the entry pass.`,
          ];
          const attacks = [
            `${n} turns over the shoulder, looking for his move.`,
            `${n} pump-fakes ${d} off his feet, then rises!`,
            `${n} drops his shoulder on the drive from the block.`,
            `${n} spins baseline off the post!`,
          ];
          setup  = setups[Math.floor(Math.random()  * setups.length)];
          attack = attacks[Math.floor(Math.random() * attacks.length)];
        }
        batchEvents.push(makeEvent(setup,  'info', offTeam.id, possessionBefore, possessionBefore));
        batchEvents.push(makeEvent(attack, 'info', offTeam.id, possessionBefore, possessionBefore));
      }
      // ── End cinematic pre-event ─────────────────────────────────────────────

      // Base attribute + all badge modifiers layered on
      const baseAttr = isThree
        ? (shooter.attributes?.shooting3pt ?? 50)
        : (shooter.attributes?.shooting    ?? 50);
      const successChance = baseAttr
        + devBoost(shooter)                       // Dev Genius: ≤23 yr old +5
        + clutchBoost                             // Clutch Specialist (off): +6 crunch time
        + (isThree ? offArch3Boost : 0)           // Offensive Architect: +8 on 3s
        - defGuruFgPen                            // Defensive Guru: −8% all FG
        - (isThree ? defGuru3Pen  : 0)            // Defensive Guru: −5% additional on 3s
        - defClutchPen                            // Clutch Specialist (def): −5% crunch time
        + streakBonus;                            // Streaky: hot streak +10, cold streak −8
      // Defensive Guru: defensive rating is amplified (blocks/closeouts better)
      const defRating = ((defender.attributes?.perimeterDef ?? 50)
        + (badge.defGuru ? 8 : 0)                // Defensive Guru: +8 def IQ
        + defTeam.roster.reduce((acc, p) => acc + (p.attributes?.defensiveIQ ?? 50), 0) / defTeam.roster.length) / 2;
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
        // BUG 3 FIX: Catch-and-Shoot & Corner 3 always award an assist on a make
        if (shotType === 'Catch-and-Shoot 3' || shotType === 'Corner 3-pointer') {
          const casAssister = offPlayers.filter(p => p.id !== shooter.id)[Math.floor(Math.random() * 4)] ?? shooter;
          const casAst = getStat(isHomePossession, casAssister.id, 'ast') + 1;
          // BUG 4 FIX: canonical format for CAS assists
          eventText = `${abbrev(shooter.name)} ${shotType}: Made. (${newPts} pts). Assist by ${abbrev(casAssister.name)} (${casAst} ast).`;
          updatePlayerStat(isHomePossession, casAssister.id, 'ast', 1);
        } else {
          eventText = `${abbrev(shooter.name)} ${shotType}: Made. (${newPts} pts)`;
        }
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
        updatePlusMinus(isHomePossession, pts);
        // Streaky: update streak tracker on made shot
        { const s = streakRef.current[shooter.id] ?? { consecutive: 0, lastMade: false };
          streakRef.current[shooter.id] = { consecutive: s.lastMade ? s.consecutive + 1 : 1, lastMade: true }; }
        possessionAfter = defTeam.id; // made basket → possession switches
        tryTech(isHomePossession);
      } else { // Miss
        // Defensive Guru: block probability +10% (threshold 80→75, random check 0.80→0.70)
        const blockAttrThresh = badge.defGuru ? 75 : 80;
        const blockRandThresh = badge.defGuru ? 0.70 : 0.80;
        const isBlock = (defender.attributes?.blocks ?? 0) > blockAttrThresh && Math.random() > blockRandThresh;
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
        // Streaky: update streak tracker on missed shot
        { const s = streakRef.current[shooter.id] ?? { consecutive: 0, lastMade: true };
          streakRef.current[shooter.id] = { consecutive: !s.lastMade ? s.consecutive + 1 : 1, lastMade: false }; }

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
        updatePlayerStat(rebIsHome, rebber.id, isOffReb ? 'offReb' : 'defReb', 1);
        // OFF reb → possession stays; DEF reb → possession switches
        if (!isOffReb) possessionAfter = defTeam.id;
      }
      // ── Flush result into batchEvents when cinematic pre-events are present ──
      if (batchEvents.length > 0 && eventText) {
        batchEvents.push(makeEvent(eventText, eventType, overrideTeamId ?? offTeam.id, possessionBefore, possessionAfter));
        eventText = '';
      }
    }

    possessionRef.current = possessionAfter;
    lastPlayTypeRef.current = eventType;

    // ── Periodic substitution check (after every dead-ball / natural stop) ──
    {
      const coach        = homeTeam.staff?.headCoach;
      const isPaceMaster = coach?.badges?.includes('Pace Master') ?? false;
      const homeInterval = isPaceMaster ? 150 : 240; // 2.5 vs 4 min in game-seconds
      const awayCoach    = awayTeam.staff?.headCoach;
      const awayPace     = awayCoach?.badges?.includes('Pace Master') ?? false;
      const awayInterval = awayPace ? 150 : 240;

      const subEvts: GameEvent[] = [];
      if (gameSecondsRef.current - lastSubCheckHome.current >= homeInterval) {
        lastSubCheckHome.current = gameSecondsRef.current;
        runSubstitutions(homeTeam, true,  subEvts, newTime, 'FATIGUE');
      }
      if (gameSecondsRef.current - lastSubCheckAway.current >= awayInterval) {
        lastSubCheckAway.current = gameSecondsRef.current;
        runSubstitutions(awayTeam, false, subEvts, newTime, 'FATIGUE');
      }

      // Always check for mandatory foul-trouble/cold-streak subs every dead ball
      if (eventType === 'foul' || eventType === 'turnover') {
        runSubstitutions(homeTeam, true,  subEvts, newTime, 'TACTICAL');
        runSubstitutions(awayTeam, false, subEvts, newTime, 'TACTICAL');
      }

      if (subEvts.length > 0) {
        // Append sub events after whatever just happened
        const allEvts = [...(batchEvents.length > 0 ? batchEvents : [{ time: formatTime(newTime), quarter, text: eventText, type: eventType, teamId: overrideTeamId ?? (isHomePossession ? homeTeam.id : awayTeam.id), possessionBefore, possessionAfter }]), ...subEvts];
        possessionRef.current = allEvts[allEvts.length - 1].possessionAfter ?? possessionAfter;
        lastPlayTypeRef.current = allEvts[allEvts.length - 1].type;
        setEvents(prev => [...prev, ...allEvts].slice(-80));
        setTimeLeft(newTime);
        return;
      }
    }

    // If batch was populated (foul + FTs), push all and skip the single-event path
    if (batchEvents.length > 0) {
      possessionRef.current = batchEvents[batchEvents.length - 1].possessionAfter ?? possessionAfter;
      lastPlayTypeRef.current = batchEvents[batchEvents.length - 1].type;
      setEvents(prev => [...prev, ...batchEvents].slice(-80));
      setTimeLeft(newTime);
      return;
    }

    const newEvent: GameEvent = {
      time: formatTime(newTime),
      quarter,
      text: eventText,
      type: eventType,
      teamId: overrideTeamId ?? (isHomePossession ? homeTeam.id : awayTeam.id),
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

  // Update plus/minus for all 5 on-court players when a basket is scored
  const updatePlusMinus = (scoringTeamIsHome: boolean, pts: number) => {
    const hIds = lineupRef.current.home.length > 0
      ? lineupRef.current.home
      : homeTeam.roster.slice(0, 5).map(p => p.id);
    const aIds = lineupRef.current.away.length > 0
      ? lineupRef.current.away
      : awayTeam.roster.slice(0, 5).map(p => p.id);
    hIds.forEach(pid => updatePlayerStat(true,  pid, 'plusMinus', scoringTeamIsHome ? pts  : -pts));
    aIds.forEach(pid => updatePlayerStat(false, pid, 'plusMinus', scoringTeamIsHome ? -pts : pts));
  };

  // ── Fatigue updater (call once per play with seconds elapsed) ────────────
  const updateFatigue = (timePassed: number) => {
    const mins = timePassed / 60;
    const ft   = fatigueRef.current;
    [...homeTeam.roster, ...awayTeam.roster].forEach(p => {
      if (!ft[p.id]) return;
      if (ft[p.id].isOnFloor) {
        ft[p.id].minutesPlayed      += mins;
        // Trait-based fatigue build rate
        const traitList  = p.personalityTraits ?? [];
        const buildRate  = traitList.includes('Lazy')         ? 1.25
                         : traitList.includes('Workhorse')    ? 0.80
                         : traitList.includes('Professional') ? 0.85
                         : traitList.includes('Gym Rat')      ? 0.90
                         : 1.0;
        ft[p.id].fatigueLevel        = Math.min(100, ft[p.id].fatigueLevel + mins * buildRate);
        ft[p.id].consecutiveMinutes += mins;
      } else {
        // Bench recovery: half the build rate
        ft[p.id].fatigueLevel = Math.max(0, ft[p.id].fatigueLevel - mins * 0.5);
      }
    });
  };

  // ── Substitution engine ──────────────────────────────────────────────────
  const runSubstitutions = (
    team: Team,
    isHome: boolean,
    batchEvts: GameEvent[],
    currentTime: number,
    triggerReason: SubReason
  ) => {
    const coach         = team.staff?.headCoach;
    const motivation    = coach?.ratingMotivation ?? 70;
    const clutch        = coach?.ratingClutch     ?? 70;
    const isDevGenius   = coach?.badges?.includes('Developmental Genius') ?? false;
    const hasStarHandler = coach?.badges?.includes('Star Handler') ?? false;

    const currentLineup = [...(isHome ? lineupRef.current.home : lineupRef.current.away)];
    const ft      = fatigueRef.current;
    const stats   = isHome ? homeStats : awayStats;
    const scoreDiff = homeScore - awayScore;
    const isDown10  = isHome ? scoreDiff <= -10 : scoreDiff >= 10;

    const onFloor  = currentLineup
      .map(id => team.roster.find(p => p.id === id))
      .filter(Boolean) as Player[];
    const offBench = team.roster.filter(p => !currentLineup.includes(p.id));

    type SubOp = { out: Player; in: Player; reason: SubReason };
    const ops: SubOp[]         = [];
    const usedFromBench        = new Set<string>();

    for (const player of onFloor) {
      if (ops.length >= 2) break; // max 2 subs at once

      const fd  = ft[player.id] ?? { minutesPlayed: 0, fatigueLevel: 0, isOnFloor: true, consecutiveMinutes: 0 };
      const pf  = (stats[player.id]?.pf  ?? 0) as number;
      const fga = (stats[player.id]?.fga ?? 0) as number;
      const fgm = (stats[player.id]?.fgm ?? 0) as number;

      let shouldSub            = false;
      let reason: SubReason    = triggerReason;

      // ── Mandatory: foul-out ─
      if (pf >= 5) {
        shouldSub = true; reason = 'FOUL_TROUBLE';
      }
      // ── 3 fouls in 1st half → sit ─
      else if (pf >= 3 && quarter <= 2) {
        shouldSub = true; reason = 'FOUL_TROUBLE';
      }
      // ── Fatigue priority ─
      else if (fd.fatigueLevel > 85) {
        shouldSub = true; reason = 'FATIGUE';
      }
      else if (fd.fatigueLevel > 70 && Math.random() < 0.45) {
        shouldSub = true; reason = 'FATIGUE';
      }
      else if (fd.consecutiveMinutes >= 10) {
        shouldSub = true; reason = 'FATIGUE';
      }
      // ── Cold-streak hook ─
      // Star Handler: Diva/Star personality players are protected from cold-streak pulls
      else if (fga >= 4 && fgm === 0 && motivation < 75) {
        const isDiva = team.roster.find(p => p.id === player.id)?.personalityTraits?.includes('Diva/Star') ?? false;
        if (!(hasStarHandler && isDiva)) { shouldSub = true; reason = 'COLD_STREAK'; }
      }
      else if (fga >= 3 && fgm === 0 && motivation >= 80 && Math.random() < 0.35) {
        const isDiva = team.roster.find(p => p.id === player.id)?.personalityTraits?.includes('Diva/Star') ?? false;
        if (!(hasStarHandler && isDiva)) { shouldSub = true; reason = 'COLD_STREAK'; }
      }
      // ── Down-10 tactical ─
      else if (isDown10 && clutch >= 80 && triggerReason === 'TACTICAL' && Math.random() < 0.45) {
        shouldSub = true; reason = 'TACTICAL';
      }
      // ── Quarter-break rotation ─
      else if (triggerReason === 'QUARTER_BREAK' && fd.consecutiveMinutes >= 5 && Math.random() < 0.60) {
        shouldSub = true; reason = 'QUARTER_BREAK';
      }
      else if (isDevGenius && triggerReason === 'QUARTER_BREAK' && Math.random() < 0.30) {
        shouldSub = true; reason = 'TACTICAL';
      }
      // ── Periodic fatigue check ─
      else if (triggerReason === 'FATIGUE' && fd.fatigueLevel > 55 && Math.random() < 0.22) {
        shouldSub = true; reason = 'FATIGUE';
      }

      if (!shouldSub) continue;

      // Find eligible bench player — same position group, not fouled out
      const group = posGroup(player.position);
      const candidates = offBench.filter(b =>
        !usedFromBench.has(b.id) &&
        posGroup(b.position) === group &&
        ((stats[b.id]?.pf ?? 0) as number) < 5
      );

      let incoming: Player | undefined;
      if (isDevGenius) {
        // Prefer youngest available
        incoming = [...candidates].sort((a, b) => a.age - b.age)[0];
      }
      if (!incoming) {
        // Default: prefer least fatigued bench player
        incoming = [...candidates].sort(
          (a, b) => (ft[a.id]?.fatigueLevel ?? 0) - (ft[b.id]?.fatigueLevel ?? 0)
        )[0];
      }
      if (!incoming) continue; // no valid sub for this position group

      ops.push({ out: player, in: incoming, reason });
      usedFromBench.add(incoming.id);
    }

    if (ops.length === 0) return;

    // Apply lineup changes and update fatigue flags
    let newLineup = [...currentLineup];
    for (const op of ops) {
      newLineup = newLineup.map(id => (id === op.out.id ? op.in.id : id));
      if (ft[op.out.id]) {
        ft[op.out.id].isOnFloor         = false;
        ft[op.out.id].consecutiveMinutes = 0;
      }
      if (!ft[op.in.id]) {
        ft[op.in.id] = { minutesPlayed: 0, fatigueLevel: 0, isOnFloor: false, consecutiveMinutes: 0 };
      }
      ft[op.in.id].isOnFloor = true;
    }
    if (isHome) lineupRef.current = { ...lineupRef.current, home: newLineup };
    else        lineupRef.current = { ...lineupRef.current, away: newLineup };

    // Generate PBP substitution events
    for (const op of ops) {
      const fatLabel = Math.round(ft[op.out.id]?.fatigueLevel ?? 0);
      const pfLabel  = (stats[op.out.id]?.pf ?? 0) as number;
      let detail = '';
      if      (op.reason === 'FOUL_TROUBLE')  detail = `${pfLabel} PF`;
      else if (op.reason === 'FATIGUE')        detail = `fatigue ${fatLabel}%`;
      else if (op.reason === 'COLD_STREAK')    detail = `${(stats[op.out.id]?.fgm ?? 0)}-${(stats[op.out.id]?.fga ?? 0)} FG`;
      else if (op.reason === 'TACTICAL')       detail = `tactical`;
      else if (op.reason === 'QUARTER_BREAK')  detail = `rotation`;
      batchEvts.push({
        time: formatTime(currentTime),
        quarter,
        text: `${abbrev(op.in.name)} checks in for ${abbrev(op.out.name)} (${detail})`,
        type: 'info',
        teamId: team.id,
        possessionBefore: possessionRef.current,
        possessionAfter:  possessionRef.current,
      });
    }
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
      // Quarter break — fire rotational subs for both teams
      const qBreakEvts: GameEvent[] = [];
      runSubstitutions(homeTeam, true,  qBreakEvts, 0, 'QUARTER_BREAK');
      runSubstitutions(awayTeam, false, qBreakEvts, 0, 'QUARTER_BREAK');
      gameSecondsRef.current  = 0;
      lastSubCheckHome.current = 0;
      lastSubCheckAway.current = 0;
      setQuarter(q => q + 1);
      setTimeLeft(720);
      setEvents(prev => [
        ...prev,
        { time: '12:00', quarter: quarter + 1, text: `--- Start of Quarter ${quarter + 1} ---`, type: 'info' as const },
        ...qBreakEvts
      ]);
    } else if (timeLeft === 0 && quarter >= 4) {
      if (homeScore === awayScore) {
        const otBreakEvts: GameEvent[] = [];
        runSubstitutions(homeTeam, true,  otBreakEvts, 0, 'QUARTER_BREAK');
        runSubstitutions(awayTeam, false, otBreakEvts, 0, 'QUARTER_BREAK');
        gameSecondsRef.current  = 0;
        lastSubCheckHome.current = 0;
        lastSubCheckAway.current = 0;
        setQuarter(q => q + 1);
        setTimeLeft(300); // 5 mins for OT
        setEvents(prev => [
          ...prev,
          { time: '5:00', quarter: quarter + 1, text: `--- Start of Overtime ${quarter - 3} ---`, type: 'info' as const },
          ...otBreakEvts
        ]);
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

  // ── Box Score Renderer ────────────────────────────────────────────────────
  const renderTeamBoxScore = (
    team: Team,
    stats: Record<string, Partial<GamePlayerLine>>,
    show: boolean,
    isHalf: boolean
  ) => {
    if (!show) return null;
    const isHome = team.id === homeTeam.id;
    const currentScore = isHome ? homeScore : awayScore;
    const allStats = Object.values(stats) as Partial<GamePlayerLine>[];

    const players = team.roster.map((p, idx) => ({
      id: p.id,
      name: p.name,
      stat: stats[p.id] ?? {},
      isStarter: idx < 5,
      isOnFloor: (isHome ? lineupRef.current.home : lineupRef.current.away).includes(p.id),
      fatigueLevel: fatigueRef.current[p.id]?.fatigueLevel ?? 0,
    }));
    const starters = players.filter(p => p.isStarter);
    const bench = players.filter(p => !p.isStarter);

    // Top scorer across starters+bench
    const topId = [...players].sort((a, b) => (b.stat.pts ?? 0) - (a.stat.pts ?? 0))[0]?.id;

    const tot = {
      pts: allStats.reduce((s, p) => s + (p.pts ?? 0), 0),
      reb: allStats.reduce((s, p) => s + (p.reb ?? 0), 0),
      ast: allStats.reduce((s, p) => s + (p.ast ?? 0), 0),
      stl: allStats.reduce((s, p) => s + (p.stl ?? 0), 0),
      blk: allStats.reduce((s, p) => s + (p.blk ?? 0), 0),
      tov: allStats.reduce((s, p) => s + (p.tov ?? 0), 0),
      pf:  allStats.reduce((s, p) => s + (p.pf  ?? 0), 0),
      fgm: allStats.reduce((s, p) => s + (p.fgm ?? 0), 0),
      fga: allStats.reduce((s, p) => s + (p.fga ?? 0), 0),
      tpm: allStats.reduce((s, p) => s + (p.threepm ?? 0), 0),
      tpa: allStats.reduce((s, p) => s + (p.threepa ?? 0), 0),
      ftm: allStats.reduce((s, p) => s + (p.ftm ?? 0), 0),
      fta: allStats.reduce((s, p) => s + (p.fta ?? 0), 0),
    };
    const teamFgPct = tot.fga > 0 ? Math.round(tot.fgm / tot.fga * 100) : 0;

    const renderPlayerRow = (pl: typeof players[0]) => {
      const s = pl.stat;
      const hasStat = (s.pts ?? 0) + (s.reb ?? 0) + (s.ast ?? 0) + (s.stl ?? 0) +
                      (s.blk ?? 0) + (s.tov ?? 0) + (s.fga ?? 0) > 0;
      const isDNP = !pl.isStarter && !hasStat && !pl.isOnFloor;
      const fgPct = (s.fga ?? 0) > 0 ? Math.round(((s.fgm ?? 0) / (s.fga ?? 0)) * 100) : null;
      const pm = s.plusMinus ?? 0;
      const isTop = pl.id === topId && hasStat;
      const fatigue = pl.fatigueLevel;
      const fatColor = fatigue > 85 ? 'bg-rose-500' : fatigue > 70 ? 'bg-orange-400' : fatigue > 50 ? 'bg-yellow-400' : 'bg-emerald-500';

      return (
        <tr
          key={pl.id}
          className={`border-b border-slate-800/40 text-[9px] transition-colors ${
            isTop
              ? 'bg-amber-500/8 border-b-amber-500/20'
              : 'hover:bg-slate-800/30'
          }`}
        >
          <td className="sticky left-0 bg-inherit py-1.5 pl-2 pr-2 min-w-[82px] max-w-[82px]">
            <div className={`truncate text-[9px] font-bold leading-tight ${isTop ? 'text-amber-300' : isDNP ? 'text-slate-600' : 'text-slate-200'}`}>
              {abbrev(pl.name)}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {/* On-floor pill */}
              <span className={`text-[6px] font-black uppercase px-1 py-0.5 rounded ${pl.isOnFloor ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                {pl.isOnFloor ? 'ON' : 'OFF'}
              </span>
              {isDNP && <span className="text-[6px] font-black text-slate-700 uppercase">DNP</span>}
              {isTop && !isDNP && <span className="text-[6px] font-black text-amber-600 uppercase">★Top</span>}
              {/* Fatigue bar */}
              {pl.isOnFloor && (
                <div className="flex-1 h-0.5 rounded-full bg-slate-800 overflow-hidden max-w-[24px]">
                  <div className={`h-full rounded-full ${fatColor}`} style={{ width: `${fatigue}%` }} />
                </div>
              )}
            </div>
          </td>
          {isDNP ? (
            <td colSpan={13} className="py-1.5 text-[8px] text-slate-700 uppercase font-black pl-1">Coach's Decision</td>
          ) : (
            <>
              <td className="py-1.5 px-1 text-center font-black text-amber-400">{s.pts ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-slate-300">{s.reb ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-slate-300">{s.ast ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-slate-400">{s.stl ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-slate-400">{s.blk ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-orange-400">{s.tov ?? 0}</td>
              <td className="py-1.5 px-1 text-center text-rose-400">{s.pf ?? 0}</td>
              <td className="py-1.5 px-1 text-center font-mono text-slate-300">{s.fgm ?? 0}-{s.fga ?? 0}</td>
              <td className="py-1.5 px-1 text-center font-mono text-slate-300">{s.threepm ?? 0}-{s.threepa ?? 0}</td>
              <td className="py-1.5 px-1 text-center font-mono text-slate-300">{s.ftm ?? 0}-{s.fta ?? 0}</td>
              <td className={`py-1.5 px-1 text-center ${fgPct !== null && fgPct >= 50 ? 'text-emerald-400' : fgPct !== null && fgPct < 35 ? 'text-rose-400' : 'text-slate-400'}`}>
                {fgPct !== null ? `${fgPct}%` : <span className="text-slate-700">-</span>}
              </td>
              <td className={`py-1.5 pl-1 pr-2 text-center ${pm > 0 ? 'text-emerald-400 font-bold' : pm < 0 ? 'text-rose-400' : 'text-slate-700'}`}>
                {pm > 0 ? `+${pm}` : pm !== 0 ? pm : <span className="text-slate-700">-</span>}
              </td>
            </>
          )}
        </tr>
      );
    };

    return (
      <div
        key={team.id}
        className={`${isHalf ? 'flex-1 min-h-0' : 'flex-1'} flex flex-col overflow-hidden border-b border-slate-800 last:border-b-0`}
      >
        {/* Team header */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-800"
          style={{ background: team.primaryColor + '14' }}>
          <div className="flex items-center gap-2">
            <TeamBadge team={team} size="xs" />
            <span className="text-[10px] font-black uppercase text-white tracking-wider">
              {team.city} {team.name}
            </span>
          </div>
          <span className="text-2xl font-display font-black tabular-nums" style={{ color: team.primaryColor }}>
            {currentScore}
          </span>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <table className="w-full text-slate-300 border-collapse" style={{ minWidth: 520 }}>
            <thead className="sticky top-0 z-10 bg-slate-900">
              <tr className="text-[8px] font-black uppercase text-slate-600 border-b-2 border-slate-800">
                <th className="sticky left-0 bg-slate-900 py-1.5 pl-2 pr-2 text-left min-w-[82px]">Player</th>
                <th className="py-1.5 px-1 w-7 text-center">PTS</th>
                <th className="py-1.5 px-1 w-7 text-center">REB</th>
                <th className="py-1.5 px-1 w-7 text-center">AST</th>
                <th className="py-1.5 px-1 w-7 text-center">STL</th>
                <th className="py-1.5 px-1 w-7 text-center">BLK</th>
                <th className="py-1.5 px-1 w-6 text-center">TO</th>
                <th className="py-1.5 px-1 w-6 text-center">PF</th>
                <th className="py-1.5 px-1 w-14 text-center">FG</th>
                <th className="py-1.5 px-1 w-14 text-center">3P</th>
                <th className="py-1.5 px-1 w-14 text-center">FT</th>
                <th className="py-1.5 px-1 w-9 text-center">FG%</th>
                <th className="py-1.5 pl-1 pr-2 w-9 text-center">+/-</th>
              </tr>
            </thead>
            <tbody>
              {starters.map(renderPlayerRow)}

              {bench.length > 0 && (
                <tr className="border-y border-slate-800 bg-slate-900/70">
                  <td colSpan={13} className="py-0.5 pl-2 text-[7px] font-black uppercase text-slate-700 tracking-widest">BENCH</td>
                </tr>
              )}
              {bench.map(renderPlayerRow)}

              {/* Team totals */}
              <tr className="border-t-2 border-slate-700 bg-slate-900/80 text-[9px] font-black text-white sticky bottom-0">
                <td className="sticky left-0 bg-slate-900 py-2 pl-2 pr-2 text-[8px] uppercase tracking-wider text-slate-500">TEAM</td>
                <td className="py-2 px-1 text-center text-amber-400">{tot.pts}</td>
                <td className="py-2 px-1 text-center">{tot.reb}</td>
                <td className="py-2 px-1 text-center">{tot.ast}</td>
                <td className="py-2 px-1 text-center">{tot.stl}</td>
                <td className="py-2 px-1 text-center">{tot.blk}</td>
                <td className="py-2 px-1 text-center text-orange-400">{tot.tov}</td>
                <td className="py-2 px-1 text-center text-rose-400">{tot.pf}</td>
                <td className="py-2 px-1 text-center font-mono">{tot.fgm}-{tot.fga}</td>
                <td className="py-2 px-1 text-center font-mono">{tot.tpm}-{tot.tpa}</td>
                <td className="py-2 px-1 text-center font-mono">{tot.ftm}-{tot.fta}</td>
                <td className={`py-2 px-1 text-center ${teamFgPct >= 50 ? 'text-emerald-400' : teamFgPct < 35 && tot.fga > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {tot.fga > 0 ? `${teamFgPct}%` : <span className="text-slate-700">-</span>}
                </td>
                <td className="py-2 pl-1 pr-2 text-center text-slate-700">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
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
        <div className="flex-[0.35] flex flex-col bg-slate-900 overflow-hidden border-l border-slate-800">
          {/* Tab bar */}
          <div className="shrink-0 p-2.5 border-b border-slate-800 flex gap-1.5">
            {(['combined', 'home', 'away'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${
                  activeTab === tab
                    ? 'bg-amber-500 text-slate-950 shadow-lg'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                {tab === 'combined' ? 'Box Score' : tab === 'home' ? homeTeam.city.substring(0, 10) : awayTeam.city.substring(0, 10)}
              </button>
            ))}
          </div>

          {/* Box score tables — each team in its own independent scroll zone */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {renderTeamBoxScore(homeTeam, homeStats, activeTab !== 'away', activeTab === 'combined')}
            {renderTeamBoxScore(awayTeam, awayStats, activeTab !== 'home', activeTab === 'combined')}
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
