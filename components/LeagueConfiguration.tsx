
import React, { useState, useEffect } from 'react';
import { LeagueSettings } from '../types';

interface LeagueConfigurationProps {
  onConfirm: (name: string, year: number, settings: Partial<LeagueSettings>) => void;
  onCancel: () => void;
}

const DEFAULT_SETTINGS_KEY = 'HOOPS_DYNASTY_DEFAULT_SETTINGS_V1';

// Fixed types for Section and InputField to correctly handle children in JSX
const Section: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
    <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3 mb-2">{title}</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {children}
    </div>
  </div>
);

const InputField: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
    {children}
  </div>
);

const LeagueConfiguration: React.FC<LeagueConfigurationProps> = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState('Global Basketball Association');
  const [year, setYear] = useState(2025);
  const [expansionYear, setExpansionYear] = useState<number | null>(3);
  
  // Settings
  const [playerGenderRatio, setPlayerGenderRatio] = useState(0); // 0 = 100% male
  const [coachGenderRatio, setCoachGenderRatio] = useState(10);
  const [allowManualGenderEdits, setAllowManualGenderEdits] = useState(true);
  
  const [difficulty, setDifficulty] = useState<LeagueSettings['difficulty']>('Medium');
  const [ownerMeterEnabled, setOwnerMeterEnabled] = useState(true);
  const [injuryFrequency, setInjuryFrequency] = useState<LeagueSettings['injuryFrequency']>('Medium');
  const [tradeDifficulty, setTradeDifficulty] = useState<LeagueSettings['tradeDifficulty']>('Realistic');
  
  const [b2bFrequency, setB2bFrequency] = useState<LeagueSettings['b2bFrequency']>('Realistic');
  const [rookieProgression, setRookieProgression] = useState<LeagueSettings['rookieProgressionRate']>('Normal');
  const [showAdvancedStats, setShowAdvancedStats] = useState(true);
  
  const [godMode, setGodMode] = useState(false);
  const [seasonLength, setSeasonLength] = useState(82);
  const [salaryCap, setSalaryCap] = useState(140000000);
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DEFAULT_SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setName(parsed.leagueName || name);
        setPlayerGenderRatio(parsed.playerGenderRatio ?? 0);
        setCoachGenderRatio(parsed.coachGenderRatio ?? 10);
        setDifficulty(parsed.difficulty || 'Medium');
        setOwnerMeterEnabled(parsed.ownerMeterEnabled ?? true);
        setInjuryFrequency(parsed.injuryFrequency || 'Medium');
        setTradeDifficulty(parsed.tradeDifficulty || 'Realistic');
        setRookieProgression(parsed.rookieProgressionRate || 'Normal');
        setShowAdvancedStats(parsed.showAdvancedStats ?? true);
        setSeasonLength(parsed.seasonLength || 82);
        setSalaryCap(parsed.salaryCap || 140000000);
      } catch (e) {
        console.error("Failed to load default settings", e);
      }
    }
  }, []);

  const handleConfirm = () => {
    const settings: Partial<LeagueSettings> = {
      difficulty,
      ownerMeterEnabled,
      expansionYear: expansionYear || undefined,
      salaryCap,
      luxuryTaxLine: salaryCap * 1.15,
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
      showAdvancedStats
    };

    if (saveAsDefault) {
      localStorage.setItem(DEFAULT_SETTINGS_KEY, JSON.stringify({ ...settings, leagueName: name }));
    }

    onConfirm(name, year, settings);
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-[110] p-4 md:p-10 animate-in fade-in zoom-in-95 duration-500 overflow-y-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[3rem] p-6 md:p-12 shadow-2xl space-y-10 my-10">
        <div className="text-center space-y-2">
          <h2 className="text-5xl md:text-6xl font-display font-bold uppercase tracking-tight text-white">Initialize <span className="text-amber-500">Dynasty</span></h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">Craft your basketball universe</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <InputField label="League Name">
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-display text-lg focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </InputField>
          <InputField label="Starting Year">
            <input 
              type="number" 
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-display text-lg focus:outline-none"
            />
          </InputField>
          <InputField label="Scheduled Expansion">
            <select 
              value={expansionYear || ''}
              onChange={(e) => setExpansionYear(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold appearance-none cursor-pointer"
            >
              <option value="">None</option>
              <option value="3">Year 3 (Default)</option>
              <option value="5">Year 5</option>
              <option value="10">Year 10</option>
            </select>
          </InputField>
        </div>

        <Section title="Roster & Gender Options">
          <InputField label="Player Gender Distribution">
            <div className="space-y-3">
              <select 
                value={playerGenderRatio === 0 ? 'Male' : playerGenderRatio === 100 ? 'Female' : playerGenderRatio === 50 ? 'Mixed' : 'Custom'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'Male') setPlayerGenderRatio(0);
                  else if (v === 'Female') setPlayerGenderRatio(100);
                  else if (v === 'Mixed') setPlayerGenderRatio(50);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold"
              >
                <option value="Male">All Male</option>
                <option value="Female">All Female</option>
                <option value="Mixed">Mixed 50/50</option>
                <option value="Custom">Custom Ratio</option>
              </select>
              {(playerGenderRatio !== 0 && playerGenderRatio !== 100 && playerGenderRatio !== 50) && (
                <div className="px-2">
                  <div className="flex justify-between text-[8px] font-black text-slate-500 uppercase mb-1">
                    <span>Male</span>
                    <span>{playerGenderRatio}% Female</span>
                  </div>
                  <input type="range" min="0" max="100" value={playerGenderRatio} onChange={(e) => setPlayerGenderRatio(parseInt(e.target.value))} className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg appearance-none" />
                </div>
              )}
            </div>
          </InputField>
          <InputField label="Coach Gender Distribution">
            <select 
              value={coachGenderRatio}
              onChange={(e) => setCoachGenderRatio(parseInt(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold"
            >
              <option value={0}>All Male</option>
              <option value={10}>Realistic (10% Female)</option>
              <option value={50}>Mixed 50/50</option>
              <option value={100}>All Female</option>
            </select>
          </InputField>
          <div className="md:col-span-2 flex items-center gap-3 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
            <input type="checkbox" checked={allowManualGenderEdits} onChange={(e) => setAllowManualGenderEdits(e.target.checked)} className="w-5 h-5 accent-amber-500 rounded cursor-pointer" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Allow Manual Gender Edits in God Mode</span>
          </div>
        </Section>

        <Section title="Core Sim Rules">
          <InputField label="Difficulty Level">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
              <option value="Easy">Easy</option>
              <option value="Medium">Medium (Balanced)</option>
              <option value="Hard">Hard</option>
              <option value="Extreme">Extreme</option>
            </select>
          </InputField>
          <InputField label="Owner Patience Meter">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl">
              <input type="checkbox" checked={ownerMeterEnabled} onChange={(e) => setOwnerMeterEnabled(e.target.checked)} className="w-5 h-5 accent-amber-500 cursor-pointer" />
              <span className="text-xs font-bold text-white uppercase">{ownerMeterEnabled ? 'ENABLED' : 'DISABLED'}</span>
            </div>
          </InputField>
          <InputField label="Injury Frequency">
            <select value={injuryFrequency} onChange={(e) => setInjuryFrequency(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </InputField>
          <InputField label="Trade Realism">
            <select value={tradeDifficulty} onChange={(e) => setTradeDifficulty(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
              <option value="Easy">Easy (Gullible AI)</option>
              <option value="Realistic">Realistic (Default)</option>
              <option value="Hard">Hard (Stubborn AI)</option>
            </select>
          </InputField>
        </Section>

        <Section title="Gameplay Tweaks">
          <InputField label="Back-to-Back (B2B) Frequency">
            <select value={b2bFrequency} onChange={(e) => setB2bFrequency(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
              <option value="Low">Low</option>
              <option value="Realistic">Realistic</option>
              <option value="High">High</option>
            </select>
          </InputField>
          <InputField label="Rookie Progression Speed">
            <select value={rookieProgression} onChange={(e) => setRookieProgression(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
              <option value="Slow">Slow</option>
              <option value="Normal">Normal</option>
              <option value="Fast">Fast</option>
            </select>
          </InputField>
          <div className="md:col-span-2 flex items-center gap-3 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
            <input type="checkbox" checked={showAdvancedStats} onChange={(e) => setShowAdvancedStats(e.target.checked)} className="w-5 h-5 accent-amber-500 rounded cursor-pointer" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Show Advanced Stats (PER, VORP) by Default</span>
          </div>
        </Section>

        <div className="border-t border-slate-800 pt-8">
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 hover:text-white transition-colors"
          >
            {showAdvanced ? '▼' : '▶'} Advanced Settings
          </button>
          
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 animate-in slide-in-from-top-4">
              <InputField label="Enable God Mode (Live Edits)">
                <div className="flex items-center gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <input type="checkbox" checked={godMode} onChange={(e) => setGodMode(e.target.checked)} className="w-5 h-5 accent-rose-500 cursor-pointer" />
                  <span className="text-xs font-bold text-rose-400 uppercase">UNLOCKED</span>
                </div>
              </InputField>
              <InputField label="Custom Season Length">
                <input type="number" value={seasonLength} onChange={(e) => setSeasonLength(parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" />
              </InputField>
              <InputField label="Custom Salary Cap Soft Limit">
                <input type="number" value={salaryCap} onChange={(e) => setSalaryCap(parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono" />
              </InputField>
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3">
             <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} className="w-5 h-5 accent-amber-500 rounded cursor-pointer" />
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Save as Default for Future Leagues</span>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button 
              onClick={handleConfirm}
              className="flex-1 md:flex-none px-12 py-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xl uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-amber-500/20 active:scale-95"
            >
              Continue to Team Selection
            </button>
            <button 
              onClick={onCancel}
              className="px-8 py-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold text-xl uppercase tracking-wider rounded-2xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueConfiguration;
