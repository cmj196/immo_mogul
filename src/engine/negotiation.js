// Counter-offer protocol, for buying (seller counters you) and selling (a buyer offers, you
// counter). A pending record holds who answers, whose price is on the table, the counters each
// side has used and the full history. Each side counters at most COUNTER_LIMIT times. The
// counterparty's reply is drawn from stream(seed, 'negotiation', ref, round).

import { stream } from './rng.js';
import { round } from './money.js';
import { BUYER_TYPES } from '../data/people.js';
import { roundPrice } from './listings.js';

export const COUNTER_LIMIT = 3;

export function interestOf(price, reserve, kind) {
  // for a buy: how close the player's price is to the seller's reserve (higher is keener)
  // for a sell: how far the player's ask is above the buyer's reserve (lower is keener)
  const x = kind === 'buy' ? price / reserve : reserve / price;
  if (x >= 0.97) return 'keen';
  if (x >= 0.9) return 'lukewarm';
  return 'cold';
}

export function openBuyNegotiation(s, listing, price) {
  return {
    kind: 'buy',
    ref: listing.id,
    listingId: listing.id,
    actor: 'counterparty',
    from: 'player',
    price,
    counters: { player: 0, counterparty: 0 },
    history: [{ by: 'player', kind: 'offer', price }],
    patience: listing.seller.patience,
    final: false,
    closed: null,
  };
}

// Seller's reply to the player's price on the table. Mutates the negotiation. Returns the reply kind.
export function sellerReply(s, listing, neg) {
  const round_ = neg.history.length;
  const r = stream(s.seed, 'negotiation', listing.id, round_);
  const price = neg.price;
  const reserve = listing.reserve;
  const lastSeller = [...neg.history].reverse().find((h) => h.by === 'counterparty')?.price ?? listing.ask;
  const interest = interestOf(price, reserve, 'buy');

  if (price >= reserve) {
    // close enough: the seller takes it (at the player's price, never above)
    neg.actor = 'player';
    neg.closed = { outcome: 'accepted', price };
    neg.history.push({ by: 'counterparty', kind: 'accept', price, interest: 'keen' });
    return 'accept';
  }
  const insulting = price < reserve * 0.85;
  const outOfCounters = neg.counters.counterparty >= COUNTER_LIMIT || neg.patience <= 0;
  if ((insulting && round_ > 1) || outOfCounters || (neg.final && price < lastSeller)) {
    neg.closed = { outcome: 'walked', price: lastSeller };
    neg.history.push({ by: 'counterparty', kind: 'walk', price: lastSeller, interest });
    neg.actor = 'player';
    return 'walk';
  }
  // Counter: move part of the way from the last seller price toward the higher of reserve and offer.
  const anchor = Math.max(reserve, price);
  const step = listing.seller.counterStep * r.range(0.85, 1.15);
  let next = lastSeller - (lastSeller - anchor) * step;
  next = Math.max(reserve, next);
  next = roundPrice(next, listing.kind);
  if (next <= price) {
    neg.actor = 'player';
    neg.closed = { outcome: 'accepted', price };
    neg.history.push({ by: 'counterparty', kind: 'accept', price, interest: 'keen' });
    return 'accept';
  }
  neg.patience -= 1;
  neg.counters.counterparty += 1;
  neg.final = neg.counters.counterparty >= COUNTER_LIMIT || neg.patience <= 0;
  neg.price = next;
  neg.from = 'counterparty';
  neg.actor = 'player';
  neg.history.push({ by: 'counterparty', kind: 'counter', price: next, interest, final: neg.final });
  return 'counter';
}

// ---------- selling ----------

export function makeBuyer(s, lot, fair, ask, month) {
  const r = stream(s.seed, 'buyer', lot.id, month);
  const types = lot.kind === 'building' ? ['pension', 'investor'] : ['family', 'investor', 'upsizer'];
  const t = BUYER_TYPES[r.pick(types)];
  const reserve = round(fair * r.range(t.reserve[0], t.reserve[1]));
  const opening = roundPrice(Math.min(ask, fair * r.range(t.opening[0], t.opening[1])), lot.kind);
  return { type: t.id, label: t.label, line: t.line, reserve: Math.max(opening, reserve), patience: t.patience, counterStep: t.counterStep, opening };
}

export function openSellNegotiation(s, lot, buyer) {
  return {
    kind: 'sell',
    ref: lot.id,
    lotId: lot.id,
    buyer,
    actor: 'player',
    from: 'counterparty',
    price: buyer.opening,
    counters: { player: 0, counterparty: 0 },
    history: [{ by: 'counterparty', kind: 'offer', price: buyer.opening, interest: interestOf(lot.forSale.ask, buyer.reserve, 'sell') }],
    patience: buyer.patience,
    final: false,
    closed: null,
  };
}

export function buyerReply(s, lot, neg) {
  const round_ = neg.history.length;
  const r = stream(s.seed, 'negotiation', lot.id, round_);
  const ask = neg.price; // the player's counter now on the table
  const b = neg.buyer;
  const lastBuyer = [...neg.history].reverse().find((h) => h.by === 'counterparty')?.price ?? b.opening;
  const interest = interestOf(ask, b.reserve, 'sell');
  if (ask <= b.reserve) {
    neg.closed = { outcome: 'accepted', price: ask };
    neg.history.push({ by: 'counterparty', kind: 'accept', price: ask, interest: 'keen' });
    neg.actor = 'player';
    return 'accept';
  }
  const tooHigh = ask > b.reserve * 1.12;
  const out = neg.counters.counterparty >= COUNTER_LIMIT || neg.patience <= 0;
  if ((tooHigh && round_ > 2) || out || (neg.final && ask > lastBuyer)) {
    neg.closed = { outcome: 'walked', price: lastBuyer };
    neg.history.push({ by: 'counterparty', kind: 'walk', price: lastBuyer, interest });
    neg.actor = 'player';
    return 'walk';
  }
  const anchor = Math.min(b.reserve, ask);
  const step = b.counterStep * r.range(0.85, 1.15);
  let next = lastBuyer + (anchor - lastBuyer) * step;
  next = Math.min(b.reserve, next);
  next = roundPrice(next, lot.kind);
  if (next >= ask) {
    neg.closed = { outcome: 'accepted', price: ask };
    neg.history.push({ by: 'counterparty', kind: 'accept', price: ask, interest: 'keen' });
    neg.actor = 'player';
    return 'accept';
  }
  neg.patience -= 1;
  neg.counters.counterparty += 1;
  neg.final = neg.counters.counterparty >= COUNTER_LIMIT || neg.patience <= 0;
  neg.price = next;
  neg.from = 'counterparty';
  neg.actor = 'player';
  neg.history.push({ by: 'counterparty', kind: 'counter', price: next, interest, final: neg.final });
  return 'counter';
}

export function lastOfferBy(neg, who) {
  return [...neg.history].reverse().find((h) => h.by === who && (h.kind === 'offer' || h.kind === 'counter'))?.price ?? null;
}

export function describeReply(kind, neg, counterpartyLabel) {
  const last = neg.history[neg.history.length - 1];
  if (kind === 'accept') return `${counterpartyLabel} accepts ${fmt(last.price)}.`;
  if (kind === 'walk') return `${counterpartyLabel} ends the talks.`;
  const tone = last.interest === 'keen' ? 'keen' : last.interest === 'lukewarm' ? 'lukewarm' : 'cool';
  return `${counterpartyLabel} counters at ${fmt(last.price)}${last.final ? ' (final)' : ''}, sounding ${tone}.`;
}

function fmt(n) {
  return `CHF ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}
