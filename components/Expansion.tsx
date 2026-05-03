import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LeagueState, Team, Player, NewsItem } from '../types';
import { generateCoach, generateDefaultRotation, EXPANSION_CITY_DB, TEAM_DATA, ExpansionCityOption } from '../constants';

interface ExpansionProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onScout: (player: Player) => void;
}

interface TeamForm {
  name: string;
  city: string;
  abbreviation: string;
  gmName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
}

const BLANK_FORM: TeamForm = {
  name: '',
  city: '',
  abbreviation: '',
  gmName: '',
  primaryColor: '#f97316',
  secondaryColor: '#1e293b',
  logoUrl: '',
};

const PICKS_PER_EXPANSION_TEAM = 14;

// ─── helpers ─────────────────────────────────────────────────────────────────
const ratingColor = (r: number) =>
  r >= 90 ? 'text-amber-400' : r >= 80 ? 'text-emerald-400' : r >= 70 ? 'text-sky-400' : 'text-slate-400';

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

// ─── Component ────────────────────────────────────────────────────────────────
const Expansion: React.FC<ExpansionProps> = ({ league, updateLeague, onScout }) => {
  const s = league.settings;
  const teamCount  = s.expansionTeamCount ?? 1;
  const rules      = s.expansionDraftRules ?? 'Standard';
  const maxProtected = rules === 'Protected' ? 11 : rules === 'Open' ? 0 : 8;
  const draftState = league.expansionDraft;

  // ── local state ────────────────────────────────────────────────────────────
  const [forms, setForms] = useState<TeamForm[]>(() =>
    Array.from({ length: teamCount }, () => ({ ...BLANK_FORM }))
  );
  const [formPage, setFormPage]         = useState(0);
  const [protectedIds, setProtectedIds] = useState<string[]>([]);
  const [draftIdx, setDraftIdx]         = useState(0);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [activeExpTeam, setActiveExpTeam] = useState(0); // which expansion team tab to preview
  const [showCityPicker, setShowCityPicker] = useState(true);
  const [citySearch, setCitySearch] = useState('');

  // sync protection list from persisted state
  useEffect(() => {
    if (draftState?.protectedPlayerIds?.[league.userTeamId]) {
      setProtectedIds(draftState.protectedPlayerIds[league.userTeamId]);
    }
  }, [draftState?.protectedPlayerIds, league.userTeamId]);

  // reset forms when teamCount changes (before expansion starts)
  useEffect(() => {
    if (!draftState?.active) {
      setForms(Array.from({ length: teamCount }, () => ({ ...BLANK_FORM })));
      setFormPage(0);
    }
  }, [teamCount, draftState?.active]);

  // reset city picker when navigating between form pages
  useEffect(() => {
    setShowCityPicker(forms[formPage]?.city.trim() === '');
    setCitySearch('');
  }, [formPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── available expansion markets ────────────────────────────────────────────
  const availableCities = useMemo(() => {
    const activeLeagueCities = new Set(
      league.teams
        .filter(t => t.status === 'Active' || t.status === 'Relocating' || t.status === 'Expansion')
        .map(t => t.city.toLowerCase())
    );

    // Cities from EXPANSION_CITY_DB not already occupied
    const staticCities = EXPANSION_CITY_DB.filter(
      c => !activeLeagueCities.has(c.city.toLowerCase())
    );

    // Former league cities (in TEAM_DATA but no longer in league.teams)
    const leagueCities = new Set(league.teams.map(t => t.city.toLowerCase()));
    const formerCities: (ExpansionCityOption & { isFormerLeague: true; formerName: string })[] =
      TEAM_DATA
        .filter(td => !leagueCities.has(td.city.toLowerCase()))
        .filter(td => !EXPANSION_CITY_DB.some(c => c.city.toLowerCase() === td.city.toLowerCase()))
        .map(td => ({
          city: td.city,
          state: '',
          country: 'USA' as const,
          marketSize: td.market as 'Large' | 'Medium' | 'Small',
          population: td.market === 'Large' ? 5.0 : td.market === 'Medium' ? 2.8 : 1.6,
          expansionFee: td.market === 'Large' ? 130 : td.market === 'Medium' ? 95 : 78,
          suggestedName: td.name,
          suggestedNames: [td.name],
          primaryColor: td.primary,
          secondaryColor: td.secondary,
          conf: td.conf as 'Eastern' | 'Western',
          div: td.div,
          isFormerLeague: true as const,
          formerName: td.name,
        }));

    return { staticCities, formerCities };
  }, [league.teams]);

  // ── unprotected pool memo ──────────────────────────────────────────────────
  const unprotectedPool = useMemo(() => {
    if (!draftState) return [];
    return league.teams
      .filter(t => !draftState.expansionTeamIds.includes(t.id))
      .flatMap(t => {
        const prot = draftState.protectedPlayerIds[t.id] ?? [];
        return t.roster
          .filter(p => !prot.includes(p.id))
          .map(p => ({ ...p, _fromTeamId: t.id, _fromTeamName: t.name }));
      })
      .sort((a, b) => b.rating - a.rating);
  }, [league.teams, draftState]);

  // ── action: start expansion draft ─────────────────────────────────────────
  const handleStartExpansion = useCallback(() => {
    updateLeague({
      expansionDraft: {
        active: true,
        phase: 'setup',
        protectedPlayerIds: {},
        expansionTeamIds: [],
        draftLog: [],
        pendingTeams: [],
      },
    });
    setForms(Array.from({ length: teamCount }, () => ({ ...BLANK_FORM })));
    setFormPage(0);
  }, [teamCount, updateLeague]);

  // ── action: finalize team setup → move to protection ──────────────────────
  const handleFinalizeSetup = useCallback(() => {
    if (!draftState) return;
    const genderRatio = s.coachGenderRatio ?? 0;

    const newTeams: Team[] = forms.map((f, i) => {
      const teamId = `expansion-${Date.now()}-${i}`;
      const name   = f.name.trim() || `Expansion Team ${i + 1}`;
      const city   = f.city.trim() || 'New City';
      const abbr   = (f.abbreviation.trim() || city.substring(0, 3)).toUpperCase().substring(0, 3);

      return {
        id: teamId,
        name,
        city,
        abbreviation: abbr,
        conference: 'Western' as const,
        division:   'Pacific' as const,
        marketSize: 'Large'  as const,
        roster: [],
        staff: {
          headCoach:       generateCoach(`coach-exp-${i}-hc`,  'B', genderRatio),
          assistantOffense: generateCoach(`coach-exp-${i}-off`, 'C', genderRatio),
          assistantDefense: generateCoach(`coach-exp-${i}-def`, 'C', genderRatio),
          assistantDev:     generateCoach(`coach-exp-${i}-dev`, 'C', genderRatio),
          trainer:          generateCoach(`coach-exp-${i}-tr`,  'C', genderRatio),
        },
        staffBudget: 15_000_000,
        activeScheme: 'Balanced',
        wins: 0, losses: 0, homeWins: 0, homeLosses: 0,
        roadWins: 0, roadLosses: 0, confWins: 0, confLosses: 0,
        lastTen: [], streak: 0,
        budget: 180_000_000,
        logo: f.logoUrl.trim(),
        primaryColor:   f.primaryColor,
        secondaryColor: f.secondaryColor,
        rotation: { starters: { PG: '', SG: '', SF: '', PF: '', C: '' }, bench: [], reserves: [], minutes: {} },
        finances: {
          revenue: 5_000_000, expenses: 4_000_000, cash: 25_000_000,
          ticketPrice: 85, concessionPrice: 12, fanHype: 60,
          ownerPatience: 80, ownerGoal: 'Win Now',
          budgets: { coaching: 70, scouting: 70, health: 70, facilities: 70 },
        },
        picks: [
          { round: 1, pick: 0, originalTeamId: teamId, currentTeamId: teamId },
          { round: 2, pick: 0, originalTeamId: teamId, currentTeamId: teamId },
        ],
        population:      4.2,
        stadiumCapacity: 18_500,
        borderStyle: 'Solid',
        status: 'Expansion' as const,
      };
    });

    // Auto-protect top players for all AI (non-user) existing teams
    const aiProtection: Record<string, string[]> = {};
    league.teams.forEach(t => {
      if (t.id === league.userTeamId) return;
      const topIds = [...t.roster]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, maxProtected)
        .map(p => p.id);
      aiProtection[t.id] = topIds;
    });

    updateLeague({
      teams: [...league.teams, ...newTeams],
      expansionDraft: {
        ...draftState,
        phase: 'protection',
        expansionTeamIds: newTeams.map(t => t.id),
        protectedPlayerIds: aiProtection,
        pendingTeams: forms.map((f, i) => ({
          id: newTeams[i].id,
          name: newTeams[i].name,
          city: newTeams[i].city,
          abbreviation: newTeams[i].abbreviation,
          gmName: f.gmName.trim() || 'TBD',
          primaryColor:   f.primaryColor,
          secondaryColor: f.secondaryColor,
          logoUrl: f.logoUrl.trim(),
        })),
      },
    });
    setProtectedIds([]);
  }, [draftState, forms, league.teams, league.userTeamId, maxProtected, s.coachGenderRatio, updateLeague]);

  // ── action: confirm protection list → move to draft ───────────────────────
  const handleConfirmProtection = useCallback(() => {
    if (!draftState) return;
    updateLeague({
      expansionDraft: {
        ...draftState,
        protectedPlayerIds: {
          ...draftState.protectedPlayerIds,
          [league.userTeamId]: protectedIds,
        },
        phase: 'draft',
      },
    });
  }, [draftState, league.userTeamId, protectedIds, updateLeague]);

  // ── action: execute one draft pick ────────────────────────────────────────
  const executeDraftPick = useCallback(() => {
    if (!draftState) return;
    const expIds   = draftState.expansionTeamIds;
    const expId    = expIds[draftIdx % expIds.length];
    const expTeam  = league.teams.find(t => t.id === expId);
    if (!expTeam) return;

    // Rule: can't pick more than 1 from the same source team
    const alreadyFromTeam = new Set(
      expTeam.roster.map(p => (p as any)._fromTeamId as string).filter(Boolean)
    );
    const available = unprotectedPool.filter(
      p => !alreadyFromTeam.has((p as any)._fromTeamId)
    );
    if (available.length === 0) return;

    const picked = available[0];
    const fromTeamId   = (picked as any)._fromTeamId as string;
    const fromTeamName = (picked as any)._fromTeamName as string;

    const updatedTeams = league.teams.map(t => {
      if (t.id === fromTeamId) {
        return { ...t, roster: t.roster.filter(p => p.id !== picked.id) };
      }
      if (t.id === expId) {
        const player = { ...picked, lastTeamId: fromTeamId, _fromTeamId: fromTeamId };
        return { ...t, roster: [...t.roster, player] };
      }
      return t;
    });

    const pick = Math.floor(draftIdx / expIds.length) + 1;
    const round = pick <= expIds.length ? `R1 P${draftIdx + 1}` : `R${Math.ceil(pick / expIds.length)} P${draftIdx + 1}`;
    const log = `${round}: ${expTeam.name} — ${picked.name} (${picked.position}, ${picked.rating} OVR) from ${fromTeamName}`;

    updateLeague({
      teams: updatedTeams,
      expansionDraft: { ...draftState, draftLog: [log, ...draftState.draftLog] },
    });
    setDraftIdx(prev => prev + 1);
  }, [draftState, draftIdx, league.teams, unprotectedPool, updateLeague]);

  // ── auto-draft loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAutoRunning || !draftState || draftState.phase !== 'draft') return;
    const totalPicks = PICKS_PER_EXPANSION_TEAM * draftState.expansionTeamIds.length;
    if (draftIdx >= totalPicks) {
      setIsAutoRunning(false);
      updateLeague({ expansionDraft: { ...draftState, phase: 'completed' } });
      return;
    }
    const timer = setTimeout(executeDraftPick, 480);
    return () => clearTimeout(timer);
  }, [isAutoRunning, draftIdx, draftState?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── action: finalize draft → teams join league ────────────────────────────
  const handleFinalize = useCallback(() => {
    if (!draftState) return;
    const updatedTeams = league.teams.map(t => {
      if (!draftState.expansionTeamIds.includes(t.id)) return t;
      return { ...t, rotation: generateDefaultRotation(t.roster) };
    });

    const newsItems: NewsItem[] = draftState.expansionTeamIds.map((tid, i) => {
      const team = updatedTeams.find(t => t.id === tid);
      const gmName = draftState.pendingTeams?.find(pt => pt.id === tid)?.gmName ?? 'the new GM';
      return {
        id: `exp-news-${tid}-${Date.now()}`,
        category: 'transaction' as const,
        headline: `${team?.name ?? 'Expansion Team'} joins the league!`,
        content: `The ${team?.city ?? ''} ${team?.name ?? 'Expansion franchise'} has completed its expansion draft under GM ${gmName}. The team selected ${team?.roster.length ?? 0} players and will join league play next season.`,
        timestamp: league.currentDay,
        realTimestamp: Date.now() + i * 50,
        teamId: tid,
        isBreaking: true,
      };
    });

    // Add draft-result news
    const draftRecap: NewsItem = {
      id: `exp-recap-${Date.now()}`,
      category: 'transaction' as const,
      headline: 'Expansion Draft Complete — League Grows!',
      content: draftState.draftLog.slice(0, 6).join(' | '),
      timestamp: league.currentDay,
      realTimestamp: Date.now() + 200,
      isBreaking: false,
    };

    updateLeague({
      teams: updatedTeams,
      newsFeed: [...newsItems, draftRecap, ...league.newsFeed],
      expansionDraft: { ...draftState, active: false },
    });
  }, [draftState, league.teams, league.newsFeed, league.currentDay, updateLeague]);

  // ── common header ──────────────────────────────────────────────────────────
  const PageHeader: React.FC<{ title: string; sub: string; badge?: string }> = ({ title, sub, badge }) => (
    <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 blur-[100px] rounded-full -mr-40 -mt-40 pointer-events-none" />
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          {badge && (
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-orange-500 mb-2">{badge}</p>
          )}
          <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white leading-none">
            {title.split(' ').map((w, i, arr) =>
              i === arr.length - 1
                ? <span key={i} className="text-orange-500">{w}</span>
                : <span key={i}>{w} </span>
            )}
          </h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">{sub}</p>
        </div>
      </div>
    </header>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 0: Season not yet complete — locked until offseason
  // ══════════════════════════════════════════════════════════════════════════
  const isWomensLeague = (league.settings.playerGenderRatio ?? 0) === 100;
  const finalsLabel = isWomensLeague ? 'WNBA Finals' : 'NBA Finals';

  if (!league.isOffseason && !draftState?.active) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-40">
        <PageHeader
          title="Expansion Draft"
          sub="Add a new franchise to your league"
          badge="Locked"
        />
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-6">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-display font-bold uppercase text-slate-400 tracking-wide mb-2">
              Expansion Draft Locked
            </p>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              The Expansion Draft becomes available after the{' '}
              <span className="text-slate-300 font-semibold">{finalsLabel}</span>{' '}
              conclude. Complete the current season — playoffs and championship — then return here during the offseason.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="h-px flex-1 max-w-24 bg-slate-800" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">When it unlocks</span>
            <div className="h-px flex-1 max-w-24 bg-slate-800" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto text-left">
            {[
              { n: '1', t: 'Finish the Season', d: 'Complete all regular season games' },
              { n: '2', t: 'Win the Championship', d: `Play through the playoffs and ${finalsLabel}` },
              { n: '3', t: 'Enter Offseason', d: 'Expansion unlocks automatically once the season ends' },
            ].map(step => (
              <div key={step.n} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex gap-3">
                <span className="text-2xl font-display font-black text-slate-700">{step.n}</span>
                <div>
                  <p className="font-bold text-slate-300 text-sm">{step.t}</p>
                  <p className="text-slate-600 text-xs mt-0.5">{step.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 1: Unlocked — configure and launch
  // ══════════════════════════════════════════════════════════════════════════
  if (!draftState?.active) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-40">
        <PageHeader
          title="Expansion Draft"
          sub={`Ready to add ${teamCount} new franchise${teamCount > 1 ? 's' : ''} — ${rules} protection rules`}
          badge="Expansion Ready"
        />

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              ),
              label: 'New Teams',
              value: String(teamCount),
              sub: `franchise${teamCount > 1 ? 's' : ''} joining`,
            },
            {
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              ),
              label: 'Protected Spots',
              value: String(maxProtected),
              sub: `players per team (${rules})`,
            },
            {
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              ),
              label: 'Draft Picks',
              value: String(PICKS_PER_EXPANSION_TEAM * teamCount),
              sub: `total (${PICKS_PER_EXPANSION_TEAM} per team)`,
            },
          ].map(card => (
            <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex items-center gap-5">
              <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {card.icon}
                </svg>
              </div>
              <div>
                <p className="text-3xl font-display font-black text-white">{card.value}</p>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight">{card.label}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Team count selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Expansion Teams</p>
            <p className="text-[11px] text-slate-600 mt-0.5">How many new franchises will join next season?</p>
          </div>
          <div className="flex gap-2">
            {([1, 2, 4] as const).map(n => (
              <button
                key={n}
                onClick={() => updateLeague({ settings: { ...s, expansionTeamCount: n } })}
                className={`w-14 h-10 rounded-xl font-display font-black text-sm transition-all ${
                  teamCount === n
                    ? 'bg-orange-500 text-slate-950 shadow-lg shadow-orange-500/30'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Steps overview */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
          <h3 className="text-xs font-black uppercase tracking-[0.4em] text-orange-500 mb-6">Expansion Process</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { step: '01', title: 'Team Setup', desc: 'Name, colors & identity for each new franchise' },
              { step: '02', title: 'Protection Phase', desc: `Each team protects up to ${maxProtected} players` },
              { step: '03', title: 'Expansion Draft', desc: 'New teams select from unprotected pool' },
              { step: '04', title: 'League Joins', desc: 'Teams added to standings & next season schedule' },
            ].map(item => (
              <div key={item.step} className="flex gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <span className="text-3xl font-display font-black text-slate-700 leading-none">{item.step}</span>
                <div>
                  <p className="font-bold text-slate-200 text-sm">{item.title}</p>
                  <p className="text-slate-600 text-xs mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleStartExpansion}
            className="px-12 py-5 bg-orange-500 hover:bg-orange-400 active:scale-95 text-slate-950 font-display font-black uppercase text-lg rounded-2xl shadow-2xl shadow-orange-500/30 transition-all flex items-center gap-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Launch Expansion
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 2: Setup phase — configure new team(s)
  // ══════════════════════════════════════════════════════════════════════════
  if (draftState.phase === 'setup') {
    const form = forms[formPage] ?? { ...BLANK_FORM };
    const updateForm = (key: keyof TeamForm, val: string) =>
      setForms(prev => prev.map((f, i) => i === formPage ? { ...f, [key]: val } : f));

    const allValid = forms.every(f => f.name.trim().length > 0 && f.city.trim().length > 0);

    const marketSizeLabel = (s: 'Large' | 'Medium' | 'Small') =>
      s === 'Large' ? { label: 'Large Market', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
      : s === 'Medium' ? { label: 'Medium Market', cls: 'bg-sky-500/20 text-sky-400 border-sky-500/30' }
      : { label: 'Small Market', cls: 'bg-slate-600/40 text-slate-400 border-slate-600/40' };

    const fmtPop = (p: number) => p >= 10 ? `${p.toFixed(0)}M` : `${p.toFixed(1)}M`;
    const fmtFee = (f: number) => `$${f}M`;

    const applyCity = (c: ExpansionCityOption) => {
      const abbr = c.city.replace(/\s+/g, '').substring(0, 3).toUpperCase();
      setForms(prev => prev.map((f, i) => i === formPage ? {
        ...f,
        city: c.city,
        name: c.suggestedName,
        abbreviation: abbr,
        primaryColor: c.primaryColor,
        secondaryColor: c.secondaryColor,
      } : f));
      setShowCityPicker(false);
    };

    const q = citySearch.toLowerCase();
    const filteredStatic = availableCities.staticCities.filter(
      c => c.city.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
        || c.suggestedName.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
    );
    const filteredFormer = availableCities.formerCities.filter(
      c => c.city.toLowerCase().includes(q) || c.formerName.toLowerCase().includes(q)
    );

    // ── City Picker sub-screen ─────────────────────────────────────────────
    if (showCityPicker) {
      return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-40">
          <PageHeader
            title="Select Market"
            sub={`Step 1 of 4 — Choose a city for${teamCount > 1 ? ` Team ${formPage + 1}` : ' your new franchise'}`}
            badge="Expansion Phase · Step 1"
          />

          {/* Multi-team tabs */}
          {teamCount > 1 && (
            <div className="flex gap-2 flex-wrap">
              {forms.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setFormPage(i)}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    formPage === i ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {f.name.trim() || `Team ${i + 1}`}
                  {f.name.trim() && f.city.trim() ? <span className="ml-1.5 text-emerald-400">✓</span> : null}
                </button>
              ))}
            </div>
          )}

          {/* Search bar */}
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={citySearch}
              onChange={e => setCitySearch(e.target.value)}
              placeholder="Search cities, states, or team names…"
              className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white font-semibold text-sm focus:outline-none focus:border-orange-500/60 placeholder:text-slate-600 transition-colors"
            />
            {citySearch && (
              <button onClick={() => setCitySearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Former league markets (dynamic — cities removed from the league) */}
          {filteredFormer.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-400">
                Former League Markets — Available Again
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredFormer.map(c => {
                  const ms = marketSizeLabel(c.marketSize);
                  return (
                    <button
                      key={c.city}
                      onClick={() => applyCity(c)}
                      className="group text-left bg-slate-900 border border-orange-500/20 hover:border-orange-500/50 rounded-2xl p-4 transition-all hover:bg-slate-800 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: c.primaryColor }} />
                      <div className="pl-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display font-black text-white text-base leading-tight">
                              {c.city}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                              Former {c.city} {c.formerName} market
                            </p>
                          </div>
                          <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/20">
                            Returned
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                          <span>{fmtPop(c.population)} pop.</span>
                          <span>·</span>
                          <span>{fmtFee(c.expansionFee)} fee</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${ms.cls}`}>
                            {ms.label}
                          </span>
                          <span className="text-[10px] text-slate-600">→ {c.suggestedName}</span>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          {c.suggestedNames.map(n => (
                            <span key={n} className="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-500">{n}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available expansion markets */}
          {filteredStatic.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">
                Available Expansion Markets — {filteredStatic.length} {filteredStatic.length === 1 ? 'city' : 'cities'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredStatic.map(c => {
                  const ms = marketSizeLabel(c.marketSize);
                  return (
                    <button
                      key={c.city}
                      onClick={() => applyCity(c)}
                      className="group text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 transition-all hover:bg-slate-800 relative overflow-hidden"
                    >
                      {c.highlight && (
                        <div className="absolute top-3 right-3">
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                            Strong Market
                          </span>
                        </div>
                      )}
                      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: c.primaryColor }} />
                      <div className="pl-3 space-y-2">
                        <div>
                          <p className="font-display font-black text-white text-base leading-tight pr-20">
                            {c.city}
                            {c.state && <span className="text-slate-500 font-bold text-sm ml-1.5">{c.state}</span>}
                          </p>
                          {c.country !== 'USA' && (
                            <p className="text-[10px] text-slate-600 font-semibold">{c.country}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                          <span>{fmtPop(c.population)} pop.</span>
                          <span>·</span>
                          <span className="font-bold text-slate-400">{fmtFee(c.expansionFee)} fee</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${ms.cls}`}>
                            {ms.label}
                          </span>
                          <span className="text-[10px] text-slate-500">{c.conf} · {c.div}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500">Suggested:</span>
                          <div className="flex gap-1 flex-wrap">
                            {c.suggestedNames.slice(0, 3).map((n, ni) => (
                              <span key={n} className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                                ni === 0 ? 'bg-orange-500/15 text-orange-400 font-bold' : 'bg-slate-800 text-slate-500'
                              }`}>{n}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-1.5 mt-0.5">
                          <div className="w-4 h-4 rounded-full border border-slate-700" style={{ backgroundColor: c.primaryColor }} />
                          <div className="w-4 h-4 rounded-full border border-slate-700" style={{ backgroundColor: c.secondaryColor }} />
                          <span className="text-[10px] text-slate-600 ml-1">Preset colors</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredStatic.length === 0 && filteredFormer.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center">
              <p className="text-slate-400 font-bold">No cities match "{citySearch}"</p>
              <p className="text-slate-600 text-sm mt-1">Try a different search or use Custom Entry below.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => updateLeague({ expansionDraft: undefined })}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold rounded-xl transition-all text-sm"
            >
              ← Cancel
            </button>
            <button
              onClick={() => setShowCityPicker(false)}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl transition-all text-sm"
            >
              Custom Entry →
            </button>
          </div>
        </div>
      );
    }

    // ── Team Details sub-screen (pre-filled, fully editable) ─────────────────
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-40">
        <PageHeader
          title="Team Details"
          sub={`Step 1 of 4 — Configure new franchise${teamCount > 1 ? 's' : ''}`}
          badge="Expansion Phase · Step 1"
        />

        {/* Multi-team tabs */}
        {teamCount > 1 && (
          <div className="flex gap-2 flex-wrap">
            {forms.map((f, i) => (
              <button
                key={i}
                onClick={() => setFormPage(i)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  formPage === i ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {f.name.trim() || `Team ${i + 1}`}
                {f.name.trim() && f.city.trim() ? <span className="ml-1.5 text-emerald-400">✓</span> : null}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-display font-bold uppercase text-white">
                {teamCount > 1 ? `Team ${formPage + 1} Details` : 'New Franchise Details'}
              </h3>
              <button
                onClick={() => setShowCityPicker(true)}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                </svg>
                Change City
              </button>
            </div>

            {form.city && (
              <div className="flex items-center gap-3 bg-orange-500/8 border border-orange-500/20 rounded-2xl px-4 py-3">
                <div className="w-3 h-3 rounded-full border-2 border-orange-500/50 shrink-0" style={{ backgroundColor: form.primaryColor }} />
                <div>
                  <p className="text-orange-300 font-black text-sm">{form.city}</p>
                  <p className="text-[10px] text-slate-500">Selected market · customize below</p>
                </div>
              </div>
            )}

            {[
              { key: 'name' as const,         label: 'Team Name',       placeholder: 'e.g. Raptors' },
              { key: 'city' as const,         label: 'City / Market',   placeholder: 'e.g. Las Vegas' },
              { key: 'abbreviation' as const, label: 'Abbreviation (3 letters)', placeholder: 'e.g. LVR' },
              { key: 'gmName' as const,       label: 'GM Name',         placeholder: 'e.g. Alex Rivera' },
              { key: 'logoUrl' as const,      label: 'Logo URL (optional)', placeholder: 'https://...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
                <input
                  type="text"
                  value={form[key]}
                  onChange={e => updateForm(key, key === 'abbreviation' ? e.target.value.toUpperCase().slice(0, 3) : e.target.value)}
                  placeholder={placeholder}
                  maxLength={key === 'abbreviation' ? 3 : 80}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-orange-500/60 placeholder:text-slate-700 transition-colors"
                />
              </div>
            ))}

            {/* Color pickers */}
            <div className="grid grid-cols-2 gap-4">
              {([
                ['primaryColor', 'Primary Color'],
                ['secondaryColor', 'Secondary Color'],
              ] as [keyof TeamForm, string][]).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
                  <div className="flex items-center gap-3 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2">
                    <input
                      type="color"
                      value={form[key]}
                      onChange={e => updateForm(key, e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="font-mono text-slate-400 text-xs uppercase">{form[key]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview badge */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-6">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">Live Preview</p>
            <div
              className="w-32 h-32 rounded-full flex items-center justify-center text-5xl font-display font-black border-4 shadow-2xl transition-all duration-300"
              style={{
                backgroundColor: form.primaryColor || '#1e293b',
                borderColor:     form.secondaryColor || '#f97316',
                color:           form.secondaryColor || '#f97316',
              }}
            >
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="logo" className="w-24 h-24 object-contain rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                (form.abbreviation || form.city.substring(0, 3) || '?').toUpperCase().substring(0, 3)
              )}
            </div>
            <div className="text-center">
              <p className="text-2xl font-display font-black text-white">{form.city || '—'}</p>
              <p className="text-lg font-display font-bold text-slate-400 uppercase tracking-widest">{form.name || '—'}</p>
              {form.gmName && <p className="text-xs text-slate-600 mt-1">GM: {form.gmName}</p>}
            </div>
            <div className="w-full border-t border-slate-800 pt-4 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Conference</p>
                <p className="text-xs font-bold text-slate-400 mt-0.5">
                  {availableCities.staticCities.find(c => c.city === form.city)?.conf
                    ?? availableCities.formerCities.find(c => c.city === form.city)?.conf
                    ?? 'Western'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Division</p>
                <p className="text-xs font-bold text-slate-400 mt-0.5">
                  {availableCities.staticCities.find(c => c.city === form.city)?.div
                    ?? availableCities.formerCities.find(c => c.city === form.city)?.div
                    ?? 'Pacific'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => updateLeague({ expansionDraft: undefined })}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold rounded-xl transition-all text-sm"
          >
            ← Cancel
          </button>
          <div className="flex gap-3">
            {teamCount > 1 && formPage < forms.length - 1 ? (
              <button
                onClick={() => setFormPage(p => p + 1)}
                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-display font-bold uppercase rounded-xl transition-all"
              >
                Next Team →
              </button>
            ) : (
              <button
                onClick={handleFinalizeSetup}
                disabled={!allValid}
                className="px-8 py-4 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-bold uppercase rounded-xl shadow-xl shadow-orange-500/20 active:scale-95 transition-all"
              >
                Finalize Setup →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 4: Protection phase
  // ══════════════════════════════════════════════════════════════════════════
  if (draftState.phase === 'protection') {
    const userRoster = [...(league.teams.find(t => t.id === league.userTeamId)?.roster ?? [])]
      .sort((a, b) => b.rating - a.rating);

    const canFinalize = maxProtected === 0 || protectedIds.length > 0;

    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-40">
        <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 blur-[100px] rounded-full -mr-40 -mt-40 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-orange-500 mb-2">Expansion Phase · Step 2</p>
              <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white">
                Protection <span className="text-orange-500">Phase</span>
              </h2>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">
                Protect up to {maxProtected} players · {protectedIds.length}/{maxProtected} selected
              </p>
            </div>
            <button
              onClick={handleConfirmProtection}
              disabled={!canFinalize}
              className="shrink-0 px-8 py-4 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-bold uppercase rounded-xl shadow-xl shadow-orange-500/20 active:scale-95 transition-all"
            >
              Lock In Protection →
            </button>
          </div>
          {/* Protection progress bar */}
          <div className="relative mt-5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all"
              style={{ width: maxProtected > 0 ? `${(protectedIds.length / maxProtected) * 100}%` : '0%' }}
            />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Protection list */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Your Roster</h3>
              <p className="text-[10px] text-slate-500 mt-1">Click to protect · Protected players are safe from the draft</p>
            </div>
            <div className="divide-y divide-slate-800/60 max-h-[560px] overflow-y-auto">
              {userRoster.map(p => {
                const isProtected = protectedIds.includes(p.id);
                const canAdd = !isProtected && protectedIds.length < maxProtected;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (isProtected) {
                        setProtectedIds(prev => prev.filter(id => id !== p.id));
                      } else if (canAdd) {
                        setProtectedIds(prev => [...prev, p.id]);
                      }
                    }}
                    className={`flex items-center justify-between px-5 py-3.5 cursor-pointer transition-all select-none ${
                      isProtected
                        ? 'bg-orange-500/10 hover:bg-orange-500/15'
                        : canAdd
                        ? 'hover:bg-slate-800/50'
                        : 'opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                        isProtected ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {p.position}
                      </div>
                      <div>
                        <p className="font-bold text-slate-200 text-sm">{p.name}</p>
                        <p className="text-[10px] text-slate-600 uppercase">Age {p.age} · {fmt(p.salary)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-display font-black ${ratingColor(p.rating)}`}>
                        {p.rating}
                      </span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isProtected ? 'border-orange-500 bg-orange-500' : 'border-slate-700'
                      }`}>
                        {isProtected && (
                          <svg className="w-3 h-3 text-slate-950" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rules + expansion teams preview */}
          <div className="space-y-5">
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.4em] text-orange-500">Expansion Draft Rules</h3>
              <ul className="space-y-3 text-sm text-slate-500 leading-relaxed">
                <li className="flex gap-2"><span className="text-orange-500">•</span> You may protect up to <strong className="text-slate-300">{maxProtected} players</strong> ({rules} rules).</li>
                <li className="flex gap-2"><span className="text-orange-500">•</span> All unprotected players enter the draft pool.</li>
                <li className="flex gap-2"><span className="text-orange-500">•</span> Each expansion team may select <strong className="text-slate-300">1 player</strong> per existing franchise.</li>
                <li className="flex gap-2"><span className="text-orange-500">•</span> Once one player is taken from your roster, the rest are safe.</li>
                <li className="flex gap-2"><span className="text-orange-500">•</span> Free agents are not eligible.</li>
                <li className="flex gap-2"><span className="text-orange-500">•</span> AI teams have already protected their top {maxProtected} players.</li>
              </ul>
            </div>

            {/* New franchises */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500">Incoming Franchises</h3>
              {draftState.expansionTeamIds.map(tid => {
                const team = league.teams.find(t => t.id === tid);
                const pending = draftState.pendingTeams?.find(pt => pt.id === tid);
                if (!team) return null;
                return (
                  <div key={tid} className="flex items-center gap-4 p-3 bg-slate-950 rounded-2xl border border-slate-800">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
                      style={{ backgroundColor: team.primaryColor || '#f97316', color: team.secondaryColor || '#1e293b' }}
                    >
                      {team.abbreviation}
                    </div>
                    <div>
                      <p className="font-bold text-slate-200 text-sm">{team.city} {team.name}</p>
                      {pending?.gmName && <p className="text-[10px] text-slate-600">GM: {pending.gmName}</p>}
                    </div>
                    <div className="ml-auto text-[10px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 px-2 py-1 rounded-lg">
                      Incoming
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 5: Draft phase + Completed
  // ══════════════════════════════════════════════════════════════════════════
  const totalPicks    = PICKS_PER_EXPANSION_TEAM * draftState.expansionTeamIds.length;
  const picksLeft     = Math.max(0, totalPicks - draftIdx);
  const isDraftDone   = draftState.phase === 'completed';
  const progressPct   = totalPicks > 0 ? Math.min(100, (draftIdx / totalPicks) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* Header */}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 blur-[100px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-orange-500 mb-2">
              Expansion Phase · {isDraftDone ? 'Complete' : 'Step 3'}
            </p>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white">
              Expansion <span className="text-orange-500">{isDraftDone ? 'Complete' : 'Draft'}</span>
            </h2>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">
              {isDraftDone
                ? `${totalPicks} picks made · New teams ready to join league`
                : `${picksLeft} picks remaining · ${draftIdx} picks made`}
            </p>
          </div>
          {!isDraftDone && (
            <button
              onClick={() => setIsAutoRunning(true)}
              disabled={isAutoRunning}
              className={`shrink-0 px-8 py-4 font-display font-bold uppercase rounded-xl shadow-xl active:scale-95 transition-all ${
                isAutoRunning
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-not-allowed animate-pulse'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              {isAutoRunning ? '⚡ Drafting...' : '▶ Start Live Draft'}
            </button>
          )}
          {isDraftDone && (
            <button
              onClick={handleFinalize}
              className="shrink-0 px-8 py-4 bg-white hover:bg-slate-100 text-slate-950 font-display font-bold uppercase rounded-xl shadow-xl active:scale-95 transition-all"
            >
              Finalize — Teams Join League →
            </button>
          )}
        </div>
        {/* Progress */}
        <div className="relative mt-5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Unprotected pool / expansion rosters */}
        <div className="lg:col-span-2 space-y-5">
          {/* Expansion team tabs */}
          {draftState.expansionTeamIds.length > 1 && (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveExpTeam(-1)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeExpTeam === -1 ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-500 hover:text-white border border-slate-800'}`}
              >
                Pool
              </button>
              {draftState.expansionTeamIds.map((tid, i) => {
                const team = league.teams.find(t => t.id === tid);
                return (
                  <button
                    key={tid}
                    onClick={() => setActiveExpTeam(i)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeExpTeam === i ? 'bg-orange-500 text-slate-950' : 'bg-slate-900 text-slate-500 hover:text-white border border-slate-800'}`}
                  >
                    {team?.abbreviation ?? `EXP ${i + 1}`} ({team?.roster.length ?? 0})
                  </button>
                );
              })}
            </div>
          )}

          {/* Pool table */}
          {(activeExpTeam === -1 || draftState.expansionTeamIds.length === 1) && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-slate-800">
                <h3 className="text-sm font-black uppercase tracking-widest text-white">
                  Unprotected Pool — {unprotectedPool.length} players
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/50 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Player</th>
                      <th className="px-4 py-3">From</th>
                      <th className="px-4 py-3 text-center">OVR</th>
                      <th className="px-4 py-3 text-right">Contract</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {unprotectedPool.map((p, idx) => (
                      <tr
                        key={p.id}
                        onClick={() => onScout(p)}
                        className="hover:bg-slate-800/30 transition-all cursor-pointer"
                      >
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-200 uppercase leading-tight">{p.name}</p>
                          <p className="text-[10px] text-slate-600 uppercase">{p.position} · {p.age}y</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-black uppercase text-slate-500">
                            {(p as any)._fromTeamName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-display font-black text-lg ${ratingColor(p.rating)}`}>{p.rating}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-mono text-slate-300 text-xs">{fmt(p.salary)}</p>
                          <p className="text-[10px] text-slate-600 uppercase">{p.contractYears}yr</p>
                        </td>
                      </tr>
                    ))}
                    {unprotectedPool.length === 0 && (
                      <tr><td colSpan={4} className="py-16 text-center text-slate-600 italic">Pool exhausted</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expansion team roster view */}
          {activeExpTeam >= 0 && activeExpTeam < draftState.expansionTeamIds.length && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              {(() => {
                const team = league.teams.find(t => t.id === draftState.expansionTeamIds[activeExpTeam]);
                const pending = draftState.pendingTeams?.find(pt => pt.id === draftState.expansionTeamIds[activeExpTeam]);
                return (
                  <>
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-4">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                        style={{ backgroundColor: team?.primaryColor || '#f97316', color: team?.secondaryColor || '#1e293b' }}
                      >
                        {team?.abbreviation}
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-white">
                          {team?.city} {team?.name}
                        </h3>
                        {pending?.gmName && <p className="text-[10px] text-slate-600">GM: {pending.gmName}</p>}
                      </div>
                      <span className="ml-auto text-xs font-bold text-slate-400">{team?.roster.length ?? 0} / {PICKS_PER_EXPANSION_TEAM} players</span>
                    </div>
                    <div className="divide-y divide-slate-800/40 max-h-[500px] overflow-y-auto">
                      {(team?.roster ?? []).map(p => (
                        <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 cursor-pointer" onClick={() => onScout(p)}>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-600 bg-slate-800 px-2 py-1 rounded-lg">{p.position}</span>
                            <div>
                              <p className="font-bold text-slate-200 text-sm">{p.name}</p>
                              <p className="text-[10px] text-slate-600">{(p as any)._fromTeamName ?? league.teams.find(t => t.id === p.lastTeamId)?.name ?? '—'}</p>
                            </div>
                          </div>
                          <span className={`font-display font-black text-lg ${ratingColor(p.rating)}`}>{p.rating}</span>
                        </div>
                      ))}
                      {(team?.roster.length ?? 0) === 0 && (
                        <p className="py-16 text-center text-slate-600 italic text-sm">No players drafted yet</p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Draft log */}
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col" style={{ maxHeight: 620 }}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500">Draft Log</h3>
              <span className="text-[10px] font-black text-slate-600">{draftState.draftLog.length} picks</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
              {draftState.draftLog.map((entry, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border text-xs leading-relaxed font-medium transition-all ${
                    i === 0 ? 'bg-orange-500/10 border-orange-500/30 text-orange-200' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {entry}
                </div>
              ))}
              {draftState.draftLog.length === 0 && (
                <p className="text-center text-slate-600 italic py-16 text-sm">Waiting to tip off expansion...</p>
              )}
            </div>
          </div>

          {/* Team summary cards (completed) */}
          {isDraftDone && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 px-1">Draft Summary</p>
              {draftState.expansionTeamIds.map(tid => {
                const team = league.teams.find(t => t.id === tid);
                if (!team) return null;
                const avgRating = team.roster.length > 0
                  ? Math.round(team.roster.reduce((s, p) => s + p.rating, 0) / team.roster.length)
                  : 0;
                return (
                  <div key={tid} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
                        style={{ backgroundColor: team.primaryColor, color: team.secondaryColor }}
                      >
                        {team.abbreviation}
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{team.name}</p>
                        <p className="text-[10px] text-slate-600">{team.roster.length} players · Avg OVR {avgRating}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[...team.roster].sort((a, b) => b.rating - a.rating).slice(0, 5).map(p => (
                        <span key={p.id} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-lg font-bold">
                          {p.name.split(' ')[1] || p.name} <span className={ratingColor(p.rating)}>{p.rating}</span>
                        </span>
                      ))}
                      {team.roster.length > 5 && (
                        <span className="text-[10px] text-slate-600 px-2 py-0.5">+{team.roster.length - 5} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Expansion;
