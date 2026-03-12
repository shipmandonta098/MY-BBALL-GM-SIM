import React, { useState } from 'react';
import {
  LeagueState, AllStarWeekendData, AllStarContestResult,
  AllStarGameResult, Player, AllStarVoteEntry,
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
  const wScore = 18 + Math.floor(Math.random() * 9);   // 18-26 of 27
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

function simulateAllStarGame(league: LeagueState, eastRoster: string[], westRoster: string[]): AllStarGameResult {
  // Quarter-by-quarter simulation — All-Star games average ~170-220 pts per team
  const simQ = () => 38 + Math.floor(Math.random() * 18);  // 38-55 per quarter
  const eQ = [simQ(), simQ(), simQ(), simQ()];
  const wQ = [simQ(), simQ(), simQ(), simQ()];
  const eastScore = eQ.reduce((a, b) => a + b, 0);
  const westScore = wQ.reduce((a, b) => a + b, 0);

  const winnerRoster = eastScore >= westScore ? eastRoster : westRoster;
  // MVP: highest performing player on winning team (OVR + scoring ability + randomness)
  let mvpId = winnerRoster[0];
  let mvpBest = -1;
  for (const id of winnerRoster) {
    const p = getPlayerById(league, id);
    if (!p) continue;
    const s = p.rating * 0.5 + ppg(p) * 1.5 + Math.random() * 18;
    if (s > mvpBest) { mvpBest = s; mvpId = id; }
  }
  const mvpPlayer = getPlayerById(league, mvpId)!;
  const pts = 22 + Math.floor(Math.random() * 18);
  const reb = 4 + Math.floor(Math.random() * 9);
  const ast = 4 + Math.floor(Math.random() * 10);
  const stl = Math.floor(Math.random() * 4);
  const confWon = eastScore >= westScore ? 'East' : 'West';

  return {
    eastScore, westScore,
    mvp: {
      playerId: mvpId, playerName: mvpPlayer.name,
      teamId: teamId(league, mvpId), teamName: teamName(league, mvpId),
      statLine: `${pts} pts, ${reb} reb, ${ast} ast, ${stl} stl`,
    },
    eastRoster, westRoster,
    quarterScores: { east: eQ, west: wQ },
    highlights: [
      `${confWon} wins ${Math.max(eastScore, westScore)}-${Math.min(eastScore, westScore)} in an offensive showcase!`,
      `${mvpPlayer.name} was unstoppable: ${pts} points on high-efficiency shooting.`,
      `Both teams combined for ${eastScore + westScore} points — a new All-Star scoring landmark.`,
      `${mvpPlayer.name} caps the night with the MVP trophy to a standing ovation.`,
    ],
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
            const rep = getPlayerById(league, r.replacementId);
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

    {/* Participants chips */}
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
        {/* Winner */}
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
        {/* Highlights */}
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

// ── Main component ────────────────────────────────────────────────────────────
const AllStar: React.FC<AllStarProps> = ({ league, updateLeague, onAdvancePhase }) => {
  const asd = league.allStarWeekend;
  const [tab, setTab] = useState<'rosters' | 'events' | 'game'>('rosters');

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
    const r = simulateAllStarGame(league, asd.eastRoster, asd.westRoster);
    updateLeague(prev => ({
      ...prev,
      allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, allStarGame: r, completed: true } : prev.allStarWeekend,
      newsFeed: [{
        id: `allstar-game-${Date.now()}`,
        category: 'milestone' as const,
        headline: 'ALL-STAR GAME FINAL',
        content: `${r.eastScore > r.westScore ? 'East' : 'West'} wins the All-Star Game ${Math.max(r.eastScore, r.westScore)}-${Math.min(r.eastScore, r.westScore)}. MVP: ${r.mvp.playerName} (${r.mvp.statLine}).`,
        timestamp: prev.currentDay,
        realTimestamp: Date.now(),
        isBreaking: true,
      }, ...prev.newsFeed],
    }));
  };

  const allEventsComplete = !!(asd.skillsChallenge && asd.threePtContest && asd.dunkContest && asd.allStarGame);

  const TABS = [
    { id: 'rosters' as const, label: 'Rosters' },
    { id: 'events' as const, label: 'Events' },
    { id: 'game' as const, label: 'All-Star Game' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-orange-500/20 p-7"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1a0a00 50%, #0f172a 100%)' }}>
        {/* Stars background */}
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

      {/* ── Vote legend ── */}
      <div className="flex flex-wrap gap-3 text-xs">
        {([
          { type: 'starter-fan' as const, label: 'Fan Vote (50%)', desc: 'OVR + PPG + team wins' },
          { type: 'starter-media' as const, label: 'Media/Coach Vote (50%)', desc: 'OVR + PER + form' },
          { type: 'reserve-coach' as const, label: 'Coach Pick (reserves)', desc: 'OVR + impact + need' },
        ]).map(({ type, label, desc }) => (
          <div key={type} className="flex items-center gap-1.5">
            <SelectionBadge type={type} />
            <span className="text-slate-500">{desc}</span>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-800/40 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${tab === t.id ? 'bg-orange-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Rosters ── */}
      {tab === 'rosters' && (
        <div className="grid lg:grid-cols-2 gap-5">
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
          {/* Qualification info */}
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

      {/* ── All-Star Game ── */}
      {tab === 'game' && (
        <div className="space-y-5">
          {!asd.allStarGame ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-10 text-center space-y-5">
              <div className="text-7xl">🏀</div>
              <div>
                <h3 className="font-display font-bold text-2xl text-white mb-1">East vs. West</h3>
                <p className="text-slate-400">The ultimate All-Star exhibition. {asd.eastRoster.length} East vs {asd.westRoster.length} West.</p>
              </div>
              <div className="flex justify-center gap-10">
                {[
                  { label: 'East Starters', players: asd.eastStarters, color: 'text-blue-400' },
                  { label: 'West Starters', players: asd.westStarters, color: 'text-red-400' },
                ].map(({ label, players, color }) => (
                  <div key={label} className="space-y-1.5">
                    <div className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</div>
                    {players.map(id => {
                      const p = getPlayerById(league, id);
                      return p ? <div key={id} className="text-slate-300 text-sm">{p.name}</div> : null;
                    })}
                  </div>
                ))}
              </div>
              <button onClick={handleSimGame}
                className="px-10 py-3 bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-bold text-base rounded-xl transition-all shadow-lg shadow-orange-500/20">
                Simulate All-Star Game
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Scoreboard */}
              <div className="border border-slate-700 rounded-2xl overflow-hidden">
                <div className="text-center py-2 bg-slate-800/50 border-b border-slate-700">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Final · All-Star Game {asd.year}</span>
                </div>
                <div className="grid grid-cols-3 text-center p-6"
                  style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, transparent 50%, rgba(239,68,68,0.08) 100%)' }}>
                  <div>
                    <div className="font-display font-bold text-5xl text-blue-400">{asd.allStarGame.eastScore}</div>
                    <div className="text-slate-400 text-sm font-bold mt-1">EAST</div>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1">
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
                    <div className="font-display font-bold text-5xl text-red-400">{asd.allStarGame.westScore}</div>
                    <div className="text-slate-400 text-sm font-bold mt-1">WEST</div>
                  </div>
                </div>
                <div className="text-center pb-3">
                  <span className={`text-sm font-bold ${asd.allStarGame.eastScore > asd.allStarGame.westScore ? 'text-blue-400' : 'text-red-400'}`}>
                    {asd.allStarGame.eastScore > asd.allStarGame.westScore ? 'East Wins!' : 'West Wins!'}
                    {' '}· {Math.max(asd.allStarGame.eastScore, asd.allStarGame.westScore)}-{Math.min(asd.allStarGame.eastScore, asd.allStarGame.westScore)}
                  </span>
                </div>
              </div>

              {/* MVP */}
              <div className="bg-gradient-to-r from-orange-950/30 to-slate-900 border border-orange-500/25 rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-orange-500/15 border-2 border-orange-400/50 flex items-center justify-center shrink-0">
                    <StarIcon className="w-7 h-7 text-orange-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-orange-400 font-black uppercase tracking-[0.2em]">All-Star Game MVP</div>
                    <div className="font-display font-bold text-2xl text-white">{asd.allStarGame.mvp.playerName}</div>
                    <div className="text-slate-400 text-sm">{asd.allStarGame.mvp.teamName}</div>
                    <div className="text-orange-300 font-mono text-sm font-bold mt-0.5">{asd.allStarGame.mvp.statLine}</div>
                  </div>
                </div>
              </div>

              {/* Highlights */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">Game Highlights</h4>
                <div className="space-y-2">
                  {asd.allStarGame.highlights.map((h, i) => (
                    <div key={i} className="flex gap-2.5 text-sm text-slate-300">
                      <span className="text-orange-500 shrink-0 mt-0.5">▸</span>
                      {h}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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
