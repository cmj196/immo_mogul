// Checks data/world.json and exits non-zero on any failure.
//
//   node scripts/data/verify-world.mjs
//
// Fails when: the file is missing, an EGID is duplicated, a building has no
// flats, a coordinate lies outside the bounds padded by 0.01 degrees, a flat
// area lies outside 15 to 300 m², a rent or price stat for a chosen Kreis is
// missing or outside a sane range (rent 15 to 60 CHF/m², price 8,000 to 35,000
// CHF/m²), or the file is over 1.5 MB. Prints a summary.

import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './lib/net.mjs';

const MAX_BYTES = 1.5 * 1024 * 1024;
const PAD = 0.01;

const problems = [];
const fail = (msg) => problems.push(msg);

const file = path.join(DATA_DIR, 'world.json');
if (!existsSync(file)) {
  console.error(`FAIL: ${path.relative(process.cwd(), file)} missing`);
  process.exit(1);
}
const { size } = await stat(file);
const world = JSON.parse(await readFile(file, 'utf8'));

if (size > MAX_BYTES) fail(`file is ${size} bytes, over ${MAX_BYTES}`);
if (!Array.isArray(world.buildings) || !world.buildings.length) fail('no buildings');
if (!Array.isArray(world.kreise) || !world.kreise.length) fail('no kreise');

const [[minLon, minLat], [maxLon, maxLat]] = world.bounds || [[NaN, NaN], [NaN, NaN]];
if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) fail('bounds missing or not numeric');

const seen = new Set();
const perQuartier = {};
let flatCount = 0;
let withFootprint = 0;
for (const b of world.buildings || []) {
  if (seen.has(b.egid)) fail(`duplicate EGID ${b.egid}`);
  seen.add(b.egid);
  if (!Array.isArray(b.flats) || !b.flats.length) fail(`building ${b.id} (EGID ${b.egid}) has no flats`);
  const inside = (lon, lat) => lon >= minLon - PAD && lon <= maxLon + PAD && lat >= minLat - PAD && lat <= maxLat + PAD;
  if (!inside(b.lon, b.lat)) fail(`building ${b.id} at ${b.lon},${b.lat} outside bounds`);
  if (!world.kreise.includes(b.kreis)) fail(`building ${b.id} in Kreis ${b.kreis}, not in ${world.kreise}`);
  if (b.footprint) {
    withFootprint++;
    if (b.footprint.length > 16) fail(`building ${b.id} footprint has ${b.footprint.length} points`);
    for (const [lon, lat] of b.footprint) if (!inside(lon, lat)) fail(`building ${b.id} footprint point outside bounds`);
  }
  for (const f of b.flats || []) {
    flatCount++;
    if (!(f.area >= 15 && f.area <= 300)) fail(`building ${b.id} flat area ${f.area} outside 15 to 300`);
  }
  perQuartier[b.quartier] = (perQuartier[b.quartier] || 0) + 1;
}

for (const k of world.kreise) {
  const outline = world.kreisOutlines?.[k];
  if (!outline || outline.length < 3) fail(`kreisOutlines[${k}] missing`);
  else if (outline.length > 80) fail(`kreisOutlines[${k}] has ${outline.length} points`);
  const rent = world.stats?.rentPerM2?.[k];
  for (const rooms of ['2', '3', '4']) {
    const v = rent?.[rooms];
    if (v === null || v === undefined) fail(`rentPerM2[${k}][${rooms}] missing`);
    else if (!(v >= 15 && v <= 60)) fail(`rentPerM2[${k}][${rooms}] = ${v} outside 15 to 60`);
  }
  const price = world.stats?.condoPerM2?.[k];
  if (price === null || price === undefined) fail(`condoPerM2[${k}] missing`);
  else if (!(price >= 8000 && price <= 35000)) fail(`condoPerM2[${k}] = ${price} outside 8000 to 35000`);
}
for (const q of world.quartiere || []) {
  const price = world.stats?.condoPerM2?.[`q${q.id}`];
  if (price !== null && price !== undefined && !(price >= 8000 && price <= 35000)) fail(`condoPerM2[q${q.id}] = ${price} outside 8000 to 35000`);
}
const laf = world.stats?.leaseAgeFactor || {};
for (const key of ['y3to10', 'y11to20', 'over20']) if (!(laf[key] > 0.3 && laf[key] < 1.05)) fail(`leaseAgeFactor.${key} = ${laf[key]} implausible`);

console.log(`world.json: ${size} bytes (limit ${MAX_BYTES}), dataVersion ${world.dataVersion}, built ${world.built}`);
console.log(`buildings: ${world.buildings.length}, flats: ${flatCount}, with footprint: ${withFootprint} (${Math.round((100 * withFootprint) / world.buildings.length)}%)`);
const names = Object.fromEntries((world.quartiere || []).map((q) => [q.id, q.name]));
for (const q of Object.keys(perQuartier).sort()) console.log(`  Quartier ${q} ${names[q] || ''}: ${perQuartier[q]} buildings`);
if (problems.length) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 50)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('OK');
