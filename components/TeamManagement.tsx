
import React, { useState, useEffect } from 'react';
import { Team, LeagueState, Division, Conference } from '../types';

interface TeamManagementProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  initialTeamId?: string;
  onClose?: () => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ league, updateLeague, initialTeamId, onClose }) => {
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || league.userTeamId);
  const [editedTeam, setEditedTeam] = useState<Team | null>(null);

  const selectedTeam = league.teams.find(t => t.id === selectedTeamId) || userTeam;

  useEffect(() => {
    setEditedTeam({ ...selectedTeam });
  }, [selectedTeamId, league.teams]);

  if (!editedTeam) return null;

  const isGodMode = league.settings.godMode;
  const canEdit = isGodMode || selectedTeamId === league.userTeamId;

  const handleSave = () => {
    if (!canEdit) return;
    const updatedTeams = league.teams.map(t => t.id === editedTeam.id ? editedTeam : t);
    updateLeague({ teams: updatedTeams });
    if (onClose) onClose();
  };

  const divisions: Division[] = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];
  const borderStyles: ('None' | 'Solid' | 'Gradient')[] = ['None', 'Solid', 'Gradient'];
  const statuses: ('Active' | 'Inactive' | 'Relocating' | 'Expansion')[] = ['Active', 'Inactive', 'Relocating', 'Expansion'];

  const getConference = (div: Division): Conference => {
    if (['Atlantic', 'Central', 'Southeast'].includes(div)) return 'Eastern';
    return 'Western';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40 max-w-6xl mx-auto">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Team <span className="text-amber-500">Management</span></h2>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Customize your franchise identity and operations</p>
          </div>
          
          {isGodMode && (
            <select 
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-amber-500 focus:outline-none focus:border-amber-500/50"
            >
              {league.teams.map(t => (
                <option key={t.id} value={t.id}>{t.city} {t.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Visual Identity */}
        <div className="space-y-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-xl space-y-6">
            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Visual Identity</h3>
            
            <div className="space-y-4">
              <div className="aspect-square bg-slate-950 rounded-3xl border border-slate-800 flex items-center justify-center overflow-hidden relative group">
                <img 
                  src={editedTeam.logo} 
                  alt="Logo Preview" 
                  className="w-48 h-48 object-contain transition-transform group-hover:scale-110 duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <p className="text-[10px] font-black text-white uppercase tracking-widest">Logo Preview</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Logo URL</label>
                <input 
                  type="text" 
                  value={editedTeam.logo}
                  onChange={(e) => setEditedTeam({...editedTeam, logo: e.target.value})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>

              <div className="space-y-4 pt-4">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Jersey Colors</label>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-12 rounded-xl border border-slate-800 relative overflow-hidden">
                      <input 
                        type="color" 
                        value={editedTeam.primaryColor}
                        onChange={(e) => setEditedTeam({...editedTeam, primaryColor: e.target.value})}
                        disabled={!canEdit}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: editedTeam.primaryColor }}></div>
                    </div>
                    <p className="text-[8px] font-black text-center text-slate-600 uppercase">Primary</p>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="h-12 rounded-xl border border-slate-800 relative overflow-hidden">
                      <input 
                        type="color" 
                        value={editedTeam.secondaryColor}
                        onChange={(e) => setEditedTeam({...editedTeam, secondaryColor: e.target.value})}
                        disabled={!canEdit}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: editedTeam.secondaryColor }}></div>
                    </div>
                    <p className="text-[8px] font-black text-center text-slate-600 uppercase">Secondary</p>
                  </div>
                </div>
                
                <div className="h-4 w-full rounded-full overflow-hidden flex border border-slate-800">
                  <div className="flex-1" style={{ backgroundColor: editedTeam.primaryColor }}></div>
                  <div className="flex-1" style={{ backgroundColor: editedTeam.secondaryColor }}></div>
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Border Style</label>
                <select 
                  value={editedTeam.borderStyle}
                  onChange={(e) => setEditedTeam({...editedTeam, borderStyle: e.target.value as any})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                >
                  {borderStyles.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Middle & Right Columns: Team Details & Operations */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Team Information</h3>
              <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${editedTeam.conference === 'Eastern' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {editedTeam.conference} Conference
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">City / Region</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={editedTeam.city}
                    onChange={(e) => setEditedTeam({...editedTeam, city: e.target.value})}
                    disabled={!canEdit}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                  />
                  <button 
                    onClick={() => setEditedTeam({...editedTeam, status: 'Relocating'})}
                    disabled={!canEdit}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all text-[10px] font-black uppercase disabled:opacity-50"
                  >
                    Move
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Team Name</label>
                <input 
                  type="text" 
                  value={editedTeam.name}
                  onChange={(e) => setEditedTeam({...editedTeam, name: e.target.value})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Abbreviation</label>
                <input 
                  type="text" 
                  maxLength={4}
                  value={editedTeam.abbreviation}
                  onChange={(e) => setEditedTeam({...editedTeam, abbreviation: e.target.value.toUpperCase()})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Division</label>
                <select 
                  value={editedTeam.division}
                  onChange={(e) => {
                    const div = e.target.value as Division;
                    setEditedTeam({...editedTeam, division: div, conference: getConference(div)});
                  }}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                >
                  {divisions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Population (Millions)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={editedTeam.population}
                  onChange={(e) => setEditedTeam({...editedTeam, population: parseFloat(e.target.value)})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Stadium Capacity</label>
                <input 
                  type="number" 
                  value={editedTeam.stadiumCapacity}
                  onChange={(e) => setEditedTeam({...editedTeam, stadiumCapacity: parseInt(e.target.value)})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Team Status</label>
                <select 
                  value={editedTeam.status}
                  onChange={(e) => setEditedTeam({...editedTeam, status: e.target.value as any})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                >
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-12 flex gap-4">
              <button 
                onClick={handleSave}
                disabled={!canEdit}
                className="flex-1 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black uppercase rounded-2xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                Save Changes
              </button>
              {onClose && (
                <button 
                  onClick={onClose}
                  className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-black uppercase rounded-2xl transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-xl">
            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] mb-6">Revenue Impact Preview</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Market Potential</p>
                <p className="text-2xl font-display font-bold text-white">{(editedTeam.population * 1.2).toFixed(1)}x</p>
              </div>
              <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Max Gate Revenue</p>
                <p className="text-2xl font-display font-bold text-emerald-400">${((editedTeam.stadiumCapacity * 85) / 1000000).toFixed(2)}M</p>
              </div>
              <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Brand Strength</p>
                <p className="text-2xl font-display font-bold text-amber-500">{editedTeam.status === 'Active' ? '100%' : '65%'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamManagement;
