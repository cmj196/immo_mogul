// Deterministic random numbers with named streams. stream(seed, 'market', 14) always yields the
// same sequence, whatever else the engine drew before, so adding a feature never shifts another
// feature's draws and skipping ahead in chunks matches month-by-month play. mulberry32 seeded by an
// FNV-1a hash of the labels. The state stores no RNG position, only the seed.

export function hash32(...parts) {
  const text = parts.map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p))).join('\u001f');
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  // one more avalanche so labels that differ only in a trailing digit do not land next to each other
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  return hash32(seed ?? 'immo-mogul');
}

export function stream(seed, ...labels) {
  let a = hash32(normalizeSeed(seed), ...labels);
  const float = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    float,
    int: (n) => Math.floor(float() * n),
    range: (lo, hi) => lo + float() * (hi - lo),
    chance: (p) => float() < p,
    pick: (arr) => arr[Math.floor(float() * arr.length)],
    // Box-Muller, one value per call (the second is discarded to keep the sequence simple).
    gauss: () => {
      const u = Math.max(1e-12, float());
      const v = float();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // Weighted pick over { key: weight }.
    weighted: (weights) => {
      const entries = Object.entries(weights);
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let x = float() * total;
      for (const [k, w] of entries) {
        x -= w;
        if (x < 0) return k;
      }
      return entries[entries.length - 1][0];
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let k = out.length - 1; k > 0; k--) {
        const j = Math.floor(float() * (k + 1));
        const tmp = out[k];
        out[k] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
  return r;
}
