// Integer francs and basis points. One rounding rule: half up to the franc, at the posting.

export function round(x) {
  if (!Number.isFinite(x)) throw new Error(`money: not finite (${x})`);
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

// Monthly interest on a balance at a yearly rate in basis points.
export function monthlyInterest(balance, bps) {
  return round((balance * bps) / 120000);
}

export function pct(amount, p) {
  return round((amount * p) / 100);
}

export function perMille(amount, pm) {
  return round((amount * pm) / 1000);
}

export function bps(amount, b) {
  return round((amount * b) / 10000);
}

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

// CHF 1'234'567 in Swiss style with an apostrophe as the thousands separator.
export function chf(n, { sign = false, compact = false } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'CHF –';
  const neg = n < 0;
  const abs = Math.abs(round(n));
  let body;
  if (compact && abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  else if (compact && abs >= 10_000) body = `${Math.round(abs / 1000)}k`;
  else body = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const prefix = neg ? '−' : sign && abs > 0 ? '+' : '';
  return `${prefix}CHF ${body}`;
}

export function pctText(x, digits = 1) {
  if (!Number.isFinite(x)) return '–';
  return `${(x * 100).toFixed(digits)}%`;
}

export function bpsText(b, digits = 2) {
  if (!Number.isFinite(b)) return '–';
  return `${(b / 100).toFixed(digits)}%`;
}
