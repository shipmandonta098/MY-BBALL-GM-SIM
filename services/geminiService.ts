import { Player, GameResult, Team, Prospect, ContractOffer, Coach, NewsCategory, AwardWinner } from "../types";

/**
 * GEMINI API DISABLED
 * All functions below now return hardcoded or logic-based strings to prevent quota errors.
 */

export const generateGameRecap = async (game: GameResult, homeTeam: Team, awayTeam: Team) => {
  const winner = game.homeScore > game.awayScore ? homeTeam : awayTeam;
  const loser = game.homeScore > game.awayScore ? awayTeam : homeTeam;
  const topPerf = game.topPerformers[0];
  
  return `FINAL: ${winner.name} defeat ${loser.name} ${Math.max(game.homeScore, game.awayScore)}-${Math.min(game.homeScore, game.awayScore)}. Notable: ${topPerf.points} points recorded by leading scorer.`;
};

export const generateAwardBlurb = async (awardName: string, winner: AwardWinner) => {
  return `${winner.name} dominated the competition this season for the ${winner.teamName}, leading his squad with ${winner.statsLabel} and establishing himself as the premier talent in the league for the ${awardName} honor.`;
};

export const generateNewsHeadline = async (category: NewsCategory, data: { player?: Player, team?: Team, coach?: Coach, detail?: string }) => {
  const name = data.player?.name || data.coach?.name || data.team?.name || "League source";
  
  switch(category) {
    case 'rumor': return `LEAGUE INSIDER: Hearing whispers that ${name} is looking for a major change of scenery before the deadline.`;
    case 'transaction': return `OFFICIAL: ${name} has finalized a move. Details internal but impact expected to be immediate.`;
    case 'injury': return `MEDICAL UPDATE: ${name} is dealing with a significant physical setback. Staff optimistic but cautious on return timeline.`;
    case 'firing': return `BREAKING: The organization has parted ways with ${name}. A search for a replacement begins immediately.`;
    case 'trade_request': return `DRAMA: Sources indicate ${name} has formally requested a trade. The front office is exploring all options.`;
    case 'award': return `CELEBRATION: ${name} has been recognized for outstanding performance. A career milestone reached.`;
    default: return `UPDATE: ${name} continues to be a major talking point across the league landscape.`;
  }
};

export const generateScoutingReport = async (player: Player | Prospect) => {
  const traits = player.personalityTraits.join(", ");
  const origin = (player as Prospect).school || player.college;
  const hometown = player.hometown;
  
  return `SCOUTING ANALYSIS:
• Elite ${player.position} prototype from ${origin} (${hometown}) with a current rating of ${player.rating}.
• Demonstrates ${traits} traits that impact locker room dynamics significantly.
• High-upside talent compared to top-tier league starters; projected to be a ${player.rating > 85 ? 'franchise cornerstone' : 'reliable rotation piece'}.`;
};

export const generateCoachScoutingReport = async (coach: Coach) => {
  return `TACTICAL OVERVIEW:
Coach ${coach.name} utilizes a ${coach.scheme} philosophy. Strengths include Offense (${coach.ratingOffense}) and Motivation (${coach.ratingMotivation}). Known for ${coach.badges.length > 0 ? coach.badges[0] : 'steady leadership'} and a history of player development.`;
};

export const generateAgentReport = async (player: Player, team: Team, offer: ContractOffer) => {
  const desired = player.desiredContract?.salary || 0;
  const ratio = offer.salary / (desired || 1);
  
  if (ratio < 0.7) return "This offer is frankly insulting. My client deserves to be compensated fairly based on his OVR of ${player.rating}.";
  if (ratio < 0.9) return "We are listening, but the numbers need to climb. The market is hot for players of this caliber.";
  return `The ${team.name} are showing real commitment. We are very interested in these terms and the fit in ${team.city}.`;
};

export const generateTeamComparisonInsight = async (team1: Team, team2: Team) => {
  const t1Ovr = Math.round(team1.roster.reduce((a,b)=>a+b.rating,0)/team1.roster.length);
  const t2Ovr = Math.round(team2.roster.reduce((a,b)=>a+b.rating,0)/team2.roster.length);
  
  const edge = t1Ovr > t2Ovr ? team1.name : team2.name;
  return `The ${team1.name} bring a ${t1Ovr} OVR rating against the ${team2.name}'s ${t2Ovr}. Data suggests the ${edge} have the tactical advantage in the paint, though bench depth could decide the outcome.`;
};

export const generateSeasonNarrative = async (teams: Team[]) => {
  const sorted = [...teams].sort((a, b) => b.wins - a.wins);
  const leader = sorted[0];
  const bottom = sorted[sorted.length - 1];
  
  return `The ${leader.name} are currently terrorizing the league with a ${leader.wins}-${leader.losses} record, while the ${bottom.name} are struggling to find identity in the basement.`;
};
