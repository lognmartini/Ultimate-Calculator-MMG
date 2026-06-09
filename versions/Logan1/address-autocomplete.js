/**
 * GPS-style address autocomplete (Esri + server suggest).
 * Loads independently so suggestions work even if other scripts fail.
 */
(function () {
  "use strict";

  const input = document.getElementById("propertyAddress");
  const list = document.getElementById("addressSuggestions");
  if (!input || !list) return;

  let debounceTimer = null;
  let requestId = 0;
  let activeIndex = -1;
  let lastItems = [];
  let portaled = false;

  function apiBase() {
    if (window.location.protocol === "file:") return null;
    return "";
  }

  function suggestBias(query) {
    const q = query.toUpperCase();
    if (/\bNC\b|NORTH CAROLINA/.test(q)) {
      return { lon: -78.6382, lat: 35.7796, dist: 150000 };
    }
    if (
      /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/.test(
        q
      )
    ) {
      return { lon: -98.5, lat: 39.8, dist: 2500000 };
    }
    return { lon: -78.6382, lat: 35.7796, dist: 200000 };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function portalList() {
    if (!portaled) {
      document.body.appendChild(list);
      portaled = true;
    }
  }

  function positionList() {
    portalList();
    const r = input.getBoundingClientRect();
    list.style.position = "fixed";
    list.style.top = `${r.bottom + 4}px`;
    list.style.left = `${r.left}px`;
    list.style.width = `${Math.max(r.width, 300)}px`;
    list.style.zIndex = "99999";
    list.style.display = "block";
  }

  function showOpen() {
    list.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
    positionList();
  }

  function hideList() {
    list.classList.add("hidden");
    list.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    lastItems = [];
  }

  function showLoading() {
    list.innerHTML =
      '<li class="address-suggestions-loading" role="presentation">Searching addresses…</li>';
    showOpen();
  }

  async function fetchEsri(q) {
    const { lon, lat, dist } = suggestBias(q);
    const params = new URLSearchParams({
      text: q,
      countryCode: "USA",
      maxSuggestions: "15",
      f: "json",
      location: `${lon},${lat}`,
      distance: String(dist),
      category: "Address",
    });
    const res = await fetch(
      `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?${params}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set();
    return (data.suggestions || [])
      .filter((s) => {
        if (!s.text || s.isCollection || seen.has(s.text)) return false;
        seen.add(s.text);
        return true;
      })
      .map((s) => ({
        label: s.text,
        magicKey: s.magicKey || "",
        location: { display: s.text },
      }));
  }

  async function fetchServer(q) {
    const base = apiBase();
    if (base === null) return [];
    const res = await fetch(`${base}/api/suggest?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  function mergeLists(arrays) {
    const seen = new Set();
    const out = [];
    for (const arr of arrays) {
      for (const item of arr) {
        const label = (item.label || item.text || "").trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        out.push({
          label,
          magicKey: item.magicKey || "",
          location: item.location || { display: label },
        });
      }
    }
    return out.slice(0, 15);
  }

  async function fetchSuggestions(q) {
    const [esri, server] = await Promise.all([
      fetchEsri(q).catch(() => []),
      fetchServer(q).catch(() => []),
    ]);
    return mergeLists([esri, server]);
  }

  function renderItems(items) {
    lastItems = items;
    if (!items.length) {
      list.innerHTML =
        '<li class="address-suggestions-empty" role="presentation">No matches — keep typing</li>';
      showOpen();
      return;
    }
    list.innerHTML = items
      .map(
        (item, i) =>
          `<li role="option" data-index="${i}" tabindex="-1">${escapeHtml(item.label)}</li>`
      )
      .join("");
    showOpen();
    list.querySelectorAll("li[role='option']").forEach((li) => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pickItem(items[Number(li.dataset.index)]);
      });
    });
  }

  async function pickItem(item) {
    if (!item) return;
    input.value = item.label;
    hideList();
    if (typeof window.MMG_onAddressPick === "function") {
      try {
        await window.MMG_onAddressPick(item);
      } catch (err) {
        console.error("MMG_onAddressPick failed:", err);
      }
      return;
    }
    window.dispatchEvent(new CustomEvent("mmg:address-selected", { detail: item }));
  }

  async function runSearch(q) {
    const query = q.trim();
    if (!query.length) {
      hideList();
      return;
    }
    const id = ++requestId;
    showLoading();
    let items = [];
    try {
      items = await fetchSuggestions(query);
    } catch {
      items = [];
    }
    if (id !== requestId) return;
    renderItems(items);
  }

  function scheduleSearch() {
    const q = input.value;
    clearTimeout(debounceTimer);
    if (!q.trim().length) {
      hideList();
      return;
    }
    showLoading();
    debounceTimer = setTimeout(() => runSearch(q), 60);
  }

  input.addEventListener("input", scheduleSearch);
  input.addEventListener("focus", () => {
    if (input.value.trim().length) scheduleSearch();
  });

  input.addEventListener("keydown", (e) => {
    const options = list.querySelectorAll("li[role='option']");
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
      options.forEach((li, i) => li.classList.toggle("active", i === activeIndex));
      return;
    }
    if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      options.forEach((li, i) => li.classList.toggle("active", i === activeIndex));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && lastItems[activeIndex]) {
        pickItem(lastItems[activeIndex]);
      } else if (typeof window.MMG_lookupAddress === "function") {
        hideList();
        window.MMG_lookupAddress();
      }
    }
    if (e.key === "Escape") hideList();
  });

  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest("#propertyAddress") && !e.target.closest("#addressSuggestions")) {
      hideList();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!list.classList.contains("hidden")) positionList();
    },
    true
  );
  window.addEventListener("resize", () => {
    if (!list.classList.contains("hidden")) positionList();
  });

  window.MMG_addressAutocomplete = {
    refresh: () => runSearch(input.value),
    hide: hideList,
  };
})();