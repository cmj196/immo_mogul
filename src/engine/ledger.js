// Events, the rolling log and the ledger. The ledger is the only place cash changes.

import { LOG_CAP, LEDGER_MONTHS } from './state.js';
import { round } from './money.js';

export class RuleError extends Error {}

export function emit(s, events, type, fields, text) {
  const ev = { type, month: s.month, ...fields, text };
  events.push(ev);
  if (text) {
    s.log.push({ month: s.month, type, text });
    if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
  }
  return ev;
}

// Post a cash movement. Positive amounts are money in. Every posting emits a 'cash' event so the
// fuzz test can reconcile the event stream with the cash change.
export function post(s, events, { reason, amount, lotId = null, unitId = null, loanId = null, text = null }) {
  const a = round(amount);
  if (a === 0) return 0;
  s.player.cash += a;
  s.ledger.push({ month: s.month, reason, amount: a, lotId, unitId, loanId });
  events.push({ type: 'cash', month: s.month, reason, amount: a, lotId, unitId, loanId, text });
  if (text) {
    s.log.push({ month: s.month, type: 'cash', text });
    if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
  }
  return a;
}

export function trimLedger(s) {
  const cutoff = s.month - LEDGER_MONTHS;
  if (s.ledger.length && s.ledger[0].month < cutoff) {
    s.ledger = s.ledger.filter((p) => p.month >= cutoff);
  }
}

export function ledgerForMonth(s, month) {
  return s.ledger.filter((p) => p.month === month);
}

export function sumLedger(s, month, reasons = null) {
  let t = 0;
  for (const p of s.ledger) {
    if (p.month !== month) continue;
    if (reasons && !reasons.includes(p.reason)) continue;
    t += p.amount;
  }
  return t;
}
