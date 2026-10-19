// Top bar: brand, date, the four numbers, End month, Skip, menu.

import { h, clear, chf } from './dom.js';
import { monthLabel, CAREER_MONTHS } from '../engine/clock.js';
import { netWorth, propertyValue, totalDebt, rentMonth } from '../engine/state.js';

export function createTopbar({ world, onEndMonth, onSkip, onMenu }) {
  const stats = h('div', { class: 'im-stats' });
  const date = h('div', { class: 'im-date' });
  const endBtn = h('button', { class: 'im-btn im-btn--primary', type: 'button', onClick: onEndMonth }, 'End month');
  const skipBtn = h('button', { class: 'im-btn', type: 'button', title: 'Skip quiet months until something needs you', onClick: onSkip }, 'Skip ahead');
  const menuBtn = h('button', { class: 'im-btn im-btn--ghost im-btn--icon', type: 'button', 'aria-label': 'Menu', onClick: onMenu }, '☰');
  const el = h('header', { class: 'im-topbar' }, h('div', { class: 'im-brand' }, 'Immo Mogul'), date, stats, endBtn, skipBtn, menuBtn);

  let lastNw = null;
  function stat(label, value, cls = '') {
    return h('div', { class: 'im-stat' }, h('small', {}, label), h('b', { class: cls }, value));
  }

  function update(state, { busy = false, canEnd = true, endLabel = null } = {}) {
    clear(stats);
    const nw = netWorth(state, world);
    const cls = lastNw === null ? '' : nw > lastNw ? 'up' : nw < lastNw ? 'down' : '';
    lastNw = nw;
    stats.append(
      stat('Cash', chf(state.player.cash, { compact: true }), state.player.cash < 0 ? 'down' : ''),
      stat('Property', chf(propertyValue(state, world), { compact: true })),
      stat('Debt', chf(totalDebt(state), { compact: true })),
      stat('Rent / month', chf(rentMonth(state), { compact: true })),
      stat('Net worth', chf(nw, { compact: true }), cls),
    );
    date.textContent = `${monthLabel(state.month)} · year ${Math.floor(state.month / 12) + 1} of ${CAREER_MONTHS / 12}`;
    endBtn.disabled = busy || !canEnd || Boolean(state.over);
    endBtn.textContent = endLabel || 'End month';
    skipBtn.disabled = busy || !canEnd || Boolean(state.over);
  }

  return { el, update };
}
