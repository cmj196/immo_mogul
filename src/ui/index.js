// Mounts the HUD: top bar, left panel, right sheet, legend, toasts, dialogs. Subscribes to the
// controller and re-renders on every change. Opens dialogs for things that need the player.

import { h } from './dom.js';
import { createTopbar } from './topbar.js';
import { createPanel } from './panel.js';
import { createSheet } from './sheet.js';
import { createDialogs } from './dialogs.js';
import { RIVALS } from '../data/rivals.js';

export function mountUI({ root, world, ctrl, map, sfx, overlay, toasts, settings, onSettings, onNewGame }) {
  const ui = {
    selection: null,
    select(buildingId, { focus = false } = {}) {
      ui.selection = buildingId;
      sheet.update(ctrl.state, buildingId);
      panel.update(ctrl.state);
      map.setSelected(buildingId);
      if (focus && buildingId) map.focus(buildingId);
    },
    openDialog(name, args) { return dialogs.open(name, args); },
  };

  const dialogs = createDialogs({ world, ctrl, ui, overlay, toasts, sfx, settings, onSettings, onNewGame });
  const topbar = createTopbar({
    world,
    onEndMonth: () => {
      const r = ctrl.dispatch({ type: 'endMonth' });
      if (r.error) { toasts.show({ text: r.error, kind: 'warn' }); openWhatNeedsMe(); return; }
      sfx.play('turn');
    },
    onSkip: () => { if (ctrl.hasDecision()) { openWhatNeedsMe(); return; } ctrl.skip({ maxMonths: 24 }); },
    onMenu: () => dialogs.open('menu'),
  });
  const panel = createPanel({ world, ctrl, ui });
  const sheet = createSheet({ world, ctrl, ui });
  const legend = h('div', { class: 'im-legend', 'aria-hidden': 'true' },
    h('span', { style: { '--c': map.colors.listing } }, 'For sale'),
    h('span', { style: { '--c': map.colors.player } }, 'Yours'),
    ...Object.values(RIVALS).map((r) => h('span', { style: { '--c': r.color } }, r.short)));
  root.append(topbar.el, panel.el, sheet.el, legend);

  function openWhatNeedsMe() {
    const s = ctrl.state;
    if (!s || overlay.isOpen) return false;
    if (s.negotiation) { dialogs.open('negotiation'); return true; }
    if (s.purchase) { dialogs.open('financing'); return true; }
    const review = s.pending.find((p) => p.kind === 'bankReview');
    if (review) { dialogs.open('loan', { loanId: review.loanId }); return true; }
    const roll = s.pending.find((p) => p.kind === 'rollover');
    if (roll) { dialogs.open('loan', { loanId: roll.loanId }); return true; }
    const ref = s.pending.find((p) => p.kind === 'refRateUp');
    if (ref) { dialogs.open('refRate'); return true; }
    const apps = s.pending.find((p) => p.kind === 'applicants');
    if (apps && s.units[apps.unitId]?.applicants?.length) { ui.select(s.units[apps.unitId].buildingId); dialogs.open('applicants', { unitId: apps.unitId }); return true; }
    return false;
  }

  function endLabel(s) {
    if (s.negotiation) return 'Answer the offer';
    if (s.purchase) return 'Finish the purchase';
    return 'End month';
  }

  function render(s, events, meta) {
    if (!s) return;
    if (ui.selection && !world.byId.get(ui.selection)) ui.selection = null;
    topbar.update(s, { busy: ctrl.busy, canEnd: !s.negotiation && !s.purchase, endLabel: endLabel(s) });
    panel.update(s);
    sheet.update(s, ui.selection);
    map.update(s, ui.selection);
    if (meta.reason === 'skipChunk') return;
    // toasts for things worth a glance
    const notable = (events || []).filter((e) => ['milestone', 'sold', 'bankWarn', 'bankFail', 'forcedSale', 'moveOut', 'notice', 'renoDone', 'refRate', 'tenantClaims', 'purchaseLapsed', 'overdraft', 'rolled', 'listingGone'].includes(e.type) && e.text);
    const shown = notable.filter((e) => e.type !== 'listingGone' || Object.values(s.lots).length > 0 || Math.random() < 0.34).slice(-3);
    for (const e of shown) toasts.show({ text: e.text, kind: ['milestone', 'sold', 'renoDone'].includes(e.type) ? 'good' : ['bankWarn', 'bankFail', 'forcedSale', 'overdraft', 'purchaseLapsed'].includes(e.type) ? 'warn' : 'info', ms: 5000 });
    const ye = (events || []).find((e) => e.type === 'yearEnd');
    if (ye) dialogs.open('yearEnd', { report: ye.report });
    if (s.over && meta.reason !== 'resume' && meta.reason !== 'new' && (events || []).some((e) => e.type === 'over')) { setTimeout(() => dialogs.open('summary'), 300); return; }
    if (['endMonth', 'skipEnd', 'new', 'resume'].includes(meta.reason)) {
      if (meta.reason === 'new') panel.setTab('deals');
      setTimeout(openWhatNeedsMe, 50);
    }
  }

  ctrl.subscribe(render);
  return { ui, render, openWhatNeedsMe, panel, sheet, topbar };
}
