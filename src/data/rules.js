// Rule constants for Immo Mogul. Every entry says where its number comes from and whether it was
// verified against the source (see docs/research/261002_swiss real estate rules.md, checked on
// 2 October 2026). Status: 'verified' (official page read), 'secondary' (bank, court or industry
// page), 'assumption' (no free source; tuned in simulation). Money is integer CHF, rates are
// integer basis points (125 = 1.25%), shares are per mille where noted.

const RULES_DEF = {
  // --- rates at the start of the career ---
  policyRateBps: { value: 0, status: 'verified', source: 'SNB, assessment of 24 Sep 2026', checked: '2026-10-02' },
  saronBps: { value: -7, status: 'verified', source: 'SNB data portal, cube zimoma, Sep 2026 average -0.068%', checked: '2026-10-02' },
  // ZKB indicative fixed rates (Richtsätze), 2 Oct 2026. The SNB survey means are lower; banks add a spread.
  fixedCurveBps: { value: { 2: 178, 3: 192, 5: 205, 10: 225 }, status: 'verified', source: 'ZKB aktuelle Hypothekarzinsen, 2 Oct 2026', checked: '2026-10-02' },
  saronMarginBps: { value: 80, status: 'assumption', source: 'comparison sites show SARON offers from about 0.75%', checked: '2026-10-02' },
  buyToLetSurchargeBps: { value: 25, status: 'assumption', source: 'realadvisor.ch search summary: up to 25 bps more for investment property', checked: '2026-10-02' },
  referenceRateBps: { value: 125, status: 'verified', source: 'BWO, 1.25% since 2 Sep 2025', checked: '2026-10-02' },
  cpiYoYBps: { value: 50, status: 'assumption', source: 'Swiss CPI around 0.5% in 2026; game start value only', checked: '2026-10-18' },

  // --- reference rate and rent (BWO) ---
  rentUpPerQuarterPointPct: { value: 3.0, status: 'verified', source: 'BWO Referenzzinssatz page', checked: '2026-10-02' },
  rentDownPerQuarterPointPct: { value: 2.91, status: 'verified', source: 'BWO Referenzzinssatz page', checked: '2026-10-02' },
  cpiPassThroughPct: { value: 40, status: 'verified', source: 'BWO: 40% of CPI may be passed on', checked: '2026-10-02' },

  // --- value-adding renovation (Art. 14 VMWG, Federal Court method) ---
  valueAddingShareFull: { value: 0.60, status: 'secondary', source: 'Art. 14 VMWG presumes 50 to 70% of a comprehensive overhaul; midpoint used', checked: '2026-10-02' },
  valueAddingSharePartial: { value: 0.50, status: 'assumption', source: 'kitchen or bathroom alone: low end of the 50 to 70% band', checked: '2026-10-18' },
  renoInterestSpreadBps: { value: 50, status: 'secondary', source: 'HEV Winterthur: interest = (reference rate + 0.5%) / 2', checked: '2026-10-02' },
  renoMaintenanceUpliftPct: { value: 10, status: 'secondary', source: 'HEV Winterthur: +10% maintenance on the subtotal', checked: '2026-10-02' },
  renoLifespanYears: { value: { refresh: 10, kitchen: 20, bath: 25, full: 25, facade: 30 }, status: 'assumption', source: 'paritätische Lebensdauertabelle, typical values', checked: '2026-10-18' },

  // --- initial rent (Zurich) ---
  initialRentChallengeJumpPct: { value: 10, status: 'verified', source: 'Zurich courts: significantly higher than the previous rent, more than 10%', checked: '2026-10-02' },
  initialRentChallengeBaseProb: { value: 0.35, status: 'assumption', source: 'share of tenants who challenge a jump over 10% above market; tuned', checked: '2026-10-18' },

  // --- bank rules ---
  minEquityPct: { value: 20, status: 'verified', source: 'SBA self-regulation; UBS guide', checked: '2026-10-02' },
  minHardEquityPct: { value: 10, status: 'verified', source: 'SBA self-regulation recognised by FINMA', checked: '2026-10-02' },
  amortiseToLtvPct: { value: 66.67, status: 'verified', source: 'SBA: second mortgage amortised to two thirds of lending value', checked: '2026-10-02' },
  amortiseYearsDefault: { value: 15, status: 'verified', source: 'SBA, in force 1 Jan 2025', checked: '2026-10-02' },
  imputedRateBps: { value: 500, status: 'secondary', source: 'UBS affordability guide: 5% calculated rate', checked: '2026-10-02' },
  upkeepPctOfValue: { value: 1.0, status: 'secondary', source: 'UBS: 1% of purchase price a year for upkeep', checked: '2026-10-02' },
  affordabilityCapPct: { value: 33, status: 'secondary', source: 'UBS: at most a third of gross income; some lenders 35%', checked: '2026-10-02' },
  rentCountedPct: { value: 80, status: 'assumption', source: 'banks count 70 to 80% of gross rent in a combined household test; UBS deducts 15% of net rent on pure investment property', checked: '2026-10-18' },
  bankValuationBandPct: { value: 5, status: 'assumption', source: 'bank valuation within +-5% of fair value; lending value is the lower of price and valuation', checked: '2026-10-18' },
  reviewFailTolerancePct: { value: 10, status: 'assumption', source: 'a review over the cap by up to 10% of the cap is a warning, more is a fail', checked: '2026-10-18' },

  // --- transaction costs (canton of Zurich, LS 243) ---
  notaryPerMille: { value: 1, status: 'verified', source: 'Notariatsgebührenverordnung LS 243 item 1.1.1, min CHF 100, plus VAT', checked: '2026-10-02' },
  landRegistryPerMille: { value: 1, status: 'verified', source: 'LS 243 item 2.2.1, min CHF 100, no VAT', checked: '2026-10-02' },
  mortgageNotePerMille: { value: 2, status: 'verified', source: 'LS 243 items 1.2 and 2.3.1: 1 per mille notary plus 1 per mille land registry on the pledge', checked: '2026-10-02' },
  vatPct: { value: 8.1, status: 'verified', source: 'Swiss standard VAT rate since 1 Jan 2024', checked: '2026-10-18' },
  transferTaxPct: { value: 0, status: 'verified', source: 'No Handänderungssteuer in Zurich since 1 Jan 2005', checked: '2026-10-02' },
  brokerFeePct: { value: 2, status: 'assumption', source: 'typical Zurich broker fee on a sale, 1.5 to 3%', checked: '2026-10-18' },

  // --- property gains tax (canton of Zurich tariff, eForm 225.1 of 09.25) ---
  gainsTaxBrackets: {
    value: [[4000, 10], [6000, 15], [8000, 20], [12000, 25], [20000, 30], [50000, 35], [Infinity, 40]],
    status: 'verified', source: 'Kanton Zürich Grundstückgewinnsteuer tariff; CHF 10,000 gain gives CHF 1,300', checked: '2026-10-02',
  },
  gainsTaxExemptBelow: { value: 5000, status: 'verified', source: 'gains under CHF 5,000 are not taxed', checked: '2026-10-02' },
  gainsTaxShortHoldSurchargePct: { value: { under1y: 50, under2y: 25 }, status: 'verified', source: 'same tariff', checked: '2026-10-02' },
  gainsTaxLongHoldReductionPct: {
    value: { 5: 5, 6: 8, 7: 11, 8: 14, 9: 17, 10: 20, 11: 23, 12: 26, 13: 29, 14: 32, 15: 35, 16: 38, 17: 41, 18: 44, 19: 47, 20: 50 },
    status: 'verified', source: 'same tariff: 5% after 5 full years, 8% after 6, then +3 points a year to 50% at 20', checked: '2026-10-02',
  },
  incomeTaxOnRentPct: { value: 25, status: 'assumption', source: 'simplified marginal rate on net rental profit; real taxation is progressive and personal', checked: '2026-10-18' },

  // --- market ---
  priceDriftYearPct: { value: 3.0, status: 'assumption', source: 'city condo median rose 5.3% a year 2009 to 2025; a lower forward drift is used', checked: '2026-10-18' },
  rentDriftYearPct: { value: 1.8, status: 'assumption', source: 'new-let rents rose about 2% a year between the 2022 and 2026 surveys (od5161)', checked: '2026-10-18' },
  capRateBps: { value: { 4: 300, 5: 280 }, status: 'assumption', source: 'no free source for whole-building yields; tuned so buildings price below condo sums', checked: '2026-10-18' },
  askPremiumPct: { value: { mean: 6, sd: 4, max: 15 }, status: 'assumption', source: 'no free series for asking versus sale price', checked: '2026-10-18' },
  vacancyCity: { value: 0.00106, status: 'verified', source: 'Stadt Zürich, 252 empty flats on 1 June 2026', checked: '2026-10-02' },
  leaseBandMix: { value: { upTo2: 0.20, y3to10: 0.35, y11to20: 0.25, over20: 0.20 }, status: 'assumption', source: 'share of tenancies by age; the survey publishes medians per band, not shares', checked: '2026-10-18' },
  turnoverMonthlyByBand: { value: { upTo2: 0.012, y3to10: 0.008, y11to20: 0.004, over20: 0.0025 }, status: 'assumption', source: 'no published turnover; roughly 8% of leases a year city-wide', checked: '2026-10-18' },
  noticeMonths: { value: 3, status: 'verified', source: 'Zurich courts: at least 3 months for flats', checked: '2026-10-02' },

  // --- running costs and renovation ---
  runningCostPctCondo: { value: 0.8, status: 'assumption', source: 'condo fees, insurance, admin and a maintenance reserve', checked: '2026-10-18' },
  runningCostPctBuilding: { value: 1.0, status: 'assumption', source: 'whole-building upkeep and admin', checked: '2026-10-18' },
  conditionDecayPerYear: { value: 1.3, status: 'assumption', source: 'a flat drifts from new to worn in about 45 years without work', checked: '2026-10-18' },
  renoPackages: {
    value: {
      refresh: { label: 'Refresh', perM2: 450, fixed: 0, months: 1, needsVacant: false, valueAdding: 0, condTo: 80, condAdd: 20 },
      kitchen: { label: 'Kitchen', perM2: 100, fixed: 25000, months: 1, needsVacant: false, valueAdding: 0.5, condTo: 95, condAdd: 15 },
      bath: { label: 'Bathroom', perM2: 0, fixed: 28000, months: 1, needsVacant: false, valueAdding: 0.5, condTo: 95, condAdd: 15 },
      full: { label: 'Full overhaul', perM2: 1250, fixed: 0, months: 3, needsVacant: true, valueAdding: 0.6, condTo: 100, condAdd: 100 },
      facade: { label: 'Facade and energy', perM2: 350, fixed: 0, months: 4, needsVacant: false, valueAdding: 0.6, condTo: 100, condAdd: 10, building: true },
    },
    status: 'secondary', source: 'helply.ch 2026 and myky.ch 2025 ranges with a Zurich uplift of about 15%', checked: '2026-10-02',
  },
  renoQuoteNoisePct: { value: 10, status: 'assumption', source: 'quotes vary by +-10% around the package price', checked: '2026-10-18' },
};

export const RULES = Object.freeze(Object.fromEntries(Object.entries(RULES_DEF).map(([id, r]) => [id, { id, ...r }])));

export function rule(id) {
  const r = RULES[id];
  if (!r) throw new Error(`unknown rule ${id}`);
  return r.value;
}

export function rulesByStatus(status) {
  return Object.values(RULES).filter((r) => r.status === status);
}
