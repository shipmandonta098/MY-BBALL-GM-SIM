
import React, { useState, useMemo } from 'react';
import { Team, Player, Position, TeamRotation } from '../types';
import { PlayerLink } from '../context/NavigationContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  GripVertical, 
  AlertTriangle, 
  TrendingUp, 
  Zap, 
  Shield, 
  Maximize2, 
  Moon,
  Save,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RotationsProps {
  league: {
    teams: Team[];
    userTeamId: string;
    history: any[];
  };
  updateLeague: (updated: any) => void;
}

type RotationPreset = 'star-heavy' | 'defensive' | 'small-ball' | 'b2b-rest' | 'balanced';

const SortablePlayerCard = ({
  player,
  minutes,
  onMinutesChange,
  isStarter,
  positionLabel,
  fatigueWarning
}: {
  player: Player;
  minutes: number;
  onMinutesChange: (val: number) => void;
  isStarter?: boolean;
  positionLabel?: string;
  fatigueWarning?: boolean;
}) => {
  const injured = player.status === 'Injured' || (player.injuryDaysLeft != null && player.injuryDaysLeft > 0);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: player.id, disabled: injured });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-2xl p-4 flex items-center gap-4 group transition-all ${
        injured
          ? 'bg-rose-950/20 border-rose-500/30 opacity-70'
          : `bg-slate-800/50 ${isStarter ? 'border-amber-500/30' : 'border-slate-700/50'} hover:bg-slate-800`
      }`}
    >
      <div {...(injured ? {} : { ...attributes, ...listeners })} className={`p-2 ${injured ? 'text-rose-800 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400'}`}>
        <GripVertical size={20} />
      </div>

      <div className="flex-1 flex items-center gap-4">
        <div className="relative">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold border ${injured ? 'bg-rose-950/40 border-rose-500/30 text-rose-500' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
            {player.name.charAt(0)}
          </div>
          {positionLabel && !injured && (
            <div className="absolute -top-2 -left-2 bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded border border-slate-950">
              {positionLabel}
            </div>
          )}
          {injured && (
            <div className="absolute -top-2 -left-2 bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded border border-rose-900">
              INJ
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <PlayerLink player={player} name={player.name} className={`font-bold uppercase tracking-tight text-sm ${injured ? 'text-rose-400' : 'text-slate-200'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase px-1.5 py-0.5 bg-slate-900 rounded">{player.position}</span>
            {injured && (
              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                🤕 DNP–Injured{player.injuryDaysLeft ? ` · ${player.injuryDaysLeft}d` : ''}
              </span>
            )}
            {!injured && fatigueWarning && (
              <AlertTriangle size={14} className="text-rose-500 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-display font-bold text-amber-500">{player.rating} OVR</span>
            <div className="h-1 w-20 bg-slate-900 rounded-full overflow-hidden">
               <div className="h-full bg-amber-500" style={{ width: `${player.rating}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {injured ? (
        <div className="w-48 flex items-center justify-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-rose-500/60">Unavailable</span>
        </div>
      ) : (
        <div className="w-48 flex flex-col gap-1">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Minutes</span>
            <span className={`text-xs font-mono font-bold ${minutes > 35 ? 'text-rose-500' : 'text-emerald-400'}`}>{minutes}m</span>
          </div>
          <input
            type="range"
            min="0"
            max="48"
            value={minutes}
            onChange={(e) => onMinutesChange(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>
      )}
    </div>
  );
};

const Rotations: React.FC<RotationsProps> = ({ league, updateLeague }) => {
  const team = useMemo(() => 
    league.teams.find(t => t.id === league.userTeamId)!, 
    [league.teams, league.userTeamId]
  );

  // Initialize ordered list of player IDs
  const [playerOrder, setPlayerOrder] = useState<string[]>(() => {
    const rot = team.rotation;
    if (rot) {
      return [
        rot.starters.PG, rot.starters.SG, rot.starters.SF, rot.starters.PF, rot.starters.C,
        ...rot.bench,
        ...rot.reserves
      ].filter(id => team.roster.some(p => p.id === id));
    }
    return team.roster.sort((a, b) => b.rating - a.rating).map(p => p.id);
  });

  const [minutes, setMinutes] = useState<Record<string, number>>(team.rotation?.minutes || {});
  const [hasChanges, setHasChanges] = useState(false);

  const totalMinutes = useMemo(() => 
    Object.values(minutes).reduce((sum: number, m: number) => sum + m, 0)
  , [minutes]);

  const lineupOvr = useMemo(() => {
    const starterIds = playerOrder.slice(0, 5);
    const starters = team.roster.filter(p => starterIds.includes(p.id));
    if (starters.length === 0) return 0;
    return Math.round(starters.reduce((sum, p) => sum + p.rating, 0) / starters.length);
  }, [playerOrder, team.roster]);

  const benchStrength = useMemo(() => {
    const benchIds = playerOrder.slice(5, 10);
    const benchPlayers = team.roster.filter(p => benchIds.includes(p.id));
    if (benchPlayers.length === 0) return 0;
    return Math.round(benchPlayers.reduce((sum, p) => sum + p.rating, 0) / benchPlayers.length);
  }, [playerOrder, team.roster]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPlayerOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setHasChanges(true);
    }
  };

  const handleMinutesChange = (playerId: string, val: number) => {
    setMinutes(prev => ({ ...prev, [playerId]: val }));
    setHasChanges(true);
  };

  const applyPreset = (preset: RotationPreset) => {
    const newMinutes: Record<string, number> = {};
    const starterIds = playerOrder.slice(0, 5);
    const benchIds = playerOrder.slice(5, 10);
    const reserveIds = playerOrder.slice(10);
    
    switch (preset) {
      case 'star-heavy':
        starterIds.forEach(id => newMinutes[id] = 38);
        benchIds.forEach(id => newMinutes[id] = 10);
        break;
      case 'balanced':
        starterIds.forEach(id => newMinutes[id] = 32);
        benchIds.forEach(id => newMinutes[id] = 16);
        break;
      case 'defensive':
        starterIds.forEach(id => newMinutes[id] = 34);
        benchIds.forEach(id => newMinutes[id] = 14);
        break;
      case 'small-ball':
        starterIds.forEach(id => newMinutes[id] = 34);
        benchIds.forEach(id => newMinutes[id] = 14);
        break;
      case 'b2b-rest':
        starterIds.forEach(id => newMinutes[id] = 28);
        benchIds.forEach(id => newMinutes[id] = 20);
        break;
    }
    reserveIds.forEach(id => newMinutes[id] = 0);

    // Normalize to 240
    let currentTotal = Object.values(newMinutes).reduce((a, b) => a + b, 0);
    if (currentTotal > 0) {
      const factor = 240 / currentTotal;
      Object.keys(newMinutes).forEach(id => {
        newMinutes[id] = Math.round(newMinutes[id] * factor);
      });
    }

    setMinutes(newMinutes);
    setHasChanges(true);
  };

  const saveRotation = () => {
    // Force injured players to 0 minutes
    const injuredIds = new Set<string>(
      team.roster
        .filter(p => p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0))
        .map(p => p.id)
    );
    const effectiveMinutes = { ...minutes };
    injuredIds.forEach(id => { effectiveMinutes[id] = 0; });

    const newRotation: TeamRotation = {
      starters: {
        PG: playerOrder[0],
        SG: playerOrder[1],
        SF: playerOrder[2],
        PF: playerOrder[3],
        C: playerOrder[4]
      },
      bench: playerOrder.slice(5, 10),
      reserves: playerOrder.slice(10),
      minutes: effectiveMinutes
    };

    updateLeague((prev: any) => {
      const newTeams = prev.teams.map((t: Team) => 
        t.id === team.id ? { ...t, rotation: newRotation } : t
      );
      return { ...prev, teams: newTeams };
    });
    setHasChanges(false);
  };

  const autoDistribute = () => {
    const newMinutes: Record<string, number> = {};
    playerOrder.forEach((id, i) => {
      if (i < 5) newMinutes[id] = 34;
      else if (i < 10) newMinutes[id] = 14;
      else newMinutes[id] = 0;
    });
    setMinutes(newMinutes);
    setHasChanges(true);
  };

  const getFatigueWarning = (playerId: string) => {
    const player = team.roster.find(p => p.id === playerId);
    if (!player) return false;
    const recentGames = player.gameLog.slice(-3);
    const avgMin = recentGames.length > 0 ? recentGames.reduce((s, g) => s + g.min, 0) / recentGames.length : 0;
    return avgMin > 35 || (minutes[playerId] || 0) > 38;
  };

  const expectedBoost = useMemo(() => {
    const baseOvr = team.roster.reduce((s, p) => s + p.rating, 0) / team.roster.length;
    const currentOvr = (lineupOvr * 0.7) + (benchStrength * 0.3);
    const diff = currentOvr - baseOvr;
    return diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
  }, [lineupOvr, benchStrength, team.roster]);

  const starterPositions = ['PG', 'SG', 'SF', 'PF', 'C'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tight text-white">Rotation <span className="text-amber-500">Lab</span></h1>
          <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-[0.2em]">Optimize depth chart & minutes</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={autoDistribute}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-black uppercase text-slate-400 hover:text-white transition-all"
          >
            <RotateCcw size={14} />
            Auto-Fill
          </button>
          <button 
            onClick={saveRotation}
            disabled={!hasChanges || totalMinutes !== 240}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${hasChanges && totalMinutes === 240 ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            <Save size={14} />
            Save Changes
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-8">
              <section>
                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Zap size={12} className="text-amber-500" />
                  Depth Chart
                </h3>
                <div className="space-y-2">
                  <SortableContext items={playerOrder} strategy={verticalListSortingStrategy}>
                    {playerOrder.map((id, index) => {
                      const player = team.roster.find(p => p.id === id);
                      if (!player) return null;
                      
                      let label = '';
                      if (index < 5) label = starterPositions[index];
                      else if (index < 10) label = `B${index - 4}`;
                      else label = 'RES';

                      return (
                        <div key={id}>
                          {index === 0 && <div className="text-[10px] font-black text-slate-700 uppercase mb-2 ml-4">Starters</div>}
                          {index === 5 && <div className="text-[10px] font-black text-slate-700 uppercase mt-6 mb-2 ml-4">Bench</div>}
                          {index === 10 && <div className="text-[10px] font-black text-slate-700 uppercase mt-6 mb-2 ml-4">Reserves</div>}
                          <SortablePlayerCard 
                            player={player} 
                            minutes={minutes[player.id] || 0}
                            onMinutesChange={(v) => handleMinutesChange(player.id, v)}
                            isStarter={index < 5}
                            positionLabel={label}
                            fatigueWarning={getFatigueWarning(player.id)}
                          />
                        </div>
                      );
                    })}
                  </SortableContext>
                </div>
              </section>
            </div>
          </DndContext>
        </div>

        <div className="space-y-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-2xl space-y-8 sticky top-8">
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Lineup Analysis</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <p className="text-[10px] text-slate-600 font-black uppercase mb-1">Starters OVR</p>
                  <p className="text-3xl font-display font-black text-white">{lineupOvr}</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <p className="text-[10px] text-slate-600 font-black uppercase mb-1">Bench OVR</p>
                  <p className="text-3xl font-display font-black text-white">{benchStrength}</p>
                </div>
              </div>

              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-[10px] text-slate-600 font-black uppercase">Minute Distribution</p>
                  <span className={`text-xs font-mono font-bold ${totalMinutes === 240 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {totalMinutes} / 240
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex">
                  {playerOrder.map((id, i) => {
                    const min = minutes[id] || 0;
                    if (min === 0) return null;
                    return (
                      <div 
                        key={id} 
                        className="h-full border-r border-slate-950/20" 
                        style={{ 
                          width: `${(min / 240) * 100}%`,
                          backgroundColor: i < 5 ? team.primaryColor : team.secondaryColor,
                          opacity: 0.8
                        }}
                      />
                    );
                  })}
                </div>
                {totalMinutes !== 240 && (
                  <p className="text-[10px] text-rose-500 font-bold uppercase mt-3 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    Total must equal 240 minutes
                  </p>
                )}
              </div>

              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-600 font-black uppercase mb-1">Sim Impact</p>
                  <p className={`text-2xl font-display font-black ${parseFloat(expectedBoost) >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {expectedBoost} <span className="text-xs text-slate-500 ml-1">OVR</span>
                  </p>
                </div>
                <TrendingUp className={parseFloat(expectedBoost) >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rotation Presets</h3>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'star-heavy', label: 'Star Heavy', icon: <Zap size={14} />, desc: '38+ min for starters' },
                  { id: 'balanced', label: 'Balanced', icon: <Maximize2 size={14} />, desc: 'Deep rotation (10-man)' },
                  { id: 'defensive', label: 'Defensive Focus', icon: <Shield size={14} />, desc: 'Prioritize stoppers' },
                  { id: 'small-ball', label: 'Small Ball', icon: <Zap size={14} />, desc: 'Pace & Space focus' },
                  { id: 'b2b-rest', label: 'B2B Load Mgmt', icon: <Moon size={14} />, desc: 'Cap starters at 28 min' },
                ].map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id as RotationPreset)}
                    className="flex items-center gap-4 p-4 bg-slate-950 border border-slate-800 rounded-2xl hover:border-amber-500/50 transition-all text-left group"
                  >
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-slate-500 group-hover:text-amber-500 transition-colors">
                      {preset.icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-200 uppercase tracking-tight">{preset.label}</p>
                      <p className="text-[10px] text-slate-600 font-bold uppercase">{preset.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Rotations;
