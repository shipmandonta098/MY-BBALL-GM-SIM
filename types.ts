
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type Conference = 'Eastern' | 'Western';
export type Division = 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
export type MarketSize = 'Small' | 'Medium' | 'Large';
export type PlayerStatus = 'Starter' | 'Rotation' | 'Bench' | 'Injured';
export type InjuryType = 'Ankle Sprain' | 'Hamstring Strain' | 'Knee Sprain' | 'Patellofemoral Pain' | 'Lumbar Strain' | 'Finger/Hand Injury' | 'Concussion' | 'ACL Tear' | 'Achilles Rupture' | 'Illness';
export type Gender = 'Male' | 'Female' | 'Non-binary';

export type PersonalityTrait = 'Leader' | 'Diva/Star' | 'Loyal' | 'Professional' | 'Gym Rat' | 'Lazy' | 'Clutch' | 'Tough/Alpha' | 'Friendly/Team First' | 'Money Hungry' | 'Hot Head' | 'Workhorse' | 'Streaky';

export interface PlayerTendencies {
  offensiveTendencies: {
    pullUpThree: number;          // 0-100
    postUp: number;
    driveToBasket: number;
    midRangeJumper: number;
    kickOutPasser: number;
    isoHeavy: number;
    transitionHunter: number;
    // ── New offensive tendencies ──────────────────────────────────
    spotUp: number;               // relocate off-ball for C&S
    cutter: number;               // backdoor / basket cuts off-ball
    offScreen: number;            // uses off-ball screens for open looks
    rollVsPop?: number;           // C/PF only: 70+ = rolls, <40 = pops
    attackCloseOuts: number;      // attacks when defender closes out hard
    drawFoul: number;             // seeks contact / gets to the line
    dribbleHandOff: number;       // initiates offense via DHOs
    pullUpOffPnr: number;         // pulls up for jumper off ball-screen
  };
  defensiveTendencies: {
    gambles: number;
    helpDefender: number;
    physicality: number;
    faceUpGuard: number;
    // ── New defensive tendencies ──────────────────────────────────
    onBallPest: number;           // full pressure on ball handler
    denyThePass: number;          // aggressively denies man from receiving
    shotContestDiscipline: number;// contests without biting pump fakes
  };
  situationalTendencies: {
    clutchShotTaker: number;      // demands ball / takes big shot in clutch
  };
}
export type CoachBadge = 'Developmental Genius' | 'Pace Master' | 'Star Handler' | 'Defensive Guru' | 'Offensive Architect' | 'Clutch Specialist' | 'Recruiting Ace';

// ─── AI GM ──────────────────────────────────────────────────
export type AIGMPersonality = 'Rebuilder' | 'Win Now' | 'Analytics' | 'Loyalist' | 'Superstar Chaser' | 'Balanced';

export interface AIGMRatings {
  scouting: number;
  negotiation: number;
  development: number;
  adaptability: number;
  riskTolerance: number;
}

export interface AIGMData {
  personality: AIGMPersonality;
  ratings: AIGMRatings;
}

export type CoachScheme = 'Balanced' | 'Pace and Space' | 'Grit and Grind' | 'Triangle' | 'Small Ball' | 'Showtime';
export type CoachRole = 'Head Coach' | 'Assistant Offense' | 'Assistant Defense' | 'Assistant Dev' | 'Trainer';
export type OwnerGoal = 'Win Now' | 'Rebuild' | 'Profit';

export type AwardType = 'MVP' | 'DPOY' | 'ROY' | '6MAN' | 'MIP' | 'COY' | 'EOY';

export interface Transaction {
  id: string;
  type: TransactionType;
  timestamp: number; // League Day
  realTimestamp: number;
  teamIds: string[];
  playerIds?: string[];
  description: string;
  value?: number; // Total contract value or trade salary sum
}

export interface PowerRankingEntry {
  teamId: string;
  rank: number;
  score: number;
  prevRank?: number;
}

export interface PowerRankingSnapshot {
  day: number;
  rankings: PowerRankingEntry[];
}

export interface AwardWinner {
  playerId?: string;
  coachId?: string;
  gmId?: string; // For EOY
  name: string;
  teamId: string;
  teamName: string;
  statsLabel: string;
  blurb?: string;
}

export interface SeasonAwards {
  year: number;
  mvp: AwardWinner;
  dpoy: AwardWinner;
  roy: AwardWinner;
  sixthMan: AwardWinner;
  mip: AwardWinner;
  coy: AwardWinner;
  executiveOfTheYear: AwardWinner;
  allNbaFirst: string[]; 
  allNbaSecond: string[];
  allNbaThird: string[];
  allDefensive: string[];
  allRookie: string[];
}

export interface PlayoffSeries {
  id: string;
  round: number;
  conference: Conference | 'Finals';
  team1Id: string;
  team2Id: string;
  team1Wins: number;
  team2Wins: number;
  winnerId?: string;
  games: string[];
  team1Seed: number;
  team2Seed: number;
}

export interface PlayoffBracket {
  year: number;
  series: PlayoffSeries[];
  currentRound: number;
  championId?: string;
  finalsMvp?: AwardWinner;
  isCompleted: boolean;
}

export interface ChampionshipRecord {
  year: number;
  championId: string;
  championName: string;
  runnerUpId: string;
  runnerUpName: string;
  seriesScore: string;
  finalsMvp: string;
}

export interface ContractOffer {
  years: number;
  salary: number;
  hasPlayerOption: boolean;
  hasNoTradeClause: boolean;
}

export interface BulkSimSummary {
  gamesPlayed: number;
  userWins: number;
  userLosses: number;
  notablePerformances: any[];
  news: string[];
}

export type NewsCategory = 'rumor' | 'transaction' | 'injury' | 'firing' | 'trade_request' | 'award' | 'milestone' | 'expansion' | 'playoffs';

export interface NewsItem {
  id: string;
  category: NewsCategory;
  headline: string;
  content: string;
  timestamp: number;
  realTimestamp: number;
  teamId?: string;
  playerId?: string;
  isBreaking?: boolean;
}

export interface Coach {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  role?: CoachRole;
  hometown: string;
  country?: string;
  college: string;
  experience: number;
  history: string;
  ratingOffense: number;
  ratingDefense: number;
  ratingDevelopment: number;
  ratingMotivation: number;
  ratingClutch: number;
  ratingRecruiting: number;
  potential?: number;
  scheme: CoachScheme;
  badges: CoachBadge[];
  specialization: 'None' | 'Shooting' | 'Defense' | 'Big Men' | 'Conditioning';
  salary: number;
  contractYears: number;
  desiredContract?: {
    years: number;
    salary: number;
  };
  interestScore?: number;
}

export interface PlayerStats {
  points: number;
  rebounds: number;
  offReb: number;
  defReb: number;
  assists: number;
  steals: number;
  blocks: number;
  gamesPlayed: number;
  gamesStarted: number;
  minutes: number;
  fgm: number;
  fga: number;
  threepm: number;
  threepa: number;
  ftm: number;
  fta: number;
  tov: number;
  pf: number;
  techs: number;
  flagrants: number;
  ejections: number;
  plusMinus: number;
}

export interface SeasonStats extends PlayerStats {
  year: number;
  teamId: string;
  teamName: string;
  isPlayoffs?: boolean;
}

export interface GamePlayerLine {
  playerId: string;
  name: string;
  min: number;
  pts: number;
  reb: number;
  offReb: number;
  defReb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  threepm: number;
  threepa: number;
  ftm: number;
  fta: number;
  tov: number;
  pf: number;
  techs: number;
  flagrants: number;
  plusMinus: number;
  ejected?: boolean;
  date?: number;
  opponentTeamId?: string;
  opponentTeamName?: string;
  /** Set when player did not play. Value is the reason, e.g. 'Injured'. */
  dnp?: string;
}

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  age: number;
  position: Position;
  rating: number;
  potential: number;
  attributes: {
    shooting: number;
    defense: number;
    rebounding: number;
    playmaking: number;
    athleticism: number;
    layups: number;
    dunks: number;
    shootingMid: number;
    shooting3pt: number;
    freeThrow: number;
    speed: number;
    strength: number;
    jumping: number;
    stamina: number;
    perimeterDef: number;
    interiorDef: number;
    steals: number;
    blocks: number;
    defensiveIQ: number;
    ballHandling: number;
    passing: number;
    offensiveIQ: number;
    postScoring: number;
    offReb: number;
    defReb: number;
  };
  salary: number;
  contractYears: number;
  stats: PlayerStats;
  careerStats: SeasonStats[];
  playoffStats?: PlayerStats;
  gameLog: GamePlayerLine[];
  careerHighs: {
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    threepm: number;
  };
  archetype?: string;
  tendencies?: PlayerTendencies;
  morale: number;
  jerseyNumber: number;
  height: string;
  weight: number;
  status: PlayerStatus;
  personalityTraits: PersonalityTrait[];
  hometown: string;
  country?: string;
  birthdate: string;
  college: string;
  proLeague?: string;
  draftInfo: {
    team: string;
    round: number;
    pick: number;
    year: number;
  };
  isFreeAgent?: boolean;
  inSeasonFA?: boolean; // true when waived during the regular season (10-day / rest-of-season pool)
  lastTeamId?: string;
  desiredContract?: {
    years: number;
    salary: number;
  };
  interestScore?: number;
  onTradeBlock?: boolean;
  isSuspended?: boolean;
  suspensionGames?: number;
  injuryType?: InjuryType;
  injuryDaysLeft?: number;
  /** Years (season numbers) in which this player was selected as an All-Star */
  allStarSelections?: number[];
  /** Years in which this player won the All-Star Game MVP award */
  allStarMvpYears?: number[];
}

export interface Prospect extends Omit<Player, 'stats' | 'status' | 'morale' | 'salary' | 'contractYears'> {
  scoutGrade: number;
  school: string;
  revealed: boolean;
  mockRank: number;
}

export interface DraftPick {
  round: number;
  pick: number;
  originalTeamId: string;
  currentTeamId: string;
  year?: number;
}

export interface TeamStaff {
  headCoach: Coach | null;
  assistantOffense: Coach | null;
  assistantDefense: Coach | null;
  assistantDev: Coach | null;
  trainer: Coach | null;
}

export interface TeamFinances {
  revenue: number;
  expenses: number;
  cash: number;
  ticketPrice: number;
  concessionPrice: number;
  fanHype: number;
  ownerPatience: number;
  ownerGoal: OwnerGoal;
  budgets: {
    scouting: number;
    health: number;
    facilities: number;
  };
}

export interface TeamRotation {
  starters: Record<Position, string>;
  bench: string[];
  reserves: string[];
  minutes: Record<string, number>;
}

export interface Team {
  id: string;
  name: string;
  city: string;
  roster: Player[];
  staff: TeamStaff;
  staffBudget: number;
  activeScheme: CoachScheme;
  wins: number;
  losses: number;
  prevSeasonWins?: number; // Added for EOY logic
  homeWins: number;
  homeLosses: number;
  roadWins: number; roadLosses: number;
  confWins: number; confLosses: number;
  lastTen: ('W' | 'L')[];
  budget: number;
  logo: string;
  conference: Conference;
  division: Division;
  marketSize: MarketSize;
  streak: number;
  picks: DraftPick[];
  finances: TeamFinances;
  needs?: Position[];
  primaryColor: string;
  secondaryColor: string;
  rotation?: TeamRotation;
  abbreviation: string;
  population: number; // in millions
  stadiumCapacity: number;
  borderStyle: 'None' | 'Solid' | 'Gradient';
  status: 'Active' | 'Inactive' | 'Relocating' | 'Expansion';
  aiGM?: AIGMData;
  /** Team pace rating 60-100. Controls possessions per game via tier table.
   *  Defaults to scheme-based value if not set. */
  paceRating?: number;
}

export interface TradePiece {
  type: 'player' | 'pick';
  data: Player | DraftPick;
}

export interface TradeProposal {
  id: string;
  partnerTeamId: string;
  userPieces: TradePiece[];
  partnerPieces: TradePiece[];
  date: number;
  status: 'saved' | 'incoming' | 'rejected';
}

export interface ScheduleGame {
  id: string;
  day: number;
  homeTeamId: string;
  awayTeamId: string;
  played: boolean;
  resultId?: string;
  homeB2B: boolean;
  awayB2B: boolean;
  homeB2BCount: number;
  awayB2BCount: number;
  gameNumber?: number;
}

export interface PlayByPlayEvent {
  time: string;
  text: string;
  type: 'score' | 'miss' | 'turnover' | 'foul' | 'info';
  quarter: number;
}

/** Per-quarter output from the pace/possession engine */
export interface QuarterDetail {
  quarter: number;
  homePossessions: number;
  awayPossessions: number;
  homeScore: number;
  awayScore: number;
  gamePace: number;
  avgShotClockUsed: { home: number; away: number };
  shotClockViolations: { home: number; away: number };
  timeoutsUsed: { home: number; away: number };
  fastBreakPossessions: { home: number; away: number };
  overtimeFlag?: boolean;
}

export interface GameResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  quarterScores: {
    home: number[];
    away: number[];
  };
  homePlayerStats: GamePlayerLine[];
  awayPlayerStats: GamePlayerLine[];
  topPerformers: {
    playerId: string;
    points: number;
    rebounds: number;
    assists: number;
  }[];
  playByPlay?: PlayByPlayEvent[];
  aiRecap?: string;
  date: number;
  isOvertime?: boolean;
  isBuzzerBeater?: boolean;
  isComeback?: boolean;
  isChippy?: boolean;
  season: number;
  gameInjuries?: Array<{playerId: string; playerName: string; injuryType: InjuryType; daysOut: number; teamId: string}>;
  /** Detailed per-quarter pace/possession stats */
  quarterDetails?: QuarterDetail[];
}

/** Rookie=easiest AI GM, Pro=balanced, All-Star=optimized, Legend=targets human weaknesses.
 *  Legacy values Easy/Medium/Hard/Extreme treated as Rookie/Pro/All-Star/Legend respectively. */
export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Extreme' | 'Rookie' | 'Pro' | 'All-Star' | 'Legend';

export interface LeagueSettings {
  difficulty: DifficultyLevel;
  ownerMeterEnabled: boolean;
  expansionYear?: number;
  salaryCap: number;
  luxuryTaxLine: number;
  franchiseName?: string;
  startingYear?: number;
  injuryFrequency: 'None' | 'Low' | 'Medium' | 'High';
  tradeDifficulty: 'Arcade' | 'Easy' | 'Realistic' | 'Hard' | 'Simulation';
  rookieProgressionRate: 'Slow' | 'Normal' | 'Fast' | 'Accelerated';
  vetDeclineRate: number;
  simSpeed: 'Normal' | 'Smarter' | 'Faster';
  godMode: boolean;
  seasonLength: number;
  playerGenderRatio: number;
  coachGenderRatio: number;
  allowManualGenderEdits: boolean;
  b2bFrequency: 'None' | 'Low' | 'Realistic' | 'High' | 'Brutal';
  showAdvancedStats: boolean;
  hardCap?: number;

  // ── League Tab additions ──────────────────────────────────────────────────
  playoffFormat?: 6 | 8 | 10 | 12 | 14 | 16;
  playoffSeeding?: 'Conference' | 'League-wide';
  playInTournament?: boolean;
  homeCourt?: boolean;
  tradeDeadline?: 'Disabled' | 'Week 12' | 'Week 14' | 'Week 16';
  hardCapAtDeadline?: boolean;
  maxContractYears?: 2 | 3 | 4 | 5;
  rookieScaleContracts?: boolean;
  maxPlayerSalaryPct?: 25 | 30 | 35;
  birdRights?: boolean;
  draftRounds?: number;           // default 2 (any positive integer)
  draftClassSize?: 'Small' | 'Normal' | 'Large';
  internationalProspects?: boolean;
  draftLottery?: boolean;
  scheduledExpansion?: 'Off' | 'Year 2' | 'Year 3' | 'Year 5';
  expansionTeamCount?: 1 | 2 | 4;
  expansionDraftRules?: 'Standard' | 'Protected' | 'Open';
  expansionEnabled?: boolean;
  numTeams?: number;

  // ── Roster & Draft Extended ───────────────────────────────────────────────
  minRosterSize?: number;          // default 10
  maxRosterSize?: number;          // default 18
  draftType?: 'NBA 1994' | 'Custom Lottery' | 'Carry-Over (COLA)' | 'Straight Pick';
  customLotterySelections?: number; // default 4 — only for Custom/COLA
  customLotteryChances?: number[];  // default [140,140,140,125,105,90,75,60,45,30,20,15,10,5,5]
  tradableDraftPickSeasons?: number; // default 4
  prospectAgeMin?: number;          // default 19
  prospectAgeMax?: number;          // default 22

  // ── Gameplay Tab additions ────────────────────────────────────────────────
  fatigueImpact?: 'None' | 'Low' | 'Medium' | 'High';
  b2bPenalty?: 'None' | 'Mild' | 'Severe';
  loadManagement?: boolean;
  injuryDuration?: 'Short' | 'Realistic' | 'Long';
  practiceInjuries?: boolean;
  careerEndingInjuries?: boolean;
  teamChemistry?: boolean;
  chemistryImpact?: 'Low' | 'Medium' | 'High';
  personalityClashPenalties?: boolean;
  playerMorale?: boolean;
  moraleAffectsAttributes?: boolean;
  tradeRequestThreshold?: 'Low' | 'Medium' | 'High';

  // ── Simulation Tab ────────────────────────────────────────────────────────
  pbpDetailLevel?: 'Full' | 'Standard' | 'Box Score Only';
  aiDecisionSpeed?: 'Active' | 'Normal' | 'Passive';
  blowoutFrequency?: 'Low' | 'Medium' | 'High' | 'Realistic';
  comebackFrequency?: 'Low' | 'Medium' | 'High' | 'Realistic';
  overtimeFrequency?: 'Low' | 'Medium' | 'High' | 'Realistic';
  globalPaceOverride?: number;
  shotClockLength?: 24 | 20 | 14;
  scoringEra?: 'Low Scoring' | 'Modern' | 'Run & Gun';
  threePtFrequency?: 'Low' | 'Medium' | 'High' | 'Very High';
  simBlockFrequency?: 'Low' | 'Medium' | 'High';
  turnoverFrequency?: 'Low' | 'Medium' | 'High';

  // ── Offensive Sliders ─────────────────────────────────────────────────────
  sliderLayup?: number;
  sliderMidRange?: number;
  slider3pt?: number;
  sliderFreeThrow?: number;
  sliderFastBreak?: number;
  sliderPostUp?: number;
  sliderPickRoll?: number;

  // ── Defensive Sliders ─────────────────────────────────────────────────────
  sliderSteal?: number;
  sliderBlock?: number;
  sliderFoul?: number;
  sliderHelpDefense?: number;
  sliderPerimeterDefense?: number;

  // ── Game Flow Sliders ─────────────────────────────────────────────────────
  sliderTimeout?: number;
  sliderSubstitution?: number;
  sliderTechFoul?: number;
  sliderFlagrantFoul?: number;
  sliderInjuryMultiplier?: number;

  // ── Season Structure additions ────────────────────────────────────────────
  divisionGames?: number;          // default 16
  conferenceGames?: number;        // default 36
  tradeDeadlineFraction?: number;  // 0–1, default 0.6 (60% of season)
  splitByConference?: boolean;     // default true
  guaranteedPerDivision?: number;  // default 0
  reseedRounds?: boolean;          // default false
  ownerPatienceLevel?: 'Low' | 'Medium' | 'High'; // affects AI firing aggression
  luxuryTaxMultiplier?: number;    // default 1.5
  budgetThreshold?: boolean;       // default false
  tradeSalaryMatchPct?: number;    // default 125
  minPayroll?: number;             // default 46_650_000 (payroll floor)
  luxuryTaxThreshold?: number;     // default 84_750_000 (second apron / tax line)
  salaryCapType?: 'Soft Cap' | 'Hard Cap'; // default 'Soft Cap'
  // Rookie Contracts
  pick1SalaryPct?: number;         // default 25 — #1 pick salary as % of max contract
  roundsAboveMin?: number;         // rounds with above-min contracts, default 1
  rookieContractLengths?: number[]; // per-round lengths, default [3,2]
  canRefuseAfterRookie?: boolean;  // player can refuse extension after rookie deal, default false

  // ── God Mode additions ────────────────────────────────────────────────────
  editAnyPlayer?: boolean;
  editAnyTeam?: boolean;
  forceGameOutcomes?: boolean;
  manipulateStandings?: boolean;
  freeAgentMarketControl?: boolean;
  draftClassEditor?: boolean;
}

export interface GMMilestone {
  id: string;
  year: number;
  day: number;
  text: string;
  type: 'title' | 'award' | 'firing' | 'trade' | 'signing' | 'milestone';
  teamId?: string;
}

export interface GMProfile {
  name: string;
  avatarSeed: string;
  reputation: number; // 0-100
  eoyWins: number[]; // List of years won Executive of the Year
  totalSeasons: number;
  milestones: GMMilestone[];
  // Career stats
  careerWins?: number;
  careerLosses?: number;
  finalsAppearances?: number;  // total Finals trips
  coachOfYearWins?: number;    // Coach of the Year awards (if user doubled as coach)
  preferredStyle?: 'Offense' | 'Defense' | 'Balanced';
}

export interface RivalryStats {
  team1Id: string;
  team2Id: string;
  team1Wins: number;
  team2Wins: number;
  totalGames: number;
  lastFiveGames: ('team1' | 'team2')[];
  lastGameResult?: {
    winnerId: string;
    score: string;
    day: number;
    season: number;
  };
  playoffSeriesCount: number;
  buzzerBeaters: number;
  comebacks: number;
  otGames: number;
  badBloodScore: number; // For trades/suspensions
}

export interface LeagueState {
  id: string;
  lastUpdated: number;
  currentDay: number;
  season: number;
  leagueName: string;
  userTeamId: string;
  gmProfile: GMProfile;
  teams: Team[];
  schedule: ScheduleGame[];
  isOffseason: boolean;
  offseasonDay: number;
  draftPhase: 'scouting' | 'lottery' | 'draft' | 'completed';
  prospects: Prospect[];
  history: GameResult[];
  freeAgents: Player[];
  coachPool: Coach[];
  savedTrades: TradeProposal[];
  newsFeed: NewsItem[];
  transactions: Transaction[];
  powerRankingHistory?: PowerRankingSnapshot[];
  settings: LeagueSettings;
  awardHistory?: SeasonAwards[];
  currentSeasonAwards?: SeasonAwards;
  playoffBracket?: PlayoffBracket;
  draftPicks?: DraftPick[];
  currentDraftPickIndex?: number;
  championshipHistory?: ChampionshipRecord[];
  rivalryHistory?: RivalryStats[];
  expansionDraft?: {
    active: boolean;
    phase: 'setup' | 'protection' | 'draft' | 'completed';
    protectedPlayerIds: Record<string, string[]>;
    expansionTeamIds: string[];
    draftLog: string[];
    pendingTeams?: {
      id: string;
      name: string;
      city: string;
      abbreviation: string;
      gmName: string;
      primaryColor: string;
      secondaryColor: string;
      logoUrl: string;
    }[];
  };
  /** Populated when the human roster OVR ranks top-3 at season start (advisory only). */
  humanOvrAlert?: string;
  seasonPhase?: SeasonPhase;
  tradeDeadlinePassed?: boolean;
  allStarWeekend?: AllStarWeekendData;
  liveGame?: {
    gameId: string;
    homeScore: number;
    awayScore: number;
    quarter: number;
    timeLeft: number;
    events: PlayByPlayEvent[];
    homeStats: Record<string, Partial<GamePlayerLine>>;
    awayStats: Record<string, Partial<GamePlayerLine>>;
    homeQScore: number[];
    awayQScore: number[];
  };
}

export type TransactionType = 'trade' | 'signing' | 'release' | 'hiring' | 'firing' | 'injury' | 'waiver' | 'draft';

export type SeasonPhase = 'Preseason' | 'Regular Season' | 'Trade Deadline' | 'All-Star Weekend' | 'Playoffs' | 'Offseason';

export interface AllStarVoteEntry {
  playerId: string;
  fanScore: number;      // 0-100 weighted fan vote
  mediaScore: number;    // 0-100 weighted player/media/coach vote
  totalScore: number;    // combined
  selectionType: 'starter-fan' | 'starter-media' | 'reserve-coach' | 'injury-replacement';
}

export interface AllStarContestResult {
  eventName: 'Skills Challenge' | '3-Point Contest' | 'Dunk Contest';
  participants: string[];  // player IDs who competed
  winner: { playerId: string; playerName: string; teamId: string; teamName: string; score?: string };
  runnerUp?: { playerId: string; playerName: string; teamId: string; teamName: string; score?: string };
  highlights: string[];
}

export interface AllStarPlayerLine {
  playerId: string;
  playerName: string;
  position: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  threepm: number;
  threepa: number;
  ftm: number;
  fta: number;
  isStarter: boolean;
  isMvp?: boolean;
}

export interface AllStarGameResult {
  eastScore: number;
  westScore: number;
  mvp: { playerId: string; playerName: string; teamId: string; teamName: string; statLine: string };
  eastRoster: string[];
  westRoster: string[];
  highlights: string[];
  quarterScores?: { east: number[]; west: number[] };
  boxScore?: { east: AllStarPlayerLine[]; west: AllStarPlayerLine[] };
  playByPlay?: string[];
}

export interface AllStarWeekendData {
  year: number;
  day: number;
  // Full rosters (starters + reserves)
  eastRoster: string[];        // 12 total (5 starters + 7 reserves)
  westRoster: string[];        // 12 total
  eastStarters: string[];      // 5: 2 guards + 3 frontcourt
  westStarters: string[];
  eastReserves: string[];      // 7 coach picks
  westReserves: string[];
  // Injury replacements
  injuryReplacements?: Array<{ originalId: string; replacementId: string; conf: 'Eastern' | 'Western' }>;
  // Vote breakdown per player
  voteEntries?: AllStarVoteEntry[];
  // Event participants (qualified pool, not just allstar roster)
  skillsParticipants: string[];     // 4-6 guards/wings age<27
  threePtParticipants: string[];    // 8 sharpshooters
  dunkParticipants: string[];       // 4-6 athletes age<30
  // Results
  skillsChallenge?: AllStarContestResult;
  threePtContest?: AllStarContestResult;
  dunkContest?: AllStarContestResult;
  allStarGame?: AllStarGameResult;
  completed: boolean;
}
