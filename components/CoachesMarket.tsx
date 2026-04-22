import React, { useState, useMemo } from 'react';
import { LeagueState, Team, Coach, ContractOffer, CoachRole, CoachScheme } from '../types';
import { COACH_ROLES, SCHEMES } from '../constants';
import { fmtSalary } from '../utils/formatters';

interface CoachesMarketProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onScout: (coach: Coach) => void;
}

const CoachesMarket: React.FC<CoachesMarketProps> = ({ league, updateLeague, onScout }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<CoachRole | 'ALL'>('ALL');
  const [schemeFilter, setSchemeFilter] = useState<CoachScheme | 'ALL'>('ALL');
  const [minOvr, setMinOvr] = useState(50);
  
  const [negotiatingCoach, setNegotiatingCoach] = useState<Coach | null>(null);
  const [offer, setOffer] = useState<ContractOffer>({ years: 1, salary: 0, hasPlayerOption: false, hasNoTradeClause: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const currentCash = userTeam.finances.cash;

  const filteredCoaches = useMemo(() => {
    return league.coachPool.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || c.role === roleFilter;
      const matchesScheme = schemeFilter === 'ALL' || c.scheme === schemeFilter;
      const avgOvr = (c.ratingOffense + c.ratingDefense + c.ratingDevelopment) / 3;
      return matchesSearch && matchesRole && matchesScheme && avgOvr >= minOvr;
    }).sort((a, b) => {
      const aAvg = (a.ratingOffense + a.ratingDefense + a.ratingDevelopment) / 3;
      const bAvg = (b.ratingOffense + b.ratingDefense + b.ratingDevelopment) / 3;
      return bAvg - aAvg;
    });
  }, [league.coachPool, searchTerm, roleFilter, schemeFilter, minOvr]);

  const handleOpenNegotiation = (coach: Coach) => {
    setNegotiatingCoach(coach);
    setOffer({
      years: coach.desiredContract?.years || 2,
      salary: coach.desiredContract?.salary || 2000000,
      hasPlayerOption: false,
      hasNoTradeClause: false
    });
  };

  const submitOffer = () => {
    if (!negotiatingCoach) return;
    setIsSubmitting(true);
    
    // Logic for Acceptance
    const desiredSalary = negotiatingCoach.desiredContract?.salary || 2000000;
    const salaryDiff = offer.salary / (desiredSalary || 1);
    const acceptChance = (salaryDiff * 70) + (negotiatingCoach.interestScore || 50) / 2;

    setTimeout(() => {
      if (acceptChance > 80) {
        const hiredCoach: Coach = {
          ...negotiatingCoach,
          salary: offer.salary,
          contractYears: offer.years,
        };

        // Determine which slot to fill based on role
        const updatedStaff = { ...userTeam.staff };
        if (hiredCoach.role === 'Head Coach') updatedStaff.headCoach = hiredCoach;
        else if (hiredCoach.role === 'Assistant Offense') updatedStaff.assistantOffense = hiredCoach;
        else if (hiredCoach.role === 'Assistant Defense') updatedStaff.assistantDefense = hiredCoach;
        else if (hiredCoach.role === 'Assistant Dev') updatedStaff.assistantDev = hiredCoach;
        else if (hiredCoach.role === 'Trainer') updatedStaff.trainer = hiredCoach;

        const updatedTeams = league.teams.map(t => 
          t.id === userTeam.id ? { ...t, staff: updatedStaff, finances: { ...t.finances, cash: t.finances.cash - (hiredCoach.salary * 0.1) } } : t
        );
        const updatedPool = league.coachPool.filter(c => c.id !== negotiatingCoach.id);

        updateLeague({ teams: updatedTeams, coachPool: updatedPool });
        setNegotiatingCoach(null);
        alert(`${negotiatingCoach.name} has joined the ${userTeam.name} staff!`);
      } else {
        alert(`${negotiatingCoach.name} has rejected your offer. They are looking for a better deal or more stability.`);
      }
      setIsSubmitting(false);
    }, 1500);
  };

  const formatMoney = fmtSalary;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Coach <span className="text-orange-500">Marketplace</span></h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              Current Available Personnel: <span className="text-amber-500">{league.coachPool.length}</span>
            </p>
          </div>
          <div className="flex gap-4">
             <div className="bg-slate-950/50 px-6 py-3 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Franchise Cash</p>
                <p className="text-2xl font-display font-bold text-emerald-400">
                  {formatMoney(currentCash)}
                </p>
             </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input 
          type="text" 
          placeholder="Search by name..."
          className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white focus:outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select 
          className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
        >
          <option value="ALL">All Roles</option>
          {COACH_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select 
          className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold"
          value={schemeFilter}
          onChange={(e) => setSchemeFilter(e.target.value as any)}
        >
          <option value="ALL">All Schemes</option>
          {SCHEMES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 flex items-center gap-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Min OVR</span>
          <input type="range" min="40" max="99" value={minOvr} onChange={(e) => setMinOvr(parseInt(e.target.value))} className="flex-1 accent-orange-500" />
          <span className="text-lg font-display font-bold text-orange-500">{minOvr}</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <th className="px-6 py-5">Coach Name</th>
                <th className="px-6 py-5">Primary Role</th>
                <th className="px-6 py-5 text-center">OVR/Pot</th>
                <th className="px-6 py-5">Philosophy/Badges</th>
                <th className="px-6 py-5">Desired Contract</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredCoaches.map(coach => {
                const avgOvr = Math.round((coach.ratingOffense + coach.ratingDefense + coach.ratingDevelopment) / 3);
                return (
                  <tr key={coach.id} className="group hover:bg-slate-800/30 transition-all">
                    <td className="px-6 py-6" onClick={() => onScout(coach)}>
                      <p className="font-bold text-slate-200 uppercase tracking-tight text-sm cursor-pointer hover:text-orange-500 transition-colors">{coach.name}</p>
                      <p className="text-[10px] text-slate-600 font-bold uppercase">{coach.age}Yrs • {coach.experience}Yrs Exp</p>
                    </td>
                    <td className="px-6 py-6">
                      <span className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {coach.role}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <span className="text-orange-500 font-black text-lg font-display">{avgOvr}</span>
                      <span className="text-slate-700 mx-1">/</span>
                      <span className="text-slate-500 font-bold font-display">{coach.potential || avgOvr + 5}</span>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs font-bold text-amber-500">{coach.scheme}</span>
                        {coach.badges.slice(0, 1).map(b => (
                          <span key={b} className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">• {b}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-6 font-mono text-slate-300">
                      {coach.desiredContract?.years}Y @ {formatMoney(coach.desiredContract?.salary || 0)}
                    </td>
                    <td className="px-6 py-6 text-right">
                      <button 
                        onClick={() => handleOpenNegotiation(coach)}
                        className="px-5 py-2 bg-slate-800 hover:bg-orange-500 text-slate-400 hover:text-slate-950 text-[10px] font-black uppercase rounded-xl transition-all"
                      >
                        Negotiate
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredCoaches.length === 0 && (
            <div className="py-20 text-center opacity-30 italic uppercase tracking-widest text-slate-500">
              No matching personnel found in current market pool.
            </div>
          )}
        </div>
      </div>

      {negotiatingCoach && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
           <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-4xl p-10 shadow-2xl flex flex-col md:flex-row gap-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                 <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
              </div>

              <div className="flex-1 space-y-8 relative z-10">
                 <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.4em] text-orange-500 mb-2">Hiring Personnel</h3>
                    <h2 className="text-5xl font-display font-bold text-white uppercase">{negotiatingCoach.name}</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Role: {negotiatingCoach.role}</p>
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

                 <div className="pt-4 flex gap-4">
                    <button 
                      onClick={submitOffer}
                      disabled={isSubmitting}
                      className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-slate-950 font-display font-bold uppercase rounded-2xl shadow-xl transition-all active:scale-95"
                    >
                      {isSubmitting ? 'Finalizing Terms...' : 'Propose Contract'}
                    </button>
                    <button 
                      onClick={() => setNegotiatingCoach(null)}
                      className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 font-display font-bold uppercase rounded-2xl transition-all"
                    >
                      Back
                    </button>
                 </div>
              </div>

              <div className="w-full md:w-80 bg-slate-950/50 rounded-[2rem] p-8 border border-slate-800 flex flex-col justify-between">
                 <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Personnel Insights</h4>
                    <div className="space-y-4">
                       <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Interest Score:</span>
                          <span className="text-emerald-400 font-bold">{negotiatingCoach.interestScore}%</span>
                       </div>
                       <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Coach Prestige:</span>
                          <span className="text-amber-500 font-bold">Tier {negotiatingCoach.experience > 10 ? 'A' : 'B'}</span>
                       </div>
                       <p className="text-xs text-slate-500 leading-relaxed italic border-t border-slate-800 pt-4">
                          "I'm looking for a situation where I can implement my {negotiatingCoach.scheme} scheme with a competitive roster."
                       </p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CoachesMarket;