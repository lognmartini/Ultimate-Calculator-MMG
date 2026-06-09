/**
 * Logan1 realtor co-marketing — load agent photo/logo via ?agent=slug or URL params.
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
  };

  function firstParam(params, keys) {
    for (const k of keys) {
      const v = params.get(k)?.trim();
      if (v) return v;
    }
    return "";
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

  function mergeConfig(fileCfg, params) {
    const out = { ...(fileCfg || {}) };
    for (const [field, keys] of Object.entries(PARAM_KEYS)) {
      const fromUrl = firstParam(params, keys);
      if (fromUrl) out[field] = fromUrl;
    }
    return out;
  }

  function applyCoMarket(cfg) {
    if (!cfg?.name && !cfg?.photo && !cfg?.logo) return false;

    const bar = document.getElementById("coMarketBar");
    if (!bar) return false;

    bar.classList.remove("hidden");
    document.body.classList.add("co-market-active");
    const legal = document.getElementById("coMarketLegal");
    if (legal) legal.classList.remove("hidden");
    document.documentElement.dataset.coAgent = cfg.slug || cfg.name || "agent";

    const nameEl = document.getElementById("realtorName");
    const brokerageEl = document.getElementById("realtorBrokerage");
    const phoneEl = document.getElementById("realtorPhone");
    const emailEl = document.getElementById("realtorEmail");
    const heroLead = document.getElementById("coMarketHeroLead");

    if (nameEl) nameEl.textContent = cfg.name || "Your real estate agent";
    if (brokerageEl) {
      brokerageEl.textContent = cfg.brokerage || "";
      brokerageEl.classList.toggle("hidden", !cfg.brokerage);
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
        `<strong>${cfg.name}</strong>${cfg.brokerage ? ` · ${cfg.brokerage}` : ""} shared this calculator to help you estimate payments while you shop for a home. Financing estimates are provided by Martini Mortgage Group.`;
    }

    const mobileBanner = document.querySelector(".simple-mobile-banner");
    if (mobileBanner && cfg.name) {
      const strong = mobileBanner.querySelector("strong");
      const span = mobileBanner.querySelector("span");
      if (strong) strong.textContent = "What's my payment?";
      if (span) {
        span.textContent =
          `Slide price & down payment — powered by ${cfg.name} & Martini Mortgage Group.`;
      }
    }

    const share = document.getElementById("partnerShare");
    const shareInput = document.getElementById("shareLinkInput");
    const shareLabel = document.getElementById("partnerShareLabel");
    if (share && shareInput) {
      const u = new URL(window.location.href);
      u.searchParams.delete("embed");
      if (cfg.slug) u.searchParams.set("agent", cfg.slug);
      shareInput.value = u.toString();
      share.classList.remove("hidden");
      if (shareLabel) {
        shareLabel.textContent = `Share your co-branded link with buyers${cfg.name ? ` (${cfg.name})` : ""}`;
      }
    }

    document.dispatchEvent(new CustomEvent("mmg-co-market-ready", { detail: cfg }));
    return true;
  }

  function defaultAgentSlug() {
    const path = (window.location.pathname || "").toLowerCase();
    if (path.endsWith("/realtor.html") || path.endsWith("/realtor")) {
      return "tyler-chestnutt";
    }
    if (document.body.classList.contains("logan1-realtor")) {
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
      if (fileCfg) fileCfg.slug = slug;
    }
    const cfg = mergeConfig(fileCfg, params);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();