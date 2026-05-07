import { Team, Position, Player, Conference, Division, MarketSize, PersonalityTrait, PlayerTendencies, ScheduleGame, Prospect, DraftPick, Coach, CoachScheme, CoachBadge, OwnerGoal, Gender, CoachRole, TeamRotation } from './types';
import { computeMensMarketSalary } from './utils/contractRules';

export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export const SCHEMES: CoachScheme[] = ['Balanced', 'Pace and Space', 'Grit and Grind', 'Triangle', 'Small Ball', 'Showtime'];
export const COACH_ROLES: CoachRole[] = ['Head Coach', 'Assistant Offense', 'Assistant Defense', 'Assistant Dev', 'Trainer'];

// ── Staff & Facilities Upgrade System ────────────────────────────────────────
export type StaffType = 'scouting' | 'medical' | 'facilities';

export interface StaffTier {
  /** Budget value stored in team.finances.budgets (20/40/60/80/100) */
  level: number;
  name: string;
  /** One-time cost to upgrade TO this tier */
  upgradeCost: number;
  /** Annual maintenance cost added to team expenses */
  annualCost: number;
  /** Short effect description shown in tooltip */
  effect: string;
}

export const STAFF_CONFIG: Record<StaffType, {
  label: string;
  icon: string;
  tiers: StaffTier[];
}> = {
  scouting: {
    label: 'Scouting Network',
    icon: '🔭',
    tiers: [
      { level: 20, name: 'Bare Minimum', upgradeCost: 0,          annualCost: 500_000,    effect: 'Draft ratings hidden ±15. High bust risk.' },
      { level: 40, name: 'Basic',        upgradeCost: 4_000_000,  annualCost: 2_000_000,  effect: 'Draft ratings ±10. Reduced bust risk.' },
      { level: 60, name: 'Standard',     upgradeCost: 7_000_000,  annualCost: 4_000_000,  effect: 'Draft ratings ±6. Better draft accuracy.' },
      { level: 80, name: 'Advanced',     upgradeCost: 10_000_000, annualCost: 7_000_000,  effect: 'Draft ratings ±3. Low bust risk.' },
      { level: 100, name: 'Elite',       upgradeCost: 15_000_000, annualCost: 10_000_000, effect: 'Draft ratings ±1. Near-perfect prospect evaluation.' },
    ],
  },
  medical: {
    label: 'Medical Staff',
    icon: '🩹',
    tiers: [
      { level: 20, name: 'Bare Minimum', upgradeCost: 0,          annualCost: 1_000_000,  effect: 'No bonus. Standard injury rates.' },
      { level: 40, name: 'Basic',        upgradeCost: 5_000_000,  annualCost: 3_000_000,  effect: '-10% injury chance. +10% recovery speed.' },
      { level: 60, name: 'Standard',     upgradeCost: 8_000_000,  annualCost: 6_000_000,  effect: '-20% injury chance. +20% recovery speed.' },
      { level: 80, name: 'Advanced',     upgradeCost: 12_000_000, annualCost: 10_000_000, effect: '-30% injury chance. +30% recovery speed.' },
      { level: 100, name: 'Elite',       upgradeCost: 18_000_000, annualCost: 15_000_000, effect: '-40% injury chance. +40% recovery. Minor injuries heal instantly.' },
    ],
  },
  facilities: {
    label: 'Facilities',
    icon: '🏋️',
    tiers: [
      { level: 20, name: 'Bare Minimum', upgradeCost: 0,          annualCost: 1_500_000,  effect: 'No bonus. Average morale baseline.' },
      { level: 40, name: 'Basic',        upgradeCost: 6_000_000,  annualCost: 4_000_000,  effect: '+5 morale baseline. +5% development speed.' },
      { level: 60, name: 'Standard',     upgradeCost: 10_000_000, annualCost: 7_000_000,  effect: '+8 morale baseline. +8% development speed.' },
      { level: 80, name: 'Advanced',     upgradeCost: 15_000_000, annualCost: 11_000_000, effect: '+12 morale baseline. +12% dev speed.' },
      { level: 100, name: 'Elite',       upgradeCost: 20_000_000, annualCost: 16_000_000, effect: '+20 morale baseline. +15% dev. Boosts FA interest.' },
    ],
  },
};

/** Get the tier index (0-4) for a given budget value */
export const getStaffTierIndex = (level: number): number =>
  Math.max(0, Math.min(4, Math.round((level - 20) / 20)));

/** Get the tier definition for a given budget value */
export const getStaffTier = (type: StaffType, level: number): StaffTier =>
  STAFF_CONFIG[type].tiers[getStaffTierIndex(level)];

export const PERSONALITY_TRAITS: PersonalityTrait[] = [
  'Leader', 'Diva/Star', 'Loyal', 'Professional', 'Gym Rat', 
  'Lazy', 'Clutch', 'Tough/Alpha', 'Friendly/Team First', 'Money Hungry',
  'Hot Head', 'Workhorse', 'Streaky'
];

export const getRandomTraits = (): PersonalityTrait[] => {
  const count = Math.floor(Math.random() * 3) + 1; // 1 to 3
  return [...PERSONALITY_TRAITS].sort(() => 0.5 - Math.random()).slice(0, count);
};

export const generateTendencies = (pos: Position, traits: PersonalityTrait[]): PlayerTendencies => {
  type Base = PlayerTendencies;
  const baseMap: Record<Position, Base> = {
    PG: { threePoint:75, midRange:62, foulDrawing:65, postUp:20,  layup:68, dunk:45,
          spotUp:60, drive:74, offScreenThree:55, offScreenMidRange:50, cutToBasket:55,
          pass:70, isolation:62, onBallSteal:52, block:28, alleyOop:45,
          shotContest:60, putback:32, pullUpJumper:72, pullUpThree:78, playPassLane:62 },
    SG: { threePoint:85, midRange:72, foulDrawing:63, postUp:35,  layup:62, dunk:58,
          spotUp:85, drive:65, offScreenThree:72, offScreenMidRange:65, cutToBasket:50,
          pass:42, isolation:80, onBallSteal:55, block:32, alleyOop:42,
          shotContest:62, putback:38, pullUpJumper:72, pullUpThree:82, playPassLane:60 },
    SF: { threePoint:70, midRange:70, foulDrawing:65, postUp:50,  layup:62, dunk:60,
          spotUp:70, drive:62, offScreenThree:58, offScreenMidRange:60, cutToBasket:60,
          pass:48, isolation:72, onBallSteal:50, block:45, alleyOop:52,
          shotContest:65, putback:48, pullUpJumper:62, pullUpThree:68, playPassLane:58 },
    PF: { threePoint:35, midRange:55, foulDrawing:62, postUp:70,  layup:55, dunk:68,
          spotUp:42, drive:45, offScreenThree:30, offScreenMidRange:38, cutToBasket:65,
          pass:38, isolation:45, onBallSteal:45, block:68, alleyOop:65,
          shotContest:67, putback:72, pullUpJumper:30, pullUpThree:32, playPassLane:55 },
    C:  { threePoint:15, midRange:40, foulDrawing:62, postUp:85,  layup:55, dunk:78,
          spotUp:27, drive:35, offScreenThree:18, offScreenMidRange:25, cutToBasket:68,
          pass:30, isolation:38, onBallSteal:38, block:82, alleyOop:75,
          shotContest:72, putback:80, pullUpJumper:20, pullUpThree:15, playPassLane:50 },
  };

  const b = baseMap[pos];
  const rand = (base: number) => Math.min(100, Math.max(0, base + Math.floor(Math.random() * 21) - 10));
  const clamp = (v: number) => Math.min(100, Math.max(0, v));

  const t: PlayerTendencies = {
    threePoint:        rand(b.threePoint),
    midRange:          rand(b.midRange),
    foulDrawing:       rand(b.foulDrawing),
    postUp:            rand(b.postUp),
    layup:             rand(b.layup),
    dunk:              rand(b.dunk),
    spotUp:            rand(b.spotUp),
    drive:             rand(b.drive),
    offScreenThree:    rand(b.offScreenThree),
    offScreenMidRange: rand(b.offScreenMidRange),
    cutToBasket:       rand(b.cutToBasket),
    pass:              rand(b.pass),
    isolation:         rand(b.isolation),
    onBallSteal:       rand(b.onBallSteal),
    block:             rand(b.block),
    alleyOop:          rand(b.alleyOop),
    shotContest:       rand(b.shotContest),
    putback:           rand(b.putback),
    pullUpJumper:      rand(b.pullUpJumper),
    pullUpThree:       rand(b.pullUpThree),
    playPassLane:      rand(b.playPassLane),
  };

  // ── Personality trait modifiers ───────────────────────────────────────────
  if (traits.includes('Lazy')) {
    t.isolation    = clamp(t.isolation    + 15);
    t.onBallSteal  = clamp(t.onBallSteal  - 10);
    t.spotUp       = clamp(t.spotUp       - 10);
    t.cutToBasket  = clamp(t.cutToBasket  - 15);
    t.offScreenThree    = clamp(t.offScreenThree    - 10);
    t.offScreenMidRange = clamp(t.offScreenMidRange - 10);
    t.playPassLane = clamp(t.playPassLane - 15);
    t.foulDrawing  = clamp(t.foulDrawing  - 10);
  }
  if (traits.includes('Workhorse')) {
    t.drive        = clamp(t.drive        + 10);
    t.playPassLane = clamp(t.playPassLane + 10);
    t.onBallSteal  = clamp(t.onBallSteal  + 15);
    t.cutToBasket  = clamp(t.cutToBasket  + 10);
    t.foulDrawing  = clamp(t.foulDrawing  +  8);
    t.putback      = clamp(t.putback      +  8);
  }
  if (traits.includes('Leader')) {
    t.pass         = clamp(t.pass         + 20);
    t.isolation    = clamp(t.isolation    - 10);
    t.cutToBasket  = clamp(t.cutToBasket  +  8);
    t.playPassLane = clamp(t.playPassLane + 12);
    t.onBallSteal  = clamp(t.onBallSteal  +  5);
  }
  if (traits.includes('Friendly/Team First')) {
    t.pass         = clamp(t.pass         + 12);
    t.playPassLane = clamp(t.playPassLane + 12);
    t.cutToBasket  = clamp(t.cutToBasket  +  6);
  }
  if (traits.includes('Diva/Star')) {
    t.isolation    = clamp(t.isolation    + 30);
    t.pass         = clamp(t.pass         - 15);
    t.spotUp       = clamp(t.spotUp       - 15);
    t.cutToBasket  = clamp(t.cutToBasket  - 15);
    t.playPassLane = clamp(t.playPassLane - 10);
  }
  if (traits.includes('Tough/Alpha')) {
    t.block        = clamp(t.block        + 15);
    t.onBallSteal  = clamp(t.onBallSteal  + 10);
    t.foulDrawing  = clamp(t.foulDrawing  +  8);
  }
  if (traits.includes('Hot Head')) {
    t.onBallSteal  = clamp(t.onBallSteal  + 15);
    t.isolation    = clamp(t.isolation    + 20);
    t.shotContest  = clamp(t.shotContest  - 25);
  }
  if (traits.includes('Professional')) {
    t.midRange     = clamp(t.midRange     + 10);
    t.playPassLane = clamp(t.playPassLane + 18);
    t.shotContest  = clamp(t.shotContest  + 20);
    t.onBallSteal  = clamp(t.onBallSteal  +  8);
    t.isolation    = clamp(t.isolation    - 10);
  }
  if (traits.includes('Gym Rat')) {
    t.drive        = clamp(t.drive        + 10);
    t.playPassLane = clamp(t.playPassLane + 10);
    t.onBallSteal  = clamp(t.onBallSteal  + 10);
    t.shotContest  = clamp(t.shotContest  + 10);
    t.cutToBasket  = clamp(t.cutToBasket  +  8);
  }
  if (traits.includes('Streaky')) {
    t.pullUpThree  = clamp(t.pullUpThree  + 12);
    t.midRange     = clamp(t.midRange     +  8);
    t.isolation    = clamp(t.isolation    + 15);
    t.spotUp       = clamp(t.spotUp       + 10);
  }
  if (traits.includes('Clutch')) {
    t.isolation    = clamp(t.isolation    + 15);
    t.pullUpJumper = clamp(t.pullUpJumper + 10);
    t.pullUpThree  = clamp(t.pullUpThree  + 10);
  }
  if (traits.includes('Money Hungry')) {
    t.foulDrawing  = clamp(t.foulDrawing  + 12);
    t.isolation    = clamp(t.isolation    + 10);
  }

  return t;
};

export const COACH_BADGES: CoachBadge[] = [
  'Developmental Genius', 'Pace Master', 'Star Handler', 'Defensive Guru', 
  'Offensive Architect', 'Clutch Specialist', 'Recruiting Ace'
];

export type PosAttrRangeKey = 'shooting' | 'playmaking' | 'defense' | 'rebounding' | 'athleticism';
export const POS_ATTR_RANGES: Record<Position, Record<PosAttrRangeKey, [number, number]>> = {
  PG: { shooting: [82, 97], playmaking: [85, 98], defense: [65, 85], rebounding: [55, 75], athleticism: [75, 90] },
  SG: { shooting: [83, 97], playmaking: [70, 85], defense: [65, 85], rebounding: [55, 75], athleticism: [80, 95] },
  SF: { shooting: [75, 93], playmaking: [65, 85], defense: [75, 90], rebounding: [65, 85], athleticism: [85, 98] },
  PF: { shooting: [65, 85], playmaking: [60, 80], defense: [80, 95], rebounding: [85, 98], athleticism: [80, 95] },
  C:  { shooting: [55, 80], playmaking: [50, 75], defense: [85, 98], rebounding: [90, 98], athleticism: [80, 95] },
};

// ── Granular per-attribute hard caps & floors ────────────────────────────────
type AttrBounds = Partial<Record<keyof Player['attributes'], number>>;
export const POSITION_HARD_CAPS: Record<Position, AttrBounds> = {
  PG: { blocks: 55, interiorDef: 58, offReb: 52, defReb: 65, postScoring: 60, strength: 68, freeThrow: 99 },
  SG: { blocks: 62, interiorDef: 65, offReb: 58, defReb: 68, postScoring: 65, strength: 72, freeThrow: 99 },
  SF: { blocks: 75, interiorDef: 78, offReb: 74, defReb: 78, shooting3pt: 92, strength: 80, freeThrow: 96 },
  PF: { shooting3pt: 82, ballHandling: 74, speed: 80, perimeterDef: 78, passing: 75, freeThrow: 88 },
  C:  { shooting3pt: 72, ballHandling: 68, speed: 72, perimeterDef: 70, passing: 68, freeThrow: 79 },
};
export const POSITION_HARD_FLOORS: Record<Position, AttrBounds> = {
  PG: { ballHandling: 78, speed: 80, passing: 75, perimeterDef: 72, shooting3pt: 75, freeThrow: 65 },
  SG: { shooting3pt: 76, speed: 76, perimeterDef: 74, ballHandling: 70, freeThrow: 63 },
  SF: { speed: 60, perimeterDef: 72, athleticism: 76, freeThrow: 52 },
  PF: { strength: 78, interiorDef: 76, offReb: 72, defReb: 75, freeThrow: 44 },
  C:  { strength: 82, interiorDef: 80, offReb: 76, defReb: 78, blocks: 76, postScoring: 76, freeThrow: 36 },
};

// ── Per-attribute generation bias by position ────────────────────────────────
// Applied on top of the regional flavor when generating raw granular attributes.
// Positive = higher baseline; negative = lower. Magnitude tuned to real NBA/WNBA
// stat profiles: FT% especially position-sensitive (C ~68-72%, PG/SG ~80-83%).
// These biases shift the random roll center; POSITION_HARD_CAPS/FLOORS still clamp
// extreme outliers.
export const POS_GRANULAR_BIAS: Record<Position, Partial<Record<string, number>>> = {
  PG: {
    freeThrow: +10, ballHandling: +14, speed: +8, passing: +10, perimeterDef: +6,
    shooting3pt: +4, postScoring: -14, interiorDef: -12, blocks: -14, strength: -10,
    offReb: -10, defReb: -6,
  },
  SG: {
    freeThrow: +8,  ballHandling: +6, speed: +6, perimeterDef: +5, shooting3pt: +6,
    postScoring: -8, interiorDef: -8, blocks: -10, strength: -5,
  },
  SF: {
    freeThrow: 0, speed: +2, athleticism: +4, shooting3pt: +2,
    postScoring: +2, strength: +2,
  },
  PF: {
    freeThrow: -10, strength: +12, interiorDef: +8, postScoring: +10,
    offReb: +10, defReb: +10, blocks: +6,
    ballHandling: -10, speed: -6, perimeterDef: -8, shooting3pt: -8,
  },
  C: {
    freeThrow: -20, strength: +16, interiorDef: +14, blocks: +14, postScoring: +14,
    offReb: +14, defReb: +14,
    ballHandling: -18, speed: -14, perimeterDef: -16, shooting3pt: -18, passing: -10,
  },
};

// ── Position-weighted overall rating formula ─────────────────────────────
export const calcPositionRating = (pos: Position, a: Player['attributes']): number => {
  let r: number;
  switch (pos) {
    case 'PG': r =
      (a.shooting3pt  ?? 50) * 0.12 + (a.ballHandling  ?? 50) * 0.15 +
      (a.passing      ?? 50) * 0.14 + (a.offensiveIQ   ?? 50) * 0.12 +
      (a.speed        ?? 50) * 0.10 + (a.perimeterDef  ?? 50) * 0.10 +
      (a.defensiveIQ  ?? 50) * 0.08 + (a.shootingMid   ?? 50) * 0.08 +
      (a.freeThrow    ?? 50) * 0.06 + (a.stamina       ?? 50) * 0.05;
      break;
    case 'SG': r =
      (a.shooting3pt  ?? 50) * 0.15 + (a.shooting      ?? 50) * 0.13 +
      (a.ballHandling ?? 50) * 0.10 + (a.speed         ?? 50) * 0.10 +
      (a.perimeterDef ?? 50) * 0.10 + (a.offensiveIQ   ?? 50) * 0.10 +
      (a.shootingMid  ?? 50) * 0.09 + (a.passing       ?? 50) * 0.08 +
      (a.freeThrow    ?? 50) * 0.08 + (a.athleticism   ?? 50) * 0.07;
      break;
    case 'SF': r =
      (a.shooting     ?? 50) * 0.12 + (a.athleticism   ?? 50) * 0.12 +
      (a.perimeterDef ?? 50) * 0.11 + (a.interiorDef   ?? 50) * 0.10 +
      (a.shooting3pt  ?? 50) * 0.10 + (a.offensiveIQ   ?? 50) * 0.09 +
      (a.defReb       ?? 50) * 0.09 + (a.speed         ?? 50) * 0.09 +
      (a.passing      ?? 50) * 0.08 + (a.postScoring   ?? 50) * 0.10;
      break;
    case 'PF': r =
      (a.interiorDef  ?? 50) * 0.14 + (a.defReb        ?? 50) * 0.13 +
      (a.offReb       ?? 50) * 0.12 + (a.strength      ?? 50) * 0.11 +
      (a.postScoring  ?? 50) * 0.11 + (a.blocks        ?? 50) * 0.10 +
      (a.offensiveIQ  ?? 50) * 0.09 + (a.athleticism   ?? 50) * 0.09 +
      (a.shooting3pt  ?? 50) * 0.06 + (a.passing       ?? 50) * 0.05;
      break;
    case 'C':  r =
      (a.interiorDef  ?? 50) * 0.16 + (a.strength      ?? 50) * 0.14 +
      (a.defReb       ?? 50) * 0.13 + (a.offReb        ?? 50) * 0.12 +
      (a.blocks       ?? 50) * 0.12 + (a.postScoring   ?? 50) * 0.11 +
      (a.athleticism  ?? 50) * 0.08 + (a.defensiveIQ   ?? 50) * 0.08 +
      (a.freeThrow    ?? 50) * 0.03 + (a.shooting3pt   ?? 50) * 0.03;
      break;
  }
  return Math.round(Math.min(99, Math.max(40, r)));
};

// Parses "6-2" or "7-1" height string → total inches
const parseHeightStr = (h: string): number => {
  const m = h?.match(/^(\d+)-(\d+)$/);
  return m ? parseInt(m[1]) * 12 + parseInt(m[2]) : 0;
};

// ── Secondary Position Assignment ────────────────────────────────────────────
/**
 * Derives realistic secondary positions based on height, attributes, and primary position.
 * Returns 0–2 secondary positions the player can play without a full performance penalty.
 */
export const assignSecondaryPositions = (
  primaryPos: Position,
  attrs: Record<string, number>,
  heightInches: number,
): Position[] => {
  const secondaries: Position[] = [];
  const ballHandling = attrs.ballHandling ?? 50;
  const passing      = attrs.passing      ?? 50;
  const shooting3pt  = attrs.shooting3pt  ?? 50;
  const speed        = attrs.speed        ?? 50;
  const strength     = attrs.strength     ?? 50;
  const shooting     = attrs.shooting     ?? 50;
  const athleticism  = attrs.athleticism  ?? 50;
  const interiorDef  = attrs.interiorDef  ?? 50;

  switch (primaryPos) {
    case 'PG':
      // Combo guard / shoot-first PG → SG
      if (shooting3pt >= 75 && speed >= 76) secondaries.push('SG');
      // Tall PG (6-6+) with athleticism → can also play SF
      if (heightInches >= 78 && athleticism >= 80 && shooting >= 74) secondaries.push('SF');
      break;

    case 'SG':
      // Ball-handler combo → PG
      if (ballHandling >= 74 && passing >= 68) secondaries.push('PG');
      // Long athletic SG (6-5+) → SF
      if (heightInches >= 77 && athleticism >= 80) secondaries.push('SF');
      break;

    case 'SF':
      // Quick, shooting-capable wing → SG
      if (speed >= 74 && shooting >= 76) secondaries.push('SG');
      // Strong, tall SF (6-7+) → PF
      if (strength >= 76 && heightInches >= 79) secondaries.push('PF');
      break;

    case 'PF':
      // Mobile stretch four → SF
      if (speed >= 70 && shooting >= 70) secondaries.push('SF');
      // Interior-anchored PF with size → C
      if (strength >= 80 && interiorDef >= 76) secondaries.push('C');
      break;

    case 'C':
      // Mobile or stretch big → PF
      if (speed >= 65 && shooting >= 60) secondaries.push('PF');
      // Athletic, undersized C (under 7-0) with speed → SF small-ball
      if (speed >= 72 && athleticism >= 80 && shooting >= 65 && heightInches <= 84) secondaries.push('SF');
      break;
  }

  return secondaries;
};

/**
 * Returns all positions a player is eligible to play (primary + secondary).
 * Used by rotation assignment and substitution logic.
 */
export const getEligiblePositions = (player: { position: Position; secondaryPositions?: Position[] }): Position[] =>
  [player.position, ...(player.secondaryPositions ?? [])];

/**
 * Positional distance penalty multiplier (0.88–1.0).
 * A player at a position not in their eligible set takes a ~8% effective-rating hit.
 * A player one tier away from their nearest eligible position takes ~4%.
 */
const POS_DISTANCE: Record<Position, Record<Position, number>> = {
  PG: { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 },
  SG: { SG: 0, PG: 1, SF: 1, PF: 2, C: 3 },
  SF: { SF: 0, SG: 1, PF: 1, PG: 2, C: 2 },
  PF: { PF: 0, SF: 1, C:  1, SG: 2, PG: 3 },
  C:  { C:  0, PF: 1, SF: 2, SG: 3, PG: 4 },
};

export const positionalPenaltyFactor = (
  player: { position: Position; secondaryPositions?: Position[] },
  slotPosition: Position,
): number => {
  const eligible = getEligiblePositions(player);
  if (eligible.includes(slotPosition)) return 1.0;
  // Find smallest distance from any eligible position to the slot
  const minDist = Math.min(...eligible.map(ep => POS_DISTANCE[ep][slotPosition]));
  if (minDist <= 1) return 0.96; // slight stretch, e.g. SG playing PF
  if (minDist <= 2) return 0.92;
  return 0.88;                   // far out of position, e.g. PG at C
};

/**
 * Hard caps applied to female players for physical attributes that are
 * physiologically distinct from the male game.
 * Shooting, IQ, handles, passing, and speed retain full range.
 */
export const FEMALE_ATTR_CAPS: Partial<Record<keyof Player['attributes'], number>> = {
  dunks:    25,   // Griner/Stewart elite tier; most female players 10–18
  jumping:  80,   // Elite at 80, average 60–70
  strength: 82,   // Strong centers at 82, guards/wings 60–75
};

/** Clamp female-specific physical attribute caps onto an attributes object. */
export const applyFemaleAttrCaps = (attrs: Player['attributes']): Player['attributes'] => {
  const a = { ...attrs } as any;
  for (const [key, cap] of Object.entries(FEMALE_ATTR_CAPS)) {
    if (a[key] !== undefined && a[key] > (cap as number)) a[key] = cap as number;
  }
  return a as Player['attributes'];
};

/** Low-level attrs-only bounds pass. Call this from generators and enforcePositionalBounds. */
export const applyAttrBounds = (
  attrs: Player['attributes'],
  pos: Position,
  opts?: { capBonus?: number; heightBonus?: number; stretchBig?: boolean; glassCleaner?: boolean }
): Player['attributes'] => {
  const caps   = POSITION_HARD_CAPS[pos]  ?? {};
  const floors = POSITION_HARD_FLOORS[pos] ?? {};
  const capBonus    = opts?.capBonus    ?? 0;
  const heightBonus = opts?.heightBonus ?? 0;
  // STRETCH BIG badge lifts 3PT cap to 92 for PF/C (override, not additive)
  const stretchBigOverride = opts?.stretchBig ?? false;
  // GLASS CLEANER badge → reb caps +8 for PG/SG
  const glassBonus = (opts?.glassCleaner && (pos === 'PG' || pos === 'SG')) ? 8 : 0;
  const heightBonusKeys = new Set(['blocks', 'offReb', 'defReb', 'rebounding']);
  const rebBonusKeys    = new Set(['offReb', 'defReb', 'rebounding']);
  const a = { ...attrs } as any;
  for (const [key, cap] of Object.entries(caps)) {
    if (a[key] === undefined) continue;
    let adj = (cap as number) + capBonus;
    if (heightBonusKeys.has(key)) adj += heightBonus;
    if (rebBonusKeys.has(key))    adj += glassBonus;
    // STRETCH BIG → 3PT cap hard-set to 92 for PF/C
    if (key === 'shooting3pt' && stretchBigOverride && (pos === 'PF' || pos === 'C')) adj = Math.max(adj, 92);
    if (a[key] > adj) a[key] = adj;
  }
  for (const [key, floor] of Object.entries(floors)) {
    if (a[key] !== undefined && a[key] < (floor as number)) a[key] = floor as number;
  }
  return a as Player['attributes'];
};

/** Full-player wrapper — computes exceptions, delegates to applyAttrBounds, then recalculates rating. */
export const enforcePositionalBounds = (player: Player): Player => {
  const pos = player.position;
  const playerBadges: string[] = (player as any).playerBadges ?? [];
  // UNICORN badge → all caps +8
  const capBonus = playerBadges.includes('Unicorn') ? 8 : 0;
  // 3"+ taller than pos avg → blocks/reb caps +6
  const physGender: 'Male' | 'Female' = player.gender === 'Female' ? 'Female' : 'Male';
  const htData = HEIGHT_WEIGHT[pos]?.[physGender];
  const playerHeightIn = parseHeightStr(player.height ?? '');
  const heightBonus = (htData && playerHeightIn > 0 && playerHeightIn >= htData.avgH + 3) ? 6 : 0;
  // STRETCH BIG badge → 3PT cap 92 for PF/C
  const stretchBig = playerBadges.includes('Stretch Big') ||
    ((pos === 'PF' || pos === 'C') && player.archetype?.toLowerCase().includes('stretch'));
  // GLASS CLEANER badge → reb caps +8 for PG/SG
  const glassCleaner = playerBadges.includes('Glass Cleaner');
  const newAttrs = applyAttrBounds(player.attributes, pos, { capBonus, heightBonus, stretchBig, glassCleaner });
  const cappedAttrs = player.gender === 'Female' ? applyFemaleAttrCaps(newAttrs) : newAttrs;
  const newRating = calcPositionRating(pos, cappedAttrs);
  return { ...player, attributes: cappedAttrs, rating: newRating };
};

/**
 * Derives the 5 composite attributes from their sub-attributes.
 * Call this whenever any sub-attribute changes so composites stay in sync.
 */
export const deriveComposites = (a: Player['attributes']): Player['attributes'] => {
  const clamp = (v: number) => Math.round(Math.min(99, Math.max(25, v)));
  return {
    ...a,
    shooting:    clamp((a.layups ?? 50) * 0.15 + (a.dunks ?? 50) * 0.10 + (a.shootingMid ?? 50) * 0.20 + (a.shooting3pt ?? 50) * 0.30 + (a.freeThrow ?? 50) * 0.25),
    defense:     clamp((a.perimeterDef ?? 50) * 0.25 + (a.interiorDef ?? 50) * 0.25 + (a.steals ?? 50) * 0.15 + (a.blocks ?? 50) * 0.15 + (a.defensiveIQ ?? 50) * 0.20),
    rebounding:  clamp((a.offReb ?? 50) * 0.45 + (a.defReb ?? 50) * 0.45 + (a.strength ?? 50) * 0.10),
    playmaking:  clamp((a.ballHandling ?? 50) * 0.35 + (a.passing ?? 50) * 0.35 + (a.offensiveIQ ?? 50) * 0.30),
    athleticism: clamp((a.speed ?? 50) * 0.30 + (a.strength ?? 50) * 0.25 + (a.jumping ?? 50) * 0.25 + (a.stamina ?? 50) * 0.20),
  };
};

export const COLLEGES_HIGH_MAJOR = [
  "Duke","Kentucky","Kansas","North Carolina","UCLA","Michigan","Michigan State","Arizona",
  "Gonzaga","Villanova","Louisville","Syracuse","Ohio State","Indiana","Connecticut","Florida",
  "Texas","Oregon","Memphis","Georgetown","Notre Dame","Marquette","Creighton","Baylor",
  "Houston","Arkansas","Alabama","Tennessee","Illinois","Iowa","Purdue","Wisconsin",
  "Maryland","Virginia","Wake Forest","Georgia Tech","Pittsburgh","Miami (FL)",
  "LSU","Auburn","Mississippi State","Ole Miss","Oklahoma","Oklahoma State","Texas Tech",
  "West Virginia","TCU","Iowa State","Kansas State",
];

export const COLLEGES_MID_MAJOR = [
  "St. Mary's","Wichita State","Murray State","Belmont","Vermont","Davidson","Butler",
  "Xavier","Dayton","Rhode Island","VCU","Richmond","George Mason","Loyola Chicago",
  "Cleveland State","Northern Iowa","Drake","Valparaiso","UC Santa Barbara","Long Beach State",
  "New Mexico State","Grand Canyon","Stephen F. Austin","Abilene Christian",
  "Furman","Chattanooga","Colgate","Oral Roberts","Morehead State","Iona","Saint Peter's",
];

// International pro leagues by region
const INTL_LEAGUES: Record<string, string[]> = {
  europe_balkans: ["ABA League","Euroleague","EuroCup"],
  europe_west:    ["ACB (Spain)","Betclic Elite (France)","BBL (Germany)","Lega Basket (Italy)","Pro B (France)"],
  europe_baltic:  ["LKL (Lithuania)","LBL (Latvia)","Korvpalliliit (Estonia)"],
  oceania:        ["NBL (Australia)","NBL (New Zealand)"],
  africa:         ["BAL (Basketball Africa League)","Country Pro League"],
  asia:           ["CBA (China)","B.League (Japan)","KBL (South Korea)"],
  latin_america:  ["NBB (Brazil)","Liga Nacional (Argentina)","LNBP (Mexico)"],
  canada:         ["CEBL (Canada)"],
};

// Probability (0–100) that a player from this region attended a US college
const US_COLLEGE_PROB: Record<string, number> = {
  usa:            100,
  canada:          65,
  africa:          35,
  oceania:         20,
  latin_america:   15,
  europe_west:     12,
  europe_balkans:  10,
  europe_baltic:   10,
  asia:             8,
};

const pickCollegeTier = (rating: number): string => {
  const highPct =
    rating >= 88 ? 90 :
    rating >= 83 ? 75 :
    rating >= 78 ? 55 :
    rating >= 74 ? 40 : 20;
  const list = Math.random() * 100 < highPct ? COLLEGES_HIGH_MAJOR : COLLEGES_MID_MAJOR;
  return list[Math.floor(Math.random() * list.length)];
};

const generateCollegeAndLeague = (
  rating: number,
  regionId: string
): { college: string; proLeague?: string } => {
  const usProb = US_COLLEGE_PROB[regionId] ?? 10;
  if (Math.random() * 100 < usProb) {
    // US college or international player who attended US college (pathway 1 & 3)
    return { college: pickCollegeTier(rating) };
  }
  // International – no US college (pathway 2)
  const leagues = INTL_LEAGUES[regionId] ?? ["Country Pro League"];
  return { college: "None", proLeague: leagues[Math.floor(Math.random() * leagues.length)] };
};

// ─── US Male first names: 120+ unique, no current NBA stars ──────────────────
const US_MALE_FIRST = [
  "Jaden","Malik","Marcus","Xavier","Elijah","Isaiah","Kendall","Brennan","Derrick","Terrence",
  "Avery","Tavon","Nolan","Colby","Jamar","Reginald","Deshawn","Trent","Devon","Quincy",
  "Marlon","Kendrick","Rasheed","Caleb","Tyrell","Leroy","Darnell","Cordell","Marques","Rondell",
  "Cortez","Wendell","Lamar","Cedric","Jarrell","Montrell","Kavon","Trevin","Deon","Ashton",
  "Bryson","Collin","Kameron","Jamaal","Devonte","Daylen","Jaxon","Braxton","Kylen","Corbin",
  "Demarco","Tevon","Terrell","Quinton","Damonte","Cory","Bryce","Jakobe","Malachi","Aiden",
  "Declan","Hunter","Gavin","Mason","Ethan","Logan","Tyler","Chase","Cole","Connor",
  "Blake","Owen","Liam","Noah","Grant","Reid","Knox","Preston","Sutton","Porter",
  "Lawson","Briggs","Holden","Grady","Beckett","Bennett","Wade","Pierce","Emmett","Ryder",
  "Colton","Flynn","Rhett","Tanner","Easton","Paxton","Heath","Dalton","Travis","Darion",
  "Rayvon","Keondre","Jabari","Torrence","Dontae","Tyrone","Dequan","Rashad","Marshawn","Kenton",
  "Aldric","Dominique","Darian","Elton","Hakim","Jarvis","Kelvin","Nathaniel","Orlando","Peyton",
  "Rowan","Samir","Tobias","Vance","Waverly","Xander","Zachariah","Corvin","Ledger","Theron"
];

// ─── US Male last names: 220+ diverse American surnames ───────────────────────
const US_MALE_LAST = [
  "Washington","Hayes","Thompson","Williams","Jackson","Robinson","Davis","Johnson","Anderson","Harris",
  "White","Martin","Brown","Taylor","Lee","Clark","Lewis","Walker","Hall","Young",
  "Allen","Wright","King","Scott","Green","Baker","Adams","Nelson","Carter","Morrison",
  "Chambers","Brooks","Edwards","Coleman","Jenkins","Perry","Powell","Long","Patterson","West",
  "Foster","Simmons","Warren","Dixon","Griffin","Harper","Reed","Fleming","Garrett","Bradley",
  "Newman","Blake","Ross","Holmes","Stone","Burns","Kennedy","Rice","Watkins","Mack",
  "Webb","Flynn","Shaw","Hughes","Owens","Fields","Frost","Crawford","Barnes","Nichols",
  "Franklin","Barker","Stanton","Benson","Thornton","Caldwell","Maxwell","Ramsey","Moss","Sims",
  "Norris","Swain","Payne","Vickers","Monroe","Cross","Sterling","Harmon","Mercer","Blackwell",
  "Davenport","Ellison","Frazier","Goodwin","Hayden","Inman","Jefferson","Kelley","Meadows","Newton",
  "Ortiz","Ramsey","Sawyer","Underwood","Valle","Winfield","York","Zimmerman","Prescott","Calloway",
  "Donaldson","Epps","Fordham","Granger","Hinds","Ivory","Jacobsen","Lattimore","Maddox","Ogden",
  "Pruitt","Quinones","Renfro","Salter","Tomlinson","Upshaw","Vanderpool","Whitlock","Yates","Burgess",
  "Calhoun","Dunmore","Fairchild","Gilliam","Holt","Jamison","Kinard","Massey","Oliver","Pittman",
  "Raines","Stafford","Thames","Valentine","Waller","Archer","Boone","Crenshaw","Dunbar","Flagg",
  "Gaines","Holton","Jansen","Kirby","Moorehead","Nettles","Pennington","Thornburg","Ulrich","Weston",
  "Yancy","Zavala","Blount","Cisco","Darnell","Easley","Fuqua","Glover","Hadley","Ingersoll",
  "Jasper","Kincaid","Latimer","Munro","Nance","Oldham","Prater","Rendell","Spires","Tidwell",
  "Unger","Varner","Whitmore","Yarborough","Becton","Colquitt","Elmore","Fortson","Gadsby","Harden",
  "Isom","Joplin","Langford","Minter","Odom","Phelps","Quarles","Sherwood","Trawick","Villanueva",
  "Wooten","Albright","Brackett","Cantrell","Dewey","Edmond","Furlong","Greathouse","Hubbard","Ivery"
];

// ─── Female names: 110+ unique, no current WNBA stars ─────────────────────────
export const NAMES_MALE = {
  first: US_MALE_FIRST,
  last: US_MALE_LAST
};

export const NAMES_FEMALE = {
  first: [
    "Aaliyah","Amara","Destiny","Imani","Jasmine","Kiara","Layla","Monique","Nadia","Simone",
    "Tiana","Unique","Vanessa","Ximena","Yara","Zara","Brianna","Camille","Deja","Essence",
    "Fatima","Gabrielle","Harmony","Isis","Jade","Kezia","Lyric","Mia","Naomi","Olivia",
    "Portia","Reign","Sarai","Trinity","Ursula","Valencia","Whitney","Xena","Yasmin","Zola",
    "Amber","Bianca","Chloe","Danielle","Ebony","Faith","Giselle","Hailey","Imara","Jada",
    "Krystal","Latasha","Melanie","Nicole","Octavia","Peyton","Quiana","Renee","Shanice","Tara",
    "Uma","Vivian","Willow","Xiomara","Yvette","Zelda","Adriana","Bella","Celeste","Diana",
    "Elena","Farida","Gianna","Hana","Ingrid","Jolene","Kaia","Lena","Mara","Nora",
    "Odessa","Paloma","Quinn","Raven","Selena","Tamara","Unika","Vera","Wren","Xochitl",
    "Yolanda","Zuri","Ainsley","Brielle","Cassidy","Delilah","Eden","Fiona","Grace","Harper",
    "Iris","Jordyn","Kendra","Lorena","Madison","Noelle","Opal","Priya","Remi","Sage",
    "Thalia","Unity","Valentina","Waverly","Ximena","Yael","Zoe"
  ],
  last: [
    "Washington","Hayes","Thompson","Williams","Jackson","Robinson","Davis","Johnson","Anderson","Harris",
    "White","Martin","Brown","Taylor","Lee","Clark","Lewis","Walker","Hall","Young",
    "Allen","Wright","King","Scott","Green","Baker","Adams","Nelson","Carter","Morrison",
    "Chambers","Brooks","Edwards","Coleman","Jenkins","Perry","Powell","Long","Patterson","West",
    "Foster","Simmons","Warren","Dixon","Griffin","Harper","Reed","Fleming","Garrett","Bradley",
    "Newman","Blake","Ross","Holmes","Stone","Burns","Kennedy","Rice","Mack","Webb",
    "Flynn","Shaw","Hughes","Owens","Fields","Frost","Crawford","Barnes","Nichols","Franklin",
    "Stanton","Benson","Thornton","Caldwell","Maxwell","Ramsey","Moss","Sterling","Harmon","Mercer",
    "Blackwell","Davenport","Ellison","Frazier","Goodwin","Hayden","Jefferson","Kelley","Meadows","Newton",
    "Ortiz","Sawyer","Underwood","Valle","Winfield","York","Prescott","Calloway","Granger","Hinds",
    "Lattimore","Maddox","Ogden","Pruitt","Renfro","Salter","Tomlinson","Vanderpool","Whitlock","Yates"
  ]
};

const REGIONS = [
  {
    id: 'usa',
    name: 'United States',
    weight: 78,
    origins: [...COLLEGES_HIGH_MAJOR, ...COLLEGES_MID_MAJOR],
    firstNamesMale: US_MALE_FIRST,
    lastNamesMale: US_MALE_LAST,
    hometowns: ["New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Philadelphia, PA", "Phoenix, AZ", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "San Jose, CA"],
    flavor: { athleticism: 2, shooting: 0, passing: 0, iq: 0 }
  },
  {
    id: 'europe_balkans',
    name: 'Balkans',
    weight: 5,
    origins: ["Partizan Belgrade", "Crvena Zvezda", "Mega MIS", "Cedevita Olimpija", "Buducnost VOLI"],
    firstNamesMale: [
      "Branko","Dragan","Goran","Miroslav","Predrag","Radovan","Slobodan","Vojislav","Zoran","Aleksandar",
      "Borivoje","Cvetan","Dalibor","Dusan","Eugen","Gojko","Hristo","Ilija","Jovan","Kosta",
      "Ljupcho","Mirko","Nedeljko","Ognjen","Petar","Rastko","Srdan","Tihomir","Uros","Vladan",
      "Tomislav","Ratko","Miodrag","Nebojsa","Dragutin","Velimir","Cedomir","Blazo","Andrija","Sinisa"
    ],
    lastNamesMale: [
      "Kovacevic","Petrovic","Stojanovic","Nikolic","Djordjevic","Milosevic","Popovic","Ivanovic","Lukic","Markovic",
      "Stankovic","Paunovic","Lazarevic","Zdravkovic","Stevanovic","Todorovič","Vukovic","Radovic","Milovanovic","Rankovic",
      "Cvetkovic","Filipovic","Gavrilovic","Hernandez","Jankovic","Knezevic","Miletic","Ninkovic","Obradovic","Pavlovic",
      "Radulovic","Savic","Tosic","Ugrinovic","Vucic","Zivanovic","Blagojevic","Djokic","Eremic","Gavric"
    ],
    hometowns: ["Belgrade, Serbia", "Ljubljana, Slovenia", "Zagreb, Croatia", "Podgorica, Montenegro", "Novi Sad, Serbia"],
    flavor: { athleticism: -2, shooting: 2, passing: 3, iq: 3 }
  },
  {
    id: 'europe_west',
    name: 'Western Europe',
    weight: 3,
    origins: ["Real Madrid", "FC Barcelona", "ASVEL", "Monaco", "ALBA Berlin", "Bayern Munich", "Virtus Bologna", "Olimpia Milano"],
    firstNamesMale: [
      "Adrien","Baptiste","Clément","Dorian","Edouard","Félix","Gauthier","Henri","Ilian","Julien",
      "Kévin","Laurent","Matthieu","Nicolas","Olivier","Pierrick","Quentin","Romain","Sébastien","Théo",
      "Ugo","Vianney","Wilhelm","Axel","Benedikt","Christoph","Dieter","Ernst","Fabian","Gregor",
      "Hannes","Ingo","Jonas","Klaus","Lennart","Marek","Nils","Oskar","Philipp","Raffael",
      "Sergio","Tomás","Unai","Vicente","Xavier","Yago","Álvaro","Borja","César","Diego"
    ],
    lastNamesMale: [
      "Leblanc","Dupont","Leroy","Moreau","Simon","Laurent","Lefebvre","Roux","David","Bertrand",
      "Morin","Fontaine","Chevalier","Garnier","Faure","Rousseau","Blanc","Guerin","Muller","Henry",
      "Schmitt","Weber","Becker","Hoffmann","Zimmermann","Richter","Lang","Neumann","Braun","Werner",
      "Gonzalez","Rodriguez","Lopez","Martinez","Sanchez","Fernandez","Jimenez","Navarro","Molina","Castillo",
      "Rossi","Ferrari","Russo","Esposito","Romano","Colombo","Ricci","Marino","Greco","Bruno"
    ],
    hometowns: ["Paris, France", "Madrid, Spain", "Berlin, Germany", "Rome, Italy", "Barcelona, Spain", "Lyon, France"],
    flavor: { athleticism: 0, shooting: 2, passing: 2, iq: 2 }
  },
  {
    id: 'europe_baltic',
    name: 'Baltic & Nordic',
    weight: 2,
    origins: ["Žalgiris", "Rytas", "BC Ventspils", "Kalev/Cramo", "Kauno Žalgiris"],
    firstNamesMale: [
      "Mantas","Mindaugas","Rokas","Tadas","Vytautas","Arvydas","Edgaras","Gintaras","Ignas","Justinas",
      "Karolis","Lukas","Marius","Nerijus","Povilas","Rimas","Saulius","Tomas","Valdas","Zygimantas",
      "Andris","Arturs","Davis","Edgars","Kristaps","Klavsons","Martins","Ralfs","Ronalds","Toms",
      "Erik","Mikkel","Rasmus","Søren","Tobias","Andreas","Elias","Henrik","Lars","Magnus"
    ],
    lastNamesMale: [
      "Sabonis","Valančiūnas","Brazdeikis","Kleiza","Butaitis","Gudaitis","Mozgeika","Ulanovas","Venslovas","Zukauskas",
      "Bertans","Berzins","Blūms","Cimmers","Gailitis","Ikstens","Jansons","Krumins","Lasis","Maciulis",
      "Norvik","Ozols","Rozitis","Skele","Timma","Urdze","Valters","Zagars","Kalnietis","Lavrinovic",
      "Andersen","Christoffersen","Eriksen","Halverson","Lindqvist","Magnusson","Nielsen","Petersen","Rasmussen","Sorensen"
    ],
    hometowns: ["Kaunas, Lithuania", "Riga, Latvia", "Tallinn, Estonia", "Vilnius, Lithuania", "Copenhagen, Denmark"],
    flavor: { athleticism: -1, shooting: 3, passing: 2, iq: 3 }
  },
  {
    id: 'oceania',
    name: 'Oceania',
    weight: 3,
    origins: ["Melbourne United", "Sydney Kings", "Perth Wildcats", "New Zealand Breakers", "Tasmania JackJumpers"],
    firstNamesMale: [
      "Lachlan","Callum","Hamish","Angus","Declan","Rory","Kieran","Finn","Ewan","Brodie",
      "Brayden","Cody","Dylan","Ethan","Fletcher","Harrison","Jett","Koby","Levi","Mitch",
      "Nathan","Oliver","Patrick","Quinn","Riley","Sawyer","Taine","Wyatt","Zac","Archie",
      "Cameron","Duncan","Fraser","Grant","Hayden","Isak","Jensen","Kane","Logan","Marco"
    ],
    lastNamesMale: [
      "Andersen","Blackmore","Carmichael","Doherty","Everett","Forbes","Gallagher","Heckenberg","Ingleton","Jarvis",
      "Kickert","Loughton","Mackinnon","Neilson","O'Brien","Pringle","Roberson","Soragna","Thwaites","Uluru",
      "Vickery","Worthington","Yabsley","Zeigler","Bartholomew","Couisineau","Dennison","Eldridge","Farquhar","Gliddon",
      "Hodgson","Illawarra","Jenkinson","Kirkland","Leuer","Mcilroy","Nnaji","Orford","Pakula","Rennie"
    ],
    hometowns: ["Melbourne, Australia", "Sydney, Australia", "Perth, Australia", "Auckland, New Zealand", "Brisbane, Australia"],
    flavor: { athleticism: 3, shooting: 1, passing: 1, iq: 0 }
  },
  {
    id: 'africa',
    name: 'Africa',
    weight: 3,
    origins: ["NBA Academy Africa", "AS Douanes", "Petro de Luanda", "Cape Town Tigers", "Rivers Hoopers"],
    firstNamesMale: [
      "Chimezie","Ekpe","Festus","Goga","Hamidou","Ibou","Jalen","Karim","Landry","Moussa",
      "Ndidi","Obinna","Prosper","Quincy","Remy","Seun","Thon","Uchenna","Valdez","Waris",
      "Xola","Yannick","Zion","Adewale","Bankole","Chisom","Deji","Emeka","Folarin","Gbenga",
      "Hammed","Isiaq","Jide","Kola","Lamin","Modou","Nnamdi","Obi","Pape","Ramzi",
      "Sidy","Toumani","Uche","Vieux","Wemba","Xhemal","Youssouf","Zoumanigui","Adama","Bamba"
    ],
    lastNamesMale: [
      "Nwosu","Diallo","Coulibaly","Traore","Keita","Toure","Kouyate","Camara","Doumbia","Diabate",
      "Badji","Ndiaye","Sene","Mbaye","Diouf","Thiam","Sarr","Cisse","Faye","Gaye",
      "Okonkwo","Eze","Fabian","Nzingha","Osei","Tetteh","Asante","Bonsu","Coffie","Darko",
      "Okafor","Nzikeba","Okeke","Aniekwe","Ideye","Jibrin","Abubakar","Balogun","Chikeluba","Danladi",
      "Ekwueme","Fabunmi","Garba","Haruna","Ilori","Jelani","Kanu","Lawal","Musa","Nduka"
    ],
    hometowns: ["Lagos, Nigeria", "Dakar, Senegal", "Yaoundé, Cameroon", "Johannesburg, South Africa", "Accra, Ghana"],
    flavor: { athleticism: 5, shooting: -2, passing: -2, iq: 0 }
  },
  {
    id: 'asia',
    name: 'Asia',
    weight: 2,
    origins: ["Chiba Jets", "Alvark Tokyo", "Guangdong Tigers", "Beijing Royal Fighters", "Seoul SK Knights"],
    firstNamesMale: [
      "Ryota","Shuhei","Naoki","Takuma","Keijiro","Hiroshi","Kazuki","Takeshi","Daiki","Yuya",
      "Ao","Chang","Fang","Hao","Jiwei","Long","Mingzhe","Peng","Qi","Ruizhe",
      "Sheng","Tianle","Wei","Xiaolong","Yupeng","Zijun","Arvin","Dwane","Eloy","Fil",
      "Gian","Herbie","Ibarra","Jayvee","Kris","Liam","Matteo","Noy","Ogie","Pio",
      "Robi","Santino","Tino","Urie","Val","Wowie","Xian","Yuri","Zeejay","Amos"
    ],
    lastNamesMale: [
      "Nakamura","Yoshida","Tanaka","Suzuki","Inoue","Watanabe","Kobayashi","Kato","Yamamoto","Hayashi",
      "Ito","Shimizu","Yamaguchi","Matsumoto","Ogawa","Hashimoto","Nishimura","Ikeda","Okamoto","Aoki",
      "Chen","Wang","Li","Zhang","Liu","Yang","Huang","Zhao","Wu","Zhu",
      "Santos","Reyes","Cruz","Bautista","Ocampo","Garcia","Dela Cruz","Mendoza","Tolentino","Villanueva",
      "Kim","Park","Lee","Choi","Jung","Ahn","Han","Yoon","Jang","Lim"
    ],
    hometowns: ["Tokyo, Japan", "Beijing, China", "Manila, Philippines", "Seoul, South Korea", "Osaka, Japan"],
    flavor: { athleticism: -1, shooting: 3, passing: 1, iq: 1 }
  },
  {
    id: 'latin_america',
    name: 'Latin America',
    weight: 2,
    origins: ["Flamengo", "Sesi Franca", "Quimsa", "San Lorenzo", "Capitanes de Ciudad de México"],
    firstNamesMale: [
      "Agustín","Bruno","Carlos","Diego","Eduardo","Franco","Germán","Hernán","Ignacio","Julián",
      "Leonardo","Matías","Nicolás","Octavio","Pablo","Rafael","Sebastián","Tomás","Ulises","Vicente",
      "Alonso","Bernardo","Caio","Davi","Enzo","Felipe","Guilherme","Hugo","Ivan","João",
      "Lucas","Marcelo","Nelson","Otávio","Pedro","Renato","Ricardo","Rodrigo","Tiago","Vitor",
      "Alejandro","Benjamín","Claudio","Daniel","Emilio","Fabricio","Gonzalo","Hernan","Isidro","Javier"
    ],
    lastNamesMale: [
      "Silva","Oliveira","Souza","Rodrigues","Ferreira","Alves","Pereira","Lima","Gomes","Costa",
      "Martins","Rocha","Ribeiro","Carvalho","Cavalcanti","Barbosa","Nascimento","Araujo","Andrade","Melo",
      "Gonzalez","Rodriguez","Martinez","Lopez","Garcia","Hernandez","Perez","Sanchez","Ramirez","Torres",
      "Flores","Reyes","Cruz","Morales","Gutierrez","Chavez","Mendoza","Diaz","Vargas","Castillo",
      "Pereyra","Romero","Soria","Benítez","Acosta","Villalba","Esquivel","Monzón","Quiroga","Zalazar"
    ],
    hometowns: ["São Paulo, Brazil", "Buenos Aires, Argentina", "Mexico City, Mexico", "Rio de Janeiro, Brazil", "Montevideo, Uruguay"],
    flavor: { athleticism: 1, shooting: 1, passing: 2, iq: 2 }
  },
  {
    id: 'canada',
    name: 'Canada',
    weight: 2,
    origins: ["Orangeville Prep", "Scarborough Shooting Stars", "Montreal Alliance", "Carleton University", "Niagara River Lions"],
    firstNamesMale: [
      "Brady","Caleb","Dylan","Ethan","Fletcher","Gavin","Hayden","Ian","Jensen","Kieran",
      "Liam","Mason","Nathan","Oliver","Parker","Quinn","Ryder","Sawyer","Tyler","Upton",
      "Vaughn","Wesley","Xander","Yannick","Zach","Aiden","Brendan","Connor","Darian","Easton",
      "Finn","Griffon","Harlow","Idris","Josiah","Keaton","Laurent","Maverick","Nolan","Orion",
      "Prescott","Redding","Spencer","Thatcher","Ulric","Vance","Walker","Xylon","Yarrow","Zane"
    ],
    lastNamesMale: [
      "Tremblay","Gagnon","Bouchard","Côté","Fortin","Gagné","McNeil","Paquette","Lavoie","Belanger",
      "Levesque","Pelletier","Leclerc","Bergeron","Ouellet","Couture","Morin","Lapointe","Charron","Vaillancourt",
      "O'Brien","MacDonald","MacLeod","Campbell","Fraser","McKenzie","Morrison","Henderson","Crawford","MacPherson",
      "Johansson","Lindberg","Gustavsson","Eriksson","Hoglund","Sundqvist","Backstrom","Ekholm","Granlund","Nylander",
      "Beaumont","Castillo","Delacroix","Ellison","Fairweather","Germain","Hendricks","Ismail","Jourdain","Korte"
    ],
    hometowns: ["Toronto, Canada", "Montreal, Canada", "Vancouver, Canada", "Ottawa, Canada", "Hamilton, Canada"],
    flavor: { athleticism: 2, shooting: 2, passing: 1, iq: 1 }
  }
];

export const ALL_HOMETOWNS: string[] = REGIONS.flatMap(r => r.hometowns);

const COACH_FIRST_NAMES_MALE = [
  "Alonzo","Bertrand","Carlton","Desmond","Edmund","Franklin","Gerard","Hector","Irving","Jerome",
  "Kenneth","Lloyd","Melvin","Norman","Oscar","Percival","Reginald","Sherman","Thurston","Virgil",
  "Wendell","Xavier","Yusuf","Zander","Aldous","Boris","Clifton","Darnell","Earl","Floyd"
];
const COACH_FIRST_NAMES_FEMALE = [
  "Ada","Bernadette","Claudette","Dorothea","Eunice","Francesca","Geraldine","Harriet","Inez","Josephine",
  "Kathleen","Lorraine","Madeleine","Nadine","Ophelia","Paulette","Rosalind","Sylvia","Thea","Ursula",
  "Vivienne","Wilhelmina","Xena","Yvonne","Zelda","Arlene","Beatrice","Constance","Delphine","Estelle"
];

export const TEAM_DATA = [
  { city: "New York", name: "Titans", conf: "Eastern", div: "Atlantic", market: "Large", primary: "#F58426", secondary: "#006BB6" },
  { city: "Boston", name: "Founders", conf: "Eastern", div: "Atlantic", market: "Medium", primary: "#007A33", secondary: "#BA9653" },
  { city: "Toronto", name: "Tundra", conf: "Eastern", div: "Atlantic", market: "Large", primary: "#CE1141", secondary: "#000000" },
  { city: "Brooklyn", name: "Bridges", conf: "Eastern", div: "Atlantic", market: "Large", primary: "#000000", secondary: "#FFFFFF" },
  { city: "Philadelphia", name: "Liberty", conf: "Eastern", div: "Atlantic", market: "Medium", primary: "#006BB6", secondary: "#ED174C" },
  { city: "Chicago", name: "Cyclones", conf: "Eastern", div: "Central", market: "Large", primary: "#C8102E", secondary: "#000000" },
  { city: "Milwaukee", name: "Millers", conf: "Eastern", div: "Central", market: "Small", primary: "#00471B", secondary: "#EEE1C6" },
  { city: "Cleveland", name: "Iron", conf: "Eastern", div: "Central", market: "Small", primary: "#860038", secondary: "#FDBB30" },
  { city: "Indiana", name: "Arrows", conf: "Eastern", div: "Central", market: "Small", primary: "#002D62", secondary: "#FDBB30" },
  { city: "Detroit", name: "Dynamos", conf: "Eastern", div: "Central", market: "Medium", primary: "#C8102E", secondary: "#1D42BA" },
  { city: "Miami", name: "Sharks", conf: "Eastern", div: "Southeast", market: "Medium", primary: "#98002E", secondary: "#F9A01B" },
  { city: "Atlanta", name: "Phoenix", conf: "Eastern", div: "Southeast", market: "Medium", primary: "#E03A3E", secondary: "#C1D32F" },
  { city: "Orlando", name: "Oracles", conf: "Eastern", div: "Southeast", market: "Small", primary: "#0077C0", secondary: "#C4CED4" },
  { city: "Washington", name: "Sentinels", conf: "Eastern", div: "Southeast", market: "Medium", primary: "#002B5C", secondary: "#E31837" },
  { city: "Charlotte", name: "Monarchs", conf: "Eastern", div: "Southeast", market: "Small", primary: "#1D1160", secondary: "#00788C" },
  { city: "Denver", name: "Peaks", conf: "Western", div: "Northwest", market: "Small", primary: "#0E2240", secondary: "#FEC524" },
  { city: "Minnesota", name: "Frost", conf: "Western", div: "Northwest", market: "Small", primary: "#0C2340", secondary: "#236192" },
  { city: "Oklahoma City", name: "Bison", conf: "Western", div: "Northwest", market: "Small", primary: "#007AC1", secondary: "#EF3B24" },
  { city: "Portland", name: "Pioneers", conf: "Western", div: "Northwest", market: "Small", primary: "#E03A3E", secondary: "#000000" },
  { city: "Utah", name: "Summit", conf: "Western", div: "Northwest", market: "Small", primary: "#002B5C", secondary: "#F9A01B" },
  { city: "Golden State", name: "Surge", conf: "Western", div: "Pacific", market: "Large", primary: "#1D428A", secondary: "#FFC72C" },
  { city: "Los Angeles", name: "Lights", conf: "Western", div: "Pacific", market: "Large", primary: "#552583", secondary: "#FDB927" },
  { city: "Phoenix", name: "Scorpions", conf: "Western", div: "Pacific", market: "Medium", primary: "#1D1160", secondary: "#E56020" },
  { city: "Sacramento", name: "Gold", conf: "Western", div: "Pacific", market: "Small", primary: "#5A2D81", secondary: "#63727A" },
  { city: "Las Vegas", name: "Aces", conf: "Western", div: "Pacific", market: "Medium", primary: "#C8102E", secondary: "#000000" },
  { city: "Dallas", name: "Wranglers", conf: "Western", div: "Southwest", market: "Medium", primary: "#00538C", secondary: "#002B5E" },
  { city: "Houston", name: "Orbit", conf: "Western", div: "Southwest", market: "Large", primary: "#CE1141", secondary: "#000000" },
  { city: "Memphis", name: "Pharaohs", conf: "Western", div: "Southwest", market: "Small", primary: "#5D76A9", secondary: "#12173F" },
  { city: "New Orleans", name: "Voodoo", conf: "Western", div: "Southwest", market: "Small", primary: "#0C2340", secondary: "#C8102E" },
  { city: "San Antonio", name: "Missions", conf: "Western", div: "Southwest", market: "Small", primary: "#000000", secondary: "#C4CED4" },
];

export const EXPANSION_TEAM_POOL = [
  { city: "Seattle", name: "Storm", conf: "Western", div: "Northwest", market: "Large", primary: "#00471B", secondary: "#FEE123" },
  { city: "Las Vegas", name: "Royals", conf: "Western", div: "Pacific", market: "Medium", primary: "#702963", secondary: "#FFD700" },
  { city: "Vancouver", name: "Orcas", conf: "Western", div: "Pacific", market: "Medium", primary: "#041E42", secondary: "#00843D" },
  { city: "Mexico City", name: "Aztecs", conf: "Western", div: "Southwest", market: "Large", primary: "#006341", secondary: "#CE1126" },
  { city: "St. Louis", name: "Arch", conf: "Eastern", div: "Central", market: "Medium", primary: "#002F6C", secondary: "#BA0C2F" },
  { city: "San Diego", name: "Sails", conf: "Western", div: "Pacific", market: "Medium", primary: "#002D62", secondary: "#FEC524" },
];

export interface ExpansionCityOption {
  city: string;
  state: string;
  country: 'USA' | 'Canada' | 'Mexico';
  marketSize: 'Large' | 'Medium' | 'Small';
  population: number;
  expansionFee: number;
  suggestedName: string;
  suggestedNames: string[];
  primaryColor: string;
  secondaryColor: string;
  conf: 'Eastern' | 'Western';
  div: string;
  highlight?: boolean;
}

export const EXPANSION_CITY_DB: ExpansionCityOption[] = [
  // ── Large markets ──────────────────────────────────────────────────────────
  {
    city: 'Seattle', state: 'WA', country: 'USA', marketSize: 'Large',
    population: 4.0, expansionFee: 130,
    suggestedName: 'SuperSonics', suggestedNames: ['SuperSonics', 'Storm', 'Kraken', 'Emeralds', 'Cascades'],
    primaryColor: '#00471B', secondaryColor: '#FEE123',
    conf: 'Western', div: 'Northwest', highlight: true,
  },
  {
    city: 'Mexico City', state: 'MX', country: 'Mexico', marketSize: 'Large',
    population: 21.6, expansionFee: 150,
    suggestedName: 'Aztecs', suggestedNames: ['Aztecs', 'Dragons', 'Condors', 'Jaguars', 'Toros'],
    primaryColor: '#006341', secondaryColor: '#CE1126',
    conf: 'Western', div: 'Southwest', highlight: true,
  },
  {
    city: 'Montreal', state: 'QC', country: 'Canada', marketSize: 'Large',
    population: 4.2, expansionFee: 120,
    suggestedName: 'Express', suggestedNames: ['Express', 'Royals', 'Nordiques', 'Cavaliers', 'Storm'],
    primaryColor: '#003DA5', secondaryColor: '#E31837',
    conf: 'Eastern', div: 'Atlantic', highlight: true,
  },
  // ── Medium markets ─────────────────────────────────────────────────────────
  {
    city: 'Las Vegas', state: 'NV', country: 'USA', marketSize: 'Medium',
    population: 2.3, expansionFee: 125,
    suggestedName: 'Royals', suggestedNames: ['Royals', 'Aces', 'Neon', 'Scorpions', 'Desert Wolves'],
    primaryColor: '#702963', secondaryColor: '#FFD700',
    conf: 'Western', div: 'Pacific', highlight: true,
  },
  {
    city: 'Vancouver', state: 'BC', country: 'Canada', marketSize: 'Medium',
    population: 2.6, expansionFee: 110,
    suggestedName: 'Grizzlies', suggestedNames: ['Grizzlies', 'Orcas', 'Voyageurs', 'Cascades', 'Ravens'],
    primaryColor: '#041E42', secondaryColor: '#00843D',
    conf: 'Western', div: 'Pacific',
  },
  {
    city: 'Tampa', state: 'FL', country: 'USA', marketSize: 'Medium',
    population: 3.2, expansionFee: 100,
    suggestedName: 'Bay', suggestedNames: ['Bay', 'Lightning', 'Armada', 'Suncoast', 'Tides'],
    primaryColor: '#002868', secondaryColor: '#BF0A30',
    conf: 'Eastern', div: 'Southeast',
  },
  {
    city: 'St. Louis', state: 'MO', country: 'USA', marketSize: 'Medium',
    population: 2.8, expansionFee: 95,
    suggestedName: 'Arch', suggestedNames: ['Arch', 'Blues', 'Pioneers', 'Cardinals', 'Gateway'],
    primaryColor: '#002F6C', secondaryColor: '#BA0C2F',
    conf: 'Eastern', div: 'Central',
  },
  {
    city: 'San Diego', state: 'CA', country: 'USA', marketSize: 'Medium',
    population: 3.3, expansionFee: 105,
    suggestedName: 'Sails', suggestedNames: ['Sails', 'Waves', 'Surf', 'Tides', 'Bay'],
    primaryColor: '#002D62', secondaryColor: '#FEC524',
    conf: 'Western', div: 'Pacific',
  },
  {
    city: 'Pittsburgh', state: 'PA', country: 'USA', marketSize: 'Medium',
    population: 2.4, expansionFee: 90,
    suggestedName: 'Steel', suggestedNames: ['Steel', 'Rivers', 'Forge', 'Iron', 'Bridges'],
    primaryColor: '#FFB612', secondaryColor: '#101820',
    conf: 'Eastern', div: 'Atlantic',
  },
  {
    city: 'Baltimore', state: 'MD', country: 'USA', marketSize: 'Medium',
    population: 2.9, expansionFee: 92,
    suggestedName: 'Ravens', suggestedNames: ['Ravens', 'Crabs', 'Harbor', 'Chesapeake', 'Iron'],
    primaryColor: '#241773', secondaryColor: '#9E7C0C',
    conf: 'Eastern', div: 'Atlantic',
  },
  {
    city: 'Kansas City', state: 'MO', country: 'USA', marketSize: 'Medium',
    population: 2.2, expansionFee: 88,
    suggestedName: 'Stampede', suggestedNames: ['Stampede', 'Chiefs', 'Storm', 'Thunder', 'Royals'],
    primaryColor: '#E31837', secondaryColor: '#FFB81C',
    conf: 'Eastern', div: 'Central',
  },
  {
    city: 'Nashville', state: 'TN', country: 'USA', marketSize: 'Medium',
    population: 2.0, expansionFee: 85,
    suggestedName: 'Sounds', suggestedNames: ['Sounds', 'Predators', 'Rhythm', 'Stars', 'Boots'],
    primaryColor: '#041E42', secondaryColor: '#FFB81C',
    conf: 'Eastern', div: 'Southeast',
  },
  // ── Small markets ──────────────────────────────────────────────────────────
  {
    city: 'Cincinnati', state: 'OH', country: 'USA', marketSize: 'Small',
    population: 1.7, expansionFee: 78,
    suggestedName: 'Bengals', suggestedNames: ['Bengals', 'Reds', 'River City', 'Cyclones', 'Ohio'],
    primaryColor: '#FB4F14', secondaryColor: '#000000',
    conf: 'Eastern', div: 'Central',
  },
  {
    city: 'Raleigh', state: 'NC', country: 'USA', marketSize: 'Small',
    population: 1.4, expansionFee: 75,
    suggestedName: 'Oaks', suggestedNames: ['Oaks', 'Hurricanes', 'Triangle', 'Pines', 'Storm'],
    primaryColor: '#CC0000', secondaryColor: '#000000',
    conf: 'Eastern', div: 'Southeast',
  },
  {
    city: 'Columbus', state: 'OH', country: 'USA', marketSize: 'Small',
    population: 2.1, expansionFee: 80,
    suggestedName: 'Crew', suggestedNames: ['Crew', 'Bucks', 'Ohio Express', 'Blue Jackets', 'Forge'],
    primaryColor: '#002F6C', secondaryColor: '#FFD700',
    conf: 'Eastern', div: 'Central',
  },
  {
    city: 'Louisville', state: 'KY', country: 'USA', marketSize: 'Small',
    population: 1.4, expansionFee: 72,
    suggestedName: 'Cardinals', suggestedNames: ['Cardinals', 'Bats', 'Sluggers', 'Thunder', 'River Kings'],
    primaryColor: '#AD0000', secondaryColor: '#000000',
    conf: 'Eastern', div: 'Southeast',
  },
  {
    city: 'Jacksonville', state: 'FL', country: 'USA', marketSize: 'Small',
    population: 1.6, expansionFee: 74,
    suggestedName: 'Jaguars', suggestedNames: ['Jaguars', 'Armada', 'Tides', 'Surf', 'River Cats'],
    primaryColor: '#006778', secondaryColor: '#9F792C',
    conf: 'Eastern', div: 'Southeast',
  },
  {
    city: 'Buffalo', state: 'NY', country: 'USA', marketSize: 'Small',
    population: 1.2, expansionFee: 70,
    suggestedName: 'Sabres', suggestedNames: ['Sabres', 'Blizzard', 'Bills', 'Thunder', 'Niagara'],
    primaryColor: '#00338D', secondaryColor: '#FCB514',
    conf: 'Eastern', div: 'Atlantic',
  },
];

export const getRandomGender = (ratio: number): Gender => {
  return Math.random() * 100 < ratio ? 'Female' : 'Male';
};

export const generateCoach = (id: string, tier: 'A' | 'B' | 'C' | 'D' = 'C', genderRatio: number = 0, leagueYear?: number): Coach => {
  const gender = getRandomGender(genderRatio);
  const firstNames = gender === 'Male' ? COACH_FIRST_NAMES_MALE : COACH_FIRST_NAMES_FEMALE;
  const lastNames = gender === 'Male' ? NAMES_MALE.last : NAMES_FEMALE.last;
  const cities = ["San Antonio, TX", "Miami, FL", "Oakland, CA", "Chicago, IL", "Philadelphia, PA", "Seattle, WA"];
  
  const baseRating = tier === 'A' ? 88 : tier === 'B' ? 80 : tier === 'C' ? 70 : 60;
  const getRandom = (base: number) => Math.min(99, Math.max(40, base + Math.floor(Math.random() * 15 - 5)));

  const experience = tier === 'A' ? 15 + Math.floor(Math.random() * 15) : tier === 'B' ? 8 + Math.floor(Math.random() * 10) : tier === 'C' ? 3 + Math.floor(Math.random() * 8) : 1;
  const badgesCount = tier === 'A' ? 3 : tier === 'B' ? 2 : tier === 'C' ? 1 : 0;
  const badges = [...COACH_BADGES].sort(() => 0.5 - Math.random()).slice(0, badgesCount);

  const salary = tier === 'A' ? 8000000 : tier === 'B' ? 5000000 : tier === 'C' ? 2000000 : 800000;

  const coachAge = 35 + Math.floor(Math.random() * 40);
  const _coachYear = leagueYear ?? new Date().getFullYear();
  return {
    id,
    name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
    age: coachAge,
    birthYear: _coachYear - coachAge,
    gender,
    role: COACH_ROLES[Math.floor(Math.random() * COACH_ROLES.length)],
    hometown: cities[Math.floor(Math.random() * cities.length)],
    country: 'United States',
    college: pickCollegeTier(60 + Math.floor(Math.random() * 30)),
    experience,
    history: `Served as ${tier === 'A' ? 'lead architect' : 'assistant'} for several championship runs. Known for ${tier === 'A' ? 'elite playcalling' : 'locker room stability'}.`,
    ratingOffense: getRandom(baseRating),
    ratingDefense: getRandom(baseRating),
    ratingDevelopment: getRandom(baseRating),
    ratingMotivation: getRandom(baseRating),
    ratingClutch: getRandom(baseRating),
    ratingRecruiting: getRandom(baseRating),
    potential: Math.min(99, baseRating + Math.floor(Math.random() * 10)),
    scheme: SCHEMES[Math.floor(Math.random() * SCHEMES.length)],
    badges,
    specialization: ['None', 'Shooting', 'Defense', 'Big Men', 'Conditioning'][Math.floor(Math.random() * 5)] as any,
    salary,
    contractYears: Math.floor(Math.random() * 4) + 1,
    desiredContract: {
      years: Math.floor(Math.random() * 3) + 1,
      salary: Math.floor(salary * (0.8 + Math.random() * 0.4))
    },
    interestScore: 30 + Math.floor(Math.random() * 60)
  };
};

/**
 * Derives a coach's preferred playbook from their badges.
 * Badge priority: Offensive Architect + Pace Master → Showtime; Defensive Guru → Grit and Grind;
 * Pace Master alone → Pace and Space; Offensive Architect alone → Pace and Space;
 * Star Handler → Triangle. Falls back to coach.scheme for coaches with no relevant badges.
 */
export const getCoachPreferredScheme = (coach: Coach): CoachScheme => {
  const b = coach.badges ?? [];
  if (b.includes('Offensive Architect') && b.includes('Pace Master')) return 'Showtime';
  if (b.includes('Pace Master'))        return 'Pace and Space';
  if (b.includes('Offensive Architect')) return 'Pace and Space';
  if (b.includes('Defensive Guru'))     return 'Grit and Grind';
  if (b.includes('Star Handler'))       return 'Triangle';
  return coach.scheme; // no playbook-specific badge — use the coach's native scheme
};

export const generateCoachPool = (count: number, genderRatio: number = 10, leagueYear?: number): Coach[] => {
  return Array.from({ length: count }).map((_, i) => {
    const tier = i < 5 ? 'A' : i < 15 ? 'B' : i < 35 ? 'C' : 'D';
    return generateCoach(`coach-fa-${i}`, tier, genderRatio, leagueYear);
  });
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Returns age as of the given league year, derived from a stored birthdate.
 * Use this everywhere instead of reading the static `age` field.
 */
export const ageFromBirthdate = (birthdate: string, leagueYear: number): number => {
  const birthYear = parseInt(birthdate?.split('-')[0] ?? '0', 10);
  return birthYear > 0 ? Math.max(0, leagueYear - birthYear) : 0;
};

/**
 * WNBA draft eligibility age floor.
 * Domestic (U.S.) players must be ≥ 22; international players must be ≥ 20.
 * Respects any user-configured minimum if it is higher.
 *
 * Pass `country` as resolved from `countryFromHometown()`.
 */
export const wnbaAgeFloor = (country: string, userMin: number = 0): number => {
  const baseMin = country === 'United States' ? 22 : 20;
  return Math.max(baseMin, userMin);
};

const randomBirthdate = (age: number, leagueYear: number): string => {
  const birthYear = leagueYear - age - (Math.random() < 0.5 ? 1 : 0);
  const month = Math.floor(Math.random() * 12) + 1;
  const maxDay = month === 2 && birthYear % 4 === 0 ? 29 : DAYS_IN_MONTH[month - 1];
  const day = Math.floor(Math.random() * maxDay) + 1;
  return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// ── Draft History Generation ────────────────────────────────────────
interface DraftContext {
  season: number;
  teamNames: string[];
  usedPicks: Map<number, Set<string>>;
}

const assignUniquePick = (
  round: number,
  idealPick: number,
  draftYear: number,
  usedPicks: Map<number, Set<string>>
): number => {
  if (!usedPicks.has(draftYear)) usedPicks.set(draftYear, new Set());
  const used = usedPicks.get(draftYear)!;
  const minPick = round === 1 ? 1 : 31;
  const maxPick = round === 1 ? 30 : 60;
  idealPick = Math.min(maxPick, Math.max(minPick, idealPick));
  // Forward search from ideal
  for (let p = idealPick; p <= maxPick; p++) {
    const key = `R${round}P${p}`;
    if (!used.has(key)) { used.add(key); return p; }
  }
  // Backward search from ideal
  for (let p = idealPick - 1; p >= minPick; p--) {
    const key = `R${round}P${p}`;
    if (!used.has(key)) { used.add(key); return p; }
  }
  return idealPick; // Fallback (all 30/30 picks exhausted — extremely rare)
};

const generateDraftInfo = (
  rating: number,
  age: number,
  ctx: DraftContext
): Player['draftInfo'] => {
  const { season, teamNames, usedPicks } = ctx;

  // Estimate how many seasons the player has been in the league based on age.
  // Players typically enter the draft at age 19–21.
  const entryAge = 19 + Math.floor(Math.random() * 3);
  const seasonsPlayed = Math.max(0, age - entryAge);

  // Draft year = season they were drafted.
  // A player with 0 seasons played entered the league this year — drafted in the current season.
  const draftYear = seasonsPlayed === 0 ? season : season - seasonsPlayed;

  // Determine draft status — higher-rated players almost always drafted
  const roll = Math.random();
  let isDrafted: boolean;
  let draftRound: number;

  if (rating >= 88) {
    isDrafted = true; draftRound = 1;
  } else if (rating >= 82) {
    isDrafted = true; draftRound = roll < 0.85 ? 1 : 2;
  } else if (rating >= 78) {
    isDrafted = true; draftRound = roll < 0.65 ? 1 : 2;
  } else if (rating >= 74) {
    isDrafted = roll < 0.75; draftRound = roll < 0.35 ? 1 : 2;
  } else if (rating >= 70) {
    isDrafted = roll < 0.50; draftRound = 2;
  } else {
    isDrafted = roll < 0.25; draftRound = 2;
  }

  if (!isDrafted) {
    return { team: "Undrafted", round: 0, pick: 0, year: draftYear };
  }

  // Pick number based on round and rating
  let idealPick: number;
  if (draftRound === 1) {
    if (rating >= 88)      idealPick = 1  + Math.floor(Math.random() * 5);   // 1–5
    else if (rating >= 83) idealPick = 3  + Math.floor(Math.random() * 12);  // 3–14
    else if (rating >= 79) idealPick = 8  + Math.floor(Math.random() * 13);  // 8–20
    else                   idealPick = 15 + Math.floor(Math.random() * 16);   // 15–30
  } else {
    if (rating >= 76)      idealPick = 31 + Math.floor(Math.random() * 15);  // 31–45
    else                   idealPick = 39 + Math.floor(Math.random() * 22);  // 39–60
  }

  const assignedPick = assignUniquePick(draftRound, idealPick, draftYear, usedPicks);
  const draftTeam = teamNames[Math.floor(Math.random() * teamNames.length)];

  return { team: draftTeam, round: draftRound, pick: assignedPick, year: draftYear };
};

export const countryFromHometown = (hometown: string): string => {
  const parts = hometown.split(', ');
  const last = parts[parts.length - 1].trim();
  return /^[A-Z]{2}$/.test(last) ? 'United States' : last;
};

export const COUNTRY_FLAGS: Record<string, string> = {
  'United States': '\u{1F1FA}\u{1F1F8}',
  'Canada': '\u{1F1E8}\u{1F1E6}',
  'Serbia': '\u{1F1F7}\u{1F1F8}',
  'Slovenia': '\u{1F1F8}\u{1F1EE}',
  'Croatia': '\u{1F1ED}\u{1F1F7}',
  'Montenegro': '\u{1F1F2}\u{1F1EA}',
  'Bosnia': '\u{1F1E7}\u{1F1E6}',
  'France': '\u{1F1EB}\u{1F1F7}',
  'Spain': '\u{1F1EA}\u{1F1F8}',
  'Germany': '\u{1F1E9}\u{1F1EA}',
  'Italy': '\u{1F1EE}\u{1F1F9}',
  'Lithuania': '\u{1F1F1}\u{1F1F9}',
  'Latvia': '\u{1F1F1}\u{1F1FB}',
  'Estonia': '\u{1F1EA}\u{1F1EA}',
  'Denmark': '\u{1F1E9}\u{1F1F0}',
  'Sweden': '\u{1F1F8}\u{1F1EA}',
  'Finland': '\u{1F1EB}\u{1F1EE}',
  'Australia': '\u{1F1E6}\u{1F1FA}',
  'New Zealand': '\u{1F1F3}\u{1F1FF}',
  'Nigeria': '\u{1F1F3}\u{1F1EC}',
  'Senegal': '\u{1F1F8}\u{1F1F3}',
  'Cameroon': '\u{1F1E8}\u{1F1F2}',
  'South Africa': '\u{1F1FF}\u{1F1E6}',
  'Ghana': '\u{1F1EC}\u{1F1ED}',
  'Japan': '\u{1F1EF}\u{1F1F5}',
  'China': '\u{1F1E8}\u{1F1F3}',
  'Philippines': '\u{1F1F5}\u{1F1ED}',
  'South Korea': '\u{1F1F0}\u{1F1F7}',
  'Brazil': '\u{1F1E7}\u{1F1F7}',
  'Argentina': '\u{1F1E6}\u{1F1F7}',
  'Mexico': '\u{1F1F2}\u{1F1FD}',
  'Uruguay': '\u{1F1FA}\u{1F1FE}',
  'Colombia': '\u{1F1E8}\u{1F1F4}',
  'Venezuela': '\u{1F1FB}\u{1F1EA}',
  'Greece': '\u{1F1EC}\u{1F1F7}',
  'Turkey': '\u{1F1F9}\u{1F1F7}',
};

export const getFlag = (country?: string): string => {
  if (!country) return '';
  return COUNTRY_FLAGS[country] ?? '';
};

// ── Physical Generation System ──────────────────────────────────────
type PhysRange = { minH: number; maxH: number; avgH: number; minW: number; maxW: number; avgW: number };
const HEIGHT_WEIGHT: Record<string, Record<'Male'|'Female', PhysRange>> = {
  PG: {
    Male:   { minH: 72, maxH: 76, avgH: 74, minW: 175, maxW: 195, avgW: 185 },
    Female: { minH: 65, maxH: 69, avgH: 67, minW: 140, maxW: 160, avgW: 150 },
  },
  SG: {
    Male:   { minH: 75, maxH: 79, avgH: 77, minW: 185, maxW: 210, avgW: 198 },
    Female: { minH: 67, maxH: 71, avgH: 69, minW: 148, maxW: 168, avgW: 158 },
  },
  SF: {
    Male:   { minH: 78, maxH: 81, avgH: 80, minW: 205, maxW: 230, avgW: 218 },
    Female: { minH: 70, maxH: 73, avgH: 72, minW: 160, maxW: 180, avgW: 170 },
  },
  PF: {
    Male:   { minH: 80, maxH: 83, avgH: 82, minW: 220, maxW: 245, avgW: 233 },
    Female: { minH: 72, maxH: 75, avgH: 74, minW: 175, maxW: 200, avgW: 188 },
  },
  C: {
    Male:   { minH: 82, maxH: 86, avgH: 84, minW: 240, maxW: 270, avgW: 255 },
    Female: { minH: 74, maxH: 77, avgH: 76, minW: 190, maxW: 220, avgW: 205 },
  },
};

const inchesToStr = (inches: number): string => {
  const ft  = Math.floor(inches / 12);
  const ins = inches % 12;
  return `${ft}'${ins}"`;
};

const genPhysical = (pos: string, gender: 'Male'|'Female'): {
  heightIn: number; heightStr: string; weight: number;
} => {
  const r = HEIGHT_WEIGHT[pos]?.[gender] ?? HEIGHT_WEIGHT['SF'][gender];
  const heightIn = r.minH + Math.floor(Math.random() * (r.maxH - r.minH + 1));
  const weight   = r.minW + Math.floor(Math.random() * (r.maxW - r.minW + 1));
  return { heightIn, heightStr: inchesToStr(heightIn), weight };
};

// ─── Archetype assignment ─────────────────────────────────────────────────────
type Archetype =
  | 'Hybrid Star' | '3&D Wing' | 'Pure Scorer' | 'Lockdown Defender'
  | 'Stretch Big' | 'Rim Protector' | 'Playmaking Guard' | 'Two-Way Forward'
  | 'Bench Spark' | 'Role Player';

const assignArchetype = (pos: Position, attrs: Record<string, number>, rating: number): Archetype => {
  const sht  = attrs.shooting3pt ?? 50;
  const def  = attrs.defense ?? 50;
  const blk  = attrs.blocks ?? 50;
  const bh   = attrs.ballHandling ?? 50;
  const pass = attrs.passing ?? 50;
  const post = attrs.postScoring ?? 50;
  const ath  = attrs.athleticism ?? 50;
  const pDef = attrs.perimeterDef ?? 50;

  // Build weighted candidate list based on position + attributes
  const w: [Archetype, number][] = [];

  if (pos === 'PG') {
    w.push(['Playmaking Guard', 30 + (bh + pass - 100) * 0.15]);
    w.push(['Pure Scorer',      20 + (attrs.shooting ?? 50) * 0.10]);
    w.push(['Lockdown Defender', 8 + (pDef + def - 100) * 0.08]);
    w.push(['Bench Spark',       8]);
    w.push(['Role Player',       6]);
    w.push(['Hybrid Star',       rating >= 82 ? 15 : 3]);
    w.push(['Two-Way Forward',   5]);
    w.push(['3&D Wing',          8 + sht * 0.06]);
  } else if (pos === 'SG') {
    w.push(['Pure Scorer',      25 + (attrs.shooting ?? 50) * 0.12]);
    w.push(['3&D Wing',         22 + sht * 0.08]);
    w.push(['Playmaking Guard', 12 + (bh + pass - 100) * 0.08]);
    w.push(['Lockdown Defender', 8 + (pDef + def - 100) * 0.08]);
    w.push(['Bench Spark',       8]);
    w.push(['Hybrid Star',       rating >= 82 ? 12 : 3]);
    w.push(['Role Player',       6]);
    w.push(['Two-Way Forward',   9 + (def + ath - 100) * 0.04]);
  } else if (pos === 'SF') {
    w.push(['3&D Wing',          25 + sht * 0.07]);
    w.push(['Two-Way Forward',   20 + (def + ath - 100) * 0.08]);
    w.push(['Pure Scorer',       14 + (attrs.shooting ?? 50) * 0.06]);
    w.push(['Lockdown Defender', 10 + (pDef + def - 100) * 0.08]);
    w.push(['Hybrid Star',       rating >= 82 ? 12 : 3]);
    w.push(['Bench Spark',        6]);
    w.push(['Role Player',        8]);
    w.push(['Stretch Big',        5 + sht * 0.03]);
  } else if (pos === 'PF') {
    w.push(['Stretch Big',       22 + sht * 0.09]);
    w.push(['Two-Way Forward',   18 + (def + ath - 100) * 0.06]);
    w.push(['Rim Protector',     15 + (blk + def - 100) * 0.10]);
    w.push(['Lockdown Defender', 10 + (def - 50) * 0.08]);
    w.push(['Pure Scorer',        8 + post * 0.05]);
    w.push(['Hybrid Star',        rating >= 82 ? 10 : 2]);
    w.push(['Role Player',        8]);
    w.push(['Bench Spark',        5]);
  } else { // C
    w.push(['Rim Protector',     30 + (blk + def - 100) * 0.12]);
    w.push(['Stretch Big',       18 + sht * 0.08]);
    w.push(['Two-Way Forward',   12 + (def + ath - 100) * 0.05]);
    w.push(['Lockdown Defender',  8 + (def - 50) * 0.06]);
    w.push(['Pure Scorer',        6 + post * 0.06]);
    w.push(['Role Player',        10]);
    w.push(['Bench Spark',         6]);
    w.push(['Hybrid Star',        rating >= 82 ? 8 : 2]);
  }

  // Clamp weights to ≥1, compute total, pick
  const clamped = w.map(([a, wt]) => [a, Math.max(1, wt)] as [Archetype, number]);
  const total   = clamped.reduce((s, [, wt]) => s + wt, 0);
  let r2        = Math.random() * total;
  for (const [arch, wt] of clamped) {
    r2 -= wt;
    if (r2 <= 0) return arch;
  }
  return clamped[clamped.length - 1][0];
};

/** Deterministic archetype derivation — picks highest-weight archetype for the given position + attributes.
 *  Pass `isStarterRole = true` when the player is in the starting 5 so "Bench Spark" is never assigned. */
export const deriveArchetype = (pos: Position, attrs: Record<string, number>, rating: number, isStarterRole = false): string => {
  const sht  = attrs.shooting3pt ?? 50;
  const def  = attrs.defense ?? 50;
  const blk  = attrs.blocks ?? 50;
  const bh   = attrs.ballHandling ?? 50;
  const pass = attrs.passing ?? 50;
  const post = attrs.postScoring ?? 50;
  const ath  = attrs.athleticism ?? 50;
  const pDef = attrs.perimeterDef ?? 50;
  const shooting = attrs.shooting ?? 50;

  const w: [string, number][] = [];

  if (pos === 'PG') {
    w.push(['Playmaking Guard', 30 + (bh + pass - 100) * 0.15]);
    w.push(['Pure Scorer',      20 + shooting * 0.10]);
    w.push(['Lockdown Defender', 8 + (pDef + def - 100) * 0.08]);
    w.push(['Bench Spark',       8]);
    w.push(['Role Player',       6]);
    w.push(['Hybrid Star',       rating >= 82 ? 15 : 3]);
    w.push(['Two-Way Forward',   5]);
    w.push(['3&D Wing',          8 + sht * 0.06]);
  } else if (pos === 'SG') {
    w.push(['Pure Scorer',      25 + shooting * 0.12]);
    w.push(['3&D Wing',         22 + sht * 0.08]);
    w.push(['Playmaking Guard', 12 + (bh + pass - 100) * 0.08]);
    w.push(['Lockdown Defender', 8 + (pDef + def - 100) * 0.08]);
    w.push(['Bench Spark',       8]);
    w.push(['Hybrid Star',       rating >= 82 ? 12 : 3]);
    w.push(['Role Player',       6]);
    w.push(['Two-Way Forward',   9 + (def + ath - 100) * 0.04]);
  } else if (pos === 'SF') {
    w.push(['3&D Wing',          25 + sht * 0.07]);
    w.push(['Two-Way Forward',   20 + (def + ath - 100) * 0.08]);
    w.push(['Pure Scorer',       14 + shooting * 0.06]);
    w.push(['Lockdown Defender', 10 + (pDef + def - 100) * 0.08]);
    w.push(['Hybrid Star',       rating >= 82 ? 12 : 3]);
    w.push(['Bench Spark',        6]);
    w.push(['Role Player',        8]);
    w.push(['Stretch Big',        5 + sht * 0.03]);
  } else if (pos === 'PF') {
    w.push(['Stretch Big',       22 + sht * 0.09]);
    w.push(['Two-Way Forward',   18 + (def + ath - 100) * 0.06]);
    w.push(['Rim Protector',     15 + (blk + def - 100) * 0.10]);
    w.push(['Lockdown Defender', 10 + (def - 50) * 0.08]);
    w.push(['Pure Scorer',        8 + post * 0.05]);
    w.push(['Hybrid Star',        rating >= 82 ? 10 : 2]);
    w.push(['Role Player',        8]);
    w.push(['Bench Spark',        5]);
  } else {
    w.push(['Rim Protector',     30 + (blk + def - 100) * 0.12]);
    w.push(['Stretch Big',       18 + sht * 0.08]);
    w.push(['Two-Way Forward',   12 + (def + ath - 100) * 0.05]);
    w.push(['Lockdown Defender',  8 + (def - 50) * 0.06]);
    w.push(['Pure Scorer',        6 + post * 0.06]);
    w.push(['Role Player',        10]);
    w.push(['Bench Spark',         6]);
    w.push(['Hybrid Star',        rating >= 82 ? 8 : 2]);
  }

  // Starters should never receive "Bench Spark" — zero its weight out
  const eligible = isStarterRole ? w.filter(([name]) => name !== 'Bench Spark') : w;
  return eligible.reduce((best, cur) => (cur[1] > best[1] ? cur : best), eligible[0])[0];
};

type AttrMap = Record<string, number>;
const _clamp = (v: number) => Math.min(99, Math.max(25, Math.round(v)));
const _mod   = (base: number, delta: number, cap: number) =>
  _clamp(base + Math.max(-cap, Math.min(cap, delta)));

const applyPhysical = (attrs: AttrMap, pos: string, gender: 'Male'|'Female', heightIn: number, weight: number): AttrMap => {
  const r   = HEIGHT_WEIGHT[pos]?.[gender] ?? HEIGHT_WEIGHT['SF'][gender];
  const hD  = heightIn - r.avgH;
  const wD  = weight   - r.avgW;
  const cap = (Math.abs(hD) >= 2 && Math.abs(wD) >= 20) ? 8 : 99;
  const a   = { ...attrs };
  // Height modifiers
  if (hD >= 2) {           // Taller than avg
    a.interiorDef  = _mod(a.interiorDef,  +4, cap);
    a.blocks       = _mod(a.blocks,        +5, cap);
    a.offReb       = _mod(a.offReb,        +3, cap);
    a.defReb       = _mod(a.defReb,        +3, cap);
    a.perimeterDef = _mod(a.perimeterDef,  -3, cap);
    a.speed        = _mod(a.speed,         -3, cap);
    a.shooting3pt  = _mod(a.shooting3pt,   -4, cap);
  } else if (hD <= -2) {   // Shorter than avg
    a.speed        = _mod(a.speed,         +4, cap);
    a.perimeterDef = _mod(a.perimeterDef,  +3, cap);
    a.ballHandling = _mod(a.ballHandling,  +3, cap);
    a.shooting3pt  = _mod(a.shooting3pt,   +3, cap);
    a.interiorDef  = _mod(a.interiorDef,   -4, cap);
    a.blocks       = _mod(a.blocks,        -5, cap);
    a.offReb       = _mod(a.offReb,        -3, cap);
    a.defReb       = _mod(a.defReb,        -3, cap);
  }
  // Weight modifiers
  if (wD >= 20) {          // Heavier than avg
    a.strength     = _mod(a.strength,      +5, cap);
    a.interiorDef  = _mod(a.interiorDef,   +3, cap);
    a.postScoring  = _mod(a.postScoring,   +4, cap);
    a.speed        = _mod(a.speed,         -4, cap);
    a.stamina      = _mod(a.stamina,       -3, cap);
    a.jumping      = _mod(a.jumping,       -3, cap);
  } else if (wD <= -20) {  // Lighter than avg
    a.speed        = _mod(a.speed,         +3, cap);
    a.stamina      = _mod(a.stamina,       +3, cap);
    a.jumping      = _mod(a.jumping,       +3, cap);
    a.strength     = _mod(a.strength,      -4, cap);
    a.interiorDef  = _mod(a.interiorDef,   -3, cap);
    a.postScoring  = _mod(a.postScoring,   -3, cap);
  }
  return a;
};

/** WNBA-realistic salary for a given player rating and league year. */
const calcWNBASalary = (rating: number, year: number): number => {
  let supermax: number, star: number, starter: number, role: number, bench: number, min: number;
  if (year >= 2026) {
    supermax = 1_400_000; star = 900_000; starter = 550_000; role = 300_000; bench = 150_000; min = 100_000;
  } else if (year >= 2025) {
    supermax = 700_000; star = 440_000; starter = 250_000; role = 130_000; bench = 65_000; min = 45_000;
  } else if (year >= 2020) {
    supermax = 250_000; star = 175_000; starter = 120_000; role = 72_000; bench = 38_000; min = 26_000;
  } else if (year >= 2013) {
    supermax = 110_000; star = 78_000; starter = 52_000; role = 32_000; bench = 18_000; min = 13_000;
  } else if (year >= 2008) {
    supermax = 82_000; star = 58_000; starter = 38_000; role = 22_000; bench = 12_000; min = 9_000;
  } else if (year >= 2003) {
    supermax = 60_000; star = 42_000; starter = 28_000; role = 16_000; bench = 8_500; min = 6_500;
  } else if (year >= 2000) {
    supermax = 45_000; star = 32_000; starter = 20_000; role = 12_000; bench = 6_500; min = 4_500;
  } else {
    supermax = 35_000; star = 24_000; starter = 15_000; role = 9_000; bench = 4_500; min = 3_000;
  }
  const base =
    rating >= 95 ? supermax :
    rating >= 88 ? star    + (rating - 88) * ((supermax - star)    / 7) :
    rating >= 80 ? starter + (rating - 80) * ((star    - starter)  / 8) :
    rating >= 70 ? role    + (rating - 70) * ((starter - role)     / 10) :
    rating >= 60 ? bench   + (rating - 60) * ((role    - bench)    / 10) :
    min;
  const unit = supermax >= 500_000 ? 25_000 : supermax >= 100_000 ? 5_000 : 1_000;
  return Math.round((base * (0.85 + Math.random() * 0.30)) / unit) * unit;
};

/** NBA salary with era-appropriate random variance — used only for setting a player's current contract. */
const calcNBASalary = (rating: number, year: number): number => {
  const market = computeMensMarketSalary(rating, year);
  const unit =
    market >= 10_000_000 ? 250_000 :
    market >=  1_000_000 ?  50_000 :
    market >=    100_000 ?   5_000 :
    market >=     10_000 ?   1_000 : 100;
  return Math.round((market * (0.80 + Math.random() * 0.40)) / unit) * unit;
};

export const generatePlayer = (id: string, ageRange: [number, number] = [19, 38], genderRatio: number = 0, draftCtx?: DraftContext, leagueYear?: number, minRating = 58): Player => {
  const gender = getRandomGender(genderRatio);
  
  // Pick a region based on weights
  const randRegion = Math.random() * 100;
  let cumulative = 0;
  let region = REGIONS[0];
  for (const r of REGIONS) {
    cumulative += r.weight;
    if (randRegion <= cumulative) {
      region = r;
      break;
    }
  }

  const firstNames = gender === 'Male' ? region.firstNamesMale : NAMES_FEMALE.first;
  const lastNames = gender === 'Male' ? region.lastNamesMale : NAMES_FEMALE.last;

  const rand = Math.random();
  // Tight distribution — only ~1% of players reach 90+ (4–8 league-wide).
  // 83–89 "All-Star" tier is limited to ~6% so it stays exclusive (~27 players per 30-team league).
  let baseRating = rand > 0.99 ? 90 + Math.floor(Math.random() * 7)  // 1%:   90–96 (rare superstars)
                 : rand > 0.93 ? 83 + Math.floor(Math.random() * 7)  // 6%:   83–89 (All-Star tier)
                 : rand > 0.58 ? 75 + Math.floor(Math.random() * 8)  // 35%:  75–82 (solid starters)
                 : rand > 0.20 ? 65 + Math.floor(Math.random() * 10) // 38%:  65–74 (role players)
                               : 54 + Math.floor(Math.random() * 11); // 20%: 54–64 (fringe/G-League)
  const rating = Math.min(99, Math.max(minRating, baseRating));
  const potential = Math.min(99, rating + Math.floor(Math.random() * 12));
  const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

  // WNBA age eligibility: domestic (U.S.) ≥ 22, international ≥ 20.
  // Enforced here so every code path that calls generatePlayer automatically respects WNBA rules.
  const isWomensGen = genderRatio === 100;
  const playerCountry = region.id === 'usa' ? 'United States' : region.name;
  const effectiveAgeMin = isWomensGen
    ? wnbaAgeFloor(playerCountry, ageRange[0])
    : ageRange[0];
  const effectiveAgeMax = Math.max(effectiveAgeMin, ageRange[1]);
  const age = effectiveAgeMin + Math.floor(Math.random() * (effectiveAgeMax - effectiveAgeMin + 1));
  const _leagueYear = leagueYear ?? new Date().getFullYear();
  
  const f = region.flavor;
  const getRandomAttr = (base: number, flavor: number = 0) =>
    Math.min(99, Math.max(25, Math.floor(base + flavor + (Math.random() * 20 - 10))));
  const playerHometown = region.hometowns[Math.floor(Math.random() * region.hometowns.length)];
  const physGender = gender === 'Female' ? 'Female' : 'Male';
  const phys = genPhysical(pos, physGender);
  const posRanges = POS_ATTR_RANGES[pos];
  const clampPos = (val: number, key: PosAttrRangeKey) => { const [lo, hi] = posRanges[key]; return Math.min(Math.min(99, hi), Math.max(lo, val)); };
  // Position granular bias: shifts each raw attr center toward position-realistic values.
  const gb = POS_GRANULAR_BIAS[pos] ?? {};
  const ba = (base: number, flavor: number = 0, key?: string) =>
    getRandomAttr(base, flavor + (key !== undefined && gb[key] !== undefined ? (gb[key] as number) : 0));
  const rawAttrs: AttrMap = {
    shooting:    clampPos(rating + f.shooting,     'shooting'),
    defense:     clampPos(rating,                  'defense'),
    rebounding:  clampPos(rating,                  'rebounding'),
    playmaking:  clampPos(rating + f.passing,      'playmaking'),
    athleticism: clampPos(rating + f.athleticism,  'athleticism'),
    layups:       ba(rating, 0,            'layups'),
    dunks:        ba(rating, f.athleticism, 'dunks'),
    shootingMid:  ba(rating, f.shooting,   'shootingMid'),
    shooting3pt:  ba(rating, f.shooting,   'shooting3pt'),
    freeThrow:    ba(rating, f.shooting,   'freeThrow'),
    speed:        ba(rating, f.athleticism,'speed'),
    strength:     ba(rating, f.athleticism,'strength'),
    jumping:      ba(rating, f.athleticism,'jumping'),
    stamina:      ba(rating, 0,            'stamina'),
    perimeterDef: ba(rating, 0,            'perimeterDef'),
    interiorDef:  ba(rating, 0,            'interiorDef'),
    steals:       ba(rating, 0,            'steals'),
    blocks:       ba(rating, 0,            'blocks'),
    defensiveIQ:  ba(rating, f.iq,         'defensiveIQ'),
    ballHandling: ba(rating, f.passing,    'ballHandling'),
    passing:      ba(rating, f.passing,    'passing'),
    offensiveIQ:  ba(rating, f.iq,         'offensiveIQ'),
    postScoring:  ba(rating, 0,            'postScoring'),
    offReb:       ba(rating, 0,            'offReb'),
    defReb:       ba(rating, 0,            'defReb'),
    // Durability is independent of skill — wide random spread (30–95)
    durability: Math.min(99, Math.max(20, Math.floor(55 + (Math.random() * 60 - 15)))),
  };
  const pAttrs = applyPhysical(rawAttrs, pos, physGender, phys.heightIn, phys.weight);
  const playerTraits = getRandomTraits();
  
  const rawPlayer: Player = {
    id,
    name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
    gender,
    age,
    position: pos,
    rating,
    potential,
    attributes: pAttrs as Player['attributes'],
    salary: gender === 'Female'
      ? calcWNBASalary(rating, _leagueYear)
      : calcNBASalary(rating, _leagueYear),
    contractYears: Math.floor(Math.random() * 5) + 1,
    desiredContract: {
      years: rating >= 80 ? 4 : rating >= 70 ? 3 : 2,
      salary: gender === 'Female'
        ? calcWNBASalary(rating, _leagueYear)
        : computeMensMarketSalary(rating, _leagueYear),
    },
    stats: {
      points: 0, rebounds: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, gamesPlayed: 0, gamesStarted: 0,
      minutes: 0, fgm: 0, fga: 0, threepm: 0, threepa: 0, ftm: 0, fta: 0, tov: 0, pf: 0,
      techs: 0, flagrants: 0, ejections: 0, plusMinus: 0
    },
    careerStats: [],
    gameLog: [],
    careerHighs: {
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      threepm: 0
    },
    morale: 75 + Math.floor(Math.random() * 20),
    jerseyNumber: Math.floor(Math.random() * 99),
    height: phys.heightStr, weight: phys.weight,
    archetype: deriveArchetype(pos, pAttrs as Record<string, number>, rating, false),
    secondaryPositions: assignSecondaryPositions(pos, pAttrs as Record<string, number>, phys.heightIn),
    status: 'Bench',
    personalityTraits: playerTraits,
    tendencies: generateTendencies(pos, playerTraits),
    hometown: playerHometown,
    country: countryFromHometown(playerHometown),
    birthdate: randomBirthdate(age, _leagueYear),
    ...generateCollegeAndLeague(rating, region.id),
    draftInfo: draftCtx
      ? generateDraftInfo(rating, age, draftCtx)
      : { team: "Undrafted", round: 0, pick: 0, year: 0 }
  };
  return enforcePositionalBounds(rawPlayer);
};

export const generateFreeAgentPool = (count: number, season: number, genderRatio: number = 0, extraTeamNames: string[] = []): Player[] => {
  const teamNames = extraTeamNames.length > 0 ? extraTeamNames : TEAM_DATA.map(t => t.name);
  const usedPicks = new Map<number, Set<string>>();
  return Array.from({ length: count }).map((_, i) => {
    const draftCtx: DraftContext = { season, teamNames, usedPicks };
    const p = generatePlayer(`fa-${season}-${i}`, [21, 36], genderRatio, draftCtx, season);
    // Generated FA pool is capped at 75 OVR — realistic players above 75 are almost always
    // on rosters. The only 76+ FAs are real players waived/released mid-season (not generated).
    // Distribution: 20% → 60–67 (fringe/bench), 60% → 68–73 (rotation depth), 20% → 74–75 (ceiling).
    const tierRoll = Math.random();
    const [tierMin, tierMax] =
      tierRoll < 0.20 ? [60, 67] :
      tierRoll < 0.80 ? [68, 73] : [74, 75];
    const skewedRating = Math.min(tierMax, Math.max(tierMin, p.rating));
    const skewedPlayer = skewedRating !== p.rating ? { ...p, rating: skewedRating } : p;
    return {
      ...skewedPlayer,
      isFreeAgent: true,
      lastTeamId: undefined,
      contractYears: 0,
      desiredContract: {
        years: Math.floor(Math.random() * 3) + 1,
        salary: p.gender === 'Female'
          ? calcWNBASalary(skewedRating, season)
          : computeMensMarketSalary(skewedRating, season)
      },
      interestScore: 30 + Math.floor(Math.random() * 50)
    };
  });
};

export const generateProspects = (year: number, count: number = 100, genderRatio: number = 0, ageMin = 19, ageMax = 21): Prospect[] => {
  return Array.from({ length: count }).map((_, i) => {
    const gender = getRandomGender(genderRatio);
    
    // Pick a region based on weights
    const randRegion = Math.random() * 100;
    let cumulative = 0;
    let region = REGIONS[0];
    for (const r of REGIONS) {
      cumulative += r.weight;
      if (randRegion <= cumulative) {
        region = r;
        break;
      }
    }

    const firstNames = gender === 'Male' ? region.firstNamesMale : NAMES_FEMALE.first;
    const lastNames = gender === 'Male' ? region.lastNamesMale : NAMES_FEMALE.last;
    
    const id = `prospect-${year}-${i}`;
    const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
    
    // ── Traits first — they drive bust risk and potential ceiling ──────────
    const prospectTraits = getRandomTraits();
    const badCount  = prospectTraits.filter(t => (t === 'Lazy' || t === 'Hot Head' || t === 'Money Hungry' || t === 'Diva/Star')).length;
    const goodCount = prospectTraits.filter(t => (t === 'Gym Rat' || t === 'Workhorse' || t === 'Leader' || t === 'Professional' || t === 'Clutch')).length;

    // ── OVR by pick slot — rookies are raw; superstars develop, not arrive ──
    // #1 pick: 83–88 (rarely 90 with elite traits). True 90+ OVR must be earned.
    let rating: number;
    if (i === 0) {
      rating = 83 + Math.floor(Math.random() * 6);          // #1 overall:  83–88
    } else if (i < 5) {
      rating = 79 + Math.floor(Math.random() * 6);          // Top 5:       79–84
    } else if (i < 14) {
      rating = 73 + Math.floor(Math.random() * 7);          // Lottery 6–13: 73–79
    } else if (i < 30) {
      rating = 67 + Math.floor(Math.random() * 7);          // Late first:  67–73
    } else if (i < 60) {
      rating = Math.random() < 0.08                         // 2nd round: sleeper or normal
        ? 68 + Math.floor(Math.random() * 6)                //   sleeper:  68–73
        : 57 + Math.floor(Math.random() * 10);              //   normal:   57–66
    } else {
      rating = 52 + Math.floor(Math.random() * 9);          // Undrafted:   52–60
    }

    // ── Trait bust-risk modifier ─────────────────────────────────────────
    // Good traits (Gym Rat, Workhorse…) can push a prospect above their slot.
    // Bad traits create bust risk — harsh for late picks, mild for top picks.
    const bustMultiplier = i >= 14 ? 2.0 : i >= 5 ? 1.0 : 0.5;
    const traitDelta     = Math.round((goodCount - badCount * 1.5) * bustMultiplier);
    // #1 pick trait ceiling capped at +2 (84–90 max with elite traits — very rare 90)
    const maxAdjust      = i === 0 ? 2 : i < 5 ? 3 : i < 14 ? 4 : 6;
    rating = Math.min(99, Math.max(50, rating + Math.max(-maxAdjust, Math.min(maxAdjust, traitDelta))));

    // ── Potential: development ceiling — high for top picks, earned for late picks ─
    let potential: number;
    if (i === 0) {
      potential = 88 + Math.floor(Math.random() * 10);               // #1 pick:    88–97 (can become a star)
    } else if (i < 5) {
      potential = Math.min(99, 85 + Math.floor(Math.random() * 12)); // Top 5:      85–96
    } else if (i < 14) {
      potential = Math.min(99, rating + Math.floor(Math.random() * 16) + 7); // Lottery: high upside
    } else if (i < 30) {
      potential = Math.min(99, rating + Math.floor(Math.random() * 13) + 5); // Late 1st: moderate
    } else {
      potential = Math.min(99, rating + Math.floor(Math.random() * 10) + 3); // 2nd rd / undrafted
    }
    // Bad traits erode ceiling for mid/late picks — bust signal
    if (badCount > 0 && i >= 5) {
      potential = Math.max(rating + 4, potential - badCount * 3);
    }
    
    // Apply regional flavor
    const f = region.flavor;
    const getRandomAttr = (base: number, flavor: number = 0) =>
      Math.min(99, Math.max(25, Math.floor(base + flavor + (Math.random() * 25 - 12))));
    const prospectHometown = region.hometowns[Math.floor(Math.random() * region.hometowns.length)];
    const physGender = gender === 'Female' ? 'Female' : 'Male';
    const phys = genPhysical(pos, physGender);
    const posRanges = POS_ATTR_RANGES[pos];
    const clampPos = (val: number, key: PosAttrRangeKey) => { const [lo, hi] = posRanges[key]; return Math.min(Math.min(99, hi), Math.max(lo, val)); };
    const gb = POS_GRANULAR_BIAS[pos] ?? {};
    const ba = (base: number, flavor: number = 0, key?: string) =>
      getRandomAttr(base, flavor + (key !== undefined && gb[key] !== undefined ? (gb[key] as number) : 0));
    const rawAttrs: AttrMap = {
      shooting:    clampPos(rating + f.shooting,    'shooting'),
      defense:     clampPos(rating,                 'defense'),
      rebounding:  clampPos(rating,                 'rebounding'),
      playmaking:  clampPos(rating + f.passing,     'playmaking'),
      athleticism: clampPos(rating + f.athleticism, 'athleticism'),
      layups:       ba(rating, 0,             'layups'),
      dunks:        ba(rating, f.athleticism, 'dunks'),
      shootingMid:  ba(rating, f.shooting,    'shootingMid'),
      shooting3pt:  ba(rating, f.shooting,    'shooting3pt'),
      freeThrow:    ba(rating, f.shooting,    'freeThrow'),
      speed:        ba(rating, f.athleticism, 'speed'),
      strength:     ba(rating, f.athleticism, 'strength'),
      jumping:      ba(rating, f.athleticism, 'jumping'),
      stamina:      ba(rating, 0,             'stamina'),
      perimeterDef: ba(rating, 0,             'perimeterDef'),
      interiorDef:  ba(rating, 0,             'interiorDef'),
      steals:       ba(rating, 0,             'steals'),
      blocks:       ba(rating, 0,             'blocks'),
      defensiveIQ:  ba(rating, f.iq,          'defensiveIQ'),
      ballHandling: ba(rating, f.passing,     'ballHandling'),
      passing:      ba(rating, f.passing,     'passing'),
      offensiveIQ:  ba(rating, f.iq,          'offensiveIQ'),
      postScoring:  ba(rating, 0,             'postScoring'),
      offReb:       ba(rating, 0,             'offReb'),
      defReb:       ba(rating, 0,             'defReb'),
      durability: Math.min(99, Math.max(20, Math.floor(55 + (Math.random() * 60 - 15)))),
    };
    const pAttrs = applyPhysical(rawAttrs, pos, physGender, phys.heightIn, phys.weight);
    const bAttrsRaw = applyAttrBounds(pAttrs as Player['attributes'], pos, {
      heightBonus: phys.heightIn >= (HEIGHT_WEIGHT[pos]?.[physGender]?.avgH ?? 0) + 3 ? 5 : 0,
    });
    const bAttrs = gender === 'Female' ? applyFemaleAttrCaps(bAttrsRaw) : bAttrsRaw;

    // WNBA draft eligibility: domestic (U.S.) prospects must be ≥ 22; international ≥ 20.
    // The caller's ageMin/ageMax is still honoured if it enforces a stricter floor.
    const isWomensProspect = genderRatio === 100;
    const prospectCountry = region.id === 'usa' ? 'United States' : region.name;
    const effectiveProspectMin = isWomensProspect
      ? wnbaAgeFloor(prospectCountry, ageMin)
      : ageMin;
    const effectiveProspectMax = Math.max(effectiveProspectMin, ageMax);
    const prospectAge = effectiveProspectMin + Math.floor(Math.random() * (effectiveProspectMax - effectiveProspectMin + 1));
    const rawProspect = {
      id,
      name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
      gender,
      age: prospectAge,
      position: pos,
      rating,
      potential,
      scoutGrade: i < 5 ? 5 : i < 15 ? 4 : i < 40 ? 3 : 2,
      school: region.origins[Math.floor(Math.random() * region.origins.length)],
      revealed: false,
      mockRank: i + 1,
      attributes: bAttrs,
      jerseyNumber: Math.floor(Math.random() * 99),
      height: phys.heightStr, weight: phys.weight,
      archetype: deriveArchetype(pos, bAttrs as Record<string, number>, rating, false),
      secondaryPositions: assignSecondaryPositions(pos, bAttrs as Record<string, number>, phys.heightIn),
      personalityTraits: prospectTraits,
      tendencies: generateTendencies(pos, prospectTraits),
      hometown: prospectHometown,
      country: countryFromHometown(prospectHometown),
      birthdate: randomBirthdate(prospectAge, year),
      college: 'N/A',
      draftInfo: { team: "N/A", round: 0, pick: 0, year },
      careerStats: [],
      gameLog: [],
      careerHighs: {
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        threepm: 0
      }
    };
    return rawProspect;
  });
};

export const generateDefaultRotation = (roster: Player[]): TeamRotation => {
  const sorted = [...roster].sort((a, b) => b.rating - a.rating);
  const starters: Record<Position, string> = {
    PG: '', SG: '', SF: '', PF: '', C: ''
  };
  
  const assignedIds = new Set<string>();
  
  // Try to fill positions naturally — first exact primary match, then secondary match
  const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  positions.forEach(pos => {
    const bestAtPos = sorted.find(p => p.position === pos && !assignedIds.has(p.id));
    if (bestAtPos) {
      starters[pos] = bestAtPos.id;
      assignedIds.add(bestAtPos.id);
    }
  });

  // Second pass: fill gaps with secondary-position eligible players
  positions.forEach(pos => {
    if (!starters[pos]) {
      const eligible = sorted.find(
        p => !assignedIds.has(p.id) && (p.secondaryPositions ?? []).includes(pos)
      );
      if (eligible) {
        starters[pos] = eligible.id;
        assignedIds.add(eligible.id);
      }
    }
  });

  // Fill remaining starter spots with best available
  positions.forEach(pos => {
    if (!starters[pos]) {
      const bestAvailable = sorted.find(p => !assignedIds.has(p.id));
      if (bestAvailable) {
        starters[pos] = bestAvailable.id;
        assignedIds.add(bestAvailable.id);
      }
    }
  });
  
  const bench: string[] = [];
  const reserves: string[] = [];
  
  sorted.forEach(p => {
    if (!assignedIds.has(p.id)) {
      if (bench.length < 5) {
        bench.push(p.id);
      } else {
        reserves.push(p.id);
      }
    }
  });
  
  const minutes: Record<string, number> = {};
  // Starters get ~34 mins
  Object.values(starters).forEach(id => {
    minutes[id] = 34;
  });
  // Bench gets ~14 mins
  bench.forEach(id => {
    minutes[id] = 14;
  });
  // Reserves get 0
  reserves.forEach(id => {
    minutes[id] = 0;
  });
  
  return { starters, bench, reserves, minutes };
};

// ── Roster slot floors by team tier ─────────────────────────────────────────
// 14 values per tier, sorted best-to-worst (franchise player → 14th man).
// These are minimum ratings per roster slot so teams have a realistic spread.
const TIER_SLOT_FLOORS: Record<string, number[]> = {
  // elite: 2–3 contenders — no guaranteed 90+; stars emerge through random roll
  // top-10 floor avg ≈ 77, actual avg ≈ 80–83 with natural variance
  elite:      [84, 82, 80, 78, 77, 76, 75, 74, 73, 72, 70, 67, 63, 59],
  // solid: strong rosters — reliable starters, 1 potential All-Star
  // top-10 floor avg ≈ 74, actual avg ≈ 77–80
  solid:      [80, 78, 76, 74, 73, 72, 71, 70, 69, 68, 66, 63, 59, 56],
  // average: the bulk of the league — steady starters, decent depth
  // top-10 floor avg ≈ 70, actual avg ≈ 73–77
  average:    [76, 74, 72, 70, 69, 68, 67, 66, 65, 64, 62, 59, 55, 52],
  // rebuilding: young/cheap roster; top star is a project
  // top-10 floor avg ≈ 66, actual avg ≈ 69–73
  rebuilding: [72, 70, 68, 66, 65, 64, 63, 62, 61, 60, 57, 54, 51, 48],
};

// ── Executive (GM) name generation ───────────────────────────────────────────
const GM_FIRST_NAMES_MALE = [
  'Marcus','Darnell','Terrence','Calvin','Jerome','Reginald','Alvin','Devin','Maurice','Kendall',
  'Bradley','Curtis','Elijah','Gordon','Harris','Ivan','Jordan','Kevin','Lance','Miles',
  'Nathan','Owen','Preston','Quinton','Russell','Spencer','Travis','Victor','Walter','Xavier',
];
const GM_FIRST_NAMES_FEMALE = [
  'Alicia','Brenda','Carmen','Denise','Evelyn','Felicia','Gloria','Helen','Irene','Jasmine',
  'Karen','Latasha','Monica','Natasha','Olivia','Patricia','Renee','Sandra','Tamika','Ursula',
  'Vanessa','Whitney','Alexis','Brianna','Cassandra','Dominique','Elaine','Francine','Gwendolyn','Harriet',
];
const GM_LAST_NAMES = [
  'Whitaker','Chambers','Holloway','Mercer','Stanton','Dupree','Fletcher','Gaines','Harmon','Ingram',
  'Jefferson','Kingston','Lawson','Monroe','Nash','Okafor','Parrish','Quinn','Rhodes','Sutton',
  'Tillman','Underwood','Vance','Washington','Yates','Zimmerman','Blackwell','Caldwell','Dixon','Ellison',
];
const GM_MIDDLE_INITIALS = 'ABCDEFGHJKLMNPRSTW';

export const generateGMName = (genderRatio: number = 0): { name: string; age: number } => {
  const isFemale = Math.random() * 100 < genderRatio;
  const firstNames = isFemale ? GM_FIRST_NAMES_FEMALE : GM_FIRST_NAMES_MALE;
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last  = GM_LAST_NAMES[Math.floor(Math.random() * GM_LAST_NAMES.length)];
  const mid   = GM_MIDDLE_INITIALS[Math.floor(Math.random() * GM_MIDDLE_INITIALS.length)];
  // ~50% chance of middle initial for variety
  const name  = Math.random() < 0.5 ? `${first} ${mid}. ${last}` : `${first} ${last}`;
  const age   = 35 + Math.floor(Math.random() * 31); // 35–65
  return { name, age };
};

export const generateLeagueTeams = (genderRatio: number = 0, season: number = 2026, futureSeasonsToSeed: number = 4): Team[] => {
  const teamNames = TEAM_DATA.map(t => t.name);
  const usedPicks = new Map<number, Set<string>>();

  // Assign tiers proportionally, then shuffle for random distribution across franchises
  const n = TEAM_DATA.length;
  const nElite      = Math.max(2, Math.round(n * 0.10));
  const nSolid      = Math.max(4, Math.round(n * 0.23));
  const nRebuilding = Math.max(3, Math.round(n * 0.20));
  const nAverage    = n - nElite - nSolid - nRebuilding;
  const tierList = [
    ...Array(nElite).fill('elite'),
    ...Array(nSolid).fill('solid'),
    ...Array(Math.max(0, nAverage)).fill('average'),
    ...Array(nRebuilding).fill('rebuilding'),
  ].sort(() => Math.random() - 0.5);

  return TEAM_DATA.map((data, i) => {
    const teamId = `team-${i}`;
    const futurePicks: DraftPick[] = [];
    for (let f = 1; f <= futureSeasonsToSeed; f++) {
      const yr = season + f;
      futurePicks.push(
        { round: 1, pick: 0, originalTeamId: teamId, currentTeamId: teamId, year: yr },
        { round: 2, pick: 0, originalTeamId: teamId, currentTeamId: teamId, year: yr },
      );
    }
    const picks: DraftPick[] = [
      { round: 1, pick: 0, originalTeamId: teamId, currentTeamId: teamId, year: season },
      { round: 2, pick: 0, originalTeamId: teamId, currentTeamId: teamId, year: season },
      ...futurePicks,
    ];

    const ownerGoals: OwnerGoal[] = ['Win Now', 'Rebuild', 'Profit'];
    // Owner names: large diverse pool so every new career generates fresh identities.
    const _ownerFirsts = [
      'Alexander','Beatrice','Carlos','Diana','Edward','Felicia','Gordon','Helena',
      'Ibrahim','Jacqueline','Klaus','Lorraine','Maxwell','Nadia','Oliver','Priya',
      'Reginald','Simone','Theodore','Uma','Vincent','Whitney','Yusuf','Zoe',
      'Andre','Bridget','Clayton','Desiree','Emil','Francesca','Grant','Harriet',
      'Ingrid','Jerome','Kenji','Lakshmi','Morgan','Nicolette','Oswald','Penelope',
      'Quincy','Roxanne','Stavros','Tabitha','Umberto','Valentina','Warren','Xiomara',
    ];
    const _ownerLasts = [
      'Abernathy','Blackstone','Carrington','Delacroix','Everett','Fairbanks','Garrison','Holloway',
      'Islington','Jameson','Kingston','Laurent','Merriweather','Northcott','Okonkwo','Pemberton',
      'Quigley','Ravensworth','Stratton','Treadwell','Underwood','Vasiliev','Wentworth','Xavier',
      'Alderton','Breckenridge','Callahan','Demetriou','Elsworth','Fontaine','Grantham','Huntington',
      'Iyer','Johansson','Kulkarni','Lefebvre','Montoya','Nakamura','Osei','Papadopoulos',
      'Rousseau','Shimizu','Thackeray','Uribe','Vossler','Whitfield','Yamamoto','Zuberi',
    ];
    const _ownerPersonalities = [
      'Impatient Billionaire','Championship-or-Bust','Community Builder','Analytics Believer',
      'Old-School Traditionalist','Media-Savvy Mogul','Silent Partner','Interfering Micromanager',
      'Patient Developer','Win-Now Fanatic','Brand Builder','Revenue-Focused',
    ];
    const _rand = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const ownerName = `${_rand(_ownerFirsts)} ${_rand(_ownerLasts)}`;
    const ownerPersonality = _rand(_ownerPersonalities);
    const draftCtx: DraftContext = { season, teamNames, usedPicks };
    const tier = (tierList[i] ?? 'average') as keyof typeof TIER_SLOT_FLOORS;
    const slotFloors = TIER_SLOT_FLOORS[tier];
    let roster = Array.from({ length: 15 }).map((_, j) =>
      generatePlayer(`p-${i}-${j}`, [19, 38], genderRatio, draftCtx, season, slotFloors[j] ?? 68)
    );

    // ── Positional balance enforcement ────────────────────────────────────────
    // Target: 3 PG, 3 SG, 3 SF, 3 PF, 2-3 C per 15-man roster.
    // Prevents absurd distributions (e.g. 5 C, 0 PG).  Reassigns position only —
    // attributes are unchanged, so players feel slightly off-position which is
    // realistic (converted bigs, point-forwards, etc.).
    {
      const posCount = (pos: Position) => roster.filter(p => p.position === pos).length;
      // Too many centers (>3): convert excess C→PF, starting from lowest rating
      let excess = posCount('C') - 3;
      if (excess > 0) {
        const sorted = [...roster].sort((a, b) => a.rating - b.rating);
        roster = roster.map(p => {
          if (excess > 0 && p.position === 'C' && sorted.findIndex(s => s.id === p.id) < sorted.filter(s => s.position === 'C').length) {
            excess--;
            return { ...p, position: 'PF' as Position };
          }
          return p;
        });
      }
      // Too many PGs (>4): convert excess PG→SG
      let exPG = posCount('PG') - 4;
      if (exPG > 0) {
        roster = roster.map(p => {
          if (exPG > 0 && p.position === 'PG') { exPG--; return { ...p, position: 'SG' as Position }; }
          return p;
        });
      }
      // No center at all: convert worst PF to C
      if (posCount('C') === 0) {
        const worstPF = [...roster].filter(p => p.position === 'PF').sort((a, b) => a.rating - b.rating)[0];
        if (worstPF) roster = roster.map(p => p.id === worstPF.id ? { ...p, position: 'C' as Position } : p);
      }
      // No PG at all: convert best SG to PG
      if (posCount('PG') === 0) {
        const bestSG = [...roster].filter(p => p.position === 'SG').sort((a, b) => b.rating - a.rating)[0];
        if (bestSG) roster = roster.map(p => p.id === bestSG.id ? { ...p, position: 'PG' as Position } : p);
      }
    }

    // ── Payroll normalization: cap total payroll at NBA first-apron equivalent.
    // This prevents individual random variation from stacking into absurd totals
    // (e.g. a full roster of high-floor players). Hard ceiling = $185M.
    {
      const PAYROLL_HARD_CAP = 185_000_000;
      const rawPayroll = roster.reduce((s, p) => s + p.salary, 0);
      if (rawPayroll > PAYROLL_HARD_CAP) {
        const scale = PAYROLL_HARD_CAP / rawPayroll;
        roster = roster.map(p => ({
          ...p,
          salary: Math.round(Math.max(1_100_000, p.salary * scale) / 250_000) * 250_000,
        }));
      }
    }

    const headCoach = generateCoach(`coach-${teamId}-hc`, 'B', genderRatio, season);
    return {
      id: teamId,
      name: data.name,
      city: data.city,
      roster,
      staff: {
        headCoach,
        assistantOffense: generateCoach(`coach-${teamId}-off`, 'C', genderRatio, season),
        assistantDefense: generateCoach(`coach-${teamId}-def`, 'C', genderRatio, season),
        assistantDev: generateCoach(`coach-${teamId}-dev`, 'C', genderRatio, season),
        trainer: generateCoach(`coach-${teamId}-tr`, 'C', genderRatio, season)
      },
      staffBudget: 15000000,
      activeScheme: getCoachPreferredScheme(headCoach),
      wins: 0, losses: 0, homeWins: 0, homeLosses: 0, roadWins: 0, roadLosses: 0, confWins: 0, confLosses: 0, lastTen: [],
      budget: 180000000,
      logo: '',  // no stock photo; TeamBadge renders letter badge as default
      conference: data.conf as Conference,
      division: data.div as Division,
      marketSize: data.market as MarketSize,
      streak: 0,
      picks,
      finances: {
        revenue: 5000000,
        expenses: 4000000,
        cash: 25000000,
        ticketPrice: 85,
        concessionPrice: 12,
        fanHype: 65,
        ownerPatience: 80,
        ownerGoal: ownerGoals[Math.floor(Math.random() * ownerGoals.length)],
        ownerName,
        ownerPersonality,
        budgets: {
          scouting: 20,
          health: 20,
          facilities: 20
        }
      },
      primaryColor: data.primary,
      secondaryColor: data.secondary,
      rotation: generateDefaultRotation(roster),
      abbreviation: data.city.substring(0, 3).toUpperCase(),
      population: data.market === 'Large' ? 8.5 : data.market === 'Medium' ? 4.2 : 1.5,
      stadiumCapacity: data.market === 'Large' ? 20000 : data.market === 'Medium' ? 18500 : 17000,
      borderStyle: 'Solid',
      status: 'Active',
      ...(() => { const gm = generateGMName(genderRatio); return { gmName: gm.name, gmAge: gm.age }; })(),
    };
  });
};

export const generateSeasonSchedule = (
  teams: Team[],
  numGames: number = 82,
  divisionGamesCount?: number,
  conferenceGamesCount?: number,
): ScheduleGame[] => {
  const schedule: ScheduleGame[] = [];
  const teamGamesCountTotal: Record<string, number> = {};
  const teamGamesScheduled: Record<string, number> = {};
  const teamLastDay: Record<string, number> = {};
  const teamB2BCount: Record<string, number> = {};
  const teamLastB2BGameIndex: Record<string, number> = {}; 

  teams.forEach(t => {
    teamGamesCountTotal[t.id] = 0;
    teamGamesScheduled[t.id] = 0;
    teamLastDay[t.id] = -5;
    teamB2BCount[t.id] = 0;
    teamLastB2BGameIndex[t.id] = -10;
  });

  const matchupsPool: { t1: string, t2: string }[] = [];
  const pairings: Record<string, Record<string, number>> = {};
  teams.forEach(t => pairings[t.id] = {});

  const addGameToPool = (id1: string, id2: string) => {
    matchupsPool.push({ t1: id1, t2: id2 });
    teamGamesCountTotal[id1]++;
    teamGamesCountTotal[id2]++;
    pairings[id1][id2] = (pairings[id1][id2] || 0) + 1;
    pairings[id2][id1] = (pairings[id2][id1] || 0) + 1;
  };

  // ── Infer league structure from team data ─────────────────────────────────
  const divMap: Record<string, string[]>  = {};
  const confMap: Record<string, string[]> = {};
  teams.forEach(t => {
    (divMap[t.division]   ??= []).push(t.id);
    (confMap[t.conference] ??= []).push(t.id);
  });
  const divSizes  = Object.values(divMap).map(d => d.length);
  const confSizes = Object.values(confMap).map(c => c.length);
  const medDivSize  = divSizes.sort((a,b)=>a-b)[Math.floor(divSizes.length/2)]   || 5;
  const medConfSize = confSizes.sort((a,b)=>a-b)[Math.floor(confSizes.length/2)] || 15;
  const divOpp      = Math.max(1, medDivSize - 1);            // e.g., 4
  const confNDOpp   = Math.max(1, medConfSize - medDivSize);  // e.g., 10
  const oocOpp      = Math.max(1, teams.length - medConfSize);// e.g., 15

  // ── Convert per-team totals → per-pair game counts ────────────────────────
  // divisionGamesCount / conferenceGamesCount are TOTAL per-team season counts,
  // not per-pair. e.g., 16 div games / 4 opponents = 4 games per div pair.
  const totalDiv  = numGames >= 80 ? (divisionGamesCount  ?? 16) : 0;
  const totalConf = numGames >= 80 ? (conferenceGamesCount ?? 36) : 0;
  const totalOoc  = Math.max(0, numGames - totalDiv - totalConf); // e.g., 30

  const divPP   = Math.max(1, Math.round(totalDiv / divOpp));     // 16/4 = 4
  const confPP  = Math.max(1, Math.floor(totalConf / confNDOpp)); // 36/10 = 3
  const confExtraPerTeam = Math.max(0, totalConf - confPP * confNDOpp); // 6
  const oocPP   = Math.max(1, Math.floor(totalOoc / oocOpp));     // 30/15 = 2
  const oocExtraPerTeam  = Math.max(0, totalOoc - oocPP * oocOpp);

  // ── Determine which conference non-div pairs get +1 game ──────────────────
  // Each team should have exactly confExtraPerTeam opponents at confPP+1.
  const confNDPairs: [string, string][] = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      if (teams[i].conference === teams[j].conference && teams[i].division !== teams[j].division)
        confNDPairs.push([teams[i].id, teams[j].id]);

  // Fisher-Yates shuffle (replacing biased sort)
  for (let i = confNDPairs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [confNDPairs[i], confNDPairs[j]] = [confNDPairs[j], confNDPairs[i]]; }
  const extraBudget: Record<string, number> = {};
  teams.forEach(t => { extraBudget[t.id] = confExtraPerTeam; });
  const confExtraPairs = new Set<string>();
  confNDPairs.forEach(([a, b]) => {
    if ((extraBudget[a] ?? 0) > 0 && (extraBudget[b] ?? 0) > 0) {
      confExtraPairs.add(`${a}|${b}`);
      extraBudget[a]--;
      extraBudget[b]--;
    }
  });

  // Same for out-of-conference extra pairs
  const oocPairs: [string, string][] = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      if (teams[i].conference !== teams[j].conference)
        oocPairs.push([teams[i].id, teams[j].id]);

  // Fisher-Yates shuffle
  for (let i = oocPairs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [oocPairs[i], oocPairs[j]] = [oocPairs[j], oocPairs[i]]; }
  const oocBudget: Record<string, number> = {};
  teams.forEach(t => { oocBudget[t.id] = oocExtraPerTeam; });
  const oocExtraPairs = new Set<string>();
  oocPairs.forEach(([a, b]) => {
    if ((oocBudget[a] ?? 0) > 0 && (oocBudget[b] ?? 0) > 0) {
      oocExtraPairs.add(`${a}|${b}`);
      oocBudget[a]--;
      oocBudget[b]--;
    }
  });

  // ── Build per-pair max games map (used in pool and greedy fill) ───────────
  const maxPairGames: Record<string, number> = {};
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i], t2 = teams[j];
      const key = `${t1.id}|${t2.id}`;
      if (numGames >= 80) {
        if (t1.division === t2.division) {
          maxPairGames[key] = divPP;
        } else if (t1.conference === t2.conference) {
          maxPairGames[key] = confPP + (confExtraPairs.has(key) ? 1 : 0);
        } else {
          maxPairGames[key] = oocPP + (oocExtraPairs.has(key) ? 1 : 0);
        }
      } else {
        // Small league: allow multiple matchups per pair so each team reaches numGames
        const opponentCount = Math.max(1, teams.length - 1);
        maxPairGames[key] = Math.ceil(numGames / opponentCount);
      }
    }
  }

  // ── Build the matchup pool ─────────────────────────────────────────────────
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i];
      const t2 = teams[j];
      let count: number;
      if (numGames >= 80) {
        if (t1.division === t2.division) {
          count = divPP;
        } else if (t1.conference === t2.conference) {
          const key = `${t1.id}|${t2.id}`;
          count = confPP + (confExtraPairs.has(key) ? 1 : 0);
        } else {
          const key = `${t1.id}|${t2.id}`;
          count = oocPP + (oocExtraPairs.has(key) ? 1 : 0);
        }
      } else {
        // Small league: seed the pool with floor(numGames / opponents) games per pair;
        // the greedy fill below tops up any remaining slots up to the maxPairGames cap.
        const opponentCount = Math.max(1, teams.length - 1);
        count = Math.max(1, Math.floor(numGames / opponentCount));
      }
      for (let c = 0; c < count; c++) {
        if (teamGamesCountTotal[t1.id] < numGames && teamGamesCountTotal[t2.id] < numGames) {
          addGameToPool(t1.id, t2.id);
        }
      }
    }
  }

  // Fill any remaining gaps (rounding edge cases) greedily
  // Respects per-pair maxima so conference opponents never exceed the planned cap.
  // Priority: prefer OOC opponents → conf non-div → div → any (emergency only).
  const allTeamIds = teams.map(t => t.id);
  const teamById: Record<string, Team> = {};
  teams.forEach(t => { teamById[t.id] = t; });
  const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  allTeamIds.forEach(id => {
    while (teamGamesCountTotal[id] < numGames) {
      // Only consider opponents that still have capacity AND haven't hit their per-pair cap
      const eligible = allTeamIds.filter(oid => {
        if (oid === id || teamGamesCountTotal[oid] >= numGames) return false;
        const max = maxPairGames[pairKey(id, oid)];
        // If no max entry (shouldn't happen with standard setup), allow up to oocPP+1 as fallback
        return max === undefined || (pairings[id][oid] || 0) < max;
      });
      if (eligible.length === 0) break;

      // Sort: prefer OOC first, then conf-ND, then div; within each tier fewest pairings first
      const myConf = teamById[id]?.conference;
      const myDiv  = teamById[id]?.division;
      eligible.sort((a, b) => {
        const aConf = teamById[a]?.conference;
        const bConf = teamById[b]?.conference;
        const aDiv  = teamById[a]?.division;
        const bDiv  = teamById[b]?.division;
        const tierA = aConf !== myConf ? 0 : aDiv !== myDiv ? 1 : 2;
        const tierB = bConf !== myConf ? 0 : bDiv !== myDiv ? 1 : 2;
        if (tierA !== tierB) return tierA - tierB;
        return (pairings[id][a] || 0) - (pairings[id][b] || 0);
      });
      addGameToPool(id, eligible[0]);
    }
  });

  // Fisher-Yates shuffle — required for large arrays; sort(() => Math.random()-0.5) is biased
  const fyshuffle = <T,>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  fyshuffle(matchupsPool);

  let currentLeagueDay = 1;
  while (matchupsPool.length > 0 && currentLeagueDay < 500) {
    const playedToday = new Set<string>();
    for (let i = 0; i < matchupsPool.length; i++) {
      const { t1, t2 } = matchupsPool[i];
      if (playedToday.has(t1) || playedToday.has(t2)) continue;

      const t1Last = teamLastDay[t1];
      const t2Last = teamLastDay[t2];
      const t1B2B = t1Last === currentLeagueDay - 1;
      const t2B2B = t2Last === currentLeagueDay - 1;

      // Don't allow B2B until a team has played ≥ 4 games (prevents game-2 B2Bs at season open).
      if (t1B2B && (teamB2BCount[t1] >= 16 || teamGamesScheduled[t1] - teamLastB2BGameIndex[t1] < 5 || teamGamesScheduled[t1] < 4)) continue;
      if (t2B2B && (teamB2BCount[t2] >= 16 || teamGamesScheduled[t2] - teamLastB2BGameIndex[t2] < 5 || teamGamesScheduled[t2] < 4)) continue;

      // Progressive pacing guard: a team can't run more than ~20% ahead of its proportional
      // B2B budget for the point in the season it's at. This distributes B2Bs evenly
      // rather than clustering them in the first third of the schedule.
      const b2bTarget = numGames >= 80 ? 15 : Math.round(numGames * 0.18);
      if (t1B2B) {
        const pacing = teamB2BCount[t1] / b2bTarget;
        const progress = Math.max(0.01, teamGamesScheduled[t1] / numGames);
        if (pacing > progress + 0.20) continue;
      }
      if (t2B2B) {
        const pacing = teamB2BCount[t2] / b2bTarget;
        const progress = Math.max(0.01, teamGamesScheduled[t2] / numGames);
        if (pacing > progress + 0.20) continue;
      }

      const roll = Math.random();
      const restT1 = t1B2B ? 1 : (roll < 0.10 ? 1 : 2);
      const restT2 = t2B2B ? 1 : (roll < 0.10 ? 1 : 2);

      if (currentLeagueDay - t1Last < restT1 && !t1B2B) continue;
      if (currentLeagueDay - t2Last < restT2 && !t2B2B) continue;

      const isHome = Math.random() > 0.5;
      if (t1B2B) { teamB2BCount[t1]++; teamLastB2BGameIndex[t1] = teamGamesScheduled[t1]; }
      if (t2B2B) { teamB2BCount[t2]++; teamLastB2BGameIndex[t2] = teamGamesScheduled[t2]; }

      schedule.push({
        id: `game-${currentLeagueDay}-${t1}-${t2}`,
        day: currentLeagueDay,
        homeTeamId: isHome ? t1 : t2,
        awayTeamId: isHome ? t2 : t1,
        played: false,
        homeB2B: isHome ? t1B2B : t2B2B,
        awayB2B: isHome ? t2B2B : t1B2B,
        homeB2BCount: isHome ? teamB2BCount[t1] : teamB2BCount[t2],
        awayB2BCount: isHome ? teamB2BCount[t2] : teamB2BCount[t1]
      });

      teamLastDay[t1] = currentLeagueDay; teamLastDay[t2] = currentLeagueDay;
      teamGamesScheduled[t1]++; teamGamesScheduled[t2]++;
      playedToday.add(t1); playedToday.add(t2);
      matchupsPool.splice(i, 1);
      i--;
      if (playedToday.size >= 30) break;
    }
    currentLeagueDay++;
  }

  teams.forEach(team => {
    let counter = 1;
    schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id)
      .sort((a, b) => a.day - b.day)
      .forEach(g => { g.gameNumber = counter++; });
  });

  return schedule.sort((a, b) => a.day - b.day);
};

export const dayToDateString = (day: number, seasonYear: number) => `Day ${day}`;

// ─────────────────────────────────────────────────────────────────────────────
// Historical Financial Lookup
// Each entry covers [fromYear, toYear] inclusive. Values are approximate
// real-world figures scaled to the sim's 30-team league structure.
// ─────────────────────────────────────────────────────────────────────────────
export interface HistoricalFinancials {
  /** Era label shown in UI */
  era: string;
  /** Salary cap in dollars; 0 = no cap */
  salaryCap: number;
  /** Luxury tax threshold; 0 = no luxury tax */
  luxuryTaxLine: number;
  /** Second apron / soft-tax threshold; 0 = N/A */
  luxuryTaxThreshold: number;
  /** Whether a formal rookie pay scale exists */
  rookieScaleContracts: boolean;
  /** Trade salary match requirement as a percentage (100 = no restriction) */
  tradeSalaryMatchPct: number;
  /** Minimum payroll floor */
  minPayroll: number;
  /** Luxury-tax dollar multiplier (penalty per $ over tax line) */
  luxuryTaxMultiplier: number;
  /** Descriptive note shown in UI */
  note: string;
  // ── Optional WNBA / Women's league extensions ──
  maxContractYears?: 2 | 3 | 4 | 5;
  maxPlayerSalaryPct?: 25 | 30 | 35;
  birdRights?: boolean;
  draftRounds?: number;
  draftClassSize?: 'Small' | 'Normal' | 'Large';
  tradableDraftPickSeasons?: number;
  /** WNBA active roster floor */
  minRosterSize?: number;
  /** WNBA active roster ceiling */
  maxRosterSize?: number;
}

interface EraEntry {
  from: number;
  to: number;
  f: HistoricalFinancials;
}

const ERA_TABLE: EraEntry[] = [
  {
    from: 1947, to: 1983,
    f: {
      era: 'Pre-Cap Era', salaryCap: 0, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: false, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      note: 'No salary cap, no luxury tax, free-market contracts.',
    },
  },
  {
    from: 1984, to: 1984,
    f: {
      era: 'First Salary Cap', salaryCap: 3_600_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: false, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      note: 'NBA\'s first salary cap introduced. No luxury tax yet.',
    },
  },
  {
    from: 1985, to: 1987,
    f: {
      era: 'Early Cap Era', salaryCap: 4_945_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: false, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      note: 'Cap grows with TV revenue. No tax, no rookie scale.',
    },
  },
  {
    from: 1988, to: 1991,
    f: {
      era: 'Late 80s Cap', salaryCap: 9_802_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: false, tradeSalaryMatchPct: 125, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      note: 'Trade rules begin to take shape. Cap near $10M.',
    },
  },
  {
    from: 1992, to: 1994,
    f: {
      era: 'Early 90s Cap', salaryCap: 14_000_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: false, tradeSalaryMatchPct: 125, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      note: 'Cap ~$14M. No rookie scale until 1995 CBA.',
    },
  },
  {
    from: 1995, to: 1997,
    f: {
      era: 'Rookie Scale Era Begins', salaryCap: 23_000_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 8_000_000,
      luxuryTaxMultiplier: 1.0,
      note: '1995 CBA introduced rookie salary scale. Cap surges to $23M.',
    },
  },
  {
    from: 1998, to: 1999,
    f: {
      era: '1998 Lockout Era', salaryCap: 30_000_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 9_000_000,
      luxuryTaxMultiplier: 1.0,
      note: 'Post-lockout shortened season. New CBA with max contracts.',
    },
  },
  {
    from: 2000, to: 2001,
    f: {
      era: 'Turn of the Millennium', salaryCap: 35_500_000, luxuryTaxLine: 42_500_000, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 15_000_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Luxury tax introduced. Cap ~$35.5M.',
    },
  },
  {
    from: 2002, to: 2004,
    f: {
      era: 'Early 2000s', salaryCap: 43_840_000, luxuryTaxLine: 52_900_000, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 22_000_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Cap stabilizes ~$44M after TV deal bubble.',
    },
  },
  {
    from: 2005, to: 2007,
    f: {
      era: 'Mid-2000s', salaryCap: 53_135_000, luxuryTaxLine: 64_900_000, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 29_000_000,
      luxuryTaxMultiplier: 1.5,
      note: '2005 CBA. New salary framework. Cap ~$53M.',
    },
  },
  {
    from: 2008, to: 2010,
    f: {
      era: 'Late 2000s', salaryCap: 58_680_000, luxuryTaxLine: 71_150_000, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 43_238_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Cap peaks ~$58M pre-recession freeze.',
    },
  },
  {
    from: 2011, to: 2013,
    f: {
      era: 'Post-Lockout CBA', salaryCap: 58_044_000, luxuryTaxLine: 70_307_000, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 46_602_000,
      luxuryTaxMultiplier: 1.5,
      note: '2011 lockout. Repeater tax added. Cap frozen ~$58M.',
    },
  },
  {
    from: 2014, to: 2015,
    f: {
      era: 'Pre-Spike Era', salaryCap: 63_065_000, luxuryTaxLine: 76_829_000, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 50_000_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Cap rises toward $63M before massive TV deal kicks in.',
    },
  },
  {
    from: 2016, to: 2016,
    f: {
      era: 'TV Deal Spike', salaryCap: 94_143_000, luxuryTaxLine: 113_287_000, luxuryTaxThreshold: 40_000_000,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 75_000_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Massive $24B TV deal causes cap to jump from $70M to $94M.',
    },
  },
  {
    from: 2017, to: 2018,
    f: {
      era: 'Post-Spike Settling', salaryCap: 101_869_000, luxuryTaxLine: 123_733_000, luxuryTaxThreshold: 60_000_000,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 82_000_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Cap normalizes after spike. ~$102M.',
    },
  },
  {
    from: 2019, to: 2020,
    f: {
      era: 'Pre-COVID Era', salaryCap: 109_140_000, luxuryTaxLine: 132_627_000, luxuryTaxThreshold: 70_000_000,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 90_000_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Cap reaches $109M. COVID freeze follows in 2020.',
    },
  },
  {
    from: 2021, to: 2022,
    f: {
      era: 'COVID Recovery', salaryCap: 112_414_000, luxuryTaxLine: 136_606_000, luxuryTaxThreshold: 72_000_000,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 92_000_000,
      luxuryTaxMultiplier: 1.5,
      note: 'Cap resumes growth post-pandemic.',
    },
  },
  {
    from: 2023, to: 2023,
    f: {
      era: '2023 New CBA', salaryCap: 136_021_000, luxuryTaxLine: 165_294_000, luxuryTaxThreshold: 84_750_000,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 112_566_000,
      luxuryTaxMultiplier: 1.75,
      note: '2023 CBA: second apron rules tighten. Cap $136M.',
    },
  },
  {
    from: 2024, to: 2025,
    f: {
      era: 'Modern Era', salaryCap: 140_588_000, luxuryTaxLine: 170_814_000, luxuryTaxThreshold: 84_750_000,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 115_000_000,
      luxuryTaxMultiplier: 1.75,
      note: 'Second apron strictly enforced. Cap ~$140M.',
    },
  },
  {
    from: 2026, to: 2099,
    f: {
      era: 'Future Projection', salaryCap: 153_000_000, luxuryTaxLine: 185_000_000, luxuryTaxThreshold: 92_000_000,
      rookieScaleContracts: true, tradeSalaryMatchPct: 125, minPayroll: 125_000_000,
      luxuryTaxMultiplier: 1.75,
      note: 'Projected forward from 2026 CBA negotiations.',
    },
  },
];

/** Returns the historical financial settings for a given starting year. */
export const getHistoricalFinancials = (year: number): HistoricalFinancials => {
  const entry = ERA_TABLE.find(e => year >= e.from && year <= e.to);
  return entry ? entry.f : ERA_TABLE[ERA_TABLE.length - 1].f;
};

// ── WNBA / Women's League Historical Financials ──────────────────────────────
// Years 1947–1996 intentionally omitted: dropdown is restricted to 1997+ for Women's leagues.

const WNBA_ERA_TABLE: EraEntry[] = [
  {
    from: 1997, to: 1999,
    f: {
      era: 'WNBA Inaugural Era',
      salaryCap: 400_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: false, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      maxContractYears: 2, maxPlayerSalaryPct: 25, birdRights: false,
      draftRounds: 3, draftClassSize: 'Small', tradableDraftPickSeasons: 1,
      minRosterSize: 10, maxRosterSize: 12,
      note: 'WNBA founded 1997. NBA-subsidized, minimal salaries. Max $50K/yr. 3-round draft.',
    },
  },
  {
    from: 2000, to: 2002,
    f: {
      era: 'Early WNBA',
      salaryCap: 550_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: false, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      maxContractYears: 2, maxPlayerSalaryPct: 25, birdRights: false,
      draftRounds: 3, draftClassSize: 'Small', tradableDraftPickSeasons: 1,
      minRosterSize: 10, maxRosterSize: 12,
      note: 'Early WNBA era — minimal salaries. Team cap grows slowly to ~$550K.',
    },
  },
  {
    from: 2003, to: 2007,
    f: {
      era: 'WNBA 2003 CBA',
      salaryCap: 740_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      maxContractYears: 3, maxPlayerSalaryPct: 25, birdRights: false,
      draftRounds: 3, draftClassSize: 'Small', tradableDraftPickSeasons: 2,
      minRosterSize: 10, maxRosterSize: 12,
      note: '2003 CBA: rookie salary scale introduced. Cap ~$700K–$800K. Max contracts now 3 years.',
    },
  },
  {
    from: 2008, to: 2012,
    f: {
      era: 'Mid WNBA Era',
      salaryCap: 878_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      maxContractYears: 3, maxPlayerSalaryPct: 25, birdRights: false,
      draftRounds: 3, draftClassSize: 'Small', tradableDraftPickSeasons: 2,
      minRosterSize: 10, maxRosterSize: 12,
      note: 'Cap inches toward $900K. Growth largely flat. No luxury tax system.',
    },
  },
  {
    from: 2013, to: 2019,
    f: {
      era: 'Modern WNBA',
      salaryCap: 1_000_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 100, minPayroll: 0,
      luxuryTaxMultiplier: 1.0,
      maxContractYears: 4, maxPlayerSalaryPct: 30, birdRights: false,
      draftRounds: 3, draftClassSize: 'Normal', tradableDraftPickSeasons: 2,
      minRosterSize: 10, maxRosterSize: 12,
      note: 'Cap crosses $1M. Player activism pushes for better conditions. Max contracts now 4 years.',
    },
  },
  {
    from: 2020, to: 2024,
    f: {
      era: '2020 Landmark CBA',
      salaryCap: 1_800_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 100, minPayroll: 500_000,
      luxuryTaxMultiplier: 1.0,
      maxContractYears: 4, maxPlayerSalaryPct: 30, birdRights: true,
      draftRounds: 3, draftClassSize: 'Normal', tradableDraftPickSeasons: 3,
      minRosterSize: 11, maxRosterSize: 12,
      note: '2020 CBA: biggest pay jump in WNBA history at the time. Bird Rights introduced. Cap ~$1.8M.',
    },
  },
  {
    from: 2025, to: 2025,
    f: {
      era: '2025 Historic CBA',
      salaryCap: 2_200_000, luxuryTaxLine: 0, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 100, minPayroll: 800_000,
      luxuryTaxMultiplier: 1.0,
      maxContractYears: 5, maxPlayerSalaryPct: 30, birdRights: true,
      draftRounds: 3, draftClassSize: 'Normal', tradableDraftPickSeasons: 3,
      minRosterSize: 11, maxRosterSize: 12,
      note: 'January 2025 CBA: historic salary jump. Max 5-year deals. Team cap surges to ~$2.2M.',
    },
  },
  {
    from: 2026, to: 2099,
    f: {
      era: 'Future WNBA Projection',
      salaryCap: 7_000_000, luxuryTaxLine: 8_500_000, luxuryTaxThreshold: 0,
      rookieScaleContracts: true, tradeSalaryMatchPct: 110, minPayroll: 3_000_000,
      luxuryTaxMultiplier: 1.5,
      maxContractYears: 5, maxPlayerSalaryPct: 35, birdRights: true,
      draftRounds: 3, draftClassSize: 'Normal', tradableDraftPickSeasons: 4,
      minRosterSize: 11, maxRosterSize: 12,
      note: 'Projected from 2026 CBA negotiations. Major growth expected as WNBA viewership surges.',
    },
  },
];

export const getWNBAHistoricalFinancials = (year: number): HistoricalFinancials => {
  const entry = WNBA_ERA_TABLE.find(e => year >= e.from && year <= e.to);
  return entry ? entry.f : WNBA_ERA_TABLE[WNBA_ERA_TABLE.length - 1].f;
};

/** Returns the historically-correct WNBA active roster limits for a given year. */
export const getWNBARosterRules = (year: number): { minRosterSize: number; maxRosterSize: number } => {
  const h = getWNBAHistoricalFinancials(year);
  return {
    minRosterSize: h.minRosterSize ?? (year >= 2020 ? 11 : 10),
    maxRosterSize: h.maxRosterSize ?? 12,
  };
};

/**
 * Returns the maximum individual player salary for a given year and gender.
 * Used by the LeagueConfiguration banner and settings validation.
 */
export const getEraMaxPlayerSalary = (year: number, isWomens: boolean, salaryCap: number): number => {
  if (isWomens) {
    const h = getWNBAHistoricalFinancials(year);
    const pct = h.maxPlayerSalaryPct ?? 30;
    return Math.round((salaryCap * pct) / 5_000) * 5_000;
  }
  return computeMensMarketSalary(99, year);
};
