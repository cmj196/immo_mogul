// Three fictional banks modelled on Swiss practice. Any resemblance to a real bank is unintended.
// Percentages are whole numbers, rates in basis points added to the market curve.

export const BANKS = Object.freeze({
  lkb: {
    id: 'lkb',
    name: 'Limmat Kantonalbank',
    short: 'LKB',
    blurb: 'Cantonal bank. Strict on equity, cheap on fixed rates, reviews every loan once a year.',
    minEquityPct: 25,
    amortYears: 10,
    affordabilityCapPct: 33,
    imputedRateBps: 500,
    rentCountedPct: 80,
    spreadBps: { saron: 0, fix2: 0, fix5: 0, fix10: 0 },
    products: ['saron', 'fix2', 'fix5', 'fix10'],
    valuationBias: -2,          // percent against fair value; a cautious valuer
  },
  sihl: {
    id: 'sihl',
    name: 'Sihlbank Privat',
    short: 'Sihlbank',
    blurb: 'Private bank. Lends to 80%, counts your rent generously and charges for it.',
    minEquityPct: 20,
    amortYears: 15,
    affordabilityCapPct: 35,
    imputedRateBps: 450,
    rentCountedPct: 80,
    spreadBps: { saron: 35, fix2: 30, fix5: 30, fix10: 30 },
    products: ['saron', 'fix2', 'fix5', 'fix10'],
    valuationBias: 2,
  },
  uetli: {
    id: 'uetli',
    name: 'Üetli Hypo',
    short: 'Üetli',
    blurb: 'Online lender. Only 5 and 10 year fixed, the lowest long rate in town, no exceptions.',
    minEquityPct: 25,
    amortYears: 15,
    affordabilityCapPct: 33,
    imputedRateBps: 500,
    rentCountedPct: 70,
    spreadBps: { fix5: -10, fix10: -20 },
    products: ['fix5', 'fix10'],
    valuationBias: 0,
  },
});

export const BANK_IDS = Object.keys(BANKS);

export const PRODUCTS = Object.freeze({
  saron: { id: 'saron', label: 'SARON', years: 0 },
  fix2: { id: 'fix2', label: '2-year fixed', years: 2 },
  fix5: { id: 'fix5', label: '5-year fixed', years: 5 },
  fix10: { id: 'fix10', label: '10-year fixed', years: 10 },
});
