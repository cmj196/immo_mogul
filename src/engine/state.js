// Career state: only what the game changed. The world stays outside. Everything here survives
// JSON.parse(JSON.stringify(state)) unchanged.

import { rule } from '../data/rules.js';
import { RIVALS } from '../data/rivals.js';
import { BANK_IDS } from '../data/banks.js';
import { normalizeSeed } from './rng.js';
import { lotValue, lotRentMonth } from './valuation.js';
import { CAREER_MONTHS } from './clock.js';

export const DIFFICULTIES = Object.freeze({
  easy: { id: 'easy', label: 'Easy', cash: 2_000_000, salaryYear: 220_000, savingsMonth: 6_500, blurb: 'A large inheritance and a partner-level salary.' },
  normal: { id: 'normal', label: 'Normal', cash: 1_000_000, salaryYear: 180_000, savingsMonth: 4_500, blurb: 'One million of savings and a good Zurich salary.' },
  hard: { id: 'hard', label: 'Hard', cash: 600_000, salaryYear: 150_000, savingsMonth: 3_000, blurb: 'Enough for one small flat, if the bank agrees.' },
});

export const LOG_CAP = 400;
export const LEDGER_MONTHS = 24;

export function createCareer({ seed = 'zurich', world, difficulty = 'normal', name = 'You' } = {}) {
  if (!world) throw new Error('createCareer needs a world');
  const d = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const curve = { ...rule('fixedCurveBps') };
  const kreise = world.kreise || [4, 5];
  const idx = (v) => Object.fromEntries(kreise.map((k) => [k, v]));
  const rivals = {};
  for (const r of Object.values(RIVALS)) rivals[r.id] = { id: r.id, cash: r.cash, lots: {}, spent: 0 };
  const state = {
    v: 1,
    seed: normalizeSeed(seed),
    seedText: String(seed),
    dataVersion: world.dataVersion,
    difficulty: d.id,
    month: 0,
    player: {
      name,
      cash: d.cash,
      salaryYear: d.salaryYear,
      savingsMonth: d.savingsMonth,
      bankRep: Object.fromEntries(BANK_IDS.map((id) => [id, 50])),
      banksUsed: [],
    },
    macro: {
      policyBps: rule('policyRateBps'),
      saronBps: rule('saronBps'),
      curve,
      refBps: rule('referenceRateBps'),
      cpiBps: rule('cpiYoYBps'),
      avgMortgageBps: 137,
      target: 100,
      targetUntil: 16,
      idx: { price: idx(1), rent: idx(1) },
      momentum: idx(0),
      refHistory: [{ month: 0, bps: rule('referenceRateBps') }],
      policyHistory: [{ month: 0, bps: rule('policyRateBps') }],
    },
    units: {},
    lots: {},
    loans: {},
    listings: {},
    negotiation: null,
    purchase: null,
    pending: [],
    rivals,
    nextId: 1,
    ledger: [],
    year: { rent: 0, interest: 0, running: 0, maintenance: 0, tax: 0, bought: 0, sold: 0 },
    history: [],
    milestones: {},
    stats: { bought: 0, sold: 0, renovations: 0, gainsTax: 0, incomeTax: 0, rentCollected: 0, interestPaid: 0, warnings: 0, forcedSales: 0, challenges: 0, offersMade: 0, dealsWon: 0, lotsEverOwned: 0, highestNetWorth: d.cash },
    log: [],
    over: null,
    monthsNegative: 0,
    lastWarningMonth: -1,
  };
  state.history.push(snapshot(state, world));
  return state;
}

export function nextId(s, prefix) {
  const id = `${prefix}${s.nextId}`;
  s.nextId += 1;
  return id;
}

// ---------- selectors ----------

export function propertyValue(s, world) {
  let v = 0;
  for (const id of Object.keys(s.lots)) v += lotValue(s, world, id);
  return v;
}

export function totalDebt(s) {
  let d = 0;
  for (const l of Object.values(s.loans)) d += l.balance;
  return d;
}

export function netWorth(s, world) {
  return s.player.cash + propertyValue(s, world) - totalDebt(s);
}

export function propertyEquity(s, world) {
  return propertyValue(s, world) - totalDebt(s);
}

export function rentMonth(s) {
  let r = 0;
  for (const id of Object.keys(s.lots)) r += lotRentMonth(s, id);
  return r;
}

export function grossRentYear(s) {
  return rentMonth(s) * 12;
}

export function unitCount(s) {
  return Object.values(s.units).filter((u) => u.owner === 'player').length;
}

export function snapshot(s, world) {
  return {
    month: s.month,
    cash: s.player.cash,
    property: propertyValue(s, world),
    debt: totalDebt(s),
    netWorth: netWorth(s, world),
    rent: rentMonth(s),
    units: unitCount(s),
  };
}

export function isOver(s) {
  return Boolean(s.over);
}

export function monthsLeft(s) {
  return Math.max(0, CAREER_MONTHS - s.month);
}

export function loansOfLot(s, lotId) {
  return Object.values(s.loans).filter((l) => l.lotId === lotId);
}

export function lotDebt(s, lotId) {
  return loansOfLot(s, lotId).reduce((a, l) => a + l.balance, 0);
}

export function lotOfUnit(s, unitId) {
  const u = s.units[unitId];
  return u && u.lotId ? s.lots[u.lotId] : null;
}

export function playerLots(s) {
  return Object.values(s.lots);
}

export function ownsWholeBuilding(s, world, buildingId) {
  const b = world.byId.get(buildingId);
  if (!b) return false;
  const owned = Object.values(s.units).filter((u) => u.buildingId === buildingId && u.owner === 'player').length;
  return owned === b.flats.length;
}

export function pendingOf(s, kind) {
  return s.pending.filter((p) => p.kind === kind);
}

export function hasDecision(s) {
  return Boolean(s.negotiation) || s.pending.length > 0 || Boolean(s.purchase);
}
