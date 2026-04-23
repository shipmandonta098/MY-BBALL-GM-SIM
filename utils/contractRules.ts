import { LeagueState } from '../types';
import { fmtSalary } from './formatters';

export interface ContractRules {
  isWomens: boolean;
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
 * Men's (NBA) era tiers:
 *   1947–1959  max ~$12K–$15K   (pre-TV revenue)
 *   1960–1969  max ~$75K         (Russell/Chamberlain era)
 *   1970–1975  max ~$250K        (ABA/NBA rivalry)
 *   1976–1979  max ~$500K        (post-merger)
 *   1980–1983  max ~$900K        (pre-cap)
 *   1984        max ~$1.2M       (first team cap year)
 *   1985–1987  max ~$1.8M
 *   1988–1991  max ~$3M
 *   1992–1994  max ~$4.5M
 *   1995–1997  max ~$6.5M        (rookie scale introduced)
 *   1998–1999  max ~$9M          (max contracts introduced)
 *   2000–2004  max ~$12–15M
 *   2005–2010  max ~$15–19M
 *   2011–2015  max ~$19–21M
 *   2016        max ~$33M        (TV deal spike)
 *   2017–2022  max ~$33–38M
 *   2023–2025  max ~$48M         (new CBA)
 *   2026+       max ~$55M        (projected)
 */
export function computeMensMarketSalary(rating: number, year: number = 2026): number {
  let supermax: number, star: number, starter: number, role: number, bench: number, min: number;

  if (year >= 2026) {
    supermax = 55_000_000; star = 40_000_000; starter = 18_000_000; role = 7_000_000; bench = 2_500_000; min = 1_200_000;
  } else if (year >= 2023) {
    supermax = 48_000_000; star = 34_000_000; starter = 15_000_000; role = 6_500_000; bench = 2_500_000; min = 1_100_000;
  } else if (year >= 2019) {
    supermax = 38_000_000; star = 27_000_000; starter = 13_000_000; role = 5_500_000; bench = 2_000_000; min =   900_000;
  } else if (year >= 2016) {
    supermax = 33_000_000; star = 24_000_000; starter = 11_000_000; role = 4_500_000; bench = 1_500_000; min =   700_000;
  } else if (year >= 2014) {
    supermax = 21_000_000; star = 16_000_000; starter =  8_000_000; role = 3_200_000; bench = 1_100_000; min =   500_000;
  } else if (year >= 2008) {
    supermax = 19_000_000; star = 13_000_000; starter =  7_000_000; role = 3_000_000; bench = 1_000_000; min =   500_000;
  } else if (year >= 2005) {
    supermax = 15_000_000; star = 11_000_000; starter =  5_500_000; role = 2_500_000; bench =   850_000; min =   400_000;
  } else if (year >= 2000) {
    supermax = 12_000_000; star =  9_000_000; starter =  5_000_000; role = 2_000_000; bench =   700_000; min =   350_000;
  } else if (year >= 1998) {
    supermax =  9_000_000; star =  6_500_000; starter =  3_500_000; role = 1_200_000; bench =   450_000; min =   250_000;
  } else if (year >= 1995) {
    supermax =  6_500_000; star =  4_500_000; starter =  2_200_000; role =   750_000; bench =   275_000; min =   150_000;
  } else if (year >= 1992) {
    supermax =  4_500_000; star =  3_000_000; starter =  1_500_000; role =   550_000; bench =   200_000; min =   110_000;
  } else if (year >= 1988) {
    supermax =  3_000_000; star =  1_800_000; starter =    900_000; role =   350_000; bench =   130_000; min =    75_000;
  } else if (year >= 1985) {
    supermax =  1_800_000; star =  1_000_000; starter =    500_000; role =   180_000; bench =    75_000; min =    45_000;
  } else if (year >= 1984) {
    supermax =  1_200_000; star =    700_000; starter =    350_000; role =   130_000; bench =    60_000; min =    35_000;
  } else if (year >= 1980) {
    supermax =    900_000; star =    500_000; starter =    220_000; role =    85_000; bench =    38_000; min =    22_000;
  } else if (year >= 1976) {
    supermax =    500_000; star =    250_000; starter =    120_000; role =    50_000; bench =    22_000; min =    13_000;
  } else if (year >= 1970) {
    supermax =    250_000; star =    120_000; starter =     60_000; role =    25_000; bench =    11_000; min =     7_000;
  } else if (year >= 1960) {
    supermax =     75_000; star =     38_000; starter =     18_000; role =     8_000; bench =     4_000; min =     3_000;
  } else {
    // 1947–1959 inaugural NBA era
    supermax =     12_000; star =      8_000; starter =      5_000; role =     2_500; bench =     1_500; min =     1_000;
  }

  const base =
    rating >= 95 ? supermax :
    rating >= 88 ? star    + (rating - 88) * ((supermax - star)    / 7) :
    rating >= 80 ? starter + (rating - 80) * ((star    - starter)  / 8) :
    rating >= 70 ? role    + (rating - 70) * ((starter - role)     / 10) :
    rating >= 60 ? bench   + (rating - 60) * ((role    - bench)    / 10) :
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
