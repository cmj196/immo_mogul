// Left panel: Deals, Portfolio, Bank, Report.

import { h, clear, chf, pct, bps, kv } from './dom.js';
import { buildingOf, quartierOf } from '../engine/world.js';
import { listingRentMonth, listingArea, lotValue, lotRentMonth, lotMarketRentMonth, unitOf, flatOfUnit, marketRent } from '../engine/valuation.js';
import { loansOfLot, totalDebt, propertyValue, netWorth, rentMonth } from '../engine/state.js';
import { loanRateBps, bankOf, reviewHousehold } from '../engine/bank.js';
import { BANKS, PRODUCTS } from '../data/banks.js';
import { monthLabel } from '../engine/clock.js';
import { marketSummary } from '../engine/macro.js';
import { rivalSummary } from '../engine/rivals.js';
import { MILESTONES } from '../engine/report.js';
import { netWorthChart } from './chart.js';
import { RULES } from '../data/rules.js';

const TABS = [['deals', 'Deals'], ['portfolio', 'Portfolio'], ['bank', 'Bank'], ['report', 'Report']];

export function createPanel({ world, ctrl, ui }) {
  let tab = 'deals';
  const tabs = h('div', { class: 'im-tabs', role: 'tablist' });
  const body = h('div', { class: 'im-panel-body' });
  const foot = h('div', { class: 'im-panel-foot' });
  const el = h('aside', { class: 'im-panel' }, tabs, body, foot);
  let state = null;

  function badgeFor(id, s) {
    if (id === 'deals') return Object.values(s.listings).filter((l) => !l.reserved && l.created === s.month).length || 0;
    if (id === 'portfolio') return s.pending.filter((p) => p.kind === 'applicants').length + Object.values(s.units).filter((u) => u.owner === 'player' && !u.lease && !u.project && !u.askRent).length;
    if (id === 'bank') return s.pending.filter((p) => ['rollover', 'bankReview'].includes(p.kind)).length;
    return 0;
  }

  function renderTabs() {
    clear(tabs);
    for (const [id, label] of TABS) {
      const n = state ? badgeFor(id, state) : 0;
      tabs.append(h('button', { class: 'im-tab', role: 'tab', 'aria-selected': String(tab === id), type: 'button', onClick: () => { tab = id; render(); } }, label, n ? h('span', { class: 'im-badge' }, n) : null));
    }
  }

  function dealsTab(s) {
    const out = [];
    const listings = Object.values(s.listings).sort((a, b) => b.created - a.created || a.ask - b.ask);
    if (s.purchase) {
      const l = s.listings[s.purchase.listingId];
      out.push(h('div', { class: 'im-section' }, 'Deal agreed, financing open'));
      out.push(card(l, s, { tag: 'Agreed', tagClass: 'im-chip--red', extra: `at ${chf(s.purchase.price)} · close by end of ${monthLabel(s.purchase.deadline)}` }));
    }
    const fresh = listings.filter((l) => !l.reserved && l.created === s.month);
    const older = listings.filter((l) => !l.reserved && l.created !== s.month);
    if (fresh.length) out.push(h('div', { class: 'im-section' }, 'New this month'));
    for (const l of fresh) out.push(card(l, s, { tag: 'New', tagClass: 'im-chip--blue' }));
    if (older.length) out.push(h('div', { class: 'im-section' }, 'Still on the market'));
    for (const l of older) out.push(card(l, s, {}));
    if (!listings.length) out.push(h('p', { class: 'im-empty' }, 'Nothing on the market right now. End the month.'));
    return out;
  }

  function card(l, s, { tag = null, tagClass = '', extra = null }) {
    const b = buildingOf(world, l.buildingId);
    const rent = listingRentMonth(l);
    const area = listingArea(world, l);
    const yieldPct = rent > 0 ? (rent * 12) / l.ask : 0;
    const vacant = l.units.filter((u) => !u.lease).length;
    return h('button', { class: 'im-card', type: 'button', 'aria-current': String(ui.selection === l.buildingId), onClick: () => ui.select(l.buildingId, { focus: true }) },
      h('div', { class: 'im-card-title' }, h('span', {}, l.title), tag ? h('span', { class: `im-chip ${tagClass}` }, tag) : null),
      h('div', { class: 'im-card-sub' }, `${quartierOf(world, b)}, Kreis ${b.kreis} · built ${b.year || '?'} · ${area} m² · ${l.seller.label}`),
      h('div', { class: 'im-card-row' }, h('b', {}, chf(l.ask)), h('span', {}, `${chf(Math.round(l.ask / area))}/m²`)),
      h('div', { class: 'im-card-row' }, h('span', {}, rent ? `Rent ${chf(rent)}/mo · gross ${pct(yieldPct)}` : 'Empty'), h('span', { class: 'im-note' }, vacant && l.units.length > 1 ? `${vacant} empty · ` : '', `expires ${monthLabel(l.expires)}`)),
      extra ? h('div', { class: 'im-card-row' }, h('span', { class: 'im-note' }, extra)) : null,
    );
  }

  function portfolioTab(s) {
    const lots = Object.values(s.lots);
    if (!lots.length) return [h('p', { class: 'im-empty' }, 'You own nothing yet. Pick a listing on the Deals tab and make an offer.')];
    const out = [];
    const value = propertyValue(s, world);
    const debt = totalDebt(s);
    out.push(kv([
      ['Property value', chf(value)], ['Mortgages', chf(debt)], ['Equity in property', chf(value - debt), 'total'],
      ['Rent per month', chf(rentMonth(s))], ['Market rent if all re-let', chf(lots.reduce((a, l) => a + lotMarketRentMonth(s, world, l.id), 0))],
    ]));
    out.push(h('div', { class: 'im-section' }, 'Your lots'));
    for (const lot of lots.sort((a, b) => a.bought.month - b.bought.month)) {
      const b = buildingOf(world, lot.buildingId);
      const v = lotValue(s, world, lot.id);
      const d = loansOfLot(s, lot.id).reduce((a, l) => a + l.balance, 0);
      const empty = lot.unitIds.filter((id) => !unitOf(s, id).lease).length;
      const works = lot.unitIds.filter((id) => unitOf(s, id).project).length + (lot.project ? 1 : 0);
      const needs = lot.unitIds.filter((id) => { const u = unitOf(s, id); return !u.lease && !u.project && !u.askRent; }).length;
      const apps = lot.unitIds.filter((id) => unitOf(s, id).applicants?.length).length;
      out.push(h('button', { class: 'im-card', type: 'button', 'aria-current': String(ui.selection === lot.buildingId), onClick: () => ui.select(lot.buildingId, { focus: true }) },
        h('div', { class: 'im-card-title' }, h('span', {}, lot.title), lot.forSale ? h('span', { class: 'im-chip im-chip--warn' }, 'For sale') : apps ? h('span', { class: 'im-chip im-chip--red' }, `${apps} applicant${apps > 1 ? 's' : ''}`) : needs ? h('span', { class: 'im-chip im-chip--warn' }, 'Set a rent') : works ? h('span', { class: 'im-chip' }, 'Works') : empty ? h('span', { class: 'im-chip' }, `${empty} empty`) : null),
        h('div', { class: 'im-card-sub' }, `${quartierOf(world, b)} · bought ${monthLabel(lot.bought.month)} at ${chf(lot.bought.price, { compact: true })}`),
        h('div', { class: 'im-card-row' }, h('span', {}, `Value ${chf(v, { compact: true })}`), h('span', { class: v - lot.bought.price >= 0 ? 'up' : 'down' }, chf(v - lot.bought.price - lot.bought.costs, { sign: true, compact: true }))),
        h('div', { class: 'im-card-row' }, h('span', {}, `Rent ${chf(lotRentMonth(s, lot.id))}/mo`), h('span', {}, d ? `Loan ${chf(d, { compact: true })}` : 'No loan')),
      ));
    }
    return out;
  }

  function bankTab(s) {
    const out = [];
    const loans = Object.values(s.loans);
    const m = marketSummary(s);
    out.push(h('div', { class: 'im-section' }, 'Rates today'));
    out.push(kv([
      ['SNB policy rate', bps(m.policy)], ['SARON mortgage (before spread)', bps(m.saronMortgage)],
      ['2-year fixed', bps(m.curve[2])], ['5-year fixed', bps(m.curve[5])], ['10-year fixed', bps(m.curve[10])],
      ['Reference rate (rents)', bps(m.ref)], ['Inflation', bps(m.cpi)],
    ]));
    out.push(h('div', { class: 'im-section' }, 'Your mortgages'));
    if (!loans.length) out.push(h('p', { class: 'im-empty' }, 'No mortgage yet.'));
    for (const loan of loans) {
      const lot = s.lots[loan.lotId];
      const pend = s.pending.find((p) => p.loanId === loan.id);
      const rate = loanRateBps(s, loan);
      out.push(h('button', { class: 'im-card', type: 'button', onClick: () => ui.openDialog('loan', { loanId: loan.id }) },
        h('div', { class: 'im-card-title' }, h('span', {}, `${loan.bankName} · ${PRODUCTS[loan.product].label}`), pend ? h('span', { class: 'im-chip im-chip--red' }, pend.kind === 'rollover' ? 'Rate reset' : 'Review') : loan.warnings ? h('span', { class: 'im-chip im-chip--warn' }, 'Warning') : null),
        h('div', { class: 'im-card-sub' }, lot ? lot.title : ''),
        h('div', { class: 'im-card-row' }, h('b', {}, chf(loan.balance)), h('span', {}, `${bps(rate)} · ${chf(Math.round((loan.balance * rate) / 120000))}/mo`)),
        h('div', { class: 'im-card-row' }, h('span', { class: 'im-note' }, loan.fixedUntil !== null ? `fixed until ${monthLabel(loan.fixedUntil)}` : 'floating'), h('span', { class: 'im-note' }, loan.amortMonth ? `amortising ${chf(loan.amortMonth)}/mo` : 'no amortisation due')),
      ));
    }
    if (loans.length) {
      out.push(h('div', { class: 'im-section' }, 'Household test today'));
      const rows = reviewHousehold(s, world);
      const seen = new Set();
      for (const r of rows) {
        if (seen.has(r.bankId)) continue;
        seen.add(r.bankId);
        out.push(kv([[`${bankOf(r.bankId).short}: costs / income`, `${pct(r.ratio, 0)} of a ${pct(r.cap, 0)} cap`, r.verdict === 'ok' ? '' : 'down']]));
      }
      out.push(h('p', { class: 'im-note', style: { marginTop: '8px' } }, `Banks test every loan at ${bps(500, 0)} interest plus amortisation and 1% upkeep against your salary and ${RULES.rentCountedPct.value}% of rent. Each December they check again.`));
    }
    out.push(h('div', { class: 'im-section' }, 'The three banks'));
    for (const b of Object.values(BANKS)) {
      out.push(h('div', { class: 'im-unit' }, h('div', { class: 'im-unit-head' }, h('span', {}, b.name), h('span', { class: 'im-chip' }, `${b.minEquityPct}% equity`)), h('div', { class: 'im-unit-sub' }, `${b.blurb} Amortise in ${b.amortYears} years, cap ${b.affordabilityCapPct}% of income.`)));
    }
    return out;
  }

  function reportTab(s) {
    const out = [];
    out.push(h('div', { class: 'im-section' }, 'Net worth'));
    out.push(netWorthChart(s.history));
    const first = s.history[0];
    const nw = netWorth(s, world);
    out.push(kv([
      ['Start', chf(first.netWorth)], ['Now', chf(nw)], ['Change', chf(nw - first.netWorth, { sign: true }), nw >= first.netWorth ? 'up' : 'down'],
      ['Rent collected', chf(s.stats.rentCollected)], ['Interest paid', chf(s.stats.interestPaid)], ['Gains tax paid', chf(s.stats.gainsTax)], ['Income tax paid', chf(s.stats.incomeTax)],
      ['Deals won / offers', `${s.stats.dealsWon} / ${s.stats.offersMade}`], ['Renovations', String(s.stats.renovations)],
    ]));
    out.push(h('div', { class: 'im-section' }, 'Rivals in Kreis 4 and 5'));
    const rows = rivalSummary(s, world);
    const table = h('table', { class: 'im-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Investor'), h('th', {}, 'Units'), h('th', {}, 'Property'), h('th', {}, 'Equity'))));
    const tb = h('tbody');
    const mine = { name: s.player.name, units: Object.values(s.units).filter((u) => u.owner === 'player').length, value: propertyValue(s, world), equity: propertyValue(s, world) - totalDebt(s) };
    const all = [{ ...mine, me: true }, ...rows.map((r) => ({ name: r.short, units: r.units, value: r.value, equity: r.value - r.debt }))].sort((a, b) => b.equity - a.equity);
    for (const r of all) tb.append(h('tr', { style: r.me ? { fontWeight: '700' } : null }, h('td', {}, r.name), h('td', {}, r.units), h('td', {}, chf(r.value, { compact: true })), h('td', {}, chf(r.equity, { compact: true }))));
    table.append(tb);
    out.push(table);
    out.push(h('div', { class: 'im-section' }, `Milestones ${Object.keys(s.milestones).length} / ${MILESTONES.length}`));
    out.push(h('ul', { class: 'im-log' }, MILESTONES.map((m) => h('li', {}, h('span', {}, s.milestones[m.id] !== undefined ? monthLabel(s.milestones[m.id]) : '·'), h('span', { style: s.milestones[m.id] !== undefined ? null : { color: 'var(--im-muted)' } }, m.label)))));
    out.push(h('div', { class: 'im-section' }, 'Log'));
    out.push(h('ul', { class: 'im-log' }, s.log.slice(-40).reverse().map((e) => h('li', {}, h('span', {}, monthLabel(e.month)), h('span', {}, e.text)))));
    return out;
  }

  function render() {
    renderTabs();
    clear(body);
    clear(foot);
    if (!state) return;
    const s = state;
    const parts = tab === 'deals' ? dealsTab(s) : tab === 'portfolio' ? portfolioTab(s) : tab === 'bank' ? bankTab(s) : reportTab(s);
    body.append(...parts);
    if (tab === 'deals') foot.append(h('span', { class: 'im-note' }, `${Object.keys(s.listings).length} listing${Object.keys(s.listings).length === 1 ? '' : 's'} · rivals move between months`));
    if (tab === 'report') foot.append(h('button', { class: 'im-btn im-btn--small', type: 'button', onClick: () => ui.openDialog('summary') }, 'Career summary'));
  }

  return {
    el,
    update(s) { state = s; render(); },
    setTab(t) { tab = t; render(); },
    get tab() { return tab; },
  };
}
