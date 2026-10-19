// Rival investors take listings between months and hold them. They are not simulated unit by
// unit: a rival lot keeps the condition snapshot and is valued at today's indices.

import { RIVALS, RIVAL_IDS } from '../data/rivals.js';
import { stream } from './rng.js';
import { round } from './money.js';
import { buildingOf } from './world.js';
import { condoValue, buildingValue, listingFairToday } from './valuation.js';
import { emit } from './ledger.js';

function dealFactor(ask, fair) {
  const over = ask / fair - 1;
  return Math.max(0.15, Math.min(1.6, 1.6 - over * 8));
}

export function rivalsTakeListings(s, world, events) {
  const m = s.month;
  for (const listing of Object.values(s.listings)) {
    if (listing.reserved) continue;
    const fair = listingFairToday(s, world, listing);
    const b = buildingOf(world, listing.buildingId);
    const age = m - listing.created;
    if (age === 0) continue; // the player always sees a listing for one month first
    for (const rid of RIVAL_IDS) {
      const cfg = RIVALS[rid];
      const rival = s.rivals[rid];
      const r = stream(s.seed, 'rival', rid, listing.id, m);
      const kindW = cfg.kinds[listing.kind] || 0;
      if (kindW <= 0) continue;
      if (listing.ask / fair > cfg.maxOverFair && age < 2) continue;
      const p = cfg.keenness * kindW * (cfg.kreisBias[b.kreis] ?? 1) * dealFactor(listing.ask, fair) * Math.pow(0.85, age - 1);
      if (!r.chance(p)) continue;
      const price = Math.min(listing.ask, Math.max(listing.reserve, round(fair * r.range(0.97, 1.0))));
      const equity = round(price * 0.35);
      if (rival.cash < equity) continue;
      rival.cash -= equity;
      rival.spent += price;
      rival.lots[listing.id] = {
        id: listing.id, buildingId: b.id, kind: listing.kind, price, month: m,
        units: listing.units.map((u) => ({ flatIdx: u.flatIdx, condition: u.condition, rent: u.lease ? u.lease.rent : 0 })),
        debt: price - equity,
      };
      delete s.listings[listing.id];
      emit(s, events, 'listingGone', { id: listing.id, why: 'rival', rivalId: rid }, `${listing.title} went to ${cfg.name}.`);
      break;
    }
  }
}

export function rivalLotValue(s, world, lot) {
  const b = buildingOf(world, lot.buildingId);
  if (lot.kind === 'condo') {
    const u = lot.units[0];
    return condoValue(s, world, b, b.flats[u.flatIdx], u.condition);
  }
  return buildingValue(s, world, b, lot.units.map((u) => ({ flat: b.flats[u.flatIdx], condition: u.condition, rent: u.rent })));
}

export function rivalSummary(s, world) {
  return RIVAL_IDS.map((rid) => {
    const cfg = RIVALS[rid];
    const r = s.rivals[rid];
    const lots = Object.values(r.lots);
    let value = 0;
    let debt = 0;
    let units = 0;
    for (const lot of lots) {
      value += rivalLotValue(s, world, lot);
      debt += lot.debt;
      units += lot.units.length;
    }
    return { id: rid, name: cfg.name, short: cfg.short, color: cfg.color, lots: lots.length, units, value, debt, gain: value - r.spent };
  });
}

// building id -> owner tag for the map ('player', rival id, 'listing')
export function ownershipMap(s) {
  const out = new Map();
  for (const l of Object.values(s.listings)) out.set(l.buildingId, { owner: 'listing', ids: [l.id] });
  for (const rid of RIVAL_IDS) {
    for (const lot of Object.values(s.rivals[rid].lots)) out.set(lot.buildingId, { owner: rid, ids: [lot.id] });
  }
  for (const lot of Object.values(s.lots)) {
    const prev = out.get(lot.buildingId);
    out.set(lot.buildingId, { owner: 'player', ids: prev && prev.owner === 'player' ? [...prev.ids, lot.id] : [lot.id] });
  }
  return out;
}
