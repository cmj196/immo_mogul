// Start screen: resume or new career (name, difficulty, seed).

import { h, chf } from './dom.js';
import { DIFFICULTIES } from '../engine/state.js';
import { monthLabel } from '../engine/clock.js';

export function renderSetup({ root, save, onNew, onResume, onImport, worldInfo }) {
  let difficulty = 'normal';
  const name = h('input', { class: 'im-input', value: 'You', maxlength: 24, 'aria-label': 'Your name' });
  const seed = h('input', { class: 'im-input', value: String(Math.floor(Math.random() * 1e6)), maxlength: 32, 'aria-label': 'Seed' });
  const options = h('div', { class: 'im-options' });
  function renderOptions() {
    options.replaceChildren(...Object.values(DIFFICULTIES).map((d) => h('button', {
      class: 'im-option', type: 'button', 'aria-pressed': String(difficulty === d.id),
      onClick: () => { difficulty = d.id; renderOptions(); },
    },
    h('div', { class: 'im-option-title' }, h('span', {}, d.label), h('span', {}, `${chf(d.cash, { compact: true })} · salary ${chf(d.salaryYear, { compact: true })}`)),
    h('div', { class: 'im-option-sub' }, d.blurb))));
  }
  renderOptions();
  const err = h('div', { class: 'im-error' });
  const card = h('div', { class: 'im-setup-card' },
    h('h1', {}, 'Immo Mogul'),
    h('p', { class: 'lede' }, 'Fifteen years as a property investor in Kreis 4 and 5. Real buildings, Swiss rules, your calls.'),
    save ? h('div', { style: { marginBottom: '16px' } },
      h('div', { class: 'im-section' }, 'Continue'),
      h('button', { class: 'im-btn im-btn--primary', type: 'button', onClick: onResume }, `Resume ${save.player?.name || ''} · ${monthLabel(save.month)} · net worth ${chf(save.history?.[save.history.length - 1]?.netWorth ?? 0, { compact: true })}`),
    ) : null,
    h('div', { class: 'im-section' }, 'New career'),
    h('div', { class: 'im-grid2' },
      h('div', { class: 'im-field' }, h('label', {}, 'Name'), name),
      h('div', { class: 'im-field' }, h('label', {}, 'Seed (same seed, same city)'), seed)),
    options,
    err,
    h('div', { class: 'im-btn-row', style: { marginTop: '16px' } },
      h('button', { class: 'im-btn im-btn--primary', type: 'button', onClick: () => {
        try { onNew({ name: name.value.trim() || 'You', seed: seed.value.trim() || 'zurich', difficulty }); } catch (e) { err.textContent = e.message; }
      } }, save ? 'Start a new career (replaces the save)' : 'Start'),
      h('button', { class: 'im-btn', type: 'button', onClick: onImport }, 'Import a save'),
    ),
    h('p', { class: 'im-fine' }, `Buildings and flats come from the Zurich building register (${worldInfo.buildings} buildings, snapshot ${worldInfo.dataVersion}). Prices, rents, sellers and tenants are simulated. Nothing here is financial or legal advice.`),
  );
  const wrap = h('div', { class: 'im-setup' }, card);
  root.append(wrap);
  return { el: wrap, remove: () => wrap.remove() };
}
