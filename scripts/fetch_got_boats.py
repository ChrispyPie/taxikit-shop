#!/usr/bin/env python3
"""Hämtar Stena Lines ankomster till Göteborg (Fredrikshamn och Kiel).

Källa: Stena Lines offentliga tidtabell, samma JSON som
https://www.stenaline.se/kundtjanst/senaste-seglingsuppdateringar
använder (ingen nyckel, hämta sparsamt). Tiderna är lokala.

Valfritt steg 2: om miljövariabeln AISSTREAM_API_KEY finns öppnas en kort
AISStream-websocket (ca 18 s) mot en ruta kring Kattegatt/Göteborg, filtrerad
på Stenas fyra MMSIs. Resultatet skrivs som beräknad ankomst / vid kaj i cachen.
Nyckeln får aldrig skrivas ut eller hamna i filen.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo

    TZ = ZoneInfo("Europe/Stockholm")
except Exception:
    TZ = timezone(timedelta(hours=1))

OUT = Path(os.environ.get("BAT_OUT", "skiftlogg/feed/bat.json"))
STENA_BASE = (
    "https://www.stenaline.se/kundtjanst/senaste-seglingsuppdateringar"
    "/_jcr_content.timetable"
)
UA = "TaxiData/1.0 (ankomster; +https://taxikit.shop/TaxiData)"
# ident i cachen blir t.ex. FRGO-JUTL (måste vara högst 20 tecken: watch_set).
ROUTES = {
    "FRGO": {
        "from": "Fredrikshamn",
        "terminal": "Danmarksterminalen",
        "area": "Masthugget",
        "address": "Emigrantvägen 20, Göteborg",
        "maps": "Stena Line Danmarksterminalen, Emigrantvägen 20, Göteborg",
        "lat": 57.6997,
        "lon": 11.9386,
    },
    "KIGO": {
        "from": "Kiel",
        "terminal": "Tysklandsterminalen",
        "area": "Majnabbe",
        "address": "Elof Lindälvs gata, Göteborg",
        "maps": "Stena Line Tysklandsterminalen, Elof Lindälvs gata, Göteborg",
        "lat": 57.6925,
        "lon": 11.9168,
    },
}
# typisk inbound-rutt per fartyg, används bara som ledtråd för AIS-matchning
SHIPS = {
    "265177000": {"code": "DANI", "name": "Stena Danica"},
    "265410000": {"code": "JUTL", "name": "Stena Jutlandica"},
    "266331000": {"code": "GERM", "name": "Stena Germanica"},
    "266343000": {"code": "SCAN", "name": "Stena Scandinavica"},
}
KEEP_HOURS = 36
AIS_SECONDS = 18
BERTH_KM = 1.0


def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")


def day_str(offset=0):
    return (datetime.now(TZ) + timedelta(days=offset)).strftime("%Y-%m-%d")


def parse_local(value):
    if not value:
        return None
    try:
        raw = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ)
        return dt.astimezone(TZ)
    except Exception:
        return None


def iso_of(dt):
    return dt.isoformat(timespec="seconds") if dt else ""


def fetch_route(route, date):
    url = "%s.%s.%s.json" % (STENA_BASE, route, date)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = json.load(resp)
    return data if isinstance(data, list) else []


def status_of(raw):
    s = str(raw or "").strip()
    low = s.lower()
    if low in ("cancelled", "canceled", "inställd", "installd"):
        return "CAN", "Inställd"
    if low in ("delayed", "försenad", "forsenad"):
        return "DEL", "Försenad"
    if low in ("on time", "ontime", "i tid"):
        return "SCH", "I tid"
    if s:
        return "OTH", s
    return "SCH", "I tid"


def slim(item):
    route = str(item.get("routeCode") or "").upper()
    meta = ROUTES.get(route)
    if not meta:
        return None
    ferry = str(item.get("ferryCode") or "").upper() or "OKAND"
    ident = ("%s-%s" % (route, ferry))[:20]
    sched = parse_local(item.get("localArrivalTime"))
    est = parse_local(item.get("estimatedLocalArrivalTime"))
    if not sched:
        return None
    code, status_sv = status_of(item.get("status"))
    return {
        "id": ident,
        "dir": "ANK",
        "route": route,
        "other": meta["from"],
        "ferry": item.get("ferryName") or ferry,
        "ferryCode": ferry,
        "departureId": str(item.get("departureId") or ""),
        "dep": iso_of(parse_local(item.get("localDepartureTime"))),
        "sched": iso_of(sched),
        "est": iso_of(est),
        "act": "",
        "status": code,
        "statusSv": status_sv,
        "canceled": code == "CAN",
        "terminal": meta["terminal"],
        "area": meta["area"],
        "address": meta["address"],
        "maps": meta["maps"],
        "reason": status_sv if code in ("CAN", "DEL", "OTH") else "",
        "ais": None,
    }


def merge_keep(old, new):
    cutoff = datetime.now(TZ) - timedelta(hours=KEEP_HOURS)
    by = {}
    for item in (old or []) + (new or []):
        ts = parse_local(item.get("act") or item.get("est") or item.get("sched"))
        if ts and ts < cutoff:
            continue
        key = (item.get("id"), item.get("sched"), item.get("departureId") or "")
        prev = by.get(key)
        if prev and item.get("ais") is None and prev.get("ais"):
            item = dict(item)
            item["ais"] = prev.get("ais")
            if not item.get("act") and prev.get("act"):
                item["act"] = prev.get("act")
            if not item.get("est") and prev.get("est"):
                item["est"] = prev.get("est")
        by[key] = item
    return list(by.values())


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def fetch_ais_positions():
    """Kort anslutning. Returnerar {ferryCode: info} eller {} om nyckel saknas/fel."""
    key = (os.environ.get("AISSTREAM_API_KEY") or "").strip()
    if not key:
        return {}
    try:
        import asyncio

        try:
            from websockets.asyncio.client import connect
        except Exception:
            from websockets import connect  # type: ignore
    except Exception as exc:
        print("ais: bibliotek saknas (%s)" % type(exc).__name__, file=sys.stderr)
        return {}

    mmsi_of = {mmsi: meta["code"] for mmsi, meta in SHIPS.items()}

    async def collect():
        found = {}
        url = "wss://stream.aisstream.io/v0/stream"
        sub = {
            "APIKey": key,
            "BoundingBoxes": [[[54.2, 9.5], [58.1, 12.6]]],
            "FiltersShipMMSI": list(SHIPS.keys()),
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
        }
        async with connect(url, open_timeout=10, close_timeout=3, compression="deflate") as ws:
            await ws.send(json.dumps(sub))
            end = time.monotonic() + AIS_SECONDS
            while time.monotonic() < end:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.monotonic()))
                except asyncio.TimeoutError:
                    break
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                typ = msg.get("MessageType")
                meta = msg.get("MetaData") or {}
                mmsi = str(meta.get("MMSI") or meta.get("mmsi") or "")
                code = mmsi_of.get(mmsi)
                if not code:
                    body = (msg.get("Message") or {}).get(typ) or {}
                    mmsi = str(body.get("UserID") or body.get("userID") or mmsi)
                    code = mmsi_of.get(mmsi)
                if not code:
                    continue
                entry = found.get(code) or {"ferryCode": code, "mmsi": mmsi}
                if typ == "PositionReport":
                    body = (msg.get("Message") or {}).get("PositionReport") or {}
                    lat = body.get("Latitude", meta.get("Latitude"))
                    lon = body.get("Longitude", meta.get("Longitude"))
                    try:
                        lat = float(lat)
                        lon = float(lon)
                    except (TypeError, ValueError):
                        continue
                    sog = body.get("Sog", body.get("sog"))
                    nav = body.get("NavigationalStatus", body.get("navigationalStatus"))
                    try:
                        sog = float(sog) if sog is not None else None
                    except (TypeError, ValueError):
                        sog = None
                    entry.update(
                        {
                            "lat": lat,
                            "lon": lon,
                            "sog": sog,
                            "nav": nav,
                            "at": now_iso(),
                        }
                    )
                    found[code] = entry
                elif typ == "ShipStaticData":
                    body = (msg.get("Message") or {}).get("ShipStaticData") or {}
                    eta = body.get("Eta") or body.get("ETA")
                    dest = body.get("Destination") or body.get("destination")
                    if dest:
                        entry["dest"] = str(dest).strip()
                    if eta:
                        entry["aisEta"] = str(eta)
                    found[code] = entry
        return found

    try:
        return asyncio.run(collect())
    except Exception as exc:
        print("ais: hoppar över (%s)" % type(exc).__name__, file=sys.stderr)
        return {}


def apply_ais(arrivals, positions):
    if not positions:
        return arrivals, 0
    now = datetime.now(TZ)
    used = 0
    for item in arrivals:
        pos = positions.get(item.get("ferryCode"))
        if not pos or pos.get("lat") is None:
            continue
        meta = ROUTES.get(item.get("route") or "")
        if not meta:
            continue
        sched = parse_local(item.get("sched"))
        if not sched:
            continue
        # Bara påverka ankomsten som ligger närmast i tid för det fartyget.
        window_before = sched - timedelta(hours=8)
        window_after = sched + timedelta(hours=3)
        if now < window_before or now > window_after:
            continue
        dist = haversine_km(pos["lat"], pos["lon"], meta["lat"], meta["lon"])
        sog = pos.get("sog")
        nav = pos.get("nav")
        at_berth = dist <= BERTH_KM and (
            nav in (1, 5) or (sog is not None and sog < 1.0) or dist <= 0.4
        )
        ais = {
            "lat": round(pos["lat"], 5),
            "lon": round(pos["lon"], 5),
            "sog": pos.get("sog"),
            "km": round(dist, 2),
            "at": pos.get("at") or now_iso(),
            "status": "vid_kaj" if at_berth else "till_sjos",
        }
        item["ais"] = ais
        used += 1
        if at_berth:
            item["act"] = pos.get("at") or now_iso()
            item["statusSv"] = "Vid kaj"
        elif sog and sog > 1.0:
            hours = (dist / 1.852) / sog
            if 0 < hours < 12:
                eta = now + timedelta(hours=hours)
                item["est"] = iso_of(eta)
                if item.get("status") != "CAN":
                    late = (eta - sched).total_seconds() / 60.0
                    if late >= 5:
                        item["status"] = "DEL"
                        item["statusSv"] = "Försenad"
                        item["reason"] = "Försenad"
        # Annars behåll tidtabellen
    return arrivals, used


def main():
    prev = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            prev = {}

    cache = {
        "port": "GOT",
        "updated": now_iso(),
        "error": None,
        "arrivals": prev.get("arrivals") or [],
        "ais": {"enabled": False, "updated": prev.get("ais", {}).get("updated") if isinstance(prev.get("ais"), dict) else None, "ships": 0},
    }

    fresh = []
    errors = []
    for route in ROUTES:
        for offset in (-1, 0, 1):
            try:
                rows = fetch_route(route, day_str(offset))
                for row in rows:
                    item = slim(row)
                    if item:
                        fresh.append(item)
            except Exception as exc:
                errors.append("%s %s: %s" % (route, day_str(offset), type(exc).__name__))
            time.sleep(0.4)

    cache["arrivals"] = merge_keep(cache["arrivals"], fresh)
    if errors and not fresh:
        cache["error"] = "; ".join(errors)
    elif errors:
        cache["error"] = "delvis: " + "; ".join(errors)


    def infer_act(item):
        if item.get("act") or item.get("canceled") or item.get("status") == "CAN":
            return
        if item.get("status") == "DEL":
            return
        when = parse_local(item.get("est") or item.get("sched"))
        if when and datetime.now(TZ) > when + timedelta(minutes=15):
            item["act"] = iso_of(when)

    for row in cache["arrivals"]:
        infer_act(row)

    positions = fetch_ais_positions()
    if positions:
        cache["arrivals"], ships = apply_ais(cache["arrivals"], positions)
        cache["ais"] = {"enabled": True, "updated": now_iso(), "ships": ships}
    elif (os.environ.get("AISSTREAM_API_KEY") or "").strip():
        cache["ais"] = {"enabled": True, "updated": now_iso(), "ships": 0}
    else:
        cache["ais"] = {"enabled": False, "updated": None, "ships": 0}

    # Behåll AIS-flagga utan att läcka mer än antal fartyg
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "ankomster",
        len(cache["arrivals"]),
        "err",
        cache["error"],
        "ais",
        "på" if cache["ais"]["enabled"] else "av",
        cache["ais"]["ships"],
    )


if __name__ == "__main__":
    main()
