import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Team, Player, Position, PlayerStatus, PersonalityTrait, Coach, TeamRotation } from '../types';
import TeamBadge from './TeamBadge';
import WatchToggle from './WatchToggle';
import { getFlag } from '../constants';
import { fmtSalary } from '../utils/formatters';

export interface RosterProps {
  leagueTeams: Team[];
  userTeamId: string;
  initialTeamId?: string;
  onScout: (player: Player) => void;
  onScoutCoach: (coach: Coach) => void;
  scoutingReport: { playerId: string; report: string } | null;
  onUpdateTeamRoster?: (teamId: string, updatedRoster: Player[]) => void;
  onManageTeam?: (teamId: string) => void;
  godMode?: boolean;
  watchList?: string[];
  onToggleWatch?: (id: string) => void;
}

const traitIcons: Record<PersonalityTrait, string> = {
  'Leader': '⭐',
  'Diva/Star': '💅',
  'Loyal': '🤝',
  'Professional': '💼',
  'Gym Rat': '🏋️',
  'Lazy': '💤',
  'Clutch': '🎯',
  'Tough/Alpha': '🛡️',
  'Friendly/Team First': '👋',
  'Money Hungry': '💰',
  'Hot Head': '🔥',
  'Workhorse': '🐴',
  'Streaky': '📈'
};

/** True if a player is currently injured (status field or days remaining). */
const isPlayerInjured = (p: Player) =>
  p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0);

/** True if a player is currently serving a suspension. */
const isPlayerSuspended = (p: Player) =>
  !!p.isSuspended && (p.suspensionGames ?? 0) > 0;

/** True if a player is unavailable for any reason */
const isPlayerUnavailable = (p: Player) => isPlayerInjured(p) || isPlayerSuspended(p);

/** Derive display status from rotation slot, overriding with injury/suspension when applicable. */
const getEffectiveStatus = (p: Player, rotation?: TeamRotation): PlayerStatus => {
  if (isPlayerInjured(p)) return 'Injured';
  if (isPlayerSuspended(p)) return 'Injured'; // reuse Injured slot for display, badge overrides
  if (!rotation) return p.status;
  const starterIds = Object.values(rotation.starters);
  if (starterIds.includes(p.id)) return 'Starter';
  if (rotation.bench.includes(p.id)) return 'Rotation';
  if (rotation.reserves.includes(p.id)) return 'Bench';
  return p.status;
};

const ARCHETYPE_COLORS: Record<string, string> = {
  'Hybrid Star':        'bg-amber-500/20 text-amber-400 border-amber-500/30',
  '3&D Wing':           'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Pure Scorer':        'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'Lockdown Defender':  'bg-slate-500/20 text-slate-400 border-slate-500/30',
  'Stretch Big':        'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'Rim Protector':      'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Playmaking Guard':   'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Two-Way Forward':    'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

const Roster: React.FC<RosterProps> = ({ leagueTeams, userTeamId, initialTeamId, onScout, onScoutCoach, scoutingReport, onUpdateTeamRoster, onManageTeam, godMode, watchList = [], onToggleWatch }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || userTeamId);
  const [searchTerm, setSearchTerm] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [minOvr, setMinOvr] = useState(60);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'rating', direction: 'desc' });
  const [injuredOnly, setInjuredOnly] = useState(false);
  const [godModeMsg, setGodModeMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const importRosterRef = useRef<HTMLInputElement>(null);
  const importPlayerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTeamId) {
      setSelectedTeamId(initialTeamId);
    }
  }, [initialTeamId]);

  const activeTeam = useMemo(() => 
    leagueTeams.find(t => t.id === selectedTeamId) || leagueTeams.find(t => t.id === userTeamId)!, 
    [leagueTeams, selectedTeamId, userTeamId]
  );

  const isUserTeam = selectedTeamId === userTeamId;

  // Chemistry Logic
  const chemistry = useMemo(() => {
    let score = 50;
    const roster = activeTeam.roster;
    const leaders = roster.filter(p => p.personalityTraits.includes('Leader')).length;
    const divas = roster.filter(p => p.personalityTraits.includes('Diva/Star')).length;
    const loyalists = roster.filter(p => p.personalityTraits.includes('Loyal')).length;
    const professionals = roster.filter(p => p.personalityTraits.includes('Professional')).length;
    const teamFirst = roster.filter(p => p.personalityTraits.includes('Friendly/Team First')).length;
    const moneyHungry = roster.filter(p => p.personalityTraits.includes('Money Hungry')).length;
    
    score += (leaders * 6);
    score -= (divas * 10);
    score += (loyalists * 4);
    score += (professionals * 5);
    score += (teamFirst * 4);
    score -= (moneyHungry * 3);
    
    if (divas > 1) score -= 20;
    if (leaders > 2) score += 12;

    return Math.min(100, Math.max(0, score));
  }, [activeTeam.roster]);

  const filteredRoster = useMemo(() => {
    return [...activeTeam.roster]
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPos = posFilter === 'ALL' || p.position === posFilter;
        const matchesOvr = p.rating >= minOvr;
          const matchesInjured = !injuredOnly || isPlayerUnavailable(p);
        return matchesSearch && matchesPos && matchesOvr && matchesInjured;
      })
      .sort((a, b) => {
        let aVal: any = (a as any)[sortConfig.key];
        let bVal: any = (b as any)[sortConfig.key];
        
        if (sortConfig.key === 'salary') {
          aVal = a.salary;
          bVal = b.salary;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  }, [activeTeam.roster, searchTerm, posFilter, minOvr, injuredOnly, sortConfig]);

  const toggleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const formatMoney = fmtSalary;

  const hcRating = activeTeam.staff.headCoach ? Math.round((activeTeam.staff.headCoach.ratingOffense + activeTeam.staff.headCoach.ratingDefense)/2) : 0;

  // ── God-mode helpers ──────────────────────────────────────────────────────
  const flashMsg = (text: string, type: 'ok' | 'err') => {
    setGodModeMsg({ text, type });
    setTimeout(() => setGodModeMsg(null), 3500);
  };

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportRoster = () => {
    downloadJson(activeTeam.roster, `${activeTeam.abbreviation}-roster.json`);
    flashMsg(`Exported ${activeTeam.roster.length} players.`, 'ok');
  };

  const handleExportPlayer = (player: Player, e: React.MouseEvent) => {
    e.stopPropagation();
    downloadJson(player, `${player.name.replace(/\s+/g, '_')}.json`);
    flashMsg(`Exported ${player.name}.`, 'ok');
  };

  const handleImportRoster = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Player[];
        if (!Array.isArray(parsed)) throw new Error('Expected an array of players.');
        onUpdateTeamRoster?.(activeTeam.id, parsed);
        flashMsg(`Imported ${parsed.length} players into ${activeTeam.name}.`, 'ok');
      } catch (err: any) {
        flashMsg(`Import failed: ${err.message}`, 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportPlayer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Player;
        if (!parsed.id || !parsed.name) throw new Error('Invalid player JSON.');
        const updated = [...activeTeam.roster, parsed];
        onUpdateTeamRoster?.(activeTeam.id, updated);
        flashMsg(`Added ${parsed.name} to ${activeTeam.name}.`, 'ok');
      } catch (err: any) {
        flashMsg(`Import failed: ${err.message}`, 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteAll = () => {
    if (!window.confirm(`Delete ALL ${activeTeam.roster.length} players from ${activeTeam.name}? This cannot be undone.`)) return;
    onUpdateTeamRoster?.(activeTeam.id, []);
    flashMsg(`Cleared ${activeTeam.name} roster.`, 'ok');
  };
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Team Selection & Info Header */}
      <div 
        className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
        style={{ borderTop: `8px solid ${activeTeam.primaryColor}` }}
      >
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24" style={{ color: activeTeam.primaryColor }}><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
        </div>

        <div className="flex flex-col gap-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div 
                className="w-24 h-24 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 shadow-inner cursor-pointer hover:scale-105 transition-transform"
                style={{ borderColor: activeTeam.primaryColor }}
                onClick={() => onManageTeam?.(activeTeam.id)}
              >
                <TeamBadge team={activeTeam} size="xl" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                   <select 
                      className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-xs font-black uppercase tracking-widest cursor-pointer focus:outline-none"
                      style={{ color: activeTeam.primaryColor }}
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                   >
                      {leagueTeams.sort((a,b) => a.city.localeCompare(b.city)).map(t => (
                        <option key={t.id} value={t.id}>{t.city} {t.name} {t.id === userTeamId ? '(You)' : ''}</option>
                      ))}
                   </select>
                </div>
                <h2 className="text-5xl font-display font-bold uppercase tracking-tight text-white leading-tight">{activeTeam.name}</h2>
                
                {/* Coaching Staff Bar */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                   <button 
                    onClick={() => activeTeam.staff.headCoach && onScoutCoach(activeTeam.staff.headCoach)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-all group"
                   >
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: activeTeam.primaryColor }}>Coach:</span>
                      <span className="text-sm font-bold text-white group-hover:text-amber-500">{activeTeam.staff.headCoach?.name || 'Vacant'}</span>
                      <span className="text-slate-950 text-[10px] font-black px-1.5 rounded" style={{ backgroundColor: activeTeam.primaryColor }}>{hcRating}</span>
                   </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl text-center min-w-[140px]">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Chemistry</p>
                <p className={`text-4xl font-display font-bold ${chemistry > 75 ? 'text-emerald-400' : chemistry > 45 ? 'text-amber-500' : 'text-rose-500'}`}>
                  {chemistry}%
                </p>
              </div>
              <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl text-center min-w-[140px]">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Total Salary</p>
                <p className="text-4xl font-display font-bold text-white">
                  {formatMoney(activeTeam.roster.reduce((sum, p) => sum + p.salary, 0))}
                </p>
                <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">Cap: {formatMoney(activeTeam.budget)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <input
            type="text"
            placeholder="Search players by name..."
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white focus:outline-none transition-colors"
            style={{ borderBottom: `2px solid ${activeTeam.primaryColor}` }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold appearance-none cursor-pointer"
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
        >
          <option value="ALL">All Positions</option>
          {['PG', 'SG', 'SF', 'PF', 'C'].map(pos => <option key={pos} value={pos}>{pos}</option>)}
        </select>
        <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Min OVR</span>
          <input
            type="range"
            min="60"
            max="99"
            value={minOvr}
            onChange={(e) => setMinOvr(parseInt(e.target.value))}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: activeTeam.primaryColor }}
          />
          <span className="text-xl font-display font-bold min-w-[2ch]" style={{ color: activeTeam.primaryColor }}>{minOvr}</span>
        </div>
      </div>

      {/* Injury Filter */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setInjuredOnly(!injuredOnly)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
            injuredOnly ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-lg shadow-rose-900/20' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'
          }`}
        >
          <span>🤕</span> {injuredOnly ? 'Showing Injured/Suspended' : 'Show Injured / Suspended'}
        </button>
        {injuredOnly && filteredRoster.length > 0 && (
          <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">{filteredRoster.length} on injured list</span>
        )}
        {injuredOnly && filteredRoster.length === 0 && (
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">No current injuries on this roster</span>
        )}
      </div>

      {/* God Mode Panel */}
      {godMode && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400 text-base">⚡</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">God Mode — Roster Tools</span>
          </div>
          {godModeMsg && (
            <div className={`text-[11px] font-bold px-4 py-2 rounded-xl border ${
              godModeMsg.type === 'ok'
                ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-900/40 border-rose-500/40 text-rose-300'
            }`}>
              {godModeMsg.text}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {/* Export Roster */}
            <button
              onClick={handleExportRoster}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all"
            >
              ↓ Export Roster
            </button>

            {/* Import Roster */}
            <button
              onClick={() => importRosterRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all"
            >
              ↑ Import Roster
            </button>
            <input ref={importRosterRef} type="file" accept=".json" className="hidden" onChange={handleImportRoster} />

            {/* Import Player */}
            <button
              onClick={() => importPlayerRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/40 text-blue-300 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all"
            >
              ↑ Import Player
            </button>
            <input ref={importPlayerRef} type="file" accept=".json" className="hidden" onChange={handleImportPlayer} />

            {/* Delete All */}
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/40 text-rose-400 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all ml-auto"
            >
              🗑 Delete All Players
            </button>
          </div>
          <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
            Export a row's player using the ↓ icon on each row · Roster import replaces the full roster · Player import appends
          </p>
        </div>
      )}

      {/* Roster Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800">
                <th className="px-8 py-6 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('name')}>Player</th>
                <th className="px-8 py-6 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('position')}>Pos</th>
                <th className="px-8 py-6 text-center cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('age')}>Age</th>
                <th className="px-8 py-6 text-center cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('rating')}>OVR</th>
                <th className="px-8 py-6 text-center cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('potential')}>POT</th>
                <th className="px-8 py-6 text-right cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('salary')}>Salary</th>
                {godMode && <th className="px-4 py-6 text-center">Export</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredRoster.map((player) => (
                <tr 
                  key={player.id} 
                  className={`group hover:bg-slate-800/40 transition-all cursor-pointer ${
                    isPlayerSuspended(player) ? 'bg-red-950/25 border-l-2 border-red-500/40' :
                    isPlayerInjured(player)   ? 'bg-rose-950/20 border-l-2 border-rose-500/30' : ''
                  }`}
                  onClick={() => onScout(player)}
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-display text-xl border ${
                        isPlayerSuspended(player) ? 'bg-red-950/40 border-red-500/40 text-red-400' :
                        isPlayerInjured(player)   ? 'bg-rose-950/40 border-rose-500/40 text-rose-400' :
                        'bg-slate-800 border-slate-700 text-slate-600'
                      }`}>
                        {player.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {player.country && (
                            <span className="text-base leading-none" title={player.country}>{getFlag(player.country)}</span>
                          )}
                          {onToggleWatch && (
                            <span onClick={e => e.stopPropagation()}>
                              <WatchToggle playerId={player.id} watchList={watchList} onToggle={onToggleWatch} />
                            </span>
                          )}
                          <span className={`font-display font-bold text-lg uppercase tracking-tight transition-colors group-hover:text-amber-500 ${
                            isPlayerSuspended(player) ? 'text-red-400' :
                            isPlayerInjured(player)   ? 'text-rose-400' : 'text-slate-100'
                          }`}>
                            {player.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {(() => {
                            if (isPlayerSuspended(player)) return (
                              <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                                ⛔ SUSP{(player.suspensionGames ?? 0) > 0 ? ` · ${player.suspensionGames}G` : ''}
                              </span>
                            );
                            const eff = getEffectiveStatus(player, activeTeam.rotation);
                            if (eff === 'Injured') return (
                              <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                                🤕 {player.injuryType ?? 'Injured'}{player.injuryDaysLeft ? ` · ${player.injuryDaysLeft}d` : ''}
                              </span>
                            );
                            const statusColors: Record<string, string> = {
                              Starter:  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                              Rotation: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                              Bench:    'bg-slate-800 text-slate-500 border border-slate-700',
                            };
                            return (
                              <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${statusColors[eff] ?? 'bg-slate-800 text-slate-500'}`}>
                                {eff}
                              </span>
                            );
                          })()}
                          {player.archetype && (
                            <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${ARCHETYPE_COLORS[player.archetype] ?? 'bg-slate-800/50 text-slate-400 border-slate-700'}`}>
                              {player.archetype}
                            </span>
                          )}
                          <div className="flex gap-1">
                            {player.personalityTraits.map(trait => (
                              <span key={trait} title={trait} className="text-xs">{traitIcons[trait]}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-xs font-black text-slate-400 border border-slate-800 rounded px-2 py-1 uppercase">{player.position}</span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="text-sm font-bold text-slate-300">{player.age}</span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`text-2xl font-display font-black`} style={{ color: player.rating >= 85 ? activeTeam.primaryColor : player.rating >= 75 ? activeTeam.secondaryColor : '#64748b' }}>
                      {player.rating}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="text-sm font-bold text-slate-500">{player.potential}</span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="font-mono text-sm font-bold text-slate-100">{formatMoney(player.salary)}</div>
                    <div className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">{player.contractYears} Seasons</div>
                  </td>
                  {godMode && (
                    <td className="px-4 py-6 text-center">
                      <button
                        onClick={(e) => handleExportPlayer(player, e)}
                        title="Export player as JSON"
                        className="text-amber-400/60 hover:text-amber-300 text-base transition-colors px-2 py-1 rounded hover:bg-amber-500/10"
                      >
                        ↓
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Roster;