/**
 * Optional, non-blocking buyer lead capture (Logan1 + Logan3).
 * Calculator works fully without contact info.
 */
(function () {
  "use strict";

  const DISMISS_KEY = "mmg_save_estimate_dismissed";
  const SUBMITTED_KEY = "mmg_save_estimate_submitted";
  const MIN_SLIDER_MOVES = 2;
  const DELAY_MS = 8000;
  const LOGAN4_DELAY_MS = 7000;
  const LOGAN4_SCROLL_MIN_MS = 3000;
  const LOGAN5_DELAY_MS = 15000;
  const LOGAN5_ENGAGEMENT_MS = 10000;
  const LOGAN5_HUB_DELAY_MS = 8000;

  let sliderMoves = 0;
  let shown = false;
  let timer = null;
  let logan4ResultsAt = 0;
  let logan4ScrollObserver = null;
  let logan5ResultsAt = 0;
  let logan5ScrollObserver = null;
  let logan5HubTimer = null;
  let logan5ScrollDepthObserver = null;
  let logan5ScrollDepthFired = false;
  const LOGAN5_SCROLL_DEPTH = 0.5;

  function isLogan1() {
    return (
      document.body.classList.contains("logan1-realtor") ||
      document.body.classList.contains("logan5-realtor")
    );
  }

  function isLogan3() {
    return document.body.classList.contains("logan3");
  }

  function isLogan4() {
    return document.body.classList.contains("logan4");
  }

  function isLogan5() {
    return document.body.classList.contains("logan5");
  }

  function isSocialWizard() {
    return isLogan3() || isLogan4() || isLogan5();
  }

  function apiBase() {
    const meta = document.querySelector('meta[name="mmg-api-base"]');
    const base = meta?.content || "/";
    return base.endsWith("/") ? base : `${base}/`;
  }

  function card() {
    return document.getElementById("saveEstimateCard");
  }

  function shouldShow() {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return false;
      if (localStorage.getItem(SUBMITTED_KEY) === "1") return false;
    } catch {
      /* ignore */
    }
    return isLogan1() || isSocialWizard();
  }

  function showCard() {
    const el = card();
    if (!el || shown || !shouldShow()) return;
    const piti = document.getElementById("pitiPayment")?.textContent?.trim();
    if (!piti || piti === "—" || piti === "$0") return;
    shown = true;
    el.classList.remove("hidden");
  }

  function hideCard(persistDismiss) {
    const el = card();
    if (el) el.classList.add("hidden");
    if (persistDismiss) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
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

  function resolveAssignedLo() {
    const params = new URLSearchParams(window.location.search);
    const loRef = normalizeLoRef(params.get("ref") || params.get("partner") || "");
    if (loRef === "kevin" || loRef === "logan") return loRef;
    if (isLogan5() || isLogan3()) return "logan";
    return isLogan4() ? "team" : "";
  }

  function collectScenario() {
    const get = (id) => document.getElementById(id);
    const params = new URLSearchParams(window.location.search);
    return {
      homePrice: get("homePrice")?.value || "",
      downPercent: get("downPercent")?.value || "",
      creditScore: get("creditScore")?.value || "",
      piti: get("pitiPayment")?.textContent || "",
      address: get("propertyAddress")?.value || "",
      rate: get("interestRate")?.value || "",
      loanProgram: get("loanProgram")?.value || "",
      ref: params.get("ref") || params.get("partner") || "",
      utm: Object.fromEntries(params),
    };
  }

  function activeSaveTab() {
    return document.querySelector(".save-estimate-tab.active")?.dataset.saveTab || "email";
  }

  async function submitLead(form) {
    const emailEl = document.getElementById("saveEstimateEmail");
    const nameEl = document.getElementById("saveEstimateName");
    const phoneEl = document.getElementById("saveEstimatePhone");
    const smsPhoneEl = document.getElementById("saveEstimateSmsPhone");
    const smsConsentEl = document.getElementById("saveEstimateSmsConsent");
    const successEl = document.getElementById("saveEstimateSuccess");
    const tab = isLogan5() ? activeSaveTab() : "email";
    const email = emailEl?.value?.trim() || "";
    const smsPhone = smsPhoneEl?.value?.trim() || "";
    const digits = smsPhone.replace(/\D/g, "");

    if (tab === "sms") {
      if (digits.length < 10) {
        smsPhoneEl?.focus();
        return;
      }
      if (!smsConsentEl?.checked) {
        smsConsentEl?.focus();
        return;
      }
    } else if (!email || !email.includes("@")) {
      emailEl?.focus();
      return;
    }

    const assignedLo = resolveAssignedLo();
    const payload = {
      email: tab === "sms" ? `sms+${digits}@estimate.martinimortgagegroup.com` : email,
      name: nameEl?.value?.trim() || "",
      phone: tab === "sms" ? smsPhone : phoneEl?.value?.trim() || "",
      agent: document.documentElement.dataset.coAgent || "",
      ref: assignedLo === "team" ? "" : assignedLo,
      assignedLo,
      version: isLogan5() ? "Logan5" : isLogan4() ? "Logan4" : isLogan3() ? "Logan3" : "Logan1",
      source:
        tab === "sms"
          ? "logan5-sms-estimate"
          : isLogan5()
            ? "logan5-save-estimate"
            : isLogan4()
              ? "logan4-save-estimate"
              : isLogan3()
                ? "logan3-save-estimate"
                : "logan1-save-estimate",
      consent: true,
      smsConsent: tab === "sms" ? true : undefined,
      scenario: {
        ...collectScenario(),
        delivery: tab,
        shareUrl: window.MMG_logan5_buildShareUrl?.() || "",
      },
    };
    try {
      const res = await fetch(`${apiBase()}api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      form?.classList.add("hidden");
      successEl?.classList.remove("hidden");
      if (successEl && tab === "sms") {
        successEl.textContent = "Saved — we'll text your estimate shortly.";
      }
      try {
        localStorage.setItem(SUBMITTED_KEY, "1");
      } catch {
        /* ignore */
      }
      window.MMG_trackPixel?.("LeadSubmit", {
        source: payload.source,
        delivery: tab,
      });
      window.setTimeout(() => hideCard(false), 5000);
    } catch {
      if (successEl) {
        successEl.textContent =
          isLogan4()
            ? "We couldn't save that right now — you can still apply or call our team anytime."
            : "We couldn't save that right now — you can still apply or call Logan anytime.";
        successEl.classList.remove("hidden");
      }
    }
  }

  function onSliderActivity() {
    if (!shouldShow() || shown || isSocialWizard()) return;
    sliderMoves += 1;
    if (sliderMoves >= MIN_SLIDER_MOVES) showCard();
  }

  function scheduleReveal() {
    if (timer || !shouldShow() || isSocialWizard()) return;
    timer = window.setTimeout(() => {
      if (document.getElementById("pitiPayment")?.textContent?.trim() &&
          document.getElementById("pitiPayment")?.textContent !== "—") {
        showCard();
      }
    }, DELAY_MS);
  }

  function logan5EngagedLongEnough() {
    return logan5ResultsAt > 0 && Date.now() - logan5ResultsAt >= LOGAN5_ENGAGEMENT_MS;
  }

  function tryShowLogan5Card() {
    if (!isLogan5() || shown || !shouldShow()) return;
    if (!logan5EngagedLongEnough()) return;
    showCard();
  }

  function scheduleLogan5Reveal() {
    if (!isLogan5() || !shouldShow()) return;
    logan5ResultsAt = Date.now();
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      tryShowLogan5Card();
    }, LOGAN5_DELAY_MS);
    bindLogan5ScrollReveal();
  }

  function bindLogan5ScrollReveal() {
    if (!isLogan5() || logan5ScrollObserver) return;
    const target =
      document.getElementById("ultimatePaymentMain") ||
      document.getElementById("saveEstimateCard");
    if (!target || typeof IntersectionObserver === "undefined") return;
    logan5ScrollObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25);
        if (!visible || shown || !shouldShow()) return;
        if (!logan5EngagedLongEnough()) return;
        if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
        showCard();
      },
      { threshold: [0.25, 0.5] }
    );
    logan5ScrollObserver.observe(target);
  }

  function bindLogan5ScrollDepth() {
    if (!isLogan5() || logan5ScrollDepthObserver) return;
    const target = document.querySelector(".ultimate-payment-details");
    if (!target || typeof IntersectionObserver === "undefined") return;
    logan5ScrollDepthObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (logan5ScrollDepthFired || shown || !shouldShow()) return;
          const docH = document.documentElement.scrollHeight - window.innerHeight;
          const scrolled = docH > 0 ? window.scrollY / docH : 0;
          if (e.isIntersecting && (scrolled >= LOGAN5_SCROLL_DEPTH || e.intersectionRatio >= 0.2)) {
            logan5ScrollDepthFired = true;
            if (logan5EngagedLongEnough()) {
              if (timer) {
                window.clearTimeout(timer);
                timer = null;
              }
              showCard();
            }
          }
        });
      },
      { threshold: [0.15, 0.35, 0.5] }
    );
    logan5ScrollDepthObserver.observe(target);
  }

  function bindSaveEstimateTabs() {
    if (!isLogan5()) return;
    const emailTab = document.getElementById("saveTabEmail");
    const smsTab = document.getElementById("saveTabSms");
    const emailInput = document.getElementById("saveEstimateEmail");
    const smsFields = document.getElementById("saveEstimateSmsFields");
    const title = document.querySelector(".save-estimate-title");

    function setTab(tab) {
      [emailTab, smsTab].forEach((btn) => {
        if (!btn) return;
        const on = btn.dataset.saveTab === tab;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (emailInput) emailInput.required = tab === "email";
      smsFields?.classList.toggle("hidden", tab !== "sms");
      if (title) {
        title.textContent =
          tab === "sms" ? "Text me this payment" : "Email me this payment";
      }
    }

    emailTab?.addEventListener("click", () => setTab("email"));
    smsTab?.addEventListener("click", () => setTab("sms"));
    setTab("email");
  }

  function bindLogan5HubReveal() {
    if (!isLogan5()) return;
    document.querySelectorAll("[data-hub-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (shown || !shouldShow()) return;
        if (logan5HubTimer) window.clearTimeout(logan5HubTimer);
        logan5HubTimer = window.setTimeout(() => {
          logan5HubTimer = null;
          if (logan5EngagedLongEnough()) showCard();
        }, LOGAN5_HUB_DELAY_MS);
      });
    });
  }

  function bindLogan4ScrollReveal() {
    if (!isLogan4() || logan4ScrollObserver) return;
    const target = document.getElementById("martiniAdvantage");
    if (!target || typeof IntersectionObserver === "undefined") return;
    logan4ScrollObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.35);
        if (!visible || shown || !shouldShow()) return;
        if (Date.now() - logan4ResultsAt < LOGAN4_SCROLL_MIN_MS) return;
        if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
        showCard();
      },
      { threshold: [0.35, 0.55] }
    );
    logan4ScrollObserver.observe(target);
  }

  function bind() {
    const el = card();
    if (!el || !shouldShow()) return;

    if (isLogan1()) {
      document
        .querySelectorAll('input[type="range"], #homePriceInput, #downAmountInput')
        .forEach((node) => node.addEventListener("input", onSliderActivity));
      document.addEventListener("mmg-calculated", scheduleReveal);
    }

    if (isLogan4()) {
      document.addEventListener("mmg-wizard-results", () => {
        logan4ResultsAt = Date.now();
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          showCard();
        }, LOGAN4_DELAY_MS);
        bindLogan4ScrollReveal();
      });
    } else if (isLogan5()) {
      document.addEventListener("mmg-wizard-results", () => {
        scheduleLogan5Reveal();
        bindLogan5ScrollDepth();
      });
      bindLogan5HubReveal();
      bindSaveEstimateTabs();
    } else if (isLogan3()) {
      document.addEventListener("mmg-wizard-results", () => {
        window.setTimeout(showCard, 400);
      });
    }

    document.getElementById("saveEstimateDismiss")?.addEventListener("click", () => hideCard(true));
    document.getElementById("saveEstimateSkip")?.addEventListener("click", () => hideCard(true));

    document.getElementById("saveEstimateForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      submitLead(e.target);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();