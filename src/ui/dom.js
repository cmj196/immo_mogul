// Tiny DOM helpers: h(tag, attrs, ...children) and formatting.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function chf(n, opts) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'CHF –';
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  let body;
  if (opts?.compact && abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  else if (opts?.compact && abs >= 10_000) body = `${Math.round(abs / 1000)}k`;
  else body = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const prefix = neg ? '−' : opts?.sign && abs > 0 ? '+' : '';
  return `${prefix}CHF ${body}`;
}

export function pct(x, digits = 1) {
  return Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '–';
}

export function bps(b, digits = 2) {
  return Number.isFinite(b) ? `${(b / 100).toFixed(digits)}%` : '–';
}

export function kv(rows) {
  const dl = h('dl', { class: 'im-kv' });
  for (const r of rows) {
    if (!r) continue;
    const [k, v, cls] = r;
    dl.append(h('dt', { class: cls }, k), h('dd', { class: cls }, v));
  }
  return dl;
}

export function parseMoney(text) {
  const n = Number(String(text).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function roundTo(n, step) {
  return Math.round(n / step) * step;
}
