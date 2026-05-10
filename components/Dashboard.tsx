import React, { useState } from 'react';
import { LeagueState, Team, Player, GameResult } from '../types';
import TeamBadge from './TeamBadge';
import { teamSeasonAttendance } from '../utils/attendanceEngine';
import { fmtSalary } from '../utils/formatters';
import { calcTeamEffectiveOVR, getTeamInjuryNote } from '../utils/injuryEffects';

interface DashboardProps {
  league: LeagueState;
  news: string;
  onSimulate: (mode: 'next' | 'day' | 'week' | 'month' | 'season' | 'to-game' | 'x-games' | 'single-instant', targetGameId?: string, numGames?: number) => void;
  onScout: (player: Player) => void;
  scoutingReport: { playerId: string; report: string } | null;
  setActiveTab: (tab: any) => void;
  onViewRoster: (teamId: string) => void;
  onManageTeam: (teamId: string) => void;
  onAdvanceToRegularSeason?: () => void;
  onOpenOffseasonAlerts?: () => void;
}

const CircularGauge = ({ value, label, color, size = 80 }: { value: number, label: string, color: string, size?: number }) => {
  const radius = (size / 2) - 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            className="text-slate-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-display font-black text-white">{value}</span>
        </div>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ league, news, onSimulate, onScout, scoutingReport, setActiveTab, onViewRoster, onManageTeam, onAdvanceToRegularSeason, onOpenOffseasonAlerts }) => {
  const userTeam = league.teams.find(t => t.id === league.userTeamId);
  if (!userTeam) return null;
  const opponents = league.teams.filter(t => t.id !== userTeam.id);
  const nextOpponent = opponents.length > 0 ? opponents[league.currentDay % opponents.length] : null;
  const safeHistory = league.history ?? [];
  const safeSchedule = league.schedule ?? [];

  const winPct = (userTeam.wins / (userTeam.wins + userTeam.losses || 1)).toFixed(3);
  const vsW = userTeam.vsAbove500W ?? 0;
  const vsL = userTeam.vsAbove500L ?? 0;
  const vsGames = vsW + vsL;
  const vsPct = vsGames > 0 ? vsW / vsGames : null;
  const vsRecord = vsGames > 0 ? `${vsW}-${vsL}` : '—';
  const vsColor = vsPct === null ? 'text-slate-500' : vsPct >= 0.5 ? 'text-emerald-400' : vsPct >= 0.4 ? 'text-amber-400' : 'text-rose-400';
  const teamOvr = calcTeamEffectiveOVR(userTeam.roster);
  const teamOvrInjuryNote = getTeamInjuryNote(userTeam.roster);
  const teamMorale = Math.round(userTeam.roster.reduce((acc, p) => acc + p.morale, 0) / userTeam.roster.length);
  
  // Advanced Stats Calculation
  const teamHistory = safeHistory.filter(h => h.homeTeamId === userTeam.id || h.awayTeamId === userTeam.id);
  const seasonStats = teamHistory.reduce((acc, game) => {
    const isHome = game.homeTeamId === userTeam.id;
    const teamLines = isHome ? game.homePlayerStats : game.awayPlayerStats;
    const oppLines = isHome ? game.awayPlayerStats : game.homePlayerStats;
    
    acc.pts += isHome ? game.homeScore : game.awayScore;
    acc.oppPts += isHome ? game.awayScore : game.homeScore;
    acc.fgm += teamLines.reduce((s, l) => s + l.fgm, 0);
    acc.fga += teamLines.reduce((s, l) => s + l.fga, 0);
    acc.threepm += teamLines.reduce((s, l) => s + l.threepm, 0);
    acc.fta += teamLines.reduce((s, l) => s + l.fta, 0);
    acc.tov += teamLines.reduce((s, l) => s + l.tov, 0);
    acc.orb += teamLines.reduce((s, l) => s + l.reb, 0) * 0.25;
    acc.oppDrb += oppLines.reduce((s, l) => s + l.reb, 0) * 0.75;
    return acc;
  }, { pts: 0, oppPts: 0, fgm: 0, fga: 0, threepm: 0, fta: 0, tov: 0, orb: 0, oppDrb: 0 });

  const gamesPlayed = teamHistory.length || 1;
  const eFG = ((seasonStats.fgm + 0.5 * seasonStats.threepm) / (seasonStats.fga || 1) * 100).toFixed(1);
  const tovPct = (seasonStats.tov / (seasonStats.fga + 0.44 * seasonStats.fta + seasonStats.tov || 1) * 100).toFixed(1);
  const orbPct = (seasonStats.orb / (seasonStats.orb + seasonStats.oppDrb || 1) * 100).toFixed(1);
  const ftRate = (seasonStats.fta / (seasonStats.fga || 1) * 100).toFixed(1);

  // SOS Calculation
  const last10Games = safeHistory
    .filter(g => g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id)
    .sort((a, b) => b.date - a.date)
    .slice(0, 10);
  const last10AvgOvr = last10Games.length > 0
    ? Math.round(last10Games.reduce((acc, g) => {
        const oppId = g.homeTeamId === userTeam.id ? g.awayTeamId : g.homeTeamId;
        const opp = league.teams.find(t => t.id === oppId);
        if (!opp || !opp.roster.length) return acc;
        return acc + (opp.roster.reduce((s, p) => s + p.rating, 0) / opp.roster.length);
      }, 0) / last10Games.length)
    : 0;

  const next10Games = safeSchedule
    .filter(g => !g.played && (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id))
    .sort((a, b) => a.day - b.day)
    .slice(0, 10);
  const next10AvgOvr = next10Games.length > 0
    ? Math.round(next10Games.reduce((acc, g) => {
        const oppId = g.homeTeamId === userTeam.id ? g.awayTeamId : g.homeTeamId;
        const opp = league.teams.find(t => t.id === oppId);
        if (!opp || !opp.roster.length) return acc;
        return acc + (opp.roster.reduce((s, p) => s + p.rating, 0) / opp.roster.length);
      }, 0) / next10Games.length)
    : 0;

  // 4-Factors league rankings
  const teamFourFactors = league.teams.map(t => {
    const hist = safeHistory.filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id);
    const s = hist.reduce((acc, g) => {
      const isHome = g.homeTeamId === t.id;
      const lines = isHome ? g.homePlayerStats : g.awayPlayerStats;
      const oppLines = isHome ? g.awayPlayerStats : g.homePlayerStats;
      acc.fgm += lines.reduce((s, l) => s + l.fgm, 0);
      acc.fga += lines.reduce((s, l) => s + l.fga, 0);
      acc.tpm += lines.reduce((s, l) => s + l.threepm, 0);
      acc.fta += lines.reduce((s, l) => s + l.fta, 0);
      acc.tov += lines.reduce((s, l) => s + l.tov, 0);
      acc.orb += lines.reduce((s, l) => s + l.reb, 0) * 0.25;
      acc.oppDrb += oppLines.reduce((s, l) => s + l.reb, 0) * 0.75;
      return acc;
    }, { fgm: 0, fga: 0, tpm: 0, fta: 0, tov: 0, orb: 0, oppDrb: 0 });
    return {
      teamId: t.id,
      eFG: s.fga > 0 ? (s.fgm + 0.5 * s.tpm) / s.fga * 100 : 0,
      tovPct: (s.fga + 0.44 * s.fta + s.tov) > 0 ? s.tov / (s.fga + 0.44 * s.fta + s.tov) * 100 : 0,
      orbPct: (s.orb + s.oppDrb) > 0 ? s.orb / (s.orb + s.oppDrb) * 100 : 0,
      ftRate: s.fga > 0 ? s.fta / s.fga * 100 : 0,
    };
  });
  const rankOf = (key: 'eFG' | 'tovPct' | 'orbPct' | 'ftRate', higherIsBetter: boolean) => {
    const sorted = [...teamFourFactors].sort((a, b) =>
      higherIsBetter ? b[key] - a[key] : a[key] - b[key]
    );
    return sorted.findIndex(r => r.teamId === userTeam.id) + 1;
  };
  const ffRanks = {
    eFG:    rankOf('eFG',    true),
    tovPct: rankOf('tovPct', false),
    orbPct: rankOf('orbPct', true),
    ftRate: rankOf('ftRate', true),
  };
  const rankLabel = (n: number) => {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return `${n}th`;
  };
  const rankColor = (n: number, total: number) => {
    if (n <= 5) return 'text-emerald-400';
    if (n >= total - 4) return 'text-rose-400';
    return 'text-slate-400';
  };
  const numTeams = league.teams.length;

  // Finals Odds
  const netRating = (seasonStats.pts - seasonStats.oppPts) / gamesPlayed;
  const playoffOdds = Math.min(99, Math.max(1, Math.round((parseFloat(winPct) * 100 + netRating * 2 + (teamOvr - 75) * 2))));
  const confOdds = Math.round(playoffOdds * 0.4);
  const champOdds = Math.round(playoffOdds * 0.15);
  // Division odds: based on current division standings lead
  const divisionTeams = league.teams.filter(t => t.division === userTeam.division);
  const userDivRank = divisionTeams.length > 0
    ? [...divisionTeams].sort((a, b) => b.wins - a.wins || a.losses - b.losses).findIndex(t => t.id === userTeam.id) + 1
    : 1;
  const divOdds = Math.min(99, Math.max(1, Math.round(playoffOdds * (1.2 - (userDivRank - 1) * 0.25))));
  
  const formatOdds = (pct: number) => {
    if (pct > 50) return `-${Math.round(100 * (pct / (100 - pct)))}`;
    return `+${Math.round(100 * ((100 - pct) / pct))}`;
  };

  // Next scheduled game for user's team
  const nextScheduledGame = safeSchedule
    .filter(g => !g.played && (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id))
    .sort((a, b) => a.day - b.day)[0];
  const nextGameIsB2B = nextScheduledGame
    ? (nextScheduledGame.homeTeamId === userTeam.id ? nextScheduledGame.homeB2B : nextScheduledGame.awayB2B)
    : false;

  // Alerts
  const alerts: { text: string; type: string }[] = [];
  const expiringSoon = userTeam.roster.filter(p => p.contractYears === 1).length;
  if (expiringSoon > 0) alerts.push({ text: `${expiringSoon} contracts expiring soon`, type: 'warning' });

  if (nextGameIsB2B && league.settings?.b2bFatigueEnabled !== false) {
    alerts.push({ text: 'Back-to-Back Tonight — Fatigue Expected · Shooting efficiency & defense will drop', type: 'b2b' });
  }

  const totalSalary = userTeam.roster.reduce((s, p) => s + p.salary, 0);
  if (league.settings?.salaryCap && totalSalary > league.settings.salaryCap) alerts.push({ text: "Over salary cap!", type: 'danger' });
  
  const lowMorale = userTeam.roster.filter(p => p.morale < 50).length;
  const moderateMorale = userTeam.roster.filter(p => p.morale >= 50 && p.morale < 65).length;

  if (teamMorale < 50) {
    // Build context string
    const reasons: string[] = [];
    if (userTeam.streak <= -3) reasons.push('losing streak');
    const unhappyPlayers = userTeam.roster.filter(p => p.morale < 50 &&
      (p.personalityTraits?.includes('Diva/Star') || p.personalityTraits?.includes('Hot Head') || p.personalityTraits?.includes('Money Hungry')));
    if (unhappyPlayers.length > 0) reasons.push('player unhappiness');
    const coachRating = userTeam.staff?.headCoach?.overall ?? 100;
    if (coachRating < 55) reasons.push('coaching concerns');
    const contextStr = reasons.length > 0 ? ` · ${reasons.join(' / ')}` : '';
    alerts.push({ text: `Critical Morale Alert — ${lowMorale} player${lowMorale !== 1 ? 's' : ''} in red zone${contextStr}`, type: 'critical' });
  } else if (teamMorale < 65) {
    const reasons: string[] = [];
    if (userTeam.streak <= -2) reasons.push('losing streak');
    const unhappyCount = userTeam.roster.filter(p => p.morale < 65).length;
    if (unhappyCount > 3) reasons.push('player unhappiness');
    const coachRating = userTeam.staff?.headCoach?.overall ?? 100;
    if (coachRating < 60) reasons.push('coaching concerns');
    const contextStr = reasons.length > 0 ? ` · ${reasons.join(' / ')}` : '';
    alerts.push({ text: `Low Morale Warning — team avg ${teamMorale}%${contextStr}`, type: 'danger' });
  } else if (teamMorale < 80 && (moderateMorale > 2 || userTeam.streak <= -3)) {
    alerts.push({ text: `Morale Dropping — team avg ${teamMorale}% · watch for further decline`, type: 'warning' });
  }
  
  const injuredPlayers = userTeam.roster.filter(p => p.status === 'Injured');
  injuredPlayers.forEach(p => {
    const days = p.injuryDaysLeft ?? 0;
    const label = p.injuryType ?? 'Injury';
    alerts.push({ text: `${p.name} — ${label}${days > 0 ? ` · ${days}d` : ''}`, type: 'danger' });
  });

  const formatMoney = fmtSalary;

  // Compute top players by OVR
  const topPlayers = [...userTeam.roster]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);

  // Compute team offense/defense/potential averages (0-100)
  const avgOff = Math.round(userTeam.roster.reduce((s, p) => s + p.attributes.shooting, 0) / (userTeam.roster.length || 1));
  const avgDef = Math.round(userTeam.roster.reduce((s, p) => s + p.attributes.defense, 0) / (userTeam.roster.length || 1));
  const avgPot = Math.round(userTeam.roster.reduce((s, p) => s + (typeof p.potential === 'number' ? p.potential : 75), 0) / (userTeam.roster.length || 1));

  // Recent results (last 5)
  const recentResults = [...safeHistory]
    .filter(g => g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id)
    .sort((a, b) => b.date - a.date)
    .slice(0, 5);

  // Upcoming schedule events
  const upcomingGames = safeSchedule
    .filter(g => !g.played && (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id))
    .sort((a, b) => a.day - b.day)
    .slice(0, 4);

  // Salary info
  const totalSalaryUsed = userTeam.roster.reduce((s, p) => s + p.salary, 0);
  const salaryCap = league.settings?.salaryCap ?? userTeam.budget ?? 136_000_000;
  const capSpace = salaryCap - totalSalaryUsed;
  const luxuryTax = league.settings?.luxuryTax ?? salaryCap * 1.21;
  const isOverLux = totalSalaryUsed > luxuryTax;

  // Conference standing
  const confTeams = [...league.teams]
    .filter(t => t.conference === userTeam.conference)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const confRank = confTeams.findIndex(t => t.id === userTeam.id) + 1;

  // Preseason state
  const preSched = league.preseasonSchedule ?? [];
  const preRecord = league.preseasonRecord ?? { wins: 0, losses: 0 };
  const totalPre = preSched.length;
  const playedPre = preSched.filter(g => g.played).length;
  const unplayedPre = preSched.filter(g => !g.played && (g.homeTeamId === league.userTeamId || g.awayTeamId === league.userTeamId));
  const nextPreGame = unplayedPre[0] ?? null;
  const nextPreOpp = nextPreGame
    ? league.teams.find(t => t.id === (nextPreGame.homeTeamId === league.userTeamId ? nextPreGame.awayTeamId : nextPreGame.homeTeamId))
    : null;

  const cardBase = 'rounded-xl border border-white/5 p-5';
  const cardBg = { backgroundColor: '#0c1220' };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* ── Team Header Strip ── */}
      <div
        className="rounded-xl border border-white/5 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 relative overflow-hidden"
        style={{ backgroundColor: '#0c1220' }}
      >
        {/* Faint team color background glow */}
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at left, ${userTeam.primaryColor}, transparent 60%)` }}
        />

        <div className="flex items-center gap-4 relative z-10">
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
            style={{ backgroundColor: `${userTeam.primaryColor}22`, border: `2px solid ${userTeam.primaryColor}55` }}
            onClick={() => onManageTeam(userTeam.id)}
          >
            <TeamBadge team={userTeam} size="lg" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl uppercase tracking-wider text-white leading-none">
              {userTeam.city} {userTeam.name}
            </h1>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mt-0.5" style={{ color: userTeam.primaryColor }}>
              {userTeam.conference} · #{confRank} Seed
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 relative z-10 sm:ml-auto">
          {[
            { label: 'Salary Cap', val: formatMoney(salaryCap), color: 'text-slate-300' },
            { label: 'Cap Space', val: formatMoney(capSpace), color: capSpace > 0 ? 'text-emerald-400' : 'text-rose-400' },
            { label: 'Luxury Tax', val: isOverLux ? `+${formatMoney(totalSalaryUsed - luxuryTax)}` : 'Under', color: isOverLux ? 'text-rose-400' : 'text-emerald-400' },
            { label: 'Record', val: `${userTeam.wins}–${userTeam.losses}`, color: 'text-white' },
            { label: 'Streak', val: userTeam.streak >= 0 ? `W${userTeam.streak}` : `L${Math.abs(userTeam.streak)}`, color: userTeam.streak > 0 ? 'text-emerald-400' : userTeam.streak < 0 ? 'text-rose-400' : 'text-slate-400' },
          ].map(({ label, val, color }) => (
            <div key={label} className="text-center sm:text-left">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-0.5">{label}</p>
              <p className={`text-sm font-bold font-mono ${color}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Alerts Bar ── */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((alert, i) => {
            const isB2B = alert.type === 'b2b';
            const bg = alert.type === 'critical' ? 'rgba(185,28,28,0.15)' : alert.type === 'danger' ? 'rgba(244,63,94,0.10)' : isB2B ? 'rgba(249,115,22,0.12)' : 'rgba(245,158,11,0.10)';
            const border = alert.type === 'critical' ? 'rgba(220,38,38,0.40)' : alert.type === 'danger' ? 'rgba(244,63,94,0.20)' : isB2B ? 'rgba(249,115,22,0.35)' : 'rgba(245,158,11,0.20)';
            const color = alert.type === 'critical' ? '#ef4444' : alert.type === 'danger' ? '#f43f5e' : isB2B ? '#fb923c' : '#f59e0b';
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-black uppercase tracking-widest" style={{ backgroundColor: bg, borderColor: border, color }}>
                {isB2B ? <span>🔥</span> : <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                {alert.text}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Offseason / Preseason Banners ── */}
      {league.isOffseason && onOpenOffseasonAlerts && (league.offseasonAlerts ?? []).some(a => !a.dismissed) && (
        <button onClick={onOpenOffseasonAlerts} className="w-full flex items-center gap-3 bg-amber-500/10 hover:bg-amber-500/18 border border-amber-500/30 rounded-xl px-4 py-3 transition-all text-left group">
          <span className="text-xl">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Offseason Alerts</p>
            <p className="text-sm font-bold text-white truncate">
              {(league.offseasonAlerts ?? []).filter(a => !a.dismissed).length} pending alert{(league.offseasonAlerts ?? []).filter(a => !a.dismissed).length > 1 ? 's' : ''} — tap to review
            </p>
          </div>
          <span className="text-amber-500 group-hover:translate-x-1 transition-transform">›</span>
        </button>
      )}

      {/* ── Main 3-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* COL 1: Sim Controls + Tasks */}
        <div className="space-y-4">

          {/* Offseason Ready → Start Preseason */}
          {league.isOffseason && league.draftPhase === 'completed' && onAdvanceToRegularSeason && (
            <div className={`${cardBase} border-amber-500/30`} style={{ ...cardBg, background: 'linear-gradient(135deg, rgba(180,83,9,0.2), #0c1220)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">Offseason Complete</p>
              <p className="font-display font-bold text-white text-lg uppercase mb-3">Ready to Tip Off</p>
              <button onClick={onAdvanceToRegularSeason} className="w-full py-2.5 text-slate-950 font-display font-bold uppercase text-sm rounded-lg transition-all active:scale-95 flex items-center justify-center gap-2" style={{ backgroundColor: userTeam.primaryColor }}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                Start Preseason
              </button>
            </div>
          )}

          {/* Active Preseason Banner */}
          {league.seasonPhase === 'Preseason' && !league.isOffseason && totalPre > 0 && (
            <div className={`${cardBase} border-amber-500/25`} style={{ ...cardBg }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Preseason</p>
                <p className="font-mono text-sm font-bold text-white">{preRecord.wins}–{preRecord.losses}</p>
              </div>
              <div className="h-1 bg-slate-800 rounded-full mb-3 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${totalPre > 0 ? (playedPre / totalPre) * 100 : 0}%`, backgroundColor: userTeam.primaryColor }} />
              </div>
              {nextPreGame && nextPreOpp && (
                <p className="text-xs text-slate-400 mb-3">Next: vs <span className="text-white font-bold">{nextPreOpp.name}</span></p>
              )}
              <div className="flex gap-2">
                <button onClick={() => onSimulate('next')} className="flex-1 py-2 text-slate-950 font-display font-bold uppercase text-xs rounded-lg transition-all" style={{ backgroundColor: userTeam.primaryColor }}>
                  Sim Next
                </button>
                {onAdvanceToRegularSeason && playedPre < totalPre && (
                  <button onClick={onAdvanceToRegularSeason} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs rounded-lg transition-all border border-white/10">
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Simulation Hub */}
          <div className={cardBase} style={cardBg}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Simulate</p>
            <div className="space-y-2">
              {[
                { label: 'Next Game', mode: 'next' as const, icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
                { label: 'Next Week', mode: 'week' as const, icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { label: 'Next Month', mode: 'month' as const, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'End of Season', mode: 'season' as const, icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              ].map(({ label, mode, icon }) => (
                <button
                  key={mode}
                  onClick={() => onSimulate(mode)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-slate-300 hover:text-white group"
                >
                  <svg className="w-4 h-4 shrink-0 transition-colors" style={{ color: userTeam.primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Front Office shortcuts */}
          <div className={cardBase} style={cardBg}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Front Office</p>
            <div className="space-y-1">
              {[
                { label: 'Manage Roster', tab: 'roster' },
                { label: 'Trade Machine', tab: 'trade' },
                { label: 'Draft Hub', tab: 'draft' },
                { label: 'Free Agency', tab: 'free_agency' },
                { label: 'Finances', tab: 'finances' },
              ].map(({ label, tab }) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-all text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wide group">
                  <span>{label}</span>
                  <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* COL 2: Team Overview */}
        <div className="space-y-4">
          <div className={cardBase} style={cardBg}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Team Overview</p>

            {/* OVR gauge + stat bars */}
            <div className="flex items-center gap-6 mb-5">
              {/* Circular OVR */}
              <div className="shrink-0">
                <CircularGauge value={teamOvr} label="OVR" color={userTeam.primaryColor} size={90} />
              </div>
              {/* OFF / DEF / POT bars */}
              <div className="flex-1 space-y-3">
                {[
                  { label: 'OFF', value: avgOff, color: '#10b981' },
                  { label: 'DEF', value: avgDef, color: '#3b82f6' },
                  { label: 'POT', value: avgPot, color: userTeam.primaryColor },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                      <span className="text-slate-500">{label}</span>
                      <span style={{ color }}>{value}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {teamOvrInjuryNote && (
              <p className="text-[10px] text-rose-400 font-bold mb-4 px-2 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg">{teamOvrInjuryNote}</p>
            )}

            {/* Morale + vs .500 */}
            <div className="border-t border-white/5 pt-4 space-y-3">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                  <span className="text-slate-500">Team Morale</span>
                  <span style={{ color: teamMorale < 50 ? '#ef4444' : teamMorale < 65 ? '#f43f5e' : teamMorale < 80 ? '#f59e0b' : '#22c55e' }}>{teamMorale}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${teamMorale}%`, backgroundColor: teamMorale < 50 ? '#ef4444' : teamMorale < 65 ? '#f43f5e' : teamMorale < 80 ? '#f59e0b' : '#22c55e' }} />
                </div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase text-[10px]">vs .500+ Teams</span>
                <span className={`font-mono font-bold text-[11px] ${vsColor}`}>{vsRecord}{vsPct !== null ? ` (${vsPct.toFixed(3)})` : ''}</span>
              </div>
            </div>
          </div>

          {/* 4-Factors */}
          <div className={cardBase} style={cardBg}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Efficiency (4-Factors)</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'eFG', label: 'eFG%', val: eFG, rank: ffRanks.eFG },
                { key: 'tovPct', label: 'TOV%', val: tovPct, rank: ffRanks.tovPct },
                { key: 'orbPct', label: 'ORB%', val: orbPct, rank: ffRanks.orbPct },
                { key: 'ftRate', label: 'FT Rate', val: ftRate, rank: ffRanks.ftRate },
              ] as const).map(({ key, label, val, rank }) => (
                <div key={key} className="bg-white/5 p-3 rounded-lg">
                  <p className="text-[9px] text-slate-500 font-black uppercase mb-1">{label}</p>
                  <p className={`text-lg font-display font-black ${rankColor(rank, numTeams)}`}>{val}%</p>
                  {numTeams > 0 && rank > 0 && (
                    <p className={`text-[9px] font-black mt-0.5 ${rankColor(rank, numTeams)}`}>{rankLabel(rank)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Finals Odds */}
          <div className={cardBase} style={cardBg}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Finals Odds</p>
            <div className="space-y-2">
              {[
                { label: 'Championship', odds: champOdds },
                { label: 'Conference', odds: confOdds },
                { label: 'Playoffs', odds: playoffOdds },
              ].map(({ label, odds }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-[11px] text-slate-400 font-bold uppercase">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-emerald-400 font-bold">{formatOdds(odds)}</span>
                    <span className="text-[10px] text-slate-600 font-bold">({odds}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COL 3: Upcoming + Recent + News */}
        <div className="space-y-4">

          {/* Scouting Report if active */}
          {scoutingReport && (
            <div className="rounded-xl border p-4 animate-in zoom-in-95 duration-300" style={{ backgroundColor: `${userTeam.primaryColor}18`, borderColor: `${userTeam.primaryColor}40` }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: userTeam.primaryColor }}>Scout Report</p>
              <p className="text-xs text-slate-200 italic leading-relaxed">{scoutingReport.report}</p>
            </div>
          )}

          {/* Upcoming Games */}
          <div className={cardBase} style={cardBg}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upcoming</p>
              <button onClick={() => setActiveTab('schedule')} className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-300 transition-colors">Full Schedule →</button>
            </div>
            {upcomingGames.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No upcoming games</p>
            ) : (
              <div className="space-y-2">
                {upcomingGames.map((game, i) => {
                  const isHome = game.homeTeamId === userTeam.id;
                  const opp = league.teams.find(t => t.id === (isHome ? game.awayTeamId : game.homeTeamId));
                  if (!opp) return null;
                  return (
                    <div key={game.id} className={`flex items-center gap-3 px-2 py-1.5 rounded-lg ${i === 0 ? 'bg-white/8' : 'hover:bg-white/5'} transition-all`}>
                      <div className="w-6 h-6 rounded flex items-center justify-center text-xs" style={{ backgroundColor: `${opp.primaryColor}22` }}>
                        <TeamBadge team={opp} size="xs" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{isHome ? 'vs' : '@'} {opp.name}</p>
                        <p className="text-[9px] text-slate-600 font-bold uppercase">Day {game.day}</p>
                      </div>
                      {i === 0 && (
                        <button onClick={() => onSimulate('next')} className="text-[9px] font-black uppercase px-2 py-1 rounded transition-all shrink-0" style={{ backgroundColor: `${userTeam.primaryColor}22`, color: userTeam.primaryColor }}>
                          Sim
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Results */}
          <div className={cardBase} style={cardBg}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Results</p>
              <button onClick={() => setActiveTab('results')} className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-300 transition-colors">All →</button>
            </div>
            {recentResults.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No games played yet</p>
            ) : (
              <div className="space-y-1.5">
                {recentResults.map(game => {
                  const isHome = game.homeTeamId === userTeam.id;
                  const myScore = isHome ? game.homeScore : game.awayScore;
                  const oppScore = isHome ? game.awayScore : game.homeScore;
                  const opp = league.teams.find(t => t.id === (isHome ? game.awayTeamId : game.homeTeamId));
                  const won = myScore > oppScore;
                  return (
                    <div key={game.id} className="flex items-center gap-3 py-1">
                      <span className={`text-[10px] font-black w-4 shrink-0 ${won ? 'text-emerald-400' : 'text-rose-400'}`}>{won ? 'W' : 'L'}</span>
                      <span className="text-[10px] text-slate-500 font-bold flex-1 truncate">{isHome ? 'vs' : '@'} {opp?.name ?? '—'}</span>
                      <span className={`text-xs font-mono font-bold ${won ? 'text-emerald-400' : 'text-rose-400'}`}>{myScore}–{oppScore}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Strength of Schedule */}
          <div className={cardBase} style={cardBg}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Strength of Schedule</p>
            <div className="space-y-3">
              {[
                { label: 'Last 10 Opponents', val: last10AvgOvr, color: '#94a3b8' },
                { label: 'Next 10 Opponents', val: next10AvgOvr, color: userTeam.primaryColor },
              ].map(({ label, val, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-mono" style={{ color }}>{val} OVR</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
              <p className="text-[9px] text-slate-600 italic">
                {next10AvgOvr > 82 ? '⚠️ Brutal stretch ahead' : next10AvgOvr < 78 ? '✅ Soft schedule upcoming' : 'Balanced schedule ahead'}
              </p>
            </div>
          </div>

          {/* News Feed */}
          <div className={cardBase} style={{ ...cardBg, borderLeft: `3px solid ${userTeam.primaryColor}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: userTeam.primaryColor }}>League Intel</p>
            <p className="text-xs text-slate-300 italic leading-relaxed">{news}</p>
            <button onClick={() => setActiveTab('news')} className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-300 transition-colors">Full News Feed →</button>
          </div>
        </div>
      </div>

      {/* ── Attendance (if games played) ── */}
      {(() => {
        const { homeGames, avgAttendance, capacityPct } = teamSeasonAttendance(userTeam, safeSchedule);
        if (homeGames === 0) return null;
        const allRanked = [...league.teams].map(t => ({ id: t.id, avg: teamSeasonAttendance(t, safeSchedule).avgAttendance })).sort((a, b) => b.avg - a.avg);
        const rank = allRanked.findIndex(r => r.id === userTeam.id) + 1;
        const fmt = (n: number) => n.toLocaleString('en-US');
        return (
          <div className={`${cardBase} flex flex-wrap gap-6 items-center`} style={cardBg}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 w-full sm:w-auto">Home Attendance</p>
            {[
              { label: 'Avg / Game', val: fmt(avgAttendance), color: 'text-white' },
              { label: '% Capacity', val: `${capacityPct.toFixed(1)}%`, color: capacityPct >= 95 ? 'text-emerald-400' : capacityPct >= 80 ? 'text-amber-400' : 'text-rose-400' },
              { label: 'League Rank', val: `#${rank}`, color: 'text-white' },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <p className="text-[9px] text-slate-600 font-black uppercase mb-0.5">{label}</p>
                <p className={`text-lg font-display font-black ${color}`}>{val}</p>
              </div>
            ))}
            <div className="flex-1 min-w-[120px]">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, capacityPct)}%`, backgroundColor: capacityPct >= 95 ? '#34d399' : capacityPct >= 80 ? '#f59e0b' : '#f43f5e' }} />
              </div>
              <p className="text-[9px] text-slate-600 font-bold mt-1">{homeGames} home games · Cap: {fmt(userTeam.stadiumCapacity || 19_000)}</p>
            </div>
            <button onClick={() => setActiveTab('stats')} className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-300 transition-colors ml-auto">Rankings →</button>
          </div>
        );
      })()}

      {/* ── Top Players row ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Top Players</p>
          <button onClick={() => setActiveTab('roster')} className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-300 transition-colors">Full Roster →</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {topPlayers.map((player, i) => {
            const isInj = player.status === 'Injured' || (player.injuryDaysLeft != null && player.injuryDaysLeft > 0);
            const effOvr = isInj && player.injuryOVRPenalty != null ? Math.max(40, player.rating - player.injuryOVRPenalty) : player.rating;
            const ppg = (player.stats.points / (player.stats.gamesPlayed || 1)).toFixed(1);
            const rpg = (player.stats.rebounds / (player.stats.gamesPlayed || 1)).toFixed(1);
            const apg = (player.stats.assists / (player.stats.gamesPlayed || 1)).toFixed(1);
            return (
              <div
                key={player.id}
                className="rounded-xl border border-white/5 p-4 cursor-pointer hover:border-white/15 transition-all group"
                style={{ backgroundColor: i === 0 ? `${userTeam.primaryColor}12` : '#0c1220', borderColor: i === 0 ? `${userTeam.primaryColor}30` : undefined }}
                onClick={() => onScout(player)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-display font-bold text-white text-sm uppercase group-hover:text-amber-400 transition-colors leading-tight">{player.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{player.position} · {player.age}y · {player.status}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-black text-2xl leading-none" style={{ color: isInj ? '#f43f5e' : i === 0 ? userTeam.primaryColor : 'white' }}>{effOvr}</p>
                    <p className="text-[9px] text-slate-600 font-black uppercase">OVR</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[{ label: 'PPG', val: ppg }, { label: 'RPG', val: rpg }, { label: 'APG', val: apg }].map(({ label, val }) => (
                    <div key={label} className="text-center bg-white/5 rounded-lg py-1.5">
                      <p className="text-[9px] text-slate-600 font-black uppercase">{label}</p>
                      <p className="text-sm font-mono font-bold text-slate-200">{val}</p>
                    </div>
                  ))}
                </div>
                {isInj && (
                  <p className="mt-2 text-[10px] text-rose-400 font-bold uppercase">⚠ {player.injuryType ?? 'Injured'}{player.injuryDaysLeft ? ` · ${player.injuryDaysLeft}d` : ''}</p>
                )}
                {player.personalityTraits?.includes('Leader') && !isInj && (
                  <p className="mt-2 text-[10px] text-amber-500 font-bold uppercase">★ Team Leader</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Full Roster Table ── */}
      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ backgroundColor: '#0c1220' }}>
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <p className="font-display font-bold text-base uppercase tracking-wide text-white">Active Roster <span style={{ color: userTeam.primaryColor }}>& Stats</span></p>
          <button onClick={() => setActiveTab('roster')} className="text-[10px] font-black uppercase tracking-widest transition-colors hover:text-slate-300" style={{ color: userTeam.primaryColor }}>Manage →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] text-slate-600 font-black uppercase tracking-widest border-b border-white/5">
                <th className="px-5 py-3">Player</th>
                <th className="px-3 py-3">Pos</th>
                <th className="px-3 py-3 text-center">Age</th>
                <th className="px-3 py-3 text-center">OVR</th>
                <th className="px-3 py-3 text-center">POT</th>
                <th className="px-3 py-3 text-center">PPG</th>
                <th className="px-3 py-3 text-center">RPG</th>
                <th className="px-3 py-3 text-center">APG</th>
                <th className="px-3 py-3 text-right">Contract</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[...userTeam.roster].sort((a, b) => {
                const ea = a.injuryOVRPenalty != null && (a.status === 'Injured' || (a.injuryDaysLeft ?? 0) > 0) ? Math.max(40, a.rating - a.injuryOVRPenalty) : a.rating;
                const eb = b.injuryOVRPenalty != null && (b.status === 'Injured' || (b.injuryDaysLeft ?? 0) > 0) ? Math.max(40, b.rating - b.injuryOVRPenalty) : b.rating;
                return eb - ea;
              }).map((player, i) => {
                const isInj = player.status === 'Injured' || (player.injuryDaysLeft != null && player.injuryDaysLeft > 0);
                const eff = isInj && player.injuryOVRPenalty != null ? Math.max(40, player.rating - player.injuryOVRPenalty) : player.rating;
                return (
                  <tr key={player.id} className="hover:bg-white/5 transition-all cursor-pointer group" onClick={() => onScout(player)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-0.5 h-6 rounded-full shrink-0" style={{ backgroundColor: i < 5 ? userTeam.primaryColor : 'transparent' }} />
                        <div>
                          <p className="text-xs font-bold text-slate-100 group-hover:text-amber-400 transition-colors uppercase">{player.name}</p>
                          <p className="text-[9px] text-slate-600 font-bold uppercase">{i < 5 ? 'Starter' : 'Bench'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] font-bold text-slate-500">{player.position}</td>
                    <td className="px-3 py-3 text-center text-xs font-medium text-slate-400">{player.age}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-display font-bold text-sm" style={{ color: isInj ? '#f43f5e' : 'white' }}>{eff}</span>
                      {isInj && player.injuryOVRPenalty != null && (
                        <span className="ml-1 text-[8px] text-rose-500 font-black">-{player.injuryOVRPenalty}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-bold text-slate-500">{player.potential}</td>
                    <td className="px-3 py-3 text-center font-mono text-xs text-slate-300">{(player.stats.points / (player.stats.gamesPlayed || 1)).toFixed(1)}</td>
                    <td className="px-3 py-3 text-center font-mono text-xs text-slate-300">{(player.stats.rebounds / (player.stats.gamesPlayed || 1)).toFixed(1)}</td>
                    <td className="px-3 py-3 text-center font-mono text-xs text-slate-300">{(player.stats.assists / (player.stats.gamesPlayed || 1)).toFixed(1)}</td>
                    <td className="px-3 py-3 text-right">
                      <p className="text-xs font-bold text-slate-300">{formatMoney(player.salary)}</p>
                      <p className="text-[9px] text-slate-600 font-bold uppercase">{player.contractYears}Y</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;