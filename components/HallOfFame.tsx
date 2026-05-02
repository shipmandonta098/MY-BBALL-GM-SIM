import React, { useState, useMemo } from 'react';
import { LeagueState, HofInductee, Position } from '../types';
import { computeHofScore, computeHofProbability } from '../utils/hofEngine';

interface HallOfFameProps {
  league: LeagueState;
}

const POS_ORDER: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const hofColor = (score: number) =>
  score >= 80 ? 'text-amber-400' : score >= 60 ? 'text-emerald-400' : 'text-sky-400';

const probColor = (pct: number) =>
  pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-rose-400';

const probBg = (pct: number) =>
  pct >= 70 ? 'bg-emerald-500/10 border-emerald-500/25' :
  pct >= 40 ? 'bg-amber-500/10 border-amber-500/25' :
  'bg-rose-500/10 border-rose-500/25';

const f1 = (n: number) => n.toFixed(1);

const PageHeader: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
    <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 blur-[120px] rounded-full -mr-48 -mt-48 pointer-events-none" />
    <div className="relative z-10">
      <p className="text-[9px] font-black uppercase tracking-[0.4em] text-amber-500 mb-2">Hall of Fame</p>
      <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white leading-none">
        {title.split(' ').map((w, i, arr) =>
          i === arr.length - 1
            ? <span key={i} className="text-amber-500">{w}</span>
            : <span key={i}>{w} </span>
        )}
      </h2>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">{sub}</p>
    </div>
  </header>
);

// ─── HOF Inductee Card ──────────────────────────────────────────────────────
const InducteeCard: React.FC<{ inductee: HofInductee }> = ({ inductee: h }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-slate-900 border border-slate-800 hover:border-amber-500/30 rounded-3xl overflow-hidden transition-all cursor-pointer group"
      onClick={() => setExpanded(e => !e)}
    >
      {/* Gold accent bar */}
      <div className="h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600" />

      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Jersey number badge */}
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col items-center justify-center shrink-0">
              <span className="text-[8px] font-black uppercase text-amber-500/60 tracking-widest leading-none">#</span>
              <span className="text-lg font-display font-black text-amber-400 leading-none">{h.jerseyNumber}</span>
            </div>
            <div>
              <p className="font-display font-black text-white text-lg leading-tight">{h.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{h.position}</span>
                <span className="text-slate-700">·</span>
                <span className="text-[10px] text-slate-500">{h.primaryTeam}</span>
                {h.gender === 'Female' && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-sky-500">WNBA</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/60">Inducted</p>
            <p className="text-base font-display font-black text-amber-400">{h.yearInducted}</p>
          </div>
        </div>

        {/* Career stat line */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'PPG', value: f1(h.careerPPG) },
            { label: 'RPG', value: f1(h.careerRPG) },
            { label: 'APG', value: f1(h.careerAPG) },
          ].map(s => (
            <div key={s.label} className="bg-slate-950 rounded-xl p-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">{s.label}</div>
              <div className="font-display font-black text-base text-white mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Awards row */}
        <div className="flex flex-wrap gap-1.5">
          {h.awardsCount.mvp > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
              {h.awardsCount.mvp}× MVP
            </span>
          )}
          {h.awardsCount.dpoy > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-400">
              {h.awardsCount.dpoy}× DPOY
            </span>
          )}
          {h.awardsCount.championships > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300">
              🏆 {h.awardsCount.championships}× Champ
            </span>
          )}
          {h.awardsCount.allNbaFirst > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
              {h.awardsCount.allNbaFirst}× All-NBA 1st
            </span>
          )}
          {h.awardsCount.allNba > h.awardsCount.allNbaFirst && (
            <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              {h.awardsCount.allNba}× All-NBA
            </span>
          )}
          {h.awardsCount.allStarSelections > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              ⭐ {h.awardsCount.allStarSelections}× All-Star
            </span>
          )}
        </div>

        {/* HOF score bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">HOF Score</span>
            <span className={`text-xs font-black ${hofColor(h.hofScore)}`}>{h.hofScore}</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, h.hofScore)}%` }}
            />
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-slate-800 pt-4 space-y-4 animate-in fade-in duration-200">
            {/* Inductee note */}
            <p className="text-[11px] text-slate-400 leading-relaxed italic">"{h.inductionNote}"</p>

            {/* Extended stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'SPG', value: f1(h.careerSPG) },
                { label: 'BPG', value: f1(h.careerBPG) },
                { label: 'FG%', value: `${h.careerFGPct}%` },
                { label: 'GP', value: String(h.careerGP) },
                { label: 'Seasons', value: String(h.careerSeasons) },
                { label: 'Retired', value: String(h.yearRetired) },
              ].map(s => (
                <div key={s.label} className="bg-slate-950 rounded-xl p-2 text-center">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">{s.label}</div>
                  <div className="font-bold text-sm text-slate-300 mt-0.5">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Career game highs */}
            <div className="space-y-1.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Career Game Highs</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'PTS', value: h.careerHighs.points },
                  { label: 'REB', value: h.careerHighs.rebounds },
                  { label: 'AST', value: h.careerHighs.assists },
                  { label: 'STL', value: h.careerHighs.steals },
                  { label: 'BLK', value: h.careerHighs.blocks },
                  { label: '3PM', value: h.careerHighs.threepm },
                ].map(stat => (
                  <div key={stat.label} className="bg-slate-950 rounded-xl p-2 text-center">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">{stat.label}</div>
                    <div className="font-display font-bold text-sm text-amber-400 mt-0.5">{stat.value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Teams */}
            {h.teams.length > 1 && (
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Teams</p>
                <div className="flex flex-wrap gap-1.5">
                  {h.teams.map(t => (
                    <span
                      key={t}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        t === h.primaryTeam
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-slate-800 border-slate-700 text-slate-500'
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expand chevron */}
        <div className="flex items-center justify-center">
          <svg
            className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
};

// ─── HOF Candidate Row ─────────────────────────────────────────────────────
const CandidateRow: React.FC<{ player: any; prob: number; score: number }> = ({ player, prob, score }) => (
  <div className="flex items-center gap-4 p-3 bg-slate-900 border border-slate-800 rounded-2xl hover:border-slate-700 transition-all">
    <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
      <span className="text-[10px] font-black text-slate-400">{player.position}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-bold text-white text-sm truncate">{player.name}</p>
      <p className="text-[10px] text-slate-500 truncate">
        {player.teamName ?? 'Free Agent'} · {player.careerStats?.length ?? 0} seasons
      </p>
    </div>
    <div className="flex items-center gap-3 shrink-0">
      <div className="text-right">
        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest">HOF Score</p>
        <p className={`text-sm font-black ${hofColor(score)}`}>{score}</p>
      </div>
      <div className={`px-3 py-1.5 rounded-xl border text-center min-w-[56px] ${probBg(prob)}`}>
        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest leading-none">HOF%</p>
        <p className={`text-sm font-black ${probColor(prob)} leading-tight`}>{prob}%</p>
      </div>
    </div>
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────
const HallOfFame: React.FC<HallOfFameProps> = ({ league }) => {
  const [view, setView] = useState<'inductees' | 'candidates'>('inductees');
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [filterPos, setFilterPos] = useState<Position | 'all'>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'year' | 'score' | 'ppg' | 'champs'>('year');

  const inductees = league.hallOfFame ?? [];
  const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;

  // Years available for filter
  const years = useMemo(
    () => [...new Set(inductees.map(h => h.yearInducted))].sort((a, b) => b - a),
    [inductees],
  );

  // Teams available for filter
  const teamNames = useMemo(
    () => [...new Set(inductees.flatMap(h => h.teams))].sort(),
    [inductees],
  );

  // Filtered + sorted inductees
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return inductees
      .filter(h => {
        if (filterYear !== 'all' && h.yearInducted !== filterYear) return false;
        if (filterPos !== 'all' && h.position !== filterPos) return false;
        if (filterTeam !== 'all' && !h.teams.includes(filterTeam)) return false;
        if (q && !h.name.toLowerCase().includes(q) && !h.primaryTeam.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'year')   return b.yearInducted - a.yearInducted;
        if (sortBy === 'score')  return b.hofScore - a.hofScore;
        if (sortBy === 'ppg')    return b.careerPPG - a.careerPPG;
        if (sortBy === 'champs') return b.awardsCount.championships - a.awardsCount.championships;
        return 0;
      });
  }, [inductees, search, filterYear, filterPos, filterTeam, sortBy]);

  // HOF candidates (current players + FAs with significant career)
  const candidates = useMemo(() => {
    const inductedIds = new Set(inductees.map(h => h.id));
    const allPlayers = [
      ...league.teams.flatMap(t => t.roster.map(p => ({ ...p, teamName: t.name }))),
      ...league.freeAgents.map(p => ({ ...p, teamName: 'Free Agent' })),
      ...(league.retiredPlayers ?? []).map(p => ({ ...p, teamName: 'Retired' })),
    ];
    return allPlayers
      .filter(p => !inductedIds.has(p.id) && p.careerStats.length >= 3)
      .map(p => ({
        player: p,
        score: computeHofScore(p, league.awardHistory ?? []),
        prob: computeHofProbability(p, league.awardHistory ?? []),
      }))
      .filter(c => c.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [inductees, league.teams, league.freeAgents, league.retiredPlayers, league.awardHistory]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-40">
      <PageHeader
        title={`${isWomens ? 'WNBA' : 'Basketball'} Hall of Fame`}
        sub={`${inductees.length} inductee${inductees.length !== 1 ? 's' : ''} · class of ${league.season - 1}`}
      />

      {/* Summary stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Inductees', value: String(inductees.length), icon: '🏛️' },
          {
            label: 'MVPs Inducted',
            value: String(inductees.filter(h => h.awardsCount.mvp > 0).length),
            icon: '🏆',
          },
          {
            label: 'Champions',
            value: String(inductees.filter(h => h.awardsCount.championships > 0).length),
            icon: '💍',
          },
          {
            label: 'First-Ballot HOFers',
            value: String(inductees.filter(h => h.hofScore >= 80).length),
            icon: '⭐',
          },
        ].map(card => (
          <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex items-center gap-4">
            <span className="text-3xl leading-none shrink-0">{card.icon}</span>
            <div>
              <p className="text-2xl font-display font-black text-white">{card.value}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-tight">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {(['inductees', 'candidates'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              view === v ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {v === 'inductees' ? `Inducted (${inductees.length})` : `Candidates (${candidates.length})`}
          </button>
        ))}
      </div>

      {view === 'inductees' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search inductees…"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-amber-500/60 placeholder:text-slate-600"
              />
            </div>

            {/* Year filter */}
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-amber-500/60"
            >
              <option value="all">All Years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            {/* Position filter */}
            <select
              value={filterPos}
              onChange={e => setFilterPos(e.target.value as Position | 'all')}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-amber-500/60"
            >
              <option value="all">All Positions</option>
              {POS_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {/* Team filter */}
            <select
              value={filterTeam}
              onChange={e => setFilterTeam(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-amber-500/60"
            >
              <option value="all">All Teams</option>
              {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-semibold focus:outline-none focus:border-amber-500/60"
            >
              <option value="year">Sort: Year ↓</option>
              <option value="score">Sort: HOF Score ↓</option>
              <option value="ppg">Sort: PPG ↓</option>
              <option value="champs">Sort: Championships ↓</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center space-y-4">
              <div className="text-5xl">🏛️</div>
              {inductees.length === 0 ? (
                <>
                  <p className="text-xl font-display font-bold uppercase text-slate-400">No Inductees Yet</p>
                  <p className="text-slate-600 text-sm max-w-sm mx-auto">
                    The Hall of Fame opens after the first offseason. Retired players with outstanding careers
                    are automatically reviewed and inducted each season.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-display font-bold uppercase text-slate-400">No Results</p>
                  <p className="text-slate-600 text-sm">Try different filters.</p>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                {filtered.length} of {inductees.length} inductees
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(h => <InducteeCard key={h.id} inductee={h} />)}
              </div>
            </>
          )}
        </div>
      )}

      {view === 'candidates' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">About HOF Probability</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              HOF % is calculated from career PPG/RPG/APG, longevity (seasons), championships, MVP/DPOY wins,
              All-NBA selections, and All-Star appearances. Players retire naturally at age 35–42, then are
              reviewed for induction the following season. Color guide:&nbsp;
              <span className="text-emerald-400 font-bold">Green ≥ 70%</span>,&nbsp;
              <span className="text-amber-400 font-bold">Yellow 40–69%</span>,&nbsp;
              <span className="text-rose-400 font-bold">Red &lt; 40%</span>.
            </p>
          </div>
          {candidates.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
              <p className="text-slate-500">No candidates tracked yet. Play more seasons to build career stats.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map(({ player, prob, score }) => (
                <CandidateRow key={player.id} player={player} prob={prob} score={score} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HallOfFame;
