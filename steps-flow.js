/**
 * Logan3 / Logan4 / Logan5 wizard navigation.
 * Guided go5: multi-step purchase/refi flow with branching.
 */
(function () {
  "use strict";

  const IS_LOGAN5 = document.body.classList.contains("logan5");
  const IS_GUIDED = document.body.classList.contains("guided-flow");

  const GUIDED_LABELS_PURCHASE = [
    "Start",
    "Address?",
    "Property",
    "Price",
    "Loan",
    "Rate",
    "Estimate",
  ];
  const GUIDED_LABELS_REFI = [
    "Start",
    "Goal",
    "Property",
    "Value",
    "Equity",
    "Rate",
    "Estimate",
  ];

  const LEGACY_LABELS = IS_LOGAN5
    ? ["This home", "Your numbers", "Your payment"]
    : ["This home", "Your numbers", "Your payment"];

  function getSteps() {
    return Array.from(document.querySelectorAll(".wizard-step")).sort(
      (a, b) => Number(a.getAttribute("data-step") || 0) - Number(b.getAttribute("data-step") || 0)
    );
  }

  const TOTAL_STEPS = IS_GUIDED ? Math.max(7, getSteps().length || 7) : 3;
  function getStepLabels() {
    if (!IS_GUIDED) return LEGACY_LABELS;
    return getLoanGoal() === "refinance" ? GUIDED_LABELS_REFI : GUIDED_LABELS_PURCHASE;
  }

  let currentStep = 0;
  let logan5SubView = null;
  let deepLinkBootstrapped = false;

  function $(id) {
    return document.getElementById(id);
  }

  function resultsStepIndex() {
    return IS_GUIDED ? TOTAL_STEPS - 1 : 2;
  }

  function getLoanGoal() {
    return document.body.dataset.loanGoal === "refinance" ? "refinance" : "purchase";
  }

  function getHasAddress() {
    if (getLoanGoal() === "refinance") return "yes";
    return document.body.dataset.hasAddress || "";
  }

  function isStepSkipped(index) {
    if (!IS_GUIDED) return false;
    // Step 1 is always used: purchase = has-address; refinance = refi goal
    // Step 2 (address) skipped if purchase + no address
    if (index === 2 && getLoanGoal() === "purchase" && getHasAddress() === "no") return true;
    // Refinance always has a property (existing home) — still can skip lookup if they choose later
    return false;
  }

  // Guided path:
  // purchase: 0 goal → 1 has-address? → 2 address → 3 price → 4 you+down → 5 credit → 6 results
  // refinance: 0 goal → 1 refi-goal → 2 address → 3 value → 4 equity → 5 credit → 6 results

  function nextValidStep(from) {
    let i = from + 1;
    while (i < TOTAL_STEPS && isStepSkipped(i)) i += 1;
    return Math.min(TOTAL_STEPS - 1, i);
  }

  function prevValidStep(from) {
    let i = from - 1;
    while (i > 0 && isStepSkipped(i)) i -= 1;
    return Math.max(0, i);
  }

  function formatLivePayment(text) {
    const t = (text || "").trim();
    return t && t !== "—" && t !== "$0" ? t : "—";
  }

  function isLogan5PaymentRevealed() {
    if (!IS_LOGAN5) return true;
    return currentStep >= resultsStepIndex();
  }

  function isLogan5LiveRailVisible() {
    if (!IS_LOGAN5) return false;
    // Side rail after price is set; still useful on results for desktop
    if (IS_GUIDED) return currentStep >= 3;
    return currentStep === 1;
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

    if (!isLogan5PaymentRevealed() && !(IS_GUIDED && currentStep >= 3)) {
      amount.textContent = "—";
      if (note) {
        note.textContent =
          currentStep <= 1
            ? "Answer a few questions to get started"
            : currentStep === 2
              ? "Look up the property or continue"
              : currentStep === 3
                ? "Set your price, then loan details"
                : "Almost there — finish loan details";
      }
      $("wizardLivePreview")?.classList.remove("wizard-live-preview-ready");
      return;
    }

    // On mid guided steps, still show live calc if possible
    const val = formatLivePayment(piti?.textContent);
    amount.textContent = val;
    if (note) {
      if (currentStep === resultsStepIndex()) {
        note.textContent = val !== "—" ? "Your estimate is ready" : "Calculating…";
      } else if (val !== "—") {
        note.textContent = "Live as you adjust";
      } else {
        note.textContent = "Keep going — your payment gets clearer each step";
      }
    }
    $("wizardLivePreview")?.classList.toggle("wizard-live-preview-ready", val !== "—");
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
    if (!IS_LOGAN5) return;
    // Realtor quiz can open from the side rail on any guided step
    const allowAnytime = IS_GUIDED && view === "realtor";
    if (currentStep !== resultsStepIndex() && !allowAnytime && view !== null) {
      // Jump to results first for compare
      if (view === "compare") {
        showStep(resultsStepIndex());
        window.setTimeout(() => showLogan5SubView("compare"), 50);
      }
      return;
    }
    logan5SubView = view;
    const paymentMain = $("ultimatePaymentMain");
    const hub = $("ultimateHubView");
    const compare = $("ultimateCompareView");
    const realtor = $("ultimateRealtorView");
    if (view === "realtor" && IS_GUIDED) {
      // Overlay mode: don't hide main payment card if not on results
      if (realtor) {
        realtor.classList.remove("hidden");
        realtor.classList.add("guided-realtor-overlay");
      }
      if (compare) compare.classList.add("hidden");
      document.body.classList.add("logan5-subview-active", "guided-realtor-open");
      updateNavButtons();
      return;
    }
    if (realtor) realtor.classList.remove("guided-realtor-overlay");
    document.body.classList.remove("guided-realtor-open");
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

    // Progress based on visible path steps only
    const path = [];
    for (let i = 0; i < TOTAL_STEPS; i++) {
      if (!isStepSkipped(i)) path.push(i);
    }
    const pathPos = Math.max(0, path.indexOf(currentStep));
    const pathLen = Math.max(1, path.length);
    const pct = ((pathPos + 1) / pathLen) * 100;

    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `Step ${pathPos + 1} of ${pathLen}`;
    if (ctx) ctx.textContent = getStepLabels()[currentStep] || "Estimate";
    document.body.dataset.wizardStep = String(currentStep + 1);

    const list = $("guidedProgressSteps");
    if (list) {
      list.innerHTML = path
        .map((stepIdx, pos) => {
          const active = stepIdx === currentStep;
          const done = stepIdx < currentStep;
          const cls = active ? "is-active" : done ? "is-done" : "";
          return `<li class="guided-progress-step ${cls}" data-guided-step="${stepIdx}">
            <span class="guided-progress-num">${pos + 1}</span>
            <span class="guided-progress-label">${getStepLabels()[stepIdx] || ""}</span>
          </li>`;
        })
        .join("");
    } else {
      document.querySelectorAll(".guided-progress-step").forEach((el) => {
        const i = Number(el.getAttribute("data-guided-step") || "0");
        el.classList.toggle("is-active", i === currentStep);
        el.classList.toggle("is-done", i < currentStep);
        el.classList.toggle("is-skipped", isStepSkipped(i));
      });
    }

    const live = $("wizardLivePreview");
    if (live) {
      live.classList.toggle("wizard-live-preview-results", currentStep === resultsStepIndex());
    }
  }

  function updateNavButtons() {
    const next = $("wizardNext");
    const back = $("wizardBack");
    const navInner = $("wizardNavInner") || document.querySelector(".wizard-nav-inner");
    const nav = document.querySelector(".ultimate-wizard-nav");

    // Choice steps: hide Continue until selection (or show Continue that validates)
    const onChoice = IS_GUIDED && (currentStep === 0 || currentStep === 1);
    // results is last guided step (index 5)

    if (IS_LOGAN5 && currentStep === resultsStepIndex()) {
      if (logan5SubView) {
        if (back) {
          back.hidden = false;
          back.style.visibility = "visible";
          back.style.pointerEvents = "auto";
          const backText = back.querySelector(".btn-wizard-back-text");
          if (backText) backText.textContent = "Back to estimate";
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
      const onFirst = currentStep === 0;
      back.hidden = onFirst;
      back.style.visibility = onFirst ? "hidden" : "visible";
      back.style.pointerEvents = onFirst ? "none" : "auto";
      const backText = back.querySelector(".btn-wizard-back-text");
      if (backText) backText.textContent = "Back";
    }

    if (next) {
      next.style.display = onChoice ? "none" : "";
      const text =
        next.querySelector(".btn-wizard-next-text") || next.querySelector(".btn-apply-text");
      if (text) {
        if (currentStep === resultsStepIndex() - 1) {
          text.textContent = "See my estimate";
        } else if (IS_GUIDED && currentStep === 2) {
          text.textContent = "Continue to price";
        } else if (IS_GUIDED && currentStep === 3) {
          text.textContent = "Continue to loan options";
        } else if (IS_GUIDED && currentStep === 4) {
          text.textContent = "Continue to credit & rate";
        } else {
          text.textContent = "Continue";
        }
      }
    }

    if (navInner) {
      navInner.classList.toggle("wizard-nav-solo", currentStep === 0 || onChoice);
    }
    if (nav) nav.classList.remove("wizard-nav-hidden");

    document.body.classList.toggle(
      "logan5-show-apply-everywhere",
      IS_LOGAN5 && currentStep >= (IS_GUIDED ? 3 : 1)
    );
  }

  function recalculate() {
    if (typeof window.MMG_calculate === "function") {
      window.MMG_calculate();
    }
    updateLivePreview();
    updateListingBanner();
    syncPaymentRateStrip();
  }

  function applyGoalCopy() {
    const goal = getLoanGoal();
    const isRefi = goal === "refinance";
    const priceTitle = $("step-price-title");
    const priceLead = $("step-price-lead");
    const priceLabel = $("homePriceLabel");
    const addrTitle = $("step-addr-title");
    const addrLead = $("step-addr-lead");
    const downTitle = $("step-down-title");
    const downLead = $("step-down-lead");
    const resultsTitle = $("step-results-title");
    const resultsEyebrow = document.querySelector(".guided-results-eyebrow");

    // Toggle step-1 purchase vs refinance branches
    const purchaseBranch = $("guidedPurchaseBranch");
    const refiBranch = $("guidedRefiBranch");
    if (purchaseBranch && refiBranch) {
      purchaseBranch.classList.toggle("hidden", isRefi);
      purchaseBranch.hidden = isRefi;
      refiBranch.classList.toggle("hidden", !isRefi);
      refiBranch.hidden = !isRefi;
    }
    document.body.classList.toggle("guided-is-refinance", isRefi);
    document.body.classList.toggle("guided-is-purchase", !isRefi);

    if (priceTitle) {
      priceTitle.textContent = isRefi ? "What is the home worth today?" : "Set the purchase price";
    }
    if (priceLead) {
      priceLead.textContent = isRefi
        ? "Use a realistic market value (or appraisal estimate). You can adjust anytime."
        : "Drag the slider or type a number. You can change this anytime.";
    }
    if (priceLabel) priceLabel.textContent = isRefi ? "Home value" : "Purchase price";
    if (addrTitle) {
      addrTitle.textContent = isRefi ? "Where is the home you own?" : "What’s the address?";
    }
    if (addrLead) {
      addrLead.textContent = isRefi
        ? "Any U.S. address works. We’ll estimate taxes & insurance for that location when available."
        : "Search any U.S. listing. We’ll pull taxes and insurance when available — you stay in control.";
    }
    if (downTitle) {
      downTitle.textContent = isRefi ? "Your equity (as % of value)" : "Cash down";
    }
    if (downLead) {
      downLead.textContent = isRefi
        ? "Equity ≈ down payment %. Example: 20% equity means ~80% loan-to-value (LTV)."
        : "Quick chips or drag the slider. Lower down can mean PMI on conventional.";
    }
    if (resultsTitle) {
      resultsTitle.textContent = isRefi
        ? "Here’s your refinance payment estimate"
        : "Here’s your monthly payment";
    }
    if (resultsEyebrow) {
      resultsEyebrow.textContent = isRefi
        ? "Refinance scenario · educational"
        : "Your personalized estimate";
    }
  }

  /**
   * Apply refinance goal presets (educational — not underwriting).
   * lower-payment → 30yr, keep equity
   * cash-out → slightly lower equity (higher LTV) to model cash out
   * shorten-term → 15yr
   * remove-pmi → force ≥20% equity
   */
  function applyRefiGoalPreset(goalId) {
    document.body.dataset.refiGoal = goalId || "";
    const term = $("loanTerm");
    const down = $("downPercent");
    const downInput = $("downPercentInput");

    const setDown = (pct) => {
      if (!down) return;
      down.min = "0";
      down.max = "50";
      down.value = String(pct);
      if (downInput) downInput.value = String(pct);
      down.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof window.MMG_guided_paintDownSlider === "function") {
        window.MMG_guided_paintDownSlider();
      }
    };
    const setTerm = (years) => {
      if (!term) return;
      term.value = String(years);
      term.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelectorAll(".ultimate-term-btn").forEach((btn) => {
        const on = Number(btn.getAttribute("data-term")) === years;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
    };

    if (goalId === "lower-payment") {
      setTerm(30);
      // Keep current equity; slight nudge toward 20% if very low
      const cur = Number(down?.value || 20);
      if (cur < 5) setDown(20);
    } else if (goalId === "cash-out") {
      setTerm(30);
      // Model taking cash while staying near conventional LTV comfort (~75–80%)
      setDown(25);
    } else if (goalId === "shorten-term") {
      setTerm(15);
      const cur = Number(down?.value || 20);
      if (cur < 10) setDown(20);
    } else if (goalId === "remove-pmi") {
      setTerm(30);
      setDown(20); // ~80% LTV — educational PMI removal threshold
    }
    recalculate();
  }

  window.MMG_guided_applyRefiGoal = applyRefiGoalPreset;

  function showStep(index) {
    // Snap to non-skipped step
    let target = Math.max(0, Math.min(TOTAL_STEPS - 1, index));
    while (isStepSkipped(target) && target < TOTAL_STEPS - 1) target += 1;
    while (isStepSkipped(target) && target > 0) target -= 1;

    currentStep = target;
    logan5SubView = null;
    document.body.classList.remove("logan5-subview-active");
    $("ultimatePaymentMain")?.classList.remove("hidden");
    $("ultimateHubView")?.classList.remove("hidden");
    $("ultimateCompareView")?.classList.add("hidden");
    $("ultimateRealtorView")?.classList.add("hidden");

    applyGoalCopy();

    getSteps().forEach((el) => {
      const stepIdx = Number(el.getAttribute("data-step") || 0);
      const active = stepIdx === currentStep;
      el.classList.remove("wizard-step-active");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      if (active) {
        el.classList.add("wizard-step-active");
        el.hidden = false;
        el.setAttribute("aria-hidden", "false");
      }
    });

    updateProgress();
    updateNavButtons();
    updateLiveRailVisibility();
    updateLivePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (currentStep === resultsStepIndex()) {
      document.body.classList.add("wizard-on-results");
      recalculate();
      window.dispatchEvent(new CustomEvent("mmg-wizard-results"));
      if (typeof window.MMG_logan5_renderCreativeLoans === "function") {
        window.MMG_logan5_renderCreativeLoans();
      }
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
    if (!IS_GUIDED) {
      if (stepIndex === 0) {
        const price = Number($("homePrice")?.value || 0);
        if (price < 50000) {
          $("homePriceInput")?.focus();
          return false;
        }
      }
      return true;
    }

    if (stepIndex === 0) {
      if (!document.body.dataset.loanGoal) {
        document.querySelector(".guided-choice-grid")?.classList.add("guided-shake");
        window.setTimeout(() => document.querySelector(".guided-choice-grid")?.classList.remove("guided-shake"), 500);
        return false;
      }
    }
    if (stepIndex === 1) {
      if (getLoanGoal() === "purchase" && !getHasAddress()) {
        $("guidedPurchaseBranch")?.classList.add("guided-shake");
        window.setTimeout(() => $("guidedPurchaseBranch")?.classList.remove("guided-shake"), 500);
        return false;
      }
      if (getLoanGoal() === "refinance" && !document.body.dataset.refiGoal) {
        $("guidedRefiBranch")?.classList.add("guided-shake");
        window.setTimeout(() => $("guidedRefiBranch")?.classList.remove("guided-shake"), 500);
        return false;
      }
    }
    if (stepIndex === 2) {
      // address optional if they skip; allow continue
      return true;
    }
    if (stepIndex === 3) {
      const price = Number($("homePrice")?.value || 0);
      if (price < 50000) {
        $("homePriceInput")?.focus();
        $("homePriceInput")?.classList.add("input-error-flash");
        setTimeout(() => $("homePriceInput")?.classList.remove("input-error-flash"), 1200);
        return false;
      }
    }
    // step 4 loan details — always OK to leave (defaults apply)
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

  function jumpToPaymentStep(opts) {
    const price = Number($("homePrice")?.value || 0);
    if (price < 50000) return;
    if (opts?.instant) document.body.dataset.instantLanding = "1";
    // For guided, ensure goal/address defaults for deep links
    if (IS_GUIDED) {
      if (!document.body.dataset.loanGoal) document.body.dataset.loanGoal = "purchase";
      if (!document.body.dataset.hasAddress) {
        document.body.dataset.hasAddress = $("propertyAddress")?.value?.trim() ? "yes" : "no";
      }
    }
    showStep(resultsStepIndex());
  }

  function applyDeepLink() {
    if (deepLinkBootstrapped) return;
    deepLinkBootstrapped = true;
    const p = new URLSearchParams(window.location.search);
    const address = p.get("address") || p.get("addr") || p.get("a") || "";
    const price = p.get("price") || p.get("p") || p.get("list_price") || "";
    const down = p.get("down") || p.get("down_percent") || "";
    const credit = p.get("credit") || p.get("credit_score") || "";
    const program = p.get("program") || p.get("loan_program") || "";
    const goal = p.get("goal") || p.get("loan_goal") || "";
    const instant = p.get("instant") === "1" || p.get("listing") === "1";
    const jumpPayment =
      instant ||
      p.get("quick") === "1" ||
      (p.get("step") === "payment" && (price || address));

    if (goal === "refinance" || goal === "purchase") {
      document.body.dataset.loanGoal = goal;
    }
    if (address) {
      document.body.dataset.hasAddress = "yes";
      document.body.dataset.loanGoal = document.body.dataset.loanGoal || "purchase";
      const field = $("propertyAddress");
      if (field) field.value = address;
      updateListingBanner();
    } else if (price && !address) {
      document.body.dataset.loanGoal = document.body.dataset.loanGoal || "purchase";
      document.body.dataset.hasAddress = "no";
    }
    if (price) setPriceFromParam(price);
    if (down) setDownFromParam(down);
    if (credit) setCreditFromParam(credit);
    if (program) {
      const progEl = $("loanProgram");
      const allowed = ["conventional", "fha", "va", "usda"];
      if (progEl && allowed.includes(program)) {
        if (typeof window.MMG_logan5_setProgram === "function") {
          window.MMG_logan5_setProgram(program, true);
        } else {
          progEl.value = program;
          progEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }

    recalculate();

    if (address && typeof window.MMG_lookupAddress === "function") {
      window.setTimeout(() => {
        window.MMG_lookupAddress();
        recalculate();
      }, 600);
    }

    if (!jumpPayment) {
      // Land on the right early step
      if (IS_GUIDED && (address || price)) {
        if (address) showStep(2);
        else showStep(3);
      }
      return;
    }

    const tryJump = () => jumpToPaymentStep({ instant, listing: p.get("listing") === "1" || instant });
    if (address && !price) {
      let jumped = false;
      const onResolved = () => {
        if (jumped) return;
        jumped = true;
        document.removeEventListener("mmg-property-resolved", onResolved);
        recalculate();
        window.setTimeout(tryJump, 200);
      };
      document.addEventListener("mmg-property-resolved", onResolved);
      window.setTimeout(() => {
        if (jumped) return;
        jumped = true;
        document.removeEventListener("mmg-property-resolved", onResolved);
        tryJump();
      }, 4000);
      return;
    }
    if (price || Number($("homePrice")?.value) >= 50000) {
      window.setTimeout(tryJump, instant ? 350 : 800);
    }
  }

  function bindLiveUpdates() {
    document.addEventListener("mmg-calculated", () => {
      updateLivePreview();
      syncPaymentRateStrip();
    });
    document
      .querySelectorAll(
        "#homePrice, #homePriceInput, #downPercent, #downPercentInput, #downAmountInput, #creditScore, #loanProgram, #loanTerm, #interestRate, #propertyAddress, #propertyTax, #homeInsurance, #hoa"
      )
      .forEach((node) => {
        node.addEventListener("input", () => window.requestAnimationFrame(recalculate));
        node.addEventListener("change", () => window.requestAnimationFrame(recalculate));
      });
  }

  function bindWizard() {
    $("wizardNext")?.addEventListener("click", () => {
      if (currentStep < TOTAL_STEPS - 1) {
        if (!validateBeforeLeave(currentStep)) return;
        showStep(nextValidStep(currentStep));
      }
    });

    $("wizardBack")?.addEventListener("click", () => {
      if (IS_LOGAN5 && currentStep === resultsStepIndex() && logan5SubView) {
        showLogan5SubView(null);
        return;
      }
      if (currentStep > 0) showStep(prevValidStep(currentStep));
    });

    $("wizardSkipAddress")?.addEventListener("click", () => {
      const field = $("propertyAddress");
      if (field) field.value = "";
      document.body.dataset.hasAddress = "no";
      updateListingBanner();
      showStep(3); // price step
    });

    // Live insurance re-estimate when credit changes (guided)
    $("creditScore")?.addEventListener("change", () => {
      if (IS_GUIDED && typeof window.MMG_guided_refreshInsurance === "function") {
        window.MMG_guided_refreshInsurance();
      }
    });
    $("creditScore")?.addEventListener("input", () => {
      if (IS_GUIDED && typeof window.MMG_guided_refreshInsurance === "function") {
        window.MMG_guided_refreshInsurance({ quiet: true });
      }
    });

    $("ultimateHubCompare")?.addEventListener("click", () => showLogan5SubView("compare"));
    $("ultimateHubRealtor")?.addEventListener("click", () => showLogan5SubView("realtor"));
    $("ultimateCompareBack")?.addEventListener("click", () => showLogan5SubView(null));
    $("ultimateRealtorBack")?.addEventListener("click", () => showLogan5SubView(null));

    document.addEventListener("mmg-wizard-advance-after-address", () => {
      recalculate();
    });
  }

  function init() {
    if (!document.body.classList.contains("wizard-social")) return;
    bindWizard();
    bindLiveUpdates();
    updateLiveRailVisibility();
    const p = new URLSearchParams(window.location.search);
    const skipWizard =
      p.get("instant") === "1" ||
      p.get("listing") === "1" ||
      p.get("quick") === "1" ||
      (p.get("step") === "payment" && (p.get("price") || p.get("address") || p.get("addr") || p.get("a")));
    if (!skipWizard) {
      ["instant", "listing", "quick", "step"].forEach((k) => {
        if (p.has(k)) {
          p.delete(k);
          try {
            const clean = `${window.location.pathname}${p.toString() ? `?${p}` : ""}${window.location.hash}`;
            history.replaceState(null, "", clean);
          } catch {
            /* ignore */
          }
        }
      });
    }
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
  window.MMG_guided_next = () => showStep(nextValidStep(currentStep));
  window.MMG_guided_setGoal = (goal) => {
    document.body.dataset.loanGoal = goal === "refinance" ? "refinance" : "purchase";
    if (goal === "refinance") document.body.dataset.hasAddress = "yes";
  };
  window.MMG_guided_setHasAddress = (v) => {
    document.body.dataset.hasAddress = v === "yes" ? "yes" : "no";
  };
})();
