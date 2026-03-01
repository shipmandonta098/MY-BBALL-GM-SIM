
import React, { useEffect } from 'react';
import { Coach, CoachBadge } from '../types';

interface CoachModalProps {
  coach: Coach;
  onClose: () => void;
  onScout: (coach: Coach) => void;
  scoutingReport: { coachId: string; report: string } | null;
  isUserTeam: boolean;
  onFire?: (coachId: string) => void;
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

const CoachModal: React.FC<CoachModalProps> = ({ 
  coach, 
  onClose, 
  onScout, 
  scoutingReport, 
  isUserTeam, 
  onFire 
}) => {

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handleEsc); document.body.style.overflow = 'unset'; };
  }, [onClose]);

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

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-6xl h-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl relative" onClick={e => e.stopPropagation()}>
        
        <button onClick={onClose} className="absolute top-8 right-8 z-[1100] p-4 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 shadow-xl border border-slate-700 transition-all">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

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
                   <span className="text-white text-lg font-medium">{coach.hometown}</span>
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
           <div className="p-10 bg-slate-950/80 border-t border-slate-800 flex justify-end gap-4">
              <button 
                 onClick={() => onFire && onFire(coach.id)}
                 className="px-10 py-5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 font-display font-bold uppercase rounded-2xl transition-all"
              >
                 Terminate Contract
              </button>
           </div>
        )}
      </div>
    </div>
  );
};

export default CoachModal;
