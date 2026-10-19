// Building footprints for Kreis 4 and 5 from the city survey WFS, tiled.
//
//   node scripts/data/fetch-footprints.mjs [--force] [--kreise 4,5]
//
// Layer av_bo_allegebaeude_a_v of the Amtliche Vermessung WFS carries gwr_egid,
// so footprints join to the register by EGID. The bounding box of the chosen
// Kreis polygons (from scripts/.cache/stadtkreise.geojson, see fetch-geo.mjs)
// is split into tiles of about 500 m, one GetFeature per tile, cached as
// scripts/.cache/footprints/tile_<row>_<col>.geojson. A request log is kept in
// scripts/.cache/footprints/index.json for the manifest.
//
// BBOX axis order for EPSG:4326 on this server is lon,lat (tested 2026-10-18:
// lat,lon returned 0 features, lon,lat returned 191 features in Zurich).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CACHE_DIR, fetchText, sha256Hex, today } from './lib/net.mjs';
import { bboxOfCoords } from './lib/geo.mjs';

export const WFS_URL = 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Amtliche_Vermessung_Stadt_Zuerich';
export const WFS_LAYER = 'av_bo_allegebaeude_a_v';
export const FOOTPRINT_DIR = path.join(CACHE_DIR, 'footprints');
export const INDEX_FILE = path.join(FOOTPRINT_DIR, 'index.json');

const TILE_M = 500;
const PAD_DEG = 0.0005; // about 40 m, so footprints on the boundary are not cut

export function tileGrid(bbox) {
  const [minLon, minLat, maxLon, maxLat] = [bbox[0] - PAD_DEG, bbox[1] - PAD_DEG, bbox[2] + PAD_DEG, bbox[3] + PAD_DEG];
  const midLat = (minLat + maxLat) / 2;
  const dLat = TILE_M / 111320;
  const dLon = TILE_M / (111320 * Math.cos((midLat * Math.PI) / 180));
  const rows = Math.ceil((maxLat - minLat) / dLat);
  const cols = Math.ceil((maxLon - minLon) / dLon);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        id: `tile_${r}_${c}`,
        bbox: [
          +(minLon + c * dLon).toFixed(6),
          +(minLat + r * dLat).toFixed(6),
          +Math.min(maxLon, minLon + (c + 1) * dLon).toFixed(6),
          +Math.min(maxLat, minLat + (r + 1) * dLat).toFixed(6),
        ],
      });
    }
  }
  return { tiles, rows, cols };
}

function tileUrl(bbox) {
  const q = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '1.1.0',
    REQUEST: 'GetFeature',
    TYPENAME: WFS_LAYER,
    SRSNAME: 'EPSG:4326',
    OUTPUTFORMAT: 'GeoJSON',
    BBOX: `${bbox.join(',')},EPSG:4326`,
  });
  return `${WFS_URL}?${q}`;
}

export async function fetchFootprints({ force = false, kreise = [4, 5], deadlineMs = 20 * 60 * 1000 } = {}) {
  const kreisFile = path.join(CACHE_DIR, 'stadtkreise.geojson');
  if (!existsSync(kreisFile)) throw new Error('run fetch-geo.mjs first (stadtkreise.geojson missing)');
  const kreisJson = JSON.parse(await readFile(kreisFile, 'utf8'));
  const wanted = kreisJson.features.filter((f) => kreise.includes(Number(f.properties.name)));
  if (wanted.length !== kreise.length) throw new Error(`Kreis polygons found: ${wanted.map((f) => f.properties.name)}`);
  const bbox = bboxOfCoords(wanted.map((f) => f.geometry.coordinates));
  const { tiles, rows, cols } = tileGrid(bbox);
  await mkdir(FOOTPRINT_DIR, { recursive: true });
  let index = { layer: WFS_LAYER, url: WFS_URL, kreise, bbox, rows, cols, tileMetres: TILE_M, tiles: {} };
  if (!force && existsSync(INDEX_FILE)) {
    try { index = { ...index, ...JSON.parse(await readFile(INDEX_FILE, 'utf8')) }; } catch { /* rebuild */ }
  }
  console.log(`bbox ${bbox.map((v) => v.toFixed(4)).join(', ')} -> ${tiles.length} tiles (${rows} x ${cols})`);
  const start = Date.now();
  let requests = 0;
  let failed = 0;
  for (const t of tiles) {
    const file = path.join(FOOTPRINT_DIR, `${t.id}.geojson`);
    if (!force && index.tiles[t.id] && index.tiles[t.id].ok && existsSync(file)) continue;
    if (Date.now() - start > deadlineMs) {
      console.log('deadline reached, stopping; rerun to continue');
      break;
    }
    const url = tileUrl(t.bbox);
    requests++;
    try {
      const text = await fetchText(url);
      const json = JSON.parse(text);
      if (json.type !== 'FeatureCollection') throw new Error('not a FeatureCollection');
      await writeFile(file, text);
      index.tiles[t.id] = { ok: true, bbox: t.bbox, features: json.features.length, bytes: Buffer.byteLength(text), sha256: sha256Hex(text), retrieved: today() };
      console.log(`${t.id}: ${json.features.length} features, ${Buffer.byteLength(text)} bytes`);
    } catch (err) {
      failed++;
      index.tiles[t.id] = { ok: false, bbox: t.bbox, error: String(err.message || err), retrieved: today() };
      console.log(`${t.id}: FAILED ${err.message || err}`);
    }
    await writeFile(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
  }
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
  const okTiles = Object.values(index.tiles).filter((t) => t.ok);
  const features = okTiles.reduce((s, t) => s + t.features, 0);
  console.log(`done: ${requests} requests this run, ${failed} failed, ${okTiles.length}/${tiles.length} tiles cached, ${features} features in cache`);
  return index;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const ki = args.indexOf('--kreise');
  const kreise = ki >= 0 ? args[ki + 1].split(',').map(Number) : [4, 5];
  await fetchFootprints({ force: args.includes('--force'), kreise });
}
