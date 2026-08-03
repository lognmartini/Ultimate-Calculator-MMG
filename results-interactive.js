/**
 * Results destination — live adjust controls
 * (price, down, term, program, points / rate)
 * Syncs to engine fields without duplicating calculation logic.
 */
(function () {
  "use strict";

  /** Par Martini rate before discount points (cached). */
  let destBaseRate = null;
  /** Selected discount points: 0 | 1 | 2 */
  let destPoints = 0;
  /** Avoid recursive sync while we push rates. */
  let pushing = false;

  const POINTS_PER_QUARTER = 0.25;

  function $(id) {
    return document.getElementById(id);
  }

  function fmtMoney(n) {
    const v = Math.round(Number(n) || 0);
    return "$" + v.toLocaleString("en-US");
  }

  function fmtRate(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    if (typeof window.MMG_formatRate === "function") return window.MMG_formatRate(v);
    const rounded = Math.round(v * 1000) / 1000;
    return String(rounded);
  }

  function roundEighth(n) {
    if (typeof window.MMG_roundToEighth === "function") return window.MMG_roundToEighth(n);
    return Math.round(Number(n) * 8) / 8;
  }

  function calc() {
    if (typeof window.MMG_calculate === "function") window.MMG_calculate();
  }

  function readInterestRate() {
    return Number($("interestRate")?.value || 0);
  }

  /**
   * Capture par Martini rate from the engine field when at 0 points.
   * When points are active, base stays locked until reset.
   */
  function captureBaseRate() {
    const r = readInterestRate();
    if (Number.isFinite(r) && r > 0) {
      if (destPoints === 0) {
        destBaseRate = r;
      } else if (destBaseRate == null) {
        destBaseRate = r + destPoints * POINTS_PER_QUARTER;
      }
    }
    if (destBaseRate == null || !(destBaseRate > 0)) {
      destBaseRate = 6.25;
    }
    return destBaseRate;
  }

  function rateForPoints(pts) {
    const base = captureBaseRate();
    const n = Math.max(0, Math.min(2, Number(pts) || 0));
    return Math.max(0.125, roundEighth(base - n * POINTS_PER_QUARTER));
  }

  function setInterestRate(rate) {
    const el = $("interestRate");
    if (!el) return;
    const r = roundEighth(rate);
    const formatted = typeof window.MMG_formatRate === "function" ? window.MMG_formatRate(r) : String(r);
    el.value = formatted;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function updateRateUi() {
    const rate = readInterestRate() || rateForPoints(destPoints);
    const label = $("destRateLabel");
    if (label) label.textContent = fmtRate(rate) + "%";
    flashOutput("destRateLabel");

    const note = $("destPointsNote");
    if (note) {
      if (destPoints <= 0) {
        note.textContent = "Par rate · no discount points";
      } else {
        const costFn = window.MMG_discountPointsDollarCost;
        const price = Number($("homePrice")?.value || 0);
        const down = Number($("downPercent")?.value || 0);
        const loan = Math.max(0, price - Math.round((price * down) / 100));
        const cost = typeof costFn === "function" ? costFn(loan, destPoints) : Math.round(loan * (destPoints / 100));
        const drop = destPoints * POINTS_PER_QUARTER;
        note.textContent =
          destPoints +
          " pt" +
          (destPoints === 1 ? "" : "s") +
          " · ≈" +
          fmtRate(drop) +
          "% lower · ~" +
          fmtMoney(cost) +
          " at closing";
      }
    }

    // Keep hero rate chips in sync if present
    const martiniHero = $("ultimatePaymentMartiniRate");
    if (martiniHero && rate > 0) martiniHero.textContent = fmtRate(rate) + "%";
    const guidedMartini = $("guidedMartiniRateDisplay");
    if (guidedMartini && rate > 0) guidedMartini.textContent = fmtRate(rate) + "%";
  }

  function setPointsPill(pts) {
    const n = Math.max(0, Math.min(2, Number(pts) || 0));
    document.querySelectorAll(".dest-points-pill").forEach((btn) => {
      const on = Number(btn.getAttribute("data-dest-points")) === n;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function syncFromEngine() {
    if (pushing) return;
    const price = Number($("homePrice")?.value || 450000);
    const down = Number($("downPercent")?.value || 20);
    const term = Number($("loanTerm")?.value || 30);

    const priceRange = $("destPriceRange");
    const downRange = $("destDownRange");
    if (priceRange) priceRange.value = String(price);
    if (downRange) downRange.value = String(down);

    updatePriceLabel(price);
    updateDownLabel(price, down);
    setTermPill(term);
    setProgramPill($("loanProgram")?.value || "conventional");
    setPointsPill(destPoints);

    if (destPoints === 0) {
      captureBaseRate();
    } else {
      // Re-derive base if interest rate reflects current points
      const current = readInterestRate();
      if (current > 0 && destBaseRate == null) {
        destBaseRate = current + destPoints * POINTS_PER_QUARTER;
      }
    }
    updateRateUi();

    const isRefi = document.body.dataset.loanGoal === "refinance";
    const downTitle = $("destDownLabelTitle");
    if (downTitle) downTitle.textContent = isRefi ? "Equity / down" : "Down payment";
  }

  function updatePriceLabel(price) {
    const el = $("destPriceLabel");
    if (el) el.textContent = fmtMoney(price);
  }

  function updateDownLabel(price, downPct) {
    const el = $("destDownLabel");
    if (!el) return;
    const amt = (price * downPct) / 100;
    el.textContent = `${downPct}% · ${fmtMoney(amt)}`;
  }

  function setTermPill(years) {
    document.querySelectorAll(".dest-term-pill, .pay-pill[data-dest-term]").forEach((btn) => {
      const on = Number(btn.getAttribute("data-dest-term")) === years;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setProgramPill(program) {
    const p = program || "conventional";
    document.querySelectorAll(".dest-program-pill").forEach((btn) => {
      const on = btn.getAttribute("data-dest-program") === p;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function tickHero() {
    const amount = $("pitiPayment");
    if (!amount) return;
    amount.classList.remove("pay-tick", "studio-flash");
    void amount.offsetWidth;
    amount.classList.add("pay-tick", "studio-flash");
    window.setTimeout(() => amount.classList.remove("pay-tick", "studio-flash"), 320);
  }

  function flashOutput(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("studio-out-flash");
    void el.offsetWidth;
    el.classList.add("studio-out-flash");
    window.setTimeout(() => el.classList.remove("studio-out-flash"), 280);
  }

  function flashBreakdown() {
    document.querySelectorAll(".studio-break #breakdown li:not(.hidden) strong").forEach((el) => {
      el.parentElement?.classList.remove("studio-row-flash");
      void el.offsetWidth;
      el.parentElement?.classList.add("studio-row-flash");
      window.setTimeout(() => el.parentElement?.classList.remove("studio-row-flash"), 280);
    });
  }

  function pushProgram(program) {
    const id = program || "conventional";
    pushing = true;
    const select = $("loanProgram");
    if (select) {
      select.value = id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelectorAll(".ultimate-program-btn").forEach((btn) => {
      const on = btn.getAttribute("data-program") === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    setProgramPill(id);

    // Program change may reprice par rate — refresh base then re-apply points
    const pts = destPoints;
    destPoints = 0;
    destBaseRate = null;
    // Clear manual override so engine can set new Martini par
    const rateEl = $("interestRate");
    if (rateEl) {
      rateEl.value = "";
      rateEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    window.setTimeout(() => {
      captureBaseRate();
      destPoints = pts;
      if (pts > 0) {
        setInterestRate(rateForPoints(pts));
      }
      setPointsPill(pts);
      updateRateUi();
      calc();
      tickHero();
      flashBreakdown();
      pushing = false;
    }, 80);
  }

  function pushPrice(val) {
    const price = Math.min(3000000, Math.max(50000, Number(val) || 50000));
    const slider = $("homePrice");
    const input = $("homePriceInput");
    const display = $("homePriceDisplay");
    if (slider) slider.value = String(price);
    if (input) input.value = Math.round(price).toLocaleString("en-US");
    if (display) display.textContent = fmtMoney(price);
    slider?.dispatchEvent(new Event("input", { bubbles: true }));
    updatePriceLabel(price);
    flashOutput("destPriceLabel");
    const down = Number($("downPercent")?.value || 20);
    updateDownLabel(price, down);
    if (destPoints > 0) updateRateUi();
    calc();
    tickHero();
    flashBreakdown();
  }

  function pushDown(val) {
    const down = Math.min(50, Math.max(0, Number(val) || 0));
    const el = $("downPercent");
    const input = $("downPercentInput");
    if (el) el.value = String(down);
    if (input) input.value = String(down);
    el?.dispatchEvent(new Event("input", { bubbles: true }));
    const price = Number($("homePrice")?.value || 450000);
    updateDownLabel(price, down);
    flashOutput("destDownLabel");
    if (destPoints > 0) updateRateUi();
    calc();
    tickHero();
    flashBreakdown();
  }

  function pushTerm(years) {
    const y = Number(years) || 30;
    pushing = true;
    const select = $("loanTerm");
    if (select) {
      select.value = String(y);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelectorAll(".ultimate-term-btn").forEach((btn) => {
      const on = Number(btn.getAttribute("data-term")) === y;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    setTermPill(y);

    // Term can reprice par — same pattern as program
    const pts = destPoints;
    destPoints = 0;
    destBaseRate = null;
    const rateEl = $("interestRate");
    if (rateEl) {
      rateEl.value = "";
      rateEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    window.setTimeout(() => {
      captureBaseRate();
      destPoints = pts;
      if (pts > 0) {
        setInterestRate(rateForPoints(pts));
      }
      setPointsPill(pts);
      updateRateUi();
      calc();
      tickHero();
      flashBreakdown();
      pushing = false;
    }, 80);
  }

  function pushPoints(pts) {
    const n = Math.max(0, Math.min(2, Number(pts) || 0));
    pushing = true;

    // When returning to 0, restore par and allow engine to own rate again
    if (n === 0) {
      if (destBaseRate == null) captureBaseRate();
      destPoints = 0;
      setPointsPill(0);
      const rateEl = $("interestRate");
      if (rateEl && destBaseRate != null) {
        // Setting a positive rate keeps override; clear then restore par cleanly
        rateEl.value = "";
        rateEl.dispatchEvent(new Event("change", { bubbles: true }));
        window.setTimeout(() => {
          captureBaseRate();
          updateRateUi();
          calc();
          tickHero();
          flashBreakdown();
          pushing = false;
        }, 60);
      } else {
        updateRateUi();
        calc();
        tickHero();
        flashBreakdown();
        pushing = false;
      }
      return;
    }

    if (destPoints === 0 || destBaseRate == null) {
      // Lock current rate as par before buying points
      destPoints = 0;
      captureBaseRate();
    }
    destPoints = n;
    setPointsPill(n);
    setInterestRate(rateForPoints(n));
    updateRateUi();
    calc();
    tickHero();
    flashBreakdown();
    pushing = false;
  }

  function bind() {
    if (!document.body.classList.contains("guided-flow")) return;
    if (!$("destPriceRange")) return;

    $("destPriceRange")?.addEventListener("input", (e) => {
      pushPrice(e.target.value);
    });
    $("destDownRange")?.addEventListener("input", (e) => {
      pushDown(e.target.value);
    });
    document.querySelectorAll(".dest-term-pill, .pay-pill[data-dest-term]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pushTerm(btn.getAttribute("data-dest-term"));
      });
    });
    document.querySelectorAll(".dest-program-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        pushProgram(btn.getAttribute("data-dest-program"));
      });
    });
    document.querySelectorAll(".dest-points-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        pushPoints(btn.getAttribute("data-dest-points"));
      });
    });

    document.addEventListener("mmg-wizard-results", () => {
      destPoints = 0;
      destBaseRate = null;
      setPointsPill(0);
      window.setTimeout(syncFromEngine, 40);
      window.setTimeout(syncFromEngine, 200);
    });
    document.addEventListener("mmg-calculated", () => {
      if (!document.body.classList.contains("wizard-on-results")) return;
      if (pushing) return;
      const price = Number($("homePrice")?.value || 0);
      const down = Number($("downPercent")?.value || 0);
      const priceRange = $("destPriceRange");
      const downRange = $("destDownRange");
      if (priceRange && Number(priceRange.value) !== price) priceRange.value = String(price);
      if (downRange && Number(downRange.value) !== down) downRange.value = String(down);
      updatePriceLabel(price);
      updateDownLabel(price, down);
      setTermPill(Number($("loanTerm")?.value || 30));
      setProgramPill($("loanProgram")?.value || "conventional");
      if (destPoints === 0) captureBaseRate();
      updateRateUi();
      setPointsPill(destPoints);
    });

    if (document.body.classList.contains("wizard-on-results")) syncFromEngine();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
