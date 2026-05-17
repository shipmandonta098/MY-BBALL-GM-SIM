
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

export const generateAwards = async (teams: Team[], year: number, playerGenderRatio = 0): Promise<SeasonAwards> => {
  const isFemaleLeague = playerGenderRatio === 100;
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

  // 3. ROY — true first-year players only.
  //    Primary gate: p.isRookie === true (stamped at draft time, cleared at season-end).
  //    Backward-compat fallback for pre-flag saves: drafted this exact season.
  //    NO gamesPlayed fallback — that catches every veteran.
  const isRookieEligible = (p: Player): boolean => {
    if (p.isRookie === true) return true;
    // Fallback for saves created before the isRookie flag existed
    if ((p.careerStats?.length ?? 0) > 0) return false;
    return p.draftInfo?.year === year;
  };
  const rookies = allPlayers.filter(entry => isRookieEligible(entry.p));
  const royPool = [...rookies].sort((a, b) => getPlayerStatsValue(b.p, b.t) - getPlayerStatsValue(a.p, a.t));
  const royEntry = royPool[0] ?? null;
  const roy: AwardWinner = royEntry
    ? {
        playerId: royEntry.p.id,
        name: royEntry.p.name,
        teamId: royEntry.t.id,
        teamName: royEntry.t.name,
        statsLabel: getStatsLabel(royEntry.p),
      }
    : { name: '—', teamId: '', teamName: 'No eligible rookies', statsLabel: '' };
  if (royEntry) roy.blurb = await generateAwardBlurb('Rookie of the Year', roy);

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
  sixthMan.blurb = await generateAwardBlurb(isFemaleLeague ? 'Sixth Woman of the Year' : 'Sixth Man of the Year', sixthMan);

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

  const eoyGMName = eoyCandidate.gmName ?? `GM of the ${eoyCandidate.name}`;
  const executiveOfTheYear: AwardWinner = {
    gmId: 'gm-' + eoyCandidate.id,
    name: eoyGMName,
    teamId: eoyCandidate.id,
    teamName: eoyCandidate.name,
    statsLabel: `${eoyCandidate.wins}-${eoyCandidate.losses} — General Manager, ${eoyCandidate.city} ${eoyCandidate.name}`
  };
  executiveOfTheYear.blurb = await generateAwardBlurb('Executive of the Year', executiveOfTheYear);

  // All-NBA Logic
  const top15 = [...allPlayers]
    .sort((a, b) => getPlayerStatsValue(b.p, b.t) - getPlayerStatsValue(a.p, a.t))
    .slice(0, 15)
    .map(e => e.p.id);

  const defSorted = [...allPlayers]
    .sort((a, b) => b.p.attributes.defense - a.p.attributes.defense)
    .slice(0, 10)
    .map(e => e.p.id);

  const rookieSorted = royPool  // already sorted, already filtered to true rookies
    .slice(0, 10)
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
    allDefensive: defSorted.slice(0, 5),
    allDefensiveSecond: defSorted.slice(5, 10),
    allRookie: rookieSorted.slice(0, 5),
    allRookieSecond: rookieSorted.slice(5, 10),
  };
};
