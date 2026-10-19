// MapLibre view of Kreis 4 and 5. One still framing; the camera moves only when the player clicks
// a building. Footprints from the city survey are drawn on top of the OpenFreeMap Liberty style and
// coloured by owner. MapLibre GL JS is a global (window.maplibregl).

import { RIVALS } from '../data/rivals.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_TIMEOUT_MS = 8000;

const COLORS = {
  listing: '#1A73E8',
  player: '#D52B1E',
  selected: '#111214',
  other: '#9AA0A6',
};

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function fallbackStyle() {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eceee9' } }],
  };
}

async function fetchStyle(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), STYLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`style ${res.status}`);
    const style = await res.json();
    // quieter basemap: soften building colours so the game's own layers read first
    for (const l of style.layers || []) {
      if (l.type === 'fill-extrusion' && l.paint) {
        l.paint['fill-extrusion-opacity'] = 0.55;
      }
    }
    return style;
  } finally {
    clearTimeout(t);
  }
}

function ringOf(b) {
  if (b.footprint && b.footprint.length >= 3) {
    const ring = b.footprint.slice();
    const [x0, y0] = ring[0];
    const [xn, yn] = ring[ring.length - 1];
    if (x0 !== xn || y0 !== yn) ring.push([x0, y0]);
    return ring;
  }
  // a 12 m square when no footprint is known
  const d = 0.00008;
  return [[b.lon - d, b.lat - d], [b.lon + d, b.lat - d], [b.lon + d, b.lat + d], [b.lon - d, b.lat + d], [b.lon - d, b.lat - d]];
}

export function createMapView({ container, world, onSelect = null, insets = () => ({ top: 70, left: 400, right: 440, bottom: 20 }) }) {
  const ml = window.maplibregl;
  if (!ml) throw new Error('maplibregl missing');
  const features = world.buildings.map((b) => ({
    type: 'Feature',
    id: Number(String(b.id).replace(/\D/g, '')) || 0,
    properties: { bid: b.id, owner: 'none', color: COLORS.other, h: Math.max(6, (b.storeys || 4) * 3), label: `${b.street} ${b.no}` },
    geometry: { type: 'Polygon', coordinates: [ringOf(b)] },
  }));
  const fc = { type: 'FeatureCollection', features };
  const byBid = new Map(features.map((f) => [f.properties.bid, f]));

  const bounds = world.bounds || [[8.49, 47.365], [8.545, 47.40]];
  const map = new ml.Map({
    container,
    style: fallbackStyle(),
    center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2],
    zoom: 14,
    pitch: 0,
    bearing: 0,
    attributionControl: { compact: false },
    maxBounds: [[bounds[0][0] - 0.03, bounds[0][1] - 0.02], [bounds[1][0] + 0.03, bounds[1][1] + 0.02]],
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
  map.touchZoomRotate.disableRotation();

  let ready = false;
  let selected = null;
  let pendingState = null;
  let destroyed = false;

  function frame(animate = false) {
    const i = insets();
    map.fitBounds(bounds, { padding: { top: i.top + 10, left: i.left + 10, right: i.right + 10, bottom: i.bottom + 10 }, duration: animate && !reducedMotion() ? 500 : 0, maxZoom: 16 });
  }

  function addLayers() {
    if (map.getSource('im-buildings')) return;
    map.addSource('im-buildings', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'im-buildings-fill',
      type: 'fill-extrusion',
      source: 'im-buildings',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'h'],
        'fill-extrusion-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'im-buildings-line',
      type: 'line',
      source: 'im-buildings',
      paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], COLORS.selected, 'rgba(0,0,0,0.25)'],
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 0.6],
      },
    });
    map.addLayer({
      id: 'im-marks',
      type: 'circle',
      source: 'im-buildings',
      filter: ['!=', ['get', 'owner'], 'none'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 6, 16, 11],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-translate': [0, -6],
        'circle-pitch-alignment': 'viewport',
      },
    });
    map.on('click', 'im-buildings-fill', (e) => {
      const f = e.features && e.features[0];
      if (f && onSelect) onSelect(f.properties.bid);
    });
    map.on('click', 'im-marks', (e) => {
      const f = e.features && e.features[0];
      if (f && onSelect) onSelect(f.properties.bid);
    });
    map.on('mouseenter', 'im-buildings-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'im-buildings-fill', () => { map.getCanvas().style.cursor = ''; });
  }

  async function loadStyle() {
    let style = null;
    let fallback = false;
    try { style = await fetchStyle(STYLE_URL); } catch { fallback = true; }
    if (destroyed) return;
    if (style) {
      map.setStyle(style, { diff: false });
      await new Promise((res) => map.once('styledata', res));
      await new Promise((res) => (map.isStyleLoaded() ? res() : map.once('idle', res)));
    }
    addLayers();
    ready = true;
    frame(false);
    if (pendingState) update(pendingState.state, pendingState.selection);
    return !fallback;
  }

  const loaded = new Promise((res) => map.once('load', () => res()));
  const styleReady = loaded.then(loadStyle);

  function update(state, selection = null) {
    pendingState = { state, selection };
    if (!ready) return;
    for (const f of features) { f.properties.owner = 'none'; f.properties.color = COLORS.other; }
    for (const l of Object.values(state.listings)) {
      const f = byBid.get(l.buildingId);
      if (f) { f.properties.owner = 'listing'; f.properties.color = COLORS.listing; }
    }
    for (const rid of Object.keys(state.rivals)) {
      for (const lot of Object.values(state.rivals[rid].lots)) {
        const f = byBid.get(lot.buildingId);
        if (f) { f.properties.owner = rid; f.properties.color = RIVALS[rid]?.color || COLORS.other; }
      }
    }
    for (const lot of Object.values(state.lots)) {
      const f = byBid.get(lot.buildingId);
      if (f) { f.properties.owner = 'player'; f.properties.color = COLORS.player; }
    }
    const src = map.getSource('im-buildings');
    if (src) src.setData(fc);
    setSelected(selection);
  }

  function setSelected(bid) {
    if (!ready) { selected = bid; return; }
    if (selected && byBid.get(selected)) map.setFeatureState({ source: 'im-buildings', id: byBid.get(selected).id }, { selected: false });
    selected = bid;
    if (bid && byBid.get(bid)) map.setFeatureState({ source: 'im-buildings', id: byBid.get(bid).id }, { selected: true });
  }

  // The one camera move: the player asked to look at a building.
  function focus(bid) {
    const b = world.byId.get(bid);
    if (!b) return;
    const i = insets();
    const z = Math.max(map.getZoom(), 16.2);
    map.easeTo({ center: [b.lon, b.lat], zoom: z, padding: { top: i.top, left: i.left, right: i.right, bottom: i.bottom }, duration: reducedMotion() ? 0 : 600, essential: true });
  }

  function overview() { frame(true); }

  return {
    map,
    ready: styleReady,
    update,
    focus,
    overview,
    setSelected,
    resize: () => map.resize(),
    destroy: () => { destroyed = true; try { map.remove(); } catch { /* already gone */ } },
    colors: COLORS,
  };
}
