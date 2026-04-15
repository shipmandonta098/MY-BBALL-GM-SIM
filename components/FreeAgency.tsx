import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { LeagueState, Player, ContractOffer, Transaction, Position } from '../types';
import { getFlag } from '../constants';

// ── Constants ──────────────────────────────────────────────────────────────
const MORATORIUM_DAYS = 5; // signing window opens after day 5
const AI_SIGNINGS_PER_DAY = 3;

interface FreeAgencyProps {
  league: LeagueState;
  updateLeague: (updated: Partial<LeagueState>) => void;
  onScout: (player: Player) => void;
  recordTransaction: (
    state: LeagueState,
    type: any,
    teamIds: string[],
    description: string,
    playerIds?: string[],
    value?: number
  ) => Transaction[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (val: number) => `$${(val / 1_000_000).toFixed(1)}M`;
const fmtFull = (val: number) => `$${(val / 1_000_000).toFixed(2)}M`;

/** Compute a reasonable desired salary for a player if one isn't set.
 *  Piecewise curve: 70-79 OVR → $7-16M, 80-87 → $16-26M, 88+ → $26-45M. */
const computeDesiredSalary = (rating: number): number => {
  let base: number;
  if (rating >= 95)      base = 35_000_000 + (rating - 95) * 1_750_000;  // $35M–$42M supermax
  else if (rating >= 88) base = 18_000_000 + (rating - 88) * 2_428_571;  // $18M–$33M star
  else if (rating >= 80) base = 8_500_000  + (rating - 80) * 1_187_500;  // $8.5M–$17.5M starter
  else if (rating >= 70) base = 3_500_000  + (rating - 70) * 500_000;    // $3.5M–$8.5M role
  else if (rating >= 60) base = 1_500_000  + (rating - 60) * 200_000;    // $1.5M–$3.5M bench
  else                   base = 1_100_000;
  return Math.round(base / 250_000) * 250_000;
};

const computeDesiredYears = (age: number, rating: number): number => {
  if (rating >= 80) return 4;
  if (rating >= 70) return 3;
  if (age >= 33) return 1;
  return 2;
};

/** Get canonical desired contract, falling back to computed values */
const getDesired = (p: Player) => ({
  salary: p.desiredContract?.salary || computeDesiredSalary(p.rating),
  years: p.desiredContract?.years || computeDesiredYears(p.age, p.rating),
});

const interestLabel = (score: number) => {
  if (score >= 70) return { text: 'High', color: 'text-emerald-400', bar: 'bg-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30' };
  if (score >= 40) return { text: 'Med', color: 'text-amber-400', bar: 'bg-amber-500', bg: 'bg-amber-500/10 border-amber-500/30' };
  return { text: 'Low', color: 'text-rose-400', bar: 'bg-rose-500', bg: 'bg-rose-500/10 border-rose-500/30' };
};

const ratingColor = (r: number) => {
  if (r >= 85) return 'text-amber-400';
  if (r >= 75) return 'text-emerald-400';
  if (r >= 65) return 'text-blue-400';
  return 'text-slate-400';
};

type SortKey = 'rating' | 'age' | 'interest' | 'salary' | 'name';
type NegotiationResult = 'accepted' | 'declined' | 'counter' | null;
type InSeasonContractType = '10day' | 'rest-of-season' | 'minimum' | 'full';

// Compute in-season contract offers for a player
const getInSeasonContracts = (rating: number, gamesRemaining: number) => {
  const restSalary = Math.round(Math.min(3_500_000, Math.max(600_000, gamesRemaining * 35_000)) / 250_000) * 250_000;
  return [
    { type: '10day' as const,         label: '10-Day',              salary: 600_000,   years: 1, eligible: rating < 82 },
    { type: 'rest-of-season' as const, label: 'Rest-of-Season Min', salary: restSalary, years: 1, eligible: rating < 88 },
    { type: 'minimum' as const,       label: 'Season Minimum',      salary: 3_000_000, years: 1, eligible: true },
    { type: 'full' as const,          label: 'Full Offer',          salary: computeDesiredSalary(rating), years: 1, eligible: true },
  ].filter(c => c.eligible);
};

// ── Component ────────────────────────────────────────────────────────────────
const FreeAgency: React.FC<FreeAgencyProps> = ({
  league,
  updateLeague,
  onScout,
  recordTransaction,
}) => {
  // ── Market tab ──
  const [marketTab, setMarketTab] = useState<'available' | 'upcoming'>('available');

  // ── Filter state ──
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [interestFilter, setInterestFilter] = useState<'ALL' | 'High' | 'Med' | 'Low'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [sortAsc, setSortAsc] = useState(false);

  // ── Upcoming FA search ──
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [upcomingPos, setUpcomingPos] = useState<Position | 'ALL'>('ALL');

  // ── In-season signing state ──
  const [inSeasonPlayer, setInSeasonPlayer] = useState<Player | null>(null);
  const [inSeasonResult, setInSeasonResult] = useState<{ accepted: boolean; contractType: string; salary: number } | null>(null);

  // ── Negotiation state ──
  const [negotiatingPlayer, setNegotiatingPlayer] = useState<Player | null>(null);
  const [offer, setOffer] = useState<ContractOffer>({
    years: 2,
    salary: 5_000_000,
    hasPlayerOption: false,
    hasNoTradeClause: false,
  });
  const [negotiationResult, setNegotiationResult] = useState<NegotiationResult>(null);
  const [agentMessage, setAgentMessage] = useState('');
  const [counterOffer, setCounterOffer] = useState<{ years: number; salary: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── RFA offer-sheet state ──
  /** Tracks which player IDs have already had offer-sheet generation attempted */
  const rfaOffersProcessed = useRef<Set<string>>(new Set());

  // ── Cap math ──
  const salaryCap  = league.settings.salaryCap  || 140_000_000;
  const luxuryTax  = league.settings.luxuryTaxLine || 170_000_000;
  // NBA apron thresholds (proportional to cap)
  const firstApron  = salaryCap + 56_000_000;   // ~$196M on $140M cap (first apron)
  const secondApron = salaryCap + 68_000_000;   // ~$208M on $140M cap (second apron / hard cap)
  const userTeam = league.teams.find(t => t.id === league.userTeamId)!;
  const currentSalary = userTeam.roster.reduce((sum, p) => sum + (p.salary || 0), 0);
  const capSpace = salaryCap - currentSalary;
  const isOverCap   = capSpace < 0;
  const isOverLux   = currentSalary > luxuryTax;
  const isOverFirst  = currentSalary > firstApron;
  const isOverSecond = currentSalary > secondApron;
  // Veteran minimum exception: always signable under NBA soft cap unless at/over the 2nd apron hard cap
  const VET_MIN = 1_100_000;
  const canSignMin = !isOverSecond;

  const moratoriumActive = league.isOffseason && league.offseasonDay < MORATORIUM_DAYS;
  const daysUntilOpen = league.isOffseason ? Math.max(0, MORATORIUM_DAYS - league.offseasonDay) : 0;
  const gamesPlayedSoFar = league.schedule.filter(g => g.played).length;
  // isPreseason: used only for the info banner — signing behavior is identical to in-season.
  const isPreseason = !league.isOffseason &&
    (league.seasonPhase === 'Preseason' || gamesPlayedSoFar === 0);
  // isInSeason: any active (non-offseason) phase including preseason.
  // Minimum contracts, waivers, and training-camp deals are open throughout preseason — no lock.
  const isInSeason = !league.isOffseason && league.seasonPhase !== 'Offseason';
  const gamesRemaining = league.schedule.filter(g => !g.played).length;

  // ── RFA offer-sheet generation (runs once per offseason when moratorium lifts) ──
  useEffect(() => {
    if (!league.isOffseason || moratoriumActive) return;

    const userRFAs = league.freeAgents.filter(
      p => p.faType === 'RFA' && p.lastTeamId === userTeam.id && !rfaOffersProcessed.current.has(p.id)
    );
    if (userRFAs.length === 0) return;

    const aiTeams = league.teams.filter(t => t.id !== league.userTeamId);
    const updatedFAs = league.freeAgents.map(p => {
      if (!userRFAs.find(r => r.id === p.id)) return p;
      rfaOffersProcessed.current.add(p.id);
      // 65% chance an AI team submits an offer sheet
      if (Math.random() >= 0.65) return { ...p, rfaOfferSheet: null };
      const offeringTeam = aiTeams[Math.floor(Math.random() * aiTeams.length)];
      const offerSalary = Math.round(
        computeDesiredSalary(p.rating) * (1.05 + Math.random() * 0.30) / 250_000
      ) * 250_000;
      const offerYears = 2 + Math.floor(Math.random() * 3);
      return {
        ...p,
        rfaOfferSheet: {
          salary: offerSalary,
          years: offerYears,
          offeringTeamId: offeringTeam?.id ?? '',
          offeringTeamName: offeringTeam?.name ?? 'Unknown Team',
        },
      };
    });
    updateLeague({ freeAgents: updatedFAs });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.isOffseason, moratoriumActive]);

  // ── Match RFA offer sheet (sign at exact terms) ──
  const handleMatchOffer = useCallback((player: Player) => {
    const sheet = player.rfaOfferSheet;
    if (!sheet) return;
    const maxRoster = league.settings.maxRosterSize ?? 15;
    if (userTeam.roster.length >= maxRoster) {
      alert(`Roster full (max ${maxRoster}). Release a player before matching.`);
      return;
    }
    const signedPlayer: Player = {
      ...player,
      isFreeAgent: false,
      salary: sheet.salary,
      contractYears: sheet.years,
      rfaOfferSheet: null,
      faType: undefined,
      morale: Math.min(100, (player.morale || 70) + 8),
    };
    const updatedTeams = league.teams.map(t =>
      t.id === userTeam.id ? { ...t, roster: [...t.roster, signedPlayer] } : t
    );
    const updatedFAs = league.freeAgents.filter(p => p.id !== player.id);
    const updatedTxs = recordTransaction(
      league, 'signing', [userTeam.id],
      `${userTeam.name} matched the offer sheet for RFA ${player.name} — ${sheet.years}y/${fmt(sheet.salary)}.`,
      [player.id], sheet.salary * sheet.years
    );
    updateLeague({
      teams: updatedTeams,
      freeAgents: updatedFAs,
      transactions: updatedTxs,
      newsFeed: [{
        id: `rfa-match-${Date.now()}`,
        category: 'transaction' as const,
        headline: `🔒 RFA MATCHED: ${player.name}`,
        content: `${userTeam.name} exercise their right of first refusal and match ${sheet.offeringTeamName}'s offer sheet for ${player.name}: ${sheet.years}yr / ${fmt(sheet.salary)}/yr.`,
        timestamp: league.currentDay, realTimestamp: Date.now(), isBreaking: true,
      }, ...league.newsFeed],
    });
  }, [league, userTeam, recordTransaction, updateLeague]);

  // ── Decline to match RFA offer (player signs with AI team) ──
  const handleDeclineMatch = useCallback((player: Player) => {
    const sheet = player.rfaOfferSheet;
    // Clear the offer sheet and convert to UFA (they walk)
    const updatedFAs = league.freeAgents.map(p =>
      p.id === player.id ? { ...p, rfaOfferSheet: null, faType: 'UFA' as const } : p
    );
    updateLeague({
      freeAgents: updatedFAs,
      newsFeed: [{
        id: `rfa-declined-${Date.now()}`,
        category: 'transaction' as const,
        headline: `🚪 RFA WALKS: ${player.name}`,
        content: `${userTeam.name} decline to match ${sheet?.offeringTeamName ?? 'an AI team'}'s offer for ${player.name}. He will sign elsewhere.`,
        timestamp: league.currentDay, realTimestamp: Date.now(), isBreaking: false,
      }, ...league.newsFeed],
    });
  }, [league, userTeam, updateLeague]);

  // ── In-season signing handler ──
  const handleInSeasonSign = (player: Player, contractType: InSeasonContractType, salary: number) => {
    // Enforce max roster size
    const maxRoster = league.settings.maxRosterSize ?? 15;
    if (userTeam.roster.length >= maxRoster) {
      alert(`Roster full (max ${maxRoster}). Release a player before signing.`);
      return;
    }
    // Acceptance model: cheaper deals are accepted more readily by lower-rated players
    const desired = computeDesiredSalary(player.rating);
    const ratio = salary / desired;
    let acceptBase = player.rating >= 85 ? 30 : player.rating >= 75 ? 55 : 75;
    if (contractType === 'full') acceptBase += 25;
    else if (contractType === 'minimum') acceptBase += 10;
    else if (contractType === 'rest-of-season') acceptBase += 5;
    // Stars resist 10-day deals
    if (contractType === '10day' && player.rating >= 78) acceptBase -= 30;
    const acceptChance = Math.min(90, Math.max(5, acceptBase + ratio * 20 + (player.interestScore ?? 50) * 0.2));
    const accepted = Math.random() * 100 < acceptChance;

    if (accepted) {
      const contractLabel =
        contractType === '10day' ? '10-day' :
        contractType === 'rest-of-season' ? 'rest-of-season minimum' :
        contractType === 'minimum' ? 'season minimum' : `${fmt(salary)}/yr`;
      const signedPlayer: Player = {
        ...player,
        isFreeAgent: false,
        inSeasonFA: false,
        salary,
        contractYears: 1,
        morale: Math.min(100, (player.morale || 70) + 8),
      };
      const updatedTeams = league.teams.map(t =>
        t.id === userTeam.id ? { ...t, roster: [...t.roster, signedPlayer] } : t
      );
      const updatedFAs = league.freeAgents.filter(p => p.id !== player.id);
      const updatedTxs = recordTransaction(
        league, 'signing', [userTeam.id],
        `${userTeam.name} signed ${signedPlayer.name} to a ${contractLabel} deal.`,
        [signedPlayer.id], salary
      );
      updateLeague({
        teams: updatedTeams,
        freeAgents: updatedFAs,
        transactions: updatedTxs,
        newsFeed: [{
          id: `in-season-user-sign-${Date.now()}`,
          category: 'transaction' as const,
          headline: `✍️ SIGNED: ${player.name} (${contractLabel})`,
          content: `The ${userTeam.name} signed ${player.name} (${player.position}, ${player.rating} OVR) to a ${contractLabel} deal worth ${fmt(salary)}.`,
          timestamp: league.currentDay,
          realTimestamp: Date.now(),
          isBreaking: false,
        }, ...league.newsFeed],
      });
      setInSeasonResult({ accepted: true, contractType: contractLabel, salary });
    } else {
      setInSeasonResult({ accepted: false, contractType: contractType, salary });
    }
  };

  // ── Filtered + sorted FA list ──
  const filteredFAs = useMemo(() => {
    let list = league.freeAgents.filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (posFilter !== 'ALL' && p.position !== posFilter) return false;
      if (interestFilter !== 'ALL') {
        const score = p.interestScore ?? 50;
        if (interestFilter === 'High' && score < 70) return false;
        if (interestFilter === 'Med' && (score < 40 || score >= 70)) return false;
        if (interestFilter === 'Low' && score >= 40) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      // In-season: float waived players to top
      if (isInSeason) {
        if (a.inSeasonFA && !b.inSeasonFA) return -1;
        if (!a.inSeasonFA && b.inSeasonFA) return 1;
      }
      let av = 0, bv = 0;
      if (sortKey === 'rating') { av = a.rating; bv = b.rating; }
      else if (sortKey === 'age') { av = a.age; bv = b.age; }
      else if (sortKey === 'interest') { av = a.interestScore ?? 50; bv = b.interestScore ?? 50; }
      else if (sortKey === 'salary') { av = getDesired(a).salary; bv = getDesired(b).salary; }
      else if (sortKey === 'name') { av = 0; bv = a.name < b.name ? 1 : -1; }
      return sortAsc ? av - bv : bv - av;
    });

    return list;
  }, [league.freeAgents, search, posFilter, interestFilter, sortKey, sortAsc]);

  // ── Upcoming free agents (contractYears === 1 on any roster) ──
  const upcomingFAs = useMemo(() => {
    const teamById = Object.fromEntries(league.teams.map(t => [t.id, t]));
    const list: (Player & { teamName: string; teamAbbr: string })[] = [];
    league.teams.forEach(team => {
      team.roster.forEach(p => {
        if ((p.contractYears ?? 0) === 1) {
          list.push({ ...p, teamName: team.name, teamAbbr: team.abbreviation });
        }
      });
    });
    return list
      .filter(p => {
        if (upcomingSearch && !p.name.toLowerCase().includes(upcomingSearch.toLowerCase()) &&
            !p.teamName.toLowerCase().includes(upcomingSearch.toLowerCase())) return false;
        if (upcomingPos !== 'ALL' && p.position !== upcomingPos) return false;
        return true;
      })
      .sort((a, b) => b.rating - a.rating);
  }, [league.teams, upcomingSearch, upcomingPos]);

  // ── Open negotiation ──
  const openNegotiation = (player: Player) => {
    const maxRoster = league.settings.maxRosterSize ?? 15;
    if (userTeam.roster.length >= maxRoster) {
      alert(`Roster full (max ${maxRoster}). Release a player before signing.`);
      return;
    }
    const desired = getDesired(player);
    setNegotiatingPlayer(player);
    setOffer({
      years: desired.years,
      salary: desired.salary,
      hasPlayerOption: false,
      hasNoTradeClause: false,
    });
    setNegotiationResult(null);
    setAgentMessage('');
    setCounterOffer(null);
  };

  // ── Submit offer logic ──
  const submitOffer = useCallback(async () => {
    if (!negotiatingPlayer) return;
    setIsSubmitting(true);
    setNegotiationResult(null);

    const desired = getDesired(negotiatingPlayer);
    const interest = negotiatingPlayer.interestScore ?? 50;
    const salaryRatio = offer.salary / desired.salary;
    const yearDelta = offer.years - desired.years;

    // Acceptance probability model
    let acceptChance =
      (salaryRatio - 1) * 80 +       // +80% pts per extra 100% above ask
      interest * 0.35 +               // interest baseline (max ~35)
      yearDelta * 8 +                 // extra years help
      (offer.hasPlayerOption ? 6 : 0) +
      (offer.hasNoTradeClause ? 4 : 0);

    // Personality trait adjustments
    if (negotiatingPlayer.personalityTraits?.includes('Money Hungry')) acceptChance += salaryRatio >= 1.1 ? 15 : -15;
    if (negotiatingPlayer.personalityTraits?.includes('Loyal')) acceptChance += 10;
    if (negotiatingPlayer.personalityTraits?.includes('Diva/Star')) acceptChance -= 5;

    const accepted = Math.random() * 100 < Math.min(92, Math.max(5, acceptChance));

    // Simulate slight delay for UX
    await new Promise(r => setTimeout(r, 900));

    if (accepted) {
      const signedPlayer: Player = {
        ...negotiatingPlayer,
        isFreeAgent: false,
        salary: offer.salary,
        contractYears: Math.min(offer.years, league.settings.maxContractYears ?? 5),
        morale: Math.min(100, (negotiatingPlayer.morale || 80) + 10),
        rfaOfferSheet: null,
        faType: undefined,
      };

      const updatedTeams = league.teams.map(t =>
        t.id === userTeam.id ? { ...t, roster: [...t.roster, signedPlayer] } : t
      );
      const updatedFAs = league.freeAgents.filter(p => p.id !== negotiatingPlayer.id);
      const updatedTxs = recordTransaction(
        league, 'signing', [userTeam.id],
        `${userTeam.name} signed ${signedPlayer.name} to a ${offer.years}y/${fmt(offer.salary)} contract.`,
        [signedPlayer.id], offer.salary * offer.years
      );

      const newsItem = {
        id: `fa-sign-${Date.now()}`,
        category: 'transaction' as const,
        headline: `✍️ SIGNED: ${negotiatingPlayer.name}`,
        content: `The ${userTeam.name} have agreed to terms with ${negotiatingPlayer.name} on a ${offer.years}-year, ${fmt(offer.salary)}/yr deal.`,
        timestamp: league.currentDay,
        realTimestamp: Date.now(),
        isBreaking: false,
      };

      updateLeague({
        teams: updatedTeams,
        freeAgents: updatedFAs,
        transactions: updatedTxs,
        newsFeed: [newsItem, ...league.newsFeed],
      });

      setNegotiationResult('accepted');
      setAgentMessage(`We're thrilled to join the ${userTeam.name}. This is the right fit for us.`);
    } else if (salaryRatio < 0.75 || (salaryRatio < 0.9 && interest < 45)) {
      // Flat decline
      setNegotiationResult('declined');
      const msgs = [
        `My client has better offers on the table. We'll have to pass.`,
        `The numbers don't work for us. Thanks for your interest.`,
        `We expected more from an organization like yours. We'll explore other options.`,
      ];
      setAgentMessage(msgs[Math.floor(Math.random() * msgs.length)]);
    } else {
      // Counter-offer
      const cYears = salaryRatio < 0.9 ? desired.years : offer.years;
      const cSalary = Math.round((desired.salary * (0.95 + Math.random() * 0.1)) / 250_000) * 250_000;
      setCounterOffer({ years: cYears, salary: cSalary });
      setNegotiationResult('counter');
      setAgentMessage(
        `We appreciate the offer, but my client is looking for ${cYears}y at ${fmt(cSalary)}/yr. Can you meet us there?`
      );
    }

    setIsSubmitting(false);
  }, [negotiatingPlayer, offer, league, userTeam, recordTransaction, updateLeague]);

  // ── Accept counter-offer ──
  const acceptCounter = () => {
    if (!negotiatingPlayer || !counterOffer) return;
    const acceptedOffer: ContractOffer = {
      ...offer,
      years: counterOffer.years,
      salary: counterOffer.salary,
    };

    const signedPlayer: Player = {
      ...negotiatingPlayer,
      isFreeAgent: false,
      salary: acceptedOffer.salary,
      contractYears: acceptedOffer.years,
      morale: Math.min(100, (negotiatingPlayer.morale || 80) + 5),
      rfaOfferSheet: null,
      faType: undefined,
    };

    const updatedTeams = league.teams.map(t =>
      t.id === userTeam.id ? { ...t, roster: [...t.roster, signedPlayer] } : t
    );
    const updatedFAs = league.freeAgents.filter(p => p.id !== negotiatingPlayer.id);
    const updatedTxs = recordTransaction(
      league, 'signing', [userTeam.id],
      `${userTeam.name} signed ${signedPlayer.name} to a ${acceptedOffer.years}y/${fmt(acceptedOffer.salary)} contract.`,
      [signedPlayer.id], acceptedOffer.salary * acceptedOffer.years
    );

    const newsItem = {
      id: `fa-sign-${Date.now()}`,
      category: 'transaction' as const,
      headline: `✍️ SIGNED: ${negotiatingPlayer.name}`,
      content: `The ${userTeam.name} agreed to a counter-offer from ${negotiatingPlayer.name}: ${acceptedOffer.years}yr/${fmt(acceptedOffer.salary)}/yr.`,
      timestamp: league.currentDay,
      realTimestamp: Date.now(),
      isBreaking: false,
    };

    updateLeague({
      teams: updatedTeams,
      freeAgents: updatedFAs,
      transactions: updatedTxs,
      newsFeed: [newsItem, ...league.newsFeed],
    });

    setNegotiationResult('accepted');
    setAgentMessage(`Deal done. We look forward to winning with the ${userTeam.name}.`);
    setCounterOffer(null);
  };

  // ── Advance Day / AI signings ──
  const advanceDay = () => {
    // Lock all FA activity until the draft is fully complete
    if (league.draftPhase !== 'completed') return;

    let updatedFAs = [...league.freeAgents];
    const newNews: typeof league.newsFeed = [];
    const newTxs: Transaction[] = [];
    const aiTeams = league.teams.filter(t => t.id !== league.userTeamId);
    const nextDay = league.offseasonDay + 1;

    // Announce when moratorium lifts
    if (league.offseasonDay < MORATORIUM_DAYS && nextDay >= MORATORIUM_DAYS) {
      newNews.push({
        id: `fa-open-${Date.now()}`,
        category: 'transaction',
        headline: '🟢 Free Agency is Now Open!',
        content: 'The moratorium has ended. Teams can now officially sign free agents.',
        timestamp: league.currentDay,
        realTimestamp: Date.now(),
        isBreaking: true,
      });
    }

    // No AI signings during moratorium
    const signingsCount = nextDay <= MORATORIUM_DAYS
      ? 0
      : Math.min(AI_SIGNINGS_PER_DAY + Math.floor(Math.random() * 3), updatedFAs.length);

    for (let i = 0; i < signingsCount; i++) {
      if (updatedFAs.length === 0) break;
      // Weight toward better players early in FA
      const maxIdx = Math.min(Math.floor(updatedFAs.length * 0.4) + 3, updatedFAs.length - 1);
      const idx = Math.floor(Math.random() * (maxIdx + 1));
      const player = updatedFAs.splice(idx, 1)[0];
      const team = aiTeams[Math.floor(Math.random() * aiTeams.length)];
      if (!team) continue;

      const desired = getDesired(player);
      const years = desired.years + (Math.random() < 0.3 ? 1 : 0);
      const salaryMult = 0.85 + Math.random() * 0.3;
      const aiCapLine = league.settings.salaryCap || 140_000_000;
      const teamSalary = team.roster.reduce((s, p) => s + (p.salary || 0), 0);
      const teamCapSpace = aiCapLine - teamSalary;
      const aiSecondApron = aiCapLine + 68_000_000;
      // Hard cap check: teams at/over second apron cannot sign anyone
      if (teamSalary >= aiSecondApron) continue;
      const rawSalary = Math.round((desired.salary * salaryMult) / 250_000) * 250_000;
      // Soft cap: over cap but under 2nd apron → minimum only; otherwise use cap space
      const salary = teamCapSpace >= rawSalary
        ? rawSalary                                          // has full space
        : teamCapSpace > 0
          ? Math.max(1_100_000, teamCapSpace)               // partial space: use what's available
          : 1_100_000;                                       // over soft cap: veteran minimum only

      const totalValue = salary * years;
      const tx: Transaction = {
        id: `tx-ai-${Date.now()}-${i}`,
        type: 'signing',
        timestamp: league.currentDay,
        realTimestamp: Date.now() + i,
        teamIds: [team.id],
        playerIds: [player.id],
        description: `${team.name} agree to terms with ${player.name} on a ${years}-year, $${(totalValue / 1_000_000).toFixed(1)}M deal.`,
        value: totalValue,
      };
      newTxs.push(tx);

      newNews.push({
        id: `fa-ai-${Date.now()}-${i}`,
        category: 'transaction',
        headline: `${player.name} agrees to terms with ${team.name}`,
        content: `The ${team.name} agree to terms with ${player.name} (${player.position}, ${player.rating} OVR) on a ${years}-year, $${(totalValue / 1_000_000).toFixed(1)}M deal (${fmt(salary)}/yr).`,
        timestamp: league.currentDay,
        realTimestamp: Date.now() + i,
        teamId: team.id,
        playerId: player.id,
        isBreaking: false,
      });
    }

    updateLeague({
      freeAgents: updatedFAs,
      offseasonDay: nextDay,
      newsFeed: [...newNews, ...league.newsFeed],
      transactions: [...newTxs, ...(league.transactions || [])].slice(0, 1000),
    });
  };

  // ── Sort toggle ──
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortBtn: React.FC<{ k: SortKey; label: string }> = ({ k, label }) => (
    <button
      onClick={() => toggleSort(k)}
      className={`text-[10px] font-black uppercase px-2 py-1 rounded transition-colors ${
        sortKey === k ? 'text-amber-500' : 'text-slate-600 hover:text-slate-400'
      }`}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </button>
  );

  const positions: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-40">

      {/* ── In-Season / Preseason Signing Banner ── */}
      {isInSeason && !isPreseason && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-[2rem] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-400 mb-1">
              🟠 In-Season FA Market
            </p>
            <h3 className="text-xl font-display font-bold text-white uppercase">
              Waiver Wire &amp; Buyouts Open
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Sign waived or buyout players on 10-day contracts, rest-of-season minimums, or season minimums. No moratorium.
            </p>
          </div>
          <div className="shrink-0 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Games Left</p>
            <p className="text-4xl font-display font-black text-orange-400">{gamesRemaining}</p>
          </div>
        </div>
      )}

      {/* ── Preseason Banner ── */}
      {isPreseason && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-[2rem] p-5 flex items-center gap-5">
          <div className="text-3xl shrink-0">🏕️</div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-sky-400 mb-0.5">Training Camp</p>
            <h3 className="text-lg font-display font-bold text-white uppercase">Minimum contracts &amp; waivers available now</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Sign players to 10-day, rest-of-season, or veteran minimum deals during preseason.
              Full unrestricted free agency opens at the start of the regular season.
            </p>
          </div>
        </div>
      )}

      {/* ── Draft Lock Banner ── */}
      {league.isOffseason && league.draftPhase !== 'completed' && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-[2rem] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-violet-400 mb-1">
              🚫 Draft In Progress
            </p>
            <h3 className="text-xl font-display font-bold text-white uppercase">
              Free Agency Locked Until Draft Completes
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              No signings or roster moves are allowed until all draft rounds are finished. Head to Draft HQ to complete the draft.
            </p>
          </div>
          <div className="shrink-0">
            <span className="px-5 py-3 bg-violet-500/20 border border-violet-500/40 rounded-xl text-violet-300 font-bold text-sm uppercase tracking-wider">
              {league.draftPhase === 'lottery' ? 'Lottery Phase' : league.draftPhase === 'draft' ? 'Live Draft' : 'Scouting Phase'}
            </span>
          </div>
        </div>
      )}

      {/* ── Moratorium Banner ── */}
      {!isInSeason && !isPreseason && moratoriumActive && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-[2rem] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-1">
              🔒 Moratorium in Effect
            </p>
            <h3 className="text-xl font-display font-bold text-white uppercase">
              {daysUntilOpen > 0
                ? `Signings open in ${daysUntilOpen} day${daysUntilOpen !== 1 ? 's' : ''}`
                : 'Free Agency is open'}
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Teams may negotiate but cannot officially sign players yet. Use Advance Day to progress.
            </p>
          </div>
          <div className="shrink-0 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Moratorium Day</p>
            <p className="text-4xl font-display font-black text-amber-500">
              {league.offseasonDay}<span className="text-slate-600 text-xl">/{MORATORIUM_DAYS}</span>
            </p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className={`absolute top-0 right-0 w-80 h-80 blur-[100px] rounded-full -mr-40 -mt-40 ${isPreseason ? 'bg-sky-500/5' : isInSeason ? 'bg-orange-500/5' : 'bg-emerald-500/5'}`} />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white mb-1">
              {isPreseason
                ? <>Training <span className="text-sky-400">Camp</span></>
                : isInSeason
                  ? <>Waiver <span className="text-orange-400">Wire</span></>
                  : <>Free Agency <span className="text-emerald-400">Hub</span></>}
            </h2>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
              {isInSeason
                ? isPreseason
                  ? <span className="text-sky-400">🏕 Training Camp — Min Signings Open</span>
                  : <span className="text-orange-400">🟠 In-Season Signings Open</span>
                : moratoriumActive
                  ? <span className="text-amber-500">🔒 Moratorium Active</span>
                  : <span className="text-emerald-400">🟢 Signings Open — Day {league.offseasonDay}</span>
              }
              <span className="ml-3 text-slate-700">·</span>
              <span className="ml-3 text-slate-500">
                {isInSeason && !isPreseason
                  ? `${filteredFAs.filter(p => p.inSeasonFA).length} waived · ${filteredFAs.filter(p => !p.inSeasonFA).length} free agents`
                  : `${filteredFAs.length} players available`}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Cap Space */}
            <div className={`px-5 py-3 rounded-2xl border text-center min-w-[110px] ${
              isOverSecond ? 'bg-rose-900/30 border-rose-600/40' : isOverCap ? 'bg-rose-900/20 border-rose-500/30' : 'bg-slate-950/50 border-slate-800'
            }`}>
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">Cap Space</p>
              <p className={`text-xl font-display font-bold ${isOverCap ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isOverCap ? '-' : ''}{fmt(Math.abs(capSpace))}
              </p>
              {isOverSecond ? (
                <p className="text-[9px] text-rose-400 font-bold uppercase mt-0.5">Hard cap — no moves</p>
              ) : isOverCap && canSignMin ? (
                <p className="text-[9px] text-amber-400/80 font-bold uppercase mt-0.5">Min contracts available</p>
              ) : null}
            </div>

            {/* Luxury tax indicator */}
            {currentSalary > salaryCap * 0.9 && (
              <div className={`px-5 py-3 rounded-2xl border text-center min-w-[110px] ${
                isOverLux ? 'bg-rose-900/20 border-rose-500/30' : 'bg-amber-900/20 border-amber-500/30'
              }`}>
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">
                  {isOverLux ? 'Luxury Tax' : 'Lux. Line'}
                </p>
                <p className={`text-xl font-display font-bold ${isOverLux ? 'text-rose-400' : 'text-amber-400'}`}>
                  {isOverLux ? '+' : ''}{fmt(Math.abs(currentSalary - luxuryTax))}
                </p>
              </div>
            )}

            {/* Current payroll */}
            <div className="bg-slate-950/50 px-5 py-3 rounded-2xl border border-slate-800 text-center min-w-[110px]">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">Payroll</p>
              <p className="text-xl font-display font-bold text-slate-300">{fmt(currentSalary)}</p>
            </div>

            {/* Advance Day — offseason only (moratorium phase) */}
            {league.isOffseason && (
              <button
                onClick={advanceDay}
                disabled={league.draftPhase !== 'completed'}
                className="px-7 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold uppercase rounded-xl transition-all shadow-xl shadow-amber-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-500"
              >
                Advance Day →
              </button>
            )}
          </div>
        </div>

        {/* Payroll bar */}
        <div className="relative z-10 mt-5">
          <div className="flex justify-between text-[10px] text-slate-600 font-bold uppercase mb-1">
            <span>Payroll</span>
            <span className={isOverSecond ? 'text-rose-400' : isOverFirst ? 'text-orange-400' : isOverCap ? 'text-amber-400' : 'text-slate-500'}>
              {fmt(currentSalary)} / {fmt(salaryCap)} cap
              {isOverSecond ? ' · ⚠ 2ND APRON' : isOverFirst ? ' · 1ST APRON' : isOverLux ? ' · LUX TAX' : ''}
            </span>
          </div>
          {/* Bar scales to secondApron as 100% */}
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                isOverSecond ? 'bg-rose-600' : isOverFirst ? 'bg-orange-500' : isOverLux ? 'bg-amber-500' : isOverCap ? 'bg-orange-400' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (currentSalary / secondApron) * 100)}%` }}
            />
          </div>
          {/* Cap / lux / first-apron / second-apron tick marks */}
          <div className="relative h-3">
            {[
              { val: salaryCap,   label: 'Cap',      color: 'bg-slate-500/70' },
              { val: luxuryTax,   label: 'Tax',      color: 'bg-amber-500/60' },
              { val: firstApron,  label: '1st',      color: 'bg-orange-500/60' },
              { val: secondApron, label: '2nd',      color: 'bg-rose-500/60'   },
            ].map(({ val, label, color }) => {
              const pct = Math.min(99, (val / secondApron) * 100);
              return (
                <div key={label} className="absolute top-0 flex flex-col items-center" style={{ left: `${pct}%` }}>
                  <div className={`w-0.5 h-2 ${color}`} />
                  <span className={`text-[8px] font-black uppercase tracking-wide -translate-x-1/2 ${color.replace('bg-', 'text-').replace('/60', '/80').replace('/70', '/80')}`}>{label}</span>
                </div>
              );
            })}
          </div>
          {/* Second-apron hard-stop warning */}
          {isOverSecond && (
            <p className="mt-1 text-[10px] font-bold text-rose-400 uppercase tracking-wide">
              ⚠ Second Apron — roster moves severely restricted. Waive players to regain flexibility.
            </p>
          )}
        </div>
      </header>

      {/* ── Filters ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search players…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          {/* Position */}
          <select
            value={posFilter}
            onChange={e => setPosFilter(e.target.value as Position | 'ALL')}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="ALL">All Positions</option>
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Interest */}
          <select
            value={interestFilter}
            onChange={e => setInterestFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
          >
            <option value="ALL">All Interest</option>
            <option value="High">High Interest</option>
            <option value="Med">Medium Interest</option>
            <option value="Low">Low Interest</option>
          </select>

          {/* Sort pills */}
          <div className="flex items-center gap-1 bg-slate-950/60 rounded-xl border border-slate-800 px-2 py-1">
            <span className="text-[10px] text-slate-600 font-bold uppercase mr-1">Sort:</span>
            <SortBtn k="rating" label="OVR" />
            <SortBtn k="age" label="Age" />
            <SortBtn k="interest" label="Interest" />
            <SortBtn k="salary" label="$" />
          </div>
        </div>
      </div>

      {/* ── Market Tab Switcher ── */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1 w-fit">
        <button
          onClick={() => setMarketTab('available')}
          className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            marketTab === 'available' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-white'
          }`}
        >
          Free Agents
          <span className={`ml-2 text-[10px] font-bold ${marketTab === 'available' ? 'text-slate-900' : 'text-slate-600'}`}>
            {league.freeAgents.length}
          </span>
        </button>
        <button
          onClick={() => setMarketTab('upcoming')}
          className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            marketTab === 'upcoming' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-white'
          }`}
        >
          Upcoming FAs
          <span className={`ml-2 text-[10px] font-bold ${marketTab === 'upcoming' ? 'text-slate-900' : 'text-slate-600'}`}>
            {league.teams.reduce((n, t) => n + t.roster.filter(p => (p.contractYears ?? 0) === 1).length, 0)}
          </span>
        </button>
      </div>

      {/* ── Upcoming FAs Table ── */}
      {marketTab === 'upcoming' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Upcoming Free Agents</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 font-bold uppercase">Players on expiring contracts — eligible for FA next offseason</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                <input
                  type="text"
                  placeholder="Search…"
                  value={upcomingSearch}
                  onChange={e => setUpcomingSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500/50 w-40"
                />
              </div>
              <select
                value={upcomingPos}
                onChange={e => setUpcomingPos(e.target.value as Position | 'ALL')}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">All Pos</option>
                {(['PG','SG','SF','PF','C'] as Position[]).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <span className="text-[10px] text-slate-600 font-bold uppercase">{upcomingFAs.length} players</span>
            </div>
          </div>

          {upcomingFAs.length === 0 ? (
            <div className="p-12 text-center text-slate-600 text-sm italic">No expiring contracts match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    <th className="px-5 py-4">Player</th>
                    <th className="px-4 py-4 text-center">OVR</th>
                    <th className="px-4 py-4 text-center">Age</th>
                    <th className="px-4 py-4">Pos</th>
                    <th className="px-4 py-4">Team</th>
                    <th className="px-4 py-4 text-right">Current $</th>
                    <th className="px-4 py-4 text-right">Est. Ask</th>
                    <th className="px-4 py-4 text-center hidden sm:table-cell">Yrs Wanted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {upcomingFAs.map(p => {
                    const isUserTeamPlayer = p.teamAbbr === userTeam.abbreviation;
                    const estAsk = computeDesiredSalary(p.rating);
                    const estYrs = computeDesiredYears(p.age, p.rating);
                    const canAfford = estAsk <= capSpace + (p.salary || 0);
                    return (
                      <tr
                        key={p.id}
                        className={`group hover:bg-slate-800/30 transition-all ${isUserTeamPlayer ? 'bg-amber-500/5' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-bold text-slate-200 uppercase tracking-tight group-hover:text-white">
                                {p.name}
                                {isUserTeamPlayer && (
                                  <span className="ml-2 text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 font-black uppercase">Your Team</span>
                                )}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{p.archetype ?? p.position}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`font-display font-black text-sm ${ratingColor(p.rating)}`}>{p.rating}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-sm font-bold ${p.age >= 33 ? 'text-rose-400' : p.age <= 24 ? 'text-emerald-400' : 'text-slate-300'}`}>{p.age}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-amber-500 font-black text-xs">{p.position}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-xs font-bold ${isUserTeamPlayer ? 'text-amber-400' : 'text-slate-400'}`}>{p.teamAbbr}</span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-slate-400 text-xs">{fmt(p.salary || 0)}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`font-mono text-xs font-bold ${canAfford ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(estAsk)}</span>
                        </td>
                        <td className="px-4 py-4 text-center hidden sm:table-cell">
                          <span className="text-slate-400 text-xs font-bold">{estYrs}yr{estYrs !== 1 ? 's' : ''}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RFA Offer Sheets ── */}
      {marketTab === 'available' && league.isOffseason && !moratoriumActive && (() => {
        const pendingOffers = league.freeAgents.filter(
          p => p.faType === 'RFA' && p.lastTeamId === userTeam.id && p.rfaOfferSheet
        );
        if (pendingOffers.length === 0) return null;
        return (
          <div className="bg-amber-500/5 border border-amber-500/25 rounded-3xl overflow-hidden shadow-xl">
            <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="text-amber-400 font-black uppercase text-xs tracking-[0.3em]">
                RFA Offer Sheets Pending — Right of First Refusal
              </h3>
            </div>
            <div className="divide-y divide-amber-500/10">
              {pendingOffers.map(p => {
                const sheet = p.rfaOfferSheet!;
                return (
                  <div key={p.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-white uppercase tracking-tight">{p.name}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${p.rating >= 88 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'}`}>
                          {p.rating} OVR
                        </span>
                        <span className="text-[10px] font-bold text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 uppercase">RFA</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        <span className="text-amber-300 font-black">{sheet.offeringTeamName}</span>
                        {' '}submitted an offer sheet:{' '}
                        <span className="text-white font-bold">{sheet.years}yr / {fmt(sheet.salary)}/yr</span>
                        <span className="text-slate-600 ml-2">· Total: {fmt(sheet.salary * sheet.years)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleMatchOffer(p)}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black uppercase rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                      >
                        ✓ Match Offer
                      </button>
                      <button
                        onClick={() => handleDeclineMatch(p)}
                        className="px-5 py-2.5 bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-[11px] font-black uppercase rounded-xl transition-all active:scale-95"
                      >
                        Let Walk
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── FA Table ── */}
      {marketTab === 'available' && (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">
            Available Players
          </h3>
          <span className="text-[10px] text-slate-600 font-bold uppercase">
            {filteredFAs.length} of {league.freeAgents.length}
          </span>
        </div>

        {filteredFAs.length === 0 ? (
          <div className="p-12 text-center text-slate-600 text-sm italic">
            No players match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  <th className="px-5 py-4">Player</th>
                  <th className="px-4 py-4 text-center">OVR</th>
                  <th className="px-4 py-4 text-center">Age</th>
                  <th className="px-5 py-4">Interest</th>
                  <th className="px-5 py-4">Asking</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredFAs.map(p => {
                  const interest = interestLabel(p.interestScore ?? 50);
                  const desired = getDesired(p);
                  // Full deal: needs actual cap space. Min deal: always OK under soft cap (unless 2nd apron)
                  const canSignFull = isInSeason
                    ? capSpace >= desired.salary * 0.8
                    : !moratoriumActive && capSpace >= desired.salary * 0.7;
                  const canSign = canSignFull || canSignMin; // min exception always opens the door
                  const minOnlyMode = !canSignFull && canSignMin; // over cap but minimum still available
                  // Re-sign context: player previously on this team
                  const isFormerPlayer = p.lastTeamId === userTeam.id;
                  // Low morale blocks re-signing (bad relationship with org)
                  const refuses = isFormerPlayer && (p.morale ?? 70) < 40;
                  return (
                    <tr
                      key={p.id}
                      className="group hover:bg-slate-800/30 transition-all cursor-pointer"
                      onClick={() => onScout(p)}
                    >
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => onScout(p)}
                          className="text-left"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-slate-200 uppercase tracking-tight hover:text-amber-500 transition-colors">
                              {p.name}
                            </p>
                            {p.faType === 'RFA' && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-400 uppercase tracking-wide">RFA</span>
                            )}
                          </div>
                          {/* Previous team badge */}
                          <p className="text-[11px] font-black uppercase tracking-wide mt-0.5">
                            {p.inSeasonFA ? (
                              <span className="text-orange-400">WAIVED</span>
                            ) : p.lastTeamId ? (
                              <span className={isFormerPlayer ? 'text-sky-400' : 'text-slate-400'}>{league.teams.find(t => t.id === p.lastTeamId)?.name ?? 'FA'}</span>
                            ) : (
                              <span className="text-slate-500">Unrestricted FA</span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-600 font-bold uppercase mt-0.5">
                            {p.position} · {getFlag(p.country)}{p.hometown}
                          </p>
                        </button>
                      </td>

                      <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <span className={`font-black text-sm ${ratingColor(p.rating)}`}>{p.rating}</span>
                        <span className="text-slate-700 text-[10px] mx-0.5">/</span>
                        <span className="text-slate-600 text-[10px] font-bold">{p.potential}</span>
                      </td>

                      <td className="px-4 py-4 text-center text-slate-400 font-bold">
                        {p.age}
                      </td>

                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 w-28">
                          <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${interest.bar}`}
                              style={{ width: `${p.interestScore ?? 50}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-black uppercase w-7 ${interest.color}`}>
                            {interest.text}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 font-mono text-slate-300">
                        <span className="font-bold">{desired.years}yr</span>
                        <span className="text-slate-600 mx-1">@</span>
                        <span className={desired.salary > capSpace ? 'text-rose-400' : 'text-slate-300'}>
                          {fmt(desired.salary)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                        {isInSeason ? (
                          <button
                            onClick={() => { setInSeasonPlayer(p); setInSeasonResult(null); }}
                            disabled={!canSignMin}
                            title={!canSignMin ? 'Over the second apron — no signings' : isOverCap ? 'Minimum contracts available' : undefined}
                            className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${
                              !canSignMin
                                ? 'bg-slate-800 text-slate-700 cursor-not-allowed'
                                : isOverCap
                                  ? 'bg-amber-900/30 hover:bg-amber-500 border border-amber-500/30 text-amber-400 hover:text-slate-950'
                                  : 'bg-slate-800 hover:bg-orange-500 text-slate-400 hover:text-slate-950'
                            }`}
                          >
                            {p.inSeasonFA ? '🟠 Waived' : 'Sign'}
                          </button>
                        ) : moratoriumActive ? (
                          <span className="text-[10px] text-slate-700 font-bold uppercase">Locked</span>
                        ) : refuses ? (
                          <span
                            className="text-[10px] text-rose-500/60 font-black uppercase cursor-not-allowed"
                            title="Player refuses to negotiate — low relationship with your organization"
                          >
                            Refuses
                          </span>
                        ) : (
                          <button
                            onClick={() => openNegotiation(p)}
                            disabled={!canSign}
                            title={!canSign ? 'Over the second apron hard cap — no new signings' : minOnlyMode ? 'Over cap — minimum contracts only' : undefined}
                            className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${
                              !canSign
                                ? 'bg-slate-800/50 text-slate-700 cursor-not-allowed'
                                : isFormerPlayer
                                  ? minOnlyMode
                                    ? 'bg-amber-900/30 hover:bg-amber-500 border border-amber-500/30 text-amber-400 hover:text-slate-950'
                                    : 'bg-sky-900/60 hover:bg-sky-500 border border-sky-500/40 text-sky-400 hover:text-slate-950'
                                  : minOnlyMode
                                    ? 'bg-amber-900/30 hover:bg-amber-500 border border-amber-500/30 text-amber-400 hover:text-slate-950'
                                    : 'bg-slate-800 hover:bg-emerald-500 text-slate-400 hover:text-slate-950'
                            }`}
                          >
                            {isFormerPlayer ? '↩ Re-sign' : minOnlyMode ? '⚠ Min Only' : 'Negotiate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ── In-Season Signing Modal ── */}
      {inSeasonPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) { setInSeasonPlayer(null); setInSeasonResult(null); }}}
        >
          <div className="bg-slate-900 border border-orange-500/20 rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">

            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-4">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.4em] mb-1 ${isPreseason ? 'text-sky-400' : 'text-orange-400'}`}>
                  {inSeasonPlayer.inSeasonFA ? '🟠 Waiver Claim' : isPreseason ? '🏕 Training Camp Signing' : 'In-Season Signing'}
                </p>
                <h2 className="text-2xl font-display font-black uppercase text-white">{inSeasonPlayer.name}</h2>
                <p className="text-sm text-slate-400 mt-1">
                  <span className={`font-bold ${isPreseason ? 'text-sky-400' : 'text-orange-400'}`}>{inSeasonPlayer.position}</span>
                  {' · '}{inSeasonPlayer.age} yrs · {inSeasonPlayer.rating} OVR
                </p>
              </div>
              <button
                onClick={() => { setInSeasonPlayer(null); setInSeasonResult(null); }}
                className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
              >✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Result */}
              {inSeasonResult && (
                <div className={`rounded-2xl p-4 text-center animate-in zoom-in-95 border ${
                  inSeasonResult.accepted
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-rose-500/10 border-rose-500/40'
                }`}>
                  <p className="text-2xl mb-1">{inSeasonResult.accepted ? '🤝' : '❌'}</p>
                  <p className={`font-black uppercase text-sm ${inSeasonResult.accepted ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {inSeasonResult.accepted ? 'Contract Agreed!' : 'Player Declined'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    {inSeasonResult.accepted
                      ? `${inSeasonPlayer.name} signed a ${inSeasonResult.contractType} deal for ${fmt(inSeasonResult.salary)}.`
                      : `${inSeasonPlayer.name} is looking for a better offer. Try a higher contract tier.`}
                  </p>
                  <button
                    onClick={() => { setInSeasonPlayer(null); setInSeasonResult(null); }}
                    className="mt-4 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-black uppercase text-sm rounded-xl"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Contract options */}
              {!inSeasonResult && (
                <>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Cap Space Available</p>
                      <p className={`text-lg font-bold ${capSpace < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {capSpace < 0 ? '-' : ''}{fmt(Math.abs(capSpace))}{capSpace < 0 ? ' over cap' : ''}
                      </p>
                      {isOverSecond ? (
                        <p className="text-[10px] text-rose-400 font-bold mt-0.5">⚠ 2nd apron — no signings</p>
                      ) : isOverCap ? (
                        <p className="text-[10px] text-amber-400 font-bold mt-0.5">Minimum contracts still available</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Games Remaining</p>
                      <p className="text-lg font-bold text-orange-400">{gamesRemaining}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Choose Contract Type</p>
                    {getInSeasonContracts(inSeasonPlayer.rating, gamesRemaining).map(contract => {
                      // 10-day, rest-of-season, and season-minimum are ALL minimum contracts.
                      // Under NBA soft cap rules, minimum contracts are ALWAYS signable unless
                      // the team is AT or ABOVE the 2nd apron hard cap.
                      // Only 'full' (market value) requires actual cap space.
                      const isMinContract = contract.type !== 'full';
                      const affordable = isMinContract ? canSignMin : contract.salary <= capSpace;
                      // Style: available min contract when over cap → amber (not green, not gray)
                      const btnClass = !affordable
                        ? 'bg-slate-950/30 border-slate-800/50 text-slate-700 cursor-not-allowed'
                        : isMinContract && isOverCap
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 hover:border-amber-500/50 text-amber-300 hover:text-amber-200'
                          : 'bg-slate-800/50 hover:bg-orange-500/10 border-slate-700 hover:border-orange-500/40 text-white hover:text-orange-300';
                      return (
                        <button
                          key={contract.type}
                          onClick={() => handleInSeasonSign(inSeasonPlayer, contract.type, contract.salary)}
                          disabled={!affordable}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${btnClass}`}
                        >
                          <div>
                            <p className="text-sm font-black uppercase">{contract.label}</p>
                            <p className="text-[10px] mt-0.5 opacity-60">
                              {contract.type === '10day' ? '10 game days · team option to convert' :
                               contract.type === 'rest-of-season' ? `${gamesRemaining} games remaining` :
                               contract.type === 'minimum' ? 'Full season minimum · soft cap exception' :
                               'Full market value · requires cap space'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-lg">{fmt(contract.salary)}</p>
                            {!affordable
                              ? <p className="text-[10px] text-rose-500">{isOverSecond ? 'Hard cap' : 'Needs cap space'}</p>
                              : isMinContract && isOverCap
                                ? <p className="text-[10px] text-amber-400/80">Min exception ✓</p>
                                : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-600 text-center">
                    Player acceptance varies by rating and contract value. Stars may decline short-term deals.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Negotiation Modal ── */}
      {negotiatingPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget && !isSubmitting) setNegotiatingPlayer(null); }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">

            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-1">Negotiating With</p>
                <h2 className="text-2xl font-display font-black uppercase text-white">{negotiatingPlayer.name}</h2>
                <p className="text-sm text-slate-400 mt-1">
                  <span className="text-amber-500 font-bold">{negotiatingPlayer.position}</span>
                  {' · '}{negotiatingPlayer.age} yrs · {negotiatingPlayer.rating} OVR
                  {' · '}{interestLabel(negotiatingPlayer.interestScore ?? 50).text} Interest
                </p>
              </div>
              {!isSubmitting && (
                <button
                  onClick={() => setNegotiatingPlayer(null)}
                  className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="p-6 space-y-5">
              {/* Result banner */}
              {negotiationResult === 'accepted' && (
                <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-2xl p-4 text-center animate-in zoom-in-95">
                  <p className="text-2xl mb-1">🤝</p>
                  <p className="text-emerald-400 font-black uppercase text-sm">Deal Agreed!</p>
                  <p className="text-slate-400 text-xs mt-1 italic">"{agentMessage}"</p>
                  <button
                    onClick={() => setNegotiatingPlayer(null)}
                    className="mt-4 px-6 py-2 bg-emerald-500 text-slate-950 font-black uppercase text-sm rounded-xl"
                  >
                    Done
                  </button>
                </div>
              )}

              {negotiationResult === 'declined' && (
                <div className="bg-rose-500/10 border border-rose-500/40 rounded-2xl p-4 text-center animate-in zoom-in-95">
                  <p className="text-2xl mb-1">❌</p>
                  <p className="text-rose-400 font-black uppercase text-sm">Offer Declined</p>
                  <p className="text-slate-400 text-xs mt-1 italic">"{agentMessage}"</p>
                </div>
              )}

              {negotiationResult === 'counter' && counterOffer && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 animate-in zoom-in-95">
                  <p className="text-[10px] font-black uppercase text-amber-500 mb-2 tracking-widest">Counter-Offer</p>
                  <p className="text-slate-300 text-sm italic mb-3">"{agentMessage}"</p>
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center flex-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Years</p>
                      <p className="text-xl font-bold text-white">{counterOffer.years}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center flex-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Per Year</p>
                      <p className="text-xl font-bold text-amber-400">{fmt(counterOffer.salary)}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center flex-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Total</p>
                      <p className="text-xl font-bold text-slate-300">{fmt(counterOffer.salary * counterOffer.years)}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={acceptCounter}
                      className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-sm rounded-xl transition-all"
                    >
                      Accept Counter
                    </button>
                    <button
                      onClick={() => { setNegotiationResult(null); setCounterOffer(null); }}
                      className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold uppercase text-sm rounded-xl transition-all"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Offer form — shown when no final result yet */}
              {negotiationResult !== 'accepted' && (
                <div className="space-y-4">
                  {/* Player's ask */}
                  <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Player's Ask</p>
                      <p className="text-base font-bold text-slate-300 mt-0.5">
                        {getDesired(negotiatingPlayer).years}yr · {fmt(getDesired(negotiatingPlayer).salary)}/yr
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Total Value</p>
                      <p className="text-base font-bold text-amber-500 mt-0.5">
                        {fmt(getDesired(negotiatingPlayer).salary * getDesired(negotiatingPlayer).years)}
                      </p>
                    </div>
                  </div>

                  {/* Offer inputs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-2">
                        Contract Length
                      </label>
                      <select
                        value={offer.years}
                        onChange={e => setOffer({ ...offer, years: parseInt(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                      >
                        {Array.from({ length: league.settings.maxContractYears ?? 5 }, (_, i) => i + 1).map(y => (
                          <option key={y} value={y}>{y} Year{y > 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-2">
                        Annual Salary
                      </label>
                      <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus-within:border-amber-500 transition-colors">
                        <span className="text-slate-500 font-bold mr-2 text-sm">$</span>
                        <input
                          type="number"
                          min={500_000}
                          step={250_000}
                          value={offer.salary}
                          onChange={e => setOffer({ ...offer, salary: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="bg-transparent text-white w-full focus:outline-none font-mono text-sm"
                        />
                      </div>
                      <p className="text-[10px] text-slate-600 mt-1">{fmtFull(offer.salary)}/yr · Total: {fmt(offer.salary * offer.years)}</p>
                    </div>
                  </div>

                  {/* Salary quick-set buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {[0.8, 0.9, 1.0, 1.1, 1.2].map(mult => {
                      const s = Math.round((getDesired(negotiatingPlayer).salary * mult) / 250_000) * 250_000;
                      return (
                        <button
                          key={mult}
                          onClick={() => setOffer({ ...offer, salary: s })}
                          className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg border transition-all ${
                            offer.salary === s
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                              : 'bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-600'
                          }`}
                        >
                          {mult === 1.0 ? 'Ask' : `${mult > 1 ? '+' : ''}${Math.round((mult - 1) * 100)}%`} · {fmt(s)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setOffer(o => ({ ...o, hasPlayerOption: !o.hasPlayerOption }))}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        offer.hasPlayerOption
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-[11px] font-bold">Player Option</span>
                      <span>{offer.hasPlayerOption ? '✓' : '+'}</span>
                    </button>
                    <button
                      onClick={() => setOffer(o => ({ ...o, hasNoTradeClause: !o.hasNoTradeClause }))}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        offer.hasNoTradeClause
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-[11px] font-bold">No-Trade Clause</span>
                      <span>{offer.hasNoTradeClause ? '✓' : '+'}</span>
                    </button>
                  </div>

                  {/* Cap warning — tiered by cap position */}
                  {offer.salary > capSpace && !isOverCap && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <span className="text-amber-400">⚠</span>
                      <p className="text-[11px] text-amber-400 font-bold">
                        This salary exceeds your cap space ({fmt(capSpace)} remaining). You'd need to cut players first.
                      </p>
                    </div>
                  )}
                  {isOverCap && !isOverSecond && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <span className="text-amber-400">⚠</span>
                      <p className="text-[11px] text-amber-400 font-bold">
                        Over cap — only minimum contracts ({fmt(VET_MIN)}/yr) are available. Larger deals require cap space or exceptions.
                      </p>
                    </div>
                  )}
                  {isOverSecond && (
                    <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                      <span className="text-rose-400">🚫</span>
                      <p className="text-[11px] text-rose-400 font-bold">
                        Second apron hard cap — no new contracts can be signed. Waive players to free up flexibility.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {negotiationResult !== 'accepted' && (
              <div className="p-4 border-t border-slate-800 flex gap-3">
                <button
                  onClick={() => setNegotiatingPlayer(null)}
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                {negotiationResult !== 'declined' && (
                  <button
                    onClick={submitOffer}
                    disabled={isSubmitting || offer.salary <= 0 || isOverSecond || (isOverCap && offer.salary > VET_MIN * 2)}
                    title={isOverSecond ? 'Hard cap — no signings' : (isOverCap && offer.salary > VET_MIN * 2) ? `Over cap — max offer is ${fmt(VET_MIN * 2)} (minimum exception)` : undefined}
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-display font-black uppercase text-sm rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Consulting Agent…
                      </span>
                    ) : isOverCap && offer.salary > VET_MIN * 2 ? 'Reduce to Min Contract' : 'Send Offer'}
                  </button>
                )}
                {negotiationResult === 'declined' && (
                  <button
                    onClick={() => setNegotiationResult(null)}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black uppercase text-sm rounded-xl transition-all active:scale-95"
                  >
                    Revise Offer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FreeAgency;
