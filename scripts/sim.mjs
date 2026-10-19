// Bot careers over many seeds for four strategies. Fails loudly on an action error, a stall, a
// negative loan balance, a NaN or a slow month. Prints per strategy the net worth multiple
// distribution, forced sales, insolvencies, units, gains tax and whether flipping beats holding.
//
//   node scripts/sim.mjs [--seeds 200] [--months 180] [--real] [--only flipper,holder]
//
// The bot lives in tests/helpers.mjs so the fuzz tests and the sim drive the engine the same way.

import { E, fixture, realWorld, makeBot, nextBotAction, play, checkInvariants, stateHash, percentile } from '../tests/helpers.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const SEEDS = Number(opt('--seeds', 200));
const MONTHS = Number(opt('--months', 180));
const REAL = args.includes('--real');
const ONLY = opt('--only', null)?.split(',') ?? null;
const SLOW_MS = 50;

const worn = (l) => l.units.some((u) => u.condition < 60);

export const STRATEGIES = {
  cautious: { label: 'cautious', blurb: 'one lot at a time, 60% LTV, never sells', make: () => makeBot({ maxLots: 1, ltvCap: 0.6, cashBuffer: 50_000 }) },
  leveraged: { label: 'leveraged', blurb: 'max loans, buys whenever a bank says yes', make: () => makeBot({ maxLots: Infinity, ltvCap: 1, cashBuffer: 10_000 }) },
  flipper: { label: 'flipper', blurb: 'buys, overhauls empty flats, lists at fair x 1.03 after 12 months', make: () => makeBot({ maxLots: 3, ltvCap: 1, cashBuffer: 20_000, overhaulOnVacancy: true, overhaulBelow: 100, sellAfterMonths: 12, sellAskFactor: 1.03 }) },
  renovator: { label: 'renovator', blurb: 'buys worn flats, overhauls on vacancy, holds', make: () => makeBot({ maxLots: 3, ltvCap: 1, cashBuffer: 20_000, filter: worn, overhaulOnVacancy: true, overhaulBelow: 80 }) },
  holder: { label: 'holder', blurb: 'the flipper twin that never sells (for the comparison)', make: () => makeBot({ maxLots: 3, ltvCap: 1, cashBuffer: 20_000, overhaulOnVacancy: true, overhaulBelow: 100 }) },
};

function fail(msg) {
  console.error(`\nSIM FAILURE: ${msg}`);
  process.exit(1);
}

export function runCareer(world, seed, strategy, months) {
  const bot = strategy.make();
  let s = E.createCareer({ seed, world });
  const c = { seed, actions: 0, firstBuy: null, rivalTaken: 0, listingsSeen: 0, warn: 0, failRev: 0, challenges: 0, ms: 0 };
  const t0 = performance.now();
  while (!s.over && s.month < months) {
    let n = 0;
    for (;;) {
      const a = nextBotAction(s, world, bot.opts, bot.mem);
      if (!a) break;
      const before = stateHash(s);
      const r = E.applyAction(s, world, a);
      if (r.error) fail(`${strategy.label} seed ${seed} month ${s.month}: bot action ${JSON.stringify(a)} refused: ${r.error}`);
      if (stateHash(r.state) === before) fail(`${strategy.label} seed ${seed} month ${s.month}: stall on ${JSON.stringify(a)}`);
      s = r.state;
      c.actions += 1;
      if (a.type === 'closePurchase' && c.firstBuy === null) c.firstBuy = s.month;
      if (++n > 300) fail(`${strategy.label} seed ${seed} month ${s.month}: ${n} actions in one month`);
    }
    const r = E.applyAction(s, world, { type: 'endMonth' });
    if (r.error) fail(`${strategy.label} seed ${seed} month ${s.month}: endMonth refused: ${r.error}`);
    s = r.state;
    for (const e of r.events) {
      if (e.type === 'listings') c.listingsSeen += e.ids.length;
      if (e.type === 'listingGone' && e.why === 'rival') c.rivalTaken += 1;
      if (e.type === 'bankWarn') c.warn += 1;
      if (e.type === 'bankFail') c.failRev += 1;
    }
    const problems = checkInvariants(s, world);
    if (problems.length) fail(`${strategy.label} seed ${seed} month ${s.month}: ${problems.slice(0, 3).join('; ')}`);
  }
  c.ms = performance.now() - t0;
  const sum = E.careerSummary(s, world);
  return { ...c, months: s.month, multiple: sum.multiple, netWorth: sum.netWorth, units: sum.units, forced: s.stats.forcedSales, insolvent: s.over?.reason === 'insolvent', gainsTax: s.stats.gainsTax, bought: s.stats.bought, sold: s.stats.sold, warnings: s.stats.warnings, challenges: s.stats.challenges, renovations: s.stats.renovations, over: s.over };
}

function fmt(x, d = 2) { return Number.isFinite(x) ? x.toFixed(d) : '-'; }
function pad(s, n) { return String(s).padStart(n); }
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const median = (a) => percentile([...a].sort((x, y) => x - y), 0.5);

function main() {
  const world = REAL ? realWorld() : fixture();
  console.log(`Immo Mogul sim: ${SEEDS} seeds x ${MONTHS} months on the ${REAL ? 'real world (data/world.json)' : 'fixture world'}`);
  const names = Object.keys(STRATEGIES).filter((n) => !ONLY || ONLY.includes(n));
  const results = {};
  let totalMonths = 0;
  const t0 = performance.now();
  for (const name of names) {
    const strat = STRATEGIES[name];
    const rows = [];
    for (let k = 0; k < SEEDS; k++) rows.push(runCareer(world, `sim${k}`, strat, MONTHS));
    results[name] = rows;
    const months = rows.reduce((a, r) => a + r.months, 0);
    totalMonths += months;
    const msPerMonth = rows.reduce((a, r) => a + r.ms, 0) / months;
    if (msPerMonth > SLOW_MS) fail(`${name}: ${msPerMonth.toFixed(1)} ms per month, over the ${SLOW_MS} ms budget`);
  }
  const total = performance.now() - t0;

  console.log('');
  console.log(pad('strategy', 10), pad('median', 8), pad('p10', 7), pad('p90', 7), pad('forced', 7), pad('insolv', 7), pad('units', 6), pad('bought', 7), pad('sold', 5), pad('gainsTax', 10), pad('warn', 5), pad('fail', 5), pad('1stBuy', 7), pad('ms/mo', 6));
  for (const name of names) {
    const rows = results[name];
    const mult = rows.map((r) => r.multiple).sort((a, b) => a - b);
    const months = rows.reduce((a, r) => a + r.months, 0);
    const firstBuys = rows.filter((r) => r.firstBuy !== null).map((r) => r.firstBuy);
    console.log(
      pad(name, 10),
      pad(fmt(percentile(mult, 0.5)), 8),
      pad(fmt(percentile(mult, 0.1)), 7),
      pad(fmt(percentile(mult, 0.9)), 7),
      pad(rows.reduce((a, r) => a + r.forced, 0), 7),
      pad(rows.filter((r) => r.insolvent).length, 7),
      pad(fmt(mean(rows.map((r) => r.units)), 1), 6),
      pad(fmt(mean(rows.map((r) => r.bought)), 1), 7),
      pad(fmt(mean(rows.map((r) => r.sold)), 1), 5),
      pad(Math.round(mean(rows.map((r) => r.gainsTax))), 10),
      pad(fmt(mean(rows.map((r) => r.warn)), 1), 5),
      pad(fmt(mean(rows.map((r) => r.failRev)), 1), 5),
      pad(firstBuys.length ? `${median(firstBuys)}m/${Math.round((firstBuys.length / rows.length) * 100)}%` : 'never', 7),
      pad(fmt(rows.reduce((a, r) => a + r.ms, 0) / months, 2), 6),
    );
  }
  console.log('');
  console.log('median/p10/p90: final net worth as a multiple of the start; forced and insolv: totals over all seeds;');
  console.log('units, bought, sold, gainsTax, warn (bank warnings), fail (failed reviews): means per career; 1stBuy: median month of the first purchase / share of careers that ever bought.');

  if (results.flipper && results.holder) {
    const pairs = results.flipper.map((r, i) => [r.multiple, results.holder[i].multiple]);
    const beats = pairs.filter(([f, h]) => f > h).length;
    const avgF = mean(pairs.map((p) => p[0]));
    const avgH = mean(pairs.map((p) => p[1]));
    console.log('');
    console.log(`flipper beats holder (same buying and overhaul policy, holder never sells) in ${beats} of ${pairs.length} careers (${((beats / pairs.length) * 100).toFixed(0)}%); mean multiple flipper ${fmt(avgF)} vs holder ${fmt(avgH)}.`);
    console.log(avgF < avgH ? 'As designed: flipping loses to holding on average (short-hold surcharge, broker fee, re-buy costs).' : 'NOT as designed: flipping beats holding on average. Rules are not tuned here; see the report.');
    if (results.cautious) {
      const beatsC = results.flipper.filter((r, i) => r.multiple > results.cautious[i].multiple).length;
      console.log(`flipper beats cautious in ${beatsC} of ${results.flipper.length} careers.`);
    }
  }
  const rivalShare = names.length ? mean(names.flatMap((n) => results[n].map((r) => (r.listingsSeen ? r.rivalTaken / r.listingsSeen : 0)))) : 0;
  console.log('');
  console.log(`rivals took ${(rivalShare * 100).toFixed(1)}% of the listings the player saw.`);
  console.log(`timing: ${(total / totalMonths).toFixed(2)} ms per month, ${(total / 1000).toFixed(1)} s total over ${totalMonths} months.`);
}

main();
