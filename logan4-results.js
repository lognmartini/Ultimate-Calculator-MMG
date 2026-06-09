/**
 * Logan4 — results-step advantage panel, strategy teasers, consultation hooks.
 */
(function () {
  "use strict";

  const MIN_MONTHLY_HIGHLIGHT = 25;
  const MIN_LIFETIME_HIGHLIGHT = 5000;

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

  function monthlyPI(principal, annualRate, years) {
    if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function totalInterest(principal, annualRate, years) {
    if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
    const payment = monthlyPI(principal, annualRate, years);
    return Math.max(0, payment * years * 12 - principal);
  }

  function programNeedsMi(downPct) {
    return downPct < 20;
  }

  function updateAdvantage(detail) {
    const panel = $("martiniAdvantage");
    if (!panel) return;

    const monthly = Math.max(0, Number(detail.monthlyPitiSave) || 0);
    const lifetime = Math.max(0, Number(detail.lifetimeSave) || 0);
    const showMonthly = monthly >= MIN_MONTHLY_HIGHLIGHT;
    const showLifetime = lifetime >= MIN_LIFETIME_HIGHLIGHT;
    const hasStrongStory = showMonthly || showLifetime;

    panel.classList.remove("hidden");

    const stats = $("martiniAdvantageStats");
    const fallback = $("martiniAdvantageFallback");
    const monthlyWrap = $("martiniAdvantageMonthlyWrap");
    const lifetimeWrap = $("martiniAdvantageLifetimeWrap");
    const monthlyEl = $("martiniAdvantageMonthly");
    const lifetimeEl = $("martiniAdvantageLifetime");

    if (stats) stats.classList.toggle("hidden", !hasStrongStory);
    if (fallback) fallback.classList.toggle("hidden", hasStrongStory);

    if (monthlyWrap) monthlyWrap.classList.toggle("hidden", !showMonthly);
    if (lifetimeWrap) lifetimeWrap.classList.toggle("hidden", !showLifetime);
    if (monthlyEl && showMonthly) monthlyEl.textContent = `${formatCurrency(monthly)}/mo`;
    if (lifetimeEl && showLifetime) lifetimeEl.textContent = formatCurrency(lifetime);
  }

  function buildStrategyTeasers(detail) {
    const list = $("strategyTeasersList");
    const section = $("strategyTeasers");
    if (!list || !section) return;

    const items = [];
    const homePrice = Number(detail.homePrice) || 0;
    const downPct = Number(detail.downPct) || 0;
    const rate = Number(detail.rate) || 0;
    const years = Number(detail.years) || 30;
    const monthlyTax = Number(detail.monthlyTax) || 0;
    const monthlyInsurance = Number(detail.monthlyInsurance) || 0;
    const loanPrincipal = Number(detail.loanPrincipal) || 0;
    const currentPiti = Number(detail.piti) || 0;

    if (homePrice > 0 && downPct < 45) {
      const newDown = Math.min(50, downPct + 5);
      const newLoan = Math.max(0, homePrice - Math.round((homePrice * newDown) / 100));
      const newPi = monthlyPI(newLoan, rate, years);
      const newPmi =
        programNeedsMi(newDown) && newLoan > 0
          ? (newLoan * 0.005) / 12
          : 0;
      const newPiti = newPi + monthlyTax + monthlyInsurance + newPmi;
      const save = Math.max(0, Math.round(currentPiti - newPiti));
      if (save >= 15) {
        items.push(
          `<strong>+5% down (${newDown}% total)</strong> — about ${formatCurrency(save)}/mo lower payment in this scenario.`
        );
      } else if (newDown >= 20 && downPct < 20) {
        items.push(
          `<strong>20% down</strong> — removes monthly PMI in many conventional loans; we model exact numbers on a call.`
        );
      }
    }

    if (years >= 25 && loanPrincipal > 0 && rate > 0) {
      const pi15 = monthlyPI(loanPrincipal, rate, 15);
      const piti15 = pi15 + monthlyTax + monthlyInsurance + (detail.monthlyPmi || 0);
      const interest30 = totalInterest(loanPrincipal, rate, years);
      const interest15 = totalInterest(loanPrincipal, rate, 15);
      const interestSave = Math.max(0, Math.round(interest30 - interest15));
      const paymentDiff = Math.round(piti15 - currentPiti);
      if (interestSave >= 10000) {
        items.push(
          `<strong>15-year term</strong> — about ${formatCurrency(interestSave)} less interest over the life of the loan` +
            (paymentDiff > 0 ? ` (${formatCurrency(paymentDiff)}/mo higher payment).` : ".")
        );
      }
    }

    items.push(
      "<strong>Program &amp; credit fit</strong> — FHA, VA, USDA, and credit-improvement paths mapped to your goals (not just today's quote)."
    );

    list.innerHTML = items.map((html) => `<li>${html}</li>`).join("");
    section.classList.toggle("hidden", items.length === 0);
  }

  function onResults(detail) {
    if (!document.body.classList.contains("logan4")) return;
    updateAdvantage(detail);
    buildStrategyTeasers(detail);
  }

  function bind() {
    if (!document.body.classList.contains("logan4")) return;
    document.addEventListener("mmg-logan4-results", (e) => {
      onResults(e.detail || {});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();