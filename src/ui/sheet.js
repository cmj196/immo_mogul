// Right sheet: the selected building, as a listing, as your property, or as background.

import { h, clear, chf, pct, bps, kv } from './dom.js';
import { buildingOf, quartierOf, flatLabel, condoPerM2, newLetPerM2 } from '../engine/world.js';
import { listingRentMonth, listingArea, lotValue, lotRentMonth, unitOf, flatOfUnit, marketRent, runningCostMonth, condoValue } from '../engine/valuation.js';
import { loansOfLot } from '../engine/state.js';
import { loanRateBps } from '../engine/bank.js';
import { saleBreakdown } from '../engine/tax.js';
import { monthLabel } from '../engine/clock.js';
import { bandOfAge, BAND_LABEL } from '../engine/lease.js';
import { PRODUCTS } from '../data/banks.js';
import { RIVALS } from '../data/rivals.js';

export function createSheet({ world, ctrl, ui }) {
  const head = h('div', { class: 'im-sheet-head' });
  const body = h('div', { class: 'im-sheet-body' });
  const foot = h('div', { class: 'im-sheet-foot' });
  const el = h('section', { class: 'im-sheet', 'aria-label': 'Details' }, head, body, foot);

  function setHead(title, sub, { mark = null } = {}) {
    clear(head);
    head.append(h('div', { style: { flex: 1 } }, h('h2', {}, title), sub ? h('p', {}, sub) : null, mark ? h('div', { class: 'im-mark', style: { marginTop: '4px' } }, mark) : null),
      h('button', { class: 'im-btn im-btn--ghost im-btn--icon', type: 'button', 'aria-label': 'Close', onClick: () => ui.select(null) }, '✕'));
  }

  function facts(b) {
    return kv([
      ['Address', `${b.street} ${b.no}, ${b.plz} Zürich`],
      ['Quartier', `${quartierOf(world, b)}, Kreis ${b.kreis}`],
      ['Built', b.year ? String(b.year) : 'unknown'],
      ['Storeys / flats', `${b.storeys || '?'} / ${b.flats.length}`],
      b.heritage ? ['Heritage', 'listed'] : null,
    ]);
  }

  function conditionBar(c) {
    return h('div', { class: `im-bar ${c < 50 ? 'low' : ''}`, title: `Condition ${c}/100` }, h('i', { style: { width: `${c}%` } }));
  }

  function renderEmpty() {
    setHead('Kreis 4 and 5', 'Click a building on the map or a card on the left.');
    clear(body);
    body.append(h('p', { class: 'im-note' }, 'Blue buildings are on the market. Red ones are yours. Grey and brown ones belong to the rivals.'),
      h('div', { class: 'im-section' }, 'How a month goes'),
      h('ul', { class: 'im-log' },
        h('li', {}, h('span', {}, 'Find'), h('span', {}, 'Three to five listings a month. Rivals take good ones between months.')),
        h('li', {}, h('span', {}, 'Offer'), h('span', {}, 'The seller counters. Each side has three counters.')),
        h('li', {}, h('span', {}, 'Finance'), h('span', {}, 'A bank lends up to 75 or 80% if the 5% affordability test passes.')),
        h('li', {}, h('span', {}, 'Let'), h('span', {}, 'Set a rent for empty flats. Jumps over 10% above the old rent risk a challenge.')),
        h('li', {}, h('span', {}, 'Hold or sell'), h('span', {}, 'Gains tax falls the longer you hold. Under two years it is punitive.'))),
    );
    clear(foot);
    foot.append(h('button', { class: 'im-btn', type: 'button', onClick: () => ui.openDialog('help') }, 'Rules and help'));
  }

  function renderListing(s, l) {
    const b = buildingOf(world, l.buildingId);
    const rent = listingRentMonth(l);
    const area = listingArea(world, l);
    const perM2 = condoPerM2(world, b);
    setHead(l.title, `${l.seller.label}. ${l.seller.line}`, { mark: 'Building facts from the register · price, seller and tenants simulated' });
    clear(body);
    body.append(
      kv([
        ['Asking price', chf(l.ask), 'total'],
        ['Per m²', `${chf(Math.round(l.ask / area))} (Quartier median for condos ${chf(Math.round(perM2))})`],
        rent ? ['Rent roll', `${chf(rent)}/mo · gross yield ${pct((rent * 12) / l.ask)}`] : ['Rent roll', 'empty'],
        ['Market rent if re-let', `${chf(l.units.reduce((a, u) => a + marketRent(s, world, b, b.flats[u.flatIdx], u.condition), 0))}/mo`],
        ['Listed', `${monthLabel(l.created)} · expires ${monthLabel(l.expires)}`],
      ]),
      h('div', { class: 'im-section' }, 'Building'),
      facts(b),
      h('div', { class: 'im-section' }, l.kind === 'condo' ? 'The flat' : `The ${l.units.length} flats`),
      ...l.units.map((u) => {
        const f = b.flats[u.flatIdx];
        const m = marketRent(s, world, b, f, u.condition);
        return h('div', { class: 'im-unit' },
          h('div', { class: 'im-unit-head' }, h('span', {}, flatLabel(f)), h('span', {}, u.lease ? chf(u.lease.rent) + '/mo' : 'empty')),
          h('div', { class: 'im-unit-sub' }, u.lease ? `${u.lease.tenant.name}, ${BAND_LABEL[bandOfAge(s.month - u.lease.since)]} · market ${chf(m)}` : `market rent about ${chf(m)}`),
          conditionBar(u.condition));
      }),
    );
    clear(foot);
    const reserved = l.reserved;
    const inNeg = s.negotiation && s.negotiation.listingId === l.id;
    if (s.purchase && s.purchase.listingId === l.id) {
      foot.append(h('button', { class: 'im-btn im-btn--primary', type: 'button', onClick: () => ui.openDialog('financing') }, 'Arrange financing'));
    } else if (inNeg) {
      foot.append(h('button', { class: 'im-btn im-btn--primary', type: 'button', onClick: () => ui.openDialog('negotiation') }, 'Back to the negotiation'));
    } else if (!reserved) {
      const blocked = ctrl.check({ type: 'makeOffer', listingId: l.id, price: Math.round(l.ask * 0.9) });
      foot.append(h('button', { class: 'im-btn im-btn--primary', type: 'button', disabled: Boolean(blocked) || null, title: blocked || null, onClick: () => ui.openDialog('offer', { listingId: l.id }) }, 'Make an offer'));
      if (blocked) foot.append(h('span', { class: 'im-note' }, blocked));
    }
  }

  function renderLot(s, lot) {
    const b = buildingOf(world, lot.buildingId);
    const value = lotValue(s, world, lot.id);
    const loans = loansOfLot(s, lot.id);
    const debt = loans.reduce((a, l) => a + l.balance, 0);
    const bd = saleBreakdown(s, world, lot.id, value);
    setHead(lot.title, `Yours since ${monthLabel(lot.bought.month)} · bought at ${chf(lot.bought.price)}`, { mark: 'Building facts from the register · value estimated from city statistics' });
    clear(body);
    body.append(
      kv([
        ['Value today', chf(value), 'total'],
        ['Mortgage', debt ? `${chf(debt)} (${pct(debt / value, 0)} of value)` : 'none'],
        ['Rent', `${chf(lotRentMonth(s, lot.id))}/mo`],
        ['Running costs', `${chf(runningCostMonth(s, world, lot.id))}/mo${lot.energy ? ' (energy works done)' : ''}`],
        ['Interest', `${chf(loans.reduce((a, l) => a + Math.round((l.balance * loanRateBps(s, l)) / 120000), 0))}/mo`],
        ['If sold at value', `${chf(bd.net)} net after ${chf(bd.tax)} gains tax (${bd.adjustmentPct > 0 ? '+' : ''}${bd.adjustmentPct}% for ${bd.fullYears}y held)`],
        lot.forSale ? ['On the market at', chf(lot.forSale.ask)] : null,
        lot.project ? ['Works', `${lot.project.pkg} until ${monthLabel(lot.project.ends)}`] : null,
      ]),
      h('div', { class: 'im-section' }, 'Building'),
      facts(b),
      h('div', { class: 'im-section' }, lot.kind === 'condo' ? 'The flat' : `The ${lot.unitIds.length} flats`),
      ...lot.unitIds.map((id) => unitCard(s, unitOf(s, id), b)),
    );
    clear(foot);
    if (lot.kind === 'building' && !lot.energy) foot.append(h('button', { class: 'im-btn', type: 'button', onClick: () => ui.openDialog('renovateBuilding', { lotId: lot.id }) }, 'Facade and energy'));
    if (!lot.forSale) foot.append(h('button', { class: 'im-btn', type: 'button', onClick: () => ui.openDialog('sell', { lotId: lot.id }) }, 'Sell'));
    else foot.append(h('button', { class: 'im-btn', type: 'button', onClick: () => ctrl.dispatch({ type: 'cancelSale', lotId: lot.id }) }, 'Withdraw from sale'));
    for (const loan of loans) foot.append(h('button', { class: 'im-btn', type: 'button', onClick: () => ui.openDialog('loan', { loanId: loan.id }) }, `${loan.bankName} loan`));
  }

  function unitCard(s, u, b) {
    const f = b.flats[u.flatIdx];
    const m = marketRent(s, world, b, f, u.condition);
    const lines = [];
    let status;
    if (u.project) status = `${u.project.pkg} works until ${monthLabel(u.project.ends)}`;
    else if (u.lease) {
      status = `${u.lease.tenant.name} · ${BAND_LABEL[bandOfAge(s.month - u.lease.since)]}`;
      if (u.lease.notice !== null) lines.push(h('span', { class: 'im-chip im-chip--warn' }, `leaves ${monthLabel(u.lease.notice)}`));
      if (u.lease.pendingRent) lines.push(h('span', { class: 'im-chip im-chip--up' }, `${chf(u.lease.pendingRent.rent)} from ${monthLabel(u.lease.pendingRent.from)}`));
      if (u.lease.arrears) lines.push(h('span', { class: 'im-chip im-chip--warn' }, `${chf(u.lease.arrears)} arrears`));
    } else if (u.applicants?.length) status = `${u.applicants.length} applicant${u.applicants.length > 1 ? 's' : ''} at ${chf(u.askRent)}`;
    else if (u.askRent) status = `advertised at ${chf(u.askRent)}`;
    else status = 'empty, no rent set';
    const actions = h('div', { class: 'im-btn-row', style: { marginTop: '8px' } });
    if (!u.lease && !u.project) {
      if (u.applicants?.length) actions.append(h('button', { class: 'im-btn im-btn--primary im-btn--small', type: 'button', onClick: () => ui.openDialog('applicants', { unitId: u.id }) }, 'Pick a tenant'));
      actions.append(h('button', { class: `im-btn im-btn--small ${u.askRent ? '' : 'im-btn--primary'}`, type: 'button', onClick: () => ui.openDialog('rent', { unitId: u.id }) }, u.askRent ? 'Change rent' : 'Set rent'));
    }
    if (!u.project) actions.append(h('button', { class: 'im-btn im-btn--small', type: 'button', onClick: () => ui.openDialog('renovate', { unitId: u.id }) }, 'Renovate'));
    return h('div', { class: 'im-unit' },
      h('div', { class: 'im-unit-head' }, h('span', {}, flatLabel(f)), h('span', {}, u.lease ? `${chf(u.lease.rent)}/mo` : `market ${chf(m)}`)),
      h('div', { class: 'im-unit-sub' }, status, u.lease ? ` · market ${chf(m)}` : u.prevRent ? ` · last rent ${chf(u.prevRent)}` : ''),
      lines.length ? h('div', { style: { marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...lines) : null,
      u.lease ? h('div', { class: 'im-note', style: { marginTop: '4px' } }, u.lease.tenant.story) : null,
      conditionBar(u.condition),
      actions);
  }

  function renderBackground(s, b) {
    const rivalLot = Object.keys(RIVALS).map((rid) => Object.values(s.rivals[rid].lots).find((l) => l.buildingId === b.id) && rid).find(Boolean);
    setHead(`${b.street} ${b.no}`, rivalLot ? `Owned by ${RIVALS[rivalLot].name}.` : 'Not on the market.', { mark: 'Building facts from the register' });
    clear(body);
    body.append(facts(b),
      h('div', { class: 'im-section' }, 'Flats in the register'),
      h('ul', { class: 'im-log' }, b.flats.map((f) => h('li', {}, h('span', {}, f.floor === 0 ? 'ground' : `floor ${f.floor}`), h('span', {}, `${f.rooms} rooms, ${f.area} m² · market rent about ${chf(marketRent(s, world, b, f, 70))}`)))),
      h('p', { class: 'im-note', style: { marginTop: '12px' } }, `Condo prices in ${quartierOf(world, b)} run about ${chf(Math.round(condoPerM2(world, b)))} per m²; new lets about ${newLetPerM2(world, b, 3).toFixed(0)} CHF per m² a month.`));
    clear(foot);
  }

  return {
    el,
    update(s, selection) {
      if (!s || !selection) { renderEmpty(); return; }
      const b = world.byId.get(selection);
      if (!b) { renderEmpty(); return; }
      const lot = Object.values(s.lots).find((l) => l.buildingId === selection);
      const listing = Object.values(s.listings).find((l) => l.buildingId === selection);
      if (lot) renderLot(s, lot);
      else if (listing) renderListing(s, listing);
      else renderBackground(s, b);
    },
  };
}
