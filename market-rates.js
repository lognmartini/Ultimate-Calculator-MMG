/**
 * Market rate: Freddie Mac PMMS + conventional LLPA-style adjustments.
 * Martini offer: 0.25% below comparable market estimate (par, no discount points).
 */
window.MMG_MARKET = {
  fallback: { rate30: 6.5, rate15: 5.875, asOf: "estimate" },
  /** Martini pricing: always this much below rounded par for the scenario */
  martiniDiscount: 0.25,
  /** Internal only — base lender finance charge in APR (not shown in UI) */
  aprFinanceCharge: 2500,
  /** Rate buydown: one discount point per this much rate reduction */
  pointsPerQuarterPercent: 0.25,
  creditLlpa: [
    { min: 780, adjust: -0.375 },
    { min: 760, adjust: -0.25 },
    { min: 740, adjust: -0.125 },
    { min: 720, adjust: 0 },
    { min: 700, adjust: 0.125 },
    { min: 680, adjust: 0.25 },
    { min: 660, adjust: 0.375 },
    { min: 640, adjust: 0.5 },
    { min: 620, adjust: 0.625 },
    { min: 0, adjust: 0.875 },
  ],
  ltvLlpa: [
    { maxLtv: 60, adjust: -0.125 },
    { maxLtv: 70, adjust: -0.0625 },
    { maxLtv: 75, adjust: 0 },
    { maxLtv: 80, adjust: 0.125 },
    { maxLtv: 85, adjust: 0.25 },
    { maxLtv: 90, adjust: 0.375 },
    { maxLtv: 95, adjust: 0.5 },
    { maxLtv: 100, adjust: 0.625 },
  ],
  termAdjust: {
    30: 0,
    25: 0.05,
    20: 0.125,
    15: 0,
    10: -0.125,
  },
};

window.MMG_roundToEighth = function (rate) {
  if (!Number.isFinite(rate)) return 0;
  return Math.round(rate / 0.125) * 0.125;
};

window.MMG_formatRate = function (rate) {
  return parseFloat(window.MMG_roundToEighth(rate).toFixed(3)).toString();
};

window.MMG_computeMarketRate = function (
  baseRate30,
  baseRate15,
  creditScore,
  downPercent,
  loanTermYears,
  programRateSpread
) {
  const m = window.MMG_MARKET;
  const term = Number(loanTermYears) || 30;
  const spread = Number(programRateSpread) || 0;
  const base =
    term <= 15
      ? (baseRate15 ?? baseRate30 - 0.65) + (m.termAdjust[term] ?? 0)
      : (baseRate30 ?? 6.5) + (m.termAdjust[term] ?? 0);

  let creditAdj = 0.875;
  for (const t of m.creditLlpa) {
    if (creditScore >= t.min) {
      creditAdj = t.adjust;
      break;
    }
  }

  const ltv = Math.max(0, 100 - Number(downPercent || 0));
  let ltvAdj = 0.625;
  for (const t of m.ltvLlpa) {
    if (ltv <= t.maxLtv) {
      ltvAdj = t.adjust;
      break;
    }
  }

  const totalAdjust = creditAdj + ltvAdj + spread;
  const rawPar = Math.max(0, base + totalAdjust);
  /** Par note rate for the day/scenario (PMMS + adjustments, no points). */
  const parRate = window.MMG_roundToEighth(rawPar);
  /** Always exactly 0.25% below rounded par. */
  const martiniRate = window.MMG_roundToEighth(
    Math.max(0, parRate - m.martiniDiscount)
  );

  return {
    parRate,
    marketRate: parRate,
    martiniRate,
    rawPar,
    baseRate: base,
    creditAdj,
    ltvAdj,
    ltv,
    totalAdjust,
    programSpread: spread,
    term,
  };
};

/** Monthly P&I at annual note rate (percent). */
window.MMG_monthlyPI = function (principal, annualRatePercent, years) {
  if (principal <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
};

/**
 * APR estimate including lender fees paid at closing (Reg Z–style iterative).
 */
window.MMG_computeApr = function (
  loanAmount,
  noteRatePercent,
  loanTermYears,
  lenderFees
) {
  const n = Math.max(1, Math.round((Number(loanTermYears) || 30) * 12));
  const payment = window.MMG_monthlyPI(loanAmount, noteRatePercent, loanTermYears);
  const amountFinanced = Math.max(0, loanAmount - Number(lenderFees || 0));
  if (amountFinanced <= 0 || payment <= 0) return noteRatePercent;

  let aprMonthly = noteRatePercent / 100 / 12;
  for (let iter = 0; iter < 80; iter++) {
    let pv = 0;
    for (let m = 1; m <= n; m++) {
      pv += payment / Math.pow(1 + aprMonthly, m);
    }
    const diff = pv - amountFinanced;
    if (Math.abs(diff) < 0.01) break;
    aprMonthly += diff / (amountFinanced * n) * 0.85;
    aprMonthly = Math.max(0.0001, Math.min(0.02, aprMonthly));
  }
  return window.MMG_roundToEighth(aprMonthly * 12 * 100);
};

/** PMMS baseline for loan term (typical lender advertised average). */
window.MMG_pmmsBaselineRate = function (pmms, loanTermYears) {
  const term = Number(loanTermYears) || 30;
  const base = term <= 15 ? pmms?.rate15 : pmms?.rate30;
  const val = Number(base);
  if (!Number.isFinite(val) || val <= 0) return 6.5;
  return window.MMG_roundToEighth(val);
};

/** Martini offer = typical lender PMMS rate minus fixed discount. */
window.MMG_martiniOfferFromPmms = function (pmms, loanTermYears) {
  const typical = window.MMG_pmmsBaselineRate(pmms, loanTermYears);
  const discount = window.MMG_MARKET?.martiniDiscount ?? 0.25;
  return window.MMG_roundToEighth(Math.max(0, typical - discount));
};

/**
 * Discount points to buy down rate below the Martini par offer.
 * Rule of thumb: 1 point (1% of loan) ≈ 0.25% lower rate.
 */
window.MMG_discountPointsForBuydown = function (rateReductionPercent) {
  const reduction = Math.max(0, Number(rateReductionPercent) || 0);
  if (reduction <= 0) return 0;
  const pointsPerQuarter = window.MMG_MARKET?.pointsPerQuarterPercent ?? 0.25;
  return Math.round((reduction / pointsPerQuarter) * 1000) / 1000;
};

window.MMG_discountPointsDollarCost = function (loanAmount, points) {
  const loan = Math.max(0, Number(loanAmount) || 0);
  const pts = Math.max(0, Number(points) || 0);
  return Math.round(loan * (pts / 100));
};