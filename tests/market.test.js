// Macro paths over 200 seeds and 180 months: the price index stays in a plausible band, the
// reference and policy rates stay within their corridors. stepMacro draws only from
// stream(seed, 'macro', month), so stepping the macro alone reproduces the full tick; one seed
// cross-checks that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, fixture, advanceTo, percentile } from './helpers.mjs';
import { stepMacro } from '../src/engine/macro.js';

const SEEDS = 200;
const MONTHS = 180;

function macroPath(seed, world) {
  const s = E.createCareer({ seed, world });
  let refMin = Infinity;
  let refMax = -Infinity;
  let polMin = Infinity;
  let polMax = -Infinity;
  for (let m = 1; m <= MONTHS; m++) {
    s.month = m;
    stepMacro(s, world, []);
    refMin = Math.min(refMin, s.macro.refBps);
    refMax = Math.max(refMax, s.macro.refBps);
    polMin = Math.min(polMin, s.macro.policyBps);
    polMax = Math.max(polMax, s.macro.policyBps);
  }
  const kreise = Object.keys(s.macro.idx.price);
  const price = kreise.reduce((a, k) => a + s.macro.idx.price[k], 0) / kreise.length;
  const rent = kreise.reduce((a, k) => a + s.macro.idx.rent[k], 0) / kreise.length;
  return { price, rent, refMin, refMax, polMin, polMax, macro: s.macro };
}

test(`market: over ${SEEDS} seeds x ${MONTHS} months the city price index and the rates stay in band`, () => {
  const world = fixture();
  const paths = [];
  for (let seed = 0; seed < SEEDS; seed++) paths.push(macroPath(`mkt${seed}`, world));
  const prices = paths.map((p) => p.price).sort((a, b) => a - b);
  const p5 = percentile(prices, 0.05);
  const p50 = percentile(prices, 0.5);
  const p95 = percentile(prices, 0.95);
  assert.ok(p5 >= 0.9, `5th percentile price multiple ${p5.toFixed(3)}`);
  assert.ok(p95 <= 2.8, `95th percentile price multiple ${p95.toFixed(3)}`);
  assert.ok(p50 >= 1.2 && p50 <= 2.2, `median price multiple ${p50.toFixed(3)}`);
  for (const p of paths) {
    assert.ok(p.refMin >= 25 && p.refMax <= 400, `reference rate out of 0.25% to 4%: ${p.refMin}..${p.refMax}`);
    assert.ok(p.polMin >= -75 && p.polMax <= 300, `policy rate out of -0.75% to 3%: ${p.polMin}..${p.polMax}`);
    assert.ok(p.macro.refBps % 25 === 0, 'reference rate in quarter points');
    assert.ok(p.macro.policyBps % 25 === 0, 'policy rate in quarter points');
    assert.ok(p.rent > 0.9 && p.rent < 2.5, `rent index ${p.rent}`);
    for (const y of Object.keys(p.macro.curve)) assert.ok(p.macro.curve[y] > 0 && p.macro.curve[y] < 800, `curve ${y}y ${p.macro.curve[y]}`);
  }
  const moved = paths.filter((p) => p.refMax !== p.refMin).length;
  assert.ok(moved > SEEDS / 2, `the reference rate moved in only ${moved} of ${SEEDS} careers`);
});

test('market: stepping the macro alone matches the macro of a full career', () => {
  const world = fixture();
  const full = advanceTo(E.createCareer({ seed: 'mkt7', world }), world, MONTHS, 12);
  const alone = macroPath('mkt7', world).macro;
  assert.deepEqual(full.macro, alone);
});

test('market: the opening rates match the rules table', () => {
  const s = E.createCareer({ seed: 'open', world: fixture() });
  assert.equal(s.macro.policyBps, 0);
  assert.equal(s.macro.saronBps, -7);
  assert.equal(s.macro.refBps, 125);
  assert.deepEqual(s.macro.curve, { 2: 178, 3: 192, 5: 205, 10: 225 });
  const m = E.marketSummary(s);
  assert.equal(m.saronMortgage, 80);
  assert.equal(E.curveFor(s.macro, 'fix10'), 225);
});
