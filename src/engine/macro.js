// Rates and market indices. Policy rate: a mean-reverting random walk in quarter-point steps at
// quarter months. Fixed curve: term premium over the policy rate with partial pass-through. The
// reference rate (BWO) follows a slow average of mortgage rates, rounded to the quarter point,
// published at quarter months. Price and rent indices per Kreis: drift, rate sensitivity,
// momentum and shocks. All draws come from stream(seed, 'macro', month).

import { stream } from './rng.js';
import { rule } from '../data/rules.js';
import { isQuarterMonth } from './clock.js';
import { emit } from './ledger.js';
import { bpsText } from './money.js';

const BASE_CURVE = rule('fixedCurveBps'); // at policy 0

export function roundQuarter(bps) {
  return Math.round(bps / 25) * 25;
}

export function saronMortgageBps(macro) {
  return Math.max(0, macro.saronBps) + rule('saronMarginBps');
}

export function curveFor(macro, product) {
  if (product === 'saron') return saronMortgageBps(macro);
  const years = Number(product.replace('fix', ''));
  return macro.curve[years] ?? macro.curve[5];
}

export function stepMacro(s, world, events) {
  const m = s.month;
  const r = stream(s.seed, 'macro', m);
  const mac = s.macro;
  const kreise = Object.keys(mac.idx.price);
  const prevPolicy = mac.policyBps;

  if (isQuarterMonth(m)) {
    // regime: a new long-run target every 12 to 20 quarters
    if (m >= mac.targetUntil) {
      mac.target = Math.round(r.range(0, 225) / 25) * 25;
      mac.targetUntil = m + 3 * (12 + r.int(9));
    }
    const delta = 0.18 * (mac.target - mac.policyBps) + r.gauss() * 18;
    let move = Math.round(delta / 25) * 25;
    move = Math.max(-50, Math.min(50, move));
    if (move !== 0) {
      mac.policyBps = Math.max(-75, Math.min(300, mac.policyBps + move));
      mac.policyHistory.push({ month: m, bps: mac.policyBps });
      emit(s, events, 'snb', { bps: mac.policyBps, move }, `SNB ${move > 0 ? 'raises' : 'cuts'} the policy rate to ${bpsText(mac.policyBps)}.`);
    } else {
      emit(s, events, 'snb', { bps: mac.policyBps, move: 0 }, `SNB holds the policy rate at ${bpsText(mac.policyBps)}.`);
    }
    // inflation drifts, mean-reverting to 0.8%
    mac.cpiBps = Math.round(Math.max(-50, Math.min(350, mac.cpiBps + 0.25 * (80 - mac.cpiBps) + r.gauss() * 20))) || 0; // never -0: the state must survive JSON
  }

  mac.saronBps = Math.round(mac.policyBps - 5 + r.gauss() * 2) || 0;
  const p = Math.max(0, mac.policyBps);
  for (const y of Object.keys(BASE_CURVE)) {
    const passThrough = y <= 2 ? 0.85 : y <= 5 ? 0.65 : 0.5;
    const noise = r.gauss() * 4;
    const target = BASE_CURVE[y] + passThrough * p + noise;
    // move a third of the way each month so the curve is smooth
    mac.curve[y] = Math.round(mac.curve[y] + (target - mac.curve[y]) * 0.35);
  }

  // Book average of mortgage rates: an EMA of what banks charge, slow (banks' books reprice over years).
  const marketMix = 0.45 * mac.curve[5] + 0.35 * mac.curve[10] + 0.2 * saronMortgageBps(mac);
  // Banks' books carry old cheap loans and effective rates sit under list rates, so the average
  // drifts slowly toward the market mix less a discount (assumption).
  mac.avgMortgageBps = mac.avgMortgageBps + (marketMix - 40 - mac.avgMortgageBps) * 0.025;

  if (isQuarterMonth(m)) {
    const ref = Math.max(25, roundQuarter(mac.avgMortgageBps));
    if (ref !== mac.refBps) {
      const dir = ref > mac.refBps ? 'rises' : 'falls';
      mac.refBps = ref;
      mac.refHistory.push({ month: m, bps: ref });
      emit(s, events, 'refRate', { bps: ref, dir }, `Reference rate ${dir} to ${bpsText(ref)}. ${dir === 'rises' ? 'Landlords may raise rents by 3% per quarter point.' : 'Tenants may claim a cut of 2.91% per quarter point.'}`);
    } else {
      emit(s, events, 'refRateHold', { bps: ref }, `Reference rate stays at ${bpsText(ref)}.`);
    }
  }

  // Price and rent indices
  const driftYear = rule('priceDriftYearPct') / 100 - 0.02 * ((mac.policyBps - 100) / 100);
  const rateShock = -(mac.policyBps - prevPolicy) / 10000 * 1.2; // a 25 bps rise costs about 0.3% at once
  const common = r.gauss() * 0.005 + (isQuarterMonth(m) ? r.gauss() * 0.012 : 0);
  for (const k of kreise) {
    const own = r.gauss() * 0.003;
    const mom = mac.momentum[k] || 0;
    const change = driftYear / 12 + 0.55 * mom + rateShock + common + own;
    mac.idx.price[k] = +(mac.idx.price[k] * (1 + change)).toFixed(6);
    mac.momentum[k] = +(0.6 * mom + 0.4 * (common + own)).toFixed(6) || 0;
    const rentChange = rule('rentDriftYearPct') / 100 / 12 + 0.25 * mom + 0.4 * (mac.cpiBps / 10000) / 12 + r.gauss() * 0.0015;
    mac.idx.rent[k] = +(mac.idx.rent[k] * (1 + Math.max(-0.003, rentChange))).toFixed(6);
  }
}

export function marketSummary(s) {
  const m = s.macro;
  const k = Object.keys(m.idx.price);
  return {
    policy: m.policyBps,
    saron: m.saronBps,
    ref: m.refBps,
    cpi: m.cpiBps,
    curve: { ...m.curve },
    saronMortgage: saronMortgageBps(m),
    price: Object.fromEntries(k.map((x) => [x, m.idx.price[x]])),
    rent: Object.fromEntries(k.map((x) => [x, m.idx.rent[x]])),
  };
}
