import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LeagueState, Team, Prospect, DraftPick, Player } from '../types';
import { getFlag } from '../constants';
import WatchToggle from './WatchToggle';
import { aiGMDraftPick, computeTeamNeeds, prospectNeedFit, TeamNeedItem } from '../utils/aiGMEngine';
import DraftLottery from './DraftLottery';
import ProspectProfile from './ProspectProfile';
import DraftPickTrade from './DraftPickTrade';
import TeamBadge from './TeamBadge';

interface DraftProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onScout: (player: Prospect) => void;
  scoutingReport: { playerId: string; report: string } | null;
  onNavigateToFreeAgency?: () => void;
}

const Draft: React.FC<DraftProps> = ({ league, updateLeague, onScout, scoutingReport, onNavigateToFreeAgency }) => {
  const [scoutPoints, setScoutPoints] = useState(100);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSimming, setIsSimming] = useState(false);
  const [isSimToEnd, setIsSimToEnd] = useState(false);
  const [showSimToEndConfirm, setShowSimToEndConfirm] = useState(false);
  const [draftLog, setDraftLog] = useState<string[]>([]);

  // Watch list
  const watchList = league.watchList ?? [];
  const toggleWatch = (id: string) => {
    updateLeague({ watchList: watchList.includes(id) ? watchList.filter(x => x !== id) : [...watchList, id] });
  };

  // Prospect profile modal
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);

  // Pick trade modal
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [pickToTrade, setPickToTrade] = useState<DraftPick | undefined>(undefined);

  // Draft order panel
  const [showDraftOrder, setShowDraftOrder] = useState(true);
  const [draftOrderRound, setDraftOrderRound] = useState(1);
  const draftOrderContainerRef = useRef<HTMLDivElement>(null);
  const currentPickRowRef = useRef<HTMLDivElement>(null);

  const currentPickIndex = league.currentDraftPickIndex || 0;
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  // ─── Draft Execution ───────────────────────────────────────────────────────
  const startDraftSim = () => {
    setIsDrafting(true);
    setIsSimming(false);
    setDraftLog(['🏀 The NBA Draft is now underway!']);
  };

  const startSimToMyPick = () => {
    if (!isDrafting) {
      setIsDrafting(true);
      setDraftLog(['🏀 The NBA Draft is now underway!']);
    }
    setIsSimming(true);
  };

  const makePick = (teamId: string, prospect: Prospect) => {
    const team = league.teams.find(t => t.id === teamId)!;
    const newPlayer: Player = {
      ...prospect,
      salary: Math.floor((prospect.rating / 100) * 8_000_000),
      contractYears: Math.min(4, league.settings.maxContractYears ?? 4),
      status: 'Rotation',
      morale: 85,
      stats: {
        points: 0, rebounds: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0,
        gamesPlayed: 0, gamesStarted: 0, minutes: 0, fgm: 0, fga: 0,
        threepm: 0, threepa: 0, ftm: 0, fta: 0, tov: 0, pf: 0,
        techs: 0, flagrants: 0, ejections: 0, plusMinus: 0,
      },
    };

    const updatedTeams = league.teams.map(t =>
      t.id === teamId ? { ...t, roster: [...t.roster, newPlayer] } : t
    );
    const pickNum = currentPickIndex + 1;
    const round = (league.draftPicks?.[currentPickIndex]?.round) ?? 1;
    const teamsCount = league.teams.length;
    const pickInRound = round === 1 ? pickNum : pickNum - (round - 1) * teamsCount;
    const label = `Round ${round}, Pick #${pickInRound}`;

    setDraftLog(prev => [
      `${label}: The ${team.name} select ${prospect.name} (${prospect.position}) — ${prospect.school}`,
      ...prev,
    ]);
    updateLeague({ teams: updatedTeams, currentDraftPickIndex: currentPickIndex + 1 });
  };

  const executeAIPick = () => {
    const picks = league.draftPicks || [];
    if (!isDrafting || currentPickIndex >= picks.length) {
      if (isDrafting) {
        setIsDrafting(false);
        setIsSimming(false);
        setIsSimToEnd(false);
        const newsItem = {
          id: `draft-complete-${Date.now()}`,
          category: 'playoffs' as const,
          headline: '✅ DRAFT COMPLETE',
          content: 'The NBA Draft has concluded. Free Agency moratorium begins now — signings open shortly!',
          timestamp: league.currentDay,
          realTimestamp: Date.now(),
          isBreaking: true,
        };
        // Remove current-year picks from team.picks — they've been exercised in the draft
        const draftedSeason = league.season - 1;
        const cleanedTeams = league.teams.map(t => ({
          ...t,
          picks: t.picks.filter(p => p.year !== undefined && p.year > draftedSeason),
        }));
        updateLeague({ draftPhase: 'completed', teams: cleanedTeams, newsFeed: [newsItem, ...league.newsFeed] });
      }
      return;
    }

    const currentPick = picks[currentPickIndex];
    if (currentPick.currentTeamId === league.userTeamId && !isSimToEnd) return; // Pause for user

    const available = league.prospects.filter(
      p => !league.teams.some(t => t.roster.some(r => r.id === p.id))
    );
    const pickTeam = league.teams.find(t => t.id === currentPick.currentTeamId);
    const best = pickTeam
      ? (aiGMDraftPick(pickTeam, available, league.settings.difficulty ?? 'Medium') ?? available[0])
      : available[0];

    if (best) makePick(currentPick.currentTeamId, best);
  };

  useEffect(() => {
    if (!isDrafting) return;

    const picks = league.draftPicks || [];
    const cp = picks[currentPickIndex];

    // Stop simming when it's the user's turn (unless simming to end)
    if (cp?.currentTeamId === league.userTeamId && !isSimToEnd) {
      if (isSimming) setIsSimming(false);
      return;
    }

    const delay = isSimToEnd ? 60 : isSimming ? 80 : 900;
    const timer = setTimeout(executeAIPick, delay);
    return () => clearTimeout(timer);
  }, [isDrafting, currentPickIndex, isSimming, isSimToEnd]);

  const availableProspects = useMemo(() => {
    const draftedIds = new Set(league.teams.flatMap(t => t.roster.map(p => p.id)));
    return league.prospects.filter(p => !draftedIds.has(p.id));
  }, [league.prospects, league.teams]);

  const draftClassTalent = useMemo((): 'Strong' | 'Average' | 'Weak' => {
    const sorted = [...league.prospects].sort((a, b) => b.rating - a.rating);
    const top10 = sorted.slice(0, 10);
    const avgRating = top10.length > 0 ? top10.reduce((s, p) => s + p.rating, 0) / top10.length : 0;
    const eliteCount = sorted.filter(p => p.rating >= 90).length;
    if (avgRating >= 82 && eliteCount >= 3) return 'Strong';
    if (avgRating >= 75 || eliteCount >= 1) return 'Average';
    return 'Weak';
  }, [league.prospects]);

  // Needs for the user's team (recalculated when roster/scheme/record changes)
  const userTeamNeeds = useMemo(
    () => computeTeamNeeds(userTeam),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userTeam.roster, userTeam.activeScheme, userTeam.wins, userTeam.losses]
  );

  const currentPick = league.draftPicks?.[currentPickIndex];
  const isUserTurn = isDrafting && currentPick?.currentTeamId === league.userTeamId;
  const totalPicks = league.draftPicks?.length ?? 0;
  const draftProgress = totalPicks > 0 ? Math.round((currentPickIndex / totalPicks) * 100) : 0;

  // Needs for whichever team is currently on the clock
  const draftingTeamNeeds = useMemo(() => {
    if (!isDrafting || !currentPick) return userTeamNeeds;
    const clockTeam = league.teams.find(t => t.id === currentPick.currentTeamId);
    return clockTeam ? computeTeamNeeds(clockTeam) : userTeamNeeds;
  }, [isDrafting, currentPick, league.teams, userTeamNeeds]);

  // Advance the round tab automatically when the live draft crosses into a new round
  useEffect(() => {
    if (currentPick?.round && currentPick.round !== draftOrderRound) {
      setDraftOrderRound(currentPick.round);
    }
  }, [currentPick?.round]);

  // Scroll the current pick row into view inside the draft order panel
  useEffect(() => {
    if (!isDrafting) return;
    const row = currentPickRowRef.current;
    const container = draftOrderContainerRef.current;
    if (row && container) {
      container.scrollTop = row.offsetTop - container.clientHeight / 3;
    }
  }, [currentPickIndex, isDrafting]);

  // ─── LOTTERY PHASE ────────────────────────────────────────────────────────
  if (league.draftPhase === 'lottery') {
    return <DraftLottery league={league} updateLeague={updateLeague} />;
  }

  // ─── DRAFT COMPLETE PHASE ─────────────────────────────────────────────────
  if (league.draftPhase === 'completed') {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-40">
        <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-500/20 rounded-[3rem] p-16 text-center shadow-2xl">
          <div className="text-7xl mb-6">🎓</div>
          <h2 className="text-6xl font-display font-black uppercase tracking-tighter text-white mb-4">
            Draft <span className="text-emerald-400">Complete</span>
          </h2>
          <p className="text-slate-400 text-lg font-bold uppercase tracking-widest mb-10">
            All picks have been made. Free Agency is now open.
          </p>
          {onNavigateToFreeAgency && (
            <button
              onClick={onNavigateToFreeAgency}
              className="px-12 py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black uppercase text-xl rounded-2xl transition-all shadow-2xl shadow-emerald-500/30 active:scale-95"
            >
              Open Free Agency →
            </button>
          )}
        </div>

        {draftLog.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 mb-4">Draft Recap</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
              {draftLog.map((log, i) => (
                <p key={i} className="text-xs text-slate-400 font-mono">{log}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── ACTIVE DRAFT PHASE ───────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* Modals */}
      {selectedProspect && (
        <ProspectProfile
          prospect={selectedProspect}
          isUserTurn={isUserTurn}
          onDraft={isUserTurn ? () => makePick(league.userTeamId, selectedProspect) : undefined}
          onClose={() => setSelectedProspect(null)}
          scoutingReport={
            scoutingReport?.playerId === selectedProspect.id ? scoutingReport.report : undefined
          }
          scoutBudget={league.teams.find(t => t.id === league.userTeamId)?.finances?.budgets?.scouting ?? 20}
        />
      )}

      {showTradeModal && (
        <DraftPickTrade
          league={league}
          updateLeague={updateLeague}
          onClose={() => { setShowTradeModal(false); setPickToTrade(undefined); }}
          preselectedUserPick={pickToTrade}
        />
      )}

      {/* Sim to End confirmation modal */}
      {showSimToEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-4xl mb-4 text-center">⚡</div>
            <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight text-center mb-2">
              Sim Entire Draft?
            </h3>
            <p className="text-sm text-slate-400 text-center mb-6 leading-relaxed">
              AI will make <span className="text-white font-bold">all remaining picks</span> — including yours. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSimToEndConfirm(false)}
                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-sm rounded-xl transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSimToEndConfirm(false);
                  if (!isDrafting) {
                    setIsDrafting(true);
                    setDraftLog(['🏀 The NBA Draft is now underway!']);
                  }
                  setIsSimming(false);
                  setIsSimToEnd(true);
                }}
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold uppercase text-sm rounded-xl transition-all active:scale-95 shadow-lg shadow-rose-500/20"
              >
                Sim to End
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">
              Draft <span className="text-amber-500">HQ</span>
            </h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              Phase: <span className="text-amber-500">LIVE DRAFT</span>
              {isDrafting && (
                <span className="ml-4 text-slate-600">
                  Pick {currentPickIndex + 1} of {totalPicks} ({draftProgress}%)
                </span>
              )}
              {isSimming && (
                <span className="ml-3 text-blue-400 animate-pulse">⚡ Fast-forwarding…</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {league.draftPhase === 'scouting' && (
              <div className="bg-slate-950/50 px-6 py-3 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Scout Points</p>
                <p className="text-2xl font-display font-bold text-amber-500">{scoutPoints}</p>
              </div>
            )}
            {!isDrafting && (() => {
              const lotteryPending = league.draftPhase !== 'draft';
              return (
                <>
                  {lotteryPending && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 hidden sm:block">
                      ⚠ Complete lottery first
                    </span>
                  )}
                  <button
                    onClick={lotteryPending ? undefined : startDraftSim}
                    disabled={lotteryPending}
                    title={lotteryPending ? 'Available after lottery' : undefined}
                    className={`px-8 py-4 font-display font-bold uppercase rounded-xl transition-all text-base ${
                      lotteryPending
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-60'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-xl shadow-emerald-500/20 active:scale-95'
                    }`}
                  >
                    Start Live Draft
                  </button>
                  <button
                    onClick={lotteryPending ? undefined : startSimToMyPick}
                    disabled={lotteryPending}
                    title={lotteryPending ? 'Available after lottery' : undefined}
                    className={`px-6 py-4 font-display font-bold uppercase rounded-xl transition-all text-sm ${
                      lotteryPending
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-60'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/20 active:scale-95'
                    }`}
                  >
                    ⚡ Sim to My Pick
                  </button>
                  <button
                    onClick={lotteryPending ? undefined : () => setShowSimToEndConfirm(true)}
                    disabled={lotteryPending}
                    title={lotteryPending ? 'Available after lottery' : undefined}
                    className={`px-6 py-4 font-display font-bold uppercase rounded-xl transition-all text-sm ${
                      lotteryPending
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-60'
                        : 'bg-rose-700 hover:bg-rose-600 text-white shadow-xl shadow-rose-500/20 active:scale-95'
                    }`}
                  >
                    ⚡⚡ Sim to End
                  </button>
                </>
              );
            })()}
            {isDrafting && !isSimming && !isSimToEnd && !isUserTurn && (
              <>
                <button
                  onClick={() => setIsSimming(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-display font-bold uppercase rounded-xl transition-all text-sm active:scale-95"
                >
                  ⚡ Sim to My Pick
                </button>
                <button
                  onClick={() => setShowSimToEndConfirm(true)}
                  className="px-5 py-3 bg-rose-700 hover:bg-rose-600 text-white font-display font-bold uppercase rounded-xl transition-all text-sm active:scale-95"
                >
                  ⚡⚡ Sim to End
                </button>
              </>
            )}
            {isDrafting && isUserTurn && !isSimToEnd && (
              <button
                onClick={() => setShowSimToEndConfirm(true)}
                className="px-5 py-3 bg-rose-700/80 hover:bg-rose-600 text-white font-display font-bold uppercase rounded-xl transition-all text-sm active:scale-95"
              >
                ⚡⚡ Sim to End
              </button>
            )}
            {isSimming && !isSimToEnd && (
              <button
                onClick={() => setIsSimming(false)}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold uppercase rounded-xl transition-all text-sm active:scale-95"
              >
                ⏸ Pause
              </button>
            )}
            {isSimToEnd && (
              <div className="flex items-center gap-2 px-4 py-2 bg-rose-900/40 border border-rose-700/40 rounded-xl">
                <span className="text-rose-400 animate-pulse text-sm font-black uppercase">⚡⚡ Simming to End…</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isDrafting && (
          <div className="relative z-10 mt-4">
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${draftProgress}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* ── Draft Order Panel ──────────────────────────────────────────────── */}
      {(league.draftPicks?.length ?? 0) > 0 && (() => {
        const numRounds = league.settings.draftRounds ?? 2;
        const allRounds = Array.from({ length: numRounds }, (_, i) => i + 1);
        const teamsCount = league.teams.length;
        const picksForRound = (league.draftPicks ?? []).filter(p => p.round === draftOrderRound);
        const roundStartIdx = (league.draftPicks ?? []).findIndex(p => p.round === draftOrderRound);

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Header row */}
            <button
              onClick={() => setShowDraftOrder(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-800/20 transition-colors"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-200">Draft Order</span>
                <span className="text-[10px] font-bold text-slate-600 uppercase">{teamsCount} teams · {league.draftPicks!.length} total picks</span>
                {isDrafting && currentPick && (
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full text-[9px] font-black text-amber-400 uppercase animate-pulse">
                    Pick {currentPickIndex + 1} on clock
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                {allRounds.map(r => (
                  <button
                    key={r}
                    onClick={e => { e.stopPropagation(); setDraftOrderRound(r); setShowDraftOrder(true); }}
                    className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${draftOrderRound === r ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
                  >
                    R{r}
                  </button>
                ))}
                <span className="text-slate-600 ml-2 text-xs">{showDraftOrder ? '▲' : '▼'}</span>
              </div>
            </button>

            {showDraftOrder && (
              <div
                ref={draftOrderContainerRef}
                className="max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 border-t border-slate-800/60"
              >
                {picksForRound.map((pick, idx) => {
                  const globalIdx = roundStartIdx + idx;
                  const isCurrentPick = isDrafting && globalIdx === currentPickIndex;
                  const isMade = globalIdx < currentPickIndex;
                  const isUserPick = pick.currentTeamId === league.userTeamId;
                  const wasTraded = !!(pick.originalTeamId && pick.originalTeamId !== pick.currentTeamId);
                  const pickingTeam = league.teams.find(t => t.id === pick.currentTeamId);
                  const originalTeam = wasTraded ? league.teams.find(t => t.id === pick.originalTeamId) : null;

                  return (
                    <div
                      key={`${pick.round}-${pick.pick}`}
                      ref={isCurrentPick ? currentPickRowRef : undefined}
                      className={[
                        'flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/40 transition-colors',
                        isCurrentPick ? 'bg-amber-500/[0.08] border-l-4 border-l-amber-500' : '',
                        isUserPick && !isMade && !isCurrentPick ? 'bg-blue-500/[0.04] border-l-4 border-l-blue-600/60' : '',
                        isMade ? 'opacity-30' : '',
                      ].join(' ')}
                    >
                      {/* Status icon */}
                      <div className="w-4 shrink-0 flex justify-center">
                        {isCurrentPick
                          ? <span className="text-amber-400 font-black text-xs">▶</span>
                          : isMade
                          ? <span className="text-slate-600 text-[10px]">✓</span>
                          : <span className="text-slate-800 text-[10px]">·</span>}
                      </div>

                      {/* Pick number in round */}
                      <div className="w-7 shrink-0 text-right">
                        <span className={`text-xs font-black tabular-nums ${isCurrentPick ? 'text-amber-400' : isUserPick && !isMade ? 'text-blue-400' : 'text-slate-500'}`}>
                          {idx + 1}
                        </span>
                      </div>

                      {/* Team badge */}
                      {pickingTeam
                        ? <TeamBadge team={pickingTeam} size="xs" />
                        : <div className="w-6 h-6 rounded bg-slate-800 shrink-0" />}

                      {/* Team name + traded badge */}
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold truncate ${isCurrentPick ? 'text-white' : isUserPick && !isMade ? 'text-blue-300' : isMade ? 'text-slate-500' : 'text-slate-300'}`}>
                          {pickingTeam ? `${pickingTeam.city} ${pickingTeam.name}` : '—'}
                        </span>
                        {wasTraded && (
                          <span className="text-[9px] font-black text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded uppercase whitespace-nowrap shrink-0">
                            via {originalTeam?.abbreviation ?? originalTeam?.name ?? '?'}
                          </span>
                        )}
                        {isUserPick && !isMade && (
                          <span className="text-[9px] font-black text-blue-400/80 uppercase shrink-0">Your pick</span>
                        )}
                      </div>

                      {/* Overall pick # */}
                      <span className="text-[9px] text-slate-700 font-bold tabular-nums shrink-0">#{pick.pick}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* "On the Clock" banner */}
      {isUserTurn && (
        <div className="bg-amber-500/10 border border-amber-500 rounded-3xl p-6 flex items-center gap-4 shadow-xl shadow-amber-500/10 animate-in zoom-in-95 duration-300">
          <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-1">You Are On The Clock</p>
            <p className="text-lg font-display font-bold text-white uppercase">
              Round {currentPick?.round ?? 1}, Pick #{currentPickIndex + 1} — Select a prospect below
            </p>
          </div>
        </div>
      )}

      {/* ── Team Needs Panel ──────────────────────────────────────── */}
      {(() => {
        const showingUser = !isDrafting || isUserTurn || !currentPick;
        const displayNeeds = showingUser ? userTeamNeeds : draftingTeamNeeds;
        const displayTeamName = showingUser
          ? userTeam.name
          : (league.teams.find(t => t.id === currentPick?.currentTeamId)?.name ?? userTeam.name);
        const displayScheme = showingUser
          ? userTeam.activeScheme
          : (league.teams.find(t => t.id === currentPick?.currentTeamId)?.activeScheme ?? userTeam.activeScheme);
        const bestFit = showingUser
          ? availableProspects.find(p => prospectNeedFit(p, userTeamNeeds) === 'Strong Fit') ?? null
          : null;
        const bpa = availableProspects[0] ?? null;
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-200">
                  {showingUser ? 'Your Team Needs' : `${displayTeamName} — Team Needs`}
                </h3>
                <p className="text-[10px] text-slate-600 font-bold uppercase mt-0.5">
                  {displayTeamName} · {displayScheme} Scheme
                </p>
              </div>
              {isUserTurn && (
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase">
                  {bpa && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400">
                      <span className="text-slate-600">BPA</span>
                      {bpa.name}
                      <span className="text-amber-500">{bpa.position}</span>
                    </span>
                  )}
                  {bestFit && bestFit.id !== bpa?.id && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400">
                      <span className="text-emerald-600">Best Fit</span>
                      {bestFit.name}
                      <span className="text-emerald-600">{bestFit.position}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            {displayNeeds.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Roster is well-balanced — draft best available player</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {displayNeeds.map((need: TeamNeedItem, i: number) => (
                  <span key={need.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase ${
                    need.urgency === 'Critical'
                      ? 'bg-red-500/15 border-red-500/30 text-red-400'
                      : need.urgency === 'High'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <span className="opacity-50 text-[9px]">#{i + 1}</span>
                    {need.label}
                    <span className={`ml-0.5 text-[8px] opacity-60 ${
                      need.urgency === 'Critical' ? 'text-red-300' : need.urgency === 'High' ? 'text-amber-300' : 'text-slate-500'
                    }`}>· {need.urgency}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Prospect Board */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-display font-bold uppercase tracking-widest text-white">Big Board</h3>
              <div className="flex items-center gap-3">
                <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border ${
                  draftClassTalent === 'Strong'
                    ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                    : draftClassTalent === 'Average'
                    ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
                    : 'text-red-400 bg-red-500/15 border-red-500/30'
                }`}>
                  {draftClassTalent} Class
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">{availableProspects.length} available</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500">
                    <th className="px-6 py-4">Rank</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Pos</th>
                    <th className="px-6 py-4">School</th>
                    <th className="px-6 py-4 text-center">Grade</th>
                    <th className="px-6 py-4 text-center hidden sm:table-cell">Fit</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {availableProspects.slice(0, 60).map(p => (
                    <tr
                      key={p.id}
                      className="group hover:bg-slate-800/30 transition-all cursor-pointer"
                      onClick={() => setSelectedProspect(p)}
                    >
                      <td className="px-6 py-5">
                        <span className="font-display font-bold text-slate-500 group-hover:text-amber-500">#{p.mockRank}</span>
                      </td>
                      <td className="px-6 py-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <WatchToggle playerId={p.id} watchList={watchList} onToggle={toggleWatch} />
                          <p className="font-bold text-slate-200 uppercase tracking-tight group-hover:text-white cursor-pointer" onClick={() => setSelectedProspect(p)}>{p.name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-amber-500 font-black">{p.position}</span>
                      </td>
                      <td className="px-6 py-5 text-slate-400 italic">{p.school} {getFlag(p.country)}</td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex justify-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={`text-xs ${i < p.scoutGrade ? 'text-amber-500' : 'text-slate-800'}`}>★</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center hidden sm:table-cell">
                        {(() => {
                          const fit = prospectNeedFit(p, userTeamNeeds);
                          if (fit === 'Strong Fit') return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-black uppercase whitespace-nowrap">
                              ✓ Strong Fit
                            </span>
                          );
                          if (fit === 'Good Fit') return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded text-[9px] font-black uppercase whitespace-nowrap">
                              Good Fit
                            </span>
                          );
                          return (
                            <span className="px-2 py-0.5 bg-slate-800/50 text-slate-600 border border-slate-700/50 rounded text-[9px] font-bold uppercase">
                              Reach
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { onScout(p); setSelectedProspect(p); }}
                            className="px-3 py-2 bg-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-lg hover:bg-amber-500 hover:text-slate-950 transition-all"
                          >
                            Profile
                          </button>
                          <button
                            onClick={() => isUserTurn && makePick(league.userTeamId, p)}
                            disabled={!isUserTurn}
                            title={isUserTurn ? 'Draft this player' : 'Not your pick'}
                            className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${
                              isUserTurn
                                ? 'bg-emerald-500 text-slate-950 hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20 cursor-pointer'
                                : 'bg-slate-800/50 text-slate-600 border border-slate-700/50 cursor-not-allowed'
                            }`}
                          >
                            Draft
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Draft Feed + Your Picks */}
        <div className="space-y-6">
          {isDrafting ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl h-[600px] flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500">Live Draft Feed</h3>
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  {currentPickIndex}/{totalPicks}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
                {draftLog.map((log, i) => (
                  <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-xl animate-in slide-in-from-top-2">
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">{log}</p>
                  </div>
                ))}
              </div>
              {currentPick && (
                <div className={`mt-4 p-4 rounded-2xl border ${isUserTurn ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-950/50 border-slate-800'}`}>
                  <p className={`text-[10px] font-black uppercase mb-1 ${isUserTurn ? 'text-amber-500' : 'text-slate-500'}`}>
                    {isUserTurn ? '🏀 Your Pick!' : 'On the Clock'}
                  </p>
                  <p className="text-sm font-display font-bold text-white uppercase">
                    {league.teams.find(t => t.id === currentPick.currentTeamId)?.name}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold">
                    R{currentPick.round} · Pick #{currentPickIndex + 1}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 pb-2 border-b border-slate-800">
                Mock Draft Preview
              </h3>
              <div className="space-y-4">
                {league.prospects.slice(0, 5).map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProspect(p)}
                    className="w-full flex items-center justify-between border-b border-slate-800/50 pb-3 text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-amber-500 w-6">#{p.mockRank}</span>
                      <div>
                        <p className="text-sm font-bold text-slate-200">{p.name}</p>
                        <p className="text-[10px] text-amber-500 font-black">{p.position}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 font-black uppercase">{p.school} {getFlag(p.country)}</span>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[10px] text-slate-600 italic text-center">
                Click a prospect to view profile · Click "Start Live Draft" when ready
              </p>
            </div>
          )}

          {/* Your Draft Picks */}
          {(league.draftPicks?.filter(p => p.currentTeamId === league.userTeamId) ?? []).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 mb-4 pb-2 border-b border-slate-800">
                Your Draft Picks
              </h3>
              <div className="space-y-2">
                {league.draftPicks!.filter(p => p.currentTeamId === league.userTeamId).map(pick => {
                  const made = pick.pick <= currentPickIndex;
                  const rookie = league.teams.find(t => t.id === league.userTeamId)?.roster.find(r =>
                    r.draftInfo?.pick === pick.pick && r.draftInfo?.round === pick.round
                  );
                  const canTrade = !made && !isDrafting;
                  return (
                    <div key={`${pick.round}-${pick.pick}`}
                      className={`flex items-center justify-between p-3 rounded-xl border ${made ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-slate-800 bg-slate-950/40'}`}
                    >
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-500">
                          R{pick.round} · #{pick.round === 1 ? pick.pick : pick.pick - (pick.round - 1) * league.teams.length}
                        </p>
                        {made && rookie && (
                          <p className="text-xs font-bold text-emerald-400">{rookie.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {canTrade && (
                          <button
                            onClick={() => { setPickToTrade(pick); setShowTradeModal(true); }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-500/40 text-slate-400 hover:text-amber-400 text-[10px] font-black uppercase rounded-lg transition-all"
                          >
                            Trade
                          </button>
                        )}
                        {made ? (
                          <span className="text-[10px] font-black text-emerald-400 uppercase">✓ Used</span>
                        ) : (
                          <span className="text-[10px] font-black text-amber-500 uppercase animate-pulse">Upcoming</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {scoutingReport && !selectedProspect && (
            <div className="bg-amber-500 border border-amber-400 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-300">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-950 mb-4">Scout Analysis</h3>
              <div className="text-slate-950 text-sm italic font-medium leading-relaxed whitespace-pre-line">
                {scoutingReport.report}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Draft;
