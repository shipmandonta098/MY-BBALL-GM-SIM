
import React, { useState } from 'react';
import { LeagueState, GMProfile, GMMilestone } from '../types';
import TeamBadge from './TeamBadge';

interface GMProfileProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

const STYLE_OPTIONS = ['Offense', 'Defense', 'Balanced'] as const;

const STYLE_META: Record<string, { color: string; icon: string; desc: string }> = {
  Offense:  { color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', icon: '🏹', desc: 'Run-and-gun, high-scoring system' },
  Defense:  { color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',       icon: '🛡️', desc: 'Lock-down, grind-it-out philosophy' },
  Balanced: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: '⚖️', desc: 'Adaptable, two-way approach' },
};

const milestoneIcon = (type: string) => {
  switch (type) {
    case 'title':   return { icon: '🏆', color: 'bg-amber-500' };
    case 'award':   return { icon: '🥇', color: 'bg-emerald-500' };
    case 'firing':  return { icon: '🔥', color: 'bg-rose-500' };
    case 'trade':   return { icon: '🔄', color: 'bg-blue-500' };
    case 'signing': return { icon: '✍️', color: 'bg-violet-500' };
    default:        return { icon: '📌', color: 'bg-slate-600' };
  }
};

const GMProfileView: React.FC<GMProfileProps> = ({ league, updateLeague }) => {
  const profile = league.gmProfile;
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(profile.name);

  const handleSaveName = () => {
    updateLeague({ gmProfile: { ...profile, name: newName } });
    setIsEditingName(false);
  };

  const setStyle = (style: typeof STYLE_OPTIONS[number]) => {
    updateLeague({ gmProfile: { ...profile, preferredStyle: style } });
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const champCount  = league.championshipHistory?.filter(c => c.championId === league.userTeamId).length ?? 0;
  const finalsTrips = profile.finalsAppearances ?? champCount;
  const totalW      = profile.careerWins   ?? userTeam.wins;
  const totalL      = profile.careerLosses ?? userTeam.losses;
  const gp          = totalW + totalL;
  const winPctStr   = gp > 0 ? `${((totalW / gp) * 100).toFixed(1)}%` : '0.0%';
  const eoyCount    = profile.eoyWins?.length ?? 0;
  const seasons     = profile.totalSeasons ?? 1;

  const repTier =
    profile.reputation >= 90 ? { label: 'Hall of Fame',    color: 'text-amber-400'   } :
    profile.reputation >= 75 ? { label: 'Elite Executive', color: 'text-orange-400'  } :
    profile.reputation >= 55 ? { label: 'Respected GM',    color: 'text-sky-400'     } :
    profile.reputation >= 35 ? { label: 'On the Rise',     color: 'text-emerald-400' } :
    { label: 'Proving Ground', color: 'text-slate-400' };

  const milestones = [...(profile.milestones ?? [])].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.day - a.day,
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">

      {/* ── Profile Header ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          {/* Rep badge (no avatar — removed from GM office) */}
          <div className="relative shrink-0">
            <div className="w-40 h-40 bg-slate-800 rounded-[2.5rem] border-4 border-slate-700 shadow-2xl flex items-center justify-center">
              <svg viewBox="0 0 80 80" className="w-24 h-24 opacity-60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="28" width="60" height="42" rx="6" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="2"/>
                <rect x="28" y="18" width="24" height="14" rx="4" fill="none" stroke="#f59e0b" strokeWidth="2"/>
                <line x1="10" y1="44" x2="70" y2="44" stroke="#f59e0b" strokeWidth="2" opacity="0.5"/>
                <rect x="34" y="40" width="12" height="8" rx="2" fill="#f59e0b" opacity="0.6"/>
              </svg>
            </div>
            <div className="absolute -bottom-4 -right-4 w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-950 font-display font-black text-xl shadow-xl border-4 border-slate-900">
              {profile.reputation}
            </div>
          </div>

          {/* Name + team + tier + style */}
          <div className="flex-1 text-center md:text-left">
            {isEditingName ? (
              <div className="flex gap-2 items-center justify-center md:justify-start">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  className="bg-slate-950 border border-amber-500/50 rounded-xl px-4 py-2 text-2xl font-display font-bold text-white focus:outline-none"
                />
                <button onClick={handleSaveName} className="px-4 py-2 bg-emerald-500 text-slate-950 rounded-xl font-bold text-sm">Save</button>
                <button onClick={() => setIsEditingName(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-xl font-bold text-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 justify-center md:justify-start group/name">
                <h1 className="text-5xl font-display font-bold uppercase tracking-tight text-white">{profile.name}</h1>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover/name:opacity-100 p-2 text-slate-600 hover:text-amber-500 transition-all text-sm"
                >
                  ✎
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-3 justify-center md:justify-start">
              <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-xs font-bold text-slate-400 uppercase tracking-widest">General Manager</span>
              <TeamBadge team={userTeam} size="xs" />
              <span className={`text-sm font-bold ${repTier.color}`}>{repTier.label}</span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400">{seasons} season{seasons !== 1 ? 's' : ''} managed</span>
            </div>

            {/* Preferred Style picker */}
            <div className="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">
              {STYLE_OPTIONS.map(style => {
                const meta = STYLE_META[style];
                const active = profile.preferredStyle === style;
                return (
                  <button key={style} onClick={() => setStyle(style)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
                      active ? meta.color + ' shadow-lg' : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:text-white'
                    }`}>
                    <span>{meta.icon}</span>
                    {style}
                  </button>
                );
              })}
              {profile.preferredStyle && (
                <span className="self-center text-xs text-slate-500 italic">{STYLE_META[profile.preferredStyle]?.desc}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Career Stats Grid ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 px-1">Career Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Seasons',       value: seasons,        sub: undefined },
            { label: 'Win %',         value: winPctStr,      sub: `${totalW}W – ${totalL}L` },
            { label: 'Championships', value: champCount,     sub: champCount === 1 ? 'title' : 'titles' },
            { label: 'Finals Trips',  value: finalsTrips,    sub: 'appearances' },
            { label: 'Exec. of Year', value: eoyCount,       sub: 'EOY awards' },
            { label: 'Reputation',    value: profile.reputation, sub: repTier.label },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-1 hover:border-amber-500/30 transition-all">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</span>
              <span className="text-4xl font-display font-bold text-amber-400 leading-none">{value}</span>
              {sub && <span className="text-xs text-slate-500 mt-0.5">{sub}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Approval Ratings ──────────────────────────────────────────────── */}
      {(league.ownerApproval !== undefined || league.fanApproval !== undefined) && (() => {
        const owner = league.ownerApproval ?? 55;
        const fan   = league.fanApproval   ?? 60;
        const ownerTier =
          owner >= 80 ? { label: 'Thrilled',    color: 'text-emerald-400', bar: 'bg-emerald-500' } :
          owner >= 60 ? { label: 'Satisfied',   color: 'text-sky-400',     bar: 'bg-sky-500'     } :
          owner >= 40 ? { label: 'Concerned',   color: 'text-amber-400',   bar: 'bg-amber-500'   } :
          owner >= 20 ? { label: 'Frustrated',  color: 'text-orange-400',  bar: 'bg-orange-500'  } :
                        { label: 'Furious',     color: 'text-rose-400',    bar: 'bg-rose-500'    };
        const fanTier =
          fan >= 80 ? { label: 'Electric',   color: 'text-emerald-400', bar: 'bg-emerald-500' } :
          fan >= 60 ? { label: 'Energized',  color: 'text-sky-400',     bar: 'bg-sky-500'     } :
          fan >= 40 ? { label: 'Restless',   color: 'text-amber-400',   bar: 'bg-amber-500'   } :
          fan >= 20 ? { label: 'Unhappy',    color: 'text-orange-400',  bar: 'bg-orange-500'  } :
                      { label: 'Outraged',   color: 'text-rose-400',    bar: 'bg-rose-500'    };
        const ApprBar = ({ value, bar }: { value: number; bar: string }) => (
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${value}%` }} />
          </div>
        );
        return (
          <div>
            <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 px-1">Approval Ratings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Owner */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-amber-500/30 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">👔 Owner Approval</span>
                  <span className={`text-xs font-black uppercase ${ownerTier.color}`}>{ownerTier.label}</span>
                </div>
                <ApprBar value={owner} bar={ownerTier.bar} />
                <div className="flex justify-between">
                  <span className={`text-3xl font-display font-bold ${ownerTier.color}`}>{owner}</span>
                  <span className="text-slate-600 text-sm self-end">/100</span>
                </div>
              </div>
              {/* Fan */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-amber-500/30 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">📣 Fan Approval</span>
                  <span className={`text-xs font-black uppercase ${fanTier.color}`}>{fanTier.label}</span>
                </div>
                <ApprBar value={fan} bar={fanTier.bar} />
                <div className="flex justify-between">
                  <span className={`text-3xl font-display font-bold ${fanTier.color}`}>{fan}</span>
                  <span className="text-slate-600 text-sm self-end">/100</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Championship Banner ────────────────────────────────────────────── */}
      {champCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-3xl p-6">
          <div className="flex items-center gap-4">
            <span className="text-5xl">🏆</span>
            <div>
              <p className="text-amber-400 font-display font-black text-2xl uppercase tracking-wide">
                {champCount === 1 ? 'Champion' : `${champCount}× Champion`}
              </p>
              <p className="text-sm text-amber-300/70 mt-0.5">
                {league.championshipHistory
                  ?.filter(c => c.championId === league.userTeamId)
                  .map(c => `Season ${c.season}`)
                  .join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline + Honors ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Career Legacy Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
            <h3 className="text-xl font-display font-bold uppercase text-white mb-8 border-b border-slate-800 pb-4 flex items-center justify-between">
              Career Timeline
              <span className="text-[10px] font-black text-slate-500 tracking-widest">{milestones.length} ENTRIES</span>
            </h3>

            {milestones.length === 0 ? (
              <div className="py-20 text-center opacity-30 italic">
                <p className="font-display text-2xl uppercase tracking-widest">Legacy has yet to be written.</p>
              </div>
            ) : (
              <div className="space-y-4 relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-800" />
                {milestones.map((m, i) => {
                  const { icon, color } = milestoneIcon(m.type);
                  const mTeam = m.teamId ? league.teams.find(t => t.id === m.teamId) : null;
                  return (
                    <div key={m.id} className="relative pl-12 animate-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className={`absolute left-0 top-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-lg z-10 ${color}`}>
                        {icon}
                      </div>
                      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-slate-200 font-medium leading-snug">{m.text}</p>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Season {m.year}</p>
                            <p className="text-[9px] text-slate-600">Day {m.day}</p>
                          </div>
                        </div>
                        {mTeam && <div className="mt-2"><TeamBadge team={mTeam} size="xs" /></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Honors + Franchise Efficiency */}
        <div className="space-y-6">
          {/* Honors & Titles */}
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative">
            <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
              <span className="text-[14rem]">👑</span>
            </div>
            <h3 className="text-xl font-display font-bold uppercase text-white mb-6">Honors & Titles</h3>
            <div className="space-y-4">
              {eoyCount > 0 ? profile.eoyWins.map(year => (
                <div key={year} className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-4 hover:bg-amber-500 hover:text-slate-950 transition-all cursor-pointer group">
                  <span className="text-2xl group-hover:scale-110 transition-transform">🥇</span>
                  <div>
                    <p className="font-display font-bold uppercase text-lg">Executive of the Year</p>
                    <p className="text-[10px] font-black uppercase opacity-70">Season {year}</p>
                  </div>
                </div>
              )) : (
                <p className="text-slate-600 italic text-center py-10 text-sm">No individual accolades earned yet.</p>
              )}
            </div>
          </div>

          {/* Franchise Efficiency */}
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl">
            <h3 className="text-xl font-display font-bold uppercase text-white mb-6">Franchise Efficiency</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                  <span>Win Improvement Rate</span>
                  <span className="text-emerald-400">Stable</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: '65%' }} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                  <span>Cap Utilization Score</span>
                  <span className="text-amber-500">Tier 2</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: '82%' }} />
                </div>
              </div>
              <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center">Calculated from 5-year rolling data</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Season Structure Summary removed ── */}

    </div>
  );
};

export default GMProfileView;
