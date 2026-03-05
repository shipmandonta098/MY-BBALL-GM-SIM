
import React, { useState, useEffect } from 'react';
import { LeagueSettings } from '../types';

interface LeagueConfigurationProps {
  onConfirm: (name: string, year: number, settings: Partial<LeagueSettings>) => void;
  onCancel: () => void;
}

const DEFAULT_SETTINGS_KEY = 'HOOPS_DYNASTY_DEFAULT_SETTINGS_V2';

const DIFFICULTY_INFO: Record<string, { tooltip: string }> = {
  Rookie:     { tooltip: 'Forgiving AI — trades lean your way, AI makes mistakes. Easy to build a contender.' },
  Pro:        { tooltip: 'Balanced AI — fair trade value, competent roster decisions. Recommended for most players.' },
  'All-Star': { tooltip: 'Optimized AI — builds competitive rosters, drives hard bargains in trades and free agency.' },
  Legend:     { tooltip: 'AI targets your weaknesses, refuses bad trades, maximizes every competitive advantage.' },
};

const FIELD_HINTS: Record<string, string> = {
  b2bFrequency:         'None: 0 B2Bs. Low: ~10/team. Realistic: ~20/team. Brutal: ~28/team (classic NBA crunch).',
  rookieProgressionRate:'Multiplier on offseason development gains for players under age 23.',
  tradeDifficulty:      'Arcade: almost any trade gets approved. Simulation: strict value matching required.',
  injuryFrequency:      'Multiplier applied to all injury probability rolls throughout the season.',
  seasonLength:         'Between 20 – 82 games. Affects schedule, playoff timing, and per-game stat calcs.',
  salaryCap:            'Luxury tax auto-sets to cap × 1.15. Hard cap auto-sets to cap × 1.25.',
};

const Section: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
    <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3 mb-2">{title}</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; hint?: string; error?: string; children?: React.ReactNode }> = ({ label, hint, error, children }) => (
  <div className="space-y-2">
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
    {children}
    {hint && <p className="text-[9px] text-slate-600 leading-relaxed">{hint}</p>}
    {error && <p className="text-[10px] font-bold text-rose-400">{error}</p>}
  </div>
);

const BtnGroup: React.FC<{
  options: string[]; value: string; onChange: (v: string) => void;
  colors?: Record<string, string>; tooltips?: Record<string, string>;
}> = ({ options, value, onChange, colors = {}, tooltips = {} }) => {
  const [tip, setTip] = React.useState<string | null>(null);
  return (
    <div className="relative">
      <div className="flex gap-1.5 flex-wrap">
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChange(o)}
            onMouseEnter={() => tooltips[o] ? setTip(o) : undefined}
            onMouseLeave={() => setTip(null)}
            className={`flex-1 min-w-[60px] py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${
              value === o
                ? `${colors[o] ?? 'bg-amber-500'} text-white shadow-lg`
                : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-white hover:border-slate-500'
            }`}>
            {o}
          </button>
        ))}
      </div>
      {tip && tooltips[tip] && (
        <div className="absolute z-50 mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-[10px] text-slate-300 leading-relaxed shadow-xl">
          {tooltips[tip]}
        </div>
      )}
    </div>
  );
};

const LeagueConfiguration: React.FC<LeagueConfigurationProps> = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState('Global Basketball Association');
  const [year, setYear] = useState(2025);
  const [expansionYearOffset, setExpansionYearOffset] = useState<number | null>(3);
  const [playerGenderRatio, setPlayerGenderRatio] = useState(0);
  const [coachGenderRatio, setCoachGenderRatio] = useState(10);
  const [allowManualGenderEdits, setAllowManualGenderEdits] = useState(true);
  const [difficulty, setDifficulty] = useState<LeagueSettings['difficulty']>('Pro');
  const [ownerMeterEnabled, setOwnerMeterEnabled] = useState(true);
  const [injuryFrequency, setInjuryFrequency] = useState<LeagueSettings['injuryFrequency']>('Medium');
  const [tradeDifficulty, setTradeDifficulty] = useState<LeagueSettings['tradeDifficulty']>('Realistic');
  const [b2bFrequency, setB2bFrequency] = useState<LeagueSettings['b2bFrequency']>('Realistic');
  const [rookieProgression, setRookieProgression] = useState<LeagueSettings['rookieProgressionRate']>('Normal');
  const [showAdvancedStats, setShowAdvancedStats] = useState(true);
  const [godMode, setGodMode] = useState(false);
  const [seasonLength, setSeasonLength] = useState(82);
  const [salaryCap, setSalaryCap] = useState(140_000_000);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [godModeConfirm, setGodModeConfirm] = useState(false);
  const [genderWarning, setGenderWarning] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DEFAULT_SETTINGS_KEY);
    if (!saved) return;
    try {
      const p = JSON.parse(saved);
      if (p.leagueName) setName(p.leagueName);
      if (p.playerGenderRatio !== undefined) setPlayerGenderRatio(p.playerGenderRatio);
      if (p.coachGenderRatio !== undefined) setCoachGenderRatio(p.coachGenderRatio);
      if (p.difficulty) setDifficulty(p.difficulty);
      if (p.ownerMeterEnabled !== undefined) setOwnerMeterEnabled(p.ownerMeterEnabled);
      if (p.injuryFrequency) setInjuryFrequency(p.injuryFrequency);
      if (p.tradeDifficulty) setTradeDifficulty(p.tradeDifficulty);
      if (p.rookieProgressionRate) setRookieProgression(p.rookieProgressionRate);
      if (p.showAdvancedStats !== undefined) setShowAdvancedStats(p.showAdvancedStats);
      if (p.seasonLength) setSeasonLength(p.seasonLength);
      if (p.salaryCap) setSalaryCap(p.salaryCap);
      if (p.b2bFrequency) setB2bFrequency(p.b2bFrequency);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setGenderWarning(playerGenderRatio === 100 && coachGenderRatio === 10);
  }, [playerGenderRatio, coachGenderRatio]);

  const handleGodModeToggle = (checked: boolean) => {
    if (checked) { setGodModeConfirm(true); }
    else { setGodMode(false); }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'League name is required.';
    else if (name.length > 30) errs.name = 'League name must be 30 characters or fewer.';
    if (year < 2020 || year > 2050) errs.year = 'Starting year must be between 2020 and 2050.';
    if (seasonLength < 20 || seasonLength > 82) errs.seasonLength = 'Season length must be between 20 and 82 games.';
    if (salaryCap < 80_000_000 || salaryCap > 300_000_000) errs.salaryCap = 'Salary cap must be $80M – $300M.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    const expansionYear = expansionYearOffset != null ? year + expansionYearOffset - 1 : undefined;
    const settings: Partial<LeagueSettings> = {
      franchiseName: name,
      startingYear: year,
      difficulty,
      ownerMeterEnabled,
      expansionYear,
      salaryCap,
      luxuryTaxLine: Math.round(salaryCap * 1.15),
      hardCap: Math.round(salaryCap * 1.25),
      injuryFrequency,
      tradeDifficulty,
      rookieProgressionRate: rookieProgression,
      vetDeclineRate: 100,
      simSpeed: 'Normal',
      godMode,
      seasonLength,
      playerGenderRatio,
      coachGenderRatio,
      allowManualGenderEdits,
      b2bFrequency,
      showAdvancedStats,
    };
    if (saveAsDefault) {
      localStorage.setItem(DEFAULT_SETTINGS_KEY, JSON.stringify({ ...settings, leagueName: name }));
    }
    onConfirm(name, year, settings);
  };

  const playerGenderLabel =
    playerGenderRatio === 0   ? 'All Male'    :
    playerGenderRatio === 100 ? 'All Female'  :
    playerGenderRatio === 50  ? 'Mixed 50/50' : 'Custom';

  const fmtM = (v: number) => '$' + (v / 1_000_000).toFixed(0) + 'M';

  const normDiff = (d: LeagueSettings['difficulty']): string =>
    d === 'Easy' ? 'Rookie' : d === 'Medium' ? 'Pro' : d === 'Hard' ? 'All-Star' : d === 'Extreme' ? 'Legend' : d;

  const normB2b = (v: LeagueSettings['b2bFrequency']): string => v === 'High' ? 'Brutal' : v;

  const normTrade = (v: LeagueSettings['tradeDifficulty']): string =>
    v === 'Easy' ? 'Arcade' : v === 'Hard' ? 'Simulation' : v;

  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-[110] p-4 md:p-10 animate-in fade-in zoom-in-95 duration-500 overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px]" />
      </div>

      {/* God Mode Confirm */}
      {godModeConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-8 max-w-sm w-full space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-xl font-display font-bold uppercase text-white">Enable God Mode?</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              God Mode is enabled. Some achievements will be disabled. All league rules can be bypassed. Continue?
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setGodMode(true); setGodModeConfirm(false); }}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-400 text-white font-black uppercase text-sm rounded-2xl transition-all">
                Enable God Mode
              </button>
              <button onClick={() => setGodModeConfirm(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-black uppercase text-sm rounded-2xl transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[3rem] p-6 md:p-12 shadow-2xl space-y-10 my-10">

        {/* Title */}
        <div className="text-center space-y-2">
          <h2 className="text-5xl md:text-6xl font-display font-bold uppercase tracking-tight text-white">
            Initialize <span className="text-amber-500">Dynasty</span>
          </h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">Craft your basketball universe</p>
        </div>

        {/* Gender conflict warning */}
        {genderWarning && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
            <span className="text-xl mt-0.5">⚠️</span>
            <p className="text-sm text-amber-300">
              <strong>Distribution mismatch:</strong> You have All Female players but Realistic (10% Female) coaches.
              Consider updating Coach Gender Distribution to match your player setting.
            </p>
          </div>
        )}

        {/* Row 1: League Name, Year, Expansion */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field label="League Name" error={errors.name}>
            <input type="text" value={name} maxLength={30} onChange={e => setName(e.target.value)}
              className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-display text-lg focus:outline-none focus:border-amber-500/50 transition-colors ${errors.name ? 'border-rose-500' : 'border-slate-800'}`} />
          </Field>
          <Field label="Starting Year" error={errors.year}>
            <input type="number" value={year} min={2020} max={2050} onChange={e => setYear(parseInt(e.target.value) || 2025)}
              className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-display text-lg focus:outline-none ${errors.year ? 'border-rose-500' : 'border-slate-800'}`} />
          </Field>
          <Field label="Scheduled Expansion">
            <select value={expansionYearOffset ?? ''} onChange={e => setExpansionYearOffset(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold appearance-none cursor-pointer">
              <option value="">None</option>
              <option value="2">Year 2</option>
              <option value="3">Year 3 (Default)</option>
              <option value="5">Year 5</option>
              <option value="10">Year 10</option>
            </select>
          </Field>
        </div>

        {/* Roster & Gender */}
        <Section title="Roster & Gender Options">
          <Field label="Player Gender Distribution">
            <div className="space-y-3">
              <select value={playerGenderLabel}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'All Male') setPlayerGenderRatio(0);
                  else if (v === 'All Female') setPlayerGenderRatio(100);
                  else if (v === 'Mixed 50/50') setPlayerGenderRatio(50);
                  // Custom: keep the slider value as-is
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
                <option>All Male</option>
                <option>All Female</option>
                <option>Mixed 50/50</option>
                <option>Custom</option>
              </select>
              {playerGenderLabel === 'Custom' && (
                <div className="px-2 space-y-1">
                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                    <span>0% Female</span>
                    <span className="text-amber-400">{playerGenderRatio}% Female</span>
                  </div>
                  <input type="range" min={0} max={100} value={playerGenderRatio}
                    onChange={e => setPlayerGenderRatio(parseInt(e.target.value))}
                    className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                </div>
              )}
            </div>
          </Field>
          <Field label="Coach Gender Distribution">
            <select value={coachGenderRatio} onChange={e => setCoachGenderRatio(parseInt(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
              <option value={0}>All Male</option>
              <option value={10}>Realistic (10% Female)</option>
              <option value={50}>Mixed 50/50</option>
              <option value={100}>All Female</option>
            </select>
          </Field>
          <div className="md:col-span-2 flex items-start gap-3 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
            <input type="checkbox" checked={allowManualGenderEdits} onChange={e => setAllowManualGenderEdits(e.target.checked)}
              className="w-5 h-5 accent-amber-500 rounded cursor-pointer mt-0.5" />
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Allow Manual Gender Edits in God Mode</span>
              <p className="text-[9px] text-slate-600 mt-0.5">If disabled, player/coach gender is locked permanently after generation.</p>
            </div>
          </div>
        </Section>

        {/* Core Sim Rules */}
        <Section title="Core Sim Rules">
          <Field label="Difficulty Level">
            <BtnGroup options={['Rookie','Pro','All-Star','Legend']}
              value={normDiff(difficulty)}
              onChange={v => setDifficulty(v as LeagueSettings['difficulty'])}
              colors={{ Rookie: 'bg-emerald-500', Pro: 'bg-blue-500', 'All-Star': 'bg-amber-500', Legend: 'bg-rose-500' }}
              tooltips={Object.fromEntries(Object.entries(DIFFICULTY_INFO).map(([k, v]) => [k, v.tooltip]))} />
          </Field>
          <Field label="Owner Patience Meter">
            <button type="button" onClick={() => setOwnerMeterEnabled(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl transition-all ${ownerMeterEnabled ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-950 border-slate-800'}`}>
              <span className="text-xs font-bold text-slate-400 uppercase leading-tight">
                {ownerMeterEnabled ? 'Enabled — losing seasons trigger pressure events' : 'Disabled — no ownership risk'}
              </span>
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ownerMeterEnabled ? 'bg-amber-500' : 'bg-slate-700'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${ownerMeterEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
              </div>
            </button>
          </Field>
          <Field label="Injury Frequency" hint={FIELD_HINTS.injuryFrequency}>
            <BtnGroup options={['None','Low','Medium','High']} value={injuryFrequency}
              onChange={v => setInjuryFrequency(v as LeagueSettings['injuryFrequency'])} />
          </Field>
          <Field label="Trade Realism" hint={FIELD_HINTS.tradeDifficulty}>
            <BtnGroup options={['Arcade','Realistic','Simulation']} value={normTrade(tradeDifficulty)}
              onChange={v => setTradeDifficulty(v as LeagueSettings['tradeDifficulty'])} />
          </Field>
        </Section>

        {/* Gameplay Tweaks */}
        <Section title="Gameplay Tweaks">
          <Field label="Back-to-Back Frequency" hint={FIELD_HINTS.b2bFrequency}>
            <BtnGroup options={['None','Low','Realistic','Brutal']} value={normB2b(b2bFrequency)}
              onChange={v => setB2bFrequency(v as LeagueSettings['b2bFrequency'])} />
          </Field>
          <Field label="Rookie Progression Speed" hint={FIELD_HINTS.rookieProgressionRate}>
            <BtnGroup options={['Slow','Normal','Fast','Accelerated']} value={rookieProgression}
              onChange={v => setRookieProgression(v as LeagueSettings['rookieProgressionRate'])} />
          </Field>
          <div className="md:col-span-2 flex items-start gap-3 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
            <input type="checkbox" checked={showAdvancedStats} onChange={e => setShowAdvancedStats(e.target.checked)}
              className="w-5 h-5 accent-amber-500 rounded cursor-pointer mt-0.5" />
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Show Advanced Stats (PER, VORP) by Default</span>
              <p className="text-[9px] text-slate-600 mt-0.5">Controls default view in Player Stats, Box Score, and League Intelligence tabs.</p>
            </div>
          </div>
        </Section>

        {/* Advanced Settings */}
        <div className="border-t border-slate-800 pt-8">
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 hover:text-white transition-colors">
            {showAdvanced ? '▼' : '▶'} Advanced Settings
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 animate-in slide-in-from-top-4">
              <Field label="Enable God Mode">
                <div className={`flex items-start gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all ${godMode ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-950 border-slate-800'}`}
                  onClick={() => handleGodModeToggle(!godMode)}>
                  <input type="checkbox" checked={godMode} readOnly className="w-5 h-5 accent-rose-500 pointer-events-none mt-0.5" />
                  <div>
                    <span className={`text-xs font-bold uppercase ${godMode ? 'text-rose-400' : 'text-slate-500'}`}>
                      {godMode ? 'Unlocked — full override access' : 'Locked — standard rules enforce'}
                    </span>
                    <p className="text-[9px] text-slate-600 mt-0.5">Enabling God Mode may affect achievement tracking.</p>
                  </div>
                </div>
              </Field>
              <Field label="Custom Season Length" hint={FIELD_HINTS.seasonLength} error={errors.seasonLength}>
                <input type="number" value={seasonLength} min={20} max={82}
                  onChange={e => setSeasonLength(parseInt(e.target.value) || 82)}
                  className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-mono focus:outline-none ${errors.seasonLength ? 'border-rose-500' : 'border-slate-800'}`} />
              </Field>
              <Field label="Salary Cap (Soft Limit)" hint={FIELD_HINTS.salaryCap} error={errors.salaryCap}>
                <div className="space-y-2">
                  <input type="number" value={salaryCap} step={1_000_000} min={80_000_000} max={300_000_000}
                    onChange={e => setSalaryCap(parseInt(e.target.value) || 140_000_000)}
                    className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none ${errors.salaryCap ? 'border-rose-500' : 'border-slate-800'}`} />
                  <div className="flex gap-4 text-[9px] font-black text-slate-600 uppercase">
                    <span>Cap: {fmtM(salaryCap)}</span>
                    <span>Luxury: {fmtM(Math.round(salaryCap * 1.15))}</span>
                    <span>Hard Cap: {fmtM(Math.round(salaryCap * 1.25))}</span>
                  </div>
                </div>
              </Field>
            </div>
          )}
        </div>

        {/* Bottom */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={saveAsDefault} onChange={e => setSaveAsDefault(e.target.checked)}
              className="w-5 h-5 accent-amber-500 rounded cursor-pointer" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Save as Default for Future Leagues</span>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button onClick={handleConfirm}
              className="flex-1 md:flex-none px-12 py-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xl uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-amber-500/20 active:scale-95">
              Continue to Team Selection
            </button>
            <button onClick={onCancel}
              className="px-8 py-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold text-xl uppercase tracking-wider rounded-2xl transition-all">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueConfiguration;
