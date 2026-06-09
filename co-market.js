/**
 * Realtor co-marketing — load agent via ?agent=slug, partners/{slug}.json, or URL params.
 * Works on Logan1 (realtor.html legacy) and Logan5 realtor wizard (logan5-realtor).
 */
(function () {
  "use strict";

  const PARAM_KEYS = {
    name: ["realtor_name", "agent_name", "name"],
    brokerage: ["realtor_brokerage", "brokerage", "office"],
    phone: ["realtor_phone", "agent_phone", "phone"],
    email: ["realtor_email", "agent_email", "email"],
    photo: ["realtor_photo", "agent_photo", "photo"],
    logo: ["realtor_logo", "agent_logo", "logo"],
    website: ["realtor_url", "agent_url", "website"],
    title: ["realtor_title", "agent_title", "title"],
  };

  const CO_MARKET_NOTE =
    "Educational payment estimates only. Your agent is not a lender. Martini Mortgage Group is solely responsible for mortgage offerings. You are free to shop for any lender (RESPA).";

  function firstParam(params, keys) {
    for (const k of keys) {
      const v = params.get(k)?.trim();
      if (v) return v;
    }
    return "";
  }

  function humanizeSlug(slug) {
    return String(slug || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  function assetUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path.replace(/^\//, ""), window.location.href).toString();
  }

  function setImg(el, src, alt) {
    if (!el || !src) return;
    el.src = assetUrl(src);
    el.alt = alt || "";
    el.classList.remove("hidden");
  }

  function isLogan5Realtor() {
    return document.body.classList.contains("logan5-realtor");
  }

  async function loadAgentConfig(slug) {
    const clean = slug.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!clean) return null;
    try {
      const res = await fetch(`partners/${clean}.json`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function mergeConfig(fileCfg, params, slug) {
    const out = { ...(fileCfg || {}) };
    if (slug && !out.slug) out.slug = slug.replace(/[^a-zA-Z0-9_-]/g, "");
    for (const [field, keys] of Object.entries(PARAM_KEYS)) {
      const fromUrl = firstParam(params, keys);
      if (fromUrl) out[field] = fromUrl;
    }
    if (!out.name && out.slug) {
      out.name = humanizeSlug(out.slug);
    }
    return out;
  }

  function hasPartnerIdentity(cfg) {
    return Boolean(cfg?.name || cfg?.photo || cfg?.logo || cfg?.slug);
  }

  function applyWizardCoMarket(cfg) {
    const eyebrowDefault = document.getElementById("wizardEyebrowDefault");
    const eyebrowCo = document.getElementById("wizardEyebrowCoMarket");
    const leadDefault = document.getElementById("wizardLeadDefault");
    const leadCo = document.getElementById("wizardLeadCoMarket");
    const wizardNote = document.getElementById("coMarketWizardNote");
    const strip = document.getElementById("ultimateRealtorStrip");

    if (eyebrowDefault) eyebrowDefault.classList.add("hidden");
    if (leadDefault) leadDefault.classList.add("hidden");
    if (eyebrowCo) {
      eyebrowCo.textContent = cfg.name
        ? `${cfg.name} + Martini Mortgage Group`
        : "Your agent + Martini Mortgage Group";
      eyebrowCo.classList.remove("hidden");
    }
    if (leadCo) {
      leadCo.innerHTML = cfg.name
        ? `<strong>${cfg.name}</strong>${cfg.brokerage ? ` · ${cfg.brokerage}` : ""} shared this calculator to help you estimate payments while you shop. Financing estimates are provided separately by Martini Mortgage Group.`
        : "Your agent shared this calculator to help you estimate payments while you shop. Financing estimates are provided separately by Martini Mortgage Group.";
      leadCo.classList.remove("hidden");
    }
    if (wizardNote) {
      wizardNote.textContent = CO_MARKET_NOTE;
      wizardNote.classList.remove("hidden");
    }
    if (strip && cfg.name) {
      strip.classList.remove("hidden");
      strip.innerHTML =
        `Partner: <strong>${cfg.name}</strong>${cfg.brokerage ? ` · ${cfg.brokerage}` : ""}. ` +
        `Questions about financing? <a href="tel:+19192384934">Call Logan</a> or <a href="#" data-mmg-apply>apply with Martini</a>. ` +
        `Your agent does not provide loans or rate quotes.`;
    }
  }

  function applyCoMarket(cfg) {
    if (!hasPartnerIdentity(cfg)) return false;

    const bar = document.getElementById("coMarketBar");
    if (!bar) return false;

    bar.classList.remove("hidden");
    document.body.classList.add("co-market-active");
    const legal = document.getElementById("coMarketLegal");
    if (legal) legal.classList.remove("hidden");
    document.documentElement.dataset.coAgent = cfg.slug || cfg.name || "agent";
    document.documentElement.dataset.partnerRef = cfg.slug || cfg.name || "";

    const nameEl = document.getElementById("realtorName");
    const brokerageEl = document.getElementById("realtorBrokerage");
    const phoneEl = document.getElementById("realtorPhone");
    const emailEl = document.getElementById("realtorEmail");
    const heroLead = document.getElementById("coMarketHeroLead");

    if (nameEl) nameEl.textContent = cfg.name || "Your real estate agent";
    if (brokerageEl) {
      brokerageEl.textContent = cfg.brokerage || cfg.title || "";
      brokerageEl.classList.toggle("hidden", !(cfg.brokerage || cfg.title));
    }
    if (phoneEl && cfg.phone) {
      const digits = String(cfg.phone).replace(/\D/g, "");
      phoneEl.href = `tel:+1${digits}`;
      phoneEl.textContent = cfg.phoneDisplay || cfg.phone;
      phoneEl.classList.remove("hidden");
    } else if (phoneEl) {
      phoneEl.classList.add("hidden");
    }
    if (emailEl && cfg.email) {
      emailEl.href = `mailto:${cfg.email}`;
      emailEl.textContent = cfg.email;
      emailEl.classList.remove("hidden");
    } else if (emailEl) {
      emailEl.classList.add("hidden");
    }

    setImg(document.getElementById("realtorPhoto"), cfg.photo, cfg.name);
    setImg(document.getElementById("realtorLogo"), cfg.logo, cfg.brokerage || cfg.name);

    const headline = document.getElementById("coMarketHeadline");
    if (headline && cfg.name) {
      headline.textContent = `${cfg.name} + Martini Mortgage Group`;
    }

    if (heroLead && cfg.name) {
      heroLead.innerHTML =
        `<strong>${cfg.name}</strong>${cfg.brokerage ? ` · ${cfg.brokerage}` : ""} shared this calculator to help you estimate payments while you shop. Financing estimates are provided by Martini Mortgage Group.`;
    }

    if (isLogan5Realtor()) {
      applyWizardCoMarket(cfg);
    } else {
      const mobileBanner = document.querySelector(".simple-mobile-banner");
      if (mobileBanner && cfg.name) {
        const strong = mobileBanner.querySelector("strong");
        const span = mobileBanner.querySelector("span");
        if (strong) strong.textContent = "What's my payment?";
        if (span) {
          span.textContent = `Slide price & down payment — powered by ${cfg.name} & Martini Mortgage Group.`;
        }
      }
    }

    const share = document.getElementById("partnerShare");
    const shareInput = document.getElementById("shareLinkInput");
    const shareLabel = document.getElementById("partnerShareLabel");
    const shareFooter = document.getElementById("realtorShareFooter");
    if (share && shareInput) {
      const u = new URL(window.location.href);
      u.searchParams.delete("embed");
      if (cfg.slug) u.searchParams.set("agent", cfg.slug);
      shareInput.value = u.toString();
      if (paramsShareVisible()) share.classList.remove("hidden");
      if (shareLabel) {
        shareLabel.textContent = `Share your co-branded link with buyers${cfg.name ? ` (${cfg.name})` : ""}`;
      }
      if (shareFooter) {
        shareFooter.href = u.toString();
        shareFooter.textContent = cfg.name ? `${cfg.name}'s share link` : "Partner share link";
      }
    }

    document.dispatchEvent(new CustomEvent("mmg-co-market-ready", { detail: cfg }));
    return true;
  }

  function paramsShareVisible() {
    const params = new URLSearchParams(window.location.search);
    return params.get("share") === "1" || params.get("share") === "true";
  }

  function defaultAgentSlug() {
    const path = (window.location.pathname || "").toLowerCase();
    if (
      path.endsWith("/realtor.html") ||
      path.endsWith("/realtor") ||
      document.body.classList.contains("logan1-realtor") ||
      document.body.classList.contains("logan5-realtor")
    ) {
      return "tyler-chestnutt";
    }
    return "";
  }

  async function init() {
    if (!document.body.classList.contains("co-market-ready")) return;

    const params = new URLSearchParams(window.location.search);
    const slug = (
      params.get("agent") ||
      params.get("realtor") ||
      params.get("ref") ||
      defaultAgentSlug()
    ).trim();

    let fileCfg = null;
    if (slug) {
      fileCfg = await loadAgentConfig(slug);
      if (fileCfg) fileCfg.slug = slug.replace(/[^a-zA-Z0-9_-]/g, "");
    }

    const cfg = mergeConfig(fileCfg, params, slug);
    if (applyCoMarket(cfg)) {
      document.title = `${cfg.name ? cfg.name + " · " : ""}Payment Calculator | Martini Mortgage Group`;
      if (cfg.website) {
        const web = document.getElementById("realtorWebsite");
        if (web) {
          web.href = cfg.website;
          web.textContent = "Agent website";
          web.classList.remove("hidden");
        }
      }
    }
  }

  window.MMG_initCoMarket = init;
  window.MMG_humanizeAgentSlug = humanizeSlug;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();