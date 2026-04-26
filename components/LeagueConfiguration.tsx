
import React, { useState, useEffect } from 'react';
import { LeagueSettings } from '../types';
import { getHistoricalFinancials, getWNBAHistoricalFinancials, getEraMaxPlayerSalary } from '../constants';
import { computeMensMarketSalary } from '../utils/contractRules';
import { fmtSalary } from '../utils/formatters';
import NumericInput from './NumericInput';

interface LeagueConfigurationProps {
  onConfirm: (name: string, year: number, settings: Partial<LeagueSettings>) => void;
  onCancel: () => void;
}

const DEFAULT_SETTINGS_KEY = 'HOOPS_DYNASTY_DEFAULT_SETTINGS_V2';

const DIFFICULTY_INFO: Record<string, { tooltip: string }> = {
  Rookie:     { tooltip: 'Forgiving AI — trades lean your way, AI makes mistakes. Easy to build a contender.' },
  Pro:        { tooltip: 'Balanced AI — fair trade value, competent roster decisions. Recommended for most players.' },
  'All-Star': { tooltip: 'Optimized AI — builds competitive rosters, drives hard bargains in trades and free agency.' },
  Legend:     { tooltip: 'AI targets your weaknesses, refuses bad trades, maximizes every competitive advantage.' },
};

const FIELD_HINTS: Record<string, string> = {
  b2bFrequency:         'None: 0 B2Bs. Low: ~10/team. Realistic: ~20/team. Brutal: ~28/team (classic NBA crunch).',
  rookieProgressionRate:'Multiplier on offseason development gains for players under age 23.',
  tradeDifficulty:      'Arcade: almost any trade gets approved. Simulation: strict value matching required.',
  injuryFrequency:      'Multiplier applied to all injury probability rolls throughout the season.',
  seasonLength:         'Between 20 – 82 games. Affects schedule, playoff timing, and per-game stat calcs.',
  salaryCap:            'Luxury tax auto-sets to cap × 1.15. Hard cap auto-sets to cap × 1.25.',
  playoffFormat:        'Number of teams that qualify for the postseason bracket.',
  tradeDeadline:        'Week the trade deadline falls. Disabled = no deadline restriction.',
  draftRounds:          'How many rounds the annual draft contains. Affects prospect pool depth.',
  expansionEnabled:     'Enable an expansion draft to add new franchises mid-career via the Expansion tab.',
};

const Section: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
    <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3 mb-2">{title}</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; hint?: string; error?: string; children?: React.ReactNode }> = ({ label, hint, error, children }) => (
  <div className="space-y-2">
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
    {children}
    {hint && <p className="text-[9px] text-slate-600 leading-relaxed">{hint}</p>}
    {error && <p className="text-[10px] font-bold text-rose-400">{error}</p>}
  </div>
);

const BtnGroup: React.FC<{
  options: string[]; value: string; onChange: (v: string) => void;
  colors?: Record<string, string>; tooltips?: Record<string, string>;
}> = ({ options, value, onChange, colors = {}, tooltips = {} }) => {
  const [tip, setTip] = React.useState<string | null>(null);
  return (
    <div className="relative">
      <div className="flex gap-1.5 flex-wrap">
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChange(o)}
            onMouseEnter={() => tooltips[o] ? setTip(o) : undefined}
            onMouseLeave={() => setTip(null)}
            className={`flex-1 min-w-[60px] py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${
              value === o
                ? `${colors[o] ?? 'bg-amber-500'} text-white shadow-lg`
                : 'bg-slate-950 border border-slate-700 text-slate-500 hover:text-white hover:border-slate-500'
            }`}>
            {o}
          </button>
        ))}
      </div>
      {tip && tooltips[tip] && (
        <div className="absolute z-50 mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-[10px] text-slate-300 leading-relaxed shadow-xl">
          {tooltips[tip]}
        </div>
      )}
    </div>
  );
};

const Toggle: React.FC<{ label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, sub, checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)}
    className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl transition-all ${checked ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-950 border-slate-800'}`}>
    <div className="text-left">
      <span className="text-xs font-bold text-slate-400 uppercase">{label}</span>
      {sub && <p className="text-[9px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
    <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-3 ${checked ? 'bg-amber-500' : 'bg-slate-700'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
    </div>
  </button>
);

const LeagueConfiguration: React.FC<LeagueConfigurationProps> = ({ onConfirm, onCancel }) => {
  // ── Basic ─────────────────────────────────────────────────────────────────
  const [name, setName]               = useState('Global Basketball Association');
  const [year, setYear]               = useState(2025);
  const [historicalOverride, setHistoricalOverride] = useState(false);

  // ── Gender ────────────────────────────────────────────────────────────────
  const [playerGenderRatio, setPlayerGenderRatio]         = useState(0);
  const [coachGenderRatio, setCoachGenderRatio]           = useState(10);
  const [allowManualGenderEdits, setAllowManualGenderEdits] = useState(true);

  // ── Core Sim Rules ────────────────────────────────────────────────────────
  const [difficulty, setDifficulty]           = useState<LeagueSettings['difficulty']>('Pro');
  const [ownerMeterEnabled, setOwnerMeterEnabled] = useState(true);
  const [injuryFrequency, setInjuryFrequency] = useState<LeagueSettings['injuryFrequency']>('Medium');
  const [tradeDifficulty, setTradeDifficulty] = useState<LeagueSettings['tradeDifficulty']>('Realistic');

  // ── Gameplay Tweaks ───────────────────────────────────────────────────────
  const [b2bFrequency, setB2bFrequency]           = useState<LeagueSettings['b2bFrequency']>('Realistic');
  const [rookieProgression, setRookieProgression] = useState<LeagueSettings['rookieProgressionRate']>('Normal');
  const [showAdvancedStats, setShowAdvancedStats] = useState(true);

  // ── Playoffs & Schedule ───────────────────────────────────────────────────
  const [playoffFormat, setPlayoffFormat]       = useState<6|8|10|12|14|16>(16);
  const [playoffSeeding, setPlayoffSeeding]     = useState<'Conference'|'League-wide'>('Conference');
  const [playInTournament, setPlayInTournament] = useState(true);
  const [homeCourt, setHomeCourt]               = useState(true);
  const [tradeDeadline, setTradeDeadline]       = useState<LeagueSettings['tradeDeadline']>('Week 14');
  const [hardCapAtDeadline, setHardCapAtDeadline] = useState(false);

  // ── Season Structure ──────────────────────────────────────────────────────
  const [divisionGames, setDivisionGames]             = useState(16);
  const [conferenceGames, setConferenceGames]         = useState(36);
  const [tradeDeadlineFraction, setTradeDeadlineFraction] = useState(0.6);
  const [splitByConference, setSplitByConference]     = useState(true);
  const [guaranteedPerDivision, setGuaranteedPerDivision] = useState(0);
  const [reseedRounds, setReseedRounds]               = useState(false);
  const [ownerPatienceLevel, setOwnerPatienceLevel]   = useState<'Low'|'Medium'|'High'>('Medium');

  // ── Contracts ─────────────────────────────────────────────────────────────
  const [maxContractYears, setMaxContractYears]       = useState<2|3|4|5>(5);
  const [rookieScaleContracts, setRookieScaleContracts] = useState(true);
  const [maxPlayerSalaryPct, setMaxPlayerSalaryPct]   = useState<25|30|35>(35);
  const [birdRights, setBirdRights]                   = useState(true);
  // 0 = auto-calculate from cap; non-zero = manual override
  const [minContractSalaryOverride, setMinContractSalaryOverride] = useState(0);
  const [maxContractSalaryOverride, setMaxContractSalaryOverride] = useState(0);

  // ── Finances ──────────────────────────────────────────────────────────────
  const [minPayroll, setMinPayroll]               = useState(46_650_000);
  const [luxuryTaxThreshold, setLuxuryTaxThreshold] = useState(84_750_000);
  const [salaryCapType, setSalaryCapType]         = useState<'Soft Cap'|'Hard Cap'>('Soft Cap');

  // ── Rookie Contracts ──────────────────────────────────────────────────────
  const [pick1SalaryPct, setPick1SalaryPct]           = useState(25);
  const [roundsAboveMin, setRoundsAboveMin]           = useState(1);
  const [rookieContractLengthsRaw, setRookieContractLengthsRaw] = useState('[3,2]');
  const [canRefuseAfterRookie, setCanRefuseAfterRookie] = useState(false);

  // ── Draft ─────────────────────────────────────────────────────────────────
  const [draftRounds, setDraftRounds]                   = useState(2);
  const [draftClassSize, setDraftClassSize]             = useState<'Small'|'Normal'|'Large'>('Normal');
  const [internationalProspects, setInternationalProspects] = useState(true);
  const [draftLottery, setDraftLottery]                 = useState(true);
  const [draftType, setDraftType]                       = useState<LeagueSettings['draftType']>('NBA 1994');
  const [customLotterySelections, setCustomLotterySelections] = useState(4);
  const [customLotteryChancesRaw, setCustomLotteryChancesRaw] = useState('[140,140,140,125,105,90,75,60,45,30,20,15,10,5,5]');
  const [tradableDraftPickSeasons, setTradableDraftPickSeasons] = useState(4);
  const [prospectAgeMin, setProspectAgeMin]             = useState(19);
  const [prospectAgeMax, setProspectAgeMax]             = useState(22);

  // ── Roster Rules ──────────────────────────────────────────────────────────
  const [minRosterSize, setMinRosterSize] = useState(10);
  const [maxRosterSize, setMaxRosterSize] = useState(18);

  // ── Expansion ─────────────────────────────────────────────────────────────
  const [expansionEnabled, setExpansionEnabled]       = useState(false);
  const [expansionTeamCount, setExpansionTeamCount]   = useState<1|2|4>(2);
  const [expansionDraftRules, setExpansionDraftRules] = useState<'Standard'|'Protected'|'Open'>('Standard');

  // ── Advanced ──────────────────────────────────────────────────────────────
  const [godMode, setGodMode]         = useState(false);
  const [seasonLength, setSeasonLength] = useState(82);
  const [quarterLength, setQuarterLength] = useState(12);
  const [salaryCap, setSalaryCap]     = useState(140_000_000);
  const [numTeams, setNumTeams]       = useState(30);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [godModeConfirm, setGodModeConfirm] = useState(false);

  // ── Load saved defaults ───────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(DEFAULT_SETTINGS_KEY);
    if (!saved) return;
    try {
      const p = JSON.parse(saved);
      if (p.leagueName)                    setName(p.leagueName);
      if (p.playerGenderRatio !== undefined) setPlayerGenderRatio(p.playerGenderRatio);
      if (p.coachGenderRatio !== undefined)  setCoachGenderRatio(p.coachGenderRatio);
      if (p.difficulty)                    setDifficulty(p.difficulty);
      if (p.ownerMeterEnabled !== undefined) setOwnerMeterEnabled(p.ownerMeterEnabled);
      if (p.injuryFrequency)               setInjuryFrequency(p.injuryFrequency);
      if (p.tradeDifficulty)               setTradeDifficulty(p.tradeDifficulty);
      if (p.rookieProgressionRate)         setRookieProgression(p.rookieProgressionRate);
      if (p.showAdvancedStats !== undefined) setShowAdvancedStats(p.showAdvancedStats);
      if (p.seasonLength)                  setSeasonLength(p.seasonLength);
      if (p.quarterLength)                 setQuarterLength(p.quarterLength);
      if (p.salaryCap)                     setSalaryCap(p.salaryCap);
      if (p.minPayroll)                    setMinPayroll(p.minPayroll);
      if (p.luxuryTaxThreshold)            setLuxuryTaxThreshold(p.luxuryTaxThreshold);
      if (p.salaryCapType)                 setSalaryCapType(p.salaryCapType);
      if (p.pick1SalaryPct)                setPick1SalaryPct(p.pick1SalaryPct);
      if (p.roundsAboveMin !== undefined)  setRoundsAboveMin(p.roundsAboveMin);
      if (p.rookieContractLengths)         setRookieContractLengthsRaw(JSON.stringify(p.rookieContractLengths));
      if (p.canRefuseAfterRookie !== undefined) setCanRefuseAfterRookie(p.canRefuseAfterRookie);
      if (p.b2bFrequency)                  setB2bFrequency(p.b2bFrequency);
      if (p.numTeams)                      setNumTeams(p.numTeams);
      if (p.playoffFormat)                 setPlayoffFormat(p.playoffFormat);
      if (p.playoffSeeding)                setPlayoffSeeding(p.playoffSeeding);
      if (p.playInTournament !== undefined)  setPlayInTournament(p.playInTournament);
      if (p.homeCourt !== undefined)         setHomeCourt(p.homeCourt);
      if (p.tradeDeadline)                 setTradeDeadline(p.tradeDeadline);
      if (p.hardCapAtDeadline !== undefined) setHardCapAtDeadline(p.hardCapAtDeadline);
      if (p.maxContractYears)              setMaxContractYears(p.maxContractYears);
      if (p.rookieScaleContracts !== undefined) setRookieScaleContracts(p.rookieScaleContracts);
      if (p.maxPlayerSalaryPct)            setMaxPlayerSalaryPct(p.maxPlayerSalaryPct);
      if (p.birdRights !== undefined)        setBirdRights(p.birdRights);
      if (p.minContractSalary)             setMinContractSalaryOverride(p.minContractSalary);
      if (p.maxContractSalary)             setMaxContractSalaryOverride(p.maxContractSalary);
      if (p.draftRounds)                   setDraftRounds(p.draftRounds);
      if (p.draftClassSize)                setDraftClassSize(p.draftClassSize);
      if (p.internationalProspects !== undefined) setInternationalProspects(p.internationalProspects);
      if (p.draftLottery !== undefined)      setDraftLottery(p.draftLottery);
      if (p.draftType)                     setDraftType(p.draftType);
      if (p.customLotterySelections)       setCustomLotterySelections(p.customLotterySelections);
      if (p.customLotteryChances)          setCustomLotteryChancesRaw(JSON.stringify(p.customLotteryChances));
      if (p.tradableDraftPickSeasons)      setTradableDraftPickSeasons(p.tradableDraftPickSeasons);
      if (p.prospectAgeMin)                setProspectAgeMin(p.prospectAgeMin);
      if (p.prospectAgeMax)                setProspectAgeMax(p.prospectAgeMax);
      if (p.minRosterSize)                 setMinRosterSize(p.minRosterSize);
      if (p.maxRosterSize)                 setMaxRosterSize(p.maxRosterSize);
      if (p.expansionEnabled !== undefined)  setExpansionEnabled(p.expansionEnabled);
      if (p.expansionTeamCount)            setExpansionTeamCount(p.expansionTeamCount);
      if (p.expansionDraftRules)           setExpansionDraftRules(p.expansionDraftRules);
      // Season Structure
      if (p.divisionGames !== undefined)           setDivisionGames(p.divisionGames);
      if (p.conferenceGames !== undefined)         setConferenceGames(p.conferenceGames);
      if (p.tradeDeadlineFraction !== undefined)   setTradeDeadlineFraction(p.tradeDeadlineFraction);
      if (p.splitByConference !== undefined)       setSplitByConference(p.splitByConference);
      if (p.guaranteedPerDivision !== undefined)   setGuaranteedPerDivision(p.guaranteedPerDivision);
      if (p.reseedRounds !== undefined)            setReseedRounds(p.reseedRounds);
      if (p.ownerPatienceLevel)                    setOwnerPatienceLevel(p.ownerPatienceLevel);
    } catch { /* ignore */ }
  }, []);

  // Auto-sync coach gender distribution to player gender distribution
  useEffect(() => {
    setCoachGenderRatio(playerGenderRatio);
  }, [playerGenderRatio]);

  // ── Auto-load historical financials when year or gender changes ──────────
  const isWomensLeague = playerGenderRatio === 100;

  // Clamp year to WNBA minimum when switching to Women's league
  useEffect(() => {
    if (isWomensLeague && year < 1997) setYear(1997);
  }, [isWomensLeague]);

  useEffect(() => {
    if (historicalOverride) return;
    const h = isWomensLeague ? getWNBAHistoricalFinancials(year) : getHistoricalFinancials(year);
    const capDefault = isWomensLeague ? 2_200_000 : 140_000_000;
    const payrollDefault = isWomensLeague ? 800_000 : 46_650_000;
    const taxDefault = isWomensLeague ? 0 : 84_750_000;
    setSalaryCap(h.salaryCap > 0 ? h.salaryCap : capDefault);
    setMinPayroll(h.minPayroll > 0 ? h.minPayroll : payrollDefault);
    setLuxuryTaxThreshold(h.luxuryTaxThreshold > 0 ? h.luxuryTaxThreshold : taxDefault);
    setRookieScaleContracts(h.rookieScaleContracts);
    if (isWomensLeague) {
      if (h.maxContractYears)       setMaxContractYears(h.maxContractYears);
      if (h.maxPlayerSalaryPct)     setMaxPlayerSalaryPct(h.maxPlayerSalaryPct);
      if (h.birdRights !== undefined) setBirdRights(h.birdRights);
      if (h.draftRounds)            setDraftRounds(h.draftRounds);
      if (h.draftClassSize)         setDraftClassSize(h.draftClassSize);
      if (h.tradableDraftPickSeasons !== undefined) setTradableDraftPickSeasons(h.tradableDraftPickSeasons);
    }
  }, [year, historicalOverride, isWomensLeague]);

  const handleGodModeToggle = (checked: boolean) => {
    if (checked) setGodModeConfirm(true);
    else setGodMode(false);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim())          errs.name = 'League name is required.';
    else if (name.length > 30) errs.name = 'League name must be 30 characters or fewer.';
    if (!year || year < 1900 || year > 2200) errs.year = 'Starting year must be between 1900 and 2200.';
    if (isWomensLeague && year < 1997) errs.year = 'WNBA era starts in 1997.';
    if (seasonLength < 20 || seasonLength > 82) errs.seasonLength = 'Season length must be between 20 and 82 games.';
    const capMin = isWomensLeague ? 50_000 : 1_000_000;
    if (salaryCap < capMin || salaryCap > 300_000_000) errs.salaryCap = isWomensLeague ? 'Salary cap must be $50K – $300M.' : 'Salary cap must be $1M – $300M.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    const h = isWomensLeague ? getWNBAHistoricalFinancials(year) : getHistoricalFinancials(year);
    const noCap = !historicalOverride && h.salaryCap === 0;
    const effectiveCap  = noCap ? 999_000_000 : salaryCap;
    const effectiveTax  = noCap || h.luxuryTaxLine === 0 ? 0 : Math.round(effectiveCap * 1.15);
    const effectiveTrade = !historicalOverride ? h.tradeSalaryMatchPct : 125;
    const effectiveLuxMult = !historicalOverride ? h.luxuryTaxMultiplier : 1.5;
    const settings: Partial<LeagueSettings> = {
      // Basic
      franchiseName: name,
      startingYear: year,
      // Core sim
      difficulty,
      ownerMeterEnabled,
      injuryFrequency,
      tradeDifficulty,
      // Gameplay
      b2bFrequency,
      rookieProgressionRate: rookieProgression,
      vetDeclineRate: 100,
      simSpeed: 'Normal',
      showAdvancedStats,
      // Financial (historical-aware)
      salaryCap: effectiveCap,
      luxuryTaxLine: effectiveTax,
      hardCap: Math.round(effectiveCap * 1.25),
      minPayroll,
      luxuryTaxThreshold,
      salaryCapType: noCap ? 'Soft Cap' : salaryCapType,
      tradeSalaryMatchPct: effectiveTrade,
      luxuryTaxMultiplier: effectiveLuxMult,
      // Rookie Contracts
      pick1SalaryPct,
      roundsAboveMin,
      rookieContractLengths: (() => { try { const a = JSON.parse(rookieContractLengthsRaw); return Array.isArray(a) ? a : undefined; } catch { return undefined; } })(),
      canRefuseAfterRookie,
      // Gender
      playerGenderRatio,
      coachGenderRatio,
      allowManualGenderEdits,
      // Playoffs & schedule
      playoffFormat,
      playoffSeeding,
      playInTournament,
      homeCourt,
      tradeDeadline,
      hardCapAtDeadline,
      // Contracts
      maxContractYears,
      rookieScaleContracts,
      maxPlayerSalaryPct,
      birdRights,
      minContractSalary: minContractSalaryOverride || undefined,
      maxContractSalary: maxContractSalaryOverride || undefined,
      // Draft
      draftRounds,
      draftClassSize,
      internationalProspects,
      draftLottery,
      draftType,
      customLotterySelections,
      customLotteryChances: (() => { try { const a = JSON.parse(customLotteryChancesRaw); return Array.isArray(a) ? a : undefined; } catch { return undefined; } })(),
      tradableDraftPickSeasons,
      prospectAgeMin,
      prospectAgeMax,
      // Roster
      minRosterSize,
      maxRosterSize,
      // Expansion
      expansionEnabled,
      expansionTeamCount,
      expansionDraftRules,
      // Season Structure
      divisionGames,
      conferenceGames,
      tradeDeadlineFraction,
      splitByConference,
      guaranteedPerDivision,
      reseedRounds,
      ownerPatienceLevel,
      // Advanced
      godMode,
      seasonLength,
      quarterLength,
      numTeams,
    };
    if (saveAsDefault) {
      localStorage.setItem(DEFAULT_SETTINGS_KEY, JSON.stringify({ ...settings, leagueName: name }));
    }
    onConfirm(name, year, settings);
  };

  // ── derived labels ────────────────────────────────────────────────────────
  const playerGenderLabel =
    playerGenderRatio === 0   ? 'All Male'    :
    playerGenderRatio === 100 ? 'All Female'  :
    playerGenderRatio === 50  ? 'Mixed 50/50' : 'Custom';

  const fmtM = fmtSalary;

  // ── contract salary auto-values (used when override is 0) ─────────────────
  const autoMinContract = isWomensLeague
    ? Math.max(25_000, Math.round(salaryCap * 0.012))
    : 1_100_000;
  const autoMaxContract = Math.round(salaryCap * maxPlayerSalaryPct / 100);
  const displayMinContract = minContractSalaryOverride || autoMinContract;
  const displayMaxContract = maxContractSalaryOverride || autoMaxContract;

  const normDiff = (d: LeagueSettings['difficulty']): string =>
    d === 'Easy' ? 'Rookie' : d === 'Medium' ? 'Pro' : d === 'Hard' ? 'All-Star' : d === 'Extreme' ? 'Legend' : d;

  const normB2b = (v: LeagueSettings['b2bFrequency']): string => v === 'High' ? 'Brutal' : v;

  const normTrade = (v: LeagueSettings['tradeDifficulty']): string =>
    v === 'Easy' ? 'Arcade' : v === 'Hard' ? 'Simulation' : v;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-950 z-[110] overflow-y-auto animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center py-8 px-4 md:py-12 md:px-10">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px]" />
      </div>

      {/* God Mode Confirm */}
      {godModeConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-8 max-w-sm w-full space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-xl font-display font-bold uppercase text-white">Enable God Mode?</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              God Mode is enabled. Some achievements will be disabled. All league rules can be bypassed. Continue?
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setGodMode(true); setGodModeConfirm(false); }}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-400 text-white font-black uppercase text-sm rounded-2xl transition-all">
                Enable God Mode
              </button>
              <button onClick={() => setGodModeConfirm(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-black uppercase text-sm rounded-2xl transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[3rem] p-6 md:p-12 shadow-2xl space-y-10">

        {/* Title */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-display font-bold uppercase tracking-tight text-white break-words leading-tight">
            Initialize <span className="text-amber-500">Dynasty</span>
          </h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">Craft your basketball universe</p>
        </div>

        {/* ── Row 1: Name + Year ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="League Name" error={errors.name}>
            <input type="text" value={name} maxLength={30} onChange={e => setName(e.target.value)}
              className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-display text-lg focus:outline-none focus:border-amber-500/50 transition-colors ${errors.name ? 'border-rose-500' : 'border-slate-800'}`} />
          </Field>
          <Field label="Starting Year" error={errors.year}>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))}
              className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-display text-lg focus:outline-none appearance-none cursor-pointer ${errors.year ? 'border-rose-500' : 'border-slate-800'}`}>
              {isWomensLeague
                ? Array.from({ length: 30 }, (_, i) => 1997 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))
                : Array.from({ length: 80 }, (_, i) => 1947 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))
              }
            </select>
            {isWomensLeague && (
              <p className="text-[9px] text-violet-400/70 font-bold mt-1 uppercase tracking-widest">WNBA era: 1997–2026</p>
            )}
          </Field>
        </div>

        {/* ── Historical Era Banner ─────────────────────────────────────────────── */}
        {(() => {
          const h = isWomensLeague ? getWNBAHistoricalFinancials(year) : getHistoricalFinancials(year);
          const noCap = h.salaryCap === 0;
          const isFutureWNBA = isWomensLeague && year >= 2026;
          const bannerLabel = historicalOverride
            ? '✏ Custom Financials'
            : isWomensLeague
              ? isFutureWNBA
                ? `📅 Historical values loaded for ${year} — Future WNBA Projection · Hard Cap · No Luxury Tax`
                : `📅 Historical values loaded for ${year} — WNBA Era · Hard Cap · No Luxury Tax`
              : `📅 Historical values loaded for ${year}`;
          const accentColor = isWomensLeague ? 'text-violet-400' : 'text-amber-500';
          const borderColor = historicalOverride
            ? 'border-slate-700 bg-slate-900/40'
            : isWomensLeague
              ? 'border-violet-500/30 bg-violet-500/5'
              : 'border-amber-500/30 bg-amber-500/5';
          return (
            <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-2 ${borderColor}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${accentColor}`}>
                    {bannerLabel}
                  </span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">— {h.era}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoricalOverride(v => !v)}
                  className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border transition-all ${
                    historicalOverride
                      ? `border-${isWomensLeague ? 'violet' : 'amber'}-500 ${accentColor} hover:bg-${isWomensLeague ? 'violet' : 'amber'}-500 hover:text-slate-950`
                      : 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300'
                  }`}
                >
                  {historicalOverride ? 'Restore Historical' : 'Override (Alt History)'}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400">
                <span className={noCap ? 'text-rose-400' : 'text-slate-300'}>
                  Cap: {noCap ? 'None' : fmtSalary(h.salaryCap)}
                </span>
                <span>·</span>
                {isWomensLeague ? (
                  <span className="text-violet-400 font-black">Hard Cap · No Luxury Tax</span>
                ) : (
                  <span>
                    Luxury Tax: {h.luxuryTaxLine === 0 ? 'None' : fmtSalary(h.luxuryTaxLine)}
                  </span>
                )}
                <span>·</span>
                <span>Rookie Scale: {h.rookieScaleContracts ? 'Yes' : 'No'}</span>
                <span>·</span>
                <span>Trade Match: {h.tradeSalaryMatchPct === 100 ? 'Unrestricted' : `${h.tradeSalaryMatchPct}%`}</span>
                <span>·</span>
                <span className={accentColor}>
                  Max Contract: {fmtSalary(getEraMaxPlayerSalary(year, isWomensLeague, h.salaryCap))}/yr
                </span>
                {!isWomensLeague && (
                  <>
                    <span>·</span>
                    <span className="text-slate-300">
                      Typical Star Max: {fmtSalary(computeMensMarketSalary(90, year))}/yr
                    </span>
                  </>
                )}
                {isWomensLeague && h.maxContractYears && (<><span>·</span><span>Max Yrs: {h.maxContractYears}yr</span></>)}
                {isWomensLeague && h.birdRights !== undefined && (<><span>·</span><span>Bird Rights: {h.birdRights ? 'Yes' : 'No'}</span></>)}
                {isWomensLeague && h.draftRounds && (<><span>·</span><span>Draft: {h.draftRounds} rounds</span></>)}
                {isWomensLeague && h.draftClassSize && (<><span>·</span><span>Class Size: {h.draftClassSize}</span></>)}
              </div>
              {!historicalOverride && (
                <p className="text-[9px] text-slate-600 italic">{h.note}</p>
              )}
            </div>
          );
        })()}

        {/* ── Roster & Gender ──────────────────────────────────────────────────── */}
        <Section title="Roster & Gender Options">
          <Field label="Player Gender Distribution">
            <div className="space-y-3">
              <select value={playerGenderLabel}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'All Male')    setPlayerGenderRatio(0);
                  else if (v === 'All Female')  setPlayerGenderRatio(100);
                  else if (v === 'Mixed 50/50') setPlayerGenderRatio(50);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
                <option>All Male</option>
                <option>All Female</option>
                <option>Mixed 50/50</option>
                <option>Custom</option>
              </select>
              {playerGenderLabel === 'Custom' && (
                <div className="px-2 space-y-1">
                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                    <span>0% Female</span>
                    <span className="text-amber-400">{playerGenderRatio}% Female</span>
                  </div>
                  <input type="range" min={0} max={100} value={playerGenderRatio}
                    onChange={e => setPlayerGenderRatio(parseInt(e.target.value))}
                    className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                </div>
              )}
            </div>
          </Field>
          <Field label="Coach Gender Distribution">
            <select value={coachGenderRatio} onChange={e => setCoachGenderRatio(parseInt(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold">
              <option value={0}>All Male</option>
              <option value={10}>Realistic (10% Female)</option>
              <option value={50}>Mixed 50/50</option>
              <option value={100}>All Female</option>
            </select>
          </Field>
          <div className="md:col-span-2 flex items-start gap-3 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
            <input type="checkbox" checked={allowManualGenderEdits} onChange={e => setAllowManualGenderEdits(e.target.checked)}
              className="w-5 h-5 accent-amber-500 rounded cursor-pointer mt-0.5" />
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Allow Manual Gender Edits in God Mode</span>
              <p className="text-[9px] text-slate-600 mt-0.5">If disabled, player/coach gender is locked permanently after generation.</p>
            </div>
          </div>
        </Section>

        {/* ── Core Sim Rules ───────────────────────────────────────────────────── */}
        <Section title="Core Sim Rules">
          <Field label="Difficulty Level">
            <BtnGroup options={['Rookie','Pro','All-Star','Legend']}
              value={normDiff(difficulty)}
              onChange={v => setDifficulty(v as LeagueSettings['difficulty'])}
              colors={{ Rookie: 'bg-emerald-500', Pro: 'bg-blue-500', 'All-Star': 'bg-amber-500', Legend: 'bg-rose-500' }}
              tooltips={Object.fromEntries(Object.entries(DIFFICULTY_INFO).map(([k, v]) => [k, v.tooltip]))} />
          </Field>
          <Field label="Owner Patience Meter">
            <Toggle label={ownerMeterEnabled ? 'Enabled — losing seasons trigger pressure events' : 'Disabled — no ownership risk'}
              checked={ownerMeterEnabled} onChange={setOwnerMeterEnabled} />
          </Field>
          <Field label="Injury Frequency" hint={FIELD_HINTS.injuryFrequency}>
            <BtnGroup options={['None','Low','Medium','High']} value={injuryFrequency}
              onChange={v => setInjuryFrequency(v as LeagueSettings['injuryFrequency'])} />
          </Field>
          <Field label="Trade Realism" hint={FIELD_HINTS.tradeDifficulty}>
            <BtnGroup options={['Arcade','Realistic','Simulation']} value={normTrade(tradeDifficulty)}
              onChange={v => setTradeDifficulty(v as LeagueSettings['tradeDifficulty'])} />
          </Field>
        </Section>

        {/* ── Gameplay Tweaks ──────────────────────────────────────────────────── */}
        <Section title="Gameplay Tweaks">
          <Field label="Back-to-Back Frequency" hint={FIELD_HINTS.b2bFrequency}>
            <BtnGroup options={['None','Low','Realistic','Brutal']} value={normB2b(b2bFrequency)}
              onChange={v => setB2bFrequency(v as LeagueSettings['b2bFrequency'])} />
          </Field>
          <Field label="Rookie Progression Speed" hint={FIELD_HINTS.rookieProgressionRate}>
            <BtnGroup options={['Slow','Normal','Fast','Accelerated']} value={rookieProgression}
              onChange={v => setRookieProgression(v as LeagueSettings['rookieProgressionRate'])} />
          </Field>
          <div className="md:col-span-2 flex items-start gap-3 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
            <input type="checkbox" checked={showAdvancedStats} onChange={e => setShowAdvancedStats(e.target.checked)}
              className="w-5 h-5 accent-amber-500 rounded cursor-pointer mt-0.5" />
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Show Advanced Stats (PER, VORP) by Default</span>
              <p className="text-[9px] text-slate-600 mt-0.5">Controls default view in Player Stats, Box Score, and League Intelligence tabs.</p>
            </div>
          </div>
        </Section>

        {/* ── Advanced Settings trigger ────────────────────────────────────────── */}
        <div className="border-t border-slate-800 pt-8">
          <button type="button" onClick={() => setShowAdvanced(true)}
            className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 hover:text-white transition-colors">
            ▶ Advanced Settings
          </button>
        </div>

        {/* ── Advanced Settings modal (bottom-sheet on mobile, dialog on desktop) ─ */}
        {showAdvanced && (
          <div className="fixed inset-0 z-[150] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAdvanced(false)} />
            {/* Panel */}
            <div className="relative w-full sm:max-w-4xl max-h-[92vh] sm:max-h-[88vh] bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
              {/* Sticky header with close button */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-slate-900/95 backdrop-blur border-b border-slate-800 rounded-t-3xl shrink-0">
                <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.4em]">Advanced Settings</h3>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(false)}
                  className="w-9 h-9 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all text-base font-bold shrink-0"
                  aria-label="Close Advanced Settings"
                >
                  ✕
                </button>
              </div>
              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-8">

              {/* ── League Infrastructure ─────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">League Infrastructure</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="Salary Cap (Soft Limit)" hint={FIELD_HINTS.salaryCap} error={errors.salaryCap}>
                    <div className="space-y-2">
                      <NumericInput value={salaryCap} min={80_000_000} max={300_000_000}
                        onChange={setSalaryCap}
                        className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none ${errors.salaryCap ? 'border-rose-500' : 'border-slate-800'}`} />
                      <div className="flex gap-4 text-[9px] font-black text-slate-600 uppercase">
                        <span>Cap: {fmtM(salaryCap)}</span>
                        <span>Luxury: {fmtM(Math.round(salaryCap * 1.15))}</span>
                        <span>Hard Cap: {fmtM(Math.round(salaryCap * 1.25))}</span>
                      </div>
                    </div>
                  </Field>
                  <Field label="Enable God Mode">
                    <div className={`flex items-start gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all ${godMode ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-950 border-slate-800'}`}
                      onClick={() => handleGodModeToggle(!godMode)}>
                      <input type="checkbox" checked={godMode} readOnly className="w-5 h-5 accent-rose-500 pointer-events-none mt-0.5" />
                      <div>
                        <span className={`text-xs font-bold uppercase ${godMode ? 'text-rose-400' : 'text-slate-500'}`}>
                          {godMode ? 'Unlocked — full override access' : 'Locked — standard rules enforce'}
                        </span>
                        <p className="text-[9px] text-slate-600 mt-0.5">Enabling God Mode may affect achievement tracking.</p>
                      </div>
                    </div>
                  </Field>

                </div>
              </div>

              {/* ── Playoffs & Scheduling ─────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Playoffs & Scheduling</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="Playoff Format" hint={FIELD_HINTS.playoffFormat}>
                    <BtnGroup options={['6','8','10','16']} value={String(playoffFormat)}
                      onChange={v => setPlayoffFormat(parseInt(v) as 6|8|10|16)} />
                  </Field>
                  <Field label="Playoff Seeding">
                    <BtnGroup options={['Conference','League-wide']} value={playoffSeeding}
                      onChange={v => setPlayoffSeeding(v as 'Conference'|'League-wide')} />
                  </Field>
                  <Field label="Play-in Tournament">
                    <Toggle label={playInTournament ? 'Enabled — seeds 7–10 compete for final spots' : 'Disabled — top N teams qualify directly'}
                      checked={playInTournament} onChange={setPlayInTournament} />
                  </Field>
                  <Field label="Home Court Advantage">
                    <Toggle label={homeCourt ? 'Enabled — home team gets FT and crowd boost' : 'Disabled — neutral venue sim'}
                      checked={homeCourt} onChange={setHomeCourt} />
                  </Field>
                  <Field label="Trade Deadline" hint={FIELD_HINTS.tradeDeadline}>
                    <BtnGroup options={['Disabled','Week 12','Week 14','Week 16']} value={tradeDeadline ?? 'Week 14'}
                      onChange={v => setTradeDeadline(v as LeagueSettings['tradeDeadline'])} />
                  </Field>
                  <Field label="Hard Cap at Deadline">
                    <Toggle label={hardCapAtDeadline ? 'Enabled — no moves that breach hard cap after deadline' : 'Disabled — soft cap only post-deadline'}
                      checked={hardCapAtDeadline} onChange={setHardCapAtDeadline} />
                  </Field>

                </div>
              </div>

              {/* ── Season Structure ──────────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Season Structure</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="Games Per Season" hint="Between 20–82 games. Affects schedule, playoff timing, and per-game stat calcs." error={errors.seasonLength}>
                    <NumericInput value={seasonLength} min={20} max={82}
                      onChange={setSeasonLength}
                      className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-mono focus:outline-none ${errors.seasonLength ? 'border-rose-500' : 'border-slate-800'}`} />
                  </Field>

                  <Field label="Quarter Length (Minutes)" hint="Minutes per quarter. NBA standard is 12. College uses 20-min halves (10 per quarter). Scales possessions, scoring, and player minutes.">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {[8, 10, 12, 15, 20].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setQuarterLength(v)}
                            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all border ${
                              quarterLength === v
                                ? 'bg-amber-500 border-amber-400 text-slate-950'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                            }`}
                          >{v}</button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range" min={5} max={20} step={1}
                          value={quarterLength}
                          onChange={e => setQuarterLength(parseInt(e.target.value))}
                          className="flex-1 h-1.5 accent-amber-500 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-amber-400 font-mono font-black text-sm w-12 text-right">{quarterLength} min</span>
                      </div>
                      <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">
                        ~{Math.round(((quarterLength / 12) * 105))} pts/game avg · {quarterLength * 4} min regulation
                      </p>
                    </div>
                  </Field>

                  <Field label="Division Games" hint="Games played vs. each team in own division. Leave 0 to treat like any conference game.">
                    <NumericInput value={divisionGames} min={0} max={82}
                      onChange={setDivisionGames}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono focus:outline-none" />
                  </Field>

                  <Field label="Conference Games" hint="Total games played within own conference. Leave 0 for no special treatment.">
                    <NumericInput value={conferenceGames} min={0} max={82}
                      onChange={setConferenceGames}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono focus:outline-none" />
                  </Field>

                  <Field label="Trade Deadline (% of Season)" hint="e.g. 0.60 = deadline falls at game 49 of an 82-game season.">
                    <div className="space-y-2">
                      <input type="range" min={30} max={85} step={1}
                        value={Math.round(tradeDeadlineFraction * 100)}
                        onChange={e => setTradeDeadlineFraction(parseInt(e.target.value) / 100)}
                        className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                      <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                        <span>30%</span>
                        <span className="text-amber-400">{Math.round(tradeDeadlineFraction * 100)}% — Game {Math.round(tradeDeadlineFraction * seasonLength)}</span>
                        <span>85%</span>
                      </div>
                    </div>
                  </Field>

                  <Field label="Guaranteed Per Division" hint="Minimum playoff spots guaranteed to each division winner (0 = none guaranteed).">
                    <BtnGroup options={['0','1','2']} value={String(guaranteedPerDivision)}
                      onChange={v => setGuaranteedPerDivision(parseInt(v))} />
                  </Field>

                  <Field label="Owner Patience Level" hint="Low = owners fire coaches quickly. High = owners give coaches more time.">
                    <BtnGroup
                      options={['Low','Medium','High']}
                      value={ownerPatienceLevel}
                      onChange={v => setOwnerPatienceLevel(v as 'Low'|'Medium'|'High')}
                      colors={{ Low: 'bg-rose-500', Medium: 'bg-amber-500', High: 'bg-emerald-500' }}
                    />
                  </Field>

                  <Field label="Split By Conference">
                    <Toggle label={splitByConference ? 'Enabled — playoffs split East/West brackets' : 'Disabled — league-wide bracket, best records advance'}
                      checked={splitByConference} onChange={setSplitByConference} />
                  </Field>

                  <Field label="Reseed Rounds">
                    <Toggle label={reseedRounds ? 'Enabled — remaining teams re-seeded each round' : 'Disabled — fixed bracket after seeding'}
                      checked={reseedRounds} onChange={setReseedRounds} />
                  </Field>

                </div>
              </div>

              {/* ── Finances ──────────────────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Finances</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="Salary Cap Type">
                    <BtnGroup options={['Soft Cap','Hard Cap']} value={salaryCapType}
                      onChange={v => setSalaryCapType(v as 'Soft Cap'|'Hard Cap')}
                      colors={{ 'Soft Cap': 'bg-amber-500', 'Hard Cap': 'bg-rose-500' }} />
                  </Field>
                  <Field label="Salary Cap (Soft Limit)" hint={FIELD_HINTS.salaryCap} error={errors.salaryCap}>
                    <div className="space-y-2">
                      <NumericInput value={salaryCap} min={80_000_000} max={300_000_000}
                        onChange={setSalaryCap}
                        className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none ${errors.salaryCap ? 'border-rose-500' : 'border-slate-800'}`} />
                      <div className="flex gap-4 text-[9px] font-black text-slate-600 uppercase">
                        <span>Cap: {fmtM(salaryCap)}</span>
                        <span>Luxury: {fmtM(Math.round(salaryCap * 1.15))}</span>
                        <span>Hard Cap: {fmtM(Math.round(salaryCap * 1.25))}</span>
                      </div>
                    </div>
                  </Field>
                  <Field label="Minimum Payroll" hint="Payroll floor — every team must spend at least this much.">
                    <NumericInput value={minPayroll} min={20_000_000} max={120_000_000}
                      onChange={setMinPayroll}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none" />
                    <p className="text-[9px] text-slate-600 mt-1">Default: {fmtM(46_650_000)}</p>
                  </Field>
                  <Field label="Luxury Tax Threshold" hint="Second apron / tax line — triggers enhanced penalties.">
                    <NumericInput value={luxuryTaxThreshold} min={30_000_000} max={200_000_000}
                      onChange={setLuxuryTaxThreshold}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none" />
                    <p className="text-[9px] text-slate-600 mt-1">Default: {fmtM(84_750_000)}</p>
                  </Field>

                </div>
              </div>

              {/* ── Contracts ─────────────────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Contracts & Salary Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="Max Contract Years">
                    <BtnGroup options={['2','3','4','5']} value={String(maxContractYears)}
                      onChange={v => setMaxContractYears(parseInt(v) as 2|3|4|5)} />
                  </Field>
                  <Field label="Max Player Salary %" hint="Max % of cap any single player can earn.">
                    <BtnGroup options={['25%','30%','35%']} value={`${maxPlayerSalaryPct}%`}
                      onChange={v => { setMaxPlayerSalaryPct(parseInt(v) as 25|30|35); setMaxContractSalaryOverride(0); }} />
                    <p className="text-[10px] text-emerald-500/80 font-bold mt-1.5 uppercase tracking-widest">
                      Auto: {fmtSalary(autoMaxContract)}/yr
                    </p>
                  </Field>

                  <Field label="Min Contract/yr" hint="Minimum annual salary a player can be signed for. Auto-calculated from cap; override if needed.">
                    <NumericInput value={displayMinContract}
                      min={1_000} max={displayMaxContract}
                      onChange={v => setMinContractSalaryOverride(v)}
                      onBlur={() => setMinContractSalaryOverride(v => Math.max(1_000, Math.min(v, displayMaxContract)))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none" />
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[10px] text-sky-400/80 font-bold uppercase tracking-widest">
                        {fmtSalary(displayMinContract)}/yr
                      </p>
                      {minContractSalaryOverride > 0 && (
                        <button onClick={() => setMinContractSalaryOverride(0)} className="text-[9px] text-slate-500 hover:text-slate-300 font-bold uppercase">↺ Reset Auto</button>
                      )}
                    </div>
                  </Field>

                  <Field label="Max Contract/yr" hint="Maximum annual salary any single player can earn. Auto-calculated from cap × max%; override if needed.">
                    <NumericInput value={displayMaxContract}
                      min={displayMinContract} max={salaryCap}
                      onChange={v => setMaxContractSalaryOverride(v)}
                      onBlur={() => setMaxContractSalaryOverride(v => Math.max(displayMinContract, Math.min(v, salaryCap)))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none" />
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[10px] text-amber-400/80 font-bold uppercase tracking-widest">
                        MAX CONTRACT: {fmtSalary(displayMaxContract)}/yr
                      </p>
                      {maxContractSalaryOverride > 0 && (
                        <button onClick={() => setMaxContractSalaryOverride(0)} className="text-[9px] text-slate-500 hover:text-slate-300 font-bold uppercase">↺ Reset Auto</button>
                      )}
                    </div>
                  </Field>
                  <Field label="Bird Rights">
                    <Toggle label={birdRights ? 'Enabled — re-sign own players over cap' : 'Disabled — hard cap applies to re-signings'}
                      checked={birdRights} onChange={setBirdRights} />
                  </Field>

                </div>
              </div>

              {/* ── Rookie Contracts ──────────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Rookie Contracts</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="Rookie Salary Scale">
                    <Toggle label={rookieScaleContracts ? 'Enabled — drafted players on fixed rookie scale' : 'Disabled — rookies negotiate freely'}
                      checked={rookieScaleContracts} onChange={setRookieScaleContracts} />
                  </Field>
                  <Field label="#1 Pick Salary, % of Max Contract" hint="Slot salary for the top pick as a % of the max contract.">
                    <div className="space-y-2">
                      <input type="range" min={10} max={50} step={1} value={pick1SalaryPct}
                        onChange={e => setPick1SalaryPct(parseInt(e.target.value))}
                        className="w-full h-1.5 accent-amber-500 bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                      <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                        <span>10%</span>
                        <span className="text-amber-400">{pick1SalaryPct}% of max</span>
                        <span>50%</span>
                      </div>
                    </div>
                  </Field>
                  <Field label="Rounds With >Min Contracts" hint="How many draft rounds receive above-minimum salaries.">
                    <BtnGroup options={['0','1','2','3']} value={String(roundsAboveMin)}
                      onChange={v => setRoundsAboveMin(parseInt(v))} />
                  </Field>
                  <Field label="Rookie Contract Lengths" hint="JSON array — one length (years) per round. e.g. [3,2]">
                    <textarea rows={2} value={rookieContractLengthsRaw}
                      onChange={e => setRookieContractLengthsRaw(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-amber-400 font-mono text-sm focus:outline-none resize-none" />
                    <p className="text-[9px] text-slate-600 mt-1">Default: [3,2] — round 1 = 3yr, round 2 = 2yr</p>
                  </Field>
                  <Field label="Can Refuse After Rookie Contract">
                    <Toggle label={canRefuseAfterRookie ? 'Enabled — players can reject extensions after rookie deal expires' : 'Disabled — standard extension rules apply'}
                      checked={canRefuseAfterRookie} onChange={setCanRefuseAfterRookie} />
                  </Field>

                </div>
              </div>

              {/* ── Roster Rules ──────────────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Roster Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Min Roster Size" hint="Minimum players required on an active roster.">
                    <NumericInput value={minRosterSize} min={5} max={20}
                      onChange={setMinRosterSize}
                      onBlur={() => setMinRosterSize(v => Math.max(5, Math.min(v, maxRosterSize)))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono focus:outline-none" />
                  </Field>
                  <Field label="Max Roster Size" hint="Maximum players allowed on an active roster.">
                    <NumericInput value={maxRosterSize} min={10} max={30}
                      onChange={setMaxRosterSize}
                      onBlur={() => setMaxRosterSize(v => Math.max(v, minRosterSize, 10))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono focus:outline-none" />
                  </Field>
                </div>
              </div>

              {/* ── Draft ─────────────────────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Draft Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="# Draft Rounds" hint={FIELD_HINTS.draftRounds}>
                    <NumericInput value={draftRounds} min={1} max={10}
                      onChange={setDraftRounds}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono focus:outline-none" />
                  </Field>
                  <Field label="Draft Type" hint="Lottery format used to assign draft order.">
                    <select value={draftType} onChange={e => setDraftType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none">
                      <option>NBA 1994</option>
                      <option>Custom Lottery</option>
                      <option>Carry-Over (COLA)</option>
                      <option>Straight Pick</option>
                    </select>
                  </Field>

                  {(draftType === 'Custom Lottery' || draftType === 'Carry-Over (COLA)') && (
                    <>
                      <Field label="Custom # Lottery Selections" hint="How many picks are decided by lottery (rest go in order).">
                        <NumericInput value={customLotterySelections} min={1} max={14}
                          onChange={setCustomLotterySelections}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono focus:outline-none" />
                      </Field>
                      <Field label="Custom Lottery Chances" hint="JSON array of weights per team slot (worst → best). Must sum to 1000.">
                        <textarea rows={3} value={customLotteryChancesRaw}
                          onChange={e => setCustomLotteryChancesRaw(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-amber-400 font-mono text-xs focus:outline-none resize-none" />
                        <p className="text-[9px] text-slate-600 mt-1">Default: [140,140,140,125,105,90,75,60,45,30,20,15,10,5,5]</p>
                      </Field>
                    </>
                  )}

                  <Field label="# Tradable Draft Pick Seasons" hint="How many future seasons' picks can be traded at once.">
                    <BtnGroup options={['1','2','3','4','5','7']} value={String(tradableDraftPickSeasons)}
                      onChange={v => setTradableDraftPickSeasons(parseInt(v))} />
                  </Field>
                  <Field label="Age of Draft Prospects" hint="Min and max age of prospects entering the draft class.">
                    <div className="flex gap-3 items-center">
                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Min Age</label>
                        <NumericInput value={prospectAgeMin} min={16} max={prospectAgeMax}
                          onChange={v => setProspectAgeMin(Math.min(v, prospectAgeMax))}
                          onBlur={() => setProspectAgeMin(v => Math.min(v, prospectAgeMax))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
                      </div>
                      <span className="text-slate-600 font-bold mt-5">–</span>
                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Max Age</label>
                        <NumericInput value={prospectAgeMax} min={prospectAgeMin} max={35}
                          onChange={v => setProspectAgeMax(Math.max(v, prospectAgeMin))}
                          onBlur={() => setProspectAgeMax(v => Math.max(v, prospectAgeMin))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
                      </div>
                    </div>
                  </Field>

                  <Field label="Draft Class Size">
                    <BtnGroup options={['Small','Normal','Large']} value={draftClassSize}
                      onChange={v => setDraftClassSize(v as 'Small'|'Normal'|'Large')} />
                  </Field>
                  <Field label="Draft Lottery">
                    <Toggle label={draftLottery ? 'Enabled — bottom teams get weighted lottery odds' : 'Disabled — strict reverse-standings order'}
                      checked={draftLottery} onChange={setDraftLottery} />
                  </Field>
                  <Field label="International Prospects">
                    <Toggle label={internationalProspects ? 'Enabled — overseas players enter draft pool' : 'Disabled — domestic prospects only'}
                      checked={internationalProspects} onChange={setInternationalProspects} />
                  </Field>

                </div>
              </div>

              {/* ── Expansion ─────────────────────────────────────────────────── */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-3">Expansion</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <Field label="Enable Expansion" hint={FIELD_HINTS.expansionEnabled}>
                    <Toggle
                      label={expansionEnabled ? 'Enabled — Expansion tab available in-career' : 'Disabled — no expansion draft'}
                      sub={expansionEnabled ? 'Launch the draft any time from the Expansion tab.' : undefined}
                      checked={expansionEnabled} onChange={setExpansionEnabled} />
                  </Field>
                  <Field label="Expansion Team Count">
                    <BtnGroup options={['1','2','4']} value={String(expansionTeamCount)}
                      onChange={v => setExpansionTeamCount(parseInt(v) as 1|2|4)} />
                  </Field>
                  <Field label="Expansion Draft Rules" hint="Standard: 8 protected. Protected: 11. Open: all players eligible.">
                    <BtnGroup options={['Standard','Protected','Open']} value={expansionDraftRules}
                      onChange={v => setExpansionDraftRules(v as 'Standard'|'Protected'|'Open')} />
                  </Field>
                  {expansionEnabled && (
                    <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/25 rounded-xl p-3">
                      <span className="text-orange-400 mt-0.5 text-sm">🏀</span>
                      <p className="text-[10px] text-orange-300 leading-relaxed">
                        Expansion is on. During your career, open the <strong>Expansion</strong> tab to set up new franchises and run the draft whenever you're ready.
                      </p>
                    </div>
                  )}

                </div>
              </div>

              </div>
            </div>
          </div>
        )}

        {/* ── Bottom ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={saveAsDefault} onChange={e => setSaveAsDefault(e.target.checked)}
              className="w-5 h-5 accent-amber-500 rounded cursor-pointer" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Save as Default for Future Leagues</span>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button onClick={handleConfirm}
              className="flex-1 md:flex-none px-12 py-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xl uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-amber-500/20 active:scale-95">
              Continue to Team Selection
            </button>
            <button onClick={onCancel}
              className="px-8 py-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold text-xl uppercase tracking-wider rounded-2xl transition-all">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueConfiguration;
