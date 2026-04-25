import { Player } from '../types';

export type InjurySeverity = 'minor' | 'moderate' | 'severe';

export function getInjurySeverity(daysOut: number): InjurySeverity {
  if (daysOut <= 7) return 'minor';
  if (daysOut <= 21) return 'moderate';
  return 'severe';
}

/** Compute a random OVR penalty for the given injury duration. Returns a positive number to subtract. */
export function calcInjuryOVRPenalty(daysOut: number): number {
  const sev = getInjurySeverity(daysOut);
  if (sev === 'minor')    return 3 + Math.floor(Math.random() * 6);   // 3–8
  if (sev === 'moderate') return 8 + Math.floor(Math.random() * 8);   // 8–15
  return 15 + Math.floor(Math.random() * 11);                          // 15–25
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
 * Only applies to moderate/severe injuries (8+ days).
 * Returns { loss, note } if a loss occurs, else null.
 */
export function rollPotentialLoss(daysOut: number): { loss: number; note: string } | null {
  let chance: number;
  let maxLoss: number;
  if (daysOut >= 270)     { chance = 0.20; maxLoss = 5; }  // season-ending ACL/Achilles
  else if (daysOut >= 30) { chance = 0.15; maxLoss = 5; }  // severe 30+ days
  else if (daysOut >= 22) { chance = 0.10; maxLoss = 3; }  // severe 22–29 days
  else if (daysOut >= 8)  { chance = 0.05; maxLoss = 2; }  // moderate
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
  // Approximate team-level drop: sum of penalties weighted by role (starters count more)
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
