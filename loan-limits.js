/**
 * 2026 loan limits & eligibility helpers (educational estimates — not underwriting).
 * Sources: FHFA 2026 CLL baseline, HUD FHA floor/ceiling. County rows refine when known.
 * National default uses baseline limits (not a single-county assumption).
 */
window.MMG_LOAN_LIMITS = {
  year: 2026,
  conformingBaseline: 832750,
  conformingCeiling: 1249125,
  fhaFloor: 541287,
  fhaCeiling: 1249125,
  /** null = use national baseline until address resolves a known county */
  defaultCounty: null,
  counties: {
    wake: { name: "Wake County, NC", conforming: 832750, fha: 541287 },
    durham: { name: "Durham County, NC", conforming: 832750, fha: 541287 },
    orange: { name: "Orange County, NC", conforming: 832750, fha: 541287 },
    johnston: { name: "Johnston County, NC", conforming: 832750, fha: 541287 },
    chatham: { name: "Chatham County, NC", conforming: 832750, fha: 541287 },
    mecklenburg: { name: "Mecklenburg County, NC", conforming: 832750, fha: 541287 },
  },
};

window.MMG_resolveCountyKey = function (location) {
  const county = String(location?.county || location?.County || "").toLowerCase();
  const normalized = county.replace(/[^a-z]/g, "").replace("county", "").trim();
  if (normalized && window.MMG_LOAN_LIMITS.counties[normalized]) return normalized;
  return window.MMG_LOAN_LIMITS.defaultCounty; // may be null → national baseline
};

window.MMG_getConformingLimit = function (countyKey) {
  const key = countyKey || window.MMG_LOAN_LIMITS.defaultCounty;
  if (key && window.MMG_LOAN_LIMITS.counties[key]) {
    return window.MMG_LOAN_LIMITS.counties[key].conforming;
  }
  return window.MMG_LOAN_LIMITS.conformingBaseline;
};

window.MMG_getFhaLimit = function (countyKey) {
  const key = countyKey || window.MMG_LOAN_LIMITS.defaultCounty;
  if (key && window.MMG_LOAN_LIMITS.counties[key]) {
    return window.MMG_LOAN_LIMITS.counties[key].fha;
  }
  return window.MMG_LOAN_LIMITS.fhaFloor;
};

/** Loan amount at given down % */
window.MMG_loanAmount = function (homePrice, downPercent) {
  const price = Number(homePrice) || 0;
  const down = Number(downPercent) || 0;
  return Math.max(0, Math.round(price * (1 - down / 100)));
};

/** FHA viable when min-down (3.5%) loan amount is within county FHA limit */
window.MMG_isFhaEligible = function (homePrice, countyKey) {
  const price = Number(homePrice) || 0;
  if (price <= 0) return true;
  const limit = window.MMG_getFhaLimit(countyKey);
  const loanAtMinDown = window.MMG_loanAmount(price, 3.5);
  return loanAtMinDown <= limit;
};

window.MMG_getFhaMaxPrice = function (countyKey) {
  const limit = window.MMG_getFhaLimit(countyKey);
  return Math.floor(limit / 0.965);
};

window.MMG_getFhaIneligibleNote = function (homePrice, countyKey) {
  if (window.MMG_isFhaEligible(homePrice, countyKey)) return "";
  const limit = window.MMG_getFhaLimit(countyKey);
  const maxPrice = window.MMG_getFhaMaxPrice(countyKey);
  const county = countyKey ? window.MMG_LOAN_LIMITS.counties[countyKey] : null;
  const name = county?.name || "this area (2026 national FHA floor used until location is known)";
  return (
    `FHA loan limit for ${name} is about $${limit.toLocaleString("en-US")}. ` +
    `At 3.5% down, FHA often fits homes up to about $${maxPrice.toLocaleString("en-US")}. ` +
    `Consider conventional (including high-balance) for this price. Educational estimate only.`
  );
};

window.MMG_isJumboLoan = function (homePrice, downPercent, countyKey) {
  const loan = window.MMG_loanAmount(homePrice, downPercent);
  const limit = window.MMG_getConformingLimit(countyKey);
  return loan > limit;
};

/** Loan amount at or below county conforming limit (eligible for LP buydown offers). */
window.MMG_isConformingLoan = function (homePrice, downPercent, countyKey) {
  const loan = window.MMG_loanAmount(homePrice, downPercent);
  if (loan <= 0) return false;
  return loan <= window.MMG_getConformingLimit(countyKey);
};

window.MMG_getJumboIneligibleNote = function () {
  return "Jumbo loans exceed the 2026 conforming limit ($832,750 baseline). Often 10–20%+ down and stronger reserves.";
};

window.MMG_isVaEligible = function (profile) {
  return Boolean(profile && profile.veteranEligible);
};

window.MMG_isUsdaEligible = function (profile) {
  return Boolean(profile && profile.usdaEligible);
};

/** Default down % when user selects a program (Logan5 auto-populate) */
window.MMG_getProgramDefaultDown = function (programId, profile) {
  const p = window.MMG_getLoanProgram(programId);
  if (programId === "conventional") {
    return profile?.firstTimeBuyer ? 3 : 5;
  }
  if (programId === "jumbo") {
    return 15;
  }
  return p.defaultDownPercent ?? p.minDownPercent ?? 0;
};