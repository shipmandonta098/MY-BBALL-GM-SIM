
import React, { useState, useMemo } from 'react';
import { LeagueState, LeagueSettings, Player } from '../types';
import { getHistoricalFinancials } from '../constants';
import { fmtSalary } from '../utils/formatters';
import { useTheme, type Theme } from '../context/ThemeContext';
import NumericInput from './NumericInput';

interface SettingsProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onRegenerateSchedule?: () => Promise<boolean>;
}

type SettingsTab = 'league' | 'gameplay' | 'sliders' | 'simulation' | 'godmode' | 'appearance' | 'data';

interface ChangeEntry {
  field: string;
  label: string;
  oldVal: string;
  newVal: string;
  ts: number;
}

interface Preset {
  name: string;
  settings: Partial<LeagueSettings>;
  builtIn?: boolean;
}

const DEFAULT_SETTINGS: Partial<LeagueSettings> = {
  playoffFormat: 16, playoffSeeding: 'Conference', playInTournament: true, homeCourt: true,
  tradeDeadline: 'Week 14', hardCapAtDeadline: false,
  divisionGames: 16, conferenceGames: 36, tradeDeadlineFraction: 0.6,
  splitByConference: true, guaranteedPerDivision: 0, reseedRounds: false,
  ownerPatienceLevel: 'Medium', luxuryTaxMultiplier: 1.5,
  budgetThreshold: false, tradeSalaryMatchPct: 125,
  minPayroll: 46_650_000, luxuryTaxThreshold: 84_750_000, salaryCapType: 'Soft Cap',
  pick1SalaryPct: 25, roundsAboveMin: 1, rookieContractLengths: [3, 2], canRefuseAfterRookie: false,
  maxContractYears: 5, rookieScaleContracts: true, maxPlayerSalaryPct: 35, birdRights: true,
  draftRounds: 2, draftClassSize: 'Normal', internationalProspects: true, draftLottery: true,
  minRosterSize: 10, maxRosterSize: 18,
  draftType: 'NBA 1994', customLotterySelections: 4,
  customLotteryChances: [140,140,140,125,105,90,75,60,45,30,20,15,10,5,5],
  tradableDraftPickSeasons: 4, prospectAgeMin: 19, prospectAgeMax: 22,
  scheduledExpansion: 'Off', expansionTeamCount: 1, expansionDraftRules: 'Standard',
  fatigueImpact: 'Medium', b2bPenalty: 'Mild', loadManagement: true, b2bFatigueEnabled: true,
  injuryDuration: 'Realistic', practiceInjuries: false, careerEndingInjuries: true,
  teamChemistry: true, chemistryImpact: 'Medium', personalityClashPenalties: true,
  playerMorale: true, moraleAffectsAttributes: true, tradeRequestThreshold: 'Medium',
  pbpDetailLevel: 'Full', aiDecisionSpeed: 'Normal',
  blowoutFrequency: 'Realistic', comebackFrequency: 'Realistic', overtimeFrequency: 'Realistic', upsetFrequency: 'Realistic',
  globalPaceOverride: 0, shotClockLength: 24, scoringEra: 'Modern',
  threePtFrequency: 'Medium', simBlockFrequency: 'Medium', turnoverFrequency: 'Medium',
  sliderLayup: 50, sliderMidRange: 50, slider3pt: 50, sliderFreeThrow: 50,
  sliderFastBreak: 50, sliderPostUp: 50, sliderPickRoll: 50,
  sliderSteal: 50, sliderBlock: 50, sliderFoul: 50, sliderHelpDefense: 50, sliderPerimeterDefense: 50,
  sliderTimeout: 50, sliderSubstitution: 50, sliderTechFoul: 50, sliderFlagrantFoul: 50, sliderInjuryMultiplier: 50,
  editAnyPlayer: false, editAnyTeam: false, forceGameOutcomes: false,
  manipulateStandings: false, freeAgentMarketControl: false, draftClassEditor: false,
};

const BUILT_IN_PRESETS: Preset[] = [
  {
    builtIn: true,
    name: 'Realistic Sim',
    settings: {
      ...DEFAULT_SETTINGS,
      difficulty: 'Pro', fatigueImpact: 'High', b2bPenalty: 'Severe',
      injuryFrequency: 'Medium', injuryDuration: 'Realistic', careerEndingInjuries: true,
      teamChemistry: true, playerMorale: true, tradeDifficulty: 'Realistic',
      blowoutFrequency: 'Realistic', comebackFrequency: 'Realistic',
      pbpDetailLevel: 'Full', scoringEra: 'Modern',
    },
  },
  {
    builtIn: true,
    name: 'Arcade Mode',
    settings: {
      ...DEFAULT_SETTINGS,
      difficulty: 'Rookie', fatigueImpact: 'None', b2bPenalty: 'None', b2bFatigueEnabled: false,
      injuryFrequency: 'Low', careerEndingInjuries: false, practiceInjuries: false,
      teamChemistry: false, playerMorale: false,
      blowoutFrequency: 'Low', comebackFrequency: 'High',
      threePtFrequency: 'Very High', scoringEra: 'Run & Gun',
      tradeDifficulty: 'Easy', sliderFastBreak: 80, slider3pt: 70,
    },
  },
  {
    builtIn: true,
    name: 'Pure Rebuild Challenge',
    settings: {
      ...DEFAULT_SETTINGS,
      difficulty: 'Legend', fatigueImpact: 'High', b2bPenalty: 'Severe',
      injuryFrequency: 'High', injuryDuration: 'Long', careerEndingInjuries: true,
      tradeDifficulty: 'Hard', tradeDeadline: 'Week 12', hardCapAtDeadline: true,
      salaryCap: 100000000, luxuryTaxLine: 110000000,
      teamChemistry: true, playerMorale: true, personalityClashPenalties: true,
      draftLottery: true, rookieScaleContracts: true,
    },
  },
  {
    builtIn: true,
    name: 'Commissioner Mode',
    settings: {
      ...DEFAULT_SETTINGS,
      godMode: true, editAnyPlayer: true, editAnyTeam: true,
      forceGameOutcomes: true, manipulateStandings: true,
      freeAgentMarketControl: true, draftClassEditor: true,
      fatigueImpact: 'None', injuryFrequency: 'Low', careerEndingInjuries: false,
      tradeDifficulty: 'Easy', playerMorale: false, teamChemistry: false,
    },
  },
];

// ─── Search registry: every setting label + its tab ──────────────────────────
const SEARCH_INDEX: { tab: SettingsTab; label: string }[] = [
  // League
  { tab: 'league', label: 'Franchise Name' }, { tab: 'league', label: 'Owner Patience Meter' },
  { tab: 'league', label: 'Salary Cap' }, { tab: 'league', label: 'Luxury Tax Line' },
  { tab: 'league', label: 'Playoff Format' }, { tab: 'league', label: 'Playoff Seeding' },
  { tab: 'league', label: 'Play-in Tournament' }, { tab: 'league', label: 'Home Court Advantage' },
  { tab: 'league', label: 'Trade Deadline' }, { tab: 'league', label: 'Hard Cap at Deadline' },
  { tab: 'league', label: 'Max Contract Years' }, { tab: 'league', label: 'Rookie Scale Contracts' },
  { tab: 'league', label: 'Max Player Salary %' }, { tab: 'league', label: 'Bird Rights' },
  { tab: 'league', label: 'Draft Rounds' }, { tab: 'league', label: 'Draft Class Size' },
  { tab: 'league', label: 'International Prospects' }, { tab: 'league', label: 'Draft Lottery' },
  { tab: 'league', label: 'Min Roster Size' }, { tab: 'league', label: 'Max Roster Size' },
  { tab: 'league', label: 'Draft Type' }, { tab: 'league', label: 'Custom Lottery Selections' },
  { tab: 'league', label: 'Custom Lottery Chances' }, { tab: 'league', label: 'Tradable Draft Pick Seasons' },
  { tab: 'league', label: 'Prospect Age Min' }, { tab: 'league', label: 'Prospect Age Max' },
  { tab: 'league', label: 'Expansion Draft Rules' },
  { tab: 'league', label: 'Division Games' }, { tab: 'league', label: 'Conference Games' },
  { tab: 'league', label: 'Trade Deadline Fraction' }, { tab: 'league', label: 'Split By Conference' },
  { tab: 'league', label: 'Guaranteed Per Division' }, { tab: 'league', label: 'Reseed Rounds' },
  { tab: 'league', label: 'Owner Patience Level' }, { tab: 'league', label: 'Luxury Tax Multiplier' },
  { tab: 'league', label: 'Budget Threshold' }, { tab: 'league', label: 'Trade Salary Match %' },
  { tab: 'league', label: 'Minimum Payroll' }, { tab: 'league', label: 'Luxury Tax Threshold' },
  { tab: 'league', label: 'Salary Cap Type' },
  { tab: 'league', label: 'Rookie Salary Scale' }, { tab: 'league', label: '#1 Pick Salary %' },
  { tab: 'league', label: 'Rounds With >Min Contracts' }, { tab: 'league', label: 'Rookie Contract Lengths' },
  { tab: 'league', label: 'Can Refuse After Rookie Contract' },
  // Gameplay
  { tab: 'gameplay', label: 'Fatigue Impact' }, { tab: 'gameplay', label: 'Back-to-Back Penalty' },
  { tab: 'gameplay', label: 'Load Management' }, { tab: 'gameplay', label: 'Injury Frequency' },
  { tab: 'gameplay', label: 'Injury Duration' }, { tab: 'gameplay', label: 'Practice Injuries' },
  { tab: 'gameplay', label: 'Career-Ending Injuries' }, { tab: 'gameplay', label: 'Team Chemistry' },
  { tab: 'gameplay', label: 'Chemistry Impact' }, { tab: 'gameplay', label: 'Personality Clash Penalties' },
  { tab: 'gameplay', label: 'Player Morale' }, { tab: 'gameplay', label: 'Morale Affects Attributes' },
  { tab: 'gameplay', label: 'Trade Request Threshold' }, { tab: 'gameplay', label: 'Trade Realism' },
  { tab: 'gameplay', label: 'Simulation Engine Mode' },
  { tab: 'league', label: 'Games Per Season' },
  // Sliders
  { tab: 'sliders', label: 'Overall Difficulty' }, { tab: 'sliders', label: 'Rookie Progression Speed' },
  { tab: 'sliders', label: 'Veteran Attribute Decline' },
  { tab: 'sliders', label: 'Layup Success Rate' }, { tab: 'sliders', label: 'Mid-Range Success Rate' },
  { tab: 'sliders', label: '3PT Success Rate' }, { tab: 'sliders', label: 'Free Throw Success Rate' },
  { tab: 'sliders', label: 'Fast Break Frequency' }, { tab: 'sliders', label: 'Post Up Frequency' },
  { tab: 'sliders', label: 'Pick and Roll Frequency' }, { tab: 'sliders', label: 'Steal Frequency' },
  { tab: 'sliders', label: 'Block Frequency (Slider)' }, { tab: 'sliders', label: 'Foul Frequency' },
  { tab: 'sliders', label: 'Help Defense Effectiveness' }, { tab: 'sliders', label: 'Perimeter Defense' },
  { tab: 'sliders', label: 'Timeout Frequency' }, { tab: 'sliders', label: 'Substitution Frequency' },
  { tab: 'sliders', label: 'Technical Foul Frequency' }, { tab: 'sliders', label: 'Flagrant Foul Frequency' },
  { tab: 'sliders', label: 'Injury Probability Multiplier' },
  // Simulation
  { tab: 'simulation', label: 'PBP Detail Level' }, { tab: 'simulation', label: 'AI Decision Speed' },
  { tab: 'simulation', label: 'Blowout Frequency' }, { tab: 'simulation', label: 'Comeback Frequency' },
  { tab: 'simulation', label: 'Overtime Frequency' }, { tab: 'simulation', label: 'Global Pace Override' },
  { tab: 'simulation', label: 'Shot Clock Length' }, { tab: 'simulation', label: 'Scoring Era' },
  { tab: 'simulation', label: '3PT Frequency' }, { tab: 'simulation', label: 'Block Frequency' },
  { tab: 'simulation', label: 'Turnover Frequency' },
  // God Mode
  { tab: 'godmode', label: 'God Mode' }, { tab: 'godmode', label: 'Edit Any Player' },
  { tab: 'godmode', label: 'Edit Any Team' }, { tab: 'godmode', label: 'Force Game Outcomes' },
  { tab: 'godmode', label: 'Manipulate Standings' }, { tab: 'godmode', label: 'Free Agent Market Control' },
  { tab: 'godmode', label: 'Draft Class Editor' }, { tab: 'godmode', label: 'Time Travel' },
];

const TAB_LABELS: Record<SettingsTab, string> = {
  league: 'League', gameplay: 'Gameplay', sliders: 'Sliders',
  simulation: 'Simulation', godmode: 'God Mode', appearance: 'Appearance',
  data: 'Save Data',
};

const Settings: React.FC<SettingsProps> = ({ league, updateLeague, onRegenerateSchedule }) => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('league');
  const [searchQuery, setSearchQuery] = useState('');
  const [changeLog, setChangeLog]     = useState<ChangeEntry[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showChangeLog, setShowChangeLog]           = useState(false);
  const [resetConfirm, setResetConfirm]             = useState<'tab' | 'all' | null>(null);
  const [showSavePreset, setShowSavePreset]         = useState(false);
  const [presetName, setPresetName]                 = useState('');
  const [regenConfirm, setRegenConfirm]             = useState(false);
  const [regenSuccess, setRegenSuccess]             = useState(false);
  const [regenError, setRegenError]                 = useState(false);
  const [regenLoading, setRegenLoading]             = useState(false);
  // Data management
  const [dataConfirm, setDataConfirm] = useState<{ label: string; detail: string; onConfirm: () => void } | null>(null);
  const [dataSuccess, setDataSuccess] = useState<string | null>(null);
  const [trimSeasons, setTrimSeasons] = useState<number>(5);

  const updateSettings = (updates: Partial<LeagueSettings>, label = '') => {
    const entries: ChangeEntry[] = Object.entries(updates).map(([k, v]) => ({
      field: k, label: label || k,
      oldVal: String((league.settings as Record<string, unknown>)[k] ?? ''),
      newVal: String(v), ts: Date.now(),
    }));
    setChangeLog(prev => [...entries, ...prev].slice(0, 50));
    updateLeague({ settings: { ...league.settings, ...updates } });
  };

  // ── Data management helpers ───────────────────────────────────────────────

  const showSuccess = (msg: string) => {
    setDataSuccess(msg);
    setTimeout(() => setDataSuccess(null), 3500);
  };

  const confirmAction = (label: string, detail: string, onConfirm: () => void) => {
    setDataConfirm({ label, detail, onConfirm });
  };

  const handleExportSave = () => {
    const blob = new Blob([JSON.stringify(league, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${league.leagueName.replace(/\s+/g, '_')}_S${league.season}_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Save exported successfully.');
  };

  const handleTrimOldData = () => {
    const cutoff = league.season - trimSeasons;
    const trimmedFeed = (league.newsFeed ?? []).filter(
      n => !n.seasonYear || n.seasonYear > cutoff
    );
    // Strip play-by-play from all schedule games (biggest per-game data blob)
    const trimmedSchedule = (league.schedule ?? []).map(g =>
      g.result ? { ...g, result: { ...g.result, playByPlay: undefined } } : g
    );
    const trimmedPreseason = (league.preseasonHistory ?? []).map(g =>
      g.result ? { ...g, result: { ...g.result, playByPlay: undefined } } : g
    );
    // Trim transactions: keep last 500 (plenty for recent activity)
    const trimmedTx = (league.transactions ?? []).slice(0, 500);
    updateLeague({
      newsFeed: trimmedFeed,
      schedule: trimmedSchedule,
      preseasonHistory: trimmedPreseason as any,
      transactions: trimmedTx,
    });
    showSuccess(`Purged data from seasons before ${cutoff + 1}. PBP logs cleared.`);
  };

  const handleClearFeed = () => {
    updateLeague({ newsFeed: [] });
    showSuccess('Dynasty Feed cleared.');
  };

  const handleClearTransactions = () => {
    updateLeague({ transactions: [] });
    showSuccess('Transaction log cleared.');
  };

  const handleClearPBP = () => {
    const cleaned = (league.schedule ?? []).map(g =>
      g.result ? { ...g, result: { ...g.result, playByPlay: undefined } } : g
    );
    const cleanedPre = (league.preseasonHistory ?? []).map(g =>
      g.result ? { ...g, result: { ...g.result, playByPlay: undefined } } : g
    );
    updateLeague({ schedule: cleaned, preseasonHistory: cleanedPre as any });
    showSuccess('Play-by-play logs cleared from all game records.');
  };

  // Estimate save size
  const estimatedKB = Math.round(JSON.stringify(league).length / 1024);
  const newsCount = (league.newsFeed ?? []).length;
  const txCount = (league.transactions ?? []).length;
  const pbpGames = (league.schedule ?? []).filter(g => g.result?.playByPlay && g.result.playByPlay.length > 0).length;

  const s = league.settings;
  const inSeason = !league.isOffseason;
  // Show the regenerate section when: in-season (preseason) OR offseason with draft complete.
  // This covers both first-season preseason and second-season post-FA state.
  const canShowRegen = !!onRegenerateSchedule && (!league.isOffseason || league.draftPhase === 'completed');
  // Locked only when a season is actively IN-PROGRESS (some but not all games played).
  // If all previous-season games are played (carry-over schedule) or none played yet
  // (fresh preseason), allow regeneration.
  const playedCount = league.schedule.filter(g => g.played).length;
  const anyGamePlayed = playedCount > 0 && playedCount < league.schedule.length;

  // ── Locked mid-season field wrapper ──────────────────────────────────────
  const LockedField: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="relative">
      <div className="pointer-events-none opacity-40 select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="flex items-center gap-1.5 bg-slate-900/95 border border-slate-700 rounded-xl px-3 py-1.5 shadow-lg">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Locked until next offseason</span>
        </div>
      </div>
    </div>
  );

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  const applyPreset = (preset: Preset) => {
    const merged = { ...league.settings, ...preset.settings } as LeagueSettings;
    updateLeague({ settings: merged });
  };

  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) return;
    setCustomPresets(prev => [...prev, { name: presetName.trim(), settings: { ...league.settings } }]);
    setPresetName('');
    setShowSavePreset(false);
  };

  const resetTab = () => {
    const tabDefaults: Partial<LeagueSettings> = {};
    const tabMap: Record<SettingsTab, (keyof typeof DEFAULT_SETTINGS)[]> = {
      league:     ['playoffFormat','playoffSeeding','playInTournament','homeCourt','tradeDeadline','hardCapAtDeadline','maxContractYears','rookieScaleContracts','maxPlayerSalaryPct','birdRights','draftRounds','draftClassSize','internationalProspects','draftLottery','scheduledExpansion','expansionDraftRules','divisionGames','conferenceGames','tradeDeadlineFraction','splitByConference','guaranteedPerDivision','reseedRounds','ownerPatienceLevel','luxuryTaxMultiplier','budgetThreshold','tradeSalaryMatchPct','seasonLength','minRosterSize','maxRosterSize','draftType','customLotterySelections','tradableDraftPickSeasons','prospectAgeMin','prospectAgeMax','minPayroll','luxuryTaxThreshold','salaryCapType','pick1SalaryPct','roundsAboveMin','canRefuseAfterRookie'],
      gameplay:   ['fatigueImpact','b2bPenalty','loadManagement','b2bFatigueEnabled','injuryDuration','practiceInjuries','careerEndingInjuries','teamChemistry','chemistryImpact','personalityClashPenalties','playerMorale','moraleAffectsAttributes','tradeRequestThreshold'],
      sliders:    ['sliderLayup','sliderMidRange','slider3pt','sliderFreeThrow','sliderFastBreak','sliderPostUp','sliderPickRoll','sliderSteal','sliderBlock','sliderFoul','sliderHelpDefense','sliderPerimeterDefense','sliderTimeout','sliderSubstitution','sliderTechFoul','sliderFlagrantFoul','sliderInjuryMultiplier'],
      simulation: ['pbpDetailLevel','aiDecisionSpeed','blowoutFrequency','comebackFrequency','overtimeFrequency','upsetFrequency','globalPaceOverride','shotClockLength','scoringEra','threePtFrequency','simBlockFrequency','turnoverFrequency','wnbaStatRealism','singleYearSeason'],
      godmode:    ['editAnyPlayer','editAnyTeam','forceGameOutcomes','manipulateStandings','freeAgentMarketControl','draftClassEditor'],
    };
    for (const k of tabMap[activeTab]) {
      (tabDefaults as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
    }
    updateSettings(tabDefaults, `Reset ${TAB_LABELS[activeTab]} tab`);
    setResetConfirm(null);
  };

  const resetAll = () => {
    const full = { ...league.settings, ...DEFAULT_SETTINGS } as LeagueSettings;
    updateLeague({ settings: full });
    setChangeLog(prev => [{ field: 'ALL', label: 'Reset All Settings', oldVal: '', newVal: 'defaults', ts: Date.now() }, ...prev]);
    setResetConfirm(null);
  };

  const handleRegen = async () => {
    setRegenConfirm(false);
    setRegenLoading(true);
    setRegenError(false);
    setRegenSuccess(false);
    try {
      const ok = await onRegenerateSchedule?.();
      if (ok === false) {
        setRegenError(true);
        setTimeout(() => setRegenError(false), 5000);
      } else {
        setRegenSuccess(true);
        setTimeout(() => setRegenSuccess(false), 4000);
      }
    } catch (err) {
      console.error('Schedule regeneration failed:', err);
      setRegenError(true);
      setTimeout(() => setRegenError(false), 5000);
    } finally {
      setRegenLoading(false);
    }
  };

  // ── Cross-tab search ──────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return null;
    const q = searchQuery.toLowerCase();
    return SEARCH_INDEX.filter(item => item.label.toLowerCase().includes(q));
  }, [searchQuery]);

  const formatMoney = fmtSalary;

  // ── Helper UI components ──────────────────────────────────────────────────
  const TabButton = ({ id, label }: { id: SettingsTab; label: string }) => (
    <button
      onClick={() => { setActiveTab(id); setSearchQuery(''); }}
      className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === id ? 'bg-amber-500 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
    >
      {label}
    </button>
  );

  const SectionHeader = ({ title, sub }: { title: string; sub?: string }) => (
    <div className="md:col-span-2 bg-slate-800/60 border border-slate-700 p-4 rounded-2xl mt-2">
      <h4 className="text-amber-400 font-display font-bold uppercase tracking-widest text-sm">{title}</h4>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5 tracking-wide">{sub}</p>}
    </div>
  );

  const SliderField = ({ label, value, min, max, onChange, step = 1, unit = '' }: {
    label: string; value: number; min: number; max: number;
    onChange: (v: number) => void; step?: number; unit?: string;
  }) => (
    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
        <span className="text-amber-500 font-display font-bold text-xl">{unit === '$' ? formatMoney(value) : `${value}${unit}`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
    </div>
  );

  const ToggleField = ({ label, value, onChange, disabled = false }: {
    label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
  }) => (
    <div className={`flex items-center justify-between bg-slate-950/40 p-5 rounded-2xl border border-slate-800 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
      <button onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${value ? 'bg-amber-500' : 'bg-slate-700'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  const SelectField = ({ label, value, options, onChange }: {
    label: string; value: string | number; options: (string | number)[];
    onChange: (v: string) => void;
  }) => (
    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const ButtonField = ({ label, options, value, onChange }: {
    label: string; options: (string | number)[]; value: string | number;
    onChange: (v: string) => void;
  }) => (
    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
      <div className="flex gap-2 flex-wrap">
        {options.map(o => (
          <button key={o} onClick={() => onChange(String(o))}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all min-w-[60px] ${String(value) === String(o) ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-500 hover:text-white'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );

  const NumberInputField = ({ label, value, min, max, onChange, unit = '', placeholder = '' }: {
    label: string; value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; unit?: string; placeholder?: string;
  }) => (
    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
        {unit && <span className="text-xs text-slate-500 font-bold">{unit}</span>}
      </div>
      <NumericInput
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-amber-400 font-display font-bold text-xl focus:outline-none focus:border-amber-500/50"
      />
    </div>
  );

  const GodToggle = ({ label, field }: { label: string; field: keyof LeagueSettings }) => (
    <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${s[field] ? 'bg-rose-500/10 border-rose-500/40' : 'bg-slate-950/40 border-slate-800'}`}>
      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
      <button onClick={() => updateSettings({ [field]: !s[field] } as Partial<LeagueSettings>, label)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s[field] ? 'bg-rose-500' : 'bg-slate-700'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s[field] ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  const handleExportLeagueStats = () => {
    const gp = (p: Player) => Math.max(1, p.stats.gamesPlayed);
    const pct = (m: number, a: number) => a > 0 ? +(m / a * 100).toFixed(1) : 0;

    const standings = [...league.teams]
      .sort((a, b) => b.wins - a.wins)
      .map((t, i) => ({
        rank: i + 1,
        team: `${t.city} ${t.name}`,
        abbreviation: t.abbreviation,
        conference: t.conference,
        wins: t.wins,
        losses: t.losses,
        winPct: +((t.wins / Math.max(1, t.wins + t.losses)) * 100).toFixed(1),
        capSpaceM: +((t.salaryCap ?? 136_000_000) - t.roster.reduce((s, p) => s + p.salary, 0)).toFixed(0),
      }));

    const playerStats = league.teams.flatMap(t =>
      t.roster.map(p => ({
        name: p.name,
        team: t.abbreviation,
        position: p.position,
        age: p.age,
        gamesPlayed: p.stats.gamesPlayed,
        ppg: +(p.stats.points / gp(p)).toFixed(1),
        rpg: +(p.stats.rebounds / gp(p)).toFixed(1),
        apg: +(p.stats.assists / gp(p)).toFixed(1),
        spg: +(p.stats.steals / gp(p)).toFixed(1),
        bpg: +(p.stats.blocks / gp(p)).toFixed(1),
        fgPct: pct(p.stats.fgm, p.stats.fga),
        threePct: pct(p.stats.threepm, p.stats.threepa),
        ftPct: pct(p.stats.ftm, p.stats.fta),
        mpg: +(p.stats.minutes / gp(p)).toFixed(1),
        rating: p.rating,
        salary: p.salary,
        careerGames: p.careerStats.reduce((s, cs) => s + (cs.gamesPlayed ?? 0), 0),
        careerPoints: p.careerStats.reduce((s, cs) => s + (cs.points ?? 0), 0),
        seasonsPlayed: p.careerStats.length,
      }))
    );

    const leagueLeaders = {
      scoring: [...playerStats].sort((a, b) => b.ppg - a.ppg).slice(0, 10),
      rebounds: [...playerStats].sort((a, b) => b.rpg - a.rpg).slice(0, 10),
      assists: [...playerStats].sort((a, b) => b.apg - a.apg).slice(0, 10),
      steals: [...playerStats].sort((a, b) => b.spg - a.spg).slice(0, 10),
      blocks: [...playerStats].sort((a, b) => b.bpg - a.bpg).slice(0, 10),
      fieldGoalPct: [...playerStats].filter(p => p.gamesPlayed >= 10).sort((a, b) => b.fgPct - a.fgPct).slice(0, 10),
    };

    const teamStats = league.teams.map(t => {
      const gamesPlayed = t.wins + t.losses;
      const totals = t.roster.reduce((acc, p) => ({
        pts: acc.pts + p.stats.points,
        reb: acc.reb + p.stats.rebounds,
        ast: acc.ast + p.stats.assists,
        stl: acc.stl + p.stats.steals,
        blk: acc.blk + p.stats.blocks,
        fgm: acc.fgm + p.stats.fgm,
        fga: acc.fga + p.stats.fga,
        tpm: acc.tpm + p.stats.threepm,
        tpa: acc.tpa + p.stats.threepa,
      }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 });
      const div = Math.max(1, gamesPlayed);
      return {
        team: `${t.city} ${t.name}`,
        abbreviation: t.abbreviation,
        gamesPlayed,
        wins: t.wins,
        losses: t.losses,
        ppg: +(totals.pts / div).toFixed(1),
        rpg: +(totals.reb / div).toFixed(1),
        apg: +(totals.ast / div).toFixed(1),
        spg: +(totals.stl / div).toFixed(1),
        bpg: +(totals.blk / div).toFixed(1),
        fgPct: pct(totals.fgm, totals.fga),
        threePct: pct(totals.tpm, totals.tpa),
        avgRosterOvr: t.roster.length > 0 ? Math.round(t.roster.reduce((s, p) => s + p.rating, 0) / t.roster.length) : 0,
        payrollM: +(t.roster.reduce((s, p) => s + p.salary, 0) / 1_000_000).toFixed(2),
      };
    });

    const awardsHistory = (league.awardsHistory ?? []).map(a => ({
      year: a.year,
      mvp: a.mvp?.name,
      mvpTeam: a.mvp?.teamName,
      dpoy: a.dpoy?.name,
      roy: a.roy?.name,
      sixthMan: a.sixthMan?.name,
      mip: a.mip?.name,
      coy: a.coy?.name,
    }));

    const exportData = {
      exportedAt: new Date().toISOString(),
      leagueName: league.leagueName,
      season: league.season,
      standings,
      teamStats,
      playerStats: playerStats.sort((a, b) => b.ppg - a.ppg),
      leagueLeaders,
      awardsHistory,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${league.leagueName.replace(/\s+/g, '_')}_S${league.season}_stats.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess(`League stats exported — Season ${league.season} (${playerStats.length} players, ${league.teams.length} teams).`);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(league, null, 2);
    const uri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const a = document.createElement('a');
    a.setAttribute('href', uri);
    a.setAttribute('download', `${league.leagueName.replace(/\s+/g, '_')}_full_save.json`);
    a.click();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-40 max-w-6xl mx-auto">

      {/* ── Mid-season lock notice ── */}
      {inSeason && (
        <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700 rounded-2xl px-5 py-3">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Season in progress — some settings are locked until the next offseason.
            <span className="text-slate-600 ml-2 normal-case font-normal tracking-normal">Changeable: Difficulty, Injuries, God Mode, Trade Realism, Advanced Stats.</span>
          </p>
        </div>
      )}


      {/* ── Header ── */}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40" />
        <div className="relative z-10 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white">
              League <span className="text-amber-500">Settings</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {(['league','gameplay','sliders','simulation','godmode','appearance','data'] as SettingsTab[]).map(id => (
                <React.Fragment key={id}><TabButton id={id} label={TAB_LABELS[id]} /></React.Fragment>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search all settings..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500/50" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>
            )}
          </div>

          {/* Preset bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest mr-1">Presets:</span>
            {allPresets.map(p => (
              <button key={p.name} onClick={() => applyPreset(p)}
                className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 hover:bg-amber-500/20 hover:text-amber-400 transition-all border border-slate-700">
                {p.name}
              </button>
            ))}
            <button onClick={() => setShowSavePreset(v => !v)}
              className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all">
              + Save Current
            </button>
          </div>

          {/* Save preset input */}
          {showSavePreset && (
            <div className="flex gap-2 animate-in slide-in-from-top-1">
              <input type="text" placeholder="Preset name..." value={presetName}
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveCurrentAsPreset()}
                className="flex-1 bg-slate-950 border border-amber-500/30 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none" />
              <button onClick={saveCurrentAsPreset}
                className="px-5 py-2.5 bg-amber-500 text-slate-950 rounded-xl text-[10px] font-black uppercase">Save</button>
            </div>
          )}

          {/* QoL buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => setResetConfirm('tab')}
              className="px-4 py-2 rounded-xl text-[9px] font-black uppercase text-slate-500 bg-slate-800 hover:text-amber-400 hover:bg-slate-700 transition-all border border-slate-700">
              Reset {TAB_LABELS[activeTab]} Tab
            </button>
            <button onClick={() => setResetConfirm('all')}
              className="px-4 py-2 rounded-xl text-[9px] font-black uppercase text-slate-500 bg-slate-800 hover:text-rose-400 hover:bg-slate-700 transition-all border border-slate-700">
              Reset All Defaults
            </button>
            <button onClick={() => setShowChangeLog(v => !v)}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all border ${showChangeLog ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-slate-500 bg-slate-800 hover:text-white border-slate-700'}`}>
              Change Log ({changeLog.length})
            </button>
          </div>
        </div>
      </header>

      {/* ── Reset confirm dialog ── */}
      {resetConfirm && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-5 flex items-center justify-between gap-4 animate-in slide-in-from-top-1">
          <p className="text-sm text-rose-300 font-bold">
            {resetConfirm === 'tab'
              ? `Reset ${TAB_LABELS[activeTab]} tab to defaults?`
              : 'Reset ALL settings to defaults? This cannot be undone.'}
          </p>
          <div className="flex gap-2">
            <button onClick={resetConfirm === 'tab' ? resetTab : resetAll}
              className="px-5 py-2 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase">Confirm</button>
            <button onClick={() => setResetConfirm(null)}
              className="px-5 py-2 bg-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Regen schedule confirm dialog ── */}
      {regenConfirm && (
        <div className="bg-amber-950/60 border border-amber-500/40 rounded-2xl p-5 flex items-center justify-between gap-4 animate-in slide-in-from-top-1">
          <div>
            <p className="text-sm text-amber-300 font-bold">Regenerate the full season schedule?</p>
            <p className="text-xs text-amber-500/70 mt-1">All unplayed games will be reshuffled. This cannot be undone.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={handleRegen}
              className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl text-[10px] font-black uppercase">Confirm</button>
            <button onClick={() => setRegenConfirm(false)}
              className="px-5 py-2 bg-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase">Cancel</button>
          </div>
        </div>
      )}

      {regenSuccess && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top-1">
          <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="text-sm text-emerald-300 font-bold">Schedule regenerated!</p>
            <p className="text-xs text-emerald-500/70 mt-0.5">A new {league.schedule.length}-game schedule has been generated and saved. Navigate to the Schedule tab to view it.</p>
          </div>
        </div>
      )}

      {regenError && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top-1">
          <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div>
            <p className="text-sm text-rose-300 font-bold">Failed to regenerate schedule</p>
            <p className="text-xs text-rose-500/70 mt-0.5">Could not build a valid schedule. Check that teams are configured correctly and try again.</p>
          </div>
        </div>
      )}

      {/* ── Change log ── */}
      {showChangeLog && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-2 animate-in slide-in-from-top-1">
          <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Settings Change Log</h4>
          {changeLog.length === 0
            ? <p className="text-slate-600 text-xs">No changes recorded yet.</p>
            : changeLog.slice(0, 20).map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-xs border-b border-slate-800 pb-1.5 last:border-0">
                <span className="text-slate-600 tabular-nums whitespace-nowrap">{new Date(e.ts).toLocaleTimeString()}</span>
                <span className="text-slate-400 font-bold uppercase tracking-wide">{e.label}</span>
                {e.oldVal && <span className="text-rose-400 line-through">{e.oldVal}</span>}
                <span className="text-amber-400">→ {e.newVal}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* ── Cross-tab search results ── */}
      {searchResults && (
        <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-5 space-y-2 animate-in slide-in-from-top-1">
          <h4 className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-3">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
          </h4>
          {searchResults.length === 0
            ? <p className="text-slate-500 text-xs">No settings match that query.</p>
            : searchResults.map((item, i) => (
              <button key={i} onClick={() => { setActiveTab(item.tab); setSearchQuery(''); }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 transition-all">
                <span className="text-sm text-white font-bold">{item.label}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg">
                  {TAB_LABELS[item.tab]}
                </span>
              </button>
            ))
          }
        </div>
      )}

      {/* ── Tab content ── */}
      {!searchResults && (
      <div className="grid grid-cols-1 gap-6">

        {/* ════════════════════ LEAGUE TAB ════════════════════ */}
        {activeTab === 'league' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in slide-in-from-bottom-2">

            {/* Basics */}
            <SectionHeader title="Franchise" />
            {inSeason ? (
              <LockedField>
                <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Franchise Name</label>
                  <input type="text" readOnly value={league.leagueName}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-display text-xl focus:outline-none" />
                </div>
              </LockedField>
            ) : (
            <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Franchise Name</label>
              <input type="text" value={league.leagueName}
                onChange={e => updateLeague({ leagueName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-display text-xl focus:outline-none" />
            </div>
            )}
            <ToggleField label="Owner Patience Meter" value={s.ownerMeterEnabled}
              onChange={v => updateSettings({ ownerMeterEnabled: v }, 'Owner Patience Meter')} />
            <SelectField label="Owner Patience Level" value={s.ownerPatienceLevel ?? 'Medium'}
              options={['Low','Medium','High']}
              onChange={v => updateSettings({ ownerPatienceLevel: v as any }, 'Owner Patience Level')} />

            {/* Season Structure */}
            <SectionHeader title="Season Structure" sub="Games per season and schedule composition" />
            {inSeason ? (
              <LockedField>
                <SliderField label="Games Per Season" value={s.seasonLength} min={10} max={82} onChange={() => {}} />
              </LockedField>
            ) : (
              <SliderField label="Games Per Season" value={s.seasonLength} min={10} max={82}
                onChange={v => updateSettings({ seasonLength: v }, 'Season Length')} />
            )}
            {inSeason ? (
              <LockedField>
                <SliderField label="Preseason Games Per Team" value={s.preseasonGames ?? 6} min={0} max={10} onChange={() => {}} />
              </LockedField>
            ) : (
              <SliderField label="Preseason Games Per Team" value={s.preseasonGames ?? 6} min={0} max={10}
                onChange={v => updateSettings({ preseasonGames: v }, 'Preseason Games')} />
            )}
            {inSeason ? (
              <LockedField>
                <ButtonField label="Quarter Length (Minutes)" options={[8, 10, 12, 15, 20]} value={s.quarterLength ?? 12} onChange={() => {}} />
              </LockedField>
            ) : (
              <ButtonField label="Quarter Length (Minutes)" options={[8, 10, 12, 15, 20]} value={s.quarterLength ?? 12}
                onChange={v => updateSettings({ quarterLength: parseInt(v) }, 'Quarter Length')} />
            )}
            {inSeason ? (
              <LockedField>
                <NumberInputField label="Division Games" value={s.divisionGames ?? 16} min={0} max={82} onChange={() => {}} />
              </LockedField>
            ) : (
              <NumberInputField label="Division Games" value={s.divisionGames ?? 16} min={0} max={82}
                onChange={v => updateSettings({ divisionGames: v }, 'Division Games')} placeholder="16" />
            )}
            {inSeason ? (
              <LockedField>
                <NumberInputField label="Conference Games" value={s.conferenceGames ?? 36} min={0} max={82} onChange={() => {}} />
              </LockedField>
            ) : (
              <NumberInputField label="Conference Games" value={s.conferenceGames ?? 36} min={0} max={82}
                onChange={v => updateSettings({ conferenceGames: v }, 'Conference Games')} placeholder="36 (blank = no treatment)" />
            )}
            {inSeason ? (
              <LockedField>
                <SliderField label="Trade Deadline (% of Season)" value={Math.round((s.tradeDeadlineFraction ?? 0.6) * 100)}
                  min={30} max={85} onChange={() => {}} unit="%" />
              </LockedField>
            ) : (
              <SliderField label="Trade Deadline (% of Season)" value={Math.round((s.tradeDeadlineFraction ?? 0.6) * 100)}
                min={30} max={85}
                onChange={v => updateSettings({ tradeDeadlineFraction: v / 100 }, 'Trade Deadline Fraction')} unit="%" />
            )}

            {/* Financial Rules */}
            {(() => {
              const startYear = s.startingYear ?? league.season;
              const currentYear = league.season;
              const h = getHistoricalFinancials(currentYear);
              const noCap = s.salaryCap === 0 || s.salaryCap >= 990_000_000;
              return (
                <div className="col-span-full rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                      📅 Season {currentYear} — {h.era}
                    </span>
                    {startYear !== currentYear && (
                      <span className="text-[9px] text-slate-500 font-bold">Started: {startYear}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-400">
                    <span className={noCap ? 'text-rose-400' : 'text-slate-200'}>
                      Cap: {noCap ? 'No Salary Cap' : fmtSalary(s.salaryCap)}
                    </span>
                    <span>·</span>
                    <span>
                      Luxury Tax: {(!s.luxuryTaxLine || s.luxuryTaxLine === 0) ? 'None' : fmtSalary(s.luxuryTaxLine)}
                    </span>
                    <span>·</span>
                    <span>Rookie Scale: {s.rookieScaleContracts !== false ? 'Yes' : 'No'}</span>
                    <span>·</span>
                    <span>Trade Match: {(s.tradeSalaryMatchPct ?? 125) === 100 ? 'Unrestricted' : `${s.tradeSalaryMatchPct ?? 125}%`}</span>
                  </div>
                  <p className="text-[9px] text-slate-600 italic">{h.note}</p>
                </div>
              );
            })()}
            <SectionHeader title="Financial Rules" sub="Cap, tax, payroll floor, and trade matching" />
            <SelectField label="Salary Cap Type" value={s.salaryCapType ?? 'Soft Cap'}
              options={['Soft Cap','Hard Cap']}
              onChange={v => updateSettings({ salaryCapType: v as any }, 'Salary Cap Type')} />
            <SliderField label="Salary Cap" value={s.salaryCap} min={80_000_000} max={250_000_000} step={1_000_000}
              onChange={v => updateSettings({ salaryCap: v }, 'Salary Cap')} unit="$" />
            <SliderField label="Luxury Tax Line" value={s.luxuryTaxLine} min={100_000_000} max={300_000_000} step={1_000_000}
              onChange={v => updateSettings({ luxuryTaxLine: v }, 'Luxury Tax Line')} unit="$" />
            <SliderField label="Luxury Tax Threshold" value={s.luxuryTaxThreshold ?? 84_750_000} min={30_000_000} max={200_000_000} step={250_000}
              onChange={v => updateSettings({ luxuryTaxThreshold: v }, 'Luxury Tax Threshold')} unit="$" />
            <SliderField label="Minimum Payroll" value={s.minPayroll ?? 46_650_000} min={20_000_000} max={120_000_000} step={250_000}
              onChange={v => updateSettings({ minPayroll: v }, 'Minimum Payroll')} unit="$" />
            <SliderField label="Luxury Tax Multiplier" value={s.luxuryTaxMultiplier ?? 1.5} min={1.0} max={4.0} step={0.1}
              onChange={v => updateSettings({ luxuryTaxMultiplier: v }, 'Luxury Tax Multiplier')} unit="×" />
            <ToggleField label="Budget Threshold" value={s.budgetThreshold ?? false}
              onChange={v => updateSettings({ budgetThreshold: v }, 'Budget Threshold')} />
            <SliderField label="Trade Salary Match %" value={s.tradeSalaryMatchPct ?? 125} min={100} max={200} step={5}
              onChange={v => updateSettings({ tradeSalaryMatchPct: v }, 'Trade Salary Match %')} unit="%" />

            {/* Playoff Format */}
            <SectionHeader title="Playoff Format" />
            <SelectField label="Playoff Format (Teams)" value={s.playoffFormat ?? 8}
              options={[6,8,10,12,14,16]}
              onChange={v => updateSettings({ playoffFormat: Number(v) as any }, 'Playoff Format')} />
            <SelectField label="Playoff Seeding" value={s.playoffSeeding ?? 'Conference'}
              options={['Conference','League-wide']}
              onChange={v => updateSettings({ playoffSeeding: v as any }, 'Playoff Seeding')} />
            <ToggleField label="Play-in Tournament" value={s.playInTournament ?? true}
              onChange={v => updateSettings({ playInTournament: v }, 'Play-in Tournament')} />
            <ToggleField label="Split By Conference" value={s.splitByConference ?? true}
              onChange={v => updateSettings({ splitByConference: v }, 'Split By Conference')} />
            <ToggleField label="Reseed Rounds" value={s.reseedRounds ?? false}
              onChange={v => updateSettings({ reseedRounds: v }, 'Reseed Rounds')} />
            <NumberInputField label="Guaranteed Per Division" value={s.guaranteedPerDivision ?? 0} min={0} max={4}
              onChange={v => updateSettings({ guaranteedPerDivision: v }, 'Guaranteed Per Division')}
              unit="teams" placeholder="0" />
            <ToggleField label="Home Court Advantage" value={s.homeCourt ?? true}
              onChange={v => updateSettings({ homeCourt: v }, 'Home Court Advantage')} />

            {/* Trade Deadline */}
            <SectionHeader title="Trade Deadline" />
            <SelectField label="Trade Deadline" value={s.tradeDeadline ?? 'Week 14'}
              options={['Disabled','Week 12','Week 14','Week 16']}
              onChange={v => updateSettings({ tradeDeadline: v as any }, 'Trade Deadline')} />
            <ToggleField label="Hard Cap at Deadline" value={s.hardCapAtDeadline ?? false}
              onChange={v => updateSettings({ hardCapAtDeadline: v }, 'Hard Cap at Deadline')} />

            {/* Contract Rules */}
            <SectionHeader title="Contract Rules" />
            <ButtonField label="Max Contract Years" options={[2,3,4,5]}
              value={s.maxContractYears ?? 5} onChange={v => updateSettings({ maxContractYears: Number(v) as 2|3|4|5 }, 'Max Contract Years')} />
            <ButtonField label="Max Player Salary %" options={['25%','30%','35%']}
              value={`${s.maxPlayerSalaryPct ?? 35}%`}
              onChange={v => updateSettings({ maxPlayerSalaryPct: Number(v.replace('%','')) as 25|30|35 }, 'Max Player Salary %')} />
            <ToggleField label="Bird Rights" value={s.birdRights ?? true}
              onChange={v => updateSettings({ birdRights: v }, 'Bird Rights')} />

            {/* Rookie Contracts */}
            <SectionHeader title="Rookie Contracts" sub="Scale, slot salaries, and length by round" />
            <ToggleField label="Rookie Salary Scale" value={s.rookieScaleContracts ?? true}
              onChange={v => updateSettings({ rookieScaleContracts: v }, 'Rookie Salary Scale')} />
            {inSeason ? (
              <LockedField>
                <SliderField label="#1 Pick Salary, % of Max Contract" value={s.pick1SalaryPct ?? 25} min={10} max={50} onChange={() => {}} unit="%" />
              </LockedField>
            ) : (
              <SliderField label="#1 Pick Salary, % of Max Contract" value={s.pick1SalaryPct ?? 25} min={10} max={50}
                onChange={v => updateSettings({ pick1SalaryPct: v }, '#1 Pick Salary %')} unit="%" />
            )}
            {inSeason ? (
              <LockedField>
                <NumberInputField label="Rounds With >Min Contracts" value={s.roundsAboveMin ?? 1} min={0} max={10} onChange={() => {}} />
              </LockedField>
            ) : (
              <NumberInputField label="Rounds With >Min Contracts" value={s.roundsAboveMin ?? 1} min={0} max={10}
                onChange={v => updateSettings({ roundsAboveMin: v }, 'Rounds With >Min Contracts')} />
            )}
            <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Rookie Contract Lengths</label>
                <span className="text-[9px] text-slate-600">JSON array · one length per round</span>
              </div>
              <textarea
                rows={2}
                value={JSON.stringify(s.rookieContractLengths ?? [3, 2])}
                readOnly={inSeason}
                onChange={e => {
                  try {
                    const arr = JSON.parse(e.target.value);
                    if (Array.isArray(arr) && arr.every(n => typeof n === 'number' && n > 0))
                      updateSettings({ rookieContractLengths: arr }, 'Rookie Contract Lengths');
                  } catch { /* invalid JSON — don't update */ }
                }}
                className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-amber-400 font-mono text-sm focus:outline-none focus:border-amber-500/50 resize-none ${inSeason ? 'opacity-40 cursor-not-allowed' : ''}`}
              />
              <p className="text-[9px] text-slate-600">e.g. [3,2] → round 1 = 3-year deal, round 2 = 2-year deal</p>
            </div>
            <ToggleField label="Can Refuse After Rookie Contract" value={s.canRefuseAfterRookie ?? false}
              onChange={v => updateSettings({ canRefuseAfterRookie: v }, 'Can Refuse After Rookie Contract')} />

            {/* Roster Rules */}
            <SectionHeader title="Roster Rules" sub="Min/max active roster sizes" />
            {inSeason ? (
              <LockedField><NumberInputField label="Min Roster Size" value={s.minRosterSize ?? 10} min={5} max={20} onChange={() => {}} /></LockedField>
            ) : (
              <NumberInputField label="Min Roster Size" value={s.minRosterSize ?? 10} min={5} max={20}
                onChange={v => updateSettings({ minRosterSize: v }, 'Min Roster Size')} unit="players" />
            )}
            {inSeason ? (
              <LockedField><NumberInputField label="Max Roster Size" value={s.maxRosterSize ?? 18} min={10} max={30} onChange={() => {}} /></LockedField>
            ) : (
              <NumberInputField label="Max Roster Size" value={s.maxRosterSize ?? 18} min={10} max={30}
                onChange={v => updateSettings({ maxRosterSize: v }, 'Max Roster Size')} unit="players" />
            )}

            {/* Draft Settings */}
            <SectionHeader title="Draft Settings" sub="Lottery format, rounds, and prospect age range" />
            {inSeason ? (
              <LockedField><NumberInputField label="# Draft Rounds" value={s.draftRounds ?? 2} min={1} max={10} onChange={() => {}} /></LockedField>
            ) : (
              <NumberInputField label="# Draft Rounds" value={s.draftRounds ?? 2} min={1} max={10}
                onChange={v => updateSettings({ draftRounds: v }, '# Draft Rounds')} />
            )}
            {inSeason ? (
              <LockedField>
                <SelectField label="Draft Type" value={s.draftType ?? 'NBA 1994'} options={['NBA 1994','Custom Lottery','Carry-Over (COLA)','Straight Pick']} onChange={() => {}} />
              </LockedField>
            ) : (
              <SelectField label="Draft Type" value={s.draftType ?? 'NBA 1994'}
                options={['NBA 1994','Custom Lottery','Carry-Over (COLA)','Straight Pick']}
                onChange={v => updateSettings({ draftType: v as any }, 'Draft Type')} />
            )}
            {/* Custom lottery fields — only shown for Custom/COLA types */}
            {(s.draftType === 'Custom Lottery' || s.draftType === 'Carry-Over (COLA)') && (
              <>
                {inSeason ? (
                  <LockedField><NumberInputField label="Custom # Lottery Selections" value={s.customLotterySelections ?? 4} min={1} max={14} onChange={() => {}} /></LockedField>
                ) : (
                  <NumberInputField label="Custom # Lottery Selections" value={s.customLotterySelections ?? 4} min={1} max={14}
                    onChange={v => updateSettings({ customLotterySelections: v }, 'Custom # Lottery Selections')} />
                )}
                <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Custom Lottery Chances</label>
                    <span className="text-[9px] text-slate-600">JSON array · one per team slot</span>
                  </div>
                  <textarea
                    rows={3}
                    value={JSON.stringify(s.customLotteryChances ?? [140,140,140,125,105,90,75,60,45,30,20,15,10,5,5])}
                    readOnly={inSeason}
                    onChange={e => {
                      try {
                        const arr = JSON.parse(e.target.value);
                        if (Array.isArray(arr) && arr.every(n => typeof n === 'number'))
                          updateSettings({ customLotteryChances: arr }, 'Custom Lottery Chances');
                      } catch { /* invalid JSON — don't update */ }
                    }}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-amber-400 font-mono text-xs focus:outline-none focus:border-amber-500/50 resize-none ${inSeason ? 'opacity-40 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-[9px] text-slate-600">Default: [140,140,140,125,105,90,75,60,45,30,20,15,10,5,5] — sums to 1000</p>
                </div>
              </>
            )}
            {inSeason ? (
              <LockedField><NumberInputField label="# Tradable Draft Pick Seasons" value={s.tradableDraftPickSeasons ?? 4} min={1} max={7} onChange={() => {}} /></LockedField>
            ) : (
              <NumberInputField label="# Tradable Draft Pick Seasons" value={s.tradableDraftPickSeasons ?? 4} min={1} max={7}
                onChange={v => updateSettings({ tradableDraftPickSeasons: v }, '# Tradable Draft Pick Seasons')} unit="seasons ahead" />
            )}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              {inSeason ? (
                <LockedField><NumberInputField label="Prospect Age Min" value={s.prospectAgeMin ?? 19} min={16} max={30} onChange={() => {}} /></LockedField>
              ) : (
                <NumberInputField label="Prospect Age Min" value={s.prospectAgeMin ?? 19} min={16} max={30}
                  onChange={v => updateSettings({ prospectAgeMin: Math.min(v, s.prospectAgeMax ?? 22) }, 'Prospect Age Min')} unit="yrs" />
              )}
              {inSeason ? (
                <LockedField><NumberInputField label="Prospect Age Max" value={s.prospectAgeMax ?? 22} min={16} max={35} onChange={() => {}} /></LockedField>
              ) : (
                <NumberInputField label="Prospect Age Max" value={s.prospectAgeMax ?? 22} min={16} max={35}
                  onChange={v => updateSettings({ prospectAgeMax: Math.max(v, s.prospectAgeMin ?? 19) }, 'Prospect Age Max')} unit="yrs" />
              )}
            </div>
            <SelectField label="Draft Class Size" value={s.draftClassSize ?? 'Normal'}
              options={['Small (45)','Normal (60)','Large (75)']}
              onChange={v => updateSettings({ draftClassSize: v.split(' ')[0] as any }, 'Draft Class Size')} />
            <ToggleField label="International Prospects" value={s.internationalProspects ?? true}
              onChange={v => updateSettings({ internationalProspects: v }, 'International Prospects')} />
            <ToggleField label="Draft Lottery" value={s.draftLottery ?? true}
              onChange={v => updateSettings({ draftLottery: v }, 'Draft Lottery')} />

            {/* Expansion */}
            <SectionHeader title="Expansion"
              sub="Expansion automatically unlocks after the Finals each season. Configure team count and draft rules in the Expansion tab." />
            <SelectField label="Expansion Draft Rules" value={s.expansionDraftRules ?? 'Standard'}
              options={['Standard (8 protected)','Protected (11 protected)','Open (0 protected)']}
              onChange={v => updateSettings({ expansionDraftRules: v.split(' ')[0] as any }, 'Expansion Draft Rules')} />
            <div className="md:col-span-2 flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4">
              <svg className="w-5 h-5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-indigo-300 font-bold">
                Expansion is <span className="text-indigo-200 uppercase tracking-widest">automatic</span> — the Expansion tab unlocks after the Finals each season. Use the rules selector above to control protection counts.
              </p>
            </div>

            {/* Export */}
            <div className="md:col-span-2 flex gap-3 pt-2">
              <button onClick={handleExport}
                className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold uppercase rounded-2xl transition-all flex items-center justify-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Export Full Save Data
              </button>
            </div>

            {/* Regenerate Schedule — visible in preseason and post-FA offseason */}
            {canShowRegen && (
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center gap-3 bg-slate-950/40 border border-slate-800 rounded-2xl p-5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Regenerate Season Schedule</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {regenLoading
                        ? 'Building new schedule — shuffling matchups and dates…'
                        : anyGamePlayed
                          ? 'Locked — season is in progress (some games have been played).'
                          : 'Reshuffle all matchups and game dates. Available before any game is played.'}
                    </p>
                  </div>
                  <button
                    disabled={anyGamePlayed || regenLoading}
                    onClick={() => setRegenConfirm(true)}
                    className={`shrink-0 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                      anyGamePlayed || regenLoading
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 active:bg-amber-500/40'
                    }`}
                  >
                    {regenLoading ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {regenLoading ? 'Regenerating…' : anyGamePlayed ? 'Locked' : 'Regenerate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════ GAMEPLAY TAB ════════════════════ */}
        {activeTab === 'gameplay' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in slide-in-from-bottom-2">

            {/* Fatigue */}
            <SectionHeader title="Fatigue System" />
            <SelectField label="Fatigue Impact" value={s.fatigueImpact ?? 'Medium'}
              options={['None','Low','Medium','High']}
              onChange={v => updateSettings({ fatigueImpact: v as any }, 'Fatigue Impact')} />
            <SelectField label="Back-to-Back Penalty" value={s.b2bPenalty ?? 'Mild'}
              options={['None','Mild','Severe']}
              onChange={v => updateSettings({ b2bPenalty: v as any }, 'Back-to-Back Penalty')} />
            <ToggleField label="B2B Fatigue Impact" value={s.b2bFatigueEnabled !== false}
              onChange={v => updateSettings({ b2bFatigueEnabled: v }, 'B2B Fatigue Impact')} />
            <ToggleField label="Load Management" value={s.loadManagement ?? true}
              onChange={v => updateSettings({ loadManagement: v }, 'Load Management')} />

            {/* Injury */}
            <SectionHeader title="Injury Settings" />
            <SelectField label="Injury Frequency" value={s.injuryFrequency}
              options={['Low','Medium','High']}
              onChange={v => updateSettings({ injuryFrequency: v as any }, 'Injury Frequency')} />
            <SelectField label="Injury Duration" value={s.injuryDuration ?? 'Realistic'}
              options={['Short','Realistic','Long']}
              onChange={v => updateSettings({ injuryDuration: v as any }, 'Injury Duration')} />
            <ToggleField label="Practice Injuries" value={s.practiceInjuries ?? false}
              onChange={v => updateSettings({ practiceInjuries: v }, 'Practice Injuries')} />
            <ToggleField label="Career-Ending Injuries" value={s.careerEndingInjuries ?? true}
              onChange={v => updateSettings({ careerEndingInjuries: v }, 'Career-Ending Injuries')} />

            {/* Chemistry */}
            <SectionHeader title="Chemistry System" />
            <ToggleField label="Team Chemistry" value={s.teamChemistry ?? true}
              onChange={v => updateSettings({ teamChemistry: v }, 'Team Chemistry')} />
            <SelectField label="Chemistry Impact on Performance" value={s.chemistryImpact ?? 'Medium'}
              options={['Low','Medium','High']}
              onChange={v => updateSettings({ chemistryImpact: v as any }, 'Chemistry Impact')} />
            <ToggleField label="Personality Clash Penalties" value={s.personalityClashPenalties ?? true}
              onChange={v => updateSettings({ personalityClashPenalties: v }, 'Personality Clash Penalties')} />

            {/* Morale */}
            <SectionHeader title="Morale System" />
            <ToggleField label="Player Morale" value={s.playerMorale ?? true}
              onChange={v => updateSettings({ playerMorale: v }, 'Player Morale')} />
            <ToggleField label="Morale Affects Attributes" value={s.moraleAffectsAttributes ?? true}
              onChange={v => updateSettings({ moraleAffectsAttributes: v }, 'Morale Affects Attributes')} />
            <SelectField label="Trade Request Threshold" value={s.tradeRequestThreshold ?? 'Medium'}
              options={['Low','Medium','High']}
              onChange={v => updateSettings({ tradeRequestThreshold: v as any }, 'Trade Request Threshold')} />

            {/* Misc gameplay */}
            <SectionHeader title="General" />
            <SelectField label="Trade Realism" value={s.tradeDifficulty}
              options={['Easy','Realistic','Hard']}
              onChange={v => updateSettings({ tradeDifficulty: v as any }, 'Trade Realism')} />
            <SelectField label="Simulation Engine Mode" value={s.simSpeed}
              options={['Normal','Smarter','Faster']}
              onChange={v => updateSettings({ simSpeed: v as any }, 'Simulation Engine Mode')} />
          </div>
        )}

        {/* ════════════════════ SLIDERS TAB ════════════════════ */}
        {activeTab === 'sliders' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in slide-in-from-bottom-2">

            {/* Difficulty + Progression */}
            <SectionHeader title="Difficulty & Progression" />
            <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Overall Difficulty</label>
              <div className="flex gap-2">
                {['Rookie','Pro','All-Star','Legend'].map(d => (
                  <button key={d} onClick={() => updateSettings({ difficulty: d as any }, 'Overall Difficulty')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${s.difficulty === d ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-500 hover:text-white'}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <SelectField label="Rookie Progression Speed" value={s.rookieProgressionRate}
              options={['Slow','Normal','Fast']}
              onChange={v => updateSettings({ rookieProgressionRate: v as any }, 'Rookie Progression Speed')} />
            <SliderField label="Veteran Attribute Decline" value={s.vetDeclineRate} min={0} max={200}
              onChange={v => updateSettings({ vetDeclineRate: v }, 'Veteran Attribute Decline')} unit="%" />

            {/* Offensive Sliders */}
            <SectionHeader title="Offensive Sliders" sub="0 = minimum / 100 = maximum frequency or success rate" />
            {([
              ['Layup Success Rate',     'sliderLayup'],
              ['Mid-Range Success Rate', 'sliderMidRange'],
              ['3PT Success Rate',       'slider3pt'],
              ['Free Throw Success Rate','sliderFreeThrow'],
              ['Fast Break Frequency',  'sliderFastBreak'],
              ['Post Up Frequency',     'sliderPostUp'],
              ['Pick and Roll Frequency','sliderPickRoll'],
            ] as [string, keyof LeagueSettings][]).map(([lbl, fld]) => (
              <React.Fragment key={fld}><SliderField label={lbl} value={(s[fld] as number) ?? 50} min={0} max={100}
                onChange={v => updateSettings({ [fld]: v } as Partial<LeagueSettings>, lbl)} /></React.Fragment>
            ))}

            {/* Defensive Sliders */}
            <SectionHeader title="Defensive Sliders" />
            {([
              ['Steal Frequency',              'sliderSteal'],
              ['Block Frequency (Slider)',     'sliderBlock'],
              ['Foul Frequency',               'sliderFoul'],
              ['Help Defense Effectiveness',  'sliderHelpDefense'],
              ['Perimeter Defense',           'sliderPerimeterDefense'],
            ] as [string, keyof LeagueSettings][]).map(([lbl, fld]) => (
              <React.Fragment key={fld}><SliderField label={lbl} value={(s[fld] as number) ?? 50} min={0} max={100}
                onChange={v => updateSettings({ [fld]: v } as Partial<LeagueSettings>, lbl)} /></React.Fragment>
            ))}

            {/* Game Flow Sliders */}
            <SectionHeader title="Game Flow Sliders" />
            {([
              ['Timeout Frequency',           'sliderTimeout'],
              ['Substitution Frequency',      'sliderSubstitution'],
              ['Technical Foul Frequency',    'sliderTechFoul'],
              ['Flagrant Foul Frequency',     'sliderFlagrantFoul'],
              ['Injury Probability Multiplier','sliderInjuryMultiplier'],
            ] as [string, keyof LeagueSettings][]).map(([lbl, fld]) => (
              <React.Fragment key={fld}><SliderField label={lbl} value={(s[fld] as number) ?? 50} min={0} max={100}
                onChange={v => updateSettings({ [fld]: v } as Partial<LeagueSettings>, lbl)} /></React.Fragment>
            ))}
          </div>
        )}

        {/* ════════════════════ SIMULATION TAB ════════════════════ */}
        {activeTab === 'simulation' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in slide-in-from-bottom-2">

            {/* PBP + AI */}
            <SectionHeader title="PBP & AI" />
            <SelectField label="PBP Detail Level" value={s.pbpDetailLevel ?? 'Full'}
              options={['Full','Standard','Box Score Only']}
              onChange={v => updateSettings({ pbpDetailLevel: v as any }, 'PBP Detail Level')} />
            <SelectField label="AI Decision Speed" value={s.aiDecisionSpeed ?? 'Normal'}
              options={['Active','Normal','Passive']}
              onChange={v => updateSettings({ aiDecisionSpeed: v as any }, 'AI Decision Speed')} />

            {/* Score realism */}
            <SectionHeader title="Score Realism" />
            <SelectField label="Blowout Frequency" value={s.blowoutFrequency ?? 'Realistic'}
              options={['Low','Medium','High','Realistic']}
              onChange={v => updateSettings({ blowoutFrequency: v as any }, 'Blowout Frequency')} />
            <SelectField label="Comeback Frequency" value={s.comebackFrequency ?? 'Realistic'}
              options={['Low','Medium','High','Realistic']}
              onChange={v => updateSettings({ comebackFrequency: v as any }, 'Comeback Frequency')} />
            <SelectField label="Overtime Frequency" value={s.overtimeFrequency ?? 'Realistic'}
              options={['Low','Medium','High','Realistic']}
              onChange={v => updateSettings({ overtimeFrequency: v as any }, 'Overtime Frequency')} />
            <SelectField label="Upset Frequency" value={s.upsetFrequency ?? 'Realistic'}
              options={['Low','Medium','Realistic','High']}
              onChange={v => updateSettings({ upsetFrequency: v as any }, 'Upset Frequency')} />

            {/* Pace Enforcement */}
            <SectionHeader title="Pace Enforcement" sub="Set global pace override to 0 to use individual team pace" />
            <SliderField label="Global Pace Override (0 = off)" value={s.globalPaceOverride ?? 0} min={0} max={100}
              onChange={v => updateSettings({ globalPaceOverride: v }, 'Global Pace Override')} />
            <ButtonField label="Shot Clock Length" options={['24s','20s','14s']}
              value={`${s.shotClockLength ?? 24}s`}
              onChange={v => updateSettings({ shotClockLength: Number(v.replace('s','')) as 24|20|14 }, 'Shot Clock Length')} />

            {/* Stat realism */}
            <SectionHeader title="Stat Realism" />
            <SelectField label="Scoring Era" value={s.scoringEra ?? 'Modern'}
              options={['Low Scoring','Modern','Run & Gun']}
              onChange={v => updateSettings({ scoringEra: v as any }, 'Scoring Era')} />
            <SelectField label="3PT Frequency" value={s.threePtFrequency ?? 'Medium'}
              options={['Low','Medium','High','Very High']}
              onChange={v => updateSettings({ threePtFrequency: v as any }, '3PT Frequency')} />
            <SelectField label="Block Frequency" value={s.simBlockFrequency ?? 'Medium'}
              options={['Low','Medium','High']}
              onChange={v => updateSettings({ simBlockFrequency: v as any }, 'Block Frequency')} />
            <SelectField label="Turnover Frequency" value={s.turnoverFrequency ?? 'Medium'}
              options={['Low','Medium','High']}
              onChange={v => updateSettings({ turnoverFrequency: v as any }, 'Turnover Frequency')} />

            <div className="col-span-full border-t border-slate-800 pt-4">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">
                League Mode
              </h4>
              <div className="flex items-start gap-4 bg-slate-800/50 rounded-xl p-4">
                <button
                  onClick={() => updateSettings({ wnbaStatRealism: !(s.wnbaStatRealism ?? ((s.playerGenderRatio ?? 0) === 100)) }, 'WNBA Stat Realism')}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${(s.wnbaStatRealism ?? ((s.playerGenderRatio ?? 0) === 100)) ? 'bg-amber-500' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${(s.wnbaStatRealism ?? ((s.playerGenderRatio ?? 0) === 100)) ? 'translate-x-5' : ''}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-white">WNBA Stat Realism</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Scales simulation outputs to WNBA 2024-26 targets — team PPG 78-86, FG% 43.5-47.5%, 3P% 33-38%, FT% 76-82%, APG 18-23, RPG 32-38.
                    Individual scoring capped at 28-35 pts for stars. Auto-enabled when league gender is set to 100% Women.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 bg-slate-800/50 rounded-xl p-4 mt-3">
                <button
                  onClick={() => updateSettings({ singleYearSeason: !(s.singleYearSeason ?? ((s.playerGenderRatio ?? 0) === 100 || (s.startingYear ?? 9999) <= 1949)) }, 'Single-Year Season Labels')}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${(s.singleYearSeason ?? ((s.playerGenderRatio ?? 0) === 100 || (s.startingYear ?? 9999) <= 1949)) ? 'bg-amber-500' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${(s.singleYearSeason ?? ((s.playerGenderRatio ?? 0) === 100 || (s.startingYear ?? 9999) <= 1949)) ? 'translate-x-5' : ''}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-white">Single-Year Season Labels</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Display seasons as "1997 Season" instead of "1997–98 Season". Auto-enabled for women's leagues and pre-1950 starts.
                    Applies to schedule headers, standings, dynasty feed, and all season labels across the app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════ APPEARANCE TAB ════════════════════ */}
        {activeTab === 'appearance' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-2">

            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 space-y-6">
              <div>
                <h3 className="text-2xl font-display font-bold uppercase text-white tracking-tight">
                  App <span className="text-amber-500">Theme</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Choose a visual style — updates instantly</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(
                  [
                    {
                      id: 'default' as Theme,
                      name: 'Default',
                      desc: 'Dark slate with orange accents — the classic look',
                      preview: ['#0f172a','#1e293b','#f59e0b'],
                      textPreview: 'text-amber-500',
                    },
                    {
                      id: 'dark' as Theme,
                      name: 'Pure Dark',
                      desc: 'Near-black backgrounds, steel-grey tones',
                      preview: ['#020202','#0a0a0a','#a1a1aa'],
                      textPreview: 'text-zinc-400',
                    },
                    {
                      id: 'light' as Theme,
                      name: 'Light',
                      desc: 'Clean white canvas with dark text',
                      preview: ['#f1f5f9','#ffffff','#d97706'],
                      textPreview: 'text-amber-600',
                    },
                    {
                      id: 'neon' as Theme,
                      name: 'Neon',
                      desc: 'Deep space dark with glowing orange & purple',
                      preview: ['#07071a','#0f0f28','#ff6a10'],
                      textPreview: 'text-orange-500',
                    },
                  ] as { id: Theme; name: string; desc: string; preview: string[]; textPreview: string }[]
                ).map(t => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`relative group text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                        active
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-800/60'
                      }`}
                    >
                      {/* colour swatches */}
                      <div className="flex gap-2 mb-4">
                        {t.preview.map((c, i) => (
                          <span
                            key={i}
                            className="w-8 h-8 rounded-xl border border-slate-700 shadow-inner"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black uppercase tracking-widest text-white">{t.name}</span>
                        {active && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/15 px-2 py-1 rounded-lg">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{t.desc}</p>

                      {active && (
                        <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                          <svg className="w-2.5 h-2.5 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* UI Preferences */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 space-y-6">
              <div>
                <h3 className="text-2xl font-display font-bold uppercase text-white tracking-tight">
                  UI <span className="text-amber-500">Preferences</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Visual helpers and display options</p>
              </div>
              <div className="flex items-center justify-between p-5 bg-slate-950 border border-slate-800 rounded-2xl">
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-white">Highlight My Team &amp; Players</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-widest">Accent your team's color on all lists, tables, standings, stats, and draft boards</p>
                </div>
                <ToggleField label="" value={s.highlightMyTeam !== false}
                  onChange={v => updateSettings({ highlightMyTeam: v }, 'Highlight My Team & Players')} />
              </div>
            </div>

          </div>
        )}

        {/* ════════════════════ GOD MODE TAB ════════════════════ */}
        {activeTab === 'godmode' && (
          <div className="space-y-5 animate-in slide-in-from-bottom-2">

            {/* Master Toggle */}
            <div className={`p-8 rounded-[2.5rem] border-2 transition-all ${s.godMode ? 'bg-rose-500/10 border-rose-500' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-2xl font-display font-bold uppercase ${s.godMode ? 'text-rose-500' : 'text-slate-400'}`}>God Mode</h3>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Unlock full commissioner controls</p>
                </div>
                <ToggleField label="" value={s.godMode}
                  onChange={v => updateSettings({ godMode: v }, 'God Mode')} />
              </div>
            </div>

            {/* God Mode Feature Toggles */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity duration-300 ${s.godMode ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
              <SectionHeader title="Edit Controls" />
              <GodToggle label="Edit Any Player (Attributes / Age / Contract)" field="editAnyPlayer" />
              <GodToggle label="Edit Any Team (OVR / Finances / Picks)" field="editAnyTeam" />
              <GodToggle label="Draft Class Editor" field="draftClassEditor" />

              <SectionHeader title="Match & League Controls" />
              <GodToggle label="Force Game Outcomes" field="forceGameOutcomes" />
              <GodToggle label="Manipulate Standings" field="manipulateStandings" />
              <GodToggle label="Free Agent Market Control" field="freeAgentMarketControl" />

              <SectionHeader title="Quick Actions" />
              <button onClick={() => alert('God Mode: All players morale set to 100')}
                className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">
                Maximize Morale
              </button>
              <button onClick={() => alert('God Mode: Budget set to $1 Billion')}
                className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">
                Infinite Cash
              </button>
              <button onClick={() => alert('God Mode: All injuries cleared')}
                className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">
                Instant Recovery
              </button>
              <button onClick={() => updateLeague({ currentDay: league.currentDay + 1 })}
                className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">
                Force Day Advance
              </button>
              <button onClick={() => updateLeague({ isOffseason: !league.isOffseason })}
                className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">
                Toggle Offseason
              </button>

              <SectionHeader title="Time Travel" sub="Skip forward in time or restore last save checkpoint" />
              <div className="md:col-span-2 grid grid-cols-3 gap-3">
                {([['1 Week', 7], ['1 Month', 30], ['1 Season', 165]] as [string, number][]).map(([lbl, days]) => (
                  <button key={lbl} onClick={() => updateLeague({ currentDay: league.currentDay + days })}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition-all text-[10px] font-black uppercase tracking-widest">
                    Skip +{lbl}
                  </button>
                ))}
              </div>
              <div className="md:col-span-2">
                <button onClick={() => alert('Checkpoint restore: save/load not yet implemented')}
                  className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-500 hover:text-amber-400 hover:border-amber-500/40 transition-all text-[10px] font-black uppercase tracking-widest">
                  Rewind to Last Save Checkpoint
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════ DATA MANAGEMENT TAB ════════════════════ */}
        {activeTab === 'data' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-2">

            {/* Save size summary */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-wrap gap-6 items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Save File Health</h3>
                <p className="text-white text-sm font-medium">
                  Season <span className="text-amber-400 font-bold">{league.season}</span> &nbsp;·&nbsp;
                  Estimated size: <span className={`font-bold ${estimatedKB > 2000 ? 'text-rose-400' : estimatedKB > 800 ? 'text-amber-400' : 'text-emerald-400'}`}>{estimatedKB > 1024 ? `${(estimatedKB/1024).toFixed(1)} MB` : `${estimatedKB} KB`}</span>
                </p>
                <div className="flex gap-4 mt-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  <span>News: {newsCount} items</span>
                  <span>·</span>
                  <span>Transactions: {txCount}</span>
                  <span>·</span>
                  <span>PBP logs: {pbpGames} games</span>
                </div>
              </div>
              {estimatedKB > 800 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Large save detected — consider trimming</span>
                </div>
              )}
            </div>

            {/* Export */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Export Save Data</h3>
                  <p className="text-[11px] text-slate-500">Download a full backup as a <code className="text-amber-400">.json</code> file. Use the Title Screen to re-import it later.</p>
                </div>
                <button
                  onClick={handleExportSave}
                  className="shrink-0 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                >
                  ↓ Download Backup
                </button>
              </div>
            </div>

            {/* Export League Stats */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Export League Stats</h3>
                  <p className="text-[11px] text-slate-500">
                    Download a <code className="text-emerald-400">.json</code> file with standings, team stats, player stats, league leaders, and awards history for Season {league.season}.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(['Standings', 'Player Stats', 'Team Stats', 'League Leaders', 'Awards History'] as const).map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest">{tag}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleExportLeagueStats}
                  className="shrink-0 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                >
                  ↓ Export Stats
                </button>
              </div>
            </div>

            {/* Delete old season data */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Delete Old Season Data</h3>
                <p className="text-[11px] text-slate-500 max-w-lg">
                  Removes Dynasty Feed entries and strips play-by-play logs from seasons older than your chosen threshold.
                  <span className="text-emerald-400 font-bold"> Core achievements, standings, awards, and championship records are always preserved.</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Keep last</span>
                {([3, 5, 7, 10] as const).map(n => (
                  <button key={n} onClick={() => setTrimSeasons(n)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${trimSeasons === n ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-white'}`}>
                    {n} Seasons
                  </button>
                ))}
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">of news history</span>
              </div>
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3 text-[10px] text-amber-400/80 font-bold">
                ⚠️ This action cannot be undone. Export a backup first if you want to preserve the full history.
              </div>
              <button
                onClick={() => confirmAction(
                  `Delete data older than ${league.season - trimSeasons} seasons`,
                  `News entries from before season ${league.season - trimSeasons + 1} will be removed. Play-by-play logs will be stripped from all games. Standings, awards, and championships are preserved.`,
                  handleTrimOldData
                )}
                className="px-6 py-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95"
              >
                🗑 Purge Old Data
              </button>
            </div>

            {/* Clear Dynasty Feed */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Clear Dynasty Feed</h3>
                  <p className="text-[11px] text-slate-500">Removes all <span className="text-white font-bold">{newsCount}</span> news items from the feed. Stats and records are not affected.</p>
                </div>
                <button
                  onClick={() => confirmAction(
                    'Clear Dynasty Feed',
                    `All ${newsCount} news items will be permanently deleted. This cannot be undone.`,
                    handleClearFeed
                  )}
                  className="shrink-0 px-5 py-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95"
                >
                  Clear Feed
                </button>
              </div>
            </div>

            {/* Clear Transactions */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Clear Transaction Log</h3>
                  <p className="text-[11px] text-slate-500">Removes all <span className="text-white font-bold">{txCount}</span> entries from the League Log. Signings, trades, and waivers will no longer appear in history.</p>
                </div>
                <button
                  onClick={() => confirmAction(
                    'Clear Transaction Log',
                    `All ${txCount} transaction records will be permanently deleted. This cannot be undone.`,
                    handleClearTransactions
                  )}
                  className="shrink-0 px-5 py-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95"
                >
                  Clear Log
                </button>
              </div>
            </div>

            {/* Clear PBP only */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Clear Play-by-Play Logs</h3>
                  <p className="text-[11px] text-slate-500">
                    Strips verbose play-by-play data from <span className="text-white font-bold">{pbpGames}</span> games. Box scores and final scores are kept. This is usually the biggest driver of save bloat.
                  </p>
                </div>
                <button
                  onClick={() => confirmAction(
                    'Clear Play-by-Play Logs',
                    `Removes the detailed play-by-play log from ${pbpGames} game records. Box scores, stats, and standings are unaffected.`,
                    handleClearPBP
                  )}
                  className="shrink-0 px-5 py-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95"
                >
                  Clear PBP
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
      )}

      {/* ── Confirmation modal ── */}
      {dataConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              </div>
              <h3 className="text-lg font-display font-bold uppercase text-white tracking-wide">{dataConfirm.label}</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{dataConfirm.detail}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400/80 border-t border-slate-800 pt-4">
              ⚠️ This action cannot be undone. Core achievements and standings will be preserved.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setDataConfirm(null)}
                className="flex-1 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => { dataConfirm.onConfirm(); setDataConfirm(null); }}
                className="flex-1 px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95"
              >
                Confirm & Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success toast ── */}
      {dataSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-900/90 border border-emerald-500/40 text-emerald-300 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-300">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
          <span className="text-[11px] font-black uppercase tracking-widest">{dataSuccess}</span>
        </div>
      )}

    </div>
  );
};

export default Settings;
