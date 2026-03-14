import React, { useState } from 'react';
import { Team } from '../types';
import TeamBadge from './TeamBadge';

interface TeamEditDraft {
  city: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
}

interface TeamSelectionProps {
  teams: Team[];
  onSelectTeam: (teamId: string) => void;
  onEditTeam?: (teamId: string, updates: Partial<TeamEditDraft>) => void;
}

const TeamSelection: React.FC<TeamSelectionProps> = ({ teams, onSelectTeam, onEditTeam }) => {
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TeamEditDraft | null>(null);

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
    setEditDraft({
      city: team.city,
      name: team.name,
      abbreviation: team.abbreviation ?? team.city.substring(0, 3).toUpperCase(),
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
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

  return (
    <div className="fixed inset-0 bg-slate-950 overflow-y-auto p-8 z-[110] animate-in fade-in duration-700">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-12 text-center sticky top-0 bg-slate-950/90 backdrop-blur-md py-6 z-20 border-b border-slate-800/50">
          <h2 className="text-6xl font-display font-bold uppercase tracking-tighter text-white mb-2">
            Select Your <span className="text-amber-500">Franchise</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Choose a team to lead to the championship.{' '}
            {onEditTeam && <span className="text-amber-500/80">Click the pencil icon to customize any team before you start.</span>}
          </p>
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
                    className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-slate-800/90 text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-all border border-slate-700 opacity-100 sm:opacity-0 ${isHovered ? 'sm:opacity-100' : ''}`}
                    title="Edit team info"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Team Modal */}
      {editDraft && previewTeam && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
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

            {/* Preview badge */}
            <div className="flex items-center gap-5 bg-slate-950/60 rounded-2xl p-4 border border-slate-800">
              <div
                className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border-2 flex items-center justify-center flex-shrink-0"
                style={{ borderColor: editDraft.secondaryColor }}
              >
                <TeamBadge team={previewTeam} size="lg" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">{editDraft.city}</p>
                <p className="font-display font-bold text-2xl uppercase" style={{ color: editDraft.primaryColor }}>{editDraft.name}</p>
                <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest mt-0.5">{editDraft.abbreviation}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">City</label>
                <input
                  type="text"
                  value={editDraft.city}
                  maxLength={20}
                  onChange={e => setEditDraft(d => d ? { ...d, city: e.target.value } : d)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Team Name</label>
                <input
                  type="text"
                  value={editDraft.name}
                  maxLength={20}
                  onChange={e => setEditDraft(d => d ? { ...d, name: e.target.value } : d)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Abbreviation</label>
                <input
                  type="text"
                  value={editDraft.abbreviation}
                  maxLength={4}
                  onChange={e => setEditDraft(d => d ? { ...d, abbreviation: e.target.value.toUpperCase() } : d)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-display text-sm focus:outline-none focus:border-amber-500/50 uppercase"
                />
              </div>
              <div /> {/* spacer */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editDraft.primaryColor}
                    onChange={e => setEditDraft(d => d ? { ...d, primaryColor: e.target.value } : d)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={editDraft.primaryColor}
                    maxLength={7}
                    onChange={e => setEditDraft(d => d ? { ...d, primaryColor: e.target.value } : d)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editDraft.secondaryColor}
                    onChange={e => setEditDraft(d => d ? { ...d, secondaryColor: e.target.value } : d)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={editDraft.secondaryColor}
                    maxLength={7}
                    onChange={e => setEditDraft(d => d ? { ...d, secondaryColor: e.target.value } : d)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
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
