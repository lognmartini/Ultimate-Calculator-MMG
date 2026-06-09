/** Effective property tax rates (% of assessed value, annual). Estimates for calculator. */
window.MMG_TAX_RATES = {
  states: {
    AL: 0.41, AK: 1.19, AZ: 0.62, AR: 0.62, CA: 0.75, CO: 0.51, CT: 2.14,
    DE: 0.57, FL: 0.89, GA: 0.92, HI: 0.28, ID: 0.69, IL: 2.27, IN: 0.85,
    IA: 1.57, KS: 1.41, KY: 0.86, LA: 0.55, ME: 1.36, MD: 1.09, MA: 1.23,
    MI: 1.54, MN: 1.12, MS: 0.81, MO: 0.97, MT: 0.84, NE: 1.73, NV: 0.6,
    NH: 2.18, NJ: 2.47, NM: 0.8, NY: 1.72, NC: 0.84, ND: 1.05, OH: 1.56,
    OK: 0.9, OR: 0.97, PA: 1.58, RI: 1.53, SC: 0.57, SD: 1.22, TN: 0.71,
    TX: 1.8, UT: 0.63, VT: 1.9, VA: 0.82, WA: 0.98, WV: 0.58, WI: 1.85,
    WY: 0.61, DC: 0.56,
  },
  /** NC counties — Triangle & common markets (effective rate %). */
  counties: {
    NC: {
      wake: 0.86,
      durham: 1.22,
      orange: 1.18,
      chatham: 0.95,
      johnston: 0.92,
      franklin: 0.98,
      granville: 1.05,
      nash: 1.12,
      alamance: 1.08,
      guilford: 1.15,
      forsyth: 1.02,
      mecklenburg: 0.98,
      union: 0.88,
      cabarrus: 0.94,
      cumberland: 1.05,
      newhanover: 0.72,
      brunswick: 0.68,
      pitt: 1.02,
      buncombe: 0.82,
      watauga: 0.55,
    },
  },
  /** Annual homeowners insurance as % of home value (estimate). */
  insuranceByState: {
    FL: 0.55, LA: 0.5, TX: 0.45, OK: 0.42, CO: 0.38, CA: 0.35, NC: 0.4,
    SC: 0.42, GA: 0.38, NY: 0.32, NJ: 0.34, default: 0.4,
  },
};

window.MMG_CREDIT = {
  /** Insurance premium multiplier by credit tier. */
  insuranceMult: [
    { min: 760, mult: 0.88 },
    { min: 720, mult: 0.94 },
    { min: 680, mult: 1.0 },
    { min: 640, mult: 1.12 },
    { min: 0, mult: 1.25 },
  ],
  /** Rate add-on (percentage points) vs. 740+ baseline. */
  rateAdjust: [
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
  /** Annual PMI % of loan when down &lt; 20%. */
  pmiByScore: [
    { min: 760, rate: 0.3 },
    { min: 740, rate: 0.4 },
    { min: 700, rate: 0.5 },
    { min: 680, rate: 0.65 },
    { min: 660, rate: 0.85 },
    { min: 640, rate: 1.0 },
    { min: 0, rate: 1.25 },
  ],
};