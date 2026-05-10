import React, { useState } from 'react';
import { Team, LeagueState } from '../types';
import { getSeasonPhase, PHASE_LABELS } from '../utils/seasonPhase';
import TeamBadge from './TeamBadge';

interface TopNavProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  team: Team;
  onQuit: () => void;
  league: LeagueState;
  isExpansionActive?: boolean;
}

const SECTION_MAP: Record<string, string> = {
  dashboard: 'home',
  gm_profile: 'team',
  team_management: 'team',
  roster: 'team',
  rotations: 'team',
  players: 'team',
  coaching: 'team',
  schedule: 'league',
  results: 'league',
  standings: 'league',
  stats: 'league',
  playoffs: 'league',
  allstar: 'league',
  power_rankings: 'league',
  awards: 'league',
  hof: 'league',
  league_history: 'league',
  franchise_history: 'league',
  news: 'world',
  transactions: 'world',
  draft: 'world',
  free_agency: 'world',
  trade: 'world',
  trade_proposals: 'world',
  coach_market: 'world',
  expansion: 'world',
  finances: 'tools',
  settings: 'tools',
};

const SECTION_DEFAULTS: Record<string, string> = {
  home: 'dashboard',
  team: 'roster',
  league: 'standings',
  world: 'news',
  tools: 'finances',
};

const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  team,
  onQuit,
  league,
  isExpansionActive,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentSection = SECTION_MAP[activeTab] ?? 'home';
  const isOffseason = league.isOffseason;
  const draftPhase = league.draftPhase;
  const currentPhase = getSeasonPhase(league);
  const isWomensLeague = (league.settings.playerGenderRatio ?? 0) === 100;
  const finalsLabel = isWomensLeague ? 'WNBA Finals' : 'NBA Finals';
  const expansionLocked = !isOffseason;

  const tradeNotif = (league.incomingTradeProposals ?? []).filter(p => p.status === 'incoming').length > 0;
  const draftNotif = isOffseason && draftPhase !== 'completed';
  const faNotif = isOffseason && draftPhase === 'completed';
  const allStarVisible = !!league.allStarWeekend;
  const allStarNotif = currentPhase === 'All-Star Weekend';

  const offseasonPhaseLabel =
    isOffseason && draftPhase === 'lottery' ? '· Lottery'
    : isOffseason && draftPhase === 'draft' ? '· Draft'
    : isOffseason && draftPhase === 'completed' ? '· FA Ready'
    : null;

  const SUB_TABS: Record<string, { id: string; label: string; notification?: boolean; locked?: boolean; lockedTooltip?: string; visible?: boolean }[]> = {
    home: [],
    team: [
      { id: 'roster', label: 'Roster' },
      { id: 'rotations', label: 'Rotations' },
      { id: 'players', label: 'All Players' },
      { id: 'coaching', label: 'Coaching' },
      { id: 'team_management', label: 'Management' },
      { id: 'gm_profile', label: 'GM Office' },
    ],
    league: [
      { id: 'standings', label: 'Standings' },
      { id: 'schedule', label: 'Schedule' },
      { id: 'results', label: 'Results' },
      { id: 'stats', label: 'Stats' },
      { id: 'power_rankings', label: 'Power Rankings' },
      { id: 'playoffs', label: 'Playoffs' },
      { id: 'allstar', label: 'All-Star', notification: allStarNotif, visible: allStarVisible },
      { id: 'awards', label: 'Trophies' },
      { id: 'hof', label: 'Hall of Fame' },
      { id: 'league_history', label: 'League History' },
      { id: 'franchise_history', label: 'Franchise' },
    ],
    world: [
      { id: 'news', label: 'News' },
      { id: 'transactions', label: 'League Log' },
      { id: 'draft', label: draftPhase ? `Draft Hub${offseasonPhaseLabel ?? ''}` : 'Draft Hub', notification: draftNotif },
      { id: 'free_agency', label: 'Free Agency', notification: faNotif },
      { id: 'trade', label: 'Trade Machine' },
      { id: 'trade_proposals', label: 'Proposals', notification: tradeNotif },
      { id: 'coach_market', label: 'Coach Market' },
      { id: 'expansion', label: 'Expansion', locked: expansionLocked, lockedTooltip: `Available after the ${finalsLabel}`, notification: isExpansionActive },
    ],
    tools: [
      { id: 'finances', label: 'Finances' },
      { id: 'settings', label: 'Settings' },
    ],
  };

  const mainSections = [
    { id: 'home', label: 'HOME' },
    { id: 'team', label: 'TEAM' },
    { id: 'league', label: 'LEAGUE' },
    { id: 'world', label: 'WORLD' },
    { id: 'tools', label: 'TOOLS' },
  ];

  const subTabs = SUB_TABS[currentSection] ?? [];
  const hasSubTabs = subTabs.filter(t => t.visible !== false).length > 0;

  const totalGames = league.schedule.length;
  const playedGames = league.schedule.filter(g => g.played).length;
  const seasonPct = totalGames > 0 ? Math.round((playedGames / totalGames) * 100) : 0;

  const phaseLabel = PHASE_LABELS[currentPhase] ?? currentPhase;

  const totalNotifs = (tradeNotif ? 1 : 0) + (draftNotif || faNotif ? 1 : 0) + (isExpansionActive ? 1 : 0);

  return (
    <header className="shrink-0 z-40" style={{ backgroundColor: '#060b14' }}>
      {/* ── Main nav bar ── */}
      <div className="border-b border-white/5">
        <div className="flex items-center h-14 px-4 gap-6">
          {/* Brand / Team */}
          <div className="flex items-center gap-3 shrink-0 mr-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
              style={{ backgroundColor: `${team.primaryColor}22`, border: `1.5px solid ${team.primaryColor}55` }}
            >
              <TeamBadge team={team} size="sm" />
            </div>
            <div className="hidden sm:block leading-none">
              <p className="font-display font-bold text-sm tracking-wider text-white uppercase">{team.name}</p>
              <p className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: team.primaryColor }}>
                {team.wins}–{team.losses}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/10 shrink-0 hidden sm:block" />

          {/* Main sections */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {mainSections.map(section => {
              const isActive = currentSection === section.id;
              const hasNotif =
                (section.id === 'world' && (tradeNotif || draftNotif || faNotif || isExpansionActive)) ||
                (section.id === 'league' && allStarNotif);
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    const target = SECTION_DEFAULTS[section.id];
                    if (target) setActiveTab(target);
                  }}
                  className={`relative px-4 py-1.5 rounded-md text-xs font-black tracking-[0.15em] transition-all duration-200 ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                  style={isActive ? { backgroundColor: `${team.primaryColor}18`, color: team.primaryColor } : {}}
                >
                  {section.label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                      style={{ backgroundColor: team.primaryColor }}
                    />
                  )}
                  {hasNotif && !isActive && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right side: phase + GM info */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {/* Phase pill */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{phaseLabel}</span>
              {!isOffseason && totalGames > 0 && (
                <>
                  <span className="w-px h-3 bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${seasonPct}%`, backgroundColor: team.primaryColor }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-600 font-bold">{seasonPct}%</span>
                  </div>
                </>
              )}
            </div>

            {/* GM label */}
            <div className="hidden sm:flex items-center gap-1.5 text-slate-500 text-[10px] font-bold tracking-widest uppercase">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>GM · {league.userGMName ?? 'You'}</span>
            </div>

            {/* Notifications dot */}
            {totalNotifs > 0 && (
              <button
                onClick={() => setActiveTab('trade_proposals')}
                className="relative w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-white/5 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full text-[7px] flex items-center justify-center font-black text-slate-900">
                  {totalNotifs}
                </span>
              </button>
            )}

            {/* Settings shortcut */}
            <button
              onClick={() => setActiveTab('settings')}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Quit button */}
            <button
              onClick={onQuit}
              title="Quit Career"
              className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden px-4 pb-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
            {mainSections.map(section => {
              const isActive = currentSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    const target = SECTION_DEFAULTS[section.id];
                    if (target) { setActiveTab(target); setMobileOpen(false); }
                  }}
                  className={`px-4 py-1.5 rounded-full text-xs font-black tracking-widest transition-all ${
                    isActive ? 'text-white' : 'text-slate-500 hover:text-slate-200'
                  }`}
                  style={isActive ? { backgroundColor: team.primaryColor } : {}}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Sub-navigation bar ── */}
      {hasSubTabs && (
        <div
          className="border-b border-white/5 overflow-x-auto scrollbar-none"
          style={{ backgroundColor: '#040810' }}
        >
          <div className="flex items-center px-4 h-10 gap-1 min-w-max">
            {subTabs.map(tab => {
              if (tab.visible === false) return null;
              const isActive = activeTab === tab.id;
              const isLocked = !!tab.locked;
              return (
                <button
                  key={tab.id}
                  onClick={isLocked ? undefined : () => setActiveTab(tab.id)}
                  disabled={isLocked}
                  title={isLocked ? tab.lockedTooltip : ''}
                  className={`relative flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-bold tracking-wide transition-all duration-150 whitespace-nowrap ${
                    isLocked
                      ? 'text-slate-700 cursor-not-allowed'
                      : isActive
                        ? 'text-white bg-white/8'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                  style={isActive ? { color: team.primaryColor } : {}}
                >
                  {tab.label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-px rounded-full"
                      style={{ backgroundColor: team.primaryColor }}
                    />
                  )}
                  {tab.notification && !isLocked && (
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0 animate-pulse" />
                  )}
                  {isLocked && (
                    <svg className="w-3 h-3 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};

export default TopNav;
