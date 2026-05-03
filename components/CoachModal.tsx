
import React, { useEffect, useState } from 'react';
import { Coach, CoachBadge, CoachScheme, Gender } from '../types';
import { getFlag } from '../constants';
import { fmtSalary } from '../utils/formatters';

interface CoachModalProps {
  coach: Coach;
  onClose: () => void;
  onScout: (coach: Coach) => void;
  scoutingReport: { coachId: string; report: string } | null;
  isUserTeam: boolean;
  onFire?: (coachId: string) => void;
  onExtend?: (coachId: string, years: number, salary: number) => void;
  isOffseason?: boolean;
  isWomensLeague?: boolean;
  godMode?: boolean;
  onUpdateCoach?: (coach: Coach) => void;
  /** Career awards (e.g. COY wins) sorted newest-first */
  careerAwards?: { label: string; year: number; icon: string }[];
}

const badgeDescriptions: Record<CoachBadge, string> = {
  'Developmental Genius': 'Massive boost to rookie and young player attribute growth.',
  'Pace Master': 'Increases team speed and transition scoring efficiency.',
  'Star Handler': 'Minimizes friction with "Diva" personalities; boosts morale of stars.',
  'Defensive Guru': 'Significantly reduces opponent field goal percentage.',
  'Offensive Architect': 'Maximizes team spacing and three-point accuracy.',
  'Clutch Specialist': 'Provides a rating boost in the final 2 minutes of close games.',
  'Recruiting Ace': 'Increases the likelihood of free agents signing for less money.'
};

const SCHEMES: CoachScheme[] = ['Balanced', 'Pace and Space', 'Grit and Grind', 'Triangle', 'Small Ball', 'Showtime'];
const BADGES: CoachBadge[] = Object.keys(badgeDescriptions) as CoachBadge[];
const GENDERS: Gender[] = ['Male', 'Female', 'Non-binary'];

const CoachModal: React.FC<CoachModalProps> = ({
  coach,
  onClose,
  onScout,
  scoutingReport,
  isUserTeam,
  onFire,
  onExtend,
  isOffseason = false,
  isWomensLeague = false,
  godMode = false,
  onUpdateCoach,
  careerAwards = [],
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCoach, setEditedCoach] = useState<Coach>(coach);
  const [showExtendPanel, setShowExtendPanel] = useState(false);
  const [extendYears, setExtendYears] = useState(2);
  const [extendSalary, setExtendSalary] = useState(coach.salary || (isWomensLeague ? 300_000 : 3_000_000));

  // Sync state if coach prop changes
  useEffect(() => {
    setEditedCoach(coach);
  }, [coach]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isEditing) onClose(); };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handleEsc); document.body.style.overflow = 'unset'; };
  }, [onClose, isEditing]);

  const handleSave = () => {
    if (onUpdateCoach) {
      onUpdateCoach(editedCoach);
    }
    setIsEditing(false);
  };

  const getAttrColor = (val: number) => {
    if (val >= 85) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    if (val >= 70) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
    return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
  };

  const AttributeRow = ({ label, value, tooltip }: { label: string, value: number, tooltip: string }) => (
    <div className="group/attr relative" title={tooltip}>
      <div className="flex justify-between items-center text-[10px] font-bold uppercase mb-1.5">
        <span className="text-slate-400 tracking-wider group-hover/attr:text-white transition-colors">{label}</span>
        <span className="text-white font-mono">{value}</span>
      </div>
      <div className="h-2 bg-slate-950 rounded-full overflow-hidden p-[1px] border border-slate-800">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ${getAttrColor(value)}`} 
          style={{ width: `${value}%` }}
        ></div>
      </div>
    </div>
  );

  const overallRating = Math.round((coach.ratingOffense + coach.ratingDefense + coach.ratingDevelopment + coach.ratingMotivation + coach.ratingClutch + coach.ratingRecruiting) / 6);
  const editedOverall = Math.round((editedCoach.ratingOffense + editedCoach.ratingDefense + editedCoach.ratingDevelopment + editedCoach.ratingMotivation + editedCoach.ratingClutch + editedCoach.ratingRecruiting) / 6);

  const toggleBadge = (badge: CoachBadge) => {
    if (editedCoach.badges.includes(badge)) {
      setEditedCoach({ ...editedCoach, badges: editedCoach.badges.filter(b => b !== badge) });
    } else {
      setEditedCoach({ ...editedCoach, badges: [...editedCoach.badges, badge] });
    }
  };

  if (isEditing) {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-7xl h-full max-h-[92vh] overflow-hidden flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)] relative" onClick={e => e.stopPropagation()}>
          <header className="p-8 border-b border-slate-800 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-3xl font-display font-bold uppercase tracking-tight text-white">Edit <span className="text-amber-500">Coach</span></h2>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">God Mode: Full Data Access</p>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsEditing(false)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase rounded-xl transition-all">Cancel</button>
              <button onClick={handleSave} className="px-8 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-xl transition-all shadow-lg shadow-amber-500/20">Save Changes</button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="space-y-8">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Basic Information</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Full Name</label>
                    <input type="text" value={editedCoach.name} onChange={e => setEditedCoach({...editedCoach, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-display text-xl focus:outline-none focus:border-amber-500/50" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Age</label>
                      <input type="number" min="30" max="80" value={editedCoach.age} onChange={e => setEditedCoach({...editedCoach, age: parseInt(e.target.value) || 30})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 text-center" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Gender</label>
                      <select value={editedCoach.gender} onChange={e => setEditedCoach({...editedCoach, gender: e.target.value as Gender})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 text-center pr-8">
                        {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Philosophy / Scheme</label>
                    <select value={editedCoach.scheme} onChange={e => setEditedCoach({...editedCoach, scheme: e.target.value as CoachScheme})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 text-white font-display uppercase tracking-wider focus:outline-none focus:border-amber-500/50">
                      {SCHEMES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hometown</label>
                      <input type="text" value={editedCoach.hometown} onChange={e => setEditedCoach({...editedCoach, hometown: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">College</label>
                      <input type="text" value={editedCoach.college} onChange={e => setEditedCoach({...editedCoach, college: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Experience (Years)</label>
                      <input type="number" min="0" value={editedCoach.experience} onChange={e => setEditedCoach({...editedCoach, experience: parseInt(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Salary ($)</label>
                      <input type="number" min="100000" value={editedCoach.salary} onChange={e => setEditedCoach({...editedCoach, salary: parseInt(e.target.value) || 100000})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex justify-between items-end">
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Attributes</h3>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Calculated OVR</div>
                    <div className="text-4xl font-display font-black text-white">{editedOverall}</div>
                  </div>
                </div>

                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-6">
                  {(['ratingOffense', 'ratingDefense', 'ratingDevelopment', 'ratingMotivation', 'ratingClutch', 'ratingRecruiting'] as const).map(attr => (
                    <div key={attr} className="space-y-3">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                        <span className="text-slate-400">{attr.replace('rating', '')}</span>
                        <span className="text-amber-500">{editedCoach[attr]}</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        value={editedCoach[attr]} 
                        onChange={e => setEditedCoach({...editedCoach, [attr]: parseInt(e.target.value)})}
                        className="w-full accent-amber-500 h-2 bg-slate-900 rounded-full appearance-none cursor-pointer"
                      />
                    </div>
                  ))}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                        <span className="text-slate-400">Potential</span>
                        <span className="text-emerald-500">{editedCoach.potential || editedOverall}</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        value={editedCoach.potential || editedOverall} 
                        onChange={e => setEditedCoach({...editedCoach, potential: parseInt(e.target.value)})}
                        className="w-full accent-emerald-500 h-2 bg-slate-900 rounded-full appearance-none cursor-pointer"
                      />
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Badges</h3>
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-2 h-fit max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                  {BADGES.map((badge: CoachBadge) => (
                    <button
                      key={badge}
                      onClick={() => toggleBadge(badge)}
                      className={`px-4 py-3 rounded-xl border text-left flex-1 min-w-[200px] transition-all
                        ${editedCoach.badges.includes(badge)
                          ? 'bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                    >
                      <div className="text-xs font-black uppercase tracking-wider mb-1">{badge}</div>
                      <div className="text-[10px] opacity-70 leading-tight">{badgeDescriptions[badge]}</div>
                    </button>
                  ))}
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Coaching History (Bio)</label>
                  <textarea 
                    value={editedCoach.history} 
                    onChange={e => setEditedCoach({...editedCoach, history: e.target.value})} 
                    className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500/50 scrollbar-thin scrollbar-thumb-slate-800" 
                    placeholder="Short bio..."
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-6xl h-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl relative" onClick={e => e.stopPropagation()}>
        
        <div className="absolute top-8 right-8 z-[1100] flex gap-3">
          {godMode && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-4 bg-amber-500 hover:bg-amber-400 rounded-full text-slate-950 transition-all shadow-xl border border-amber-600"
              title="God Mode: Edit Coach"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          )}
          <button onClick={onClose} className="p-4 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 shadow-xl border border-slate-700 transition-all">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="relative h-64 md:h-80 bg-slate-800 shrink-0">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
          <div className="absolute bottom-10 left-10 md:bottom-12 md:left-12 flex items-end gap-8">
            <div className="w-32 h-32 md:w-48 md:h-48 bg-slate-900 rounded-3xl border-4 border-slate-800 shadow-2xl relative z-10 p-4 shrink-0">
              <div className="w-full h-full bg-slate-800 rounded-xl flex items-center justify-center font-display text-4xl md:text-6xl text-slate-600 uppercase">
                {coach.name.charAt(0)}
              </div>
            </div>
            <div className="relative z-10 pb-2">
              <h2 className="text-5xl md:text-8xl font-display font-bold uppercase tracking-tighter text-white drop-shadow-lg leading-tight">{coach.name}</h2>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <span className="px-4 py-1.5 bg-amber-500 text-slate-950 text-xs font-black uppercase rounded-lg">HEAD COACH</span>
                <span className="text-slate-100 font-display font-bold text-xl uppercase tracking-wider">
                   {coach.experience} Years EXP • {coach.age} Years Old
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {coach.badges.map(badge => (
                  <span key={badge} className="px-3 py-1 bg-amber-600/20 text-amber-500 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
          <section className="bg-slate-950/40 border border-slate-800/60 rounded-[2.5rem] p-10 grid grid-cols-1 md:grid-cols-2 gap-12">
             <div className="space-y-6">
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Philosophy</span>
                   <span className="text-amber-500 text-lg font-bold uppercase tracking-widest">{coach.scheme}</span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">College</span>
                   <span className="text-white text-lg font-medium">{coach.college}</span>
                </div>
                <div className="flex items-center gap-4">
                   <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] w-24">Hometown</span>
                   <span className="text-white text-lg font-medium">{coach.hometown} {getFlag(coach.country)}</span>
                </div>
             </div>
             <div className="space-y-4">
                <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Overall Rating</h4>
                <div className="flex items-center gap-6">
                   <span className="text-6xl font-display font-bold text-white">{overallRating}</span>
                   <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${overallRating}%` }}></div>
                   </div>
                </div>
             </div>
          </section>

          <section className="space-y-10">
            <div className="flex items-center gap-4">
              <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] whitespace-nowrap">Tactical attribution matrix</h3>
              <div className="h-px w-full bg-slate-800/50"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
              <div className="space-y-6">
                <div className="space-y-5">
                  <AttributeRow label="Offense" value={coach.ratingOffense} tooltip="Team scoring efficiency boost" />
                  <AttributeRow label="Defense" value={coach.ratingDefense} tooltip="Opponent scoring reduction" />
                  <AttributeRow label="Development" value={coach.ratingDevelopment} tooltip="Young player growth multiplier" />
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-5">
                  <AttributeRow label="Motivation" value={coach.ratingMotivation} tooltip="Team chemistry and morale retention" />
                  <AttributeRow label="Clutch Mgmt" value={coach.ratingClutch} tooltip="Late game tactical adjustments" />
                  <AttributeRow label="Recruiting" value={coach.ratingRecruiting} tooltip="Ability to attract star free agents" />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] whitespace-nowrap">Coaching Badges</h3>
              <div className="h-px w-full bg-slate-800/50"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {coach.badges.map(badge => (
                <div key={badge} className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 flex gap-4 hover:border-amber-500/30 transition-all group">
                   <div className="w-14 h-14 bg-amber-600/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-3xl shrink-0 group-hover:scale-110 transition-transform">
                      🛡️
                   </div>
                   <div>
                      <h4 className="text-amber-500 font-display font-bold uppercase text-lg tracking-wider mb-1">{badge}</h4>
                      <p className="text-slate-400 text-xs leading-relaxed font-medium">{badgeDescriptions[badge]}</p>
                   </div>
                </div>
              ))}
              {coach.badges.length === 0 && <p className="text-slate-600 italic">No specialist badges acquired yet.</p>}
            </div>
          </section>

          {careerAwards.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] whitespace-nowrap">Honours & Awards</h3>
                <div className="h-px w-full bg-slate-800/50"></div>
              </div>
              <div className="flex flex-wrap gap-3">
                {careerAwards.map((award, i) => (
                  <div key={`${award.label}-${award.year}-${i}`} className="flex items-center gap-2 px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl hover:border-amber-500/30 transition-colors">
                    <span className="text-xl leading-none">{award.icon}</span>
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{award.year}</div>
                      <div className="text-sm font-bold text-slate-200">{award.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-8">
             <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">Gemini Tactical analysis</h3>
                <button 
                   onClick={() => onScout(coach)}
                   className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-full transition-all"
                >
                   Generate intelligence
                </button>
             </div>
             <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-10 min-h-[160px]">
                {scoutingReport?.coachId === coach.id ? (
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
           <div className="p-10 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Contract:</span>
                <span className="text-white font-bold">{coach.contractYears} yr{coach.contractYears !== 1 ? 's' : ''} · {fmtSalary(coach.salary ?? 0)}/yr</span>
                {coach.contractYears <= 1 && (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase rounded-full">Expiring</span>
                )}
              </div>
              <div className="flex gap-4">
                {onExtend && (isOffseason || coach.contractYears <= 1) && (
                  <button
                    onClick={() => { setExtendSalary(coach.salary || (isWomensLeague ? 300_000 : 3_000_000)); setExtendYears(2); setShowExtendPanel(true); }}
                    className="px-10 py-5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 font-display font-bold uppercase rounded-2xl transition-all"
                  >
                    Extend Contract
                  </button>
                )}
                <button
                   onClick={() => onFire && onFire(coach.id)}
                   className="px-10 py-5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 font-display font-bold uppercase rounded-2xl transition-all"
                >
                   Terminate Contract
                </button>
              </div>
           </div>
        )}

        {/* ── Contract Extension Panel ─────────────────────────────────────── */}
        {showExtendPanel && (
          <div className="absolute inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm rounded-[3rem] flex flex-col p-10 overflow-y-auto animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-display font-bold uppercase text-white tracking-tight">Extend Contract</h2>
                <p className="text-xs text-slate-500 mt-1">{coach.name} · Current: {coach.contractYears} yr{coach.contractYears !== 1 ? 's' : ''} @ {fmtSalary(coach.salary ?? 0)}/yr</p>
              </div>
              <button onClick={() => setShowExtendPanel(false)} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {coach.desiredContract && (
              <div className="mb-6 p-5 bg-slate-900 border border-slate-700 rounded-2xl flex items-center gap-4">
                <span className="text-2xl">🤝</span>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Coach Asking Price</p>
                  <p className="text-white font-bold">{coach.desiredContract.years} yr{coach.desiredContract.years !== 1 ? 's' : ''} · {fmtSalary(coach.desiredContract.salary)}/yr</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Contract Length</label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4].map(y => (
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
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Annual Salary</label>
                <input
                  type="number"
                  min={isWomensLeague ? 50_000 : 500_000}
                  step={isWomensLeague ? 10_000 : 100_000}
                  value={extendSalary}
                  onChange={e => setExtendSalary(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-amber-500/50"
                />
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
                onClick={() => { if (onExtend) { onExtend(coach.id, extendYears, extendSalary); setShowExtendPanel(false); } }}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold uppercase rounded-2xl transition-all shadow-lg shadow-emerald-900/30"
              >
                Confirm Extension
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoachModal;
