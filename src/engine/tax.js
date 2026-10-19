// Zurich property gains tax, purchase costs and the sale breakdown.

import { rule } from '../data/rules.js';
import { round, perMille, pct } from './money.js';
import { fullYearsBetween } from './clock.js';
import { lotOf, lotValue } from './valuation.js';
import { loansOfLot } from './state.js';

// Base tax on a gain by bracket (CHF 10,000 gain gives CHF 1,300).
export function gainsTaxBase(gain) {
  if (gain < rule('gainsTaxExemptBelow')) return 0;
  let left = gain;
  let tax = 0;
  for (const [width, ratePct] of rule('gainsTaxBrackets')) {
    const slice = Math.min(left, width);
    tax += (slice * ratePct) / 100;
    left -= slice;
    if (left <= 0) break;
  }
  return round(tax);
}

export function holdingAdjustmentPct(monthsHeld) {
  if (monthsHeld < 12) return rule('gainsTaxShortHoldSurchargePct').under1y;
  if (monthsHeld < 24) return rule('gainsTaxShortHoldSurchargePct').under2y;
  const years = Math.floor(monthsHeld / 12);
  const table = rule('gainsTaxLongHoldReductionPct');
  if (years >= 20) return -table[20];
  if (years >= 5) return -(table[years] ?? 0);
  return 0;
}

export function gainsTax(gain, monthsHeld) {
  const base = gainsTaxBase(gain);
  const adj = holdingAdjustmentPct(monthsHeld);
  return { base, adjustmentPct: adj, tax: round(base * (1 + adj / 100)) };
}

// Costs on buying: notary 1‰ plus VAT, land registry 1‰, mortgage note 2‰ on a new loan.
export function purchaseCosts(price, loanAmount) {
  const notary = Math.max(100, perMille(price, rule('notaryPerMille')));
  const notaryVat = pct(notary, rule('vatPct'));
  const registry = Math.max(100, perMille(price, rule('landRegistryPerMille')));
  const note = loanAmount > 0 ? perMille(loanAmount, rule('mortgageNotePerMille')) : 0;
  return { notary, notaryVat, registry, note, total: notary + notaryVat + registry + note };
}

// What a sale at `price` leaves in cash, with the tax shown before the player accepts.
export function saleBreakdown(state, world, lotId, price) {
  const lot = lotOf(state, lotId);
  const broker = pct(price, rule('brokerFeePct'));
  const basis = lot.bought.price + lot.bought.costs + (lot.capitalWorks || 0);
  const gain = price - broker - basis;
  const monthsHeld = state.month - lot.bought.month;
  const tax = gain > 0 ? gainsTax(gain, monthsHeld) : { base: 0, adjustmentPct: holdingAdjustmentPct(monthsHeld), tax: 0 };
  const payoff = loansOfLot(state, lotId).reduce((a, l) => a + l.balance, 0);
  const net = price - broker - tax.tax - payoff;
  return {
    price, broker, basis, gain, monthsHeld, fullYears: fullYearsBetween(lot.bought.month, state.month),
    taxBase: tax.base, adjustmentPct: tax.adjustmentPct, tax: tax.tax, payoff, net,
    fair: lotValue(state, world, lotId),
    equityIn: lot.bought.price + lot.bought.costs - (lot.bought.loan || 0),
  };
}

// Simplified income tax on net rental profit, charged in December.
export function incomeTaxOnRent(year) {
  const profit = year.rent - year.interest - year.running - year.maintenance;
  if (profit <= 0) return 0;
  return pct(profit, rule('incomeTaxOnRentPct'));
}
