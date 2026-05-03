/**
 * Determine whether a league uses single-year season labels.
 * Triggers: explicit singleYearSeason:true, women's league (playerGenderRatio===100), or pre-1950 start.
 */
export function isSingleYearSeason(settings?: {
  singleYearSeason?: boolean;
  playerGenderRatio?: number;
  startingYear?: number;
}): boolean {
  if (!settings) return false;
  if (settings.singleYearSeason === true) return true;
  if ((settings.playerGenderRatio ?? 0) === 100) return true;
  if (settings.startingYear !== undefined && settings.startingYear <= 1949) return true;
  return false;
}

/**
 * Format a season year for display.
 *   single-year mode → "1997 Season"  (WNBA, pre-1950, or explicit setting)
 *   split-year mode  → "2024–25 Season"  (standard NBA format)
 * Pass bare=true to omit the " Season" suffix.
 */
export function formatSeasonLabel(
  season: number,
  settings?: Parameters<typeof isSingleYearSeason>[0],
  bare = false
): string {
  const suffix = bare ? '' : ' Season';
  if (isSingleYearSeason(settings)) return `${season}${suffix}`;
  return `${season}–${String(season + 1).slice(-2)}${suffix}`;
}

/**
 * Format a dollar salary/amount:
 *   ≥ $1,000,000 → "$X.XXM"  (trailing zeros stripped: $26.8M, $1.45M, $26M)
 *   < $1,000,000 → "$XXXK"   (rounded to nearest $1K: $285K, $98K)
 */
export function fmtSalary(amount: number): string {
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const sign = neg ? '-' : '';
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}$${parseFloat(m.toFixed(2))}M`;
  }
  return `${sign}$${Math.round(abs / 1_000)}K`;
}
