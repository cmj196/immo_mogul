// Renovation packages at unit level, the facade and energy move at building level, condition decay.

import { rule } from '../data/rules.js';
import { stream } from './rng.js';
import { round } from './money.js';
import { buildingOf } from './world.js';
import { unitOf, lotOf, flatOfUnit, marketRent } from './valuation.js';
import { renovationRentIncrease } from './lease.js';
import { emit, post } from './ledger.js';

export const PACKAGES = rule('renoPackages');
export const UNIT_PACKAGES = ['refresh', 'kitchen', 'bath', 'full'];

function quoteNoise(s, ref, pkg) {
  const r = stream(s.seed, 'reno', ref, pkg, Math.floor(s.month / 3));
  const n = rule('renoQuoteNoisePct') / 100;
  return 1 + r.range(-n, n);
}

export function unitRenoQuote(s, world, unitId, pkg) {
  const p = PACKAGES[pkg];
  if (!p || p.building) return null;
  const u = unitOf(s, unitId);
  const { b, flat } = flatOfUnit(world, u);
  const cost = round((p.fixed + p.perM2 * flat.area) * quoteNoise(s, unitId, pkg) / 100) * 100;
  const newCondition = pkg === 'full' ? 100 : Math.min(p.condTo, Math.max(u.condition, Math.min(100, u.condition + p.condAdd)));
  const valueAdding = round(cost * p.valueAdding);
  const sittingIncrease = u.lease ? renovationRentIncrease(valueAdding, pkg, s.macro.refBps) : 0;
  const marketAfter = marketRent(s, world, b, flat, newCondition);
  const marketNow = marketRent(s, world, b, flat, u.condition);
  const blockedBy = u.project ? 'Work is already under way.' : (p.needsVacant && u.lease && !u.lease.notice) ? 'The flat must be empty for a full overhaul.' : null;
  return { pkg, label: p.label, cost, months: p.months, newCondition, valueAdding, sittingIncrease, marketNow, marketAfter, needsVacant: p.needsVacant, blockedBy, maintenance: pkg === 'refresh' };
}

export function buildingRenoQuote(s, world, lotId) {
  const lot = lotOf(s, lotId);
  if (lot.kind !== 'building') return null;
  const p = PACKAGES.facade;
  const b = buildingOf(world, lot.buildingId);
  const cost = round((p.perM2 * b.totalArea) * quoteNoise(s, lotId, 'facade') / 100) * 100;
  const valueAdding = round(cost * p.valueAdding);
  let sittingIncrease = 0;
  for (const id of lot.unitIds) {
    const u = unitOf(s, id);
    if (u.lease) sittingIncrease += renovationRentIncrease(round(valueAdding * b.flats[u.flatIdx].area / b.totalArea), 'facade', s.macro.refBps);
  }
  const blockedBy = lot.project ? 'Work is already under way.' : lot.energy ? 'Already done.' : null;
  return { pkg: 'facade', label: p.label, cost, months: p.months, valueAdding, sittingIncrease, blockedBy };
}

export function startUnitRenovation(s, world, events, unitId, pkg) {
  const q = unitRenoQuote(s, world, unitId, pkg);
  const u = unitOf(s, unitId);
  const lot = lotOf(s, u.lotId);
  post(s, events, { reason: 'renovation', amount: -q.cost, unitId, lotId: lot.id, text: `${q.label} started: ${fmt(q.cost)} paid.` });
  u.project = { pkg, cost: q.cost, start: s.month, ends: s.month + q.months, valueAdding: q.valueAdding, newCondition: q.newCondition };
  if (q.maintenance) s.year.maintenance += q.cost;
  else lot.capitalWorks = (lot.capitalWorks || 0) + q.cost;
  s.stats.renovations += 1;
  emit(s, events, 'renoStart', { unitId, pkg }, null);
  return q;
}

export function startBuildingRenovation(s, world, events, lotId) {
  const q = buildingRenoQuote(s, world, lotId);
  const lot = lotOf(s, lotId);
  post(s, events, { reason: 'renovation', amount: -q.cost, lotId, text: `Facade and energy works started: ${fmt(q.cost)} paid.` });
  lot.project = { pkg: 'facade', cost: q.cost, start: s.month, ends: s.month + q.months, valueAdding: q.valueAdding };
  lot.capitalWorks = (lot.capitalWorks || 0) + q.cost;
  s.stats.renovations += 1;
  return q;
}

// Called at month end. Finishes projects whose end month has come.
export function advanceProjects(s, world, events) {
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'player' || !u.project) continue;
    if (s.month + 1 < u.project.ends) continue;
    const p = u.project;
    u.condition = p.newCondition;
    u.project = null;
    u.lastReno = s.month;
    if (p.pkg === 'full') u.prevRent = null; // a new flat: the old rent no longer anchors the initial rent
    const { b, flat } = flatOfUnit(world, u);
    let text = `${PACKAGES[p.pkg].label} finished at ${b.street} ${b.no}: condition now ${u.condition}.`;
    if (u.lease && p.valueAdding > 0) {
      const inc = renovationRentIncrease(p.valueAdding, p.pkg, s.macro.refBps);
      if (inc > 0) {
        u.lease.pendingRent = { rent: u.lease.rent + inc, from: s.month + 1 + rule('noticeMonths'), why: 'renovation' };
        text += ` Rent rises by ${fmt(inc)} a month after the notice period.`;
      }
    } else if (!u.lease) {
      text += ` Market rent now ${fmt(marketRent(s, world, b, flat, u.condition))}.`;
    }
    emit(s, events, 'renoDone', { unitId: u.id, pkg: p.pkg }, text);
  }
  for (const lot of Object.values(s.lots)) {
    if (!lot.project || s.month + 1 < lot.project.ends) continue;
    const p = lot.project;
    const b = buildingOf(world, lot.buildingId);
    lot.project = null;
    lot.energy = true;
    for (const id of lot.unitIds) {
      const u = unitOf(s, id);
      u.condition = Math.min(100, u.condition + PACKAGES.facade.condAdd);
      if (u.lease) {
        const share = round(p.valueAdding * b.flats[u.flatIdx].area / b.totalArea);
        const inc = renovationRentIncrease(share, 'facade', s.macro.refBps);
        if (inc > 0) u.lease.pendingRent = { rent: u.lease.rent + inc, from: s.month + 1 + rule('noticeMonths'), why: 'renovation' };
      }
    }
    emit(s, events, 'renoDone', { lotId: lot.id, pkg: 'facade' }, `Facade and energy works finished at ${b.street} ${b.no}. Running costs fall by a tenth and sitting tenants get a rent letter.`);
  }
}

export function decayConditions(s) {
  const perMonth = rule('conditionDecayPerYear') / 12;
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'player') continue;
    u.conditionFrac = (u.conditionFrac || 0) + perMonth;
    if (u.conditionFrac >= 1) {
      u.condition = Math.max(20, u.condition - 1);
      u.conditionFrac -= 1;
    }
  }
}

function fmt(n) {
  return `CHF ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}
