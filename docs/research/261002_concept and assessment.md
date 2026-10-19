# Immo Mogul: concept and honest assessment

Date: 2 October 2026. Status: concept, nothing built yet.

## 1. Verdict

Yes, build it, but treat "very realistic" as a promise about the rules and not about the pace. A game that follows Swiss mortgage rules, Zurich tenancy law and the Zurich property gains tax gives you hard, real decisions. A game that also makes you wait months for a permit, fill in forms and watch a slow 3% yield trickle in is a spreadsheet with a map.

Who it is for: adults who like finance and management games (the Football Manager crowd, people who play Anno or Capitalism for the economy), Swiss and Zurich locals who will enjoy seeing their own street, and people curious about how buying property here actually works. It is not a mass-market game. That is fine for a personal project, and it is also the honest ceiling if it ever goes public.

The most useful thing the research turned up is that realistic Zurich does not reward flipping. Selling within a year adds 50% to the property gains tax, within two years 25%, and the tax falls the longer you hold ([Kanton Zürich tariff](https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/steuern-finanzen/steuern/vertreter/steuerbuch/zstb-nr-225-1.pdf)). The city's vacancy rate was 0.11% on 1 June 2026 ([Stadt Zürich](https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen/2026/08/leichter-anstieg-252-leerwohnungen-in-zuerich.html)), so finding tenants is easy and pushing up rents is what the law makes hard. The realistic game is about buying well, renovating to justify higher rents, managing leverage and choosing when to hold and when to sell. I think that is a better game than "flip houses", and none of the games in the scan below does it.

## 2. Where realism helps and where it kills the fun

Keep these, because each one forces a real decision:

- Equity rules: At least 10% of the price must come from your own funds and not your pension, and the loan must come down to two thirds of the lending value within 15 years ([Swiss Bankers Association, 27.03.2024](https://www.swissbanking.ch/en/media-politics/news/basel-iii-final-sbvg-passt-selbstregulierungen-im-hypothekarbereich-an)). Since 1 January 2025 the same minimums apply to buy-to-let as to owner-occupied homes (same source). This is the gate on your first deal and the brake on growth.
- The affordability test: Banks compute costs at an imputed 5% interest rate, plus 1% amortisation and 1% of the price for upkeep, and these must stay under a third (some banks 35%) of gross income ([MyKY / HEV](https://www.myky.ch/de/finanzieren-und-kaufen/eigenheim-finanzieren/tragbarkeit-hypothek-berechnen?hi=1)). This is bank practice rather than law. How banks count rental income for investors is **not verified** and needs research before the bank model is final.
- Periodic reassessment: The updated SBA rules require banks to recheck creditworthiness and affordability over time (SBA source above). That gives you a real lose condition: the bank reviews you and you no longer pass.
- The reference rate: Rents move with the federal reference rate: each rise of 0.25 points lets a landlord raise net rent by 3%, each fall gives tenants a claim of about 2.91% ([BWO](https://www.bwo.admin.ch/de/referenzzinssatz)). It is 1.25% and has been since 2 September 2025 (same source). It is reviewed quarterly, which suits a monthly turn with quarterly events.
- Renovation and rent: Value-adding work can be passed on in rent. For a comprehensive overhaul, Art. 14 VMWG presumes 50 to 70% of the cost is value-adding ([WEKA](https://www.weka.ch/themen/bau-immobilien/immobilien/mietzins-und-nebenkosten/article/mietzins-die-anpassung-nach-umbau-oder-sanierung/)). The allowed return on that investment is the reference rate plus 2% while the rate is at or below 2%, per Federal Court 4A_75/2022 as reported by [HEV Schweiz](https://www.hev-schweiz.ch/news/detail/News/bundesgericht-klaert-verzinsung-von-wertvermehrenden-investitionen) (seen in search results only, page **not opened**). This turns renovation into a calculated decision instead of a decoration screen.
- Initial rent form: In the canton of Zurich a new residential lease must use the official initial rent form, which discloses the previous rent ([Kanton Zürich](https://www.zh.ch/de/direktion-der-justiz-und-des-innern/generalsekretariat/formulare-mietwesen.html)). In the game this is a risk: price a new tenant too far above the old rent and they may challenge it.
- Gains tax by holding period: Rates run from 10% on the first CHF 4,000 of gain to 40% above CHF 100,000, with the surcharges above for short holds and reductions from 5% after five full years to 50% after twenty ([Kanton Zürich tariff](https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/steuern-finanzen/steuern/vertreter/steuerbuch/zstb-nr-225-1.pdf)). This alone makes hold-or-sell interesting.

Cut or abstract these. They are realistic but they are not fun:

- Waiting. A notary appointment, a building permit or a renovation is one click and a countdown in months, never a real wait.
- Paperwork. The rent form, the bank file and the purchase contract are a single summary card with the two or three numbers that matter.
- Hands-on renovation. House Flipper already owns painting walls. Here renovation is a menu of packages (kitchen, bathroom, windows, full overhaul) with cost, duration, rent effect and value effect.
- Tenant micro-management. Tenants are people with a face and a line of story, not a stream of repair tickets.

## 3. Core loop

Each month runs through the same steps:

1. **Find.** A feed of listings in real Zurich buildings, each with an asking price, condition, current rent and a short note. Some listings are off-market leads you unlock through contacts. Good deals expire, so you have to choose.
2. **Negotiate.** You offer, the seller counters, you counter again. Sellers have motives (estate sale, divorce, a developer in a hurry) that change how far they move. This is the counterproposal mechanic the owner asked for in Paradeplatz, and it belongs at the heart of this game.
3. **Finance.** Pick a bank and a product (fixed for 2, 5 or 10 years, or SARON). The bank runs the equity and affordability test in front of you and says yes, no, or yes with conditions.
4. **Renovate.** Choose a package, or nothing. The game shows the cost, the months the unit is empty, and the legal rent increase it justifies.
5. **Rent.** Set the rent within the legal range, pick from applicants, live with the reference rate moving.
6. **Sell or hold.** Sell to cash out, with the gains tax shown before you confirm. Or refinance against a higher valuation to fund the next deal.
7. **Reinvest.** The cash from steps 5 and 6 goes back into step 1.

Upgrades should not wait for a full set, which was the owner's complaint about Paradeplatz. Every single unit can be improved on its own. Owning a whole building, or several in one Quartier, unlocks bigger moves on top of that: a facade or energy overhaul, adding a storey where zoning allows, or splitting a building into condominiums.

## 4. Time model

Turn-based play, where one turn is one month and events land each quarter. Real time is the wrong choice here.

- Monthly turns are the natural unit for rent, interest and amortisation, and they keep the screen still. The Paradeplatz feedback (too much movement, sounds annoying) points away from a real-time city sim.
- Quarterly events carry the reference rate (reviewed quarterly by BWO), bank rate changes, the market report and price moves.
- A "skip to next event" button fast-forwards quiet months so the slow parts of real estate never feel slow.
- A standard game runs 15 to 20 in-game years, which at a few seconds per quiet month is about an hour or two.

## 5. Win, lose, difficulty, progression

**Modes**

- **Career.** Start with savings and a salary, end when you choose. Milestones mark progress: first unit, first full building, first million in equity, a building in every Kreis.
- **Scenarios.** Fixed goals and a time limit, for example "turn CHF 250,000 into CHF 2M of equity in 12 years". Historic scenarios built on real rate history are possible later, but the history needs research first.
- **Daily deal.** One seeded puzzle a day, the same for everyone: a building, a budget, a bank. The goal is the best return in ten turns. It takes five minutes and is the kind of thing people keep a streak on.

**Losing**

- Insolvency: you cannot pay interest and the bank forces a sale.
- Failing a bank review at loan renewal, which forces you to put in cash or sell.
- In scenarios, missing the target by the deadline.

**Difficulty** comes from starting capital, salary, how hard banks lend, how fast the market moves and how aggressive rival investors are. Easy mode can loosen the bank rules a little, but the default should be the real rules, because they are the point.

**Progression**: contacts that unlock off-market deals and better contractors, a reputation with banks that lowers margins, and a reputation with tenants that cuts vacancies and disputes.

## 6. Making it addictive in a fair way

The pull should come from the decisions themselves.

- **One more month.** Every turn ends with something pending: a renovation finishing next month, a counter-offer due, a rate decision next quarter.
- **A deal feed with expiry.** Scarcity of good deals is real in Zurich and makes every month worth opening.
- **A clear number going up.** Net worth and equity on screen at all times, with a chart of your history.
- **Collection.** A building in every Kreis, every renovation type completed, every bank as a client.
- **Short sessions.** Autosave every turn, resume in one click, the daily deal in five minutes.
- **Fair play.** The game sells nothing and has no loot boxes or energy timers. It does not invent urgency or send notifications to pull you back. Sound is on by default but gentle and warm, which is a lesson from Paradeplatz: the owner asked for warmer sounds, not silence.

## 7. Single player first

Yes. A single player against AI rival investors who bid on the same listings, plus the daily deal for comparison. Bots that play like real types (a pension fund, a family office, a local who buys one flat) give the competition without the cost of building multiplayer. Hot-seat or online play can come later if the single-player game works.

## 8. Competitive scan

| Game | Platform | What it does | Gap this game fills |
|---|---|---|---|
| [House Flipper 2](https://en.wikipedia.org/wiki/House_Flipper_2) (Frozen District, 2023) | PC, consoles | Hands-on cleaning and renovation; sold over a million copies ([Gamereactor](https://www.gamereactor.eu/house-flipper-2-has-sold-1-million-copies-1675193/)) | No financing, no tenancy law, no real city |
| [The Tenants](https://store.steampowered.com/app/1009560/The_Tenants/) (2021) | PC | Landlord sim, tenant picking and design; 78% positive of 3,713 reviews | Light economy, fictional city |
| [Landlord Simulator](https://store.steampowered.com/app/803310/Landlord_Simulator/) (2018) | PC | Buy, fix and rent in a fictional town; too few reviews for a score | Small, fictional |
| [Rent Due](https://store.steampowered.com/app/4923090) (Early Access, Aug 2026) | PC | First-person landlord with bank loans, tenant screening and evictions with legal grounds; 58% positive of 84 | Closest on "realism" but US-style, fictional, first person |
| [Rentlord](https://store.steampowered.com/app/3546440) (2025) | PC | Roguelike combo game about rents; about 70% positive of 374 | Abstract, not realistic |
| [Estate Agent Simulator](https://store.steampowered.com/app/2553050/Estate_Agent_Simulator/) (Early Access 2023) | PC | Buy, decorate, rent, negotiate; Mixed, 67% of 573, no update in over 20 months | Stalled, fictional |
| [Real Estate Simulator 2](https://store.steampowered.com/app/3743420/Real_Estate_Simulator_2/) and [From Bum to Millionaire](https://store.steampowered.com/app/2738900/REAL_ESTATE_Simulator__FROM_BUM_TO_MILLIONAIRE/) (Geekon) | PC | Buy, renovate, sell; both Mixed (41% of 31, 44% of 176) | Low quality signal, no finance depth |
| [Get Rent](https://apps.apple.com/us/app/landlord-go-real-estate-tycoon/id1207764294) | Mobile | Real-world map, buy and upgrade real buildings; free with loot boxes and ads; 4.6 from 6,400+ ratings | Real map but no real rules, and monetised with loot boxes |
| [Monopoly Tycoon](https://en.wikipedia.org/wiki/Monopoly_Tycoon) (2001) | PC | Real-time city of shops and flats against AI; nearly 2M copies, Metacritic 85 | Fictional city, old |

What none of them have: a real city with real building footprints, Swiss bank rules, Swiss tenancy law and a real tax schedule. Get Rent proves people enjoy owning buildings they walk past. Rent Due shows there is appetite for rules-heavy landlord play. The gap is the two combined, done honestly and in one city.

## 9. Data you can use for free

- **Condominium prices** by year, room count and building age, City of Zurich, 2009 to 2025, CC0 ([Open Data Zürich](https://data.stadt-zuerich.ch/dataset/bau_hae_preis_stockwerkeigentum_zimmerzahl_gebaeudealter_od5156)).
- **Rents** for 2, 3 and 4 room flats down to Quartier level, surveys every two years since 2022, CC0 ([Open Data Zürich](https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161)).
- **Property market price series** by Kreis and Quartier (LIMA) and canton-level prices exist on opendata.swiss ([listing](https://opendata.swiss/de/dataset/liegenschaften-markt-stadt-zurich-preisreihen-medianpreise-und-anzahl-handanderungen-in-fr-20081)); the page returned 403 to the fetcher, so contents and licence are **not verified**.
- **Maps and 3D buildings** from swisstopo, free for all uses with source attribution ([swisstopo](https://www.swisstopo.admin.ch/en/free-geodata-ogd)), including swissBUILDINGS3D. Paradeplatz already uses swisstopo and OpenStreetMap through MapLibre, so the map module can be reused.
- **Building register (GWR)**: public level A data reportedly includes building year and dwelling counts. The source pages did not load, so this is **not verified**.

## 10. Biggest risks and how to handle them

1. **Data legality.** Homegate's terms forbid systematically reading out content, for example by scraping ([Homegate AGB, section 7](https://www.homegate.ch/c/de/ueber-uns/rechtliches/agb)). Real listings are out. Use only open data for price and rent levels, and generate the listings themselves inside real buildings. Never show real owners or tenants. Add a line saying the game is not financial or legal advice.
2. **Spreadsheet feel.** The biggest design risk. Counter it with the map as the main screen, tenants and sellers as people, one headline number per decision, and the negotiation as a conversation rather than a form.
3. **Slow, realistic returns.** Zurich yields are low and prices high. Leverage, renovation uplift and the occasional market swing have to carry the drama. Typical Zurich gross yields were **not researched** for this note and need numbers before balancing.
4. **Legal accuracy.** Swiss tenancy law is full of exceptions. Model the five or six rules above well and say in the game that the rest is simplified.
5. **Scope.** Renovation interiors, commercial property, new builds and multiplayer can each eat months. They are all out of the first version.

## 11. MVP scope

- One or two Kreise, condominiums and small apartment buildings only.
- Monthly turns, quarterly reference-rate and market events, a 15-year career.
- Three banks with real equity, amortisation and affordability rules.
- Negotiation with counter-offers.
- Four renovation packages with the 50 to 70% rule behind the rent effect.
- Renting with the reference-rate rule and the initial rent form risk.
- Selling with the Zurich gains tax.
- Two or three rival bot investors.
- Gentle, warm sound on by default with a mute, a fixed or slow camera, autosave.

Later: the whole city, the daily deal, scenarios, building-level upgrades (storeys, splitting into condos), commercial units, historic rate scenarios.

## 12. New session and project?

Yes, a new session in `the project folder`. The engine is an economic simulation with monthly cash flows, not a dice loop around a board, so it shares little code with Paradeplatz beyond the map module and the visual style. A separate session keeps the Paradeplatz context and fixes clean, and lets the new project start with its own spec, data notes and tests. Reuse from Paradeplatz: the MapLibre map setup, the swisstopo and OSM attribution, the agent setup in `.claude/agents/`, the deterministic engine pattern (pure functions from a seed) and the bot simulation harness.

## 13. Working titles

1. **Immo Mogul Zürich**. Plain, says what it is, matches the folder.
2. **Stockwerk**. The Swiss word for floor, and the root of Stockwerkeigentum, the condo ownership you start with.
3. **Referenzzins**. For locals the rate is the whole story of Zurich rents. Insiders will smile at it; everyone else will need it explained.

## Sources opened for this note

- Kanton Zürich, gains tax tariff, eForm 225.1 (09.25): https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/steuern-finanzen/steuern/vertreter/steuerbuch/zstb-nr-225-1.pdf
- Stadt Zürich, vacancies on 1 June 2026: https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen/2026/08/leichter-anstieg-252-leerwohnungen-in-zuerich.html
- Swiss Bankers Association, mortgage self-regulation update, 27.03.2024: https://www.swissbanking.ch/en/media-politics/news/basel-iii-final-sbvg-passt-selbstregulierungen-im-hypothekarbereich-an
- MyKY (HEV), affordability calculation: https://www.myky.ch/de/finanzieren-und-kaufen/eigenheim-finanzieren/tragbarkeit-hypothek-berechnen?hi=1
- BWO, reference interest rate: https://www.bwo.admin.ch/de/referenzzinssatz
- WEKA, rent after renovation and Art. 14 VMWG: https://www.weka.ch/themen/bau-immobilien/immobilien/mietzins-und-nebenkosten/article/mietzins-die-anpassung-nach-umbau-oder-sanierung/
- Kanton Zürich, rental forms: https://www.zh.ch/de/direktion-der-justiz-und-des-innern/generalsekretariat/formulare-mietwesen.html
- Homegate terms: https://www.homegate.ch/c/de/ueber-uns/rechtliches/agb
- Open Data Zürich, condo prices: https://data.stadt-zuerich.ch/dataset/bau_hae_preis_stockwerkeigentum_zimmerzahl_gebaeudealter_od5156
- Open Data Zürich, rents: https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161
- swisstopo, free geodata: https://www.swisstopo.admin.ch/en/free-geodata-ogd
- Game pages: the Steam, App Store, Wikipedia and Gamereactor links in the table in section 8, all opened on 2 October 2026. Steam review counts and prices change daily.

Not opened, or opened without usable content: HEV Schweiz on 4A_75/2022, the opendata.swiss LIMA page (403), the GWR pages on housing-stat.ch and i14y.admin.ch.
