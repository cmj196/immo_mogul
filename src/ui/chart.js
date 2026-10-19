// A small inline SVG line chart of net worth over the career. No animation.

import { monthLabel } from '../engine/clock.js';
import { chf } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function netWorthChart(history, { width = 340, height = 140 } = {}) {
  const svg = el('svg', { class: 'im-chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Net worth over time' });
  if (!history || history.length < 2) {
    const t = el('text', { x: 8, y: 20 });
    t.textContent = 'The chart fills in as the months pass.';
    svg.append(t);
    return svg;
  }
  const padL = 8, padR = 8, padT = 12, padB = 18;
  const xs = history.map((p) => p.month);
  const ys = history.map((p) => p.netWorth);
  const x0 = xs[0], x1 = xs[xs.length - 1] || 1;
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys) * 1.05 || 1;
  const sx = (m) => padL + ((m - x0) / Math.max(1, x1 - x0)) * (width - padL - padR);
  const sy = (v) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (height - padT - padB);
  const pts = history.map((p) => `${sx(p.month).toFixed(1)},${sy(p.netWorth).toFixed(1)}`);
  const area = el('path', { class: 'area', d: `M${sx(x0)},${sy(yMin)} L${pts.join(' L')} L${sx(x1)},${sy(yMin)} Z` });
  const line = el('path', { class: 'line', d: `M${pts.join(' L')}` });
  const axis = el('line', { class: 'axis', x1: padL, x2: width - padR, y1: sy(Math.max(0, yMin)), y2: sy(Math.max(0, yMin)) });
  svg.append(area, axis, line);
  const start = el('text', { x: padL, y: height - 4 });
  start.textContent = monthLabel(x0);
  const end = el('text', { x: width - padR, y: height - 4, 'text-anchor': 'end' });
  end.textContent = monthLabel(x1);
  const top = el('text', { x: width - padR, y: padT - 2, 'text-anchor': 'end' });
  top.textContent = chf(Math.max(...ys), { compact: true });
  svg.append(start, end, top);
  return svg;
}
