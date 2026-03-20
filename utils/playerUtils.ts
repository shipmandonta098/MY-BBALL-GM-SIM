import { Player, PlayerStats, SeasonStats } from '../types';

export const BLANK_STATS: PlayerStats = {
  points: 0, rebounds: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0,
  gamesPlayed: 0, gamesStarted: 0, minutes: 0,
  fgm: 0, fga: 0, threepm: 0, threepa: 0, ftm: 0, fta: 0,
  tov: 0, pf: 0, techs: 0, flagrants: 0, ejections: 0, plusMinus: 0,
};

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
  return { ...player, stats: { ...BLANK_STATS }, careerStats: [...(player.careerStats ?? []), entry] };
}
