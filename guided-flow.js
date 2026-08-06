/**
 * Guided multi-step UX — profile toasts, FTHB→3%, USDA map, VA thank-you,
 * down-slider paint, insurance/tax notes, side-rail CTAs.
 */
(function () {
  "use strict";

  if (!document.body.classList.contains("guided-flow")) return;

  const USDA_MAP_URL =
    "https://eligibility.sc.egov.usda.gov/eligibility/welcomeAction.do";

  const REVIEWS_URL =
    "https://martinimortgagegroup.com/what-people-say-about-martini-mortgage-group/";

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

  function parseCurrency(raw) {
    const n = Number(String(raw || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function selectCard(containerSelector, selectedBtn) {
    document.querySelectorAll(`${containerSelector} .guided-choice-card`).forEach((btn) => {
      btn.classList.toggle("is-selected", btn === selectedBtn);
    });
  }

  /* ---------- Toast / note popups ---------- */
  function ensureToastHost() {
    let host = $("guidedToastHost");
    if (host) return host;
    host = document.createElement("div");
    host.id = "guidedToastHost";
    host.className = "guided-toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
    return host;
  }

  function showToast(opts) {
    const host = ensureToastHost();
    // One toast of the same variant at a time (avoids spam on re-clicks)
    if (opts.variant) {
      host.querySelectorAll(`.guided-toast.${opts.variant}`).forEach((n) => n.remove());
    }
    const el = document.createElement("div");
    el.className = "guided-toast " + (opts.variant || "info");
    el.setAttribute("role", "status");
    const title = opts.title ? `<strong class="guided-toast-title">${opts.title}</strong>` : "";
    const link = opts.link
      ? `<a class="guided-toast-link" href="${opts.link}" target="_blank" rel="noopener">${opts.linkLabel || "Learn more"} →</a>`
      : "";
    el.innerHTML = `
      <button type="button" class="guided-toast-close" aria-label="Dismiss">×</button>
      ${title}
      <p class="guided-toast-body">${opts.body || ""}</p>
      ${link}
    `;
    el.querySelector(".guided-toast-close")?.addEventListener("click", () => el.remove());
    host.appendChild(el);
    window.setTimeout(() => {
      el.classList.add("is-out");
      window.setTimeout(() => el.remove(), 320);
    }, opts.duration || 4000);
  }

  /* ---------- Down slider visual fill (scale adapts to scenario max) ---------- */
  function paintDownSlider() {
    const el = $("downPercent");
    if (!el) return;
    el.min = "0";
    const scenarioMax = window.MMG_maxDownPercent ? window.MMG_maxDownPercent() : 50;
    el.max = String(scenarioMax);
    // Never leave the thumb past the allowed max (e.g. after a price drop on a purchase).
    if (Number(el.value) > scenarioMax) {
      el.value = String(scenarioMax);
      const inputEl = $("downPercentInput");
      if (inputEl) inputEl.value = String(scenarioMax);
    }
    const max = Number(el.max) || 50;
    const min = Number(el.min) || 0;
    const val = Number(el.value) || 0;
    const span = Math.max(0.0001, max - min);
    const pct = Math.max(0, Math.min(100, ((val - min) / span) * 100));
    el.style.setProperty("--down-fill", `${pct}%`);
    el.classList.add("guided-range-fill");
  }
  window.MMG_guided_paintDownSlider = paintDownSlider;

  function setDownPercent(pct) {
    const el = $("downPercent");
    const input = $("downPercentInput");
    if (!el) return;
    const scenarioMax = window.MMG_maxDownPercent ? window.MMG_maxDownPercent() : 50;
    const v = Math.max(0, Math.min(scenarioMax, Number(pct) || 0));
    el.min = "0";
    el.max = String(scenarioMax);
    el.value = String(v);
    if (input) input.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    paintDownSlider();
    document.querySelectorAll(".guided-mini-chip[data-down]").forEach((b) => {
      b.classList.toggle("is-selected", Number(b.getAttribute("data-down")) === v);
    });
  }

  function refreshInsurance() {
    if (typeof window.MMG_refreshInsuranceFromCredit === "function") {
      window.MMG_refreshInsuranceFromCredit();
    }
  }
  window.MMG_guided_refreshInsurance = refreshInsurance;

  function usdaMapNote(extra) {
    const addr = ($("propertyAddress")?.value || "").trim();
    const body = extra
      ? extra
      : addr
        ? "USDA 0% down requires an eligible rural property. We can’t certify eligibility automatically (USDA’s map is the source of truth). Check this address on the official map."
        : "USDA 0% down is only available on eligible rural properties. Use the official USDA eligibility map before relying on 0% down.";
    showToast({
      variant: "usda",
      title: "USDA rural eligibility",
      body,
      link: USDA_MAP_URL,
      linkLabel: "Open USDA eligibility map",
      duration: 4500,
    });
  }

  /**
   * USDA has no free public CORS API for definitive eligibility.
   * We deep-link the official map and optionally warn for major urban cores (educational only).
   */
  function noteUsdaAfterLookup(detail) {
    if (!$("usdaEligible")?.checked && $("loanProgram")?.value !== "usda") return;
    const city = String(detail?.location?.city || "").toLowerCase();
    const urbanHint =
      /raleigh|durham|charlotte|greensboro|winston|cary|apex|morrisville|chapel hill|fayetteville|wilmington|asheville|high point/.test(
        city
      );
    if (urbanHint) {
      showToast({
        variant: "warn",
        title: "USDA may not apply in this city",
        body: `${detail.location?.city || "This city"} is often outside USDA rural boundaries. Confirm on the official map before planning on 0% down.`,
        link: USDA_MAP_URL,
        linkLabel: "Open USDA eligibility map",
        duration: 4500,
      });
    } else {
      usdaMapNote();
    }
  }

  function updatePropertySummary() {
    const card = $("propertySummaryCard");
    if (!card) return;
    const addr = ($("propertyAddress")?.value || "").trim();
    const price = Number($("homePrice")?.value || 0);
    const tax = parseCurrency($("propertyTax")?.value);
    const ins = parseCurrency($("homeInsurance")?.value);
    // Only show summary after a real lookup ready state (not just typing)
    const ready = document.body.dataset.addressReady === "lookup";
    card.classList.toggle("hidden", !ready || addr.length <= 4);
    if (!ready || addr.length <= 4) return;
    if ($("propertySummaryAddress")) $("propertySummaryAddress").textContent = addr;
    if ($("propertySummaryPrice")) {
      $("propertySummaryPrice").textContent = price >= 50000 ? formatCurrency(price) : "—";
    }
    if ($("propertySummaryTax")) {
      $("propertySummaryTax").textContent = tax > 0 ? formatCurrency(tax) + "/yr" : "—";
    }
    if ($("propertySummaryIns")) {
      $("propertySummaryIns").textContent = ins > 0 ? formatCurrency(ins) + "/yr" : "—";
    }
  }

  function clearPropertySummary() {
    const addr = $("propertyAddress");
    if (addr) {
      addr.value = "";
      addr.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if ($("locationNote")) $("locationNote").textContent = "";
    updatePropertySummary();
    $("socialListingBanner")?.classList.add("hidden");
    // Reset address gate so sticky Continue stays hidden until re-lookup or skip
    if (document.body.dataset.addressReady) {
      delete document.body.dataset.addressReady;
    }
    const readyHint = $("guidedAddressReadyHint");
    if (readyHint) readyHint.hidden = true;
    $("guidedNationalBanner")?.classList.add("hidden");
    window.MMG_guided_updateNav?.();
  }

  function ensureLeadCardVisibleOnResults() {
    const card = $("saveEstimateCard");
    if (card && document.body.classList.contains("wizard-on-results")) {
      card.classList.remove("hidden");
    }
  }

  function bindProfileToasts() {
    function syncFthbVisibility(program) {
      const fthbRow = $("guidedFthbRow");
      if (!fthbRow) return;
      const hide = program === "va" || program === "usda";
      fthbRow.hidden = hide;
      fthbRow.classList.toggle("is-muted", hide);
      fthbRow.setAttribute("aria-hidden", hide ? "true" : "false");
      if (hide && $("firstTimeBuyer")) $("firstTimeBuyer").checked = false;
    }

    function syncDownChips(program) {
      // Show only program-relevant quick amounts to cut noise
      const map = {
        conventional: ["3", "5", "10", "20"],
        fha: ["3.5", "5", "10", "20"],
        va: ["0", "5", "10", "20"],
        usda: ["0", "5", "10", "20"],
      };
      const allowed = new Set(map[program] || map.conventional);
      document.querySelectorAll(".guided-down-chips .guided-mini-chip[data-down]").forEach((chip) => {
        const d = chip.getAttribute("data-down");
        chip.hidden = !allowed.has(d);
      });
    }

    $("firstTimeBuyer")?.addEventListener("change", () => {
      if (!$("firstTimeBuyer").checked) return;
      setDownPercent(3);
      const prog = $("loanProgram");
      if (prog && !["fha", "va", "usda"].includes(prog.value)) {
        if (typeof window.MMG_logan5_setProgram === "function") {
          window.MMG_logan5_setProgram("conventional", true);
        } else {
          prog.value = "conventional";
          prog.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      showToast({
        variant: "fthb",
        title: "First-time homebuyer",
        body: "Many conventional programs allow as little as <strong>3% down</strong>. We&rsquo;ve set your down payment to <strong>3%</strong> — change anytime.",
        duration: 4000,
      });
    });

    // VA / USDA eligibility is declared by picking that loan type (no separate checkboxes on UI).
    $("veteranEligible")?.addEventListener("change", () => {});
    $("usdaEligible")?.addEventListener("change", () => {});

    // Program picker: one toast per selection (eligibility is the program itself)
    document.querySelectorAll(".ultimate-program-btn[data-program]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const program = btn.getAttribute("data-program");
        if (program === "va") {
          const vet = $("veteranEligible");
          if (vet) vet.checked = true;
          const usda = $("usdaEligible");
          if (usda) usda.checked = false;
          showToast({
            variant: "va",
            title: "We thank you for your service",
            body: "VA loans often allow <strong>0% down</strong> with no monthly PMI for eligible veterans &amp; surviving spouses. Educational estimate only.",
            duration: 4000,
          });
        }
        if (program === "usda") {
          const usda = $("usdaEligible");
          if (usda) usda.checked = true;
          const vet = $("veteranEligible");
          if (vet) vet.checked = false;
          // Show ONE USDA notice: city-specific when we have a geocode,
          // otherwise the generic map note (noteUsdaAfterLookup falls back
          // to the generic note internally). Avoids the old double notice.
          const geo = window.MMG_getLastGeocode?.();
          if (geo) noteUsdaAfterLookup({ location: geo });
          else usdaMapNote();
        }
        syncFthbVisibility(program);
        syncDownChips(program);
        window.setTimeout(paintDownSlider, 30);
        window.setTimeout(paintDownSlider, 200);
      });
    });

    // Initial FTHB + chip state
    const progNow = $("loanProgram")?.value || "conventional";
    syncFthbVisibility(progNow);
    syncDownChips(progNow);
  }

  function bindChoices() {
    $("goalPurchaseBtn")?.addEventListener("click", () => {
      selectCard('[data-step-id="goal"]', $("goalPurchaseBtn"));
      window.MMG_guided_setGoal?.("purchase");
      document.body.dataset.loanGoal = "purchase";
      delete document.body.dataset.refiGoal;
      window.setTimeout(() => window.MMG_guided_next?.(), 160);
    });
    $("goalRefinanceBtn")?.addEventListener("click", () => {
      selectCard('[data-step-id="goal"]', $("goalRefinanceBtn"));
      window.MMG_guided_setGoal?.("refinance");
      document.body.dataset.loanGoal = "refinance";
      document.body.dataset.hasAddress = "yes";
      window.setTimeout(() => window.MMG_guided_next?.(), 160);
    });
    $("hasAddressYesBtn")?.addEventListener("click", () => {
      selectCard('[data-step-id="has-address"]', $("hasAddressYesBtn"));
      window.MMG_guided_setHasAddress?.("yes");
      document.body.dataset.hasAddress = "yes";
      // Fresh address path — require lookup or explicit skip
      window.MMG_guided_setAddressReady?.("");
      $("guidedNationalBanner")?.classList.add("hidden");
      window.setTimeout(() => window.MMG_guided_next?.(), 160);
    });
    $("hasAddressNoBtn")?.addEventListener("click", () => {
      selectCard('[data-step-id="has-address"]', $("hasAddressNoBtn"));
      window.MMG_guided_setHasAddress?.("no");
      document.body.dataset.hasAddress = "no";
      window.MMG_guided_setAddressReady?.("skip");
      const field = $("propertyAddress");
      if (field) field.value = "";
      $("guidedNationalBanner")?.classList.remove("hidden");
      window.setTimeout(() => window.MMG_guided_next?.(), 160);
    });

    // Refinance goals (step 1 when refinance selected)
    document.querySelectorAll("[data-refi-goal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-refi-goal]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        const goalId = btn.getAttribute("data-refi-goal");
        document.body.dataset.refiGoal = goalId || "";
        window.MMG_guided_applyRefiGoal?.(goalId);
        window.setTimeout(() => window.MMG_guided_next?.(), 180);
      });
    });

    document.querySelectorAll(".guided-mini-chip[data-down]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = btn.getAttribute("data-down");
        if (String(d) === "3") {
          // Item 4 (mobile pass): 3% is the first-time-buyer conventional minimum.
          // Set the hidden FTHB flag (and ensure conventional) BEFORE applying 3% so the
          // calculation accepts it, then surface a small note in the VA/USDA popup style.
          const fthb = $("firstTimeBuyer");
          if (fthb) fthb.checked = true;
          const prog = $("loanProgram");
          if (prog && !["fha", "va", "usda"].includes(prog.value)) {
            if (typeof window.MMG_logan5_setProgram === "function") {
              window.MMG_logan5_setProgram("conventional", true);
            } else {
              prog.value = "conventional";
              prog.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
          setDownPercent(3);
          showToast({
            variant: "fthb",
            title: "3% down",
            body: "3% is the minimum down payment and is available for <strong>first-time home buyers only</strong>. We&rsquo;ve applied it to your estimate — change anytime.",
            duration: 4200,
          });
        } else {
          setDownPercent(d);
        }
      });
    });
  }

  function bindInsuranceTax() {
    $("homeInsurance")?.addEventListener("input", () => {
      if ($("homeInsurance")) $("homeInsurance").dataset.userEdited = "1";
    });
    $("propertyTax")?.addEventListener("input", () => {
      if ($("propertyTax")) $("propertyTax").dataset.userEdited = "1";
    });
    $("downPercent")?.addEventListener("input", paintDownSlider);
    $("downPercent")?.addEventListener("change", paintDownSlider);
    $("homePrice")?.addEventListener("change", () => {
      if ($("homeInsurance")?.dataset.userEdited !== "1") refreshInsurance();
      paintDownSlider();
    });

    document.addEventListener("mmg-property-resolved", (e) => {
      const detail = e.detail || {};
      if (detail.location?.state) {
        window.MMG_guidedPropertyState = detail.location.state;
      }
      window.setTimeout(() => {
        if ($("homeInsurance")?.dataset.userEdited !== "1") {
          delete $("homeInsurance")?.dataset.userEdited;
          refreshInsurance();
        }
        updatePropertySummary();
        noteUsdaAfterLookup(detail);
      }, 250);
    });
  }

  function openRealtorIntro(entry) {
    const src = $("realtorEntrySource");
    if (src) src.value = entry || "unknown";
    if (typeof window.MMG_logan5_showSubView === "function") {
      window.MMG_logan5_showSubView("realtor");
    }
    // Focus email for fastest conversion
    window.setTimeout(() => {
      try {
        $("realtorEmail")?.focus({ preventScroll: false });
      } catch {
        $("realtorEmail")?.focus();
      }
    }, 120);
    window.MMG_trackPixel?.("RealtorIntroOpen", { entry: entry || "unknown" });
  }

  function bindRealtorSide() {
    const openFrom = (btn) => {
      const entry = btn?.getAttribute("data-realtor-entry") || "unknown";
      openRealtorIntro(entry);
    };

    $("guidedNeedRealtorBtn")?.addEventListener("click", (e) => openFrom(e.currentTarget));
    $("guidedMobileRealtorBtn")?.addEventListener("click", (e) => openFrom(e.currentTarget));
    $("guidedResultsRealtorBtn")?.addEventListener("click", (e) => openFrom(e.currentTarget));
    $("ultimateHubRealtor")?.addEventListener("click", (e) => {
      // steps-flow also binds hub → keep entry source
      const entry = e.currentTarget?.getAttribute("data-realtor-entry") || "hub";
      const src = $("realtorEntrySource");
      if (src) src.value = entry;
    });

    const closeRealtor = () => {
      document.body.classList.remove("guided-realtor-open", "logan5-subview-active");
      $("ultimateRealtorView")?.classList.remove("guided-realtor-overlay");
      $("ultimateRealtorView")?.classList.add("hidden");
      document.documentElement.style.overflow = "";
      if (typeof window.MMG_logan5_showSubView === "function") {
        window.MMG_logan5_showSubView(null);
      }
    };

    $("ultimateRealtorBack")?.addEventListener("click", closeRealtor);

    // Esc closes realtor overlay
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!document.body.classList.contains("guided-realtor-open")) return;
      closeRealtor();
    });

    // Click backdrop (overlay padding area) to close
    $("ultimateRealtorView")?.addEventListener("click", (e) => {
      if (e.target === $("ultimateRealtorView")) closeRealtor();
    });
  }

  window.MMG_guided_openRealtorIntro = openRealtorIntro;

  function bind() {
    bindChoices();
    bindProfileToasts();
    bindInsuranceTax();
    bindRealtorSide();

    // Ensure reviews link is present
    const reviews = $("guidedReviewsBtn");
    if (reviews && !reviews.getAttribute("href")) {
      reviews.href = REVIEWS_URL;
    }

    document.addEventListener("mmg-wizard-step-change", (e) => {
      updatePropertySummary();
      ensureLeadCardVisibleOnResults();
      paintDownSlider();
      const step = e?.detail?.step;
      if (step === 3 || step === 4) {
        window.setTimeout(paintDownSlider, 50);
        window.setTimeout(paintDownSlider, 250);
      }
    });
    document.addEventListener("mmg-wizard-results", () => {
      ensureLeadCardVisibleOnResults();
      if ($("homeInsurance")?.dataset.userEdited !== "1") refreshInsurance();
    });
    document.addEventListener("mmg-calculated", () => {
      updatePropertySummary();
      paintDownSlider();
    });

    function setAddressCardState(state) {
      const card = $("guidedAddressCard");
      if (card) card.setAttribute("data-address-state", state || "idle");
    }

    $("propertyAddress")?.addEventListener("change", updatePropertySummary);
    $("propertyAddress")?.addEventListener("input", () => {
      const card = $("guidedAddressCard");
      if (card?.getAttribute("data-address-state") === "error") {
        setAddressCardState("idle");
      }
    });
    $("lookupAddress")?.addEventListener("click", () => {
      const note = $("locationNote");
      const addr = ($("propertyAddress")?.value || "").trim();
      if (addr.length < 5) {
        setAddressCardState("error");
        if (note) {
          note.textContent =
            "Type a full street address (or pick a suggestion), or continue with price only.";
          note.className = "field-note guided-address-status field-note-error guided-note-warn";
        }
        $("propertyAddress")?.focus();
        return;
      }
      setAddressCardState("loading");
      if (note) {
        note.textContent = "Searching for this property…";
        note.className = "field-note guided-address-status";
      }
      window.setTimeout(updatePropertySummary, 500);
      window.setTimeout(updatePropertySummary, 1500);
      window.setTimeout(() => {
        // Confidence-building fallback if lookup didn't resolve
        const summary = $("propertySummaryCard");
        const stillEmpty = summary?.classList.contains("hidden");
        const noteText = (note?.textContent || "").toLowerCase();
        if (
          stillEmpty &&
          note &&
          !noteText.includes("found") &&
          !noteText.includes("estimate") &&
          !noteText.includes("couldn’t") &&
          !noteText.includes("couldn't")
        ) {
          setAddressCardState("error");
          note.textContent =
            "Couldn’t auto-fill this property. Try another address — or skip lookup and continue with price only (U.S. averages).";
          note.className = "field-note guided-address-status field-note-error guided-note-warn";
          const skip = $("wizardSkipAddress");
          skip?.classList.add("guided-skip-highlight");
          if (skip) skip.textContent = "Continue with price only →";
          const skipNote = $("guidedSkipPriceNote");
          if (skipNote) {
            skipNote.textContent =
              "Fast path · nationwide tax & insurance averages · edit on results";
          }
          try {
            skip?.focus({ preventScroll: true });
          } catch {
            skip?.focus();
          }
        } else if (!stillEmpty) {
          setAddressCardState("success");
          $("wizardSkipAddress")?.classList.remove("guided-skip-highlight");
        }
      }, 2800);
    });
    $("clearPropertySummary")?.addEventListener("click", () => {
      clearPropertySummary();
      setAddressCardState("idle");
    });
    $("saveEstimateOptional")?.classList.remove("hidden");

    // Refi goal note on results (when present)
    document.addEventListener("mmg-wizard-results", () => {
      const goal = document.body.dataset.refiGoal;
      const eyebrow = document.querySelector(".guided-results-eyebrow");
      if (!eyebrow || document.body.dataset.loanGoal !== "refinance") return;
      const labels = {
        "lower-payment": "Refinance · lower payment",
        "cash-out": "Refinance · cash-out",
        "shorten-term": "Refinance · pay off sooner",
        "remove-pmi": "Refinance · remove PMI",
      };
      if (goal && labels[goal]) eyebrow.textContent = labels[goal];
    });

    paintDownSlider();
    window.setTimeout(paintDownSlider, 400);
    window.setTimeout(updatePropertySummary, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
