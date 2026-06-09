/**
 * Logan1 — optional, non-blocking buyer lead capture.
 * Calculator works fully without contact info (progressive profiling best practice).
 */
(function () {
  "use strict";

  const DISMISS_KEY = "mmg_save_estimate_dismissed";
  const SUBMITTED_KEY = "mmg_save_estimate_submitted";
  const MIN_SLIDER_MOVES = 2;
  const DELAY_MS = 12000;

  let sliderMoves = 0;
  let shown = false;
  let timer = null;

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
    return document.body.classList.contains("logan1-realtor");
  }

  function showCard() {
    const el = card();
    if (!el || shown || !shouldShow()) return;
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

  function collectScenario() {
    const get = (id) => document.getElementById(id);
    return {
      homePrice: get("homePrice")?.value || "",
      downPercent: get("downPercent")?.value || "",
      creditScore: get("creditScore")?.value || "",
      piti: get("pitiPayment")?.textContent || "",
      address: get("propertyAddress")?.value || "",
      rate: get("interestRate")?.value || "",
    };
  }

  async function submitLead(form) {
    const emailEl = document.getElementById("saveEstimateEmail");
    const nameEl = document.getElementById("saveEstimateName");
    const successEl = document.getElementById("saveEstimateSuccess");
    const email = emailEl?.value?.trim() || "";
    if (!email || !email.includes("@")) {
      emailEl?.focus();
      return;
    }
    const payload = {
      email,
      name: nameEl?.value?.trim() || "",
      agent: document.documentElement.dataset.coAgent || "",
      source: "logan1-save-estimate",
      consent: true,
      scenario: collectScenario(),
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
      try {
        localStorage.setItem(SUBMITTED_KEY, "1");
      } catch {
        /* ignore */
      }
      window.setTimeout(() => hideCard(false), 4000);
    } catch {
      if (successEl) {
        successEl.textContent =
          "We couldn't save that right now — you can still use the calculator or apply anytime.";
        successEl.classList.remove("hidden");
      }
    }
  }

  function onSliderActivity() {
    if (!shouldShow() || shown) return;
    sliderMoves += 1;
    if (sliderMoves >= MIN_SLIDER_MOVES) showCard();
  }

  function scheduleReveal() {
    if (timer || !shouldShow()) return;
    timer = window.setTimeout(() => {
      if (document.getElementById("pitiPayment")?.textContent?.trim() &&
          document.getElementById("pitiPayment")?.textContent !== "—") {
        showCard();
      }
    }, DELAY_MS);
  }

  function bind() {
    const el = card();
    if (!el || !shouldShow()) return;

    document
      .querySelectorAll('input[type="range"], #homePriceInput, #downAmountInput')
      .forEach((node) => node.addEventListener("input", onSliderActivity));

    document.addEventListener("mmg-calculated", scheduleReveal);

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