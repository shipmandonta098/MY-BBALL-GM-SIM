/**
 * Shared All-Star simulation functions used by both AllStar.tsx (UI) and
 * App.tsx (auto-sim during season simulation loops).
 */

import {
  LeagueState, Player, Team, AllStarContestResult, AllStarGameResult,
  AllStarPlayerLine, AllStarWeekendData,
} from '../types';
import { simulateGame } from './simEngine';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function asGetPlayerById(league: LeagueState, id: string): Player | undefined {
  for (const team of league.teams) {
    const p = team.roster.find(pl => pl.id === id);
    if (p) return p;
  }
  return undefined;
}

function getTeamForPlayer(league: LeagueState, playerId: string) {
  for (const team of league.teams) {
    if (team.roster.some(p => p.id === playerId)) return team;
  }
  return null;
}

export function asTeamName(league: LeagueState, playerId: string): string {
  const t = getTeamForPlayer(league, playerId);
  return t ? `${t.city} ${t.name}` : '';
}

export function asTeamId(league: LeagueState, playerId: string): string {
  return getTeamForPlayer(league, playerId)?.id ?? '';
}

function pickWinner(
  league: LeagueState,
  participants: string[],
  scorer: (p: Player) => number,
): { playerId: string; playerName: string; teamId: string; teamName: string; rawScore: number } {
  let best = participants[0];
  let bestScore = -1;
  for (const id of participants) {
    const p = asGetPlayerById(league, id);
    if (!p) continue;
    const s = scorer(p) + Math.random() * 20;
    if (s > bestScore) { bestScore = s; best = id; }
  }
  const w = asGetPlayerById(league, best)!;
  return { playerId: best, playerName: w.name, teamId: asTeamId(league, best), teamName: asTeamName(league, best), rawScore: bestScore };
}

// ── Contest simulations ───────────────────────────────────────────────────────

export function simulateSkillsChallenge(league: LeagueState, participants: string[]): AllStarContestResult {
  const pool = participants.length >= 4 ? participants : participants;
  const scorer = (p: Player) => (p.attributes.ballHandling || 0) * 0.4 + (p.attributes.speed || 0) * 0.35 + (p.attributes.passing || 0) * 0.25;
  const winner = pickWinner(league, pool, scorer);
  const runnerUpPool = pool.filter(id => id !== winner.playerId);
  const runnerUp = runnerUpPool.length > 0 ? pickWinner(league, runnerUpPool, scorer) : null;
  const times = ['15.2s', '14.8s', '15.9s', '13.6s', '16.1s'];
  const wTime = times[Math.floor(Math.random() * times.length)];
  const ruTime = times[Math.floor(Math.random() * times.length)];
  return {
    eventName: 'Skills Challenge',
    participants: pool,
    winner: { ...winner },
    runnerUp: runnerUp ? { ...runnerUp } : undefined,
    highlights: [
      `${winner.playerName} flew through the obstacle course in ${wTime} — a new record!`,
      runnerUp ? `${runnerUp.playerName} was close with ${ruTime} but came up just short.` : '',
      `The crowd erupted as ${winner.playerName} nailed the final shooting station.`,
    ].filter(Boolean),
  };
}

export function simulate3PtContest(league: LeagueState, participants: string[]): AllStarContestResult {
  const scorer = (p: Player) => (p.attributes.shooting3pt || 0) * 0.7 + (p.attributes.freeThrow || 0) * 0.3;
  const winner = pickWinner(league, participants, scorer);
  const runnerUpPool = participants.filter(id => id !== winner.playerId);
  const runnerUp = runnerUpPool.length > 0 ? pickWinner(league, runnerUpPool, scorer) : null;
  const wScore = 18 + Math.floor(Math.random() * 9);
  const ruScore = Math.max(12, wScore - 1 - Math.floor(Math.random() * 5));
  const racks = ['the corner rack', 'the wing rack', 'the money ball rack'];
  const hotRack = racks[Math.floor(Math.random() * racks.length)];
  return {
    eventName: '3-Point Contest',
    participants,
    winner: { ...winner, score: `${wScore}/27` },
    runnerUp: runnerUp ? { ...runnerUp, score: `${ruScore}/27` } : undefined,
    highlights: [
      `${winner.playerName} drained ${wScore} of 27 to claim the title — nearly a perfect round!`,
      `${hotRack.charAt(0).toUpperCase() + hotRack.slice(1)} was money: ${winner.playerName} went 5-for-5!`,
      runnerUp ? `${runnerUp.playerName} finished runner-up at ${ruScore}/27 — an outstanding effort.` : '',
    ].filter(Boolean),
  };
}

export function simulateDunkContest(league: LeagueState, participants: string[]): AllStarContestResult {
  const scorer = (p: Player) => (p.attributes.dunks || 0) * 0.45 + (p.attributes.jumping || 0) * 0.35 + (p.attributes.athleticism || 0) * 0.2;
  const winner = pickWinner(league, participants, scorer);
  const runnerUpPool = participants.filter(id => id !== winner.playerId);
  const runnerUp = runnerUpPool.length > 0 ? pickWinner(league, runnerUpPool, scorer) : null;
  const dunks = [
    'a between-the-legs off the back-board', 'a 360-degree windmill from the free-throw line',
    'a double-pump reverse off the glass', 'a no-look alley-oop off the backboard',
    'a behind-the-back dribble slam', 'a twisting baseline power jam',
  ];
  const d1 = dunks[Math.floor(Math.random() * dunks.length)];
  const d2 = dunks[Math.floor(Math.random() * dunks.length)];
  return {
    eventName: 'Dunk Contest',
    participants,
    winner: { ...winner, score: '50/50' },
    runnerUp: runnerUp ? { ...runnerUp, score: `${44 + Math.floor(Math.random() * 6)}/50` } : undefined,
    highlights: [
      `${winner.playerName} opened with ${d1} — an immediate perfect 50 from the judges!`,
      `The crowd went silent, then erupted: ${d2} to seal the crown.`,
      runnerUp ? `${runnerUp.playerName} put on a show but couldn't match ${winner.playerName}'s creativity.` : '',
    ].filter(Boolean),
  };
}

// ── Virtual All-Star Team builder ─────────────────────────────────────────────

export function buildAllStarTeam(
  conf: 'East' | 'West',
  rosterIds: string[],
  starters: string[],
  league: LeagueState,
): Team {
  const players = rosterIds.map(id => asGetPlayerById(league, id)).filter(Boolean) as Player[];

  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
  const unassigned = starters.map(id => asGetPlayerById(league, id)).filter(Boolean) as Player[];
  const starterMap: Record<string, string> = {};
  for (const pos of positions) {
    const idx = unassigned.findIndex(p => p.position === pos);
    if (idx >= 0) { starterMap[pos] = unassigned[idx].id; unassigned.splice(idx, 1); }
  }
  for (const pos of positions) {
    if (!starterMap[pos] && unassigned.length > 0) {
      starterMap[pos] = unassigned.shift()!.id;
    }
  }

  return {
    id: `allstar-${conf.toLowerCase()}`,
    name: 'All-Stars',
    city: conf,
    abbreviation: conf === 'East' ? 'EAST' : 'WEST',
    conference: conf === 'East' ? 'Eastern' : 'Western',
    division: 'Atlantic',
    marketSize: 'Large',
    roster: players,
    staff: { headCoach: null, assistantOffense: null, assistantDefense: null, assistantDev: null, trainer: null },
    staffBudget: 0,
    activeScheme: 'Showtime',
    paceRating: 96,
    wins: 41, losses: 41, homeWins: 0, homeLosses: 0, roadWins: 0, roadLosses: 0,
    confWins: 0, confLosses: 0, lastTen: [], streak: 0, budget: 0,
    logo: '', primaryColor: conf === 'East' ? '#3b82f6' : '#ef4444', secondaryColor: '#ffffff',
    picks: [], needs: [],
    finances: {
      revenue: 0, expenses: 0, cash: 0, ticketPrice: 0, concessionPrice: 0,
      fanHype: 50, ownerPatience: 100, ownerGoal: 'Compete' as const,
      budgets: { scouting: 0, health: 0, facilities: 0 },
      ticketRevenue: 0, tvRevenue: 0, sponsorRevenue: 0, miscRevenue: 0,
    },
    rotation: {
      starters: starterMap as Record<typeof positions[number], string>,
      bench: rosterIds.filter(id => !starters.includes(id)),
      reserves: [],
      minutes: {},
    },
    population: 5, stadiumCapacity: 20000,
    borderStyle: 'None', status: 'Active',
  };
}

// ── All-Star Game quick-sim (uses real simulateGame engine) ───────────────────

export function simulateAllStarGame(
  league: LeagueState,
  eastRoster: string[],
  westRoster: string[],
  eastStarters: string[],
  westStarters: string[],
): AllStarGameResult {
  const eastTeam = buildAllStarTeam('East', eastRoster, eastStarters, league);
  const westTeam = buildAllStarTeam('West', westRoster, westStarters, league);

  const gameResult = simulateGame(
    eastTeam, westTeam,
    league.currentDay, league.season,
    false, false, 'Ice Cold',
    { injuryFrequency: 'None', homeCourt: false, b2bFrequency: 'None', quarterLength: 12 },
  );

  const eastScore = gameResult.homeScore;
  const westScore = gameResult.awayScore;

  const toAllStarLines = (
    lines: typeof gameResult.homePlayerStats,
    starters: string[],
    mvpId: string,
  ): AllStarPlayerLine[] =>
    lines
      .filter(l => !l.dnp)
      .map(l => ({
        playerId: l.playerId,
        playerName: l.name,
        position: asGetPlayerById(league, l.playerId)?.position ?? '?',
        pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk,
        fgm: l.fgm, fga: l.fga, threepm: l.threepm, threepa: l.threepa,
        ftm: l.ftm, fta: l.fta,
        isStarter: starters.includes(l.playerId),
        isMvp: l.playerId === mvpId,
      }))
      .sort((a, b) => b.pts - a.pts);

  const winnerStats = eastScore >= westScore ? gameResult.homePlayerStats : gameResult.awayPlayerStats;
  const activeCandidates = winnerStats.filter(l => !l.dnp);
  const mvpLine = activeCandidates.length > 0
    ? activeCandidates.reduce((best, l) =>
        (l.pts + l.reb * 0.5 + l.ast * 0.7) > (best.pts + best.reb * 0.5 + best.ast * 0.7) ? l : best,
        activeCandidates[0])
    : winnerStats[0];

  const mvpPlayer = asGetPlayerById(league, mvpLine.playerId);
  const mvpName   = mvpPlayer?.name ?? mvpLine.name;
  const confWon   = eastScore >= westScore ? 'East' : 'West';
  const statLine  = `${mvpLine.pts} pts, ${mvpLine.reb} reb, ${mvpLine.ast} ast`;

  return {
    eastScore, westScore,
    mvp: {
      playerId: mvpLine.playerId,
      playerName: mvpName,
      teamId: asTeamId(league, mvpLine.playerId),
      teamName: asTeamName(league, mvpLine.playerId),
      statLine,
    },
    eastRoster, westRoster,
    quarterScores: { east: gameResult.quarterScores.home, west: gameResult.quarterScores.away },
    highlights: [
      `${confWon} wins ${Math.max(eastScore, westScore)}-${Math.min(eastScore, westScore)} in an All-Star showcase!`,
      `${mvpName} was unstoppable: ${statLine} to claim MVP honours.`,
      `Both squads combined for ${eastScore + westScore} total points.`,
      `${mvpName} raises the MVP trophy to a standing ovation.`,
    ],
    boxScore: {
      east: toAllStarLines(gameResult.homePlayerStats, eastStarters, mvpLine.playerId),
      west: toAllStarLines(gameResult.awayPlayerStats, westStarters, mvpLine.playerId),
    },
    playByPlay: gameResult.playByPlay ?? [],
  };
}

// ── Auto-simulate all events for a given AllStarWeekendData ──────────────────

export function autoSimAllStarWeekend(
  league: LeagueState,
  asd: AllStarWeekendData,
): AllStarWeekendData {
  const skillsChallenge = simulateSkillsChallenge(league, asd.skillsParticipants);
  const threePtContest  = simulate3PtContest(league, asd.threePtParticipants);
  const dunkContest     = simulateDunkContest(league, asd.dunkParticipants);
  const allStarGame     = simulateAllStarGame(
    league, asd.eastRoster, asd.westRoster, asd.eastStarters, asd.westStarters,
  );
  return { ...asd, skillsChallenge, threePtContest, dunkContest, allStarGame, completed: true };
}
