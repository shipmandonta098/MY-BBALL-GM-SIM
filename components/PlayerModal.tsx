import React, { useState, useEffect } from 'react';
import { Player, PlayerStatus, PersonalityTrait, Position, PlayerTendencies } from '../types';
import { getFlag, POS_ATTR_RANGES, PosAttrRangeKey, enforcePositionalBounds, FEMALE_ATTR_CAPS, NAMES_MALE, NAMES_FEMALE, COLLEGES_HIGH_MAJOR, COLLEGES_MID_MAJOR, ALL_HOMETOWNS, deriveComposites, deriveArchetype } from '../constants';

const POS_RANGE_KEYS: PosAttrRangeKey[] = ['shooting', 'playmaking', 'defense', 'rebounding', 'athleticism'];

interface PlayerModalProps {
  player: Player;
  onClose: () => void;
  onScout: (player: Player) => void;
  scoutingReport: { playerId: string; report: string } | null;
  isUserTeam: boolean;
  onUpdateStatus: (playerId: string, status: PlayerStatus) => void;
  onRelease: (playerId: string) => void;
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
  };
  /** All team names for the draft-team dropdown in god mode */
  teams?: string[];
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

const PlayerModal: React.FC<PlayerModalProps> = ({
  player,
  onClose,
  onScout,
  scoutingReport,
  isUserTeam,
  onUpdateStatus,
  onRelease,
  godMode = false,
  onUpdatePlayer,
  isCurrentAllStar = false,
  currentAllStarRole,
  careerAwards = [],
  currentSeason,
  leagueContext,
  teams = [],
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [statsTab, setStatsTab] = useState<'season' | 'career' | 'advanced'>('season');

  const defaultAttributes = {
    shooting: 50, defense: 50, rebounding: 50, playmaking: 50, athleticism: 50,
    layups: 50, dunks: 50, shootingMid: 50, shooting3pt: 50, freeThrow: 70,
    speed: 60, strength: 55, jumping: 55, stamina: 75,
    perimeterDef: 50, interiorDef: 50, steals: 50, blocks: 50,
    defensiveIQ: 50, ballHandling: 50, passing: 50, offensiveIQ: 50,
    postScoring: 50, offReb: 50, defReb: 50, durability: 65
  };

  const defaultTendencies: PlayerTendencies = {
    offensiveTendencies: {
      pullUpThree: 50, postUp: 50, driveToBasket: 50,
      midRangeJumper: 50, kickOutPasser: 50, isoHeavy: 50, transitionHunter: 50,
      spotUp: 50, cutter: 50, offScreen: 50,
      attackCloseOuts: 50, drawFoul: 50, dribbleHandOff: 50, pullUpOffPnr: 50,
    },
    defensiveTendencies: {
      gambles: 50, helpDefender: 50, physicality: 50, faceUpGuard: 50,
      onBallPest: 50, denyThePass: 50, shotContestDiscipline: 50,
    },
    situationalTendencies: {
      clutchShotTaker: 50,
    },
  };

  const normalizePlayer = (p: Player): Player => ({
    ...p,
    attributes: p.attributes ?? defaultAttributes,
    personalityTraits: p.personalityTraits ?? [],
    tendencies: p.tendencies ?? defaultTendencies,
  });

  const [editedPlayer, setEditedPlayer] = React.useState<Player>(normalizePlayer(player));

  // Split name for editing
  const splitName = (full: string) => {
    const idx = full.indexOf(' ');
    return idx === -1
      ? { first: full, last: '' }
      : { first: full.slice(0, idx), last: full.slice(idx + 1) };
  };
  const [editFirstName, setEditFirstName] = React.useState(() => splitName(player.name).first);
  const [editLastName, setEditLastName]   = React.useState(() => splitName(player.name).last);

  useEffect(() => {
    setEditedPlayer(normalizePlayer(player));
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
  const randomizeHometown  = () => setEditedPlayer(p => ({ ...p, hometown: pick(ALL_HOMETOWNS) }));

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

  const handleContractChange = (key: 'salary' | 'contractYears', val: number) => {
    setEditedPlayer(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleTendencyChange = (
    side: 'offensiveTendencies' | 'defensiveTendencies' | 'situationalTendencies',
    key: string,
    val: number,
  ) => {
    setEditedPlayer(prev => ({
      ...prev,
      tendencies: {
        ...(prev.tendencies ?? defaultTendencies),
        [side]: { ...(prev.tendencies ?? defaultTendencies)[side as keyof PlayerTendencies] as object, [key]: val },
      },
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
        className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
        onClick={onClose}
      >
        <div 
          className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-7xl h-full max-h-[92vh] overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)] relative"
          onClick={e => e.stopPropagation()}
        >
          <header className="p-8 border-b border-slate-800 flex justify-between items-center shrink-0">
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
                        value={editedPlayer.age}
                        onChange={e => {
                          const raw = parseInt(e.target.value);
                          if (isNaN(raw)) return;
                          const updated: typeof editedPlayer = { ...editedPlayer, age: raw };
                          if (currentSeason) {
                            const newBirthYear = currentSeason - raw;
                            if (editedPlayer.birthdate) {
                              const [, mm, dd] = editedPlayer.birthdate.split('-');
                              updated.birthdate = `${newBirthYear}-${mm}-${dd}`;
                            } else {
                              updated.birthdate = `${newBirthYear}-06-15`;
                            }
                          }
                          setEditedPlayer(updated);
                        }}
                        onBlur={e => {
                          const clamped = Math.min(45, Math.max(18, editedPlayer.age || 18));
                          if (clamped !== editedPlayer.age) setEditedPlayer({ ...editedPlayer, age: clamped });
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
                        onChange={e => setEditedPlayer({...editedPlayer, hometown: e.target.value})}
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Salary ($)</label>
                        <input 
                          type="number" 
                          value={editedPlayer.salary}
                          onChange={e => handleContractChange('salary', parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
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
                      ['pullUpThree',      'Pull-Up 3'],
                      ['postUp',           'Post Up'],
                      ['driveToBasket',    'Drive to Basket'],
                      ['midRangeJumper',   'Mid-Range'],
                      ['kickOutPasser',    'Kick-Out / Passer'],
                      ['isoHeavy',         'Iso Heavy'],
                      ['transitionHunter', 'Transition Hunter'],
                      ['spotUp',           'Spot Up Shooter'],
                      ['cutter',           'Cutter'],
                      ['offScreen',        'Off Screen'],
                      ...((['PF','C'] as string[]).includes(editedPlayer.position) ? [['rollVsPop','Roll vs Pop'] as [string,string]] : []),
                      ['attackCloseOuts',  'Attack Close Outs'],
                      ['drawFoul',         'Draw Foul'],
                      ['dribbleHandOff',   'Dribble Hand Off'],
                      ['pullUpOffPnr',     'Pull Up off PnR'],
                    ] as [string, string][]).map(([key, label]) => {
                      const raw = (editedPlayer.tendencies ?? defaultTendencies).offensiveTendencies[key as keyof PlayerTendencies['offensiveTendencies']];
                      const val = raw ?? 50;
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
                            onChange={e => handleTendencyChange('offensiveTendencies', key, parseInt(e.target.value))}
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
                {/* Defensive + Situational */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">🛡️ Defensive</h4>
                    <div className="space-y-4">
                      {([
                        ['gambles',                'Gambles / Steals'],
                        ['helpDefender',           'Help Defense'],
                        ['physicality',            'Physicality'],
                        ['faceUpGuard',            'Face-Up Guard'],
                        ['onBallPest',             'On Ball Pest'],
                        ['denyThePass',            'Deny the Pass'],
                        ['shotContestDiscipline',  'Shot Contest Discipline'],
                      ] as [keyof PlayerTendencies['defensiveTendencies'], string][]).map(([key, label]) => {
                        const val = (editedPlayer.tendencies ?? defaultTendencies).defensiveTendencies[key] ?? 50;
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
                              onChange={e => handleTendencyChange('defensiveTendencies', key, parseInt(e.target.value))}
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
                  {/* Situational */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">⏱️ Situational</h4>
                    <div className="space-y-4">
                      {([
                        ['clutchShotTaker', 'Clutch Shot Taker'],
                      ] as [keyof PlayerTendencies['situationalTendencies'], string][]).map(([key, label]) => {
                        const val = (editedPlayer.tendencies ?? defaultTendencies).situationalTendencies?.[key] ?? 50;
                        return (
                          <div key={key} className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{label}</label>
                              <span className={`font-mono text-xs ${
                                val >= 70 ? 'text-amber-400 font-black' : val >= 40 ? 'text-slate-300' : 'text-slate-500'
                              }`}>{val}</span>
                            </div>
                            <input
                              type="range" min="0" max="100" value={val}
                              onChange={e => handleTendencyChange('situationalTendencies', key, parseInt(e.target.value))}
                              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            />
                            <div className="flex justify-between text-[7px] text-slate-700 font-mono">
                              <span>0</span><span>50</span><span>100</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 p-4 bg-slate-950/60 border border-slate-800/60 rounded-2xl space-y-2">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Tendency Effects</p>
                    <ul className="text-[9px] text-slate-600 space-y-1 leading-relaxed">
                      <li><span className="text-sky-500 font-bold">Gambles ≥ 70</span> — steals more, risks fouls &amp; easy baskets</li>
                      <li><span className="text-sky-500 font-bold">Help Defense ≥ 70</span> — rotates well, collapses on drives</li>
                      <li><span className="text-sky-500 font-bold">Physicality ≥ 85</span> — strong body; stops drives to rim</li>
                      <li><span className="text-sky-500 font-bold">Face-Up Guard ≥ 70</span> — contests 3PT; low = leaks open looks</li>
                      <li><span className="text-sky-500 font-bold">On Ball Pest ≥ 70</span> — suffocating pressure; foul prone</li>
                      <li><span className="text-sky-500 font-bold">Shot Contest Discipline</span> — low = bites pump fakes = fouls</li>
                      <li><span className="text-amber-500 font-bold">Clutch Shot Taker ≥ 70</span> — demands ball in final 2 min</li>
                    </ul>
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
      className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-7xl h-full max-h-[92vh] overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)] relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-8 right-8 z-[1100] flex gap-3">
          {godMode && (
            <button 
              onClick={() => setIsEditing(true)}
              className="p-4 bg-amber-500 hover:bg-amber-400 rounded-full text-slate-950 transition-all shadow-xl border border-amber-600"
              title="God Mode: Edit Player"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          )}
          <button 
            onClick={onClose}
            className="p-4 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-all shadow-xl border border-slate-700"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="relative h-64 bg-slate-800 shrink-0">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
          <div className="absolute bottom-8 left-10 md:bottom-10 md:left-12 flex items-end gap-8">
            <div className="text-[12rem] md:text-[14rem] font-display font-black text-white/[0.03] absolute -top-10 md:-top-20 -left-10 md:-left-16 pointer-events-none select-none">#{player.jerseyNumber}</div>

            <div className="relative z-10 flex flex-col">
              <h2 className="text-5xl md:text-8xl font-display font-bold uppercase tracking-tighter text-white drop-shadow-lg leading-tight">{player.name}</h2>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <span className="px-4 py-1.5 bg-amber-500 text-slate-950 text-xs font-black uppercase rounded-lg shadow-lg shadow-amber-500/20">{player.position}</span>
                <span className="text-slate-100 font-display font-bold text-xl uppercase tracking-wider">
                   {formatPhysicals(player.height, player.weight)}
                </span>
                <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${player.status === 'Starter' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-slate-800/50 text-slate-400 border-slate-700/50'}`}>
                  {player.status}
                </span>
                {isCurrentAllStar && (
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border flex items-center gap-1.5 shadow-lg ${
                    currentAllStarRole === 'Starter'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-900/30'
                      : 'bg-sky-500/15 text-sky-400 border-sky-500/30 shadow-sky-900/20'
                  }`}>
                    ⭐ All-Star {currentAllStarRole}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {player.personalityTraits.map(trait => (
                  <span key={trait} className="px-3 py-1 bg-amber-600/20 text-amber-500 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-900/20 flex items-center gap-1.5">
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

        <div id="modal-scroll-container" className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
          <section className="bg-slate-950/40 border border-slate-800/60 rounded-[2.5rem] p-8 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-4">
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Archetype</span>
                   <span className="text-amber-500 text-base font-bold uppercase tracking-widest">{player.archetype || 'Role Player'}</span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">
                      {(player as any).school ? 'School/Origin' : 'College'}
                   </span>
                   <span className="text-white text-base font-medium">
                      {(player as any).school || (player.college !== 'None' ? player.college : '—')}
                   </span>
                </div>
                {(player as any).proLeague && (
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
                <div className="flex items-center gap-6">
                   <span className="text-6xl font-display font-bold text-white">{player.rating}</span>
                   <div className="flex-1 space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                         <span>Rating: {player.rating}</span>
                         <span>Potential: {player.potential}</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${player.rating}%` }}></div>
                      </div>
                   </div>
                </div>
             </div>
          </section>

          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] whitespace-nowrap">Technical Attribute Matrix</h3>
              <div className="h-px w-full bg-slate-800/50"></div>
            </div>
            
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
          </section>

          {player.tendencies && (
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] whitespace-nowrap">Tendencies</h3>
              <div className="h-px w-full bg-slate-800/50"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Offensive Tendencies */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">⚡ Offensive</h4>
                <div className="space-y-3">
                  {([
                    ['Pull-Up 3',         player.tendencies.offensiveTendencies.pullUpThree],
                    ['Post Up',           player.tendencies.offensiveTendencies.postUp],
                    ['Drive to Basket',   player.tendencies.offensiveTendencies.driveToBasket],
                    ['Mid-Range',         player.tendencies.offensiveTendencies.midRangeJumper],
                    ['Kick-Out Passer',   player.tendencies.offensiveTendencies.kickOutPasser],
                    ['Iso Heavy',         player.tendencies.offensiveTendencies.isoHeavy],
                    ['Transition Hunter', player.tendencies.offensiveTendencies.transitionHunter],
                    ['Spot Up Shooter',   player.tendencies.offensiveTendencies.spotUp],
                    ['Cutter',            player.tendencies.offensiveTendencies.cutter],
                    ['Off Screen',        player.tendencies.offensiveTendencies.offScreen],
                    ...(['PF','C'].includes(player.position) && player.tendencies.offensiveTendencies.rollVsPop !== undefined
                      ? [['Roll vs Pop', player.tendencies.offensiveTendencies.rollVsPop] as [string,number]] : []),
                    ['Attack Close Outs', player.tendencies.offensiveTendencies.attackCloseOuts],
                    ['Draw Foul',         player.tendencies.offensiveTendencies.drawFoul],
                    ['Dribble Hand Off',  player.tendencies.offensiveTendencies.dribbleHandOff],
                    ['Pull Up off PnR',   player.tendencies.offensiveTendencies.pullUpOffPnr],
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
              {/* Defensive + Situational */}
              <div className="space-y-8">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">🛡️ Defensive</h4>
                  <div className="space-y-3">
                    {([
                      ['Gambles',                  player.tendencies.defensiveTendencies.gambles],
                      ['Help Defender',            player.tendencies.defensiveTendencies.helpDefender],
                      ['Physicality',              player.tendencies.defensiveTendencies.physicality],
                      ['Face-Up Guard',            player.tendencies.defensiveTendencies.faceUpGuard],
                      ['On Ball Pest',             player.tendencies.defensiveTendencies.onBallPest ?? 50],
                      ['Deny the Pass',            player.tendencies.defensiveTendencies.denyThePass ?? 50],
                      ['Shot Contest Discipline',  player.tendencies.defensiveTendencies.shotContestDiscipline ?? 50],
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
                {/* Situational */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest pb-2 border-b border-slate-800/50">⏱️ Situational</h4>
                  <div className="space-y-3">
                    {([
                      ['Clutch Shot Taker', player.tendencies.situationalTendencies?.clutchShotTaker ?? 50],
                    ] as [string, number][]).map(([label, val]) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 font-semibold w-36 shrink-0">{label}</span>
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${val >= 70 ? 'bg-amber-400' : val >= 45 ? 'bg-amber-700' : 'bg-slate-600'}`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-black w-7 text-right tabular-nums ${val >= 70 ? 'text-amber-400' : val >= 45 ? 'text-slate-300' : 'text-slate-500'}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
          )}

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
            const per = s.minutes > 0
              ? (s.points + s.rebounds + s.assists + s.steals + s.blocks
                  - (s.fga - s.fgm) - (s.fta - s.ftm) - s.tov)
                / s.minutes * 30 : 0;
            const pmPg = s.gamesPlayed > 0 ? s.plusMinus / s.gamesPlayed : 0;

            // Current-season splits from previous teams (trade splits)
            const currentSeasonSplits = currentSeason
              ? (player.careerStats ?? []).filter(cs => cs.year === currentSeason && cs.isSplit)
              : [];

            const hasCareer  = player.careerStats && player.careerStats.length > 0;
            const hasCurr    = s.gamesPlayed > 0 || currentSeasonSplits.length > 0;
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

              // ── Win Shares ──
              const lgPtsPerPoss = lgORtg / 100;
              const marginalOff  = (ORtg/100 - 0.92 * lgPtsPerPoss) * possUsed;
              const OWS = marginalOff / 33.33;
              const marginalDef  = (lgDRtg/100 - DRtg/100) * (s.minutes * PACE / 48);
              const DWS = marginalDef / 33.33;
              const WS  = OWS + DWS;
              const WS48 = s.minutes > 0 ? WS * 48 / s.minutes : 0;

              // ── EWA (Estimated Wins Added) ──
              const EWA = (per - 11.5) * s.minutes / 67.5;

              // ── BPM / VORP (simplified box score method) ──
              // Based on normalized per-100-possession stats
              const p100 = PACE > 0 && mpg > 0 ? 100 / (mpg / 48 * PACE) : 1;
              const pts100  = ppg  * p100;
              const reb100  = rpg  * p100;
              const ast100  = apg  * p100;
              const stl100  = spg  * p100;
              const blk100  = bpg  * p100;
              const tov100  = tpg  * p100;
              const orb100  = (s.offReb/gp) * p100;

              const OBPM = (-2.750)
                + 0.190 * pts100
                + 0.140 * ast100
                + 0.050 * orb100
                + 0.070 * (reb100 - orb100)
                - 0.175 * tov100
                + 0.050 * (USGpctProper/100 * 100 - 20)
                + 0.120 * (ts * 100 - 55)
                + 0.080 * threePAr * 100
                - 0.050 * FTr * 100;
              const DBPM = (-2.200)
                + 0.140 * stl100
                + 0.100 * blk100
                + 0.060 * (reb100 - orb100)
                - 0.040 * ast100
                - 0.040 * tov100
                - 0.030 * (USGpctProper/100 * 100 - 20);
              const BPM  = OBPM + DBPM;
              const VORP = (BPM - (-2.0)) * (s.minutes / 48) / SEASON;

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

                {/* ── Career highs ────────────────────────────────────────────── */}
                {hasHighs && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Career Highs</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[
                        { label: 'PTS', value: player.careerHighs.points },
                        { label: 'REB', value: player.careerHighs.rebounds },
                        { label: 'AST', value: player.careerHighs.assists },
                        { label: 'STL', value: player.careerHighs.steals },
                        { label: 'BLK', value: player.careerHighs.blocks },
                        { label: '3PM', value: player.careerHighs.threepm },
                      ].map(h => (
                        <div key={h.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">{h.label}</div>
                          <div className="font-display font-bold text-xl text-amber-400 mt-0.5 tabular-nums">{h.value || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Career awards & honours ─────────────────────────────────── */}
                {(careerAwards.length > 0 || (player.allStarSelections?.length ?? 0) > 0) && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Honours & Awards</p>
                    <div className="flex flex-wrap gap-2">
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
           <div className="p-10 bg-slate-950/80 border-t border-slate-800 flex flex-wrap justify-between items-center gap-6">
              <div className="flex items-center gap-6">
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
              </div>
              <button 
                 onClick={() => onRelease(player.id)}
                 className="px-10 py-5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 font-display font-bold uppercase rounded-2xl transition-all"
              >
                 Waive Player
              </button>
           </div>
        )}
      </div>
    </div>
  );
};

export default PlayerModal;