// Tenants, applicants, rent rules: turnover by lease age, the initial rent challenge, the
// reference rate rule and the value-adding renovation formula.

import { rule } from '../data/rules.js';
import { FIRST_NAMES, LAST_NAMES, TENANT_STORIES, APPLICANT_PROFILES } from '../data/people.js';
import { round } from './money.js';

export const BANDS = ['upTo2', 'y3to10', 'y11to20', 'over20'];
export const BAND_LABEL = { upTo2: 'new lease', y3to10: '3 to 10 years', y11to20: '11 to 20 years', over20: 'over 20 years' };

export function bandOfAge(months) {
  if (months < 36) return 'upTo2';
  if (months < 132) return 'y3to10';
  if (months < 252) return 'y11to20';
  return 'over20';
}

export function monthsForBand(r, band) {
  if (band === 'upTo2') return r.int(30);
  if (band === 'y3to10') return 36 + r.int(96);
  if (band === 'y11to20') return 132 + r.int(120);
  return 252 + r.int(180);
}

export function personName(r) {
  return `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`;
}

export function makeTenant(r, { profile = null } = {}) {
  const p = profile || r.pick(APPLICANT_PROFILES);
  return { name: personName(r), story: r.pick(TENANT_STORIES), profile: p.id, arrearsRisk: p.arrearsRisk, stayBonus: p.stayBonus };
}

// A sitting tenant at listing time: rent below market by the lease-age factor.
export function makeExistingLease(r, world, { marketRentNow, month, refBps, cpiBps }) {
  const band = r.weighted(rule('leaseBandMix'));
  const age = monthsForBand(r, band);
  const factor = world.stats.leaseAgeFactor?.[band] ?? { upTo2: 1, y3to10: 0.9, y11to20: 0.76, over20: 0.62 }[band];
  const rent = round(marketRentNow * factor * r.range(0.94, 1.06) / 10) * 10;
  return { tenant: makeTenant(r), rent, since: month - age, refBps, cpiBps, notice: null, arrears: 0, pendingRent: null };
}

export function makeApplicants(r, { ask, market, prevRent }) {
  const ratio = ask / Math.max(1, market);
  // Zurich has 0.1% vacancy: at or under market, people queue; above it, the queue thins.
  const arrivalP = ratio <= 1.0 ? 0.95 : ratio <= 1.1 ? 0.7 : ratio <= 1.2 ? 0.4 : 0.15;
  if (!r.chance(arrivalP)) return [];
  const n = ratio <= 1.0 ? 2 + r.int(2) : ratio <= 1.1 ? 1 + r.int(2) : 1;
  const out = [];
  for (let k = 0; k < n; k++) {
    const p = r.pick(APPLICANT_PROFILES);
    const t = makeTenant(r, { profile: p });
    out.push({ ...t, line: r.pick(p.lines), label: p.label, willChallenge: challengeRoll(r, { ask, market, prevRent }) });
  }
  return out;
}

// Will a new tenant challenge the initial rent? Only when the rent jumps over 10% above the
// previous rent and also sits above market (a renovation resets prevRent to null).
export function challengeRoll(r, { ask, market, prevRent }) {
  if (!prevRent || prevRent <= 0) return false;
  const jump = ask / prevRent - 1;
  if (jump <= rule('initialRentChallengeJumpPct') / 100) return false;
  if (ask <= market) return false;
  const p = rule('initialRentChallengeBaseProb') * Math.min(1, 0.3 + (jump - 0.1) / 0.2);
  return r.chance(p);
}

// Monthly chance that a sitting tenant gives notice.
export function turnoverHazard(lease, month, { market }) {
  const band = bandOfAge(month - lease.since);
  let h = rule('turnoverMonthlyByBand')[band];
  const gap = market > 0 ? lease.rent / market - 1 : 0;
  if (gap > 0) h *= 1 + 3 * gap;      // paying over market: more likely to go
  else h *= Math.max(0.4, 1 + gap);   // a cheap lease keeps people put
  h /= lease.tenant?.stayBonus || 1;
  return Math.min(0.2, h);
}

// Reference rate rule: +3% per quarter point up, -2.91% per quarter point down, plus 40% of
// inflation, measured from the rate the lease was last set at.
export function refRateAdjustment(lease, refBps, cpiBps) {
  const steps = (refBps - lease.refBps) / 25;
  let factor = 1;
  // quarter-point steps compound (BWO: +0.5 points gives 6.09%, not 6%)
  if (steps > 0) factor *= Math.pow(1 + rule('rentUpPerQuarterPointPct') / 100, steps);
  if (steps < 0) factor *= Math.pow(1 - rule('rentDownPerQuarterPointPct') / 100, -steps);
  const cpiPass = steps > 0 ? Math.max(0, ((cpiBps - (lease.cpiBps ?? cpiBps)) / 10000) * (rule('cpiPassThroughPct') / 100)) : 0;
  factor += cpiPass;
  return { steps, factor, newRent: round((lease.rent * factor) / 5) * 5 };
}

// Monthly rent increase a landlord may pass on for value-adding work with a sitting tenant.
// Annual = value-adding amount x ((ref + 0.5%) / 2 + 1 / lifespan) x 1.10, Federal Court method.
export function renovationRentIncrease(valueAddingAmount, pkg, refBps) {
  if (valueAddingAmount <= 0) return 0;
  const interest = (refBps + rule('renoInterestSpreadBps')) / 2 / 10000;
  const life = rule('renoLifespanYears')[pkg] || 25;
  const annual = valueAddingAmount * (interest + 1 / life) * (1 + rule('renoMaintenanceUpliftPct') / 100);
  return round(annual / 12);
}
