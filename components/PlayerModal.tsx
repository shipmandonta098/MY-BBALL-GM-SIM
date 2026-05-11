import React, { useState, useEffect, useMemo } from 'react';
import { Player, PlayerStatus, PersonalityTrait, Position, PlayerTendencies, TeamRotation, TrainingFocusArea, SeasonAwards } from '../types';
import { getFlag, countryFromHometown, POS_ATTR_RANGES, PosAttrRangeKey, enforcePositionalBounds, FEMALE_ATTR_CAPS, NAMES_MALE, NAMES_FEMALE, COLLEGES_HIGH_MAJOR, COLLEGES_MID_MAJOR, ALL_HOMETOWNS, deriveComposites, deriveArchetype, getArchetypeFitScores } from '../constants';
import { fmtSalary } from '../utils/formatters';
import { getEffectiveRating, canPlayThrough, getInjurySeverity } from '../utils/injuryEffects';
import { computeHofProbability } from '../utils/hofEngine';
import { rawUPER, normalizePER, leagueAvgRawUPER } from '../utils/playerUtils';

const POS_RANGE_KEYS: PosAttrRangeKey[] = ['shooting', 'playmaking', 'defense', 'rebounding', 'athleticism'];

interface PlayerModalProps {
  player: Player;
  onClose: () => void;
  onScout: (player: Player) => void;
  scoutingReport: { playerId: string; report: string } | null;
  isUserTeam: boolean;
  onUpdateStatus: (playerId: string, status: PlayerStatus) => void;
  onRelease: (playerId: string) => void;
  onAppealSuspension?: (playerId: string) => void;
  /** True when the draft lottery/live draft is in progress — disables all waiver actions */
  draftLocked?: boolean;
  godMode?: boolean;
  onUpdatePlayer?: (player: Player) => void;
  /** Whether this player is in the current season's All-Star game */
  isCurrentAllStar?: boolean;
  /** 'Starter' if voted in as starter, 'Reserve' if coach's pick */
  currentAllStarRole?: 'Starter' | 'Reserve';
  /** Career awards sorted newest-first */
  careerAwards?: { label: string; year: number; icon: string }[];
  /** Current league season number — labels the "This Season" stats tab */
  currentSeason?: number;
  /** League-level context for advanced stat calculations */
  leagueContext?: {
    allPlayers: Player[];
    teamPlayers: Player[];
    seasonLength: number;
    currentTeamAbbreviation?: string;
    teamStreak?: number;
    teamScheme?: string;
    teamWins?: number;
    teamLosses?: number;
    /** Team's actual rotation — used to derive true role (Starter/Rotation/Bench) */
    teamRotation?: TeamRotation;
    teamLogo?: string;
    teamPrimaryColor?: string;
    /** Current league season — used to scope matchup stats to this season only. */
    currentSeason?: number;
    /** Facilities budget (20–100) — used to show morale impact in Mindset panel. */
    facilitiesBudget?: number;
  };
  /** All team names for the draft-team dropdown in god mode */
  teams?: string[];
  /** League max player salary for God Mode validation */
  maxPlayerSalary?: number;
  /** How many dev-focus interventions the GM has used this season */
  devInterventionsUsed?: number;
  /** Maximum allowed interventions per season */
  devInterventionsMax?: number;
  /** Called when GM sets a new training focus for this player */
  onSetTrainingFocus?: (playerId: string, areas: TrainingFocusArea[], durationDays: number) => void;
  /** Called when GM activates play-through for an injured player */
  onPlayThroughInjury?: (playerId: string) => void;
  /** Called when GM extends this player's contract (offseason or expiring) */
  onExtend?: (playerId: string, years: number, salary: number) => void;
  /** True when the league is in offseason phase */
  isOffseason?: boolean;
  /** True in WNBA-only mode — affects salary display scale */
  isWomensLeague?: boolean;
  /** Max allowable extension salary (e.g. max player salary from contract rules) */
  maxExtensionSalary?: number;
  /** League award history — used to compute HOF probability */
  awardHistory?: SeasonAwards[];
  /** True if this player is already in the Hall of Fame */
  isHofMember?: boolean;
  /** Year the player was inducted (if HOF member) */
  hofYearInducted?: number;
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

// ── Archetype Fit Debug Panel ────────────────────────────────────────────────
const ArchetypeDebugPanel: React.FC<{ player: Player }> = ({ player }) => {
  const [open, setOpen] = React.useState(false);
  const fitScores = React.useMemo(
    () => getArchetypeFitScores(player.position, player.attributes as Record<string, number>, player.rating),
    [player.position, player.attributes, player.rating],
  );
  const top5 = fitScores.slice(0, 5);

  // Primary / secondary skill identity
  const attrs = player.attributes as Record<string, number>;
  const skillGroups: [string, string[]][] = [
    ['Scoring',   ['shooting3pt', 'shootingMid', 'postScoring', 'layups']],
    ['Defense',   ['perimeterDef', 'interiorDef', 'blocks', 'steals', 'defensiveIQ']],
    ['Playmaking',['ballHandling', 'passing', 'offensiveIQ']],
    ['Rebounding',['offReb', 'defReb']],
    ['Athleticism',['speed', 'jumping', 'strength', 'stamina', 'athleticism']],
  ];
  const groupAverages = skillGroups.map(([label, keys]) => ({
    label,
    avg: Math.round(keys.reduce((s, k) => s + (attrs[k] ?? 50), 0) / keys.length),
  })).sort((a, b) => b.avg - a.avg);

  // Outlier warnings
  const archetype = player.archetype ?? 'Role Player';
  const warnings: string[] = [];
  if (archetype === 'Rim Protector' && (attrs.postScoring ?? 50) >= 85) {
    warnings.push(`High postScoring (${attrs.postScoring}) for a Rim Protector`);
  }
  if (archetype === 'Glass Cleaner' && (attrs.postScoring ?? 50) >= 85) {
    warnings.push(`High postScoring (${attrs.postScoring}) for a Glass Cleaner`);
  }
  if ((archetype === 'Playmaking Guard' || archetype === 'Pure Scorer') && (attrs.blocks ?? 50) >= 80) {
    warnings.push(`Unusually high blocks (${attrs.blocks}) for a ${archetype}`);
  }
  if (archetype === 'Stretch Big' && (attrs.blocks ?? 50) >= 85) {
    warnings.push(`High blocks (${attrs.blocks}) unusual for a Stretch Big`);
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[10px] text-slate-500 hover:text-amber-400 uppercase tracking-widest flex items-center gap-1 transition-colors"
      >
        <span>{open ? '▾' : '▸'}</span> Archetype Fit
      </button>
      {open && (
        <div className="mt-2 bg-slate-900/80 border border-slate-700/50 rounded-xl p-3 space-y-3 text-xs">
          {/* Top 5 fit scores */}
          <div>
            <p className="text-slate-400 uppercase tracking-wider mb-1 font-semibold">Top Archetype Fits</p>
            <div className="space-y-1">
              {top5.map(({ archetype: arc, score, isPrimary }) => (
                <div key={arc} className="flex items-center gap-2">
                  <div className="w-36 truncate text-slate-300 font-medium">{arc}</div>
                  <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isPrimary ? 'bg-amber-400' : 'bg-slate-500'}`}
                      style={{ width: `${Math.min(100, score)}%` }}
                    />
                  </div>
                  <div className={`w-8 text-right font-mono ${isPrimary ? 'text-amber-400' : 'text-slate-400'}`}>{score}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Skill identity */}
          <div>
            <p className="text-slate-400 uppercase tracking-wider mb-1 font-semibold">Skill Identity</p>
            <p className="text-white">
              Primary: <span className="text-amber-400 font-bold">{groupAverages[0].label}</span> <span className="text-slate-400">({groupAverages[0].avg})</span>
            </p>
            <p className="text-white">
              Secondary: <span className="text-sky-400 font-semibold">{groupAverages[1].label}</span> <span className="text-slate-400">({groupAverages[1].avg})</span>
            </p>
          </div>
          {/* Outlier warnings */}
          {warnings.length > 0 && (
            <div>
              <p className="text-slate-400 uppercase tracking-wider mb-1 font-semibold">Outlier Warnings</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-yellow-400">⚠ {w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PlayerModal: React.FC<PlayerModalProps> = ({
  player,
  onClose,
  onScout,
  scoutingReport,
  isUserTeam,
  onUpdateStatus,
  onRelease,
  onAppealSuspension,
  draftLocked = false,
  godMode = false,
  onUpdatePlayer,
  isCurrentAllStar = false,
  currentAllStarRole,
  careerAwards = [],
  currentSeason,
  leagueContext,
  teams = [],
  maxPlayerSalary,
  devInterventionsUsed = 0,
  devInterventionsMax = 4,
  onSetTrainingFocus,
  onPlayThroughInjury,
  onExtend,
  isOffseason = false,
  isWomensLeague = false,
  maxExtensionSalary,
  awardHistory = [],
  isHofMember = false,
  hofYearInducted,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [statsTab, setStatsTab] = useState<'season' | 'career' | 'advanced' | 'playoffs'>('season');
  const [showFocusPanel, setShowFocusPanel] = useState(false);
  const [focusDraft, setFocusDraft] = useState<TrainingFocusArea[]>([]);
  const [focusDuration, setFocusDuration] = useState<30 | 60 | 90>(60);
  const [vsTeamId, setVsTeamId] = useState<string>('all');
  const [showExtendPanel, setShowExtendPanel] = useState(false);
  const [extendYears, setExtendYears] = useState(2);
  const [extendSalary, setExtendSalary] = useState(player.salary || (isWomensLeague ? 75_000 : 5_000_000));

  const ALL_FOCUS_AREAS: TrainingFocusArea[] = [
    'Shooting / 3PT', 'Playmaking / Passing', 'Defense / Rebounding',
    'Post Scoring / Interior', 'Athleticism / Dunking', 'Finishing / Layups',
    'Free Throws', 'Mental / Leadership',
  ];
  const FOCUS_ICONS: Record<TrainingFocusArea, string> = {
    'Shooting / 3PT':          '🎯',
    'Playmaking / Passing':    '🎩',
    'Defense / Rebounding':    '🛡️',
    'Post Scoring / Interior': '🏋️',
    'Athleticism / Dunking':   '💥',
    'Finishing / Layups':      '🔥',
    'Free Throws':             '🎱',
    'Mental / Leadership':     '🧠',
  };
  const toggleFocusArea = (area: TrainingFocusArea) => {
    setFocusDraft(prev =>
      prev.includes(area)
        ? prev.filter(a => a !== area)
        : prev.length < 2 ? [...prev, area] : prev
    );
  };
  const previewResponse = (): { label: string; color: string; desc: string } => {
    const morale = player.morale ?? 75;
    const traits = player.personalityTraits ?? [];
    if (traits.includes('Gym Rat') || traits.includes('Workhorse') || (morale >= 75 && !traits.includes('Lazy') && !traits.includes('Diva/Star'))) {
      return { label: '🔥 Enthusiastic', color: 'text-emerald-400', desc: '+40% development bonus' };
    } else if (traits.includes('Lazy') || traits.includes('Diva/Star') || morale < 40) {
      return { label: '😤 Resistant', color: 'text-rose-400', desc: 'Only 45% of bonus applies' };
    }
    return { label: '👍 Receptive', color: 'text-amber-400', desc: 'Standard development bonus' };
  };

  // ── Last 5 non-DNP games (most recent first) ──────────────────────────────
  const last5Games = useMemo(() =>
    [...(player.gameLog ?? [])]
      .filter(g => !g.dnp)
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
      .slice(0, 5),
    [player.gameLog],
  );

  // ── Season highs computed from this season's game log ─────────────────────
  const seasonHighs = useMemo(() => {
    const games = (player.gameLog ?? []).filter(g => !g.dnp);
    if (!games.length) return null;
    const maxOf = (fn: (g: typeof games[0]) => number) =>
      games.reduce((m, g) => Math.max(m, fn(g)), 0);
    const bestFgPctGame = games
      .filter(g => g.fga >= 5)
      .reduce<typeof games[0] | null>((best, g) =>
        !best || g.fgm / g.fga > best.fgm / best.fga ? g : best, null);
    const best3PctGame = games
      .filter(g => g.threepa >= 3)
      .reduce<typeof games[0] | null>((best, g) =>
        !best || g.threepm / g.threepa > best.threepm / best.threepa ? g : best, null);
    return {
      pts:     maxOf(g => g.pts),
      reb:     maxOf(g => g.reb),
      ast:     maxOf(g => g.ast),
      stl:     maxOf(g => g.stl),
      blk:     maxOf(g => g.blk),
      threepm: maxOf(g => g.threepm),
      ftm:     maxOf(g => g.ftm),
      fgm:     maxOf(g => g.fgm),
      pm:      games.reduce((m, g) => Math.max(m, g.plusMinus), -999),
      bestFgPctGame,
      best3PctGame,
    };
  }, [player.gameLog]);

  // ── Unique opponents seen in game log (scoped to current season) ──────────
  const uniqueOpponents = useMemo(() => {
    const currentSeason = leagueContext?.currentSeason;
    const seen = new Map<string, string>();
    (player.gameLog ?? []).forEach(g => {
      if (!g.opponentTeamId || !g.opponentTeamName) return;
      if (currentSeason !== undefined && g.season !== undefined && g.season !== currentSeason) return;
      if (!seen.has(g.opponentTeamId)) seen.set(g.opponentTeamId, g.opponentTeamName);
    });
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [player.gameLog, leagueContext?.currentSeason]);

  // ── Aggregated stats for selected opponent (or all opponents) ─────────────
  const vsTeamStats = useMemo(() => {
    const currentSeason = leagueContext?.currentSeason;
    const games = (player.gameLog ?? []).filter(g => {
      if (g.dnp) return false;
      // Scope to current season when season field is available
      if (currentSeason !== undefined && g.season !== undefined && g.season !== currentSeason) return false;
      return vsTeamId === 'all' || g.opponentTeamId === vsTeamId;
    });
    if (!games.length) return null;
    const n = games.length;
    const sum = (fn: (g: typeof games[0]) => number) => games.reduce((acc, g) => acc + fn(g), 0);
    const totalFga = sum(g => g.fga), totalFgm = sum(g => g.fgm);
    const total3pa = sum(g => g.threepa), total3pm = sum(g => g.threepm);
    const totalFta = sum(g => g.fta), totalFtm = sum(g => g.ftm);
    return {
      gp: n,
      ppg:  sum(g => g.pts)  / n,
      rpg:  sum(g => g.reb)  / n,
      apg:  sum(g => g.ast)  / n,
      spg:  sum(g => g.stl)  / n,
      bpg:  sum(g => g.blk)  / n,
      fgPct:    totalFga > 0 ? totalFgm / totalFga : null,
      threePct: total3pa > 0 ? total3pm / total3pa : null,
      ftPct:    totalFta > 0 ? totalFtm / totalFta : null,
      pm:   sum(g => g.plusMinus) / n,
    };
  }, [player.gameLog, vsTeamId]);

  const defaultAttributes = {
    shooting: 50, defense: 50, rebounding: 50, playmaking: 50, athleticism: 50,
    layups: 50, dunks: 50, shootingMid: 50, shooting3pt: 50, freeThrow: 70,
    speed: 60, strength: 55, jumping: 55, stamina: 75,
    perimeterDef: 50, interiorDef: 50, steals: 50, blocks: 50,
    defensiveIQ: 50, ballHandling: 50, passing: 50, offensiveIQ: 50,
    postScoring: 50, offReb: 50, defReb: 50, durability: 65
  };

  const defaultTendencies: PlayerTendencies = {
    threePoint: 50, midRange: 50, foulDrawing: 50, postUp: 50, layup: 50,
    dunk: 50, spotUp: 50, drive: 50, offScreenThree: 50, offScreenMidRange: 50,
    cutToBasket: 50, pass: 50, isolation: 50, onBallSteal: 50, block: 50,
    alleyOop: 50, shotContest: 50, putback: 50, pullUpJumper: 50,
    pullUpThree: 50, playPassLane: 50,
  };

  const normalizePlayer = (p: Player): Player => ({
    ...p,
    attributes: p.attributes ?? defaultAttributes,
    personalityTraits: p.personalityTraits ?? [],
    tendencies: p.tendencies ?? defaultTendencies,
  });

  const [editedPlayer, setEditedPlayer] = React.useState<Player>(normalizePlayer(player));
  // Separate string state for the age input so intermediate keystrokes (e.g. deleting
  // one digit of "30" to get "3") don't corrupt editedPlayer.age or birthdate.
  const [ageInputStr, setAgeInputStr] = React.useState(String(player.age));

  // Split name for editing
  const splitName = (full: string) => {
    const idx = full.indexOf(' ');
    return idx === -1
      ? { first: full, last: '' }
      : { first: full.slice(0, idx), last: full.slice(idx + 1) };
  };
  const [editFirstName, setEditFirstName] = React.useState(() => splitName(player.name).first);
  const [editLastName, setEditLastName]   = React.useState(() => splitName(player.name).last);
  const [attrTab, setAttrTab] = React.useState<'attributes' | 'tendencies'>('attributes');

  useEffect(() => {
    setEditedPlayer(normalizePlayer(player));
    setAgeInputStr(String(player.age));
    const { first, last } = splitName(player.name);
    setEditFirstName(first);
    setEditLastName(last);
  }, [player]);

  // Randomize helpers
  const allFirstNames = editedPlayer.gender === 'Female' ? NAMES_FEMALE.first : NAMES_MALE.first;
  const allLastNames  = editedPlayer.gender === 'Female' ? NAMES_FEMALE.last  : NAMES_MALE.last;
  const allColleges   = [...COLLEGES_HIGH_MAJOR, ...COLLEGES_MID_MAJOR];
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const randomizeFirstName = () => setEditFirstName(pick(allFirstNames));
  const randomizeLastName  = () => setEditLastName(pick(allLastNames));
  const randomizeJersey    = () => setEditedPlayer(p => ({ ...p, jerseyNumber: Math.floor(Math.random() * 100) }));
  const randomizeCollege   = () => setEditedPlayer(p => ({ ...p, college: pick(allColleges) }));
  const randomizeHometown  = () => setEditedPlayer(p => { const ht = pick(ALL_HOMETOWNS); return { ...p, hometown: ht, country: countryFromHometown(ht) }; });

  useEffect(() => {
    const scrollContainer = document.getElementById('modal-scroll-container');
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }, [player.id]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const getAttrColor = (val: number) => {
    if (val >= 85) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    if (val >= 70) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
    return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
  };

  const formatPhysicals = (heightStr: string, weightLbs: number) => {
    const hParts = heightStr.match(/\d+/g);
    if (!hParts) return heightStr;
    const feet = parseInt(hParts[0]);
    const inches = parseInt(hParts[1]);
    const totalInches = (feet * 12) + inches;
    const cm = Math.round(totalInches * 2.54);
    const kg = Math.round(weightLbs * 0.453592);
    return `${feet}-${inches}, ${weightLbs}lb (${cm}cm, ${kg}kg)`;
  };

  const AttributeRow = ({ label, value, potential }: { label: string, value: number, potential?: number }) => (
    <div className="group/attr relative">
      <div className="flex justify-between items-center text-[9px] font-bold uppercase mb-1">
        <span className="text-slate-400 tracking-wider group-hover/attr:text-white transition-colors">{label}</span>
        <div className="flex items-center gap-1.5">
            <span className="text-white font-mono">{value}</span>
            {potential && potential > value && (
              <span className="text-slate-600 font-mono text-[7px]">P {potential}</span>
            )}
        </div>
      </div>
      <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden p-[1px] border border-slate-800 relative">
        {potential && potential > value && (
          <div 
            className="absolute top-0 bottom-0 left-0 bg-slate-800 opacity-50" 
            style={{ width: `${potential}%` }}
          ></div>
        )}
        <div 
          className={`h-full rounded-full transition-all duration-1000 relative z-10 ${getAttrColor(value)}`} 
          style={{ width: `${value}%` }}
        ></div>
      </div>
    </div>
  );

  const handleSave = () => {
    if (onUpdatePlayer) {
      const fullName = [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(' ');
      const withName = { ...editedPlayer, name: fullName || editedPlayer.name };
      const bounded = enforcePositionalBounds(withName);
      onUpdatePlayer({ ...bounded, potential: derivePotential(bounded.rating, bounded.age) });
    }
    setIsEditing(false);
  };

  /** Potential is auto-derived from current rating + age (not manually editable). */
  const derivePotential = (rating: number, age: number): number =>
    Math.min(99, Math.max(rating, Math.round(rating + Math.max(0, (27 - age)) * 1.5)));

  const COMPOSITE_KEYS = new Set<string>(['shooting', 'defense', 'rebounding', 'playmaking', 'athleticism']);

  const handleAttributeChange = (key: keyof Player['attributes'], val: number) => {
    setEditedPlayer(prev => {
      const femaleCap = prev.gender === 'Female' ? (FEMALE_ATTR_CAPS[key] ?? 99) : 99;
      const clamped = Math.min(val, femaleCap);
      const withSub = { ...prev.attributes, [key]: clamped };
      const withComposites = deriveComposites(withSub);
      const bounded = enforcePositionalBounds({ ...prev, attributes: withComposites });
      const archetype = deriveArchetype(bounded.position, bounded.attributes as Record<string, number>, bounded.rating);
      return { ...bounded, archetype };
    });
  };

  const handleDraftInfoChange = (key: keyof Player['draftInfo'], val: any) => {
    setEditedPlayer(prev => ({
      ...prev,
      draftInfo: {
        ...prev.draftInfo,
        [key]: val
      }
    }));
  };

  const handleContractChange = (key: keyof Player, val: any) => {
    setEditedPlayer(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleTendencyChange = (key: keyof PlayerTendencies, val: number) => {
    setEditedPlayer(prev => ({
      ...prev,
      tendencies: { ...(prev.tendencies ?? defaultTendencies), [key]: val },
    }));
  };

  const personalityTraitsList: PersonalityTrait[] = [
    'Leader', 'Diva/Star', 'Loyal', 'Professional', 'Gym Rat', 
    'Lazy', 'Clutch', 'Tough/Alpha', 'Friendly/Team First', 'Money Hungry',
    'Hot Head', 'Workhorse', 'Streaky'
  ];
  const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const archetypes = ['Hybrid Star', '3&D Wing', 'Pure Scorer', 'Lockdown Defender', 'Stretch Big', 'Rim Protector', 'Playmaking Guard', 'Two-Way Forward', 'Bench Spark', 'Role Player'];

  if (isEditing) {
    return (
      <div
        className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-end md:items-center justify-center md:p-10 animate-in fade-in duration-300"
        onClick={onClose}
      >
        <div
          className="bg-slate-900 border border-slate-800 rounded-t-[2rem] md:rounded-[3rem] w-full max-w-7xl max-h-[95dvh] md:max-h-[92vh] overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)] relative"
          onClick={e => e.stopPropagation()}
        >
          <header className="p-4 md:p-8 border-b border-slate-800 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-3xl font-display font-bold uppercase tracking-tight text-white">Edit <span className="text-amber-500">Player</span></h2>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">God Mode: Full Data Access</p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsEditing(false)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-8 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-xl transition-all shadow-lg shadow-amber-500/20"
              >
                Save Changes
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="space-y-8">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Basic Information</h3>
                <div className="space-y-4">
                  {/* First Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">First Name</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editFirstName}
                        onChange={e => setEditFirstName(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-display text-xl focus:outline-none focus:border-amber-500/50"
                      />
                      <button
                        onClick={randomizeFirstName}
                        title="Randomize first name"
                        className="px-3 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-400 rounded-xl transition-all text-sm font-black"
                      >⚄</button>
                    </div>
                  </div>
                  {/* Last Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Last Name</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editLastName}
                        onChange={e => setEditLastName(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-display text-xl focus:outline-none focus:border-amber-500/50"
                      />
                      <button
                        onClick={randomizeLastName}
                        title="Randomize last name"
                        className="px-3 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-400 rounded-xl transition-all text-sm font-black"
                      >⚄</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Age</label>
                      <input
                        type="number"
                        min="18" max="45"
                        value={ageInputStr}
                        onChange={e => setAgeInputStr(e.target.value)}
                        onBlur={() => {
                          // Commit the typed age to editedPlayer only on blur, clamped to valid range.
                          // This avoids corrupting birthdate while the user is mid-type (e.g. "3" of "30").
                          const raw = parseInt(ageInputStr, 10);
                          const clamped = Math.min(45, Math.max(18, isNaN(raw) ? editedPlayer.age : raw));
                          setAgeInputStr(String(clamped));
                          const updated: typeof editedPlayer = { ...editedPlayer, age: clamped };
                          if (currentSeason) {
                            const newBirthYear = currentSeason - clamped;
                            const [, mm, dd] = (editedPlayer.birthdate ?? `${newBirthYear}-06-15`).split('-');
                            updated.birthdate = `${newBirthYear}-${mm}-${dd}`;
                          }
                          setEditedPlayer(updated);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Jersey #</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0" max="99"
                          value={editedPlayer.jerseyNumber}
                          onChange={e => setEditedPlayer({...editedPlayer, jerseyNumber: parseInt(e.target.value)})}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        />
                        <button
                          onClick={randomizeJersey}
                          title="Randomize jersey number"
                          className="px-3 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-400 rounded-xl transition-all text-sm font-black"
                        >⚄</button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Height</label>
                      <input 
                        type="text" 
                        value={editedPlayer.height}
                        onChange={e => setEditedPlayer({...editedPlayer, height: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        placeholder="e.g. 6-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Weight (lbs)</label>
                      <input 
                        type="number" 
                        value={editedPlayer.weight}
                        onChange={e => setEditedPlayer({...editedPlayer, weight: parseInt(e.target.value)})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Position</label>
                    <select 
                      value={editedPlayer.position}
                      onChange={e => {
                        const newPos = e.target.value as Position;
                        const ranges = POS_ATTR_RANGES[newPos];
                        const newAttrs = { ...editedPlayer.attributes } as any;
                        POS_RANGE_KEYS.forEach(k => {
                          const [lo, hi] = ranges[k];
                          newAttrs[k] = Math.min(hi, Math.max(lo, newAttrs[k]));
                        });
                        setEditedPlayer({ ...editedPlayer, position: newPos, attributes: newAttrs });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                    >
                      {positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Archetype <span className="text-slate-600 normal-case font-normal">(auto)</span></label>
                    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-400 font-bold">
                      {editedPlayer.archetype}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hometown / Country</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editedPlayer.hometown}
                        onChange={e => setEditedPlayer({...editedPlayer, hometown: e.target.value, country: countryFromHometown(e.target.value)})}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                      />
                      <button
                        onClick={randomizeHometown}
                        title="Randomize hometown"
                        className="px-3 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-400 rounded-xl transition-all text-sm font-black"
                      >⚄</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">College / School</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editedPlayer.college ?? ''}
                        onChange={e => setEditedPlayer({...editedPlayer, college: e.target.value})}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        placeholder="e.g. Duke, N/A"
                      />
                      <button
                        onClick={randomizeCollege}
                        title="Randomize college"
                        className="px-3 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-400 rounded-xl transition-all text-sm font-black"
                      >⚄</button>
                    </div>
                  </div>
                </div>

                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] pt-4">Personality & Traits</h3>
                <div className="flex flex-wrap gap-2">
                  {personalityTraitsList.map(trait => (
                    <button
                      key={trait}
                      onClick={() => {
                        const hasTrait = editedPlayer.personalityTraits.includes(trait);
                        setEditedPlayer({
                          ...editedPlayer,
                          personalityTraits: hasTrait 
                            ? editedPlayer.personalityTraits.filter(t => t !== trait)
                            : [...editedPlayer.personalityTraits, trait]
                        });
                      }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                        editedPlayer.personalityTraits.includes(trait)
                          ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg shadow-amber-500/20'
                          : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {traitIcons[trait]} {trait}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Attributes & Rating</h3>
                  {/* OVR and POT are read-only — derived from attributes and age */}
                  <div className="flex gap-6 bg-slate-950/50 rounded-2xl px-6 py-4 border border-slate-800">
                    <div className="text-center">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">OVR</p>
                      <p className="text-3xl font-display font-black text-white">{editedPlayer.rating}</p>
                      <p className="text-[8px] text-slate-600 mt-0.5">from attributes</p>
                    </div>
                    <div className="w-px bg-slate-800 self-stretch"/>
                    <div className="text-center">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">POT</p>
                      <p className="text-3xl font-display font-black text-amber-500">{derivePotential(editedPlayer.rating, editedPlayer.age)}</p>
                      <p className="text-[8px] text-slate-600 mt-0.5">from rating + age</p>
                    </div>
                  </div>
                </div>

                {/* Composites: read-only, derived from sub-attributes */}
                <div className="grid grid-cols-5 gap-3 bg-slate-950/60 rounded-2xl p-4 border border-slate-800">
                  {(['shooting', 'defense', 'rebounding', 'playmaking', 'athleticism'] as const).map(key => {
                    const val = editedPlayer.attributes[key] as number;
                    const color = val >= 85 ? 'text-emerald-400' : val >= 70 ? 'text-amber-400' : 'text-rose-400';
                    const bar   = val >= 85 ? 'bg-emerald-500' : val >= 70 ? 'bg-amber-500' : 'bg-rose-500';
                    return (
                      <div key={key} className="flex flex-col items-center gap-1.5">
                        <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider text-center">{key}</span>
                        <span className={`text-2xl font-display font-black ${color}`}>{val}</span>
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${val}%` }} />
                        </div>
                        <span className="text-[7px] text-slate-600 uppercase tracking-widest">auto</span>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  <div className="space-y-6">
                    <div className="h-px w-full bg-slate-800/50 my-4"></div>

                    {Object.entries(editedPlayer.attributes)
                      .filter(([key]) => !COMPOSITE_KEYS.has(key))
                      .slice(0, 12)
                      .map(([key, val]) => (
                      <div key={key} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">{key.replace(/([A-Z])/g, ' $1')}</label>
                          <span className="font-mono text-xs text-slate-300">{val}</span>
                        </div>
                        <input
                          type="range" min="0" max="99" value={val as number}
                          onChange={e => handleAttributeChange(key as any, parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-6">
                    {Object.entries(editedPlayer.attributes)
                      .filter(([key]) => !COMPOSITE_KEYS.has(key))
                      .slice(12)
                      .map(([key, val]) => {
                        const femaleCap = editedPlayer.gender === 'Female' ? (FEMALE_ATTR_CAPS[key as keyof Player['attributes']] ?? undefined) : undefined;
                        const sliderMax = femaleCap ?? 99;
                        const overCap = femaleCap !== undefined && (val as number) > femaleCap;
                        return (
                        <div key={key} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">{key.replace(/([A-Z])/g, ' $1')}</label>
                            <div className="flex items-center gap-2">
                              {femaleCap !== undefined && (
                                <span className="text-[8px] text-violet-400/70 font-mono">♀ max {femaleCap}</span>
                              )}
                              <span className={`font-mono text-xs ${overCap ? 'text-amber-400' : 'text-slate-300'}`}>{val}</span>
                            </div>
                          </div>
                          <input
                            type="range" min="0" max={sliderMax} value={Math.min(val as number, sliderMax)}
                            onChange={e => handleAttributeChange(key as any, parseInt(e.target.value))}
                            className={`w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer ${femaleCap !== undefined ? 'accent-violet-500' : 'accent-slate-600'}`}
                          />
                          {overCap && (
                            <p className="text-[8px] text-amber-500/80 font-semibold">⚠ Will be capped to {femaleCap} on save</p>
                          )}
                        </div>
                        );
                      })}

                    <div className="h-px w-full bg-slate-800/50 my-4"></div>
                    
                    <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Contract & Draft</h3>
                    {maxPlayerSalary && editedPlayer.salary > maxPlayerSalary && (
                      <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
                        <span className="text-rose-400 text-[11px]">⚠ Salary exceeds league max ({fmtSalary(maxPlayerSalary)})</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                          Salary ($)
                          {maxPlayerSalary && <span className="ml-2 text-emerald-600 normal-case font-bold">max {fmtSalary(maxPlayerSalary)}</span>}
                        </label>
                        <input
                          type="number"
                          value={editedPlayer.salary}
                          onChange={e => handleContractChange('salary', parseInt(e.target.value))}
                          className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 ${maxPlayerSalary && editedPlayer.salary > maxPlayerSalary ? 'border-rose-500/50' : 'border-slate-800'}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Years Left</label>
                        <input 
                          type="number" 
                          min="0" max="5"
                          value={editedPlayer.contractYears}
                          onChange={e => handleContractChange('contractYears', parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>
                    {/* ── FA Type ── */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">FA Classification</label>
                      <select
                        value={editedPlayer.faType ?? 'none'}
                        onChange={e => handleContractChange('faType', e.target.value === 'none' ? undefined : (e.target.value as 'UFA' | 'RFA'))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="none">— None —</option>
                        <option value="UFA">Unrestricted FA (UFA)</option>
                        <option value="RFA">Restricted FA (RFA)</option>
                      </select>
                    </div>

                    {/* ── Team Option ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Team Option</label>
                        <button
                          type="button"
                          onClick={() => handleContractChange('teamOption', !editedPlayer.teamOption)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${editedPlayer.teamOption ? 'bg-amber-500' : 'bg-slate-700'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${editedPlayer.teamOption ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {editedPlayer.teamOption && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-bold">Year</span>
                          <input
                            type="number"
                            min="1" max="5"
                            value={editedPlayer.teamOptionYear ?? 1}
                            onChange={e => handleContractChange('teamOptionYear', parseInt(e.target.value))}
                            className="w-full bg-slate-950 border border-amber-500/30 rounded-xl px-4 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      )}
                    </div>

                    {/* ── Player Option ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Player Option</label>
                        <button
                          type="button"
                          onClick={() => handleContractChange('playerOption', !editedPlayer.playerOption)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${editedPlayer.playerOption ? 'bg-sky-500' : 'bg-slate-700'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${editedPlayer.playerOption ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {editedPlayer.playerOption && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-bold">Year</span>
                          <input
                            type="number"
                            min="1" max="5"
                            value={editedPlayer.playerOptionYear ?? 1}
                            onChange={e => handleContractChange('playerOptionYear', parseInt(e.target.value))}
                            className="w-full bg-slate-950 border border-sky-500/30 rounded-xl px-4 py-2 text-white font-bold focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Draft Year</label>
                        <input
                          type="number"
                          value={editedPlayer.draftInfo.year}
                          onChange={e => handleDraftInfoChange('year', parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Draft Round</label>
                        <input
                          type="number"
                          min="0" max="2"
                          value={editedPlayer.draftInfo.round}
                          onChange={e => handleDraftInfoChange('round', parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Draft Pick</label>
                        <input
                          type="number"
                          min="0" max="60"
                          value={editedPlayer.draftInfo.pick}
                          onChange={e => handleDraftInfoChange('pick', parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Draft Team</label>
                        <select
                          value={editedPlayer.draftInfo.team}
                          onChange={e => handleDraftInfoChange('team', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        >
                          <option value="Undrafted">Undrafted</option>
                          {teams.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tendencies ─────────────────────────────────────────────────── */}
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] whitespace-nowrap">Tendencies</h3>
                <div className="h-px w-full bg-slate-800/50"></div>
                <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest whitespace-nowrap">0 = never · 100 = always</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {/* Offensive */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">⚡ Offensive</h4>
                  <div className="space-y-4">
                    {([
                      ['threePoint',        '3PT Shooting'],
                      ['midRange',          'Mid-Range'],
                      ['pullUpThree',       'Pull-Up 3'],
                      ['pullUpJumper',      'Pull-Up Jumper'],
                      ['drive',             'Drive'],
                      ['layup',             'Layup'],
                      ['dunk',              'Dunk'],
                      ['postUp',            'Post Up'],
                      ['spotUp',            'Spot Up'],
                      ['cutToBasket',       'Cut to Basket'],
                      ['offScreenThree',    'Off Screen 3PT'],
                      ['offScreenMidRange', 'Off Screen Mid'],
                      ['alleyOop',          'Alley Oop'],
                      ['putback',           'Putback'],
                      ['isolation',         'Isolation'],
                      ['pass',              'Pass / Kick Out'],
                      ['foulDrawing',       'Foul Drawing'],
                    ] as [keyof PlayerTendencies, string][]).map(([key, label]) => {
                      const val = (editedPlayer.tendencies ?? defaultTendencies)[key] ?? 50;
                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{label}</label>
                            <span className={`font-mono text-xs ${
                              val >= 70 ? 'text-sky-400 font-black' : val >= 40 ? 'text-slate-300' : 'text-slate-500'
                            }`}>{val}</span>
                          </div>
                          <input
                            type="range" min="0" max="100" value={val}
                            onChange={e => handleTendencyChange(key, parseInt(e.target.value))}
                            className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-sky-500"
                          />
                          <div className="flex justify-between text-[7px] text-slate-700 font-mono">
                            <span>0</span><span>50</span><span>100</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Defensive */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">🛡️ Defensive</h4>
                  <div className="space-y-4">
                    {([
                      ['onBallSteal',  'On Ball Steal'],
                      ['block',        'Block'],
                      ['shotContest',  'Shot Contest'],
                      ['playPassLane', 'Play Pass Lane'],
                    ] as [keyof PlayerTendencies, string][]).map(([key, label]) => {
                      const val = (editedPlayer.tendencies ?? defaultTendencies)[key] ?? 50;
                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{label}</label>
                            <span className={`font-mono text-xs ${
                              val >= 70 ? 'text-rose-400 font-black' : val >= 40 ? 'text-slate-300' : 'text-slate-500'
                            }`}>{val}</span>
                          </div>
                          <input
                            type="range" min="0" max="100" value={val}
                            onChange={e => handleTendencyChange(key, parseInt(e.target.value))}
                            className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-rose-500"
                          />
                          <div className="flex justify-between text-[7px] text-slate-700 font-mono">
                            <span>0</span><span>50</span><span>100</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-end md:items-center justify-center md:p-10 animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 duration-300"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-t-[2rem] md:rounded-[3rem] w-full max-w-7xl max-h-[95dvh] md:max-h-[92vh] overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)] relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-4 right-4 md:top-8 md:right-8 z-[1100] flex gap-2 md:gap-3">
          {godMode && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 md:p-4 bg-amber-500 hover:bg-amber-400 rounded-full text-slate-950 transition-all shadow-xl border border-amber-600"
              title="God Mode: Edit Player"
            >
              <svg className="w-5 h-5 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 md:p-4 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-all shadow-xl border border-slate-700"
          >
            <svg className="w-5 h-5 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div
          className="relative h-44 md:h-64 shrink-0 overflow-hidden"
          style={leagueContext?.teamPrimaryColor
            ? { background: `linear-gradient(135deg, #0f172a 0%, ${leagueContext.teamPrimaryColor}30 100%)` }
            : { backgroundColor: '#0f172a' }}
        >
          {/* Team logo — faded background element */}
          {leagueContext?.teamLogo ? (
            <img
              src={leagueContext.teamLogo}
              alt=""
              className="absolute right-2 top-1/2 -translate-y-1/2 w-80 h-80 object-contain pointer-events-none select-none"
              style={{ opacity: 0.13 }}
              referrerPolicy="no-referrer"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 font-display font-black text-white/[0.04] pointer-events-none select-none leading-none"
              style={{ fontSize: '18rem' }}>
              #{player.jerseyNumber}
            </div>
          )}
          {/* Gradient overlays — keep left-side text crisp */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/20" />
          <div className="absolute bottom-4 left-4 md:bottom-10 md:left-12 flex items-end gap-8 pr-20 md:pr-0">

            <div className="relative z-10 flex flex-col">
              <h2 className="text-3xl md:text-5xl lg:text-8xl font-display font-bold uppercase tracking-tighter text-white drop-shadow-lg leading-tight flex items-baseline gap-3">
                {player.name}
                {(player.allStarSelections?.length ?? 0) > 0 && (
                  <span
                    title={`${player.allStarSelections!.length}× All-Star`}
                    className="text-amber-400 text-4xl md:text-6xl leading-none select-none drop-shadow-md"
                  >★</span>
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1 md:mt-2">
                <span className="px-3 py-1 md:px-4 md:py-1.5 bg-amber-500 text-slate-950 text-xs font-black uppercase rounded-lg shadow-lg shadow-amber-500/20">{player.position}</span>
                <span className="text-slate-100 font-display font-bold text-sm md:text-xl uppercase tracking-wider">
                   {formatPhysicals(player.height, player.weight)}
                </span>
                {(() => {
                  // Derive true role from team rotation; fall back to player.status
                  const rot = leagueContext?.teamRotation;
                  const effectiveRole: PlayerStatus = (() => {
                    if (!rot) return player.status;
                    if (Object.values(rot.starters).includes(player.id)) return 'Starter';
                    if (rot.bench.includes(player.id)) return 'Rotation';
                    if (rot.reserves.includes(player.id)) return 'Bench';
                    return player.status;
                  })();
                  const roleStyle = effectiveRole === 'Starter'
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                    : effectiveRole === 'Injured'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'bg-slate-800/50 text-slate-400 border-slate-700/50';
                  return (
                    <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${roleStyle}`}>
                      {effectiveRole}
                    </span>
                  );
                })()}
                {isCurrentAllStar && (
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border flex items-center gap-1.5 shadow-lg ${
                    currentAllStarRole === 'Starter'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-900/30'
                      : 'bg-sky-500/15 text-sky-400 border-sky-500/30 shadow-sky-900/20'
                  }`}>
                    ⭐ All-Star {currentAllStarRole}
                  </span>
                )}
                {player.isSuspended && (player.suspensionGames ?? 0) > 0 && (
                  <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border flex items-center gap-1.5 bg-red-500/15 text-red-400 border-red-500/40 shadow-lg shadow-red-900/20">
                    ⛔ Suspended · {player.suspensionGames}G remaining
                    {player.suspensionReason ? ` · ${player.suspensionReason}` : ''}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 md:mt-4">
                {player.personalityTraits.map(trait => (
                  <span key={trait} className="px-2.5 py-0.5 md:px-3 md:py-1 bg-amber-600/20 text-amber-500 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-900/20 flex items-center gap-1">
                    <span>{traitIcons[trait]}</span>
                    {trait}
                  </span>
                ))}
                {(player.allStarSelections?.length ?? 0) > 0 && (
                  <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                    ⭐ {player.allStarSelections!.length}× All-Star
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div id="modal-scroll-container" className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 space-y-6 md:space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
          <section className="bg-slate-950/40 border border-slate-800/60 rounded-2xl md:rounded-[2.5rem] p-4 md:p-8 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
             <div className="space-y-4">
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Archetype</span>
                   <span className="text-amber-500 text-base font-bold uppercase tracking-widest">{player.archetype || 'Role Player'}</span>
                </div>
                <ArchetypeDebugPanel player={player} />
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">
                      {(player as any).school ? 'School/Origin' : 'College'}
                   </span>
                   <span className="text-white text-base font-medium">
                      {(player as any).school || (player.college !== 'None' ? player.college : '—')}
                   </span>
                </div>
                {(player as any).proLeague && (!player.college || player.college === 'None') && (
                  <div className="flex items-center gap-4">
                     <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Pro League</span>
                     <span className="text-white text-base font-medium">{(player as any).proLeague}</span>
                  </div>
                )}
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Hometown</span>
                   <span className="text-white text-base font-medium">{player.hometown} {getFlag(player.country)}</span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Born</span>
                   <span className="text-white text-base font-medium">
                     {(() => {
                       if (!player.birthdate) return 'Unknown';
                       const [y, m, d] = player.birthdate.split('-').map(Number);
                       const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                       return `${months[m - 1]} ${d}, ${y} (Age: ${player.age})`;
                     })()}
                   </span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Height</span>
                   <span className="text-white text-base font-medium">{player.height}</span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Weight</span>
                   <span className="text-white text-base font-medium">{player.weight} lbs</span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Draft</span>
                   <span className="text-white text-base font-medium">
                      {player.draftInfo.round === 0
                        ? `Undrafted • Signed ${player.draftInfo.year || '—'}`
                        : `${player.draftInfo.year || '—'} • R${player.draftInfo.round} P${player.draftInfo.pick} (${player.draftInfo.team})`}
                   </span>
                </div>
             </div>
             <div className="space-y-4">
                <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Overall Efficiency</h4>
                {(() => {
                  const effRating = getEffectiveRating(player);
                  const isInj = player.status === 'Injured' || (player.injuryDaysLeft != null && player.injuryDaysLeft > 0);
                  const daysLeft = player.injuryDaysLeft ?? 0;
                  const severity = isInj ? getInjurySeverity(daysLeft) : null;
                  const showPlayThrough = isUserTeam && isInj && !player.isCareerEnding && !player.isPlayingThrough && daysLeft > 0 && canPlayThrough(daysLeft) && !!onPlayThroughInjury;
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-6xl font-display font-bold" style={{ color: player.isCareerEnding ? '#7f1d1d' : isInj ? '#f43f5e' : 'white' }}>{effRating}</span>
                          {player.isCareerEnding && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-red-300 bg-red-900/40 border border-red-700/60 rounded px-2 py-0.5 whitespace-nowrap animate-pulse">
                              ☠ Career Threat — Season Ended
                            </span>
                          )}
                          {!player.isCareerEnding && player.isPlayingThrough && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-300 bg-orange-900/30 border border-orange-500/40 rounded px-2 py-0.5 whitespace-nowrap">
                              Playing Hurt ⚠️ -{player.injuryOVRPenalty} OVR
                            </span>
                          )}
                          {!player.isCareerEnding && !player.isPlayingThrough && isInj && player.injuryOVRPenalty != null && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-0.5 whitespace-nowrap">
                              {severity === 'severe' ? '🚑' : severity === 'moderate' ? '🤕' : '🩹'} {severity} — -{player.injuryOVRPenalty} OVR
                            </span>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            <span>Rating: {player.rating}{isInj && player.injuryOVRPenalty != null ? ` (Eff: ${effRating})` : ''}</span>
                            <span>Potential: {player.potential}</span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full" style={{ width: `${effRating}%`, backgroundColor: player.isCareerEnding ? '#7f1d1d' : isInj ? '#f43f5e' : '#f59e0b' }}></div>
                          </div>
                          {player.potentialLossNote && (
                            <p className="text-[9px] font-bold text-rose-400 mt-1">{player.potentialLossNote}</p>
                          )}
                          {isInj && daysLeft > 0 && daysLeft < 999 && (
                            <p className="text-[9px] text-slate-500 font-bold">{daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining · {player.injuryType ?? 'Injury'}</p>
                          )}
                        </div>
                      </div>

                      {/* Play Through Injury panel */}
                      {showPlayThrough && (
                        <div className="bg-orange-900/20 border border-orange-500/30 rounded-2xl p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <span className="text-base">⚠️</span>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                                Play Through Injury — {severity === 'moderate' ? 'High Risk' : 'Available'}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                                {severity === 'moderate'
                                  ? 'Moderate injuries carry significant risk of worsening. Continued play could escalate to a severe or season-ending injury.'
                                  : 'Minor injury — player can suit up at reduced OVR. Still carries worsening risk, especially in playoffs or back-to-backs.'}
                              </p>
                              <p className="text-[9px] text-orange-400/70 mt-1 font-bold">
                                OVR drops an additional 5–12 points while playing hurt. Worsening chance: {severity === 'moderate' ? '4–14%' : '6–18%'} per game day.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => onPlayThroughInjury!(player.id)}
                            className="w-full py-2.5 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[10px] font-black uppercase tracking-widest hover:bg-orange-500/30 transition-all"
                          >
                            Activate Play Through Injury
                          </button>
                        </div>
                      )}

                      {/* Career-ending — no play-through available */}
                      {player.isCareerEnding && (
                        <div className="bg-red-900/20 border border-red-700/40 rounded-2xl p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Career-Threatening Injury</p>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            This player cannot return this season. Their long-term future is uncertain. Potential has been permanently affected.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
             </div>
          </section>

          <section className="space-y-5 md:space-y-8">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] whitespace-nowrap">
                {attrTab === 'attributes' ? 'Technical Attribute Matrix' : 'Player Tendencies'}
              </h3>
              <div className="h-px flex-1 bg-slate-800/50"></div>
              {/* Tab toggle */}
              <div className="flex rounded-xl overflow-hidden border border-slate-700/60 shrink-0">
                <button
                  onClick={() => setAttrTab('attributes')}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                    attrTab === 'attributes'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 text-slate-500 hover:text-slate-300'
                  }`}
                >Attributes</button>
                <button
                  onClick={() => setAttrTab('tendencies')}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                    attrTab === 'tendencies'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 text-slate-500 hover:text-slate-300'
                  }`}
                >Tendencies</button>
              </div>
              {/* Active training focus badge */}
              {attrTab === 'attributes' && player.trainingFocus && player.trainingFocus.daysRemaining > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-500/10 border border-sky-500/30 rounded-xl">
                  <span className="text-xs leading-none">🎯</span>
                  <div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-sky-400/70">Training Focus</div>
                    <div className="text-[10px] font-bold text-sky-300 leading-tight">
                      {player.trainingFocus.areas.join(' · ')}
                    </div>
                  </div>
                  <span className={`ml-1 text-[8px] font-black uppercase ${
                    player.trainingFocus.playerResponse === 'enthusiastic' ? 'text-emerald-400' :
                    player.trainingFocus.playerResponse === 'resistant' ? 'text-rose-400' : 'text-amber-400'
                  }`}>
                    {player.trainingFocus.playerResponse === 'enthusiastic' ? '🔥 All-In' :
                     player.trainingFocus.playerResponse === 'resistant' ? '😤 Resisting' : '👍 On-Board'}
                  </span>
                </div>
              )}
            </div>
            
            {attrTab === 'attributes' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
              {/* Scoring & Shooting */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pb-2 border-b border-slate-800/50">Scoring & Shooting</h4>
                <div className="space-y-4">
                  <AttributeRow label="Overall Shooting" value={player.attributes.shooting} />
                  <AttributeRow label="Layups" value={player.attributes.layups} />
                  <AttributeRow label="Dunks" value={player.attributes.dunks} />
                  <AttributeRow label="Mid-Range" value={player.attributes.shootingMid} />
                  <AttributeRow label="3PT Shooting" value={player.attributes.shooting3pt} />
                  <AttributeRow label="Free Throw" value={player.attributes.freeThrow} />
                  <AttributeRow label="Post Scoring" value={player.attributes.postScoring} />
                </div>
              </div>

              {/* IQ & Playmaking */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pb-2 border-b border-slate-800/50">IQ & Playmaking</h4>
                <div className="space-y-4">
                  <AttributeRow label="Overall Playmaking" value={player.attributes.playmaking} />
                  <AttributeRow label="Ball Handling" value={player.attributes.ballHandling} />
                  <AttributeRow label="Passing" value={player.attributes.passing} />
                  <AttributeRow label="Offensive IQ" value={player.attributes.offensiveIQ} />
                  <AttributeRow label="Defensive IQ" value={player.attributes.defensiveIQ} />
                </div>
              </div>

              {/* Defense & Rebounding */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pb-2 border-b border-slate-800/50">Defense & Boards</h4>
                <div className="space-y-4">
                  <AttributeRow label="Overall Defense" value={player.attributes.defense} />
                  <AttributeRow label="Perimeter Def" value={player.attributes.perimeterDef} />
                  <AttributeRow label="Interior Def" value={player.attributes.interiorDef} />
                  <AttributeRow label="Steals" value={player.attributes.steals} />
                  <AttributeRow label="Blocks" value={player.attributes.blocks} />
                  <AttributeRow label="Overall Reb" value={player.attributes.rebounding} />
                  <AttributeRow label="Off Rebounding" value={player.attributes.offReb} />
                  <AttributeRow label="Def Rebounding" value={player.attributes.defReb} />
                </div>
              </div>

              {/* Physicals */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pb-2 border-b border-slate-800/50">Physicality</h4>
                <div className="space-y-4">
                  <AttributeRow label="Overall Athleticism" value={player.attributes.athleticism} />
                  <AttributeRow label="Speed" value={player.attributes.speed} />
                  <AttributeRow label="Strength" value={player.attributes.strength} />
                  <AttributeRow label="Vertical/Jumping" value={player.attributes.jumping} />
                  <AttributeRow label="Stamina" value={player.attributes.stamina} />
                  <AttributeRow label="Durability" value={player.attributes.durability ?? 65} />
                </div>
              </div>
            </div>
            ) : player.tendencies ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Offensive Tendencies */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">⚡ Offensive</h4>
                <div className="space-y-3">
                  {([
                    ['3PT Shooting',    player.tendencies.threePoint],
                    ['Mid-Range',       player.tendencies.midRange],
                    ['Pull-Up 3',       player.tendencies.pullUpThree],
                    ['Pull-Up Jumper',  player.tendencies.pullUpJumper],
                    ['Drive',           player.tendencies.drive],
                    ['Layup',           player.tendencies.layup],
                    ['Dunk',            player.tendencies.dunk],
                    ['Post Up',         player.tendencies.postUp],
                    ['Spot Up',         player.tendencies.spotUp],
                    ['Cut to Basket',   player.tendencies.cutToBasket],
                    ['Off Screen 3PT',  player.tendencies.offScreenThree],
                    ['Off Screen Mid',  player.tendencies.offScreenMidRange],
                    ['Alley Oop',       player.tendencies.alleyOop],
                    ['Putback',         player.tendencies.putback],
                    ['Isolation',       player.tendencies.isolation],
                    ['Pass / Kick Out', player.tendencies.pass],
                    ['Foul Drawing',    player.tendencies.foulDrawing],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-400 font-semibold w-36 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${val >= 70 ? 'bg-sky-400' : val >= 45 ? 'bg-sky-600' : 'bg-slate-600'}`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-black w-7 text-right tabular-nums ${val >= 70 ? 'text-sky-400' : val >= 45 ? 'text-slate-300' : 'text-slate-500'}`}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Defensive Tendencies */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">🛡️ Defensive</h4>
                <div className="space-y-3">
                  {([
                    ['On Ball Steal',  player.tendencies.onBallSteal],
                    ['Block',          player.tendencies.block],
                    ['Shot Contest',   player.tendencies.shotContest],
                    ['Play Pass Lane', player.tendencies.playPassLane],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-400 font-semibold w-36 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${val >= 70 ? 'bg-rose-400' : val >= 45 ? 'bg-rose-700' : 'bg-slate-600'}`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-black w-7 text-right tabular-nums ${val >= 70 ? 'text-rose-400' : val >= 45 ? 'text-slate-300' : 'text-slate-500'}`}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            ) : (
              <p className="text-[10px] text-slate-600 italic">No tendency data available.</p>
            )}
          </section>

          {/* ── Player Stats ──────────────────────────────────────────────── */}
          {(() => {
            const s   = player.stats;
            const gp  = Math.max(1, s.gamesPlayed);
            const mpg = s.minutes  > 0 ? s.minutes  / gp : 0;
            const ppg = s.points   > 0 ? s.points   / gp : 0;
            const rpg = s.rebounds > 0 ? s.rebounds / gp : 0;
            const apg = s.assists  > 0 ? s.assists  / gp : 0;
            const spg = s.steals   > 0 ? s.steals   / gp : 0;
            const bpg = s.blocks   > 0 ? s.blocks   / gp : 0;
            const tpg = s.tov      > 0 ? s.tov      / gp : 0;
            const fgp = s.fga  > 0 ? s.fgm  / s.fga  : 0;
            const tpp = s.threepa > 0 ? s.threepm / s.threepa : 0;
            const ftp = s.fta  > 0 ? s.ftm  / s.fta  : 0;
            const eFG = s.fga  > 0 ? (s.fgm + 0.5 * s.threepm) / s.fga : 0;
            const twopm = s.fgm - s.threepm;
            const twopa = s.fga - s.threepa;
            const twop = twopa > 0 ? twopm / twopa : 0;
            const ts  = (s.fga + 0.44 * s.fta) > 0
              ? s.points / (2 * (s.fga + 0.44 * s.fta)) : 0;
            const _lgAvgRaw = leagueAvgRawUPER(
              (leagueContext?.allPlayers ?? []).map(p => p.stats)
            );
            const per = normalizePER(rawUPER(s), _lgAvgRaw);
            const pmPg = s.gamesPlayed > 0 ? s.plusMinus / s.gamesPlayed : 0;

            // Current-season splits from previous teams (trade splits)
            const currentSeasonSplits = currentSeason
              ? (player.careerStats ?? []).filter(cs => cs.year === currentSeason && cs.isSplit)
              : [];

            const hasCareer   = player.careerStats && player.careerStats.length > 0;
            const hasCurr     = s.gamesPlayed > 0 || currentSeasonSplits.length > 0;
            const hasPlayoffs = !!player.playoffStats && player.playoffStats.gamesPlayed > 0;
            const hasHighs   = player.careerHighs && (
              player.careerHighs.points   > 0 ||
              player.careerHighs.rebounds > 0 ||
              player.careerHighs.assists  > 0
            );

            if (!hasCurr && !hasCareer) return null;

            const fmt1   = (v: number) => v.toFixed(1);
            const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';
            const fmtPm  = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1);

            const statCols: { label: string; value: string; hi?: boolean }[] = [
              { label: 'GP',  value: String(s.gamesPlayed) },
              { label: 'GS',  value: String(s.gamesStarted) },
              { label: 'MIN', value: fmt1(mpg) },
              { label: 'PTS', value: fmt1(ppg), hi: ppg >= 20 },
              { label: 'REB', value: fmt1(rpg), hi: rpg >= 8 },
              { label: 'ORB', value: fmt1(s.offReb / gp) },
              { label: 'DRB', value: fmt1(s.defReb / gp) },
              { label: 'AST', value: fmt1(apg), hi: apg >= 6 },
              { label: 'STL', value: fmt1(spg), hi: spg >= 1.5 },
              { label: 'BLK', value: fmt1(bpg), hi: bpg >= 1.5 },
              { label: 'TO',  value: fmt1(tpg) },
              { label: 'PF',  value: fmt1(s.pf / gp) },
              { label: 'FGM', value: fmt1(s.fgm / gp) },
              { label: 'FGA', value: fmt1(s.fga / gp) },
              { label: 'FG%', value: fmtPct(fgp), hi: fgp >= 0.5 },
              { label: '3PM', value: fmt1(s.threepm / gp) },
              { label: '3PA', value: fmt1(s.threepa / gp) },
              { label: '3P%', value: s.threepa > 0 ? fmtPct(tpp) : '—', hi: tpp >= 0.38 },
              { label: '2PM', value: fmt1(twopm / gp) },
              { label: '2PA', value: fmt1(twopa / gp) },
              { label: '2P%', value: twopa > 0 ? fmtPct(twop) : '—', hi: twop >= 0.52 },
              { label: 'FTM', value: fmt1(s.ftm / gp) },
              { label: 'FTA', value: fmt1(s.fta / gp) },
              { label: 'FT%', value: s.fta > 0 ? fmtPct(ftp) : '—' },
              { label: 'eFG%', value: fmtPct(eFG) },
            ];

            const advCols: { label: string; value: string }[] = [
              { label: 'PER', value: fmt1(per) },
              { label: 'TS%', value: fmtPct(ts) },
              { label: '+/-', value: fmtPm(pmPg) },
            ];

            // ── Advanced Stats ───────────────────────────────────────────────
            const adv = (() => {
              const lgCtx = leagueContext;
              const PACE = 100; // sim default possessions per game
              const SEASON = lgCtx?.seasonLength ?? 82;

              // Team totals
              const tm = lgCtx?.teamPlayers ?? [];
              const tmGP   = tm.length ? Math.max(...tm.map(p => p.stats.gamesPlayed)) : Math.max(1, gp);
              const tmMIN  = tm.reduce((a, p) => a + p.stats.minutes, 0) || (s.minutes * 5);
              const tmFGM  = tm.reduce((a, p) => a + p.stats.fgm, 0) || s.fgm * 5;
              const tmFGA  = tm.reduce((a, p) => a + p.stats.fga, 0) || s.fga * 5;
              const tmFTA  = tm.reduce((a, p) => a + p.stats.fta, 0) || s.fta * 5;
              const tmORB  = tm.reduce((a, p) => a + p.stats.offReb, 0) || s.offReb * 5;
              const tmDRB  = tm.reduce((a, p) => a + p.stats.defReb, 0) || s.defReb * 5;
              const tmAST  = tm.reduce((a, p) => a + p.stats.assists, 0) || s.assists * 5;
              const tmSTL  = tm.reduce((a, p) => a + p.stats.steals, 0) || s.steals * 5;
              const tmBLK  = tm.reduce((a, p) => a + p.stats.blocks, 0) || s.blocks * 5;
              const tmTOV  = tm.reduce((a, p) => a + p.stats.tov, 0) || s.tov * 5;
              const tmPTS  = tm.reduce((a, p) => a + p.stats.points, 0) || s.points * 5;

              // League averages (qualified players with ≥5 GP)
              const allQ = (lgCtx?.allPlayers ?? []).filter(p => p.stats.gamesPlayed >= 5);
              const n    = Math.max(1, allQ.length);
              const lgPPG  = allQ.reduce((a, p) => a + p.stats.points  / p.stats.gamesPlayed, 0) / n;
              const lgMPG  = allQ.reduce((a, p) => a + p.stats.minutes / p.stats.gamesPlayed, 0) / n;
              const lgORB  = allQ.reduce((a, p) => a + p.stats.offReb  / p.stats.gamesPlayed, 0) / n;
              const lgDRB  = allQ.reduce((a, p) => a + p.stats.defReb  / p.stats.gamesPlayed, 0) / n;
              const lgAST  = allQ.reduce((a, p) => a + p.stats.assists / p.stats.gamesPlayed, 0) / n;
              const lgSTL  = allQ.reduce((a, p) => a + p.stats.steals  / p.stats.gamesPlayed, 0) / n;
              const lgBLK  = allQ.reduce((a, p) => a + p.stats.blocks  / p.stats.gamesPlayed, 0) / n;
              const lgTOV  = allQ.reduce((a, p) => a + p.stats.tov     / p.stats.gamesPlayed, 0) / n;
              const lgFGA  = allQ.reduce((a, p) => a + p.stats.fga     / p.stats.gamesPlayed, 0) / n;
              const lgFTA  = allQ.reduce((a, p) => a + p.stats.fta     / p.stats.gamesPlayed, 0) / n;
              const lgFGM  = allQ.reduce((a, p) => a + p.stats.fgm     / p.stats.gamesPlayed, 0) / n;
              const lgPoss = lgFGA + 0.44 * lgFTA + lgTOV; // approx per-player poss per game

              // Approx opponent stats ≈ league avg (symmetric league)
              const oppORBperGame = lgORB * (lgCtx?.teamPlayers.length ?? 10) / n * n;
              const oppDRBperGame = lgDRB * (lgCtx?.teamPlayers.length ?? 10) / n * n;
              // Actually just use per-team approx: opp ~= same as team
              const oppORB = tmGP * lgORB * 5; // approx opp ORB = league avg per player × 5 players × games
              const oppDRB = tmGP * lgDRB * 5;
              const oppFGA = tmGP * lgFGA * 5;
              const lg3PA  = lgCtx ? lgCtx.allPlayers.reduce((a,p)=>a+p.stats.threepa/Math.max(1,p.stats.gamesPlayed),0)/n : 5;
              const opp3PA = tmGP * lg3PA;
              const opp2PA = oppFGA - opp3PA;
              const oppPoss = tmGP * PACE;

              // Per-possession (total season)
              const possUsed = Math.max(1, s.fga + 0.44 * s.fta + s.tov);

              // ── Rate stats ──
              const threePAr = s.fga > 0 ? s.threepa / s.fga : 0;
              const FTr      = s.fga > 0 ? s.fta / s.fga : 0;
              const TOVpct   = 100 * s.tov / possUsed;
              const USGpct   = (tmFGA + 0.44*tmFTA + tmTOV) > 0
                ? 100 * possUsed / (possUsed + ((tmFGA + 0.44*tmFTA + tmTOV) - possUsed) * (s.minutes / Math.max(1, tmMIN/5)))
                : 0;
              // Proper USG%: 100 * (FGA + 0.44*FTA + TOV) / ((MP/(TmMP/5)) * (TmFGA + 0.44*TmFTA + TmTOV))
              const USGpctProper = (s.minutes > 0 && tmMIN > 0 && (tmFGA+0.44*tmFTA+tmTOV) > 0)
                ? 100 * possUsed / ((s.minutes / (tmMIN / 5)) * (tmFGA + 0.44*tmFTA + tmTOV))
                : USGpct;

              // ── Rebound / rate percentages ──
              const ORBpct = (s.minutes > 0 && (tmORB + oppDRB) > 0)
                ? 100 * s.offReb * (tmMIN/5) / (s.minutes * (tmORB + oppDRB))
                : 0;
              const DRBpct = (s.minutes > 0 && (oppORB + tmDRB) > 0)
                ? 100 * s.defReb * (tmMIN/5) / (s.minutes * (oppORB + tmDRB))
                : 0;
              const ASTpct = (s.minutes > 0 && tmFGM > 0)
                ? 100 * s.assists / ((s.minutes / (tmMIN/5)) * tmFGM - s.fgm)
                : 0;
              const STLpct = (s.minutes > 0 && oppPoss > 0)
                ? 100 * s.steals * (tmMIN/5) / (s.minutes * oppPoss)
                : 0;
              const BLKpct = (s.minutes > 0 && opp2PA > 0)
                ? 100 * s.blocks * (tmMIN/5) / (s.minutes * opp2PA)
                : 0;

              // ── Offensive / Defensive Ratings ──
              const ORtg = 100 * s.points / possUsed;
              // League ORtg baseline from all qualified players
              const lgPossPerPlayer = allQ.length
                ? allQ.reduce((a, p) => a + (p.stats.fga+0.44*p.stats.fta+p.stats.tov)/Math.max(1,p.stats.gamesPlayed), 0) / n
                : lgPoss;
              const lgORtg = lgPossPerPlayer > 0
                ? 100 * lgPPG / lgPossPerPlayer
                : 110;
              // Individual DRtg: league baseline adjusted for defensive contributions
              const lgDRtg = lgORtg; // symmetric in equilibrium
              const DRtg = lgDRtg
                - 2.5 * (spg - lgSTL / Math.max(1, lgMPG) * mpg) / Math.max(0.1, mpg) * mpg
                - 1.5 * (bpg - lgBLK / Math.max(1, lgMPG) * mpg) / Math.max(0.1, mpg) * mpg
                - 0.5 * (s.defReb/gp - lgDRB / Math.max(1, lgMPG) * mpg) / Math.max(0.1, mpg) * mpg;

              // ── BPM — per-game formula matching Stats.tsx calibration ──
              // avg player (14p/4r/3a, 55% TS) ≈ 0; All-Star (25/7/7, 58% TS) ≈ +6.
              const fgMissedPg = gp > 0 ? (s.fga - s.fgm) / gp : 0;
              const OBPM = Math.min(10, Math.max(-8,
                (ppg       - 10.0) * 0.28
                + (apg     -  2.0) * 0.65
                - tpg               * 0.80
                - fgMissedPg        * 0.12
                + (ts      - 0.52) * 20
              ));
              const DBPM = Math.min(6, Math.max(-4,
                (spg  - 0.80) * 1.50
                + (bpg - 0.40) * 1.20
                + (s.defReb / gp - 2.5) * 0.15
                - 0.80
              ));
              const BPM  = Math.min(12, Math.max(-8, OBPM + DBPM));
              const VORP = Math.max(0, (BPM + 2.0) * (s.minutes / (48 * SEASON)));

              // ── Win Shares — derived from BPM (avg=0.100, star=0.220+) ──
              const WS48 = Math.max(0, Math.min(0.350, (BPM + 2.0) * 0.020 + 0.060));
              const WS_raw = s.minutes > 0 ? WS48 * s.minutes / 48 : 0;
              const obpmPos = Math.max(0, OBPM + 2.0);
              const dbpmPos = Math.max(0, DBPM + 2.0);
              const bpmSum  = obpmPos + dbpmPos || 1;
              const OWS = Math.min(12, WS_raw * (obpmPos / bpmSum));
              const DWS = Math.min(10, WS_raw * (dbpmPos / bpmSum));
              const WS  = OWS + DWS;

              // ── EWA (Estimated Wins Added) — uses MPG, not season total ──
              const EWA = (per - 11.5) * mpg / 67.5;

              return {
                threePAr, FTr, TOVpct, USGpct: USGpctProper,
                ORBpct, DRBpct, ASTpct, STLpct, BLKpct,
                ORtg, DRtg, lgORtg, lgDRtg,
                OWS, DWS, WS, WS48,
                EWA, OBPM, DBPM, BPM, VORP,
              };
            })();

            return (
              <section className="space-y-5">
                {/* Header + tab switcher */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Statistics</h3>
                    {statsTab === 'season' && currentSeason && (
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                        {currentSeason}–{String(currentSeason + 1).slice(2)} Season
                      </p>
                    )}
                    {statsTab === 'playoffs' && (
                      <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest mt-0.5">Playoff Statistics</p>
                    )}
                    {statsTab === 'advanced' && (
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Advanced Analytics</p>
                    )}
                  </div>
                  <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-full p-0.5">
                    {hasCurr && (
                      <button
                        onClick={() => setStatsTab('season')}
                        className={`px-3 py-1 text-[10px] font-black uppercase rounded-full transition-all ${statsTab === 'season' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}
                      >
                        {currentSeason ? `${currentSeason}–${String(currentSeason + 1).slice(2)}` : 'Season'}
                      </button>
                    )}
                    {hasCareer && (
                      <button
                        onClick={() => setStatsTab('career')}
                        className={`px-3 py-1 text-[10px] font-black uppercase rounded-full transition-all ${statsTab === 'career' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}
                      >
                        Career
                      </button>
                    )}
                    {hasPlayoffs && (
                      <button
                        onClick={() => setStatsTab('playoffs')}
                        className={`px-3 py-1 text-[10px] font-black uppercase rounded-full transition-all ${statsTab === 'playoffs' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}
                      >
                        Playoffs
                      </button>
                    )}
                    {hasCurr && (
                      <button
                        onClick={() => setStatsTab('advanced')}
                        className={`px-3 py-1 text-[10px] font-black uppercase rounded-full transition-all ${statsTab === 'advanced' ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}
                      >
                        Advanced
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Season averages ─────────────────────────────────────────── */}
                {statsTab === 'season' && hasCurr && (
                  <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-center">
                        <thead>
                          <tr className="border-b border-slate-800">
                            {/* Show Team column if there are splits */}
                            {currentSeasonSplits.length > 0 && (
                              <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Team</th>
                            )}
                            {statCols.map(c => (
                              <th key={c.label} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {/* Split rows from previous teams this season */}
                          {currentSeasonSplits.map((split, i) => {
                            const sgp = Math.max(1, split.gamesPlayed);
                            const sTwopm = split.fgm - split.threepm;
                            const sTwopa = split.fga - split.threepa;
                            const splitCols = [
                              String(split.gamesPlayed),
                              String(split.gamesStarted),
                              (split.minutes / sgp).toFixed(1),
                              (split.points / sgp).toFixed(1),
                              (split.rebounds / sgp).toFixed(1),
                              (split.offReb / sgp).toFixed(1),
                              (split.defReb / sgp).toFixed(1),
                              (split.assists / sgp).toFixed(1),
                              (split.steals / sgp).toFixed(1),
                              (split.blocks / sgp).toFixed(1),
                              (split.tov / sgp).toFixed(1),
                              (split.pf / sgp).toFixed(1),
                              (split.fgm / sgp).toFixed(1),
                              (split.fga / sgp).toFixed(1),
                              split.fga > 0 ? ((split.fgm / split.fga) * 100).toFixed(1) + '%' : '—',
                              (split.threepm / sgp).toFixed(1),
                              (split.threepa / sgp).toFixed(1),
                              split.threepa > 0 ? ((split.threepm / split.threepa) * 100).toFixed(1) + '%' : '—',
                              (sTwopm / sgp).toFixed(1),
                              (sTwopa / sgp).toFixed(1),
                              sTwopa > 0 ? ((sTwopm / sTwopa) * 100).toFixed(1) + '%' : '—',
                              (split.ftm / sgp).toFixed(1),
                              (split.fta / sgp).toFixed(1),
                              split.fta > 0 ? ((split.ftm / split.fta) * 100).toFixed(1) + '%' : '—',
                              split.fga > 0 ? (((split.fgm + 0.5 * split.threepm) / split.fga) * 100).toFixed(1) + '%' : '—',
                            ];
                            return (
                              <tr key={`split-${i}`} className="hover:bg-slate-800/20 transition-colors opacity-75">
                                <td className="px-3 py-3">
                                  <span className="inline-block px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-[10px] font-black uppercase text-slate-400">
                                    {split.teamAbbreviation ?? split.teamName.slice(0, 3).toUpperCase()}
                                  </span>
                                </td>
                                {splitCols.map((val, j) => (
                                  <td key={j} className="px-3 py-3 font-display font-bold tabular-nums text-sm text-slate-400">
                                    {val}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                          {/* Current team row */}
                          {s.gamesPlayed > 0 && (
                            <tr>
                              {currentSeasonSplits.length > 0 && (
                                <td className="px-3 py-4">
                                  <span className="inline-block px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-md text-[10px] font-black uppercase text-amber-400">
                                    {leagueContext?.currentTeamAbbreviation ?? '—'}
                                  </span>
                                </td>
                              )}
                              {statCols.map(c => (
                                <td key={c.label} className={`px-3 py-4 font-display font-bold tabular-nums text-sm ${c.hi ? 'text-amber-400' : 'text-slate-200'}`}>
                                  {c.value}
                                </td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {/* Advanced row */}
                    <div className="border-t border-slate-800 grid grid-cols-3 divide-x divide-slate-800">
                      {advCols.map(c => (
                        <div key={c.label} className="py-3 text-center">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{c.label}</div>
                          <div className="font-display font-bold text-slate-300 tabular-nums mt-0.5">{c.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Season Highs ────────────────────────────────────────────── */}
                {statsTab === 'season' && seasonHighs && seasonHighs.pts > 0 && (() => {
                  const yr = currentSeason;
                  const hiCol = (v: number) =>
                    v >= 40 ? 'text-amber-300 font-black' :
                    v >= 30 ? 'text-amber-400 font-black' :
                    v >= 20 ? 'text-orange-400 font-bold' :
                    v >= 10 ? 'text-slate-200 font-bold' : 'text-slate-400';
                  const card = (label: string, v: number, gold?: boolean) => (
                    <div key={label} className={`rounded-xl p-2.5 text-center border ${gold ? 'bg-amber-500/10 border-amber-500/25' : 'bg-slate-900/60 border-slate-800/60'}`}>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">{label}</div>
                      <div className={`font-display font-bold text-xl tabular-nums mt-0.5 ${gold ? 'text-amber-400' : hiCol(v)}`}>{v || '—'}</div>
                    </div>
                  );
                  return (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-orange-500/70 uppercase tracking-widest">
                        {yr ? `${yr}–${String(yr + 1).slice(2)} ` : ''}Season Highs
                      </p>
                      <div className="bg-slate-950/60 border border-orange-500/10 rounded-2xl p-4 space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                          {card('PTS',  seasonHighs.pts,     seasonHighs.pts  >= 30)}
                          {card('REB',  seasonHighs.reb,     seasonHighs.reb  >= 15)}
                          {card('AST',  seasonHighs.ast,     seasonHighs.ast  >= 10)}
                          {card('3PM',  seasonHighs.threepm, seasonHighs.threepm >= 7)}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {card('STL', seasonHighs.stl)}
                          {card('BLK', seasonHighs.blk)}
                          {card('FTM', seasonHighs.ftm)}
                          <div className="rounded-xl p-2.5 text-center border bg-slate-900/60 border-slate-800/60">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">+/-</div>
                            <div className={`font-display font-bold text-xl tabular-nums mt-0.5 ${seasonHighs.pm > 15 ? 'text-emerald-400 font-black' : seasonHighs.pm > 0 ? 'text-slate-200' : 'text-slate-500'}`}>
                              {seasonHighs.pm > -999 ? (seasonHighs.pm > 0 ? `+${seasonHighs.pm}` : String(seasonHighs.pm)) : '—'}
                            </div>
                          </div>
                        </div>
                        {(seasonHighs.bestFgPctGame || seasonHighs.best3PctGame) && (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/40">
                            {seasonHighs.bestFgPctGame && (
                              <div className="flex items-center justify-between px-3 py-2 bg-slate-900/40 border border-slate-800/40 rounded-xl">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Best FG%</span>
                                <span className="text-[11px] font-bold text-amber-400">
                                  {seasonHighs.bestFgPctGame.fgm}/{seasonHighs.bestFgPctGame.fga} ({((seasonHighs.bestFgPctGame.fgm / seasonHighs.bestFgPctGame.fga) * 100).toFixed(0)}%)
                                </span>
                              </div>
                            )}
                            {seasonHighs.best3PctGame && (
                              <div className="flex items-center justify-between px-3 py-2 bg-slate-900/40 border border-slate-800/40 rounded-xl">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Best 3P%</span>
                                <span className="text-[11px] font-bold text-amber-400">
                                  {seasonHighs.best3PctGame.threepm}/{seasonHighs.best3PctGame.threepa} ({((seasonHighs.best3PctGame.threepm / seasonHighs.best3PctGame.threepa) * 100).toFixed(0)}%)
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Playoff Stats ───────────────────────────────────────────── */}
                {statsTab === 'playoffs' && hasPlayoffs && (() => {
                  const po   = player.playoffStats!;
                  const pgp  = Math.max(1, po.gamesPlayed);
                  const pmpg = po.minutes    / pgp;
                  const pppg = po.points     / pgp;
                  const prpg = po.rebounds   / pgp;
                  const papg = po.assists    / pgp;
                  const pspg = po.steals     / pgp;
                  const pbpg = po.blocks     / pgp;
                  const ptpg = po.tov        / pgp;
                  const pfgp = po.fga  > 0 ? po.fgm  / po.fga  : 0;
                  const ptpp = po.threepa > 0 ? po.threepm / po.threepa : 0;
                  const pftp = po.fta  > 0 ? po.ftm  / po.fta  : 0;
                  const peFG = po.fga  > 0 ? (po.fgm + 0.5 * po.threepm) / po.fga : 0;
                  const pTwo = po.fgm - po.threepm;
                  const pTwoA = po.fga - po.threepa;
                  const pTs  = (po.fga + 0.44 * po.fta) > 0
                    ? po.points / (2 * (po.fga + 0.44 * po.fta)) : 0;
                  const pPer = normalizePER(rawUPER(po), _lgAvgRaw);

                  const poCols = [
                    { label: 'GP',   value: String(po.gamesPlayed) },
                    { label: 'GS',   value: String(po.gamesStarted ?? 0) },
                    { label: 'MIN',  value: pmpg.toFixed(1) },
                    { label: 'PTS',  value: pppg.toFixed(1), hi: pppg >= 20 },
                    { label: 'REB',  value: prpg.toFixed(1), hi: prpg >= 8 },
                    { label: 'ORB',  value: (po.offReb / pgp).toFixed(1) },
                    { label: 'DRB',  value: (po.defReb / pgp).toFixed(1) },
                    { label: 'AST',  value: papg.toFixed(1), hi: papg >= 6 },
                    { label: 'STL',  value: pspg.toFixed(1), hi: pspg >= 1.5 },
                    { label: 'BLK',  value: pbpg.toFixed(1), hi: pbpg >= 1.5 },
                    { label: 'TO',   value: ptpg.toFixed(1) },
                    { label: 'PF',   value: (po.pf / pgp).toFixed(1) },
                    { label: 'FGM',  value: (po.fgm / pgp).toFixed(1) },
                    { label: 'FGA',  value: (po.fga / pgp).toFixed(1) },
                    { label: 'FG%',  value: po.fga > 0 ? (pfgp * 100).toFixed(1) + '%' : '—', hi: pfgp >= 0.5 },
                    { label: '3PM',  value: (po.threepm / pgp).toFixed(1) },
                    { label: '3PA',  value: (po.threepa / pgp).toFixed(1) },
                    { label: '3P%',  value: po.threepa > 0 ? (ptpp * 100).toFixed(1) + '%' : '—', hi: ptpp >= 0.38 },
                    { label: '2PM',  value: (pTwo / pgp).toFixed(1) },
                    { label: '2PA',  value: (pTwoA / pgp).toFixed(1) },
                    { label: '2P%',  value: pTwoA > 0 ? ((pTwo / pTwoA) * 100).toFixed(1) + '%' : '—' },
                    { label: 'FTM',  value: (po.ftm / pgp).toFixed(1) },
                    { label: 'FTA',  value: (po.fta / pgp).toFixed(1) },
                    { label: 'FT%',  value: po.fta > 0 ? (pftp * 100).toFixed(1) + '%' : '—' },
                    { label: 'eFG%', value: po.fga > 0 ? (peFG * 100).toFixed(1) + '%' : '—' },
                  ] as { label: string; value: string; hi?: boolean }[];

                  return (
                    <div className="bg-slate-950/50 border border-amber-500/20 rounded-3xl overflow-hidden">
                      <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.4em]">Playoff Statistics · Per Game</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-center">
                          <thead>
                            <tr className="border-b border-slate-800/60">
                              {poCols.map(c => (
                                <th key={c.label} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {poCols.map(c => (
                                <td key={c.label} className={`px-3 py-4 font-display font-bold tabular-nums text-sm ${c.hi ? 'text-amber-400' : 'text-slate-200'}`}>
                                  {c.value}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t border-slate-800/60 grid grid-cols-3 sm:grid-cols-6 divide-x divide-slate-800/60">
                        {(() => {
                          const pPmPg = po.gamesPlayed > 0 ? po.plusMinus / po.gamesPlayed : 0;
                          const pPoss = (po.fga / pgp) - (po.offReb / pgp) + 0.44 * (po.fta / pgp) + ptpg;
                          const pORtg = pPoss > 0.5 ? Math.round((pppg / pPoss) * 100) : 0;
                          const pDRtg = Math.max(85, Math.round(110 - (pspg + pbpg) * 2.5 - (po.defReb / pgp) * 0.5));
                          return [
                            { label: 'PER',   value: isNaN(pPer)  ? '—' : pPer.toFixed(1),          hi: pPer >= 20 },
                            { label: 'TS%',   value: isNaN(pTs)   ? '—' : (pTs * 100).toFixed(1) + '%', hi: pTs >= 0.58 },
                            { label: 'eFG%',  value: po.fga > 0   ? (peFG * 100).toFixed(1) + '%' : '—', hi: peFG >= 0.53 },
                            { label: '+/-',   value: po.gamesPlayed > 0 ? (pPmPg >= 0 ? '+' : '') + pPmPg.toFixed(1) : '—', hi: pPmPg >= 5 },
                            { label: 'ORtg',  value: pORtg > 0    ? String(pORtg) : '—',              hi: pORtg >= 115 },
                            { label: 'DRtg',  value: po.gamesPlayed > 0 ? String(pDRtg) : '—',        hi: pDRtg <= 105 },
                          ];
                        })().map(c => (
                          <div key={c.label} className="py-3 text-center">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{c.label}</div>
                            <div className={`font-display font-bold tabular-nums mt-0.5 text-sm ${c.hi ? 'text-amber-400' : 'text-slate-300'}`}>{c.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Advanced Stats ──────────────────────────────────────────── */}
                {statsTab === 'advanced' && hasCurr && (() => {
                  const f1  = (v: number) => isNaN(v) || !isFinite(v) ? '—' : v.toFixed(1);
                  const f2  = (v: number) => isNaN(v) || !isFinite(v) ? '—' : v.toFixed(2);
                  const f3  = (v: number) => isNaN(v) || !isFinite(v) ? '—' : (v * 100).toFixed(1) + '%';
                  const fpm = (v: number) => isNaN(v) || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1);

                  type AdvGroup = {
                    title: string;
                    color: string;
                    desc: string;
                    stats: { label: string; value: string; desc: string; hi?: boolean; lo?: boolean }[];
                  };

                  const groups: AdvGroup[] = [
                    {
                      title: 'Overall Value',
                      color: 'amber',
                      desc: 'Composite metrics estimating a player\'s total contribution',
                      stats: [
                        { label: 'PER',    value: f1(per),         desc: 'Player Efficiency Rating — per-minute production, lg avg 15',            hi: per >= 20, lo: per < 10 },
                        { label: 'EWA',    value: f1(adv.EWA),    desc: 'Estimated Wins Added — wins contributed above replacement',              hi: adv.EWA >= 5, lo: adv.EWA < 0 },
                        { label: 'WS',     value: f1(adv.WS),     desc: 'Win Shares — estimated wins a player contributed',                        hi: adv.WS >= 6, lo: adv.WS < 0 },
                        { label: 'WS/48',  value: f2(adv.WS48),   desc: 'Win Shares per 48 minutes, lg avg ~0.10',                               hi: adv.WS48 >= 0.15, lo: adv.WS48 < 0.05 },
                        { label: 'BPM',    value: fpm(adv.BPM),   desc: 'Box Plus/Minus — estimated pt differential per 100 poss vs avg player',  hi: adv.BPM >= 3, lo: adv.BPM < -2 },
                        { label: 'VORP',   value: f2(adv.VORP),   desc: 'Value Over Replacement Player — cumulative BPM above replacement level', hi: adv.VORP >= 2, lo: adv.VORP < 0 },
                      ],
                    },
                    {
                      title: 'Shooting',
                      color: 'orange',
                      desc: 'Scoring efficiency and shot-selection tendencies',
                      stats: [
                        { label: 'TS%',   value: f3(ts),           desc: 'True Shooting % — accounts for 3-pointers and free throws',             hi: ts >= 0.58, lo: ts < 0.50 },
                        { label: 'eFG%',  value: f3(eFG),          desc: 'Effective FG% — weights 3-pointers as 1.5× a 2-pointer',               hi: eFG >= 0.54, lo: eFG < 0.46 },
                        { label: 'ORtg',  value: f1(adv.ORtg),    desc: `Offensive Rating — pts produced per 100 poss (lg avg ${f1(adv.lgORtg)})`, hi: adv.ORtg >= adv.lgORtg + 5, lo: adv.ORtg < adv.lgORtg - 5 },
                        { label: '3PAr',  value: f3(adv.threePAr), desc: '3-Point Attempt Rate — fraction of FGA taken from 3',                  hi: adv.threePAr >= 0.45 },
                        { label: 'FTr',   value: f3(adv.FTr),     desc: 'Free Throw Rate — FTA per FGA',                                          hi: adv.FTr >= 0.35 },
                        { label: 'OBPM',  value: fpm(adv.OBPM),   desc: 'Offensive Box Plus/Minus — offensive contribution vs avg',              hi: adv.OBPM >= 2, lo: adv.OBPM < -1 },
                      ],
                    },
                    {
                      title: 'Defense',
                      color: 'sky',
                      desc: 'Defensive impact and protection metrics',
                      stats: [
                        { label: 'DRtg',  value: f1(adv.DRtg),    desc: `Def Rating — pts allowed per 100 poss (lower is better, lg ~${f1(adv.lgDRtg)})`, lo: adv.DRtg > adv.lgDRtg + 5, hi: adv.DRtg < adv.lgDRtg - 3 },
                        { label: 'STL%',  value: f3(adv.STLpct/100), desc: 'Steal Percentage — % of opponent poss ending in a steal',             hi: adv.STLpct >= 2.5 },
                        { label: 'BLK%',  value: f3(adv.BLKpct/100), desc: 'Block Percentage — % of opp 2PA blocked while on floor',              hi: adv.BLKpct >= 3.0 },
                        { label: 'DRB%',  value: f3(adv.DRBpct/100), desc: 'Def Rebound % — % of available def rebounds grabbed while on floor',  hi: adv.DRBpct >= 25 },
                        { label: 'OWS',   value: f1(adv.OWS),    desc: 'Offensive Win Shares',                                                   hi: adv.OWS >= 4 },
                        { label: 'DWS',   value: f1(adv.DWS),    desc: 'Defensive Win Shares',                                                   hi: adv.DWS >= 3 },
                        { label: 'DBPM',  value: fpm(adv.DBPM),  desc: 'Defensive Box Plus/Minus — defensive contribution vs avg',               hi: adv.DBPM >= 1, lo: adv.DBPM < -2 },
                      ],
                    },
                    {
                      title: 'Usage & Rates',
                      color: 'violet',
                      desc: 'How the player is used and their involvement rates while on the floor',
                      stats: [
                        { label: 'USG%',  value: f3(adv.USGpct/100),  desc: '% of team possessions used (FGA + 0.44*FTA + TOV) while on floor', hi: adv.USGpct >= 28, lo: adv.USGpct < 10 },
                        { label: 'TOV%',  value: f3(adv.TOVpct/100),  desc: 'Turnover % — TOV per 100 possession attempts',                      lo: adv.TOVpct > 18 },
                        { label: 'AST%',  value: f3(adv.ASTpct/100),  desc: '% of teammate FGMs assisted while on floor',                        hi: adv.ASTpct >= 30 },
                        { label: 'ORB%',  value: f3(adv.ORBpct/100),  desc: '% of available offensive rebounds grabbed while on floor',           hi: adv.ORBpct >= 12 },
                        { label: 'DRB%',  value: f3(adv.DRBpct/100),  desc: '% of available defensive rebounds grabbed while on floor',           hi: adv.DRBpct >= 25 },
                        { label: '+/-',   value: fmtPm(pmPg),          desc: 'Net point differential per game while on floor',                    hi: pmPg >= 3, lo: pmPg <= -3 },
                      ],
                    },
                  ];

                  const colorMap: Record<string, { border: string; header: string; badge: string; badgeHi: string; badgeLo: string }> = {
                    amber:  { border: 'border-amber-500/20',  header: 'text-amber-400',  badge: 'bg-slate-800 text-slate-300',      badgeHi: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',     badgeLo: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' },
                    orange: { border: 'border-orange-500/20', header: 'text-orange-400', badge: 'bg-slate-800 text-slate-300',      badgeHi: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',   badgeLo: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' },
                    sky:    { border: 'border-sky-500/20',    header: 'text-sky-400',    badge: 'bg-slate-800 text-slate-300',      badgeHi: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',             badgeLo: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' },
                    violet: { border: 'border-violet-500/20', header: 'text-violet-400', badge: 'bg-slate-800 text-slate-300',      badgeHi: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',   badgeLo: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' },
                  };

                  return (
                    <div className="space-y-5 animate-in fade-in duration-300">
                      {groups.map(grp => {
                        const c = colorMap[grp.color];
                        return (
                          <div key={grp.title} className={`bg-slate-950/50 border ${c.border} rounded-3xl overflow-hidden`}>
                            <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
                              <div>
                                <h4 className={`text-[10px] font-black uppercase tracking-[0.3em] ${c.header}`}>{grp.title}</h4>
                                <p className="text-[9px] text-slate-600 mt-0.5">{grp.desc}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-slate-800/40">
                              {grp.stats.map(st => {
                                const badgeCls = st.hi ? c.badgeHi : st.lo ? c.badgeLo : c.badge;
                                return (
                                  <div key={st.label} className="p-4 group relative">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-0.5 leading-tight">{st.label}</div>
                                      <div className={`text-sm font-display font-bold tabular-nums px-2 py-0.5 rounded-lg ${badgeCls}`}>{st.value}</div>
                                    </div>
                                    {/* Hover tooltip */}
                                    <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover:block w-48 bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-2xl pointer-events-none">
                                      <p className="text-[9px] text-slate-400 leading-relaxed">{st.desc}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {/* ── Shot Distribution ──────────────────────────────────── */}
                      {s.fga > 0 && (() => {
                        const pos = player.position;
                        // Restricted-area share of all 2-point attempts
                        const raShare     = pos === 'C' ? 0.75 : pos === 'PF' ? 0.60 : pos === 'SF' ? 0.45 : pos === 'SG' ? 0.38 : 0.35;
                        // Corner-3 share of all 3-point attempts
                        const corner3Share = pos === 'C' ? 0.10 : pos === 'PF' ? 0.15 : pos === 'SF' ? 0.22 : pos === 'SG' ? 0.25 : 0.20;

                        const twoPA  = s.fga - s.threepa;
                        const raAtt  = Math.round(twoPA * raShare);
                        const midAtt = twoPA - raAtt;
                        const c3Att  = Math.round(s.threepa * corner3Share);
                        const ab3Att = s.threepa - c3Att;

                        const zones = [
                          { label: 'Restricted Area', att: raAtt,  fgPct: 64.5, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
                          { label: 'Mid-Range',        att: midAtt, fgPct: 41.0, color: 'bg-amber-500',   textColor: 'text-amber-400' },
                          { label: 'Corner 3',         att: c3Att,  fgPct: 38.8, color: 'bg-sky-500',     textColor: 'text-sky-400' },
                          { label: 'Above-Break 3',    att: ab3Att, fgPct: 34.7, color: 'bg-violet-500',  textColor: 'text-violet-400' },
                        ];

                        return (
                          <div className="bg-slate-950/50 border border-slate-800/50 rounded-3xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-800/60">
                              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Estimated Shot Distribution</h4>
                              <p className="text-[9px] text-slate-600 mt-0.5">Zone splits estimated from position profile · {s.fga} FGA this season</p>
                            </div>
                            <div className="p-5 space-y-3.5">
                              {zones.map(z => {
                                const freqPct = s.fga > 0 ? (z.att / s.fga) * 100 : 0;
                                return (
                                  <div key={z.label}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{z.label}</span>
                                      <div className="flex items-center gap-2.5">
                                        <span className={`text-[10px] font-bold tabular-nums ${z.textColor}`}>
                                          {freqPct.toFixed(1)}% of FGA
                                        </span>
                                        <span className="text-[9px] text-slate-700">·</span>
                                        <span className="text-[10px] font-bold tabular-nums text-slate-500">
                                          ~{z.fgPct.toFixed(0)}% FG
                                        </span>
                                      </div>
                                    </div>
                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${z.color} rounded-full opacity-70`}
                                        style={{ width: `${Math.min(100, freqPct).toFixed(1)}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      <p className="text-[9px] text-slate-700 text-center italic">
                        Estimates use season-to-date stats. Some metrics require league context and may vary from traditional calculations.
                      </p>
                    </div>
                  );
                })()}

                {/* ── Career stats by season ──────────────────────────────────── */}
                {statsTab === 'career' && hasCareer && (() => {
                  // Group career stats by year, detect split seasons
                  const byYear = new Map<number, typeof player.careerStats>();
                  for (const cs of player.careerStats) {
                    if (!byYear.has(cs.year)) byYear.set(cs.year, []);
                    byYear.get(cs.year)!.push(cs);
                  }
                  const sortedYears = [...byYear.keys()].sort((a, b) => b - a);

                  const careerRows: React.ReactNode[] = [];
                  sortedYears.forEach((year, yi) => {
                    const entries = byYear.get(year)!;
                    const isMostRecent = yi === 0;
                    const isMultiTeam = entries.length > 1;

                    // Helper to render one stat row
                    const renderRow = (cs: typeof entries[0], label: string, abbr: string, highlight: boolean, dimmed: boolean) => {
                      const cgp = Math.max(1, cs.gamesPlayed);
                      return (
                        <tr key={`${cs.year}-${cs.teamId}-${abbr}`} className={highlight ? 'bg-amber-500/5' : dimmed ? 'opacity-60 hover:opacity-100 hover:bg-slate-800/20 transition-all' : 'hover:bg-slate-800/20 transition-colors'}>
                          <td className={`px-3 py-3 text-[11px] font-black tabular-nums whitespace-nowrap ${highlight ? 'text-amber-400' : 'text-slate-400'}`}>
                            {label}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${highlight ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400' : 'bg-slate-800 border border-slate-700 text-slate-400'}`}>
                              {abbr}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{cs.gamesPlayed}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{cs.gamesStarted}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.minutes / cgp)}</td>
                          <td className={`px-3 py-3 font-display font-bold tabular-nums text-sm ${cs.points / cgp >= 20 ? 'text-amber-400' : 'text-slate-200'}`}>{fmt1(cs.points / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-200 tabular-nums text-sm">{fmt1(cs.rebounds / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.offReb / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.defReb / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-200 tabular-nums text-sm">{fmt1(cs.assists / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.steals / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.blocks / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.pf / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.fgm / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.fga / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{cs.fga > 0 ? fmtPct(cs.fgm / cs.fga) : '—'}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.threepm / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.threepa / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{cs.threepa > 0 ? fmtPct(cs.threepm / cs.threepa) : '—'}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1((cs.fgm - cs.threepm) / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1((cs.fga - cs.threepa) / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{(cs.fga - cs.threepa) > 0 ? fmtPct((cs.fgm - cs.threepm) / (cs.fga - cs.threepa)) : '—'}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.ftm / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{fmt1(cs.fta / cgp)}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{cs.fta > 0 ? fmtPct(cs.ftm / cs.fta) : '—'}</td>
                          <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{cs.fga > 0 ? fmtPct((cs.fgm + 0.5 * cs.threepm) / cs.fga) : '—'}</td>
                        </tr>
                      );
                    };

                    if (isMultiTeam) {
                      // TOT aggregate row
                      const tot = entries.reduce((acc, cs) => ({
                        gamesPlayed: acc.gamesPlayed + cs.gamesPlayed,
                        gamesStarted: acc.gamesStarted + cs.gamesStarted,
                        minutes: acc.minutes + cs.minutes,
                        points: acc.points + cs.points,
                        rebounds: acc.rebounds + cs.rebounds,
                        offReb: acc.offReb + cs.offReb,
                        defReb: acc.defReb + cs.defReb,
                        assists: acc.assists + cs.assists,
                        steals: acc.steals + cs.steals,
                        blocks: acc.blocks + cs.blocks,
                        tov: acc.tov + cs.tov,
                        pf: acc.pf + cs.pf,
                        fgm: acc.fgm + cs.fgm, fga: acc.fga + cs.fga,
                        threepm: acc.threepm + cs.threepm, threepa: acc.threepa + cs.threepa,
                        ftm: acc.ftm + cs.ftm, fta: acc.fta + cs.fta,
                        plusMinus: acc.plusMinus + cs.plusMinus,
                        techs: 0, flagrants: 0, ejections: 0,
                        year, teamId: 'TOT', teamName: 'TOT',
                        teamAbbreviation: 'TOT', isSplit: false,
                      }), { gamesPlayed:0, gamesStarted:0, minutes:0, points:0, rebounds:0, offReb:0, defReb:0, assists:0, steals:0, blocks:0, tov:0, pf:0, fgm:0, fga:0, threepm:0, threepa:0, ftm:0, fta:0, plusMinus:0, techs:0, flagrants:0, ejections:0, year, teamId:'TOT', teamName:'TOT', teamAbbreviation:'TOT', isSplit:false });
                      // TOT row first
                      careerRows.push(renderRow(tot as typeof entries[0], `${year}–${String(year+1).slice(2)}`, 'TOT', isMostRecent, false));
                      // Then individual split rows
                      entries.forEach(cs => {
                        const abbr = cs.teamAbbreviation ?? cs.teamName.slice(0, 3).toUpperCase();
                        careerRows.push(renderRow(cs, '', abbr, false, true));
                      });
                    } else {
                      const cs = entries[0];
                      const abbr = cs.teamAbbreviation ?? cs.teamName.slice(0, 3).toUpperCase();
                      careerRows.push(renderRow(cs, `${year}–${String(year+1).slice(2)}`, abbr, isMostRecent, false));
                    }
                  });

                  return (
                    <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-center">
                          <thead>
                            <tr className="border-b border-slate-800">
                              {['Season', 'Team', 'GP', 'GS', 'MIN', 'PTS', 'REB', 'ORB', 'DRB', 'AST', 'STL', 'BLK', 'PF', 'FGM', 'FGA', 'FG%', '3PM', '3PA', '3P%', '2PM', '2PA', '2P%', 'FTM', 'FTA', 'FT%', 'eFG%'].map(h => (
                                <th key={h} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {careerRows}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* ── HOF Probability ─────────────────────────────────────────── */}
                {(() => {
                  if (isHofMember) {
                    return (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                        <span className="text-xl leading-none">🏛️</span>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Hall of Fame</p>
                          <p className="text-xs font-bold text-amber-300">
                            Inducted {hofYearInducted ? `in ${hofYearInducted}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  if (player.careerStats.length >= 2) {
                    const prob = player.hofProbability ?? computeHofProbability(player, awardHistory);
                    const color = prob >= 70 ? 'text-emerald-400' : prob >= 40 ? 'text-amber-400' : 'text-rose-400';
                    const bg = prob >= 70
                      ? 'bg-emerald-500/8 border-emerald-500/20'
                      : prob >= 40
                      ? 'bg-amber-500/8 border-amber-500/20'
                      : 'bg-rose-500/8 border-rose-500/20';
                    return (
                      <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${bg}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">🏛️</span>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">HOF Probability</p>
                        </div>
                        <p className={`text-lg font-display font-black ${color}`}>{prob}%</p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* ── Career Game Highs ───────────────────────────────────────── */}
                {hasHighs && (() => {
                  const ch = player.careerHighs;
                  const chCol = (v: number) =>
                    v >= 50 ? 'text-amber-300 font-black' :
                    v >= 40 ? 'text-amber-400 font-black' :
                    v >= 30 ? 'text-orange-400 font-bold' :
                    v >= 20 ? 'text-slate-200 font-bold' : 'text-amber-500/80';
                  const chBg = (v: number) =>
                    v >= 40 ? 'bg-amber-500/15 border-amber-500/30' :
                    v >= 25 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-slate-900 border-slate-800';
                  // Season high comparison: show delta if season high > career high (shouldn't happen, but shows freshness)
                  const sh = seasonHighs;
                  const delta = (career: number, season: number | undefined) =>
                    season !== undefined && season > 0 && season === career
                      ? <span className="ml-1 text-[8px] text-emerald-400 font-black">★</span>
                      : null;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Career Game Highs</p>
                        {sh && sh.pts > 0 && (
                          <span className="text-[8px] font-black text-emerald-400/60 uppercase tracking-widest">★ = this season's high</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {([
                          { label: 'PTS', career: ch.points,   season: sh?.pts },
                          { label: 'REB', career: ch.rebounds, season: sh?.reb },
                          { label: 'AST', career: ch.assists,  season: sh?.ast },
                          { label: 'STL', career: ch.steals,   season: sh?.stl },
                          { label: 'BLK', career: ch.blocks,   season: sh?.blk },
                          { label: '3PM', career: ch.threepm,  season: sh?.threepm },
                        ]).map(h => (
                          <div key={h.label} className={`border rounded-2xl p-3 text-center ${chBg(h.career)}`}>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">{h.label}</div>
                            <div className={`font-display font-bold text-xl tabular-nums mt-0.5 ${chCol(h.career)}`}>
                              {h.career || '—'}{delta(h.career, h.season)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Career awards & honours ─────────────────────────────────── */}
                {(careerAwards.length > 0 || (player.allStarSelections?.length ?? 0) > 0 || (player.championYears?.length ?? 0) > 0) && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Honours & Awards</p>
                    <div className="flex flex-wrap gap-2">
                      {/* Championship rings — shown as a distinct gold banner */}
                      {(player.championYears?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/15 border border-amber-400/40 rounded-2xl">
                          <span className="text-base leading-none">🏆</span>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-amber-400/80">Champion</div>
                            <div className="text-xs font-bold text-amber-300">
                              {player.championYears!.length === 1
                                ? `${player.championYears![0]}`
                                : `${player.championYears!.length}× (${player.championYears!.slice().sort((a,b)=>a-b).join(', ')})`}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* All-Star selections bubble */}
                      {(player.allStarSelections?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-2xl">
                          <span className="text-base leading-none">⭐</span>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-amber-500/70">All-Star</div>
                            <div className="text-xs font-bold text-amber-400">
                              {player.allStarSelections!.length}× ({player.allStarSelections!.slice().sort((a,b)=>a-b).join(', ')})
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Individual award badges */}
                      {careerAwards.map((award, i) => (
                        <div key={`${award.label}-${award.year}-${i}`} className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-2xl hover:border-amber-500/30 transition-colors">
                          <span className="text-base leading-none">{award.icon}</span>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{award.year}</div>
                            <div className="text-xs font-bold text-slate-200">{award.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })()}

          {/* ── Last 5 Games ────────────────────────────────────────────────── */}
          {last5Games.length > 0 && (() => {
            const f1  = (v: number) => v.toFixed(1);
            const fPct = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(0)}%`;
            const ptColor = (pts: number) =>
              pts >= 30 ? 'text-amber-300 font-black' :
              pts >= 20 ? 'text-amber-400 font-bold' :
              pts <= 4  ? 'text-rose-500' :
              pts <= 9  ? 'text-rose-400' : 'text-slate-200';
            const pmColor = (pm: number) =>
              pm > 10 ? 'text-emerald-400' : pm < -10 ? 'text-rose-400' : 'text-slate-400';
            return (
              <section className="space-y-3">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Last 5 Games</h3>
                <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-center text-xs">
                      <thead>
                        <tr className="border-b border-slate-800">
                          {['OPP','PTS','REB','AST','STL','BLK','FG%','3P%','MIN','+/−'].map(h => (
                            <th key={h} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {last5Games.map((g, i) => {
                          const fgPct = g.fga > 0 ? g.fgm / g.fga : null;
                          const tpPct = g.threepa > 0 ? g.threepm / g.threepa : null;
                          const isHot  = g.pts >= 25 || (g.pts >= 20 && g.ast >= 5);
                          const isCold = g.pts <= 5 && g.reb <= 3 && g.ast <= 1;
                          return (
                            <tr
                              key={i}
                              className={`transition-colors ${
                                isHot  ? 'bg-amber-500/5 hover:bg-amber-500/10' :
                                isCold ? 'bg-rose-500/5 hover:bg-rose-500/10' :
                                'hover:bg-slate-800/20'
                              }`}
                            >
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-[10px] font-black uppercase text-slate-400">
                                    {g.opponentTeamName ?? '—'}
                                  </span>
                                  {g.date != null && (
                                    <span className="text-[9px] text-slate-600">Day {g.date}</span>
                                  )}
                                </div>
                              </td>
                              <td className={`px-3 py-3 font-display font-bold tabular-nums text-sm ${ptColor(g.pts)}`}>{g.pts}</td>
                              <td className="px-3 py-3 font-display font-bold text-slate-200 tabular-nums text-sm">{g.reb}</td>
                              <td className="px-3 py-3 font-display font-bold text-slate-300 tabular-nums text-sm">{g.ast}</td>
                              <td className="px-3 py-3 font-display font-bold text-slate-400 tabular-nums text-sm">{g.stl}</td>
                              <td className="px-3 py-3 font-display font-bold text-slate-400 tabular-nums text-sm">{g.blk}</td>
                              <td className="px-3 py-3 font-display font-bold text-slate-400 tabular-nums text-sm">{fPct(fgPct)}</td>
                              <td className="px-3 py-3 font-display font-bold text-slate-400 tabular-nums text-sm">{fPct(tpPct)}</td>
                              <td className="px-3 py-3 font-display font-bold text-slate-500 tabular-nums text-sm">{f1(g.min)}</td>
                              <td className={`px-3 py-3 font-display font-bold tabular-nums text-sm ${pmColor(g.plusMinus)}`}>
                                {g.plusMinus > 0 ? `+${g.plusMinus}` : g.plusMinus}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 border-t border-slate-800/60 flex gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-[9px] text-amber-500/70 font-bold uppercase">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500/40" /> Hot game
                    </span>
                    <span className="flex items-center gap-1.5 text-[9px] text-rose-500/70 font-bold uppercase">
                      <span className="inline-block w-2 h-2 rounded-full bg-rose-500/40" /> Cold game
                    </span>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ── Stats vs Teams ───────────────────────────────────────────────── */}
          {uniqueOpponents.length > 0 && (() => {
            const f1  = (v: number) => v.toFixed(1);
            const fPct = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(0)}%`;
            const pmColor = (pm: number) =>
              pm > 5 ? 'text-emerald-400' : pm < -5 ? 'text-rose-400' : 'text-slate-300';
            const stats = vsTeamStats;
            return (
              <section className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Matchup Stats</h3>
                  <select
                    value={vsTeamId}
                    onChange={e => setVsTeamId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500/60 min-w-[140px]"
                  >
                    <option value="all">All Opponents</option>
                    {uniqueOpponents.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                {stats ? (
                  <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
                    {/* GP badge */}
                    <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {vsTeamId === 'all'
                          ? `All opponents · ${stats.gp} game${stats.gp !== 1 ? 's' : ''}`
                          : `vs ${uniqueOpponents.find(t => t.id === vsTeamId)?.name} · ${stats.gp} game${stats.gp !== 1 ? 's' : ''}`}
                      </span>
                      <span className={`text-sm font-display font-black ${pmColor(stats.pm)}`}>
                        {stats.pm > 0 ? `+${f1(stats.pm)}` : f1(stats.pm)} avg +/−
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-center text-xs">
                        <thead>
                          <tr className="border-b border-slate-800">
                            {['PPG','RPG','APG','SPG','BPG','FG%','3P%','FT%'].map(h => (
                              <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className={`px-4 py-4 font-display font-black tabular-nums text-lg ${stats.ppg >= 20 ? 'text-amber-400' : 'text-slate-200'}`}>{f1(stats.ppg)}</td>
                            <td className="px-4 py-4 font-display font-bold tabular-nums text-sm text-slate-200">{f1(stats.rpg)}</td>
                            <td className="px-4 py-4 font-display font-bold tabular-nums text-sm text-slate-200">{f1(stats.apg)}</td>
                            <td className="px-4 py-4 font-display font-bold tabular-nums text-sm text-slate-300">{f1(stats.spg)}</td>
                            <td className="px-4 py-4 font-display font-bold tabular-nums text-sm text-slate-300">{f1(stats.bpg)}</td>
                            <td className={`px-4 py-4 font-display font-bold tabular-nums text-sm ${stats.fgPct != null && stats.fgPct >= 0.5 ? 'text-emerald-400' : stats.fgPct != null && stats.fgPct < 0.4 ? 'text-rose-400' : 'text-slate-300'}`}>{fPct(stats.fgPct)}</td>
                            <td className={`px-4 py-4 font-display font-bold tabular-nums text-sm ${stats.threePct != null && stats.threePct >= 0.38 ? 'text-emerald-400' : 'text-slate-300'}`}>{fPct(stats.threePct)}</td>
                            <td className="px-4 py-4 font-display font-bold tabular-nums text-sm text-slate-300">{fPct(stats.ftPct)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-8 text-center">
                    <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">No games logged vs this team</p>
                  </div>
                )}
              </section>
            );
          })()}

          {/* ── Morale & Mindset ────────────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Morale &amp; Mindset</h3>
            {(() => {
              const morale = player.morale ?? 75;
              const traits = player.personalityTraits ?? [];
              const streak       = leagueContext?.teamStreak ?? 0;
              const wins         = leagueContext?.teamWins ?? 0;
              const losses       = leagueContext?.teamLosses ?? 0;
              const mpg          = player.stats.gamesPlayed > 0 ? player.stats.minutes / player.stats.gamesPlayed : 0;
              const facBudget    = leagueContext?.facilitiesBudget;

              const moraleColor = morale < 50 ? '#ef4444' : morale < 65 ? '#f43f5e' : morale < 80 ? '#f59e0b' : '#22c55e';
              const moraleLabel = morale < 50 ? 'Critical' : morale < 65 ? 'Low' : morale < 80 ? 'Moderate' : 'Good';

              // Build factors list
              type FactorEntry = { label: string; impact: 'positive' | 'negative' | 'neutral' };
              const factors: FactorEntry[] = [];

              // Streak / record
              if (streak >= 4) factors.push({ label: `Win streak (${streak})`, impact: 'positive' });
              else if (streak >= 2) factors.push({ label: `Winning recently`, impact: 'positive' });
              else if (streak <= -4) factors.push({ label: `Losing streak (${Math.abs(streak)})`, impact: 'negative' });
              else if (streak <= -2) factors.push({ label: `Losing recently`, impact: 'negative' });
              if (wins > 0 || losses > 0) {
                const winPct = wins / (wins + losses);
                if (winPct >= 0.6) factors.push({ label: 'Team winning overall', impact: 'positive' });
                else if (winPct < 0.35) factors.push({ label: 'Team struggling this season', impact: 'negative' });
              }

              // Playing time
              const prefMin = player.status === 'Starter' ? 28 : player.status === 'Rotation' ? 18 : 10;
              if (mpg > 0) {
                if (mpg < prefMin - 10) factors.push({ label: 'Far below preferred minutes', impact: 'negative' });
                else if (mpg < prefMin - 5) factors.push({ label: 'Below preferred minutes', impact: 'negative' });
                else if (mpg >= prefMin) factors.push({ label: 'Playing expected minutes', impact: 'positive' });
              }
              if (player.status === 'Bench' && traits.includes('Diva/Star')) {
                factors.push({ label: 'Bench role (Diva/Star)', impact: 'negative' });
              }

              // Personality-driven factors
              if (traits.includes('Gym Rat'))             factors.push({ label: 'Gym Rat mentality (+)', impact: 'positive' });
              if (traits.includes('Professional'))        factors.push({ label: 'Professional mindset (+)', impact: 'positive' });
              if (traits.includes('Leader'))              factors.push({ label: 'Leader — feels team results personally', impact: streak >= 0 ? 'positive' : 'negative' });
              if (traits.includes('Loyal') && streak >= 0) factors.push({ label: 'Loyal — team-first attitude', impact: 'positive' });
              if (traits.includes('Workhorse') && mpg >= 28) factors.push({ label: 'Workhorse — loves heavy minutes', impact: 'positive' });
              if (traits.includes('Money Hungry'))        factors.push({ label: 'Money Hungry — always wants more', impact: 'negative' });
              if (traits.includes('Hot Head') && streak < 0) factors.push({ label: 'Hot Head — losing affects mood', impact: 'negative' });
              if (traits.includes('Friendly/Team First')) factors.push({ label: 'Team First — positive chemistry', impact: 'positive' });
              if (traits.includes('Lazy'))                factors.push({ label: 'Lazy — effort drops in losses', impact: 'negative' });

              // Injury
              if (player.status === 'Injured' && (player.injuryDaysLeft ?? 0) >= 14) {
                factors.push({ label: `Long-term injury (${player.injuryDaysLeft}d out)`, impact: 'negative' });
              }

              // Trade block
              if (player.onTradeBlock) factors.push({ label: 'On trade block — unhappy', impact: 'negative' });

              // Facilities impact
              if (facBudget !== undefined) {
                if (facBudget < 40) {
                  const base = -((40 - facBudget) / 20) * 10;
                  const negMult = traits.includes('Diva/Star')    ? 2.0
                    : traits.includes('Money Hungry')             ? 1.5
                    : traits.includes('Hot Head')                 ? 1.3
                    : traits.includes('Workhorse')                ? 0.8
                    : traits.includes('Gym Rat')                  ? 0.6
                    : traits.includes('Professional')             ? 0.9 : 1.0;
                  const weeklyHit = Math.round(base * negMult);
                  factors.push({ label: `Poor Facilities (${weeklyHit} morale/wk)`, impact: 'negative' });
                } else if (facBudget >= 80) {
                  factors.push({ label: 'Elite Facilities (+morale)', impact: 'positive' });
                } else if (facBudget >= 60) {
                  factors.push({ label: 'Good Facilities (+morale)', impact: 'positive' });
                }
              }

              return (
                <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6 space-y-5">
                  {/* Bar */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: moraleColor }}>{moraleLabel} Morale</span>
                        <span className="text-2xl font-display font-black tabular-nums" style={{ color: moraleColor }}>{Math.round(morale)}%</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${morale}%`, backgroundColor: moraleColor }} />
                      </div>
                      <div className="flex justify-between text-[8px] font-black text-slate-700 uppercase tracking-widest">
                        <span>Critical</span><span>Low</span><span>Moderate</span><span>Good</span>
                      </div>
                    </div>
                  </div>

                  {/* Factors */}
                  {factors.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Contributing Factors</p>
                      <div className="flex flex-wrap gap-1.5">
                        {factors.map((f, i) => (
                          <span
                            key={i}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                              f.impact === 'positive'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : f.impact === 'negative'
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            {f.impact === 'positive' ? '▲' : f.impact === 'negative' ? '▼' : '—'} {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sim impact note */}
                  <p className="text-[9px] text-slate-600 leading-relaxed">
                    {morale < 50
                      ? 'Critical morale reduces shooting efficiency, increases turnovers, and lowers defensive effort.'
                      : morale < 65
                      ? 'Low morale causes small but consistent penalties to shooting and effort stats.'
                      : morale >= 85
                      ? 'High morale provides a shooting and defensive effort bonus in simulation.'
                      : 'Morale is stable — no significant sim impact.'}
                  </p>
                </div>
              );
            })()}
          </section>

          <section className="space-y-5">
             <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Scouting Intelligence</h3>
                <button
                   onClick={() => onScout(player)}
                   className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-full transition-all"
                >
                   {scoutingReport?.playerId === player.id ? '↺ Regenerate Intelligence' : 'Generate Intelligence'}
                </button>
             </div>
             <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-8 min-h-[160px]">
                {scoutingReport?.playerId === player.id ? (() => {
                   const lines = scoutingReport.report.split('\n');
                   const header = lines[0];
                   const bullets = lines.filter(l => l.startsWith('•'));
                   return (
                      <div className="space-y-4 animate-in slide-in-from-bottom-2">
                         <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em]">{header}</p>
                         <ul className="space-y-3">
                            {bullets.map((b, i) => (
                               <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                                  <span className="text-amber-500 font-black mt-0.5 shrink-0">•</span>
                                  <span>{b.replace(/^•\s*/, '')}</span>
                               </li>
                            ))}
                         </ul>
                      </div>
                   );
                })() : (
                   <div className="text-center py-10 opacity-30 italic">
                      <p className="font-display text-2xl uppercase tracking-widest">Awaiting Analysis</p>
                      <p className="text-[10px] uppercase tracking-widest mt-2">Click Generate Intelligence to run scout report</p>
                   </div>
                )}
             </div>
          </section>
        </div>

        {isUserTeam && (
           <div className="p-4 md:p-10 bg-slate-950/80 border-t border-slate-800 flex flex-col md:flex-row md:flex-wrap md:justify-between items-stretch md:items-center gap-3 md:gap-6">
              <div className="flex flex-wrap items-center gap-3 md:gap-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Roster Status</label>
                    <select
                       value={player.status}
                       onChange={(e) => onUpdateStatus(player.id, e.target.value as PlayerStatus)}
                       className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none"
                    >
                       <option value="Starter">Starter</option>
                       <option value="Rotation">Rotation</option>
                       <option value="Bench">Bench</option>
                       <option value="Injured">Injured</option>
                    </select>
                 </div>
                 {onSetTrainingFocus && (
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                       Dev Focus <span className="text-slate-600">({devInterventionsUsed}/{devInterventionsMax} used)</span>
                     </label>
                     <button
                       onClick={() => { setFocusDraft(player.trainingFocus?.areas ?? []); setFocusDuration(60); setShowFocusPanel(true); }}
                       disabled={devInterventionsUsed >= devInterventionsMax && !player.trainingFocus}
                       className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all ${
                         player.trainingFocus && player.trainingFocus.daysRemaining > 0
                           ? 'bg-sky-500/10 border-sky-500/40 text-sky-300 hover:bg-sky-500/20'
                           : devInterventionsUsed >= devInterventionsMax
                           ? 'bg-slate-800/30 border-slate-700/30 text-slate-600 cursor-not-allowed'
                           : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-amber-500/50 hover:text-amber-400'
                       }`}
                     >
                       <span>🎯</span>
                       {player.trainingFocus && player.trainingFocus.daysRemaining > 0 ? 'Edit Focus' : 'Set Training Focus'}
                     </button>
                   </div>
                 )}
              </div>
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4">
                {onExtend && !draftLocked && (isOffseason || player.contractYears <= 1) && (
                  <button
                    onClick={() => { setExtendSalary(player.salary || (isWomensLeague ? 75_000 : 5_000_000)); setExtendYears(2); setShowExtendPanel(true); }}
                    className="px-6 py-4 md:px-10 md:py-5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 font-display font-bold uppercase rounded-2xl transition-all text-center"
                  >
                    Extend Contract
                  </button>
                )}
                {draftLocked ? (
                  <div className="flex flex-col items-stretch md:items-end gap-1">
                    <button
                      disabled
                      className="px-6 py-4 md:px-10 md:py-5 bg-slate-800/50 text-slate-600 border border-slate-700/50 font-display font-bold uppercase rounded-2xl cursor-not-allowed opacity-60"
                      title="Roster moves are locked during the draft"
                    >
                      Waive Player
                    </button>
                    <span className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest text-center">
                      🔒 Locked · Draft in Progress
                    </span>
                  </div>
                ) : (
                  <button
                     onClick={() => onRelease(player.id)}
                     className="px-6 py-4 md:px-10 md:py-5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 font-display font-bold uppercase rounded-2xl transition-all"
                  >
                     Waive Player
                  </button>
                )}
              </div>
              {player.isSuspended && (player.suspensionGames ?? 0) > 0 && !player.suspensionAppealed && onAppealSuspension && (
                <button
                  onClick={() => onAppealSuspension(player.id)}
                  className="px-6 py-4 md:px-10 md:py-5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30 font-display font-bold uppercase rounded-2xl transition-all flex items-center justify-center gap-2"
                  title="25% chance to reduce suspension by 1 game. Costs 3 Owner Patience. One appeal per suspension."
                >
                  ⚖️ Appeal Suspension
                </button>
              )}
              {player.isSuspended && player.suspensionAppealed && (
                <span className="px-6 py-3 text-xs font-bold uppercase text-slate-500 border border-slate-700/50 rounded-2xl tracking-widest text-center">
                  Appeal Filed
                </span>
              )}
           </div>
        )}

        {/* ── Contract Extension Panel ─────────────────────────────────────────── */}
        {showExtendPanel && (
          <div className="absolute inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm rounded-[3rem] flex flex-col p-10 overflow-y-auto animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-display font-bold uppercase text-white tracking-tight">Extend Contract</h2>
                <p className="text-xs text-slate-500 mt-1">{player.name} · Current: {player.contractYears} yr{player.contractYears !== 1 ? 's' : ''} @ {fmtSalary(player.salary)}/yr</p>
              </div>
              <button onClick={() => setShowExtendPanel(false)} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {player.desiredContract && (
              <div className="mb-6 p-5 bg-slate-900 border border-slate-700 rounded-2xl flex items-center gap-4">
                <span className="text-2xl">🤝</span>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Player Asking Price</p>
                  <p className="text-white font-bold">{player.desiredContract.years} yr{player.desiredContract.years !== 1 ? 's' : ''} · {fmtSalary(player.desiredContract.salary)}/yr</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Contract Length</label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5].map(y => (
                    <button
                      key={y}
                      onClick={() => setExtendYears(y)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all ${extendYears === y ? 'bg-amber-500 border-amber-500 text-slate-950' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-amber-500/50'}`}
                    >
                      {y} Yr{y > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  Annual Salary
                  {maxExtensionSalary && <span className="ml-2 text-emerald-600 normal-case font-bold">max {fmtSalary(maxExtensionSalary)}</span>}
                </label>
                <input
                  type="number"
                  min={isWomensLeague ? 25_000 : 1_000_000}
                  step={isWomensLeague ? 5_000 : 100_000}
                  value={extendSalary}
                  onChange={e => setExtendSalary(Math.max(0, parseInt(e.target.value) || 0))}
                  className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50 ${maxExtensionSalary && extendSalary > maxExtensionSalary ? 'border-rose-500/50' : 'border-slate-700'}`}
                />
                {maxExtensionSalary && extendSalary > maxExtensionSalary && (
                  <p className="text-rose-400 text-xs font-bold">Exceeds max player salary</p>
                )}
                <p className="text-xs text-slate-500">{fmtSalary(extendSalary)}/yr · {extendYears} yr total: {fmtSalary(extendSalary * extendYears)}</p>
              </div>
            </div>

            <div className="flex gap-4 mt-auto">
              <button
                onClick={() => setShowExtendPanel(false)}
                className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold uppercase rounded-2xl transition-all"
              >
                Cancel
              </button>
              <button
                disabled={!!(maxExtensionSalary && extendSalary > maxExtensionSalary)}
                onClick={() => { if (onExtend) { onExtend(player.id, extendYears, extendSalary); setShowExtendPanel(false); } }}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-display font-bold uppercase rounded-2xl transition-all shadow-lg shadow-emerald-900/30"
              >
                Confirm Extension
              </button>
            </div>
          </div>
        )}

        {/* ── Training Focus Panel ─────────────────────────────────────────────── */}
        {showFocusPanel && (
          <div className="absolute inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm rounded-[3rem] flex flex-col p-10 overflow-y-auto animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-display font-bold uppercase text-white tracking-tight">Discuss Development</h2>
                <p className="text-xs text-slate-500 mt-1">{player.name} · {devInterventionsUsed}/{devInterventionsMax} interventions used this season</p>
              </div>
              <button onClick={() => setShowFocusPanel(false)} className="text-slate-500 hover:text-white text-2xl p-2 transition-colors">✕</button>
            </div>

            {/* Current focus (if any) */}
            {player.trainingFocus && player.trainingFocus.daysRemaining > 0 && (
              <div className="mb-6 p-4 bg-sky-500/10 border border-sky-500/30 rounded-2xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-400/70 mb-1">Current Focus Active</p>
                <p className="text-sm font-bold text-sky-300">{player.trainingFocus.areas.join(' + ')} — {player.trainingFocus.daysRemaining} days remaining</p>
              </div>
            )}

            {/* Player reaction preview */}
            {(() => { const r = previewResponse(); return (
              <div className="mb-6 p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Player Attitude</p>
                  <p className={`text-sm font-bold ${r.color}`}>{r.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Morale</p>
                  <p className={`text-sm font-bold ${player.morale >= 70 ? 'text-emerald-400' : player.morale >= 45 ? 'text-amber-400' : 'text-rose-400'}`}>{player.morale}</p>
                </div>
              </div>
            ); })()}

            {/* Area selection (pick 1 or 2) */}
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Choose 1–2 Focus Areas</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {ALL_FOCUS_AREAS.map(area => {
                const selected = focusDraft.includes(area);
                const disabled = !selected && focusDraft.length >= 2;
                return (
                  <button
                    key={area}
                    onClick={() => !disabled && toggleFocusArea(area)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold text-left transition-all ${
                      selected
                        ? 'bg-sky-500/20 border-sky-500/60 text-sky-200'
                        : disabled
                        ? 'bg-slate-900/40 border-slate-800/40 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <span className="text-base">{FOCUS_ICONS[area]}</span>
                    <span className="text-xs leading-tight">{area}</span>
                    {selected && <span className="ml-auto text-sky-400 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Duration picker */}
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Duration</p>
            <div className="flex gap-2 mb-8">
              {([30, 60, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setFocusDuration(d)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all ${
                    focusDuration === d
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'
                  }`}
                >
                  {d === 30 ? '1 Month' : d === 60 ? '2 Months' : '3 Months'}
                </button>
              ))}
            </div>

            {/* Confirm / Cancel */}
            <div className="flex gap-3 mt-auto">
              <button
                onClick={() => setShowFocusPanel(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm hover:bg-slate-700 transition-all"
              >Cancel</button>
              <button
                disabled={focusDraft.length === 0}
                onClick={() => {
                  if (focusDraft.length === 0 || !onSetTrainingFocus) return;
                  onSetTrainingFocus(player.id, focusDraft, focusDuration);
                  setShowFocusPanel(false);
                }}
                className={`flex-1 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${
                  focusDraft.length > 0
                    ? 'bg-sky-500 text-white hover:bg-sky-400 shadow-lg'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                {player.trainingFocus && player.trainingFocus.daysRemaining > 0 ? 'Update Focus' : 'Set Focus'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerModal;