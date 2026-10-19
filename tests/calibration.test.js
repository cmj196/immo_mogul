// Calibration against the city statistics in data/world.json: listings generated in the first 36
// months of 20 seeds must land near the rent and price levels the world carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, realWorld, play } from './helpers.mjs';

const SEEDS = 20;
const MONTHS = 36;

function collect(world) {
  const by = {};
  const add = (k, v) => { (by[k] = by[k] || []).push(v); };
  const out = { units: 0, vacant: 0, listings: 0, buildings: 0, buildingsOverCondoSum: 0, badBuilding: 0, badFlat: 0, rivalTaken: 0, expired: 0, by };
  for (let seed = 0; seed < SEEDS; seed++) {
    let s = E.createCareer({ seed: `cal${seed}`, world });
    for (let m = 0; m < MONTHS; m++) {
      const r = play(s, world, { type: 'endMonth' });
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'listingGone' && e.why === 'rival') out.rivalTaken += 1;
        if (e.type === 'listingGone' && e.why === 'expired') out.expired += 1;
      }
      const ev = r.events.find((e) => e.type === 'listings');
      if (!ev) continue;
      for (const id of ev.ids) {
        const l = s.listings[id];
        out.listings += 1;
        const b = world.byId.get(l.buildingId);
        if (!b) { out.badBuilding += 1; continue; }
        let condoSum = 0;
        for (const u of l.units) {
          const f = b.flats[u.flatIdx];
          if (!f) { out.badFlat += 1; continue; }
          out.units += 1;
          if (!u.lease) out.vacant += 1;
          condoSum += E.condoValue(s, world, b, f, u.condition);
          if (f.rooms >= 2.5 && f.rooms <= 3.5 && u.lease) {
            add(`inplace${b.kreis}`, u.lease.rent / f.area);
            if (s.month - u.lease.since < 36) add(`fresh${b.kreis}`, u.lease.rent / f.area);
          }
        }
        if (l.kind === 'condo') {
          const f = b.flats[l.units[0].flatIdx];
          add(`ask${b.kreis}`, l.ask / f.area);
          add(`premium${b.kreis}`, l.ask / l.fair - 1);
        } else {
          out.buildings += 1;
          if (l.ask >= condoSum) out.buildingsOverCondoSum += 1;
          add('buildingToCondoSum', l.ask / condoSum);
        }
      }
    }
  }
  return out;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test(`calibration (real world): listings of ${SEEDS} seeds x ${MONTHS} months match the city statistics`, () => {
  const world = realWorld();
  const c = collect(world);
  const st = world.stats;
  assert.ok(c.listings > 1500, `listings ${c.listings}`);
  assert.equal(c.badBuilding, 0, 'every listing sits in a building of the world');
  assert.equal(c.badFlat, 0, 'every unit flatIdx is valid');

  // In-place rent of 3-room flats (all lease ages, as the survey mixes them) against the Kreis median
  // of existing private leases, stats.rentPerM2[kreis]['3']. The generated stock carries lease-age
  // discounts, so it is expected to sit a little under the median.
  const cityNewRatio = st.rentNewLetPerM2.city['3'] / st.rentPerM2.city['3'];
  for (const k of world.kreise) {
    const inPlace = c.by[`inplace${k}`];
    assert.ok(inPlace.length > 300, `Kreis ${k}: ${inPlace.length} 3-room leases`);
    const ratio = mean(inPlace) / st.rentPerM2[k]['3'];
    assert.ok(Math.abs(ratio - 1) <= 0.12, `Kreis ${k}: in-place 3-room rent ${mean(inPlace).toFixed(2)}/m² vs stat ${st.rentPerM2[k]['3']} (ratio ${ratio.toFixed(3)})`);
    // The fresh leases (up to 2 years) against the new-let figure the world derives for the Kreis
    // (Kreis median x city new-let ratio, since the survey has no Kreis new-let row).
    const fresh = c.by[`fresh${k}`];
    const newLet = st.rentPerM2[k]['3'] * cityNewRatio;
    const fr = mean(fresh) / newLet;
    assert.ok(Math.abs(fr - 1) <= 0.12, `Kreis ${k}: fresh-lease rent ${mean(fresh).toFixed(2)}/m² vs new-let ${newLet.toFixed(2)} (ratio ${fr.toFixed(3)})`);
  }

  // Condo asking prices per m² against the Kreis condo median times the average asking premium.
  for (const k of world.kreise) {
    const ask = c.by[`ask${k}`];
    const prem = mean(c.by[`premium${k}`]);
    assert.ok(ask.length > 100, `Kreis ${k}: ${ask.length} condo listings`);
    assert.ok(prem >= 0 && prem <= 0.15, `premium ${prem}`);
    const ratio = mean(ask) / (st.condoPerM2[k] * (1 + prem));
    assert.ok(Math.abs(ratio - 1) <= 0.15, `Kreis ${k}: ask ${mean(ask).toFixed(0)}/m² vs ${st.condoPerM2[k]} x ${(1 + prem).toFixed(3)} (ratio ${ratio.toFixed(3)})`);
  }

  // Vacant units in listings
  const vacantShare = c.vacant / c.units;
  assert.ok(vacantShare >= 0.03 && vacantShare <= 0.20, `vacant share ${vacantShare.toFixed(3)}`);

  // Whole buildings price below the sum of their condo values
  assert.ok(c.buildings > 100, `buildings ${c.buildings}`);
  assert.equal(c.buildingsOverCondoSum, 0);
  assert.ok(Math.max(...c.by.buildingToCondoSum) < 1);
  assert.ok(mean(c.by.buildingToCondoSum) > 0.35 && mean(c.by.buildingToCondoSum) < 0.9, `building/condo-sum ${mean(c.by.buildingToCondoSum).toFixed(3)}`);

  // Rivals take some listings but leave the player a market
  const rivalShare = c.rivalTaken / c.listings;
  assert.ok(rivalShare > 0.05 && rivalShare < 0.6, `rivals took ${(rivalShare * 100).toFixed(1)}% of listings`);
});

test('calibration (real world): the world is consistent and the stats the engine needs are present', () => {
  const world = realWorld();
  assert.ok(world.buildings.length > 500);
  assert.deepEqual(world.kreise, [4, 5]);
  for (const k of world.kreise) {
    assert.ok(world.stats.rentPerM2[String(k)]['3'] > 20);
    assert.ok(world.stats.condoPerM2[String(k)] > 10_000);
  }
  for (const b of world.buildings) {
    assert.ok(world.kreise.includes(b.kreis), b.id);
    assert.ok(b.flats.length >= 1, b.id);
    assert.ok(world.byId.get(b.id) === b);
    for (const f of b.flats) {
      assert.ok(f.area > 10 && f.area < 500, `${b.id} area ${f.area}`);
      assert.ok(f.rooms >= 1 && f.rooms <= 10, `${b.id} rooms ${f.rooms}`);
    }
    assert.ok(E.rentPerM2(world, b, 3) > 15);
    assert.ok(E.newLetPerM2(world, b, 3) >= E.rentPerM2(world, b, 3));
    assert.ok(E.condoPerM2(world, b) > 10_000);
  }
});
