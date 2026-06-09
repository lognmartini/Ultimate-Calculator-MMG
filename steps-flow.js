/**
 * Logan3 / Logan4 / Logan5 — social-first wizard (go.html, go4.html, go5.html).
 * Logan5: home → numbers → payment + what's next (combined).
 */
(function () {
  "use strict";

  const IS_LOGAN5 = document.body.classList.contains("logan5");
  const TOTAL_STEPS = 3;
  const STEP_LABELS = IS_LOGAN5
    ? ["This home", "Your numbers", "Your payment"]
    : ["This home", "Your numbers", "Your payment"];
  let currentStep = 0;
  let logan5SubView = null;
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

  function isLogan5PaymentRevealed() {
    return !IS_LOGAN5 || currentStep >= 2;
  }

  function isLogan5LiveRailVisible() {
    return IS_LOGAN5 && currentStep === 1;
  }

  function updateLiveRailVisibility() {
    if (!IS_LOGAN5) return;
    const rail = document.querySelector(".ultimate-live-rail");
    const showRail = isLogan5LiveRailVisible();
    document.body.classList.toggle("logan5-payment-hidden", !isLogan5PaymentRevealed());
    if (rail) {
      rail.classList.toggle("ultimate-live-rail-hidden", !showRail);
      rail.setAttribute("aria-hidden", showRail ? "false" : "true");
    }
  }

  function syncPaymentRateStrip() {
    if (!IS_LOGAN5) return;
    const market = $("ultimatePaymentMarketRate");
    const martini = $("ultimatePaymentMartiniRate");
    if (market) market.textContent = $("vsTypicalRate")?.textContent || $("marketRateDisplay")?.textContent || "—";
    if (martini) {
      const r = $("vsMartiniRate")?.textContent || $("interestRate")?.value;
      martini.textContent = r ? (String(r).includes("%") ? r : `${r}%`) : "—";
    }
  }

  function updateLivePreview() {
    const amount = $("wizardLivePayment");
    const note = $("wizardLiveNote");
    const piti = $("pitiPayment");
    if (!amount) return;

    if (!isLogan5PaymentRevealed()) {
      amount.textContent = "—";
      if (note) note.textContent = currentStep === 1 ? "Adjust sliders — tap See my payment" : "";
      $("wizardLivePreview")?.classList.remove("wizard-live-preview-ready");
      return;
    }

    const val = formatLivePayment(piti?.textContent);
    amount.textContent = val;
    if (note) {
      if (currentStep === TOTAL_STEPS - 1) {
        note.textContent = val !== "—" ? "Your estimate is ready" : "Calculating…";
      } else if (val !== "—") {
        note.textContent = "Updates as you adjust";
      } else {
        note.textContent = "Updates as you adjust";
      }
    }
    const preview = $("wizardLivePreview");
    if (preview) {
      preview.classList.toggle("wizard-live-preview-ready", val !== "—");
    }
    syncPaymentRateStrip();
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

  function showLogan5SubView(view) {
    if (!IS_LOGAN5 || currentStep !== TOTAL_STEPS - 1) return;
    logan5SubView = view;
    const paymentMain = $("ultimatePaymentMain");
    const hub = $("ultimateHubView");
    const compare = $("ultimateCompareView");
    const realtor = $("ultimateRealtorView");
    if (paymentMain) paymentMain.classList.toggle("hidden", view !== null);
    if (hub) hub.classList.toggle("hidden", view !== null);
    if (compare) compare.classList.toggle("hidden", view !== "compare");
    if (realtor) realtor.classList.toggle("hidden", view !== "realtor");
    document.body.classList.toggle("logan5-subview-active", view !== null);
    if (view === "compare" && typeof window.MMG_logan5_renderCreativeLoans === "function") {
      window.MMG_logan5_renderCreativeLoans();
    }
    updateNavButtons();
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      live.classList.toggle(
        "wizard-live-preview-results",
        IS_LOGAN5 ? currentStep >= 2 : currentStep === TOTAL_STEPS - 1
      );
    }
  }

  function updateNavButtons() {
    const next = $("wizardNext");
    const back = $("wizardBack");
    const navInner = $("wizardNavInner") || document.querySelector(".wizard-nav-inner");
    const nav = document.querySelector(".ultimate-wizard-nav");

    if (IS_LOGAN5 && currentStep === TOTAL_STEPS - 1) {
      if (logan5SubView) {
        if (back) {
          back.hidden = false;
          back.style.visibility = "visible";
          back.style.pointerEvents = "auto";
          const backText = back.querySelector(".btn-wizard-back-text");
          if (backText) backText.textContent = "Back to payment";
        }
        if (next) next.style.display = "none";
        if (navInner) navInner.classList.remove("wizard-nav-solo");
        if (nav) nav.classList.remove("wizard-nav-hidden");
        return;
      }
      if (next) next.style.display = "none";
      if (back) {
        back.hidden = false;
        back.style.visibility = "visible";
        back.style.pointerEvents = "auto";
        const backText = back.querySelector(".btn-wizard-back-text");
        if (backText) backText.textContent = "Back";
      }
      if (nav) nav.classList.remove("wizard-nav-hidden");
      return;
    }

    if (back) {
      if (IS_LOGAN5) {
        const onFirst = currentStep === 0;
        back.hidden = onFirst;
        back.style.visibility = onFirst ? "hidden" : "visible";
        back.style.pointerEvents = onFirst ? "none" : "auto";
        const backText = back.querySelector(".btn-wizard-back-text");
        if (backText) backText.textContent = "Back";
      } else {
        back.hidden = false;
        back.style.visibility = currentStep === 0 ? "hidden" : "visible";
        back.style.pointerEvents = currentStep === 0 ? "none" : "auto";
      }
    }

    if (!next) return;
    if (currentStep === TOTAL_STEPS - 1) {
      next.style.display = "none";
    } else {
      next.style.display = "";
      const text =
        next.querySelector(".btn-wizard-next-text") || next.querySelector(".btn-apply-text");
      if (!text) return;
      if (currentStep === 0) {
        text.textContent = "Next";
      } else if (IS_LOGAN5 && currentStep === 1) {
        text.textContent = "See my payment";
      } else if (currentStep === TOTAL_STEPS - 2) {
        text.textContent = "See payment";
      } else {
        text.textContent = "Next";
      }
    }

    if (navInner) {
      navInner.classList.toggle("wizard-nav-solo", currentStep === 0);
    }
    if (nav) nav.classList.remove("wizard-nav-hidden");

    document.body.classList.toggle("logan5-show-apply-everywhere", IS_LOGAN5 && currentStep >= 1);
  }

  function recalculate() {
    if (typeof window.MMG_calculate === "function") {
      window.MMG_calculate();
    }
    updateLivePreview();
    updateListingBanner();
    syncPaymentRateStrip();
  }

  function showStep(index) {
    currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, index));
    logan5SubView = null;
    document.body.classList.remove("logan5-subview-active");
    $("ultimatePaymentMain")?.classList.remove("hidden");
    $("ultimateHubView")?.classList.remove("hidden");
    $("ultimateCompareView")?.classList.add("hidden");
    $("ultimateRealtorView")?.classList.add("hidden");

    getSteps().forEach((el, i) => {
      const active = i === currentStep;
      el.classList.toggle("wizard-step-active", active);
      el.hidden = !active;
    });
    updateProgress();
    updateNavButtons();
    updateLiveRailVisibility();
    updateLivePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (IS_LOGAN5 && currentStep === 2) {
      document.body.classList.add("wizard-on-results");
      recalculate();
      window.dispatchEvent(new CustomEvent("mmg-wizard-results"));
      if (typeof window.MMG_logan5_renderCreativeLoans === "function") {
        window.MMG_logan5_renderCreativeLoans();
      }
    } else if (currentStep === TOTAL_STEPS - 1 && !IS_LOGAN5) {
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
    document.addEventListener("mmg-calculated", () => {
      updateLivePreview();
      syncPaymentRateStrip();
    });
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
      if (IS_LOGAN5 && currentStep === TOTAL_STEPS - 1 && logan5SubView) {
        showLogan5SubView(null);
        return;
      }
      if (currentStep > 0) showStep(currentStep - 1);
    });

    $("wizardSkipAddress")?.addEventListener("click", () => {
      const field = $("propertyAddress");
      if (field) field.value = "";
      updateListingBanner();
      $("homePriceInput")?.focus();
    });

    $("ultimateHubCompare")?.addEventListener("click", () => showLogan5SubView("compare"));
    $("ultimateHubRealtor")?.addEventListener("click", () => showLogan5SubView("realtor"));
    $("ultimateCompareBack")?.addEventListener("click", () => showLogan5SubView(null));
    $("ultimateRealtorBack")?.addEventListener("click", () => showLogan5SubView(null));

    document.addEventListener("mmg-wizard-advance-after-address", () => {
      if (currentStep === 0) recalculate();
    });
  }

  function init() {
    if (!document.body.classList.contains("wizard-social")) return;
    bindWizard();
    bindLiveUpdates();
    updateLiveRailVisibility();
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
  window.MMG_logan5_showSubView = showLogan5SubView;
})();