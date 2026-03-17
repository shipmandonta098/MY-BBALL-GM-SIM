import React, { useState, useMemo } from 'react';
import { LeagueState, Team, PlayoffBracket, PlayoffSeries, GameResult, Player, AwardWinner, RivalryStats, ChampionshipRecord } from '../types';
import TeamBadge from './TeamBadge';
import { simulateGame } from '../utils/simEngine';

interface PlayoffsProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onStartOffseason: () => void;
  onScout: (player: Player) => void;
  onViewBoxScore: (result: GameResult, home: Team, away: Team) => void;
  onAddNews?: (category: any, data: any, isBreaking: boolean) => void;
}

const Playoffs: React.FC<PlayoffsProps> = ({ league, updateLeague, onStartOffseason, onScout, onViewBoxScore, onAddNews }) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const bracket = league.playoffBracket;

  if (!bracket) {
    return (
      <div className="py-40 text-center border-2 border-dashed border-slate-800 rounded-[3rem] text-slate-700">
        <p className="font-display text-4xl uppercase tracking-tighter mb-4 opacity-50">Playoffs Not Seeded</p>
        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Finish the regular season to unlock the post-season bracket.</p>
      </div>
    );
  }

  const simulatePlayoffGameInternal = async (state: LeagueState, seriesId: string): Promise<LeagueState> => {
    const currentBracket = state.playoffBracket;
    if (!currentBracket) return state;

    const series = currentBracket.series.find(s => s.id === seriesId);
    if (!series || series.winnerId) return state;

    const t1 = state.teams.find(t => t.id === series.team1Id)!;
    const t2 = state.teams.find(t => t.id === series.team2Id)!;

    const totalGames = series.team1Wins + series.team2Wins;
    const isT1Home = [0, 1, 4, 6].includes(totalGames);

    const rivalryStats = state.rivalryHistory?.find(r => (r.team1Id === t1.id && r.team2Id === t2.id) || (r.team1Id === t2.id && r.team2Id === t1.id));
    
    const getRivalryLevel = (stats: RivalryStats | undefined): string => {
      if (!stats || stats.totalGames <= 2) return 'Ice Cold';
      const score = stats.totalGames + (stats.playoffSeriesCount * 5) + (stats.buzzerBeaters * 3) + (stats.comebacks * 2) + (stats.otGames * 2) + stats.badBloodScore;
      if (stats.totalGames >= 20 && score >= 30) return 'Red Hot';
      if (stats.totalGames >= 16) return 'Hot';
      if (stats.totalGames >= 8) return 'Warm';
      if (stats.totalGames >= 3) return 'Cold';
      return 'Ice Cold';
    };

    const rivalryLevel = getRivalryLevel(rivalryStats);

    const result = simulateGame(isT1Home ? t1 : t2, isT1Home ? t2 : t1, state.currentDay, state.season, false, false, rivalryLevel);
    // Ensure unique ID for playoff games
    result.id = `playoff-${state.season}-${series.id}-G${totalGames + 1}`;
    
    // Update Rivalry Stats
    const history = [...(state.rivalryHistory || [])];
    const rt1 = result.homeTeamId;
    const rt2 = result.awayTeamId;
    let rivalry = history.find(r => (r.team1Id === rt1 && r.team2Id === rt2) || (r.team1Id === rt2 && r.team2Id === rt1));
    if (!rivalry) {
      rivalry = { team1Id: rt1, team2Id: rt2, team1Wins: 0, team2Wins: 0, totalGames: 0, lastFiveGames: [], playoffSeriesCount: 0, buzzerBeaters: 0, comebacks: 0, otGames: 0, badBloodScore: 0 };
      history.push(rivalry);
    }
    const isRivalryT1Home = rivalry.team1Id === result.homeTeamId;
    const rivalryT1Won = (isRivalryT1Home && result.homeScore > result.awayScore) || (!isRivalryT1Home && result.awayScore > result.homeScore);
    rivalry.totalGames += 1;
    if (rivalryT1Won) rivalry.team1Wins += 1; else rivalry.team2Wins += 1;
    rivalry.lastFiveGames = [rivalryT1Won ? 'team1' : 'team2', ...rivalry.lastFiveGames].slice(0, 5) as ('team1' | 'team2')[];
    rivalry.lastGameResult = { winnerId: rivalryT1Won ? rivalry.team1Id : rivalry.team2Id, score: `${result.homeScore}-${result.awayScore}`, day: result.date, season: result.season };
    if (result.isOvertime) rivalry.otGames += 1;
    if (result.isBuzzerBeater) rivalry.buzzerBeaters += 1;
    if (result.isComeback) rivalry.comebacks += 1;

    const allStats = [...result.homePlayerStats, ...result.awayPlayerStats];
    allStats.forEach(p => {
      if (p.techs > 0) rivalry!.badBloodScore += p.techs;
    });

    // Update Player Stats
    const updateStats = (team: Team, lines: any[]) => {
      return {
        ...team,
        roster: team.roster.map(p => {
          const line = lines.find(l => l.playerId === p.id);
          if (!line) return p;
          return {
            ...p, 
            stats: { 
              ...p.stats, 
              gamesPlayed: p.stats.gamesPlayed + 1, 
              points: p.stats.points + line.pts, 
              rebounds: p.stats.rebounds + line.reb, 
              offReb: p.stats.offReb + line.offReb,
              defReb: p.stats.defReb + line.defReb,
              assists: p.stats.assists + line.ast, 
              steals: p.stats.steals + line.stl, 
              blocks: p.stats.blocks + line.blk, 
              minutes: p.stats.minutes + line.min, 
              fgm: p.stats.fgm + line.fgm, 
              fga: p.stats.fga + line.fga, 
              threepm: p.stats.threepm + line.threepm, 
              threepa: p.stats.threepa + line.threepa, 
              ftm: p.stats.ftm + line.ftm, 
              fta: p.stats.fta + line.fta, 
              tov: p.stats.tov + line.tov, 
              pf: p.stats.pf + line.pf,
            }
          };
        })
      };
    };

    const updatedTeams = state.teams.map(t => {
      if (t.id === result.homeTeamId) return updateStats(t, result.homePlayerStats);
      if (t.id === result.awayTeamId) return updateStats(t, result.awayPlayerStats);
      return t;
    });

    const newSeries = { ...series };
    if (isT1Home) {
      if (result.homeScore > result.awayScore) newSeries.team1Wins++;
      else newSeries.team2Wins++;
    } else {
      if (result.homeScore > result.awayScore) newSeries.team2Wins++;
      else newSeries.team1Wins++;
    }

    newSeries.games = [...series.games, result.id];

    let newsFeed = [...state.newsFeed];

    if (newSeries.team1Wins === 4) {
      newSeries.winnerId = series.team1Id;
      rivalry.playoffSeriesCount += 1;
      const winner = updatedTeams.find(t => t.id === newSeries.winnerId)!;
      newsFeed.unshift({
        id: `playoff-win-${Date.now()}`,
        category: 'playoffs',
        headline: 'SERIES COMPLETE',
        content: `${winner.name} have defeated their opponents and advanced!`,
        timestamp: state.currentDay,
        realTimestamp: Date.now(),
        teamId: winner.id,
        isBreaking: true
      });
    }
    if (newSeries.team2Wins === 4) {
      newSeries.winnerId = series.team2Id;
      rivalry.playoffSeriesCount += 1;
      const winner = updatedTeams.find(t => t.id === newSeries.winnerId)!;
      newsFeed.unshift({
        id: `playoff-win-${Date.now()}`,
        category: 'playoffs',
        headline: 'SERIES COMPLETE',
        content: `${winner.name} have defeated their opponents and advanced!`,
        timestamp: state.currentDay,
        realTimestamp: Date.now(),
        teamId: winner.id,
        isBreaking: true
      });
    }

    const updatedSeriesList = currentBracket.series.map(s => s.id === seriesId ? newSeries : s);
    
    // Check if round complete
    const currentRoundSeries = updatedSeriesList.filter(s => s.round === currentBracket.currentRound);
    const roundComplete = currentRoundSeries.every(s => !!s.winnerId);

    let nextBracket = { ...currentBracket, series: updatedSeriesList };

    if (roundComplete && currentBracket.currentRound < 4) {
      const nextRound = currentBracket.currentRound + 1;
      const nextSeriesList: PlayoffSeries[] = [];

      if (nextRound === 2) {
         const eastWinners = updatedSeriesList.filter(s => s.conference === 'Eastern' && s.round === 1).map(s => s.winnerId!);
         const westWinners = updatedSeriesList.filter(s => s.conference === 'Western' && s.round === 1).map(s => s.winnerId!);
         
         const createSeries = (w1: string, w2: string, conf: any) => ({
            id: `series-${state.season}-${conf}-R2-${w1}v${w2}`,
            round: 2, conference: conf, team1Id: w1, team2Id: w2, team1Wins: 0, team2Wins: 0, team1Seed: 0, team2Seed: 0, games: []
         });

         nextSeriesList.push(createSeries(eastWinners[0], eastWinners[1], 'Eastern'));
         nextSeriesList.push(createSeries(eastWinners[2], eastWinners[3], 'Eastern'));
         nextSeriesList.push(createSeries(westWinners[0], westWinners[1], 'Western'));
         nextSeriesList.push(createSeries(westWinners[2], westWinners[3], 'Western'));
      } else if (nextRound === 3) {
         const eastWinners = updatedSeriesList.filter(s => s.conference === 'Eastern' && s.round === 2).map(s => s.winnerId!);
         const westWinners = updatedSeriesList.filter(s => s.conference === 'Western' && s.round === 2).map(s => s.winnerId!);
         
         nextSeriesList.push({
            id: `series-${state.season}-Eastern-CF`,
            round: 3, conference: 'Eastern', team1Id: eastWinners[0], team2Id: eastWinners[1],
            team1Wins: 0, team2Wins: 0, team1Seed: 0, team2Seed: 0, games: []
         });
         nextSeriesList.push({
            id: `series-${state.season}-Western-CF`,
            round: 3, conference: 'Western', team1Id: westWinners[0], team2Id: westWinners[1],
            team1Wins: 0, team2Wins: 0, team1Seed: 0, team2Seed: 0, games: []
         });
      } else if (nextRound === 4) {
         const finalsTeams = updatedSeriesList.filter(s => s.round === 3).map(s => s.winnerId!);
         nextSeriesList.push({
            id: `series-${state.season}-Finals`,
            round: 4, conference: 'Finals', team1Id: finalsTeams[0], team2Id: finalsTeams[1],
            team1Wins: 0, team2Wins: 0, team1Seed: 0, team2Seed: 0, games: []
         });
      }

      nextBracket.series = [...updatedSeriesList, ...nextSeriesList];
      nextBracket.currentRound = nextRound;
    } else if (roundComplete && currentBracket.currentRound === 4) {
       const championId = newSeries.winnerId!;
       const champion = state.teams.find(t => t.id === championId)!;
       nextBracket.championId = championId;
       nextBracket.isCompleted = true;

       const finalsGames = [result, ...state.history].filter(h => newSeries.games.includes(h.id));
       const finalsStats = finalsGames.flatMap(g => g.homeTeamId === championId ? g.homePlayerStats : g.awayPlayerStats);
       const mvpEntry = finalsStats.reduce((acc: any, curr) => {
          if (!acc[curr.playerId]) acc[curr.playerId] = { name: curr.name, pts: 0, gp: 0 };
          acc[curr.playerId].pts += curr.pts;
          acc[curr.playerId].gp += 1;
          return acc;
       }, {});
       const mvpId = Object.keys(mvpEntry).sort((a,b) => (mvpEntry[b].pts/mvpEntry[b].gp) - (mvpEntry[a].pts/mvpEntry[a].gp))[0];

       nextBracket.finalsMvp = {
          playerId: mvpId,
          name: mvpEntry[mvpId].name,
          teamId: championId,
          teamName: champion.name,
          statsLabel: `${(mvpEntry[mvpId].pts/mvpEntry[mvpId].gp).toFixed(1)} PPG in Finals`
       };

       // Persist championship record for league history
       const runnerUpId = newSeries.team1Id === championId ? newSeries.team2Id : newSeries.team1Id;
       const runnerUp = state.teams.find(t => t.id === runnerUpId)!;
       const champWins = newSeries.team1Id === championId ? newSeries.team1Wins : newSeries.team2Wins;
       const ruWins   = newSeries.team1Id === championId ? newSeries.team2Wins : newSeries.team1Wins;
       const champRecord: ChampionshipRecord = {
          year: state.season,
          championId,
          championName: `${champion.city} ${champion.name}`,
          runnerUpId,
          runnerUpName: `${runnerUp.city} ${runnerUp.name}`,
          seriesScore: `${champWins}-${ruWins}`,
          finalsMvp: mvpEntry[mvpId]?.name ?? '—',
       };
       return {
          ...state,
          playoffBracket: nextBracket,
          championshipHistory: [champRecord, ...(state.championshipHistory || [])],
          history: [result, ...state.history],
          rivalryHistory: history,
          teams: updatedTeams,
          newsFeed,
       };
    }

    return { ...state, playoffBracket: nextBracket, history: [result, ...state.history], rivalryHistory: history, teams: updatedTeams, newsFeed };
  };

  const simulatePlayoffGame = async (seriesId: string) => {
    if (isSimulating) return;
    setIsSimulating(true);
    let nextState: LeagueState | null = null;
    updateLeague((prev) => {
      // This is tricky because we need to await inside a functional update which isn't possible.
      // But we can do the simulation outside and then update.
      return prev; 
    });
    
    // Correct approach: use the latest league state from props
    const updated = await simulatePlayoffGameInternal(league, seriesId);
    updateLeague(updated);
    setIsSimulating(false);
  };

  const simEntireRound = async () => {
    setIsSimulating(true);
    let tempState = { ...league };
    const startingRound = tempState.playoffBracket!.currentRound;
    let currentSeries = tempState.playoffBracket!.series.filter(s => s.round === startingRound && !s.winnerId);
    
    while (currentSeries.length > 0) {
      const s = currentSeries[0];
      tempState = await simulatePlayoffGameInternal(tempState, s.id);
      currentSeries = tempState.playoffBracket!.series.filter(ser => ser.round === startingRound && !ser.winnerId);
      // Small delay for UI feel
      if (currentSeries.length % 4 === 0) await new Promise(r => setTimeout(r, 50));
    }
    
    updateLeague(tempState);
    setIsSimulating(false);
  };

  const simEntirePlayoffs = async () => {
    setIsSimulating(true);
    let tempState = { ...league };
    
    while (!tempState.playoffBracket?.isCompleted) {
      let currentSeries = tempState.playoffBracket!.series.filter(s => s.round === tempState.playoffBracket!.currentRound && !s.winnerId);
      while (currentSeries.length > 0) {
        const s = currentSeries[0];
        tempState = await simulatePlayoffGameInternal(tempState, s.id);
        currentSeries = tempState.playoffBracket!.series.filter(ser => ser.round === tempState.playoffBracket!.currentRound && !ser.winnerId);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    
    updateLeague(tempState);
    setIsSimulating(false);
  };

  const SeriesCard: React.FC<{ series: PlayoffSeries }> = ({ series }) => {
    const t1 = league.teams.find(t => t.id === series.team1Id)!;
    const t2 = league.teams.find(t => t.id === series.team2Id)!;
    const isUserInvolved = t1.id === league.userTeamId || t2.id === league.userTeamId;
    const totalGames = series.team1Wins + series.team2Wins;

    return (
      <div 
        className={`bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 transition-all ${isUserInvolved ? 'border-amber-500 ring-1 ring-amber-500/20' : 'border-slate-800'} ${series.winnerId ? 'opacity-60' : ''}`}
      >
        <div className="flex justify-between items-center mb-1">
           <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">
              {series.winnerId ? 'Series Final' : `Game ${totalGames + 1}`}
           </span>
           {isUserInvolved && !series.winnerId && (
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 animate-pulse">Your Game</span>
           )}
        </div>
        <div className={`flex items-center justify-between ${series.winnerId === t1.id ? 'font-black text-white' : 'text-slate-400'}`}>
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-bold text-slate-600 w-4">{series.team1Seed || ''}</span>
             <TeamBadge team={t1} size="xs" />
             <span className="text-xs uppercase truncate max-w-[100px]">{t1.name}</span>
          </div>
          <span className="font-mono text-lg">{series.team1Wins}</span>
        </div>
        <div className={`flex items-center justify-between ${series.winnerId === t2.id ? 'font-black text-white' : 'text-slate-400'}`}>
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-bold text-slate-600 w-4">{series.team2Seed || ''}</span>
             <TeamBadge team={t2} size="xs" />
             <span className="text-xs uppercase truncate max-w-[100px]">{t2.name}</span>
          </div>
          <span className="font-mono text-lg">{series.team2Wins}</span>
        </div>
        {!series.winnerId && (
          <button 
            onClick={() => simulatePlayoffGame(series.id)}
            disabled={isSimulating}
            className="w-full py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[9px] font-black uppercase rounded-lg transition-all"
          >
            Sim Game
          </button>
        )}
      </div>
    );
  };

  const RoundView: React.FC<{ round: number; title: string; conference?: string }> = ({ round, title, conference }) => {
    const roundSeries = bracket.series.filter(s => s.round === round && (!conference || s.conference === conference));
    if (roundSeries.length === 0) return null;
    return (
      <div className="space-y-6">
        <h3 className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">{title}</h3>
        <div className="flex flex-col gap-4">
           {roundSeries.map(s => <SeriesCard key={s.id} series={s} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-40">
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 blur-[100px] rounded-full -mr-40 -mt-40"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">Playoff <span className="text-amber-500">Bracket</span></h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              Current Phase: <span className="text-amber-500">
                {bracket.currentRound === 1 ? 'First Round' : 
                 bracket.currentRound === 2 ? 'Conference Semis' : 
                 bracket.currentRound === 3 ? 'Conference Finals' : 'NBA Finals'}
              </span>
            </p>
          </div>
          <div className="flex gap-4">
             {!bracket.isCompleted ? (
                <>
                  <button 
                    onClick={simEntireRound}
                    disabled={isSimulating}
                    className="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white font-display font-bold uppercase rounded-xl transition-all active:scale-95"
                  >
                    Sim Round
                  </button>
                  <button 
                    onClick={simEntirePlayoffs}
                    disabled={isSimulating}
                    className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-xl shadow-amber-500/20 active:scale-95"
                  >
                    {isSimulating ? 'Simulating...' : 'Sim Playoffs'}
                  </button>
                </>
             ) : (
                <div className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Season Complete</p>
                  <p className="text-xs text-slate-400 mt-0.5">Scroll down to begin offseason</p>
                </div>
             )}
          </div>
        </div>
      </header>

      {bracket.isCompleted && (
        <div className="space-y-6">
          {/* Champion Banner */}
          <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-[3rem] p-12 text-center shadow-[0_0_100px_rgba(245,158,11,0.3)] animate-in zoom-in duration-1000 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
            <div className="relative z-10 space-y-8">
              <div className="text-9xl mb-4">🏆</div>
              <h2 className="text-7xl md:text-9xl font-display font-black text-white uppercase tracking-tighter drop-shadow-2xl">
                {league.teams.find(t => t.id === bracket.championId)?.name}
              </h2>
              <p className="text-3xl font-display font-bold text-amber-100 uppercase tracking-widest italic">World Champions</p>

              <div className="max-w-xl mx-auto bg-slate-950/40 backdrop-blur-md rounded-3xl p-8 border border-white/20">
                <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-200 mb-4">Finals MVP</h4>
                <p className="text-4xl font-display font-bold text-white uppercase mb-2">{bracket.finalsMvp?.name}</p>
                <p className="text-lg font-mono text-amber-300">{bracket.finalsMvp?.statsLabel}</p>
              </div>
            </div>
          </div>

          {/* Offseason Transition Banner */}
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <span className="text-2xl">🎱</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-1">Finals Ended</p>
                <h3 className="text-xl font-display font-bold uppercase text-white tracking-tight">
                  Draft Lottery Is Next
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  Advance to the offseason — run the lottery, hold the draft, then open free agency.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 shrink-0">
              <button
                onClick={onStartOffseason}
                className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-xl shadow-amber-500/20 active:scale-95 whitespace-nowrap text-sm"
              >
                Begin Offseason →
              </button>
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-slate-600">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> Lottery</span>
                <span>→</span>
                <span>Draft</span>
                <span>→</span>
                <span>Free Agency</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bracket Tree */}
      <div className="flex flex-col xl:flex-row justify-between gap-8">
         <div className="flex-1 grid grid-cols-3 gap-8">
            <RoundView round={1} title="East Quarters" conference="Eastern" />
            <RoundView round={2} title="East Semis" conference="Eastern" />
            <RoundView round={3} title="East Finals" conference="Eastern" />
         </div>
         
         <div className="w-full xl:w-80 flex flex-col justify-center">
            <RoundView round={4} title="NBA Finals" conference="Finals" />
         </div>

         <div className="flex-1 grid grid-cols-3 gap-8">
            <div className="order-3"><RoundView round={1} title="West Quarters" conference="Western" /></div>
            <div className="order-2"><RoundView round={2} title="West Semis" conference="Western" /></div>
            <div className="order-1"><RoundView round={3} title="West Finals" conference="Western" /></div>
         </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .playoff-node::after {
          content: '';
          position: absolute;
          border-color: #1e293b;
          border-style: solid;
        }
      `}} />
    </div>
  );
};

export default Playoffs;