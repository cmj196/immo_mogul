// Banks: lending value, equity floor, amortisation, the affordability test, quotes, loan servicing,
// rate resets and the annual review.
//
// Affordability (assumption, see rules): a combined household test. Income = gross salary plus a
// share of gross rents (the new lot's in-place rents included). Costs = imputed interest on every
// loan plus required amortisation plus upkeep at 1% of every property's value. Costs / income must
// stay under the bank's cap.

import { BANKS, PRODUCTS } from '../data/banks.js';
import { rule } from '../data/rules.js';
import { stream } from './rng.js';
import { round, bps as bpsOf } from './money.js';
import { curveFor } from './macro.js';
import { lotValue, lotRentMonth } from './valuation.js';
import { grossRentYear, nextId } from './state.js';

export function bankOf(id) {
  const b = BANKS[id];
  if (!b) throw new Error(`unknown bank ${id}`);
  return b;
}

export function repSpreadBps(s, bankId) {
  const rep = s.player.bankRep?.[bankId] ?? 50;
  if (rep >= 80) return -10;
  if (rep < 30) return 20;
  return 0;
}

// Yearly rate for a product at this bank today.
export function offeredRateBps(s, bankId, product) {
  const bank = bankOf(bankId);
  if (!bank.products.includes(product)) return null;
  return curveFor(s.macro, product) + (bank.spreadBps[product] ?? 0) + rule('buyToLetSurchargeBps') + repSpreadBps(s, bankId);
}

export function loanRateBps(s, loan) {
  if (loan.product === 'saron') {
    return curveFor(s.macro, 'saron') + (bankOf(loan.bankId).spreadBps.saron ?? 0) + rule('buyToLetSurchargeBps') + (loan.repSpread ?? 0);
  }
  return loan.rateBps;
}

export function bankValuation(s, bankId, fair, ref) {
  const bank = bankOf(bankId);
  const r = stream(s.seed, 'valuation', bankId, ref);
  const band = rule('bankValuationBandPct');
  const pct = bank.valuationBias + r.range(-band, band);
  return round(fair * (1 + pct / 100));
}

// Costs the bank counts for the loans the player already has (yearly), optionally excluding one loan.
export function existingCostsYear(s, world, bank, { excludeLoanId = null, excludeLotId = null } = {}) {
  let costs = 0;
  for (const loan of Object.values(s.loans)) {
    if (loan.id === excludeLoanId || loan.lotId === excludeLotId) continue;
    costs += bpsOf(loan.balance, bank.imputedRateBps);
    costs += loan.amortMonth * 12;
  }
  for (const lotId of Object.keys(s.lots)) {
    if (lotId === excludeLotId) continue;
    costs += round((lotValue(s, world, lotId) * rule('upkeepPctOfValue')) / 100);
  }
  return costs;
}

export function incomeYear(s, world, bank, { extraRentMonth = 0, excludeLotId = null } = {}) {
  let rent = grossRentYear(s);
  if (excludeLotId && s.lots[excludeLotId]) rent -= lotRentMonth(s, excludeLotId) * 12;
  rent += extraRentMonth * 12;
  return s.player.salaryYear + round((rent * bank.rentCountedPct) / 100);
}

export function amortMonthFor(bank, loan, lendingValue) {
  const floor = round((lendingValue * rule('amortiseToLtvPct')) / 100);
  const second = Math.max(0, loan - floor);
  return second > 0 ? round(second / bank.amortYears / 12) : 0;
}

// Largest loan the affordability test allows for a new lot (solve costs = cap x income).
function maxAffordableLoan(bank, { income, existingCosts, upkeepNew, lendingValue }) {
  const budget = (income * bank.affordabilityCapPct) / 100 - existingCosts - upkeepNew;
  if (budget <= 0) return 0;
  const imputed = bank.imputedRateBps / 10000;
  const floor = (lendingValue * rule('amortiseToLtvPct')) / 100;
  // below the floor: only imputed interest
  const l1 = budget / imputed;
  if (l1 <= floor) return Math.floor(l1);
  // above it: interest plus straight-line amortisation of the part above the floor
  const a = 1 / bank.amortYears;
  const l2 = (budget + floor * a) / (imputed + a);
  return Math.floor(Math.max(floor, l2));
}

// A quote for financing `price` of a lot with fair value `fair` and in-place rent `rentMonth`.
// `ref` keys the valuation draw (listing id or lot id). Returns decision 'yes' | 'conditions' | 'no'.
export function quote(s, world, { bankId, product, price, fair, rentMonth, ref, requested = null, excludeLotId = null, excludeLoanId = null }) {
  const bank = bankOf(bankId);
  if (!bank.products.includes(product)) return { ok: false, decision: 'no', reasons: [`${bank.short} does not offer ${PRODUCTS[product]?.label || product}.`] };
  const valuation = bankValuation(s, bankId, fair, ref);
  const lendingValue = Math.min(price, valuation);
  const maxLtvLoan = round((lendingValue * (100 - bank.minEquityPct)) / 100);
  const income = incomeYear(s, world, bank, { extraRentMonth: rentMonth, excludeLotId });
  const existing = existingCostsYear(s, world, bank, { excludeLoanId, excludeLotId });
  const upkeepNew = round((price * rule('upkeepPctOfValue')) / 100);
  const maxAfford = maxAffordableLoan(bank, { income, existingCosts: existing, upkeepNew, lendingValue });
  const maxLoan = Math.max(0, Math.min(maxLtvLoan, maxAfford));
  const want = requested === null ? maxLoan : Math.max(0, Math.min(requested, price));
  const loan = Math.min(want, maxLoan);
  const rate = offeredRateBps(s, bankId, product);
  const amortMonth = amortMonthFor(bank, loan, lendingValue);
  const costsWith = existing + upkeepNew + bpsOf(loan, bank.imputedRateBps) + amortMonth * 12;
  const ratio = income > 0 ? costsWith / income : Infinity;
  const equityNeeded = price - loan;
  const hardEquityMin = round((lendingValue * rule('minHardEquityPct')) / 100);
  const reasons = [];
  if (valuation < price) reasons.push(`Valuation ${Math.round(((valuation / price) - 1) * 100)}% under the price: equity is counted on the lower figure.`);
  if (maxAfford < maxLtvLoan) reasons.push(`Affordability caps the loan at ${(bank.affordabilityCapPct)}% of income with interest at ${(bank.imputedRateBps / 100).toFixed(1)}%.`);
  let decision = 'yes';
  if (maxLoan <= 0) decision = 'no';
  else if (requested !== null && requested > maxLoan) decision = 'conditions';
  return {
    ok: decision !== 'no',
    decision,
    bankId, product, price, valuation, lendingValue, maxLtvLoan, maxAfford, maxLoan, loan,
    equityNeeded, hardEquityMin, rateBps: rate, amortMonth,
    interestMonth: round((loan * rate) / 120000),
    income, costsYear: costsWith, ratio, cap: bank.affordabilityCapPct / 100,
    reasons,
  };
}

export function createLoan(s, { bankId, product, amount, lendingValue, lotId, rateBps, amortMonth }) {
  const bank = bankOf(bankId);
  const years = PRODUCTS[product].years;
  const loan = {
    id: nextId(s, 'M'),
    bankId, lotId, product,
    balance: amount,
    original: amount,
    lendingValue,
    rateBps,
    repSpread: repSpreadBps(s, bankId),
    fixedUntil: years ? s.month + years * 12 : null,
    amortMonth,
    amortFloor: round((lendingValue * rule('amortiseToLtvPct')) / 100),
    start: s.month,
    warnings: 0,
    bankName: bank.short,
  };
  s.loans[loan.id] = loan;
  if (!s.player.banksUsed.includes(bankId)) s.player.banksUsed.push(bankId);
  return loan;
}

// The annual review: the same combined test on today's rents and values, for all loans together.
export function reviewHousehold(s, world) {
  const out = [];
  for (const loan of Object.values(s.loans)) {
    const bank = bankOf(loan.bankId);
    const income = incomeYear(s, world, bank);
    const costs = existingCostsYear(s, world, bank);
    const ratio = income > 0 ? costs / income : Infinity;
    const cap = bank.affordabilityCapPct / 100;
    const value = lotValue(s, world, loan.lotId);
    const ltv = value > 0 ? loan.balance / value : Infinity;
    const maxLtv = (100 - bank.minEquityPct) / 100;
    let verdict = 'ok';
    if (ratio > cap * (1 + rule('reviewFailTolerancePct') / 100) || ltv > maxLtv + 0.05) verdict = 'fail';
    else if (ratio > cap || ltv > maxLtv) verdict = 'warn';
    // cash needed to pass: bring costs under cap and LTV under max
    const imputed = bank.imputedRateBps / 10000;
    const overCosts = Math.max(0, costs - income * cap);
    const needForRatio = overCosts > 0 ? round(overCosts / imputed) : 0;
    const needForLtv = Math.max(0, round(loan.balance - value * maxLtv));
    out.push({ loanId: loan.id, bankId: loan.bankId, ratio, cap, ltv, maxLtv, verdict, required: Math.min(loan.balance, Math.max(needForRatio, needForLtv)) });
  }
  return out;
}
