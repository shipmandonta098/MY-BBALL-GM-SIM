
import React, { useState, useEffect, useCallback } from 'react';
import { LeagueState, Player, Team, GameResult, PlayerStatus, ScheduleGame, BulkSimSummary, Prospect, Coach, TradeProposal, Position, NewsItem, NewsCategory, LeagueSettings, SeasonAwards, PlayoffBracket, PlayoffSeries, Transaction, TransactionType, PowerRankingSnapshot, PowerRankingEntry, GMProfile, GMMilestone, RivalryStats, InjuryType } from './types';
import { generateLeagueTeams, generateSeasonSchedule, generateProspects, generateFreeAgentPool, generateCoachPool, EXPANSION_TEAM_POOL, generateCoach, enforcePositionalBounds } from './constants';
import { simulateGame } from './utils/simEngine';
import { generateGameRecap, generateScoutingReport, generateSeasonNarrative, generateCoachScoutingReport, generateNewsHeadline } from './services/geminiService';
import { generateAwards } from './utils/awardEngine';
import { db } from './db';

// Components
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Roster from './components/Roster';
import FreeAgency from './components/FreeAgency';
import CoachesMarket from './components/CoachesMarket';
import Results from './components/Results';
import Standings from './components/Standings';
import Schedule from './components/Schedule';
import Draft from './components/Draft';
import Coaching from './components/Coaching';
import Stats from './components/Stats';
import Finances from './components/Finances';
import Trade from './components/Trade';
import NewsFeed from './components/NewsFeed';
import Expansion from './components/Expansion';
import Awards from './components/Awards';
import Playoffs from './components/Playoffs';
import Transactions from './components/Transactions';
import PowerRankings from './components/PowerRankings';
import Settings from './components/Settings';
import TitleScreen from './components/TitleScreen';
import TeamSelection from './components/TeamSelection';
import LeagueConfiguration from './components/LeagueConfiguration';
import PlayerModal from './components/PlayerModal';
import CoachModal from './components/CoachModal';
import BoxScoreModal from './components/BoxScoreModal';
import GMProfileView from './components/GMProfile';
import LiveGameModal from './components/LiveGameModal';
import FranchiseHistory from './components/FranchiseHistory';
import Rotations from './components/Rotations';
import TeamManagement from './components/TeamManagement';

const SETTINGS_KEY = 'HOOPS_DYNASTY_SETTINGS_V1';

type AppStatus = 'title' | 'config' | 'setup' | 'game';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>('title');
  const [league, setLeague] = useState<LeagueState | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'news' | 'roster' | 'rotations' | 'free_agency' | 'results' | 'standings' | 'schedule' | 'draft' | 'coaching' | 'stats' | 'finances' | 'trade' | 'expansion' | 'settings' | 'coach_market' | 'awards' | 'playoffs' | 'transactions' | 'power_rankings' | 'gm_profile' | 'team_management'>('dashboard');
  const [rosterTeamId, setRosterTeamId] = useState<string>('');
  const [teamManagementId, setTeamManagementId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [scoutingReport, setScoutingReport] = useState<{playerId: string, report: string} | null>(null);
  const [coachScoutingReport, setCoachScoutingReport] = useState<{coachId: string, report: string} | null>(null);
  const [watchingGame, setWatchingGame] = useState<{game: ScheduleGame, home: Team, away: Team} | null>(null);
  const [news, setNews] = useState<string>("Welcome to the franchise. Lead your team to the 82nd game and beyond.");
  const [allSaves, setAllSaves] = useState<LeagueState[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  
  const [viewingBoxScore, setViewingBoxScore] = useState<{result: GameResult, home: Team, away: Team} | null>(null);
  const [viewingFranchiseId, setViewingFranchiseId] = useState<string | null>(null);
  const [bulkSummary, setBulkSummary] = useState<BulkSimSummary | null>(null);

  const refreshSaves = useCallback(async () => {
    const saves = await db.leagues.toArray();
    setAllSaves(saves);
  }, []);

  useEffect(() => {
    if (status === 'title') {
      refreshSaves();
    }
  }, [status, refreshSaves]);

  useEffect(() => {
    if (status === 'game' && league) {
      const leagueToSave = { ...league, lastUpdated: Date.now() };
      db.leagues.put(leagueToSave).catch(err => console.error("Save error:", err));
    }
  }, [league, status]);

  const recordTransaction = (state: LeagueState, type: TransactionType, teamIds: string[], description: string, playerIds?: string[], value?: number): Transaction[] => {
    const newTransaction: Transaction = {
      id: `tx-${Date.now()}-${Math.random()}`,
      type,
      timestamp: state.currentDay,
      realTimestamp: Date.now(),
      teamIds,
      playerIds,
      description,
      value
    };
    return [newTransaction, ...(state.transactions || [])].slice(0, 1000);
  };

  const calculatePowerRankings = (state: LeagueState): PowerRankingSnapshot => {
    const snapshots = state.powerRankingHistory || [];
    const prevSnapshot = snapshots[snapshots.length - 1];

    const entries: PowerRankingEntry[] = state.teams.map(team => {
      const winPct = team.wins / (team.wins + team.losses || 1);
      const teamOvr = team.roster.reduce((sum, p) => sum + p.rating, 0) / team.roster.length;
      
      const teamGames = state.history.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
      let totalDiff = 0;
      teamGames.forEach(g => {
        const isHome = g.homeTeamId === team.id;
        totalDiff += isHome ? (g.homeScore - g.awayScore) : (g.awayScore - g.homeScore);
      });
      const netRating = teamGames.length > 0 ? totalDiff / teamGames.length : 0;
      
      const last5 = team.lastTen.slice(-5);
      const formScore = last5.filter(r => r === 'W').length * 2;

      const score = (winPct * 40) + (netRating * 1.5) + (teamOvr * 0.3) + formScore;
      const prevEntry = prevSnapshot?.rankings.find(r => r.teamId === team.id);

      return {
        teamId: team.id, rank: 0, score, prevRank: prevEntry?.rank
      };
    });

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, idx) => e.rank = idx + 1);

    return {
      day: state.currentDay, rankings: entries
    };
  };

  const handleNewLeague = () => setStatus('config');

  const handleConfigLeague = async (name: string, year: number, partialSettings: Partial<LeagueSettings>) => {
    const genderRatio = partialSettings.playerGenderRatio || 0;
    
    const finalSettings: LeagueSettings = {
      difficulty: 'Medium', ownerMeterEnabled: true, salaryCap: 140000000, luxuryTaxLine: 160000000, injuryFrequency: 'Medium',
      tradeDifficulty: 'Realistic', rookieProgressionRate: 'Normal', vetDeclineRate: 100, simSpeed: 'Normal', godMode: false,
      seasonLength: 82, playerGenderRatio: 0, coachGenderRatio: 10, allowManualGenderEdits: true, b2bFrequency: 'Realistic',
      showAdvancedStats: true, ...partialSettings
    };

    const freshTeams = generateLeagueTeams(genderRatio).map(t => ({
      ...t, needs: ['PG', 'C', 'SG', 'PF', 'SF'].sort(() => 0.5 - Math.random()).slice(0, 2) as Position[]
    }));
    const freshSchedule = generateSeasonSchedule(freshTeams, finalSettings.seasonLength);
    const freshProspects = generateProspects(year, 100, genderRatio);
    const initialFAs = generateFreeAgentPool(25, year, genderRatio);
    const coachPool = generateCoachPool(30, finalSettings.coachGenderRatio);
    
    const initialGMProfile: GMProfile = {
      name: 'User GM',
      avatarSeed: `gm-${Date.now()}`,
      reputation: 50,
      eoyWins: [],
      totalSeasons: 0,
      milestones: [{
        id: `start-${Date.now()}`, year, day: 1, text: `Started GM career in the ${name}.`, type: 'milestone'
      }]
    };

    const newLeague: LeagueState = {
      id: `league-${Date.now()}`, lastUpdated: Date.now(), currentDay: 1, season: year, leagueName: name, userTeamId: '',
      gmProfile: initialGMProfile, teams: freshTeams, schedule: freshSchedule, isOffseason: false, offseasonDay: 0,
      draftPhase: 'scouting', prospects: freshProspects, freeAgents: initialFAs, coachPool, history: [],
      savedTrades: [], newsFeed: [], awardHistory: [], championshipHistory: [], transactions: [], settings: finalSettings,
      draftPicks: []
    };

    setLeague(newLeague);
    await db.leagues.add(newLeague);
    setStatus('setup');
  };

  const handleLoadSave = (savedLeague: LeagueState) => {
    if (!savedLeague.gmProfile) {
      savedLeague.gmProfile = {
        name: 'User GM', avatarSeed: 'default', reputation: 50, eoyWins: [], totalSeasons: 0, milestones: []
      };
    }
    setLeague(savedLeague);
    setRosterTeamId(savedLeague.userTeamId);
    setStatus('game');
    setActiveTab('dashboard');
  };

  const handleDeleteSave = async (id: string) => {
    // Optimistic update for UI responsiveness
    setAllSaves(prev => prev.filter(s => s.id !== id));
    
    try {
      const deletedCount = await db.leagues.where('id').equals(id).delete();
      console.log(`Deleted ${deletedCount} league(s) with id: ${id}`);
      
      if (league?.id === id) {
        setLeague(null);
      }
      
      // Re-sync with database to ensure accuracy
      await refreshSaves();
    } catch (error) {
      console.error("Failed to delete league:", error);
      alert("Failed to delete league. Please try again.");
      // Rollback optimistic update on error
      await refreshSaves();
    }
  };

  const handleRenameSave = async (id: string, newName: string) => {
    await db.leagues.update(id, { leagueName: newName, lastUpdated: Date.now() });
    await refreshSaves();
  };

  const handleImportSave = async (importedLeague: LeagueState) => {
    const id = `imported-${Date.now()}`;
    const toSave = { ...importedLeague, id, lastUpdated: Date.now() };
    await db.leagues.add(toSave);
    await refreshSaves();
  };

  const handleSelectTeam = async (teamId: string) => {
    if (!league) return;
    const team = league.teams.find(t => t.id === teamId)!;
    const updatedMilestones = [...league.gmProfile.milestones, {
       id: `hired-${Date.now()}`, year: league.season, day: league.currentDay, text: `Named General Manager of the ${team.city} ${team.name}.`, type: 'signing'
    }];
    const updated = { ...league, userTeamId: teamId, gmProfile: { ...league.gmProfile, milestones: updatedMilestones }, lastUpdated: Date.now() };
    setLeague(updated);
    setRosterTeamId(teamId);
    await db.leagues.put(updated);
    setStatus('game');
  };

  const addNewsItem = async (state: LeagueState, category: NewsCategory, data: { player?: Player, team?: Team, coach?: Coach, detail?: string }, isBreaking: boolean = false) => {
    const content = await generateNewsHeadline(category, data);
    const newItem: NewsItem = {
      id: `news-${Date.now()}-${Math.random()}`, category, headline: category.toUpperCase(), content, timestamp: state.currentDay,
      realTimestamp: Date.now(), teamId: data.team?.id, playerId: data.player?.id, isBreaking
    };
    return { ...state, newsFeed: [newItem, ...(state.newsFeed || [])].slice(0, 100) };
  };

  const processDailyLeagueEvents = async (state: LeagueState): Promise<LeagueState> => {
    let newState = { ...state };
    for (let team of newState.teams) {
      if (team.id === newState.userTeamId) continue;
      const hc = team.staff.headCoach;
      if (!hc) continue;
      const streakThreshold = -5;
      const ownerPatienceFire = team.finances.ownerPatience < 15;
      const streakFire = team.streak <= streakThreshold && Math.random() > 0.8;
      
      if (ownerPatienceFire || streakFire) {
        const reason = ownerPatienceFire ? "lack of faith from the board" : `a disappointing ${Math.abs(team.streak)} game slide`;
        newState = await addNewsItem(newState, 'firing', { team, coach: hc, detail: `Fired due to ${reason}.` }, true);
        newState.transactions = recordTransaction(newState, 'firing', [team.id], `${team.name} fired Head Coach ${hc.name} following ${reason}.`);
        const updatedTeams = newState.teams.map(t => 
          t.id === team.id ? { ...t, staff: { ...t.staff, headCoach: null }, finances: { ...t.finances, ownerPatience: 50 } } : t
        );
        const updatedPool = [...newState.coachPool, { ...hc, desiredContract: { years: 2, salary: Math.floor(hc.salary * 0.9) }, interestScore: 50 }];
        newState = { ...newState, teams: updatedTeams, coachPool: updatedPool };
      }
    }
    // Injury recovery — decrement days, auto-return when healed
    newState = {
      ...newState,
      teams: newState.teams.map(t => ({
        ...t,
        roster: t.roster.map(p => {
          if (p.status !== 'Injured') return p;
          const daysLeft = (p.injuryDaysLeft ?? 1) - 1;
          if (daysLeft <= 0) {
            return { ...p, status: 'Rotation' as PlayerStatus, injuryType: undefined, injuryDaysLeft: 0 };
          }
          return { ...p, injuryDaysLeft: daysLeft };
        })
      }))
    };
    // Rare practice/travel illness
    if (Math.random() > 0.97) {
      const active = newState.teams.flatMap(t => t.roster).filter(p => p.status !== 'Injured');
      if (active.length > 0) {
        const unlucky = active[Math.floor(Math.random() * active.length)];
        const team = newState.teams.find(t => t.roster.some(p => p.id === unlucky.id))!;
        const days = 1 + Math.floor(Math.random() * 5);
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== team.id ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== unlucky.id ? p : {
              ...p, status: 'Injured' as PlayerStatus, injuryType: 'Illness' as InjuryType, injuryDaysLeft: days
            })
          })
        };
        newState = await addNewsItem(newState, 'injury', { player: unlucky, team, detail: `${unlucky.name} is dealing with an illness — day-to-day, expected back in ${days} day${days !== 1 ? 's' : ''}.` }, false);
      }
    }
    if (newState.currentDay % 15 === 0) {
      const newCoach = generateCoach(`gen-coach-${Date.now()}`, 'C', newState.settings.coachGenderRatio);
      newState.coachPool = [newCoach, ...newState.coachPool].slice(0, 50);
    }
    if (newState.currentDay % 10 === 0) {
      const allPlayers = newState.teams.flatMap(t => t.roster);
      const unhappyDiva = allPlayers.find(p => p.personalityTraits.includes('Diva/Star') && p.morale < 40);
      if (unhappyDiva && Math.random() > 0.7) {
        const team = newState.teams.find(t => t.roster.some(pl => pl.id === unhappyDiva.id))!;
        newState = await addNewsItem(newState, 'trade_request', { player: unhappyDiva, team, detail: `${unhappyDiva.name} is reportedly frustrated with his role and has requested a trade.` }, true);
      }
    }

    if (newState.currentDay % 7 === 0) {
      const snapshot = calculatePowerRankings(newState);
      newState.powerRankingHistory = [...(newState.powerRankingHistory || []), snapshot].slice(-20);
    }
    return newState;
  };

  const getRivalryLevel = (stats: RivalryStats | undefined): string => {
    if (!stats || stats.totalGames <= 2) return 'Ice Cold';
    const score = stats.totalGames + (stats.playoffSeriesCount * 5) + (stats.buzzerBeaters * 3) + (stats.comebacks * 2) + (stats.otGames * 2) + stats.badBloodScore;
    if (stats.totalGames >= 20 && score >= 30) return 'Red Hot';
    if (stats.totalGames >= 16) return 'Hot';
    if (stats.totalGames >= 8) return 'Warm';
    if (stats.totalGames >= 3) return 'Cold';
    return 'Ice Cold';
  };

  const updateRivalryStats = (state: LeagueState, result: GameResult): RivalryStats[] => {
    const history = [...(state.rivalryHistory || [])];
    const t1 = result.homeTeamId;
    const t2 = result.awayTeamId;
    
    let rivalry = history.find(r => (r.team1Id === t1 && r.team2Id === t2) || (r.team1Id === t2 && r.team2Id === t1));
    
    if (!rivalry) {
      rivalry = {
        team1Id: t1,
        team2Id: t2,
        team1Wins: 0,
        team2Wins: 0,
        totalGames: 0,
        lastFiveGames: [],
        playoffSeriesCount: 0,
        buzzerBeaters: 0,
        comebacks: 0,
        otGames: 0,
        badBloodScore: 0
      };
      history.push(rivalry);
    }

    const isT1Home = rivalry.team1Id === result.homeTeamId;
    const t1Won = (isT1Home && result.homeScore > result.awayScore) || (!isT1Home && result.awayScore > result.homeScore);
    
    rivalry.totalGames += 1;
    if (t1Won) rivalry.team1Wins += 1; else rivalry.team2Wins += 1;
    
    rivalry.lastFiveGames = [t1Won ? 'team1' : 'team2', ...rivalry.lastFiveGames].slice(0, 5) as ('team1' | 'team2')[];
    rivalry.lastGameResult = {
      winnerId: t1Won ? rivalry.team1Id : rivalry.team2Id,
      score: `${result.homeScore}-${result.awayScore}`,
      day: result.date,
      season: result.season
    };

    if (result.isOvertime) rivalry.otGames += 1;
    if (result.isBuzzerBeater) rivalry.buzzerBeaters += 1;
    if (result.isComeback) rivalry.comebacks += 1;

    // Chippy Boosts
    const allStats = [...result.homePlayerStats, ...result.awayPlayerStats];
    allStats.forEach(p => {
      if (p.techs > 0) rivalry!.badBloodScore += p.techs;
      if (p.flagrants > 0) rivalry!.badBloodScore += p.flagrants * 1.5; // F1=1.5, F2=3
    });

    return history;
  };

  const finalizeGameResult = async (state: LeagueState, gameId: string, result: GameResult): Promise<LeagueState> => {
    let newState = { ...state };
    let updatedTeams = [...state.teams];
    const homeTeam = updatedTeams.find(t => t.id === result.homeTeamId)!;
    const awayTeam = updatedTeams.find(t => t.id === result.awayTeamId)!;
    const homeWon = result.homeScore > result.awayScore;

    updatedTeams = updatedTeams.map(t => {
      const isWinner = (t.id === homeTeam.id && homeWon) || (t.id === awayTeam.id && !homeWon);
      const opp = t.id === homeTeam.id ? awayTeam : homeTeam;
      const isHome = t.id === homeTeam.id;
      const isConfGame = t.conference === opp.conference;
      const lastTen = [...(t.lastTen || []), isWinner ? 'W' : 'L'].slice(-10) as ('W' | 'L')[];
      
      if (t.id === homeTeam.id || t.id === awayTeam.id) {
         let patienceDelta = 0;
         if (state.settings.ownerMeterEnabled) {
           if (t.finances.ownerGoal === 'Win Now') {
             patienceDelta = isWinner ? 0.5 : -1.0;
           } else if (t.finances.ownerGoal === 'Profit') {
             patienceDelta = t.finances.revenue > t.finances.expenses ? 0.2 : -0.5;
           } else { 
             const rookiePlaying = t.roster.filter(p => p.age < 22).length;
             patienceDelta = rookiePlaying > 2 ? 0.3 : -0.2;
           }
         }
         return {
          ...t, wins: isWinner ? t.wins + 1 : t.wins, losses: isWinner ? t.losses : t.losses + 1, homeWins: isHome && isWinner ? t.homeWins + 1 : t.homeWins, homeLosses: isHome && !isWinner ? t.homeLosses + 1 : t.homeLosses, roadWins: !isHome && isWinner ? t.roadWins + 1 : t.roadWins, roadLosses: !isHome && !isWinner ? t.roadLosses + 1 : t.roadLosses, confWins: isConfGame && isWinner ? (t.confWins || 0) + 1 : (t.confWins || 0), confLosses: isConfGame && !isWinner ? (t.confLosses || 0) + 1 : (t.confLosses || 0), lastTen, streak: isWinner ? (t.streak >= 0 ? t.streak + 1 : 1) : (t.streak <= 0 ? t.streak - 1 : -1), finances: { ...t.finances, ownerPatience: state.settings.ownerMeterEnabled ? Math.min(100, Math.max(0, t.finances.ownerPatience + patienceDelta)) : 100, cash: t.finances.cash + (isHome ? 250000 : 0) }
        };
      }
      return t;
    });

    const updateStats = (team: Team, lines: any[], isWinner: boolean) => {
      return {
        ...team,
        roster: team.roster.map(p => {
          const line = lines.find(l => l.playerId === p.id);
          if (!line) return p;
          const newTechs = (p.stats.techs || 0) + (line.techs || 0);
          const newFlagrants = (p.stats.flagrants || 0) + (line.flagrants || 0);
          const newEjections = (p.stats.ejections || 0) + (line.ejected ? 1 : 0);
          
          let isSuspended = p.isSuspended;
          let suspensionGames = p.suspensionGames || 0;
          
          // Suspension Logic (16 techs)
          if (newTechs >= 16 && (p.stats.techs || 0) < 16) {
            isSuspended = true;
            suspensionGames = 1;
          }

          let morale = p.morale || 75;
          if (p.personalityTraits.includes('Diva/Star')) {
            if (line.min < 20) morale -= 2;
            if (p.status === 'Bench') morale -= 1;
          }
          if (p.personalityTraits.includes('Loyal') && isWinner) morale += 1;
          if (p.personalityTraits.includes('Money Hungry') && isWinner) morale += 0.5;
          if (p.personalityTraits.includes('Friendly/Team First')) morale += 0.5;
          if (p.personalityTraits.includes('Lazy') && !isWinner) morale -= 1;
          
          morale = Math.min(100, Math.max(0, morale));

          return {
            ...p, 
            isSuspended,
            suspensionGames,
            morale,
            stats: { 
              ...p.stats, 
              gamesPlayed: p.stats.gamesPlayed + 1, 
              points: p.stats.points + line.pts, 
              rebounds: p.stats.rebounds + line.reb, 
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
              techs: newTechs,
              flagrants: newFlagrants,
              ejections: newEjections,
              offReb: p.stats.offReb + (line.offReb || 0),
              defReb: p.stats.defReb + (line.defReb || 0),
              plusMinus: (p.stats.plusMinus || 0) + (line.plusMinus || 0)
            }
          };
        })
      };
    };
    updatedTeams = updatedTeams.map(t => {
      const isWinner = (t.id === homeTeam.id && homeWon) || (t.id === awayTeam.id && !homeWon);
      if (t.id === homeTeam.id) return updateStats(t, result.homePlayerStats, isWinner);
      if (t.id === awayTeam.id) return updateStats(t, result.awayPlayerStats, isWinner);
      return t;
    });

    const rivalryHistory = updateRivalryStats(state, result);
    newState = { ...state, teams: updatedTeams, history: [result, ...state.history], schedule: state.schedule.map(sg => sg.id === gameId ? { ...sg, played: true, resultId: result.id } : sg), rivalryHistory };

    // News for ejections
    const allLines = [...result.homePlayerStats, ...result.awayPlayerStats];
    const ejectedPlayers = allLines.filter(l => l.ejected);
    for (const pLine of ejectedPlayers) {
      const team = newState.teams.find(t => t.id === (result.homePlayerStats.some(h => h.playerId === pLine.playerId) ? result.homeTeamId : result.awayTeamId))!;
      const player = team.roster.find(p => p.id === pLine.playerId)!;
      newState = await addNewsItem(newState, 'injury', { player, team, detail: `${player.name} tossed — rivalry boils over!` }, true);
    }

    // Apply in-game injuries
    if (result.gameInjuries && result.gameInjuries.length > 0) {
      for (const inj of result.gameInjuries) {
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== inj.teamId ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== inj.playerId ? p : {
              ...p, status: 'Injured' as PlayerStatus, injuryType: inj.injuryType as InjuryType, injuryDaysLeft: inj.daysOut
            })
          })
        };
        const injTeam = newState.teams.find(t => t.id === inj.teamId)!;
        const injPlayer = injTeam.roster.find(p => p.id === inj.playerId)!;
        const wks = inj.daysOut >= 14 ? ` (${Math.round(inj.daysOut / 7)} wks)` : '';
        newState = await addNewsItem(newState, 'injury', {
          player: injPlayer, team: injTeam,
          detail: `${injPlayer.name} suffered a ${inj.injuryType} and is expected to miss ${inj.daysOut} day${inj.daysOut !== 1 ? 's' : ''}${wks}.`
        }, inj.daysOut >= 14);
      }
    }

    return newState;
  };

  const executeSimDay = async (state: LeagueState): Promise<{newState: LeagueState, dayResults: GameResult[]}> => {
    const gamesToPlay = state.schedule.filter(g => g.day === state.currentDay && !g.played);
    let newState = { ...state };
    const dayResults: GameResult[] = [];
    for (const game of gamesToPlay) {
      const homeTeam = newState.teams.find(t => t.id === game.homeTeamId)!;
      const awayTeam = newState.teams.find(t => t.id === game.awayTeamId)!;
      const rivalry = newState.rivalryHistory?.find(r => (r.team1Id === homeTeam.id && r.team2Id === awayTeam.id) || (r.team1Id === awayTeam.id && r.team2Id === homeTeam.id));
      const rivalryLevel = getRivalryLevel(rivalry);
      const result = simulateGame(homeTeam, awayTeam, newState.currentDay, newState.season, game.homeB2B, game.awayB2B, rivalryLevel);
      result.id = game.id;
      if (homeTeam.id === state.userTeamId || awayTeam.id === state.userTeamId) dayResults.push(result);
      newState = await finalizeGameResult(newState, game.id, result);
    }
    newState = await processDailyLeagueEvents(newState);
    return { newState: { ...newState, currentDay: newState.currentDay + 1 }, dayResults };
  };

  const handleSimulate = async (mode: 'next' | 'day' | 'week' | 'month' | 'season' | 'to-game' | 'x-games' | 'single-instant', targetGameId?: string, numGames?: number) => {
    if (!league) return;
    if (mode === 'single-instant' && targetGameId) {
      const game = league.schedule.find(g => g.id === targetGameId)!;
      const home = league.teams.find(t => t.id === game.homeTeamId)!;
      const away = league.teams.find(t => t.id === game.awayTeamId)!;
      const rivalry = league.rivalryHistory?.find(r => (r.team1Id === home.id && r.team2Id === away.id) || (r.team1Id === away.id && r.team2Id === home.id));
      const rivalryLevel = getRivalryLevel(rivalry);
      const result = simulateGame(home, away, league.currentDay, league.season, game.homeB2B, game.awayB2B, rivalryLevel);
      result.id = game.id;
      const recap = await generateGameRecap(result, home, away);
      result.aiRecap = recap;
      let newState = await finalizeGameResult(league, game.id, result);
      newState = await processDailyLeagueEvents(newState);
      setLeague(newState);
      setViewingBoxScore({ result, home, away });
      return;
    }
    setLoading(true);
    let tempState = { ...league };
    let summary: BulkSimSummary = { gamesPlayed: 0, userWins: 0, userLosses: 0, notablePerformances: [], news: [] };
    const processResults = (results: GameResult[]) => {
      results.forEach(r => {
        summary.gamesPlayed++;
        const isHome = r.homeTeamId === league.userTeamId;
        const win = isHome ? r.homeScore > r.awayScore : r.awayScore > r.homeScore;
        if (win) summary.userWins++; else summary.userLosses++;
      });
    };
    if (mode === 'next') {
      let foundUserGame = false;
      while (!foundUserGame && tempState.currentDay < 500) {
        const hasUserGame = tempState.schedule.some(g => g.day === tempState.currentDay && (g.homeTeamId === tempState.userTeamId || g.awayTeamId === tempState.userTeamId));
        const step = await executeSimDay(tempState);
        tempState = step.newState;
        processResults(step.dayResults);
        if (hasUserGame) foundUserGame = true;
      }
    } else if (mode === 'day') {
      const step = await executeSimDay(tempState);
      tempState = step.newState;
      processResults(step.dayResults);
    } else if (mode === 'week') {
      for (let i = 0; i < 7; i++) {
        const step = await executeSimDay(tempState);
        tempState = step.newState;
        processResults(step.dayResults);
      }
    } else if (mode === 'month') {
      for (let i = 0; i < 30; i++) {
        const step = await executeSimDay(tempState);
        tempState = step.newState;
        processResults(step.dayResults);
      }
    } else if (mode === 'season') {
      while (tempState.currentDay < 500 && tempState.schedule.some(g => !g.played)) {
        const step = await executeSimDay(tempState);
        tempState = step.newState;
        processResults(step.dayResults);
      }
    }
    if (summary.gamesPlayed > 0) {
      const narrative = await generateSeasonNarrative(tempState.teams);
      summary.news.push(narrative);
      setBulkSummary(summary);
    }
    
    if (!tempState.schedule.some(g => !g.played) && !tempState.playoffBracket) {
      const seasonAwards = await generateAwards(tempState.teams, tempState.season);
      
      if (seasonAwards.executiveOfTheYear.teamId === tempState.userTeamId) {
        const gm = tempState.gmProfile;
        tempState.gmProfile = {
          ...gm,
          eoyWins: [...gm.eoyWins, tempState.season],
          reputation: Math.min(100, gm.reputation + 15),
          milestones: [...gm.milestones, {
            id: `eoy-${Date.now()}`, year: tempState.season, day: tempState.currentDay, text: `Awarded Executive of the Year after leading team to ${tempState.teams.find(t=>t.id===tempState.userTeamId)!.wins} wins.`, type: 'award'
          }]
        };
      }

      tempState.awardHistory = [seasonAwards, ...(tempState.awardHistory || [])];
      tempState.currentSeasonAwards = seasonAwards;

      const generateInitialBracket = (teams: Team[], season: number): PlayoffBracket => {
        const getSeededTeams = (conf: 'Eastern' | 'Western') => 
          teams.filter(t => t.conference === conf)
            .sort((a,b) => b.wins - a.wins || (b.confWins || 0) - (a.confWins || 0))
            .slice(0, 8);
        const east = getSeededTeams('Eastern');
        const west = getSeededTeams('Western');
        const createSeries = (t1: Team, t2: Team, t1Seed: number, t2Seed: number, conf: any): PlayoffSeries => ({
          id: `series-${season}-${conf}-${t1Seed}v${t2Seed}`, round: 1, conference: conf, team1Id: t1.id, team2Id: t2.id, team1Wins: 0, team2Wins: 0, team1Seed: t1Seed, team2Seed: t2Seed, games: []
        });
        const initialSeries: PlayoffSeries[] = [
          createSeries(east[0], east[7], 1, 8, 'Eastern'), createSeries(east[3], east[4], 4, 5, 'Eastern'), createSeries(east[1], east[6], 2, 7, 'Eastern'), createSeries(east[2], east[5], 3, 6, 'Eastern'),
          createSeries(west[0], west[7], 1, 8, 'Western'), createSeries(west[3], west[4], 4, 5, 'Western'), createSeries(west[1], west[6], 2, 7, 'Western'), createSeries(west[2], west[5], 3, 6, 'Western'),
        ];
        return { year: season, series: initialSeries, currentRound: 1, isCompleted: false };
      };
      tempState.playoffBracket = generateInitialBracket(tempState.teams, tempState.season);
      setActiveTab('playoffs');
      tempState = await addNewsItem(tempState, 'playoffs', { detail: `The Regular Season has concluded. Playoff seeds are locked!` }, true);
    }
    setLeague(tempState);
    setLoading(false);
  };

  const handleStartOffseason = async () => {
    if (!league) return;
    setLoading(true);
    let tempState = { ...league };
    
    // Check for championship milestone
    if (tempState.playoffBracket?.championId === tempState.userTeamId) {
      tempState.gmProfile = {
        ...tempState.gmProfile,
        reputation: Math.min(100, tempState.gmProfile.reputation + 20),
        milestones: [...tempState.gmProfile.milestones, {
          id: `chip-${Date.now()}`, year: tempState.season, day: tempState.currentDay, text: `Led the ${tempState.teams.find(t=>t.id===tempState.userTeamId)!.name} to a World Championship.`, type: 'title'
        }]
      };
    }

    tempState.gmProfile.totalSeasons += 1;
    tempState.playoffBracket = undefined;
    tempState.isOffseason = true;
    tempState.draftPhase = 'lottery';
    tempState.offseasonDay = 0;
    
    const rookieSetting = tempState.settings.rookieProgressionRate || 'Normal';
    const rookieMultiplier = rookieSetting === 'Slow' ? 0.7 : rookieSetting === 'Fast' ? 1.3 : 1.0;
    const vetRate = (tempState.settings.vetDeclineRate || 100) / 100;

    tempState.teams = tempState.teams.map(t => {
      const devMultiplier = (t.staff.assistantDev?.ratingDevelopment || 60) / 75;
      const POS_DEV_KEYS: Record<string, (keyof Player['attributes'])[]> = {
        PG: ['ballHandling','passing','shooting3pt','offensiveIQ','perimeterDef'],
        SG: ['shooting3pt','shooting','shootingMid','perimeterDef','speed'],
        SF: ['athleticism','shooting','perimeterDef','interiorDef','defReb'],
        PF: ['interiorDef','defReb','offReb','postScoring','strength'],
        C:  ['interiorDef','strength','offReb','defReb','blocks'],
      };
      const rosterWithProg = t.roster.map(p => {
        let growth = 0;
        if (p.age < 25) {
          growth = Math.floor(Math.random() * 4 * devMultiplier * rookieMultiplier);
        } else if (p.age > 33) {
          growth = -Math.floor(Math.random() * 3 * vetRate);
        }
        if (growth === 0) return enforcePositionalBounds(p);
        const devKeys = POS_DEV_KEYS[p.position] ?? POS_DEV_KEYS['SF'];
        // Apply growth to 2 random relevant attributes
        const picked = [...devKeys].sort(() => 0.5 - Math.random()).slice(0, 2);
        const newAttrs = { ...p.attributes } as any;
        picked.forEach(k => {
          newAttrs[k] = Math.min(99, Math.max(0, (newAttrs[k] ?? 50) + growth));
        });
        return enforcePositionalBounds({ ...p, attributes: newAttrs as Player['attributes'] });
      });
      return { ...t, roster: rosterWithProg.map(p => ({ ...p, contractYears: Math.max(0, p.contractYears - 1) })), prevSeasonWins: t.wins, wins: 0, losses: 0, lastTen: [] };
    });
    
    // Free agents are generated but FA tab will be restricted until draft is done
    tempState.freeAgents = [...generateFreeAgentPool(15, tempState.season, tempState.settings.playerGenderRatio)];
    tempState.coachPool = [...generateCoachPool(20, tempState.settings.coachGenderRatio)];
    tempState.season += 1;
    
    tempState.newsFeed.unshift({
      id: `offseason-start-${Date.now()}`,
      category: 'playoffs',
      headline: 'FINALS ENDED',
      content: 'The post-season has concluded. The Draft Lottery is incoming!',
      timestamp: tempState.currentDay,
      realTimestamp: Date.now(),
      isBreaking: true
    });

    setLeague(tempState);
    setLoading(false);
  };

  const handleScoutPlayer = async (player: Player | Prospect) => { setLoading(true); const report = await generateScoutingReport(player); setScoutingReport({ playerId: player.id, report }); setLoading(false); };
  const handleScoutCoach = async (coach: Coach) => { setSelectedCoach(coach); };
  const handleGenerateCoachIntelligence = async (coach: Coach) => { setLoading(true); const report = await generateCoachScoutingReport(coach); setCoachScoutingReport({ coachId: coach.id, report }); setLoading(false); };
  
  const handleUpdateTeamRoster = (teamId: string, updatedRoster: Player[]) => { 
    if (!league) return; 
    setLeague({ ...league, teams: league.teams.map(t => t.id === teamId ? { ...t, roster: updatedRoster } : t) }); 
  };
  
  const handleUpdatePlayer = (updatedPlayer: Player) => {
    if (!league) return;
    
    const updateInTeams = league.teams.map(t => ({
      ...t,
      roster: t.roster.map(p => p.id === updatedPlayer.id ? updatedPlayer : p)
    }));

    const updateInFreeAgents = league.freeAgents.map(p => p.id === updatedPlayer.id ? updatedPlayer : p);
    const updateInProspects = league.prospects.map(p => p.id === updatedPlayer.id ? { ...p, ...updatedPlayer } : p);

    setLeague({
      ...league,
      teams: updateInTeams,
      freeAgents: updateInFreeAgents,
      prospects: updateInProspects as Prospect[]
    });
    
    if (selectedPlayer && selectedPlayer.id === updatedPlayer.id) {
      setSelectedPlayer(updatedPlayer);
    }
  };

  const handleUpdateCoach = (updatedCoach: Coach) => {
    if (!league) return;

    const updateInTeams = league.teams.map(t => {
      const staff = t.staff;
      const isHere = Object.values(staff).some((c: any) => c?.id === updatedCoach.id);
      if (!isHere) return t;
      
      const newStaff = { ...staff };
      if (newStaff.headCoach?.id === updatedCoach.id) newStaff.headCoach = updatedCoach;
      if (newStaff.assistantOffense?.id === updatedCoach.id) newStaff.assistantOffense = updatedCoach;
      if (newStaff.assistantDefense?.id === updatedCoach.id) newStaff.assistantDefense = updatedCoach;
      if (newStaff.assistantDev?.id === updatedCoach.id) newStaff.assistantDev = updatedCoach;
      if (newStaff.trainer?.id === updatedCoach.id) newStaff.trainer = updatedCoach;
      
      return { ...t, staff: newStaff };
    });

    const updateInCoachPool = league.coachPool.map(c => c.id === updatedCoach.id ? updatedCoach : c);

    setLeague({
      ...league,
      teams: updateInTeams,
      coachPool: updateInCoachPool
    });
    
    if (selectedCoach && selectedCoach.id === updatedCoach.id) {
      setSelectedCoach(updatedCoach);
    }
  };

  const handleViewPlayer = (player: Player | Prospect) => setSelectedPlayer(player as Player);
  
  const handleWatchLive = (gameId: string) => {
    if (!league) return;
    const game = league.schedule.find(g => g.id === gameId)!;
    const home = league.teams.find(t => t.id === game.homeTeamId)!;
    const away = league.teams.find(t => t.id === game.awayTeamId)!;
    setWatchingGame({ game, home, away });
  };

  const handleUpdatePlayerStatus = (playerId: string, status: PlayerStatus) => { 
    if (!league || !league.userTeamId) return; 
    const userTeam = league.teams.find(t => t.id === league.userTeamId)!; 
    const updatedRoster = userTeam.roster.map(p => p.id === playerId ? { ...p, status } : p); 
    handleUpdateTeamRoster(userTeam.id, updatedRoster); 
    if (selectedPlayer && selectedPlayer.id === playerId) setSelectedPlayer({ ...selectedPlayer, status }); 
  };
  
  const handleReleasePlayer = (playerId: string) => { 
    if (!league || !league.userTeamId) return; 
    const userTeam = league.teams.find(t => t.id === league.userTeamId)!; 
    const p = userTeam.roster.find(pl => pl.id === playerId);
    const updatedRoster = userTeam.roster.filter(pl => pl.id !== playerId); 
    const updatedTransactions = recordTransaction(league, 'release', [userTeam.id], `${userTeam.name} waived ${p?.name || 'player'}.`, [playerId]);
    setLeague({ ...league, teams: league.teams.map(t => t.id === userTeam.id ? { ...t, roster: updatedRoster } : t), transactions: updatedTransactions });
    setSelectedPlayer(null); 
  };
  
  const handleViewRoster = (teamId: string) => { setRosterTeamId(teamId); setActiveTab('roster'); };
  const handleViewFranchise = (teamId: string) => { setViewingFranchiseId(teamId); setActiveTab('results'); };
  const handleManageTeam = (teamId: string) => { setTeamManagementId(teamId); setActiveTab('team_management'); };
  const updateLeagueState = (updated: Partial<LeagueState> | ((prev: LeagueState) => LeagueState)) => { 
    if (!league) return; 
    if (typeof updated === 'function') {
      setLeague(prev => prev ? updated(prev) : null);
    } else {
      setLeague(prev => prev ? { ...prev, ...updated } : null);
    }
  };

  if (status === 'title') return <TitleScreen onNewLeague={handleNewLeague} onLoadSave={handleLoadSave} onDeleteSave={handleDeleteSave} onRenameSave={handleRenameSave} onImportSave={handleImportSave} saves={allSaves} />;
  if (status === 'config') return <LeagueConfiguration onConfirm={handleConfigLeague} onCancel={() => setStatus('title')} />;
  if (status === 'setup' && league) return <TeamSelection teams={league.teams} onSelectTeam={handleSelectTeam} />;
  if (!league || !league.userTeamId) return null;

  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;

  if (userTeam.finances.ownerPatience <= 0 && league.settings.ownerMeterEnabled) {
     return (
        <div className="fixed inset-0 z-[5000] bg-rose-950 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-1000">
           <div className="max-w-3xl space-y-8">
              <h1 className="text-9xl font-display font-bold text-white uppercase tracking-tighter">Terminated</h1>
              <p className="text-3xl font-medium text-rose-200">The Board has decided to move in a different direction. Your tenure with the {userTeam.name} has concluded.</p>
              <button onClick={() => window.location.reload()} className="px-16 py-6 bg-white text-rose-950 font-display font-bold uppercase rounded-3xl shadow-2xl">Return to Title</button>
           </div>
        </div>
     );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-50 relative">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} team={userTeam} onQuit={() => setStatus('title')} isOffseason={league.isOffseason} isExpansionActive={league.expansionDraft?.active} />
      <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 pb-32 transition-all duration-300 ease-in-out">
        <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {activeTab === 'dashboard' && <Dashboard league={league} news={news} onSimulate={handleSimulate} onScout={handleViewPlayer} scoutingReport={scoutingReport} setActiveTab={setActiveTab} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} />}
          {activeTab === 'gm_profile' && <GMProfileView league={league} updateLeague={updateLeagueState} />}
          {activeTab === 'team_management' && (
            <TeamManagement 
              league={league} 
              updateLeague={updateLeagueState}
              initialTeamId={teamManagementId}
              onClose={() => setActiveTab('dashboard')}
            />
          )}
          {activeTab === 'news' && <NewsFeed league={league} onViewPlayer={handleViewPlayer} onViewRoster={handleViewRoster} setActiveTab={setActiveTab} />}
          {activeTab === 'transactions' && <Transactions league={league} />}
          {activeTab === 'power_rankings' && <PowerRankings league={league} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} />}
          {activeTab === 'expansion' && <Expansion league={league} updateLeague={updateLeagueState} onScout={handleViewPlayer} />}
          {activeTab === 'roster' && <Roster leagueTeams={league.teams} userTeamId={league.userTeamId} initialTeamId={rosterTeamId} onScout={handleViewPlayer} onScoutCoach={handleScoutCoach} scoutingReport={scoutingReport} onUpdateTeamRoster={handleUpdateTeamRoster} onManageTeam={handleManageTeam} />}
          {activeTab === 'rotations' && <Rotations league={league} updateLeague={updateLeagueState} />}
          {activeTab === 'free_agency' && <FreeAgency league={league} updateLeague={updateLeagueState} onScout={handleViewPlayer} recordTransaction={recordTransaction} />}
          {activeTab === 'coach_market' && <CoachesMarket league={league} updateLeague={updateLeagueState} onScout={handleScoutCoach} />}
          {activeTab === 'awards' && <Awards league={league} onScout={handleViewPlayer} onScoutCoach={handleScoutCoach} onManageTeam={handleManageTeam} />}
          {activeTab === 'playoffs' && <Playoffs league={league} updateLeague={updateLeagueState} onStartOffseason={handleStartOffseason} onScout={handleViewPlayer} onViewBoxScore={(res, home, away) => setViewingBoxScore({ result: res, home, away })} onAddNews={async (cat, data, breaking) => {
            const newState = await addNewsItem(league, cat, data, breaking);
            updateLeagueState(newState);
          }} />}
          {activeTab === 'results' && (
            viewingFranchiseId ? (
              <FranchiseHistory 
                league={league} 
                initialTeamId={viewingFranchiseId} 
                onBack={() => setViewingFranchiseId(null)} 
              />
            ) : (
              <Results 
                history={league.history} 
                teams={league.teams} 
                userTeamId={league.userTeamId} 
                onViewBoxScore={(res, home, away) => setViewingBoxScore({ result: res, home, away })} 
                onViewFranchise={handleViewFranchise}
              />
            )
          )}
          {activeTab === 'standings' && <Standings teams={league.teams} userTeamId={league.userTeamId} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} />}
          {activeTab === 'schedule' && <Schedule league={league} onSimulate={handleSimulate} onScout={handleViewPlayer} onWatchLive={handleWatchLive} onViewBoxScore={(res, home, away) => setViewingBoxScore({ result: res, home, away })} onManageTeam={handleManageTeam} />}
          {activeTab === 'draft' && <Draft league={league} updateLeague={updateLeagueState} onScout={handleScoutPlayer} scoutingReport={scoutingReport} />}
          {activeTab === 'coaching' && <Coaching league={league} updateLeague={updateLeagueState} />}
          {activeTab === 'stats' && <Stats league={league} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} />}
          {activeTab === 'finances' && <Finances league={league} updateLeague={updateLeagueState} />}
          {activeTab === 'trade' && <Trade league={league} updateLeague={updateLeagueState} recordTransaction={recordTransaction} />}
          {activeTab === 'settings' && <Settings league={league} updateLeague={updateLeagueState} />}
        </div>
      </main>
      {selectedPlayer && (
        <PlayerModal 
          player={selectedPlayer} 
          onClose={() => setSelectedPlayer(null)} 
          onScout={handleScoutPlayer} 
          scoutingReport={scoutingReport} 
          isUserTeam={league.teams.find(t => t.id === league.userTeamId)?.roster.some(p => p.id === selectedPlayer.id) ?? false} 
          onUpdateStatus={handleUpdatePlayerStatus} 
          onRelease={handleReleasePlayer}
          godMode={league.settings.godMode}
          onUpdatePlayer={handleUpdatePlayer}
        />
      )}
      {selectedCoach && (
         <CoachModal coach={selectedCoach} onClose={() => setSelectedCoach(null)} onScout={handleGenerateCoachIntelligence} scoutingReport={coachScoutingReport} godMode={league.settings.godMode} onUpdateCoach={handleUpdateCoach} isUserTeam={(Object.values(userTeam.staff) as (Coach | null)[]).some(s => s?.id === selectedCoach.id)} onFire={(id) => {
               const updatedStaff = { ...userTeam.staff };
               const oldCoachName = (Object.values(updatedStaff) as (Coach | null)[]).find(s => s?.id === id)?.name;
               if (updatedStaff.headCoach?.id === id) updatedStaff.headCoach = null;
               else if (updatedStaff.assistantOffense?.id === id) updatedStaff.assistantOffense = null;
               else if (updatedStaff.assistantDefense?.id === id) updatedStaff.assistantDefense = null;
               else if (updatedStaff.assistantDev?.id === id) updatedStaff.assistantDev = null;
               else if (updatedStaff.trainer?.id === id) updatedStaff.trainer = null;
               const updatedTransactions = recordTransaction(league, 'firing', [userTeam.id], `${userTeam.name} parted ways with ${oldCoachName || 'staff member'}.`);
               updateLeagueState({ teams: league.teams.map(t => t.id === userTeam.id ? { ...t, staff: updatedStaff } : t), transactions: updatedTransactions });
               setSelectedCoach(null);
            }} />
      )}
      {viewingBoxScore && <BoxScoreModal result={viewingBoxScore.result} homeTeam={viewingBoxScore.home} awayTeam={viewingBoxScore.away} onClose={() => setViewingBoxScore(null)} />}
      {watchingGame && (
        <LiveGameModal 
          game={watchingGame.game} 
          homeTeam={watchingGame.home} 
          awayTeam={watchingGame.away} 
          season={league.season}
          league={league}
          rivalryLevel={getRivalryLevel(league.rivalryHistory?.find(r => (r.team1Id === watchingGame.home.id && r.team2Id === watchingGame.away.id) || (r.team1Id === watchingGame.away.id && r.team2Id === watchingGame.home.id)))}
          onUpdate={(liveGame) => {
            updateLeagueState({ liveGame });
          }}
          onComplete={async (result) => {
            const newState = await finalizeGameResult(league, watchingGame.game.id, result);
            updateLeagueState({ ...newState, liveGame: undefined });
            setWatchingGame(null);
          }}
          onClose={() => {
            updateLeagueState({ liveGame: undefined });
            setWatchingGame(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
