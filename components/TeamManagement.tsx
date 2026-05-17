
import React, { useState, useEffect } from 'react';
import { Team, LeagueState, Division, Conference, MarketSize, NewsItem } from '../types';
import TeamBadge from './TeamBadge';

// ── Relocation destination data ───────────────────────────────────────────────
// Cities are shown only when they are NOT already occupied by another franchise.
// population = metro area in millions.  cost = relocation fee in $M.
type RelocationCity = {
  city: string; state: string; abbr: string;
  marketSize: MarketSize; population: number;
  stadiumCapacity: number; cost: number;
  nameSuggestions: string[];
};
const RELOCATION_CITIES: RelocationCity[] = [
  // ── Large markets ──────────────────────────────────────────────────────────
  { city: 'Atlanta',      state: 'GA', abbr: 'ATL', marketSize: 'Large',  population: 6.1,  stadiumCapacity: 21_000, cost:  75, nameSuggestions: ['Hawks', 'Storm', 'Phoenix', 'Falcons', 'Inferno'] },
  { city: 'Seattle',      state: 'WA', abbr: 'SEA', marketSize: 'Large',  population: 4.0,  stadiumCapacity: 20_000, cost: 100, nameSuggestions: ['SuperSonics', 'Storm', 'Kraken', 'Emeralds'] },
  { city: 'Vancouver',    state: 'BC', abbr: 'VAN', marketSize: 'Large',  population: 3.3,  stadiumCapacity: 19_500, cost:  85, nameSuggestions: ['Grizzlies', 'Orcas', 'Ravens', 'Canucks'] },
  { city: 'Montreal',     state: 'QC', abbr: 'MTL', marketSize: 'Large',  population: 4.2,  stadiumCapacity: 20_000, cost:  90, nameSuggestions: ['Royale', 'Express', 'Storm', 'Nordiques'] },
  { city: 'Mexico City',  state: 'MX', abbr: 'MEX', marketSize: 'Large',  population: 21.7, stadiumCapacity: 22_000, cost: 150, nameSuggestions: ['Aztecs', 'Dragons', 'Condors', 'Gigantes'] },
  // ── Medium markets ─────────────────────────────────────────────────────────
  { city: 'Tampa',        state: 'FL', abbr: 'TAM', marketSize: 'Medium', population: 3.2,  stadiumCapacity: 19_500, cost:  70, nameSuggestions: ['Storm', 'Lightning', 'Rays', 'Tide'] },
  { city: 'St. Louis',    state: 'MO', abbr: 'STL', marketSize: 'Medium', population: 2.8,  stadiumCapacity: 19_000, cost:  65, nameSuggestions: ['Arch', 'Blues', 'Hawks', 'Express'] },
  { city: 'Baltimore',    state: 'MD', abbr: 'BAL', marketSize: 'Medium', population: 2.9,  stadiumCapacity: 18_500, cost:  60, nameSuggestions: ['Ravens', 'Bullets', 'Crabs', 'Chesapeake'] },
  { city: 'San Diego',    state: 'CA', abbr: 'SDG', marketSize: 'Medium', population: 3.3,  stadiumCapacity: 19_000, cost:  70, nameSuggestions: ['Sails', 'Wave', 'Gulls', 'Clippers'] },
  { city: 'Pittsburgh',   state: 'PA', abbr: 'PIT', marketSize: 'Medium', population: 2.4,  stadiumCapacity: 18_500, cost:  60, nameSuggestions: ['Steel', 'Condors', 'Ironmen', 'Forge'] },
  { city: 'Kansas City',  state: 'MO', abbr: 'KCK', marketSize: 'Medium', population: 2.2,  stadiumCapacity: 18_500, cost:  55, nameSuggestions: ['Kings', 'Chiefs', 'Scouts', 'Royals'] },
  { city: 'Nashville',    state: 'TN', abbr: 'NAS', marketSize: 'Medium', population: 2.0,  stadiumCapacity: 18_000, cost:  60, nameSuggestions: ['Rhythm', 'Sounds', 'Predators', 'Crescents'] },
  { city: 'Cincinnati',   state: 'OH', abbr: 'CIN', marketSize: 'Medium', population: 2.3,  stadiumCapacity: 18_000, cost:  55, nameSuggestions: ['Cyclones', 'Kings', 'Steam', 'Reds'] },
  { city: 'Jacksonville', state: 'FL', abbr: 'JAX', marketSize: 'Medium', population: 1.7,  stadiumCapacity: 18_000, cost:  55, nameSuggestions: ['Jaguars', 'Surf', 'Tide', 'Suns'] },
  // ── Small markets ──────────────────────────────────────────────────────────
  { city: 'Louisville',   state: 'KY', abbr: 'LOU', marketSize: 'Small',  population: 1.4,  stadiumCapacity: 17_000, cost:  50, nameSuggestions: ['Cardinals', 'Colonels', 'Speed', 'Thoroughbreds'] },
  { city: 'Raleigh',      state: 'NC', abbr: 'RAL', marketSize: 'Small',  population: 1.4,  stadiumCapacity: 17_500, cost:  50, nameSuggestions: ['Triangles', 'Wolves', 'Hurricanes', 'Pack'] },
  { city: 'Columbus',     state: 'OH', abbr: 'COL', marketSize: 'Small',  population: 2.1,  stadiumCapacity: 17_500, cost:  50, nameSuggestions: ['Crew', 'Cannons', 'Buckeyes', 'Blue Jackets'] },
  { city: 'Buffalo',      state: 'NY', abbr: 'BUF', marketSize: 'Small',  population: 1.2,  stadiumCapacity: 17_000, cost:  50, nameSuggestions: ['Sabres', 'Bison', 'Blizzard', 'Express'] },
  { city: 'Hartford',     state: 'CT', abbr: 'HAR', marketSize: 'Small',  population: 1.2,  stadiumCapacity: 16_500, cost:  45, nameSuggestions: ['Whalers', 'Huskies', 'Wolf Pack'] },
  { city: 'Anchorage',    state: 'AK', abbr: 'ANC', marketSize: 'Small',  population: 0.4,  stadiumCapacity: 15_000, cost:  45, nameSuggestions: ['Aurora', 'Icebreakers', 'Wolves', 'Northern Lights'] },
];

const MARKET_SIZE_LABEL: Record<MarketSize, string> = {
  Large: 'Large',
  Medium: 'Medium',
  Small: 'Small',
};
const MARKET_COLOR: Record<MarketSize, string> = {
  Large:  'text-amber-400',
  Medium: 'text-slate-300',
  Small:  'text-slate-500',
};

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
  const [logoPreviewError, setLogoPreviewError] = React.useState(false);
  const [secondaryLogoPreviewError, setSecondaryLogoPreviewError] = React.useState(false);
  const [selectedRelocationCity, setSelectedRelocationCity] = useState('');
  const [showRelocationConfirm, setShowRelocationConfirm] = useState(false);

  const selectedTeam = league.teams.find(t => t.id === selectedTeamId) || userTeam;

  useEffect(() => {
    setEditedTeam({ ...selectedTeam });
  }, [selectedTeamId, league.teams]);

  useEffect(() => { setLogoPreviewError(false); }, [editedTeam?.logo]);

  if (!editedTeam) return null;

  const isGodMode = league.settings.godMode;
  const canEdit = isGodMode || selectedTeamId === league.userTeamId;

  // Cities already used by other franchises in the current league
  const occupiedCities = new Set(
    league.teams.filter(t => t.id !== editedTeam?.id).map(t => t.city)
  );
  const availableCities = RELOCATION_CITIES.filter(c => !occupiedCities.has(c.city));
  const relocationTarget = RELOCATION_CITIES.find(c => c.city === selectedRelocationCity) ?? null;

  const handleRelocation = () => {
    if (!editedTeam || !relocationTarget) return;
    const oldCity   = editedTeam.city;
    const oldName   = editedTeam.name;
    const moralePenalty = Math.floor(Math.random() * 6) + 5; // 5–10 pts
    const feeDollars    = relocationTarget.cost * 1_000_000;

    const updatedTeam: Team = {
      ...editedTeam,
      city:            relocationTarget.city,
      abbreviation:    relocationTarget.abbr,
      marketSize:      relocationTarget.marketSize,
      population:      relocationTarget.population,
      stadiumCapacity: relocationTarget.stadiumCapacity,
      status:          'Active',
      finances: {
        ...editedTeam.finances,
        cash: (editedTeam.finances?.cash ?? 0) - feeDollars,
        fanHype: Math.max(0, (editedTeam.finances?.fanHype ?? 65) - 15),
      },
      roster: editedTeam.roster.map(p => ({
        ...p,
        morale: Math.max(0, (p.morale ?? 75) - moralePenalty),
      })),
    };

    const newsItem: NewsItem = {
      id:            `news-${Date.now()}-relocation`,
      category:      'transaction',
      headline:      'BREAKING',
      content:       `BREAKING: The ${oldCity} ${oldName} have officially relocated to ${relocationTarget.city}! ` +
                     `The franchise paid a $${relocationTarget.cost}M relocation fee and will now be known as the ` +
                     `${relocationTarget.city} ${oldName}. Player morale took a short-term hit from the move.`,
      timestamp:     league.currentDay,
      realTimestamp: Date.now(),
      teamId:        editedTeam.id,
      isBreaking:    true,
    };

    const updatedTeams = league.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t);
    updateLeague({
      teams:   updatedTeams,
      newsFeed: [newsItem, ...(league.newsFeed ?? [])].slice(0, 100),
    });

    setEditedTeam(updatedTeam);
    setSelectedRelocationCity('');
    setShowRelocationConfirm(false);
  };

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
                {editedTeam.logo && !logoPreviewError
                  ? <img
                      src={editedTeam.logo}
                      alt="Logo Preview"
                      className="w-48 h-48 object-contain transition-transform group-hover:scale-110 duration-500"
                      referrerPolicy="no-referrer"
                      onError={() => setLogoPreviewError(true)}
                    />
                  : <div
                      className="w-48 h-48 flex items-center justify-center rounded-2xl text-white font-black text-5xl select-none"
                      style={{ backgroundColor: editedTeam.primaryColor }}
                    >
                      {(editedTeam.abbreviation || editedTeam.name).substring(0, 3).toUpperCase()}
                    </div>
                }
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <p className="text-[10px] font-black text-white uppercase tracking-widest">Logo Preview</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Primary Logo URL</label>
                <input
                  type="text"
                  value={editedTeam.logo}
                  onChange={(e) => { setEditedTeam({...editedTeam, logo: e.target.value}); setLogoPreviewError(false); }}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>

              {/* Secondary logo */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-3">
                  <div
                    className="w-14 h-14 rounded-xl border border-slate-700 flex items-center justify-center overflow-hidden shrink-0"
                    style={{ backgroundColor: editedTeam.primaryColor }}
                  >
                    {editedTeam.secondaryLogo && !secondaryLogoPreviewError
                      ? <img
                          src={editedTeam.secondaryLogo}
                          alt="Secondary Logo"
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                          onError={() => setSecondaryLogoPreviewError(true)}
                        />
                      : <span className="text-white font-black text-xs opacity-40">ALT</span>
                    }
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Secondary Logo URL</label>
                    <input
                      type="text"
                      value={(editedTeam as any).secondaryLogo ?? ''}
                      onChange={(e) => { setEditedTeam({...editedTeam, secondaryLogo: e.target.value} as any); setSecondaryLogoPreviewError(false); }}
                      disabled={!canEdit}
                      placeholder="Optional alternate / away logo"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/50 disabled:opacity-50 placeholder:text-slate-600"
                    />
                  </div>
                </div>
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
                <input
                  type="text"
                  value={editedTeam.city}
                  onChange={(e) => setEditedTeam({...editedTeam, city: e.target.value})}
                  disabled={!canEdit}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
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

          {/* ── Relocate Team ───────────────────────────────────────────── */}
          {canEdit && (
            <div className="bg-slate-900 border border-orange-500/20 rounded-[2rem] p-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[80px] rounded-full -mr-32 -mt-32 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-2 h-6 bg-orange-500 rounded-full" />
                  <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-[0.5em]">Relocate Franchise</h3>
                </div>

                {!showRelocationConfirm ? (
                  <div className="space-y-6">
                    {/* City picker */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                        Destination City
                        <span className="ml-2 text-slate-700 normal-case tracking-normal font-normal">
                          — {availableCities.length} cities available
                        </span>
                      </label>
                      <select
                        value={selectedRelocationCity}
                        onChange={(e) => { setSelectedRelocationCity(e.target.value); setShowRelocationConfirm(false); }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-orange-500/50"
                      >
                        <option value="">— Select destination city —</option>
                        {availableCities.map(c => (
                          <option key={c.city} value={c.city}>
                            {c.city}, {c.state} — {c.marketSize} market · {c.population}M pop · ${c.cost}M fee
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Preview panel */}
                    {relocationTarget && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Market</p>
                          <p className={`text-lg font-display font-bold ${MARKET_COLOR[relocationTarget.marketSize]}`}>
                            {MARKET_SIZE_LABEL[relocationTarget.marketSize]}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Population</p>
                          <p className="text-lg font-display font-bold text-white">{relocationTarget.population}M</p>
                        </div>
                        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Arena Cap.</p>
                          <p className="text-lg font-display font-bold text-white">{relocationTarget.stadiumCapacity.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-slate-950 rounded-2xl border border-orange-500/30 bg-orange-500/5">
                          <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1">Reloc. Fee</p>
                          <p className="text-lg font-display font-bold text-orange-400">${relocationTarget.cost}M</p>
                        </div>
                      </div>
                    )}

                    {relocationTarget && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Suggested Team Names</p>
                        <div className="flex flex-wrap gap-2">
                          {relocationTarget.nameSuggestions.map(n => (
                            <button
                              key={n}
                              onClick={() => setEditedTeam(prev => prev ? { ...prev, name: n } : prev)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/40 rounded-lg text-xs font-bold text-slate-300 hover:text-amber-400 transition-all"
                            >
                              {relocationTarget.city} {n}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9px] text-slate-600">Click a name to apply it to the Team Name field above.</p>
                      </div>
                    )}

                    <button
                      onClick={() => setShowRelocationConfirm(true)}
                      disabled={!relocationTarget}
                      className="w-full py-4 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/40 hover:border-orange-500 text-orange-400 font-display font-black uppercase rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Initiate Relocation →
                    </button>
                  </div>
                ) : relocationTarget ? (
                  /* ── Confirm dialog ── */
                  <div className="space-y-6">
                    <div className="p-6 bg-orange-500/10 border border-orange-500/40 rounded-2xl space-y-4">
                      <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.3em]">⚠ Confirm Relocation</p>
                      <p className="text-sm font-bold text-white leading-relaxed">
                        Move the <span className="text-amber-400">{editedTeam.city} {editedTeam.name}</span> to{' '}
                        <span className="text-amber-400">{relocationTarget.city}, {relocationTarget.state}</span>?
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="p-3 bg-slate-950/60 rounded-xl">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Relocation Fee</p>
                          <p className="font-bold text-rose-400 mt-1">−${relocationTarget.cost}M cash</p>
                        </div>
                        <div className="p-3 bg-slate-950/60 rounded-xl">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Player Morale</p>
                          <p className="font-bold text-rose-400 mt-1">−5 to −10 pts (all players)</p>
                        </div>
                        <div className="p-3 bg-slate-950/60 rounded-xl">
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Fan Hype</p>
                          <p className="font-bold text-rose-400 mt-1">−15 pts (short-term)</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        New abbreviation: <span className="text-slate-300 font-mono font-bold">{relocationTarget.abbr}</span> ·
                        Market: <span className={`font-bold ${MARKET_COLOR[relocationTarget.marketSize]}`}>{relocationTarget.marketSize}</span> ·
                        Arena cap: <span className="text-slate-300 font-bold">{relocationTarget.stadiumCapacity.toLocaleString()}</span>
                      </p>
                      {(editedTeam.finances?.cash ?? 0) < relocationTarget.cost * 1_000_000 && (
                        <p className="text-[10px] font-bold text-rose-400">
                          ⚠ Insufficient cash — this will put your franchise in debt.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={handleRelocation}
                        className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-slate-950 font-display font-black uppercase rounded-2xl transition-all shadow-lg shadow-orange-500/20"
                      >
                        Confirm — Move to {relocationTarget.city}
                      </button>
                      <button
                        onClick={() => setShowRelocationConfirm(false)}
                        className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-black uppercase rounded-2xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

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
