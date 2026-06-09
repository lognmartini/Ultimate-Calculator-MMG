/**
 * Logan3 / Logan4 — social-first wizard (go.html, go4.html).
 * 3 steps: home → tune → payment. URL deep links for listing posts.
 */
(function () {
  "use strict";

  const TOTAL_STEPS = 3;
  const STEP_LABELS = ["This home", "Your numbers", "Your payment"];
  let currentStep = 0;
  let deepLinkBootstrapped = false;

  function $(id) {
    return document.getElementById(id);
  }

  function getSteps() {
    return Array.from(document.querySelectorAll(".wizard-step"));
  }

  function formatLivePayment(text) {
    const t = (text || "").trim();
    return t && t !== "—" && t !== "$0" ? t : "—";
  }

  function updateLivePreview() {
    const amount = $("wizardLivePayment");
    const note = $("wizardLiveNote");
    const piti = $("pitiPayment");
    if (!amount) return;
    const val = formatLivePayment(piti?.textContent);
    amount.textContent = val;
    if (note) {
      if (currentStep === TOTAL_STEPS - 1) {
        note.textContent = "Your estimate is ready";
      } else if (val !== "—") {
        note.textContent = "Tap Next to continue";
      } else {
        note.textContent = "Updates as you adjust";
      }
    }
    const preview = $("wizardLivePreview");
    if (preview) {
      preview.classList.toggle("wizard-live-preview-ready", val !== "—");
    }
  }

  function updateListingBanner() {
    const banner = $("socialListingBanner");
    const addrEl = $("socialListingAddress");
    const addr = $("propertyAddress")?.value?.trim() || "";
    if (!banner || !addrEl) return;
    if (addr.length > 4) {
      addrEl.textContent = addr;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }

  function updateProgress() {
    const fill = $("wizardProgressFill");
    const label = $("wizardProgressLabel");
    const ctx = $("wizardProgressContext");
    const pct = ((currentStep + 1) / TOTAL_STEPS) * 100;
    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `Step ${currentStep + 1} of ${TOTAL_STEPS}`;
    if (ctx) ctx.textContent = STEP_LABELS[currentStep] || "Payment estimate";
    document.body.dataset.wizardStep = String(currentStep + 1);
    const live = $("wizardLivePreview");
    if (live) {
      live.classList.toggle("wizard-live-preview-results", currentStep === TOTAL_STEPS - 1);
    }
  }

  function updateNavButtons() {
    const next = $("wizardNext");
    const back = $("wizardBack");
    if (back) {
      back.style.visibility = currentStep === 0 ? "hidden" : "visible";
      back.style.pointerEvents = currentStep === 0 ? "none" : "auto";
    }
    if (!next) return;
    if (currentStep === TOTAL_STEPS - 1) {
      next.style.display = "none";
    } else {
      next.style.display = "";
      const text = next.querySelector(".btn-apply-text");
      if (!text) return;
      if (currentStep === 0) text.textContent = "Next";
      else if (currentStep === TOTAL_STEPS - 2) text.textContent = "See payment";
      else text.textContent = "Next";
    }
    if (currentStep === TOTAL_STEPS - 1 && back) {
      back.style.visibility = "visible";
      back.style.pointerEvents = "auto";
    }
  }

  function recalculate() {
    if (typeof window.MMG_calculate === "function") {
      window.MMG_calculate();
    }
    updateLivePreview();
    updateListingBanner();
  }

  function showStep(index) {
    currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, index));
    getSteps().forEach((el, i) => {
      const active = i === currentStep;
      el.classList.toggle("wizard-step-active", active);
      el.hidden = !active;
    });
    updateProgress();
    updateNavButtons();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (currentStep === TOTAL_STEPS - 1) {
      document.body.classList.add("wizard-on-results");
      recalculate();
      window.dispatchEvent(new CustomEvent("mmg-wizard-results"));
    } else {
      document.body.classList.remove("wizard-on-results");
      recalculate();
    }
    document.dispatchEvent(
      new CustomEvent("mmg-wizard-step-change", { detail: { step: currentStep } })
    );
    window.dispatchEvent(new Event("scroll"));
  }

  function validateBeforeLeave(stepIndex) {
    if (stepIndex === 0) {
      const price = Number($("homePrice")?.value || 0);
      if (price < 50000) {
        $("homePriceInput")?.focus();
        $("homePriceInput")?.classList.add("input-error-flash");
        setTimeout(() => $("homePriceInput")?.classList.remove("input-error-flash"), 1200);
        return false;
      }
    }
    return true;
  }

  function setPriceFromParam(raw) {
    const n = Number(String(raw || "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n < 50000) return false;
    const price = Math.min(3000000, Math.max(50000, Math.round(n)));
    const slider = $("homePrice");
    const input = $("homePriceInput");
    const display = $("homePriceDisplay");
    if (slider) slider.value = String(price);
    if (input) input.value = price.toLocaleString("en-US");
    if (display) display.textContent = `$${price.toLocaleString("en-US")}`;
    slider?.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function setDownFromParam(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return;
    const el = $("downPercent");
    if (el) {
      el.value = String(n);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function setCreditFromParam(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 580 || n > 850) return;
    const el = $("creditScore");
    if (el) {
      el.value = String(n);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function applyDeepLink() {
    if (deepLinkBootstrapped) return;
    deepLinkBootstrapped = true;
    const p = new URLSearchParams(window.location.search);
    const address =
      p.get("address") || p.get("addr") || p.get("a") || "";
    const price = p.get("price") || p.get("p") || p.get("list_price") || "";
    const down = p.get("down") || p.get("down_percent") || "";
    const credit = p.get("credit") || p.get("credit_score") || "";

    if (address) {
      const field = $("propertyAddress");
      if (field) field.value = address;
      updateListingBanner();
    }
    if (price) setPriceFromParam(price);
    if (down) setDownFromParam(down);
    if (credit) setCreditFromParam(credit);

    recalculate();

    if (address && typeof window.MMG_lookupAddress === "function") {
      window.setTimeout(() => {
        window.MMG_lookupAddress();
        recalculate();
      }, 600);
    }

    if (p.get("step") === "payment" || p.get("quick") === "1") {
      if (price || Number($("homePrice")?.value) >= 50000) {
        window.setTimeout(() => showStep(TOTAL_STEPS - 1), 800);
      }
    }
  }

  function bindLiveUpdates() {
    document.addEventListener("mmg-calculated", updateLivePreview);
    document
      .querySelectorAll(
        "#homePrice, #homePriceInput, #downPercent, #downPercentInput, #downAmountInput, #creditScore, #loanProgram, #loanTerm, #interestRate, #propertyAddress"
      )
      .forEach((node) => {
        node.addEventListener("input", () => {
          window.requestAnimationFrame(recalculate);
        });
        node.addEventListener("change", () => {
          window.requestAnimationFrame(recalculate);
        });
      });
  }

  function bindWizard() {
    $("wizardNext")?.addEventListener("click", () => {
      if (currentStep < TOTAL_STEPS - 1) {
        if (!validateBeforeLeave(currentStep)) return;
        showStep(currentStep + 1);
      }
    });

    $("wizardBack")?.addEventListener("click", () => {
      if (currentStep > 0) showStep(currentStep - 1);
    });

    $("wizardSkipAddress")?.addEventListener("click", () => {
      const field = $("propertyAddress");
      if (field) field.value = "";
      updateListingBanner();
      $("homePriceInput")?.focus();
    });

    document.addEventListener("mmg-wizard-advance-after-address", () => {
      if (currentStep === 0) recalculate();
    });
  }

  function init() {
    if (!document.body.classList.contains("wizard-social")) return;
    bindWizard();
    bindLiveUpdates();
    showStep(0);
    window.setTimeout(applyDeepLink, 300);
    window.setTimeout(recalculate, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.MMG_wizardShowStep = showStep;
})();