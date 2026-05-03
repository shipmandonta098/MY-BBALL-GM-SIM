import { LeagueState, Player } from '../types';

export type OffseasonLetterGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

const GRADE_THRESHOLDS: [number, OffseasonLetterGrade][] = [
  [93, 'A+'], [87, 'A'], [80, 'A-'],
  [73, 'B+'], [66, 'B'], [59, 'B-'],
  [52, 'C+'], [45, 'C'], [38, 'C-'],
  [28, 'D'],  [0,  'F'],
];

export const APPROVAL_BY_GRADE: Record<OffseasonLetterGrade, number> = {
  'A+': 18, 'A': 14, 'A-': 10, 'B+': 7, 'B': 3, 'B-': 0,
  'C+': -4, 'C': -8, 'C-': -12, 'D': -16, 'F': -20,
};

function scoreToGrade(score: number): OffseasonLetterGrade {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return 'F';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface CategoryScore {
  label: string;
  grade: OffseasonLetterGrade;
  score: number;
  comment: string;
}

export interface OffseasonGradeData {
  season: number;
  grade: OffseasonLetterGrade;
  ownerQuote: string;
  categories: CategoryScore[];
  ownerApprovalChange: number;
  ownerApprovalBefore: number;
  ownerApprovalAfter: number;
  isWomensLeague: boolean;
}

export interface DraftGradeData {
  season: number;
  grade: OffseasonLetterGrade;
  ownerQuote: string;
  topPickName?: string;
  topPickPosition?: string;
  topPickRating?: number;
  classStrength: 'Strong' | 'Average' | 'Weak';
  userPicksCount: number;
  ownerApprovalChange: number;
  ownerApprovalBefore: number;
  ownerApprovalAfter: number;
  isWomensLeague: boolean;
}

// ── Category helpers ──────────────────────────────────────────────────────────

function calcFAMovesScore(
  userTeam: import('../types').Team,
  league: LeagueState,
  isWomens: boolean,
): { score: number; comment: string } {
  const salaryCap = league.settings.salaryCap || 140_000_000;

  // Recent signing transactions for this team
  const userSignings = league.transactions
    .filter(t => t.type === 'signing' && t.teamIds.includes(userTeam.id))
    .sort((a, b) => b.realTimestamp - a.realTimestamp)
    .slice(0, 20);

  const rosterById = new Map(userTeam.roster.map(p => [p.id, p]));
  const signedPlayers: Player[] = [];
  for (const txn of userSignings) {
    for (const pid of (txn.playerIds ?? [])) {
      const p = rosterById.get(pid);
      if (p) signedPlayers.push(p);
    }
  }
  const uniqueSigned = [...new Map(signedPlayers.map(p => [p.id, p])).values()];
  const count = uniqueSigned.length;

  if (count === 0) {
    return {
      score: 28,
      comment: 'Minimal free agency activity this offseason.',
    };
  }

  const avgOVR = uniqueSigned.reduce((s, p) => s + p.rating, 0) / count;
  const topSigned = [...uniqueSigned].sort((a, b) => b.rating - a.rating)[0];

  let score =
    avgOVR >= 87 ? 92 :
    avgOVR >= 82 ? 82 :
    avgOVR >= 76 ? 68 :
    avgOVR >= 70 ? 52 :
    35;

  if (count >= 5) score += 8;
  else if (count >= 3) score += 4;
  else if (count === 1) score -= 8;

  // Penalise overpay: salary > 1.25× market rate for the player's OVR
  const overpaidCount = uniqueSigned.filter(p => {
    const fair =
      p.rating >= 87 ? 0.22 * salaryCap :
      p.rating >= 82 ? 0.14 * salaryCap :
      p.rating >= 76 ? 0.09 * salaryCap :
                       0.05 * salaryCap;
    return (p.salary || 0) > fair * 1.25;
  }).length;
  score -= overpaidCount * 8;

  score = clamp(score, 15, 100);

  const qualityLabel =
    avgOVR >= 85 ? 'star-level' :
    avgOVR >= 78 ? 'quality starter' :
    avgOVR >= 72 ? 'solid rotation' : 'depth';

  let comment =
    score >= 85 ? `Landed ${count} player${count > 1 ? 's' : ''} including ${topSigned.name} (${topSigned.rating} OVR). Elite class.` :
    score >= 70 ? `Signed ${count} ${qualityLabel} piece${count > 1 ? 's' : ''}, headlined by ${topSigned.name}. Solid work.` :
    score >= 55 ? `Mixed results. ${count} signing${count > 1 ? 's' : ''} with ${topSigned.name} the best addition.` :
    score >= 40 ? `Below-average haul. Overspent or missed higher-value targets.` :
                  `Little meaningful FA activity or poor value deals this offseason.`;

  return { score, comment };
}

function calcCapScore(
  userTeam: import('../types').Team,
  league: LeagueState,
  isWomens: boolean,
): { score: number; comment: string } {
  const salaryCap = league.settings.salaryCap || 140_000_000;
  const payroll = userTeam.roster.reduce((s, p) => s + (p.salary || 0), 0);
  const capPct = payroll / salaryCap;

  let score =
    capPct < 0.60 ? 60 :
    capPct < 0.80 ? 85 :
    capPct < 0.95 ? 72 :
    capPct < 1.00 ? 55 :
    capPct < 1.10 ? 38 :
                    20;

  const badContracts = userTeam.roster.filter(
    p => p.age >= 33 && p.contractYears >= 3 && (p.salary || 0) > 0.10 * salaryCap
  );
  score -= badContracts.length * 8;
  score = clamp(score, 10, 100);

  const payrollDisplay = isWomens
    ? `$${Math.round(payroll / 1_000)}k`
    : `$${(payroll / 1_000_000).toFixed(1)}M`;

  let comment =
    capPct > 1.10 ? `Payroll of ${payrollDisplay} is deep in luxury tax — ownership is not pleased.` :
    capPct > 1.00 ? `Over cap at ${payrollDisplay}. Tax implications loom this season.` :
    capPct > 0.90 ? `Near-cap payroll (${payrollDisplay}). Limited in-season flexibility.` :
    capPct > 0.60 ? `Well-managed payroll (${payrollDisplay}). Good flexibility going forward.` :
                    `Significant cap space unused (${payrollDisplay} committed). Could have been more aggressive.`;

  if (badContracts.length > 0) {
    comment += ` ${badContracts.length} aging veteran${badContracts.length > 1 ? 's' : ''} locked into costly long-term deals.`;
  }

  return { score, comment };
}

function calcRosterFitScore(
  userTeam: import('../types').Team,
): { score: number; comment: string } {
  const roster = userTeam.roster;
  const sorted = [...roster].sort((a, b) => b.rating - a.rating);
  const starters = sorted.slice(0, 5);
  const avgStarters = starters.length > 0
    ? starters.reduce((s, p) => s + p.rating, 0) / starters.length
    : 0;

  let score =
    avgStarters >= 84 ? 90 :
    avgStarters >= 79 ? 77 :
    avgStarters >= 74 ? 63 :
    avgStarters >= 69 ? 48 :
    32;

  const positions = new Set(roster.map(p => p.position));
  const covered = (['PG', 'SG', 'SF', 'PF', 'C'] as const).filter(pos => positions.has(pos)).length;
  score += (covered - 3) * 5;

  const bench = sorted.slice(5, 10);
  const avgBench = bench.length > 0
    ? bench.reduce((s, p) => s + p.rating, 0) / bench.length
    : 0;
  if (avgBench >= 74) score += 8;
  else if (avgBench >= 68) score += 3;
  else if (avgBench < 60 && bench.length > 0) score -= 5;

  score = clamp(score, 15, 100);

  const topPlayer = sorted[0];
  let comment =
    score >= 85 ? `Excellent construction. ${topPlayer?.name ?? 'Your star'} leads a balanced, deep lineup.` :
    score >= 70 ? `Solid starting lineup but bench depth could be stronger.` :
    score >= 55 ? `Functional roster with some gaps — positional needs remain.` :
                  `Significant roster deficiencies heading into the season.`;

  return { score, comment };
}

function calcAssetsScore(
  userTeam: import('../types').Team,
  league: LeagueState,
): { score: number; comment: string } {
  const currentSeason = league.season;

  const futureFirsts = (userTeam.picks || []).filter(
    p => p.round === 1 && (p.year ?? 0) >= currentSeason && (p.year ?? 0) <= currentSeason + 1
  ).length;

  let score =
    futureFirsts >= 2 ? 90 :
    futureFirsts === 1 ? 68 :
    38;

  const youngTalent = userTeam.roster.filter(p => p.age <= 23 && p.rating >= 72);
  score += Math.min(youngTalent.length * 6, 18);

  const futureSeconds = (userTeam.picks || []).filter(
    p => p.round === 2 && (p.year ?? 0) >= currentSeason && (p.year ?? 0) <= currentSeason + 1
  ).length;
  if (futureSeconds >= 2) score += 5;

  score = clamp(score, 15, 100);

  let comment =
    futureFirsts >= 2 ? `Strong draft capital — ${futureFirsts} first-round picks over the next two seasons.` :
    futureFirsts === 1 ? `One first-round pick preserved. Flexibility is limited but intact.` :
                         `No first-round picks in the next two seasons. Assets are thin.`;

  if (youngTalent.length >= 3) {
    comment += ` ${youngTalent.length} promising young players on the roster to develop.`;
  }

  return { score, comment };
}

// ── Owner quote bank ──────────────────────────────────────────────────────────

function buildOwnerQuote(
  grade: OffseasonLetterGrade,
  isWomens: boolean,
  faScore: number,
  capScore: number,
): string {
  const quotes: Record<string, string[]> = {
    elite: [
      `"Outstanding work. You added real talent, managed the budget smartly, and kept our future assets intact. I'm impressed — this franchise is in good hands."`,
      `"This is exactly the kind of offseason I expect from a top executive. Smart money, better players, real competition. Well done."`,
      `"Best offseason moves I've seen from this front office. The roster is more competitive than I could have hoped for."`,
    ],
    good: [
      `"Solid work this offseason. You improved the roster and managed the cap responsibly. I'm feeling good about where we are."`,
      `"Good additions and reasonable contracts. We didn't land every target, but this team is noticeably more competitive."`,
      `"I like the direction. You addressed our needs without mortgaging the future. Let's see how it plays out."`,
    ],
    average: [
      `"Mixed bag, honestly. Some smart moves, some questionable ones. The roster improved, but I expected bolder action."`,
      `"Mediocre offseason. We got some depth but missed the bigger names. I need better decision-making going forward."`,
      `"Not what I was hoping for. We spent money, but I'm not sure we got full value. The jury is still out."`,
    ],
    poor: [
      `"I'm concerned. ${capScore < 50 ? 'The cap situation is a problem.' : 'We overpaid for underwhelming talent.'} This front office needs to show significant improvement."`,
      `"Honestly? Disappointed. We had resources to work with and I'm not seeing the returns. Do better."`,
      `"This offseason raised more questions than answers. We're heading into the season weaker than I'd like."`,
    ],
    terrible: [
      `"This is a disaster. Overspent, underperformed, and we've weakened this franchise. I need answers from the front office."`,
      `"I cannot defend these moves. We burned cap space on the wrong players and the roster is a mess. Fix it."`,
      `"The front office has failed this franchise this offseason. I'll be watching very closely going forward."`,
    ],
  };

  const category =
    ['A+', 'A', 'A-'].includes(grade) ? 'elite' :
    ['B+', 'B'].includes(grade) ? 'good' :
    ['B-', 'C+'].includes(grade) ? 'average' :
    ['C', 'C-', 'D'].includes(grade) ? 'poor' :
    'terrible';

  return pick(quotes[category]);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeOffseasonGrade(league: LeagueState): OffseasonGradeData {
  const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  const fa     = calcFAMovesScore(userTeam, league, isWomens);
  const cap    = calcCapScore(userTeam, league, isWomens);
  const fit    = calcRosterFitScore(userTeam);
  const assets = calcAssetsScore(userTeam, league);

  const totalScore = Math.round(
    fa.score     * 0.35 +
    cap.score    * 0.25 +
    fit.score    * 0.25 +
    assets.score * 0.15,
  );

  const grade = scoreToGrade(totalScore);
  const ownerApprovalChange  = APPROVAL_BY_GRADE[grade];
  const ownerApprovalBefore  = league.ownerApproval ?? 55;
  const ownerApprovalAfter   = clamp(ownerApprovalBefore + ownerApprovalChange, 0, 100);

  const categories: CategoryScore[] = [
    { label: 'Free Agency Moves',         grade: scoreToGrade(fa.score),     score: fa.score,     comment: fa.comment     },
    { label: 'Cap Management',            grade: scoreToGrade(cap.score),    score: cap.score,    comment: cap.comment    },
    { label: 'Roster Fit / Needs Met',    grade: scoreToGrade(fit.score),    score: fit.score,    comment: fit.comment    },
    { label: 'Future Assets Preserved',   grade: scoreToGrade(assets.score), score: assets.score, comment: assets.comment },
  ];

  return {
    season: league.season,
    grade,
    ownerQuote: buildOwnerQuote(grade, isWomens, fa.score, cap.score),
    categories,
    ownerApprovalChange,
    ownerApprovalBefore,
    ownerApprovalAfter,
    isWomensLeague: isWomens,
  };
}

export function computeDraftGrade(league: LeagueState): DraftGradeData {
  const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const prospectIds = new Set((league.prospects ?? []).map(p => p.id));

  // Players on the user's roster who came from this draft class
  const drafted = userTeam.roster.filter(p => prospectIds.has(p.id));
  const count = drafted.length;

  // Assess overall draft class depth
  const allProspects = league.prospects ?? [];
  const top10Avg = allProspects.length > 0
    ? [...allProspects].sort((a, b) => b.rating - a.rating)
        .slice(0, Math.min(10, allProspects.length))
        .reduce((s, p) => s + p.rating, 0) / Math.min(10, allProspects.length)
    : 72;
  const classStrength: DraftGradeData['classStrength'] =
    top10Avg >= 82 ? 'Strong' :
    top10Avg >= 74 ? 'Average' : 'Weak';

  let score = 45;
  if (count > 0) {
    const avgOVR = drafted.reduce((s, p) => s + p.rating, 0) / count;
    const topPick = [...drafted].sort((a, b) => b.rating - a.rating)[0];
    score =
      avgOVR >= 82 ? 90 :
      avgOVR >= 77 ? 78 :
      avgOVR >= 72 ? 65 :
      avgOVR >= 67 ? 52 :
      38;
    if (topPick.rating >= 88) score += 8;
    if (classStrength === 'Weak' && avgOVR >= 72) score += 5;
  }
  score = clamp(score, 20, 100);

  const draftGrade = scoreToGrade(score);
  const ownerApprovalChange  = Math.round(APPROVAL_BY_GRADE[draftGrade] * 0.5);
  const ownerApprovalBefore  = league.ownerApproval ?? 55;
  const ownerApprovalAfter   = clamp(ownerApprovalBefore + ownerApprovalChange, 0, 100);

  const topUserPick = count > 0
    ? [...drafted].sort((a, b) => b.rating - a.rating)[0]
    : null;

  const draftQuotes: Record<string, string[]> = {
    elite: [
      `"Excellent draft. ${topUserPick ? `${topUserPick.name} looks like the real deal` : 'Franchise-level talent secured'}. You found genuine value and made the right calls."`,
      `"I couldn't be more pleased. Smart picks, good value — the future is bright for this franchise."`,
    ],
    good: [
      `"Solid draft. ${topUserPick ? `${topUserPick.name} has real potential` : 'These picks have real upside'}. Develop them well and we're in good shape."`,
      `"Good class. Not flashy, but these selections should contribute. I'm satisfied with the process."`,
    ],
    average: [
      `"Decent enough. Some of these picks could develop into contributors, some probably won't. Average draft class."`,
      `"I've seen better from this front office. The draft wasn't deep this year, but I expected sharper selections."`,
    ],
    poor: [
      `"Underwhelming. I don't see the value in these selections. We needed to draft better given our roster needs."`,
      `"Not what I was hoping for from this draft. Let's hope development can salvage something here."`,
    ],
  };

  const quoteCat =
    ['A+', 'A', 'A-'].includes(draftGrade) ? 'elite' :
    ['B+', 'B'].includes(draftGrade) ? 'good' :
    ['B-', 'C+', 'C'].includes(draftGrade) ? 'average' :
    'poor';

  return {
    season: league.season,
    grade: draftGrade,
    ownerQuote: pick(draftQuotes[quoteCat]),
    topPickName: topUserPick?.name,
    topPickPosition: topUserPick?.position,
    topPickRating: topUserPick?.rating,
    classStrength,
    userPicksCount: count,
    ownerApprovalChange,
    ownerApprovalBefore,
    ownerApprovalAfter,
    isWomensLeague: isWomens,
  };
}
