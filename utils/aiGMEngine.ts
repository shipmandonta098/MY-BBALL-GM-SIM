/**
 * AI GM Engine — Hoops Dynasty
 * Autonomous decision-making for every non-user team.
 */

import {
  LeagueState, Team, Player, Prospect, Coach, DraftPick,
  NewsItem, Transaction, TransactionType, PlayerStatus, Position,
  CoachBadge, CoachScheme,
} from '../types';
import { generateCoach } from '../constants';

// ─── Types ──────────────────────────────────────────────────
export type AIGMPersonality =
  | 'Rebuilder'
  | 'Win Now'
  | 'Analytics'
  | 'Loyalist'
  | 'Superstar Chaser'
  | 'Balanced';

export interface AIGMRatings {
  scouting: number;       // 0-100: accuracy of player evaluation
  negotiation: number;    // 0-100: FA signing efficiency
  development: number;    // 0-100: young player improvement
  adaptability: number;   // 0-100: mid-season strategy switch
  riskTolerance: number;  // 0-100: willingness to make bold moves
}

export interface AIGMData {
  personality: AIGMPersonality;
  ratings: AIGMRatings;
}

// ─── Personality defaults (ratings seeded around these) ─────
const PERSONALITY_RATING_BASE: Record<AIGMPersonality, AIGMRatings> = {
  'Rebuilder':         { scouting: 80, negotiation: 55, development: 85, adaptability: 60, riskTolerance: 45 },
  'Win Now':           { scouting: 65, negotiation: 85, development: 40, adaptability: 75, riskTolerance: 90 },
  'Analytics':         { scouting: 92, negotiation: 80, development: 70, adaptability: 85, riskTolerance: 60 },
  'Loyalist':          { scouting: 60, negotiation: 70, development: 75, adaptability: 30, riskTolerance: 25 },
  'Superstar Chaser':  { scouting: 55, negotiation: 90, development: 45, adaptability: 70, riskTolerance: 95 },
  'Balanced':          { scouting: 70, negotiation: 70, development: 70, adaptability: 70, riskTolerance: 50 },
};

const rng = (base: number, spread = 12): number =>
  Math.min(99, Math.max(1, base + Math.floor((Math.random() - 0.5) * spread * 2)));

export function generateAIGMRatings(personality: AIGMPersonality): AIGMRatings {
  const b = PERSONALITY_RATING_BASE[personality];
  return {
    scouting:      rng(b.scouting),
    negotiation:   rng(b.negotiation),
    development:   rng(b.development),
    adaptability:  rng(b.adaptability),
    riskTolerance: rng(b.riskTolerance),
  };
}

// ─── Assign personalities at league creation ────────────────
export function assignAIPersonalities(teams: Team[], userTeamId: string): Team[] {
  const personalities: AIGMPersonality[] = [
    'Rebuilder', 'Win Now', 'Analytics', 'Loyalist', 'Superstar Chaser', 'Balanced',
  ];
  return teams.map(t => {
    if (t.id === userTeamId) return t; // user team gets no AI
    const personality = personalities[Math.floor(Math.random() * personalities.length)];
    return {
      ...t,
      aiGM: {
        personality,
        ratings: generateAIGMRatings(personality),
      },
    };
  });
}

// ─── Player trade value formula ──────────────────────────────
export function playerTradeValue(
  p: Player,
  perspective?: AIGMPersonality
): number {
  const ageBonus = p.age > 30 ? -2 * (p.age - 30) : 0;
  const base =
    p.rating       * 0.5 +
    p.potential    * 0.3 +
    p.contractYears * 0.1 +
    ageBonus;

  if (!perspective) return base;

  // TS% proxy from stats
  const fga = p.stats.fga || 1;
  const fta = p.stats.fta || 0;
  const tsPct = (fga + 0.44 * fta) > 0
    ? p.stats.points / (2 * (fga + 0.44 * fta)) : 0.5;

  const gp = Math.max(1, p.stats.gamesPlayed);
  const min = Math.max(1, p.stats.minutes);
  const per = (p.stats.points + p.stats.rebounds + p.stats.assists +
    p.stats.steals + p.stats.blocks -
    (p.stats.fga - p.stats.fgm) - (p.stats.fta - p.stats.ftm) -
    p.stats.tov) / min * 30;

  switch (perspective) {
    case 'Analytics':
      return base + (tsPct - 0.5) * 30 + Math.max(0, per - 15) * 1.5;
    case 'Win Now':
      return base + (p.age >= 26 && p.age <= 32 ? 5 : 0);
    case 'Rebuilder':
      return base + (p.age <= 23 ? 8 : p.age > 28 ? -6 : 0);
    case 'Superstar Chaser':
      return p.rating >= 90 ? base * 1.4 : base * 0.85;
    case 'Loyalist':
      return base;
    default:
      return base;
  }
}

// ─── Draft pick trade value ──────────────────────────────────
function draftPickValue(
  pick: DraftPick,
  personality: AIGMPersonality,
  totalTeams: number
): number {
  const round = pick.round;
  const estimatedPick = pick.pick || Math.floor(totalTeams / 2);
  const base = round === 1
    ? Math.max(25, 55 - estimatedPick * 0.8)
    : Math.max(5, 20 - estimatedPick * 0.3);
  if (personality === 'Rebuilder')       return base * 1.2;
  if (personality === 'Win Now')         return base * 0.7;
  return base;
}

// ─── Difficulty Normalizer ──────────────────────────────────
/**
 * Maps any supported difficulty string to a canonical 4-tier level.
 * Rookie/Easy = 1 (suboptimal AI), Pro/Medium = 2 (average),
 * All-Star/Hard = 3 (optimized), Legend/Extreme = 4 (targets human weaknesses).
 * Simulation math is NEVER modified by difficulty — only AI GM decision quality.
 */
export function normalizeDifficulty(d: string): 1 | 2 | 3 | 4 {
  switch (d) {
    case 'Rookie': case 'Easy':    return 1;
    case 'Pro':    case 'Medium':  return 2;
    case 'All-Star': case 'Hard':  return 3;
    case 'Legend': case 'Extreme': return 4;
    default:                       return 2; // fallback to Pro
  }
}

/** Returns true when difficulty is at All-Star or Legend level. */
export function isHighDifficulty(d: string): boolean { return normalizeDifficulty(d) >= 3; }

/** Returns true when AI should actively target human team's weaknesses. */
export function isLegendDifficulty(d: string): boolean { return normalizeDifficulty(d) === 4; }

// ─── Free agent value / salary bid ──────────────────────────
function faOfferAmount(
  p: Player,
  teamContext: Team,
  salaryCap: number,
  personality: AIGMPersonality,
  negotiationRating: number,
  difficulty: string,
  isTopFA: boolean
): number {
  const capSpace = salaryCap - rosterSalary(teamContext);
  const maxBid = Math.min(capSpace, salaryCap * 0.35);
  const baseBid = Math.max(500_000, p.salary * 1.05);

  let multiplier = 1.0;

  switch (personality) {
    case 'Rebuilder':
      if (p.age > 24) multiplier = 0.7;
      if (p.age <= 23) multiplier = 1.1;
      break;
    case 'Win Now':
      if (p.rating >= 85) multiplier = 1.3;
      multiplier *= 1.1;
      break;
    case 'Analytics': {
      const fga = p.stats.fga || 1;
      const fta = p.stats.fta || 0;
      const ts = (fga + 0.44 * fta) > 0 ? p.stats.points / (2 * (fga + 0.44 * fta)) : 0.5;
      multiplier = 0.8 + ts * 0.5;
      break;
    }
    case 'Loyalist':
      multiplier = p.isFreeAgent ? 0.85 : 1.0; // prefers re-signing own FAs
      break;
    case 'Superstar Chaser':
      if (p.rating >= 85) multiplier = 1.5;
      break;
    default:
      multiplier = 1.0;
  }

  // Top FA bidding war bonus for aggressive personalities
  if (isTopFA && (personality === 'Win Now' || personality === 'Superstar Chaser')) {
    multiplier *= 1.15; // +15% in bidding wars
  }

  // Difficulty modifier — affects AI GM decision quality, NOT simulation math
  const dTier = normalizeDifficulty(difficulty);
  if (dTier === 1) multiplier *= 0.80; // Rookie: AI overpays / poor decisions
  if (dTier === 3) multiplier *= 1.10; // All-Star: optimized bidding
  if (dTier === 4) multiplier *= 1.20; // Legend: maximally aggressive

  // Poor negotiation → overpays
  if (negotiationRating < 60) multiplier *= 1.0 + (0.2 * (1 - negotiationRating / 100));

  const bid = Math.round(baseBid * multiplier);
  return Math.min(maxBid, bid);
}

// ─── Helper: sum salary for a team ──────────────────────────
function rosterSalary(team: Team): number {
  return team.roster.reduce((s, p) => s + p.salary, 0);
}

// ─── Helper: find team's position needs ─────────────────────
function positionNeed(team: Team): Record<Position, number> {
  const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 } as Record<Position, number>;
  team.roster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });
  return counts;
}

function mostNeededPosition(team: Team): Position {
  const counts = positionNeed(team);
  const ideal: Record<Position, number> = { PG: 2, SG: 2, SF: 2, PF: 2, C: 2 };
  let mostNeeded: Position = 'PG';
  let biggestGap = -999;
  (Object.keys(ideal) as Position[]).forEach(pos => {
    const gap = ideal[pos] - (counts[pos] || 0);
    if (gap > biggestGap) { biggestGap = gap; mostNeeded = pos; }
  });
  return mostNeeded;
}

// ─── Scouting noise: poor scouting occasionally overvalues ──
function scoutingAdjustedRating(
  player: Player,
  scoutingRating: number,
  difficulty: string
): number {
  if (scoutingRating >= 80 || isHighDifficulty(difficulty)) {
    return player.rating;
  }
  // Poor scouting: random noise up to ±10
  const noise = scoutingRating < 60
    ? Math.floor((Math.random() - 0.5) * 20)
    : Math.floor((Math.random() - 0.5) * 8);
  return Math.min(99, Math.max(40, player.rating + noise));
}

// ─── News item builder (no Gemini) ──────────────────────────
function makeNewsItem(
  category: string,
  headline: string,
  content: string,
  day: number,
  teamId?: string,
  playerId?: string,
  isBreaking = false
): NewsItem {
  return {
    id: `ai-news-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    category: category as any,
    headline,
    content,
    timestamp: day,
    realTimestamp: Date.now(),
    teamId,
    playerId,
    isBreaking,
  };
}

function makeTransaction(
  state: LeagueState,
  type: TransactionType,
  teamIds: string[],
  description: string,
  playerIds?: string[]
): Transaction {
  return {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    timestamp: state.currentDay,
    realTimestamp: Date.now(),
    teamIds,
    playerIds,
    description,
  };
}

// ─── Roster evaluation: who gets cut ────────────────────────
function shouldRelease(p: Player, salary: number, personality: AIGMPersonality): boolean {
  if (salary > 200_000 && p.rating < 75) return true;
  if (salary > 150_000 && p.rating < 70) return true;
  if (personality === 'Rebuilder' && p.age > 32 && p.rating < 82) return true;
  if (personality === 'Win Now' && p.rating < 72) return true;
  return false;
}

// ─── Main offseason AI GM run ────────────────────────────────
export interface AIGMOffseasonResult {
  updatedState: LeagueState;
  newsItems: NewsItem[];
  transactions: Transaction[];
}

export function runAIGMOffseason(
  state: LeagueState,
  difficulty: string
): AIGMOffseasonResult {
  let s = { ...state, teams: state.teams.map(t => ({ ...t, roster: [...t.roster] })) };
  let faPool = [...s.freeAgents];
  const newsItems: NewsItem[] = [];
  const txs: Transaction[] = [];
  const salaryCap = s.settings.salaryCap;

  // Build a sorted list of top FAs for "superstar chaser" detection
  const topFAIds = new Set(
    [...faPool].sort((a, b) => b.rating - a.rating).slice(0, 5).map(p => p.id)
  );

  for (let teamIdx = 0; teamIdx < s.teams.length; teamIdx++) {
    const t = s.teams[teamIdx];
    if (t.id === s.userTeamId) continue;

    const personality = t.aiGM?.personality ?? 'Balanced';
    const ratings = t.aiGM?.ratings ?? generateAIGMRatings('Balanced');

    // ── 1. ROSTER CUTS ──────────────────────────────────────
    let currentRoster = [...t.roster];
    const released: Player[] = [];

    currentRoster = currentRoster.filter(p => {
      if (currentRoster.length <= 10) return true; // never below 10
      if (personality === 'Loyalist' && p.morale >= 60) return true; // loyalist keeps happy players
      if (shouldRelease(p, p.salary, personality)) {
        released.push(p);
        return false;
      }
      return true;
    });

    released.forEach(p => {
      faPool.push({ ...p, isFreeAgent: true, contractYears: 0 });
      newsItems.push(makeNewsItem(
        'signing',
        `${t.abbreviation} ROSTER MOVE`,
        `${t.name} have waived ${p.name} (${p.position}, ${p.rating} OVR).`,
        s.currentDay, t.id, p.id
      ));
      txs.push(makeTransaction(s, 'release', [t.id], `${t.name} released ${p.name}.`, [p.id]));
    });

    // ── 2. FREE AGENT SIGNING ────────────────────────────────
    // Sort FA pool by personality priorities
    const rankedFAs = [...faPool].sort((a, b) => {
      switch (personality) {
        case 'Rebuilder':     return a.age - b.age; // youngest first
        case 'Win Now':       return b.rating - a.rating;
        case 'Analytics': {
          const tsA = (a.stats.fga + 0.44 * a.stats.fta) > 0 ? a.stats.points / (2 * (a.stats.fga + 0.44 * a.stats.fta)) : 0.5;
          const tsB = (b.stats.fga + 0.44 * b.stats.fta) > 0 ? b.stats.points / (2 * (b.stats.fga + 0.44 * b.stats.fta)) : 0.5;
          return tsB - tsA;
        }
        case 'Superstar Chaser': return b.rating - a.rating;
        default:              return b.rating - a.rating;
      }
    });

    // Max 3 signings per team per offseason
    let signingsLeft = 3;
    for (const fa of rankedFAs) {
      if (currentRoster.length >= 15) break;
      if (signingsLeft <= 0) break;

      // Rebuilder: skip players over 24
      if (personality === 'Rebuilder' && fa.age > 24 && fa.rating < 83) continue;
      // Analytics: skip low TS% high USG% (check if enough data)
      if (personality === 'Analytics') {
        const fga = fa.stats.fga || 0;
        const fta = fa.stats.fta || 0;
        const ts = (fga + 0.44 * fta) > 0 ? fa.stats.points / (2 * (fga + 0.44 * fta)) : 0.5;
        if (fa.stats.gamesPlayed > 5 && ts < 0.45 && fa.rating < 82) continue;
      }
      // Win Now: only OVR 75+
      if (personality === 'Win Now' && fa.rating < 75) continue;

      // Check salary cap
      const currentSalary = rosterSalary({ ...t, roster: currentRoster });
      const offerAmt = faOfferAmount(
        fa, { ...t, roster: currentRoster }, salaryCap,
        personality, ratings.negotiation, difficulty,
        topFAIds.has(fa.id)
      );

      if (currentSalary + offerAmt > salaryCap * 1.1 && personality !== 'Win Now') continue;

      // Sign the player
      const signedPlayer: Player = {
        ...fa,
        isFreeAgent: false,
        salary: offerAmt,
        contractYears: personality === 'Win Now' ? 3 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3),
        status: 'Rotation' as PlayerStatus,
        morale: 70 + Math.floor(Math.random() * 20),
      };

      currentRoster.push(signedPlayer);
      faPool = faPool.filter(p => p.id !== fa.id);
      signingsLeft--;

      newsItems.push(makeNewsItem(
        'signing',
        `${t.abbreviation} SIGNING`,
        `${t.name} have signed ${fa.name} (${fa.position}, ${fa.rating} OVR) to a ${signedPlayer.contractYears}-year deal worth $${(offerAmt / 1_000_000).toFixed(1)}M.`,
        s.currentDay, t.id, fa.id, fa.rating >= 85
      ));
      txs.push(makeTransaction(
        s, 'signing', [t.id], `${t.name} signed ${fa.name} to $${(offerAmt / 1_000_000).toFixed(1)}M / ${signedPlayer.contractYears}yr.`, [fa.id]
      ));
    }

    // ── 3. COACH MANAGEMENT ──────────────────────────────────
    const wins = t.prevSeasonWins ?? t.wins;
    const losses = (s.settings.seasonLength ?? 82) - wins;
    const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;
    const hc = t.staff.headCoach;

    if (hc && winPct < 0.35) {
      // Fire threshold by personality
      const fireChance = personality === 'Win Now' ? 0.85 : personality === 'Loyalist' ? 0.25 : 0.5;
      if (Math.random() < fireChance) {
        newsItems.push(makeNewsItem(
          'firing',
          `${t.abbreviation} COACH FIRED`,
          `${t.name} have parted ways with Head Coach ${hc.name} after a ${wins}-${losses} season.`,
          s.currentDay, t.id, undefined, true
        ));
        txs.push(makeTransaction(s, 'firing', [t.id], `${t.name} fired Head Coach ${hc.name}.`));

        // Hire a new coach based on personality
        const preferredBadge: CoachBadge = getPreferredCoachBadge(personality);
        const newCoach = generateCoach(`ai-coach-${Date.now()}-${t.id}`, 'C', s.settings.coachGenderRatio);
        const hiredCoach: typeof newCoach = { ...newCoach, badges: [preferredBadge, ...newCoach.badges.slice(0, 1)] };

        s = {
          ...s,
          teams: s.teams.map(tm =>
            tm.id === t.id
              ? { ...tm, staff: { ...tm.staff, headCoach: hiredCoach }, roster: currentRoster }
              : tm
          ),
        };

        newsItems.push(makeNewsItem(
          'hiring',
          `${t.abbreviation} NEW COACH`,
          `${t.name} have hired Coach ${hiredCoach.name} as their new Head Coach.`,
          s.currentDay, t.id, undefined, false
        ));
        txs.push(makeTransaction(s, 'hiring', [t.id], `${t.name} hired ${hiredCoach.name} as Head Coach.`));

        continue; // Skip the normal roster update for this team since we did it above
      }
    }

    // Update this team's roster in state
    s = {
      ...s,
      teams: s.teams.map(tm => tm.id === t.id ? { ...tm, roster: currentRoster } : tm),
    };
  }

  // ── ADAPTABILITY: Switch personality if standing changed ──
  s = {
    ...s,
    teams: s.teams.map(t => {
      if (t.id === s.userTeamId || !t.aiGM) return t;
      const { personality, ratings } = t.aiGM;
      if (ratings.adaptability < 80) return t;

      const wins = t.prevSeasonWins ?? t.wins;
      const totalGames = s.settings.seasonLength ?? 82;
      const winPct = totalGames > 0 ? wins / totalGames : 0;

      // High adaptability: if young team is now winning, switch to Win Now
      if (personality === 'Rebuilder' && winPct > 0.55) {
        newsItems.push(makeNewsItem(
          'trade_request',
          `${t.abbreviation} STRATEGY SHIFT`,
          `${t.name} are shifting their strategy. After a breakout season, they're pivoting to compete immediately.`,
          s.currentDay, t.id
        ));
        return { ...t, aiGM: { ...t.aiGM, personality: 'Win Now' } };
      }
      // If losing badly, switch to Rebuilder
      if ((personality === 'Win Now' || personality === 'Superstar Chaser') && winPct < 0.35) {
        newsItems.push(makeNewsItem(
          'trade_request',
          `${t.abbreviation} REBUILD BEGINS`,
          `${t.name} are entering a rebuild after falling short of expectations.`,
          s.currentDay, t.id
        ));
        return { ...t, aiGM: { ...t.aiGM, personality: 'Rebuilder' } };
      }
      return t;
    }),
  };

  // Update FA pool in state
  s = { ...s, freeAgents: faPool };

  // Prepend news items
  const allNews = [...newsItems.slice(0, 40), ...s.newsFeed].slice(0, 100);

  return {
    updatedState: { ...s, newsFeed: allNews },
    newsItems,
    transactions: txs,
  };
}

// ─── AI Draft Pick selector ──────────────────────────────────
export function aiGMDraftPick(
  team: Team,
  availableProspects: Prospect[],
  difficulty: string
): Prospect | null {
  if (availableProspects.length === 0) return null;

  const personality = team.aiGM?.personality ?? 'Balanced';
  const ratings = team.aiGM?.ratings ?? generateAIGMRatings('Balanced');

  // Scouting noise on potential
  const scoredProspects = availableProspects.map(p => {
    const noisePot = scoutingAdjustedRating(p as unknown as Player, ratings.scouting, difficulty);
    const noiseOvr = scoutingAdjustedRating(p as unknown as Player, ratings.scouting, difficulty);
    return { p, adjustedPot: noisePot, adjustedOvr: noiseOvr };
  });

  let sorted: typeof scoredProspects;

  switch (personality) {
    case 'Rebuilder':
      // Always take highest potential
      sorted = [...scoredProspects].sort((a, b) => b.adjustedPot - a.adjustedPot);
      break;
    case 'Win Now':
      // Take highest OVR, ignores potential
      sorted = [...scoredProspects].sort((a, b) => b.adjustedOvr - a.adjustedOvr);
      break;
    case 'Analytics': {
      // Prioritize scoutGrade (proxy for advanced metrics)
      sorted = [...scoredProspects].sort((a, b) => {
        const scoreA = a.p.scoutGrade * 0.6 + a.adjustedPot * 0.4;
        const scoreB = b.p.scoutGrade * 0.6 + b.adjustedPot * 0.4;
        return scoreB - scoreA;
      });
      break;
    }
    case 'Superstar Chaser':
      // Reach for high-upside players; bias toward OVR with upside
      sorted = [...scoredProspects].sort((a, b) => {
        const potBonus = a.adjustedPot >= 85 ? 15 : 0;
        const potBonusB = b.adjustedPot >= 85 ? 15 : 0;
        return (b.adjustedOvr + potBonusB) - (a.adjustedOvr + potBonus);
      });
      break;
    case 'Loyalist':
      // Favor players from team's position of need
      const needed = mostNeededPosition(team);
      sorted = [...scoredProspects].sort((a, b) => {
        const aNeed = a.p.position === needed ? 10 : 0;
        const bNeed = b.p.position === needed ? 10 : 0;
        return (b.adjustedPot + bNeed) - (a.adjustedPot + aNeed);
      });
      break;
    default:
      // BPA — best player available (combined score)
      sorted = [...scoredProspects].sort((a, b) =>
        (b.adjustedOvr * 0.5 + b.adjustedPot * 0.5) - (a.adjustedOvr * 0.5 + a.adjustedPot * 0.5)
      );
  }

  // Difficulty: Rookie/Easy → 30% chance AI misses value
  if ((difficulty === 'Easy' || difficulty === 'Rookie') && Math.random() < 0.30) {
    const missIdx = Math.floor(Math.random() * Math.min(5, sorted.length));
    return sorted[missIdx]?.p ?? sorted[0].p;
  }

  return sorted[0]?.p ?? null;
}

// ─── Coach badge preference ──────────────────────────────────
function getPreferredCoachBadge(personality: AIGMPersonality): CoachBadge {
  switch (personality) {
    case 'Win Now':         return Math.random() > 0.5 ? 'Offensive Architect' : 'Clutch Specialist';
    case 'Rebuilder':       return 'Developmental Genius';
    case 'Analytics':       return Math.random() > 0.5 ? 'Pace Master' : 'Offensive Architect';
    case 'Loyalist':        return Math.random() > 0.5 ? 'Defensive Guru' : 'Developmental Genius';
    case 'Superstar Chaser': return Math.random() > 0.5 ? 'Star Handler' : 'Offensive Architect';
    default:                return 'Developmental Genius';
  }
}

// ─── Trade evaluation ────────────────────────────────────────
export interface TradePackage {
  players: Player[];
  picks: DraftPick[];
}

export function evaluateTrade(
  receiving: TradePackage,
  sending: TradePackage,
  personality: AIGMPersonality,
  totalTeams: number
): boolean {
  const valueOf = (pkg: TradePackage) => {
    const pVal = pkg.players.reduce((s, p) => s + playerTradeValue(p, personality), 0);
    const dVal = pkg.picks.reduce((s, pick) => s + draftPickValue(pick, personality, totalTeams), 0);
    return pVal + dVal;
  };

  const recVal = valueOf(receiving);
  const senVal = valueOf(sending);

  // Superstar Chaser: accept bad value for OVR 90+
  if (personality === 'Superstar Chaser') {
    const hasStar = receiving.players.some(p => p.rating >= 90);
    if (hasStar) return true;
  }

  // Accept if receiving at least 90% of what you're sending
  return recVal >= senVal * 0.9;
}

// ─── Deadline logic (mid-season) ────────────────────────────
export function aiGMTradeDeadlineAction(
  state: LeagueState
): { newsItems: NewsItem[]; updatedState: LeagueState } {
  const newsItems: NewsItem[] = [];
  let s = { ...state };

  const totalGames = s.settings.seasonLength ?? 82;

  s = {
    ...s,
    teams: s.teams.map(t => {
      if (t.id === s.userTeamId || !t.aiGM) return t;
      const { personality } = t.aiGM;
      const totalPlayed = t.wins + t.losses;
      if (totalPlayed < 20) return t; // Too early

      const winPct = totalPlayed > 0 ? t.wins / totalPlayed : 0.5;
      const gamesAbove = t.wins - t.losses;

      // Rebuilder sells veterans if 5+ below .500
      if (personality === 'Rebuilder' && gamesAbove <= -5) {
        const veterans = t.roster.filter(p => p.age >= 30 && p.rating >= 75 && p.contractYears <= 2);
        if (veterans.length > 0) {
          const v = veterans[0];
          newsItems.push(makeNewsItem(
            'signing',
            `${t.abbreviation} TRADE DEADLINE`,
            `${t.name} are making veteran ${v.name} available, signaling the start of a full rebuild.`,
            s.currentDay, t.id, v.id, false
          ));
        }
      }

      // Win Now buys if 5+ above .500
      if ((personality === 'Win Now' || personality === 'Superstar Chaser') && gamesAbove >= 5) {
        newsItems.push(makeNewsItem(
          'trade_request',
          `${t.abbreviation} BUYING AT DEADLINE`,
          `${t.name} are aggressive buyers at the trade deadline, seeking help to push for a title.`,
          s.currentDay, t.id, undefined, false
        ));
      }

      return t;
    }),
  };

  return { newsItems, updatedState: s };
}

// ─── Summary of AI personalities for display ────────────────
export const AI_GM_PERSONALITY_INFO: Record<AIGMPersonality, {
  color: string;
  description: string;
  focus: string;
}> = {
  'Rebuilder':         { color: 'text-emerald-400', description: 'Youth & potential, trades veterans for picks', focus: 'Youth Movement' },
  'Win Now':           { color: 'text-amber-400',   description: 'Mortgages future to win today', focus: 'Championship Window' },
  'Analytics':         { color: 'text-sky-400',     description: 'Data-driven, values efficiency over box scores', focus: 'Advanced Metrics' },
  'Loyalist':          { color: 'text-rose-400',    description: 'Builds through continuity and loyalty', focus: 'Core Retention' },
  'Superstar Chaser':  { color: 'text-purple-400',  description: 'Sacrifices depth for elite talent', focus: 'Star Power' },
  'Balanced':          { color: 'text-slate-300',   description: 'Conventional decisions, adapts to record', focus: 'Stability' },
};
