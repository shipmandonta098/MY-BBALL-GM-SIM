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
    const pool: { value: OffAction; weight: number }[] = [
      { value: 'ISO',        weight: tendencyWeight(ot?.isoHeavy      ?? 50) },
      { value: 'POST_UP',    weight: tendencyWeight(ot?.postUp        ?? 50) },
      { value: 'DRIVE',      weight: tendencyWeight(ot?.driveToBasket ?? 50) },
      { value: 'PASS_FIRST', weight: tendencyWeight(ot?.kickOutPasser ?? 50) },
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
        const sp: { value: ShotType; weight: number }[] = [
          { value: 'DRIVE_LAYUP', weight: tendencyWeight(ot?.driveToBasket ?? 50) },
          { value: 'MID_RANGE',   weight: 0.8 },
          { value: 'PULL_UP_3',   weight: tendencyWeight(ot?.pullUpThree ?? 50) * 0.5 },
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
      baseProb      = offHandler.attributes.shooting3pt / 100 * 0.37 + 0.18;
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
      baseProb      = offHandler.attributes.shootingInside / 100 * 0.40 + 0.38;
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
      baseProb      = offHandler.attributes.shooting3pt / 100 * 0.38 + 0.20;
      tendencyUsed  = 'kickOutPasser';
      tendencyScore = ot?.kickOutPasser ?? 50;
      shotModifier  = +0.04;
      pbpBase = offAction === 'PASS_FIRST'
        ? `${ln} swings it and finds the open man in the corner...`
        : `${ln} kicks it out to the shooter...`;
      break;
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
          stolenBy: defender?.name, isTransition,
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
          foulsOn: defender?.name, isTransition,
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

    // Face-up guard
    if (faceUp >= 70 && (shotType === 'PULL_UP_3' || shotType === 'CATCH_AND_SHOOT_3')) {
      defenseModifier -= 0.06;
      if (!defTendencyUsed) defTendencyUsed = 'faceUpGuard';
    } else if (faceUp < 40 && shotType === 'CATCH_AND_SHOOT_3') {
      defenseModifier += 0.08;
      pbpDefPrefix = `${defLn} gets caught ball-watching — `;
      if (!defTendencyUsed) defTendencyUsed = 'faceUpGuardAbsent';
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
    isTransition, pbpText: fullText,
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
    insideBoost:  (( ot?.driveToBasket  ?? 50) - 50) / 100 * 0.30,
    usageBoost:   (( ot?.isoHeavy       ?? 50) - 50) / 100 * 0.15 - ((ot?.kickOutPasser ?? 50) - 50) / 100 * 0.12,
    astBoost:     (( ot?.kickOutPasser  ?? 50) - 50) / 100 * 0.35,
    stlBoost:     (( dt?.gambles        ?? 50) - 50) / 100 * 0.30,
    foulRisk:     (( dt?.physicality    ?? 50) - 50) / 100 * 0.25 + ((dt?.gambles ?? 50) - 50) / 100 * 0.15,
  };
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

    events.push({ time, text: finalPbpText, type: evType, quarter });

    // ── BUG 2 & 3 FIX: Putback sequence — missed shot MUST precede putback ──
    // After any missed field goal: roll for offensive rebound.
    // If OReb: push the rebound event THEN the putback attempt (made or missed).
    // The rebounder and putback scorer are the same player.
    // Putback does NOT earn an assist. It IS an offensive rebound.
    if (poss.result === 'MISSED' && Math.random() < 0.12) {
      // Prefer big men (high offReb + shootingInside); exclude the original missed shooter.
      const rebCandidates = rotation.filter(p =>
        p.id !== handler.id && (p.attributes.shootingInside ?? 40) >= 40);
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

        // Step 3: Putback attempt — success rate = (offReb × 0.4 + shootingInside × 0.6) / 100
        const putbackChance = (
          (rebounder.attributes.offReb ?? 50) * 0.4 +
          (rebounder.attributes.shootingInside ?? 50) * 0.6
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
  varRoll = 0,   // game-level variance from tip-off roll (±15–25)
  ftBonus = 0,   // home court FT advantage (+0.03)
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
    (player.attributes.shootingInside / 100) * 0.3 + tm.insideBoost));
  const insFga  = Math.round(fga * insideShare);
  const midFga  = Math.max(0, fga - threepa - insFga);

  const fgPct3  = player.attributes.shooting3pt    / 100 * 0.36 + 0.16;
  const fgPctMid= player.attributes.shootingMid    / 100 * 0.42 + 0.26;
  const fgPctIns= (player.attributes.shootingInside / 100 * 0.40 + player.attributes.postScoring / 100 * 0.38) / 2 + 0.30;

  const threepm = Math.min(threepa, Math.round(threepa * Math.max(0.05, fgPct3   + fgPctBoost + (Math.random() * 0.06 - 0.03))));
  const midFgm  = Math.min(midFga,  Math.round(midFga  * Math.max(0.05, fgPctMid + fgPctBoost + (Math.random() * 0.06 - 0.03))));
  const insFgm  = Math.min(insFga,  Math.round(insFga  * Math.max(0.05, fgPctIns + fgPctBoost + (Math.random() * 0.06 - 0.03))));
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
      const line = simulatePlayerGameLine(p, totalPts, teamFga, teamReb, teamAst, mins, usageShare, varRoll, ftBonus);
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


