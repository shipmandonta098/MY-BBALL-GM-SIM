
import React, { useState, useMemo } from 'react';
import { Team, Player, Position, TeamRotation, CoachScheme, CoachBadge } from '../types';
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
  RotateCcw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Swords,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Lineup Recommendation Engine ───────────────────────────────────────────

function playerOffScore(p: Player): number {
  const a = p.attributes;
  return (
    a.shooting    * 0.20 +
    a.shooting3pt * 0.14 +
    a.shootingMid * 0.08 +
    a.playmaking  * 0.14 +
    a.passing     * 0.10 +
    a.athleticism * 0.08 +
    a.offensiveIQ * 0.12 +
    a.layups      * 0.07 +
    a.ballHandling* 0.07
  );
}

function playerDefScore(p: Player): number {
  const a = p.attributes;
  return (
    a.defense      * 0.28 +
    a.perimeterDef * 0.18 +
    a.interiorDef  * 0.14 +
    a.steals       * 0.14 +
    a.blocks       * 0.10 +
    a.defensiveIQ  * 0.10 +
    a.strength     * 0.06
  );
}

function traitLineupBonus(players: Player[]): { off: number; def: number } {
  let off = 0, def = 0;
  for (const p of players) {
    for (const trait of (p.personalityTraits || [])) {
      if      (trait === 'Friendly/Team First') { off += 1.5; def += 1.5; }
      else if (trait === 'Leader')              { off += 1.0; def += 1.0; }
      else if (trait === 'Clutch')              { off += 0.8; def += 0.8; }
      else if (trait === 'Workhorse')           { def += 1.0; }
      else if (trait === 'Gym Rat')             { off += 0.5; def += 0.5; }
      else if (trait === 'Tough/Alpha')         { def += 1.2; }
      else if (trait === 'Diva/Star')           { off -= 1.0; def -= 1.5; }
      else if (trait === 'Lazy')                { off -= 2.0; def -= 2.0; }
      else if (trait === 'Hot Head')            { def -= 1.0; }
    }
  }
  return { off, def };
}

function schemeLineupBonus(scheme: CoachScheme, badges: CoachBadge[]): { off: number; def: number } {
  const b = { off: 0, def: 0 };
  if (scheme === 'Pace and Space') { b.off += 3.5; }
  if (scheme === 'Showtime')       { b.off += 3.0; }
  if (scheme === 'Small Ball')     { b.off += 2.0; }
  if (scheme === 'Grit and Grind') { b.def += 4.0; }
  if (scheme === 'Triangle')       { b.off += 1.0; b.def += 1.0; }
  if (badges.includes('Offensive Architect')) b.off += 2.5;
  if (badges.includes('Defensive Guru'))      b.def += 3.0;
  if (badges.includes('Pace Master'))         b.off += 1.5;
  return b;
}

export interface LineupRec {
  starters: Player[];
  bench: Player[];
  ortg: number;   // projected offensive rating (higher = better)
  drtg: number;   // projected defensive rating (lower = better)
  net: number;    // ortg - drtg
  traitBonus: { off: number; def: number };
}

function generateLineupRecs(
  pool: Player[],
  scheme: CoachScheme,
  badges: CoachBadge[],
): { offense: LineupRec[]; defense: LineupRec[]; balanced: LineupRec[] } {
  if (pool.length < 5) return { offense: [], defense: [], balanced: [] };
  const schemeMod = schemeLineupBonus(scheme, badges);
  const n = pool.length;

  interface Scored { idxs: number[]; ortg: number; drtg: number; net: number; bonus: { off: number; def: number } }
  const scored: Scored[] = [];

  for (let i = 0; i < n - 4; i++)
    for (let j = i + 1; j < n - 3; j++)
      for (let k = j + 1; k < n - 2; k++)
        for (let l = k + 1; l < n - 1; l++)
          for (let m = l + 1; m < n; m++) {
            const players = [pool[i], pool[j], pool[k], pool[l], pool[m]];
            const avgOff = players.reduce((s, p) => s + playerOffScore(p), 0) / 5;
            const avgDef = players.reduce((s, p) => s + playerDefScore(p), 0) / 5;
            const bonus  = traitLineupBonus(players);
            const effOff = avgOff + schemeMod.off + bonus.off;
            const effDef = avgDef + schemeMod.def + bonus.def;
            const ortg   = Math.round(95 + (effOff / 100) * 20);
            const drtg   = Math.round(115 - (effDef / 100) * 20);
            scored.push({ idxs: [i, j, k, l, m], ortg, drtg, net: ortg - drtg, bonus });
          }

  const top3 = (cmp: (a: Scored, b: Scored) => number): LineupRec[] =>
    [...scored].sort(cmp).slice(0, 3).map(c => {
      const starters = c.idxs.map(i => pool[i]);
      const starterSet = new Set(starters.map(p => p.id));
      const bench = pool.filter(p => !starterSet.has(p.id));
      return { starters, bench, ortg: c.ortg, drtg: c.drtg, net: c.net, traitBonus: c.bonus };
    });

  return {
    offense:  top3((a, b) => b.ortg - a.ortg),
    defense:  top3((a, b) => a.drtg - b.drtg),
    balanced: top3((a, b) => b.net  - a.net),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const suspended = !!(player.isSuspended && (player.suspensionGamesLeft ?? 0) > 0);
  const unavailable = injured || suspended;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: player.id, disabled: unavailable });

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
        suspended
          ? 'bg-amber-950/20 border-amber-500/30 opacity-70'
          : injured
          ? 'bg-rose-950/20 border-rose-500/30 opacity-70'
          : `bg-slate-800/50 ${isStarter ? 'border-amber-500/30' : 'border-slate-700/50'} hover:bg-slate-800`
      }`}
    >
      <div {...(unavailable ? {} : { ...attributes, ...listeners })} className={`p-2 ${unavailable ? 'text-slate-700 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400'}`}>
        <GripVertical size={20} />
      </div>

      <div className="flex-1 flex items-center gap-4">
        <div className="relative">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold border ${
            suspended ? 'bg-amber-950/40 border-amber-500/30 text-amber-500' :
            injured   ? 'bg-rose-950/40 border-rose-500/30 text-rose-500'   :
            'bg-slate-900 border-slate-800 text-slate-500'
          }`}>
            {player.name.charAt(0)}
          </div>
          {positionLabel && !unavailable && (
            <div className="absolute -top-2 -left-2 bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded border border-slate-950">
              {positionLabel}
            </div>
          )}
          {suspended && (
            <div className="absolute -top-2 -left-2 bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded border border-amber-900">
              SUS
            </div>
          )}
          {injured && !suspended && (
            <div className="absolute -top-2 -left-2 bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded border border-rose-900">
              INJ
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <PlayerLink player={player} name={player.name} className={`font-bold uppercase tracking-tight text-sm ${
              suspended ? 'text-amber-400' : injured ? 'text-rose-400' : 'text-slate-200'
            }`} />
            <span className="text-[10px] font-black text-slate-500 uppercase px-1.5 py-0.5 bg-slate-900 rounded">{player.position}</span>
            {suspended && (
              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                🚫 DNP–Suspended · {player.suspensionGamesLeft}g{player.suspensionReason ? ` · ${player.suspensionReason}` : ''}
              </span>
            )}
            {injured && !suspended && (
              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                🤕 DNP–Injured{player.injuryDaysLeft ? ` · ${player.injuryDaysLeft}d` : ''}
              </span>
            )}
            {!unavailable && fatigueWarning && (
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

      {unavailable ? (
        <div className="w-48 flex items-center justify-center">
          <span className={`text-[10px] font-black uppercase tracking-widest ${suspended ? 'text-amber-500/60' : 'text-rose-500/60'}`}>Unavailable</span>
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

  // ── Best Lineups ──────────────────────────────────────────────────────────
  const [showBestLineups, setShowBestLineups]   = useState(true);
  const [lineupCategory, setLineupCategory]     = useState<'offense' | 'defense' | 'balanced'>('balanced');
  const [excludeInjured, setExcludeInjured]     = useState(true);

  const scheme = team.activeScheme ?? team.staff?.headCoach?.scheme ?? 'Balanced';
  const badges = team.staff?.headCoach?.badges ?? [];

  const recommendedLineups = useMemo(() => {
    let pool = [...team.roster].sort((a, b) => b.rating - a.rating);
    if (excludeInjured) pool = pool.filter(p => !(p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0)));
    // Cap pool at 12 for performance
    return generateLineupRecs(pool.slice(0, 12), scheme as CoachScheme, badges as CoachBadge[]);
  }, [team.roster, excludeInjured, scheme, badges]);

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

  // Position compatibility: exact → swing → group
  const POS_COMPAT_ROT: Record<string, string[]> = {
    PG: ['PG', 'SG', 'SF'], SG: ['SG', 'PG', 'SF'],
    SF: ['SF', 'SG', 'PF'], PF: ['PF', 'SF', 'C'], C: ['C', 'PF', 'SF'],
  };
  const starterPositions5 = ['PG', 'SG', 'SF', 'PF', 'C'];

  // Auto-fill: replace any injured starter/bench slot with the best positional backup
  const autoFillInjuries = () => {
    const injuredIds = new Set(
      team.roster
        .filter(p => p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0))
        .map(p => p.id)
    );
    if (injuredIds.size === 0) return;

    let newOrder = [...playerOrder];
    const newMins = { ...minutes };

    newOrder = newOrder.map((id, slotIdx) => {
      if (!injuredIds.has(id)) return id;
      // This slot has an injured player — find best backup
      const slotPos = slotIdx < 5 ? starterPositions5[slotIdx] : null;
      const compat = slotPos ? (POS_COMPAT_ROT[slotPos] ?? [slotPos]) : null;
      const alreadyInOrder = new Set(newOrder);

      // Pool: healthy, not already placed, not injured
      const pool = team.roster.filter(
        p => !injuredIds.has(p.id) && !alreadyInOrder.has(p.id)
      );

      let replacement: Player | undefined;
      if (compat) {
        for (const pos of compat) {
          const tier = pool.filter(p => p.position === pos);
          if (tier.length) { replacement = tier.sort((a, b) => b.rating - a.rating)[0]; break; }
        }
      }
      if (!replacement) replacement = pool.sort((a, b) => b.rating - a.rating)[0];
      if (!replacement) return id; // no one left

      // Give the replacement at least as many minutes as the injured player had
      newMins[replacement.id] = Math.max(newMins[replacement.id] ?? 0, newMins[id] ?? (slotIdx < 5 ? 32 : 14));
      newMins[id] = 0;
      return replacement.id;
    });

    setPlayerOrder(newOrder);
    setMinutes(newMins);
    setHasChanges(true);
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

  const applyLineup = (rec: LineupRec) => {
    const newOrder = [
      ...rec.starters.map(p => p.id),
      ...rec.bench.map(p => p.id),
    ];
    // Distribute minutes: starters 34, first 5 bench 14, rest 0 — then normalize
    const raw: Record<string, number> = {};
    newOrder.forEach((id, i) => {
      if (i < 5) raw[id] = 34;
      else if (i < 10) raw[id] = 14;
      else raw[id] = 0;
    });
    const total = Object.values(raw).reduce((s, v) => s + v, 0);
    const factor = total > 0 ? 240 / total : 1;
    const newMins: Record<string, number> = {};
    newOrder.forEach(id => { newMins[id] = Math.round(raw[id] * factor); });
    // Fix rounding drift
    const drift = 240 - Object.values(newMins).reduce((s, v) => s + v, 0);
    if (drift !== 0 && newOrder[0]) newMins[newOrder[0]] = (newMins[newOrder[0]] || 0) + drift;

    setPlayerOrder(newOrder);
    setMinutes(newMins);
    setHasChanges(true);
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
        <div className="flex gap-3 flex-wrap">
          {team.roster.some(p => p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0)) && (
            <button
              onClick={autoFillInjuries}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-black uppercase text-rose-400 hover:text-white hover:bg-rose-500/20 transition-all"
              title="Replace injured players with best positional backups"
            >
              🤕 Fill Injuries
            </button>
          )}
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

            {/* ── Best Lineups ── */}
            <div className="space-y-4">
              <button
                onClick={() => setShowBestLineups(v => !v)}
                className="w-full flex items-center justify-between group"
              >
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                  <Activity size={12} />
                  Best Lineups
                </h3>
                {showBestLineups ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
              </button>

              {showBestLineups && (
                <div className="space-y-3">
                  {/* Filters */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={excludeInjured}
                      onChange={e => setExcludeInjured(e.target.checked)}
                      className="accent-amber-500 w-3 h-3"
                    />
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Exclude Injured</span>
                  </label>

                  {/* Category tabs */}
                  <div className="flex rounded-xl overflow-hidden border border-slate-800 text-[10px] font-black uppercase">
                    {([
                      { id: 'offense',  label: 'OFF', icon: <Zap size={10} /> },
                      { id: 'defense',  label: 'DEF', icon: <Shield size={10} /> },
                      { id: 'balanced', label: 'NET', icon: <Swords size={10} /> },
                    ] as const).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setLineupCategory(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 transition-all ${
                          lineupCategory === tab.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-950 text-slate-500 hover:text-white'
                        }`}
                      >
                        {tab.icon}{tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Lineup cards */}
                  {(() => {
                    const recs = recommendedLineups[lineupCategory];
                    if (recs.length === 0) return (
                      <p className="text-[10px] text-slate-600 text-center py-4 font-bold uppercase">
                        Not enough healthy players
                      </p>
                    );
                    return recs.map((rec, i) => {
                      const netStr = rec.net >= 0 ? `+${rec.net}` : `${rec.net}`;
                      const isApplied = rec.starters.map(p => p.id).every((id, idx) => playerOrder[idx] === id);
                      return (
                        <div
                          key={i}
                          className={`rounded-2xl border p-4 space-y-3 transition-all ${
                            isApplied
                              ? 'border-amber-500/40 bg-amber-500/5'
                              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                          }`}
                        >
                          {/* Header stats */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-500 uppercase">Lineup #{i + 1}</span>
                            <div className="flex gap-2 text-[10px] font-mono font-bold">
                              <span className="text-orange-400">OFF {rec.ortg}</span>
                              <span className="text-blue-400">DEF {rec.drtg}</span>
                              <span className={rec.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{netStr}</span>
                            </div>
                          </div>

                          {/* Starters */}
                          <div className="space-y-1">
                            {rec.starters.map((p, si) => {
                              const posLabel = ['PG','SG','SF','PF','C'][si];
                              return (
                                <div key={p.id} className="flex items-center gap-2 text-[10px]">
                                  <span className="w-6 text-slate-600 font-black uppercase shrink-0">{posLabel}</span>
                                  <span className="text-slate-300 font-bold truncate flex-1">{p.name}</span>
                                  <span className="text-slate-600 font-mono shrink-0">{p.rating}</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Bench preview */}
                          {rec.bench.length > 0 && (
                            <div className="border-t border-slate-800 pt-2">
                              <p className="text-[10px] text-slate-700 font-black uppercase mb-1">Bench</p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {rec.bench.slice(0, 5).map(p => p.name.split(' ')[1] || p.name).join(' · ')}
                              </p>
                            </div>
                          )}

                          {/* Chemistry note */}
                          {(rec.traitBonus.off !== 0 || rec.traitBonus.def !== 0) && (
                            <p className="text-[10px] text-slate-600 italic">
                              Chemistry:{' '}
                              {rec.traitBonus.off > 0 ? <span className="text-emerald-600">OFF +{rec.traitBonus.off.toFixed(1)}</span> : <span className="text-rose-600">OFF {rec.traitBonus.off.toFixed(1)}</span>}
                              {' '}
                              {rec.traitBonus.def > 0 ? <span className="text-emerald-600">DEF +{rec.traitBonus.def.toFixed(1)}</span> : <span className="text-rose-600">DEF {rec.traitBonus.def.toFixed(1)}</span>}
                            </p>
                          )}

                          {/* Apply button */}
                          <button
                            onClick={() => applyLineup(rec)}
                            disabled={isApplied}
                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                              isApplied
                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30 cursor-default'
                                : 'bg-slate-900 border border-slate-700 text-slate-400 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-500'
                            }`}
                          >
                            {isApplied ? <><CheckCircle2 size={10} /> Applied</> : 'Apply Lineup'}
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
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
