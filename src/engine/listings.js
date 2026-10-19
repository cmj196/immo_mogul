// Listings: generated each month inside real buildings. Real facts come from the register, price
// and rent levels from the city statistics, everything else is simulated and labelled as such.

import { rule } from '../data/rules.js';
import { SELLER_TYPES } from '../data/people.js';
import { stream } from './rng.js';
import { round } from './money.js';
import { conditionBand, addressOf } from './world.js';
import { marketRent, condoValue, buildingValue } from './valuation.js';
import { makeExistingLease } from './lease.js';
import { nextId } from './state.js';
import { emit } from './ledger.js';

const SELLER_WEIGHTS = { estate: 15, relocation: 15, divorce: 10, developer: 15, pensioner: 20, investor: 25 };

function touchedBuildings(s) {
  const set = new Set();
  for (const u of Object.values(s.units)) set.add(u.buildingId);
  for (const l of Object.values(s.listings)) set.add(l.buildingId);
  for (const r of Object.values(s.rivals)) for (const lot of Object.values(r.lots)) set.add(lot.buildingId);
  return set;
}

export function roundPrice(x, kind) {
  const step = kind === 'building' ? 50000 : 5000;
  return Math.max(step, Math.round(x / step) * step);
}

function makeUnitState(r, s, world, b, flat, { kind, month }) {
  const [lo, hi] = conditionBand(b);
  const condition = Math.round(r.range(lo, hi));
  const vacantP = kind === 'condo' ? 0.12 : 0.05;
  const market = marketRent(s, world, b, flat, condition);
  const lease = r.chance(vacantP) ? null : makeExistingLease(r, world, { marketRentNow: market, month, refBps: s.macro.refBps, cpiBps: s.macro.cpiBps });
  return { flatIdx: flat.idx, condition, lease, prevRent: lease ? null : round(market * r.range(0.7, 0.95)) };
}

export function generateListing(s, world, b, { kind, flat = null, month }) {
  const r = stream(s.seed, 'listing', b.id, month);
  const units = kind === 'condo' ? [makeUnitState(r, s, world, b, flat, { kind, month })] : b.flats.map((f) => makeUnitState(r, s, world, b, f, { kind, month }));
  if (kind === 'building') {
    // one house, one state of repair, give or take
    const base = units[0].condition;
    for (const u of units) u.condition = Math.max(20, Math.min(100, Math.round(base + r.range(-8, 8))));
  }
  const fair = kind === 'condo'
    ? condoValue(s, world, b, b.flats[units[0].flatIdx], units[0].condition)
    : buildingValue(s, world, b, units.map((u) => ({ flat: b.flats[u.flatIdx], condition: u.condition, rent: u.lease ? u.lease.rent : 0 })));
  const sellerType = SELLER_TYPES[r.weighted(SELLER_WEIGHTS)];
  const premiumCfg = rule('askPremiumPct');
  const premium = Math.max(premiumCfg.min ?? 0, Math.min(premiumCfg.max, r.range(sellerType.premium[0], sellerType.premium[1]) + r.gauss() * 1.5));
  const reserve = round(fair * r.range(sellerType.reserve[0], sellerType.reserve[1]));
  const ask = roundPrice(fair * (1 + premium / 100), kind);
  return {
    id: nextId(s, 'L'),
    kind,
    buildingId: b.id,
    units,
    ask,
    fair,
    reserve: Math.min(reserve, ask),
    seller: { type: sellerType.id, label: sellerType.label, line: sellerType.line, patience: sellerType.patience, counterStep: sellerType.counterStep },
    created: month,
    expires: month + 2 + r.int(3),
    reserved: false,
    title: kind === 'condo' ? `${b.flats[units[0].flatIdx].rooms}-room flat, ${addressOf(b)}` : `${b.flats.length} flats, ${addressOf(b)}`,
  };
}

export function generateMonthlyListings(s, world, events) {
  const m = s.month;
  const r = stream(s.seed, 'listings', m);
  const count = 3 + r.int(3);
  const taken = touchedBuildings(s);
  const pool = world.buildings.filter((b) => !taken.has(b.id));
  const picks = [];
  for (let k = 0; k < count && pool.length; k++) {
    const idx = r.int(pool.length);
    const b = pool.splice(idx, 1)[0];
    const canBuilding = b.flats.length >= 3 && b.flats.length <= 12;
    const kind = canBuilding && r.chance(0.3) ? 'building' : 'condo';
    const flat = kind === 'condo' ? r.pick(b.flats) : null;
    const listing = generateListing(s, world, b, { kind, flat, month: m });
    s.listings[listing.id] = listing;
    picks.push(listing);
  }
  if (picks.length) emit(s, events, 'listings', { ids: picks.map((l) => l.id) }, `${picks.length} new listing${picks.length > 1 ? 's' : ''} this month.`);
  return picks;
}

export function expireListings(s, events) {
  for (const l of Object.values(s.listings)) {
    if (l.reserved) continue;
    if (s.month >= l.expires) {
      delete s.listings[l.id];
      emit(s, events, 'listingGone', { id: l.id, why: 'expired' }, `${l.title} was withdrawn from the market.`);
    }
  }
}
