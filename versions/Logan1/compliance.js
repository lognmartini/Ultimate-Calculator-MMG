/**
 * TILA (Reg Z) / RESPA / NMLS-aligned disclosure helpers for MMG calculators.
 * Educational estimates only — not legal advice. Have compliance review before production.
 */
(function () {
  "use strict";

  const TILA_RESPA = {
    notALoanEstimate:
      "This tool provides hypothetical estimates for educational purposes only. It is not a Loan Estimate, Closing Disclosure, loan commitment, pre-approval, or rate lock under Regulation Z (TILA) or Regulation X (RESPA).",
    triggerTerms:
      "When a payment or rate is shown, related terms (down payment, loan term, estimated APR, and whether taxes/insurance are included) are displayed with the estimate. Advertised terms must be actually available — final terms are determined after full application and verification.",
    aprNote:
      "Estimated APR reflects the note rate plus typical lender finance charges for comparison. APR is not more prominent than the note rate. Third-party closing costs are not included.",
    respa:
      "RESPA: Nothing on this page requires you to use a particular lender, title company, insurer, or other settlement service provider. You are free to shop for providers.",
    nmls:
      "NMLS Consumer Access: nmlsconsumeraccess.org — verify Martini Mortgage Group NMLS #3446 and Logan Martini NMLS #1591485.",
    coMarket:
      "Co-marketing disclosure: The real estate professional shown is not a lender, loan originator, or mortgage broker and does not make credit decisions. Martini Mortgage Group is solely responsible for mortgage offerings. This is not a joint venture or affiliated business arrangement for settlement services.",
  };

  window.MMG_COMPLIANCE = TILA_RESPA;

  function formatCurrency(n) {
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function formatRate(n) {
    if (!Number.isFinite(n)) return "—";
    return `${Number(n).toFixed(3).replace(/\.?0+$/, "")}%`;
  }

  function ensureTriggerTermsBlock() {
    let el = document.getElementById("complianceTriggerTerms");
    if (el) return el;
    const anchor =
      document.getElementById("pitiPayment")?.closest(".total-payment") ||
      document.getElementById("pitiPayment")?.parentElement;
    if (!anchor) return null;
    el = document.createElement("p");
    el.id = "complianceTriggerTerms";
    el.className = "compliance-trigger-terms";
    el.setAttribute("role", "note");
    anchor.insertAdjacentElement("afterend", el);
    return el;
  }

  function updateTriggerTerms() {
    const el = ensureTriggerTermsBlock();
    if (!el) return;

    const downPct = Number(document.getElementById("downPercent")?.value || 0);
    const term = Number(document.getElementById("loanTerm")?.value || 30);
    const price = Number(document.getElementById("homePrice")?.value || 0);
    const downAmt = Math.round((price * downPct) / 100);
    const noteRate = Number(document.getElementById("interestRate")?.value || 0);
    const piti = document.getElementById("pitiPayment")?.textContent || "—";
    const apr =
      document.getElementById("feeSheetMartiniApr")?.textContent ||
      document.getElementById("feeSheetMarketApr")?.textContent ||
      "see APR panel";

    el.innerHTML =
      `<strong>Reg Z advertising disclosure (example scenario):</strong> ` +
      `${formatCurrency(price)} purchase · ${downPct}% down (${formatCurrency(downAmt)}) · ` +
      `${term}-year term · note rate ${formatRate(noteRate)} · est. monthly PITI ${piti} ` +
      `(includes taxes &amp; insurance as entered) · est. APR ${apr}. ` +
      `Not a rate lock. ${TILA_RESPA.notALoanEstimate}`;
  }

  function injectCoMarketCompliance() {
    if (!document.body.classList.contains("co-market-active")) return;
    const legal = document.getElementById("coMarketLegal");
    let el = document.getElementById("coMarketCompliance");
    if (!el && legal) {
      el = document.createElement("p");
      el.id = "coMarketCompliance";
      el.className = "co-market-footer-compliance";
      legal.appendChild(el);
    }
    if (!el) return;
    el.textContent = TILA_RESPA.coMarket;
    if (legal) legal.classList.remove("hidden");
  }

  function init() {
    injectCoMarketCompliance();
    updateTriggerTerms();
    document.addEventListener("mmg-calculated", updateTriggerTerms);
    document.addEventListener("mmg-co-market-ready", injectCoMarketCompliance);
  }

  window.MMG_initCompliance = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();