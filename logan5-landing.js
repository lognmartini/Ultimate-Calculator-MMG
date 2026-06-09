/**
 * Logan5 Ultimate Landing Page — rate ticker, donut, buying power, compare, share, A/B.
 * Educational estimates only — not a Loan Estimate (Reg Z / RESPA).
 */
(function () {
  "use strict";

  if (!document.body.classList.contains("logan5")) return;

  const DONUT_COLORS = {
    pi: "#c9a227",
    tax: "#6366f1",
    ins: "#38bdf8",
    mi: "#f97316",
    hoa: "#a78bfa",
  };

  const CREDIT_TIERS = [
    { id: "excellent", label: "Excellent", sub: "760+", score: 760 },
    { id: "good", label: "Good", sub: "700–759", score: 720 },
    { id: "fair", label: "Fair", sub: "620–699", score: 660 },
  ];

  const HERO_VARIANTS = {
    payment: {
      title: "What's your monthly payment on this home?",
      lead: "Conventional, FHA, VA & USDA — see your number in about 30 seconds.",
    },
    afford: {
      title: "What home fits your monthly budget?",
      lead: "Start from a price or work backward from the payment you want — about 30 seconds.",
    },
  };

  let lastCalc = null;
  let pmmsMeta = { asOf: "", cacheDate: "" };
  let shareSyncTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function formatCurrency(n) {
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function formatRate(n) {
    if (!Number.isFinite(n)) return "—";
    return `${Number(n).toFixed(3).replace(/\.?0+$/, "")}%`;
  }

  function parseCurrency(raw) {
    const n = Number(String(raw || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function getCountyKey() {
    return window.MMG_getCountyKey?.() || window.MMG_LOAN_LIMITS?.defaultCounty || "wake";
  }

  function monthlyPi(principal, annualRate, years) {
    if (principal <= 0 || annualRate <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = years * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  /* ── Analytics / A/B (item 20) ── */
  window.MMG_logan5_track = function (event, data) {
    const entry = { event, data: data || {}, ts: Date.now() };
    try {
      const key = "mmg_logan5_events";
      const arr = JSON.parse(sessionStorage.getItem(key) || "[]");
      arr.push(entry);
      sessionStorage.setItem(key, JSON.stringify(arr.slice(-50)));
    } catch {
      /* ignore */
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: `logan5_${event}`, ...data });
    }
    document.body.dataset.lastLogan5Event = event;
  };

  function initAbHero() {
    const params = new URLSearchParams(window.location.search);
    let variant = params.get("hero") || params.get("ab");
    if (variant !== "payment" && variant !== "afford") {
      try {
        variant = sessionStorage.getItem("mmg_ab_hero");
        if (variant !== "payment" && variant !== "afford") {
          variant = Math.random() < 0.5 ? "payment" : "afford";
          sessionStorage.setItem("mmg_ab_hero", variant);
        }
      } catch {
        variant = "payment";
      }
    } else {
      try {
        sessionStorage.setItem("mmg_ab_hero", variant);
      } catch {
        /* ignore */
      }
    }
    const cfg = HERO_VARIANTS[variant] || HERO_VARIANTS.payment;
    const h1 = $("logan5HeroHeadline");
    const lead = $("logan5HeroLead");
    if (h1) {
      h1.textContent = cfg.title;
      h1.dataset.abVariant = variant;
    }
    if (lead) lead.textContent = cfg.lead;
    document.body.dataset.abHero = variant;
    window.MMG_logan5_track("ab_hero_view", { variant });
  }

  /* ── Rate ticker + countdown (items 1, 5) ── */
  function nextRateRefreshEt() {
    const now = new Date();
    const et = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
    const target = new Date(et);
    target.setDate(target.getDate() + (et.getHours() >= 6 ? 1 : 0));
    target.setHours(6, 0, 0, 0);
    if (et.getHours() >= 6 && et.getMinutes() > 0) {
      /* already past 6 AM today */
    } else if (et.getHours() < 6) {
      target.setDate(et.getDate());
      target.setHours(6, 0, 0, 0);
    }
    const diff = target.getTime() - et.getTime();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return { label: `Next refresh ${hrs}h ${mins}m (6 AM ET)`, target };
  }

  function updateRateTicker() {
    const marketEl = $("rateTickerMarket");
    const martiniEl = $("rateTickerMartini");
    const asOfEl = $("rateTickerAsOf");
    const countdownEl = $("rateTickerCountdown");
    if (!marketEl || !martiniEl) return;

    const market =
      $("vsTypicalRate")?.textContent ||
      $("marketRateDisplay")?.textContent ||
      "—";
    const martini =
      $("vsMartiniRate")?.textContent ||
      ($("interestRate")?.value ? `${$("interestRate").value}%` : "—");
    const program = $("loanProgram")?.value || "conventional";
    const progLabel =
      program === "conventional" && window.MMG_isJumboConventional
        ? (() => {
            const price = Number($("homePrice")?.value || 0);
            const down = Number($("downPercent")?.value || 0);
            if (window.MMG_isJumboConventional(price, down, getCountyKey())) {
              return "High-balance conv";
            }
            return "Conventional";
          })()
        : (window.MMG_getLoanProgram?.(program)?.shortLabel || program);

    marketEl.textContent = market;
    martiniEl.textContent = martini;
    if (asOfEl) {
      const note = $("marketRateUpdated")?.textContent?.trim();
      asOfEl.textContent = note || pmmsMeta.asOf || "Daily PMMS estimate";
    }
    if (countdownEl) {
      countdownEl.textContent = nextRateRefreshEt().label;
    }
    const bar = $("ultimateRateTickerBar");
    if (bar) bar.dataset.program = progLabel;
  }

  function tickCountdown() {
    const countdownEl = $("rateTickerCountdown");
    if (countdownEl) countdownEl.textContent = nextRateRefreshEt().label;
  }

  /* ── County limit badge (item 4) ── */
  function updateLimitBadge() {
    const badge = $("ultimateLimitBadge");
    if (!badge) return;
    const price = Number($("homePrice")?.value || 0);
    const down = Number($("downPercent")?.value || 0);
    const countyKey = getCountyKey();
    const county =
      window.MMG_LOAN_LIMITS?.counties?.[countyKey]?.name || "Your county";
    if (price < 50000) {
      badge.classList.add("hidden");
      badge.innerHTML = "";
      return;
    }
    const conforming = window.MMG_getConformingLimit?.(countyKey) || 832750;
    const fhaLimit = window.MMG_getFhaLimit?.(countyKey) || 541287;
    const loan = window.MMG_loanAmount?.(price, down) ?? price * (1 - down / 100);
    const chips = [];

    chips.push(
      `<span class="ultimate-limit-chip ultimate-limit-chip-limit">${county} · Conforming ${formatCurrency(conforming)}</span>`
    );
    chips.push(
      `<span class="ultimate-limit-chip ultimate-limit-chip-limit">FHA limit ${formatCurrency(fhaLimit)}</span>`
    );

    if (window.MMG_isJumboConventional?.(price, down, countyKey)) {
      const jMin = window.MMG_getJumboMinDownPercent?.(price, countyKey) ?? 10.1;
      chips.push(
        `<span class="ultimate-limit-chip">High-balance conventional · min ${jMin}% down</span>`
      );
    } else if (window.MMG_isFhaEligible && !window.MMG_isFhaEligible(price, countyKey)) {
      chips.push(
        `<span class="ultimate-limit-chip">Above FHA limit — higher down or conventional</span>`
      );
    } else if (loan <= fhaLimit) {
      chips.push(`<span class="ultimate-limit-chip">FHA may fit this price</span>`);
    }

    badge.innerHTML = chips.join("");
    badge.classList.remove("hidden");
  }

  /* ── Credit tier picker (item 6) ── */
  function syncCreditTierUi() {
    const score = Number($("creditScore")?.value || 740);
    document.querySelectorAll(".credit-tier-btn").forEach((btn) => {
      const target = Number(btn.dataset.score || 0);
      const tier = btn.dataset.tier;
      let active = false;
      if (tier === "excellent" && score >= 760) active = true;
      if (tier === "good" && score >= 700 && score < 760) active = true;
      if (tier === "fair" && score < 700) active = true;
      btn.classList.toggle("active", active);
    });
  }

  function bindCreditTiers() {
    const picker = $("creditTierPicker");
    if (!picker) return;
    picker.innerHTML = CREDIT_TIERS.map(
      (t) =>
        `<button type="button" class="credit-tier-btn" data-tier="${t.id}" data-score="${t.score}">${t.label}<span>${t.sub}</span></button>`
    ).join("");
    picker.querySelectorAll(".credit-tier-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const el = $("creditScore");
        if (!el) return;
        el.value = btn.dataset.score;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        syncCreditTierUi();
        window.MMG_logan5_track("credit_tier", { tier: btn.dataset.tier });
      });
    });
    $("creditScore")?.addEventListener("input", syncCreditTierUi);
    syncCreditTierUi();
  }

  /* ── Buying power viz (item 3) ── */
  function updateBuyingPowerViz() {
    const viz = $("buyingPowerViz");
    const fill = $("buyingPowerRangeFill");
    const lowEl = $("buyingPowerLow");
    const highEl = $("buyingPowerHigh");
    const pinEl = $("buyingPowerPin");
    const priceEl = $("reversePriceDisplay");
    if (!viz) return;

    const mode = document.body.dataset.ultimateMode;
    const target = parseCurrency($("targetPaymentInput")?.value);
    const priceText = priceEl?.textContent?.trim();
    const price = parseCurrency(priceText);

    if (mode !== "payment" || !target || target < 200 || !price) {
      viz.classList.add("hidden");
      return;
    }

    const low = Math.round(price * 0.92);
    const high = Math.round(price * 1.08);
    if (lowEl) lowEl.textContent = formatCurrency(low);
    if (highEl) highEl.textContent = formatCurrency(high);
    if (pinEl) {
      pinEl.textContent = `Target ${formatCurrency(target)}/mo → ~${formatCurrency(price)} mid-range`;
    }
    if (fill) {
      fill.style.left = "12%";
      fill.style.right = "12%";
    }
    viz.classList.remove("hidden");
  }

  /* ── Payment donut (item 2) ── */
  function renderDonut(detail) {
    if ($("paymentBreakdownWheel")) return;
    const panel = $("ultimateDonutPanel");
    const svg = $("ultimateDonutSvg");
    const legend = $("ultimateDonutLegend");
    if (!panel || !svg || !legend || !detail) return;

    const segments = [
      { key: "pi", label: "P&I", value: detail.pi || 0 },
      { key: "tax", label: "Tax", value: detail.monthlyTax || 0 },
      { key: "ins", label: "Insurance", value: detail.monthlyInsurance || 0 },
    ];
    if ((detail.monthlyPmi || 0) > 0) {
      segments.push({ key: "mi", label: "MI", value: detail.monthlyPmi });
    }
    if ((detail.monthlyHoa || 0) > 0) {
      segments.push({ key: "hoa", label: "HOA", value: detail.monthlyHoa });
    }

    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    const r = 42;
    const cx = 55;
    const cy = 55;
    let offset = 0;
    const circles = segments
      .map((seg) => {
        const pct = seg.value / total;
        const dash = pct * 2 * Math.PI * r;
        const gap = 2 * Math.PI * r;
        const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${DONUT_COLORS[seg.key]}" stroke-width="14" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += dash;
        return circle;
      })
      .join("");

    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="14"/>${circles}`;

    legend.innerHTML = segments
      .map(
        (seg) =>
          `<li><span><span class="ultimate-donut-swatch" style="background:${DONUT_COLORS[seg.key]}"></span>${seg.label}</span><strong>${formatCurrency(seg.value)}</strong></li>`
      )
      .join("");
  }

  function bindDonutToggle() {
    if ($("paymentBreakdownWheel")) return;
    const panel = $("ultimateDonutPanel");
    const btn = $("ultimateDonutToggle");
    if (!btn || !panel) return;
    btn.addEventListener("click", () => {
      panel.classList.toggle("is-open");
      const open = panel.classList.contains("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      window.MMG_logan5_track("donut_toggle", { open });
    });
  }

  /* ── Buydown chip (item 8) — conforming loans only ── */
  function isConformingForBuydown(price, downPct, countyKey) {
    return window.MMG_isConformingLoan
      ? window.MMG_isConformingLoan(price, downPct, countyKey)
      : !window.MMG_isJumboLoan?.(price, downPct, countyKey);
  }

  function updateBuydownChip(detail) {
    const chip = $("ultimateBuydownChip");
    if (!chip || !detail) return;
    const countyKey = getCountyKey();
    const price = detail.homePrice || Number($("homePrice")?.value || 0);
    const down = detail.downPct ?? Number($("downPercent")?.value || 0);

    if (!isConformingForBuydown(price, down, countyKey)) {
      const jMin = window.MMG_getJumboMinDownPercent?.(price, countyKey) ?? 15;
      const highDown = jMin < 15 ? 15 : 20;
      const rateLow = window.MMG_getMartiniRateForProgram?.("conventional", jMin) ?? detail.rate;
      const rateHigh = window.MMG_getMartiniRateForProgram?.("conventional", highDown) ?? detail.rate;
      const loanLow = Math.max(0, price - Math.round((price * jMin) / 100));
      const loanHigh = Math.max(0, price - Math.round((price * highDown) / 100));
      const pitiLow =
        monthlyPi(loanLow, rateLow, detail.years || 30) +
        (detail.monthlyTax || 0) +
        (detail.monthlyInsurance || 0);
      const pitiHigh =
        monthlyPi(loanHigh, rateHigh, detail.years || 30) +
        (detail.monthlyTax || 0) +
        (detail.monthlyInsurance || 0);
      const limit = window.MMG_getConformingLimit?.(countyKey) || 832750;
      chip.innerHTML =
        `<span>⚖️</span><span><strong>High-balance loan</strong> — above ${formatCurrency(limit)} conforming. Compare <strong>${jMin}%</strong> (~${formatCurrency(pitiLow)}/mo) vs <strong>${highDown}%</strong> (~${formatCurrency(pitiHigh)}/mo).</span>` +
        `<span class="ultimate-buydown-chip-note">Buydowns apply to conforming loans only. Tap <strong>See other loan options</strong> for full down-payment comparisons.</span>`;
      chip.classList.remove("hidden");
      return;
    }

    const noteBump = window.MMG_MARKET?.lenderPaidBuydownNoteBump ?? 0.625;
    const y1Cut = window.MMG_MARKET?.buydown10Reduction ?? 1;
    const parRate = detail.rate;
    const noteRate = parRate + noteBump;
    const y1Rate = Math.max(0.125, noteRate - y1Cut);
    const loan = detail.loanPrincipal || 0;
    const years = detail.years || 30;
    const y1Pi = monthlyPi(loan, y1Rate, years);
    const fullPi = monthlyPi(loan, noteRate, years);
    const save = Math.max(0, fullPi - y1Pi);

    chip.innerHTML =
      `<span>🎁</span><span>Year 1 with <strong>complimentary 1-0 buydown</strong>: ~<strong>${formatCurrency(y1Pi)}/mo</strong> P&amp;I</span>` +
      `<span class="ultimate-buydown-chip-note">Conforming loan · note ~${formatRate(noteRate)} yrs 2–30 · saves ~${formatCurrency(save)}/mo year 1. Not a rate lock.</span>`;
    chip.classList.remove("hidden");
  }

  /* ── Readiness score (item 14) ── */
  function updateReadinessScore(detail) {
    const panel = $("ultimateReadinessPanel");
    if (!panel || !detail) return;

    const price = detail.homePrice || 0;
    const down = detail.downPct || 0;
    const score = Number($("creditScore")?.value || 0);
    const program = detail.program || "conventional";
    const countyKey = getCountyKey();
    const profile = detail.profile || {};
    const minDown =
      window.MMG_getEffectiveMinDown?.(program, profile, price, countyKey) ?? 0;
    const address = $("propertyAddress")?.value?.trim() || "";

    const ticks = [
      {
        id: "price",
        label: "Price set",
        done: price >= 50000,
      },
      {
        id: "credit",
        label: "Credit modeled",
        done: score >= 620,
      },
      {
        id: "down",
        label: "Down meets min",
        done: down >= minDown - 0.01,
      },
      {
        id: "program",
        label: "Program fits",
        done:
          !window.MMG_isJumboConventional?.(price, down, countyKey) ||
          program === "conventional",
      },
      {
        id: "property",
        label: address.length > 8 ? "Address added" : "Budget mapped",
        done: address.length > 8 || price >= 50000,
      },
    ];

    const doneCount = ticks.filter((t) => t.done).length;
    const scoreEl = $("ultimateReadinessScore");
    const ticksEl = $("ultimateReadinessTicks");
    if (scoreEl) scoreEl.textContent = `${doneCount}/5`;
    if (ticksEl) {
      ticksEl.innerHTML = ticks
        .map(
          (t) =>
            `<span class="ultimate-readiness-tick${t.done ? " done" : ""}">${t.label}</span>`
        )
        .join("");
    }
    panel.classList.remove("hidden");
  }

  /* ── Scenario compare (item 7) ── */
  function scenarioInputs(side) {
    const price = Number($(`scenario${side}PriceSlider`)?.value || $("homePrice")?.value || 0);
    const down = Number($(`scenario${side}DownSlider`)?.value || $("downPercent")?.value || 0);
    const program =
      $(`scenario${side}ProgramSelect`)?.value ||
      (side === "A" ? $("loanProgram")?.value : "fha") ||
      "conventional";
    const rate =
      window.MMG_getMartiniRateForProgram?.(program, down) ||
      Number($("interestRate")?.value || 0);
    const years = Number($("loanTerm")?.value || 30);
    const annualTax = parseCurrency($("propertyTax")?.value);
    const annualInsurance = parseCurrency($("homeInsurance")?.value);
    const monthlyHoa = parseCurrency($("hoa")?.value);
    const pmiRate = Number($("pmiRate")?.value || 0.5);

    const downPayment = Math.round((price * down) / 100);
    const loan = Math.max(0, price - downPayment);
    const pi = monthlyPi(loan, rate, years);
    const monthlyTax = (price * (annualTax / Math.max(price, 1))) / 12;
    const monthlyIns = (price * (annualInsurance / Math.max(price, 1))) / 12;
    const needsMi =
      program === "va"
        ? false
        : program === "conventional"
          ? down < 20
          : true;
    const monthlyMi = needsMi ? (loan * (pmiRate / 100)) / 12 : 0;
    const piti = pi + monthlyTax + monthlyIns + monthlyMi + monthlyHoa;

    return { price, down, program, rate, piti, label: side === "A" ? "Your estimate" : "Alternative" };
  }

  function updateScenarioCompare() {
    const a = scenarioInputs("A");
    const b = scenarioInputs("B");
    const aPiti = $("scenarioAPiti");
    const bPiti = $("scenarioBPiti");
    const diff = $("ultimateScenarioDiffBanner");
    const colA = $("ultimateScenarioColA");
    const colB = $("ultimateScenarioColB");

    if (aPiti) aPiti.textContent = formatCurrency(a.piti);
    if (bPiti) bPiti.textContent = formatCurrency(b.piti);

    const delta = a.piti - b.piti;
    if (diff) {
      if (Math.abs(delta) < 1) {
        diff.textContent = "Both scenarios are within ~$1/mo in this estimate.";
      } else if (delta > 0) {
        diff.innerHTML = `<strong>Alternative</strong> is about <strong>${formatCurrency(Math.abs(delta))}/mo</strong> lower than your estimate. Educational only — not a Loan Estimate.`;
      } else {
        diff.innerHTML = `<strong>Your estimate</strong> is about <strong>${formatCurrency(Math.abs(delta))}/mo</strong> lower than the alternative. Educational only — not a Loan Estimate.`;
      }
    }
    colA?.classList.toggle("is-winner", a.piti <= b.piti);
    colB?.classList.toggle("is-winner", b.piti < a.piti);

    $("scenarioAPriceVal") && ($("scenarioAPriceVal").textContent = formatCurrency(a.price));
    $("scenarioADownVal") && ($("scenarioADownVal").textContent = `${a.down}%`);
    $("scenarioBPriceVal") && ($("scenarioBPriceVal").textContent = formatCurrency(b.price));
    $("scenarioBDownVal") && ($("scenarioBDownVal").textContent = `${b.down}%`);
  }

  function bindScenarioCompare() {
    const ids = [
      "scenarioAPriceSlider",
      "scenarioADownSlider",
      "scenarioAProgramSelect",
      "scenarioBPriceSlider",
      "scenarioBDownSlider",
      "scenarioBProgramSelect",
    ];
    ids.forEach((id) => {
      $(id)?.addEventListener("input", updateScenarioCompare);
      $(id)?.addEventListener("change", updateScenarioCompare);
    });

    document.querySelectorAll(".ultimate-scenario-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;
        const bProg = $("scenarioBProgramSelect");
        const bDown = $("scenarioBDownSlider");
        if (preset === "fha" && bProg && bDown) {
          bProg.value = "fha";
          bDown.value = "3.5";
        } else if (preset === "va" && bProg && bDown) {
          bProg.value = "va";
          bDown.value = "0";
        } else if (preset === "conv10" && bProg && bDown) {
          bProg.value = "conventional";
          bDown.value = "10";
        }
        updateScenarioCompare();
        window.MMG_logan5_track("scenario_preset", { preset });
      });
    });
  }

  function syncScenarioFromMain() {
    const price = Number($("homePrice")?.value || 0);
    const down = Number($("downPercent")?.value || 0);
    const program = $("loanProgram")?.value || "conventional";
    ["scenarioAPriceSlider", "scenarioBPriceSlider"].forEach((id) => {
      const el = $(id);
      if (el && !el.dataset.touched) el.value = String(price);
    });
    const aDown = $("scenarioADownSlider");
    const aProg = $("scenarioAProgramSelect");
    if (aDown && !aDown.dataset.touched) aDown.value = String(down);
    if (aProg && !aProg.dataset.touched) aProg.value = program;
    updateScenarioCompare();
  }

  /* ── Program rate table ── */
  function updateProgramRateTable() {
    const tbody = $("ultimateProgramRatesBody");
    if (!tbody || !window.MMG_getMartiniRateForProgram) return;

    const price = Number($("homePrice")?.value || 0);
    const down = Number($("downPercent")?.value || 0);
    const current = $("loanProgram")?.value || "conventional";
    const countyKey = getCountyKey();
    const profile = {
      veteranEligible: Boolean($("veteranEligible")?.checked),
      usdaEligible: Boolean($("usdaEligible")?.checked),
    };

    const programs = [
      { id: "conventional", label: "Conventional", down },
      { id: "fha", label: "FHA", down: Math.max(3.5, down) },
      { id: "va", label: "VA", down: 0, need: profile.veteranEligible },
      { id: "usda", label: "USDA", down: 0, need: profile.usdaEligible },
    ];

    tbody.innerHTML = programs
      .map((p) => {
        if (p.need === false) return "";
        let available = true;
        if (window.MMG_isProgramAvailable) {
          available = window.MMG_isProgramAvailable(p.id, price, profile, countyKey);
        }
        if (!available && p.id !== "fha") return "";
        const rate = window.MMG_getMartiniRateForProgram(p.id, p.down);
        const active = current === p.id ? " is-active" : "";
        let note = "";
        if (p.id === "conventional" && window.MMG_isJumboConventional?.(price, p.down, countyKey)) {
          note = "High balance";
        }
        return `<tr class="${active}"><td>${p.label}${note ? ` <span class="rate-note">${note}</span>` : ""}</td><td>${p.down}%</td><td class="rate-cell-martini">${formatRate(rate)}</td></tr>`;
      })
      .join("");
  }

  /* ── Wealth builder (item 17) ── */
  function equityAtYear(loan, rate, years, targetYear) {
    if (loan <= 0 || rate <= 0) return 0;
    const r = rate / 100 / 12;
    const n = years * 12;
    const payment = monthlyPi(loan, rate, years);
    const months = Math.min(targetYear * 12, n);
    let balance = loan;
    for (let m = 0; m < months; m++) {
      const interest = balance * r;
      const principal = payment - interest;
      balance = Math.max(0, balance - principal);
    }
    const price = Number($("homePrice")?.value || 0);
    const appreciation = Math.pow(1.03, targetYear);
    const estValue = price * appreciation;
    return Math.max(0, estValue - balance);
  }

  function updateWealthBuilder(detail) {
    const panel = $("ultimateWealthPanel");
    if (!panel || !detail) return;
    const loan = detail.loanPrincipal || 0;
    const rate = detail.rate || 0;
    const years = detail.years || 30;
    if (loan <= 0) {
      panel.classList.add("hidden");
      return;
    }
    $("wealthEquity5") && ($("wealthEquity5").textContent = formatCurrency(equityAtYear(loan, rate, years, 5)));
    $("wealthEquity10") && ($("wealthEquity10").textContent = formatCurrency(equityAtYear(loan, rate, years, 10)));
    $("wealthEquity30") && ($("wealthEquity30").textContent = formatCurrency(equityAtYear(loan, rate, years, Math.min(30, years))));
    panel.classList.remove("hidden");
  }

  /* ── Share link (item 10) ── */
  function buildScenarioParams(params, opts) {
    const price = $("homePrice")?.value;
    const down = $("downPercent")?.value;
    const credit = $("creditScore")?.value;
    const program = $("loanProgram")?.value;
    const rate = $("interestRate")?.value;
    const address = $("propertyAddress")?.value?.trim();

    ["price", "down", "credit", "program", "rate", "address", "step", "instant", "listing", "quick"].forEach(
      (k) => params.delete(k)
    );

    if (price) params.set("price", price);
    if (down) params.set("down", down);
    if (credit) params.set("credit", credit);
    if (program) params.set("program", program);
    if (rate) params.set("rate", rate);
    if (address) params.set("address", address);

    if (opts?.share) {
      params.set("step", "payment");
      params.set("instant", "1");
    }

    if (document.body.dataset.abHero) params.set("hero", document.body.dataset.abHero);
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) params.set("ref", ref);
  }

  function buildScenarioUrl(opts) {
    const url = new URL(window.location.href.split("#")[0]);
    buildScenarioParams(url.searchParams, opts);
    return url.toString();
  }

  function buildShareUrl() {
    return buildScenarioUrl({ share: true });
  }

  const SHARE_UNLOCK_KEY = "mmg_logan5_share_unlocked";

  function apiBase() {
    const meta = document.querySelector('meta[name="mmg-api-base"]');
    const base = meta?.content || "/";
    return base.endsWith("/") ? base : `${base}/`;
  }

  function collectShareScenario() {
    const program = $("loanProgram");
    const programLabel =
      program?.selectedOptions?.[program.selectedIndex]?.text || program?.value || "";
    return {
      homePrice: $("homePrice")?.value || "",
      downPercent: $("downPercent")?.value || "",
      creditScore: $("creditScore")?.value || "",
      piti: $("pitiPayment")?.textContent || "",
      address: $("propertyAddress")?.value?.trim() || "",
      rate: $("interestRate")?.value || "",
      loanProgram: program?.value || "",
      programLabel,
      cashToClose: $("quoteCashToClose")?.textContent || "",
      shareUrl: buildShareUrl(),
    };
  }

  function updateShareReveal() {
    const scenario = collectShareScenario();
    const pitiEl = $("ultimateSharePiti");
    const priceEl = $("ultimateSharePrice");
    const progEl = $("ultimateShareProgram");
    const preview = $("ultimateShareUrlPreview");
    if (pitiEl) pitiEl.textContent = scenario.piti || "—";
    if (priceEl) {
      const price = Number(scenario.homePrice || 0);
      priceEl.textContent = price >= 50000 ? formatCurrency(price) : "—";
    }
    if (progEl) progEl.textContent = scenario.programLabel || "—";
    if (preview) preview.value = scenario.shareUrl;
  }

  function showShareUnlocked() {
    const gate = $("ultimateShareGate");
    const reveal = $("ultimateShareReveal");
    const btn = $("ultimateShareBtn");
    gate?.classList.add("hidden");
    reveal?.classList.remove("hidden");
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
      const sub = btn.querySelector(".ultimate-hub-btn-sub");
      if (sub) sub.textContent = "Estimate unlocked";
    }
    updateShareReveal();
  }

  function isShareUnlocked() {
    try {
      return sessionStorage.getItem(SHARE_UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  }

  async function submitShareLead(e) {
    e.preventDefault();
    const email = $("ultimateShareEmail")?.value?.trim() || "";
    const consent = $("ultimateShareConsent")?.checked;
    const err = $("ultimateShareError");
    if (!email || !email.includes("@")) {
      $("ultimateShareEmail")?.focus();
      return;
    }
    if (!consent) {
      $("ultimateShareConsent")?.focus();
      return;
    }

    const scenario = collectShareScenario();
    const payload = {
      email,
      assignedLo: "logan",
      version: "Logan5",
      source: "logan5-share-estimate",
      notifyEmail: "logan@martinimortgagegroup.com",
      consent: true,
      scenario,
    };

    try {
      const res = await fetch(`${apiBase()}api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      try {
        sessionStorage.setItem(SHARE_UNLOCK_KEY, "1");
      } catch {
        /* ignore */
      }
      showShareUnlocked();
      if (err) err.classList.add("hidden");
      window.MMG_logan5_track("share_lead_unlock", { step: document.body.dataset.wizardStep });
      window.MMG_trackPixel?.("ShareLead", { url: scenario.shareUrl, email });
    } catch {
      if (err) {
        err.classList.remove("hidden");
        err.textContent = "Couldn't save — try again or call (919) 238-4934.";
      }
    }
  }

  function bindShareLeadCapture() {
    const btn = $("ultimateShareBtn");
    const gate = $("ultimateShareGate");
    const form = $("ultimateShareLeadForm");
    const copyBtn = $("ultimateShareCopyBtn");

    if (isShareUnlocked()) {
      showShareUnlocked();
    }

    btn?.addEventListener("click", () => {
      if (isShareUnlocked()) {
        showShareUnlocked();
        gate?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const open = !gate?.classList.contains("hidden");
      gate?.classList.toggle("hidden", open);
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      if (!open) {
        gate?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        $("ultimateShareEmail")?.focus();
      }
    });

    form?.addEventListener("submit", submitShareLead);

    copyBtn?.addEventListener("click", async () => {
      const link = buildShareUrl();
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = "Link copied!";
        window.MMG_logan5_track("share_copy", { step: document.body.dataset.wizardStep });
        window.setTimeout(() => {
          copyBtn.textContent = "Copy share link";
        }, 2200);
      } catch {
        window.prompt("Copy this link:", link);
      }
    });
  }

  function scheduleShareUrlSync() {
    if (shareSyncTimer) window.clearTimeout(shareSyncTimer);
    shareSyncTimer = window.setTimeout(() => {
      try {
        if (Number(document.body.dataset.wizardStep) < 3) return;
        history.replaceState(null, "", buildScenarioUrl());
        const preview = $("ultimateShareUrlPreview");
        if (preview) preview.value = buildShareUrl();
      } catch {
        /* ignore */
      }
    }, 800);
  }

  /* ── PMMS meta from calculator ── */
  function onCalculated(detail) {
    lastCalc = detail;
    updateRateTicker();
    updateLimitBadge();
    updateBuyingPowerViz();
    renderDonut(detail);
    updateBuydownChip(detail);
    updateReadinessScore(detail);
    updateWealthBuilder(detail);
    updateProgramRateTable();
    if (Number(document.body.dataset.wizardStep) >= 3) {
      syncScenarioFromMain();
    }
    scheduleShareUrlSync();
    if (isShareUnlocked()) updateShareReveal();
  }

  function bind() {
    initAbHero();
    bindCreditTiers();
    bindDonutToggle();
    bindScenarioCompare();
    bindShareLeadCapture();

    document.addEventListener("mmg-logan5-calculated", (e) => onCalculated(e.detail));
    document.addEventListener("mmg-calculated", () => {
      updateRateTicker();
      updateProgramRateTable();
    });
    document.addEventListener("mmg-wizard-step-change", (e) => {
      if ((e.detail?.step ?? 0) === 2) {
        syncScenarioFromMain();
        updateProgramRateTable();
      }
    });
    document.addEventListener("mmg-logan5-reverse", updateBuyingPowerViz);
    document.addEventListener("mmg-property-resolved", updateLimitBadge);
    document.addEventListener("input", () => {
      window.requestAnimationFrame(updateBuyingPowerViz);
    });

    $("loanProgram")?.addEventListener("change", () => {
      updateRateTicker();
      updateProgramRateTable();
      updateLimitBadge();
    });

    window.setInterval(tickCountdown, 60000);
    tickCountdown();
    updateRateTicker();
    updateLimitBadge();

    document.querySelectorAll("[data-scenario-touch]").forEach((el) => {
      el.addEventListener("input", () => {
        el.dataset.touched = "1";
      });
    });
  }

  window.MMG_logan5_buildShareUrl = buildShareUrl;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();