// Rival investors. They buy listings between months and hold them. Fictional.

export const RIVALS = Object.freeze({
  pk: {
    id: 'pk',
    name: 'Pensionskasse Limmat',
    short: 'PK Limmat',
    blurb: 'A pension fund. Buys whole buildings near fair value and never sells.',
    kinds: { building: 1.0, condo: 0.0 },
    cash: 60_000_000,
    maxOverFair: 1.02,         // will not pay more than this multiple of fair value
    keenness: 0.35,            // base monthly probability of taking a listing it likes
    kreisBias: { 4: 1.0, 5: 1.0 },
    color: '#5F6368',
  },
  fo: {
    id: 'fo',
    name: 'Hürlimann Family Office',
    short: 'Hürlimann FO',
    blurb: 'Opportunistic family money. Strongest in Kreis 5, moves fast on a bargain.',
    kinds: { building: 0.6, condo: 0.5 },
    cash: 25_000_000,
    maxOverFair: 1.05,
    keenness: 0.3,
    kreisBias: { 4: 0.8, 5: 1.3 },
    color: '#8E6C3A',
  },
  local: {
    id: 'local',
    name: 'Reto Brunner',
    short: 'R. Brunner',
    blurb: 'A local who buys one condo at a time and does the painting himself.',
    kinds: { building: 0.0, condo: 1.0 },
    cash: 3_000_000,
    maxOverFair: 1.0,
    keenness: 0.25,
    kreisBias: { 4: 1.2, 5: 0.9 },
    color: '#3A7D8E',
  },
});

export const RIVAL_IDS = Object.keys(RIVALS);
