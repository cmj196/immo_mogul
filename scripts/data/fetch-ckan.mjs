// Download one Open Data Zürich CSV resource into scripts/.cache/<datasetId>.csv.
//
//   node scripts/data/fetch-ckan.mjs <datasetId> [--force]
//
// The resource URL is resolved through the CKAN API on every run, because the
// download link redirects twice to a signed storage link that expires after 60 s.
// A .meta.json next to the file records the URL, date, sha256, bytes and licence.
// Nothing is downloaded again while the cache file and its meta exist.

import { existsSync } from 'node:fs';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CACHE_DIR, downloadToFile, fetchJson, firstLine, readMeta, today, writeMeta } from './lib/net.mjs';

const CKAN = 'https://data.stadt-zuerich.ch/api/3/action/package_show?id=';

export async function fetchCkan(datasetId, { force = false } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${datasetId}.csv`);
  const existing = await readMeta(file);
  if (!force && existing && existsSync(file)) {
    const { size } = await stat(file);
    if (size === existing.bytes) {
      console.log(`cached  ${datasetId} (${size} bytes, ${existing.retrieved})`);
      return existing;
    }
  }
  const pkg = await fetchJson(CKAN + encodeURIComponent(datasetId));
  if (!pkg.success) throw new Error(`package_show failed for ${datasetId}`);
  const resources = pkg.result.resources || [];
  const csv = resources.find((r) => String(r.format).toUpperCase() === 'CSV' && /^https?:/.test(r.url));
  if (!csv) throw new Error(`${datasetId}: no CSV resource. Formats: ${resources.map((r) => r.format).join(', ')}`);
  console.log(`fetch   ${datasetId} <- ${csv.url}`);
  const dl = await downloadToFile(csv.url, file);
  const header = await firstLine(file);
  const meta = {
    datasetId,
    title: pkg.result.title || null,
    resourceName: csv.name || null,
    resourceUrl: csv.url,
    finalUrl: dl.finalUrl,
    retrieved: today(),
    bytes: dl.bytes,
    sha256: dl.sha256,
    licence: `${pkg.result.license_title || ''} (${pkg.result.license_id || ''})`.trim(),
    licenceUrl: pkg.result.license_url || null,
    header,
    datasetModified: pkg.result.metadata_modified || null,
  };
  await writeMeta(file, meta);
  console.log(`saved   ${datasetId} ${dl.bytes} bytes sha256 ${dl.sha256.slice(0, 12)}`);
  return meta;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter((a) => !a.startsWith('--'));
  if (!ids.length) {
    console.error('usage: node scripts/data/fetch-ckan.mjs <datasetId> [more ids] [--force]');
    process.exit(2);
  }
  for (const id of ids) await fetchCkan(id, { force });
}
