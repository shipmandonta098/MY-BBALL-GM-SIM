import React, { useState } from 'react';
import { Team } from '../types';
import TeamBadge from './TeamBadge';

interface TeamEditDraft {
  city: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string;
  division: string;
  population: number;
  stadiumCapacity: number;
  status: 'Active' | 'Inactive' | 'Relocating' | 'Expansion';
  borderStyle: 'None' | 'Solid' | 'Gradient';
}

interface TeamSelectionProps {
  teams: Team[];
  onSelectTeam: (teamId: string) => void;
  onEditTeam?: (teamId: string, updates: Partial<TeamEditDraft>) => void;
  onRemoveTeam?: (teamId: string) => void;
  onAddTeam?: () => void;
  canAddTeam?: boolean;
  onBack?: () => void;
}

const DIVISIONS = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];
const BORDER_STYLES: TeamEditDraft['borderStyle'][] = ['None', 'Solid', 'Gradient'];
const STATUS_OPTIONS: TeamEditDraft['status'][] = ['Active', 'Inactive', 'Relocating', 'Expansion'];

const TeamSelection: React.FC<TeamSelectionProps> = ({ teams, onSelectTeam, onEditTeam, onRemoveTeam, onAddTeam, canAddTeam, onBack }) => {
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TeamEditDraft | null>(null);
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);

  const getTeamRating = (team: Team) => {
    const avg = team.roster.reduce((sum, p) => sum + p.rating, 0) / team.roster.length;
    return Math.round(avg);
  };

  const marketColors = {
    Large: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    Medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Small: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  };

  const openEdit = (e: React.MouseEvent, team: Team) => {
    e.stopPropagation();
    setLogoPreviewError(false);
    setEditDraft({
      city: team.city,
      name: team.name,
      abbreviation: team.abbreviation ?? team.city.substring(0, 3).toUpperCase(),
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      logo: team.logo ?? '',
      division: team.division,
      population: team.population,
      stadiumCapacity: team.stadiumCapacity,
      status: team.status,
      borderStyle: team.borderStyle ?? 'None',
    });
    setEditingTeamId(team.id);
  };

  const handleEditSave = () => {
    if (!editingTeamId || !editDraft || !onEditTeam) return;
    onEditTeam(editingTeamId, editDraft);
    setEditingTeamId(null);
    setEditDraft(null);
  };

  const editingTeam = editingTeamId ? teams.find(t => t.id === editingTeamId) : null;
  const previewTeam: Team | null = editingTeam && editDraft
    ? { ...editingTeam, ...editDraft }
    : null;

  const handleSurpriseMe = () => {
    const active = teams.filter(t => t.status === 'Active' || !t.status);
    const pool = active.length > 0 ? active : teams;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) onSelectTeam(pick.id);
  };

  return (
    <div className="fixed inset-0 bg-slate-950 overflow-y-auto p-8 z-[110] animate-in fade-in duration-700">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-12 text-center sticky top-0 bg-slate-950/90 backdrop-blur-md py-6 z-20 border-b border-slate-800/50">
          {onBack && (
            <button
              onClick={onBack}
              className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            >
              ← Back
            </button>
          )}
          <h2 className="text-6xl font-display font-bold uppercase tracking-tighter text-white mb-2">
            Select Your <span className="text-amber-500">Franchise</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-5">
            Choose a team to lead to the championship.{' '}
            {onEditTeam && <span className="text-amber-500/80">Click the pencil icon to customize any team before you start.</span>}
          </p>
          <button
            onClick={handleSurpriseMe}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-400/30 transition-all active:scale-95"
          >
            🎲 Surprise Me
          </button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-20">
          {teams.map((team) => {
            const rating = getTeamRating(team);
            const isHovered = hoveredTeam === team.id;

            return (
              <div
                key={team.id}
                className="relative"
                onMouseEnter={() => setHoveredTeam(team.id)}
                onMouseLeave={() => setHoveredTeam(null)}
              >
                <button
                  onClick={() => onSelectTeam(team.id)}
                  className={`relative flex flex-col items-center p-6 bg-slate-900 border border-slate-800 rounded-2xl transition-all group hover:scale-[1.03] active:scale-95 overflow-hidden text-left w-full ${
                    isHovered ? 'ring-2 shadow-2xl' : ''
                  }`}
                  style={isHovered ? {
                    borderColor: team.primaryColor,
                    boxShadow: `0 0 40px ${team.primaryColor}1a`
                  } : {}}
                >
                  {/* Background Pattern */}
                  <div
                    className={`absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full blur-3xl transition-opacity duration-500 ${isHovered ? 'opacity-30' : 'opacity-0'}`}
                    style={{ backgroundColor: team.primaryColor }}
                  />

                  {/* Header info */}
                  <div className="w-full flex justify-between items-start mb-4">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${marketColors[team.marketSize]}`}>
                      {team.marketSize} Market
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">{team.conference}</span>
                  </div>

                  <div
                    className="w-24 h-24 mb-6 rounded-2xl overflow-hidden bg-slate-800 border-2 flex items-center justify-center transition-transform group-hover:rotate-3 shadow-inner"
                    style={{ borderColor: team.secondaryColor }}
                  >
                    <TeamBadge team={team} size="xl" />
                  </div>

                  <div className="text-center mb-6 w-full">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1">{team.city}</p>
                    <h3 className="font-display font-bold text-3xl uppercase text-white transition-colors leading-none" style={isHovered ? { color: team.primaryColor } : {}}>{team.name}</h3>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-px bg-slate-800 rounded-xl overflow-hidden border border-slate-800 mt-auto">
                    <div className="bg-slate-950/50 p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">OVR</div>
                      <div className="text-xl font-display font-bold" style={{ color: team.primaryColor }}>{rating}</div>
                    </div>
                    <div className="bg-slate-950/50 p-3 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">CAP</div>
                      <div className="text-xl font-display font-bold text-slate-300">${(team.budget / 1000000).toFixed(0)}M</div>
                    </div>
                  </div>

                  <div
                    className={`absolute inset-x-0 bottom-0 h-1 transition-all duration-500 transform ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
                    style={{ backgroundColor: team.primaryColor }}
                  />
                </button>

                {/* Edit button — shown on hover */}
                {onEditTeam && (
                  <button
                    onClick={(e) => openEdit(e, team)}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-slate-800/90 text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-all border border-slate-700"
                    title="Edit team info"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}

                {/* Remove button */}
                {onRemoveTeam && teams.length > 2 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setRemoveConfirmId(team.id); }}
                    className="absolute top-3 left-3 z-10 p-1.5 rounded-lg bg-slate-800/90 text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-all border border-slate-700"
                    title="Remove team"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {/* Remove confirmation overlay */}
                {removeConfirmId === team.id && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90 rounded-2xl p-4 text-center">
                    <p className="text-sm font-bold text-white">Remove {team.city} {team.name}?</p>
                    <p className="text-[10px] text-slate-400">This team and its roster will be removed from the league.</p>
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveTeam(team.id); setRemoveConfirmId(null); }}
                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase rounded-xl transition-all"
                      >
                        Remove
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRemoveConfirmId(null); }}
                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs uppercase rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Team card */}
          {onAddTeam && canAddTeam && (
            <div>
              <button
                onClick={onAddTeam}
                className="relative flex flex-col items-center justify-center p-6 bg-slate-900/50 border-2 border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-slate-900 rounded-2xl transition-all group w-full min-h-[280px] text-slate-600 hover:text-amber-500"
              >
                <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-current flex items-center justify-center mb-4 transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-black uppercase tracking-widest">Add Expansion Team</span>
                <span className="text-[10px] mt-1 font-bold uppercase tracking-wider opacity-60">Click to add next available franchise</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Team Modal */}
      {editDraft && previewTeam && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-slate-800 flex-shrink-0">
              <h3 className="text-2xl font-display font-bold uppercase text-white">Edit Team Info</h3>
              <button
                onClick={() => { setEditingTeamId(null); setEditDraft(null); }}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">

                {/* Left: Visual Identity */}
                <div className="p-7 space-y-6">
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Visual Identity</h4>

                  {/* Logo preview */}
                  <div className="aspect-square bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden relative group">
                    {editDraft.logo && !logoPreviewError
                      ? <img
                          src={editDraft.logo}
                          alt="Logo Preview"
                          className="w-32 h-32 object-contain"
                          referrerPolicy="no-referrer"
                          onError={() => setLogoPreviewError(true)}
                        />
                      : <div
                          className="w-32 h-32 flex items-center justify-center rounded-2xl text-white font-black text-4xl select-none"
                          style={{ backgroundColor: editDraft.primaryColor }}
                        >
                          {(editDraft.abbreviation || editDraft.name).substring(0, 3).toUpperCase()}
                        </div>
                    }
                  </div>

                  {/* Logo URL */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Logo URL</label>
                    <input
                      type="text"
                      value={editDraft.logo}
                      onChange={e => { setLogoPreviewError(false); setEditDraft(d => d ? { ...d, logo: e.target.value } : d); }}
                      placeholder="https://..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {/* Jersey colors */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Jersey Colors</label>
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1.5">
                        <div className="h-10 rounded-xl border border-slate-800 relative overflow-hidden">
                          <input
                            type="color"
                            value={editDraft.primaryColor}
                            onChange={e => setEditDraft(d => d ? { ...d, primaryColor: e.target.value } : d)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="w-full h-full" style={{ backgroundColor: editDraft.primaryColor }} />
                        </div>
                        <p className="text-[8px] font-black text-center text-slate-600 uppercase">Primary</p>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-10 rounded-xl border border-slate-800 relative overflow-hidden">
                          <input
                            type="color"
                            value={editDraft.secondaryColor}
                            onChange={e => setEditDraft(d => d ? { ...d, secondaryColor: e.target.value } : d)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="w-full h-full" style={{ backgroundColor: editDraft.secondaryColor }} />
                        </div>
                        <p className="text-[8px] font-black text-center text-slate-600 uppercase">Secondary</p>
                      </div>
                    </div>
                    <div className="h-3 w-full rounded-full overflow-hidden flex border border-slate-800">
                      <div className="flex-1" style={{ backgroundColor: editDraft.primaryColor }} />
                      <div className="flex-1" style={{ backgroundColor: editDraft.secondaryColor }} />
                    </div>
                  </div>

                  {/* Border style */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Border Style</label>
                    <select
                      value={editDraft.borderStyle}
                      onChange={e => setEditDraft(d => d ? { ...d, borderStyle: e.target.value as TeamEditDraft['borderStyle'] } : d)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
                    >
                      {BORDER_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Right: Team Information (spans 2 cols) */}
                <div className="lg:col-span-2 p-7 space-y-6">
                  {/* Conference badge + section title */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Team Information</h4>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${previewTeam.conference === 'Eastern' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {previewTeam.conference} Conference
                    </div>
                  </div>

                  {/* Preview badge */}
                  <div className="flex items-center gap-4 bg-slate-950/60 rounded-2xl p-4 border border-slate-800">
                    <div
                      className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: editDraft.secondaryColor }}
                    >
                      <TeamBadge team={previewTeam} size="lg" />
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">{editDraft.city}</p>
                      <p className="font-display font-bold text-xl uppercase" style={{ color: editDraft.primaryColor }}>{editDraft.name}</p>
                      <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest mt-0.5">{editDraft.abbreviation}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    {/* City */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">City / Region</label>
                      <input
                        type="text"
                        value={editDraft.city}
                        maxLength={20}
                        onChange={e => setEditDraft(d => d ? { ...d, city: e.target.value } : d)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Team Name */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Team Name</label>
                      <input
                        type="text"
                        value={editDraft.name}
                        maxLength={20}
                        onChange={e => setEditDraft(d => d ? { ...d, name: e.target.value } : d)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Abbreviation */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Abbreviation</label>
                      <input
                        type="text"
                        value={editDraft.abbreviation}
                        maxLength={4}
                        onChange={e => setEditDraft(d => d ? { ...d, abbreviation: e.target.value.toUpperCase() } : d)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50 uppercase"
                      />
                    </div>

                    {/* Division */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Division</label>
                      <select
                        value={editDraft.division}
                        onChange={e => setEditDraft(d => d ? { ...d, division: e.target.value } : d)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
                      >
                        {DIVISIONS.map(div => <option key={div} value={div}>{div}</option>)}
                      </select>
                    </div>

                    {/* Population */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Population (Millions)</label>
                      <input
                        type="number"
                        value={editDraft.population}
                        min={0.1}
                        step={0.1}
                        onChange={e => setEditDraft(d => d ? { ...d, population: parseFloat(e.target.value) || d.population } : d)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Stadium Capacity */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stadium Capacity</label>
                      <input
                        type="number"
                        value={editDraft.stadiumCapacity}
                        min={1000}
                        step={500}
                        onChange={e => setEditDraft(d => d ? { ...d, stadiumCapacity: parseInt(e.target.value) || d.stadiumCapacity } : d)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Team Status */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Team Status</label>
                      <select
                        value={editDraft.status}
                        onChange={e => setEditDraft(d => d ? { ...d, status: e.target.value as TeamEditDraft['status'] } : d)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex gap-3 px-8 py-5 border-t border-slate-800 flex-shrink-0">
              <button
                onClick={handleEditSave}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase text-sm rounded-2xl transition-all active:scale-95"
              >
                Save Changes
              </button>
              <button
                onClick={() => { setEditingTeamId(null); setEditDraft(null); }}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold uppercase text-sm rounded-2xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamSelection;
