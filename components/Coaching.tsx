
import React, { useState } from 'react';
import { LeagueState, Team, Coach, CoachScheme } from '../types';

interface CoachingProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

const Coaching: React.FC<CoachingProps> = ({ league, updateLeague }) => {
  const [hiringRole, setHiringRole] = useState<string | null>(null);
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  // Fix: Explicitly cast Object.values to (Coach | null)[] to fix 'unknown' type access errors
  const currentStaffCost = (Object.values(userTeam.staff) as (Coach | null)[])
    .reduce((sum, coach) => sum + (coach?.salary || 0), 0);

  const avgDev = (userTeam.staff.assistantDev?.ratingDevelopment || 60);
  const rookieGrowthBoost = Math.max(0, (avgDev - 60) * 0.5).toFixed(1);

  const handleHire = (coach: Coach) => {
    if (!hiringRole) return;
    const updatedStaff = { ...userTeam.staff, [hiringRole]: coach };
    const updatedTeams = league.teams.map(t => 
      t.id === userTeam.id ? { ...t, staff: updatedStaff } : t
    );
    const updatedPool = league.coachPool.filter(c => c.id !== coach.id);
    updateLeague({ teams: updatedTeams, coachPool: updatedPool });
    setHiringRole(null);
  };

  const setScheme = (scheme: CoachScheme) => {
    const updatedTeams = league.teams.map(t => 
      t.id === userTeam.id ? { ...t, activeScheme: scheme } : t
    );
    updateLeague({ teams: updatedTeams });
  };

  const getRatingBadge = (val: number) => {
    if (val >= 90) return 'A+';
    if (val >= 80) return 'A';
    if (val >= 70) return 'B';
    if (val >= 60) return 'C';
    return 'D';
  };

  const StaffCard = ({ role, coach, label }: { role: string, coach: Coach | null, label: string }) => (
    <div className={`bg-slate-900 border rounded-2xl p-6 relative overflow-hidden transition-all ${coach ? 'border-slate-800' : 'border-dashed border-slate-700 bg-slate-950/40'}`}>
       <div className="flex justify-between items-start mb-4">
          <div>
             <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{label}</p>
             <h4 className="text-xl font-display font-bold text-white uppercase">{coach?.name || 'Vacant'}</h4>
          </div>
          {coach && (
             <span className="bg-amber-500/10 text-amber-500 px-2 py-1 rounded text-[10px] font-black">{getRatingBadge((coach.ratingOffense + coach.ratingDefense)/2)}</span>
          )}
       </div>

       {coach ? (
         <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
               <div className="bg-slate-950/50 p-2 rounded">
                  <span className="text-slate-500 uppercase">OFF:</span> <span className="text-amber-500">{coach.ratingOffense}</span>
               </div>
               <div className="bg-slate-950/50 p-2 rounded">
                  <span className="text-slate-500 uppercase">DEF:</span> <span className="text-blue-400">{coach.ratingDefense}</span>
               </div>
               <div className="bg-slate-950/50 p-2 rounded">
                  <span className="text-slate-500 uppercase">DEV:</span> <span className="text-emerald-400">{coach.ratingDevelopment}</span>
               </div>
               <div className="bg-slate-950/50 p-2 rounded">
                  <span className="text-slate-500 uppercase">SAL:</span> <span className="text-slate-300">${(coach.salary/1000000).toFixed(1)}M</span>
               </div>
            </div>
            <button 
               onClick={() => setHiringRole(role)}
               className="w-full py-2 bg-slate-800 hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 text-[10px] font-black uppercase rounded transition-all"
            >
               Replace Staff
            </button>
         </div>
       ) : (
         <button 
            onClick={() => setHiringRole(role)}
            className="w-full py-6 text-slate-500 hover:text-amber-500 hover:bg-amber-500/5 transition-all text-[10px] font-black uppercase tracking-[0.3em]"
         >
            Hire Personnel
         </button>
       )}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 blur-[100px] rounded-full -mr-48 -mt-48"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Strategy & Staff</h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              Staff Budget: <span className="text-emerald-400">${(userTeam.staffBudget/1000000).toFixed(1)}M</span>
              <span className="w-1 h-1 rounded-full bg-slate-700"></span>
              {/* Fix: Use currentStaffCost instead of non-existent currentSalary */}
              Allocated: <span className="text-amber-500">${(currentStaffCost / 1000000).toFixed(1)}M</span>
            </p>
          </div>
          
          <div className="flex gap-6">
             <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Rookie Growth XP</p>
                <p className="text-2xl font-display font-bold text-emerald-400">+{rookieGrowthBoost}%</p>
             </div>
             <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-center">
                <p className="text-[10px] text-slate-500 uppercase font-black mb-1">B2B Fatigue Cut</p>
                <p className="text-2xl font-display font-bold text-amber-500">-3%</p>
             </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Strategy / Schemes */}
        <div className="space-y-6">
           <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-6 pb-2 border-b border-slate-800">Team Playbook</h3>
              <div className="space-y-3">
                 {['Balanced', 'Pace and Space', 'Grit and Grind', 'Triangle', 'Small Ball', 'Showtime'].map((s) => (
                    <button 
                      key={s}
                      onClick={() => setScheme(s as any)}
                      className={`w-full text-left p-4 rounded-2xl transition-all border ${userTeam.activeScheme === s ? 'bg-amber-500 border-amber-400 text-slate-950' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                    >
                       <p className="font-display font-bold uppercase text-lg">{s}</p>
                       <p className={`text-[10px] font-bold ${userTeam.activeScheme === s ? 'text-slate-800' : 'text-slate-600'}`}>
                          {s === 'Pace and Space' ? '+3PT, +Speed, -Reb' : s === 'Grit and Grind' ? '+Def, +Int, -3PT' : 'Balanced execution'}
                       </p>
                    </button>
                 ))}
              </div>
           </section>

           <div className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-3xl">
              <h4 className="text-[10px] font-black uppercase text-amber-500 mb-2">Staff Projections</h4>
              <p className="text-xs text-slate-400 leading-relaxed italic">
                "With Coach {userTeam.staff.headCoach?.name || 'N/A'} at the helm, we project an additional 2-4 sim wins based on scheme fit alone."
              </p>
           </div>
        </div>

        {/* Center/Right: Staff Carousel */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
           <StaffCard role="headCoach" coach={userTeam.staff.headCoach} label="Head Coach" />
           <StaffCard role="assistantOffense" coach={userTeam.staff.assistantOffense} label="Asst. Coach (OFF)" />
           <StaffCard role="assistantDefense" coach={userTeam.staff.assistantDefense} label="Asst. Coach (DEF)" />
           <StaffCard role="assistantDev" coach={userTeam.staff.assistantDev} label="Asst. Coach (DEV)" />
           <StaffCard role="trainer" coach={userTeam.staff.trainer} label="Head Trainer" />
        </div>
      </div>

      {hiringRole && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                 <div>
                    <h3 className="text-3xl font-display font-bold uppercase text-white">Hire Staff Personnel</h3>
                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest mt-1">Available Coaching Pool</p>
                 </div>
                 <button onClick={() => setHiringRole(null)} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {league.coachPool.map(coach => (
                       <div key={coach.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all group">
                          <div className="flex justify-between items-start mb-4">
                             <h4 className="text-lg font-display font-bold text-white group-hover:text-amber-500 transition-colors uppercase">{coach.name}</h4>
                             <span className="text-[10px] font-black text-slate-500">Tier {getRatingBadge((coach.ratingOffense + coach.ratingDefense)/2)}</span>
                          </div>
                          <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-4 text-[10px] font-bold">
                                <div><span className="text-slate-600 block">OFFENSE</span> {coach.ratingOffense}</div>
                                <div><span className="text-slate-600 block">DEFENSE</span> {coach.ratingDefense}</div>
                                <div><span className="text-slate-600 block">DEVELOPMENT</span> {coach.ratingDevelopment}</div>
                                <div><span className="text-slate-600 block">EXP (YRS)</span> {coach.experience}</div>
                             </div>
                             <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                                <span className="font-mono text-emerald-400 font-bold">${(coach.salary/1000000).toFixed(1)}M /yr</span>
                                <button 
                                   onClick={() => handleHire(coach)}
                                   className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-lg transition-all"
                                >
                                   Hire Staff
                                </button>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Coaching;
