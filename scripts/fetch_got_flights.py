#!/usr/bin/env python3
"""Hämtar Landvetter (GOT) från Swedavia. Ankomst varje körning, avgång högst 1 gång/timme."""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Stockholm")
except Exception:
    TZ = timezone.utc

KEY = (os.environ.get("SWEDAVIA_KEY") or "").strip()
OUT = Path(os.environ.get("GOT_OUT", "skiftlogg/feed/got.json"))
AIRPORT = "GOT"


def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")


def today():
    return datetime.now(TZ).strftime("%Y-%m-%d")


def fetch(kind):
    url = "https://api.swedavia.se/flightinfo/v2/%s/%s/%s" % (AIRPORT, kind, today())
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
    loc = f.get("location") or {}
    st = f.get("flightLegStatus") or f.get("status") or ""
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

    cache = {
        "airport": AIRPORT,
        "updated": now_iso(),
        "arrivalsUpdated": prev.get("arrivalsUpdated"),
        "departuresUpdated": prev.get("departuresUpdated"),
        "error": None,
        "arrivals": prev.get("arrivals") or [],
        "departures": prev.get("departures") or [],
    }

    try:
        arr = fetch("arrivals")
        cache["arrivals"] = flights_from(arr, "ANK")
        cache["arrivalsUpdated"] = now_iso()
    except Exception as e:
        cache["error"] = "ankomst: " + str(e)

    if minutes_ago(prev.get("departuresUpdated")) >= 55:
        try:
            dep = fetch("departures")
            cache["departures"] = flights_from(dep, "AVG")
            cache["departuresUpdated"] = now_iso()
        except Exception as e:
            cache["error"] = ((cache.get("error") or "") + " avgång: " + str(e)).strip()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("ankomster", len(cache["arrivals"]), "avgångar", len(cache["departures"]), "err", cache["error"])


if __name__ == "__main__":
    main()
