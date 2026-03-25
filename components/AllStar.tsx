import React, { useState } from 'react';
import {
  LeagueState, AllStarWeekendData, AllStarContestResult,
  AllStarGameResult, AllStarPlayerLine, Player, AllStarVoteEntry,
  Team, PlayByPlayEvent,
} from '../types';
import { simulateGame } from '../utils/simEngine';

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

// ── Build a virtual All-Star Team for use with simulateGame ──────────────────
function buildAllStarTeam(
  conf: 'East' | 'West',
  rosterIds: string[],
  starters: string[],
  league: LeagueState,
): Team {
  const players = rosterIds.map(id => getPlayerById(league, id)).filter(Boolean) as Player[];

  // Map starters to positions, filling gaps with best available
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
  const unassigned = starters.map(id => getPlayerById(league, id)).filter(Boolean) as Player[];
  const starterMap: Record<string, string> = {};
  for (const pos of positions) {
    const idx = unassigned.findIndex(p => p.position === pos);
    if (idx >= 0) { starterMap[pos] = unassigned[idx].id; unassigned.splice(idx, 1); }
  }
  // Fill any unfilled positions with remaining starters
  for (const pos of positions) {
    if (!starterMap[pos] && unassigned.length > 0) {
      starterMap[pos] = unassigned.shift()!.id;
    }
  }

  return {
    id: `allstar-${conf.toLowerCase()}`,
    name: 'All-Stars',
    city: conf,
    abbreviation: conf === 'East' ? 'EAST' : 'WEST',
    conference: conf === 'East' ? 'Eastern' : 'Western',
    division: 'Atlantic',
    marketSize: 'Large',
    roster: players,
    staff: { headCoach: null, assistantOffense: null, assistantDefense: null, trainer: null },
    staffBudget: 0,
    activeScheme: 'Showtime',
    paceRating: 96, // fast All-Star pace
    wins: 41, losses: 41, homeWins: 0, homeLosses: 0, roadWins: 0, roadLosses: 0,
    confWins: 0, confLosses: 0, lastTen: [], streak: 0, budget: 0,
    logo: '', primaryColor: conf === 'East' ? '#3b82f6' : '#ef4444', secondaryColor: '#ffffff',
    picks: [], needs: [],
    finances: { revenue: 0, expenses: 0, ownerPatience: 100, ticketRevenue: 0, tvRevenue: 0, sponsorRevenue: 0, miscRevenue: 0 },
    rotation: {
      starters: starterMap as Record<typeof positions[number], string>,
      bench: rosterIds.filter(id => !starters.includes(id)),
    },
    population: 5, stadiumCapacity: 20000,
    borderStyle: 'None', status: 'Active',
  };
}

function simulateAllStarGame(
  league: LeagueState,
  eastRoster: string[],
  westRoster: string[],
  eastStarters: string[],
  westStarters: string[],
): AllStarGameResult {
  const eastTeam = buildAllStarTeam('East', eastRoster, eastStarters, league);
  const westTeam = buildAllStarTeam('West', westRoster, westStarters, league);

  // Run the real sim engine — no injuries, no home court, no B2B fatigue
  const gameResult = simulateGame(
    eastTeam, westTeam,
    league.currentDay,
    league.season,
    false, false,
    'Ice Cold',
    { injuryFrequency: 'None', homeCourt: false, b2bFrequency: 'None', quarterLength: 12 },
  );

  const eastScore = gameResult.homeScore;
  const westScore = gameResult.awayScore;

  // Build AllStarPlayerLine from real GamePlayerLine stats
  const toAllStarLines = (
    lines: typeof gameResult.homePlayerStats,
    starters: string[],
    mvpId: string,
  ): AllStarPlayerLine[] =>
    lines
      .filter(l => !l.dnp)
      .map(l => ({
        playerId: l.playerId,
        playerName: l.name,
        position: getPlayerById(league, l.playerId)?.position ?? '?',
        pts: l.pts,
        reb: l.reb,
        ast: l.ast,
        stl: l.stl,
        blk: l.blk,
        fgm: l.fgm,
        fga: l.fga,
        threepm: l.threepm,
        threepa: l.threepa,
        ftm: l.ftm,
        fta: l.fta,
        isStarter: starters.includes(l.playerId),
        isMvp: l.playerId === mvpId,
      }))
      .sort((a, b) => b.pts - a.pts);

  // MVP: top performer on winning team
  const winnerStats = eastScore >= westScore ? gameResult.homePlayerStats : gameResult.awayPlayerStats;
  const mvpLine = winnerStats
    .filter(l => !l.dnp)
    .reduce((best, l) =>
      (l.pts + l.reb * 0.5 + l.ast * 0.7) > (best.pts + best.reb * 0.5 + best.ast * 0.7) ? l : best,
      winnerStats[0],
    );

  const mvpPlayer = getPlayerById(league, mvpLine.playerId);
  const mvpName   = mvpPlayer?.name ?? mvpLine.name;
  const confWon   = eastScore >= westScore ? 'East' : 'West';
  const statLine  = `${mvpLine.pts} pts, ${mvpLine.reb} reb, ${mvpLine.ast} ast`;

  const quarterScores = {
    east: gameResult.quarterScores.home,
    west: gameResult.quarterScores.away,
  };

  const highlights = [
    `${confWon} wins ${Math.max(eastScore, westScore)}-${Math.min(eastScore, westScore)} in an All-Star showcase!`,
    `${mvpName} was unstoppable: ${statLine} to claim MVP honours.`,
    `Both squads combined for ${eastScore + westScore} total points.`,
    `${mvpName} raises the MVP trophy to a standing ovation.`,
  ];

  return {
    eastScore, westScore,
    mvp: {
      playerId: mvpLine.playerId,
      playerName: mvpName,
      teamId: teamId(league, mvpLine.playerId),
      teamName: teamName(league, mvpLine.playerId),
      statLine,
    },
    eastRoster, westRoster,
    quarterScores,
    highlights,
    boxScore: {
      east: toAllStarLines(gameResult.homePlayerStats, eastStarters, mvpLine.playerId),
      west: toAllStarLines(gameResult.awayPlayerStats, westStarters, mvpLine.playerId),
    },
    playByPlay: gameResult.playByPlay ?? [],
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
  onWatch?: () => void;
}> = ({ title, icon, result, participants, league, onSim, onWatch }) => (
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
        <div className="flex gap-2">
          {onWatch && (
            <button
              onClick={onWatch}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 font-bold text-sm rounded-lg transition-all border border-slate-600 flex items-center gap-1.5"
            >
              <span className="text-xs">▶</span> Watch
            </button>
          )}
          <button
            onClick={onSim}
            className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-bold text-sm rounded-lg transition-all"
          >
            Simulate
          </button>
        </div>
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
// ── Play-by-Play Feed (static, collapsed by default) ─────────────────────────
const PlayByPlayFeed: React.FC<{ plays: PlayByPlayEvent[] }> = ({ plays }) => {
  const [expanded, setExpanded] = React.useState(false);
  const quarters = Array.from(new Set(plays.map(e => e.quarter))).sort((a, b) => a - b);
  const actionCount = plays.filter(e => e.type !== 'info').length;

  const typeColor = (type: PlayByPlayEvent['type']) =>
    type === 'score'    ? 'text-white'      :
    type === 'miss'     ? 'text-slate-500'  :
    type === 'turnover' ? 'text-rose-400'   :
    type === 'foul'     ? 'text-amber-400'  :
    'text-slate-600';

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-800/30 transition-colors"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 flex items-center gap-2">
          <span>🏀</span> Play-by-Play
          <span className="text-slate-700 font-normal normal-case tracking-normal">({actionCount} plays)</span>
        </span>
        <span className={`text-slate-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-800/60">
          <div className="max-h-96 overflow-y-auto px-3 py-2 text-xs" style={{ scrollbarWidth: 'thin' }}>
            {quarters.map(q => (
              <div key={q}>
                <div className="sticky top-0 z-10 py-2 px-2 bg-slate-900/95 text-[10px] font-black text-orange-400 uppercase tracking-[0.25em] border-b border-slate-800/60 mt-1">
                  {q <= 4 ? `Quarter ${q}` : `Overtime ${q - 4}`}
                </div>
                {plays.filter(e => e.quarter === q).map((event, i) => (
                  <div key={i} className={`flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-800/20 ${typeColor(event.type)}`}>
                    <span className="font-mono text-slate-700 w-9 shrink-0 text-[10px] mt-px">{event.time}</span>
                    <span className="leading-relaxed">{event.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Watch Game Modal ──────────────────────────────────────────────────────────
const WatchGameModal: React.FC<{
  result: AllStarGameResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const [revealedIdx, setRevealedIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [speed, setSpeed] = React.useState(700);
  const feedRef = React.useRef<HTMLDivElement>(null);

  const plays = (result.playByPlay ?? []) as PlayByPlayEvent[];
  const done = revealedIdx >= plays.length;

  React.useEffect(() => {
    if (paused || done) return;
    const t = setTimeout(() => setRevealedIdx(i => i + 1), speed);
    return () => clearTimeout(t);
  }, [paused, revealedIdx, done, speed]);

  React.useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [revealedIdx]);

  const visiblePlays = plays.slice(0, revealedIdx);
  const currentQ = visiblePlays.length > 0 ? visiblePlays[visiblePlays.length - 1].quarter : 1;

  // Live score: sum completed quarter scores
  const completedQs = done ? (result.quarterScores?.east.length ?? 4) : Math.max(0, currentQ - 1);
  const liveEast = (result.quarterScores?.east ?? []).slice(0, completedQs).reduce((a, b) => a + b, 0);
  const liveWest = (result.quarterScores?.west ?? []).slice(0, completedQs).reduce((a, b) => a + b, 0);

  const typeColor = (type: PlayByPlayEvent['type']) =>
    type === 'score'    ? 'text-white font-semibold' :
    type === 'miss'     ? 'text-slate-500'           :
    type === 'turnover' ? 'text-rose-300'             :
    type === 'foul'     ? 'text-amber-300'            :
    'text-slate-500 italic text-xs';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90 shrink-0 gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-3 min-w-0">
          {!done ? (
            <span className="flex items-center gap-1.5 text-xs font-black text-red-400 uppercase shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />LIVE · Q{currentQ}
            </span>
          ) : (
            <span className="text-xs font-black text-emerald-400 uppercase shrink-0">FINAL</span>
          )}
          <span className="text-white font-bold text-sm truncate hidden sm:inline">All-Star Game</span>
        </div>

        {/* Live score */}
        <div className="flex items-center gap-3 font-display text-center shrink-0">
          <div>
            <div className="text-blue-400 font-bold text-2xl leading-none">{done ? result.eastScore : liveEast}</div>
            <div className="text-slate-600 text-[9px] uppercase tracking-widest">East</div>
          </div>
          <span className="text-slate-700 text-xl">–</span>
          <div>
            <div className="text-red-400 font-bold text-2xl leading-none">{done ? result.westScore : liveWest}</div>
            <div className="text-slate-600 text-[9px] uppercase tracking-widest">West</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {!done && (
            <>
              <button onClick={() => setPaused(p => !p)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                title={paused ? 'Resume' : 'Pause'}>
                {paused ? '▶' : '⏸'}
              </button>
              <select value={speed} onChange={e => setSpeed(+e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2 py-1.5 rounded-lg cursor-pointer">
                <option value={1400}>Slow</option>
                <option value={700}>Normal</option>
                <option value={300}>Fast</option>
                <option value={60}>Turbo</option>
              </select>
              <button onClick={() => { setRevealedIdx(plays.length); setPaused(true); }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors">
                Skip →
              </button>
            </>
          )}
          <button onClick={onClose}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${done ? 'bg-orange-500 hover:bg-orange-400 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'}`}>
            {done ? 'Close' : '✕'}
          </button>
        </div>
      </div>

      {/* Play feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 max-w-3xl mx-auto w-full" style={{ scrollbarWidth: 'thin' }}>
        {visiblePlays.map((event, i) => {
          const prevQ = i > 0 ? visiblePlays[i - 1].quarter : 0;
          const isNewQ = event.quarter !== prevQ;
          return (
            <React.Fragment key={i}>
              {isNewQ && (
                <div className="sticky top-0 z-10 py-2 px-3 bg-slate-950/98 text-[10px] font-black text-orange-400 uppercase tracking-[0.3em] border-b border-slate-800/60 my-1">
                  {event.quarter <= 4 ? `Quarter ${event.quarter}` : `Overtime ${event.quarter - 4}`}
                </div>
              )}
              <div className={`flex items-start gap-2 py-1.5 px-3 rounded-lg text-sm animate-in fade-in duration-200 ${typeColor(event.type)}`}>
                <span className="font-mono text-slate-700 text-[10px] w-9 shrink-0 mt-1">{event.time}</span>
                <span className="leading-relaxed">{event.text}</span>
              </div>
            </React.Fragment>
          );
        })}

        {/* Loading dots */}
        {!done && !paused && (
          <div className="flex gap-1.5 py-2 px-3">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* Final result panel */}
      {done && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-900/90 px-5 py-4 animate-in slide-in-from-bottom-2 duration-300">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`font-display font-bold text-4xl ${result.eastScore > result.westScore ? 'text-blue-400' : 'text-blue-700'}`}>{result.eastScore}</div>
                <div className="text-slate-500 text-xs font-bold uppercase mt-0.5">East {result.eastScore > result.westScore && '· WIN ✓'}</div>
              </div>
              <span className="text-slate-700 text-2xl font-bold">–</span>
              <div className="text-center">
                <div className={`font-display font-bold text-4xl ${result.westScore > result.eastScore ? 'text-red-400' : 'text-red-700'}`}>{result.westScore}</div>
                <div className="text-slate-500 text-xs font-bold uppercase mt-0.5">West {result.westScore > result.eastScore && '· WIN ✓'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/15 border border-orange-400/40 flex items-center justify-center shrink-0">
                <StarIcon className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-orange-400 text-[10px] font-black uppercase tracking-wider">All-Star MVP</div>
                <div className="text-white font-bold">{result.mvp.playerName}</div>
                <div className="text-orange-300 font-mono text-xs mt-0.5">{result.mvp.statLine}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Watch Event Modal ─────────────────────────────────────────────────────────
const WatchEventModal: React.FC<{
  result: AllStarContestResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const eventIcon = result.eventName === 'Skills Challenge' ? '🏃'
    : result.eventName === '3-Point Contest' ? '🎯' : '🔥';

  // Build broadcast steps: intro → each highlight → winner reveal
  const steps: { text: string; type: 'intro' | 'play' | 'winner' }[] = [
    { text: `📺 Welcome to the ${result.eventName}! Competitors are taking the floor…`, type: 'intro' },
    ...result.highlights.map(h => ({ text: h, type: 'play' as const })),
    {
      text: `🏆 ${result.winner.playerName} wins the ${result.eventName}${result.winner.score ? ` with a score of ${result.winner.score}` : ''}! What a performance!`,
      type: 'winner',
    },
  ];

  const [step, setStep] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const done = step >= steps.length;
  const delay = (steps[step]?.type === 'winner') ? 1800 : 1300;

  React.useEffect(() => {
    if (paused || done) return;
    const t = setTimeout(() => setStep(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [paused, step, done, delay]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{eventIcon}</span>
            <div>
              <div className="font-bold text-white">{result.eventName}</div>
              {!done ? (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-black uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
                </div>
              ) : (
                <div className="text-emerald-400 text-xs font-black uppercase">Complete</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${done ? 'bg-orange-500 hover:bg-orange-400 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'}`}
          >
            {done ? 'Close' : '✕'}
          </button>
        </div>

        {/* Broadcast steps */}
        <div className="p-5 space-y-3 min-h-[180px]">
          {steps.slice(0, step + 1).map((s, i) => (
            <div
              key={i}
              className={`flex gap-3 items-start animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                s.type === 'winner' ? 'p-3 bg-orange-500/10 border border-orange-500/25 rounded-xl' : ''
              }`}
            >
              <span className={`shrink-0 mt-0.5 ${s.type === 'winner' ? 'text-orange-400' : 'text-orange-600'}`}>▸</span>
              <p className={`text-sm leading-relaxed ${
                s.type === 'winner' ? 'text-orange-300 font-bold' :
                s.type === 'intro' ? 'text-slate-400' :
                'text-slate-200'
              }`}>{s.text}</p>
            </div>
          ))}
          {!done && !paused && (
            <div className="flex gap-1.5 pt-1 pl-6">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}
        </div>

        {/* Winner + runner-up reveal */}
        {done && (
          <div className="px-5 pb-5 border-t border-slate-800 pt-4 space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 border-2 border-orange-400/40 flex items-center justify-center shrink-0">
                <StarIcon className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-[10px] text-orange-400 font-black uppercase tracking-wider">Winner</div>
                <div className="font-bold text-white">{result.winner.playerName}</div>
                <div className="text-slate-400 text-xs flex gap-2">
                  <span>{result.winner.teamName}</span>
                  {result.winner.score && <span className="font-mono text-orange-300">{result.winner.score}</span>}
                </div>
              </div>
            </div>
            {result.runnerUp && (
              <div className="flex items-center gap-3 opacity-70">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">2</div>
                <div>
                  <div className="text-[10px] text-slate-500 font-black uppercase">Runner-up</div>
                  <div className="font-semibold text-slate-300 text-sm">{result.runnerUp.playerName}</div>
                  <div className="text-slate-500 text-xs flex gap-2">
                    <span>{result.runnerUp.teamName}</span>
                    {result.runnerUp.score && <span className="font-mono">{result.runnerUp.score}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls (when not done) */}
        {!done && (
          <div className="px-5 pb-4 flex justify-end gap-2">
            <button
              onClick={() => setPaused(p => !p)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors"
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={() => { setStep(steps.length); setPaused(true); }}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-lg transition-colors"
            >
              Skip →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const AllStar: React.FC<AllStarProps> = ({ league, updateLeague, onAdvancePhase }) => {
  const asd = league.allStarWeekend;
  // Default to Game tab — that's the main event
  const [tab, setTab] = useState<'rosters' | 'events' | 'game'>('game');
  const [watchGameResult, setWatchGameResult] = useState<AllStarGameResult | null>(null);
  const [watchEventResult, setWatchEventResult] = useState<AllStarContestResult | null>(null);

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

  // ── Watch handlers (simulate → open modal; save result immediately) ────────
  const handleWatchGame = () => {
    const r = simulateAllStarGame(league, asd.eastRoster, asd.westRoster, asd.eastStarters, asd.westStarters);
    const confWon = r.eastScore > r.westScore ? 'East' : 'West';
    updateLeague(prev => ({
      ...prev,
      allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, allStarGame: r, completed: true } : prev.allStarWeekend,
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
    setWatchGameResult(r);
  };
  const handleWatchSkills = () => {
    const r = simulateSkillsChallenge(league, asd.skillsParticipants);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, skillsChallenge: r } : prev.allStarWeekend }));
    setWatchEventResult(r);
  };
  const handleWatch3Pt = () => {
    const r = simulate3PtContest(league, asd.threePtParticipants);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, threePtContest: r } : prev.allStarWeekend }));
    setWatchEventResult(r);
  };
  const handleWatchDunk = () => {
    const r = simulateDunkContest(league, asd.dunkParticipants);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, dunkContest: r } : prev.allStarWeekend }));
    setWatchEventResult(r);
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
                  <div className="flex flex-col gap-2 mt-2">
                    <button onClick={handleWatchGame}
                      className="px-8 py-3 bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-bold text-base rounded-xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
                      <span>▶</span> Watch Live
                    </button>
                    <button onClick={handleSimGame}
                      className="px-8 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-sm rounded-xl transition-all border border-slate-700">
                      Quick Sim
                    </button>
                  </div>
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
              league={league} onSim={handleSimSkills} onWatch={handleWatchSkills} />
            <EventCard title="3-Point Contest" icon="🎯"
              result={asd.threePtContest} participants={asd.threePtParticipants}
              league={league} onSim={handleSim3Pt} onWatch={handleWatch3Pt} />
            <EventCard title="Dunk Contest" icon="🔥"
              result={asd.dunkContest} participants={asd.dunkParticipants}
              league={league} onSim={handleSimDunk} onWatch={handleWatchDunk} />
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

      {/* ── Watch modals ── */}
      {watchGameResult && (
        <WatchGameModal result={watchGameResult} onClose={() => setWatchGameResult(null)} />
      )}
      {watchEventResult && (
        <WatchEventModal result={watchEventResult} onClose={() => setWatchEventResult(null)} />
      )}
    </div>
  );
};

export default AllStar;
