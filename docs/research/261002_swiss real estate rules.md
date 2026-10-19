# Swiss and Zurich real estate rules for Immo Mogul

Research for a realistic investor game set in the city of Zurich. Every figure below was checked on 2026-10-02 against the page cited next to it, unless the row says otherwise.

**Status labels**

- **Verified**: I opened the source and read the number there.
- **Verified (secondary)**: read on a reputable bank, court or industry page because no official page states it plainly.
- **Partly verified**: the source covers the rule, but one detail comes from a search snippet or a paraphrase and should be re-read before it is treated as final.
- **Unverified**: standard Swiss practice that I did not confirm against a source in this pass. Do not hard-code it without a check.

**Changed recently** marks anything that moved in the last 18 months or is about to move.

---

## 1. Interest rates and the reference rate

| Item | Rule and numbers | Source | Status |
|---|---|---|---|
| SNB policy rate | 0.00%. Last assessment 24 Sep 2026, rate held. | https://www.snb.ch/en/ | Verified |
| SARON (monthly average) | Sep 2026: -0.068%. It has been between -0.04% and -0.08% every month in 2026. | SNB data portal, cube `zimoma`: https://data.snb.ch/api/cube/zimoma/data/csv/en | Verified |
| Average offered mortgage rates, all banks (SNB survey, mean, Aug 2026) | Variable 2.79%. Fixed 1y 1.43%, 2y 1.51%, 3y 1.61%, 5y 1.76%, 7y 1.87%, 10y 2.03%. Fixed rates rose about 0.15 points between June and August 2026. | SNB data portal, cube `zikrepro`: https://data.snb.ch/api/cube/zikrepro/data/csv/en | Verified (the dimension labels come from the cube's own metadata) |
| ZKB indicative rates (Richtsätze), 2 Oct 2026 | Fixed 2y 1.78%, 3y 1.92%, 5y 2.05%, 7y 2.13%, 10y 2.25%, 15y 2.45%. SARON mortgage (Rollover) priced one by one, no published rate. Real offers depend on credit, LTV and property type. | https://www.zkb.ch/de/private/hypotheken-immobilien/hypotheken-zinsen/aktuelle-hypothekarzinsen.html | Verified |
| SARON mortgage price in practice | SARON (floored at 0%) plus a bank margin. Comparison sites show offers from about 0.75%. | Search summary of hypotheke.ch, moneypark.ch and others | Unverified, treat as indicative |
| Buy-to-let surcharge | Most banks charge up to 25 basis points more for investment property than for owner-occupied. | realadvisor.ch (search summary) | Unverified |
| Reference rate (Referenzzinssatz) | 1.25%, unchanged since 2 Sep 2025. Next publication 1 Dec 2026. Published quarterly. It is the volume-weighted average mortgage rate of Swiss banks, rounded to the nearest quarter point. | https://www.bwo.admin.ch/de/referenzzinssatz | Verified. **Changed recently**: 1.75% to 1.50% in Mar 2025, then 1.25% in Sep 2025 |
| Rent effect of the reference rate | +0.25 points lets the landlord raise rent by 3%. A 0.25 point fall entitles the tenant to a cut of about 2.91%. On top of that the landlord may pass on 40% of CPI inflation and general cost increases, and may set these against a cut the tenant asks for. | https://www.bwo.admin.ch/de/referenzzinssatz | Verified |

**Game note.** At 1.25% the reference rate is close to its floor, so the realistic risk for the player is that it rises again. Model it as a slow variable that follows the average mortgage rate with a lag of several quarters.

---

## 2. Bank financing

| Item | Rule and numbers | Source | Status |
|---|---|---|---|
| Minimum equity | 20% of the lending value in practice, so the maximum LTV is 80%. | UBS, 25 Feb 2026: https://www.ubs.com/ch/de/services/guide/mortgages-and-financing/articles/how-much-equity-for-house-purchase.html | Verified (secondary) |
| Hard equity | At least 10% of the lending value must be hard equity, meaning savings, securities, gifts or pillar 3a money. It may not come from pillar 2 (pension fund), whether withdrawn early or pledged. | SBA self-regulation as recognised by FINMA. Summarised at https://www.finma.ch/en/news/2012/06/mm-hypo-richtlinien-20120601/ and confirmed for 2025 at https://www.swissbanking.ch/en/media-politics/news/basel-iii-final-sbvg-passt-selbstregulierungen-im-hypothekarbereich-an ; UBS page above | Verified |
| Pension fund money (pillar 2) | May count as soft equity, but only for an owner-occupied primary residence. Minimum withdrawal CHF 20,000, at most once every 5 years, spouse must consent. It cannot be used for a buy-to-let. | UBS page above | Verified (secondary) |
| First and second mortgage | First mortgage up to about 66.7% of the value, no compulsory repayment. Second mortgage runs from 66.7% to 80%. | UBS page above | Verified (secondary) |
| Amortisation of the second mortgage | Down to two thirds of the lending value within 15 years, or by retirement if that comes first. From 1 Jan 2025 this applies to owner-occupied and investment property alike. | SBA, 27 Mar 2024, in force 1 Jan 2025: https://www.swissbanking.ch/en/media-politics/news/basel-iii-final-sbvg-passt-selbstregulierungen-im-hypothekarbereich-an ; UBS affordability page, 13 May 2025 | Verified. **Changed recently**: from 2020 to 2024 investment property needed 25% equity and amortisation within 10 years |
| Investment property in bank practice | UBS still asks for at least 25% equity (max 75% LTV) on buy-to-let and amortisation to two thirds within 10 years, about 1% a year. The self-regulation floor fell, but big banks kept the stricter line, and Basel III final raised capital weights on buy-to-let. | UBS, 14 Oct 2025: https://www.ubs.com/ch/de/services/guide/mortgages-and-financing/articles/affordability-investment-property.html | Verified (secondary). Use 25% as the in-game default and let some banks offer 20% |
| Indirect amortisation | Paying into pillar 3a pledged to the bank in place of reducing the loan. | None opened | Unverified |
| Lending value | Banks lend on the lower of the purchase price and their own valuation, so overpaying raises the equity you need. | None opened | Unverified |

### Affordability (Tragbarkeit)

| Item | Rule and numbers | Source | Status |
|---|---|---|---|
| Calculated interest rate | 5% at most banks, 4.5% at some. Applied to the whole mortgage whatever the real rate is. | UBS, 13 May 2025: https://www.ubs.com/ch/de/services/guide/mortgages-and-financing/articles/affordability.html | Verified (secondary) |
| Maintenance and running costs | 1% of the purchase price a year (UBS). Helvetia uses 0.75%. | UBS page above; Helvetia, 2 Feb 2025: https://www.helvetia.com/ch/web/de/privatkunden/ratgeber/wohnen-freizeit/tragbarkeit.html | Verified (secondary) |
| Income ceiling | Calculated interest plus amortisation plus maintenance must not exceed 33% of gross income (UBS). Some lenders allow up to 35%. | UBS page above; Helvetia page above | Verified (secondary) |
| Investment property | The test runs on net rental income in place of salary, still at a 5% calculated rate. The UBS example deducts 15% of net rent for maintenance. | UBS investment property page above | Verified (secondary) |
| Periodic re-checks | From 2025 banks must reassess creditworthiness and affordability periodically during the loan, not only at signing. | SBA 2024 release above | Verified |

**Worked example (owner-occupier).** Flat CHF 1,500,000. Equity 20% (CHF 300,000, of which at least CHF 150,000 hard). Mortgage CHF 1,200,000. Yearly cost: interest at 5% = 60,000; amortisation of the second tranche (1,200,000 less 1,000,000 = 200,000, over 15 years) = 13,333; maintenance at 1% = 15,000. Total 88,333. Gross income needed: 88,333 / 0.33 = about CHF 268,000 a year.

---

## 3. Rent law

| Item | Rule and numbers | Source | Status |
|---|---|---|---|
| Rent increase after value-adding work | Value-adding investments justify a higher rent (Art. 269a OR, Art. 14 VMWG). For a comprehensive overhaul, 50% to 70% of the cost is presumed value-adding. The tenant may try to prove that the share is under 50%. | Basel-Landschaft cantonal court summary: https://kanton.baselland.ch/politik-und-behorden/gerichte/rechtsprechung/kantonsgericht_rs/chronologische-anordnung/copy_of_2009/34 ; HEV Winterthur: https://www.hev-winterthur.ch/ratgeber/wertvermehrende-investitionen-mit-mehrleistungen-bei-mietobjekten/ | Verified (secondary) |
| How the increase is calculated | Annual increase = value-adding amount x (interest + amortisation + maintenance). Interest = (reference rate + 0.5%) / 2. Amortisation = 100 / lifespan in years. Maintenance = +10% of the subtotal (Federal Court method). Divide by 12 for the monthly figure. | HEV Winterthur page above (12 Jun 2020) | Verified (secondary) |
| Pending change | Consultation (25 Feb to 5 Jun 2026) on amending the VMWG. It would write the Federal Court method for value-adding investments and gross return into the ordinance, and fix the allowed net return at the reference rate +2 points while the reference rate is 2% or lower, with the margin shrinking as rates rise (down to +0.5 points at 6% and above). | BWO release, 26 Feb 2026: https://www.bwo.admin.ch/de/newnsb/dDY_tE-L-W-4eWnlzSnHZ | Verified. **Changing**: final text not adopted yet |
| Bigger reform ahead | On 25 Sep 2026 the Federal Council rejected the Mietpreis-Initiative and backed an indirect counter-proposal instead: a statistical comparison rent for initial rents and indexation during the lease. Consultation planned for the first half of 2027, bill to Parliament by end 2027. | https://www.admin.ch/de/newnsb/EbAjw2abDf3e | Verified. **Changing**. A good candidate for an in-game "politics" event |
| Initial rent challenge | The tenant may challenge the initial rent as abusive within 30 days of moving in, at the conciliation authority, if they were in personal hardship, if the local market forced them to sign, or if the rent is significantly higher than the previous tenant's (the court page names more than 10%). | Zurich courts: https://www.gerichte-zh.ch/de/themen/miete/mietzinsgestaltung/anfechtung-des-anfangsmietzinses | Verified |
| Initial rent form (Formularpflicht), canton of Zurich | When the cantonal vacancy rate is 1.5% or less (counted 1 June, applied from 1 November), the landlord must disclose the previous rent and the new rent on an official form. The rate is 0.52% now, so the form is compulsory. Since 1 Oct 2025 the form must also show the reference rate and CPI that applied to the previous rent. | Courts page above; zh.ch vacancy release, 18 Aug 2026: https://www.zh.ch/de/news-uebersicht/medienmitteilungen/2026/08/leerwohnungsziffer-bleibt-tief.html ; BWO: https://www.bwo.admin.ch/de/nsb?id=104590 | Verified. **Changed recently** (form content, Oct 2025) |
| Vacancy | City of Zurich: 252 empty flats, 0.11% on 1 Jun 2026 (235 a year earlier). Canton: 0.52% (0.48% in 2025). | https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen/2026/08/leichter-anstieg-252-leerwohnungen-in-zuerich.html ; zh.ch release above | Verified |
| Notice period for flats | At least 3 months, ending on a locally customary termination date. Longer periods may be agreed, shorter ones may not. A late notice takes effect on the next valid date. | Zurich courts: https://www.gerichte-zh.ch/de/themen/miete/kuendigung-rueckgabe/ordentliche-kuendigung | Verified |
| Customary termination dates, city of Zurich | 31 March and 30 September, unless the lease says otherwise (most modern leases allow every month end except December). | vertragshilfe.ch and immoscout24 explainers | Unverified, secondary sources only |
| Landlord notice must use the official cantonal form | Art. 266l OR. | None opened | Unverified |
| Challenging a notice and extending the lease | Tenant can challenge a notice within 30 days (Art. 273 OR). Extension of a residential lease up to 4 years in total, granted once or twice (Art. 272b OR). Landlord notices are void during conciliation or court proceedings and for 3 years after the landlord loses or settles a rent dispute (Art. 271a OR). | Zurich courts decision summaries (ZMP series) found by search: https://www.gerichte-zh.ch/fileadmin/user_upload/entscheide/oeffentlich/ZMP_2022_Nr_7_02.pdf | Partly verified. The 30-day challenge period is not confirmed against an opened page |
| Personal use (Eigenbedarf) and sublet reforms | Both rejected by voters on 24 Nov 2024 (sublet 48.4% yes, personal use 46.2% yes). Current law stays: personal use must be urgent. | admin.ch vote pages, figures from the admin.ch search snippet: https://www.admin.ch/gov/de/start/dokumentation/abstimmungen/20241124/kuendigung-eigenbedarf.html | Partly verified (I could not open the result table itself) |

**Worked example (renovation).** A CHF 100,000 comprehensive overhaul, 60% value-adding = CHF 60,000. Interest (1.25% + 0.5%) / 2 = 0.875%. Lifespan 25 years = 4%. Subtotal 4.875%, plus 10% maintenance = 5.36%. Annual rent increase CHF 3,218, about CHF 268 a month across the building. That is why a renovation in a sitting tenancy rarely pays back fast, and why Zurich investors prefer to renovate between tenants and reset the rent on a new letting, within the initial-rent rules above.

---

## 4. Taxes and transaction costs (canton of Zurich)

| Item | Rule and numbers | Source | Status |
|---|---|---|---|
| Property gains tax (Grundstückgewinnsteuer), rates | Charged by the municipality on the gain (sale price less purchase price and value-adding costs), by bracket: 10% on the first CHF 4,000, 15% on the next 6,000, 20% on the next 8,000, 25% on the next 12,000, 30% on the next 20,000, 35% on the next 50,000, 40% on everything above CHF 100,000. Gains under CHF 5,000 are not taxed. | Cantonal tax office tariff, form 225.1 dated 09.25: https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/steuern-finanzen/steuern/vertreter/steuerbuch/zstb-nr-225-1.pdf ; city page: https://www.stadt-zuerich.ch/de/lebenslagen/steuern/grundstueckgewinnsteuer.html | Verified (bracket arithmetic matches the official table: CHF 10,000 gain gives CHF 1,300 tax) |
| Short holding surcharge | +50% if held under 1 year, +25% if under 2 years. | Same tariff | Verified |
| Long holding reduction | 5% after 5 full years, 8% after 6, then +3 points a year: 7y 11%, 8y 14%, 9y 17%, 10y 20%, 11y 23%, 12y 26%, 13y 29%, 14y 32%, 15y 35%, 16y 38%, 17y 41%, 18y 44%, 19y 47%, 20 years or more 50%. | Same tariff | Verified |
| Deductible costs | Purchase price plus notary and land registry fees, value-adding spending on renovation or new build, and normal broker fees. If the last transfer was over 20 years ago, the market value 20 years back can replace the purchase price. | City of Zurich page above | Verified |
| Professional dealers | Gains of commercial dealers in Zurich may face social security contributions on top of the gains tax. | None opened | Unverified |
| Transfer tax (Handänderungssteuer) | None in Zurich since 1 Jan 2005. | Zurich notary offices: https://www.notariate-zh.ch/de/glossar/handaenderungssteuer | Verified |
| Notary fee, purchase contract | 1 per mille of market value, minimum CHF 100, plus VAT. | Notariatsgebührenverordnung LS 243, version of 1 Jan 2017, item 1.1.1: https://www.lexfind.ch/tolv/129646/de ; fee page: https://www.notariate-zh.ch/de/grundbuch/kaufvertrag-etc/gebuehren | Verified |
| Land registry fee, transfer of ownership | 1 per mille of market value, minimum CHF 100, no VAT. | LS 243, item 2.2.1 | Verified |
| Mortgage note (Schuldbrief) | Creating or increasing one costs 1 per mille notary (item 1.2) plus 1 per mille land registry (item 2.3.1) on the pledge amount. Reusing an existing note costs little or nothing. | LS 243; neho.ch summary: https://neho.ch/de/blog/notariatsgebuehren-zuerich | Verified |
| Imputed rental value (Eigenmietwert) | Voters approved abolition on 28 Sep 2025, 57.7% yes. The Federal Council set entry into force for 1 Jan 2029. From then on there is no imputed rent on owner-occupied homes, no maintenance deduction for them, and mortgage interest is deductible only in proportion to rented-out property, plus a capped, time-limited interest deduction for first-time buyers. Rented property keeps its maintenance deduction. Cantons may add a property tax on second homes. | ESTV release, 1 Apr 2026: https://www.estv.admin.ch/de/newnsb/yGTqBPowRqyVh0zPokW-q ; SRF: https://www.srf.ch/news/schweiz/abstimmung-28-september-57-7-prozent-sagen-ja-zur-abschaffung-des-eigenmietwerts | Verified. **Changed recently** |
| Imputed rental value in Zurich until then | The canton decided not to raise imputed values before abolition. Homes built up to 2025 stay on the 2009 guidelines. New builds from 2026 get a 10% flat reduction. | zh.ch, 20 Nov 2025: https://www.zh.ch/de/news-uebersicht/medienmitteilungen/2025/11/kanton-zuerich-verzichtet-auf-erhoehung-der-eigenmietwerte.html | Verified |

**Worked example (flip).** Buy at 1,200,000, renovate for 150,000 of value-adding work, sell after 18 months at 1,600,000. Fees on purchase are about 2,400 (2 per mille) plus VAT. Taxable gain about 247,600. Tax: 29,400 on the first 100,000 plus 40% of 147,600 (59,040) = 88,440, then the +25% surcharge for under 2 years = about CHF 110,550. The same deal held 20 years would pay half the base tax. Zurich taxes short flips hard, and the game should make the player feel it.

---

## 5. Foreign buyers (Lex Koller)

| Item | Rule and numbers | Source | Status |
|---|---|---|---|
| Who is free | EU and EFTA citizens with lawful, actual residence in Switzerland, and anyone with a C permit, buy like Swiss citizens. | zh.ch: https://www.zh.ch/de/wirtschaft-arbeit/grundstueckerwerb-durch-personen-im-ausland.html | Verified |
| Third-country nationals living here (e.g. B permit) | May buy one home without a permit only as their own primary residence. | Same | Verified |
| Business property | Property used as a permanent place of business is free for everyone. | Same | Verified |
| Buy-to-let flats by persons abroad | Needs a permit and is in practice not allowed: residential property as a capital investment is not a ground for approval. | BJ FAQ: https://www.bj.admin.ch/de/fragen-und-antworten | Verified (paraphrased by the fetch tool, re-read before quoting) |
| Planned tightening | Consultation 15 Apr to 15 Jul 2026. Third-country nationals would need a permit even for their primary residence, and would have to sell within 2 years of moving away. Persons abroad could no longer buy business property to rent it out. Lower holiday-home quotas. Ban on buying listed shares of residential property companies and real estate funds. | Federal Council, 15 Apr 2026: https://www.admin.ch/de/newnsb/4mzivVX5Ko4dpap06YtuI | Verified. **Changing** |

**Game note.** Easiest design: the player character is Swiss or holds a C permit. Lex Koller can then show up as a hidden constraint on certain AI buyers, which shrinks the pool of bidders when you sell.

---

## 6. Renovation costs

No official Swiss cost table is public and free. These are industry figures, so the game should treat them as ranges with a random factor.

| Item | Range | Source | Status |
|---|---|---|---|
| Light refresh (paint, floors) | CHF 300 to 600 per m² | helply.ch, 2026: https://www.helply.ch/kosten/wohnung-renovieren | Verified (secondary) |
| Medium renovation | CHF 600 to 1,000 per m² | Same | Verified (secondary) |
| Full flat renovation incl. kitchen and bath | CHF 1,000 to 1,500 per m², so CHF 80,000 to 120,000 for 80 m² | Same | Verified (secondary) |
| Large conversions | CHF 2,500 to 3,200 per m² of net living area | NZZ, via search snippet (paywalled) | Unverified |
| Painting / laminate / parquet / tiles | CHF 25 to 45, 50 to 90, 120 to 250, 100 to 180 per m² | helply.ch | Verified (secondary) |
| Bathroom | Basic CHF 15,000 to 25,000; mid CHF 25,000 to 50,000; premium from CHF 60,000 | myky.ch, 30 Oct 2025: https://www.myky.ch/de/bauen-und-sanieren/innenausbau/badezimmer-renovieren-kosten | Verified (secondary) |
| Kitchen | Standard incl. appliances about CHF 20,000; top segment about CHF 50,000; luxury over CHF 100,000 | myky.ch, 18 Nov 2025: https://www.myky.ch/de/bauen-und-sanieren/innenausbau/neue-kueche-kosten | Verified (secondary) |

Zurich trades usually price above the Swiss average. A +10% to +20% city factor is a sensible game assumption, but it is unverified.

---

## 7. Prices and rents by Kreis (Statistik Stadt Zürich)

Both datasets come from the city's free open data portal (no key). Rents: Mietpreiserhebung, survey date April 2026, dataset `bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161` (https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161). Sale prices: open-market condo sales, dataset `bau_hae_preis_stockwerkeigentum_stadtquartier_od5157` (https://data.stadt-zuerich.ch/dataset/bau_hae_preis_stockwerkeigentum_stadtquartier_od5157). All values below are verified: I downloaded both CSVs on 2026-10-02 and computed from them.

Rent = median net rent, CHF per m² per month, flats with 2 to 4 rooms, private (not non-profit) landlords. Sale price = median CHF per m² of living area. Condo sale counts are small in some Kreise, so the 3-year average is the safer game input.

| Kreis | Rent 2024 | Rent 2026 | 3-room flat, median CHF/month 2026 | Condo CHF/m² 2025 | Sales 2025 | Condo CHF/m², 3-yr avg 2023 to 2025 | Gross yield (2026 rent x 12 / 3-yr avg price) |
|---|---|---|---|---|---|---|---|
| Whole city | 25.53 | 26.50 | 1,950 | 17,646 | 720 | 16,600 | 1.9% |
| 1 | 36.33 | 37.76 | 2,855 | 24,000 | 5 | 20,400 | 2.2% |
| 2 | 26.85 | 28.07 | 2,272 | 18,610 | 48 | 18,800 | 1.8% |
| 3 | 25.66 | 26.51 | 1,883 | 17,048 | about 30 | 17,400 | 1.8% |
| 4 | 28.01 | 29.36 | 1,986 | 13,595 | 21 | 15,800 | 2.2% |
| 5 | 27.52 | 28.77 | 2,378 | 20,492 | 29 | 19,900 | 1.7% |
| 6 | 27.81 | 29.84 | 2,120 | 19,376 | 43 | 19,200 | 1.9% |
| 7 | 27.07 | 28.21 | 2,230 | 21,464 | 142 | 19,500 | 1.7% |
| 8 | 31.84 | 32.42 | 2,400 | 19,531 | 33 | 20,800 | 1.9% |
| 9 | 24.83 | 25.88 | 1,953 | 16,083 | 140 | 15,400 | 2.0% |
| 10 | 24.06 | 24.75 | 1,804 | 19,000 | 95 | 16,800 | 1.8% |
| 11 | 23.17 | 23.76 | 1,801 | 15,392 | 112 | 14,000 | 2.0% |
| 12 | 22.13 | 23.16 | 1,576 | 15,000 | 25 | 13,900 | 2.0% |

Other figures from the same rent dataset (whole city, 2026, CHF per m² per month):

- Non-profit (cooperative and city) flats: median 15.32, against 26.50 for private landlords.
- Private rents by contract age: new build under 2 years 38.76; new letting of an existing flat under 2 years 30.49; contract 3 to 10 years 27.82; 11 to 20 years 22.09; over 20 years 18.88.
- Private rent quartiles: 25th percentile 21.44, 75th percentile 32.98.

The gap between a 20-year tenancy (18.88) and a fresh letting (30.49) is about 60%. In a real Zurich portfolio most of the hidden value sits in that gap, and rent law decides how much of it a landlord can capture. The game can be built around that tension.

**Read the yields with care.** A 1.7% to 2.2% gross yield sits below a 10-year fixed rate of about 2.0% to 2.25%. Buying a single condo to let in the city of Zurich with a mortgage loses money on cash flow at today's prices. Investors make money there through rent resets on re-letting, value-adding renovation, long holding for the tax reduction, and price growth (the city median condo price rose from CHF 13,100 per m² in 2020 to CHF 17,646 in 2025, about 35%). Condo sales also skew toward newer, owner-occupier flats, so the true yield on an older building bought whole is probably somewhat higher. That last point is unverified.

---

## 8. Ten numbers a game designer needs most

1. Equity: 20% minimum (10% hard). Banks want 25% on buy-to-let.
2. Affordability: 5% calculated rate + 1% maintenance + amortisation, capped at 33% of gross income (or net rent for investment property).
3. Amortisation: second mortgage down to 66.7% LTV within 15 years (10 years for buy-to-let at UBS).
4. Rates: SNB 0.00%, SARON about -0.07%, 10-year fixed 2.03% (SNB average) to 2.25% (ZKB).
5. Reference rate 1.25%. Each 0.25 point move = 3% rent change, plus 40% of inflation.
6. Value-adding renovation: 50% to 70% of a comprehensive overhaul can go into rent, at (reference rate + 0.5%) / 2 + 1/lifespan, +10%.
7. Property gains tax: 10% to 40% by bracket, +50% under 1 year, +25% under 2 years, down to -50% after 20 years.
8. Transaction costs: no transfer tax, 1 per mille notary + 1 per mille land registry, plus 2 per mille on any new mortgage note.
9. Median private rent CHF 26.50 per m² per month (Kreis 12: 23.16, Kreis 1: 37.76); fresh letting 30.49 against 18.88 for a 20-year tenancy.
10. Median condo price CHF 17,646 per m² (2025), gross yield about 2%, city vacancy 0.11%.

---

## 9. Re-check list before shipping numbers in the game

- Reference rate on 1 Dec 2026 (BWO).
- SNB rate decision of December 2026.
- Final VMWG text on allowed returns and value-adding investments (consultation closed 5 Jun 2026).
- Lex Koller bill after the consultation that closed 15 Jul 2026.
- Counter-proposal to the Mietpreis-Initiative (consultation in the first half of 2027).
- Next Mietpreiserhebung (every 2 years, next survey in 2028) and condo prices for 2026 (expected mid-2027).
- The unverified rows above, in particular termination dates, the official notice form and the 30-day notice challenge, which should be read from the Code of Obligations on fedlex.admin.ch.
