import React, { useMemo, useState } from 'react';
import { LeagueState } from '../types';
import TeamBadge from './TeamBadge';
import { teamSeasonAttendance } from '../utils/attendanceEngine';

interface AttendanceProps {
  league: LeagueState;
  onManageTeam?: (teamId: string) => void;
}

type SortKey = 'rank' | 'homeGames' | 'totalAttendance' | 'avgAttendance' | 'capacityPct';

const fmt = (n: number) => n.toLocaleString('en-US');
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : fmt(n);

const Attendance: React.FC<AttendanceProps> = ({ league, onManageTeam }) => {
  const [sortKey, setSortKey] = useState<SortKey>('avgAttendance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    return league.teams.map(team => {
      const { homeGames, totalAttendance, avgAttendance, capacityPct } =
        teamSeasonAttendance(team, league.schedule);
      return { team, homeGames, totalAttendance, avgAttendance, capacityPct };
    });
  }, [league.teams, league.schedule]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey === 'rank' ? 'avgAttendance' : sortKey] as number;
      const bv = b[sortKey === 'rank' ? 'avgAttendance' : sortKey] as number;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [rows, sortKey, sortDir]);

  const leagueTotal = rows.reduce((s, r) => s + r.totalAttendance, 0);
  const leagueAvg = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.avgAttendance, 0) / rows.length)
    : 0;
  const gamesPlayed = rows.reduce((s, r) => s + r.homeGames, 0);

  const userRow = sorted.find(r => r.team.id === league.userTeamId);
  const userRank = sorted.findIndex(r => r.team.id === league.userTeamId) + 1;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortBtn: React.FC<{ k: SortKey; label: string; right?: boolean }> = ({ k, label, right }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-3 py-3 text-[10px] font-black uppercase tracking-widest cursor-pointer select-none whitespace-nowrap transition-colors ${
        sortKey === k ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'
      } ${right ? 'text-right' : 'text-left'}`}
    >
      {label}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  const capacityColor = (pct: number) =>
    pct >= 95 ? 'text-emerald-400' :
    pct >= 80 ? 'text-amber-400' :
    pct >= 60 ? 'text-slate-300' : 'text-rose-400';

  const trendArrow = (avg: number) =>
    avg > leagueAvg + 2000 ? '↑' :
    avg < leagueAvg - 2000 ? '↓' : '→';

  const trendColor = (avg: number) =>
    avg > leagueAvg + 2000 ? 'text-emerald-400' :
    avg < leagueAvg - 2000 ? 'text-rose-400' : 'text-slate-500';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* League Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'League Total', value: fmtM(leagueTotal), sub: 'season fans' },
          { label: 'League Avg', value: fmt(leagueAvg), sub: 'per game' },
          { label: 'Home Games', value: fmt(gamesPlayed), sub: 'played' },
          { label: 'Sellouts', value: fmt(rows.filter(r => r.capacityPct >= 99).length), sub: 'teams near capacity' },
        ].map(card => (
          <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{card.label}</p>
            <p className="text-2xl font-display font-black text-white">{card.value}</p>
            <p className="text-[10px] text-slate-600 font-bold mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Your Team Spotlight */}
      {userRow && userRow.homeGames > 0 && (
        <div
          className="border rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5"
          style={{
            background: `${userRow.team.primaryColor}12`,
            borderColor: `${userRow.team.primaryColor}40`,
          }}
        >
          <TeamBadge team={userRow.team} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Your Arena</p>
            <p className="text-xl font-display font-bold text-white">{userRow.team.city} {userRow.team.name}</p>
            <p className="text-xs text-slate-500 font-bold">Cap: {fmt(userRow.team.stadiumCapacity || 19_000)}</p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Rank</p>
              <p className="text-2xl font-display font-black" style={{ color: userRow.team.primaryColor }}>#{userRank}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Avg/Game</p>
              <p className="text-2xl font-display font-black text-white">{fmt(userRow.avgAttendance)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500 mb-1">% Capacity</p>
              <p className={`text-2xl font-display font-black ${capacityColor(userRow.capacityPct)}`}>
                {userRow.capacityPct.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rankings Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-800 bg-slate-950/60">
              <tr>
                <SortBtn k="rank" label="#" />
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-left">Team</th>
                <SortBtn k="homeGames"       label="Home GP"   right />
                <SortBtn k="totalAttendance" label="Total"     right />
                <SortBtn k="avgAttendance"   label="Avg / Game" right />
                <SortBtn k="capacityPct"     label="% Cap"     right />
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {sorted.map((row, idx) => {
                const isUser = row.team.id === league.userTeamId;
                const rank = idx + 1;
                const noGames = row.homeGames === 0;
                return (
                  <tr
                    key={row.team.id}
                    onClick={() => onManageTeam?.(row.team.id)}
                    className={`group transition-colors cursor-pointer ${
                      isUser
                        ? 'bg-amber-500/8 hover:bg-amber-500/12'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Rank */}
                    <td className="px-3 py-3 w-10">
                      <span className={`text-sm font-display font-black ${
                        rank === 1 ? 'text-amber-400' :
                        rank === 2 ? 'text-slate-300' :
                        rank === 3 ? 'text-amber-700' : 'text-slate-600'
                      }`}>{rank}</span>
                    </td>

                    {/* Team */}
                    <td className="px-3 py-3 min-w-[160px]">
                      <div className="flex items-center gap-2.5">
                        <TeamBadge team={row.team} size="sm" />
                        <div>
                          <p className={`text-sm font-bold leading-tight ${isUser ? 'text-amber-400' : 'text-white group-hover:text-amber-400 transition-colors'}`}>
                            {row.team.city} {row.team.name}
                            {isUser && <span className="ml-1.5 text-[9px] font-black bg-amber-500 text-slate-950 px-1 py-0.5 rounded uppercase">You</span>}
                          </p>
                          <p className="text-[10px] text-slate-500 font-bold">{row.team.division}</p>
                        </div>
                      </div>
                    </td>

                    {/* Home GP */}
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm font-mono text-slate-400">{noGames ? '—' : row.homeGames}</span>
                    </td>

                    {/* Total Attendance */}
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm font-mono text-slate-300">{noGames ? '—' : fmtM(row.totalAttendance)}</span>
                    </td>

                    {/* Avg / Game */}
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm font-mono font-bold text-white">{noGames ? '—' : fmt(row.avgAttendance)}</span>
                      {!noGames && (
                        <div className="w-24 h-1 bg-slate-800 rounded-full mt-1 ml-auto">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.min(100, (row.avgAttendance / (row.team.stadiumCapacity || 19_000)) * 100)}%` }}
                          />
                        </div>
                      )}
                    </td>

                    {/* % Capacity */}
                    <td className="px-3 py-3 text-right">
                      <span className={`text-sm font-mono font-bold ${noGames ? 'text-slate-600' : capacityColor(row.capacityPct)}`}>
                        {noGames ? '—' : `${row.capacityPct.toFixed(1)}%`}
                      </span>
                    </td>

                    {/* Trend arrow */}
                    <td className="px-3 py-3 text-right">
                      <span className={`text-base font-black ${noGames ? 'text-slate-600' : trendColor(row.avgAttendance)}`}>
                        {noGames ? '—' : trendArrow(row.avgAttendance)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {gamesPlayed === 0 && (
          <div className="py-16 text-center">
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">No home games played yet</p>
            <p className="text-slate-600 text-xs mt-2">Attendance data will populate after games are simulated.</p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-right">
        Attendance factors: Market size · Win% · Fan hype · Star power · Ticket price · Home streak
      </p>
    </div>
  );
};

export default Attendance;
