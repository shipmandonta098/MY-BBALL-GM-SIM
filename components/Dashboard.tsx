import React, { useState } from 'react';
import { LeagueState, Team, Player, GameResult } from '../types';
import TeamBadge from './TeamBadge';

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

const Dashboard: React.FC<DashboardProps> = ({ league, news, onSimulate, onScout, scoutingReport, setActiveTab, onViewRoster, onManageTeam, onAdvanceToRegularSeason }) => {
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const opponents = league.teams.filter(t => t.id !== userTeam.id);
  const nextOpponent = opponents[league.currentDay % opponents.length];

  const winPct = (userTeam.wins / (userTeam.wins + userTeam.losses || 1)).toFixed(3);
  const teamOvr = Math.round(userTeam.roster.reduce((acc, p) => acc + p.rating, 0) / userTeam.roster.length);
  const teamMorale = Math.round(userTeam.roster.reduce((acc, p) => acc + p.morale, 0) / userTeam.roster.length);
  
  // Advanced Stats Calculation
  const teamHistory = league.history.filter(h => h.homeTeamId === userTeam.id || h.awayTeamId === userTeam.id);
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
  const last10Games = league.history
    .filter(g => g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id)
    .sort((a, b) => b.date - a.date)
    .slice(0, 10);
  const last10AvgOvr = last10Games.length > 0 
    ? Math.round(last10Games.reduce((acc, g) => {
        const oppId = g.homeTeamId === userTeam.id ? g.awayTeamId : g.homeTeamId;
        const opp = league.teams.find(t => t.id === oppId)!;
        return acc + (opp.roster.reduce((s, p) => s + p.rating, 0) / opp.roster.length);
      }, 0) / last10Games.length)
    : 0;

  const next10Games = league.schedule
    .filter(g => !g.played && (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id))
    .sort((a, b) => a.day - b.day)
    .slice(0, 10);
  const next10AvgOvr = next10Games.length > 0
    ? Math.round(next10Games.reduce((acc, g) => {
        const oppId = g.homeTeamId === userTeam.id ? g.awayTeamId : g.homeTeamId;
        const opp = league.teams.find(t => t.id === oppId)!;
        return acc + (opp.roster.reduce((s, p) => s + p.rating, 0) / opp.roster.length);
      }, 0) / next10Games.length)
    : 0;

  // Finals Odds
  const netRating = (seasonStats.pts - seasonStats.oppPts) / gamesPlayed;
  const playoffOdds = Math.min(99, Math.max(1, Math.round((parseFloat(winPct) * 100 + netRating * 2 + (teamOvr - 75) * 2))));
  const confOdds = Math.round(playoffOdds * 0.4);
  const champOdds = Math.round(playoffOdds * 0.15);
  
  const formatOdds = (pct: number) => {
    if (pct > 50) return `-${Math.round(100 * (pct / (100 - pct)))}`;
    return `+${Math.round(100 * ((100 - pct) / pct))}`;
  };

  // Alerts
  const alerts = [];
  const expiringSoon = userTeam.roster.filter(p => p.contractYears === 1).length;
  if (expiringSoon > 0) alerts.push({ text: `${expiringSoon} contracts expiring soon`, type: 'warning' });
  
  const totalSalary = userTeam.roster.reduce((s, p) => s + p.salary, 0);
  if (totalSalary > league.settings.salaryCap) alerts.push({ text: "Over salary cap!", type: 'danger' });
  
  const lowMorale = userTeam.roster.filter(p => p.morale < 50).length;
  if (lowMorale > 0) alerts.push({ text: "Low morale warning", type: 'warning' });
  
  const injuredPlayers = userTeam.roster.filter(p => p.status === 'Injured');
  injuredPlayers.forEach(p => {
    const days = p.injuryDaysLeft ?? 0;
    const label = p.injuryType ?? 'Injury';
    alerts.push({ text: `${p.name} — ${label}${days > 0 ? ` · ${days}d` : ''}`, type: 'danger' });
  });

  const formatMoney = (amount: number) => `$${(amount / 1000000).toFixed(1)}M`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Alerts Bar */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {alerts.map((alert, i) => (
            <div 
              key={i} 
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest animate-in slide-in-from-top-2 duration-500 delay-${i * 100}`}
              style={{ 
                backgroundColor: alert.type === 'danger' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                borderColor: alert.type === 'danger' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: alert.type === 'danger' ? '#f43f5e' : '#f59e0b'
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {alert.text}
            </div>
          ))}
        </div>
      )}
      
      {/* Top Banner: Vitals & Next Game */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Next Game Preview */}
        <div 
          className="xl:col-span-2 relative group overflow-hidden bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
          style={{ borderLeft: `8px solid ${userTeam.primaryColor}` }}
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24" style={{ color: userTeam.primaryColor }}><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div 
                  className="w-24 h-24 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 mb-2 cursor-pointer hover:border-amber-500 transition-colors"
                  style={{ borderColor: userTeam.primaryColor }}
                  onClick={() => onManageTeam(userTeam.id)}
                >
                  <TeamBadge team={userTeam} size="xl" />
                </div>
                <p 
                  className="font-display font-bold text-lg uppercase cursor-pointer hover:text-amber-500 transition-colors"
                  onClick={() => onManageTeam(userTeam.id)}
                >
                  {userTeam.name}
                </p>
                <p className="text-xs text-slate-500 font-bold tracking-widest">{userTeam.wins}-{userTeam.losses}</p>
              </div>
              
              <div className="text-4xl font-display font-black text-slate-700 italic">VS</div>
              
              <div className="text-center">
                <div 
                  className="w-24 h-24 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 mb-2 cursor-pointer hover:border-amber-500 transition-colors"
                  style={{ borderColor: nextOpponent.primaryColor }}
                  onClick={() => onManageTeam(nextOpponent.id)}
                >
                  <TeamBadge team={nextOpponent} size="xl" />
                </div>
                <p 
                  className="font-display font-bold text-lg uppercase cursor-pointer hover:text-amber-500 transition-colors"
                  onClick={() => onManageTeam(nextOpponent.id)}
                >
                  {nextOpponent.name}
                </p>
                <p className="text-xs text-slate-500 font-bold tracking-widest">{nextOpponent.wins}-{nextOpponent.losses}</p>
              </div>
            </div>

            <div className="flex-1 space-y-4 max-w-sm">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-1" style={{ color: userTeam.primaryColor }}>Game Preview</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  The <span className="text-white font-bold">{userTeam.city} {userTeam.name}</span> face off against the <span className="text-white font-bold">{nextOpponent.name}</span> in a crucial {userTeam.conference} matchup. 
                  Win Probability: <span className="text-emerald-400 font-bold">{teamOvr > nextOpponent.roster.reduce((a,b)=>a+b.rating,0)/nextOpponent.roster.length ? '68%' : '42%'}</span>.
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => onSimulate('next')}
                  className="px-6 py-3 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-lg active:scale-95"
                  style={{ backgroundColor: userTeam.primaryColor }}
                >
                  Tip Off Now
                </button>
                <button 
                   onClick={() => onViewRoster(nextOpponent.id)}
                   className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold uppercase rounded-xl transition-all"
                >
                  Scout Roster
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Team Vitals Sidebar */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl">
          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Franchise Vitals</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Team OVR</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-display font-black" style={{ color: userTeam.primaryColor }}>{teamOvr}</span>
                  <span className="text-xs text-emerald-400 font-bold">↑ 2</span>
                </div>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Team Morale</p>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-display font-black" style={{ color: userTeam.secondaryColor }}>{teamMorale}%</span>
                  <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${teamMorale}%`, backgroundColor: userTeam.secondaryColor }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
             <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase">Cap Space</span>
                <span className="text-sm font-mono text-emerald-400 font-bold">{formatMoney(userTeam.budget - userTeam.roster.reduce((s,p) => s+p.salary, 0))}</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase">Standing</span>
                <span className="text-sm font-display text-white font-bold italic">#4 {userTeam.conference}</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase">Streak</span>
                <span className={`text-sm font-bold ${userTeam.streak >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {userTeam.streak >= 0 ? `W${userTeam.streak}` : `L${Math.abs(userTeam.streak)}`}
                </span>
             </div>
          </div>
        </div>
      </div>

      {/* Professional Dashboard Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Team Ratings */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-6">Team Ratings</h3>
          <div className="flex justify-around items-center">
            <CircularGauge value={Math.round(userTeam.roster.reduce((a,b)=>a+b.attributes.shooting,0)/userTeam.roster.length)} label="Offense" color="#10b981" />
            <CircularGauge value={Math.round(userTeam.roster.reduce((a,b)=>a+b.attributes.defense,0)/userTeam.roster.length)} label="Defense" color="#3b82f6" />
            <CircularGauge value={teamOvr} label="Overall" color={userTeam.primaryColor} />
          </div>
        </div>

        {/* Efficiency 4-Factors */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-6">Efficiency (4-Factors)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              <p className="text-[8px] text-slate-500 font-black uppercase mb-1">eFG%</p>
              <p className={`text-xl font-display font-black ${parseFloat(eFG) > 52 ? 'text-emerald-400' : 'text-rose-400'}`}>{eFG}%</p>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              <p className="text-[8px] text-slate-500 font-black uppercase mb-1">TOV%</p>
              <p className={`text-xl font-display font-black ${parseFloat(tovPct) < 13 ? 'text-emerald-400' : 'text-rose-400'}`}>{tovPct}%</p>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              <p className="text-[8px] text-slate-500 font-black uppercase mb-1">ORB%</p>
              <p className={`text-xl font-display font-black ${parseFloat(orbPct) > 25 ? 'text-emerald-400' : 'text-rose-400'}`}>{orbPct}%</p>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              <p className="text-[8px] text-slate-500 font-black uppercase mb-1">FT Rate</p>
              <p className={`text-xl font-display font-black ${parseFloat(ftRate) > 20 ? 'text-emerald-400' : 'text-rose-400'}`}>{ftRate}%</p>
            </div>
          </div>
        </div>

        {/* Strength of Schedule */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-6">Strength of Schedule</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-end mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Last 10 Opponents</span>
                <span className="text-xs font-mono text-white font-bold">{last10AvgOvr} OVR</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-slate-600" style={{ width: `${last10AvgOvr}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-end mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Next 10 Opponents</span>
                <span className="text-xs font-mono text-amber-500 font-bold">{next10AvgOvr} OVR</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${next10AvgOvr}%` }}></div>
              </div>
              <p className="text-[9px] text-slate-500 mt-2 italic">
                {next10AvgOvr > 82 ? "⚠️ Brutal stretch ahead" : next10AvgOvr < 78 ? "✅ Soft schedule upcoming" : "Balanced schedule"}
              </p>
            </div>
          </div>
        </div>

        {/* Finals Odds */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-6">Finals Odds</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-slate-950/50 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase">Championship</span>
              <div className="text-right">
                <span className="text-sm font-mono text-emerald-400 font-bold">{formatOdds(champOdds)}</span>
                <span className="ml-2 text-[10px] text-slate-500 font-bold">({champOdds}%)</span>
              </div>
            </div>
            <div className="flex justify-between items-center p-2 bg-slate-950/50 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase">Conference</span>
              <div className="text-right">
                <span className="text-sm font-mono text-emerald-400 font-bold">{formatOdds(confOdds)}</span>
                <span className="ml-2 text-[10px] text-slate-500 font-bold">({confOdds}%)</span>
              </div>
            </div>
            <div className="flex justify-between items-center p-2 bg-slate-950/50 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase">Playoffs</span>
              <div className="text-right">
                <span className="text-sm font-mono text-emerald-400 font-bold">{formatOdds(playoffOdds)}</span>
                <span className="ml-2 text-[10px] text-slate-500 font-bold">({playoffOdds}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Depth Chart & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Depth Chart / Starting Lineup */}
        <div className="lg:col-span-3 space-y-8">
          <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="font-display font-bold text-2xl uppercase tracking-tight">Active Roster & <span style={{ color: userTeam.primaryColor }}>Stats</span></h2>
              <button 
                onClick={() => setActiveTab('roster')}
                className="text-xs font-black uppercase tracking-widest transition-colors"
                style={{ color: userTeam.primaryColor }}
              >
                Manage Depth Chart →
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800">
                    <th className="px-6 py-4">Player</th>
                    <th className="px-6 py-4">Pos</th>
                    <th className="px-6 py-4 text-center">Age</th>
                    <th className="px-6 py-4 text-center">OVR</th>
                    <th className="px-6 py-4 text-center">POT</th>
                    <th className="px-6 py-4 text-center">PPG</th>
                    <th className="px-6 py-4 text-center">RPG</th>
                    <th className="px-6 py-4 text-center">APG</th>
                    <th className="px-6 py-4 text-right">Contract</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {userTeam.roster.sort((a,b) => b.rating - a.rating).map((player, i) => (
                    <tr 
                      key={player.id} 
                      className={`group hover:bg-slate-800/30 transition-all cursor-pointer ${i < 5 ? 'bg-slate-800/10' : ''}`}
                      onClick={() => onScout(player)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-1 h-8 rounded-full`} style={{ backgroundColor: i < 5 ? userTeam.primaryColor : 'transparent' }}></div>
                          <div>
                            <div className="font-display font-bold text-slate-100 group-hover:text-amber-500 transition-colors uppercase">{player.name}</div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase">{i < 5 ? 'Starter' : 'Bench'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-400">{player.position}</td>
                      <td className="px-6 py-4 text-center text-sm font-medium">{player.age}</td>
                      <td className="px-6 py-4 text-center font-display font-bold text-lg text-white">{player.rating}</td>
                      <td className="px-6 py-4 text-center font-display font-bold text-sm text-slate-500">{player.potential}</td>
                      <td className="px-6 py-4 text-center font-mono text-sm text-slate-300">{(player.stats.points / (player.stats.gamesPlayed || 1)).toFixed(1)}</td>
                      <td className="px-6 py-4 text-center font-mono text-sm text-slate-300">{(player.stats.rebounds / (player.stats.gamesPlayed || 1)).toFixed(1)}</td>
                      <td className="px-6 py-4 text-center font-mono text-sm text-slate-300">{(player.stats.assists / (player.stats.gamesPlayed || 1)).toFixed(1)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-xs font-bold text-slate-300">{formatMoney(player.salary)}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{player.contractYears}Y Left</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* AI Narrative Bulletin Feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: userTeam.primaryColor }}></div>
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center flex-shrink-0 border border-slate-700">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" style={{ color: userTeam.primaryColor }}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: userTeam.primaryColor }}>League Intelligence Report</h3>
                <p className="text-xl font-medium leading-relaxed italic text-slate-200">
                  {news}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Quick Actions & News */}
        <div className="space-y-8">

          {/* ── Preseason Banner ── */}
          {(league.seasonPhase === 'Preseason' || (league.isOffseason && league.draftPhase === 'completed')) && onAdvanceToRegularSeason && (
            <div className="bg-gradient-to-br from-amber-900/30 to-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-2xl animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🏀</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500">
                    {league.isOffseason ? 'Offseason Complete' : 'Preseason'}
                  </p>
                  <h3 className="text-lg font-display font-black text-white uppercase">
                    {league.isOffseason ? 'Ready to Tip Off' : 'Season Locked & Loaded'}
                  </h3>
                </div>
              </div>
              <p className="text-slate-400 text-xs mb-5 leading-relaxed">
                {league.isOffseason
                  ? 'Draft and free agency are complete. Generate a fresh schedule and begin the new season.'
                  : 'A schedule has been generated. You can regenerate it in Settings → League, or advance to start the regular season now.'}
              </p>
              <button
                onClick={onAdvanceToRegularSeason}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-display font-black uppercase text-sm rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Advance to Regular Season
              </button>
            </div>
          )}

          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 pb-2 border-b border-slate-800">Simulation Hub</h3>
            <div className="space-y-3">
              <button 
                onClick={() => onSimulate('next')}
                className="w-full flex items-center justify-between p-4 bg-slate-800 group transition-all rounded-2xl"
                style={{ hoverBackgroundColor: userTeam.primaryColor }}
              >
                <div className="flex items-center gap-3 text-slate-300 group-hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                  <span className="font-display font-bold uppercase">Next Game</span>
                </div>
                <span 
                  className="text-[10px] font-black bg-slate-700 px-2 py-0.5 rounded text-slate-500 uppercase tracking-widest"
                >Sim</span>
              </button>
              
              <button 
                onClick={() => onSimulate('week')}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 transition-all rounded-2xl"
              >
                <div className="flex items-center gap-3 text-slate-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="font-display font-bold uppercase">Sim 1 Week</span>
                </div>
              </button>

              <button 
                onClick={() => onSimulate('season')}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 transition-all rounded-2xl"
              >
                <div className="flex items-center gap-3 text-slate-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="font-display font-bold uppercase">Sim Season</span>
                </div>
              </button>
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 pb-2 border-b border-slate-800">Front Office</h3>
            <div className="space-y-2">
              <button onClick={() => setActiveTab('roster')} className="w-full text-left p-3 hover:bg-slate-800 rounded-xl transition-colors text-sm font-bold text-slate-300">Manage Roster</button>
              <button onClick={() => setActiveTab('marketplace')} className="w-full text-left p-3 hover:bg-slate-800 rounded-xl transition-colors text-sm font-bold text-slate-300">Marketplace</button>
              <button onClick={() => setActiveTab('draft')} className="w-full text-left p-3 hover:bg-slate-800 rounded-xl transition-colors text-sm font-bold text-slate-300">Draft Scouting</button>
              <button onClick={() => setActiveTab('trade')} className="w-full text-left p-3 hover:bg-slate-800 rounded-xl transition-colors text-sm font-bold text-slate-300">Trade Machine</button>
            </div>
          </section>

          {/* Scouting Report Preview (if selected) */}
          {scoutingReport && (
            <div 
              className="border rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-300"
              style={{ backgroundColor: userTeam.primaryColor, borderColor: userTeam.secondaryColor }}
            >
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

export default Dashboard;