/**
 * Logan5 — loan program routing (conventional absorbs jumbo; guideline-aware down & rates).
 * Load after loan-programs.js and loan-limits.js.
 */
(function () {
  "use strict";

  const jumboMeta = () => window.MMG_LOAN_PROGRAMS?.jumbo || {};

  window.MMG_isJumboConventional = function (homePrice, downPercent, countyKey) {
    if (!window.MMG_isJumboLoan) return false;
    return window.MMG_isJumboLoan(homePrice, downPercent, countyKey);
  };

  /** Tiered jumbo minimum down on conventional (Fannie high-balance / non-conforming). */
  window.MMG_getJumboMinDownPercent = function (homePrice, countyKey) {
    const price = Number(homePrice) || 0;
    if (price <= 0) return 10.1;
    const limit = window.MMG_getConformingLimit(countyKey);
    const loanAt10 = window.MMG_loanAmount(price, 10.1);
    const loanAt15 = window.MMG_loanAmount(price, 15);
    if (loanAt10 <= limit) return 10.1;
    if (loanAt15 <= limit) return 15;
    return 20;
  };

  window.MMG_normalizeProgramId = function (programId) {
    const id = String(programId || "conventional").toLowerCase();
    return id === "jumbo" ? "conventional" : id;
  };

  window.MMG_getEffectiveProgramSpread = function (
    programId,
    homePrice,
    downPercent,
    countyKey
  ) {
    const id = window.MMG_normalizeProgramId(programId);
    const program = window.MMG_getLoanProgram(id);
    let spread = Number(program.rateSpreadVsConventional) || 0;

    if (
      id === "conventional" &&
      window.MMG_isJumboConventional(homePrice, downPercent, countyKey)
    ) {
      spread += Number(jumboMeta().rateSpreadVsConventional) || 0.375;
    }
    return spread;
  };

  window.MMG_getEffectiveMinDown = function (programId, profile, homePrice, countyKey) {
    const id = window.MMG_normalizeProgramId(programId);
    const price = Number(homePrice) || 0;
    const key = countyKey || window.MMG_LOAN_LIMITS?.defaultCounty || "wake";

    if (id === "conventional" && price > 0 && window.MMG_isJumboConventional(price, 20, key)) {
      return window.MMG_getJumboMinDownPercent(price, key);
    }

    const fthb = Boolean(profile && profile.firstTimeBuyer);
    if (id === "conventional") return fthb ? 3 : 5;
    if (id === "fha" && price && window.MMG_isFhaEligible && !window.MMG_isFhaEligible(price, key)) {
      const limit = window.MMG_getFhaLimit(key);
      const needed = Math.ceil(((price - limit) / price) * 1000) / 10;
      return Math.min(50, Math.max(3.5, needed));
    }
    const program = window.MMG_getLoanProgram(id);
    return program.minDownPercent ?? 0;
  };

  window.MMG_getProgramDefaultDown = function (programId, profile, homePrice, countyKey) {
    const id = window.MMG_normalizeProgramId(programId);
    const price = Number(homePrice) || 0;
    const key = countyKey || window.MMG_LOAN_LIMITS?.defaultCounty || "wake";

    if (id === "conventional" && price > 0 && window.MMG_isJumboConventional(price, 15, key)) {
      return window.MMG_getJumboMinDownPercent(price, key);
    }
    if (id === "conventional") return profile?.firstTimeBuyer ? 3 : 5;
    if (id === "jumbo") return 15;
    const program = window.MMG_getLoanProgram(id);
    return program.defaultDownPercent ?? program.minDownPercent ?? 0;
  };

  window.MMG_getConventionalProgramLabel = function (homePrice, downPercent, countyKey) {
    if (window.MMG_isJumboConventional(homePrice, downPercent, countyKey)) {
      const limit = window.MMG_getConformingLimit(countyKey);
      const fmt =
        window.MMG_formatCurrency ||
        ((n) => `$${Number(n).toLocaleString("en-US")}`);
      return `Conventional (high balance) · above ${fmt(limit)}`;
    }
    return "Conventional";
  };

  window.MMG_syncProgramForLoanSize = function (ctx) {
    const price = Number(ctx?.homePrice) || 0;
    const countyKey = ctx?.countyKey || window.MMG_LOAN_LIMITS?.defaultCounty;
    const programEl = ctx?.loanProgramEl;
    const downEl = ctx?.downPercentEl;
    const profile = ctx?.profile || {};
    if (!programEl || price <= 0) return { changed: false };

    let changed = false;
    let programId = window.MMG_normalizeProgramId(programEl.value);

    if (programEl.value === "jumbo") {
      programEl.value = "conventional";
      programId = "conventional";
      changed = true;
    }

    const downNow = downEl ? Number(downEl.value) : 20;
    if (
      (programId === "fha" || programId === "va" || programId === "usda") &&
      window.MMG_isJumboConventional(price, downNow, countyKey)
    ) {
      programEl.value = "conventional";
      programId = "conventional";
      changed = true;
    }

    const minDown = window.MMG_getEffectiveMinDown(programId, profile, price, countyKey);
    if (downEl && Number(downEl.value) < minDown) {
      downEl.value = String(minDown);
      changed = true;
    }

    return {
      changed,
      programId,
      minDown,
      isJumbo: window.MMG_isJumboConventional(
        price,
        Number(downEl?.value || 0),
        countyKey
      ),
    };
  };

  window.MMG_isProgramAvailable = function (programId, homePrice, profile, countyKey) {
    const id = window.MMG_normalizeProgramId(programId);
    if (programId === "jumbo") return false;
    const price = Number(homePrice) || 0;
    if (id === "va") return window.MMG_isVaEligible ? window.MMG_isVaEligible(profile) : true;
    if (id === "usda") return window.MMG_isUsdaEligible ? window.MMG_isUsdaEligible(profile) : true;
    if (id === "fha" && price > 0 && window.MMG_isFhaEligible && !window.MMG_isFhaEligible(price, countyKey)) {
      return true;
    }
    return id === "conventional" || id === "fha";
  };
})();