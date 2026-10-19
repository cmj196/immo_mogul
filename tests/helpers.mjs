// Shared test helpers: worlds, a throwing `play`, a configurable policy bot, invariant checks and
// a filler that turns the templates from legalActions() into concrete actions.

import { readFileSync } from 'node:fs';
import * as E from '../src/engine/index.js';

export { E };

let realCache = null;
export function realWorld() {
  if (!realCache) realCache = E.prepareWorld(JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8')));
  return realCache;
}

export function fixture() {
  return E.fixtureWorld();
}

// applyAction that throws on a rule error. Returns the full result { state, events }.
export function play(state, world, action) {
  const r = E.applyAction(state, world, action);
  if (r.error) throw new Error(`${action.type} refused: ${r.error} [${JSON.stringify(action)}] at month ${state.month}`);
  return r;
}

export function stateHash(s) {
  return E.hash32(JSON.stringify(s));
}

// Advance with endMonth only until `targetMonth`, in chunks, whatever advance() stops for.
export function advanceTo(state, world, targetMonth, chunk = 12) {
  let s = state;
  let guard = 0;
  while (s.month < targetMonth && !s.over) {
    const r = E.advance(s, world, { maxMonths: Math.min(chunk, targetMonth - s.month) });
    s = r.state;
    if (r.months === 0) throw new Error(`advance made no progress at month ${s.month}: ${r.stoppedBecause}`);
    if (++guard > 10000) throw new Error('advanceTo guard');
  }
  return s;
}

// ---------- invariants ----------

// Every number in a JSON-able object must be finite. Returns the paths that are not.
export function badNumbers(obj, path = '$', out = []) {
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(path);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => badNumbers(v, `${path}[${i}]`, out));
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) badNumbers(obj[k], `${path}.${k}`, out);
  }
  return out;
}

export function checkInvariants(s, world) {
  const problems = badNumbers(s);
  for (const loan of Object.values(s.loans)) {
    if (loan.balance < 0) problems.push(`loan ${loan.id} balance ${loan.balance}`);
    if (!s.lots[loan.lotId]) problems.push(`loan ${loan.id} points at missing lot ${loan.lotId}`);
  }
  for (const u of Object.values(s.units)) {
    const lot = s.lots[u.lotId];
    if (!lot) problems.push(`unit ${u.id} points at missing lot ${u.lotId}`);
    else if (!lot.unitIds.includes(u.id)) problems.push(`lot ${u.lotId} does not list unit ${u.id}`);
    if (!world.byId.get(u.buildingId)) problems.push(`unit ${u.id} in unknown building ${u.buildingId}`);
  }
  for (const lot of Object.values(s.lots)) {
    for (const id of lot.unitIds) if (!s.units[id]) problems.push(`lot ${lot.id} lists missing unit ${id}`);
  }
  for (const p of s.pending) {
    if (p.unitId && !s.units[p.unitId]) problems.push(`pending ${p.kind} for missing unit ${p.unitId}`);
    if (p.loanId && !s.loans[p.loanId]) problems.push(`pending ${p.kind} for missing loan ${p.loanId}`);
    if (p.kind === 'applicants' && !(s.units[p.unitId]?.applicants?.length)) problems.push(`pending applicants with no applicants on ${p.unitId}`);
  }
  if (s.negotiation && s.negotiation.kind === 'sell' && !s.lots[s.negotiation.lotId]) problems.push('sell negotiation on a missing lot');
  if (s.purchase && !s.listings[s.purchase.listingId]) problems.push('purchase on a missing listing');
  return problems;
}

export function sumCashEvents(events) {
  return events.filter((e) => e.type === 'cash').reduce((a, e) => a + e.amount, 0);
}

// ---------- financing ----------

export function bestFinancing(s, world, listing, price, { ltvCap = 1, products = null, banks = E.BANK_IDS } = {}) {
  let best = null;
  for (const bankId of banks) {
    const bank = E.BANKS[bankId];
    const prods = (products || ['fix5']).filter((p) => bank.products.includes(p));
    for (const product of prods) {
      const q = E.quote(s, world, { bankId, product, price, fair: listing.fair, rentMonth: E.listingRentMonth(listing), ref: listing.id });
      if (q.decision === 'no') continue;
      const loan = Math.min(q.maxLoan, Math.floor(price * ltvCap));
      if (loan <= 0) continue;
      const needed = price - loan + E.purchaseCosts(price, loan).total;
      if (!best || loan > best.loan || (loan === best.loan && q.rateBps < best.q.rateBps)) best = { bankId, product, loan, needed, q };
    }
  }
  return best;
}

export function canFinance(s, world, listing, price, o) {
  const f = bestFinancing(s, world, listing, price, { ltvCap: o.ltvCap, products: o.products });
  if (f && s.player.cash - f.needed >= o.cashBuffer) return f;
  if (o.allowCash) {
    const needed = price + E.purchaseCosts(price, 0).total;
    if (s.player.cash - needed >= o.cashBuffer) return { bankId: null, product: null, loan: 0, needed, q: null };
  }
  return null;
}

// ---------- the policy bot ----------

export const BOT_DEFAULTS = Object.freeze({
  buy: true,
  maxLots: Infinity,
  ltvCap: 1,
  cashBuffer: 20_000,
  offerPct: 0.95,
  products: ['fix5'],
  allowCash: false,
  filter: null,              // (listing, s, world) => bool
  overhaulOnVacancy: false,  // full overhaul of an empty flat before letting it
  overhaulBelow: 100,        // only flats under this condition
  sellAfterMonths: null,     // list a lot for sale once held this long
  sellAskFactor: 1.03,
  counterSellOffers: true,   // counter once at the asking price, then accept
  rolloverProduct: 'fix5',
});

export function makeBot(opts = {}) {
  const o = { ...BOT_DEFAULTS, ...opts };
  const mem = { offered: new Set() };
  return { opts: o, mem, next: (s, world) => nextBotAction(s, world, o, mem) };
}

export function marketRentOf(s, world, u) {
  const { b, flat } = E.flatOfUnit(world, u);
  return Math.round(E.marketRent(s, world, b, flat, u.condition) / 10) * 10;
}

// One action the bot wants to take now, or null when the month can end.
export function nextBotAction(s, world, o, mem) {
  if (s.over) return null;
  const neg = s.negotiation;
  if (neg) {
    if (neg.kind === 'buy') {
      const l = s.listings[neg.listingId];
      if (l && canFinance(s, world, l, neg.price, o)) return { type: 'acceptOffer' };
      return { type: 'walkAway' };
    }
    const lot = s.lots[neg.lotId];
    const ask = lot?.forSale?.ask ?? neg.price;
    if (o.counterSellOffers && neg.counters.player === 0 && neg.price < ask) return { type: 'counterOffer', price: ask };
    return { type: 'acceptOffer' };
  }
  if (s.purchase) {
    if (s.purchase.financing) return { type: 'closePurchase' };
    const l = s.listings[s.purchase.listingId];
    const f = l && canFinance(s, world, l, s.purchase.price, o);
    if (f) return f.loan > 0 ? { type: 'chooseFinancing', bankId: f.bankId, product: f.product, loan: f.loan } : { type: 'chooseFinancing', loan: 0 };
    return { type: 'abandonPurchase' };
  }
  for (const p of s.pending) {
    if (p.kind === 'refRateUp') return { type: 'passOnRefRate' };
    if (p.kind === 'rollover') {
      const loan = s.loans[p.loanId];
      const product = E.BANKS[loan.bankId].products.includes(o.rolloverProduct) ? o.rolloverProduct : E.BANKS[loan.bankId].products[0];
      return { type: 'chooseRollover', loanId: p.loanId, product };
    }
    if (p.kind === 'bankReview') {
      const loan = s.loans[p.loanId];
      if (s.player.cash >= p.required) return { type: 'resolveReview', loanId: p.loanId, choice: 'inject' };
      if (!s.lots[loan.lotId].forSale) return { type: 'resolveReview', loanId: p.loanId, choice: 'sell' };
      continue;
    }
    if (p.kind === 'applicants') {
      const u = s.units[p.unitId];
      if (u.applicants && u.applicants.length) return { type: 'chooseTenant', unitId: u.id, index: 0 };
      return { type: 'declineApplicants', unitId: u.id };
    }
  }
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'player' || u.lease || u.project) continue;
    if (o.overhaulOnVacancy && u.condition < o.overhaulBelow && !u.lastReno) {
      const q = E.unitRenoQuote(s, world, u.id, 'full');
      if (!q.blockedBy && s.player.cash - q.cost >= o.cashBuffer) return { type: 'startRenovation', unitId: u.id, pkg: 'full' };
    }
    if (!u.askRent) return { type: 'setRent', unitId: u.id, rent: marketRentOf(s, world, u) };
  }
  if (o.sellAfterMonths !== null) {
    for (const lot of Object.values(s.lots)) {
      if (lot.forSale || lot.project) continue;
      if (lot.unitIds.some((id) => s.units[id].project)) continue;
      if (s.month - lot.bought.month < o.sellAfterMonths) continue;
      return { type: 'listForSale', lotId: lot.id, ask: Math.round(E.lotValue(s, world, lot.id) * o.sellAskFactor) };
    }
  }
  if (o.buy && Object.keys(s.lots).length < o.maxLots) {
    const cands = Object.values(s.listings)
      .filter((l) => !l.reserved && !mem.offered.has(l.id) && (!o.filter || o.filter(l, s, world)))
      .sort((a, b) => a.ask - b.ask);
    for (const l of cands) {
      if (!canFinance(s, world, l, l.ask, o)) continue;
      mem.offered.add(l.id);
      return { type: 'makeOffer', listingId: l.id, price: Math.max(Math.ceil(l.ask * 0.5), Math.round(l.ask * o.offerPct)) };
    }
  }
  return null;
}

// Play `months` months with a bot. onAction(before, result, action) is called after every action.
export function runBot(state, world, { months, bot, onAction = null, maxActionsPerMonth = 300 }) {
  let s = state;
  const target = s.month + months;
  while (!s.over && s.month < target) {
    let n = 0;
    for (;;) {
      const a = bot.next(s, world);
      if (!a) break;
      const r = play(s, world, a);
      if (onAction) onAction(s, r, a);
      s = r.state;
      if (++n > maxActionsPerMonth) throw new Error(`bot took ${n} actions in month ${s.month}: ${JSON.stringify(a)}`);
    }
    const r = play(s, world, { type: 'endMonth' });
    if (onAction) onAction(s, r, { type: 'endMonth' });
    s = r.state;
  }
  return s;
}

// ---------- setup shortcuts for engine tests ----------

// Advance until a condo listing the player can finance appears, offer the seller's reserve (an
// instant accept), finance with the best bank and close. Returns { state, lotId, unitId, listing, financing }.
export function buyCondo(state, world, { vacant = null, maxMonths = 60, ltvCap = 1, bankId = null, product = 'fix5' } = {}) {
  let s = state;
  for (let k = 0; k < maxMonths; k++) {
    const cands = Object.values(s.listings)
      .filter((l) => l.kind === 'condo' && !l.reserved && (vacant === null || Boolean(l.units[0].lease) === !vacant))
      .sort((a, b) => a.ask - b.ask);
    for (const l of cands) {
      const price = Math.min(l.ask, Math.max(l.reserve, Math.ceil(l.ask * 0.5)));
      const f = bestFinancing(s, world, l, price, { ltvCap, products: [product], banks: bankId ? [bankId] : E.BANK_IDS });
      if (!f || s.player.cash < f.needed) continue;
      s = play(s, world, { type: 'makeOffer', listingId: l.id, price }).state;
      if (!s.purchase) continue;
      s = play(s, world, { type: 'chooseFinancing', bankId: f.bankId, product: f.product, loan: f.loan }).state;
      const before = s;
      const r = play(s, world, { type: 'closePurchase' });
      s = r.state;
      const lotId = r.events.find((e) => e.type === 'bought').lotId;
      return { state: s, before, result: r, lotId, unitId: s.lots[lotId].unitIds[0], listing: l, financing: f, price };
    }
    s = play(s, world, { type: 'endMonth' }).state;
  }
  throw new Error('no financeable condo found');
}

// Turn a template from legalActions() into a concrete action with sensible parameters, or null.
export function concreteAction(s, world, a) {
  switch (a.type) {
    case 'makeOffer': {
      const l = s.listings[a.listingId];
      return { ...a, price: Math.max(Math.ceil(l.ask * 0.5), Math.round(l.ask * 0.9)) };
    }
    case 'counterOffer': {
      const neg = s.negotiation;
      const mine = E.lastOfferBy(neg, 'player');
      let price;
      if (neg.kind === 'buy') {
        const lo = (mine ?? 0) + 1;
        const hi = neg.price - 1;
        if (hi < lo) return null;
        price = Math.floor((lo + hi) / 2);
      } else {
        const lo = neg.price + 1;
        const hi = mine ? mine - 1 : neg.price + Math.max(2, Math.round(neg.price * 0.05));
        if (hi < lo) return null;
        price = Math.floor((lo + hi) / 2);
      }
      return { type: 'counterOffer', price };
    }
    case 'chooseFinancing': {
      const l = s.listings[s.purchase.listingId];
      const f = bestFinancing(s, world, l, s.purchase.price);
      if (f && s.player.cash >= f.needed) return { type: 'chooseFinancing', bankId: f.bankId, product: f.product, loan: f.loan };
      if (s.player.cash >= s.purchase.price + E.purchaseCosts(s.purchase.price, 0).total) return { type: 'chooseFinancing', loan: 0 };
      return null;
    }
    case 'setRent':
      return { ...a, rent: marketRentOf(s, world, s.units[a.unitId]) };
    case 'listForSale':
      return { ...a, ask: E.lotValue(s, world, a.lotId) };
    case 'repayLoan': {
      const amount = Math.min(s.player.cash, s.loans[a.loanId].balance, 1000);
      return amount >= 1 ? { ...a, amount } : null;
    }
    default:
      return a;
  }
}

export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
