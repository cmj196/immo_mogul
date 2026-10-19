// The read-only world: real buildings and flats from the register, rent and price levels from the
// city statistics. Loaded once, never saved. prepareWorld() adds lookups; fixtureWorld() gives a
// small synthetic world for tests so they do not depend on the data build.

import { rule } from '../data/rules.js';

export function prepareWorld(json) {
  const byId = new Map();
  for (const b of json.buildings) {
    b.flats.forEach((f, i) => { f.idx = i; });
    b.totalArea = b.flats.reduce((s, f) => s + f.area, 0);
    byId.set(b.id, b);
  }
  const quartierName = new Map((json.quartiere || []).map((q) => [q.id, q.name]));
  return { ...json, byId, quartierName };
}

export function buildingOf(world, id) {
  const b = world.byId.get(id);
  if (!b) throw new Error(`unknown building ${id}`);
  return b;
}

export function addressOf(b) {
  return `${b.street} ${b.no}`;
}

export function quartierOf(world, b) {
  return world.quartierName.get(b.quartier) || `Quartier ${b.quartier}`;
}

function roomKey(rooms) {
  if (rooms <= 2) return '2';
  if (rooms < 4) return '3';
  return '4';
}

function roomAdjust(rooms) {
  if (rooms <= 1.5) return 1.12;   // small flats rent higher per m²
  if (rooms >= 5) return 0.95;
  return 1;
}

function lookup(table, keys, roomK) {
  for (const k of keys) {
    const row = table?.[k];
    if (row && Number.isFinite(row[roomK]) && row[roomK] > 0) return row[roomK];
  }
  return null;
}

// Median net rent of existing leases, CHF per m² per month, for this building and room count.
export function rentPerM2(world, b, rooms) {
  const rk = roomKey(rooms);
  const t = world.stats.rentPerM2;
  const kreisRoom = lookup(t, [String(b.kreis), 'city'], rk);
  if (kreisRoom === null) throw new Error(`no rent stat for building ${b.id}`);
  // The survey gives Quartier medians only for all room counts together: scale the Kreis
  // room figure by the Quartier's position inside its Kreis.
  const q = t[`q${b.quartier}`];
  const k = t[String(b.kreis)];
  let v = kreisRoom;
  if (q && k && Number.isFinite(q.all) && Number.isFinite(k.all) && k.all > 0) v = kreisRoom * (q.all / k.all);
  return v * roomAdjust(rooms);
}

// Rent for a new tenancy in an existing building, CHF per m² per month.
export function newLetPerM2(world, b, rooms) {
  const rk = roomKey(rooms);
  const direct = lookup(world.stats.rentNewLetPerM2, [`q${b.quartier}`, String(b.kreis)], rk);
  if (direct !== null) return direct * roomAdjust(rooms);
  const city = lookup(world.stats.rentNewLetPerM2, ['city'], rk);
  const cityAll = lookup(world.stats.rentPerM2, ['city'], rk);
  const ratio = city && cityAll ? city / cityAll : 1.15;
  return rentPerM2(world, b, rooms) * ratio;
}

// Median condo price, CHF per m² of living area, for this building's Quartier (shrunk), Kreis or city.
export function condoPerM2(world, b) {
  const t = world.stats.condoPerM2 || {};
  for (const k of [`q${b.quartier}`, String(b.kreis), 'city']) {
    if (Number.isFinite(t[k]) && t[k] > 0) return t[k];
  }
  throw new Error(`no condo price stat for building ${b.id}`);
}

export function capRateBps(b) {
  const t = rule('capRateBps');
  return t[b.kreis] ?? 290;
}

// Period factor on price: Altbau in these Kreise is sought after, post-war stock less so.
export function periodFactor(b) {
  const y = b.year || 1950;
  if (y < 1930) return 1.0;
  if (y < 1975) return 0.93;
  if (y < 2000) return 0.95;
  return 1.06;
}

// Starting condition band from the build year: older stock is more often worn, newer rarely.
export function conditionBand(b) {
  const y = b.year || 1950;
  if (y >= 2010) return [80, 98];
  if (y >= 1990) return [60, 90];
  if (y >= 1960) return [40, 85];
  return [35, 85];
}

export function flatLabel(flat) {
  const floor = flat.floor === 0 ? 'ground floor' : flat.floor < 0 ? 'basement' : `${ordinal(flat.floor)} floor`;
  return `${flat.rooms} rooms, ${flat.area} m², ${floor}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function vacancyOf(world, kreis) {
  const t = world.stats.vacancy || {};
  return t[String(kreis)] ?? t.city ?? rule('vacancyCity');
}

export async function loadWorld(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`world: ${res.status} ${res.statusText}`);
  return prepareWorld(await res.json());
}

// A small synthetic world for tests: eight buildings in Kreis 4 and 5 with plausible flats and the
// October 2026 statistics from the research note. Not real addresses.
export function fixtureWorld() {
  const flats = (spec) => spec.map(([floor, area, rooms]) => ({ floor, area, rooms }));
  const buildings = [
    { id: 'b1', egid: 1, street: 'Teststrasse', no: '1', plz: 8004, kreis: 4, quartier: 41, lon: 8.525, lat: 47.375, year: 1905, storeys: 5, cls: 1122, area: 220, footprint: null, flats: flats([[0, 55, 2], [1, 72, 3], [2, 72, 3], [3, 72, 3], [4, 95, 4]]) },
    { id: 'b2', egid: 2, street: 'Teststrasse', no: '2', plz: 8004, kreis: 4, quartier: 42, lon: 8.528, lat: 47.376, year: 1962, storeys: 4, cls: 1122, area: 300, footprint: null, flats: flats([[0, 48, 2], [0, 48, 2], [1, 65, 3], [1, 65, 3], [2, 65, 3], [2, 65, 3], [3, 80, 4], [3, 80, 4]]) },
    { id: 'b3', egid: 3, street: 'Testgasse', no: '3', plz: 8004, kreis: 4, quartier: 44, lon: 8.52, lat: 47.378, year: 1928, storeys: 3, cls: 1121, area: 150, footprint: null, flats: flats([[0, 90, 4], [1, 90, 4]]) },
    { id: 'b4', egid: 4, street: 'Testweg', no: '4', plz: 8005, kreis: 5, quartier: 51, lon: 8.53, lat: 47.385, year: 1998, storeys: 6, cls: 1122, area: 400, footprint: null, flats: flats([[0, 60, 2], [1, 85, 3], [2, 85, 3], [3, 85, 3], [4, 110, 4], [5, 130, 5]]) },
    { id: 'b5', egid: 5, street: 'Testplatz', no: '5', plz: 8005, kreis: 5, quartier: 52, lon: 8.515, lat: 47.39, year: 2014, storeys: 7, cls: 1122, area: 500, footprint: null, flats: flats([[1, 70, 2.5], [2, 70, 2.5], [3, 95, 3.5], [4, 95, 3.5], [5, 120, 4.5]]) },
    { id: 'b6', egid: 6, street: 'Testring', no: '6', plz: 8005, kreis: 5, quartier: 51, lon: 8.52, lat: 47.388, year: 1912, storeys: 4, cls: 1122, area: 180, footprint: null, flats: flats([[0, 58, 2], [1, 76, 3], [2, 76, 3], [3, 76, 3]]) },
    { id: 'b7', egid: 7, street: 'Testallee', no: '7', plz: 8004, kreis: 4, quartier: 42, lon: 8.53, lat: 47.374, year: 1975, storeys: 5, cls: 1122, area: 350, footprint: null, flats: flats([[0, 50, 2], [1, 70, 3], [1, 70, 3], [2, 70, 3], [2, 70, 3], [3, 70, 3], [3, 70, 3], [4, 100, 4]]) },
    { id: 'b8', egid: 8, street: 'Testhof', no: '8', plz: 8004, kreis: 4, quartier: 41, lon: 8.522, lat: 47.372, year: 1890, storeys: 3, cls: 1121, area: 120, footprint: null, flats: flats([[0, 68, 3], [1, 68, 3], [2, 40, 1]]) },
  ];
  return prepareWorld({
    version: 1,
    built: '2026-10-18',
    dataVersion: 'fixture',
    kreise: [4, 5],
    bounds: [[8.51, 47.37], [8.54, 47.395]],
    kreisOutlines: {},
    quartiere: [{ id: 41, name: 'Werd', kreis: 4 }, { id: 42, name: 'Langstrasse', kreis: 4 }, { id: 44, name: 'Hard', kreis: 4 }, { id: 51, name: 'Gewerbeschule', kreis: 5 }, { id: 52, name: 'Escher Wyss', kreis: 5 }],
    stats: {
      rentPerM2: { city: { 2: 29.5, 3: 26.5, 4: 25.0 }, 4: { 2: 32.0, 3: 29.4, 4: 27.5 }, 5: { 2: 31.5, 3: 28.8, 4: 27.0 } },
      rentNewLetPerM2: { city: { 2: 33.5, 3: 30.5, 4: 28.8 } },
      leaseAgeFactor: { upTo2: 1.0, y3to10: 0.90, y11to20: 0.76, over20: 0.62 },
      condoPerM2: { city: 16600, 4: 15800, 5: 19900 },
      condoHistory: { years: [2009, 2015, 2020, 2025], cityPerM2: [7738, 11015, 13100, 17646] },
      vacancy: { city: 0.00106, 4: 0.00121, 5: 0.00045 },
    },
    buildings,
    credits: ['fixture'],
  });
}
