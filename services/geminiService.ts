import { Player, GameResult, Team, Prospect, ContractOffer, Coach, NewsCategory, AwardWinner } from "../types";

/**
 * GEMINI API DISABLED
 * All functions below now return hardcoded or logic-based strings to prevent quota errors.
 */

export const generateGameRecap = async (game: GameResult, homeTeam: Team, awayTeam: Team) => {
  const winner = game.homeScore > game.awayScore ? homeTeam : awayTeam;
  const loser  = game.homeScore > game.awayScore ? awayTeam : homeTeam;
  const topPerf = game.topPerformers[0];
  const hi = Math.max(game.homeScore, game.awayScore);
  const lo = Math.min(game.homeScore, game.awayScore);

  if (game.isOvertime) {
    const otPeriods = (game.quarterScores?.home?.length ?? 4) - 4;
    const otLabel = otPeriods >= 3 ? 'triple overtime' : otPeriods === 2 ? 'double overtime' : 'overtime';
    return `FINAL/${otPeriods === 1 ? 'OT' : otPeriods === 2 ? '2OT' : '3OT'}: ${winner.name} survive a ${otLabel} thriller to defeat ${loser.name} ${hi}-${lo}. ${topPerf.points} points from the leading scorer sealed the victory in a game that refused to end in regulation.`;
  }

  return `FINAL: ${winner.name} defeat ${loser.name} ${hi}-${lo}. Notable: ${topPerf.points} points recorded by leading scorer.`;
};

export const generateAwardBlurb = async (awardName: string, winner: AwardWinner) => {
  return `${winner.name} dominated the competition this season for the ${winner.teamName}, leading his squad with ${winner.statsLabel} and establishing himself as the premier talent in the league for the ${awardName} honor.`;
};

export const generateNewsHeadline = async (category: NewsCategory, data: { player?: Player, team?: Team, coach?: Coach, detail?: string }) => {
  // If caller already provided rich detail, use it directly — it IS the content.
  if (data.detail) return data.detail;

  const name = data.player?.name || data.coach?.name || data.team?.name || "League source";
  const p = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  switch(category) {
    case 'rumor': return p([
      `Sources close to ${name}'s camp say he's grown restless. A change of scenery could come before the deadline.`,
      `Rumblings out of ${name}'s locker room: his relationship with the front office is frosty.`,
      `Multiple scouts spotted at ${name}'s last three games — never a coincidence this late in the season.`,
    ]);
    case 'transaction': return p([
      `${name} has been officially acquired. Expect an immediate impact on the rotation.`,
      `The deal is done. ${name} joins his new team as the front office makes a statement.`,
      `${name} has cleared waivers and the transaction is finalized. The move reshapes the roster.`,
    ]);
    case 'injury': return p([
      `${name} will miss time after leaving practice early. More details expected from the medical staff.`,
      `${name} listed as day-to-day after reporting discomfort. Team is monitoring the situation closely.`,
      `Trainers escorted ${name} off the court during shootaround. Status uncertain heading into the next game.`,
    ]);
    case 'firing': return p([
      `The organization has officially parted ways with ${name}. A nationwide search for a replacement begins now.`,
      `${name} is out. Sources say the decision had been building for weeks before today's announcement.`,
      `${name} will not return. The front office thanked him for his service but made clear it was time for a change.`,
    ]);
    case 'trade_request': return p([
      `${name} has formally requested a trade, per league sources. The front office is weighing its options.`,
      `The news is confirmed: ${name} wants out. His camp submitted a formal trade request this morning.`,
      `Sources say ${name} informed team leadership of his desire to be moved. Talks with other teams have begun.`,
    ]);
    case 'award': return p([
      `${name} has been honored for a remarkable season. A milestone moment in what is becoming a legendary career.`,
      `The award goes to ${name} — and it's hard to argue with the choice. He was the best at his craft this year.`,
      `${name} takes home the hardware. His peers voted, and the message was unanimous.`,
    ]);
    default: return `${name} remains a major talking point across the league.`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// In-league player scouting report
// ─────────────────────────────────────────────────────────────────────────────
function generateLeaguePlayerReport(p: Player): string {
  const a = p.attributes;
  const f1 = (n: number) => n.toFixed(1);
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  // Last full regular-season (non-split), most recent year
  const fullSeasons = [...(p.careerStats ?? [])]
    .filter(cs => !cs.isSplit && !cs.isPlayoffs)
    .sort((x, y) => y.year - x.year);
  const last = fullSeasons[0] ?? null;

  const ppg  = last && last.gamesPlayed > 0 ? last.points   / last.gamesPlayed : null;
  const rpg  = last && last.gamesPlayed > 0 ? last.rebounds  / last.gamesPlayed : null;
  const apg  = last && last.gamesPlayed > 0 ? last.assists   / last.gamesPlayed : null;
  const threePct = last && last.threepa > 0 ? (last.threepm / last.threepa * 100) : null;
  const fgPct    = last && last.fga     > 0 ? (last.fgm     / last.fga     * 100) : null;

  const salM  = (p.salary / 1_000_000).toFixed(1);
  const salNum = p.salary / 1_000_000;
  const yrs   = p.contractYears;
  const ovr   = p.rating;
  const pot   = p.potential;
  const age   = p.age;
  const pos   = p.position;
  const arch  = p.archetype || 'Role Player';
  const traits = p.personalityTraits ?? [];
  const isStarter = p.status === 'Starter';
  const isYoung   = age <= 24;
  const isPrime   = age >= 25 && age <= 30;
  const isVet     = age >= 31;

  const sentences: string[] = [];

  // ── 1. OPENING / OVERALL GRADE ──────────────────────────────────────────
  if (ovr >= 88) {
    sentences.push(pick([
      `${p.name} is a legitimate franchise cornerstone — a ${ovr} OVR ${pos} who commands double-teams and shapes every possession.`,
      `At ${ovr} overall, ${p.name} operates at a tier most players never reach; teams build rosters and schemes around talents like this.`,
      `A max-contract caliber ${pos} at ${ovr} OVR — the kind of player who moves the needle on playoff odds, ticket sales, and franchise trajectory.`,
    ]));
  } else if (ovr >= 82) {
    sentences.push(pick([
      `${p.name} is an All-Star caliber ${pos} at ${ovr} OVR — a go-to option in crunch time who makes everyone around him better.`,
      `A ${ovr} OVR ${arch} who has earned true starter money; reliable, high-floor, and capable of carrying an offense for stretches.`,
      `At ${ovr} overall, ${p.name} is the type of second star or primary option a team can genuinely build around.`,
    ]));
  } else if (ovr >= 75) {
    sentences.push(pick([
      `${p.name} is a quality ${pos} at ${ovr} OVR — a role player who excels in a defined system without needing creation duties.`,
      `Grades out at ${ovr} overall — a reliable contributor who does his job cleanly and doesn't demand the ball to be effective.`,
      `${p.name} profiles as a starter-grade role player at ${ovr} OVR; the fit and system will determine how impactful he actually is.`,
    ]));
  } else {
    sentences.push(pick([
      `At ${ovr} OVR, ${p.name} is a fringe-roster piece — valuable in specific matchups but limited in terms of overall game impact.`,
      `Grading as a ${ovr} OVR ${pos}: a depth option who can fill a need in a pinch but shouldn't be counted on for heavy minutes.`,
      `${p.name} is a replaceable ${ovr} OVR player — contributes modestly in a reserve role but doesn't change a team's ceiling.`,
    ]));
  }

  // ── 2. PRIMARY STRENGTH ─────────────────────────────────────────────────
  type AttrKey = keyof typeof a;
  const skillBank: { key: AttrKey; label: string }[] = [
    { key: 'shooting3pt', label: '3PT shooting' },
    { key: 'ballHandling', label: 'ball handling' },
    { key: 'passing',      label: 'playmaking' },
    { key: 'blocks',       label: 'shot-blocking' },
    { key: 'steals',       label: 'perimeter pressure and steals' },
    { key: 'layups',       label: 'finishing at the rim' },
    { key: 'postScoring',  label: 'post game' },
    { key: 'defReb',       label: 'defensive rebounding' },
    { key: 'offReb',       label: 'offensive rebounding' },
    { key: 'perimeterDef', label: 'perimeter defense' },
    { key: 'interiorDef',  label: 'interior defense' },
    { key: 'speed',        label: 'lateral quickness' },
    { key: 'strength',     label: 'strength and physicality' },
    { key: 'shootingMid',  label: 'mid-range shooting' },
    { key: 'defensiveIQ',  label: 'defensive IQ' },
    { key: 'offensiveIQ',  label: 'offensive IQ' },
  ];
  const ranked = [...skillBank].sort((x, y) => a[y.key] - a[x.key]);
  const top = ranked[0];
  const second = ranked[1];

  if (a[top.key] >= 87) {
    const shootNote = top.key === 'shooting3pt' && threePct !== null
      ? ` — shooting ${f1(threePct)}% from beyond the arc last season`
      : '';
    sentences.push(pick([
      `Elite ${top.label} at ${a[top.key]}${shootNote}; defenses have no answer when he gets space to operate.`,
      `The ${a[top.key]} ${top.label} is legitimate franchise-caliber — pairs with ${second.label} (${a[second.key]}) to give him two genuine weapons.`,
      `${top.label.charAt(0).toUpperCase() + top.label.slice(1)} at ${a[top.key]} is a difference-making skill, not a complementary one.`,
    ]));
  } else if (a[top.key] >= 76) {
    sentences.push(pick([
      `Solid ${top.label} (${a[top.key]}) gives him a dependable go-to tool; also shows ${a[second.key]} in ${second.label} as a secondary weapon.`,
      `His ${top.label} grades out at ${a[top.key]} — above average and effective, forming the foundation of his game.`,
      `The ${top.label} (${a[top.key]}) is the standout attribute — functional and consistent, even if not elite-tier.`,
    ]));
  } else {
    sentences.push(pick([
      `No elite skill on the sheet — best relative attribute is ${top.label} at ${a[top.key]}, which is barely adequate at professional level.`,
      `Limited toolkit; ${top.label} leads the way at only ${a[top.key]} — give him too much responsibility and he'll struggle.`,
    ]));
  }

  // ── 3. WEAKNESS ─────────────────────────────────────────────────────────
  const posWeak: Record<string, AttrKey[]> = {
    PG: ['defensiveIQ', 'perimeterDef', 'strength', 'interiorDef', 'offReb'],
    SG: ['defensiveIQ', 'ballHandling', 'strength', 'interiorDef', 'passing'],
    SF: ['shooting3pt', 'ballHandling', 'interiorDef', 'postScoring', 'defensiveIQ'],
    PF: ['shooting3pt', 'ballHandling', 'speed', 'passing', 'perimeterDef'],
    C:  ['shooting3pt', 'ballHandling', 'speed', 'perimeterDef', 'defensiveIQ'],
  };
  const weakKeys = posWeak[pos] ?? posWeak.PG;
  const weakList = weakKeys.map(k => ({ key: k, value: a[k] })).sort((x, y) => x.value - y.value);
  const worst = weakList[0];
  const attrLabels: Partial<Record<AttrKey, string>> = {
    defensiveIQ: 'defensive IQ', perimeterDef: 'perimeter defense', strength: 'strength',
    interiorDef: 'interior defense', ballHandling: 'ball handling', passing: 'passing',
    shooting3pt: '3PT shooting', speed: 'foot speed', postScoring: 'post game',
    offReb: 'offensive rebounding', defReb: 'defensive rebounding', durability: 'durability',
    shootingMid: 'mid-range shooting', offensiveIQ: 'offensive IQ', steals: 'steals ability',
    blocks: 'shot blocking', layups: 'rim finishing', freeThrow: 'free throw shooting',
  };
  const wLabel = attrLabels[worst.key] ?? String(worst.key);

  if (worst.value <= 55) {
    sentences.push(pick([
      `The glaring weakness is ${wLabel} at ${worst.value} — opposing coaches will draw up sets to exploit this every night.`,
      `A ${worst.value} ${wLabel} is a genuine liability that smart teams will attack relentlessly in pick-and-roll coverages.`,
      `${wLabel.charAt(0).toUpperCase() + wLabel.slice(1)} at ${worst.value} falls below the floor for a ${isStarter ? 'starter' : 'rotation player'} at this level; it is exploitable.`,
    ]));
  } else if (worst.value <= 68) {
    sentences.push(pick([
      `${wLabel.charAt(0).toUpperCase() + wLabel.slice(1)} (${worst.value}) is below average — not a dealbreaker but limits his defensive versatility in switching schemes.`,
      `The ${worst.value} ${wLabel} is a concern in modern lineups where everyone must guard multiple positions.`,
      `His ${wLabel} (${worst.value}) means his role must be carefully schemed around to hide that exposure.`,
    ]));
  } else {
    sentences.push(pick([
      `No glaring holes — weakest positional attribute is ${wLabel} (${worst.value}), which is functional if not exceptional.`,
      `Relatively well-rounded profile; the ${worst.value} ${wLabel} is the only relative soft spot and it is manageable.`,
    ]));
  }

  // ── 4. RECENT STATS ─────────────────────────────────────────────────────
  if (last && ppg !== null && rpg !== null && apg !== null && last.gamesPlayed >= 10) {
    const gp = last.gamesPlayed;
    const efficiency = fgPct !== null ? ` on ${f1(fgPct)}% shooting` : '';
    if (ppg >= 22) {
      sentences.push(pick([
        `Last season: ${f1(ppg)} PPG / ${f1(rpg)} RPG / ${f1(apg)} APG${efficiency} across ${gp} games — first-option scoring volume with no asterisks.`,
        `Stat line: ${f1(ppg)} / ${f1(rpg)} / ${f1(apg)} per game — a scorer who demanded the ball and delivered.`,
      ]));
    } else if (ppg >= 15) {
      sentences.push(pick([
        `Produced ${f1(ppg)} PPG / ${f1(rpg)} RPG / ${f1(apg)} APG last season — legitimate second-option numbers across ${gp} appearances.`,
        `Last year's line of ${f1(ppg)} / ${f1(rpg)} / ${f1(apg)} is consistent with a high-usage starter role.`,
      ]));
    } else if (ppg >= 8) {
      sentences.push(pick([
        `${f1(ppg)} / ${f1(rpg)} / ${f1(apg)} per game last season — role player production; he produces when the system feeds him, not as a creator.`,
        `Averaged ${f1(ppg)} PPG and ${f1(rpg)} RPG in ${gp} games — complementary piece numbers that match his roster standing.`,
      ]));
    } else {
      sentences.push(pick([
        `Thin box score: ${f1(ppg)} PPG / ${f1(rpg)} RPG / ${f1(apg)} APG in ${gp} games — a specialist whose value is in impact metrics more than counting stats.`,
        `Modest ${f1(ppg)} / ${f1(rpg)} / ${f1(apg)} last year — not a volume contributor; deploy in specific matchups only.`,
      ]));
    }
  } else if (!last) {
    sentences.push(`No full-season data on file — evaluation is based purely on physical attributes and scouting projections.`);
  }

  // ── 5. AGE / DEVELOPMENT / DECLINE ─────────────────────────────────────
  if (isYoung && pot >= ovr + 8) {
    sentences.push(pick([
      `Still only ${age} with a ${pot} POT ceiling — the gap between now (${ovr} OVR) and his peak represents real, bankable upside.`,
      `At ${age} years old and ${pot} POT, the best basketball is ahead of him; scouts are watching closely.`,
      `Only ${age} — the ${pot} potential ceiling suggests meaningful growth is still available with the right development staff.`,
    ]));
  } else if (isYoung && pot < ovr + 5) {
    sentences.push(pick([
      `Young at ${age} but the ${pot} POT ceiling limits long-term excitement; what you see at ${ovr} OVR is largely what you'll get.`,
      `Age ${age} with limited upside (${pot} POT vs ${ovr} OVR) — not a long-term bet, just a current-value piece.`,
    ]));
  } else if (isPrime) {
    sentences.push(pick([
      `In his prime window at ${age} — operating near his ceiling (${ovr} OVR / ${pot} POT); dependable floor, minimal risk of major regression for 2-3 years.`,
      `Age ${age} prime player: the production is real and the durability risk is low. This is his best basketball.`,
    ]));
  } else if (isVet && a.speed <= 68) {
    sentences.push(pick([
      `At ${age}, the athleticism decline is visible — foot speed (${a.speed}) and explosion have dropped off. Trade window is narrowing faster than his OVR suggests.`,
      `A ${age}-year-old veteran whose physical tools (speed: ${a.speed}) are eroding; he is a sell-high candidate before further decline accelerates.`,
    ]));
  } else if (isVet) {
    sentences.push(pick([
      `A ${age}-year-old vet who compensates with experience and IQ; don't expect reinvention, but he won't lose a locker room either.`,
      `At ${age}, he has learned to play within his limits — effective in a defined role even as the physical peak fades.`,
    ]));
  }

  // ── 6. CONTRACT / TRADE VALUE ───────────────────────────────────────────
  if (ovr >= 85 && yrs <= 1) {
    sentences.push(pick([
      `Extension talks are urgent: $${salM}M/yr with just ${yrs} year${yrs !== 1 ? 's' : ''} left — front offices must decide now or face a max UFA decision.`,
      `With $${salM}M and ${yrs} yr${yrs !== 1 ? 's' : ''} remaining, this is a franchise-defining crossroads: extend or flip for a haul. Stalling is the losing play.`,
    ]));
  } else if (ovr >= 80 && yrs >= 3) {
    sentences.push(pick([
      `The $${salM}M / ${yrs}-year deal is solid value for a ${ovr} OVR contributor — a clean, tradeable asset if roster priorities shift.`,
      `Long-term locked at $${salM}M for ${yrs} more seasons; contenders will covet this deal if he stays healthy.`,
    ]));
  } else if (ovr <= 72 && salNum >= 8 && yrs >= 2) {
    sentences.push(pick([
      `The contract is a problem: $${salM}M/yr for ${yrs} years at ${ovr} OVR is cap-unfriendly — moving this deal requires attaching sweeteners.`,
      `Overpaid relative to production — $${salM}M for ${yrs} more years is a negative asset in most trade conversations.`,
    ]));
  } else {
    sentences.push(pick([
      `On $${salM}M with ${yrs} year${yrs !== 1 ? 's' : ''} left — workable contract that doesn't handcuff cap flexibility.`,
      `Fair-value deal at $${salM}M / ${yrs} yr${yrs !== 1 ? 's' : ''}; tradeable if the right offer comes, no pressure to move.`,
    ]));
  }

  // ── 7. PERSONALITY / LOCKER ROOM ────────────────────────────────────────
  const negTraits = traits.filter(t => ['Diva/Star', 'Lazy', 'Hot Head', 'Money Hungry'].includes(t));
  const posTraits = traits.filter(t => ['Leader', 'Professional', 'Gym Rat', 'Workhorse', 'Clutch', 'Friendly/Team First', 'Loyal'].includes(t));

  if (negTraits.length >= 2) {
    sentences.push(pick([
      `Locker room risk: ${negTraits.join(' + ')} traits are a chemistry concern — demands active management and a strong culture around him.`,
      `Character red flag: ${negTraits.join(' and ')} tendencies make this a high-maintenance addition. Team culture must be assessed before acquiring.`,
    ]));
  } else if (negTraits.length === 1) {
    sentences.push(pick([
      `One character flag — ${negTraits[0]} trait is manageable with strong leadership but worth monitoring closely in losing stretches.`,
      `The ${negTraits[0]} personality is a soft concern; not a dealbreaker but warrants a locker room conversation pre-acquisition.`,
    ]));
  } else if (posTraits.length >= 2) {
    sentences.push(pick([
      `Character is a genuine asset: ${posTraits.slice(0, 2).join(' and ')} traits make him a low-maintenance, high-culture locker room addition.`,
      `${posTraits[0]} and ${posTraits[1]} personality — the type of player coaches trust in the fourth quarter and in the film room.`,
    ]));
  } else if (posTraits.length === 1) {
    sentences.push(`The ${posTraits[0]} trait is a quiet plus — adds culture value that won't show up on the stat sheet.`);
  } else if (traits.length > 0) {
    sentences.push(`Neutral personality profile (${traits.join(', ')}) — no significant locker room upside or downside expected.`);
  }

  // ── 8. ALL-STAR PEDIGREE ─────────────────────────────────────────────────
  if (p.allStarSelections && p.allStarSelections.length > 0) {
    const n = p.allStarSelections.length;
    sentences.push(pick([
      `${n}-time All-Star — the pedigree is real and trade value reflects it.`,
      `Proven at the highest level with ${n} All-Star selection${n > 1 ? 's' : ''}; postseason credibility and winning culture fit.`,
    ]));
  }

  // ── ASSEMBLE (4–6 sentences) ─────────────────────────────────────────────
  const out = sentences.slice(0, 6);
  return `SCOUTING ANALYSIS — ${p.name.toUpperCase()} | ${pos} | OVR ${ovr} | POT ${pot}\n\n`
    + out.map(s => `• ${s}`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Prospect report (draft context — unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function generateProspectReport(player: Prospect): string {
  const traits = player.personalityTraits.join(', ');
  const origin = player.school || player.college;
  return `DRAFT SCOUTING — ${player.name.toUpperCase()} | ${player.position} | OVR ${player.rating}\n\n`
    + `• ${player.position} prospect out of ${origin} (${player.hometown}) — current grade: ${player.rating} OVR.\n`
    + `• Shows ${traits} traits; locker room impact will depend heavily on system fit and veteran mentorship.\n`
    + `• Projection: ${player.rating > 85 ? 'potential franchise cornerstone with immediate impact' : player.rating > 75 ? 'solid rotation contributor with starter upside' : 'developmental prospect; needs 1–2 seasons before meaningful minutes'}.`;
}

export const generateScoutingReport = async (player: Player | Prospect) => {
  // Distinguish in-league players (have salary) from draft prospects
  if ('salary' in player) {
    return generateLeaguePlayerReport(player as Player);
  }
  return generateProspectReport(player as Prospect);
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
