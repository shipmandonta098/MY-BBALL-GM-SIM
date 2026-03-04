import React, { useState, useMemo, useEffect } from 'react';
import { LeagueState, Team, Prospect, DraftPick, Player } from '../types';
import { getFlag } from '../constants';
import { aiGMDraftPick } from '../utils/aiGMEngine';

interface DraftProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onScout: (player: Prospect) => void;
  scoutingReport: { playerId: string; report: string } | null;
}

const Draft: React.FC<DraftProps> = ({ league, updateLeague, onScout, scoutingReport }) => {
  const [scoutPoints, setScoutPoints] = useState(100);
  const [isLotteryRunning, setIsLotteryRunning] = useState(false);
  const [lotteryAnimationIndex, setLotteryAnimationIndex] = useState(-1);
  const currentPickIndex = league.currentDraftPickIndex || 0;
  const [draftLog, setDraftLog] = useState<string[]>([]);
  const [isDrafting, setIsDrafting] = useState(false);

  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  // 1. Lottery Logic
  const runLottery = () => {
    setIsLotteryRunning(true);
    setLotteryAnimationIndex(0);
    
    // NBA Lottery Odds for top 14 (worst to best)
    const lotteryOdds = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];
    
    // Animation loop
    const animInterval = setInterval(() => {
      setLotteryAnimationIndex(prev => (prev + 1) % 14);
    }, 100);

    setTimeout(() => {
      clearInterval(animInterval);
      setLotteryAnimationIndex(-1);
      // Sort teams by worst record (14 teams for lottery)
      const sortedTeams = [...league.teams].sort((a, b) => a.wins - b.wins || (a.confWins || 0) - (b.confWins || 0));
      const lotteryTeams = sortedTeams.slice(0, 14);
      
      let results: DraftPick[] = [];
      const usedTeams = new Set<string>();

      // Top 4 Picks (Lottery)
      for (let i = 1; i <= 4; i++) {
        const candidates = lotteryTeams.filter(t => !usedTeams.has(t.id));
        const weights = candidates.map(t => {
           const originalIdx = lotteryTeams.findIndex(lt => lt.id === t.id);
           return lotteryOdds[originalIdx];
        });
        
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        let winner = candidates[0];
        
        for (let j = 0; j < candidates.length; j++) {
          random -= weights[j];
          if (random <= 0) {
            winner = candidates[j];
            break;
          }
        }
        
        usedTeams.add(winner.id);
        results.push({ round: 1, pick: i, originalTeamId: winner.id, currentTeamId: winner.id });
      }

      // Remaining Lottery Teams in order of record
      lotteryTeams.forEach(t => {
        if (!usedTeams.has(t.id)) {
          usedTeams.add(t.id);
          results.push({ round: 1, pick: results.length + 1, originalTeamId: t.id, currentTeamId: t.id });
        }
      });

      // Rest of the First Round in record order
      sortedTeams.slice(14).forEach(t => {
        results.push({ round: 1, pick: results.length + 1, originalTeamId: t.id, currentTeamId: t.id });
      });

      // Second Round (just record order)
      sortedTeams.forEach((t, idx) => {
        results.push({ round: 2, pick: results.length + 1, originalTeamId: t.id, currentTeamId: t.id });
      });

      const userPick = results.find(p => p.currentTeamId === league.userTeamId && p.round === 1);
      const newsItem = {
        id: `lottery-${Date.now()}`,
        category: 'playoffs',
        headline: 'LOTTERY RESULTS',
        content: `The Draft Lottery is complete! The ${league.teams.find(t => t.id === results[0].currentTeamId)?.name} have secured the #1 overall pick.${userPick ? ` Your team will pick at #${userPick.pick}.` : ''}`,
        timestamp: league.currentDay,
        realTimestamp: Date.now(),
        isBreaking: true
      };

      updateLeague({ 
        draftPhase: 'draft', 
        draftPicks: results,
        currentDraftPickIndex: 0,
        newsFeed: [newsItem, ...league.newsFeed]
      });
      setIsLotteryRunning(false);
    }, 3000);
  };

  // 2. Draft Execution Logic
  const startDraftSim = () => {
    setIsDrafting(true);
    setDraftLog(["The NBA Draft is now under way!"]);
  };

  const executeNextPicks = () => {
    const picks = league.draftPicks || [];
    if (!isDrafting || currentPickIndex >= picks.length) {
      if (isDrafting && currentPickIndex >= picks.length) {
        setIsDrafting(false);
        const newsItem = {
          id: `draft-complete-${Date.now()}`,
          category: 'playoffs',
          headline: 'DRAFT COMPLETE',
          content: 'The NBA Draft has concluded. Free Agency moratorium begins now!',
          timestamp: league.currentDay,
          realTimestamp: Date.now(),
          isBreaking: true
        };
        updateLeague({ 
          draftPhase: 'completed',
          newsFeed: [newsItem, ...league.newsFeed]
        });
      }
      return;
    }

    const currentPick = picks[currentPickIndex];
    if (currentPick.currentTeamId === league.userTeamId) {
      // Pause for user input
      return;
    }

    // AI Pick — use personality-aware engine if team has an AI GM, else fall back to mock rank
    const availableProspects = league.prospects.filter(p => !league.teams.some(t => t.roster.some(player => player.id === p.id)));
    const pickTeam = league.teams.find(t => t.id === currentPick.currentTeamId);
    const bestProspect = pickTeam
      ? (aiGMDraftPick(pickTeam, availableProspects, league.settings.difficulty ?? 'Medium') ?? availableProspects[0])
      : availableProspects[0];
    
    makePick(currentPick.currentTeamId, bestProspect);
  };

  const makePick = (teamId: string, prospect: Prospect) => {
    const team = league.teams.find(t => t.id === teamId)!;
    
    // Convert prospect to player
    // Fix: Added missing ftm and fta properties to the stats object to comply with the PlayerStats interface.
    const newPlayer: Player = {
      ...prospect,
      salary: Math.floor((prospect.rating / 100) * 8000000), // Rookie scale
      contractYears: 4,
      status: 'Rotation',
      morale: 85,
      stats: {
        points: 0, rebounds: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, gamesPlayed: 0, gamesStarted: 0,
        minutes: 0, fgm: 0, fga: 0, threepm: 0, threepa: 0, ftm: 0, fta: 0, tov: 0, pf: 0,
        techs: 0, flagrants: 0, ejections: 0, plusMinus: 0
      }
    };

    const updatedTeams = league.teams.map(t => 
      t.id === teamId ? { ...t, roster: [...t.roster, newPlayer] } : t
    );

    const pickNum = currentPickIndex + 1;
    setDraftLog(prev => [`Pick #${pickNum}: The ${team.name} select ${prospect.name} (${prospect.position}) from ${prospect.school}`, ...prev]);
    
    updateLeague({ 
      teams: updatedTeams,
      currentDraftPickIndex: currentPickIndex + 1
    });
  };

  useEffect(() => {
    if (isDrafting) {
      const timer = setTimeout(() => {
        executeNextPicks();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isDrafting, currentPickIndex]);

  const availableProspects = useMemo(() => {
    const draftedIds = new Set(league.teams.flatMap(t => t.roster.map(p => p.id)));
    return league.prospects.filter(p => !draftedIds.has(p.id));
  }, [league.prospects, league.teams]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Draft HQ</h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              Current Phase: <span className="text-amber-500">{league.draftPhase.toUpperCase()}</span>
            </p>
          </div>
          <div className="flex gap-4">
             {league.draftPhase === 'scouting' && (
                <div className="bg-slate-950/50 px-6 py-3 rounded-2xl border border-slate-800 text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Scout Points</p>
                  <p className="text-2xl font-display font-bold text-amber-500">{scoutPoints}</p>
                </div>
             )}
             {league.draftPhase === 'lottery' && (
                <div className="flex items-center gap-6">
                  {isLotteryRunning && lotteryAnimationIndex >= 0 && (
                    <div className="flex gap-2">
                       {Array.from({ length: 5 }).map((_, i) => (
                         <div key={i} className="w-3 h-3 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}></div>
                       ))}
                    </div>
                  )}
                  <button 
                    onClick={runLottery}
                    disabled={isLotteryRunning}
                    className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-xl shadow-amber-500/20 active:scale-95"
                  >
                    {isLotteryRunning ? 'Drawing Ping Pong Balls...' : 'Run Lottery'}
                  </button>
                </div>
             )}
             {league.draftPhase === 'draft' && !isDrafting && (
                <button 
                  onClick={startDraftSim}
                  className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
                >
                  Start Live Draft
                </button>
             )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Prospect List / Big Board */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-display font-bold uppercase tracking-widest text-white">Prospect Board</h3>
              <div className="flex gap-2">
                 <span className="text-[10px] text-slate-500 font-bold uppercase">Showing {availableProspects.length} available</span>
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
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {availableProspects.slice(0, 50).map((p, idx) => (
                    <tr key={p.id} className="group hover:bg-slate-800/30 transition-all">
                      <td className="px-6 py-5">
                         <span className="font-display font-bold text-slate-500 group-hover:text-amber-500">#{p.mockRank}</span>
                      </td>
                      <td className="px-6 py-5">
                         <p className="font-bold text-slate-200 uppercase tracking-tight">{p.name}</p>
                         <p className="text-[10px] text-slate-600 font-bold uppercase">6'8" 210lbs</p>
                      </td>
                      <td className="px-6 py-5">
                         <span className="text-amber-500 font-black">{p.position}</span>
                      </td>
                      <td className="px-6 py-5 text-slate-400 italic">{p.school} {getFlag(p.country)}</td>
                      <td className="px-6 py-5 text-center">
                         <div className="flex justify-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span key={i} className={`text-xs ${i < p.scoutGrade ? 'text-amber-500' : 'text-slate-800'}`}>★</span>
                            ))}
                         </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        {isDrafting && (league.draftPicks?.[currentPickIndex]?.currentTeamId === league.userTeamId) ? (
                           <button 
                            onClick={() => makePick(league.userTeamId, p)}
                            className="px-4 py-2 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase rounded-lg hover:scale-105 active:scale-95 transition-all"
                           >
                             Select
                           </button>
                        ) : (
                           <button 
                            onClick={() => onScout(p)}
                            className="px-4 py-2 bg-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-lg hover:bg-amber-500 hover:text-slate-950 transition-all"
                           >
                             Full Profile
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

        {/* Right: Draft Feed / Selection Info */}
        <div className="space-y-6">
          {isDrafting ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl h-[600px] flex flex-col">
              <h3 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-4 pb-2 border-b border-slate-800">Draft Feed</h3>
              <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-slate-800">
                 {draftLog.map((log, i) => (
                    <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-xl animate-in slide-in-from-top-2">
                       <p className="text-xs text-slate-300 leading-relaxed">{log}</p>
                    </div>
                 ))}
              </div>
              {currentPickIndex < (league.draftPicks?.length || 0) && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                   <p className="text-[10px] text-amber-500 font-black uppercase mb-1">On the Clock</p>
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-800"></div>
                      <p className="text-lg font-display font-bold text-white uppercase">
                        {league.teams.find(t => t.id === league.draftPicks![currentPickIndex].currentTeamId)?.name}
                      </p>
                   </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 pb-2 border-b border-slate-800">Gemini Mock Draft v1</h3>
               <div className="space-y-4 opacity-50">
                  {league.prospects.slice(0, 5).map(p => (
                    <div key={p.id} className="flex items-center justify-between border-b border-slate-800 pb-2">
                       <div className="flex items-center gap-3">
                          <span className="font-display font-bold text-amber-500">#{p.mockRank}</span>
                          <span className="text-sm font-bold text-slate-200">{p.name}</span>
                       </div>
                       <span className="text-[10px] text-slate-600 font-black uppercase">{p.school} {getFlag(p.country)}</span>
                    </div>
                  ))}
               </div>
               <p className="mt-6 text-[10px] text-slate-600 italic text-center">Simulated rankings based on current team needs</p>
            </div>
          )}

          {scoutingReport && (
            <div className="bg-amber-500 border border-amber-400 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-300">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-950 mb-4">Gemini Scout Analysis</h3>
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