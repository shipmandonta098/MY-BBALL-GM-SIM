
import React, { useState, useMemo } from 'react';
import { LeagueState, LeagueSettings } from '../types';

interface SettingsProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

type SettingsTab = 'league' | 'gameplay' | 'sliders' | 'simulation' | 'godmode';

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
  playoffFormat: 8, playoffSeeding: 'Conference', playInTournament: true, homeCourt: true,
  tradeDeadline: 'Week 14', hardCapAtDeadline: false,
  maxContractYears: 5, rookieScaleContracts: true, maxPlayerSalaryPct: 35, birdRights: true,
  draftRounds: 2, draftClassSize: 'Normal', internationalProspects: true, draftLottery: true,
  scheduledExpansion: 'Off', expansionTeamCount: 2, expansionDraftRules: 'Standard',
  fatigueImpact: 'Medium', b2bPenalty: 'Mild', loadManagement: true,
  injuryDuration: 'Realistic', practiceInjuries: false, careerEndingInjuries: true,
  teamChemistry: true, chemistryImpact: 'Medium', personalityClashPenalties: true,
  playerMorale: true, moraleAffectsAttributes: true, tradeRequestThreshold: 'Medium',
  pbpDetailLevel: 'Full', aiDecisionSpeed: 'Normal',
  blowoutFrequency: 'Realistic', comebackFrequency: 'Realistic', overtimeFrequency: 'Realistic',
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
      difficulty: 'Rookie', fatigueImpact: 'None', b2bPenalty: 'None',
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
  { tab: 'league', label: 'Scheduled Expansion' }, { tab: 'league', label: 'Expansion Team Count' },
  { tab: 'league', label: 'Expansion Draft Rules' },
  // Gameplay
  { tab: 'gameplay', label: 'Fatigue Impact' }, { tab: 'gameplay', label: 'Back-to-Back Penalty' },
  { tab: 'gameplay', label: 'Load Management' }, { tab: 'gameplay', label: 'Injury Frequency' },
  { tab: 'gameplay', label: 'Injury Duration' }, { tab: 'gameplay', label: 'Practice Injuries' },
  { tab: 'gameplay', label: 'Career-Ending Injuries' }, { tab: 'gameplay', label: 'Team Chemistry' },
  { tab: 'gameplay', label: 'Chemistry Impact' }, { tab: 'gameplay', label: 'Personality Clash Penalties' },
  { tab: 'gameplay', label: 'Player Morale' }, { tab: 'gameplay', label: 'Morale Affects Attributes' },
  { tab: 'gameplay', label: 'Trade Request Threshold' }, { tab: 'gameplay', label: 'Trade Realism' },
  { tab: 'gameplay', label: 'Simulation Engine Mode' }, { tab: 'gameplay', label: 'Season Length' },
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
  simulation: 'Simulation', godmode: 'God Mode',
};

const Settings: React.FC<SettingsProps> = ({ league, updateLeague }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('league');
  const [searchQuery, setSearchQuery] = useState('');
  const [changeLog, setChangeLog]     = useState<ChangeEntry[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [showChangeLog, setShowChangeLog]       = useState(false);
  const [resetConfirm, setResetConfirm]         = useState<'tab' | 'all' | null>(null);
  const [showSavePreset, setShowSavePreset]     = useState(false);
  const [presetName, setPresetName]             = useState('');

  const updateSettings = (updates: Partial<LeagueSettings>, label = '') => {
    const entries: ChangeEntry[] = Object.entries(updates).map(([k, v]) => ({
      field: k, label: label || k,
      oldVal: String((league.settings as Record<string, unknown>)[k] ?? ''),
      newVal: String(v), ts: Date.now(),
    }));
    setChangeLog(prev => [...entries, ...prev].slice(0, 50));
    updateLeague({ settings: { ...league.settings, ...updates } });
  };

  const s = league.settings;
  const inSeason = !league.isOffseason;

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
      league:     ['playoffFormat','playoffSeeding','playInTournament','homeCourt','tradeDeadline','hardCapAtDeadline','maxContractYears','rookieScaleContracts','maxPlayerSalaryPct','birdRights','draftRounds','draftClassSize','internationalProspects','draftLottery','scheduledExpansion','expansionTeamCount','expansionDraftRules'],
      gameplay:   ['fatigueImpact','b2bPenalty','loadManagement','injuryDuration','practiceInjuries','careerEndingInjuries','teamChemistry','chemistryImpact','personalityClashPenalties','playerMorale','moraleAffectsAttributes','tradeRequestThreshold'],
      sliders:    ['sliderLayup','sliderMidRange','slider3pt','sliderFreeThrow','sliderFastBreak','sliderPostUp','sliderPickRoll','sliderSteal','sliderBlock','sliderFoul','sliderHelpDefense','sliderPerimeterDefense','sliderTimeout','sliderSubstitution','sliderTechFoul','sliderFlagrantFoul','sliderInjuryMultiplier'],
      simulation: ['pbpDetailLevel','aiDecisionSpeed','blowoutFrequency','comebackFrequency','overtimeFrequency','globalPaceOverride','shotClockLength','scoringEra','threePtFrequency','simBlockFrequency','turnoverFrequency'],
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

  // ── Cross-tab search ──────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return null;
    const q = searchQuery.toLowerCase();
    return SEARCH_INDEX.filter(item => item.label.toLowerCase().includes(q));
  }, [searchQuery]);

  const formatMoney = (val: number) => `$${(val / 1_000_000).toFixed(0)}M`;

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

  const GodToggle = ({ label, field }: { label: string; field: keyof LeagueSettings }) => (
    <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${s[field] ? 'bg-rose-500/10 border-rose-500/40' : 'bg-slate-950/40 border-slate-800'}`}>
      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
      <button onClick={() => updateSettings({ [field]: !s[field] } as Partial<LeagueSettings>, label)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s[field] ? 'bg-rose-500' : 'bg-slate-700'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s[field] ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

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
              {(['league','gameplay','sliders','simulation','godmode'] as SettingsTab[]).map(id => (
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
            <SliderField label="Salary Cap" value={s.salaryCap} min={80_000_000} max={250_000_000} step={1_000_000}
              onChange={v => updateSettings({ salaryCap: v }, 'Salary Cap')} unit="$" />
            <SliderField label="Luxury Tax Line" value={s.luxuryTaxLine} min={100_000_000} max={300_000_000} step={1_000_000}
              onChange={v => updateSettings({ luxuryTaxLine: v }, 'Luxury Tax Line')} unit="$" />

            {/* Playoff Format */}
            <SectionHeader title="Playoff Format" />
            <ButtonField label="Playoff Format (Teams)" options={[6,8,10,16]}
              value={s.playoffFormat ?? 8} onChange={v => updateSettings({ playoffFormat: Number(v) as 6|8|10|16 }, 'Playoff Format')} />
            <SelectField label="Playoff Seeding" value={s.playoffSeeding ?? 'Conference'}
              options={['Conference','League-wide']}
              onChange={v => updateSettings({ playoffSeeding: v as any }, 'Playoff Seeding')} />
            <ToggleField label="Play-in Tournament" value={s.playInTournament ?? true}
              onChange={v => updateSettings({ playInTournament: v }, 'Play-in Tournament')} />
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
            <ToggleField label="Rookie Scale Contracts" value={s.rookieScaleContracts ?? true}
              onChange={v => updateSettings({ rookieScaleContracts: v }, 'Rookie Scale Contracts')} />
            <ToggleField label="Bird Rights" value={s.birdRights ?? true}
              onChange={v => updateSettings({ birdRights: v }, 'Bird Rights')} />

            {/* Draft Settings */}
            <SectionHeader title="Draft Settings" />
            <ButtonField label="Draft Rounds" options={[1,2,3]}
              value={s.draftRounds ?? 2} onChange={v => updateSettings({ draftRounds: Number(v) as 1|2|3 }, 'Draft Rounds')} />
            <SelectField label="Draft Class Size" value={s.draftClassSize ?? 'Normal'}
              options={['Small (45)','Normal (60)','Large (75)']}
              onChange={v => updateSettings({ draftClassSize: v.split(' ')[0] as any }, 'Draft Class Size')} />
            <ToggleField label="International Prospects" value={s.internationalProspects ?? true}
              onChange={v => updateSettings({ internationalProspects: v }, 'International Prospects')} />
            <ToggleField label="Draft Lottery" value={s.draftLottery ?? true}
              onChange={v => updateSettings({ draftLottery: v }, 'Draft Lottery')} />

            {/* Expansion */}
            <SectionHeader title="Expansion" />
            {inSeason ? (
              <LockedField>
                <SelectField label="Scheduled Expansion" value={s.scheduledExpansion ?? 'Off'}
                  options={['Off','Year 2','Year 3','Year 5']}
                  onChange={() => {}} />
              </LockedField>
            ) : (
              <SelectField label="Scheduled Expansion" value={s.scheduledExpansion ?? 'Off'}
                options={['Off','Year 2','Year 3','Year 5']}
                onChange={v => updateSettings({ scheduledExpansion: v as any }, 'Scheduled Expansion')} />
            )}
            <ButtonField label="Expansion Team Count" options={[1,2,4]}
              value={s.expansionTeamCount ?? 2} onChange={v => updateSettings({ expansionTeamCount: Number(v) as 1|2|4 }, 'Expansion Team Count')} />
            <SelectField label="Expansion Draft Rules" value={s.expansionDraftRules ?? 'Standard'}
              options={['Standard','Protected','Open']}
              onChange={v => updateSettings({ expansionDraftRules: v as any }, 'Expansion Draft Rules')} />

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
            {inSeason ? (
              <LockedField>
                <SliderField label="Season Length (Games)" value={s.seasonLength} min={10} max={82}
                  onChange={() => {}} />
              </LockedField>
            ) : (
            <SliderField label="Season Length (Games)" value={s.seasonLength} min={10} max={82}
              onChange={v => updateSettings({ seasonLength: v }, 'Season Length')} />
            )}
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

      </div>
      )}
    </div>
  );
};

export default Settings;
