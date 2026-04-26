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
