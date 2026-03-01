import React, { useState, useMemo } from 'react';
import { LeagueState, Team, Player, ContractOffer, Transaction } from '../types';
import { generateAgentReport } from '../services/geminiService';

interface FreeAgencyProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onScout: (player: Player) => void;
  recordTransaction: (state: LeagueState, type: any, teamIds: string[], description: string, playerIds?: string[], value?: number) => Transaction[];
}

const FreeAgency: React.FC<FreeAgencyProps> = ({ league, updateLeague, onScout, recordTransaction }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [negotiatingPlayer, setNegotiatingPlayer] = useState<Player | null>(null);
  const [offer, setOffer] = useState<ContractOffer>({ years: 1, salary: 0, hasPlayerOption: false, hasNoTradeClause: false });
  const [agentFeedback, setAgentFeedback] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const currentSalary = userTeam.roster.reduce((sum, p) => sum + p.salary, 0);
  const capSpace = userTeam.budget - currentSalary;

  const filteredFAs = useMemo(() => {
    return league.freeAgents.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => b.rating - a.rating);
  }, [league.freeAgents, searchTerm]);

  const handleOpenNegotiation = (player: Player) => {
    setNegotiatingPlayer(player);
    setOffer({
      years: player.desiredContract?.years || 1,
      salary: player.desiredContract?.salary || 5000000,
      hasPlayerOption: false,
      hasNoTradeClause: false
    });
    setAgentFeedback('');
  };

  const submitOffer = async () => {
    if (!negotiatingPlayer) return;
    setIsSubmitting(true);
    
    // Simulate Gemini Agent response
    const feedback = await generateAgentReport(negotiatingPlayer, userTeam, offer);
    setAgentFeedback(feedback);

    // Realistic Logic for Acceptance
    const desiredSalary = negotiatingPlayer.desiredContract?.salary || 0;
    const salaryDiff = offer.salary / (desiredSalary || 1);
    
    // Thresholds: High interest helps. 
    // Score based on salary ratio and team strength.
    let acceptChance = (salaryDiff * 60) + (negotiatingPlayer.interestScore || 50) / 2;
    if (offer.years > 3) acceptChance += 10;
    
    if (acceptChance > 85) {
      setTimeout(() => {
        const signedPlayer: Player = {
          ...negotiatingPlayer,
          isFreeAgent: false,
          salary: offer.salary,
          contractYears: offer.years,
          morale: Math.min(100, (negotiatingPlayer.morale || 80) + 10)
        };

        const updatedTeams = league.teams.map(t => 
          t.id === userTeam.id ? { ...t, roster: [...t.roster, signedPlayer] } : t
        );
        const updatedFAs = league.freeAgents.filter(p => p.id !== negotiatingPlayer.id);

        const updatedTransactions = recordTransaction(league, 'signing', [userTeam.id], `${userTeam.name} signed ${signedPlayer.name} to a ${offer.years}y/${formatMoney(offer.salary)} contract.`, [signedPlayer.id], offer.salary * offer.years);

        updateLeague({ teams: updatedTeams, freeAgents: updatedFAs, transactions: updatedTransactions });
        setNegotiatingPlayer(null);
        alert(`${negotiatingPlayer.name} has signed with the ${userTeam.name}!`);
      }, 2000);
    }
    
    setIsSubmitting(false);
  };

  const advanceDay = () => {
    if (league.draftPhase !== 'completed') {
      alert("Free Agency is currently in moratorium. Complete the NBA Draft first!");
      return;
    }
    // Logic for other teams signing players
    const updatedFAs = [...league.freeAgents];
    const newTransactions: Transaction[] = [];

    // Simulate 5 signings by other teams
    for (let i = 0; i < 5; i++) {
      if (updatedFAs.length === 0) break;
      const targetIdx = Math.floor(Math.random() * Math.min(10, updatedFAs.length));
      const p = updatedFAs.splice(targetIdx, 1)[0];
      const randomTeam = league.teams.filter(t => t.id !== userTeam.id)[Math.floor(Math.random() * (league.teams.length - 1))];
      
      const years = 1 + Math.floor(Math.random() * 3);
      const sal = p.desiredContract?.salary || 5000000;
      
      const tx: Transaction = {
        id: `tx-ai-${Date.now()}-${i}`,
        type: 'signing',
        timestamp: league.currentDay,
        realTimestamp: Date.now(),
        teamIds: [randomTeam.id],
        playerIds: [p.id],
        description: `${randomTeam.name} signed ${p.name} to a ${years}y/${formatMoney(sal)} contract.`,
        value: sal * years
      };
      newTransactions.push(tx);
    }

    updateLeague({ 
      freeAgents: updatedFAs, 
      offseasonDay: league.offseasonDay + 1,
      transactions: [...newTransactions, ...(league.transactions || [])].slice(0, 1000)
    });
  };

  const formatMoney = (val: number) => `$${(val / 1000000).toFixed(1)}M`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {league.draftPhase !== 'completed' && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2rem] p-8 text-center">
          <h3 className="text-2xl font-display font-bold text-amber-500 uppercase mb-2">Moratorium in Effect</h3>
          <p className="text-slate-400 text-sm font-medium">Free Agency will officially open once the NBA Draft has concluded. Scout the market and prepare your offers.</p>
        </div>
      )}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Free Agency Hub</h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              Moratorium Period: <span className="text-amber-500">Day {league.offseasonDay}</span>
            </p>
          </div>
          <div className="flex gap-4">
             <div className="bg-slate-950/50 px-6 py-3 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Cap Space</p>
                <p className={`text-2xl font-display font-bold ${capSpace > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {formatMoney(capSpace)}
                </p>
             </div>
             <button 
              onClick={advanceDay}
              className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-xl shadow-amber-500/20 active:scale-95"
             >
               Advance Day
             </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between gap-4">
             <div className="relative flex-1">
                <input 
                  type="text" 
                  placeholder="Search free agents..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-6 py-3 text-white focus:outline-none focus:border-amber-500/50"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
          </div>
          <div className="overflow-x-auto">
             <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    <th className="px-6 py-4">Player</th>
                    <th className="px-6 py-4">Age</th>
                    <th className="px-6 py-4 text-center">OVR/POT</th>
                    <th className="px-6 py-4">Interest</th>
                    <th className="px-6 py-4">Desired</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredFAs.map(p => (
                    <tr key={p.id} className="group hover:bg-slate-800/30 transition-all">
                      <td className="px-6 py-5" onClick={() => onScout(p)}>
                         <p className="font-bold text-slate-200 uppercase tracking-tight cursor-pointer hover:text-amber-500">{p.name}</p>
                         <p className="text-[10px] text-slate-600 font-bold uppercase">{p.position} • {league.teams.find(t => t.id === p.lastTeamId)?.name || 'FA'}</p>
                      </td>
                      <td className="px-6 py-5 text-slate-400 font-bold">{p.age}</td>
                      <td className="px-6 py-5 text-center">
                         <span className="text-amber-500 font-black text-sm">{p.rating}</span>
                         <span className="text-slate-700 mx-1">/</span>
                         <span className="text-slate-500 font-bold">{p.potential}</span>
                      </td>
                      <td className="px-6 py-5">
                         <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                               <div className="h-full bg-emerald-500" style={{ width: `${p.interestScore}%` }}></div>
                            </div>
                            <span className="text-[10px] text-slate-500 font-black uppercase">
                               {p.interestScore! > 70 ? 'High' : p.interestScore! > 40 ? 'Med' : 'Low'}
                            </span>
                         </div>
                      </td>
                      <td className="px-6 py-5 font-mono text-slate-300">
                         {p.desiredContract?.years}Y @ {formatMoney(p.desiredContract?.salary || 0)}
                      </td>
                      <td className="px-6 py-5 text-right">
                         <button 
                           onClick={() => handleOpenNegotiation(p)}
                           disabled={league.draftPhase !== 'completed'}
                           className={`px-4 py-2 ${league.draftPhase !== 'completed' ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-800 hover:bg-amber-500 text-slate-400 hover:text-slate-950'} text-[10px] font-black uppercase rounded-lg transition-all`}
                         >
                           Negotiate
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        </div>
      </div>

      {negotiatingPlayer && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
           <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-4xl p-10 shadow-2xl flex flex-col md:flex-row gap-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                 <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
              </div>

              <div className="flex-1 space-y-8 relative z-10">
                 <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.4em] text-amber-500 mb-2">Negotiating With</h3>
                    <h2 className="text-5xl font-display font-bold text-white uppercase">{negotiatingPlayer.name}</h2>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-slate-500">Contract Length</label>
                       <select 
                         value={offer.years} 
                         onChange={(e) => setOffer({...offer, years: parseInt(e.target.value)})}
                         className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none"
                       >
                          <option value={1}>1 Year</option>
                          <option value={2}>2 Years</option>
                          <option value={3}>3 Years</option>
                          <option value={4}>4 Years</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-slate-500">Annual Salary</label>
                       <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-3">
                          <span className="text-slate-500 font-bold mr-2">$</span>
                          <input 
                            type="number" 
                            value={offer.salary} 
                            onChange={(e) => setOffer({...offer, salary: parseInt(e.target.value)})}
                            className="bg-transparent text-white w-full focus:outline-none font-mono"
                          />
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                       <span className="text-xs font-bold text-slate-300">Player Option</span>
                       <input type="checkbox" checked={offer.hasPlayerOption} onChange={(e) => setOffer({...offer, hasPlayerOption: e.target.checked})} className="w-5 h-5 accent-amber-500" />
                    </div>
                    <div className="flex items-center justify-between bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                       <span className="text-xs font-bold text-slate-300">No Trade Clause</span>
                       <input type="checkbox" checked={offer.hasNoTradeClause} onChange={(e) => setOffer({...offer, hasNoTradeClause: e.target.checked})} className="w-5 h-5 accent-amber-500" />
                    </div>
                 </div>

                 <div className="pt-4 flex gap-4">
                    <button 
                      onClick={submitOffer}
                      disabled={isSubmitting}
                      className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold uppercase rounded-2xl shadow-xl transition-all active:scale-95"
                    >
                      {isSubmitting ? 'Consulting Agent...' : 'Send Offer'}
                    </button>
                    <button 
                      onClick={() => setNegotiatingPlayer(null)}
                      className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 font-display font-bold uppercase rounded-2xl transition-all"
                    >
                      Back
                    </button>
                 </div>
              </div>

              <div className="w-full md:w-80 bg-slate-950/50 rounded-[2rem] p-8 border border-slate-800 flex flex-col justify-between">
                 <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Agent Feedback</h4>
                    {agentFeedback ? (
                      <p className="text-lg italic text-slate-200 leading-relaxed">"{agentFeedback}"</p>
                    ) : (
                      <div className="space-y-4 opacity-30">
                         <div className="h-4 bg-slate-800 rounded w-full"></div>
                         <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                      </div>
                    )}
                 </div>
                 
                 <div className="mt-8 pt-8 border-t border-slate-800">
                    <p className="text-[10px] text-slate-600 font-black uppercase mb-1">Market Analysis</p>
                    <p className="text-sm text-slate-400">Team Cap Space: {formatMoney(capSpace)}</p>
                    <p className="text-sm text-slate-400">Projected Offer Rank: <span className="text-amber-500">Tier 2</span></p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default FreeAgency;