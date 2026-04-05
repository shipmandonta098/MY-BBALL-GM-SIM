import { Team, Position, Player, Conference, Division, MarketSize, PersonalityTrait, PlayerTendencies, ScheduleGame, Prospect, DraftPick, Coach, CoachScheme, CoachBadge, OwnerGoal, Gender, CoachRole, TeamRotation } from './types';

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
  type Base = {
    pullUpThree: number; postUp: number; driveToBasket: number; midRangeJumper: number;
    kickOutPasser: number; isoHeavy: number; transitionHunter: number;
    spotUp: number; cutter: number; offScreen: number;
    attackCloseOuts: number; drawFoul: number; dribbleHandOff: number; pullUpOffPnr: number;
    gambles: number; helpDefender: number; physicality: number; faceUpGuard: number;
    onBallPest: number; denyThePass: number; shotContestDiscipline: number;
    clutchShotTaker: number;
    rollVsPop?: number; // PF/C only
  };
  const baseMap: Record<Position, Base> = {
    PG: { pullUpThree: 78, postUp: 20, driveToBasket: 74, midRangeJumper: 62, kickOutPasser: 68, isoHeavy: 65, transitionHunter: 74,
          spotUp: 58, cutter: 57, offScreen: 58, attackCloseOuts: 80, drawFoul: 65, dribbleHandOff: 55, pullUpOffPnr: 80,
          gambles: 50, helpDefender: 65, physicality: 40, faceUpGuard: 60,
          onBallPest: 62, denyThePass: 60, shotContestDiscipline: 62, clutchShotTaker: 58 },
    SG: { pullUpThree: 85, postUp: 35, driveToBasket: 68, midRangeJumper: 72, kickOutPasser: 42, isoHeavy: 82, transitionHunter: 60,
          spotUp: 87, cutter: 52, offScreen: 74, attackCloseOuts: 82, drawFoul: 65, dribbleHandOff: 50, pullUpOffPnr: 78,
          gambles: 55, helpDefender: 55, physicality: 50, faceUpGuard: 65,
          onBallPest: 62, denyThePass: 65, shotContestDiscipline: 62, clutchShotTaker: 62 },
    SF: { pullUpThree: 72, postUp: 50, driveToBasket: 63, midRangeJumper: 73, kickOutPasser: 48, isoHeavy: 75, transitionHunter: 53,
          spotUp: 72, cutter: 62, offScreen: 60, attackCloseOuts: 80, drawFoul: 65, dribbleHandOff: 45, pullUpOffPnr: 65,
          gambles: 50, helpDefender: 60, physicality: 60, faceUpGuard: 55,
          onBallPest: 57, denyThePass: 60, shotContestDiscipline: 67, clutchShotTaker: 58 },
    PF: { pullUpThree: 35, postUp: 70, driveToBasket: 45, midRangeJumper: 55, kickOutPasser: 40, isoHeavy: 45, transitionHunter: 35,
          spotUp: 42, cutter: 65, offScreen: 32, attackCloseOuts: 52, drawFoul: 62, dribbleHandOff: 47, pullUpOffPnr: 32,
          gambles: 45, helpDefender: 70, physicality: 75, faceUpGuard: 45,
          onBallPest: 47, denyThePass: 50, shotContestDiscipline: 67, clutchShotTaker: 50,
          rollVsPop: 50 },
    C:  { pullUpThree: 15, postUp: 85, driveToBasket: 35, midRangeJumper: 40, kickOutPasser: 30, isoHeavy: 40, transitionHunter: 25,
          spotUp: 27, cutter: 70, offScreen: 20, attackCloseOuts: 37, drawFoul: 62, dribbleHandOff: 55, pullUpOffPnr: 20,
          gambles: 40, helpDefender: 80, physicality: 85, faceUpGuard: 30,
          onBallPest: 37, denyThePass: 40, shotContestDiscipline: 72, clutchShotTaker: 50,
          rollVsPop: 60 },
  };
  const b = baseMap[pos];
  const rand = (base: number) => Math.min(100, Math.max(0, base + Math.floor(Math.random() * 21) - 10));

  let off: PlayerTendencies['offensiveTendencies'] = {
    pullUpThree:      rand(b.pullUpThree),
    postUp:           rand(b.postUp),
    driveToBasket:    rand(b.driveToBasket),
    midRangeJumper:   rand(b.midRangeJumper),
    kickOutPasser:    rand(b.kickOutPasser),
    isoHeavy:         rand(b.isoHeavy),
    transitionHunter: rand(b.transitionHunter),
    spotUp:           rand(b.spotUp),
    cutter:           rand(b.cutter),
    offScreen:        rand(b.offScreen),
    attackCloseOuts:  rand(b.attackCloseOuts),
    drawFoul:         rand(b.drawFoul),
    dribbleHandOff:   rand(b.dribbleHandOff),
    pullUpOffPnr:     rand(b.pullUpOffPnr),
    ...(b.rollVsPop !== undefined ? { rollVsPop: rand(b.rollVsPop) } : {}),
  };
  let def: PlayerTendencies['defensiveTendencies'] = {
    gambles:               rand(b.gambles),
    helpDefender:          rand(b.helpDefender),
    physicality:           rand(b.physicality),
    faceUpGuard:           rand(b.faceUpGuard),
    onBallPest:            rand(b.onBallPest),
    denyThePass:           rand(b.denyThePass),
    shotContestDiscipline: rand(b.shotContestDiscipline),
  };
  let sit: PlayerTendencies['situationalTendencies'] = {
    clutchShotTaker: rand(b.clutchShotTaker),
  };

  // ── Existing personality trait modifiers (unchanged) ─────────────────────
  if (traits.includes('Lazy'))                 { off.isoHeavy        = Math.min(100, off.isoHeavy        + 15); def.gambles      = Math.max(0,   def.gambles      - 10); }
  if (traits.includes('Workhorse'))            { off.driveToBasket   = Math.min(100, off.driveToBasket   + 10); def.helpDefender = Math.min(100, def.helpDefender  + 10); }
  if (traits.includes('Leader'))               { off.kickOutPasser   = Math.min(100, off.kickOutPasser   + 15); off.isoHeavy     = Math.max(0,   off.isoHeavy     - 10); }
  if (traits.includes('Friendly/Team First'))  { off.kickOutPasser   = Math.min(100, off.kickOutPasser   + 12); def.helpDefender = Math.min(100, def.helpDefender  + 12); }
  if (traits.includes('Diva/Star'))            { off.isoHeavy        = Math.min(100, off.isoHeavy        + 20); off.kickOutPasser = Math.max(0,  off.kickOutPasser - 15); }
  if (traits.includes('Tough/Alpha'))          { def.physicality     = Math.min(100, def.physicality     + 15); def.gambles      = Math.min(100, def.gambles      + 10); }
  if (traits.includes('Hot Head'))             { def.gambles         = Math.min(100, def.gambles         + 15); off.isoHeavy     = Math.min(100, off.isoHeavy     + 10); }
  if (traits.includes('Professional'))         { off.midRangeJumper  = Math.min(100, off.midRangeJumper  + 10); def.helpDefender = Math.min(100, def.helpDefender + 10); }
  if (traits.includes('Gym Rat'))              { off.driveToBasket   = Math.min(100, off.driveToBasket   + 10); def.helpDefender = Math.min(100, def.helpDefender + 10); }
  if (traits.includes('Streaky'))              { off.pullUpThree     = Math.min(100, off.pullUpThree     + 12); off.midRangeJumper = Math.min(100, off.midRangeJumper + 8); }

  // ── New personality modifiers ─────────────────────────────────────────────
  const clamp = (v: number) => Math.min(100, Math.max(0, v));

  if (traits.includes('Lazy')) {
    off.spotUp         = clamp(off.spotUp         - 10);
    off.cutter         = clamp(off.cutter         - 15);
    off.offScreen      = clamp(off.offScreen       - 10);
    def.onBallPest     = clamp(def.onBallPest      - 20);
    def.denyThePass    = clamp(def.denyThePass     - 15);
    off.drawFoul       = clamp(off.drawFoul        - 10);
  }
  if (traits.includes('Workhorse')) {
    def.onBallPest     = clamp(def.onBallPest      + 15);
    def.denyThePass    = clamp(def.denyThePass     + 12);
    off.cutter         = clamp(off.cutter          + 10);
    off.attackCloseOuts= clamp(off.attackCloseOuts + 10);
    off.drawFoul       = clamp(off.drawFoul        +  8);
  }
  if (traits.includes('Diva/Star')) {
    sit.clutchShotTaker= clamp(sit.clutchShotTaker + 20);
    off.spotUp         = clamp(off.spotUp          - 15);
    off.cutter         = clamp(off.cutter          - 15);
    def.denyThePass    = clamp(def.denyThePass     - 10);
  }
  if (traits.includes('Leader')) {
    off.kickOutPasser  = clamp(off.kickOutPasser   + 10); // already bumped, stack intentional
    off.cutter         = clamp(off.cutter          +  8);
    def.denyThePass    = clamp(def.denyThePass     +  8);
    sit.clutchShotTaker= clamp(sit.clutchShotTaker + 10);
    def.onBallPest     = clamp(def.onBallPest      +  5);
  }
  if (traits.includes('Hot Head')) {
    def.shotContestDiscipline = clamp(def.shotContestDiscipline - 25);
    def.onBallPest     = clamp(def.onBallPest      + 15);
    sit.clutchShotTaker= clamp(sit.clutchShotTaker + 15);
  }
  if (traits.includes('Professional')) {
    def.shotContestDiscipline = clamp(def.shotContestDiscipline + 20);
    def.faceUpGuard    = clamp(def.faceUpGuard     + 10);
    def.onBallPest     = clamp(def.onBallPest      +  8);
    def.denyThePass    = clamp(def.denyThePass     + 10);
    def.gambles        = clamp(def.gambles         - 15);
    off.isoHeavy       = clamp(off.isoHeavy        - 10);
    sit.clutchShotTaker= clamp(sit.clutchShotTaker +  5);
  }
  if (traits.includes('Streaky')) {
    sit.clutchShotTaker= clamp(sit.clutchShotTaker + 15);
    off.spotUp         = clamp(off.spotUp          + 10);
    // pullUpThree already boosted above
  }
  if (traits.includes('Gym Rat')) {
    def.onBallPest     = clamp(def.onBallPest      + 10);
    def.denyThePass    = clamp(def.denyThePass     + 10);
    def.shotContestDiscipline = clamp(def.shotContestDiscipline + 10);
    off.attackCloseOuts= clamp(off.attackCloseOuts + 10);
    off.cutter         = clamp(off.cutter          +  8);
  }

  return { offensiveTendencies: off, defensiveTendencies: def, situationalTendencies: sit };
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
  PG: { blocks: 55, interiorDef: 58, offReb: 52, defReb: 65, postScoring: 60, strength: 68 },
  SG: { blocks: 62, interiorDef: 65, offReb: 58, defReb: 68, postScoring: 65, strength: 72 },
  SF: { blocks: 75, interiorDef: 78, offReb: 74, defReb: 78, shooting3pt: 92, strength: 80 },
  PF: { shooting3pt: 82, ballHandling: 74, speed: 80, perimeterDef: 78, passing: 75 },
  C:  { shooting3pt: 72, ballHandling: 68, speed: 72, perimeterDef: 70, passing: 68 },
};
export const POSITION_HARD_FLOORS: Record<Position, AttrBounds> = {
  PG: { ballHandling: 78, speed: 80, passing: 75, perimeterDef: 72, shooting3pt: 75 },
  SG: { shooting3pt: 76, speed: 76, perimeterDef: 74, ballHandling: 70 },
  SF: { speed: 60, perimeterDef: 72, athleticism: 76 },
  PF: { strength: 78, interiorDef: 76, offReb: 72, defReb: 75 },
  C:  { strength: 82, interiorDef: 80, offReb: 76, defReb: 78, blocks: 76, postScoring: 76 },
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

export const generatePlayer = (id: string, ageRange: [number, number] = [19, 38], genderRatio: number = 0, draftCtx?: DraftContext, leagueYear?: number, minRating = 68): Player => {
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
  // Shifted distribution — avg ~78, producing realistic NBA-caliber league quality
  let baseRating = rand > 0.97 ? 91 + Math.floor(Math.random() * 8)  // 3%: 91–98 (stars)
                 : rand > 0.83 ? 83 + Math.floor(Math.random() * 9)  // 14%: 83–91 (good starters)
                 : rand > 0.45 ? 76 + Math.floor(Math.random() * 8)  // 38%: 76–83 (starters/rotation)
                               : 68 + Math.floor(Math.random() * 9); // 45%: 68–76 (role players)
  const rating = Math.min(99, Math.max(minRating, baseRating));
  const potential = Math.min(99, rating + Math.floor(Math.random() * 12));
  const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
  const age = Math.floor(Math.random() * (ageRange[1] - ageRange[0]) + ageRange[0]);
  const _leagueYear = leagueYear ?? new Date().getFullYear();
  
  const f = region.flavor;
  const getRandomAttr = (base: number, flavor: number = 0) => 
    Math.min(99, Math.max(25, Math.floor(base + flavor + (Math.random() * 20 - 10))));
  const playerHometown = region.hometowns[Math.floor(Math.random() * region.hometowns.length)];
  const physGender = gender === 'Female' ? 'Female' : 'Male';
  const phys = genPhysical(pos, physGender);
  const posRanges = POS_ATTR_RANGES[pos];
  const clampPos = (val: number, key: PosAttrRangeKey) => { const [lo, hi] = posRanges[key]; return Math.min(Math.min(99, hi), Math.max(lo, val)); };
  const rawAttrs: AttrMap = {
    shooting:    clampPos(rating + f.shooting,     'shooting'),
    defense:     clampPos(rating,                  'defense'),
    rebounding:  clampPos(rating,                  'rebounding'),
    playmaking:  clampPos(rating + f.passing,      'playmaking'),
    athleticism: clampPos(rating + f.athleticism,  'athleticism'),
    layups: getRandomAttr(rating),
    dunks: getRandomAttr(rating, f.athleticism),
    shootingMid: getRandomAttr(rating, f.shooting),
    shooting3pt: getRandomAttr(rating, f.shooting),
    freeThrow: getRandomAttr(rating, f.shooting),
    speed: getRandomAttr(rating, f.athleticism),
    strength: getRandomAttr(rating, f.athleticism),
    jumping: getRandomAttr(rating, f.athleticism),
    stamina: getRandomAttr(rating),
    perimeterDef: getRandomAttr(rating),
    interiorDef: getRandomAttr(rating),
    steals: getRandomAttr(rating),
    blocks: getRandomAttr(rating),
    defensiveIQ: getRandomAttr(rating, f.iq),
    ballHandling: getRandomAttr(rating, f.passing),
    passing: getRandomAttr(rating, f.passing),
    offensiveIQ: getRandomAttr(rating, f.iq),
    postScoring: getRandomAttr(rating),
    offReb: getRandomAttr(rating),
    defReb: getRandomAttr(rating),
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
    salary: Math.round((
      rating >= 95 ? 38_000_000 + (rating - 95) * 1_400_000 :
      rating >= 88 ? 26_000_000 + (rating - 88) * 1_714_286 :
      rating >= 80 ? 16_000_000 + (rating - 80) * 1_250_000 :
      rating >= 70 ? 7_000_000  + (rating - 70) * 900_000   :
      rating >= 60 ? 3_000_000  + (rating - 60) * 400_000   : 1_500_000
    ) * (0.85 + Math.random() * 0.30) / 250_000) * 250_000,
    contractYears: Math.floor(Math.random() * 5) + 1,
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
    archetype: assignArchetype(pos, pAttrs as Record<string, number>, rating),
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
    // Skew OVR distribution: 90% → 70–82, 8% → 83–87, 2% → 88–92, none 93+
    const tierRoll = Math.random();
    const [tierMin, tierMax] = tierRoll < 0.90 ? [70, 82] : tierRoll < 0.98 ? [83, 87] : [88, 92];
    const skewedRating = Math.min(tierMax, Math.max(tierMin, p.rating));
    const skewedPlayer = skewedRating !== p.rating ? { ...p, rating: skewedRating } : p;
    return {
      ...skewedPlayer,
      isFreeAgent: true,
      lastTeamId: undefined,
      contractYears: 0,
      desiredContract: {
        years: Math.floor(Math.random() * 3) + 1,
        salary: Math.round((
          skewedRating >= 95 ? 38_000_000 + (skewedRating - 95) * 1_400_000 :
          skewedRating >= 88 ? 26_000_000 + (skewedRating - 88) * 1_714_286 :
          skewedRating >= 80 ? 16_000_000 + (skewedRating - 80) * 1_250_000 :
          skewedRating >= 70 ? 7_000_000  + (skewedRating - 70) * 900_000   :
          skewedRating >= 60 ? 3_000_000  + (skewedRating - 60) * 400_000   : 1_500_000
        ) * (0.90 + Math.random() * 0.20) / 250_000) * 250_000
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
    
    let rating = 60 + Math.floor(Math.random() * 15);
    if (i < 5) rating = 78 + Math.floor(Math.random() * 5); 
    else if (i < 15) rating = 72 + Math.floor(Math.random() * 6); 
    
    const potential = Math.min(99, rating + Math.floor(Math.random() * 20) + 5);
    
    // Apply regional flavor
    const f = region.flavor;
    const getRandomAttr = (base: number, flavor: number = 0) => 
      Math.min(99, Math.max(25, Math.floor(base + flavor + (Math.random() * 25 - 12))));
    const prospectHometown = region.hometowns[Math.floor(Math.random() * region.hometowns.length)];
    const physGender = gender === 'Female' ? 'Female' : 'Male';
    const phys = genPhysical(pos, physGender);
    const posRanges = POS_ATTR_RANGES[pos];
    const clampPos = (val: number, key: PosAttrRangeKey) => { const [lo, hi] = posRanges[key]; return Math.min(Math.min(99, hi), Math.max(lo, val)); };
    const rawAttrs: AttrMap = {
      shooting:    clampPos(rating + f.shooting,    'shooting'),
      defense:     clampPos(rating,                 'defense'),
      rebounding:  clampPos(rating,                 'rebounding'),
      playmaking:  clampPos(rating + f.passing,     'playmaking'),
      athleticism: clampPos(rating + f.athleticism, 'athleticism'),
      layups: getRandomAttr(rating),
      dunks: getRandomAttr(rating, f.athleticism),
      shootingMid: getRandomAttr(rating, f.shooting),
      shooting3pt: getRandomAttr(rating, f.shooting),
      freeThrow: getRandomAttr(rating, f.shooting),
      speed: getRandomAttr(rating, f.athleticism),
      strength: getRandomAttr(rating, f.athleticism),
      jumping: getRandomAttr(rating, f.athleticism),
      stamina: getRandomAttr(rating),
      perimeterDef: getRandomAttr(rating),
      interiorDef: getRandomAttr(rating),
      steals: getRandomAttr(rating),
      blocks: getRandomAttr(rating),
      defensiveIQ: getRandomAttr(rating, f.iq),
      ballHandling: getRandomAttr(rating, f.passing),
      passing: getRandomAttr(rating, f.passing),
      offensiveIQ: getRandomAttr(rating, f.iq),
      postScoring: getRandomAttr(rating),
      offReb: getRandomAttr(rating),
      defReb: getRandomAttr(rating),
      durability: Math.min(99, Math.max(20, Math.floor(55 + (Math.random() * 60 - 15)))),
    };
    const pAttrs = applyPhysical(rawAttrs, pos, physGender, phys.heightIn, phys.weight);
    const bAttrsRaw = applyAttrBounds(pAttrs as Player['attributes'], pos, {
      heightBonus: phys.heightIn >= (HEIGHT_WEIGHT[pos]?.[physGender]?.avgH ?? 0) + 3 ? 5 : 0,
    });
    const bAttrs = gender === 'Female' ? applyFemaleAttrCaps(bAttrsRaw) : bAttrsRaw;
    const prospectTraits = getRandomTraits();

    const prospectAge = ageMin + Math.floor(Math.random() * (Math.max(ageMin, ageMax) - ageMin + 1));
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
      archetype: assignArchetype(pos, bAttrs as Record<string, number>, rating),
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
  // elite: full-roster avg ≈ 85–87  (2–4 per 30-team league)
  elite:      [96, 93, 90, 88, 87, 86, 85, 84, 83, 83, 82, 81, 80, 79],
  // solid: full-roster avg ≈ 82–84  (6–8 teams)
  solid:      [92, 89, 87, 85, 84, 83, 82, 81, 80, 80, 79, 78, 77, 76],
  // average: full-roster avg ≈ 78–80 (bulk of the league)
  average:    [87, 84, 82, 80, 80, 79, 78, 77, 76, 76, 75, 74, 74, 74],
  // rebuilding: full-roster avg ≈ 75–77 (floor teams; normalizeOVRs lifts to 76 min)
  rebuilding: [84, 81, 79, 77, 77, 76, 75, 74, 74, 73, 73, 72, 71, 71],
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
      { round: 1, pick: 0, originalTeamId: teamId, currentTeamId: teamId },
      { round: 2, pick: 0, originalTeamId: teamId, currentTeamId: teamId },
      ...futurePicks,
    ];

    const ownerGoals: OwnerGoal[] = ['Win Now', 'Rebuild', 'Profit'];
    const draftCtx: DraftContext = { season, teamNames, usedPicks };
    const tier = (tierList[i] ?? 'average') as keyof typeof TIER_SLOT_FLOORS;
    const slotFloors = TIER_SLOT_FLOORS[tier];
    const roster = Array.from({ length: 14 }).map((_, j) =>
      generatePlayer(`p-${i}-${j}`, [19, 38], genderRatio, draftCtx, season, slotFloors[j] ?? 68)
    );

    return {
      id: teamId,
      name: data.name,
      city: data.city,
      roster,
      staff: {
        headCoach: generateCoach(`coach-${teamId}-hc`, 'B', genderRatio, season),
        assistantOffense: generateCoach(`coach-${teamId}-off`, 'C', genderRatio, season),
        assistantDefense: generateCoach(`coach-${teamId}-def`, 'C', genderRatio, season),
        assistantDev: generateCoach(`coach-${teamId}-dev`, 'C', genderRatio, season),
        trainer: generateCoach(`coach-${teamId}-tr`, 'C', genderRatio, season)
      },
      staffBudget: 15000000,
      activeScheme: 'Balanced',
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
        count = 1;
      }
      for (let c = 0; c < count; c++) {
        if (teamGamesCountTotal[t1.id] < numGames && teamGamesCountTotal[t2.id] < numGames) {
          addGameToPool(t1.id, t2.id);
        }
      }
    }
  }

  // Fill any remaining gaps (rounding edge cases) greedily
  const allTeamIds = teams.map(t => t.id);
  allTeamIds.forEach(id => {
    while (teamGamesCountTotal[id] < numGames) {
      const bestOpponent = allTeamIds
        .filter(oid => oid !== id && teamGamesCountTotal[oid] < numGames)
        .sort((a, b) => (pairings[id][a] || 0) - (pairings[id][b] || 0))[0];
      if (bestOpponent) addGameToPool(id, bestOpponent);
      else break;
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

      if (t1B2B && (teamB2BCount[t1] >= 20 || teamGamesScheduled[t1] - teamLastB2BGameIndex[t1] < 3)) continue;
      if (t2B2B && (teamB2BCount[t2] >= 20 || teamGamesScheduled[t2] - teamLastB2BGameIndex[t2] < 3)) continue;

      const roll = Math.random();
      const restT1 = t1B2B ? 1 : (roll < 0.3 ? 1 : 2);
      const restT2 = t2B2B ? 1 : (roll < 0.3 ? 1 : 2);

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
