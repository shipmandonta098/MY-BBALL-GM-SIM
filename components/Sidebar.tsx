import React, { useState } from 'react';
import { Team, LeagueState } from '../types';
import { getSeasonPhase, PHASE_LABELS, PHASE_ORDER } from '../utils/seasonPhase';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  team: Team;
  onQuit: () => void;
  league: LeagueState;
  isExpansionActive?: boolean;
}

const PHASE_ICONS: Record<string, string> = {
  'Preseason':       '🏋️',
  'Regular Season':  '🏀',
  'Trade Deadline':  '⏰',
  'All-Star Weekend': '⭐',
  'Playoffs':        '🏆',
  'Offseason':       '🎯',
};

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  team,
  onQuit,
  league,
  isExpansionActive,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isOffseason = league.isOffseason;
  const draftPhase = league.draftPhase;
  const currentPhase = getSeasonPhase(league);

  // Offseason sub-phase label for Draft Hub
  const offseasonPhaseLabel =
    isOffseason && draftPhase === 'lottery' ? 'Lottery'
    : isOffseason && draftPhase === 'draft' ? 'Draft'
    : isOffseason && draftPhase === 'completed' ? 'Done'
    : null;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'gm_profile', label: 'GM Office', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'team_management', label: 'Team Management', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'news', label: 'News Feed', icon: 'M19 20l-7-7 7-7M5 8h14M5 12h14M5 16h14' },
    { id: 'transactions', label: 'League Log', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6' },
    { id: 'expansion', label: 'Expansion Draft', icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z', notification: isExpansionActive, visible: isExpansionActive },
    { id: 'schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'standings', label: 'Standings', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'power_rankings', label: 'Power Rankings', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { id: 'playoffs', label: 'Playoffs', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'allstar', label: 'All-Star Weekend', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', notification: currentPhase === 'All-Star Weekend', visible: !!league.allStarWeekend },
    { id: 'awards', label: 'Trophies', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z' },
    { id: 'finances', label: 'Finances', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'trade', label: 'Trade Machine', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4-4m-4 4l4 4' },
    { id: 'trade_proposals', label: 'Trade Proposals', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', notification: ((league.incomingTradeProposals ?? []).filter(p => p.status === 'incoming').length > 0) },
    { id: 'stats', label: 'League Stats', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'draft', label: offseasonPhaseLabel ? `Draft Hub · ${offseasonPhaseLabel}` : 'Draft Hub', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', notification: isOffseason && draftPhase !== 'completed' },
    { id: 'free_agency', label: 'FA Market', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', notification: isOffseason && draftPhase === 'completed' },
    { id: 'coach_market', label: 'Coach Market', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'coaching', label: 'Coaching', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'rotations', label: 'Rotations', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
    { id: 'roster', label: 'Roster', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'players', label: 'Players', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'league_history', label: 'League History', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    { id: 'franchise_history', label: 'Franchise History', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { id: 'settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ];

  // Season progress
  const totalGames = league.schedule.length;
  const playedGames = league.schedule.filter(g => g.played).length;
  const seasonPct = totalGames > 0 ? playedGames / totalGames : 0;

  const phaseIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div
      className={`bg-slate-900 border-r border-slate-800 flex flex-col h-full shrink-0 relative transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}
    >
      {/* ── Logo / Team ── */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3 overflow-hidden">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-slate-950 font-display text-xl shrink-0"
          style={{ backgroundColor: team.primaryColor }}
        >
          {team.name.charAt(0)}
        </div>
        {!isCollapsed && (
          <span className="font-display font-bold text-lg tracking-wider whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">
            HOOPS DYNASTY
          </span>
        )}
      </div>

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors z-50"
      >
        <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* ── Collapsed: phase icon only ── */}
      {isCollapsed && (
        <div className="px-2 py-2 border-b border-slate-800 flex justify-center" title={currentPhase}>
          <span className="text-lg">{PHASE_ICONS[currentPhase]}</span>
        </div>
      )}

      {/* ── Season Phase Strip ── */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          {/* Current phase badge */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">
              Season Phase
            </p>
            <span className="text-[9px] font-black uppercase text-amber-500">
              {PHASE_ICONS[currentPhase]} {PHASE_LABELS[currentPhase]}
            </span>
          </div>

          {/* Phase breadcrumb dots */}
          <div className="flex items-center gap-1.5">
            {PHASE_ORDER.map((phase, i) => {
              const isPast = i < phaseIdx;
              const isActive = i === phaseIdx;
              return (
                <React.Fragment key={phase}>
                  {i > 0 && (
                    <div className={`flex-1 h-px ${isPast || isActive ? 'bg-amber-500/40' : 'bg-slate-800'}`} />
                  )}
                  <button
                    onClick={() => {
                      if (phase === 'All-Star Weekend' && league.allStarWeekend) setActiveTab('allstar');
                      else if (phase === 'Playoffs' && league.playoffBracket) setActiveTab('playoffs');
                      else if (phase === 'Offseason' && league.isOffseason) setActiveTab('draft');
                    }}
                    title={PHASE_LABELS[phase]}
                    className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                      isActive
                        ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)] scale-125'
                        : isPast
                          ? 'bg-emerald-600'
                          : 'bg-slate-700'
                    }`}
                  />
                </React.Fragment>
              );
            })}
          </div>

          {/* Progress bar (regular season only) */}
          {!isOffseason && !league.playoffBracket && totalGames > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-[9px] text-slate-700 mb-1">
                <span>{playedGames} gms</span>
                <span>{Math.round(seasonPct * 100)}%</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500/70 rounded-full transition-all duration-500"
                  style={{ width: `${seasonPct * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Offseason sub-phases */}
          {isOffseason && (
            <div className="flex items-center gap-1 mt-2">
              {(['lottery', 'draft', 'completed'] as const).map((phase, i) => {
                const labels = ['Lottery', 'Draft', 'FA'];
                const isActive = draftPhase === phase;
                const isPast =
                  (phase === 'lottery' && (draftPhase === 'draft' || draftPhase === 'completed')) ||
                  (phase === 'draft' && draftPhase === 'completed');
                return (
                  <React.Fragment key={phase}>
                    {i > 0 && <span className="text-slate-700 text-[8px]">›</span>}
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest ${
                        isActive ? 'text-amber-500' : isPast ? 'text-emerald-600' : 'text-slate-700'
                      }`}
                    >
                      {labels[i]}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-none overflow-x-hidden">
        {menuItems.map(item => {
          if (item.visible === false) return null;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group relative ${
                isActive ? 'text-slate-950 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              style={isActive ? { backgroundColor: team.primaryColor } : {}}
              title={isCollapsed ? item.label : ''}
            >
              <div className="shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} />
                </svg>
              </div>
              {!isCollapsed && (
                <span className="font-bold text-sm whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">
                  {item.label}
                </span>
              )}
              {item.notification && (
                <span
                  className={`absolute ${isCollapsed ? 'top-1 right-1' : 'top-2 right-2'} w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]`}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Quit ── */}
      <div className="p-4 border-t border-slate-800 overflow-hidden">
        <button
          onClick={onQuit}
          className="w-full flex items-center gap-3 p-3 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-rose-500/5 transition-all group"
          title={isCollapsed ? 'Quit Career' : ''}
        >
          <div className="shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </div>
          {!isCollapsed && (
            <span className="font-bold text-sm whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">
              Quit Career
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
