"""Realtor.com public GraphQL — active list prices and home value estimates (no API key)."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "MartiniMortgageCalculator/1.0 (martinimortgagegroup.com)"
REALTOR_GQL = "https://www.realtor.com/frontdoor/graphql"
REALTOR_GEO = "https://parser-external.geo.moveaws.com/suggest"

REALTOR_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.realtor.com",
    "Referer": "https://www.realtor.com/",
    "rdc-client-name": "RDC_WEB_SRP_FS_PAGE",
    "rdc-client-version": "3.0.2515",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    ),
    "x-is-bot": "false",
}

SEARCH_SUGGESTIONS_QUERY = """
query Search_suggestions($searchInput: SearchSuggestionsInput!) {
  search_suggestions(search_input: $searchInput) {
    geo_results {
      text
      geo {
        area_type
        mpr_id
        prop_status
        line
        city
        state_code
        postal_code
      }
    }
  }
}
"""

HOME_DETAILS_QUERY = """
query GetHomeDetails($property_id: ID!) {
  home(property_id: $property_id) {
    status
    list_price
    last_sold_price
    location {
      address {
        line
        city
        state_code
        postal_code
      }
    }
    estimates {
      currentValues: current_values {
        estimate
        isBestHomeValue: isbest_homevalue
        source { name type }
      }
    }
  }
}
"""

ACTIVE_STATUSES = frozenset(
    {"for_sale", "for_rent", "active", "coming_soon", "new_community"}
)
MIN_LIST_PRICE = 25000


def _minify(query: str) -> str:
    return " ".join(query.split())


def _graphql(operation: str, query: str, variables: dict) -> dict | None:
    payload = {
        "operationName": operation,
        "query": _minify(query),
        "variables": variables,
    }
    req = urllib.request.Request(
        REALTOR_GQL,
        data=json.dumps(payload).encode(),
        headers=REALTOR_HEADERS,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None


def street_number(addr: str) -> int | None:
    m = re.match(r"^\s*(\d+)", addr or "")
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def addresses_align(site_line: str, reference: str) -> bool:
    n_ref = street_number(reference)
    n_site = street_number(site_line or "")
    if n_ref is None or n_site is None:
        return True
    return abs(n_ref - n_site) <= 10


def _state_from_text(text: str) -> str:
    m = re.search(r"\b([A-Z]{2})\b", (text or "").upper())
    return m.group(1) if m else ""


def _zip_from_text(text: str) -> str:
    m = re.search(r"\b(\d{5})(?:-\d{4})?\b", text or "")
    return m.group(1) if m else ""


def score_geo_candidate(geo: dict, search_term: str, loc: dict | None) -> int:
    score = 0
    ref_state = (loc or {}).get("state") or _state_from_text(search_term)
    ref_zip = (loc or {}).get("zip") or _zip_from_text(search_term)
    ref_num = street_number(search_term)

    if ref_state and geo.get("state_code", "").upper() == ref_state.upper():
        score += 50
    if ref_zip and str(geo.get("postal_code") or "") == ref_zip:
        score += 40
    geo_num = street_number(geo.get("line") or "")
    if ref_num is not None and geo_num is not None and ref_num == geo_num:
        score += 30
    if geo.get("area_type") == "address":
        score += 10
    if "for_sale" in (geo.get("prop_status") or []):
        score += 5
    return score


def geo_suggest_fallback(search_term: str) -> list[dict]:
    params = urllib.parse.urlencode(
        {"input": search_term, "client_id": "listings", "limit": "8"}
    )
    req = urllib.request.Request(
        f"{REALTOR_GEO}?{params}",
        headers={"User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None

    results = []
    for item in data.get("autocomplete") or []:
        if item.get("area_type") != "address":
            continue
        results.append({
            "mpr_id": item.get("mpr_id") or (item.get("_id") or "").replace("addr:", ""),
            "prop_status": item.get("prop_status") or [],
            "line": item.get("line") or "",
            "city": item.get("city") or "",
            "state_code": item.get("state_code") or "",
            "postal_code": item.get("postal_code") or "",
        })
    return results


def graphql_geo_candidates(search_term: str) -> list[dict]:
    data = _graphql(
        "Search_suggestions",
        SEARCH_SUGGESTIONS_QUERY,
        {"searchInput": {"search_term": search_term}},
    )
    results = []
    if not data or not data.get("data"):
        return results
    for row in (data["data"].get("search_suggestions") or {}).get("geo_results") or []:
        geo = row.get("geo") or {}
        if geo.get("area_type") == "address" and geo.get("mpr_id"):
            results.append({
                "mpr_id": geo["mpr_id"],
                "prop_status": geo.get("prop_status") or [],
                "line": geo.get("line") or "",
                "city": geo.get("city") or "",
                "state_code": geo.get("state_code") or "",
                "postal_code": geo.get("postal_code") or "",
                "text": row.get("text") or "",
            })
    return results


def pick_best_geo(candidates: list[dict], search_term: str, loc: dict | None) -> dict | None:
    if not candidates:
        return None
    ranked = sorted(
        candidates,
        key=lambda g: score_geo_candidate(g, search_term, loc),
        reverse=True,
    )
    best = ranked[0]
    if score_geo_candidate(best, search_term, loc) < 50:
        return None
    return best


def resolve_property_geo(search_term: str, loc: dict | None = None) -> dict | None:
    candidates = geo_suggest_fallback(search_term) + graphql_geo_candidates(search_term)
    seen = set()
    unique = []
    for g in candidates:
        pid = g.get("mpr_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        unique.append(g)
    return pick_best_geo(unique, search_term, loc)


def fetch_home(property_id: str) -> dict | None:
    data = _graphql(
        "GetHomeDetails",
        HOME_DETAILS_QUERY,
        {"property_id": str(property_id)},
    )
    if not data or not data.get("data"):
        return None
    return data["data"].get("home")


def pick_best_estimate(home: dict) -> int | None:
    estimates = (home.get("estimates") or {}).get("currentValues") or []
    if not estimates:
        return None

    def score(entry: dict) -> tuple:
        est = entry.get("estimate") or 0
        is_best = 1 if entry.get("isBestHomeValue") else 0
        return (is_best, float(est) if est else 0)

    best = max(estimates, key=score)
    val = best.get("estimate")
    if val and float(val) > 0:
        return int(float(val))
    return None


def valuation_from_realtor_home(home: dict) -> dict | None:
    status = (home.get("status") or "").lower()
    list_price = home.get("list_price")
    prop_status_active = status in ACTIVE_STATUSES

    if prop_status_active and list_price and float(list_price) >= MIN_LIST_PRICE:
        return {
            "homePrice": int(float(list_price)),
            "priceSource": "list_price",
            "priceSourceLabel": "active listing price",
            "dataProvider": "realtor.com",
        }

    estimate = pick_best_estimate(home)
    if estimate:
        return {
            "homePrice": estimate,
            "priceSource": "estimated_value",
            "priceSourceLabel": "estimated market value",
            "dataProvider": "realtor.com",
        }

    last_sold = home.get("last_sold_price")
    if last_sold and float(last_sold) > 25000:
        return {
            "homePrice": int(float(last_sold)),
            "priceSource": "last_sale",
            "priceSourceLabel": "last recorded sale price",
            "dataProvider": "realtor.com",
        }
    return None


def realtor_search_terms(address: str, loc: dict | None = None) -> list[str]:
    """Address strings to try with Realtor (Esri display names often fail)."""
    seen = set()
    terms: list[str] = []

    def add(val: str) -> None:
        v = re.sub(r"\s+", " ", (val or "").strip())
        if len(v) < 8:
            return
        key = v.lower()
        if key in seen:
            return
        seen.add(key)
        terms.append(v)

    add(address)
    loc = loc or {}
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

    return terms


def fetch_realtor_valuation(address: str, loc: dict | None = None) -> dict | None:
    """
    Active MLS list price when for sale; otherwise Realtor.com value estimate.
    """
    if not address or len(address) < 8:
        return None

    geo = None
    for term in realtor_search_terms(address, loc):
        geo = resolve_property_geo(term, loc)
        if geo and geo.get("mpr_id"):
            break
    if not geo or not geo.get("mpr_id"):
        return None

    home = fetch_home(geo["mpr_id"])
    if not home:
        return None

    site_line = ((home.get("location") or {}).get("address") or {}).get("line") or geo.get("line") or ""
    ref = address or (loc or {}).get("display") or ""
    if site_line and ref and not addresses_align(site_line, ref):
        return None

    result = valuation_from_realtor_home(home)
    if not result:
        return None

    # Prefer for_sale geo hint when status string is ambiguous
    if (
        result.get("priceSource") == "estimated_value"
        and "for_sale" in (geo.get("prop_status") or [])
        and home.get("list_price")
        and float(home["list_price"]) > 0
    ):
        result = {
            "homePrice": int(float(home["list_price"])),
            "priceSource": "list_price",
            "priceSourceLabel": "active listing price",
            "dataProvider": "realtor.com",
        }

    return result