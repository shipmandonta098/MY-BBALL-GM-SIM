import { Team, GameResult, Player, GamePlayerLine, CoachScheme, PlayByPlayEvent, InjuryType } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE_PACE = 100;
const BASE_PPP   = 1.12;
const SCORE_VARIANCE = 0.04;

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
  const finalProb = Math.max(0.05, Math.min(0.94, baseProb + shotModifier + defenseModifier));
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
): PlayByPlayEvent[] => {
  const events: PlayByPlayEvent[] = [];
  const rotation = offTeam.rotation
    ? [
        ...Object.values(offTeam.rotation.starters).map(id => offTeam.roster.find(p => p.id === id)!).filter(Boolean),
        ...offTeam.rotation.bench.slice(0, 3).map(id => offTeam.roster.find(p => p.id === id)!).filter(Boolean),
      ]
    : offTeam.roster.slice(0, 8);
  if (rotation.length === 0) return events;

  const sample = Math.round(possessions / 3);
  for (let i = 0; i < sample; i++) {
    const handler = rotation[Math.floor(Math.random() * rotation.length)];
    if (!handler) continue;
    const streak  = streakMap.get(handler.id) ?? 0;
    const poss    = simulatePossession(handler, defTeam, scheme, streak);

    streakMap.set(handler.id,
      poss.result === 'MADE'   ? Math.max(0, streak) + 1 :
      poss.result === 'MISSED' ? Math.min(0, streak) - 1 : 0);

    const mins = 12 - Math.floor((i / sample) * 12);
    const secs = Math.floor(Math.random() * 60);
    const time  = `${mins}:${String(secs).padStart(2, '0')}`;

    const evType: PlayByPlayEvent['type'] =
      poss.result === 'STEAL'      ? 'turnover' :
      poss.result === 'FOUL_DRAWN' ? 'foul'     :
      poss.result === 'MADE'       ? 'score'    : 'miss';

    events.push({ time, text: poss.pbpText, type: evType, quarter });

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
  return events;
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
): GamePlayerLine => {
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

  const threepm = Math.min(threepa, Math.round(threepa * (fgPct3   + (Math.random() * 0.06 - 0.03))));
  const midFgm  = Math.min(midFga,  Math.round(midFga  * (fgPctMid + (Math.random() * 0.06 - 0.03))));
  const insFgm  = Math.min(insFga,  Math.round(insFga  * (fgPctIns + (Math.random() * 0.06 - 0.03))));
  const fgm     = threepm + midFgm + insFgm;

  const fta = Math.round((player.attributes.strength / 100) * 5 * minFac + Math.random() * 2);
  const ftm = Math.round(fta * (player.attributes.freeThrow / 100));
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
  const homeRatings = calculateTeamRatings(home);
  const awayRatings = calculateTeamRatings(away);

  const getStaffBonus = (t: Team) => { const hc = t.staff.headCoach; return hc ? (hc.ratingOffense + hc.ratingDefense) / 100 : 0; };
  const leaderBonus   = (t: Team) => t.roster.filter(p => p.personalityTraits.includes('Leader')).length  * 0.25;
  const clutchBonus   = (t: Team) => t.roster.filter(p => p.personalityTraits.includes('Clutch')).length  * 0.15;
  const lazyPenalty   = (t: Team) => t.roster.filter(p => p.personalityTraits.includes('Lazy')).length    * 0.10;

  // Pace — scheme + tendency conflicts
  let pace = BASE_PACE;
  if (home.activeScheme === 'Pace and Space' || home.activeScheme === 'Showtime') pace += 4;
  if (away.activeScheme === 'Pace and Space' || away.activeScheme === 'Showtime') pace += 4;
  if (home.activeScheme === 'Grit and Grind') pace -= 5;
  if (away.activeScheme === 'Grit and Grind') pace -= 5;
  // Pace-system teams heavy on post-up players run slower
  if ((home.activeScheme === 'Pace and Space' || home.activeScheme === 'Showtime') &&
      home.roster.slice(0, 8).filter(p => (p.tendencies?.offensiveTendencies.postUp ?? 0) > 75).length >= 2) pace -= 5;
  if ((away.activeScheme === 'Pace and Space' || away.activeScheme === 'Showtime') &&
      away.roster.slice(0, 8).filter(p => (p.tendencies?.offensiveTendencies.postUp ?? 0) > 75).length >= 2) pace -= 5;

  pace += (Math.random() * 6 - 3);

  const calcPPP = (off: number, def: number, isB2B: boolean) => {
    let ppp = BASE_PPP + (off - def) / 100 * 0.5;
    if (isB2B) ppp *= 0.93;
    return ppp + (Math.random() * SCORE_VARIANCE * 2 - SCORE_VARIANCE);
  };

  const homePPP = calcPPP(homeRatings.off + getStaffBonus(home) + leaderBonus(home) + clutchBonus(home) - lazyPenalty(home), awayRatings.def + getStaffBonus(away), homeB2B);
  const awayPPP = calcPPP(awayRatings.off + getStaffBonus(away) + leaderBonus(away) + clutchBonus(away) - lazyPenalty(away), homeRatings.def + getStaffBonus(home), awayB2B);

  let totalHome = Math.max(85, Math.min(145, Math.round(pace * homePPP)));
  let totalAway = Math.max(85, Math.min(145, Math.round(pace * awayPPP)));

  // Player stat distribution
  const distributeToPlayers = (team: Team, totalPts: number) => {
    const roster      = team.roster;
    const totalRating = roster.reduce((acc, p) => acc + p.rating, 0);
    const teamFga     = Math.round(pace * 0.88);
    const teamReb     = Math.round(pace * 0.44);
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
      const usageShare = p.rating / totalRating;
      const line = simulatePlayerGameLine(p, totalPts, teamFga, teamReb, teamAst, mins, usageShare);
      return { ...line, techs: 0, flagrants: 0, ejected: false };
    });
  };

  let homePlayerStats = distributeToPlayers(home, totalHome);
  let awayPlayerStats = distributeToPlayers(away, totalAway);

  totalHome = homePlayerStats.reduce((s, p) => s + p.pts, 0);
  totalAway = awayPlayerStats.reduce((s, p) => s + p.pts, 0);

  // ── Tendency-driven Play-by-Play ─────────────────────────────────────────
  const pbp: PlayByPlayEvent[] = [
    { time: '12:00', text: 'Game Tip-off', type: 'info', quarter: 1 },
  ];
  const homeScheme  = home.activeScheme ?? 'Balanced';
  const awayScheme  = away.activeScheme ?? 'Balanced';
  const homeStreaks  = new Map<string, number>();
  const awayStreaks  = new Map<string, number>();
  const qPoss       = Math.round(pace / 4);

  for (let q = 1; q <= 4; q++) {
    const hev = generateQuarterPBP(home, away, q, qPoss, homeScheme, homeStreaks);
    const aev = generateQuarterPBP(away, home, q, qPoss, awayScheme, awayStreaks);

    const combined = [...hev, ...aev].sort((a, b) => {
      const parse = (t: string) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
      return parse(b.time) - parse(a.time);
    });
    pbp.push(...combined);

    if (q === 2) {
      const hH = homePlayerStats.reduce((s, p) => s + Math.round(p.pts * 0.48), 0);
      const aH = awayPlayerStats.reduce((s, p) => s + Math.round(p.pts * 0.48), 0);
      pbp.push({ time: '0:00', text: `Halftime: ${home.name} ${hH} - ${away.name} ${aH}`, type: 'info', quarter: 2 });
    }
  }

  // Chippy / tech rolls
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

  // Injury rolls
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

  // Overtime
  let isOvertime = false;
  if (Math.abs(totalHome - totalAway) < 1) {
    isOvertime = true;
    totalHome += Math.floor(Math.random() * 12) + 2;
    totalAway += Math.floor(Math.random() * 12) + 2;
    if (totalHome === totalAway) totalHome += 1;
    pbp.push({ time: '5:00', text: 'OVERTIME!', type: 'info', quarter: 5 });
  }

  const distributeScore = (total: number) => {
    const q1 = Math.floor(total * 0.23 + Math.random() * 4);
    const q2 = Math.floor(total * 0.25 + Math.random() * 4);
    const q3 = Math.floor(total * 0.24 + Math.random() * 4);
    return [q1, q2, q3, total - (q1 + q2 + q3)];
  };
  const homeQ = distributeScore(totalHome);
  const awayQ = distributeScore(totalAway);

  const isBuzzerBeater = Math.abs(totalHome - totalAway) <= 2 && Math.random() < 0.3;
  const isComeback =
    (homeQ[0] + homeQ[1] < awayQ[0] + awayQ[1] - 15 && totalHome > totalAway) ||
    (awayQ[0] + awayQ[1] < homeQ[0] + homeQ[1] - 15 && totalAway > totalHome);

  if (isBuzzerBeater) pbp.push({ time: '0:01', text: 'BUZZER BEATER! The crowd erupts!', type: 'score', quarter: 4 });
  pbp.push({ time: '0:00', text: 'Final Buzzer', type: 'info', quarter: 4 });

  const margin = totalHome - totalAway;
  homePlayerStats = homePlayerStats.map(p => ({ ...p, plusMinus: margin }));
  awayPlayerStats = awayPlayerStats.map(p => ({ ...p, plusMinus: -margin }));

  const allLines = [...homePlayerStats, ...awayPlayerStats].sort((a, b) => b.pts - a.pts);

  return {
    id: `game-${date}-${home.id}-${away.id}`,
    homeTeamId:   home.id,
    awayTeamId:   away.id,
    homeScore:    totalHome,
    awayScore:    totalAway,
    quarterScores: { home: homeQ, away: awayQ },
    homePlayerStats,
    awayPlayerStats,
    topPerformers: allLines.slice(0, 3).map(l => ({ playerId: l.playerId, points: l.pts, rebounds: l.reb, assists: l.ast })),
    playByPlay: pbp,
    date, season, isOvertime, isBuzzerBeater, isComeback, isChippy, gameInjuries,
  };
};

