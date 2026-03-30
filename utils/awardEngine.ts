
import { Team, Player, SeasonAwards, AwardWinner, Coach } from '../types';
import { generateAwardBlurb } from '../services/geminiService';

const getPlayerStatsValue = (p: Player, team: Team) => {
  const gp = Math.max(1, p.stats.gamesPlayed);
  return (
    (p.stats.points / gp) * 1.5 +
    (p.stats.rebounds / gp) * 1.2 +
    (p.stats.assists / gp) * 1.5 +
    (p.stats.blocks / gp) * 2.0 +
    (p.stats.steals / gp) * 2.0 +
    (team.wins / 5) +
    (p.rating / 10)
  );
};

const getStatsLabel = (p: Player) => {
  const gp = Math.max(1, p.stats.gamesPlayed);
  return `${(p.stats.points / gp).toFixed(1)} PPG, ${(p.stats.rebounds / gp).toFixed(1)} RPG, ${(p.stats.assists / gp).toFixed(1)} APG`;
};

export const generateAwards = async (teams: Team[], year: number): Promise<SeasonAwards> => {
  const allPlayers = teams.flatMap(t => t.roster.map(p => ({ p, t })));
  
  // 1. MVP
  const mvpCandidate = [...allPlayers].sort((a, b) => getPlayerStatsValue(b.p, b.t) - getPlayerStatsValue(a.p, a.t))[0];
  const mvp: AwardWinner = {
    playerId: mvpCandidate.p.id,
    name: mvpCandidate.p.name,
    teamId: mvpCandidate.t.id,
    teamName: mvpCandidate.t.name,
    statsLabel: getStatsLabel(mvpCandidate.p)
  };
  mvp.blurb = await generateAwardBlurb('Most Valuable Player', mvp);

  // 2. DPOY
  const dpoyCandidate = [...allPlayers].sort((a, b) => {
    const aDef = (a.p.stats.blocks + a.p.stats.steals) / Math.max(1, a.p.stats.gamesPlayed) + (a.p.attributes.defense / 10);
    const bDef = (b.p.stats.blocks + b.p.stats.steals) / Math.max(1, b.p.stats.gamesPlayed) + (b.p.attributes.defense / 10);
    return bDef - aDef;
  })[0];
  const dpoy: AwardWinner = {
    playerId: dpoyCandidate.p.id,
    name: dpoyCandidate.p.name,
    teamId: dpoyCandidate.t.id,
    teamName: dpoyCandidate.t.name,
    statsLabel: `${(dpoyCandidate.p.stats.steals / Math.max(1, dpoyCandidate.p.stats.gamesPlayed)).toFixed(1)} SPG, ${(dpoyCandidate.p.stats.blocks / Math.max(1, dpoyCandidate.p.stats.gamesPlayed)).toFixed(1)} BPG`
  };
  dpoy.blurb = await generateAwardBlurb('Defensive Player of the Year', dpoy);

  // 3. ROY — use draftInfo.year to find true rookies (drafted this season)
  const rookies = allPlayers.filter(entry => entry.p.draftInfo?.year === year);
  const royPool = rookies.length > 0
    ? rookies
    : allPlayers.filter(entry => entry.p.age <= 23); // fallback for edge cases
  const royCandidate = royPool.sort((a, b) => getPlayerStatsValue(b.p, b.t) - getPlayerStatsValue(a.p, a.t))[0]
    ?? allPlayers[0]; // ultimate safety fallback
  const roy: AwardWinner = {
    playerId: royCandidate.p.id,
    name: royCandidate.p.name,
    teamId: royCandidate.t.id,
    teamName: royCandidate.t.name,
    statsLabel: getStatsLabel(royCandidate.p)
  };
  roy.blurb = await generateAwardBlurb('Rookie of the Year', roy);

  // 4. Sixth Man — bench players only; three independent checks to prevent any starter slipping through:
  //    (a) player.status must be Bench or Rotation — never Starter
  //    (b) not listed in the team's active rotation.starters object
  //    (c) gamesStarted must be ≤ 20 % of gamesPlayed (guards against status being stale
  //        when a bench player was promoted mid-season and accumulated starter stats)
  const sixthManCandidates = allPlayers.filter(entry => {
    if (entry.p.status === 'Starter') return false;
    const rotationStarters = Object.values(entry.t.rotation?.starters ?? {});
    if (rotationStarters.includes(entry.p.id)) return false;
    const gp = Math.max(1, entry.p.stats.gamesPlayed);
    if ((entry.p.stats.gamesStarted ?? 0) > Math.floor(gp * 0.20)) return false;
    return entry.p.status === 'Bench' || entry.p.status === 'Rotation';
  });
  const sixthManCandidate = sixthManCandidates.sort((a, b) => getPlayerStatsValue(b.p, b.t) - getPlayerStatsValue(a.p, a.t))[0];
  const sixthMan: AwardWinner = {
    playerId: sixthManCandidate.p.id,
    name: sixthManCandidate.p.name,
    teamId: sixthManCandidate.t.id,
    teamName: sixthManCandidate.t.name,
    statsLabel: getStatsLabel(sixthManCandidate.p)
  };
  sixthMan.blurb = await generateAwardBlurb('Sixth Man of the Year', sixthMan);

  // 5. MIP
  const mipCandidate = [...allPlayers].sort((a,b) => b.p.rating - a.p.rating)[5];
  const mip: AwardWinner = {
    playerId: mipCandidate.p.id,
    name: mipCandidate.p.name,
    teamId: mipCandidate.t.id,
    teamName: mipCandidate.t.name,
    statsLabel: `Rating: ${mipCandidate.p.rating}`
  };
  mip.blurb = await generateAwardBlurb('Most Improved Player', mip);

  // 6. COY
  const coyCandidate = [...teams].sort((a, b) => (b.wins / (b.staff.headCoach?.ratingOffense || 1)) - (a.wins / (a.staff.headCoach?.ratingOffense || 1)))[0];
  const coy: AwardWinner = {
    coachId: coyCandidate.staff.headCoach?.id,
    name: coyCandidate.staff.headCoach?.name || 'N/A',
    teamId: coyCandidate.id,
    teamName: coyCandidate.name,
    statsLabel: `${coyCandidate.wins}-${coyCandidate.losses} Record`
  };
  coy.blurb = await generateAwardBlurb('Coach of the Year', coy);

  // 7. Executive of the Year (EOY)
  const eoyCandidate = [...teams].sort((a, b) => {
    // Score based on win improvement and efficiency
    const aImprovement = a.wins - (a.prevSeasonWins || 35);
    const bImprovement = b.wins - (b.prevSeasonWins || 35);
    
    const aPayroll = a.roster.reduce((s,p)=>s+p.salary, 0);
    const bPayroll = b.roster.reduce((s,p)=>s+p.salary, 0);
    
    // Win efficiency: wins / payroll in millions
    const aEfficiency = a.wins / (aPayroll / 1000000);
    const bEfficiency = b.wins / (bPayroll / 1000000);

    const aScore = aImprovement * 2 + aEfficiency * 15 + (a.wins / 10);
    const bScore = bImprovement * 2 + bEfficiency * 15 + (b.wins / 10);

    return bScore - aScore;
  })[0];

  const executiveOfTheYear: AwardWinner = {
    gmId: 'gm-' + eoyCandidate.id,
    name: `General Manager of the ${eoyCandidate.name}`,
    teamId: eoyCandidate.id,
    teamName: eoyCandidate.name,
    statsLabel: `Lead improvement to ${eoyCandidate.wins} wins`
  };
  executiveOfTheYear.blurb = await generateAwardBlurb('Executive of the Year', executiveOfTheYear);

  // All-NBA Logic
  const top15 = [...allPlayers]
    .sort((a, b) => getPlayerStatsValue(b.p, b.t) - getPlayerStatsValue(a.p, a.t))
    .slice(0, 15)
    .map(e => e.p.id);

  return {
    year,
    mvp,
    dpoy,
    roy,
    sixthMan,
    mip,
    coy,
    executiveOfTheYear,
    allNbaFirst: top15.slice(0, 5),
    allNbaSecond: top15.slice(5, 10),
    allNbaThird: top15.slice(10, 15),
    allDefensive: [...allPlayers].sort((a, b) => b.p.attributes.defense - a.p.attributes.defense).slice(0, 5).map(e => e.p.id),
    allRookie: rookies.sort((a, b) => getPlayerStatsValue(b.p, b.t) - getPlayerStatsValue(a.p, a.t)).slice(0, 5).map(e => e.p.id)
  };
};
