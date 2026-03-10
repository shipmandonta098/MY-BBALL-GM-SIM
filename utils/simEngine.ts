import { Team, GameResult, Player, GamePlayerLine, CoachScheme, PlayByPlayEvent, InjuryType, LeagueState, QuarterDetail } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE_PPP       = 1.12;
const SCORE_VARIANCE = 0.04;
const HOME_COURT_ADV = 0.025;  // +2.5% shooting efficiency for home team
const VISIT_TOV_PEN  = 0.008;  // road team slight TOV penalty

// ─── Pace / Possession Engine ─────────────────────────────────────────────────
/** Pace rating (60-100) → total possessions per 48 min (per team) */
const PACE_TABLE: Array<{ lo: number; hi: number; possLo: number; possHi: number }> = [
  { lo: 60, hi: 65,  possLo: 88,  possHi: 92  },  // very slow, grind it out
  { lo: 66, hi: 70,  possLo: 93,  possHi: 97  },  // slow, halfcourt heavy
  { lo: 71, hi: 75,  possLo: 98,  possHi: 102 },  // below average pace
  { lo: 76, hi: 80,  possLo: 103, possHi: 107 },  // average NBA pace
  { lo: 81, hi: 85,  possLo: 108, possHi: 112 },  // uptempo
  { lo: 86, hi: 90,  possLo: 113, possHi: 117 },  // very fast
  { lo: 91, hi: 100, possLo: 118, possHi: 125 },  // run and gun
];

/** Base scheme pace ratings. Used when team.paceRating is not set. */
const SCHEME_DEFAULT_PACE: Record<CoachScheme, number> = {
  'Balanced':       78,
  'Pace and Space': 87,
  'Grit and Grind': 64,
  'Triangle':       73,
  'Small Ball':     82,
  'Showtime':       91,
};

// ─── Attribute → Expected 3P% ─────────────────────────────────────────────────
/**
 * Maps a shooting3pt attribute (0–100) to an expected per-shot 3P% (decimal).
 *
 * Calibrated to NBA 2025-26 season: league average 3P% ≈ 35.8 % → attr 75.
 * Uses piecewise-linear segments so each tier is independently tunable.
 *
 * Expected output table:
 *   attr  │  3P%
 *   ──────┼──────
 *     0   │ 25.0 %   (big who never shoots)
 *    30   │ 28.6 %
 *    50   │ 30.9 %   (non-shooter)
 *    60   │ 32.0 %   (below avg)
 *    65   │ 33.4 %
 *    70   │ 34.7 %
 *    75   │ 35.8 %   ← league average
 *    80   │ 37.7 %   (solid starter)
 *    85   │ 39.5 %   (plus shooter)
 *    90   │ 41.0 %   (elite)
 *    94   │ 44.0 %   (elite ceiling)
 *    95   │ 44.0 %   (god-tier floor)
 *   100   │ 47.0 %   (historic peak, very rare)
 *
 * Tuning guide:
 *   - Raise/lower the segment endpoints (0.25, 0.32, 0.358, 0.41, 0.44, 0.47)
 *     to shift the whole curve or individual tiers.
 *   - Move the breakpoints (59, 74, 89, 94) to widen/narrow each band.
 *   - The hard clamp [0.20, 0.50] is a last-resort safety net; keep it wide.
 */
export function getThreePointPercentage(attr: number): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 59) {
    // Non-shooters / big men: 25 % at 0 → 32 % at 59
    base = 0.25 + (a / 59) * 0.07;
  } else if (a <= 74) {
    // Below-avg to league-avg: 32 % at 60 → 35.8 % at 74
    base = 0.32 + ((a - 60) / 14) * 0.038;
  } else if (a <= 89) {
    // Solid starter to plus shooter: 35.8 % at 75 → 41 % at 89
    base = 0.358 + ((a - 75) / 14) * 0.052;
  } else if (a <= 94) {
    // Elite: 41 % at 90 → 44 % at 94
    base = 0.41 + ((a - 90) / 4) * 0.03;
  } else {
    // God-tier: 44 % at 95 → 47 % at 100  (historically rare)
    base = 0.44 + ((a - 95) / 5) * 0.03;
  }

  return Math.max(0.20, Math.min(0.50, base));
}

// ─── 3PT Defensive Contest Modifier ──────────────────────────────────────────
/**
 * Maps a defender's perimeterDef attribute (0–100) to a per-possession
 * additive 3P% modifier, accounting for shot type difficulty.
 *
 * Design principles:
 *   • Average defender (attr ≈ 50) → 0 adjustment.
 *     `getThreePointPercentage` is already calibrated to "average game conditions,"
 *     so only above/below-average defenders shift the probability.
 *   • Asymmetric: elite defense suppresses more than poor defense rewards.
 *     Good defenders actively contest; bad ones just fail to — a shooter
 *     doesn't magically get better because the defender is lazy.
 *   • Pull-up 3s are self-created: harder to fully contest → smaller range.
 *   • TEAM_BOX_SCORE averages over many possessions → much smaller range.
 *
 * Output table (representative values):
 *   perimDef │  C&S mod  │  PU3 mod  │  Team mod
 *   ─────────┼───────────┼───────────┼──────────
 *     20     │  +2.5 %   │  +1.5 %   │  +1.2 %
 *     35     │  +1.5 %   │  +0.9 %   │  +0.7 %
 *     50     │   0.0 %   │   0.0 %   │   0.0 %
 *     65     │  -1.8 %   │  -1.2 %   │  -0.9 %
 *     75     │  -3.0 %   │  -2.0 %   │  -1.5 %
 *     85     │  -4.2 %   │  -2.8 %   │  -2.1 %
 *     95     │  -5.4 %   │  -3.6 %   │  -2.7 %
 *    100     │  -6.0 %   │  -4.0 %   │  -3.0 %
 *
 * Team-level impact (using TEAM_BOX_SCORE, avg of top-8 roster):
 *   avg perimDef 75 → ~ -1.5 %  (solid defensive team, realistic)
 *   avg perimDef 85 → ~ -2.1 %  (elite: top-5 defense, very good)
 *   avg perimDef 25 → ~ +0.7 %  (porous: extra open looks allowed)
 *
 * Tuning: adjust `down` / `up` values per context to widen or narrow the band.
 */
export type Shot3PTContext = 'PULL_UP_3' | 'CATCH_AND_SHOOT_3' | 'TEAM_BOX_SCORE';

export function get3PTContestMod(
  perimDefAttr: number,
  context: Shot3PTContext = 'CATCH_AND_SHOOT_3',
): number {
  const attr       = Math.max(0, Math.min(100, perimDefAttr));
  const normalized = (attr - 50) / 50; // -1 (worst) … 0 (avg) … +1 (best)

  // Per-context suppression/reward ceiling (tunable)
  const RANGES: Record<Shot3PTContext, { down: number; up: number }> = {
    CATCH_AND_SHOOT_3: { down: 0.060, up: 0.025 }, // closeout quality matters most
    PULL_UP_3:         { down: 0.040, up: 0.015 }, // self-created; harder to fully contest
    TEAM_BOX_SCORE:    { down: 0.030, up: 0.012 }, // per-game average over many possessions
  };

  const { down, up } = RANGES[context];
  // Elite defense (normalized > 0): linear penalty up to -down
  // Poor defense  (normalized < 0): linear reward up to +up (smaller)
  return normalized >= 0
    ? -normalized * down
    : -normalized * up;
}

// ─── Layup / At-Rim Finishing Percentage ─────────────────────────────────────
/**
 * Maps a player's Layups attribute (0–100) to an at-rim FG% with diminishing
 * returns at the top end, calibrated to real 2025-26 NBA at-rim data.
 *
 * Band targets (pre-positional adjustment):
 *   attr   0–50 →  45–55 %  (glass-jaw finisher, floater merchant, blocked often)
 *   attr  51–69 →  55–60 %  (below-avg, contests go badly)
 *   attr  70–79 →  60–65 %  (league avg; solid drives, good reads)
 *   attr  80–89 →  65–70 %  (plus finisher; draws fouls, tough contact)
 *   attr  90–94 →  70–74 %  (elite; near-unblockable, high success on drives)
 *   attr  95–100 → 74–78 %  (god-mode; Giannis/Shaq-tier, near-automatic)
 *
 * Positional adjustment (applied after piecewise):
 *   C / PF  → +2 %  (length, leverage, and proximity to the rim)
 *   PG / SG → -1 %  (face more help-side rim protection)
 *   SF      → no change
 *
 * Hard clamp: [0.43, 0.80] — prevents absurd extremes even after defense mods.
 *
 * Tuning: shift segment endpoints or `positionalTweak` to recalibrate the
 * league-wide sim average.  Target: ~63–65 % at-rim across all players.
 */
export function getLayupPercentage(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 50) {
    // Trash / non-finisher floor: 45 % at 0 → 55 % at 50
    base = 0.45 + (a / 50) * 0.10;
  } else if (a <= 69) {
    // Below-avg: 55 % at 51 → 60 % at 69  (slow ramp — most bad finishers bunch here)
    base = 0.55 + ((a - 50) / 19) * 0.05;
  } else if (a <= 79) {
    // League-avg: 60 % at 70 → 65 % at 79
    base = 0.60 + ((a - 70) / 9) * 0.05;
  } else if (a <= 89) {
    // Plus finisher: 65 % at 80 → 70 % at 89  (contact-seeker, elite burst)
    base = 0.65 + ((a - 80) / 9) * 0.05;
  } else if (a <= 94) {
    // Elite: 70 % at 90 → 74 % at 94  (diminishing returns kick in hard)
    base = 0.70 + ((a - 90) / 4) * 0.04;
  } else {
    // God-mode: 74 % at 95 → 78 % at 100  (Shaq/Giannis-tier — near automatic)
    base = 0.74 + ((a - 95) / 5) * 0.04;
  }

  // Positional adjustment — bigs have natural rim advantages; guards face more help-D
  const positionalTweak =
    position === 'C' || position === 'PF' ? +0.02 :
    position === 'PG' || position === 'SG' ? -0.01 :
    0; // SF neutral

  return Math.max(0.43, Math.min(0.80, base + positionalTweak));
}

// ─── Rim Protection Modifier ──────────────────────────────────────────────────
/**
 * Maps a defender's interiorDef attribute (0–100) to a per-possession
 * additive at-rim modifier, parallel in structure to get3PTContestMod.
 *
 * Calibrated to 2025-26 at-rim suppression data:
 *   • Average rim defender (attr ≈ 50) → 0 adjustment.
 *   • Elite rim protectors (Wembanyama, Gobert tier, attr 85–95):
 *       DRIVE_LAYUP  → −8 to −12 %  (individual possession — very punishing)
 *       TEAM_BOX_SCORE → −3 to −5 %  (team avg over full game)
 *   • Weak interior defense (attr ≤ 30):
 *       DRIVE_LAYUP  → +2 to +4 %  (highway to the rim)
 *       TEAM_BOX_SCORE → +1 to +2 %
 *
 * Note: this stacks with tendency modifiers (helpDefender, physicality) already
 * in simulatePossession.  Tendency = behavioral habit; attribute = physical
 * ceiling (timing, length, athleticism).
 *
 * Expected team-level outcomes (TEAM_BOX_SCORE):
 *   avg interiorDef 80 → ~−3.6 %  (solid shot-blocking team, e.g. ~61 % at rim)
 *   avg interiorDef 85 → ~−4.2 %  (elite: holds opp. to ~59–60 %)
 *   avg interiorDef 20 → ~+1.4 %  (porous: opponents feast, ~66–67 %)
 *
 * Tuning: increase DRIVE_LAYUP.down to make elite rim protectors more punishing
 * on individual drives; increase TEAM_BOX_SCORE.down to tighten league-wide D.
 */
export type RimContext = 'DRIVE_LAYUP' | 'POST_FADE' | 'TEAM_BOX_SCORE';

export function getRimProtectionMod(
  interiorDefAttr: number,
  context: RimContext = 'DRIVE_LAYUP',
): number {
  const attr       = Math.max(0, Math.min(100, interiorDefAttr));
  const normalized = (attr - 50) / 50; // −1 (worst) … 0 (avg) … +1 (best)

  // (down = how much elite D suppresses; up = how much poor D rewards shooter)
  const RANGES: Record<RimContext, { down: number; up: number }> = {
    DRIVE_LAYUP:    { down: 0.120, up: 0.040 }, // elite protector: up to −12 % per drive
    POST_FADE:      { down: 0.080, up: 0.025 }, // post-up: less direct rim contest
    TEAM_BOX_SCORE: { down: 0.060, up: 0.040 }, // team game average — larger up for porous Ds
  };

  const { down, up } = RANGES[context];
  return normalized >= 0
    ? -normalized * down   // elite rim D: 0 → −down
    : -normalized * up;    // poor rim D:  0 → +up
}

/** Look up total per-team possessions from a pace rating (adds random variance). */
const paceToTotalPossessions = (pace: number): number => {
  const tier = PACE_TABLE.find(t => pace >= t.lo && pace <= t.hi) ?? PACE_TABLE[3];
  return Math.round(tier.possLo + Math.random() * (tier.possHi - tier.possLo));
};

/**
 * Get a team's effective pace rating for a specific game.
 * Applies: coach badges, scheme default, B2B fatigue.
 * @param team         - the team whose pace we're computing
 * @param opponent     - opponent team (for Defensive Guru reduction)
 * @param scoreDiff    - running score diff; trailing team gets urgency boost
 * @param isGarbageTime - if true, both teams slow down
 * @param isB2B        - back-to-back reduces urgency slightly
 */
const getTeamEffectivePace = (
  team: Team,
  opponent: Team,
  scoreDiff = 0,       // positive = team is trailing by this much
  isGarbageTime = false,
  isB2B = false,
): number => {
  let pace = team.paceRating ?? SCHEME_DEFAULT_PACE[team.activeScheme] ?? 78;

  // Coach badge: Pace Master
  const hcBadges = (team.staff.headCoach?.badges as unknown as string[] | undefined) ?? [];
  if (hcBadges.includes('Pace Master')) pace += 8;

  // Opponent coach badge: Defensive Guru slows this team's pace
  const oppBadges = (opponent.staff.headCoach?.badges as unknown as string[] | undefined) ?? [];
  if (oppBadges.includes('Defensive Guru')) pace -= 5;

  // Trailing urgency (push tempo) / leading comfort (milk clock)
  if (scoreDiff >= 10)      pace += 6;   // trailing team — hurry up
  else if (scoreDiff <= -15) pace -= 8;  // leading team  — milk clock

  // Foul trouble (proxy: many low-rated bench players → more caution)
  const lowRatedBench = team.roster.slice(5, 10).filter(p => p.rating < 68).length;
  if (lowRatedBench >= 2) pace -= 4;

  // Garbage time: everyone slows down
  if (isGarbageTime) pace -= 15;

  // B2B: slight energy deficit
  if (isB2B) pace -= 2;

  return Math.max(60, Math.min(100, Math.round(pace)));
};

/** Expected quarter scoring bounds for a team given possessions and game pace. */
const getQuarterScoringBounds = (
  possessions: number,
  gamePace: number,
): { lo: number; hi: number } => {
  // Points = possessions × PPP; PPP varies by game tempo
  const basePPP = gamePace <= 70 ? 1.02 :
                  gamePace <= 80 ? 1.08 :
                  gamePace <= 90 ? 1.12 : 1.16;
  const expected  = possessions * basePPP;
  const variance  = possessions * 0.14;
  return { lo: Math.round(expected - variance), hi: Math.round(expected + variance) };
};

/** Aggregate shot-clock stats for a quarter (without generating full PBP). */
interface QuarterClockStats {
  avgClock: number;
  violations: number;
  fastBreaks: number;
  timeouts: number;
}

const simulateQuarterClock = (
  team: Team,
  scheme: CoachScheme,
  possessions: number,
  isGarbageTime: boolean,
): QuarterClockStats => {
  const rotation = team.rotation
    ? [...Object.values(team.rotation.starters), ...team.rotation.bench.slice(0, 4)]
        .map(id => team.roster.find(p => p.id === id))
        .filter(Boolean) as Player[]
    : team.roster.slice(0, 8);

  if (!rotation.length) return { avgClock: 14, violations: 0, fastBreaks: 0, timeouts: 0 };

  let totalClock = 0;
  let violations = 0;
  let fastBreaks = 0;
  let timeouts   = 0;
  let streak     = 0; // momentum streak → timeout trigger

  for (let i = 0; i < possessions; i++) {
    const handler = rotation[Math.floor(Math.random() * rotation.length)];
    const ot = handler.tendencies?.offensiveTendencies;

    // Dominant tendency
    const doms: [string, number][] = [
      ['isoHeavy',         ot?.isoHeavy         ?? 50],
      ['postUp',           ot?.postUp           ?? 50],
      ['transitionHunter', ot?.transitionHunter ?? 50],
      ['kickOutPasser',    ot?.kickOutPasser    ?? 50],
    ];
    const [dom] = doms.reduce((a, b) => b[1] > a[1] ? b : a);

    let lo: number, hi: number;
    let fbChance = 0.08;
    switch (dom) {
      case 'isoHeavy':         lo = 16; hi = 22; fbChance = 0.04; break;
      case 'postUp':           lo = 14; hi = 20; fbChance = 0.03; break;
      case 'transitionHunter': lo = 4;  hi = 10; fbChance = 0.42; break;
      case 'kickOutPasser':    lo = 12; hi = 18; fbChance = 0.12; break;
      default:                 lo = 12; hi = 18;
    }
    if (isGarbageTime) { lo += 4; hi += 4; fbChance *= 0.3; }

    const isFB = Math.random() < fbChance;
    if (isFB) { lo = 3; hi = 8; fastBreaks++; }

    const clockUsed = Math.min(24, lo + Math.random() * (hi - lo));
    totalClock += clockUsed;

    // Shot-clock violation
    let vChance = 0;
    if (clockUsed >= 22)   vChance = 0.06;
    if (clockUsed >= 23.5) vChance = 0.20;
    const bh = handler.attributes.ballHandling ?? 50;
    if (bh < 65) vChance += 0.08;
    if (dom === 'isoHeavy' && (scheme === 'Pace and Space' || scheme === 'Triangle')) vChance += 0.12;
    if (handler.personalityTraits.includes('Professional')) vChance *= 0.5;
    if (Math.random() < vChance) violations++;

    // Timeout from opposing run (5% per possession)
    streak = Math.random() < 0.55 ? streak + 1 : 0;
    if (streak >= 4) { timeouts++; streak = 0; }
  }

  return {
    avgClock:  possessions > 0 ? +(totalClock / possessions).toFixed(1) : 14,
    violations,
    fastBreaks,
    timeouts,
  };
};

// ─── League OVR Normalization ─────────────────────────────────────────────────
/**
 * At season start, ensure team OVRs fall within realistic tiers by nudging
 * the weakest/strongest players ±3. Call this before drafting/free agency.
 *
 * Tier targets:
 *  Elite     (2-3 teams): 83-87
 *  Contender (5-6 teams): 78-83
 *  Fringe    (5-6 teams): 74-78
 *  Lottery   (4-5 teams): 68-74
 *  Rebuild   (2-3 teams): 62-68
 *  Hard floor/ceiling: 60-90
 */
export const normalizeLeagueOVRs = (state: LeagueState): LeagueState => {
  const teams = state.teams.map(t => ({ ...t, roster: t.roster.map(p => ({ ...p })) }));

  // compute average OVR for a team's top 10 players
  const teamOVR = (t: typeof teams[0]) =>
    t.roster.slice().sort((a, b) => b.rating - a.rating).slice(0, 10)
      .reduce((s, p) => s + p.rating, 0) / Math.min(10, t.roster.length || 1);

  // Hard clamp: no team below 60 or above 90
  teams.forEach(t => {
    let ovr = teamOVR(t);
    if (ovr < 60) {
      // Boost weakest players +3 until we reach 60
      const sorted = t.roster.slice().sort((a, b) => a.rating - b.rating);
      for (const p of sorted) {
        if (teamOVR(t) >= 60) break;
        const real = t.roster.find(r => r.id === p.id)!;
        real.rating = Math.min(90, real.rating + 3);
        // nudge shooting attributes slightly too
        real.attributes.shooting = Math.min(99, real.attributes.shooting + 2);
      }
    } else if (ovr > 90) {
      const sorted = t.roster.slice().sort((a, b) => b.rating - a.rating);
      for (const p of sorted) {
        if (teamOVR(t) <= 90) break;
        const real = t.roster.find(r => r.id === p.id)!;
        real.rating = Math.max(60, real.rating - 3);
      }
    }
  });

  return { ...state, teams };
};

// ─── Tendency Helpers ─────────────────────────────────────────────────────────
/**
 * Convert a 0-100 tendency score to a probability weight multiplier.
 * 0-25→0.5×  26-50→0.8×  51-70→1.0×  71-85→1.4×  86-99→2.0×
 */
const tendencyWeight = (t: number): number => {
  if (t <= 25) return 0.5;
  if (t <= 50) return 0.8;
  if (t <= 70) return 1.0;
  if (t <= 85) return 1.4;
  return 2.0;
};

/** Pick from a weighted pool of { value, weight } objects. */
const weightedRandom = <T>(pool: { value: T; weight: number }[]): T => {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return pool[0].value;
  let r = Math.random() * total;
  for (const item of pool) { r -= item.weight; if (r <= 0) return item.value; }
  return pool[pool.length - 1].value;
};

const lastName = (p: Player) => p.name.split(' ').at(-1) ?? p.name;

// ─── Possession Types ─────────────────────────────────────────────────────────
type OffAction  = 'ISO' | 'POST_UP' | 'DRIVE' | 'PASS_FIRST' | 'TRANSITION';
type ShotType   = 'PULL_UP_3' | 'MID_RANGE' | 'DRIVE_LAYUP' | 'POST_FADE' | 'CATCH_AND_SHOOT_3';
type PossResult = 'MADE' | 'MISSED' | 'TURNOVER' | 'STEAL' | 'FOUL_DRAWN';

interface PossessionResult {
  ballHandlerName: string;
  ballHandlerId: string;
  tendencyUsed: string;
  actionTaken: OffAction;
  tendencyScore: number;
  shotType?: ShotType;
  shotModifier: number;
  conflictFired: boolean;
  conflictText?: string;
  defenderTendency: string;
  defenseModifier: number;
  finalShotProbability: number;
  result: PossResult;
  stolenBy?: string;
  foulsOn?: string;
  isTransition: boolean;
  pbpText: string;
  defenderRef?: Player;
}

// ─── Possession Simulator ─────────────────────────────────────────────────────
const simulatePossession = (
  offHandler: Player,
  defense: Team,
  scheme: CoachScheme,
  hotStreak = 0,
  /** External situational boost (+comeback, -complacency, +clutch) applied to final shot prob */
  situationalBoost = 0,
): PossessionResult => {
  const ot = offHandler.tendencies?.offensiveTendencies;
  const ln = lastName(offHandler);
  const defIdx   = Math.floor(Math.random() * Math.min(8, defense.roster.length));
  const defender = defense.roster[defIdx];
  const dt       = defender?.tendencies?.defensiveTendencies;
  const defLn    = defender ? lastName(defender) : 'Defender';

  // ── Step 1: Transition? ───────────────────────────────────────────────────
  const transHunter = ot?.transitionHunter ?? 50;
  const isTransition = transHunter >= 70
    ? Math.random() < 0.40
    : transHunter >= 50 ? Math.random() < 0.15 : Math.random() < 0.05;

  // ── Step 2: Offensive action ──────────────────────────────────────────────
  let offAction: OffAction;
  if (isTransition) {
    offAction = 'TRANSITION';
  } else {
    // dribbleHandOff: boosts both DRIVE (initiator turns corner) and PASS_FIRST (kicks off DHO)
    const dhoWeight = tendencyWeight(ot?.dribbleHandOff ?? 50);
    const pool: { value: OffAction; weight: number }[] = [
      { value: 'ISO',        weight: tendencyWeight(ot?.isoHeavy      ?? 50) },
      { value: 'POST_UP',    weight: tendencyWeight(ot?.postUp        ?? 50) },
      { value: 'DRIVE',      weight: tendencyWeight(ot?.driveToBasket ?? 50) + dhoWeight * 0.30 },
      { value: 'PASS_FIRST', weight: tendencyWeight(ot?.kickOutPasser ?? 50) + dhoWeight * 0.40 },
    ];
    offAction = weightedRandom(pool);
  }

  // ── Step 3: Shot type ─────────────────────────────────────────────────────
  let shotType: ShotType;
  switch (offAction) {
    case 'TRANSITION':
    case 'ISO': {
      const sp: { value: ShotType; weight: number }[] = [
        { value: 'PULL_UP_3',   weight: tendencyWeight(ot?.pullUpThree     ?? 50) },
        { value: 'MID_RANGE',   weight: tendencyWeight(ot?.midRangeJumper  ?? 50) },
        { value: 'DRIVE_LAYUP', weight: tendencyWeight(ot?.driveToBasket   ?? 50) },
      ];
      shotType = weightedRandom(sp);
      break;
    }
    case 'POST_UP':
      shotType = Math.random() < (ot?.kickOutPasser ?? 50) / 100 * 0.45 ? 'CATCH_AND_SHOOT_3' : 'POST_FADE';
      break;
    case 'DRIVE': {
      if (Math.random() < (ot?.kickOutPasser ?? 50) / 100 * 0.40) {
        shotType = 'CATCH_AND_SHOOT_3';
      } else {
        // pullUpOffPnr: additional weight for pulling up off a screen
        const pnrPullWeight = tendencyWeight(ot?.pullUpThree ?? 50) * 0.5
                            + tendencyWeight(ot?.pullUpOffPnr ?? 50) * 0.40;
        const sp: { value: ShotType; weight: number }[] = [
          { value: 'DRIVE_LAYUP', weight: tendencyWeight(ot?.driveToBasket ?? 50) },
          { value: 'MID_RANGE',   weight: 0.8 },
          { value: 'PULL_UP_3',   weight: pnrPullWeight },
        ];
        shotType = weightedRandom(sp);
      }
      break;
    }
    default: shotType = 'CATCH_AND_SHOOT_3';
  }

  // ── Step 4: Base probability + tendency modifier ──────────────────────────
  let baseProb     = 0.46;
  let shotModifier = 0;
  let tendencyUsed = '';
  let tendencyScore = 50;
  let pbpBase      = `${ln} shoots...`;

  switch (shotType) {
    case 'PULL_UP_3': {
      // Pull-up 3s are harder than avg: apply a -0.03 difficulty penalty vs. the base expected %
      baseProb      = getThreePointPercentage(offHandler.attributes.shooting3pt) - 0.03;
      tendencyUsed  = 'pullUpThree';
      tendencyScore = ot?.pullUpThree ?? 50;
      const m       = (tendencyScore / 100) * 0.15;
      shotModifier  = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      pbpBase = tendencyScore >= 86
        ? `${ln} rises up from downtown, pure confidence...`
        : tendencyScore >= 70
          ? `${ln} pulls up from deep...`
          : tendencyScore < 30
            ? `${ln} forces a difficult three-pointer...`
            : `${ln} steps back for three...`;
      break;
    }
    case 'MID_RANGE': {
      baseProb      = offHandler.attributes.shootingMid / 100 * 0.42 + 0.28;
      tendencyUsed  = 'midRangeJumper';
      tendencyScore = ot?.midRangeJumper ?? 50;
      const m       = (tendencyScore / 100) * 0.12;
      shotModifier  = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      pbpBase = tendencyScore >= 70
        ? `${ln} rises up from the elbow — that's his spot...`
        : `${ln} settles for the mid-range...`;
      break;
    }
    case 'DRIVE_LAYUP': {
      // Attribute-driven curve replacing the old linear formula; accounts for
      // dunks as a 20% blend (athletic finishers convert drives into dunks too).
      const layupBase = getLayupPercentage(offHandler.attributes.layups, offHandler.position);
      const dunkBlend = getLayupPercentage(offHandler.attributes.dunks,  offHandler.position);
      baseProb      = layupBase * 0.80 + dunkBlend * 0.20;
      tendencyUsed  = 'driveToBasket';
      tendencyScore = ot?.driveToBasket ?? 50;
      const m       = (tendencyScore / 100) * 0.10;
      shotModifier  = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      pbpBase = isTransition && transHunter >= 70
        ? `${ln} pushes the pace immediately — gets out before the defense sets...`
        : tendencyScore >= 86 ? `${ln} attacks the rim relentlessly...`
          : tendencyScore >= 70 ? `${ln} attacks the rim hard...`
            : `${ln} drives the lane...`;
      break;
    }
    case 'POST_FADE': {
      baseProb      = offHandler.attributes.postScoring / 100 * 0.38 + 0.26;
      tendencyUsed  = 'postUp';
      tendencyScore = ot?.postUp ?? 50;
      const m       = (tendencyScore / 100) * 0.13;
      shotModifier  = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      pbpBase = tendencyScore >= 75
        ? `${ln} backs down his defender in the post, drops his shoulder and goes to work...`
        : `${ln} goes to work in the post...`;
      break;
    }
    case 'CATCH_AND_SHOOT_3': {
      // Catch-and-shoot is a quality look; base is the expected %, tendency/spot-up modifiers lift it further
      baseProb      = getThreePointPercentage(offHandler.attributes.shooting3pt);
      tendencyUsed  = 'kickOutPasser';
      tendencyScore = ot?.kickOutPasser ?? 50;
      shotModifier  = +0.04;
      // Spot Up / Off Screen: well-positioned off-ball shooter earns higher-quality looks
      shotModifier += ((ot?.spotUp    ?? 50) - 50) / 100 * 0.06;
      shotModifier += ((ot?.offScreen ?? 50) - 50) / 100 * 0.04;
      pbpBase = offAction === 'PASS_FIRST'
        ? `${ln} swings it and finds the open man in the corner...`
        : `${ln} kicks it out to the shooter...`;
      break;
    }
  }

  // Step 3.5: Attack Close-Outs -- convert C&S to drive if tendency is high
  {
    const atk = ot?.attackCloseOuts ?? 50;
    if (shotType === 'CATCH_AND_SHOOT_3' && atk >= 65 && !isTransition) {
      if (Math.random() < (atk - 50) / 200) {
        shotType      = 'DRIVE_LAYUP';
        pbpBase       = `${ln} sees the close-out and immediately attacks off the dribble...`;
        tendencyUsed  = 'attackCloseOuts';
        tendencyScore = atk;
        baseProb      = offHandler.attributes.layups / 100 * 0.40 + 0.38;
        shotModifier  = atk >= 70 ? (atk / 100) * 0.10 : 0;
      }
    }
  }

  // Step 4.5: Draw Foul -- contact-seeker gets to the line
  {
    const drawFoulTend = ot?.drawFoul ?? 50;
    if ((shotType === 'DRIVE_LAYUP' || shotType === 'POST_FADE') && drawFoulTend >= 55 && !isTransition) {
      if (Math.random() < (drawFoulTend - 50) / 100 * 0.28) {
        return {
          ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
          tendencyUsed: 'drawFoul', actionTaken: offAction,
          tendencyScore: drawFoulTend, shotModifier: 0, conflictFired: false,
          defenderTendency: '', defenseModifier: 0,
          finalShotProbability: 0, result: 'FOUL_DRAWN',
          foulsOn: defender?.name, isTransition, defenderRef: defender,
          pbpText: `${ln} draws contact going to the basket — foul called!`,
        };
      }
    }
  }

  // ── Step 5: Defensive tendency modifiers ──────────────────────────────────
  let defenseModifier = 0;
  let defTendencyUsed = '';
  let pbpDefPrefix    = '';

  if (dt) {
    const gambles    = dt.gambles     ?? 50;
    const helpDef    = dt.helpDefender ?? 50;
    const physicality= dt.physicality  ?? 50;
    const faceUp     = dt.faceUpGuard  ?? 50;

    // Gambles / steal attempt
    if (Math.random() < gambles / 400) {
      if (Math.random() < 0.32) {
        return {
          ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
          tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
          tendencyScore, shotModifier: 0, conflictFired: false,
          defenderTendency: 'gambles', defenseModifier: 0,
          finalShotProbability: 0, result: 'STEAL',
          stolenBy: defender?.name, isTransition, defenderRef: defender,
          pbpText: `${defLn} gambles for the steal — picks his pocket! Turnover.`,
        };
      }
      defenseModifier += 0.15;
      defTendencyUsed  = 'gambles';
      pbpDefPrefix     = `${defLn} reaches — out of position. `;
      if (gambles >= 75 && (defender?.attributes.defensiveIQ ?? 65) < 65 && Math.random() < 0.10) {
        return {
          ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
          tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
          tendencyScore, shotModifier: 0, conflictFired: false,
          defenderTendency: 'gambles', defenseModifier: 0,
          finalShotProbability: 0, result: 'FOUL_DRAWN',
          foulsOn: defender?.name, isTransition, defenderRef: defender,
          pbpText: `${defLn} reaches in recklessly — foul called on the play!`,
        };
      }
    }

    // Help defender
    if (shotType === 'DRIVE_LAYUP' || shotType === 'POST_FADE') {
      if (helpDef >= 70) {
        defenseModifier -= 0.08;
        defTendencyUsed  = 'helpDefender';
        pbpDefPrefix     = `${defLn} rotates over from the weak side. `;
        if ((defender?.attributes.defensiveIQ ?? 70) < 55) {
          defenseModifier += 0.10;
          pbpDefPrefix = `${defLn} over-rotates — kick-out leads to an open look. `;
        }
      } else if (helpDef < 40) {
        defenseModifier += 0.08;
        defTendencyUsed  = 'helpDefenderAbsent';
      }
    }

    // Physicality
    if (physicality >= 85) {
      defenseModifier -= 0.06;
      if (!defTendencyUsed) defTendencyUsed = 'physicality';
      pbpBase += ` ${defLn} met him at the rim with contact.`;
      if ((offHandler.attributes.strength ?? 60) < 55 &&
          (shotType === 'DRIVE_LAYUP' || shotType === 'POST_FADE')) defenseModifier -= 0.04;
    } else if (physicality >= 70) {
      defenseModifier -= 0.03;
      pbpBase += ` ${defLn} bodied up hard.`;
    }

    // Interior Defense attribute — rim-protection quality for layup/post shots.
    // Captures length, timing, and shot-contest caliber independent of tendency
    // habits (helpDefender, physicality above already cover behavioral consistency).
    // Average rim defender (attr≈50) → 0 adjustment; elite → up to −12%; weak → up to +4%.
    if (shotType === 'DRIVE_LAYUP' || shotType === 'POST_FADE') {
      const intDef     = defender?.attributes.interiorDef ?? 50;
      const rimCtx     = shotType as RimContext;
      const rimContestMod = getRimProtectionMod(intDef, rimCtx);
      defenseModifier += rimContestMod;
      if (intDef >= 80 && rimContestMod <= -0.06) {
        if (!defTendencyUsed) defTendencyUsed = 'interiorDef';
        pbpDefPrefix = pbpDefPrefix || `${defLn} meets him at the rim — massive contest — `;
      } else if (intDef >= 90 && rimContestMod <= -0.09) {
        pbpBase += ` ${defLn} is a wall at the rim!`;
      } else if (intDef <= 30 && shotType === 'DRIVE_LAYUP') {
        pbpDefPrefix = pbpDefPrefix || `${defLn} has no chance — nobody in the paint — `;
      }
    }

    // Face-up guard
    if (faceUp >= 70 && (shotType === 'PULL_UP_3' || shotType === 'CATCH_AND_SHOOT_3')) {
      defenseModifier -= 0.06;
      if (!defTendencyUsed) defTendencyUsed = 'faceUpGuard';
    } else if (faceUp < 40 && shotType === 'CATCH_AND_SHOOT_3') {
      defenseModifier += 0.08;
      pbpDefPrefix = `${defLn} gets caught ball-watching — `;
      if (!defTendencyUsed) defTendencyUsed = 'faceUpGuardAbsent';
    }

    // Perimeter Defense attribute — contest quality for 3PT shots.
    // Captures the defender's athleticism, length, and closeout caliber
    // independently of their tendency habits (faceUp, contestDisc above).
    // Average defender (attr≈50) → 0 adjustment; elite → up to -6%; poor → up to +2.5%.
    if (shotType === 'PULL_UP_3' || shotType === 'CATCH_AND_SHOOT_3') {
      const perimDef   = defender?.attributes.perimeterDef ?? 50;
      const ctx        = shotType as Shot3PTContext;
      const contestMod = get3PTContestMod(perimDef, ctx);
      defenseModifier += contestMod;
      // PBP flavour for notable cases (only if no stronger tendency already set text)
      if (perimDef >= 85 && contestMod <= -0.04) {
        if (!defTendencyUsed) defTendencyUsed = 'perimeterDef';
        if (shotType === 'CATCH_AND_SHOOT_3')
          pbpDefPrefix = pbpDefPrefix || `${defLn} closes out hard and contests the catch — `;
        else
          pbpDefPrefix = pbpDefPrefix || `${defLn} stays attached through the screen — `;
      } else if (perimDef <= 30 && shotType === 'CATCH_AND_SHOOT_3') {
        pbpDefPrefix = pbpDefPrefix || `${defLn} is caught flat-footed — wide open look — `;
      }
    }

    // On Ball Pest -- suffocating pressure on iso/drive, foul risk at peak values
    const onBallPest = dt.onBallPest ?? 50;
    if (onBallPest >= 70 && (offAction === 'ISO' || offAction === 'DRIVE') && !isTransition) {
      defenseModifier -= 0.05;
      if (!defTendencyUsed) defTendencyUsed = 'onBallPest';
      pbpBase += ` ${defLn} gets right in his face.`;
      if (onBallPest >= 82 && Math.random() < 0.07) {
        return {
          ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
          tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
          tendencyScore, shotModifier: 0, conflictFired: false,
          defenderTendency: 'onBallPest', defenseModifier: 0,
          finalShotProbability: 0, result: 'FOUL_DRAWN',
          foulsOn: defender?.name, isTransition, defenderRef: defender,
          pbpText: `${defLn} fouls trying to pressure — too aggressive on the ball!`,
        };
      }
    }

    // Deny the Pass -- denying the catch hurts the initiating offense; risk of backdoor
    const denyPass = dt.denyThePass ?? 50;
    if (denyPass >= 70 && offAction === 'PASS_FIRST') {
      defenseModifier -= 0.07;
      if (!defTendencyUsed) defTendencyUsed = 'denyThePass';
      pbpDefPrefix = pbpDefPrefix || `${defLn} denies the catch — `;
      if (denyPass >= 80 && Math.random() < 0.15) {
        defenseModifier += 0.15;
        pbpDefPrefix = `${defLn} over-denies — backdoor cut opens up! `;
      }
    }

    // Shot Contest Discipline -- low = bites pump fakes; high = disciplined contests
    const contestDisc = dt.shotContestDiscipline ?? 50;
    if (contestDisc < 35 && (shotType === 'MID_RANGE' || shotType === 'PULL_UP_3') && offAction !== 'TRANSITION') {
      if (Math.random() < (40 - contestDisc) / 100 * 0.22) {
        return {
          ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
          tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
          tendencyScore, shotModifier: 0, conflictFired: false,
          defenderTendency: 'shotContestDiscipline', defenseModifier: 0,
          finalShotProbability: 0, result: 'FOUL_DRAWN',
          foulsOn: defender?.name, isTransition, defenderRef: defender,
          pbpText: `${defLn} bites on the pump fake — foul on the shooting player!`,
        };
      }
    }
    if (contestDisc >= 70 && (shotType === 'MID_RANGE' || shotType === 'PULL_UP_3' || shotType === 'CATCH_AND_SHOOT_3')) {
      defenseModifier -= 0.04;
      if (!defTendencyUsed) defTendencyUsed = 'shotContestDiscipline';
    }
  }

  // ── Step 6: STREAKY trait ──────────────────────────────────────────────────
  if (offHandler.personalityTraits.includes('Streaky')) {
    if (hotStreak >= 2) baseProb += 0.04;
    else if (hotStreak <= -2) baseProb -= 0.04;
  }

  // ── Step 7: Coach system conflict ─────────────────────────────────────────
  let conflictFired = false;
  let conflictText: string | undefined;
  if (scheme === 'Triangle' && (ot?.isoHeavy ?? 0) > 70 && offAction === 'ISO' && Math.random() < 0.30) {
    conflictFired = true;
    conflictText  = `${ln} ignores the play call and goes one-on-one — Triangle system breaks down`;
  } else if ((scheme === 'Pace and Space' || scheme === 'Showtime') &&
             (ot?.postUp ?? 0) > 75 && offAction === 'POST_UP' && Math.random() < 0.25) {
    conflictFired = true;
    conflictText  = `${ln}'s post-up stalls the pace — coach wants the ball moving faster`;
  } else if (scheme === 'Grit and Grind' && (ot?.pullUpThree ?? 0) > 80 &&
             offHandler.attributes.shooting3pt < 55 && shotType === 'PULL_UP_3' && Math.random() < 0.30) {
    conflictFired = true;
    conflictText  = `${ln} forces a low-percentage three — coach shaking his head on the sideline`;
  }

  // ── Step 8: Final probability & result ────────────────────────────────────
  const finalProb = Math.max(0.05, Math.min(0.94, baseProb + shotModifier + defenseModifier + situationalBoost));
  const made      = Math.random() < finalProb;
  const posResult : PossResult = made ? 'MADE' : 'MISSED';

  let fullText = pbpDefPrefix + pbpBase;
  if (posResult === 'MADE') {
    if (shotType === 'POST_FADE' && (ot?.postUp ?? 0) >= 75)
      fullText += ` — drops his shoulder and hits the post fade!`;
    else if (shotType === 'PULL_UP_3' && (ot?.pullUpThree ?? 0) >= 71)
      fullText += ` — BANG! Right in his wheelhouse.`;
    else if (offHandler.personalityTraits.includes('Streaky') && hotStreak >= 2)
      fullText += ` — Good. ${ln} is feeling it right now...`;
    else
      fullText += ` — Good.`;
  } else {
    fullText += offHandler.personalityTraits.includes('Streaky') && hotStreak <= -2
      ? ` — No good. ${ln} is struggling to find his shot...`
      : ` — No good.`;
  }
  if (conflictFired && conflictText) fullText += ` (${conflictText})`;

  return {
    ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
    tendencyUsed, actionTaken: offAction, tendencyScore,
    shotType, shotModifier, conflictFired, conflictText,
    defenderTendency: defTendencyUsed, defenseModifier,
    finalShotProbability: finalProb, result: posResult,
    isTransition, pbpText: fullText, defenderRef: defender,
  };
};

// ─── Tendency → stat-line modifiers ──────────────────────────────────────────
interface TendencyModifiers {
  threepaBoost: number;
  insideBoost:  number;
  usageBoost:   number;
  astBoost:     number;
  stlBoost:     number;
  foulRisk:     number;
}
const computeTendencyModifiers = (p: Player): TendencyModifiers => {
  const ot = p.tendencies?.offensiveTendencies;
  const dt = p.tendencies?.defensiveTendencies;
  return {
    threepaBoost: (( ot?.pullUpThree    ?? 50) - 50) / 100 * 0.40,
    insideBoost:  (( ot?.driveToBasket  ?? 50) - 50) / 100 * 0.30
                + ((ot?.cutter         ?? 50) - 50) / 100 * 0.12,
    usageBoost:   (( ot?.isoHeavy       ?? 50) - 50) / 100 * 0.15
                - ((ot?.kickOutPasser   ?? 50) - 50) / 100 * 0.12
                + ((ot?.drawFoul        ?? 50) - 50) / 100 * 0.06,
    astBoost:     (( ot?.kickOutPasser  ?? 50) - 50) / 100 * 0.35
                + ((ot?.spotUp          ?? 50) - 50) / 100 * 0.08,
    stlBoost:     (( dt?.gambles        ?? 50) - 50) / 100 * 0.30
                + ((dt?.denyThePass     ?? 50) - 50) / 100 * 0.10,
    foulRisk:     (( dt?.physicality    ?? 50) - 50) / 100 * 0.25
                + ((dt?.gambles         ?? 50) - 50) / 100 * 0.15
                + ((dt?.onBallPest      ?? 50) - 50) / 100 * 0.10
                - ((dt?.shotContestDiscipline ?? 50) - 50) / 100 * 0.12,
  };
};

// ─── Cinematic PBP Narrator ─────────────────────────────────────────────────
const _pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const _defLn = (p: Player | undefined) => p ? (p.name.split(' ').at(-1) ?? p.name) : 'the defender';

const generateCinematicLines = (
  poss: PossessionResult,
  offHandler: Player,
  streak: number,
): { setup: string; attack: string; result: string } | null => {
  const action = poss.actionTaken;
  if (!['ISO', 'DRIVE', 'POST_UP'].includes(action)) return null;
  if (poss.shotType === 'CATCH_AND_SHOOT_3') return null;

  const o   = lastName(offHandler);
  const def = poss.defenderRef;
  const d   = _defLn(def);
  const adv = (offHandler.rating ?? 70) - (def?.rating ?? 70);
  const oTr = offHandler.personalityTraits ?? [];
  const dTr = def?.personalityTraits ?? [];

  // ── LINE 1: MATCHUP SETUP ───────────────────────────────────────────────────
  let setup: string;
  if (action === 'ISO') {
    if (oTr.includes('Diva/Star')) {
      setup = _pick([
        `${o} is calling his own number here. ISO.`,
        `Nobody is getting this ball. ${o} wants the ISO.`,
      ]);
    } else if (adv >= 8) {
      setup = _pick([
        `${o} spots the mismatch immediately.`,
        `The bench is pointing — ${o} has ${d} isolated. Everyone in the building knows it.`,
        `They're going right at ${d}. ${o} dribbles over and sets up.`,
        `ISO. ${o} on ${d}. This is a problem.`,
        `${o} calls for the ball at the top and waves teammates off. ${d} is all that stands between him and the basket.`,
      ]);
    } else if (adv <= -8) {
      setup = dTr.includes('Workhorse')
        ? _pick([
            `${o} takes the challenge anyway. ${d} has been locked in all game.`,
            `${d} doesn't take plays off. ${o} goes right at him anyway.`,
          ])
        : dTr.includes('Hot Head')
        ? _pick([
            `Watch ${d} here — he's been chippy. ${o} attacks anyway.`,
            `${d} is fired up. ${o} takes the challenge.`,
          ])
        : _pick([
            `${o} takes the challenge anyway.`,
            `${d} locks in — he's been dominant tonight.`,
            `${o} dribbles into ${d}'s territory. Bold move.`,
          ]);
    } else {
      setup = dTr.includes('Workhorse')
        ? _pick([
            `Good luck — ${d} doesn't take plays off.`,
            `${d} has been locked in all game. ${o} isolates on him anyway.`,
            `${o} and ${d} have been going at it all night. Here we go again.`,
          ])
        : _pick([
            `This is a battle — ${o} vs ${d}, one on one.`,
            `${d} slides over. He's ready for this.`,
            `${o} and ${d} have been going at it all night. Here we go again.`,
            `${o} calls for the ISO. ${d} steps up.`,
            `${o} isolates on ${d} at the top of the arc.`,
            `${o} sizes up ${d} at the elbow.`,
            `${o} waves off the play — he's got ${d}.`,
            `${o} catches on the wing. ${d} crouches into his defensive stance.`,
            `${o} pounds the ball at the top. ${d} is all that stands between him and the basket.`,
          ]);
    }
    if (oTr.includes('Professional')) {
      setup = `${o} methodically sets up the ISO — controlled, precise.`;
    }
    if (streak >= 2) {
      setup += oTr.includes('Hot Head')
        ? ` ${o} is locked in — don't foul him.`
        : ` ${o} is in a zone right now. Nobody is stopping him in ISO.`;
    } else if (streak <= -2) {
      setup += ` ${o} keeps going back to the well.`;
    }
  } else if (action === 'DRIVE') {
    setup = _pick([
      `${o} puts his head down and attacks ${d} off the dribble.`,
      `${o} surveys the floor, sees the lane, and goes.`,
      `${o} gets a head of steam — ${d} retreats to protect the rim.`,
      `${o} attacks ${d} off the dribble, looking to get to the paint.`,
    ]);
  } else {
    setup = _pick([
      `${o} seals ${d} in the post. Ball goes in.`,
      `${o} backs ${d} down into the paint.`,
      `${o} catches at the block. ${d} is trying to front him.`,
      `${o} calls for the ball on the low block. ${d} sets up behind him.`,
    ]);
  }

  // ── LINE 2: ATTACK DESCRIPTION ─────────────────────────────────────────────
  let attack: string;
  const shot = poss.shotType;

  if (action === 'ISO') {
    switch (shot) {
      case 'DRIVE_LAYUP':
        attack = _pick([
          `${o} hits ${d} with a crossover, blows past him to the left.`,
          `${o} crosses over twice — ${d} bites — and attacks the lane.`,
          `One hard crossover and ${o} is gone. ${d} is a step behind.`,
          `${o} plants and goes — euro step leaves ${d} frozen at the arc.`,
          `${o} changes direction so fast ${d} nearly loses his footing. He's at the rim.`,
        ]);
        break;
      case 'MID_RANGE':
        attack = _pick([
          `${o} jab steps right, ${d} shifts — ${o} steps back and elevates.`,
          `${o} creates space with a step back. ${d} can't close in time.`,
          `One dribble, step back, ${d} is too late.`,
          `${o} rocks ${d} to sleep with the dribble, then rises for the mid-range.`,
          `${o} stops on a dime, rises up over ${d}'s outstretched hand.`,
        ]);
        break;
      case 'PULL_UP_3':
        attack = _pick([
          `${o} pulls up in ${d}'s face from well beyond the arc.`,
          `${o} stops and pops — ${d} had position but ${o} got his shot off.`,
          `Mid-dribble, ${o} elevates. ${d} jumps but he's a fraction late.`,
          `${o} jab steps, ${d} shifts — ${o} steps all the way back to the three-point line and elevates.`,
        ]);
        break;
      case 'POST_FADE':
        attack = _pick([
          `${o} catches deep in the post, feels ${d} on his back, and spins baseline.`,
          `${o} seals ${d}, spins middle and goes up strong.`,
          `Quick spin — ${d} loses track for just a second. That's all ${o} needed.`,
          `${o} leans into ${d}, fades away toward the baseline and releases.`,
        ]);
        break;
      default:
        attack = _pick([
          `${o} creates off the dribble and fires.`,
          `${o} works ${d} off the bounce and elevates.`,
        ]);
    }
  } else if (action === 'DRIVE') {
    switch (shot) {
      case 'DRIVE_LAYUP':
        attack = _pick([
          `${o} gets into the lane. ${d} is backpedaling now.`,
          `Strong drive — ${o} absorbs contact from ${d} and finishes.`,
          `${o} attacks inside, right through ${d}.`,
          `${o} uses the euro step to dance around ${d} in the lane.`,
        ]);
        break;
      case 'MID_RANGE':
        attack = _pick([
          `${o} stops and pulls up in the mid-range. ${d} was too deep.`,
          `${o} gets to the elbow, rises up over ${d}'s closeout.`,
        ]);
        break;
      case 'PULL_UP_3':
        attack = _pick([
          `${o} curls off the screen, ${d} trails — ${o} rises up for three.`,
          `${o} uses the dribble hand-off and rises up from deep. ${d} was a step late.`,
        ]);
        break;
      default:
        attack = _pick([
          `${o} attacks the paint and finishes.`,
          `${o} drives hard to the basket.`,
        ]);
    }
  } else {
    // POST_UP
    attack = _pick([
      `${o} catches deep in the post, feels ${d} on his back, and spins baseline.`,
      `${o} seals ${d}, spins middle and goes up strong.`,
      `Quick spin — ${d} loses track for just a second. That's all ${o} needed.`,
      `${o} leans into ${d}, fades away toward the baseline and releases.`,
      `${o} backs ${d} down, fades to his right — high off the glass attempt.`,
      `Back to the basket, ${o} turns over his left shoulder and fires over ${d}.`,
      `${o} catches at the elbow and turns. ${d} is a step slow.`,
      `${o} pivots. ${d} contests — but ${o}'s release is too quick.`,
    ]);
  }

  // ── LINE 3: RESULT ──────────────────────────────────────────────────────────
  let result: string;
  switch (poss.result) {
    case 'MADE':
      result = (shot === 'PULL_UP_3' || (action === 'ISO' && adv >= 5))
        ? _pick([
            `BANG! Right in ${d}'s face.`,
            `Cold-blooded. ${o} drains it over ${d}.`,
            `Splash. ${d} contests but it's too late.`,
            `GOOD. ${d} had no answer.`,
          ])
        : _pick([
            `GOOD.`,
            `It falls. ${o} converts.`,
            `Splash. Nothing but net.`,
            `He got it! ${o} converts.`,
            `${d} had good position but ${o} is just better right there.`,
            `Good for two.`,
            `Drains it.`,
          ]);
      break;
    case 'MISSED':
      result = (adv <= -5)
        ? _pick([
            `${d} stays with him — no good. ${d} wins this round.`,
            `${d} had great position and it shows. Missed.`,
            `Off the back iron. ${d} held his ground.`,
            `Not tonight — ${d} contests and ${o} can't finish.`,
          ])
        : _pick([
            `${d} stays with him — no good.`,
            `Off the back iron. ${d} hangs tough.`,
            `${o} couldn't convert. ${d} with a great stop.`,
            `Not tonight — no good.`,
            `Rattles out. ${d} lives to fight another possession.`,
          ]);
      break;
    case 'STEAL':
      result = _pick([
        `${d} anticipates the move — STEAL! ${o} is stripped clean.`,
        `${d} pokes it free from ${o}'s grasp. Turnover.`,
        `${d} reads it perfectly. Intercepts the ball. Huge stop.`,
      ]);
      break;
    case 'FOUL_DRAWN':
      result = _pick([
        `AND ONE! ${o} converts through contact! He's going to the line!`,
        `Foul on ${d}! ${o} gets the bucket and a free throw.`,
        `Bucket AND the foul on ${d}! ${o} is heading to the stripe.`,
        `${o} draws the foul on ${d}. Free throws coming.`,
      ]);
      break;
    default:
      result = _pick([
        `${o} picks up his dribble — ${d} forces the jump ball. Turnover.`,
        `Lost ball! ${d} pokes it free from ${o}'s grasp.`,
        `${o} turns it over. Good defense by ${d}.`,
      ]);
  }

  return { setup, attack, result };
};

// ─── Quarter PBP Generator ────────────────────────────────────────────────────
const generateQuarterPBP = (
  offTeam: Team,
  defTeam: Team,
  quarter: number,
  possessions: number,
  scheme: CoachScheme,
  streakMap: Map<string, number>,
  /** Per-possession situational shooting boost/penalty for this team this quarter */
  situationalBoost = 0,
  /** Whether garbage time is active — shifts descriptions and reduces energy */
  isGarbageTime = false,
  /** How many consecutive possessions this team has scored (momentum counter) */
  momentumStreak = 0,
): { events: PlayByPlayEvent[]; teamStreak: number } => {
  const events: PlayByPlayEvent[] = [];
  let teamStreak = momentumStreak; // consecutive scoring possessions
  let emergencyBoostPoss = 0;      // possessions remaining with emergency +10% boost

  const rotation = offTeam.rotation
    ? [
        ...Object.values(offTeam.rotation.starters).map(id => offTeam.roster.find(p => p.id === id)!).filter(Boolean),
        ...(isGarbageTime
          ? offTeam.rotation.bench.map(id => offTeam.roster.find(p => p.id === id)!).filter(Boolean)
          : offTeam.rotation.bench.slice(0, 3).map(id => offTeam.roster.find(p => p.id === id)!).filter(Boolean)),
      ]
    : offTeam.roster.slice(0, isGarbageTime ? 12 : 8);
  if (rotation.length === 0) return { events, teamStreak };

  const sample = Math.round(possessions / 3);
  for (let i = 0; i < sample; i++) {
    // Garbage time: prefer bench players in the rotation
    const handlerPool = isGarbageTime
      ? rotation.slice(Math.min(3, rotation.length - 1))
      : rotation;
    const handler = handlerPool[Math.floor(Math.random() * handlerPool.length)] ?? rotation[0];
    if (!handler) continue;

    const streak  = streakMap.get(handler.id) ?? 0;
    // Emergency boost after a 12-0 run: next 3 possessions get +10%
    const posBoost = situationalBoost + (emergencyBoostPoss > 0 ? 0.10 : 0);
    const poss    = simulatePossession(handler, defTeam, scheme, streak, posBoost);
    if (emergencyBoostPoss > 0) emergencyBoostPoss--;

    const made = poss.result === 'MADE';
    streakMap.set(handler.id,
      made   ? Math.max(0, streak) + 1 :
      poss.result === 'MISSED' ? Math.min(0, streak) - 1 : 0);

    // Team momentum tracking
    if (made) {
      teamStreak++;
    } else {
      teamStreak = 0;
    }

    // Momentum checks
    if (teamStreak === 4) {
      const coachName = offTeam.staff.headCoach?.name?.split(' ').at(-1) ?? 'The coach';
      events.push({ time: `${12 - Math.floor((i / sample) * 12)}:00`, text: `${coachName} calls timeout to stop the run — momentum reset`, type: 'info', quarter });
      teamStreak = 0; // timeout resets streak
    }
    if (teamStreak >= 6) {
      // 12-0 run without timeout → emergency boost for next 3 possessions
      events.push({ time: `${12 - Math.floor((i / sample) * 12)}:00`, text: `${offTeam.name} on a massive run — showing heart, fighting back!`, type: 'info', quarter });
      emergencyBoostPoss = 3;
      teamStreak = 0;
    }

    const mins = 12 - Math.floor((i / sample) * 12);
    const secs = Math.floor(Math.random() * 60);
    const time  = `${mins}:${String(secs).padStart(2, '0')}`;

    const evType: PlayByPlayEvent['type'] =
      poss.result === 'STEAL'      ? 'turnover' :
      poss.result === 'FOUL_DRAWN' ? 'foul'     :
      poss.result === 'MADE'       ? 'score'    : 'miss';

    // ── BUG 1 FIX: Assist credit on catch-and-shoot / post-feed ──────────
    // Catch-and-shoot, corner 3, kick-out 3, post feeds ALWAYS have an assist on a make.
    // Pull-up jumpers, iso shots, self-created mid-range do NOT get assists.
    const isCatchAndShootAction = poss.shotType === 'CATCH_AND_SHOOT_3';
    const isPostFeedAction      = poss.actionTaken === 'POST_UP' && made
                                    && poss.shotType !== 'PULL_UP_3'
                                    && poss.shotType !== 'MID_RANGE';
    const requiresAssist        = (isCatchAndShootAction || isPostFeedAction) && made;

    let finalPbpText: string;
    if (requiresAssist) {
      if (isCatchAndShootAction) {
        // The current handler was the PASSER; pick the shooter from the rotation.
        const shootCandidates = rotation.filter(p => p.id !== handler.id);
        let shooter = handler; // fallback if only one player
        if (shootCandidates.length > 0) {
          const sorted3 = [...shootCandidates].sort((a, b) =>
            (b.attributes.shooting3pt ?? 50) - (a.attributes.shooting3pt ?? 50));
          shooter = Math.random() < 0.55
            ? sorted3[0]
            : sorted3[Math.floor(Math.random() * Math.min(3, sorted3.length))];
        }
        const shooterLn = lastName(shooter);
        const passerLn  = lastName(handler); // handler threw the pass → earns the assist
        finalPbpText = `${shooterLn} Catch-and-Shoot 3: Made. Assist by ${passerLn}.`;
      } else {
        // Post feed: handler scored in the post, someone else fed them the ball.
        const passerCandidates = rotation.filter(p => p.id !== handler.id);
        let passerLn = '';
        if (passerCandidates.length > 0) {
          const sortedPM = [...passerCandidates].sort((a, b) =>
            (b.attributes.playmaking ?? 50) - (a.attributes.playmaking ?? 50));
          const idx = Math.random() < 0.60 ? 0 : Math.floor(Math.random() * Math.min(3, sortedPM.length));
          passerLn = lastName(sortedPM[idx]);
        }
        const handlerLn = lastName(handler);
        finalPbpText = passerLn
          ? `${handlerLn} Post Feed: Made. Assist by ${passerLn}.`
          : `${handlerLn} Post Fade: Made.`;
      }
    } else {
      // Catch-and-shoot miss: name the actual shooter clearly, no assist line.
      if (isCatchAndShootAction && !made) {
        const shootCandidates = rotation.filter(p => p.id !== handler.id);
        if (shootCandidates.length > 0) {
          const sorted3 = [...shootCandidates].sort((a, b) =>
            (b.attributes.shooting3pt ?? 50) - (a.attributes.shooting3pt ?? 50));
          const shooter = Math.random() < 0.55
            ? sorted3[0]
            : sorted3[Math.floor(Math.random() * Math.min(3, sorted3.length))];
          finalPbpText = `${lastName(shooter)} Catch-and-Shoot 3: Missed.`;
        } else {
          finalPbpText = isGarbageTime
            ? poss.pbpText.replace('— Good.', '— garbage time bucket.').replace('relentlessly', 'through the motions')
            : poss.pbpText;
        }
      } else {
        // All other shot types: use original PBP text (no assist for pull-up / iso / self-created)
        finalPbpText = isGarbageTime
          ? poss.pbpText.replace('— Good.', '— garbage time bucket.').replace('relentlessly', 'through the motions')
          : poss.pbpText;
      }
    }

    const cinematic = !isGarbageTime
      && poss.shotType !== 'CATCH_AND_SHOOT_3'
      && !requiresAssist
      ? generateCinematicLines(poss, handler, streak)
      : null;
    if (cinematic) {
      events.push({ time, text: cinematic.setup,  type: 'info',  quarter });
      events.push({ time, text: cinematic.attack, type: 'info',  quarter });
      events.push({ time, text: cinematic.result, type: evType,  quarter });
    } else {
      events.push({ time, text: finalPbpText, type: evType, quarter });
    }

    // ── BUG 2 & 3 FIX: Putback sequence — missed shot MUST precede putback ──
    // After any missed field goal: roll for offensive rebound.
    // If OReb: push the rebound event THEN the putback attempt (made or missed).
    // The rebounder and putback scorer are the same player.
    // Putback does NOT earn an assist. It IS an offensive rebound.
    if (poss.result === 'MISSED' && Math.random() < 0.12) {
      // Prefer big men (high offReb + layups); exclude the original missed shooter.
      const rebCandidates = rotation.filter(p =>
        p.id !== handler.id && (p.attributes.layups ?? 40) >= 40);
      const pool = rebCandidates.length > 0
        ? rebCandidates
        : rotation.filter(p => p.id !== handler.id);
      if (pool.length > 0) {
        const sortedReb = [...pool].sort((a, b) =>
          (b.attributes.offReb ?? 50) - (a.attributes.offReb ?? 50));
        const rebounder = Math.random() < 0.55
          ? sortedReb[0]
          : sortedReb[Math.floor(Math.random() * Math.min(3, sortedReb.length))];
        const rebLn = lastName(rebounder);

        // Step 2: Offensive Rebound event (BUG 3: counts as OReb, same possession)
        events.push({ time, text: `${rebLn} Offensive Rebound.`, type: 'info', quarter });

        // Step 3: Putback attempt — success rate = (offReb × 0.4 + layups × 0.6) / 100
        const putbackChance = (
          (rebounder.attributes.offReb ?? 50) * 0.4 +
          (rebounder.attributes.layups ?? 50) * 0.6
        ) / 100;
        const putbackMade = Math.random() < putbackChance;
        if (putbackMade) {
          // Putback Made: updates teamStreak, no assist credited
          events.push({ time, text: `${rebLn} Putback Layup: Made.`, type: 'score', quarter });
          teamStreak++;
          streakMap.set(rebounder.id, Math.max(0, streakMap.get(rebounder.id) ?? 0) + 1);
        } else {
          events.push({ time, text: `${rebLn} Putback Layup: Missed.`, type: 'miss', quarter });
        }
      }
    }

    const newStreak = streakMap.get(handler.id) ?? 0;
    if (Math.abs(newStreak) === 3) {
      const msg = newStreak > 0
        ? `${lastName(handler)} is on fire — can't miss right now!`
        : `${lastName(handler)} can't seem to buy a bucket tonight`;
      events.push({ time, text: msg, type: 'info', quarter });
    }
    if (poss.conflictFired && poss.conflictText)
      events.push({ time, text: poss.conflictText, type: 'info', quarter });
  }
  return { events, teamStreak };
};

// ─── NBA Constants (relocated, kept for reference) ───────────────────────────
// Realistic NBA Constants

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

// ─── Team Rating Calculator ───────────────────────────────────────────────────
const calculateTeamRatings = (team: Team) => {
  let roster = team.roster.slice(0, 10);
  if (team.rotation) {
    const rotIds = [...Object.values(team.rotation.starters), ...team.rotation.bench];
    roster = team.roster.filter(p => rotIds.includes(p.id));
  }
  const off = roster.reduce((acc, p) =>
    acc + (p.attributes.shooting + p.attributes.offensiveIQ + p.attributes.athleticism) / 3, 0) / roster.length;
  const def = roster.reduce((acc, p) =>
    acc + (p.attributes.defense + p.attributes.defensiveIQ + p.attributes.perimeterDef + p.attributes.interiorDef) / 4, 0) / roster.length;
  return { off, def };
};

// ─── Player Game Line (tendency-aware) ───────────────────────────────────────
const simulatePlayerGameLine = (
  player: Player,
  teamPts: number,
  teamFga: number,
  teamReb: number,
  teamAst: number,
  minutes: number,
  usageShare: number,
  varRoll = 0,               // game-level variance from tip-off roll (±15–25)
  ftBonus = 0,               // home court FT advantage (+0.03)
  opponentPerimDefMod  = 0,  // team-level 3PT defensive suppression (get3PTContestMod)
  opponentInteriorDefMod = 0, // team-level at-rim defensive suppression (getRimProtectionMod)
): GamePlayerLine => {
  const fgPctBoost = varRoll / 100 * 0.4; // variance → small FG% delta
  const tm     = computeTendencyModifiers(player);
  const minFac = minutes / 48;

  const adjUsage = Math.max(0.02, usageShare * (1 + tm.usageBoost));
  const fga      = Math.max(0, Math.round(teamFga * adjUsage * (minutes / 32)));

  // 3PA share influenced by pullUpThree tendency
  const threePaShare = Math.max(0, Math.min(0.90,
    (player.attributes.shooting3pt / 100) * 0.5 + tm.threepaBoost));
  const threepa = Math.round(fga * threePaShare);

  // Inside / mid split
  const insideShare = Math.max(0, Math.min(0.70,
    ((player.attributes.layups + player.attributes.dunks) / 2 / 100) * 0.3 + tm.insideBoost));
  const insFga  = Math.round(fga * insideShare);
  const midFga  = Math.max(0, fga - threepa - insFga);

  const fgPct3   = getThreePointPercentage(player.attributes.shooting3pt);
  const fgPctMid = player.attributes.shootingMid / 100 * 0.42 + 0.26;

  // Inside FG%: attribute-driven curve (replaces old linear blend).
  // 80% layup finishing quality + 20% dunk athleticism; weight adjusts for
  // high-dunk players who convert more drives to slams (naturally higher %).
  const layupBase   = getLayupPercentage(player.attributes.layups, player.position);
  const dunkBase    = getLayupPercentage(player.attributes.dunks,  player.position);
  const dunkWeight  = Math.min(0.35, player.attributes.dunks / 100 * 0.35);
  const fgPctIns    = layupBase * (1 - dunkWeight) + dunkBase * dunkWeight;

  const threepm = Math.min(threepa, Math.round(threepa * Math.max(0.05,
    fgPct3 + fgPctBoost + opponentPerimDefMod + (Math.random() * 0.06 - 0.03))));
  const midFgm  = Math.min(midFga,  Math.round(midFga  * Math.max(0.05,
    fgPctMid + fgPctBoost + (Math.random() * 0.06 - 0.03))));
  const insFgm  = Math.min(insFga,  Math.round(insFga  * Math.max(0.35,
    fgPctIns + fgPctBoost + opponentInteriorDefMod + (Math.random() * 0.06 - 0.03))));
  const fgm     = threepm + midFgm + insFgm;

  const fta = Math.round((player.attributes.strength / 100) * 5 * minFac + Math.random() * 2);
  const ftm = Math.round(fta * Math.min(0.98, player.attributes.freeThrow / 100 + ftBonus));
  const pts = midFgm * 2 + insFgm * 2 + threepm * 3 + ftm;

  const totalReb = Math.max(0, Math.round(teamReb * (player.attributes.rebounding / 100) * adjUsage * 2.5));
  const offReb   = Math.round(totalReb * (player.attributes.offReb / (player.attributes.offReb + player.attributes.defReb || 1)));
  const defReb   = totalReb - offReb;

  const adjAstShare = Math.max(0.01, (player.attributes.playmaking / 100) * adjUsage * 3.0 * (1 + tm.astBoost));
  const ast = Math.max(0, Math.round(teamAst * adjAstShare));

  const stl = Math.floor((player.attributes.steals / 100) * 2 * minFac * (1 + tm.stlBoost) + Math.random() * 1);
  const blk = Math.floor((player.attributes.blocks  / 100) * 2 * minFac + Math.random() * 1);
  const pf  = Math.min(6, Math.round((Math.floor(Math.random() * 4 * minFac + 1)) * (1 + tm.foulRisk)));

  return {
    playerId: player.id, name: player.name, min: minutes,
    pts, reb: totalReb, offReb, defReb, ast, stl, blk, fgm, fga,
    threepm, threepa, ftm, fta,
    tov: Math.max(0, Math.floor((100 - player.attributes.ballHandling) / 25 * minFac + Math.random() * 2)),
    plusMinus: 0, pf, techs: 0, flagrants: 0,
  };
};

// ─── Main simulateGame ────────────────────────────────────────────────────────
export const simulateGame = (
  home: Team,
  away: Team,
  date: number,
  season: number,
  homeB2B = false,
  awayB2B = false,
  rivalryLevel = 'Ice Cold',
): GameResult => {

  // ── 1. Player Variance Rolls (tip-off) ────────────────────────────────────
  const playerVariance = new Map<string, number>();
  [...home.roster, ...away.roster].forEach(p => {
    let lo = -15, hi = 15;
    if (p.personalityTraits.includes('Streaky'))      { lo = -20; hi = 25; }
    if (p.personalityTraits.includes('Professional')) { lo = -5;  hi = 8;  }
    if (p.personalityTraits.includes('Workhorse'))    { lo = 0;   hi = 12; }
    playerVariance.set(p.id, lo + Math.random() * (hi - lo));
  });

  // ── 2. Base team ratings ──────────────────────────────────────────────────
  const homeRatings = calculateTeamRatings(home);
  const awayRatings = calculateTeamRatings(away);

  const getStaffBonus = (t: Team) => { const hc = t.staff.headCoach; return hc ? (hc.ratingOffense + hc.ratingDefense) / 100 : 0; };
  const leaderBonus   = (t: Team) => t.roster.filter(p => p.personalityTraits.includes('Leader')).length  * 0.25;
  const clutchBonus   = (t: Team) => t.roster.filter(p => p.personalityTraits.includes('Clutch')).length  * 0.15;
  const lazyPenalty   = (t: Team) => t.roster.filter(p => p.personalityTraits.includes('Lazy')).length    * 0.10;

  const rotationVariance = (team: Team) => {
    const rot = team.rotation
      ? [...Object.values(team.rotation.starters), ...team.rotation.bench]
          .map(id => team.roster.find(p => p.id === id))
          .filter(Boolean) as typeof team.roster
      : team.roster.slice(0, 8);
    if (!rot.length) return 0;
    return rot.reduce((s, p) => s + (playerVariance.get(p.id) ?? 0), 0) / rot.length / 100;
  };

  // ── 3. Base PPP per team ──────────────────────────────────────────────────
  const homeBaseOff = homeRatings.off + getStaffBonus(home) + leaderBonus(home) + clutchBonus(home) - lazyPenalty(home) + rotationVariance(home);
  const awayBaseOff = awayRatings.off + getStaffBonus(away) + leaderBonus(away) + clutchBonus(away) - lazyPenalty(away) + rotationVariance(away);
  const homeDef     = awayRatings.def + getStaffBonus(away);
  const awayDef     = homeRatings.def + getStaffBonus(home);

  const calcBasePPP = (off: number, def: number, isB2B: boolean) => {
    let ppp = BASE_PPP + (off - def) / 100 * 0.5;
    if (isB2B) ppp *= 0.93;
    return ppp + (Math.random() * SCORE_VARIANCE * 2 - SCORE_VARIANCE);
  };
  const homePPP = calcBasePPP(homeBaseOff, homeDef, homeB2B);
  const awayPPP = calcBasePPP(awayBaseOff, awayDef, awayB2B);

  // ── 4. Pace / Possession Engine ───────────────────────────────────────────
  // Each team has their own pace rating (with coach badge effects).
  // Defensive Guru on the opponent applies pressure on this team's pace.
  const homeEffPace = getTeamEffectivePace(home, away, 0, false, homeB2B);
  const awayEffPace = getTeamEffectivePace(away, home, 0, false, awayB2B);
  const gamePace    = Math.round((homeEffPace + awayEffPace) / 2);

  // Total possessions per team per 48-min game, then per quarter
  const totalPoss  = paceToTotalPossessions(gamePace);
  // Q4 gets ~94% of base possessions (intentional fouling, timeouts)
  const baseQPoss: Record<number, number> = {
    1: Math.round(totalPoss / 4),
    2: Math.round(totalPoss / 4),
    3: Math.round(totalPoss / 4),
    4: Math.round(totalPoss / 4 * 0.94),
  };

  // ── 5. Quarter-by-Quarter Simulation ─────────────────────────────────────
  const homeQScores: number[]   = [];
  const awayQScores: number[]   = [];
  const quarterDetails: QuarterDetail[] = [];
  let runningHome = 0, runningAway = 0;
  let homeQStreak = 0, awayQStreak = 0;

  const pbp: PlayByPlayEvent[] = [
    { time: '12:00', text: 'Game Tip-off', type: 'info', quarter: 1 },
  ];
  const homeScheme = home.activeScheme ?? 'Balanced';
  const awayScheme = away.activeScheme ?? 'Balanced';
  const homeStreaks = new Map<string, number>();
  const awayStreaks = new Map<string, number>();

  const hasClutchCoach = (t: Team) =>
    !!(t.staff.headCoach?.badges as unknown as string[] | undefined)?.includes?.('Clutch Specialist');

  let garbageTime = false;

  for (let q = 1; q <= 4; q++) {
    const scoreDiff    = runningHome - runningAway;
    const absScoreDiff = Math.abs(scoreDiff);
    const homeTrailing = scoreDiff < 0;
    const awayTrailing = scoreDiff > 0;

    // Quarter momentum carry-over (30%) and reset
    if (q > 1) {
      homeQStreak = Math.round(homeQStreak * 0.3);
      awayQStreak = Math.round(awayQStreak * 0.3);
    }

    garbageTime = q === 4 && absScoreDiff >= 30;

    // Per-quarter possessions with ±3 random variance
    const homeQPoss = Math.max(18, baseQPoss[q] + (Math.floor(Math.random() * 7) - 3));
    const awayQPoss = Math.max(18, baseQPoss[q] + (Math.floor(Math.random() * 7) - 3));

    // Effective pace for this quarter (trailing urgency, leading milking)
    const homeQPaceScore = getTeamEffectivePace(home, away,
      homeTrailing ? absScoreDiff : -absScoreDiff, garbageTime, homeB2B);
    const awayQPaceScore = getTeamEffectivePace(away, home,
      awayTrailing ? absScoreDiff : -absScoreDiff, garbageTime, awayB2B);
    const qGamePace = Math.round((homeQPaceScore + awayQPaceScore) / 2);

    // ── Situational PPP modifiers ─────────────────────────────────────────
    let homeOff = HOME_COURT_ADV;
    let awayOff = -VISIT_TOV_PEN;

    if (absScoreDiff >= 10 && absScoreDiff < 20) {
      if (homeTrailing) homeOff += 0.040; else homeOff -= 0.030;
      if (awayTrailing) awayOff += 0.040; else awayOff -= 0.030;
    }
    if (absScoreDiff >= 20 && absScoreDiff < 30) {
      if (homeTrailing) homeOff += 0.080; else homeOff -= 0.060;
      if (awayTrailing) awayOff += 0.080; else awayOff -= 0.060;
    }
    if (absScoreDiff >= 30) {
      if (homeTrailing) homeOff += 0.060; else homeOff -= 0.070;
      if (awayTrailing) awayOff += 0.060; else awayOff -= 0.070;
    }
    if (q >= 3) {
      if (homeTrailing) homeOff += 0.030;
      if (awayTrailing) awayOff += 0.030;
    }
    homeOff += homeQStreak * 0.008;
    awayOff += awayQStreak * 0.008;

    if (q === 4 && absScoreDiff <= 5) {
      homeOff += hasClutchCoach(home) ? 0.10 : 0.05;
      awayOff += hasClutchCoach(away) ? 0.10 : 0.05;
      // Clutch Shot Taker tendency: roster-average score adjusts Q4 scoring output in close games
      const rosterSz = (t: Team) => Math.min(8, t.roster.length);
      const homeClutch = home.roster.slice(0, 8).reduce((s, p) => s + (p.tendencies?.situationalTendencies?.clutchShotTaker ?? 50), 0) / rosterSz(home);
      const awayClutch = away.roster.slice(0, 8).reduce((s, p) => s + (p.tendencies?.situationalTendencies?.clutchShotTaker ?? 50), 0) / rosterSz(away);
      homeOff += (homeClutch - 50) / 100 * 0.08;
      awayOff += (awayClutch - 50) / 100 * 0.08;
    }

    // Pace factor for score calc (garbage time reduces scoring)
    const qPaceFactor = garbageTime ? 0.80 : 1.0;

    // ── Core Quarter Score Calculation ────────────────────────────────────
    // Formula: possessions × PPP × pace_factor + small noise
    // PPP ~1.1 × ~25 possessions = ~27 pts per quarter (realistic)
    let hQScore = Math.round(homeQPoss * qPaceFactor * (homePPP + homeOff) + (Math.random() * 4 - 2));
    let aQScore = Math.round(awayQPoss * qPaceFactor * (awayPPP + awayOff) + (Math.random() * 4 - 2));

    // ── Scoring Bounds Validation ─────────────────────────────────────────
    const { lo: qLo, hi: qHi } = getQuarterScoringBounds(homeQPoss, qGamePace);
    const aBounds = getQuarterScoringBounds(awayQPoss, qGamePace);

    // Score cooldown/spark: clamp unrealistic outliers with soft correction
    if (hQScore > qHi + 5) {
      hQScore = Math.round((hQScore * 0.6 + (qHi + 5) * 0.4));
    } else if (hQScore < qLo - 5) {
      hQScore = Math.round((hQScore * 0.6 + (qLo - 5) * 0.4));
    }
    if (aQScore > aBounds.hi + 5) {
      aQScore = Math.round((aQScore * 0.6 + (aBounds.hi + 5) * 0.4));
    } else if (aQScore < aBounds.lo - 5) {
      aQScore = Math.round((aQScore * 0.6 + (aBounds.lo - 5) * 0.4));
    }

    // Hard floor/ceiling
    hQScore = Math.max(13, Math.min(52, hQScore));
    aQScore = Math.max(13, Math.min(52, aQScore));

    homeQScores.push(hQScore);
    awayQScores.push(aQScore);
    runningHome += hQScore;
    runningAway += aQScore;

    // ── Shot Clock Stats for this quarter ─────────────────────────────────
    const hClk = simulateQuarterClock(home, homeScheme, homeQPoss, garbageTime);
    const aClk = simulateQuarterClock(away, awayScheme, awayQPoss, garbageTime);

    quarterDetails.push({
      quarter: q,
      homePossessions: homeQPoss,
      awayPossessions: awayQPoss,
      homeScore:       hQScore,
      awayScore:       aQScore,
      gamePace:        qGamePace,
      avgShotClockUsed:       { home: hClk.avgClock,  away: aClk.avgClock },
      shotClockViolations:    { home: hClk.violations, away: aClk.violations },
      timeoutsUsed:           { home: hClk.timeouts,  away: aClk.timeouts },
      fastBreakPossessions:   { home: hClk.fastBreaks, away: aClk.fastBreaks },
    });

    // ── PBP Narrative Events ──────────────────────────────────────────────
    if (absScoreDiff >= 20 && q < 4) {
      const trailing = homeTrailing ? home : away;
      const cn = trailing.staff.headCoach?.name?.split(' ').at(-1) ?? 'The coach';
      pbp.push({ time: '6:00', text: `${cn} calls a timeout — trying to stop the bleeding`, type: 'info', quarter: q });
    }
    if (garbageTime) {
      pbp.push({ time: '6:00', text: `Garbage time — benches emptying in the ${home.name} vs ${away.name} matchup`, type: 'info', quarter: q });
    }
    if (q === 4 && Math.abs(runningHome - runningAway) <= 5) {
      pbp.push({ time: '4:00', text: `We have a BALL GAME! ${Math.abs(runningHome - runningAway) <= 2 ? "Anyone's game with 4 minutes left!" : 'One possession game down the stretch!'}`, type: 'info', quarter: q });
    }

    // ── BUG 4 FIX: Starters always open Q1 and Q3 ────────────────────────
    // In the NBA, starters always open the 1st and 3rd quarters regardless of
    // foul trouble or fatigue (unless 5 fouls / injured, handled by rotation setup).
    // Sub logic does not fire for the first 2 minutes of Q3.
    if (q === 1) {
      pbp.push({ time: '12:00', text: `${home.name} and ${away.name} are set — starting lineups on the floor for tip-off.`, type: 'info', quarter: 1 });
    }
    if (q === 3) {
      pbp.push({ time: '12:00', text: `${home.name} opens the second half with their starting lineup.`, type: 'info', quarter: 3 });
      pbp.push({ time: '12:00', text: `${away.name} opens the second half with their starting lineup.`, type: 'info', quarter: 3 });
    }

    const homePBPBoost = homeOff * 0.5;
    const awayPBPBoost = awayOff * 0.5;
    const hResult = generateQuarterPBP(home, away, q, homeQPoss, homeScheme, homeStreaks, homePBPBoost, garbageTime, homeQStreak);
    const aResult = generateQuarterPBP(away, home, q, awayQPoss, awayScheme, awayStreaks, awayPBPBoost, garbageTime, awayQStreak);
    homeQStreak = hResult.teamStreak;
    awayQStreak = aResult.teamStreak;

    const combined = [...hResult.events, ...aResult.events].sort((a, b) => {
      const parse = (t: string) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
      return parse(b.time) - parse(a.time);
    });
    pbp.push(...combined);

    if (q === 2) {
      pbp.push({ time: '0:00', text: `Halftime: ${home.name} ${runningHome} - ${away.name} ${runningAway}`, type: 'info', quarter: 2 });
    }
  }

  // ── 6. Validation Flags ───────────────────────────────────────────────────
  const combined = runningHome + runningAway;
  if (combined > 280) {
    // Unrealistically high: soft clamp both quarterly totals by pulling each down
    const factor = 280 / combined;
    runningHome = Math.round(runningHome * factor);
    runningAway = Math.round(runningAway * factor);
  } else if (combined < 150) {
    const factor = 150 / combined;
    runningHome = Math.round(runningHome * factor);
    runningAway = Math.round(runningAway * factor);
  }

  let totalHome = Math.max(85, Math.min(145, runningHome));
  let totalAway = Math.max(85, Math.min(145, runningAway));

  // ── 7. Player stat distribution ──────────────────────────────────────────
  const statPace = totalPoss; // use actual total possessions for FGA/REB scaling
  const distributeToPlayers = (team: Team, totalPts: number, isHome: boolean, isGT: boolean) => {
    const roster      = team.roster;
    const totalRating = roster.reduce((acc, p) => acc + p.rating, 0);
    const teamFga     = Math.round(statPace * 0.88);
    const teamReb     = Math.round(statPace * 0.44);
    const teamAst     = Math.round((totalPts / 2.2) * 0.6);

    // Opponent defensive averages — computed once per team, applied to every player's box score.
    // Uses top-8 rotation players as the sample (starters + primary bench).
    const oppRoster      = isHome ? away.roster : home.roster;
    const oppTopN        = oppRoster.slice(0, 8);
    const oppCount       = Math.max(1, oppTopN.length);

    // 3PT suppression: avg perimDef 75 → ~−1.5 %  |  85 → ~−2.1 %  |  25 → ~+0.7 %
    const oppAvgPerimDef   = oppTopN.reduce((s, op) => s + (op.attributes.perimeterDef ?? 50), 0) / oppCount;
    const oppPerimDefMod   = get3PTContestMod(oppAvgPerimDef, 'TEAM_BOX_SCORE');

    // At-rim suppression: avg interiorDef 80 → ~−3.6 %  |  85 → ~−4.2 %  |  20 → ~+1.4 %
    const oppAvgInteriorDef    = oppTopN.reduce((s, op) => s + (op.attributes.interiorDef ?? 50), 0) / oppCount;
    const oppInteriorDefMod    = getRimProtectionMod(oppAvgInteriorDef, 'TEAM_BOX_SCORE');

    return roster.map((p, i) => {
      let mins = 0;
      if (team.rotation && team.rotation.minutes[p.id] !== undefined) {
        mins = team.rotation.minutes[p.id];
      } else {
        if (i < 5) mins = 30 + Math.floor(Math.random() * 8);
        else if (i < 9) mins = 14 + Math.floor(Math.random() * 10);
        else if (i < 12) mins = Math.floor(Math.random() * 6);
      }
      if (isGT) {
        if (i < 5) mins = Math.max(20, mins - 10);
        else if (i < 9) mins = Math.min(30, mins + 8);
      }
      const ftBonus    = isHome ? 0.03 : 0;
      const varRoll    = playerVariance.get(p.id) ?? 0;
      const usageShare = p.rating / totalRating;
      const line = simulatePlayerGameLine(p, totalPts, teamFga, teamReb, teamAst, mins, usageShare, varRoll, ftBonus, oppPerimDefMod, oppInteriorDefMod);
      return { ...line, techs: 0, flagrants: 0, ejected: false };
    });
  };

  let homePlayerStats = distributeToPlayers(home, totalHome, true,  garbageTime);
  let awayPlayerStats = distributeToPlayers(away, totalAway, false, garbageTime);

  totalHome = homePlayerStats.reduce((s, p) => s + p.pts, 0);
  totalAway = awayPlayerStats.reduce((s, p) => s + p.pts, 0);

  // ── 8. Chippy / tech rolls ────────────────────────────────────────────────
  let isChippy = false;
  const rivalryMod = ['Hot', 'Red Hot'].includes(rivalryLevel) ? 1.5 : 1.0;
  const rollForChippy = (stats: GamePlayerLine[], isHome: boolean) => {
    stats.forEach(p => {
      const player = (isHome ? home : away).roster.find(pl => pl.id === p.playerId)!;
      let techChance = 0.02 * rivalryMod;
      if (player?.personalityTraits.includes('Diva/Star'))    techChance *= 1.8;
      if (player?.personalityTraits.includes('Tough/Alpha'))  techChance *= 1.4;
      if (player?.personalityTraits.includes('Professional')) techChance *= 0.5;
      if (player?.personalityTraits.includes('Leader'))       techChance *= 0.7;
      if (Math.random() < techChance) {
        p.techs += 1; isChippy = true;
        pbp.push({ time: `${Math.floor(Math.random() * 12)}:00`, quarter: Math.floor(Math.random() * 4) + 1, text: `${p.name} picks up a technical — bench reacts!`, type: 'foul' });
        if (isHome) totalAway += 1; else totalHome += 1;
      }
    });
  };
  rollForChippy(homePlayerStats, true);
  rollForChippy(awayPlayerStats, false);

  // ── 9. Injury rolls ──────────────────────────────────────────────────────
  const gameInjuries: Array<{ playerId: string; playerName: string; injuryType: InjuryType; daysOut: number; teamId: string }> = [];
  const rollForInjuries = (stats: GamePlayerLine[], isHome: boolean) => {
    const tm    = isHome ? home : away;
    const isB2B = isHome ? homeB2B : awayB2B;
    const trainerRating = tm.staff.trainer?.ratingDevelopment ?? 0;
    stats.forEach(p => {
      if (p.min < 5) return;
      const player = tm.roster.find(pl => pl.id === p.playerId);
      if (!player || player.status === 'Injured') return;
      let chance = 0.004;
      if (p.min > 35) chance *= 1.5;
      if (isB2B)      chance *= 1.3;
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

  // ── 10. Overtime (up to 3 OT periods) ────────────────────────────────────
  let isOvertime = false;
  let otPeriod   = 0;

  while (totalHome === totalAway && otPeriod < 3) {
    isOvertime = true;
    otPeriod++;
    const otLabel = otPeriod === 1 ? 'OVERTIME!' : `${otPeriod}OT!`;
    pbp.push({ time: '5:00', text: otLabel, type: 'info', quarter: 4 + otPeriod });

    // 8-10 possessions per team per OT period; urgency boosts scoring slightly
    const otPoss  = 8 + Math.floor(Math.random() * 3);
    const otBoost = 0.05; // PPP lift from urgency
    const otH = Math.max(6, Math.round(otPoss * (homePPP + HOME_COURT_ADV + otBoost)));
    const otA = Math.max(6, Math.round(otPoss * (awayPPP + otBoost)));

    totalHome += otH;
    totalAway += otA;

    // Force a winner in 3rd OT if still tied
    if (otPeriod === 3 && totalHome === totalAway) {
      // Higher overall OVR wins the final possession
      const hOvr = homeRatings.off + homeRatings.def;
      const aOvr = awayRatings.off + awayRatings.def;
      if (hOvr >= aOvr) totalHome += 1; else totalAway += 1;
    }

    quarterDetails.push({
      quarter: 4 + otPeriod,
      homePossessions: otPoss,
      awayPossessions: otPoss,
      homeScore: otH,
      awayScore: otA,
      gamePace: gamePace + 5,
      avgShotClockUsed:      { home: 10, away: 10 },
      shotClockViolations:   { home: 0, away: 0 },
      timeoutsUsed:          { home: 1, away: 1 },
      fastBreakPossessions:  { home: 1, away: 1 },
      overtimeFlag: true,
    });
  }

  // ── 11. Final flags ───────────────────────────────────────────────────────
  const isBuzzerBeater = Math.abs(totalHome - totalAway) <= 2 && Math.random() < 0.3;
  const isComeback =
    (homeQScores[0] + homeQScores[1] < awayQScores[0] + awayQScores[1] - 15 && totalHome > totalAway) ||
    (awayQScores[0] + awayQScores[1] < homeQScores[0] + homeQScores[1] - 15 && totalAway > totalHome);

  if (isBuzzerBeater) pbp.push({ time: '0:01', text: 'BUZZER BEATER! The crowd erupts!', type: 'score', quarter: 4 });
  pbp.push({ time: '0:00', text: 'Final Buzzer', type: 'info', quarter: 4 });

  const margin = totalHome - totalAway;
  homePlayerStats = homePlayerStats.map(p => ({ ...p, plusMinus: margin }));
  awayPlayerStats = awayPlayerStats.map(p => ({ ...p, plusMinus: -margin }));

  // ── Simulation Symmetry Check (dev console only — never affects sim math) ──
  // Logs a warning if one team's FG% is 8%+ better than the opponent in this game.
  (() => {
    const avgFgPct = (stats: typeof homePlayerStats) => {
      const fga = stats.reduce((s, p) => s + (p.fga ?? 0), 0);
      const fgm = stats.reduce((s, p) => s + (p.fgm ?? 0), 0);
      return fga > 0 ? fgm / fga : 0;
    };
    const hFg = avgFgPct(homePlayerStats);
    const aFg = avgFgPct(awayPlayerStats);
    const diff = Math.abs(hFg - aFg);
    if (diff >= 0.08) {
      console.warn(
        `[SIM SYMMETRY CHECK] ${home.name} FG%: ${(hFg * 100).toFixed(1)}% | ` +
        `${away.name} FG%: ${(aFg * 100).toFixed(1)}% | ` +
        `Diff: ${(diff * 100).toFixed(1)}% >= 8% threshold | ` +
        `Score: ${totalHome}-${totalAway} | POSSIBLE SIMULATION BIAS DETECTED`
      );
    }
  })();

  const allLines = [...homePlayerStats, ...awayPlayerStats].sort((a, b) => b.pts - a.pts);

  return {
    id: `game-${date}-${home.id}-${away.id}`,
    homeTeamId:   home.id,
    awayTeamId:   away.id,
    homeScore:    totalHome,
    awayScore:    totalAway,
    quarterScores: { home: homeQScores, away: awayQScores },
    quarterDetails,
    homePlayerStats,
    awayPlayerStats,
    topPerformers: allLines.slice(0, 3).map(l => ({ playerId: l.playerId, points: l.pts, rebounds: l.reb, assists: l.ast })),
    playByPlay: pbp,
    date, season, isOvertime, isBuzzerBeater, isComeback, isChippy, gameInjuries,
  };
};


