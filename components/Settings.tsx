
import React, { useState } from 'react';
import { LeagueState, LeagueSettings } from '../types';

interface SettingsProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

type SettingsTab = 'league' | 'gameplay' | 'difficulty' | 'advanced';

const Settings: React.FC<SettingsProps> = ({ league, updateLeague }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('league');
  const [searchQuery, setSearchQuery] = useState('');

  const updateSettings = (updates: Partial<LeagueSettings>) => {
    updateLeague({
      settings: {
        ...league.settings,
        ...updates
      }
    });
  };

  const formatMoney = (val: number) => `$${(val / 1000000).toFixed(0)}M`;

  const TabButton = ({ id, label }: { id: SettingsTab, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === id ? 'bg-amber-500 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
    >
      {label}
    </button>
  );

  const SliderField = ({ label, value, min, max, onChange, step = 1, unit = '' }: any) => (
    <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
        <span className="text-amber-500 font-display font-bold text-xl">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
      />
    </div>
  );

  const ToggleField = ({ label, value, onChange }: any) => (
    <div className="flex items-center justify-between bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</label>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${value ? 'bg-amber-500' : 'bg-slate-700'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  const handleExport = () => {
    const dataStr = JSON.stringify(league, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `${league.leagueName.replace(/\s+/g, '_')}_full_save.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40 max-w-5xl mx-auto">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white">League <span className="text-amber-500">Settings</span></h2>
            <div className="flex gap-2">
              <TabButton id="league" label="League" />
              <TabButton id="gameplay" label="Gameplay" />
              <TabButton id="difficulty" label="Sliders" />
              <TabButton id="advanced" label="God Mode" />
            </div>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-6 py-3 text-sm text-slate-300 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'league' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2">
            <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Franchise Name</label>
              <input
                type="text"
                value={league.leagueName}
                onChange={(e) => updateLeague({ leagueName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-display text-xl focus:outline-none"
              />
            </div>
            <ToggleField label="Owner Patience Meter" value={league.settings.ownerMeterEnabled} onChange={(v: boolean) => updateSettings({ ownerMeterEnabled: v })} />
            <SliderField label="Salary Cap" value={league.settings.salaryCap} min={80000000} max={250000000} step={1000000} onChange={(v: number) => updateSettings({ salaryCap: v })} unit="" />
            <SliderField label="Luxury Tax Line" value={league.settings.luxuryTaxLine} min={100000000} max={300000000} step={1000000} onChange={(v: number) => updateSettings({ luxuryTaxLine: v })} unit="" />
            <div className="md:col-span-2 flex gap-4 pt-4">
              <button onClick={handleExport} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-bold uppercase rounded-2xl transition-all flex items-center justify-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Export Full Save Data
              </button>
            </div>
          </div>
        )}

        {activeTab === 'gameplay' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2">
            {/* Fix: Replaced SliderField with select for categorical setting injuryFrequency */}
            <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Injury Frequency</label>
              <select
                value={league.settings.injuryFrequency}
                onChange={(e) => updateSettings({ injuryFrequency: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
            {/* Fix: Replaced SliderField with select for categorical setting tradeDifficulty */}
            <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Trade Realism</label>
              <select
                value={league.settings.tradeDifficulty}
                onChange={(e) => updateSettings({ tradeDifficulty: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold"
              >
                <option value="Easy">Easy</option>
                <option value="Realistic">Realistic</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Simulation Engine Mode</label>
              <select
                value={league.settings.simSpeed}
                onChange={(e) => updateSettings({ simSpeed: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold"
              >
                <option value="Normal">Normal (Default)</option>
                <option value="Smarter">Smarter (Tactical Focus)</option>
                <option value="Faster">Faster (High Throughput)</option>
              </select>
            </div>
            <SliderField label="Season Length (Games)" value={league.settings.seasonLength} min={10} max={82} onChange={(v: number) => updateSettings({ seasonLength: v })} />
          </div>
        )}

        {activeTab === 'difficulty' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2">
            <div className="md:col-span-2 bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl mb-4">
              <h4 className="text-amber-500 font-display font-bold uppercase mb-2 tracking-widest">Progression Tuning</h4>
              <p className="text-xs text-amber-500/70">Adjust how fast players improve or decline during the offseason.</p>
            </div>
            {/* Fix: Replaced SliderField with select for categorical setting rookieProgressionRate */}
            <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Rookie Progression Speed</label>
              <select
                value={league.settings.rookieProgressionRate}
                onChange={(e) => updateSettings({ rookieProgressionRate: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold"
              >
                <option value="Slow">Slow</option>
                <option value="Normal">Normal</option>
                <option value="Fast">Fast</option>
              </select>
            </div>
            <SliderField label="Veteran Attribute Decline" value={league.settings.vetDeclineRate} min={0} max={200} onChange={(v: number) => updateSettings({ vetDeclineRate: v })} unit="%" />
            <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-800">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Overall Difficulty</label>
              <div className="flex gap-2">
                {['Rookie', 'Pro', 'All-Star', 'Legend'].map(d => (
                  <button
                    key={d}
                    onClick={() => updateSettings({ difficulty: d as any })}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${league.settings.difficulty === d ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-2">
            <div className={`p-8 rounded-[2.5rem] border-2 transition-all ${league.settings.godMode ? 'bg-rose-500/10 border-rose-500' : 'bg-slate-900 border-slate-800 opacity-50'}`}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className={`text-2xl font-display font-bold uppercase ${league.settings.godMode ? 'text-rose-500' : 'text-slate-400'}`}>Advanced God Mode</h3>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Unlock internal debug controls and force trade logic.</p>
                </div>
                <ToggleField label="" value={league.settings.godMode} onChange={(v: boolean) => updateSettings({ godMode: v })} />
              </div>

              {league.settings.godMode && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button onClick={() => alert('God Mode: All players morale set to 100')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">Maximize Morale</button>
                  <button onClick={() => alert('God Mode: Budget set to $1 Billion')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">Infinite Cash</button>
                  <button onClick={() => alert('God Mode: All injuries healed')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">Instant Recovery</button>
                  <button onClick={() => updateLeague({ currentDay: league.currentDay + 1 })} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">Force Day Advance</button>
                  <button onClick={() => updateLeague({ isOffseason: !league.isOffseason })} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">Toggle Offseason</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
