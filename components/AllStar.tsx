import React, { useState } from 'react';
import {
  LeagueState, AllStarWeekendData, AllStarContestResult,
  AllStarGameResult, AllStarPlayerLine, Player, AllStarVoteEntry,
} from '../types';

interface AllStarProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState> | ((prev: LeagueState) => LeagueState)) => void;
  onAdvancePhase: () => void;
}

// ── SVG paths ────────────────────────────────────────────────────────────────
const STAR_PATH = 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPlayerById(league: LeagueState, id: string): Player | undefined {
  for (const team of league.teams) {
    const p = team.roster.find(pl => pl.id === id);
    if (p) return p;
  }
  return undefined;
}

function getTeamForPlayer(league: LeagueState, playerId: string) {
  for (const team of league.teams) {
    if (team.roster.some(p => p.id === playerId)) return team;
  }
  return null;
}

function teamName(league: LeagueState, playerId: string): string {
  const t = getTeamForPlayer(league, playerId);
  return t ? `${t.city} ${t.name}` : '';
}

function teamId(league: LeagueState, playerId: string): string {
  return getTeamForPlayer(league, playerId)?.id ?? '';
}

function ppg(p: Player) { return p.stats.gamesPlayed > 0 ? p.stats.points / p.stats.gamesPlayed : 0; }
function rpg(p: Player) { return p.stats.gamesPlayed > 0 ? p.stats.rebounds / p.stats.gamesPlayed : 0; }
function apg(p: Player) { return p.stats.gamesPlayed > 0 ? p.stats.assists / p.stats.gamesPlayed : 0; }

// ── Contest simulation ────────────────────────────────────────────────────────
function pickWinner(
  league: LeagueState,
  participants: string[],
  scorer: (p: Player) => number,
): { playerId: string; playerName: string; teamId: string; teamName: string; rawScore: number } {
  let best = participants[0];
  let bestScore = -1;
  for (const id of participants) {
    const p = getPlayerById(league, id);
    if (!p) continue;
    const s = scorer(p) + Math.random() * 20;
    if (s > bestScore) { bestScore = s; best = id; }
  }
  const w = getPlayerById(league, best)!;
  return { playerId: best, playerName: w.name, teamId: teamId(league, best), teamName: teamName(league, best), rawScore: bestScore };
}

function simulateSkillsChallenge(league: LeagueState, participants: string[]): AllStarContestResult {
  const pool = participants.length >= 4 ? participants : participants;
  const scorer = (p: Player) => (p.attributes.ballHandling || 0) * 0.4 + (p.attributes.speed || 0) * 0.35 + (p.attributes.passing || 0) * 0.25;
  const winner = pickWinner(league, pool, scorer);
  const runnerUpPool = pool.filter(id => id !== winner.playerId);
  const runnerUp = runnerUpPool.length > 0 ? pickWinner(league, runnerUpPool, scorer) : null;
  const times = ['15.2s', '14.8s', '15.9s', '13.6s', '16.1s'];
  const wTime = times[Math.floor(Math.random() * times.length)];
  const ruTime = times[Math.floor(Math.random() * times.length)];
  return {
    eventName: 'Skills Challenge',
    participants: pool,
    winner: { ...winner },
    runnerUp: runnerUp ? { ...runnerUp } : undefined,
    highlights: [
      `${winner.playerName} flew through the obstacle course in ${wTime} — a new record!`,
      runnerUp ? `${runnerUp.playerName} was close with ${ruTime} but came up just short.` : '',
      `The crowd erupted as ${winner.playerName} nailed the final shooting station.`,
    ].filter(Boolean),
  };
}

function simulate3PtContest(league: LeagueState, participants: string[]): AllStarContestResult {
  const scorer = (p: Player) => (p.attributes.shooting3pt || 0) * 0.7 + (p.attributes.freeThrow || 0) * 0.3;
  const winner = pickWinner(league, participants, scorer);
  const runnerUpPool = participants.filter(id => id !== winner.playerId);
  const runnerUp = runnerUpPool.length > 0 ? pickWinner(league, runnerUpPool, scorer) : null;
  const wScore = 18 + Math.floor(Math.random() * 9);
  const ruScore = Math.max(12, wScore - 1 - Math.floor(Math.random() * 5));
  const racks = ['the corner rack', 'the wing rack', 'the money ball rack'];
  const hotRack = racks[Math.floor(Math.random() * racks.length)];
  return {
    eventName: '3-Point Contest',
    participants,
    winner: { ...winner, score: `${wScore}/27` },
    runnerUp: runnerUp ? { ...runnerUp, score: `${ruScore}/27` } : undefined,
    highlights: [
      `${winner.playerName} drained ${wScore} of 27 to claim the title — nearly a perfect round!`,
      `${hotRack.charAt(0).toUpperCase() + hotRack.slice(1)} was money: ${winner.playerName} went 5-for-5!`,
      runnerUp ? `${runnerUp.playerName} finished runner-up at ${ruScore}/27 — an outstanding effort.` : '',
    ].filter(Boolean),
  };
}

function simulateDunkContest(league: LeagueState, participants: string[]): AllStarContestResult {
  const scorer = (p: Player) => (p.attributes.dunks || 0) * 0.45 + (p.attributes.jumping || 0) * 0.35 + (p.attributes.athleticism || 0) * 0.2;
  const winner = pickWinner(league, participants, scorer);
  const runnerUpPool = participants.filter(id => id !== winner.playerId);
  const runnerUp = runnerUpPool.length > 0 ? pickWinner(league, runnerUpPool, scorer) : null;
  const dunks = [
    'a between-the-legs off the back-board', 'a 360-degree windmill from the free-throw line',
    'a double-pump reverse off the glass', 'a no-look alley-oop off the backboard',
    'a behind-the-back dribble slam', 'a twisting baseline power jam',
  ];
  const d1 = dunks[Math.floor(Math.random() * dunks.length)];
  const d2 = dunks[Math.floor(Math.random() * dunks.length)];
  return {
    eventName: 'Dunk Contest',
    participants,
    winner: { ...winner, score: '50/50' },
    runnerUp: runnerUp ? { ...runnerUp, score: `${44 + Math.floor(Math.random() * 6)}/50` } : undefined,
    highlights: [
      `${winner.playerName} opened with ${d1} — an immediate perfect 50 from the judges!`,
      `The crowd went silent, then erupted: ${d2} to seal the crown.`,
      runnerUp ? `${runnerUp.playerName} put on a show but couldn't match ${winner.playerName}'s creativity.` : '',
    ].filter(Boolean),
  };
}

// ── Play-by-play generator ────────────────────────────────────────────────────
function generatePlayByPlay(
  eastLines: AllStarPlayerLine[],
  westLines: AllStarPlayerLine[],
  eQ: number[],
  wQ: number[],
): string[] {
  const verbs2 = [
    'drives and finishes at the rim', 'mid-range pull-up — GOOD', 'pump-fake and glides in',
    'floater over the outstretched hand', 'catch-and-shoot from the elbow',
    'turnaround jumper — money', 'tough bucket through contact',
    'step-back at the free-throw line', 'finger roll off the glass',
    'lefty scoop — GOOD', 'spin move and up-and-under',
  ];
  const verbs3 = [
    'fires from deep — THREE 🎯', 'step-back triple — SPLASH 💦',
    'top-of-the-arc — BANG', 'corner catch — nothing but net 🔥',
    'logo shot — nailed it!', 'hand in the face — SPLASH',
    'pull-up three — GOOD!',
  ];
  const dunkDescs = [
    'catches the lob and HAMMERS it 🔨', 'windmill jam off the fast break 🌀',
    'tomahawk slam — crowd erupts 🔥', 'off the alley-oop — BOOM 💥',
    'power dunk over the helpside!', 'between the legs — pure showmanship!',
    'off the glass, reverse slam!',
  ];
  const bigRunDescs = [
    'goes on a personal 6-0 run', 'hits back-to-back buckets to ignite the run',
    'takes over — three straight baskets', 'can\'t be stopped right now',
    'scores 6 in a blink',
  ];
  const assistVerbs = ['dishes to', 'threads the needle to', 'no-look pass to', 'behind-the-back to', 'beautiful feed to'];
  const nonScoring = [
    (name: string) => `${name} swats it away — BLOCKED! 🛡️`,
    (name: string) => `${name} picks the pocket and pushes in transition`,
    (name: string) => `Crowd on their feet after ${name}'s near-miss no-look`,
    (name: string) => `Timeout called on the floor — coaches huddle up`,
    (name: string) => `${name} shows off some handles, draws the oohs and ahhs`,
  ];

  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const pickWeighted = (lines: AllStarPlayerLine[]): AllStarPlayerLine => {
    if (lines.length === 0) return lines[0];
    const total = lines.reduce((s, l) => s + Math.max(1, l.pts), 0);
    let r = Math.random() * total;
    for (const l of lines) { r -= Math.max(1, l.pts); if (r <= 0) return l; }
    return lines[lines.length - 1];
  };

  type SEvent = { conf: 'East' | 'West'; pts: number; text: string };

  const buildEvents = (lines: AllStarPlayerLine[], target: number, conf: 'East' | 'West'): SEvent[] => {
    const evts: SEvent[] = [];
    let rem = target;
    const maxEvents = 11;
    while (rem > 3 && evts.length < maxEvents) {
      const shooter = pickWeighted(lines);
      const rand = Math.random();
      if (rand < 0.07 && rem >= 6) {
        // Big run — 6–8 pts chunk
        const runPlayer = pickWeighted(lines);
        const pts = Math.random() < 0.5 ? 6 : 8;
        evts.push({ conf, pts, text: `${runPlayer.playerName} ${pick(bigRunDescs)}` });
        rem -= pts;
      } else if (rand < 0.20 && shooter.threepa > 0 && rem >= 3) {
        evts.push({ conf, pts: 3, text: `${shooter.playerName} ${pick(verbs3)}` });
        rem -= 3;
      } else if (rand < 0.30 && shooter.pts >= 12) {
        evts.push({ conf, pts: 2, text: `${shooter.playerName} ${pick(dunkDescs)}` });
        rem -= 2;
      } else if (rand < 0.45 && lines.length >= 2) {
        const passer = pickWeighted(lines.filter(l => l.playerId !== shooter.playerId));
        evts.push({ conf, pts: 2, text: `${passer.playerName} ${pick(assistVerbs)} ${shooter.playerName} for 2` });
        rem -= 2;
      } else {
        evts.push({ conf, pts: 2, text: `${shooter.playerName} ${pick(verbs2)}` });
        rem -= 2;
      }
    }
    // Absorb remainder
    if (rem > 0 && lines.length > 0) {
      const shooter = pickWeighted(lines);
      const text = rem === 1
        ? `${shooter.playerName} converts 1-of-2 from the line`
        : rem === 3 ? `${shooter.playerName} ${pick(verbs3)}`
        : `${shooter.playerName} ${pick(verbs2)}`;
      evts.push({ conf, pts: rem, text });
    }
    return evts;
  };

  let cumE = 0;
  let cumW = 0;
  const plays: string[] = [];

  for (let q = 0; q < 4; q++) {
    plays.push(`──── Quarter ${q + 1} ────`);
    const eEvts = buildEvents(eastLines, eQ[q], 'East');
    const wEvts = buildEvents(westLines, wQ[q], 'West');

    // Interleave East/West events randomly
    const combined: SEvent[] = [];
    let ei = 0, wi = 0;
    while (ei < eEvts.length || wi < wEvts.length) {
      if (ei >= eEvts.length) { combined.push(wEvts[wi++]); continue; }
      if (wi >= wEvts.length) { combined.push(eEvts[ei++]); continue; }
      if (Math.random() < 0.5) combined.push(eEvts[ei++]);
      else combined.push(wEvts[wi++]);
    }

    // Inject 1–2 non-scoring flavor lines per quarter
    const flavourCount = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let f = 0; f < flavourCount; f++) {
      const allPlayers = [...eastLines, ...westLines];
      const fp = allPlayers[Math.floor(Math.random() * allPlayers.length)];
      const flavourIdx = Math.floor(Math.random() * (combined.length + 1));
      combined.splice(flavourIdx, 0, { conf: fp.playerId < 'p' ? 'East' : 'West', pts: 0, text: pick(nonScoring)(fp.playerName) });
    }

    for (const ev of combined) {
      if (ev.pts > 0) {
        if (ev.conf === 'East') cumE += ev.pts;
        else cumW += ev.pts;
      }
      const scoreTag = ev.pts > 0 ? ` · E ${cumE} – W ${cumW}` : '';
      plays.push(`${ev.conf === 'East' ? '🔵' : '🔴'} ${ev.text}${scoreTag}`);
    }

    // Snap cumulative to actual quarter totals to avoid drift
    const qEEnd = eQ.slice(0, q + 1).reduce((a, b) => a + b, 0);
    const qWEnd = wQ.slice(0, q + 1).reduce((a, b) => a + b, 0);
    plays.push(`📊 End Q${q + 1}: East ${qEEnd} – West ${qWEnd}`);
    cumE = qEEnd;
    cumW = qWEnd;
  }

  return plays;
}

// ── Per-player box score generator ───────────────────────────────────────────
function genTeamBoxScore(
  league: LeagueState,
  roster: string[],
  starters: string[],
  totalPts: number,
): AllStarPlayerLine[] {
  const players = roster
    .map(id => getPlayerById(league, id))
    .filter(Boolean) as Player[];
  if (players.length === 0) return [];

  // Scoring weight: rating + in-season ppg + noise (slightly bias toward guards/wings)
  const weights = players.map(p => {
    const posBonus = (p.position === 'PG' || p.position === 'SG') ? 8 : (p.position === 'SF') ? 4 : 0;
    return Math.max(1, p.rating * 0.55 + ppg(p) * 1.4 + posBonus + Math.random() * 14);
  });
  const totalW = weights.reduce((a, b) => a + b, 0);

  // Distribute team total points; ensure integer pts add up to totalPts
  const rawPts = players.map((_, i) => (weights[i] / totalW) * totalPts);
  let lines: AllStarPlayerLine[] = players.map((p, i) => {
    const pts = Math.round(rawPts[i]);
    const isStarter = starters.includes(p.id);

    // FG: build up to pts  (2-pt + 3-pt + ft)
    const shootPct = 0.50 + (p.attributes.shooting3pt / 1000) + Math.random() * 0.08;
    const fgaEst = pts > 0 ? Math.max(2, Math.round(pts / (shootPct * 2.1 + 0.25))) : Math.floor(Math.random() * 3);
    const fgm = Math.min(fgaEst, Math.round(fgaEst * shootPct));

    // 3PT split
    const is3Shooter = p.attributes.shooting3pt >= 68;
    const threepa = is3Shooter
      ? Math.min(fgm, Math.floor(1 + Math.random() * 6))
      : Math.floor(Math.random() * 3);
    const threepm = Math.min(threepa, Math.round(threepa * (0.35 + Math.random() * 0.25)));

    // FT
    const ftm = Math.floor(Math.random() * 5);
    const fta = ftm + (Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 2));

    // Boards — weighted by position
    const rebBase = p.position === 'C' ? 6 : p.position === 'PF' ? 5 : p.position === 'SF' ? 3 : 2;
    const reb = Math.floor(Math.random() * rebBase + (rebBase - 1));

    // Assists — weighted toward PG/SG
    const astBase = p.position === 'PG' ? 7 : p.position === 'SG' ? 4 : p.position === 'SF' ? 3 : 2;
    const ast = Math.floor(Math.random() * astBase);

    const stl = Math.floor(Math.random() * 3);
    const blk = (p.position === 'C' || p.position === 'PF') ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2);

    return { playerId: p.id, playerName: p.name, position: p.position, pts, reb, ast, stl, blk, fgm, fga: fgaEst, threepm, threepa, ftm, fta, isStarter };
  });

  // Fix rounding so sum equals totalPts exactly
  const diff = totalPts - lines.reduce((a, l) => a + l.pts, 0);
  if (diff !== 0 && lines.length > 0) {
    const topIdx = lines.reduce((best, l, i) => l.pts > lines[best].pts ? i : best, 0);
    lines[topIdx] = { ...lines[topIdx], pts: Math.max(0, lines[topIdx].pts + diff) };
  }

  return lines.sort((a, b) => b.pts - a.pts);
}

function simulateAllStarGame(
  league: LeagueState,
  eastRoster: string[],
  westRoster: string[],
  eastStarters: string[],
  westStarters: string[],
): AllStarGameResult {
  // Quarter-by-quarter — All-Star games score high
  const simQ = () => 38 + Math.floor(Math.random() * 18);
  const eQ = [simQ(), simQ(), simQ(), simQ()];
  const wQ = [simQ(), simQ(), simQ(), simQ()];
  const eastScore = eQ.reduce((a, b) => a + b, 0);
  const westScore = wQ.reduce((a, b) => a + b, 0);

  // Generate per-player box scores
  const eastLines = genTeamBoxScore(league, eastRoster, eastStarters, eastScore);
  const westLines = genTeamBoxScore(league, westRoster, westStarters, westScore);

  // MVP: best player on winning team by pts + (reb*0.5) + (ast*0.7)
  const winnerLines = eastScore >= westScore ? eastLines : westLines;
  const mvpLine = winnerLines.reduce((best, l) =>
    (l.pts + l.reb * 0.5 + l.ast * 0.7) > (best.pts + best.reb * 0.5 + best.ast * 0.7) ? l : best,
    winnerLines[0],
  );
  // Mark MVP in the box score
  const markMvp = (lines: AllStarPlayerLine[]) =>
    lines.map(l => l.playerId === mvpLine.playerId ? { ...l, isMvp: true } : l);

  const mvpPlayer = getPlayerById(league, mvpLine.playerId)!;
  const confWon = eastScore >= westScore ? 'East' : 'West';
  const statLine = `${mvpLine.pts} pts, ${mvpLine.reb} reb, ${mvpLine.ast} ast, ${mvpLine.stl} stl`;

  const highlights = [
    `${confWon} wins ${Math.max(eastScore, westScore)}-${Math.min(eastScore, westScore)} in an offensive showcase!`,
    `${mvpPlayer.name} was unstoppable: ${mvpLine.pts} points to claim MVP honours.`,
    `Both squads combined for ${eastScore + westScore} total points — an All-Star record.`,
    `${mvpPlayer.name} raises the MVP trophy to a standing ovation.`,
  ];

  // Bonus highlight if there was a close quarter
  const closeQ = eQ.findIndex((q, i) => Math.abs(q - wQ[i]) <= 2);
  if (closeQ >= 0) {
    highlights.splice(2, 0, `Q${closeQ + 1} was a thriller — just ${Math.abs(eQ[closeQ] - wQ[closeQ])} points separated the teams after three quarters of the period.`);
  }

  const playByPlay = generatePlayByPlay(eastLines, westLines, eQ, wQ);

  return {
    eastScore, westScore,
    mvp: {
      playerId: mvpLine.playerId,
      playerName: mvpPlayer.name,
      teamId: teamId(league, mvpLine.playerId),
      teamName: teamName(league, mvpLine.playerId),
      statLine,
    },
    eastRoster, westRoster,
    quarterScores: { east: eQ, west: wQ },
    highlights,
    boxScore: {
      east: markMvp(eastLines),
      west: markMvp(westLines),
    },
    playByPlay,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const OVRBadge: React.FC<{ rating: number }> = ({ rating }) => (
  <span
    className="font-bold text-xs px-1.5 py-0.5 rounded"
    style={{
      color: rating >= 90 ? '#f97316' : rating >= 82 ? '#eab308' : '#94a3b8',
      backgroundColor: rating >= 90 ? 'rgba(249,115,22,0.12)' : rating >= 82 ? 'rgba(234,179,8,0.12)' : 'transparent',
    }}
  >
    {rating}
  </span>
);

const SelectionBadge: React.FC<{ type: AllStarVoteEntry['selectionType'] }> = ({ type }) => {
  const map: Record<AllStarVoteEntry['selectionType'], { label: string; cls: string }> = {
    'starter-fan':          { label: 'Fan Vote', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
    'starter-media':        { label: 'Media Vote', cls: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
    'reserve-coach':        { label: 'Coach Pick', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    'injury-replacement':   { label: 'Replacement', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  };
  const { label, cls } = map[type];
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
};

const StarIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d={STAR_PATH} />
  </svg>
);

const PlayerRow: React.FC<{
  player: Player;
  tName: string;
  isStarter: boolean;
  vote?: AllStarVoteEntry;
  isInjured?: boolean;
  replacedBy?: string;
}> = ({ player, tName, isStarter, vote, isInjured, replacedBy }) => (
  <tr className={`border-b border-slate-800/40 transition-colors ${isInjured ? 'opacity-50' : 'hover:bg-slate-800/25'}`}>
    <td className="py-2.5 pr-3">
      <div className="flex items-center gap-2 flex-wrap">
        {isStarter && <StarIcon className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
        <span className={`font-semibold text-sm ${isInjured ? 'line-through text-slate-500' : 'text-white'}`}>{player.name}</span>
        {isStarter && !isInjured && <span className="text-[10px] font-black text-orange-300 uppercase">Starter</span>}
        {isInjured && replacedBy && <span className="text-[10px] text-rose-400 font-bold">OUT — replaced</span>}
        {vote && <SelectionBadge type={vote.selectionType} />}
      </div>
    </td>
    <td className="py-2.5 pr-2 text-slate-400 text-xs whitespace-nowrap">{tName}</td>
    <td className="py-2.5 pr-2">
      <span className="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">{player.position}</span>
    </td>
    <td className="py-2.5 pr-2 text-xs text-slate-400 text-right">
      {player.stats.gamesPlayed > 0 ? ppg(player).toFixed(1) : '—'}
    </td>
    <td className="py-2.5 text-right"><OVRBadge rating={player.rating} /></td>
  </tr>
);

const RosterSection: React.FC<{
  league: LeagueState;
  conf: string;
  starters: string[];
  reserves: string[];
  voteEntries: AllStarVoteEntry[];
  injuryReplacements?: AllStarWeekendData['injuryReplacements'];
}> = ({ league, conf, starters, reserves, voteEntries, injuryReplacements = [] }) => {
  const replacedIds = new Set(injuryReplacements.map(r => r.originalId));
  const renderGroup = (ids: string[], label: string) => (
    <div className="mb-4">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-2">
        {label === 'Starters' && <StarIcon className="w-3 h-3 text-orange-400" />}
        {label}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-800/60">
            <th className="text-left pb-1.5 pr-3 font-medium">Player</th>
            <th className="text-left pb-1.5 pr-2 font-medium">Team</th>
            <th className="text-left pb-1.5 pr-2 font-medium">Pos</th>
            <th className="text-right pb-1.5 pr-2 font-medium">PPG</th>
            <th className="text-right pb-1.5 font-medium">OVR</th>
          </tr>
        </thead>
        <tbody>
          {ids.map(id => {
            const p = getPlayerById(league, id);
            if (!p) return null;
            const vote = voteEntries.find(v => v.playerId === id);
            const isInjured = replacedIds.has(id);
            const rep = isInjured ? injuryReplacements.find(r => r.originalId === id) : undefined;
            return (
              <PlayerRow
                key={id}
                player={p}
                tName={teamName(league, id)}
                isStarter={label === 'Starters'}
                vote={vote}
                isInjured={isInjured}
                replacedBy={rep?.replacementId}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <h3 className="font-display font-bold text-base text-orange-400 mb-4 flex items-center gap-2">
        <span className="text-lg">{conf === 'Eastern' ? '🔵' : '🔴'}</span>
        {conf} Conference All-Stars
        <span className="text-slate-500 text-xs font-normal">({starters.length + reserves.length} players)</span>
      </h3>
      {renderGroup(starters, 'Starters')}
      {renderGroup(reserves, 'Reserves')}
      {injuryReplacements.length > 0 && (
        <div className="mt-3 p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg">
          <p className="text-rose-400 text-xs font-bold mb-1">⚠ Injury Replacements</p>
          {injuryReplacements.map(r => {
            const orig = getPlayerById(league, r.originalId);
            const rep  = getPlayerById(league, r.replacementId);
            return orig && rep ? (
              <p key={r.originalId} className="text-slate-400 text-xs">
                {orig.name} (out) → replaced by <span className="text-white font-semibold">{rep.name}</span>
              </p>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
};

const ParticipantList: React.FC<{
  league: LeagueState;
  ids: string[];
  title: string;
  subtitle: string;
  icon: string;
  qualLabel: string;
}> = ({ league, ids, title, subtitle, icon, qualLabel }) => (
  <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="font-bold text-sm text-white">{title} Participants</div>
        <div className="text-slate-500 text-xs">{subtitle} · {qualLabel}</div>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      {ids.map(id => {
        const p = getPlayerById(league, id);
        if (!p) return null;
        const tn = teamName(league, id);
        return (
          <div key={id} className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5">
            <span className="text-white text-xs font-semibold">{p.name}</span>
            <span className="text-slate-500 text-[10px]">{p.position}</span>
            <OVRBadge rating={p.rating} />
            <span className="text-slate-600 text-[10px] hidden sm:inline">{tn.split(' ').pop()}</span>
          </div>
        );
      })}
    </div>
  </div>
);

const EventCard: React.FC<{
  title: string;
  icon: string;
  result?: AllStarContestResult;
  participants: string[];
  league: LeagueState;
  onSim: () => void;
}> = ({ title, icon, result, participants, league, onSim }) => (
  <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
    <div className="flex items-center justify-between p-5 pb-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <h3 className="font-display font-bold text-base text-white">{title}</h3>
          <p className="text-slate-500 text-xs">{participants.length} participants</p>
        </div>
      </div>
      {result ? (
        <span className="px-3 py-1 bg-emerald-500/15 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/25">COMPLETE</span>
      ) : (
        <button
          onClick={onSim}
          className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-bold text-sm rounded-lg transition-all"
        >
          Simulate
        </button>
      )}
    </div>

    {!result && (
      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
        {participants.map(id => {
          const p = getPlayerById(league, id);
          return p ? (
            <span key={id} className="text-[10px] font-semibold bg-slate-900/60 text-slate-300 px-2 py-0.5 rounded border border-slate-700/40">
              {p.name}
            </span>
          ) : null;
        })}
      </div>
    )}

    {result && (
      <div className="px-5 pb-5 space-y-3 border-t border-slate-700/50 pt-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-400/40 flex items-center justify-center shrink-0">
            <StarIcon className="w-4 h-4 text-orange-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-orange-300 font-bold uppercase tracking-wider">Winner</div>
            <div className="font-bold text-white text-sm truncate">{result.winner.playerName}</div>
            <div className="text-slate-400 text-xs flex gap-2">
              <span>{result.winner.teamName}</span>
              {result.winner.score && <span className="font-mono text-orange-300">{result.winner.score}</span>}
            </div>
          </div>
        </div>
        {result.runnerUp && (
          <div className="flex items-center gap-3 opacity-75">
            <div className="w-8 h-8 rounded-full bg-slate-700/50 border border-slate-600 flex items-center justify-center shrink-0 text-slate-400 font-bold text-xs">2</div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Runner-up</div>
              <div className="font-semibold text-slate-300 text-sm truncate">{result.runnerUp.playerName}</div>
              <div className="text-slate-500 text-xs flex gap-2">
                <span>{result.runnerUp.teamName}</span>
                {result.runnerUp.score && <span className="font-mono">{result.runnerUp.score}</span>}
              </div>
            </div>
          </div>
        )}
        <div className="space-y-1 pt-1">
          {result.highlights.map((h, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-400">
              <span className="text-orange-500 shrink-0 mt-px">▸</span>
              {h}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ── Box Score Table ───────────────────────────────────────────────────────────
const BoxScoreTable: React.FC<{
  lines: AllStarPlayerLine[];
  conf: 'East' | 'West';
  totalScore: number;
}> = ({ lines, conf, totalScore }) => {
  const confColor = conf === 'East' ? 'text-blue-400' : 'text-red-400';
  const confBg    = conf === 'East' ? 'bg-blue-500/5' : 'bg-red-500/5';
  return (
    <div className={`rounded-xl border border-slate-700 overflow-hidden ${confBg}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/60">
        <span className={`font-display font-bold text-base uppercase tracking-wider ${confColor}`}>
          {conf === 'East' ? '🔵' : '🔴'} {conf}
        </span>
        <span className={`font-display font-bold text-2xl ${confColor}`}>{totalScore}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800/60 text-slate-500 text-[10px] uppercase tracking-wider">
              <th className="text-left px-4 py-2 font-medium">Player</th>
              <th className="text-center px-2 py-2 font-medium">Pos</th>
              <th className="text-right px-2 py-2 font-medium">PTS</th>
              <th className="text-right px-2 py-2 font-medium">REB</th>
              <th className="text-right px-2 py-2 font-medium">AST</th>
              <th className="text-right px-2 py-2 font-medium">STL</th>
              <th className="text-right px-2 py-2 font-medium">BLK</th>
              <th className="text-right px-2 py-2 font-medium">FG</th>
              <th className="text-right px-2 py-2 font-medium">3P</th>
              <th className="text-right px-2 py-2 font-medium">FT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {lines.map(l => (
              <tr
                key={l.playerId}
                className={`transition-colors ${l.isMvp ? 'bg-orange-500/8 border-l-2 border-l-orange-500' : l.isStarter ? 'bg-slate-800/20' : 'hover:bg-slate-800/15'}`}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {l.isMvp && <StarIcon className="w-3 h-3 text-orange-400 shrink-0" />}
                    <span className={`font-semibold ${l.isMvp ? 'text-orange-300' : 'text-slate-200'}`}>{l.playerName}</span>
                    {l.isMvp && <span className="text-[9px] font-black text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded uppercase">MVP</span>}
                    {l.isStarter && !l.isMvp && <StarIcon className="w-3 h-3 text-orange-500/40 shrink-0" />}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center text-slate-500 font-mono text-[10px]">{l.position}</td>
                <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${l.pts >= 25 ? 'text-orange-400' : l.pts >= 18 ? 'text-amber-400' : 'text-slate-300'}`}>{l.pts}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{l.reb}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-400">{l.ast}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{l.stl}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{l.blk}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500 text-[10px]">{l.fgm}/{l.fga}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500 text-[10px]">{l.threepm}/{l.threepa}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-slate-500 text-[10px]">{l.ftm}/{l.fta}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/60 text-slate-500 text-[10px]">
              <td className="px-4 py-2 font-black uppercase tracking-widest" colSpan={2}>TOTALS</td>
              <td className={`px-2 py-2 text-right font-black tabular-nums ${confColor}`}>{totalScore}</td>
              <td className="px-2 py-2 text-right tabular-nums">{lines.reduce((a, l) => a + l.reb, 0)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{lines.reduce((a, l) => a + l.ast, 0)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{lines.reduce((a, l) => a + l.stl, 0)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{lines.reduce((a, l) => a + l.blk, 0)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-[10px]">
                {lines.reduce((a, l) => a + l.fgm, 0)}/{lines.reduce((a, l) => a + l.fga, 0)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[10px]">
                {lines.reduce((a, l) => a + l.threepm, 0)}/{lines.reduce((a, l) => a + l.threepa, 0)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[10px]">
                {lines.reduce((a, l) => a + l.ftm, 0)}/{lines.reduce((a, l) => a + l.fta, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// ── Play-by-Play Feed ─────────────────────────────────────────────────────────
const PlayByPlayFeed: React.FC<{ plays: string[] }> = ({ plays }) => {
  const [expanded, setExpanded] = React.useState(false);

  const isQuarterHeader = (line: string) => line.startsWith('────');
  const isEndOfQuarter  = (line: string) => line.startsWith('📊');
  const isEast          = (line: string) => line.startsWith('🔵');
  const isWest          = (line: string) => line.startsWith('🔴');

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-800/30 transition-colors"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 flex items-center gap-2">
          <span>🏀</span> Play-by-Play
          <span className="text-slate-700 font-normal normal-case tracking-normal">({plays.filter(p => !isQuarterHeader(p) && !isEndOfQuarter(p)).length} plays)</span>
        </span>
        <span className={`text-slate-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-800/60">
          <div className="max-h-96 overflow-y-auto px-3 py-2 space-y-0.5 text-xs" style={{ scrollbarWidth: 'thin' }}>
            {plays.map((line, i) => {
              if (isQuarterHeader(line)) {
                return (
                  <div key={i} className="sticky top-0 z-10 py-2 px-2 bg-slate-900/95 text-[10px] font-black text-orange-400 uppercase tracking-[0.25em] border-b border-slate-800/60 mt-1">
                    {line.replace(/─+/g, '').trim()}
                  </div>
                );
              }
              if (isEndOfQuarter(line)) {
                return (
                  <div key={i} className="py-1.5 px-3 my-1 bg-slate-800/40 rounded-lg text-slate-400 font-semibold text-[11px]">
                    {line}
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 py-1.5 px-2 rounded transition-colors ${
                    isEast(line)
                      ? 'text-blue-300 hover:bg-blue-500/5'
                      : isWest(line)
                      ? 'text-red-300 hover:bg-red-500/5'
                      : 'text-slate-400 hover:bg-slate-800/30'
                  }`}
                >
                  <span className="shrink-0 mt-px leading-none">{line.slice(0, 2)}</span>
                  <span className="leading-relaxed">{line.slice(2).trim()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const AllStar: React.FC<AllStarProps> = ({ league, updateLeague, onAdvancePhase }) => {
  const asd = league.allStarWeekend;
  // Default to Game tab — that's the main event
  const [tab, setTab] = useState<'rosters' | 'events' | 'game'>('game');

  if (!asd) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
        <StarIcon className="w-12 h-12 opacity-30" />
        <p className="text-lg font-medium">All-Star Weekend not yet scheduled.</p>
        <p className="text-sm">It will be unlocked after the Trade Deadline.</p>
      </div>
    );
  }

  const voteEntries = asd.voteEntries ?? [];
  const injRep = asd.injuryReplacements ?? [];

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleSimSkills = () => {
    const r = simulateSkillsChallenge(league, asd.skillsParticipants);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, skillsChallenge: r } : prev.allStarWeekend }));
  };
  const handleSim3Pt = () => {
    const r = simulate3PtContest(league, asd.threePtParticipants);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, threePtContest: r } : prev.allStarWeekend }));
  };
  const handleSimDunk = () => {
    const r = simulateDunkContest(league, asd.dunkParticipants);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, dunkContest: r } : prev.allStarWeekend }));
  };
  const handleSimGame = () => {
    const r = simulateAllStarGame(league, asd.eastRoster, asd.westRoster, asd.eastStarters, asd.westStarters);
    const confWon = r.eastScore > r.westScore ? 'East' : 'West';
    updateLeague(prev => ({
      ...prev,
      allStarWeekend: prev.allStarWeekend
        ? { ...prev.allStarWeekend, allStarGame: r, completed: true }
        : prev.allStarWeekend,
      newsFeed: [{
        id: `allstar-game-${Date.now()}`,
        category: 'milestone' as const,
        headline: 'ALL-STAR GAME FINAL',
        content: `${confWon} defeats ${confWon === 'East' ? 'West' : 'East'} ${Math.max(r.eastScore, r.westScore)}-${Math.min(r.eastScore, r.westScore)}! ${r.mvp.playerName} (${r.mvp.statLine}) named All-Star Game MVP!`,
        timestamp: prev.currentDay,
        realTimestamp: Date.now(),
        isBreaking: true,
      }, ...prev.newsFeed],
    }));
  };

  // Only the game is required to unlock "Continue Season" — contests are bonus
  const allEventsComplete = !!asd.allStarGame;

  const TABS = [
    { id: 'game'    as const, label: '🏀 All-Star Game', dot: !asd.allStarGame },
    { id: 'rosters' as const, label: 'Rosters' },
    { id: 'events'  as const, label: 'Events' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-orange-500/20 p-7"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1a0a00 50%, #0f172a 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {[...Array(12)].map((_, i) => (
            <StarIcon key={i} className="absolute w-6 h-6 text-orange-500 opacity-[0.07]"
              // @ts-ignore
              style={{ top: `${15 + (i * 37) % 75}%`, left: `${(i * 53) % 95}%` }} />
          ))}
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <StarIcon className="w-7 h-7 text-orange-400" />
              <h1 className="font-display font-bold text-2xl sm:text-3xl text-white uppercase tracking-widest">All-Star Weekend</h1>
            </div>
            <p className="text-slate-400 text-sm">{league.season} Season · The game's brightest stars take center stage</p>
          </div>
          <div className="flex flex-wrap gap-3 text-center">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2">
              <div className="font-bold text-orange-400 text-lg">{asd.eastRoster.length + asd.westRoster.length}</div>
              <div className="text-slate-500 text-xs">All-Stars</div>
            </div>
            {asd.allStarGame && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2">
                <div className={`font-display font-bold text-lg ${asd.allStarGame.eastScore > asd.allStarGame.westScore ? 'text-blue-400' : 'text-red-400'}`}>
                  {asd.allStarGame.eastScore}–{asd.allStarGame.westScore}
                </div>
                <div className="text-slate-500 text-xs">Final</div>
              </div>
            )}
            {asd.completed && (
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-400 font-bold text-sm">Complete</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-800/40 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${tab === t.id ? 'bg-orange-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            {t.label}
            {t.dot && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-orange-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── All-Star Game ── */}
      {tab === 'game' && (
        <div className="space-y-5">
          {!asd.allStarGame ? (
            /* Pre-game matchup card */
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="text-center py-4 border-b border-slate-800">
                <span className="text-xs font-black text-orange-400 uppercase tracking-[0.3em]">All-Star Game · {asd.year}</span>
              </div>
              {/* Matchup */}
              <div className="grid grid-cols-3 items-center text-center p-8 gap-4"
                style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, transparent 50%, rgba(239,68,68,0.06) 100%)' }}>
                {/* East */}
                <div>
                  <div className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em] mb-3">Eastern Conference</div>
                  <div className="space-y-1">
                    {asd.eastStarters.map(id => {
                      const p = getPlayerById(league, id);
                      return p ? (
                        <div key={id} className="text-slate-300 text-sm font-semibold">{p.name}</div>
                      ) : null;
                    })}
                  </div>
                  <div className="mt-3 text-slate-600 text-xs">{asd.eastReserves.length} reserves</div>
                </div>
                {/* VS */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-5xl">🏀</div>
                  <div className="font-display font-bold text-3xl text-slate-600">VS</div>
                  <button onClick={() => { handleSimGame(); }}
                    className="px-8 py-3 bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-bold text-base rounded-xl transition-all shadow-lg shadow-orange-500/20 mt-2">
                    Simulate Game
                  </button>
                </div>
                {/* West */}
                <div>
                  <div className="text-red-400 font-black text-[10px] uppercase tracking-[0.3em] mb-3">Western Conference</div>
                  <div className="space-y-1">
                    {asd.westStarters.map(id => {
                      const p = getPlayerById(league, id);
                      return p ? (
                        <div key={id} className="text-slate-300 text-sm font-semibold">{p.name}</div>
                      ) : null;
                    })}
                  </div>
                  <div className="mt-3 text-slate-600 text-xs">{asd.westReserves.length} reserves</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Scoreboard */}
              <div className="border border-slate-700 rounded-2xl overflow-hidden">
                <div className="text-center py-2.5 bg-slate-800/50 border-b border-slate-700">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Final · All-Star Game {asd.year}</span>
                </div>
                <div className="grid grid-cols-3 text-center p-6"
                  style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, transparent 50%, rgba(239,68,68,0.08) 100%)' }}>
                  <div>
                    <div className="font-display font-bold text-6xl text-blue-400">{asd.allStarGame.eastScore}</div>
                    <div className="text-slate-400 text-sm font-bold mt-1">EAST</div>
                    {asd.allStarGame.eastScore > asd.allStarGame.westScore && (
                      <div className="text-blue-400 text-xs font-black uppercase tracking-widest mt-1">WIN ✓</div>
                    )}
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="text-slate-600 font-bold text-xl">–</div>
                    {asd.allStarGame.quarterScores && (
                      <div className="text-slate-600 text-[10px] font-mono space-y-0.5">
                        {asd.allStarGame.quarterScores.east.map((q, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="w-3 text-slate-700">Q{i + 1}</span>
                            <span className="text-blue-600">{q}</span>
                            <span className="text-slate-700">–</span>
                            <span className="text-red-600">{asd.allStarGame.quarterScores!.west[i]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-display font-bold text-6xl text-red-400">{asd.allStarGame.westScore}</div>
                    <div className="text-slate-400 text-sm font-bold mt-1">WEST</div>
                    {asd.allStarGame.westScore > asd.allStarGame.eastScore && (
                      <div className="text-red-400 text-xs font-black uppercase tracking-widest mt-1">WIN ✓</div>
                    )}
                  </div>
                </div>
              </div>

              {/* MVP card */}
              <div className="bg-gradient-to-r from-orange-950/30 to-slate-900 border border-orange-500/30 rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-orange-500/15 border-2 border-orange-400/50 flex items-center justify-center shrink-0">
                    <StarIcon className="w-7 h-7 text-orange-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-orange-400 font-black uppercase tracking-[0.25em]">⭐ All-Star Game MVP</div>
                    <div className="font-display font-bold text-2xl text-white mt-0.5">{asd.allStarGame.mvp.playerName}</div>
                    <div className="text-slate-400 text-sm">{asd.allStarGame.mvp.teamName}</div>
                    <div className="text-orange-300 font-mono text-sm font-bold mt-0.5">{asd.allStarGame.mvp.statLine}</div>
                  </div>
                </div>
              </div>

              {/* Highlights */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-3">Game Highlights</h4>
                <div className="space-y-2">
                  {asd.allStarGame.highlights.map((h, i) => (
                    <div key={i} className="flex gap-2.5 text-sm text-slate-300">
                      <span className="text-orange-500 shrink-0 mt-0.5">▸</span>
                      {h}
                    </div>
                  ))}
                </div>
              </div>

              {/* Play-by-Play */}
              {asd.allStarGame.playByPlay && asd.allStarGame.playByPlay.length > 0 && (
                <PlayByPlayFeed plays={asd.allStarGame.playByPlay} />
              )}

              {/* Box Score */}
              {asd.allStarGame.boxScore && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 flex items-center gap-2">
                    <span>Box Score</span>
                    <span className="flex items-center gap-1 text-orange-400/60">
                      <StarIcon className="w-3 h-3" /> = starter
                    </span>
                    <span className="flex items-center gap-1.5 text-orange-400">
                      <StarIcon className="w-3 h-3" />
                      <span className="text-[9px] bg-orange-500/15 px-1 py-0.5 rounded">MVP</span> = game MVP
                    </span>
                  </h4>
                  <BoxScoreTable
                    lines={asd.allStarGame.boxScore.east}
                    conf="East"
                    totalScore={asd.allStarGame.eastScore}
                  />
                  <BoxScoreTable
                    lines={asd.allStarGame.boxScore.west}
                    conf="West"
                    totalScore={asd.allStarGame.westScore}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Rosters ── */}
      {tab === 'rosters' && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Vote legend */}
          <div className="lg:col-span-2 flex flex-wrap gap-3 text-xs">
            {([
              { type: 'starter-fan'   as const, desc: 'Fan Vote (50%) — OVR + PPG + team wins' },
              { type: 'starter-media' as const, desc: 'Media/Coach Vote (50%) — OVR + PER + form' },
              { type: 'reserve-coach' as const, desc: 'Coach Pick (reserves) — OVR + impact + need' },
            ]).map(({ type, desc }) => (
              <div key={type} className="flex items-center gap-1.5">
                <SelectionBadge type={type} />
                <span className="text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
          <RosterSection
            league={league} conf="Eastern"
            starters={asd.eastStarters} reserves={asd.eastReserves ?? []}
            voteEntries={voteEntries}
            injuryReplacements={injRep.filter(r => r.conf === 'Eastern')}
          />
          <RosterSection
            league={league} conf="Western"
            starters={asd.westStarters} reserves={asd.westReserves ?? []}
            voteEntries={voteEntries}
            injuryReplacements={injRep.filter(r => r.conf === 'Western')}
          />
        </div>
      )}

      {/* ── Events ── */}
      {tab === 'events' && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-3 gap-3">
            <ParticipantList league={league} ids={asd.skillsParticipants} title="Skills Challenge"
              icon="🏃" subtitle="Guards & Wings" qualLabel="Age <27 · Ball-handling + Speed + Passing" />
            <ParticipantList league={league} ids={asd.threePtParticipants} title="3-Point Contest"
              icon="🎯" subtitle="Top Shooters" qualLabel="3P Rating + Volume + Accuracy" />
            <ParticipantList league={league} ids={asd.dunkParticipants} title="Dunk Contest"
              icon="🔥" subtitle="Aerial Artists" qualLabel="Age <30 · Dunks + Jumping + Athleticism" />
          </div>
          <div className="space-y-4">
            <EventCard title="Skills Challenge" icon="🏃"
              result={asd.skillsChallenge} participants={asd.skillsParticipants}
              league={league} onSim={handleSimSkills} />
            <EventCard title="3-Point Contest" icon="🎯"
              result={asd.threePtContest} participants={asd.threePtParticipants}
              league={league} onSim={handleSim3Pt} />
            <EventCard title="Dunk Contest" icon="🔥"
              result={asd.dunkContest} participants={asd.dunkParticipants}
              league={league} onSim={handleSimDunk} />
          </div>
        </div>
      )}

      {/* ── Continue CTA ── */}
      {allEventsComplete && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="font-bold text-white">All-Star Weekend Complete</div>
            <div className="text-slate-400 text-sm">
              {asd.allStarGame?.mvp.playerName} named MVP · Resume the grind toward the playoffs.
            </div>
          </div>
          <button onClick={onAdvancePhase}
            className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-bold rounded-xl transition-all shrink-0">
            Continue Season →
          </button>
        </div>
      )}
    </div>
  );
};

export default AllStar;
