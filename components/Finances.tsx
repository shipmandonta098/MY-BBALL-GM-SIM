
import React, { useState, useMemo } from 'react';
import { LeagueState, Team, Player, Coach } from '../types';
import { STAFF_CONFIG, getStaffTierIndex, StaffType } from '../constants';

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

  const handleUpgrade = (type: StaffType) => {
    const cfg = STAFF_CONFIG[type];
    const budgetKey = type === 'medical' ? 'health' : type;
    const currentLevel = (userTeam.finances.budgets as any)[budgetKey] ?? 20;
    const currentIdx = getStaffTierIndex(currentLevel);
    if (currentIdx >= 4) return; // already max
    const nextTier = cfg.tiers[currentIdx + 1];
    if (userTeam.finances.cash < nextTier.upgradeCost) return; // insufficient funds
    const updatedFinances = {
      ...userTeam.finances,
      cash: userTeam.finances.cash - nextTier.upgradeCost,
      budgets: {
        ...userTeam.finances.budgets,
        [budgetKey]: nextTier.level,
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

  const TIER_COLORS = ['text-slate-500', 'text-sky-400', 'text-emerald-400', 'text-amber-400', 'text-rose-400'];
  const TIER_BG    = ['bg-slate-800/50', 'bg-sky-500/10', 'bg-emerald-500/10', 'bg-amber-500/10', 'bg-rose-500/10'];
  const TIER_BORDER= ['border-slate-700', 'border-sky-500/30', 'border-emerald-500/30', 'border-amber-500/30', 'border-rose-500/30'];

  const StaffUpgradeCard = ({ type }: { type: StaffType }) => {
    const cfg = STAFF_CONFIG[type];
    const budgetKey = type === 'medical' ? 'health' : type;
    const currentLevel = (userTeam.finances.budgets as any)[budgetKey] ?? 20;
    const currentIdx = getStaffTierIndex(currentLevel);
    const currentTier = cfg.tiers[currentIdx];
    const nextTier = currentIdx < 4 ? cfg.tiers[currentIdx + 1] : null;
    const canAfford = nextTier ? userTeam.finances.cash >= nextTier.upgradeCost : false;
    const [showTooltip, setShowTooltip] = useState(false);

    return (
      <div className={`relative bg-slate-950/40 border ${TIER_BORDER[currentIdx]} rounded-2xl p-5 space-y-4 transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{cfg.icon}</span>
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">{cfg.label}</h4>
          </div>
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
          >ⓘ</button>
        </div>

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute top-12 right-4 z-20 bg-slate-900 border border-slate-700 rounded-xl p-3 text-[10px] text-slate-300 w-56 shadow-2xl">
            {cfg.tiers.map((tier, i) => (
              <div key={i} className={`flex gap-2 mb-1.5 ${i === currentIdx ? 'font-bold text-white' : 'text-slate-500'}`}>
                <span className={`font-black ${TIER_COLORS[i]}`}>{tier.name}:</span>
                <span>{tier.effect}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tier pips */}
        <div className="flex gap-1.5">
          {cfg.tiers.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-all ${i <= currentIdx ? TIER_COLORS[currentIdx].replace('text-', 'bg-') : 'bg-slate-800'}`}
            />
          ))}
        </div>

        {/* Current tier badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${TIER_BG[currentIdx]} border ${TIER_BORDER[currentIdx]}`}>
          <span className={`text-[10px] font-black uppercase tracking-widest ${TIER_COLORS[currentIdx]}`}>
            {currentTier.name}
          </span>
        </div>

        {/* Effect preview */}
        <p className="text-[10px] text-slate-500 leading-relaxed">{currentTier.effect}</p>

        {/* Upgrade button */}
        {nextTier ? (
          <button
            type="button"
            disabled={!canAfford}
            onClick={() => handleUpgrade(type)}
            className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              canAfford
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                : 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed'
            }`}
          >
            {canAfford
              ? `Upgrade to ${nextTier.name} — $${(nextTier.upgradeCost / 1_000_000).toFixed(0)}M`
              : `Need $${(nextTier.upgradeCost / 1_000_000).toFixed(0)}M to upgrade`}
          </button>
        ) : (
          <div className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-center bg-rose-500/10 border border-rose-500/20 text-rose-400">
            Max Tier Reached
          </div>
        )}

        {/* Annual cost note */}
        <p className="text-[9px] text-slate-600 font-bold text-center">
          Annual cost: ${(currentTier.annualCost / 1_000_000).toFixed(1)}M/yr
        </p>
      </div>
    );
  };

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

      {/* Staff & Facilities Upgrades */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
          <span>Staff &amp; Facilities</span>
          <span className="text-slate-700">— One-time upgrades, deducted from cash reserves</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StaffUpgradeCard type="coaching" />
          <StaffUpgradeCard type="scouting" />
          <StaffUpgradeCard type="medical" />
          <StaffUpgradeCard type="facilities" />
        </div>
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
