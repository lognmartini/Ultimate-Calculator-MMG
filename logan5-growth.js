/**
 * Logan5 growth layer — payment wheel, seller credits, rate alerts, retargeting pixels.
 */
(function () {
  "use strict";

  if (!document.body.classList.contains("logan5")) return;

  const WHEEL_COLORS = {
    pi: "#e8c84a",
    tax: "#818cf8",
    ins: "#38bdf8",
    mi: "#fb923c",
    hoa: "#c084fc",
  };

  let sellerCreditAmount = 0;

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

  function formatPct(n) {
    if (!Number.isFinite(n)) return "0%";
    return `${Math.round(n)}%`;
  }

  function apiBase() {
    const meta = document.querySelector('meta[name="mmg-api-base"]');
    const base = meta?.content || "/";
    return base.endsWith("/") ? base : `${base}/`;
  }

  /* ── Retargeting pixels (#17) ── */
  function loadPixels() {
    const metaId = document.querySelector('meta[name="mmg-meta-pixel-id"]')?.content?.trim();
    const gtagId = document.querySelector('meta[name="mmg-gtag-id"]')?.content?.trim();

    if (metaId) {
      if (!window.fbq) {
        const n = (window.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        });
        if (!window._fbq) window._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = "2.0";
        n.queue = [];
        const s = document.createElement("script");
        s.async = true;
        s.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(s);
      }
      window.fbq("init", metaId);
      window.fbq("track", "PageView");
    }

    if (gtagId && !window.gtag) {
      const g = document.createElement("script");
      g.async = true;
      g.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtagId)}`;
      document.head.appendChild(g);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", gtagId, { send_page_view: true });
    }
  }

  window.MMG_trackPixel = function (eventName, data) {
    const payload = { ...data, page: "logan5", ts: Date.now() };
    window.MMG_logan5_track?.(eventName, payload);

    if (typeof window.fbq === "function") {
      const fbMap = {
        ViewPayment: "ViewContent",
        LeadSubmit: "Lead",
        ApplyClick: "InitiateCheckout",
        RateAlertSignup: "Subscribe",
        ShareLink: "Contact",
      };
      window.fbq("track", fbMap[eventName] || "ViewContent", payload);
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, payload);
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: `logan5_${eventName}`, ...payload });
    }
  };

  function bindPixelHooks() {
    document.querySelectorAll("[data-mmg-apply]").forEach((el) => {
      el.addEventListener("click", () => {
        window.MMG_trackPixel("ApplyClick", {
          rate: $("interestRate")?.value,
          piti: $("pitiPayment")?.textContent,
          program: $("loanProgram")?.value,
        });
      });
    });

    document.addEventListener("mmg-wizard-results", () => {
      window.MMG_trackPixel("ViewPayment", {
        piti: $("pitiPayment")?.textContent,
        price: $("homePrice")?.value,
        program: $("loanProgram")?.value,
        instant: document.body.dataset.instantLanding === "1",
      });
    });
  }

  /* ── Payment breakdown wheel ── */
  function renderPaymentWheel(detail) {
    const wheel = $("paymentBreakdownWheel");
    const svg = $("pbwSvg");
    const legend = $("pbwLegend");
    const center = $("pbwCenterAmount");
    if (!wheel || !svg || !legend || !detail) return;

    const segments = [
      { key: "pi", label: "Principal & interest", value: detail.pi || 0 },
      { key: "tax", label: "Property tax", value: detail.monthlyTax || 0 },
      { key: "ins", label: "Insurance", value: detail.monthlyInsurance || 0 },
    ];
    if ((detail.monthlyPmi || 0) > 0) {
      segments.push({ key: "mi", label: "Mortgage insurance", value: detail.monthlyPmi });
    }
    if ((detail.monthlyHoa || 0) > 0) {
      segments.push({ key: "hoa", label: "HOA", value: detail.monthlyHoa });
    }

    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    const cx = 100;
    const cy = 100;
    const r = 72;
    const stroke = 22;
    let offset = 0;
    const circles = segments
      .map((seg) => {
        const pct = seg.value / total;
        const dash = pct * 2 * Math.PI * r;
        const gap = 2 * Math.PI * r;
        const circle = `<circle class="pbw-segment pbw-segment-${seg.key}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${WHEEL_COLORS[seg.key]}" stroke-width="${stroke}" stroke-linecap="butt" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += dash;
        return circle;
      })
      .join("");

    svg.innerHTML =
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${stroke}"/>${circles}`;

    if (center) {
      center.textContent = formatCurrency(detail.totalMonthly || detail.piti || total);
    }

    legend.innerHTML = segments
      .map((seg) => {
        const pct = (seg.value / total) * 100;
        return `<li class="pbw-legend-item" data-seg="${seg.key}">
          <span class="pbw-swatch" style="background:${WHEEL_COLORS[seg.key]}"></span>
          <span class="pbw-legend-label">${seg.label}</span>
          <strong class="pbw-legend-val">${formatCurrency(seg.value)}</strong>
          <span class="pbw-legend-pct">${formatPct(pct)}</span>
        </li>`;
      })
      .join("");

    wheel.classList.remove("hidden");
    wheel.classList.add("pbw-animate-in");
  }

  /* ── Seller concession slider (#11) ── */
  window.MMG_getSellerCredit = function () {
    return Math.max(0, Number(sellerCreditAmount) || 0);
  };

  function updateSellerCreditUi() {
    const slider = $("sellerCreditSlider");
    const display = $("sellerCreditDisplay");
    const note = $("sellerCreditNote");
    const quoteRow = $("quoteSellerCreditRow");
    const quoteVal = $("quoteSellerCredit");
    if (!slider) return;

    const price = Number($("homePrice")?.value || 0);
    const down = Number($("downPercent")?.value || 0);
    const program = $("loanProgram")?.value || "conventional";
    const max =
      window.MMG_getSellerConcessionMax?.(program, down, price) ||
      Math.round(price * 0.03);
    slider.max = String(Math.max(0, max));
    const val = Math.min(Number(slider.value) || 0, max);
    sellerCreditAmount = val;
    slider.value = String(val);

    if (display) display.textContent = formatCurrency(val);
    if (note && window.MMG_getSellerConcessionNote) {
      const tier = window.MMG_getSellerConcessionNote(program, down);
      note.textContent =
        `${tier.note || tier.label || "Seller concessions"} · Max ~${formatCurrency(max)} for this estimate. Credits reduce cash to close when allowed by contract and underwriting.`;
    }
    if (quoteRow && quoteVal) {
      if (val > 0) {
        quoteRow.classList.remove("hidden");
        quoteVal.textContent = `−${formatCurrency(val)}`;
      } else {
        quoteRow.classList.add("hidden");
        quoteVal.textContent = "—";
      }
    }

    if (window.MMG_calculate) window.MMG_calculate();
    else document.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function bindSellerCredit() {
    const slider = $("sellerCreditSlider");
    if (!slider) return;
    slider.addEventListener("input", updateSellerCreditUi);
    $("loanProgram")?.addEventListener("change", updateSellerCreditUi);
    $("downPercent")?.addEventListener("input", updateSellerCreditUi);
    $("homePrice")?.addEventListener("input", updateSellerCreditUi);
    updateSellerCreditUi();
  }

  /* ── Rate drop alert (#4) ── */
  async function submitRateAlert(e) {
    e.preventDefault();
    const form = $("rateAlertForm");
    const email = $("rateAlertEmail")?.value?.trim() || "";
    const consent = $("rateAlertConsent")?.checked;
    const success = $("rateAlertSuccess");
    const err = $("rateAlertError");
    if (!email || !email.includes("@")) {
      $("rateAlertEmail")?.focus();
      return;
    }
    if (!consent) {
      $("rateAlertConsent")?.focus();
      return;
    }

    const baseline = Number($("interestRate")?.value || 0);
    const payload = {
      email,
      assignedLo: "logan",
      version: "Logan5",
      source: "logan5-rate-alert",
      notifyEmail: "logan@martinimortgagegroup.com",
      consent: true,
      scenario: {
        baselineRate: baseline,
        alertThreshold: 0.125,
        piti: $("pitiPayment")?.textContent,
        homePrice: $("homePrice")?.value,
        downPercent: $("downPercent")?.value,
        creditScore: $("creditScore")?.value,
        address: $("propertyAddress")?.value,
        program: $("loanProgram")?.value,
        rate: String(baseline),
        shareUrl: window.MMG_logan5_buildShareUrl?.() || "",
      },
    };

    try {
      const res = await fetch(`${apiBase()}api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      form?.classList.add("hidden");
      if (success) {
        success.classList.remove("hidden");
        success.textContent = `You're on the list — Logan's team will email you if rates move ±0.125% from ${baseline}%`;
      }
      if (err) err.classList.add("hidden");
      window.MMG_trackPixel("RateAlertSignup", { baselineRate: baseline, email });
      try {
        localStorage.setItem("mmg_rate_alert_submitted", "1");
      } catch {
        /* ignore */
      }
    } catch {
      if (err) {
        err.classList.remove("hidden");
        err.textContent = "Couldn't save — call (919) 238-4934 or apply when ready.";
      }
    }
  }

  function updateRateAlertBaseline() {
    const el = $("rateAlertBaseline");
    if (!el) return;
    const rate = Number($("interestRate")?.value || 0);
    const piti = $("pitiPayment")?.textContent?.trim();
    if (rate > 0) {
      el.textContent = `${rate}%${piti && piti !== "—" ? ` · ${piti}/mo` : ""}`;
    } else {
      el.textContent = "—";
    }
  }

  function bindRateAlert() {
    $("rateAlertForm")?.addEventListener("submit", submitRateAlert);
    document.addEventListener("mmg-logan5-calculated", updateRateAlertBaseline);
    document.addEventListener("mmg-calculated", updateRateAlertBaseline);
    $("interestRate")?.addEventListener("input", updateRateAlertBaseline);
    updateRateAlertBaseline();
    try {
      if (localStorage.getItem("mmg_rate_alert_submitted") === "1") {
        $("rateAlertForm")?.classList.add("hidden");
        const success = $("rateAlertSuccess");
        if (success) {
          success.classList.remove("hidden");
          success.textContent = "Rate alerts active for this device session.";
        }
      }
    } catch {
      /* ignore */
    }
  }

  /* ── Listing instant URL builder (supports #3) ── */
  window.MMG_logan5_buildListingUrl = function (address, price, ref) {
    const base = window.MMG_SITE?.logan5Path || "/go5.html";
    const origin = window.location.origin;
    const path = base.startsWith("http") ? base : `${origin}${base.startsWith("/") ? "" : "/"}${base}`;
    const url = new URL(path);
    if (address) url.searchParams.set("address", address);
    if (price) url.searchParams.set("price", String(price));
    url.searchParams.set("instant", "1");
    url.searchParams.set("step", "payment");
    if (ref) url.searchParams.set("ref", ref);
    return url.toString();
  };

  function showInstantBanner() {
    const banner = $("logan5InstantBanner");
    const detail = $("logan5InstantBannerDetail");
    if (!banner) return;
    if (document.body.dataset.instantLanding !== "1") {
      banner.classList.add("hidden");
      return;
    }
    const address = $("propertyAddress")?.value?.trim();
    const price = Number($("homePrice")?.value || 0);
    if (detail) {
      if (address && price >= 50000) {
        detail.textContent = `${address} · ${formatCurrency(price)} — educational only, not a Loan Estimate or rate lock.`;
      } else if (price >= 50000) {
        detail.textContent = `${formatCurrency(price)} listing — educational only, not a Loan Estimate or rate lock.`;
      }
    }
    banner.classList.remove("hidden");
  }

  function bind() {
    loadPixels();
    bindPixelHooks();
    bindSellerCredit();
    bindRateAlert();
    showInstantBanner();

    document.addEventListener("mmg-logan5-calculated", (e) => {
      renderPaymentWheel(e.detail);
      showInstantBanner();
    });

    document.addEventListener("mmg-wizard-results", showInstantBanner);

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();