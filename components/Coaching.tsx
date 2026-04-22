
import React, { useState, useRef } from 'react';
import { LeagueState, Team, Coach, CoachScheme } from '../types';
import { getCoachPreferredScheme } from '../constants';
import { fmtSalary } from '../utils/formatters';

interface CoachingProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  godMode?: boolean;
}

const Coaching: React.FC<CoachingProps> = ({ league, updateLeague, godMode = false }) => {
  const [hiringRole, setHiringRole] = useState<string | null>(null);
  const [godMsg, setGodMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const importStaffRef = useRef<HTMLInputElement>(null);
  const importCoachRef = useRef<HTMLInputElement>(null);
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  // Fix: Explicitly cast Object.values to (Coach | null)[] to fix 'unknown' type access errors
  const currentStaffCost = (Object.values(userTeam.staff) as (Coach | null)[])
    .reduce((sum, coach) => sum + (coach?.salary || 0), 0);

  const assistDevRating = userTeam.staff.assistantDev?.ratingDevelopment ?? 60;
  const hcDevRating     = userTeam.staff.headCoach?.ratingDevelopment ?? 50;
  // Mirror the formula in App.tsx offseason dev: HC dev (50→100 = 0→+30%) + assistDev (base /75)
  const hcBonus    = Math.max(0, (hcDevRating - 50) / 50) * 30;
  const assistBase = Math.max(0, (assistDevRating - 60) * 0.5);
  const rookieGrowthBoost = (hcBonus + assistBase).toFixed(1);

  const flashGodMsg = (text: string, type: 'ok' | 'err') => {
    setGodMsg({ text, type });
    setTimeout(() => setGodMsg(null), 3500);
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

  const handleExportStaff = () => {
    downloadJson(userTeam.staff, `${userTeam.abbreviation}-staff.json`);
    flashGodMsg(`Exported ${userTeam.name} staff.`, 'ok');
  };

  const handleImportStaff = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a staff object.');
        const updatedTeams = league.teams.map(t =>
          t.id === userTeam.id ? { ...t, staff: { ...userTeam.staff, ...parsed } } : t
        );
        updateLeague({ teams: updatedTeams });
        flashGodMsg('Staff imported successfully.', 'ok');
      } catch (err: any) {
        flashGodMsg(`Import failed: ${err.message}`, 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const STAFF_ROLES: { key: keyof typeof userTeam.staff; label: string }[] = [
    { key: 'headCoach', label: 'Head Coach' },
    { key: 'assistantOffense', label: 'Asst OFF' },
    { key: 'assistantDefense', label: 'Asst DEF' },
    { key: 'assistantDev', label: 'Asst DEV' },
    { key: 'trainer', label: 'Trainer' },
  ];

  const handleImportCoach = (e: React.ChangeEvent<HTMLInputElement>, role: keyof typeof userTeam.staff) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Coach;
        if (!parsed.id || !parsed.name) throw new Error('Invalid coach JSON.');
        const updatedTeams = league.teams.map(t =>
          t.id === userTeam.id ? { ...t, staff: { ...t.staff, [role]: parsed } } : t
        );
        updateLeague({ teams: updatedTeams });
        flashGodMsg(`${parsed.name} imported as ${STAFF_ROLES.find(r => r.key === role)?.label}.`, 'ok');
      } catch (err: any) {
        flashGodMsg(`Import failed: ${err.message}`, 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleHire = (coach: Coach) => {
    if (!hiringRole) return;
    // Always clear interim flag when explicitly hired — this is a permanent hire
    const hiredCoach: Coach = { ...coach, isInterim: false };
    const updatedStaff = { ...userTeam.staff, [hiringRole]: hiredCoach };
    const updatedTeams = league.teams.map(t =>
      t.id === userTeam.id
        ? {
            ...t,
            staff: updatedStaff,
            // When hiring an HC, auto-switch team playbook to coach's preferred scheme
            ...(hiringRole === 'headCoach' ? {
              coachSearchDaysLeft: undefined,
              activeScheme: getCoachPreferredScheme(hiredCoach),
            } : {}),
          }
        : t,
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
    <div className={`bg-slate-900 border rounded-2xl p-6 relative overflow-hidden transition-all ${
      coach?.isInterim
        ? 'border-amber-500/40 bg-amber-500/5'
        : coach
          ? 'border-slate-800'
          : 'border-dashed border-slate-700 bg-slate-950/40'
    }`}>
       <div className="flex justify-between items-start mb-4">
          <div>
             <div className="flex items-center gap-2 mb-0.5">
               <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{label}</p>
               {coach?.isInterim && (
                 <span className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/50 rounded text-[9px] font-black text-amber-400 uppercase tracking-widest animate-pulse">
                   Interim
                 </span>
               )}
             </div>
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
                  <span className="text-slate-500 uppercase">SAL:</span> <span className="text-slate-300">{fmtSalary(coach.salary)}</span>
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
              Staff Budget: <span className="text-emerald-400">{fmtSalary(userTeam.staffBudget)}</span>
              <span className="w-1 h-1 rounded-full bg-slate-700"></span>
              Allocated: <span className="text-amber-500">{fmtSalary(currentStaffCost)}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap gap-4">
             <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl text-center min-w-[120px]">
                <p className="text-[9px] text-orange-400 uppercase font-black mb-1 tracking-widest">Dev Boost</p>
                <p className="text-2xl font-display font-bold text-orange-400">+{rookieGrowthBoost}%</p>
                <p className="text-[8px] text-slate-600 mt-0.5">HC + Dev Asst</p>
             </div>
             <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-center min-w-[120px]">
                <p className="text-[9px] text-slate-500 uppercase font-black mb-1 tracking-widest">HC Dev Rtg</p>
                <p className={`text-2xl font-display font-bold ${hcDevRating >= 80 ? 'text-orange-400' : hcDevRating >= 65 ? 'text-amber-500' : 'text-slate-400'}`}>{hcDevRating}</p>
                <p className="text-[8px] text-slate-600 mt-0.5">Inj Duration</p>
             </div>
             <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-center min-w-[120px]">
                <p className="text-[9px] text-slate-500 uppercase font-black mb-1 tracking-widest">Asst Dev Rtg</p>
                <p className={`text-2xl font-display font-bold ${assistDevRating >= 80 ? 'text-emerald-400' : assistDevRating >= 65 ? 'text-amber-500' : 'text-slate-400'}`}>{assistDevRating}</p>
                <p className="text-[8px] text-slate-600 mt-0.5">Growth Base</p>
             </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Strategy / Schemes */}
        <div className="space-y-6">
           <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-1 pb-2 border-b border-slate-800">Team Playbook</h3>

              {/* Coach fit indicator */}
              {(() => {
                const hc = userTeam.staff.headCoach;
                if (!hc) return null;
                const preferred = getCoachPreferredScheme(hc);
                const isMatch = userTeam.activeScheme === preferred;
                return (
                  <div className={`mt-4 mb-5 p-3 rounded-xl border text-[10px] font-bold flex items-start gap-2 ${
                    isMatch
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                  }`}>
                    <span className="text-base leading-none mt-0.5">{isMatch ? '✓' : '⚠'}</span>
                    <div>
                      <p className="uppercase tracking-widest">
                        {isMatch ? 'Scheme match' : 'Scheme mismatch'}
                      </p>
                      <p className="font-normal text-slate-400 mt-0.5">
                        {hc.name.split(' ').at(-1)} runs <span className="font-bold text-slate-200">{preferred}</span>
                        {isMatch
                          ? ' — players thrive in their natural system (+morale)'
                          : ` — current playbook is ${userTeam.activeScheme}. Expect reduced morale for scorers and Diva players.`}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                {([
                  { scheme: 'Balanced',       icon: '⚖️',  desc: 'All-around execution, no weaknesses',               tags: ['Balanced', 'Versatile'] },
                  { scheme: 'Pace and Space', icon: '🏃',  desc: '+3PT looks, kick-outs, fast tempo',                  tags: ['+3PT', '+Speed', '-Post'] },
                  { scheme: 'Grit and Grind', icon: '💪',  desc: 'Post-heavy, interior defence, slow it down',         tags: ['+Post', '+Defense', '-3PT'] },
                  { scheme: 'Triangle',       icon: '🔺',  desc: 'Ball movement, cuts, punishes iso ball',             tags: ['+Cuts', '+Passing', '-ISO'] },
                  { scheme: 'Small Ball',     icon: '⚡',  desc: 'Drive-heavy, switching D, speed over size',           tags: ['+Drives', '+Speed', '-Post'] },
                  { scheme: 'Showtime',       icon: '🎬',  desc: 'Transition dunks, lobs, run-and-gun',                tags: ['+Transition', '+Dunks', '-HalfCourt'] },
                ] as { scheme: CoachScheme; icon: string; desc: string; tags: string[] }[]).map(({ scheme, icon, desc, tags }) => {
                  const hc = userTeam.staff.headCoach;
                  const preferred = hc ? getCoachPreferredScheme(hc) : null;
                  const isActive   = userTeam.activeScheme === scheme;
                  const isPreferred = preferred === scheme;
                  return (
                    <button
                      key={scheme}
                      onClick={() => setScheme(scheme)}
                      className={`w-full text-left p-3 rounded-2xl transition-all border relative ${
                        isActive
                          ? 'bg-amber-500 border-amber-400 text-slate-950'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{icon}</span>
                          <p className={`font-display font-bold uppercase text-sm ${isActive ? 'text-slate-950' : 'text-slate-200'}`}>{scheme}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isPreferred && (
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                              isActive ? 'bg-slate-900/30 border-slate-900/30 text-slate-900' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                            }`}>Coach's Pick</span>
                          )}
                        </div>
                      </div>
                      <p className={`text-[9px] mt-0.5 ml-7 ${isActive ? 'text-slate-700' : 'text-slate-600'}`}>{desc}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5 ml-7">
                        {tags.map(t => (
                          <span key={t} className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                            isActive ? 'bg-slate-900/20 text-slate-800' : 'bg-slate-800 text-slate-500'
                          }`}>{t}</span>
                        ))}
                      </div>
                      {!isActive && userTeam.staff.headCoach && preferred !== scheme && (
                        <p className="text-[8px] text-orange-400/70 ml-7 mt-0.5">⚠ Not coach's system — morale risk</p>
                      )}
                    </button>
                  );
                })}
              </div>
           </section>

           <div className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-3xl">
              <h4 className="text-[10px] font-black uppercase text-amber-500 mb-2">Playbook Impact</h4>
              <p className="text-xs text-slate-400 leading-relaxed italic">
                Playbook directly shapes shot selection, PBP tempo, and player morale. Matching coach style gives players a +morale boost each game and unlocks scheme-specific commentary.
              </p>
           </div>
        </div>

        {/* Center/Right: Staff Carousel */}
        <div className="lg:col-span-2 space-y-6">
           {/* Front Office — GM nameplate */}
           {userTeam.gmName && (
             <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4">
               <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                 <span className="text-lg">💼</span>
               </div>
               <div className="min-w-0">
                 <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">General Manager</p>
                 <p className="text-sm font-bold text-white truncate">{userTeam.gmName}</p>
                 {userTeam.gmAge && (
                   <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Age {userTeam.gmAge}</p>
                 )}
               </div>
             </div>
           )}
           {/* Interim / search banner */}
           {userTeam.staff.headCoach?.isInterim && (
             <div className="flex items-start gap-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 animate-in fade-in duration-500">
               <span className="text-2xl mt-0.5">🔍</span>
               <div>
                 <p className="text-xs font-black uppercase text-amber-400 tracking-widest">Permanent HC Search Active</p>
                 <p className="text-[11px] text-amber-300/70 mt-0.5 leading-relaxed">
                   <strong>{userTeam.staff.headCoach.name}</strong> is running the team on an interim basis.
                   Head to the <strong>Coach Market</strong> or <strong>Hire Personnel</strong> on the HC card to appoint a permanent head coach.
                 </p>
               </div>
             </div>
           )}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <StaffCard role="headCoach" coach={userTeam.staff.headCoach} label="Head Coach" />
           <StaffCard role="assistantOffense" coach={userTeam.staff.assistantOffense} label="Asst. Coach (OFF)" />
           <StaffCard role="assistantDefense" coach={userTeam.staff.assistantDefense} label="Asst. Coach (DEF)" />
           <StaffCard role="assistantDev" coach={userTeam.staff.assistantDev} label="Asst. Coach (DEV)" />
           <StaffCard role="trainer" coach={userTeam.staff.trainer} label="Head Trainer" />
           </div>
        </div>
      </div>

      {godMode && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400 text-base">⚡</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">God Mode — Staff Tools</span>
          </div>
          {godMsg && (
            <div className={`text-[11px] font-bold px-4 py-2 rounded-xl border ${godMsg.type === 'ok' ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-900/40 border-rose-500/40 text-rose-300'}`}>
              {godMsg.text}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportStaff}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all"
            >
              ↓ Export Staff
            </button>
            <button
              onClick={() => importStaffRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all"
            >
              ↑ Import Staff
            </button>
            <input ref={importStaffRef} type="file" accept=".json" className="hidden" onChange={handleImportStaff} />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Import Individual Coach</p>
            <div className="flex flex-wrap gap-3">
              {STAFF_ROLES.map(({ key, label }) => {
                const ref = React.createRef<HTMLInputElement>();
                return (
                  <React.Fragment key={key}>
                    <button
                      onClick={() => (document.getElementById(`import-coach-${key}`) as HTMLInputElement)?.click()}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/40 text-blue-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all"
                    >
                      ↑ {label}
                    </button>
                    <input
                      id={`import-coach-${key}`}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={e => handleImportCoach(e, key)}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
            Export Staff saves all 5 staff roles · Import Staff replaces all · Import Individual targets a specific slot
          </p>
        </div>
      )}

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
                                <span className="font-mono text-emerald-400 font-bold">{fmtSalary(coach.salary)} /yr</span>
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
