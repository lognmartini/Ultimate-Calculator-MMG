#!/usr/bin/env python3
"""
Refresh the base mortgage rates in market-rates.js from Freddie Mac PMMS.

Source: FRED public CSV export (no API key required):
  https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US
  https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE15US

Only the `fallback: { rate30, rate15, asOf }` object is rewritten. The LLPA
tables, martiniDiscount, and all other pricing logic are left untouched.
Aborts (leaves the file unchanged) if a fetched value is missing or out of a
sane 2%–15% range, so a bad fetch can never publish a garbage rate.
"""
import datetime
import re
import sys
import urllib.request

FILE = "market-rates.js"
UA = "MMG-rate-bot/1.0 (+https://martinimortgagegroup.com)"


def latest_value(series_id):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    date, val = None, None
    for line in raw.splitlines():
        parts = line.split(",")
        if len(parts) < 2:
            continue
        try:
            v = float(parts[1])
        except ValueError:
            continue  # skips header row and "." missing markers
        date, val = parts[0].strip(), v
    return date, val


def update_file(content, r30, r15, as_of):
    new_obj = f'fallback: {{ rate30: {r30}, rate15: {r15}, asOf: "{as_of}" }}'
    updated, n = re.subn(r"fallback:\s*\{[^}]*\}", new_obj, content, count=1)
    return updated, n, new_obj


def main():
    d30, r30 = latest_value("MORTGAGE30US")
    d15, r15 = latest_value("MORTGAGE15US")
    for r in (r30, r15):
        if r is None or not (2.0 < r < 15.0):
            print(f"Rate out of range (30={r30}, 15={r15}); leaving file unchanged.")
            return 0
    as_of = d30 or datetime.date.today().isoformat()
    with open(FILE, encoding="utf-8") as f:
        content = f.read()
    updated, n, new_obj = update_file(content, r30, r15, as_of)
    if n == 0:
        print("fallback pattern not found; leaving file unchanged.")
        return 0
    if updated == content:
        print("Rates already current; no change.")
        return 0
    with open(FILE, "w", encoding="utf-8") as f:
        f.write(updated)
    print("Updated ->", new_obj)
    return 0


if __name__ == "__main__":
    sys.exit(main())
