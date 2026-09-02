#!/usr/bin/env python3
"""Göteborg C tåg via Trafikverket TrainAnnouncement."""
import json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Stockholm")
except Exception:
    TZ = timezone.utc
KEY = (os.environ.get("TRAFIKVERKET_KEY") or os.environ.get("TV_KEY") or "").strip()
OUT = Path(os.environ.get("TRAIN_OUT", "skiftlogg/feed/tag.json"))
STATION = "G"
KEEP_HOURS = 36
STATIONS = {"G":"Göteborg C","Cst":"Stockholm C","Arnc":"Arlanda C","M":"Malmö C","Kh":"Köpenhamn H","Hel":"Helsingborg C","Hd":"Halmstad C","Kb":"Kungsbacka","A":"Alvesta","N":"Nässjö C","Lp":"Linköping C","Nr":"Norrköping C","Hr":"Herrljunga","F":"Falköping C","Sk":"Skövde C","Thn":"Trollhättan","J":"Jönköping C","Yb":"Ytterby","Vg":"Vänersborg C","Gro":"Gubbero","Gbm":"Göteborg Marieholm","Or":"Olskroken","Alh":"Alingsås"}

def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")

def as_text(v):
    if v is None: return ""
    if isinstance(v, list): return " ".join(as_text(x) for x in v if as_text(x))
    if isinstance(v, dict): return v.get("Description") or v.get("Code") or v.get("Name") or ""
    return str(v)

def tv_query():
    xml = (
        "<REQUEST><LOGIN authenticationkey=\"%s\" />"
        "<QUERY objecttype=\"TrainAnnouncement\" schemaversion=\"1.9\" orderby=\"AdvertisedTimeAtLocation\" limit=\"400\">"
        "<FILTER><AND><EQ name=\"LocationSignature\" value=\"%s\" /><EQ name=\"Advertised\" value=\"true\" />"
        "<GT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(-06:00:00)\" />"
        "<LT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(16:00:00)\" /></AND></FILTER>"
        "<INCLUDE>ActivityType</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE>"
        "<INCLUDE>EstimatedTimeAtLocation</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE>"
        "<INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>Canceled</INCLUDE>"
        "<INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>FromLocation</INCLUDE>"
        "<INCLUDE>ToLocation</INCLUDE><INCLUDE>ProductInformation</INCLUDE>"
        "<INCLUDE>TypeOfTraffic</INCLUDE></QUERY></REQUEST>"
    ) % (KEY, STATION)
    req = urllib.request.Request("https://api.trafikinfo.trafikverket.se/v2/data.json", data=xml.encode("utf-8"), headers={"Content-Type": "text/xml"}, method="POST")
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.load(resp)

def loc_sig(item):
    if isinstance(item, str): return item
    if isinstance(item, dict): return item.get("LocationName") or item.get("LocationSignature") or ""
    return ""

def loc_list(raw):
    if not raw: return []
    if isinstance(raw, list): return [loc_sig(x) for x in raw if loc_sig(x)]
    s = loc_sig(raw)
    return [s] if s else []

def station_name(sig): return STATIONS.get(sig, sig or "")

def slim_train(f):
    act = as_text(f.get("ActivityType"))
    direction = "ANK" if act.lower().startswith("ank") else "AVG"
    frm = loc_list(f.get("FromLocation"))
    to = loc_list(f.get("ToLocation"))
    other_sig = (frm[0] if direction == "ANK" else (to[-1] if to else "")) or ""
    traffic = as_text(f.get("TypeOfTraffic"))
    prod = as_text(f.get("ProductInformation"))
    blob = (traffic + " " + prod).lower()
    snabb = any(w in blob for w in ("snabbtåg", "x 2000", "x2000"))
    return {"id": as_text(f.get("AdvertisedTrainIdent")), "dir": direction, "other": station_name(other_sig) or other_sig, "otherSig": other_sig, "from": [station_name(s) or s for s in frm], "to": [station_name(s) or s for s in to], "sched": as_text(f.get("AdvertisedTimeAtLocation")), "est": as_text(f.get("EstimatedTimeAtLocation")), "act": as_text(f.get("TimeAtLocation")), "track": as_text(f.get("TrackAtLocation")), "canceled": bool(f.get("Canceled")), "product": prod, "traffic": traffic, "snabb": snabb}

def announcements(payload):
    out = []
    for block in ((payload or {}).get("RESPONSE") or {}).get("RESULT") or []:
        rows = block.get("TrainAnnouncement") or []
        if isinstance(rows, dict): rows = [rows]
        for row in rows:
            if isinstance(row, dict): out.append(slim_train(row))
    return out

def parse_ts(iso):
    if not iso: return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TZ)
    except Exception:
        return None

def merge_keep(old, new):
    cutoff = datetime.now(TZ) - timedelta(hours=KEEP_HOURS)
    by = {}
    for f in list(old or []) + list(new or []):
        if not isinstance(f, dict): continue
        ts = parse_ts(f.get("act") or f.get("est") or f.get("sched"))
        if ts and ts < cutoff: continue
        by[(f.get("id"), f.get("dir"), f.get("sched"))] = f
    return list(by.values())

def main():
    if not KEY:
        print("TRAFIKVERKET_KEY saknas", file=sys.stderr)
        sys.exit(1)
    prev = {}
    if OUT.exists():
        try: prev = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception: prev = {}
    old = prev.get("trains") or []
    if not isinstance(old, list): old = []
    cache = {"station": "Göteborg C", "updated": now_iso(), "error": None, "trains": old}
    try:
        cache["trains"] = merge_keep(old, announcements(tv_query()))
    except Exception as e:
        cache["error"] = str(e)
        cache["trains"] = merge_keep(old, [])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("tag", len(cache["trains"]), "err", cache["error"])

if __name__ == "__main__":
    main()
