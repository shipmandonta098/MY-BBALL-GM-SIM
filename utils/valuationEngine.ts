import { Team } from '../types';

export interface ValuationBreakdown {
  revenue: number;     // % of positive-component total
  market: number;
  performance: number;
  starPower: number;
  brand: number;
}

export interface FranchiseValuation {
  value: number;           // dollars
  breakdown: ValuationBreakdown;
}

export interface ValuationContext {
  isWNBA: boolean;
  champCount: number;       // championships won by this franchise
  prevMadePlayoffs: boolean;
  seasonLength: number;
}

/**
 * Compute franchise market value based on current team state.
 *
 * Formula overview (all values in USD):
 *   total = marketBase + revenueComponent + performanceComponent
 *           + starPowerComponent + brandComponent
 *
 * NBA ranges: ~$700M (weak small-market) → $5B+ (dynasty large-market)
 * WNBA ranges: ~$40M → $900M+ (top team, large market, sell-outs, stars)
 */
export function calcFranchiseValuation(
  team: Team,
  ctx: ValuationContext,
): FranchiseValuation {
  const { isWNBA, champCount, prevMadePlayoffs, seasonLength } = ctx;

  // ── 1. Market base ────────────────────────────────────────────────────────
  // Anchored to realistic league valuations. WNBA ≈ 1/15th of NBA at each tier.
  const marketBase = isWNBA
    ? team.marketSize === 'Large'  ? 200_000_000
    : team.marketSize === 'Medium' ? 110_000_000
                                   :  55_000_000
    : team.marketSize === 'Large'  ? 2_900_000_000
    : team.marketSize === 'Medium' ? 1_600_000_000
                                   :   820_000_000;

  // Population premium: each million residents above/below 3M shifts by ±2% of base
  const population = team.population ?? (team.marketSize === 'Large' ? 7 : team.marketSize === 'Medium' ? 2.5 : 1);
  const popAdj = marketBase * Math.max(-0.20, Math.min(0.30, (population - 3) * 0.02));

  // ── 2. Revenue component ──────────────────────────────────────────────────
  const hype        = team.finances.fanHype ?? 60;
  const homeGames   = Math.max(20, Math.round(seasonLength * 0.5));
  const avgAtt      = Math.round(8_000 + (hype / 100) * 14_000);
  const ticketPx    = team.finances.ticketPrice ?? (isWNBA ? 40 : 85);
  const concPx      = team.finances.concessionPrice ?? 12;
  const gateRev     = homeGames * avgAtt * ticketPx;
  const concRev     = Math.round(homeGames * avgAtt * concPx * 0.4);
  const mediaDeal   = isWNBA ?  5_000_000 : 40_000_000;
  const sponsorRev  = Math.round(
    (isWNBA ? 1_000_000 : 8_000_000) + (hype / 100) * (isWNBA ? 4_000_000 : 15_000_000)
  );
  const projRevenue = gateRev + concRev + mediaDeal + sponsorRev;
  // Revenue-to-value multiple: sell-out teams command higher multiples (8–12× NBA, 6–10× WNBA)
  const capacity  = team.stadiumCapacity || (isWNBA ? 8_000 : 19_000);
  const fillRate  = Math.min(1, avgAtt / capacity);
  const revMult   = isWNBA ? 6 + fillRate * 4 : 8 + fillRate * 4;
  const revenueVal = projRevenue * revMult;

  // ── 3. Performance component ──────────────────────────────────────────────
  const totalG  = team.wins + team.losses;
  const winPct  = totalG > 0 ? team.wins / totalG : 0.5;
  // ±30% of base for perfect (1.000) or 0-win teams; neutral at .500
  const winAdj  = marketBase * 0.30 * ((winPct - 0.5) * 2);
  const champBonus   = champCount * (isWNBA ? 25_000_000 : 180_000_000);
  const playoffBonus = prevMadePlayoffs ? (isWNBA ? 10_000_000 : 50_000_000) : 0;
  const performanceVal = winAdj + champBonus + playoffBonus;

  // ── 4. Star power component ───────────────────────────────────────────────
  const elite = team.roster.filter(p => p.rating >= 90).length;
  const good  = team.roster.filter(p => p.rating >= 85 && p.rating < 90).length;
  const starBonus = elite * (isWNBA ? 40_000_000 : 220_000_000)
                  + good  * (isWNBA ? 12_000_000 :  65_000_000);
  const hypeBonus = (hype - 60) / 100 * marketBase * 0.12;
  const starPowerVal = starBonus + hypeBonus;

  // ── 5. Brand / momentum component ─────────────────────────────────────────
  const streak   = team.streak ?? 0;
  const streakVal = streak > 0
    ? Math.min(streak, 15) * (isWNBA ? 1_500_000 : 14_000_000)
    : Math.max(streak, -15) * (isWNBA ? 600_000 : 5_000_000); // negative for losing runs
  const legacyBonus = champCount > 0 ? marketBase * 0.05 * Math.min(champCount, 5) : 0;
  const brandVal = streakVal + legacyBonus;

  // ── Total ─────────────────────────────────────────────────────────────────
  const minVal = isWNBA ? 25_000_000 : 350_000_000;
  const total  = Math.max(minVal,
    marketBase + popAdj + revenueVal + performanceVal + starPowerVal + brandVal
  );

  // ── Breakdown (only positive contributions, for display clarity) ──────────
  const posMarket  = marketBase + Math.max(0, popAdj);
  const posRevenue = Math.max(0, revenueVal);
  const posPerf    = Math.max(0, performanceVal);
  const posStar    = Math.max(0, starPowerVal);
  const posBrand   = Math.max(0, brandVal);
  const posTotal   = posMarket + posRevenue + posPerf + posStar + posBrand || 1;

  const breakdown: ValuationBreakdown = {
    revenue:     Math.round(posRevenue / posTotal * 100),
    market:      Math.round(posMarket  / posTotal * 100),
    performance: Math.round(posPerf    / posTotal * 100),
    starPower:   Math.round(posStar    / posTotal * 100),
    brand:       Math.round(posBrand   / posTotal * 100),
  };

  return { value: Math.round(total), breakdown };
}

/** Format a valuation dollar amount as "$1.2B", "$850M", "$42M", etc. */
export function fmtValuation(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${Math.round(v / 1_000_000)}M`;
  return `$${Math.round(v / 1_000)}K`;
}

/** Format a valuation delta as "+$120M" or "-$45M". */
export function fmtValuationDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '–';
  const abs  = Math.abs(delta);
  return `${sign}${fmtValuation(abs)}`;
}
