
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type Conference = 'Eastern' | 'Western';
export type Division = 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
export type MarketSize = 'Small' | 'Medium' | 'Large';
export type PlayerStatus = 'Starter' | 'Rotation' | 'Bench' | 'Injured';
export type InjuryType = 'Ankle Sprain' | 'Hamstring Strain' | 'Knee Sprain' | 'Patellofemoral Pain' | 'Lumbar Strain' | 'Finger/Hand Injury' | 'Concussion' | 'ACL Tear' | 'Achilles Rupture' | 'Illness';
export type Gender = 'Male' | 'Female' | 'Non-binary';

export type PersonalityTrait = 'Leader' | 'Diva/Star' | 'Loyal' | 'Professional' | 'Gym Rat' | 'Lazy' | 'Clutch' | 'Tough/Alpha' | 'Friendly/Team First' | 'Money Hungry';
export type CoachBadge = 'Developmental Genius' | 'Pace Master' | 'Star Handler' | 'Defensive Guru' | 'Offensive Architect' | 'Clutch Specialist' | 'Recruiting Ace';

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
    shootingInside: number;
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
  draftInfo: {
    team: string;
    round: number;
    pick: number;
    year: number;
  };
  isFreeAgent?: boolean;
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
    coaching: number;
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
}

export interface LeagueSettings {
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Extreme';
  ownerMeterEnabled: boolean;
  expansionYear?: number;
  salaryCap: number;
  luxuryTaxLine: number;
  injuryFrequency: 'Low' | 'Medium' | 'High';
  tradeDifficulty: 'Easy' | 'Realistic' | 'Hard';
  rookieProgressionRate: 'Slow' | 'Normal' | 'Fast';
  vetDeclineRate: number;
  simSpeed: 'Normal' | 'Smarter' | 'Faster';
  godMode: boolean;
  seasonLength: number;
  playerGenderRatio: number; 
  coachGenderRatio: number;
  allowManualGenderEdits: boolean;
  b2bFrequency: 'Low' | 'Realistic' | 'High';
  showAdvancedStats: boolean;
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
  eoyWins: number[]; // List of years won
  totalSeasons: number;
  milestones: GMMilestone[];
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
    phase: 'protection' | 'draft' | 'completed';
    protectedPlayerIds: Record<string, string[]>;
    expansionTeamIds: string[];
    draftLog: string[];
  };
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
