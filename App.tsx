
import React, { useState, useEffect, useCallback } from 'react';
import { LeagueState, Player, Team, GameResult, PlayerStatus, ScheduleGame, BulkSimSummary, Prospect, Coach, TradeProposal, Position, NewsItem, NewsCategory, LeagueSettings, SeasonAwards, PlayoffBracket, PlayoffSeries, Transaction, TransactionType, PowerRankingSnapshot, PowerRankingEntry, GMProfile, GMMilestone, RivalryStats, InjuryType, SeasonPhase, AllStarWeekendData, AllStarVoteEntry, PreviousSeasonStanding, TrainingFocusArea, PlayerDevChange } from './types';
import { generateLeagueTeams, generateSeasonSchedule, generateProspects, generateFreeAgentPool, generateCoachPool, EXPANSION_TEAM_POOL, generateCoach, generatePlayer, generateDefaultRotation, enforcePositionalBounds, ageFromBirthdate, getCoachPreferredScheme, generateGMName, STAFF_CONFIG, getStaffTierIndex } from './constants';
import { generatePreseasonSchedule, buildPreseasonHeadline, buildPreseasonRookieHeadline } from './utils/preseasonEngine';
import { simulateGame, normalizeLeagueOVRs } from './utils/simEngine';
import { computeGameAttendance } from './utils/attendanceEngine';
import { autoSimAllStarWeekend } from './utils/allStarSim';
import { snapshotPlayerStats } from './utils/playerUtils';
import { generateGameRecap, generateScoutingReport, generateSeasonNarrative, generateCoachScoutingReport, generateNewsHeadline } from './services/geminiService';
import { generateAwards } from './utils/awardEngine';
import { assignAIPersonalities, runAIGMOffseason, aiGMTradeDeadlineAction, aiGMInSeasonTrades, aiGMPreOffseasonAgreements, generateAITradeProposalsForUser } from './utils/aiGMEngine';
import { db } from './db';
import { NavigationProvider } from './context/NavigationContext';
import { generateOffseasonAlerts } from './utils/offseasonAlerts';
import { calcFranchiseValuation } from './utils/valuationEngine';
import OffseasonAlertsModal from './components/OffseasonAlertsModal';
import OwnerReactionModal from './components/OwnerReactionModal';
import { calcReleaseReaction, OwnerReaction } from './utils/ownerReactionEngine';
import { computeOffseasonGrade, computeDraftGrade, OffseasonGradeData, DraftGradeData } from './utils/offseasonGradeEngine';
import { fmtSalary } from './utils/formatters';
import { calcInjuryOVRPenalty, rollPotentialLoss, calcTeamEffectiveOVR, rollCareerEnding, rollInjuryWorsening, getPlayThroughOVRExtra, canPlayThrough } from './utils/injuryEffects';
import { getContractRules, computeMensMarketSalary } from './utils/contractRules';
import OffseasonGradeModal from './components/OffseasonGradeModal';
import DraftGradeModal from './components/DraftGradeModal';
import DevReportModal from './components/DevReportModal';

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
import OwnerReview from './components/OwnerReview';
import OwnerWelcome from './components/OwnerWelcome';
import type { OwnerReviewData } from './types';

const SETTINGS_KEY = 'HOOPS_DYNASTY_SETTINGS_V1';

type AppStatus = 'title' | 'config' | 'setup' | 'owner_welcome' | 'game';

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
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
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
  const [showOffseasonAlerts, setShowOffseasonAlerts] = useState(false);
  const [pendingRelease, setPendingRelease] = useState<{ playerId: string; reaction: OwnerReaction } | null>(null);
  const [viewingFranchiseId, setViewingFranchiseId] = useState<string | null>(null);
  const [bulkSummary, setBulkSummary] = useState<BulkSimSummary | null>(null);
  const leagueRef = React.useRef<LeagueState | null>(null);
  leagueRef.current = league;
  const [isSeasonTransitioning, setIsSeasonTransitioning] = useState(false);
  const [setupFromLoad, setSetupFromLoad] = useState(false);
  const [isFranchiseSetup, setIsFranchiseSetup] = useState(false);

  // Offseason grade modal state
  const [offseasonGradeData, setOffseasonGradeData] = useState<OffseasonGradeData | null>(null);
  const offseasonGradeShownForSeason = React.useRef<number>(-1);

  // Draft grade modal state
  const [draftGradeData, setDraftGradeData] = useState<DraftGradeData | null>(null);
  const draftGradeShownForSeason = React.useRef<number>(-1);

  // Dev report modal state
  const [showDevReport, setShowDevReport] = useState(false);
  const devReportShownForSeason = React.useRef<number>(-1);

  const refreshSaves = useCallback(async () => {
    const saves = await db.leagues.toArray();
    setAllSaves(saves);
  }, []);

  useEffect(() => {
    if (status === 'title') {
      refreshSaves();
    }
  }, [status, refreshSaves]);

  // Safety net: if we end up with no team selected outside of setup/title/config,
  // snap back to a valid screen instead of showing a blank page.
  useEffect(() => {
    if (status === 'owner_welcome' && (!league || !pendingTeamId)) {
      setPendingTeamId(null);
      setStatus(league ? 'setup' : 'title');
    }
    if ((status === 'game' || status === 'setup') && !league) {
      setStatus('title');
    }
    if (status === 'game' && league && !league.userTeamId) {
      setStatus('setup');
    }
  }, [status, league, pendingTeamId]);

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
      const freshAlerts = generateOffseasonAlerts(aiResult.updatedState);
      return {
        ...aiResult.updatedState,
        newsFeed: [sentinel, ...aiResult.updatedState.newsFeed].slice(0, 2000),
        transactions: [...aiResult.transactions, ...(afterPre.transactions || [])].slice(0, 1000),
        offseasonAlerts: freshAlerts,
      };
    });
  }, [league?.draftPhase, league?.isOffseason, status]);

  // Auto-show offseason alerts modal when alerts are freshly generated
  useEffect(() => {
    if (league?.offseasonAlerts && league.offseasonAlerts.some(a => !a.dismissed)) {
      setShowOffseasonAlerts(true);
    }
  }, [league?.offseasonAlerts]);

  // Draft grade — trigger once when draft completes
  useEffect(() => {
    if (!league || league.draftPhase !== 'completed' || !league.isOffseason) return;
    if (draftGradeShownForSeason.current === league.season) return;
    draftGradeShownForSeason.current = league.season;
    const grade = computeDraftGrade(league);
    const before = league.ownerApproval ?? 55;
    const after = Math.max(0, Math.min(100, before + grade.ownerApprovalChange));
    setLeague(prev => prev ? { ...prev, ownerApproval: after } : null);
    setDraftGradeData(grade);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.draftPhase, league?.isOffseason, league?.season]);

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

  // ── Offseason alert handlers ───────────────────────────────────────────────
  const handleDismissAlert = (alertId: string) => {
    setLeague(prev => {
      if (!prev?.offseasonAlerts) return prev;
      const updated = prev.offseasonAlerts.map(a => a.id === alertId ? { ...a, dismissed: true } : a);
      const anyLeft = updated.some(a => !a.dismissed);
      if (!anyLeft) setShowOffseasonAlerts(false);
      return { ...prev, offseasonAlerts: updated };
    });
  };

  const handleDismissAllAlerts = () => {
    setLeague(prev => {
      if (!prev?.offseasonAlerts) return prev;
      return { ...prev, offseasonAlerts: prev.offseasonAlerts.map(a => ({ ...a, dismissed: true })) };
    });
    setShowOffseasonAlerts(false);
  };

  const handleAlertOfferContract = (alertId: string) => {
    handleDismissAlert(alertId);
    setShowOffseasonAlerts(false);
    setActiveTab('free_agency');
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

    // Compute approval delta for this trade
    const outRatings = proposal.userPieces.filter(p => p.type === 'player').map(p => (p.data as Player).rating);
    const inRatings  = proposal.partnerPieces.filter(p => p.type === 'player').map(p => (p.data as Player).rating);
    const approvalDelta = tradeApprovalDelta(outRatings, inRatings, {
      owner: league.ownerApproval ?? 55,
      fan:   league.fanApproval   ?? 60,
    });

    updateLeagueState({
      teams: updatedTeams,
      transactions: updatedTransactions,
      incomingTradeProposals: (league.incomingTradeProposals ?? []).filter(p => p.id !== proposal.id),
      ownerApproval: approvalDelta.owner,
      fanApproval:   approvalDelta.fan,
    });
  };

  /** Accept a player's trade request: keeps them on trade block, boosts AI interest. */
  const handleAcceptTradeRequest = (playerId: string) => {
    if (!league) return;
    updateLeagueState({
      teams: league.teams.map(t =>
        t.id === league.userTeamId
          ? { ...t, roster: t.roster.map(p => p.id === playerId ? { ...p, requestedTrade: true, onTradeBlock: true } : p) }
          : t
      ),
    });
  };

  /** Decline a player's trade request: clears the flag but drops morale. */
  const handleDeclineTradeRequest = (playerId: string) => {
    if (!league) return;
    updateLeagueState({
      teams: league.teams.map(t =>
        t.id === league.userTeamId
          ? {
              ...t,
              roster: t.roster.map(p =>
                p.id === playerId
                  ? { ...p, requestedTrade: false, morale: Math.max(0, (p.morale ?? 75) - 10) }
                  : p
              ),
            }
          : t
      ),
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
      const teamOvr = calcTeamEffectiveOVR(team.roster);
      
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
      // Auto-enable single-year labels for women's leagues and pre-1950 historical starts
      singleYearSeason: genderRatio === 100 || year <= 1949,
      ...partialSettings
    };

    const requestedTeams = partialSettings.numTeams ?? 30;
    const freshTeams = generateLeagueTeams(genderRatio, year, finalSettings.tradableDraftPickSeasons ?? 4).slice(0, requestedTeams).map(t => ({
      ...t, needs: ['PG', 'C', 'SG', 'PF', 'SF'].sort(() => 0.5 - Math.random()).slice(0, 2) as Position[]
    }));
    const freshSchedule = generateSeasonSchedule(freshTeams, finalSettings.seasonLength, finalSettings.divisionGames, finalSettings.conferenceGames);
    const freshProspects = generateProspects(year, 100, genderRatio, finalSettings.prospectAgeMin ?? 19, finalSettings.prospectAgeMax ?? 21);
    const initialFAs = generateFreeAgentPool(70, year, genderRatio);
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

    const numPreseasonGames = finalSettings.preseasonGames ?? 6;
    const freshPreseasonSchedule = generatePreseasonSchedule(freshTeams, numPreseasonGames);

    const newLeague: LeagueState = {
      id: `league-${Date.now()}`, lastUpdated: Date.now(), currentDay: 1, season: year, leagueName: name, userTeamId: '',
      gmProfile: initialGMProfile, teams: teamsWithAI, schedule: freshSchedule, isOffseason: false, offseasonDay: 0,
      draftPhase: 'scouting', prospects: freshProspects, freeAgents: initialFAs, coachPool, history: [],
      savedTrades: [], newsFeed: [], awardHistory: [], championshipHistory: [], transactions: [], settings: finalSettings,
      draftPicks: [], seasonPhase: 'Preseason' as SeasonPhase, tradeDeadlinePassed: false,
      preseasonSchedule: freshPreseasonSchedule, preseasonHistory: [], preseasonRecord: { wins: 0, losses: 0 },
      ownerApproval: 55, fanApproval: 60
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
    } else {
      // Normalize fields added after initial release
      if (!savedLeague.gmProfile.milestones) savedLeague.gmProfile = { ...savedLeague.gmProfile, milestones: [] };
      if (!savedLeague.gmProfile.eoyWins)    savedLeague.gmProfile = { ...savedLeague.gmProfile, eoyWins: [] };
    }
    setLeague(savedLeague);
    if (!savedLeague.userTeamId) {
      setSetupFromLoad(true);
      setStatus('setup');
    } else {
      setSetupFromLoad(false);
      setRosterTeamId(savedLeague.userTeamId);
      setStatus('game');
      setActiveTab('dashboard');
    }
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

  // Step 1: user picks a team → show the owner welcome message first
  const handleSelectTeam = (teamId: string) => {
    if (!league) return;
    setPendingTeamId(teamId);
    setStatus('owner_welcome');
  };

  // Step 2: user clicks "Accept Position" → actually start the game
  const handleOwnerWelcomeContinue = () => {
    if (!league || !pendingTeamId) return;
    const teamId = pendingTeamId;
    const team   = league.teams.find(t => t.id === teamId)!;
    const updatedMilestones = [...(league.gmProfile.milestones ?? []), {
      id: `hired-${Date.now()}`, year: league.season, day: league.currentDay,
      text: `Named General Manager of the ${team.city} ${team.name}.`, type: 'signing',
    }];
    const updated = {
      ...league, userTeamId: teamId,
      gmProfile: { ...league.gmProfile, milestones: updatedMilestones },
      lastUpdated: Date.now(),
    };
    const updatedWithAI = { ...updated, teams: assignAIPersonalities(updated.teams, teamId) };
    setLeague(updatedWithAI);
    setRosterTeamId(teamId);
    setPendingTeamId(null);
    setSetupFromLoad(false);
    setActiveTab('dashboard');
    setIsFranchiseSetup(true);
    setStatus('game');
    db.leagues.put(updatedWithAI).catch(err => console.error('Save error:', err));
    setTimeout(() => setIsFranchiseSetup(false), 600);
  };

  const handleRegenerateSchedule = useCallback(() => {
    const cur = leagueRef.current;
    if (!cur) return;
    const played = cur.schedule.filter(g => g.played).length;
    if (played > 0 && played < cur.schedule.length) return;
    const newSchedule = generateSeasonSchedule(
      cur.teams,
      cur.settings.seasonLength,
      cur.settings.divisionGames,
      cur.settings.conferenceGames,
    );
    if (!newSchedule || newSchedule.length === 0) return;
    const updated = { ...cur, schedule: newSchedule, currentDay: 1, lastUpdated: Date.now() };
    setLeague(prev => prev ? { ...prev, schedule: newSchedule, currentDay: 1 } : null);
    db.leagues.put(updated).catch(console.error);
  }, []);

  const handleResign = () => {
    if (!league) return;
    const updated = { ...league, userTeamId: '', lastUpdated: Date.now() };
    setLeague(updated);
    setPendingTeamId(null);
    setSetupFromLoad(false);
    db.leagues.put(updated);
    setStatus('setup');
  };

  const addNewsItem = async (state: LeagueState, category: NewsCategory, data: { player?: Player, team?: Team, coach?: Coach, detail?: string }, isBreaking: boolean = false) => {
    const content = await generateNewsHeadline(category, data);
    const newItem: NewsItem = {
      id: `news-${Date.now()}-${Math.random()}`, category, headline: category.toUpperCase(), content, timestamp: state.currentDay,
      realTimestamp: Date.now(), teamId: data.team?.id, playerId: data.player?.id, isBreaking
    };
    return { ...state, newsFeed: [newItem, ...(state.newsFeed || [])].slice(0, 2000) };
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
      const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      const firingDetail = pick([
        `The ${team.name} have fired head coach ${hc.name} following ${fireReason}. The front office thanked him for his service but said a change was necessary.`,
        `${team.name} part ways with ${hc.name} after ${fireReason}. The search for a permanent replacement begins immediately.`,
        `Sources confirm: ${hc.name} is out in ${team.city ?? team.name}. The ${team.name} cited ${fireReason} as the deciding factor. An interim coach will be named shortly.`,
        `${team.name} make a move — head coach ${hc.name} has been relieved of his duties following ${fireReason}.`,
      ]);
      newState = await addNewsItem(newState, 'firing', { team, coach: hc, detail: firingDetail }, true);
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
            const hasInjury = p.status === 'Injured' || (p.injuryDaysLeft != null && p.injuryDaysLeft > 0);
            if (!hasInjury) return p;

            // Playing-through players: roll for worsening each day; career-ending injuries don't recover
            if (p.isPlayingThrough && p.injuryDaysLeft && p.injuryDaysLeft > 0) {
              const isPlayoffs = !!newState.playoffBracket;
              const newDays = rollInjuryWorsening(p.injuryDaysLeft, isPlayoffs, false);
              if (newDays !== null) {
                // Injury worsened — pull player back to bench with escalated timeline
                const newPenalty = calcInjuryOVRPenalty(newDays);
                return {
                  ...p,
                  isPlayingThrough: false,
                  status: 'Injured' as PlayerStatus,
                  injuryDaysLeft: newDays,
                  injuryOVRPenalty: newPenalty,
                };
              }
              // No worsening — decrement days, clear when healed
              const daysLeft = (p.injuryDaysLeft ?? 1) - 1;
              if (daysLeft <= 0) {
                return {
                  ...p,
                  isPlayingThrough: false,
                  injuryType: undefined,
                  injuryDaysLeft: 0,
                  injuryOVRPenalty: undefined,
                };
              }
              return { ...p, injuryDaysLeft: daysLeft };
            }

            // Career-ending injuries don't tick down (sidelined for the season)
            if (p.isCareerEnding) return p;

            const bonusTick = Math.random() < bonusTickChance ? 1 : 0;
            const daysLeft = (p.injuryDaysLeft ?? 1) - 1 - bonusTick;
            if (daysLeft <= 0) {
              // Roll for permanent potential loss on recovery from moderate/severe injuries
              const originalDays = (p.injuryDaysLeft ?? 1) + 1;
              const potLoss = rollPotentialLoss(originalDays);
              const potentialAfter = potLoss
                ? Math.max(p.rating, p.potential - potLoss.loss)
                : p.potential;
              recovering.push({ player: p, team: t });
              return {
                ...p,
                status: 'Rotation' as PlayerStatus,
                injuryType: undefined,
                injuryDaysLeft: 0,
                injuryOVRPenalty: undefined,
                isCareerEnding: undefined,
                potential: potentialAfter,
                potentialLossNote: potLoss ? potLoss.note : p.potentialLossNote,
              };
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
    if (Math.random() > 0.97) {      const active = newState.teams.flatMap(t => t.roster).filter(p => p.status !== 'Injured');
      if (active.length > 0) {
        const unlucky = active[Math.floor(Math.random() * active.length)];
        const team = newState.teams.find(t => t.roster.some(p => p.id === unlucky.id))!;
        const days = 1 + Math.floor(Math.random() * 5);
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== team.id ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== unlucky.id ? p : {
              ...p, status: 'Injured' as PlayerStatus, injuryType: 'Illness' as InjuryType, injuryDaysLeft: days, injuryOVRPenalty: calcInjuryOVRPenalty(days)
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

    // ── Off-court incident suspensions (very rare, ~once or twice per season league-wide)
    // Only triggers on non-offseason days every 5 days; targets Hot Head / Diva/Star players
    if (!newState.isOffseason && newState.currentDay % 5 === 0) {
      const allActivePlayers = newState.teams.flatMap(t =>
        t.roster
          .filter(p => !p.isSuspended && p.status !== 'Injured' && !p.injuryDaysLeft)
          .map(p => ({ player: p, team: t }))
      );
      for (const { player, team } of allActivePlayers) {
        const traits = player.personalityTraits ?? [];
        // Base chance: ~0.05% per 5-day check = ~1% per 100 checks (~season)
        // Hot Head and Diva/Star are more likely; Professional nearly immune
        let incidentChance = 0.0005;
        if (traits.includes('Hot Head'))     incidentChance *= 6;
        if (traits.includes('Diva/Star'))    incidentChance *= 3;
        if (traits.includes('Tough/Alpha')) incidentChance *= 2;
        if (traits.includes('Professional')) incidentChance *= 0.1;
        if (traits.includes('Leader'))       incidentChance *= 0.3;
        if (Math.random() >= incidentChance) continue;
        // Cooldown: only one off-court incident per player per 20-day window
        const cooldownId = `offcourt-incident-${player.id}-w${Math.floor(newState.currentDay / 20)}`;
        if ((newState.newsFeed ?? []).some(n => n.id === cooldownId)) continue;
        const games = 2 + Math.floor(Math.random() * 4); // 2-5 games
        const lastName = player.name.split(' ').slice(-1)[0];
        const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        const incidentType = pick(['an off-court altercation', 'conduct detrimental to the league', 'a violation of league conduct policy', 'an incident at a public venue', 'an altercation during a team flight']);
        const detail = `${player.name} has been suspended ${games} games by the league following ${incidentType}. The team was notified and issued a statement.`;
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== team.id ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== player.id ? p : {
              ...p,
              isSuspended: true,
              suspensionGames: games,
              suspensionReason: incidentType,
              morale: Math.max(0, Math.min(100, (p.morale ?? 75) - 12)),
            })
          })
        };
        const updTeam = newState.teams.find(t => t.id === team.id)!;
        const updPlayer = updTeam.roster.find(p => p.id === player.id)!;
        newState = await addNewsItem(newState, 'suspension' as NewsCategory, { player: updPlayer, team: updTeam, detail }, true);
        // Owner patience penalty
        if (team.id === newState.userTeamId) {
          newState = {
            ...newState,
            teams: newState.teams.map(t => t.id !== team.id ? t : {
              ...t,
              finances: { ...t.finances, ownerPatience: Math.max(0, Math.min(100, t.finances.ownerPatience - 5)) }
            })
          };
        }
        // Store cooldown so we don't spam for this player
        const cooldownNewsItem: NewsItem = {
          id: cooldownId, category: 'suspension' as NewsCategory,
          headline: 'SUSPENSION', content: detail,
          timestamp: newState.currentDay, realTimestamp: Date.now(),
          teamId: team.id, playerId: player.id, isBreaking: false,
        };
        newState = { ...newState, newsFeed: [cooldownNewsItem, ...(newState.newsFeed ?? [])].slice(0, 2000) };
      }
    }

    // Facilities morale boost — elite facilities add up to +20 baseline morale per week
    // Also decrement active training focus duration for user team
    if (newState.currentDay % 7 === 0) {
      newState = {
        ...newState,
        teams: newState.teams.map(t => {
          const facBudget = t.finances?.budgets?.facilities ?? 20;
          const moraleBoost = ((facBudget - 20) / 80) * 20;
          const isUser = t.id === newState.userTeamId;
          return {
            ...t,
            roster: t.roster.map(p => {
              let updated = moraleBoost > 0 ? { ...p, morale: Math.min(100, (p.morale ?? 75) + moraleBoost) } : p;
              if (isUser && updated.trainingFocus && updated.trainingFocus.daysRemaining > 0) {
                const newDays = updated.trainingFocus.daysRemaining - 7;
                updated = {
                  ...updated,
                  trainingFocus: newDays <= 0
                    ? undefined
                    : { ...updated.trainingFocus, daysRemaining: newDays },
                };
              }
              return updated;
            }),
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
              `${unhappyDiva.name} has formally requested a trade from the ${team?.name}. Sources say he wants a fresh start in a winning environment.`,
              `BREAKING: ${lastName}'s camp has delivered a trade request to ${team?.name} management. The star is seeking a change of scenery immediately.`,
              `${unhappyDiva.name} is done in ${team?.city ?? team?.name}. Multiple sources confirm a formal trade request has been submitted to the front office.`,
              `Sources close to ${unhappyDiva.name} say frustration has reached a breaking point. He's formally asked the ${team?.name} to trade him.`,
              `${unhappyDiva.name} wants out. His agent has notified the ${team?.name} front office of a formal trade request, citing a desire to compete for a championship.`,
            ]);
            // If this is the user's team, mark the player as having requested a trade
            const isUserTeam = team?.id === newState.userTeamId;
            if (isUserTeam) {
              newState = {
                ...newState,
                teams: newState.teams.map(t =>
                  t.id === team.id
                    ? { ...t, roster: t.roster.map(p => p.id === unhappyDiva.id ? { ...p, requestedTrade: true, onTradeBlock: true } : p) }
                    : t
                ),
              };
            }
            newState = {
              ...newState,
              newsFeed: [{ id: cooldownId, category: 'trade_request' as const, headline: 'TRADE_REQUEST', content: detail, timestamp: newState.currentDay, realTimestamp: Date.now(), teamId: team?.id, playerId: unhappyDiva.id, isBreaking: true }, ...(newState.newsFeed ?? [])].slice(0, 2000),
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

  // ── Preseason game finaliser ───────────────────────────────────────────────
  // Stats don't count toward season totals; no W/L/streak impact.
  // Injuries are real, morale changes are small, news is generated.
  const finalizePreseasonGameResult = async (
    state: LeagueState,
    gameId: string,
    result: GameResult,
  ): Promise<LeagueState> => {
    let newState = { ...state };
    const homeTeam = state.teams.find(t => t.id === result.homeTeamId)!;
    const awayTeam = state.teams.find(t => t.id === result.awayTeamId)!;
    const homeWon  = result.homeScore > result.awayScore;
    const winTeam  = homeWon ? homeTeam : awayTeam;
    const loseTeam = homeWon ? awayTeam : homeTeam;

    // ── Small morale shifts (scaled way down vs regular season) ───────────
    const applyPreseasonMorale = (team: typeof homeTeam, lines: typeof result.homePlayerStats, isWinner: boolean) => ({
      ...team,
      roster: team.roster.map(p => {
        const line = lines.find(l => l.playerId === p.id);
        if (!line || line.dnp) return p;
        let morale = p.morale ?? 75;
        morale += isWinner ? 0.5 : -0.5;
        // Star player performance boost / frustration
        if (isWinner && line.pts >= 20) morale += 0.3;
        if (!isWinner && line.pts < 6 && p.rating >= 80) morale -= 0.4;
        // Personality modifiers
        if (p.personalityTraits?.includes('Loyal'))            morale += 0.1;
        if (p.personalityTraits?.includes('Gym Rat'))          morale += 0.1;
        if (p.personalityTraits?.includes('Professional'))     morale += 0.1;
        if (p.personalityTraits?.includes('Hot Head') && !isWinner) morale -= 0.3;
        // Natural drift toward baseline
        const baseline = 72 + (p.rating - 65) * 0.1;
        morale += (baseline - morale) * 0.02;
        morale = Math.min(100, Math.max(0, morale));
        return { ...p, morale };
      }),
    });

    let updatedTeams = state.teams.map(t => {
      if (t.id === homeTeam.id) return applyPreseasonMorale(t, result.homePlayerStats, homeWon);
      if (t.id === awayTeam.id) return applyPreseasonMorale(t, result.awayPlayerStats, !homeWon);
      return t;
    });

    // ── Mark game played in preseasonSchedule ────────────────────────────
    const updatedPreseasonSchedule = (state.preseasonSchedule ?? []).map(sg =>
      sg.id === gameId ? { ...sg, played: true } : sg,
    );

    // ── Track preseason W/L for user's team only ─────────────────────────
    const isUserGame = homeTeam.id === state.userTeamId || awayTeam.id === state.userTeamId;
    const userWonPreseason = isUserGame && (
      (homeTeam.id === state.userTeamId && homeWon) ||
      (awayTeam.id === state.userTeamId && !homeWon)
    );
    const prevRecord = state.preseasonRecord ?? { wins: 0, losses: 0 };
    const updatedRecord = isUserGame
      ? { wins: prevRecord.wins + (userWonPreseason ? 1 : 0), losses: prevRecord.losses + (userWonPreseason ? 0 : 1) }
      : prevRecord;

    newState = {
      ...newState,
      teams: updatedTeams,
      preseasonSchedule: updatedPreseasonSchedule,
      preseasonHistory: [result, ...(state.preseasonHistory ?? [])],
      preseasonRecord: updatedRecord,
    };

    // ── Apply in-game injuries (same severity as regular season) ─────────
    if (result.gameInjuries && result.gameInjuries.length > 0) {
      for (const inj of result.gameInjuries) {
        // Preseason injury chance modifier: 50% of regular duration unless unlucky
        const preseasonDaysOut = Math.random() < 0.15 ? inj.daysOut : Math.max(1, Math.floor(inj.daysOut * 0.5));
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== inj.teamId ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== inj.playerId ? p : {
              ...p, status: 'Injured' as PlayerStatus, injuryType: inj.injuryType as InjuryType, injuryDaysLeft: preseasonDaysOut, injuryOVRPenalty: calcInjuryOVRPenalty(preseasonDaysOut),
            }),
          }),
        };
        const injTeam   = newState.teams.find(t => t.id === inj.teamId)!;
        const injPlayer = injTeam.roster.find(p => p.id === inj.playerId)!;
        const timeLabel = preseasonDaysOut >= 14 ? `${Math.round(preseasonDaysOut / 7)} weeks` : `${preseasonDaysOut} day${preseasonDaysOut !== 1 ? 's' : ''}`;
        const detail = preseasonDaysOut >= 7
          ? `${injPlayer.name} suffered a ${inj.injuryType} during a preseason game. He faces approximately ${timeLabel} of recovery — could miss the start of the regular season.`
          : `${injPlayer.name} left a preseason game with a ${inj.injuryType}. The team is being cautious; he's expected back within ${timeLabel}.`;
        newState = await addNewsItem(newState, 'injury', { player: injPlayer, team: injTeam, detail }, preseasonDaysOut >= 14);
      }
    }

    // ── Preseason game news ──────────────────────────────────────────────
    const gamesPlayedSoFar = updatedPreseasonSchedule.filter(g => g.played).length - 1;
    const winScore  = homeWon ? result.homeScore : result.awayScore;
    const loseScore = homeWon ? result.awayScore : result.homeScore;

    // Always post a news item for the user's team game
    if (isUserGame) {
      const userTeam = state.teams.find(t => t.id === state.userTeamId)!;
      const oppTeam  = homeTeam.id === state.userTeamId ? awayTeam : homeTeam;
      const userScore = homeTeam.id === state.userTeamId ? result.homeScore : result.awayScore;
      const oppScore  = homeTeam.id === state.userTeamId ? result.awayScore : result.homeScore;
      const { headline, content } = buildPreseasonHeadline(
        userWonPreseason ? userTeam.name : oppTeam.name,
        userWonPreseason ? oppTeam.name  : userTeam.name,
        userWonPreseason ? userScore : oppScore,
        userWonPreseason ? oppScore  : userScore,
        gamesPlayedSoFar,
      );
      const recordLabel = `(${updatedRecord.wins}-${updatedRecord.losses} preseason)`;
      newState = {
        ...newState,
        newsFeed: [{
          id: `pre-game-${gameId}`,
          category: 'milestone' as const,
          headline: `${userWonPreseason ? 'W' : 'L'} ${userScore}-${oppScore} — ${headline} ${recordLabel}`,
          content,
          timestamp: newState.currentDay,
          realTimestamp: Date.now(),
          teamId: state.userTeamId,
          isBreaking: false,
        }, ...newState.newsFeed].slice(0, 2000),
      };
    } else {
      // For non-user games, post ~30% of the time to avoid flooding the feed
      if (Math.random() < 0.30) {
        const { headline, content } = buildPreseasonHeadline(
          winTeam.name, loseTeam.name, winScore, loseScore, gamesPlayedSoFar,
        );
        newState = {
          ...newState,
          newsFeed: [{
            id: `pre-game-${gameId}`,
            category: 'milestone' as const,
            headline,
            content,
            timestamp: newState.currentDay,
            realTimestamp: Date.now(),
            teamId: winTeam.id,
            isBreaking: false,
          }, ...newState.newsFeed].slice(0, 2000),
        };
      }
    }

    // ── Rookie / notable performer spotlight ─────────────────────────────
    const allLines = [...result.homePlayerStats, ...result.awayPlayerStats];
    for (const line of allLines) {
      if (line.dnp || line.pts < 20) continue;
      const player = state.teams.flatMap(t => t.roster).find(p => p.id === line.playerId);
      const team   = state.teams.find(t => t.roster.some(p => p.id === line.playerId));
      if (!player || !team) continue;
      // Only spotlight young players (≤23) or user-team players
      if (player.age > 23 && team.id !== state.userTeamId) continue;
      // Rate-limit: skip if we already posted for this player in this preseason day
      const cooldownId = `pre-rookie-${line.playerId}-day${newState.currentDay}`;
      if (newState.newsFeed.some(n => n.id === cooldownId)) continue;
      const { headline, content } = buildPreseasonRookieHeadline(
        player.name, team.name, line.pts, line.reb, line.ast, player.age,
      );
      newState = {
        ...newState,
        newsFeed: [{
          id: cooldownId,
          category: 'milestone' as const,
          headline,
          content,
          timestamp: newState.currentDay,
          realTimestamp: Date.now(),
          teamId: team.id,
          playerId: player.id,
          isBreaking: false,
        }, ...newState.newsFeed].slice(0, 2000),
      };
      break; // one spotlight per game max
    }

    return newState;
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
      // Check opponent's pre-game win% to determine if they qualify as a .500+ opponent
      const oppGames = opp.wins + opp.losses;
      const oppIsAbove500 = oppGames > 0 && opp.wins / oppGames >= 0.5;
      
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
          ...t, wins: isWinner ? t.wins + 1 : t.wins, losses: isWinner ? t.losses : t.losses + 1, homeWins: isHome && isWinner ? t.homeWins + 1 : t.homeWins, homeLosses: isHome && !isWinner ? t.homeLosses + 1 : t.homeLosses, roadWins: !isHome && isWinner ? t.roadWins + 1 : t.roadWins, roadLosses: !isHome && !isWinner ? t.roadLosses + 1 : t.roadLosses, confWins: isConfGame && isWinner ? (t.confWins || 0) + 1 : (t.confWins || 0), confLosses: isConfGame && !isWinner ? (t.confLosses || 0) + 1 : (t.confLosses || 0), vsAbove500W: oppIsAbove500 && isWinner ? (t.vsAbove500W ?? 0) + 1 : (t.vsAbove500W ?? 0), vsAbove500L: oppIsAbove500 && !isWinner ? (t.vsAbove500L ?? 0) + 1 : (t.vsAbove500L ?? 0), lastTen, streak: isWinner ? (t.streak >= 0 ? t.streak + 1 : 1) : (t.streak <= 0 ? t.streak - 1 : -1), finances: { ...t.finances, ownerPatience: state.settings.ownerMeterEnabled ? Math.min(100, Math.max(0, t.finances.ownerPatience + patienceDelta)) : 100, cash: t.finances.cash + (isHome ? 250000 : 0) }
        };
      }
      return t;
    });

    const updateStats = (team: Team, lines: any[], isWinner: boolean, opponentTeamId: string, opponentTeamName: string) => {
      return {
        ...team,
        roster: team.roster.map(p => {
          const line = lines.find(l => l.playerId === p.id);
          // Suspended players: decrement suspension games counter, clear when served
          if (line?.dnp === 'Suspended') {
            const remaining = (p.suspensionGames ?? 1) - 1;
            if (remaining <= 0) {
              return { ...p, isSuspended: false, suspensionGames: 0, suspensionReason: undefined, suspensionAppealed: undefined };
            }
            return { ...p, suspensionGames: remaining };
          }
          // No line, or other DNP (injured/inactive) — leave all stats untouched
          if (!line || line.dnp) return p;
          const newTechs = (p.stats.techs || 0) + (line.techs || 0);
          const newFlagrants = (p.stats.flagrants || 0) + (line.flagrants || 0);
          const newEjections = (p.stats.ejections || 0) + (line.ejected ? 1 : 0);
          
          let isSuspended = p.isSuspended;
          let suspensionGames = p.suspensionGames || 0;
          let suspensionReason = p.suspensionReason;
          
          // Season tech foul accumulation: 16 techs = 1-game suspension (per NBA rule)
          if (newTechs >= 16 && (p.stats.techs || 0) < 16) {
            isSuspended = true;
            suspensionGames = Math.max(suspensionGames, 1);
            suspensionReason = suspensionReason || '16th technical foul of the season';
          }

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

          const logEntry = {
            ...line,
            date: state.currentDay,
            opponentTeamId,
            opponentTeamName,
          };
          // Keep last 30 games only to avoid unbounded save-game growth
          const updatedGameLog = [...(p.gameLog ?? []), logEntry].slice(-30);

          return {
            ...p,
            isSuspended,
            suspensionGames,
            suspensionReason,
            morale,
            gameLog: updatedGameLog,
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
      if (t.id === homeTeam.id) return updateStats(t, result.homePlayerStats, isWinner, awayTeam.id, awayTeam.name);
      if (t.id === awayTeam.id) return updateStats(t, result.awayPlayerStats, isWinner, homeTeam.id, homeTeam.name);
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

    // ── Game Result News ──────────────────────────────────────────────────────
    {
      const margin = Math.abs(result.homeScore - result.awayScore);
      const winnerTeam = newState.teams.find(t => t.id === (homeWon ? homeTeam.id : awayTeam.id))!;
      const loserTeam  = newState.teams.find(t => t.id === (homeWon ? awayTeam.id : homeTeam.id))!;
      const winScore   = homeWon ? result.homeScore : result.awayScore;
      const loseScore  = homeWon ? result.awayScore : result.homeScore;
      const score      = `${winScore}-${loseScore}`;

      // Top performer string
      const topPerf = result.topPerformers[0];
      let topPerfStr = '';
      if (topPerf) {
        for (const t of newState.teams) {
          const p = t.roster.find(pl => pl.id === topPerf.playerId);
          if (p) {
            const parts = [`${topPerf.points} pts`];
            if (topPerf.rebounds >= 10) parts.push(`${topPerf.rebounds} reb`);
            if (topPerf.assists >= 8)   parts.push(`${topPerf.assists} ast`);
            topPerfStr = `${p.name}: ${parts.join('/')}`;
            break;
          }
        }
      }

      const isUserInvolved = winnerTeam.id === newState.userTeamId || loserTeam.id === newState.userTeamId;
      const isNotable = result.isOvertime || result.isBuzzerBeater || result.isComeback || margin >= 20
        || winnerTeam.streak >= 5 || loserTeam.streak <= -5;

      if (isNotable || isUserInvolved || Math.random() < 0.28) {
        const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        const wCity = winnerTeam.city; const wName = winnerTeam.name;
        const lCity = loserTeam.city;  const lName = loserTeam.name;
        const tp    = topPerfStr ? ` ${topPerfStr}.` : '';

        let headline: string;
        let content: string;
        let isBreaking = false;

        if (result.isBuzzerBeater) {
          isBreaking = true;
          headline = 'BUZZER BEATER';
          content = pick([
            `${wCity} stuns ${lCity} at the buzzer, ${score}!${tp}`,
            `UNBELIEVABLE! ${wName} win it at the horn, ${score}. ${lCity} thought they had it.${tp}`,
            `The final shot drops as time expires — ${wCity} wins ${score} over ${lCity}.${tp}`,
            `${wCity} heart-stopper! ${score} final over ${lCity} on a walk-off shot.${tp}`,
          ]);
        } else if (result.isOvertime) {
          isBreaking = true;
          headline = 'OVERTIME THRILLER';
          content = pick([
            `${wCity} survives overtime to edge ${lCity}, ${score}.${tp}`,
            `It took extra time, but ${wName} come out on top ${score} over ${lCity}.${tp}`,
            `OT drama! ${wCity} outlasts ${lCity} ${score}.${tp}`,
            `${lCity} couldn't close it out — ${wCity} wins in OT, ${score}.${tp}`,
          ]);
        } else if (result.isComeback) {
          isBreaking = true;
          headline = 'STUNNING COMEBACK';
          content = pick([
            `${wCity} overcomes a double-digit deficit to beat ${lCity} ${score}.${tp}`,
            `Down big, ${wName} rally for the ${score} victory over ${lCity}.${tp}`,
            `${lCity} had it. ${wCity} took it back. Final: ${score}.${tp}`,
            `Never count out ${wCity} — they erase a huge lead to win ${score}.${tp}`,
          ]);
        } else if (margin >= 25) {
          headline = 'BLOWOUT';
          content = pick([
            `${wCity} destroys ${lCity} by ${margin} points, ${score}. No contest.${tp}`,
            `Mercy rule needed — ${wName} rout ${lName} ${score}.${tp}`,
            `${lCity} had no answers. ${wCity} wins going away, ${score}.${tp}`,
            `${wCity} makes a statement, crushing ${lCity} ${score}.${tp}`,
          ]);
        } else if (margin >= 20) {
          headline = 'DOMINANT WIN';
          content = pick([
            `${wCity} dominates ${lCity} ${score} in a lopsided affair.${tp}`,
            `${wName} roll over ${lName} by ${margin}, ${score}.${tp}`,
            `${lCity} had no answers tonight — ${wCity} wins ${score}.${tp}`,
          ]);
        } else if (winnerTeam.streak >= 8) {
          isBreaking = true;
          headline = `${winnerTeam.streak}-GAME WIN STREAK`;
          content = pick([
            `${wCity} are on FIRE — ${winnerTeam.streak} straight wins after a ${score} victory over ${lCity}.${tp}`,
            `Is anyone stopping ${wName}? Win ${winnerTeam.streak} in a row, ${score} over ${lCity}.${tp}`,
          ]);
        } else if (winnerTeam.streak >= 5) {
          headline = `${winnerTeam.streak}-GAME WIN STREAK`;
          content = pick([
            `${wCity} make it ${winnerTeam.streak} in a row with a ${score} win over ${lCity}.${tp}`,
            `The ${wName} roll on — ${winnerTeam.streak} straight after beating ${lCity} ${score}.${tp}`,
            `Can anyone stop ${wCity}? Streak hits ${winnerTeam.streak} after ${score}.${tp}`,
          ]);
        } else if (loserTeam.streak <= -5) {
          headline = 'LOSING SKID CONTINUES';
          content = pick([
            `${lCity} drop their ${Math.abs(loserTeam.streak)}th straight, falling ${score} to ${wCity}.${tp}`,
            `${lName} can't find a win — now ${Math.abs(loserTeam.streak)} losses in a row after ${score} defeat.${tp}`,
            `The skid hits ${Math.abs(loserTeam.streak)} for ${lCity}, losing to ${wCity} ${score}.${tp}`,
          ]);
        } else if (margin <= 4 && result.hasClutchSituation) {
          headline = 'CLUTCH WIN';
          content = pick([
            `${wCity} survives a clutch battle, edging ${lCity} ${score}.${tp}`,
            `Down to the wire — ${wName} hold off ${lName} ${score}.${tp}`,
            `${lCity} pushed hard but ${wCity} takes the nail-biter, ${score}.${tp}`,
            `Clutch time belonged to ${wCity}: ${score} final over ${lCity}.${tp}`,
          ]);
        } else {
          headline = 'FINAL';
          content = pick([
            `${wCity} ${score} over ${lCity}.${tp}`,
            `${wName} beat ${lName} ${score}.${tp}`,
            `${wCity} picks up the win over ${lCity}, ${score}.${tp}`,
            `${score}: ${wCity} gets it done against ${lCity}.${tp}`,
          ]);
        }

        const newsId = `gameresult-${result.id}`;
        if (!(newState.newsFeed ?? []).some(n => n.id === newsId)) {
          const involvedTeamId = winnerTeam.id === newState.userTeamId ? winnerTeam.id
            : loserTeam.id === newState.userTeamId ? loserTeam.id : winnerTeam.id;
          newState = {
            ...newState,
            newsFeed: [{
              id: newsId,
              category: 'milestone' as NewsCategory,
              headline,
              content: content.trim(),
              timestamp: newState.currentDay,
              realTimestamp: Date.now(),
              teamId: involvedTeamId,
              isBreaking,
            }, ...(newState.newsFeed ?? [])].slice(0, 2000),
          };
        }
      }
    }

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
              newsFeed: [{ id: cooldownId, category: 'transaction' as const, headline: 'TRANSACTION', content: detail, timestamp: newState.currentDay, realTimestamp: Date.now(), teamId: userTeamUpdated.id, playerId: p.id, isBreaking: false }, ...(newState.newsFeed ?? [])].slice(0, 2000),
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
              newsFeed: [{ id: cooldownId, category: 'rumor' as const, headline: 'RUMOR', content: detail, timestamp: newState.currentDay, realTimestamp: Date.now(), teamId: userTeamUpdated.id, playerId: p.id, isBreaking: true }, ...(newState.newsFeed ?? [])].slice(0, 2000),
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

    // ── Apply suspension events from in-game triggers ─────────────────────
    if (result.gameSuspensions && result.gameSuspensions.length > 0) {
      for (const susp of result.gameSuspensions) {
        // Skip if the player is somehow already suspended for more games
        const suspTeamBefore = newState.teams.find(t => t.id === susp.teamId);
        const suspPlayerBefore = suspTeamBefore?.roster.find(p => p.id === susp.playerId);
        if (!suspPlayerBefore || !suspTeamBefore) continue;
        const totalGames = Math.max(susp.games, (suspPlayerBefore.suspensionGames ?? 0) + susp.games);
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== susp.teamId ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== susp.playerId ? p : {
              ...p,
              isSuspended: true,
              suspensionGames: totalGames,
              suspensionReason: susp.reason,
              morale: Math.max(0, Math.min(100, (p.morale ?? 75) - 8)),
            })
          })
        };
        const suspTeam = newState.teams.find(t => t.id === susp.teamId)!;
        const suspPlayer = suspTeam.roster.find(p => p.id === susp.playerId)!;
        const gamesLabel = `${totalGames} game${totalGames !== 1 ? 's' : ''}`;
        const suspDetail = `${suspPlayer.name} has been suspended ${gamesLabel} by the league following a ${susp.reason}.`;
        newState = await addNewsItem(newState, 'suspension' as NewsCategory, { player: suspPlayer, team: suspTeam, detail: suspDetail }, true);
        // Owner patience penalty for user team
        if (susp.teamId === newState.userTeamId) {
          newState = {
            ...newState,
            teams: newState.teams.map(t => t.id !== susp.teamId ? t : {
              ...t,
              finances: { ...t.finances, ownerPatience: Math.max(0, Math.min(100, t.finances.ownerPatience - 3)) }
            })
          };
        }
        // Morale hit across team (disruption to lineup)
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== susp.teamId ? t : {
            ...t,
            roster: t.roster.map(p => p.id === susp.playerId ? p : {
              ...p, morale: Math.max(0, Math.min(100, (p.morale ?? 75) - 2))
            })
          })
        };
      }
    }

    // Apply in-game injuries
    if (result.gameInjuries && result.gameInjuries.length > 0) {
      const isPlayoffs = !!newState.playoffBracket;
      for (const inj of result.gameInjuries) {
        // Roll career-ending before applying standard injury fields
        const injVictim = newState.teams.find(t => t.id === inj.teamId)?.roster.find(p => p.id === inj.playerId);
        const victimAge = injVictim?.age ?? 25;
        const isCareerEnding = rollCareerEnding(inj.daysOut, victimAge, isPlayoffs);
        const effectiveDays = isCareerEnding ? 999 : inj.daysOut;
        const ovrPenalty = calcInjuryOVRPenalty(isCareerEnding ? 31 : inj.daysOut); // severe penalty for career-enders
        const potLoss = isCareerEnding ? 3 + Math.floor(Math.random() * 6) : 0;

        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id !== inj.teamId ? t : {
            ...t,
            roster: t.roster.map(p => p.id !== inj.playerId ? p : {
              ...p,
              status: 'Injured' as PlayerStatus,
              injuryType: inj.injuryType as InjuryType,
              injuryDaysLeft: effectiveDays,
              injuryOVRPenalty: ovrPenalty,
              isPlayingThrough: false,
              isCareerEnding: isCareerEnding || undefined,
              ...(isCareerEnding ? {
                potential: Math.max(p.rating, p.potential - potLoss),
                potentialLossNote: `Potential severely impacted by career-threatening injury (-${potLoss})`,
              } : {}),
            })
          })
        };
        const injTeam = newState.teams.find(t => t.id === inj.teamId)!;
        const injPlayer = injTeam.roster.find(p => p.id === inj.playerId)!;
        const wks = inj.daysOut >= 14 ? ` (${Math.round(inj.daysOut / 7)} wks)` : '';
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
            if (isCareerEnding) {
              const careerTemplates = [
                `BREAKING: ${injPlayer.name} has suffered a potentially career-altering ${inj.injuryType}. He is ruled out for the remainder of the season. The league holds its breath.`,
                `Heartbreaking news: ${injPlayer.name} is done for the year after a catastrophic ${inj.injuryType}. His long-term future is in serious doubt.`,
                `${injPlayer.name} exits on a stretcher with what doctors are calling a career-threatening ${inj.injuryType}. The organization offers no timetable for his return.`,
              ];
              return careerTemplates[Math.floor(Math.random() * careerTemplates.length)];
            }
            const timeStr = wks ? wks.trim() : `${inj.daysOut} day${inj.daysOut !== 1 ? 's' : ''}`;
            const severe = inj.daysOut >= 31;
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
        }, inj.daysOut >= 14 || isCareerEnding);
      }
    }

    return newState;
  };

  const executeSimDay = async (state: LeagueState): Promise<{newState: LeagueState, dayResults: GameResult[]}> => {
    // ── Determine whether we are simulating preseason or regular season ───
    const isPreseasonPhase = state.seasonPhase === 'Preseason';
    const preseasonUnplayed = (state.preseasonSchedule ?? []).filter(g => !g.played);
    const usePreseason = isPreseasonPhase && preseasonUnplayed.length > 0;

    const gamesToPlay = usePreseason
      ? (state.preseasonSchedule ?? []).filter(g => g.day === state.currentDay && !g.played)
      : state.schedule.filter(g => g.day === state.currentDay && !g.played);

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
      if (usePreseason) {
        newState = await finalizePreseasonGameResult(newState, game.id, result);
      } else {
        newState = await finalizeGameResult(newState, game.id, result);
      }
    }

    // ── After preseason day: check if all preseason games are complete ────
    if (usePreseason) {
      const allPreseasonDone = (newState.preseasonSchedule ?? []).every(g => g.played);
      if (allPreseasonDone) {
        // Cut AI team rosters to league max (WNBA: 12, NBA: 15) — release excess to FA pool
        const MAX_ROSTER = newState.settings.maxRosterSize ?? 15;
        const releasedCuts: typeof newState.freeAgents = [];
        const postCutTeams = newState.teams.map(t => {
          if (t.id === newState.userTeamId) return t; // user manages own cuts
          if (t.roster.length <= MAX_ROSTER) return t;
          const sorted = [...t.roster].sort((a, b) => b.rating - a.rating);
          const isWomensLeagueCut = (newState.settings.playerGenderRatio ?? 0) === 100;
          const released = sorted.slice(MAX_ROSTER).map(p => ({
            ...p, isFreeAgent: true, inSeasonFA: true, contractYears: 0,
            desiredContract: {
              years: p.rating >= 70 ? 2 : 1,
              salary: isWomensLeagueCut ? (p.desiredContract?.salary || p.salary || 25_000) : computeMensMarketSalary(p.rating, newState.season ?? 2026),
            },
          }));
          releasedCuts.push(...released);
          return { ...t, roster: sorted.slice(0, MAX_ROSTER) };
        });
        const cutFAIds = new Set(newState.freeAgents.map(p => p.id));
        const updatedFAsAfterCuts = [
          ...newState.freeAgents,
          ...releasedCuts.filter(p => !cutFAIds.has(p.id)),
        ];

        newState = {
          ...newState,
          teams: postCutTeams,
          freeAgents: updatedFAsAfterCuts,
          seasonPhase: 'Regular Season' as SeasonPhase,
          currentDay: 1,
          newsFeed: [{
            id: `preseason-complete-${newState.season}`,
            category: 'milestone' as const,
            headline: 'PRESEASON COMPLETE — REGULAR SEASON BEGINS',
            content: `Training camp is over. AI teams have set their 14-man rosters. Check your own depth chart — the regular season tips off now!`,
            timestamp: 1,
            realTimestamp: Date.now(),
            isBreaking: true,
          }, ...newState.newsFeed].slice(0, 2000),
        };
        return { newState, dayResults }; // don't increment day again
      }
      // Preseason still has games — run basic daily events (injury recovery only) and advance day
      newState = await processDailyLeagueEvents(newState);
      return { newState: { ...newState, currentDay: newState.currentDay + 1 }, dayResults };
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
            newsFeed: [...tradeResult.newsItems, ...(newState.newsFeed || [])].slice(0, 2000),
            transactions: [...tradeResult.transactions, ...(newState.transactions || [])].slice(0, 1000),
          };
        } else {
          newState = tradeResult.updatedState;
        }
      } catch (_e) { /* non-fatal */ }
    }

    // ── Generate incoming AI-to-user trade proposals (every 3 sim-days) ──
    // Decoupled from the weekly AI-to-AI block so it fires more frequently.
    if (!newState.isOffseason && newState.currentDay % 3 === 0 && !newState.tradeDeadlinePassed && !newState.playoffBracket) {
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

    // ── AI in-season / preseason signings ──────────────────────────────────
    // Pass 1 – Fill short rosters every day for ALL teams under 15 active healthy players.
    // Pass 2 – Upgrade/waive-and-sign evaluation, staggered every 4-6 days per team.
    const isPreseasonPhaseSign = newState.seasonPhase === 'Preseason';
    // Always maintain at least 15 active healthy players; during preseason fill to maxRoster.
    const maxRosterForSign = newState.settings.maxRosterSize ?? 15;
    const signingThreshold = isPreseasonPhaseSign ? maxRosterForSign : 15;
    if (!newState.isOffseason && newState.freeAgents.length > 0) {
      const cap = newState.settings.salaryCap || 140_000_000;
      const maxRoster = maxRosterForSign;

      // Pass 1: fill every AI team below the threshold — no random gating
      const aiTeamsNeedingHelp = newState.teams.filter(t => {
        if (t.id === newState.userTeamId) return false;
        const activeRoster = t.roster.filter(p => !p.injuryDaysLeft || p.injuryDaysLeft === 0);
        return activeRoster.length < signingThreshold;
      });
      const teamsToProcess = aiTeamsNeedingHelp; // always process — no luck gate
      const inSeasonRules = getContractRules(newState);
      const leagueMin = inSeasonRules.minPlayerSalary;
      const leagueMax = inSeasonRules.maxPlayerSalary;
      const increment = inSeasonRules.isWomens ? 5_000 : 250_000;
      for (const team of teamsToProcess) {
        const teamSalary = team.roster.reduce((s, p) => s + (p.salary || 0), 0);
        const teamCapSpace = cap - teamSalary;
        if (teamCapSpace < leagueMin) continue;
        const eligible = [...newState.freeAgents]
          .filter(fa => {
            const marketVal = inSeasonRules.isWomens
              ? (fa.desiredContract?.salary || leagueMin)
              : Math.max(fa.desiredContract?.salary || 0, computeMensMarketSalary(fa.rating, newState.season ?? 2026));
            return marketVal <= teamCapSpace * 1.2;
          })
          .sort((a, b) => b.rating - a.rating);
        if (eligible.length === 0) continue;
        const fa = eligible[Math.floor(Math.random() * Math.min(3, eligible.length))];
        const faDesired = inSeasonRules.isWomens
          ? (fa.desiredContract?.salary || leagueMin)
          : Math.max(fa.desiredContract?.salary || 0, computeMensMarketSalary(fa.rating, newState.season ?? 2026));
        // AI GMs are conservative: 75–95% of market for bench/rotation, 85–100% for starters+
        const conservativeMult = fa.rating >= 85 ? 0.85 + Math.random() * 0.15
          : fa.rating >= 75 ? 0.80 + Math.random() * 0.15
          : 0.75 + Math.random() * 0.20;
        const rawSalary = Math.round(faDesired * conservativeMult / increment) * increment;
        const cappedSalary = Math.min(rawSalary, leagueMax);
        const salary = Math.max(leagueMin, Math.min(cappedSalary, teamCapSpace));
        const signingType = isPreseasonPhaseSign ? 'training camp contract' : (salary <= 700_000 ? '10-day' : 'rest-of-season minimum');
        const signedPlayer = { ...fa, isFreeAgent: false, inSeasonFA: false, salary, contractYears: 1, morale: Math.min(100, (fa.morale || 70) + 5) };
        newState = {
          ...newState,
          teams: newState.teams.map(t => t.id === team.id ? { ...t, roster: [...t.roster, signedPlayer] } : t),
          freeAgents: newState.freeAgents.filter(p => p.id !== fa.id),
          newsFeed: isPreseasonPhaseSign
            ? newState.newsFeed
            : [{
                id: `in-season-sign-${Date.now()}-${fa.id}`,
                category: 'transaction' as const,
                headline: `${fa.name} agrees to terms with ${team.name}`,
                content: `The ${team.name} agree to terms with ${fa.name} (${fa.position}, ${fa.rating} OVR) on a ${signingType} deal worth ${fmtSalary(salary)}.`,
                timestamp: newState.currentDay,
                realTimestamp: Date.now(),
                isBreaking: false,
              }, ...newState.newsFeed].slice(0, 2000),
        };
      }

      // Pass 2: regular-season upgrade and waive-and-sign evaluation (staggered per team)
      if (!isPreseasonPhaseSign) {
        const pickArr = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        const qualityFAs = [...newState.freeAgents]
          .filter(fa => fa.rating >= 65)
          .sort((a, b) => b.rating - a.rating);

        for (const team of newState.teams) {
          if (team.id === newState.userTeamId) continue;
          // Stagger: each team evaluates on a different day cadence using a hash
          const teamHash = team.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const evalInterval = 4 + (teamHash % 3); // 4, 5, or 6 days per team
          if ((newState.currentDay + teamHash) % evalInterval !== 0) continue;
          if (qualityFAs.length === 0) break;

          const teamSalary = team.roster.reduce((s, p) => s + (p.salary || 0), 0);
          const teamCapSpace = cap - teamSalary;

          if (team.roster.length < maxRoster) {
            // Has room — sign if best affordable FA is a meaningful upgrade over current bench
            const affordable = qualityFAs.find(fa => {
              const mkt = inSeasonRules.isWomens ? (fa.desiredContract?.salary || leagueMin) : Math.max(fa.desiredContract?.salary || 0, computeMensMarketSalary(fa.rating, newState.season ?? 2026));
              return mkt <= teamCapSpace * 1.1;
            });
            if (!affordable) continue;
            const benchOVRs = [...team.roster].sort((a, b) => a.rating - b.rating).slice(0, 4);
            const avgBenchOVR = benchOVRs.reduce((s, p) => s + p.rating, 0) / Math.max(1, benchOVRs.length);
            if (affordable.rating < avgBenchOVR + 4) continue; // not a meaningful upgrade
            const p2Market = inSeasonRules.isWomens ? (affordable.desiredContract?.salary || leagueMin) : Math.max(affordable.desiredContract?.salary || 0, computeMensMarketSalary(affordable.rating, newState.season ?? 2026));
            const rawSal = Math.round(p2Market * (0.80 + Math.random() * 0.15) / 250_000) * 250_000;
            const salary = Math.max(leagueMin, Math.min(rawSal, teamCapSpace));
            const sigType = salary <= 700_000 ? '10-day deal' : 'rest-of-season deal';
            const signedFa = { ...affordable, isFreeAgent: false, inSeasonFA: false, salary, contractYears: 1, morale: Math.min(100, (affordable.morale || 70) + 8) };
            newState = {
              ...newState,
              teams: newState.teams.map(t => t.id === team.id ? { ...t, roster: [...t.roster, signedFa] } : t),
              freeAgents: newState.freeAgents.filter(p => p.id !== affordable.id),
              newsFeed: [{
                id: `upgrade-sign-${newState.currentDay}-${affordable.id}`,
                category: 'transaction' as const,
                headline: `${team.name} sign ${affordable.name}`,
                content: pickArr([
                  `${team.name} agree to terms with ${affordable.name} (${affordable.position}, ${affordable.rating} OVR) on a ${sigType}. He'll compete for minutes immediately.`,
                  `${affordable.name} finds a new home — the ${team.name} sign the ${affordable.rating}-OVR ${affordable.position} on a ${sigType}.`,
                  `Roster move: ${team.city} ${team.name} add ${affordable.name} (${affordable.rating} OVR) on a ${sigType} to bolster their rotation.`,
                ]),
                timestamp: newState.currentDay,
                realTimestamp: Date.now(),
                isBreaking: affordable.rating >= 82,
              }, ...newState.newsFeed].slice(0, 2000),
            };
            // Remove from qualityFAs to avoid double-signing same player
            qualityFAs.splice(qualityFAs.indexOf(affordable), 1);

          } else {
            // Full roster — evaluate waive-and-sign if a quality FA is significantly better than worst bench
            const bestFA = qualityFAs[0];
            const nonStarters = [...team.roster]
              .filter(p => p.status !== 'Starter' && !p.isSuspended && !(p.injuryDaysLeft && p.injuryDaysLeft > 0))
              .sort((a, b) => a.rating - b.rating);
            const worstBench = nonStarters[0];
            if (!worstBench || bestFA.rating < worstBench.rating + 8) continue;
            // Check affordability after waiving
            const capAfterWaive = cap - (teamSalary - (worstBench.salary || 0));
            const affordable = qualityFAs.find(fa => {
              const mkt = inSeasonRules.isWomens ? (fa.desiredContract?.salary || leagueMin) : Math.max(fa.desiredContract?.salary || 0, computeMensMarketSalary(fa.rating, newState.season ?? 2026));
              return fa.id !== worstBench.id && mkt <= capAfterWaive * 1.1;
            });
            if (!affordable) continue;
            const p2wMarket = inSeasonRules.isWomens ? (affordable.desiredContract?.salary || leagueMin) : Math.max(affordable.desiredContract?.salary || 0, computeMensMarketSalary(affordable.rating, newState.season ?? 2026));
            const rawSal = Math.round(p2wMarket * (0.80 + Math.random() * 0.15) / 250_000) * 250_000;
            const salary = Math.max(leagueMin, Math.min(rawSal, capAfterWaive));
            const signedFa = { ...affordable, isFreeAgent: false, inSeasonFA: false, salary, contractYears: 1, morale: Math.min(100, (affordable.morale || 70) + 8) };
            const waived: Player = { ...worstBench, isFreeAgent: true, salary: 0, contractYears: 0 };
            const rosterAfterWaive = team.roster.filter(p => p.id !== worstBench.id);
            newState = {
              ...newState,
              teams: newState.teams.map(t => t.id === team.id ? { ...t, roster: [...rosterAfterWaive, signedFa] } : t),
              freeAgents: [...newState.freeAgents.filter(p => p.id !== affordable.id), waived],
              newsFeed: [
                {
                  id: `waive-sign-${newState.currentDay}-${affordable.id}`,
                  category: 'transaction' as const,
                  headline: `${team.name} waive ${worstBench.name}, sign ${affordable.name}`,
                  content: pickArr([
                    `Roster shuffle in ${team.city}: ${team.name} waive ${worstBench.name} (${worstBench.rating} OVR) and sign ${affordable.name} (${affordable.rating} OVR) in a clear upgrade move.`,
                    `${team.name} make a move — ${worstBench.name} is released and ${affordable.name} (${affordable.position}, ${affordable.rating} OVR) joins the rotation on a rest-of-season deal.`,
                    `${affordable.name} heads to ${team.city}. ${team.name} waive ${worstBench.name} to make room for the ${affordable.rating}-rated ${affordable.position}.`,
                  ]),
                  timestamp: newState.currentDay,
                  realTimestamp: Date.now(),
                  isBreaking: affordable.rating >= 82,
                },
                ...newState.newsFeed,
              ].slice(0, 200),
            };
            qualityFAs.splice(qualityFAs.indexOf(affordable), 1);
          }
        }
      }

      // Pass 3: post-trade-deadline playoff-push signings (more aggressive for contenders)
      if (newState.tradeDeadlinePassed && !newState.playoffBracket && newState.freeAgents.length > 0) {
        const pickArr = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        // Rank teams by win% to identify contenders (top-half of standings)
        const sortedByWins = [...newState.teams]
          .filter(t => t.id !== newState.userTeamId)
          .sort((a, b) => (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses)));
        const playoffCutline = Math.ceil(sortedByWins.length / 2);
        const contenders = sortedByWins.slice(0, playoffCutline);

        const postDlFAs = [...newState.freeAgents]
          .filter(fa => fa.rating >= 68)
          .sort((a, b) => b.rating - a.rating);

        for (const team of contenders) {
          // Stagger: evaluate every 5 days per team
          const teamHash2 = team.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          if ((newState.currentDay + teamHash2) % 5 !== 0) continue;
          if (postDlFAs.length === 0) break;

          const teamSalary = team.roster.reduce((s, p) => s + (p.salary || 0), 0);
          const teamCapSpace = cap - teamSalary;

          if (team.roster.length < maxRosterForSign) {
            // Has cap room — sign if a meaningful upgrade is available
            const affordable = postDlFAs.find(fa => {
              const mkt = inSeasonRules.isWomens ? (fa.desiredContract?.salary || inSeasonRules.minPlayerSalary) : Math.max(fa.desiredContract?.salary || 0, computeMensMarketSalary(fa.rating, newState.season ?? 2026));
              return mkt <= teamCapSpace * 1.15;
            });
            if (!affordable) continue;
            const benchOVRs = [...team.roster].sort((a, b) => a.rating - b.rating).slice(0, 5);
            const avgBench = benchOVRs.reduce((s, p) => s + p.rating, 0) / Math.max(1, benchOVRs.length);
            if (affordable.rating < avgBench + 3) continue;
            const mkt = inSeasonRules.isWomens ? (affordable.desiredContract?.salary || inSeasonRules.minPlayerSalary) : Math.max(affordable.desiredContract?.salary || 0, computeMensMarketSalary(affordable.rating, newState.season ?? 2026));
            const rawSal = Math.round(mkt * (0.85 + Math.random() * 0.12) / (inSeasonRules.isWomens ? 5_000 : 250_000)) * (inSeasonRules.isWomens ? 5_000 : 250_000);
            const salary = Math.max(inSeasonRules.minPlayerSalary, Math.min(rawSal, Math.min(teamCapSpace, inSeasonRules.maxPlayerSalary)));
            const signedFa = { ...affordable, isFreeAgent: false, inSeasonFA: false, salary, contractYears: 1, morale: Math.min(100, (affordable.morale || 70) + 10) };
            newState = {
              ...newState,
              teams: newState.teams.map(t => t.id === team.id ? { ...t, roster: [...t.roster, signedFa] } : t),
              freeAgents: newState.freeAgents.filter(p => p.id !== affordable.id),
              newsFeed: [{
                id: `playoff-push-sign-${newState.currentDay}-${affordable.id}`,
                category: 'transaction' as const,
                headline: `${team.name} add ${affordable.name} in playoff push`,
                content: pickArr([
                  `With the trade deadline behind them, the ${team.name} bolster their roster by signing ${affordable.name} (${affordable.position}, ${affordable.rating} OVR) — a clear statement of intent for the postseason.`,
                  `${team.city} makes a post-deadline move: ${affordable.name} (${affordable.rating} OVR) joins the ${team.name} on a rest-of-season deal as they eye a playoff berth.`,
                  `${affordable.name} is heading to ${team.city}. The ${team.name} sign the ${affordable.rating}-OVR ${affordable.position} to bolster their playoff-push rotation.`,
                ]),
                timestamp: newState.currentDay,
                realTimestamp: Date.now(),
                isBreaking: affordable.rating >= 80,
              }, ...newState.newsFeed].slice(0, 2000),
            };
            postDlFAs.splice(postDlFAs.indexOf(affordable), 1);
          } else {
            // Full roster — waive-and-sign if FA is a clear upgrade (lower bar for contenders: +5 OVR)
            const bestFA = postDlFAs[0];
            const nonStarters = [...team.roster]
              .filter(p => p.status !== 'Starter' && !p.isSuspended && !(p.injuryDaysLeft && p.injuryDaysLeft > 0))
              .sort((a, b) => a.rating - b.rating);
            const worstBench = nonStarters[0];
            if (!worstBench || bestFA.rating < worstBench.rating + 5) continue;
            const capAfterWaive = cap - (teamSalary - (worstBench.salary || 0));
            const affordable2 = postDlFAs.find(fa => {
              const mkt = inSeasonRules.isWomens ? (fa.desiredContract?.salary || inSeasonRules.minPlayerSalary) : Math.max(fa.desiredContract?.salary || 0, computeMensMarketSalary(fa.rating, newState.season ?? 2026));
              return fa.id !== worstBench.id && mkt <= capAfterWaive * 1.15;
            });
            if (!affordable2) continue;
            const mkt2 = inSeasonRules.isWomens ? (affordable2.desiredContract?.salary || inSeasonRules.minPlayerSalary) : Math.max(affordable2.desiredContract?.salary || 0, computeMensMarketSalary(affordable2.rating, newState.season ?? 2026));
            const rawSal2 = Math.round(mkt2 * (0.85 + Math.random() * 0.12) / (inSeasonRules.isWomens ? 5_000 : 250_000)) * (inSeasonRules.isWomens ? 5_000 : 250_000);
            const salary2 = Math.max(inSeasonRules.minPlayerSalary, Math.min(rawSal2, Math.min(capAfterWaive, inSeasonRules.maxPlayerSalary)));
            const signedFa2 = { ...affordable2, isFreeAgent: false, inSeasonFA: false, salary: salary2, contractYears: 1, morale: Math.min(100, (affordable2.morale || 70) + 10) };
            const waived2: Player = { ...worstBench, isFreeAgent: true, salary: 0, contractYears: 0 };
            newState = {
              ...newState,
              teams: newState.teams.map(t => t.id === team.id ? { ...t, roster: [...team.roster.filter(p => p.id !== worstBench.id), signedFa2] } : t),
              freeAgents: [...newState.freeAgents.filter(p => p.id !== affordable2.id), waived2],
              newsFeed: [{
                id: `playoff-waive-sign-${newState.currentDay}-${affordable2.id}`,
                category: 'transaction' as const,
                headline: `${team.name} cut ${worstBench.name}, sign ${affordable2.name} for playoff push`,
                content: pickArr([
                  `Playoff-push move: ${team.name} waive ${worstBench.name} and add ${affordable2.name} (${affordable2.position}, ${affordable2.rating} OVR) on a rest-of-season deal.`,
                  `${team.city} shuffles the roster — ${worstBench.name} is released and ${affordable2.name} (${affordable2.rating} OVR) signs on as the ${team.name} gear up for the postseason.`,
                ]),
                timestamp: newState.currentDay,
                realTimestamp: Date.now(),
                isBreaking: affordable2.rating >= 80,
              }, ...newState.newsFeed].slice(0, 2000),
            };
            postDlFAs.splice(postDlFAs.indexOf(affordable2), 1);
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
              newState = { ...newState, newsFeed: [...aiDeadlineResult.newsItems, ...(newState.newsFeed || [])].slice(0, 2000) };
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
        {
          const pickAS = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
          const asdResult = completedAsd;
          const dunkWinner    = asdResult.dunkContest?.winner.playerName;
          const threePtWinner = asdResult.threePtContest?.winner.playerName;
          const skillsWinner  = asdResult.skillsChallenge?.winner.playerName;

          const mvpTemplates = mvp ? [
            `${confWon} defeats ${confWon === 'East' ? 'West' : 'East'} ${gameScore}! ${mvp.playerName} (${mvp.statLine}) named All-Star Game MVP!`,
            `ALL-STAR GAME FINAL: ${confWon} ${gameScore}. ${mvp.playerName} was simply unstoppable — ${mvp.statLine} earns him MVP honors.`,
            `${confWon} wins the All-Star Game ${gameScore}. The MVP trophy goes to ${mvp.playerName} (${mvp.statLine}) — a dominant performance.`,
            `It's ${confWon} over ${confWon === 'East' ? 'West' : 'East'}, ${gameScore}. ${mvp.playerName} steals the show with ${mvp.statLine} to claim MVP.`,
          ] : [];

          const contestHighlights: string[] = [];
          if (dunkWinner)    contestHighlights.push(`${dunkWinner} wins the Dunk Contest`);
          if (threePtWinner) contestHighlights.push(`${threePtWinner} takes home the 3-Point Crown`);
          if (skillsWinner)  contestHighlights.push(`${skillsWinner} wins the Skills Challenge`);

          const revealTemplates = [
            `All-Star Weekend is in the books! East starters: ${eastStarters.join(', ')}. West starters: ${westStarters.join(', ')}.${contestHighlights.length ? ` Weekend highlights: ${contestHighlights.join('; ')}.` : ''}`,
            `The ${newState.season} All-Star Weekend wraps up! Representing the East: ${eastStarters.join(', ')}. West stars: ${westStarters.join(', ')}.${contestHighlights.length ? ` ${contestHighlights.join('. ')}.` : ''}`,
            `All-Star festivities complete for ${newState.season}. East: ${eastStarters.join(', ')} | West: ${westStarters.join(', ')}.${contestHighlights.length ? ` Contests: ${contestHighlights.join(', ')}.` : ''}`,
          ];

          const newsItems: typeof newState.newsFeed = [];

          if (mvp && mvpTemplates.length) {
            newsItems.push({
              id: `allstar-game-${newState.season}`,
              category: 'milestone' as NewsCategory,
              headline: 'ALL-STAR GAME FINAL',
              content: pickAS(mvpTemplates),
              timestamp: newState.currentDay,
              realTimestamp: Date.now(),
              isBreaking: true,
            });
          }

          if (dunkWinner) {
            newsItems.push({
              id: `allstar-dunk-${newState.season}`,
              category: 'milestone' as NewsCategory,
              headline: 'DUNK CONTEST CHAMPION',
              content: pickAS([
                `${dunkWinner} puts on a jaw-dropping show to win the Dunk Contest! The crowd goes wild.`,
                `The Dunk Contest crown belongs to ${dunkWinner}! An unforgettable performance on the big stage.`,
                `${dunkWinner} earns the title of best dunker in the league after an electrifying Dunk Contest performance.`,
              ]),
              timestamp: newState.currentDay,
              realTimestamp: Date.now(),
              isBreaking: false,
            });
          }

          if (threePtWinner) {
            newsItems.push({
              id: `allstar-3pt-${newState.season}`,
              category: 'milestone' as NewsCategory,
              headline: '3-POINT CONTEST WINNER',
              content: pickAS([
                `${threePtWinner} catches fire and wins the 3-Point Contest! A spectacular shooting display.`,
                `Hot hand alert — ${threePtWinner} takes the 3-Point Crown with an incredible performance.`,
                `${threePtWinner} proves they're the league's best shooter, winning the 3-Point Contest in style.`,
              ]),
              timestamp: newState.currentDay,
              realTimestamp: Date.now(),
              isBreaking: false,
            });
          }

          newsItems.push({
            id: `allstar-reveal-${newState.season}`,
            category: 'milestone' as NewsCategory,
            headline: 'ALL-STAR WEEKEND COMPLETE',
            content: pickAS(revealTemplates),
            timestamp: newState.currentDay,
            realTimestamp: Date.now(),
            isBreaking: false,
          });

          newState = {
            ...newState,
            newsFeed: [...newsItems, ...(newState.newsFeed || [])],
          };
        }
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
      // Check both regular and preseason schedules
      const game = league.schedule.find(g => g.id === targetGameId)
        ?? (league.preseasonSchedule ?? []).find(g => g.id === targetGameId);
      if (!game) return;
      const isPreseasonGame = !!(league.preseasonSchedule ?? []).find(g => g.id === targetGameId);
      const home = league.teams.find(t => t.id === game.homeTeamId)!;
      const away = league.teams.find(t => t.id === game.awayTeamId)!;
      const rivalry = league.rivalryHistory?.find(r => (r.team1Id === home.id && r.team2Id === away.id) || (r.team1Id === away.id && r.team2Id === home.id));
      const rivalryLevel = getRivalryLevel(rivalry);
      const result = simulateGame(home, away, league.currentDay, league.season, game.homeB2B, game.awayB2B, rivalryLevel, league.settings);
      result.id = game.id;
      if (!isPreseasonGame) {
        const recap = await generateGameRecap(result, home, away);
        result.aiRecap = recap;
      }
      let newState = isPreseasonGame
        ? await finalizePreseasonGameResult(league, game.id, result)
        : await finalizeGameResult(league, game.id, result);
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

    /** Helper: does the current day have a game for the user's team in either schedule? */
    const hasUserGameToday = (s: LeagueState) => {
      const uid = s.userTeamId;
      const preUnplayed = (s.preseasonSchedule ?? []).filter(g => !g.played);
      const usePreSched  = s.seasonPhase === 'Preseason' && preUnplayed.length > 0;
      const sched = usePreSched ? (s.preseasonSchedule ?? []) : s.schedule;
      return sched.some(g => g.day === s.currentDay && !g.played && (g.homeTeamId === uid || g.awayTeamId === uid));
    };

    /** Helper: any games remaining (preseason or regular)? */
    const hasAnyGamesLeft = (s: LeagueState) =>
      (s.preseasonSchedule ?? []).some(g => !g.played) || s.schedule.some(g => !g.played);

    if (mode === 'next') {
      let foundUserGame = false;
      while (!foundUserGame && tempState.currentDay < 500) {
        const had = hasUserGameToday(tempState);
        const step = await executeSimDay(tempState);
        tempState = step.newState;
        processResults(step.dayResults);
        if (had) foundUserGame = true;
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
      // Sim through preseason AND regular season
      while (tempState.currentDay < 500 && hasAnyGamesLeft(tempState)) {
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

      // ── End-of-season award announcement news ──────────────────────────────
      // Items are prepended so the LAST one added appears highest in the feed.
      // Order: All-Rookie → All-Defensive → DPOY → MVP (MVP ends up at the top).
      {
        const allRosterPlayers = tempState.teams.flatMap(t => t.roster);
        const pName = (id: string) => allRosterPlayers.find(p => p.id === id)?.name ?? id;
        const pickAw = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        const awDay = tempState.currentDay;

        // All-Rookie Teams
        if ((seasonAwards.allRookie?.length ?? 0) > 0) {
          const first  = seasonAwards.allRookie.map(pName).join(', ');
          const second = (seasonAwards.allRookieSecond?.length ?? 0) > 0
            ? ` Second Team: ${seasonAwards.allRookieSecond!.map(pName).join(', ')}.`
            : '';
          tempState = { ...tempState, newsFeed: [{
            id: `award-allrookie-${tempState.season}`,
            category: 'award' as NewsCategory,
            headline: `ALL-ROOKIE TEAMS — ${tempState.season}`,
            content: `${tempState.season} All-Rookie First Team: ${first}.${second} The next generation of stars has officially arrived.`,
            timestamp: awDay, realTimestamp: Date.now(), isBreaking: false,
          }, ...(tempState.newsFeed ?? [])].slice(0, 2000) };
        }

        // All-Defensive Teams
        if ((seasonAwards.allDefensive?.length ?? 0) > 0) {
          const first  = seasonAwards.allDefensive.map(pName).join(', ');
          const second = (seasonAwards.allDefensiveSecond?.length ?? 0) > 0
            ? ` Second Team: ${seasonAwards.allDefensiveSecond!.map(pName).join(', ')}.`
            : '';
          tempState = { ...tempState, newsFeed: [{
            id: `award-alldef-${tempState.season}`,
            category: 'award' as NewsCategory,
            headline: `ALL-DEFENSIVE TEAMS — ${tempState.season}`,
            content: pickAw([
              `${tempState.season} All-Defensive First Team: ${first}.${second} These players made life miserable for every opponent this season.`,
              `Announcing the ${tempState.season} All-Defensive squads. First Team: ${first}.${second} Elite defenders who changed the game on the other end.`,
            ]),
            timestamp: awDay, realTimestamp: Date.now(), isBreaking: false,
          }, ...(tempState.newsFeed ?? [])].slice(0, 2000) };
        }

        // DPOY
        tempState = { ...tempState, newsFeed: [{
          id: `award-dpoy-${tempState.season}`,
          category: 'award' as NewsCategory,
          headline: `DEFENSIVE PLAYER OF THE YEAR — ${tempState.season}`,
          content: pickAw([
            `${seasonAwards.dpoy.name} (${seasonAwards.dpoy.teamName}) wins the ${tempState.season} Defensive Player of the Year! A season of elite lock-down play — ${seasonAwards.dpoy.statsLabel} — earns the highest defensive honour.`,
            `It's official: ${seasonAwards.dpoy.name} is your ${tempState.season} DPOY. The ${seasonAwards.dpoy.teamName} anchor was a nightmare for opponents all year — ${seasonAwards.dpoy.statsLabel}.`,
            `${seasonAwards.dpoy.name} takes home the ${tempState.season} Defensive Player of the Year award. ${seasonAwards.dpoy.statsLabel} — opponents feared every possession against this player.`,
          ]),
          teamId: seasonAwards.dpoy.teamId,
          timestamp: awDay, realTimestamp: Date.now(), isBreaking: false,
        }, ...(tempState.newsFeed ?? [])].slice(0, 2000) };

        // MVP — added last so it appears at the very top of the feed
        tempState = { ...tempState, newsFeed: [{
          id: `award-mvp-${tempState.season}`,
          category: 'award' as NewsCategory,
          headline: `MVP — ${tempState.season} SEASON`,
          content: pickAw([
            `${seasonAwards.mvp.name} is named the ${tempState.season} Most Valuable Player! The ${seasonAwards.mvp.teamName} superstar put together an unforgettable season: ${seasonAwards.mvp.statsLabel}. The league's highest honour — well deserved.`,
            `OFFICIAL: ${seasonAwards.mvp.name} wins the ${tempState.season} MVP award. ${seasonAwards.mvp.statsLabel} — one of the most dominant individual campaigns in recent memory for the ${seasonAwards.mvp.teamName}.`,
            `The ${tempState.season} MVP is ${seasonAwards.mvp.name}. Night after night the ${seasonAwards.mvp.teamName} star delivered — ${seasonAwards.mvp.statsLabel} — making this the clear and unanimous choice for the league's most prestigious individual award.`,
          ]),
          teamId: seasonAwards.mvp.teamId,
          timestamp: awDay, realTimestamp: Date.now(), isBreaking: true,
        }, ...(tempState.newsFeed ?? [])].slice(0, 2000) };
      }

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

      // ── Playoff seeding & first-round matchup news ─────────────────────────
      {
        const pickN = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        const getTeam = (id: string) => tempState.teams.find(t => t.id === id)!;
        const bracket = tempState.playoffBracket!;
        const nowDay = tempState.currentDay;

        // 1. Season-end headline
        tempState = {
          ...tempState,
          newsFeed: [{
            id: `season-end-${tempState.season}`,
            category: 'playoffs' as NewsCategory,
            headline: 'REGULAR SEASON FINAL',
            content: pickN([
              `The Regular Season has concluded. Playoff seeds are locked! The postseason begins now — who wants it most?`,
              `82 games. Countless battles. The Regular Season is over, and 16 teams punch their tickets to the playoffs. Let the madness begin.`,
              `It's officially playoff time. The regular season books are closed — seeds are set and first-round matchups are locked in.`,
            ]),
            timestamp: nowDay,
            realTimestamp: Date.now(),
            isBreaking: true,
          }, ...(tempState.newsFeed ?? [])].slice(0, 2000),
        };

        // 2a. Division winner announcements (one news item per division)
        {
          const divMap = new Map<string, Team[]>();
          for (const t of tempState.teams) {
            if (!t.division) continue;
            if (!divMap.has(t.division)) divMap.set(t.division, []);
            divMap.get(t.division)!.push(t);
          }
          const divEntries = [...divMap.entries()].sort(([a], [b]) => a.localeCompare(b));
          for (const [division, divTeams] of divEntries) {
            const winner = [...divTeams].sort((a, b) =>
              (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses)) ||
              b.wins - a.wins
            )[0];
            if (!winner) continue;
            const wl = `${winner.wins}-${winner.losses}`;
            tempState = {
              ...tempState,
              newsFeed: [{
                id: `div-winner-${tempState.season}-${division}`,
                category: 'milestone' as NewsCategory,
                headline: `${division.toUpperCase()} DIVISION CHAMPIONS`,
                content: pickN([
                  `The ${winner.city} ${winner.name} clinch the ${division} Division title with a ${wl} record! The city is celebrating tonight — what a season.`,
                  `${winner.city} ${winner.name} are your ${division} Division Champions! A dominant ${wl} finish puts them atop the division — respect.`,
                  `${winner.name} clinch the ${division} Division! A ${wl} regular season earns them the banner — ${winner.city} has something to cheer about.`,
                  `OFFICIAL: The ${winner.city} ${winner.name} (${wl}) win the ${division} Division championship. Home-court secured and bragging rights earned.`,
                ]),
                timestamp: nowDay,
                realTimestamp: Date.now(),
                teamId: winner.id,
                isBreaking: true,
              }, ...(tempState.newsFeed ?? [])].slice(0, 2000),
            };
          }
        }

        // 2b. #1 seed announcements (East + West)
        for (const conf of ['Eastern', 'Western'] as const) {
          const top = bracket.series.find(s => s.conference === conf && s.team1Seed === 1);
          if (!top) continue;
          const t = getTeam(top.team1Id);
          const confLabel = conf === 'Eastern' ? 'East' : 'West';
          tempState = {
            ...tempState,
            newsFeed: [{
              id: `seed1-${tempState.season}-${conf}`,
              category: 'playoffs' as NewsCategory,
              headline: `#1 SEED — ${confLabel.toUpperCase()}`,
              content: pickN([
                `${t.city} ${t.name} clinch the #1 seed in the ${conf} Conference! A dominant ${t.wins}-${t.losses} regular season earns them home-court advantage throughout the playoffs.`,
                `The ${t.name} are the top dogs in the ${confLabel}. ${t.city} finishes ${t.wins}-${t.losses} and will enjoy home-court in every round.`,
                `${t.city} owns the ${confLabel}. The ${t.name} lock up the #1 seed with a ${t.wins}-win regular season — a statement of dominance.`,
              ]),
              timestamp: nowDay,
              realTimestamp: Date.now(),
              teamId: t.id,
              isBreaking: true,
            }, ...(tempState.newsFeed ?? [])].slice(0, 2000),
          };
        }

        // 3. First-round matchup announcements (all 8 series, newest first so East shows below West)
        const orderedSeries = [...bracket.series].sort((a, b) => {
          const confOrder = a.conference === 'Western' ? 0 : 1;
          const confOrderB = b.conference === 'Western' ? 0 : 1;
          return confOrder - confOrderB || a.team1Seed - b.team1Seed;
        });
        for (const series of orderedSeries) {
          const t1 = getTeam(series.team1Id);
          const t2 = getTeam(series.team2Id);
          const confLabel = series.conference === 'Eastern' ? 'East' : 'West';
          const newsId = `matchup-${tempState.season}-${series.conference}-${series.team1Seed}v${series.team2Seed}`;
          tempState = {
            ...tempState,
            newsFeed: [{
              id: newsId,
              category: 'playoffs' as NewsCategory,
              headline: `FIRST ROUND — ${confLabel.toUpperCase()}`,
              content: pickN([
                `#${series.team1Seed} ${t1.city} ${t1.name} (${t1.wins}-${t1.losses}) will face off against #${series.team2Seed} ${t2.city} ${t2.name} (${t2.wins}-${t2.losses}) in the first round.`,
                `Bracket set: #${series.team1Seed} ${t1.name} vs. #${series.team2Seed} ${t2.name} in the ${series.conference} Conference first round. Who advances?`,
                `First-round ${confLabel} matchup — ${t1.city} ${t1.name} (#${series.team1Seed}, ${t1.wins}W) will matchup against ${t2.city} ${t2.name} (#${series.team2Seed}, ${t2.wins}W).`,
              ]),
              timestamp: nowDay,
              realTimestamp: Date.now(),
              teamId: t1.id,
              isBreaking: false,
            }, ...(tempState.newsFeed ?? [])].slice(0, 2000),
          };
        }

        // 4. Elimination announcements (bubble teams that just missed, up to 3 per conf)
        const allPlayoffIds = new Set(bracket.series.flatMap(s => [s.team1Id, s.team2Id]));
        for (const conf of ['Eastern', 'Western'] as const) {
          const confLabel = conf === 'Eastern' ? 'East' : 'West';
          const eliminated = tempState.teams
            .filter(t => t.conference === conf && !allPlayoffIds.has(t.id))
            .sort((a, b) => b.wins - a.wins)
            .slice(0, 3);
          for (const t of eliminated) {
            tempState = {
              ...tempState,
              newsFeed: [{
                id: `elim-${tempState.season}-${t.id}`,
                category: 'playoffs' as NewsCategory,
                headline: 'ELIMINATED',
                content: pickN([
                  `${t.city} ${t.name} have been eliminated from playoff contention, finishing the regular season ${t.wins}-${t.losses}. A tough offseason looms.`,
                  `The ${t.name}'s season is over — ${t.wins}-${t.losses} wasn't enough to crack the ${confLabel} playoff picture. Time to retool.`,
                  `${t.city} misses the postseason at ${t.wins}-${t.losses}. The front office will have questions to answer this offseason.`,
                ]),
                timestamp: nowDay,
                realTimestamp: Date.now(),
                teamId: t.id,
                isBreaking: false,
              }, ...(tempState.newsFeed ?? [])].slice(0, 2000),
            };
          }
        }
      }
    }
    setLeague(tempState);
    setLoading(false);
  };

  /** Compute end-of-season grade, comments, and approval deltas from the final league state. */
  const computeOwnerReview = (state: LeagueState): Omit<OwnerReviewData, 'ownerApprovalBefore' | 'ownerApprovalAfter' | 'fanApprovalBefore' | 'fanApprovalAfter'> => {
    const userTeam = state.teams.find(t => t.id === state.userTeamId)!;
    const wins = userTeam.wins;
    const losses = userTeam.losses;
    const winPct = wins / Math.max(1, wins + losses);

    // Standout / weak players
    const sorted = [...userTeam.roster].sort((a, b) => b.rating - a.rating);
    const starName = sorted[0]?.name ?? 'our best player';
    const bottomThree = sorted.slice(-3);
    const weakName = bottomThree[Math.floor(Math.random() * bottomThree.length)]?.name ?? '';

    // Playoff depth
    const bracket = state.playoffBracket;
    const champ = bracket?.championId;
    let playoffResult: OwnerReviewData['playoffResult'] = 'none';
    let madePlayoffs = false;
    if (bracket) {
      const inBracket = bracket.series.some(s => s.team1Id === state.userTeamId || s.team2Id === state.userTeamId);
      if (inBracket) {
        madePlayoffs = true;
        if (champ === state.userTeamId) {
          playoffResult = 'champion';
        } else {
          const seriesWon = bracket.series.filter(
            s => (s.team1Id === state.userTeamId && s.team1Wins === 4) ||
                 (s.team2Id === state.userTeamId && s.team2Wins === 4)
          ).length;
          playoffResult = seriesWon >= 3 ? 'finals' : seriesWon >= 2 ? 'semifinals' : 'first_round';
        }
      }
    }

    // Cap health
    const cap = state.settings.salaryCap || 140_000_000;
    const luxLine = state.settings.luxuryTaxLine || 170_000_000;
    const payroll = userTeam.roster.reduce((s, p) => s + (p.salary || 0), 0);
    const isOverLux = payroll > luxLine;
    const isOverFirstApron = payroll > cap + 56_000_000;

    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    let ownerChange = 0;
    let fanChange = 0;
    const comments: string[] = [];

    // ── Record ──────────────────────────────────────────────────────────────
    if (wins >= 60) {
      ownerChange += 12; fanChange += 10;
      comments.push(pick([
        `An elite ${wins}–${losses} season — ${starName} was unstoppable and the whole roster delivered.`,
        `${wins} wins is a historic pace for this franchise. ${starName} was the engine all year long.`,
        `Dominant ${wins}–${losses} record — we were a problem for every team we faced this season.`,
      ]));
    } else if (wins >= 50) {
      ownerChange += 6; fanChange += 5;
      comments.push(pick([
        `Solid ${wins}–${losses} campaign. ${starName} was a standout and the supporting cast held their own.`,
        `Above .600 at ${wins}–${losses}. ${starName} gave us everything we asked for this season.`,
        `A competitive ${wins}–${losses} finish. The team showed real character and depth throughout the year.`,
      ]));
    } else if (wins >= 41) {
      ownerChange += 2; fanChange += 2;
      comments.push(pick([
        `A .500-plus finish at ${wins}–${losses}. ${starName} kept us competitive but we need more around him.`,
        `Respectable ${wins}–${losses} record, though we left wins on the table. The roster needs more depth.`,
        `${wins}–${losses} is a stepping stone, not a destination. ${starName} was strong, but the supporting cast needs upgrading.`,
      ]));
    } else if (wins >= 35) {
      ownerChange -= 5; fanChange -= 5;
      comments.push(pick([
        `Disappointing ${wins}–${losses} finish. ${starName} tried to carry us, but the supporting cast wasn't enough.`,
        `${wins}–${losses} is not the standard I set for this team. We need to surround ${starName} with better talent.`,
        `We fell short at ${wins}–${losses}.${weakName ? ` ${weakName} in particular was a liability this year.` : ' The depth chart was our biggest problem.'}`,
      ]));
    } else if (wins >= 25) {
      ownerChange -= 12; fanChange -= 10;
      comments.push(pick([
        `Poor ${wins}–${losses} record — this roster is not good enough. Major changes are needed this offseason.`,
        `${wins} wins isn't cutting it.${weakName ? ` Players like ${weakName} aren't the answer at this level.` : ' We need significant personnel upgrades across the board.'}`,
        `A difficult ${wins}–${losses} season. The front office has to be more aggressive in rebuilding around ${starName}.`,
      ]));
    } else {
      ownerChange -= 18; fanChange -= 15;
      comments.push(pick([
        `Unacceptable ${wins}–${losses} season. This franchise is in crisis and I expect major changes before next year.`,
        `${wins} wins is an embarrassment. Even ${starName} couldn't mask how bad this team was. Full reset required.`,
        `${wins}–${losses} is the worst we've looked in years. The coaching staff and roster both need serious evaluation.`,
      ]));
    }

    // ── Playoffs ─────────────────────────────────────────────────────────────
    if (playoffResult === 'champion') {
      ownerChange += 22; fanChange += 25;
      comments.push(pick([
        `Champions. ${starName} was magnificent when it mattered most — this is exactly what we built for.`,
        `We did it. ${starName} and this team proved they belong at the top of the league. Unforgettable postseason run.`,
        `A championship is the ultimate goal and we achieved it. ${starName} was the difference-maker throughout the playoffs.`,
      ]));
    } else if (playoffResult === 'finals') {
      ownerChange += 14; fanChange += 16;
      comments.push(pick([
        `Finals appearance is a tremendous achievement — but ${starName} and this group can finish the job next year.`,
        `We got to the Finals and that's something to build on. Next year, we close it out.`,
        `A great run to the Finals. ${starName} was brilliant — we just ran into a buzzsaw at the end.`,
      ]));
    } else if (playoffResult === 'semifinals') {
      ownerChange += 8; fanChange += 10;
      comments.push(pick([
        `Conference Finals exit is solid progress. ${starName} showed up, but we need one more piece to go all the way.`,
        `Getting to the semis was encouraging. ${starName} was excellent — we need better depth to make the next step.`,
        `Postseason exit in the Conference Finals. Good effort from ${starName} and company, but the ceiling has to be higher.`,
      ]));
    } else if (playoffResult === 'first_round') {
      ownerChange += 3; fanChange += 4;
      comments.push(pick([
        `We made the playoffs but a first-round exit isn't the standard I set for this team. ${starName} deserves better.`,
        `First-round out — ${starName} carried us to the postseason, but we weren't built to go deep. That changes this offseason.`,
        `Playoff appearance is the bare minimum. Getting bounced in round one is not acceptable progress for this franchise.`,
      ]));
    } else {
      ownerChange -= 12; fanChange -= 10;
      comments.push(pick([
        `Missing the playoffs is not acceptable. ${starName} is too good to be sitting at home in April. We failed him.`,
        `No postseason. This market demands playoff basketball and we didn't deliver. Significant changes are coming.`,
        `Failing to qualify for the playoffs reflects poor execution across the board. ${starName} is wasted without a better cast.`,
      ]));
    }

    // ── Cap management ───────────────────────────────────────────────────────
    if (isOverFirstApron) {
      ownerChange -= 6;
      comments.push(pick([
        'Payroll above the first apron — the luxury tax penalties are unsustainable. We need smarter cap management.',
        'We\'re spending recklessly above the apron. Unless we\'re winning championships, this isn\'t a sustainable model.',
      ]));
    } else if (isOverLux) {
      ownerChange -= 3;
      comments.push('Over the luxury tax line — manageable for now, but the spending has to be more strategic going forward.');
    } else if (winPct >= 0.5) {
      ownerChange += 3;
      comments.push(pick([
        'Good cap discipline this year — competitive roster without breaking the bank. That\'s how you build long-term.',
        'We stayed fiscally responsible while remaining competitive. That\'s the right approach for sustained success.',
      ]));
    }

    // ── Grade ────────────────────────────────────────────────────────────────
    const composite =
      (playoffResult === 'champion' ? 100 : playoffResult === 'finals' ? 82 : playoffResult === 'semifinals' ? 68 :
       playoffResult === 'first_round' ? 55 : 25) + winPct * 40;
    const grade: OwnerReviewData['grade'] =
      composite >= 128 ? 'A+' : composite >= 110 ? 'A' : composite >= 96 ? 'B+' : composite >= 82 ? 'B' :
      composite >= 68  ? 'C+' : composite >= 52  ? 'C' : composite >= 38 ? 'D'  : 'F';

    // ── Expectation ──────────────────────────────────────────────────────────
    const expectation =
      playoffResult === 'champion'    ? pick([`Defend this title. I expect us back in the Finals — anything less is a step backward.`, `Championship or bust next year. ${starName} is in his prime — let's make the most of it.`]) :
      playoffResult === 'finals'      ? pick([`I expect us to finish the job next year. We have the talent — we need the execution.`, `Back to the Finals and this time, we win it. That's the expectation going into next season.`]) :
      playoffResult === 'semifinals'  ? pick([`Semis is nice, but I expect a Finals run next season. Get ${starName} the pieces he needs.`, `${starName} is good enough to take us all the way. Use this offseason to build the right roster around him.`]) :
      playoffResult === 'first_round' ? pick([`Deeper playoff run required next year — first-round exits are not the standard here.`, `I want to see us competing deep into May next season. Make the right moves this offseason.`]) :
      wins >= 35                      ? pick([`Make the playoffs next year — that's the bare minimum expectation for this franchise.`, `Get ${starName} into the postseason. That's priority number one this offseason.`]) :
      wins >= 25                      ? pick([`We need a full rebuild — be smart with the cap and draft wisely. No panic moves.`, `The priority is rebuilding intelligently. Young talent and cap flexibility come first.`]) :
                                        pick([`Complete roster overhaul. I want a new identity for this team by opening night.`, `Major changes are coming. This franchise needs a reset from top to bottom — and fast.`]);

    return {
      season: state.season,
      wins, losses, madePlayoffs, playoffResult, grade, comments, expectation,
      ownerApprovalChange: Math.round(ownerChange),
      fanApprovalChange: Math.round(fanChange),
    };
  };

  /** Compute approval delta from a user trade and clamp to 0-100. */
  const tradeApprovalDelta = (
    userOutRatings: number[], userInRatings: number[], current: { owner: number; fan: number }
  ): { owner: number; fan: number; ownerDelta: number; fanDelta: number } => {
    const outAvg = userOutRatings.length ? userOutRatings.reduce((s, r) => s + r, 0) / userOutRatings.length : 75;
    const inAvg  = userInRatings.length  ? userInRatings.reduce((s, r) => s + r, 0)  / userInRatings.length  : 75;
    const diff   = inAvg - outAvg;
    const ownerDelta = diff > 10 ? 12 : diff > 5 ? 8 : diff > 1 ? 4 : diff > -2 ? 0 : diff > -6 ? -5 : diff > -10 ? -9 : -13;
    const fanDelta   = Math.round(ownerDelta * 0.75);
    return {
      ownerDelta,
      fanDelta,
      owner: Math.max(0, Math.min(100, current.owner + ownerDelta)),
      fan:   Math.max(0, Math.min(100, current.fan   + fanDelta)),
    };
  };

  const handleStartOffseason = async () => {
    if (!league) return;

    // ── Compute owner review BEFORE any state mutations (bracket + wins still reflect the season) ──
    const reviewBase = computeOwnerReview(league);
    const ownerBefore = league.ownerApproval ?? 55;
    const fanBefore   = league.fanApproval   ?? 60;
    const ownerAfter  = Math.max(0, Math.min(100, ownerBefore + reviewBase.ownerApprovalChange));
    const fanAfter    = Math.max(0, Math.min(100, fanBefore   + reviewBase.fanApprovalChange));
    const reviewData: OwnerReviewData = {
      ...reviewBase,
      ownerApprovalBefore: ownerBefore,
      ownerApprovalAfter:  ownerAfter,
      fanApprovalBefore:   fanBefore,
      fanApprovalAfter:    fanAfter,
    };

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

    // ── Snapshot end-of-season profit for the user's team ────────────────────
    {
      const ut = tempState.teams.find(t => t.id === tempState.userTeamId);
      if (ut) {
        const _isWomens = (tempState.settings.playerGenderRatio ?? 0) === 100;
        const _payroll = ut.roster.reduce((s, p) => s + p.salary, 0);
        const _staffPayroll = (Object.values(ut.staff) as any[]).reduce((s, c) => s + (c?.salary || 0), 0);
        const _capLine = tempState.settings.salaryCap || (_isWomens ? 2_200_000 : 140_000_000);
        const _taxLine = tempState.settings.luxuryTaxLine || (_isWomens ? _capLine : 170_000_000);
        const _taxMult = tempState.settings.luxuryTaxMultiplier ?? 1.75;
        const _lux = !_isWomens && _payroll > _taxLine ? (_payroll - _taxLine) * _taxMult : 0;
        const _hype = ut.finances.fanHype;
        const _attendance = Math.round(8_000 + (_hype / 100) * 14_000);
        const _rev = 41 * _attendance * (ut.finances.ticketPrice || 85)
          + Math.round(41 * _attendance * (ut.finances.concessionPrice || 12) * 0.4)
          + 40_000_000
          + Math.round(8_000_000 + (_hype / 100) * 15_000_000);
        const _budgets = ut.finances.budgets as any ?? {};
        const _staffAnnual = STAFF_CONFIG.scouting.tiers[getStaffTierIndex(_budgets.scouting ?? 20)].annualCost
          + STAFF_CONFIG.medical.tiers[getStaffTierIndex(_budgets.health ?? 20)].annualCost
          + STAFF_CONFIG.facilities.tiers[getStaffTierIndex(_budgets.facilities ?? 20)].annualCost;
        tempState.previousSeasonProfit = _rev - _payroll - _staffPayroll - _staffAnnual - _lux - 5_000_000;
      }
    }

    tempState.playoffBracket = undefined;
    tempState.isOffseason = true;
    tempState.seasonPhase = 'Offseason' as SeasonPhase;
    tempState.tradeDeadlinePassed = false;
    tempState.devInterventionsThisSeason = 0;
    // allStarWeekend is preserved here so results remain viewable during offseason/playoffs
    // It is cleared when the new season schedule begins (handleAdvanceToRegularSeason)
    tempState.draftPhase = 'lottery';
    tempState.offseasonDay = 0;

    // Automatically unlock expansion after every Finals — default to 1 new team
    tempState.settings = { ...tempState.settings, expansionEnabled: true, expansionTeamCount: 1 };
    
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
        const extSalary = computeMensMarketSalary(p.rating, tempState.season ?? 2026);
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
          const isWomensOffseason = (tempState.settings.playerGenderRatio ?? 0) === 100;
          const desiredBase = isWomensOffseason
            ? (p.desiredContract?.salary || p.salary || 25_000)
            : computeMensMarketSalary(_r, tempState.season ?? 2026);
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

    // ── Capture final standings snapshot before resetting wins/losses ───────────
    const playoffSpotsPerConf = Math.floor((tempState.settings.playoffFormat ?? 16) / 2);
    const prevStandings: PreviousSeasonStanding[] = [];
    (['Eastern', 'Western'] as const).forEach(conf => {
      const confTeams = [...tempState.teams]
        .filter(t => t.conference === conf)
        .sort((a, b) => {
          const aPct = a.wins / Math.max(1, a.wins + a.losses);
          const bPct = b.wins / Math.max(1, b.wins + b.losses);
          if (bPct !== aPct) return bPct - aPct;
          if (b.wins !== a.wins) return b.wins - a.wins;
          return a.losses - b.losses;
        });
      confTeams.forEach((t, idx) => {
        prevStandings.push({
          teamId: t.id,
          teamName: t.name,
          teamCity: t.city,
          teamAbbr: t.abbreviation,
          conference: conf,
          wins: t.wins,
          losses: t.losses,
          confRank: idx + 1,
          madePlayoffs: idx < playoffSpotsPerConf,
        });
      });
    });
    tempState.previousSeasonStandings = prevStandings;
    tempState.previousSeasonYear = tempState.season;

    // Snapshot pre-progression ratings for dev report (user team only)
    const preProgSnapshot = new Map<string, { ovr: number; pot: number; hadFocus: boolean }>();
    const userTeamPre = tempState.teams.find(t => t.id === tempState.userTeamId);
    if (userTeamPre) {
      userTeamPre.roster.forEach(p => {
        preProgSnapshot.set(p.id, {
          ovr: p.rating,
          pot: p.potential,
          hadFocus: !!(p.trainingFocus && p.trainingFocus.seasonSet === tempState.season),
        });
      });
    }

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
      const FOCUS_ATTR_MAP: Record<TrainingFocusArea, (keyof Player['attributes'])[]> = {
        'Shooting / 3PT':          ['shooting3pt', 'shooting', 'shootingMid', 'freeThrow'],
        'Playmaking / Passing':    ['passing', 'ballHandling', 'offensiveIQ'],
        'Defense / Rebounding':    ['perimeterDef', 'interiorDef', 'defReb', 'steals', 'blocks', 'defensiveIQ'],
        'Post Scoring / Interior': ['postScoring', 'strength', 'interiorDef', 'offReb'],
        'Athleticism / Dunking':   ['athleticism', 'dunks', 'jumping', 'speed'],
        'Finishing / Layups':      ['layups', 'athleticism', 'speed'],
        'Free Throws':             ['freeThrow'],
        'Mental / Leadership':     ['offensiveIQ', 'defensiveIQ', 'stamina'],
      };
      const rosterWithProg = t.roster.map(p => {
        let growth = 0;
        if (p.age < 25) {
          growth = Math.floor(Math.random() * 4 * devMultiplier * rookieMultiplier);
        } else if (p.age >= 25 && p.age <= 29) {
          // Prime age: small chance of +1 gain, otherwise stable
          if (Math.random() < 0.35 * devMultiplier) growth = 1;
        } else if (p.age >= 30 && p.age <= 33) {
          // Early decline: mild chance of -1 or -2
          if (Math.random() < 0.40 * vetRate) growth = -(1 + (p.age >= 32 && Math.random() < 0.4 ? 1 : 0));
        } else if (p.age > 33) {
          growth = -Math.floor(1 + Math.random() * Math.min(5, (p.age - 33)) * vetRate);
        }

        // Potential progression: peaks grow, veterans fade
        let potDelta = 0;
        if (p.age < 23) potDelta = Math.floor(Math.random() * 3 * devMultiplier);          // 0-2 pot gain
        else if (p.age < 26) potDelta = Math.random() < 0.4 * devMultiplier ? 1 : 0;       // small gain
        else if (p.age >= 31) potDelta = Math.random() < 0.5 * vetRate ? -1 : 0;            // small decline
        else if (p.age >= 34) potDelta = -Math.floor(Math.random() < 0.6 * vetRate ? 1 + Math.random() : 0);

        const newAttrs = { ...p.attributes } as any;

        // Apply training focus bonus (set this season, active or just expired)
        const focus = p.trainingFocus;
        const isUserPlayer = t.id === tempState.userTeamId;
        if (isUserPlayer && focus && focus.seasonSet === tempState.season) {
          const responseMult = focus.playerResponse === 'enthusiastic' ? 1.40
            : focus.playerResponse === 'receptive' ? 1.00 : 0.45;
          const focusBonus = Math.max(1, Math.round(2 * devMultiplier * responseMult));
          const focusKeys = focus.areas.flatMap(a => FOCUS_ATTR_MAP[a]);
          const uniqueFocusKeys = [...new Set(focusKeys)];
          const pickedFocus = [...uniqueFocusKeys].sort(() => 0.5 - Math.random()).slice(0, 2);
          pickedFocus.forEach(k => {
            newAttrs[k] = Math.min(99, Math.max(0, (newAttrs[k] ?? 50) + focusBonus));
          });
        }

        const hasFocus = isUserPlayer && focus && focus.seasonSet === tempState.season;
        if (growth === 0 && potDelta === 0 && !hasFocus) {
          return enforcePositionalBounds({ ...p, trainingFocus: undefined });
        }
        if (growth !== 0) {
          const devKeys = POS_DEV_KEYS[p.position] ?? POS_DEV_KEYS['SF'];
          const focusKeys = hasFocus ? focus!.areas.flatMap(a => FOCUS_ATTR_MAP[a]) : [];
          const combined = [...new Set([...focusKeys, ...devKeys])];
          const picked = combined.sort(() => 0.5 - Math.random()).slice(0, 2);
          picked.forEach(k => {
            newAttrs[k] = Math.min(99, Math.max(0, (newAttrs[k] ?? 50) + growth));
          });
        }
        const newPot = potDelta !== 0
          ? Math.min(99, Math.max(p.rating, p.potential + potDelta))
          : p.potential;
        return enforcePositionalBounds({ ...p, attributes: newAttrs as Player['attributes'], potential: newPot, trainingFocus: undefined });
      });
      // Remove expired contracts from roster (they become free agents)
      const retained = rosterWithProg.filter(p => p.contractYears > 1);

      // Compute end-of-season franchise valuation before resetting wins/losses
      const champCount = (tempState.championshipHistory ?? []).filter(c => c.championId === t.id).length;
      const prevMadePlayoffs = (prevStandings ?? []).find(s => s.teamId === t.id)?.madePlayoffs ?? false;
      const { value: newValuation, breakdown: newBreakdown } = calcFranchiseValuation(t, {
        isWNBA: (tempState.settings.playerGenderRatio ?? 0) === 100,
        champCount,
        prevMadePlayoffs,
        seasonLength: tempState.settings.seasonLength ?? 82,
      });

      return { ...t, roster: retained.map(p => ({ ...p, contractYears: p.contractYears - 1 })), prevSeasonWins: t.wins, prevSeasonLosses: t.losses, wins: 0, losses: 0, vsAbove500W: 0, vsAbove500L: 0, lastTen: [], prevSeasonValuation: t.valuation, valuation: newValuation, valuationBreakdown: newBreakdown };
    });

    // Build dev report for user team from pre/post snapshot
    if (preProgSnapshot.size > 0) {
      const userTeamPost = tempState.teams.find(t => t.id === tempState.userTeamId);
      const devChanges: PlayerDevChange[] = [];
      userTeamPost?.roster.forEach(p => {
        const pre = preProgSnapshot.get(p.id);
        if (!pre) return;
        const ovrDelta = p.rating - pre.ovr;
        const potDelta = p.potential - pre.pot;
        if (ovrDelta !== 0 || potDelta !== 0) {
          devChanges.push({ playerId: p.id, name: p.name, position: p.position, age: p.age, ovrBefore: pre.ovr, ovrAfter: p.rating, potBefore: pre.pot, potAfter: p.potential, hadFocus: pre.hadFocus });
        }
      });
      // Sort: biggest gains first, then biggest declines
      devChanges.sort((a, b) => (b.ovrAfter - b.ovrBefore) - (a.ovrAfter - a.ovrBefore));
      tempState.devReport = devChanges;
    }

    // Merge generated FA pool + expired-contract players (deduplicated by id)
    const generatedFAs = generateFreeAgentPool(70, tempState.season, tempState.settings.playerGenderRatio);
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
        tempState.newsFeed = [...preResult.newsItems, ...(tempState.newsFeed || [])].slice(0, 2000);
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

    tempState.newsFeed.unshift({
      id: `expansion-approved-${Date.now()}`,
      category: 'expansion',
      headline: 'EXPANSION APPROVED',
      content: 'League Expansion Approved — One new franchise will join next season!',
      timestamp: tempState.currentDay,
      realTimestamp: Date.now() + 1,
      isBreaking: true,
      seasonYear: tempState.season,
    });

    // ── Attach owner review data (shown as overlay on the draft page) ──
    tempState.ownerApproval    = ownerAfter;
    tempState.fanApproval      = fanAfter;
    tempState.showOwnerReview  = true;
    tempState.ownerReviewData  = reviewData;

    setLeague(tempState);
    setActiveTab('expansion');
    } catch (err) {
      console.error('handleStartOffseason error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdvanceToRegularSeason = async () => {
    if (!league) return;

    // ── Offseason grade gate: show grade modal before leaving the offseason ─
    if (league.isOffseason && offseasonGradeShownForSeason.current !== league.season) {
      offseasonGradeShownForSeason.current = league.season;
      const grade = computeOffseasonGrade(league);
      const before = league.ownerApproval ?? 55;
      const after = Math.max(0, Math.min(100, before + grade.ownerApprovalChange));
      setLeague(prev => prev ? { ...prev, ownerApproval: after } : null);
      setOffseasonGradeData(grade);
      return; // Resume when user clicks "Begin Preseason" in the modal
    }

    // ── Dev report gate: show development report after offseason grade ──────
    if (league.isOffseason && devReportShownForSeason.current !== league.season
        && league.devReport && league.devReport.length > 0) {
      devReportShownForSeason.current = league.season;
      setShowDevReport(true);
      return; // Resume when user dismisses the modal
    }

    // ── Case 1: Skip preseason → simulate ALL remaining preseason games ─────
    // Results are preserved in preseasonSchedule/preseasonHistory so the
    // Schedule tab shows full scores after the skip completes.
    if (league.seasonPhase === 'Preseason' && !league.isOffseason) {
      setLoading(true);
      try {
        let state = { ...league };
        const unplayed = (state.preseasonSchedule ?? [])
          .filter(g => !g.played)
          .sort((a, b) => a.day - b.day);

        for (const game of unplayed) {
          const home = state.teams.find(t => t.id === game.homeTeamId);
          const away = state.teams.find(t => t.id === game.awayTeamId);
          if (!home || !away) continue;
          const rivalry = state.rivalryHistory?.find(r =>
            (r.team1Id === home.id && r.team2Id === away.id) ||
            (r.team1Id === away.id && r.team2Id === home.id)
          );
          const rivalryLevel = getRivalryLevel(rivalry);
          state = { ...state, currentDay: game.day };
          const result = simulateGame(
            home, away, game.day, state.season,
            (game as any).homeB2B ?? false, (game as any).awayB2B ?? false,
            rivalryLevel, state.settings,
          );
          result.id = game.id;
          state = await finalizePreseasonGameResult(state, game.id, result);
        }

        // Apply the same roster cuts that happen when preseason finishes naturally
        const SKIP_MAX_ROSTER = state.settings.maxRosterSize ?? 15;
        const skipCuts: typeof state.freeAgents = [];
        const teamsAfterCut = state.teams.map(t => {
          if (t.id === state.userTeamId) return t;
          if (t.roster.length <= SKIP_MAX_ROSTER) return t;
          const sorted = [...t.roster].sort((a, b) => b.rating - a.rating);
          const isWomensSkip = (state.settings.playerGenderRatio ?? 0) === 100;
          skipCuts.push(...sorted.slice(SKIP_MAX_ROSTER).map(p => ({
            ...p, isFreeAgent: true, inSeasonFA: true, contractYears: 0,
            desiredContract: {
              years: p.rating >= 70 ? 2 : 1,
              salary: isWomensSkip ? (p.desiredContract?.salary || p.salary || 25_000) : computeMensMarketSalary(p.rating, state.season ?? 2026),
            },
          })));
          return { ...t, roster: sorted.slice(0, SKIP_MAX_ROSTER) };
        });
        const existingFAIds = new Set(state.freeAgents.map(p => p.id));
        const totalGames = (state.preseasonSchedule ?? []).length;

        state = {
          ...state,
          teams: teamsAfterCut,
          freeAgents: [...state.freeAgents, ...skipCuts.filter(p => !existingFAIds.has(p.id))],
          currentDay: 1,
          seasonPhase: 'Regular Season' as SeasonPhase,
          newsFeed: [{
            id: `preseason-complete-skip-${state.season}`,
            category: 'milestone' as const,
            headline: 'PRESEASON COMPLETE — REGULAR SEASON BEGINS',
            content: `All ${totalGames} preseason games have been simulated — check the Schedule tab for full results. AI teams have been cut to 14-man rosters. The regular season tips off now!`,
            timestamp: 1,
            realTimestamp: Date.now(),
            isBreaking: true,
          }, ...state.newsFeed].slice(0, 2000),
        };
        setLeague(state);
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Case 2: After offseason (or first season init) → enter Preseason ─
    // Show loading overlay immediately, then defer expensive schedule generation
    // to the next animation frame so React paints the overlay before JS blocks.
    setIsSeasonTransitioning(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    const snap = leagueRef.current!; // always current after async yield
    const numPreseasonGames = snap.settings.preseasonGames ?? 6;
    const freshPreseasonSchedule = generatePreseasonSchedule(snap.teams, numPreseasonGames);
    const needsFreshSchedule = snap.isOffseason || snap.schedule.every(g => g.played);
    const newSchedule = needsFreshSchedule
      ? generateSeasonSchedule(snap.teams, snap.settings.seasonLength, snap.settings.divisionGames, snap.settings.conferenceGames)
      : snap.schedule;
    setLeague(prev => {
      if (!prev) return null;
      const nextSeason = prev.season;
      const futureWindow = prev.settings.tradableDraftPickSeasons ?? 4;
      const teamsWithPicks = prev.teams.map(t => {
        const activePicks = t.picks.filter(p => p.year !== undefined && p.year >= nextSeason);
        const existingPickYears = new Set(activePicks.map(p => p.year));
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
        return { ...t, picks: [...activePicks, ...newPicks] };
      });

      // Convert undrafted prospects from the completed draft into free agents
      let trainingCampFAs = [...prev.freeAgents];
      if (prev.draftPhase === 'completed') {
        const draftedIds = new Set(teamsWithPicks.flatMap(t => t.roster.map(p => p.id)));
        const existingFAIds = new Set(trainingCampFAs.map(p => p.id));
        const isWomensLeagueRookie = (prev.settings.playerGenderRatio ?? 0) === 100;
        const undraftedRookies = (prev.prospects ?? [])
          .filter(p => !draftedIds.has(p.id) && !existingFAIds.has(p.id))
          .map(p => {
            const rookieSal = isWomensLeagueRookie ? 600_000 : computeMensMarketSalary(p.rating, prev.season ?? 2026);
            return {
            ...p,
            isFreeAgent: true,
            inSeasonFA: false,
            salary: rookieSal,
            contractYears: 1,
            status: 'Active' as const,
            morale: 70,
            stats: {
              points: 0, rebounds: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0,
              gamesPlayed: 0, gamesStarted: 0, minutes: 0, fgm: 0, fga: 0,
              threepm: 0, threepa: 0, ftm: 0, fta: 0, tov: 0, pf: 0,
              techs: 0, flagrants: 0, ejections: 0, plusMinus: 0,
            },
            desiredContract: { salary: rookieSal, years: 1 },
          } as Player;
          });
        trainingCampFAs = [...trainingCampFAs, ...undraftedRookies];
      }

      return {
        ...prev,
        teams: teamsWithPicks,
        freeAgents: trainingCampFAs,
        schedule: newSchedule,
        preseasonSchedule: freshPreseasonSchedule,
        preseasonHistory: [],
        preseasonRecord: { wins: 0, losses: 0 },
        currentDay: 1,
        isOffseason: false,
        seasonPhase: 'Preseason' as SeasonPhase,
        tradeDeadlinePassed: false,
        allStarWeekend: undefined,
        devReport: undefined,
      };
    });
    // Navigate to schedule so the user lands on preseason content (not free agency)
    setActiveTab('schedule');
    // Hold overlay briefly so IndexedDB auto-save can start before UI unlocks
    await new Promise<void>(resolve => setTimeout(resolve, 150));
    setIsSeasonTransitioning(false);
  };

  const handleScoutPlayer = async (player: Player | Prospect) => { setLoading(true); const report = await generateScoutingReport(player); setScoutingReport({ playerId: player.id, report }); setLoading(false); };
  const handleScoutCoach = async (coach: Coach) => { setSelectedCoach(coach); };
  const handleGenerateCoachIntelligence = async (coach: Coach) => { setLoading(true); const report = await generateCoachScoutingReport(coach); setCoachScoutingReport({ coachId: coach.id, report }); setLoading(false); };
  
  const handleUpdateTeamRoster = (teamId: string, updatedRoster: Player[]) => { 
    if (!league) return; 
    setLeague({ ...league, teams: league.teams.map(t => t.id === teamId ? { ...t, roster: updatedRoster } : t) }); 
  };
  
  const FOCUS_ATTRS: Record<TrainingFocusArea, (keyof Player['attributes'])[]> = {
    'Shooting / 3PT':          ['shooting3pt', 'shooting', 'shootingMid', 'freeThrow'],
    'Playmaking / Passing':    ['passing', 'ballHandling', 'offensiveIQ'],
    'Defense / Rebounding':    ['perimeterDef', 'interiorDef', 'defReb', 'steals', 'blocks', 'defensiveIQ'],
    'Post Scoring / Interior': ['postScoring', 'strength', 'interiorDef', 'offReb'],
    'Athleticism / Dunking':   ['athleticism', 'dunks', 'jumping', 'speed'],
    'Finishing / Layups':      ['layups', 'athleticism', 'speed'],
    'Free Throws':             ['freeThrow'],
    'Mental / Leadership':     ['offensiveIQ', 'defensiveIQ', 'stamina'],
  };

  const handleSetTrainingFocus = (playerId: string, areas: TrainingFocusArea[], durationDays: number) => {
    if (!league) return;
    const interventions = league.devInterventionsThisSeason ?? 0;
    if (interventions >= 4) return;
    const player = league.teams.find(t => t.id === league.userTeamId)?.roster.find(p => p.id === playerId);
    if (!player) return;

    // Determine player response from morale + personality
    const morale = player.morale ?? 75;
    const traits = player.personalityTraits ?? [];
    const isGymRat    = traits.includes('Gym Rat');
    const isWorkhorse = traits.includes('Workhorse');
    const isLazy      = traits.includes('Lazy');
    const isDiva      = traits.includes('Diva/Star');
    const isPro       = traits.includes('Professional');
    let response: 'enthusiastic' | 'receptive' | 'resistant';
    if (isGymRat || isWorkhorse || (morale >= 75 && !isLazy && !isDiva)) {
      response = 'enthusiastic';
    } else if (isLazy || isDiva || morale < 40) {
      response = 'resistant';
    } else if (isPro || morale >= 55) {
      response = 'receptive';
    } else {
      response = morale < 40 ? 'resistant' : 'receptive';
    }

    const updated: Player = {
      ...player,
      trainingFocus: { areas, seasonSet: league.season, daysRemaining: durationDays, playerResponse: response },
    };
    setLeague(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        devInterventionsThisSeason: (prev.devInterventionsThisSeason ?? 0) + 1,
        teams: prev.teams.map(t => ({
          ...t,
          roster: t.roster.map(p => p.id === playerId ? updated : p),
        })),
      };
    });
    if (selectedPlayer?.id === playerId) setSelectedPlayer(updated);
  };

  const handlePlayThroughInjury = (playerId: string) => {
    if (!league) return;
    const player = league.teams.find(t => t.id === league.userTeamId)?.roster.find(p => p.id === playerId);
    if (!player || !player.injuryDaysLeft || player.isCareerEnding) return;
    if (!canPlayThrough(player.injuryDaysLeft)) return;
    const extraPenalty = getPlayThroughOVRExtra(player.injuryDaysLeft);
    const updated: Player = {
      ...player,
      isPlayingThrough: true,
      status: player.status === 'Injured' ? 'Rotation' : player.status,
      injuryOVRPenalty: (player.injuryOVRPenalty ?? 0) + extraPenalty,
    };
    setLeague(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map(t => ({
          ...t,
          roster: t.roster.map(p => p.id === playerId ? updated : p),
        })),
      };
    });
    if (selectedPlayer?.id === playerId) setSelectedPlayer(updated);
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

  const handleExtendPlayer = (playerId: string, years: number, salary: number) => {
    if (!league) return;
    const userTeam = league.teams.find(t => t.id === league.userTeamId);
    if (!userTeam) return;
    const player = userTeam.roster.find(p => p.id === playerId);
    if (!player) return;
    const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;
    const salaryStr = isWomens
      ? `$${Math.round(salary / 1_000)}K/yr`
      : `$${(salary / 1_000_000).toFixed(1)}M/yr`;
    const updatedPlayer = { ...player, salary, contractYears: years };
    const updatedTeams = league.teams.map(t =>
      t.id === league.userTeamId
        ? { ...t, roster: t.roster.map(p => p.id === playerId ? updatedPlayer : p) }
        : t
    );
    const txns = recordTransaction(league, 'signing', [userTeam.id],
      `${userTeam.name} extended ${player.name} (${years} yr${years > 1 ? 's' : ''} / ${salaryStr}).`,
      [playerId], salary
    );
    const newsItem = {
      id: `extend-player-${Date.now()}`,
      category: 'transaction' as const,
      headline: `${player.name.split(' ').pop()?.toUpperCase()} EXTENDED`,
      content: `${userTeam.name} and ${player.name} agree to a ${years}-year extension worth ${salaryStr}. The ${player.rating} OVR ${player.position} is locked in for the foreseeable future.`,
      timestamp: league.currentDay,
      realTimestamp: Date.now(),
      teamId: userTeam.id,
      playerId,
      isBreaking: false,
    };
    setLeague({ ...league, teams: updatedTeams, transactions: txns, newsFeed: [newsItem, ...league.newsFeed].slice(0, 2000) });
    if (selectedPlayer?.id === playerId) setSelectedPlayer(updatedPlayer);
  };

  const handleExtendCoach = (coachId: string, years: number, salary: number) => {
    if (!league) return;
    const userTeam = league.teams.find(t => t.id === league.userTeamId);
    if (!userTeam) return;
    const staffEntries = Object.entries(userTeam.staff) as [string, Coach | null][];
    const [staffRole, coach] = staffEntries.find(([, c]) => c?.id === coachId) ?? [];
    if (!staffRole || !coach) return;
    const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;
    const salaryStr = isWomens
      ? `$${Math.round(salary / 1_000)}K/yr`
      : `$${(salary / 1_000_000).toFixed(1)}M/yr`;
    const updatedCoach = { ...coach, salary, contractYears: years };
    const updatedStaff = { ...userTeam.staff, [staffRole]: updatedCoach };
    const updatedTeams = league.teams.map(t =>
      t.id === league.userTeamId ? { ...t, staff: updatedStaff } : t
    );
    const txns = recordTransaction(league, 'hiring', [userTeam.id],
      `${userTeam.name} extended Head Coach ${coach.name} (${years} yr${years > 1 ? 's' : ''} / ${salaryStr}).`
    );
    const newsItem = {
      id: `extend-coach-${Date.now()}`,
      category: 'hiring' as const,
      headline: `${userTeam.abbreviation} COACH EXTENDED`,
      content: `${userTeam.name} and Head Coach ${coach.name} agree to a ${years}-year extension worth ${salaryStr}. The front office commits to long-term stability on the sideline.`,
      timestamp: league.currentDay,
      realTimestamp: Date.now(),
      teamId: userTeam.id,
      isBreaking: false,
    };
    setLeague({ ...league, teams: updatedTeams, transactions: txns, newsFeed: [newsItem, ...league.newsFeed].slice(0, 2000) });
    if (selectedCoach?.id === coachId) setSelectedCoach(updatedCoach);
  };

  const handleViewPlayer = (player: Player | Prospect) => setSelectedPlayer(player as Player);

  const handleWatchLive = (gameId: string) => {
    if (!league) return;
    const game = league.schedule.find(g => g.id === gameId)
      ?? (league.preseasonSchedule ?? []).find(g => g.id === gameId);
    if (!game) return;
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
  
  const executeRelease = (playerId: string) => {
    if (!league || !league.userTeamId) return;
    const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
    const p = userTeam.roster.find(pl => pl.id === playerId);
    const updatedRoster = userTeam.roster.filter(pl => pl.id !== playerId);
    const updatedTransactions = recordTransaction(league, 'release', [userTeam.id], `${userTeam.name} waived ${p?.name || 'player'}.`, [playerId]);
    let updatedFAs = league.freeAgents;
    let extraNews: typeof league.newsFeed = [];
    if (!league.isOffseason && p) {
      const waivedFA = {
        ...p, isFreeAgent: true, inSeasonFA: true, lastTeamId: userTeam.id,
        salary: 0, contractYears: 0,
        interestScore: Math.round(Math.min(90, Math.max(15, 40 + Math.random() * 30))),
        desiredContract: {
          years: p.rating >= 70 ? 2 : 1,
          salary: (league.settings.playerGenderRatio ?? 0) === 100
            ? (p.desiredContract?.salary || p.salary || 25_000)
            : computeMensMarketSalary(p.rating, league.season ?? 2026),
        },
      };
      updatedFAs = [waivedFA, ...league.freeAgents];
      extraNews = [{ id: `waive-${Date.now()}`, category: 'transaction' as const, headline: `${p.name} waived by ${userTeam.name}`, content: `${p.name} (${p.position}, ${p.rating} OVR) placed on waivers.`, timestamp: league.currentDay, realTimestamp: Date.now(), isBreaking: false }];
    }
    // Pending reaction already applied approval — no recalc needed here
    const pendingDelta = pendingRelease?.playerId === playerId ? pendingRelease.reaction : null;
    const newOwner = pendingDelta ? Math.max(0, Math.min(100, (league.ownerApproval ?? 55) + pendingDelta.ownerDelta)) : (league.ownerApproval ?? 55);
    const newFan   = pendingDelta ? Math.max(0, Math.min(100, (league.fanApproval   ?? 60) + pendingDelta.fanDelta))  : (league.fanApproval ?? 60);
    setLeague({ ...league, teams: league.teams.map(t => t.id === userTeam.id ? { ...t, roster: updatedRoster } : t), freeAgents: updatedFAs, transactions: updatedTransactions, newsFeed: [...extraNews, ...league.newsFeed], ownerApproval: newOwner, fanApproval: newFan });
    setPendingRelease(null);
    setSelectedPlayer(null);
  };

  const handleReleasePlayer = (playerId: string) => {
    if (!league || !league.userTeamId) return;
    const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
    const p = userTeam.roster.find(pl => pl.id === playerId);
    const isStarter = !!(userTeam.rotation && Object.values(userTeam.rotation.starters).includes(playerId));
    // Show owner modal for significant releases (OVR >= 74 or starter)
    if (p && (p.rating >= 74 || isStarter)) {
      const reaction = calcReleaseReaction(p, isStarter, league);
      setPendingRelease({ playerId, reaction });
      return;
    }
    // Low-impact releases execute immediately
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
          years: p.rating >= 70 ? 2 : 1,
          salary: (league.settings.playerGenderRatio ?? 0) === 100
            ? (p.desiredContract?.salary || p.salary || 25_000)
            : computeMensMarketSalary(p.rating, league.season ?? 2026),
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

  const handleAppealSuspension = (playerId: string) => {
    if (!league || !league.userTeamId) return;
    const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
    const p = userTeam.roster.find(pl => pl.id === playerId);
    if (!p || !p.isSuspended || !p.suspensionGames || p.suspensionGames <= 0) return;

    // Lock in one appeal, costs 3 owner patience
    const appealSucceeded = Math.random() < 0.25;
    const newGames = appealSucceeded ? Math.max(0, p.suspensionGames - 1) : p.suspensionGames;
    const stillSuspended = newGames > 0;
    const headlineResult = appealSucceeded
      ? `${p.name}'s suspension reduced to ${newGames}G after successful GM appeal`
      : `${p.name}'s ${p.suspensionGames}G suspension upheld — GM appeal denied`;
    const contentResult = appealSucceeded
      ? `The league reviewed the appeal filed by ${userTeam.name} and elected to reduce ${p.name}'s suspension by one game.`
      : `The league board reviewed and rejected ${userTeam.name}'s appeal. ${p.name} remains suspended for ${p.suspensionGames} game${p.suspensionGames !== 1 ? 's' : ''}.`;

    const newsItem = {
      id: `appeal-${Date.now()}`,
      category: 'suspension' as const,
      headline: headlineResult,
      content: contentResult,
      timestamp: league.currentDay,
      realTimestamp: Date.now(),
      isBreaking: false,
    };

    setLeague({
      ...league,
      ownerPatience: Math.max(0, (league.ownerPatience ?? 50) - 3),
      teams: league.teams.map(t => {
        if (t.id !== userTeam.id) return t;
        return {
          ...t,
          roster: t.roster.map(pl => {
            if (pl.id !== playerId) return pl;
            return {
              ...pl,
              suspensionGames: newGames,
              isSuspended: stillSuspended,
              suspensionReason: stillSuspended ? pl.suspensionReason : undefined,
              suspensionAppealed: true,
            };
          }),
        };
      }),
      newsFeed: [newsItem, ...league.newsFeed],
    });
  };

  const handleViewFranchise = (teamId: string) => { setViewingFranchiseId(teamId); setActiveTab('franchise_history'); };
  const handleManageTeam = (teamId: string) => { setRosterTeamId(teamId); setActiveTab('roster'); };
  const handleToggleWatch = (playerId: string) => {
    setLeague(prev => {
      if (!prev) return prev;
      const wl = prev.watchList ?? [];
      return { ...prev, watchList: wl.includes(playerId) ? wl.filter(id => id !== playerId) : [...wl, playerId] };
    });
  };
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
  if (status === 'owner_welcome' && league && pendingTeamId) {
    const welcomeTeam = league.teams.find(t => t.id === pendingTeamId)!;
    return (
      <OwnerWelcome
        team={welcomeTeam}
        season={league.season}
        singleYear={!!(league.settings.singleYearSeason ?? ((league.settings.playerGenderRatio ?? 0) === 100 || (league.settings.startingYear ?? 9999) <= 1949))}
        onContinue={handleOwnerWelcomeContinue}
        onBack={() => { setPendingTeamId(null); setStatus('setup'); }}
      />
    );
  }
  if (status === 'setup' && league) {
    const usedExpansionNames = new Set(league.teams.map(t => t.name));
    const nextExpansion = EXPANSION_TEAM_POOL.find(e => !usedExpansionNames.has(e.name));
    return <TeamSelection
      teams={league.teams}
      onSelectTeam={handleSelectTeam}
      onBack={() => { setSetupFromLoad(false); setStatus(setupFromLoad ? 'title' : 'config'); }}
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
          const expansionHC = generateCoach(`coach-${teamId}-hc`, 'B', genderRatio, season);
          const newTeam: Team = {
            id: teamId,
            name: data.name,
            city: data.city,
            roster,
            staff: {
              headCoach: expansionHC,
              assistantOffense: generateCoach(`coach-${teamId}-off`, 'C', genderRatio, season),
              assistantDefense: generateCoach(`coach-${teamId}-def`, 'C', genderRatio, season),
              assistantDev: generateCoach(`coach-${teamId}-dev`, 'C', genderRatio, season),
              trainer: generateCoach(`coach-${teamId}-tr`, 'C', genderRatio, season),
            },
            staffBudget: 15000000,
            activeScheme: getCoachPreferredScheme(expansionHC),
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
  // Safety net already handles redirect via useEffect above; never shown in practice
  if (!league || !league.userTeamId) return null;

  if (isFranchiseSetup) {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-slate-950 animate-in fade-in duration-300">
        <div className="space-y-6 text-center">
          <div
            className="w-16 h-16 border-4 border-slate-700 rounded-full animate-spin mx-auto"
            style={{ borderTopColor: league.teams.find(t => t.id === league.userTeamId)?.primaryColor ?? '#f59e0b' }}
          />
          <p className="text-slate-200 font-display font-bold uppercase tracking-widest text-lg">Setting up your franchise...</p>
          <p className="text-slate-600 text-[11px] uppercase tracking-widest">Preparing roster · Building schedule · Assigning staff</p>
        </div>
      </div>
    );
  }

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
          {activeTab === 'dashboard' && <Dashboard league={league} news={news} onSimulate={handleSimulate} onScout={handleViewPlayer} scoutingReport={scoutingReport} setActiveTab={setActiveTab} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} onAdvanceToRegularSeason={handleAdvanceToRegularSeason} onOpenOffseasonAlerts={() => setShowOffseasonAlerts(true)} />}
          {activeTab === 'gm_profile' && <GMProfileView league={league} updateLeague={updateLeagueState} onResign={handleResign} />}
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
          {activeTab === 'roster' && <Roster leagueTeams={league.teams} userTeamId={league.userTeamId} initialTeamId={rosterTeamId} onScout={handleViewPlayer} onScoutCoach={handleScoutCoach} scoutingReport={scoutingReport} onUpdateTeamRoster={handleUpdateTeamRoster} onManageTeam={handleManageTeam} godMode={league.settings.godMode} watchList={league.watchList ?? []} onToggleWatch={handleToggleWatch} minRosterSize={league.settings.minRosterSize ?? 10} maxRosterSize={league.settings.maxRosterSize ?? 18} devChanges={league.devReport} />}
          {activeTab === 'rotations' && <Rotations league={league} updateLeague={updateLeagueState} />}
          {activeTab === 'free_agency' && <FreeAgency league={league} updateLeague={updateLeagueState} onScout={handleViewPlayer} recordTransaction={recordTransaction} onAdvanceSeason={handleAdvanceToRegularSeason} onBeginTransition={() => setIsSeasonTransitioning(true)} />}
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
          {activeTab === 'standings' && <Standings teams={league.teams} userTeamId={league.userTeamId} seasonLength={league.settings.seasonLength ?? 82} playoffFormat={league.settings.playoffFormat ?? 16} season={league.season} isPlayoffs={!!league.playoffBracket} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} rivalryHistory={league.rivalryHistory} previousSeasonStandings={league.previousSeasonStandings} previousSeasonYear={league.previousSeasonYear} />}
          {activeTab === 'schedule' && <Schedule league={league} onSimulate={handleSimulate} onScout={handleViewPlayer} onWatchLive={handleWatchLive} onViewBoxScore={(res, home, away) => setViewingBoxScore({ result: res, home, away })} onManageTeam={handleManageTeam} onAdvanceToRegularSeason={handleAdvanceToRegularSeason} onViewAllStar={() => setActiveTab('allstar')} onRegenerateSchedule={handleRegenerateSchedule} />}
          {activeTab === 'draft' && <Draft league={league} updateLeague={updateLeagueState} onScout={handleScoutPlayer} scoutingReport={scoutingReport} onNavigateToFreeAgency={() => setActiveTab('free_agency')} />}
          {activeTab === 'coaching' && <Coaching league={league} updateLeague={updateLeagueState} godMode={league.settings.godMode} />}
          {activeTab === 'stats' && <Stats league={league} onViewRoster={handleViewRoster} onManageTeam={handleManageTeam} onViewPlayer={p => setSelectedPlayer(p)} />}
          {activeTab === 'players' && <Players league={league} onViewPlayer={p => setSelectedPlayer(p)} watchList={league.watchList ?? []} onToggleWatch={handleToggleWatch} />}
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
              onAcceptRequest={handleAcceptTradeRequest}
              onDeclineRequest={handleDeclineTradeRequest}
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
        // Championship rings — every player on a title-winning roster
        for (const year of (selectedPlayer.championYears ?? [])) {
          if (!careerAwards.some(a => a.label === 'Champion' && a.year === year)) {
            careerAwards.push({ label: 'Champion', year, icon: '🏆' });
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
            onAppealSuspension={handleAppealSuspension}
            draftLocked={!!(league.isOffseason && league.draftPhase !== 'completed')}
            godMode={league.settings.godMode}
            onUpdatePlayer={handleUpdatePlayer}
            maxPlayerSalary={getContractRules(league).maxPlayerSalary}
            devInterventionsUsed={league.devInterventionsThisSeason ?? 0}
            devInterventionsMax={4}
            onSetTrainingFocus={handleSetTrainingFocus}
            onPlayThroughInjury={handlePlayThroughInjury}
            onExtend={handleExtendPlayer}
            isOffseason={league.isOffseason}
            isWomensLeague={(league.settings.playerGenderRatio ?? 0) === 100}
            maxExtensionSalary={getContractRules(league).maxPlayerSalary}
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
              teamLogo: playerTeam?.logo,
              teamPrimaryColor: playerTeam?.primaryColor,
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
         <CoachModal coach={selectedCoach} onClose={() => setSelectedCoach(null)} onScout={handleGenerateCoachIntelligence} scoutingReport={coachScoutingReport} godMode={league.settings.godMode} onUpdateCoach={handleUpdateCoach} careerAwards={coachAwards} isUserTeam={(Object.values(userTeam.staff) as (Coach | null)[]).some(s => s?.id === selectedCoach.id)} onExtend={handleExtendCoach} isOffseason={league.isOffseason} isWomensLeague={(league.settings.playerGenderRatio ?? 0) === 100} onFire={(id) => {
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

      {/* ── End-of-Season Owner Review overlay ── */}
      {league.showOwnerReview && league.ownerReviewData && (
        <OwnerReview
          data={league.ownerReviewData}
          teamName={userTeam?.name ?? 'Your Team'}
          onDismiss={() => updateLeagueState({ showOwnerReview: false })}
        />
      )}

      {/* ── Offseason Grade modal ── */}
      {offseasonGradeData && (
        <OffseasonGradeModal
          data={offseasonGradeData}
          teamName={userTeam?.name ?? 'Your Team'}
          onBeginPreseason={() => {
            setOffseasonGradeData(null);
            handleAdvanceToRegularSeason();
          }}
          onViewTransactions={() => {
            setOffseasonGradeData(null);
            setActiveTab('transactions');
          }}
          onDismiss={() => setOffseasonGradeData(null)}
        />
      )}

      {/* ── Draft Grade modal ── */}
      {draftGradeData && !offseasonGradeData && (
        <DraftGradeModal
          data={draftGradeData}
          teamName={userTeam?.name ?? 'Your Team'}
          onDismiss={() => setDraftGradeData(null)}
          onViewDraft={() => { setDraftGradeData(null); setActiveTab('draft'); }}
        />
      )}

      {/* ── Offseason Dev Report modal ── */}
      {showDevReport && league.devReport && (
        <DevReportModal
          changes={league.devReport}
          season={league.season}
          onViewRoster={() => { setShowDevReport(false); setActiveTab('roster'); }}
          onBeginPreseason={() => { setShowDevReport(false); handleAdvanceToRegularSeason(); }}
        />
      )}

      {pendingRelease && (
        <OwnerReactionModal
          reaction={pendingRelease.reaction}
          moveType="release"
          onProceed={() => executeRelease(pendingRelease.playerId)}
          onCancel={() => setPendingRelease(null)}
        />
      )}
      {showOffseasonAlerts && league.offseasonAlerts && league.offseasonAlerts.some(a => !a.dismissed) && (
        <OffseasonAlertsModal
          alerts={league.offseasonAlerts}
          isWomensLeague={(league.settings.playerGenderRatio ?? 0) === 100}
          onDismiss={handleDismissAlert}
          onDismissAll={handleDismissAllAlerts}
          onOfferContract={handleAlertOfferContract}
          onClose={() => setShowOffseasonAlerts(false)}
        />
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
            const newState = watchingGame.game.isPreseason
              ? await finalizePreseasonGameResult(league, watchingGame.game.id, result)
              : await finalizeGameResult(league, watchingGame.game.id, result);
            updateLeagueState({ ...newState, liveGame: undefined });
            setWatchingGame(null);
          }}
          onClose={() => {
            updateLeagueState({ liveGame: undefined });
            setWatchingGame(null);
          }}
        />
      )}
      {/* ── Season Transition Loading Overlay ────────────────────────────────── */}
      {/* z-[100] sits above main content but below grade modal (z-110) and dev report (z-9500) */}
      {isSeasonTransitioning && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center gap-6 animate-in fade-in duration-200">
          <div className="w-16 h-16 border-4 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
          <div className="text-center">
            <p className="font-display font-bold text-2xl uppercase tracking-widest text-white mb-2">
              Advancing to {league?.season ?? 2026} Preseason
            </p>
            <p className="text-slate-500 text-sm">Generating schedule &amp; applying development…</p>
          </div>
        </div>
      )}
    </div>
    </NavigationProvider>
  );
};

export default App;
