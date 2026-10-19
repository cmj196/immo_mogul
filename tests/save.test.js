// Saves: the state survives a JSON round trip and the game continues identically from the copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, fixture, play, makeBot, runBot, stateHash, buyCondo } from './helpers.mjs';

test('save: a mid-career state round-trips through JSON and plays on identically', () => {
  const world = fixture();
  const bot = makeBot({ overhaulOnVacancy: true, overhaulBelow: 70 });
  const mid = runBot(E.createCareer({ seed: 'save', world }), world, { months: 30, bot });
  assert.ok(Object.keys(mid.lots).length > 0, 'something owned at the save point');
  const text = JSON.stringify(mid);
  const copy = JSON.parse(text);
  assert.deepEqual(copy, mid);
  assert.equal(copy.v, 1);
  assert.equal(copy.seed, mid.seed);
  assert.equal(copy.dataVersion, world.dataVersion);
  // continue both with a fresh bot each (the bot keeps no state that matters after a save)
  const a = runBot(mid, world, { months: 30, bot: makeBot({ overhaulOnVacancy: true, overhaulBelow: 70 }) });
  const b = runBot(copy, world, { months: 30, bot: makeBot({ overhaulOnVacancy: true, overhaulBelow: 70 }) });
  assert.equal(stateHash(a), stateHash(b));
  assert.equal(a.month, 60);
  assert.deepEqual(E.careerSummary(a, world), E.careerSummary(b, world));
});

test('save: a state saved in the middle of a decision keeps the decision', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'save-decision', world }), world);
  let s = bought.state;
  // raise prices and list, then wait for a buyer so a negotiation is open at save time
  s = structuredClone(s);
  for (const k of Object.keys(s.macro.idx.price)) s.macro.idx.price[k] *= 1.3;
  s = play(s, world, { type: 'listForSale', lotId: bought.lotId, ask: Math.round(E.lotValue(s, world, bought.lotId) * 0.97) }).state;
  for (let k = 0; k < 12 && !s.negotiation; k++) s = play(s, world, { type: 'endMonth' }).state;
  assert.ok(s.negotiation, 'buyer on the table');
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  assert.ok(E.hasDecision(copy));
  assert.equal(E.checkAction(copy, world, { type: 'endMonth' }), E.checkAction(s, world, { type: 'endMonth' }));
  const r1 = play(s, world, { type: 'acceptOffer' });
  const r2 = play(copy, world, { type: 'acceptOffer' });
  assert.equal(JSON.stringify(r1.state), JSON.stringify(r2.state));
  assert.deepEqual(r1.events, r2.events);
});

test('save: the state carries no functions, Maps, Dates or undefined values', () => {
  const world = fixture();
  const s = runBot(E.createCareer({ seed: 'plain', world }), world, { months: 18, bot: makeBot() });
  const walk = (v, path) => {
    if (v === undefined) assert.fail(`undefined at ${path}`);
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return;
    assert.ok(typeof v !== 'function', `function at ${path}`);
    assert.ok(Object.getPrototypeOf(v) === Object.prototype || Array.isArray(v), `non-plain object at ${path}`);
    for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(s, '$');
  assert.ok(JSON.stringify(s).length < 400_000, 'a save stays small');
});
