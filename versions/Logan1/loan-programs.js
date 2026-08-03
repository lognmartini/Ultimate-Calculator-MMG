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
};

window.MMG_getLoanProgram = function (id) {
  return window.MMG_LOAN_PROGRAMS[id] || window.MMG_LOAN_PROGRAMS.conventional;
};