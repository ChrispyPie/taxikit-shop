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


def first_str(*vals):
    for v in vals:
        if isinstance(v, dict):
            v = v.get("code") or v.get("text") or v.get("name") or ""
        if isinstance(v, list) and v:
            v = first_str(*v)
        if v:
            return str(v).strip()
    return ""


def airport_label(f, direction):
    if direction == "ANK":
        dep = f.get("departureAirport")
        if isinstance(dep, dict):
            iata = first_str(dep.get("iataCode"), dep.get("iata"))
            name = first_str(dep.get("swedish"), dep.get("nameSwedish"), dep.get("name"))
        else:
            iata = first_str(f.get("departureAirportIata"), dep if isinstance(dep, str) else "")
            name = first_str(f.get("departureAirportSwedish"), f.get("departureAirportEnglish"))
    else:
        arr = f.get("arrivalAirport")
        if isinstance(arr, dict):
            iata = first_str(arr.get("iataCode"), arr.get("iata"))
            name = first_str(arr.get("swedish"), arr.get("nameSwedish"), arr.get("name"))
        else:
            iata = first_str(f.get("arrivalAirportIata"), arr if isinstance(arr, str) else "")
            name = first_str(f.get("arrivalAirportSwedish"), f.get("arrivalAirportEnglish"))
    other = (name + " " + iata).strip() or iata or name
    return other, iata


def remark_text(f):
    for key in ("remarksSwedish", "remarksEnglish", "remark", "remarks"):
        raw = f.get(key)
        if isinstance(raw, list):
            bits = []
            for item in raw:
                if isinstance(item, dict):
                    bits.append(first_str(item.get("text"), item.get("remarkText"), item.get("remark")))
                elif item:
                    bits.append(str(item))
            bits = [b for b in bits if b]
            if bits:
                return " · ".join(bits)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return ""


def slim_flight(f, direction):
    fi = f.get("flightIdentification") or {}
    loc = f.get("locationAndStatus") or f.get("location") or {}
    if not isinstance(loc, dict):
        loc = {}
    op = f.get("airlineOperator") or f.get("airline") or {}
    if not isinstance(op, dict):
        op = {}
    times = f.get("arrivalTime") if direction == "ANK" else f.get("departureTime")
    if not isinstance(times, dict):
        times = f.get("arrivalTime") or f.get("departureTime") or {}
    baggage = f.get("baggage") or f.get("baggageClaim") or {}
    if not isinstance(baggage, dict):
        baggage = {}
    other, iata = airport_label(f, direction)
    st = first_str(
        loc.get("flightLegStatus"),
        loc.get("flightLegStatusEnglish"),
        f.get("flightLegStatus"),
        f.get("status"),
    )
    return {
        "id": first_str(fi.get("iataFlightNumber"), f.get("flightId"), fi.get("callSign")),
        "dir": direction,
        "other": other,
        "iata": iata,
        "airline": first_str(op.get("name"), op.get("iata")),
        "status": st,
        "statusSv": first_str(loc.get("flightLegStatusSwedish"), f.get("flightLegStatusSwedish")),
        "sched": first_str(times.get("scheduledUtc"), times.get("scheduled")),
        "est": first_str(times.get("estimatedUtc"), times.get("estimated")),
        "act": first_str(times.get("actualUtc"), times.get("actual")),
        "terminal": first_str(loc.get("terminal"), f.get("terminal")),
        "gate": first_str(loc.get("gate"), f.get("gate")),
        "baggage": first_str(
            baggage.get("baggageClaimUnit"),
            baggage.get("belt"),
            baggage.get("claim"),
            baggage.get("id"),
        ),
        "firstBag": first_str(baggage.get("firstBagUtc"), baggage.get("firstBag")),
        "firstBagEst": first_str(baggage.get("estimatedFirstBagUtc"), baggage.get("estimatedFirstBag")),
        "lastBag": first_str(baggage.get("lastBagUtc"), baggage.get("lastBag")),
        "rawStatus": remark_text(f),
    }


def flights_from(payload, direction):
    out = []
    if not isinstance(payload, dict):
        return out
    for key in ("flights", "flight", "arrivals", "departures", "to", "from"):
        arr = payload.get(key)
        if isinstance(arr, dict):
            arr = arr.get("flights") or arr.get("flight")
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
