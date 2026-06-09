#!/usr/bin/env python3
"""Logan5 edge-case QA."""

import json
import sys

BASE = "http://127.0.0.1:8790"

EDGE_EVAL = """
async (test) => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const issues = [];

  if (test.reset) {
    if (window.MMG_wizardShowStep) window.MMG_wizardShowStep(0);
    await wait(200);
  }

  if (test.goto) {
    // handled by Python navigation
  }

  if (test.mode === 'va_without_checkbox') {
    window.MMG_wizardShowStep(0);
    $('homePrice').value = '450000';
    $('homePrice').dispatchEvent(new Event('input', { bubbles: true }));
    window.MMG_wizardShowStep(1);
    await wait(150);
    if ($('veteranEligible')) $('veteranEligible').checked = false;
    document.querySelector('.ultimate-program-btn[data-program="va"]')?.click();
    await wait(150);
    const prog = $('loanProgram')?.value;
    if (prog === 'va') issues.push('va_selected_without_eligibility');
    if (!($('loanProgramNote')?.textContent || '').includes('VA')) issues.push('no_va_hint');
  }

  if (test.mode === 'deeplink_va_no_vet') {
    await wait(800);
    const prog = $('loanProgram')?.value;
    const vet = $('veteranEligible')?.checked;
    if (prog === 'va' && !vet) issues.push('deeplink_va_without_vet_checkbox');
    const piti = $('pitiPayment')?.textContent;
    if (!piti || piti === '—') issues.push('no_piti');
  }

  if (test.mode === 'jumbo_low_down') {
    window.MMG_wizardShowStep(0);
    $('homePrice').value = '1200000';
    $('homePrice').dispatchEvent(new Event('input', { bubbles: true }));
    window.MMG_wizardShowStep(1);
    await wait(200);
    $('downPercent').value = '5';
    $('downPercent').dispatchEvent(new Event('input', { bubbles: true }));
    await wait(200);
    const min = Number($('downPercent')?.min || 0);
    const actual = Number($('downPercent')?.value || 0);
    if (actual < min) issues.push(`down_not_clamped:${actual}<${min}`);
    window.MMG_wizardShowStep(2);
    await wait(400);
    const piti = $('pitiPayment')?.textContent;
    if (!piti || piti === '—') issues.push('jumbo_no_piti');
  }

  if (test.mode === 'fha_over_limit') {
    window.MMG_wizardShowStep(0);
    $('homePrice').value = '1200000';
    $('homePrice').dispatchEvent(new Event('input', { bubbles: true }));
    window.MMG_wizardShowStep(1);
    await wait(200);
    document.querySelector('.ultimate-program-btn[data-program="fha"]')?.click();
    await wait(200);
    const down = Number($('downPercent')?.value || 0);
    if (down < 3.5) issues.push('fha_down_below_min');
    window.MMG_wizardShowStep(2);
    await wait(400);
    // Jumbo homes auto-route to conventional — FHA is educational only below county limit.
    if ($('loanProgram')?.value !== 'conventional') issues.push('jumbo_should_use_conventional');
    const note = $('loanProgramNote')?.textContent || '';
    if (!note.includes('FHA')) issues.push('missing_fha_jumbo_note');
  }

  if (test.mode === 'share_url') {
    window.MMG_wizardShowStep(2);
    await wait(500);
    const url = window.MMG_logan5_buildShareUrl?.() || '';
    if (!url.includes('instant=1')) issues.push('share_missing_instant');
    if (!url.includes('step=payment')) issues.push('share_missing_step');
    if (!url.includes('price=')) issues.push('share_missing_price');
  }

  if (test.mode === 'url_sync_no_jump') {
    window.MMG_wizardShowStep(0);
    await wait(300);
    window.MMG_wizardShowStep(1);
    await wait(300);
    const p = new URLSearchParams(window.location.search);
    if (p.has('instant') || p.get('step') === 'payment') issues.push('url_polluted_on_step2');
  }

  if (test.mode === 'seller_credit') {
    window.MMG_wizardShowStep(2);
    await wait(500);
    const slider = $('sellerCreditSlider');
    if (!slider) issues.push('no_seller_slider');
    else {
      slider.value = slider.max || '5000';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(300);
      const cash = $('quoteCashToClose')?.textContent || '';
      const credit = $('quoteSellerCredit')?.textContent || '';
      if (!credit.includes('−') && Number(slider.value) > 0) issues.push('seller_credit_not_shown');
    }
  }

  if (test.mode === 'rate_alert_baseline') {
    window.MMG_wizardShowStep(2);
    await wait(500);
    const base = $('rateAlertBaseline')?.textContent || '';
    if (!base || base === '—') issues.push('rate_alert_baseline_empty');
    if (!$('rateAlertForm')) issues.push('rate_alert_form_missing');
  }

  return { issues, step: document.body.dataset.wizardStep, url: location.href };
}
"""


def main():
    from playwright.sync_api import sync_playwright

    tests = [
        {"name": "va_without_checkbox", "mode": "va_without_checkbox", "reset": True},
        {"name": "deeplink_va_no_vet", "url": f"{BASE}/go5.html?price=450000&program=va&instant=1&step=payment", "mode": "deeplink_va_no_vet"},
        {"name": "jumbo_low_down", "mode": "jumbo_low_down", "reset": True},
        {"name": "fha_over_limit", "mode": "fha_over_limit", "reset": True},
        {"name": "share_url", "mode": "share_url", "reset": True},
        {"name": "url_sync_no_jump", "mode": "url_sync_no_jump", "reset": True},
        {"name": "seller_credit", "mode": "seller_credit", "reset": True},
        {"name": "rate_alert_baseline", "mode": "rate_alert_baseline", "reset": True},
    ]

    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        for t in tests:
            url = t.get("url", f"{BASE}/go5.html")
            page.goto(url, wait_until="domcontentloaded", timeout=25000)
            page.wait_for_timeout(500)
            out = page.evaluate(EDGE_EVAL, t)
            if out.get("issues"):
                failures.append({"test": t["name"], "issues": out["issues"], "extra": out})
                print(f"FAIL {t['name']}: {out['issues']}")
            else:
                print(f"OK   {t['name']}")

        browser.close()

    if failures:
        with open("/Users/loganmartini/mortgage-calculator/scripts/qa-edge-results.json", "w") as f:
            json.dump(failures, f, indent=2)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())