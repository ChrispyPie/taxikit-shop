#!/usr/bin/env python3
"""Hämtar Landvetter (GOT). Behåller 36 h historik över midnatt."""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Stockholm")
except Exception:
    TZ = timezone.utc

KEY = (os.environ.get("SWEDAVIA_KEY") or "").strip()
OUT = Path(os.environ.get("GOT_OUT", "skiftlogg/feed/got.json"))
AIRPORT = "GOT"
KEEP_HOURS = 36


def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")


def day_str(offset=0):
    return (datetime.now(TZ) + timedelta(days=offset)).strftime("%Y-%m-%d")


def fetch(kind, date):
    url = "https://api.swedavia.se/flightinfo/v2/%s/%s/%s" % (AIRPORT, kind, date)
    req = urllib.request.Request(
        url,
        headers={
            "Ocp-Apim-Subscription-Key": KEY,
            "Accept": "application/json",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.load(resp)


def slim_flight(f, direction):
    fi = f.get("flightIdentification") or {}
    loc = f.get("location") or f.get("locationAndStatus") or {}
    st = (
        loc.get("flightLegStatus")
        or f.get("flightLegStatus")
        or f.get("status")
        or ""
    )
    times = f.get("arrivalTime") or f.get("departureTime") or {}
    if direction == "ANK":
        times = f.get("arrivalTime") or times
    else:
        times = f.get("departureTime") or times
    other = ""
    if direction == "ANK":
        other = ((f.get("departureAirport") or {}).get("iataCode")
                 or (f.get("departureAirportSwedish") or "")
                 or "")
        if isinstance(f.get("departureAirport"), str):
            other = f.get("departureAirport")
    else:
        other = ((f.get("arrivalAirport") or {}).get("iataCode") or "")
    baggage = f.get("baggage") or f.get("baggageClaim") or {}
    if isinstance(baggage, dict):
        bag = baggage.get("belt") or baggage.get("claim") or baggage.get("id") or ""
    else:
        bag = baggage or ""
    return {
        "id": fi.get("callSign") or fi.get("iataFlightNumber") or f.get("flightId") or "",
        "dir": direction,
        "other": other,
        "status": st if isinstance(st, str) else (st.get("code") if isinstance(st, dict) else ""),
        "sched": (times.get("scheduledUtc") or times.get("scheduled") or ""),
        "est": (times.get("estimatedUtc") or times.get("estimated") or ""),
        "act": (times.get("actualUtc") or times.get("actual") or ""),
        "terminal": loc.get("terminal") or f.get("terminal") or "",
        "gate": loc.get("gate") or f.get("gate") or "",
        "baggage": bag,
        "firstBag": (baggage.get("firstBagUtc") if isinstance(baggage, dict) else "") or "",
        "lastBag": (baggage.get("lastBagUtc") if isinstance(baggage, dict) else "") or "",
        "rawStatus": f.get("remark") or "",
    }


def flights_from(payload, direction):
    out = []
    if not isinstance(payload, dict):
        return out
    for key in ("flights", "flight", "to", "arrivals", "departures"):
        arr = payload.get(key)
        if isinstance(arr, list):
            for item in arr:
                if isinstance(item, dict):
                    out.append(slim_flight(item, direction))
            if out:
                return out
    return out


def minutes_ago(iso):
    if not iso:
        return 10**9
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (datetime.now(TZ) - dt.astimezone(TZ)).total_seconds() / 60.0
    except Exception:
        return 10**9


def parse_ts(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone(TZ)
    except Exception:
        return None


def merge_keep(old, new):
    cutoff = datetime.now(TZ) - timedelta(hours=KEEP_HOURS)
    by = {}
    for f in (old or []) + (new or []):
        ts = parse_ts(f.get("act") or f.get("est") or f.get("sched"))
        if ts and ts < cutoff:
            continue
        key = (f.get("id"), f.get("dir"), f.get("sched"))
        by[key] = f
    return list(by.values())


def main():
    if not KEY:
        print("SWEDAVIA_KEY saknas", file=sys.stderr)
        sys.exit(1)

    prev = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            prev = {}

    hour = datetime.now(TZ).hour
    cache = {
        "airport": AIRPORT,
        "updated": now_iso(),
        "arrivalsUpdated": prev.get("arrivalsUpdated"),
        "departuresUpdated": prev.get("departuresUpdated"),
        "yesterdayUpdated": prev.get("yesterdayUpdated"),
        "tomorrowUpdated": prev.get("tomorrowUpdated"),
        "error": None,
        "arrivals": prev.get("arrivals") or [],
        "departures": prev.get("departures") or [],
    }

    DONE = {"CAN", "DEL", "RER", "DIV", "FLS"}

    def when_of(f):
        return parse_ts(f.get("act") or f.get("est") or f.get("sched"))

    def code_of(f):
        return str(f.get("status") or "").strip().upper()

    def needs_live(f, now):
        code = code_of(f)
        if code in DONE:
            return False
        if f.get("lastBag"):
            return False
        t = when_of(f)
        if not t:
            return False
        if now <= t <= now + timedelta(hours=1):
            return True
        if now - timedelta(hours=2) <= t <= now and code in ("", "ACT", "SEQ", "LAN"):
            return True
        return False

    def any_live(arrivals):
        now = datetime.now(TZ)
        return any(needs_live(f, now) for f in arrivals or [])

    live = any_live(cache["arrivals"])
    if live or minutes_ago(prev.get("arrivalsUpdated")) >= 55:
        try:
            fresh_arr = flights_from(fetch("arrivals", day_str(0)), "ANK")
            cache["arrivals"] = merge_keep(cache["arrivals"], fresh_arr)
            cache["arrivalsUpdated"] = now_iso()
        except Exception as e:
            cache["error"] = "ankomst: " + str(e)
            cache["arrivals"] = merge_keep(cache["arrivals"], [])

    yday = day_str(-1)
    y_items = []
    for f in cache["arrivals"]:
        t = when_of(f)
        if t and t.strftime("%Y-%m-%d") == yday:
            y_items.append(f)
    if any_live(y_items):
        try:
            yarr = flights_from(fetch("arrivals", yday), "ANK")
            cache["arrivals"] = merge_keep(cache["arrivals"], yarr)
            cache["yesterdayUpdated"] = now_iso()
        except Exception as e:
            cache["error"] = ((cache.get("error") or "") + " igar: " + str(e)).strip()

    if hour >= 12 and minutes_ago(prev.get("tomorrowUpdated")) >= 55:
        try:
            tarr = flights_from(fetch("arrivals", day_str(1)), "ANK")
            cache["arrivals"] = merge_keep(cache["arrivals"], tarr)
            cache["tomorrowUpdated"] = now_iso()
        except Exception as e:
            cache["error"] = ((cache.get("error") or "") + " imorgon: " + str(e)).strip()

    if minutes_ago(prev.get("departuresUpdated")) >= 55:
        try:
            fresh_dep = flights_from(fetch("departures", day_str(0)), "AVG")
            cache["departures"] = merge_keep(cache["departures"], fresh_dep)
            cache["departuresUpdated"] = now_iso()
        except Exception as e:
            cache["error"] = ((cache.get("error") or "") + " avgang: " + str(e)).strip()
            cache["departures"] = merge_keep(cache["departures"], [])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ankomster", len(cache["arrivals"]), "avgangar", len(cache["departures"]), "err", cache["error"])


if __name__ == "__main__":
    main()
