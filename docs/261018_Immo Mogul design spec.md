# Immo Mogul: design spec (v1 prototype)

Date: 18 October 2026. Status: decided and built in the same session, on the owner's instruction to make the open calls without a brainstorm. Read with the three research notes in `docs/research/`, which stay the rules ledger and the source register.

## 1. One paragraph

You are a private property investor in Zurich with an inheritance and a good salary. Each month you browse a handful of listings inside real buildings in Kreis 4 and Kreis 5, negotiate with a seller who counters, get a bank to say yes, renovate, let, hold or sell. The rules are Swiss: equity floors, the 5% affordability test, amortisation of the second mortgage, the reference rate, the value-adding renovation formula, the initial rent form and the Zurich property gains tax with its short-hold surcharges. The pace is not Swiss: a month is one click, a notary appointment is a line in a log. The career lasts 15 years (180 months). The number that goes up is net worth.

## 2. Decisions taken in place of the brainstorm

| Question | Decision | Why |
|---|---|---|
| Kreise | 4 and 5 | Central, mixed old and new stock, the widest rent gap in the city, and the research already anchored the figures there. |
| Title | Immo Mogul, subtitle Zürich | Matches the folder and says what it is. "Stockwerk" and "Referenzzins" stay as in-game vocabulary. |
| Banks | Three fictional banks: Limmat Kantonalbank (cantonal: 25% equity on buy-to-let, amortisation in 10 years, 33% cap, cheapest fixed rates), Sihlbank Privat (private bank: 20% equity, 15 years, 35% cap, higher spread, counts 80% of rent), Üetli Hypo (online lender: 25% equity, 15 years, 33% cap, only 5 and 10 year fixed, lowest 10-year rate, slow to review). Any resemblance to a real bank is unintended. | Three distinct trade-offs: cheap but strict, flexible but dear, cheap long money but rigid. |
| Renovation packages (per unit) | Refresh (paint and floors, CHF 450/m², 1 month, tenant can stay, no rent increase), Kitchen (CHF 25,000 + 100/m², 1 month), Bathroom (CHF 28,000, 1 month), Full overhaul (CHF 1,250/m², 3 months, flat must be empty). Value-adding share: 0%, 50%, 50%, 60%. | The four from the concept note, costed from the helply and myky ranges in the rules note with a Zurich uplift. |
| Building-level move | Facade and energy when you own every unit of a building: CHF 350/m² of flat area, 4 months, all units +10 condition, 60% value-adding, running costs down 10%. | One move is enough to show the "own the whole house" bonus without making it a precondition for anything. |
| Rivals | Three bots: Pensionskasse Limmat (buys whole buildings near fair value, never sells), Hürlimann Family Office (opportunistic, strongest in Kreis 5), Reto Brunner (local, single condos, limited cash). | The owner mix in the city data (companies, natural persons, cooperatives) suggests those three shapes. |
| Milestones | First flat, three units, first whole building, ten units, CHF 1M / 2M / 5M equity, first full overhaul, first sale with a gain, both Kreise, all three banks, five years without a bank warning, net worth doubled. | Collection and progression without any purchase. |
| Player | Swiss or C permit. Normal start: CHF 1,000,000 savings (all hard equity), gross salary CHF 180,000, CHF 4,500 a month saved after tax and living costs. Easy: 2,000,000 / 220,000 / 6,500. Hard: 600,000 / 150,000 / 3,000. | At Zurich prices a smaller start cannot pass a single affordability test. The research says the game is for people who can already buy; the difficulty slider expresses that honestly. |
| Start date | January 2027 | Clean years, and today's rates are the opening rates. |

## 3. Core loop and screens

One screen: the map (MapLibre, OpenFreeMap Liberty, fixed framing on Kreis 4 and 5, moves only on a click) with a top bar (date, cash, equity, net worth, End month, Skip to next event) and a left panel with four tabs: Deals, Portfolio, Bank and Report. Clicking a listing or an owned building opens a sheet on the right with the facts (marked "register" or "simulated"), the numbers that matter and the actions.

1. Find. Three to five new listings a month, each a condo or a whole small building, with an asking price, condition, rent roll, seller type and expiry in months. A rival can take a listing between months. Good deals go first.
2. Negotiate. Offer, counter, accept or walk away. Each side counters at most three times. The seller has a private reservation price and a motive (estate, relocation, divorce, developer, pensioner, investor), and replies with an interest signal: keen, lukewarm, cold. A sale of your own unit runs the same protocol with the roles swapped: a buyer offers, you counter.
3. Finance. Pick a bank and a product (SARON, 2, 5, 10 year fixed). The bank shows its lending value, the equity it needs, the affordability ratio and the maximum loan it will grant. You may borrow less. Costs on purchase: notary 1‰ plus VAT, land registry 1‰, mortgage note 2‰ of the loan.
4. Renovate. Package menu with cost, months, rent effect under the Federal Court formula (sitting tenant) or the re-let rent (empty flat) and the value effect.
5. Let. When a flat is empty you set the rent. The sheet shows the market rent for that flat, the previous rent and the challenge risk if the jump is over 10% and above market. Two or three applicants with a line of story; pick one. A reference rate rise lets you pass on 3% per quarter point plus 40% of inflation to sitting tenants; a fall gives them 2.91%.
6. Hold or sell. List a unit at an asking price; buyers offer and counter. Before you accept, the sheet shows the gains tax by holding period and the net proceeds. Or refinance against the new valuation to fund the next deal.
7. Bank reviews. Once a year each bank re-runs the affordability test. A fail is a warning, two in a row force cash in or a sale. A fixed period ending asks you to pick a new product.

## 4. Rules in the engine, with their status

All rule constants live in `src/data/rules.js` as `{ id, value, source, checked, status }`, where status is `verified`, `secondary` or `assumption`. `node scripts/rules-report.mjs` prints the assumptions.

Verified or secondary (from the rules note): equity 20% minimum and 10% hard; buy-to-let 25% at the cautious bank and 20% at one; amortisation to two thirds within 15 years (10 at the cautious bank); imputed 5% interest (4.5% at one bank), 1% upkeep, 33% or 35% cap; reference rate 1.25% with 3% per quarter point up and 2.91% down plus 40% of CPI; value-adding share 50 to 70% and the Federal Court formula (interest (reference + 0.5%) / 2, amortisation 1 / lifespan, +10%); initial rent challenge risk when the jump is over 10%; gains tax brackets, surcharges and reductions; no transfer tax; notary and land registry 1‰ each and 2‰ on a new mortgage note; SNB and ZKB opening rates; rents and prices per Kreis and Quartier from the city data.

Assumptions (visible in the rules table and in the game's help): the combined household affordability test (salary plus 80% of rent against all loans) in place of a pure net-rent test; whole-building capitalisation rate 3.0% in Kreis 4 and 2.8% in Kreis 5; asking premium 0 to 15% over fair value; tenant turnover by lease age; running costs 0.8% (condo) and 1.0% (building) of value a year; broker fee 2% on a sale; income tax at 25% on net rental profit; rate paths as a mean-reverting random walk; price drift 3% a year with rate sensitivity; renovation costs and the Zurich uplift; bank valuation within 5% of fair value.

## 5. Technical shape

Static site, ES modules, no build step, no dependencies at runtime beyond MapLibre from unpkg and fonts. Engine is pure and deterministic: named RNG streams `stream(seed, name, ...labels)` so adding a feature never shifts another draw; integer francs; one rounding rule; a ledger for every cash movement. World data is a read-only snapshot in `data/world.json` built from Open Data Zürich by the scripts in `scripts/data/`. Saves hold only what the game changed, with `v`, `seed` and `dataVersion`, autosaved every month to localStorage with a visible warning if that fails, and an export/import as a file.

Controller and UI follow Paradeplatz: scoped CSS resets, Swiss red accent, light and dark, 44 px targets, tabular numerals, gentle warm synthesised sound on by default with mute and volume, `prefers-reduced-motion` respected, nothing shakes or flashes, the map moves only on a click.

Tests: `node --test tests/`. Unit tests per module, ledger invariants, determinism hash over 180 months in different chunk sizes, save round trip, rule conformance (tax table against the official worked figure, reference rate arithmetic, renovation formula against the worked example), calibration of generated rents and prices against the world stats, and `scripts/sim.mjs` running bot careers over 200 seeds for four strategies (cautious, leveraged, flipper, renovator), failing on stalls, illegal actions or broken invariants and printing whether flipping loses to holding.

## 6. Out of scope for v1

The other ten Kreise, the daily deal, scenarios, adding storeys, splitting a building into condos, commercial units, new builds, historic rate replays, multiplayer, real photographs, tenant disputes beyond the initial rent challenge, indirect amortisation through pillar 3a, Lex Koller beyond a note.

## 7. Definition of done for this session

A career plays from January 2027 to December 2041 in the browser from `play.cmd`. Every listing sits in a real building from the register. Every offer can be countered. Tests and the 200-seed simulation pass. Sound is gentle and on by default, the map stays still, and the README carries the credits and the non-advice line.
