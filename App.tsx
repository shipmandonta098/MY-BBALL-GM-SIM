
import React, { useState, useEffect, useCallback } from 'react';
import { LeagueState, Player, Team, GameResult, PlayerStatus, ScheduleGame, BulkSimSummary, Prospect, Coach, TradeProposal, Position, NewsItem, NewsCategory, LeagueSettings, SeasonAwards, PlayoffBracket, PlayoffSeries, Transaction, TransactionType, PowerRankingSnapshot, PowerRankingEntry, GMProfile, GMMilestone, RivalryStats, InjuryType, SeasonPhase, AllStarWeekendData, AllStarVoteEntry } from './types';
import { generateLeagueTeams, generateSeasonSchedule, generateProspects, generateFreeAgentPool, generateCoachPool, EXPANSION_TEAM_POOL, generateCoach, generatePlayer, generateDefaultRotation, enforcePositionalBounds, ageFromBirthdate, getCoachPreferredScheme, generateGMName } from './constants';
import { simulateGame, normalizeLeagueOVRs } from './utils/simEngine';
import { computeGameAttendance } from './utils/attendanceEngine';
import { autoSimAllStarWeekend } from './utils/allStarSim';
import { snapshotPlayerStats } from './utils/playerUtils';
import { generateGameRecap, generateScoutingReport, generateSeasonNarrative, generateCoachScoutingReport, generateNewsHeadline } from './services/geminiService';
import { generateAwards } from './utils/awardEngine';
import { assignAIPersonalities, runAIGMOffseason, aiGMTradeDeadlineAction, aiGMInSeasonTrades, aiGMPreOffseasonAgreements, generateAITradeProposalsForUser } from './utils/aiGMEngine';
import { db } from './db';
import { NavigationProvider } from './context/NavigationContext';

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
import TradeProposals from './components/TradeProposals';
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
import Players from './components/Players';
import AllStar from './components/AllStar';

const SETTINGS_KEY = 'HOOPS_DYNASTY_SETTINGS_V1';

type AppStatus = 'title' | 'config' | 'setup' | 'game';

// ── Interim HC promotion helper ───────────────────────────────────────────────
// Finds the best available assistant and promotes them to Interim Head Coach.
// If no assistants exist a low-rated temporary coach is generated from scratch.
function pickInterimCoach(
  staff: import('./types').TeamStaff,
  genderRatio: number,
): { interim: import('./types').Coach; newStaff: import('./types').TeamStaff } {
  const candidates = (
    [
      { slot: 'assistantDev',     coach: staff.assistantDev     },
      { slot: 'assistantOffense', coach: staff.assistantOffense },
      { slot: 'assistantDefense', coach: staff.assistantDefense },
    ] as { slot: keyof import('./types').TeamStaff; coach: import('./types').Coach | null }[]
  ).filter(a => a.coach != null) as { slot: keyof import('./types').TeamStaff; coach: import('./types').Coach }[];

  if (candidates.length === 0) {
    // No assistants — generate a low-rated temp
    const temp = generateCoach(`interim-${Date.now()}`, 'C', genderRatio);
    const interim: import('./types').Coach = {
      ...temp,
      ratingOffense:     Math.min(temp.ratingOffense, 52),
      ratingDefense:     Math.min(temp.ratingDefense, 52),
      ratingDevelopment: Math.min(temp.ratingDevelopment, 52),
      salary:        1_500_000,
      contractYears: 1,
      role:      'Head Coach',
      isInterim: true,
    };
    return { interim, newStaff: { ...staff, headCoach: interim } };
  }

  // Best assistant by combined rating total
  const best = candidates.sort(
    (a, b) =>
      (b.coach.ratingDevelopment + b.coach.ratingOffense + b.coach.ratingDefense) -
      (a.coach.ratingDevelopment + a.coach.ratingOffense + a.coach.ratingDefense),
  )[0];

  const interim: import('./types').Coach = {
    ...best.coach,
    role:      'Head Coach',
    isInterim: true,
    salary: Math.max(best.coach.salary, 1_500_000),
  };

  return {
    interim,
    newStaff: { ...staff, headCoach: interim, [best.slot]: null },
  };
}

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>('title');
  const [league, setLeague] = useState<LeagueState | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'news' | 'roster' | 'rotations' | 'free_agency' | 'results' | 'standings' | 'schedule' | 'draft' | 'coaching' | 'stats' | 'finances' | 'trade' | 'trade_proposals' | 'expansion' | 'settings' | 'coach_market' | 'awards' | 'playoffs' | 'transactions' | 'power_rankings' | 'gm_profile' | 'team_management' | 'players' | 'allstar' | 'league_history' | 'franchise_history'>('dashboard');
  const [counterProposal, setCounterProposal] = useState<import('./types').TradeProposal | null>(null);
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
  const leagueRef = React.useRef<LeagueState | null>(null);
  leagueRef.current = league;

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

  // ── Trigger AI FA signings after draft completes ──────────────────────────
  useEffect(() => {
    if (status !== 'game' || !league || league.draftPhase !== 'completed' || !league.isOffseason) return;
    // Only run once per offseason — guard with a flag in newsFeed
    const alreadyRan = league.newsFeed.some(n => n.id === `ai-fa-run-${league.season}`);
    if (alreadyRan) return;
    setLeague(prev => {
      if (!prev || prev.draftPhase !== 'completed' || !prev.isOffseason) return prev;
      if (prev.newsFeed.some(n => n.id === `ai-fa-run-${prev.season}`)) return prev;
      // Run pre-offseason agreements (verbals/informal) then full AI offseason
      const preResult = aiGMPreOffseasonAgreements(prev, prev.settings.difficulty ?? 'Medium');
      const afterPre = {
        ...preResult.updatedState,
        transactions: [...preResult.transactions, ...(prev.transactions || [])].slice(0, 1000),
      };
      const aiResult = runAIGMOffseason(afterPre, afterPre.settings.difficulty ?? 'Medium');
      const sentinel: typeof prev.newsFeed[0] = {
        id: `ai-fa-run-${prev.season}`,
        category: 'transaction' as const,
        headline: '🟢 Free Agency Opens',
        content: 'The draft is complete. Teams are now active in free agency.',
        timestamp: prev.currentDay,
        realTimestamp: Date.now(),
        isBreaking: true,
      };
      return {
        ...aiResult.updatedState,
        newsFeed: [sentinel, ...aiResult.updatedState.newsFeed].slice(0, 200),
        transactions: [...aiResult.transactions, ...(afterPre.transactions || [])].slice(0, 1000),
      };
    });
  }, [league?.draftPhase, league?.isOffseason, status]);

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

  /** Accept an incoming AI trade proposal: execute the trade and remove the proposal. */
  const handleAcceptProposal = (proposal: TradeProposal) => {
    if (!league) return;
    const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
    const partnerTeam = league.teams.find(t => t.id === proposal.partnerTeamId);
    if (!partnerTeam) return;

    const season = league.season;
    const snappedUserPlayers = proposal.userPieces
      .filter(p => p.type === 'player')
      .map(p => snapshotPlayerStats(p.data as Player, userTeam.id, userTeam.name, userTeam.abbreviation, season, true));
    const snappedPartnerPlayers = proposal.partnerPieces
      .filter(p => p.type === 'player')
      .map(p => snapshotPlayerStats(p.data as Player, partnerTeam.id, partnerTeam.name, partnerTeam.abbreviation, season, true));

    const pickMatch = (piece: { type: string; data: any }, teamPick: { originalTeamId: string; round: number; year?: number }) =>
      piece.type === 'pick' &&
      piece.data.originalTeamId === teamPick.originalTeamId &&
      piece.data.round === teamPick.round &&
      piece.data.year === teamPick.year;

    const updatedTeams = league.teams.map(t => {
      let roster = [...t.roster];
      let picks  = [...t.picks];
      if (t.id === userTeam.id) {
        roster = roster.filter(p => !proposal.userPieces.some(up => up.type === 'player' && (up.data as Player).id === p.id));
        picks  = picks.filter(pk => !proposal.userPieces.some(up => pickMatch(up, pk)));
        roster = [...roster, ...snappedPartnerPlayers];
        picks  = [...picks, ...proposal.partnerPieces.filter(p => p.type === 'pick').map(p => ({ ...p.data, currentTeamId: userTeam.id }))];
      }
      if (t.id === partnerTeam.id) {
        roster = roster.filter(p => !proposal.partnerPieces.some(pp => pp.type === 'player' && (pp.data as Player).id === p.id));
        picks  = picks.filter(pk => !proposal.partnerPieces.some(pp => pickMatch(pp, pk)));
        roster = [...roster, ...snappedUserPlayers];
        picks  = [...picks, ...proposal.userPieces.filter(p => p.type === 'pick').map(p => ({ ...p.data, currentTeamId: partnerTeam.id }))];
      }
      return { ...t, roster, picks };
    });

    const fmtPiece = (piece: { type: string; data: any }) => {
      if (piece.type === 'player') return (piece.data as Player).name;
      const pk = piece.data;
      return `${pk.year ?? league.season} ${pk.round === 1 ? '1st' : '2nd'}`;
    };
    const description = `${userTeam.name} trade ${proposal.userPieces.map(fmtPiece).join(', ')} to ${partnerTeam.name} for ${proposal.partnerPieces.map(fmtPiece).join(', ')}.`;
    const playerIds = [
      ...proposal.userPieces.filter(p => p.type === 'player').map(p => (p.data as Player).id),
      ...proposal.partnerPieces.filter(p => p.type === 'player').map(p => (p.data as Player).id),
    ];
    const updatedTransactions = recordTransaction(league, 'trade', [userTeam.id, partnerTeam.id], description, playerIds);

    updateLeagueState({
      teams: updatedTeams,
      transactions: updatedTransactions,
      incomingTradeProposals: (league.incomingTradeProposals ?? []).filter(p => p.id !== proposal.id),
    });
  };

  /** Compute the current season phase from state */
  const computeSeasonPhase = (state: LeagueState): SeasonPhase => {
    if (state.isOffseason) return 'Offseason';
    if (state.playoffBracket) return 'Playoffs';
    if (state.allStarWeekend && !state.allStarWeekend.completed) return 'All-Star Weekend';
    if (state.tradeDeadlinePassed) {
      // After trade deadline, before All-Star or after completed All-Star, still in regular season
      return 'Regular Season';
    }
    const totalGames = state.schedule.length;
    const playedGames = state.schedule.filter(g => g.played).length;
    if (totalGames === 0) return 'Preseason';
    const pct = playedGames / totalGames;
    if (pct === 0) return 'Preseason';
    return 'Regular Season';
  };

  /** Full All-Star Weekend builder: vote simulation + event qualification */
  const buildAllStarWeekend = (state: LeagueState): AllStarWeekendData => {
    // Enrich all active players with team context
    type RichPlayer = Player & { teamId: string; teamName: string; teamConf: 'Eastern' | 'Western'; teamWins: number };
    const allActive: RichPlayer[] = state.teams.flatMap(t =>
      t.roster
        .filter(p => p.status !== 'Injured')
        .map(p => ({ ...p, teamId: t.id, teamName: `${t.city} ${t.name}`, teamConf: t.conference as 'Eastern' | 'Western', teamWins: t.wins }))
    );

    const ppg = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.points / p.stats.gamesPlayed : 0;
    const rpg = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.rebounds / p.stats.gamesPlayed : 0;
    const apg = (p: Player) => p.stats.gamesPlayed > 0 ? p.stats.assists / p.stats.gamesPlayed : 0;
    // Approximate PER: PPG + RPG*0.7 + APG*0.7 + STL*1.5 + BLK*1.5 - TOV
    const perApprox = (p: Player) => ppg(p) + rpg(p) * 0.7 + apg(p) * 0.7
      + (p.stats.gamesPlayed > 0 ? p.stats.steals / p.stats.gamesPlayed * 1.5 : 0)
      + (p.stats.gamesPlayed > 0 ? p.stats.blocks / p.stats.gamesPlayed * 1.5 : 0)
      - (p.stats.gamesPlayed > 0 ? p.stats.tov / p.stats.gamesPlayed : 0);
    // Recent form: simulate from last-10 record (wins = morale proxy)
    const recentForm = (p: Player) => (p.morale / 100) * 12 + Math.random() * 8;

    const voteEntries: AllStarVoteEntry[] = [];

    const selectConference = (conf: 'Eastern' | 'Western') => {
      const confPlayers = allActive.filter(p => p.teamConf === conf);

      // Score every player
      const scored = confPlayers.map(p => {
        // Fan vote (50%): star power — OVR + PPG*2 + team wins bonus + random excitement
        const fanScore = p.rating * 0.4 + ppg(p) * 2.5 + p.teamWins * 0.35 + Math.random() * 10;
        // Player/media/coach vote (50%): efficiency — OVR + PER approx + recent form
        const mediaScore = p.rating * 0.55 + perApprox(p) * 1.2 + recentForm(p) + Math.random() * 8;
        const totalScore = fanScore * 0.5 + mediaScore * 0.5;
        return { ...p, fanScore, mediaScore, totalScore };
      }).sort((a, b) => b.totalScore - a.totalScore);

      // ── Starters: 2 guards + 3 frontcourt, position-balanced ──
      const isGuard = (pos: string) => pos === 'PG' || pos === 'SG';
      const isFront = (pos: string) => pos === 'SF' || pos === 'PF' || pos === 'C';

      const guards = scored.filter(p => isGuard(p.position));
      const frontcourt = scored.filter(p => isFront(p.position));

      const starterGuards = guards.slice(0, 2);
      const starterFront = frontcourt.slice(0, 3);
      const starters = [...starterGuards, ...starterFront];

      // Edge case: fill if positions scarce
      const starterSet = new Set(starters.map(s => s.id));
      const remaining = scored.filter(p => !starterSet.has(p.id));
      while (starters.length < 5 && remaining.length > 0) starters.push(remaining.shift()!);

      // ── Reserves: top 7 by coach vote from non-starters ──
      const starterSetFinal = new Set(starters.map(s => s.id));
      const reserveCandidates = scored.filter(p => !starterSetFinal.has(p.id)).map(p => {
        const coachScore = p.rating * 0.5 + perApprox(p) * 1.4 + p.teamWins * 0.25 + Math.random() * 10;
        return { ...p, coachScore };
      }).sort((a, b) => b.coachScore - a.coachScore);
      const reserves = reserveCandidates.slice(0, 7);

      // Record vote entries
      starters.forEach(p => {
        const isTopFanGuard = isGuard(p.position) && guards.slice(0, 2).some(g => g.id === p.id);
        const isTopFanFront = isFront(p.position) && frontcourt.slice(0, 3).some(f => f.id === p.id);
        voteEntries.push({
          playerId: p.id, fanScore: Math.round(p.fanScore), mediaScore: Math.round(p.mediaScore),
          totalScore: Math.round(p.totalScore),
          selectionType: (isTopFanGuard || isTopFanFront) ? 'starter-fan' : 'starter-media',
        });
      });
      reserves.forEach(p => voteEntries.push({
        playerId: p.id, fanScore: Math.round(p.fanScore), mediaScore: Math.round(p.mediaScore),
        totalScore: Math.round(p.totalScore), selectionType: 'reserve-coach',
      }));

      // ── Injury replacements for starters ──
      const replacements: Array<{ originalId: string; replacementId: string; conf: 'Eastern' | 'Western' }> = [];
      const allSelected = new Set([...starters.map(s => s.id), ...reserves.map(r => r.id)]);
      starters.forEach((s, idx) => {
        if (s.status === 'Injured') {
          const next = reserveCandidates.find(r => !allSelected.has(r.id));
          if (next) {
            replacements.push({ originalId: s.id, replacementId: next.id, conf });
            allSelected.add(next.id);
            starters[idx] = next as typeof s;
          }
        }
      });

      return {
        starters: starters.map(p => p.id),
        reserves: reserves.map(p => p.id),
        replacements,
      };
    };

    const east = selectConference('Eastern');
    const west = selectConference('Western');

    // ── Event Qualification ──────────────────────────────────────────────

    // Skills Challenge: PG/SG/SF under 27, top by ballHandling + speed + passing
    const skillsCandidates = allActive
      .filter(p => (p.position === 'PG' || p.position === 'SG' || p.position === 'SF') && p.age < 27)
      .map(p => ({ ...p, score: p.attributes.ballHandling * 0.4 + p.attributes.speed * 0.3 + p.attributes.passing * 0.3 + Math.random() * 18 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    // Fallback to any guard if not enough
    const skillsPool = skillsCandidates.length >= 4 ? skillsCandidates
      : allActive.filter(p => p.position === 'PG' || p.position === 'SG')
          .sort((a, b) => b.attributes.ballHandling - a.attributes.ballHandling).slice(0, 4);

    // 3-Point Contest: top 8 by 3pt rating + volume (threepa/gp ratio)
    const threePtCandidates = allActive
      .filter(p => p.stats.gamesPlayed > 0)
      .map(p => {
        const vol = p.stats.threepa / p.stats.gamesPlayed;   // attempts per game
        const pct = p.stats.threepa > 0 ? p.stats.threepm / p.stats.threepa : 0;
        const score = p.attributes.shooting3pt * 0.55 + pct * 80 * 0.3 + vol * 2.5 * 0.15 + Math.random() * 12;
        return { ...p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    // Ensure at least 4
    const threePtPool = threePtCandidates.length >= 4 ? threePtCandidates
      : allActive.sort((a, b) => b.attributes.shooting3pt - a.attributes.shooting3pt).slice(0, 6);

    // Dunk Contest: age <30, athleticism ≥78 + dunks ≥75, top by dunks+jumping+athleticism
    const dunkCandidates = allActive
      .filter(p => p.age < 30 && (p.attributes.athleticism || 0) >= 78 && (p.attributes.dunks || 0) >= 75)
      .map(p => ({ ...p, score: (p.attributes.dunks || 0) * 0.4 + (p.attributes.jumping || 0) * 0.35 + (p.attributes.athleticism || 0) * 0.25 + Math.random() * 20 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const dunkPool = dunkCandidates.length >= 2 ? dunkCandidates
      : allActive.filter(p => p.age < 32)
          .sort((a, b) => (b.attributes.dunks || 0) + (b.attributes.jumping || 0) - ((a.attributes.dunks || 0) + (a.attributes.jumping || 0)))
          .slice(0, 4);

    return {
      year: state.season,
      day: state.currentDay,
      eastRoster: [...east.starters, ...east.reserves],
      westRoster: [...west.starters, ...west.reserves],
      eastStarters: east.starters,
      westStarters: west.starters,
      eastReserves: east.reserves,
      westReserves: west.reserves,
      injuryReplacements: [...east.replacements, ...west.replacements],
      voteEntries,
      skillsParticipants: skillsPool.map(p => p.id),
      threePtParticipants: threePtPool.map(p => p.id),
      dunkParticipants: dunkPool.map(p => p.id),
      completed: false,
    };
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
      difficulty: 'Pro', ownerMeterEnabled: true, salaryCap: 140000000, luxuryTaxLine: 160000000, injuryFrequency: 'Medium',
      tradeDifficulty: 'Realistic', rookieProgressionRate: 'Normal', vetDeclineRate: 100, simSpeed: 'Normal', godMode: false,
      seasonLength: 82, playerGenderRatio: 0, coachGenderRatio: 10, allowManualGenderEdits: true, b2bFrequency: 'Realistic',
      showAdvancedStats: true,
      franchiseName: name,
      startingYear: year,
      ...partialSettings
    };

    const requestedTeams = partialSettings.numTeams ?? 30;
    const freshTeams = generateLeagueTeams(genderRatio, year, finalSettings.tradableDraftPickSeasons ?? 4).slice(0, requestedTeams).map(t => ({
      ...t, needs: ['PG', 'C', 'SG', 'PF', 'SF'].sort(() => 0.5 - Math.random()).slice(0, 2) as Position[]
    }));
    const freshSchedule = generateSeasonSchedule(freshTeams, finalSettings.seasonLength, finalSettings.divisionGames, finalSettings.conferenceGames);
    const freshProspects = generateProspects(year, 100, genderRatio, finalSettings.prospectAgeMin ?? 19, finalSettings.prospectAgeMax ?? 21);
    const initialFAs = generateFreeAgentPool(25, year, genderRatio);
    const coachPool = generateCoachPool(30, finalSettings.coachGenderRatio, year);
    // Assign AI GM personalities to all non-user teams (userTeamId assigned at team selection)
    const teamsWithAI = freshTeams; // personalities applied after user picks team in handleSelectTeam
    
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
      gmProfile: initialGMProfile, teams: teamsWithAI, schedule: freshSchedule, isOffseason: false, offseasonDay: 0,
      draftPhase: 'scouting', prospects: freshProspects, freeAgents: initialFAs, coachPool, history: [],
      savedTrades: [], newsFeed: [], awardHistory: [], championshipHistory: [], transactions: [], settings: finalSettings,
      draftPicks: [], seasonPhase: 'Preseason' as SeasonPhase, tradeDeadlinePassed: false
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
    // Assign AI GM personalities now that we know which team the user picked
    const updatedWithAI = { ...updated, teams: assignAIPersonalities(updated.teams, teamId) };
    setLeague(updatedWithAI);
    setRosterTeamId(teamId);
    await db.leagues.put(updatedWithAI);
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

      const gamesPlayed  = team.wins + team.losses;
      const seasonLen    = newState.settings.seasonLength ?? 82;
      const tradeDeadline = Math.round(seasonLen * 0.50); // ~game 41 in an 82-game season
      const lateSeasonMark = Math.round(seasonLen * 0.75); // ~game 62

      // Never evaluate a firing before game 15
      if (gamesPlayed < 15) continue;

      const winPct         = team.wins / gamesPlayed;
      const expectedWins   = gamesPlayed * 0.5;
      const winDeficit     = expectedWins - team.wins; // positive = underperforming

      // Proxy for team morale / coach approval — average roster morale
      const rosterMorale   = team.roster.length > 0
        ? team.roster.reduce((s, p) => s + (p.morale ?? 50), 0) / team.roster.length
        : 50;
      const starMutiny     = team.roster.some(p => (p.morale ?? 50) < 45 && p.personalityTraits?.includes('Diva/Star'));
      const patience       = team.finances.ownerPatience;

      // ── Phase 1: Early season (games 15–30) — fire only in extreme crisis ──
      // Threshold: win% < .200 AND (avg morale < 30 OR patience < 20 OR star mutiny)
      // Daily roll: 0.8% chance when ALL extreme flags met
      let fireChance = 0;
      let fireReason = '';

      if (gamesPlayed <= 30) {
        const extremeRecord  = winPct < 0.200;
        const extremeMorale  = rosterMorale < 30;
        const extremePatience = patience < 20;
        if (extremeRecord && (extremeMorale || extremePatience || starMutiny)) {
          fireChance = 0.008; // ~0.8% per day — fires roughly once per 125 days at peak
          fireReason = `a catastrophic ${team.wins}-${team.losses} start and complete locker room breakdown`;
        }

      // ── Phase 2: Mid-season (games 31 – trade deadline) ──
      // Threshold: 10+ games below pace, morale < 50, streak ≤ -8 or patience < 40
      } else if (gamesPlayed <= tradeDeadline) {
        const behindPace     = winDeficit >= 10;
        const lowMorale      = rosterMorale < 50;
        const badStreak      = team.streak <= -8;
        const impatientOwner = patience < 40;
        if (behindPace && (lowMorale || badStreak) && impatientOwner) {
          fireChance = 0.10;
          fireReason = `falling ${Math.round(winDeficit)} games behind pace with a ${team.wins}-${team.losses} record`;
        } else if (starMutiny && behindPace) {
          fireChance = 0.06;
          fireReason = `star player unrest and a disappointing ${team.wins}-${team.losses} record`;
        }

      // ── Phase 3: Post-trade-deadline to late season (games tradeDeadline+1 – lateSeasonMark) ──
      // Threshold: win% < .400, patience < 35, morale < 55 or streak ≤ -6
      } else if (gamesPlayed <= lateSeasonMark) {
        const missingPlayoffs = winPct < 0.400;
        const impatientOwner  = patience < 35;
        const badStreak       = team.streak <= -6;
        const lowMorale       = rosterMorale < 55;
        if (missingPlayoffs && impatientOwner && (badStreak || lowMorale || starMutiny)) {
          fireChance = 0.13;
          fireReason = `a ${team.wins}-${team.losses} record and fading playoff hopes`;
        }

      // ── Phase 4: Late season (games lateSeasonMark+ ) ──
      // Aggressive: win% < .400 + patience < 30; or complete disaster win% < .300
      } else {
        if (winPct < 0.300 && patience < 40) {
          fireChance = 0.20;
          fireReason = `a dismal ${team.wins}-${team.losses} record in a lost season`;
        } else if (winPct < 0.400 && patience < 30 && team.streak <= -5) {
          fireChance = 0.15;
          fireReason = `missing the playoffs and a ${Math.abs(team.streak)}-game skid`;
        }
      }

      if (fireChance === 0 || Math.random() >= fireChance) continue;

      // ── FIRE ──
      newState = await addNewsItem(newState, 'firing', { team, coach: hc, detail: `Fired following ${fireReason}.` }, true);
      newState.transactions = recordTransaction(newState, 'firing', [team.id], `${team.name} fired Head Coach ${hc.name} following ${fireReason}.`);

      // Released coach returns to market
      const releasedPool = [...newState.coachPool, { ...hc, isInterim: false, desiredContract: { years: 2, salary: Math.floor(hc.salary * 0.9) }, interestScore: 50 }];
      newState = { ...newState, coachPool: releasedPool };

      // ── PROMOTE INTERIM HC ──
      const currentTeamState = newState.teams.find(t => t.id === team.id)!;
      const { interim, newStaff } = pickInterimCoach(currentTeamState.staff, newState.settings.coachGenderRatio ?? 10);
      const searchDays = 7 + Math.floor(Math.random() * 8); // 7–14 days

      newState = {
        ...newState,
        teams: newState.teams.map(t =>
          t.id === team.id
            ? { ...t, staff: newStaff, coachSearchDaysLeft: searchDays, finances: { ...t.finances, ownerPatience: 50 } }
            : t
        ),
      };

      newState = await addNewsItem(
        newState, 'hiring',
        { team: newState.teams.find(t => t.id === team.id) ?? team, coach: interim,
          detail: `${interim.name} named Interim Head Coach while ${team.name} conduct their permanent coaching search.` },
        false,
      );
      newState.transactions = recordTransaction(newState, 'hiring', [team.id], `${team.name} named ${interim.name} Interim Head Coach.`);
    }
    // Injury recovery — decrement days, auto-return when healed
    // Medical staff (budgets.health) grants a bonus recovery tick chance (0% at 20 → +40% at 100)
    const recovering: Array<{ player: Player; team: Team }> = [];
    newState = {
      ...newState,
      teams: newState.teams.map(t => {
        const medBudget = t.finances?.budgets?.health ?? 20;
        const bonusTickChance = ((medBudget - 20) / 80) * 0.40;
        return {
          ...t,
          roster: t.roster.map(p => {
            if (p.status !== 'Injured' && !(p.injuryDaysLeft != null && p.injuryDaysLeft > 0)) return p;
            const bonusTick = Math.random() < bonusTickChance ? 1 : 0;
            const daysLeft = (p.injuryDaysLeft ?? 1) - 1 - bonusTick;
            if (daysLeft <= 0) {
              recovering.push({ player: p, team: t });
              return { ...p, status: 'Rotation' as PlayerStatus, injuryType: undefined, injuryDaysLeft: 0 };
            }
            return { ...p, injuryDaysLeft: daysLeft };
          })
        };
      })
    };
    // News: player returns from injury
    for (const { player, team } of recovering) {
      newState = await addNewsItem(newState, 'injury', {
        player, team,
        detail: (() => {
          const injType = player.injuryType ?? 'injury';
          const templates = [
            `${player.name} has been cleared by the medical staff and will return to the rotation after missing time with a ${injType}.`,
            `Good news: ${player.name} is back. He's been given the green light following his ${injType} and is expected to make an immediate impact.`,
            `${player.name} rejoins the lineup today, recovering ahead of schedule from his ${injType}. The team gets a key piece back.`,
          ];
          return templates[Math.floor(Math.random() * templates.length)];
        })()
      }, false);
    }
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
        const illnessDetail = (() => {
          const d = days === 1 ? 'tomorrow' : `${days} days`;
          const templates = [
            `${unlucky.name} has been ruled out with an illness and is expected to return in ${d}. The team is being cautious.`,
            `${unlucky.name} won't suit up while dealing with a virus. Team officials say he's expected back within ${d}.`,
            `Practice bug hits ${unlucky.name}: he's listed as day-to-day with an illness, targeting a return in ${d}.`,
          ];
          return templates[Math.floor(Math.random() * templates.length)];
        })();
        newState = await addNewsItem(newState, 'injury', { player: unlucky, team, detail: illnessDetail }, false);
      }
    }
    // ── Off-court incident (rare, ~0.1% per team per day) ───────────────────
    if (!newState.isOffseason) {
      for (const team of newState.teams) {
        if (Math.random() >= 0.001) continue;
        const eligible = team.roster.filter(p =>
          !p.isSuspended &&
          p.status !== 'Injured' &&
          !p.personalityTraits?.includes('Professional'),
        );
        if (eligible.length === 0) continue;
        // Weight toward Hot Head and Diva/Star traits
        const weights = eligible.map(p =>
          (p.personalityTraits?.includes('Hot Head') ? 3 : 1) +
          (p.personalityTraits?.includes('Diva/Star') ? 1 : 0),
        );
        const totalW = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * totalW;
        let chosen: Player | null = null;
        for (let i = 0; i < eligible.length; i++) {
          rand -= weights[i];
          if (rand <= 0) { chosen = eligible[i]; break; }
        }
        if (!chosen) chosen = eligible[Math.floor(Math.random() * eligible.length)];
        const games = 2 + Math.floor(Math.random() * 4); // 2-5 games
        const reasons = ['Conduct Detrimental to the Team', 'Off-Court Altercation', 'League Policy Violation', 'Off-Court Incident'];
        const reason = reasons[Math.floor(Math.random() * reasons.length)];
        const gStr = `${games} game${games !== 1 ? 's' : ''}`;
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== team.id ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== chosen!.id ? p : {
              ...p,
              isSuspended: true,
              suspensionGamesLeft: games,
              suspensionReason: reason,
              morale: Math.max(0, (p.morale ?? 75) - 12),
            }),
          }),
        };
        const updatedTeam = newState.teams.find(t => t.id === team.id)!;
        const updatedPlayer = updatedTeam.roster.find(p => p.id === chosen!.id)!;
        const offCourtTemplates = [
          `${updatedPlayer.name} has been suspended ${gStr} by the ${updatedTeam.name} following an off-court incident. The team issued a brief statement citing conduct detrimental to the organization.`,
          `Breaking: ${updatedPlayer.name} of the ${updatedTeam.name} is suspended ${gStr} after an off-court altercation. The league is monitoring the situation.`,
          `The ${updatedTeam.name} announce a ${gStr} suspension for ${updatedPlayer.name} due to a league policy violation. He is expected to return after serving the ban.`,
          `${updatedPlayer.name} won't be available for ${gStr} after the league stepped in following a reported off-court incident. A distraction the ${updatedTeam.name} didn't need.`,
        ];
        newState = await addNewsItem(newState, 'injury', {
          player: updatedPlayer, team: updatedTeam,
          detail: offCourtTemplates[Math.floor(Math.random() * offCourtTemplates.length)],
        }, true);
      }
    }

    // Facilities morale boost — elite facilities add up to +20 baseline morale per week
    if (newState.currentDay % 7 === 0) {
      newState = {
        ...newState,
        teams: newState.teams.map(t => {
          const facBudget = t.finances?.budgets?.facilities ?? 20;
          const moraleBoost = ((facBudget - 20) / 80) * 20; // 0 at tier1, up to +20 at elite
          if (moraleBoost <= 0) return t;
          return {
            ...t,
            roster: t.roster.map(p => ({
              ...p,
              morale: Math.min(100, (p.morale ?? 75) + moraleBoost)
            }))
          };
        })
      };
    }
    if (newState.currentDay % 15 === 0) {
      const newCoach = generateCoach(`gen-coach-${Date.now()}`, 'C', newState.settings.coachGenderRatio);
      newState.coachPool = [newCoach, ...newState.coachPool].slice(0, 50);
    }
    if (newState.currentDay % 10 === 0) {
      const allPlayers = newState.teams.flatMap(t => t.roster);
      const unhappyDivas = allPlayers.filter(p => p.personalityTraits.includes('Diva/Star') && p.morale < 40);
      for (const unhappyDiva of unhappyDivas) {
        if (Math.random() > 0.7) {
          // Cooldown: one major trade-request rumor per player per 14-day window
          const cooldownId = `rumor-tradereq-${unhappyDiva.id}-w${Math.floor(newState.currentDay / 14)}`;
          if (!(newState.newsFeed ?? []).some(n => n.id === cooldownId)) {
            const team = newState.teams.find(t => t.roster.some(pl => pl.id === unhappyDiva.id))!;
            const lastName = unhappyDiva.name.split(' ').slice(-1)[0];
            const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
            const detail = pick([
              `${unhappyDiva.name} is reportedly frustrated with his role and has requested a trade.`,
              `${lastName}'s camp has informed the front office: he wants out. A formal trade request is expected.`,
              `${unhappyDiva.name} is seeking a change of scenery — sources say trade talks have quietly begun.`,
              `Frustration has boiled over: ${unhappyDiva.name} wants a trade and his morale is at an all-time low.`,
            ]);
            newState = {
              ...newState,
              newsFeed: [{ id: cooldownId, category: 'trade_request' as const, headline: 'TRADE_REQUEST', content: detail, timestamp: newState.currentDay, realTimestamp: Date.now(), teamId: team?.id, playerId: unhappyDiva.id, isBreaking: true }, ...(newState.newsFeed ?? [])].slice(0, 100),
            };
          }
        }
      }
    }

    if (newState.currentDay % 7 === 0) {
      const snapshot = calculatePowerRankings(newState);
      newState.powerRankingHistory = [...(newState.powerRankingHistory || []), snapshot].slice(-20);
    }

    // ── PERMANENT COACH SEARCH RESOLUTION ────────────────────────────────────
    // Each sim day ticks the countdown. When it hits 0 the AI team either
    // keeps the interim (40% chance if they're adequate) or hires from market.
    for (const searchTeam of newState.teams.filter(
      t => t.id !== newState.userTeamId && (t.coachSearchDaysLeft ?? 0) > 0,
    )) {
      const daysLeft = (searchTeam.coachSearchDaysLeft ?? 1) - 1;

      if (daysLeft > 0) {
        newState = {
          ...newState,
          teams: newState.teams.map(t =>
            t.id === searchTeam.id ? { ...t, coachSearchDaysLeft: daysLeft } : t,
          ),
        };
        continue;
      }

      // Search complete — decide: keep interim or hire from market
      const currentInterim = newState.teams.find(t => t.id === searchTeam.id)!.staff.headCoach;
      const keepInterim =
        currentInterim?.isInterim &&
        (currentInterim.ratingOffense + currentInterim.ratingDefense + currentInterim.ratingDevelopment) / 3 >= 60 &&
        Math.random() > 0.55; // ~45% chance to promote if ratings are decent

      if (keepInterim && currentInterim) {
        const permanent: Coach = { ...currentInterim, isInterim: false };
        newState = {
          ...newState,
          teams: newState.teams.map(t =>
            t.id === searchTeam.id
              ? { ...t, staff: { ...t.staff, headCoach: permanent }, coachSearchDaysLeft: undefined }
              : t,
          ),
        };
        newState = await addNewsItem(
          newState, 'hiring',
          { team: newState.teams.find(t => t.id === searchTeam.id) ?? searchTeam, coach: permanent,
            detail: `${searchTeam.name} promoted interim ${permanent.name} to permanent Head Coach after an impressive run.` },
          false,
        );
        newState.transactions = recordTransaction(newState, 'hiring', [searchTeam.id], `${searchTeam.name} promoted ${permanent.name} to permanent Head Coach.`);
      } else {
        // Hire from coach pool — prefer scheme match
        const poolHCCandidates = newState.coachPool.filter(c => c.role === 'Head Coach');
        const schemeHits = poolHCCandidates.filter(c => c.scheme === searchTeam.activeScheme);
        const picked = (schemeHits.length > 0 ? schemeHits : poolHCCandidates).sort(() => Math.random() - 0.5)[0]
          ?? generateCoach(`perm-${Date.now()}-${searchTeam.id}`, 'C', newState.settings.coachGenderRatio ?? 10);
        const permanent: Coach = { ...picked, salary: picked.salary ?? 3_000_000, contractYears: 3, isInterim: false };

        // Return old interim to pool if they were a promoted assistant
        const oldInterim = newState.teams.find(t => t.id === searchTeam.id)!.staff.headCoach;
        const poolAfterReturn = oldInterim?.isInterim
          ? [...newState.coachPool.filter(c => c.id !== picked.id), { ...oldInterim, role: 'Assistant Offense' as const, isInterim: false, desiredContract: { years: 2, salary: Math.floor(oldInterim.salary * 0.85) }, interestScore: 55 }]
          : newState.coachPool.filter(c => c.id !== picked.id);

        newState = {
          ...newState,
          teams: newState.teams.map(t =>
            t.id === searchTeam.id
              ? {
                  ...t,
                  staff: { ...t.staff, headCoach: permanent },
                  coachSearchDaysLeft: undefined,
                  // AI teams automatically adopt their new HC's preferred playbook
                  activeScheme: getCoachPreferredScheme(permanent),
                }
              : t,
          ),
          coachPool: poolAfterReturn,
        };
        newState = await addNewsItem(
          newState, 'hiring',
          { team: newState.teams.find(t => t.id === searchTeam.id) ?? searchTeam, coach: permanent,
            detail: `${searchTeam.name} officially hired ${permanent.name} as their new permanent Head Coach.` },
          false,
        );
        newState.transactions = recordTransaction(newState, 'hiring', [searchTeam.id], `${searchTeam.name} hired ${permanent.name} as permanent Head Coach.`);
      }
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
    const t1 = result.homeTeamId;
    const t2 = result.awayTeamId;

    // Find existing entry index so we can replace it (immutable update, no shared-ref mutation)
    const existingIdx = (state.rivalryHistory || []).findIndex(
      r => (r.team1Id === t1 && r.team2Id === t2) || (r.team1Id === t2 && r.team2Id === t1)
    );
    const history = [...(state.rivalryHistory || [])];

    // Work on a copy of the found entry (or a brand-new one)
    let rivalry: RivalryStats = existingIdx >= 0
      ? { ...history[existingIdx] }
      : { team1Id: t1, team2Id: t2, team1Wins: 0, team2Wins: 0, totalGames: 0, lastFiveGames: [], playoffSeriesCount: 0, buzzerBeaters: 0, comebacks: 0, otGames: 0, badBloodScore: 0 };

    const isT1Home = rivalry.team1Id === result.homeTeamId;
    const t1Won = (isT1Home && result.homeScore > result.awayScore) || (!isT1Home && result.awayScore > result.homeScore);

    rivalry.totalGames += 1;
    if (t1Won) rivalry.team1Wins += 1; else rivalry.team2Wins += 1;

    // Season H2H — reset counters when a new season starts
    if (!rivalry.seasonH2H || rivalry.seasonH2H.season !== result.season) {
      rivalry.seasonH2H = { season: result.season, team1Wins: 0, team2Wins: 0 };
    } else {
      rivalry.seasonH2H = { ...rivalry.seasonH2H };
    }
    if (t1Won) rivalry.seasonH2H.team1Wins += 1; else rivalry.seasonH2H.team2Wins += 1;

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
      if (p.techs > 0) rivalry.badBloodScore += p.techs;
      if (p.flagrants > 0) rivalry.badBloodScore += p.flagrants * 1.5;
    });

    // Place the updated copy back into the new array
    if (existingIdx >= 0) history[existingIdx] = rivalry;
    else history.push(rivalry);

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
           // ownerPatienceLevel scales how fast patience moves
           const patienceFactor = state.settings.ownerPatienceLevel === 'Low' ? 2.0
             : state.settings.ownerPatienceLevel === 'High' ? 0.5
             : 1.0;
           patienceDelta *= patienceFactor;
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
          // No line, or DNP (injured/inactive) — leave all stats untouched
          if (!line || line.dnp) return p;
          const newTechs = (p.stats.techs || 0) + (line.techs || 0);
          const newFlagrants = (p.stats.flagrants || 0) + (line.flagrants || 0);
          const newEjections = (p.stats.ejections || 0) + (line.ejected ? 1 : 0);
          
          // Preserve suspension state; countdown + new triggers handled below
          const isSuspended = p.isSuspended ?? false;
          const suspensionGames = p.suspensionGames ?? 0; // legacy compat
          const suspensionGamesLeft = p.suspensionGamesLeft ?? 0;
          const suspensionReason = p.suspensionReason;

          let morale = p.morale ?? 75;
          const traits = p.personalityTraits ?? [];
          const teamStreak = team.streak;

          // ── Win/Loss base effect ──────────────────────────────────────────
          if (isWinner) {
            morale += traits.includes('Loyal') ? 1.5 : 1.0;
          } else {
            morale += traits.includes('Lazy') ? -1.8 : traits.includes('Leader') ? -0.8 : -1.2;
          }

          // ── Playing time / role satisfaction ─────────────────────────────
          const prefMinsByStatus = p.status === 'Starter' ? 28 : p.status === 'Rotation' ? 18 : 10;
          const minDiff = line.min - prefMinsByStatus;
          if (minDiff < -12) {
            // Significantly under expected minutes
            morale += traits.includes('Diva/Star') ? -2.5 : -1.2;
          } else if (minDiff < -6) {
            morale += traits.includes('Diva/Star') ? -1.5 : -0.6;
          } else if (minDiff > 6 && p.status !== 'Starter') {
            morale += 0.5; // rewarded with extra run
          }

          // ── Scorer usage satisfaction ─────────────────────────────────────
          // High-rating scorers (OVR ≥ 80) want touches; low FGA = frustration
          if (p.rating >= 80) {
            const expectedFga = p.status === 'Starter' ? 10 : 6;
            if (line.fga < expectedFga - 4) morale -= 1.0;
            else if (line.fga > expectedFga + 3) morale += 0.3;
          }

          // ── Personality trait effects ─────────────────────────────────────
          if (traits.includes('Leader') && isWinner) morale += 0.5;
          if (traits.includes('Gym Rat'))             morale += 0.3;
          if (traits.includes('Workhorse') && line.min >= 28) morale += 0.4;
          if (traits.includes('Professional'))        morale += 0.2;
          if (traits.includes('Friendly/Team First')) morale += isWinner ? 0.6 : 0.2;
          if (traits.includes('Money Hungry'))        morale -= 0.3; // perpetually somewhat dissatisfied
          if (traits.includes('Hot Head') && !isWinner) morale -= 0.8;
          if (traits.includes('Clutch') && isWinner)  morale += 0.4;
          if (traits.includes('Diva/Star') && p.status === 'Bench') morale -= 0.8;

          // ── Playbook fit (per-game, small accumulation) ───────────────────
          // Matching the coach's preferred scheme makes players more comfortable;
          // mismatches frustrate scorers and Diva/Star personalities.
          {
            const hc = team.staff?.headCoach;
            if (hc) {
              const preferred = getCoachPreferredScheme(hc);
              const isMatch = team.activeScheme === preferred;
              if (isMatch) {
                // Good fit: small morale boost for offensive players
                if (p.rating >= 78) morale += 0.10;
              } else {
                // Mismatch: scorers and divas chafe under a foreign system
                if (traits.includes('Diva/Star'))             morale -= 0.25;
                if (p.attributes.shooting > 82 && team.activeScheme === 'Grit and Grind') morale -= 0.15;
                if ((p.attributes.postScoring ?? 50) < 60 && team.activeScheme === 'Grit and Grind') morale -= 0.10;
              }
            }
          }

          // ── Streak momentum ──────────────────────────────────────────────
          if (teamStreak >= 4) morale += 0.5;
          else if (teamStreak >= 2) morale += 0.2;
          else if (teamStreak <= -4) morale -= 0.6;
          else if (teamStreak <= -2) morale -= 0.3;

          // ── Natural morale drift toward baseline ─────────────────────────
          // Prevents morale from staying pinned at extremes indefinitely
          const baseline = 72 + (p.rating - 65) * 0.1; // better players have slightly higher baseline
          morale += (baseline - morale) * 0.03;

          morale = Math.min(100, Math.max(0, morale));

          return {
            ...p,
            isSuspended,
            suspensionGames,      // legacy
            suspensionGamesLeft,
            suspensionReason,
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
    // Track morale before update for delta-based news
    const moraleBeforeById = new Map<string, number>();
    [homeTeam, awayTeam].forEach(t => t.roster.forEach(p => moraleBeforeById.set(p.id, p.morale ?? 75)));

    updatedTeams = updatedTeams.map(t => {
      const isWinner = (t.id === homeTeam.id && homeWon) || (t.id === awayTeam.id && !homeWon);
      if (t.id === homeTeam.id) return updateStats(t, result.homePlayerStats, isWinner);
      if (t.id === awayTeam.id) return updateStats(t, result.awayPlayerStats, isWinner);
      return t;
    });

    // Apply trade block for chronically unhappy Diva/Stars, and flag big morale drops
    updatedTeams = updatedTeams.map(t => ({
      ...t,
      roster: t.roster.map(p => {
        if (p.morale < 30 && p.personalityTraits?.includes('Diva/Star') && !p.onTradeBlock) {
          return { ...p, onTradeBlock: true };
        }
        return p;
      })
    }));

    const rivalryHistory = updateRivalryStats(state, result);
    const gameAttendance = computeGameAttendance(homeTeam, awayTeam);
    newState = { ...state, teams: updatedTeams, history: [result, ...state.history], schedule: state.schedule.map(sg => sg.id === gameId ? { ...sg, played: true, resultId: result.id, attendance: gameAttendance } : sg), rivalryHistory };

    // Generate morale-based news (only for user team, deduplicated per player per cooldown window)
    const userTeamUpdated = newState.teams.find(t => t.id === newState.userTeamId);
    if (userTeamUpdated) {
      const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      for (const p of userTeamUpdated.roster) {
        const prevMorale = moraleBeforeById.get(p.id) ?? 75;
        const gp = p.stats.gamesPlayed;

        // Morale crosses 50 — post at most once per 7-day window per player
        if (prevMorale >= 50 && p.morale < 50 && gp % 5 === 0) {
          const cooldownId = `rumor-frustrated-${p.id}-w${Math.floor(newState.currentDay / 7)}`;
          if (!(newState.newsFeed ?? []).some(n => n.id === cooldownId)) {
            const avgMpg = gp > 0 ? (p.stats.minutes / gp).toFixed(1) : null;
            const lastName = p.name.split(' ').slice(-1)[0];
            const detail = pick([
              `${p.name} is frustrated — morale has dropped to a concerning level. Expect a performance dip.`,
              `${lastName}'s confidence is wavering. Sources inside the locker room say he's not happy with his situation.`,
              ...(avgMpg ? [`${p.name} is struggling with his usage. Averaging ${avgMpg} MPG isn't what he expected when he signed.`] : []),
            ]);
            newState = {
              ...newState,
              newsFeed: [{ id: cooldownId, category: 'transaction' as const, headline: 'TRANSACTION', content: detail, timestamp: newState.currentDay, realTimestamp: Date.now(), teamId: userTeamUpdated.id, playerId: p.id, isBreaking: false }, ...(newState.newsFeed ?? [])].slice(0, 100),
            };
          }
        } else if (prevMorale >= 35 && p.morale < 35 && p.personalityTraits?.includes('Diva/Star')) {
          // Deeply unhappy Diva — cooldown of 12 sim days per player
          const cooldownId = `rumor-deeplyunhappy-${p.id}-w${Math.floor(newState.currentDay / 12)}`;
          if (!(newState.newsFeed ?? []).some(n => n.id === cooldownId)) {
            const avgMpg = gp > 0 ? (p.stats.minutes / gp).toFixed(1) : null;
            const onLossStreak = userTeamUpdated.streak <= -3;
            const lastName = p.name.split(' ').slice(-1)[0];
            const city = userTeamUpdated.city;
            const detail = pick([
              `${p.name} is frustrated with his limited role — sources say he's exploring trade options.`,
              `${lastName}'s morale has dropped significantly. He's been vocal about wanting more minutes.`,
              `Tension in ${city}: ${lastName} reportedly unhappy with his usage. Trade talks could heat up.`,
              `${p.name} feels underutilized — expects a bigger role or a change of scenery.`,
              ...(avgMpg ? [`${p.name} averaging just ${avgMpg} MPG — his camp has made clear this isn't what he signed up for.`] : []),
              ...(onLossStreak ? [`${city}'s losing skid has taken a toll: ${lastName} is reportedly unhappy and his future with the team is uncertain.`] : []),
            ]);
            newState = {
              ...newState,
              newsFeed: [{ id: cooldownId, category: 'rumor' as const, headline: 'RUMOR', content: detail, timestamp: newState.currentDay, realTimestamp: Date.now(), teamId: userTeamUpdated.id, playerId: p.id, isBreaking: true }, ...(newState.newsFeed ?? [])].slice(0, 100),
            };
          }
        }
      }
    }

    // News for ejections
    const allLines = [...result.homePlayerStats, ...result.awayPlayerStats];
    const ejectedPlayers = allLines.filter(l => l.ejected);
    for (const pLine of ejectedPlayers) {
      const team = newState.teams.find(t => t.id === (result.homePlayerStats.some(h => h.playerId === pLine.playerId) ? result.homeTeamId : result.awayTeamId))!;
      const player = team.roster.find(p => p.id === pLine.playerId)!;
      const ejDetail = (() => {
        const templates = [
          `${player.name} was ejected after a heated exchange escalated beyond control. He'll be subject to league review.`,
          `Tempers flared and ${player.name} paid the price — thrown out after a second technical. His team finishes shorthanded.`,
          `${player.name} loses his cool and gets the early exit. The crowd erupts as the benches empty briefly.`,
          `${player.name} is gone — two technicals, no argument. The rivalry just got another chapter.`,
        ];
        return templates[Math.floor(Math.random() * templates.length)];
      })();
      newState = await addNewsItem(newState, 'injury', { player, team, detail: ejDetail }, true);
    }

    // ── Suspension countdown: decrement for both teams that just played ────
    const suspensionCleared: Array<{ player: Player; team: Team }> = [];
    newState = {
      ...newState,
      teams: newState.teams.map(t => {
        if (t.id !== result.homeTeamId && t.id !== result.awayTeamId) return t;
        return {
          ...t,
          roster: t.roster.map(p => {
            if (!p.isSuspended || (p.suspensionGamesLeft ?? 0) <= 0) return p;
            const gamesLeft = (p.suspensionGamesLeft ?? 1) - 1;
            if (gamesLeft <= 0) {
              suspensionCleared.push({ player: p, team: t });
              return { ...p, isSuspended: false, suspensionGamesLeft: 0, suspensionReason: undefined };
            }
            return { ...p, suspensionGamesLeft: gamesLeft };
          }),
        };
      }),
    };
    for (const { player, team } of suspensionCleared) {
      const returnTemplates = [
        `${player.name} has served his suspension and is cleared to return to the ${team.name} lineup.`,
        `${player.name}'s suspension is over. He's eligible to play in the ${team.name}'s next game.`,
        `The league has reinstated ${player.name}. He rejoins the ${team.name} rotation immediately.`,
      ];
      newState = await addNewsItem(newState, 'injury', {
        player, team, detail: returnTemplates[Math.floor(Math.random() * returnTemplates.length)],
      }, false);
    }

    // ── Process new suspension triggers from this game ───────────────────
    if (result.gameSuspensions && result.gameSuspensions.length > 0) {
      for (const trigger of result.gameSuspensions) {
        // Determine games suspended
        let games: number;
        let reason: string;
        if (trigger.reason === 'flagrant2') {
          // 1 game (50%), 2 games (35%), 3 games (15%)
          const r = Math.random();
          games = r < 0.50 ? 1 : r < 0.85 ? 2 : 3;
          reason = 'Flagrant 2 Foul';
        } else {
          // double-tech: 80% no suspension, 20% 1 game
          games = Math.random() < 0.20 ? 1 : 0;
          reason = 'Unsportsmanlike Conduct';
        }
        if (games === 0) continue;

        // Apply suspension
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== trigger.teamId ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== trigger.playerId ? p : {
              ...p,
              isSuspended: true,
              suspensionGamesLeft: games,
              suspensionReason: reason,
              morale: Math.max(0, (p.morale ?? 75) - 8),
            }),
          }),
        };

        // Morale dip for teammates
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== trigger.teamId ? t : {
            ...t,
            roster: t.roster.map(p => p.id === trigger.playerId ? p : {
              ...p, morale: Math.max(0, (p.morale ?? 75) - 2),
            }),
          }),
        };

        const susTeam = newState.teams.find(t => t.id === trigger.teamId)!;
        const susPlayer = susTeam?.roster.find(p => p.id === trigger.playerId);
        if (susPlayer && susTeam) {
          const gStr = games === 1 ? '1 game' : `${games} games`;
          const susTemplates = trigger.reason === 'flagrant2' ? [
            `${susPlayer.name} has been suspended ${gStr} by the league following a Flagrant 2 foul. The ${susTeam.name} will be shorthanded.`,
            `The league office has handed ${susPlayer.name} a ${gStr} suspension after his ejection for a Flagrant 2. ${susTeam.name} must adjust their rotation.`,
            `${susPlayer.name} suspended ${gStr} — Flagrant 2 foul reviewed and penalized. A costly absence for the ${susTeam.name}.`,
          ] : [
            `${susPlayer.name} is suspended ${gStr} after his double-technical ejection. The league cited unsportsmanlike conduct.`,
            `The ${susTeam.name} will be without ${susPlayer.name} for ${gStr} following his two-technical ejection and league review.`,
          ];
          newState = await addNewsItem(newState, 'injury', {
            player: susPlayer, team: susTeam,
            detail: susTemplates[Math.floor(Math.random() * susTemplates.length)],
          }, true);
        }
      }
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
        // Injury morale hit: short = -5, long = -12
        const injMoraleDrop = inj.daysOut >= 14 ? -12 : -5;
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== inj.teamId ? t : {
            ...t, roster: t.roster.map(p => p.id !== inj.playerId ? p : {
              ...p, morale: Math.max(0, Math.min(100, (p.morale ?? 75) + injMoraleDrop))
            })
          })
        };
        newState = await addNewsItem(newState, 'injury', {
          player: injPlayer, team: injTeam,
          detail: (() => {
            const timeStr = wks ? wks.trim() : `${inj.daysOut} day${inj.daysOut !== 1 ? 's' : ''}`;
            const severe = inj.daysOut >= 21;
            const templates = severe ? [
              `${injPlayer.name} is set for an extended absence after suffering a ${inj.injuryType}. Timeline: ${timeStr}. A significant blow to the team.`,
              `${injPlayer.name} exits with a ${inj.injuryType} and faces a lengthy recovery — the team is scrambling to adjust their rotation. Expected out ${timeStr}.`,
              `Devastating news: ${injPlayer.name} is down with a ${inj.injuryType}. He'll miss approximately ${timeStr}, a serious setback for his squad.`,
            ] : [
              `${injPlayer.name} left the floor with a ${inj.injuryType}. He's expected to miss ${timeStr} and will be re-evaluated as he progresses.`,
              `${injPlayer.name} rolls out of tonight's game with a ${inj.injuryType}. Expected return: ${timeStr}.`,
              `Trainers confirm ${injPlayer.name} has a ${inj.injuryType}. He'll be out approximately ${timeStr} — the team hopes the timeline is conservative.`,
            ];
            return templates[Math.floor(Math.random() * templates.length)];
          })()
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
      const result = simulateGame(homeTeam, awayTeam, newState.currentDay, newState.season, game.homeB2B, game.awayB2B, rivalryLevel, newState.settings);
      result.id = game.id;
      if (homeTeam.id === state.userTeamId || awayTeam.id === state.userTeamId) dayResults.push(result);
      newState = await finalizeGameResult(newState, game.id, result);
    }
    newState = await processDailyLeagueEvents(newState);

    // ── 10-game win% reality check (advisory only, no sim changes) ──
    const uTeam = newState.teams.find(t => t.id === newState.userTeamId);
    if (uTeam) {
      const totalUserGames = uTeam.wins + uTeam.losses;
      if (totalUserGames > 0 && totalUserGames % 10 === 0) {
        const userWinPct = uTeam.wins / totalUserGames;
        // League avg win% is always 0.500 (zero-sum), threshold is 65%
        if (userWinPct > 0.65) {
          const existing = (newState.newsFeed ?? []).find(
            n => n.id === `winpct-check-${totalUserGames}`);
          if (!existing) {
            newState = {
              ...newState,
              newsFeed: [{
                id: `winpct-check-${totalUserGames}`,
                category: 'milestone' as const,
                headline: '📊 PERFORMANCE ADVISORY',
                content: `After ${totalUserGames} games your team is winning at ${Math.round(userWinPct * 100)}% — significantly above the 50% league average. You may be outperforming expectations. Consider raising difficulty in Settings if you want a greater challenge.`,
                timestamp: newState.currentDay,
                realTimestamp: Date.now(),
                isBreaking: false,
              }, ...newState.newsFeed],
            };
          }
        }
      }
    }

    // ── AI in-season trades (~weekly, during regular season) ──
    if (!newState.isOffseason && newState.currentDay % 7 === 0 && !newState.tradeDeadlinePassed) {
      try {
        const tradeResult = aiGMInSeasonTrades(newState, newState.settings.difficulty ?? 'Medium');
        if (tradeResult.newsItems.length > 0) {
          newState = {
            ...tradeResult.updatedState,
            newsFeed: [...tradeResult.newsItems, ...(newState.newsFeed || [])].slice(0, 200),
            transactions: [...tradeResult.transactions, ...(newState.transactions || [])].slice(0, 1000),
          };
        } else {
          newState = tradeResult.updatedState;
        }
      } catch (_e) { /* non-fatal */ }

      // ── Generate incoming AI-to-user trade proposals ──
      try {
        const newProposals = generateAITradeProposalsForUser(newState, newState.settings.difficulty ?? 'Medium');
        if (newProposals.length > 0) {
          newState = {
            ...newState,
            incomingTradeProposals: [
              ...newProposals,
              ...(newState.incomingTradeProposals ?? []),
            ].slice(0, 20),
          };
        }
      } catch (_e) { /* non-fatal */ }
    }

    // ── AI in-season signings (~30% chance per sim-day when FAs available) ──
    // After trade deadline, AI teams sign more aggressively for the playoff push
    const postDeadlineSigningThreshold = newState.tradeDeadlinePassed ? 13 : 10;
    if (!newState.isOffseason && newState.freeAgents.length > 0 && Math.random() < 0.3) {
      const cap = newState.settings.salaryCap || 140_000_000;
      const aiTeamsNeedingHelp = newState.teams.filter(t => {
        if (t.id === newState.userTeamId) return false;
        const activeRoster = t.roster.filter(p => !p.injuryDaysLeft || p.injuryDaysLeft === 0);
        return activeRoster.length < postDeadlineSigningThreshold;
      });
      if (aiTeamsNeedingHelp.length > 0) {
        const team = aiTeamsNeedingHelp[Math.floor(Math.random() * aiTeamsNeedingHelp.length)];
        const teamSalary = team.roster.reduce((s, p) => s + (p.salary || 0), 0);
        const teamCapSpace = cap - teamSalary;
        const minSalary = 600_000;
        if (teamCapSpace >= minSalary) {
          const eligible = newState.freeAgents.filter(fa => (fa.desiredContract?.salary || 600_000) <= teamCapSpace * 1.2);
          if (eligible.length > 0) {
            const fa = eligible[Math.floor(Math.random() * Math.min(5, eligible.length))];
            const rawSalary = Math.round((fa.desiredContract?.salary || 1_500_000) * (0.8 + Math.random() * 0.3) / 250_000) * 250_000;
            const salary = Math.max(600_000, Math.min(rawSalary, teamCapSpace));
            const signingType = salary <= 700_000 ? '10-day' : 'rest-of-season minimum';
            const signedPlayer = { ...fa, isFreeAgent: false, inSeasonFA: false, salary, contractYears: 1, morale: Math.min(100, (fa.morale || 70) + 5) };
            newState = {
              ...newState,
              teams: newState.teams.map(t => t.id === team.id ? { ...t, roster: [...t.roster, signedPlayer] } : t),
              freeAgents: newState.freeAgents.filter(p => p.id !== fa.id),
              newsFeed: [{
                id: `in-season-sign-${Date.now()}-${fa.id}`,
                category: 'transaction' as const,
                headline: `${fa.name} agrees to terms with ${team.name}`,
                content: `The ${team.name} agree to terms with ${fa.name} (${fa.position}, ${fa.rating} OVR) on a ${signingType} deal worth $${(salary / 1_000_000).toFixed(1)}M.`,
                timestamp: newState.currentDay,
                realTimestamp: Date.now(),
                isBreaking: false,
              }, ...newState.newsFeed].slice(0, 200),
            };
          }
        }
      }
    }

    // ── Season Phase Milestones (trade deadline & all-star, checked every sim day) ──
    if (!newState.isOffseason && !newState.playoffBracket) {
      const totalGames = newState.schedule.length;
      const playedGames = newState.schedule.filter(g => g.played).length;
      const pct = totalGames > 0 ? playedGames / totalGames : 0;

      // Trade Deadline
      if (!newState.tradeDeadlinePassed) {
        const tdSetting = newState.settings.tradeDeadline;
        const deadlinePct = tdSetting === 'Disabled' ? null
          : tdSetting === 'Week 14' ? 0.56
          : tdSetting === 'Week 16' ? 0.63
          : 0.49;
        if (deadlinePct !== null && pct >= deadlinePct) {
          // Expire any pending incoming trade proposals — window is now closed
          const expiredProposals = (newState.incomingTradeProposals ?? []).map(p =>
            p.status === 'incoming' ? { ...p, status: 'rejected' as const } : p
          );
          newState = { ...newState, tradeDeadlinePassed: true, seasonPhase: 'Trade Deadline' as SeasonPhase, incomingTradeProposals: expiredProposals };
          try {
            const aiDeadlineResult = aiGMTradeDeadlineAction(newState);
            newState = aiDeadlineResult.updatedState;
            if (aiDeadlineResult.newsItems?.length > 0) {
              newState = { ...newState, newsFeed: [...aiDeadlineResult.newsItems, ...(newState.newsFeed || [])].slice(0, 100) };
            }
          } catch (_e) {}
          newState = {
            ...newState,
            newsFeed: [{
              id: `trade-deadline-${newState.season}`,
              category: 'transaction' as NewsCategory,
              headline: 'TRADE DEADLINE',
              content: `The trade deadline has passed! No more trades can be made until next season. Teams must go with the rosters they have for the playoff push.`,
              timestamp: newState.currentDay,
              realTimestamp: Date.now(),
              isBreaking: true,
            }, ...(newState.newsFeed || [])],
          };
          setActiveTab('news');
        }
      }

      // All-Star Weekend
      if (newState.tradeDeadlinePassed && !newState.allStarWeekend && pct >= 0.73) {
        const asd = buildAllStarWeekend(newState);
        // Auto-sim all events immediately — season sim continues without manual interaction
        const completedAsd = autoSimAllStarWeekend(newState, asd);
        newState = { ...newState, allStarWeekend: completedAsd, seasonPhase: 'All-Star Weekend' as SeasonPhase };
        const mvp = completedAsd.allStarGame?.mvp;
        const confWon = completedAsd.allStarGame
          ? (completedAsd.allStarGame.eastScore > completedAsd.allStarGame.westScore ? 'East' : 'West')
          : '';
        const gameScore = completedAsd.allStarGame
          ? `${Math.max(completedAsd.allStarGame.eastScore, completedAsd.allStarGame.westScore)}-${Math.min(completedAsd.allStarGame.eastScore, completedAsd.allStarGame.westScore)}`
          : '';
        const eastStarters = asd.eastStarters.map(id => {
          for (const t of newState.teams) { const p = t.roster.find(pl => pl.id === id); if (p) return p.name; }
          return id;
        });
        const westStarters = asd.westStarters.map(id => {
          for (const t of newState.teams) { const p = t.roster.find(pl => pl.id === id); if (p) return p.name; }
          return id;
        });
        newState = {
          ...newState,
          newsFeed: [
            ...(mvp ? [{
              id: `allstar-game-${newState.season}`,
              category: 'milestone' as NewsCategory,
              headline: 'ALL-STAR GAME FINAL',
              content: `${confWon} defeats ${confWon === 'East' ? 'West' : 'East'} ${gameScore}! ${mvp.playerName} (${mvp.statLine}) named All-Star Game MVP!`,
              timestamp: newState.currentDay,
              realTimestamp: Date.now(),
              isBreaking: true,
            }] : []),
            {
              id: `allstar-reveal-${newState.season}`,
              category: 'milestone' as NewsCategory,
              headline: 'ALL-STAR WEEKEND COMPLETE',
              content: `All-Star Weekend is in the books! East starters: ${eastStarters.join(', ')}. West starters: ${westStarters.join(', ')}.`,
              timestamp: newState.currentDay,
              realTimestamp: Date.now(),
              isBreaking: false,
            },
            ...(newState.newsFeed || []),
          ],
        };
        setActiveTab('allstar');
      }

      // Phase tracking — reset to Regular Season once All-Star is done
      if (newState.allStarWeekend?.completed && newState.seasonPhase === 'All-Star Weekend') {
        newState = { ...newState, seasonPhase: 'Regular Season' as SeasonPhase };
      }
    }

    return { newState: { ...newState, currentDay: newState.currentDay + 1 }, dayResults };
  };

  const handleSimulate = async (mode: 'next' | 'day' | 'week' | 'month' | 'season' | 'to-game' | 'x-games' | 'single-instant' | 'to-deadline' | 'to-allstar', targetGameId?: string, numGames?: number) => {
    if (!league) return;
    if (mode === 'single-instant' && targetGameId) {
      const game = league.schedule.find(g => g.id === targetGameId)!;
      const home = league.teams.find(t => t.id === game.homeTeamId)!;
      const away = league.teams.find(t => t.id === game.awayTeamId)!;
      const rivalry = league.rivalryHistory?.find(r => (r.team1Id === home.id && r.team2Id === away.id) || (r.team1Id === away.id && r.team2Id === home.id));
      const rivalryLevel = getRivalryLevel(rivalry);
      const result = simulateGame(home, away, league.currentDay, league.season, game.homeB2B, game.awayB2B, rivalryLevel, league.settings);
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
    } else if (mode === 'to-deadline') {
      // Sim until the trade deadline triggers (tradeDeadlinePassed flips to true)
      while (tempState.currentDay < 500 && !tempState.tradeDeadlinePassed && tempState.schedule.some(g => !g.played)) {
        const step = await executeSimDay(tempState);
        tempState = step.newState;
        processResults(step.dayResults);
      }
    } else if (mode === 'to-allstar') {
      // Sim until All-Star Weekend is created
      while (tempState.currentDay < 500 && !tempState.allStarWeekend && tempState.schedule.some(g => !g.played)) {
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

    // ── Phase tracking fallback (milestones are now triggered inside executeSimDay) ──
    if (!tempState.isOffseason && !tempState.playoffBracket) {
      const totalGames = tempState.schedule.length;
      const playedGames = tempState.schedule.filter(g => g.played).length;
      const pct = totalGames > 0 ? playedGames / totalGames : 0;
      const tdSetting = tempState.settings.tradeDeadline;
      const deadlinePct = tdSetting === 'Disabled' ? null
        : tdSetting === 'Week 14' ? 0.56
        : tdSetting === 'Week 16' ? 0.63
        : 0.49;
      if (tempState.allStarWeekend?.completed && tempState.seasonPhase === 'All-Star Weekend') {
        tempState = { ...tempState, seasonPhase: 'Regular Season' as SeasonPhase };
      }
      if (!tempState.tradeDeadlinePassed && pct > 0 && (deadlinePct === null || pct < deadlinePct)) {
        tempState = { ...tempState, seasonPhase: 'Regular Season' as SeasonPhase };
      }
      if (pct === 0 && tempState.seasonPhase !== 'Regular Season') {
        tempState = { ...tempState, seasonPhase: 'Preseason' as SeasonPhase };
      }
    }

    if (!tempState.isOffseason && !tempState.schedule.some(g => !g.played) && !tempState.playoffBracket) {
      const seasonAwards = await generateAwards(tempState.teams, tempState.season, tempState.settings.playerGenderRatio);
      
      if (seasonAwards.executiveOfTheYear.teamId === tempState.userTeamId) {
        const gm = tempState.gmProfile;
        tempState.gmProfile = {
          ...gm,
          eoyWins: [...gm.eoyWins, tempState.season],
          reputation: Math.min(100, gm.reputation + 15),
          milestones: [...gm.milestones, {
            id: `eoy-${Date.now()}`, year: tempState.season, day: tempState.currentDay, text: `Awarded Executive of the Year after leading the ${tempState.teams.find(t=>t.id===tempState.userTeamId)!.name} to ${tempState.teams.find(t=>t.id===tempState.userTeamId)!.wins} wins.`, type: 'award'
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
      tempState.seasonPhase = 'Playoffs' as SeasonPhase;
      setActiveTab('playoffs');
      tempState = await addNewsItem(tempState, 'playoffs', { detail: `The Regular Season has concluded. Playoff seeds are locked!` }, true);
    }
    setLeague(tempState);
    setLoading(false);
  };

  const handleStartOffseason = async () => {
    if (!league) return;
    setLoading(true);
    try {
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

    tempState.gmProfile = { ...tempState.gmProfile, totalSeasons: tempState.gmProfile.totalSeasons + 1 };
    tempState.playoffBracket = undefined;
    tempState.isOffseason = true;
    tempState.seasonPhase = 'Offseason' as SeasonPhase;
    tempState.tradeDeadlinePassed = false;
    // allStarWeekend is preserved here so results remain viewable during offseason/playoffs
    // It is cleared when the new season schedule begins (handleAdvanceToRegularSeason)
    tempState.draftPhase = 'lottery';
    tempState.offseasonDay = 0;
    
    const rookieSetting = tempState.settings.rookieProgressionRate || 'Normal';
    const rookieMultiplier = rookieSetting === 'Slow' ? 0.7 : rookieSetting === 'Fast' ? 1.3 : 1.0;
    const vetRate = (tempState.settings.vetDeclineRate || 100) / 100;

    // Auto-extend franchise stars (88+ OVR) for AI teams before expiry processing
    tempState.teams = tempState.teams.map(t => {
      if (t.id === tempState.userTeamId) return t; // user manages their own extensions
      const currentPayroll = t.roster.reduce((sum, p) => sum + (p.salary || 0), 0);
      const cap = tempState.settings.salaryCap ?? 136_000_000;
      const updatedRoster = t.roster.map(p => {
        if (p.contractYears > 1) return p;       // not expiring
        if (p.rating < 88) return p;             // not a franchise star
        if ((p.morale ?? 75) < 60) return p;     // unhappy — let them walk
        const extSalary = Math.round((
          p.rating >= 95 ? 38_000_000 + (p.rating - 95) * 1_400_000 :
                           26_000_000 + (p.rating - 88) * 1_714_286
        ) / 250_000) * 250_000;
        if (currentPayroll + extSalary > cap * 1.1) return p; // not enough cap
        return { ...p, contractYears: 3 + Math.floor(Math.random() * 2), salary: extSalary };
      });
      return { ...t, roster: updatedRoster };
    });

    // Collect expired-contract players BEFORE updating rosters
    const expiredPlayers: Player[] = [];
    tempState.teams.forEach(t => {
      t.roster.forEach(p => {
        if (p.contractYears <= 1) {
          // Player enters free agency
          const _r = p.rating;
          const desiredBase = Math.round((
            _r >= 95 ? 38_000_000 + (_r - 95) * 1_400_000 :
            _r >= 88 ? 26_000_000 + (_r - 88) * 1_714_286 :
            _r >= 80 ? 16_000_000 + (_r - 80) * 1_250_000 :
            _r >= 70 ? 7_000_000  + (_r - 70) * 900_000   :
            _r >= 60 ? 3_000_000  + (_r - 60) * 400_000   : 1_500_000
          ) / 250_000) * 250_000;
          const desiredYears = p.rating >= 80 ? 4 : p.rating >= 70 ? 3 : p.age >= 33 ? 1 : 2;
          // Interest in user's team: based on wins + market size
          const userWins = tempState.teams.find(t2 => t2.id === tempState.userTeamId)?.wins ?? 0;
          const teamQuality = Math.min(100, userWins * 1.2 + 30);
          expiredPlayers.push({
            ...p,
            isFreeAgent: true,
            lastTeamId: t.id,
            contractYears: 0,
            salary: 0,
            desiredContract: {
              years: desiredYears,
              salary: desiredBase,
            },
            interestScore: Math.round(
              Math.min(95, Math.max(10, teamQuality * 0.5 + (p.morale ?? 75) * 0.3 + Math.random() * 20))
            ),
          });
        }
      });
    });

    // ── Snapshot season stats → careerStats, then reset for new season ────────
    tempState.teams = tempState.teams.map(t => ({
      ...t,
      roster: t.roster.map(p =>
        snapshotPlayerStats(p, t.id, t.name, t.abbreviation, tempState.season, false)
      ),
    }));

    tempState.teams = tempState.teams.map(t => {
      const facBudget     = t.finances?.budgets?.facilities ?? 20;
      const hcDevRating   = t.staff.headCoach?.ratingDevelopment ?? 50;
      const assistDevRating = t.staff.assistantDev?.ratingDevelopment ?? 60;
      // Head coach dev rating: 50 = no bonus, 100 = +30% growth; average is 50 so typical bonus is 0–15%
      const hcDevBonus  = Math.max(0, (hcDevRating - 50) / 50) * 0.30;
      // Facilities: +15% dev speed at elite
      const facBonus    = ((facBudget - 20) / 80) * 0.15;
      // Assistant dev coach is the primary dev driver; HC and facilities stack on top
      const devMultiplier = (assistDevRating / 75) * (1 + hcDevBonus + facBonus);
      const POS_DEV_KEYS: Record<string, (keyof Player['attributes'])[]> = {
        PG: ['ballHandling','passing','shooting3pt','offensiveIQ','perimeterDef'],
        SG: ['shooting3pt','shooting','shootingMid','perimeterDef','speed'],
        SF: ['speed','jumping','shooting','perimeterDef','defReb'],
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
      // Remove expired contracts from roster (they become free agents)
      const retained = rosterWithProg.filter(p => p.contractYears > 1);
      return { ...t, roster: retained.map(p => ({ ...p, contractYears: p.contractYears - 1 })), prevSeasonWins: t.wins, wins: 0, losses: 0, lastTen: [] };
    });

    // Merge generated FA pool + expired-contract players (deduplicated by id)
    const generatedFAs = generateFreeAgentPool(30, tempState.season, tempState.settings.playerGenderRatio);
    const expiredIds = new Set(expiredPlayers.map(p => p.id));
    const mergedFAs = [
      ...expiredPlayers,
      ...generatedFAs.filter(p => !expiredIds.has(p.id)),
    ].sort((a, b) => b.rating - a.rating);
    // Cap 90+ OVR players at 8 total to prevent superstar glut
    let eliteCount = 0;
    const cappedFAs = mergedFAs.filter(p => {
      if (p.rating >= 90) {
        if (eliteCount >= 8) return false;
        eliteCount++;
      }
      return true;
    });
    tempState.freeAgents = cappedFAs;
    tempState.season += 1;
    tempState.coachPool = [...generateCoachPool(20, tempState.settings.coachGenderRatio, tempState.season)];

    // ── Recalculate player ages from birthdate + new league year ─────────────
    const newSeason = tempState.season;
    const recalcAge = (p: Player) => {
      if (!p.birthdate) return p;
      return { ...p, age: ageFromBirthdate(p.birthdate, newSeason) };
    };
    tempState.teams = tempState.teams.map(t => ({
      ...t,
      roster: t.roster.map(recalcAge),
      // Age coaches by birthYear if available, otherwise +1
      staff: Object.fromEntries(
        Object.entries(t.staff).map(([role, coach]) => {
          if (!coach) return [role, coach];
          const c = coach as any;
          const newAge = c.birthYear ? newSeason - c.birthYear : (c.age ?? 40) + 1;
          return [role, { ...c, age: newAge }];
        })
      ) as typeof t.staff,
    }));
    tempState.freeAgents = tempState.freeAgents.map(recalcAge);

    // Generate fresh draft class for the new season
    const classSize = tempState.settings.draftClassSize === 'Small' ? 60
      : tempState.settings.draftClassSize === 'Large' ? 120 : 90;
    tempState.prospects = generateProspects(tempState.season, classSize, tempState.settings.playerGenderRatio, tempState.settings.prospectAgeMin ?? 19, tempState.settings.prospectAgeMax ?? 21);
    tempState.draftPicks = []; // Clear old picks; lottery will populate

    // ── Pre-offseason agreements (moratorium window, Day 0) ─
    try {
      const preResult = aiGMPreOffseasonAgreements(tempState, tempState.settings.difficulty ?? 'Medium');
      tempState = preResult.updatedState;
      if (preResult.newsItems.length > 0) {
        tempState.newsFeed = [...preResult.newsItems, ...(tempState.newsFeed || [])].slice(0, 200);
      }
      if (preResult.transactions.length > 0) {
        tempState.transactions = [...preResult.transactions, ...(tempState.transactions || [])].slice(0, 1000);
      }
    } catch (_e) { /* non-fatal */ }

    // ── Run AI GM offseason decisions ───────────────────────
    const aiResult = runAIGMOffseason(tempState, tempState.settings.difficulty);
    tempState = aiResult.updatedState;
    if (aiResult.transactions.length > 0) {
      tempState.transactions = [...aiResult.transactions, ...(tempState.transactions || [])].slice(0, 1000);
    }

    // ── Normalize league OVRs to prevent runaway team ratings ──
    tempState = normalizeLeagueOVRs(tempState);

    // ── Roster OVR Audit: advisory if human team ranks top-3 ──
    const teamOVR = (t: typeof tempState.teams[0]) =>
      t.roster.slice().sort((a, b) => b.rating - a.rating).slice(0, 10)
        .reduce((s, p) => s + p.rating, 0) / Math.min(10, t.roster.length || 1);
    const sortedByOVR = [...tempState.teams]
      .filter(t => t.roster.length > 0)
      .sort((a, b) => teamOVR(b) - teamOVR(a));
    const humanRank = sortedByOVR.findIndex(t => t.id === tempState.userTeamId) + 1;
    const leagueAvgOVR = sortedByOVR.reduce((s, t) => s + teamOVR(t), 0) / (sortedByOVR.length || 1);
    const humanAvgOVR = teamOVR(tempState.teams.find(t => t.id === tempState.userTeamId)!);
    let humanOvrAlert: string | undefined;
    if (humanRank > 0 && humanRank <= 3) {
      humanOvrAlert = `Your roster (avg OVR ${Math.round(humanAvgOVR)}) ranks #${humanRank} in the league (league avg ${Math.round(leagueAvgOVR)}). Your team is significantly stronger than average — consider raising difficulty in Settings for a greater challenge.`;
      if (!tempState.newsFeed.find(n => n.id === `ovr-audit-${tempState.season}`)) {
        tempState.newsFeed.unshift({
          id: `ovr-audit-${tempState.season}`,
          category: 'milestone' as const,
          headline: '⚠️ ROSTER STRENGTH ADVISORY',
          content: humanOvrAlert,
          timestamp: tempState.currentDay,
          realTimestamp: Date.now(),
          isBreaking: false,
        });
      }
    }
    tempState = { ...tempState, humanOvrAlert };
    
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
    setActiveTab('draft');
    } catch (err) {
      console.error('handleStartOffseason error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdvanceToRegularSeason = () => {
    if (!league) return;
    // If offseason or previous season's games are all played, generate a fresh schedule
    const needsFreshSchedule = league.isOffseason || league.schedule.every(g => g.played);
    const newSchedule = needsFreshSchedule
      ? generateSeasonSchedule(league.teams, league.settings.seasonLength, league.settings.divisionGames, league.settings.conferenceGames)
      : league.schedule;
    setLeague(prev => {
      if (!prev) return null;
      const nextSeason = prev.season;
      const futureWindow = prev.settings.tradableDraftPickSeasons ?? 4;
      // Seed future picks (next N seasons per setting) for every team that doesn't already have them
      const teamsWithPicks = prev.teams.map(t => {
        const existingPickYears = new Set(t.picks.map(p => p.year));
        const newPicks = [] as typeof t.picks;
        for (let f = 1; f <= futureWindow; f++) {
          const yr = nextSeason + f;
          if (!existingPickYears.has(yr)) {
            newPicks.push(
              { round: 1, pick: 0, originalTeamId: t.id, currentTeamId: t.id, year: yr },
              { round: 2, pick: 0, originalTeamId: t.id, currentTeamId: t.id, year: yr },
            );
          }
        }
        return newPicks.length > 0 ? { ...t, picks: [...t.picks, ...newPicks] } : t;
      });
      return {
        ...prev,
        teams: teamsWithPicks,
        schedule: newSchedule,
        currentDay: 1,
        isOffseason: false,
        seasonPhase: 'Regular Season' as SeasonPhase,
        tradeDeadlinePassed: false,
        allStarWeekend: undefined,
      };
    });
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

    // During the season, waived player immediately enters the in-season FA pool
    let updatedFAs = league.freeAgents;
    let extraNews: typeof league.newsFeed = [];
    if (!league.isOffseason && p) {
      const waivedFA = {
        ...p,
        isFreeAgent: true,
        inSeasonFA: true,
        lastTeamId: userTeam.id,
        salary: 0,
        contractYears: 0,
        interestScore: Math.round(Math.min(90, Math.max(15, 40 + Math.random() * 30))),
        desiredContract: {
          years: 1,
          salary: p.rating >= 80 ? 3_000_000 : p.rating >= 70 ? 1_500_000 : 600_000,
        },
      };
      updatedFAs = [waivedFA, ...league.freeAgents];
      extraNews = [{
        id: `waive-${Date.now()}`,
        category: 'transaction' as const,
        headline: `${p.name} waived by ${userTeam.name}`,
        content: `${p.name} (${p.position}, ${p.rating} OVR) has been placed on waivers and is now available in the FA Market.`,
        timestamp: league.currentDay,
        realTimestamp: Date.now(),
        isBreaking: false,
      }];
    }

    setLeague({
      ...league,
      teams: league.teams.map(t => t.id === userTeam.id ? { ...t, roster: updatedRoster } : t),
      freeAgents: updatedFAs,
      transactions: updatedTransactions,
      newsFeed: [...extraNews, ...league.newsFeed],
    });
    setSelectedPlayer(null);
  };
  
  const handleViewRoster = (teamId: string) => { setRosterTeamId(teamId); setActiveTab('roster'); };
  const handleViewFranchise = (teamId: string) => { setViewingFranchiseId(teamId); setActiveTab('franchise_history'); };
  const handleManageTeam = (teamId: string) => { setRosterTeamId(teamId); setActiveTab('roster'); };
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
  if (status === 'setup' && league) {
    const usedExpansionNames = new Set(league.teams.map(t => t.name));
    const nextExpansion = EXPANSION_TEAM_POOL.find(e => !usedExpansionNames.has(e.name));
    return <TeamSelection
      teams={league.teams}
      onSelectTeam={handleSelectTeam}
      onBack={() => setStatus('config')}
      onEditTeam={(teamId, updates) => {
        setLeague(prev => prev ? { ...prev, teams: prev.teams.map(t => t.id === teamId ? { ...t, ...updates } : t) } : prev);
      }}
      onRemoveTeam={(teamId) => {
        setLeague(prev => prev ? { ...prev, teams: prev.teams.filter(t => t.id !== teamId) } : prev);
      }}
      onAddTeam={nextExpansion ? () => {
        setLeague(prev => {
          if (!prev) return prev;
          const idx = prev.teams.length;
          const teamId = `team-expansion-${idx}-${Date.now()}`;
          const genderRatio = prev.settings?.playerGenderRatio ?? 0;
          const season = prev.season ?? 2026;
          const roster = Array.from({ length: 14 }).map((_, j) =>
            generatePlayer(`p-${teamId}-${j}`, [19, 38], genderRatio, undefined, season)
          );
          const data = nextExpansion!;
          const newTeam: Team = {
            id: teamId,
            name: data.name,
            city: data.city,
            roster,
            staff: {
              headCoach: generateCoach(`coach-${teamId}-hc`, 'B', genderRatio, season),
              assistantOffense: generateCoach(`coach-${teamId}-off`, 'C', genderRatio, season),
              assistantDefense: generateCoach(`coach-${teamId}-def`, 'C', genderRatio, season),
              assistantDev: generateCoach(`coach-${teamId}-dev`, 'C', genderRatio, season),
              trainer: generateCoach(`coach-${teamId}-tr`, 'C', genderRatio, season),
            },
            staffBudget: 15000000,
            activeScheme: 'Balanced',
            wins: 0, losses: 0, homeWins: 0, homeLosses: 0, roadWins: 0, roadLosses: 0, confWins: 0, confLosses: 0, lastTen: [],
            budget: 180000000,
            logo: '',
            conference: data.conf as any,
            division: data.div as any,
            marketSize: data.market as any,
            streak: 0,
            picks: [
              { round: 1, pick: 0, originalTeamId: teamId, currentTeamId: teamId },
              { round: 2, pick: 0, originalTeamId: teamId, currentTeamId: teamId },
            ],
            finances: {
              revenue: 5000000, expenses: 4000000, cash: 25000000,
              ticketPrice: 85, concessionPrice: 12, fanHype: 65, ownerPatience: 80,
              ownerGoal: 'Win Now',
              budgets: { scouting: 20, health: 20, facilities: 20 },
            },
            primaryColor: data.primary,
            secondaryColor: data.secondary,
            rotation: generateDefaultRotation(roster),
            abbreviation: data.city.substring(0, 3).toUpperCase(),
            population: data.market === 'Large' ? 8.5 : data.market === 'Medium' ? 4.2 : 1.5,
            stadiumCapacity: data.market === 'Large' ? 20000 : data.market === 'Medium' ? 18500 : 17000,
            borderStyle: 'Solid',
            status: 'Active',
            ...(() => { const gm = generateGMName(prev.settings?.playerGenderRatio ?? 0); return { gmName: gm.name, gmAge: gm.age }; })(),
          };
          return { ...prev, teams: [...prev.teams, newTeam] };
        });
      } : undefined}
      canAddTeam={!!nextExpansion}
    />;
  }
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

  const navValue = {
    viewPlayer: handleViewPlayer,
    viewPlayerById: (id: string) => {
      const p = league.teams.flatMap(t => t.roster).find(pl => pl.id === id);
      if (p) handleViewPlayer(p);
    },
    viewTeam: handleManageTeam,
  };

  return (
    <NavigationProvider value={navValue}>
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-50 relative">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} team={userTeam} onQuit={() => setStatus('title')} league={league} isExpansionActive={league.expansionDraft?.active} />
      <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 pb-32 transition-all duration-300 ease-in-out">
        <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {activeTab === 'dashboard' && <Dashboard league={league} news={news} onSimulate={handleSimulate} onScout={handleViewPlayer} scoutingReport={scoutingReport} setActiveTab={setActiveTab} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} onAdvanceToRegularSeason={handleAdvanceToRegularSeason} />}
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
          {activeTab === 'roster' && <Roster leagueTeams={league.teams} userTeamId={league.userTeamId} initialTeamId={rosterTeamId} onScout={handleViewPlayer} onScoutCoach={handleScoutCoach} scoutingReport={scoutingReport} onUpdateTeamRoster={handleUpdateTeamRoster} onManageTeam={handleManageTeam} godMode={league.settings.godMode} />}
          {activeTab === 'rotations' && <Rotations league={league} updateLeague={updateLeagueState} />}
          {activeTab === 'free_agency' && <FreeAgency league={league} updateLeague={updateLeagueState} onScout={handleViewPlayer} recordTransaction={recordTransaction} />}
          {activeTab === 'coach_market' && <CoachesMarket league={league} updateLeague={updateLeagueState} onScout={handleScoutCoach} />}
          {activeTab === 'awards' && <Awards league={league} onScout={handleViewPlayer} onScoutCoach={handleScoutCoach} onManageTeam={handleManageTeam} />}
          {activeTab === 'playoffs' && <Playoffs league={league} updateLeague={updateLeagueState} onStartOffseason={handleStartOffseason} onScout={handleViewPlayer} onViewBoxScore={(res, home, away) => setViewingBoxScore({ result: res, home, away })} onAddNews={async (cat, data, breaking) => {
            const newState = await addNewsItem(league, cat, data, breaking);
            updateLeagueState(newState);
          }} />}
          {activeTab === 'allstar' && (
            <AllStar
              league={league}
              updateLeague={updateLeagueState}
              onAdvancePhase={() => {
                updateLeagueState(prev => {
                  const asd = prev.allStarWeekend;
                  const year = prev.season;
                  // Stamp allStarSelections on every player who made the roster
                  const allStarIds = new Set([
                    ...(asd?.eastStarters ?? []),
                    ...(asd?.eastReserves ?? []),
                    ...(asd?.westStarters ?? []),
                    ...(asd?.westReserves ?? []),
                  ]);
                  const mvpId = asd?.allStarGame?.mvp?.playerId;
                  let teams = prev.teams.map(t => ({
                    ...t,
                    roster: t.roster.map(p => {
                      if (!allStarIds.has(p.id)) return p;
                      const existing = p.allStarSelections ?? [];
                      if (existing.includes(year)) return p;
                      return { ...p, allStarSelections: [...existing, year] };
                    }),
                  }));
                  // Stamp allStarMvpYears on the All-Star Game MVP
                  if (mvpId) {
                    teams = teams.map(t => ({
                      ...t,
                      roster: t.roster.map(p => {
                        if (p.id !== mvpId) return p;
                        const existing = p.allStarMvpYears ?? [];
                        if (existing.includes(year)) return p;
                        return { ...p, allStarMvpYears: [...existing, year] };
                      }),
                    }));
                  }
                  return {
                    ...prev,
                    teams,
                    seasonPhase: 'Regular Season' as SeasonPhase,
                    allStarWeekend: asd ? { ...asd, completed: true } : asd,
                  };
                });
                setActiveTab('dashboard');
              }}
            />
          )}
          {activeTab === 'results' && (
            <Results
              history={league.history}
              teams={league.teams}
              userTeamId={league.userTeamId}
              onViewBoxScore={(res, home, away) => setViewingBoxScore({ result: res, home, away })}
              onViewFranchise={handleViewFranchise}
            />
          )}
          {activeTab === 'league_history' && (
            <FranchiseHistory
              league={league}
              initialView="league"
              hideViewSwitcher
            />
          )}
          {activeTab === 'franchise_history' && (
            viewingFranchiseId ? (
              <FranchiseHistory
                league={league}
                initialTeamId={viewingFranchiseId}
                initialView="franchise"
                hideViewSwitcher
                onBack={() => { setViewingFranchiseId(null); setActiveTab('franchise_history'); }}
              />
            ) : (
              <FranchiseHistory
                league={league}
                initialTeamId={league.userTeamId}
                initialView="franchise"
                hideViewSwitcher
              />
            )
          )}
          {activeTab === 'standings' && <Standings teams={league.teams} userTeamId={league.userTeamId} seasonLength={league.settings.seasonLength ?? 82} playoffFormat={league.settings.playoffFormat ?? 16} season={league.season} isPlayoffs={!!league.playoffBracket} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} rivalryHistory={league.rivalryHistory} />}
          {activeTab === 'schedule' && <Schedule league={league} onSimulate={handleSimulate} onScout={handleViewPlayer} onWatchLive={handleWatchLive} onViewBoxScore={(res, home, away) => setViewingBoxScore({ result: res, home, away })} onManageTeam={handleManageTeam} onAdvanceToRegularSeason={handleAdvanceToRegularSeason} onViewAllStar={() => setActiveTab('allstar')} />}
          {activeTab === 'draft' && <Draft league={league} updateLeague={updateLeagueState} onScout={handleScoutPlayer} scoutingReport={scoutingReport} onNavigateToFreeAgency={() => setActiveTab('free_agency')} />}
          {activeTab === 'coaching' && <Coaching league={league} updateLeague={updateLeagueState} godMode={league.settings.godMode} />}
          {activeTab === 'stats' && <Stats league={league} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} onViewPlayer={p => setSelectedPlayer(p)} />}
          {activeTab === 'players' && <Players league={league} onViewPlayer={p => setSelectedPlayer(p)} />}
          {activeTab === 'finances' && <Finances league={league} updateLeague={updateLeagueState} />}
          {activeTab === 'trade' && <Trade league={league} updateLeague={updateLeagueState} recordTransaction={recordTransaction} initialProposal={counterProposal} onClearInitialProposal={() => setCounterProposal(null)} />}
          {activeTab === 'trade_proposals' && (
            <TradeProposals
              league={league}
              updateLeague={updateLeagueState}
              onAccept={handleAcceptProposal}
              onCounter={(proposal) => {
                setCounterProposal(proposal);
                setActiveTab('trade');
              }}
            />
          )}
          {activeTab === 'settings' && <Settings league={league} updateLeague={updateLeagueState} onRegenerateSchedule={async () => {
            try {
              const cur = leagueRef.current;
              if (!cur) return false;
              // Block only when season is in-progress (some games played, some remaining)
              const played = cur.schedule.filter(g => g.played).length;
              const isInProgress = played > 0 && played < cur.schedule.length;
              if (isInProgress) return false;
              const newSchedule = generateSeasonSchedule(
                cur.teams,
                cur.settings.seasonLength,
                cur.settings.divisionGames,
                cur.settings.conferenceGames,
              );
              if (!newSchedule || newSchedule.length === 0) return false;
              setLeague(prev => prev ? { ...prev, schedule: newSchedule, currentDay: 1, seasonPhase: 'Preseason' as SeasonPhase } : null);
              return true;
            } catch (err) {
              console.error('Schedule regeneration error:', err);
              return false;
            }
          }} />}
        </div>
      </main>
      {selectedPlayer && (() => {
        // ── All-Star status ────────────────────────────────────────────────────
        const asd = league.allStarWeekend;
        const starterIds  = new Set([...(asd?.eastStarters ?? []), ...(asd?.westStarters ?? [])]);
        const allStarIds  = new Set([...starterIds, ...(asd?.eastReserves ?? []), ...(asd?.westReserves ?? [])]);
        const isCurrentAllStar   = allStarIds.has(selectedPlayer.id);
        const currentAllStarRole = isCurrentAllStar ? (starterIds.has(selectedPlayer.id) ? 'Starter' : 'Reserve') as 'Starter' | 'Reserve' : undefined;

        // ── Career awards from awardHistory ────────────────────────────────────
        const AWARD_META = [
          { key: 'mvp',      label: 'MVP',       icon: '🏆' },
          { key: 'dpoy',     label: 'DPOY',      icon: '🛡️' },
          { key: 'roy',      label: 'ROY',       icon: '🌟' },
          { key: 'sixthMan', label: 'Sixth Man', icon: '🎯' },
          { key: 'mip',      label: 'MIP',       icon: '📈' },
        ] as const;
        type AwardMeta = typeof AWARD_META[number];
        const careerAwards: { label: string; year: number; icon: string }[] = [];
        for (const hist of (league.awardHistory ?? [])) {
          for (const { key, label, icon } of AWARD_META as readonly AwardMeta[]) {
            const winner = (hist as any)[key];
            if (winner?.playerId === selectedPlayer.id) careerAwards.push({ label, year: hist.year, icon });
          }
          if (hist.allNbaFirst?.includes(selectedPlayer.id))  careerAwards.push({ label: 'All-NBA 1st', year: hist.year, icon: '🥇' });
          else if (hist.allNbaSecond?.includes(selectedPlayer.id)) careerAwards.push({ label: 'All-NBA 2nd', year: hist.year, icon: '🥈' });
          else if (hist.allNbaThird?.includes(selectedPlayer.id))  careerAwards.push({ label: 'All-NBA 3rd', year: hist.year, icon: '🥉' });
          if (hist.allDefensive?.includes(selectedPlayer.id)) careerAwards.push({ label: 'All-Defense', year: hist.year, icon: '🛡️' });
        }
        // All-Star MVP: current season (from allStarWeekend) + historical (from allStarMvpYears on player)
        const currentMvpId = league.allStarWeekend?.allStarGame?.mvp?.playerId;
        if (currentMvpId === selectedPlayer.id) {
          const mvpYear = league.season;
          if (!careerAwards.some(a => a.label === 'All-Star MVP' && a.year === mvpYear)) {
            careerAwards.push({ label: 'All-Star MVP', year: mvpYear, icon: '⭐' });
          }
        }
        for (const mvpYear of (selectedPlayer.allStarMvpYears ?? [])) {
          if (!careerAwards.some(a => a.label === 'All-Star MVP' && a.year === mvpYear)) {
            careerAwards.push({ label: 'All-Star MVP', year: mvpYear, icon: '⭐' });
          }
        }
        careerAwards.sort((a, b) => b.year - a.year);

        const allLeaguePlayers = league.teams.flatMap(t => t.roster);
        const playerTeam      = league.teams.find(t => t.roster.some(p => p.id === selectedPlayer.id));
        return (
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
            isCurrentAllStar={isCurrentAllStar}
            currentAllStarRole={currentAllStarRole}
            careerAwards={careerAwards}
            currentSeason={league.season}
            leagueContext={{
              allPlayers: allLeaguePlayers,
              teamPlayers: playerTeam?.roster ?? [],
              seasonLength: league.settings.seasonLength ?? 82,
              currentTeamAbbreviation: playerTeam?.abbreviation,
              teamStreak: playerTeam?.streak,
              teamScheme: playerTeam?.activeScheme,
              teamWins: playerTeam?.wins,
              teamLosses: playerTeam?.losses,
              teamRotation: playerTeam?.rotation,
            }}
            teams={league.teams.map(t => t.name)}
          />
        );
      })()}
      {selectedCoach && (() => {
        const coachAwards: { label: string; year: number; icon: string }[] = [];
        for (const hist of (league.awardHistory ?? [])) {
          if (hist.coy?.coachId === selectedCoach.id) coachAwards.push({ label: 'Coach of the Year', year: hist.year, icon: '🏆' });
        }
        coachAwards.sort((a, b) => b.year - a.year);
        return (
         <CoachModal coach={selectedCoach} onClose={() => setSelectedCoach(null)} onScout={handleGenerateCoachIntelligence} scoutingReport={coachScoutingReport} godMode={league.settings.godMode} onUpdateCoach={handleUpdateCoach} careerAwards={coachAwards} isUserTeam={(Object.values(userTeam.staff) as (Coach | null)[]).some(s => s?.id === selectedCoach.id)} onFire={(id) => {
               const firingCoach = (Object.values(userTeam.staff) as (Coach | null)[]).find(s => s?.id === id);
               const oldCoachName = firingCoach?.name ?? 'staff member';
               const isFiringHC = userTeam.staff.headCoach?.id === id;

               if (isFiringHC && firingCoach) {
                 // Promote best assistant to interim; leave coachSearchDaysLeft=0
                 // so the user can hire a permanent replacement at their own pace
                 const { interim, newStaff } = pickInterimCoach(userTeam.staff, league.settings.coachGenderRatio ?? 10);
                 const releasedPool = [
                   ...league.coachPool,
                   { ...firingCoach, isInterim: false, desiredContract: { years: 2, salary: Math.floor((firingCoach.salary ?? 2_000_000) * 0.9) }, interestScore: 50 },
                 ];
                 const txns = recordTransaction(league, 'firing', [userTeam.id], `${userTeam.name} fired Head Coach ${oldCoachName}.`);
                 updateLeagueState({
                   teams: league.teams.map(t =>
                     t.id === userTeam.id ? { ...t, staff: newStaff, coachSearchDaysLeft: 0 } : t,
                   ),
                   coachPool: releasedPool,
                   transactions: txns,
                 });
               } else {
                 // Firing an assistant / trainer — original direct-removal logic
                 const updatedStaff = { ...userTeam.staff };
                 if (updatedStaff.assistantOffense?.id === id) updatedStaff.assistantOffense = null;
                 else if (updatedStaff.assistantDefense?.id === id) updatedStaff.assistantDefense = null;
                 else if (updatedStaff.assistantDev?.id === id) updatedStaff.assistantDev = null;
                 else if (updatedStaff.trainer?.id === id) updatedStaff.trainer = null;
                 const txns = recordTransaction(league, 'firing', [userTeam.id], `${userTeam.name} parted ways with ${oldCoachName}.`);
                 updateLeagueState({ teams: league.teams.map(t => t.id === userTeam.id ? { ...t, staff: updatedStaff } : t), transactions: txns });
               }
               setSelectedCoach(null);
            }} />
        );
      })()}

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
    </NavigationProvider>
  );
};

export default App;
