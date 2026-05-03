import { LeagueState } from '../types';
import { fmtSalary } from './formatters';

export interface ContractRules {
  isWomens: boolean;
  /** True in Women's (WNBA) leagues — payroll cannot exceed the cap except for minimum contracts */
  isHardCap: boolean;
  salaryCap: number;
  maxPlayerSalary: number;
  minPlayerSalary: number;
  maxContractYears: number;
  maxSalaryLabel: string;
  minSalaryLabel: string;
  year: number;
}

/**
 * NBA-era market salary for a given player rating and league year.
 * No random variance — this is the "desired" / market floor value.
 *
 * Era supermax values (99+ OVR), from which all intermediate tiers
 * are derived via historically-consistent ratios:
 *
 *   1947–1959  supermax ~$12K      (inaugural NBA, pre-TV)
 *   1960–1969  supermax ~$75K      (Russell/Chamberlain era)
 *   1970–1975  supermax ~$250K     (ABA/NBA rivalry)
 *   1976–1979  supermax ~$500K     (post-merger)
 *   1980–1983  supermax ~$900K     (pre-cap)
 *   1984        supermax ~$1.2M    (first team salary cap)
 *   1985–1987  supermax ~$1.8M
 *   1988–1991  supermax ~$3M
 *   1992–1994  supermax ~$4.5M
 *   1995–1997  supermax ~$6.5M     (rookie scale introduced)
 *   1998–1999  supermax ~$9M       (max contracts introduced)
 *   2000–2004  supermax ~$12M
 *   2005–2007  supermax ~$15M
 *   2008–2013  supermax ~$19M
 *   2014–2015  supermax ~$21M
 *   2016–2018  supermax ~$33M      (TV deal spike)
 *   2019–2022  supermax ~$38M
 *   2023–2025  supermax ~$48M      (new CBA)
 *   2026+       supermax ~$55M     (projected)
 *
 * OVR tier breakpoints (all eras scale proportionally):
 *   OVR 95+  → supermax  ($55M in 2026)
 *   OVR 90   → ~72.7% of supermax  ($40M — max star)
 *   OVR 87   → ~45.5% of supermax  ($25M — all-star)
 *   OVR 84   → ~29.1% of supermax  ($16M — solid starter top)
 *   OVR 80   → ~16.4% of supermax  ($9M  — rotation starter)
 *   OVR 75   →  ~5.5% of supermax  ($3M  — bench / role)
 *   OVR ≤65  → explicit league min  ($1.2M in 2026)
 */
export function computeMensMarketSalary(rating: number, year: number = 2026): number {
  let supermax: number;
  let min: number; // explicit league minimum — not derived from ratio

  if (year >= 2026) {
    supermax = 55_000_000; min = 1_200_000;
  } else if (year >= 2023) {
    supermax = 48_000_000; min = 1_100_000;
  } else if (year >= 2019) {
    supermax = 38_000_000; min =   900_000;
  } else if (year >= 2016) {
    supermax = 33_000_000; min =   700_000;
  } else if (year >= 2014) {
    supermax = 21_000_000; min =   500_000;
  } else if (year >= 2008) {
    supermax = 19_000_000; min =   500_000;
  } else if (year >= 2005) {
    supermax = 15_000_000; min =   400_000;
  } else if (year >= 2000) {
    supermax = 12_000_000; min =   350_000;
  } else if (year >= 1998) {
    supermax =  9_000_000; min =   250_000;
  } else if (year >= 1995) {
    supermax =  6_500_000; min =   150_000;
  } else if (year >= 1992) {
    supermax =  4_500_000; min =   110_000;
  } else if (year >= 1988) {
    supermax =  3_000_000; min =    75_000;
  } else if (year >= 1985) {
    supermax =  1_800_000; min =    45_000;
  } else if (year >= 1984) {
    supermax =  1_200_000; min =    35_000;
  } else if (year >= 1980) {
    supermax =    900_000; min =    22_000;
  } else if (year >= 1976) {
    supermax =    500_000; min =    13_000;
  } else if (year >= 1970) {
    supermax =    250_000; min =     7_000;
  } else if (year >= 1960) {
    supermax =     75_000; min =     3_000;
  } else {
    supermax =     12_000; min =     1_000;
  }

  // ── Intermediate tiers derived from supermax (same ratios across all eras) ──
  // These match real NBA contract market values for each OVR tier:
  //   max_star  (90 OVR) ≈ $40M in 2026  — elite All-NBA player
  //   all_star  (87 OVR) ≈ $25M in 2026  — perennial All-Star
  //   starter_h (84 OVR) ≈ $16M in 2026  — quality starter
  //   starter_l (80 OVR) ≈  $9M in 2026  — rotation starter
  //   bench     (75 OVR) ≈  $3M in 2026  — bench / role player
  const maxStar   = supermax * 0.727; // 90 OVR
  const allStar   = supermax * 0.455; // 87 OVR
  const starterHi = supermax * 0.291; // 84 OVR
  const starterLo = supermax * 0.164; // 80 OVR
  const bench     = supermax * 0.055; // 75 OVR

  const base =
    rating >= 95 ? supermax :
    rating >= 90 ? maxStar   + (rating - 90) * ((supermax  - maxStar)   / 5) :
    rating >= 87 ? allStar   + (rating - 87) * ((maxStar   - allStar)   / 3) :
    rating >= 84 ? starterHi + (rating - 84) * ((allStar   - starterHi) / 3) :
    rating >= 80 ? starterLo + (rating - 80) * ((starterHi - starterLo) / 4) :
    rating >= 75 ? bench     + (rating - 75) * ((starterLo - bench)     / 5) :
    rating >= 65 ? min       + (rating - 65) * ((bench     - min)       / 10) :
    min;

  const unit =
    supermax >= 10_000_000 ? 250_000 :
    supermax >=  1_000_000 ?  50_000 :
    supermax >=    100_000 ?   5_000 :
    supermax >=     10_000 ?   1_000 : 100;

  return Math.round(base / unit) * unit;
}

export function getContractRules(league: LeagueState): ContractRules {
  const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;
  const year = league.season ?? 2026;
  const cap = league.settings.salaryCap || (isWomens ? 2_200_000 : 140_000_000);
  const maxPct = league.settings.maxPlayerSalaryPct ?? (isWomens ? 30 : 35);
  const computedMax = isWomens
    ? Math.round((cap * maxPct) / 100)
    : Math.min(computeMensMarketSalary(99, year), Math.round((cap * maxPct) / 100) || computeMensMarketSalary(99, year));
  const computedMin = isWomens
    ? Math.max(25_000, Math.round(cap * 0.012))
    : computeMensMarketSalary(55, year);
  const maxPlayerSalary = league.settings.maxContractSalary || computedMax;
  const minPlayerSalary = league.settings.minContractSalary || computedMin;
  const maxContractYears = league.settings.maxContractYears ?? (isWomens ? 4 : 5);

  return {
    isWomens,
    isHardCap: isWomens,
    salaryCap: cap,
    maxPlayerSalary,
    minPlayerSalary,
    maxContractYears,
    maxSalaryLabel: `Max: ${fmtSalary(maxPlayerSalary)}`,
    minSalaryLabel: `Min: ${fmtSalary(minPlayerSalary)}`,
    year,
  };
}

export function computeDesiredSalaryWithRules(rating: number, rules: ContractRules): number {
  const { isWomens, salaryCap: cap, minPlayerSalary, maxPlayerSalary, year } = rules;
  let base: number;
  if (isWomens) {
    if (rating >= 95)      base = cap * 0.30 + (rating - 95) * cap * 0.005;
    else if (rating >= 88) base = cap * 0.20 + (rating - 88) * cap * 0.014;
    else if (rating >= 80) base = cap * 0.10 + (rating - 80) * cap * 0.012;
    else if (rating >= 70) base = cap * 0.04 + (rating - 70) * cap * 0.006;
    else if (rating >= 60) base = cap * 0.02 + (rating - 60) * cap * 0.002;
    else                   base = minPlayerSalary;
    base = Math.round(base / 5_000) * 5_000;
  } else {
    base = computeMensMarketSalary(rating, year);
  }
  return Math.max(minPlayerSalary, Math.min(maxPlayerSalary, base));
}

export function computeRookieSalary(rating: number, round: number, rules: ContractRules): number {
  const { isWomens, salaryCap: cap, minPlayerSalary, maxPlayerSalary, year } = rules;
  let base: number;
  if (isWomens) {
    base = round === 1
      ? cap * 0.025 + (rating / 100) * cap * 0.015
      : cap * 0.015 + (rating / 100) * cap * 0.010;
    base = Math.round(base / 5_000) * 5_000;
  } else {
    // Rookie scale: ~22% of market for 1st round, ~10% for 2nd round (slot-controlled)
    const market = computeMensMarketSalary(rating, year);
    base = round === 1
      ? market * 0.22
      : market * 0.10;
    const unit =
      market >= 10_000_000 ? 250_000 :
      market >=  1_000_000 ?  50_000 :
      market >=    100_000 ?   5_000 : 1_000;
    base = Math.round(base / unit) * unit;
  }
  return Math.max(minPlayerSalary, Math.min(maxPlayerSalary, base));
}
