import React, { useState, useRef } from 'react';
import { LeagueState, DraftPick, Team } from '../types';
import TeamBadge from './TeamBadge';

interface DraftLotteryProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

// Realistic NBA-style lottery odds (percentages) for picks 1–14 worst→best
const LOTTERY_ODDS_PCT = [14.0, 13.4, 12.7, 12.0, 10.5, 9.0, 7.5, 6.0, 4.5, 3.0, 2.0, 1.5, 1.0, 0.5];
const LOTTERY_WEIGHTS = LOTTERY_ODDS_PCT.map(p => Math.round(p * 10));

type LotteryPhase = 'idle' | 'drawing' | 'revealing' | 'complete';

interface RevealedPick {
  pick: number;
  teamId: string;
  originalSlot: number; // 1-based slot from record order
  jumped: boolean;
}

const DraftLottery: React.FC<DraftLotteryProps> = ({ league, updateLeague }) => {
  const [phase, setPhase] = useState<LotteryPhase>('idle');
  const [animBalls, setAnimBalls] = useState<number[]>([]);
  const [revealedPicks, setRevealedPicks] = useState<RevealedPick[]>([]);
  const [fullOrder, setFullOrder] = useState<DraftPick[]>([]);
  const ballAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sort bottom 14 teams by worst record for lottery eligibility.
  // During offseason the current wins/losses are reset to 0, so use prevSeasonWins/prevSeasonLosses
  // which are captured at season end before the reset. Fall back to current record if not available.
  const sortedByRecord = [...league.teams].sort((a, b) => {
    const aW = a.prevSeasonWins ?? a.wins;
    const aL = a.prevSeasonLosses ?? a.losses;
    const bW = b.prevSeasonWins ?? b.wins;
    const bL = b.prevSeasonLosses ?? b.losses;
    const aWinPct = aW / Math.max(1, aW + aL);
    const bWinPct = bW / Math.max(1, bW + bL);
    return aWinPct - bWinPct;
  });
  const lotteryTeams = sortedByRecord.slice(0, 14);
  const playoffTeams = sortedByRecord.slice(14);

  const userLotterySlot = lotteryTeams.findIndex(t => t.id === league.userTeamId); // -1 if not in lottery

  const computeFullOrder = (): DraftPick[] => {
    // The draft consuming this season's picks: season - 1 is the regular season whose picks were tradable.
    // Picks with year === draftSeason (or legacy no-year picks) were traded during that regular season.
    const draftSeason = league.season - 1;

    // Build a lookup: originalTeamId + round → currentTeamId (respects trades)
    const pickHolderMap = new Map<string, string>();
    for (const team of league.teams) {
      for (const pick of team.picks) {
        if (pick.year === draftSeason || pick.year === undefined) {
          pickHolderMap.set(`${pick.originalTeamId}-${pick.round}`, team.id);
        }
      }
    }
    const holder = (originalTeamId: string, round: number): string =>
      pickHolderMap.get(`${originalTeamId}-${round}`) ?? originalTeamId;

    const results: DraftPick[] = [];
    const usedTeams = new Set<string>();

    // Top 4 picks via weighted draw
    for (let i = 0; i < 4; i++) {
      const candidates = lotteryTeams.filter(t => !usedTeams.has(t.id));
      const weights = candidates.map(t => LOTTERY_WEIGHTS[lotteryTeams.findIndex(lt => lt.id === t.id)]);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let rnd = Math.random() * totalWeight;
      let winner = candidates[0];
      for (let j = 0; j < candidates.length; j++) {
        rnd -= weights[j];
        if (rnd <= 0) { winner = candidates[j]; break; }
      }
      usedTeams.add(winner.id);
      results.push({ round: 1, pick: i + 1, originalTeamId: winner.id, currentTeamId: holder(winner.id, 1), year: draftSeason });
    }

    // Picks 5–14: remaining lottery teams in record order
    lotteryTeams.forEach(t => {
      if (!usedTeams.has(t.id)) {
        usedTeams.add(t.id);
        results.push({ round: 1, pick: results.length + 1, originalTeamId: t.id, currentTeamId: holder(t.id, 1), year: draftSeason });
      }
    });

    // Picks 15–30: playoff teams, worst record first
    [...playoffTeams]
      .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)))
      .forEach(t => {
        results.push({ round: 1, pick: results.length + 1, originalTeamId: t.id, currentTeamId: holder(t.id, 1), year: draftSeason });
      });

    // Additional rounds (2+): reverse order of round 1 for each round
    const numRounds = league.settings.draftRounds ?? 2;
    const r1Copy = results.slice(0, league.teams.length);
    for (let round = 2; round <= numRounds; round++) {
      [...r1Copy].reverse().forEach((p, idx) => {
        results.push({
          round,
          pick: (round - 1) * league.teams.length + idx + 1,
          originalTeamId: p.originalTeamId,
          currentTeamId: holder(p.originalTeamId, round),
          year: draftSeason,
        });
      });
    }

    return results;
  };

  const runLottery = () => {
    if (phase !== 'idle') return;
    setPhase('drawing');
    setRevealedPicks([]);

    ballAnimRef.current = setInterval(() => {
      setAnimBalls(Array.from({ length: 9 }, () => Math.floor(Math.random() * 57) + 1));
    }, 80);

    setTimeout(() => {
      if (ballAnimRef.current) clearInterval(ballAnimRef.current);
      setAnimBalls([]);

      const order = computeFullOrder();
      setFullOrder(order);
      setPhase('revealing');

      // Reveal picks from #14 down to #1 (NBA-style dramatic reveal)
      let revealIdx = 13;
      const reveal = () => {
        if (revealIdx < 0) {
          setPhase('complete');
          const winner = league.teams.find(t => t.id === order[0].currentTeamId);
          const userPick = order.find(p => p.currentTeamId === league.userTeamId && p.round === 1);
          const newsItems = [
            {
              id: `lottery-result-${Date.now()}`,
              category: 'playoffs' as const,
              headline: '🎱 DRAFT LOTTERY RESULTS',
              content: `The ${winner?.name} have landed the #1 overall pick in this year's NBA Draft!${userPick ? ` Your team will select at #${userPick.pick} overall.` : ''}`,
              timestamp: league.currentDay,
              realTimestamp: Date.now(),
              isBreaking: true,
            },
          ];
          // Per-team jump news
          for (let i = 0; i < 4; i++) {
            const pick = order[i];
            const originalSlot = lotteryTeams.findIndex(t => t.id === pick.currentTeamId) + 1;
            if (originalSlot > i + 1) {
              const teamName = league.teams.find(t => t.id === pick.currentTeamId)?.name;
              newsItems.push({
                id: `lottery-jump-${i}-${Date.now()}`,
                category: 'playoffs' as const,
                headline: 'LOTTERY JUMP',
                content: `${teamName} jump from slot #${originalSlot} to select #${i + 1} overall!`,
                timestamp: league.currentDay,
                realTimestamp: Date.now(),
                isBreaking: false,
              });
            }
          }
          updateLeague({
            draftPhase: 'draft',
            draftPicks: order,
            currentDraftPickIndex: 0,
            newsFeed: [...newsItems, ...league.newsFeed],
          });
          return;
        }

        const pick = order[revealIdx];
        const originalSlot = lotteryTeams.findIndex(t => t.id === pick.currentTeamId) + 1; // 1-based, -1 + 1 = 0 if playoff team
        const jumped = originalSlot > 0 && originalSlot > revealIdx + 1;

        setRevealedPicks(prev => [
          { pick: revealIdx + 1, teamId: pick.currentTeamId, originalSlot, jumped },
          ...prev,
        ]);
        revealIdx--;

        // Slow down dramatically for top picks
        const delay = revealIdx >= 10 ? 500 : revealIdx >= 5 ? 750 : revealIdx >= 2 ? 1100 : 1600;
        setTimeout(reveal, delay);
      };

      setTimeout(reveal, 600);
    }, 3200);
  };

  const getTeam = (teamId: string): Team | undefined => league.teams.find(t => t.id === teamId);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* Header */}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">
              Draft <span className="text-amber-500">Lottery</span>
            </h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              {phase === 'idle' && 'Bottom 14 teams compete for top picks'}
              {phase === 'drawing' && <span className="text-amber-500 animate-pulse">Drawing ping-pong balls…</span>}
              {phase === 'revealing' && <span className="text-amber-400 animate-pulse">Revealing draft order…</span>}
              {phase === 'complete' && <span className="text-emerald-400">Lottery complete — Draft begins next</span>}
            </p>
          </div>

          {phase === 'idle' && (
            <button
              onClick={runLottery}
              className="px-10 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase text-lg rounded-xl transition-all shadow-xl shadow-amber-500/20 active:scale-95"
            >
              🎱 Run Lottery
            </button>
          )}
        </div>
      </header>

      {/* Ping-pong ball animation */}
      {phase === 'drawing' && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-10 text-center shadow-2xl animate-in zoom-in-95 duration-300">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-6">Drawing Ping-Pong Balls</p>
          <div className="flex flex-wrap justify-center gap-3 mb-6 min-h-[60px]">
            {animBalls.map((n, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-full bg-amber-500 text-slate-950 font-display font-black text-lg flex items-center justify-center shadow-lg shadow-amber-500/30 animate-bounce"
                style={{ animationDelay: `${i * 0.08}s`, animationDuration: '0.4s' }}
              >
                {n}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest animate-pulse">Calculating results…</p>
        </div>
      )}

      {/* Reveal section */}
      {(phase === 'revealing' || phase === 'complete') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Picks being revealed */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500">
              {phase === 'revealing' ? '▶ Revealing…' : '✓ Lottery Picks 1–14'}
            </h3>
            <div className="space-y-2">
              {revealedPicks.map(({ pick, teamId, jumped }) => {
                const team = getTeam(teamId);
                const isUser = teamId === league.userTeamId;
                if (!team) return null;
                return (
                  <div
                    key={pick}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all animate-in slide-in-from-top-3 duration-500 ${
                      isUser
                        ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-500/30'
                        : pick <= 4
                        ? 'bg-slate-800/80 border-slate-600'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-lg shrink-0 ${
                        pick === 1 ? 'bg-amber-500 text-slate-950' :
                        pick <= 4 ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {pick}
                    </div>
                    <TeamBadge team={team} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold uppercase text-sm truncate ${isUser ? 'text-amber-400' : 'text-slate-200'}`}>
                        {team.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">
                        {team.prevSeasonWins ?? team.wins}–{team.prevSeasonLosses ?? team.losses}
                      </p>
                    </div>
                    {jumped && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 shrink-0">
                        ↑ Jump
                      </span>
                    )}
                    {isUser && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 shrink-0">
                        Your Pick
                      </span>
                    )}
                  </div>
                );
              })}
              {phase === 'revealing' && revealedPicks.length < 14 && (
                <div className="flex items-center gap-3 p-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <p className="text-sm text-slate-600 font-bold uppercase tracking-widest animate-pulse">Revealing…</p>
                </div>
              )}
            </div>
          </div>

          {/* Full 30-pick order (shown when complete) */}
          {phase === 'complete' && fullOrder.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Full Draft Order</h3>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl max-h-[560px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                {/* Round 1 */}
                <div className="px-4 py-3 bg-slate-950/50 border-b border-slate-800 sticky top-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500">Round 1</span>
                </div>
                {fullOrder.filter(p => p.round === 1).map(p => {
                  const team = getTeam(p.currentTeamId);
                  const isUser = p.currentTeamId === league.userTeamId;
                  if (!team) return null;
                  return (
                    <div
                      key={p.pick}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-slate-800/40 hover:bg-slate-800/30 transition-all ${isUser ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}
                    >
                      <span className={`font-mono text-sm w-6 shrink-0 ${p.pick <= 4 ? 'text-amber-500 font-black' : 'text-slate-600'}`}>
                        {p.pick}
                      </span>
                      <TeamBadge team={team} size="xs" />
                      <span className={`text-xs font-bold uppercase truncate ${isUser ? 'text-amber-400' : 'text-slate-300'}`}>
                        {team.name}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-600 font-bold">
                        {team.prevSeasonWins ?? team.wins}–{team.prevSeasonLosses ?? team.losses}
                      </span>
                    </div>
                  );
                })}
                {/* Round 2 */}
                <div className="px-4 py-3 bg-slate-950/50 border-b border-slate-800 sticky top-0 mt-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Round 2</span>
                </div>
                {fullOrder.filter(p => p.round === 2).map((p, idx) => {
                  const team = getTeam(p.currentTeamId);
                  const isUser = p.currentTeamId === league.userTeamId;
                  if (!team) return null;
                  return (
                    <div
                      key={p.pick}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-slate-800/40 hover:bg-slate-800/30 transition-all ${isUser ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}
                    >
                      <span className="font-mono text-sm w-6 shrink-0 text-slate-600">{idx + 1}</span>
                      <TeamBadge team={team} size="xs" />
                      <span className={`text-xs font-bold uppercase truncate ${isUser ? 'text-amber-400' : 'text-slate-500'}`}>
                        {team.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lottery Teams table (shown when idle) */}
      {phase === 'idle' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-slate-800">
            <h3 className="text-xl font-display font-bold uppercase tracking-widest text-white">
              Lottery Eligible Teams
              <span className="ml-3 text-sm font-mono text-slate-500">Bottom 14 by record</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500">
                  <th className="px-6 py-4">Slot</th>
                  <th className="px-6 py-4">Team</th>
                  <th className="px-6 py-4 text-center">W–L</th>
                  <th className="px-6 py-4 text-center">Win%</th>
                  <th className="px-6 py-4 text-right">Top-Pick Odds</th>
                  <th className="px-6 py-4 text-right">Odds Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {lotteryTeams.map((team, idx) => {
                  const isUser = team.id === league.userTeamId;
                  const pct = LOTTERY_ODDS_PCT[idx];
                  const prevW = team.prevSeasonWins ?? team.wins;
                  const prevL = team.prevSeasonLosses ?? team.losses;
                  const winPct = (prevW / Math.max(1, prevW + prevL) * 100).toFixed(1);
                  return (
                    <tr key={team.id} className={`group hover:bg-slate-800/30 transition-all ${isUser ? 'bg-amber-500/5' : ''}`}>
                      <td className="px-6 py-4">
                        <span className={`font-display font-black text-lg ${idx === 0 ? 'text-amber-500' : 'text-slate-600'}`}>
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <TeamBadge team={team} size="xs" />
                          <div>
                            <p className={`font-bold uppercase tracking-tight ${isUser ? 'text-amber-400' : 'text-slate-200'}`}>
                              {team.name}
                            </p>
                            {isUser && (
                              <p className="text-[10px] text-amber-500 font-black uppercase">Your Team</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-mono text-slate-300">
                          {team.prevSeasonWins ?? team.wins}–{team.prevSeasonLosses ?? team.losses}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-500 font-mono">{winPct}%</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-display font-black text-base ${pct >= 13 ? 'text-amber-500' : pct >= 9 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right pr-8">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500 transition-all"
                              style={{ width: `${(pct / 14.0) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-800 bg-slate-950/30">
            <p className="text-[10px] text-slate-600 text-center font-bold uppercase tracking-widest">
              Top 4 picks drawn by weighted lottery · Picks 5–14 ordered by record · Teams 15–30 in playoff order
            </p>
          </div>
        </div>
      )}

      {/* Playoff teams note */}
      {phase === 'idle' && playoffTeams.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-4">
            Playoff Teams — Picks 15–30 (set by record)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[...playoffTeams]
              .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)))
              .map((team, idx) => (
                <div key={team.id} className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${team.id === league.userTeamId ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-950/40'}`}>
                  <span className="text-[10px] font-black text-slate-600">#{15 + idx}</span>
                  <TeamBadge team={team} size="xs" />
                  <p className="text-[9px] font-bold uppercase text-slate-400 truncate max-w-full text-center">{team.name}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftLottery;
