/**
 * Logan5 conversion enhancements — speed hint, savings pulse, exit intent, lite lead forms.
 */
(function () {
  "use strict";

  if (!document.body.classList.contains("logan5")) return;

  const EXIT_KEY = "mmg_logan5_exit_dismissed";
  const EXIT_SUBMITTED_KEY = "mmg_logan5_exit_submitted";

  function $(id) {
    return document.getElementById(id);
  }

  function apiBase() {
    const meta = document.querySelector('meta[name="mmg-api-base"]');
    const base = meta?.content || "/";
    return base.endsWith("/") ? base : `${base}/`;
  }

  function currentWizardStep() {
    return Number(document.body.dataset.wizardStep || "1") - 1;
  }

  function updateSpeedHint(step) {
    const el = $("wizardSpeedHint");
    if (!el) return;
    if (step === 1) {
      el.textContent = "~30 sec left";
      el.classList.remove("hidden");
    } else if (step === 0) {
      el.textContent = "About 30 seconds total";
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  function pulseSavingsRibbon() {
    const ribbon = $("leadSavingsRibbon");
    if (!ribbon || ribbon.classList.contains("hidden")) return;
    ribbon.classList.remove("lead-savings-pulse");
    void ribbon.offsetWidth;
    ribbon.classList.add("lead-savings-pulse");
  }

  function bindSliderHook() {
    const hint = $("ultimateInteractiveHint");
    const sliders = document.querySelectorAll(
      "#downPercent, #creditScore, #homePrice"
    );
    let nudged = false;
    sliders.forEach((el) => {
      el.addEventListener(
        "input",
        () => {
          if (nudged) return;
          nudged = true;
          hint?.classList.add("ultimate-interactive-active");
        },
        { once: false }
      );
    });
  }

  function bindSaveEstimateExpand() {
    const btn = $("saveEstimateExpand");
    const optional = $("saveEstimateOptional");
    if (!btn || !optional) return;
    btn.addEventListener("click", () => {
      optional.classList.remove("hidden");
      btn.classList.add("hidden");
    });
  }

  async function submitExitLead(email) {
    const params = new URLSearchParams(window.location.search);
    const payload = {
      email: email.trim(),
      assignedLo: "logan",
      version: "Logan5",
      source: "logan5-exit-intent",
      consent: true,
      scenario: {
        piti: $("pitiPayment")?.textContent || "",
        homePrice: $("homePrice")?.value || "",
        address: $("propertyAddress")?.value || "",
        ref: params.get("ref") || "",
        utm: Object.fromEntries(params),
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

  function shouldShowExit() {
    try {
      if (localStorage.getItem(EXIT_KEY) === "1") return false;
      if (localStorage.getItem(EXIT_SUBMITTED_KEY) === "1") return false;
      if (localStorage.getItem("mmg_save_estimate_submitted") === "1") return false;
      if (localStorage.getItem("mmg_save_estimate_dismissed") === "1") return false;
    } catch {
      /* ignore */
    }
    const modal = $("ultimateExitModal");
    if (modal && !modal.classList.contains("hidden")) return false;
    const piti = $("pitiPayment")?.textContent?.trim();
    return piti && piti !== "—" && piti !== "$0";
  }

  function showExitModal() {
    const modal = $("ultimateExitModal");
    if (!modal || !shouldShowExit()) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    $("ultimateExitForm")?.querySelector('[type="email"]')?.focus();
  }

  function hideExitModal(persist) {
    const modal = $("ultimateExitModal");
    if (modal) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
    if (persist) {
      try {
        localStorage.setItem(EXIT_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }

  function bindScrollDepthExit() {
    let fired = false;
    const onScroll = () => {
      if (fired || currentWizardStep() < 2) return;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH <= 0) return;
      const ratio = window.scrollY / docH;
      if (ratio >= 0.5) {
        fired = true;
        window.removeEventListener("scroll", onScroll, { passive: true });
        showExitModal();
        window.MMG_logan5_track?.("exit_scroll_depth", { depth: 0.5 });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function bindExitIntent() {
    let shown = false;
    const onLeave = (e) => {
      if (shown || currentWizardStep() < 1) return;
      const y = e.clientY ?? 0;
      if (y > 12) return;
      shown = true;
      showExitModal();
      window.MMG_logan5_track?.("exit_intent_mouse", {});
    };
    document.addEventListener("mouseout", onLeave);

    $("ultimateExitClose")?.addEventListener("click", () => hideExitModal(true));
    $("ultimateExitBackdrop")?.addEventListener("click", () => hideExitModal(true));
    $("ultimateExitDismiss")?.addEventListener("click", () => hideExitModal(true));

    $("ultimateExitForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = e.target.querySelector('[type="email"]')?.value?.trim() || "";
      if (!email || !email.includes("@")) return;
      const ok = await submitExitLead(email);
      const success = $("ultimateExitSuccess");
      const form = $("ultimateExitForm");
      if (form) form.classList.add("hidden");
      if (success) {
        success.classList.remove("hidden");
        success.textContent = ok
          ? "On its way — check your inbox shortly."
          : "Thanks — your estimate is still on screen if you return.";
      }
      try {
        localStorage.setItem(EXIT_SUBMITTED_KEY, "1");
      } catch {
        /* ignore */
      }
      if (ok) {
        window.MMG_trackPixel?.("LeadSubmit", { source: "logan5-exit-intent" });
      }
      window.setTimeout(() => hideExitModal(true), 2200);
    });
  }

  function bind() {
    document.addEventListener("mmg-wizard-step-change", (e) => {
      updateSpeedHint(e.detail?.step ?? 0);
      if ((e.detail?.step ?? 0) === 2) pulseSavingsRibbon();
    });

    document.addEventListener("mmg-calculated", () => {
      window.requestAnimationFrame(pulseSavingsRibbon);
    });

    document.addEventListener("mmg-wizard-results", () => {
      window.setTimeout(pulseSavingsRibbon, 400);
    });

    bindSliderHook();
    bindSaveEstimateExpand();
    bindExitIntent();
    bindScrollDepthExit();
    updateSpeedHint(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();