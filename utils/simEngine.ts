import { Team, GameResult, Player, GamePlayerLine, ClutchGameLine, CoachScheme, PlayByPlayEvent, InjuryType, LeagueState, QuarterDetail, LeagueSettings } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE_PPP       = 1.06;
const SCORE_VARIANCE = 0.12;  // ±12 pts of PPP randomness — wider band drives realistic upsets
const HOME_COURT_ADV = 0.040; // +4.0% for home team (NBA home teams win ~60% empirically)
const VISIT_TOV_PEN  = 0.008;  // road team slight TOV penalty

// ─── Pace / Possession Engine ─────────────────────────────────────────────────
/** Pace rating (60-100) → total possessions per 48 min (per team) */
const PACE_TABLE: Array<{ lo: number; hi: number; possLo: number; possHi: number }> = [
  { lo: 60, hi: 65,  possLo: 84,  possHi: 88  },  // very slow, grind it out
  { lo: 66, hi: 70,  possLo: 89,  possHi: 93  },  // slow, halfcourt heavy
  { lo: 71, hi: 75,  possLo: 94,  possHi: 98  },  // below average pace
  { lo: 76, hi: 80,  possLo: 98,  possHi: 102 },  // average NBA pace (~100 poss/team)
  { lo: 81, hi: 85,  possLo: 103, possHi: 107 },  // uptempo
  { lo: 86, hi: 90,  possLo: 108, possHi: 113 },  // very fast
  { lo: 91, hi: 100, possLo: 114, possHi: 120 },  // run and gun
];

/** Base scheme pace ratings. Used when team.paceRating is not set. */
const SCHEME_DEFAULT_PACE: Record<CoachScheme, number> = {
  'Balanced':       78,  // 98–102 poss — NBA average halfcourt offense
  'Pace and Space': 87,  // 108–113 poss
  'Grit and Grind': 64,
  'Triangle':       74,  // 94–98 poss
  'Small Ball':     84,  // 103–107 poss
  'Showtime':       93,  // 114–120 poss
};

// ─── Playbook Shot-Distribution Multipliers ──────────────────────────────────
/**
 * Per-scheme multipliers baked into the per-player box-score path.
 *
 * threePaShareMult — scales the fraction of FGA that are three-pointers.
 * insideShareMult  — scales the fraction of FGA that are at-rim attempts.
 * fgPct3Delta      — additive shift to 3PT%; positive = system creates better 3PT looks.
 * fgPctInsDelta    — additive shift to inside FG%; post-systems get cleaner entry reads.
 * fgPctMidDelta    — additive shift to mid-range FG%; ball-movement systems create elbow looks.
 *
 * Design: a Pace-and-Space team fires ~28% more threes and ~32% fewer post/inside
 * attempts vs. Balanced, while Grit-and-Grind does the opposite.  The FG% deltas
 * are small but visible over an 82-game season (a 3PT specialist in P&S will shoot
 * ~1.8 pp higher from three than the same player in Balanced).
 */
const PLAYBOOK_SHOT_MODS: Record<CoachScheme, {
  threePaShareMult: number;
  insideShareMult:  number;
  fgPct3Delta:      number;
  fgPctInsDelta:    number;
  fgPctMidDelta:    number;
}> = {
  'Balanced':       { threePaShareMult: 1.00, insideShareMult: 1.00, fgPct3Delta:  0.000, fgPctInsDelta:  0.000, fgPctMidDelta:  0.000 },
  'Pace and Space': { threePaShareMult: 1.28, insideShareMult: 0.68, fgPct3Delta: +0.018, fgPctInsDelta: -0.018, fgPctMidDelta: -0.010 },
  'Grit and Grind': { threePaShareMult: 0.62, insideShareMult: 1.38, fgPct3Delta: -0.018, fgPctInsDelta: +0.020, fgPctMidDelta: +0.010 },
  'Triangle':       { threePaShareMult: 0.88, insideShareMult: 1.02, fgPct3Delta: -0.005, fgPctInsDelta: +0.005, fgPctMidDelta: +0.015 },
  'Small Ball':     { threePaShareMult: 1.18, insideShareMult: 0.85, fgPct3Delta: +0.010, fgPctInsDelta: +0.010, fgPctMidDelta: +0.005 },
  'Showtime':       { threePaShareMult: 1.12, insideShareMult: 1.18, fgPct3Delta: +0.005, fgPctInsDelta: +0.022, fgPctMidDelta:  0.000 },
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
 *    90   │ 41.5 %   (elite)
 *    94   │ 44.5 %   (elite ceiling)
 *    95   │ 45.0 %   (god-tier floor)
 *   100   │ 50.0 %   (historic specialist peak — low volume only)
 *
 * Volume regression is applied via stochastic rounding at the call site
 * (Math.floor(n*rate + random()) eliminates Math.round bias that was causing
 * 50% season averages for players with high base rates).
 *
 * Tuning guide:
 *   - Raise/lower segment endpoints to shift whole curve or individual tiers.
 *   - Move breakpoints (59, 74, 89, 94) to widen/narrow each band.
 *   - Hard clamp [0.20, 0.48] — realistic max for any shooter on volume.
 *
 * Calibrated range:
 *   attr 75 → 34.5%  (below-avg starter)
 *   attr 85 → 39.4%  (solid shooter)
 *   attr 90 → 40.0%  (plus shooter)
 *   attr 94 → 43.0%  (elite)
 *   attr 99 → 45.4%  (best realistic PG/SG — never reaches 50%)
 */
export function getThreePointPercentage(attr: number): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 59) {
    // Non-shooters / big men: 25% at 0 → 32% at 59
    base = 0.25 + (a / 59) * 0.07;
  } else if (a <= 74) {
    // Below-avg to league-avg: 32% at 60 → 34.5% at 74
    base = 0.32 + ((a - 60) / 14) * 0.025;
  } else if (a <= 89) {
    // Solid starter to plus shooter: 34.5% at 75 → 40% at 89
    base = 0.345 + ((a - 75) / 14) * 0.055;
  } else if (a <= 94) {
    // Elite: 40% at 90 → 43% at 94
    base = 0.40 + ((a - 90) / 4) * 0.030;
  } else {
    // God-tier: 43% at 95 → 46% at 100 (max for any player on volume)
    base = 0.43 + ((a - 95) / 5) * 0.03;
  }

  return Math.max(0.20, Math.min(0.48, base));
}

// ─── Rebound Chance Functions ────────────────────────────────────────────────
/**
 * Maps an offRebounding attribute (0–100) to an individual ORB% chance
 * per rebound opportunity (decimal).
 *
 * Position-differentiated so the C/PF vs. guard gap is realistic:
 *   attr  │  C/PF      │  SF       │  PG/SG
 *   ──────┼────────────┼───────────┼────────
 *    50   │   9.0 %   │   6.0 %  │   3.0 %
 *    65   │  16.0 %   │  11.0 %  │   6.0 %
 *    80   │  24.0 %   │  16.0 %  │   9.0 %
 *    94   │  32.0 %   │  21.0 %  │  13.0 %
 *   100   │  36.0 %   │  24.0 %  │  15.0 %
 *
 * These values are used in two ways:
 *   1. Weighted selection of who grabs a secured OREB (relative weights).
 *   2. Input to getTeamOrbChance, which aggregates and hard-clamps team OREB%
 *      to 15–25 %, keeping team-level totals realistic regardless of individual peaks.
 *
 * Tuning guide:
 *   • Adjust positional bonuses (±0.14 / ±0.06) to widen or narrow the gap.
 *   • Hard clamp [0.03, 0.40] is a last-resort safety net.
 */
export function getOffReboundChance(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  // Calibrated to NBA 2025-26: elite offensive rebounders (bigs with 90+ offReb)
  // crash 35–45% of available offensive boards; guards with weak offReb at 14–18%.
  let base: number;
  if (a <= 50) {
    // Non-crasher: 10 % at 0 → 18 % at 50
    base = 0.10 + (a / 50) * 0.08;
  } else if (a <= 70) {
    // Below-avg to avg crasher: 18 % at 50 → 24 % at 70
    base = 0.18 + ((a - 50) / 20) * 0.06;
  } else if (a <= 85) {
    // Plus rebounder: 24 % at 70 → 30 % at 85
    base = 0.24 + ((a - 70) / 15) * 0.06;
  } else {
    // Elite crasher: 30 % at 85 → 37 % at 100  (Rodman/Gobert tier)
    base = 0.30 + ((a - 85) / 15) * 0.07;
  }

  // Positional spread: bigs seal out and have natural leverage near the rim;
  // guards rarely crash and are frequently beaten by bigger bodies.
  if (position === 'C' || position === 'PF')       base += 0.12; // → 22–49 % at peak
  else if (position === 'SF')                      base += 0.02;
  else if (position === 'PG' || position === 'SG') base -= 0.06; // → 12–31 %

  return Math.max(0.06, Math.min(0.48, base));
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
 *   teamOrbChance = clamp(Σ playerOrbChance × DECAY_FACTOR, 0.15, 0.25)
 *
 * DECAY_FACTOR = 0.42 — tighter than before to prevent OREB inflation.
 * A squad of five avg-rated players (each ~12 %) yields:
 *   5 × 0.12 × 0.42 ≈ 0.25  (league-avg ~20-25 %, capped at 25 %). ✓
 *
 * Combined with the 7 % OOB chance in the miss resolver, the effective
 * possession breakdown per miss is:
 *   OOB  ~7 %  │  OREB ~14–23 %  │  DREB ~70–79 %  ← NBA-realistic.
 */
export function getTeamOrbChance(
  rotation: Array<{ attributes: { offReb: number }; position?: string }>,
): number {
  const DECAY = 0.42;
  const sum = rotation.reduce(
    (acc, p) => acc + getOffReboundChance(p.attributes.offReb, p.position),
    0,
  );
  return Math.max(0.15, Math.min(0.25, sum * DECAY));
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
  personalityTraits?: string[],
): number {
  const bh = Math.max(0, Math.min(100, ballHandling));

  // ── Primary driver: ball handling (inverse — better BH = lower TO%) ───────
  let base: number;
  if (bh <= 60) {
    // Sloppy: 27 % at 0 → 21 % at 60
    base = 0.27 - (bh / 60) * 0.06;
  } else if (bh <= 80) {
    // Average: 21 % at 60 → 15 % at 80
    base = 0.21 - ((bh - 60) / 20) * 0.06;
  } else if (bh <= 94) {
    // Plus → elite: 15 % at 80 → 10 % at 94
    base = 0.15 - ((bh - 80) / 14) * 0.05;
  } else {
    // God-tier: 10 % at 95 → 8.5 % at 100
    base = 0.10 - ((bh - 95) / 5) * 0.015;
  }

  // ── Passing: vision vs. ball-security balance ─────────────────────────────
  const passDelta = passing - bh;
  let passMod: number;
  if (passDelta > 10) {
    passMod = Math.min(0.025, (passDelta - 10) / 100 * 0.04);
  } else if (passDelta >= -10) {
    passMod = -0.005;
  } else {
    passMod = Math.min(0.005, (-passDelta - 10) / 100 * 0.01);
  }
  base += passMod;

  // ── Off IQ: decision quality ────────────────────────────────────────────
  // IQ 90 → −0.8 % TOs (reads the defense, makes safer choices);
  // IQ 50 → +0.8 % (poor decision-making, telegraphs passes, over-dribbles).
  base += -(offIQ - 70) / 100 * 0.040;

  // ── Positional pressure ────────────────────────────────────────────────────
  if (position === 'PG') base += 0.025;  // primary ball-handler; most pressure
  else if (position === 'SG') base += 0.010;
  else if (position === 'C' || position === 'PF') base -= 0.015;

  // ── Fatigue: low-stamina players lose ball security late in games ─────────
  if (stamina !== undefined) {
    base += Math.max(0, (60 - stamina) / 100 * 0.030);
  }

  // ── Personality trait modifiers ───────────────────────────────────────────
  if (personalityTraits) {
    if (personalityTraits.includes('Diva/Star'))           base *= 1.25; // ballhogs, risky iso
    if (personalityTraits.includes('Lazy'))                base *= 1.20; // low IQ decisions
    if (personalityTraits.includes('Hot Head'))            base *= 1.12; // erratic passes
    if (personalityTraits.includes('Professional'))        base *= 0.88; // clean decisions
    if (personalityTraits.includes('Leader'))              base *= 0.92; // composed under pressure
    if (personalityTraits.includes('Friendly/Team First')) base *= 0.90; // careful ball-mover
  }

  return Math.max(0.08, Math.min(0.30, base));
}

/**
 * Returns an AST-efficiency multiplier driven by passing, playmaking, ball handling,
 * offensive IQ, kick-out tendency, and turnover rate.
 *
 * Primary factors (what determines a playmaker's ceiling):
 *   passing (50%) — vision and accuracy on the pass
 *   playmaking (35%) — court command, finding openings
 *   ballHandling (15%) — securing the ball under pressure on drives/passes
 *
 * Contextual modifiers:
 *   offIQ bonus  — sharp readers anticipate cuts, deliver on-time passes
 *   kickOut bonus — high kick-out tendency = more willing to pass vs. forcing shots
 *   toPenalty    — sloppy passers break possessions before the assist can happen
 *
 * Output range [0.15, 1.40] (was 0.20–1.05) to allow elite playmakers to reach
 * 12–18+ assists on exceptional nights without an artificial ceiling.
 *   Elite playmaker (pass=92, pm=88, bh=87, iq=88, ko=78, toRate=0.09) → ~1.18
 *   Good creator   (pass=82, pm=78, bh=80, iq=74, ko=62, toRate=0.12) → ~0.90
 *   Avg creator    (pass=74, pm=70, bh=72, iq=70, ko=50, toRate=0.14) → ~0.73
 *   Poor passer    (pass=55, pm=50, bh=52, iq=60, ko=35, toRate=0.18) → ~0.44
 */
export function getAssistEfficiency(
  passing:         number,
  playmaking:      number,
  offIQ:           number,
  toRate:          number,
  ballHandling:    number = 70,   // direct ball security on passes; defaults to league avg
  kickOutTendency: number = 50,   // 0–100 willingness to kick out vs. forcing shots
): number {
  // Primary blend: passing vision (50%) + playmaking (35%) + ball security (15%)
  const blend = (passing * 0.50 + playmaking * 0.35 + ballHandling * 0.15) / 100;
  // Sharp readers anticipate cuts — IQ 90 → +2.4%; IQ 50 → −2.4%
  const iqBonus = (offIQ - 70) / 100 * 0.12;
  // Kick-out tendency: willingness to pass creates extra assist chances
  // kickOut 80 → +3.6%; kickOut 20 → −3.6%
  const kickOutBonus = (kickOutTendency - 50) / 100 * 0.09;
  // High-TO passers force broken plays: penalty ramps 0→8% as toRate > 13%
  const toPenalty = Math.max(0, Math.min(0.08, (toRate - 0.13) / 0.07 * 0.08));

  return Math.max(0.15, Math.min(1.80, blend + iqBonus + kickOutBonus - toPenalty));
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
 * Tuning: STL_OPP_SCALE in simulatePlayerGameLine (default 48) controls the
 * number of steal opportunities per 48 min; raise/lower it to shift team totals.
 */
export function getStealChance(attr: number, position?: string, defIQ?: number): number {
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

  // ── Defensive IQ: anticipation and positioning amplify steal reads ────────
  // IQ 50 = no change; IQ 80 = +4.5 % relative; IQ 30 = −3 % relative.
  // Smart defenders time reads and cut off passing lanes; low-IQ ones guess wrong.
  if (defIQ !== undefined) {
    base *= (1 + (defIQ - 50) / 100 * 0.15);
  }

  return Math.max(0.005, Math.min(0.080, base));
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
 * Tuning: BLK_OPP_SCALE in simulatePlayerGameLine (default 35) controls the
 * number of block opportunities per 48 min; raise/lower to shift team totals.
 */
export function getBlockChance(attr: number, position?: string, defIQ?: number): number {
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

  // ── Defensive IQ: smarter help-side rotations generate cleaner block opps ─
  // IQ 50 = no change; IQ 85 = +3.5 % relative; IQ 30 = −2 % relative.
  // High IQ = picks right moment to rotate; low IQ = arrives late or not at all.
  if (defIQ !== undefined) {
    base *= (1 + (defIQ - 50) / 100 * 0.10);
  }

  return Math.max(0.005, Math.min(0.160, base));
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
  defIQ?: number,
): number {
  const attr       = Math.max(0, Math.min(100, perimDefAttr));
  const normalized = (attr - 50) / 50; // -1 (worst) … 0 (avg) … +1 (best)

  // Per-context suppression/reward ceiling (tunable)
  const RANGES: Record<Shot3PTContext, { down: number; up: number }> = {
    CATCH_AND_SHOOT_3: { down: 0.075, up: 0.030 }, // closeout quality matters most
    PULL_UP_3:         { down: 0.050, up: 0.020 }, // self-created; harder to fully contest
    TEAM_BOX_SCORE:    { down: 0.040, up: 0.016 }, // per-game average over many possessions
  };

  const { down, up } = RANGES[context];
  // Elite defense (normalized > 0): linear penalty up to -down
  // Poor defense  (normalized < 0): linear reward up to +up (smaller)
  let result = normalized >= 0
    ? -normalized * down
    : -normalized * up;

  // Defensive IQ: smart defenders read shooter tendencies, get hands up faster,
  // and close out without over-committing. Additive shift independent of attr.
  // IQ 80 → extra −0.003 suppression; IQ 30 → extra +0.002 (lazier closeout).
  if (defIQ !== undefined) {
    result -= (defIQ - 50) / 100 * 0.010;
  }

  return result;
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
  defIQ?: number,
): number {
  const attr       = Math.max(0, Math.min(100, perimDefAttr));
  const normalized = (attr - 50) / 50; // −1 (worst) … 0 (avg) … +1 (best)

  const RANGES: Record<MidRangeContext, { down: number; up: number }> = {
    // Pull-up iso / step-back: self-created, harder to fully contest
    PULL_UP_MID:          { down: 0.070, up: 0.022 },
    // Elbow face-up / catch-and-shoot mid: defender is closer; easier to get a hand up
    ELBOW_FADE:           { down: 0.090, up: 0.028 },
    // Per-game team average — smoothed across many possessions
    TEAM_BOX_SCORE_MID:   { down: 0.055, up: 0.018 },
  };

  const { down, up } = RANGES[context];
  let result = normalized >= 0
    ? -normalized * down   // elite D: 0 → −down
    : -normalized * up;    // poor D:  0 → +up

  // Defensive IQ: smart defenders position earlier on closeouts,
  // don't bite on shot fakes, and funnel to help. Same additive shift as 3PT.
  if (defIQ !== undefined) {
    result -= (defIQ - 50) / 100 * 0.012;
  }

  return result;
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
    DRIVE_LAYUP:    { down: 0.110, up: 0.045 }, // elite protector: up to −11 % per drive
    POST_FADE:      { down: 0.070, up: 0.030 }, // post-up: less direct rim contest
    TEAM_BOX_SCORE: { down: 0.060, up: 0.045 }, // team game average — elite D gives real edge
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
  const minFac      = Math.min(1, ctx.minutesPlayed / 44); // full penalty at 44+ mins
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
  // Off IQ: smart finishers read help rotations and pick the right counter move.
  // IQ 80 → +1.5 % layup%; IQ 30 → −1.0 %. Capped at ±2.5 %.
  const iqBonus  = offensiveIQ !== undefined
    ? Math.max(-0.025, Math.min(+0.025, (offensiveIQ - 50) / 100 * 0.05))
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
  // Calibrated to NBA 2025-26: average team scores ~112 pts on ~100 possessions (1.12 PPP).
  // Slow teams grind to ~1.04, fast teams push to ~1.12. Elite offenses hit ~1.18.
  const basePPP = gamePace <= 70 ? 0.98 :
                  gamePace <= 80 ? 1.04 :
                  gamePace <= 90 ? 1.08 : 1.12;
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

  // Hard clamp: no team below 76 (top-10 avg) or above 92
  teams.forEach(t => {
    let ovr = teamOVR(t);
    if (ovr < 76) {
      // Boost weakest players +3 until we reach 76
      const sorted = t.roster.slice().sort((a, b) => a.rating - b.rating);
      for (const p of sorted) {
        if (teamOVR(t) >= 76) break;
        const real = t.roster.find(r => r.id === p.id)!;
        real.rating = Math.min(92, real.rating + 3);
        real.attributes.shooting = Math.min(99, real.attributes.shooting + 2);
      }
    } else if (ovr > 92) {
      const sorted = t.roster.slice().sort((a, b) => b.rating - a.rating);
      for (const p of sorted) {
        if (teamOVR(t) <= 92) break;
        const real = t.roster.find(r => r.id === p.id)!;
        real.rating = Math.max(76, real.rating - 3);
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

/** Returns gender-appropriate pronouns for a player. Non-binary and unknown → they/them. */
const pronouns = (p: Player | undefined): { he: string; He: string; him: string; his: string; His: string; himself: string } => {
  const g = p?.gender;
  if (g === 'Female')     return { he: 'she',  He: 'She',  him: 'her',  his: 'her',   His: 'Her',   himself: 'herself' };
  if (g === 'Non-binary') return { he: 'they', He: 'They', him: 'them', his: 'their', His: 'Their', himself: 'themselves' };
  return                         { he: 'he',   He: 'He',   him: 'him',  his: 'his',   His: 'His',   himself: 'himself'  };
};

// ─── Possession Types ─────────────────────────────────────────────────────────
type OffAction  = 'ISO' | 'POST_UP' | 'DRIVE' | 'PASS_FIRST' | 'TRANSITION' | 'SPOT_UP' | 'CUT';
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

// ─── Defensive Foul + Steal/Block Resolution ─────────────────────────────────
//
// TUNABLE WEIGHTS — adjust these to calibrate team-level foul totals.
//
//   GAMBLE_FOUL_W   (0.15) — raise to make high-Gambles defenders commit more
//                             reach-in fouls.
//   PHYSICS_FOUL_W  (0.12) — raise to penalise high-Physicality defenders on
//                             contact plays (body fouls, blocking fouls).
//   DISCIP_FOUL_R   (0.08) — raise to give more relief to disciplined contesters
//                             (clean hands-up reduces foul risk).
//   IQ_FOUL_DAMPEN  (0.30) — raise to let smart defenders avoid bad fouls more,
//                             and let low-IQ defenders commit extra dumb fouls.
//   HELP_FOUL_EXTRA (0.06) — raise to penalise out-of-position help rotations.
//
// Calibration targets (NBA 2025-26):
//   • League avg PF ≈ 18-20 per team per game
//   • Aggressive wing (Gambles 80+, Physicality 85+): ~4-5 PF/game
//   • Disciplined rim protector (Discipline 75+, IQ 80+): ~2-3 PF/game
//   • Moderate-gambles player (Gambles ~50, Physicality ~70): ~2-3 PF/game
//
// Example — Gambles 47, Physicality 87, Discipline 69, IQ 83:
//   steal: 0.05 + (47/100)×0.15 + (87/100)×0.12 − (69/100)×0.08 = 0.160
//   × IQ scale (1 − 0.83×0.20) = ×0.834 → ~13 % foul risk per steal attempt
//   Attempt freq = gambles/400 ≈ 12 %; reach-in fouls ≈ 0.9/game from steals
//   + block fouls + onBallPest fouls → total ≈ 2.5–3.5 PF/game  ✓
const GAMBLE_FOUL_W   = 0.15;
const PHYSICS_FOUL_W  = 0.12;
const DISCIP_FOUL_R   = 0.08;
const IQ_FOUL_DAMPEN  = 0.30;
const HELP_FOUL_EXTRA = 0.06;

/** Situational context passed to the defensive-action resolvers. */
interface DefActionContext {
  /** Defender is a weakside help rotator, not the primary on-ball defender. */
  isHelp:   boolean;
  /** Defender is guarding the active ball-handler directly. */
  isOnBall: boolean;
}

/**
 * Returns the probability [0.02 – 0.25] that a defensive action draws a foul.
 *
 * Formula (before IQ dampen):
 *   base  (steal 5 % / block 4 %)
 *   + gambles      × GAMBLE_FOUL_W    ← reach-in / illegal-contact risk
 *   + physicality  × PHYSICS_FOUL_W   ← contact foul on contests
 *   − discipline   × DISCIP_FOUL_R    ← clean hands-up reduces risk
 *   + (isHelp ? helpDef × HELP_FOUL_EXTRA : 0)  ← out-of-position rotation
 *   × (1 − defIQ × IQ_FOUL_DAMPEN)              ← smart players avoid bad fouls
 */
function calculateDefFoulChance(
  dt: NonNullable<Player['tendencies']>['defensiveTendencies'] | undefined,
  attrs: Player['attributes'],
  actionType: 'steal' | 'block',
  ctx: DefActionContext,
): number {
  const gambles     = dt?.gambles               ?? 50;
  const physicality = dt?.physicality           ?? 50;
  const discipline  = dt?.shotContestDiscipline ?? 50;
  const helpDef     = dt?.helpDefender          ?? 50;
  const defIQ       = attrs.defensiveIQ;

  // Blocks start from a slightly lower base (hands-up contest vs. reaching grab)
  const base      = actionType === 'steal' ? 0.05 : 0.04;
  const gambleMod = (gambles     / 100) * GAMBLE_FOUL_W;   // 47 → +0.071
  const physMod   = (physicality / 100) * PHYSICS_FOUL_W;  // 87 → +0.104
  const discMod   = -(discipline / 100) * DISCIP_FOUL_R;   // 69 → −0.055
  const helpMod   = ctx.isHelp ? (helpDef / 100) * HELP_FOUL_EXTRA : 0;
  // Centred on IQ=50: smart defenders commit fewer fouls, low-IQ ones commit more.
  // IQ 95 → ×0.865 (−13.5 %); IQ 80 → ×0.91; IQ 50 → ×1.0; IQ 30 → ×1.06; IQ 10 → ×1.12
  const iqScale   = 1 - (defIQ - 50) / 100 * IQ_FOUL_DAMPEN;

  return Math.max(0.02, Math.min(0.25,
    (base + gambleMod + physMod + discMod + helpMod) * iqScale,
  ));
}

/** Return type for attemptDefensiveSteal. */
interface DefStealResult {
  outcome: 'steal' | 'foul' | 'nothing';
  pbpText: string;
}

/**
 * Resolves a single steal attempt using the full tendency + attribute model.
 *
 * Probability chain:
 *   1. Foul roll (reach-in / illegal contact) — returns foul early if hit.
 *   2. Steal success roll — scaled by gambles, helpDefender, onBallPest
 *      tendencies, then attenuated by the handler's ballHandling attribute.
 *   3. 'nothing' — reach failed; caller applies +0.15 defenseModifier penalty.
 *
 * PBP text differentiates help-lane reads vs. on-ball pokes vs. wild gambles.
 */
function attemptDefensiveSteal(
  defender: Player,
  offHandler: Player,
  ctx: DefActionContext,
): DefStealResult {
  const dt      = defender.tendencies?.defensiveTendencies;
  const gambles = dt?.gambles      ?? 50;
  const helpDef = dt?.helpDefender ?? 50;
  const pest    = dt?.onBallPest   ?? 50;
  const defLn   = defender.name.split(' ').at(-1) ?? defender.name;

  // Attribute-driven base steal chance — defIQ amplifies anticipation/positioning
  const baseChance = getStealChance(defender.attributes.steals, defender.position, defender.attributes.defensiveIQ);

  // Tendency multipliers scale how often a reach converts to a steal:
  //   Gambles ×1.5: high-gambles players get more conversions on their reaches
  //   HelpDef ×2.0 in help / ×0.8 off-ball: help defenders read passing lanes
  //   OnBallPest ×1.8 on-ball / ×0.6 off: tight coverage creates steal angles
  const gambleMod = (gambles / 100) * 1.5;
  const helpMod   = (helpDef / 100) * (ctx.isHelp ? 2.0 : 0.8);
  const pestMod   = (pest    / 100) * (ctx.isOnBall ? 1.8 : 0.6);

  // Elite ball-handlers protect the ball — attenuates steal % for good handlers
  const bhPenalty = Math.max(0, (offHandler.attributes.ballHandling - 50) / 100 * 0.40);

  const adjustedSteal = Math.max(0.01, Math.min(0.45,
    baseChance * (1 + gambleMod + helpMod + pestMod)
    - bhPenalty
    + (Math.random() * 0.01 - 0.005),   // ±0.5 % noise
  ));

  // ── 1. Foul roll — reaching defenders risk illegal-contact calls ─────────
  const foulChance = calculateDefFoulChance(dt, defender.attributes, 'steal', ctx);
  if (Math.random() < foulChance) {
    const pbpText = gambles >= 75
      ? `${defLn} lunges for the steal — reach-in foul!`
      : ctx.isHelp
        ? `${defLn} gambles rotating into the lane — foul on the help defender!`
        : `${defLn} reaches in — illegal contact, foul called!`;
    return { outcome: 'foul', pbpText };
  }

  // ── 2. Steal success roll ────────────────────────────────────────────────
  if (Math.random() < adjustedSteal) {
    const pbpText = ctx.isHelp
      ? `${defLn} reads the pass — intercepts it in the lane! Turnover.`
      : gambles >= 70
        ? `${defLn} gambles for the steal — picks his pocket! Turnover.`
        : pest >= 65
          ? `${defLn} pokes it free — steal!`
          : `${defLn} deflects it — steal!`;
    return { outcome: 'steal', pbpText };
  }

  // ── 3. Nothing — reach failed; defender is out of position ──────────────
  return { outcome: 'nothing', pbpText: `${defLn} reaches — out of position.` };
}

/** Return type for attemptDefensiveBlock. */
interface DefBlockResult {
  outcome: 'block' | 'foul' | 'contest';
  pbpText: string;
}

/**
 * Resolves a block attempt on a non-dunk shot (DRIVE_LAYUP or POST_FADE).
 * Dunk blocks are handled separately via the intNorm path in simulatePossession.
 *
 * Foul risks:
 *   • High Physicality → body contact during contest → shooting foul
 *   • Low ShotContestDiscipline → bites pump fake / wild swipe → blocking foul
 *   • Help rotations that arrive off-balance → charging/blocking call
 *
 * Probability chain:
 *   1. Foul roll — shooting or blocking foul; returns early.
 *   2. Block roll — clean rejection (hands, length, timing).
 *   3. 'contest' — neither; rim-protection modifier still applies via caller.
 */
function attemptDefensiveBlock(
  defender: Player,
  shotType: ShotType,
  offAction: OffAction,
  ctx: DefActionContext,
): DefBlockResult {
  const dt          = defender.tendencies?.defensiveTendencies;
  const discipline  = dt?.shotContestDiscipline ?? 50;
  const helpDef     = dt?.helpDefender          ?? 50;
  const physicality = dt?.physicality           ?? 50;
  const defLn       = defender.name.split(' ').at(-1) ?? defender.name;

  // Base block % from attribute curve — defIQ improves help-side timing and footwork
  const baseChance = getBlockChance(defender.attributes.blocks, defender.position, defender.attributes.defensiveIQ);

  // Tendency multipliers (averaged to prevent triple-stacking):
  //   Discipline ×1.2: clean contests → better hand positioning → more blocks
  //   Help ×2.5 in help: rotating defender arrives with momentum for a clean block
  //   Physicality ×1.1: stronger bodies close off lanes and win block opportunities
  const discMult = (discipline  / 100) * 1.2;
  const helpMult = (helpDef     / 100) * (ctx.isHelp ? 2.5 : 1.0);
  const physMult = (physicality / 100) * 1.1;

  const adjustedBlock = Math.max(0.01, Math.min(0.20,
    baseChance * (discMult + helpMult + physMult) / 3
    + (Math.random() * 0.02 - 0.01),   // ±1 % noise
  ));

  // ── 1. Foul roll — contact / undisciplined contests risk foul calls ──────
  const foulChance = calculateDefFoulChance(dt, defender.attributes, 'block', ctx);
  if (Math.random() < foulChance) {
    const pbpText = physicality >= 80
      ? `${defLn} makes body contact going for the block — shooting foul!`
      : ctx.isHelp
        ? `${defLn} rotates too aggressively — foul on the help-side block!`
        : discipline < 45
          ? `${defLn} bites on the pump fake and swipes — blocking foul!`
          : `${defLn} gets a piece of him — blocking foul called!`;
    return { outcome: 'foul', pbpText };
  }

  // ── 2. Block roll — clean rejection ─────────────────────────────────────
  if (Math.random() < adjustedBlock) {
    const blkAttr = defender.attributes.blocks;
    const pbpText = ctx.isHelp
      ? blkAttr >= 85
          ? `${defLn} comes from the weak side — HELP BLOCK! Huge swing play.`
          : `${defLn} rotates and deflects it — great help-side block!`
      : blkAttr >= 90
          ? `${defLn} pins it against the glass! Elite rim protection.`
          : blkAttr >= 78
              ? `${defLn} rises and rejects it cleanly!`
              : `${defLn} gets a piece of it — blocked!`;
    return { outcome: 'block', pbpText };
  }

  // ── 3. Contest — no block, no foul; rim-protection modifier still applies ─
  return { outcome: 'contest', pbpText: `${defLn} contests.` };
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
  const oP       = pronouns(offHandler);   // offender pronouns
  const dP       = pronouns(defender);     // defender pronouns

  // ── Step 1: Transition? ───────────────────────────────────────────────────
  const transHunter = ot?.transitionHunter ?? 50;
  const isTransition = transHunter >= 70
    ? Math.random() < 0.40
    : transHunter >= 50 ? Math.random() < 0.15 : Math.random() < 0.05;

  // ── Step 2: Offensive action ──────────────────────────────────────────────
  // Uses the pseudo-code base-score approach:
  //   score = baselineScore × (tendency / 50) × multiplier
  // then contextual boosts are applied, ±5 noise is added, and a weighted
  // random pick is made.  SPOT_UP and CUT are now first-class actions.
  let offAction: OffAction;
  if (isTransition) {
    offAction = 'TRANSITION';
  } else {
    // ── Contextual flags ────────────────────────────────────────────────────
    // isInPost: big man already sealed on the block
    const isInPost     = (offHandler.position === 'C' || offHandler.position === 'PF')
                         && Math.random() < 0.45 + (ot?.postUp ?? 50) / 200;
    // isOpen: catch situation where the off-ball shooter has space
    const isOpen       = Math.random() < Math.max(0.15, 0.60 - (dt?.denyThePass ?? 50) / 125);
    // isCloseOut: defense was late recovering → drive out of a spot-up catch
    const isCloseOut   = isOpen && Math.random() < 0.30 + (ot?.attackCloseOuts ?? 50) / 280;
    // isPnRHandler: PG/SG coming off a screen with pull-up potential
    const isPnRHandler = (offHandler.position === 'PG' || offHandler.position === 'SG')
                         && Math.random() < 0.25 + (ot?.pullUpOffPnr ?? 50) / 200;
    // isClutch: late-game, score is close, player has the clutch tendency
    const isClutch     = situationalBoost > 0.03 && (ot?.clutchShotTaker ?? 50) > 50;
    // dhoBoost: dribble hand-off player weights DRIVE and PASS_FIRST heavier
    const dhoBoost     = (ot?.dribbleHandOff ?? 50) / 100;

    // ── Base scores × tendency multipliers ─────────────────────────────────
    // Baseline reflects a "neutral 50-tendency" starting frequency.
    // Dividing by 50 keeps the multiplier centred at 1×, so values above 50
    // increase the weight and values below 50 decrease it.
    const scores: Partial<Record<OffAction, number>> = {
      ISO:        30  * (ot?.isoHeavy      ?? 50) / 50,
      POST_UP:    28  * (ot?.postUp        ?? 50) / 50 * 1.8,
      DRIVE:      38  * (ot?.driveToBasket ?? 50) / 50 * 1.5 + dhoBoost * 12,
      PASS_FIRST: 45  * (ot?.kickOutPasser ?? 50) / 50 * 1.2
                      + (100 - (ot?.isoHeavy ?? 50)) / 100 * 20
                      + dhoBoost * 18,
      SPOT_UP:    32  * (ot?.spotUp        ?? 50) / 50 * 1.6,
      CUT:        22  * (ot?.cutter        ?? 50) / 50 * 1.8,
    };

    // ── Contextual boosts ───────────────────────────────────────────────────
    if (isInPost)     scores.POST_UP!   *= 3.5;  // dominant position on block
    if (isOpen)       scores.SPOT_UP!   *= 2.8;  // wide open in the corner
    if (isCloseOut)   scores.DRIVE!     *= 2.0;  // attack the scrambling defender
    if (isPnRHandler) scores.DRIVE!     *= 1.6;  // coming off a screen, attack downhill
    if (isClutch) {
      scores.ISO!   *= 1.4;   // isolation hero ball in the clutch
      scores.DRIVE! *= 1.2;
    }

    // ── ±5 noise for possession-to-possession variance ──────────────────────
    for (const k of Object.keys(scores) as OffAction[]) {
      scores[k] = (scores[k] ?? 0) + (Math.random() * 10 - 5);
    }

    // ── Playbook multipliers: coach's scheme biases shot selection ───────────
    // Pace and Space → more spot-up 3s, fewer posts.
    // Grit and Grind → heavy post emphasis, fewer perimeter shots.
    // Triangle → ball-movement cuts, punishes iso ball.
    // Small Ball → drive-heavy, no post-ups.
    // Showtime → transition/drive focus, minimal half-court post.
    // Balanced → no adjustments.
    const schemeActionMults: Partial<Record<OffAction, number>> = (() => {
      switch (scheme) {
        case 'Pace and Space': return { ISO: 0.70, POST_UP: 0.45, DRIVE: 1.25, PASS_FIRST: 1.15, SPOT_UP: 2.20, CUT: 1.30 };
        case 'Grit and Grind': return { ISO: 1.40, POST_UP: 2.20, DRIVE: 0.75, PASS_FIRST: 0.85, SPOT_UP: 0.55, CUT: 0.80 };
        case 'Triangle':       return { ISO: 0.45, POST_UP: 1.00, DRIVE: 0.90, PASS_FIRST: 2.10, SPOT_UP: 1.20, CUT: 2.30 };
        case 'Small Ball':     return { ISO: 0.65, POST_UP: 0.35, DRIVE: 1.90, PASS_FIRST: 1.25, SPOT_UP: 1.70, CUT: 1.50 };
        case 'Showtime':       return { ISO: 0.60, POST_UP: 0.40, DRIVE: 2.00, PASS_FIRST: 1.55, SPOT_UP: 1.35, CUT: 1.80 };
        default: return {};  // Balanced: no adjustments
      }
    })();
    for (const k of Object.keys(scores) as OffAction[]) {
      const m = schemeActionMults[k];
      if (m !== undefined) scores[k] = (scores[k] ?? 0) * m;
    }

    // ── Weighted pick (floor at 0 to avoid negative weights) ───────────────
    const pool: { value: OffAction; weight: number }[] = (
      Object.entries(scores) as [OffAction, number][]
    ).filter(([, w]) => w > 0)
     .map(([value, weight]) => ({ value, weight }));

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
    case 'SPOT_UP':
      // Off-ball spot-up: catch on the perimeter and fire immediately
      shotType = 'CATCH_AND_SHOOT_3';
      break;
    case 'CUT':
      // Backdoor / basket cut: receives pass at the rim
      shotType = 'DRIVE_LAYUP';
      break;
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
        ? `${ln} gets to ${oP.his} spot at the elbow — money every time...`
        : tendencyScore >= 70
          ? `${ln} rises up from the elbow — that's ${oP.his} spot...`
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
            ? `${ln} rises up and POSTERIZES ${dP.him} — windmill, one-hand, raw POWER!`
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

      if (offAction === 'CUT') {
        tendencyUsed  = 'cutter';
        tendencyScore = ot?.cutter ?? 50;
        // Cuts generate high-efficiency uncontested looks at the rim
        const m = (tendencyScore / 100) * 0.12;
        shotModifier = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
        pbpBase = tendencyScore >= 80
          ? `${ln} back-cuts off the weak side — catches it in stride!`
          : tendencyScore >= 60
            ? `${ln} cuts hard to the basket...`
            : `${ln} slips in off a cut...`;
      } else {
        tendencyUsed  = 'driveToBasket';
        tendencyScore = ot?.driveToBasket ?? 50;
        const m       = (tendencyScore / 100) * 0.10;
        shotModifier  = tendencyScore >= 70 ? +m : tendencyScore < 30 ? -m : 0;
      }
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
        ? `${ln} seals deep, drops the shoulder, and goes to ${oP.his} bag...`
        : tendencyScore >= 75
          ? `${ln} backs down ${oP.his} defender in the post, drops ${oP.his} shoulder and goes to work...`
          : tendencyScore < 35
            ? `${ln} is forced into an uncomfortable post-up...`
            : `${ln} goes to work in the post...`;
      break;
    }
    case 'CATCH_AND_SHOOT_3': {
      // Catch-and-shoot is a quality look; base is the expected %, tendency/spot-up modifiers lift it further
      baseProb = getThreePointPercentage(offHandler.attributes.shooting3pt);
      if (offAction === 'SPOT_UP') {
        // Pure spot-up shooter: the primary tendency is spotUp, not kickOutPasser
        tendencyUsed  = 'spotUp';
        tendencyScore = ot?.spotUp ?? 50;
        // Specialist spot-up shooters earn a larger bonus for staying in their corners
        shotModifier  = +0.04 + ((tendencyScore - 50) / 100) * 0.10;
        shotModifier += ((ot?.offScreen ?? 50) - 50) / 100 * 0.04;
        pbpBase = tendencyScore >= 80
          ? `${ln} sets ${oP.his} feet in the corner — pure shooter's stroke incoming...`
          : tendencyScore >= 60
            ? `${ln} spots up and catches in rhythm...`
            : `${ln} catches on the wing and fires...`;
      } else {
        tendencyUsed  = 'kickOutPasser';
        tendencyScore = ot?.kickOutPasser ?? 50;
        shotModifier  = +0.04;
        // Spot Up / Off Screen: well-positioned off-ball shooter earns higher-quality looks
        shotModifier += ((ot?.spotUp    ?? 50) - 50) / 100 * 0.06;
        shotModifier += ((ot?.offScreen ?? 50) - 50) / 100 * 0.04;
        pbpBase = offAction === 'PASS_FIRST'
          ? `${ln} swings it and finds the open man in the corner...`
          : `${ln} kicks it out to the shooter...`;
      }
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
      // Offensive IQ amplifies foul-drawing: smart players know how to absorb contact,
      // time their body lean, and sell the call without flopping (sustainable technique).
      // IQ 60 = baseline; IQ 80 = +5 %; IQ 95 = +8.75 %.
      const offIQFoulBoost = 1 + Math.max(0, offHandler.attributes.offensiveIQ - 60) / 100 * 0.25;
      if (Math.random() < (drawFoulTend - 50) / 100 * 0.28 * offIQFoulBoost) {
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

    // Gambles / steal attempt — delegated to attemptDefensiveSteal helper
    if (defender && Math.random() < gambles / 400) {
      const stealCtx: DefActionContext = {
        isHelp:    offAction === 'PASS_FIRST' || offAction === 'CUT',
        isOnBall:  offAction === 'ISO' || offAction === 'DRIVE',
      };
      const stealResult = attemptDefensiveSteal(defender, offHandler, stealCtx);
      if (stealResult.outcome === 'steal') {
        return {
          ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
          tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
          tendencyScore, shotModifier: 0, conflictFired: false,
          defenderTendency: 'gambles', defenseModifier: 0,
          finalShotProbability: 0, result: 'STEAL',
          stolenBy: defender.name, isTransition, defenderRef: defender,
          pbpText: stealResult.pbpText,
        };
      }
      if (stealResult.outcome === 'foul') {
        return {
          ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
          tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
          tendencyScore, shotModifier: 0, conflictFired: false,
          defenderTendency: 'gambles', defenseModifier: 0,
          finalShotProbability: 0, result: 'FOUL_DRAWN',
          foulsOn: defender.name, isTransition, defenderRef: defender,
          pbpText: stealResult.pbpText,
        };
      }
      // 'nothing' — reach failed; defender out of position
      defenseModifier += 0.15;
      defTendencyUsed  = 'gambles';
      pbpDefPrefix     = `${defLn} reaches — out of position. `;
    }

    // ── Help defender ─────────────────────────────────────────────────────────
    // Help rotations give elite help-defenders two chances:
    //   (a) a help-side steal if the offense telegraphs the pass/drive entry
    //   (b) a contested block/denial that suppresses shot quality
    // Both carry foul risk because the help defender arrives at speed with
    // less body control than the primary on-ball defender.
    if (shotType === 'DRIVE_LAYUP' || shotType === 'POST_FADE') {
      if (helpDef >= 70) {
        // ── (a) Help steal opportunity (passing-lane read on drive entry) ───────
        // Fires when helpDef is elite (≥80) and the driver telegraphs the pass.
        // Probability: helpDef 80 → ~6 %; helpDef 90 → ~9 %
        if (helpDef >= 80 && Math.random() < (helpDef - 70) / 100 * 0.60) {
          // Foul check first: help rotations at speed risk body contact
          const helpFoulCtx: FoulContext = { isHelpSituation: true, isOnBall: false };
          const helpFoulChance = calculateFoulChance(defender as Player, 'steal', helpFoulCtx);
          if (defender && Math.random() < helpFoulChance) {
            return {
              ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
              tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
              tendencyScore, shotModifier: 0, conflictFired: false,
              defenderTendency: 'helpDefender', defenseModifier: 0,
              finalShotProbability: 0, result: 'FOUL_DRAWN',
              foulsOn: defender?.name, isTransition, defenderRef: defender,
              pbpText: `${defLn} rotates hard from help side — arrives with contact, foul called!`,
            };
          }
          // Clean help steal
          return {
            ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
            tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
            tendencyScore, shotModifier: 0, conflictFired: false,
            defenderTendency: 'helpDefender', defenseModifier: 0,
            finalShotProbability: 0, result: 'STEAL',
            stolenBy: defender?.name, isTransition, defenderRef: defender,
            pbpText: `${defLn} sneaks in from the weak side and deflects the entry pass — turnover!`,
          };
        }

        // ── (b) Quality help contest suppresses shot quality ─────────────────
        defenseModifier -= 0.08;
        defTendencyUsed  = 'helpDefender';
        pbpDefPrefix     = `${defLn} rotates over from the weak side. `;
        if ((defender?.attributes.defensiveIQ ?? 70) < 55) {
          // Low-IQ help defender over-rotates — offensive kick-out reads the rotation
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
      pbpBase += ` ${defLn} met ${oP.him} at the rim with contact.`;
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
        // getBlockChance: attribute-driven per-shot block %, amplified by rim position.
        // Hard cap at 15 % for even elite rim protectors.
        const blockChance = Math.min(0.15,
          getBlockChance(defender?.attributes.blocks ?? 50, defender?.position, defender?.attributes.defensiveIQ ?? 50)
          * intNorm * 2.2,
        );

        // ── Foul check: aggressive rim protection carries shooting-foul risk ──────
        // Physical defenders (Phys 87, Disc 69, IQ 83) → ~15–17 % raw block foul.
        // We apply at 40 % weight — many contests are clean rejections.
        if (defender) {
          const blockFoulCtx: FoulContext = {
            isHelpSituation: helpDef >= 70,
            isOnBall: false,
          };
          const blockFoulChance = calculateFoulChance(defender, 'block', blockFoulCtx);
          if (Math.random() < blockFoulChance * 0.40) {
            const foulLine = (defender.attributes.physicality ?? physicality) >= 85
              ? `${defLn} goes up strong but catches the shooter on the way up — shooting foul!`
              : `${defLn} contests the dunk but makes contact — foul called!`;
            return {
              ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
              tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
              tendencyScore, shotModifier: 0, conflictFired: false,
              defenderTendency: 'physicality', defenseModifier: 0,
              finalShotProbability: 0, result: 'FOUL_DRAWN',
              foulsOn: defender?.name, isTransition, defenderRef: defender,
              pbpText: foulLine,
            };
          }
        }


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
          pbpBase += ` ${defLn} rises to meet ${oP.him} at the rim!`;
        } else if (intDef <= 30) {
          pbpDefPrefix = pbpDefPrefix || `${defLn} has no answer — clear path to the rim — `;
        }
      } else {
        // Standard layup — try attemptDefensiveBlock helper
        if (defender) {
          const blockCtx: DefActionContext = {
            isHelp:   helpDef >= 65,
            isOnBall: offAction === 'DRIVE' || offAction === 'CUT',
          };
          const blockResult = attemptDefensiveBlock(defender, shotType, offAction, blockCtx);
          if (blockResult.outcome === 'block') {
            return {
              ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
              tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
              tendencyScore, shotModifier, conflictFired: false,
              defenderTendency: 'blocks', defenseModifier,
              finalShotProbability: 0, result: 'MISSED',
              isTransition, defenderRef: defender,
              pbpText: blockResult.pbpText,
            };
          }
          if (blockResult.outcome === 'foul') {
            return {
              ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
              tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
              tendencyScore, shotModifier: 0, conflictFired: false,
              defenderTendency: 'physicality', defenseModifier: 0,
              finalShotProbability: 0, result: 'FOUL_DRAWN',
              foulsOn: defender.name, isTransition, defenderRef: defender,
              pbpText: blockResult.pbpText,
            };
          }
          // 'contest' — use PBP flavour from attribute level
        }
        if (intDef >= 80 && rimContestMod <= -0.06) {
          if (!defTendencyUsed) defTendencyUsed = 'interiorDef';
          pbpDefPrefix = pbpDefPrefix || `${defLn} meets ${oP.him} at the rim — massive contest — `;
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

      // Block attempt on post fade — help rotations and length defenders can reject
      if (defender) {
        const blockCtx: DefActionContext = {
          isHelp:   helpDef >= 65,
          isOnBall: offAction === 'POST_UP',
        };
        const blockResult = attemptDefensiveBlock(defender, shotType, offAction, blockCtx);
        if (blockResult.outcome === 'block') {
          return {
            ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
            tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
            tendencyScore, shotModifier, conflictFired: false,
            defenderTendency: 'blocks', defenseModifier,
            finalShotProbability: 0, result: 'MISSED',
            isTransition, defenderRef: defender,
            pbpText: blockResult.pbpText,
          };
        }
        if (blockResult.outcome === 'foul') {
          return {
            ballHandlerName: offHandler.name, ballHandlerId: offHandler.id,
            tendencyUsed: tendencyUsed || offAction, actionTaken: offAction,
            tendencyScore, shotModifier: 0, conflictFired: false,
            defenderTendency: 'physicality', defenseModifier: 0,
            finalShotProbability: 0, result: 'FOUL_DRAWN',
            foulsOn: defender.name, isTransition, defenderRef: defender,
            pbpText: blockResult.pbpText,
          };
        }
        // 'contest' — post defense modifier already applied above
      }

      if (intDef >= 85 && postDefMod <= -0.10) {
        if (!defTendencyUsed) defTendencyUsed = 'interiorDef';
        pbpDefPrefix = pbpDefPrefix || `${defLn} body-locks ${oP.him} — no room to operate — `;
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
      const contestMod = get3PTContestMod(perimDef, ctx, defender?.attributes.defensiveIQ);
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
      const contestMod = getMidRangeContestMod(perimDef, midCtx, defender?.attributes.defensiveIQ);
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
      pbpBase += ` ${defLn} gets right in ${oP.his} face.`;
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

  // ── Step 5b: IQ Matchup Differential ─────────────────────────────────────
  // Offensive IQ vs Defensive IQ determines who wins the chess match.
  // A smart attacker exploits a dumb defender's misreads, wrong rotations,
  // and over-aggressive tendencies. A smart defender clogs lanes and takes away reads.
  // Scale: IQ gap of 20 pts = ±0.8 % shot quality. Capped at ±1.5 %.
  if (defender) {
    const iqAdv = (offHandler.attributes.offensiveIQ - defender.attributes.defensiveIQ) / 100;
    defenseModifier += Math.max(-0.015, Math.min(0.015, iqAdv * 0.04));
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
      fullText += ` — drops ${oP.his} shoulder and hits the post fade!`;
    } else if (shotType === 'PULL_UP_3' && (ot?.pullUpThree ?? 0) >= 71) {
      fullText += ` — BANG! Right in ${oP.his} wheelhouse.`;
    } else if (offHandler.personalityTraits.includes('Streaky') && hotStreak >= 2) {
      fullText += ` — Good. ${ln} is feeling it right now...`;
    } else {
      fullText += ` — Good.`;
    }
  } else {
    fullText += isDunkAttempt
      ? ` — rattles out! Missed the dunk.`
      : offHandler.personalityTraits.includes('Streaky') && hotStreak <= -2
        ? ` — No good. ${ln} is struggling to find ${oP.his} shot...`
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

// ─── Defensive foul-chance model ──────────────────────────────────────────────
//
// Returns the probability (0.02–0.25) that a defensive action (steal attempt or
// shot contest/block) results in the defender committing a foul rather than
// making a clean play.
//
// Tuning targets (league-realistic per 36-min benchmarks):
//   • Average defender (all attrs/tendencies ≈ 50, IQ 65)  → ~8–10 % per attempt
//   • Aggressive gambler (Gambles 80, Phys 85, IQ 60)       → ~18–22 % per attempt
//   • Disciplined stopper (Gambles 30, Disc 80, IQ 85)      → ~3–6  % per attempt
//   • This player (Gambles 47, Phys 87, Disc 69, IQ 83)     → ~13–15 % steal / ~15–17 % block
//
// Simulated PF totals using these per-attempt rates:
//   Aggressive (Phys 87): ~3.5–4.5 PF/game   ✓ realistic for physical wings/bigs
//   Disciplined (Disc 80, IQ 85): ~1.5–2.5 PF/game ✓ smart stopper profile
//
type DefensiveActionType = 'steal' | 'block';
interface FoulContext {
  /** Defender arriving from help side (less body control, more foul risk) */
  isHelpSituation: boolean;
  /** Defender actively pressuring ball handler on-ball */
  isOnBall: boolean;
}

const calculateFoulChance = (
  defender: Player,
  actionType: DefensiveActionType,
  context: FoulContext,
): number => {
  const dt  = defender.tendencies?.defensiveTendencies;
  const gambles           = dt?.gambles              ?? 50;
  const physicality       = dt?.physicality          ?? 50;
  const contestDiscipline = dt?.shotContestDiscipline ?? 50;
  const helpDefender      = dt?.helpDefender         ?? 50;
  const defensiveIQ       = defender.attributes.defensiveIQ ?? 65;

  // ── Base risk: every aggressive defensive action carries some foul risk ──────
  let foulChance = 0.05;

  // Gambles (reach-ins, gambling for loose balls):
  //   tendency 50 → +7.5 %; 47 → +7.1 %; 80 → +12 %; 20 → +3 %
  //   High-gambler who misses the steal risks an illegal contact call.
  foulChance += (gambles / 100) * 0.15;

  // Physicality (body contact, strength plays):
  //   tendency 50 → +6 %; 87 → +10.4 %; 30 → +3.6 %
  //   Physical defenders bump shooters, post players, and drive-finishers.
  foulChance += (physicality / 100) * 0.12;

  // Shot Contest Discipline (clean hands-up vs. bite/hack):
  //   tendency 50 → −4 %; 69 → −5.5 %; 90 → −7.2 %
  //   Disciplined contestants keep arms up and avoid swiping.
  foulChance -= (contestDiscipline / 100) * 0.08;

  // Help rotations: arriving late = less balance = extra contact risk
  if (context.isHelpSituation) {
    // tendency 50 → +3 %; 78 → +4.7 %; 90 → +5.4 %
    foulChance += (helpDefender / 100) * 0.06;
  }

  // Defensive IQ: smart defenders read the play and choose safer angles.
  // Centred on IQ=50 so low IQ also raises foul risk.
  // IQ 95 → ×0.865; IQ 80 → ×0.91; IQ 50 → ×1.0; IQ 30 → ×1.06
  foulChance *= (1 - (defensiveIQ - 50) / 100 * 0.30);

  // Block-specific: shot contests carry slightly more foul risk than steals
  // because the body/arm is in motion during the shot and contact is harder to avoid.
  if (actionType === 'block') foulChance *= 1.15;

  // Clamp: 2 % floor (freak accidents) — 25 % ceiling (even worst gambler rarely fouls every play)
  return Math.max(0.02, Math.min(0.25, foulChance));
};

// ─── Tendency → stat-line modifiers ──────────────────────────────────────────
interface TendencyModifiers {
  threepaBoost: number;
  insideBoost:  number;
  usageBoost:   number;
  astBoost:     number;
  stlBoost:     number;
  /** NEW: tendency-driven boost to per-game block totals in box score */
  blkBoost:     number;
  foulRisk:     number;
}
const computeTendencyModifiers = (p: Player): TendencyModifiers => {
  const ot = p.tendencies?.offensiveTendencies;
  const dt = p.tendencies?.defensiveTendencies;
  const diq = p.attributes.defensiveIQ ?? 65;
  return {
    threepaBoost: (( ot?.pullUpThree    ?? 50) - 50) / 100 * 0.40,
    insideBoost:  (( ot?.driveToBasket  ?? 50) - 50) / 100 * 0.30
                + ((ot?.cutter         ?? 50) - 50) / 100 * 0.12,
    usageBoost:   (( ot?.isoHeavy       ?? 50) - 50) / 100 * 0.45   // primary scorer lever
                + ((ot?.attackCloseOuts ?? 50) - 50) / 100 * 0.10   // off-ball creation
                + ((ot?.pullUpOffPnr    ?? 50) - 50) / 100 * 0.08   // PnR volume
                - ((ot?.kickOutPasser   ?? 50) - 50) / 100 * 0.08   // pass-first penalty
                + ((ot?.drawFoul        ?? 50) - 50) / 100 * 0.08,  // FTA-getter = more touches
    astBoost:     (( ot?.kickOutPasser  ?? 50) - 50) / 100 * 0.35
                + ((ot?.spotUp          ?? 50) - 50) / 100 * 0.08,

    // stlBoost: gambles (reach frequency) + denyThePass (passing-lane reads)
    //           + helpDefender (rotation intercepts from weak side)
    stlBoost:     (( dt?.gambles        ?? 50) - 50) / 100 * 0.30
                + ((dt?.denyThePass     ?? 50) - 50) / 100 * 0.10
                + ((dt?.helpDefender    ?? 50) - 50) / 100 * 0.08,

    // blkBoost: help rotations generate most blocks; physicality adds contested
    //           rejection power; disciplined contests rarely get pump-faked.
    blkBoost:     (( dt?.helpDefender   ?? 50) - 50) / 100 * 0.25
                + ((dt?.physicality     ?? 50) - 50) / 100 * 0.10
                + ((dt?.shotContestDiscipline ?? 50) - 50) / 100 * 0.05,

    // foulRisk: tendency-driven raw risk.  Now also reduced by Defensive IQ
    //   so smart defenders who are physical still commit fewer dumb fouls.
    foulRisk:     (( dt?.physicality             ?? 50) - 50) / 100 * 0.25
                + ((dt?.gambles                  ?? 50) - 50) / 100 * 0.15
                + ((dt?.onBallPest               ?? 50) - 50) / 100 * 0.10
                - ((dt?.shotContestDiscipline    ?? 50) - 50) / 100 * 0.12
                - ((diq - 50) / 100) * 0.18,
  };
};

// ─── Playbook–Tendency Mismatch Penalty ──────────────────────────────────────
/**
 * Returns an effective morale penalty (0 to −15) when a player's dominant
 * offensive tendencies conflict with the team's active scheme.
 *
 * The penalty is applied to the player's morale for the duration of the game,
 * which suppresses FG% (via moraleFgMod), raises TOV rate (via moraleTovMod),
 * and dims defensive effort (via moraleEffMod) — all visible in the box score.
 *
 * Penalty scaling: each point a tendency exceeds the mismatch threshold
 * contributes (excess / 5) × weight points of penalty, capped at −15.
 *
 * Key mismatches:
 *   postUp > 55  in Pace and Space  → up to −12   (ball-stopper stalls motion)
 *   pullUpThree > 60  in Grit&Grind → up to −10   (shooter can't find clean looks)
 *   isoHeavy > 55  in Triangle      → up to −12   (iso ball kills ball movement)
 *   postUp > 60  in Small Ball      → up to −10   (slow post clogs fast lanes)
 *   transitionHunter > 65 in G&G    → up to −8    (not enough fast-break chances)
 */
const calcPlaybookMismatch = (player: Player, scheme: CoachScheme): number => {
  const ot = player.tendencies?.offensiveTendencies;
  if (!ot) return 0;

  // Returns 0–10 penalty proportional to how far a tendency exceeds its threshold.
  const excess = (val: number, threshold: number, weight: number): number =>
    val <= threshold ? 0 : Math.min(10, ((val - threshold) / 5) * weight);

  let penalty = 0;
  switch (scheme) {
    case 'Pace and Space':
      penalty += excess(ot.postUp          ?? 50, 55, 1.2); // post-heavy player stalls spacing
      penalty += excess(ot.isoHeavy        ?? 50, 60, 0.8); // iso ball-stopper disrupts motion
      break;
    case 'Grit and Grind':
      penalty += excess(ot.pullUpThree     ?? 50, 60, 1.0); // shooter can't find 3PT looks
      penalty += excess(ot.transitionHunter ?? 50, 65, 0.8); // transition hunter vs. half-court grind
      penalty += excess(ot.spotUp          ?? 50, 65, 0.6); // spot-up guy loses corner touches
      break;
    case 'Triangle':
      penalty += excess(ot.isoHeavy        ?? 50, 55, 1.2); // iso breaks Triangle ball movement
      break;
    case 'Small Ball':
      penalty += excess(ot.postUp          ?? 50, 60, 1.0); // post player clogs small-ball lanes
      break;
    case 'Showtime':
      penalty += excess(ot.postUp          ?? 50, 60, 0.8); // post-up stalls the fast break
      break;
    default:
      break; // Balanced: no tendency mismatches
  }

  return -Math.min(15, Math.round(penalty));
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
  const oP  = pronouns(offHandler);
  const dP  = pronouns(def);

  // ── LINE 1: MATCHUP SETUP ───────────────────────────────────────────────────
  let setup: string;
  if (action === 'ISO') {
    if (oTr.includes('Diva/Star')) {
      setup = _pick([
        `${o} is calling ${oP.his} own number here. ISO.`,
        `Nobody is getting this ball. ${o} wants the ISO.`,
      ]);
    } else if (adv >= 8) {
      setup = _pick([
        `${o} spots the mismatch immediately.`,
        `The bench is pointing — ${o} has ${d} isolated. Everyone in the building knows it.`,
        `They're going right at ${d}. ${o} dribbles over and sets up.`,
        `ISO. ${o} on ${d}. This is a problem.`,
        `${o} calls for the ball at the top and waves teammates off. ${d} is all that stands between ${oP.him} and the basket.`,
      ]);
    } else if (adv <= -8) {
      setup = dTr.includes('Workhorse')
        ? _pick([
            `${o} takes the challenge anyway. ${d} has been locked in all game.`,
            `${d} doesn't take plays off. ${o} goes right at ${dP.him} anyway.`,
          ])
        : dTr.includes('Hot Head')
        ? _pick([
            `Watch ${d} here — ${dP.he}'s been chippy. ${o} attacks anyway.`,
            `${d} is fired up. ${o} takes the challenge.`,
          ])
        : _pick([
            `${o} takes the challenge anyway.`,
            `${d} locks in — ${dP.he}'s been dominant tonight.`,
            `${o} dribbles into ${d}'s territory. Bold move.`,
          ]);
    } else {
      setup = dTr.includes('Workhorse')
        ? _pick([
            `Good luck — ${d} doesn't take plays off.`,
            `${d} has been locked in all game. ${o} isolates on ${dP.him} anyway.`,
            `${o} and ${d} have been going at it all night. Here we go again.`,
          ])
        : _pick([
            `This is a battle — ${o} vs ${d}, one on one.`,
            `${d} slides over. ${dP.He}'s ready for this.`,
            `${o} and ${d} have been going at it all night. Here we go again.`,
            `${o} calls for the ISO. ${d} steps up.`,
            `${o} isolates on ${d} at the top of the arc.`,
            `${o} sizes up ${d} at the elbow.`,
            `${o} waves off the play — ${oP.he}'s got ${d}.`,
            `${o} catches on the wing. ${d} crouches into ${dP.his} defensive stance.`,
            `${o} pounds the ball at the top. ${d} is all that stands between ${oP.him} and the basket.`,
          ]);
    }
    if (oTr.includes('Professional')) {
      setup = `${o} methodically sets up the ISO — controlled, precise.`;
    }
    if (streak >= 2) {
      setup += oTr.includes('Hot Head')
        ? ` ${o} is locked in — don't foul ${oP.him}.`
        : ` ${o} is in a zone right now. Nobody is stopping ${oP.him} in ISO.`;
    } else if (streak <= -2) {
      setup += ` ${o} keeps going back to the well.`;
    }
  } else if (action === 'DRIVE') {
    setup = _pick([
      `${o} puts ${oP.his} head down and attacks ${d} off the dribble.`,
      `${o} surveys the floor, sees the lane, and goes.`,
      `${o} gets a head of steam — ${d} retreats to protect the rim.`,
      `${o} attacks ${d} off the dribble, looking to get to the paint.`,
    ]);
  } else {
    setup = _pick([
      `${o} seals ${d} in the post. Ball goes in.`,
      `${o} backs ${d} down into the paint.`,
      `${o} catches at the block. ${d} is trying to front ${oP.him}.`,
      `${o} calls for the ball on the low block. ${d} sets up behind ${oP.him}.`,
    ]);
  }

  // ── LINE 2: ATTACK DESCRIPTION ─────────────────────────────────────────────
  let attack: string;
  const shot = poss.shotType;

  if (action === 'ISO') {
    switch (shot) {
      case 'DRIVE_LAYUP':
        attack = _pick([
          `${o} hits ${d} with a crossover, blows past ${dP.him} to the left.`,
          `${o} crosses over twice — ${d} bites — and attacks the lane.`,
          `One hard crossover and ${o} is gone. ${d} is a step behind.`,
          `${o} plants and goes — euro step leaves ${d} frozen at the arc.`,
          `${o} changes direction so fast ${d} nearly loses ${dP.his} footing. ${oP.He}'s at the rim.`,
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
          `${o} stops and pops — ${d} had position but ${o} got ${oP.his} shot off.`,
          `Mid-dribble, ${o} elevates. ${d} jumps but ${dP.he}'s a fraction late.`,
          `${o} jab steps, ${d} shifts — ${o} steps all the way back to the three-point line and elevates.`,
        ]);
        break;
      case 'POST_FADE':
        attack = _pick([
          `${o} catches deep in the post, feels ${d} on ${oP.his} back, and spins baseline.`,
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
      `${o} catches deep in the post, feels ${d} on ${oP.his} back, and spins baseline.`,
      `${o} seals ${d}, spins middle and goes up strong.`,
      `Quick spin — ${d} loses track for just a second. That's all ${o} needed.`,
      `${o} leans into ${d}, fades away toward the baseline and releases.`,
      `${o} backs ${d} down, fades to ${oP.his} right — high off the glass attempt.`,
      `Back to the basket, ${o} turns over ${oP.his} left shoulder and fires over ${d}.`,
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
            `${oP.He} got it! ${o} converts.`,
            `${d} had good position but ${o} is just better right there.`,
            `Good for two.`,
            `Drains it.`,
          ]);
      break;
    case 'MISSED':
      result = (adv <= -5)
        ? _pick([
            `${d} stays with ${oP.him} — no good. ${d} wins this round.`,
            `${d} had great position and it shows. Missed.`,
            `Off the back iron. ${d} held ${dP.his} ground.`,
            `Not tonight — ${d} contests and ${o} can't finish.`,
          ])
        : _pick([
            `${d} stays with ${oP.him} — no good.`,
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
        `AND ONE! ${o} converts through contact! ${oP.He}'s going to the line!`,
        `Foul on ${d}! ${o} gets the bucket and a free throw.`,
        `Bucket AND the foul on ${d}! ${o} is heading to the stripe.`,
        `${o} draws the foul on ${d}. Free throws coming.`,
      ]);
      break;
    default:
      result = _pick([
        `${o} picks up ${oP.his} dribble — ${d} forces the jump ball. Turnover.`,
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
  /** Minutes per quarter (default 12) — must match league settings */
  quarterLength = 12,
): { events: PlayByPlayEvent[]; teamStreak: number } => {
  const events: PlayByPlayEvent[] = [];
  let teamStreak = momentumStreak; // consecutive scoring possessions
  let emergencyBoostPoss = 0;      // possessions remaining with emergency +10% boost

  // ── Running quarter clock ─────────────────────────────────────────────────
  // Counts DOWN from (quarterLength * 60) s to 0. Every possession consumes a
  // slice of the quarter. Sub-events within a single possession each
  // tick the clock by 1–3 s so no two events share the same timestamp.
  const quarterSecs = quarterLength * 60;
  let clockSecs = quarterSecs;
  const fmtClock = (s: number): string => {
    const clamped = Math.max(0, s);
    return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
  };

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
    // ── Clock window for this possession ─────────────────────────────────────
    // Each PBP possession represents ~3 real possessions; spread 720 s evenly
    // with ±4 s jitter so the clock feels organic. Sub-events tick down 1–3 s
    // from the possession's start time so every line has a unique timestamp.
    const possClockUsed = Math.max(12, Math.round(quarterSecs / Math.max(1, sample)) + Math.floor(Math.random() * 9) - 4);
    let subSec = clockSecs;                       // start of this possession's time window
    clockSecs  = Math.max(1, clockSecs - possClockUsed); // advance main clock FIRST
    const subFloor = clockSecs;                   // sub-events stay within this possession's window
    // tickSub: decrement the sub-clock by `adv` seconds and return formatted time.
    // Every call produces a strictly lower timestamp → correct sort order.
    const tickSub = (adv: number = 2): string => {
      subSec = Math.max(subFloor + 1, subSec - Math.max(1, adv));
      return fmtClock(subSec);
    };

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

    // Momentum checks — use tickSub so these get a unique clock value
    if (teamStreak === 4) {
      const coachName = offTeam.staff.headCoach?.name?.split(' ').at(-1) ?? 'The coach';
      events.push({ time: tickSub(1), text: `${coachName} calls timeout to stop the run — momentum reset`, type: 'info', quarter });
      teamStreak = 0; // timeout resets streak
    }
    if (teamStreak >= 6) {
      // 12-0 run without timeout → emergency boost for next 3 possessions
      events.push({ time: tickSub(1), text: `${offTeam.name} on a massive run — showing heart, fighting back!`, type: 'info', quarter });
      emergencyBoostPoss = 3;
      teamStreak = 0;
    }

    // Base event timestamp — consumed by non-cinematic single-event plays
    const time = tickSub(Math.floor(Math.random() * 3) + 2);

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
      // Each cinematic line gets its own clock tick: setup → attack → result
      // are strictly ordered in time, never sharing a timestamp.
      events.push({ time: tickSub(2), text: cinematic.setup,  type: 'info',  quarter });
      events.push({ time: tickSub(2), text: cinematic.attack, type: 'info',  quarter });
      events.push({ time: tickSub(1), text: cinematic.result, type: evType,  quarter });
    } else {
      events.push({ time, text: finalPbpText, type: evType, quarter });
    }

    // ── Scheme flavor narration (12% per possession, non-garbage) ───────────
    // Fires after the possession event so the flavor line feels like analyst commentary.
    if (!isGarbageTime && Math.random() < 0.12) {
      const coachLn = offTeam.staff.headCoach?.name?.split(' ').at(-1) ?? 'Coach';
      const schemeLines: Partial<Record<CoachScheme, string[]>> = {
        'Pace and Space': [
          `${offTeam.name} spreading the floor — shooters in every corner`,
          `Kick-out pass, catch-and-shoot — ${coachLn}'s system getting quality looks`,
          `Push the pace! ${offTeam.name} looking to shoot before the defense sets`,
          `Three-ball off movement — Pace and Space at its best`,
        ],
        'Grit and Grind': [
          `${offTeam.name} demanding a post entry — forcing their physicality`,
          `Grit and Grind — ${offTeam.name} making this an ugly game on purpose`,
          `Interior force — ${coachLn} wants the ball in the paint`,
          `${offTeam.name} grinding it out — this is exactly what ${coachLn} draws up`,
        ],
        'Triangle': [
          `Triangle movement — three players rotating through the elbow`,
          `Ball reversal through the post — Triangle spacing opens the weak side`,
          `${coachLn}'s Triangle reads — patience rewarded with a quality look`,
          `Post → wing → reversal — beautiful Triangle execution`,
        ],
        'Small Ball': [
          `Small ball lineup on the floor — speed over size`,
          `${offTeam.name} using quickness advantage in space`,
          `Switch everything! ${coachLn}'s switching scheme forces mismatches`,
          `Go small, go fast — ${offTeam.name} pushing tempo`,
        ],
        'Showtime': [
          `SHOWTIME! ${offTeam.name} in transition again!`,
          `Run and gun — ${offTeam.name} not letting the defense set`,
          `${coachLn}'s high-octane system — they want to lob and dunk all night`,
          `Fast break! ${offTeam.name} pushing before the defense can recover`,
        ],
      };
      const lines = schemeLines[scheme];
      if (lines?.length) {
        events.push({ time: tickSub(1), text: lines[Math.floor(Math.random() * lines.length)], type: 'info', quarter });
      }
    }

    // ── Miss resolution: OOB → OREB → DREB (strictly ordered) ──────────────
    // Each step ticks the clock: miss is already logged above, then the clock
    // advances so the rebound appears 2 s later and the putback attempt 1 s after.
    // No event in this chain can share a timestamp with the original miss.
    //
    // Possession breakdown per miss (NBA-realistic targets):
    //   OOB  ~7 %  │  OREB ~14–23 %  │  DREB ~70–79 %
    const teamOrbChance = getTeamOrbChance(rotation);
    if (poss.result === 'MISSED') {
      // ── Step 1: ball out of bounds — 7 % of misses, possession flips, no REB stat ─
      const OOB_CHANCE = 0.07;
      if (Math.random() < OOB_CHANCE) {
        events.push({ time: tickSub(1), text: 'Ball out of bounds — defensive possession.', type: 'info', quarter });
      } else if (Math.random() < teamOrbChance) {
        // ── Step 2: offensive rebound — prefer big men, weight by OREB attribute ──
        // Prefer big men (high offReb + layups); exclude the original missed shooter.
        const rebCandidates = rotation.filter(p =>
          p.id !== handler.id && (p.attributes.layups ?? 40) >= 40);
        const pool = rebCandidates.length > 0
          ? rebCandidates
          : rotation.filter(p => p.id !== handler.id);
        if (pool.length > 0) {
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

          // Rebound: 2 s after the miss
          events.push({ time: tickSub(2), text: `${rebLn} Offensive Rebound.`, type: 'info', quarter });

          // Putback attempt: 1 s after the rebound
          const putbackChance = (
            (rebounder.attributes.offReb ?? 50) * 0.4 +
            (rebounder.attributes.layups ?? 50) * 0.6
          ) / 100;
          const putbackMade = Math.random() < putbackChance;
          if (putbackMade) {
            events.push({ time: tickSub(1), text: `${rebLn} Putback Layup: Made.`, type: 'score', quarter });
            teamStreak++;
            streakMap.set(rebounder.id, Math.max(0, streakMap.get(rebounder.id) ?? 0) + 1);
          } else {
            events.push({ time: tickSub(1), text: `${rebLn} Putback Layup: Missed.`, type: 'miss', quarter });
          }
        }
      }
      // ── Step 3 (implicit): DREB — ~70–79 % of misses, possession ends naturally ─
    }

    const newStreak = streakMap.get(handler.id) ?? 0;
    if (Math.abs(newStreak) === 3) {
      const msg = newStreak > 0
        ? `${lastName(handler)} is on fire — can't miss right now!`
        : `${lastName(handler)} can't seem to buy a bucket tonight`;
      events.push({ time: tickSub(1), text: msg, type: 'info', quarter });
    }
    if (poss.conflictFired && poss.conflictText)
      events.push({ time: tickSub(1), text: poss.conflictText, type: 'info', quarter });
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
  morale = 75,                 // player morale (0-100); affects FG%, TOV, STL, BLK
  teammateSpacing = 75,        // avg shooting3pt of teammates; high = more kick-out opportunities
  teammateShootingEff = 0.48,  // implied team FG% for this game; hot teams get more AST
  scheme: CoachScheme = 'Balanced', // team's active playbook scheme
  playbookMismatch = 0,        // effective morale penalty (0 to -15) from tendency-scheme conflict
): GamePlayerLine => {
  // Morale modifiers: centered at 75 so an average player is neutral.
  // Critical (<50): FG -3%, TOV +25%, effort -15% | High (>85): FG +2%, effort +10%
  // playbookMismatch (0 to -15) is folded into effective morale before the norm so
  // a post-heavy player in Pace and Space takes a visible FG%/TOV hit this game.
  const effectiveMorale = Math.max(0, Math.min(100, morale + playbookMismatch));
  const moraleNorm = (effectiveMorale - 75) / 75; // [-1, +0.33] range
  const moraleFgMod  = moraleNorm *  0.025;  // ±2.5% FG at extremes
  const moraleTovMod = moraleNorm * -0.15;   // low morale → more turnovers (inverted: -15% rate boost)
  const moraleEffMod = moraleNorm *  0.10;   // ±10% effort (steals/blocks)
  const fgPctBoost = varRoll / 100 * 0.4; // variance → small FG% delta
  // Playbook shot-distribution multipliers for this game (scheme-driven).
  const pbMults = PLAYBOOK_SHOT_MODS[scheme] ?? PLAYBOOK_SHOT_MODS['Balanced'];
  const tm     = computeTendencyModifiers(player);
  const minFac = minutes / 48;

  // Fatigue penalty: players logging 32+ minutes lose shot-making quality.
  // Each minute over 32 costs ~0.35% FG% across all zones (rest + conditioning).
  const fatigueMod = minutes > 32 ? -((minutes - 32) * 0.0035) : 0;

  const adjUsage = Math.max(0.02, usageShare * (1 + tm.usageBoost));
  // Cap at 22 FGA: prevents star usage-share inflation from producing 30+ FGA games
  // that would drive season PPG above 32. NBA leaders take 19–22 FGA/game at peak usage.
  const fga      = Math.min(22, Math.max(0, Math.round(teamFga * adjUsage * (minutes / 32))));

  // TO% computed early: drives both the TOV stat and the AST efficiency penalty.
  // Uses getTurnoverPercentage() — piecewise curve calibrated to NBA 2025-26.
  // moraleTovMod is negative when morale < 75, boosting the raw toRate (more turnovers).
  const toRate = Math.max(0, getTurnoverPercentage(
    player.attributes.ballHandling,
    player.attributes.passing,
    player.attributes.offensiveIQ,
    player.position,
    player.attributes.stamina,
    player.personalityTraits,
  ) - moraleTovMod);

  // 3PA share: tendency-driven base × playbook multiplier.
  // Pace and Space (×1.28) pumps up three-point volume; Grit and Grind (×0.62) suppresses it.
  const threePaShare = Math.max(0, Math.min(0.90,
    ((player.attributes.shooting3pt / 100) * 0.5 + tm.threepaBoost) * pbMults.threePaShareMult));
  const threepa = Math.round(fga * threePaShare);

  // Inside / mid split: inside share scaled by playbook multiplier.
  // Grit and Grind (×1.38) creates more post/drive looks; Pace and Space (×0.68) pulls players out.
  const insideShare = Math.max(0, Math.min(0.70,
    (((player.attributes.layups + player.attributes.dunks) / 2 / 100) * 0.3 + tm.insideBoost) * pbMults.insideShareMult));
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
  // Box-score context: "inside" represents all at-rim attempts (layups, contact
  // finishes, short hooks, dump-offs) — not just clean uncontested dunks.
  // Dunk% (80-98%) is therefore down-weighted so the blend lands at NBA at-rim
  // average of 58-63%, not the 65-70% that a straight blend would produce.
  const layupBase   = getLayupPercentage(player.attributes.layups, player.position);
  const dunkBase    = getDunkPercentage(player.attributes.dunks, player.position, player.attributes.jumping);
  const postBase    = getPostScoringPercentage(
    player.attributes.postScoring, player.position,
    player.attributes.strength, player.attributes.offensiveIQ,
  );
  // Reduced dunkWeight (0.20 max) and scaled dunkBase by 0.75 for box-score context:
  // uncontested dunks are pre-selected plays; box-score "inside" includes many
  // contested attempts where the defense has already rotated.
  const dunkWeight  = Math.min(0.20, player.attributes.dunks       / 100 * 0.20);
  const postWeight  = Math.min(0.25, player.attributes.postScoring / 100 * 0.25);
  const layupWeight = Math.max(0,    1 - dunkWeight - postWeight);
  const fgPctIns    = layupBase * layupWeight + (dunkBase * 0.75) * dunkWeight + postBase * postWeight;

  // Stochastic rounding: Math.floor(n*rate + rand()) gives correct expected
  // value (= n*rate) without the systematic upward bias of Math.round that
  // was locking season 3PT% leaders at 50% for high-base shooters.
  // pbMults.*Delta: additive FG% shifts driven by playbook.
  // Pace and Space opens up cleaner 3PT looks (+1.8 pp) but fewer post entries (−1.8 pp);
  // Grit and Grind generates better interior reads (+2.0 pp) but contested 3s (−1.8 pp).
  const threeRate = Math.max(0.05, fgPct3 + fgPctBoost + fatigueMod + opponentPerimDefMod + moraleFgMod + pbMults.fgPct3Delta + (Math.random() * 0.06 - 0.03));
  const threepm   = Math.min(threepa, Math.floor(threepa * threeRate + Math.random()));
  const midRate   = Math.max(0.05, fgPctMid + fgPctBoost + fatigueMod + opponentMidDefMod + moraleFgMod + pbMults.fgPctMidDelta + (Math.random() * 0.06 - 0.03));
  const midFgm    = Math.min(midFga,  Math.floor(midFga  * midRate   + Math.random()));
  // Inside FGM: interior + post defense mods both apply (weighted by post share).
  // opponentInteriorDefMod suppresses drives/dunks; opponentPostDefMod suppresses
  // post-ups.  Blend them proportionally to postWeight so a non-post player
  // (postWeight≈0) is barely affected by post defense, and a pure post scorer
  // (postWeight≈0.25) feels the full post-defense penalty.
  const blendedInsideMod = opponentInteriorDefMod * (1 - postWeight) + opponentPostDefMod * postWeight;
  // Floor lowered to 0.30 (from 0.35): even poor finishers shouldn't make 35%+
  // of their inside attempts after factoring in rim protection and fatigue.
  const insRate   = Math.max(0.30, fgPctIns + fgPctBoost + fatigueMod + blendedInsideMod + moraleFgMod + pbMults.fgPctInsDelta + (Math.random() * 0.06 - 0.03));
  const insFgm    = Math.min(insFga,  Math.floor(insFga  * insRate   + Math.random()));
  const fgm     = threepm + midFgm + insFgm;

  // FTA: scaled by strength and minutes. Cap random component to prevent outlier
  // games — NBA teams average 22 FTA, so per-player average should be ~2-3 FTA.
  const fta = Math.round((player.attributes.strength / 100) * 3.5 * minFac + Math.random() * 1.5);

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

  // Independent per-player rebound formula — no normalization to teamReb.
  // posRebMult encodes positional rebounding rates (C highest, guards lowest).
  // Power-curve (squared) concentrates boards in high-rebounding players.
  // 19.5 calibration: C at reb=90, 36 min → ~(0.90²)×1.00×0.75×19.5 ≈ 11.9 boards.
  // Targets: elite C ≈ 12–14 RPG, elite PF ≈ 9–11, SF ≈ 6–8, guards ≈ 3–5.
  // Random noise ±2.5 provides organic game-to-game variance.
  const posRebMult =
    player.position === 'C'  ? 1.00 :
    player.position === 'PF' ? 0.72 :
    player.position === 'SF' ? 0.50 : 0.32;
  const totalReb = Math.min(22, Math.max(0, Math.round(
    Math.pow(player.attributes.rebounding / 100, 2) * posRebMult * minFac * 19.5
    + (Math.random() * 5 - 2.5),
  )));
  // ORB/DRB split: use position-based base (bigs ~27% of their boards are ORBs,
  // guards ~19%) + small attribute modifier. This replaces orbChance/drbChance
  // ratio which produced unrealistic 45-55% ORB splits for bigs.
  const posOrbBase =
    player.position === 'C' || player.position === 'PF' ? 0.270 :
    player.position === 'SF'                            ? 0.235 : 0.195;
  const orbAttrMod = (player.attributes.offReb - player.attributes.defReb) / 300;
  // No artificial ceiling — elite offensive rebounders (Dennis Rodman-tier) can reach 45–50% ORB ratio
  const orbRatio   = Math.max(0.14, Math.min(0.50, posOrbBase + orbAttrMod));
  const offReb    = Math.round(totalReb * orbRatio);
  const defReb    = totalReb - offReb;

  // ── Assist calculation ────────────────────────────────────────────────────
  // Primary efficiency: passing + playmaking + ball handling + IQ + kick-out tendency.
  // adjAstShare capped at 0.42 so even an elite PG never exceeds ~10 APG season avg
  // (teamAst 24 × 0.42 = 10.1). Per-game cap of 18 prevents freak stat-padding games.
  const kickOutTendency = player.tendencies?.kickOutPasser ?? 50;
  const astEff = getAssistEfficiency(
    player.attributes.passing,
    player.attributes.playmaking,
    player.attributes.offensiveIQ,
    toRate,
    player.attributes.ballHandling ?? 70,
    kickOutTendency,
  );

  // Contextual: elite spacers create kick-out lanes (spacing 80 → +6%; 50 → 0%)
  const spacingBoost = (teammateSpacing - 65) / 100 * 0.14;
  // Contextual: hot-shooting team = more makes off passes = more assists recorded
  // FG% 0.52 → +4.8%; FG% 0.44 → −2.4%  (centered at NBA avg 0.48)
  const shootingEffBoost = (teammateShootingEff - 0.48) * 0.60;

  const contextMult = Math.max(0.80, 1.0 + spacingBoost + shootingEffBoost);

  // handlerFrac: position-based ball-handling time share, decoupled from scoring usage.
  // PGs naturally run more pick-and-roll/transition — their high BH + playmaking raises this.
  // Pure scorers with low BH/playmaking won't inflate their own assist totals.
  const posPlayBase =
    player.position === 'PG' ? 0.34 : player.position === 'SG' ? 0.22 :
    player.position === 'SF' ? 0.16 : player.position === 'PF' ? 0.12 : 0.09;
  const handlerFrac = Math.max(0.05,
    posPlayBase
    + ((player.attributes.ballHandling ?? 60) - 65) / 160
    + ((player.attributes.playmaking   ?? 60) - 65) / 220
  );
  const adjAstShare = Math.min(0.42, Math.max(0.01, astEff * handlerFrac * minFac * 1.10 * (1 + tm.astBoost) * contextMult));
  // ±1 noise adds organic game-to-game fluctuation (some 6-ast nights, some 14-ast nights)
  const ast = Math.min(18, Math.max(0, Math.round(teamAst * adjAstShare + (Math.random() * 2 - 1))));

  // STL: getStealChance × 48 steal-opportunities per 48 min × minutes fraction.
  // Reduced from 80 → 48 so league leaders average 1.5–2.5 SPG (NBA realistic range).
  // stlBoost from defensive tendencies (pass-denial, gambles, helpDefender).
  // Stamina: fatigued defenders lose a step — up to 15 % reduction at stamina=40.
  // Hard cap at 5 STL/game; wider noise (1.5) creates organic nightly variance.
  const STL_OPP_SCALE = 48;
  const stlBase    = getStealChance(player.attributes.steals, player.position, player.attributes.defensiveIQ)
    * STL_OPP_SCALE * minFac * (1 + tm.stlBoost) * (1 + moraleEffMod);
  const stlFatigue = Math.max(0, (65 - (player.attributes.stamina ?? 70)) / 100 * 0.15);
  const stl        = Math.min(5, Math.max(0, Math.floor(stlBase * (1 - stlFatigue) + Math.random() * 1.5)));

  // BLK: getBlockChance × 35 block-opportunities per 48 min × minutes fraction.
  // Reduced from 65 → 35 so league leaders average 2.5–3.5 BPG (NBA realistic range).
  // Wemby-tier (blocks=97+): ~3.5 BPG; solid rim protector (blocks=85): ~2.0 BPG.
  // blkBoost from helpDefender/physicality tendencies; stamina reduction for tired bigs.
  // Hard cap at 7 BLK/game; wider noise (1.5) creates organic nightly variance.
  const BLK_OPP_SCALE = 35;
  const blkBase    = getBlockChance(player.attributes.blocks, player.position, player.attributes.defensiveIQ)
    * BLK_OPP_SCALE * minFac * (1 + tm.blkBoost) * (1 + moraleEffMod);
  const blkFatigue = Math.max(0, (65 - (player.attributes.stamina ?? 70)) / 100 * 0.12);
  const blk        = Math.min(7, Math.max(0, Math.floor(blkBase * (1 - blkFatigue) + Math.random() * 1.5)));
  const pf  = Math.min(6, Math.round((Math.floor(Math.random() * 4 * minFac + 1)) * (1 + tm.foulRisk)));

  // TOV: scaled by position-based touch multiplier so ball-handlers accrue
  // turnovers from dribble actions beyond just shot attempts.
  //   PG  × 1.6 — primary handler; ISO drives, P&R triggers, outlet passes
  //   SG  × 1.4 — secondary handler; off-ball cuts + some creation
  //   SF  × 1.25 — versatile; less primary handle time than guards
  //   PF/C × 1.05 — mostly catch-and-finish; lower possession chain risk
  const touchMul =
    player.position === 'PG' ? 1.6 :
    player.position === 'SG' ? 1.4 :
    player.position === 'SF' ? 1.25 : 1.05;
  const tovNoise = (Math.random() - 0.5) * 0.06;
  const tov      = Math.max(0, Math.round((toRate + tovNoise) * fga * touchMul));

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
  settings?: Pick<LeagueSettings, 'injuryFrequency' | 'homeCourt' | 'b2bFrequency' | 'quarterLength'>,
): GameResult => {
  // ── Settings-driven constants ──────────────────────────────────────────────
  const quarterLength = settings?.quarterLength ?? 12; // minutes per quarter
  const quarterLengthScale = quarterLength / 12;       // possession/minute scaler
  const homeCourtAdv = settings?.homeCourt === false ? 0 : HOME_COURT_ADV;
  const injuryMult: Record<string, number> = { None: 0, Low: 0.5, Medium: 1.0, High: 2.0 };
  const injuryMultiplier = injuryMult[settings?.injuryFrequency ?? 'Medium'] ?? 1.0;
  const b2bMap: Record<string, number> = { None: 1.0, Low: 0.97, Realistic: 0.93, High: 0.90, Brutal: 0.87 };
  const b2bPenalty = b2bMap[settings?.b2bFrequency ?? 'Realistic'] ?? 0.93;

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

  // Streak regression: teams on extreme runs face mean-reversion pressure.
  // A 15+ game win streak is partly luck — that luck tends to run out.
  // Losing streaks get a small bounce-back nudge (hot hand / talent assertion).
  const getStreakRegression = (team: Team): number => {
    const s = team.streak;
    if (s >= 15)  return -(s - 14) * 0.005;  // -0.005 PPP per game over 14; ~-2.5 pts at streak 19
    if (s <= -10) return  (Math.abs(s) - 9) * 0.003;  // small recovery for deep losing skids
    return 0;
  };

  // Team morale modifier: sustained winning/losing shifts average morale.
  // High morale = better execution; low morale = turnovers, missed FTs, defensive lapses.
  const teamMoraleMod = (team: Team): number => {
    const topEight = team.roster.slice(0, 8);
    const avg = topEight.reduce((s, p) => s + (p.morale ?? 75), 0) / Math.max(1, topEight.length);
    return (avg - 75) / 800;  // morale 100 → +0.031; morale 50 → −0.031
  };

  const calcBasePPP = (off: number, def: number, isB2B: boolean) => {
    // Slope 0.25 (was 0.5): rating gap matters less → more realistic upset frequency.
    // With slope 0.5 a 12-pt rating gap → 6 PPP pts → elite teams win 85-93%.
    // With slope 0.25 a 12-pt rating gap → 3 PPP pts → elite teams win 70-78%.
    let ppp = BASE_PPP + (off - def) / 100 * 0.25;
    if (isB2B) ppp *= b2bPenalty;
    return ppp + (Math.random() * SCORE_VARIANCE * 2 - SCORE_VARIANCE);
  };
  const homePPP = calcBasePPP(homeBaseOff, homeDef, homeB2B)
    + getStreakRegression(home) + teamMoraleMod(home);
  const awayPPP = calcBasePPP(awayBaseOff, awayDef, awayB2B)
    + getStreakRegression(away) + teamMoraleMod(away);

  // ── 4. Pace / Possession Engine ───────────────────────────────────────────
  // Each team has their own pace rating (with coach badge effects).
  // Defensive Guru on the opponent applies pressure on this team's pace.
  const homeEffPace = getTeamEffectivePace(home, away, 0, false, homeB2B);
  const awayEffPace = getTeamEffectivePace(away, home, 0, false, awayB2B);
  const gamePace    = Math.round((homeEffPace + awayEffPace) / 2);

  // Total possessions per team scaled to actual quarter length
  const totalPoss  = Math.round(paceToTotalPossessions(gamePace) * quarterLengthScale);
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
    let homeOff = homeCourtAdv;
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
    // Quarter noise ±6 (was ±2): gives ~6.9 pts std dev per team per game from this source alone.
    // Combined with SCORE_VARIANCE, total game differential std dev ≈ 14–16 pts — enough that
    // even an elite vs. weak matchup has ~20-25% upset chance on any given night.
    let hQScore = Math.round(homeQPoss * qPaceFactor * (homePPP + homeOff) + (Math.random() * 12 - 6));
    let aQScore = Math.round(awayQPoss * qPaceFactor * (awayPPP + awayOff) + (Math.random() * 12 - 6));

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
    const qStartTime = `${quarterLength}:00`;
    if (q === 1) {
      pbp.push({ time: qStartTime, text: `${home.name} and ${away.name} are set — starting lineups on the floor for tip-off.`, type: 'info', quarter: 1 });
    }
    if (q === 3) {
      pbp.push({ time: qStartTime, text: `${home.name} opens the second half with their starting lineup.`, type: 'info', quarter: 3 });
      pbp.push({ time: qStartTime, text: `${away.name} opens the second half with their starting lineup.`, type: 'info', quarter: 3 });
    }

    const homePBPBoost = homeOff * 0.5;
    const awayPBPBoost = awayOff * 0.5;
    const hResult = generateQuarterPBP(home, away, q, homeQPoss, homeScheme, homeStreaks, homePBPBoost, garbageTime, homeQStreak, quarterLength);
    const aResult = generateQuarterPBP(away, home, q, awayQPoss, awayScheme, awayStreaks, awayPBPBoost, garbageTime, awayQStreak, quarterLength);
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

  // ── 6. Final Score ────────────────────────────────────────────────────────
  // No artificial floor or ceiling — scores are driven purely by pace, efficiency,
  // and team attributes. Elite offenses can exceed 160; defensive slogs can finish
  // in the 70s. Only floor each team at 40 to prevent nonsensical negatives.
  let totalHome = Math.max(40, runningHome);
  let totalAway = Math.max(40, runningAway);

  // ── 7. Player stat distribution ──────────────────────────────────────────
  const statPace = totalPoss; // use actual total possessions for FGA/REB scaling
  const distributeToPlayers = (team: Team, totalPts: number, isHome: boolean, isGT: boolean) => {
    const roster      = team.roster;
    const totalRating = roster.reduce((acc, p) => acc + p.rating, 0);
    const teamFga     = Math.round(statPace * 1.10);
    // teamReb: ~42–52 boards/team at NBA pace. 0.50 coefficient (was 0.44) accounts
    // for offensive boards — each missed shot is a rebound opportunity for either team.
    // No artificial cap — fast-paced games with many missed shots can yield 60+ team boards.
    const teamReb     = Math.round(statPace * 0.50);
    // NBA reality: ~60% of FGM are assisted; FGM ≈ pts / 2.2.
    // Old coefficient (0.6) applied to estimated FGM, but the share-sum across all
    // players exceeds 1.0 by ~1.48×, causing reported team assists to balloon to 45+.
    // New coefficient (0.46) brings the raw target to ~22-26 for typical 105-125 pt games,
    // matching the 2024-25 NBA range of 22-26 team assists per game.
    const teamAst     = Math.round((totalPts / 2.2) * 0.46);

    // Opponent defensive averages — computed once per team, applied to every player's box score.
    // Uses top-8 rotation players as the sample (starters + primary bench).
    const oppRoster      = isHome ? away.roster : home.roster;
    const oppTopN        = oppRoster.slice(0, 8);
    const oppCount       = Math.max(1, oppTopN.length);

    // 3PT suppression: avg perimDef 75 → ~−1.5 %  |  85 → ~−2.1 %  |  25 → ~+0.7 %
    const oppAvgPerimDef   = oppTopN.reduce((s, op) => s + (op.attributes.perimeterDef ?? 50), 0) / oppCount;
    const oppAvgDefIQ      = oppTopN.reduce((s, op) => s + (op.attributes.defensiveIQ  ?? 50), 0) / oppCount;
    const oppPerimDefMod   = get3PTContestMod(oppAvgPerimDef, 'TEAM_BOX_SCORE', oppAvgDefIQ);

    // At-rim suppression: avg interiorDef 80 → ~−3.6 %  |  85 → ~−4.2 %  |  20 → ~+1.4 %
    const oppAvgInteriorDef    = oppTopN.reduce((s, op) => s + (op.attributes.interiorDef ?? 50), 0) / oppCount;
    const oppInteriorDefMod    = getRimProtectionMod(oppAvgInteriorDef, 'TEAM_BOX_SCORE');

    // Mid-range suppression: avg perimDef 75 → ~−2.0 %  |  85 → ~−2.8 %  |  25 → ~+0.9 %
    const oppMidDefMod = getMidRangeContestMod(oppAvgPerimDef, 'TEAM_BOX_SCORE_MID', oppAvgDefIQ);

    // Post suppression: composite interiorDef + strength; avg intDef 80/str 70 → ~−5 %
    const oppAvgInteriorStr = oppTopN.reduce((s, op) => s + (op.attributes.strength ?? 50), 0) / oppCount;
    const oppPostDefMod     = getPostDefenseMod(oppAvgInteriorDef, oppAvgInteriorStr, 'TEAM_BOX_SCORE_POST');

    // Power-curve usage: (rating/avg)^4.0 — sharper star concentration so a
    // 90-rated star absorbs ~30 FGA while a 75-rated role player gets ~11.
    const avgRating     = totalRating / Math.max(1, roster.length);
    const rawUsageArr   = roster.map(p => Math.pow(Math.max(1, p.rating) / avgRating, 4.0));
    const totalRawUsage = rawUsageArr.reduce((s, u) => s + u, 0);
    const usageShares   = rawUsageArr.map(u => u / Math.max(1, totalRawUsage));

    // Team spacing: avg 3PT attribute — drives kick-out assist opportunities for playmakers
    const teamAvg3pt = roster.reduce((s, p) => s + (p.attributes.shooting3pt ?? 70), 0) / Math.max(1, roster.length);
    // Implied team FG% from this game's points/FGA — hot-shooting teams record more assists
    const impliedFgPct = teamFga > 0 ? Math.min(0.65, Math.max(0.38, (totalPts / 2.2) / teamFga)) : 0.48;

    // Rating rank (0 = best player on roster) for star-minutes differentiation
    const sortedByRating = roster
      .map((p, idx) => ({ id: p.id, rating: p.rating, idx }))
      .sort((a, b) => b.rating - a.rating);
    const ratingRank = new Map(sortedByRating.map(({ id }, rank) => [id, rank]));

    const raw = roster.map((p, i) => {
      // Hard gate: injured players get a zero-stat DNP line, bypassing all sim logic.
      // This must run before the isGT block to prevent garbage-time code from
      // overwriting mins for players who happen to be in the first 5 roster slots.
      const isInjured = p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0);
      if (isInjured) {
        return {
          playerId: p.id, name: p.name,
          min: 0, pts: 0, reb: 0, offReb: 0, defReb: 0,
          ast: 0, stl: 0, blk: 0,
          fgm: 0, fga: 0, threepm: 0, threepa: 0, ftm: 0, fta: 0,
          tov: 0, pf: 0, techs: 0, flagrants: 0, plusMinus: 0,
          ejected: false, dnp: 'Injured',
        };
      }

      // Hard gate: suspended players sit out — DNP–Suspended line.
      if (p.isSuspended && (p.suspensionGames ?? 0) > 0) {
        return {
          playerId: p.id, name: p.name,
          min: 0, pts: 0, reb: 0, offReb: 0, defReb: 0,
          ast: 0, stl: 0, blk: 0,
          fgm: 0, fga: 0, threepm: 0, threepa: 0, ftm: 0, fta: 0,
          tov: 0, pf: 0, techs: 0, flagrants: 0, plusMinus: 0,
          ejected: false, dnp: 'Suspended',
        };
      }

      let mins = 0;
      if (team.rotation && team.rotation.minutes[p.id] !== undefined) {
        mins = Math.round(team.rotation.minutes[p.id] * quarterLengthScale);
      } else {
        const rank = ratingRank.get(p.id) ?? i;
        if (i < 5) {
          if (rank === 0)      mins = 37 + Math.floor(Math.random() * 4);
          else if (rank === 1) mins = 34 + Math.floor(Math.random() * 4);
          else if (rank === 2) mins = 30 + Math.floor(Math.random() * 4);
          else                 mins = 26 + Math.floor(Math.random() * 5);
        } else if (i < 9) mins = 14 + Math.floor(Math.random() * 10);
        else if (i < 12)  mins = Math.floor(Math.random() * 6);
        mins = Math.round(mins * quarterLengthScale);
      }
      if (isGT) {
        if (i < 5) mins = Math.max(Math.round(20 * quarterLengthScale), mins - Math.round(10 * quarterLengthScale));
        else if (i < 9) mins = Math.min(Math.round(30 * quarterLengthScale), mins + Math.round(8 * quarterLengthScale));
      }
      const ftBonus    = isHome ? 0.03 : 0;
      const varRoll    = playerVariance.get(p.id) ?? 0;
      const usageShare = usageShares[i];
      // Tendency-scheme mismatch: post-heavy player in Pace and Space, iso ball-hog
      // in Triangle, etc. — converts to effective morale penalty (0 to -15).
      const scheme         = team.activeScheme ?? 'Balanced';
      const mismatchPenalty = calcPlaybookMismatch(p, scheme);
      const line = simulatePlayerGameLine(p, totalPts, teamFga, teamReb, teamAst, mins, usageShare, varRoll, ftBonus, oppPerimDefMod, oppInteriorDefMod, oppMidDefMod, oppPostDefMod, p.morale ?? 75, teamAvg3pt, impliedFgPct, scheme, mismatchPenalty);
      return { ...line, techs: 0, flagrants: 0, ejected: false };
    });

    // No post-normalization — each player's rebounds are independent of teamReb.
    // Dominant bigs keep their raw boards; no uniform scaling suppresses elite performances.
    return raw;
  };

  let homePlayerStats = distributeToPlayers(home, totalHome, true,  garbageTime);
  let awayPlayerStats = distributeToPlayers(away, totalAway, false, garbageTime);

  totalHome = homePlayerStats.reduce((s, p) => s + p.pts, 0);
  totalAway = awayPlayerStats.reduce((s, p) => s + p.pts, 0);

  // ── 8. Chippy / tech rolls + flagrant 2 + suspension triggers ──────────────
  let isChippy = false;
  const rivalryMod = ['Hot', 'Red Hot'].includes(rivalryLevel) ? 1.5 : 1.0;
  const gameSuspensions: Array<{ playerId: string; playerName: string; teamId: string; games: number; reason: string }> = [];

  const rollForChippy = (stats: GamePlayerLine[], isHome: boolean) => {
    const teamRef = isHome ? home : away;
    stats.forEach(p => {
      const player = teamRef.roster.find(pl => pl.id === p.playerId);
      if (!player) return;
      const traits = player.personalityTraits ?? [];

      // ── Technical foul roll ───────────────────────────────────────────────
      let techChance = 0.02 * rivalryMod;
      if (traits.includes('Diva/Star'))    techChance *= 1.8;
      if (traits.includes('Tough/Alpha'))  techChance *= 1.4;
      if (traits.includes('Hot Head'))     techChance *= 1.6;
      if (traits.includes('Professional')) techChance *= 0.5;
      if (traits.includes('Leader'))       techChance *= 0.7;
      if (Math.random() < techChance) {
        p.techs += 1; isChippy = true;
        pbp.push({ time: `${Math.floor(Math.random() * 12)}:00`, quarter: Math.floor(Math.random() * 4) + 1, text: `${p.name} picks up a technical — bench reacts!`, type: 'foul' });
        if (isHome) totalAway += 1; else totalHome += 1;

        // Second tech in same game → automatic ejection; only ~20% chance of 1-game suspension
        if (p.techs >= 2 && !p.ejected) {
          p.ejected = true;
          pbp.push({ time: `${Math.floor(Math.random() * 12)}:00`, quarter: Math.floor(Math.random() * 4) + 1, text: `${p.name} EJECTED — second technical foul! He will be subject to league review.`, type: 'foul' });
          // Rare suspension: 20% baseline, Hot Head 30%
          const suspChance = traits.includes('Hot Head') ? 0.30 : 0.20;
          if (Math.random() < suspChance) {
            gameSuspensions.push({ playerId: player.id, playerName: player.name, teamId: teamRef.id, games: 1, reason: 'two technical fouls in one game' });
          }
        }
      }

      // ── Flagrant 2 roll (very rare — ~0.15–0.45% base, skip already-ejected) ──
      // A Flagrant 2 always means ejection + fine. Suspension only on repeat offenses
      // this season (player already has ≥1 flagrant) or a 25% chance on first offense.
      if (!p.ejected) {
        let flagrant2Chance = 0.0015 * rivalryMod; // halved from before
        if (traits.includes('Hot Head'))     flagrant2Chance *= 3.0;
        if (traits.includes('Tough/Alpha'))  flagrant2Chance *= 2.0;
        if (traits.includes('Diva/Star'))    flagrant2Chance *= 1.5;
        if (traits.includes('Professional')) flagrant2Chance *= 0.3;
        if (Math.random() < flagrant2Chance) {
          p.flagrants += 1; p.ejected = true; isChippy = true;
          pbp.push({ time: `${Math.floor(Math.random() * 12)}:00`, quarter: Math.floor(Math.random() * 4) + 1, text: `FLAGRANT 2 on ${p.name} — automatic ejection! Fine issued; the league will determine if a suspension follows.`, type: 'foul' });
          // Season-level flagrant count drives suspension decision
          const seasonFlagrants = (player.stats?.flagrants ?? 0) + 1; // +1 for this game
          const isRepeatOffender = seasonFlagrants >= 2;
          const suspChance = isRepeatOffender ? 1.0 : 0.25; // first offense 25%, repeat = guaranteed
          if (Math.random() < suspChance) {
            const f2Games = isRepeatOffender ? 1 + Math.floor(Math.random() * 3) : 1; // 1–3 games for repeat, 1 for first
            gameSuspensions.push({ playerId: player.id, playerName: player.name, teamId: teamRef.id, games: f2Games, reason: isRepeatOffender ? `repeat Flagrant 2 foul (${seasonFlagrants} this season)` : 'Flagrant 2 foul' });
          }
        }
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
    const trainerRating  = tm.staff.trainer?.ratingDevelopment ?? 0;
    const hcDevRating    = tm.staff.headCoach?.ratingDevelopment ?? 50;
    const medBudget      = tm.finances?.budgets?.health ?? 20;
    stats.forEach(p => {
      if (p.min < 5) return;
      const player = tm.roster.find(pl => pl.id === p.playerId);
      if (!player || player.status === 'Injured') return;
      if (injuryMultiplier === 0) return; // 'None' — injuries disabled
      let chance = 0.004 * injuryMultiplier;
      if (p.min > 35) chance *= 1.5;
      if (isB2B)      chance *= 1.3;
      // Durability attribute: 99 → ~50% less likely, 50 → neutral, 1 → ~50% more likely
      const durability = player.attributes.durability ?? 50;
      chance *= 1 - ((durability - 50) / 100);
      // Medical staff reduces injury chance (0% at tier 1 / 20, up to -40% at elite / 100)
      const medReduction = ((medBudget - 20) / 80) * 0.40;
      chance *= (1 - medReduction);
      chance *= (1 - (trainerRating / 100) * 0.3);
      if (Math.random() < chance) {
        const { type, daysOut: rawDays, msg } = rollInjury(player.name);
        // Head coach dev rating reduces injury duration (50 = 0%, 100 = -30%)
        const coachReduction = Math.max(0, (hcDevRating - 50) / 50) * 0.30;
        const daysOut = Math.max(1, Math.round(rawDays * (1 - coachReduction)));
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

  // Announce end-of-regulation tie before entering OT loop
  if (totalHome === totalAway) {
    pbp.push({ time: '0:00', text: `${home.name} ${totalHome} – ${away.name} ${totalAway} — Game tied at the end of regulation. We're going to OVERTIME!`, type: 'info', quarter: 4 });
  }

  while (totalHome === totalAway && otPeriod < 3) {
    isOvertime = true;
    otPeriod++;
    const otLabel = otPeriod === 1 ? 'OVERTIME' : otPeriod === 2 ? 'DOUBLE OVERTIME' : 'TRIPLE OVERTIME';
    pbp.push({ time: '5:00', text: `${otLabel} — ${home.name} vs. ${away.name}! 5 minutes on the clock.`, type: 'info', quarter: 4 + otPeriod });

    // 8-10 possessions per team per OT period; urgency boosts scoring slightly
    const otPoss  = 8 + Math.floor(Math.random() * 3);
    const otBoost = 0.05; // PPP lift from urgency
    const otH = Math.max(6, Math.round(otPoss * (homePPP + homeCourtAdv + otBoost)));
    const otA = Math.max(6, Math.round(otPoss * (awayPPP + otBoost)));

    totalHome += otH;
    totalAway += otA;

    // Track OT scores in quarterScores so the box score table shows OT columns
    homeQScores.push(otH);
    awayQScores.push(otA);

    // Announce OT result before checking for more OT
    if (totalHome !== totalAway) {
      const otWinner = totalHome > totalAway ? home.name : away.name;
      pbp.push({ time: '0:05', text: `${otWinner} takes the lead with seconds left in ${otLabel}!`, type: 'score', quarter: 4 + otPeriod });
    } else if (otPeriod < 3) {
      pbp.push({ time: '0:00', text: `Still tied at the end of ${otLabel}! We need another period!`, type: 'info', quarter: 4 + otPeriod });
    }

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

  const finalQuarter = 4 + otPeriod; // Q4 in regulation, OT1/OT2/OT3 if overtime
  if (isBuzzerBeater) pbp.push({ time: '0:01', text: 'BUZZER BEATER! The crowd erupts!', type: 'score', quarter: finalQuarter });
  pbp.push({ time: '0:00', text: 'Final Buzzer', type: 'info', quarter: finalQuarter });

  const margin = totalHome - totalAway;

  // Distribute per-player +/- so sum(home) = 5 × margin, sum(away) = -5 × margin.
  // Each player's value reflects their relative efficiency and minutes, with noise.
  const assignPlusMinuses = <T extends { plusMinus: number; pts: number; reb: number; ast: number; tov: number; min: number; dnp?: string }>(
    stats: T[],
    teamMargin: number,
  ): T[] => {
    if (stats.length === 0) return stats;
    // DNP players never get +/- — they weren't on the court
    const active = stats.filter(p => !p.dnp && p.min > 0);
    if (active.length === 0) return stats;
    const target = 5 * teamMargin; // mathematical on-court constraint
    const effs = active.map(p =>
      (p.pts + p.reb * 0.4 + p.ast * 0.6 - (p.tov ?? 0) * 0.8) / p.min,
    );
    const avgEff = effs.reduce((a, b) => a + b, 0) / effs.length;
    const raw = active.map((p, i) => {
      const relEff = effs[i] - avgEff;
      const effShift = relEff * 14;
      const noise    = (Math.random() - 0.5) * 6;
      return teamMargin + effShift + noise;
    });
    const rawSum = raw.reduce((a, b) => a + b, 0);
    const adj    = (target - rawSum) / active.length;
    const rounded = raw.map(pm => Math.round(pm + adj));
    const drift = target - rounded.reduce((a, b) => a + b, 0);
    if (drift !== 0) {
      const maxIdx = active.reduce((best, _, i) => active[i].min > active[best].min ? i : best, 0);
      rounded[maxIdx] += drift;
    }
    let ai = 0;
    return stats.map(s => s.dnp || s.min === 0 ? { ...s, plusMinus: 0 } : { ...s, plusMinus: rounded[ai++] });
  };

  homePlayerStats = assignPlusMinuses(homePlayerStats, margin);
  awayPlayerStats = assignPlusMinuses(awayPlayerStats, -margin);

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

  // ── 12. Clutch Stats Injection ────────────────────────────────────────────
  // Clutch = last 5 min of Q4/OT when score diff ≤ 5 at game end.
  // Since we use box-score sim (not per-possession), clutch stats are synthetically derived.
  const hasClutchSituation = Math.abs(margin) <= 5;
  let clutchHomeScore = 0;
  let clutchAwayScore = 0;

  if (hasClutchSituation) {
    const q4Home = homeQScores[3] ?? 0;
    const q4Away = awayQScores[3] ?? 0;
    // Last 5 min of Q4 as a fraction of actual quarter length
    const clutchFraction = Math.min(1, 5 / quarterLength);
    clutchHomeScore = Math.max(0, Math.round(q4Home * clutchFraction + (Math.random() * 2 - 1)));
    clutchAwayScore = Math.max(0, Math.round(q4Away * clutchFraction + (Math.random() * 2 - 1)));

    const injectClutchStats = (
      stats: GamePlayerLine[],
      team: Team,
      teamClutchPts: number,
      clutchMarginSign: number,
    ): GamePlayerLine[] => {
      const active = stats.filter(s => !s.dnp && s.min > 0);
      if (active.length === 0 || teamClutchPts <= 0) return stats;

      // Weight = minuteShare × clutchShotTaker tendency (default 50 → weight 1.0)
      const weights = active.map(s => {
        const p = team.roster.find(r => r.id === s.playerId);
        const clutchTendency = p?.tendencies?.situationalTendencies?.clutchShotTaker ?? 50;
        return (s.min / 48) * (clutchTendency / 50);
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const normWeights = weights.map(w => w / Math.max(totalWeight, 0.001));

      const withClutch = active.map((s, i) => {
        const share = normWeights[i];
        const cPts = Math.max(0, Math.round(teamClutchPts * share));
        // Derive shooting ratios from player's overall game line
        const fgPct      = s.fga  > 0 ? s.fgm  / s.fga  : 0.45;
        const threePct   = s.threepa > 0 ? s.threepm / s.threepa : 0.35;
        const ftPct      = s.fta  > 0 ? s.ftm  / s.fta  : 0.75;
        // Allocate pts: ~25% FT, ~20% 3pt, rest 2pt
        const cFta       = Math.max(0, Math.round(cPts * 0.25));
        const cFtm       = Math.max(0, Math.round(cFta * ftPct));
        const cThreepa   = Math.max(0, Math.round(cPts * 0.20 / 3));
        const cThreepm   = Math.max(0, Math.round(cThreepa * threePct));
        const rem        = Math.max(0, cPts - cFtm - cThreepm * 3);
        const cFga2      = Math.max(0, Math.round(rem / 2));
        const cFgm2      = Math.max(0, Math.round(cFga2 * fgPct));
        const cFgm       = cFgm2 + cThreepm;
        const cFga       = cFga2 + cThreepa;
        const cReb       = Math.max(0, Math.round(s.reb  * share * 0.5));
        const cAst       = Math.max(0, Math.round(s.ast  * share * 0.5));
        const cMin       = Math.min(5, Math.max(0, Math.round(s.min * (5 / 48) * 1.5)));
        const cPlusMinus = clutchMarginSign * Math.max(0, Math.round(Math.abs(s.plusMinus) * share));
        const clutchStats: ClutchGameLine = {
          clutchMin:      cMin,
          clutchPts:      cPts,
          clutchReb:      cReb,
          clutchAst:      cAst,
          clutchFgm:      cFgm,
          clutchFga:      Math.max(cFgm, cFga),
          clutchThreepm:  cThreepm,
          clutchThreepa:  Math.max(cThreepm, cThreepa),
          clutchFtm:      cFtm,
          clutchFta:      Math.max(cFtm, cFta),
          clutchPlusMinus: cPlusMinus,
        };
        return { ...s, clutchStats };
      });

      const clutchById = new Map(withClutch.map(s => [s.playerId, s.clutchStats!]));
      return stats.map(s => {
        const cs = clutchById.get(s.playerId);
        return cs ? { ...s, clutchStats: cs } : s;
      });
    };

    const homeWonClutch = clutchHomeScore >= clutchAwayScore ? 1 : -1;
    homePlayerStats = injectClutchStats(homePlayerStats, home, clutchHomeScore, homeWonClutch);
    awayPlayerStats = injectClutchStats(awayPlayerStats, away, clutchAwayScore, -homeWonClutch);
  }

  const allLines = [...homePlayerStats, ...awayPlayerStats].sort((a, b) => b.pts - a.pts);

  return {
    id: `game-${date}-${home.id}-${away.id}`,
    homeTeamId:   home.id,
    awayTeamId:   away.id,
    homeScore:    totalHome,
    awayScore:    totalAway,
    quarterScores: { home: homeQScores, away: awayQScores },
    quarterDetails,
    hasClutchSituation,
    clutchHomeScore,
    clutchAwayScore,
    homePlayerStats,
    awayPlayerStats,
    topPerformers: allLines.slice(0, 3).map(l => ({ playerId: l.playerId, points: l.pts, rebounds: l.reb, assists: l.ast })),
    playByPlay: pbp,
    date, season, isOvertime, isBuzzerBeater, isComeback, isChippy, gameInjuries, gameSuspensions,
  };
};


