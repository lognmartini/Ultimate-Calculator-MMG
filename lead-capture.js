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

  let sliderMoves = 0;
  let shown = false;
  let timer = null;
  let logan4ResultsAt = 0;
  let logan4ScrollObserver = null;

  function isLogan1() {
    return document.body.classList.contains("logan1-realtor");
  }

  function isLogan3() {
    return document.body.classList.contains("logan3");
  }

  function isLogan4() {
    return document.body.classList.contains("logan4");
  }

  function isSocialWizard() {
    return isLogan3() || isLogan4();
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
    return isLogan4() ? "team" : isLogan3() ? "logan" : "";
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

  async function submitLead(form) {
    const emailEl = document.getElementById("saveEstimateEmail");
    const nameEl = document.getElementById("saveEstimateName");
    const phoneEl = document.getElementById("saveEstimatePhone");
    const successEl = document.getElementById("saveEstimateSuccess");
    const email = emailEl?.value?.trim() || "";
    if (!email || !email.includes("@")) {
      emailEl?.focus();
      return;
    }
    const assignedLo = resolveAssignedLo();
    const payload = {
      email,
      name: nameEl?.value?.trim() || "",
      phone: phoneEl?.value?.trim() || "",
      agent: document.documentElement.dataset.coAgent || "",
      ref: assignedLo === "team" ? "" : assignedLo,
      assignedLo,
      version: isLogan4() ? "Logan4" : isLogan3() ? "Logan3" : "Logan1",
      source: isLogan4()
        ? "logan4-save-estimate"
        : isLogan3()
          ? "logan3-save-estimate"
          : "logan1-save-estimate",
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