import React, { useMemo, useState } from 'react';
import { Team, Conference, RivalryStats } from '../types';
import TeamBadge from './TeamBadge';

interface StandingsProps {
  teams: Team[];
  userTeamId: string;
  seasonLength: number;
  playoffFormat: number;
  season: number;
  isPlayoffs?: boolean;
  onViewRoster: (teamId: string) => void;
  onManageTeam: (teamId: string) => void;
  rivalryHistory?: RivalryStats[];
}

type ClinchStatus = 'z' | 'x' | 'e' | null;

interface TeamRow {
  team: Team;
  gb: string;
  gamesRemaining: number;
  clinch: ClinchStatus;
}

const ClinchBadge: React.FC<{ status: ClinchStatus }> = ({ status }) => {
  if (!status) return null;
  const cfg = {
    z: { label: 'z', title: 'Clinched #1 Seed',        cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
    x: { label: 'x', title: 'Clinched Playoff Berth',  cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
    e: { label: 'e', title: 'Eliminated from Playoffs', cls: 'bg-slate-700/60 text-slate-500 border-slate-600/40' },
  }[status];
  return (
    <span
      title={cfg.title}
      className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded border ${cfg.cls} leading-none cursor-help shrink-0`}
    >
      {cfg.label}
    </span>
  );
};

const Standings: React.FC<StandingsProps> = ({
  teams, userTeamId, seasonLength, playoffFormat, season, isPlayoffs = false,
  onViewRoster, onManageTeam, rivalryHistory = [],
}) => {
  const [showTiebreakers, setShowTiebreakers] = useState(false);

  /** Current-season H2H between two teams. Returns null if no games played yet. */
  const getSeasonH2H = (a: Team, b: Team) => {
    const r = rivalryHistory.find(
      r => (r.team1Id === a.id && r.team2Id === b.id) || (r.team1Id === b.id && r.team2Id === a.id)
    );
    if (!r?.seasonH2H) return null;
    const aWins = r.team1Id === a.id ? r.seasonH2H.team1Wins : r.seasonH2H.team2Wins;
    const bWins = r.team1Id === a.id ? r.seasonH2H.team2Wins : r.seasonH2H.team1Wins;
    if (aWins + bWins === 0) return null;
    return { aWins, bWins };
  };

  const playoffSpotsPerConf = Math.floor(playoffFormat / 2);

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
      // Last team that would make playoffs (0-indexed)
      const lastPlayoffTeam = confTeams[playoffSpotsPerConf - 1] ?? leader;
      // First team outside playoffs
      const firstOut = confTeams[playoffSpotsPerConf] ?? null;

      const rows: TeamRow[] = confTeams.map((t, idx) => {
        const gb = leader
          ? ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2
          : 0;
        const gamesRemaining = Math.max(0, seasonLength - (t.wins + t.losses));

        let clinch: ClinchStatus = null;

        // #1 seed (z): even if 2nd place wins every remaining game, can't catch leader
        if (idx === 0 && confTeams.length > 1) {
          const secondPlace = confTeams[1];
          const secondMax = secondPlace.wins + Math.max(0, seasonLength - (secondPlace.wins + secondPlace.losses));
          if (t.wins > secondMax) clinch = 'z';
        }

        // Playoff clinch (x): team's wins already exceed the max possible wins of firstOut
        if (!clinch && idx < playoffSpotsPerConf && firstOut) {
          const firstOutMax = firstOut.wins + Math.max(0, seasonLength - (firstOut.wins + firstOut.losses));
          if (t.wins > firstOutMax) clinch = 'x';
        }

        // Eliminated (e): even winning every remaining game, can't reach last playoff team's current wins
        if (!clinch && idx >= playoffSpotsPerConf) {
          if (t.wins + gamesRemaining < lastPlayoffTeam.wins) clinch = 'e';
        }

        return { team: t, gb: idx === 0 ? '–' : gb.toFixed(1), gamesRemaining, clinch };
      });

      return { conference: conf, rows };
    });
  }, [teams, seasonLength, playoffSpotsPerConf]);

  const ConferenceTable = ({ conference, rows }: { conference: Conference; rows: TeamRow[]; key?: string }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl mb-12">
      <div className="p-6 border-b border-slate-800 bg-slate-800/30">
        <h2 className="text-2xl font-display font-bold uppercase tracking-tight text-white flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${conference === 'Eastern' ? 'bg-blue-500' : 'bg-red-500'}`} />
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
              <th className="px-6 py-4 text-center">REM</th>
              <th className="px-6 py-4 text-center">Conf</th>
              <th className="px-6 py-4 text-center">Home</th>
              <th className="px-6 py-4 text-center">Road</th>
              <th className="px-6 py-4 text-center">L10</th>
              <th className="px-6 py-4 text-center">Streak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {rows.map(({ team: t, gb, gamesRemaining, clinch }, idx) => {
              const pct = t.wins / (t.wins + t.losses || 1);
              const nextRow = rows[idx + 1];
              const tiedBelow = nextRow != null &&
                (nextRow.team.wins / (nextRow.team.wins + nextRow.team.losses || 1)) === pct;
              const h2hBelow = tiedBelow ? getSeasonH2H(t, nextRow.team) : null;
              return (
              <tr
                key={t.id}
                className={`group transition-all hover:bg-slate-800/30 ${
                  t.id === userTeamId ? 'bg-amber-500/[0.05]' : ''
                } ${clinch === 'e' ? 'opacity-60' : ''}`}
              >
                {/* Rank */}
                <td className="px-6 py-5">
                  <span className={`font-display font-bold text-lg ${idx < playoffSpotsPerConf ? 'text-amber-500' : 'text-slate-600'}`}>
                    {idx + 1}
                  </span>
                </td>

                {/* Team name + clinch badge + H2H tiebreaker */}
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4 cursor-pointer group/team" onClick={() => onManageTeam(t.id)}>
                    <TeamBadge team={t} size="sm" />
                    <div>
                      <div className="flex items-center">
                        <span className={`font-display font-bold uppercase ${t.id === userTeamId ? 'text-amber-500' : 'text-slate-100 group-hover/team:text-amber-500'} transition-colors`}>
                          {t.city} {t.name}
                        </span>
                        <ClinchBadge status={clinch} />
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">{t.division}</div>
                      {h2hBelow && (
                        <div className={`mt-0.5 text-[9px] font-black uppercase tracking-wide ${
                          h2hBelow.aWins > h2hBelow.bWins ? 'text-emerald-400'
                          : h2hBelow.aWins < h2hBelow.bWins ? 'text-rose-400'
                          : 'text-amber-400'
                        }`}>
                          H2H {h2hBelow.aWins}–{h2hBelow.bWins} vs {nextRow.team.abbreviation}
                          {h2hBelow.aWins > h2hBelow.bWins ? ' ▲' : h2hBelow.aWins < h2hBelow.bWins ? ' ▼' : ' ='}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-6 py-5 text-center font-mono font-bold text-slate-300">{t.wins}-{t.losses}</td>
                <td className="px-6 py-5 text-center font-mono text-sm text-slate-400">
                  {(t.wins / (t.wins + t.losses || 1)).toFixed(3)}
                </td>
                <td className="px-6 py-5 text-center font-mono font-bold text-slate-300">{gb}</td>
                <td className="px-6 py-5 text-center font-mono text-xs text-slate-500">{gamesRemaining}</td>
                <td className="px-6 py-5 text-center font-mono text-xs text-slate-500">{t.confWins || 0}-{t.confLosses || 0}</td>
                <td className="px-6 py-5 text-center font-mono text-xs text-slate-500">{t.homeWins || 0}-{t.homeLosses || 0}</td>
                <td className="px-6 py-5 text-center font-mono text-xs text-slate-500">{t.roadWins || 0}-{t.roadLosses || 0}</td>
                <td className="px-6 py-5 text-center">
                  <div className="flex justify-center gap-0.5">
                    {t.lastTen.map((res: string, i: number) => (
                      <div key={i} className={`w-1 h-3 rounded-full ${res === 'W' ? 'bg-emerald-500' : 'bg-rose-500'} opacity-70`} title={res} />
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
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Playoff cutline divider hint */}
      <div className="px-6 py-2 bg-slate-950/40 border-t border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-600">
        Top {playoffSpotsPerConf} advance · {seasonLength}-game season
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tight text-white">League Standings</h1>
          <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-[0.2em]">Live update of the playoff race</p>
        </div>

        {/* Legend + Tiebreaker toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase text-slate-500">
            <span className="w-2 h-2 bg-amber-500 rounded-full" />Playoff Berth
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase">
            <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded border bg-amber-500/20 text-amber-400 border-amber-500/40">z</span>
            <span className="text-slate-500">#1 Seed</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase">
            <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded border bg-emerald-500/20 text-emerald-400 border-emerald-500/40">x</span>
            <span className="text-slate-500">Clinched</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase">
            <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded border bg-slate-700/60 text-slate-500 border-slate-600/40">e</span>
            <span className="text-slate-500">Eliminated</span>
          </div>
          <button
            onClick={() => setShowTiebreakers(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:text-amber-400 transition-all"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-600 text-[9px] font-black text-slate-500">i</span>
            Tiebreakers
          </button>
        </div>
      </div>

      {/* Tiebreaker panel */}
      {showTiebreakers && (
        <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em]">
              Tiebreaker Order — {season} Season
            </h3>
            <button onClick={() => setShowTiebreakers(false)} className="text-slate-600 hover:text-slate-400 text-lg leading-none">×</button>
          </div>
          <ol className="space-y-2">
            {[
              'Head-to-head record between tied teams',
              'Division record (if teams are in same division)',
              'Conference record',
              'Record vs. top-10 conference teams',
              'Point differential (capped at ±12 per game)',
              'Coin flip',
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-3 text-xs text-slate-400">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500">
                  {i + 1}
                </span>
                {rule}
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-slate-600 pt-1">
            Tiebreakers are applied sequentially. If still tied after all criteria, the coin flip determines seeding.
          </p>
        </div>
      )}

      {/* Conference tables */}
      <div className="grid grid-cols-1 gap-4">
        {sortedConferences.map(({ conference, rows }) => (
          <ConferenceTable key={conference} conference={conference} rows={rows} />
        ))}
      </div>
    </div>
  );
};

export default Standings;
