import { Player, LeagueState, TradePiece, DraftPick } from '../types';

export type OwnerMood = 'elated' | 'happy' | 'neutral' | 'concerned' | 'angry';

export interface OwnerReaction {
  ownerDelta: number;
  fanDelta: number;
  mood: OwnerMood;
  title: string;
  quote: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const moodFromDelta = (d: number): OwnerMood =>
  d >= 10 ? 'elated' : d >= 4 ? 'happy' : d >= -3 ? 'neutral' : d >= -9 ? 'concerned' : 'angry';

// ── Signing reaction ─────────────────────────────────────────────────────────
export const calcSigningReaction = (
  player: Player,
  salary: number,
  contractYears: number,
  league: LeagueState,
): OwnerReaction => {
  const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;
  const salaryCap  = league.settings.salaryCap  || 140_000_000;
  const taxLine    = league.settings.luxuryTaxLine || 0;
  const userTeam   = league.teams.find(t => t.id === league.userTeamId)!;
  const currentPayroll = userTeam.roster.reduce((s, p) => s + (p.salary || 0), 0);
  const newPayroll = currentPayroll + salary;
  const capPct     = salary / salaryCap;

  // Player quality delta (+)
  let playerDelta =
    player.rating >= 92 ? 16 :
    player.rating >= 87 ? 11 :
    player.rating >= 82 ? 6  :
    player.rating >= 76 ? 3  :
    player.rating >= 70 ? 1  : 0;

  // Salary concern delta (-)
  let salaryDelta = 0;
  if (capPct > 0.30)       salaryDelta = -12;
  else if (capPct > 0.22)  salaryDelta = -7;
  else if (capPct > 0.15)  salaryDelta = -3;
  else if (capPct < 0.07)  salaryDelta = +2;   // bargain deal

  // Luxury tax penalty
  if (taxLine > 0 && newPayroll > taxLine) salaryDelta -= 6;

  // Contract length concern (>4 yrs for aging player)
  if (contractYears > 4 && player.age >= 32) salaryDelta -= 4;
  if (contractYears > 3 && player.age >= 35) salaryDelta -= 5;

  const ownerDelta = clamp(playerDelta + salaryDelta, -15, 18);
  const fanDelta   = clamp(Math.round(ownerDelta * 0.8), -12, 15);
  const mood       = moodFromDelta(ownerDelta);
  const n          = player.name;
  const ratingLabel =
    player.rating >= 90 ? 'superstar' :
    player.rating >= 83 ? 'star player' :
    player.rating >= 76 ? 'quality starter' : 'rotation player';

  const titles: Record<OwnerMood, string> = {
    elated:    `Owner is ecstatic about signing ${n}!`,
    happy:     `Owner approves of the ${n} signing.`,
    neutral:   `Owner has mixed feelings about the deal.`,
    concerned: `Owner is concerned about the ${n} contract.`,
    angry:     `Owner is furious about the terms of this deal!`,
  };

  const quotes: Record<OwnerMood, string[]> = {
    elated: [
      `"${n} is exactly the kind of ${ratingLabel} we've been missing. This puts us squarely in title contention — sign the paperwork!"`,
      `"I couldn't be more excited. ${n} changes the calculus for this franchise. Let's get to work."`,
      `"Outstanding work, GM. ${n} on our roster sends a message to the entire league."`,
    ],
    happy: [
      `"Good move. ${n} gives us real depth and I like the trajectory we're on."`,
      `"Solid signing. ${n} fills a genuine need and the money is reasonable."`,
      `"I can support this one. ${n} should contribute and the fans will appreciate the upgrade."`,
    ],
    neutral: [
      `"It's a reasonable deal for a ${ratingLabel}, but I'll need to see returns on this investment."`,
      `"${n} could help us, but the contract length gives me pause. Let's make sure it works."`,
      `"I'll sign off on this. We needed someone at that position and ${n} fits the profile."`,
    ],
    concerned: [
      `"That's a lot of money for ${n}. We're pushing our budget hard — I hope the production follows."`,
      `"I'm signing off, but I want to be clear: ${n} needs to perform at that salary level. We're in the tax."`,
      `"The numbers are uncomfortable. If ${n} doesn't deliver, this will come back on both of us."`,
    ],
    angry: [
      `"This is fiscally irresponsible! We're hemorrhaging money and now this? I want an explanation."`,
      `"I cannot believe the terms of this deal. ${n} at that price for that many years is a disaster waiting to happen."`,
      `"You've put this franchise in a very difficult position. I'll be watching this one very closely."`,
    ],
  };

  return {
    ownerDelta,
    fanDelta,
    mood,
    title: titles[mood],
    quote: pick(quotes[mood]),
  };
};

// ── Trade reaction ────────────────────────────────────────────────────────────
export const calcTradeReaction = (
  userPieces: TradePiece[],
  partnerPieces: TradePiece[],
  league: LeagueState,
): OwnerReaction => {
  const outPlayers = userPieces.filter(p => p.type === 'player').map(p => p.data as Player);
  const inPlayers  = partnerPieces.filter(p => p.type === 'player').map(p => p.data as Player);
  const outPicks   = userPieces.filter(p => p.type === 'pick').length;
  const inPicks    = partnerPieces.filter(p => p.type === 'pick').length;

  const outAvg = outPlayers.length ? outPlayers.reduce((s, p) => s + p.rating, 0) / outPlayers.length : 72;
  const inAvg  = inPlayers.length  ? inPlayers.reduce((s, p) => s + p.rating,  0)  / inPlayers.length  : 72;
  const diff   = inAvg - outAvg;

  let ownerDelta =
    diff > 12 ? 14 : diff > 7 ? 9 : diff > 3 ? 5 : diff > 0 ? 2 :
    diff > -3 ? -1 : diff > -7 ? -6 : diff > -12 ? -10 : -14;

  // Pick adjustments
  if (outPicks > 0 && inPicks === 0) ownerDelta -= outPicks * 4;   // giving up picks for nothing back
  if (inPicks > 0 && outPicks === 0) ownerDelta += inPicks * 3;   // acquiring future assets

  // Salary dump bonus (trading away expensive player for picks/lesser player)
  const outSalary = outPlayers.reduce((s, p) => s + (p.salary || 0), 0);
  const inSalary  = inPlayers.reduce((s, p) => s + (p.salary  || 0), 0);
  if (outSalary - inSalary > 10_000_000) ownerDelta += 3;   // meaningful cap relief

  const topIn  = inPlayers.length  ? inPlayers.sort((a, b) => b.rating - a.rating)[0]  : null;
  const topOut = outPlayers.length ? outPlayers.sort((a, b) => b.rating - a.rating)[0] : null;

  ownerDelta = clamp(ownerDelta, -14, 14);
  const fanDelta = clamp(Math.round(ownerDelta * 0.75), -10, 10);
  const mood = moodFromDelta(ownerDelta);

  const inName  = topIn?.name  ?? 'the incoming player';
  const outName = topOut?.name ?? 'the outgoing player';
  const picksNote = outPicks > 0 ? ` Giving away ${outPicks > 1 ? 'multiple picks' : 'a pick'} is a real cost.` : '';

  const titles: Record<OwnerMood, string> = {
    elated:    `Owner loves this trade — franchise-altering move!`,
    happy:     `Owner approves of the deal.`,
    neutral:   `Owner has a measured reaction to the trade.`,
    concerned: `Owner is worried about what we gave up.`,
    angry:     `Owner is furious about this trade!`,
  };

  const quotes: Record<OwnerMood, string[]> = {
    elated: [
      `"Getting ${inName} is a coup. This changes our ceiling dramatically — well done."`,
      `"I've been waiting for us to make a move like this. ${inName} elevates us immediately."`,
    ],
    happy: [
      `"I like what we're getting in return. ${inName} addresses a real need on this roster."`,
      `"Solid basketball trade. The talent we're receiving justifies what we gave up."`,
    ],
    neutral: [
      `"It's a fair deal. We get some talent back, though I'll miss what ${outName} brought.${picksNote}"`,
      `"Reasonable trade-off. Let's hope ${inName} lives up to expectations in our system."`,
    ],
    concerned: [
      `"I'm worried we didn't get full value here.${picksNote} ${outName} was important to us."`,
      `"The front office needs to be more careful with our assets. I'm not fully comfortable with this.${picksNote}"`,
    ],
    angry: [
      `"This is a disaster. We gave away ${outName} and what exactly did we get back? I'm not happy."`,
      `"I should have been consulted before this. We've weakened this team significantly.${picksNote}"`,
    ],
  };

  return { ownerDelta, fanDelta, mood, title: titles[mood], quote: pick(quotes[mood]) };
};

// ── Release / waive reaction ──────────────────────────────────────────────────
export const calcReleaseReaction = (
  player: Player,
  isStarter: boolean,
  league: LeagueState,
): OwnerReaction => {
  const userTeam   = league.teams.find(t => t.id === league.userTeamId)!;
  const payroll    = userTeam.roster.reduce((s, p) => s + (p.salary || 0), 0);
  const salaryCap  = league.settings.salaryCap || 140_000_000;
  const capRelief  = (player.salary || 0) / salaryCap;

  let ownerDelta = 0;

  if (player.rating >= 82)       ownerDelta -= 10;
  else if (player.rating >= 75)  ownerDelta -= 5;
  else if (player.rating >= 68)  ownerDelta -= 2;
  else                           ownerDelta += 1;

  if (isStarter)                 ownerDelta -= 3;

  // Cap relief bonus for high salaries
  if (capRelief > 0.20)          ownerDelta += 5;
  else if (capRelief > 0.12)     ownerDelta += 2;

  // Long-term injury — cap cleanup is sensible
  if (player.injuryDaysLeft && player.injuryDaysLeft > 60) ownerDelta += 3;

  ownerDelta = clamp(ownerDelta, -13, 8);
  const fanDelta = clamp(Math.round(ownerDelta * 0.85), -10, 6);
  const mood = moodFromDelta(ownerDelta);
  const n = player.name;

  const titles: Record<OwnerMood, string> = {
    elated:    `Owner is relieved by the roster move.`,
    happy:     `Owner supports cutting ${n}.`,
    neutral:   `Owner has no strong feelings about the move.`,
    concerned: `Owner is worried about waiving ${n}.`,
    angry:     `Owner is furious about releasing ${n}!`,
  };

  const quotes: Record<OwnerMood, string[]> = {
    elated: [
      `"Smart roster management. Clearing that contract gives us real flexibility going forward."`,
      `"Good call. That salary was weighing us down and now we have room to operate."`,
    ],
    happy: [
      `"I trust the front office's judgment here. Sometimes you have to clear space to improve."`,
      `"Reasonable move. The roster needs to be built for winning, and this helps us get there."`,
    ],
    neutral: [
      `"It's a business decision. ${n} contributed, but if the front office believes this is right, I'll support it."`,
      `"Not an easy call, but I understand the reasoning. Let's make sure we use this cap space wisely."`,
    ],
    concerned: [
      `"I'm not thrilled about this. ${n} was a contributor and the fans liked having ${player.gender === 'Female' ? 'her' : 'him'} here."`,
      `"The locker room and fanbase are going to feel this one. I hope we have a plan to replace that production."`,
    ],
    angry: [
      `"This is a huge mistake. ${n} is exactly the kind of player we need and now we've let ${player.gender === 'Female' ? 'her' : 'him'} walk? The fans are going to be furious."`,
      `"I cannot believe we're releasing ${n}. That's a quality player and we just handed the competition a gift."`,
    ],
  };

  return { ownerDelta, fanDelta, mood, title: titles[mood], quote: pick(quotes[mood]) };
};
