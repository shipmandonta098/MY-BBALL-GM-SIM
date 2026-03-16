
import React, { useState } from 'react';
import { LeagueState, GMProfile } from '../types';
import TeamBadge from './TeamBadge';

interface CareerProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
}

const STYLE_OPTIONS = ['Offense', 'Defense', 'Balanced'] as const;

const STYLE_META: Record<string, { color: string; icon: string; desc: string }> = {
  Offense:  { color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', icon: '🏹', desc: 'Run-and-gun, high-scoring system' },
  Defense:  { color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',       icon: '🛡️', desc: 'Lock-down, grind-it-out philosophy' },
  Balanced: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: '⚖️', desc: 'Adaptable, two-way approach' },
};

const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 flex flex-col gap-1">
    <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{label}</span>
    <span className="text-4xl font-display font-bold text-amber-400 leading-none">{value}</span>
    {sub && <span className="text-xs text-slate-500 mt-0.5">{sub}</span>}
  </div>
);

const Career: React.FC<CareerProps> = ({ league, updateLeague }) => {
  const profile = league.gmProfile;
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);

  const saveName = () => {
    updateLeague({ gmProfile: { ...profile, name: draftName } });
    setIsEditingName(false);
  };

  const setStyle = (style: typeof STYLE_OPTIONS[number]) => {
    updateLeague({ gmProfile: { ...profile, preferredStyle: style } });
  };

  // ── Derived career stats ──────────────────────────────────────────────────
  const champCount = league.championshipHistory?.filter(c => c.championId === league.userTeamId).length ?? 0;
  const finalsTrips = profile.finalsAppearances ?? champCount; // fall back to champs if not tracked
  const totalW = profile.careerWins ?? userTeam.wins;
  const totalL = profile.careerLosses ?? userTeam.losses;
  const gp = totalW + totalL;
  const winPctNum = gp > 0 ? totalW / gp : 0;
  const winPctStr = `${(winPctNum * 100).toFixed(1)}%`;

  const eoyCount  = profile.eoyWins?.length ?? 0;
  const seasons   = profile.totalSeasons ?? 1;

  // Reputation tier
  const repTier =
    profile.reputation >= 90 ? { label: 'Hall of Fame', color: 'text-amber-400' } :
    profile.reputation >= 75 ? { label: 'Elite Executive', color: 'text-orange-400' } :
    profile.reputation >= 55 ? { label: 'Respected GM', color: 'text-sky-400' } :
    profile.reputation >= 35 ? { label: 'On the Rise', color: 'text-emerald-400' } :
    { label: 'Proving Ground', color: 'text-slate-400' };

  // Milestone type display
  const milestoneIcon = (type: string) => {
    switch (type) {
      case 'title':     return { icon: '🏆', color: 'bg-amber-500' };
      case 'award':     return { icon: '🥇', color: 'bg-emerald-500' };
      case 'firing':    return { icon: '🔥', color: 'bg-rose-500' };
      case 'trade':     return { icon: '🔄', color: 'bg-blue-500' };
      case 'signing':   return { icon: '✍️', color: 'bg-violet-500' };
      default:          return { icon: '📌', color: 'bg-slate-600' };
    }
  };

  const milestones = [...(profile.milestones ?? [])].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.day - a.day,
  );

  const currentStyle = profile.preferredStyle;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          {/* Avatar + rep badge */}
          <div className="relative shrink-0">
            <div className="w-36 h-36 bg-slate-800 rounded-[2rem] border-4 border-slate-700 overflow-hidden shadow-2xl">
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.avatarSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`}
                className="w-full h-full object-cover"
                alt="GM Avatar"
              />
            </div>
            <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-slate-950 font-display font-black text-lg shadow-xl border-4 border-slate-900">
              {profile.reputation}
            </div>
          </div>

          {/* Name + team + tier */}
          <div className="flex-1 text-center md:text-left">
            {isEditingName ? (
              <div className="flex gap-2 items-center justify-center md:justify-start">
                <input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  className="bg-slate-950 border border-amber-500/50 rounded-xl px-4 py-2 text-2xl font-display font-bold text-white focus:outline-none"
                />
                <button onClick={saveName} className="px-4 py-2 bg-emerald-500 text-slate-950 rounded-xl font-bold text-sm">Save</button>
                <button onClick={() => setIsEditingName(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-xl font-bold text-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 justify-center md:justify-start group">
                <h1 className="text-5xl font-display font-bold uppercase tracking-tight text-white">{profile.name}</h1>
                <button onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-amber-500 transition-all text-sm">
                  ✎
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-3 justify-center md:justify-start">
              <TeamBadge team={userTeam} size="sm" />
              <span className={`text-sm font-bold ${repTier.color}`}>{repTier.label}</span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400">{seasons} season{seasons !== 1 ? 's' : ''} managed</span>
            </div>

            {/* Preferred Style picker */}
            <div className="mt-5 flex flex-wrap gap-2 justify-center md:justify-start">
              {STYLE_OPTIONS.map(style => {
                const meta = STYLE_META[style];
                const active = currentStyle === style;
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
              {currentStyle && (
                <span className="self-center text-xs text-slate-500 italic">{STYLE_META[currentStyle].desc}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Career Stats Grid ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 px-1">Career Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Seasons"        value={seasons} />
          <StatCard label="Win %"          value={winPctStr} sub={`${totalW}W – ${totalL}L`} />
          <StatCard label="Championships"  value={champCount} sub={champCount === 1 ? 'title' : 'titles'} />
          <StatCard label="Finals Trips"   value={finalsTrips} sub="appearances" />
          <StatCard label="Exec. of Year"  value={eoyCount} sub="EOY awards" />
          <StatCard label="Reputation"     value={profile.reputation} sub={repTier.label} />
        </div>
      </div>

      {/* ── Championship Banner ─────────────────────────────────────────────── */}
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

      {/* ── Awards Timeline ─────────────────────────────────────────────────── */}
      {eoyCount > 0 && (
        <div>
          <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 px-1">Executive of the Year</h2>
          <div className="flex flex-wrap gap-3">
            {profile.eoyWins.map(yr => (
              <div key={yr} className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-3 flex items-center gap-3">
                <span className="text-2xl">🥇</span>
                <div>
                  <p className="text-emerald-400 font-display font-bold text-lg">Season {yr}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Exec. of the Year</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Career Milestones Timeline ──────────────────────────────────────── */}
      <div>
        <h2 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 px-1">Career Timeline</h2>
        {milestones.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center text-slate-600 text-sm">
            No career milestones recorded yet. Keep simming!
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-7 top-0 bottom-0 w-px bg-slate-800 pointer-events-none" />

            <div className="space-y-4">
              {milestones.map(m => {
                const { icon, color } = milestoneIcon(m.type);
                const mTeam = m.teamId ? league.teams.find(t => t.id === m.teamId) : null;
                return (
                  <div key={m.id} className="flex items-start gap-5 pl-2">
                    {/* Dot */}
                    <div className={`relative z-10 shrink-0 w-10 h-10 rounded-2xl ${color} flex items-center justify-center text-lg shadow-lg`}>
                      {icon}
                    </div>

                    {/* Card */}
                    <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-200 font-medium leading-snug">{m.text}</p>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Season {m.year}</p>
                          <p className="text-[9px] text-slate-600">Day {m.day}</p>
                        </div>
                      </div>
                      {mTeam && (
                        <div className="mt-2">
                          <TeamBadge team={mTeam} size="xs" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default Career;
