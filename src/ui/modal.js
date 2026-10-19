// Modal dialogs and toasts. One modal at a time; Escape closes when the dialog allows it.

import { h, clear } from './dom.js';

export function createOverlay(root) {
  let wrap = null;
  let onClose = null;

  function close(result) {
    if (!wrap) return;
    wrap.remove();
    wrap = null;
    const fn = onClose;
    onClose = null;
    if (fn) fn(result);
  }

  // open({ title, sub, body: Node | () => Node, actions: [{ label, primary, onClick(api), disabled }], wide, dismissible })
  function open(spec) {
    close('replaced');
    const body = h('div', { class: 'im-modal-body' });
    const foot = h('div', { class: 'im-modal-foot' });
    const err = h('div', { class: 'im-error', role: 'alert' });
    const api = {
      close,
      setError: (msg) => { err.textContent = msg || ''; },
      rerender: () => { clear(body); body.append(typeof spec.body === 'function' ? spec.body(api) : spec.body, err); renderFoot(); },
      el: null,
    };
    function renderFoot() {
      clear(foot);
      const actions = typeof spec.actions === 'function' ? spec.actions(api) : spec.actions || [];
      for (const a of actions) {
        if (!a) continue;
        foot.append(h('button', {
          class: `im-btn ${a.primary ? 'im-btn--primary' : ''} ${a.left ? 'left' : ''} ${a.ghost ? 'im-btn--ghost' : ''}`,
          disabled: a.disabled || null,
          type: 'button',
          onClick: () => a.onClick?.(api),
        }, a.label));
      }
    }
    const modal = h('div', { class: `im-modal ${spec.wide ? 'im-modal--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': spec.title },
      h('div', { class: 'im-modal-head' },
        h('div', { style: { flex: 1 } }, h('h2', {}, spec.title), spec.sub ? h('p', {}, spec.sub) : null),
        spec.dismissible !== false ? h('button', { class: 'im-btn im-btn--ghost im-btn--icon', 'aria-label': 'Close', type: 'button', onClick: () => close('dismiss') }, '✕') : null),
      body, foot);
    api.el = modal;
    wrap = h('div', { class: 'im-modal-wrap', onClick: (e) => { if (e.target === wrap && spec.dismissible !== false) close('dismiss'); } }, modal);
    onClose = spec.onClose || null;
    root.append(wrap);
    api.rerender();
    const first = modal.querySelector('input, button.im-btn--primary, button');
    if (first) setTimeout(() => first.focus(), 0);
    return api;
  }

  function onKey(e) {
    if (e.key === 'Escape' && wrap) close('dismiss');
  }
  document.addEventListener('keydown', onKey);

  return { open, close, get isOpen() { return Boolean(wrap); } };
}

export function createToasts(root) {
  const box = h('div', { class: 'im-toasts', 'aria-live': 'polite' });
  root.append(box);
  return {
    show({ text, kind = 'info', ms = 4200 }) {
      const t = h('div', { class: `im-toast ${kind === 'good' ? 'im-toast--good' : kind === 'warn' ? 'im-toast--warn' : ''}` }, text);
      box.append(t);
      requestAnimationFrame(() => t.classList.add('show'));
      const remove = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 200); };
      const timer = setTimeout(remove, ms);
      t.addEventListener('click', () => { clearTimeout(timer); remove(); });
      while (box.children.length > 4) box.firstChild.remove();
    },
  };
}
