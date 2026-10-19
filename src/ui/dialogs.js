// Dialogs: offer and negotiation, financing, rent, applicants, renovation, sale, loan, rate reset,
// bank review, reference rate letter, settings, help, menu, career summary.

import { h, chf, pct, bps, kv, parseMoney, roundTo } from './dom.js';
import { buildingOf, flatLabel } from '../engine/world.js';
import { listingRentMonth, listingArea, lotValue, lotRentMonth, unitOf, flatOfUnit, marketRent } from '../engine/valuation.js';
import { quoteForPurchase, refinanceQuote } from '../engine/actions.js';
import { purchaseCosts, saleBreakdown } from '../engine/tax.js';
import { unitRenoQuote, buildingRenoQuote, UNIT_PACKAGES } from '../engine/building.js';
import { refRateAdjustment } from '../engine/lease.js';
import { loanRateBps, offeredRateBps } from '../engine/bank.js';
import { careerSummary } from '../engine/report.js';
import { COUNTER_LIMIT, lastOfferBy } from '../engine/negotiation.js';
import { monthLabel } from '../engine/clock.js';
import { BANKS, BANK_IDS, PRODUCTS } from '../data/banks.js';
import { RULES, rulesByStatus } from '../data/rules.js';
import { DIFFICULTIES } from '../engine/state.js';

export function createDialogs({ world, ctrl, ui, overlay, toasts, sfx, settings, onSettings, onNewGame }) {
  const S = () => ctrl.state;

  function act(action, api) {
    const r = ctrl.dispatch(action);
    if (r.error) { api?.setError(r.error); return false; }
    return true;
  }

  const step = (kind) => (kind === 'building' ? 50000 : 5000);

  // ---------- offer / negotiation ----------
  function offer({ listingId }) {
    const l = S().listings[listingId];
    if (!l) return;
    const b = buildingOf(world, l.buildingId);
    const area = listingArea(world, l);
    let price = roundTo(l.ask * 0.92, step(l.kind));
    const input = h('input', { class: 'im-input', value: price, inputmode: 'numeric', 'aria-label': 'Your offer' });
    const range = h('input', { class: 'im-range', type: 'range', min: Math.round(l.ask * 0.7), max: l.ask, step: step(l.kind), value: price });
    const perM2 = h('span', { class: 'im-note' });
    const sync = (v) => { price = v; input.value = v; range.value = v; perM2.textContent = `${chf(Math.round(v / area))} per m² · ${pct(v / l.ask - 1, 1)} against asking`; };
    input.addEventListener('input', () => { const v = parseMoney(input.value); if (Number.isFinite(v)) sync(v); });
    range.addEventListener('input', () => sync(Number(range.value)));
    sync(price);
    overlay.open({
      title: 'Make an offer',
      sub: `${l.title} · asking ${chf(l.ask)} · ${l.seller.label}`,
      body: () => h('div', {},
        kv([['Rent roll', listingRentMonth(l) ? `${chf(listingRentMonth(l))}/mo` : 'empty'], ['Per m² asked', chf(Math.round(l.ask / area))], ['Cash available', chf(S().player.cash)]]),
        h('div', { class: 'im-field' }, h('label', {}, 'Your offer'), input, range, perM2),
        h('p', { class: 'im-note' }, `${l.seller.line} Sellers with a reason to move accept less. You have ${COUNTER_LIMIT} counters after their reply.`)),
      actions: (api) => [
        { label: 'Cancel', onClick: () => api.close() },
        { label: 'Send offer', primary: true, onClick: (api2) => { if (act({ type: 'makeOffer', listingId, price: Math.round(price) }, api2)) afterReply(); } },
      ],
    });
  }

  function afterReply() {
    const s = S();
    if (s.negotiation) negotiation();
    else if (s.purchase) financing();
    else overlay.close();
  }

  function negotiation() {
    const s = S();
    const neg = s.negotiation;
    if (!neg) { overlay.close(); return; }
    const isBuy = neg.kind === 'buy';
    const l = isBuy ? s.listings[neg.listingId] : null;
    const lot = isBuy ? null : s.lots[neg.lotId];
    const kind = isBuy ? l.kind : lot.kind;
    const title = isBuy ? l.title : lot.title;
    const cpName = isBuy ? 'Seller' : (neg.buyer?.label || 'Buyer');
    const last = neg.history[neg.history.length - 1];
    const mine = lastOfferBy(neg, 'player');
    let counter = isBuy ? roundTo((neg.price + (mine || neg.price * 0.95)) / 2, step(kind)) : roundTo((neg.price + (mine || lot.forSale?.ask || neg.price * 1.05)) / 2, step(kind));
    const input = h('input', { class: 'im-input', value: counter, inputmode: 'numeric', 'aria-label': 'Counter-offer' });
    input.addEventListener('input', () => { const v = parseMoney(input.value); if (Number.isFinite(v)) counter = v; });
    const left = COUNTER_LIMIT - neg.counters.player;
    const bd = !isBuy ? saleBreakdown(s, world, lot.id, neg.price) : null;
    overlay.open({
      title: isBuy ? 'Negotiation' : 'An offer for your property',
      sub: `${title} · ${isBuy ? `asking ${chf(l.ask)}` : `you asked ${chf(lot.forSale?.ask || 0)}`}`,
      dismissible: false,
      body: () => h('div', {},
        h('ul', { class: 'im-history' }, neg.history.map((e) => h('li', { class: e.by === 'player' ? 'player' : 'cp' },
          h('span', {}, e.by === 'player' ? 'You' : cpName),
          h('span', {}, e.kind === 'accept' ? `accept ${chf(e.price)}` : e.kind === 'walk' ? 'end the talks' : `${e.kind === 'offer' ? 'offer' : 'counter'} ${chf(e.price)}${e.final ? ' (final)' : ''}`),
          e.interest ? h('span', { class: `im-interest ${e.interest}` }, e.interest) : h('span')))),
        last.kind !== 'walk' ? h('div', {},
          kv([
            [`${cpName}'s price on the table`, chf(neg.price), 'total'],
            !isBuy ? ['Net to you at this price', `${chf(bd.net)} after ${chf(bd.tax)} gains tax`] : ['Cash available', chf(s.player.cash)],
          ]),
          left > 0 && !neg.final ? h('div', { class: 'im-field' }, h('label', {}, `Counter (${left} left)`), input) : h('p', { class: 'im-note im-note--warn' }, neg.final ? `${cpName} says this is final.` : 'You have no counters left.'),
        ) : h('p', { class: 'im-note' }, `${cpName} walked away.`)),
      actions: (api) => last.kind === 'walk' ? [{ label: 'Close', primary: true, onClick: () => { overlay.close(); } }] : [
        { label: isBuy ? 'Walk away' : 'Turn down', left: true, onClick: () => { act({ type: 'walkAway' }, api); overlay.close(); } },
        left > 0 && !neg.final ? { label: 'Counter', onClick: (api2) => { if (act({ type: 'counterOffer', price: Math.round(counter) }, api2)) afterReply(); } } : null,
        { label: `Accept ${chf(neg.price)}`, primary: true, onClick: (api2) => { if (act({ type: 'acceptOffer' }, api2)) afterReply(); } },
      ],
    });
  }

  // ---------- financing ----------
  function financing() {
    const s = S();
    const p = s.purchase;
    if (!p) { overlay.close(); return; }
    const l = s.listings[p.listingId];
    let bankId = p.financing?.bankId || 'lkb';
    let product = p.financing?.product || 'fix5';
    let loan = p.financing?.loan ?? null;
    let cashOnly = p.financing ? p.financing.loan === 0 : false;
    const quotes = () => Object.fromEntries(BANK_IDS.map((id) => [id, quoteForPurchase(s, world, p, id, BANKS[id].products.includes(product) ? product : BANKS[id].products[0])]));
    const api = overlay.open({
      title: 'Financing',
      sub: `${l.title} at ${chf(p.price)} · close by end of ${monthLabel(p.deadline)}`,
      wide: true,
      dismissible: true,
      body: (api2) => {
        const qs = quotes();
        const q = qs[bankId];
        if (!BANKS[bankId].products.includes(product)) product = BANKS[bankId].products[0];
        if (loan === null || loan > q.maxLoan) loan = cashOnly ? 0 : q.maxLoan;
        const costs = purchaseCosts(p.price, cashOnly ? 0 : loan);
        const cashNeeded = p.price - (cashOnly ? 0 : loan) + costs.total;
        const loanInput = h('input', { class: 'im-input', value: cashOnly ? 0 : loan, inputmode: 'numeric', 'aria-label': 'Loan amount', disabled: cashOnly || null });
        const loanRange = h('input', { class: 'im-range', type: 'range', min: 0, max: q.maxLoan, step: 10000, value: cashOnly ? 0 : loan, disabled: cashOnly || null });
        loanInput.addEventListener('change', () => { const v = parseMoney(loanInput.value); if (Number.isFinite(v)) { loan = Math.max(0, Math.min(q.maxLoan, v)); api2.rerender(); } });
        loanRange.addEventListener('change', () => { loan = Number(loanRange.value); api2.rerender(); });
        const rateNow = q.rateBps;
        const interestMonth = Math.round(((cashOnly ? 0 : loan) * rateNow) / 120000);
        const amort = Math.max(0, (cashOnly ? 0 : loan) - Math.round(q.lendingValue * 2 / 3));
        const amortMonth = amort > 0 ? Math.round(amort / BANKS[bankId].amortYears / 12) : 0;
        return h('div', {},
          h('div', { class: 'im-options', style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, ...BANK_IDS.map((id) => {
            const qq = qs[id];
            return h('button', { class: 'im-option', type: 'button', 'aria-pressed': String(bankId === id && !cashOnly), disabled: qq.decision === 'no' || null, onClick: () => { bankId = id; cashOnly = false; loan = null; api2.rerender(); } },
              h('div', { class: 'im-option-title' }, h('span', {}, BANKS[id].short)),
              h('div', { class: 'im-option-sub' }, qq.decision === 'no' ? 'Declines' : `up to ${chf(qq.maxLoan, { compact: true })} · ${bps(qq.rateBps)}`),
              h('div', { class: 'im-option-sub' }, `${BANKS[id].minEquityPct}% equity · ${BANKS[id].amortYears}y amortisation`));
          }), h('button', { class: 'im-option', type: 'button', 'aria-pressed': String(cashOnly), onClick: () => { cashOnly = true; loan = 0; api2.rerender(); } }, h('div', { class: 'im-option-title' }, 'Pay cash'), h('div', { class: 'im-option-sub' }, 'No loan, no bank, no amortisation.'))),
          !cashOnly ? h('div', {},
            h('div', { class: 'im-field' }, h('label', {}, 'Product'), h('div', { class: 'im-btn-row' }, ...BANKS[bankId].products.map((pr) => h('button', { class: `im-btn im-btn--small ${product === pr ? 'im-btn--primary' : ''}`, type: 'button', onClick: () => { product = pr; api2.rerender(); } }, `${PRODUCTS[pr].label} ${bps(offeredRateBps(s, bankId, pr))}`)))),
            h('div', { class: 'im-field' }, h('label', {}, `Loan (bank maximum ${chf(q.maxLoan)})`), h('div', { class: 'im-inline' }, loanInput), loanRange),
            q.reasons.length ? h('p', { class: 'im-note im-note--warn' }, q.reasons.join(' ')) : null,
          ) : null,
          h('div', { class: 'im-grid2', style: { marginTop: '12px' } },
            kv([
              ['Bank valuation', chf(q.valuation)], ['Lending value', chf(q.lendingValue)],
              ['Loan to value', pct((cashOnly ? 0 : loan) / q.lendingValue, 0)], ['Affordability', `${pct(q.ratio, 0)} of income (cap ${pct(q.cap, 0)})`, q.ratio > q.cap ? 'down' : ''],
            ]),
            kv([
              ['Equity needed', chf(p.price - (cashOnly ? 0 : loan))], ['Fees (notary, registry, note)', chf(costs.total)],
              ['Cash needed', chf(cashNeeded), 'total'], ['You have', chf(s.player.cash), cashNeeded > s.player.cash ? 'down' : ''],
              ['Interest + amortisation', `${chf(interestMonth + amortMonth)}/mo`], ['Rent coming in', `${chf(listingRentMonth(l))}/mo`],
            ])),
        );
      },
      actions: (api2) => [
        { label: 'Abandon purchase', left: true, onClick: () => { act({ type: 'abandonPurchase' }, api2); overlay.close(); } },
        { label: 'Decide later', onClick: () => overlay.close() },
        { label: 'Sign and close', primary: true, onClick: (api3) => {
          const chosen = cashOnly ? { type: 'chooseFinancing', bankId: null, product: null, loan: 0 } : { type: 'chooseFinancing', bankId, product, loan: Math.round(loan) };
          if (!act(chosen, api3)) return;
          if (act({ type: 'closePurchase' }, api3)) { overlay.close(); toasts.show({ text: `Closed. ${l.title} is yours.`, kind: 'good' }); ui.select(l.buildingId); }
        } },
      ],
    });
    return api;
  }

  // ---------- rent ----------
  function rent({ unitId }) {
    const s = S();
    const u = unitOf(s, unitId);
    const { b, flat } = flatOfUnit(world, u);
    const market = marketRent(s, world, b, flat, u.condition);
    let ask = u.askRent || roundTo(market, 10);
    const input = h('input', { class: 'im-input', value: ask, inputmode: 'numeric', 'aria-label': 'Monthly rent' });
    const note = h('p', { class: 'im-note' });
    const risk = () => {
      const jump = u.prevRent ? ask / u.prevRent - 1 : 0;
      const over = ask / market - 1;
      let t = `${pct(over, 0)} against market. `;
      t += over <= 0 ? 'Applicants queue within the month.' : over <= 0.1 ? 'Most months bring applicants.' : over <= 0.2 ? 'Applicants become scarce.' : 'Expect it to sit empty.';
      if (u.prevRent && jump > 0.1 && ask > market) t += ` The jump of ${pct(jump, 0)} over the last rent (${chf(u.prevRent)}) must be disclosed on the official form; the new tenant can challenge it within 30 days.`;
      else if (u.prevRent) t += ` Last rent ${chf(u.prevRent)}: within the safe range.`;
      note.textContent = t;
    };
    input.addEventListener('input', () => { const v = parseMoney(input.value); if (Number.isFinite(v)) { ask = v; risk(); } });
    risk();
    overlay.open({
      title: 'Set the rent',
      sub: `${b.street} ${b.no} · ${flatLabel(flat)}`,
      body: () => h('div', {}, kv([['Market rent for a new let', chf(market)], ['Condition', `${u.condition}/100`], u.prevRent ? ['Previous tenant paid', chf(u.prevRent)] : null]),
        h('div', { class: 'im-field' }, h('label', {}, 'Net rent per month'), input, h('div', { class: 'im-btn-row' }, ...[0.95, 1, 1.05, 1.1].map((f) => h('button', { class: 'im-btn im-btn--small', type: 'button', onClick: () => { ask = roundTo(market * f, 10); input.value = ask; risk(); } }, `${Math.round(f * 100)}%`)))), note),
      actions: (api) => [{ label: 'Cancel', onClick: () => api.close() }, { label: 'Advertise', primary: true, onClick: (api2) => { if (act({ type: 'setRent', unitId, rent: Math.round(ask) }, api2)) api2.close(); } }],
    });
  }

  function applicants({ unitId }) {
    const s = S();
    const u = unitOf(s, unitId);
    const { b, flat } = flatOfUnit(world, u);
    if (!u.applicants?.length) { overlay.close(); return; }
    overlay.open({
      title: 'Applicants',
      sub: `${b.street} ${b.no} · ${flatLabel(flat)} · ${chf(u.askRent)} a month`,
      body: () => h('div', { class: 'im-options' }, ...u.applicants.map((a, i) => h('button', { class: 'im-option', type: 'button', onClick: (e) => { const r = ctrl.dispatch({ type: 'chooseTenant', unitId, index: i }); if (r.error) toasts.show({ text: r.error, kind: 'warn' }); else { overlay.close(); const ev = r.events.find((x) => x.type === 'let'); if (ev) toasts.show({ text: ev.text, kind: ev.text.includes('challenged') ? 'warn' : 'good', ms: 6000 }); } } },
        h('div', { class: 'im-option-title' }, h('span', {}, a.name), h('span', { class: 'im-chip' }, a.label)),
        h('div', { class: 'im-option-sub' }, a.line)))),
      actions: (api) => [{ label: 'Keep advertising', onClick: () => { act({ type: 'declineApplicants', unitId }, api); api.close(); } }],
    });
  }

  // ---------- renovation ----------
  function renovate({ unitId }) {
    const s = S();
    const u = unitOf(s, unitId);
    const { b, flat } = flatOfUnit(world, u);
    const quotes = UNIT_PACKAGES.map((pkg) => unitRenoQuote(s, world, unitId, pkg));
    overlay.open({
      title: 'Renovate',
      sub: `${b.street} ${b.no} · ${flatLabel(flat)} · condition ${u.condition}/100 · cash ${chf(s.player.cash)}`,
      wide: true,
      body: () => h('div', {},
        h('table', { class: 'im-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Package'), h('th', {}, 'Cost'), h('th', {}, 'Months'), h('th', {}, 'Condition'), h('th', {}, u.lease ? 'Rent with tenant' : 'Market rent after'), h('th', {}, ''))),
          h('tbody', {}, ...quotes.map((q) => h('tr', {},
            h('td', {}, h('b', {}, q.label), h('div', { class: 'im-note' }, q.maintenance ? 'Maintenance: no rent increase, deductible.' : `${Math.round(RULES.renoPackages.value[q.pkg].valueAdding * 100)}% counts as value-adding.`)),
            h('td', {}, chf(q.cost)),
            h('td', {}, q.months),
            h('td', {}, `${u.condition} → ${q.newCondition}`),
            h('td', {}, u.lease ? `+${chf(q.sittingIncrease)}/mo` : `${chf(q.marketNow)} → ${chf(q.marketAfter)}`),
            h('td', {}, h('button', { class: 'im-btn im-btn--small im-btn--primary', type: 'button', disabled: Boolean(q.blockedBy) || s.player.cash < q.cost || null, title: q.blockedBy || null, onClick: () => { const r = ctrl.dispatch({ type: 'startRenovation', unitId, pkg: q.pkg }); if (r.error) toasts.show({ text: r.error, kind: 'warn' }); else overlay.close(); } }, 'Start')),
          )))),
        h('p', { class: 'im-note', style: { marginTop: '12px' } }, 'With a sitting tenant the rent may rise by the Federal Court formula on the value-adding share: (reference rate + 0.5%) / 2 plus 1 / lifespan, plus 10%. An empty flat is re-let at market, and a full overhaul resets the old rent as the anchor for the initial rent form.'),
        quotes.some((q) => q.blockedBy) ? h('p', { class: 'im-note im-note--warn' }, quotes.filter((q) => q.blockedBy).map((q) => `${q.label}: ${q.blockedBy}`).join(' ')) : null),
      actions: (api) => [{ label: 'Close', onClick: () => api.close() }],
    });
  }

  function renovateBuilding({ lotId }) {
    const s = S();
    const q = buildingRenoQuote(s, world, lotId);
    const lot = s.lots[lotId];
    overlay.open({
      title: 'Facade and energy',
      sub: lot.title,
      body: () => h('div', {}, kv([['Cost', chf(q.cost)], ['Duration', `${q.months} months`], ['Value-adding share', chf(q.valueAdding)], ['Rent increase for sitting tenants', `+${chf(q.sittingIncrease)}/mo`], ['Running costs', 'down 10% for good'], ['Condition', '+10 in every flat']]),
        q.blockedBy ? h('p', { class: 'im-note im-note--warn' }, q.blockedBy) : null),
      actions: (api) => [{ label: 'Cancel', onClick: () => api.close() }, { label: 'Start the works', primary: true, disabled: Boolean(q.blockedBy) || s.player.cash < q.cost, onClick: (api2) => { if (act({ type: 'startBuildingRenovation', lotId }, api2)) api2.close(); } }],
    });
  }

  // ---------- sale ----------
  function sell({ lotId }) {
    const s = S();
    const lot = s.lots[lotId];
    const fair = lotValue(s, world, lotId);
    let ask = roundTo(fair * 1.02, step(lot.kind));
    const input = h('input', { class: 'im-input', value: ask, inputmode: 'numeric', 'aria-label': 'Asking price' });
    const box = h('div');
    const render = () => {
      const bd = saleBreakdown(s, world, lotId, ask);
      box.replaceChildren(kv([
        ['Asking price', chf(ask), 'total'], ['Against value', pct(ask / fair - 1, 1)],
        ['Broker fee', `−${chf(bd.broker)}`], ['Cost basis (price, fees, works)', chf(bd.basis)], ['Taxable gain', chf(Math.max(0, bd.gain))],
        [`Gains tax (${bd.adjustmentPct > 0 ? '+' : ''}${bd.adjustmentPct}% for ${bd.fullYears} full year${bd.fullYears === 1 ? '' : 's'})`, `−${chf(bd.tax)}`, bd.adjustmentPct > 0 ? 'down' : ''],
        ['Mortgage repaid', `−${chf(bd.payoff)}`], ['Net to you', chf(bd.net), 'total'],
      ]), h('p', { class: 'im-note', style: { marginTop: '8px' } }, bd.monthsHeld < 24 ? `Held under two years: the surcharge of ${bd.adjustmentPct}% applies. Holding until ${monthLabel(lot.bought.month + 24)} removes it; five full years earn the first reduction.` : `Reductions grow 3 points a year to 50% after twenty years.`));
    };
    input.addEventListener('input', () => { const v = parseMoney(input.value); if (Number.isFinite(v)) { ask = v; render(); } });
    render();
    overlay.open({
      title: 'Sell',
      sub: `${lot.title} · value about ${chf(fair)}`,
      body: () => h('div', {}, h('div', { class: 'im-field' }, h('label', {}, 'Asking price'), input, h('div', { class: 'im-btn-row' }, ...[0.97, 1, 1.03, 1.06].map((f) => h('button', { class: 'im-btn im-btn--small', type: 'button', onClick: () => { ask = roundTo(fair * f, step(lot.kind)); input.value = ask; render(); } }, `${Math.round(f * 100)}%`)))), box,
        h('p', { class: 'im-note' }, 'Buyers arrive over the next months and open below your price. You can counter each offer.')),
      actions: (api) => [{ label: 'Cancel', onClick: () => api.close() }, { label: 'Put it on the market', primary: true, onClick: (api2) => { if (act({ type: 'listForSale', lotId, ask: Math.round(ask) }, api2)) api2.close(); } }],
    });
  }

  // ---------- loan ----------
  function loanDialog({ loanId }) {
    const s = S();
    const loan = s.loans[loanId];
    if (!loan) { overlay.close(); return; }
    const lot = s.lots[loan.lotId];
    const pend = s.pending.find((p) => p.loanId === loanId);
    const value = lotValue(s, world, loan.lotId);
    let repay = Math.min(loan.balance, roundTo(s.player.cash * 0.5, 10000));
    const repayInput = h('input', { class: 'im-input', value: repay, inputmode: 'numeric', 'aria-label': 'Repay amount' });
    repayInput.addEventListener('input', () => { const v = parseMoney(repayInput.value); if (Number.isFinite(v)) repay = v; });
    const canRefi = loan.fixedUntil === null || loan.fixedUntil <= s.month + 3;
    let refiBank = loan.bankId;
    let refiProduct = loan.product;
    overlay.open({
      title: `${loan.bankName} mortgage`,
      sub: lot ? lot.title : '',
      wide: true,
      body: (api) => {
        const rq = canRefi ? refinanceQuote(s, world, loanId, refiBank, BANKS[refiBank].products.includes(refiProduct) ? refiProduct : BANKS[refiBank].products[0]) : null;
        return h('div', {},
          kv([
            ['Balance', chf(loan.balance), 'total'], ['Rate', `${bps(loanRateBps(s, loan))} (${PRODUCTS[loan.product].label}${loan.fixedUntil !== null ? ` until ${monthLabel(loan.fixedUntil)}` : ''})`],
            ['Interest', `${chf(Math.round((loan.balance * loanRateBps(s, loan)) / 120000))}/mo`], ['Amortisation', loan.amortMonth && loan.balance > loan.amortFloor ? `${chf(loan.amortMonth)}/mo down to ${chf(loan.amortFloor)}` : 'none due'],
            ['Property value', chf(value)], ['Loan to value', pct(loan.balance / value, 0)],
          ]),
          pend?.kind === 'rollover' ? h('div', {}, h('div', { class: 'im-section' }, 'Rate reset due'), h('div', { class: 'im-btn-row' }, ...BANKS[loan.bankId].products.map((pr) => h('button', { class: 'im-btn im-btn--primary im-btn--small', type: 'button', onClick: (e) => { if (act({ type: 'chooseRollover', loanId, product: pr }, api)) overlay.close(); } }, `${PRODUCTS[pr].label} ${bps(offeredRateBps(s, loan.bankId, pr))}`)))) : null,
          pend?.kind === 'bankReview' ? h('div', {}, h('div', { class: 'im-section' }, 'Review failed'), h('p', { class: 'im-note im-note--warn' }, `${BANKS[loan.bankId].name} wants ${chf(pend.required)} paid down, or the property sold, within three months of ${monthLabel(pend.month)}.`),
            h('div', { class: 'im-btn-row', style: { marginTop: '8px' } }, h('button', { class: 'im-btn im-btn--primary', type: 'button', disabled: s.player.cash < pend.required || null, onClick: () => { if (act({ type: 'resolveReview', loanId, choice: 'inject' }, api)) overlay.close(); } }, `Pay down ${chf(pend.required)}`), h('button', { class: 'im-btn', type: 'button', onClick: () => { if (act({ type: 'resolveReview', loanId, choice: 'sell' }, api)) overlay.close(); } }, 'Put the property up for sale'))) : null,
          h('div', { class: 'im-section' }, 'Repay early'),
          h('div', { class: 'im-inline' }, repayInput, h('button', { class: 'im-btn', type: 'button', onClick: () => { if (act({ type: 'repayLoan', loanId, amount: Math.round(repay) }, api)) overlay.close(); } }, 'Repay')),
          h('div', { class: 'im-section' }, 'Refinance'),
          canRefi ? h('div', {},
            h('div', { class: 'im-btn-row' }, ...BANK_IDS.map((id) => h('button', { class: `im-btn im-btn--small ${refiBank === id ? 'im-btn--primary' : ''}`, type: 'button', onClick: () => { refiBank = id; api.rerender(); } }, BANKS[id].short))),
            h('div', { class: 'im-btn-row', style: { marginTop: '6px' } }, ...BANKS[refiBank].products.map((pr) => h('button', { class: `im-btn im-btn--small ${refiProduct === pr ? 'im-btn--primary' : ''}`, type: 'button', onClick: () => { refiProduct = pr; api.rerender(); } }, `${PRODUCTS[pr].label} ${bps(offeredRateBps(s, refiBank, pr))}`))),
            rq.decision === 'no' ? h('p', { class: 'im-note im-note--warn' }, rq.reasons[0] || 'Declined.') : kv([['New loan (bank maximum)', chf(rq.loan)], ['Cash released', chf(rq.cashOut), rq.cashOut < 0 ? 'down' : 'up'], ['Note fee on the increase', chf(rq.noteFee)], ['Affordability after', `${pct(rq.ratio, 0)} (cap ${pct(rq.cap, 0)})`]]),
            h('div', { class: 'im-btn-row', style: { marginTop: '8px' } }, h('button', { class: 'im-btn im-btn--primary', type: 'button', disabled: rq.decision === 'no' || null, onClick: () => { if (act({ type: 'refinance', loanId, bankId: refiBank, product: BANKS[refiBank].products.includes(refiProduct) ? refiProduct : BANKS[refiBank].products[0] }, api)) overlay.close(); } }, 'Refinance')),
          ) : h('p', { class: 'im-note' }, `A fixed mortgage can be replaced within three months of its end (${monthLabel(loan.fixedUntil)}).`),
        );
      },
      actions: (api) => [{ label: 'Close', onClick: () => api.close() }],
    });
  }

  // ---------- reference rate letter ----------
  function refRate() {
    const s = S();
    const rows = [];
    let total = 0;
    for (const u of Object.values(s.units)) {
      if (u.owner !== 'player' || !u.lease) continue;
      const adj = refRateAdjustment(u.lease, s.macro.refBps, s.macro.cpiBps);
      if (adj.steps > 0 && adj.newRent > u.lease.rent) { const b = buildingOf(world, u.buildingId); rows.push([`${b.street} ${b.no}, ${u.lease.tenant.name}`, `${chf(u.lease.rent)} → ${chf(adj.newRent)}`]); total += adj.newRent - u.lease.rent; }
    }
    overlay.open({
      title: 'The reference rate went up',
      sub: `Now ${bps(s.macro.refBps)}. You may raise sitting rents by 3% per quarter point, plus 40% of inflation, after the notice period.`,
      body: () => h('div', {}, rows.length ? kv([...rows, ['Together', `+${chf(total)}/mo`, 'total']]) : h('p', { class: 'im-note' }, 'No tenant of yours is due an increase.'),
        h('p', { class: 'im-note', style: { marginTop: '8px' } }, 'Tenants rarely leave over it (vacancy is 0.1%), but a letter a year is the Zurich way; two in a row sours the mood.')),
      actions: (api) => [{ label: 'Leave rents as they are', onClick: () => { act({ type: 'skipRefRate' }, api); api.close(); } }, { label: 'Send the letters', primary: true, disabled: !rows.length, onClick: () => { act({ type: 'passOnRefRate' }, api); api.close(); } }],
    });
  }

  // ---------- menu, settings, help, summary ----------
  function menu() {
    overlay.open({
      title: 'Immo Mogul',
      body: () => h('div', { class: 'im-options' },
        h('button', { class: 'im-option', type: 'button', onClick: () => settingsDialog() }, h('div', { class: 'im-option-title' }, 'Settings'), h('div', { class: 'im-option-sub' }, 'Sound, volume, theme.')),
        h('button', { class: 'im-option', type: 'button', onClick: () => help() }, h('div', { class: 'im-option-title' }, 'Rules and help'), h('div', { class: 'im-option-sub' }, 'What is real, what is simplified, what is assumed.')),
        h('button', { class: 'im-option', type: 'button', onClick: () => summary() }, h('div', { class: 'im-option-title' }, 'Career summary'), h('div', { class: 'im-option-sub' }, 'Where you stand against the rivals.')),
        h('button', { class: 'im-option', type: 'button', onClick: () => { const blob = new Blob([ctrl.exportText()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `immo-mogul-save-${monthLabel(S().month).replace(' ', '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } }, h('div', { class: 'im-option-title' }, 'Export save'), h('div', { class: 'im-option-sub' }, 'Download the career as a file.')),
        h('button', { class: 'im-option', type: 'button', onClick: () => { overlay.close(); onNewGame(); } }, h('div', { class: 'im-option-title' }, 'New career'), h('div', { class: 'im-option-sub' }, 'Back to the start screen. The current save stays until you start another.')),
      ),
      actions: (api) => [{ label: 'Close', onClick: () => api.close() }],
    });
  }

  function settingsDialog() {
    overlay.open({
      title: 'Settings',
      body: (api) => h('div', {},
        h('div', { class: 'im-field' }, h('label', {}, 'Sound'), h('div', { class: 'im-btn-row' }, h('button', { class: `im-btn im-btn--small ${!sfx.muted ? 'im-btn--primary' : ''}`, type: 'button', onClick: () => { sfx.setMuted(false); onSettings({ muted: false }); sfx.play('coinIn'); api.rerender(); } }, 'On'), h('button', { class: `im-btn im-btn--small ${sfx.muted ? 'im-btn--primary' : ''}`, type: 'button', onClick: () => { sfx.setMuted(true); onSettings({ muted: true }); api.rerender(); } }, 'Off'))),
        h('div', { class: 'im-field' }, h('label', {}, `Volume ${Math.round(sfx.volume * 100)}%`), h('input', { class: 'im-range', type: 'range', min: 0, max: 1, step: 0.05, value: sfx.volume, onChange: (e) => { sfx.setVolume(Number(e.target.value)); onSettings({ volume: Number(e.target.value) }); sfx.play('turn'); api.rerender(); } })),
        h('div', { class: 'im-field' }, h('label', {}, 'Theme'), h('div', { class: 'im-btn-row' }, ...[['auto', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('button', { class: `im-btn im-btn--small ${settings.theme === v ? 'im-btn--primary' : ''}`, type: 'button', onClick: () => { onSettings({ theme: v }); api.rerender(); } }, l)))),
        h('p', { class: 'im-note' }, 'The map only moves when you click a building. Reduced-motion settings of your system are respected.')),
      actions: (api) => [{ label: 'Done', primary: true, onClick: () => api.close() }],
    });
  }

  function help() {
    const assumptions = rulesByStatus('assumption');
    overlay.open({
      title: 'Rules and help',
      wide: true,
      body: () => h('div', {},
        h('div', { class: 'im-section' }, 'What is real'),
        h('p', {}, 'The buildings, their addresses, years, storeys, flat sizes and room counts come from the Zurich building and dwelling register (Open Data Zürich, CC0). Rent and price levels per Quartier come from the city’s rent survey and condominium sales statistics. Bank rules follow the Swiss Bankers Association self-regulation and published bank practice; rent rules follow the Code of Obligations, the VMWG and the BWO reference rate; the gains tax follows the Zurich cantonal tariff.'),
        h('div', { class: 'im-section' }, 'What is simulated'),
        h('p', {}, 'Which flats come up for sale, their prices, sellers, tenants, condition and the future path of rates and prices. No real owner or tenant is depicted. Nothing here is financial or legal advice.'),
        h('div', { class: 'im-section' }, 'The rules that bite'),
        h('ul', { class: 'im-log' },
          h('li', {}, h('span', {}, 'Equity'), h('span', {}, '20 to 25% of the lending value, all of it hard equity here (no pension money for buy-to-let).')),
          h('li', {}, h('span', {}, 'Affordability'), h('span', {}, 'Interest at 5% on all loans plus amortisation plus 1% upkeep must stay under a third of salary plus 80% of rent. Checked every December.')),
          h('li', {}, h('span', {}, 'Amortisation'), h('span', {}, 'Down to two thirds of the lending value within 10 or 15 years.')),
          h('li', {}, h('span', {}, 'Reference rate'), h('span', {}, '+3% rent per quarter point up, −2.91% per quarter point down, plus 40% of inflation.')),
          h('li', {}, h('span', {}, 'Renovation'), h('span', {}, '50 to 70% of an overhaul is value-adding; the allowed rent increase follows the Federal Court formula.')),
          h('li', {}, h('span', {}, 'Initial rent'), h('span', {}, 'A jump over 10% above the previous rent, and above market, can be challenged within 30 days.')),
          h('li', {}, h('span', {}, 'Gains tax'), h('span', {}, '10% to 40% by bracket, +50% if sold within a year, +25% within two, down to −50% after twenty years.')),
          h('li', {}, h('span', {}, 'Costs'), h('span', {}, 'No transfer tax. Notary 1‰ plus VAT, land registry 1‰, mortgage note 2‰ of a new loan, broker 2% on a sale.'))),
        h('div', { class: 'im-section' }, `Assumptions (${assumptions.length}), marked in the rules table`),
        h('ul', { class: 'im-log' }, assumptions.map((r) => h('li', {}, h('span', {}, r.id), h('span', {}, r.source)))),
        h('div', { class: 'im-section' }, 'Credits'),
        h('p', { class: 'im-note' }, 'Statistik Stadt Zürich and Stadt Zürich Open Data (CC0); Bundesamt für Statistik (GWR); Amtliche Vermessung Stadt Zürich (footprints); Swiss National Bank and ZKB (rates, October 2026); BWO; Kanton Zürich. Map: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors. Fonts: Inter.')),
      actions: (api) => [{ label: 'Close', primary: true, onClick: () => api.close() }],
    });
  }

  function summary() {
    const s = S();
    const c = careerSummary(s, world);
    overlay.open({
      title: c.done ? `Career over: ${c.grade}` : 'Career so far',
      sub: s.over?.reason === 'insolvent' ? 'The bank had the last word.' : `${monthLabel(s.month)} · ${c.months} months in`,
      dismissible: !c.done,
      body: () => h('div', {},
        kv([
          ['Start', chf(c.startNetWorth)], ['Net worth now', chf(c.netWorth), 'total'], ['Multiple', `${c.multiple.toFixed(2)}×`], ['Yearly growth', pct(c.cagr, 1)],
          ['Property', chf(c.property)], ['Debt', chf(c.debt)], ['Units', String(c.units)], ['Rank among investors here', `${c.rank} of ${c.rivals.length + 1}`],
          ['Rent collected', chf(c.stats.rentCollected)], ['Interest paid', chf(c.stats.interestPaid)], ['Gains tax', chf(c.stats.gainsTax)], ['Forced sales', String(c.stats.forcedSales)],
          ['Milestones', `${c.milestones} of ${c.milestoneTotal}`],
        ]),
        h('p', { class: 'im-note', style: { marginTop: '12px' } }, c.done ? 'Start a new career from the menu, or keep looking at the map.' : 'Fifteen years in total. The number that matters is net worth.')),
      actions: (api) => [c.done ? { label: 'New career', onClick: () => { api.close(); onNewGame(); } } : null, { label: 'Close', primary: true, onClick: () => api.close() }],
    });
  }

  function yearEnd({ report }) {
    toasts.show({ text: `${report.year} closed: net worth ${chf(report.netWorth, { compact: true })} (${chf(report.change, { sign: true, compact: true })}), rent ${chf(report.rent, { compact: true })}, interest ${chf(report.interest, { compact: true })}. Rank ${report.rank} of 4.`, kind: report.change >= 0 ? 'good' : 'warn', ms: 7000 });
  }

  const table = { offer, negotiation, financing, rent, applicants, renovate, renovateBuilding, sell, loan: loanDialog, refRate, menu, settings: settingsDialog, help, summary, yearEnd };
  return {
    open(name, args = {}) {
      const fn = table[name];
      if (!fn) throw new Error(`no dialog ${name}`);
      return fn(args);
    },
  };
}
