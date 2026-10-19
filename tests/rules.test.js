// Rule conformance against docs/research/261002_swiss real estate rules.md (sections 1 to 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, fixture, play, buyCondo } from './helpers.mjs';

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ${expected} +-${tol}, got ${actual}`);

test('gains tax: CHF 10,000 gain gives CHF 1,300 base tax', () => {
  assert.equal(E.gainsTaxBase(10_000), 1300);
});

test('gains tax: the flip example (gain 247,600 held 18 months) is about CHF 110,550', () => {
  const r = E.gainsTax(247_600, 18);
  assert.equal(r.base, 88_440);
  assert.equal(r.adjustmentPct, 25);
  near(r.tax, 110_550, 110_550 * 0.01, 'flip tax');
});

test('gains tax: long-hold reductions 5y 5%, 10y 20%, 20y 50%, 25y 50%', () => {
  assert.equal(E.holdingAdjustmentPct(60), -5);
  assert.equal(E.holdingAdjustmentPct(72), -8);
  assert.equal(E.holdingAdjustmentPct(120), -20);
  assert.equal(E.holdingAdjustmentPct(180), -35);
  assert.equal(E.holdingAdjustmentPct(240), -50);
  assert.equal(E.holdingAdjustmentPct(300), -50);
  assert.equal(E.gainsTax(247_600, 240).tax, 44_220);
});

test('gains tax: short-hold surcharges +50% under one year, +25% under two, none from two to five', () => {
  assert.equal(E.holdingAdjustmentPct(0), 50);
  assert.equal(E.holdingAdjustmentPct(11), 50);
  assert.equal(E.holdingAdjustmentPct(12), 25);
  assert.equal(E.holdingAdjustmentPct(23), 25);
  assert.equal(E.holdingAdjustmentPct(24), 0);
  assert.equal(E.holdingAdjustmentPct(59), 0);
  assert.equal(E.gainsTax(10_000, 6).tax, 1950);
});

test('gains tax: gains under CHF 5,000 are exempt, brackets run 10/15/20/25/30/35/40', () => {
  assert.equal(E.gainsTaxBase(4999), 0);
  assert.equal(E.gainsTaxBase(0), 0);
  assert.equal(E.gainsTaxBase(5000), 550);
  assert.equal(E.gainsTaxBase(100_000), 29_400);
  assert.equal(E.gainsTaxBase(200_000), 69_400);
});

test('purchase costs: notary 1 per mille plus 8.1% VAT, registry 1 per mille, note 2 per mille of the loan, minimum CHF 100', () => {
  const c = E.purchaseCosts(1_000_000, 800_000);
  assert.deepEqual(c, { notary: 1000, notaryVat: 81, registry: 1000, note: 1600, total: 3681 });
  const small = E.purchaseCosts(50_000, 0);
  assert.equal(small.notary, 100);
  assert.equal(small.registry, 100);
  assert.equal(small.note, 0);
  assert.equal(small.total, 100 + 8 + 100);
  const cash = E.purchaseCosts(1_500_000, 0);
  assert.equal(cash.note, 0);
  assert.equal(cash.total, 1500 + 122 + 1500);
});

test('reference rate: +25 bps gives x1.03, -25 bps gives x0.9709, two steps compound', () => {
  const lease = { rent: 10_000, refBps: 125, cpiBps: 50 };
  near(E.refRateAdjustment(lease, 150, 50).newRent, 10_300, 5, 'up one step');
  near(E.refRateAdjustment(lease, 100, 50).newRent, 9709, 5, 'down one step');
  near(E.refRateAdjustment(lease, 175, 50).newRent, 10_609, 5, 'up two steps');
  near(E.refRateAdjustment(lease, 75, 50).newRent, 9426, 5, 'down two steps');
  assert.equal(E.refRateAdjustment(lease, 125, 50).newRent, 10_000);
  // up then back down lands where it started (within the CHF 5 rounding)
  const up = E.refRateAdjustment(lease, 150, 50).newRent;
  near(E.refRateAdjustment({ rent: up, refBps: 150, cpiBps: 50 }, 125, 50).newRent, 10_000, 5, 'round trip');
});

test('reference rate: 40% of the CPI change rides on top of a rise, never on a fall', () => {
  const lease = { rent: 10_000, refBps: 125, cpiBps: 50 };
  // +25 bps and inflation up 1 point: 3% + 0.4% = 3.4%
  near(E.refRateAdjustment(lease, 150, 150).newRent, 10_340, 5, 'with cpi');
  near(E.refRateAdjustment(lease, 100, 150).newRent, 9709, 5, 'cpi ignored on a fall');
});

test('renovation formula: CHF 60,000 value-adding at 1.25% over 25 years is about CHF 268 a month', () => {
  near(E.renovationRentIncrease(60_000, 'full', 125), 268, 3);
  assert.equal(E.renovationRentIncrease(0, 'full', 125), 0);
  // a higher reference rate raises the increase
  assert.ok(E.renovationRentIncrease(60_000, 'full', 225) > E.renovationRentIncrease(60_000, 'full', 125));
});

function quoteWith(s, world, bankId, product, overrides = {}) {
  return E.quote(s, world, { bankId, product, price: 1_200_000, fair: 1_200_000, rentMonth: 2500, ref: 'ruletest', ...overrides });
}

test('bank quote: equity floors per bank (LKB 25%, Sihl 20%, Üetli 25%) when income is no constraint', () => {
  const world = fixture();
  const s = E.createCareer({ seed: 'rules', world });
  s.player.salaryYear = 10_000_000;
  for (const [bankId, pct] of [['lkb', 75], ['sihl', 80], ['uetli', 75]]) {
    const q = quoteWith(s, world, bankId, 'fix5');
    assert.equal(q.decision, 'yes');
    assert.equal(q.maxLtvLoan, E.round((q.lendingValue * pct) / 100), bankId);
    assert.equal(q.maxLoan, q.maxLtvLoan, `${bankId} should be LTV-bound`);
    assert.equal(q.loan, q.maxLoan);
    // lending value is the lower of price and valuation, valuation within 5% (+bias) of fair
    assert.ok(q.lendingValue <= q.price);
    assert.ok(Math.abs(q.valuation / 1_200_000 - 1) <= 0.08, `${bankId} valuation ${q.valuation}`);
    assert.equal(q.hardEquityMin, E.round(q.lendingValue * 0.10));
    assert.ok(q.equityNeeded >= q.hardEquityMin);
  }
});

test('bank quote: amortisation brings the loan to two thirds of lending value within the bank\'s years', () => {
  const world = fixture();
  const s = E.createCareer({ seed: 'rules', world });
  s.player.salaryYear = 10_000_000;
  for (const [bankId, years] of [['lkb', 10], ['sihl', 15], ['uetli', 15]]) {
    const q = quoteWith(s, world, bankId, 'fix5');
    const floor = E.round((q.lendingValue * 66.67) / 100);
    const second = q.loan - floor;
    assert.ok(second > 0, 'a max loan has a second mortgage');
    assert.equal(q.amortMonth, E.round(second / years / 12), bankId);
    assert.equal(E.amortMonthFor(E.BANKS[bankId], floor, q.lendingValue), 0, 'no amortisation at the floor');
  }
});

test('bank quote: the affordability cap binds when the salary is low, and the ratio sits at the cap', () => {
  const world = fixture();
  const s = E.createCareer({ seed: 'rules', world });
  s.player.salaryYear = 90_000;
  for (const bankId of E.BANK_IDS) {
    const q = quoteWith(s, world, bankId, 'fix5');
    assert.ok(q.maxAfford < q.maxLtvLoan, `${bankId}: affordability should bind`);
    assert.equal(q.maxLoan, q.maxAfford);
    assert.ok(q.reasons.some((r) => /Affordability/.test(r)));
    assert.ok(q.ratio <= q.cap + 0.001, `${bankId} ratio ${q.ratio} cap ${q.cap}`);
    assert.ok(q.ratio >= q.cap - 0.01, `${bankId} should use the whole budget: ratio ${q.ratio}`);
    // the requested amount above the maximum is answered with conditions, not a yes
    const over = quoteWith(s, world, bankId, 'fix5', { requested: q.maxLoan + 50_000 });
    assert.equal(over.decision, 'conditions');
    assert.equal(over.loan, q.maxLoan);
  }
  s.player.salaryYear = 20_000;
  const none = quoteWith(s, world, 'lkb', 'fix5', { rentMonth: 0 });
  assert.equal(none.decision, 'no');
  assert.equal(none.maxLoan, 0);
});

test('bank quote: a bank that does not offer the product says no; the rate is curve plus spread plus surcharge', () => {
  const world = fixture();
  const s = E.createCareer({ seed: 'rules', world });
  assert.equal(quoteWith(s, world, 'uetli', 'saron').decision, 'no');
  assert.equal(E.offeredRateBps(s, 'uetli', 'saron'), null);
  assert.equal(E.offeredRateBps(s, 'lkb', 'fix5'), E.curveFor(s.macro, 'fix5') + 0 + E.rule('buyToLetSurchargeBps'));
  assert.equal(E.offeredRateBps(s, 'sihl', 'fix10'), E.curveFor(s.macro, 'fix10') + 30 + E.rule('buyToLetSurchargeBps'));
  assert.equal(E.offeredRateBps(s, 'uetli', 'fix10'), E.curveFor(s.macro, 'fix10') - 20 + E.rule('buyToLetSurchargeBps'));
});

test('rolling a loan: the fixed period ends, the player picks fix10, the loan reprices for ten years', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'roll', world }), world, { product: 'fix5' });
  let s = bought.state;
  const loan = Object.values(s.loans)[0];
  assert.equal(loan.product, 'fix5');
  assert.equal(loan.fixedUntil, loan.start + 60);
  // bring the end forward and open the next month
  s = structuredClone(s);
  s.loans[loan.id].fixedUntil = s.month + 1;
  let r = play(s, world, { type: 'endMonth' });
  s = r.state;
  assert.ok(r.events.some((e) => e.type === 'rollover' && e.loanId === loan.id), 'rollover event');
  assert.ok(s.pending.some((p) => p.kind === 'rollover' && p.loanId === loan.id));
  const before = s.loans[loan.id].balance;
  r = play(s, world, { type: 'chooseRollover', loanId: loan.id, product: 'fix10' });
  s = r.state;
  const after = s.loans[loan.id];
  assert.equal(after.product, 'fix10');
  assert.equal(after.fixedUntil, s.month + 120);
  assert.equal(after.rateBps, E.offeredRateBps(s, after.bankId, 'fix10'));
  assert.equal(after.balance, before, 'rolling does not change the balance');
  assert.ok(!s.pending.some((p) => p.kind === 'rollover'));
  assert.equal(E.sumLedger(s, s.month, ['fees']), 0, 'no fee on a rollover');
});

test('rolling a loan: an unanswered reset rolls into the bank\'s default product at month end', () => {
  const world = fixture();
  let s = buyCondo(E.createCareer({ seed: 'roll2', world }), world, { product: 'fix5', bankId: 'lkb' }).state;
  const loan = Object.values(s.loans)[0];
  s = structuredClone(s);
  s.loans[loan.id].fixedUntil = s.month + 1;
  s = play(s, world, { type: 'endMonth' }).state;
  assert.ok(s.pending.some((p) => p.kind === 'rollover'));
  const r = play(s, world, { type: 'endMonth' });
  assert.ok(r.events.some((e) => e.type === 'rolled' && e.product === 'saron'));
  assert.equal(r.state.loans[loan.id].product, 'saron');
  assert.equal(r.state.loans[loan.id].fixedUntil, null);
});

test('hard equity: at least 10% of the lending value must be the player\'s own money', () => {
  const world = fixture();
  const s = E.createCareer({ seed: 'rules', world });
  s.player.salaryYear = 10_000_000;
  const q = quoteWith(s, world, 'sihl', 'fix5');
  assert.equal(q.hardEquityMin, E.round(q.lendingValue * E.rule('minHardEquityPct') / 100));
  assert.ok(q.equityNeeded >= 2 * q.hardEquityMin, 'at 80% LTV the equity is twice the hard minimum');
});

test('rules table: every rule carries a status, source and check date', () => {
  for (const r of Object.values(E.RULES)) {
    assert.ok(['verified', 'secondary', 'assumption'].includes(r.status), r.id);
    assert.ok(r.source && r.source.length > 5, r.id);
    assert.match(r.checked, /^\d{4}-\d{2}-\d{2}$/, r.id);
  }
  assert.equal(E.rule('transferTaxPct'), 0);
  assert.equal(E.rule('referenceRateBps'), 125);
});
