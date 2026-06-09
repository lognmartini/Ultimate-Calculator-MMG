#!/usr/bin/env python3
"""Logan5 launch QA — browser + API scenario matrix."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from itertools import product
from typing import Any

BASE = "http://127.0.0.1:8790"

ADDRESSES = [
    "1425 Glenwood Ave, Raleigh, NC 27605",
    "100 E Main St, Durham, NC 27701",
    "201 S Greensboro St, Chapel Hill, NC 27516",
    "500 W Franklin St, Chapel Hill, NC 27516",
    "1 City Hall Plaza, Durham, NC 27701",
    "321 E Chapel Hill St, Cary, NC 27511",
    "800 S Salisbury St, Raleigh, NC 27601",
    "1200 Hillsborough St, Raleigh, NC 27603",
    "220 Fayetteville St, Raleigh, NC 27601",
    "1500 E Millbrook Rd, Raleigh, NC 27609",
    "4101 Lake Boone Trl, Raleigh, NC 27607",
    "1000 Park Forty Plz, Durham, NC 27713",
    "2000 Regency Pkwy, Cary, NC 27518",
    "55 E Jones St, Raleigh, NC 27601",
    "300 N Academy St, Cary, NC 27519",
]

PRICES = [150000, 225000, 350000, 450000, 550000, 750000, 950000, 1200000, 1800000, 2500000]
DOWNS = [0, 3, 3.5, 5, 10, 15, 20, 25]
PROGRAMS = ["conventional", "fha", "va", "usda"]
CREDITS = [580, 620, 660, 700, 740, 780]
TERMS = [30, 25, 20, 15]


@dataclass
class Issue:
    kind: str
    message: str
    context: str = ""


@dataclass
class QAResult:
    passed: int = 0
    failed: int = 0
    issues: list[Issue] = field(default_factory=list)

    def ok(self, msg: str = "") -> None:
        self.passed += 1

    def fail(self, kind: str, message: str, context: str = "") -> None:
        self.failed += 1
        self.issues.append(Issue(kind, message, context))


def http_get(path: str, timeout: float = 15.0, max_body: int | None = 500) -> tuple[int, str]:
    url = f"{BASE}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "Logan5-QA/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if max_body is not None:
                body = body[:max_body]
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, str(e)
    except Exception as e:
        return 0, str(e)


def api_lookup(address: str) -> dict[str, Any] | None:
    q = urllib.parse.urlencode({"address": address, "homePrice": 450000, "creditScore": 740})
    status, body = http_get(f"/api/property?{q}", timeout=20, max_body=None)
    if status != 200:
        return None
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def build_scenarios(max_count: int = 100) -> list[dict[str, Any]]:
    combos = list(product(PRICES, DOWNS, PROGRAMS, CREDITS, TERMS))
    scenarios: list[dict[str, Any]] = []
    for i, (price, down, program, credit, term) in enumerate(combos):
        if i >= max_count:
            break
        scenarios.append(
            {
                "price": price,
                "down": down,
                "program": program,
                "credit": credit,
                "term": term,
                "address": ADDRESSES[i % len(ADDRESSES)],
                "veteran": program == "va",
                "usda": program == "usda",
                "fthb": down <= 3 and program == "conventional",
            }
        )
    return scenarios


EVAL_CALC = """
async (scenario) => {
  const $ = (id) => document.getElementById(id);
  const setVal = (id, val) => {
    const el = $(id);
    if (!el) return false;
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const clickProgram = (prog) => {
    const btn = document.querySelector(`.ultimate-program-btn[data-program="${prog}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  };
  const clickTerm = (term) => {
    const btn = document.querySelector(`.ultimate-term-btn[data-term="${term}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Reset to step 1
  if (window.MMG_wizardShowStep) window.MMG_wizardShowStep(0);

  if ($('propertyAddress')) $('propertyAddress').value = scenario.address || '';
  setVal('homePrice', scenario.price);
  setVal('homePriceInput', scenario.price.toLocaleString('en-US'));
  const disp = $('homePriceDisplay');
  if (disp) disp.textContent = '$' + scenario.price.toLocaleString('en-US');

  const vet = $('veteranEligible');
  const usda = $('usdaEligible');
  const fthb = $('firstTimeBuyer');
  if (vet) { vet.checked = !!scenario.veteran; vet.dispatchEvent(new Event('change', { bubbles: true })); }
  if (usda) { usda.checked = !!scenario.usda; usda.dispatchEvent(new Event('change', { bubbles: true })); }
  if (fthb) { fthb.checked = !!scenario.fthb; fthb.dispatchEvent(new Event('change', { bubbles: true })); }

  if (window.MMG_wizardShowStep) window.MMG_wizardShowStep(1);
  await wait(120);

  setVal('downPercent', scenario.down);
  setVal('downPercentInput', scenario.down);
  setVal('creditScore', scenario.credit);
  clickProgram(scenario.program);
  clickTerm(scenario.term);
  await wait(150);

  if (window.MMG_calculate) window.MMG_calculate();
  await wait(200);

  if (window.MMG_wizardShowStep) window.MMG_wizardShowStep(2);
  await wait(350);
  if (window.MMG_calculate) window.MMG_calculate();
  await wait(250);

  const piti = ($('pitiPayment')?.textContent || '').trim();
  const rate = $('interestRate')?.value;
  const step = document.body.dataset.wizardStep;
  const wheelHidden = $('paymentBreakdownWheel')?.classList.contains('hidden');
  const wheelSvg = $('pbwSvg')?.innerHTML?.length > 20;
  const shareBtn = !!$('ultimateShareBtn');
  const hubVisible = !$('ultimateHubView')?.classList.contains('hidden');
  const alertForm = !!$('rateAlertForm');
  const errors = [];

  if (!piti || piti === '—' || piti === '$0') errors.push('invalid_piti:' + piti);
  if (!rate || Number(rate) <= 0) errors.push('invalid_rate:' + rate);
  if (step !== '3') errors.push('wrong_step:' + step);
  if (wheelHidden || !wheelSvg) errors.push('wheel_not_rendered');

  const hubStyle = window.getComputedStyle(document.querySelector('.ultimate-hub-stack') || document.body);
  const hubRow = hubStyle.flexDirection === 'row';

  return {
    piti, rate, step, errors,
    hubRow,
    shareBtn,
    hubVisible,
    alertForm,
    cash: $('quoteCashToClose')?.textContent || '',
    program: $('loanProgram')?.value,
  };
}
"""

EVAL_WIZARD = """
async () => {
  const issues = [];
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Fresh visit — step 1
  if (window.MMG_wizardShowStep) window.MMG_wizardShowStep(0);
  await wait(100);
  if (document.body.dataset.wizardStep !== '1') issues.push('fresh_not_step1');

  $('wizardNext')?.click();
  await wait(200);
  if (document.body.dataset.wizardStep !== '2') issues.push('next_to_step2_failed');

  $('wizardNext')?.click();
  await wait(400);
  if (document.body.dataset.wizardStep !== '3') issues.push('next_to_step3_failed');

  const piti = $('pitiPayment')?.textContent?.trim();
  if (!piti || piti === '—') issues.push('step3_no_piti');

  // Back from step 3
  $('wizardBack')?.click();
  await wait(200);
  if (document.body.dataset.wizardStep !== '2') issues.push('back_from_step3_failed');

  // Compare subview
  if (window.MMG_wizardShowStep) window.MMG_wizardShowStep(2);
  await wait(300);
  $('ultimateHubCompare')?.click();
  await wait(200);
  if ($('ultimateCompareView')?.classList.contains('hidden')) issues.push('compare_subview_hidden');
  $('ultimateCompareBack')?.click();
  await wait(200);
  if ($('ultimatePaymentMain')?.classList.contains('hidden')) issues.push('compare_back_failed');

  // Realtor subview
  $('ultimateHubRealtor')?.click();
  await wait(200);
  if ($('ultimateRealtorView')?.classList.contains('hidden')) issues.push('realtor_subview_hidden');
  $('ultimateRealtorBack')?.click();
  await wait(200);

  // Instant deep link params should not stick on normal reload
  const params = new URLSearchParams(window.location.search);
  const hasJump = params.has('instant') || params.get('step') === 'payment';

  return { issues, piti, hasJump, url: window.location.href };
}
"""

EVAL_DEEPLINK = """
async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(500);
  const step = document.body.dataset.wizardStep;
  const piti = document.getElementById('pitiPayment')?.textContent?.trim();
  return { step, piti, instant: document.body.dataset.instantLanding };
}
"""


def run_browser_qa(result: QAResult, scenario_count: int = 100) -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        result.fail("setup", "playwright not installed")
        return

    scenarios = build_scenarios(scenario_count)
    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("pageerror", lambda err: console_errors.append(f"pageerror: {err}"))
        page.on("console", lambda msg: console_errors.append(f"console.{msg.type}: {msg.text}") if msg.type == "error" else None)

        # Static assets
        for path in ["/go5.html", "/logan5-growth.js", "/logan5-landing.js", "/steps-flow.js", "/calculator.js"]:
            status, _ = http_get(path)
            if status == 200:
                result.ok()
            else:
                result.fail("asset", f"{path} returned {status}")

        page.goto(f"{BASE}/go5.html", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(800)

        wiz = page.evaluate(EVAL_WIZARD)
        for issue in wiz.get("issues", []):
            result.fail("wizard", issue)
        if not wiz.get("issues"):
            result.ok("wizard_flow")
        if wiz.get("hasJump"):
            result.fail("url", "jump params still in URL on fresh load", wiz.get("url", ""))

        # Scenario matrix
        for i, sc in enumerate(scenarios):
            page.goto(f"{BASE}/go5.html", wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(400)
            out = page.evaluate(EVAL_CALC, sc)
            ctx = f"#{i+1} price={sc['price']} down={sc['down']}% {sc['program']} credit={sc['credit']} term={sc['term']}"
            if out.get("errors"):
                result.fail("calc", "; ".join(out["errors"]), ctx)
            else:
                result.ok()
            if not out.get("hubRow"):
                result.fail("layout", "What's next stack not horizontal", ctx)
            if not out.get("shareBtn"):
                result.fail("ui", "Share button missing", ctx)
            if not out.get("alertForm"):
                result.fail("ui", "Rate alert form missing", ctx)

        # Deep link instant
        page.goto(f"{BASE}/go5.html?price=525000&instant=1&step=payment&address=1425%20Glenwood%20Ave%20Raleigh%20NC", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1200)
        dl = page.evaluate(EVAL_DEEPLINK)
        if dl.get("step") != "3":
            result.fail("deeplink", f"instant link step={dl.get('step')}", str(dl))
        elif not dl.get("piti") or dl.get("piti") == "—":
            result.fail("deeplink", "instant link no piti", str(dl))
        else:
            result.ok("deeplink_instant")

        # Reverse payment mode
        page.goto(f"{BASE}/go5.html", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        page.click('.ultimate-mode-tab[data-mode="payment"]')
        page.wait_for_timeout(200)
        page.fill("#targetPaymentInput", "2800")
        page.dispatch_event("#targetPaymentInput", "input")
        page.wait_for_timeout(600)
        rev = page.evaluate("""() => ({
          price: document.getElementById('reversePriceDisplay')?.textContent,
          hidden: document.getElementById('reversePaymentResult')?.classList.contains('hidden')
        })""")
        if rev.get("hidden") or not rev.get("price") or rev.get("price") == "—":
            result.fail("reverse", "reverse payment mode failed", str(rev))
        else:
            result.ok("reverse_payment")

        # Filter unique console errors (ignore favicon etc)
        seen = set()
        for err in console_errors:
            if "favicon" in err.lower():
                continue
            if err in seen:
                continue
            seen.add(err)
            if "error" in err.lower() or "pageerror" in err.lower():
                result.fail("console", err)

        # Mobile viewport smoke
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE}/go5.html", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(500)
        page.click("#wizardNext")
        page.wait_for_timeout(300)
        page.click("#wizardNext")
        page.wait_for_timeout(500)
        mob = page.evaluate("""() => ({
          step: document.body.dataset.wizardStep,
          piti: document.getElementById('pitiPayment')?.textContent,
          hubRow: window.getComputedStyle(document.querySelector('.ultimate-hub-stack') || document.body).flexDirection,
          navVisible: !document.querySelector('.ultimate-wizard-nav')?.classList.contains('wizard-nav-hidden')
        })""")
        if mob.get("step") != "3":
            result.fail("mobile", f"step={mob.get('step')}")
        elif not mob.get("piti") or mob.get("piti") == "—":
            result.fail("mobile", "no piti on mobile step 3")
        elif mob.get("hubRow") != "row":
            result.fail("mobile", "hub not horizontal on mobile")
        else:
            result.ok("mobile_smoke")

        browser.close()


def run_api_qa(result: QAResult) -> None:
    status, _ = http_get("/api/market-rate")
    if status == 200:
        result.ok("api_market_rate")
    else:
        result.fail("api", f"market-rate {status}")

    for addr in ADDRESSES[:10]:
        data = api_lookup(addr)
        if not data:
            result.fail("api", f"lookup failed for {addr}")
            continue
        if not data.get("annualTax") and not data.get("taxRatePercent"):
            result.fail("api", f"lookup missing tax for {addr}", json.dumps(data)[:200])
        else:
            result.ok()


def main() -> int:
    result = QAResult()
    print("Logan5 QA — starting...")
    run_api_qa(result)
    run_browser_qa(result, scenario_count=100)

    print(f"\n=== RESULTS: {result.passed} passed, {result.failed} failed ===")
    if result.issues:
        print("\nIssues:")
        for i, issue in enumerate(result.issues, 1):
            line = f"{i}. [{issue.kind}] {issue.message}"
            if issue.context:
                line += f" — {issue.context}"
            print(line)

    out_path = "/Users/loganmartini/mortgage-calculator/scripts/qa-logan5-results.json"
    with open(out_path, "w") as f:
        json.dump(
            {
                "passed": result.passed,
                "failed": result.failed,
                "issues": [issue.__dict__ for issue in result.issues],
            },
            f,
            indent=2,
        )
    print(f"\nWrote {out_path}")
    return 1 if result.failed else 0


if __name__ == "__main__":
    sys.exit(main())