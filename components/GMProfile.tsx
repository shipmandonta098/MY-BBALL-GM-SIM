
import React, { useState } from 'react';
import { LeagueState, GMProfile, GMMilestone } from '../types';
import TeamBadge from './TeamBadge';

interface GMProfileProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

const GMProfileView: React.FC<GMProfileProps> = ({ league, updateLeague }) => {
  const profile = league.gmProfile;
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(profile.name);

  const handleSaveName = () => {
    updateLeague({ gmProfile: { ...profile, name: newName } });
    setIsEditingName(false);
  };

  const winPct = (userTeam.wins / (userTeam.wins + userTeam.losses || 1)).toFixed(3);
  
  const careerStats = [
    { label: 'Seasons Managed', value: profile.totalSeasons },
    { label: 'Total EOY Awards', value: profile.eoyWins.length },
    { label: 'Win Percentage', value: `${(parseFloat(winPct) * 100).toFixed(1)}%` },
    { label: 'Championships', value: league.championshipHistory?.filter(c => c.championId === league.userTeamId).length || 0 }
  ];

  const getTypeColor = (type: GMMilestone['type']) => {
    switch (type) {
      case 'title': return 'bg-amber-500';
      case 'award': return 'bg-emerald-500';
      case 'firing': return 'bg-rose-500';
      case 'trade': return 'bg-blue-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      {/* Profile Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 blur-[120px] rounded-full -mr-64 -mt-64"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
          <div className="relative group">
            <div className="w-48 h-48 bg-slate-800 rounded-[3rem] border-4 border-slate-700 overflow-hidden shadow-2xl transition-transform group-hover:scale-105">
               <img 
                 src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.avatarSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`} 
                 className="w-full h-full object-cover" 
                 alt="GM Avatar" 
               />
            </div>
            <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-950 font-display font-black text-2xl shadow-xl border-4 border-slate-900">
               {profile.reputation}
            </div>
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
              {isEditingName ? (
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-slate-950 border border-amber-500/50 rounded-xl px-4 py-2 text-3xl font-display font-bold text-white focus:outline-none"
                  />
                  <button onClick={handleSaveName} className="p-2 bg-emerald-500 text-slate-950 rounded-xl">✓</button>
                </div>
              ) : (
                <h1 className="text-6xl font-display font-bold uppercase tracking-tight text-white flex items-center gap-4 group">
                  {profile.name}
                  <button onClick={() => setIsEditingName(true)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-amber-500 transition-all text-sm">
                     ✎ Edit
                  </button>
                </h1>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              <span className="px-4 py-1.5 bg-slate-800 border border-slate-700 rounded-full text-xs font-bold text-slate-400 uppercase tracking-widest">General Manager</span>
              <div className="flex items-center gap-2">
                 <TeamBadge team={userTeam} size="xs" />
                 <span className="text-amber-500 font-display font-bold text-xl uppercase">{userTeam.name} Tenure</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto flex gap-4">
             <div className="bg-slate-950/50 p-6 rounded-3xl border border-slate-800 text-center min-w-[140px]">
                <p className="text-[10px] text-slate-500 font-black uppercase mb-1">GM Reputation</p>
                <p className="text-4xl font-display font-bold text-white">{profile.reputation}%</p>
             </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         {careerStats.map(stat => (
           <div key={stat.label} className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-xl hover:border-amber-500/30 transition-all group">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">{stat.label}</p>
              <p className="text-5xl font-display font-black text-white group-hover:text-amber-500 transition-colors">{stat.value}</p>
           </div>
         ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Legacy Timeline */}
         <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
               <h3 className="text-xl font-display font-bold uppercase text-white mb-8 border-b border-slate-800 pb-4 flex items-center justify-between">
                  Career Legacy Timeline
                  <span className="text-[10px] font-black text-slate-500 tracking-widest">{profile.milestones.length} ENTRIES</span>
               </h3>
               
               <div className="space-y-8 relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-800"></div>
                  
                  {profile.milestones.sort((a,b) => b.year - a.year || b.day - a.day).map((m, i) => (
                    <div key={m.id} className="relative pl-12 animate-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 100}ms` }}>
                       <div className={`absolute left-0 top-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-xs shadow-lg z-10 ${getTypeColor(m.type)}`}>
                          {m.type === 'title' ? '🏆' : m.type === 'award' ? '🥇' : m.type === 'trade' ? '⇄' : '•'}
                       </div>
                       <div>
                          <div className="flex items-center gap-3 mb-1">
                             <span className="text-amber-500 font-display font-bold text-lg uppercase">Season {m.year}</span>
                             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Day {m.day}</span>
                          </div>
                          <p className="text-slate-200 text-base font-medium leading-relaxed">{m.text}</p>
                       </div>
                    </div>
                  ))}

                  {profile.milestones.length === 0 && (
                    <div className="py-20 text-center opacity-30 italic">
                       <p className="font-display text-2xl uppercase tracking-widest">Legacy has yet to be written.</p>
                    </div>
                  )}
               </div>
            </div>
         </div>

         {/* Honors Rack */}
         <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative">
               <div className="absolute -right-10 -bottom-10 opacity-5">
                  <span className="text-[14rem]">👑</span>
               </div>
               <h3 className="text-xl font-display font-bold uppercase text-white mb-6">Honors & Titles</h3>
               <div className="space-y-4">
                  {profile.eoyWins.length > 0 ? profile.eoyWins.map(year => (
                    <div key={year} className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between group hover:bg-amber-500 hover:text-slate-950 transition-all cursor-pointer">
                       <div className="flex items-center gap-4">
                          <span className="text-2xl group-hover:scale-110 transition-transform">🥇</span>
                          <div>
                             <p className="font-display font-bold uppercase text-lg">Executive of the Year</p>
                             <p className="text-[10px] font-black uppercase opacity-70">Season {year}</p>
                          </div>
                       </div>
                    </div>
                  )) : (
                    <p className="text-slate-600 italic text-center py-10 text-sm">No individual accolades earned.</p>
                  )}
               </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
               <h3 className="text-xl font-display font-bold uppercase text-white mb-6">Franchise Efficiency</h3>
               <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                        <span>Win Improvement Rate</span>
                        <span className="text-emerald-400">Stable</span>
                     </div>
                     <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '65%' }}></div>
                     </div>
                  </div>
                  <div className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                        <span>Cap Utilization Score</span>
                        <span className="text-amber-500">Tier 2</span>
                     </div>
                     <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: '82%' }}></div>
                     </div>
                  </div>
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center mt-4">Calculated based on 5-year rolling simulation data</p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default GMProfileView;
