
import React, { useState, useMemo } from 'react';
import { LeagueState, Team, Player, Coach } from '../types';
import { STAFF_CONFIG, getStaffTierIndex, StaffType } from '../constants';
import { fmtSalary } from '../utils/formatters';
import { getContractRules } from '../utils/contractRules';
import { calcFranchiseValuation, fmtValuation, fmtValuationDelta } from '../utils/valuationEngine';

interface FinancesProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

const Finances: React.FC<FinancesProps> = ({ league, updateLeague }) => {
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  
  const rules = getContractRules(league);
  const isWomens = rules.isWomens;
  const payroll = userTeam.roster.reduce((sum, p) => sum + p.salary, 0);
  const staffPayroll = (Object.values(userTeam.staff) as (Coach | null)[]).reduce((sum, s) => sum + (s?.salary || 0), 0);

  // Cap thresholds from league settings (fall back to league-appropriate defaults)
  const capCeiling  = league.settings.salaryCap      || (isWomens ? 2_200_000 : 140_000_000);
  const taxLine     = league.settings.luxuryTaxLine  || (isWomens ? capCeiling : 170_000_000);
  // Women's leagues: hard cap = salary cap, no aprons, no luxury tax
  const capFloor    = Math.round(capCeiling * 0.90);
  const firstApron  = isWomens ? capCeiling : capCeiling + 56_000_000;
  const secondApron = isWomens ? capCeiling : capCeiling + 68_000_000;

  const isOverTax    = !isWomens && payroll > taxLine;
  const isOverFirst  = !isWomens && payroll > firstApron;
  const isOverSecond = !isWomens && payroll > secondApron;
  const isOverHardCap = isWomens && payroll > capCeiling;
  const taxMultiplier = league.settings.luxuryTaxMultiplier ?? 1.75;
  const luxuryTax = isOverTax ? (payroll - taxLine) * taxMultiplier : 0;

  // Annual revenue projection — 41 home games × projected attendance × ticket price
  const HOME_GAMES = 41;
  const avgAttendance = Math.round(8_000 + (userTeam.finances.fanHype / 100) * 14_000);
  const gateRevenue = HOME_GAMES * avgAttendance * (userTeam.finances.ticketPrice || 85);
  const concessionRevenue = Math.round(HOME_GAMES * avgAttendance * (userTeam.finances.concessionPrice || 12) * 0.4);
  const mediaDeal = 40_000_000;
  const sponsorRevenue = Math.round(8_000_000 + (userTeam.finances.fanHype / 100) * 15_000_000);
  const totalRevenue = gateRevenue + concessionRevenue + mediaDeal + sponsorRevenue;

  // Staff facility annual costs (separate from coach salaries)
  const staffAnnualCosts = (() => {
    const budgets = (userTeam.finances.budgets ?? {}) as Record<string, number>;
    const scoutIdx = getStaffTierIndex(budgets.scouting  ?? 20);
    const medIdx   = getStaffTierIndex(budgets.health    ?? 20);
    const facIdx   = getStaffTierIndex(budgets.facilities ?? 20);
    return (
      STAFF_CONFIG.scouting.tiers[scoutIdx].annualCost +
      STAFF_CONFIG.medical.tiers[medIdx].annualCost +
      STAFF_CONFIG.facilities.tiers[facIdx].annualCost
    );
  })();

  const operationalExpenses = 5_000_000;
  // Women's leagues have no luxury tax
  const totalExpenses = payroll + staffPayroll + staffAnnualCosts + (isWomens ? 0 : luxuryTax) + operationalExpenses;
  const projectedNet = totalRevenue - totalExpenses;

  // ── Franchise Valuation (live estimate) ────────────────────────────────────
  // Uses stored season-end snapshot when available; recomputes live otherwise.
  const champCount = (league.championshipHistory ?? []).filter(c => c.championId === userTeam.id).length;
  const prevMadePlayoffs = (league.previousSeasonStandings ?? []).find(s => s.teamId === userTeam.id)?.madePlayoffs ?? false;
  const liveValuation = useMemo(() => calcFranchiseValuation(userTeam, {
    isWNBA: isWomens,
    champCount,
    prevMadePlayoffs,
    seasonLength: league.settings.seasonLength ?? 82,
  }), [userTeam, isWomens, champCount, prevMadePlayoffs, league.settings.seasonLength]);

  // If we have an end-of-season snapshot, prefer it; otherwise show live estimate
  const displayValuation = userTeam.valuation ?? liveValuation.value;
  const displayBreakdown = userTeam.valuationBreakdown ?? liveValuation.breakdown;
  const prevValuation    = userTeam.prevSeasonValuation;
  const valuationDelta   = prevValuation != null ? displayValuation - prevValuation : null;
  const isLiveEstimate   = userTeam.valuation == null;

  const formatMoney = fmtSalary;

  // ── Grade & approval/morale impact tables ────────────────────────────────
  const TIER_GRADES = ['F', 'C', 'B', 'A−', 'A+'] as const;
  const GRADE_STYLE = [
    { text: 'text-rose-500',    bg: 'bg-rose-500/15',    border: 'border-rose-500/30'    }, // F
    { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-400/30'  }, // C
    { text: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/30'   }, // B
    { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }, // A−
    { text: 'text-emerald-300', bg: 'bg-emerald-400/15', border: 'border-emerald-400/40' }, // A+
  ] as const;
  // Absolute impact at each tier. On upgrade, delta = values[newIdx] - values[oldIdx].
  const STAFF_IMPACTS: Record<StaffType, { label: string; values: readonly [number,number,number,number,number] }> = {
    scouting:   { label: 'Owner Approval', values: [-5,  8, 15, 22, 30] },
    medical:    { label: 'Player Morale',  values: [-8, 10, 15, 20, 25] },
    facilities: { label: 'Player Morale',  values: [-6, 12, 18, 24, 30] },
  };

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [financeTab, setFinanceTab] = useState<'team' | 'league'>('team');
  type LeagueFinSort = 'revenue' | 'expenses' | 'net' | 'cash' | 'payroll' | 'valuation' | 'attendance' | 'tax';
  const [leagueSort, setLeagueSort] = useState<LeagueFinSort>('net');
  const [leagueSortDir, setLeagueSortDir] = useState<'desc' | 'asc'>('desc');

  const handleUpgrade = (type: StaffType) => {
    const cfg = STAFF_CONFIG[type];
    const budgetKey = type === 'medical' ? 'health' : type;
    const currentLevel = (userTeam.finances.budgets as any)[budgetKey] ?? 20;
    const currentIdx = getStaffTierIndex(currentLevel);
    if (currentIdx >= 4) return;
    const nextTier = cfg.tiers[currentIdx + 1];
    if (userTeam.finances.cash < nextTier.upgradeCost) return;
    const impact = STAFF_IMPACTS[type];
    const delta  = impact.values[currentIdx + 1] - impact.values[currentIdx];
    const updatedFinances = {
      ...userTeam.finances,
      cash: userTeam.finances.cash - nextTier.upgradeCost,
      budgets: { ...userTeam.finances.budgets, [budgetKey]: nextTier.level },
    };
    const leagueUpdates: Partial<typeof league> = {};
    if (type === 'scouting') {
      leagueUpdates.ownerApproval = Math.min(100, Math.max(0, (league.ownerApproval ?? 55) + delta));
    }
    const updatedTeams = league.teams.map(t => {
      if (t.id !== userTeam.id) return t;
      const base = { ...t, finances: updatedFinances };
      if (type === 'medical' || type === 'facilities') {
        return { ...base, roster: t.roster.map(p => ({ ...p, morale: Math.min(100, Math.max(0, (p.morale ?? 75) + delta)) })) };
      }
      return base;
    });
    updateLeague({ teams: updatedTeams, ...leagueUpdates });
    const sign = delta >= 0 ? '+' : '';
    setToastMsg(`${cfg.label} → ${nextTier.name}  ·  ${impact.label} ${sign}${delta}`);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handlePriceChange = (key: 'ticketPrice' | 'concessionPrice', val: number) => {
    const updatedFinances = { ...userTeam.finances, [key]: val };
    const updatedTeams = league.teams.map(t => t.id === userTeam.id ? { ...t, finances: updatedFinances } : t);
    updateLeague({ teams: updatedTeams });
  };

  // ── League-wide financial data ───────────────────────────────────────────
  const leagueFinancials = useMemo(() => {
    const seasonLength = league.settings.seasonLength ?? 82;
    const HOME_GAMES   = Math.max(20, Math.round(seasonLength * 0.5));
    const champHistory = league.championshipHistory ?? [];
    const prevStandings = league.previousSeasonStandings ?? [];

    return league.teams.map(team => {
      const teamPayroll    = team.roster.reduce((s, p) => s + p.salary, 0);
      const teamStaffPay   = (Object.values(team.staff) as (typeof team.staff.headCoach)[]).reduce((s, c) => s + (c?.salary ?? 0), 0);
      const bd             = (team.finances.budgets ?? {}) as Record<string, number>;
      const teamFacilityC  =
        STAFF_CONFIG.scouting.tiers[getStaffTierIndex(bd.scouting ?? 20)].annualCost +
        STAFF_CONFIG.medical.tiers[getStaffTierIndex(bd.health ?? 20)].annualCost +
        STAFF_CONFIG.facilities.tiers[getStaffTierIndex(bd.facilities ?? 20)].annualCost;
      const teamLux = !isWomens && teamPayroll > taxLine ? (teamPayroll - taxLine) * taxMultiplier : 0;
      const totalExpenses = teamPayroll + teamStaffPay + teamFacilityC + teamLux + 5_000_000;

      const hype           = team.finances.fanHype ?? 60;
      const avgAtt         = Math.round(8_000 + (hype / 100) * 14_000);
      const ticketPx       = team.finances.ticketPrice || (isWomens ? 40 : 85);
      const concPx         = team.finances.concessionPrice || 12;
      const gateRev        = HOME_GAMES * avgAtt * ticketPx;
      const concRev        = Math.round(HOME_GAMES * avgAtt * concPx * 0.4);
      const mediaDeal      = isWomens ? 5_000_000 : 40_000_000;
      const sponsorRev     = Math.round((isWomens ? 1_000_000 : 8_000_000) + (hype / 100) * (isWomens ? 4_000_000 : 15_000_000));
      const totalRevenue   = gateRev + concRev + mediaDeal + sponsorRev;
      const netProfit      = totalRevenue - totalExpenses;

      const capacity       = team.stadiumCapacity || (isWomens ? 8_000 : 19_000);
      const attendancePct  = Math.min(100, Math.round((avgAtt / capacity) * 100));

      const champCount     = champHistory.filter(c => c.championId === team.id).length;
      const prevPlayoffs   = prevStandings.find(s => s.teamId === team.id)?.madePlayoffs ?? false;
      const valuation      = team.valuation ?? calcFranchiseValuation(team, {
        isWNBA: isWomens, champCount, prevMadePlayoffs: prevPlayoffs, seasonLength,
      }).value;

      return { team, payroll: teamPayroll, totalRevenue, totalExpenses, netProfit,
               cashReserves: team.finances.cash, valuation, attendancePct, luxuryTax: teamLux };
    });
  }, [league, isWomens, taxLine, taxMultiplier]);

  const sortedLeagueFinancials = useMemo(() => {
    const mult = leagueSortDir === 'desc' ? -1 : 1;
    return [...leagueFinancials].sort((a, b) => {
      switch (leagueSort) {
        case 'revenue':    return (a.totalRevenue  - b.totalRevenue)  * mult;
        case 'expenses':   return (a.totalExpenses - b.totalExpenses) * mult;
        case 'net':        return (a.netProfit     - b.netProfit)     * mult;
        case 'cash':       return (a.cashReserves  - b.cashReserves)  * mult;
        case 'payroll':    return (a.payroll        - b.payroll)       * mult;
        case 'valuation':  return (a.valuation     - b.valuation)     * mult;
        case 'attendance': return (a.attendancePct - b.attendancePct) * mult;
        case 'tax':        return (a.luxuryTax     - b.luxuryTax)     * mult;
        default:           return 0;
      }
    });
  }, [leagueFinancials, leagueSort, leagueSortDir]);

  const leagueTotals = useMemo(() => ({
    totalRevenue:   leagueFinancials.reduce((s, r) => s + r.totalRevenue,  0),
    totalExpenses:  leagueFinancials.reduce((s, r) => s + r.totalExpenses, 0),
    netProfit:      leagueFinancials.reduce((s, r) => s + r.netProfit,     0),
    cashReserves:   leagueFinancials.reduce((s, r) => s + r.cashReserves,  0),
    payroll:        leagueFinancials.reduce((s, r) => s + r.payroll,        0),
    valuation:      leagueFinancials.reduce((s, r) => s + r.valuation,     0),
    avgAttendance:  Math.round(leagueFinancials.reduce((s, r) => s + r.attendancePct, 0) / (leagueFinancials.length || 1)),
    luxuryTax:      leagueFinancials.reduce((s, r) => s + r.luxuryTax,     0),
  }), [leagueFinancials]);

  const handleLeagueSort = (col: LeagueFinSort) => {
    if (leagueSort === col) setLeagueSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setLeagueSort(col); setLeagueSortDir('desc'); }
  };

  // User comparison rank helper
  const userFinRow = leagueFinancials.find(r => r.team.id === league.userTeamId);
  const userValRank  = [...leagueFinancials].sort((a, b) => b.valuation  - a.valuation ).findIndex(r => r.team.id === league.userTeamId) + 1;
  const userNetRank  = [...leagueFinancials].sort((a, b) => b.netProfit   - a.netProfit  ).findIndex(r => r.team.id === league.userTeamId) + 1;
  const userPayRank  = [...leagueFinancials].sort((a, b) => b.payroll     - a.payroll    ).findIndex(r => r.team.id === league.userTeamId) + 1;
  const n            = leagueFinancials.length;

  const TIER_COLORS = ['text-slate-500', 'text-sky-400', 'text-emerald-400', 'text-amber-400', 'text-rose-400'];
  const TIER_BORDER= ['border-slate-700', 'border-sky-500/30', 'border-emerald-500/30', 'border-amber-500/30', 'border-rose-500/30'];

  const StaffUpgradeCard = ({ type }: { type: StaffType }) => {
    const cfg        = STAFF_CONFIG[type];
    const budgetKey  = type === 'medical' ? 'health' : type;
    const currentLevel = (userTeam.finances.budgets as any)[budgetKey] ?? 20;
    const currentIdx = getStaffTierIndex(currentLevel);
    const currentTier = cfg.tiers[currentIdx];
    const nextTier   = currentIdx < 4 ? cfg.tiers[currentIdx + 1] : null;
    const canAfford  = nextTier ? userTeam.finances.cash >= nextTier.upgradeCost : false;
    const [showTooltip, setShowTooltip] = useState(false);

    const grade   = TIER_GRADES[currentIdx];
    const gs      = GRADE_STYLE[currentIdx];
    const impact  = STAFF_IMPACTS[type];
    const impactVal = impact.values[currentIdx];
    const impactSign = impactVal >= 0 ? '+' : '';
    const nextDelta  = nextTier ? impact.values[currentIdx + 1] - impactVal : null;

    return (
      <div className={`relative bg-slate-950/40 border ${TIER_BORDER[currentIdx]} rounded-2xl p-5 space-y-4 transition-all`}>

        {/* Header row: icon + label + grade badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{cfg.icon}</span>
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">{cfg.label}</h4>
          </div>
          <div className="flex items-center gap-2">
            {/* Grade badge */}
            <div className={`px-2.5 py-1 rounded-lg border text-base font-display font-black leading-none ${gs.text} ${gs.bg} ${gs.border}`}>
              {grade}
            </div>
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
            >ⓘ</button>
          </div>
        </div>

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute top-12 right-4 z-20 bg-slate-900 border border-slate-700 rounded-xl p-3 text-[10px] text-slate-300 w-64 shadow-2xl">
            {cfg.tiers.map((tier, i) => (
              <div key={i} className={`flex justify-between gap-2 mb-1.5 ${i === currentIdx ? 'font-bold text-white' : 'text-slate-500'}`}>
                <span className={`font-black ${TIER_COLORS[i]}`}>{tier.name}:</span>
                <span className="text-right">{tier.effect}</span>
              </div>
            ))}
            <div className="border-t border-slate-700 mt-2 pt-2 space-y-1">
              {cfg.tiers.map((_, i) => {
                const v = impact.values[i]; const s = v >= 0 ? '+' : '';
                return (
                  <div key={i} className={`flex justify-between text-[9px] ${i === currentIdx ? 'font-bold text-white' : 'text-slate-600'}`}>
                    <span>{TIER_GRADES[i]}</span>
                    <span className={v >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{impact.label}: {s}{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tier progress pips */}
        <div className="flex gap-1.5">
          {cfg.tiers.map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= currentIdx ? TIER_COLORS[currentIdx].replace('text-', 'bg-') : 'bg-slate-800'}`} />
          ))}
        </div>

        {/* Tier name + grade inline */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`inline-flex items-center px-3 py-1.5 rounded-lg border ${gs.bg} ${gs.border}`}>
            <span className={`text-[10px] font-black uppercase tracking-widest ${gs.text}`}>{currentTier.name}</span>
          </div>
          <span className={`text-[10px] font-black uppercase tracking-widest ${gs.text}`}>Grade: {grade}</span>
        </div>

        {/* Effect + approval/morale impact */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-500 leading-relaxed">{currentTier.effect}</p>
          <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${impactVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            <span>{impactVal >= 0 ? '▲' : '▼'}</span>
            <span>{impact.label}: {impactSign}{impactVal}</span>
          </div>
          {nextTier && nextDelta !== null && (
            <p className="text-[9px] text-slate-600 font-bold">
              Upgrade unlocks: {nextDelta >= 0 ? '+' : ''}{nextDelta} {impact.label}
            </p>
          )}
        </div>

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
              ? `Upgrade to ${nextTier.name} — ${fmtSalary(nextTier.upgradeCost)}`
              : `Need ${fmtSalary(nextTier.upgradeCost)} to upgrade`}
          </button>
        ) : (
          <div className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            ★ Max Tier Reached
          </div>
        )}

        <p className="text-[9px] text-slate-600 font-bold text-center">
          Annual cost: {fmtSalary(currentTier.annualCost)}/yr
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">

      {/* ── Upgrade toast notification ────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-2xl shadow-emerald-500/10 text-sm font-black text-emerald-400 uppercase tracking-widest whitespace-nowrap">
            <span className="text-base">✓</span>
            {toastMsg}
          </div>
        </div>
      )}

      {/* ── Sub-tab navigation ───────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setFinanceTab('team')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${financeTab === 'team' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Team Budget
        </button>
        <button
          onClick={() => setFinanceTab('league')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${financeTab === 'league' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          League Finances
        </button>
      </div>

      {financeTab === 'team' && (<>
      {/* ── Franchise Valuation ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top right, ${userTeam.primaryColor}18 0%, transparent 70%)` }} />

        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
          {/* Left: main value display */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Franchise Valuation</h3>
              {isLiveEstimate && (
                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500">
                  Est.
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-5xl font-display font-black text-white">
                {fmtValuation(displayValuation)}
              </span>
              {valuationDelta !== null && (
                <div className={`flex items-center gap-1 text-base font-black ${valuationDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span>{valuationDelta >= 0 ? '▲' : '▼'}</span>
                  <span>{fmtValuationDelta(valuationDelta)}</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest ml-1">YoY</span>
                </div>
              )}
            </div>
            {prevValuation != null && (
              <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">
                Last season: {fmtValuation(prevValuation)}
              </p>
            )}
            <p className="text-[9px] text-slate-600 mt-2 font-bold uppercase tracking-widest">
              {isLiveEstimate ? 'Updates each offseason · Live estimate shown' : 'Updated end of last offseason'}
            </p>
          </div>

          {/* Right: breakdown bars */}
          <div className="w-full md:w-80 space-y-2.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Value Breakdown</p>
            {([
              { label: 'Revenue',     pct: displayBreakdown.revenue,     color: 'bg-emerald-500' },
              { label: 'Market',      pct: displayBreakdown.market,      color: 'bg-blue-500'    },
              { label: 'Performance', pct: displayBreakdown.performance, color: 'bg-amber-500'   },
              { label: 'Star Power',  pct: displayBreakdown.starPower,   color: 'bg-violet-500'  },
              { label: 'Brand',       pct: displayBreakdown.brand,       color: 'bg-rose-400'    },
            ] as const).map(({ label, pct, color }) => (
              <div key={label}>
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
                  <span className="text-[10px] font-black text-slate-400">{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
            <p className="text-[8px] text-slate-700 font-bold mt-2 italic">
              Revenue {displayBreakdown.revenue}% · Market {displayBreakdown.market}% · Performance {displayBreakdown.performance}% · Stars {displayBreakdown.starPower}% · Brand {displayBreakdown.brand}%
            </p>
          </div>
        </div>
      </div>

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

              {/* ── Owner Approval meter ── */}
              {(() => {
                const approval = league.ownerApproval ?? 55;
                const approvalColor =
                  approval >= 75 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' :
                  approval >= 50 ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]' :
                  approval >= 30 ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]' :
                                   'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse';
                const approvalLabel =
                  approval >= 80 ? 'Thrilled' : approval >= 65 ? 'Satisfied' :
                  approval >= 50 ? 'Content'  : approval >= 35 ? 'Concerned' :
                  approval >= 20 ? 'Unhappy'  : 'Furious';
                const approvalEmoji =
                  approval >= 80 ? '🤩' : approval >= 65 ? '😊' :
                  approval >= 50 ? '🤔' : approval >= 35 ? '😟' : '😤';
                return (
                  <div className="space-y-2 pt-2 border-t border-slate-800/60">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Owner Approval</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-base">{approvalEmoji}</span>
                        <span className={`text-lg font-display font-bold ${approval >= 50 ? 'text-emerald-400' : approval >= 30 ? 'text-orange-400' : 'text-rose-500'}`}>
                          {approval}
                        </span>
                        <span className="text-[10px] font-black text-slate-500 uppercase">{approvalLabel}</span>
                      </span>
                    </div>
                    <div className="h-3 bg-slate-950 rounded-full border border-slate-800 p-0.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${approvalColor}`} style={{ width: `${approval}%` }} />
                    </div>
                    {approval < 30 && (
                      <p className="text-xs text-rose-400 font-bold animate-pulse">
                        ⚠️ Owner approval critical — major moves or a strong season required to recover.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="w-full md:w-64 bg-slate-950/50 rounded-3xl p-6 border border-slate-800/60 text-center space-y-3">
                <div>
                  <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Projected Net</p>
                  <p className={`text-4xl font-display font-bold ${projectedNet > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {projectedNet >= 0 ? '+' : ''}{formatMoney(projectedNet)}
                  </p>
                  <p className="text-[9px] text-slate-600 font-bold uppercase mt-2">Cash: {formatMoney(userTeam.finances.cash)}</p>
                </div>
                {league.previousSeasonProfit !== undefined && (
                  <div className="border-t border-slate-800 pt-3">
                    <p className="text-[9px] text-slate-600 font-black uppercase mb-1">Last Season Actual</p>
                    <p className={`text-xl font-display font-bold ${league.previousSeasonProfit >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {league.previousSeasonProfit >= 0 ? '+' : ''}{formatMoney(league.previousSeasonProfit)}
                    </p>
                  </div>
                )}
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
            {isWomens && (
              <span className="ml-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-400">
                Hard Cap · No Luxury Tax
              </span>
            )}
         </h3>

         {/* Women's hard-cap over-cap alert */}
         {isOverHardCap && (
           <div className="mb-6 flex items-center gap-3 bg-rose-500/10 border border-rose-500/40 rounded-2xl p-4">
             <span className="text-rose-400 text-lg shrink-0">🚫</span>
             <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">WNBA Hard Cap Exceeded</p>
               <p className="text-[11px] text-rose-300/80 mt-0.5">
                 Payroll is {formatMoney(payroll - capCeiling)} over the hard cap. Only minimum/veteran minimum contracts may be signed. Waive players to comply.
               </p>
             </div>
           </div>
         )}

         {/* Bar — women's scales to cap×1.15 so the hard-cap line sits at ~87%; men's to secondApron */}
         {(() => {
           const barMax = isWomens ? capCeiling * 1.15 : secondApron;
           const ticks = isWomens
             ? [
                 { val: capFloor,   label: 'Floor',    cls: 'border-emerald-500/40 text-emerald-500' },
                 { val: capCeiling, label: 'Hard Cap', cls: 'border-rose-500/70    text-rose-400'    },
               ]
             : [
                 { val: capFloor,    label: 'Floor',   cls: 'border-emerald-500/40 text-emerald-500' },
                 { val: capCeiling,  label: 'Cap',     cls: 'border-slate-500/70   text-slate-400'   },
                 { val: taxLine,     label: 'Tax',     cls: 'border-amber-500/70   text-amber-400'   },
                 { val: firstApron,  label: '1st Apr', cls: 'border-orange-500/70  text-orange-400'  },
                 { val: secondApron, label: '2nd Apr', cls: 'border-rose-500/70    text-rose-400'    },
               ];
           const barColor = isWomens
             ? isOverHardCap
               ? 'bg-gradient-to-r from-rose-600 to-rose-700 shadow-[0_0_24px_rgba(225,29,72,0.4)]'
               : payroll > capCeiling * 0.9
                 ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                 : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_20px_rgba(139,92,246,0.25)]'
             : isOverSecond ? 'bg-gradient-to-r from-rose-600 to-rose-700 shadow-[0_0_24px_rgba(225,29,72,0.4)]'
             : isOverFirst  ? 'bg-gradient-to-r from-orange-500 to-rose-500 shadow-[0_0_20px_rgba(249,115,22,0.35)]'
             : isOverTax    ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
             :                'bg-gradient-to-r from-emerald-500 to-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]';
           return (
             <div className="relative h-20 mb-16">
               <div className="absolute inset-0 bg-slate-950 border border-slate-800 rounded-2xl" />
               {ticks.map(({ val, label, cls }) => (
                 <div key={label} className={`absolute top-0 bottom-0 border-l-2 border-dashed z-10 ${cls}`} style={{ left: `${Math.min(99, (val / barMax) * 100)}%` }}>
                   <span className={`absolute -top-6 left-0 -translate-x-1/2 text-[8px] font-black uppercase tracking-widest ${cls.split(' ')[1]}`}>{label}</span>
                 </div>
               ))}
               <div
                 className={`absolute top-0 bottom-0 left-0 rounded-2xl transition-all duration-1000 ${barColor}`}
                 style={{ width: `${Math.min(100, (payroll / barMax) * 100)}%` }}
               />
               <div className="absolute top-0 bottom-0 z-20 flex flex-col items-center justify-center transition-all duration-1000" style={{ left: `${Math.min(99, (payroll / barMax) * 100)}%` }}>
                 <div className="w-1 h-full bg-white shadow-xl" />
                 <div className="absolute -bottom-8 px-3 py-1 bg-white text-slate-950 text-xs font-black rounded-lg shadow-2xl whitespace-nowrap">
                   {formatMoney(payroll)}
                 </div>
               </div>
             </div>
           );
         })()}

         {/* Cap status cards */}
         <div className={`grid gap-3 mt-20 ${isWomens ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'}`}>
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
               <p className="text-[9px] text-slate-600 font-black uppercase mb-1">Roster Payroll</p>
               <p className="text-lg font-display font-bold text-white">{formatMoney(payroll)}</p>
               <p className={`text-[10px] font-bold mt-0.5 ${payroll > capCeiling ? (isWomens ? 'text-rose-400' : 'text-amber-400') : 'text-slate-600'}`}>
                 {payroll > capCeiling ? `${formatMoney(payroll - capCeiling)} over ${isWomens ? 'hard ' : ''}cap` : `${formatMoney(capCeiling - payroll)} cap room`}
               </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800">
               <p className="text-[9px] text-slate-600 font-black uppercase mb-1">Staff Salaries</p>
               <p className="text-lg font-display font-bold text-white">{formatMoney(staffPayroll)}</p>
            </div>
            {isWomens ? (
              <div className={`p-4 rounded-xl border ${isOverHardCap ? 'bg-rose-900/30 border-rose-500/50' : 'bg-violet-500/5 border-violet-500/20'}`}>
                <p className="text-[9px] text-violet-400/80 font-black uppercase mb-1">Hard Cap</p>
                <p className={`text-lg font-display font-bold ${isOverHardCap ? 'text-rose-400' : 'text-violet-300'}`}>{formatMoney(capCeiling)}</p>
                <p className={`text-[10px] mt-0.5 font-bold ${isOverHardCap ? 'text-rose-400' : 'text-violet-400/70'}`}>
                  {isOverHardCap ? `EXCEEDED — Min deals only` : 'No luxury tax'}
                </p>
              </div>
            ) : (
              <>
                <div className={`p-4 rounded-xl border ${isOverTax ? 'bg-amber-900/20 border-amber-500/30' : 'bg-slate-950/50 border-slate-800'}`}>
                   <p className="text-[9px] text-amber-500/80 font-black uppercase mb-1">Luxury Tax Bill</p>
                   <p className={`text-lg font-display font-bold ${isOverTax ? 'text-amber-400' : 'text-slate-600'}`}>{isOverTax ? formatMoney(luxuryTax) : '—'}</p>
                   {isOverTax && <p className="text-[10px] text-amber-400/70 mt-0.5">{formatMoney(payroll - taxLine)} over tax line</p>}
                </div>
                <div className={`p-4 rounded-xl border ${isOverFirst ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-950/50 border-slate-800'}`}>
                   <p className="text-[9px] text-orange-400/80 font-black uppercase mb-1">1st Apron</p>
                   <p className={`text-lg font-display font-bold ${isOverFirst ? 'text-orange-400' : 'text-slate-600'}`}>{formatMoney(firstApron)}</p>
                   {isOverFirst && <p className="text-[10px] text-orange-400 mt-0.5">OVER — roster restrictions apply</p>}
                </div>
                <div className={`p-4 rounded-xl border ${isOverSecond ? 'bg-rose-900/30 border-rose-500/50' : 'bg-slate-950/50 border-slate-800'}`}>
                   <p className="text-[9px] text-rose-400/80 font-black uppercase mb-1">2nd Apron</p>
                   <p className={`text-lg font-display font-bold ${isOverSecond ? 'text-rose-400' : 'text-slate-600'}`}>{formatMoney(secondApron)}</p>
                   {isOverSecond && <p className="text-[10px] text-rose-400 mt-0.5">OVER — severely restricted</p>}
                </div>
              </>
            )}
         </div>
      </div>

      {/* Financial Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
        <h3 className="text-xl font-display font-bold uppercase text-white mb-8 flex items-center gap-4">
          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Annual Financial Projection
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Revenue */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-5">Revenue</p>
            <div className="space-y-3">
              {[
                { label: `Gate Revenue (${HOME_GAMES} home games · ${avgAttendance.toLocaleString()} avg attendance)`, val: gateRevenue },
                { label: 'Concession Sales', val: concessionRevenue },
                { label: 'Media & TV Deal', val: mediaDeal },
                { label: 'Sponsorships', val: sponsorRevenue },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between items-center gap-4">
                  <span className="text-[11px] text-slate-400 font-medium">{label}</span>
                  <span className="text-sm font-bold text-emerald-400 whitespace-nowrap">{formatMoney(val)}</span>
                </div>
              ))}
              <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-widest text-slate-300">Total Revenue</span>
                <span className="text-lg font-display font-black text-emerald-400">{formatMoney(totalRevenue)}</span>
              </div>
            </div>
          </div>
          {/* Expenses */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-5">Expenses</p>
            <div className="space-y-3">
              {[
                { label: 'Roster Payroll', val: payroll },
                { label: 'Coaching Staff', val: staffPayroll },
                { label: 'Facilities & Dept. Operations', val: staffAnnualCosts + operationalExpenses },
                ...(!isWomens && isOverTax ? [{ label: `Luxury Tax (×${taxMultiplier} on ${formatMoney(payroll - taxLine)} over line)`, val: luxuryTax }] : []),
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between items-center gap-4">
                  <span className="text-[11px] text-slate-400 font-medium">{label}</span>
                  <span className={`text-sm font-bold whitespace-nowrap ${label.startsWith('Luxury') ? 'text-amber-400' : 'text-rose-400'}`}>{formatMoney(val)}</span>
                </div>
              ))}
              <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-widest text-slate-300">Total Expenses</span>
                <span className="text-lg font-display font-black text-rose-400">{formatMoney(totalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Net summary bar */}
        <div className={`mt-8 p-5 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${projectedNet >= 0 ? 'bg-emerald-500/8 border-emerald-500/25' : 'bg-rose-500/8 border-rose-500/25'}`}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Projected Net Profit</p>
            <p className={`text-3xl font-display font-black ${projectedNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {projectedNet >= 0 ? '+' : ''}{formatMoney(projectedNet)}
            </p>
            <p className="text-[9px] text-slate-600 font-bold mt-1 font-mono">
              {formatMoney(totalRevenue)} Revenue − {formatMoney(totalExpenses)} Expenses
            </p>
          </div>
          <div className="flex items-center gap-6">
            {league.previousSeasonProfit !== undefined && (
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Last Season Actual</p>
                <p className={`text-xl font-display font-bold ${league.previousSeasonProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {league.previousSeasonProfit >= 0 ? '+' : ''}{formatMoney(league.previousSeasonProfit)}
                </p>
              </div>
            )}
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Cash Reserves</p>
              <p className="text-xl font-display font-bold text-white">{formatMoney(userTeam.finances.cash)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Staff & Facilities Upgrades */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
          <span>Staff &amp; Facilities</span>
          <span className="text-slate-700">— One-time upgrades, deducted from cash reserves</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                         <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${
                           p.isRookieContract
                             ? 'bg-violet-500/20 text-violet-400'
                             : p.salary > (isWomens ? rules.maxPlayerSalary * 0.9 : 30_000_000)
                               ? 'bg-amber-500/20 text-amber-500'
                               : p.salary <= rules.minPlayerSalary * 1.1
                                 ? 'bg-slate-700/60 text-slate-500'
                                 : 'bg-slate-800 text-slate-500'
                         }`}>
                            {p.isRookieContract ? 'ROOKIE SCALE' : p.salary > (isWomens ? rules.maxPlayerSalary * 0.9 : 30_000_000) ? 'MAX CONTRACT' : p.salary <= rules.minPlayerSalary * 1.1 ? 'MIN CONTRACT' : 'STANDARD'}
                         </span>
                      </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
      </>)}

      {/* ── League Finances ──────────────────────────────────────────────────── */}
      {financeTab === 'league' && (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* My-team comparison strip */}
          {userFinRow && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Valuation Rank',  val: `#${userValRank} of ${n}`, sub: formatMoney(userFinRow.valuation),  good: userValRank <= n / 3 },
                { label: 'Net Profit Rank', val: `#${userNetRank} of ${n}`, sub: `${userFinRow.netProfit >= 0 ? '+' : ''}${formatMoney(userFinRow.netProfit)}`, good: userNetRank <= n / 3 },
                { label: 'Payroll Rank',    val: `#${userPayRank} of ${n}`, sub: formatMoney(userFinRow.payroll),    good: userPayRank >= n / 2 },
              ].map(({ label, val, sub, good }) => (
                <div key={label} className={`rounded-2xl border p-4 ${good ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-900 border-slate-800'}`}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
                  <p className={`text-xl font-display font-black ${good ? 'text-emerald-400' : 'text-slate-300'}`}>{val}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* Sortable table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">All Teams — Financial Overview</h3>
              <span className="text-[10px] text-slate-600 font-bold uppercase">Click any column header to sort</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[900px]">
                <thead>
                  <tr className="text-[9px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/30">
                    <th className="px-4 py-3 min-w-[160px]">Team</th>
                    {([
                      ['revenue',    'Revenue'],
                      ['expenses',   'Expenses'],
                      ['net',        'Net P/L'],
                      ['cash',       'Cash'],
                      ['payroll',    'Payroll'],
                      ['valuation',  'Valuation'],
                      ['attendance', 'Att%'],
                      ...(!isWomens ? [['tax', 'Lux Tax']] as const : []),
                    ] as const).map(([col, label]) => (
                      <th
                        key={col}
                        className="px-4 py-3 cursor-pointer hover:text-slate-300 transition-colors whitespace-nowrap select-none"
                        onClick={() => handleLeagueSort(col as LeagueFinSort)}
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          {leagueSort === col && (
                            <span className="text-amber-400">{leagueSortDir === 'desc' ? '↓' : '↑'}</span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {sortedLeagueFinancials.map(({ team, payroll, totalRevenue, totalExpenses, netProfit, cashReserves, valuation, attendancePct, luxuryTax }) => {
                    const isUser = team.id === league.userTeamId;
                    return (
                      <tr
                        key={team.id}
                        className={`transition-all relative group ${isUser ? 'bg-slate-700/20 border-l-2' : 'hover:bg-slate-800/20'}`}
                        style={isUser ? { borderLeftColor: team.primaryColor } : undefined}
                        title={isUser ? `Your team — Ranked #${userNetRank} in net profit, #${userValRank} in valuation` : undefined}
                      >
                        {/* Team */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                              style={{ backgroundColor: team.primaryColor, color: team.secondaryColor }}
                            >
                              {team.abbreviation.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-[12px] font-bold truncate ${isUser ? 'text-white' : 'text-slate-300'}`}>{team.name}</p>
                              <p className="text-[9px] text-slate-600 font-bold uppercase">{team.marketSize}</p>
                            </div>
                            {isUser && <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest shrink-0">You</span>}
                          </div>
                        </td>
                        {/* Revenue */}
                        <td className="px-4 py-3 font-mono text-[12px] text-emerald-400">{formatMoney(totalRevenue)}</td>
                        {/* Expenses */}
                        <td className="px-4 py-3 font-mono text-[12px] text-rose-400">{formatMoney(totalExpenses)}</td>
                        {/* Net P/L */}
                        <td className="px-4 py-3">
                          <span className={`font-mono text-[12px] font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {netProfit >= 0 ? '+' : ''}{formatMoney(netProfit)}
                          </span>
                        </td>
                        {/* Cash */}
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-300">{formatMoney(cashReserves)}</td>
                        {/* Payroll */}
                        <td className="px-4 py-3 font-mono text-[12px] text-amber-400">{formatMoney(payroll)}</td>
                        {/* Valuation */}
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-200 font-bold">{fmtValuation(valuation)}</td>
                        {/* Attendance % */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${attendancePct >= 85 ? 'bg-emerald-500' : attendancePct >= 65 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${attendancePct}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-bold ${attendancePct >= 85 ? 'text-emerald-400' : attendancePct >= 65 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {attendancePct}%
                            </span>
                          </div>
                        </td>
                        {/* Luxury Tax — Men's only */}
                        {!isWomens && (
                          <td className="px-4 py-3 font-mono text-[12px]">
                            {luxuryTax > 0
                              ? <span className="text-amber-400">{formatMoney(luxuryTax)}</span>
                              : <span className="text-slate-700">—</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>

                {/* Summary / totals row */}
                <tfoot>
                  <tr className="border-t-2 border-slate-700 bg-slate-950/60 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <td className="px-4 py-3 text-slate-500">League {n > 1 ? `(${n} teams)` : ''}</td>
                    <td className="px-4 py-3 font-mono text-emerald-500">{formatMoney(leagueTotals.totalRevenue)}</td>
                    <td className="px-4 py-3 font-mono text-rose-500">{formatMoney(leagueTotals.totalExpenses)}</td>
                    <td className="px-4 py-3 font-mono">
                      <span className={leagueTotals.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {leagueTotals.netProfit >= 0 ? '+' : ''}{formatMoney(leagueTotals.netProfit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">{formatMoney(leagueTotals.cashReserves)}</td>
                    <td className="px-4 py-3 font-mono text-amber-400">{formatMoney(leagueTotals.payroll)}</td>
                    <td className="px-4 py-3 font-mono text-slate-200">{fmtValuation(leagueTotals.valuation)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-mono ${leagueTotals.avgAttendance >= 85 ? 'text-emerald-400' : leagueTotals.avgAttendance >= 65 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {leagueTotals.avgAttendance}% avg
                      </span>
                    </td>
                    {!isWomens && (
                      <td className="px-4 py-3 font-mono text-amber-400">
                        {leagueTotals.luxuryTax > 0 ? formatMoney(leagueTotals.luxuryTax) : '—'}
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Finances;
