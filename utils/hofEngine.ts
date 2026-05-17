import { Player, SeasonAwards, HofInductee, LeagueState, Position, Gender } from '../types';

// ─── HOF Score Computation ─────────────────────────────────────────────────
// Returns a 0-100 score based on career stats, awards, and longevity.

export function computeHofScore(
  player: Player,
  awardHistory: SeasonAwards[],
): number {
  let score = 0;

  const cs = player.careerStats;
  const totalGP = cs.reduce((s, r) => s + r.gamesPlayed, 0);
  const totalPts = cs.reduce((s, r) => s + r.points, 0);
  const totalReb = cs.reduce((s, r) => s + r.rebounds, 0);
  const totalAst = cs.reduce((s, r) => s + r.assists, 0);
  const totalStl = cs.reduce((s, r) => s + r.steals, 0);
  const totalBlk = cs.reduce((s, r) => s + r.blocks, 0);
  const totalFGM = cs.reduce((s, r) => s + r.fgm, 0);
  const totalFGA = cs.reduce((s, r) => s + r.fga, 0);
  const seasons  = cs.length;

  const ppg = totalGP > 0 ? totalPts / totalGP : 0;
  const rpg = totalGP > 0 ? totalReb / totalGP : 0;
  const apg = totalGP > 0 ? totalAst / totalGP : 0;
  const spg = totalGP > 0 ? totalStl / totalGP : 0;
  const bpg = totalGP > 0 ? totalBlk / totalGP : 0;

  // Longevity (max 12 pts) — 8+ seasons earns full credit
  score += Math.min(12, seasons * 1.5);

  // Scoring (max 22 pts)
  if (ppg >= 28)       score += 22;
  else if (ppg >= 24)  score += 18;
  else if (ppg >= 20)  score += 14;
  else if (ppg >= 17)  score += 10;
  else if (ppg >= 13)  score += 6;
  else if (ppg >= 9)   score += 3;

  // Rebounding — weighted for bigs (max 10 pts)
  const rebFactor = ['C', 'PF'].includes(player.position) ? 1.5 : 0.8;
  score += Math.min(10, rpg * rebFactor);

  // Playmaking — weighted for guards (max 10 pts)
  const astFactor = ['PG', 'SG'].includes(player.position) ? 1.5 : 0.8;
  score += Math.min(10, apg * astFactor);

  // Defense specialists (SPG+BPG combined, max 6)
  score += Math.min(6, (spg + bpg) * 2);

  // Peak OVR proxy (current rating, max 10 pts)
  if (player.rating >= 95)       score += 10;
  else if (player.rating >= 90)  score += 7;
  else if (player.rating >= 85)  score += 4;
  else if (player.rating >= 80)  score += 2;

  // Awards from awardHistory (uncapped — stacks matter)
  for (const hist of awardHistory) {
    if (hist.mvp?.playerId === player.id)      score += 18;
    if (hist.dpoy?.playerId === player.id)     score += 10;
    if (hist.roy?.playerId === player.id)      score += 4;
    if (hist.sixthMan?.playerId === player.id) score += 2;
    if (hist.mip?.playerId === player.id)      score += 1;

    if (hist.allNbaFirst?.includes(player.id))       score += 7;
    else if (hist.allNbaSecond?.includes(player.id)) score += 4;
    else if (hist.allNbaThird?.includes(player.id))  score += 2;

    if (hist.allDefensive?.includes(player.id))       score += 3;
    else if (hist.allDefensiveSecond?.includes(player.id)) score += 1;
  }

  // All-Star selections (3 pts each, max 33)
  score += Math.min(33, (player.allStarSelections?.length ?? 0) * 3);

  // Championships (8 pts each, max 32)
  score += Math.min(32, (player.championYears?.length ?? 0) * 8);

  // Finals MVP stored via All-Star MVP mechanism (allStarMvpYears is reused in some leagues)
  // Not double-counted here intentionally

  return Math.round(score);
}

export function computeHofProbability(player: Player, awardHistory: SeasonAwards[]): number {
  const score = computeHofScore(player, awardHistory);
  // Sigmoid-style mapping: score ≥ 80 → >90%, score 60 → ~60%, score 40 → ~25%
  const pct = Math.round(Math.min(99, Math.max(1, (score / 1.2) - 5)));
  return pct;
}

// ─── Retirement Logic ─────────────────────────────────────────────────────
// Returns { retire: boolean; chance: number } for a given FA player.
export function shouldRetire(player: Player, season: number): boolean {
  if (player.yearRetired) return false; // already retired
  const age = player.age;
  // Mandatory retirement at 42+
  if (age >= 42) return true;
  // Age-based probability
  const baseChance =
    age >= 40 ? 0.90 :
    age >= 38 ? 0.70 :
    age >= 36 ? 0.45 :
    age >= 34 ? 0.20 :
    age >= 32 ? 0.08 : 0;
  // Low-rating vets more likely to retire
  const ratingPenalty = player.rating < 70 ? 0.15 : player.rating < 75 ? 0.05 : 0;
  // Career short — not enough to retire into legend (under 3 seasons, don't retire early)
  if (player.careerStats.length < 3 && age < 38) return false;
  return Math.random() < (baseChance + ratingPenalty);
}

// ─── HOF Induction ────────────────────────────────────────────────────────
// Builds a HofInductee from a retired player.
function buildInductee(player: Player, awardHistory: SeasonAwards[], season: number): HofInductee {
  const cs = player.careerStats;
  const gp = cs.reduce((s, r) => s + r.gamesPlayed, 0);
  const pts = cs.reduce((s, r) => s + r.points, 0);
  const reb = cs.reduce((s, r) => s + r.rebounds, 0);
  const ast = cs.reduce((s, r) => s + r.assists, 0);
  const stl = cs.reduce((s, r) => s + r.steals, 0);
  const blk = cs.reduce((s, r) => s + r.blocks, 0);
  const fgm = cs.reduce((s, r) => s + r.fgm, 0);
  const fga = cs.reduce((s, r) => s + r.fga, 0);

  const ppg = gp > 0 ? pts / gp : 0;
  const rpg = gp > 0 ? reb / gp : 0;
  const apg = gp > 0 ? ast / gp : 0;
  const spg = gp > 0 ? stl / gp : 0;
  const bpg = gp > 0 ? blk / gp : 0;
  const fgPct = fga > 0 ? fgm / fga : 0;

  // Teams played for (from careerStats)
  const teamMap = new Map<string, number>();
  for (const s of cs) {
    const prev = teamMap.get(s.teamName) ?? 0;
    teamMap.set(s.teamName, prev + s.gamesPlayed);
  }
  const teams = [...teamMap.keys()];
  const primaryTeam = [...teamMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const primaryTeamId = cs.find(s => s.teamName === primaryTeam)?.teamId ?? '';

  // Award counts
  let mvp = 0, dpoy = 0, roy = 0, allNba = 0, allNbaFirst = 0, fins = 0;
  for (const hist of awardHistory) {
    if (hist.mvp?.playerId === player.id) mvp++;
    if (hist.dpoy?.playerId === player.id) dpoy++;
    if (hist.roy?.playerId === player.id) roy++;
    if (hist.allNbaFirst?.includes(player.id)) { allNba++; allNbaFirst++; }
    else if (hist.allNbaSecond?.includes(player.id)) allNba++;
    else if (hist.allNbaThird?.includes(player.id)) allNba++;
  }
  const championships = player.championYears?.length ?? 0;
  const allStarSelections = player.allStarSelections?.length ?? 0;
  const hofScore = computeHofScore(player, awardHistory);

  // Induction note
  const note = buildInductionNote(player.name, ppg, rpg, apg, mvp, dpoy, championships, allStarSelections, allNba, cs.length);

  return {
    id: player.id,
    name: player.name,
    position: player.position,
    gender: player.gender,
    height: player.height,
    jerseyNumber: player.jerseyNumber,
    yearInducted: season,
    yearRetired: player.yearRetired ?? season - 1,
    teams,
    primaryTeam,
    primaryTeamId,
    careerGP: gp,
    careerSeasons: cs.length,
    careerPPG: Math.round(ppg * 10) / 10,
    careerRPG: Math.round(rpg * 10) / 10,
    careerAPG: Math.round(apg * 10) / 10,
    careerSPG: Math.round(spg * 10) / 10,
    careerBPG: Math.round(bpg * 10) / 10,
    careerFGPct: Math.round(fgPct * 1000) / 10,
    careerHighs: { ...player.careerHighs },
    awardsCount: { mvp, dpoy, roy, allNba, allNbaFirst, championships, allStarSelections, finalsMyp: fins },
    hofScore,
    inductionNote: note,
  };
}

function buildInductionNote(
  name: string, ppg: number, rpg: number, apg: number,
  mvp: number, dpoy: number, championships: number, allStars: number,
  allNba: number, seasons: number,
): string {
  const parts: string[] = [];
  if (mvp > 0) parts.push(`${mvp}× MVP`);
  if (dpoy > 0) parts.push(`${dpoy}× DPOY`);
  if (championships > 0) parts.push(`${championships}× Champion`);
  if (allNba > 0) parts.push(`${allNba}× All-NBA`);
  if (allStars > 0) parts.push(`${allStars}× All-Star`);

  const statLine = [
    ppg >= 8 ? `${ppg.toFixed(1)} PPG` : null,
    rpg >= 4 ? `${rpg.toFixed(1)} RPG` : null,
    apg >= 4 ? `${apg.toFixed(1)} APG` : null,
  ].filter(Boolean).join(' / ');

  if (parts.length > 0) {
    return `${parts.join(', ')} across a ${seasons}-season career. Career line: ${statLine}.`;
  }
  return `A ${seasons}-season career of excellence: ${statLine}. One of the league's all-time greats.`;
}

// ─── Main: run end-of-season HOF processing ──────────────────────────────
// Mutates nothing — returns arrays of newly retired and newly inducted players.
export function runHofProcessing(state: LeagueState): {
  newlyRetired: Player[];
  newlyInducted: HofInductee[];
  updatedRetiredPlayers: Player[];
  updatedHof: HofInductee[];
} {
  const season = state.season;
  const awardHistory = state.awardHistory ?? [];
  const existingRetired = state.retiredPlayers ?? [];
  const existingHof = state.hallOfFame ?? [];
  const inductedIds = new Set(existingHof.map(h => h.id));

  // Step 1: Check FA pool for retirement candidates
  const newlyRetired: Player[] = [];
  const remainingFAs: Player[] = [];

  for (const p of state.freeAgents) {
    if (!p.yearRetired && shouldRetire(p, season)) {
      newlyRetired.push({ ...p, yearRetired: season - 1 });
    } else {
      remainingFAs.push(p);
    }
  }

  const updatedRetiredPlayers = [
    ...existingRetired,
    ...newlyRetired,
  ];

  // Step 2: HOF induction — eligible players are those retired ≥ 1 season ago
  // (retired last season or earlier) and not yet inducted
  const eligibleForInduction = updatedRetiredPlayers.filter(p => {
    if (inductedIds.has(p.id)) return false;
    if (!p.yearRetired || p.yearRetired >= season) return false; // retired this season, wait
    const hofScore = computeHofScore(p, awardHistory);
    return hofScore >= 65; // induction threshold
  });

  const newlyInducted: HofInductee[] = eligibleForInduction.map(p =>
    buildInductee(p, awardHistory, season)
  );

  const updatedHof = [...existingHof, ...newlyInducted];

  // Also update hofProbability on all current FA / roster players (done externally to avoid mutation here)
  return { newlyRetired, newlyInducted, updatedRetiredPlayers, updatedHof };
}
