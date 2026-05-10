import React from 'react';
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

// SVG icon paths for each main section
const SECTION_ICONS: Record<string, string> = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  team: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  league: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  world: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  tools: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  team,
  onQuit,
  league,
  isExpansionActive,
}) => {
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
    : isOffseason && draftPhase === 'completed' ? '· FA'
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
      { id: 'draft', label: draftPhase ? `Draft${offseasonPhaseLabel ?? ''}` : 'Draft', notification: draftNotif },
      { id: 'free_agency', label: 'Free Agency', notification: faNotif },
      { id: 'trade', label: 'Trades' },
      { id: 'trade_proposals', label: 'Proposals', notification: tradeNotif },
      { id: 'coach_market', label: 'Coaches' },
      { id: 'expansion', label: 'Expansion', locked: expansionLocked, lockedTooltip: `Available after the ${finalsLabel}`, notification: isExpansionActive },
    ],
    tools: [
      { id: 'finances', label: 'Finances' },
      { id: 'settings', label: 'Settings' },
    ],
  };

  const mainSections = [
    { id: 'home', label: 'Home' },
    { id: 'team', label: 'Team' },
    { id: 'league', label: 'League' },
    { id: 'world', label: 'World' },
    { id: 'tools', label: 'Tools' },
  ];

  const subTabs = SUB_TABS[currentSection] ?? [];
  const hasSubTabs = subTabs.filter(t => t.visible !== false).length > 0;

  const totalGames = league.schedule.length;
  const playedGames = league.schedule.filter(g => g.played).length;
  const seasonPct = totalGames > 0 ? Math.round((playedGames / totalGames) * 100) : 0;
  const phaseLabel = PHASE_LABELS[currentPhase] ?? currentPhase;

  const totalNotifs = (tradeNotif ? 1 : 0) + (draftNotif || faNotif ? 1 : 0) + (isExpansionActive ? 1 : 0);

  const sectionHasNotif = (id: string) =>
    (id === 'world' && (tradeNotif || draftNotif || faNotif || !!isExpansionActive)) ||
    (id === 'league' && allStarNotif);

  return (
    <>
      {/* ═══════════════════════════════════════════════
          TOP BAR  (always visible)
      ═══════════════════════════════════════════════ */}
      <header className="shrink-0 z-40 border-b border-white/5" style={{ backgroundColor: '#060b14' }}>
        <div className="flex items-center h-12 px-3 gap-3">

          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${team.primaryColor}22`, border: `1.5px solid ${team.primaryColor}50` }}
            >
              <TeamBadge team={team} size="sm" />
            </div>
            <div className="leading-none">
              <p className="font-display font-bold text-xs tracking-wider text-white uppercase">{team.name}</p>
              <p className="text-[8px] font-bold tracking-widest uppercase" style={{ color: team.primaryColor }}>
                {team.wins}–{team.losses}
              </p>
            </div>
          </div>

          {/* Desktop: main section tabs */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 mx-4">
            {mainSections.map(section => {
              const isActive = currentSection === section.id;
              const hasNotif = sectionHasNotif(section.id);
              return (
                <button
                  key={section.id}
                  onClick={() => { const t = SECTION_DEFAULTS[section.id]; if (t) setActiveTab(t); }}
                  className={`relative px-3.5 py-1.5 rounded text-[11px] font-black tracking-[0.12em] uppercase transition-all duration-150 ${
                    isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                  style={isActive ? { backgroundColor: `${team.primaryColor}18`, color: team.primaryColor } : {}}
                >
                  {section.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-2.5 right-2.5 h-0.5 rounded-full" style={{ backgroundColor: team.primaryColor }} />
                  )}
                  {hasNotif && !isActive && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {/* Phase pill — desktop only */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/8 bg-white/5">
              <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase">{phaseLabel}</span>
              {!isOffseason && totalGames > 0 && (
                <>
                  <span className="w-px h-3 bg-white/10" />
                  <div className="flex items-center gap-1">
                    <div className="w-14 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${seasonPct}%`, backgroundColor: team.primaryColor }} />
                    </div>
                    <span className="text-[8px] text-slate-600 font-bold">{seasonPct}%</span>
                  </div>
                </>
              )}
            </div>

            {/* Phase pill — mobile only (compact) */}
            <div className="md:hidden px-2 py-0.5 rounded-full border border-white/8 bg-white/5">
              <span className="text-[8px] font-black tracking-widest text-slate-500 uppercase">{phaseLabel}</span>
            </div>

            {/* GM label — desktop */}
            <div className="hidden sm:flex items-center gap-1 text-slate-600 text-[9px] font-bold tracking-widest uppercase">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>GM · {league.userGMName ?? 'You'}</span>
            </div>

            {/* Notification bell */}
            {totalNotifs > 0 && (
              <button
                onClick={() => setActiveTab('trade_proposals')}
                className="relative w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-white/5 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full border border-[#060b14]" />
              </button>
            )}

            {/* Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Quit — desktop only */}
            <button
              onClick={onQuit}
              className="hidden sm:flex w-7 h-7 rounded-full items-center justify-center text-slate-700 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
              title="Quit Career"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Sub-navigation bar ── */}
        {hasSubTabs && (
          <div className="border-t border-white/5 overflow-x-auto scrollbar-none" style={{ backgroundColor: '#040810' }}>
            <div className="flex items-center px-3 h-9 gap-0.5 min-w-max">
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
                    className={`relative flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-bold tracking-wide transition-all whitespace-nowrap ${
                      isLocked
                        ? 'text-slate-700 cursor-not-allowed'
                        : isActive
                          ? 'text-white'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                    style={isActive ? { color: team.primaryColor } : {}}
                  >
                    {tab.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-px rounded-full" style={{ backgroundColor: team.primaryColor }} />
                    )}
                    {tab.notification && !isLocked && (
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0" />
                    )}
                    {isLocked && (
                      <svg className="w-2.5 h-2.5 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
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

      {/* ═══════════════════════════════════════════════
          MOBILE BOTTOM TAB BAR  (hidden on md+)
      ═══════════════════════════════════════════════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/8 safe-area-inset-bottom"
        style={{ backgroundColor: '#060b14' }}
      >
        {mainSections.map(section => {
          const isActive = currentSection === section.id;
          const hasNotif = sectionHasNotif(section.id);
          return (
            <button
              key={section.id}
              onClick={() => { const t = SECTION_DEFAULTS[section.id]; if (t) setActiveTab(t); }}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative transition-all duration-150 ${
                isActive ? 'text-white' : 'text-slate-600 active:text-slate-300'
              }`}
              style={isActive ? { color: team.primaryColor } : {}}
            >
              {/* Icon */}
              <div className="relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={isActive ? 2 : 1.5}>
                  {SECTION_ICONS[section.id].split(' M').map((d, i) => (
                    <path key={i} strokeLinecap="round" strokeLinejoin="round" d={i === 0 ? d : 'M' + d} />
                  ))}
                </svg>
                {hasNotif && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full border border-[#060b14]" />
                )}
              </div>
              {/* Label */}
              <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${isActive ? '' : 'text-slate-600'}`}>
                {section.label}
              </span>
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ backgroundColor: team.primaryColor }} />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default TopNav;
