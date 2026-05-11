import { Team, GameResult, Player, GamePlayerLine, ClutchGameLine, CoachScheme, PlayByPlayEvent, InjuryType, LeagueState, QuarterDetail, LeagueSettings } from '../types';

// ─── Tendency adapters ────────────────────────────────────────────────────────
// Map the flat PlayerTendencies to legacy field names used throughout simEngine
function getOT(p: Player) {
  const t = p.tendencies;
  const offScreen = t ? (t.offScreenThree + t.offScreenMidRange) / 2 : 50;
  return {
    pullUpThree:      t?.pullUpThree   ?? 50,
    postUp:           t?.postUp        ?? 50,
    driveToBasket:    t?.drive         ?? 50,
    midRangeJumper:   t?.midRange      ?? 50,
    kickOutPasser:    t?.pass          ?? 50,
    isoHeavy:         t?.isolation     ?? 50,
    transitionHunter: t?.drive         ?? 50,
    spotUp:           t?.spotUp        ?? 50,
    cutter:           t?.cutToBasket   ?? 50,
    offScreen,
    attackCloseOuts:  t?.drive         ?? 50,
    drawFoul:         t?.foulDrawing   ?? 50,
    dribbleHandOff:   t?.pass          ?? 50,
    pullUpOffPnr:     t?.pullUpJumper  ?? 50,
    clutchShotTaker:  t?.isolation     ?? 50,
  };
}

function getDT(p: Player) {
  const t = p.tendencies;
  return {
    gambles:               t?.onBallSteal  ?? 50,
    helpDefender:          t?.playPassLane ?? 50,
    physicality:           t?.block        ?? 50,
    faceUpGuard:           t?.shotContest  ?? 50,
    onBallPest:            t?.onBallSteal  ?? 50,
    denyThePass:           t?.playPassLane ?? 50,
    shotContestDiscipline: t?.shotContest  ?? 50,
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE_PPP       = 1.10;
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
    // Plus → elite: 18 % at 80 → 13 % at 94 (raised +3 pp to lift team floor)
    base = 0.18 - ((bh - 80) / 14) * 0.05;
  } else {
    // God-tier: 13 % at 95 → 12 % at 100 (raised from 10/8.5 to ensure realistic team min)
    base = 0.13 - ((bh - 95) / 5) * 0.01;
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

  return Math.max(0.13, Math.min(0.32, base));
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
 * Tuning: STL_OPP_SCALE in runOffenseEngine controls the steal opportunity rate;
 * raise/lower it to shift team totals.
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
 * Tuning: BLK_OPP_SCALE in runOffenseEngine controls the block opportunity rate;
 * raise/lower to shift team totals.
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
 * Maps a player's freeThrow attribute (0–100) to a base FT%.
 *
 * Piecewise calibration — realistic NBA tiers:
 *   attr   0–50 → 45–66 %  (hack-a range; Shaq-tier to below-avg bigs)
 *   attr  51–70 → 66–77 %  (below-avg → league average)
 *   attr  71–85 → 77–85 %  (above-avg; reliable in clutch)
 *   attr  86–100→ 85–91 %  (elite: SGA / prime KD territory)
 *
 * Per-game noise (±3 %, ±5 % for Streaky) applied at call site.
 * Season average for an attr-95 guard: ~89–91 %, rarely above 92 %.
 *
 * Hard clamp: [0.45, 0.94]
 */
export function getFreeThrowPercentage(attr: number, position?: string): number {
  const a = Math.max(0, Math.min(100, attr));

  let base: number;
  if (a <= 50) {
    base = 0.45 + (a / 50) * 0.21;           // 45 % → 66 % at 50
  } else if (a <= 70) {
    base = 0.66 + ((a - 50) / 20) * 0.11;    // 66 % → 77 % at 70
  } else if (a <= 85) {
    base = 0.77 + ((a - 70) / 15) * 0.08;    // 77 % → 85 % at 85
  } else {
    base = 0.85 + ((a - 85) / 15) * 0.06;    // 85 % → 91 % at 100
  }

  const positionalTweak =
    position === 'PG' || position === 'SG' || position === 'SF' ? +0.008 :
    position === 'C'  || position === 'PF'                      ? -0.012 :
    0;

  return Math.max(0.45, Math.min(0.94, base + positionalTweak));
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
    const ot = getOT(handler);

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

  // Hard clamp: no team below 72 (top-10 avg) or above 86.
  // Lowered from 76/92 to match the tighter OVR distribution where 90+ is rare.
  teams.forEach(t => {
    let ovr = teamOVR(t);
    if (ovr < 72) {
      const sorted = t.roster.slice().sort((a, b) => a.rating - b.rating);
      for (const p of sorted) {
        if (teamOVR(t) >= 72) break;
        const real = t.roster.find(r => r.id === p.id)!;
        real.rating = Math.min(86, real.rating + 3);
        real.attributes.shooting = Math.min(99, real.attributes.shooting + 2);
      }
    } else if (ovr > 86) {
      const sorted = t.roster.slice().sort((a, b) => b.rating - a.rating);
      for (const p of sorted) {
        if (teamOVR(t) <= 86) break;
        const real = t.roster.find(r => r.id === p.id)!;
        real.rating = Math.max(72, real.rating - 3);
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
  dt: ReturnType<typeof getDT> | undefined,
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
  const dt      = getDT(defender);
  const gambles = dt.gambles;
  const helpDef = dt.helpDefender;
  const pest    = dt.onBallPest;
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
  const dt          = getDT(defender);
  const discipline  = dt.shotContestDiscipline;
  const helpDef     = dt.helpDefender;
  const physicality = dt.physicality;
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
  const ot = getOT(offHandler);
  const ln = lastName(offHandler);
  const defIdx   = Math.floor(Math.random() * Math.min(8, defense.roster.length));
  const defender = defense.roster[defIdx];
  const dt       = defender ? getDT(defender) : undefined;
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
    const drawFoulTend = ot.drawFoul;
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
    const contestDisc = dt?.shotContestDiscipline ?? 50;
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
  const dt  = getDT(defender);
  const gambles           = dt.gambles;
  const physicality       = dt.physicality;
  const contestDiscipline = dt.shotContestDiscipline;
  const helpDefender      = dt.helpDefender;
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
  const ot = getOT(p);
  const dt = getDT(p);
  const diq = p.attributes.defensiveIQ ?? 65;
  return {
    threepaBoost: (ot.pullUpThree    - 50) / 100 * 0.40,
    insideBoost:  (ot.driveToBasket  - 50) / 100 * 0.30
                + (ot.cutter         - 50) / 100 * 0.12,
    usageBoost:   (ot.isoHeavy       - 50) / 100 * 0.45   // primary scorer lever
                + (ot.attackCloseOuts - 50) / 100 * 0.10  // off-ball creation
                + (ot.pullUpOffPnr    - 50) / 100 * 0.08  // PnR volume
                - (ot.kickOutPasser   - 50) / 100 * 0.08  // pass-first penalty
                + (ot.drawFoul        - 50) / 100 * 0.08, // FTA-getter = more touches
    astBoost:     (ot.kickOutPasser  - 50) / 100 * 0.35
                + (ot.spotUp         - 50) / 100 * 0.08,

    // stlBoost: gambles (reach frequency) + denyThePass (passing-lane reads)
    //           + helpDefender (rotation intercepts from weak side)
    stlBoost:     (dt.gambles        - 50) / 100 * 0.30
                + (dt.denyThePass    - 50) / 100 * 0.10
                + (dt.helpDefender   - 50) / 100 * 0.08,

    // blkBoost: help rotations generate most blocks; physicality adds contested
    //           rejection power; disciplined contests rarely get pump-faked.
    blkBoost:     (dt.helpDefender         - 50) / 100 * 0.25
                + (dt.physicality          - 50) / 100 * 0.10
                + (dt.shotContestDiscipline - 50) / 100 * 0.05,

    // foulRisk: tendency-driven raw risk.  Now also reduced by Defensive IQ
    //   so smart defenders who are physical still commit fewer dumb fouls.
    foulRisk:     (dt.physicality             - 50) / 100 * 0.25
                + (dt.gambles                 - 50) / 100 * 0.15
                + (dt.onBallPest              - 50) / 100 * 0.10
                - (dt.shotContestDiscipline   - 50) / 100 * 0.12
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
  const ot = getOT(player);

  // Returns 0–10 penalty proportional to how far a tendency exceeds its threshold.
  const excess = (val: number, threshold: number, weight: number): number =>
    val <= threshold ? 0 : Math.min(10, ((val - threshold) / 5) * weight);

  let penalty = 0;
  switch (scheme) {
    case 'Pace and Space':
      penalty += excess(ot.postUp,   55, 1.2); // post-heavy player stalls spacing
      penalty += excess(ot.isoHeavy, 60, 0.8); // iso ball-stopper disrupts motion
      break;
    case 'Grit and Grind':
      penalty += excess(ot.pullUpThree,     60, 1.0); // shooter can't find 3PT looks
      penalty += excess(ot.transitionHunter, 65, 0.8); // transition hunter vs. half-court grind
      penalty += excess(ot.spotUp,          65, 0.6); // spot-up guy loses corner touches
      break;
    case 'Triangle':
      penalty += excess(ot.isoHeavy, 55, 1.2); // iso breaks Triangle ball movement
      break;
    case 'Small Ball':
      penalty += excess(ot.postUp, 60, 1.0); // post player clogs small-ball lanes
      break;
    case 'Showtime':
      penalty += excess(ot.postUp, 60, 0.8); // post-up stalls the fast break
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

// ─── Intentional Late-Game Fouling ───────────────────────────────────────────
/** Generates PBP events for intentional-foul sequences when a trailing team
 *  is down 1–8 in the final 60 seconds of Q4 or OT. */
const generateIntentionalFoulEvents = (
  trailingTeam: Team,
  leadingTeam: Team,
  deficit: number,
  quarter: number,
  isWNBA: boolean,
): PlayByPlayEvent[] => {
  const events: PlayByPlayEvent[] = [];

  // Number of foul sequences scales with deficit and urgency
  // Down ≤3: can squeeze in 3 fouls in 60 sec; down 7-8: one desperation foul
  const nSeqs = deficit <= 3 ? 3 : deficit <= 6 ? 2 : 1;

  // All clock times confined to the final 60 seconds (0:59 → 0:00)
  const seqTimes =
    nSeqs === 3 ? ['0:52', '0:35', '0:14'] :
    nSeqs === 2 ? ['0:48', '0:22'] :
                  ['0:40'];

  // Find the worst FT shooter on leading team — weight C/PF as preferred hack-a targets
  const leadRoster = leadingTeam.roster.filter(p => !p.injured);
  if (!leadRoster.length) return events;
  const foulTarget = leadRoster.reduce((worst, p) => {
    const score  = (p.attributes?.freeThrow ?? 50) - (['C', 'PF'].includes(p.position ?? '') ? 5 : 0);
    const wScore = (worst.attributes?.freeThrow ?? 50) - (['C', 'PF'].includes(worst.position ?? '') ? 5 : 0);
    return score < wScore ? p : worst;
  }, leadRoster[0]);

  // A big on the trailing team commits the foul
  const trailRoster = trailingTeam.roster.filter(p => !p.injured);
  if (!trailRoster.length) return events;
  const fouler = trailRoster.find(p => ['PF', 'C'].includes(p.position ?? '')) ?? trailRoster[0];

  const targetName = lastName(foulTarget);
  const foulerName = lastName(fouler);
  const trailCoach = trailingTeam.staff.headCoach?.name?.split(' ').at(-1) ?? 'Coach';
  const ftPct = getFreeThrowPercentage(foulTarget.attributes?.freeThrow ?? 50, foulTarget.position);
  const pr = pronouns(foulTarget);
  const isOT = quarter > 4;

  for (let i = 0; i < seqTimes.length; i++) {
    const time = seqTimes[i];
    // Parse seconds from "0:SS" for flavor text
    const secsLeft = parseInt(time.split(':')[1], 10);

    // Coach signals the intentional foul — reference the live clock
    const callLines = [
      `${trailCoach} signals for the intentional foul — ${secsLeft} seconds left, no other choice!`,
      `Hack-a strategy engaged with ${secsLeft} seconds on the clock. ${trailCoach} calling the play!`,
      `${trailCoach} calls for the deliberate foul — ${trailingTeam.name} need every possession with ${secsLeft} to go.`,
      `INTENTIONAL FOUL — ${trailCoach} screaming from the sideline with ${secsLeft} seconds remaining${isOT ? ' in OT' : ''}!`,
    ];
    events.push({ time, text: callLines[Math.floor(Math.random() * callLines.length)], type: 'info', quarter });

    // Foul committed
    const foulLines = [
      `${foulerName} grabs ${targetName} deliberately — sending ${pr.him} to the line. Two shots.`,
      `${targetName} is fouled hard on the perimeter — ${foulerName} with the intentional hack. Two free throws.`,
      `${foulerName} wraps up ${targetName}. Deliberate foul called — ${targetName} at the stripe.`,
      `Intentional foul by ${foulerName} on ${targetName}. ${pr.He} steps to the charity stripe.`,
    ];
    events.push({ time, text: foulLines[Math.floor(Math.random() * foulLines.length)], type: 'foul', quarter });

    // Free throw 1
    const ft1Make = Math.random() < ftPct;
    const ft1Lines = ft1Make
      ? [
          `${targetName} knocks down FT #1 — ${leadingTeam.name} extending the lead with ${secsLeft} seconds left.`,
          `${targetName} calm under pressure — buries the first free throw.`,
          `Free throw GOOD. ${targetName} automatic from the charity stripe.`,
          `${targetName} drills the first one. Hack-a strategy not working yet.`,
        ]
      : [
          `${targetName} MISSES FT #1 with ${secsLeft} seconds left — hack-a strategy paying off!`,
          `Off the back of the rim! ${targetName} clanks the first free throw. ${trailingTeam.name} alive!`,
          `${targetName} can't convert — FT #1 rattles out! ${trailingTeam.name} needed that!`,
          `No good! ${targetName} misses the first. The strategy is WORKING for ${trailingTeam.name}!`,
        ];
    events.push({ time, text: ft1Lines[Math.floor(Math.random() * ft1Lines.length)], type: ft1Make ? 'score' : 'miss', quarter });

    // Free throw 2
    const ft2Make = Math.random() < ftPct;
    const ft2Lines = ft2Make
      ? [
          `${targetName} converts FT #2. ${leadingTeam.name} holding on with ${secsLeft} seconds to go.`,
          `FT #2 is GOOD — ${pr.he} goes 2-for-2. ${trailingTeam.name} running out of time.`,
          `${targetName} completes the two-shot trip. Hack-a backfired — tough night for ${trailingTeam.name}.`,
          `Knocks down the second too. ${trailingTeam.name} needs a miracle with ${secsLeft} seconds left.`,
        ]
      : [
          `${targetName} MISSES FT #2 with ${secsLeft} seconds left! ${trailingTeam.name} gets a live-ball rebound!`,
          `FT #2 off the iron! Hack-a ${targetName} is WORKING tonight!`,
          `Both free throws missed — ${trailingTeam.name} grabs the board and still has a chance!`,
          `Can't hit from the line — ${trailingTeam.name} with the rebound and ${secsLeft} seconds to tie!`,
        ];
    events.push({ time, text: ft2Lines[Math.floor(Math.random() * ft2Lines.length)], type: ft2Make ? 'score' : 'miss', quarter });

    // Live rebound if either FT missed
    if (!ft1Make || !ft2Make) {
      const rebLines = [
        `${trailingTeam.name} secures the rebound — pushing the pace with ${secsLeft} seconds on the clock!`,
        `Rebound ${trailingTeam.name}! Clock stopped — the comeback is alive!`,
        `${trailingTeam.name} with the board — timeout called to set up the final play.`,
        `${trailingTeam.name} grabs it! They need a score NOW to keep this game going.`,
      ];
      events.push({ time, text: rebLines[Math.floor(Math.random() * rebLines.length)], type: 'info', quarter });
    }

    // After the last sequence, add ball-inbound acknowledgment with dwindling clock
    if (i === seqTimes.length - 1) {
      const afterSecs = Math.max(2, secsLeft - 6);
      const inboundTime = `0:${afterSecs.toString().padStart(2, '0')}`;
      const inboundLines = [
        `Ball inbounded — ${afterSecs} seconds left on the clock. ${leadingTeam.name} just needs to survive.`,
        `Clock ticking down… ${afterSecs} seconds remaining. ${trailingTeam.name} needs a miracle finish.`,
        `${afterSecs} seconds left${isOT ? ' in OT' : ''}. ${leadingTeam.name} holds a ${deficit}-point lead.`,
        `Ball in play — ${afterSecs} seconds to go. Can ${trailingTeam.name} complete the comeback?`,
      ];
      events.push({ time: inboundTime, text: inboundLines[Math.floor(Math.random() * inboundLines.length)], type: 'info', quarter });
    }
  }

  return events;
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

// ─── Possession-Based Box Score Engine ───────────────────────────────────────
//
// Design contract:
//   Attributes  → per-event success rate  (FG%, finish%, block%, steal%, FT%)
//   Tendencies  → event frequency          (which possession type is selected)
//   Stats emerge purely from resolved events — no post-hoc scaling or hard caps.
//
// runOffenseEngine() simulates every team possession individually.
// Cross-team defensive stats (blk, stl, dreb) are recorded directly on the
// defending team's states, so both engines share state before finalizing lines.

type PossessionType =
  | 'TRANSITION'   // fast break; athleticism + finishing vs. back-pedal defense
  | 'ISO'          // one-on-one isolation; ballHandling + scoring vs. perimDef
  | 'POST_UP'      // low-post entry; postScoring + strength vs. interiorDef
  | 'PNR_BH'       // pick-and-roll ball handler; pull-up vs. perimeter D
  | 'PNR_ROLL'     // pick-and-roll roll man; layup/dunk vs. interiorDef + blocks
  | 'SPOT_UP'      // catch-and-shoot three; 3PT% vs. contest speed
  | 'OFF_SCREEN'   // curl off screen; 3PT/mid vs. recovery and contest
  | 'CUT'          // backdoor/basket cut; layup vs. interior awareness
  | 'DRIVE_KICK'   // drive-and-kick to open shooter; passer vision, shooter 3PT
  | 'OREB_CONT'    // offensive rebound continuation; finisher + offReb tendency
  | 'BAILOUT';     // late-clock scramble; any scorer with high isolation

interface TeamPossState {
  p: Player;
  min: number;
  minFrac: number;
  varRoll: number;   // tip-off variance roll: positive = hot, negative = cold
  // mutable stats accumulated by the engine
  pts: number; fga: number; fgm: number;
  tpa: number; tpm: number; fta: number; ftm: number;
  oreb: number; dreb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number;
  fatigue: number;   // 0 = fresh, increases with touches; caps at 0.45
  // per-player audit
  _touches: number;
  _possTypes: Partial<Record<PossessionType, number>>;
  _shotInside: number; _shotMid: number; _shotThree: number;
  _assistedMakes: number; _unassistedMakes: number;
  _rebChances: number; _astCreated: number;
  _tovBadPass: number; _tovLostBall: number; _tovOffFoul: number;
  _defEvents: number;
}

const mkTeamPossState = (p: Player, min: number, varRoll: number): TeamPossState => ({
  p, min, minFrac: min / 48, varRoll,
  pts: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0,
  oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  fatigue: 0,
  _touches: 0, _possTypes: {},
  _shotInside: 0, _shotMid: 0, _shotThree: 0,
  _assistedMakes: 0, _unassistedMakes: 0,
  _rebChances: 0, _astCreated: 0,
  _tovBadPass: 0, _tovLostBall: 0, _tovOffFoul: 0,
  _defEvents: 0,
});

// Scheme base possession-type weights. Each scheme biases toward its identity play.
const SCHEME_POSS_WEIGHTS: Record<CoachScheme, Record<PossessionType, number>> = {
  'Balanced':       { TRANSITION:14, ISO:8,  POST_UP:7,  PNR_BH:17, PNR_ROLL:10, SPOT_UP:20, OFF_SCREEN:6,  CUT:8,  DRIVE_KICK:8,  OREB_CONT:2, BAILOUT:0 },
  'Pace and Space': { TRANSITION:22, ISO:5,  POST_UP:3,  PNR_BH:15, PNR_ROLL:6,  SPOT_UP:28, OFF_SCREEN:5,  CUT:6,  DRIVE_KICK:7,  OREB_CONT:2, BAILOUT:1 },
  'Grit and Grind': { TRANSITION:8,  ISO:10, POST_UP:18, PNR_BH:14, PNR_ROLL:14, SPOT_UP:14, OFF_SCREEN:8,  CUT:7,  DRIVE_KICK:5,  OREB_CONT:2, BAILOUT:0 },
  'Triangle':       { TRANSITION:10, ISO:5,  POST_UP:12, PNR_BH:10, PNR_ROLL:10, SPOT_UP:18, OFF_SCREEN:12, CUT:14, DRIVE_KICK:7,  OREB_CONT:2, BAILOUT:0 },
  'Small Ball':     { TRANSITION:20, ISO:8,  POST_UP:4,  PNR_BH:17, PNR_ROLL:7,  SPOT_UP:22, OFF_SCREEN:7,  CUT:7,  DRIVE_KICK:6,  OREB_CONT:1, BAILOUT:1 },
  'Showtime':       { TRANSITION:28, ISO:6,  POST_UP:6,  PNR_BH:12, PNR_ROLL:9,  SPOT_UP:16, OFF_SCREEN:6,  CUT:9,  DRIVE_KICK:6,  OREB_CONT:1, BAILOUT:1 },
};

/** Weighted random pick — O(n). Returns arr[i] with prob proportional to wFn(arr[i]). */
function pickWeighted<T>(arr: T[], wFn: (x: T) => number): T {
  if (arr.length === 1) return arr[0];
  const ws = arr.map(wFn);
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return arr[Math.floor(Math.random() * arr.length)];
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

/** Blended inside FG% (layup/dunk/post) for a player — same formula as old box-score path. */
function getInsideFgPctForPlayer(p: Player): number {
  const layupBase = getLayupPercentage(p.attributes.layups, p.position);
  const dunkBase  = getDunkPercentage(p.attributes.dunks,  p.position, p.attributes.jumping);
  const postBase  = getPostScoringPercentage(
    p.attributes.postScoring, p.position, p.attributes.strength, p.attributes.offensiveIQ);
  const dunkW = Math.min(0.20, p.attributes.dunks / 100 * 0.20);
  const postW = Math.min(0.25, p.attributes.postScoring / 100 * 0.25);
  return layupBase * Math.max(0, 1 - dunkW - postW) + dunkBase * 0.75 * dunkW + postBase * postW;
}

/** Defender's per-zone FG-suppression mod (negative = harder to score). */
function zoneDefMod(def: Player, zone: 'inside' | 'mid' | 'three'): number {
  if (zone === 'three')  return get3PTContestMod(def.attributes.perimeterDef ?? 50, 'TEAM_BOX_SCORE', def.attributes.defensiveIQ ?? 50);
  if (zone === 'inside') return getRimProtectionMod(def.attributes.interiorDef ?? 50, 'TEAM_BOX_SCORE');
  return getMidRangeContestMod(def.attributes.perimeterDef ?? 50, 'TEAM_BOX_SCORE_MID', def.attributes.defensiveIQ ?? 50);
}

// Fraction of made baskets that earn an assist, keyed by possession type.
// Derived from NBA 2024-25 play-type assist rates (Synergy / Second Spectrum).
const ASSIST_PROB: Record<PossessionType, number> = {
  CUT:        0.90,  // catch-and-cut is nearly always assisted
  PNR_ROLL:   0.82,  // roll-man catch almost always gets a pass credit
  SPOT_UP:    0.88,  // catch-and-shoot = assisted by definition
  DRIVE_KICK: 0.85,  // driver kicks out, shooter hits → driver gets AST
  OFF_SCREEN: 0.78,  // curl shooter gets the pass credit
  TRANSITION: 0.50,  // mix of outlet-pass scores and solo runs
  PNR_BH:     0.28,  // pull-up is often unassisted; some kick-backs are assisted
  POST_UP:    0.22,  // post entry pass doesn't count; most are unassisted
  ISO:        0.12,  // pure isolation — rare assist
  OREB_CONT:  0.04,  // put-back is almost always unassisted
  BAILOUT:    0.08,  // late-clock scramble
};

/**
 * Credits an assist to the most likely passer after a made basket.
 * For pass plays the natural assister is the ball handler.
 * For other play types, the best playmaker on court is picked.
 * Updates _assistedMakes / _unassistedMakes audit fields on the shooter.
 */
function resolveAssist(
  shooter: TeamPossState,
  bh: TeamPossState,
  court: TeamPossState[],
  possType: PossessionType,
): void {
  const prob = ASSIST_PROB[possType] ?? 0.30;
  if (Math.random() >= prob) {
    shooter._unassistedMakes++;
    return;
  }
  // Pass plays: ball handler passed to a different shooter → BH gets the AST.
  const isNaturalPassPlay = (possType === 'PNR_ROLL' || possType === 'SPOT_UP'
    || possType === 'CUT' || possType === 'DRIVE_KICK' || possType === 'OFF_SCREEN')
    && bh.p.id !== shooter.p.id;
  const candidates = court.filter(s => s.p.id !== shooter.p.id);
  if (candidates.length === 0) { shooter._unassistedMakes++; return; }
  const assister = isNaturalPassPlay
    ? bh
    : pickWeighted(candidates, s => {
        const pass = s.p.attributes.passing    ?? 50;
        const pm   = s.p.attributes.playmaking ?? 50;
        const oiq  = s.p.attributes.offensiveIQ ?? 50;
        return Math.max(0.01, (pass + pm + oiq) / 300 * s.minFrac);
      });
  assister.ast++;
  assister._astCreated++;
  shooter._assistedMakes++;
}

/**
 * Core possession engine — simulates every offensive possession for offTeam.
 *
 * Design principles (must remain stable):
 *   Attributes  → per-event success rate (FG%, block%, steal%, FT%)
 *   Tendencies  → event frequency (possession type weights, who handles)
 *   Stats emerge from resolved events — no post-hoc clamping or scaling.
 *
 * Defensive checks on every possession:
 *   1. On-ball pressure: boosts TOV chance, adds FG% contest penalty.
 *   2. Pass-lane steal: intercept chance before shooter receives ball.
 *   3. Block check: all on-court defenders checked in order of blocks rating.
 *   4. Shot contest: defMod scaled 2.5× for meaningful per-player impact.
 *   5. Foul check: realistic rate (avg ~11%, elite ~13%), cap 0.15.
 */
function runOffenseEngine(
  offTeam: TeamPossState[],
  defTeam: TeamPossState[],
  totalPoss: number,
  scheme: CoachScheme,
  pbMults: typeof PLAYBOOK_SHOT_MODS[CoachScheme],
  isWNBA: boolean,
): void {
  const offActive = offTeam.filter(s => s.minFrac > 0);
  const defActive = defTeam.filter(s => s.minFrac > 0);
  if (offActive.length === 0) return;

  const schemeW = SCHEME_POSS_WEIGHTS[scheme] ?? SCHEME_POSS_WEIGHTS['Balanced'];

  for (let teamPoss = 0; teamPoss < totalPoss; teamPoss++) {
    // ── On-court selection (~5 per side, weighted by minute fraction) ──────
    const offFrac = offActive.reduce((s, p) => s + p.minFrac, 0);
    const defFrac = defActive.reduce((s, p) => s + p.minFrac, 0);
    const onOff = offActive.filter(s => Math.random() < s.minFrac * 5 / Math.max(1, offFrac));
    const onDef = defActive.filter(s => Math.random() < s.minFrac * 5 / Math.max(1, defFrac));
    const court  = onOff.length >= 3 ? onOff : offActive.slice(0, Math.min(5, offActive.length));
    const dCourt = onDef.length >= 2 ? onDef : defActive.slice(0, Math.min(5, defActive.length));

    // ── Ball-handler selection: 1.5-power keeps star involvement realistic ─
    // Raised from 2.0 → 1.5 so a 90-rated player gets ~25% of BH duties,
    // not 30%+, preventing unrealistic 28+ FGA concentrations.
    const bh = pickWeighted(court, s => {
      const ot      = getOT(s.p);
      const play    = (ot.isoHeavy + ot.pullUpOffPnr + ot.driveToBasket + ot.kickOutPasser) / 4;
      const hotBoost = 1 + s.varRoll / 100 * 0.20;
      return Math.max(0.01,
        Math.pow(s.p.rating / 75, 1.5) * s.minFrac * (1 + (play - 50) / 100) * hotBoost);
    });
    bh._touches++;

    // ── Possession type: scheme base weighted by BH tendencies ─────────────
    const ot = getOT(bh.p);
    const wMap = { ...schemeW } as Record<PossessionType, number>;
    wMap.ISO        = Math.max(0, wMap.ISO        * (1 + (ot.isoHeavy        - 50) / 100));
    wMap.POST_UP    = Math.max(0, wMap.POST_UP    * (1 + (ot.postUp          - 50) / 100));
    wMap.SPOT_UP    = Math.max(0, wMap.SPOT_UP    * (1 + (ot.spotUp          - 50) / 100));
    wMap.CUT        = Math.max(0, wMap.CUT        * (1 + (ot.cutter          - 50) / 100));
    wMap.TRANSITION = Math.max(0, wMap.TRANSITION * (1 + (ot.transitionHunter - 50) / 100));
    wMap.PNR_BH     = Math.max(0, wMap.PNR_BH     * (1 + (ot.pullUpOffPnr    - 50) / 100));
    wMap.DRIVE_KICK = Math.max(0, wMap.DRIVE_KICK * (1 + (ot.kickOutPasser   - 50) / 100));
    wMap.OFF_SCREEN = Math.max(0, wMap.OFF_SCREEN * (1 + (ot.offScreen       - 50) / 50));
    const entries  = Object.entries(wMap) as [PossessionType, number][];
    const possType = pickWeighted(entries, ([, w]) => w)[0];
    bh._possTypes[possType] = (bh._possTypes[possType] ?? 0) + 1;

    // ── On-ball defensive pressure ─────────────────────────────────────────
    // Selects the matchup defender and computes how much pressure they apply.
    // Strong defenders: +3-7% TOV chance, +3-8% FG% suppression.
    // Hot players attract more defensive attention (double-teams, ball denials).
    let defPressureBoost = 0;
    let contestBoost     = 0;
    let primaryDef: TeamPossState | null = null;
    if (dCourt.length > 0) {
      const hotnessMod = Math.max(1.0, 1 + bh.varRoll / 100 * 0.30);  // hot star draws harder coverage
      primaryDef = pickWeighted(dCourt, s => {
        const dAttr = (s.p.attributes.perimeterDef ?? 50) * 0.45
          + (s.p.attributes.defensiveIQ ?? 50) * 0.35
          + (s.p.attributes.interiorDef ?? 50) * 0.20;
        const posMatch = s.p.position === bh.p.position ? 1.4 : 1.0;
        return Math.max(0.01, dAttr / 100 * posMatch * s.minFrac * hotnessMod);
      });
      const dt         = getDT(primaryDef.p);
      const defQuality = (
        (primaryDef.p.attributes.perimeterDef ?? 50) * 0.40 +
        (primaryDef.p.attributes.defensiveIQ  ?? 50) * 0.40 +
        (dt.onBallPest + dt.denyThePass) / 200 * 100 * 0.20
      ) / 100;
      // Threshold 0.55 = average defender; elite (0.80+) applies 5% TOV + 8% FG suppression.
      defPressureBoost = Math.max(0, (defQuality - 0.55) * 0.20);
      contestBoost     = Math.max(0, (defQuality - 0.50) * 0.18);
    }

    // ── Turnover check ─────────────────────────────────────────────────────
    const toRate = getTurnoverPercentage(
      bh.p.attributes.ballHandling,
      bh.p.attributes.passing,
      bh.p.attributes.offensiveIQ,
      bh.p.position,
      bh.p.attributes.stamina,
      bh.p.personalityTraits,
    ) * (1 + bh.fatigue * 0.15) + defPressureBoost;

    if (Math.random() < toRate) {
      bh.tov++;
      const r = Math.random();
      if (r < 0.50)      bh._tovBadPass++;
      else if (r < 0.78) bh._tovLostBall++;
      else               bh._tovOffFoul++;
      // Steal credit: defender with best deny-the-pass + gambles tendency.
      // Scale 3.5 (was 2.8): more turnovers should be recorded as steals (NBA ~55–65% rate).
      if (dCourt.length > 0) {
        const stealerCand = pickWeighted(dCourt, s => {
          const dt = getDT(s.p);
          return Math.max(0.01, (dt.gambles + dt.denyThePass) / 200 * s.minFrac);
        });
        if (Math.random() < getStealChance(
          stealerCand.p.attributes.steals,
          stealerCand.p.position,
          stealerCand.p.attributes.defensiveIQ,
        ) * 3.5) {
          stealerCand.stl++;
          stealerCand._defEvents++;
        }
      }
      continue;
    }

    // ── Pass-lane steal check ─────────────────────────────────────────────
    // Runs before the shooter receives the ball on all pass-heavy possessions.
    // Scale 1.6: pass-lane steals are harder than live-ball steals but add
    // meaningful volume to reach 6–9 team STL/game target.
    const isPassPlay = possType === 'PNR_ROLL' || possType === 'SPOT_UP'
      || possType === 'CUT' || possType === 'DRIVE_KICK' || possType === 'OFF_SCREEN';
    if (isPassPlay && dCourt.length > 0) {
      const passLaneDef = pickWeighted(dCourt, s => {
        const dt = getDT(s.p);
        return Math.max(0.01,
          (dt.denyThePass + dt.gambles) / 200
          * (s.p.attributes.steals ?? 50) / 100
          * s.minFrac);
      });
      if (Math.random() < getStealChance(
        passLaneDef.p.attributes.steals,
        passLaneDef.p.position,
        passLaneDef.p.attributes.defensiveIQ,
      ) * 1.6) {
        bh.tov++;
        bh._tovBadPass++;
        passLaneDef.stl++;
        passLaneDef._defEvents++;
        continue;
      }
    }

    // ── Shot inner loop: up to 3 attempts via OREB continuation ───────────
    for (let shotN = 0; shotN < 3; shotN++) {
      // ── Shooter selection ───────────────────────────────────────────────
      let shooter = bh;
      if (shotN === 0 && isPassPlay && court.length > 1) {
        const others = court.filter(s => s.p.id !== bh.p.id);
        shooter = pickWeighted(others, s => {
          const ot2  = getOT(s.p);
          const base = Math.pow(s.p.rating / 75, 1.5) * s.minFrac;
          const bonus =
            possType === 'PNR_ROLL'   ? ((s.p.attributes.layups ?? 50) + (s.p.attributes.dunks ?? 50)) / 200 :
            possType === 'SPOT_UP'    ? s.p.attributes.shooting3pt / 100 + (ot2.spotUp    - 50) / 100 :
            possType === 'CUT'        ? (ot2.cutter    - 30) / 70 :
            possType === 'DRIVE_KICK' ? s.p.attributes.shooting3pt / 100 + (ot2.spotUp    - 50) / 100 :
            possType === 'OFF_SCREEN' ? s.p.attributes.shooting3pt / 100 + (ot2.offScreen - 50) / 100 : 1;
          return Math.max(0.01, base * (1 + bonus));
        });
      } else if (shotN > 0) {
        shooter = pickWeighted(court, s => {
          const posW = s.p.position === 'C' ? 0.45 : s.p.position === 'PF' ? 0.30 : 0.08;
          return Math.max(0.01, posW * (s.p.attributes.offReb ?? 50) / 100 * s.minFrac);
        });
      }
      shooter._touches++;

      // ── Shot zone ───────────────────────────────────────────────────────
      let zone: 'inside' | 'mid' | 'three';
      if (['POST_UP', 'PNR_ROLL', 'CUT'].includes(possType) || shotN > 0) {
        zone = 'inside';
      } else if (['SPOT_UP', 'OFF_SCREEN', 'DRIVE_KICK'].includes(possType)) {
        zone = 'three';
      } else if (possType === 'TRANSITION') {
        zone = Math.random() < 0.52 ? 'inside' : Math.random() < 0.50 ? 'three' : 'mid';
      } else {
        const ot2 = getOT(shooter.p);
        const posInsideBase =
          shooter.p.position === 'C'  ? 0.50 : shooter.p.position === 'PF' ? 0.35 :
          shooter.p.position === 'SF' ? 0.22 : shooter.p.position === 'SG' ? 0.16 : 0.12;
        const insideAttrMod = ((shooter.p.attributes.layups + shooter.p.attributes.dunks) / 2 / 100 - 0.70) * 0.30;
        const insideProb = Math.max(0, Math.min(0.75,
          (posInsideBase + insideAttrMod + (ot2.driveToBasket - 50) / 100 * 0.30) * pbMults.insideShareMult));
        const threeProb = Math.max(0, Math.min(0.85,
          (shooter.p.attributes.shooting3pt / 100 * 0.58 + (ot2.pullUpThree - 50) / 100 * 0.40) * pbMults.threePaShareMult));
        const r = Math.random();
        zone = r < insideProb ? 'inside' : r < insideProb + threeProb ? 'three' : 'mid';
      }
      if (zone === 'inside') shooter._shotInside++;
      else if (zone === 'three') shooter._shotThree++;
      else shooter._shotMid++;

      // ── Block check: ALL on-court defenders checked in descending blocks order ─
      // Checking all defenders (instead of picking one) lets teams with multiple
      // shot-blockers reach the 4–6 team BPG target organically.
      // Scale 1.8: calibrated so an elite C (blocks=85, C-pos) averages ~2.2 BPG,
      // a Wemby-tier (blocks=97) averages ~3.2 BPG, and an average roster reaches 4–6 team BPG.
      // Mid-range post-up shots are also contestable by interior defenders.
      let blocked = false;
      if ((zone === 'inside' || (zone === 'mid' && possType === 'POST_UP')) && dCourt.length > 0) {
        const blockCandidates = [...dCourt].sort(
          (a, b) => (b.p.attributes.blocks ?? 0) - (a.p.attributes.blocks ?? 0));
        for (const blocker of blockCandidates) {
          const dt      = getDT(blocker.p);
          const blkProb = getBlockChance(
            blocker.p.attributes.blocks,
            blocker.p.position,
            blocker.p.attributes.defensiveIQ,
          ) * 1.8 * (1 + (dt.helpDefender - 50) / 200);
          if (Math.random() < blkProb) {
            blocked = true;
            blocker.blk++;
            blocker._defEvents++;
            break;
          }
        }
      }

      // ── Defender for FG% contest ─────────────────────────────────────────
      const defPlayer = dCourt.length > 0
        ? pickWeighted(dCourt, s => {
            const dAttr = zone === 'inside'
              ? (s.p.attributes.interiorDef  ?? 50) * 0.6 + (s.p.attributes.defensiveIQ ?? 50) * 0.4
              : (s.p.attributes.perimeterDef ?? 50) * 0.6 + (s.p.attributes.defensiveIQ ?? 50) * 0.4;
            const posMatch = s.p.position === shooter.p.position ? 1.5 : 1.0;
            return Math.max(0.01, dAttr / 100 * posMatch * s.minFrac);
          })
        : null;

      // ── Shot attempt ─────────────────────────────────────────────────────
      shooter.fga++;
      if (zone === 'three') shooter.tpa++;

      if (!blocked) {
        const basePct =
          zone === 'inside' ? getInsideFgPctForPlayer(shooter.p) :
          zone === 'mid'    ? getMidRangePercentage(shooter.p.attributes.shootingMid, shooter.p.position,
                               shooter.p.attributes.offensiveIQ, shooter.p.attributes.ballHandling) :
                              getThreePointPercentage(shooter.p.attributes.shooting3pt);
        // defMod scaled 2.5×: zoneDefMod outputs were calibrated for team-level box scores.
        // At per-player resolution, elite defenders need to suppress FG% by 5–12pp,
        // not the 2–4pp the raw function returns.
        const defMod     = defPlayer ? zoneDefMod(defPlayer.p, zone) * 2.5 : 0;
        const contestMod = -contestBoost;      // on-ball pressure suppression
        const noiseMod   = shooter.varRoll / 100 * 0.35;
        const fatigueMod = -(shooter.fatigue * 0.05);
        const schemeDelta = zone === 'three' ? pbMults.fgPct3Delta
          : zone === 'inside' ? pbMults.fgPctInsDelta : pbMults.fgPctMidDelta;
        const finalPct = Math.max(0.05, Math.min(0.72,
          basePct + defMod + contestMod + noiseMod + fatigueMod + schemeDelta
          + (Math.random() * 0.06 - 0.03)));

        // ── Foul check ────────────────────────────────────────────────────
        // Reduced: coefficient 0.50→0.22, cap 0.36→0.15.
        // Old cap (36%) meant every 3rd shot in the paint drew a foul, inflating
        // star PPG by 10–15pts via FTA. New rate (avg ~11%, elite ~13%) is NBA-realistic.
        // Target: 20–25 team FTA/game on 88–92 FGA.
        // WNBA: fouls still drawn but at 85% rate (slightly less physical contact).
        const drawFoulTend = shooter.p.tendencies?.foulDrawing ?? 50;
        const driveTend    = shooter.p.tendencies?.drive       ?? 50;
        const postTend     = shooter.p.tendencies?.postUp      ?? 50;
        const foulRate = (drawFoulTend / 100 * 0.22)
          + (zone === 'inside' ? Math.max(0, driveTend - 50) / 100 * 0.04 : 0)
          + (possType === 'POST_UP' ? Math.max(0, postTend - 50) / 100 * 0.03 : 0);
        const schemeFtaMult = scheme === 'Grit and Grind' ? 1.18
          : (scheme === 'Pace and Space' || scheme === 'Showtime') ? 1.08 : 1.0;
        const wnbaFoulMod   = isWNBA ? 0.85 : 1.0;
        const foulChance    = Math.min(0.15, foulRate * schemeFtaMult * wnbaFoulMod);

        if (Math.random() < foulChance) {
          const andOne = Math.random() < finalPct;
          if (andOne) {
            shooter.fgm++; shooter.pts += zone === 'three' ? 3 : 2;
            if (zone === 'three') shooter.tpm++;
            shooter.fta++;
            const ftPct = getFreeThrowPercentage(shooter.p.attributes.freeThrow, shooter.p.position);
            if (Math.random() < ftPct) { shooter.ftm++; shooter.pts++; }
            resolveAssist(shooter, bh, court, possType);
          } else {
            const ftCount = zone === 'three' ? 3 : 2;
            shooter.fta += ftCount;
            const ftPct = getFreeThrowPercentage(shooter.p.attributes.freeThrow, shooter.p.position);
            for (let i = 0; i < ftCount; i++) {
              if (Math.random() < ftPct) { shooter.ftm++; shooter.pts++; }
            }
            // Non-shooting fouls: no basket, no assist
          }
          if (defPlayer) { defPlayer.pf++; defPlayer._defEvents++; }
          shooter.fatigue = Math.min(0.45, shooter.fatigue + 0.006);
          break;
        }

        // ── Shot resolution ───────────────────────────────────────────────
        if (Math.random() < finalPct) {
          shooter.fgm++; shooter.pts += zone === 'three' ? 3 : 2;
          if (zone === 'three') shooter.tpm++;
          resolveAssist(shooter, bh, court, possType);
          shooter.fatigue = Math.min(0.45, shooter.fatigue + 0.005);
          break;
        }
      }

      // ── Miss / block → rebound battle ────────────────────────────────────
      shooter.fatigue = Math.min(0.45, shooter.fatigue + 0.004);
      const offOrbScore = court.reduce((sum, s) => {
        const posB = s.p.position === 'C' || s.p.position === 'PF' ? 0.27
          : s.p.position === 'SF' ? 0.23 : 0.19;
        return sum + posB * (s.p.attributes.offReb ?? 50) / 100;
      }, 0);
      const defRebScore = dCourt.reduce((sum, s) => {
        const posB = s.p.position === 'C' || s.p.position === 'PF' ? 0.38
          : s.p.position === 'SF' ? 0.30 : 0.24;
        return sum + posB * (s.p.attributes.defReb ?? 50) / 100;
      }, 0);
      const orbProb = Math.max(0.10, Math.min(0.36,
        offOrbScore / Math.max(0.01, offOrbScore + defRebScore)));

      if (Math.random() < orbProb && shotN < 2) {
        const rebounder = pickWeighted(court, s => {
          const posW = s.p.position === 'C' ? 0.42 : s.p.position === 'PF' ? 0.30 : 0.09;
          return Math.max(0.01, posW * (s.p.attributes.offReb ?? 50) / 100 * s.minFrac);
        });
        rebounder.oreb++;
        rebounder._rebChances++;
      } else {
        if (dCourt.length > 0) {
          const dReb = pickWeighted(dCourt, s => {
            const posW = s.p.position === 'C' ? 0.42 : s.p.position === 'PF' ? 0.30 : 0.09;
            return Math.max(0.01, posW * (s.p.attributes.defReb ?? 50) / 100 * s.minFrac);
          });
          dReb.dreb++;
          dReb._rebChances++;
          dReb._defEvents++;
        }
        break;
      }
    }
  }

  // Background personal fouls: off-ball infractions and moving screens.
  // Smart defenders (high defIQ) commit fewer away-from-ball fouls.
  defActive.forEach(s => {
    const dt = getDT(s.p);
    const diq = s.p.attributes.defensiveIQ ?? 65;
    const bgFoulRate = (dt.physicality + dt.onBallPest) / 200 * 0.08
      - (diq - 50) / 100 * 0.03;
    const bgFouls = Math.round(
      Math.max(0, bgFoulRate) * (s.minFrac * 6) * (0.7 + Math.random() * 0.6));
    s.pf = Math.min(6, s.pf + bgFouls);
  });
}

// ─── Possession-based per-player stat audit (dev console) ────────────────────
function emitPlayerAudit(
  states: TeamPossState[],
  teamName: string,
): void {
  console.groupCollapsed(`[PLAYER AUDIT] ${teamName}`);
  for (const s of states) {
    if (s.min === 0) continue;
    const usage = s.fga > 0 ? (s.fga / Math.max(1, states.reduce((sum, x) => sum + x.fga, 0)) * 100).toFixed(1) : '0';
    const fgPct = s.fga > 0 ? `${((s.fgm / s.fga) * 100).toFixed(0)}%` : '-';
    const topPoss = Object.entries(s._possTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([t, n]) => `${t}:${n}`)
      .join(' ');
    console.log(
      `  ${s.p.name.padEnd(20)} | ${s.min}min | ${s.pts}pts ${s.fgm}/${s.fga}(${fgPct}) ` +
      `3pm:${s.tpm}/${s.tpa} ft:${s.ftm}/${s.fta} | ` +
      `ast:${s.ast} reb:${s.oreb}/${s.dreb} stl:${s.stl} blk:${s.blk} tov:${s.tov} | ` +
      `usage:${usage}% touches:${s._touches} | ` +
      `ins:${s._shotInside} mid:${s._shotMid} 3:${s._shotThree} | ` +
      `asst:${s._assistedMakes}aM ${s._unassistedMakes}unaM | ` +
      `rebChances:${s._rebChances} astCreated:${s._astCreated} | ` +
      `tovCauses: BP:${s._tovBadPass} LB:${s._tovLostBall} OF:${s._tovOffFoul} | ` +
      `defEvents:${s._defEvents} | poss:[${topPoss}]`
    );
  }
  console.groupEnd();
}

// ─── Main simulateGame ────────────────────────────────────────────────────────
export const simulateGame = (
  home: Team,
  away: Team,
  date: number,
  season: number,
  homeB2B = false,
  awayB2B = false,
  rivalryLevel = 'Ice Cold',
  settings?: Pick<LeagueSettings, 'injuryFrequency' | 'homeCourt' | 'b2bFrequency' | 'quarterLength' | 'wnbaStatRealism' | 'upsetFrequency' | 'b2bFatigueEnabled' | 'fatigueImpact'>,
  isPreseason = false,
): GameResult => {
  // ── Settings-driven constants ──────────────────────────────────────────────
  const quarterLength = settings?.quarterLength ?? 12; // minutes per quarter
  const quarterLengthScale = quarterLength / 12;       // possession/minute scaler
  const homeCourtAdv = settings?.homeCourt === false ? 0 : HOME_COURT_ADV;
  const injuryMult: Record<string, number> = { None: 0, Low: 0.5, Medium: 1.0, High: 2.0 };
  const injuryMultiplier = injuryMult[settings?.injuryFrequency ?? 'Medium'] ?? 1.0;
  const b2bMap: Record<string, number> = { None: 1.0, Low: 0.97, Realistic: 0.93, High: 0.90, Brutal: 0.87 };
  const b2bPenalty = b2bMap[settings?.b2bFrequency ?? 'Realistic'] ?? 0.93;
  // b2bFatigueEnabled gates the detailed per-stat B2B penalties (REB, AST, TOV, minutes).
  // fatigueImpact scales magnitude: Low=0.33, Medium=0.67, High=1.0.
  const b2bFatigueEnabled = settings?.b2bFatigueEnabled !== false;
  const fatigueScaleMap: Record<string, number> = { None: 0, Low: 0.33, Medium: 0.67, High: 1.0 };
  const b2bFatigueScale = b2bFatigueEnabled
    ? (fatigueScaleMap[settings?.fatigueImpact ?? 'Medium'] ?? 0.67)
    : 0;
  // How much the rating gap drives the outcome. Lower slope → more upsets.
  // Low=0.40 (dominant favorites), Medium=0.30, Realistic=0.25, High=0.15 (frequent upsets)
  const slopeMap: Record<string, number> = { Low: 0.40, Medium: 0.30, Realistic: 0.25, High: 0.15 };
  const ratingSlope = slopeMap[settings?.upsetFrequency ?? 'Realistic'] ?? 0.25;

  // ── WNBA Mode detection ────────────────────────────────────────────────────
  // Explicit setting takes precedence; otherwise auto-detect from roster gender.
  // When active, scales all outputs to WNBA 2024-26 targets:
  //   PPG ~82, FG% 43.5-47.5%, 3P% 33-38%, FT% 76-82%, APG 18-23, RPG 32-38.
  const combinedRoster = [...home.roster, ...away.roster];
  const isWNBA: boolean = settings?.wnbaStatRealism ??
    combinedRoster.filter(p => p.gender === 'Female').length > combinedRoster.length * 0.5;
  // pppScale: WNBA avg 82 PPG / NBA avg 112 PPG ≈ 0.73. 0.77 is gentler to
  // avoid over-correcting when pace is already slightly lower in WNBA games.
  const pppScale = isWNBA ? 0.77 : 1.0;

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
    // ratingSlope is driven by upsetFrequency setting (0.15–0.40).
    // Lower slope → rating gap matters less → more upsets.
    let ppp = BASE_PPP + (off - def) / 100 * ratingSlope;
    if (isB2B) ppp *= b2bPenalty;
    return ppp + (Math.random() * SCORE_VARIANCE * 2 - SCORE_VARIANCE);
  };
  const homePPP = (calcBasePPP(homeBaseOff, homeDef, homeB2B)
    + getStreakRegression(home) + teamMoraleMod(home)) * pppScale;
  const awayPPP = (calcBasePPP(awayBaseOff, awayDef, awayB2B)
    + getStreakRegression(away) + teamMoraleMod(away)) * pppScale;

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

  // Pre-game favorite identification for upset PBP commentary.
  // Uses net expected rating advantage (home court included) before any randomness.
  const homeNetRating = homeBaseOff - homeDef + homeCourtAdv * 100;
  const awayNetRating = awayBaseOff - awayDef;
  const favoriteIsHome = homeNetRating >= awayNetRating;
  const favoriteTeam   = favoriteIsHome ? home : away;
  const underdogTeam   = favoriteIsHome ? away : home;
  const preGameRatingGap = Math.abs(homeNetRating - awayNetRating);

  const pbp: PlayByPlayEvent[] = [
    { time: '12:00', text: 'Game Tip-off', type: 'info', quarter: 1 },
  ];

  // ── B2B fatigue PBP flavor (injected pre-game and in Q2) ─────────────────
  if (b2bFatigueScale > 0) {
    const b2bEarlyLines = [
      'Legs are heavy after last night\'s game — both teams looking to shake off the fatigue early.',
      'Tired legs showing early — this back-to-back stretch is already showing on the floor.',
      'You can see the fatigue setting in — that second night of a back-to-back is no joke.',
      'The wear of last night\'s game is apparent — crisp execution will be at a premium tonight.',
    ];
    const b2bLateLines = [
      'The back-to-back is catching up — decision-making getting sloppy in the second half.',
      'Fatigue factor in full effect — defense is breaking down at both ends.',
      'These tired legs can\'t keep up the intensity — substitutions going to be key down the stretch.',
    ];
    if (homeB2B) {
      pbp.push({ time: '11:00', text: `${home.name} on a back-to-back — ${b2bEarlyLines[Math.floor(Math.random() * b2bEarlyLines.length)]}`, type: 'info', quarter: 1 });
      if (b2bFatigueScale >= 0.5) {
        pbp.push({ time: '6:30', text: `${home.name} showing fatigue — ${b2bLateLines[Math.floor(Math.random() * b2bLateLines.length)]}`, type: 'info', quarter: 3 });
      }
    }
    if (awayB2B) {
      pbp.push({ time: '10:30', text: `${away.name} on a back-to-back — ${b2bEarlyLines[Math.floor(Math.random() * b2bEarlyLines.length)]}`, type: 'info', quarter: 1 });
      if (b2bFatigueScale >= 0.5) {
        pbp.push({ time: '5:45', text: `${away.name} showing fatigue — ${b2bLateLines[Math.floor(Math.random() * b2bLateLines.length)]}`, type: 'info', quarter: 3 });
      }
    }
  }
  const homeScheme = home.activeScheme ?? 'Balanced';
  const awayScheme = away.activeScheme ?? 'Balanced';
  const homeStreaks = new Map<string, number>();
  const awayStreaks = new Map<string, number>();

  const hasClutchCoach = (t: Team) =>
    !!(t.staff.headCoach?.badges as unknown as string[] | undefined)?.includes?.('Clutch Specialist');

  let garbageTime = false;

  // Coach-dependent garbage time threshold: dev-minded coaches pull starters earlier
  // to protect them and develop the bench; win-now coaches ride starters longer.
  const getGtThreshold = (t: Team) => {
    const dev = t.staff.headCoach?.ratingDevelopment ?? 50;
    return dev >= 72 ? 18 : dev >= 52 ? 22 : 28;
  };
  const homeGtThreshold = getGtThreshold(home);
  const awayGtThreshold = getGtThreshold(away);
  let garbageTimePBPFired = false;

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

    // Leading team's coach decides when to empty the bench.
    // Dev coaches (threshold 18) pull starters at a closer margin; win-now (28) ride them longer.
    const activeGtThreshold = scoreDiff > 0 ? homeGtThreshold : awayGtThreshold;
    garbageTime = q === 4 && absScoreDiff >= activeGtThreshold;

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
      const homeClutch = home.roster.slice(0, 8).reduce((s, p) => s + (p.tendencies?.isolation ?? 50), 0) / rosterSz(home);
      const awayClutch = away.roster.slice(0, 8).reduce((s, p) => s + (p.tendencies?.isolation ?? 50), 0) / rosterSz(away);
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
    // In WNBA mode, scale bounds by pppScale so the soft-clamp doesn't push
    // WNBA scores back up toward NBA levels.
    const hBoundsRaw = getQuarterScoringBounds(homeQPoss, qGamePace);
    const aBoundsRaw = getQuarterScoringBounds(awayQPoss, qGamePace);
    const qLo = Math.round(hBoundsRaw.lo * pppScale);
    const qHi = Math.round(hBoundsRaw.hi * pppScale);
    const aBounds = { lo: Math.round(aBoundsRaw.lo * pppScale), hi: Math.round(aBoundsRaw.hi * pppScale) };

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
    if (garbageTime && !garbageTimePBPFired) {
      garbageTimePBPFired = true;
      const leading  = scoreDiff > 0 ? home : away;
      const trailing = scoreDiff > 0 ? away : home;
      const coachLast = leading.staff.headCoach?.name?.split(' ').at(-1) ?? 'The coach';
      const benchMobLines = [
        `${coachLast} empties the bench — starters take a rest with a ${absScoreDiff}-point lead!`,
        `Bench mob time! ${leading.name} up ${absScoreDiff} — the backups are getting their run.`,
        `${coachLast} goes deep into the rotation. No sense risking the starters with this margin.`,
        `${leading.name} up ${absScoreDiff} — reserves hit the floor! Coach showing confidence in the depth.`,
      ];
      pbp.push({ time: '8:00', text: benchMobLines[Math.floor(Math.random() * benchMobLines.length)], type: 'info', quarter: q });
      pbp.push({ time: '6:30', text: `${trailing.name} starters still grinding, but ${leading.name}'s bench mob is holding the fort.`, type: 'info', quarter: q });
    }
    if (q === 4 && Math.abs(runningHome - runningAway) <= 5) {
      pbp.push({ time: '4:00', text: `We have a BALL GAME! ${Math.abs(runningHome - runningAway) <= 2 ? "Anyone's game with 4 minutes left!" : 'One possession game down the stretch!'}`, type: 'info', quarter: q });
    }

    // Intentional fouling — trailing team hack-a strategy in final 60 seconds of Q4/OT
    if (q >= 4 && !garbageTime) {
      const finalDiff    = runningHome - runningAway;
      const finalDeficit = Math.abs(finalDiff);
      if (finalDeficit >= 1 && finalDeficit <= 8) {
        const trailingTeam4 = finalDiff < 0 ? home : away;
        const leadingTeam4  = finalDiff < 0 ? away : home;
        pbp.push(...generateIntentionalFoulEvents(trailingTeam4, leadingTeam4, finalDeficit, q, isWNBA));
      }
    }

    // Upset drama commentary — fires when the expected underdog is leading late
    if (preGameRatingGap >= 8) {
      const underdogLeadMargin = favoriteIsHome ? runningAway - runningHome : runningHome - runningAway;
      if (q === 2 && underdogLeadMargin >= 5) {
        pbp.push({ time: '0:01', text: `HUGE UPSET BREWING! ${underdogTeam.name} has the heavily-favored ${favoriteTeam.name} on the ropes at halftime!`, type: 'info', quarter: 2 });
      }
      if (q === 3 && underdogLeadMargin >= 5) {
        const upsetMsgs = [
          `Nobody saw THIS coming — ${underdogTeam.name} is defying the odds tonight!`,
          `Role players stepping up HUGE for ${underdogTeam.name}!`,
          `${underdogTeam.name} playing the game of their lives — one quarter away from a MASSIVE upset!`,
        ];
        pbp.push({ time: '0:01', text: upsetMsgs[Math.floor(Math.random() * upsetMsgs.length)], type: 'info', quarter: 3 });
      }
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

  // ── 7. Player stat distribution via possession-based event engine ────────
  //
  // buildTeamStates: allocate per-player minutes, handle DNPs, roll variance,
  // then create TeamPossState[] ready for runOffenseEngine.
  const buildTeamStates = (team: Team, isHome: boolean, isGT: boolean, teamScoreDiff: number): TeamPossState[] => {
    const roster      = team.roster;
    // Rating rank for star-minutes differentiation
    const sortedByRating = roster
      .map((p, idx) => ({ id: p.id, rating: p.rating, idx }))
      .sort((a, b) => b.rating - a.rating);
    const ratingRank = new Map(sortedByRating.map(({ id }, rank) => [id, rank]));
    const isB2BTeam     = isHome ? homeB2B : awayB2B;
    const isBlowoutWin  = teamScoreDiff >= 15;
    const isCloseGame   = Math.abs(teamScoreDiff) <= 5;

    return roster.map((p, i) => {
      // ── DNP gates ─────────────────────────────────────────────────────────
      if (p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0)) {
        const s = mkTeamPossState(p, 0, 0);
        (s as TeamPossState & { dnp: string }).dnp = 'Injured';
        return s;
      }
      if (p.isSuspended && (p.suspensionGames ?? 0) > 0) {
        const s = mkTeamPossState(p, 0, 0);
        (s as TeamPossState & { dnp: string }).dnp = 'Suspended';
        return s;
      }

      // ── Minute allocation ─────────────────────────────────────────────────
      let mins = 0;
      if (team.rotation && team.rotation.minutes[p.id] !== undefined) {
        const baseMins = Math.round(team.rotation.minutes[p.id] * quarterLengthScale);
        let scriptAdj = 0;
        if (i < 5) {
          if (isBlowoutWin)    scriptAdj = -(3 + Math.floor(Math.random() * 4));
          else if (isCloseGame) scriptAdj = 2 + Math.floor(Math.random() * 3);
        }
        mins = Math.max(0, baseMins + scriptAdj + (Math.round(Math.random() * 6) - 3));
      } else {
        const rank = ratingRank.get(p.id) ?? i;
        if (i < 5) {
          if (isCloseGame)     mins = 36 + Math.floor(Math.random() * 5);
          else if (rank === 0) mins = 35 + Math.floor(Math.random() * 4);
          else if (rank === 1) mins = 32 + Math.floor(Math.random() * 5);
          else if (rank === 2) mins = 29 + Math.floor(Math.random() * 5);
          else                 mins = 26 + Math.floor(Math.random() * 6);
          mins += Math.round(Math.random() * 4) - 2;
        } else if (i < 9) mins = 14 + Math.floor(Math.random() * 10);
        else if (i < 12)  mins = Math.floor(Math.random() * 6);
        mins = Math.max(0, Math.round(mins * quarterLengthScale));
      }
      if (isGT) {
        const isLeading = isHome ? totalHome > totalAway : totalAway > totalHome;
        if (i < 5) {
          mins = Math.max(Math.round(20 * quarterLengthScale), mins - Math.round(10 * quarterLengthScale));
        } else if (i < 9) {
          mins = Math.min(Math.round(30 * quarterLengthScale), mins + Math.round(8 * quarterLengthScale));
        } else if (isLeading) {
          mins = Math.round(6 * quarterLengthScale) + Math.round(Math.random() * 4 * quarterLengthScale);
        }
      }
      if (isB2BTeam && b2bFatigueScale > 0 && !(team.rotation?.minutes[p.id] !== undefined)) {
        const rank = ratingRank.get(p.id) ?? i;
        if (rank <= 1) mins = Math.max(Math.round(28 * quarterLengthScale), mins - Math.round((3 + b2bFatigueScale * 3) * quarterLengthScale));
        else if (rank <= 4 && i < 5) mins = Math.max(Math.round(22 * quarterLengthScale), mins - Math.round((1 + b2bFatigueScale * 2) * quarterLengthScale));
      }
      if (isPreseason) {
        const pAge = p.age ?? 25; const pYrsPro = p.yearsPro ?? 5;
        if ((pAge <= 22 || pYrsPro <= 1) && mins > 0) mins = Math.min(Math.round(42 * quarterLengthScale), mins + Math.round((8 + Math.floor(Math.random() * 6)) * quarterLengthScale));
        else if (pAge >= 30 && i < 5) mins = Math.max(0, mins - Math.round((7 + Math.floor(Math.random() * 5)) * quarterLengthScale));
      }

      // ── Variance roll: hot/cold night encoded into varRoll ────────────────
      // varRoll > 0 = hot night (higher FG%, more usage weight in possession engine)
      // varRoll < 0 = cold night (lower FG%, less usage weight)
      // varRoll magnitude 15+ = explosive (big night), -15 or lower = ice cold
      let varRoll = playerVariance.get(p.id) ?? 0;
      if (!isGT && p.rating >= 78) {
        const starScore  = Math.max(0, Math.min(1, (p.rating - 78) / 19));
        const isoTend    = p.tendencies?.isolation ?? 50;
        const ctxBonus   = (isHome ? 0.02 : 0) + (['Hot', 'Red Hot'].includes(rivalryLevel) ? 0.04 : 0)
          + (isoTend - 50) / 100 * 0.07;
        const bigProb    = Math.max(0, Math.min(isWNBA ? 0.16 : 0.28, 0.07 + starScore * 0.21 + ctxBonus));
        const histProb   = isWNBA ? 0 : Math.max(0, Math.min(0.0015, 0.00005 + starScore * 0.00145));
        const r = Math.random();
        if (r < histProb)              varRoll = 22 + Math.random() * 8;  // historic night
        else if (r < histProb + bigProb) varRoll = 14 + Math.random() * 6; // big night
      }
      if (varRoll < 14) {  // cold night check (only if not already hot)
        const traits = p.personalityTraits ?? [];
        const isStreaky = traits.includes('Streaky');
        const isPro     = traits.includes('Professional');
        const isB2B     = isHome ? homeB2B : awayB2B;
        const moralePenalty = Math.max(0, (50 - (p.morale ?? 75)) / 100 * 0.06);
        const iceColdProb = (isStreaky ? 0.04 : isPro ? 0.01 : 0.02) + (isB2B ? 0.04 : 0) + moralePenalty;
        const coldProb    = (isStreaky ? 0.12 : isPro ? 0.04 : 0.08) + (isB2B ? 0.02 : 0) + moralePenalty;
        const r = Math.random();
        if (r < iceColdProb)            varRoll = -15 - Math.random() * 7;
        else if (r < iceColdProb + coldProb) varRoll = -7 - Math.random() * 7;
      }

      return mkTeamPossState(p, mins, varRoll);
    });
  };

  // Build possession states for both teams
  const homeStates = buildTeamStates(home, true,  garbageTime, totalHome - totalAway);
  const awayStates = buildTeamStates(away, false, garbageTime, totalAway - totalHome);

  // Simulate possessions: each call runs one team's offense against the other's defense.
  // Cross-team defensive stats (stl, blk, dreb) are written directly to the defending states.
  const homePbMults = PLAYBOOK_SHOT_MODS[homeScheme] ?? PLAYBOOK_SHOT_MODS['Balanced'];
  const awayPbMults = PLAYBOOK_SHOT_MODS[awayScheme] ?? PLAYBOOK_SHOT_MODS['Balanced'];
  runOffenseEngine(homeStates, awayStates, totalPoss, homeScheme, homePbMults, isWNBA);
  runOffenseEngine(awayStates, homeStates, totalPoss, awayScheme, awayPbMults, isWNBA);

  // Emit per-player audit to dev console (one group per team, collapsed by default)
  emitPlayerAudit(homeStates, home.name);
  emitPlayerAudit(awayStates, away.name);

  // Convert TeamPossState[] → GamePlayerLine[] for all downstream processing
  const statesToLines = (states: TeamPossState[]): typeof homePlayerStats =>
    states.map(s => ({
      playerId: s.p.id, name: s.p.name, min: s.min,
      pts: s.pts, reb: s.oreb + s.dreb, offReb: s.oreb, defReb: s.dreb,
      ast: s.ast, stl: s.stl, blk: s.blk,
      fgm: s.fgm, fga: s.fga, threepm: s.tpm, threepa: s.tpa,
      ftm: s.ftm, fta: s.fta, tov: s.tov, pf: s.pf,
      plusMinus: 0, techs: 0, flagrants: 0, ejected: false,
      ...((s as TeamPossState & { dnp?: string }).dnp
        ? { dnp: (s as TeamPossState & { dnp?: string }).dnp } : {}),
    }));

  let homePlayerStats = statesToLines(homeStates);
  let awayPlayerStats = statesToLines(awayStates);

  // ── B2B extra turnovers (+1.2 to +2.5 per team per game) ─────────────────
  // Distributed to top-minute active players; runs BEFORE the TOV clamp so the
  // elevated ceiling on B2B nights is reflected in the final clamp pass.
  if (b2bFatigueScale > 0) {
    const addB2BTovs = (lines: typeof homePlayerStats, extraTov: number) => {
      let remaining = extraTov;
      const ranked = lines
        .map((p, idx) => ({ idx, min: p.min ?? 0 }))
        .filter(x => x.min > 0 && !lines[x.idx].dnp)
        .sort((a, b) => b.min - a.min);
      for (const { idx } of ranked) {
        if (remaining <= 0) break;
        lines[idx] = { ...lines[idx], tov: (lines[idx].tov ?? 0) + 1 };
        remaining--;
      }
      return lines;
    };
    if (homeB2B) {
      const extra = Math.round(1.2 + b2bFatigueScale * 1.3);
      homePlayerStats = addB2BTovs([...homePlayerStats], extra);
    }
    if (awayB2B) {
      const extra = Math.round(1.2 + b2bFatigueScale * 1.3);
      awayPlayerStats = addB2BTovs([...awayPlayerStats], extra);
    }
  }

  totalHome = homePlayerStats.reduce((s, p) => s + p.pts, 0);
  totalAway = awayPlayerStats.reduce((s, p) => s + p.pts, 0);

  // ── Hot-Night PBP: God Mode flavor text for explosive scoring performances ───
  // WNBA thresholds: 35+ legendary, 28+ explosive, 22+ impressive (vs NBA 50/40/30).
  const injectHotNightPBP = (stats: typeof homePlayerStats, teamRef: Team) => {
    const lastName = (name: string) => name.split(' ').at(-1) ?? name;
    const rndTime  = () => `${Math.floor(Math.random() * 9) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
    const hotFloor   = isWNBA ? 22 : 30;
    const bigTier    = isWNBA ? 28 : 40;
    const epicTier   = isWNBA ? 35 : 50;
    for (const line of stats) {
      if (line.dnp || line.pts < hotFloor) continue;
      const player = teamRef.roster.find(pl => pl.id === line.playerId);
      if (!player) continue;
      const n   = lastName(player.name);
      const q34 = Math.floor(Math.random() * 2) + 3;
      if (line.pts >= epicTier) {
        pbp.push({ time: rndTime(), text: `LEGENDARY NIGHT — ${n} has ${line.pts} POINTS! The crowd will be talking about this one for years!`, type: 'score' as const, quarter: 4 });
        pbp.push({ time: '2:00',    text: `${n} puts on an all-time CLINIC — ${line.fgm}/${line.fga} FG, ${line.ftm}/${line.fta} FT. Absolutely electric.`, type: 'score' as const, quarter: 4 });
      } else if (line.pts >= bigTier) {
        pbp.push({ time: rndTime(), text: `${n} EXPLODES for ${line.pts} — one of the best individual scoring nights of the season!`, type: 'score' as const, quarter: q34 });
      } else {
        pbp.push({ time: rndTime(), text: `${n} is TAKING OVER — ${line.pts} points and the defense has no answer!`, type: 'score' as const, quarter: q34 });
      }
      // God Mode scoring run sub-events
      const threeBombThresh = isWNBA ? 5 : 7;
      const threeHotThresh  = isWNBA ? 4 : 5;
      if (line.threepm >= threeBombThresh) {
        pbp.push({ time: rndTime(), text: `${n} AGAIN from three — ${line.threepm} bombs tonight! Someone call the fire department!`, type: 'score' as const, quarter: q34 });
      } else if (line.threepm >= threeHotThresh) {
        pbp.push({ time: rndTime(), text: `${n} drains another three — ${line.threepm} from downtown. UNCONSCIOUS right now!`, type: 'score' as const, quarter: 3 });
      }
      if (line.pts >= bigTier && line.fgm >= (isWNBA ? 10 : 14)) {
        pbp.push({ time: '3:30', text: `${n} going on a SCORING RUN — ${line.fgm}-${line.fga} from the field tonight. Where do you even guard her?`, type: 'info' as const, quarter: 4 });
      }
    }
  };
  injectHotNightPBP(homePlayerStats, home);
  injectHotNightPBP(awayPlayerStats, away);

  // ── Cold-Night PBP: flavor text for ice-cold shooting performances ─────────
  const injectColdNightPBP = (stats: typeof homePlayerStats, teamRef: Team) => {
    const lastName = (name: string) => name.split(' ').at(-1) ?? name;
    const rndTime  = () => `${Math.floor(Math.random() * 9) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
    for (const line of stats) {
      if (line.dnp || line.min < 18) continue;
      const player = teamRef.roster.find(pl => pl.id === line.playerId);
      if (!player) continue;
      const expected = (player.rating / 100) * 30;
      const fgPct = line.fgm / Math.max(1, line.fga);
      const isIceCold = line.fga >= 7 && fgPct < 0.25;
      const isCold    = line.pts <= expected * 0.45 && player.rating >= 70;
      if (!isIceCold && !isCold) continue;
      const n         = lastName(player.name);
      const q         = Math.floor(Math.random() * 2) + 2;
      const fgPctStr  = `${line.fgm}/${line.fga}`;
      if (isIceCold && line.fga >= 10) {
        pbp.push({ time: rndTime(), text: `${n} is ICE COLD tonight — ${fgPctStr} from the field. The shots just aren't falling.`, type: 'info' as const, quarter: q });
        pbp.push({ time: rndTime(), text: `${n} can't find his rhythm — defense is making life difficult every single possession.`, type: 'info' as const, quarter: q });
      } else if (isIceCold) {
        pbp.push({ time: rndTime(), text: `${n} can't buy a bucket tonight — ${fgPctStr} FG. The defense is locking him up completely.`, type: 'info' as const, quarter: q });
      } else {
        pbp.push({ time: rndTime(), text: `${n} is having a quiet night — ${line.pts} points on ${fgPctStr} shooting. Nowhere near his usual form.`, type: 'info' as const, quarter: q });
      }
    }
  };
  injectColdNightPBP(homePlayerStats, home);
  injectColdNightPBP(awayPlayerStats, away);

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
          // First F2 of the season: rare 8% suspension; repeat offenders: 75%, still 1-game max.
          const suspChance = isRepeatOffender ? 0.75 : 0.08;
          if (Math.random() < suspChance) {
            const f2Games = 1; // single-game max; egregious repeat escalation is handled by tech accumulation
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
      // B2B fatigue raises injury risk: base 1.15× scaling up to 1.50× at High fatigue
      if (isB2B)      chance *= (b2bFatigueScale > 0 ? 1.15 + b2bFatigueScale * 0.35 : 1.3);
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

  // ── League Calibration Report (dev console — never affects sim math) ──────
  // Logs per-team stat totals against 2025-26 NBA target ranges after every game.
  // Use these numbers to tune possession engine constants when league averages drift.
  // Targets: PPG 110–118 | FGA 88–92 | 3PA 35–43 | FTA 20–25 | TOV 13–16
  //          OREB 9–12 | DREB 32–36 | AST 24–28 | STL 6–9 | BLK 4–6 | PF 18–23
  (() => {
    const teamStats = (stats: typeof homePlayerStats, pts: number) => {
      const fga    = stats.reduce((s, p) => s + (p.fga    ?? 0), 0);
      const fgm    = stats.reduce((s, p) => s + (p.fgm    ?? 0), 0);
      const tpa    = stats.reduce((s, p) => s + (p.threepa ?? 0), 0);
      const fta    = stats.reduce((s, p) => s + (p.fta    ?? 0), 0);
      const tov    = stats.reduce((s, p) => s + (p.tov    ?? 0), 0);
      const oreb   = stats.reduce((s, p) => s + (p.offReb ?? 0), 0);
      const dreb   = stats.reduce((s, p) => s + (p.defReb ?? 0), 0);
      const ast    = stats.reduce((s, p) => s + (p.ast    ?? 0), 0);
      const stl    = stats.reduce((s, p) => s + (p.stl    ?? 0), 0);
      const blk    = stats.reduce((s, p) => s + (p.blk    ?? 0), 0);
      const pf     = stats.reduce((s, p) => s + (p.pf     ?? 0), 0);
      const fgPct  = fga > 0 ? ((fgm / fga) * 100).toFixed(1) : '-';
      // possession formula: FGA + 0.44*FTA + TOV - OREB
      const poss   = fga + 0.44 * fta + tov - oreb;
      const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi ? '✓' : `✗(${lo}–${hi})`;
      return { pts, fga, tpa, fta, tov, oreb, dreb, ast, stl, blk, pf, fgPct, poss, inRange };
    };
    const h = teamStats(homePlayerStats, totalHome);
    const a = teamStats(awayPlayerStats, totalAway);
    const log = (label: string, hv: number, av: number, lo: number, hi: number) =>
      console.log(`  ${label.padEnd(8)} H:${String(hv).padStart(4)} ${h.inRange(hv,lo,hi)}  A:${String(av).padStart(4)} ${a.inRange(av,lo,hi)}`);
    console.groupCollapsed(
      `[CALIB] ${home.name} ${totalHome}–${totalAway} ${away.name} | pace ${gamePace} | poss H:${h.poss.toFixed(0)} A:${a.poss.toFixed(0)}`
    );
    log('PPG',  totalHome, totalAway, 110, 118);
    log('FGA',  h.fga, a.fga, 88, 92);
    log('3PA',  h.tpa, a.tpa, 35, 43);
    log('FTA',  h.fta, a.fta, 20, 25);
    log('TOV',  h.tov, a.tov, 13, 16);
    log('OREB', h.oreb, a.oreb, 9, 12);
    log('DREB', h.dreb, a.dreb, 32, 36);
    log('AST',  h.ast, a.ast, 24, 28);
    log('STL',  h.stl, a.stl, 6, 9);
    log('BLK',  h.blk, a.blk, 4, 6);
    log('PF',   h.pf, a.pf, 18, 23);
    console.log(`  FG%     H:${h.fgPct}%    A:${a.fgPct}%`);
    console.groupEnd();
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
        const clutchTendency = p?.tendencies?.isolation ?? 50;
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
        let cFtm = 0;
        for (let i = 0; i < cFta; i++) { if (Math.random() < ftPct) cFtm++; }
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

// ─── League Calibration Report ────────────────────────────────────────────────
/**
 * Aggregates box-score stats from a batch of GameResult objects and logs a
 * calibration report to the console. Call this after simulating a week, month,
 * or full season to verify the engine is hitting NBA-realistic targets.
 *
 * Targets (per team per game):
 *   PPG 110–118 | FGA 88–92 | 3PA 35–43 | FTA 20–25 | FG% 46–50%
 *   3P% 35–39%  | TOV 13–16 | AST 24–29 | STL 6–9   | BLK 4–6
 * Individual season leaders:
 *   PPG 28–35   | RPG 12–16 | APG 9–12  | SPG 1.7–2.4 | BPG 2.0–3.5
 */
export function computeLeagueCalibration(
  results: import('../types').GameResult[],
  label = 'BATCH',
): void {
  if (results.length === 0) return;

  // Aggregate per-game team totals (each game contributes two team entries)
  let totalPts = 0, totalFga = 0, totalFgm = 0, totalTpa = 0, totalTpm = 0;
  let totalFta = 0, totalFtm = 0, totalTov = 0, totalAst = 0, totalStl = 0;
  let totalBlk = 0, totalOreb = 0, totalDreb = 0, teamGames = 0;

  // Per-player season accumulators keyed by playerId
  const playerTotals = new Map<string, {
    name: string; gp: number;
    pts: number; reb: number; ast: number; stl: number; blk: number;
  }>();

  const addLine = (line: import('../types').GamePlayerLine) => {
    if (!line.playerId || (line.min ?? 0) === 0) return;
    const existing = playerTotals.get(line.playerId);
    if (existing) {
      existing.gp++;
      existing.pts  += line.pts   ?? 0;
      existing.reb  += line.reb   ?? 0;
      existing.ast  += line.ast   ?? 0;
      existing.stl  += line.stl   ?? 0;
      existing.blk  += line.blk   ?? 0;
    } else {
      playerTotals.set(line.playerId, {
        name: line.name ?? line.playerId,
        gp: 1,
        pts:  line.pts  ?? 0,
        reb:  line.reb  ?? 0,
        ast:  line.ast  ?? 0,
        stl:  line.stl  ?? 0,
        blk:  line.blk  ?? 0,
      });
    }
  };

  for (const r of results) {
    const sumSide = (lines: import('../types').GamePlayerLine[]) => {
      const fga  = lines.reduce((s, p) => s + (p.fga     ?? 0), 0);
      const fgm  = lines.reduce((s, p) => s + (p.fgm     ?? 0), 0);
      const tpa  = lines.reduce((s, p) => s + (p.threepa ?? 0), 0);
      const tpm  = lines.reduce((s, p) => s + (p.threepm ?? 0), 0);
      const fta  = lines.reduce((s, p) => s + (p.fta     ?? 0), 0);
      const ftm  = lines.reduce((s, p) => s + (p.ftm     ?? 0), 0);
      const tov  = lines.reduce((s, p) => s + (p.tov     ?? 0), 0);
      const ast  = lines.reduce((s, p) => s + (p.ast     ?? 0), 0);
      const stl  = lines.reduce((s, p) => s + (p.stl     ?? 0), 0);
      const blk  = lines.reduce((s, p) => s + (p.blk     ?? 0), 0);
      const oreb = lines.reduce((s, p) => s + (p.offReb  ?? 0), 0);
      const dreb = lines.reduce((s, p) => s + (p.defReb  ?? 0), 0);
      const pts  = lines.reduce((s, p) => s + (p.pts     ?? 0), 0);
      return { fga, fgm, tpa, tpm, fta, ftm, tov, ast, stl, blk, oreb, dreb, pts };
    };
    for (const lines of [r.homePlayerStats, r.awayPlayerStats]) {
      const t = sumSide(lines);
      totalPts  += t.pts;  totalFga  += t.fga;  totalFgm  += t.fgm;
      totalTpa  += t.tpa;  totalTpm  += t.tpm;  totalFta  += t.fta;
      totalFtm  += t.ftm;  totalTov  += t.tov;  totalAst  += t.ast;
      totalStl  += t.stl;  totalBlk  += t.blk;
      totalOreb += t.oreb; totalDreb += t.dreb;
      teamGames++;
      lines.forEach(addLine);
    }
  }

  const g = teamGames || 1;
  const avgPpg  = totalPts  / g;
  const avgFga  = totalFga  / g;
  const avgTpa  = totalTpa  / g;
  const avgFta  = totalFta  / g;
  const avgTov  = totalTov  / g;
  const avgAst  = totalAst  / g;
  const avgStl  = totalStl  / g;
  const avgBlk  = totalBlk  / g;
  const fgPct   = totalFga  > 0 ? (totalFgm / totalFga * 100) : 0;
  const threePct = totalTpa > 0 ? (totalTpm / totalTpa * 100) : 0;
  const ftPct   = totalFta  > 0 ? (totalFtm / totalFta * 100) : 0;
  const avgOreb = totalOreb / g;
  const avgDreb = totalDreb / g;

  // Individual season leaders (min 10 games played for a stable average)
  const qualified = [...playerTotals.values()].filter(p => p.gp >= 10);
  const leader = <K extends keyof typeof qualified[0]>(key: K) => {
    if (qualified.length === 0) return { name: '—', avg: 0 };
    const best = qualified.reduce((a, b) =>
      ((b[key] as number) / b.gp) > ((a[key] as number) / a.gp) ? b : a);
    return { name: best.name, avg: (best[key] as number) / best.gp };
  };
  const ppgLead = leader('pts');
  const rpgLead = leader('reb');
  const apgLead = leader('ast');
  const spgLead = leader('stl');
  const bpgLead = leader('blk');

  const inRange = (v: number, lo: number, hi: number) =>
    v >= lo && v <= hi ? '✓' : `✗ (target ${lo}–${hi})`;
  const f1 = (n: number) => n.toFixed(1);
  const f2 = (n: number) => n.toFixed(2);

  console.groupCollapsed(
    `[LEAGUE CALIB] ${label} — ${results.length} games / ${teamGames} team-games`);
  console.log('  ── Team averages per game ──');
  console.log(`  PPG   ${f1(avgPpg)}   ${inRange(avgPpg, 110, 118)}`);
  console.log(`  FGA   ${f1(avgFga)}   ${inRange(avgFga, 88, 92)}`);
  console.log(`  3PA   ${f1(avgTpa)}   ${inRange(avgTpa, 35, 43)}`);
  console.log(`  FTA   ${f1(avgFta)}   ${inRange(avgFta, 20, 25)}`);
  console.log(`  FG%   ${f1(fgPct)}%   ${inRange(fgPct, 46, 50)}`);
  console.log(`  3P%   ${f1(threePct)}%  ${inRange(threePct, 35, 39)}`);
  console.log(`  FT%   ${f1(ftPct)}%`);
  console.log(`  TOV   ${f1(avgTov)}   ${inRange(avgTov, 13, 16)}`);
  console.log(`  AST   ${f1(avgAst)}   ${inRange(avgAst, 24, 29)}`);
  console.log(`  STL   ${f1(avgStl)}   ${inRange(avgStl, 6, 9)}`);
  console.log(`  BLK   ${f1(avgBlk)}   ${inRange(avgBlk, 4, 6)}`);
  console.log(`  OREB  ${f1(avgOreb)}  |  DREB  ${f1(avgDreb)}`);
  console.log('  ── Individual leaders (min 10 GP) ──');
  console.log(`  PPG  ${ppgLead.name.padEnd(22)} ${f1(ppgLead.avg)}  ${inRange(ppgLead.avg, 28, 36)}`);
  console.log(`  RPG  ${rpgLead.name.padEnd(22)} ${f1(rpgLead.avg)}  ${inRange(rpgLead.avg, 12, 16)}`);
  console.log(`  APG  ${apgLead.name.padEnd(22)} ${f1(apgLead.avg)}  ${inRange(apgLead.avg, 9, 12)}`);
  console.log(`  SPG  ${spgLead.name.padEnd(22)} ${f2(spgLead.avg)}  ${inRange(spgLead.avg, 1.7, 2.4)}`);
  console.log(`  BPG  ${bpgLead.name.padEnd(22)} ${f2(bpgLead.avg)}  ${inRange(bpgLead.avg, 2.0, 3.5)}`);
  console.groupEnd();
}

