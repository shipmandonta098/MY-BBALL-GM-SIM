import { LeagueState, SeasonPhase } from '../types';

/** Derive the current season phase from league state.
 *  Does not mutate state — safe to call anywhere. */
export const getSeasonPhase = (league: LeagueState): SeasonPhase => {
  if (league.isOffseason) return 'offseason';
  if (league.playoffBracket) return 'playoffs';
  if (league.allStarWeekend && !league.allStarWeekend.completed) return 'allstar';

  const playedGames = league.schedule.filter(g => g.played).length;
  if (playedGames === 0) return 'preseason';

  return 'regular';
};

/** Human-readable label for each phase */
export const PHASE_LABELS: Record<SeasonPhase, string> = {
  preseason: 'Preseason',
  regular: 'Regular Season',
  allstar: 'All-Star Weekend',
  playoffs: 'Playoffs',
  offseason: 'Offseason',
};

/** Ordered list of phases for progress display */
export const PHASE_ORDER: SeasonPhase[] = [
  'preseason',
  'regular',
  'allstar',
  'playoffs',
  'offseason',
];
