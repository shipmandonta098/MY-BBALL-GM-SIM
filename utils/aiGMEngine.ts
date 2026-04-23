/**
 * AI GM Engine — Hoops Dynasty
 * Autonomous decision-making for every non-user team.
 */

import {
  LeagueState, Team, Player, Prospect, Coach, DraftPick,
  NewsItem, Transaction, TransactionType, PlayerStatus, Position,
  CoachBadge, CoachScheme, TradeProposal, TradePiece,
} from '../types';
import { generateCoach } from '../constants';
import { snapshotPlayerStats } from './playerUtils';

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

/** A single prioritized roster need for a team, used in draft and FA logic. */
export interface TeamNeedItem {
  label: string;
  urgency: 'Critical' | 'High' | 'Medium';
  positions: Position[];
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
  totalTeams: number,
  currentSeason?: number
): number {
  const round = pick.round;
  // Use pick position if known; otherwise assume ~40th percentile (mid-first range)
  const estimatedPick = pick.pick > 0 ? pick.pick : Math.floor(totalTeams * 0.4);

  let base: number;
  if (round === 1) {
    if (estimatedPick <= 5)       base = 55; // lottery
    else if (estimatedPick <= 14) base = 40; // mid-first
    else                          base = 28; // late-first
  } else {
    base = Math.max(5, 20 - estimatedPick * 0.2);
  }

  // 15% discount per year into the future
  if (currentSeason && pick.year && pick.year > currentSeason) {
    const yearsOut = pick.year - currentSeason;
    base *= Math.pow(0.85, yearsOut);
  }

  if (personality === 'Rebuilder')        return base * 1.35;
  if (personality === 'Win Now')          return base * 0.60;
  if (personality === 'Superstar Chaser') return base * 0.55;
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
  const capSpace = Math.max(0, salaryCap - rosterSalary(teamContext));
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
  return Math.max(600_000, Math.min(maxBid, bid));
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

// ─── Value Over Replacement: how much better is this player vs a freely available sub ─
function valueOverReplacement(p: Player): number {
  // Replacement level ≈ 74 OVR (a player any team can find on the street)
  const REPLACEMENT_OVR = 74;
  const ratingVOR = p.rating - REPLACEMENT_OVR;

  // Age curve: prime 26-30, slight boost for upside youth, penalty for old age
  const ageMultiplier =
    p.age <= 23 ? 1.10 :
    p.age <= 30 ? 1.00 :
    p.age <= 33 ? 0.90 :
    p.age <= 36 ? 0.78 : 0.62;

  // Status bonus: starters provide more win-share per dollar
  const roleBonus = p.status === 'Starter' ? 4 : p.status === 'Rotation' ? 1 : -2;

  // Long-term injury heavily reduces immediate value
  const injuryDays = p.injuryDaysLeft ?? 0;
  const injuryPenalty = injuryDays > 60 ? -10 : injuryDays > 30 ? -5 : 0;

  return (ratingVOR * ageMultiplier) + roleBonus + injuryPenalty;
}

// ─── Roster evaluation: who gets cut ────────────────────────
type ReleaseReason = 'dead_weight' | 'long_term_injury' | 'youth_over_veteran' | 'cap_desperation' | 'none';

function shouldRelease(
  p: Player,
  salary: number,
  personality: AIGMPersonality,
  capType: 'Soft Cap' | 'Hard Cap',
  salaryCap: number,
  teamPayroll: number,
  luxuryTaxLine: number,
  secondApron: number,
  isWomens: boolean,
): { release: boolean; reason: ReleaseReason } {
  const no = { release: false, reason: 'none' as const };
  const salaryPct = salary / salaryCap; // salary as fraction of cap — scales for both leagues

  const vor = valueOverReplacement(p);

  // ── ABSOLUTE DEAD WEIGHT: release regardless of cap rules ──────────────────
  // Truly below-minimum-value player — any team would cut these
  if (p.rating < 65) return { release: true, reason: 'dead_weight' };
  // Paying more than league min for a player who can't hold a roster spot
  if (salary > salaryCap * 0.004 && p.rating < 68) return { release: true, reason: 'dead_weight' };
  // VOR so negative they actively hurt the roster
  if (vor < -12) return { release: true, reason: 'dead_weight' };

  // ── LONG-TERM INJURY + OLD + BELOW STAR THRESHOLD ─────────────────────────
  const injuryDays = p.injuryDaysLeft ?? 0;
  if (injuryDays > 60 && p.age >= 34 && p.rating < 82) {
    return { release: true, reason: 'long_term_injury' };
  }
  // Very old player with severe long-term injury and not a star
  if (injuryDays > 45 && p.age >= 37 && p.rating < 88) {
    return { release: true, reason: 'long_term_injury' };
  }

  // ── HARD CAP: standard aggressive release logic ────────────────────────────
  if (capType === 'Hard Cap') {
    if (p.rating < 70) return { release: true, reason: 'dead_weight' };
    if (personality === 'Rebuilder' && p.age > 32 && p.rating < 82) return { release: true, reason: 'youth_over_veteran' };
    if (personality === 'Win Now' && p.rating < 74) return { release: true, reason: 'dead_weight' };
    // Cap-relative overpay thresholds (7%/13%/19%/24% of cap → ≈$10M/$18M/$26M/$34M on $140M cap)
    if (p.rating < 76 && salaryPct > 0.07) return { release: true, reason: 'dead_weight' };
    if (p.rating < 80 && salaryPct > 0.13) return { release: true, reason: 'dead_weight' };
    if (p.rating < 84 && salaryPct > 0.19) return { release: true, reason: 'dead_weight' };
    if (p.rating < 87 && salaryPct > 0.24) return { release: true, reason: 'dead_weight' };
    return no;
  }

  // ── SOFT CAP: be conservative — luxury tax is the cost of winning ──────────
  // AI GMs should willingly pay into luxury tax for productive players.
  // Only waive under these specific, justified circumstances:

  // 1. Rebuilder clearing minutes for youth development
  if (personality === 'Rebuilder') {
    if (p.age > 34 && p.rating < 80 && vor < 3) return { release: true, reason: 'youth_over_veteran' };
    if (p.age > 37 && p.rating < 87) return { release: true, reason: 'youth_over_veteran' };
  }

  // 2. Team is in genuine second-apron crisis AND player is below replacement
  const overSecondApron = teamPayroll > secondApron;
  if (overSecondApron && vor < 0) {
    return { release: true, reason: 'cap_desperation' };
  }

  // 3. Catastrophic salary-to-value mismatch even for a soft-cap team:
  //    >20% of cap for a clearly below-average player (generous threshold, rarely triggered)
  //    Women's: apply the same cap-relative standard — no need to change the percentage
  if (p.rating < 74 && salaryPct > 0.20 && vor < 0) {
    return { release: true, reason: 'dead_weight' };
  }
  // Extremely egregious contract for a player who is firmly below-average
  if (p.rating < 77 && salaryPct > 0.28) return { release: true, reason: 'dead_weight' };

  // Everything else: keep the player (even if overpaid) — trade them instead
  return no;
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
  // ── HARD LOCK: no AI roster moves (cuts, signings, trades) until the draft
  // is 100% complete. This prevents waivers/releases from appearing in the
  // news feed or transaction log during the lottery or draft phase.
  if (state.draftPhase !== 'completed') {
    return { updatedState: state, newsItems: [], transactions: [] };
  }

  let s = { ...state, teams: state.teams.map(t => ({ ...t, roster: [...t.roster] })) };
  let faPool = [...s.freeAgents];
  const newsItems: NewsItem[] = [];
  const txs: Transaction[] = [];
  const salaryCap = s.settings.salaryCap;
  const luxuryTaxLine = s.settings.luxuryTaxLine || (salaryCap * 1.21);
  // NBA-calibrated apron thresholds (same offsets used in FreeAgency/Finances UI)
  const FIRST_APRON   = salaryCap + 56_000_000;  // ~$196M on $140M cap
  const SECOND_APRON  = salaryCap + 68_000_000;  // ~$208M — near-hard cap
  // Emergency relief triggers at first apron; hard signing block at second apron
  const LUXURY_CEILING  = FIRST_APRON;           // nobody signs past first apron
  // Personality-specific signing caps (below first apron)
  const CAP_WIN_NOW    = luxuryTaxLine + 28_000_000; // Win Now: up to ~$30M over tax
  const CAP_STANDARD   = luxuryTaxLine + 8_000_000;  // Others: ~$8M over tax

  // Build a sorted list of top FAs for "superstar chaser" detection
  const topFAIds = new Set(
    [...faPool].sort((a, b) => b.rating - a.rating).slice(0, 5).map(p => p.id)
  );

  // Detect women's league for conservatism adjustments
  const isWomensLeague = (s.settings.playerGenderRatio ?? 0) === 100;
  const capType = s.settings.salaryCapType ?? 'Soft Cap';

  for (let teamIdx = 0; teamIdx < s.teams.length; teamIdx++) {
    const t = s.teams[teamIdx];
    if (t.id === s.userTeamId) continue;

    const personality = t.aiGM?.personality ?? 'Balanced';
    const ratings = t.aiGM?.ratings ?? generateAIGMRatings('Balanced');

    // ── 1. ROSTER CUTS ──────────────────────────────────────
    // STRICTLY LOCKED during Draft Lottery, Live Draft, or any draft sub-phase.
    // Waivers and releases are only processed after the draft is 100% complete.
    let currentRoster = [...t.roster];

    if (s.draftPhase === 'completed') {
      const teamPayroll = rosterSalary(t);
      const released: { player: Player; reason: ReleaseReason }[] = [];
      // Players worth keeping but overpaid → mark for trade block instead of waiving
      const tradeBlockCandidates: Player[] = [];
      const minRoster = s.settings.minRosterSize ?? 10;
      // Under a soft cap AI GMs should rarely waive good players — cap releases to 2 per team.
      // Under a hard cap the limit stays at 3.
      let releasesThisTeam = 0;
      const MAX_RELEASES_PER_TEAM = capType === 'Hard Cap' ? 3 : 2;

      currentRoster = currentRoster.filter(p => {
        if (releasesThisTeam >= MAX_RELEASES_PER_TEAM) return true;
        if (currentRoster.length <= minRoster) return true;
        if (personality === 'Loyalist' && p.morale >= 60) return true;
        const { release, reason } = shouldRelease(
          p, p.salary, personality,
          capType, salaryCap, teamPayroll, luxuryTaxLine, SECOND_APRON, isWomensLeague,
        );
        if (release) {
          released.push({ player: p, reason });
          releasesThisTeam++;
          return false;
        }
        // Under soft cap: overpaid-but-decent players go on trade block instead of getting waived
        if (capType === 'Soft Cap' && p.rating >= 74 && p.salary / salaryCap > 0.12 && p.rating < 82) {
          tradeBlockCandidates.push(p);
        }
        return true;
      });

      // Mark trade-block candidates (keep on roster, explore trades)
      tradeBlockCandidates.forEach(p => {
        const idx = currentRoster.findIndex(r => r.id === p.id);
        if (idx >= 0) currentRoster[idx] = { ...currentRoster[idx], onTradeBlock: true };
        const salaryM = (p.salary / 1_000_000).toFixed(1);
        newsItems.push(makeNewsItem(
          'transaction',
          `${t.abbreviation} EXPLORING TRADE`,
          `${t.name} have made ${p.name} ($${salaryM}M) available for trade as the front office looks to reshape the roster and improve flexibility.`,
          s.currentDay, t.id, p.id,
        ));
      });

      released.forEach(({ player: p, reason }) => {
        faPool.push({ ...p, isFreeAgent: true, contractYears: 0 });
        const pronoun = p.gender === 'Female' ? 'her' : 'his';
        const salaryM = (p.salary / 1_000_000).toFixed(1);
        const lastName = p.name.split(' ').slice(-1)[0];

        // Context-specific Dynasty Feed messaging
        const content = (() => {
          switch (reason) {
            case 'youth_over_veteran':
              return `${t.name} have released veteran ${p.name} (age ${p.age}) to open roster minutes for younger talent. The move accelerates the team's rebuild.`;
            case 'long_term_injury':
              return `${p.name} has been waived by ${t.name} following a lengthy injury. The ${p.position} was sidelined for the foreseeable future, and both sides agreed a fresh start made sense.`;
            case 'cap_desperation':
              return `${t.name} part ways with ${p.name} ($${salaryM}M) in a salary-clearing move to get below the second-apron threshold and restore financial flexibility.`;
            case 'dead_weight':
            default: {
              const templates = [
                `${t.name} have released ${p.name} as they reshape the roster heading into the offseason. ${p.name} clears waivers and becomes an unrestricted free agent.`,
                `${p.name} has been waived by ${t.name}. The ${p.position} failed to hold a consistent roster spot and the front office moved on.`,
                `${t.name} part ways with ${lastName} in a roster move. The organization thanked ${pronoun} for ${pronoun} contributions and wished ${pronoun} well.`,
              ];
              return templates[Math.floor(Math.random() * templates.length)];
            }
          }
        })();

        newsItems.push(makeNewsItem('transaction', `${t.abbreviation} ROSTER MOVE`, content, s.currentDay, t.id, p.id));
        txs.push(makeTransaction(s, 'release', [t.id], `${t.name} released ${p.name}.`, [p.id]));
      });
    }

    // ── 1.8 EMERGENCY CAP RELIEF ────────────────────────────────
    // Under a SOFT CAP: AI GMs can and should operate in the luxury tax — even the
    // first apron — for a competitive roster. Emergency relief only kicks in when the
    // team is genuinely above the SECOND APRON (near-hard cap), which severely limits
    // roster moves and triggers punishing repeater-tax bills.
    // Under a HARD CAP: enforce strictly at the first-apron ceiling as before.
    // Never cut 88+ OVR players, never drop below min roster size.
    // Women's leagues: same cap-relative logic, just lower dollar figures.
    {
      const minRoster = s.settings.minRosterSize ?? 10;
      let emergencyCuts = 0;

      // Soft cap: only trigger if above second apron (truly punishing territory).
      // Hard cap: trigger at first apron (LUXURY_CEILING) as before.
      // Aggressive personalities (Win Now, Superstar Chaser) get a small buffer
      // even in second-apron territory before we force cuts.
      const isAggressive = personality === 'Win Now' || personality === 'Superstar Chaser';
      const reliefTarget = capType === 'Hard Cap'
        ? (isAggressive ? LUXURY_CEILING : luxuryTaxLine + 15_000_000)
        : (isAggressive ? SECOND_APRON + salaryCap * 0.03 : SECOND_APRON); // soft cap: only cut past 2nd apron

      // Under soft cap, protect any player with OVR ≥ 82 from emergency cuts
      // (they're worth the tax bill). Hard cap: protect only 88+ OVR.
      const emergencyCutFloor = capType === 'Hard Cap' ? 88 : 82;

      // Max cuts: fewer allowed under soft cap to avoid over-waiving good players
      const MAX_EMERGENCY_CUTS = capType === 'Hard Cap' ? 8 : 4;

      while (
        rosterSalary({ ...t, roster: currentRoster }) > reliefTarget &&
        currentRoster.length > minRoster &&
        emergencyCuts < MAX_EMERGENCY_CUTS
      ) {
        // Sort by value-over-replacement (ascending) — cut least-valuable first
        const candidates = currentRoster
          .filter(p => p.rating < emergencyCutFloor)
          .sort((a, b) => valueOverReplacement(a) - valueOverReplacement(b));
        if (candidates.length === 0) break;
        const toCut = candidates[0];
        currentRoster = currentRoster.filter(p => p.id !== toCut.id);
        faPool.push({ ...toCut, isFreeAgent: true, contractYears: 0 });
        emergencyCuts++;
        const salaryM = (toCut.salary / 1_000_000).toFixed(1);
        const capContext = capType === 'Hard Cap'
          ? 'luxury tax ceiling'
          : 'second-apron threshold';
        newsItems.push(makeNewsItem(
          'transaction',
          `${t.abbreviation} CAP RELIEF`,
          `${t.name} release ${toCut.name} ($${salaryM}M) in a salary-clearing move to get below the ${capContext} and restore roster flexibility.`,
          s.currentDay, t.id, toCut.id,
        ));
        txs.push(makeTransaction(s, 'release', [t.id], `${t.name} released ${toCut.name} (cap relief).`, [toCut.id]));
      }
    }

    // ── 1.5 + 2. RE-SIGNINGS & FA SIGNINGS ────────────────────
    {
      // ── 1.5. RE-SIGN OWN EXPIRING STARS (83+ OVR) ──────────
      const ownExpiring = faPool
        .filter(p => p.lastTeamId === t.id && p.rating >= 83)
        .sort((a, b) => b.rating - a.rating);
      for (const fa of ownExpiring) {
        if (currentRoster.length >= (s.settings.maxRosterSize ?? 15)) break;
        const currentSalary = rosterSalary({ ...t, roster: currentRoster });
        const offerAmt = faOfferAmount(fa, { ...t, roster: currentRoster }, salaryCap, personality, ratings.negotiation, difficulty, topFAIds.has(fa.id));
        const isHardCap = s.settings.salaryCapType === 'Hard Cap';
        if (isHardCap && currentSalary + offerAmt > salaryCap) continue;
        if (!isHardCap && personality === 'Win Now' && currentSalary + offerAmt > CAP_WIN_NOW) continue;
        if (!isHardCap && personality !== 'Win Now' && currentSalary + offerAmt > CAP_STANDARD) continue;
        if (currentSalary + offerAmt > LUXURY_CEILING) continue; // absolute ceiling = first apron
        const maxYears = s.settings.maxContractYears ?? 5;
        const rawYears = 2 + Math.floor(Math.random() * 3);
        const signedPlayer: Player = {
          ...fa,
          isFreeAgent: false,
          salary: offerAmt,
          contractYears: Math.min(rawYears, maxYears),
          status: 'Rotation' as PlayerStatus,
          morale: Math.min(95, (fa.morale ?? 70) + 10),
        };
        currentRoster.push(signedPlayer);
        faPool = faPool.filter(p => p.id !== fa.id);
        newsItems.push(makeNewsItem(
          'signing',
          `${t.abbreviation} RE-SIGNS`,
          (() => {
            const yrs = signedPlayer.contractYears;
            const totalM = ((offerAmt * yrs) / 1_000_000).toFixed(1);
            const perYrM = (offerAmt / 1_000_000).toFixed(1);
            const templates = [
              `${fa.name} stays with ${t.name} on a ${yrs}-year, $${totalM}M deal ($${perYrM}M/yr). The front office locks up a key piece of the core.`,
              `${t.name} agree to terms with ${fa.name} — ${yrs} years, $${totalM}M. He was a priority re-sign and the team got it done.`,
              `${fa.name} is staying put. He and the ${t.name} agreed to a ${yrs}-year extension worth $${totalM}M.`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
          })(),
          s.currentDay, t.id, fa.id, fa.rating >= 88
        ));
        txs.push(makeTransaction(s, 'signing', [t.id], `${t.name} re-signed ${fa.name}.`, [fa.id]));
      }

      // ── 2. FREE AGENT SIGNING ──────────────────────────────
      const rankedFAs = [...faPool].sort((a, b) => {
        switch (personality) {
          case 'Rebuilder':     return a.age - b.age;
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

      let signingsLeft = 3;
      for (const fa of rankedFAs) {
        if (currentRoster.length >= 15) break;
        if (signingsLeft <= 0) break;
        if (personality === 'Rebuilder' && fa.age > 24 && fa.rating < 83) continue;
        if (personality === 'Analytics') {
          const fga = fa.stats.fga || 0;
          const fta = fa.stats.fta || 0;
          const ts = (fga + 0.44 * fta) > 0 ? fa.stats.points / (2 * (fga + 0.44 * fta)) : 0.5;
          if (fa.stats.gamesPlayed > 5 && ts < 0.45 && fa.rating < 82) continue;
        }
        if (personality === 'Win Now' && fa.rating < 75) continue;

        const currentSalary = rosterSalary({ ...t, roster: currentRoster });
        const offerAmt = faOfferAmount(
          fa, { ...t, roster: currentRoster }, salaryCap,
          personality, ratings.negotiation, difficulty,
          topFAIds.has(fa.id)
        );
        const isHardCap = s.settings.salaryCapType === 'Hard Cap';
        if (isHardCap && currentSalary + offerAmt > salaryCap) continue;
        if (!isHardCap && personality === 'Win Now' && currentSalary + offerAmt > CAP_WIN_NOW) continue;
        if (!isHardCap && personality !== 'Win Now' && currentSalary + offerAmt > CAP_STANDARD) continue;
        if (currentSalary + offerAmt > LUXURY_CEILING) continue; // absolute ceiling = first apron
        if (currentRoster.length >= (s.settings.maxRosterSize ?? 15)) continue;

        const maxYears = s.settings.maxContractYears ?? 5;
        const rawYears = personality === 'Win Now' ? 3 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
        const signedPlayer: Player = {
          ...fa,
          isFreeAgent: false,
          salary: offerAmt,
          contractYears: Math.min(rawYears, maxYears),
          status: 'Rotation' as PlayerStatus,
          morale: 70 + Math.floor(Math.random() * 20),
        };
        currentRoster.push(signedPlayer);
        faPool = faPool.filter(p => p.id !== fa.id);
        signingsLeft--;

        newsItems.push(makeNewsItem(
          'signing',
          `${t.abbreviation} SIGNING`,
          (() => {
            const yrs = signedPlayer.contractYears;
            const totalM = ((offerAmt * yrs) / 1_000_000).toFixed(1);
            const perYrM = (offerAmt / 1_000_000).toFixed(1);
            const templates = [
              `${t.name} agree to terms with ${fa.name} — ${yrs} years, $${totalM}M ($${perYrM}M/yr). He fills a clear need and upgrades the rotation.`,
              `${fa.name} picks ${t.name}, agreeing to a ${yrs}-year, $${totalM}M deal. A statement signing for the front office.`,
              `The ${t.name} land ${fa.name} on a ${yrs}-year, $${totalM}M contract. Expect him in the lineup immediately.`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
          })(),
          s.currentDay, t.id, fa.id, fa.rating >= 85
        ));
        txs.push(makeTransaction(
          s, 'signing', [t.id], `${t.name} signed ${fa.name} to $${(offerAmt / 1_000_000).toFixed(1)}M / ${signedPlayer.contractYears}yr.`, [fa.id]
        ));
      }
    } // end re-signings & FA signings block

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
          (() => {
            const templates = [
              `${hc.name} is out in ${t.name} after a ${wins}-${losses} season. The front office decided a change was necessary to move forward.`,
              `${t.name} fire Head Coach ${hc.name} following a disappointing ${wins}-${losses} campaign. A national search begins immediately.`,
              `After going ${wins}-${losses}, ${hc.name} will not return as Head Coach of ${t.name}. The organization is pivoting in a new direction.`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
          })(),
          s.currentDay, t.id, undefined, true
        ));
        txs.push(makeTransaction(s, 'firing', [t.id], `${t.name} fired Head Coach ${hc.name}.`));

        // Hire a new coach based on personality (offseason — permanent hire, no interim needed)
        const preferredBadge: CoachBadge = getPreferredCoachBadge(personality);
        const newCoach = generateCoach(`ai-coach-${Date.now()}-${t.id}`, 'C', s.settings.coachGenderRatio);
        const hiredCoach: typeof newCoach = { ...newCoach, badges: [preferredBadge, ...newCoach.badges.slice(0, 1)], isInterim: false };

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
          (() => {
            const templates = [
              `${t.name} introduce ${hiredCoach.name} as their new Head Coach. He inherits a roster ready to be molded.`,
              `${hiredCoach.name} is the new Head Coach of ${t.name}. The hire signals a clear shift in philosophy for the organization.`,
              `${t.name} make it official — ${hiredCoach.name} takes the reins. He'll lead his first practice with the squad this week.`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
          })(),
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

  // ── MINIMUM PAYROLL FLOOR (post-draft only) ───────────────────────────────
  if (s.draftPhase === 'completed') {
    const payrollFloor = s.settings.minPayroll;
    if (payrollFloor && payrollFloor > 0) {
      for (let teamIdx = 0; teamIdx < s.teams.length; teamIdx++) {
        const t = s.teams[teamIdx];
        if (t.id === s.userTeamId) continue;
        let teamSalary = rosterSalary(t);
        let currentRoster = [...t.roster];
        while (teamSalary < payrollFloor && faPool.length > 0 && currentRoster.length < (s.settings.maxRosterSize ?? 15)) {
          faPool.sort((a, b) => (a.desiredContract?.salary ?? 500_000) - (b.desiredContract?.salary ?? 500_000));
          const fa = faPool.shift()!;
          const minSalary = Math.max(600_000, fa.desiredContract?.salary ?? 750_000);
          const sp: Player = { ...fa, isFreeAgent: false, salary: minSalary, contractYears: 1, status: 'Bench' as PlayerStatus };
          currentRoster.push(sp);
          teamSalary += minSalary;
        }
        s = { ...s, teams: s.teams.map(tm => tm.id === t.id ? { ...tm, roster: currentRoster } : tm) };
      }
    }
  }

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

// ─── Team Needs Analysis ────────────────────────────────────

function isGoodFitForNeed(prospect: Prospect, need: TeamNeedItem): boolean {
  const a = prospect.attributes as Record<string, number>;
  switch (need.label) {
    case 'Rim Protection':    return (a.blocks ?? 0) >= 65 || (a.interiorDef ?? 0) >= 65;
    case '3-Point Shooting':  return (a.shooting3pt ?? 0) >= 65;
    case '3-and-D Wing':      return (a.perimeterDef ?? 0) >= 60 && (a.shooting3pt ?? 0) >= 58;
    case 'Playmaking Guard':  return (a.playmaking ?? 0) >= 65 || (a.ballHandling ?? 0) >= 65;
    case 'Rebounding':        return (a.rebounding ?? 0) >= 65 || (a.defReb ?? 0) >= 65;
    case 'Stretch 4':         return (a.shooting3pt ?? 0) >= 60;
    case 'Defensive Big':     return (a.blocks ?? 0) >= 62 || (a.interiorDef ?? 0) >= 68;
    case 'Scoring Bench':     return prospect.rating >= 70;
    default:                  return true;
  }
}

/**
 * Compute up to 5 prioritised roster needs for a team, ranked by urgency.
 * Factors in position depth, attribute averages, bench quality, and coach scheme.
 */
export function computeTeamNeeds(team: Team): TeamNeedItem[] {
  const allRoster = team.roster;
  const healthyRoster = allRoster.filter(p => !p.isSuspended && p.status !== 'Injured');
  const scheme = team.activeScheme;
  const needs: TeamNeedItem[] = [];

  const posCounts: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of allRoster) posCounts[p.position as Position] = (posCounts[p.position as Position] || 0) + 1;

  const starterIds = team.rotation ? Object.values(team.rotation.starters) : [];
  const benchPlayers = allRoster.filter(p => !starterIds.includes(p.id));

  const avgAttr = (attr: string): number => {
    if (healthyRoster.length === 0) return 50;
    return healthyRoster.reduce((s, p) => s + ((p.attributes as Record<string, number>)[attr] ?? 50), 0) / healthyRoster.length;
  };

  // Rim protection
  if (avgAttr('blocks') < 55 || avgAttr('interiorDef') < 58) {
    const urgency: TeamNeedItem['urgency'] = (avgAttr('blocks') < 45 || avgAttr('interiorDef') < 48) ? 'Critical' : 'High';
    needs.push({ label: 'Rim Protection', urgency, positions: ['C', 'PF'] });
  }

  // 3-point shooting
  if (avgAttr('shooting3pt') < 60) {
    const urgency: TeamNeedItem['urgency'] = avgAttr('shooting3pt') < 50 ? 'Critical' : 'High';
    needs.push({ label: '3-Point Shooting', urgency, positions: ['SG', 'SF', 'PF'] });
  }

  // Playmaking
  if (avgAttr('playmaking') < 57 || avgAttr('ballHandling') < 55) {
    needs.push({ label: 'Playmaking Guard', urgency: 'High', positions: ['PG', 'SG'] });
  }

  // Rebounding
  if (avgAttr('rebounding') < 55 && avgAttr('defReb') < 55) {
    needs.push({ label: 'Rebounding', urgency: 'High', positions: ['C', 'PF', 'SF'] });
  }

  // Perimeter defense / 3-and-D
  if (avgAttr('perimeterDef') < 55) {
    needs.push({ label: '3-and-D Wing', urgency: 'Medium', positions: ['SF', 'SG'] });
  }

  // Thin position spots
  const posLabels: Record<Position, string> = {
    PG: 'Backup Point Guard', SG: 'Shooting Guard Depth',
    SF: 'Wing Depth', PF: 'Power Forward Depth', C: 'Center Depth',
  };
  for (const pos of (['PG', 'SG', 'SF', 'PF', 'C'] as Position[])) {
    if (posCounts[pos] < 2 && !needs.some(n => n.positions.includes(pos))) {
      const urgency: TeamNeedItem['urgency'] = posCounts[pos] === 0 ? 'Critical' : 'High';
      needs.push({ label: posLabels[pos], urgency, positions: [pos] });
    }
  }

  // Bench scoring
  const avgBenchRating = benchPlayers.length > 0
    ? benchPlayers.reduce((s, p) => s + p.rating, 0) / benchPlayers.length : 0;
  if (benchPlayers.length < 4 || avgBenchRating < 68) {
    needs.push({ label: 'Scoring Bench', urgency: 'Medium', positions: ['SG', 'SF', 'PG'] });
  }

  // Scheme-specific overrides
  if (scheme === 'Pace and Space' && avgAttr('shooting3pt') < 66 && !needs.some(n => n.label === '3-Point Shooting')) {
    needs.push({ label: 'Stretch 4', urgency: 'High', positions: ['PF', 'SF'] });
  }
  if ((scheme === 'Grit and Grind' || scheme === 'Triangle') &&
      avgAttr('blocks') < 62 && !needs.some(n => n.label === 'Rim Protection')) {
    needs.push({ label: 'Defensive Big', urgency: 'High', positions: ['C', 'PF'] });
  }

  const urgencyOrder = { Critical: 0, High: 1, Medium: 2 };
  needs.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  return needs.slice(0, 5);
}

/**
 * Score a prospect against a team's prioritised needs.
 * Returns 'Strong Fit' if prospect fills a top-2 need with matching attributes,
 * 'Good Fit' if position overlaps a top-3 need, otherwise 'Reach'.
 */
export function prospectNeedFit(prospect: Prospect, needs: TeamNeedItem[]): 'Strong Fit' | 'Good Fit' | 'Reach' {
  if (needs.length === 0) return 'Reach';
  const topNeeds = needs.slice(0, 3);
  for (const need of topNeeds.slice(0, 2)) {
    if (need.positions.includes(prospect.position as Position) && isGoodFitForNeed(prospect, need)) {
      return 'Strong Fit';
    }
  }
  for (const need of topNeeds) {
    if (need.positions.includes(prospect.position as Position)) return 'Good Fit';
  }
  return 'Reach';
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

  // Compute roster needs and desperation level
  const needs = computeTeamNeeds(team);
  const totalGames = team.wins + team.losses;
  const winPct = totalGames > 0 ? team.wins / totalGames : 0.5;
  const isDesperate =
    winPct < 0.30 ||
    personality === 'Rebuilder' ||
    needs.filter(n => n.urgency === 'Critical').length >= 2;

  // Scouting noise on potential
  const scoredProspects = availableProspects.map(p => {
    const noisePot = scoutingAdjustedRating(p as unknown as Player, ratings.scouting, difficulty);
    const noiseOvr = scoutingAdjustedRating(p as unknown as Player, ratings.scouting, difficulty);
    const fit = prospectNeedFit(p, needs);
    const fitBonus = fit === 'Strong Fit' ? 8 : fit === 'Good Fit' ? 4 : 0;
    return { p, adjustedPot: noisePot, adjustedOvr: noiseOvr, fit, fitBonus };
  });

  let sorted: typeof scoredProspects;

  switch (personality) {
    case 'Rebuilder':
      // Pure potential — ignores needs entirely (full rebuild mode)
      sorted = [...scoredProspects].sort((a, b) => b.adjustedPot - a.adjustedPot);
      break;
    case 'Win Now':
      // OVR + need fit (want contributors right away)
      sorted = [...scoredProspects].sort((a, b) =>
        (b.adjustedOvr + b.fitBonus) - (a.adjustedOvr + a.fitBonus)
      );
      break;
    case 'Analytics': {
      // Scout grade + potential + modest need bonus
      sorted = [...scoredProspects].sort((a, b) => {
        const scoreA = a.p.scoutGrade * 0.5 + a.adjustedPot * 0.35 + a.fitBonus;
        const scoreB = b.p.scoutGrade * 0.5 + b.adjustedPot * 0.35 + b.fitBonus;
        return scoreB - scoreA;
      });
      break;
    }
    case 'Superstar Chaser':
      // Reach for stars regardless of need
      sorted = [...scoredProspects].sort((a, b) => {
        const potBonus = a.adjustedPot >= 85 ? 15 : 0;
        const potBonusB = b.adjustedPot >= 85 ? 15 : 0;
        return (b.adjustedOvr + potBonusB) - (a.adjustedOvr + potBonus);
      });
      break;
    case 'Loyalist': {
      const needed = mostNeededPosition(team);
      sorted = [...scoredProspects].sort((a, b) => {
        const aNeed = a.p.position === needed ? 10 : 0;
        const bNeed = b.p.position === needed ? 10 : 0;
        return (b.adjustedPot + bNeed) - (a.adjustedPot + aNeed);
      });
      break;
    }
    default:
      if (isDesperate) {
        // Desperate teams go pure BPA — too many holes to be selective
        sorted = [...scoredProspects].sort((a, b) =>
          (b.adjustedOvr * 0.5 + b.adjustedPot * 0.5) - (a.adjustedOvr * 0.5 + a.adjustedPot * 0.5)
        );
      } else {
        // Balanced: BPA weighted with a need-fit bonus
        sorted = [...scoredProspects].sort((a, b) =>
          (b.adjustedOvr * 0.4 + b.adjustedPot * 0.4 + b.fitBonus * 1.5) -
          (a.adjustedOvr * 0.4 + a.adjustedPot * 0.4 + a.fitBonus * 1.5)
        );
      }
  }

  // Need-first pass: if a top-tier prospect fills a priority need, prefer them
  // over the raw BPA (unless team is rebuilding / desperate).
  if (!isDesperate && personality !== 'Rebuilder' && needs.length > 0) {
    const bestBpaScore = (sorted[0]?.adjustedOvr ?? 0) * 0.5 + (sorted[0]?.adjustedPot ?? 0) * 0.5;
    const reachAllowance = 0.90; // can reach within 10% of top BPA
    const topTier = scoredProspects.filter(sp => {
      const score = sp.adjustedOvr * 0.5 + sp.adjustedPot * 0.5;
      return score >= bestBpaScore * reachAllowance;
    });
    const needMatch = topTier.find(sp => sp.fit === 'Strong Fit' || sp.fit === 'Good Fit');
    if (needMatch) {
      // Easy/Rookie difficulty: sometimes miss the value anyway
      if (!((difficulty === 'Easy' || difficulty === 'Rookie') && Math.random() < 0.30)) {
        return needMatch.p;
      }
    }
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
  totalTeams: number,
  tradeDifficulty?: string,
  currentSeason?: number,
): boolean {
  const valueOf = (pkg: TradePackage) => {
    const pVal = pkg.players.reduce((s, p) => s + playerTradeValue(p, personality), 0);
    const dVal = pkg.picks.reduce((s, pick) => s + draftPickValue(pick, personality, totalTeams, currentSeason), 0);
    return pVal + dVal;
  };

  const recVal = valueOf(receiving);
  const senVal = valueOf(sending);

  // Superstar Chaser: accept bad value for OVR 90+
  if (personality === 'Superstar Chaser') {
    const hasStar = receiving.players.some(p => p.rating >= 90);
    if (hasStar) return true;
  }

  // Fairness threshold scales with trade difficulty setting
  const thresholdMap: Record<string, number> = {
    Arcade:     0.70,  // almost anything goes
    Easy:       0.80,
    Realistic:  0.90,  // default NBA-like
    Hard:       0.96,
    Simulation: 1.00,  // must receive equal value
  };
  const threshold = thresholdMap[tradeDifficulty ?? 'Realistic'] ?? 0.90;

  return recVal >= senVal * threshold;
}

// ─── Deadline logic (mid-season) ────────────────────────────
export function aiGMTradeDeadlineAction(
  state: LeagueState
): { newsItems: NewsItem[]; updatedState: LeagueState } {
  const newsItems: NewsItem[] = [];
  const transactions: Transaction[] = [];
  let s = { ...state, teams: [...state.teams] };

  const aiTeams = s.teams.filter(t => t.id !== s.userTeamId && !!t.aiGM);
  const tradedTeams = new Set<string>();

  // Identify rebuilders (sellers) and contenders (buyers)
  const rebuilders = aiTeams.filter(t => {
    const gab = t.wins - t.losses;
    return (t.aiGM!.personality === 'Rebuilder' || gab <= -5) && t.wins + t.losses >= 20;
  });
  const contenders = aiTeams.filter(t => {
    const gab = t.wins - t.losses;
    return (t.aiGM!.personality === 'Win Now' || t.aiGM!.personality === 'Superstar Chaser' || gab >= 5) && t.wins + t.losses >= 20;
  });

  // Shuffled for variety
  const shuffledRebuilders = [...rebuilders].sort(() => Math.random() - 0.5);
  const shuffledContenders = [...contenders].sort(() => Math.random() - 0.5);

  let tradesExecuted = 0;
  const maxDeadlineTrades = 3;

  for (const rebuilder of shuffledRebuilders) {
    if (tradesExecuted >= maxDeadlineTrades) break;
    if (tradedTeams.has(rebuilder.id)) continue;

    const rebuilderData = s.teams.find(t => t.id === rebuilder.id)!;
    // Find a veteran to move — older, expiring, good enough to interest contenders
    const vetCandidates = rebuilderData.roster
      .filter(p => p.age >= 28 && p.rating >= 75 && p.contractYears <= 2)
      .sort((a, b) => b.rating - a.rating);
    if (vetCandidates.length === 0) continue;
    const vet = vetCandidates[0];

    let dealMade = false;
    for (const contender of shuffledContenders) {
      if (dealMade || tradedTeams.has(contender.id)) continue;
      const contenderData = s.teams.find(t => t.id === contender.id)!;

      // Contender offers a first-round pick (current-year OR future) + possibly a young player
      const futurePick = contenderData.picks.find(p =>
        p.round === 1 && p.currentTeamId === contenderData.id &&
        (p.year === undefined || p.year >= s.season)
      );

      // Try pick + young player deal first
      const youngAssets = contenderData.roster
        .filter(p => p.age <= 25 && p.rating >= 65 && p.rating <= vet.rating + 5)
        .sort((a, b) => a.salary - b.salary);

      if (futurePick && youngAssets.length > 0) {
        const youngPlayer = youngAssets[0];
        const rebuilderGets: TradePackage = { players: [youngPlayer], picks: [futurePick] };
        const rebuilderSends: TradePackage = { players: [vet], picks: [] };
        const contenderGets: TradePackage = { players: [vet], picks: [] };
        const contenderSends: TradePackage = { players: [youngPlayer], picks: [futurePick] };

        if (
          evaluateTrade(rebuilderGets, rebuilderSends, rebuilder.aiGM!.personality, s.teams.length, s.settings?.tradeDifficulty, s.season) &&
          evaluateTrade(contenderGets, contenderSends, contender.aiGM!.personality, s.teams.length, s.settings?.tradeDifficulty, s.season)
        ) {
          const snappedVet = snapshotPlayerStats(vet, rebuilderData.id, rebuilderData.name, rebuilderData.abbreviation, s.season, true);
          const snappedYoung = snapshotPlayerStats(youngPlayer, contenderData.id, contenderData.name, contenderData.abbreviation, s.season, true);
          s = {
            ...s,
            teams: s.teams.map(t => {
              if (t.id === rebuilderData.id) return {
                ...t,
                roster: [...t.roster.filter(p => p.id !== vet.id), { ...snappedYoung, lastTeamId: contenderData.id }],
                picks: [...t.picks, { ...futurePick, currentTeamId: t.id }],
              };
              if (t.id === contenderData.id) return {
                ...t,
                roster: [...t.roster.filter(p => p.id !== youngPlayer.id), { ...snappedVet, lastTeamId: rebuilderData.id }],
                picks: t.picks.filter(p => !(p.round === futurePick.round && p.year === futurePick.year && p.originalTeamId === futurePick.originalTeamId)),
              };
              return t;
            }),
          };
          tradedTeams.add(rebuilder.id);
          tradedTeams.add(contender.id);
          tradesExecuted++;
          dealMade = true;
          const yearStr = futurePick.year ? (futurePick.year === s.season ? `${futurePick.year} (this year's pick)` : `${futurePick.year}`) : 'current-year';
          newsItems.push(makeNewsItem(
            'trade',
            `DEADLINE TRADE: ${vet.name} → ${contenderData.abbreviation}`,
            (() => {
              const templates = [
                `DEADLINE: ${contenderData.name} land ${vet.name} from ${rebuilderData.name} in exchange for ${youngPlayer.name} and a ${yearStr} first-round pick. A bold move for a title push.`,
                `${rebuilderData.name} trade ${vet.name} to ${contenderData.name} for ${youngPlayer.name} and a ${yearStr} 1st. ${rebuilderData.name} collect assets; ${contenderData.name} go all in.`,
                `${vet.name} is headed to ${contenderData.name}. The package back to ${rebuilderData.name}: ${youngPlayer.name} plus a ${yearStr} lottery pick. Both sides believe they won.`,
              ];
              return templates[Math.floor(Math.random() * templates.length)];
            })(),
            s.currentDay, rebuilderData.id, vet.id, true
          ));
          transactions.push(makeTransaction(
            s, 'trade', [rebuilderData.id, contenderData.id],
            `DEADLINE: ${rebuilderData.name} trades ${vet.name} to ${contenderData.name} for ${youngPlayer.name} + ${yearStr} 1st.`,
            [vet.id, youngPlayer.id]
          ));
          continue;
        }
      }

      // Try pure pick-for-vet deal
      if (futurePick && !dealMade) {
        const rebuilderGets: TradePackage = { players: [], picks: [futurePick] };
        const rebuilderSends: TradePackage = { players: [vet], picks: [] };
        const contenderGets: TradePackage = { players: [vet], picks: [] };
        const contenderSends: TradePackage = { players: [], picks: [futurePick] };

        if (
          evaluateTrade(rebuilderGets, rebuilderSends, rebuilder.aiGM!.personality, s.teams.length, s.settings?.tradeDifficulty, s.season) &&
          evaluateTrade(contenderGets, contenderSends, contender.aiGM!.personality, s.teams.length, s.settings?.tradeDifficulty, s.season)
        ) {
          const snappedVet = snapshotPlayerStats(vet, rebuilderData.id, rebuilderData.name, rebuilderData.abbreviation, s.season, true);
          s = {
            ...s,
            teams: s.teams.map(t => {
              if (t.id === rebuilderData.id) return {
                ...t,
                roster: t.roster.filter(p => p.id !== vet.id),
                picks: [...t.picks, { ...futurePick, currentTeamId: t.id }],
              };
              if (t.id === contenderData.id) return {
                ...t,
                roster: [...t.roster, { ...snappedVet, lastTeamId: rebuilderData.id }],
                picks: t.picks.filter(p => !(p.round === futurePick.round && p.year === futurePick.year && p.originalTeamId === futurePick.originalTeamId)),
              };
              return t;
            }),
          };
          tradedTeams.add(rebuilder.id);
          tradedTeams.add(contender.id);
          tradesExecuted++;
          dealMade = true;
          const yearStr = futurePick.year ? (futurePick.year === s.season ? `${futurePick.year} (this year's pick)` : `${futurePick.year}`) : 'current-year';
          newsItems.push(makeNewsItem(
            'trade',
            `DEADLINE TRADE: ${vet.name} → ${contenderData.abbreviation}`,
            (() => {
              const templates = [
                `DEADLINE: ${contenderData.name} acquire ${vet.name} from ${rebuilderData.name} for a ${yearStr} first-round pick. A pure rental trade — ${contenderData.name} bet on themselves.`,
                `${rebuilderData.name} flip ${vet.name} to ${contenderData.name} for a ${yearStr} 1st. A clean, straightforward deal as the deadline buzzer sounds.`,
                `${vet.name} heads to ${contenderData.name} at the deadline. The price: a ${yearStr} first-rounder. ${rebuilderData.name} continue stacking future assets.`,
              ];
              return templates[Math.floor(Math.random() * templates.length)];
            })(),
            s.currentDay, rebuilderData.id, vet.id, true
          ));
          transactions.push(makeTransaction(
            s, 'trade', [rebuilderData.id, contenderData.id],
            `DEADLINE: ${rebuilderData.name} trades ${vet.name} to ${contenderData.name} for a ${yearStr} first-round pick.`,
            [vet.id]
          ));
        }
      }
    }
  }

  // Add flavor news for teams that didn't land a trade
  for (const t of aiTeams) {
    if (tradedTeams.has(t.id)) continue;
    const { personality } = t.aiGM!;
    const gab = t.wins - t.losses;
    if (personality === 'Rebuilder' && gab <= -5) {
      const veterans = t.roster.filter(p => p.age >= 30 && p.rating >= 75 && p.contractYears <= 2);
      if (veterans.length > 0) {
        newsItems.push(makeNewsItem(
          'signing',
          `${t.abbreviation} TRADE DEADLINE`,
          `${t.name} explored deals for ${veterans[0].name} but couldn't find the right return.`,
          s.currentDay, t.id, veterans[0].id, false
        ));
      }
    }
    if ((personality === 'Win Now' || personality === 'Superstar Chaser') && gab >= 5 && Math.random() < 0.5) {
      newsItems.push(makeNewsItem(
        'trade_request',
        `${t.abbreviation} BUYING AT DEADLINE`,
        `${t.name} were aggressive buyers at the deadline, seeking upgrades for a title push.`,
        s.currentDay, t.id, undefined, false
      ));
    }
  }

  return { newsItems, updatedState: s };
}

// ─── In-season AI-vs-AI trades ──────────────────────────────
/**
 * Runs ~weekly during the regular season. Each AI team has a personality-
 * based probability of initiating a trade. Contenders buy; rebuilders sell.
 * Only AI-vs-AI trades are generated (no user team involvement).
 */
export function aiGMInSeasonTrades(
  state: LeagueState,
  difficulty: string
): { updatedState: LeagueState; newsItems: NewsItem[]; transactions: Transaction[] } {
  const newsItems: NewsItem[] = [];
  const transactions: Transaction[] = [];
  let s = { ...state, teams: [...state.teams] };

  const aiTeams = s.teams.filter(t => t.id !== s.userTeamId && !!t.aiGM);
  const totalPlayed = aiTeams.reduce((max, t) => Math.max(max, t.wins + t.losses), 0);

  // Don't trade until at least 10 games into the season
  if (totalPlayed < 10) return { updatedState: s, newsItems, transactions };

  const tradedTeams = new Set<string>();
  // Shuffle so different teams initiate each cycle
  const shuffled = [...aiTeams].sort(() => Math.random() - 0.5);

  const diffLevel = normalizeDifficulty(difficulty);
  // Higher difficulty = more trades per cycle
  const maxTradesPerCycle = diffLevel >= 3 ? 3 : diffLevel === 2 ? 2 : 1;
  let tradesThisCycle = 0;

  for (const team of shuffled) {
    if (tradedTeams.has(team.id) || tradesThisCycle >= maxTradesPerCycle) break;

    const { personality } = team.aiGM!;
    const gamesAbove = team.wins - team.losses;
    const isRebuilding = gamesAbove <= -3 || personality === 'Rebuilder';
    const isContending = gamesAbove >= 3 || personality === 'Win Now' || personality === 'Superstar Chaser';

    // Per-personality activity chance
    const actChance =
      personality === 'Rebuilder'        ? (gamesAbove <= -5 ? 0.40 : 0.20) :
      personality === 'Win Now'          ? (gamesAbove >= 5  ? 0.38 : 0.18) :
      personality === 'Superstar Chaser' ? 0.30 :
      personality === 'Analytics'        ? 0.22 :
      personality === 'Balanced'         ? 0.14 :
      0.08; // Loyalist

    if (Math.random() > actChance) continue;

    // ── REBUILDER: dump veteran for young asset ──────────────
    if (isRebuilding && !isContending) {
      const vetCandidates = s.teams.find(t => t.id === team.id)!.roster
        .filter(p => p.age >= 29 && p.rating >= 72 && p.contractYears <= 2)
        .sort((a, b) => b.rating - a.rating);
      if (vetCandidates.length === 0) continue;
      const vet = vetCandidates[0];

      // Find a contending buyer
      const buyers = shuffled.filter(t =>
        t.id !== team.id && !tradedTeams.has(t.id) &&
        (t.wins - t.losses) >= 3
      );
      if (buyers.length === 0) continue;
      const buyer = buyers[Math.floor(Math.random() * buyers.length)];
      const buyerData = s.teams.find(t => t.id === buyer.id)!;

      // Buyer offers back a young, affordable player
      const returnCandidates = buyerData.roster
        .filter(p => p.age <= 26 && p.rating >= 65 && p.rating <= vet.rating + 4)
        .sort((a, b) => a.salary - b.salary);
      if (returnCandidates.length === 0) continue;
      const returnPlayer = returnCandidates[0];

      const rebuilderGets: TradePackage = { players: [returnPlayer], picks: [] };
      const rebuilderSends: TradePackage = { players: [vet], picks: [] };
      const buyerGets: TradePackage = { players: [vet], picks: [] };
      const buyerSends: TradePackage = { players: [returnPlayer], picks: [] };

      if (
        evaluateTrade(rebuilderGets, rebuilderSends, personality, s.teams.length, s.settings?.tradeDifficulty) &&
        evaluateTrade(buyerGets, buyerSends, buyer.aiGM!.personality, s.teams.length, s.settings?.tradeDifficulty)
      ) {
        const rebuilderTeam = s.teams.find(t => t.id === team.id)!;
        const buyerTeam = s.teams.find(t => t.id === buyer.id)!;
        const snappedVet = snapshotPlayerStats(vet, rebuilderTeam.id, rebuilderTeam.name, rebuilderTeam.abbreviation, s.season, true);
        const snappedReturn = snapshotPlayerStats(returnPlayer, buyerTeam.id, buyerTeam.name, buyerTeam.abbreviation, s.season, true);
        s = {
          ...s,
          teams: s.teams.map(t => {
            if (t.id === rebuilderTeam.id) return { ...t, roster: [...t.roster.filter(p => p.id !== vet.id), { ...snappedReturn, lastTeamId: buyerTeam.id }] };
            if (t.id === buyerTeam.id) return { ...t, roster: [...t.roster.filter(p => p.id !== returnPlayer.id), { ...snappedVet, lastTeamId: rebuilderTeam.id }] };
            return t;
          }),
        };
        tradedTeams.add(team.id);
        tradedTeams.add(buyer.id);
        tradesThisCycle++;

        newsItems.push(makeNewsItem(
          'trade',
          `TRADE: ${vet.name} → ${buyerTeam.abbreviation}`,
          `${buyerTeam.name} acquired ${vet.name} (${vet.position}, ${vet.rating} OVR) from ${rebuilderTeam.name} in exchange for ${returnPlayer.name}.`,
          s.currentDay, rebuilderTeam.id, vet.id, false
        ));
        transactions.push(makeTransaction(
          s, 'trade', [rebuilderTeam.id, buyerTeam.id],
          `TRADE: ${rebuilderTeam.name} sends ${vet.name} to ${buyerTeam.name} for ${returnPlayer.name}.`,
          [vet.id, returnPlayer.id]
        ));
      }
    }

    // ── CONTENDER: acquire help at position of need ──────────
    else if (isContending && !isRebuilding) {
      const contenderData = s.teams.find(t => t.id === team.id)!;
      const neededPos = mostNeededPosition(contenderData);

      // Find a non-contender with a good player at that position
      const sellers = shuffled.filter(t =>
        t.id !== team.id && !tradedTeams.has(t.id) &&
        (t.wins - t.losses) <= 0
      );
      let foundSellerId: string | null = null;
      let targetPlayer: Player | null = null;

      for (const seller of sellers) {
        const sellerData = s.teams.find(t => t.id === seller.id)!;
        const candidate = sellerData.roster.find(p =>
          p.position === neededPos && p.rating >= 72 && p.age <= 34
        );
        if (candidate) { foundSellerId = seller.id; targetPlayer = candidate; break; }
      }
      if (!foundSellerId || !targetPlayer) continue;

      const sellerData = s.teams.find(t => t.id === foundSellerId!)!;
      // Contender sends back an affordable young asset
      const sendBack = contenderData.roster
        .filter(p => p.age <= 27 && p.rating >= 65 && p.rating <= targetPlayer!.rating + 5 && p.contractYears >= 1)
        .sort((a, b) => a.rating - b.rating);
      if (sendBack.length === 0) continue;
      const returnPlayer = sendBack[0];

      const sellerGets: TradePackage = { players: [returnPlayer], picks: [] };
      const sellerSends: TradePackage = { players: [targetPlayer!], picks: [] };
      const contenderGets: TradePackage = { players: [targetPlayer!], picks: [] };
      const contenderSends: TradePackage = { players: [returnPlayer], picks: [] };

      if (
        evaluateTrade(sellerGets, sellerSends, sellerData.aiGM?.personality ?? 'Balanced', s.teams.length, s.settings?.tradeDifficulty) &&
        evaluateTrade(contenderGets, contenderSends, personality, s.teams.length, s.settings?.tradeDifficulty)
      ) {
        const snappedTarget = snapshotPlayerStats(targetPlayer!, sellerData.id, sellerData.name, sellerData.abbreviation, s.season, true);
        const snappedReturnP = snapshotPlayerStats(returnPlayer, contenderData.id, contenderData.name, contenderData.abbreviation, s.season, true);
        s = {
          ...s,
          teams: s.teams.map(t => {
            if (t.id === foundSellerId) return { ...t, roster: [...t.roster.filter(p => p.id !== targetPlayer!.id), { ...snappedReturnP, lastTeamId: contenderData.id }] };
            if (t.id === team.id) return { ...t, roster: [...t.roster.filter(p => p.id !== returnPlayer.id), { ...snappedTarget, lastTeamId: sellerData.id }] };
            return t;
          }),
        };
        tradedTeams.add(team.id);
        tradedTeams.add(foundSellerId);
        tradesThisCycle++;

        newsItems.push(makeNewsItem(
          'trade',
          `TRADE: ${targetPlayer.name} → ${contenderData.abbreviation}`,
          `${contenderData.name} acquired ${targetPlayer.name} (${targetPlayer.position}, ${targetPlayer.rating} OVR) from ${sellerData.name} for ${returnPlayer.name}.`,
          s.currentDay, team.id, targetPlayer.id, false
        ));
        transactions.push(makeTransaction(
          s, 'trade', [team.id, foundSellerId],
          `TRADE: ${contenderData.name} acquires ${targetPlayer.name} from ${sellerData.name} for ${returnPlayer.name}.`,
          [targetPlayer.id, returnPlayer.id]
        ));
      }
    }
  }

  // ── PICK-CENTRIC TRADES: Rebuilder sells veteran for future first ────────────
  for (const team of shuffled) {
    if (tradedTeams.has(team.id) || tradesThisCycle >= maxTradesPerCycle) break;
    const { personality } = team.aiGM!;
    const gamesAbove = team.wins - team.losses;
    const isRebuilding = gamesAbove <= -3 || personality === 'Rebuilder';
    if (!isRebuilding) continue;
    if (Math.random() > 0.28) continue; // ~28% chance per cycle

    const teamData = s.teams.find(t => t.id === team.id)!;
    const vetCandidates = teamData.roster
      .filter(p => p.age >= 29 && p.rating >= 74 && p.contractYears <= 2)
      .sort((a, b) => b.rating - a.rating);
    if (vetCandidates.length === 0) continue;
    const vet = vetCandidates[0];

    // Find a contending team that owns a future first-round pick
    const contenders = shuffled.filter(t =>
      t.id !== team.id && !tradedTeams.has(t.id) && (t.wins - t.losses) >= 3
    );
    let dealMade = false;
    for (const contender of contenders) {
      if (dealMade) break;
      const contenderData = s.teams.find(t => t.id === contender.id)!;
      // Include current-year picks (year === s.season) — contenders often trade them for vets
      const futurePick = contenderData.picks.find(p =>
        p.round === 1 && p.currentTeamId === contenderData.id &&
        (p.year === undefined || p.year >= s.season)
      );
      if (!futurePick) continue;

      const rebuilderGets: TradePackage = { players: [], picks: [futurePick] };
      const rebuilderSends: TradePackage = { players: [vet], picks: [] };
      const contenderGets: TradePackage = { players: [vet], picks: [] };
      const contenderSends: TradePackage = { players: [], picks: [futurePick] };

      if (
        evaluateTrade(rebuilderGets, rebuilderSends, personality, s.teams.length, s.settings?.tradeDifficulty, s.season) &&
        evaluateTrade(contenderGets, contenderSends, contender.aiGM!.personality, s.teams.length, s.settings?.tradeDifficulty, s.season)
      ) {
        const snappedVet = snapshotPlayerStats(vet, teamData.id, teamData.name, teamData.abbreviation, s.season, true);
        s = {
          ...s,
          teams: s.teams.map(t => {
            if (t.id === teamData.id) return {
              ...t,
              roster: t.roster.filter(p => p.id !== vet.id),
              picks: [...t.picks, { ...futurePick, currentTeamId: t.id }],
            };
            if (t.id === contenderData.id) return {
              ...t,
              roster: [...t.roster, { ...snappedVet, lastTeamId: teamData.id }],
              picks: t.picks.filter(p => !(p.round === futurePick.round && p.year === futurePick.year && p.originalTeamId === futurePick.originalTeamId)),
            };
            return t;
          }),
        };
        tradedTeams.add(team.id);
        tradedTeams.add(contender.id);
        tradesThisCycle++;
        dealMade = true;

        const yearStr = futurePick.year ? `${futurePick.year}` : 'future';
        newsItems.push(makeNewsItem(
          'trade',
          `TRADE: ${vet.name} → ${contenderData.abbreviation}`,
          `${contenderData.name} acquired ${vet.name} (${vet.position}, ${vet.rating} OVR) from ${teamData.name} in exchange for a ${yearStr} 1st-round pick.`,
          s.currentDay, teamData.id, vet.id, true
        ));
        transactions.push(makeTransaction(
          s, 'trade', [teamData.id, contenderData.id],
          `TRADE: ${teamData.name} sends ${vet.name} to ${contenderData.name} for a ${yearStr} first-round pick.`,
          [vet.id]
        ));
      }
    }
  }

  return { updatedState: s, newsItems, transactions };
}

// ─── Pre-offseason agreements (moratorium window) ────────────
/**
 * Fires at offseasonDay=0. AI GMs make preliminary FA agreements
 * announced as "agrees to terms" — flavor of real NBA July 1 activity.
 * Only a few early signings; main FA logic stays in runAIGMOffseason.
 */
export function aiGMPreOffseasonAgreements(
  state: LeagueState,
  difficulty: string
): { updatedState: LeagueState; newsItems: NewsItem[]; transactions: Transaction[] } {
  const newsItems: NewsItem[] = [];
  const transactions: Transaction[] = [];
  let s = { ...state };

  // Pre-offseason agreements only happen after the draft is complete
  if (s.draftPhase !== 'completed') return { updatedState: s, newsItems, transactions };
  if (!s.freeAgents || s.freeAgents.length === 0) return { updatedState: s, newsItems, transactions };

  const cap = s.settings.salaryCap || 140_000_000;
  const diffLevel = normalizeDifficulty(difficulty);
  // Higher difficulty = more pre-offseason activity
  const maxSignings = diffLevel >= 3 ? 4 : 2;

  const aiTeams = s.teams
    .filter(t => t.id !== s.userTeamId && !!t.aiGM)
    .sort(() => Math.random() - 0.5);

  let totalSigned = 0;
  let updatedFAs = [...s.freeAgents].sort((a, b) => b.rating - a.rating);

  for (const team of aiTeams) {
    if (totalSigned >= maxSignings || updatedFAs.length === 0) break;
    // Only contenders / Win Now sign early (urgency)
    const { personality } = team.aiGM!;
    const isEagerSigner =
      personality === 'Win Now' ||
      personality === 'Superstar Chaser' ||
      (personality === 'Analytics' && Math.random() < 0.5);
    if (!isEagerSigner) continue;

    const teamSalary = team.roster.reduce((s, p) => s + (p.salary || 0), 0);
    const teamCap = cap - teamSalary;
    if (teamCap < 1_000_000) continue;

    // Find best affordable FA
    const faIdx = updatedFAs.findIndex(fa =>
      (fa.desiredContract?.salary ?? 3_000_000) <= teamCap * 0.9
    );
    if (faIdx === -1) continue;
    const [fa] = updatedFAs.splice(faIdx, 1);

    const desired = fa.desiredContract?.salary ?? 5_000_000;
    const offerSalary = Math.round(Math.min(teamCap * 0.8, desired * (0.90 + Math.random() * 0.15)) / 250_000) * 250_000;
    const maxYrs = state.settings.maxContractYears ?? 5;
    const offerYears = Math.min(personality === 'Win Now' ? 3 : 2, maxYrs);

    const signedPlayer: Player = {
      ...fa,
      isFreeAgent: false,
      salary: offerSalary,
      contractYears: offerYears,
      lastTeamId: fa.lastTeamId,
    };
    s = {
      ...s,
      teams: s.teams.map(t =>
        t.id === team.id ? { ...t, roster: [...t.roster, signedPlayer] } : t
      ),
    };
    totalSigned++;

    newsItems.push(makeNewsItem(
      'transaction',
      `${fa.name} agrees to terms with ${team.name}`,
      `${team.name} have agreed to terms with ${fa.name} (${fa.position}, ${fa.rating} OVR) on a ${offerYears}-year deal worth ${(offerSalary / 1_000_000).toFixed(1)}M/yr — pending moratorium.`,
      s.currentDay, team.id, fa.id, false
    ));
    transactions.push(makeTransaction(
      s, 'signing', [team.id],
      `${team.name} agrees to terms with ${fa.name} — deal pending moratorium.`,
      [fa.id]
    ));
  }

  s = { ...s, freeAgents: updatedFAs };
  return { updatedState: s, newsItems, transactions };
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

// ─── AI-to-User Trade Proposal Generator ──────────────────────────────────────
/**
 * Generates plausible incoming trade proposals from AI GMs directed at the user.
 * Called periodically (~every 7 sim days). Returns new proposals to append to
 * state.incomingTradeProposals. Ensures salary matching and mutual fairness.
 */
export function generateAITradeProposalsForUser(
  state: LeagueState,
  difficulty: string
): TradeProposal[] {
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  if (!userTeam) return [];

  // Only valid during regular season, before the trade deadline, and outside playoffs
  if (state.isOffseason) return [];
  if (state.tradeDeadlinePassed) return [];
  if (state.playoffBracket) return [];
  const userGamesPlayed = userTeam.wins + userTeam.losses;
  if (userGamesPlayed < 5) return [];

  // Don't flood — stop generating if 4+ pending proposals already exist
  const pending = (state.incomingTradeProposals ?? []).filter(p => p.status === 'incoming');
  if (pending.length >= 4) return [];

  // ── Situational multipliers ────────────────────────────────────────────────
  const seasonLength = state.settings.seasonLength ?? 82;
  // Mid-season: games 20–60 are the hot trade window
  const isMidSeason = userGamesPlayed >= 20 && userGamesPlayed <= 60;
  // Near deadline: last ~15% of games before cutoff — build tension, fewer proposals
  const nearDeadline = userGamesPlayed >= seasonLength * 0.60;
  // User is a clear buyer (hot streak) or seller (cold streak)
  const userGab = userTeam.wins - userTeam.losses;
  const userIsBuyer  = userGab >= 6;
  const userIsSeller = userGab <= -6;

  const alreadyPendingTeamIds = new Set(pending.map(p => p.partnerTeamId));
  const aiTeams = state.teams.filter(t => t.id !== state.userTeamId && !!t.aiGM);
  // Sample up to 8 teams per call (was 5) for more chances
  const shuffled = [...aiTeams].sort(() => Math.random() - 0.5).slice(0, 8);
  const proposals: TradeProposal[] = [];

  for (const aiTeam of shuffled) {
    if (proposals.length >= 3) break;  // up to 3 per call (was 2)
    if (alreadyPendingTeamIds.has(aiTeam.id)) continue;

    const { personality } = aiTeam.aiGM!;
    const gab = aiTeam.wins - aiTeam.losses;
    const isContending = gab >= 3 || personality === 'Win Now' || personality === 'Superstar Chaser';
    const isRebuilding = gab <= -3 || personality === 'Rebuilder';

    // ── Base activity chance — higher than before ─────────────────────────
    let propChance =
      personality === 'Win Now'          ? 0.68 :
      personality === 'Superstar Chaser' ? 0.62 :
      personality === 'Rebuilder'        ? 0.55 :
      personality === 'Analytics'        ? 0.45 :
      personality === 'Balanced'         ? 0.38 :
      0.25; // Loyalist

    // ── Situational multipliers ───────────────────────────────────────────
    if (isMidSeason)  propChance *= 1.40; // peak trade window
    if (nearDeadline) propChance *= 0.45; // tension before deadline, fewer but more meaningful
    if (Math.abs(gab) >= 5) propChance *= 1.25; // AI team is a clear buyer/seller
    if (userIsBuyer  && isRebuilding)  propChance *= 1.30; // seller targets hot-streak buyer
    if (userIsSeller && isContending)  propChance *= 1.30; // buyer targets struggling team's assets

    // Needs-matching bonus: AI wants what user has
    const neededPos = mostNeededPosition(aiTeam);
    const userHasFit = userTeam.roster.some(p => p.position === neededPos && p.rating >= 72);
    if (userHasFit) propChance *= 1.25;

    propChance = Math.min(propChance, 0.90); // hard ceiling
    if (Math.random() > propChance) continue;

    let userPieces: TradePiece[] = [];   // what user must give
    let partnerPieces: TradePiece[] = []; // what AI offers

    if (isContending) {
      // ── Contender wants a user veteran or trade-block player ──────────────
      // Primary pool: players explicitly on the trade block
      const tradeBlockPool = userTeam.roster
        .filter(p => p.onTradeBlock && p.rating >= 68)
        .sort((a, b) => b.rating - a.rating);
      // Fallback pool: veterans with expiring/short deals
      const allVetTargets = userTeam.roster
        .filter(p => p.age >= 26 && p.rating >= 73 && p.contractYears <= 3)
        .sort((a, b) => b.rating - a.rating);
      const pool = tradeBlockPool.length > 0 ? tradeBlockPool : allVetTargets;
      if (pool.length === 0) continue;
      const target = pool[Math.floor(Math.random() * Math.min(3, pool.length))];

      const aiFirstPicks = aiTeam.picks.filter(p => p.round === 1).sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
      const aiYoung = aiTeam.roster
        .filter(p => p.age <= 25 && p.rating >= 66)
        .sort((a, b) => b.rating - a.rating);

      if (aiFirstPicks.length === 0 && aiYoung.length === 0) continue;

      userPieces = [{ type: 'player', data: target }];

      // Build offer: start with best pick
      if (aiFirstPicks.length >= 1) {
        partnerPieces.push({ type: 'pick', data: aiFirstPicks[0] });
      }
      // Add second pick if one pick isn't enough value
      if (aiFirstPicks.length >= 2 && target.rating >= 85) {
        partnerPieces.push({ type: 'pick', data: aiFirstPicks[1] });
      }
      // Add a young player for salary matching if needed
      const userOutSalary = target.salary;
      const aiOutSalary = partnerPieces.filter(p => p.type === 'player').reduce((s, p) => s + (p.data as Player).salary, 0);
      if (userOutSalary > 5_000_000 && aiOutSalary < userOutSalary * 0.5 && aiYoung.length > 0) {
        const salaryGap = userOutSalary - aiOutSalary;
        const matchPick = aiYoung.find(p => p.salary >= salaryGap * 0.3 && p.salary <= userOutSalary * 1.25 + 100_000);
        if (matchPick) partnerPieces.push({ type: 'player', data: matchPick });
      }

      if (partnerPieces.length === 0) continue;

    } else if (isRebuilding) {
      // ── Rebuilder wants user's picks or young talent, offers a veteran ──
      const aiVets = aiTeam.roster
        .filter(p => p.age >= 27 && p.rating >= 71 && p.contractYears <= 3)
        .sort((a, b) => b.rating - a.rating);
      if (aiVets.length === 0) continue;
      const vet = aiVets[0];

      partnerPieces = [{ type: 'player', data: vet }];

      const userFirst = userTeam.picks.filter(p => p.round === 1);
      const userYoung = userTeam.roster
        .filter(p => p.age <= 25 && p.rating >= 63)
        .sort((a, b) => b.rating - a.rating);

      if (userFirst.length > 0 && (Math.random() > 0.45 || userYoung.length === 0)) {
        userPieces = [{ type: 'pick', data: userFirst[0] }];
        // Add a cheap filler for salary matching
        const vetSalary = vet.salary;
        const fillerNeeded = vetSalary > 8_000_000;
        if (fillerNeeded && userYoung.length > 0) {
          const filler = userYoung.find(p => p.salary <= vetSalary * 0.80);
          if (filler) userPieces.push({ type: 'player', data: filler });
        }
      } else if (userYoung.length > 0) {
        const youngTarget = userYoung[Math.floor(Math.random() * Math.min(2, userYoung.length))];
        userPieces = [{ type: 'player', data: youngTarget }];
      }

      if (userPieces.length === 0) continue;

    } else {
      // ── Balanced / Analytics: need-based player swap ─────────────────────
      const posTargets = userTeam.roster
        .filter(p => p.position === neededPos && p.rating >= 70)
        .sort((a, b) => b.rating - a.rating);
      if (posTargets.length === 0) continue;
      const target = posTargets[0];

      const aiEquivalent = aiTeam.roster
        .filter(p => p.rating >= target.rating - 8 && p.rating <= target.rating + 4 && p.position !== neededPos)
        .sort((a, b) => Math.abs(a.rating - target.rating) - Math.abs(b.rating - target.rating));
      if (aiEquivalent.length === 0) continue;

      userPieces = [{ type: 'player', data: target }];
      partnerPieces = [{ type: 'player', data: aiEquivalent[0] }];
    }

    if (userPieces.length === 0 || partnerPieces.length === 0) continue;

    // ── Salary matching (125% rule) ────────────────────────────────────────
    const salaryCapType = state.settings.salaryCapType;
    if (salaryCapType === 'Hard Cap' || salaryCapType === 'Soft Cap') {
      const userOut = userPieces.filter(p => p.type === 'player').reduce((s, p) => s + (p.data as Player).salary, 0);
      const aiOut  = partnerPieces.filter(p => p.type === 'player').reduce((s, p) => s + (p.data as Player).salary, 0);
      if (userOut > 0 && aiOut > userOut * 1.25 + 100_000) continue;
      if (aiOut  > 0 && userOut > aiOut  * 1.25 + 100_000) continue;
    }

    // ── Fairness gates — both sides must accept ────────────────────────────
    const userReceiving: TradePackage = {
      players: partnerPieces.filter(p => p.type === 'player').map(p => p.data as Player),
      picks:   partnerPieces.filter(p => p.type === 'pick').map(p => p.data as DraftPick),
    };
    const userSending: TradePackage = {
      players: userPieces.filter(p => p.type === 'player').map(p => p.data as Player),
      picks:   userPieces.filter(p => p.type === 'pick').map(p => p.data as DraftPick),
    };

    // AI must genuinely want this trade
    if (!evaluateTrade(userSending, userReceiving, personality, state.teams.length, difficulty, state.season)) continue;
    // Proposal must not be exploitative of the user (no pure robbery)
    if (!evaluateTrade(userReceiving, userSending, 'Balanced', state.teams.length, 'Easy', state.season)) continue;

    proposals.push({
      id: `incoming-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      partnerTeamId: aiTeam.id,
      userPieces,
      partnerPieces,
      date: state.currentDay,
      status: 'incoming',
    });
  }

  return proposals;
}
