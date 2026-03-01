import React, { useState, useMemo, useEffect } from 'react';
import { LeagueState, Team, Player, NewsItem } from '../types';
import { generateCoach } from '../constants';

interface ExpansionProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onScout: (player: Player) => void;
}

const Expansion: React.FC<ExpansionProps> = ({ league, updateLeague, onScout }) => {
  const draftState = league.expansionDraft;

  // Safeguard state initialization
  const [protectedUserIds, setProtectedUserIds] = useState<string[]>([]);

  // Update internal state when league data arrives or changes
  useEffect(() => {
    if (draftState?.protectedPlayerIds?.[league.userTeamId]) {
      setProtectedUserIds(draftState.protectedPlayerIds[league.userTeamId]);
    }
  }, [draftState?.protectedPlayerIds, league.userTeamId]);

  const [draftingIndex, setDraftingIndex] = useState(0);
  const [isAutoDrafting, setIsAutoDrafting] = useState(false);

  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  const unprotectedPool = useMemo(() => {
    if (!draftState) return [];
    return league.teams.flatMap(t => {
      const protectedList = draftState.protectedPlayerIds[t.id] || [];
      return t.roster
        .filter(p => !protectedList.includes(p.id))
        .map(p => ({ ...p, teamId: t.id }));
    }).sort((a, b) => b.rating - a.rating);
  }, [league.teams, draftState?.protectedPlayerIds]);

  if (!draftState) {
    return (
      <div className="py-40 text-center">
        <p className="text-slate-500 font-display text-2xl uppercase tracking-widest">Expansion sequence not initialized.</p>
      </div>
    );
  }

  const handleToggleProtect = (playerId: string) => {
    if (protectedUserIds.includes(playerId)) {
      setProtectedUserIds(prev => prev.filter(id => id !== playerId));
    } else if (protectedUserIds.length < 8) {
      setProtectedUserIds(prev => [...prev, playerId]);
    }
  };

  const confirmProtection = () => {
    const updatedProtection = { ...draftState.protectedPlayerIds, [league.userTeamId]: protectedUserIds };
    updateLeague({ 
      expansionDraft: { 
        ...draftState, 
        protectedPlayerIds: updatedProtection, 
        phase: 'draft' 
      } 
    });
  };

  const executeDraftPick = () => {
    const expansionTeamId = draftState.expansionTeamIds[draftingIndex % draftState.expansionTeamIds.length];
    const expansionTeam = league.teams.find(t => t.id === expansionTeamId)!;
    
    // Pick logic: expansion teams pick the best rating available, but can't pick from a team already hit in this draft
    const alreadyStolenFrom = new Set(expansionTeam.roster.map(p => p.lastTeamId));
    
    const available = unprotectedPool.filter(p => !alreadyStolenFrom.has(p.teamId));
    if (available.length === 0) return;

    const selectedPlayer = available[0];
    
    // Update Teams
    const updatedTeams = league.teams.map(t => {
      if (t.id === selectedPlayer.teamId) {
        return { ...t, roster: t.roster.filter(p => p.id !== selectedPlayer.id) };
      }
      if (t.id === expansionTeamId) {
        return { 
          ...t, 
          roster: [...t.roster, { ...selectedPlayer, lastTeamId: selectedPlayer.teamId }] 
        };
      }
      return t;
    });

    const logEntry = `${expansionTeam.name} select ${selectedPlayer.name} from the ${league.teams.find(t => t.id === selectedPlayer.teamId)?.name}`;
    
    updateLeague({
      teams: updatedTeams,
      expansionDraft: {
        ...draftState,
        draftLog: [logEntry, ...draftState.draftLog]
      }
    });

    setDraftingIndex(prev => prev + 1);
  };

  useEffect(() => {
    if (isAutoDrafting && draftState.phase === 'draft') {
      const timer = setTimeout(() => {
        executeDraftPick();
        // 14 picks each (28 total for 2 teams)
        if (draftingIndex >= 27) {
          setIsAutoDrafting(false);
          updateLeague({ expansionDraft: { ...draftState, phase: 'completed' } });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAutoDrafting, draftingIndex, draftState.phase]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Expansion <span className="text-orange-500">Draft</span></h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              Status: <span className="text-amber-500">{draftState.phase.toUpperCase()}</span>
            </p>
          </div>
          <div className="flex gap-4">
             {draftState.phase === 'protection' && (
                <button 
                  onClick={confirmProtection}
                  disabled={protectedUserIds.length < 8 && userTeam.roster.length > 8}
                  className="px-8 py-4 bg-orange-500 hover:bg-orange-400 text-slate-950 font-display font-bold uppercase rounded-xl shadow-xl shadow-orange-500/20 active:scale-95"
                >
                  Finalize Protection ({protectedUserIds.length}/8)
                </button>
             )}
             {draftState.phase === 'draft' && (
                <button 
                  onClick={() => setIsAutoDrafting(true)}
                  className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold uppercase rounded-xl shadow-xl shadow-emerald-500/20 active:scale-95"
                >
                  {isAutoDrafting ? 'Drafting...' : 'Start Live Draft'}
                </button>
             )}
          </div>
        </div>
      </header>

      {draftState.phase === 'protection' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-xl font-display font-bold uppercase text-white mb-6">Your Protection List</h3>
              <div className="space-y-2">
                 {userTeam.roster.sort((a,b) => b.rating - a.rating).map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => handleToggleProtect(p.id)}
                      className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${protectedUserIds.includes(p.id) ? 'bg-orange-500/10 border-orange-500/40' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}
                    >
                       <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded flex items-center justify-center font-bold ${protectedUserIds.includes(p.id) ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                             {p.position}
                          </div>
                          <div>
                             <p className="font-bold text-slate-100">{p.name}</p>
                             <p className="text-[10px] text-slate-500 uppercase">Rating: {p.rating}</p>
                          </div>
                       </div>
                       <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${protectedUserIds.includes(p.id) ? 'border-orange-500 bg-orange-500' : 'border-slate-800'}`}>
                          {protectedUserIds.includes(p.id) && <svg className="w-4 h-4 text-slate-950" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                       </div>
                    </div>
                 ))}
              </div>
           </div>
           <div className="bg-slate-950 border border-slate-900 rounded-3xl p-8 opacity-50">
              <h3 className="text-xl font-display font-bold uppercase text-slate-500 mb-6">Expansion Draft Rules</h3>
              <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
                 <p>• You may protect up to 8 players on your roster.</p>
                 <p>• All players not protected will be placed into the draft pool.</p>
                 <p>• Expansion teams may select a maximum of 1 player from each existing team.</p>
                 <p>• Once a player is selected from your team, the rest of your roster is safe.</p>
                 <p>• Free Agents are not eligible for the expansion draft.</p>
              </div>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                 <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-xl font-display font-bold uppercase text-white">Unprotected Pool</h3>
                 </div>
                 <div className="overflow-x-auto h-[600px] scrollbar-thin scrollbar-thumb-slate-800">
                    <table className="w-full text-left text-xs">
                       <thead className="bg-slate-950/50 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-500">
                          <tr>
                             <th className="px-6 py-4">Player</th>
                             <th className="px-6 py-4">Team</th>
                             <th className="px-6 py-4 text-center">OVR</th>
                             <th className="px-6 py-4 text-right">Contract</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-800/40">
                          {unprotectedPool.map(p => (
                             <tr key={p.id} className="hover:bg-slate-800/30 transition-all">
                                <td className="px-6 py-4">
                                   <p className="font-bold text-slate-200 uppercase">{p.name}</p>
                                   <p className="text-[10px] text-slate-500 uppercase">{p.position} • {p.age}yrs</p>
                                </td>
                                <td className="px-6 py-4">
                                   <span className="text-[10px] font-black uppercase text-slate-400">
                                      {league.teams.find(t => t.id === p.teamId)?.name}
                                   </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                   <span className="text-amber-500 font-display font-bold text-lg">{p.rating}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                   <p className="font-mono text-slate-300">${(p.salary/1000000).toFixed(1)}M</p>
                                   <p className="text-[10px] text-slate-600 uppercase">{p.contractYears}Y Left</p>
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
           <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-[700px] flex flex-col">
                 <h3 className="text-xs font-black uppercase tracking-[0.4em] text-orange-500 mb-4 pb-2 border-b border-slate-800">Draft Log</h3>
                 <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-slate-800">
                    {draftState.draftLog.map((log, i) => (
                       <div key={i} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl animate-in slide-in-from-top-2">
                          <p className="text-sm text-slate-200 leading-relaxed font-medium">{log}</p>
                       </div>
                    ))}
                    {draftState.draftLog.length === 0 && <p className="text-center text-slate-600 italic py-20">Waiting to tip off expansion...</p>}
                 </div>
                 {draftState.phase === 'completed' && (
                    <button 
                      onClick={() => updateLeague({ expansionDraft: { ...draftState, active: false } })}
                      className="w-full mt-4 py-4 bg-white text-slate-950 font-display font-bold uppercase rounded-xl"
                    >
                      Exit War Room
                    </button>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Expansion;