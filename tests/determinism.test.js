// Same seed and same actions give the same bytes; chunked advancing matches month-by-month play;
// different seeds differ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, fixture, realWorld, play, makeBot, runBot, advanceTo, stateHash } from './helpers.mjs';

test('determinism: same seed and the same bot actions give identical final JSON', () => {
  const world = fixture();
  const run = () => runBot(E.createCareer({ seed: 'twin', world }), world, { months: 48, bot: makeBot({ overhaulOnVacancy: true, sellAfterMonths: 20 }) });
  const a = run();
  const b = run();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.stats.bought > 0, 'the bot actually bought something');
});

test('determinism: advancing 120 months in chunks of 1, 7 and 12 gives identical state hashes', () => {
  const world = fixture();
  const hashes = [1, 7, 12].map((chunk) => stateHash(advanceTo(E.createCareer({ seed: 'chunks', world }), world, 120, chunk)));
  assert.equal(hashes[0], hashes[1]);
  assert.equal(hashes[1], hashes[2]);
  // and month by month with plain endMonth calls
  let s = E.createCareer({ seed: 'chunks', world });
  for (let k = 0; k < 120; k++) s = play(s, world, { type: 'endMonth' }).state;
  assert.equal(stateHash(s), hashes[0]);
  assert.equal(s.month, 120);
});

test('determinism: the same holds on the real world for 36 months', () => {
  const world = realWorld();
  const h1 = stateHash(advanceTo(E.createCareer({ seed: 'real-chunks', world }), world, 36, 1));
  const h12 = stateHash(advanceTo(E.createCareer({ seed: 'real-chunks', world }), world, 36, 12));
  assert.equal(h1, h12);
});

test('determinism: different seeds differ, numeric and text seeds normalise consistently', () => {
  const world = fixture();
  const a = advanceTo(E.createCareer({ seed: 'alpha', world }), world, 24);
  const b = advanceTo(E.createCareer({ seed: 'beta', world }), world, 24);
  assert.notEqual(stateHash(a), stateHash(b));
  const a3 = advanceTo(E.createCareer({ seed: 'alpha', world }), world, 3);
  const b3 = advanceTo(E.createCareer({ seed: 'beta', world }), world, 3);
  assert.notEqual(JSON.stringify(a3.listings), JSON.stringify(b3.listings));
  assert.notEqual(JSON.stringify(a.macro.policyHistory), JSON.stringify(b.macro.policyHistory));
  const n1 = E.createCareer({ seed: 42, world });
  const n2 = E.createCareer({ seed: 42, world });
  assert.equal(n1.seed, n2.seed);
  assert.equal(n1.seed, 42);
  assert.equal(E.createCareer({ seed: 'x', world }).seed, E.hash32('x'));
});

test('determinism: named streams are independent of each other and of call order', () => {
  const a1 = E.stream('s', 'macro', 3);
  const a2 = E.stream('s', 'macro', 3);
  const b = E.stream('s', 'rent', 'u1', 3);
  const seqA1 = [a1.float(), a1.int(100), a1.gauss()];
  b.float(); b.float();
  const seqA2 = [a2.float(), a2.int(100), a2.gauss()];
  assert.deepEqual(seqA1, seqA2);
  assert.notDeepEqual(seqA1, [E.stream('s', 'macro', 4).float(), 0, 0].slice(0, 1).concat(seqA1.slice(1)));
  for (const v of seqA1) assert.ok(Number.isFinite(v));
});
