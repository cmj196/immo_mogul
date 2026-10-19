// Build data/world.json and data/manifest.json from the caches. No network.
//
//   node scripts/data/build-world.mjs [--kreise 4,5] [--max 900]
//
// Inputs (scripts/.cache/, see the fetch-* scripts):
//   bau_gwr_gebaeude_best_od5501.csv                  register, buildings
//   bau_gwr_wohnungen_best_od5503.csv                 register, flats
//   bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161  rent survey
//   bau_hae_preis_stockwerkeigentum_stadtquartier_od5157  condo prices
//   stadtkreise.geojson, statistische_quartiere.geojson   boundaries
//   footprints/tile_*.geojson + index.json            survey footprints (optional)
//
// Every input is parsed as data. Expected columns are checked up front and the
// script stops with the real header when one is missing.

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CACHE_DIR, DATA_DIR, readMeta, sha256Hex, today } from './lib/net.mjs';
import { parseCsv, requireColumns } from './lib/csv.mjs';
import { bboxOfCoords, inBbox, largestOuterRing, lv95ToWgs84, pointInGeometry, round6, simplifyRing } from './lib/geo.mjs';

const SRC = {
  buildings: 'bau_gwr_gebaeude_best_od5501',
  flats: 'bau_gwr_wohnungen_best_od5503',
  rents: 'bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161',
  condos: 'bau_hae_preis_stockwerkeigentum_stadtquartier_od5157',
};
const GEO = { kreise: 'stadtkreise.geojson', quartiere: 'statistische_quartiere.geojson' };

const RESIDENTIAL_GKLAS = new Set(['1110', '1121', '1122']);
const EXISTING_BUILDING = '1004';
const EXISTING_FLAT = '3004';
const MIN_AREA = 15;
const MAX_AREA = 300;
const MAX_FLATS = 14;

// Section 2.4 of docs/research/261002_data and tech.md, table "Anchors": Stadt Zürich, 1 June 2026.
const VACANCY = { city: 0.00106, 4: 0.00121, 5: 0.00045, source: 'Stadt Zürich, 1 June 2026' };

const CREDITS = [
  'Statistik Stadt Zürich and Stadt Zürich Open Data (CC0): building and dwelling register, rent survey, condominium prices, boundaries',
  'Bundesamt für Statistik: federal building and dwelling register (GWR)',
  'Amtliche Vermessung Stadt Zürich: building footprints',
];

const num = (s) => {
  if (s === undefined || s === null || s === '') return null;
  const v = Number(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** "1–3", "1-3", "4–6" -> midpoint; "K" or "" -> 0; plain number -> itself. */
function parseCount(s) {
  if (s === undefined || s === null) return 0;
  const t = String(s).trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  return 0;
}

/** GWR floor code: 3100 ground, 3101.. upper floors, 3401.. basements. */
export function decodeFloor(code) {
  const c = String(code || '').trim();
  if (!/^\d{4}$/.test(c)) return null;
  const n = Number(c);
  if (n === 3100) return 0;
  if (n > 3100 && n < 3200) return n - 3100;
  if (n > 3400 && n < 3500) return -(n - 3400);
  return null;
}

async function readCsv(id, wanted) {
  const file = path.join(CACHE_DIR, `${id}.csv`);
  if (!existsSync(file)) throw new Error(`missing cache file ${path.relative(process.cwd(), file)}; run fetch-ckan.mjs ${id}`);
  const text = await readFile(file, 'utf8');
  const { header, rows, separator } = parseCsv(text);
  requireColumns(header, wanted, id);
  const ix = Object.fromEntries(header.map((h, i) => [h, i]));
  const meta = (await readMeta(file)) || {};
  return { id, header, rows, ix, separator, meta: { ...meta, rows: rows.length } };
}

async function readGeo(name) {
  const file = path.join(CACHE_DIR, name);
  if (!existsSync(file)) throw new Error(`missing cache file ${name}; run fetch-geo.mjs`);
  const json = JSON.parse(await readFile(file, 'utf8'));
  const meta = (await readMeta(file)) || {};
  return { json, meta: { ...meta, rows: json.features.length } };
}

// ---------------------------------------------------------------- statistics

function buildRentStats(rents, kreise, quartierIds) {
  const { rows, ix } = rents;
  const latestYear = Math.max(...rows.map((r) => Number(r[ix.StichtagDatJahr])));
  const base = rows.filter((r) => Number(r[ix.StichtagDatJahr]) === latestYear && r[ix.PreisartSort] === '1');
  // private = GemeinnuetzigSort 2 ("Nicht gemeinnützig"); per m² = EinheitSort 2; per flat = EinheitSort 1
  const median = (raumeinheit, gliederung, zimmer, einheit, gemeinnuetzig = '2') => {
    const r = base.find((x) => x[ix.RaumeinheitSort] === raumeinheit && x[ix.GliederungSort] === gliederung
      && x[ix.ZimmerSort] === zimmer && x[ix.EinheitSort] === einheit && x[ix.GemeinnuetzigSort] === gemeinnuetzig);
    return r ? num(r[ix.qu50]) : null;
  };
  const byRooms = (raumeinheit, gliederung) => ({
    2: median(raumeinheit, gliederung, '2', '2'),
    3: median(raumeinheit, gliederung, '3', '2'),
    4: median(raumeinheit, gliederung, '4', '2'),
    all: median(raumeinheit, gliederung, '9', '2'),
  });
  const rentPerM2 = { city: byRooms('1', '0') };
  const rentPerFlat = { city: { 2: median('1', '0', '2', '1'), 3: median('1', '0', '3', '1'), 4: median('1', '0', '4', '1') } };
  for (const k of kreise) {
    rentPerM2[k] = byRooms('2', String(k * 10));
    rentPerFlat[k] = { 2: median('2', String(k * 10), '2', '1'), 3: median('2', String(k * 10), '3', '1'), 4: median('2', String(k * 10), '4', '1') };
  }
  for (const q of quartierIds) rentPerM2[`q${q}`] = byRooms('5', String(q));
  // Lease-type breakdown: Gliederung 1..5 exist for the whole city only (RaumeinheitSort 1).
  const rentNewLetPerM2 = { city: byRooms('1', '2') };
  for (const k of kreise) rentNewLetPerM2[k] = { 2: null, 3: null, 4: null, all: null };
  const newLetFlat = median('1', '2', '3', '1');
  const f = (g) => { const v = median('1', g, '3', '1'); return v && newLetFlat ? Math.round((v / newLetFlat) * 1000) / 1000 : null; };
  const leaseAgeFactor = { upTo2: 1.0, y3to10: f('3'), y11to20: f('4'), over20: f('5'),
    basis: `od5161 ${latestYear}, whole city, private, 3 rooms, median net rent per flat; new tenancy up to 2 years = ${newLetFlat}` };
  const rentNewBuildPerM2 = { city: byRooms('1', '1') };
  return { year: latestYear, rentPerM2, rentPerFlat, rentNewLetPerM2, rentNewBuildPerM2, leaseAgeFactor };
}

function buildCondoStats(condos, kreise, quartiere) {
  const { rows, ix } = condos;
  const years = [...new Set(rows.map((r) => Number(r[ix.Stichtagdatjahr])))].sort((a, b) => a - b);
  const lastYear = years[years.length - 1];
  const avgYears = [lastYear - 2, lastYear - 1, lastYear];
  const rowsFor = (raumSort) => rows.filter((r) => Number(r[ix.RaumSort]) === raumSort && r[ix.HASTWESort] === '1');
  const avg = (raumSort) => {
    const vals = [];
    let n = 0;
    for (const r of rowsFor(raumSort)) {
      if (!avgYears.includes(Number(r[ix.Stichtagdatjahr]))) continue;
      const v = num(r[ix.HAPreisWohnflaeche]);
      if (v) vals.push(v);
      n += parseCount(r[ix.AnzHA]);
    }
    return { value: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, n, yearsWithValue: vals.length };
  };
  const condoPerM2 = { city: avg(0).value };
  const condoSales = { city: avg(0).n };
  for (const k of kreise) { const a = avg(k * 10); condoPerM2[k] = a.value; condoSales[k] = a.n; }
  for (const q of quartiere) {
    const a = avg(q.id);
    const kv = condoPerM2[q.kreis];
    // shrink toward the Kreis value when fewer than 30 sales over the three years
    let v = a.value;
    if (v !== null && a.n < 30 && kv) v = Math.round((a.n * v + 30 * kv) / (a.n + 30));
    if (v === null) v = kv ?? null;
    condoPerM2[`q${q.id}`] = v;
    condoSales[`q${q.id}`] = a.n;
  }
  const cityRows = rowsFor(0);
  const cityPerM2 = years.map((y) => { const r = cityRows.find((x) => Number(x[ix.Stichtagdatjahr]) === y); return r ? num(r[ix.HAPreisWohnflaeche]) : null; });
  const cityPerFlat = years.map((y) => { const r = cityRows.find((x) => Number(x[ix.Stichtagdatjahr]) === y); return r ? num(r[ix.HAMedianPreis]) : null; });
  return { avgYears, condoPerM2, condoSales, condoHistory: { years, cityPerM2, cityPerFlat } };
}

// ---------------------------------------------------------------- buildings

function classifyBuildings(buildings, quartierFeatures, kreisFeatures, kreise) {
  const { rows, ix } = buildings;
  const qFeats = quartierFeatures.filter((f) => kreise.includes(Number(f.properties.knr)));
  const kFeats = kreisFeatures.filter((f) => kreise.includes(Number(f.properties.name)));
  const bbox = bboxOfCoords(kFeats.map((f) => f.geometry.coordinates));
  const out = [];
  const drops = { status: 0, class: 0, coords: 0, outsideBbox: 0, outsidePolygons: 0, kreisOnlyFallback: 0 };
  for (const r of rows) {
    if (r[ix.GSTAT] !== EXISTING_BUILDING) { drops.status++; continue; }
    const gklas = r[ix.GKLAS];
    const gkat = r[ix.GKAT];
    const residential = RESIDENTIAL_GKLAS.has(gklas) || (gklas === '' && gkat === '1020');
    if (!residential) { drops.class++; continue; }
    const E = num(r[ix.GKODE]);
    const N = num(r[ix.GKODN]);
    if (E === null || N === null) { drops.coords++; continue; }
    const [lon, lat] = lv95ToWgs84(E, N);
    if (!inBbox([lon, lat], bbox)) { drops.outsideBbox++; continue; }
    let q = qFeats.find((f) => pointInGeometry([lon, lat], f.geometry));
    let kreis;
    let quartier;
    if (q) {
      kreis = Number(q.properties.knr);
      quartier = Number(q.properties.qnr);
    } else {
      const k = kFeats.find((f) => pointInGeometry([lon, lat], f.geometry));
      if (!k) { drops.outsidePolygons++; continue; }
      // inside the Kreis but in no Quartier polygon (sliver gap): nearest Quartier centroid of that Kreis
      drops.kreisOnlyFallback++;
      kreis = Number(k.properties.name);
      const cands = qFeats.filter((f) => Number(f.properties.knr) === kreis);
      let best = null;
      let bestD = Infinity;
      for (const f of cands) {
        const b = bboxOfCoords(f.geometry.coordinates);
        const d = Math.hypot((b[0] + b[2]) / 2 - lon, (b[1] + b[3]) / 2 - lat);
        if (d < bestD) { bestD = d; best = f; }
      }
      quartier = Number(best.properties.qnr);
    }
    out.push({
      egid: Number(r[ix.EGID]),
      kreis,
      quartier,
      lon: round6(lon),
      lat: round6(lat),
      year: num(r[ix.GBAUJ]),
      period: num(r[ix.GBAUP]),
      storeys: num(r[ix.GASTW]),
      cls: num(gklas) ?? null,
      cat: num(gkat),
      area: num(r[ix.GAREA]),
      heritage: r[ix.GSCHUTZR] === '1',
      dwellingsRegister: num(r[ix.GANZWHG]),
    });
  }
  return { candidates: out, drops, bbox };
}

function attachFlats(candidates, flats) {
  const { rows, ix } = flats;
  const wanted = new Map(candidates.map((b) => [b.egid, []]));
  const hasStatus = ix.WSTAT !== undefined;
  for (const r of rows) {
    const egid = Number(r[ix.EGID]);
    const list = wanted.get(egid);
    if (!list) continue;
    if (hasStatus && r[ix.WSTAT] !== EXISTING_FLAT) continue;
    list.push(r);
  }
  const kept = [];
  const drops = { noFlats: 0, tooManyMissingArea: 0, noFlatInRange: 0, tooManyFlats: 0 };
  let flatsMissingArea = 0;
  let flatsOutOfRange = 0;
  for (const b of candidates) {
    const list = wanted.get(b.egid);
    if (!list.length) { drops.noFlats++; continue; }
    const withArea = [];
    let missing = 0;
    for (const r of list) {
      const a = num(r[ix.WAREA]);
      if (a === null || a <= 0) { missing++; continue; }
      withArea.push({ r, a });
    }
    flatsMissingArea += missing;
    if (missing * 3 > list.length) { drops.tooManyMissingArea++; continue; }
    const inRange = withArea.filter(({ a }) => a >= MIN_AREA && a <= MAX_AREA);
    flatsOutOfRange += withArea.length - inRange.length;
    if (!inRange.length) { drops.noFlatInRange++; continue; }
    if (inRange.length > MAX_FLATS) { drops.tooManyFlats++; continue; }
    // address: the most frequent street + number among the building's flats
    const addr = new Map();
    for (const { r } of inRange) {
      const key = `${r[ix.STRNAME]}\u0000${r[ix.DEINR]}\u0000${r[ix.DPLZ4]}`;
      addr.set(key, (addr.get(key) || 0) + 1);
    }
    const [street, no, plz] = [...addr.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0].split('\u0000');
    const flatsOut = inRange.map(({ r, a }) => ({
      floor: decodeFloor(r[ix.WSTWK]),
      area: Math.round(a),
      rooms: num(r[ix.WAZIM]),
    })).sort((x, y) => (x.floor ?? -99) - (y.floor ?? -99) || x.area - y.area || (x.rooms ?? 0) - (y.rooms ?? 0));
    kept.push({ ...b, street, no, plz: num(plz), flats: flatsOut });
  }
  return { kept, drops, flatsMissingArea, flatsOutOfRange };
}

/** Deterministic stratified sample: every k-th building per Quartier, after sorting by EGID. */
function sample(buildings, max) {
  const sorted = buildings.slice().sort((a, b) => a.egid - b.egid);
  const byQ = new Map();
  for (const b of sorted) {
    if (!byQ.has(b.quartier)) byQ.set(b.quartier, []);
    byQ.get(b.quartier).push(b);
  }
  const total = sorted.length;
  const before = Object.fromEntries([...byQ.entries()].sort((a, b) => a[0] - b[0]).map(([q, l]) => [q, l.length]));
  if (total <= max) return { picked: sorted, before, after: before };
  // largest-remainder allocation of max over Quartiere
  const qs = [...byQ.keys()].sort((a, b) => a - b);
  const exact = qs.map((q) => (byQ.get(q).length * max) / total);
  const alloc = exact.map((e) => Math.floor(e));
  let rest = max - alloc.reduce((a, b) => a + b, 0);
  const order = qs.map((q, i) => i).sort((i, j) => (exact[j] - alloc[j]) - (exact[i] - alloc[i]) || qs[i] - qs[j]);
  for (const i of order) { if (rest <= 0) break; alloc[i]++; rest--; }
  const picked = [];
  const after = {};
  qs.forEach((q, i) => {
    const list = byQ.get(q);
    const n = Math.min(alloc[i], list.length);
    for (let j = 0; j < n; j++) picked.push(list[Math.floor((j * list.length) / n)]);
    after[q] = n;
  });
  picked.sort((a, b) => a.egid - b.egid);
  return { picked, before, after };
}

// ---------------------------------------------------------------- footprints

async function loadFootprints() {
  const dir = path.join(CACHE_DIR, 'footprints');
  const indexFile = path.join(dir, 'index.json');
  if (!existsSync(indexFile)) return { byEgid: new Map(), info: { available: false, requests: 0, tilesOk: 0, tilesFailed: 0, features: 0, sha256: null } };
  const index = JSON.parse(await readFile(indexFile, 'utf8'));
  const byEgid = new Map();
  let features = 0;
  const hashes = [];
  const files = (await readdir(dir)).filter((f) => /^tile_\d+_\d+\.geojson$/.test(f)).sort();
  for (const f of files) {
    const tile = index.tiles?.[f.replace('.geojson', '')];
    if (!tile || !tile.ok) continue;
    hashes.push(`${f}:${tile.sha256}`);
    const json = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
    for (const feat of json.features || []) {
      features++;
      const egid = Number(feat.properties?.gwr_egid);
      if (!egid) continue;
      const real = feat.properties.status_txt === 'real' ? 1 : 0;
      const area = Number(feat.properties.geometrie_area_fme) || 0;
      const prev = byEgid.get(egid);
      if (!prev || real > prev.real || (real === prev.real && area > prev.area)) byEgid.set(egid, { real, area, geometry: feat.geometry });
    }
  }
  const tiles = Object.values(index.tiles || {});
  return {
    byEgid,
    info: {
      available: true,
      layer: index.layer,
      url: index.url,
      bbox: index.bbox,
      tileMetres: index.tileMetres,
      requests: tiles.length,
      tilesOk: tiles.filter((t) => t.ok).length,
      tilesFailed: tiles.filter((t) => !t.ok).length,
      features,
      distinctEgids: byEgid.size,
      sha256: sha256Hex(hashes.join('\n')),
    },
  };
}

// ---------------------------------------------------------------- main

export async function buildWorld({ kreise = [4, 5], max = 900 } = {}) {
  const buildings = await readCsv(SRC.buildings, ['EGID', 'GKODE', 'GKODN', 'GSTAT', 'GKAT', 'GKLAS', 'GBAUJ', 'GBAUP', 'GAREA', 'GASTW', 'GANZWHG', 'GSCHUTZR']);
  const flats = await readCsv(SRC.flats, ['EGID', 'EWID', 'WSTWK', 'WAREA', 'WAZIM', 'STRNAME', 'DEINR', 'DPLZ4']);
  const rents = await readCsv(SRC.rents, ['StichtagDatJahr', 'RaumeinheitSort', 'GliederungSort', 'GliederungLang', 'ZimmerSort', 'GemeinnuetzigSort', 'EinheitSort', 'PreisartSort', 'qu50']);
  const condos = await readCsv(SRC.condos, ['Stichtagdatjahr', 'HASTWESort', 'RaumSort', 'RaumLang', 'AnzHA', 'HAPreisWohnflaeche', 'HAMedianPreis']);
  const kreisGeo = await readGeo(GEO.kreise);
  const quartierGeo = await readGeo(GEO.quartiere);

  const kreisFeatures = kreisGeo.json.features;
  const quartierFeatures = quartierGeo.json.features;
  const quartiere = quartierFeatures
    .filter((f) => kreise.includes(Number(f.properties.knr)))
    .map((f) => ({ id: Number(f.properties.qnr), name: f.properties.qname, kreis: Number(f.properties.knr) }))
    .sort((a, b) => a.id - b.id);
  if (!quartiere.length) throw new Error('no Quartier polygons for the chosen Kreise');

  const { candidates, drops: bDrops, bbox } = classifyBuildings(buildings, quartierFeatures, kreisFeatures, kreise);
  const { kept, drops: fDrops, flatsMissingArea, flatsOutOfRange } = attachFlats(candidates, flats);
  const { picked, before, after } = sample(kept, max);

  const { byEgid: fpByEgid, info: fpInfo } = await loadFootprints();
  let withFootprint = 0;
  const outBuildings = picked.map((b, i) => {
    const fp = fpByEgid.get(b.egid);
    let footprint = null;
    if (fp) {
      const ring = largestOuterRing(fp.geometry);
      if (ring && ring.length >= 4) {
        footprint = simplifyRing(ring, 16).map(([x, y]) => [round6(x), round6(y)]);
        withFootprint++;
      }
    }
    return {
      id: `b${String(i + 1).padStart(4, '0')}`,
      egid: b.egid,
      street: b.street,
      no: b.no,
      plz: b.plz,
      kreis: b.kreis,
      quartier: b.quartier,
      lon: b.lon,
      lat: b.lat,
      year: b.year,
      period: b.period,
      storeys: b.storeys,
      cls: b.cls,
      area: b.area,
      heritage: b.heritage,
      footprint,
      flats: b.flats,
    };
  });

  const rentStats = buildRentStats(rents, kreise, quartiere.map((q) => q.id));
  const condoStats = buildCondoStats(condos, kreise, quartiere);

  const kreisOutlines = {};
  for (const k of kreise) {
    const f = kreisFeatures.find((x) => Number(x.properties.name) === k);
    if (!f) throw new Error(`Kreis ${k} polygon missing`);
    kreisOutlines[k] = simplifyRing(largestOuterRing(f.geometry), 80).map(([x, y]) => [round6(x), round6(y)]);
  }

  const sources = [buildings, flats, rents, condos].map((s) => ({
    datasetId: s.id,
    resourceUrl: s.meta.resourceUrl || null,
    retrieved: s.meta.retrieved || null,
    bytes: s.meta.bytes || null,
    sha256: s.meta.sha256 || null,
    rows: s.meta.rows,
    licence: s.meta.licence || null,
    header: s.header.join(s.separator),
  })).concat([kreisGeo, quartierGeo].map((g) => ({
    datasetId: g.meta.datasetId || null,
    resourceUrl: g.meta.resourceUrl || null,
    retrieved: g.meta.retrieved || null,
    bytes: g.meta.bytes || null,
    sha256: g.meta.sha256 || null,
    rows: g.meta.rows,
    licence: g.meta.licence || null,
    header: g.meta.header || null,
  })));
  const hashInput = sources.map((s) => `${s.datasetId}:${s.sha256}`).concat(fpInfo.sha256 ? [`footprints:${fpInfo.sha256}`] : []).join('\n');
  const dataVersion = sha256Hex(hashInput).slice(0, 12);

  const world = {
    version: 1,
    built: today(),
    dataVersion,
    kreise,
    bounds: [[round6(bbox[0]), round6(bbox[1])], [round6(bbox[2]), round6(bbox[3])]],
    kreisOutlines,
    quartiere,
    stats: {
      rentYear: rentStats.year,
      rentPerM2: rentStats.rentPerM2,
      rentPerFlat: rentStats.rentPerFlat,
      rentNewLetPerM2: rentStats.rentNewLetPerM2,
      rentNewBuildPerM2: rentStats.rentNewBuildPerM2,
      leaseAgeFactor: rentStats.leaseAgeFactor,
      condoYears: condoStats.avgYears,
      condoPerM2: condoStats.condoPerM2,
      condoSales: condoStats.condoSales,
      condoHistory: condoStats.condoHistory,
      vacancy: VACANCY,
    },
    buildings: outBuildings,
    credits: CREDITS,
  };

  const selection = {
    kreise,
    rules: {
      buildingStatus: EXISTING_BUILDING,
      gklas: [...RESIDENTIAL_GKLAS],
      gkatWhenGklasMissing: '1020',
      flatStatus: EXISTING_FLAT,
      flatArea: [MIN_AREA, MAX_AREA],
      maxFlats: MAX_FLATS,
      maxBuildings: max,
      kreisMembership: 'point in polygon of the LV95 to WGS84 converted register point against the Statistische Quartiere polygons (Kreis from knr); Kreis polygon as fallback',
    },
    registerRows: { buildings: buildings.rows.length, flats: flats.rows.length },
    buildingDrops: bDrops,
    candidatesInKreise: candidates.length,
    flatDrops: fDrops,
    flatsMissingArea,
    flatsOutOfRange,
    eligible: kept.length,
    perQuartierBefore: before,
    perQuartierAfter: after,
    picked: picked.length,
    flatsPicked: outBuildings.reduce((s, b) => s + b.flats.length, 0),
    withFootprint,
  };

  const manifest = {
    built: today(),
    dataVersion,
    licenceNote: 'All sources are published by Stadt Zürich under Creative Commons CC0 1.0 (CKAN licence id cc-zero).',
    sources,
    footprints: fpInfo,
    selection,
    credits: CREDITS,
  };

  await mkdir(DATA_DIR, { recursive: true });
  const worldText = JSON.stringify(world);
  await writeFile(path.join(DATA_DIR, 'world.json'), worldText);
  await writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`register rows: ${buildings.rows.length} buildings, ${flats.rows.length} flats`);
  console.log(`building drops: ${JSON.stringify(bDrops)}`);
  console.log(`candidates in Kreis ${kreise.join('+')}: ${candidates.length}; flat drops ${JSON.stringify(fDrops)}; eligible ${kept.length}`);
  console.log(`per Quartier before: ${JSON.stringify(before)}`);
  console.log(`per Quartier after:  ${JSON.stringify(after)}`);
  console.log(`picked ${picked.length} buildings, ${selection.flatsPicked} flats, ${withFootprint} with footprint`);
  console.log(`rentPerM2: ${JSON.stringify(rentStats.rentPerM2)}`);
  console.log(`rentNewLetPerM2.city: ${JSON.stringify(rentStats.rentNewLetPerM2.city)}`);
  console.log(`leaseAgeFactor: ${JSON.stringify(rentStats.leaseAgeFactor)}`);
  console.log(`condoPerM2: ${JSON.stringify(condoStats.condoPerM2)} sales ${JSON.stringify(condoStats.condoSales)}`);
  console.log(`world.json ${Buffer.byteLength(worldText)} bytes, dataVersion ${dataVersion}`);
  return { world, manifest };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const ki = args.indexOf('--kreise');
  const mi = args.indexOf('--max');
  await buildWorld({
    kreise: ki >= 0 ? args[ki + 1].split(',').map(Number) : [4, 5],
    max: mi >= 0 ? Number(args[mi + 1]) : 900,
  });
}
