import React, { useState, useMemo, useEffect } from 'react';
import { LeagueState, Team, Prospect, DraftPick, Player } from '../types';
import { getFlag } from '../constants';
import { aiGMDraftPick } from '../utils/aiGMEngine';
import DraftLottery from './DraftLottery';

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
  const [draftLog, setDraftLog] = useState<string[]>([]);
  const currentPickIndex = league.currentDraftPickIndex || 0;

  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  // ─── Draft Execution ───────────────────────────────────────────────────────
  const startDraftSim = () => {
    setIsDrafting(true);
    setDraftLog(['🏀 The NBA Draft is now underway!']);
  };

  const makePick = (teamId: string, prospect: Prospect) => {
    const team = league.teams.find(t => t.id === teamId)!;
    const newPlayer: Player = {
      ...prospect,
      salary: Math.floor((prospect.rating / 100) * 8_000_000),
      contractYears: 4,
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
    const label = round === 1 ? `Round 1, Pick #${pickNum}` : `Round 2, Pick #${pickNum - 30}`;

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
        // Draft finished
        setIsDrafting(false);
        const newsItem = {
          id: `draft-complete-${Date.now()}`,
          category: 'playoffs' as const,
          headline: '✅ DRAFT COMPLETE',
          content: 'The NBA Draft has concluded. Free Agency moratorium begins now — signings open shortly!',
          timestamp: league.currentDay,
          realTimestamp: Date.now(),
          isBreaking: true,
        };
        updateLeague({ draftPhase: 'completed', newsFeed: [newsItem, ...league.newsFeed] });
      }
      return;
    }

    const currentPick = picks[currentPickIndex];
    if (currentPick.currentTeamId === league.userTeamId) return; // Pause for user

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
    if (isDrafting) {
      const timer = setTimeout(executeAIPick, 900);
      return () => clearTimeout(timer);
    }
  }, [isDrafting, currentPickIndex]);

  const availableProspects = useMemo(() => {
    const draftedIds = new Set(league.teams.flatMap(t => t.roster.map(p => p.id)));
    return league.prospects.filter(p => !draftedIds.has(p.id));
  }, [league.prospects, league.teams]);

  const currentPick = league.draftPicks?.[currentPickIndex];
  const isUserTurn = isDrafting && currentPick?.currentTeamId === league.userTeamId;
  const totalPicks = league.draftPicks?.length ?? 0;
  const draftProgress = totalPicks > 0 ? Math.round((currentPickIndex / totalPicks) * 100) : 0;

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

        {/* Draft Log Summary */}
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
            </p>
          </div>
          <div className="flex items-center gap-4">
            {league.draftPhase === 'scouting' && (
              <div className="bg-slate-950/50 px-6 py-3 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Scout Points</p>
                <p className="text-2xl font-display font-bold text-amber-500">{scoutPoints}</p>
              </div>
            )}
            {!isDrafting && (
              <button
                onClick={startDraftSim}
                className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
              >
                Start Live Draft
              </button>
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

      {/* "On the Clock" banner */}
      {isUserTurn && (
        <div className="bg-amber-500/10 border border-amber-500 rounded-3xl p-6 flex items-center gap-4 shadow-xl shadow-amber-500/10 animate-in zoom-in-95 duration-300">
          <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-1">You Are On The Clock</p>
            <p className="text-lg font-display font-bold text-white uppercase">
              {currentPick?.round === 2 ? 'Round 2' : 'Round 1'}, Pick #{currentPickIndex + 1} — Select a prospect below
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Prospect Board */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-display font-bold uppercase tracking-widest text-white">Big Board</h3>
              <span className="text-[10px] text-slate-500 font-bold uppercase">{availableProspects.length} available</span>
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
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {availableProspects.slice(0, 60).map(p => (
                    <tr key={p.id} className={`group hover:bg-slate-800/30 transition-all ${isUserTurn ? 'cursor-pointer' : ''}`}>
                      <td className="px-6 py-5">
                        <span className="font-display font-bold text-slate-500 group-hover:text-amber-500">#{p.mockRank}</span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-200 uppercase tracking-tight">{p.name}</p>
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
                      <td className="px-6 py-5 text-right">
                        {isUserTurn ? (
                          <button
                            onClick={() => makePick(league.userTeamId, p)}
                            className="px-4 py-2 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                          >
                            Draft
                          </button>
                        ) : (
                          <button
                            onClick={() => onScout(p)}
                            className="px-4 py-2 bg-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-lg hover:bg-amber-500 hover:text-slate-950 transition-all"
                          >
                            Profile
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Draft Feed */}
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
                  <div key={p.id} className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-amber-500 w-6">#{p.mockRank}</span>
                      <div>
                        <p className="text-sm font-bold text-slate-200">{p.name}</p>
                        <p className="text-[10px] text-amber-500 font-black">{p.position}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 font-black uppercase">{p.school} {getFlag(p.country)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[10px] text-slate-600 italic text-center">
                Click "Start Live Draft" when ready
              </p>
            </div>
          )}

          {/* Your picks this draft */}
          {(league.draftPicks?.filter(p => p.currentTeamId === league.userTeamId) ?? []).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 mb-4 pb-2 border-b border-slate-800">
                Your Draft Picks
              </h3>
              <div className="space-y-2">
                {league.draftPicks!.filter(p => p.currentTeamId === league.userTeamId).map(pick => {
                  const made = pick.pick <= currentPickIndex;
                  const rookie = league.teams.find(t => t.id === league.userTeamId)?.roster.find(p =>
                    p.draftInfo?.pick === pick.pick && p.draftInfo?.round === pick.round
                  );
                  return (
                    <div key={`${pick.round}-${pick.pick}`} className={`flex items-center justify-between p-3 rounded-xl border ${made ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-slate-800 bg-slate-950/40'}`}>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-500">
                          R{pick.round} · #{pick.round === 1 ? pick.pick : pick.pick - 30}
                        </p>
                        {made && rookie && (
                          <p className="text-xs font-bold text-emerald-400">{rookie.name}</p>
                        )}
                      </div>
                      {made ? (
                        <span className="text-[10px] font-black text-emerald-400 uppercase">✓ Used</span>
                      ) : (
                        <span className="text-[10px] font-black text-amber-500 uppercase animate-pulse">Upcoming</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {scoutingReport && (
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
