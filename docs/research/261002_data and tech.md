# Immo Mogul: data sources and technical approach

Date: 2 October 2026. Status: research, nothing built yet. Read with `261002_concept and assessment.md` in this folder.

Every request below was made on 2 October 2026 from this machine, with a descriptive User-Agent and no key or login. "Confirmed" means I got a real response and read it. "Read" means I opened the page. What I could not open or could not confirm is listed in section 4.

## 1. Short version

- Zurich publishes nearly everything the game needs as CC0 open data: rents, condo prices, vacancy, flat stock by owner type, population, and a register with one row per building and one per flat, updated daily. All of it answered without a key.
- Building footprints come from the city's survey WFS and join to the register by the federal building ID (EGID). OpenStreetMap is not needed for footprints, which keeps the ODbL share-alike rule out of the repo.
- The SNB data portal API answers without a key (policy rate, SARON, mortgage reference rates). SNB's copyright page allows non-commercial reuse with a source reference. That is fine for a personal project and a question if the game is ever sold.
- Overpass was not usable on the day: 504 twice, two mirrors timed out. Nominatim works, but only for one-off checks at build time.
- Listing portals are out. Homegate's terms (section 7) forbid systematic reading of its content. ImmoScout24 and Comparis returned 403 to my fetcher, so for those two I only have secondary reports.
- Listings are generated: real building facts from the register, prices and rents from city statistics, everything else simulated and labelled as simulated. Section 2.4 has the calibration numbers I read.
- Three numbers change the design. Vacancy is 0.106%, so empty flats come from turnover and renovation, not from the market. Rents on leases older than 20 years are 62% of new-let rents, so the rent gap is a core mechanic. Gross rent against condo price is about 1.7% to 2.0%, below the 1.76% average 5-year fixed mortgage rate, so borrowing does not pay for itself out of rent.
- Technically: reuse the engine, controller and UI split, the seeded RNG, the test and simulation harness, the design tokens and the map from Paradeplatz. Change four things: separate a static world from a small saved state, move to integer francs with a ledger, replace the single RNG integer with named streams, and warn when a save fails.

## 2. Data

### 2.1 Overview

| Source | Used for | Licence and attribution | Format | Updates | Status on 2 Oct 2026 |
|---|---|---|---|---|---|
| [Open Data Zürich](https://data.stadt-zuerich.ch) (Statistik Stadt Zürich and city departments) | rents, prices, vacancy, stock, population, boundaries | CC0 (CKAN field `cc-zero`). No attribution required, credit anyway | CSV, GeoJSON, WFS, via CKAN API | per dataset, daily to every two years | Confirmed: API 200, twelve CSVs fetched or sampled |
| City copy of the building and dwelling register (GWR): [buildings](https://data.stadt-zuerich.ch/dataset/bau_gwr_gebaeude_best_od5501), [flats](https://data.stadt-zuerich.ch/dataset/bau_gwr_wohnungen_best_od5503) | building facts, flat floor, area, rooms | CC0 | CSV, 35.6 MB and 48.0 MB | daily | Confirmed: ranged requests, 206, rows read |
| [City survey (AV) WFS](https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Amtliche_Vermessung_Stadt_Zuerich?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=1.1.0) | building footprints | CC0 | GML, GeoJSON | daily | Confirmed: GetCapabilities, and a GetFeature returning 2 footprints |
| [Statistische Quartiere](https://data.stadt-zuerich.ch/dataset/geo_statistische_quartiere), [Stadtkreise](https://data.stadt-zuerich.ch/dataset/geo_stadtkreise) | Kreis and Quartier polygons | CC0 | GeoJSON, GPKG, SHP, WFS | irregular, fortnightly | Read from metadata, files not fetched |
| [opendata.swiss](https://opendata.swiss) CKAN API | discovery of cantonal and federal datasets | set per dataset; the Stadt Zürich GWZ record I checked carries `#terms_open` | JSON | daily | API confirmed, 16,521 datasets listed. Terms page returned 403 |
| [geo.admin.ch](https://api3.geo.admin.ch) GWR layer | look up a building or address by EGID | layer legend: level A data are public and usable without restriction | JSON | daily | Confirmed: find, SearchServer, legend |
| [BFS public GWR dump](https://public.madd.bfs.admin.ch/zh.zip) | whole-canton cross-check | not verified | ZIP | daily | HEAD only: 200, canton ZH 121.8 MB, all of CH 947 MB, both modified 2 Oct 2026 |
| [Nominatim](https://nominatim.openstreetmap.org) | one-off address checks | ODbL, attribution, 1 request per second at most | JSON | live | Confirmed: one search, 200 |
| [Overpass API](https://overpass-api.de) | not planned | ODbL | JSON | live | Not confirmed: 504 twice, mirrors timed out |
| [SNB data portal](https://data.snb.ch) API | policy rate, SARON, mortgage reference rates | non-commercial reuse with source reference | CSV, JSON | daily and monthly | Confirmed: two cubes read |
| [BWO reference rate](https://www.bwo.admin.ch/de/referenzzinssatz) | rent rule parameter | page only, no download | none | quarterly | Read |
| [OpenFreeMap](https://openfreemap.org), [swisstopo](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices) base maps | map | attribution | vector tiles, raster tiles | live | Confirmed: both styles 200, SWISSIMAGE tile 200 |

### 2.2 Notes per source

#### Open Data Zürich

The datasets I would use:

| Dataset id | Content | Size | Coverage |
|---|---|---|---|
| `bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161` | rent survey: median, quartiles and mean, net and gross, per flat and per m², for 2, 3 and 4 rooms, by Kreis, Quartier, lease age, new build, nonprofit or not | 763 KB, 3,948 rows | April 2022, 2024, 2026 |
| `bau_hae_preis_stockwerkeigentum_stadtquartier_od5157`, `..._zimmerzahl_stadtquartier_od5155`, `..._zimmerzahl_gebaeudealter_od5156` | condo sale prices, median per flat and per m², by Quartier, rooms, building age class | 65 KB, 447 KB, 62 KB | 2009 to 2025, yearly |
| `bau_hae_lima_preise_anzahl_hae_art_bebauung_jahr_od5144` | price series by building type, per m² of plot, whole city, Kreis, Quartier | 1.4 MB | 2008 to 2025 |
| `bau_leerwhg_whg_quartier_zizahl_efh_nb_we_od5427` | empty flats and total flats by Quartier, rooms, building type, owner-occupied, new build, age | 1.7 MB | 1 June, 2009 to 2026 |
| `bau_whg_bestand_ea_zizahl_quartier_seit2010_od5221` | flat stock by owner type, rooms, Quartier | 1.6 MB | 2010 to 2025 |
| `bau_best_whg_zizahl_wfl_bauperi_ea_quartier_jahr_od5831`, `bau_best_geb_jahr_gebart_bauperiode_quartier_od5813` | stock by rooms, rented or owned, build period, owner, Quartier; buildings by type and period | 23 MB, 39 MB (from metadata) | 2008 to 2025 |
| `bev_bestand_jahr_quartier_od3240`, `bev_bestand_jahr_kreis_od3242` | population by Quartier and by Kreis | 74 KB, 11 KB | 1941 to 2025 |
| `bau_gwr_gebaeude_best_od5501`, `bau_gwr_wohnungen_best_od5503` | register: every building and every flat | 35.6 MB, 48.0 MB (from metadata) | daily |

Things the loader has to handle:

- Download links redirect. `data.stadt-zuerich.ch/dataset/<id>/download/<file>.csv` answers 302 to a CKAN host (`ckan-prod.zurich.datopian.com`), which answers 302 to a signed storage link that expires after 60 seconds (`X-Amz-Expires=60`). Scripts must follow redirects and ask the CKAN API (`package_show`) for the resource URL every run instead of storing a resolved link. Range requests work (206). A `package_search` call with an `fl` parameter returned 500 in my test, so leave that parameter out.
- Small cells are blurred or hidden. The condo age-class file shows counts like "1 to 3" and a "K" in the sum column. The Kreis 1 condo median for 2025 rests on 5 sales, Kreis 4 on 21.
- Rents are survey estimates with 95% confidence intervals: about 1% either way for the whole city, 4% to 8% for small areas, up to about 20% in the worst cases (dataset notes). They describe existing leases.
- Since 2021 the city uses a new register, so some older years differ from earlier publications (dataset notes).
- Column names are German, with Sort, Cd and Lang variants of each variable. The loader should compare the header with an expected list and stop if the city changes it.

#### The register (GWR)

The building file has one row per building: EGID, LV95 coordinates (`GKODE`, `GKODN`), year built (`GBAUJ`), build period (`GBAUP`), footprint area (`GAREA`), volume (`GVOL`), storeys (`GASTW`), number of dwellings (`GANZWHG`), category and class (`GKAT`, `GKLAS`), heritage protection (`GSCHUTZR`), heating and energy source, and an export date (2026-09-30 in the rows I read). The flat file has EGID, flat ID, floor, area in m² (`WAREA`), rooms (`WAZIM`), kitchen, street, house number and postcode. There are no owners and no tenants in it. The legal basis cited in the metadata is the ordinance on the federal register (SR 431.841).

Two routes agree. For EGID 140002 (Zähringerstrasse 39) the city CSV lists four flats of 66, 66, 66 and 30 m² with 4, 4, 3 and 1 rooms, and the geo.admin.ch GWR layer returns the same four values. The address search there also returns the EGID as `featureId` (`140002_0`), so a typed address can be resolved to a building without keeping any address data. The WFS footprint layer `av_bo_allegebaeude_a_v` carries `gwr_egid`, `baujahr`, `status` and an area, so footprints join to the register by EGID. I tested a bounding-box GetFeature with `SRSNAME=EPSG:4326`, and it returned polygons in longitude and latitude. I did not test bulk queries, and the service does not state a limit that I found.

Coordinates in the register are Swiss LV95. I wrote swisstopo's approximate conversion formula (about 10 lines of JavaScript) and checked it: for the same entrance it landed 0.24 m from the latitude and longitude that geo.admin.ch returned. No library is needed.

The BFS public dump (`public.madd.bfs.admin.ch/zh.zip`) exists and is refreshed daily; a search result describes SQLite contents, which I did not check because I did not download it. The OSM wiki page on Swiss register data says attribution is required, with the source pointing to housing-stat.ch. That is a secondary report, and I did not find the BFS terms themselves. The geo.admin.ch layer legend (read) says level A data are public and can be used without restriction. For the game the city's CC0 copy is the cleanest source, and the federal dump is a cross-check.

#### opendata.swiss

The CKAN API works (`ckan.opendata.swiss/api/3/action/package_search`). Each resource carries a machine-readable terms link, and in a sample of 60 search results I saw only `#terms_open` (87 resources) and `#terms_by` (144). I expect these to mean open use and open use with attribution, but the terms page returned 403 to my fetcher, so that reading is unconfirmed. Use the catalogue for discovery and take the actual licence from the dataset record.

#### OpenStreetMap

Nominatim returned the building for "Zähringerstrasse 39, 8001 Zürich" (OSM way 51445440), 2.9 m from the register point after conversion. The usage policy (read) allows at most 1 request per second, requires an identifying User-Agent or Referer, requires results to be cached, forbids autocomplete, and may change without notice. `scripts/verify-coords.mjs` in Paradeplatz already follows this (1.1 s gap, cache, User-Agent). The game does not need to geocode at runtime, because the register has coordinates.

Overpass is not a dependable source right now. `/api/status` reported 4 free slots, yet the interpreter answered 504 (dispatcher timeout) on two tries a few seconds apart, and two public mirrors (`overpass.kumi.systems`, `overpass.private.coffee`) sent nothing within 60 seconds. The OSM wiki page I opened says the main instance is overloaded and gives a fair-use guide of under 10,000 queries and 1 GB per day for occasional use, divided by 100 for regular use.

Licence (OSM copyright page and OSMF produced-work guideline, both read): ODbL, with attribution. Anyone who alters or builds on the data may distribute the result only under the same licence. A rendered map image is a produced work and can carry its own licence, but the source must be credited and the underlying database stays open. In practice: if the repo ever holds a footprint or address extract from OSM, that extract is a derivative database and would have to be released under ODbL. Using the city's survey footprints avoids the question, and OpenFreeMap tiles are fetched at runtime and never stored. This is my reading of the licence pages, not legal advice.

#### SNB and the reference rate

Two cubes were read from `https://data.snb.ch/api/cube/{cube}/data/csv/en?fromDate=...` (semicolon-separated, three header lines, `/dimensions/en` lists the codes):

- `snbgwdzid`, daily, published 2026-09-28: policy rate (`LZ`), SARON, sight deposit rates. The policy rate moved from -0.75% on 2022-01-03 to -0.25% (2022-06-17), 0.50% (2022-09-23), 1.00% (2022-12-16), 1.50% (2023-03-24), 1.75% (2023-06-23), then down to 1.50% (2024-03-22), 1.25% (2024-06-21), 1.00% (2024-09-27), 0.50% (2024-12-13), 0.25% (2025-03-21) and 0.00% (2025-06-20). It has not changed since, up to the last data point on 2026-09-25, when SARON was -0.04%. All changes fall in March, June, September or December, which suits a quarterly event in the game.
- `zikrepro`, monthly, published 2026-10-01, latest month 2026-08: reference values (mean, quartiles, median) of customer interest rates by product. Mean mortgage rates in August 2026: variable 2.79%, fixed for 1 year 1.43%, 2 years 1.51%, 3 years 1.61%, 5 years 1.76%, 7 years 1.87%, 10 years 2.03%. The portal page that defines this cube needs JavaScript, so I could not confirm whether it describes new business or the stock of loans. Use it for the level and shape of the bank product table, not as an exact quote.

Terms (SNB copyright page, read): information and data may be saved, translated with a source reference, passed on or otherwise used for non-commercial purposes, and third-party content has to be cleared by the user. A personal project qualifies. If the game is ever sold or monetised, ask SNB first, or ship a small hand-entered fact table. Credit "Swiss National Bank" either way.

The BWO reference rate is 1.25% since 2 September 2025. The BWO page lists the next publications as 1 December 2026, then 1 March, 1 June, 1 September and 1 December 2027. It has no download, and neither of the two BWO pages I opened has a history table, so I did not take the history from anywhere. Hard-code the current value now and read the history from BWO's calculation document later.

#### Base maps

OpenFreeMap (read): free, no key, no stated request limit, attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". The Liberty style answers 200 and contains a `building-3d` fill-extrusion layer driven by `render_height`. The swisstopo light base map style and a SWISSIMAGE tile also answer. swisstopo's free-data terms (read, version 1.3 of 26 August 2022) allow commercial use and redistribution with a source reference such as "©swisstopo". The federal geoservices terms (read) need no registration, treat a web application with an average of 20,000 users a day as fair use, say mass automated reading should use the download service, and give best-effort availability.

### 2.3 What not to use

- Homegate: the terms (opened, section 7) forbid systematically reading content from the marketplaces, for example by scraping, and also copying, publishing or reproducing it. Section 8 reserves copyright and database rights to SMG or its licensors.
- ImmoScout24 and Comparis: their terms pages returned 403 to my fetcher. Search summaries report the same kind of clause (ImmoScout24 shares the SMG terms with Homegate; Comparis is described as forbidding automated reading in its intellectual property section). I did not open either page and did not try to get around the block.
- So there is no scraping, no listing feed, no portal photos or texts, and no use of their apps' private interfaces. Paid price data (Wüest Partner, IAZI and similar) is out under the no-paid-services rule.

### 2.4 Generating believable listings in real buildings

The principle: real facts about the building, official statistics for price and rent levels, fiction for everything else, and the interface says which is which.

| Field | Source | Kind |
|---|---|---|
| address, coordinates, footprint | register, survey WFS | real |
| year built, storeys, number of units, class, heritage flag, heating | register | real |
| flat floor, area, rooms | register (flats) | real |
| Kreis and Quartier | point in polygon, city boundaries | real |
| price and rent level per m² | city statistics, by area and room count | statistic about the area, not about this building |
| asking price, rent roll, lease ages, condition, seller, motive, text, picture | generator | simulated |

Generator steps, all from a named seeded stream per month:

1. Choose a building from the register universe, weighted by type, size and Quartier.
2. Reference rent for each flat: the Kreis or Quartier median per m² for its room count (`od5161`), moved to the game month by the rent index.
3. Lease age for each flat from the survey's tenure mix, with in-place rent equal to the new-let rent times a gap factor. Measured on 3-room flats, privately owned, whole city, 2026: leases of 3 to 10 years sit at 0.90 of the new-let median, 11 to 20 years at 0.76, over 20 years at 0.62 (CHF 2,018, 1,699 and 1,397 against 2,250).
4. Value. Condos individually from price per m² times area (`od5157`, `od5155`, `od5156`). Whole buildings by the income approach: net rent after running costs, a vacancy allowance and a maintenance reserve, divided by a capitalisation rate. That rate is the one parameter I found no free data for. Tune it so generated asking prices reproduce the Quartier price levels in `od5144`, and test the result.
5. Condition and renovation backlog from build year, with the age classes in `od5156` (for example "20 years or older, converted within 9 years") as a guide.
6. Seller type and motive, asking premium, expiry. I found no free series for the gap between asking and sale price. Treat it as an assumption and tune it in simulation.

Anchors I read from the files on 2 October 2026:

| Kreis | 3-room median net rent, CHF per month (April 2026) | Condo median, CHF per m² (2025, sales) | Vacancy on 1 June 2026 |
|---|---|---|---|
| 1 | 2,855 | 24,000 (5) | 0.126% |
| 2 | 2,272 | 18,610 (48) | 0.083% |
| 3 | 1,883 | 17,048 (27 to 33) | 0.072% |
| 4 | 1,986 | 13,595 (21) | 0.121% |
| 5 | 2,378 | 20,492 (29) | 0.045% |
| 6 | 2,120 | 19,376 (43) | 0.149% |
| 7 | 2,230 | 21,464 (142) | 0.122% |
| 8 | 2,400 | 19,531 (33) | 0.120% |
| 9 | 1,953 | 16,083 (140) | 0.113% |
| 10 | 1,804 | 19,000 (95) | 0.060% |
| 11 | 1,801 | 15,392 (112) | 0.144% |
| 12 | 1,576 | 15,000 (25) | 0.071% |
| City | 1,950 | 17,646 (720) | 0.106% |

Rents are for privately owned (not nonprofit) flats and include all lease ages. Numbers in brackets are the sales behind each condo median. Vacancy is based on 4 to 58 empty flats per Kreis, so Kreis figures are noisy.

Other figures from the same files:

- 3-room rents by lease type, whole city, private: new buildings up to 2 years old 3,183; new tenancies up to 2 years 2,250; leases of 3 to 10 years 2,018; 11 to 20 years 1,699; over 20 years 1,397. The middle half of all leases runs from 1,550 to 2,525.
- Condos, whole city, 2025: median CHF 1,681,598 per flat; by size 1 room 690,000, 2 rooms 1,216,000, 3 rooms 1,547,500, 4 rooms 1,995,000, 5 rooms 2,090,000, 6 or more 2,773,500. Median per m² was 7,738 in 2009, 11,015 in 2015, 13,100 in 2020 and 17,646 in 2025, a factor of 2.28 in 16 years.
- Vacancy: 252 empty flats out of 238,459 on 1 June 2026, which is 0.106%. This matches the 0.11% and 252 flats in the city press release that the concept note cites.
- Stock in 2025: 238,472 flats. By owner: other private companies 34.0%, natural persons 30.4%, housing cooperatives 17.9%, condominium owners 10.3%, public sector 7.5%. This gives a realistic mix for rival investors and for who sells. The "other private companies" label does not say what kind of company, so do not label a rival as a pension fund on this basis.
- Population in 2025: 452,421, summed over the 34 statistical Quartiere (column `AnzBestWir`).
- Rough yield check, mixing two different data sets (rented stock and sold condos, net rent before running costs): median 3-room net rent of CHF 25.75 per m² per month is 1.75% of the median condo price per m², and the new-let median of CHF 29.38 is 2.00%. A whole 3-room flat at 2,250 a month against a 1,547,500 condo gives 1.74%. Whole-building yields need another source. This check says that at 1.76% for a 5-year fixed mortgage, rent alone barely covers the interest on a flat at full price. The money in the game has to come from appreciation, closing the rent gap and renovation. That matches the concept note's conclusion and is stronger than "slow 3% yield".

Gaps with no free source found: whole-building capitalisation rates, the asking-to-sale gap, renovation cost per m², running-cost ratios, tenant turnover, time on market. Each becomes a named parameter marked `assumption` in the rules data (section 3.3), so the sim shows how much the outcome depends on it.

Calibration tests, to write with the generator: for each Kreis, the average generated rent per m² by room count is within 5% of `od5161`; generated condo prices per m² are within 5% of `od5157` (use shrinkage toward the city value where a Kreis has fewer than 30 sales, which in 2025 covers Kreise 1, 4, 5 and 12, and probably 3); the share of leases per age band is within 3 points of the survey mix; generated vacancy at the start of a career is within 0.05 points of the Kreis value.

Labelling and care: show a small "register" or "simulated" mark on every listing field. Never show owner or tenant names (the register has none, and generated tenants get invented names). Do not generate defects, disputes or distress for a named real address in a way that reads as a statement about it. State in the game that prices and sellers are simulated. A short review by someone qualified before any public release is sensible. I have not done a legal analysis.

### 2.5 Credits to show in the game and README

Register and statistics: Statistik Stadt Zürich and Stadt Zürich open data (CC0, credit given as courtesy). Building register: BFS and Stadt Zürich. Rates: Swiss National Bank. Map: OpenStreetMap contributors, OpenFreeMap, ©swisstopo.

## 3. Technical approach

### 3.1 What to reuse from Paradeplatz

| Item | Where in Paradeplatz | Use in Immo Mogul |
|---|---|---|
| Engine contract: `createGame`, `applyAction`, `legalActions`, `actorOf`, returning `{ state, events, error }` and never mutating input | `src/engine/index.js`, `actions.js` | same contract with career rules |
| Seeded RNG: mulberry32 with FNV-1a seed normalisation | `src/engine/rng.js` | keep, add named streams (3.3.6) |
| Events with readable text and a rolling log | `src/engine/events.js` | keep |
| Hand-written structural clone that shares immutable parts | `cloneState` in `actions.js` | same idea, applied to a sparse state |
| Controller: dispatch, event playback, timeouts, bot loop, autosave | `src/controller.js` | copy and trim (3.3.8) |
| Tests: `node --test tests/` with a loader file, QA fuzz, accounting checks | `tests/`, `package.json` | same layout. Baseline run today: 383 tests pass in 23 s |
| Bot simulation with invariants and a stall limit | `scripts/sim.mjs` | adapt to careers. Baseline: 30 games in 3.4 s |
| Map: MapLibre 5.24.0 from unpkg, OpenFreeMap Liberty, swisstopo style and aerial, 8 s style timeout with plain fallback | `src/map/` | reuse, drop token walking and the chase camera |
| Design tokens: Swiss red `#D52B1E`, light and dark through `prefers-color-scheme` plus `data-theme`, 4 px spacing scale, 44 px touch targets | `styles/tokens.css`, `hud.css` | reuse, add table and chart styles |
| Polite API script: cache, User-Agent, 1.1 s gap | `scripts/verify-coords.mjs` | pattern for every build script |
| Project agents, adapted from VoltAgent (MIT) | `.claude/agents/` | copy and retarget (roster is covered in another note) |
| No build step, static files, `python -m http.server` | `play.cmd`, `package.json` (no dependencies) | same |

### 3.2 Lessons from Paradeplatz, and the rule for this project

| Lesson | Where it lives | Rule here |
|---|---|---|
| `requestAnimationFrame` stops in background or occluded windows, and anything waiting on it freezes | `createTicker` in `src/map/mapView.js` schedules a frame and a 100 ms timer, whichever fires first; `index.html` has `?raf=timer` for test runs; `withTimeout` in the controller caps map waits at 20 s, 12 s and 6 s | The engine never waits on animation. Any animated element uses the ticker pattern. Awaited UI promises get a timeout unless a human is reading (modals) |
| A new game must not be overwritten by the old one still animating | `stop()` sets `stopped`, clears the bot timer and closes modals so waiting promises settle; `dispatch` re-checks `stopped` after playing events and returns `{ error: 'stopped' }`; `main.js` makes a fresh controller per game | Every async path checks a generation flag: skip-ahead loops, data loading, map attach |
| A broken save must not crash the resume | `isPlayableSave` checks the full shape and calls `actorOf`, `legalActions` and `ranking` inside try/catch; a broken save is deleted | Same check, but move a failed save aside under another key and offer an export, because a 15-year career is not worth deleting. Add a data-version pin (3.3.2) |
| Save failures are silent | `saveGame` swallows storage errors so the game keeps running | Keep running, but show a visible warning that autosave failed |
| Global CSS resets beat component styles | `styles/hud.css` lines 31 to 34 scope the resets with `:where(.pp-ui)`, which has zero specificity, so a single-class component rule wins whatever the source order | Same: scoped resets inside `:where()`, no `!important` except for `[hidden]`, check at three widths |
| Calm camera, gentle warm sound on by default | The design notes in `docs/design/261002_addictive lens feel.md` set both after the owner's feedback. The code I read today still has `follow: true` in `SETTING_DEFAULTS`, and `readMuted` in `sfx.js` defaults to unmuted, so sound is on | Start with the right defaults: gentle, warm sound on by default with mute and volume, a fixed map framing, the map moves only when the player clicks, `prefers-reduced-motion` respected, numbers change without animation or within 200 ms, no shake or flashes |
| Counter-offers were asked for but are not built yet | The protocol is specified in `docs/design/261002_negotiation spec.md`; a search for `counterTrade` in `src` and `tests` finds nothing | Implement it here first, as the core mechanic, keeping the same pending, history and counter-limit shape so it can be back-ported |
| Whole-state cloning is the cost to watch | `cloneState` copies what handlers write and shares the rest | Keep the pattern and keep the state small (3.3.2) |
| Every cash change should be explainable | `tests/qa.fuzz.test.js` checks that the event stream accounts for each change in cash, ownership and levels | Make this the ledger test (3.3.4) |

### 3.3 Architecture for a simulation-heavy game

#### 3.3.1 Shape

Static site, ES modules, no build step, no dependencies, as in Paradeplatz.

```
index.html, styles/, src/main.js, src/controller.js
src/engine/            pure, deterministic, no DOM, no timers, no Math.random
  index.js             public API
  rng.js               seeded streams
  money.js             integer CHF, basis points, one rounding rule
  clock.js             month index, quarter and year markers
  world.js             read-only static world, lookups by EGID
  state.js             createCareer, selectors (equity, net worth, cash flow)
  actions.js           applyAction, legalActions, clone
  tick.js              advanceMonth pipeline
  macro/rates.js       SNB rate, SARON, fixed-rate curve, reference rate
  macro/market.js      price and rent indices per Kreis or Quartier
  finance/bank.js      products, affordability, loan to value, amortisation, review
  finance/tax.js       gains tax by holding period, simple property and income tax
  finance/ledger.js    every cash movement is a posting with a reason
  property/building.js condition, renovation packages, project queue
  property/lease.js    tenants, turnover, rent setting, reference rate claims
  deals/listings.js    seeded generator, calibrated to the statistics
  deals/negotiation.js counter-offer protocol
  rivals/ai.js         rival investors
  report.js            monthly, quarterly and annual reports
src/data/rules.js      rule constants, each with source, date checked, verified flag
data/                  generated world snapshot and manifest
scripts/data/          fetch and build steps, cached and polite
scripts/sim.mjs        career simulation and invariant checks
tests/
```

Public API sketch:

```js
createCareer({ seed, world, scenario }) -> state
applyAction(state, world, action) -> { state, events, error }
legalActions(state, world) -> Action[]
advance(state, world, { until: 'decision' | 'quarter' | 'year', maxMonths }) -> { state, events, stoppedBecause }
```

Actions in the first version: `makeOffer`, `counterOffer`, `acceptOffer`, `walkAway`, `applyForLoan`, `acceptLoan`, `refinance`, `startRenovation`, `setRent`, `chooseTenant`, `listForSale`, `endMonth`.

#### 3.3.2 World and state

The world is the read-only snapshot of Zurich: buildings, flats, footprints, Quartier statistics, the rules table. It is loaded once and never saved. The state holds only what the game changed: cash, loans, which buildings are owned and by whom, leases and tenants of owned units, renovation projects, live listings, market indices, history, the log and the seed. Entries exist only for touched buildings. Everything else in the city is background, regenerated from the seed on demand.

Three effects. Saves stay small. Cloning on each action stays cheap, because the clone only covers the sparse state. A save records the snapshot id (`dataVersion`, a hash of the manifest), because EGIDs change as buildings are demolished and the register is updated daily. A save made against another snapshot is refused with a clear message, or migrated if a mapping exists.

Only owned units, rival units and live listings are simulated one by one. Everything else is a per-area aggregate. The cost of a month is then proportional to what the player and rivals own and what is listed, not to the size of the city.

#### 3.3.3 The monthly tick

`advanceMonth(draft, world, events)` runs fixed phases in a fixed order. Each phase is a pure function on the draft, which is cloned once per action.

1. Clock moves on. On months 3, 6, 9 and 12 the quarterly flag is set.
2. Macro: policy rate, SARON and the fixed-rate curve; on quarter months the SNB decision and the reference rate set by BWO's schedule; area price and rent indices.
3. Buildings: condition ages, renovation projects advance and finish.
4. Leases: notices and turnover, vacant months, arrears, rent adjustments that are due.
5. Ledger: rent in, interest, amortisation, running costs, project spending, tax accruals. At year end, tax.
6. Banks: fixed periods that end, annual affordability review. Either can create a pending decision.
7. Deals: listings expire and new ones are generated; rivals bid, buy or list, which can remove a listing under the player.
8. Report for the month, milestone checks, game-over checks, and a `pending` set if the player has to decide.

`advance(..., { until: 'decision' })` repeats the tick until something is pending or a limit is reached. That is the "skip to the next event" button, and it runs entirely inside the engine.

#### 3.3.4 Financial model

- Money is integer Swiss francs. Rates are integer basis points (176 means 1.76%). Interest for a month is `round(balance * bps / 120000)`. There is one rounding rule, half up to the franc, applied at the posting. Floats from the data are converted when the world is built.
- The ledger is the only place cash changes: `post(draft, { reason, amount, building, counterparty })` adds to the month's ledger and emits a cash event. Tests check that postings sum to the cash change over any action, ported from the Paradeplatz fuzz test, and that assets minus loans equals equity.
- Bank rules come from the concept note: at least 10% hard equity, amortisation to two thirds of lending value within 15 years, an affordability test at an imputed 5% rate with 1% amortisation and 1% upkeep under about a third of income, and periodic review. How banks count rental income for investors is not verified. Product rates start from the SNB `zikrepro` levels (section 2.2) plus a spread by bank and loan to value.
- Gains tax by holding period follows the Zurich tariff in the concept note. Because that tariff makes quick resale expensive, the sim should show flipping losing to holding. That is a balance check and a way to test the claim.
- Every rule is a data entry: `{ id, value, source, checked, verified }`. `scripts/rules-report.mjs` prints the unverified ones. At the moment that includes the investor affordability treatment, the Federal Court ruling on the return allowed on value-adding work, and every assumption listed in section 2.4.

#### 3.3.5 Market, tenants, listings

Market. State per area: price index, rent index, and later vacancy. Price index moves with a drift, a response to rate changes, momentum and a quarterly shock. Rent indices are slow: in-place rents follow the reference rate rule (3% per 0.25 point rise, per the concept note), while new-let rents follow the market faster. Calibrate drift and sensitivity to the 2009 to 2025 condo series (7,738 to 17,646 CHF per m²) and the SNB rate history. A test checks that over 16 years the simulated city price multiple has the observed 2.28 inside its 5th to 95th percentile. Vacancy stays near zero in the first version (0.106% in the data), so voids come from turnover and renovation only. Market reports are an event deck like `src/data/market.js`, with the same test that one pass is roughly neutral.

Tenants. A tenant exists only for owned or rival units: `{ id, unit, rent, since, band, mood, arrears }`, with an invented name and a one-line story. Monthly turnover depends on tenure band, the gap between in-place and market rent, and mood. The lease-age bands and their rent factors (0.90, 0.76, 0.62) come from the survey. I found no published turnover rate, so turnover is an assumption to tune. Resetting rent on turnover is the main income lever, limited by the initial-rent form risk from the concept note.

Listings follow section 2.4 and are a pure function of the seed, the data version and the month. That also gives a daily deal for free: the same seed and snapshot give the same puzzle.

#### 3.3.6 Randomness

Paradeplatz keeps one RNG integer in the state, so any extra draw shifts everything after it. For a long career that is fragile. Use named streams instead: `stream(seed, name, ...labels)` returns a fresh mulberry32 seeded by an FNV-1a hash of its inputs, for example `stream(seed, 'market', month)` or `stream(seed, 'negotiation', listingId, round)`. Adding a feature never changes the draws of another, replays are exact, and skipping ahead in chunks gives the same result as month by month. The state then stores no RNG position, only the seed. A determinism test hashes the state after 120 months and requires the same hash across runs and chunk sizes.

#### 3.3.7 Negotiation and rivals

Negotiation uses the Paradeplatz protocol: a pending record with `actor`, `from`, `offer`, `origin`, `counters` per side and a `history`, a counter limit per side, and a coarse interest signal on each reply. The seller has a private reservation price built from fair value and motive (estate sale, divorce, developer in a hurry) and a patience that falls with each round. Rivals create a deadline, because a listing can sell elsewhere between your offer and their reply. The reply is drawn from `stream(seed, 'negotiation', listingId, round)`.

Rivals run inside the engine tick as pure functions, so there is no per-bot delay in the controller. Start with three types and use the owner mix in 2.4 as a guide. Add `decideRivalAction` with a strict mode that throws on an illegal move, as `decideBotActionStrict` does, so the sim catches mistakes.

#### 3.3.8 Controller, saves, UI defaults

- The controller keeps the Paradeplatz structure: `dispatch`, a `stopped` flag, `withTimeout`, `safely`, a settings store. It gets simpler, because a month is computed in one synchronous call and playback is just a report and a few toasts.
- Skip-ahead runs in chunks of a few months with a yield between chunks, and checks `stopped` each time.
- Autosave after every month, with a visible warning if it fails. Saves carry `v` (schema), `dataVersion` and `rulesVersion`. Migrations are small pure functions with tests. Offer an export and import of the save as a file, since there are no accounts.
- Storage size is a risk. Browsers commonly limit `localStorage` to about 5 MB per origin (general knowledge, not tested here). Keep history sparse (monthly for the last 24 months, yearly before that) and move to IndexedDB if a test career gets near the limit.
- UI starts with gentle, warm synthesized sound on (mute and volume in settings), a fixed map framing, reduced motion respected, and tabular numerals for money. The map shows the chosen Kreise, the player's buildings, and the listings, and moves only when the player asks.

#### 3.3.9 Tests and simulation

- Unit tests per module, with fixed fixtures. A small fixture world of a handful of buildings keeps them fast.
- Fuzz and invariants after every action: cash and loans consistent, loan to value within the product's limit, no NaN, balance identity, ownership consistent, every legal action applies, JSON round trip equal.
- Calibration tests from 2.4 and the market backtest from 3.3.5.
- Data tests: header check, EGIDs unique, every flat's EGID exists, coordinates inside the bounding box, manifest hashes match.
- `scripts/sim.mjs`: bot careers of 15 to 20 years across seeds and strategies (cautious, heavy borrower, flipper, renovator). Fail on stalls, illegal actions, broken invariants. Print balance statistics: which strategy wins, how often careers end in forced sales, whether flipping loses to holding.
- Save tests: round trip, old-version migration, refusal on a mismatched `dataVersion`.

#### 3.3.10 Data build pipeline

All network access is at build time. The game at runtime only fetches map tiles and fonts.

| Step | Input | Output |
|---|---|---|
| `fetch-ckan.mjs` | CKAN `package_show`, then the resource URL, following redirects | cached CSVs in `scripts/.cache/` (already ignored in Paradeplatz) |
| `fetch-gwr.mjs` | register buildings and flats | cached CSVs |
| `fetch-footprints.mjs` | survey WFS, bounding boxes per Kreis, `SRSNAME=EPSG:4326`, polite gap | cached GeoJSON |
| `fetch-snb.mjs` | two cubes | cached CSV |
| `build-world.mjs` | the caches plus Kreis and Quartier polygons | `data/world-<kreise>.json` and `data/manifest.json` with id, URL, date retrieved, SHA-256, row count, licence |
| `verify-world.mjs` | the world file | the data tests above |

Every script sets a descriptive User-Agent, waits at least 1.1 s between calls to a shared service, caches, and stops if a header changed. No dependencies: Node 24's `fetch`, a small CSV parser, the LV95 formula and a point-in-polygon function, all short. If a library is ever wanted, ask first.

Region for the first version: Kreis 4 and Kreis 5 are my suggestion (central, mixed stock, a large spread between rents). The condo medians there rest on 21 and 29 sales, which is why the calibration uses shrinkage. I have not counted buildings per Kreis, since that needs the 36 MB building file.

#### 3.3.11 Performance targets

These are targets, not measurements. State and tick cost proportional to owned units, listed units and areas. One monthly tick under 5 ms with 200 owned units and 20 rival units on a laptop. A 15-year career of 10 bots under 2 s. The save for a mid-game career under 1 MB. Measure all four in the first sim.

## 4. Open items and things I could not confirm

- BFS terms of use for the GWR: only the geo.admin.ch legend (level A public, no restriction) and the OSM wiki's report that attribution is required.
- opendata.swiss terms page: 403. The meaning of `#terms_open` and `#terms_by` is my reading.
- ImmoScout24 and Comparis terms: 403, search summaries only.
- Overpass: no successful response on the day. Not needed in the plan.
- SNB `zikrepro`: definition page unreadable, so new business versus stock is not confirmed. Commercial reuse of SNB data is not cleared.
- BWO reference rate history: no table on the pages I opened.
- Survey WFS: bulk query behaviour and limits not tested.
- Browser storage limit: not tested.
- Whole-building capitalisation rates, asking-to-sale gap, renovation costs, running-cost ratios, turnover, time on market: no free source found. They are assumptions.
- How banks count rental income for investors, and the Federal Court ruling 4A_75/2022 on returns for value-adding work: still unverified from the concept note.
- A legal check on simulating real addresses is advisable before any public release.
- Region choice and the building count per Kreis.

## 5. Sources opened

Open Data Zürich CKAN API and the datasets in 2.2, all at `https://data.stadt-zuerich.ch/dataset/<id>`. City survey WFS: https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Amtliche_Vermessung_Stadt_Zuerich. geo.admin.ch: https://api3.geo.admin.ch (find, SearchServer, legend). BFS public dump (HEAD only): https://public.madd.bfs.admin.ch/zh.zip. opendata.swiss API: https://ckan.opendata.swiss/api/3/action/package_search. SNB cubes: https://data.snb.ch/api/cube/snbgwdzid/data/csv/en and https://data.snb.ch/api/cube/zikrepro/data/csv/en. SNB copyright: https://www.snb.ch/en/srv/disclaimer_copyright. BWO: https://www.bwo.admin.ch/de/referenzzinssatz and https://www.bwo.admin.ch/de/referenzzinssatz-news. Nominatim policy: https://operations.osmfoundation.org/policies/nominatim/. Overpass wiki: https://wiki.openstreetmap.org/wiki/Overpass_API. OSM copyright: https://www.openstreetmap.org/copyright. OSMF produced work guideline: https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline. OSM wiki on Swiss register data: https://wiki.openstreetmap.org/wiki/Switzerland/GWR. OpenFreeMap: https://openfreemap.org/ and https://tiles.openfreemap.org/styles/liberty. swisstopo terms: https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices. Federal geoservices terms: https://www.geo.admin.ch/en/general-terms-of-use-fsdi/. geo.admin.ch fair-use notice: https://www.geo.admin.ch/en/change-limits-fair-use (no numbers on the page). Homegate terms: https://www.homegate.ch/c/de/ueber-uns/rechtliches/agb.

Paradeplatz files read: `docs/261001_Paradeplatz design spec.md` (sections 5 to 9), `src/controller.js`, `src/main.js`, `index.html`, `src/engine/rng.js`, `actions.js`, `events.js`, `index.js`, `src/map/mapView.js`, `src/ui/sfx.js`, `styles/tokens.css`, `styles/hud.css`, `scripts/sim.mjs`, `scripts/verify-coords.mjs`, `tests/` headers, `docs/design/261002_addictive lens feel.md`, `docs/design/261002_negotiation spec.md`.

Not opened (403, no usable content, or not fetched): ImmoScout24 terms, Comparis terms, opendata.swiss terms page, housing-stat.ch pages, i14y.admin.ch page, data.snb.ch cube page, the full GWR CSV files and the BFS ZIPs.
