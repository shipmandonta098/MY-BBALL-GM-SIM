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
 * Build a "rookie shines / struggles" or "notable young performer" headline for preseason.
 * Covers both standout performances and learning-curve struggles to give narrative depth.
 */
export function buildPreseasonRookieHeadline(
  playerName: string,
  teamName: string,
  pts: number,
  reb: number,
  ast: number,
  playerAge: number,
): { headline: string; content: string } {
  const label    = playerAge <= 21 ? 'Rookie' : 'Young Gun';
  const statLine = `${pts} pts / ${reb} reb / ${ast} ast`;
  const isStrong = pts >= 18 || reb >= 12 || ast >= 9;

  if (isStrong) {
    const headlines = [
      `${label} ${playerName} Turns Heads With ${pts}-Point Preseason Showcase`,
      `${playerName} Looks Ready: ${statLine} in Exhibition Win for ${teamName}`,
      `Early Standout: ${playerName} Dominates Preseason Stage for ${teamName}`,
      `${teamName} Prospect ${playerName} Delivers Career-Best Preseason Line`,
      `${label} ${playerName} Impresses Coaches With ${statLine} Effort`,
    ];
    const contents = [
      `${playerName} (${statLine}) put the league on notice in preseason action, making a compelling case for serious rotation minutes when the regular season tips off. The ${teamName} coaching staff is impressed.`,
      `The ${teamName}'s ${label.toLowerCase()} ${playerName} delivered a statement performance, finishing with ${statLine}. Expect him to push for a starting role if he keeps this up.`,
      `Early-season hype is fully justified after ${playerName} posted ${statLine}. Scouts who watched him during the draft are not surprised — the ${teamName} may have a gem on their hands.`,
      `${playerName} looked every bit the prospect that had the ${teamName} excited at draft night. The ${statLine} line in exhibition play suggests he is ahead of schedule.`,
    ];
    return { headline: pickRandom(headlines), content: pickRandom(contents) };
  }

  const headlines = [
    `${label} ${playerName} Shows Flashes for ${teamName} in Exhibition`,
    `${playerName} Continues Preseason Audition With ${statLine} Line`,
    `${teamName} Watching Closely as ${playerName} Navigates Exhibition Play`,
    `Preseason Reps Valuable for ${teamName}'s ${playerName}`,
  ];
  const contents = [
    `${playerName} (${statLine}) showed why the ${teamName} are high on him despite a few rough stretches. Preseason is the right time to learn, and coaches appreciate his effort and activity level.`,
    `It was not a perfect night for ${playerName}, but the ${teamName} saw enough to stay optimistic. The ${statLine} line masked some impressive plays that won't show up in the box score.`,
    `The ${teamName}'s ${label.toLowerCase()} ${playerName} is getting valuable exhibition reps. Finishing with ${statLine}, he is still clearly adjusting to the speed of the pro game — but the tools are there.`,
    `Coaches view ${playerName}'s preseason as a work in progress. The ${statLine} showing has highs and lows, exactly what you'd expect from a young player earning his stripes.`,
  ];
  return { headline: pickRandom(headlines), content: pickRandom(contents) };
}

/**
 * Build a note when a young player struggles badly in preseason — adds narrative balance.
 */
export function buildPreseasonRookieStruggleHeadline(
  playerName: string,
  teamName: string,
  pts: number,
  tov: number,
  playerAge: number,
): { headline: string; content: string } {
  const label = playerAge <= 21 ? 'Rookie' : 'Young Player';
  const headlines = [
    `${label} ${playerName} Has Learning-Curve Night for ${teamName}`,
    `${teamName}'s ${playerName} Battles Through Rough Preseason Outing`,
    `${playerName} Faces Pro Adjustment: ${pts} Pts, ${tov} Turnovers in Exhibition`,
  ];
  const contents = [
    `${playerName} struggled to find his footing with ${pts} points and ${tov} turnovers in a tough preseason night. Coaches aren't worried — this is exactly what exhibition games are for.`,
    `Not every preseason game will go well for a ${label.toLowerCase()}, and ${playerName} learned that the hard way tonight. The ${teamName} staff sees the growing pains as part of the development process.`,
    `${playerName} posted just ${pts} points while turning it over ${tov} times. The ${teamName} coaching staff remains confident this is normal development — the regular season is still weeks away.`,
  ];
  return { headline: pickRandom(headlines), content: pickRandom(contents) };
}
