import { Player } from '../types';

export type InjurySeverity = 'minor' | 'moderate' | 'severe';

/** Tiers: 1–10 days = minor, 11–30 = moderate, 31+ = severe (includes season-ending). */
export function getInjurySeverity(daysOut: number): InjurySeverity {
  if (daysOut <= 10) return 'minor';
  if (daysOut <= 30) return 'moderate';
  return 'severe';
}

/** Whether this injury duration allows a play-through option (minor or moderate only). */
export function canPlayThrough(daysOut: number): boolean {
  return daysOut <= 30;
}

/** Compute a random OVR penalty for the given injury duration. Returns a positive number to subtract. */
export function calcInjuryOVRPenalty(daysOut: number): number {
  const sev = getInjurySeverity(daysOut);
  if (sev === 'minor')    return 3 + Math.floor(Math.random() * 6);   // 3–8
  if (sev === 'moderate') return 8 + Math.floor(Math.random() * 8);   // 8–15
  return 15 + Math.floor(Math.random() * 11);                          // 15–25
}

/**
 * Extra OVR penalty applied on top of the base penalty when a player plays through.
 * Minor: +5–8, Moderate: +8–12 additional.
 */
export function getPlayThroughOVRExtra(daysOut: number): number {
  if (daysOut <= 10) return 5 + Math.floor(Math.random() * 4);   // +5–8
  return 8 + Math.floor(Math.random() * 5);                       // +8–12
}

/**
 * Roll whether an injury becomes career-threatening.
 * Regular season: 1–3% per injury event. Playoffs: 4–8%.
 * Boosted for severe injuries (31+ days) and age 30+.
 */
export function rollCareerEnding(daysOut: number, age: number, isPlayoffs: boolean): boolean {
  let chance = isPlayoffs ? 0.04 : 0.01;
  if (daysOut >= 31)  chance *= 2.0;  // severe injury baseline doubles the rate
  if (daysOut >= 270) chance *= 1.5;  // ACL/Achilles — even higher
  if (age >= 35)      chance *= 2.0;
  else if (age >= 30) chance *= 1.4;
  // Hard cap: ≤8% in playoffs, ≤3% regular season
  chance = Math.min(chance, isPlayoffs ? 0.08 : 0.03);
  return Math.random() < chance;
}

/**
 * Roll whether playing through injury worsens it (escalates days remaining).
 * Returns the new days-out value if worsened, null if no change.
 * Minor→Moderate chance: 6% normal, 12% playoffs, 18% back-to-back.
 * Moderate→Severe chance: 4% normal, 8% playoffs, 14% back-to-back.
 */
export function rollInjuryWorsening(
  currentDays: number,
  isPlayoffs: boolean,
  isB2B: boolean,
): number | null {
  const sev = getInjurySeverity(currentDays);
  if (sev === 'severe') return null; // can't worsen further via play-through

  let base: number;
  if (sev === 'minor')    base = isB2B ? 0.18 : isPlayoffs ? 0.12 : 0.06;
  else                    base = isB2B ? 0.14 : isPlayoffs ? 0.08 : 0.04;

  if (Math.random() >= base) return null;

  // Escalate: minor → 15–25 days, moderate → 35–60 days
  if (sev === 'minor')    return 15 + Math.floor(Math.random() * 11);
  return 35 + Math.floor(Math.random() * 26);
}

function isPlayerCurrentlyInjured(p: Player): boolean {
  return p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0);
}

/** Returns the player's displayed rating (base minus stored injury penalty). */
export function getEffectiveRating(player: Player): number {
  if (!isPlayerCurrentlyInjured(player) || player.injuryOVRPenalty == null) return player.rating;
  return Math.max(40, player.rating - player.injuryOVRPenalty);
}

/**
 * Weighted team OVR using effective (injury-adjusted) ratings.
 * Top 5 by effective rating (starters): weight 1.4x
 * Next 5 (rotation): weight 1.0x
 * Remaining (bench/deep): weight 0.5x
 */
export function calcTeamEffectiveOVR(roster: Player[]): number {
  if (roster.length === 0) return 0;
  const sorted = [...roster].sort((a, b) => getEffectiveRating(b) - getEffectiveRating(a));
  let totalWeighted = 0;
  let totalWeight = 0;
  sorted.forEach((p, i) => {
    const eff = getEffectiveRating(p);
    const weight = i < 5 ? 1.4 : i < 10 ? 1.0 : 0.5;
    totalWeighted += eff * weight;
    totalWeight += weight;
  });
  return Math.round(totalWeighted / totalWeight);
}

/**
 * Roll for a permanent potential loss on injury recovery.
 * Only applies to moderate/severe injuries (11+ days).
 * Returns { loss, note } if a loss occurs, else null.
 */
export function rollPotentialLoss(daysOut: number): { loss: number; note: string } | null {
  let chance: number;
  let maxLoss: number;
  if (daysOut >= 270)     { chance = 0.20; maxLoss = 5; }  // season-ending ACL/Achilles
  else if (daysOut >= 30) { chance = 0.15; maxLoss = 5; }  // severe 30+ days
  else if (daysOut >= 22) { chance = 0.10; maxLoss = 3; }  // severe 22–29 days
  else if (daysOut >= 11) { chance = 0.05; maxLoss = 2; }  // moderate
  else return null;                                          // minor: no risk

  if (Math.random() >= chance) return null;
  const loss = 1 + Math.floor(Math.random() * maxLoss);
  return { loss, note: `Potential reduced due to injury (-${loss})` };
}

/**
 * Returns a brief team OVR impact note based on injured players, or null if none.
 * Shows the highest-penalty injured player and aggregate team OVR drop.
 */
export function getTeamInjuryNote(roster: Player[]): string | null {
  const injured = roster.filter(p =>
    isPlayerCurrentlyInjured(p) && (p.injuryOVRPenalty ?? 0) > 0
  );
  if (injured.length === 0) return null;

  const worst = [...injured].sort((a, b) => (b.injuryOVRPenalty ?? 0) - (a.injuryOVRPenalty ?? 0))[0];
  const lastName = worst.name.split(' ').slice(-1)[0];
  const sortedAll = [...roster].sort((a, b) => b.rating - a.rating);
  let teamDrop = 0;
  injured.forEach(p => {
    const roleIdx = sortedAll.findIndex(r => r.id === p.id);
    const roleWeight = roleIdx < 5 ? 1.4 : roleIdx < 10 ? 1.0 : 0.5;
    const totalWeight = sortedAll.reduce((s, _, i) => s + (i < 5 ? 1.4 : i < 10 ? 1.0 : 0.5), 0);
    teamDrop += ((p.injuryOVRPenalty ?? 0) * roleWeight) / totalWeight;
  });
  const drop = Math.round(teamDrop);
  if (drop < 1) return null;

  const suffix = injured.length > 1 ? ` +${injured.length - 1} more` : ' injured';
  return `Team OVR -${drop} (${lastName}${suffix})`;
}
