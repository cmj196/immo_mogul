// Controller: holds the state, dispatches actions, plays sounds, autosaves, runs skip-ahead in
// chunks. The UI subscribes with onChange and never touches the state directly.

import { applyAction, advance, checkAction, startCareer } from './engine/actions.js';
import { hasDecision } from './engine/state.js';

export const SAVE_KEY = 'immomogul.save.v1';
export const SETTINGS_KEY = 'immomogul.settings.v1';
const SAVE_ASIDE_KEY = 'immomogul.save.broken.v1';

const SOUND_FOR = {
  dealAgreed: 'deal', bought: 'deal', sold: 'coinIn', milestone: 'win', over: 'win',
  bankWarn: 'warn', bankFail: 'warn', forcedSale: 'warn', overdraft: 'warn',
  buyerOffer: 'card', applicants: 'card', rollover: 'card', listings: null,
  reply: 'card', let: 'coinIn', refRatePassed: 'coinIn', renoDone: 'deal',
};

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function loadSettings() {
  const def = { theme: 'auto', muted: false, volume: 0.6, speed: 'normal' };
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch { return def; }
}

export function saveSettings(s) {
  try { storage()?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* blocked storage: settings last for this visit */ }
}

export function readSave() {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function isPlayableSave(save, world) {
  if (!save || typeof save !== 'object') return { ok: false, why: 'no save' };
  if (save.v !== 1) return { ok: false, why: `unknown save version ${save.v}` };
  if (save.dataVersion !== world.dataVersion) return { ok: false, why: 'The save was made with another data snapshot.' };
  try {
    if (!save.player || !save.macro || !save.lots || !save.units || typeof save.month !== 'number') return { ok: false, why: 'incomplete save' };
    checkAction(save, world, { type: 'endMonth' });
    return { ok: true };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

export function createController({ world, sfx = null, onChange = () => {}, onToast = () => {} }) {
  let state = null;
  let busy = false;
  let generation = 0;
  let saveFailed = false;
  const listeners = new Set([onChange]);

  function notify(events = [], meta = {}) {
    for (const fn of listeners) {
      try { fn(state, events, meta); } catch (err) { console.error('Immo Mogul UI error', err); }
    }
  }

  function play(events) {
    if (!sfx) return;
    const names = new Set();
    for (const e of events) {
      const n = SOUND_FOR[e.type];
      if (n) names.add(n);
      if (e.type === 'cash' && e.reason === 'sale') names.add('coinIn');
    }
    for (const n of names) sfx.play(n);
  }

  function save() {
    if (!state) return;
    try {
      storage()?.setItem(SAVE_KEY, JSON.stringify(state));
      if (saveFailed) { saveFailed = false; }
    } catch (err) {
      if (!saveFailed) onToast({ text: 'Autosave failed: the browser refused to store the game. Export a save from the menu.', kind: 'warn' });
      saveFailed = true;
    }
  }

  function clearSave() {
    try { storage()?.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  function moveBrokenAside(raw) {
    try { if (raw) storage()?.setItem(SAVE_ASIDE_KEY, JSON.stringify(raw)); storage()?.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  return {
    get state() { return state; },
    get busy() { return busy; },
    get saveFailed() { return saveFailed; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    newGame({ seed, difficulty, name }) {
      generation += 1;
      const r = startCareer({ seed, world, difficulty, name });
      state = r.state;
      save();
      notify(r.events, { reason: 'new' });
      return state;
    },

    resume(save_) {
      generation += 1;
      state = save_;
      notify([], { reason: 'resume' });
      return state;
    },

    dispatch(action) {
      if (!state || busy) return { error: busy ? 'Busy.' : 'No game.' };
      const r = applyAction(state, world, action);
      if (r.error) return { error: r.error };
      state = r.state;
      play(r.events);
      save();
      notify(r.events, { reason: action.type, action });
      return { error: null, events: r.events };
    },

    check(action) {
      return state ? checkAction(state, world, action) : 'No game.';
    },

    // Skip ahead until something needs the player. Runs in chunks so the UI stays responsive.
    async skip({ maxMonths = 24 } = {}) {
      if (!state || busy) return;
      busy = true;
      const gen = generation;
      let months = 0;
      const all = [];
      notify([], { reason: 'skipStart' });
      try {
        while (months < maxMonths) {
          const r = advance(state, world, { maxMonths: Math.min(3, maxMonths - months) });
          if (gen !== generation) return;
          state = r.state;
          all.push(...r.events);
          months += r.months;
          notify(r.events, { reason: 'skipChunk' });
          if (r.stoppedBecause !== 'limit' || r.months === 0) break;
          await new Promise((res) => setTimeout(res, 40));
        }
      } finally {
        busy = false;
        if (gen === generation) {
          play(all.filter((e) => ['milestone', 'bankWarn', 'bankFail', 'buyerOffer', 'over'].includes(e.type)));
          if (sfx && months > 0) sfx.play('turn');
          save();
          notify(all, { reason: 'skipEnd', months });
        }
      }
    },

    hasDecision() { return state ? hasDecision(state) : false; },
    save,
    clearSave,
    moveBrokenAside,
    exportText() { return state ? JSON.stringify(state) : ''; },
    importText(text) {
      const parsed = JSON.parse(text);
      const ok = isPlayableSave(parsed, world);
      if (!ok.ok) throw new Error(ok.why);
      return this.resume(parsed);
    },
  };
}
