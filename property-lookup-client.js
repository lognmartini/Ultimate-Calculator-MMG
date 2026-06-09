/**
 * Browser-side property valuation when /api/property is unavailable (static/WordPress hosting).
 * Realtor.com list price / estimate + NC public parcel records (CORS-allowed on martinimortgagegroup.com).
 */
(function () {
  "use strict";

  const REALTOR_GQL = "https://www.realtor.com/frontdoor/graphql";
  const REALTOR_GEO = "https://parser-external.geo.moveaws.com/suggest";
  const WAKE_PARCEL_LAYER =
    "https://maps.wake.gov/arcgis/rest/services/Property/Parcels/MapServer/0";
  const NC_PARCEL_LAYER =
    "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1";
  const MIN_LIST_PRICE = 25000;
  const MIN_LAST_SALE = 25000;
  const RECENT_SALE_YEARS = 3;
  const ACTIVE_STATUSES = new Set([
    "for_sale",
    "for_rent",
    "active",
    "coming_soon",
    "new_community",
  ]);

  const REALTOR_HEADERS = {
    "Content-Type": "application/json",
    Accept: "*/*",
    "rdc-client-name": "RDC_WEB_SRP_FS_PAGE",
    "rdc-client-version": "3.0.2515",
    "x-is-bot": "false",
  };

  const HOME_DETAILS_QUERY = `
    query GetHomeDetails($property_id: ID!) {
      home(property_id: $property_id) {
        status
        list_price
        last_sold_price
        location { address { line } }
        estimates {
          currentValues: current_values {
            estimate
            isBestHomeValue: isbest_homevalue
          }
        }
      }
    }
  `;

  function roundHomePrice(price) {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const rounded = Math.round(n / 5000) * 5000;
    return Math.min(3000000, Math.max(50000, rounded));
  }

  function normalizeCounty(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+county$/i, "")
      .trim();
  }

  function streetNumber(addr) {
    const m = String(addr || "").match(/^\s*(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function addressesAlign(siteLine, reference) {
    const nRef = streetNumber(reference);
    const nSite = streetNumber(siteLine);
    if (nRef == null || nSite == null) return true;
    return Math.abs(nRef - nSite) <= 10;
  }

  function stateFromText(text) {
    const m = String(text || "").toUpperCase().match(/\b([A-Z]{2})\b/);
    return m ? m[1] : "";
  }

  function zipFromText(text) {
    const m = String(text || "").match(/\b(\d{5})(?:-\d{4})?\b/);
    return m ? m[1] : "";
  }

  function scoreGeoCandidate(geo, searchTerm, loc) {
    let score = 0;
    const refState = loc?.state || stateFromText(searchTerm);
    const refZip = loc?.zip || zipFromText(searchTerm);
    const refNum = streetNumber(searchTerm);

    if (refState && String(geo.state_code || "").toUpperCase() === refState.toUpperCase()) {
      score += 50;
    }
    if (refZip && String(geo.postal_code || "") === refZip) score += 40;
    const geoNum = streetNumber(geo.line || "");
    if (refNum != null && geoNum != null && refNum === geoNum) score += 30;
    if (geo.area_type === "address") score += 10;
    if ((geo.prop_status || []).includes("for_sale")) score += 5;
    return score;
  }

  function pickBestGeo(candidates, searchTerm, loc) {
    if (!candidates.length) return null;
    const ranked = [...candidates].sort(
      (a, b) => scoreGeoCandidate(b, searchTerm, loc) - scoreGeoCandidate(a, searchTerm, loc)
    );
    return scoreGeoCandidate(ranked[0], searchTerm, loc) >= 50 ? ranked[0] : null;
  }

  function realtorSearchTerms(address, loc) {
    const seen = new Set();
    const terms = [];
    const add = (val) => {
      const v = String(val || "")
        .replace(/\s+/g, " ")
        .trim();
      if (v.length < 8) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      terms.push(v);
    };

    add(address);
    add(loc?.display);

    const streetMatch = String(address || "").match(/^(\d+\s+[^,]+)/);
    const street = streetMatch ? streetMatch[1].trim() : "";
    const city = String(loc?.city || "").trim();
    const state = String(loc?.state || "").trim();
    const zip = String(loc?.zip || "").trim();
    if (street && city && state) add(`${street}, ${city}, ${state} ${zip}`.trim());
    if (city && state && zip) add(`${city}, ${state} ${zip}`);
    return terms;
  }

  async function realtorGeoSuggest(searchTerm) {
    const params = new URLSearchParams({
      input: searchTerm,
      client_id: "listings",
      limit: "8",
    });
    const res = await fetch(`${REALTOR_GEO}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.autocomplete || [])
      .filter((item) => item.area_type === "address" && item.mpr_id)
      .map((item) => ({
        mpr_id: item.mpr_id,
        prop_status: item.prop_status || [],
        line: item.line || "",
        city: item.city || "",
        state_code: item.state_code || "",
        postal_code: item.postal_code || "",
        area_type: "address",
      }));
  }

  async function resolvePropertyGeo(searchTerm, loc) {
    const candidates = await realtorGeoSuggest(searchTerm);
    const seen = new Set();
    const unique = [];
    for (const g of candidates) {
      if (!g.mpr_id || seen.has(g.mpr_id)) continue;
      seen.add(g.mpr_id);
      unique.push(g);
    }
    return pickBestGeo(unique, searchTerm, loc);
  }

  async function fetchRealtorHome(propertyId) {
    const res = await fetch(REALTOR_GQL, {
      method: "POST",
      headers: REALTOR_HEADERS,
      body: JSON.stringify({
        operationName: "GetHomeDetails",
        query: HOME_DETAILS_QUERY.replace(/\s+/g, " ").trim(),
        variables: { property_id: String(propertyId) },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.home || null;
  }

  function pickBestEstimate(home) {
    const estimates = home?.estimates?.currentValues || [];
    if (!estimates.length) return null;
    const best = estimates.reduce((a, b) => {
      const scoreA = (a.isBestHomeValue ? 1 : 0) * 1e12 + Number(a.estimate || 0);
      const scoreB = (b.isBestHomeValue ? 1 : 0) * 1e12 + Number(b.estimate || 0);
      return scoreB > scoreA ? b : a;
    });
    const val = Number(best.estimate);
    return Number.isFinite(val) && val > 0 ? Math.round(val) : null;
  }

  function valuationFromRealtorHome(home, geo) {
    const status = String(home?.status || "").toLowerCase();
    const listPrice = Number(home?.list_price);
    if (ACTIVE_STATUSES.has(status) && listPrice >= MIN_LIST_PRICE) {
      return {
        homePrice: roundHomePrice(listPrice),
        priceSource: "list_price",
        priceSourceLabel: "active listing price",
      };
    }

    const estimate = pickBestEstimate(home);
    if (estimate) {
      return {
        homePrice: roundHomePrice(estimate),
        priceSource: "estimated_value",
        priceSourceLabel: "estimated market value",
      };
    }

    const lastSold = Number(home?.last_sold_price);
    if (lastSold >= MIN_LIST_PRICE) {
      return {
        homePrice: roundHomePrice(lastSold),
        priceSource: "last_sale",
        priceSourceLabel: "last recorded sale price",
      };
    }

    if (
      geo &&
      (geo.prop_status || []).includes("for_sale") &&
      listPrice >= MIN_LIST_PRICE
    ) {
      return {
        homePrice: roundHomePrice(listPrice),
        priceSource: "list_price",
        priceSourceLabel: "active listing price",
      };
    }

    return null;
  }

  async function fetchRealtorValuation(address, loc) {
    let geo = null;
    for (const term of realtorSearchTerms(address, loc)) {
      geo = await resolvePropertyGeo(term, loc);
      if (geo?.mpr_id) break;
    }
    if (!geo?.mpr_id) return null;

    let home;
    try {
      home = await fetchRealtorHome(geo.mpr_id);
    } catch {
      return null;
    }
    if (!home) return null;

    const siteLine = home?.location?.address?.line || geo.line || "";
    const ref = address || loc?.display || "";
    if (siteLine && ref && !addressesAlign(siteLine, ref)) return null;

    return valuationFromRealtorHome(home, geo);
  }

  async function arcgisParcelQuery(layerUrl, lon, lat, outFields) {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields,
      returnGeometry: "false",
      f: "json",
    });
    const res = await fetch(`${layerUrl}/query?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.features?.[0]?.attributes || null;
  }

  function parseArcgisSaleDate(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    return ms / 1000;
  }

  function saleIsRecent(saleTs) {
    if (!saleTs) return false;
    const now = Date.now() / 1000;
    if (saleTs > now + 86400) return false;
    const age = now - saleTs;
    return age >= 0 && age <= RECENT_SALE_YEARS * 365.25 * 86400;
  }

  function lastSalePlausible(price, assessed) {
    if (!price || price < MIN_LAST_SALE) return false;
    if (assessed > 0 && price < assessed * 0.25) return false;
    return true;
  }

  async function fetchNcParcelValuation(loc, address) {
    if (String(loc?.state || "").toUpperCase() !== "NC") {
      return { valuation: null, parcelMismatch: false };
    }
    const lat = loc?.latitude;
    const lon = loc?.longitude;
    if (lat == null || lon == null) return { valuation: null, parcelMismatch: false };

    let assessed = null;
    let lastSale = null;
    let saleTs = null;
    let siteAddress = "";
    const reference = String(loc?.display || address || "").trim();

    if (normalizeCounty(loc?.county) === "wake") {
      const wake = await arcgisParcelQuery(
        WAKE_PARCEL_LAYER,
        lon,
        lat,
        "SITE_ADDRESS,TOTAL_VALUE_ASSD,TOTSALPRICE,SALE_DATE"
      );
      if (wake) {
        siteAddress = String(wake.SITE_ADDRESS || "").trim();
        assessed = wake.TOTAL_VALUE_ASSD ?? assessed;
        lastSale = wake.TOTSALPRICE ?? lastSale;
        saleTs = parseArcgisSaleDate(wake.SALE_DATE);
      }
    }

    const nc = await arcgisParcelQuery(NC_PARCEL_LAYER, lon, lat, "parval,siteadd");
    if (nc) {
      if (nc.parval) assessed = nc.parval ?? assessed;
      if (!siteAddress && nc.siteadd) siteAddress = String(nc.siteadd || "").trim();
    }

    if (siteAddress && reference && !addressesAlign(siteAddress, reference)) {
      return { valuation: null, parcelMismatch: true };
    }

    const assessedF = Number(assessed) || 0;
    const lastSaleF = Number(lastSale) || 0;

    if (
      lastSaleF >= MIN_LAST_SALE &&
      saleIsRecent(saleTs) &&
      lastSalePlausible(lastSaleF, assessedF)
    ) {
      return {
        valuation: {
          homePrice: roundHomePrice(lastSaleF),
          priceSource: "last_sale",
          priceSourceLabel: "recent county sale record",
        },
        parcelMismatch: false,
      };
    }

    if (assessedF >= MIN_LIST_PRICE) {
      return {
        valuation: {
          homePrice: roundHomePrice(assessedF),
          priceSource: "assessed_value",
          priceSourceLabel: "county assessed value (public records)",
        },
        parcelMismatch: false,
      };
    }

    return { valuation: null, parcelMismatch: false };
  }

  function lookupTier(score, table, key) {
    const rows = table || [];
    for (const row of rows) {
      if (score >= row.min) return row[key];
    }
    return rows.length ? rows[rows.length - 1][key] : 0;
  }

  function taxRate(state, countyName) {
    const rates = window.MMG_TAX_RATES || {};
    const st = String(state || "NC").toUpperCase();
    const countyKey = normalizeCounty(countyName);
    const countyRate = rates.counties?.[st]?.[countyKey];
    if (countyRate != null) return countyRate;
    return rates.states?.[st] ?? rates.states?.NC ?? 0.84;
  }

  function insuranceRate(state, creditScore) {
    const rates = window.MMG_TAX_RATES || {};
    const st = String(state || "NC").toUpperCase();
    const base = rates.insuranceByState?.[st] ?? rates.insuranceByState?.default ?? 0.4;
    const mult = lookupTier(Number(creditScore) || 740, window.MMG_CREDIT?.insuranceMult, "mult");
    return base * (mult || 1);
  }

  async function clientPropertyLookup(address, loc, options) {
    const opts = options || {};
    const creditScore = Number(opts.creditScore) || 740;
    const fallbackPrice = Number(opts.homePrice) || 450000;
    const updatePrice = opts.updatePrice !== false;

    if (!loc?.state) return null;

    let valuation = null;
    let parcelMismatch = false;

    if (updatePrice) {
      try {
        valuation = await fetchRealtorValuation(address, loc);
      } catch {
        valuation = null;
      }
      if (!valuation) {
        const nc = await fetchNcParcelValuation(loc, address);
        parcelMismatch = nc.parcelMismatch;
        valuation = nc.valuation;
      }
    }

    if (parcelMismatch) {
      return {
        location: loc,
        parcelMismatch: true,
        priceLookupConfigured: true,
        updatePriceRequested: updatePrice,
      };
    }

    const fillPrice = valuation?.homePrice || 0;
    const homePrice = fillPrice > 0 ? fillPrice : fallbackPrice;
    const rate = taxRate(loc.state, loc.county);
    const insRate = insuranceRate(loc.state, creditScore);

    return {
      location: loc,
      homePrice,
      autoFillPrice: fillPrice > 0 ? fillPrice : null,
      annualTax: Math.round(homePrice * (rate / 100)),
      annualInsurance: Math.round(homePrice * (insRate / 100)),
      taxRatePercent: rate,
      insuranceRatePercent: Math.round(insRate * 1000) / 1000,
      taxSource: "county_median_rate",
      assessedValue:
        valuation?.priceSource === "assessed_value" ? fillPrice : null,
      priceSource: valuation?.priceSource || null,
      priceSourceLabel: valuation?.priceSourceLabel || null,
      priceLookupConfigured: true,
      priceLookupSource: valuation ? "realtor_client" : "nc_parcel_client",
      parcelMismatch: false,
    };
  }

  window.MMG_clientPropertyLookup = clientPropertyLookup;
})();