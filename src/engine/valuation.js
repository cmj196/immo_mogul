// Values and rents of units and lots. A lot is what you buy, finance and sell: one condo, or a
// whole building. A unit is one flat: what you let and renovate.

import { rule } from '../data/rules.js';
import { buildingOf, condoPerM2, newLetPerM2, periodFactor, capRateBps } from './world.js';
import { round } from './money.js';

export function conditionPriceFactor(c) {
  return 0.82 + 0.18 * (Math.min(100, Math.max(0, c)) / 100);
}

export function conditionRentFactor(c) {
  return 0.86 + 0.16 * (Math.min(100, Math.max(0, c)) / 100);
}

export function priceIndex(state, kreis) {
  return state.macro.idx.price[kreis] ?? 1;
}

export function rentIndex(state, kreis) {
  return state.macro.idx.rent[kreis] ?? 1;
}

// Market rent for a new tenancy of this flat today, CHF per month.
export function marketRent(state, world, b, flat, condition) {
  const perM2 = newLetPerM2(world, b, flat.rooms) * conditionRentFactor(condition) * rentIndex(state, b.kreis);
  return round(perM2 * flat.area);
}

// Fair value of one flat sold as a condominium today.
export function condoValue(state, world, b, flat, condition) {
  return round(condoPerM2(world, b) * flat.area * periodFactor(b) * conditionPriceFactor(condition) * priceIndex(state, b.kreis));
}

// Fair value of a whole building: income approach on a blend of in-place and market rent, net of
// running costs, capitalised at the Kreis rate. units: [{ flat, condition, rent (in place, 0 if empty) }].
export function buildingValue(state, world, b, units) {
  const cap = capRateBps(b) / 10000;
  let inPlace = 0;
  let market = 0;
  for (const u of units) {
    const m = marketRent(state, world, b, u.flat, u.condition);
    market += m;
    inPlace += u.rent > 0 ? u.rent : m * 0.5; // an empty flat still carries half its rent in the appraisal
  }
  const grossYear = (0.6 * inPlace + 0.4 * market) * 12;
  const netYear = grossYear * (1 - 0.25);
  return round(netYear / cap);
}

export function unitOf(state, unitId) {
  const u = state.units[unitId];
  if (!u) throw new Error(`unknown unit ${unitId}`);
  return u;
}

export function lotOf(state, lotId) {
  const l = state.lots[lotId];
  if (!l) throw new Error(`unknown lot ${lotId}`);
  return l;
}

export function flatOfUnit(world, unit) {
  const b = buildingOf(world, unit.buildingId);
  return { b, flat: b.flats[unit.flatIdx] };
}

export function unitRent(unit) {
  return unit.lease ? unit.lease.rent : 0;
}

// Fair value of an owned lot today.
export function lotValue(state, world, lotId) {
  const lot = lotOf(state, lotId);
  const b = buildingOf(world, lot.buildingId);
  if (lot.kind === 'condo') {
    const u = unitOf(state, lot.unitIds[0]);
    return condoValue(state, world, b, b.flats[u.flatIdx], u.condition);
  }
  const units = lot.unitIds.map((id) => {
    const u = unitOf(state, id);
    return { flat: b.flats[u.flatIdx], condition: u.condition, rent: unitRent(u) };
  });
  let v = buildingValue(state, world, b, units);
  if (lot.energy) v = round(v * 1.04);
  return v;
}

export function lotRentMonth(state, lotId) {
  const lot = lotOf(state, lotId);
  return lot.unitIds.reduce((s, id) => s + unitRent(unitOf(state, id)), 0);
}

export function lotMarketRentMonth(state, world, lotId) {
  const lot = lotOf(state, lotId);
  const b = buildingOf(world, lot.buildingId);
  return lot.unitIds.reduce((s, id) => {
    const u = unitOf(state, id);
    return s + marketRent(state, world, b, b.flats[u.flatIdx], u.condition);
  }, 0);
}

export function runningCostMonth(state, world, lotId) {
  const lot = lotOf(state, lotId);
  const p = lot.kind === 'condo' ? rule('runningCostPctCondo') : rule('runningCostPctBuilding');
  const v = lotValue(state, world, lotId);
  const base = round((v * p) / 100 / 12);
  return lot.energy ? round(base * 0.9) : base;
}

// Value of a listing (fair) is stored at generation time; this recomputes it at today's indices.
export function listingFairToday(state, world, listing) {
  const b = buildingOf(world, listing.buildingId);
  if (listing.kind === 'condo') {
    const u = listing.units[0];
    return condoValue(state, world, b, b.flats[u.flatIdx], u.condition);
  }
  return buildingValue(state, world, b, listing.units.map((u) => ({ flat: b.flats[u.flatIdx], condition: u.condition, rent: u.lease ? u.lease.rent : 0 })));
}

export function listingRentMonth(listing) {
  return listing.units.reduce((s, u) => s + (u.lease ? u.lease.rent : 0), 0);
}

export function listingArea(world, listing) {
  const b = buildingOf(world, listing.buildingId);
  return listing.units.reduce((s, u) => s + b.flats[u.flatIdx].area, 0);
}
