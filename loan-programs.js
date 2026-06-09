/**
 * Basic residential loan program rules for estimates (not underwriting).
 * Conventional, FHA, VA, and USDA — simplified for consumer education.
 */
window.MMG_LOAN_PROGRAMS = {
  conventional: {
    id: "conventional",
    label: "Conventional",
    shortLabel: "Conventional",
    description:
      "Not government-backed. Often best for strong credit and 3–20%+ down. Private mortgage insurance (PMI) typically applies below 20% down.",
    minDownPercent: 3,
    maxDownPercent: 50,
    defaultDownPercent: 20,
    miLabel: "PMI",
    miRequiredBelowLtv: 80,
    defaultMiAnnualRate: 0.5,
    rateSpreadVsConventional: 0,
    feeSheetNote: "PMI cancels when you reach ~20% equity on many loans.",
  },
  fha: {
    id: "fha",
    label: "FHA",
    shortLabel: "FHA",
    description:
      "Government-insured (FHA). As little as 3.5% down. More flexible credit. Requires FHA mortgage insurance (MIP) for the life of the loan on most purchases.",
    minDownPercent: 3.5,
    maxDownPercent: 50,
    defaultDownPercent: 3.5,
    miLabel: "MIP",
    miRequiredBelowLtv: 100,
    defaultMiAnnualRate: 0.55,
    upfrontMipPercent: 1.75,
    rateSpreadVsConventional: 0.25,
    feeSheetNote: "Includes estimated annual MIP. Upfront MIP (~1.75% of loan) may be financed.",
  },
  va: {
    id: "va",
    label: "VA",
    shortLabel: "VA",
    description:
      "For eligible veterans, active duty, and surviving spouses. No down payment required in most cases. No monthly PMI; one-time VA funding fee may apply.",
    minDownPercent: 0,
    maxDownPercent: 50,
    defaultDownPercent: 0,
    miLabel: "VA funding fee",
    miRequiredBelowLtv: 0,
    defaultMiAnnualRate: 0,
    fundingFeePercent: 2.15,
    rateSpreadVsConventional: -0.125,
    feeSheetNote: "VA funding fee varies by service history and use. Fee can often be financed into the loan.",
  },
  usda: {
    id: "usda",
    label: "USDA",
    shortLabel: "USDA",
    description:
      "For eligible rural and suburban properties and income-qualified buyers. No down payment required. Annual guarantee fee applies.",
    minDownPercent: 0,
    maxDownPercent: 50,
    defaultDownPercent: 0,
    miLabel: "USDA guarantee fee",
    miRequiredBelowLtv: 100,
    defaultMiAnnualRate: 0.35,
    upfrontGuaranteePercent: 1,
    rateSpreadVsConventional: 0.125,
    feeSheetNote: "Property and household income must meet USDA eligibility. Guarantee fees apply for the life of the loan.",
  },
  jumbo: {
    id: "jumbo",
    label: "Jumbo",
    shortLabel: "Jumbo",
    description:
      "For loan amounts above the 2026 conforming limit ($832,750 baseline). Typically 10–20%+ down, strong credit, and asset reserves. Not FHA/VA/USDA.",
    minDownPercent: 10,
    maxDownPercent: 50,
    defaultDownPercent: 15,
    miLabel: "PMI",
    miRequiredBelowLtv: 80,
    defaultMiAnnualRate: 0.45,
    rateSpreadVsConventional: 0.375,
    feeSheetNote: "Jumbo underwriting is stricter. Rates and minimum down vary by lender and loan size.",
  },
};

window.MMG_getLoanProgram = function (id) {
  return window.MMG_LOAN_PROGRAMS[id] || window.MMG_LOAN_PROGRAMS.conventional;
};

/**
 * Effective minimum down for estimates (simplified; not underwriting).
 * Conventional: 3% for first-time buyers (HomeReady / Home Possible style),
 * 5% otherwise. FHA/VA/USDA use program defaults.
 */
window.MMG_getEffectiveMinDown = function (programId, profile, homePrice, countyKey) {
  const program = window.MMG_getLoanProgram(programId);
  const fthb = Boolean(profile && profile.firstTimeBuyer);
  if (programId === "conventional") {
    return fthb ? 3 : 5;
  }
  if (programId === "fha" && homePrice && window.MMG_isFhaEligible && !window.MMG_isFhaEligible(homePrice, countyKey)) {
    const limit = window.MMG_getFhaLimit ? window.MMG_getFhaLimit(countyKey) : 541287;
    const price = Number(homePrice) || 0;
    if (price > limit) {
      const needed = Math.ceil(((price - limit) / price) * 1000) / 10;
      return Math.min(50, Math.max(3.5, needed));
    }
  }
  return program.minDownPercent ?? 0;
};

window.MMG_isProgramAvailable = function (programId, homePrice, profile, countyKey) {
  const price = Number(homePrice) || 0;
  if (programId === "fha") {
    return true;
  }
  if (programId === "va") {
    return window.MMG_isVaEligible ? window.MMG_isVaEligible(profile) : true;
  }
  if (programId === "usda") {
    return window.MMG_isUsdaEligible ? window.MMG_isUsdaEligible(profile) : true;
  }
  if (programId === "jumbo") {
    return price > 0 && window.MMG_isJumboLoan && window.MMG_isJumboLoan(price, 20, countyKey);
  }
  if (programId === "conventional") {
    return true;
  }
  return true;
};

/** Educational seller concession caps (vary by LTV and occupancy). */
window.MMG_SELLER_CONCESSION_NOTES = {
  conventional: {
    label: "Conventional seller concessions",
    tiers: [
      { ltvMin: 90.01, maxPercent: 3, note: "LTV > 90%: often up to 3% of price toward closing" },
      { ltvMin: 75.01, maxPercent: 6, note: "LTV 75.01–90%: often up to 6%" },
      { ltvMin: 0, maxPercent: 9, note: "LTV ≤ 75%: often up to 9%" },
    ],
  },
  fha: { label: "FHA seller concessions", maxPercent: 6, note: "Often up to 6% toward allowable borrower costs." },
  va: { label: "VA seller concessions", maxPercent: 4, note: "Often up to 4% toward certain buyer costs (plus normal closing costs)." },
  usda: { label: "USDA seller concessions", maxPercent: 6, note: "Often up to 6% toward allowable costs." },
};

window.MMG_getSellerConcessionNote = function (programId, downPercent) {
  const ltv = 100 - (Number(downPercent) || 0);
  const cfg = window.MMG_SELLER_CONCESSION_NOTES[programId] || window.MMG_SELLER_CONCESSION_NOTES.conventional;
  if (cfg.tiers) {
    for (const t of cfg.tiers) {
      if (ltv >= t.ltvMin) return t;
    }
    return cfg.tiers[cfg.tiers.length - 1];
  }
  return cfg;
};