// applyAction(state, world, action) -> { state, events, error }. Never mutates its input. Every
// handler works on a structured clone and only the ledger changes cash.

import { rule } from '../data/rules.js';
import { BANKS, PRODUCTS } from '../data/banks.js';
import { round, chf } from './money.js';
import { buildingOf } from './world.js';
import { emit, post, RuleError } from './ledger.js';
import { endMonth } from './tick.js';
import { openBuyNegotiation, sellerReply, buyerReply, describeReply, COUNTER_LIMIT } from './negotiation.js';
import { quote, createLoan, offeredRateBps, bankOf } from './bank.js';
import { purchaseCosts } from './tax.js';
import { settleSale } from './sales.js';
import { marketRent, flatOfUnit, lotValue, lotRentMonth, unitOf, lotOf, listingRentMonth } from './valuation.js';
import { unitRenoQuote, buildingRenoQuote, startUnitRenovation, startBuildingRenovation, UNIT_PACKAGES } from './building.js';
import { refRateAdjustment } from './lease.js';
import { checkMilestones } from './report.js';
import { nextId, hasDecision, createCareer } from './state.js';
import { generateMonthlyListings } from './listings.js';
import { CAREER_MONTHS } from './clock.js';

const NOTABLE = new Set(['moveOut', 'notice', 'renoDone', 'refRate', 'bankWarn', 'bankFail', 'rollover', 'applicants', 'buyerOffer', 'milestone', 'yearEnd', 'over', 'purchaseLapsed', 'forcedSale', 'overdraft', 'tenantClaims']);

export function checkAction(s, world, a) {
  try {
    validate(s, world, a);
    return null;
  } catch (e) {
    if (e instanceof RuleError) return e.message;
    throw e;
  }
}

export function applyAction(state, world, action) {
  const err = checkAction(state, world, action);
  if (err) return { state, events: [], error: err };
  const s = structuredClone(state);
  const events = [];
  HANDLERS[action.type](s, world, events, action);
  return { state: s, events, error: null };
}

// Repeat endMonth until something needs the player, a notable event lands or the limit is reached.
export function advance(state, world, { maxMonths = 12 } = {}) {
  let s = state;
  const all = [];
  let months = 0;
  let stoppedBecause = 'limit';
  while (months < maxMonths) {
    const err = checkAction(s, world, { type: 'endMonth' });
    if (err) { stoppedBecause = 'decision'; break; }
    const r = applyAction(s, world, { type: 'endMonth' });
    s = r.state;
    all.push(...r.events);
    months += 1;
    if (s.over) { stoppedBecause = 'over'; break; }
    if (hasDecision(s)) { stoppedBecause = 'decision'; break; }
    if (r.events.some((e) => NOTABLE.has(e.type))) { stoppedBecause = 'event'; break; }
  }
  return { state: s, events: all, months, stoppedBecause };
}

// A new career: the opening month already has listings to look at.
export function startCareer(opts) {
  const s = createCareer(opts);
  const events = [];
  generateMonthlyListings(s, opts.world, events);
  return { state: s, events };
}

function fail(msg) {
  throw new RuleError(msg);
}

function need(cond, msg) {
  if (!cond) fail(msg);
}

function isInt(x) {
  return Number.isInteger(x);
}

function validate(s, world, a) {
  need(a && typeof a.type === 'string', 'No action.');
  need(HANDLERS[a.type], `Unknown action ${a.type}.`);
  need(!s.over || a.type === 'endMonth' && false, 'The career is over.');
  const neg = s.negotiation;
  switch (a.type) {
    case 'endMonth':
      need(!neg, 'Answer the offer on the table first.');
      need(!s.purchase, 'Complete or abandon the purchase first.');
      need(s.month < CAREER_MONTHS, 'The career has ended.');
      return;
    case 'makeOffer': {
      need(!neg, 'You are already in a negotiation.');
      need(!s.purchase, 'Complete the current purchase first.');
      const l = s.listings[a.listingId];
      need(l, 'That listing is gone.');
      need(!l.reserved, 'That listing is reserved.');
      need(isInt(a.price) && a.price > 0, 'Offer a whole number of francs.');
      need(a.price <= l.ask, 'No need to offer more than the asking price.');
      need(a.price >= l.ask * 0.5, 'That offer would not be taken seriously.');
      return;
    }
    case 'counterOffer': {
      need(neg && neg.actor === 'player' && !neg.closed, 'There is no offer to counter.');
      need(neg.counters.player < COUNTER_LIMIT, 'You have no counter-offers left. Accept or walk away.');
      need(isInt(a.price) && a.price > 0, 'Counter with a whole number of francs.');
      if (neg.kind === 'buy') {
        need(a.price < neg.price, 'A counter must be below the seller’s price.');
        const mine = [...neg.history].reverse().find((h) => h.by === 'player')?.price ?? 0;
        need(a.price > mine, 'Move toward the seller: counter above your last offer.');
      } else {
        need(a.price > neg.price, 'A counter must be above the buyer’s offer.');
        const mine = [...neg.history].reverse().find((h) => h.by === 'player')?.price;
        if (mine) need(a.price < mine, 'Move toward the buyer: counter below your last price.');
      }
      return;
    }
    case 'acceptOffer':
      need(neg && neg.actor === 'player' && !neg.closed, 'There is no offer to accept.');
      need(neg.from === 'counterparty', 'Wait for the other side to answer.');
      if (neg.kind === 'buy') need(!s.purchase, 'Complete the current purchase first.');
      return;
    case 'walkAway':
      need(neg && neg.actor === 'player', 'There is no negotiation to leave.');
      return;
    case 'chooseFinancing': {
      const p = s.purchase;
      need(p, 'No purchase is waiting for financing.');
      need(isInt(a.loan) && a.loan >= 0, 'Loan must be a whole number.');
      if (a.loan > 0) {
        need(BANKS[a.bankId], 'Pick a bank.');
        need(PRODUCTS[a.product] && BANKS[a.bankId].products.includes(a.product), 'That bank does not offer this product.');
        const q = quoteForPurchase(s, world, p, a.bankId, a.product, a.loan);
        need(q.decision !== 'no', q.reasons[0] || `${BANKS[a.bankId].short} declines.`);
        need(q.decision === 'yes', `${BANKS[a.bankId].short} lends at most ${chf(q.maxLoan)} on this purchase.`);
      }
      const costs = purchaseCosts(p.price, a.loan).total;
      need(s.player.cash >= p.price - a.loan + costs, `You need ${chf(p.price - a.loan + costs)} in cash for this financing and have ${chf(s.player.cash)}.`);
      return;
    }
    case 'closePurchase':
      need(s.purchase, 'No purchase to close.');
      need(s.purchase.financing, 'Choose the financing first.');
      return;
    case 'abandonPurchase':
      need(s.purchase, 'No purchase to abandon.');
      return;
    case 'startRenovation': {
      const u = s.units[a.unitId];
      need(u && u.owner === 'player', 'Not your flat.');
      need(UNIT_PACKAGES.includes(a.pkg), 'Unknown package.');
      const q = unitRenoQuote(s, world, a.unitId, a.pkg);
      need(!q.blockedBy, q.blockedBy || 'Not possible now.');
      need(s.player.cash >= q.cost, `${q.label} costs ${chf(q.cost)}; you have ${chf(s.player.cash)}.`);
      return;
    }
    case 'startBuildingRenovation': {
      const lot = s.lots[a.lotId];
      need(lot && lot.kind === 'building', 'That is not a whole building you own.');
      const q = buildingRenoQuote(s, world, a.lotId);
      need(!q.blockedBy, q.blockedBy || 'Not possible now.');
      need(s.player.cash >= q.cost, `The works cost ${chf(q.cost)}; you have ${chf(s.player.cash)}.`);
      return;
    }
    case 'setRent': {
      const u = s.units[a.unitId];
      need(u && u.owner === 'player', 'Not your flat.');
      need(!u.lease, 'The flat is let.');
      need(!u.project, 'Wait for the works to finish.');
      need(isInt(a.rent) && a.rent >= 100, 'Set a monthly rent in francs.');
      return;
    }
    case 'chooseTenant': {
      const u = s.units[a.unitId];
      need(u && u.owner === 'player', 'Not your flat.');
      need(!u.lease, 'The flat is let.');
      need(u.applicants && u.applicants[a.index], 'No such applicant.');
      return;
    }
    case 'declineApplicants': {
      const u = s.units[a.unitId];
      need(u && u.owner === 'player', 'Not your flat.');
      return;
    }
    case 'passOnRefRate':
    case 'skipRefRate':
      need(s.pending.some((p) => p.kind === 'refRateUp'), 'No rent increase is due.');
      return;
    case 'listForSale': {
      const lot = s.lots[a.lotId];
      need(lot, 'Not your property.');
      need(!lot.forSale, 'Already on the market.');
      need(!lot.project, 'Finish the works first.');
      need(isInt(a.ask) && a.ask > 0, 'Set an asking price.');
      return;
    }
    case 'cancelSale': {
      const lot = s.lots[a.lotId];
      need(lot && lot.forSale, 'Not on the market.');
      need(!neg || neg.lotId !== a.lotId, 'Answer the buyer first.');
      return;
    }
    case 'chooseRollover': {
      const p = s.pending.find((x) => x.kind === 'rollover' && x.loanId === a.loanId);
      need(p, 'No rate reset is due on that loan.');
      const loan = s.loans[a.loanId];
      need(loan && BANKS[loan.bankId].products.includes(a.product), 'That bank does not offer this product.');
      return;
    }
    case 'repayLoan': {
      const loan = s.loans[a.loanId];
      need(loan, 'No such loan.');
      need(isInt(a.amount) && a.amount > 0 && a.amount <= loan.balance, 'Repay between 1 franc and the balance.');
      need(s.player.cash >= a.amount, `You have ${chf(s.player.cash)}.`);
      return;
    }
    case 'refinance': {
      const loan = s.loans[a.loanId];
      need(loan, 'No such loan.');
      need(loan.fixedUntil === null || loan.fixedUntil <= s.month + 3, 'A fixed mortgage can only be replaced within three months of its end.');
      need(BANKS[a.bankId] && BANKS[a.bankId].products.includes(a.product), 'That bank does not offer this product.');
      const q = refinanceQuote(s, world, a.loanId, a.bankId, a.product, a.amount ?? null);
      need(q.decision !== 'no', q.reasons[0] || 'The bank declines.');
      need(q.loan >= 1, 'The bank would not lend on this property.');
      const cashNeeded = loan.balance - q.loan + q.noteFee;
      need(s.player.cash >= cashNeeded, `Repaying the difference needs ${chf(cashNeeded)} in cash.`);
      return;
    }
    case 'resolveReview': {
      const p = s.pending.find((x) => x.kind === 'bankReview' && x.loanId === a.loanId);
      need(p, 'No review is open on that loan.');
      need(['inject', 'sell'].includes(a.choice), 'Choose inject or sell.');
      if (a.choice === 'inject') need(s.player.cash >= p.required, `Paying down ${chf(p.required)} needs more cash than you have.`);
      return;
    }
    default:
      fail(`Unknown action ${a.type}.`);
  }
}

export function quoteForPurchase(s, world, purchase, bankId, product, requested = null) {
  const l = s.listings[purchase.listingId];
  return quote(s, world, { bankId, product, price: purchase.price, fair: l.fair, rentMonth: listingRentMonth(l), ref: l.id, requested });
}

export function refinanceQuote(s, world, loanId, bankId, product, requested = null) {
  const loan = s.loans[loanId];
  const lot = lotOf(s, loan.lotId);
  const fair = lotValue(s, world, lot.id);
  const q = quote(s, world, { bankId, product, price: fair, fair, rentMonth: lotRentMonth(s, lot.id), ref: `${lot.id}:${Math.floor(s.month / 12)}`, requested, excludeLoanId: loanId, excludeLotId: lot.id });
  const increase = Math.max(0, q.loan - loan.balance);
  q.noteFee = increase > 0 ? round((increase * rule('mortgageNotePerMille')) / 1000) : 0;
  q.cashOut = q.loan - loan.balance - q.noteFee;
  return q;
}

function startPurchase(s, world, events, listing, price) {
  s.purchase = { listingId: listing.id, price, month: s.month, deadline: s.month + 1, financing: null };
  listing.reserved = true;
  s.negotiation = null;
  s.stats.dealsWon += 1;
  emit(s, events, 'dealAgreed', { listingId: listing.id, price }, `Deal agreed on ${listing.title} at ${chf(price)}. Arrange the financing and close by the end of next month.`);
}

const HANDLERS = {
  endMonth(s, world, events) {
    // an unanswered rate reset rolls to the bank's default product
    for (const p of s.pending.filter((x) => x.kind === 'rollover')) {
      const loan = s.loans[p.loanId];
      if (!loan) continue;
      const product = BANKS[loan.bankId].products.includes('saron') ? 'saron' : 'fix5';
      rollLoan(s, loan, product);
      emit(s, events, 'rolled', { loanId: loan.id, product }, `${loan.bankName} rolled your mortgage into ${PRODUCTS[product].label} at ${(loan.rateBps / 100).toFixed(2)}%.`);
    }
    s.pending = s.pending.filter((x) => x.kind !== 'rollover');
    endMonth(s, world, events);
  },

  makeOffer(s, world, events, a) {
    const l = s.listings[a.listingId];
    const neg = openBuyNegotiation(s, l, a.price);
    s.negotiation = neg;
    s.stats.offersMade += 1;
    emit(s, events, 'offer', { listingId: l.id, price: a.price }, `You offer ${chf(a.price)} for ${l.title} (asking ${chf(l.ask)}).`);
    const reply = sellerReply(s, l, neg);
    emit(s, events, 'reply', { listingId: l.id, reply, price: neg.price }, describeReply(reply, neg, 'The seller'));
    if (reply === 'accept') startPurchase(s, world, events, l, neg.closed.price);
    else if (reply === 'walk') s.negotiation = null;
  },

  counterOffer(s, world, events, a) {
    const neg = s.negotiation;
    neg.counters.player += 1;
    neg.price = a.price;
    neg.from = 'player';
    neg.actor = 'counterparty';
    neg.history.push({ by: 'player', kind: 'counter', price: a.price });
    if (neg.kind === 'buy') {
      const l = s.listings[neg.listingId];
      emit(s, events, 'counter', { price: a.price }, `You counter at ${chf(a.price)}.`);
      const reply = sellerReply(s, l, neg);
      emit(s, events, 'reply', { listingId: l.id, reply, price: neg.price }, describeReply(reply, neg, 'The seller'));
      if (reply === 'accept') startPurchase(s, world, events, l, neg.closed.price);
      else if (reply === 'walk') s.negotiation = null;
    } else {
      const lot = s.lots[neg.lotId];
      emit(s, events, 'counter', { price: a.price }, `You counter at ${chf(a.price)}.`);
      const reply = buyerReply(s, lot, neg);
      emit(s, events, 'reply', { lotId: lot.id, reply, price: neg.price }, describeReply(reply, neg, 'The buyer'));
      if (reply === 'accept') {
        settleSale(s, world, events, lot.id, neg.closed.price);
        s.negotiation = null;
      } else if (reply === 'walk') {
        s.negotiation = null;
      }
    }
  },

  acceptOffer(s, world, events) {
    const neg = s.negotiation;
    if (neg.kind === 'buy') {
      const l = s.listings[neg.listingId];
      emit(s, events, 'accept', { price: neg.price }, `You accept ${chf(neg.price)}.`);
      startPurchase(s, world, events, l, neg.price);
    } else {
      const lot = s.lots[neg.lotId];
      emit(s, events, 'accept', { price: neg.price }, `You accept ${chf(neg.price)}.`);
      settleSale(s, world, events, lot.id, neg.price);
      s.negotiation = null;
    }
  },

  walkAway(s, world, events) {
    const neg = s.negotiation;
    s.negotiation = null;
    emit(s, events, 'walk', { kind: neg.kind }, neg.kind === 'buy' ? 'You walk away from the deal.' : 'You turn the buyer down.');
  },

  chooseFinancing(s, world, events, a) {
    const p = s.purchase;
    const costs = purchaseCosts(p.price, a.loan);
    if (a.loan > 0) {
      const q = quoteForPurchase(s, world, p, a.bankId, a.product, a.loan);
      p.financing = { bankId: a.bankId, product: a.product, loan: a.loan, rateBps: q.rateBps, amortMonth: q.amortMonth, lendingValue: q.lendingValue, costs: costs.total, ratio: q.ratio };
      emit(s, events, 'financing', { bankId: a.bankId, loan: a.loan }, `${BANKS[a.bankId].short} agrees to ${chf(a.loan)} (${PRODUCTS[a.product].label} at ${(q.rateBps / 100).toFixed(2)}%).`);
    } else {
      p.financing = { bankId: null, product: null, loan: 0, rateBps: 0, amortMonth: 0, lendingValue: p.price, costs: costs.total, ratio: 0 };
      emit(s, events, 'financing', { bankId: null, loan: 0 }, 'You will pay in cash.');
    }
  },

  closePurchase(s, world, events) {
    const p = s.purchase;
    const l = s.listings[p.listingId];
    const f = p.financing;
    const b = buildingOf(world, l.buildingId);
    const costs = purchaseCosts(p.price, f.loan);
    const lotId = nextId(s, 'P');
    const lot = {
      id: lotId, kind: l.kind, buildingId: l.buildingId, unitIds: [],
      bought: { month: s.month, price: p.price, costs: costs.total, loan: f.loan, listingId: l.id },
      capitalWorks: 0, forSale: null, project: null, energy: false, title: l.title,
    };
    for (const u of l.units) {
      const unitId = `${l.buildingId}:${u.flatIdx}`;
      s.units[unitId] = { id: unitId, buildingId: l.buildingId, flatIdx: u.flatIdx, owner: 'player', lotId, condition: u.condition, lease: u.lease, prevRent: u.prevRent ?? null, prevRef: null, project: null, askRent: null, applicants: null, vacantSince: u.lease ? null : s.month, lastReno: null, conditionFrac: 0 };
      lot.unitIds.push(unitId);
    }
    s.lots[lotId] = lot;
    if (f.loan > 0) post(s, events, { reason: 'loan', amount: f.loan, lotId });
    post(s, events, { reason: 'purchase', amount: -p.price, lotId });
    post(s, events, { reason: 'fees', amount: -costs.total, lotId, text: `Notary, land registry and mortgage note: ${chf(costs.total)}.` });
    if (f.loan > 0) createLoan(s, { bankId: f.bankId, product: f.product, amount: f.loan, lendingValue: f.lendingValue, lotId, rateBps: f.rateBps, amortMonth: f.amortMonth });
    delete s.listings[l.id];
    s.purchase = null;
    s.stats.bought += 1;
    s.stats.lotsEverOwned += 1;
    s.year.bought += 1;
    emit(s, events, 'bought', { lotId, price: p.price }, `You now own ${l.title}, ${b.plz} Zürich.`);
    checkMilestones(s, world, events);
  },

  abandonPurchase(s, world, events) {
    const l = s.listings[s.purchase.listingId];
    if (l) l.reserved = false;
    s.purchase = null;
    emit(s, events, 'abandon', {}, 'You pull out of the purchase.');
  },

  startRenovation(s, world, events, a) {
    const q = startUnitRenovation(s, world, events, a.unitId, a.pkg);
    if (a.pkg === 'full') s.stats.fullRenovations = (s.stats.fullRenovations || 0) + 1;
    const u = unitOf(s, a.unitId);
    if (!u.lease) { u.askRent = null; u.applicants = null; s.pending = s.pending.filter((p) => !(p.kind === 'applicants' && p.unitId === a.unitId)); }
    checkMilestones(s, world, events);
    return q;
  },

  startBuildingRenovation(s, world, events, a) {
    startBuildingRenovation(s, world, events, a.lotId);
  },

  setRent(s, world, events, a) {
    const u = unitOf(s, a.unitId);
    if (u.askRent !== a.rent) u.applicants = null;
    u.askRent = a.rent;
    s.pending = s.pending.filter((p) => !(p.kind === 'applicants' && p.unitId === a.unitId));
    const { b, flat } = flatOfUnit(world, u);
    emit(s, events, 'rentSet', { unitId: u.id, rent: a.rent }, `${b.street} ${b.no} advertised at ${chf(a.rent)} a month (market about ${chf(marketRent(s, world, b, flat, u.condition))}).`);
  },

  chooseTenant(s, world, events, a) {
    const u = unitOf(s, a.unitId);
    const ap = u.applicants[a.index];
    const { b, flat } = flatOfUnit(world, u);
    const market = marketRent(s, world, b, flat, u.condition);
    let rent = u.askRent;
    let text = `${ap.name} moves into ${b.street} ${b.no} at ${chf(rent)} a month.`;
    if (ap.willChallenge) {
      const capped = Math.max(round(u.prevRent * (1 + rule('initialRentChallengeJumpPct') / 100)), round(market * 0.98));
      if (capped < rent) {
        rent = round(capped / 5) * 5;
        s.stats.challenges += 1;
        text = `${ap.name} moved into ${b.street} ${b.no}, then challenged the initial rent at the conciliation authority: it is set at ${chf(rent)} instead of ${chf(u.askRent)}.`;
      }
    }
    u.lease = { tenant: { name: ap.name, story: ap.line, profile: ap.profile, arrearsRisk: ap.arrearsRisk, stayBonus: ap.stayBonus }, rent, since: s.month, refBps: s.macro.refBps, cpiBps: s.macro.cpiBps, notice: null, arrears: 0, pendingRent: null };
    u.applicants = null;
    u.askRent = null;
    u.vacantSince = null;
    s.pending = s.pending.filter((p) => !(p.kind === 'applicants' && p.unitId === a.unitId));
    emit(s, events, 'let', { unitId: u.id, rent }, text);
  },

  declineApplicants(s, world, events, a) {
    const u = unitOf(s, a.unitId);
    u.applicants = null;
    s.pending = s.pending.filter((p) => !(p.kind === 'applicants' && p.unitId === a.unitId));
    emit(s, events, 'declined', { unitId: u.id }, 'You turn the applicants down and keep advertising.');
  },

  passOnRefRate(s, world, events) {
    let n = 0;
    let total = 0;
    for (const u of Object.values(s.units)) {
      if (u.owner !== 'player' || !u.lease) continue;
      const adj = refRateAdjustment(u.lease, s.macro.refBps, s.macro.cpiBps);
      if (adj.steps > 0 && adj.newRent > u.lease.rent) {
        u.lease.pendingRent = { rent: adj.newRent, from: s.month + rule('noticeMonths'), why: 'refRateUp' };
        u.lease.refBps = s.macro.refBps;
        u.lease.cpiBps = s.macro.cpiBps;
        total += adj.newRent - u.lease.rent;
        n += 1;
      }
    }
    s.pending = s.pending.filter((p) => p.kind !== 'refRateUp');
    emit(s, events, 'refRatePassed', { count: n, total }, n ? `Rent letters sent to ${n} tenant${n > 1 ? 's' : ''}: ${chf(total)} more a month after the notice period.` : 'No tenant was due an increase.');
  },

  skipRefRate(s, world, events) {
    s.pending = s.pending.filter((p) => p.kind !== 'refRateUp');
    emit(s, events, 'refRateSkipped', {}, 'You leave the rents where they are. The claim stays open for a later letter.');
  },

  listForSale(s, world, events, a) {
    const lot = lotOf(s, a.lotId);
    lot.forSale = { ask: a.ask, since: s.month };
    emit(s, events, 'listed', { lotId: lot.id, ask: a.ask }, `${lot.title} is on the market at ${chf(a.ask)} (value about ${chf(lotValue(s, world, lot.id))}).`);
  },

  cancelSale(s, world, events, a) {
    const lot = lotOf(s, a.lotId);
    lot.forSale = null;
    emit(s, events, 'unlisted', { lotId: lot.id }, `${lot.title} is withdrawn from the market.`);
  },

  chooseRollover(s, world, events, a) {
    const loan = s.loans[a.loanId];
    rollLoan(s, loan, a.product);
    s.pending = s.pending.filter((p) => !(p.kind === 'rollover' && p.loanId === a.loanId));
    emit(s, events, 'rolled', { loanId: loan.id, product: a.product }, `${loan.bankName} mortgage now ${PRODUCTS[a.product].label} at ${(loanRateText(loan))}.`);
  },

  repayLoan(s, world, events, a) {
    const loan = s.loans[a.loanId];
    post(s, events, { reason: 'repay', amount: -a.amount, loanId: loan.id, lotId: loan.lotId, text: `You repay ${chf(a.amount)} of the ${loan.bankName} mortgage.` });
    loan.balance -= a.amount;
    if (loan.balance === 0) {
      delete s.loans[loan.id];
      s.pending = s.pending.filter((p) => p.loanId !== loan.id);
    } else {
      s.pending = s.pending.filter((p) => !(p.kind === 'bankReview' && p.loanId === loan.id && a.amount >= p.required));
    }
  },

  refinance(s, world, events, a) {
    const old = s.loans[a.loanId];
    const q = refinanceQuote(s, world, a.loanId, a.bankId, a.product, a.amount ?? null);
    const lotId = old.lotId;
    post(s, events, { reason: 'repay', amount: -old.balance, loanId: old.id, lotId });
    delete s.loans[old.id];
    s.pending = s.pending.filter((p) => p.loanId !== old.id);
    post(s, events, { reason: 'loan', amount: q.loan, lotId });
    if (q.noteFee) post(s, events, { reason: 'fees', amount: -q.noteFee, lotId });
    const loan = createLoan(s, { bankId: a.bankId, product: a.product, amount: q.loan, lendingValue: q.lendingValue, lotId, rateBps: q.rateBps, amortMonth: q.amortMonth });
    emit(s, events, 'refinanced', { loanId: loan.id, cashOut: q.cashOut }, `Refinanced with ${BANKS[a.bankId].short}: ${chf(q.loan)} at ${(q.rateBps / 100).toFixed(2)}%, ${q.cashOut >= 0 ? `${chf(q.cashOut)} released` : `${chf(-q.cashOut)} paid in`}.`);
  },

  resolveReview(s, world, events, a) {
    const p = s.pending.find((x) => x.kind === 'bankReview' && x.loanId === a.loanId);
    const loan = s.loans[a.loanId];
    if (a.choice === 'inject') {
      const amount = Math.min(p.required, loan.balance);
      post(s, events, { reason: 'repay', amount: -amount, loanId: loan.id, lotId: loan.lotId, text: `You pay down ${chf(amount)} to satisfy ${loan.bankName}.` });
      loan.balance -= amount;
      loan.warnings = 0;
      if (loan.balance === 0) delete s.loans[loan.id];
      s.pending = s.pending.filter((x) => x !== p);
    } else {
      const lot = lotOf(s, loan.lotId);
      if (!lot.forSale) lot.forSale = { ask: lotValue(s, world, lot.id), since: s.month, forced: true };
      emit(s, events, 'listed', { lotId: lot.id, ask: lot.forSale.ask }, `${lot.title} goes on the market to satisfy the bank. Sell within three months or the bank sells for you.`);
    }
  },
};

function rollLoan(s, loan, product) {
  const years = PRODUCTS[product].years;
  loan.product = product;
  loan.rateBps = offeredRateBps(s, loan.bankId, product);
  loan.fixedUntil = years ? s.month + years * 12 : null;
}

function loanRateText(loan) {
  return `${(loan.rateBps / 100).toFixed(2)}%`;
}

export function legalActions(s, world) {
  const out = [];
  const can = (a) => { if (!checkAction(s, world, a)) out.push(a); };
  if (s.over) return out;
  can({ type: 'endMonth' });
  if (s.negotiation) {
    can({ type: 'acceptOffer' });
    can({ type: 'walkAway' });
    if (s.negotiation.counters.player < COUNTER_LIMIT && !s.negotiation.closed) out.push({ type: 'counterOffer' });
  } else if (!s.purchase) {
    for (const id of Object.keys(s.listings)) if (!s.listings[id].reserved) out.push({ type: 'makeOffer', listingId: id });
  }
  if (s.purchase) {
    out.push({ type: 'chooseFinancing' });
    can({ type: 'closePurchase' });
    can({ type: 'abandonPurchase' });
  }
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'player') continue;
    for (const pkg of UNIT_PACKAGES) can({ type: 'startRenovation', unitId: u.id, pkg });
    if (!u.lease && !u.project) out.push({ type: 'setRent', unitId: u.id });
    if (u.applicants) u.applicants.forEach((_, i) => can({ type: 'chooseTenant', unitId: u.id, index: i }));
  }
  for (const lot of Object.values(s.lots)) {
    if (lot.kind === 'building') can({ type: 'startBuildingRenovation', lotId: lot.id });
    if (!lot.forSale) out.push({ type: 'listForSale', lotId: lot.id });
    else can({ type: 'cancelSale', lotId: lot.id });
  }
  for (const p of s.pending) {
    if (p.kind === 'refRateUp') { can({ type: 'passOnRefRate' }); can({ type: 'skipRefRate' }); }
    if (p.kind === 'rollover') for (const prod of (BANKS[s.loans[p.loanId]?.bankId]?.products || [])) can({ type: 'chooseRollover', loanId: p.loanId, product: prod });
    if (p.kind === 'bankReview') { can({ type: 'resolveReview', loanId: p.loanId, choice: 'inject' }); can({ type: 'resolveReview', loanId: p.loanId, choice: 'sell' }); }
  }
  for (const loan of Object.values(s.loans)) {
    if (loan.balance > 0 && s.player.cash > 0) out.push({ type: 'repayLoan', loanId: loan.id });
  }
  return out;
}

export { bankOf };
