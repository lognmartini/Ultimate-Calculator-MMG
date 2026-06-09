(function () {
  "use strict";

  const BASE_RATE = 6.5;
  /** Shown before PMMS loads and if the feed is unavailable */
  const DEFAULT_TYPICAL_LENDER_RATE = 6.5;
  const DEFAULT_MARTINI_OFFER_RATE = 6.25;
  const AMORT_PREVIEW = 12;
  const API_BASE = detectApiBase();
  const PAGE = initPageMode();

  const DEFAULT_TAX = {
    states: {
      NC: 0.84, SC: 0.57, VA: 0.82, FL: 0.89, GA: 0.92, TN: 0.71, TX: 1.8,
      CA: 0.75, NY: 1.72, NJ: 2.47, PA: 1.58, OH: 1.56, MD: 1.09,
    },
    counties: {
      NC: {
        wake: 0.86, durham: 1.22, orange: 1.18, chatham: 0.95, johnston: 0.92,
        mecklenburg: 0.98, union: 0.88, cabarrus: 0.94, guilford: 1.15,
        forsyth: 1.02, newhanover: 0.72, brunswick: 0.68,
      },
    },
    insuranceByState: {
      FL: 0.55, LA: 0.5, TX: 0.45, NC: 0.4, SC: 0.42, GA: 0.38, VA: 0.38,
      default: 0.4,
    },
  };

  const DEFAULT_CREDIT = {
    rateAdjust: [
      { min: 760, adjust: -0.25 }, { min: 740, adjust: -0.125 }, { min: 720, adjust: 0 },
      { min: 700, adjust: 0.125 }, { min: 680, adjust: 0.25 }, { min: 660, adjust: 0.375 },
      { min: 640, adjust: 0.5 }, { min: 620, adjust: 0.625 }, { min: 0, adjust: 0.875 },
    ],
    pmiByScore: [
      { min: 760, rate: 0.3 }, { min: 740, rate: 0.4 }, { min: 700, rate: 0.5 },
      { min: 680, rate: 0.65 }, { min: 660, rate: 0.85 }, { min: 640, rate: 1.0 },
      { min: 0, rate: 1.25 },
    ],
    insuranceMult: [
      { min: 760, mult: 0.88 }, { min: 720, mult: 0.94 }, { min: 680, mult: 1.0 },
      { min: 640, mult: 1.12 }, { min: 0, mult: 1.25 },
    ],
  };

  function detectApiBase() {
    if (window.location.protocol === "file:") return null;
    const meta = document.querySelector('meta[name="mmg-api-base"]')?.content?.trim();
    if (meta) return meta;
    return ".";
  }

  function apiUrl(path) {
    if (API_BASE === null) return null;
    const clean = String(path || "").replace(/^\//, "");
    return new URL(clean, window.location.href).toString();
  }

  function initPageMode() {
    const params = new URLSearchParams(window.location.search);
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    // Compact layout only when explicitly requested (?embed=1). Do not auto-hide
    // logo/headshot when the page is simply opened inside a parent site iframe.
    const embed =
      params.get("embed") === "1" || params.get("embed") === "true";
    const embedFull =
      params.get("embed") === "full" ||
      (inIframe && params.get("embed") === "0");
    const ref = (params.get("ref") || params.get("partner") || "").trim();
    if (embed) document.documentElement.classList.add("embed-mode");
    if (embedFull) document.documentElement.classList.add("embed-full-mode");
    if (ref) {
      document.documentElement.classList.add("partner-mode");
      document.documentElement.dataset.partnerRef = ref;
    }
    return { embed, embedFull, ref, params, inIframe };
  }

  function assetUrl(relativePath) {
    const clean = String(relativePath || "").replace(/^\//, "");
    return new URL(clean, window.location.href).toString();
  }

  function fixAssetUrls() {
    document.querySelectorAll("img[data-asset], img[src^='assets/']").forEach((img) => {
      const path = img.getAttribute("data-asset") || img.getAttribute("src");
      if (!path) return;
      img.src = assetUrl(path);
      if (!img.getAttribute("data-fallback")) return;
      img.addEventListener(
        "error",
        () => {
          const fallback = img.getAttribute("data-fallback");
          if (fallback && img.src !== assetUrl(fallback)) {
            img.src = assetUrl(fallback);
          }
        },
        { once: true }
      );
    });
  }

  function normalizeLoRef(raw) {
    const ref = String(raw || "")
      .trim()
      .toLowerCase();
    if (!ref) return "";
    if (ref === "kevin" || ref.includes("kevin")) return "kevin";
    if (ref === "logan" || ref.includes("logan")) return "logan";
    return ref;
  }

  function resolveTeamApplyBase(site) {
    const los = site.loanOfficers || {};
    const loRef = normalizeLoRef(PAGE.ref || PAGE.params.get("ref") || "");
    if (loRef && los[loRef]?.applyUrl) return los[loRef].applyUrl;
    return site.teamApplyUrl || site.applyUrl || "https://applywithlogan.com";
  }

  function buildApplyUrl() {
    const site = window.MMG_SITE || {};
    const isLogan4 = document.body.classList.contains("logan4");
    const base = isLogan4
      ? resolveTeamApplyBase(site)
      : site.applyUrl || "https://applywithlogan.com";
    let url;
    try {
      url = new URL(base);
    } catch {
      url = new URL("https://applywithlogan.com");
    }
    const p = PAGE.params;
    const socialWizard = document.body.classList.contains("wizard-social");
    const loRef = normalizeLoRef(PAGE.ref || p.get("ref") || "");
    const campaign =
      p.get("utm_campaign") ||
      PAGE.ref ||
      (isLogan4
        ? site.defaultTeamSocialCampaign
        : socialWizard
          ? site.defaultSocialCampaign
          : null) ||
      site.defaultCampaign ||
      "mmg-calculator";
    const source =
      p.get("utm_source") ||
      (PAGE.ref ? "partner" : socialWizard ? "social" : "martini-calculator");
    const medium =
      p.get("utm_medium") ||
      (PAGE.embed
        ? "embed"
        : PAGE.ref
          ? "partner-referral"
          : socialWizard
            ? "social-click"
            : "calculator");
    url.searchParams.set("utm_source", source);
    url.searchParams.set("utm_medium", medium);
    url.searchParams.set("utm_campaign", campaign);
    p.forEach((value, key) => {
      if (!value) return;
      if (key.startsWith("utm_") && !url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
      if ((key === "gclid" || key === "fbclid" || key === "msclkid") && !url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    });
    const agentRef = (p.get("agent") || p.get("realtor") || "").trim();
    const ref = PAGE.ref || agentRef || loRef;
    if (ref) {
      url.searchParams.set("ref", ref);
      if (isLogan4) url.searchParams.set("utm_content", ref);
      else if (!url.searchParams.has("utm_content")) url.searchParams.set("utm_content", ref);
    }
    if (document.body.classList.contains("logan5") && !url.searchParams.has("utm_content")) {
      url.searchParams.set("utm_content", "logan5-calculator");
    }
    return url.toString();
  }

  function setMetaTag(attr, key, value) {
    if (!value) return;
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", value);
  }

  function wireSocialMeta() {
    const site = window.MMG_SITE || {};
    const isLogan4 = document.body.classList.contains("logan4");
    const image = isLogan4
      ? site.teamShareImage || site.shareImage
      : site.shareImage;
    if (!image) return;
    setMetaTag("property", "og:image", image);
    setMetaTag("name", "twitter:card", "summary_large_image");
    setMetaTag("name", "twitter:image", image);
  }

  function wireTeamBranding() {
    if (!document.body.classList.contains("logan4")) return;
    const site = window.MMG_SITE || {};
    const los = site.loanOfficers || {};
    const kevin = los.kevin || {};
    const logan = los.logan || {};
    const companyNmls = site.companyNmls || "3446";
    const nmlsLine =
      `${kevin.name || "Kevin Martini"} · NMLS #${kevin.nmls || "143962"} · ` +
      `${logan.name || "Logan Martini"} · NMLS #${logan.nmls || site.nmls || "1591485"}`;

    const teamTitle = document.querySelector(".wizard-team-title");
    if (teamTitle) teamTitle.textContent = nmlsLine;

    const teamMeta = document.querySelector(".wizard-team-meta");
    if (teamMeta) {
      teamMeta.textContent =
        `${site.brandName || "Martini Mortgage Group"} · Powered by Gold Star Mortgage · NMLS #${companyNmls} · Raleigh, NC`;
    }

    document.querySelectorAll(".nmls-compliance").forEach((el) => {
      el.innerHTML =
        `<strong>NMLS licensing:</strong> ${site.companyLegalName || "Martini Mortgage Group"} · NMLS #${companyNmls} · ` +
        `${kevin.name || "Kevin Martini"} · NMLS #${kevin.nmls || "143962"} · ` +
        `${logan.name || "Logan Martini"} · NMLS #${logan.nmls || site.nmls || "1591485"} · ` +
        `Verify at <a href="https://www.nmlsconsumeraccess.org/" target="_blank" rel="noopener noreferrer">nmlsconsumeraccess.org</a>.`;
    });

    const nmlsFooter = document.querySelector(".wizard-site-footer .nmls");
    if (nmlsFooter) {
      nmlsFooter.innerHTML =
        `${site.companyLegalName || "Martini Mortgage Group"} · NMLS #${companyNmls}<br />` +
        `${nmlsLine}<br />` +
        `${site.address || "507 N Blount St, Raleigh, NC 27604"} · ` +
        `<a href="${site.siteUrl || "https://martinimortgagegroup.com"}">martinimortgagegroup.com</a>`;
    }
  }

  function wireApplyLinks() {
    const href = buildApplyUrl();
    document.querySelectorAll("[data-mmg-apply]").forEach((el) => {
      el.setAttribute("href", href);
      if (el.getAttribute("target") === "_blank") {
        el.setAttribute("rel", "noopener noreferrer");
      }
    });
  }

  function wireSecondaryCtas() {
    const calendly =
      window.MMG_SITE?.calendlyUrl ||
      "https://calendly.com/kevinmartini/private-call-with-martini";
    document.querySelectorAll("[data-mmg-calendly]").forEach((el) => {
      el.setAttribute("href", calendly);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    });
  }

  function wirePhoneLinks() {
    const phone = window.MMG_SITE?.phone || "9192384934";
    const display = window.MMG_SITE?.phoneDisplay || "(919) 238-4934";
    document.querySelectorAll("[data-mmg-phone]").forEach((el) => {
      el.setAttribute("href", `tel:+1${String(phone).replace(/\D/g, "")}`);
      if (el.hasAttribute("data-mmg-phone-text")) {
        el.textContent = `Questions? ${display}`;
      }
    });
  }

  function getShareableCalculatorUrl() {
    const u = new URL(window.location.href);
    u.searchParams.delete("embed");
    if (PAGE.ref) u.searchParams.set("ref", PAGE.ref);
    return u.toString();
  }

  function initPartnerShare() {
    const wrap = document.getElementById("partnerShare");
    const input = document.getElementById("shareLinkInput");
    const copyBtn = document.getElementById("copyShareLink");
    if (!wrap || !input) return;
    const show =
      PAGE.ref ||
      PAGE.params.get("share") === "1" ||
      PAGE.params.get("partner") === "1";
    if (!show) return;
    wrap.classList.remove("hidden");
    input.value = getShareableCalculatorUrl();
    if (PAGE.ref && document.getElementById("partnerShareLabel")) {
      document.getElementById("partnerShareLabel").textContent =
        `Share your tracked link (ref: ${PAGE.ref})`;
    }
    copyBtn?.addEventListener("click", async () => {
      const link = input.value;
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy link";
        }, 2000);
      } catch {
        input.select();
        copyBtn.textContent = "Select & copy";
      }
    });
  }

  function initStickyCta() {
    const bar = document.getElementById("stickyCta");
    if (!bar || PAGE.embed) return;
    const socialWizard = document.body.classList.contains("wizard-social");
    const show = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const wizardStep = Number(document.body.dataset.wizardStep || "0");
      const isLogan5 = document.body.classList.contains("logan5");
      const pastHero = socialWizard
        ? wizardStep >= 3
        : y > 320;
      bar.classList.toggle("sticky-cta-visible", pastHero);
      bar.setAttribute("aria-hidden", pastHero ? "false" : "true");
      document.body.classList.toggle("has-sticky-pad", pastHero);
    };
    window.addEventListener("scroll", show, { passive: true });
    show();
  }

  function taxData() {
    return window.MMG_TAX_RATES || DEFAULT_TAX;
  }

  function creditData() {
    return window.MMG_CREDIT || DEFAULT_CREDIT;
  }

  function $(id) {
    return document.getElementById(id);
  }

  const els = {};
  let showFullAmort = false;
  let rateManualOverride = false;
  let marketRateActive = false;
  let cachedPmms = null;
  let taxManualOverride = false;
  let insuranceManualOverride = false;
  let lastGeocode = null;
  let suggestTimer = null;
  let lookupTimer = null;
  let suggestRequestId = 0;
  let activeSuggestion = -1;
  let lastSuggestions = [];
  let lookupInFlight = false;
  let pendingPropertyLookup = null;
  let addressPickInFlight = false;
  let homePriceAutoFilled = false;
  let homePriceAutoFilledValue = null;
  let lastSelectedAddress = "";
  let lastAddressMagicKey = "";

  function parseCurrency(str) {
    if (typeof str === "number") return str;
    return Number(String(str).replace(/[^0-9.-]/g, "")) || 0;
  }

  function formatCurrency(n, decimals = 0) {
    if (!Number.isFinite(n)) n = 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  }

  function formatCurrencyInput(n) {
    if (!Number.isFinite(n)) return "0";
    return Math.round(n).toLocaleString("en-US");
  }

  function normalizeCounty(name) {
    if (!name) return "";
    return name.toLowerCase().replace(/\s+county$/i, "").replace(/[^a-z]/g, "");
  }

  function getTaxRate(state, countyName) {
    const data = taxData();
    const stateCode = (state || "NC").toUpperCase().slice(0, 2);
    const countyKey = normalizeCounty(countyName);
    const stateCounties = data.counties?.[stateCode];
    if (stateCounties && countyKey && stateCounties[countyKey] != null) {
      return stateCounties[countyKey];
    }
    return data.states?.[stateCode] ?? data.states?.NC ?? 1.0;
  }

  function getInsuranceRate(state, creditScore) {
    const data = taxData();
    const credit = creditData();
    const stateCode = (state || "NC").toUpperCase().slice(0, 2);
    const base = data.insuranceByState?.[stateCode] ?? data.insuranceByState?.default ?? 0.4;
    let mult = 1.0;
    for (const t of credit.insuranceMult || DEFAULT_CREDIT.insuranceMult) {
      if (creditScore >= t.min) {
        mult = t.mult;
        break;
      }
    }
    return base * mult;
  }

  function creditBand(score) {
    if (score >= 760) return { label: "Excellent", note: "Best-tier conventional pricing" };
    if (score >= 740) return { label: "Very good", note: "Strong conventional pricing" };
    if (score >= 720) return { label: "Good", note: "Typical conventional pricing" };
    if (score >= 700) return { label: "Fair plus", note: "Slightly higher rate tier" };
    if (score >= 680) return { label: "Fair", note: "Higher rate and PMI likely" };
    if (score >= 660) return { label: "Below average", note: "Limited program options" };
    if (score >= 640) return { label: "Poor", note: "FHA or credit improvement may help" };
    return { label: "Very poor", note: "Consult a loan officer on options" };
  }

  function lookupCreditAdjust(score) {
    for (const t of creditData().rateAdjust) {
      if (score >= t.min) return t.adjust;
    }
    return 0.875;
  }

  function lookupPmiRate(score) {
    for (const t of creditData().pmiByScore) {
      if (score >= t.min) return t.rate;
    }
    return 1.25;
  }

  let lastRateResult = null;
  let martiniOfferRate = null;
  let typicalLenderRate = null;

  function getLoanProgram() {
    const id = els.loanProgram?.value || "conventional";
    return window.MMG_getLoanProgram ? window.MMG_getLoanProgram(id) : { id: "conventional", minDownPercent: 3, defaultDownPercent: 20, rateSpreadVsConventional: 0, miLabel: "PMI", miRequiredBelowLtv: 80, defaultMiAnnualRate: 0.5 };
  }

  function getBuyerProfile() {
    return {
      firstTimeBuyer: Boolean(document.getElementById("firstTimeBuyer")?.checked),
      veteranEligible: Boolean(document.getElementById("veteranEligible")?.checked),
      usdaEligible: Boolean(document.getElementById("usdaEligible")?.checked),
    };
  }

  function getCountyKey() {
    if (window.MMG_resolveCountyKey && lastGeocode) {
      return window.MMG_resolveCountyKey(lastGeocode);
    }
    return window.MMG_LOAN_LIMITS?.defaultCounty || "wake";
  }

  function getEffectiveMinDown(program) {
    if (window.MMG_getEffectiveMinDown && document.body.classList.contains("logan5")) {
      const price = Number(els.homePrice?.value || 0);
      return window.MMG_getEffectiveMinDown(program.id, getBuyerProfile(), price, getCountyKey());
    }
    return program.minDownPercent ?? 0;
  }

  function getDownPctStep() {
    return document.body.classList.contains("logan5") ? 0.5 : 1;
  }

  function roundDownPct(pct) {
    const step = getDownPctStep();
    return Math.round((Number(pct) || 0) / step) * step;
  }

  function formatDownPctLabel(pct) {
    const n = Number(pct) || 0;
    return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
  }

  function snapDownToProgramDefault() {
    if (!document.body.classList.contains("logan5")) return;
    const program = getLoanProgram();
    const profile = getBuyerProfile();
    const price = Number(els.homePrice?.value || 0);
    const countyKey = getCountyKey();
    const down =
      window.MMG_getProgramDefaultDown?.(program.id, profile) ??
      program.defaultDownPercent ??
      getEffectiveMinDown(program);
    const min = getEffectiveMinDown(program);
    const target = roundDownPct(Math.max(min, down));
    if (els.downPercent) {
      els.downPercent.step = String(getDownPctStep());
      els.downPercent.value = String(target);
    }
    if (els.downPercentInput) els.downPercentInput.value = target;
    syncDownFromPercent();
  }

  function programNeedsMonthlyMi(program, downPct) {
    if (program.id === "va") return false;
    if (program.id === "conventional" || program.id === "jumbo") return downPct < 20;
    if (program.id === "fha" || program.id === "usda") return true;
    return downPct < 20;
  }

  function applyLoanProgramUi() {
    const program = getLoanProgram();
    if (els.loanProgramNote) {
      els.loanProgramNote.textContent = program.description || "";
    }
    if (els.programDownHint) {
      const min = getEffectiveMinDown(program);
      const profile = getBuyerProfile();
      const price = Number(els.homePrice?.value || 0);
      const countyKey = getCountyKey();
      let hint = "";
      if (
        program.id === "fha" &&
        window.MMG_getFhaIneligibleNote &&
        price > 0 &&
        !window.MMG_isFhaEligible(price, countyKey)
      ) {
        hint = window.MMG_getFhaIneligibleNote(price, countyKey);
        els.programDownHint.textContent = hint;
        els.programDownHint.classList.remove("hidden");
      } else if (min <= 0) {
        els.programDownHint.textContent = `${program.shortLabel}: no down payment required for eligible buyers.`;
        els.programDownHint.classList.remove("hidden");
      } else if (min < 20) {
        hint = `${program.shortLabel}: minimum ${min}% down for this estimate.`;
        if (document.body.classList.contains("logan5") && program.id === "conventional") {
          hint += profile.firstTimeBuyer
            ? " First-time buyer programs (e.g. HomeReady) may allow 3%."
            : " Non–first-time buyers often need 5%+ on conventional.";
        }
        if (program.id === "jumbo" && window.MMG_getConformingLimit) {
          hint += ` Conforming limit ${formatCurrency(window.MMG_getConformingLimit(countyKey))} (2026).`;
        }
        els.programDownHint.textContent = hint;
        els.programDownHint.classList.remove("hidden");
      } else {
        els.programDownHint.classList.add("hidden");
      }
    }
    if (els.pmiRateLabel) {
      const hint = program.id === "conventional" && Number(els.downPercent?.value || 0) < 20
        ? " (when down < 20%)"
        : program.id === "va"
          ? ""
          : " (program estimate)";
      els.pmiRateLabel.innerHTML = `${program.miLabel} rate<span class="hint">${hint}</span>`;
    }
    if (els.feeSheetProgramNote) {
      els.feeSheetProgramNote.textContent = program.feeSheetNote || "";
    }
    const minDown = getEffectiveMinDown(program);
    if (els.downPercent) {
      els.downPercent.min = String(minDown);
    }
    if (els.downPercentInput) {
      els.downPercentInput.min = String(minDown);
    }
    const currentDown = Number(els.downPercent?.value || 0);
    if (currentDown < minDown) {
      const bumped = roundDownPct(minDown);
      if (els.downPercent) els.downPercent.value = String(bumped);
      if (els.downPercentInput) els.downPercentInput.value = bumped;
      syncDownFromPercent();
    }
    applyCreditToPmi();
  }

  function pmmsDayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function invalidatePmmsCacheIfNewDay() {
    try {
      if (sessionStorage.getItem("mmg_pmms_day") !== pmmsDayKey()) {
        cachedPmms = null;
      }
    } catch {
      cachedPmms = null;
    }
  }

  async function fetchMarketBaseline() {
    const dayKey = pmmsDayKey();
    invalidatePmmsCacheIfNewDay();
    try {
      if (sessionStorage.getItem("mmg_pmms_day") === dayKey && cachedPmms) {
        return cachedPmms;
      }
    } catch {
      /* ignore */
    }

    const fallback =
      window.MMG_MARKET?.fallback ||
      { rate30: DEFAULT_TYPICAL_LENDER_RATE, rate15: 5.875, asOf: "estimate" };
    if (API_BASE !== null) {
      try {
        const res = await fetch(apiUrl(`api/market-rate?day=${dayKey}`));
        if (res.ok) {
          const data = await res.json();
          if (pmmsHasValidRates(data)) {
            cachedPmms = data;
            try {
              sessionStorage.setItem("mmg_pmms_day", dayKey);
            } catch {
              /* ignore */
            }
            return cachedPmms;
          }
        }
      } catch {
        /* fallback */
      }
    }
    cachedPmms = { ...fallback, source: "Freddie Mac PMMS (cached)", cacheDate: dayKey };
    return cachedPmms;
  }

  function getPmmsFallback() {
    return (
      window.MMG_MARKET?.fallback || {
        rate30: DEFAULT_TYPICAL_LENDER_RATE,
        rate15: 5.875,
        asOf: "estimate",
      }
    );
  }

  function pmmsHasValidRates(pmms) {
    if (!pmms || typeof pmms !== "object") return false;
    const r30 = Number(pmms.rate30);
    const r15 = Number(pmms.rate15);
    return (Number.isFinite(r30) && r30 > 0) || (Number.isFinite(r15) && r15 > 0);
  }

  function getRateScenarioInputs() {
    const program = getLoanProgram();
    return {
      creditScore: Number(els.creditScore?.value || 740),
      downPercent: Number(els.downPercent?.value || 20),
      termYears: Number(els.loanTerm?.value || 30),
      programSpread: Number(program.rateSpreadVsConventional) || 0,
    };
  }

  /** PMMS baseline + credit/LTV/program adjustments (see market-rates.js). */
  function buildScenarioRates(pmms) {
    const safePmms = pmmsHasValidRates(pmms) ? pmms : getPmmsFallback();
    const { creditScore, downPercent, termYears, programSpread } = getRateScenarioInputs();
    const pmmsBaseline = window.MMG_pmmsBaselineRate?.(safePmms, termYears);
    const baseline =
      Number.isFinite(pmmsBaseline) && pmmsBaseline > 0
        ? pmmsBaseline
        : DEFAULT_TYPICAL_LENDER_RATE;

    if (window.MMG_computeMarketRate) {
      const computed = window.MMG_computeMarketRate(
        safePmms.rate30,
        safePmms.rate15,
        creditScore,
        downPercent,
        termYears,
        programSpread
      );
      return {
        typicalLenderRate: computed.parRate,
        martiniOfferRate: computed.martiniRate,
        pmmsBaseline: baseline,
        creditAdj: computed.creditAdj,
        ltvAdj: computed.ltvAdj,
        programSpread: computed.programSpread,
        termYears,
        creditScore,
        downPercent,
      };
    }

    const typical = baseline;
    const martini = window.MMG_roundToEighth
      ? window.MMG_roundToEighth(Math.max(0, typical - 0.25))
      : DEFAULT_MARTINI_OFFER_RATE;
    return {
      typicalLenderRate: typical,
      martiniOfferRate: martini,
      pmmsBaseline: baseline,
      creditAdj: 0,
      ltvAdj: 0,
      programSpread,
      termYears,
      creditScore,
      downPercent,
    };
  }

  function updateCreditRateNote(rateInfo) {
    if (!els.creditRateNote) return;
    const fmt = window.MMG_formatRate || ((n) => String(n));
    const adj = rateInfo?.creditAdj;
    if (adj == null || !Number.isFinite(adj)) {
      els.creditRateNote.classList.add("hidden");
      return;
    }
    els.creditRateNote.classList.remove("hidden");
    if (adj < -0.001) {
      els.creditRateNote.textContent = `Your credit score lowers the estimated rate by about ${fmt(Math.abs(adj))}% vs. baseline pricing (on top of today's PMMS average).`;
    } else if (adj > 0.001) {
      els.creditRateNote.textContent = `Your credit score adds about ${fmt(adj)}% to the estimated rate vs. top-tier pricing (on top of today's PMMS average).`;
    } else {
      els.creditRateNote.textContent =
        "Your credit score is in a typical pricing tier. Move the slider to see how rate estimates change.";
    }
  }

  function applyDisplayedRatesToUi(pmms, asOfLabel) {
    if (!els.interestRate || !els.marketRateDisplay) return null;
    const fmt = window.MMG_formatRate || ((n) => String(n));
    const scenario = buildScenarioRates(pmms);
    const typical = scenario.typicalLenderRate;
    const martini = scenario.martiniOfferRate;
    typicalLenderRate = typical;
    martiniOfferRate = martini;

    els.marketRateDisplay.textContent = `${fmt(typical)}%`;
    if (!rateManualOverride) {
      els.interestRate.value = fmt(martini);
    }

    const termYears = scenario.termYears;
    const termLabel = termYears <= 15 ? "15-year" : `${termYears}-year`;
    const pmmsBase = fmt(scenario.pmmsBaseline);
    if (els.marketRateUpdated) {
      const datePart =
        asOfLabel && asOfLabel !== "estimate"
          ? asOfLabel
          : pmms.source === "Freddie Mac PMMS"
            ? "updated today"
            : "estimate";
      const source =
        pmms.source && pmms.source !== "estimate"
          ? pmms.source
          : "Freddie Mac PMMS";
      const treasury10 = Number(pmms.treasury10y);
      const treasuryPart =
        Number.isFinite(treasury10) && treasury10 > 0
          ? `10yr Treasury ${fmt(treasury10)}% · `
          : "";
      els.marketRateUpdated.innerHTML =
        `${treasuryPart}<strong>${source}</strong> ${pmmsBase}% (${datePart}, refreshes daily) → typical lender ${fmt(typical)}% · Martini ${fmt(martini)}% (${termLabel}). ` +
        `Rates adjust for your <strong>credit score</strong>, down payment, term, and program.`;
    }

    if (els.rateDailyBadge) {
      els.rateDailyBadge.textContent = "Daily PMMS";
    }

    if (els.rateSavingsChip) {
      const diff = typical - martini;
      if (diff >= 0.125) {
        els.rateSavingsChip.classList.remove("hidden");
        els.rateSavingsChip.textContent = `${fmt(diff)}% below typical lender`;
      } else {
        els.rateSavingsChip.classList.add("hidden");
      }
    }

    updateCreditRateNote(scenario);
    updateHeroLiveRate(scenario);
    updateMarketPulse(scenario);

    lastRateResult = {
      ...(lastRateResult || {}),
      ...scenario,
      typicalLenderRate: typical,
      martiniOfferRate: martini,
      parRate: typical,
      marketRate: typical,
      martiniRate: martini,
    };
    marketRateActive = true;
    return lastRateResult;
  }

  function applyBaselineRatesImmediate() {
    if (!cachedPmms || !pmmsHasValidRates(cachedPmms)) {
      cachedPmms = getPmmsFallback();
    }
    const pmms = cachedPmms;
    applyDisplayedRatesToUi(pmms, pmms.asOf || pmms.source || "estimate");
    updateDiscountPointsAndApr();
    calculate();
  }

  function updatePricingAdvantage(rateResult) {
    const fmt = window.MMG_formatRate || ((n) => String(n));
    const typical = rateResult?.typicalLenderRate ?? typicalLenderRate;
    const martini = rateResult?.martiniOfferRate ?? martiniOfferRate;
    if (typical == null || martini == null) return;

    const diff = typical - martini;
    if (els.rateSavingsChip) {
      if (diff >= 0.125) {
        els.rateSavingsChip.classList.remove("hidden");
        els.rateSavingsChip.textContent = `${fmt(diff)}% below typical lender`;
      } else {
        els.rateSavingsChip.classList.add("hidden");
      }
    }
  }

  function updateVsCompetitionPanel(
    loanPrincipal,
    userRate,
    years,
    monthlyTax,
    monthlyInsurance,
    monthlyPmi
  ) {
    if (!els.vsCompetition) return null;

    const fmt = window.MMG_formatRate || ((n) => String(n));
    const typical =
      typicalLenderRate ??
      lastRateResult?.typicalLenderRate ??
      DEFAULT_TYPICAL_LENDER_RATE;
    const martiniRate = roundRateToEighth(
      Number(userRate) ||
        martiniOfferRate ||
        lastRateResult?.martiniOfferRate ||
        DEFAULT_MARTINI_OFFER_RATE
    );

    if (loanPrincipal <= 0) {
      els.vsCompetition.classList.add("hidden");
      return null;
    }
    if (typical <= 0 || martiniRate <= 0) {
      els.vsCompetition.classList.add("hidden");
      return null;
    }

    const piTypical = monthlyPI(loanPrincipal, typical, years);
    const piMartini = monthlyPI(loanPrincipal, martiniRate, years);
    const pitiTypical = piTypical + monthlyTax + monthlyInsurance + monthlyPmi;
    const pitiMartini = piMartini + monthlyTax + monthlyInsurance + monthlyPmi;
    const monthlyPiSave = Math.max(0, Math.round(piTypical - piMartini));
    const monthlyPitiSave = Math.max(0, Math.round(pitiTypical - pitiMartini));

    const schedTypical = buildAmortSchedule(loanPrincipal, typical, years);
    const schedMartini = buildAmortSchedule(loanPrincipal, martiniRate, years);
    const lifetimeSave = Math.max(
      0,
      Math.round(schedTypical.totalInterest - schedMartini.totalInterest)
    );

    const reference =
      martiniOfferRate ??
      lastRateResult?.martiniOfferRate ??
      DEFAULT_MARTINI_OFFER_RATE;
    let pointsCost = 0;
    if (martiniRate < reference - 0.001) {
      const reduction = reference - martiniRate;
      const points =
        window.MMG_discountPointsForBuydown?.(reduction) ?? reduction / 0.25;
      pointsCost = window.MMG_discountPointsDollarCost?.(loanPrincipal, points) ?? 0;
    }

    els.vsCompetition.classList.remove("hidden");
    if (els.vsTypicalRate) els.vsTypicalRate.textContent = `${fmt(typical)}%`;
    if (els.vsMartiniRate) els.vsMartiniRate.textContent = `${fmt(martiniRate)}%`;
    if (els.vsTypicalPi) {
      els.vsTypicalPi.textContent = `${formatCurrency(piTypical)}/mo P&I`;
    }
    if (els.vsMartiniPi) {
      els.vsMartiniPi.textContent = `${formatCurrency(piMartini)}/mo P&I`;
    }
    if (els.vsMonthlyPiSave) {
      els.vsMonthlyPiSave.textContent = `${formatCurrency(monthlyPiSave)}/mo`;
    }
    if (els.vsMonthlyPitiSave) {
      els.vsMonthlyPitiSave.textContent = `${formatCurrency(monthlyPitiSave)}/mo`;
    }
    if (els.vsLifetimeInterestSave) {
      els.vsLifetimeInterestSave.textContent = formatCurrency(lifetimeSave);
    }
    if (els.vsPointsRow && els.vsPointsCost) {
      const showPts = pointsCost > 0;
      els.vsPointsRow.classList.toggle("hidden", !showPts);
      if (showPts) {
        els.vsPointsCost.textContent = formatCurrency(pointsCost);
      }
    }
    const rateDiff = typical - martiniRate;
    if (els.vsCompNote) {
      let note =
        "Same loan amount and term. Typical lender uses today's Freddie Mac PMMS average plus pricing for your credit and down payment; Martini uses your rate above.";
      if (pointsCost > 0) {
        note += ` Your lower rate includes about ${formatCurrency(pointsCost)} in discount points at closing (included in APR estimate).`;
      } else if (rateDiff >= 0.125) {
        note += ` You save about ${formatCurrency(monthlyPitiSave)}/mo on your full payment vs. what most lenders advertise today.`;
      }
      els.vsCompNote.textContent = note;
    }

    return {
      monthlyPiSave,
      monthlyPitiSave,
      lifetimeSave,
      typical,
      martiniRate,
      loanPrincipal,
      years,
      monthlyTax,
      monthlyInsurance,
      monthlyPmi,
    };
  }

  function estimateTypicalLenderCashToClose(
    loanPrincipal,
    downPayment,
    annualTax,
    annualInsurance,
    martiniPointsCost
  ) {
    const lenderBase = window.MMG_MARKET?.aprFinanceCharge ?? 2500;
    const prepaids = Math.round((annualTax / 12) * 3 + (annualInsurance / 12) * 14);
    const martiniClosing = Math.round(loanPrincipal * 0.02 + lenderBase);
    const martiniPoints = Math.max(0, Number(martiniPointsCost) || 0);
    const martiniCash = downPayment + martiniClosing + prepaids + martiniPoints;

    const typicalClosing = Math.round(
      loanPrincipal * 0.02 + lenderBase * 1.75 + loanPrincipal * 0.004
    );
    const typicalPoints = Math.round(loanPrincipal * 0.01);
    const typicalCash = downPayment + typicalClosing + prepaids + typicalPoints;

    return {
      martiniCash,
      typicalCash,
      savings: Math.max(0, typicalCash - martiniCash),
    };
  }

  function updateLeadSavingsRibbon(monthlyPitiSave, rateDiff, cashSavings) {
    if (!els.leadSavingsRibbon || !els.leadSavingsAmount) return;
    const save = Math.max(0, Number(monthlyPitiSave) || 0);
    const cashSave = Math.max(0, Number(cashSavings) || 0);
    const showMonthly = save >= 25 && (rateDiff == null || rateDiff >= 0.0625);
    const showCash = cashSave >= 500;
    const show = showMonthly || showCash;
    els.leadSavingsRibbon.classList.toggle("hidden", !show);
    if (els.leadMonthlySavingsRow) {
      els.leadMonthlySavingsRow.classList.toggle("hidden", !showMonthly);
    }
    if (showMonthly) {
      els.leadSavingsAmount.textContent = formatCurrency(save);
    }
    if (els.leadCashSavingsRow) {
      els.leadCashSavingsRow.classList.toggle("hidden", !showCash);
    }
    if (els.leadCashSavingsAmount && showCash) {
      els.leadCashSavingsAmount.textContent = formatCurrency(cashSave);
    }
    if (els.leadCashSavingsNote) {
      els.leadCashSavingsNote.classList.toggle("hidden", !showCash);
    }
  }

  function updateHeroLiveRate(scenario) {
    if (!els.heroLiveRate) return;
    const fmt = window.MMG_formatRate || ((n) => String(n));
    const pmms = scenario?.pmmsBaseline ?? cachedPmms?.rate30 ?? cachedPmms?.rate;
    const typical = scenario?.typicalLenderRate ?? typicalLenderRate;
    const martini = scenario?.martiniOfferRate ?? martiniOfferRate;
    const term = scenario?.termYears ?? Number(els.loanTerm?.value || 30);
    if (pmms == null || typical == null || martini == null) {
      els.heroLiveRate.textContent = "Today\u2019s market \u00b7 loading rates\u2026";
      return;
    }
    const termShort = term <= 15 ? "15-yr" : "30-yr";
    els.heroLiveRate.textContent =
      `${termShort} PMMS ${fmt(pmms)}% \u00b7 Typical lender ${fmt(typical)}% \u00b7 Your Martini ${fmt(martini)}%`;
  }

  function updateMarketPulse(scenario) {
    if (!els.marketPulseText) return;
    const fmt = window.MMG_formatRate || ((n) => String(n));
    const typical = scenario?.typicalLenderRate ?? typicalLenderRate;
    const martini = scenario?.martiniOfferRate ?? martiniOfferRate;
    const diff =
      typical != null && martini != null ? typical - martini : 0;
    const credit = scenario?.creditScore ?? Number(els.creditScore?.value || 740);
    let line =
      "Freddie Mac PMMS updates daily. Your estimate reflects credit, down payment, and program—not a one-size-fits-all online quote.";
    if (diff >= 0.25) {
      line = `On this scenario, Martini pricing is about ${fmt(diff)}% below the typical lender rate—often better than anonymous internet pre-approvals.`;
    } else if (credit < 680) {
      line =
        "Credit below 680? A local strategist can map FHA, VA, or credit-improvement paths—faster than guessing on a big-box lender site.";
    } else {
      line =
        "Triangle buyers still compare 3+ lenders online—we show your payment and rate edge upfront, then verify with a soft-pull application.";
    }
    els.marketPulseText.textContent = line;
  }

  function scheduleDailyRateRefresh() {
    const refreshIfNewDay = async () => {
      const dayKey = pmmsDayKey();
      let storedDay = "";
      try {
        storedDay = sessionStorage.getItem("mmg_pmms_day") || "";
      } catch {
        storedDay = "";
      }
      if (storedDay !== dayKey) {
        cachedPmms = null;
        if (!rateManualOverride) await applyMartiniRate();
      }
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshIfNewDay();
    });
    setInterval(refreshIfNewDay, 60 * 60 * 1000);
  }

  function updateDiscountPointsAndApr() {
    const fmt = window.MMG_formatRate || ((n) => String(n));
    const homePrice = Number(els.homePrice?.value || 0);
    const downPct = Number(els.downPercent?.value || 0);
    const loanPrincipal = Math.max(0, homePrice - Math.round((homePrice * downPct) / 100));
    const term = Number(els.loanTerm?.value || 30);
    const userRate = roundRateToEighth(Number(els.interestRate?.value) || 0);
    const reference =
      martiniOfferRate ??
      lastRateResult?.martiniOfferRate ??
      DEFAULT_MARTINI_OFFER_RATE;

    let points = 0;
    let pointsCost = 0;
    if (reference != null && userRate > 0 && userRate < reference - 0.001) {
      const reduction = reference - userRate;
      points = window.MMG_discountPointsForBuydown?.(reduction) ?? reduction / 0.25;
      pointsCost = window.MMG_discountPointsDollarCost?.(loanPrincipal, points) ?? 0;
    }

    if (els.discountPointsPanel) {
      const showPoints = points > 0 && loanPrincipal > 0;
      els.discountPointsPanel.classList.toggle("hidden", !showPoints);
      if (showPoints && els.discountPointsDetail) {
        els.discountPointsDetail.textContent = `${points.toFixed(2)} point${points === 1 ? "" : "s"} · ${formatCurrency(pointsCost)} due at closing (about ${formatCurrency(Math.round(pointsCost / (term * 12)))}/mo if financed into the loan term — estimate only)`;
      }
    }

    if (els.feeSheetPointsRow) {
      els.feeSheetPointsRow.classList.toggle("hidden", !(points > 0));
    }
    if (els.feeSheetPointsCost && points > 0) {
      els.feeSheetPointsCost.textContent = `${points.toFixed(2)} pts · ${formatCurrency(pointsCost)}`;
    }

    updateFeeSheet(lastRateResult, loanPrincipal, term, userRate, pointsCost);
    return { points, pointsCost, loanPrincipal, term, userRate };
  }

  function updateFeeSheet(rateResult, loanPrincipal, termYears, userNoteRate, pointsCost) {
    if (!window.MMG_computeApr) return;
    const fmt = window.MMG_formatRate || ((n) => String(n));
    const m = window.MMG_MARKET || {};
    const typicalNote = rateResult?.typicalLenderRate ?? typicalLenderRate ?? 0;
    const userRate =
      userNoteRate != null
        ? userNoteRate
        : roundRateToEighth(Number(els.interestRate?.value) || 0);
    const baseFees = m.aprFinanceCharge ?? 2500;
    const extraPoints = Math.max(0, Number(pointsCost) || 0);
    const userAprFees = baseFees + extraPoints;

    const typicalApr = window.MMG_computeApr(loanPrincipal, typicalNote, termYears, baseFees);
    const userApr = window.MMG_computeApr(loanPrincipal, userRate, termYears, userAprFees);

    if (els.feeSheetParNoteRate) els.feeSheetParNoteRate.textContent = `${fmt(typicalNote)}%`;
    if (els.feeSheetNoteRate) els.feeSheetNoteRate.textContent = `${fmt(userRate)}%`;
    if (els.feeSheetMarketApr) els.feeSheetMarketApr.textContent = `${fmt(typicalApr)}%`;
    if (els.feeSheetMartiniApr) els.feeSheetMartiniApr.textContent = `${fmt(userApr)}%`;

    if (rateResult) {
      lastRateResult = {
        ...rateResult,
        typicalLenderRate: typicalNote,
        martiniOfferRate: martiniOfferRate ?? rateResult.martiniOfferRate,
        parApr: typicalApr,
        martiniApr: userApr,
        userApr,
        discountPoints:
          extraPoints > 0
            ? window.MMG_discountPointsForBuydown?.(
                (martiniOfferRate ?? DEFAULT_MARTINI_OFFER_RATE) - userRate
              )
            : 0,
        discountPointsCost: extraPoints,
      };
    }
    updatePricingAdvantage(lastRateResult);
  }

  async function applyMartiniRate() {
    if (!els.interestRate) return;

    try {
      await fetchMarketBaseline();
      if (!pmmsHasValidRates(cachedPmms)) cachedPmms = getPmmsFallback();
      const pmms = cachedPmms;
      applyDisplayedRatesToUi(pmms, pmms.asOf || pmms.source || "updated today");
      applyCreditToPmi();
      updateDiscountPointsAndApr();
      calculate();
    } catch {
      applyBaselineRatesImmediate();
      if (els.marketRateUpdated) {
        els.marketRateUpdated.textContent =
          (els.marketRateUpdated.textContent || "") +
          " Live rate feed unavailable — showing estimate. Run via server.py for daily PMMS.";
      }
    }
  }

  async function refreshMarketRateIfActive() {
    if (!rateManualOverride) await applyMartiniRate();
  }

  function roundRateToEighth(rate) {
    if (window.MMG_roundToEighth) return window.MMG_roundToEighth(rate);
    return Math.round(rate / 0.125) * 0.125;
  }

  function applyCreditToRate() {
    if (rateManualOverride || !els.interestRate) return;
    if (!cachedPmms || !pmmsHasValidRates(cachedPmms)) {
      cachedPmms = getPmmsFallback();
    }
    applyDisplayedRatesToUi(cachedPmms, cachedPmms.asOf || cachedPmms.source || "estimate");
    updateDiscountPointsAndApr();
  }

  function applyCreditToPmi() {
    if (!els.pmiRate) return;
    const program = getLoanProgram();
    if (program.id === "va") {
      els.pmiRate.value = 0;
      return;
    }
    if (program.defaultMiAnnualRate != null && program.id !== "conventional") {
      els.pmiRate.value = program.defaultMiAnnualRate;
      return;
    }
    if (els.creditScore) {
      els.pmiRate.value = lookupPmiRate(Number(els.creditScore.value));
    }
  }

  function updateCreditUI() {
    if (!els.creditScore) return;
    const score = Number(els.creditScore.value);
    if (els.creditScoreDisplay) els.creditScoreDisplay.textContent = String(score);
    const band = creditBand(score);
    if (els.creditBandLabel) {
      els.creditBandLabel.textContent = `${band.label} — ${band.note}`;
    }
    applyCreditToRate();
    applyCreditToPmi();
    if (lastGeocode && !insuranceManualOverride) {
      refreshInsuranceFromCredit();
    }
  }

  function refreshInsuranceFromCredit() {
    if (!lastGeocode || !els.homeInsurance) return;
    const homePrice = Number(els.homePrice?.value || 0);
    const score = Number(els.creditScore?.value || 740);
    const insRate = getInsuranceRate(lastGeocode.state, score);
    els.homeInsurance.value = formatCurrencyInput(Math.round(homePrice * (insRate / 100)));
  }

  function monthlyPI(principal, annualRate, years) {
    if (principal <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return principal / n;
    const factor = Math.pow(1 + r, n);
    return (principal * r * factor) / (factor - 1);
  }

  function buildAmortSchedule(principal, annualRate, years) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    const payment = monthlyPI(principal, annualRate, years);
    const rows = [];
    let balance = principal;
    let totalInterest = 0;

    for (let i = 1; i <= n; i++) {
      const interest = r === 0 ? 0 : balance * r;
      const principalPaid = Math.min(payment - interest, balance);
      balance = Math.max(0, balance - principalPaid);
      totalInterest += interest;
      rows.push({ month: i, payment, principal: principalPaid, interest, balance });
      if (balance <= 0.01) break;
    }
    return { rows, totalInterest, payment };
  }

  function syncDownFromPercent() {
    const price = Number(els.homePrice?.value || 0);
    const pct = roundDownPct(els.downPercent?.value || 0);
    const amount = Math.round((price * pct) / 100);
    if (els.downAmountInput) els.downAmountInput.value = formatCurrencyInput(amount);
    if (els.downPercentInput) els.downPercentInput.value = pct;
    if (els.downDisplay) {
      els.downDisplay.textContent = `${formatDownPctLabel(pct)} · ${formatCurrency(amount)}`;
    }
  }

  function syncDownFromAmount() {
    const price = Number(els.homePrice?.value || 0);
    const amount = parseCurrency(els.downAmountInput?.value);
    const pct = price > 0 ? Math.min(100, Math.round((amount / price) * 1000) / 10) : 0;
    const clampedPct = roundDownPct(Math.min(50, Math.max(0, pct)));
    if (els.downPercent) els.downPercent.value = String(clampedPct);
    if (els.downPercentInput) els.downPercentInput.value = clampedPct;
    if (els.downDisplay) {
      els.downDisplay.textContent = `${formatDownPctLabel(clampedPct)} · ${formatCurrency(amount)}`;
    }
  }

  function setLocationNote(message, type) {
    if (!els.locationNote) return;
    els.locationNote.className = "field-note" + (type ? ` field-note-${type}` : "");
    els.locationNote.textContent = message;
  }

  function setHomePriceAutoFilled(active, price) {
    homePriceAutoFilled = active;
    homePriceAutoFilledValue = active ? price : null;
    if (els.homePriceHint) {
      els.homePriceHint.classList.toggle("hidden", !active);
    }
    if (els.homePriceField) {
      els.homePriceField.classList.toggle("home-price-auto", !!active);
    }
  }

  function clearHomePriceAutoFilledIfChanged(newPrice) {
    if (!homePriceAutoFilled) return;
    if (homePriceAutoFilledValue !== null && Number(newPrice) !== Number(homePriceAutoFilledValue)) {
      setHomePriceAutoFilled(false);
    }
  }

  function resolveAutoFillPrice(data) {
    if (!data) return 0;
    const auto = Number(data.autoFillPrice);
    if (Number.isFinite(auto) && auto > 0) return auto;
    if (data.priceSource && Number(data.homePrice) > 0) return Number(data.homePrice);
    if (data.priceSourceLabel && Number(data.assessedValue) > 0) {
      return Number(data.assessedValue);
    }
    return 0;
  }

  function applyPropertyData(data) {
    if (!data?.location) return;
    if (!els.pitiPayment) cacheElements();
    lastGeocode = data.location;
    taxManualOverride = false;
    insuranceManualOverride = false;

    const fillPrice = resolveAutoFillPrice(data);
    if (fillPrice > 0 && els.homePrice) {
      const price = Math.min(3000000, Math.max(50000, fillPrice));
      els.homePrice.value = price;
      if (els.homePriceInput) els.homePriceInput.value = formatCurrencyInput(price);
      if (els.homePriceDisplay) els.homePriceDisplay.textContent = formatCurrency(price);
      syncDownFromPercent();
      setHomePriceAutoFilled(true, price);
      data.homePrice = price;
    } else if (data.updatePriceRequested) {
      setHomePriceAutoFilled(false);
    }

    if (els.propertyTax) {
      els.propertyTax.value = formatCurrencyInput(data.annualTax);
    }
    if (els.homeInsurance) {
      els.homeInsurance.value = formatCurrencyInput(data.annualInsurance);
    }

    const taxLabel =
      data.taxSource === "wake_county_tax_records"
        ? "annual tax bill (Wake County records)"
        : `est. property tax ${data.taxRatePercent?.toFixed(2)}%/yr`;
    const insLabel = `homeowners insurance ${data.insuranceRatePercent?.toFixed(2)}%/yr (credit-adjusted)`;

    let note = `${data.location.display}: ${taxLabel} · ${insLabel}.`;
    if (fillPrice > 0) {
      const priceLabel = data.priceSourceLabel || "estimated value";
      note = `${data.location.display}: purchase price set to ${formatCurrency(fillPrice)} (${priceLabel}) — you can change it in Loan details. ${taxLabel} · ${insLabel}.`;
    } else if (data.updatePriceRequested && !data.priceLookupConfigured) {
      note +=
        " Pick an address from the suggestions so we can look up list price or market value.";
    } else if (data.parcelMismatch) {
      note +=
        " We couldn't match property records to this exact address — pick the closest suggestion from the list, then adjust purchase price if needed.";
    } else if (data.updatePriceRequested && data.priceLookupConfigured) {
      note +=
        " We couldn't find a list price or market estimate for this address — enter purchase price manually in Loan details.";
    } else {
      note += " Adjust below if you have actual quotes.";
    }
    const noteType = data.parcelMismatch ? "warn" : "success";
    setLocationNote(note, noteType);
    if (!rateManualOverride) {
      applyBaselineRatesImmediate();
    }
    calculate();
  }

  function buildLocalPropertyEstimate(location) {
    const homePrice = Number(els.homePrice?.value || 450000);
    const score = Number(els.creditScore?.value || 740);
    const taxRate = getTaxRate(location.state, location.county);
    const insRate = getInsuranceRate(location.state, score);
    return {
      location,
      homePrice,
      annualTax: Math.round(homePrice * (taxRate / 100)),
      annualInsurance: Math.round(homePrice * (insRate / 100)),
      taxRatePercent: taxRate,
      insuranceRatePercent: insRate,
      taxSource: "county_median_rate",
    };
  }

  async function fetchPropertyData(address, location, magicKey, updatePrice = false) {
    const homePrice = Number(els.homePrice?.value || 450000);
    const creditScore = Number(els.creditScore?.value || 740);
    const params = new URLSearchParams({
      address,
      homePrice: String(homePrice),
      creditScore: String(creditScore),
    });
    if (magicKey) params.set("magicKey", magicKey);
    if (updatePrice) params.set("updatePrice", "1");

    if (API_BASE !== null) {
      try {
        const res = await fetch(apiUrl(`api/property?${params}`));
        if (res.status === 404) throw new Error("Address not found");
        if (!res.ok) throw new Error("Lookup failed");
        return await res.json();
      } catch (err) {
        if (err.message === "Address not found" || err.message === "Lookup failed") {
          throw err;
        }
        /* fall through on network errors */
      }
    }

    const loc = location?.state
      ? location
      : await geocodeAddress(address, magicKey);
    if (!loc?.state) throw new Error("Address not found");
    const estimate = buildLocalPropertyEstimate(loc);
    estimate.updatePriceRequested = updatePrice;
    estimate.priceLookupConfigured = false;
    return estimate;
  }

  const STATE_NAME_TO_CODE = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
    colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
    kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
    oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
    virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
    wyoming: "WY", "district of columbia": "DC",
  };

  function resolveStateCode(addr) {
    if (addr["ISO3166-2-lvl4"]) {
      const m = addr["ISO3166-2-lvl4"].match(/^US-([A-Z]{2})$/i);
      if (m) return m[1].toUpperCase();
    }
    if (addr.state) {
      const s = String(addr.state).trim();
      if (s.length === 2) return s.toUpperCase();
      return STATE_NAME_TO_CODE[s.toLowerCase()] || "";
    }
    return "";
  }

  function formatPhotonAddress(props) {
    return [
      [props.housenumber, props.street].filter(Boolean).join(" "),
      props.city,
      props.state,
      props.postcode,
    ]
      .filter(Boolean)
      .join(", ");
  }

  function resolveStateCodeFromPhoton(stateVal) {
    if (!stateVal) return "";
    const s = String(stateVal).trim();
    if (s.length === 2) return s.toUpperCase();
    return STATE_NAME_TO_CODE[s.toLowerCase()] || "";
  }

  function locationFromPhoton(feature) {
    const p = feature.properties || {};
    let county = p.county || "";
    if (county && !/county/i.test(county)) county = `${county} County`;
    return {
      state: resolveStateCodeFromPhoton(p.state),
      county,
      city: p.city || "",
      zip: p.postcode || "",
      display: formatPhotonAddress(p),
    };
  }

  function locationFromNominatim(result) {
    const addr = result.address || {};
    return {
      state: resolveStateCode(addr),
      county: addr.county || "",
      city: addr.city || addr.town || "",
      zip: addr.postcode || "",
      display: [addr.city, addr.county, resolveStateCode(addr), addr.postcode]
        .filter(Boolean)
        .join(", "),
    };
  }

  async function geocodeWithPhoton(address) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();
    if (!data.features?.length) throw new Error("Address not found");
    const loc = locationFromPhoton(data.features[0]);
    if (!loc.state) throw new Error("Address not found");
    return loc;
  }

  async function geocodeWithCensus(address) {
    const url =
      "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?" +
      new URLSearchParams({ address, benchmark: "4", vintage: "4", format: "json" });
    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();
    const match = data.result?.addressMatches?.[0];
    if (!match) throw new Error("Address not found");
    const comp = match.addressComponents || {};
    const countyGeo = match.geographies?.Counties?.[0];
    const state = (comp.state || "").toUpperCase();
    const county = countyGeo?.NAME || "";
    const city = comp.city
      ? comp.city.charAt(0) + comp.city.slice(1).toLowerCase()
      : "";
    return {
      state,
      county,
      city,
      zip: comp.zip || "",
      display: match.matchedAddress || address,
    };
  }

  async function geocodeWithEsri(address, magicKey) {
    const { lon, lat, dist } = suggestBias(address);
    const params = magicKey
      ? new URLSearchParams({ magicKey, f: "json", outFields: "City,Region,Subregion,Postal,Addr_type" })
      : new URLSearchParams({
          SingleLine: address,
          countryCode: "USA",
          maxLocations: "1",
          f: "json",
          location: `${lon},${lat}`,
          distance: String(dist),
          category: "Address",
          outFields: "City,Region,Subregion,Postal,Addr_type",
        });
    const path = magicKey ? "findAddressCandidates" : "findAddressCandidates";
    const res = await fetch(
      `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/${path}?${params}`
    );
    if (!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();
    const c = data.candidates?.[0];
    if (!c) throw new Error("Address not found");
    const attrs = c.attributes || {};
    let county = attrs.Subregion || "";
    if (county && !/county/i.test(county)) county = `${county} County`;
    const state = resolveStateCodeFromPhoton(attrs.Region || "");
    const loc = c.location || {};
    return {
      state,
      county,
      city: attrs.City || "",
      zip: attrs.Postal || "",
      display: c.address || address,
      latitude: loc.y,
      longitude: loc.x,
    };
  }

  async function geocodeAddress(address, magicKey) {
    if (API_BASE !== null) {
      try {
        const q = new URLSearchParams({ address });
        if (magicKey) q.set("magicKey", magicKey);
        const res = await fetch(apiUrl(`api/geocode?${q}`));
        if (res.ok) return await res.json();
      } catch {
        /* client fallback */
      }
    }

    try {
      return await geocodeWithEsri(address, magicKey);
    } catch {
      /* continue */
    }

    try {
      const loc = await geocodeWithPhoton(address);
      if (loc.state) {
        if (!loc.county) {
          const census = await geocodeWithCensus(address);
          if (census) return { ...loc, county: census.county || loc.county };
        }
        return loc;
      }
    } catch {
      /* continue */
    }

    return geocodeWithCensus(address);
  }

  function suggestBias(query) {
    const q = query.toUpperCase();
    if (/\bNC\b|NORTH CAROLINA/.test(q)) return { lon: -78.6382, lat: 35.7796, dist: 150000 };
    if (/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/.test(q)) {
      return { lon: -98.5, lat: 39.8, dist: 2500000 };
    }
    return { lon: -78.6382, lat: 35.7796, dist: 200000 };
  }

  async function fetchEsriSuggestions(query) {
    const { lon, lat, dist } = suggestBias(query);
    const params = new URLSearchParams({
      text: query,
      countryCode: "USA",
      maxSuggestions: "15",
      f: "json",
      location: `${lon},${lat}`,
      distance: String(dist),
      category: "Address",
    });
    const res = await fetch(
      `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?${params}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set();
    return (data.suggestions || [])
      .filter((s) => {
        if (!s.text || s.isCollection || seen.has(s.text)) return false;
        seen.add(s.text);
        return true;
      })
      .map((s) => ({
        label: s.text,
        magicKey: s.magicKey || "",
        location: { display: s.text },
      }));
  }

  function mergeSuggestionLists(lists) {
    const seen = new Set();
    const merged = [];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const label = (item?.label || item?.text || "").trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        merged.push({
          label,
          magicKey: item.magicKey || "",
          location: item.location || { display: label },
        });
      }
    }
    return merged.slice(0, 15);
  }

  async function fetchAddressSuggestions(query) {
    const q = (query || "").trim();
    if (!q.length) return [];

    const tasks = [fetchEsriSuggestions(q).catch(() => [])];
    if (API_BASE !== null) {
      tasks.push(
        fetch(apiUrl(`api/suggest?q=${encodeURIComponent(q)}`))
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => [])
      );
    }

    const lists = await Promise.all(tasks);
    return mergeSuggestionLists(lists);
  }

  function showSuggestionsLoading() {
    if (!els.addressSuggestions) return;
    els.addressSuggestions.innerHTML =
      '<li class="address-suggestions-loading" role="presentation">Searching addresses…</li>';
    els.addressSuggestions.classList.remove("hidden");
    els.propertyAddress?.setAttribute("aria-expanded", "true");
  }

  async function loadAddressSuggestions(query) {
    const q = (query || "").trim();
    if (!q.length) {
      hideSuggestions();
      return;
    }
    const requestId = ++suggestRequestId;
    showSuggestionsLoading();
    let items = [];
    try {
      items = await fetchAddressSuggestions(q);
    } catch {
      items = [];
    }
    if (requestId !== suggestRequestId) return;
    showSuggestions(items);
  }

  function hideSuggestions() {
    if (!els.addressSuggestions) return;
    els.addressSuggestions.classList.add("hidden");
    els.addressSuggestions.innerHTML = "";
    els.propertyAddress?.setAttribute("aria-expanded", "false");
    activeSuggestion = -1;
    lastSuggestions = [];
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showSuggestions(items) {
    if (!els.addressSuggestions) return;
    const list = Array.isArray(items) ? items : [];
    lastSuggestions = list;
    if (!list.length) {
      els.addressSuggestions.innerHTML =
        '<li class="address-suggestions-empty" role="presentation">No matches — keep typing or use Look up this address</li>';
      els.addressSuggestions.classList.remove("hidden");
      els.propertyAddress?.setAttribute("aria-expanded", "true");
      return;
    }
    els.addressSuggestions.innerHTML = list
      .map(
        (item, i) =>
          `<li role="option" data-index="${i}" tabindex="-1">${escapeHtml(item.label || item.text || "")}</li>`
      )
      .join("");
    els.addressSuggestions.classList.remove("hidden");
    els.propertyAddress?.setAttribute("aria-expanded", "true");
    activeSuggestion = -1;

    els.addressSuggestions.querySelectorAll("li[role='option']").forEach((li) => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectSuggestion(list[Number(li.dataset.index)]);
      });
    });
  }

  function rememberAddressSelection(address, magicKey) {
    lastSelectedAddress = address || "";
    lastAddressMagicKey = magicKey || "";
  }

  function resolveMagicKey(address, magicKey) {
    if (magicKey) return magicKey;
    if (address && address === lastSelectedAddress) return lastAddressMagicKey;
    return "";
  }

  async function onAddressPicked(item) {
    if (!item?.label || addressPickInFlight) return;
    if (!els.propertyAddress) cacheElements();
    addressPickInFlight = true;
    try {
      els.propertyAddress.value = item.label || "";
      rememberAddressSelection(item.label, item.magicKey || "");
      window.MMG_addressAutocomplete?.hide?.();
      hideSuggestions();
      if (document.body.classList.contains("wizard-social")) {
        document.dispatchEvent(new CustomEvent("mmg-wizard-advance-after-address"));
      }
      await resolvePropertyAndApply(
        item.label,
        item.location,
        item.magicKey || "",
        true
      );
    } catch (err) {
      console.error("Address pick failed:", err);
      setLocationNote(
        "Could not load property data. Try “Look up this address” or enter details manually.",
        "error"
      );
    } finally {
      addressPickInFlight = false;
    }
  }

  async function selectSuggestion(item) {
    await onAddressPicked(item);
  }

  function looksLikeFullAddress(text) {
    return (
      text.length >= 12 &&
      (/\d{5}(-\d{4})?/.test(text) || /,\s*[A-Z]{2}\b/i.test(text))
    );
  }

  async function resolvePropertyAndApply(address, knownLocation, magicKey, updatePrice = false) {
    if (lookupInFlight) {
      pendingPropertyLookup = { address, knownLocation, magicKey, updatePrice };
      return;
    }
    lookupInFlight = true;
    pendingPropertyLookup = null;
    if (!els.lookupAddress) cacheElements();
    if (els.lookupAddress) {
      els.lookupAddress.disabled = true;
      els.lookupAddress.textContent = "Looking up property…";
    }
    setLocationNote(
      updatePrice
        ? "Looking up list price or estimated value, taxes, and insurance…"
        : "Pulling tax and insurance estimates for this address…",
      ""
    );

    try {
      const data = await fetchPropertyData(
        address,
        knownLocation,
        resolveMagicKey(address, magicKey || knownLocation?.magicKey || ""),
        updatePrice
      );
      data.updatePriceRequested = updatePrice;
      applyPropertyData(data);
    } catch (err) {
      setLocationNote(
        err.message === "Address not found"
          ? "We couldn't find that address. Include street, city, state, and ZIP."
          : "Lookup failed. Use the suggestions while typing, or enter tax and insurance manually.",
        "error"
      );
    } finally {
      lookupInFlight = false;
      if (els.lookupAddress) {
        els.lookupAddress.disabled = false;
        els.lookupAddress.textContent = "Look up this address";
      }
      const pending = pendingPropertyLookup;
      pendingPropertyLookup = null;
      if (pending) {
        await resolvePropertyAndApply(
          pending.address,
          pending.knownLocation,
          pending.magicKey,
          pending.updatePrice
        );
      }
    }
  }

  async function lookupFromAddress() {
    const address = els.propertyAddress?.value.trim();
    if (!address) {
      setLocationNote("Enter a property address to estimate taxes and insurance.", "error");
      return;
    }
    await resolvePropertyAndApply(
      address,
      null,
      resolveMagicKey(address, ""),
      true
    );
  }

  function scheduleAutoLookup() {
    clearTimeout(lookupTimer);
    const address = els.propertyAddress?.value.trim() || "";
    if (!looksLikeFullAddress(address)) return;
    if (
      els.addressSuggestions &&
      !els.addressSuggestions.classList.contains("hidden") &&
      lastSuggestions.length > 0
    ) {
      return;
    }
    lookupTimer = setTimeout(() => lookupFromAddress(), 1200);
  }

  function recalcTaxFromAddressIfNeeded() {
    if (!lastGeocode || taxManualOverride) return;
    const homePrice = Number(els.homePrice?.value || 0);
    const taxRate = getTaxRate(lastGeocode.state, lastGeocode.county);
    if (els.propertyTax) {
      els.propertyTax.value = formatCurrencyInput(Math.round(homePrice * (taxRate / 100)));
    }
    refreshInsuranceFromCredit();
  }

  function calculate() {
    if (!els.pitiPayment) return;

    const homePrice = Number(els.homePrice?.value || 0);
    const downPct = Number(els.downPercent?.value || 0);
    const downPayment = Math.round((homePrice * downPct) / 100);
    const loanPrincipal = Math.max(0, homePrice - downPayment);
    const rate = Number(els.interestRate?.value) || 0;
    const years = Number(els.loanTerm?.value) || 30;
    const annualTax = parseCurrency(els.propertyTax?.value);
    const annualInsurance = parseCurrency(els.homeInsurance?.value);
    const monthlyHoa = parseCurrency(els.hoa?.value);
    const pmiAnnualRate = Number(els.pmiRate?.value) || 0;

    const { rows, totalInterest, payment: pi } = buildAmortSchedule(
      loanPrincipal,
      rate,
      years
    );

    const monthlyTax = annualTax / 12;
    const monthlyInsurance = annualInsurance / 12;
    const program = getLoanProgram();
    const needsPmi = programNeedsMonthlyMi(program, downPct) && loanPrincipal > 0;
    const monthlyPmi = needsPmi ? (loanPrincipal * (pmiAnnualRate / 100)) / 12 : 0;
    const piti = pi + monthlyTax + monthlyInsurance;
    const totalMonthly = piti + monthlyPmi + monthlyHoa;
    const hasExtras = monthlyPmi > 0 || monthlyHoa > 0;

    els.pitiPayment.textContent = formatCurrency(piti);
    if (els.totalPayment) els.totalPayment.textContent = formatCurrency(totalMonthly);
    if (els.piPayment) els.piPayment.textContent = formatCurrency(pi);
    if (els.taxPayment) els.taxPayment.textContent = formatCurrency(monthlyTax);
    if (els.insurancePayment) els.insurancePayment.textContent = formatCurrency(monthlyInsurance);
    if (els.pmiPayment) els.pmiPayment.textContent = formatCurrency(monthlyPmi);
    if (els.hoaPayment) els.hoaPayment.textContent = formatCurrency(monthlyHoa);
    if (els.loanAmount) els.loanAmount.textContent = formatCurrency(loanPrincipal);
    if (els.totalInterest) els.totalInterest.textContent = formatCurrency(totalInterest);

    if (els.payoffDate) {
      const payoff = new Date();
      payoff.setMonth(payoff.getMonth() + years * 12);
      els.payoffDate.textContent = payoff.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }

    if (els.pmiRow) els.pmiRow.classList.toggle("hidden", !needsPmi);
    if (els.pmiRowLabel && needsPmi) {
      els.pmiRowLabel.textContent = program.miLabel || "Mortgage insurance";
    }
    if (els.hoaRow) els.hoaRow.classList.toggle("hidden", monthlyHoa <= 0);
    if (els.pmiField) els.pmiField.style.opacity = needsPmi ? "1" : "0.5";
    if (els.pmiNote) {
      els.pmiNote.classList.toggle("hidden", !needsPmi);
      if (needsPmi && program.miLabel) {
        els.pmiNote.textContent = `Includes estimated monthly ${program.miLabel} for this program.`;
      }
    }
    if (els.downPmiHint) {
      const showDownHint = program.id === "conventional" && downPct < 20;
      els.downPmiHint.classList.toggle("hidden", !showDownHint);
    }
    const rateInfo = updateDiscountPointsAndApr();
    const vsSavings = updateVsCompetitionPanel(
      loanPrincipal,
      rate,
      years,
      monthlyTax,
      monthlyInsurance,
      monthlyPmi
    );

    if (document.body.classList.contains("logan4") && vsSavings) {
      document.dispatchEvent(
        new CustomEvent("mmg-logan4-results", {
          detail: {
            ...vsSavings,
            homePrice,
            downPct,
            downPayment,
            rate,
            piti,
            pi,
            totalInterest,
          },
        })
      );
    }

    if (document.body.classList.contains("logan5")) {
      document.dispatchEvent(
        new CustomEvent("mmg-logan5-calculated", {
          detail: {
            homePrice,
            downPct,
            downPayment,
            loanPrincipal,
            rate,
            years,
            piti,
            pi,
            totalMonthly,
            monthlyTax,
            monthlyInsurance,
            monthlyPmi,
            monthlyHoa,
            totalInterest,
            program: program.id,
            profile: getBuyerProfile(),
            vsSavings,
          },
        })
      );
    }

    if (els.totalWithExtras) {
      els.totalWithExtras.classList.toggle("hidden", !hasExtras);
    }
    if (els.extrasNote && hasExtras) {
      els.extrasNote.textContent = needsPmi
        ? "Includes estimated mortgage insurance (PMI)" + (monthlyHoa > 0 ? " and HOA" : "")
        : "Includes HOA";
      els.extrasNote.classList.remove("hidden");
    }

    if (els.amortSection) {
      const showAmort = loanPrincipal > 0 && rate > 0;
      els.amortSection.classList.toggle("hidden", !showAmort);
      els.amortSection.setAttribute("aria-hidden", showAmort ? "false" : "true");
    }

    const pointsCost = rateInfo?.pointsCost ?? 0;
    updateOfficialQuotePanel(
      homePrice,
      downPayment,
      loanPrincipal,
      annualTax,
      annualInsurance,
      pointsCost
    );

    const cashCompare = estimateTypicalLenderCashToClose(
      loanPrincipal,
      downPayment,
      annualTax,
      annualInsurance,
      pointsCost
    );
    updateLeadSavingsRibbon(
      vsSavings?.monthlyPitiSave ?? 0,
      vsSavings?.typical != null && vsSavings?.martiniRate != null
        ? vsSavings.typical - vsSavings.martiniRate
        : 0,
      cashCompare.savings
    );

    renderAmortTable(rows);
    document.dispatchEvent(new CustomEvent("mmg-calculated"));
  }

  function updateOfficialQuotePanel(
    homePrice,
    downPayment,
    loanPrincipal,
    annualTax,
    annualInsurance,
    pointsCost
  ) {
    if (!els.quoteCashToClose) return;

    if (homePrice <= 0 || loanPrincipal <= 0) {
      if (els.quoteDownPayment) els.quoteDownPayment.textContent = "—";
      if (els.quoteClosingCosts) els.quoteClosingCosts.textContent = "—";
      if (els.quotePrepaids) els.quotePrepaids.textContent = "—";
      if (els.quoteCashToClose) els.quoteCashToClose.textContent = "—";
      if (els.quoteScenarioSummary) {
        els.quoteScenarioSummary.textContent =
          "Enter purchase price and loan details above to see a ballpark.";
      }
      return;
    }

    const lenderBase = window.MMG_MARKET?.aprFinanceCharge ?? 2500;
    const closingCosts = Math.round(loanPrincipal * 0.02 + lenderBase);
    const prepaids = Math.round(
      (annualTax / 12) * 3 + (annualInsurance / 12) * 14
    );
    const extraPoints = Math.max(0, Number(pointsCost) || 0);

    if (els.quotePointsRow && els.quotePointsCost) {
      const showPts = extraPoints > 0;
      els.quotePointsRow.classList.toggle("hidden", !showPts);
      if (showPts) {
        els.quotePointsCost.textContent = formatCurrency(extraPoints);
      }
    }

    const cashToClose = downPayment + closingCosts + prepaids + extraPoints;

    if (els.quoteDownPayment) {
      els.quoteDownPayment.textContent = formatCurrency(downPayment);
    }
    if (els.quoteClosingCosts) {
      els.quoteClosingCosts.textContent = formatCurrency(closingCosts);
    }
    if (els.quotePrepaids) {
      els.quotePrepaids.textContent = formatCurrency(prepaids);
    }
    if (els.quoteCashToClose) {
      els.quoteCashToClose.textContent = formatCurrency(cashToClose);
    }
    if (els.quoteScenarioSummary) {
      const program = getLoanProgram();
      els.quoteScenarioSummary.textContent = `${formatCurrency(homePrice)} purchase · ${program.shortLabel || program.id} · ${formatCurrency(loanPrincipal)} loan (estimate).`;
    }
  }

  function renderAmortTable(rows) {
    if (!els.amortBody) return;
    const displayRows = showFullAmort ? rows : rows.slice(0, AMORT_PREVIEW);
    els.amortBody.innerHTML = displayRows
      .map(
        (r) => `<tr>
        <td>${r.month}</td>
        <td>${formatCurrency(r.payment)}</td>
        <td>${formatCurrency(r.principal)}</td>
        <td>${formatCurrency(r.interest)}</td>
        <td>${formatCurrency(r.balance)}</td>
      </tr>`
      )
      .join("");

    if (els.toggleAmort) {
      els.toggleAmort.textContent =
        showFullAmort && rows.length > AMORT_PREVIEW
          ? "Show first 12 months"
          : rows.length > AMORT_PREVIEW
            ? `Show full schedule (${rows.length} payments)`
            : "";
      els.toggleAmort.style.display = rows.length > AMORT_PREVIEW ? "inline-block" : "none";
    }
  }

  function bindCurrencyInput(el, onManual) {
    if (!el) return;
    el.addEventListener("input", () => {
      onManual?.();
      calculate();
    });
    el.addEventListener("blur", () => {
      el.value = formatCurrencyInput(parseCurrency(el.value));
      calculate();
    });
  }

  function bindAddressAutocomplete() {
    const input = els.propertyAddress;
    const list = els.addressSuggestions;
    if (!input || !list) return;

    let acDebounce = null;
    let acRequestId = 0;
    let acActiveIndex = -1;
    let acLastItems = [];
    let acPortaled = false;

    function portalList() {
      if (!acPortaled) {
        document.body.appendChild(list);
        acPortaled = true;
      }
    }

    function positionList() {
      portalList();
      const r = input.getBoundingClientRect();
      list.style.position = "fixed";
      list.style.top = `${r.bottom + 4}px`;
      list.style.left = `${r.left}px`;
      list.style.width = `${Math.max(r.width, 300)}px`;
      list.style.zIndex = "99999";
      list.style.display = "block";
    }

    function showAcOpen() {
      list.classList.remove("hidden");
      input.setAttribute("aria-expanded", "true");
      positionList();
    }

    function hideAcList() {
      list.classList.add("hidden");
      list.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      acActiveIndex = -1;
      acLastItems = [];
    }

    function showAcLoading() {
      list.innerHTML =
        '<li class="address-suggestions-loading" role="presentation">Searching addresses…</li>';
      showAcOpen();
    }

    async function runAcSearch(q) {
      const query = q.trim();
      if (!query.length) {
        hideAcList();
        return;
      }
      const id = ++acRequestId;
      showAcLoading();
      let items = [];
      try {
        items = await fetchAddressSuggestions(query);
      } catch {
        items = [];
      }
      if (id !== acRequestId) return;
      acLastItems = items;
      if (!items.length) {
        list.innerHTML =
          '<li class="address-suggestions-empty" role="presentation">No matches — keep typing</li>';
        showAcOpen();
        return;
      }
      list.innerHTML = items
        .map(
          (item, i) =>
            `<li role="option" data-index="${i}" tabindex="-1">${escapeHtml(item.label || "")}</li>`
        )
        .join("");
      showAcOpen();
      list.querySelectorAll("li[role='option']").forEach((li) => {
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          onAddressPicked(items[Number(li.dataset.index)]);
        });
      });
    }

    function scheduleAcSearch() {
      const q = input.value;
      clearTimeout(acDebounce);
      if (!q.trim().length) {
        hideAcList();
        return;
      }
      showAcLoading();
      acDebounce = setTimeout(() => runAcSearch(q), 60);
    }

    input.addEventListener("input", () => {
      clearTimeout(lookupTimer);
      if (input.value.trim() !== lastSelectedAddress) {
        lastAddressMagicKey = "";
        setHomePriceAutoFilled(false);
      }
      scheduleAcSearch();
    });

    input.addEventListener("focus", () => {
      if (input.value.trim().length) scheduleAcSearch();
    });

    input.addEventListener("keydown", (e) => {
      const options = list.querySelectorAll("li[role='option']");
      if (e.key === "ArrowDown" && options.length) {
        e.preventDefault();
        acActiveIndex = Math.min(acActiveIndex + 1, options.length - 1);
        options.forEach((li, i) => li.classList.toggle("active", i === acActiveIndex));
        return;
      }
      if (e.key === "ArrowUp" && options.length) {
        e.preventDefault();
        acActiveIndex = Math.max(acActiveIndex - 1, 0);
        options.forEach((li, i) => li.classList.toggle("active", i === acActiveIndex));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (acActiveIndex >= 0 && acLastItems[acActiveIndex]) {
          onAddressPicked(acLastItems[acActiveIndex]);
        } else {
          hideAcList();
          lookupFromAddress();
        }
      }
      if (e.key === "Escape") hideAcList();
    });

    document.addEventListener("mousedown", (e) => {
      if (
        !e.target.closest("#propertyAddress") &&
        !e.target.closest("#addressSuggestions")
      ) {
        hideAcList();
      }
    });

    window.addEventListener(
      "scroll",
      () => {
        if (!list.classList.contains("hidden")) positionList();
      },
      true
    );
    window.addEventListener("resize", () => {
      if (!list.classList.contains("hidden")) positionList();
    });

    window.MMG_addressAutocomplete = { hide: hideAcList };
  }

  function bindEvents() {
    els.lookupAddress?.addEventListener("click", lookupFromAddress);

    els.loanProgram?.addEventListener("change", () => {
      snapDownToProgramDefault();
      applyLoanProgramUi();
      rateManualOverride = false;
      refreshMarketRateIfActive();
      calculate();
      document.dispatchEvent(new CustomEvent("mmg-program-change"));
    });

    els.toggleFeeSheet?.addEventListener("click", () => {
      const panel = els.feeSheetPanel;
      if (!panel) return;
      const wasHidden = panel.classList.contains("hidden");
      panel.classList.toggle("hidden");
      els.toggleFeeSheet.setAttribute("aria-expanded", wasHidden ? "true" : "false");
      els.toggleFeeSheet.textContent = wasHidden
        ? "Hide estimated APR"
        : "View estimated APR";
    });

    els.creditScore?.addEventListener("input", () => {
      updateCreditUI();
      refreshMarketRateIfActive();
      calculate();
    });

    els.interestRate?.addEventListener("input", () => {
      rateManualOverride = true;
      marketRateActive = true;
      let r = roundRateToEighth(Number(els.interestRate.value));
      if (!Number.isFinite(r) || r <= 0) {
        r =
          martiniOfferRate ??
          (Number(els.interestRate.value) || DEFAULT_MARTINI_OFFER_RATE);
      }
      els.interestRate.value = window.MMG_formatRate ? window.MMG_formatRate(r) : r;
      updateDiscountPointsAndApr();
      calculate();
    });

    els.interestRate?.addEventListener("change", () => {
      let r = roundRateToEighth(Number(els.interestRate.value));
      if (!Number.isFinite(r) || r <= 0) {
        rateManualOverride = false;
        applyMartiniRate();
        return;
      }
      rateManualOverride = true;
      els.interestRate.value = window.MMG_formatRate ? window.MMG_formatRate(r) : r;
      updateDiscountPointsAndApr();
      calculate();
    });

    els.interestRate?.addEventListener("blur", () => {
      let r = roundRateToEighth(Number(els.interestRate.value));
      if (!Number.isFinite(r) || r <= 0) {
        rateManualOverride = false;
        applyMartiniRate();
        return;
      }
      rateManualOverride = true;
      els.interestRate.value = window.MMG_formatRate ? window.MMG_formatRate(r) : r;
      updateDiscountPointsAndApr();
      calculate();
    });

    els.homePrice?.addEventListener("input", () => {
      const price = Number(els.homePrice.value);
      clearHomePriceAutoFilledIfChanged(price);
      if (els.homePriceInput) {
        els.homePriceInput.value = formatCurrencyInput(price);
      }
      if (els.homePriceDisplay) {
        els.homePriceDisplay.textContent = formatCurrency(price);
      }
      syncDownFromPercent();
      recalcTaxFromAddressIfNeeded();
      calculate();
      document.dispatchEvent(new CustomEvent("mmg-program-change"));
    });

    els.homePriceInput?.addEventListener("input", () => {
      const v = parseCurrency(els.homePriceInput.value);
      const clamped = Math.min(3000000, Math.max(50000, v || 50000));
      clearHomePriceAutoFilledIfChanged(clamped);
      els.homePrice.value = clamped;
      if (els.homePriceDisplay) els.homePriceDisplay.textContent = formatCurrency(clamped);
      if (els.homePriceInput) els.homePriceInput.value = formatCurrencyInput(clamped);
      syncDownFromPercent();
      recalcTaxFromAddressIfNeeded();
      calculate();
      document.dispatchEvent(new CustomEvent("mmg-program-change"));
    });

    els.downPercent?.addEventListener("input", () => {
      const pct = roundDownPct(els.downPercent.value);
      if (els.downPercent) els.downPercent.value = String(pct);
      if (els.downPercentInput) els.downPercentInput.value = pct;
      syncDownFromPercent();
      refreshMarketRateIfActive();
      calculate();
    });

    els.downPercentInput?.addEventListener("input", () => {
      const pct = roundDownPct(Math.min(50, Math.max(0, Number(els.downPercentInput.value) || 0)));
      els.downPercent.value = String(pct);
      els.downPercentInput.value = pct;
      syncDownFromPercent();
      refreshMarketRateIfActive();
      calculate();
    });

    bindCurrencyInput(els.downAmountInput, () => {
      syncDownFromAmount();
    });

    els.loanTerm?.addEventListener("change", () => {
      rateManualOverride = false;
      refreshMarketRateIfActive();
      calculate();
    });
    els.pmiRate?.addEventListener("input", calculate);

    bindCurrencyInput(els.propertyTax, () => {
      taxManualOverride = true;
    });
    bindCurrencyInput(els.homeInsurance, () => {
      insuranceManualOverride = true;
    });
    bindCurrencyInput(els.hoa);

    els.toggleAmort?.addEventListener("click", () => {
      showFullAmort = !showFullAmort;
      calculate();
    });
  }

  function cacheElements() {
    const ids = [
      "propertyAddress", "addressSuggestions", "lookupAddress", "locationNote",
      "creditScore", "creditScoreDisplay", "creditBandLabel", "creditRateNote",
      "homePrice", "homePriceInput", "homePriceDisplay", "homePriceHint", "homePriceField",
      "downPercent",
      "downPercentInput", "downAmountInput", "downDisplay", "interestRate",
      "loanTerm", "propertyTax", "homeInsurance", "hoa", "pmiRate", "pmiField",
      "pitiPayment", "totalPayment", "totalWithExtras", "extrasNote",
      "piPayment", "taxPayment", "insurancePayment", "pmiPayment", "pmiRow",
      "hoaPayment", "hoaRow", "pmiRowLabel", "loanAmount", "totalInterest", "payoffDate",
      "amortSection", "amortBody", "toggleAmort", "pmiNote", "downPmiHint",
      "loanProgram", "loanProgramNote", "programDownHint",
      "marketRateDisplay", "marketRateUpdated", "rateAprDisclaimer",
      "toggleFeeSheet", "feeSheetPanel", "feeSheetParNoteRate", "feeSheetNoteRate",
      "feeSheetMartiniApr", "feeSheetMarketApr", "feeSheetProgramNote", "pmiRateLabel",
      "rateSavingsChip", "rateDailyBadge",
      "vsCompetition", "vsTypicalRate", "vsMartiniRate", "vsTypicalPi", "vsMartiniPi",
      "vsMonthlyPiSave", "vsMonthlyPitiSave", "vsLifetimeInterestSave",
      "vsPointsRow", "vsPointsCost", "vsCompNote",
      "discountPointsPanel", "discountPointsDetail", "feeSheetPointsRow", "feeSheetPointsCost",
      "quoteDownPayment", "quoteClosingCosts", "quotePrepaids", "quotePointsRow",
      "quotePointsCost", "quoteCashToClose", "quoteScenarioSummary",
      "heroLiveRate", "marketPulseText",
      "leadSavingsRibbon", "leadSavingsAmount",
      "leadMonthlySavingsRow",
      "leadCashSavingsRow", "leadCashSavingsAmount", "leadCashSavingsNote",
    ];
    for (const id of ids) {
      els[id] = $(id);
    }
  }

  window.MMG_applyLoanProgramUi = applyLoanProgramUi;
  window.MMG_snapDownToProgram = snapDownToProgramDefault;
  window.MMG_getCountyKey = getCountyKey;

  async function init() {
    try {
      fixAssetUrls();
      wireSocialMeta();
      wireTeamBranding();
      wireApplyLinks();
      wirePhoneLinks();
      wireSecondaryCtas();
      initPartnerShare();
      initStickyCta();
      cacheElements();
      window.MMG_onAddressPick = onAddressPicked;
      window.MMG_lookupAddress = lookupFromAddress;

      if (!els.pitiPayment) {
        console.error("Mortgage calculator: required elements missing.");
        return;
      }

      // Paint payment estimates immediately so the results panel is never stuck at $0.
      syncDownFromPercent();
      calculate();

      bindEvents();
      try {
        bindAddressAutocomplete();
      } catch (err) {
        console.error("Address autocomplete failed:", err);
      }

      invalidatePmmsCacheIfNewDay();
      cachedPmms = getPmmsFallback();
      applyLoanProgramUi();
      updateCreditUI();
      applyBaselineRatesImmediate();

      try {
        await applyMartiniRate();
      } catch {
        applyBaselineRatesImmediate();
      }

      scheduleDailyRateRefresh();
      calculate();

      if (window.location.protocol === "file:") {
        setLocationNote(
          "Open with server: run python3 server.py in the mortgage-calculator folder, then visit http://127.0.0.1:8765 — required for address search and property values.",
          "warn"
        );
      } else if (API_BASE === null) {
        setLocationNote(
          "Address search needs http://127.0.0.1:8765 (run python3 server.py). You can still enter purchase price manually.",
          "warn"
        );
      }
    } catch (err) {
      console.error("Calculator init failed:", err);
      setLocationNote(
        "Calculator had trouble starting. Hard refresh the page (Cmd+Shift+R) or run via python3 server.py.",
        "error"
      );
    }
  }

  window.MMG_onAddressPick = onAddressPicked;
  window.MMG_lookupAddress = lookupFromAddress;
  window.MMG_calculate = calculate;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();