// Quick manual run of the engine: buys one condo, then plays a few years with a simple policy.
// node scripts/smoke.mjs [--real]
import { readFileSync } from 'node:fs';
import * as E from '../src/engine/index.js';

const useReal = process.argv.includes('--real');
const world = useReal ? E.prepareWorld(JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'))) : E.fixtureWorld();
let s = E.createCareer({ seed: process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'smoke', world, difficulty: 'normal' });
console.log('start', E.chf(s.player.cash), 'listings', Object.keys(s.listings).length);
let r = E.applyAction(s, world, { type: 'endMonth' });
if (r.error) throw new Error(r.error);
s = r.state;
console.log('month', s.month);
for (const l of Object.values(s.listings)) console.log('  ', `${l.title} ask ${l.ask} fair ${l.fair} rent ${E.listingRentMonth(l)}/mo seller ${l.seller.type} units ${l.units.length}`);
const condos = Object.values(s.listings).filter((l) => l.kind === 'condo').sort((a, b) => a.ask - b.ask);
const l = condos[0];
if (l) {
  r = E.applyAction(s, world, { type: 'makeOffer', listingId: l.id, price: Math.round(l.ask * 0.9) });
  console.log(r.error, r.events.map((e) => e.text).filter(Boolean));
  s = r.state;
  let guard = 0;
  while (s.negotiation && !s.negotiation.closed && guard++ < 5) {
    const price = Math.round((s.negotiation.price + (E.lastOfferBy(s.negotiation, 'player') || 0)) / 2);
    r = E.applyAction(s, world, { type: 'counterOffer', price });
    console.log(r.error, r.events.map((e) => e.text).filter(Boolean));
    if (r.error) { r = E.applyAction(s, world, { type: 'acceptOffer' }); console.log('accept', r.error, r.events.map((e) => e.text)); }
    s = r.state;
  }
  if (s.purchase) {
    for (const bankId of E.BANK_IDS) {
      const q = E.quoteForPurchase(s, world, s.purchase, bankId, bankId === 'uetli' ? 'fix10' : 'fix5');
      console.log(bankId, q.decision, 'maxLoan', q.maxLoan, 'ltvMax', q.maxLtvLoan, 'afford', q.maxAfford, 'rate', q.rateBps, 'ratio', q.ratio.toFixed(3), q.reasons);
    }
    const q = E.quoteForPurchase(s, world, s.purchase, 'sihl', 'fix5');
    r = E.applyAction(s, world, { type: 'chooseFinancing', bankId: 'sihl', product: 'fix5', loan: q.maxLoan });
    console.log(r.error, r.events.map((e) => e.text).filter(Boolean)); s = r.state;
    r = E.applyAction(s, world, { type: 'closePurchase' });
    console.log(r.error, r.events.map((e) => e.text).filter(Boolean)); s = r.state;
  }
}
for (let k = 0; k < 40; k++) {
  const r2 = E.advance(s, world, { maxMonths: 12 });
  s = r2.state;
  const texts = r2.events.map((e) => e.text).filter(Boolean);
  console.log(`[${E.monthLabel(s.month)}] stop=${r2.stoppedBecause} cash=${E.chf(s.player.cash)} nw=${E.chf(E.netWorth(s, world))} pending=${s.pending.map((p) => p.kind).join(',')} neg=${s.negotiation ? s.negotiation.kind : '-'}`);
  for (const t of texts.slice(-4)) console.log('   ', t);
  for (const p of s.pending) {
    if (p.kind === 'applicants') { const rr = E.applyAction(s, world, { type: 'chooseTenant', unitId: p.unitId, index: 0 }); if (!rr.error) { s = rr.state; console.log('    ->', rr.events.map((e) => e.text).join(' ')); } else console.log('    !!', rr.error); }
    if (p.kind === 'refRateUp') { const rr = E.applyAction(s, world, { type: 'passOnRefRate' }); if (!rr.error) { s = rr.state; console.log('    ->', rr.events.map((e) => e.text).join(' ')); } }
  }
  for (const u of Object.values(s.units)) {
    if (!u.lease && !u.project && !u.askRent) {
      const { b, flat } = E.flatOfUnit(world, u);
      const m = E.marketRent(s, world, b, flat, u.condition);
      const rr = E.applyAction(s, world, { type: 'setRent', unitId: u.id, rent: Math.round(m / 10) * 10 });
      if (!rr.error) { s = rr.state; console.log('    ->', rr.events.map((e) => e.text).join(' ')); } else console.log('    !!', rr.error);
    }
  }
  if (s.negotiation && s.negotiation.kind === 'sell') { const rr = E.applyAction(s, world, { type: 'acceptOffer' }); s = rr.state; console.log('    ->', rr.events.map((e) => e.text).join(' ')); }
  if (s.over) break;
}
console.log(JSON.stringify(E.careerSummary(s, world)).slice(0, 600));
console.log('state bytes', JSON.stringify(s).length);
