/**
 * Optional, non-blocking buyer lead capture (Logan1 + Logan3 + Logan5 guided).
 * Calculator works fully without contact info.
 * Guided go5: lead form is primary conversion — always available on results.
 */
(function () {
  "use strict";

  const DISMISS_KEY = "mmg_save_estimate_dismissed";
  const SUBMITTED_KEY = "mmg_save_estimate_submitted";
  const MIN_SLIDER_MOVES = 2;
  const DELAY_MS = 8000;
  const LOGAN4_DELAY_MS = 7000;
  const LOGAN4_SCROLL_MIN_MS = 3000;
  const LOGAN5_DELAY_MS = 15000;
  const LOGAN5_ENGAGEMENT_MS = 10000;
  const LOGAN5_HUB_DELAY_MS = 8000;

  let sliderMoves = 0;
  let shown = false;
  let timer = null;
  let logan4ResultsAt = 0;
  let logan4ScrollObserver = null;
  let logan5ResultsAt = 0;
  let logan5ScrollObserver = null;
  let logan5HubTimer = null;
  let logan5ScrollDepthObserver = null;
  let logan5ScrollDepthFired = false;
  let submitting = false;
  const LOGAN5_SCROLL_DEPTH = 0.5;

  function isLogan1() {
    return (
      document.body.classList.contains("logan1-realtor") ||
      document.body.classList.contains("logan5-realtor")
    );
  }

  function isLogan3() {
    return document.body.classList.contains("logan3");
  }

  function isLogan4() {
    return document.body.classList.contains("logan4");
  }

  function isLogan5() {
    return document.body.classList.contains("logan5");
  }

  function isGuided() {
    return document.body.classList.contains("guided-flow");
  }

  function isSocialWizard() {
    return isLogan3() || isLogan4() || isLogan5();
  }

  function apiBase() {
    const meta = document.querySelector('meta[name="mmg-api-base"]');
    const base = meta?.content || "/";
    return base.endsWith("/") ? base : `${base}/`;
  }

  function card() {
    return document.getElementById("saveEstimateCard");
  }

  /** Legacy popover cards respect dismiss; guided primary form never permanently dies. */
  function shouldShow() {
    if (isGuided() && isLogan5()) return true;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return false;
      if (localStorage.getItem(SUBMITTED_KEY) === "1") return false;
    } catch {
      /* ignore */
    }
    return isLogan1() || isSocialWizard();
  }

  function showCard() {
    const el = card();
    if (!el) return;
    if (!isGuided() && (shown || !shouldShow())) return;

    if (!isGuided()) {
      const piti = document.getElementById("pitiPayment")?.textContent?.trim();
      if (!piti || piti === "—" || piti === "$0") return;
    }

    shown = true;
    el.classList.remove("hidden", "guided-lead-collapsed");
    el.hidden = false;
    el.removeAttribute("hidden");

    // Restore form if user previously skipped this session (guided)
    const form = document.getElementById("saveEstimateForm");
    const restore = document.getElementById("saveEstimateRestore");
    const successEl = document.getElementById("saveEstimateSuccess");
    const alreadySubmitted =
      successEl && !successEl.classList.contains("hidden") && form?.classList.contains("hidden");
    if (!alreadySubmitted) {
      form?.classList.remove("hidden");
      if (restore) {
        restore.classList.add("hidden");
        restore.hidden = true;
        restore.setAttribute("aria-hidden", "true");
      }
      const title = document.getElementById("saveEstimateHeading");
      const lead = document.querySelector(".save-estimate-lead, .dest-lead-copy");
      const isRefi = document.body.dataset.loanGoal === "refinance";
      if (title) {
        title.textContent = isRefi
          ? "Email me this refinance estimate"
          : "Email me this estimate";
      }
      if (lead) {
        lead.textContent =
          "Get a clean summary + a quick personalized review from Logan. No obligation.";
      }
      el.classList.remove("guided-lead-collapsed");
    }
  }

  function hideCard(persistDismiss) {
    const el = card();
    if (!el) return;

    // Guided: soft-collapse — show quiet skip only (never a second primary button)
    if (isGuided() && isLogan5()) {
      const form = document.getElementById("saveEstimateForm");
      const restore = document.getElementById("saveEstimateRestore");
      const successEl = document.getElementById("saveEstimateSuccess");
      const title = document.getElementById("saveEstimateHeading");
      const lead = document.querySelector(".save-estimate-lead, .dest-lead-copy");
      form?.classList.add("hidden");
      successEl?.classList.add("hidden");
      // Keep restore in DOM for API but never show as a second primary
      if (restore) {
        restore.classList.add("hidden");
        restore.hidden = true;
        restore.setAttribute("aria-hidden", "true");
      }
      if (title) title.textContent = "Want this estimate emailed?";
      if (lead) {
        lead.innerHTML =
          '<button type="button" class="dest-reopen-lead" id="destReopenLead">Email me this estimate · free review from Logan</button>';
        document.getElementById("destReopenLead")?.addEventListener(
          "click",
          () => showCard(),
          { once: true }
        );
      }
      el.classList.add("guided-lead-collapsed");
      el.classList.remove("hidden");
      return;
    }

    el.classList.add("hidden");
    if (persistDismiss) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }

  function normalizeLoRef(raw) {
    const ref = String(raw || "")
      .trim()
      .toLowerCase();
    if (!ref) return "";
    if (ref === "kevin" || ref.includes("kevin")) return "kevin";
    if (ref === "logan" || ref.includes("logan")) return "logan";
    return ref;
  }

  function resolveAssignedLo() {
    const params = new URLSearchParams(window.location.search);
    const loRef = normalizeLoRef(params.get("ref") || params.get("partner") || "");
    if (loRef === "kevin" || loRef === "logan") return loRef;
    if (isLogan5() || isLogan3()) return "logan";
    return isLogan4() ? "team" : "";
  }

  function collectScenario() {
    const get = (id) => document.getElementById(id);
    const params = new URLSearchParams(window.location.search);
    return {
      homePrice: get("homePrice")?.value || "",
      downPercent: get("downPercent")?.value || "",
      creditScore: get("creditScore")?.value || "",
      piti: get("pitiPayment")?.textContent || "",
      address: get("propertyAddress")?.value || "",
      rate: get("interestRate")?.value || "",
      loanProgram: get("loanProgram")?.value || "",
      loanTerm: get("loanTerm")?.value || "",
      ref: params.get("ref") || params.get("partner") || "",
      loanGoal: document.body.dataset.loanGoal || "purchase",
      utm: Object.fromEntries(params),
    };
  }

  function activeSaveTab() {
    return document.querySelector(".save-estimate-tab.active")?.dataset.saveTab || "email";
  }

  function setSubmitState(busy, label) {
    const submit = document.querySelector(
      ".save-estimate-submit, #saveEstimateForm [type='submit']"
    );
    if (!submit) return;
    submit.disabled = !!busy;
    submit.setAttribute("aria-busy", busy ? "true" : "false");
    submit.classList.toggle("is-loading", !!busy);
    if (label) submit.textContent = label;
  }

  function setFormError(message) {
    let err = document.getElementById("saveEstimateError");
    if (!err) {
      const form = document.getElementById("saveEstimateForm");
      if (!form) return;
      err = document.createElement("p");
      err.id = "saveEstimateError";
      err.className = "save-estimate-error";
      err.setAttribute("role", "alert");
      form.insertBefore(err, form.querySelector(".save-estimate-submit, [type='submit']"));
    }
    if (message) {
      err.textContent = message;
      err.classList.remove("hidden");
      err.hidden = false;
    } else {
      err.textContent = "";
      err.classList.add("hidden");
      err.hidden = true;
    }
  }

  function defaultSubmitLabel(tab) {
    return tab === "sms" ? "Text my estimate" : "Email me this estimate";
  }

  function applyImpactLeadCopy(tab) {
    const title =
      document.getElementById("saveEstimateHeading") ||
      document.querySelector(".save-estimate-title");
    const lead = document.querySelector(".save-estimate-lead");
    const isRefi = document.body.dataset.loanGoal === "refinance";
    if (title) {
      if (tab === "sms") {
        title.textContent = isRefi
          ? "Text me this refinance estimate"
          : "Text me this estimate";
      } else {
        title.textContent = isRefi
          ? "Email me this refinance estimate"
          : "Email me this estimate";
      }
    }
    if (lead) {
      lead.textContent =
        "Get a clean summary + a quick personalized review from Logan. No obligation.";
    }
  }

  async function submitLead(form) {
    if (submitting) return;
    const emailEl = document.getElementById("saveEstimateEmail");
    const nameEl = document.getElementById("saveEstimateName");
    const phoneEl = document.getElementById("saveEstimatePhone");
    const smsPhoneEl = document.getElementById("saveEstimateSmsPhone");
    const smsConsentEl = document.getElementById("saveEstimateSmsConsent");
    const successEl = document.getElementById("saveEstimateSuccess");
    const tab = isLogan5() ? activeSaveTab() : "email";
    const email = emailEl?.value?.trim() || "";
    const smsPhone = smsPhoneEl?.value?.trim() || "";
    const digits = smsPhone.replace(/\D/g, "");
    const name = nameEl?.value?.trim() || "";

    setFormError("");

    if (tab === "sms") {
      if (digits.length < 10) {
        setFormError("Enter a valid 10-digit mobile number.");
        smsPhoneEl?.focus();
        return;
      }
      if (!smsConsentEl?.checked) {
        setFormError("Check the box to agree to estimate texts.");
        smsConsentEl?.focus();
        return;
      }
    } else if (!email || !email.includes("@")) {
      setFormError("Enter a valid email address.");
      emailEl?.focus();
      return;
    }

    submitting = true;
    setSubmitState(true, "Sending…");

    const assignedLo = resolveAssignedLo();
    const payload = {
      email: tab === "sms" ? `sms+${digits}@estimate.martinimortgagegroup.com` : email,
      name,
      phone: tab === "sms" ? smsPhone : phoneEl?.value?.trim() || "",
      agent: document.documentElement.dataset.coAgent || "",
      ref: assignedLo === "team" ? "" : assignedLo,
      assignedLo,
      version: isLogan5() ? "Logan5" : isLogan4() ? "Logan4" : isLogan3() ? "Logan3" : "Logan1",
      source:
        tab === "sms"
          ? "logan5-sms-estimate"
          : isLogan5()
            ? "logan5-save-estimate"
            : isLogan4()
              ? "logan4-save-estimate"
              : isLogan3()
                ? "logan3-save-estimate"
                : "logan1-save-estimate",
      consent: true,
      smsConsent: tab === "sms" ? true : undefined,
      scenario: {
        ...collectScenario(),
        delivery: tab,
        shareUrl: window.MMG_logan5_buildShareUrl?.() || "",
      },
    };

    try {
      const res = await fetch(`${apiBase()}api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");

      form?.classList.add("hidden");
      document.getElementById("saveEstimateRestore")?.classList.add("hidden");
      if (successEl) {
        successEl.textContent =
          tab === "sms"
            ? "You're set — check your texts shortly."
            : "You're set — check your inbox.";
        successEl.classList.remove("hidden");
        successEl.hidden = false;
      }
      card()?.classList.remove("guided-lead-collapsed");

      try {
        // Don't permanently block guided form on future visits
        if (!(isGuided() && isLogan5())) {
          localStorage.setItem(SUBMITTED_KEY, "1");
        } else {
          sessionStorage.setItem(SUBMITTED_KEY, "1");
        }
      } catch {
        /* ignore */
      }

      window.MMG_trackPixel?.("LeadSubmit", {
        source: payload.source,
        delivery: tab,
      });

      // Non-guided: auto-hide card after success
      if (!(isGuided() && isLogan5())) {
        window.setTimeout(() => hideCard(false), 5000);
      }
    } catch {
      setFormError(
        isLogan4()
          ? "Couldn't save right now — apply or call our team anytime."
          : "Couldn't save right now — apply or call Logan at (919) 238-4934."
      );
      setSubmitState(false, defaultSubmitLabel(tab));
    } finally {
      submitting = false;
      // If form still visible (error path), re-enable; success keeps disabled/hidden
      if (!form?.classList.contains("hidden")) {
        setSubmitState(false, defaultSubmitLabel(tab));
      }
    }
  }

  function onSliderActivity() {
    if (!shouldShow() || shown || isSocialWizard()) return;
    sliderMoves += 1;
    if (sliderMoves >= MIN_SLIDER_MOVES) showCard();
  }

  function scheduleReveal() {
    if (timer || !shouldShow() || isSocialWizard()) return;
    timer = window.setTimeout(() => {
      if (
        document.getElementById("pitiPayment")?.textContent?.trim() &&
        document.getElementById("pitiPayment")?.textContent !== "—"
      ) {
        showCard();
      }
    }, DELAY_MS);
  }

  function logan5EngagedLongEnough() {
    return logan5ResultsAt > 0 && Date.now() - logan5ResultsAt >= LOGAN5_ENGAGEMENT_MS;
  }

  function tryShowLogan5Card() {
    if (!isLogan5() || shown || !shouldShow()) return;
    if (isGuided()) {
      showCard();
      return;
    }
    if (!logan5EngagedLongEnough()) return;
    showCard();
  }

  function scheduleLogan5Reveal() {
    if (!isLogan5() || !shouldShow()) return;
    logan5ResultsAt = Date.now();
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      tryShowLogan5Card();
    }, LOGAN5_DELAY_MS);
    bindLogan5ScrollReveal();
  }

  function bindLogan5ScrollReveal() {
    if (!isLogan5() || logan5ScrollObserver) return;
    const target =
      document.getElementById("ultimatePaymentMain") ||
      document.getElementById("saveEstimateCard");
    if (!target || typeof IntersectionObserver === "undefined") return;
    logan5ScrollObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25);
        if (!visible || shown || !shouldShow()) return;
        if (!logan5EngagedLongEnough()) return;
        if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
        showCard();
      },
      { threshold: [0.25, 0.5] }
    );
    logan5ScrollObserver.observe(target);
  }

  function bindLogan5ScrollDepth() {
    if (!isLogan5() || logan5ScrollDepthObserver) return;
    const target = document.querySelector(".ultimate-payment-details");
    if (!target || typeof IntersectionObserver === "undefined") return;
    logan5ScrollDepthObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (logan5ScrollDepthFired || shown || !shouldShow()) return;
          const docH = document.documentElement.scrollHeight - window.innerHeight;
          const scrolled = docH > 0 ? window.scrollY / docH : 0;
          if (e.isIntersecting && (scrolled >= LOGAN5_SCROLL_DEPTH || e.intersectionRatio >= 0.2)) {
            logan5ScrollDepthFired = true;
            if (logan5EngagedLongEnough()) {
              if (timer) {
                window.clearTimeout(timer);
                timer = null;
              }
              showCard();
            }
          }
        });
      },
      { threshold: [0.15, 0.35, 0.5] }
    );
    logan5ScrollDepthObserver.observe(target);
  }

  function bindSaveEstimateTabs() {
    if (!isLogan5()) return;
    const emailTab = document.getElementById("saveTabEmail");
    const smsTab = document.getElementById("saveTabSms");
    const emailInput = document.getElementById("saveEstimateEmail");
    const smsFields = document.getElementById("saveEstimateSmsFields");
    const phoneOptional = document.getElementById("saveEstimateOptional");
    const title = document.getElementById("saveEstimateHeading") || document.querySelector(".save-estimate-title");
    const lead = document.querySelector(".save-estimate-lead");

    function setTab(tab) {
      const emailPanel = document.getElementById("saveEstimatePanelEmail");
      [emailTab, smsTab].forEach((btn) => {
        if (!btn) return;
        const on = btn.dataset.saveTab === tab;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.setAttribute("tabindex", on ? "0" : "-1");
      });
      if (emailInput) emailInput.required = tab === "email";

      // Email-only fields
      if (emailPanel) {
        // Keep panel structure; hide only email/phone when SMS
        emailPanel.classList.remove("hidden");
        emailPanel.hidden = false;
      }
      const emailField = emailInput?.closest(".guided-field");
      if (emailField) {
        emailField.classList.toggle("hidden", tab === "sms");
        emailField.hidden = tab === "sms";
      }
      if (phoneOptional) {
        phoneOptional.classList.toggle("hidden", tab === "sms");
        phoneOptional.hidden = tab === "sms";
      }

      // Name always visible (outside SMS-only chrome)
      if (smsFields) {
        const showSms = tab === "sms";
        smsFields.classList.toggle("hidden", !showSms);
        smsFields.hidden = !showSms;
      }

      setFormError("");
      const submit = document.querySelector(
        ".save-estimate-submit, #saveEstimateForm [type='submit']"
      );
      if (submit && !submitting) {
        submit.textContent = defaultSubmitLabel(tab);
      }
      applyImpactLeadCopy(tab);
    }

    function onTabKey(e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End")
        return;
      e.preventDefault();
      const tabs = [emailTab, smsTab].filter(Boolean);
      let i = tabs.findIndex((t) => t.classList.contains("active"));
      if (e.key === "ArrowRight") i = (i + 1) % tabs.length;
      if (e.key === "ArrowLeft") i = (i - 1 + tabs.length) % tabs.length;
      if (e.key === "Home") i = 0;
      if (e.key === "End") i = tabs.length - 1;
      const next = tabs[i];
      if (next) {
        setTab(next.dataset.saveTab);
        next.focus();
      }
    }

    emailTab?.addEventListener("click", () => setTab("email"));
    smsTab?.addEventListener("click", () => setTab("sms"));
    emailTab?.addEventListener("keydown", onTabKey);
    smsTab?.addEventListener("keydown", onTabKey);
    setTab("email");
  }

  function bindLogan5HubReveal() {
    if (!isLogan5()) return;
    document.querySelectorAll("[data-hub-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (shown || !shouldShow()) return;
        if (logan5HubTimer) window.clearTimeout(logan5HubTimer);
        logan5HubTimer = window.setTimeout(() => {
          logan5HubTimer = null;
          if (logan5EngagedLongEnough()) showCard();
        }, LOGAN5_HUB_DELAY_MS);
      });
    });
  }

  function bindLogan4ScrollReveal() {
    if (!isLogan4() || logan4ScrollObserver) return;
    const target = document.getElementById("martiniAdvantage");
    if (!target || typeof IntersectionObserver === "undefined") return;
    logan4ScrollObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.35);
        if (!visible || shown || !shouldShow()) return;
        if (Date.now() - logan4ResultsAt < LOGAN4_SCROLL_MIN_MS) return;
        if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
        showCard();
      },
      { threshold: [0.35, 0.55] }
    );
    logan4ScrollObserver.observe(target);
  }

  function bind() {
    const el = card();
    // Always bind form handlers when the card exists — even if previously dismissed
    if (!el) return;

    if (isLogan1() && shouldShow()) {
      document
        .querySelectorAll('input[type="range"], #homePriceInput, #downAmountInput')
        .forEach((node) => node.addEventListener("input", onSliderActivity));
      document.addEventListener("mmg-calculated", scheduleReveal);
    }

    if (isLogan4()) {
      document.addEventListener("mmg-wizard-results", () => {
        logan4ResultsAt = Date.now();
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          showCard();
        }, LOGAN4_DELAY_MS);
        bindLogan4ScrollReveal();
      });
    } else if (isLogan5()) {
      document.addEventListener("mmg-wizard-results", () => {
        if (isGuided()) {
          showCard();
        } else {
          scheduleLogan5Reveal();
          bindLogan5ScrollDepth();
        }
      });
      bindLogan5HubReveal();
      bindSaveEstimateTabs();
    } else if (isLogan3()) {
      document.addEventListener("mmg-wizard-results", () => {
        window.setTimeout(showCard, 400);
      });
    }

    document
      .getElementById("saveEstimateDismiss")
      ?.addEventListener("click", () => hideCard(!isGuided()));
    document
      .getElementById("saveEstimateSkip")
      ?.addEventListener("click", () => hideCard(!isGuided()));
    document.getElementById("saveEstimateRestore")?.addEventListener("click", () => {
      showCard();
      document.getElementById("saveEstimateEmail")?.focus();
    });

    document.getElementById("saveEstimateForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      submitLead(e.target);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
