import { Team, GameResult, Player, GamePlayerLine, CoachScheme, PlayByPlayEvent, InjuryType } from '../types';

// Realistic NBA Constants
const BASE_PACE = 100;
const BASE_PPP = 1.12; // ~112 points per 100 possessions
const SCORE_VARIANCE = 0.04; // Tighten distribution

type InjuryEntry = { type: InjuryType; minDays: number; maxDays: number; weight: number; msgs: string[] };
const INJURY_TABLE: InjuryEntry[] = [
  { type: 'Ankle Sprain',        minDays: 7,   maxDays: 14,  weight: 30, msgs: ['{n} rolls ankle on landing — grimacing badly', '{n} steps on an opponent\'s foot and limps to the bench'] },
  { type: 'Hamstring Strain',    minDays: 10,  maxDays: 21,  weight: 20, msgs: ['{n} pulls up clutching the hamstring — trainers rush in', '{n} grabs the back of the leg after a sprint and will not return'] },
  { type: 'Knee Sprain',         minDays: 14,  maxDays: 28,  weight: 12, msgs: ['{n} clutches the knee after going down hard — trainers checking', '{n} is helped off the floor — knee issue, headed to the locker room'] },
  { type: 'Patellofemoral Pain', minDays: 21,  maxDays: 42,  weight: 6,  msgs: ['{n} cannot continue — knee issue forces an early exit'] },
  { type: 'Lumbar Strain',       minDays: 7,   maxDays: 21,  weight: 8,  msgs: ['{n} clutches lower back after taking an elbow — in visible pain'] },
  { type: 'Finger/Hand Injury',  minDays: 14,  maxDays: 35,  weight: 8,  msgs: ['{n} jams a finger on a steal attempt — heading to the bench', '{n} going to the locker room with a hand issue'] },
  { type: 'Concussion',          minDays: 5,   maxDays: 14,  weight: 4,  msgs: ['{n} takes a hard elbow to the head — trainers conducting concussion protocol'] },
  { type: 'ACL Tear',            minDays: 270, maxDays: 365, weight: 1,  msgs: ['{n} lands awkwardly and goes down immediately — team in shock', '{n} drops to the floor — the arena goes completely silent'] },
  { type: 'Achilles Rupture',    minDays: 270, maxDays: 365, weight: 1,  msgs: ['{n} pulls up in disbelief, clutching the Achilles — a devastating blow'] },
  { type: 'Illness',             minDays: 1,   maxDays: 7,   weight: 10, msgs: ['{n} heads to the locker room feeling ill — will not return tonight'] },
];
const rollInjury = (name: string): { type: InjuryType; daysOut: number; msg: string } => {
  const total = INJURY_TABLE.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of INJURY_TABLE) {
    r -= e.weight;
    if (r <= 0) {
      const daysOut = e.minDays + Math.floor(Math.random() * (e.maxDays - e.minDays + 1));
      return { type: e.type, daysOut, msg: e.msgs[Math.floor(Math.random() * e.msgs.length)].replace(/{n}/g, name) };
    }
  }
  const fb = INJURY_TABLE[0];
  return { type: fb.type, daysOut: fb.minDays, msg: fb.msgs[0].replace(/{n}/g, name) };
};

const calculateTeamRatings = (team: Team) => {
  let roster = team.roster.slice(0, 10); // Focus on rotation for ratings
  if (team.rotation) {
    const rotationIds = [...Object.values(team.rotation.starters), ...team.rotation.bench];
    roster = team.roster.filter(p => rotationIds.includes(p.id));
  }
  const off = roster.reduce((acc, p) => acc + (p.attributes.shooting + p.attributes.offensiveIQ + p.attributes.athleticism) / 3, 0) / roster.length;
  const def = roster.reduce((acc, p) => acc + (p.attributes.defense + p.attributes.defensiveIQ + p.attributes.perimeterDef + p.attributes.interiorDef) / 4, 0) / roster.length;
  return { off, def };
};

const simulatePlayerGameLine = (player: Player, teamPts: number, teamFga: number, teamReb: number, teamAst: number, minutes: number, usageShare: number): GamePlayerLine => {
  // Distribute team totals based on player attributes and minutes
  const minFactor = minutes / 48;
  
  // FGA based on usage share
  const fga = Math.max(0, Math.round(teamFga * usageShare * (minutes / 32)));
  const threepa = Math.round(fga * (player.attributes.shooting3pt / 100) * 0.5);
  
  // FG% influenced by player attributes
  const fgPct = (player.attributes.shooting / 100) * 0.45 + 0.25; // Range ~0.45 to 0.55
  const fgm = Math.min(fga, Math.round(fga * (fgPct + (Math.random() * 0.06 - 0.03))));
  
  const threePct = (player.attributes.shooting3pt / 100) * 0.35 + 0.15;
  const threepm = Math.min(threepa, Math.round(threepa * (threePct + (Math.random() * 0.06 - 0.03))));
  
  const fta = Math.round((player.attributes.strength / 100) * 5 * minFactor + Math.random() * 2);
  const ftm = Math.round(fta * (player.attributes.freeThrow / 100));

  const pts = (fgm - threepm) * 2 + threepm * 3 + ftm;
  
  const totalReb = Math.max(0, Math.round(teamReb * (player.attributes.rebounding / 100) * usageShare * 2.5));
  const offReb = Math.round(totalReb * (player.attributes.offReb / (player.attributes.offReb + player.attributes.defReb || 1)));
  const defReb = totalReb - offReb;
  
  return {
    playerId: player.id,
    name: player.name,
    min: minutes,
    pts,
    reb: totalReb,
    offReb,
    defReb,
    ast: Math.max(0, Math.round(teamAst * (player.attributes.playmaking / 100) * usageShare * 3.0)),
    stl: Math.floor((player.attributes.steals / 100) * 2 * minFactor + Math.random() * 1),
    blk: Math.floor((player.attributes.blocks / 100) * 2 * minFactor + Math.random() * 1),
    fgm,
    fga,
    threepm,
    threepa,
    ftm,
    fta,
    tov: Math.max(0, Math.floor((100 - player.attributes.ballHandling) / 25 * minFactor + Math.random() * 2)),
    plusMinus: 0,
    pf: Math.floor(Math.random() * 5 * minFactor + 1),
    techs: 0,
    flagrants: 0
  };
};

export const simulateGame = (home: Team, away: Team, date: number, season: number, homeB2B: boolean = false, awayB2B: boolean = false, rivalryLevel: string = 'Ice Cold'): GameResult => {
  const homeRatings = calculateTeamRatings(home);
  const awayRatings = calculateTeamRatings(away);

  // Staff & Leader Bonuses
  const getStaffBonus = (team: Team) => {
    const hc = team.staff.headCoach;
    return hc ? (hc.ratingOffense + hc.ratingDefense) / 100 : 0;
  };
  const leaderBonus = (team: Team) => team.roster.filter(p => p.personalityTraits.includes('Leader')).length * 0.25;
  const clutchBonus = (team: Team) => team.roster.filter(p => p.personalityTraits.includes('Clutch')).length * 0.15;
  const lazyPenalty = (team: Team) => team.roster.filter(p => p.personalityTraits.includes('Lazy')).length * 0.1;

  // Pace Calculation
  let pace = BASE_PACE;
  if (home.activeScheme === 'Pace and Space' || home.activeScheme === 'Showtime') pace += 4;
  if (away.activeScheme === 'Pace and Space' || away.activeScheme === 'Showtime') pace += 4;
  if (home.activeScheme === 'Grit and Grind') pace -= 5;
  if (away.activeScheme === 'Grit and Grind') pace -= 5;
  pace += (Math.random() * 6 - 3);

  // Efficiency Calculation (PPP)
  const calculatePPP = (off: number, def: number, isB2B: boolean) => {
    let ppp = BASE_PPP;
    const diff = (off - def) / 100;
    ppp += diff * 0.5; // Scale efficiency by rating difference
    if (isB2B) ppp *= 0.93; // 7% penalty for B2B
    return ppp + (Math.random() * SCORE_VARIANCE * 2 - SCORE_VARIANCE);
  };

  const homePPP = calculatePPP(homeRatings.off + getStaffBonus(home) + leaderBonus(home) + clutchBonus(home) - lazyPenalty(home), awayRatings.def + getStaffBonus(away), homeB2B);
  const awayPPP = calculatePPP(awayRatings.off + getStaffBonus(away) + leaderBonus(away) + clutchBonus(away) - lazyPenalty(away), homeRatings.def + getStaffBonus(home), awayB2B);

  let totalHome = Math.round(pace * homePPP);
  let totalAway = Math.round(pace * awayPPP);

  // Ensure realistic floor/ceiling
  totalHome = Math.max(85, Math.min(145, totalHome));
  totalAway = Math.max(85, Math.min(145, totalAway));

  // Player Distribution
  const distributeToPlayers = (team: Team, totalPts: number) => {
    const roster = team.roster;
    const totalRating = roster.reduce((acc, p) => acc + p.rating, 0);
    
    // Estimate team totals for distribution
    const teamFga = Math.round(pace * 0.88);
    const teamReb = Math.round(pace * 0.44);
    const teamAst = Math.round((totalPts / 2.2) * 0.6);

    return roster.map((p, i) => {
      let mins = 0;
      if (team.rotation && team.rotation.minutes[p.id] !== undefined) {
        mins = team.rotation.minutes[p.id];
      } else {
        if (i < 5) mins = 30 + Math.floor(Math.random() * 8);
        else if (i < 9) mins = 14 + Math.floor(Math.random() * 10);
        else if (i < 12) mins = Math.floor(Math.random() * 6);
      }
      
      const usageShare = p.rating / totalRating;
      const line = simulatePlayerGameLine(p, totalPts, teamFga, teamReb, teamAst, mins, usageShare);
      return { ...line, techs: 0, flagrants: 0, ejected: false };
    });
  };

  let homePlayerStats = distributeToPlayers(home, totalHome);
  let awayPlayerStats = distributeToPlayers(away, totalAway);

  // Re-sum to ensure player totals match team totals exactly
  totalHome = homePlayerStats.reduce((sum, p) => sum + p.pts, 0);
  totalAway = awayPlayerStats.reduce((sum, p) => sum + p.pts, 0);

  // Chippy Logic & PBP
  const pbp: PlayByPlayEvent[] = [{ time: '12:00', text: 'Game Tip-off', type: 'info', quarter: 1 }];
  let isChippy = false;
  const rivalryMod = ['Hot', 'Red Hot'].includes(rivalryLevel) ? 1.5 : 1.0;

  const rollForChippy = (stats: GamePlayerLine[], isHome: boolean) => {
    stats.forEach(p => {
      const player = (isHome ? home : away).roster.find(pl => pl.id === p.playerId)!;
      let techChance = 0.02 * rivalryMod;
      if (player.personalityTraits.includes('Diva/Star')) techChance *= 1.8;
      if (player.personalityTraits.includes('Tough/Alpha')) techChance *= 1.4;
      if (player.personalityTraits.includes('Professional')) techChance *= 0.5;
      if (player.personalityTraits.includes('Leader')) techChance *= 0.7;
      if (Math.random() < techChance) {
        p.techs += 1;
        isChippy = true;
        pbp.push({ time: `${Math.floor(Math.random()*12)}:00`, quarter: Math.floor(Math.random()*4)+1, text: `${p.name} tech'd for taunt!`, type: 'foul' });
        if (isHome) totalAway += 1; else totalHome += 1;
      }
    });
  };

  rollForChippy(homePlayerStats, true);
  rollForChippy(awayPlayerStats, false);

  // Injury Rolls
  const gameInjuries: Array<{playerId: string; playerName: string; injuryType: InjuryType; daysOut: number; teamId: string}> = [];
  const rollForInjuries = (stats: GamePlayerLine[], isHome: boolean) => {
    const tm = isHome ? home : away;
    const isB2B = isHome ? homeB2B : awayB2B;
    const trainerRating = tm.staff.trainer?.ratingDevelopment ?? 0;
    stats.forEach(p => {
      if (p.min < 5) return;
      const player = tm.roster.find(pl => pl.id === p.playerId);
      if (!player || player.status === 'Injured') return;
      let chance = 0.004;
      if (p.min > 35) chance *= 1.5;
      if (isB2B) chance *= 1.3;
      chance *= (1 - (trainerRating / 100) * 0.3);
      if (Math.random() < chance) {
        const { type, daysOut, msg } = rollInjury(player.name);
        pbp.push({ time: `${Math.floor(Math.random() * 12)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`, text: msg, type: 'foul', quarter: Math.floor(Math.random() * 4) + 1 });
        gameInjuries.push({ playerId: player.id, playerName: player.name, injuryType: type, daysOut, teamId: tm.id });
      }
    });
  };
  rollForInjuries(homePlayerStats, true);
  rollForInjuries(awayPlayerStats, false);

  // Overtime
  let isOvertime = false;
  if (Math.abs(totalHome - totalAway) < 1) {
    isOvertime = true;
    totalHome += Math.floor(Math.random() * 12) + 2;
    totalAway += Math.floor(Math.random() * 12) + 2;
    if (totalHome === totalAway) totalHome += 1;
  }

  const distributeScore = (total: number) => {
    const q1 = Math.floor(total * 0.23 + Math.random() * 4);
    const q2 = Math.floor(total * 0.25 + Math.random() * 4);
    const q3 = Math.floor(total * 0.24 + Math.random() * 4);
    const q4 = total - (q1 + q2 + q3);
    return [q1, q2, q3, q4];
  };

  const homeQ = distributeScore(totalHome);
  const awayQ = distributeScore(totalAway);

  // Rivalry Triggers
  const isBuzzerBeater = Math.abs(totalHome - totalAway) <= 2 && Math.random() < 0.3;
  const isComeback = (homeQ[0] + homeQ[1] < awayQ[0] + awayQ[1] - 15 && totalHome > totalAway) || 
                     (awayQ[0] + awayQ[1] < homeQ[0] + homeQ[1] - 15 && totalAway > totalHome);

  pbp.push({ time: '0:00', text: `Halftime: ${home.name} ${homeQ[0]+homeQ[1]} - ${away.name} ${awayQ[0]+awayQ[1]}`, type: 'info', quarter: 2 });
  pbp.push({ time: '0:00', text: 'Final Buzzer', type: 'info', quarter: 4 });

  const margin = totalHome - totalAway;
  homePlayerStats = homePlayerStats.map(p => ({ ...p, plusMinus: margin }));
  awayPlayerStats = awayPlayerStats.map(p => ({ ...p, plusMinus: -margin }));

  const allLines = [...homePlayerStats, ...awayPlayerStats].sort((a, b) => b.pts - a.pts);

  return {
    id: `game-${date}-${home.id}-${away.id}`,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore: totalHome,
    awayScore: totalAway,
    quarterScores: { home: homeQ, away: awayQ },
    homePlayerStats,
    awayPlayerStats,
    topPerformers: allLines.slice(0, 3).map(l => ({
      playerId: l.playerId,
      points: l.pts,
      rebounds: l.reb,
      assists: l.ast
    })),
    playByPlay: pbp,
    date,
    season,
    isOvertime,
    isBuzzerBeater,
    isComeback,
    isChippy,
    gameInjuries
  };
};
