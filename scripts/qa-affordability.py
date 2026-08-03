#!/usr/bin/env python3
"""Affordability calculator QA — 100 scenarios per calculator tab."""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

BASE = "http://127.0.0.1:8790"
PAGE = f"{BASE}/affordability-embed.html"
APPLY_URL = "https://applywithmartini.com"
SCENARIOS_PER = 100
SEED = 42

CATEGORIES = [
    "affordability",
    "purchase",
    "refinance",
    "rentbuy",
    "vapurchase",
    "varefinance",
    "dscr",
    "fixflip",
]

AFFORD_PROGRAMS = ["conventional", "fha", "va", "usda", "jumbo"]

EVAL = """
async (cfg) => {
  const issues = [];
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function parseNum(raw) {
    const n = Number(String(raw ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  const tab = cfg.tab;
  const li = document.querySelector(`.afd-tabs li[data-tab="${tab}"]`);
  if (!li) issues.push('tab_missing');
  else li.querySelector('a')?.click();

  await sleep(120);

  if (tab === 'affordability' && cfg.program) {
    const sub = document.querySelector(`.afd-subtabs a[data-program="${cfg.program}"]`);
    sub?.click();
    await sleep(80);
  }

  const setVal = (id, v) => {
    const el = $(id);
    if (!el) return;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const inputs = cfg.inputs || {};
  for (const [id, val] of Object.entries(inputs)) {
    setVal(id, val);
  }

  await sleep(180);

  const payment = $('statPayment')?.textContent || '';
  const donut = $('afdDonutCenter')?.textContent || '';
  if (!payment || payment === '—' || payment.includes('NaN')) issues.push('bad_stat_payment');
  if (!donut || donut === '—' || donut.includes('NaN')) issues.push('bad_donut');

  if (tab === 'affordability') {
    const loan = $('afdLoanAmount')?.value || '';
    if (!loan || loan === '—') issues.push('loan_amount_empty');
    const dti = $('afdMetricDti')?.textContent || '';
    if (!dti || dti === '—') issues.push('dti_empty');
  }

  document.querySelectorAll('[data-afd-quote], .afd-btn-get-quote').forEach((a) => {
    if (!a.href.includes('applywithmartini.com')) issues.push('bad_quote_href:' + a.href);
  });

  const footerNmls = document.querySelector('.afd-site-footer .nmls-compliance, .afd-site-footer .nmls');
  if (!footerNmls?.textContent?.includes('NMLS #3446')) issues.push('footer_nmls_missing');

  const quoteSection = document.querySelector('.afd-quote-section');
  if (!quoteSection) issues.push('quote_section_missing');

  return {
    issues,
    tab,
    program: cfg.program || null,
    payment,
    donut,
    summary: ($('afdSummaryText')?.textContent || '').slice(0, 80),
  };
}
"""


def rand_inputs(tab: str, rng: random.Random) -> dict[str, str | int | float]:
    price = rng.choice([125000, 200000, 275000, 350000, 450000, 550000, 750000, 950000])
    down_pct = rng.choice([0, 3, 3.5, 5, 10, 15, 20])
    rate = round(rng.uniform(4.5, 8.5), 3)
    term = rng.choice([15, 20, 25, 30])

    if tab == "affordability":
        return {
            "afdIncome": rng.choice([3500, 5000, 6500, 8500, 12000]),
            "afdDebts": rng.choice([0, 350, 650, 1500, 2200]),
            "afdHomePrice": price,
            "afdDownPayment": int(price * down_pct / 100) if rng.random() > 0.4 else down_pct,
            "afdLoanTerm": term,
            "afdRate": rate,
            "afdTaxPct": round(rng.uniform(0.4, 1.2), 2),
            "afdInsurance": rng.choice([900, 1200, 1500, 1800, 2400]),
            "afdHoa": rng.choice([0, 75, 150, 250]),
            "afdPmiYearly": rng.choice([0, 1800, 3000, 4200]),
        }
    if tab == "purchase":
        return {
            "purHomePrice": price,
            "purDownPayment": down_pct,
            "purLoanTerm": term,
            "purInterestRate": rate,
            "purPropertyTax": round(rng.uniform(0.5, 1.1), 2),
            "purInsurance": rng.choice([1200, 1800, 2200]),
            "purHoa": rng.choice([0, 100, 200]),
            "purExtraPayment": rng.choice([0, 100, 250]),
        }
    if tab == "refinance":
        orig = rng.choice([250000, 320000, 400000, 500000])
        return {
            "rfOrigLoan": orig,
            "rfOrigRate": round(rng.uniform(5.5, 8.0), 3),
            "rfOrigTerm": 30,
            "rfMonthsElapsed": rng.choice([12, 24, 36, 60, 84]),
            "rfBalance": int(orig * rng.uniform(0.82, 0.96)),
            "rfCashOut": rng.choice([0, 10000, 25000]),
            "rfFees": rng.choice([2500, 3500, 5000]),
            "rfNewRate": rate,
            "rfNewTerm": term,
        }
    if tab == "rentbuy":
        return {
            "rvbHomePrice": price,
            "rvbDown": down_pct,
            "rvbRate": rate,
            "rvbTerm": term,
            "rvbTax": int(price * 0.006),
            "rvbIns": rng.choice([1400, 1800, 2200]),
            "rvbHoa": rng.choice([0, 600, 1200]),
            "rvbMaint": rng.choice([0.75, 1, 1.25]),
            "rvbAppreciation": rng.choice([2, 3, 4]),
            "rvbSellCost": rng.choice([5, 6, 7]),
            "rvbRent": rng.choice([1600, 2000, 2400, 2800]),
            "rvbRentGrowth": rng.choice([1.5, 2, 3]),
            "rvbYears": rng.choice([3, 5, 7, 10]),
        }
    if tab == "vapurchase":
        return {
            "vaHomePrice": price,
            "vaDown": rng.choice([0, 0, 5]),
            "vaTerm": term,
            "vaRate": rate,
            "vaTax": round(rng.uniform(0.5, 1.0), 2),
            "vaIns": rng.choice([1200, 1600, 2000]),
            "vaHoa": rng.choice([0, 50, 150]),
            "vaExtra": rng.choice([0, 100]),
        }
    if tab == "varefinance":
        bal = rng.choice([220000, 300000, 380000])
        return {
            "varBalance": bal,
            "varOrigRate": round(rng.uniform(6.0, 7.5), 3),
            "varOrigTerm": rng.choice([22, 25, 27, 30]),
            "varNewRate": rate,
            "varNewTerm": term,
            "varFees": rng.choice([1500, 2500, 4000]),
        }
    if tab == "dscr":
        return {
            "dscrValue": price,
            "dscrRent1": rng.choice([1800, 2400, 3000, 3600]),
            "dscrRent2": rng.choice([0, 0, 1200]),
            "dscrTax": rng.choice([3000, 4500, 6000]),
            "dscrIns": rng.choice([2000, 3000, 4000]),
            "dscrHoa": rng.choice([0, 100, 200]),
            "dscrVacancy": rng.choice([5, 8, 10]),
            "dscrMaint": rng.choice([400, 800, 1200]),
            "dscrUtils": rng.choice([0, 600, 1200]),
            "dscrLtv": rng.choice([65, 70, 75, 80]),
            "dscrRate": round(rng.uniform(6.5, 9.0), 3),
            "dscrTerm": term,
            "dscrOrigFee": rng.choice([1.5, 2, 2.5]),
        }
    if tab == "fixflip":
        purchase = rng.choice([180000, 250000, 320000])
        rehab = rng.choice([40000, 65000, 90000])
        return {
            "ffPurchase": purchase,
            "ffRehab": rehab,
            "ffArv": purchase + rehab + rng.choice([50000, 80000, 120000]),
            "ffMonths": rng.choice([6, 9, 12, 15]),
            "ffTax": rng.choice([2400, 3200, 4000]),
            "ffIns": rng.choice([1800, 2400, 3000]),
            "ffLtv": rng.choice([70, 75, 80, 85]),
            "ffRate": round(rng.uniform(8.5, 12.0), 3),
            "ffOrigFee": rng.choice([1.5, 2, 2.5]),
            "ffClosing": rng.choice([2, 3, 4]),
            "ffSellCost": rng.choice([4, 5, 6]),
        }
    return {}


def build_scenarios() -> list[dict]:
    rng = random.Random(SEED)
    scenarios = []
    for tab in CATEGORIES:
        for i in range(SCENARIOS_PER):
            cfg = {"tab": tab, "inputs": rand_inputs(tab, rng), "index": i}
            if tab == "affordability":
                cfg["program"] = AFFORD_PROGRAMS[i % len(AFFORD_PROGRAMS)]
            scenarios.append(cfg)
    return scenarios


def main() -> int:
    from playwright.sync_api import sync_playwright

    scenarios = build_scenarios()
    failures: list[dict] = []
    passed = 0

    print(f"Affordability QA — {len(scenarios)} scenarios ({SCENARIOS_PER} per category)\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(PAGE, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(800)

        for cfg in scenarios:
            label = f"{cfg['tab']}#{cfg['index']}"
            if cfg.get("program"):
                label += f"/{cfg['program']}"
            out = page.evaluate(EVAL, cfg)
            if out.get("issues"):
                failures.append({"label": label, "issues": out["issues"], "out": out})
                print(f"FAIL {label}: {out['issues']}")
            else:
                passed += 1

        browser.close()

    total = len(scenarios)
    print(f"\n=== RESULTS: {passed} passed, {len(failures)} failed / {total} ===")

    results_path = Path(__file__).resolve().parent / "qa-affordability-results.json"
    results_path.write_text(
        json.dumps({"passed": passed, "failed": len(failures), "failures": failures[:50]}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {results_path}")

    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())