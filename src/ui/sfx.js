// Gentle synthesised sound effects with WebAudio, adapted from the Paradeplatz palette (same
// author). Warm and soft: sine and triangle voices, darkened noise, two low-pass filters and a soft
// ceiling on the master bus. On by default at a quiet level, with mute and volume remembered per
// browser. Names used here: turn (end of month), deal (agreement), coinIn (money in), coinOut
// (money out), card (a letter or listing), warn (bank), win (milestone, career end), click (off by
// default).
//
// A limiter keeps rapid events from stacking: one sound per name every 140 ms and at most three
// voices at once. The AudioContext is created on the first pointer or key press; a sound that
// arrives while the context is suspended is dropped rather than queued.

const MUTE_KEY = 'immomogul.sound.v1.muted';
const VOLUME_KEY = 'immomogul.sound.v1.volume';

export const DEFAULT_VOLUME = 0.6;
export const MASTER_LEVEL = 0.32; // master gain at volume 1; volume scales it linearly
export const CEILING = 0.2; // soft ceiling on the master bus, about -14 dBFS
export const LOWPASS_HZ = 4000;
export const MIN_GAP_S = 0.14;
export const MAX_VOICES = 3;

// How long each sound occupies a voice, in seconds (used by the limiter).
export const DURATIONS = { click: 0.05, turn: 0.2, deal: 0.5, coinIn: 0.5, coinOut: 0.4, card: 0.22, warn: 0.6, win: 0.95 };

const ALIASES = {
  'coin-in': 'coinIn', coin_in: 'coinIn', coinin: 'coinIn',
  'coin-out': 'coinOut', coin_out: 'coinOut', coinout: 'coinOut',
};

export function clampVolume(v, fallback = DEFAULT_VOLUME) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

// Rate and polyphony limiter. Pure, so it can be tested without audio.
export function createLimiter({ minGap = MIN_GAP_S, maxVoices = MAX_VOICES } = {}) {
  const last = new Map();
  let ends = [];
  return {
    allow(name, now, dur) {
      ends = ends.filter((e) => e > now);
      const prev = last.get(name);
      if (prev !== undefined && now - prev < minGap) return false;
      if (ends.length >= maxVoices) return false;
      last.set(name, now);
      ends.push(now + dur);
      return true;
    },
    voices(now) { return ends.filter((e) => e > now).length; },
  };
}

// Small integer hash to 0..1, for timing variation that repeats exactly from a counter.
export function hash01(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
function readKey(storage, key) {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
}
function writeKey(storage, key, value) {
  try { if (storage) storage.setItem(key, value); } catch { /* storage blocked: the choice lasts for this visit */ }
}
function defaultNow() {
  return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
}

export function createSfx(opts = {}) {
  const storage = opts.storage !== undefined ? opts.storage : defaultStorage();
  const now = opts.now || defaultNow;
  const limiter = createLimiter(opts.limits);
  const given = opts.context || null;

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = readKey(storage, MUTE_KEY) === '1';
  let volume = clampVolume(readKey(storage, VOLUME_KEY));
  let uiClicks = false;
  
  let noiseCount = 0;

  function audio() {
    if (ctx) return ctx;
    let c = given;
    if (!c) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try { c = new AC(); } catch { return null; }
    }
    try {
      master = c.createGain();
      master.gain.value = MASTER_LEVEL * volume;
      const lp1 = c.createBiquadFilter();
      lp1.type = 'lowpass';
      lp1.frequency.value = LOWPASS_HZ;
      lp1.Q.value = 0.6;
      const lp2 = c.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = LOWPASS_HZ;
      lp2.Q.value = 0.6;
      // Soft ceiling: linear for quiet signals, bends smoothly toward CEILING for loud ones.
      const shaper = c.createWaveShaper();
      const n = 2049;
      const curve = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const x = (k / (n - 1)) * 2 - 1;
        curve[k] = CEILING * Math.tanh(x / CEILING);
      }
      shaper.curve = curve;
      shaper.oversample = '2x';
      master.connect(lp1).connect(lp2).connect(shaper).connect(c.destination);
      noiseBuf = makeNoise(c);
      ctx = c;
    } catch {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  // One second of darkened noise from a fixed seed: white noise through a one-pole low-pass at
  // about 1.8 kHz, so band-passed bursts do not leak hiss into the top octaves.
  function makeNoise(c) {
    const len = Math.floor(c.sampleRate);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    const a = 1 - Math.exp((-2 * Math.PI * 1800) / c.sampleRate);
    let seed = 0x2545f491;
    let y = 0;
    let peak = 0;
    for (let k = 0; k < len; k++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = seed / 2147483648 - 1;
      y += a * (x - y);
      d[k] = y;
      if (Math.abs(y) > peak) peak = Math.abs(y);
    }
    for (let k = 0; k < len; k++) d[k] /= peak || 1;
    return buf;
  }

  // Envelope: soft linear rise, then an exponential fall to silence by t + dur.
  function env(param, t, peak, attack, dur) {
    const a = Math.max(0.008, attack);
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  }

  // Marimba-like note: a sine fundamental plus a quiet, quickly fading fourth partial.
  function note(out, t, { freq, dur, gain, attack = 0.01, type = 'sine', lowpass = 2600, partial = 0.1 }) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    f.Q.value = 0.5;
    f.connect(out);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    env(g.gain, t, gain, attack, dur);
    o.connect(g).connect(f);
    o.start(t);
    o.stop(t + dur + 0.05);
    const pf = freq * 4 < 3500 ? freq * 4 : freq * 3;
    if (partial && pf < 3500) {
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = pf;
      const g2 = ctx.createGain();
      env(g2.gain, t, gain * partial, attack, dur * 0.25);
      o2.connect(g2).connect(f);
      o2.start(t);
      o2.stop(t + dur * 0.25 + 0.05);
    }
  }

  // Short band-passed noise burst, optionally sweeping its centre frequency.
  function burst(out, t, { dur, gain, freq, q = 1.5, attack = 0.008, sweepTo }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, t);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    bp.Q.value = q;
    const g = ctx.createGain();
    env(g.gain, t, gain, attack, dur);
    src.connect(bp).connect(g).connect(out);
    const offset = hash01(++noiseCount) * 0.85;
    src.start(t, offset, dur + 0.03);
  }

  // Wooden knock: a sine that drops a little in pitch, with a puff of low noise for the contact.
  function knock(out, t, { freq, gain, dur = 0.13 }) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.35, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
    const g = ctx.createGain();
    env(g.gain, t, gain, 0.008, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    burst(out, t, { dur: 0.035, gain: gain * 0.45, freq: freq * 4.5, q: 1.2 });
  }

  const SOUNDS = {
    // Barely there felt tap; silent unless uiClicks is on.
    click: (out, t) => burst(out, t, { dur: 0.02, gain: 0.12, freq: 900, q: 1.2 }),

    // End of month: one soft wooden knock, like a page turned on a desk.
    turn: (out, t) => knock(out, t, { freq: 190, gain: 0.5, dur: 0.14 }),

    // A deal agreed: a knock and a warm note.
    deal: (out, t) => {
      knock(out, t, { freq: 170, gain: 0.55, dur: 0.15 });
      note(out, t + 0.08, { freq: 523.25, dur: 0.4, gain: 0.4 });
    },

    // Two soft marimba notes rising a fifth.
    coinIn: (out, t) => {
      note(out, t, { freq: 523.25, dur: 0.26, gain: 0.5 });
      note(out, t + 0.09, { freq: 783.99, dur: 0.36, gain: 0.42 });
    },

    // One soft lower note.
    coinOut: (out, t) => note(out, t, { freq: 392, dur: 0.32, gain: 0.5 }),

    // Short paper swish: dark noise whose band slides up as it fades in and out.
    card: (out, t) => burst(out, t, { dur: 0.17, gain: 0.9, freq: 600, sweepTo: 1500, q: 1.1, attack: 0.05 }),

    // Two low soft tones, falling: the bank is writing.
    warn: (out, t) => {
      note(out, t, { freq: 220, dur: 0.24, gain: 0.45, type: 'triangle', lowpass: 800, attack: 0.015, partial: 0 });
      note(out, t + 0.2, { freq: 164.81, dur: 0.36, gain: 0.45, type: 'triangle', lowpass: 700, attack: 0.015, partial: 0 });
    },

    // Gentle short arpeggio: G4 C5 E5 G5.
    win: (out, t) => {
      [392, 523.25, 659.25, 783.99].forEach((f, k) => note(out, t + k * 0.1, { freq: f, dur: k === 3 ? 0.6 : 0.3, gain: 0.38, partial: 0.08 }));
    },
  };

  function setMuted(v) {
    muted = Boolean(v);
    writeKey(storage, MUTE_KEY, muted ? '1' : '0');
    return muted;
  }

  function setVolume(v) {
    volume = clampVolume(v, volume);
    writeKey(storage, VOLUME_KEY, String(volume));
    if (ctx && master) {
      try { master.gain.setTargetAtTime(MASTER_LEVEL * volume, ctx.currentTime, 0.03); } catch { master.gain.value = MASTER_LEVEL * volume; }
    }
    return volume;
  }

  // Asks a suspended context to resume and reports whether it is running right now. resume() is
  // not awaited: whether it works depends on the browser's gesture rules, and a sound is only
  // worth scheduling once the clock is moving.
  function wake(c) {
    try {
      if (c.state === 'running') return true;
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        const p = c.resume();
        if (p && p.catch) p.catch(() => {});
      }
      return c.state === 'running';
    } catch {
      return false;
    }
  }

  // The first sound often comes from a bot's timer, not from a click, and some browsers create or
  // keep a context suspended outside a gesture. So the first pointer or key press creates the
  // context and resumes it, and later sounds find it already running. The listener removes
  // itself once that has happened.
  function wakeOnGesture() {
    if (given || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    const events = ['pointerdown', 'keydown'];
    const onGesture = () => {
      let c = null;
      try { c = audio(); } catch { c = null; }
      if (!c || wake(c)) events.forEach((e) => document.removeEventListener(e, onGesture, true));
    };
    try { events.forEach((e) => document.addEventListener(e, onGesture, { capture: true, passive: true })); } catch { /* no listeners here: the first played sound asks instead */ }
  }
  wakeOnGesture();

  return {
    play(name) {
      const key = ALIASES[name] || name;
      const fn = SOUNDS[key];
      if (!fn || muted || volume <= 0) return false;
      if (key === 'click' && !uiClicks) return false;
      const c = audio();
      if (!c) return false;
      // A sound scheduled while the context is suspended does not play now: its clock is frozen,
      // so it would sit there with every later one and all fire together on resume. Ask the
      // context to resume and drop this sound. The check comes before the limiter so a dropped
      // sound does not use up a slot. A passed-in context is exempt (an OfflineAudioContext stays
      // 'suspended' until it renders).
      if (!given && !wake(c)) return false;
      // Stamp the limiter after the context exists: creating it can take longer than the gap.
      if (!limiter.allow(key, now(), DURATIONS[key])) return false;
      try {
        const out = c.createGain();
        out.connect(master);
        fn(out, c.currentTime + 0.01);
        return true;
      } catch {
        return false; /* audio is a nicety; never break the game for it */
      }
    },
    get muted() { return muted; },
    set muted(v) { setMuted(v); },
    setMuted,
    get volume() { return volume; },
    set volume(v) { setVolume(v); },
    setVolume,
    get uiClicks() { return uiClicks; },
    set uiClicks(v) { uiClicks = Boolean(v); },
    names: Object.keys(SOUNDS),
  };
}
