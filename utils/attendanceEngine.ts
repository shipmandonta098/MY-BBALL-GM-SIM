import { Team, ScheduleGame } from '../types';

/**
 * Compute attendance for a single home game.
 *
 * Factors (all multiplicative on top of base fill rate):
 *  - Market size     → base fill rate anchor
 *  - Win %           → ±15 pp swing around 0.500
 *  - Fan hype        → ±10 pp from finances.fanHype (0–100)
 *  - Home win streak → up to +5 pp
 *  - Star power      → up to +6 pp (90+ OVR player on roster)
 *  - Away market     → +4 pp when large-market visitor comes to town
 *  - Ticket price    → slight penalty when overpriced vs. market norms
 *  - Random noise    → ±2 pp so numbers look organic
 */
export function computeGameAttendance(
  homeTeam: Team,
  awayTeam: Team
): number {
  const capacity = homeTeam.stadiumCapacity || 19_000;

  // Base fill rate anchored to market size
  const baseRate =
    homeTeam.marketSize === 'Large'  ? 0.88 :
    homeTeam.marketSize === 'Medium' ? 0.75 : 0.62;

  // Win % effect: 0.500 is neutral, every % point = ±0.003 fill rate (max ±0.15)
  const totalGames = homeTeam.wins + homeTeam.losses;
  const winPct = totalGames > 0 ? homeTeam.wins / totalGames : 0.5;
  const winEffect = Math.max(-0.15, Math.min(0.15, (winPct - 0.5) * 0.30));

  // Fan hype (0–100) — centered on 60 (league norm)
  const hype = homeTeam.finances?.fanHype ?? 60;
  const hypeEffect = (hype - 60) / 500; // -0.12 to +0.08

  // Home win streak
  const streak = homeTeam.streak ?? 0;
  const streakEffect =
    streak >= 5 ? 0.05 :
    streak >= 3 ? 0.03 :
    streak >= 1 ? 0.01 :
    streak <= -5 ? -0.05 :
    streak <= -3 ? -0.03 : -0.01;

  // Star power on home roster
  const topOVR = homeTeam.roster.length > 0
    ? Math.max(...homeTeam.roster.map(p => p.rating))
    : 75;
  const starEffect =
    topOVR >= 92 ? 0.06 :
    topOVR >= 87 ? 0.03 :
    topOVR >= 82 ? 0.01 : 0;

  // Big-market visiting team brings road fans
  const awayMarketEffect = awayTeam.marketSize === 'Large' ? 0.04 : 0;

  // Ticket price sensitivity (penalty when overpriced)
  const ticketPrice = homeTeam.finances?.ticketPrice ?? 80;
  const priceNorm =
    homeTeam.marketSize === 'Large' ? 110 :
    homeTeam.marketSize === 'Medium' ? 85 : 65;
  const priceEffect = Math.max(-0.08, Math.min(0, (priceNorm - ticketPrice) / 500));

  // Small random noise so each game differs slightly
  const noise = (Math.random() - 0.5) * 0.04;

  const fillRate = Math.min(
    1.0,
    Math.max(0.25,
      baseRate + winEffect + hypeEffect + streakEffect + starEffect + awayMarketEffect + priceEffect + noise
    )
  );

  return Math.round(capacity * fillRate);
}

/**
 * Aggregate season attendance stats for a single team.
 * Returns { homeGames, totalAttendance, avgAttendance, capacityPct }.
 */
export function teamSeasonAttendance(
  team: Team,
  schedule: ScheduleGame[]
): { homeGames: number; totalAttendance: number; avgAttendance: number; capacityPct: number } {
  const homeGames = schedule.filter(g => g.played && g.homeTeamId === team.id);
  const totalAttendance = homeGames.reduce((sum, g) => sum + (g.attendance ?? 0), 0);
  const avgAttendance = homeGames.length > 0 ? Math.round(totalAttendance / homeGames.length) : 0;
  const capacity = team.stadiumCapacity || 19_000;
  const capacityPct = capacity > 0 ? (avgAttendance / capacity) * 100 : 0;
  return { homeGames: homeGames.length, totalAttendance, avgAttendance, capacityPct };
}
