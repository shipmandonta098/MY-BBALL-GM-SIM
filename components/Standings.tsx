import React, { useMemo } from 'react';
import { Team, Conference } from '../types';
import TeamBadge from './TeamBadge';

interface StandingsProps {
  teams: Team[];
  userTeamId: string;
  onViewRoster: (teamId: string) => void;
  onManageTeam: (teamId: string) => void;
}

const Standings: React.FC<StandingsProps> = ({ teams, userTeamId, onViewRoster, onManageTeam }) => {
  const sortedConferences = useMemo(() => {
    const conferences: Conference[] = ['Eastern', 'Western'];
    
    return conferences.map(conf => {
      const confTeams = teams
        .filter(t => t.conference === conf)
        .sort((a, b) => {
          const aPct = a.wins / (a.wins + a.losses || 1);
          const bPct = b.wins / (b.wins + b.losses || 1);
          if (aPct !== bPct) return bPct - aPct;
          return b.wins - a.wins;
        });

      const leader = confTeams[0];
      
      return {
        conference: conf,
        teams: confTeams.map(t => {
          const gb = leader ? ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2 : 0;
          return { ...t, gb: gb === 0 ? '-' : gb.toFixed(1) };
        })
      };
    });
  }, [teams]);

  const ConferenceTable = ({ conference, teams }: { conference: Conference, teams: any[], key?: string }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl mb-12">
      <div className="p-6 border-b border-slate-800 bg-slate-800/30">
        <h2 className="text-2xl font-display font-bold uppercase tracking-tight text-white flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${conference === 'Eastern' ? 'bg-blue-500' : 'bg-red-500'}`}></span>
          {conference} Conference
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800 bg-slate-950/20">
              <th className="px-6 py-4">Rank</th>
              <th className="px-6 py-4">Team</th>
              <th className="px-6 py-4 text-center">W-L</th>
              <th className="px-6 py-4 text-center">Win%</th>
              <th className="px-6 py-4 text-center">GB</th>
              <th className="px-6 py-4 text-center">Conf</th>
              <th className="px-6 py-4 text-center">Home</th>
              <th className="px-6 py-4 text-center">Road</th>
              <th className="px-6 py-4 text-center">L10</th>
              <th className="px-6 py-4 text-center">Streak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {teams.map((t, idx) => (
              <tr 
                key={t.id} 
                className={`group transition-all hover:bg-slate-800/30 ${t.id === userTeamId ? 'bg-amber-500/[0.05]' : ''}`}
              >
                <td className="px-6 py-5">
                  <span className={`font-display font-bold text-lg ${idx < 8 ? 'text-amber-500' : 'text-slate-600'}`}>
                    {idx + 1}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <div 
                    className="flex items-center gap-4 cursor-pointer group/team"
                    onClick={() => onManageTeam(t.id)}
                  >
                    <TeamBadge team={t} size="sm" />
                    <div>
                      <div className={`font-display font-bold uppercase ${t.id === userTeamId ? 'text-amber-500' : 'text-slate-100 group-hover:text-amber-500'} transition-colors`}>
                        {t.city} {t.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">{t.division}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5 text-center font-mono font-bold text-slate-300">{t.wins}-{t.losses}</td>
                <td className="px-6 py-5 text-center font-mono text-sm text-slate-400">
                  {(t.wins / (t.wins + t.losses || 1)).toFixed(3)}
                </td>
                <td className="px-6 py-5 text-center font-mono font-bold text-slate-300">{t.gb}</td>
                <td className="px-6 py-5 text-center font-mono text-xs text-slate-500">{t.confWins || 0}-{t.confLosses || 0}</td>
                <td className="px-6 py-5 text-center font-mono text-xs text-slate-500">{t.homeWins || 0}-{t.homeLosses || 0}</td>
                <td className="px-6 py-5 text-center font-mono text-xs text-slate-500">{t.roadWins || 0}-{t.roadLosses || 0}</td>
                <td className="px-6 py-5 text-center">
                  <div className="flex justify-center gap-0.5">
                    {t.lastTen.map((res: string, i: number) => (
                      <div 
                        key={i} 
                        className={`w-1 h-3 rounded-full ${res === 'W' ? 'bg-emerald-500' : 'bg-rose-500'} opacity-70`}
                        title={res}
                      ></div>
                    ))}
                    {t.lastTen.length === 0 && <span className="text-slate-600 font-mono text-xs">-</span>}
                  </div>
                  <div className="text-[9px] font-black text-slate-600 mt-1 uppercase">
                    {t.lastTen.filter((r: string) => r === 'W').length}-{t.lastTen.filter((r: string) => r === 'L').length}
                  </div>
                </td>
                <td className="px-6 py-5 text-center">
                  <span className={`text-xs font-black uppercase px-2 py-0.5 rounded ${t.streak >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                    {t.streak >= 0 ? `W${t.streak}` : `L${Math.abs(t.streak)}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tight text-white">League Standings</h1>
          <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-[0.2em]">Live update of the playoff race</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
             <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
             Playoff Berth
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sortedConferences.map(confData => (
          <ConferenceTable 
            key={confData.conference} 
            conference={confData.conference} 
            teams={confData.teams} 
          />
        ))}
      </div>
    </div>
  );
};

export default Standings;