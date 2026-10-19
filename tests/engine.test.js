// Engine behaviour: career shape, month end, negotiation protocol, purchase, renovation, letting,
// selling, forced sale and the career end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, fixture, play, buyCondo, advanceTo, sumCashEvents, marketRentOf } from './helpers.mjs';
import { challengeRoll } from '../src/engine/lease.js';

test('createCareer: shape, difficulties and the opening snapshot', () => {
  const world = fixture();
  const s = E.createCareer({ seed: 'shape', world, difficulty: 'normal' });
  assert.equal(s.v, 1);
  assert.equal(s.month, 0);
  assert.equal(s.seedText, 'shape');
  assert.equal(s.dataVersion, 'fixture');
  assert.equal(s.player.cash, 1_000_000);
  assert.equal(s.player.salaryYear, 180_000);
  assert.equal(s.player.savingsMonth, 4_500);
  assert.deepEqual(Object.keys(s.player.bankRep).sort(), [...E.BANK_IDS].sort());
  assert.deepEqual(s.units, {});
  assert.deepEqual(s.lots, {});
  assert.deepEqual(s.loans, {});
  assert.deepEqual(s.listings, {});
  assert.equal(s.negotiation, null);
  assert.equal(s.purchase, null);
  assert.deepEqual(s.pending, []);
  assert.deepEqual(Object.keys(s.rivals).sort(), [...E.RIVAL_IDS].sort());
  assert.equal(s.macro.refBps, 125);
  assert.deepEqual(s.macro.idx.price, { 4: 1, 5: 1 });
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].netWorth, 1_000_000);
  assert.equal(E.netWorth(s, world), 1_000_000);
  assert.equal(s.over, null);
  assert.equal(E.createCareer({ seed: 1, world, difficulty: 'hard' }).player.cash, 600_000);
  assert.equal(E.createCareer({ seed: 1, world, difficulty: 'easy' }).player.salaryYear, 220_000);
  assert.throws(() => E.createCareer({ seed: 1 }), /world/);
});

test('endMonth: posts the salary savings, advances the month and generates three to five listings', () => {
  const world = fixture();
  const s0 = E.createCareer({ seed: 'month', world });
  const r = play(s0, world, { type: 'endMonth' });
  const s = r.state;
  assert.equal(s.month, 1);
  assert.equal(s0.month, 0, 'input state untouched');
  const salary = r.events.filter((e) => e.type === 'cash' && e.reason === 'salary');
  assert.equal(salary.length, 1);
  assert.equal(salary[0].amount, 4_500);
  assert.equal(s.player.cash - s0.player.cash, sumCashEvents(r.events));
  assert.equal(s.player.cash, 1_004_500);
  const n = Object.keys(s.listings).length;
  assert.ok(n >= 3 && n <= 5, `listings ${n}`);
  assert.ok(r.events.some((e) => e.type === 'listings'));
  assert.equal(s.history.length, 2);
  assert.equal(E.ledgerForMonth(s, 0).length, 1);
  assert.equal(E.checkAction(s, world, { type: 'nonsense' }), 'Unknown action nonsense.');
});

function negotiateToEnd(s, world, listing, openPct) {
  const offer = Math.max(Math.ceil(listing.ask * 0.5), Math.round(listing.ask * openPct));
  let r = play(s, world, { type: 'makeOffer', listingId: listing.id, price: offer });
  s = r.state;
  let guard = 0;
  while (s.negotiation && !s.negotiation.closed && guard++ < 10) {
    const neg = s.negotiation;
    const mine = E.lastOfferBy(neg, 'player');
    const price = Math.floor((mine + neg.price) / 2);
    if (price <= mine || price >= neg.price || neg.counters.player >= E.COUNTER_LIMIT) {
      r = play(s, world, { type: 'acceptOffer' });
      s = r.state;
      break;
    }
    r = play(s, world, { type: 'counterOffer', price });
    s = r.state;
  }
  return s;
}

test('negotiation: history alternates, counters stay within the limit, the seller never accepts below reserve', () => {
  const world = fixture();
  let accepted = 0;
  let walked = 0;
  let countered = 0;
  for (let seed = 0; seed < 12; seed++) {
    let s = play(E.createCareer({ seed: `neg${seed}`, world }), world, { type: 'endMonth' }).state;
    s.player.cash = 50_000_000;
    for (const l of Object.values(s.listings)) {
      const before = s;
      // trace the negotiation step by step
      const offer = Math.min(l.ask, Math.max(Math.ceil(l.ask * 0.5), Math.round(l.ask * (0.76 + 0.02 * seed))));
      let r = play(before, world, { type: 'makeOffer', listingId: l.id, price: offer });
      let st = r.state;
      let neg = st.negotiation || before.negotiation;
      const histories = [];
      let guard = 0;
      while (st.negotiation && guard++ < 10) {
        neg = st.negotiation;
        histories.push(neg.history.slice());
        assert.equal(neg.actor, 'player');
        assert.equal(neg.from, 'counterparty');
        assert.ok(neg.counters.player <= E.COUNTER_LIMIT);
        assert.ok(neg.counters.counterparty <= E.COUNTER_LIMIT);
        assert.ok(neg.price <= l.ask && neg.price >= l.reserve, 'seller price stays between reserve and ask');
        // cannot counter at or above the seller's price, nor below the last own offer
        assert.ok(E.checkAction(st, world, { type: 'counterOffer', price: neg.price }));
        assert.ok(E.checkAction(st, world, { type: 'counterOffer', price: neg.price + 1 }));
        assert.ok(E.checkAction(st, world, { type: 'counterOffer', price: E.lastOfferBy(neg, 'player') }));
        const mine = E.lastOfferBy(neg, 'player');
        const price = Math.floor((mine + neg.price) / 2);
        if (neg.counters.player >= E.COUNTER_LIMIT || price <= mine || price >= neg.price) {
          r = play(st, world, { type: 'acceptOffer' });
          st = r.state;
          assert.ok(st.purchase, 'accepting creates a purchase');
          assert.equal(st.purchase.price, neg.price);
          assert.equal(st.negotiation, null);
          break;
        }
        r = play(st, world, { type: 'counterOffer', price });
        st = r.state;
      }
      const last = r.events.find((e) => e.type === 'reply');
      if (st.purchase) {
        const p = st.purchase;
        assert.ok(p.price >= l.reserve, `accepted ${p.price} below reserve ${l.reserve}`);
        assert.ok(p.price <= l.ask);
        assert.ok(st.listings[l.id].reserved);
        accepted += 1;
        // the full history alternates player / counterparty
        const h = r.state.log; // only to keep lint quiet about unused
        assert.ok(h);
        st = play(st, world, { type: 'abandonPurchase' }).state;
        assert.equal(st.purchase, null);
        assert.ok(!st.listings[l.id].reserved);
      } else if (last && last.reply === 'walk') {
        walked += 1;
      }
      for (const hist of histories) {
        for (let i = 1; i < hist.length; i++) assert.notEqual(hist[i].by, hist[i - 1].by, 'history alternates');
        if (hist.length > 2) countered += 1;
      }
      // the listing is still there (or reserved and released), never duplicated
      assert.equal(Object.values(st.listings).filter((x) => x.id === l.id).length, 1);
      s = before; // next listing from a clean slate
    }
  }
  assert.ok(accepted > 5, `accepted ${accepted}`);
  assert.ok(walked > 0, `walked ${walked}`);
  assert.ok(countered > 5, `countered ${countered}`);
});

test('negotiation: walkAway clears the table, an insulting second offer gets the player walked', () => {
  const world = fixture();
  let s = play(E.createCareer({ seed: 'walk', world }), world, { type: 'endMonth' }).state;
  const l = Object.values(s.listings).sort((a, b) => a.ask - b.ask)[0];
  // offers over the ask or under half of it are refused outright
  assert.ok(E.checkAction(s, world, { type: 'makeOffer', listingId: l.id, price: l.ask + 1 }));
  assert.ok(E.checkAction(s, world, { type: 'makeOffer', listingId: l.id, price: Math.floor(l.ask * 0.4) }));
  assert.ok(E.checkAction(s, world, { type: 'makeOffer', listingId: l.id, price: l.ask * 0.9 + 0.5 }));
  // first low offer: the seller counters rather than leaving
  let r = play(s, world, { type: 'makeOffer', listingId: l.id, price: Math.ceil(l.ask * 0.55) });
  assert.equal(r.events.find((e) => e.type === 'reply').reply, 'counter');
  let st = r.state;
  assert.ok(st.negotiation);
  r = play(st, world, { type: 'walkAway' });
  assert.equal(r.state.negotiation, null);
  assert.ok(r.events.some((e) => e.type === 'walk'));
  assert.ok(!r.state.listings[l.id].reserved);
  // a second offer still far under the reserve ends the talks
  r = play(st, world, { type: 'counterOffer', price: Math.ceil(l.ask * 0.56) });
  assert.equal(r.events.find((e) => e.type === 'reply').reply, 'walk');
  assert.equal(r.state.negotiation, null);
  assert.equal(r.state.purchase, null);
  assert.equal(E.checkAction(r.state, world, { type: 'acceptOffer' }), 'There is no offer to accept.');
  // an offer at the reserve is taken at once, at the player's price
  r = play(s, world, { type: 'makeOffer', listingId: l.id, price: l.reserve });
  assert.equal(r.events.find((e) => e.type === 'reply').reply, 'accept');
  assert.equal(r.state.purchase.price, l.reserve);
  assert.equal(E.checkAction(r.state, world, { type: 'endMonth' }), 'Complete or abandon the purchase first.');
  assert.ok(E.checkAction(r.state, world, { type: 'makeOffer', listingId: l.id, price: l.reserve }));
});

test('purchase flow: financing validation, closePurchase creates lot, units and loan, cash moves by price less loan plus costs', () => {
  const world = fixture();
  const s0 = E.createCareer({ seed: 'buy', world });
  const bought = buyCondo(s0, world);
  const { before, result: r, state: s, lotId, unitId, price, financing } = bought;
  const f = financing;
  // `before` is the state with financing chosen and the purchase still open
  assert.ok(before.purchase && before.purchase.financing);
  assert.equal(s.purchase, null);
  const pending = play(before, world, { type: 'abandonPurchase' }); // abandoning is still allowed after financing
  assert.equal(pending.state.purchase, null);
  assert.ok(!pending.state.listings[before.purchase.listingId].reserved);
  const lot = s.lots[lotId];
  assert.ok(lot);
  assert.equal(lot.kind, 'condo');
  assert.deepEqual(lot.unitIds, [unitId]);
  assert.equal(lot.bought.price, price);
  assert.equal(lot.bought.loan, f.loan);
  const u = s.units[unitId];
  assert.equal(u.owner, 'player');
  assert.equal(u.lotId, lotId);
  assert.equal(u.buildingId, lot.buildingId);
  assert.ok(world.byId.get(u.buildingId).flats[u.flatIdx]);
  const loans = Object.values(s.loans);
  assert.equal(loans.length, 1);
  assert.equal(loans[0].balance, f.loan);
  assert.equal(loans[0].lotId, lotId);
  assert.equal(loans[0].bankId, f.bankId);
  assert.equal(loans[0].amortFloor, E.round(loans[0].lendingValue * 66.67 / 100));
  const costs = E.purchaseCosts(price, f.loan).total;
  assert.equal(s.player.cash - before.player.cash, -(price - f.loan + costs));
  assert.equal(s.player.cash - before.player.cash, sumCashEvents(r.events));
  assert.ok(!s.listings[bought.listing.id], 'listing removed');
  assert.equal(s.stats.bought, 1);
  assert.ok(s.milestones.firstUnit !== undefined);
  assert.ok(E.unitCount(s) === 1);
  // net worth moves by the gap between the lot's fair value and what was paid, less the costs
  assert.equal(E.netWorth(s, world) - E.netWorth(before, world), E.lotValue(s, world, lotId) - price - costs);
});

test('purchase flow: chooseFinancing rejects too much loan, a product the bank lacks, and too little cash', () => {
  const world = fixture();
  let s = E.createCareer({ seed: 'fin', world });
  for (let k = 0; k < 24 && !s.purchase; k++) {
    s = play(s, world, { type: 'endMonth' }).state;
    const l = Object.values(s.listings).filter((x) => x.kind === 'condo').sort((a, b) => a.ask - b.ask)[0];
    if (l) s = play(s, world, { type: 'makeOffer', listingId: l.id, price: Math.min(l.ask, l.reserve) }).state;
  }
  assert.ok(s.purchase);
  const q = E.quoteForPurchase(s, world, s.purchase, 'sihl', 'fix5');
  assert.equal(q.decision, 'yes');
  assert.match(E.checkAction(s, world, { type: 'chooseFinancing', bankId: 'sihl', product: 'fix5', loan: q.maxLoan + 1 }), /lends at most/);
  assert.match(E.checkAction(s, world, { type: 'chooseFinancing', bankId: 'uetli', product: 'saron', loan: 100_000 }), /does not offer/);
  assert.match(E.checkAction(s, world, { type: 'chooseFinancing', bankId: 'sihl', product: 'fix5', loan: 100.5 }), /whole number/);
  assert.match(E.checkAction(s, world, { type: 'chooseFinancing', bankId: 'nope', product: 'fix5', loan: 100 }), /Pick a bank/);
  assert.equal(E.checkAction(s, world, { type: 'closePurchase' }), 'Choose the financing first.');
  const poor = structuredClone(s);
  poor.player.cash = 1000;
  assert.match(E.checkAction(poor, world, { type: 'chooseFinancing', bankId: 'sihl', product: 'fix5', loan: q.maxLoan }), /in cash/);
  // borrowing less than the maximum is fine, and so is paying cash
  assert.equal(E.checkAction(s, world, { type: 'chooseFinancing', bankId: 'sihl', product: 'fix5', loan: Math.floor(q.maxLoan / 2) }), null);
  const rich = structuredClone(s);
  rich.player.cash = 50_000_000;
  assert.equal(E.checkAction(rich, world, { type: 'chooseFinancing', loan: 0 }), null);
  const cashBuy = play(play(rich, world, { type: 'chooseFinancing', loan: 0 }).state, world, { type: 'closePurchase' });
  assert.equal(Object.keys(cashBuy.state.loans).length, 0);
  assert.equal(cashBuy.state.player.cash - rich.player.cash, -(s.purchase.price + E.purchaseCosts(s.purchase.price, 0).total));
});

test('renovation: a full overhaul needs an empty flat, costs its quote, finishes after three months at condition 100', () => {
  const world = fixture();
  const letFlat = buyCondo(E.createCareer({ seed: 'reno-let', world }), world, { vacant: false });
  const qBlocked = E.unitRenoQuote(letFlat.state, world, letFlat.unitId, 'full');
  assert.match(qBlocked.blockedBy, /empty/);
  assert.match(E.checkAction(letFlat.state, world, { type: 'startRenovation', unitId: letFlat.unitId, pkg: 'full' }), /empty/);
  assert.match(E.checkAction(letFlat.state, world, { type: 'startRenovation', unitId: letFlat.unitId, pkg: 'sauna' }), /Unknown package/);

  const empty = buyCondo(E.createCareer({ seed: 'reno-empty', world }), world, { vacant: true });
  let s = empty.state;
  const u0 = s.units[empty.unitId];
  assert.equal(u0.lease, null);
  const q = E.unitRenoQuote(s, world, empty.unitId, 'full');
  assert.equal(q.blockedBy, null);
  assert.equal(q.months, 3);
  assert.equal(q.newCondition, 100);
  assert.ok(q.cost > 0 && q.cost % 100 === 0);
  const r = play(s, world, { type: 'startRenovation', unitId: empty.unitId, pkg: 'full' });
  assert.equal(r.state.player.cash - s.player.cash, -q.cost);
  assert.equal(sumCashEvents(r.events), -q.cost);
  s = r.state;
  assert.ok(s.units[empty.unitId].project);
  assert.equal(s.units[empty.unitId].project.ends, s.month + 3);
  assert.equal(s.lots[empty.lotId].capitalWorks, q.cost);
  assert.match(E.checkAction(s, world, { type: 'startRenovation', unitId: empty.unitId, pkg: 'refresh' }), /under way/);
  assert.match(E.checkAction(s, world, { type: 'setRent', unitId: empty.unitId, rent: 2000 }), /works/);
  for (let k = 0; k < 2; k++) {
    s = play(s, world, { type: 'endMonth' }).state;
    assert.ok(s.units[empty.unitId].project, `still under way after ${k + 1} months`);
  }
  const done = play(s, world, { type: 'endMonth' });
  s = done.state;
  assert.ok(done.events.some((e) => e.type === 'renoDone' && e.unitId === empty.unitId));
  const u = s.units[empty.unitId];
  assert.equal(u.project, null);
  assert.equal(u.condition, 100);
  assert.equal(u.prevRent, null, 'a new flat no longer anchors the initial rent');
  assert.equal(s.stats.renovations, 1);
  assert.equal(s.stats.fullRenovations, 1);
  assert.ok(s.milestones.fullReno !== undefined);
  assert.ok(E.lotValue(s, world, empty.lotId) > E.lotValue(empty.state, world, empty.lotId), 'value rises with condition');
});

test('renovation: a kitchen with a sitting tenant schedules the formula increase after the notice period', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'kitchen', world }), world, { vacant: false });
  let s = bought.state;
  const u0 = s.units[bought.unitId];
  const rentBefore = u0.lease.rent;
  const q = E.unitRenoQuote(s, world, bought.unitId, 'kitchen');
  assert.equal(q.blockedBy, null);
  assert.equal(q.valueAdding, E.round(q.cost * 0.5));
  assert.equal(q.sittingIncrease, E.renovationRentIncrease(q.valueAdding, 'kitchen', s.macro.refBps));
  assert.ok(q.sittingIncrease > 0);
  s = play(s, world, { type: 'startRenovation', unitId: bought.unitId, pkg: 'kitchen' }).state;
  const r = play(s, world, { type: 'endMonth' });
  s = r.state;
  assert.ok(r.events.some((e) => e.type === 'renoDone'));
  const u = s.units[bought.unitId];
  assert.equal(u.project, null);
  assert.ok(u.condition >= u0.condition);
  assert.ok(u.lease.pendingRent, 'increase scheduled');
  assert.equal(u.lease.pendingRent.why, 'renovation');
  assert.equal(u.lease.pendingRent.rent, rentBefore + q.sittingIncrease);
  assert.equal(u.lease.pendingRent.from, s.month + E.rule('noticeMonths'));
  assert.equal(u.lease.rent, rentBefore, 'not yet in force');
  s = advanceTo(s, world, u.lease.pendingRent.from + 1, 1);
  if (!s.units[bought.unitId].lease) return; // the tenant may have left in between: nothing more to check
  assert.equal(s.units[bought.unitId].lease.rent, rentBefore + q.sittingIncrease);
  assert.equal(s.units[bought.unitId].lease.pendingRent, null);
});

function waitForApplicants(s, world, unitId, maxMonths = 8) {
  for (let k = 0; k < maxMonths; k++) {
    const r = play(s, world, { type: 'endMonth' });
    s = r.state;
    if (s.pending.some((p) => p.kind === 'applicants' && p.unitId === unitId)) return { state: s, result: r };
  }
  throw new Error('no applicants arrived');
}

test('letting: setRent, applicants arrive, chooseTenant creates a lease and the rent flows', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'let', world }), world, { vacant: true });
  let s = bought.state;
  const unitId = bought.unitId;
  assert.match(E.checkAction(s, world, { type: 'setRent', unitId, rent: 50 }), /monthly rent/);
  assert.match(E.checkAction(s, world, { type: 'chooseTenant', unitId, index: 0 }), /No such applicant/);
  const rent = marketRentOf(s, world, s.units[unitId]);
  const r0 = play(s, world, { type: 'setRent', unitId, rent });
  s = r0.state;
  assert.equal(s.units[unitId].askRent, rent);
  assert.ok(r0.events.some((e) => e.type === 'rentSet'));
  const w = waitForApplicants(s, world, unitId);
  s = w.state;
  const u = s.units[unitId];
  assert.ok(u.applicants.length >= 1 && u.applicants.length <= 3);
  assert.ok(w.result.events.some((e) => e.type === 'applicants' && e.unitId === unitId));
  assert.ok(E.hasDecision(s));
  assert.equal(E.advance(s, world).months, 1, 'advance stops while applicants wait');
  const legal = E.legalActions(s, world);
  assert.ok(legal.some((a) => a.type === 'chooseTenant' && a.unitId === unitId && a.index === 0));
  assert.match(E.checkAction(s, world, { type: 'chooseTenant', unitId, index: 7 }), /No such applicant/);
  const ap = u.applicants[0];
  const r = play(s, world, { type: 'chooseTenant', unitId, index: 0 });
  s = r.state;
  const lease = s.units[unitId].lease;
  assert.ok(lease);
  assert.equal(lease.tenant.name, ap.name);
  assert.equal(lease.since, s.month);
  assert.equal(lease.refBps, s.macro.refBps);
  assert.ok(lease.rent <= rent);
  assert.equal(s.units[unitId].applicants, null);
  assert.equal(s.units[unitId].askRent, null);
  assert.ok(!s.pending.some((p) => p.kind === 'applicants'));
  assert.match(E.checkAction(s, world, { type: 'setRent', unitId, rent }), /let/);
  const next = play(s, world, { type: 'endMonth' });
  const rentEvents = next.events.filter((e) => e.type === 'cash' && e.reason === 'rent' && e.unitId === unitId);
  const missed = next.events.some((e) => e.type === 'arrears' && e.unitId === unitId);
  assert.ok(rentEvents.length === 1 || missed, 'rent paid or arrears recorded');
  if (rentEvents.length) assert.equal(rentEvents[0].amount, lease.rent);
  assert.equal(E.rentMonth(s), lease.rent);
  // declining applicants keeps the advert up
  const listed = play(bought.state, world, { type: 'setRent', unitId, rent }).state;
  const w2 = waitForApplicants(listed, world, unitId);
  const d = play(w2.state, world, { type: 'declineApplicants', unitId });
  assert.equal(d.state.units[unitId].applicants, null);
  assert.equal(d.state.units[unitId].askRent, rent);
  assert.ok(!d.state.pending.some((p) => p.kind === 'applicants'));
});

test('letting: an initial rent more than 10% over the previous rent and above market can be challenged and capped', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'challenge', world }), world, { vacant: true });
  let s = structuredClone(bought.state);
  const unitId = bought.unitId;
  const { b, flat } = E.flatOfUnit(world, s.units[unitId]);
  const market = E.marketRent(s, world, b, flat, s.units[unitId].condition);
  const prev = Math.round(market * 0.6 / 10) * 10;
  s.units[unitId].prevRent = prev;
  const ask = Math.round(market * 1.08 / 10) * 10; // above market, far over 110% of the previous rent
  // the roll itself: never when the jump is small or the ask is at market
  const r = E.stream(1, 'x');
  assert.equal(challengeRoll(r, { ask: prev * 1.1, market, prevRent: prev }), false);
  assert.equal(challengeRoll(r, { ask: market, market, prevRent: prev }), false);
  assert.equal(challengeRoll(r, { ask, market, prevRent: null }), false);
  let any = false;
  for (let k = 0; k < 200; k++) any = any || challengeRoll(E.stream(k, 'c'), { ask, market, prevRent: prev });
  assert.ok(any, 'some tenants challenge');
  s = play(s, world, { type: 'setRent', unitId, rent: ask }).state;
  s = waitForApplicants(s, world, unitId).state;
  s = structuredClone(s);
  s.units[unitId].applicants[0].willChallenge = true;
  const r2 = play(s, world, { type: 'chooseTenant', unitId, index: 0 });
  const lease = r2.state.units[unitId].lease;
  const marketNow = E.marketRent(s, world, b, flat, s.units[unitId].condition); // the index drifted while we waited
  const capped = Math.max(E.round(prev * 1.1), E.round(marketNow * 0.98));
  assert.equal(lease.rent, E.round(capped / 5) * 5);
  assert.ok(lease.rent < ask);
  assert.equal(r2.state.stats.challenges, 1);
  assert.match(r2.events.find((e) => e.type === 'let').text, /challenged/);
  // the same applicant without a challenge pays the asking rent
  s.units[unitId].applicants[0].willChallenge = false;
  assert.equal(play(s, world, { type: 'chooseTenant', unitId, index: 0 }).state.units[unitId].lease.rent, ask);
});

test('selling: list, a buyer arrives within a few months, counter, accept, settleSale removes lot, units and loan and posts the tax', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'sell', world }), world);
  let s = structuredClone(bought.state);
  const lotId = bought.lotId;
  // a price jump so that the sale carries a gain
  for (const k of Object.keys(s.macro.idx.price)) s.macro.idx.price[k] *= 1.5;
  const fair = E.lotValue(s, world, lotId);
  assert.match(E.checkAction(s, world, { type: 'listForSale', lotId: 'P99', ask: 1 }), /Not your property/);
  assert.match(E.checkAction(s, world, { type: 'listForSale', lotId, ask: 0 }), /asking price/);
  const ask = Math.round(fair * 0.97);
  let r = play(s, world, { type: 'listForSale', lotId, ask });
  s = r.state;
  assert.deepEqual(s.lots[lotId].forSale, { ask, since: s.month });
  assert.match(E.checkAction(s, world, { type: 'listForSale', lotId, ask }), /Already/);
  let months = 0;
  while (!s.negotiation && months < 12) {
    r = play(s, world, { type: 'endMonth' });
    s = r.state;
    months += 1;
  }
  assert.ok(s.negotiation, 'a buyer came');
  assert.ok(months <= 6, `buyer took ${months} months`);
  assert.equal(s.negotiation.kind, 'sell');
  assert.equal(s.negotiation.lotId, lotId);
  assert.ok(r.events.some((e) => e.type === 'buyerOffer' && e.lotId === lotId));
  const opening = s.negotiation.price;
  assert.ok(opening <= ask);
  assert.ok(opening >= fair * 0.8);
  assert.match(E.checkAction(s, world, { type: 'counterOffer', price: opening }), /above the buyer/);
  assert.match(E.checkAction(s, world, { type: 'cancelSale', lotId }), /Answer the buyer/);
  assert.match(E.checkAction(s, world, { type: 'endMonth' }), /offer on the table/);
  r = play(s, world, { type: 'counterOffer', price: opening + 5000 });
  s = r.state;
  const reply = r.events.find((e) => e.type === 'reply').reply;
  assert.ok(['accept', 'counter', 'walk'].includes(reply));
  if (reply === 'walk') {
    assert.equal(s.negotiation, null);
    assert.ok(s.lots[lotId].forSale, 'still listed');
    return;
  }
  if (s.negotiation) {
    assert.ok(s.negotiation.price > opening, 'the buyer moved up');
    const before = s;
    r = play(s, world, { type: 'acceptOffer' });
    s = r.state;
    assert.equal(r.events.find((e) => e.type === 'accept').price, before.negotiation.price);
  }
  const sold = r.events.find((e) => e.type === 'sold');
  assert.ok(sold, 'sold event');
  assert.ok(!s.lots[lotId]);
  assert.ok(!s.units[bought.unitId]);
  assert.equal(Object.keys(s.loans).length, 0);
  assert.equal(s.negotiation, null);
  assert.equal(s.stats.sold, 1);
  assert.ok(sold.gain > 0, 'the price jump gives a gain');
  const taxEv = r.events.find((e) => e.type === 'cash' && e.reason === 'gainsTax');
  assert.ok(taxEv && taxEv.amount < 0, 'gains tax posted');
  assert.equal(-taxEv.amount, sold.tax);
  assert.equal(s.stats.gainsTax, sold.tax);
  // the tax matches the tariff with the short-hold surcharge
  const monthsHeld = s.month - bought.state.month;
  assert.equal(sold.tax, E.gainsTax(sold.gain, monthsHeld).tax);
  assert.ok(E.holdingAdjustmentPct(monthsHeld) > 0, 'held under two years: surcharged');
  // cash: price less broker, tax and the loan payoff
  const payoff = Object.values(r.events).filter((e) => e.type === 'cash' && e.reason === 'repay').reduce((a, e) => a - e.amount, 0);
  const broker = -r.events.find((e) => e.type === 'cash' && e.reason === 'broker').amount;
  assert.equal(broker, E.round(sold.price * E.rule('brokerFeePct') / 100));
  assert.equal(sumCashEvents(r.events), sold.price - broker - sold.tax - payoff);
  assert.equal(sold.net, sold.price - broker - sold.tax - payoff);
  assert.ok(s.milestones.firstGain !== undefined);
});

test('selling: saleBreakdown previews the same numbers the settlement posts, and cancelSale withdraws the lot', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'preview', world }), world);
  let s = bought.state;
  const lotId = bought.lotId;
  const fair = E.lotValue(s, world, lotId);
  const bd = E.saleBreakdown(s, world, lotId, fair);
  assert.equal(bd.price, fair);
  assert.equal(bd.basis, s.lots[lotId].bought.price + s.lots[lotId].bought.costs);
  assert.equal(bd.payoff, Object.values(s.loans)[0].balance);
  assert.equal(bd.net, fair - bd.broker - bd.tax - bd.payoff);
  assert.equal(bd.adjustmentPct, 50);
  s = play(s, world, { type: 'listForSale', lotId, ask: fair }).state;
  const r = play(s, world, { type: 'cancelSale', lotId });
  assert.equal(r.state.lots[lotId].forSale, null);
  assert.ok(r.events.some((e) => e.type === 'unlisted'));
});

test('forced sale: three months after a failed December review the bank sells the lot at a discount', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'forced', world }), world, { vacant: false });
  let s = structuredClone(bought.state);
  s.player.salaryYear = 0; // the household test now runs on rent alone and fails
  let fail = null;
  for (let k = 0; k < 14 && !fail; k++) {
    const r = play(s, world, { type: 'endMonth' });
    s = r.state;
    fail = r.events.find((e) => e.type === 'bankFail');
  }
  assert.ok(fail, 'a failed review');
  assert.equal((s.month - 1) % 12, 10, 'reviews run when December opens');
  const p = s.pending.find((x) => x.kind === 'bankReview');
  assert.ok(p);
  assert.ok(p.required > 0 && p.required <= s.loans[p.loanId].balance);
  assert.equal(E.checkAction(s, world, { type: 'resolveReview', loanId: p.loanId, choice: 'hope' }), 'Choose inject or sell.');
  // ignore it: two months pass quietly, the third brings the forced sale
  let forced = null;
  for (let k = 0; k < 2; k++) {
    const r = play(s, world, { type: 'endMonth' });
    s = r.state;
    assert.ok(!r.events.some((e) => e.type === 'forcedSale'), `no forced sale after ${k + 1} months`);
  }
  const r = play(s, world, { type: 'endMonth' });
  s = r.state;
  forced = r.events.find((e) => e.type === 'forcedSale');
  assert.ok(forced, 'forced sale in the third month');
  assert.equal(forced.lotId, bought.lotId);
  assert.ok(!s.lots[bought.lotId]);
  assert.ok(!s.units[bought.unitId]);
  assert.equal(Object.keys(s.loans).length, 0);
  assert.deepEqual(s.pending.filter((x) => x.kind === 'bankReview'), []);
  assert.equal(s.stats.forcedSales, 1);
  assert.ok(r.events.some((e) => e.type === 'sold' && e.lotId === bought.lotId));
  assert.equal(s.over, null, 'still solvent');
});

test('forced sale: injecting cash clears the review instead', () => {
  const world = fixture();
  const bought = buyCondo(E.createCareer({ seed: 'inject', world }), world, { vacant: false });
  let s = structuredClone(bought.state);
  s.player.salaryYear = 0;
  s.player.cash = 5_000_000;
  let fail = null;
  for (let k = 0; k < 14 && !fail; k++) {
    const r = play(s, world, { type: 'endMonth' });
    s = r.state;
    fail = r.events.find((e) => e.type === 'bankFail');
  }
  const p = s.pending.find((x) => x.kind === 'bankReview');
  const balance = s.loans[p.loanId].balance;
  const r = play(s, world, { type: 'resolveReview', loanId: p.loanId, choice: 'inject' });
  assert.equal(sumCashEvents(r.events), -Math.min(p.required, balance));
  assert.ok(!r.state.pending.some((x) => x.kind === 'bankReview'));
  if (r.state.loans[p.loanId]) assert.equal(r.state.loans[p.loanId].balance, balance - p.required);
  else assert.equal(p.required, balance);
});

test('career end: month 180 closes the career with reason end and nothing more can be played', () => {
  const world = fixture();
  let s = E.createCareer({ seed: 'end', world });
  s = advanceTo(s, world, 180, 12);
  assert.equal(s.month, 180);
  assert.deepEqual(s.over, { reason: 'end', month: 180 });
  assert.equal(E.monthsLeft(s), 0);
  assert.equal(E.checkAction(s, world, { type: 'endMonth' }), 'The career is over.');
  assert.deepEqual(E.legalActions(s, world), []);
  assert.equal(E.advance(s, world).months, 0);
  const sum = E.careerSummary(s, world);
  assert.equal(sum.done, true);
  assert.equal(sum.months, 180);
  assert.equal(sum.startNetWorth, 1_000_000);
  assert.ok(sum.netWorth >= 1_000_000 + 180 * 4_500, 'savings alone accumulate');
  assert.equal(s.history.length, 181);
  assert.equal(E.monthLabel(180), 'Jan 2042');
  assert.equal(E.monthLabel(179), 'Dec 2041');
});
