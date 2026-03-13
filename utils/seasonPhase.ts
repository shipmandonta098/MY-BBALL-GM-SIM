import { LeagueState, SeasonPhase } from '../types';

/** Derive the current season phase from league state.
 *  Respects stored `league.seasonPhase` if set (set by App.tsx sim loop),
 *  then falls back to structural inference. Safe to call anywhere. */
export const getSeasonPhase = (league: LeagueState): SeasonPhase => {
  // If the sim loop has explicitly tracked a phase, trust it
  if (league.seasonPhase) return league.seasonPhase;

  if (league.isOffseason) return 'Offseason';
  if (league.playoffBracket) return 'Playoffs';
  if (league.allStarWeekend && !league.allStarWeekend.completed) return 'All-Star Weekend';
  if (league.tradeDeadlinePassed) return 'Trade Deadline';

  const playedGames = league.schedule.filter(g => g.played).length;
  if (playedGames === 0) return 'Preseason';

  return 'Regular Season';
};

/** Human-readable label — already embedded in SeasonPhase strings */
export const PHASE_LABELS: Record<SeasonPhase, string> = {
  'Preseason':       'Preseason',
  'Regular Season':  'Regular Season',
  'Trade Deadline':  'Trade Deadline',
  'All-Star Weekend': 'All-Star Weekend',
  'Playoffs':        'Playoffs',
  'Offseason':       'Offseason',
};

/** Ordered list of phases for progress display */
export const PHASE_ORDER: SeasonPhase[] = [
  'Preseason',
  'Regular Season',
  'Trade Deadline',
  'All-Star Weekend',
  'Playoffs',
  'Offseason',
];
