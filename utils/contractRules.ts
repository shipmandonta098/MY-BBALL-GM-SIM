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
}

export function getContractRules(league: LeagueState): ContractRules {
  const isWomens = (league.settings.playerGenderRatio ?? 0) === 100;
  const cap = league.settings.salaryCap || (isWomens ? 2_200_000 : 140_000_000);
  const maxPct = league.settings.maxPlayerSalaryPct ?? (isWomens ? 30 : 35);
  const maxPlayerSalary = Math.round((cap * maxPct) / 100);
  const minPlayerSalary = isWomens
    ? Math.max(25_000, Math.round(cap * 0.012))
    : 1_100_000;
  const maxContractYears = league.settings.maxContractYears ?? (isWomens ? 4 : 5);

  return {
    isWomens,
    salaryCap: cap,
    maxPlayerSalary,
    minPlayerSalary,
    maxContractYears,
    maxSalaryLabel: `Max: ${fmtSalary(maxPlayerSalary)}`,
    minSalaryLabel: `Min: ${fmtSalary(minPlayerSalary)}`,
  };
}

export function computeDesiredSalaryWithRules(rating: number, rules: ContractRules): number {
  const { isWomens, salaryCap: cap, minPlayerSalary, maxPlayerSalary } = rules;
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
    if (rating >= 95)      base = 35_000_000 + (rating - 95) * 1_750_000;
    else if (rating >= 88) base = 18_000_000 + (rating - 88) * 2_428_571;
    else if (rating >= 80) base = 8_500_000  + (rating - 80) * 1_187_500;
    else if (rating >= 70) base = 3_500_000  + (rating - 70) * 500_000;
    else if (rating >= 60) base = 1_500_000  + (rating - 60) * 200_000;
    else                   base = minPlayerSalary;
    base = Math.round(base / 250_000) * 250_000;
  }
  return Math.max(minPlayerSalary, Math.min(maxPlayerSalary, base));
}

export function computeRookieSalary(rating: number, round: number, rules: ContractRules): number {
  const { isWomens, salaryCap: cap, minPlayerSalary, maxPlayerSalary } = rules;
  let base: number;
  if (isWomens) {
    base = round === 1
      ? cap * 0.025 + (rating / 100) * cap * 0.015
      : cap * 0.015 + (rating / 100) * cap * 0.010;
    base = Math.round(base / 5_000) * 5_000;
  } else {
    base = round === 1
      ? cap * 0.02 + (rating / 100) * cap * 0.06
      : cap * 0.015;
    base = Math.round(base / 250_000) * 250_000;
  }
  return Math.max(minPlayerSalary, Math.min(maxPlayerSalary, base));
}
