// Milestones, the year-end report and the career summary.

import { snapshot, netWorth, unitCount, propertyEquity } from './state.js';
import { rivalSummary } from './rivals.js';
import { emit } from './ledger.js';
import { CAREER_MONTHS, yearOf } from './clock.js';
import { chf } from './money.js';

export const MILESTONES = [
  { id: 'firstUnit', label: 'First flat', test: (s) => unitCount(s) >= 1 },
  { id: 'threeUnits', label: 'Three units', test: (s) => unitCount(s) >= 3 },
  { id: 'firstBuilding', label: 'A whole building', test: (s) => Object.values(s.lots).some((l) => l.kind === 'building') },
  { id: 'tenUnits', label: 'Ten units', test: (s) => unitCount(s) >= 10 },
  { id: 'equity1m', label: 'CHF 1M of property equity', test: (s, w) => propertyEquity(s, w) >= 1_000_000 },
  { id: 'equity2m', label: 'CHF 2M of property equity', test: (s, w) => propertyEquity(s, w) >= 2_000_000 },
  { id: 'equity5m', label: 'CHF 5M of property equity', test: (s, w) => propertyEquity(s, w) >= 5_000_000 },
  { id: 'fullReno', label: 'First full overhaul', test: (s) => s.stats.fullRenovations >= 1 },
  { id: 'firstGain', label: 'First sale with a gain', test: (s) => s.stats.salesWithGain >= 1 },
  { id: 'bothKreise', label: 'A foothold in both Kreise', test: (s, w) => new Set(Object.values(s.lots).map((l) => w.byId.get(l.buildingId)?.kreis)).size >= 2 },
  { id: 'allBanks', label: 'A client of all three banks', test: (s) => s.player.banksUsed.length >= 3 },
  { id: 'fiveCleanYears', label: 'Five years without a bank warning', test: (s) => s.month >= 60 && s.month - s.lastWarningMonth >= 60 && Object.keys(s.loans).length > 0 },
  { id: 'doubled', label: 'Net worth doubled', test: (s, w) => netWorth(s, w) >= 2 * s.history[0].netWorth },
];

export function checkMilestones(s, world, events) {
  for (const m of MILESTONES) {
    if (s.milestones[m.id] !== undefined) continue;
    let hit = false;
    try { hit = m.test(s, world); } catch { hit = false; }
    if (hit) {
      s.milestones[m.id] = s.month;
      emit(s, events, 'milestone', { id: m.id, label: m.label }, `Milestone: ${m.label}.`);
    }
  }
}

export function recordHistory(s, world) {
  const snap = snapshot(s, world);
  s.history.push(snap);
  if (snap.netWorth > s.stats.highestNetWorth) s.stats.highestNetWorth = snap.netWorth;
  return snap;
}

export function yearEndReport(s, world, events) {
  const now = s.history[s.history.length - 1];
  const start = s.history.find((h) => h.month === s.month - 11) || s.history[0];
  const rivals = rivalSummary(s, world);
  const rank = 1 + rivals.filter((r) => r.value - r.debt > now.property - now.debt).length;
  const rep = {
    year: yearOf(s.month - 1),
    netWorth: now.netWorth,
    change: now.netWorth - start.netWorth,
    rent: s.year.rent,
    interest: s.year.interest,
    running: s.year.running,
    tax: s.year.tax,
    bought: s.year.bought,
    sold: s.year.sold,
    units: now.units,
    rank,
  };
  emit(s, events, 'yearEnd', { report: rep }, `${rep.year} closed: net worth ${chf(rep.netWorth)} (${chf(rep.change, { sign: true })}), rent ${chf(rep.rent)}, interest ${chf(rep.interest)}, tax ${chf(rep.tax)}.`);
  s.year = { rent: 0, interest: 0, running: 0, maintenance: 0, tax: 0, bought: 0, sold: 0 };
  return rep;
}

export function careerSummary(s, world) {
  const first = s.history[0];
  const last = s.history[s.history.length - 1];
  const years = Math.max(1, s.month / 12);
  const multiple = first.netWorth > 0 ? last.netWorth / first.netWorth : 0;
  const cagr = multiple > 0 ? Math.pow(multiple, 1 / years) - 1 : -1;
  const rivals = rivalSummary(s, world);
  const equity = last.property - last.debt;
  const rank = 1 + rivals.filter((r) => r.value - r.debt > equity).length;
  let grade = 'Tenant';
  if (multiple >= 4) grade = 'Mogul';
  else if (multiple >= 2.5) grade = 'Developer';
  else if (multiple >= 1.6) grade = 'Investor';
  else if (multiple >= 1.1) grade = 'Saver';
  return {
    months: s.month, done: s.month >= CAREER_MONTHS, startNetWorth: first.netWorth, netWorth: last.netWorth, multiple, cagr,
    units: last.units, property: last.property, debt: last.debt, equity, rank, rivals, grade,
    stats: { ...s.stats }, milestones: Object.keys(s.milestones).length, milestoneTotal: MILESTONES.length, over: s.over,
  };
}
