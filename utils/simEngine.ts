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

// ─── Rebound Chance Functions ────────────────────────────────────────────────
/**
 * Maps an offRebounding attribute (0–100) to an individual ORB% chance
 * per rebound opportunity (decimal).
 *
 * Calibrated to 2025-26 NBA data:
 *   • League avg individual ORB% ≈ 8-13 % (big men 10-20 %, guards 3-8 %)
 *   • Elite crashers (Robinson, Drummond): 20-25 %+
 *   • Team ORB% ~29-31 % emerges naturally when five players compete
 *
 * Piecewise-linear breakpoints (easy to tune independently):
 *   attr  │  C/PF   │  SF    │  PG/SG
 *   ──────┼─────────┼────────┼────────
 *    50   │   8.0 % │  6.0 % │   4.0 %
 *    65   │  13.0 % │ 11.0 % │   9.0 %
 *    80   │  18.0 % │ 16.0 % │  14.0 %
 *    94   │  24.0 % │ 22.0 % │  20.0 %
 *   100   │  28.0 % │ 26.0 % │  24.0 %
 *
 * Tuning guide:
 *   • Raise segment endpoints to inflate ORB league-wide.
 *   • Shift the positional bonus/penalty (±0.03 / ±0.02) to widen or narrow
 *     the C vs. guard gap.
 *   • Hard clamp [0.03, 0.28] is a last-resort safety net.
 */
export function getOffReboundChance(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 60) {
    // Poor crashers: 4 % at 0 → 9 % at 60
    base = 0.04 + (a / 60) * 0.05;
  } else if (a <= 80) {
    // Solid to plus: 9 % at 60 → 15 % at 80
    base = 0.09 + ((a - 60) / 20) * 0.06;
  } else if (a <= 94) {
    // Elite: 15 % at 80 → 21 % at 94
    base = 0.15 + ((a - 80) / 14) * 0.06;
  } else {
    // Rodman/Drummond peaks: 21 % at 95 → 25 % at 100
    base = 0.21 + ((a - 95) / 5) * 0.04;
  }

  // Positional modifier: size = natural board advantage
  if (position === 'C' || position === 'PF') base += 0.03;
  else if (position === 'PG' || position === 'SG') base -= 0.02;

  return Math.max(0.03, Math.min(0.28, base));
}

/**
 * Maps a defRebounding attribute (0–100) to an individual DRB% chance
 * per rebound opportunity (decimal).
 *
 * Calibrated to 2025-26 NBA data:
 *   • League avg team DRB% ≈ 74-77 %
 *   • Elite anchors (Gobert, Turner): 28-33 % individual DRB%
 *   • Guards: typically 8-14 % individual DRB%
 *
 * Piecewise-linear breakpoints (easy to tune independently):
 *   attr  │  C/PF   │  SF    │  PG/SG
 *   ──────┼─────────┼────────┼────────
 *    50   │  17.0 % │ 13.0 % │  10.0 %
 *    65   │  22.0 % │ 18.0 % │  15.0 %
 *    80   │  27.0 % │ 23.0 % │  20.0 %
 *    94   │  32.0 % │ 28.0 % │  25.0 %
 *   100   │  37.0 % │ 33.0 % │  30.0 %
 */
export function getDefReboundChance(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 60) {
    // Weak box-out: 10 % at 0 → 16 % at 60
    base = 0.10 + (a / 60) * 0.06;
  } else if (a <= 80) {
    // Average to solid: 16 % at 60 → 23 % at 80
    base = 0.16 + ((a - 60) / 20) * 0.07;
  } else if (a <= 94) {
    // Plus to elite: 23 % at 80 → 29 % at 94
    base = 0.23 + ((a - 80) / 14) * 0.06;
  } else {
    // Dominant anchors: 29 % at 95 → 33 % at 100
    base = 0.29 + ((a - 95) / 5) * 0.04;
  }

  // Positional modifier
  if (position === 'C' || position === 'PF') base += 0.04;
  else if (position === 'PG' || position === 'SG') base -= 0.03;

  return Math.max(0.08, Math.min(0.38, base));
}

/**
 * Computes the probability that THIS offensive team secures a rebound
 * on a given miss (team ORB%), by aggregating individual player chances.
 *
 * Each player independently "contests" the rebound; the team wins it if
 * any one of them does. We use a soft-sum (not independent-event product)
 * to stay in realistic range when 5 strong rebounders are on the floor.
 *
 *   teamOrbChance = clamp(Σ playerOrbChance × DECAY_FACTOR, 0.20, 0.38)
 *
 * DECAY_FACTOR = 0.55 → a squad of five attr-75 players (each ~12 %)
 *   yields 5 × 0.12 × 0.55 ≈ 0.33  → league-avg ~29-33 %. ✓
 */
export function getTeamOrbChance(
  rotation: Array<{ attributes: { offReb: number }; position?: string }>,
): number {
  const DECAY = 0.55;
  const sum = rotation.reduce(
    (acc, p) => acc + getOffReboundChance(p.attributes.offReb, p.position),
    0,
  );
  return Math.max(0.20, Math.min(0.38, sum * DECAY));
}

// ─── Turnover % & Assist Efficiency Functions ────────────────────────────────
/**
 * Maps ball handling, passing, and offensive IQ to expected TO% per possession.
 *
 * Calibrated to 2025-26 NBA: league avg TO% ≈ 12-13 %.
 *   • Elite handlers (BH 90+): 8-10 %
 *   • Avg creator   (BH 70-79): 11-14 %
 *   • Poor handler  (BH < 60):  15-20 %+
 *
 * Piecewise-linear breakpoints (tune each band independently):
 *   BH    │ base TO% │ + PG  │ + C/PF │ notes
 *   ──────┼──────────┼───────┼────────┼──────────────────────────────
 *     0   │  20.0 %  │+1.5 % │ -1.0 % │ never handles the ball
 *    60   │  15.0 %  │       │        │
 *    74   │  12.2 %  │       │        │ ← league-avg ball handler
 *    80   │  11.0 %  │       │        │
 *    94   │   8.0 %  │       │        │
 *   100   │   7.0 %  │       │        │ historic ball security
 *
 * Passing modifier:
 *   passing >> ballHandling → overambitious (+up to 2 %)
 *   balanced (Δ ≤ 10) → slight benefit (−0.5 %)
 *   conservative big → near-neutral
 *
 * Off IQ: centered at 70; each ±10 IQ shifts TO% by ±0.25 %.
 * Stamina: low-stamina players (<60) add up to +2.5 % late-game fatigue risk.
 *
 * Tuning guide:
 *   • Shift segment floors (0.20, 0.15, 0.11, 0.08, 0.07) to move curve globally.
 *   • Adjust passMod cap (0.02 / −0.005) to widen/narrow the overambitious risk.
 *   • Positional deltas (±0.015 / ±0.010) control PG vs. C gap.
 */
export function getTurnoverPercentage(
  ballHandling: number,
  passing:      number,
  offIQ:        number,
  position?:    string,
  stamina?:     number,
): number {
  const bh = Math.max(0, Math.min(100, ballHandling));

  // ── Primary driver: ball handling (inverse — better BH = lower TO%) ───────
  let base: number;
  if (bh <= 60) {
    // Sloppy: 20 % at 0 → 15 % at 60
    base = 0.20 - (bh / 60) * 0.05;
  } else if (bh <= 80) {
    // Average: 15 % at 60 → 11 % at 80
    base = 0.15 - ((bh - 60) / 20) * 0.04;
  } else if (bh <= 94) {
    // Plus → elite: 11 % at 80 → 8 % at 94
    base = 0.11 - ((bh - 80) / 14) * 0.03;
  } else {
    // God-tier: 8 % at 95 → 7 % at 100
    base = 0.08 - ((bh - 95) / 5) * 0.01;
  }

  // ── Passing: vision vs. ball-security balance ─────────────────────────────
  // If passing >> ballHandling the player sees reads they can't execute safely.
  // If balanced, sharper vision slightly protects the ball.
  const passDelta = passing - bh;
  let passMod: number;
  if (passDelta > 10) {
    // Overambitious: ramps +0→2 % as the gap widens past 10 pts
    passMod = Math.min(0.02, (passDelta - 10) / 100 * 0.03);
  } else if (passDelta >= -10) {
    // Balanced creator: reads + handles working together
    passMod = -0.005;
  } else {
    // Conservative big: keeps it simple, marginal positive
    passMod = Math.min(0.005, (-passDelta - 10) / 100 * 0.01);
  }
  base += passMod;

  // ── Off IQ: decision quality — cleans up bad reads and risky passes ───────
  // Neutral at offIQ=70; shifts ±0.75 % per 30-pt IQ swing.
  base += -(offIQ - 70) / 100 * 0.025;

  // ── Positional pressure: PGs carry under sustained guard pressure ──────────
  if (position === 'PG') base += 0.015;
  else if (position === 'C' || position === 'PF') base -= 0.010;

  // ── Fatigue: low-stamina players lose ball security late in games ─────────
  if (stamina !== undefined) {
    base += Math.max(0, (60 - stamina) / 100 * 0.025);
  }

  return Math.max(0.06, Math.min(0.22, base));
}

/**
 * Returns an AST-efficiency multiplier that replaces raw (playmaking/100) in
 * the adjAstShare formula, blending passing vision + playmaking court command.
 *
 * Penalises high-TO% passers: a player who forces turnovers on 17 %+ of
 * possessions converts fewer potential assists (risky threading = more broken
 * plays, fewer scoring reads completed).
 *
 * Output is a multiplier on [0.20, 1.05]:
 *   Elite playmaker (pass=90, pm=88, iq=85, toRate=0.09)  → ~0.89
 *   Avg creator     (pass=75, pm=72, iq=70, toRate=0.13)  → ~0.73
 *   Poor passer     (pass=55, pm=50, iq=60, toRate=0.17)  → ~0.48
 *
 * Tuning:
 *   • Blend weights (0.55 pass / 0.45 playmaking) — shift toward passing for
 *     pure distributors, toward playmaking for self-created shot creators.
 *   • iqBonus scale (0.03) and toPenalty ramp (0.08 over toRate 13→20 %)
 *     control how much IQ and ball security matter independently.
 */
export function getAssistEfficiency(
  passing:    number,
  playmaking: number,
  offIQ:      number,
  toRate:     number,
): number {
  // Passing vision (55 %) + playmaking court command (45 %)
  const blend    = (passing * 0.55 + playmaking * 0.45) / 100;
  // Sharp readers convert more potential assists than they waste
  const iqBonus  = (offIQ - 70) / 100 * 0.03;
  // High-TO passers force broken plays: penalty ramps 0→8 % as toRate > 13 %
  const toPenalty = Math.max(0, Math.min(0.08, (toRate - 0.13) / 0.07 * 0.08));

  return Math.max(0.20, Math.min(1.05, blend + iqBonus - toPenalty));
}

// ─── Steal & Block Chance Functions ──────────────────────────────────────────
/**
 * Maps a Steals attribute (0–100) to an individual steal % per ball-handler
 * action (dribble, iso, pass read).
 *
 * Calibrated to 2025-26 NBA:
 *   • League avg team STL ≈ 8.5-9.0 / game
 *   • Elite thieves (Wallace, Maxey): 1.8-2.2 SPG at attr 90-95
 *   • Average guard: 1.0-1.2 SPG at attr 65-75
 *   • Big men: 0.4-0.7 SPG at attr 45-60
 *
 * Piecewise-linear breakpoints (tune each band independently):
 *   attr  │ base %  │ + PG/SG │ + C
 *   ──────┼─────────┼─────────┼──────
 *    50   │  1.48 % │  1.98 % │ 1.18 %
 *    70   │  2.00 % │  2.50 % │ 1.70 %
 *    84   │  2.80 % │  3.30 % │ 2.50 %
 *    88   │  3.00 % │  3.50 % │ 2.70 %
 *    95   │  3.75 % │  4.25 % │ 3.45 %
 *   100   │  4.50 % │  5.00 % │ 4.20 %
 *
 * Tuning: STL_OPP_SCALE in simulatePlayerGameLine (default 65) controls the
 * number of steal opportunities per 48 min; raise/lower it to shift team totals.
 */
export function getStealChance(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  // ── Primary: Steals attribute (higher = better pickpocket) ───────────────
  let base: number;
  if (a <= 60) {
    // Rare disruptors: 0.8 % at 0 → 1.5 % at 60
    base = 0.008 + (a / 60) * 0.007;
  } else if (a <= 80) {
    // Solid to plus: 1.5 % at 60 → 2.5 % at 80
    base = 0.015 + ((a - 60) / 20) * 0.010;
  } else if (a <= 94) {
    // Elite: 2.5 % at 80 → 3.5 % at 94
    base = 0.025 + ((a - 80) / 14) * 0.010;
  } else {
    // God-tier thief: 3.5 % at 95 → 4.5 % at 100
    base = 0.035 + ((a - 95) / 5) * 0.010;
  }

  // ── Positional modifier: guards read passing lanes; bigs give up angles ──
  if (position === 'PG' || position === 'SG') base += 0.005;
  else if (position === 'C') base -= 0.003;

  return Math.max(0.005, Math.min(0.050, base));
}

/**
 * Maps a Blocks attribute (0–100) to an individual block % per contestable
 * shot attempt (rim, close-range, short post).
 *
 * Calibrated to 2025-26 NBA:
 *   • League avg team BLK ≈ 5.0 / game
 *   • Elite rim protectors (Turner, Gobert): 1.6-2.2 BPG at attr 85-92
 *   • Wemby-level peaks (attr 95+): 2.5-3.0 BPG over full season
 *   • Guard/wing baseline: 0.2-0.5 BPG
 *
 * Piecewise-linear breakpoints (tune each band independently):
 *   attr  │ base %  │ + C/PF  │ + PG/SG
 *   ──────┼─────────┼─────────┼────────
 *    50   │  1.83 % │  3.33 % │  0.83 %
 *    70   │  3.50 % │  5.00 % │  2.50 %
 *    84   │  5.50 % │  7.00 % │  4.50 %
 *    88   │  6.00 % │  7.50 % │  5.00 %
 *    95   │  8.25 % │  9.75 % │  7.25 %
 *   100   │  9.00 % │ 10.00 % │  8.00 %
 *
 * Tuning: BLK_OPP_SCALE in simulatePlayerGameLine (default 50) controls the
 * number of block opportunities per 48 min; raise/lower to shift team totals.
 */
export function getBlockChance(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  // ── Primary: Blocks attribute ────────────────────────────────────────────
  let base: number;
  if (a <= 60) {
    // Minimal rim protection: 1 % at 0 → 2 % at 60
    base = 0.010 + (a / 60) * 0.010;
  } else if (a <= 80) {
    // Solid to plus shot-blocker: 2 % at 60 → 4 % at 80
    base = 0.020 + ((a - 60) / 20) * 0.020;
  } else if (a <= 94) {
    // Elite: 4 % at 80 → 7 % at 94
    base = 0.040 + ((a - 80) / 14) * 0.030;
  } else {
    // Wemby tier: 7 % at 95 → 9 % at 100
    base = 0.070 + ((a - 95) / 5) * 0.020;
  }

  // ── Positional modifier: length + rim-reading advantage for bigs ─────────
  if (position === 'C' || position === 'PF') base += 0.015;
  else if (position === 'PG' || position === 'SG') base -= 0.010;

  return Math.max(0.005, Math.min(0.100, base));
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

// ─── Mid-Range Percentage ─────────────────────────────────────────────────────
/**
 * Maps a player's shootingMid attribute (0–100) to a base mid-range FG%
 * (pull-up jumpers, step-backs, elbow fades, floaters — roughly 10–19 ft).
 * Calibrated to 2025-26 NBA mid-range data:
 *   • League avg mid-range FG% ≈ 43–45 % (fewer attempts; heavily contested).
 *   • Elite pull-up kings (Shai 53.2 %, KD 49.7 %): captured at top attr bands.
 *   • Below-avg starters (attr 60–69): 40–43 % — still playable in certain spots.
 *   • Non-shooters (attr < 60): 35–40 % — bricks under pressure.
 *
 * Piecewise curve (base before position/synergy adjustments):
 *   0–59  → 35–40 %  (no mid-range game; forced shots)
 *   60–69 → 40–43 %  (below-avg; occasional pull-up)
 *   70–79 → 43–46 %  (league-avg to solid; reliable pull-up game)
 *   80–89 → 46–49 %  (plus threat; iso/elbow staple)
 *   90–94 → 49–51 %  (elite: prime Melo / KD tier)
 *   95–100→ 51–54 %  (god-tier: step-back wizard, unguardable)
 *
 * Positional adjustment:
 *   PG / SG / SF → +1.0 %  (natural off-dribble creation advantage)
 *   C  / PF      → −1.5 %  (slower release; harder to get full separation)
 *
 * Offensive synergy bonus (applied last, capped at +2.5 %):
 *   High offensiveIQ creates better looks (pump-fake reads, timing).
 *   High ballHandling improves pull-up creation and separation quality.
 *   Formula: ((offIQ − 50) + (ballHandling − 50)) / 200 × 0.05
 *   e.g. offIQ=85, ballHandling=80: bonus ≈ +1.75 %
 *   e.g. offIQ=50, ballHandling=50: bonus = 0 (no change to average players)
 *
 * Hard clamp: [0.32, 0.56] — floor prevents sim absurdities;
 *             ceiling prevents unrealistic >56 % on "unguardable" shots.
 *
 * Calibration target: unweighted sim avg should land ~43–45 % before defensive
 * modifiers.  getMidRangeContestMod then applies the contest-level penalty.
 *
 * Output table (base + C/PF position, no synergy):
 *   attr  50 → 37.9 %  │  vs avg contest (perimDef 50) → 37.9 %  │  vs elite (85) → 33.1 %
 *   attr  65 → 41.5 %  │  vs avg contest → 41.5 %                │  vs elite → 36.7 %
 *   attr  77 → 44.8 %  │  vs avg contest → 44.8 %                │  vs elite → 40.0 %
 *   attr  85 → 47.0 %  │  vs avg contest → 47.0 %                │  vs elite → 42.2 %
 *   attr  95 → 50.5 %  │  vs avg contest → 50.5 %                │  vs elite → 45.7 %
 *   attr 100 → 53.0 %  │  vs avg contest → 53.0 %                │  vs elite → 48.2 %
 *   (elite-D = getMidRangeContestMod PULL_UP_MID down=0.060 × normalized(85)=0.70 ≈ −4.8 %)
 *
 * Tunables:
 *   • Shift segment endpoints to raise/lower the league-wide avg.
 *   • Adjust positionalTweak to widen/narrow the big-vs-guard gap.
 *   • Adjust synergyScale to make IQ/handling more/less impactful.
 *   • Target: sim mid-range avg ~43–45 %; top-D teams hold to ~40–42 %;
 *     poor-D teams give up ~47 %+.
 */
export function getMidRangePercentage(
  attr: number,
  position?: string,
  offensiveIQ?: number,
  ballHandling?: number,
): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 59) {
    // Non-shooter / forced: 35 % at 0 → 40 % at 59  (slow ramp)
    base = 0.35 + (a / 59) * 0.05;
  } else if (a <= 69) {
    // Below-avg: 40 % at 60 → 43 % at 69
    base = 0.40 + ((a - 60) / 9) * 0.03;
  } else if (a <= 79) {
    // League-avg to solid: 43 % at 70 → 46 % at 79
    base = 0.43 + ((a - 70) / 9) * 0.03;
  } else if (a <= 89) {
    // Plus mid-range threat: 46 % at 80 → 49 % at 89
    base = 0.46 + ((a - 80) / 9) * 0.03;
  } else if (a <= 94) {
    // Elite: 49 % at 90 → 51 % at 94  (diminishing returns kick in)
    base = 0.49 + ((a - 90) / 4) * 0.02;
  } else {
    // God-tier: 51 % at 95 → 54 % at 100  (Shai / KD step-back wizardry)
    base = 0.51 + ((a - 95) / 5) * 0.03;
  }

  // Positional: guards/wings generate better separation off the dribble;
  // bigs have slower release and face more help-side contests.
  const positionalTweak =
    position === 'PG' || position === 'SG' || position === 'SF' ? +0.010 :
    position === 'C'  || position === 'PF'                      ? -0.015 :
    0;

  // Offensive synergy: high IQ + ball-handling creates better looks.
  // Each attribute point above 50 contributes a small additive bonus.
  // Combined cap of +2.5 % prevents stacking from becoming OP.
  const iqBonus = offensiveIQ  !== undefined ? (offensiveIQ  - 50) / 200 * 0.05 : 0;
  const bhBonus = ballHandling !== undefined ? (ballHandling - 50) / 200 * 0.05 : 0;
  const synergyBonus = Math.min(0.025, Math.max(-0.010, iqBonus + bhBonus));

  return Math.max(0.32, Math.min(0.56, base + positionalTweak + synergyBonus));
}

// ─── Mid-Range Contest Modifier ───────────────────────────────────────────────
/**
 * Maps a defender's perimeterDef attribute (0–100) to a per-possession
 * additive mid-range modifier, parallel in structure to get3PTContestMod.
 *
 * Mid-range shots are contested differently than 3s:
 *   • Closeouts are shorter (defender is already in the paint); contest speed
 *     matters more than raw length — hence the asymmetry toward pull-up shots.
 *   • ISO/step-back mid-range is self-created; defender can't fully take away
 *     a clean look from an elite shot-creator (smaller down range for PULL_UP_MID).
 *   • ELBOW_FADE: catch-and-face-up at the elbow — easiest to contest fully.
 *   • TEAM_BOX_SCORE: per-game average over many possessions.
 *
 * Average defender (attr ≈ 50) → 0 adjustment.
 * Design is asymmetric: elite defense suppresses more than poor defense rewards
 * (poor defenders still close out eventually; elite ones contest cleanly every time).
 *
 * Output table:
 *   perimDef │ PULL_UP_MID │ ELBOW_FADE │ Team BS
 *   ─────────┼─────────────┼────────────┼────────
 *     20     │  +2.2 %     │  +2.8 %    │  +1.2 %
 *     35     │  +1.3 %     │  +1.7 %    │  +0.7 %
 *     50     │   0.0 %     │   0.0 %    │   0.0 %
 *     65     │  −2.1 %     │  −2.7 %    │  −1.2 %
 *     75     │  −3.5 %     │  −4.5 %    │  −2.0 %
 *     85     │  −4.9 %     │  −6.3 %    │  −2.8 %
 *     95     │  −6.3 %     │  −8.1 %    │  −3.6 %
 *    100     │  −7.0 %     │  −9.0 %    │  −4.0 %
 *
 * Team-level impact (TEAM_BOX_SCORE, avg top-8 roster):
 *   avg perimDef 75 → ~−2.0 % → strong D team holds opponents to ~41–43 %
 *   avg perimDef 85 → ~−2.8 % → elite: ~40–42 % opponent mid-range FG%
 *   avg perimDef 25 → ~+0.9 % → porous: opponents feast, ~45–47 %
 *
 * Tunables: adjust `down` / `up` per context to widen or narrow suppression bands.
 */
export type MidRangeContext = 'PULL_UP_MID' | 'ELBOW_FADE' | 'TEAM_BOX_SCORE_MID';

export function getMidRangeContestMod(
  perimDefAttr: number,
  context: MidRangeContext = 'PULL_UP_MID',
): number {
  const attr       = Math.max(0, Math.min(100, perimDefAttr));
  const normalized = (attr - 50) / 50; // −1 (worst) … 0 (avg) … +1 (best)

  const RANGES: Record<MidRangeContext, { down: number; up: number }> = {
    // Pull-up iso / step-back: self-created, harder to fully contest
    PULL_UP_MID:          { down: 0.070, up: 0.022 },
    // Elbow face-up / catch-and-shoot mid: defender is closer; easier to get a hand up
    ELBOW_FADE:           { down: 0.090, up: 0.028 },
    // Per-game team average — smoothed across many possessions
    TEAM_BOX_SCORE_MID:   { down: 0.040, up: 0.012 },
  };

  const { down, up } = RANGES[context];
  return normalized >= 0
    ? -normalized * down   // elite D: 0 → −down
    : -normalized * up;    // poor D:  0 → +up
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

// ─── Dunk Percentage ──────────────────────────────────────────────────────────
/**
 * Maps a player's Dunks attribute (0–100) to a base uncontested slam-dunk FG%.
 * Calibrated to 2025-26 NBA data: tracked dunks succeed at ~93% league-wide
 * (higher than at-rim average because dunks are pre-selected high-% attempts).
 *
 * Piecewise curve (base, before position/synergy adjustments):
 *   0–50  → 80–86 %  (can dunk but awkward/timid; low-attribute guys miss more)
 *   51–69 → 86–90 %  (decent athlete, but rim protection hurts heavily)
 *   70–79 → 90–93 %  (solid pro-level — routine slams on straight drives)
 *   80–89 → 93–95.5 %(plus dunker, hammers it home with authority)
 *   90–94 → 95.5–96.5%(elite: Zion / KD / LeBron tier — almost automatic)
 *   95–100→ 96.5–98 % (god-mode: Shaq/Giannis/Wemby — unstoppable at the rim)
 *
 * Positional tweaks (applied on top):
 *   C / PF  → +1.5 %  (leverage, length, and direct path to the rim)
 *   PG / SG → −1.0 %  (face more active rim protection rotations)
 *   SF      → neutral
 *
 * Jumping synergy bonus:
 *   If (dunks + jumping) > 180, the player has rare explosive finishing ability.
 *   Bonus scales linearly from 0 % at 180 → +1.5 % at 220+.
 *   Captures combinations like 90-dunk / 95-jump that produce poster-dunk athletes.
 *
 * Hard clamp: [0.75, 0.99] — even the worst dunkers make most uncontested slams;
 *                             defense (getRimProtectionMod SLAM_DUNK context) then
 *                             applies an additive penalty on top.
 *
 * Calibration target: unweighted league avg should land ~92–93 % (dunks are
 * pre-selected high-% plays; defense brings the effective sim average down toward
 * the real-world 93% figure when applied through the full possession pipeline).
 *
 * Output table (base before position/synergy):
 *   attr  50 → ~83.0 %  |  vs avg-D (interiorDef 50) → ~83.0 %  |  vs elite-D (90) → ~65 %
 *   attr  65 → ~88.2 %  |  vs avg-D → ~88.2 %                   |  vs elite-D → ~70 %
 *   attr  75 → ~91.0 %  |  vs avg-D → ~91.0 %                   |  vs elite-D → ~73 %
 *   attr  85 → ~94.3 %  |  vs avg-D → ~94.3 %                   |  vs elite-D → ~76 %
 *   attr  95 → ~96.5 %  |  vs avg-D → ~96.5 %                   |  vs elite-D → ~79 %
 *   attr 100 → ~97.7 %  |  vs avg-D → ~97.7 %                   |  vs elite-D → ~80 %
 *   (elite-D = SLAM_DUNK down=0.225 × normalized(90)=0.80 ≈ −18 %; separate block roll excluded)
 *
 * Tunables:
 *   • Shift segment breakpoints to move the average up/down.
 *   • Adjust positionalTweak values to widen/narrow the big-vs-guard gap.
 *   • Change synergyThreshold / synergyMax for more/less jumping impact.
 *   • Target overall sim dunk success ~93–95 % (most dunks are good looks);
 *     top rim-protection teams should drag opponent dunk % down to ~88–90 %.
 */
export function getDunkPercentage(
  attr: number,
  position?: string,
  jumping?: number,
): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 50) {
    // Low-attr: can dunk but awkward angle / weak grip — 80 % at 0 → 86 % at 50
    base = 0.80 + (a / 50) * 0.06;
  } else if (a <= 69) {
    // Below-avg dunker: 86 % at 51 → 90 % at 69
    base = 0.86 + ((a - 50) / 19) * 0.04;
  } else if (a <= 79) {
    // Solid pro-level: 90 % at 70 → 93 % at 79
    base = 0.90 + ((a - 70) / 9) * 0.03;
  } else if (a <= 89) {
    // Plus dunker: 93 % at 80 → 95.5 % at 89  (diminishing returns begin)
    base = 0.93 + ((a - 80) / 9) * 0.025;
  } else if (a <= 94) {
    // Elite: 95.5 % at 90 → 96.5 % at 94
    base = 0.955 + ((a - 90) / 4) * 0.010;
  } else {
    // God-mode: 96.5 % at 95 → 98 % at 100
    base = 0.965 + ((a - 95) / 5) * 0.015;
  }

  // Positional: bigs have natural leverage at the rim; guards face more rotations
  const positionalTweak =
    position === 'C'  || position === 'PF' ? +0.015 :
    position === 'PG' || position === 'SG' ? -0.010 :
    0; // SF neutral

  // Jumping synergy: explosive dunkers with elite athleticism get a small bonus
  // (e.g. dunks=90 + jumping=95 = 185 → bonus ≈ +0.4 %)
  const synergyThreshold = 180;
  const synergyMax       = 0.015;  // max +1.5 % at combined 220+
  const synergyBonus =
    jumping !== undefined && (a + jumping) > synergyThreshold
      ? Math.min(synergyMax, ((a + jumping - synergyThreshold) / 40) * synergyMax)
      : 0;

  return Math.max(0.75, Math.min(0.99, base + positionalTweak + synergyBonus));
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
export type RimContext = 'DRIVE_LAYUP' | 'POST_FADE' | 'TEAM_BOX_SCORE' | 'SLAM_DUNK';

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
    // Slam dunks are telegraphed — elite shot-blockers time the challenge better than on layups.
    // However, porous interior D barely changes dunk % (no one to contest → dunker just finishes).
    // Effective range: elite rim protector (attr 90) → up to −18 %; weak D → +1.5 % at most.
    SLAM_DUNK:      { down: 0.225, up: 0.015 },
  };

  const { down, up } = RANGES[context];
  return normalized >= 0
    ? -normalized * down   // elite rim D: 0 → −down
    : -normalized * up;    // poor rim D:  0 → +up
}

// ─── Free Throw Percentage ────────────────────────────────────────────────────
/**
 * Maps a player's freeThrow attribute (0–100) to a base FT%, calibrated to
 * 2025-26 NBA data (league avg ≈ 78.3 %; team range 75–83.2 %).
 *
 * Piecewise curve (base before position/situational adjustments):
 *   0–59  → 60–72 %  (hack-a viable; bigs who can't shoot, scared rookies)
 *   60–69 → 72–76 %  (below-avg; shaky but playable — not worth intentional fouling)
 *   70–79 → 76–80 %  (league-avg range — most rotation players live here)
 *   80–89 → 80–86 %  (plus; clutch-reliable, teams can draw fouls without fear)
 *   90–94 → 86–90 %  (elite: Kawhi / SGA tier — high volume AND high %)
 *   95–100→ 90–94 %  (god-tier: Steph Curry .931 — nearly automatic)
 *
 * Diminishing returns design: each segment's slope narrows at the top so the
 * model never implies "100 attr = 100%" — even Steph misses ~7 % of FTs.
 *
 * Positional adjustment:
 *   PG / SG / SF → +1.0 %  (guards drill the mechanics; better form from reps)
 *   C  / PF      → −1.5 %  (bigs with good attr still face slight mechanical cap)
 *
 * Hard clamp: [0.55, 0.96]
 *   Floor: even the worst FT shooter makes more than half.
 *   Ceiling: no one is historically above 96 % on real volume.
 *
 * Calibration target: unweighted league sim avg ≈ 78 %.
 *   Top individual players at 85–90 attr land in the 82–87 % band.
 *
 * Output table (base, guard position):
 *   attr  50 → 67.0 %
 *   attr  65 → 74.5 %
 *   attr  75 → 78.0 %
 *   attr  88 → 84.4 %
 *   attr  95 → 89.0 %
 *   attr 100 → 92.0 %
 *
 * Tunables:
 *   • Shift breakpoint values to raise/lower league-wide avg.
 *   • Widen positionalTweak gap for more position-driven spread.
 *   • Pair with getFreeThrowSituationalMod() for in-game pressure effects.
 */
export function getFreeThrowPercentage(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 59) {
    // Hack-a tier: 60 % at 0 → 72 % at 59  (slow climb — these guys just can't shoot)
    base = 0.60 + (a / 59) * 0.12;
  } else if (a <= 69) {
    // Below-avg: 72 % at 60 → 76 % at 69
    base = 0.72 + ((a - 60) / 9) * 0.04;
  } else if (a <= 79) {
    // League-avg: 76 % at 70 → 80 % at 79
    base = 0.76 + ((a - 70) / 9) * 0.04;
  } else if (a <= 89) {
    // Plus shooter: 80 % at 80 → 86 % at 89  (slope steepens — these reps add up)
    base = 0.80 + ((a - 80) / 9) * 0.06;
  } else if (a <= 94) {
    // Elite: 86 % at 90 → 90 % at 94  (diminishing returns kick in hard)
    base = 0.86 + ((a - 90) / 4) * 0.04;
  } else {
    // God-tier: 90 % at 95 → 94 % at 100  (Curry / prime Nash territory)
    base = 0.90 + ((a - 95) / 5) * 0.04;
  }

  // Positional: guards repeat the motion thousands more times; bigs have
  // mechanical ceilings even when the attribute is strong.
  const positionalTweak =
    position === 'PG' || position === 'SG' || position === 'SF' ? +0.010 :
    position === 'C'  || position === 'PF'                      ? -0.015 :
    0;

  return Math.max(0.55, Math.min(0.96, base + positionalTweak));
}

// ─── Free Throw Situational Modifier ─────────────────────────────────────────
/**
 * Returns an additive modifier to apply on top of getFreeThrowPercentage()
 * to capture fatigue, pressure, home-court, and personality effects.
 *
 * Applied per-player when simulating FT attempts.  No defense component —
 * FTs are unguarded; only internal player/context factors matter.
 *
 * Modifiers (additive, applied in order; all small by design):
 *
 *  1. Stamina fatigue (−0 to −5 %):
 *     Attribute ≥ 70 → no penalty.
 *     Attribute 40–69 → small fatigue on late-game attempts (−1 to −3 %).
 *     Attribute < 40 → noticeable drop in mechanics late (up to −5 %).
 *     Scale multiplied by minute load (minFac = mins/48): a player who plays
 *     5 minutes doesn't accumulate the same fatigue as a 38-minute workhorse.
 *
 *  2. Clutch pressure (−3 to +3 %):
 *     isClutch flag = Q4/OT with score within 5 pts.
 *     Base pressure penalty: −2 % (even good players tighten slightly).
 *     'Clutch' personality trait: negates penalty, adds +1 % (net +1 %).
 *     'Tough/Alpha' trait: halves the penalty (net −1 %).
 *     'Hot Head' trait: doubles the penalty (net −4 %).
 *     clutchShotTaker tendency: (tendency − 50) / 100 × 0.04 added on top.
 *
 *  3. Home crowd (−1 to +1 %):
 *     Home shooter: +0.01 % (familiar shooting background, crowd energy).
 *     Away shooter: −0.01 % (visitor crowd noise on crucial FTs).
 *
 *  4. 'Streaky' trait variance (not an additive mod — handled separately):
 *     Callers should widen their noise window (±0.05 instead of ±0.03)
 *     when the player has the 'Streaky' trait.  See `getStreakiness()`.
 *
 * Tunables:
 *   • fatigueScale: raise to make stamina matter more for FT%.
 *   • pressurePenalty: raise for more dramatic clutch-time swings.
 *   • homeAdv: raise for larger home-court FT effect.
 */
export interface FreeThrowContext {
  /** Minutes played this game (used to weight fatigue). */
  minutesPlayed: number;
  /** Whether this attempt is in a clutch situation (Q4/OT, score ≤ 5 pts). */
  isClutch: boolean;
  /** Whether the shooter is the home team. */
  isHome: boolean;
  /** Player's stamina attribute (0–100). */
  stamina: number;
  /** Player's personalityTraits array. */
  personalityTraits: string[];
  /** clutchShotTaker tendency value (0–100, default 50). */
  clutchTendency?: number;
}

export function getFreeThrowSituationalMod(ctx: FreeThrowContext): number {
  let mod = 0;

  // 1. Stamina / fatigue — heavier minute load amplifies the penalty
  const minFac      = Math.min(1, ctx.minutesPlayed / 40); // full penalty at 40+ mins
  const fatigueScale =
    ctx.stamina < 40 ? 0.050 :
    ctx.stamina < 55 ? 0.030 :
    ctx.stamina < 70 ? 0.015 :
    0;                          // ≥ 70 stamina: no meaningful fatigue
  mod -= fatigueScale * minFac;

  // 2. Clutch pressure
  if (ctx.isClutch) {
    const pressurePenalty = -0.02; // base: everyone tightens up a little
    const traitMod =
      ctx.personalityTraits.includes('Clutch')      ? +0.03 : // negates + bonus
      ctx.personalityTraits.includes('Tough/Alpha') ? +0.01 : // halves penalty
      ctx.personalityTraits.includes('Hot Head')    ? -0.02 : // doubles penalty
      0;
    const tendencyMod = ((ctx.clutchTendency ?? 50) - 50) / 100 * 0.04;
    mod += pressurePenalty + traitMod + tendencyMod;
  }

  // 3. Home / away
  mod += ctx.isHome ? +0.010 : -0.010;

  return mod;
}

/**
 * Returns the noise half-width for a FT attempt roll.
 * 'Streaky' players have wider variance (± 5 %); all others ± 3 %.
 * Callers: Math.random() * 2 * width - width to get a uniform noise value.
 */
export function getFreeThrowNoiseWidth(personalityTraits: string[]): number {
  return personalityTraits.includes('Streaky') ? 0.050 : 0.030;
}

// ─── Post Scoring Percentage ──────────────────────────────────────────────────
/**
 * Maps a player's postScoring attribute (0–100) to a base post-up FG%
 * (hooks, drop-steps, fades, shoulder-drop finishes — back-to-basket work).
 * Calibrated to 2025-26 NBA post-up data:
 *   • League post-up PPP ≈ 103.9 (vs. 99.0 overall half-court) — genuinely efficient.
 *   • Inferred FG% for qualified post scorers: ~48–55 % (bigs on hooks → high end;
 *     contested guards/wings → low end).
 *   • Elite post threat (Jokic / prime Embiid tier): 55–62 %.
 *   • Average rotation big: 47–52 %.
 *   • Non-post player forced into the paint: 38–45 % (bricks or live-ball turnovers).
 *
 * Piecewise curve (base before position/synergy adjustments):
 *   0–59  → 38–45 %  (non-post player; predictable footwork, easy to clamp)
 *   60–69 → 45–48 %  (below-avg; can score in spots but gets locked up often)
 *   70–79 → 48–52 %  (league-avg big; reliable one-dribble shoulder-drop)
 *   80–89 → 52–56 %  (plus post scorer; counter moves, elite contact finishes)
 *   90–94 → 56–59 %  (elite: unguardable late-clock fades and hooks)
 *   95–100→ 59–63 %  (god-tier: Jokic / prime Embiid — footwork too good to stop)
 *
 * Positional adjustment:
 *   C / PF       → +2.0 %  (better angles, natural paint presence)
 *   PG / SG / SF → −1.5 %  (size disadvantage; defender has leverage)
 *
 * Offensive synergy (applied last; each capped independently):
 *   strength:    physical bigs generate better angles and draw fouls.
 *                Bonus: (strength − 50) / 100 × 4 %, capped at ±2.0 %.
 *   offensiveIQ: reads help rotations, picks the right counter move.
 *                Bonus: (offIQ − 50) / 100 × 3 %, capped at ±1.5 %.
 *   Combined cap: +2.5 % max, −2.0 % min (prevents stat-stacking).
 *
 * Hard clamp: [0.35, 0.65]
 *
 * Calibration target: sim avg ~48–52 % before getPostDefenseMod.
 *   Top D teams hold to ~42–45 %; porous D give up ~55 %+.
 *
 * Output table (base, C/PF position, no synergy):
 *   attr  50 → 43.3 %  │  vs avg post-D → 43.3 %  │  vs elite post-D (intDef 90) → ~31 %
 *   attr  65 → 48.5 %  │  vs avg → 48.5 %           │  vs elite → ~36 %
 *   attr  75 → 52.0 %  │  vs avg → 52.0 %           │  vs elite → ~40 %
 *   attr  85 → 56.0 %  │  vs avg → 56.0 %           │  vs elite → ~44 %
 *   attr  95 → 60.5 %  │  vs avg → 60.5 %           │  vs elite → ~48 %
 *   attr 100 → 63.0 %  │  vs avg → 63.0 %           │  vs elite → ~51 %
 *   (elite-D = POST_BACK effectivePostDef≈87 → normalized≈0.74 → mod≈−13.7 %)
 */
export function getPostScoringPercentage(
  attr: number,
  position?: string,
  strength?: number,
  offensiveIQ?: number,
): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 59) {
    // Non-post player: 38 % at 0 → 45 % at 59  (slow ramp — bricks and forced pivots)
    base = 0.38 + (a / 59) * 0.07;
  } else if (a <= 69) {
    // Below-avg: 45 % at 60 → 48 % at 69
    base = 0.45 + ((a - 60) / 9) * 0.03;
  } else if (a <= 79) {
    // League-avg big: 48 % at 70 → 52 % at 79
    base = 0.48 + ((a - 70) / 9) * 0.04;
  } else if (a <= 89) {
    // Plus post scorer: 52 % at 80 → 56 % at 89
    base = 0.52 + ((a - 80) / 9) * 0.04;
  } else if (a <= 94) {
    // Elite: 56 % at 90 → 59 % at 94  (diminishing returns kick in hard)
    base = 0.56 + ((a - 90) / 4) * 0.03;
  } else {
    // God-tier: 59 % at 95 → 63 % at 100  (Jokic / prime Embiid footwork)
    base = 0.59 + ((a - 95) / 5) * 0.04;
  }

  // Positional: bigs operate from natural paint leverage; guards fight uphill
  const positionalTweak =
    position === 'C'  || position === 'PF'                      ? +0.020 :
    position === 'PG' || position === 'SG' || position === 'SF' ? -0.015 :
    0;

  // Synergy: strength generates better seals and contact finishes;
  // high IQ reads the help rotation and selects the right counter move.
  const strBonus = strength    !== undefined
    ? Math.max(-0.020, Math.min(+0.020, (strength    - 50) / 100 * 0.04))
    : 0;
  const iqBonus  = offensiveIQ !== undefined
    ? Math.max(-0.015, Math.min(+0.015, (offensiveIQ - 50) / 100 * 0.03))
    : 0;
  const synergyBonus = Math.max(-0.020, Math.min(+0.025, strBonus + iqBonus));

  return Math.max(0.35, Math.min(0.65, base + positionalTweak + synergyBonus));
}

// ─── Post Defense Modifier ────────────────────────────────────────────────────
/**
 * Maps a defender's post-defense capability to an additive FG% penalty on
 * post-up attempts.  Differs from getRimProtectionMod in two ways:
 *   1. Composite rating: 70 % interiorDef + 30 % defenderStrength.
 *      Post defense is as much about body positioning as shot-blocking.
 *   2. Calibrated for post-contest range (up to −18 % for elite defenders);
 *      POST_FADE_MID is less punishing since high-release hooks/fades are
 *      harder to body-contest than a direct seal-and-drop-step.
 *
 * Average post defender (effectivePostDef ≈ 50) → 0 adjustment.
 *
 * Output table (interiorDef 90, strength 80 → effectivePostDef ≈ 87):
 *   Context             │  normalized ≈ 0.74  │  mod
 *   POST_BACK           │                     │  −0.74 × 0.185 ≈ −13.7 %
 *   POST_FADE_MID       │                     │  −0.74 × 0.130 ≈  −9.6 %
 *   TEAM_BOX_SCORE_POST │                     │  −0.74 × 0.075 ≈  −5.6 %
 *
 * Tunables:
 *   • Adjust `down` per context for more/less post suppression.
 *   • Adjust strWeight to make strength matter more/less relative to interior D.
 *   • Target: top post-D teams hold opponents to ~42–45 % post FG%.
 */
export type PostDefContext = 'POST_BACK' | 'POST_FADE_MID' | 'TEAM_BOX_SCORE_POST';

export function getPostDefenseMod(
  interiorDefAttr: number,
  defenderStrength: number,
  context: PostDefContext = 'POST_BACK',
): number {
  // Effective post defense = weighted blend of rim-protection caliber and
  // raw body strength (prevents the scorer from getting their spot).
  const strWeight        = 0.30;
  const effectivePostDef = interiorDefAttr * (1 - strWeight) + defenderStrength * strWeight;
  const eff              = Math.max(0, Math.min(100, effectivePostDef));
  const normalized       = (eff - 50) / 50; // −1 (worst) … 0 (avg) … +1 (best)

  const RANGES: Record<PostDefContext, { down: number; up: number }> = {
    // Direct shoulder-to-shoulder: body positioning decides everything
    POST_BACK:           { down: 0.185, up: 0.050 },
    // Hook / fade / short turnaround: harder to fully contest with body pressure
    POST_FADE_MID:       { down: 0.130, up: 0.030 },
    // Per-game team average — many post possessions smoothed out
    TEAM_BOX_SCORE_POST: { down: 0.075, up: 0.025 },
  };

  const { down, up } = RANGES[context];
  return normalized >= 0
    ? -normalized * down   // elite post D: 0 → −down
    : -normalized * up;    // poor post D:  0 → +up
}

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
  // Tracks whether the DRIVE_LAYUP resolved into a slam-dunk attempt rather than
  // a standard layup.  Set inside the DRIVE_LAYUP case and read again in Step 5
  // so defense applies the correct rim context (SLAM_DUNK vs DRIVE_LAYUP).
  let isDunkAttempt = false;
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
      // Attribute-driven piecewise curve; synergy from offIQ + ballHandling baked in.
      // Defense will apply getMidRangeContestMod in Step 5 (perimeterDef attribute).
      baseProb = getMidRangePercentage(
        offHandler.attributes.shootingMid,
        offHandler.position,
        offHandler.attributes.offensiveIQ,
        offHandler.attributes.ballHandling,
      );
      tendencyUsed  = 'midRangeJumper';
      tendencyScore = ot?.midRangeJumper ?? 50;
      // High tendency = specialist: comfort in their spots earns a small bonus;
      // low tendency = reluctant shooter: hesitation costs them accuracy.
      const m = (tendencyScore / 100) * 0.12;
      shotModifier = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      pbpBase = tendencyScore >= 86
        ? `${ln} gets to his spot at the elbow — money every time...`
        : tendencyScore >= 70
          ? `${ln} rises up from the elbow — that's his spot...`
          : tendencyScore < 30
            ? `${ln} settles for a tough mid-range...`
            : `${ln} pulls up for the mid-range jumper...`;
      break;
    }
    case 'DRIVE_LAYUP': {
      const dunkAttr  = offHandler.attributes.dunks;
      const jumpAttr  = offHandler.attributes.jumping;
      const layupAttr = offHandler.attributes.layups;

      // Probabilistic dunk detection: athletic finishers convert a portion of
      // drives into slam attempts.  Chance rises with the dunks attribute so
      // high-dunk bigs slam often while low-attr guards rarely attempt it.
      // Range: ~0 % at attr 40 → ~40 % at attr 80 → ~70 % at attr 100.
      const rawDunkChance = Math.max(0, (dunkAttr - 40) / 85);   // 0 → ~0.71
      const dunkChance    = Math.min(0.70, rawDunkChance);

      isDunkAttempt = dunkAttr >= 50 && Math.random() < dunkChance;

      if (isDunkAttempt) {
        // ── Slam dunk attempt ──────────────────────────────────────────────
        // Use the dedicated dunk curve (higher base % than layups).
        // Defense will apply SLAM_DUNK rim context in Step 5.
        baseProb = getDunkPercentage(dunkAttr, offHandler.position, jumpAttr);
        pbpBase  = isTransition && transHunter >= 70
          ? `${ln} catches it in transition and throws it down!`
          : dunkAttr >= 90
            ? `${ln} rises up and POSTERIZES him — windmill, one-hand, raw POWER!`
            : dunkAttr >= 80
              ? `${ln} attacks and throws it down!`
              : `${ln} goes up strong for the dunk...`;
      } else {
        // ── Standard layup / finger-roll ──────────────────────────────────
        // Blend layup finishing quality with a dunk-athleticism weight so high-dunk
        // players who do lay it up still benefit from their superior touch/body control.
        const layupBase  = getLayupPercentage(layupAttr, offHandler.position);
        const dunkBase   = getDunkPercentage(dunkAttr,  offHandler.position, jumpAttr);
        const dunkWeight = Math.min(0.35, dunkAttr / 100 * 0.35);
        baseProb = layupBase * (1 - dunkWeight) + dunkBase * dunkWeight;
        pbpBase  = isTransition && transHunter >= 70
          ? `${ln} pushes the pace immediately — gets out before the defense sets...`
          : tendencyScore >= 86 ? `${ln} attacks the rim relentlessly...`
            : tendencyScore >= 70 ? `${ln} attacks the rim hard...`
              : `${ln} drives the lane...`;
      }

      tendencyUsed  = 'driveToBasket';
      tendencyScore = ot?.driveToBasket ?? 50;
      const m       = (tendencyScore / 100) * 0.10;
      shotModifier  = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      break;
    }
    case 'POST_FADE': {
      // Attribute-driven piecewise curve; strength + offIQ synergy baked in.
      // Defense applies getPostDefenseMod in Step 5 (interiorDef + defStrength composite).
      baseProb = getPostScoringPercentage(
        offHandler.attributes.postScoring,
        offHandler.position,
        offHandler.attributes.strength,
        offHandler.attributes.offensiveIQ,
      );
      tendencyUsed  = 'postUp';
      tendencyScore = ot?.postUp ?? 50;
      // High tendency = practiced footwork; specialist bonus lifts accuracy;
      // low tendency = uncomfortable / reluctant — sloppy mechanics.
      const m = (tendencyScore / 100) * 0.13;
      shotModifier = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      pbpBase = tendencyScore >= 85
        ? `${ln} seals deep, drops the shoulder, and goes to his bag...`
        : tendencyScore >= 75
          ? `${ln} backs down his defender in the post, drops his shoulder and goes to work...`
          : tendencyScore < 35
            ? `${ln} is forced into an uncomfortable post-up...`
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
      // Steal success: defender's Steals attr (via getStealChance) is the primary
      // driver, synergised with perimeterDef for positioning.  Elite thieves
      // (attr 90+) convert 35-42 % of gambles; average players 15-25 %.
      // Handler's ball handling inversely caps how often a reach pays off.
      const bhAttr      = offHandler.attributes.ballHandling ?? 65;
      const stealAttr   = defender?.attributes.steals ?? 50;
      const perimDef    = defender?.attributes.perimeterDef ?? 50;
      const stealChance = getStealChance(stealAttr, defender?.position);
      // perimeterDef synergy: tight coverage opens steal angles (+up to 3 %)
      const perimBonus  = Math.max(0, (perimDef - 55) / 100 * 0.03);
      const stealSuccessRate = Math.max(0.10, Math.min(0.42,
        stealChance * 8 + perimBonus + (75 - bhAttr) / 100 * 0.18,
      ));
      if (Math.random() < stealSuccessRate) {
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

    // Interior Defense — rim-protection for drives/dunks; post defense for post-ups.
    // Two separate pathways: DRIVE_LAYUP uses getRimProtectionMod (length/timing at rim);
    // POST_FADE uses getPostDefenseMod (body composite: interiorDef + defenderStrength).
    if (shotType === 'DRIVE_LAYUP') {
      const intDef        = defender?.attributes.interiorDef ?? 50;
      const rimCtx: RimContext = isDunkAttempt ? 'SLAM_DUNK' : 'DRIVE_LAYUP';
      const rimContestMod = getRimProtectionMod(intDef, rimCtx);
      defenseModifier += rimContestMod;

      if (isDunkAttempt) {
        // ── Separate block-chance for slam dunks ────────────────────────────
        // Elite shot-blockers (high interiorDef + blocks) can flat-out reject dunks.
        // Probability: near-zero for avg defenders; up to ~14 % for elite rim protectors.
        const intNorm     = Math.max(0, (intDef - 40) / 60);
        // getBlockChance: attribute-driven per-shot block %, amplified by how well
        // the defender is positioned at the rim (intNorm, from interiorDef).
        // Multiplier 2.2 calibrates so elite rim protectors block ~13 % of dunks
        // in perfect position; hard cap at 15 % for even Wemby-tier defenders.
        const blockChance = Math.min(0.15,
          getBlockChance(defender?.attributes.blocks ?? 50, defender?.position)
          * intNorm * 2.2,
        );
        if (Math.random() < blockChance) {
          const blockLine = intDef >= 90
            ? `${defLn} SWATS IT INTO THE STANDS! Emphatic rejection!`
            : intDef >= 80
              ? `${defLn} rises and blocks the dunk attempt! Huge stop!`
              : `${defLn} gets a piece of it — dunk blocked!`;
          return {
            ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
            tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
            tendencyScore, shotModifier, conflictFired: false,
            defenderTendency: 'interiorDef', defenseModifier,
            finalShotProbability: 0, result: 'MISSED',
            isTransition, defenderRef: defender,
            pbpText: blockLine,
          };
        }
        // PBP flavour for contested-but-not-blocked dunk challenges
        if (intDef >= 90 && rimContestMod <= -0.12) {
          pbpDefPrefix = pbpDefPrefix || `${defLn} challenges the dunk with elite timing — `;
          if (!defTendencyUsed) defTendencyUsed = 'interiorDef';
        } else if (intDef >= 80 && rimContestMod <= -0.08) {
          if (!defTendencyUsed) defTendencyUsed = 'interiorDef';
          pbpBase += ` ${defLn} rises to meet him at the rim!`;
        } else if (intDef <= 30) {
          pbpDefPrefix = pbpDefPrefix || `${defLn} has no answer — clear path to the rim — `;
        }
      } else {
        // Standard layup PBP flavour
        if (intDef >= 80 && rimContestMod <= -0.06) {
          if (!defTendencyUsed) defTendencyUsed = 'interiorDef';
          pbpDefPrefix = pbpDefPrefix || `${defLn} meets him at the rim — massive contest — `;
        } else if (intDef >= 90 && rimContestMod <= -0.09) {
          pbpBase += ` ${defLn} is a wall at the rim!`;
        } else if (intDef <= 30) {
          pbpDefPrefix = pbpDefPrefix || `${defLn} has no chance — nobody in the paint — `;
        }
      }
    }

    if (shotType === 'POST_FADE') {
      // Post defense: composite of interiorDef (positioning/length) + defender strength
      // (body-locking; prevents the scorer from getting a clean spot).
      // Direct back-to-basket → POST_BACK; catch-and-face-up → POST_FADE_MID.
      const intDef      = defender?.attributes.interiorDef  ?? 50;
      const defStr      = defender?.attributes.strength     ?? 50;
      const postCtx: PostDefContext = offAction === 'POST_UP' ? 'POST_BACK' : 'POST_FADE_MID';
      const postDefMod  = getPostDefenseMod(intDef, defStr, postCtx);
      defenseModifier  += postDefMod;

      if (intDef >= 85 && postDefMod <= -0.10) {
        if (!defTendencyUsed) defTendencyUsed = 'interiorDef';
        pbpDefPrefix = pbpDefPrefix || `${defLn} body-locks him — no room to operate — `;
      } else if (intDef >= 90 && postDefMod <= -0.13) {
        pbpBase += ` ${defLn} shuts it down with elite post positioning!`;
      } else if (intDef <= 30) {
        pbpDefPrefix = pbpDefPrefix || `${defLn} has no answer — free reign in the post — `;
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

    // Perimeter Defense attribute — contest quality for mid-range shots.
    // Pull-up/step-back mid-range uses PULL_UP_MID context (self-created; harder to fully contest).
    // Average defender → 0; elite (attr 85) → up to −4.9 %; poor (attr 20) → up to +2.2 %.
    if (shotType === 'MID_RANGE') {
      const perimDef   = defender?.attributes.perimeterDef ?? 50;
      // Distinguish ISO/step-back (PULL_UP_MID) vs elbow catch-and-face-up (ELBOW_FADE)
      const midCtx: MidRangeContext = (offAction === 'ISO' || offAction === 'TRANSITION')
        ? 'PULL_UP_MID'
        : 'ELBOW_FADE';
      const contestMod = getMidRangeContestMod(perimDef, midCtx);
      defenseModifier += contestMod;
      if (perimDef >= 85 && contestMod <= -0.04) {
        if (!defTendencyUsed) defTendencyUsed = 'perimeterDef';
        pbpDefPrefix = pbpDefPrefix || `${defLn} closes out hard — no clean look — `;
      } else if (perimDef <= 30) {
        pbpDefPrefix = pbpDefPrefix || `${defLn} is a step slow — wide open pull-up — `;
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
    if (isDunkAttempt) {
      const dunkAttr = offHandler.attributes.dunks;
      fullText += dunkAttr >= 90
        ? ` — SLAMS IT HOME! Emphatic!`
        : dunkAttr >= 80
          ? ` — puts it down hard! Two points the easy way.`
          : ` — finishes the dunk!`;
    } else if (shotType === 'POST_FADE' && (ot?.postUp ?? 0) >= 75) {
      fullText += ` — drops his shoulder and hits the post fade!`;
    } else if (shotType === 'PULL_UP_3' && (ot?.pullUpThree ?? 0) >= 71) {
      fullText += ` — BANG! Right in his wheelhouse.`;
    } else if (offHandler.personalityTraits.includes('Streaky') && hotStreak >= 2) {
      fullText += ` — Good. ${ln} is feeling it right now...`;
    } else {
      fullText += ` — Good.`;
    }
  } else {
    fullText += isDunkAttempt
      ? ` — rattles out! Missed the dunk.`
      : offHandler.personalityTraits.includes('Streaky') && hotStreak <= -2
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
    // Team ORB chance: derived from each player's offRebounding attribute via
    // getTeamOrbChance() — replaces the old hardcoded 12 %.
    // League-avg rotation yields ~29-31 % ORB; elite boards squads reach ~35 %.
    const teamOrbChance = getTeamOrbChance(rotation);
    if (poss.result === 'MISSED' && Math.random() < teamOrbChance) {
      // Prefer big men (high offReb + layups); exclude the original missed shooter.
      const rebCandidates = rotation.filter(p =>
        p.id !== handler.id && (p.attributes.layups ?? 40) >= 40);
      const pool = rebCandidates.length > 0
        ? rebCandidates
        : rotation.filter(p => p.id !== handler.id);
      if (pool.length > 0) {
        // Weight each candidate by their individual ORB% chance so elite
        // crashers are selected proportionally, not just by rank.
        const orbWeights = pool.map(p =>
          getOffReboundChance(p.attributes.offReb ?? 50, p.position));
        const totalOrbWeight = orbWeights.reduce((s, w) => s + w, 0);
        let orbRoll = Math.random() * totalOrbWeight;
        let rebounder = pool[pool.length - 1]; // fallback
        for (let ri = 0; ri < pool.length; ri++) {
          orbRoll -= orbWeights[ri];
          if (orbRoll <= 0) { rebounder = pool[ri]; break; }
        }
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
  varRoll = 0,                 // game-level variance from tip-off roll (±15–25)
  ftBonus = 0,                 // home court FT advantage (+0.03)
  opponentPerimDefMod  = 0,   // team-level 3PT defensive suppression (get3PTContestMod)
  opponentInteriorDefMod = 0,  // team-level at-rim defensive suppression (getRimProtectionMod)
  opponentMidDefMod = 0,       // team-level mid-range suppression (getMidRangeContestMod)
  opponentPostDefMod = 0,      // team-level post suppression (getPostDefenseMod)
): GamePlayerLine => {
  const fgPctBoost = varRoll / 100 * 0.4; // variance → small FG% delta
  const tm     = computeTendencyModifiers(player);
  const minFac = minutes / 48;

  const adjUsage = Math.max(0.02, usageShare * (1 + tm.usageBoost));
  const fga      = Math.max(0, Math.round(teamFga * adjUsage * (minutes / 32)));

  // TO% computed early: drives both the TOV stat and the AST efficiency penalty.
  // Uses getTurnoverPercentage() — piecewise curve calibrated to NBA 2025-26.
  const toRate = getTurnoverPercentage(
    player.attributes.ballHandling,
    player.attributes.passing,
    player.attributes.offensiveIQ,
    player.position,
    player.attributes.stamina,
  );

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
  // Mid-range FG%: attribute-driven piecewise curve with offIQ + ballHandling synergy.
  // Replaces the old linear formula (shootingMid/100 * 0.42 + 0.26) which over-rewarded
  // high attributes linearly and ignored creation skill.
  const fgPctMid = getMidRangePercentage(
    player.attributes.shootingMid,
    player.position,
    player.attributes.offensiveIQ,
    player.attributes.ballHandling,
  );

  // Inside FG%: three-way blend of layup, dunk, and post-scoring quality.
  // getDunkPercentage: proper high-base curve (92-98% uncontested).
  // getPostScoringPercentage: hook/drop-step range (48-63% calibrated).
  // Weights are dynamic so specialist post scorers and dunkers each pull the
  // blended inside FG% toward their own high-efficiency band.
  const layupBase   = getLayupPercentage(player.attributes.layups, player.position);
  const dunkBase    = getDunkPercentage(player.attributes.dunks, player.position, player.attributes.jumping);
  const postBase    = getPostScoringPercentage(
    player.attributes.postScoring, player.position,
    player.attributes.strength, player.attributes.offensiveIQ,
  );
  const dunkWeight  = Math.min(0.30, player.attributes.dunks       / 100 * 0.30);
  const postWeight  = Math.min(0.25, player.attributes.postScoring / 100 * 0.25);
  const layupWeight = Math.max(0,    1 - dunkWeight - postWeight);
  const fgPctIns    = layupBase * layupWeight + dunkBase * dunkWeight + postBase * postWeight;

  const threepm = Math.min(threepa, Math.round(threepa * Math.max(0.05,
    fgPct3 + fgPctBoost + opponentPerimDefMod + (Math.random() * 0.06 - 0.03))));
  const midFgm  = Math.min(midFga,  Math.round(midFga  * Math.max(0.05,
    fgPctMid + fgPctBoost + opponentMidDefMod + (Math.random() * 0.06 - 0.03))));
  // Inside FGM: interior + post defense mods both apply (weighted by post share).
  // opponentInteriorDefMod suppresses drives/dunks; opponentPostDefMod suppresses
  // post-ups.  Blend them proportionally to postWeight so a non-post player
  // (postWeight≈0) is barely affected by post defense, and a pure post scorer
  // (postWeight≈0.25) feels the full post-defense penalty.
  const blendedInsideMod = opponentInteriorDefMod * (1 - postWeight) + opponentPostDefMod * postWeight;
  const insFgm  = Math.min(insFga,  Math.round(insFga  * Math.max(0.35,
    fgPctIns + fgPctBoost + blendedInsideMod + (Math.random() * 0.06 - 0.03))));
  const fgm     = threepm + midFgm + insFgm;

  const fta = Math.round((player.attributes.strength / 100) * 5 * minFac + Math.random() * 2);

  // FT%: piecewise curve + positional tweak + situational modifiers.
  // ftBonus carries the home-court advantage from the call site; we also
  // fold in stamina fatigue and personality pressure effects so FTM/FTA
  // in the box score reflects real player variance across 82 games.
  const ftBasePct = getFreeThrowPercentage(player.attributes.freeThrow, player.position);
  const ftSitMod  = getFreeThrowSituationalMod({
    minutesPlayed:     minutes,
    isClutch:          false,     // box-score path aggregates full game; no single-moment clutch flag
    isHome:            ftBonus > 0,
    stamina:           player.attributes.stamina,
    personalityTraits: player.personalityTraits,
    clutchTendency:    player.tendencies?.situationalTendencies?.clutchShotTaker,
  });
  const ftNoise   = getFreeThrowNoiseWidth(player.personalityTraits);
  const ftPct     = Math.max(0.50, Math.min(0.98,
    ftBasePct + ftSitMod + (Math.random() * 2 * ftNoise - ftNoise)));
  const ftm = Math.min(fta, Math.round(fta * ftPct));
  const pts = midFgm * 2 + insFgm * 2 + threepm * 3 + ftm;

  const totalReb = Math.max(0, Math.round(teamReb * (player.attributes.rebounding / 100) * adjUsage * 2.5));
  // Split ORB/DRB using the calibrated chance functions so the ratio reflects
  // realistic position-adjusted board rates, not raw attribute proportions.
  const orbChance = getOffReboundChance(player.attributes.offReb, player.position);
  const drbChance = getDefReboundChance(player.attributes.defReb, player.position);
  const orbRatio  = orbChance / (orbChance + drbChance);
  const offReb    = Math.round(totalReb * orbRatio);
  const defReb    = totalReb - offReb;

  // AST efficiency blends passing (55 %) + playmaking (45 %), with an IQ bonus
  // and a penalty for high-TO% passers who force broken plays over scoring reads.
  const astEff      = getAssistEfficiency(player.attributes.passing, player.attributes.playmaking, player.attributes.offensiveIQ, toRate);
  const adjAstShare = Math.max(0.01, astEff * adjUsage * 3.0 * (1 + tm.astBoost));
  const ast = Math.max(0, Math.round(teamAst * adjAstShare));

  // STL: getStealChance × 65 steal-opportunities per 48 min × minutes fraction.
  // STL_OPP_SCALE=65 calibrated so a 10-player rotation hits ~8.5-9.0 team STL/game.
  // stlBoost from defensive tendencies (pass-denial schemes, pressure defense).
  // Stamina: fatigued defenders lose a step — up to 15 % reduction at stamina=40.
  const STL_OPP_SCALE = 65;
  const stlBase    = getStealChance(player.attributes.steals, player.position)
    * STL_OPP_SCALE * minFac * (1 + tm.stlBoost);
  const stlFatigue = Math.max(0, (65 - (player.attributes.stamina ?? 70)) / 100 * 0.15);
  const stl        = Math.max(0, Math.floor(stlBase * (1 - stlFatigue) + Math.random() * 0.8));

  // BLK: getBlockChance × 50 block-opportunities per 48 min × minutes fraction.
  // BLK_OPP_SCALE=50 calibrated so a realistic roster hits ~5.0 team BLK/game.
  // Elite rim protectors (attr 88+, C, 32 min) naturally reach 2.0-2.5 BPG.
  // Stamina: tired bigs lose the vertical step — up to 12 % late-game reduction.
  const BLK_OPP_SCALE = 50;
  const blkBase    = getBlockChance(player.attributes.blocks, player.position)
    * BLK_OPP_SCALE * minFac;
  const blkFatigue = Math.max(0, (65 - (player.attributes.stamina ?? 70)) / 100 * 0.12);
  const blk        = Math.max(0, Math.floor(blkBase * (1 - blkFatigue) + Math.random() * 0.8));
  const pf  = Math.min(6, Math.round((Math.floor(Math.random() * 4 * minFac + 1)) * (1 + tm.foulRisk)));

  // TOV: possession-scaled off actual FGA (proxy for ball touches).
  // toRate=0.12, fga=13 → ~1.56 base + noise; high-usage stars accumulate more
  // naturally without a separate multiplier. Noise ±2 % for game-to-game variance.
  const tovNoise = (Math.random() - 0.5) * 0.04;
  const tov      = Math.max(0, Math.round((toRate + tovNoise) * fga));

  return {
    playerId: player.id, name: player.name, min: minutes,
    pts, reb: totalReb, offReb, defReb, ast, stl, blk, fgm, fga,
    threepm, threepa, ftm, fta, tov,
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
    const teamFga     = Math.round(statPace * 1.10);
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

    // Mid-range suppression: avg perimDef 75 → ~−2.0 %  |  85 → ~−2.8 %  |  25 → ~+0.9 %
    const oppMidDefMod = getMidRangeContestMod(oppAvgPerimDef, 'TEAM_BOX_SCORE_MID');

    // Post suppression: composite interiorDef + strength; avg intDef 80/str 70 → ~−5 %
    const oppAvgInteriorStr = oppTopN.reduce((s, op) => s + (op.attributes.strength ?? 50), 0) / oppCount;
    const oppPostDefMod     = getPostDefenseMod(oppAvgInteriorDef, oppAvgInteriorStr, 'TEAM_BOX_SCORE_POST');

    // Power-curve usage: (rating/avg)^2.5 so stars get disproportionately more FGA
    const avgRating     = totalRating / Math.max(1, roster.length);
    const rawUsageArr   = roster.map(p => Math.pow(Math.max(1, p.rating) / avgRating, 2.5));
    const totalRawUsage = rawUsageArr.reduce((s, u) => s + u, 0);
    const usageShares   = rawUsageArr.map(u => u / Math.max(1, totalRawUsage));

    // Rating rank (0 = best player on roster) for star-minutes differentiation
    const sortedByRating = roster
      .map((p, idx) => ({ id: p.id, rating: p.rating, idx }))
      .sort((a, b) => b.rating - a.rating);
    const ratingRank = new Map(sortedByRating.map(({ id }, rank) => [id, rank]));

    return roster.map((p, i) => {
      let mins = 0;
      if (team.rotation && team.rotation.minutes[p.id] !== undefined) {
        mins = team.rotation.minutes[p.id];
      } else {
        const rank = ratingRank.get(p.id) ?? i;
        if (i < 5) {
          if (rank === 0)      mins = 34 + Math.floor(Math.random() * 5);  // 34–38 (star)
          else if (rank === 1) mins = 31 + Math.floor(Math.random() * 5);  // 31–35 (co-star)
          else if (rank === 2) mins = 28 + Math.floor(Math.random() * 5);  // 28–32
          else                 mins = 26 + Math.floor(Math.random() * 6);  // 26–31
        } else if (i < 9) mins = 14 + Math.floor(Math.random() * 10);
        else if (i < 12)  mins = Math.floor(Math.random() * 6);
      }
      if (isGT) {
        if (i < 5) mins = Math.max(20, mins - 10);
        else if (i < 9) mins = Math.min(30, mins + 8);
      }
      const ftBonus    = isHome ? 0.03 : 0;
      const varRoll    = playerVariance.get(p.id) ?? 0;
      const usageShare = usageShares[i];
      const line = simulatePlayerGameLine(p, totalPts, teamFga, teamReb, teamAst, mins, usageShare, varRoll, ftBonus, oppPerimDefMod, oppInteriorDefMod, oppMidDefMod, oppPostDefMod);
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


