/**
 * Logan3 / Logan4 / Logan5 wizard navigation.
 * Guided go5: multi-step purchase/refi flow with branching.
 */
(function () {
  "use strict";

  const IS_LOGAN5 = document.body.classList.contains("logan5");
  const IS_GUIDED = document.body.classList.contains("guided-flow");

  // Align with page H1 intent (progress line: "Step X of Y · Label")
  // 6 steps after combining price + loan: Goal → … → Price & loan → Credit → Estimate
  const GUIDED_LABELS_PURCHASE = [
    "Goal",
    "Property?",
    "Address",
    "Price & loan",
    "Credit",
    "Estimate",
  ];
  const GUIDED_LABELS_REFI = [
    "Goal",
    "Refi goal",
    "Address",
    "Value & loan",
    "Credit",
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

  const TOTAL_STEPS = IS_GUIDED ? Math.max(6, getSteps().length || 6) : 3;
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

  // Guided path (price + loan combined):
  // purchase: 0 goal → 1 has-address? → 2 address → 3 price+loan → 4 credit → 5 results
  // refinance: 0 goal → 1 refi-goal → 2 address → 3 value+loan → 4 credit → 5 results

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

  /** True once user is on price+ step with a valid purchase price (≥ $50k). */
  function hasPurchasePriceSet() {
    const price = Number($("homePrice")?.value || 0);
    return Number.isFinite(price) && price >= 50000;
  }

  function isLogan5LiveRailVisible() {
    if (!IS_LOGAN5) return false;
    // Guided: never show mid-flow live card — payment climax is results only
    if (IS_GUIDED) return false;
    return currentStep === 1;
  }

  function updateLiveRailVisibility() {
    if (!IS_LOGAN5) return;
    const rail = document.querySelector(".ultimate-live-rail");
    const showRail = isLogan5LiveRailVisible();
    document.body.classList.toggle("logan5-payment-hidden", !showRail);
    document.body.classList.toggle("guided-live-active", false);
    document.body.classList.toggle("guided-live-waiting", IS_GUIDED);
    document.body.classList.toggle("guided-no-live-rail", IS_GUIDED);
    if (rail) {
      rail.classList.toggle("ultimate-live-rail-hidden", !showRail);
      rail.hidden = !showRail;
      rail.setAttribute("aria-hidden", showRail ? "false" : "true");
    }
    const mobileRealtor = $("guidedRealtorMobileEntry");
    if (mobileRealtor) {
      mobileRealtor.classList.remove("guided-realtor-above-live");
      mobileRealtor.hidden = true;
    }
  }

  function syncPaymentRateStrip() {
    if (!IS_LOGAN5) return;
    const market = $("ultimatePaymentMarketRate");
    const martini = $("ultimatePaymentMartiniRate");
    const typicalText =
      $("vsTypicalRate")?.textContent || $("marketRateDisplay")?.textContent || "—";
    const martiniText = (() => {
      const r = $("vsMartiniRate")?.textContent || $("interestRate")?.value;
      return r ? (String(r).includes("%") ? r : `${r}%`) : "—";
    })();
    if (market) market.textContent = typicalText;
    if (martini) martini.textContent = martiniText;
    // Credit-step read-only Martini rate display
    const slim = $("guidedMartiniRateDisplay");
    if (slim) {
      const ir = $("interestRate")?.value;
      slim.textContent = ir ? (String(ir).includes("%") ? ir : `${ir}%`) : "—";
    }
    // Live card rate pair
    const liveM = $("guidedLiveMartiniRate");
    const liveT = $("guidedLiveTypicalRate");
    if (liveM) liveM.textContent = martiniText;
    if (liveT) liveT.textContent = typicalText;
  }

  let lastLivePaymentKey = "";

  function setLiveText(id, text) {
    const el = $(id);
    if (!el) return;
    const next = text || "—";
    if (el.textContent !== next) el.textContent = next;
  }

  function flashLiveCard() {
    const card = $("wizardLivePreview");
    if (!card) return;
    card.classList.remove("guided-live-flash");
    // force reflow for re-trigger
    void card.offsetWidth;
    card.classList.add("guided-live-flash");
    window.setTimeout(() => card.classList.remove("guided-live-flash"), 450);
  }

  function updateLivePreview() {
    const amount = $("wizardLivePayment");
    const note = $("wizardLiveNote");
    if (!amount) return;

    const price = Number($("homePrice")?.value || 0);
    const ready = Number.isFinite(price) && price >= 50000;

    // Prefer engine outputs (kept in sync by MMG_calculate)
    const totalEl = $("totalPayment");
    const pitiEl = $("pitiPayment");
    // Guided results hero may overwrite pitiPayment with totalMonthly — totalPayment is always all-in
    let totalText = formatLivePayment(totalEl?.textContent);
    if (totalText === "—" || totalText === "$0") {
      totalText = formatLivePayment(pitiEl?.textContent);
    }

    const pi = formatLivePayment($("piPayment")?.textContent);
    const tax = formatLivePayment($("taxPayment")?.textContent);
    const ins = formatLivePayment($("insurancePayment")?.textContent);
    const pmi = formatLivePayment($("pmiPayment")?.textContent);
    const hoa = formatLivePayment($("hoaPayment")?.textContent);
    const pmiRowHidden = $("pmiRow")?.classList.contains("hidden");
    const hoaRowHidden = $("hoaRow")?.classList.contains("hidden");

    $("wizardLivePreview")?.classList.remove("wizard-live-preview-deferred");

    if (!ready || totalText === "—") {
      amount.textContent = "—";
      setLiveText("livePi", "—");
      setLiveText("liveTax", "—");
      setLiveText("liveIns", "—");
      setLiveText("livePmi", "—");
      setLiveText("liveHoa", "—");
      setLiveText("liveTotal", "—");
      $("livePmiRow")?.classList.add("hidden");
      $("liveHoaRow")?.classList.add("hidden");
      if (note) {
        note.textContent =
          currentStep <= 1
            ? "Updates as you go"
            : "Set price $50k+ for estimate";
      }
      $("wizardLivePreview")?.classList.remove("wizard-live-preview-ready");
      syncPaymentRateStrip();
      return;
    }

    const prev = amount.textContent;
    amount.textContent = totalText;
    setLiveText("livePi", pi);
    setLiveText("liveTax", tax);
    setLiveText("liveIns", ins);
    setLiveText("liveTotal", totalText);

    const pmiRow = $("livePmiRow");
    if (pmiRow) {
      const showPmi = !pmiRowHidden && pmi !== "—" && pmi !== "$0";
      pmiRow.classList.toggle("hidden", !showPmi);
      if (showPmi) {
        setLiveText("livePmi", pmi);
        const lbl = $("livePmiLabel");
        if (lbl) lbl.textContent = $("pmiRowLabel")?.textContent || "PMI / MI";
      }
    }
    const hoaRow = $("liveHoaRow");
    if (hoaRow) {
      const showHoa = !hoaRowHidden && hoa !== "—" && hoa !== "$0";
      hoaRow.classList.toggle("hidden", !showHoa);
      if (showHoa) setLiveText("liveHoa", hoa);
    }

    if (note) {
      if (currentStep >= resultsStepIndex()) {
        note.textContent = "Full estimate ready";
      } else {
        note.textContent = "Live · educational";
      }
    }

    $("wizardLivePreview")?.classList.toggle("wizard-live-preview-ready", true);

    const key = [
      totalText,
      pi,
      tax,
      ins,
      pmi,
      hoa,
      $("interestRate")?.value,
      $("loanProgram")?.value,
      $("downPercent")?.value,
      $("homePrice")?.value,
      $("creditScore")?.value,
      $("loanTerm")?.value,
      $("propertyTax")?.value,
      $("homeInsurance")?.value,
      $("hoa")?.value,
    ].join("|");
    if (lastLivePaymentKey && lastLivePaymentKey !== key) {
      flashLiveCard();
      amount.classList.remove("guided-live-amount-tick");
      void amount.offsetWidth;
      amount.classList.add("guided-live-amount-tick");
      window.setTimeout(() => amount.classList.remove("guided-live-amount-tick"), 450);
      // Brief “Updated” cue on the note for responsiveness
      if (note && currentStep < resultsStepIndex()) {
        const prevNote = note.textContent;
        note.textContent = "Updated";
        note.classList.add("guided-live-note-flash");
        window.setTimeout(() => {
          note.classList.remove("guided-live-note-flash");
          if (note.textContent === "Updated") {
            note.textContent = prevNote || "Live · educational";
          }
        }, 700);
      }
    }
    lastLivePaymentKey = key;

    // Keep mini stats in sync with current inputs
    const priceDisp = $("homePriceDisplay")?.textContent || $("homePriceInput")?.value;
    const downDisp =
      $("downDisplay")?.textContent?.split("·")[0]?.trim() ||
      `${$("downPercent")?.value || "—"}%`;
    const rateVal = $("interestRate")?.value;
    if ($("ultimateLivePrice") && priceDisp) $("ultimateLivePrice").textContent = priceDisp;
    if ($("ultimateLiveDown")) $("ultimateLiveDown").textContent = downDisp;
    if ($("ultimateLiveRate") && rateVal) {
      $("ultimateLiveRate").textContent = String(rateVal).includes("%")
        ? rateVal
        : `${rateVal}%`;
    }

    syncPaymentRateStrip();
    if (currentStep >= resultsStepIndex()) syncLifetimeProofLine();
  }

  /** Always surface one above-the-fold savings proof when available */
  function syncLifetimeProofLine() {
    const line = $("guidedLifetimeLine");
    const valEl = $("guidedLifetimeSave");
    const labelEl = line?.querySelector(".guided-lifetime-label");
    if (!line || currentStep < resultsStepIndex()) {
      line?.classList.add("hidden");
      return;
    }

    const lifetime = $("vsLifetimeInterestSave")?.textContent?.trim() || "";
    const monthly = $("leadSavingsAmount")?.textContent?.trim() || "";
    const monthlyRow = $("leadMonthlySavingsRow");
    const ribbon = $("leadSavingsRibbon");
    const monthlyVisible =
      ribbon &&
      !ribbon.classList.contains("hidden") &&
      monthlyRow &&
      !monthlyRow.classList.contains("hidden");

    const ok = (t) =>
      t && t !== "—" && t !== "$0" && !/^\$?0(\.00)?$/.test(String(t).replace(/,/g, ""));

    // Prefer monthly if ribbon not already showing it; else lifetime
    if (!monthlyVisible && ok(monthly)) {
      line.classList.remove("hidden");
      if (labelEl) labelEl.textContent = "Potential monthly savings";
      if (valEl) valEl.textContent = `${monthly}/mo`;
      return;
    }
    if (ok(lifetime)) {
      line.classList.remove("hidden");
      if (labelEl) labelEl.textContent = "Est. interest saved over term";
      if (valEl) valEl.textContent = lifetime;
      return;
    }
    line.classList.add("hidden");
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
        realtor.hidden = false;
        realtor.classList.add("guided-realtor-overlay");
      }
      if (compare) compare.classList.add("hidden");
      document.body.classList.add("logan5-subview-active", "guided-realtor-open");
      document.body.classList.add("guided-realtor-open");
      // Lock background scroll while overlay open
      document.documentElement.style.overflow = "hidden";
      window.setTimeout(() => {
        try {
          $("realtorEmail")?.focus({ preventScroll: true });
        } catch {
          $("realtorEmail")?.focus();
        }
      }, 80);
      updateNavButtons();
      return;
    }
    document.documentElement.style.overflow = "";
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
    const line = $("wizardProgressLine");
    const bar = $("wizardProgressBar");
    const progressRoot = $("guidedProgress");

    // Progress based on visible path steps only
    const path = [];
    for (let i = 0; i < TOTAL_STEPS; i++) {
      if (!isStepSkipped(i)) path.push(i);
    }
    const pathPos = Math.max(0, path.indexOf(currentStep));
    const pathLen = Math.max(1, path.length);
    const onResults = currentStep === resultsStepIndex();
    const pct = onResults ? 100 : Math.round(((pathPos + 1) / pathLen) * 100);
    const stepLabel = onResults ? "Complete" : getStepLabels()[currentStep] || "Estimate";
    const stepText = onResults ? "Complete" : `Step ${pathPos + 1} of ${pathLen}`;

    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = stepText;
    if (ctx) ctx.textContent = stepLabel;
    if (line) {
      line.textContent = onResults ? "Complete · Your estimate" : `${stepText} · ${stepLabel}`;
    }
    if (bar) {
      bar.setAttribute("aria-valuenow", String(pct));
      bar.setAttribute(
        "aria-valuetext",
        onResults ? "Complete, your estimate is ready" : `${stepText}, ${stepLabel}`
      );
    }
    document.body.dataset.wizardStep = String(currentStep + 1);
    progressRoot?.classList.toggle("guided-progress-complete", onResults);
    // Show compact complete bar on results (not fully hidden)
    if (progressRoot) {
      progressRoot.hidden = false;
      progressRoot.setAttribute("aria-hidden", "false");
    }

    const list = $("guidedProgressSteps");
    if (list) {
      list.innerHTML = "";
      list.hidden = true;
      list.setAttribute("aria-hidden", "true");
    }

    const live = $("wizardLivePreview");
    if (live) {
      live.classList.toggle("wizard-live-preview-results", onResults);
    }
  }

  function announceStep(stepIdx) {
    const live = $("guidedStepLive");
    if (!live) return;
    const labels = getStepLabels();
    const name = labels[stepIdx] || "Next step";
    if (stepIdx === resultsStepIndex()) {
      live.textContent = "Your estimate is ready.";
    } else {
      live.textContent = `Step ${stepIdx + 1}: ${name}`;
    }
  }

  function focusActiveStepHeading() {
    const active = document.querySelector(".wizard-step.wizard-step-active, .wizard-step:not([hidden])");
    const heading =
      active?.querySelector("h1.guided-title, h2.guided-title, h2.guided-results-title, #step-results-title") ||
      active?.querySelector("h1, h2");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    try {
      heading.focus({ preventScroll: true });
    } catch {
      heading.focus();
    }
  }

  /** P1: stage price → loan on combined step */
  function isLoanStageVisible() {
    const card = $("guidedLoanStageCard");
    return Boolean(card && !card.hidden && !card.classList.contains("guided-loan-stage-hidden"));
  }

  function setPriceLoanStage(stage) {
    const step = document.querySelector('[data-step-id="price-loan"]');
    const loanCard = $("guidedLoanStageCard");
    const toLoanBtn = $("guidedPriceToLoan");
    const title = $("step-price-title");
    const lead = $("step-price-lead");
    if (!step) return;
    step.setAttribute("data-price-loan-stage", stage);
    if (stage === "loan") {
      if (loanCard) {
        loanCard.hidden = false;
        loanCard.classList.remove("guided-loan-stage-hidden");
        loanCard.setAttribute("aria-hidden", "false");
      }
      if (toLoanBtn) {
        toLoanBtn.hidden = true;
        toLoanBtn.setAttribute("aria-hidden", "true");
      }
      if (title) {
        title.textContent =
          getLoanGoal() === "refinance"
            ? "Loan type for your refinance"
            : "How you’ll finance";
      }
      if (lead) {
        lead.textContent =
          getLoanGoal() === "refinance"
            ? "Pick a program — equity updates for your refi goal."
            : "Pick a program — down payment updates automatically.";
      }
      // Focus loan heading for keyboard / SR users
      const loanTitle = $("step-loan-you-title");
      if (loanTitle) {
        if (!loanTitle.hasAttribute("tabindex")) loanTitle.setAttribute("tabindex", "-1");
        window.setTimeout(() => {
          try {
            loanTitle.focus({ preventScroll: true });
          } catch {
            loanTitle.focus();
          }
          // Show the step from the very TOP (progress bar + title) so nothing is
          // cut off above. The step is compressed to fit without scrolling.
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 50);
      }
      $("guidedStepLive") &&
        ($("guidedStepLive").textContent = "Now choose your loan type.");
    } else {
      if (loanCard) {
        loanCard.hidden = true;
        loanCard.classList.add("guided-loan-stage-hidden");
        loanCard.setAttribute("aria-hidden", "true");
      }
      if (toLoanBtn) {
        toLoanBtn.hidden = true;
        toLoanBtn.setAttribute("aria-hidden", "true");
      }
      if (title) {
        title.textContent =
          getLoanGoal() === "refinance" ? "Current home value" : "Purchase price";
      }
      if (lead) {
        lead.textContent =
          getLoanGoal() === "refinance"
            ? "Set today’s value, then continue."
            : "Set your price, then continue.";
      }
    }
    updateNavButtons();
  }

  function revealLoanStage() {
    const price = Number($("homePrice")?.value || 0);
    const err = $("guidedPriceError");
    if (price < 50000) {
      if (err) {
        err.textContent = "Enter a purchase price of at least $50,000.";
        err.classList.remove("hidden");
        err.hidden = false;
      }
      $("homePriceInput")?.focus();
      return false;
    }
    if (err) {
      err.classList.add("hidden");
      err.hidden = true;
      err.textContent = "";
    }
    setPriceLoanStage("loan");
    return true;
  }

  function bindRadiogroupKeyboard(containerSelector) {
    const root = document.querySelector(containerSelector);
    if (!root || root.dataset.kbBound === "1") return;
    root.dataset.kbBound = "1";
    root.addEventListener("keydown", (e) => {
      const buttons = Array.from(
        root.querySelectorAll('[role="radio"]:not([hidden]):not([disabled])')
      ).filter((b) => !b.closest("[hidden]"));
      if (!buttons.length) return;
      let i = buttons.findIndex((b) => b === document.activeElement || b.classList.contains("active"));
      if (i < 0) i = 0;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        i = (i + 1) % buttons.length;
        buttons[i].focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        i = (i - 1 + buttons.length) % buttons.length;
        buttons[i].focus();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        (document.activeElement || buttons[i]).click();
      } else if (e.key === "Home") {
        e.preventDefault();
        buttons[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        buttons[buttons.length - 1].focus();
      }
    });
    // Keep tabindex in sync when selection changes
    root.addEventListener("click", () => {
      window.setTimeout(() => {
        root.querySelectorAll('[role="radio"]').forEach((btn) => {
          const on = btn.classList.contains("active") || btn.getAttribute("aria-checked") === "true";
          btn.setAttribute("tabindex", on ? "0" : "-1");
        });
      }, 0);
    });
  }

  function isAddressStepReady() {
    // Ready only after successful lookup or explicit "price only" skip
    const mode = document.body.dataset.addressReady || "";
    return mode === "lookup" || mode === "skip";
  }

  function setAddressReady(mode) {
    // mode: "" | "lookup" | "skip"
    if (mode) document.body.dataset.addressReady = mode;
    else delete document.body.dataset.addressReady;
    const card = $("guidedAddressCard");
    if (card && mode === "lookup") card.setAttribute("data-address-state", "success");
    const readyHint = $("guidedAddressReadyHint");
    if (readyHint) readyHint.hidden = mode !== "lookup";
    const national = $("guidedNationalBanner");
    if (national) national.classList.toggle("hidden", mode !== "skip");
    updateNavButtons();
  }

  function updateNavButtons() {
    const next = $("wizardNext");
    const back = $("wizardBack");
    const navInner = $("wizardNavInner") || document.querySelector(".wizard-nav-inner");
    const nav = document.querySelector(".ultimate-wizard-nav");

    // Choice steps + address (until ready) hide Continue — price stage uses Continue to reveal loan
    const onChoice = IS_GUIDED && (currentStep === 0 || currentStep === 1);
    const onAddressGate = IS_GUIDED && currentStep === 2 && !isAddressStepReady();
    const onPriceStage =
      IS_GUIDED && currentStep === 3 && !isLoanStageVisible();
    const onPriceLoanStep = IS_GUIDED && currentStep === 3;
    // Only hide Next on pure choice / address-gate — NOT on price stage (Continue advances stage)
    const hideNext = onChoice || onAddressGate;
    const choiceHint = $("guidedChoiceHint");

    if (IS_LOGAN5 && currentStep === resultsStepIndex()) {
      if (choiceHint) {
        choiceHint.hidden = true;
      }
      document.body.classList.remove(
        "guided-on-choice",
        "guided-on-address-gate",
        "guided-nav-empty",
        "guided-on-price-stage"
      );
      document.body.classList.add("guided-results-back-only");
      // Results: only Back, at bottom of page (no Continue, no sticky chrome)
      if (next) {
        next.hidden = true;
        next.setAttribute("aria-hidden", "true");
        next.classList.add("wizard-next-hidden");
        next.style.display = "none";
      }
      if (back) {
        back.hidden = false;
        back.style.visibility = "visible";
        back.style.pointerEvents = "auto";
        const backText = back.querySelector(".btn-wizard-back-text");
        if (backText) {
          backText.textContent = logan5SubView ? "Back to estimate" : "Back";
        }
      }
      if (navInner) {
        navInner.classList.add("wizard-nav-back-only");
        navInner.classList.remove("wizard-nav-solo");
      }
      if (nav) {
        nav.classList.remove("wizard-nav-hidden");
        nav.hidden = false;
        nav.setAttribute("aria-hidden", "false");
      }
      return;
    }

    document.body.classList.remove("guided-results-back-only");
    if (navInner) navInner.classList.remove("wizard-nav-back-only");

    if (back) {
      const onFirst = currentStep === 0;
      back.hidden = onFirst;
      back.style.visibility = onFirst ? "hidden" : "visible";
      back.style.pointerEvents = onFirst ? "none" : "auto";
      const backText = back.querySelector(".btn-wizard-back-text");
      if (backText) backText.textContent = "Back";
    }

    if (next) {
      // Class + hidden attr — CSS forces display:inline-flex !important so style.display alone fails
      next.hidden = !!hideNext;
      next.setAttribute("aria-hidden", hideNext ? "true" : "false");
      next.classList.toggle("wizard-next-hidden", !!hideNext);
      next.style.display = hideNext ? "none" : "";
      const text =
        next.querySelector(".btn-wizard-next-text") || next.querySelector(".btn-apply-text");
      if (text) {
        if (currentStep === resultsStepIndex() - 1) {
          text.textContent = "See my estimate";
        } else if (onPriceStage) {
          text.textContent = "Continue";
        } else if (onPriceLoanStep && isLoanStageVisible()) {
          text.textContent = "Continue";
        } else {
          text.textContent = "Continue";
        }
      }
    }

    // Keep hint free unless validation failed (no repetitive “tap to continue” noise)
    if (choiceHint && !choiceHint.dataset.stickyError) {
      choiceHint.hidden = true;
      choiceHint.textContent = "";
    }

    document.body.classList.toggle("guided-on-choice", onChoice);
    document.body.classList.toggle("guided-on-address-gate", onAddressGate);
    document.body.classList.toggle("guided-on-price-stage", onPriceStage);
    // Front page (goal): auto-advance on tap — no Back, no Continue → hide entire nav chrome
    document.body.classList.toggle("guided-nav-empty", IS_GUIDED && currentStep === 0);

    if (navInner) {
      // Solo only when Back is the only visible control (choice steps after first, address gate)
      navInner.classList.toggle("wizard-nav-solo", hideNext && currentStep > 0);
      navInner.classList.toggle("wizard-nav-back-only", hideNext && currentStep > 0);
    }
    if (nav) {
      // Hide sticky bar completely on front page (nothing to show)
      const hideBar = IS_GUIDED && currentStep === 0;
      nav.classList.toggle("wizard-nav-hidden", hideBar);
      nav.hidden = hideBar;
      nav.setAttribute("aria-hidden", hideBar ? "true" : "false");
    }

    // Apply CTA only after payment reveal (don't compete with Continue mid-flow)
    document.body.classList.toggle(
      "logan5-show-apply-everywhere",
      IS_LOGAN5 && currentStep >= resultsStepIndex()
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

    // Titles for staged price-loan step are owned by setPriceLoanStage()
    if (priceTitle && currentStep !== 3) {
      priceTitle.textContent = isRefi ? "Home value" : "Purchase price";
    }
    if (priceLead && currentStep !== 3) {
      priceLead.textContent = isRefi
        ? "Then choose how you’ll refinance."
        : "Then choose loan type.";
    }
    if (priceLabel) priceLabel.textContent = isRefi ? "Home value" : "Purchase price";
    if (addrTitle) {
      addrTitle.textContent = isRefi ? "Your property address" : "Property address";
    }
    if (addrLead) {
      addrLead.textContent = isRefi
        ? "Lookup for local tax & insurance — or price only."
        : "Lookup for local estimates — or price only.";
    }
    if (downTitle) {
      downTitle.textContent = isRefi ? "Your equity" : "Down payment";
    }
    const loanYouTitle = $("step-loan-you-title");
    if (loanYouTitle) {
      loanYouTitle.textContent = "Loan type";
    }
    if (downLead) {
      downLead.textContent = isRefi
        ? "Program default — adjust equity below"
        : "Program default — adjust below";
    }
    const downSummary = document.querySelector(".guided-down-adjust-summary");
    if (downSummary) {
      downSummary.textContent = isRefi ? "Adjust equity %" : "Adjust down payment";
    }
    if (resultsTitle) {
      resultsTitle.textContent = isRefi
        ? "Your refinance strategy estimate"
        : "Your strategy estimate";
    }
    // Rebuild results: eyebrow class is the hero label (“Estimated monthly payment”)
    const heroLabel = $("pitiHeroLabel");
    if (heroLabel) {
      heroLabel.textContent = isRefi
        ? "Estimated refinance payment"
        : "Estimated monthly payment";
    } else if (resultsEyebrow && !resultsEyebrow.id) {
      resultsEyebrow.textContent = isRefi
        ? "Estimated refinance payment"
        : "Estimated monthly payment";
    }
    // Lead form — pre-approval / request call (guided results)
    const leadTitle = $("saveEstimateHeading");
    const leadLead = document.querySelector(".save-estimate-lead");
    if (leadTitle && !leadTitle.dataset.userLocked) {
      leadTitle.textContent = "Get your free buyer consultation";
    }
    if (leadLead) {
      leadLead.textContent =
        "No commitment and no credit pull. Your info goes straight to the Martini Mortgage Group team so they can reach out ASAP with your numbers and next steps.";
    }
    const leadSubmit = document.querySelector(".save-estimate-submit");
    if (leadSubmit && !leadSubmit.classList.contains("is-loading")) {
      leadSubmit.textContent = "Request my call";
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
    // Soft header Apply until results; full strength after payment reveal
    document.body.classList.toggle("guided-pre-results", currentStep < resultsStepIndex());
    document.body.classList.toggle("guided-advisor-collapsed", currentStep < resultsStepIndex());
    updateLiveRailVisibility();
    updateLivePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Reset price→loan staging when leaving / re-entering step 3
    if (currentStep === 3) {
      // Auto-reveal loan if price already valid from prior steps (e.g. address fill)
      const price = Number($("homePrice")?.value || 0);
      if (price >= 50000 && document.body.dataset.priceLoanTouched === "1") {
        setPriceLoanStage("loan");
      } else {
        setPriceLoanStage("price");
      }
    }

    if (currentStep === resultsStepIndex()) {
      document.body.classList.add("wizard-on-results");
      recalculate();
      window.dispatchEvent(new CustomEvent("mmg-wizard-results"));
      if (typeof window.MMG_logan5_renderCreativeLoans === "function") {
        window.MMG_logan5_renderCreativeLoans();
      }
      window.setTimeout(syncLifetimeProofLine, 80);
      window.setTimeout(syncLifetimeProofLine, 400);
    } else {
      document.body.classList.remove("wizard-on-results");
      recalculate();
    }

    announceStep(currentStep);
    // Skip heading auto-focus on the very first render so the initial forward
    // Tab reaches the "Skip to main content" link (the live region above still
    // announces the step). Focus the heading on every later step transition so
    // screen readers announce the new step as usual.
    if (showStep._rendered) {
      window.setTimeout(focusActiveStepHeading, 80);
    }
    showStep._rendered = true;

    document.dispatchEvent(
      new CustomEvent("mmg-wizard-step-change", { detail: { step: currentStep } })
    );
    window.dispatchEvent(new Event("scroll"));
  }

  function showStepError(message) {
    const hint = $("guidedChoiceHint");
    if (!hint) return;
    hint.hidden = false;
    hint.dataset.stickyError = "1";
    hint.textContent = message;
    hint.classList.add("guided-inline-error");
    window.setTimeout(() => {
      if (hint.dataset.stickyError === "1") {
        delete hint.dataset.stickyError;
        hint.hidden = true;
        hint.textContent = "";
      }
    }, 5000);
  }

  function clearStepError() {
    const hint = $("guidedChoiceHint");
    if (!hint) return;
    delete hint.dataset.stickyError;
    hint.hidden = true;
    hint.textContent = "";
  }

  function validateBeforeLeave(stepIndex) {
    clearStepError();
    $("guidedDownError")?.classList.add("hidden");

    if (!IS_GUIDED) {
      if (stepIndex === 0) {
        const price = Number($("homePrice")?.value || 0);
        if (price < 50000) {
          $("homePriceInput")?.focus();
          showStepError("Enter a purchase price of at least $50,000.");
          return false;
        }
      }
      return true;
    }

    if (stepIndex === 0) {
      if (!document.body.dataset.loanGoal) {
        document.querySelector(".guided-choice-grid")?.classList.add("guided-shake");
        window.setTimeout(() => document.querySelector(".guided-choice-grid")?.classList.remove("guided-shake"), 500);
        showStepError("Choose buying or refinancing to continue.");
        return false;
      }
    }
    if (stepIndex === 1) {
      if (getLoanGoal() === "purchase" && !getHasAddress()) {
        $("guidedPurchaseBranch")?.classList.add("guided-shake");
        window.setTimeout(() => $("guidedPurchaseBranch")?.classList.remove("guided-shake"), 500);
        showStepError("Choose address or price to continue.");
        return false;
      }
      if (getLoanGoal() === "refinance" && !document.body.dataset.refiGoal) {
        $("guidedRefiBranch")?.classList.add("guided-shake");
        window.setTimeout(() => $("guidedRefiBranch")?.classList.remove("guided-shake"), 500);
        showStepError("Choose a refinance goal to continue.");
        return false;
      }
    }
    if (stepIndex === 2) {
      if (IS_GUIDED && !isAddressStepReady()) {
        const recovery = document.querySelector(".guided-address-recovery");
        recovery?.classList.add("guided-shake");
        window.setTimeout(() => recovery?.classList.remove("guided-shake"), 500);
        $("wizardSkipAddress")?.classList.add("guided-skip-highlight");
        showStepError("Look up an address, or tap “Skip lookup — use price only”.");
        return false;
      }
      return true;
    }
    if (stepIndex === 3) {
      const price = Number($("homePrice")?.value || 0);
      const err = $("guidedPriceError");
      const downErr = $("guidedDownError");
      if (!Number.isFinite(price) || price < 50000) {
        $("homePriceInput")?.focus();
        $("homePriceInput")?.classList.add("input-error-flash");
        if (err) {
          err.textContent = "Enter a purchase price of at least $50,000.";
          err.classList.remove("hidden");
          err.hidden = false;
        }
        showStepError("Purchase price must be at least $50,000.");
        setTimeout(() => $("homePriceInput")?.classList.remove("input-error-flash"), 1200);
        return false;
      }
      if (err) {
        err.classList.add("hidden");
        err.hidden = true;
        err.textContent = "";
      }
      if (!isLoanStageVisible()) {
        // Should not happen if Continue revealed loan first — auto-reveal
        if (!revealLoanStage()) return false;
        return false;
      }
      const down = Number($("downPercent")?.value);
      if (!Number.isFinite(down) || down < 0 || down > 100) {
        if (downErr) {
          downErr.textContent = "Down payment must be between 0% and 100%.";
          downErr.classList.remove("hidden");
          downErr.hidden = false;
        }
        $("downPercentInput")?.focus();
        showStepError("Enter a valid down payment percent (0–100).");
        return false;
      }
      if (downErr) {
        downErr.classList.add("hidden");
        downErr.hidden = true;
        downErr.textContent = "";
      }
    }
    if (stepIndex === 4) {
      const score = Number($("creditScore")?.value);
      if (!Number.isFinite(score) || score < 580 || score > 850) {
        $("creditScore")?.focus();
        showStepError("Credit score must be between 580 and 850.");
        return false;
      }
      const rate = Number($("interestRate")?.value);
      if (!Number.isFinite(rate) || rate < 0 || rate > 20) {
        $("interestRate")?.focus();
        showStepError("Enter a valid interest rate between 0% and 20%.");
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
      updateLiveRailVisibility();
      updateLivePreview();
      syncPaymentRateStrip();
      syncLifetimeProofLine();
    });
    document
      .querySelectorAll(
        "#homePrice, #homePriceInput, #downPercent, #downPercentInput, #downAmountInput, #creditScore, #loanProgram, #loanTerm, #interestRate, #propertyAddress, #propertyTax, #homeInsurance, #hoa"
      )
      .forEach((node) => {
        node.addEventListener("input", () => {
          if (node.id === "homePrice" || node.id === "homePriceInput") {
            updateLiveRailVisibility();
          }
          window.requestAnimationFrame(recalculate);
        });
        node.addEventListener("change", () => {
          if (node.id === "homePrice" || node.id === "homePriceInput") {
            updateLiveRailVisibility();
          }
          window.requestAnimationFrame(recalculate);
        });
      });
    // Program / term buttons also drive calc (in case change event is missed)
    document.querySelectorAll(".ultimate-program-btn, .ultimate-term-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.setTimeout(() => {
          recalculate();
          updateLivePreview();
        }, 40);
      });
    });
    // Clear price error as soon as value is valid
    ["homePrice", "homePriceInput"].forEach((id) => {
      $(id)?.addEventListener("input", () => {
        const price = Number($("homePrice")?.value || 0);
        if (price >= 50000) {
          const err = $("guidedPriceError");
          if (err) {
            err.classList.add("hidden");
            err.hidden = true;
            err.textContent = "";
          }
        }
      });
    });
  }

  function bindWizard() {
    $("wizardNext")?.addEventListener("click", () => {
      if (currentStep < TOTAL_STEPS - 1) {
        // Price step stage 1: Continue reveals loan type (single primary action)
        if (IS_GUIDED && currentStep === 3 && !isLoanStageVisible()) {
          document.body.dataset.priceLoanTouched = "1";
          if (!revealLoanStage()) return;
          updateNavButtons();
          return;
        }
        if (!validateBeforeLeave(currentStep)) return;
        showStep(nextValidStep(currentStep));
      }
    });

    // Light text link: optional payment-target reverse calc
    $("guidedPriceTargetToggle")?.addEventListener("click", () => {
      const panel = $("ultimateModePayment");
      const btn = $("guidedPriceTargetToggle");
      if (!panel || !btn) return;
      const open = panel.classList.contains("hidden") || panel.hidden;
      panel.classList.toggle("hidden", !open);
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        window.setTimeout(() => $("targetPaymentInput")?.focus(), 50);
      }
    });

    $("wizardBack")?.addEventListener("click", () => {
      if (IS_LOGAN5 && currentStep === resultsStepIndex() && logan5SubView) {
        showLogan5SubView(null);
        return;
      }
      // Price-loan is a two-stage step (price -> loan). From the loan stage, Back
      // must return to the price stage (same step) rather than skipping back to
      // the previous step, so back navigation reverses the forward path exactly.
      if (IS_GUIDED && currentStep === 3 && isLoanStageVisible()) {
        setPriceLoanStage("price");
        updateNavButtons();
        try {
          const card = $("guidedPriceStageCard");
          if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) {
          window.scrollTo(0, 0);
        }
        return;
      }
      if (currentStep > 0) showStep(prevValidStep(currentStep));
    });

    $("wizardSkipAddress")?.addEventListener("click", () => {
      const field = $("propertyAddress");
      if (field) field.value = "";
      document.body.dataset.hasAddress = "no";
      setAddressReady("skip");
      updateListingBanner();
      // Soft national-estimate cue, then advance
      $("guidedNationalBanner")?.classList.remove("hidden");
      showStep(3); // price step
    });

    // Mark address ready after successful property resolution; auto-advance when on address step
    let addressAdvanceTimer = null;
    document.addEventListener("mmg-property-resolved", () => {
      if (!IS_GUIDED) return;
      document.body.dataset.hasAddress = "yes";
      document.body.dataset.priceLoanTouched = "1";
      setAddressReady("lookup");
      $("guidedNationalBanner")?.classList.add("hidden");

      // Smooth: pick a suggestion (or successful lookup) → go straight to price
      if (currentStep === 2) {
        if (addressAdvanceTimer) window.clearTimeout(addressAdvanceTimer);
        const note = $("locationNote");
        if (note && !note.textContent) {
          note.textContent = "Property found — continuing…";
          note.className = "field-note guided-address-status field-note-success";
        }
        const readyHint = $("guidedAddressReadyHint");
        if (readyHint) {
          readyHint.hidden = false;
          readyHint.innerHTML = "Property found — continuing…";
        }
        addressAdvanceTimer = window.setTimeout(() => {
          addressAdvanceTimer = null;
          if (currentStep !== 2) return;
          showStep(nextValidStep(2));
        }, 380);
      }
    });

    // Typing a new address cancels auto-advance and clears ready until re-lookup
    $("propertyAddress")?.addEventListener("input", () => {
      if (!IS_GUIDED || currentStep !== 2) return;
      if (addressAdvanceTimer) {
        window.clearTimeout(addressAdvanceTimer);
        addressAdvanceTimer = null;
      }
      if (document.body.dataset.addressReady === "lookup") {
        setAddressReady("");
      }
    });

    // Credit step: reveal 10/25 yr terms
    $("guidedTermMore")?.addEventListener("click", () => {
      const extras = document.querySelectorAll(".guided-term-extra");
      const btn = $("guidedTermMore");
      const open = btn?.getAttribute("aria-expanded") === "true";
      extras.forEach((el) => {
        el.hidden = open;
      });
      if (btn) {
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        btn.textContent = open ? "More terms" : "Fewer terms";
      }
    });

    // P1: price → loan staging
    // Legacy in-card button removed from UI; keep no-op guard if present
    $("guidedPriceToLoan")?.addEventListener("click", () => {
      document.body.dataset.priceLoanTouched = "1";
      revealLoanStage();
      updateNavButtons();
    });
    ["homePrice", "homePriceInput"].forEach((id) => {
      $(id)?.addEventListener("input", () => {
        document.body.dataset.priceLoanTouched = "1";
      });
      $(id)?.addEventListener("change", () => {
        document.body.dataset.priceLoanTouched = "1";
      });
    });

    // P2: keyboard radiogroups
    bindRadiogroupKeyboard("#ultimateProgramPicker");
    bindRadiogroupKeyboard("#ultimateTermPicker");

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
  window.MMG_guided_updateNav = updateNavButtons;
  window.MMG_guided_setAddressReady = setAddressReady;
  window.MMG_guided_setGoal = (goal) => {
    document.body.dataset.loanGoal = goal === "refinance" ? "refinance" : "purchase";
    if (goal === "refinance") document.body.dataset.hasAddress = "yes";
  };
  window.MMG_guided_setHasAddress = (v) => {
    document.body.dataset.hasAddress = v === "yes" ? "yes" : "no";
  };
})();
