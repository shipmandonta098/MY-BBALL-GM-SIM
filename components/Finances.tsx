
import React, { useState, useMemo } from 'react';
import { LeagueState, Team, Player, Coach } from '../types';

interface FinancesProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

const Finances: React.FC<FinancesProps> = ({ league, updateLeague }) => {
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  
  // Fix: Explicitly cast Object.values to (Coach | null)[] to resolve 'unknown' type access errors on line 13/14.
  const payroll = userTeam.roster.reduce((sum, p) => sum + p.salary, 0);
  const staffPayroll = (Object.values(userTeam.staff) as (Coach | null)[]).reduce((sum, s) => sum + (s?.salary || 0), 0);
  
  const capFloor = 100000000;
  const capCeiling = 140000000;
  const taxLine = 160000000;

  const luxuryTax = payroll > taxLine ? (payroll - taxLine) * 1.5 : 0;
  const totalExpenses = payroll + staffPayroll + luxuryTax + 5000000; // Operational constant

  const estimatedGateReceipts = userTeam.wins * 500000 + (userTeam.finances.ticketPrice * 20000);
  const totalRevenue = estimatedGateReceipts + 30000000; // Media rights + sponsorship

  const formatMoney = (val: number) => `$${(val / 1000000).toFixed(1)}M`;

  // Fix: Simplified key type to string to avoid computed property index issues in older TS versions.
  const handleSliderChange = (key: string, val: number) => {
    const updatedFinances = {
      ...userTeam.finances,
      budgets: {
        ...userTeam.finances.budgets,
        [key]: val
      }
    };
    const updatedTeams = league.teams.map(t => t.id === userTeam.id ? { ...t, finances: updatedFinances } : t);
    updateLeague({ teams: updatedTeams });
  };

  const handlePriceChange = (key: 'ticketPrice' | 'concessionPrice', val: number) => {
    const updatedFinances = { ...userTeam.finances, [key]: val };
    const updatedTeams = league.teams.map(t => t.id === userTeam.id ? { ...t, finances: updatedFinances } : t);
    updateLeague({ teams: updatedTeams });
  };

  // Fix: Added explicit interface for BudgetSlider props to resolve 'unknown' argument assignment error on line 184.
  const BudgetSlider = ({ label, value, icon, onChange, desc }: { label: string, value: number, icon: string, onChange: (v: number) => void, desc: string }) => (
    <div className="bg-slate-950/40 border border-slate-800 p-6 rounded-2xl space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">{label}</h4>
            <p className="text-[10px] text-slate-500 font-medium">{desc}</p>
          </div>
        </div>
        <span className={`text-xl font-display font-bold ${value > 80 ? 'text-emerald-400' : value > 40 ? 'text-amber-500' : 'text-rose-500'}`}>{value}%</span>
      </div>
      <input 
        type="range" min="1" max="100" value={value} 
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" 
      />
      <div className="flex justify-between text-[8px] text-slate-600 font-black uppercase tracking-widest">
        <span>Bare Minimum</span>
        <span>Elite Level</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* Header Info: Owner Meter & Budget Vitals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex-1 space-y-4">
              <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white">Owner <span className="text-amber-500">Confidence</span></h2>
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Job Security Meter</span>
                   <span className={`text-2xl font-display font-bold ${userTeam.finances.ownerPatience > 70 ? 'text-emerald-400' : userTeam.finances.ownerPatience > 30 ? 'text-amber-500' : 'text-rose-500'}`}>
                      {userTeam.finances.ownerPatience}%
                   </span>
                </div>
                <div className="h-4 bg-slate-950 rounded-full border border-slate-800 p-1 relative overflow-hidden">
                   <div 
                      className={`h-full rounded-full transition-all duration-1000 ${userTeam.finances.ownerPatience > 70 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : userTeam.finances.ownerPatience > 30 ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse'}`} 
                      style={{ width: `${userTeam.finances.ownerPatience}%` }}
                   ></div>
                </div>
                <div className="flex justify-between items-center pt-2">
                   <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Primary Objective:</span>
                      <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-black text-white uppercase tracking-widest">{userTeam.finances.ownerGoal}</span>
                   </div>
                   {userTeam.finances.ownerPatience < 25 && <span className="text-rose-500 text-[10px] font-black uppercase animate-bounce">⚠️ AT RISK OF TERMINATION</span>}
                </div>
              </div>
            </div>
            <div className="w-full md:w-64 bg-slate-950/50 rounded-3xl p-6 border border-slate-800/60 text-center">
                <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Projected Net</p>
                <p className={`text-4xl font-display font-bold ${totalRevenue - totalExpenses > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {formatMoney(totalRevenue - totalExpenses)}
                </p>
                <p className="text-[9px] text-slate-600 font-bold uppercase mt-2">Cash Reserves: {formatMoney(userTeam.finances.cash)}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl flex flex-col justify-between">
           <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6">Market Dynamics</h3>
           <div className="space-y-6">
              <div className="space-y-4">
                 <div className="flex justify-between text-[10px] font-bold uppercase">
                    <span className="text-slate-400">Ticket Price</span>
                    <span className="text-white">${userTeam.finances.ticketPrice}</span>
                 </div>
                 <input 
                    type="range" min="10" max="500" value={userTeam.finances.ticketPrice} 
                    onChange={(e) => handlePriceChange('ticketPrice', parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-800 appearance-none cursor-pointer accent-amber-500" 
                 />
              </div>
              <div className="space-y-4">
                 <div className="flex justify-between text-[10px] font-bold uppercase">
                    <span className="text-slate-400">Fan Attendance Hype</span>
                    <span className="text-amber-500">{userTeam.finances.fanHype}%</span>
                 </div>
                 <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-amber-500" style={{ width: `${userTeam.finances.fanHype}%` }}></div>
                 </div>
                 <p className="text-[8px] text-slate-600 font-medium">Pricing affects attendance. High wins boost hype.</p>
              </div>
           </div>
        </div>
      </div>

      {/* Salary Cap Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden relative">
         <h3 className="text-xl font-display font-bold uppercase text-white mb-10 flex items-center gap-4">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Payroll vs League Salary Cap
         </h3>

         <div className="relative h-20 mb-12">
            {/* Background Track */}
            <div className="absolute inset-0 bg-slate-950 border border-slate-800 rounded-2xl"></div>
            
            {/* Threshold Lines */}
            <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-emerald-500/40 z-10" style={{ left: `${(capFloor/200000000)*100}%` }}>
               <span className="absolute -top-6 left-0 -translate-x-1/2 text-[8px] font-black text-emerald-500 uppercase tracking-widest">Cap Floor</span>
            </div>
            <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-slate-700 z-10" style={{ left: `${(capCeiling/200000000)*100}%` }}>
               <span className="absolute -top-6 left-0 -translate-x-1/2 text-[8px] font-black text-slate-500 uppercase tracking-widest">Cap Soft-Limit</span>
            </div>
            <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-500/40 z-10" style={{ left: `${(taxLine/200000000)*100}%` }}>
               <span className="absolute -top-6 left-0 -translate-x-1/2 text-[8px] font-black text-rose-500 uppercase tracking-widest">Luxury Tax</span>
            </div>

            {/* Progress Bar */}
            <div 
               className={`absolute top-0 bottom-0 left-0 rounded-2xl transition-all duration-1000 ${payroll > taxLine ? 'bg-gradient-to-r from-amber-500 to-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.3)]' : 'bg-gradient-to-r from-emerald-500 to-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]'}`}
               style={{ width: `${Math.min(100, (payroll/200000000)*100)}%` }}
            >
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
            </div>

            {/* Current Indicator */}
            <div className="absolute top-0 bottom-0 z-20 flex flex-col items-center justify-center transition-all duration-1000" style={{ left: `${(payroll/200000000)*100}%` }}>
               <div className="w-1 h-full bg-white shadow-xl"></div>
               <div className="absolute -bottom-8 px-3 py-1 bg-white text-slate-950 text-xs font-black rounded-lg shadow-2xl whitespace-nowrap">
                  CURRENT: {formatMoney(payroll)}
               </div>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-20">
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
               <p className="text-[9px] text-slate-600 font-black uppercase mb-1">Roster Salaries</p>
               <p className="text-xl font-display font-bold text-white">{formatMoney(payroll)}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
               <p className="text-[9px] text-slate-600 font-black uppercase mb-1">Staff Salaries</p>
               <p className="text-xl font-display font-bold text-white">{formatMoney(staffPayroll)}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
               <p className="text-[9px] text-rose-500/80 font-black uppercase mb-1">Luxury Tax Penalty</p>
               <p className="text-xl font-display font-bold text-rose-500">{luxuryTax > 0 ? formatMoney(luxuryTax) : '$0.0M'}</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
               <p className="text-[9px] text-amber-500 font-black uppercase mb-1">MLE Available</p>
               <p className="text-xl font-display font-bold text-amber-500">$12.4M</p>
            </div>
         </div>
      </div>

      {/* Control Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <BudgetSlider 
          label="Coaching Staff" icon="🧠" value={userTeam.finances.budgets.coaching}
          onChange={(v: number) => handleSliderChange('coaching', v)}
          desc="Affects progression rate"
        />
        <BudgetSlider 
          label="Scouting Network" icon="🔭" value={userTeam.finances.budgets.scouting}
          onChange={(v: number) => handleSliderChange('scouting', v)}
          desc="Accuracy of draft info"
        />
        <BudgetSlider 
          label="Medical Staff" icon="🩹" value={userTeam.finances.budgets.health}
          onChange={(v: number) => handleSliderChange('health', v)}
          desc="Reduces injury duration"
        />
        <BudgetSlider 
          label="Facilities" icon="🏋️" value={userTeam.finances.budgets.facilities}
          onChange={(v: number) => handleSliderChange('facilities', v)}
          desc="Boosts team morale"
        />
      </div>

      {/* Contract Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
         <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xl font-display font-bold uppercase text-white">Contract Commitments</h3>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sorted by Impact</span>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/20">
                     <th className="px-6 py-4">Player</th>
                     <th className="px-6 py-4">Years Left</th>
                     <th className="px-6 py-4">Annual Salary</th>
                     <th className="px-6 py-4 text-right">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/40">
                  {userTeam.roster.sort((a,b) => b.salary - a.salary).map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-all">
                      <td className="px-6 py-5">
                         <div className="font-bold text-slate-200 uppercase tracking-tight">{p.name}</div>
                         <div className="text-[10px] text-slate-600 font-bold uppercase">{p.position} • Rating: {p.rating}</div>
                      </td>
                      <td className="px-6 py-5 font-display text-slate-400">{p.contractYears} Seasons</td>
                      <td className="px-6 py-5 font-mono text-amber-500 font-bold">{formatMoney(p.salary)}</td>
                      <td className="px-6 py-5 text-right">
                         <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${p.salary > 30000000 ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-500'}`}>
                            {p.salary > 30000000 ? 'MAX CONTRACT' : 'STANDARD'}
                         </span>
                      </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default Finances;
