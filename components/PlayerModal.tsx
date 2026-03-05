import React, { useEffect } from 'react';
import { Player, PlayerStatus, PersonalityTrait, Position, PlayerTendencies } from '../types';
import { getFlag, POS_ATTR_RANGES, PosAttrRangeKey, enforcePositionalBounds } from '../constants';

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
  onUpdatePlayer
}) => {
  const [isEditing, setIsEditing] = React.useState(false);

  const defaultAttributes = {
    shooting: 50, defense: 50, rebounding: 50, playmaking: 50, athleticism: 50,
    shootingInside: 50, shootingMid: 50, shooting3pt: 50, freeThrow: 70,
    speed: 60, strength: 55, jumping: 55, stamina: 75,
    perimeterDef: 50, interiorDef: 50, steals: 50, blocks: 50,
    defensiveIQ: 50, ballHandling: 50, passing: 50, offensiveIQ: 50,
    postScoring: 50, offReb: 50, defReb: 50
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

  useEffect(() => {
    setEditedPlayer(normalizePlayer(player));
  }, [player]);

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
      onUpdatePlayer(enforcePositionalBounds(editedPlayer));
    }
    setIsEditing(false);
  };

  const handleAttributeChange = (key: keyof Player['attributes'], val: number) => {
    setEditedPlayer(prev => {
      const updated = { ...prev, attributes: { ...prev.attributes, [key]: val } };
      return enforcePositionalBounds(updated);
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
  const archetypes = ['Hybrid Star', '3&D', 'Pure Scorer', 'Playmaker', 'Lockdown Defender', 'Rim Protector', 'Stretch Big', 'Glass Cleaner', 'Floor General', 'Slasher'];

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
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Full Name</label>
                    <input 
                      type="text" 
                      value={editedPlayer.name}
                      onChange={e => setEditedPlayer({...editedPlayer, name: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-display text-xl focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Age</label>
                      <input 
                        type="number" 
                        min="18" max="45"
                        value={editedPlayer.age}
                        onChange={e => setEditedPlayer({...editedPlayer, age: parseInt(e.target.value)})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Jersey #</label>
                      <input 
                        type="number" 
                        min="0" max="99"
                        value={editedPlayer.jerseyNumber}
                        onChange={e => setEditedPlayer({...editedPlayer, jerseyNumber: parseInt(e.target.value)})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                      />
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
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Archetype</label>
                    <select 
                      value={editedPlayer.archetype}
                      onChange={e => setEditedPlayer({...editedPlayer, archetype: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                    >
                      {archetypes.map(arc => <option key={arc} value={arc}>{arc}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hometown / Country</label>
                    <input 
                      type="text" 
                      value={editedPlayer.hometown}
                      onChange={e => setEditedPlayer({...editedPlayer, hometown: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                    />
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
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Attributes & Potential</h3>
                  <div className="flex gap-8">
                    <div className="text-center">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">OVR</p>
                      <p className="text-2xl font-display font-black text-white">{editedPlayer.rating}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">POT</p>
                      <p className="text-2xl font-display font-black text-amber-500">{editedPlayer.potential}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Overall Potential</label>
                        <span className="text-amber-500 font-mono font-bold">{editedPlayer.potential}</span>
                      </div>
                      <input 
                        type="range" min="0" max="99" value={editedPlayer.potential}
                        onChange={e => setEditedPlayer({...editedPlayer, potential: parseInt(e.target.value)})}
                        className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Overall Rating</label>
                        <span className="text-white font-mono font-bold">{editedPlayer.rating}</span>
                      </div>
                      <input 
                        type="range" min="0" max="99" value={editedPlayer.rating}
                        onChange={e => setEditedPlayer({...editedPlayer, rating: parseInt(e.target.value)})}
                        className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                    </div>

                    <div className="h-px w-full bg-slate-800/50 my-4"></div>

                    {Object.entries(editedPlayer.attributes).slice(0, 12).map(([key, val]) => {
                      const isRangedKey = POS_RANGE_KEYS.includes(key as PosAttrRangeKey);
                      const posRange = isRangedKey ? POS_ATTR_RANGES[editedPlayer.position][key as PosAttrRangeKey] : null;
                      const sliderMin = posRange ? posRange[0] : 0;
                      const sliderMax = posRange ? posRange[1] : 99;
                      const outOfRange = posRange && (val as number) > posRange[1];
                      const warnLabels: Record<string, string> = {
                        rebounding: 'Guards rarely exceed',
                        shooting: 'Bigs rarely reach',
                        playmaking: 'Bigs rarely reach',
                        defense: 'Guards rarely reach',
                        athleticism: 'Out of typical range',
                      };
                      return (
                      <div key={key} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">{key.replace(/([A-Z])/g, ' $1')}</label>
                          <div className="flex items-center gap-2">
                            {posRange && <span className="text-[8px] text-slate-600 font-mono">{posRange[0]}–{posRange[1]}</span>}
                            <span className={`font-mono text-xs ${outOfRange ? 'text-amber-400' : 'text-slate-300'}`}>{val}</span>
                          </div>
                        </div>
                        <input 
                          type="range" min={sliderMin} max={sliderMax} value={val as number}
                          onChange={e => handleAttributeChange(key as any, parseInt(e.target.value))}
                          className={`w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer ${outOfRange ? 'accent-amber-400' : 'accent-slate-600'}`}
                        />
                        {outOfRange && (
                          <p className="text-[8px] text-amber-500/80 font-semibold">
                            ⚠ {warnLabels[key] ?? 'Out of typical range'} {posRange![1]} for {editedPlayer.position}
                          </p>
                        )}
                      </div>
                      );
                    })}
                  </div>

                  <div className="space-y-6">
                    {Object.entries(editedPlayer.attributes).slice(12).map(([key, val]) => (
                      <div key={key} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">{key.replace(/([A-Z])/g, ' $1')}</label>
                          <span className="text-slate-300 font-mono text-xs">{val}</span>
                        </div>
                        <input 
                          type="range" min="0" max="99" value={val as number}
                          onChange={e => handleAttributeChange(key as any, parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        />
                      </div>
                    ))}

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
                          min="1" max="2"
                          value={editedPlayer.draftInfo.round}
                          onChange={e => handleDraftInfoChange('round', parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                        />
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
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {player.personalityTraits.map(trait => (
                  <span key={trait} className="px-3 py-1 bg-amber-600/20 text-amber-500 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-900/20 flex items-center gap-1.5">
                    <span>{traitIcons[trait]}</span>
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div id="modal-scroll-container" className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
          <section className="bg-slate-950/40 border border-slate-800/60 rounded-[2.5rem] p-8 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-4">
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Archetype</span>
                   <span className="text-amber-500 text-base font-bold uppercase tracking-widest">{player.archetype || 'Hybrid Star'}</span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">
                      {(player as any).school ? 'School/Origin' : 'College'}
                   </span>
                   <span className="text-white text-base font-medium">
                      {(player as any).school || player.college}
                   </span>
                </div>
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
                {(player as any).archetype && (
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Archetype</span>
                    <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                      (player as any).archetype === 'Power'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    }`}>
                      {(player as any).archetype === 'Power' ? '💪 Power' : '⚡ Speedster'}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Draft</span>
                   <span className="text-white text-base font-medium">
                      {player.draftInfo.year} • R{player.draftInfo.round} P{player.draftInfo.pick} ({player.draftInfo.team})
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
                  <AttributeRow label="Inside Scoring" value={player.attributes.shootingInside} />
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

          <section className="space-y-8">
             <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Gemini Scouting analysis</h3>
                <button 
                   onClick={() => onScout(player)}
                   className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-full transition-all"
                >
                   Generate intelligence
                </button>
             </div>
             <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-10 min-h-[160px]">
                {scoutingReport?.playerId === player.id ? (
                   <div className="text-xl md:text-2xl text-slate-300 italic leading-relaxed animate-in slide-in-from-bottom-2">
                      {scoutingReport.report}
                   </div>
                ) : (
                   <div className="text-center py-10 opacity-30 italic">
                      <p className="font-display text-2xl uppercase tracking-widest">Awaiting Analysis</p>
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