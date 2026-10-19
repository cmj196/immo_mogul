# Immo Mogul Zürich

A single-player browser game about being a property investor in Zurich. You find flats in real buildings in Kreis 4 and 5, negotiate with sellers who counter, get a bank to say yes, renovate, let, hold or sell, under Swiss rules: equity floors, the 5% affordability test, amortisation, the reference rate, the value-adding renovation formula, the initial rent form and the Zurich property gains tax. One click is one month. A career is fifteen years.

Nothing in this game is financial or legal advice. Prices, sellers, tenants and the future are simulated. The buildings are real, the people in them are invented.

## Play

Windows: double-click `play.cmd`. It starts a local server on port 5181 and opens the game. Any static server works on other systems, for example:

```bash
python -m http.server 5181
```

Then open http://localhost:5181/. The game needs an internet connection for the map tiles and fonts only; the game data itself is local.

The game autosaves after every month in your browser. The menu (top right) exports and imports a save as a file.

## What is real and what is not

| Thing | Source | Status |
|---|---|---|
| Buildings, addresses, build years, storeys, flat sizes and room counts | City of Zurich copy of the federal building and dwelling register (GWR), Open Data Zürich, CC0 | real |
| Building footprints | Amtliche Vermessung Stadt Zürich (WFS), CC0 | real |
| Rent levels per Kreis and Quartier | Mietpreiserhebung April 2026, Statistik Stadt Zürich, CC0 | statistic for the area |
| Condominium prices per Quartier | Open-market condo sales 2023 to 2025, Statistik Stadt Zürich, CC0 | statistic for the area |
| Opening interest rates | SNB data portal and ZKB indicative rates, 2 October 2026 | real at the start, simulated afterwards |
| Bank rules, rent law, gains tax, fees | See `docs/research/261002_swiss real estate rules.md` for every source | modelled; a few parameters are assumptions |
| Which flats come up for sale, their prices, sellers, tenants, condition, the rivals | generated from the seed | simulated |

Every rule constant in `src/data/rules.js` carries its source, the date it was checked and a status (`verified`, `secondary` or `assumption`). `node scripts/rules-report.mjs` lists them.

## Development

No build step, no dependencies at runtime beyond MapLibre GL (loaded from unpkg) and the Inter font. Node 24 runs the tests, the simulation and the data pipeline.

```bash
npm test          # node --test tests/
npm run sim       # bot careers over 200 seeds, four strategies
npm run data:fetch && npm run data:build && npm run data:verify   # rebuild data/world.json from Open Data Zürich
```

Layout: `src/engine/` is the pure, deterministic game engine (named random streams, integer francs, a ledger for every cash movement); `src/ui/` and `src/map/` are the browser layer; `src/data/` holds rules, banks, rivals and invented people; `data/world.json` is the Zurich snapshot; `scripts/data/` builds it; `docs/` has the design spec and the research notes.

## Credits

- Statistik Stadt Zürich and Stadt Zürich Open Data (CC0): building and dwelling register, rent survey, condominium prices, boundaries.
- Bundesamt für Statistik: federal building and dwelling register (GWR).
- Amtliche Vermessung Stadt Zürich: building footprints.
- Swiss National Bank and Zürcher Kantonalbank: interest rate levels at the start of the career (non-commercial use, source credited).
- Bundesamt für Wohnungswesen (BWO): reference rate and its rent rule. Kanton Zürich: property gains tax tariff, notary fee ordinance, rental forms.
- Map: [OpenFreeMap](https://openfreemap.org), [OpenMapTiles](https://openmaptiles.org), [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Rendering: [MapLibre GL JS](https://maplibre.org).
- Font: Inter by Rasmus Andersson.
- The banks and rival investors are fictional. Any resemblance to a real company or person is unintended.

Built with Claude Code.
