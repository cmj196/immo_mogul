// The month. endMonth closes month m (cash, leases, projects) and opens m+1 (macro, listings,
// rivals, banks, checks). Fixed phases in a fixed order, every draw from a named stream.

import { rule } from '../data/rules.js';
import { stream } from './rng.js';
import { round, monthlyInterest, chf } from './money.js';
import { buildingOf } from './world.js';
import { isYearEnd, CAREER_MONTHS, monthLabel } from './clock.js';
import { emit, post, trimLedger } from './ledger.js';
import { stepMacro } from './macro.js';
import { marketRent, flatOfUnit, lotValue, runningCostMonth, lotOf, unitOf } from './valuation.js';
import { turnoverHazard, makeApplicants, refRateAdjustment, challengeRoll } from './lease.js';
import { advanceProjects, decayConditions } from './building.js';
import { generateMonthlyListings, expireListings } from './listings.js';
import { rivalsTakeListings } from './rivals.js';
import { loanRateBps, reviewHousehold, bankOf } from './bank.js';
import { incomeTaxOnRent } from './tax.js';
import { checkMilestones, recordHistory, yearEndReport } from './report.js';
import { makeBuyer, openSellNegotiation } from './negotiation.js';
import { hasDecision } from './state.js';
import { settleSale } from './sales.js';

const OVERDRAFT_BPS = 800;

export function endMonth(s, world, events) {
  const m = s.month;
  closeMonth(s, world, events, m);
  s.month = m + 1;
  openMonth(s, world, events);
}

function closeMonth(s, world, events, m) {
  // 1. salary savings
  post(s, events, { reason: 'salary', amount: s.player.savingsMonth });

  // 2. rents, arrears, scheduled rent changes
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'player') continue;
    const lease = u.lease;
    if (!lease) continue;
    const r = stream(s.seed, 'rent', u.id, m);
    if (lease.pendingRent && m >= lease.pendingRent.from) {
      lease.rent = lease.pendingRent.rent;
      lease.refBps = s.macro.refBps;
      lease.cpiBps = s.macro.cpiBps;
      lease.pendingRent = null;
    }
    const skips = r.chance(lease.tenant?.arrearsRisk ?? 0.02);
    if (skips) {
      lease.arrears += lease.rent;
      emit(s, events, 'arrears', { unitId: u.id }, `${lease.tenant.name} missed the rent this month (${chf(lease.arrears)} outstanding).`);
    } else {
      let paid = lease.rent;
      if (lease.arrears > 0 && r.chance(0.5)) {
        const back = Math.min(lease.arrears, lease.rent);
        lease.arrears -= back;
        paid += back;
      }
      post(s, events, { reason: 'rent', amount: paid, unitId: u.id, lotId: u.lotId });
      s.year.rent += paid;
      s.stats.rentCollected += paid;
    }
  }

  // 3. loans: interest and amortisation
  for (const loan of Object.values(s.loans)) {
    const rate = loanRateBps(s, loan);
    const interest = monthlyInterest(loan.balance, rate);
    if (interest) {
      post(s, events, { reason: 'interest', amount: -interest, loanId: loan.id, lotId: loan.lotId });
      s.year.interest += interest;
      s.stats.interestPaid += interest;
    }
    let amort = loan.balance > loan.amortFloor ? Math.min(loan.amortMonth, loan.balance - loan.amortFloor) : 0;
    if (amort > 0) {
      post(s, events, { reason: 'amortisation', amount: -amort, loanId: loan.id, lotId: loan.lotId });
      loan.balance -= amort;
    }
    const rep = s.player.bankRep[loan.bankId] ?? 50;
    s.player.bankRep[loan.bankId] = Math.min(100, rep + 0.5);
  }

  // 4. running costs
  for (const lotId of Object.keys(s.lots)) {
    const c = runningCostMonth(s, world, lotId);
    if (c) {
      post(s, events, { reason: 'running', amount: -c, lotId });
      s.year.running += c;
    }
  }

  // 5. tenants: notices, move-outs, applicants
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'player') continue;
    const { b, flat } = flatOfUnit(world, u);
    const r = stream(s.seed, 'tenant', u.id, m);
    const market = marketRent(s, world, b, flat, u.condition);
    if (u.lease) {
      if (u.lease.notice !== null && m >= u.lease.notice) {
        u.prevRent = u.lease.rent;
        u.prevRef = u.lease.refBps;
        emit(s, events, 'moveOut', { unitId: u.id }, `${u.lease.tenant.name} moved out of ${b.street} ${b.no}. The flat is empty; set a rent to let it.`);
        u.lease = null;
        u.vacantSince = m + 1;
        u.askRent = null;
        u.applicants = null;
      } else if (u.lease.notice === null && r.chance(turnoverHazard(u.lease, m, { market }))) {
        u.lease.notice = m + rule('noticeMonths');
        emit(s, events, 'notice', { unitId: u.id, leaves: u.lease.notice }, `${u.lease.tenant.name} gave notice at ${b.street} ${b.no}, leaving end of ${monthLabel(u.lease.notice)}.`);
      }
    } else if (!u.project && u.askRent) {
      if (u.applicants && u.applicants.length) {
        // applicants waited a month; some go elsewhere
        u.applicants = u.applicants.filter(() => r.chance(0.5));
      }
      const fresh = makeApplicants(r, { ask: u.askRent, market, prevRent: u.prevRent });
      u.applicants = [...(u.applicants || []), ...fresh].slice(0, 3);
      if (u.applicants.length) {
        s.pending.push({ kind: 'applicants', unitId: u.id, month: m + 1 });
        emit(s, events, 'applicants', { unitId: u.id, count: u.applicants.length }, `${u.applicants.length} applicant${u.applicants.length > 1 ? 's' : ''} for ${b.street} ${b.no} at ${chf(u.askRent)} a month.`);
      } else {
        // last month's applicants all went elsewhere: drop the stale decision card
        s.pending = s.pending.filter((p) => !(p.kind === 'applicants' && p.unitId === u.id));
        emit(s, events, 'noApplicants', { unitId: u.id }, `No one applied for ${b.street} ${b.no} at ${chf(u.askRent)}. Market rent is about ${chf(market)}.`);
      }
    }
  }

  // 6. projects and wear
  advanceProjects(s, world, events);
  decayConditions(s);

  // 7. year end: income tax on rental profit
  if (isYearEnd(m)) {
    const tax = incomeTaxOnRent(s.year);
    if (tax > 0) {
      post(s, events, { reason: 'incomeTax', amount: -tax, text: `Income tax on rental profit: ${chf(tax)}.` });
      s.year.tax += tax;
      s.stats.incomeTax += tax;
    }
  }

  // 8. overdraft
  if (s.player.cash < 0) {
    const fee = monthlyInterest(-s.player.cash, OVERDRAFT_BPS);
    if (fee) post(s, events, { reason: 'overdraft', amount: -fee, text: `Overdraft interest ${chf(fee)}.` });
  }
}

function openMonth(s, world, events) {
  const m = s.month;
  // dedupe pending applicant entries created above (one per unit)
  s.pending = s.pending.filter((p, i, arr) => arr.findIndex((q) => q.kind === p.kind && q.unitId === p.unitId && q.loanId === p.loanId && q.lotId === p.lotId) === i);

  // 1. macro
  const refBefore = s.macro.refBps;
  stepMacro(s, world, events);
  if (s.macro.refBps < refBefore) applyTenantClaims(s, world, events);
  if (s.macro.refBps > refBefore && sittingTenants(s) > 0) {
    s.pending.push({ kind: 'refRateUp', month: m, bps: s.macro.refBps });
  }

  // 2. listings: expiry, rivals, new
  expireListings(s, events);
  rivalsTakeListings(s, world, events);
  generateMonthlyListings(s, world, events);

  // 3. buyers for lots on sale
  for (const lot of Object.values(s.lots)) {
    if (!lot.forSale || s.negotiation) continue;
    const r = stream(s.seed, 'sale', lot.id, m);
    const fair = lotValue(s, world, lot.id);
    const ratio = lot.forSale.ask / fair;
    const p = ratio <= 0.97 ? 0.9 : ratio <= 1.0 ? 0.7 : ratio <= 1.05 ? 0.45 : ratio <= 1.1 ? 0.25 : 0.1;
    if (r.chance(p)) {
      const buyer = makeBuyer(s, lot, fair, lot.forSale.ask, m);
      s.negotiation = openSellNegotiation(s, lot, buyer);
      const b = buildingOf(world, lot.buildingId);
      emit(s, events, 'buyerOffer', { lotId: lot.id, price: buyer.opening }, `${buyer.label} offers ${chf(buyer.opening)} for ${b.street} ${b.no}. ${buyer.line}`);
    }
  }

  // 4. loans: fixed periods ending, December reviews
  for (const loan of Object.values(s.loans)) {
    if (loan.fixedUntil !== null && m >= loan.fixedUntil && !s.pending.some((p) => p.kind === 'rollover' && p.loanId === loan.id)) {
      s.pending.push({ kind: 'rollover', loanId: loan.id, month: m });
      emit(s, events, 'rollover', { loanId: loan.id }, `The fixed period of your ${loan.bankName} mortgage has ended. Choose a new product.`);
    }
  }
  if (m % 12 === 11 && Object.keys(s.loans).length) runReviews(s, world, events);

  // 5. purchase deadline
  if (s.purchase && m > s.purchase.deadline) {
    const l = s.listings[s.purchase.listingId];
    if (l) { l.reserved = false; l.expires = Math.max(l.expires, m + 1); }
    emit(s, events, 'purchaseLapsed', { listingId: s.purchase.listingId }, `The seller walked away: the purchase was not completed in time.`);
    s.purchase = null;
  }

  // 6. forced measures: negative cash
  if (s.player.cash < 0) {
    s.monthsNegative += 1;
    if (s.monthsNegative === 1) emit(s, events, 'overdraft', {}, `Your account is overdrawn by ${chf(-s.player.cash)}. Raise cash within two months or the bank sells for you.`);
    if (s.monthsNegative >= 3) forcedSale(s, world, events, 'overdraft');
  } else {
    s.monthsNegative = 0;
  }
  for (const p of s.pending.filter((x) => x.kind === 'bankReview')) {
    if (m - p.month >= 3) forcedSale(s, world, events, 'review', p.loanId);
  }

  // 7. records
  recordHistory(s, world);
  checkMilestones(s, world, events);
  if (m % 12 === 0 && m > 0) yearEndReport(s, world, events);
  trimLedger(s);
  if (m >= CAREER_MONTHS && !s.over) {
    s.over = { reason: 'end', month: m };
    emit(s, events, 'over', { reason: 'end' }, 'Fifteen years are up. Time to look at the numbers.');
  }
}

function sittingTenants(s) {
  return Object.values(s.units).filter((u) => u.owner === 'player' && u.lease).length;
}

// Reference rate fell: most tenants claim their cut (assumption: 80%).
function applyTenantClaims(s, world, events) {
  let n = 0;
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'player' || !u.lease) continue;
    const r = stream(s.seed, 'claim', u.id, s.month);
    const adj = refRateAdjustment(u.lease, s.macro.refBps, s.macro.cpiBps);
    if (adj.steps < 0 && r.chance(0.8)) {
      u.lease.pendingRent = { rent: adj.newRent, from: s.month + 1, why: 'refRateDown' };
      u.lease.refBps = s.macro.refBps;
      n += 1;
    }
  }
  if (n) emit(s, events, 'tenantClaims', { count: n }, `${n} tenant${n > 1 ? 's' : ''} claimed the rent cut that follows the lower reference rate.`);
}

function runReviews(s, world, events) {
  const results = reviewHousehold(s, world);
  for (const res of results) {
    const loan = s.loans[res.loanId];
    if (!loan) continue;
    const bank = bankOf(res.bankId);
    if (res.verdict === 'ok') {
      loan.warnings = 0;
      continue;
    }
    s.stats.warnings += 1;
    s.lastWarningMonth = s.month;
    s.player.bankRep[res.bankId] = Math.max(0, (s.player.bankRep[res.bankId] ?? 50) - (res.verdict === 'fail' ? 15 : 8));
    if (res.verdict === 'warn' && loan.warnings === 0) {
      loan.warnings = 1;
      const why = res.ratio > res.cap ? `costs at ${(res.ratio * 100).toFixed(0)}% of income against a ${(res.cap * 100).toFixed(0)}% cap` : `loan at ${(res.ltv * 100).toFixed(0)}% of today's value against a ${(res.maxLtv * 100).toFixed(0)}% limit`;
      emit(s, events, 'bankWarn', { loanId: loan.id }, `${bank.name} review: ${why}. A warning this year; a fail next year means cash in or a sale.`);
    } else {
      loan.warnings += 1;
      if (!s.pending.some((p) => p.kind === 'bankReview' && p.loanId === loan.id)) {
        s.pending.push({ kind: 'bankReview', loanId: loan.id, required: res.required, month: s.month, ratio: res.ratio, cap: res.cap, ltv: res.ltv });
      }
      emit(s, events, 'bankFail', { loanId: loan.id, required: res.required }, `${bank.name} review failed (${res.ratio > res.cap ? `costs at ${(res.ratio * 100).toFixed(0)}% of income` : `loan at ${(res.ltv * 100).toFixed(0)}% of value`}): pay down ${chf(res.required)} within three months or sell the property.`);
    }
  }
}

// The bank sells the biggest lot (or the one behind a failed review) at a discount.
export function forcedSale(s, world, events, why, loanId = null) {
  let lotId = null;
  if (loanId && s.loans[loanId]) lotId = s.loans[loanId].lotId;
  if (!lotId) {
    let best = -1;
    for (const id of Object.keys(s.lots)) {
      const v = lotValue(s, world, id);
      if (v > best) { best = v; lotId = id; }
    }
  }
  if (!lotId) {
    if (s.player.cash < 0 && !s.over) {
      s.over = { reason: 'insolvent', month: s.month };
      emit(s, events, 'over', { reason: 'insolvent' }, 'No property left to sell and the account is still overdrawn. The career ends in insolvency.');
    }
    return;
  }
  const price = round(lotValue(s, world, lotId) * 0.92);
  const b = buildingOf(world, s.lots[lotId].buildingId);
  emit(s, events, 'forcedSale', { lotId, price }, `Forced sale: the bank sold ${b.street} ${b.no} for ${chf(price)} (8% under value).`);
  s.stats.forcedSales += 1;
  s.pending = s.pending.filter((p) => !(p.kind === 'bankReview' && s.loans[p.loanId]?.lotId === lotId));
  settleSale(s, world, events, lotId, price);
  s.monthsNegative = 0;
}

export { hasDecision };
