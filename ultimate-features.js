/**
 * Logan5 — reverse payment, buydowns, buyer filters, scenario compare, PDF lead gate.
 * Educational estimates only — not a Loan Estimate or rate lock.
 */
(function () {
  "use strict";

  if (!document.body.classList.contains("logan5")) return;

  const BUYDOWN_TYPES = {
    none: { label: "No buydown", steps: [] },
    "1-0": { label: "1-0 buydown (year 1 only)", steps: [1] },
    "2-1": { label: "2-1 buydown", steps: [2, 1] },
    "3-2-1": { label: "3-2-1 buydown", steps: [3, 2, 1] },
  };

  let lastCalc = null;
  let reversePrice = null;
  let scenarioB = null;
  let activeLowerTab = "buydowns";

  const SCENARIO_PRESETS = {
    "fthb-3": { label: "3% down (FTHB)", downPct: 3, programId: "conventional" },
    "conv-5": { label: "5% conventional", downPct: 5, programId: "conventional" },
    "conv-10": { label: "10% down", downPct: 10, programId: "conventional" },
    "conv-20": { label: "20% down", downPct: 20, programId: "conventional" },
    fha: { label: "FHA 3.5%", downPct: 3.5, programId: "fha" },
    va: { label: "VA 0% down", downPct: 0, programId: "va" },
  };

  function $(id) {
    return document.getElementById(id);
  }

  function parseCurrency(raw) {
    const n = Number(String(raw || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

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

  function monthlyPi(principal, annualRate, years) {
    if (principal <= 0 || annualRate <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = years * 12;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function getInputs() {
    return {
      homePrice: Number($("homePrice")?.value || 0),
      downPct: Number($("downPercent")?.value || 0),
      rate: Number($("interestRate")?.value || 0),
      years: Number($("loanTerm")?.value || 30),
      annualTax: parseCurrency($("propertyTax")?.value),
      annualInsurance: parseCurrency($("homeInsurance")?.value),
      monthlyHoa: parseCurrency($("hoa")?.value),
      pmiAnnualRate: Number($("pmiRate")?.value || 0),
      programId: $("loanProgram")?.value || "conventional",
      creditScore: Number($("creditScore")?.value || 740),
      profile: {
        firstTimeBuyer: Boolean($("firstTimeBuyer")?.checked),
        veteranEligible: Boolean($("veteranEligible")?.checked),
        usdaEligible: Boolean($("usdaEligible")?.checked),
      },
    };
  }

  function programNeedsMi(programId, downPct) {
    if (programId === "va") return false;
    if (programId === "conventional" || programId === "jumbo") return downPct < 20;
    return true;
  }

  function estimatePitiForPrice(price, inputs) {
    const downPayment = Math.round((price * inputs.downPct) / 100);
    const loan = Math.max(0, price - downPayment);
    const pi = monthlyPi(loan, inputs.rate, inputs.years);
    const taxRate = inputs.annualTax / Math.max(inputs.homePrice, 1);
    const insRate = inputs.annualInsurance / Math.max(inputs.homePrice, 1);
    const monthlyTax = (price * taxRate) / 12;
    const monthlyIns = (price * insRate) / 12;
    const needsMi = programNeedsMi(inputs.programId, inputs.downPct);
    const monthlyMi = needsMi ? (loan * (inputs.pmiAnnualRate / 100)) / 12 : 0;
    const piti = pi + monthlyTax + monthlyIns;
    const total = piti + monthlyMi + inputs.monthlyHoa;
    return { price, downPayment, loan, pi, monthlyTax, monthlyIns, monthlyMi, piti, total };
  }

  function solvePriceForTargetPayment(targetPiti, inputs) {
    if (targetPiti <= 0) return null;
    let lo = 50000;
    let hi = 3000000;
    let best = null;
    for (let i = 0; i < 40; i++) {
      const mid = Math.round((lo + hi) / 2);
      const est = estimatePitiForPrice(mid, inputs);
      if (est.piti <= targetPiti) {
        best = mid;
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  function setCalcMode(mode) {
    const pricePanel = $("ultimateModePrice");
    const paymentPanel = $("ultimateModePayment");
    document.querySelectorAll(".ultimate-mode-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    pricePanel?.classList.toggle("hidden", mode !== "price");
    paymentPanel?.classList.toggle("hidden", mode !== "payment");
    document.body.dataset.ultimateMode = mode;
  }

  function runReversePayment() {
    const target = parseCurrency($("targetPaymentInput")?.value);
    const resultEl = $("reversePaymentResult");
    const priceEl = $("reversePriceDisplay");
    const noteEl = $("reversePaymentNote");
    if (!target || target < 200) {
      reversePrice = null;
      if (resultEl) resultEl.classList.add("hidden");
      return;
    }
    const inputs = getInputs();
    const price = solvePriceForTargetPayment(target, inputs);
    reversePrice = price;
    if (!price || !resultEl) return;
    const est = estimatePitiForPrice(price, inputs);
    if (priceEl) priceEl.textContent = formatCurrency(price);
    if (noteEl) {
      noteEl.textContent =
        `At ${inputs.downPct}% down, ${formatRate(inputs.rate)} rate, and your tax/insurance assumptions — ` +
        `estimated PITI ${formatCurrency(est.piti)}. MI/HOA may add ${formatCurrency(est.monthlyMi + inputs.monthlyHoa)}. ` +
        `Not a pre-approval.`;
    }
    resultEl.classList.remove("hidden");
    $("buyingPowerLeadCard")?.classList.remove("hidden");
    document.dispatchEvent(
      new CustomEvent("mmg-logan5-reverse", { detail: { targetPayment: target, price, est } })
    );
  }

  function applyReverseToCalculator() {
    if (!reversePrice) return;
    const slider = $("homePrice");
    const input = $("homePriceInput");
    const display = $("homePriceDisplay");
    if (slider) slider.value = reversePrice;
    if (input) input.value = reversePrice.toLocaleString("en-US");
    if (display) display.textContent = formatCurrency(reversePrice);
    setCalcMode("price");
    if (window.MMG_lookupAddress) {
      /* noop — user may add address later */
    }
    document.dispatchEvent(new Event("input", { bubbles: true }));
    $("homePrice")?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function calcBuydownSchedule(loan, fullRate, years, typeKey) {
    const cfg = BUYDOWN_TYPES[typeKey] || BUYDOWN_TYPES.none;
    const rows = [];
    for (let y = 1; y <= Math.min(3, cfg.steps.length || 1); y++) {
      const reduction = cfg.steps[y - 1] || 0;
      const yrRate = Math.max(0.125, fullRate - reduction);
      const pi = monthlyPi(loan, yrRate, years);
      rows.push({ year: y, rate: yrRate, reduction, pi });
    }
    const fullPi = monthlyPi(loan, fullRate, years);
    rows.push({ year: "4+", rate: fullRate, reduction: 0, pi: fullPi, label: "Remaining term" });
    return { type: cfg.label, rows, fullPi };
  }

  function renderBuydowns(detail) {
    const panel = $("ultimateBuydownPanel");
    if (!panel || !detail) return;
    const loan = detail.loanPrincipal;
    const rate = detail.rate;
    const years = detail.years;
    const downPct = detail.downPct;
    const programId = detail.program;
    const grid = $("ultimateBuydownGrid");
    const concessionEl = $("ultimateConcessionNote");
    if (!grid) return;

    const types = ["1-0", "2-1", "3-2-1"];
    grid.innerHTML = types
      .map((key) => {
        const sched = calcBuydownSchedule(loan, rate, years, key);
        const rows = sched.rows
          .map((r) => {
            const lbl = r.label || `Year ${r.year}`;
            const rateTxt = r.reduction ? `${formatRate(r.rate)} (−${r.reduction}%)` : formatRate(r.rate);
            return `<li><span>${lbl}</span><strong>${formatCurrency(r.pi)}/mo P&amp;I</strong></li>`;
          })
          .join("");
        const y1Save = sched.rows[0] ? sched.fullPi - sched.rows[0].pi : 0;
        return `<div class="ultimate-buydown-card">
          <h4>${sched.type}</h4>
          <ul class="ultimate-buydown-rows">${rows}</ul>
          <p class="ultimate-concession-note">Year 1 est. savings vs. full rate: <strong>${formatCurrency(y1Save)}/mo</strong> P&amp;I. Seller-paid buydowns must fit concession limits and be negotiated in the purchase contract.</p>
        </div>`;
      })
      .join("");

    if (concessionEl && window.MMG_getSellerConcessionNote) {
      const note = window.MMG_getSellerConcessionNote(programId, downPct);
      concessionEl.textContent =
        `${note.note || note.label || ""} Buydown funds are often paid via seller concessions or lender credits — subject to appraisal, program rules, and underwriting. ${window.MMG_COMPLIANCE?.notALoanEstimate || ""}`;
    }
    panel.classList.remove("hidden");
  }

  function readScenario(side) {
    const prefix = side === "b" ? "scenarioB" : "scenarioA";
    const base = getInputs();
    return {
      label: $(`${prefix}Label`)?.value?.trim() || (side === "b" ? "Scenario B" : "Scenario A"),
      homePrice: Number($(`${prefix}Price`)?.value || base.homePrice),
      downPct: Number($(`${prefix}Down`)?.value || base.downPct),
      rate: Number($(`${prefix}Rate`)?.value || base.rate),
      programId: $(`${prefix}Program`)?.value || base.programId,
      years: base.years,
      annualTax: base.annualTax,
      annualInsurance: base.annualInsurance,
      monthlyHoa: base.monthlyHoa,
      pmiAnnualRate: base.pmiAnnualRate,
    };
  }

  function renderScenarioCompare() {
    const table = $("ultimateScenarioTable");
    if (!table) return;
    const aIn = { ...getInputs(), ...readScenario("a") };
    const bIn = { ...getInputs(), ...readScenario("b") };
    const a = estimatePitiForPrice(aIn.homePrice, aIn);
    const b = estimatePitiForPrice(bIn.homePrice, bIn);
    scenarioB = { a: aIn, b: bIn, aEst: a, bEst: b };
    const rows = [
      ["Purchase price", formatCurrency(a.price), formatCurrency(b.price)],
      ["Down payment", `${aIn.downPct}% (${formatCurrency(a.downPayment)})`, `${bIn.downPct}% (${formatCurrency(b.downPayment)})`],
      ["Note rate", formatRate(aIn.rate), formatRate(bIn.rate)],
      ["Program", capitalize(aIn.programId), capitalize(bIn.programId)],
      ["Est. monthly PITI", formatCurrency(a.piti), formatCurrency(b.piti)],
      ["Est. total w/ MI & HOA", formatCurrency(a.total), formatCurrency(b.total)],
      ["Loan amount", formatCurrency(a.loan), formatCurrency(b.loan)],
      ["Est. cash at closing (down only)", formatCurrency(a.downPayment), formatCurrency(b.downPayment)],
    ];
    table.innerHTML = `<thead><tr><th>Metric</th><th>${escapeHtml(aIn.label || "A")}</th><th>${escapeHtml(bIn.label || "B")}</th></tr></thead><tbody>${rows
      .map(([m, av, bv], i) => {
        const highlight = i === 4 || i === 5 ? " class=\"ultimate-scenario-row-payment\"" : "";
        return `<tr${highlight}><td>${m}</td><td>${av}</td><td>${bv}</td></tr>`;
      })
      .join("")}</tbody>`;

    const diffEl = $("ultimateScenarioDiff");
    const pitiDiff = a.piti - b.piti;
    if (diffEl) {
      if (Math.abs(pitiDiff) < 1) {
        diffEl.classList.add("hidden");
      } else {
        diffEl.classList.remove("hidden");
        const lower = pitiDiff > 0 ? bIn.label : aIn.label;
        const save = formatCurrency(Math.abs(pitiDiff));
        diffEl.innerHTML =
          pitiDiff > 0
            ? `<strong>${escapeHtml(bIn.label)}</strong> is about <strong>${save}/mo</strong> lower PITI than ${escapeHtml(aIn.label)} in this estimate.`
            : `<strong>${escapeHtml(aIn.label)}</strong> is about <strong>${save}/mo</strong> lower PITI than ${escapeHtml(bIn.label)} in this estimate. Not a Loan Estimate — educational only.`;
      }
    }
    renderPdfPreview();
  }

  function capitalize(s) {
    const str = String(s || "");
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function syncScenarioFieldsFromMain() {
    const base = getInputs();
    const aPrice = $("scenarioAPrice");
    const aDown = $("scenarioADown");
    const aRate = $("scenarioARate");
    const aProg = $("scenarioAProgram");
    const aLabel = $("scenarioALabel");
    if (aPrice && !aPrice.dataset.touched) aPrice.value = base.homePrice;
    if (aDown && !aDown.dataset.touched) aDown.value = base.downPct;
    if (aRate && !aRate.dataset.touched) aRate.value = base.rate;
    if (aProg && !aProg.dataset.touched) aProg.value = base.programId;
    if (aLabel && !aLabel.dataset.touched) aLabel.value = "Your estimate";

    const bDown = $("scenarioBDown");
    const bPrice = $("scenarioBPrice");
    const bRate = $("scenarioBRate");
    const bProg = $("scenarioBProgram");
    if (bPrice && !bPrice.dataset.touched) bPrice.value = base.homePrice;
    if (bDown && !bDown.dataset.touched) {
      bDown.value = base.profile?.firstTimeBuyer ? 3 : 3.5;
    }
    if (bRate && !bRate.dataset.touched) bRate.value = base.rate;
    if (bProg && !bProg.dataset.touched) bProg.value = "fha";
    renderScenarioCompare();
  }

  function applyScenarioPreset(presetKey) {
    const preset = SCENARIO_PRESETS[presetKey];
    if (!preset) return;
    const base = getInputs();
    const bLabel = $("scenarioBLabel");
    const bPrice = $("scenarioBPrice");
    const bDown = $("scenarioBDown");
    const bRate = $("scenarioBRate");
    const bProg = $("scenarioBProgram");
    if (bLabel) {
      bLabel.value = preset.label;
      bLabel.dataset.touched = "1";
    }
    if (bPrice) {
      bPrice.value = base.homePrice;
      bPrice.dataset.touched = "1";
    }
    if (bDown) {
      bDown.value = preset.downPct;
      bDown.dataset.touched = "1";
    }
    if (bRate) {
      bRate.value = base.rate;
      bRate.dataset.touched = "1";
    }
    if (bProg) {
      bProg.value = preset.programId;
      bProg.dataset.touched = "1";
    }
    document.querySelectorAll(".ultimate-scenario-preset").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === presetKey);
    });
    renderScenarioCompare();
  }

  function buildPrintDocumentBody() {
    const comp = scenarioB;
    const site = window.MMG_SITE || {};
    const d = lastCalc || {};
    const disclaimer =
      window.MMG_COMPLIANCE?.notALoanEstimate ||
      "Educational estimate only — not a Loan Estimate, Closing Disclosure, loan commitment, pre-approval, or rate lock.";
    const address = $("propertyAddress")?.value?.trim() || $("socialListingAddress")?.textContent?.trim() || "";
    const generated = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const aIn = comp?.a || getInputs();
    const bIn = comp?.b || getInputs();
    const aEst = comp?.aEst || estimatePitiForPrice(aIn.homePrice, aIn);
    const bEst = comp?.bEst || estimatePitiForPrice(bIn.homePrice, bIn);
    const pitiDiff = aEst.piti - bEst.piti;
    const diffLine =
      Math.abs(pitiDiff) >= 1
        ? `<p class="pdf-highlight">Monthly PITI difference: <strong>${formatCurrency(Math.abs(pitiDiff))}/mo</strong> lower with ${escapeHtml(pitiDiff > 0 ? bIn.label : aIn.label)} (estimate).</p>`
        : "";

    const tableRows = [
      ["Purchase price", formatCurrency(aEst.price), formatCurrency(bEst.price)],
      ["Down payment", `${aIn.downPct}%`, `${bIn.downPct}%`],
      ["Down $", formatCurrency(aEst.downPayment), formatCurrency(bEst.downPayment)],
      ["Note rate", formatRate(aIn.rate), formatRate(bIn.rate)],
      ["Loan program", capitalize(aIn.programId), capitalize(bIn.programId)],
      ["Est. monthly PITI", formatCurrency(aEst.piti), formatCurrency(bEst.piti)],
      ["Est. w/ MI & HOA", formatCurrency(aEst.total), formatCurrency(bEst.total)],
      ["Loan amount", formatCurrency(aEst.loan), formatCurrency(bEst.loan)],
    ];

    return `
    <div class="pdf-hdr">
      <h1>Total Cost Analysis</h1>
      <p class="pdf-meta"><strong>${escapeHtml(site.brandName || "Martini Mortgage Group")}</strong> · Logan Martini · NMLS #${escapeHtml(site.nmls || "1591485")} · Company NMLS #${escapeHtml(site.companyNmls || "3446")}</p>
      <p class="pdf-meta">Generated ${escapeHtml(generated)}${address ? ` · Property: ${escapeHtml(address)}` : ""}</p>
    </div>
    <div class="pdf-section">
      <h2>Side-by-side comparison</h2>
      <table>
        <thead><tr><th>Metric</th><th>${escapeHtml(aIn.label || "Scenario A")}</th><th>${escapeHtml(bIn.label || "Scenario B")}</th></tr></thead>
        <tbody>${tableRows
          .map(([m, av, bv], i) => {
            const cls = i >= 5 ? ' class="pdf-highlight"' : "";
            return `<tr><td>${m}</td><td${cls}>${av}</td><td${cls}>${bv}</td></tr>`;
          })
          .join("")}</tbody>
      </table>
      ${diffLine}
    </div>
    <div class="pdf-section">
      <h2>Your primary calculator estimate</h2>
      <p>Purchase <strong>${formatCurrency(d.homePrice)}</strong> · <strong>${d.downPct}%</strong> down · <strong>${formatRate(d.rate)}</strong> · Program <strong>${capitalize(d.program || "conventional")}</strong></p>
      <p>Estimated monthly PITI: <strong>${formatCurrency(d.piti)}</strong> · Loan amount: <strong>${formatCurrency(d.loanPrincipal)}</strong></p>
      ${$("quoteCashToClose")?.textContent && $("quoteCashToClose").textContent !== "—" ? `<p>Est. cash to close (from calculator): <strong>${escapeHtml($("quoteCashToClose").textContent)}</strong></p>` : ""}
    </div>
    <div class="pdf-section">
      <h2>Buydown note</h2>
      <p>Seller-paid or lender-paid buydowns may further reduce payments in early years. Ask Logan about a complimentary 1-year lender-paid buydown on eligible scenarios. Subject to underwriting and program rules.</p>
    </div>
    <div class="pdf-foot">
      <p>${escapeHtml(disclaimer)}</p>
      <p>Equal Housing Lender. Verify licenses at nmlsconsumeraccess.org. ${escapeHtml(site.address || "Raleigh, NC")} · ${escapeHtml(site.phoneDisplay || "(919) 238-4934")}</p>
      <p>This report was produced by the Martini Mortgage educational calculator (Logan5). Not legal or tax advice.</p>
    </div>`;
  }

  function renderPdfPreview() {
    const wrap = $("ultimatePdfPreviewWrap");
    const doc = $("ultimatePdfPreviewDoc");
    if (!wrap || !doc || !scenarioB) return;
    wrap.classList.remove("hidden");
    doc.innerHTML = buildPrintDocumentBody();
  }

  function buildPrintHtml() {
    const body = buildPrintDocumentBody();
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Total Cost Analysis — Martini Mortgage</title>
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;padding:28px;color:#1a1230;max-width:720px;margin:0 auto;line-height:1.45}
      h1{font-size:1.35rem;margin:0 0 0.35rem}
      h2{font-size:1rem;margin:0 0 0.35rem;color:#1a1230}
      table{width:100%;border-collapse:collapse;margin:12px 0;font-size:0.88rem}
      th,td{border:1px solid #ccc;padding:8px;text-align:left}
      th{background:#f4f2f8;font-weight:600}
      .pdf-hdr{border-bottom:3px solid #c9a227;padding-bottom:14px;margin-bottom:18px}
      .pdf-meta{margin:0.15rem 0;font-size:0.82rem;color:#5c5670}
      .pdf-section{margin:18px 0}
      .pdf-highlight{background:#fff8e1}
      .pdf-foot{margin-top:24px;padding-top:14px;border-top:1px solid #ddd;font-size:0.75rem;color:#5c5670}
      @media print{body{padding:12px}}
    </style></head><body>${body}
    <script>window.onload=function(){window.print();}</script></body></html>`;
  }

  function refreshCompareStep() {
    if (lastCalc) renderBuydowns(lastCalc);
    syncScenarioFieldsFromMain();
    showComparePanels();
    if (activeLowerTab === "compare") renderPdfPreview();
  }

  function setLowerSubtab(tab) {
    activeLowerTab = tab;
    document.querySelectorAll(".ultimate-lower-subtab").forEach((btn) => {
      const on = btn.dataset.lowerTab === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const buydowns = $("ultimateLowerPanelBuydowns");
    const compare = $("ultimateLowerPanelCompare");
    if (buydowns) {
      buydowns.classList.toggle("hidden", tab !== "buydowns");
      buydowns.hidden = tab !== "buydowns";
    }
    if (compare) {
      compare.classList.toggle("hidden", tab !== "compare");
      compare.hidden = tab !== "compare";
      if (tab === "compare") renderPdfPreview();
    }
  }

  function showComparePanels() {
    $("ultimateBuydownPanel")?.classList.remove("hidden");
    $("ultimateScenarioPanel")?.classList.remove("hidden");
    $("ultimatePdfLeadCard")?.classList.remove("hidden");
  }

  function apiBase() {
    const meta = document.querySelector('meta[name="mmg-api-base"]');
    const base = meta?.content || "/";
    return base.endsWith("/") ? base : `${base}/`;
  }

  async function submitUltimateLead(formId, source, extra) {
    const form = $(formId);
    if (!form) return false;
    const email = form.querySelector('[type="email"]')?.value?.trim() || "";
    const phone = form.querySelector('[type="tel"]')?.value?.trim() || "";
    const name = form.querySelector('[name="name"]')?.value?.trim() || "";
    if (!email || !email.includes("@")) {
      form.querySelector('[type="email"]')?.focus();
      return false;
    }
    const payload = {
      email,
      name,
      phone,
      assignedLo: "logan",
      version: "Logan5",
      source,
      consent: true,
      scenario: {
        ...collectScenarioSnapshot(),
        ...extra,
      },
    };
    try {
      const res = await fetch(`${apiBase()}api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function collectScenarioSnapshot() {
    const g = (id) => $(id);
    return {
      homePrice: g("homePrice")?.value,
      downPercent: g("downPercent")?.value,
      creditScore: g("creditScore")?.value,
      piti: g("pitiPayment")?.textContent,
      rate: g("interestRate")?.value,
      loanProgram: g("loanProgram")?.value,
      reversePrice,
      targetPayment: g("targetPaymentInput")?.value,
      profile: getInputs().profile,
      utm: Object.fromEntries(new URLSearchParams(window.location.search)),
    };
  }

  function openPrintPdf() {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(buildPrintHtml());
      w.document.close();
    }
  }

  function onPdfPreviewClick() {
    setLowerSubtab("compare");
    renderPdfPreview();
    $("ultimatePdfPreviewWrap")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function onPdfLeadSubmit(e) {
    e.preventDefault();
    renderPdfPreview();
    const ok = await submitUltimateLead("ultimatePdfLeadForm", "logan5-scenario-pdf", {
      scenarioCompare: scenarioB,
    });
    const success = $("ultimatePdfSuccess");
    if (success) {
      success.classList.remove("hidden");
      success.textContent = ok
        ? "Opening your Total Cost Analysis — choose Save as PDF in the print dialog."
        : "Opening your report — choose Save as PDF in the print dialog.";
    }
    openPrintPdf();
  }

  async function onStrategyLeadSubmit(e) {
    e.preventDefault();
    const ok = await submitUltimateLead("ultimateStrategyForm", "logan5-lender-buydown", {
      interest: "complimentary-1yr-lender-buydown",
    });
    const success = $("ultimateStrategySuccess");
    if (success) {
      success.classList.remove("hidden");
      success.textContent = ok
        ? "Thanks — Logan will reach out about complimentary buydown options."
        : "Request noted — call or apply anytime to connect with Logan.";
    }
  }

  async function onBuyingPowerSubmit(e) {
    e.preventDefault();
    const ok = await submitUltimateLead("buyingPowerLeadForm", "logan5-buying-power", {
      reversePrice,
      targetPayment: $("targetPaymentInput")?.value,
    });
    const success = $("buyingPowerSuccess");
    if (success) {
      success.classList.remove("hidden");
      success.textContent = ok
        ? "Your buying power snapshot is on the way."
        : "We couldn't email that right now — your estimate is still on screen.";
    }
  }

  function applyProfileToProgram() {
    const vet = $("veteranEligible");
    const usda = $("usdaEligible");
    if (vet?.checked) {
      setProgramFromButton("va");
    } else if (usda?.checked && !vet?.checked) {
      setProgramFromButton("usda");
    }
    updateProgramPickerAvailability();
  }

  function bindProfileFilters() {
    $("firstTimeBuyer")?.addEventListener("change", () => {
      document.dispatchEvent(new Event("mmg-logan5-profile-change"));
      const prog = $("loanProgram")?.value;
      if (prog === "conventional" && window.MMG_snapDownToProgram) {
        window.MMG_snapDownToProgram();
      }
      if (window.MMG_applyLoanProgramUi) window.MMG_applyLoanProgramUi();
      else $("loanProgram")?.dispatchEvent(new Event("change", { bubbles: true }));
      updateProgramPickerAvailability();
    });
    $("veteranEligible")?.addEventListener("change", () => {
      if ($("veteranEligible")?.checked && $("usdaEligible")) $("usdaEligible").checked = false;
      applyProfileToProgram();
    });
    $("usdaEligible")?.addEventListener("change", () => {
      if ($("usdaEligible")?.checked && $("veteranEligible")) $("veteranEligible").checked = false;
      applyProfileToProgram();
    });
  }

  function updateLiveStats() {
    const price = $("homePriceDisplay")?.textContent || $("homePriceInput")?.value || "—";
    const down = $("downDisplay")?.textContent?.split("·")[0]?.trim() || $("downPercent")?.value + "%";
    const rate = $("interestRate")?.value;
    const priceEl = $("ultimateLivePrice");
    const downEl = $("ultimateLiveDown");
    const rateEl = $("ultimateLiveRate");
    if (priceEl) priceEl.textContent = price.includes("$") ? price : price;
    if (downEl) downEl.textContent = down || "—";
    if (rateEl && rate) rateEl.textContent = `${rate}%`;
  }

  function syncProgramButtons() {
    const program = $("loanProgram")?.value || "conventional";
    document.querySelectorAll(".ultimate-program-btn").forEach((btn) => {
      const on = btn.dataset.program === program;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    const convGuide = $("ultimateGuideConventional");
    if (convGuide) {
      convGuide.textContent = $("firstTimeBuyer")?.checked
        ? "3% min (FTHB) · PMI below 20%"
        : "5% min · PMI below 20%";
    }
  }

  function syncTermButtons() {
    const term = $("loanTerm")?.value || "30";
    document.querySelectorAll(".ultimate-term-btn").forEach((btn) => {
      const on = btn.dataset.term === term;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function getCountyKey() {
    return window.MMG_getCountyKey?.() || window.MMG_LOAN_LIMITS?.defaultCounty || "wake";
  }

  function updateProgramPickerAvailability() {
    const price = Number($("homePrice")?.value || 0);
    const profile = getInputs().profile;
    const countyKey = getCountyKey();
    const note = $("loanProgramNote");

    document.querySelectorAll(".ultimate-program-btn").forEach((btn) => {
      const id = btn.dataset.program || "";
      let available = true;
      if (window.MMG_isProgramAvailable) {
        available = window.MMG_isProgramAvailable(id, price, profile, countyKey);
      }
      btn.disabled = !available;
      btn.classList.toggle("ultimate-program-unavailable", !available);
      btn.setAttribute("aria-disabled", available ? "false" : "true");
    });

    const jumboBtn = $("ultimateProgramJumbo");
    if (jumboBtn && window.MMG_isJumboLoan) {
      const showJumbo = price > 0 && window.MMG_isJumboLoan(price, 15, countyKey);
      jumboBtn.classList.toggle("hidden", !showJumbo);
    }

    const current = $("loanProgram")?.value || "conventional";
    if (
      window.MMG_isProgramAvailable &&
      price > 0 &&
      current !== "fha" &&
      !window.MMG_isProgramAvailable(current, price, profile, countyKey)
    ) {
      setProgramFromButton("conventional", true);
    } else {
      syncProgramButtons();
    }

    const fhaBtn = document.querySelector('.ultimate-program-btn[data-program="fha"]');
    if (fhaBtn && window.MMG_isFhaEligible && window.MMG_getFhaIneligibleNote) {
      const overLimit = price > 0 && !window.MMG_isFhaEligible(price, countyKey);
      const sub = fhaBtn.querySelector("span:last-child");
      if (sub) {
        sub.textContent = overLimit
          ? "3.5% down · higher down may apply above limit"
          : "3.5% down · flexible credit";
      }
      if (note && ($("loanProgram")?.value === "fha") && overLimit) {
        note.textContent = window.MMG_getFhaIneligibleNote(price, countyKey);
      }
    }
  }

  function setProgramFromButton(programId, force) {
    const program = $("loanProgram");
    if (!program) return;
    const price = Number($("homePrice")?.value || 0);
    const profile = getInputs().profile;
    const countyKey = getCountyKey();
    const note = $("loanProgramNote");

    if (
      !force &&
      programId !== "fha" &&
      window.MMG_isProgramAvailable &&
      !window.MMG_isProgramAvailable(programId, price, profile, countyKey)
    ) {
      if (programId === "va" && note) {
        note.textContent = "Check Military / VA eligible above to model 0% down.";
      } else if (programId === "usda" && note) {
        note.textContent = "Check USDA rural property above to model 0% down.";
      }
      return;
    }

    program.value = programId;
    program.dispatchEvent(new Event("change", { bubbles: true }));
    syncProgramButtons();
    if (window.MMG_snapDownToProgram) window.MMG_snapDownToProgram();
    if (window.MMG_applyLoanProgramUi) window.MMG_applyLoanProgramUi();
    if (
      programId === "fha" &&
      note &&
      window.MMG_isFhaEligible &&
      window.MMG_getFhaIneligibleNote &&
      price > 0 &&
      !window.MMG_isFhaEligible(price, countyKey)
    ) {
      note.textContent = window.MMG_getFhaIneligibleNote(price, countyKey);
    }
    document.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setTermFromButton(term) {
    const el = $("loanTerm");
    if (!el) return;
    el.value = term;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    syncTermButtons();
    document.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function estimateCashToClose(price, downPct, loanPrincipal, annualTax, annualInsurance, pointsCost) {
    const downPayment = Math.round((price * downPct) / 100);
    const lenderBase = window.MMG_MARKET?.aprFinanceCharge ?? 2500;
    const closingCosts = Math.round(loanPrincipal * 0.02 + lenderBase);
    const prepaids = Math.round((annualTax / 12) * 3 + (annualInsurance / 12) * 14);
    const extraPoints = Math.max(0, Number(pointsCost) || 0);
    return downPayment + closingCosts + prepaids + extraPoints;
  }

  function buildCreativeLoanOptions() {
    const base = getInputs();
    const price = base.homePrice;
    const vet = base.profile?.veteranEligible;
    const fthb = base.profile?.firstTimeBuyer;
    const countyKey = getCountyKey();
    const options = [];

    options.push({
      id: "buydown-21",
      icon: "📉",
      title: "2-1 Seller buydown",
      tagline: "Lower payments years 1–2 via seller concessions",
      getEstimate() {
        const loan = Math.max(0, price - Math.round((price * base.downPct) / 100));
        const sched = calcBuydownSchedule(loan, base.rate, base.years, "2-1");
        const y1Pi = sched.rows[0]?.pi || sched.fullPi;
        const taxRate = base.annualTax / Math.max(price, 1);
        const insRate = base.annualInsurance / Math.max(price, 1);
        const monthlyTax = (price * taxRate) / 12;
        const monthlyIns = (price * insRate) / 12;
        const needsMi = programNeedsMi(base.programId, base.downPct);
        const monthlyMi = needsMi ? (loan * (base.pmiAnnualRate / 100)) / 12 : 0;
        const piti = y1Pi + monthlyTax + monthlyIns;
        const total = piti + monthlyMi + base.monthlyHoa;
        const cash = estimateCashToClose(price, base.downPct, loan, base.annualTax, base.annualInsurance, 0);
        return { piti: total, cash, note: "Year 1 payment estimate" };
      },
    });

    if (window.MMG_isFhaEligible && window.MMG_isFhaEligible(price, countyKey)) {
      options.push({
        id: "fha-low-down",
        icon: "🔑",
        title: "FHA 3.5% down",
        tagline: `Within ${window.MMG_LOAN_LIMITS?.counties[countyKey]?.name || "county"} FHA limit`,
        getEstimate() {
          const inputs = { ...base, downPct: 3.5, programId: "fha" };
          const est = estimatePitiForPrice(price, inputs);
          const cash = estimateCashToClose(price, 3.5, est.loan, base.annualTax, base.annualInsurance, 0);
          return { piti: est.total, cash, note: "Includes FHA MIP estimate" };
        },
      });
    } else if (window.MMG_isJumboLoan && window.MMG_isJumboLoan(price, 15, countyKey)) {
      options.push({
        id: "jumbo-15",
        icon: "💎",
        title: "Jumbo 15% down",
        tagline: "Above 2026 conforming limit · $832,750 baseline",
        getEstimate() {
          const inputs = { ...base, downPct: 15, programId: "jumbo", rate: base.rate + 0.25 };
          const est = estimatePitiForPrice(price, inputs);
          const cash = estimateCashToClose(price, 15, est.loan, base.annualTax, base.annualInsurance, 0);
          return { piti: est.total, cash, note: "Jumbo rates vary — educational estimate" };
        },
      });
    } else {
      options.push({
        id: "conv-10",
        icon: "🏡",
        title: "10% conventional",
        tagline: "Lower MI · strong equity start",
        getEstimate() {
          const inputs = { ...base, downPct: 10, programId: "conventional" };
          const est = estimatePitiForPrice(price, inputs);
          const cash = estimateCashToClose(price, 10, est.loan, base.annualTax, base.annualInsurance, 0);
          return { piti: est.total, cash, note: "PMI until 20% equity on many loans" };
        },
      });
    }

    if (vet && window.MMG_isVaEligible?.(base.profile)) {
      options.push({
        id: "va-zero",
        icon: "🎖️",
        title: "VA 0% down",
        tagline: "No down payment for eligible veterans",
        getEstimate() {
          const inputs = { ...base, downPct: 0, programId: "va" };
          const est = estimatePitiForPrice(price, inputs);
          const cash = estimateCashToClose(price, 0, est.loan, base.annualTax, base.annualInsurance, 0);
          return { piti: est.total, cash, note: "VA funding fee may apply" };
        },
      });
    } else if (fthb) {
      options.push({
        id: "fthb-3",
        icon: "🏡",
        title: "3% FTHB conventional",
        tagline: "First-time buyer low-down path",
        getEstimate() {
          const inputs = { ...base, downPct: 3, programId: "conventional" };
          const est = estimatePitiForPrice(price, inputs);
          const cash = estimateCashToClose(price, 3, est.loan, base.annualTax, base.annualInsurance, 0);
          return { piti: est.total, cash, note: "HomeReady-style estimate" };
        },
      });
    } else {
      options.push({
        id: "conv-20",
        icon: "🏡",
        title: "20% conventional",
        tagline: "No PMI · lowest monthly MI cost",
        getEstimate() {
          const inputs = { ...base, downPct: 20, programId: "conventional" };
          const est = estimatePitiForPrice(price, inputs);
          const cash = estimateCashToClose(price, 20, est.loan, base.annualTax, base.annualInsurance, 0);
          return { piti: est.total, cash, note: "Avoids monthly MI on conventional" };
        },
      });
    }

    return options.slice(0, 3);
  }

  function renderCreativeLoans() {
    const grid = $("ultimateCreativeLoans");
    if (!grid) return;
    const options = buildCreativeLoanOptions();
    const calendly =
      document.querySelector("[data-mmg-calendly]")?.href ||
      "https://calendly.com/kevinmartini/private-call-with-martini";
    grid.innerHTML = options
      .map((opt) => {
        const est = opt.getEstimate();
        return `<article class="ultimate-creative-card" role="listitem" data-loan-id="${opt.id}">
          <header class="ultimate-creative-card-head">
            <span class="ultimate-creative-icon" aria-hidden="true">${opt.icon}</span>
            <div>
              <h3>${escapeHtml(opt.title)}</h3>
              <p>${escapeHtml(opt.tagline)}</p>
            </div>
          </header>
          <dl class="ultimate-creative-stats">
            <div><dt>Est. payment</dt><dd>${formatCurrency(est.piti)}<span class="ultimate-creative-note">/mo</span></dd></div>
            <div><dt>Cash to close</dt><dd>${formatCurrency(est.cash)}</dd></div>
          </dl>
          <div class="ultimate-creative-locked">
            <p>Full rate breakdown, buydown costs, and program guidelines unlock when you connect with Logan.</p>
            <div class="ultimate-creative-actions">
              <a href="https://applywithlogan.com" class="btn btn-apply-now ultimate-creative-apply" data-mmg-apply target="_blank" rel="noopener">
                <span class="btn-apply-text">Apply now</span>
                <span class="btn-apply-arrow" aria-hidden="true">→</span>
              </a>
              <a href="${escapeHtml(calendly)}" class="btn btn-outline ultimate-creative-meeting" target="_blank" rel="noopener">Request a meeting</a>
            </div>
          </div>
          <p class="ultimate-creative-footnote">${escapeHtml(est.note)} · Educational estimate only</p>
        </article>`;
      })
      .join("");
  }

  async function onRealtorSubmit(e) {
    e.preventDefault();
    const form = $("ultimateRealtorForm");
    if (!form) return;
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    if (!email || !email.includes("@")) {
      form.querySelector('[type="email"]')?.focus();
      return;
    }
    const payload = {
      email,
      name: String(fd.get("name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      assignedLo: "logan",
      version: "Logan5",
      source: "logan5-realtor-quiz",
      notifyEmail: "logan@martinimortgagegroup.com",
      consent: true,
      scenario: {
        ...collectScenarioSnapshot(),
        realtorType: fd.get("realtorType"),
        moveTimeline: fd.get("moveTimeline"),
        realtorPriority: fd.get("realtorPriority"),
      },
    };
    let ok = false;
    try {
      const res = await fetch(`${apiBase()}api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    const confirm = $("ultimateRealtorConfirm");
    const consent = $("ultimateRealtorConsent");
    if (ok && confirm) {
      form.querySelectorAll(".ultimate-realtor-q, .ultimate-realtor-contact, .ultimate-realtor-submit").forEach((el) => {
        el.classList.add("hidden");
      });
      if (consent) consent.classList.add("hidden");
      confirm.classList.remove("hidden");
      confirm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      const success = $("ultimateRealtorSuccess");
      if (success) {
        success.classList.remove("hidden");
        success.textContent =
          "We noted your answers — call (919) 238-4934 if you need help right away.";
      }
    }
    form.querySelector(".ultimate-realtor-submit")?.setAttribute("disabled", "true");
  }

  function updateProcessHighlight(stepIndex) {
    document.querySelectorAll(".ultimate-trust-panel .ultimate-process-step").forEach((el, i) => {
      el.classList.toggle("ultimate-process-step-current", i === Math.min(stepIndex, 4));
    });
    syncProgramButtons();
    syncTermButtons();
  }

  function bind() {
    document.querySelectorAll(".ultimate-mode-tab").forEach((btn) => {
      btn.addEventListener("click", () => setCalcMode(btn.dataset.mode || "price"));
    });

    document.querySelectorAll(".ultimate-program-btn").forEach((btn) => {
      btn.addEventListener("click", () => setProgramFromButton(btn.dataset.program || "conventional"));
    });

    document.querySelectorAll(".ultimate-term-btn").forEach((btn) => {
      btn.addEventListener("click", () => setTermFromButton(btn.dataset.term || "30"));
    });

    $("targetPaymentInput")?.addEventListener("input", runReversePayment);
    $("applyReversePrice")?.addEventListener("click", applyReverseToCalculator);

    document.addEventListener("mmg-calculated", () => {
      updateLiveStats();
      updateProgramPickerAvailability();
    });
    document.addEventListener("mmg-program-change", updateProgramPickerAvailability);
    document.addEventListener("mmg-wizard-step-change", (e) => {
      updateProcessHighlight(e.detail?.step ?? 0);
      if ((e.detail?.step ?? 0) === 2) renderCreativeLoans();
    });
    document.addEventListener("mmg-logan5-profile-change", () => {
      updateProcessHighlight(Number(document.body.dataset.wizardStep || 1) - 1);
      syncProgramButtons();
    });
    $("loanProgram")?.addEventListener("change", () => {
      syncProgramButtons();
      updateProcessHighlight(Number(document.body.dataset.wizardStep || 1) - 1);
    });
    $("loanTerm")?.addEventListener("change", syncTermButtons);

    document.addEventListener("mmg-logan5-calculated", (e) => {
      lastCalc = e.detail;
    });

    document.addEventListener("mmg-calculated", () => {
      if (document.body.dataset.ultimateMode === "payment") runReversePayment();
    });

    $("buyingPowerLeadForm")?.addEventListener("submit", onBuyingPowerSubmit);
    $("ultimateRealtorForm")?.addEventListener("submit", onRealtorSubmit);

    bindProfileFilters();
    setCalcMode("price");
    updateLiveStats();
    updateProcessHighlight(0);
    syncProgramButtons();
    syncTermButtons();
    updateProgramPickerAvailability();

    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || params.get("agent") || params.get("realtor");
    const strip = $("ultimateRealtorStrip");
    if (strip && ref && !document.body.classList.contains("logan5-realtor")) {
      strip.classList.remove("hidden");
      const name = params.get("realtor_name") || ref.replace(/-/g, " ");
      strip.innerHTML = `Your realtor shared this calculator — questions? <a href="tel:+19192384934">Call Logan</a> or <a href="#" data-mmg-apply>apply</a> when you&rsquo;re ready. Partner: <strong>${name}</strong>`;
    }
  }

  window.MMG_logan5_applyReverse = applyReverseToCalculator;
  window.MMG_logan5_runReverse = runReversePayment;
  window.MMG_logan5_renderCreativeLoans = renderCreativeLoans;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();