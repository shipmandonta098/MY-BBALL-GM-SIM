/**
 * preseasonEngine.ts
 * Generates preseason (exhibition) schedules and provides helpers for
 * finalising preseason game results without affecting standings.
 */

import { Team, ScheduleGame } from '../types';

/**
 * Generate a preseason schedule.
 * Each team plays exactly `numGames` exhibition games.
 * Matchups are fully random — no conference / division bias.
 * Games are spread one round per calendar day so preseason runs
 * `numGames` days before the regular season begins.
 */
export function generatePreseasonSchedule(
  teams: Team[],
  numGames: number = 6,
): ScheduleGame[] {
  const schedule: ScheduleGame[] = [];
  const teamIds = teams.map(t => t.id);

  // Fisher-Yates shuffle helper
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  for (let round = 0; round < numGames; round++) {
    const day = round + 1; // preseason day 1 … numGames
    const shuffled = shuffle(teamIds);
    const half = Math.floor(shuffled.length / 2);

    for (let i = 0; i < half; i++) {
      const homeId = shuffled[i];
      const awayId = shuffled[i + half];
      schedule.push({
        id: `pre-${round}-${homeId.slice(-6)}-${awayId.slice(-6)}-${Date.now() + i}`,
        day,
        homeTeamId: homeId,
        awayTeamId: awayId,
        played: false,
        isPreseason: true,
        homeB2B: false,
        awayB2B: false,
        homeB2BCount: 0,
        awayB2BCount: 0,
      });
    }
    // If odd number of teams one team gets a bye each round — that's fine.
  }

  return schedule;
}

/**
 * Pick a random item from an array.
 */
export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build a preseason game headline for the news feed.
 */
export function buildPreseasonHeadline(
  winnerName: string,
  loserName: string,
  winScore: number,
  loseScore: number,
  gamesPlayedSoFar: number,
): { headline: string; content: string } {
  const isOpener = gamesPlayedSoFar === 0;
  const margin   = winScore - loseScore;

  const openerHeadlines = [
    `${winnerName} Win Preseason Opener ${winScore}-${loseScore}`,
    `Exhibition Debut: ${winnerName} Top ${loserName} ${winScore}-${loseScore}`,
    `${winnerName} Kick Off Preseason With ${winScore}-${loseScore} Victory`,
  ];

  const regularHeadlines = [
    `${winnerName} ${winScore}, ${loserName} ${loseScore} (Exhibition)`,
    `${winnerName} Hold Off ${loserName} in Preseason Tune-Up`,
    `${winnerName} Cruise Past ${loserName} ${winScore}-${loseScore}`,
  ];

  const blowoutHeadlines = [
    `${winnerName} Dominate ${loserName} ${winScore}-${loseScore} in Preseason`,
    `${winnerName} Roll in Lopsided Exhibition ${winScore}-${loseScore}`,
  ];

  const headline = margin >= 20
    ? pickRandom(blowoutHeadlines)
    : isOpener
      ? pickRandom(openerHeadlines)
      : pickRandom(regularHeadlines);

  const contents = isOpener
    ? [
        `${winnerName} opened exhibition play on a strong note, defeating ${loserName} ${winScore}-${loseScore}. Coaches used the game to evaluate rotations heading into the regular season.`,
        `First look at the new-look ${winnerName}: they beat ${loserName} ${winScore}-${loseScore} in their preseason opener. Early indicators are encouraging.`,
        `The preseason slate is underway. ${winnerName} outpaced ${loserName} by ${margin} in a ${winScore}-${loseScore} exhibition result.`,
      ]
    : [
        `${winnerName} picked up another preseason win, topping ${loserName} ${winScore}-${loseScore}. Coaches are experimenting with lineups before the regular season tips off.`,
        `${winnerName} stays sharp in the exhibition slate, beating ${loserName} ${winScore}-${loseScore} in a competitive tune-up.`,
        `${winnerName} ${winScore}-${loseScore} over ${loserName}. Both squads are finalising rotations as the regular season approaches.`,
      ];

  return { headline, content: pickRandom(contents) };
}

/**
 * Build a "rookie shines" or "notable performer" headline for preseason.
 */
export function buildPreseasonRookieHeadline(
  playerName: string,
  teamName: string,
  pts: number,
  reb: number,
  ast: number,
  playerAge: number,
): { headline: string; content: string } {
  const label = playerAge <= 21 ? 'Rookie' : 'Young Gun';
  const headlines = [
    `${label} ${playerName} Shines in Preseason Exhibition`,
    `${playerName} Impresses in Exhibition Debut for ${teamName}`,
    `${label} ${playerName} Drops ${pts} Points in Preseason Showcase`,
  ];
  const statLine = `${pts} pts / ${reb} reb / ${ast} ast`;
  const contents = [
    `${playerName} (${statLine}) made a strong impression in preseason action, giving the ${teamName} plenty to be excited about heading into the regular season.`,
    `The ${teamName}'s ${label.toLowerCase()} ${playerName} put up an eye-catching ${statLine} line in exhibition play. Coaches are taking notice.`,
    `Early-season hype is building around ${playerName} after a ${statLine} performance. The ${teamName} may have found a key piece of their rotation.`,
  ];
  return {
    headline: pickRandom(headlines),
    content: pickRandom(contents),
  };
}
