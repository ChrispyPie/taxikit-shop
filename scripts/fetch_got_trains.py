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
STATIONS = {
    "G": "Göteborg C", "Cst": "Stockholm C", "Arnc": "Arlanda C", "Sci": "Stockholm City",
    "M": "Malmö C", "Mc": "Malmö C", "Lu": "Lund C", "Kh": "Köpenhamn H",
    "Hel": "Helsingborg C", "Hb": "Helsingborg C", "Hd": "Halmstad C", "Vå": "Varberg",
    "Kb": "Kungsbacka", "A": "Alvesta", "Av": "Alvesta", "N": "Nässjö C",
    "Lp": "Linköping C", "Nr": "Norrköping C", "K": "Katrineholm", "Fle": "Floda",
    "Hr": "Herrljunga", "F": "Falköping C", "Sk": "Skövde C", "Hpbg": "Hallsberg",
    "Ör": "Örebro C", "Tnd": "Trollhättan", "Thn": "Trollhättan", "J": "Jönköping C",
    "Blg": "Borlänge", "Gä": "Gävle C", "Söö": "Södertälje Syd", "So": "Solna",
    "Öslo": "Oslo S", "Xoslo": "Oslo S", "Oslo S": "Oslo S", "Yb": "Ytterby",
    "Vg": "Vänersborg C", "Vgå": "Vårgårda", "Gro": "Gubbero", "Gbm": "Göteborg Marieholm",
    "Or": "Olskroken", "Alh": "Alingsås", "Äh": "Älvängen", "Sts": "Stenungsund",
    "Kac": "Kalmar C", "Bsc": "Borås C", "Sfl": "Säffle",
}

def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")

def tv_post(xml):
    req = urllib.request.Request("https://api.trafikinfo.trafikverket.se/v2/data.json", data=xml.encode("utf-8"), headers={"Content-Type": "text/xml"}, method="POST")
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.load(resp)

def parse_ts(iso):
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TZ)
    except Exception:
        return None

def unique_idents(trains, limit=240):
    now = datetime.now(TZ)
    ranked, seen = [], set()
    for f in trains:
        i = f.get("id")
        if not i or i in seen:
            continue
        seen.add(i)
        ts = parse_ts(f.get("act") or f.get("est") or f.get("sched"))
        dist = abs((ts - now).total_seconds()) if ts else 10**12
        ranked.append((0 if not f.get("stops") else 1, dist, i))
    ranked.sort()
    return [i for _, __, i in ranked[:limit]]

def attach_last_seen(trains):
    idents = unique_idents(trains, 160)
    if not idents:
        return trains
    ors = "".join('<EQ name="AdvertisedTrainIdent" value="%s" />' % i for i in idents)
    xml = ("<REQUEST><LOGIN authenticationkey=\"%s\" /><QUERY objecttype=\"TrainAnnouncement\" schemaversion=\"1.9\" limit=\"800\"><FILTER><AND><GT name=\"TimeAtLocation\" value=\"$dateadd(-03:00:00)\" /><OR>%s</OR></AND></FILTER><INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE></QUERY></REQUEST>") % (KEY, ors)
    payload = tv_post(xml)
    best = {}
    for block in ((payload or {}).get("RESPONSE") or {}).get("RESULT") or []:
        rows = block.get("TrainAnnouncement") or []
        if isinstance(rows, dict): rows = [rows]
        for row in rows:
            tid, ts = row.get("AdvertisedTrainIdent"), row.get("TimeAtLocation")
            if not tid or not ts: continue
            prev = best.get(tid)
            if not prev or str(ts) > str(prev.get("ts")):
                best[tid] = {"ts": ts, "sig": row.get("LocationSignature") or ""}
    for f in trains:
        hit = best.get(f.get("id"))
        if hit and hit.get("sig"):
            f["lastSeen"] = station_name(hit["sig"]) or hit["sig"]
            f["lastSeenSig"] = hit["sig"]
            f["lastSeenTs"] = hit["ts"]
    return trains

def attach_routes(trains):
    idents = unique_idents(trains, 240)
    if not idents:
        return trains
    by = {}
    for i in range(0, len(idents), 40):
        batch = idents[i:i+40]
        ors = "".join('<EQ name="AdvertisedTrainIdent" value="%s" />' % x for x in batch)
        xml = ("<REQUEST><LOGIN authenticationkey=\"%s\" /><QUERY objecttype=\"TrainAnnouncement\" schemaversion=\"1.9\" orderby=\"AdvertisedTimeAtLocation\" limit=\"1500\"><FILTER><AND><EQ name=\"Advertised\" value=\"true\" /><GT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(-12:00:00)\" /><LT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(16:00:00)\" /><OR>%s</OR></AND></FILTER><INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>Canceled</INCLUDE></QUERY></REQUEST>") % (KEY, ors)
        payload = tv_post(xml)
        for block in ((payload or {}).get("RESPONSE") or {}).get("RESULT") or []:
            rows = block.get("TrainAnnouncement") or []
            if isinstance(rows, dict): rows = [rows]
            for row in rows:
                tid, sig = row.get("AdvertisedTrainIdent"), row.get("LocationSignature") or ""
                if not tid or not sig: continue
                t = row.get("TimeAtLocation") or row.get("EstimatedTimeAtLocation") or row.get("AdvertisedTimeAtLocation") or ""
                prev = (by.setdefault(tid, {})).get(sig)
                if not prev or str(t) < str(prev.get("t") or "9999"):
                    by[tid][sig] = {"sig": sig, "t": t, "act": row.get("TimeAtLocation") or "", "est": row.get("EstimatedTimeAtLocation") or "", "sched": row.get("AdvertisedTimeAtLocation") or "", "track": row.get("TrackAtLocation") or ""}
    for f in trains:
        locs = by.get(f.get("id")) or {}
        stops = sorted(locs.values(), key=lambda s: str(s.get("t") or ""))
        if stops:
            f["stops"] = [{"sig": s["sig"], "name": station_name(s["sig"]) or s["sig"], "t": s.get("t") or "", "act": s.get("act") or "", "est": s.get("est") or "", "sched": s.get("sched") or "", "track": s.get("track") or ""} for s in stops]
            acted = [s for s in f["stops"] if s.get("act")]
            if acted:
                last = max(acted, key=lambda s: s["act"])
                if not f.get("lastSeenTs") or str(last["act"]) >= str(f.get("lastSeenTs")):
                    f["lastSeen"] = last["name"]
                    f["lastSeenSig"] = last["sig"]
                    f["lastSeenTs"] = last["act"]
    return trains

def tv_query():
    xml = ("<REQUEST><LOGIN authenticationkey=\"%s\" /><QUERY objecttype=\"TrainAnnouncement\" schemaversion=\"1.9\" orderby=\"AdvertisedTimeAtLocation\" limit=\"400\"><FILTER><AND><EQ name=\"LocationSignature\" value=\"%s\" /><EQ name=\"Advertised\" value=\"true\" /><GT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(-06:00:00)\" /><LT name=\"AdvertisedTimeAtLocation\" value=\"$dateadd(16:00:00)\" /></AND></FILTER><INCLUDE>ActivityType</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>Canceled</INCLUDE><INCLUDE>TrackAtLocation</INCLUDE><INCLUDE>FromLocation</INCLUDE><INCLUDE>ToLocation</INCLUDE><INCLUDE>ProductInformation</INCLUDE><INCLUDE>TypeOfTraffic</INCLUDE></QUERY></REQUEST>") % (KEY, STATION)
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
    return [loc_sig(raw)] if loc_sig(raw) else []

def station_name(sig):
    return STATIONS.get(sig, sig or "")

def product_name(f):
    info = f.get("ProductInformation") or []
    if isinstance(info, dict): info = [info]
    bits = []
    for p in info:
        if isinstance(p, dict): bits.append(p.get("Description") or p.get("Code") or "")
        elif p: bits.append(str(p))
    return " ".join([b for b in bits if b])

def slim_train(f):
    act = f.get("ActivityType") or ""
    direction = "ANK" if str(act).lower().startswith("ank") else "AVG"
    frm, to = loc_list(f.get("FromLocation")), loc_list(f.get("ToLocation"))
    other_sig = (frm[0] if direction == "ANK" else (to[-1] if to else "")) or ""
    traffic, prod = f.get("TypeOfTraffic") or "", product_name(f)
    snabb = any(w in (str(traffic)+" "+prod).lower() for w in ("snabbtåg", "x 2000", "x2000", "sx2000"))
    return {"id": f.get("AdvertisedTrainIdent") or "", "dir": direction, "other": station_name(other_sig) or other_sig, "otherSig": other_sig, "from": [station_name(s) or s for s in frm], "to": [station_name(s) or s for s in to], "sched": f.get("AdvertisedTimeAtLocation") or "", "est": f.get("EstimatedTimeAtLocation") or "", "act": f.get("TimeAtLocation") or "", "track": f.get("TrackAtLocation") or "", "canceled": bool(f.get("Canceled")), "product": prod, "traffic": traffic, "snabb": snabb}

def announcements(payload):
    out = []
    for block in ((payload or {}).get("RESPONSE") or {}).get("RESULT") or []:
        rows = block.get("TrainAnnouncement") or []
        if isinstance(rows, dict): rows = [rows]
        for row in rows:
            if isinstance(row, dict): out.append(slim_train(row))
    return out

def merge_keep(old, new):
    cutoff = datetime.now(TZ) - timedelta(hours=KEEP_HOURS)
    by = {}
    for f in list(old or []) + list(new or []):
        if not isinstance(f, dict): continue
        ts = parse_ts(f.get("act") or f.get("est") or f.get("sched"))
        if ts and ts < cutoff: continue
        key = (f.get("id"), f.get("dir"), f.get("sched"))
        prev = by.get(key)
        if prev and f.get("stops") and not prev.get("stops"): by[key] = f
        elif prev and prev.get("stops") and not f.get("stops"):
            merged = dict(prev); merged.update({k:v for k,v in f.items() if k != "stops"}); by[key] = merged
        else: by[key] = f
    return list(by.values())

def main():
    if not KEY:
        print("TRAFIKVERKET_KEY saknas", file=sys.stderr); sys.exit(1)
    prev = {}
    if OUT.exists():
        try: prev = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception: prev = {}
    old = prev.get("trains") or []
    if not isinstance(old, list): old = []
    cache = {"station": "Göteborg C", "updated": now_iso(), "error": None, "trains": old}
    try:
        fresh = attach_routes(attach_last_seen(announcements(tv_query())))
        cache["trains"] = merge_keep(old, fresh)
    except Exception as e:
        cache["error"] = str(e)
        cache["trains"] = merge_keep(old, [])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("tag", len(cache["trains"]), "err", cache["error"])

if __name__ == "__main__":
    main()
