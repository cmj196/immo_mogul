// Boot: load the world, settings and save, show the start screen, then mount the game.

import { loadWorld } from './engine/world.js';
import { createController, loadSettings, saveSettings, readSave, isPlayableSave } from './controller.js';
import { createSfx } from './ui/sfx.js';
import { createOverlay, createToasts } from './ui/modal.js';
import { renderSetup } from './ui/setup.js';
import { mountUI } from './ui/index.js';
import { createMapView } from './map/mapView.js';
import { h } from './ui/dom.js';

const root = document.getElementById('ui');

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

async function boot() {
  const settings = loadSettings();
  applyTheme(settings.theme);
  const sfx = createSfx();
  if (settings.muted) sfx.setMuted(true);
  if (Number.isFinite(settings.volume)) sfx.setVolume(settings.volume);
  const toasts = createToasts(root);
  const overlay = createOverlay(root);

  let world;
  try {
    world = await loadWorld(new URL('../data/world.json', import.meta.url).href);
  } catch (err) {
    root.append(h('div', { class: 'im-setup' }, h('div', { class: 'im-setup-card' }, h('h1', {}, 'Immo Mogul'), h('p', { class: 'lede' }, `The world data did not load (${err.message}). Run the data build and start play.cmd again.`))));
    return;
  }

  const insets = () => {
    const narrow = window.innerWidth < 820;
    return narrow ? { top: 70, left: 10, right: 10, bottom: 10 } : { top: 70, left: 400, right: 440, bottom: 20 };
  };
  let selectHandler = null;
  const map = createMapView({ container: 'map', world, insets, onSelect: (bid) => selectHandler && selectHandler(bid) });
  map.ready.then((ok) => { if (!ok) toasts.show({ text: 'The street map did not load; showing buildings on a plain background.', kind: 'warn', ms: 6000 }); }).catch(() => {});

  const ctrl = createController({ world, sfx, onToast: (t) => toasts.show(t) });
  let hud = null;
  let setup = null;

  function onSettings(patch) {
    Object.assign(settings, patch);
    saveSettings(settings);
    applyTheme(settings.theme);
  }

  function showSetup() {
    const raw = readSave();
    let save = null;
    if (raw) {
      const ok = isPlayableSave(raw, world);
      if (ok.ok) save = raw;
      else { ctrl.moveBrokenAside(raw); toasts.show({ text: `An old save could not be resumed (${ok.why}). It was set aside.`, kind: 'warn', ms: 8000 }); }
    }
    setup = renderSetup({
      root, save,
      worldInfo: { buildings: world.buildings.length, dataVersion: world.dataVersion },
      onNew: (opts) => { setup.remove(); setup = null; ensureHud(); ctrl.newGame(opts); map.overview(); },
      onResume: () => { setup.remove(); setup = null; ensureHud(); ctrl.resume(save); },
      onImport: () => {
        const input = h('input', { type: 'file', accept: 'application/json,.json' });
        input.addEventListener('change', async () => {
          const f = input.files && input.files[0];
          if (!f) return;
          try {
            const text = await f.text();
            setup.remove(); setup = null; ensureHud();
            ctrl.importText(text);
            ctrl.save();
          } catch (err) { toasts.show({ text: `Import failed: ${err.message}`, kind: 'warn' }); if (!setup) showSetup(); }
        });
        input.click();
      },
    });
  }

  function ensureHud() {
    if (hud) return;
    hud = mountUI({ root, world, ctrl, map, sfx, overlay, toasts, settings, onSettings, onNewGame: () => { overlay.close(); showSetup(); } });
    selectHandler = (bid) => hud.ui.select(bid, { focus: true });
  }

  showSetup();
  window.addEventListener('resize', () => map.resize());
  // for debugging in the console
  window.immo = { ctrl, world, map };
}

boot().catch((err) => {
  console.error(err);
  root.append(h('div', { class: 'im-setup' }, h('div', { class: 'im-setup-card' }, h('h1', {}, 'Immo Mogul'), h('p', { class: 'lede' }, `Something went wrong while starting: ${err.message}`))));
});
