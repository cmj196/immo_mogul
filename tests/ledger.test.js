// Fuzz: 40 seeds x 60 months with the policy bot. After every action the cash change must equal
// the sum of the action's 'cash' events, the state must hold only finite numbers, loans stay
// non-negative, units and lots agree, every legal action applies cleanly and the state survives JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, fixture, play, makeBot, runBot, checkInvariants, sumCashEvents, concreteAction } from './helpers.mjs';

const SEEDS = 40;
const MONTHS = 60;

test(`ledger fuzz: ${SEEDS} seeds x ${MONTHS} months with the policy bot`, () => {
  const world = fixture();
  let actions = 0;
  let legalTried = 0;
  let cashEvents = 0;
  const kinds = new Map();
  for (let seed = 0; seed < SEEDS; seed++) {
    const bot = makeBot({ ltvCap: seed % 3 === 0 ? 0.6 : 1, overhaulOnVacancy: seed % 4 === 1, overhaulBelow: 70, sellAfterMonths: seed % 5 === 2 ? 18 : null });
    const start = E.createCareer({ seed: `fuzz${seed}`, world, difficulty: ['normal', 'easy', 'hard'][seed % 3] });
    const onAction = (before, r, a) => {
      actions += 1;
      kinds.set(a.type, (kinds.get(a.type) || 0) + 1);
      const s = r.state;
      const delta = s.player.cash - before.player.cash;
      const posted = sumCashEvents(r.events);
      cashEvents += r.events.filter((e) => e.type === 'cash').length;
      assert.equal(delta, posted, `seed ${seed} month ${before.month} ${a.type}: cash moved ${delta}, events say ${posted}`);
      assert.ok(Number.isInteger(s.player.cash), 'integer francs');
      const problems = checkInvariants(s, world);
      assert.deepEqual(problems, [], `seed ${seed} month ${s.month} after ${a.type}`);
      assert.equal(before.month, a.type === 'endMonth' ? s.month - 1 : s.month);
      // every legal action applies without error (sample up to 10)
      const legal = E.legalActions(s, world);
      const step = Math.max(1, Math.ceil(legal.length / 10));
      for (let i = 0; i < legal.length; i += step) {
        const concrete = concreteAction(s, world, legal[i]);
        if (!concrete) continue;
        const rr = E.applyAction(s, world, concrete);
        assert.equal(rr.error, null, `seed ${seed} month ${s.month}: legal action ${JSON.stringify(concrete)} refused: ${rr.error}`);
        assert.equal(rr.state.player.cash - s.player.cash, sumCashEvents(rr.events), `cash events of ${concrete.type}`);
        assert.deepEqual(checkInvariants(rr.state, world), [], `invariants after legal ${concrete.type}`);
        legalTried += 1;
      }
      // the state is plain JSON
      if (actions % 7 === 0) assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'JSON round trip');
    };
    const end = runBot(start, world, { months: MONTHS, bot, onAction });
    assert.ok(end.month === start.month + MONTHS || end.over, `seed ${seed} stopped at ${end.month}`);
    assert.deepEqual(JSON.parse(JSON.stringify(end)), end);
  }
  assert.ok(actions > SEEDS * MONTHS, 'the bot did more than end months');
  assert.ok(kinds.get('closePurchase') >= SEEDS / 2, `purchases ${kinds.get('closePurchase')}`);
  assert.ok(kinds.get('chooseTenant') > 0);
  assert.ok(legalTried > 1000, `legal actions tried ${legalTried}`);
  assert.ok(cashEvents > 0);
});

test('ledger: applyAction never mutates its input and refusals leave the state untouched', () => {
  const world = fixture();
  const s0 = E.createCareer({ seed: 'immutable', world });
  const frozen = JSON.stringify(s0);
  const r = play(s0, world, { type: 'endMonth' });
  assert.equal(JSON.stringify(s0), frozen);
  const bad = E.applyAction(r.state, world, { type: 'acceptOffer' });
  assert.ok(bad.error);
  assert.equal(bad.state, r.state, 'the same object comes back on a refusal');
  assert.deepEqual(bad.events, []);
});

test('ledger: the ledger keeps the last 24 months and sums by reason', () => {
  const world = fixture();
  let s = E.createCareer({ seed: 'trim', world });
  for (let k = 0; k < 40; k++) s = play(s, world, { type: 'endMonth' }).state;
  const months = new Set(s.ledger.map((p) => p.month));
  assert.ok(Math.min(...months) >= s.month - 24);
  assert.equal(E.sumLedger(s, s.month - 1, ['salary']), s.player.savingsMonth);
  assert.equal(E.sumLedger(s, s.month - 1), s.player.savingsMonth);
});
