import React, { useState, useMemo, useEffect } from 'react';
import { LeagueState, Player, AllStarWeekend, AllStarEventResult, NewsItem } from '../types';

interface AllStarProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onComplete: () => void;
}

// ── Roster selection ─────────────────────────────────────────────────────────

/** Score a player for All-Star candidacy (points + rating + stats) */
const allStarScore = (p: Player): number => {
  const statPts = p.stats.gamesPlayed > 0
    ? (p.stats.points / p.stats.gamesPlayed) * 1.5 +
      (p.stats.assists / p.stats.gamesPlayed) * 1.0 +
      (p.stats.rebounds / p.stats.gamesPlayed) * 0.8
    : 0;
  return p.rating * 0.6 + statPts * 2;
};

const selectAllStarRosters = (
  league: LeagueState
): { eastIds: string[]; westIds: string[] } => {
  const east: Player[] = [];
  const west: Player[] = [];

  league.teams.forEach(t => {
    const bucket = t.conference === 'Eastern' ? east : west;
    t.roster.forEach(p => bucket.push(p));
  });

  const topN = (pool: Player[], n: number) =>
    [...pool].sort((a, b) => allStarScore(b) - allStarScore(a)).slice(0, n).map(p => p.id);

  return { eastIds: topN(east, 12), westIds: topN(west, 12) };
};

// ── Event simulation ─────────────────────────────────────────────────────────

type EventName = 'Skills Challenge' | '3-Point Contest' | 'Slam Dunk Contest' | 'All-Star Game';

const runSkillsChallenge = (players: Player[]): AllStarEventResult => {
  const contestants = [...players]
    .sort((a, b) =>
      (b.attributes.ballHandling + b.attributes.passing + b.attributes.layups) -
      (a.attributes.ballHandling + a.attributes.passing + a.attributes.layups)
    )
    .slice(0, 4);

  const scores = contestants.map(p => ({
    p,
    score: p.attributes.ballHandling * 0.4 + p.attributes.passing * 0.35 +
      p.attributes.layups * 0.25 + Math.random() * 15,
  }));
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0].p;

  return {
    name: 'Skills Challenge',
    winnerId: winner.id,
    winnerName: winner.name,
    highlights: [
      `${winner.name} blazes through the obstacle course in record time`,
      `${scores[1].p.name} puts up a great fight in the final round`,
      `Fans go wild for ${winner.name}'s flawless behind-the-back pass`,
    ],
  };
};

const runThreePointContest = (players: Player[]): AllStarEventResult => {
  const contestants = [...players]
    .sort((a, b) => b.attributes.shooting3pt - a.attributes.shooting3pt)
    .slice(0, 8);

  const scores = contestants.map(p => ({
    p,
    score: Math.round(p.attributes.shooting3pt * 0.35 + Math.random() * 22),
  }));
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0].p;

  return {
    name: '3-Point Contest',
    winnerId: winner.id,
    winnerName: winner.name,
    highlights: [
      `${winner.name} heats up with ${scores[0].score} points — a blazing performance`,
      `${scores[1].p.name} goes back-to-back on the money ball rack`,
      `The crowd erupts as ${winner.name} knocks down the final five`,
    ],
  };
};

const runDunkContest = (players: Player[]): AllStarEventResult => {
  const contestants = [...players]
    .sort((a, b) =>
      (b.attributes.dunks + b.attributes.jumping + b.attributes.athleticism) -
      (a.attributes.dunks + a.attributes.jumping + a.attributes.athleticism)
    )
    .slice(0, 4);

  const scores = contestants.map(p => ({
    p,
    score: p.attributes.dunks * 0.4 + p.attributes.jumping * 0.3 +
      p.attributes.athleticism * 0.3 + Math.random() * 20,
  }));
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0].p;

  const dunks = [
    'a 360-degree windmill from the free-throw line',
    'a between-the-legs reverse dunk over two teammates',
    'a tomahawk from behind the backboard',
    'an elbow-hang windmill that brings the house down',
    'a blindfolded baseline flush',
  ];

  return {
    name: 'Slam Dunk Contest',
    winnerId: winner.id,
    winnerName: winner.name,
    highlights: [
      `${winner.name} throws down ${dunks[Math.floor(Math.random() * dunks.length)]}`,
      `Judges give a perfect 50 — the arena is on its feet`,
      `${scores[1].p.name}'s final dunk nearly steals the show`,
    ],
  };
};

const runAllStarGame = (
  eastPlayers: Player[],
  westPlayers: Player[]
): { result: AllStarEventResult; eastScore: number; westScore: number; mvpId: string } => {
  const eastOVR = eastPlayers.reduce((s, p) => s + p.rating, 0) / eastPlayers.length;
  const westOVR = westPlayers.reduce((s, p) => s + p.rating, 0) / westPlayers.length;

  const baseScore = 135;
  const eastScore = Math.round(baseScore + (eastOVR - 75) * 0.8 + (Math.random() - 0.5) * 18);
  const westScore = Math.round(baseScore + (westOVR - 75) * 0.8 + (Math.random() - 0.5) * 18);

  const allPlayers = [...eastPlayers, ...westPlayers];
  const mvpPool = allPlayers.map(p => ({
    p,
    score: p.rating * 0.5 + Math.random() * 40,
  }));
  mvpPool.sort((a, b) => b.score - a.score);
  const mvp = mvpPool[0].p;
  const winner = eastScore > westScore ? 'East' : 'West';

  const result: AllStarEventResult = {
    name: 'All-Star Game',
    winnerId: mvp.id,
    winnerName: `${winner} wins ${eastScore}-${westScore} · MVP: ${mvp.name}`,
    highlights: [
      `${winner} All-Stars take the lead with back-to-back-to-back threes`,
      `${mvp.name} drops a monster all-star performance — pure entertainment`,
      `Final score: East ${eastScore}, West ${westScore} in a high-flying showcase`,
    ],
  };

  return { result, eastScore, westScore, mvpId: mvp.id };
};

// ── Component ─────────────────────────────────────────────────────────────────

const EVENT_ORDER: EventName[] = [
  'Skills Challenge',
  '3-Point Contest',
  'Slam Dunk Contest',
  'All-Star Game',
];

const EVENT_ICONS: Record<EventName, string> = {
  'Skills Challenge': '🏃',
  '3-Point Contest': '🎯',
  'Slam Dunk Contest': '💥',
  'All-Star Game': '🏀',
};

const EVENT_DESC: Record<EventName, string> = {
  'Skills Challenge': 'Best ball-handlers and passers race through the obstacle course',
  '3-Point Contest': 'Elite shooters compete in back-to-back rack rounds',
  'Slam Dunk Contest': 'The most athletic players put on a show for the judges',
  'All-Star Game': 'Eastern Conference vs Western Conference exhibition game',
};

const AllStar: React.FC<AllStarProps> = ({ league, updateLeague, onComplete }) => {
  const [activeSection, setActiveSection] = useState<'rosters' | 'events'>('rosters');
  const [simming, setSimming] = useState<EventName | null>(null);

  // Build or load weekend state
  const weekend = league.allStarWeekend!;
  const { eastIds, westIds, events } = weekend;

  // Lookup helpers
  const allPlayers = useMemo(
    () => league.teams.flatMap(t => t.roster),
    [league.teams]
  );
  const byId = (id: string) => allPlayers.find(p => p.id === id);

  const eastPlayers = useMemo(
    () => eastIds.map(id => byId(id)).filter(Boolean) as Player[],
    [eastIds, allPlayers]
  );
  const westPlayers = useMemo(
    () => westIds.map(id => byId(id)).filter(Boolean) as Player[],
    [westIds, allPlayers]
  );

  const completedEventNames = new Set(events.map(e => e.name));
  const allEventsComplete = EVENT_ORDER.every(n => completedEventNames.has(n));

  // ── Simulate an event ──
  const handleSimEvent = async (eventName: EventName) => {
    if (completedEventNames.has(eventName) || simming) return;
    setSimming(eventName);

    await new Promise(r => setTimeout(r, 800));

    let result: AllStarEventResult;
    let updates: Partial<AllStarWeekend> = {};

    if (eventName === 'Skills Challenge') {
      result = runSkillsChallenge([...eastPlayers, ...westPlayers]);
    } else if (eventName === '3-Point Contest') {
      result = runThreePointContest([...eastPlayers, ...westPlayers]);
    } else if (eventName === 'Slam Dunk Contest') {
      result = runDunkContest([...eastPlayers, ...westPlayers]);
    } else {
      const { result: gameResult, eastScore, westScore, mvpId } = runAllStarGame(
        eastPlayers,
        westPlayers
      );
      result = gameResult;
      updates = { gameMvpId: mvpId, gameEastScore: eastScore, gameWestScore: westScore };
    }

    const newsItem: NewsItem = {
      id: `allstar-${eventName.replace(/\s/g, '-')}-${Date.now()}`,
      category: 'award',
      headline: `🏆 ALL-STAR: ${eventName.toUpperCase()}`,
      content: `${result.winnerName} — ${result.highlights[0]}`,
      timestamp: league.currentDay,
      realTimestamp: Date.now(),
      isBreaking: eventName === 'All-Star Game',
    };

    updateLeague({
      allStarWeekend: {
        ...weekend,
        ...updates,
        events: [...events, result],
      },
      newsFeed: [newsItem, ...league.newsFeed],
    });

    setSimming(null);
  };

  // ── End weekend ──
  const handleEndWeekend = () => {
    const mvp = weekend.gameMvpId ? byId(weekend.gameMvpId) : null;
    const closingNews: NewsItem = {
      id: `allstar-complete-${Date.now()}`,
      category: 'award',
      headline: '⭐ ALL-STAR WEEKEND COMPLETE',
      content: `The All-Star Weekend is in the books! ${mvp ? `${mvp.name} takes home All-Star Game MVP honors. ` : ''}The second half of the regular season begins now.`,
      timestamp: league.currentDay,
      realTimestamp: Date.now(),
      isBreaking: true,
    };
    updateLeague({
      allStarWeekend: { ...weekend, completed: true },
      newsFeed: [closingNews, ...league.newsFeed],
    });
    onComplete();
  };

  // ── Render helpers ──
  const ConferenceBadge: React.FC<{ conf: 'East' | 'West' }> = ({ conf }) => (
    <span
      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
        conf === 'East'
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'bg-red-500/20 text-red-400 border border-red-500/30'
      }`}
    >
      {conf}
    </span>
  );

  const ratingBadge = (r: number) => {
    if (r >= 90) return 'text-amber-400';
    if (r >= 82) return 'text-emerald-400';
    return 'text-slate-300';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-40">
      {/* ── Hero Header ── */}
      <header className="relative bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 border border-slate-700 rounded-[2.5rem] p-8 overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-transparent to-red-600/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-amber-500/10 blur-[80px] rounded-full -mt-8" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-amber-500 mb-2">
              ⭐ {league.season} All-Star Weekend
            </p>
            <h1 className="text-5xl md:text-6xl font-display font-black uppercase tracking-tighter text-white">
              All-Star
            </h1>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">
              East vs West · Mid-Season Showcase
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-[10px] text-blue-400 font-black uppercase mb-1">Eastern</p>
              <p className="text-3xl font-display font-black text-blue-300">{eastPlayers.length}</p>
              <p className="text-[10px] text-slate-600 uppercase">All-Stars</p>
            </div>
            <div className="text-4xl text-slate-600 font-display">vs</div>
            <div className="text-center">
              <p className="text-[10px] text-red-400 font-black uppercase mb-1">Western</p>
              <p className="text-3xl font-display font-black text-red-300">{westPlayers.length}</p>
              <p className="text-[10px] text-slate-600 uppercase">All-Stars</p>
            </div>
          </div>
        </div>

        {/* Section tabs */}
        <div className="relative z-10 flex gap-2 mt-6">
          {(['rosters', 'events'] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`px-5 py-2 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
                activeSection === s
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white'
              }`}
            >
              {s === 'rosters' ? '👥 Rosters' : '🎪 Events'}
              {s === 'events' && events.length > 0 && (
                <span className="ml-2 text-[10px] bg-emerald-500 text-slate-950 rounded-full px-1.5 py-0.5">
                  {events.length}/{EVENT_ORDER.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── Rosters Section ── */}
      {activeSection === 'rosters' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(
            [
              { label: 'Eastern Conference', players: eastPlayers, conf: 'East' as const, accent: 'border-blue-500/20 bg-blue-900/10' },
              { label: 'Western Conference', players: westPlayers, conf: 'West' as const, accent: 'border-red-500/20 bg-red-900/10' },
            ] as const
          ).map(({ label, players, conf, accent }) => (
            <div key={conf} className={`bg-slate-900 border ${accent} rounded-3xl overflow-hidden shadow-xl`}>
              <div className={`p-5 border-b ${accent} flex items-center justify-between`}>
                <h3 className="font-display font-black uppercase text-white text-lg">{label}</h3>
                <ConferenceBadge conf={conf} />
              </div>
              <div className="divide-y divide-slate-800/50">
                {players.map((p, i) => {
                  const team = league.teams.find(t => t.roster.some(r => r.id === p.id));
                  const ppg = p.stats.gamesPlayed > 0
                    ? (p.stats.points / p.stats.gamesPlayed).toFixed(1)
                    : '—';
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/30 transition-all">
                      <span className="text-[10px] font-black text-slate-600 w-5 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-200 text-sm truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-600 font-bold uppercase">
                          {p.position} · {team?.name ?? ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-black tabular-nums ${ratingBadge(p.rating)}`}>{p.rating}</p>
                        <p className="text-[10px] text-slate-600">{ppg} ppg</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Events Section ── */}
      {activeSection === 'events' && (
        <div className="space-y-4">
          {EVENT_ORDER.map((eventName, idx) => {
            const done = completedEventNames.has(eventName);
            const result = events.find(e => e.name === eventName);
            const prevDone = idx === 0 || completedEventNames.has(EVENT_ORDER[idx - 1]);
            const locked = !prevDone;
            const isSimming = simming === eventName;

            return (
              <div
                key={eventName}
                className={`bg-slate-900 border rounded-3xl overflow-hidden shadow-xl transition-all ${
                  done
                    ? 'border-emerald-500/30'
                    : locked
                      ? 'border-slate-800 opacity-60'
                      : 'border-amber-500/30'
                }`}
              >
                <div className="p-6 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                      done ? 'bg-emerald-500/20' : locked ? 'bg-slate-800' : 'bg-amber-500/20'
                    }`}>
                      {done ? '✅' : EVENT_ICONS[eventName]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-display font-black uppercase text-white">{eventName}</h4>
                        {done && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 font-black uppercase">
                            Complete
                          </span>
                        )}
                        {!done && !locked && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5 font-black uppercase animate-pulse">
                            Up Next
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">{EVENT_DESC[eventName]}</p>

                      {/* Result */}
                      {result && (
                        <div className="mt-4 space-y-2">
                          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                            <p className="text-[10px] font-black uppercase text-amber-500 mb-1">
                              🏆 {eventName === 'All-Star Game' ? 'Result' : 'Winner'}
                            </p>
                            <p className="font-bold text-white text-sm">{result.winnerName}</p>
                          </div>
                          <div className="space-y-1.5">
                            {result.highlights.map((h, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-amber-500 text-xs mt-0.5 shrink-0">›</span>
                                <p className="text-xs text-slate-400 italic">{h}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {!done && !locked && (
                    <button
                      onClick={() => handleSimEvent(eventName)}
                      disabled={!!isSimming}
                      className="shrink-0 px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black uppercase text-sm rounded-xl transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                    >
                      {isSimming ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          Simming…
                        </span>
                      ) : (
                        `Run ${EVENT_ICONS[eventName]}`
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* All-Star Game Score Summary */}
          {weekend.gameEastScore !== undefined && (
            <div className="bg-gradient-to-r from-blue-900/30 via-slate-900 to-red-900/30 border border-slate-700 rounded-3xl p-6 text-center shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-4">Final Score</p>
              <div className="flex items-center justify-center gap-8">
                <div>
                  <p className="text-[10px] text-blue-400 font-black uppercase mb-1">East</p>
                  <p className="text-5xl font-display font-black text-blue-300">{weekend.gameEastScore}</p>
                </div>
                <p className="text-slate-600 font-display text-2xl">—</p>
                <div>
                  <p className="text-[10px] text-red-400 font-black uppercase mb-1">West</p>
                  <p className="text-5xl font-display font-black text-red-300">{weekend.gameWestScore}</p>
                </div>
              </div>
              {weekend.gameMvpId && byId(weekend.gameMvpId) && (
                <div className="mt-4">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">All-Star Game MVP</p>
                  <p className="text-xl font-display font-black text-amber-400 mt-1">
                    ⭐ {byId(weekend.gameMvpId)!.name}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* End Weekend button */}
          {allEventsComplete && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleEndWeekend}
                className="px-12 py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black uppercase text-lg rounded-2xl transition-all shadow-2xl shadow-emerald-500/30 active:scale-95 animate-in zoom-in-95 duration-300"
              >
                Begin Second Half of Season →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { selectAllStarRosters };
export default AllStar;
