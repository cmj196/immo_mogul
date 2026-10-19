// Kreis and Quartier polygons to the cache as GeoJSON (WGS84).
//
//   node scripts/data/fetch-geo.mjs [--force]
//
// The CKAN datasets geo_stadtkreise and geo_statistische_quartiere list a
// "geojson_link" download, but that URL answers with an HTML page (checked
// 2026-10-18). The same datasets list a WFS, which serves GeoJSON directly, so
// the polygons come from there. The WFS URL is still read from package_show.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CACHE_DIR, fetchJson, fetchText, readMeta, sha256Hex, today, writeMeta } from './lib/net.mjs';

const CKAN = 'https://data.stadt-zuerich.ch/api/3/action/package_show?id=';

export const GEO_LAYERS = [
  { datasetId: 'geo_stadtkreise', typeName: 'adm_stadtkreise_a', file: 'stadtkreise.geojson' },
  { datasetId: 'geo_statistische_quartiere', typeName: 'adm_statistische_quartiere_v', file: 'statistische_quartiere.geojson' },
];

function wfsBase(resourceUrl) {
  const u = new URL(resourceUrl);
  return `${u.origin}${u.pathname}`;
}

export async function fetchGeo({ force = false } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const out = [];
  for (const layer of GEO_LAYERS) {
    const file = path.join(CACHE_DIR, layer.file);
    const existing = await readMeta(file);
    if (!force && existing && existsSync(file)) {
      console.log(`cached  ${layer.datasetId} (${existing.features} features, ${existing.retrieved})`);
      out.push(existing);
      continue;
    }
    const pkg = await fetchJson(CKAN + layer.datasetId);
    if (!pkg.success) throw new Error(`package_show failed for ${layer.datasetId}`);
    const wfs = (pkg.result.resources || []).find((r) => String(r.format).toUpperCase() === 'WFS');
    if (!wfs) throw new Error(`${layer.datasetId}: no WFS resource listed`);
    const url = `${wfsBase(wfs.url)}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${layer.typeName}&SRSNAME=EPSG:4326&OUTPUTFORMAT=GeoJSON`;
    console.log(`fetch   ${layer.datasetId} <- ${url}`);
    const text = await fetchText(url);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${layer.datasetId}: WFS did not return JSON. First bytes: ${text.slice(0, 200)}`);
    }
    if (json.type !== 'FeatureCollection' || !Array.isArray(json.features) || !json.features.length) {
      throw new Error(`${layer.datasetId}: no features in WFS answer`);
    }
    await writeFile(file, text);
    const meta = {
      datasetId: layer.datasetId,
      title: pkg.result.title || null,
      typeName: layer.typeName,
      resourceUrl: url,
      retrieved: today(),
      bytes: Buffer.byteLength(text),
      sha256: sha256Hex(text),
      features: json.features.length,
      licence: `${pkg.result.license_title || ''} (${pkg.result.license_id || ''})`.trim(),
      header: Object.keys(json.features[0].properties || {}).join(','),
    };
    await writeMeta(file, meta);
    console.log(`saved   ${layer.datasetId} ${meta.features} features, ${meta.bytes} bytes`);
    out.push(meta);
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await fetchGeo({ force: process.argv.includes('--force') });
