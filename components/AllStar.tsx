import React, { useState } from 'react';
import { LeagueState, AllStarWeekendData, AllStarContestResult, AllStarGameResult, Player } from '../types';

interface AllStarProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState> | ((prev: LeagueState) => LeagueState)) => void;
  onAdvancePhase: () => void;
}

const STAR_ICON = 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z';

function getPlayerById(league: LeagueState, id: string): Player | undefined {
  for (const team of league.teams) {
    const p = team.roster.find(pl => pl.id === id);
    if (p) return p;
  }
  return undefined;
}

function getTeamName(league: LeagueState, playerId: string): string {
  for (const team of league.teams) {
    if (team.roster.some(p => p.id === playerId)) return `${team.city} ${team.name}`;
  }
  return '';
}

function getTeamId(league: LeagueState, playerId: string): string {
  for (const team of league.teams) {
    if (team.roster.some(p => p.id === playerId)) return team.id;
  }
  return '';
}

/** Pick best candidate for a contest from roster */
function pickContestWinner(league: LeagueState, candidates: string[], attr: keyof Player['attributes']): { playerId: string; playerName: string; teamId: string; teamName: string } {
  let best = candidates[0];
  let bestScore = -1;
  for (const id of candidates) {
    const p = getPlayerById(league, id);
    if (!p) continue;
    const score = (p.attributes[attr] || 0) + Math.random() * 25;
    if (score > bestScore) { bestScore = score; best = id; }
  }
  const winner = getPlayerById(league, best)!;
  return { playerId: best, playerName: winner.name, teamId: getTeamId(league, best), teamName: getTeamName(league, best) };
}

function pickContestRunnerUp(league: LeagueState, candidates: string[], winnerId: string, attr: keyof Player['attributes']): { playerId: string; playerName: string; teamId: string; teamName: string } {
  const others = candidates.filter(id => id !== winnerId);
  return pickContestWinner(league, others.length > 0 ? others : candidates, attr);
}

function simulateSkillsChallenge(league: LeagueState, allRoster: string[]): AllStarContestResult {
  // Skills challenge: favor PGs and SGs with high ballHandling + passing
  const guards = allRoster.filter(id => {
    const p = getPlayerById(league, id);
    return p && (p.position === 'PG' || p.position === 'SG');
  });
  const pool = guards.length >= 4 ? guards : allRoster;
  const winner = pickContestWinner(league, pool, 'ballHandling');
  const runnerUp = pickContestRunnerUp(league, pool, winner.playerId, 'ballHandling');
  return {
    eventName: 'Skills Challenge',
    winner,
    runnerUp,
    highlights: [
      `${winner.playerName} blazed through the obstacle course with elite ball-handling!`,
      `${runnerUp.playerName} pushed hard but couldn't match ${winner.playerName}'s consistency.`,
    ]
  };
}

function simulate3PtContest(league: LeagueState, allRoster: string[]): AllStarContestResult {
  const shooters = allRoster.filter(id => {
    const p = getPlayerById(league, id);
    return p && (p.attributes.shooting3pt || 0) >= 60;
  });
  const pool = shooters.length >= 4 ? shooters : allRoster;
  const winner = pickContestWinner(league, pool, 'shooting3pt');
  const runnerUp = pickContestRunnerUp(league, pool, winner.playerId, 'shooting3pt');
  const score = 18 + Math.floor(Math.random() * 9);
  const runnerScore = score - 1 - Math.floor(Math.random() * 4);
  return {
    eventName: '3-Point Contest',
    winner,
    runnerUp,
    highlights: [
      `${winner.playerName} drained ${score} of 27 attempts to claim the crown!`,
      `${runnerUp.playerName} finished runner-up with ${runnerScore} points.`,
      `The crowd roared as ${winner.playerName} buried the money ball rack!`,
    ]
  };
}

function simulateDunkContest(league: LeagueState, allRoster: string[]): AllStarContestResult {
  const dunkers = allRoster.filter(id => {
    const p = getPlayerById(league, id);
    return p && (p.attributes.dunks || 0) >= 55 && (p.attributes.jumping || 0) >= 55;
  });
  const pool = dunkers.length >= 2 ? dunkers : allRoster;
  const winner = pickContestWinner(league, pool, 'dunks');
  const runnerUp = pickContestRunnerUp(league, pool, winner.playerId, 'dunks');
  const dunks = ['a 360-degree windmill', 'a between-the-legs off the backboard', 'a no-look reverse', 'a baseline power slam', 'an elbow hang'];
  const dunk1 = dunks[Math.floor(Math.random() * dunks.length)];
  const dunk2 = dunks[Math.floor(Math.random() * dunks.length)];
  return {
    eventName: 'Dunk Contest',
    winner,
    runnerUp,
    highlights: [
      `${winner.playerName} opened with ${dunk1} — a perfect 50 from the judges!`,
      `The finale featured ${dunk2} that left the arena breathless.`,
      `${winner.playerName} takes home the trophy with showmanship and pure athleticism.`,
    ]
  };
}

function simulateAllStarGame(league: LeagueState, eastRoster: string[], westRoster: string[]): AllStarGameResult {
  const eastScore = 170 + Math.floor(Math.random() * 50);
  const westScore = 170 + Math.floor(Math.random() * 50);

  // MVP: highest-rated active player in winning conference
  const winnerRoster = eastScore > westScore ? eastRoster : westRoster;
  let mvpId = winnerRoster[0];
  let mvpScore = -1;
  for (const id of winnerRoster) {
    const p = getPlayerById(league, id);
    if (!p) continue;
    const s = p.rating + Math.random() * 15;
    if (s > mvpScore) { mvpScore = s; mvpId = id; }
  }
  const mvpPlayer = getPlayerById(league, mvpId)!;
  const pts = 20 + Math.floor(Math.random() * 20);
  const reb = 5 + Math.floor(Math.random() * 8);
  const ast = 5 + Math.floor(Math.random() * 10);

  return {
    eastScore,
    westScore,
    mvp: {
      playerId: mvpId,
      playerName: mvpPlayer.name,
      teamId: getTeamId(league, mvpId),
      teamName: getTeamName(league, mvpId),
      statLine: `${pts} pts / ${reb} reb / ${ast} ast`,
    },
    eastRoster,
    westRoster,
    highlights: [
      `${mvpPlayer.name} dominated with ${pts} pts to lead the ${eastScore > westScore ? 'East' : 'West'} to a ${Math.max(eastScore, westScore)}-${Math.min(eastScore, westScore)} victory!`,
      `The game featured non-stop scoring — both teams shot over 50% from the field.`,
      `${mvpPlayer.name} was named All-Star Game MVP for the historic performance.`,
    ]
  };
}

const EventCard: React.FC<{
  title: string;
  icon: string;
  result?: AllStarContestResult;
  done: boolean;
  onSim: () => void;
}> = ({ title, icon, result, done, onSim }) => (
  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <h3 className="font-display font-bold text-lg text-white">{title}</h3>
      </div>
      {done ? (
        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/30">COMPLETE</span>
      ) : (
        <button
          onClick={onSim}
          className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-sm rounded-lg transition-colors"
        >
          Simulate
        </button>
      )}
    </div>
    {result && (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-orange-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d={STAR_ICON} />
          </svg>
          <span className="text-orange-300 font-bold text-sm">Winner: {result.winner.playerName}</span>
          <span className="text-slate-400 text-xs">({result.winner.teamName})</span>
        </div>
        {result.runnerUp && (
          <div className="text-slate-400 text-xs ml-6">Runner-up: {result.runnerUp.playerName}</div>
        )}
        <ul className="space-y-1 mt-2">
          {result.highlights.map((h, i) => (
            <li key={i} className="text-slate-300 text-xs flex gap-2">
              <span className="text-orange-400 shrink-0">•</span>
              {h}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const AllStar: React.FC<AllStarProps> = ({ league, updateLeague, onAdvancePhase }) => {
  const asd = league.allStarWeekend;
  const [tab, setTab] = useState<'rosters' | 'events' | 'game'>('rosters');

  if (!asd) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg">All-Star Weekend hasn't been set up yet.</p>
      </div>
    );
  }

  const eastPlayers = asd.eastRoster.map(id => {
    const p = getPlayerById(league, id);
    return p ? { ...p, teamName: getTeamName(league, id) } : null;
  }).filter(Boolean) as (Player & { teamName: string })[];

  const westPlayers = asd.westRoster.map(id => {
    const p = getPlayerById(league, id);
    return p ? { ...p, teamName: getTeamName(league, id) } : null;
  }).filter(Boolean) as (Player & { teamName: string })[];

  const allRoster = [...asd.eastRoster, ...asd.westRoster];

  const handleSimSkills = () => {
    const result = simulateSkillsChallenge(league, allRoster);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, skillsChallenge: result } : prev.allStarWeekend }));
  };

  const handleSim3Pt = () => {
    const result = simulate3PtContest(league, allRoster);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, threePtContest: result } : prev.allStarWeekend }));
  };

  const handleSimDunk = () => {
    const result = simulateDunkContest(league, allRoster);
    updateLeague(prev => ({ ...prev, allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, dunkContest: result } : prev.allStarWeekend }));
  };

  const handleSimGame = () => {
    const result = simulateAllStarGame(league, asd.eastRoster, asd.westRoster);
    updateLeague(prev => ({
      ...prev,
      allStarWeekend: prev.allStarWeekend ? { ...prev.allStarWeekend, allStarGame: result, completed: true } : prev.allStarWeekend,
      newsFeed: [{
        id: `allstar-game-${Date.now()}`,
        category: 'milestone' as const,
        headline: 'ALL-STAR GAME RECAP',
        content: `East ${result.eastScore} - West ${result.westScore}. MVP: ${result.mvp.playerName} (${result.mvp.statLine})`,
        timestamp: prev.currentDay,
        realTimestamp: Date.now(),
        isBreaking: true,
      }, ...prev.newsFeed]
    }));
  };

  const allEventsComplete = !!(asd.skillsChallenge && asd.threePtContest && asd.dunkContest && asd.allStarGame);

  const RosterTable: React.FC<{ players: (Player & { teamName: string })[]; conf: string; starters: string[] }> = ({ players, conf, starters }) => (
    <div>
      <h3 className="font-display font-bold text-base text-orange-400 mb-3">{conf} Conference All-Stars</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs">
              <th className="text-left py-2 pr-3 font-medium">Player</th>
              <th className="text-left py-2 pr-3 font-medium">Team</th>
              <th className="text-left py-2 pr-3 font-medium">Pos</th>
              <th className="text-right py-2 font-medium">OVR</th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    {starters.includes(p.id) && (
                      <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d={STAR_ICON} />
                      </svg>
                    )}
                    <span className="font-medium text-white">{p.name}</span>
                    {starters.includes(p.id) && <span className="text-xs text-orange-300 font-bold">STARTER</span>}
                  </div>
                </td>
                <td className="py-2 pr-3 text-slate-400 text-xs">{p.teamName}</td>
                <td className="py-2 pr-3 text-slate-400">{p.position}</td>
                <td className="py-2 text-right font-bold" style={{ color: p.rating >= 85 ? '#f97316' : p.rating >= 75 ? '#eab308' : '#94a3b8' }}>{p.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-orange-950/30 to-slate-900 border border-orange-500/20 p-8">
        <div className="absolute inset-0 opacity-5">
          {[...Array(20)].map((_, i) => (
            <svg key={i} className="absolute w-8 h-8 text-orange-400" style={{ top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%` }} fill="currentColor" viewBox="0 0 24 24">
              <path d={STAR_ICON} />
            </svg>
          ))}
        </div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-8 h-8 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d={STAR_ICON} />
            </svg>
            <h1 className="font-display font-bold text-3xl text-white uppercase tracking-widest">All-Star Weekend</h1>
            <svg className="w-8 h-8 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d={STAR_ICON} />
            </svg>
          </div>
          <p className="text-slate-400 text-sm">{league.season} Season · The league's best players take center stage</p>
          {asd.completed && (
            <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/20 text-emerald-400 font-bold text-sm rounded-full border border-emerald-500/30">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Weekend Complete
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {(['rosters', 'events', 'game'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg font-bold text-sm capitalize transition-all ${tab === t ? 'bg-orange-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            {t === 'game' ? 'All-Star Game' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Rosters Tab */}
      {tab === 'rosters' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <RosterTable players={eastPlayers} conf="Eastern" starters={asd.eastStarters} />
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <RosterTable players={westPlayers} conf="Western" starters={asd.westStarters} />
          </div>
        </div>
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <div className="space-y-4">
          <EventCard title="Skills Challenge" icon="🏃" result={asd.skillsChallenge} done={!!asd.skillsChallenge} onSim={handleSimSkills} />
          <EventCard title="3-Point Contest" icon="🎯" result={asd.threePtContest} done={!!asd.threePtContest} onSim={handleSim3Pt} />
          <EventCard title="Dunk Contest" icon="🔥" result={asd.dunkContest} done={!!asd.dunkContest} onSim={handleSimDunk} />
        </div>
      )}

      {/* All-Star Game Tab */}
      {tab === 'game' && (
        <div className="space-y-5">
          {!asd.allStarGame ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center space-y-4">
              <div className="text-6xl">🏀</div>
              <h3 className="font-display font-bold text-xl text-white">East vs. West — All-Star Game</h3>
              <p className="text-slate-400 text-sm">The league's brightest stars face off in the ultimate exhibition showdown.</p>
              <div className="flex justify-center gap-8 text-sm">
                <div className="text-center">
                  <div className="font-bold text-orange-400 text-lg">{asd.eastRoster.length}</div>
                  <div className="text-slate-400">East Players</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-orange-400 text-lg">{asd.westRoster.length}</div>
                  <div className="text-slate-400">West Players</div>
                </div>
              </div>
              <button
                onClick={handleSimGame}
                className="px-8 py-3 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold rounded-xl transition-colors"
              >
                Simulate All-Star Game
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Scoreboard */}
              <div className="bg-gradient-to-r from-blue-900/30 to-red-900/30 border border-slate-700 rounded-xl p-6">
                <div className="text-center mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Final Score</span>
                </div>
                <div className="flex items-center justify-center gap-8">
                  <div className="text-center">
                    <div className="font-display font-bold text-4xl text-blue-400">{asd.allStarGame.eastScore}</div>
                    <div className="text-slate-400 text-sm font-bold">EAST</div>
                  </div>
                  <div className="text-slate-600 font-bold text-2xl">–</div>
                  <div className="text-center">
                    <div className="font-display font-bold text-4xl text-red-400">{asd.allStarGame.westScore}</div>
                    <div className="text-slate-400 text-sm font-bold">WEST</div>
                  </div>
                </div>
                {asd.allStarGame.eastScore > asd.allStarGame.westScore
                  ? <div className="text-center mt-2 text-blue-400 font-bold text-sm">East Wins!</div>
                  : <div className="text-center mt-2 text-red-400 font-bold text-sm">West Wins!</div>
                }
              </div>

              {/* MVP */}
              <div className="bg-slate-800/60 border border-orange-500/30 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-orange-500/20 border-2 border-orange-400 flex items-center justify-center">
                    <svg className="w-6 h-6 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d={STAR_ICON} />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs text-orange-300 font-bold uppercase tracking-wider">All-Star Game MVP</div>
                    <div className="font-display font-bold text-xl text-white">{asd.allStarGame.mvp.playerName}</div>
                    <div className="text-slate-400 text-sm">{asd.allStarGame.mvp.teamName} · {asd.allStarGame.mvp.statLine}</div>
                  </div>
                </div>
              </div>

              {/* Highlights */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-2">
                <h4 className="font-bold text-sm text-slate-300 uppercase tracking-wider">Game Highlights</h4>
                {asd.allStarGame.highlights.map((h, i) => (
                  <div key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-orange-400 shrink-0">▶</span>
                    {h}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advance phase CTA */}
      {allEventsComplete && (
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="font-bold text-white">All-Star Weekend Complete</div>
            <div className="text-slate-400 text-sm">Resume the regular season and march toward the playoffs.</div>
          </div>
          <button
            onClick={onAdvancePhase}
            className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold rounded-xl transition-colors"
          >
            Continue Season →
          </button>
        </div>
      )}
    </div>
  );
};

export default AllStar;
