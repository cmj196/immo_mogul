// Public engine API. Pure, deterministic, no DOM.

export { createCareer, DIFFICULTIES, netWorth, propertyValue, propertyEquity, totalDebt, rentMonth, unitCount, snapshot, hasDecision, loansOfLot, lotDebt, ownsWholeBuilding, monthsLeft } from './state.js';
export { applyAction, checkAction, legalActions, advance, quoteForPurchase, refinanceQuote, startCareer } from './actions.js';
export { prepareWorld, loadWorld, fixtureWorld, buildingOf, addressOf, quartierOf, flatLabel, rentPerM2, newLetPerM2, condoPerM2 } from './world.js';
export { marketRent, condoValue, buildingValue, lotValue, lotRentMonth, lotMarketRentMonth, runningCostMonth, listingFairToday, listingRentMonth, listingArea, unitOf, lotOf, flatOfUnit, conditionPriceFactor, conditionRentFactor } from './valuation.js';
export { quote, offeredRateBps, loanRateBps, reviewHousehold, bankOf, amortMonthFor } from './bank.js';
export { gainsTax, gainsTaxBase, holdingAdjustmentPct, purchaseCosts, saleBreakdown, incomeTaxOnRent } from './tax.js';
export { unitRenoQuote, buildingRenoQuote, PACKAGES, UNIT_PACKAGES } from './building.js';
export { refRateAdjustment, renovationRentIncrease, bandOfAge, BAND_LABEL, turnoverHazard } from './lease.js';
export { COUNTER_LIMIT, interestOf, lastOfferBy } from './negotiation.js';
export { rivalSummary, ownershipMap, rivalLotValue } from './rivals.js';
export { MILESTONES, careerSummary } from './report.js';
export { marketSummary, curveFor } from './macro.js';
export { monthLabel, yearOf, isQuarterMonth, CAREER_MONTHS, START_YEAR, careerYear } from './clock.js';
export { chf, pctText, bpsText, round } from './money.js';
export { stream, hash32 } from './rng.js';
export { RULES, rule, rulesByStatus } from '../data/rules.js';
export { BANKS, BANK_IDS, PRODUCTS } from '../data/banks.js';
export { RIVALS, RIVAL_IDS } from '../data/rivals.js';
export { SELLER_TYPES, BUYER_TYPES } from '../data/people.js';
export { ledgerForMonth, sumLedger } from './ledger.js';
