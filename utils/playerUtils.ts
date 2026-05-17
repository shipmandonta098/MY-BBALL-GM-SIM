import { Player, PlayerStats, SeasonStats } from '../types';

export const BLANK_STATS: PlayerStats = {
  points: 0, rebounds: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0,
  gamesPlayed: 0, gamesStarted: 0, minutes: 0,
  fgm: 0, fga: 0, threepm: 0, threepa: 0, ftm: 0, fta: 0,
  tov: 0, pf: 0, techs: 0, flagrants: 0, ejections: 0, plusMinus: 0,
};

/**
 * Unadjusted per-minute efficiency score used as the PER numerator.
 * Rebounds weighted at 0.7 to compensate for sim engine rebounding inflation.
 * Returns 0 when the player has no minutes.
 */
export function rawUPER(s: PlayerStats): number {
  if (s.minutes <= 0) return 0;
  return (
    s.points
    + s.rebounds  * 0.7
    + s.assists   * 0.8
    + s.steals    * 1.2
    + s.blocks    * 0.9
    - (s.fga - s.fgm) * 0.5
    - (s.fta - s.ftm) * 0.25
    - s.tov       * 1.0
  ) / s.minutes;
}

/**
 * League-normalize a rawUPER value so the league average = 15.0.
 * Pass the mean rawUPER across all qualifying players (≥ MIN_PER_MINUTES played).
 */
export const MIN_PER_MINUTES = 50; // minimum total minutes to qualify for lgAvg
export function normalizePER(raw: number, lgAvgRaw: number): number {
  if (raw <= 0) return 0;
  if (lgAvgRaw <= 0) return Math.min(32, raw * 25); // hard fallback, should not happen
  return Math.min(32, (raw / lgAvgRaw) * 15.0);
}

/**
 * Compute league-average rawUPER from an array of all roster players.
 * Only includes players with at least MIN_PER_MINUTES of play time.
 */
export function leagueAvgRawUPER(allRosterPlayers: PlayerStats[]): number {
  const qualifying = allRosterPlayers.filter(s => s.minutes >= MIN_PER_MINUTES);
  if (qualifying.length === 0) return 1; // avoid div-by-zero
  const sum = qualifying.reduce((acc, s) => acc + rawUPER(s), 0);
  return sum / qualifying.length;
}

/**
 * Saves the player's current `stats` into `careerStats` (tagged with team info),
 * then resets `stats` to zero. Returns the updated player object.
 * No-op if the player has 0 gamesPlayed.
 */
export function snapshotPlayerStats(
  player: Player,
  teamId: string,
  teamName: string,
  teamAbbreviation: string,
  season: number,
  isSplit: boolean,
): Player {
  if (player.stats.gamesPlayed === 0) return player;
  const entry: SeasonStats = {
    ...player.stats,
    year: season,
    teamId,
    teamName,
    teamAbbreviation,
    isSplit,
  };
  return { ...player, stats: { ...BLANK_STATS }, gameLog: [], careerStats: [...(player.careerStats ?? []), entry] };
}
