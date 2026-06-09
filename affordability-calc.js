/**
 * Martini Mortgage Group — multi-calculator suite (Vonk Design 4 layout)
 */
(function () {
  "use strict";

  const APPLY_URL = window.MMG_SITE?.martiniApplyUrl || "https://applywithmartini.com";

  const COLORS = {
    pi: "#252f6e",
    tax: "#c9a227",
    ins: "#3d8f6e",
    pmi: "#e8a04a",
    hoa: "#6b8cce",
    extra: "#94a3b8",
    mip: "#e8a04a",
    funding: "#b07d10",
    savings: "#3d8f6e",
  };

  const TAB_MAP = {
    affordability: { hash: "affordability", title: "Affordability Calculator" },
    purchase: { hash: "purchase-item", title: "Purchase Calculator" },
    refinance: { hash: "refinance-item", title: "Refinance Calculator" },
    rentbuy: { hash: "rent-buy-item", title: "Rent vs Buy Calculator" },
    vapurchase: { hash: "veteran-affairs", title: "VA Purchase Calculator" },
    varefinance: { hash: "va-refinance", title: "VA Refinance Calculator" },
    dscr: { hash: "rental-loan", title: "Debt-Service (DSCR) Calculator" },
    fixflip: { hash: "fix-and-flip", title: "Fix & Flip Calculator" },
  };

  const HASH_TO_TAB = Object.fromEntries(
    Object.entries(TAB_MAP).map(([key, val]) => [val.hash, key])
  );

  const AFFORD_SUB_HASH = {
    "affordability-conventional": "conventional",
    "affordability-fha": "fha",
    "affordability-va": "va",
    "affordability-usda": "usda",
    "affordability-jumbo": "jumbo",
  };

  const DTI = {
    conventional: { front: 0.28, back: 0.36, label: "Conventional" },
    fha: { front: 0.31, back: 0.43, label: "FHA" },
    va: { front: 0.41, back: 0.41, label: "VA" },
    usda: { front: 0.29, back: 0.41, label: "USDA" },
    jumbo: { front: 0.36, back: 0.43, label: "Jumbo" },
  };

  const PROGRAM_DEFAULTS = {
    conventional: { down: 5, mip: 0 },
    fha: { down: 3.5, mip: 0.55 },
    va: { down: 0, mip: 0 },
    usda: { down: 0, mip: 0.35 },
    jumbo: { down: 15, mip: 0 },
  };

  let activeTab = "affordability";
  let affordProgram = "conventional";
  let marketRate = 6.25;
  const toggles = {
    "afd-down": "percent",
    "pur-down": "percent",
    "pur-tax": "percent",
    "pur-ins": "dollar",
    "rvb-down": "percent",
    "va-down": "percent",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function formatCurrency(n, digits) {
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: digits ?? 0,
      minimumFractionDigits: digits ?? 0,
    }).format(n);
  }

  function formatPct(n, digits) {
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(digits ?? 1)}%`;
  }

  function parseNum(raw) {
    const n = Number(String(raw ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function monthlyPI(principal, annualRate, years) {
    const p = Number(principal) || 0;
    const r = (Number(annualRate) || 0) / 100 / 12;
    const n = Math.max(1, (Number(years) || 30) * 12);
    if (p <= 0) return 0;
    if (r <= 0) return p / n;
    return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function totalInterestPaid(principal, annualRate, years, extraMonthly) {
    const p = Number(principal) || 0;
    const r = (Number(annualRate) || 0) / 100 / 12;
    let balance = p;
    let interest = 0;
    const basePi = monthlyPI(p, annualRate, years);
    const payment = basePi + (extraMonthly || 0);
    const maxMonths = (Number(years) || 30) * 12;
    for (let i = 0; i < maxMonths && balance > 0.01; i++) {
      const int = balance * r;
      let prin = payment - int;
      if (prin > balance) prin = balance;
      interest += int;
      balance -= prin;
    }
    return interest;
  }

  function payoffMonths(principal, annualRate, years, extraMonthly) {
    const p = Number(principal) || 0;
    const r = (Number(annualRate) || 0) / 100 / 12;
    let balance = p;
    const basePi = monthlyPI(p, annualRate, years);
    const payment = basePi + (extraMonthly || 0);
    let months = 0;
    const maxMonths = (Number(years) || 30) * 12;
    while (balance > 0.01 && months < maxMonths) {
      const int = balance * r;
      let prin = payment - int;
      if (prin > balance) prin = balance;
      balance -= prin;
      months++;
    }
    return months;
  }

  function remainingBalance(principal, annualRate, years, monthsPaid) {
    const p = Number(principal) || 0;
    const r = (Number(annualRate) || 0) / 100 / 12;
    const n = (Number(years) || 30) * 12;
    const pi = monthlyPI(p, annualRate, years);
    let balance = p;
    for (let i = 0; i < monthsPaid && balance > 0; i++) {
      const int = balance * r;
      const prin = pi - int;
      balance = Math.max(0, balance - prin);
    }
    return balance;
  }

  function downAmount(homePrice, raw, mode) {
    const val = parseNum(raw);
    return mode === "percent" ? Math.round((homePrice * val) / 100) : val;
  }

  function vaFundingPct(option, downPct) {
    if (option === "exempt") return 0;
    const base = option === "after_first_use" ? 3.3 : 2.15;
    return downPct >= 10 ? (option === "after_first_use" ? 1.5 : 1.25) : base;
  }

  function estimatePmiMonthly(loan, homePrice, downPct, program) {
    if (program === "va" || program === "usda" || program === "jumbo") {
      if (downPct >= 20 || program === "jumbo") return 0;
    }
    if (downPct >= 20 || program === "va") return 0;
    const rate = program === "fha" ? 0.0055 : 0.0045;
    return Math.round((loan * rate) / 12);
  }

  function estimateMipMonthly(loan, program, annualPct) {
    if (program === "fha" || program === "usda") {
      return Math.round((loan * (annualPct / 100)) / 12);
    }
    return 0;
  }

  function solveMaxPrice(inputs) {
    const limits = DTI[inputs.program] || DTI.conventional;
    const capFront = inputs.income * limits.front;
    const capBack = inputs.income * limits.back - inputs.debts;
    const cap = Math.max(0, Math.min(capFront, capBack));
    if (cap <= 0) return { maxPrice: 0, cap };

    let lo = 50000;
    let hi = 5000000;
    let best = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const br = paymentBreakdown(mid, inputs);
      if (br.total <= cap) {
        best = mid;
        lo = mid + 2500;
      } else {
        hi = mid - 2500;
      }
    }
    return { maxPrice: best, cap };
  }

  function paymentBreakdown(homePrice, cfg) {
    const down = downAmount(homePrice, cfg.downRaw, cfg.downMode);
    const downPct = homePrice > 0 ? (down / homePrice) * 100 : 0;
    let loan = Math.max(0, homePrice - down);
    let fundingFee = 0;

    if (cfg.program === "va") {
      const feePct = vaFundingPct(cfg.vaOption, downPct);
      fundingFee = Math.round(loan * (feePct / 100));
      loan += fundingFee;
    }

    const pi = monthlyPI(loan, cfg.rate, cfg.termYears);
    const monthlyTax = (homePrice * cfg.taxPct) / 100 / 12;
    const monthlyIns = cfg.insuranceAnnual / 12;
    const monthlyHoa = cfg.hoa || 0;

    let monthlyPmi = 0;
    if (cfg.program === "fha" || cfg.program === "usda") {
      monthlyPmi = estimateMipMonthly(loan, cfg.program, cfg.annualMip);
    } else {
      monthlyPmi = estimatePmiMonthly(loan, homePrice, downPct, cfg.program);
    }

    const total = pi + monthlyTax + monthlyIns + monthlyPmi + monthlyHoa + (cfg.extra || 0);
    return {
      homePrice,
      down,
      downPct,
      loan,
      fundingFee,
      pi,
      monthlyTax,
      monthlyIns,
      monthlyPmi,
      hoa: monthlyHoa,
      extra: cfg.extra || 0,
      total,
    };
  }

  function getAffordConfig() {
    const program = affordProgram;
    const defaults = PROGRAM_DEFAULTS[program] || PROGRAM_DEFAULTS.conventional;
    return {
      program,
      income: parseNum($("afdIncome")?.value),
      debts: parseNum($("afdDebts")?.value),
      homePrice: parseNum($("afdHomePrice")?.value),
      downRaw: parseNum($("afdDownPayment")?.value) || defaults.down,
      downMode: toggles["afd-down"],
      termYears: parseNum($("afdLoanTerm")?.value) || 30,
      rate: parseNum($("afdRate")?.value) || marketRate,
      taxPct: parseNum($("afdTaxPct")?.value) || 0.6,
      insuranceAnnual: parseNum($("afdInsurance")?.value) || 1200,
      hoa: parseNum($("afdHoa")?.value),
      annualMip: parseNum($("afdAnnualMip")?.value) || defaults.mip,
      vaOption: $("afdVaFundingOption")?.value || "first_use",
      credit: parseNum($("afdCredit")?.value) || 740,
    };
  }

  function drawDonut(canvas, segments, centerLabel) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const size = 150;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const r = 52;
    const stroke = 18;
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#e2e4ec";
    ctx.lineWidth = stroke;
    ctx.stroke();

    let start = -Math.PI / 2;
    segments.forEach((seg) => {
      if (seg.value <= 0) return;
      const angle = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = stroke;
      ctx.stroke();
      start += angle;
    });

    const center = $("afdDonutCenter");
    if (center) center.textContent = centerLabel;
  }

  function renderLegend(el, segments) {
    if (!el) return;
    el.innerHTML = segments
      .filter((s) => s.value > 0)
      .map(
        (seg) =>
          `<li><span class="dot" style="background:${seg.color}"></span><span>${seg.label}</span><strong>${formatCurrency(seg.value)}</strong></li>`
      )
      .join("");
  }

  function setDetailLists(monthlyRows, totalRows) {
    const m = $("afdDetailMonthly");
    const t = $("afdDetailTotal");
    if (m) {
      m.innerHTML = monthlyRows
        .map(([label, val]) => `<li><span>${label}</span><span>${val}</span></li>`)
        .join("");
    }
    if (t) {
      t.innerHTML = totalRows
        .map(([label, val]) => `<li><span>${label}</span><span>${val}</span></li>`)
        .join("");
    }
  }

  function setStats(payment, loan, third, thirdLabel) {
    $("statPayment") && ($("statPayment").textContent = payment);
    $("statLoan") && ($("statLoan").textContent = loan);
    const wrap = $("statThirdWrap");
    if (wrap) {
      const label = thirdLabel || "Total Interest";
      wrap.innerHTML = `${label}<strong id="statThird">${third}</strong>`;
    }
  }

  function buildSegments(br, program) {
    const pmiLabel = program === "fha" || program === "usda" ? "MIP" : "PMI";
    const segs = [
      { label: "Principal & Interest", value: br.pi, color: COLORS.pi },
      { label: "Property Tax", value: br.monthlyTax, color: COLORS.tax },
      { label: "Insurance", value: br.monthlyIns, color: COLORS.ins },
    ];
    if (br.monthlyPmi > 0) segs.push({ label: pmiLabel, value: br.monthlyPmi, color: COLORS.pmi });
    if (br.hoa > 0) segs.push({ label: "HOA", value: br.hoa, color: COLORS.hoa });
    if (br.extra > 0) segs.push({ label: "Extra Payment", value: br.extra, color: COLORS.extra });
    return segs;
  }

  function renderAffordability() {
    const cfg = getAffordConfig();
    const br = paymentBreakdown(cfg.homePrice, cfg);
    $("afdLoanAmount") && ($("afdLoanAmount").value = String(Math.round(br.loan)));

    const limits = DTI[cfg.program] || DTI.conventional;
    const frontDti = cfg.income > 0 ? (br.total / cfg.income) * 100 : 0;
    const backDti = cfg.income > 0 ? ((br.total + cfg.debts) / cfg.income) * 100 : 0;
    const { maxPrice, cap } = solveMaxPrice(cfg);

    const hero = $("afdAffordHero");
    hero?.classList.remove("hidden");
    $("afdMaxPrice") && ($("afdMaxPrice").textContent = formatCurrency(maxPrice));
    $("afdAffordNote") &&
      ($("afdAffordNote").textContent =
        maxPrice > 0
          ? `${limits.label} · ${formatPct(br.downPct)} down · DTI ${Math.round(frontDti)}%/${Math.round(backDti)}% (max ${Math.round(limits.front * 100)}%/${Math.round(limits.back * 100)}%)`
          : "Adjust income, debts, or program — current inputs may exceed typical DTI limits.");

    const segs = buildSegments(br, cfg.program);
    drawDonut($("afdDonut"), segs, formatCurrency(br.total));
    renderLegend($("afdLegend"), segs);

    setStats(formatCurrency(br.total), formatCurrency(br.loan), formatCurrency(cap), "Max Payment");

    const pmiLabel = cfg.program === "fha" || cfg.program === "usda" ? "MIP" : "PMI";
    setDetailLists(
      [
        ["Gross income", formatCurrency(cfg.income)],
        ["Monthly debts", formatCurrency(cfg.debts)],
        ["Home value", formatCurrency(br.homePrice)],
        ["Mortgage amount", formatCurrency(br.loan)],
        ["Principal & interest", formatCurrency(br.pi)],
        ["Property tax", formatCurrency(br.monthlyTax)],
        ["Insurance", formatCurrency(br.monthlyIns)],
        [pmiLabel, formatCurrency(br.monthlyPmi)],
        ["HOA", formatCurrency(br.hoa)],
        ["Housing DTI (front)", formatPct(frontDti)],
        ["Total DTI (back)", formatPct(backDti)],
      ],
      [
        ["Down payment", formatCurrency(br.down)],
        ["Loan term", `${cfg.termYears} years`],
        ["Rate", formatPct(cfg.rate, 3)],
        ["Total interest (est.)", formatCurrency(totalInterestPaid(br.loan, cfg.rate, cfg.termYears))],
        ["Program", limits.label],
        ["Max affordable price", formatCurrency(maxPrice)],
      ]
    );

    $("afdSummaryText") &&
      ($("afdSummaryText").textContent =
        `Based on your inputs, total housing payment is ${formatCurrency(br.total)}/mo on a ${limits.label} loan with ${formatPct(br.downPct)} down. Your debt-to-income is ${Math.round(frontDti)}%/${Math.round(backDti)}% vs typical ${Math.round(limits.front * 100)}%/${Math.round(limits.back * 100)}% limits.`);

    toggleSidePanel(false);
  }

  function renderPurchase() {
    const homePrice = parseNum($("purHomePrice")?.value);
    const down = downAmount(homePrice, $("purDownPayment")?.value, toggles["pur-down"]);
    const loan = Math.max(0, homePrice - down);
    const termYears = parseNum($("purLoanTerm")?.value) || 30;
    const rate = parseNum($("purInterestRate")?.value) || marketRate;
    const taxRaw = parseNum($("purPropertyTax")?.value);
    const insRaw = parseNum($("purInsurance")?.value);
    const monthlyTax =
      toggles["pur-tax"] === "percent" ? (homePrice * taxRaw) / 100 / 12 : taxRaw / 12;
    const monthlyIns =
      toggles["pur-ins"] === "percent" ? (homePrice * insRaw) / 100 / 12 : insRaw / 12;
    const hoa = parseNum($("purHoa")?.value);
    const extra = parseNum($("purExtraPayment")?.value);
    const downPct = homePrice > 0 ? (down / homePrice) * 100 : 0;
    const pi = monthlyPI(loan, rate, termYears);
    const monthlyPmi = estimatePmiMonthly(loan, homePrice, downPct, "conventional");
    const total = pi + monthlyTax + monthlyIns + monthlyPmi + hoa + extra;
    const totalInt = totalInterestPaid(loan, rate, termYears, extra);

    $("purLoanAmount") && ($("purLoanAmount").value = String(Math.round(loan)));

    const br = { pi, monthlyTax, monthlyIns, monthlyPmi, hoa, extra, total, loan, down, homePrice };
    const segs = buildSegments(br, "conventional");
    drawDonut($("afdDonut"), segs, formatCurrency(total));
    renderLegend($("afdLegend"), segs);
    setStats(formatCurrency(total), formatCurrency(loan), formatCurrency(totalInt), "Total Interest");

    const months = termYears * 12;
    setDetailLists(
      [
        ["Home value", formatCurrency(homePrice)],
        ["Mortgage amount", formatCurrency(loan)],
        ["Principal & interest", formatCurrency(pi)],
        ["Property tax", formatCurrency(monthlyTax)],
        ["Insurance", formatCurrency(monthlyIns)],
        ["PMI", formatCurrency(monthlyPmi)],
        ["HOA", formatCurrency(hoa)],
        ["Extra payment", formatCurrency(extra)],
      ],
      [
        ["Total # of payments", String(months)],
        ["Down payment", formatCurrency(down)],
        ["Principal", formatCurrency(loan)],
        ["Total interest paid", formatCurrency(totalInt)],
        ["Total of all payments", formatCurrency(total * months + down)],
      ]
    );

    updatePayoffSide(loan, rate, termYears, extra);
    $("afdAffordHero")?.classList.add("hidden");
    $("afdSummaryText") &&
      ($("afdSummaryText").textContent = `Estimated monthly payment ${formatCurrency(total)} on a ${formatCurrency(homePrice)} home with ${formatPct(downPct)} down at ${formatPct(rate, 3)}.`);
    toggleSidePanel(true);
  }

  function renderRefinance() {
    const origLoan = parseNum($("rfOrigLoan")?.value);
    const origRate = parseNum($("rfOrigRate")?.value);
    const origTerm = parseNum($("rfOrigTerm")?.value) || 30;
    const monthsPaid = parseNum($("rfMonthsElapsed")?.value);
    const balance = parseNum($("rfBalance")?.value) || remainingBalance(origLoan, origRate, origTerm, monthsPaid);
    const cashOut = parseNum($("rfCashOut")?.value);
    const fees = parseNum($("rfFees")?.value);
    const feesInLoan = document.querySelector('input[name="rfFeesInLoan"]:checked')?.value === "yes";
    let newLoan = balance + cashOut + (feesInLoan ? fees : 0);
    const newRate = parseNum($("rfNewRate")?.value) || marketRate;
    const newTerm = parseNum($("rfNewTerm")?.value) || 30;

    $("rfBalance") && balance && ($("rfBalance").value = String(Math.round(balance)));
    $("rfNewLoan") && ($("rfNewLoan").value = String(Math.round(newLoan)));

    const oldPi = monthlyPI(balance, origRate, Math.max(1, origTerm - monthsPaid / 12));
    const newPi = monthlyPI(newLoan, newRate, newTerm);
    const monthlySavings = oldPi - newPi;
    const oldTotalInt = totalInterestPaid(balance, origRate, Math.max(1, origTerm - monthsPaid / 12));
    const newTotalInt = totalInterestPaid(newLoan, newRate, newTerm);
    const interestSavings = oldTotalInt - newTotalInt;

    const segs = [
      { label: "New P&I", value: newPi, color: COLORS.pi },
      { label: "Monthly Savings", value: Math.max(0, monthlySavings), color: COLORS.savings },
    ];
    drawDonut($("afdDonut"), segs, formatCurrency(newPi));
    renderLegend($("afdLegend"), segs);

    setStats(formatCurrency(newPi), formatCurrency(newLoan), formatCurrency(monthlySavings), "Monthly Savings");

    setDetailLists(
      [
        ["Current balance", formatCurrency(balance)],
        ["Old payment (P&I est.)", formatCurrency(oldPi)],
        ["New payment (P&I)", formatCurrency(newPi)],
        ["Monthly savings", formatCurrency(monthlySavings)],
        ["Cash out", formatCurrency(cashOut)],
        ["Refinance costs", formatCurrency(fees)],
      ],
      [
        ["Old remaining interest", formatCurrency(oldTotalInt)],
        ["New total interest", formatCurrency(newTotalInt)],
        ["Interest savings", formatCurrency(interestSavings)],
        ["New loan amount", formatCurrency(newLoan)],
        ["New rate", formatPct(newRate, 3)],
        ["New term", `${newTerm} years`],
      ]
    );

    $("sideSavings") && ($("sideSavings").textContent = formatCurrency(Math.max(0, interestSavings)));
    $("sidePayment") && ($("sidePayment").textContent = formatCurrency(Math.max(0, monthlySavings)));
    $("sideTerm") && ($("sideTerm").textContent = monthlySavings > 0 ? "—" : "—");
    $("afdAffordHero")?.classList.add("hidden");
    $("afdSummaryText") &&
      ($("afdSummaryText").textContent =
        monthlySavings > 0
          ? `Refinancing may lower your principal & interest by about ${formatCurrency(monthlySavings)}/mo and save roughly ${formatCurrency(interestSavings)} in interest over the new loan term.`
          : `Your new payment may be higher — consider a shorter term or lower rate to improve savings.`);
    toggleSidePanel(false);
  }

  function renderRentBuy() {
    const homePrice = parseNum($("rvbHomePrice")?.value);
    const down = downAmount(homePrice, $("rvbDown")?.value, toggles["rvb-down"]);
    const loan = Math.max(0, homePrice - down);
    const rate = parseNum($("rvbRate")?.value) || marketRate;
    const term = parseNum($("rvbTerm")?.value) || 30;
    const years = parseNum($("rvbYears")?.value) || 7;
    const pi = monthlyPI(loan, rate, term);
    const monthlyTax = parseNum($("rvbTax")?.value) / 12;
    const monthlyIns = parseNum($("rvbIns")?.value) / 12;
    const monthlyHoa = parseNum($("rvbHoa")?.value) / 12;
    const maintPct = parseNum($("rvbMaint")?.value) / 100;
    const appreciation = parseNum($("rvbAppreciation")?.value) / 100;
    const sellPct = parseNum($("rvbSellCost")?.value) / 100;
    const rent = parseNum($("rvbRent")?.value);
    const rentGrowth = parseNum($("rvbRentGrowth")?.value) / 100;

    let buyCost = down;
    let rentCost = 0;
    let homeValue = homePrice;
    let monthlyRent = rent;
    let equity = down;

    for (let y = 0; y < years; y++) {
      const annualMortgage = pi * 12;
      const annualTaxInsHoa = (monthlyTax + monthlyIns + monthlyHoa) * 12;
      const annualMaint = homeValue * maintPct;
      buyCost += annualMortgage + annualTaxInsHoa + annualMaint;
      rentCost += monthlyRent * 12;
      homeValue *= 1 + appreciation;
      monthlyRent *= 1 + rentGrowth;
      equity = homeValue * (1 - sellPct) - remainingBalance(loan, rate, term, (y + 1) * 12);
    }

    const netBuy = buyCost - Math.max(0, equity);
    const netRent = rentCost;
    const advantage = netRent - netBuy;
    const winner = advantage > 0 ? "Buying" : "Renting";

    const monthlyOwn = pi + monthlyTax + monthlyIns + monthlyHoa;
    const segs = [
      { label: "Ownership/mo", value: monthlyOwn, color: COLORS.pi },
      { label: "Rent/mo", value: rent, color: COLORS.tax },
    ];
    drawDonut($("afdDonut"), segs, formatCurrency(monthlyOwn));
    renderLegend($("afdLegend"), segs);

    setStats(formatCurrency(monthlyOwn), formatCurrency(loan), formatCurrency(advantage), `${years}yr Advantage`);

    setDetailLists(
      [
        ["Monthly ownership cost", formatCurrency(monthlyOwn)],
        ["Monthly rent (yr 1)", formatCurrency(rent)],
        [`${years}-yr net buy cost`, formatCurrency(netBuy)],
        [`${years}-yr rent cost`, formatCurrency(netRent)],
        ["Estimated equity", formatCurrency(Math.max(0, equity))],
        ["Recommendation", winner],
      ],
      [
        ["Home price", formatCurrency(homePrice)],
        ["Down payment", formatCurrency(down)],
        ["Appreciation/yr", formatPct(parseNum($("rvbAppreciation")?.value))],
        ["Rent growth/yr", formatPct(parseNum($("rvbRentGrowth")?.value))],
        ["Selling costs", formatPct(parseNum($("rvbSellCost")?.value))],
        ["Advantage", formatCurrency(Math.abs(advantage))],
      ]
    );

    $("afdAffordHero")?.classList.add("hidden");
    $("afdSummaryText") &&
      ($("afdSummaryText").textContent =
        `${winner} may cost less over ${years} years by about ${formatCurrency(Math.abs(advantage))} based on these assumptions (not tax-adjusted).`);
    toggleSidePanel(false);
  }

  function renderVaPurchase() {
    const homePrice = parseNum($("vaHomePrice")?.value);
    const down = downAmount(homePrice, $("vaDown")?.value, toggles["va-down"]);
    const downPct = homePrice > 0 ? (down / homePrice) * 100 : 0;
    const baseLoan = Math.max(0, homePrice - down);
    const vaOption = $("vaFundingOption")?.value || "first_use";
    const feePct = vaFundingPct(vaOption, downPct);
    $("vaFundingFee") && ($("vaFundingFee").value = String(feePct));
    const fundingFee = Math.round(baseLoan * (feePct / 100));
    const finalLoan = baseLoan + fundingFee;
    const term = parseNum($("vaTerm")?.value) || 30;
    const rate = parseNum($("vaRate")?.value) || marketRate;
    const taxPct = parseNum($("vaTax")?.value) || 0.6;
    const insAnnual = parseNum($("vaIns")?.value) || 1200;
    const hoa = parseNum($("vaHoa")?.value);
    const extra = parseNum($("vaExtra")?.value);

    $("vaBaseLoan") && ($("vaBaseLoan").value = String(Math.round(baseLoan)));
    $("vaFinalLoan") && ($("vaFinalLoan").value = String(Math.round(finalLoan)));

    const pi = monthlyPI(finalLoan, rate, term);
    const monthlyTax = (homePrice * taxPct) / 100 / 12;
    const monthlyIns = insAnnual / 12;
    const total = pi + monthlyTax + monthlyIns + hoa + extra;

    const br = { pi, monthlyTax, monthlyIns, monthlyPmi: 0, hoa, extra, total, loan: finalLoan, down, homePrice };
    const segs = buildSegments(br, "va");
    if (fundingFee > 0) segs.push({ label: "Funding Fee (financed)", value: fundingFee / term / 12, color: COLORS.funding });
    drawDonut($("afdDonut"), segs, formatCurrency(total));
    renderLegend($("afdLegend"), segs);

    setStats(formatCurrency(total), formatCurrency(finalLoan), formatCurrency(fundingFee), "Funding Fee");

    setDetailLists(
      [
        ["Home value", formatCurrency(homePrice)],
        ["Base loan", formatCurrency(baseLoan)],
        ["Final loan (with fee)", formatCurrency(finalLoan)],
        ["Principal & interest", formatCurrency(pi)],
        ["Property tax", formatCurrency(monthlyTax)],
        ["Insurance", formatCurrency(monthlyIns)],
        ["HOA", formatCurrency(hoa)],
        ["Extra payment", formatCurrency(extra)],
      ],
      [
        ["Down payment", formatCurrency(down)],
        ["VA funding fee", formatCurrency(fundingFee)],
        ["Rate", formatPct(rate, 3)],
        ["Term", `${term} years`],
        ["Total interest", formatCurrency(totalInterestPaid(finalLoan, rate, term, extra))],
      ]
    );

    updatePayoffSide(finalLoan, rate, term, extra);
    $("afdAffordHero")?.classList.add("hidden");
    $("afdSummaryText") &&
      ($("afdSummaryText").textContent = `VA purchase estimate: ${formatCurrency(total)}/mo with ${formatPct(feePct, 2)} funding fee financed into the loan.`);
    toggleSidePanel(true);
  }

  function renderVaRefinance() {
    const balance = parseNum($("varBalance")?.value);
    const origRate = parseNum($("varOrigRate")?.value);
    const origTerm = parseNum($("varOrigTerm")?.value) || 30;
    const newRate = parseNum($("varNewRate")?.value) || marketRate;
    const newTerm = parseNum($("varNewTerm")?.value) || 30;
    const fees = parseNum($("varFees")?.value);
    const exempt = $("varFundingOption")?.value === "exempt";
    const feePct = exempt ? 0 : 0.5;
    const fundingFee = Math.round(balance * (feePct / 100));
    const newLoan = balance + fundingFee;
    const oldPi = monthlyPI(balance, origRate, origTerm);
    const newPi = monthlyPI(newLoan, newRate, newTerm);
    const savings = oldPi - newPi;

    const segs = [
      { label: "New P&I", value: newPi, color: COLORS.pi },
      { label: "Savings", value: Math.max(0, savings), color: COLORS.savings },
    ];
    drawDonut($("afdDonut"), segs, formatCurrency(newPi));
    renderLegend($("afdLegend"), segs);

    setStats(formatCurrency(newPi), formatCurrency(newLoan), formatCurrency(savings), "Monthly Savings");

    setDetailLists(
      [
        ["Current balance", formatCurrency(balance)],
        ["Old P&I", formatCurrency(oldPi)],
        ["New P&I", formatCurrency(newPi)],
        ["Monthly savings", formatCurrency(savings)],
        ["Funding fee", formatCurrency(fundingFee)],
        ["Closing costs", formatCurrency(fees)],
      ],
      [
        ["New loan amount", formatCurrency(newLoan)],
        ["New rate", formatPct(newRate, 3)],
        ["New term", `${newTerm} years`],
        ["Interest savings (est.)", formatCurrency(totalInterestPaid(balance, origRate, origTerm) - totalInterestPaid(newLoan, newRate, newTerm))],
      ]
    );

    $("afdAffordHero")?.classList.add("hidden");
    $("afdSummaryText") &&
      ($("afdSummaryText").textContent = `VA IRRRL estimate: ${formatCurrency(newPi)}/mo — ${savings > 0 ? `about ${formatCurrency(savings)}/mo less than current P&I.` : "payment may increase; verify break-even with your loan officer."}`);
    toggleSidePanel(false);
  }

  function renderDscr() {
    const value = parseNum($("dscrValue")?.value);
    const ltv = parseNum($("dscrLtv")?.value) || 75;
    const loan = Math.round(value * (ltv / 100));
    const rate = parseNum($("dscrRate")?.value) || 7.5;
    const term = parseNum($("dscrTerm")?.value) || 30;
    const rent1 = parseNum($("dscrRent1")?.value);
    const rent2 = parseNum($("dscrRent2")?.value);
    const vacancy = parseNum($("dscrVacancy")?.value) / 100;
    const grossRent = (rent1 + rent2) * 12;
    const effectiveRent = grossRent * (1 - vacancy);
    const taxes = parseNum($("dscrTax")?.value);
    const ins = parseNum($("dscrIns")?.value);
    const hoa = parseNum($("dscrHoa")?.value) * 12;
    const maint = parseNum($("dscrMaint")?.value);
    const utils = parseNum($("dscrUtils")?.value);
    const origFee = parseNum($("dscrOrigFee")?.value) / 100;
    const pi = monthlyPI(loan, rate, term);
    const annualDebt = pi * 12;
    const noi = effectiveRent - taxes - ins - hoa - maint - utils;
    const dscr = annualDebt > 0 ? noi / annualDebt : 0;
    const minDscr = 1.0;
    const maxLoanAt1 = annualDebt > 0 ? (noi / minDscr / 12) : 0;
    const maxLoanPi = monthlyPI(maxLoanAt1, rate, term);
    const qualifying = dscr >= minDscr;

    const segs = [
      { label: "Debt Service/mo", value: pi, color: COLORS.pi },
      { label: "Net Rent/mo", value: noi / 12, color: COLORS.ins },
    ];
    drawDonut($("afdDonut"), segs, formatCurrency(pi));
    renderLegend($("afdLegend"), segs);

    setStats(formatCurrency(pi), formatCurrency(loan), formatPct(dscr, 2), "DSCR Ratio");

    setDetailLists(
      [
        ["Gross annual rent", formatCurrency(grossRent)],
        ["Effective rent (after vacancy)", formatCurrency(effectiveRent)],
        ["Annual NOI", formatCurrency(noi)],
        ["Annual debt service", formatCurrency(annualDebt)],
        ["DSCR ratio", formatPct(dscr, 2)],
        ["Qualifies at 1.0+", qualifying ? "Likely yes" : "Review needed"],
      ],
      [
        ["Property value", formatCurrency(value)],
        ["LTV", formatPct(ltv)],
        ["Loan amount", formatCurrency(loan)],
        ["Origination fee", formatPct(parseNum($("dscrOrigFee")?.value))],
        ["Rate", formatPct(rate, 3)],
        ["Max P&I at 1.0 DSCR", formatCurrency(maxLoanPi)],
      ]
    );

    $("afdAffordHero")?.classList.add("hidden");
    $("afdSummaryText") &&
      ($("afdSummaryText").textContent = `DSCR ${formatPct(dscr, 2)} — ${qualifying ? "rental income likely supports this debt service at a 1.0+ ratio." : "may need lower loan amount, higher rents, or different program."}`);
    toggleSidePanel(false);
  }

  function renderFixFlip() {
    const purchase = parseNum($("ffPurchase")?.value);
    const rehab = parseNum($("ffRehab")?.value);
    const arv = parseNum($("ffArv")?.value);
    const months = parseNum($("ffMonths")?.value) || 9;
    const ltv = parseNum($("ffLtv")?.value) || 80;
    const rate = parseNum($("ffRate")?.value) || 10;
    const origFee = parseNum($("ffOrigFee")?.value) / 100;
    const closingPct = parseNum($("ffClosing")?.value) / 100;
    const sellPct = parseNum($("ffSellCost")?.value) / 100;
    const taxAnnual = parseNum($("ffTax")?.value);
    const insAnnual = parseNum($("ffIns")?.value);

    const loanBase = Math.round(purchase * (ltv / 100));
    const origCost = Math.round(loanBase * origFee);
    const closingCost = Math.round(purchase * closingPct);
    const totalLoan = loanBase + origCost;
    const monthlyRate = rate / 100 / 12;
    const interest = totalLoan * monthlyRate * months;
    const holdingTaxIns = ((taxAnnual + insAnnual) / 12) * months;
    const cashInvested = purchase - loanBase + rehab + closingCost + (purchase - loanBase > 0 ? purchase - loanBase : 0);
    const cashToClose = Math.max(0, purchase - loanBase) + rehab + closingCost + origCost;
    const sellCosts = arv * sellPct;
    const profit = arv - purchase - rehab - interest - holdingTaxIns - sellCosts - closingCost - origCost;
    const roi = cashToClose > 0 ? (profit / cashToClose) * 100 : 0;

    const segs = [
      { label: "Interest/hold", value: interest / months, color: COLORS.pi },
      { label: "Rehab (spread)", value: rehab / months, color: COLORS.pmi },
      { label: "Projected profit/mo", value: Math.max(0, profit / months), color: COLORS.ins },
    ];
    drawDonut($("afdDonut"), segs, formatCurrency(profit));
    renderLegend($("afdLegend"), segs);

    setStats(formatCurrency(profit), formatCurrency(totalLoan), formatPct(roi, 1), "ROI");

    setDetailLists(
      [
        ["Purchase price", formatCurrency(purchase)],
        ["Renovation", formatCurrency(rehab)],
        ["ARV", formatCurrency(arv)],
        ["Loan amount", formatCurrency(totalLoan)],
        ["Hold period", `${months} months`],
        ["Interest cost", formatCurrency(interest)],
        ["Selling costs", formatCurrency(sellCosts)],
        ["Est. profit", formatCurrency(profit)],
      ],
      [
        ["Cash to close (est.)", formatCurrency(cashToClose)],
        ["ROI on cash", formatPct(roi, 1)],
        ["Rate", formatPct(rate, 3)],
        ["LTV", formatPct(ltv)],
        ["Origination", formatPct(parseNum($("ffOrigFee")?.value))],
        ["Cost to sell", formatPct(parseNum($("ffSellCost")?.value))],
      ]
    );

    $("afdAffordHero")?.classList.add("hidden");
    $("afdSummaryText") &&
      ($("afdSummaryText").textContent = `Fix & flip estimate: ${formatCurrency(profit)} profit over ${months} months (${formatPct(roi, 1)} ROI on cash invested) — educational only.`);
    toggleSidePanel(false);
  }

  function updatePayoffSide(loan, rate, termYears, formExtra) {
    const extra = parseNum($("afdExtraStrategy")?.value) || formExtra || 0;
    const baseMonths = termYears * 12;
    const newMonths = payoffMonths(loan, rate, termYears, extra);
    const savedMonths = Math.max(0, baseMonths - newMonths);
    const baseInt = totalInterestPaid(loan, rate, termYears);
    const newInt = totalInterestPaid(loan, rate, termYears, extra);
    const saved = Math.max(0, baseInt - newInt);

    $("sideSavings") && ($("sideSavings").textContent = formatCurrency(saved));
    $("sidePayment") && ($("sidePayment").textContent = formatCurrency(monthlyPI(loan, rate, termYears) + extra));
    $("sideTerm") && ($("sideTerm").textContent = savedMonths > 0 ? `${savedMonths} mo` : "—");
  }

  function toggleSidePanel(showPayoff) {
    $("afdPayoffCard")?.classList.toggle("hidden", !showPayoff);
  }

  function applyAffordProgram(program) {
    affordProgram = program;
    const defaults = PROGRAM_DEFAULTS[program] || PROGRAM_DEFAULTS.conventional;
    document.querySelectorAll(".afd-subtabs li").forEach((li) => {
      li.classList.toggle("active", li.querySelector("a")?.dataset.program === program);
    });
    document.querySelectorAll("[class*='afd-only-']").forEach((el) => {
      const classes = Array.from(el.classList).filter((c) => c.startsWith("afd-only-"));
      const show = classes.some((c) => c === `afd-only-${program}`);
      el.classList.toggle("hidden", !show);
    });
    if (program === "fha" || program === "usda") {
      $("afdAnnualMip") && ($("afdAnnualMip").value = String(defaults.mip));
      $("afdMipLabel") &&
        ($("afdMipLabel").textContent = program === "fha" ? "Annual MIP (%)" : "Annual Guarantee Fee (%)");
    }
    if ($("afdDownPayment") && ! $("afdDownPayment").dataset.touched) {
      $("afdDownPayment").value = String(defaults.down);
    }
    recalc();
  }

  const RENDERERS = {
    affordability: renderAffordability,
    purchase: renderPurchase,
    refinance: renderRefinance,
    rentbuy: renderRentBuy,
    vapurchase: renderVaPurchase,
    varefinance: renderVaRefinance,
    dscr: renderDscr,
    fixflip: renderFixFlip,
  };

  function recalc() {
    (RENDERERS[activeTab] || renderAffordability)();
  }

  function setToggle(group, mode) {
    toggles[group] = mode;
    document.querySelectorAll(`[data-toggle-group="${group}"]`).forEach((label) => {
      const on = label.dataset.mode === mode;
      label.classList.toggle("active", on);
      const input = label.querySelector("input");
      if (input) input.checked = on;
    });
  }

  function switchTab(tabKey, options) {
    const opts = options || {};
    if (!TAB_MAP[tabKey]) tabKey = "affordability";
    activeTab = tabKey;
    const info = TAB_MAP[tabKey];

    document.querySelectorAll(".afd-tabs li").forEach((li) => {
      li.classList.toggle("active", li.dataset.tab === tabKey);
    });
    document.querySelectorAll(".afd-tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tab === tabKey);
    });
    $("afdLeftTitle") && ($("afdLeftTitle").textContent = info.title);

    if (!opts.skipHash) {
      const hash = info.hash;
      if (location.hash.replace("#", "") !== hash) {
        history.replaceState(null, "", `#${hash}`);
      }
    }
    recalc();
  }

  function resolveRoute() {
    const raw = (location.hash || "#affordability").replace("#", "");
    if (AFFORD_SUB_HASH[raw]) {
      switchTab("affordability", { skipHash: true });
      applyAffordProgram(AFFORD_SUB_HASH[raw]);
      history.replaceState(null, "", `#${raw}`);
      return;
    }
    const tab = HASH_TO_TAB[raw] || (raw === "affordability" ? "affordability" : null);
    if (tab) {
      switchTab(tab, { skipHash: true });
      if (tab === "affordability") applyAffordProgram(affordProgram);
      return;
    }
    switchTab("affordability", { skipHash: true });
    applyAffordProgram("conventional");
  }

  function bindTabs() {
    document.querySelectorAll(".afd-tabs a").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const li = link.closest("li");
        const tab = li?.dataset.tab;
        if (tab) switchTab(tab);
      });
    });

    document.querySelectorAll(".afd-subtabs a").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const program = link.dataset.program;
        if (!program) return;
        switchTab("affordability", { skipHash: true });
        applyAffordProgram(program);
        const subHash = Object.entries(AFFORD_SUB_HASH).find(([, p]) => p === program)?.[0];
        if (subHash) history.replaceState(null, "", `#${subHash}`);
      });
    });

    document.querySelectorAll(".afd-detail-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".afd-detail-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.detail;
        $("afdDetailMonthly")?.classList.toggle("active", target === "monthly");
        $("afdDetailTotal")?.classList.toggle("active", target === "total");
      });
    });

    window.addEventListener("hashchange", resolveRoute);
    resolveRoute();
  }

  function bindToggles() {
    document.querySelectorAll("[data-toggle-group]").forEach((label) => {
      label.addEventListener("click", () => {
        const group = label.dataset.toggleGroup;
        const mode = label.dataset.mode;
        setToggle(group, mode);
        recalc();
      });
    });

    document.querySelectorAll(".afd-choice-pill").forEach((label) => {
      label.addEventListener("click", () => {
        const name = label.querySelector("input")?.name;
        if (!name) return;
        document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
          input.closest(".afd-choice-pill")?.classList.toggle("active", input === label.querySelector("input"));
        });
        recalc();
      });
    });
  }

  function bindInputs() {
    document.querySelectorAll(".afd-calc-input, .afd-side-input").forEach((el) => {
      el.addEventListener("input", () => {
        el.dataset.touched = "1";
        recalc();
      });
      el.addEventListener("change", recalc);
    });
  }

  function bindQuoteButtons() {
    document.querySelectorAll("[data-afd-quote]").forEach((btn) => {
      btn.href = APPLY_URL;
      btn.setAttribute("target", "_blank");
      btn.setAttribute("rel", "noopener");
    });
  }

  async function loadMarketRate() {
    try {
      const res = await fetch("/api/market-rate");
      if (!res.ok) throw new Error("rate");
      const data = await res.json();
      const rate = Number(data.martiniRate ?? data.rate30 ?? data.rate);
      if (Number.isFinite(rate) && rate > 0) {
        marketRate = rate;
        ["purInterestRate", "afdRate", "rfNewRate", "rvbRate", "vaRate", "varNewRate"].forEach((id) => {
          const el = $(id);
          if (el && !el.dataset.touched) el.value = String(rate);
        });
        const badge = $("afdRateBadge");
        if (badge) {
          badge.textContent = `Martini rate · ${rate}% · PMMS ${data.asOf || "daily"}`;
        }
      }
    } catch {
      $("afdRateBadge") && ($("afdRateBadge").textContent = `Martini rate · ${marketRate}% · educational estimate`);
    }
    recalc();
  }

  function bind() {
    bindToggles();
    bindTabs();
    bindInputs();
    bindQuoteButtons();
    loadMarketRate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();