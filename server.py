#!/usr/bin/env python3
"""Static files + property/geocode API (Esri US address search)."""
from __future__ import annotations

import json
import os
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(ROOT, ".pmms-cache.json")
PROPERTY_CACHE_PATH = os.path.join(ROOT, ".property-cache.json")
CACHE_TTL_SEC = 86400  # 24 hours
PROPERTY_CACHE_TTL_SEC = 86400
USER_AGENT = "MartiniMortgageCalculator/1.0 (martinimortgagegroup.com)"
RENTCAST_BASE = "https://api.rentcast.io/v1"
ESRI_GEOCODE = (
    "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
)
ARCGIS_PROJECT = (
    "https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer/project"
)
NC_PARCEL_LAYER = (
    "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1"
)
WAKE_PARCEL_LAYER = (
    "https://maps.wake.gov/arcgis/rest/services/Property/Parcels/MapServer/0"
)
NC_STATE_PLANE_WKID = 102719
RECENT_SALE_MAX_AGE_YEARS = 3
MIN_LAST_SALE_PRICE = 25000

NC_COUNTY_TAX = {
    "wake": 0.86, "durham": 1.22, "orange": 1.18, "chatham": 0.95,
    "johnston": 0.92, "mecklenburg": 0.98, "union": 0.88, "cabarrus": 0.94,
    "guilford": 1.15, "forsyth": 1.02, "newhanover": 0.72, "brunswick": 0.68,
}

STATE_TAX = {
    "NC": 0.84, "SC": 0.57, "VA": 0.82, "FL": 0.89, "GA": 0.92,
    "TN": 0.71, "TX": 1.8, "CA": 0.75, "NY": 1.72,
}

STATE_NAME_TO_CODE = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI",
    "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA",
    "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}

# Triangle / Raleigh default search bias (lon, lat)
RALEIGH_LON, RALEIGH_LAT = -78.6382, 35.7796


def load_env_file() -> None:
    """Load KEY=VALUE pairs from .env in project root (does not override existing env)."""
    path = os.path.join(ROOT, ".env")
    if not os.path.isfile(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
    except OSError:
        pass


load_env_file()

try:
    from realtor_lookup import fetch_realtor_valuation
except ImportError:
    fetch_realtor_valuation = None  # type: ignore


def fetch_json(url: str, headers: dict | None = None) -> dict | list:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def resolve_state(state_val: str) -> str:
    if not state_val:
        return ""
    s = state_val.strip()
    if len(s) == 2:
        return s.upper()
    return STATE_NAME_TO_CODE.get(s.lower(), "")


def normalize_county(name: str) -> str:
    return re.sub(r"[^a-z]", "", (name or "").lower().replace(" county", ""))


def suggest_location_bias(query: str) -> tuple[float, float, int]:
    """Return lon, lat, distance(m) for Esri search bias."""
    q = query.upper()
    if re.search(r"\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b", q):
        if re.search(r"\bNC\b|NORTH CAROLINA", q):
            return RALEIGH_LON, RALEIGH_LAT, 150000
        return -98.5, 39.8, 2500000
    if any(k in q.lower() for k in ("raleigh", "cary", "apex", "durham", "wake", "triangle", "holly spring", "fuquay", "garner", "clayton")):
        return RALEIGH_LON, RALEIGH_LAT, 120000
    return RALEIGH_LON, RALEIGH_LAT, 200000


def esri_suggest(query: str) -> list[dict]:
    lon, lat, dist = suggest_location_bias(query)
    params = {
        "text": query,
        "countryCode": "USA",
        "maxSuggestions": 15,
        "f": "json",
        "location": f"{lon},{lat}",
        "distance": str(dist),
        "category": "Address",
    }
    url = f"{ESRI_GEOCODE}/suggest?" + urllib.parse.urlencode(params)
    data = fetch_json(url)
    items = []
    seen = set()
    for s in data.get("suggestions") or []:
        text = (s.get("text") or "").strip()
        if not text or text in seen:
            continue
        if s.get("isCollection"):
            continue
        seen.add(text)
        items.append({
            "label": text,
            "magicKey": s.get("magicKey", ""),
            "location": {"display": text},
        })
    return items


def esri_geocode_address(address: str, magic_key: str = "") -> dict | None:
    if magic_key:
        params = {"magicKey": magic_key, "f": "json", "outFields": "Addr_type,PlaceName,City,Region,Subregion,Postal"}
        url = f"{ESRI_GEOCODE}/findAddressCandidates?" + urllib.parse.urlencode(params)
    else:
        lon, lat, dist = suggest_location_bias(address)
        params = {
            "SingleLine": address,
            "countryCode": "USA",
            "maxLocations": 1,
            "f": "json",
            "location": f"{lon},{lat}",
            "distance": str(dist),
            "category": "Address",
            "outFields": "Addr_type,PlaceName,City,Region,Subregion,Postal",
        }
        url = f"{ESRI_GEOCODE}/findAddressCandidates?" + urllib.parse.urlencode(params)

    data = fetch_json(url)
    candidates = data.get("candidates") or []
    if not candidates:
        return None

    c = candidates[0]
    attrs = c.get("attributes") or {}
    addr_type = (attrs.get("Addr_type") or "").lower()
    if addr_type and addr_type not in ("streetaddress", "pointaddress", "subaddress", ""):
        if "po box" in (c.get("address") or "").lower():
            return None

    state = resolve_state(attrs.get("Region") or "")
    county = attrs.get("Subregion") or ""
    if county and "County" not in county:
        county = f"{county} County"
    city = attrs.get("City") or ""
    zip_code = attrs.get("Postal") or ""
    display = c.get("address") or address
    loc = c.get("location") or {}
    latitude = loc.get("y")
    longitude = loc.get("x")

    return {
        "state": state,
        "county": county,
        "city": city,
        "zip": zip_code,
        "display": display,
        "latitude": latitude,
        "longitude": longitude,
    }


def geocode_census(address: str) -> dict | None:
    url = (
        "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?"
        + urllib.parse.urlencode(
            {"address": address, "benchmark": "4", "vintage": "4", "format": "json"}
        )
    )
    data = fetch_json(url)
    match = (data.get("result") or {}).get("addressMatches") or []
    if not match:
        return None
    m = match[0]
    comp = m.get("addressComponents") or {}
    county_geo = (m.get("geographies") or {}).get("Counties") or []
    county = county_geo[0].get("NAME", "") if county_geo else ""
    return {
        "state": (comp.get("state") or "").upper(),
        "county": county,
        "city": (comp.get("city") or "").title(),
        "zip": comp.get("zip") or "",
        "display": m.get("matchedAddress") or address,
    }


def geocode_address(address: str, magic_key: str = "") -> dict | None:
    loc = esri_geocode_address(address, magic_key)
    if loc and loc.get("state"):
        if not loc.get("county"):
            census = geocode_census(address)
            if census:
                loc["county"] = census.get("county") or ""
        return loc
    return geocode_census(address)


def tax_rate(state: str, county: str) -> float:
    st = (state or "NC").upper()
    key = normalize_county(county)
    if st == "NC" and key in NC_COUNTY_TAX:
        return NC_COUNTY_TAX[key]
    return STATE_TAX.get(st, 1.0)


DEFAULT_MORTGAGE_SPREAD_30 = 2.60
LEADS_PATH = os.path.join(ROOT, ".leads.jsonl")
LEAD_WEBHOOK_URL = os.environ.get("LEAD_WEBHOOK_URL", "").strip()
PARTNERS_DIR = os.path.join(ROOT, "partners")


def fetch_treasury_10y() -> dict:
    """U.S. Treasury daily yield curve — 10-year benchmark (refreshed daily)."""
    year = time.strftime("%Y")
    url = (
        "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
        f"daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve"
        f"&field_tdr_date_value={year}&page&_format=csv"
    )
    try:
        raw = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": USER_AGENT}),
            timeout=15,
        ).read().decode("utf-8", errors="ignore")
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip() and not ln.startswith("Date")]
        if not lines:
            return {}
        # Treasury CSV is newest-first; fall back to last row if file order differs.
        row = None
        for candidate in (lines[0], lines[-1]):
            parts = candidate.split(",")
            if len(parts) >= 12:
                try:
                    float(parts[11])
                    row = parts
                    break
                except ValueError:
                    continue
        if not row:
            return {}
        ten_yr = float(row[11])
        as_of = row[0].strip()
        return {
            "treasury10y": ten_yr,
            "treasuryAsOf": as_of,
            "treasurySource": "U.S. Treasury (10-year)",
        }
    except (urllib.error.URLError, ValueError, IndexError):
        return {}


def _load_rate_cache() -> dict | None:
    if not os.path.isfile(CACHE_PATH):
        return None
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def fetch_pmms_rates() -> dict:
    """PMMS + 10yr Treasury — refreshed at least once per calendar day."""
    today = time.strftime("%Y-%m-%d")
    cached = _load_rate_cache()
    if cached and cached.get("cacheDate") == today and cached.get("treasury10y") is not None:
        return cached

    treasury = fetch_treasury_10y()
    treasury_10y = treasury.get("treasury10y")
    prior_spread = cached.get("mortgageSpread30") if cached else None
    spread = (
        float(prior_spread)
        if prior_spread is not None and float(prior_spread) > 1.5
        else DEFAULT_MORTGAGE_SPREAD_30
    )

    rate30, rate15 = 6.5, 5.875
    as_of = "estimate"
    pmms_ok = False
    try:
        html = urllib.request.urlopen(
            urllib.request.Request(
                "https://www.freddiemac.com/pmms/",
                headers={"User-Agent": USER_AGENT},
            ),
            timeout=12,
        ).read().decode("utf-8", errors="ignore")
        m30 = re.search(
            r"30[- ]Year Fixed[- ]Rate(?:\s+Mortgage)?[^0-9]{0,80}([0-9]+\.[0-9]+)",
            html,
            re.I | re.S,
        )
        m15 = re.search(
            r"15[- ]Year Fixed[- ]Rate(?:\s+Mortgage)?[^0-9]{0,80}([0-9]+\.[0-9]+)",
            html,
            re.I | re.S,
        )
        if m30:
            rate30 = float(m30.group(1))
            pmms_ok = True
        if m15:
            rate15 = float(m15.group(1))
        date_m = re.search(r"PMMS[^0-9]*(?:for|of)?\s*([A-Za-z]+\s+\d{1,2},?\s*\d{4})", html, re.I)
        if date_m:
            as_of = date_m.group(1).strip()
        else:
            as_of = "Freddie Mac PMMS (this week)"
    except (urllib.error.URLError, ValueError):
        pass

    source = "Freddie Mac PMMS"
    if pmms_ok and treasury_10y is not None:
        spread = round(rate30 - float(treasury_10y), 3)
    elif treasury_10y is not None:
        rate30 = round(float(treasury_10y) + spread, 3)
        rate15 = round(rate30 - 0.65, 3)
        as_of = treasury.get("treasuryAsOf", today)
        source = "10-year Treasury + mortgage spread"

    payload = {
        "rate30": rate30,
        "rate15": rate15,
        "asOf": as_of,
        "source": source,
        "fetchedAt": time.time(),
        "cacheDate": today,
        "mortgageSpread30": spread,
    }
    payload.update(treasury)
    if pmms_ok:
        payload["pmmsRate30"] = rate30
        payload["pmmsRate15"] = rate15

    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f)
    except OSError:
        pass
    return payload


def append_lead(entry: dict) -> None:
    try:
        with open(LEADS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass


def notify_lead_webhook(entry: dict) -> None:
    if not LEAD_WEBHOOK_URL:
        return
    try:
        payload = json.dumps(entry).encode("utf-8")
        req = urllib.request.Request(
            LEAD_WEBHOOK_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except (urllib.error.URLError, OSError, TimeoutError, ValueError):
        pass


def sync_partner_photo(slug: str) -> dict:
    """Try to refresh partner headshot from photoPage / photoUrl in partners JSON."""
    clean = re.sub(r"[^a-zA-Z0-9_-]", "", slug or "")
    cfg_path = os.path.join(PARTNERS_DIR, f"{clean}.json")
    if not clean or not os.path.isfile(cfg_path):
        return {"ok": False, "error": "partner not found"}
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)
    photo_url = (cfg.get("photoUrl") or "").strip()
    photo_page = (cfg.get("photoPage") or cfg.get("website") or "").strip()
    if not photo_url and photo_page:
        try:
            html = urllib.request.urlopen(
                urllib.request.Request(photo_page, headers={"User-Agent": USER_AGENT}),
                timeout=12,
            ).read().decode("utf-8", errors="ignore")
            patterns = [
                rf"https://d9la9jrhv6fdd\.cloudfront\.net/agentphotos/{cfg.get('expAgentId', '[0-9]+')}\.[a-z]+",
                r"https://d9la9jrhv6fdd\.cloudfront\.net/agentphotos/[0-9]+\.[a-zA-Z]+",
                r"https://dtzulyujzhqiu\.cloudfront\.net/[^\"'\s>]+\.(?:jpg|jpeg|png|webp)",
            ]
            for pat in patterns:
                m = re.search(pat, html, re.I)
                if m:
                    candidate = m.group(0)
                    if "profiles/1727374637" not in candidate:
                        photo_url = candidate
                        break
        except (urllib.error.URLError, ValueError):
            pass
    if not photo_url:
        return {"ok": False, "error": "no photo URL found — set photoUrl in partner JSON"}
    out_dir = os.path.join(ROOT, "assets", "partners")
    os.makedirs(out_dir, exist_ok=True)
    ext = ".jpg"
    if ".png" in photo_url.lower():
        ext = ".png"
    out_path = os.path.join(out_dir, f"{clean}{ext}")
    try:
        data = urllib.request.urlopen(
            urllib.request.Request(photo_url, headers={"User-Agent": USER_AGENT}),
            timeout=15,
        ).read()
        if len(data) < 500:
            return {"ok": False, "error": "photo download too small"}
        with open(out_path, "wb") as f:
            f.write(data)
        rel = f"assets/partners/{clean}{ext}"
        cfg["photo"] = rel
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
            f.write("\n")
        return {"ok": True, "photo": rel, "photoUrl": photo_url}
    except (urllib.error.URLError, OSError) as e:
        return {"ok": False, "error": str(e)}


def round_home_price(price: float | int) -> int:
    if not price or price <= 0:
        return 0
    step = 5000
    rounded = int(round(float(price) / step) * step)
    return max(50000, min(3000000, rounded))


def normalize_address_key(address: str) -> str:
    return re.sub(r"\s+", " ", (address or "").strip().lower())


def read_property_cache(address: str) -> dict | None:
    key = normalize_address_key(address)
    if not key or not os.path.isfile(PROPERTY_CACHE_PATH):
        return None
    try:
        with open(PROPERTY_CACHE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        entry = (data.get("entries") or {}).get(key)
        if not entry:
            return None
        if time.time() - entry.get("fetchedAt", 0) > PROPERTY_CACHE_TTL_SEC:
            return None
        return entry.get("valuation")
    except (json.JSONDecodeError, OSError):
        return None


def write_property_cache(address: str, valuation: dict) -> None:
    key = normalize_address_key(address)
    if not key:
        return
    data = {"entries": {}}
    if os.path.isfile(PROPERTY_CACHE_PATH):
        try:
            with open(PROPERTY_CACHE_PATH, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            data = {"entries": {}}
    entries = data.setdefault("entries", {})
    entries[key] = {"fetchedAt": time.time(), "valuation": valuation}
    if len(entries) > 200:
        sorted_keys = sorted(
            entries.keys(),
            key=lambda k: entries[k].get("fetchedAt", 0),
        )
        for old_key in sorted_keys[: len(entries) - 200]:
            entries.pop(old_key, None)
    try:
        with open(PROPERTY_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except OSError:
        pass


def rentcast_api_key() -> str:
    return (
        os.environ.get("RENTCAST_API_KEY")
        or os.environ.get("REALTY_MOLE_API_KEY")
        or ""
    ).strip()


def valuation_address_candidates(address: str, loc: dict) -> list[str]:
    """Address strings to try with property APIs (most specific first)."""
    seen = set()
    candidates = []

    def add(val: str) -> None:
        v = re.sub(r"\s+", " ", (val or "").strip())
        if not v or len(v) < 8:
            return
        key = v.lower()
        if key in seen:
            return
        seen.add(key)
        candidates.append(v)

    add(address)
    add(loc.get("display") or "")

    street = ""
    m = re.match(r"^(\d+\s+[^,]+)", address or "")
    if m:
        street = m.group(1).strip()
    city = (loc.get("city") or "").strip()
    state = (loc.get("state") or "").strip()
    zip_code = (loc.get("zip") or "").strip()
    if street and city and state:
        add(f"{street}, {city}, {state} {zip_code}".strip())
    if city and state and zip_code:
        add(f"{city}, {state} {zip_code}")

    return candidates


def rentcast_get(path: str, params: dict) -> dict | list | None:
    api_key = rentcast_api_key()
    if not api_key:
        return None
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None and v != ""})
    url = f"{RENTCAST_BASE}{path}?{q}" if q else f"{RENTCAST_BASE}{path}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "X-Api-Key": api_key, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None


def latest_tax_assessment(record: dict) -> int | None:
    assessments = record.get("taxAssessments") or {}
    for year in sorted(assessments.keys(), reverse=True):
        entry = assessments.get(year) or {}
        value = entry.get("value")
        if value and float(value) > 0:
            return int(float(value))
    return None


def addresses_match(a: str, b: str) -> bool:
    na = normalize_address_key(a)
    nb = normalize_address_key(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return na.split(",")[0] == nb.split(",")[0]


def project_wgs84(lon: float, lat: float, out_wkid: int = NC_STATE_PLANE_WKID) -> tuple[float, float] | None:
    geom = json.dumps(
        {
            "geometryType": "esriGeometryPoint",
            "geometries": [{"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}],
        }
    )
    params = urllib.parse.urlencode(
        {"inSR": 4326, "outSR": out_wkid, "geometries": geom, "f": "json"}
    )
    try:
        data = fetch_json(f"{ARCGIS_PROJECT}?{params}")
        geometries = data.get("geometries") or []
        if not geometries:
            return None
        g = geometries[0]
        return float(g["x"]), float(g["y"])
    except (urllib.error.URLError, KeyError, TypeError, ValueError):
        return None


def arcgis_parcel_query(
    layer_url: str,
    x: float,
    y: float,
    in_wkid: int,
    out_fields: str,
) -> dict | None:
    params = urllib.parse.urlencode(
        {
            "geometry": f"{x},{y}",
            "geometryType": "esriGeometryPoint",
            "inSR": in_wkid,
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": out_fields,
            "returnGeometry": "false",
            "f": "json",
        }
    )
    try:
        data = fetch_json(f"{layer_url}/query?{params}")
    except urllib.error.URLError:
        return None
    features = data.get("features") or []
    if not features:
        return None
    return features[0].get("attributes") or {}


def parse_arcgis_sale_date(raw) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        ms = float(raw)
    except (TypeError, ValueError):
        return None
    if ms <= 0:
        return None
    # ArcGIS may return ms or seconds depending on source
    if ms < 1e12:
        ms *= 1000
    return ms / 1000.0


def sale_is_recent(sale_ts: float | None, max_years: int = RECENT_SALE_MAX_AGE_YEARS) -> bool:
    if not sale_ts:
        return False
    now = time.time()
    # Ignore future-dated records (data errors or clock skew up to 1 day)
    if sale_ts > now + 86400:
        return False
    age_sec = now - sale_ts
    return age_sec >= 0 and age_sec <= max_years * 365.25 * 86400


def street_number(addr: str) -> int | None:
    m = re.match(r"^\s*(\d+)", addr or "")
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def parcel_matches_address(site_address: str, reference: str) -> bool:
    """Reject parcel hits when street numbers are clearly different."""
    n_ref = street_number(reference)
    n_site = street_number(site_address or "")
    if n_ref is None or n_site is None:
        return True
    return abs(n_ref - n_site) <= 10


def last_sale_is_plausible(price: float, assessed: float | None) -> bool:
    if not price or price < MIN_LAST_SALE_PRICE:
        return False
    if assessed and assessed > 0 and price < assessed * 0.25:
        return False
    return True


def valuation_from_assessed(assessed: float) -> dict:
    return {
        "homePrice": round_home_price(assessed),
        "priceSource": "assessed_value",
        "priceSourceLabel": "county assessed value (public records)",
    }


def valuation_from_last_sale(price: float) -> dict:
    return {
        "homePrice": round_home_price(price),
        "priceSource": "last_sale",
        "priceSourceLabel": "recent county sale record",
    }


def fetch_nc_public_parcel_valuation(
    loc: dict, address: str = ""
) -> tuple[dict | None, bool]:
    """
    North Carolina parcel assessed value / recent sale from public GIS (no API key).
    Returns (valuation, parcel_mismatch).
    """
    if (loc.get("state") or "").upper() != "NC":
        return None, False
    lat = loc.get("latitude")
    lon = loc.get("longitude")
    if lat is None or lon is None:
        return None, False

    projected = project_wgs84(float(lon), float(lat))
    if not projected:
        return None, False
    x, y = projected

    assessed = None
    last_sale = None
    sale_ts = None
    site_address = ""
    reference = (loc.get("display") or address or "").strip()

    county_key = normalize_county(loc.get("county") or "")
    if county_key == "wake":
        wake = arcgis_parcel_query(
            WAKE_PARCEL_LAYER,
            x,
            y,
            NC_STATE_PLANE_WKID,
            "SITE_ADDRESS,TOTAL_VALUE_ASSD,TOTSALPRICE,SALE_DATE",
        )
        if wake:
            site_address = (wake.get("SITE_ADDRESS") or "").strip()
            assessed = wake.get("TOTAL_VALUE_ASSD") or assessed
            last_sale = wake.get("TOTSALPRICE") or last_sale
            sale_ts = parse_arcgis_sale_date(wake.get("SALE_DATE"))

    nc = arcgis_parcel_query(
        NC_PARCEL_LAYER,
        x,
        y,
        NC_STATE_PLANE_WKID,
        "parval,siteadd",
    )
    if nc:
        if nc.get("parval"):
            assessed = nc.get("parval") or assessed
        if not site_address and nc.get("siteadd"):
            site_address = str(nc.get("siteadd") or "").strip()

    if site_address and reference and not parcel_matches_address(site_address, reference):
        return None, True

    assessed_f = float(assessed) if assessed else 0
    last_sale_f = float(last_sale) if last_sale else 0

    if (
        last_sale_f
        and sale_is_recent(sale_ts)
        and last_sale_is_plausible(last_sale_f, assessed_f or None)
    ):
        return valuation_from_last_sale(last_sale_f), False
    if assessed_f > 0:
        return valuation_from_assessed(assessed_f), False
    return None, False


def pick_active_listing_price(listings: list, reference: str) -> dict | None:
    if not listings:
        return None
    matched = []
    for listing in listings:
        price = listing.get("price")
        status = (listing.get("status") or "").lower()
        if not price or float(price) <= 0:
            continue
        if status and status != "active":
            continue
        listing_addr = listing.get("formattedAddress") or listing.get("addressLine1") or ""
        if listing_addr and reference and not addresses_match(listing_addr, reference):
            continue
        matched.append(listing)
    pick = matched[0] if matched else (listings[0] if len(listings) == 1 else None)
    if not pick or not pick.get("price"):
        return None
    return {
        "homePrice": round_home_price(pick["price"]),
        "priceSource": "list_price",
        "priceSourceLabel": "active listing price",
    }


def fetch_rentcast_valuation(address: str, loc: dict) -> dict | None:
    """Optional: active listing, AVM, or tax roll via RentCast when API key is set."""
    if not rentcast_api_key():
        return None

    candidates = valuation_address_candidates(address, loc)
    result = None

    for formatted in candidates:
        listings = rentcast_get(
            "/listings/sale",
            {"address": formatted, "status": "Active", "limit": 5},
        )
        if isinstance(listings, list):
            result = pick_active_listing_price(listings, formatted)
            if result:
                break

    if not result:
        for formatted in candidates:
            avm_params: dict = {"address": formatted}
            lat = loc.get("latitude")
            lon = loc.get("longitude")
            if lat is not None and lon is not None:
                avm_params["latitude"] = lat
                avm_params["longitude"] = lon
            avm = rentcast_get("/avm/value", avm_params)
            if isinstance(avm, dict) and avm.get("price"):
                result = {
                    "homePrice": round_home_price(avm["price"]),
                    "priceSource": "estimated_value",
                    "priceSourceLabel": "estimated market value",
                }
                break

    if not result:
        for formatted in candidates:
            records = rentcast_get("/properties", {"address": formatted, "limit": 1})
            if isinstance(records, list) and records:
                record = records[0]
                assessed = latest_tax_assessment(record)
                if assessed:
                    result = {
                        "homePrice": round_home_price(assessed),
                        "priceSource": "assessed_value",
                        "priceSourceLabel": "county assessed value",
                    }
                elif record.get("lastSalePrice"):
                    result = {
                        "homePrice": round_home_price(record["lastSalePrice"]),
                        "priceSource": "last_sale",
                        "priceSourceLabel": "last recorded sale price",
                    }
                if result:
                    break
    return result


def property_price_lookup_available(loc: dict) -> bool:
    if rentcast_api_key() or fetch_realtor_valuation is not None:
        return True
    if (loc.get("state") or "").upper() == "NC":
        return loc.get("latitude") is not None and loc.get("longitude") is not None
    return False


def normalize_valuation_result(result: dict | None) -> dict | None:
    if not result or not result.get("homePrice"):
        return result
    out = dict(result)
    out["homePrice"] = round_home_price(out["homePrice"])
    return out


def fetch_property_valuation(address: str, loc: dict) -> dict | None:
    """
    Purchase price priority: RentCast (optional) → Realtor.com listing/estimate → NC parcel records.
    """
    cached = read_property_cache(address)
    if cached:
        return cached

    result = fetch_rentcast_valuation(address, loc)
    if not result and fetch_realtor_valuation is not None:
        try:
            result = fetch_realtor_valuation(address, loc)
        except Exception:
            result = None
    result = normalize_valuation_result(result)

    parcel_mismatch = False
    if not result:
        result, parcel_mismatch = fetch_nc_public_parcel_valuation(loc, address)
        if parcel_mismatch:
            return {"parcelMismatch": True}
        result = normalize_valuation_result(result)

    if result and not result.get("parcelMismatch"):
        write_property_cache(address, result)
    return result


def insurance_rate(state: str, credit_score: int) -> float:
    st = (state or "NC").upper()
    base = {"NC": 0.4, "SC": 0.42, "FL": 0.55, "VA": 0.38, "GA": 0.38, "TX": 0.45}.get(st, 0.4)
    if credit_score >= 760:
        mult = 0.88
    elif credit_score >= 720:
        mult = 0.94
    elif credit_score >= 680:
        mult = 1.0
    elif credit_score >= 640:
        mult = 1.12
    else:
        mult = 1.25
    return base * mult


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path: str) -> str:
        """Serve static files even when the URL has cache-busting query params."""
        clean = urllib.parse.urlparse(path).path
        return super().translate_path(clean)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        clean = urllib.parse.urlparse(self.path).path
        if clean.endswith(".js") or clean.endswith(".html"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        elif clean.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/geocode":
            self._api_geocode(parsed)
            return
        if parsed.path == "/api/property":
            self._api_property(parsed)
            return
        if parsed.path == "/api/suggest":
            self._api_suggest(parsed)
            return
        if parsed.path == "/api/market-rate":
            self._api_market_rate()
            return
        if parsed.path == "/api/preview-info":
            self._api_preview_info(parsed)
            return
        if parsed.path == "/api/health":
            self._json_response(200, {"ok": True, "service": "martini-mortgage-calculator"})
            return
        if parsed.path == "/api/sync-partner-photo":
            q = self._read_query(parsed)
            slug = (q.get("slug") or q.get("agent") or "").strip()
            self._json_response(200, sync_partner_photo(slug))
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/lead":
            self._api_lead()
            return
        self.send_error(404)

    def _api_lead(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(body or "{}")
        except (json.JSONDecodeError, ValueError):
            self._json_response(400, {"ok": False, "error": "invalid JSON"})
            return
        email = (data.get("email") or "").strip().lower()
        if not email or "@" not in email:
            self._json_response(400, {"ok": False, "error": "email required"})
            return
        scenario = data.get("scenario") or {}
        ref = (data.get("ref") or scenario.get("ref") or "").strip()
        assigned_lo = (data.get("assignedLo") or "").strip()
        if not assigned_lo and ref:
            ref_lower = ref.lower()
            if "kevin" in ref_lower:
                assigned_lo = "kevin"
            elif "logan" in ref_lower:
                assigned_lo = "logan"
        entry = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "email": email,
            "name": (data.get("name") or "").strip(),
            "phone": (data.get("phone") or "").strip(),
            "agent": (data.get("agent") or "").strip(),
            "ref": ref,
            "assignedLo": assigned_lo or "team",
            "version": (data.get("version") or "").strip(),
            "source": (data.get("source") or "logan1-calculator").strip(),
            "scenario": scenario,
            "consent": bool(data.get("consent")),
        }
        append_lead(entry)
        notify_lead_webhook(entry)
        self._json_response(200, {"ok": True})

    def _api_preview_info(self, parsed):
        port = parsed.port or 8765
        host = self.headers.get("Host", f"127.0.0.1:{port}").split(":")[0]
        lan_ip = host
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
            s.close()
        except OSError:
            pass
        base_lan = f"http://{lan_ip}:{port}"
        self._json_response(
            200,
            {
                "mobilePreview": f"{base_lan}/mobile-preview.html",
                "calculator": f"{base_lan}/index.html",
                "localPreview": f"http://127.0.0.1:{port}/mobile-preview.html",
                "localCalculator": f"http://127.0.0.1:{port}/index.html",
                "logan3": f"{base_lan}/go.html",
                "logan3MobilePreview": f"{base_lan}/mobile-preview-logan3.html",
                "logan4": f"{base_lan}/go4.html",
                "logan4MobilePreview": f"{base_lan}/mobile-preview-logan4.html",
                "localLogan3": f"http://127.0.0.1:{port}/go.html",
                "localLogan3Preview": f"http://127.0.0.1:{port}/mobile-preview-logan3.html",
                "localLogan4": f"http://127.0.0.1:{port}/go4.html",
                "localLogan4Preview": f"http://127.0.0.1:{port}/mobile-preview-logan4.html",
            },
        )

    def _api_market_rate(self):
        try:
            data = fetch_pmms_rates()
            self._json_response(
                200,
                {
                    "rate30": data["rate30"],
                    "rate15": data["rate15"],
                    "asOf": data.get("asOf", ""),
                    "source": data.get("source", "Freddie Mac PMMS"),
                    "cacheDate": data.get("cacheDate", ""),
                    "treasury10y": data.get("treasury10y"),
                    "treasuryAsOf": data.get("treasuryAsOf", ""),
                    "treasurySource": data.get("treasurySource", ""),
                    "mortgageSpread30": data.get("mortgageSpread30"),
                },
            )
        except Exception as e:
            self._json_response(
                200,
                {
                    "rate30": 6.5,
                    "rate15": 5.875,
                    "asOf": "cached",
                    "source": "Freddie Mac PMMS (fallback)",
                    "treasury10y": None,
                    "error": str(e),
                },
            )

    def _read_query(self, parsed) -> dict:
        return dict(urllib.parse.parse_qsl(parsed.query))

    def _json_response(self, code: int, payload: dict | list):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _api_geocode(self, parsed):
        q = self._read_query(parsed)
        address = (q.get("address") or "").strip()
        magic_key = (q.get("magicKey") or "").strip()
        if not address:
            self._json_response(400, {"error": "address required"})
            return
        loc = geocode_address(address, magic_key)
        if not loc:
            self._json_response(404, {"error": "Address not found"})
            return
        self._json_response(200, loc)

    def _api_suggest(self, parsed):
        q = self._read_query(parsed)
        query = (q.get("q") or "").strip()
        if len(query) < 1:
            self._json_response(200, [])
            return
        try:
            items = esri_suggest(query)
            self._json_response(200, items)
        except (urllib.error.URLError, ValueError, json.JSONDecodeError) as e:
            self._json_response(200, [])

    def _api_property(self, parsed):
        q = self._read_query(parsed)
        address = (q.get("address") or "").strip()
        magic_key = (q.get("magicKey") or "").strip()
        home_price = int(q.get("homePrice") or 450000)
        credit_score = int(q.get("creditScore") or 740)
        update_price = (q.get("updatePrice") or "").lower() in ("1", "true", "yes")
        if not address:
            self._json_response(400, {"error": "address required"})
            return

        loc = geocode_address(address, magic_key)
        if not loc:
            self._json_response(404, {"error": "Address not found"})
            return

        price_source = None
        price_source_label = None
        auto_fill_price = None
        assessed_value = None
        valuation = None
        parcel_mismatch = False
        if update_price:
            valuation = fetch_property_valuation(address, loc)
            if valuation and valuation.get("parcelMismatch"):
                parcel_mismatch = True
                valuation = None
            elif valuation and valuation.get("homePrice"):
                home_price = valuation["homePrice"]
                price_source = valuation.get("priceSource")
                price_source_label = valuation.get("priceSourceLabel")
                if price_source:
                    auto_fill_price = home_price
                assessed_value = valuation.get("assessedValue") or (
                    home_price if price_source == "assessed_value" else None
                )

        rate = tax_rate(loc["state"], loc["county"])
        ins_rate = insurance_rate(loc["state"], credit_score)
        annual_tax = round(home_price * (rate / 100))
        annual_insurance = round(home_price * (ins_rate / 100))
        tax_source = "county_median_rate"

        self._json_response(
            200,
            {
                "location": loc,
                "homePrice": home_price,
                "autoFillPrice": auto_fill_price,
                "annualTax": annual_tax,
                "annualInsurance": annual_insurance,
                "taxRatePercent": rate,
                "insuranceRatePercent": round(ins_rate, 3),
                "taxSource": tax_source,
                "assessedValue": assessed_value,
                "priceSource": price_source,
                "priceSourceLabel": price_source_label,
                "priceLookupConfigured": property_price_lookup_available(loc),
                "priceLookupSource": (
                    "rentcast"
                    if rentcast_api_key()
                    else (
                        "realtor"
                        if fetch_realtor_valuation is not None
                        else ("nc_parcel" if (loc.get("state") or "").upper() == "NC" else None)
                    )
                ),
                "parcelMismatch": parcel_mismatch,
            },
        )


def main():
    port = int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Martini Mortgage Calculator → http://{host}:{port}")
    if host == "0.0.0.0":
        print("Listening on all interfaces (production). Use HTTPS reverse proxy in front.")
    if rentcast_api_key():
        print("Home price auto-fill: RentCast + Realtor.com + NC parcel records")
    else:
        print(
            "Home price auto-fill: Realtor.com listings & estimates + NC parcel fallback (no account)"
        )
    server.serve_forever()


if __name__ == "__main__":
    main()