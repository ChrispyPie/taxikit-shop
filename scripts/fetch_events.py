#!/usr/bin/env python3
"""Hamtar evenemang till TaxiData-kalendern, en stad i taget (--city).
Forsta staden: goteborg (se kalender_cities.json).

Kallor (publika, odokumenterade JSON-API:er - var snall):
  1. goteborg.com   GET  https://api.goteborg.com/v1/events
  2. Got Event      POST https://gotevent.se/api/v2/event/GetEventsTeasers
                    + datum per evenemang (node-id fran evenemangssidan)
  3. Svenska Massan POST https://svenskamassan.se/wp-json/api/v2/getCalendarList

Standard ar TORRKORNING: skriver bara en lokal JSON-fil (--out).
Med --upload skickas listan till RPC public.events_ingest (kraver
miljovariablerna SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY och EVENTS_INGEST_KEY).

Bara standardbiblioteket. ~2 s mellan anrop, tydlig User-Agent.
"""
import argparse, difflib, html, json, math, os, re, sys, time, unicodedata
import urllib.request, urllib.error
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo

TZ = None
UA = "TaxiData-kalender/1.0 (+https://taxikit.shop; evenemang for taxiforare)"
DELAY = 2.0
CENTER, RADIUS_KM, DAYS_AHEAD = None, 20, 180   # satts av load_city()

# Stadsinstallningar (tidszon, mittpunkt, radie, kallor, platser) ligger i
# kalender_cities.json. load_city() fyller globalerna nedan - koden har inga
# hardkodade stads-antaganden.
CITIES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kalender_cities.json")
CITY = None          # slug, t.ex. "goteborg"
CITY_CFG = {}
VENUES = {}          # slug -> (namn, adress, lat, lon, alias)

def load_city(slug):
    global CITY, CITY_CFG, VENUES, TZ, CENTER, RADIUS_KM, DAYS_AHEAD
    with open(CITIES_FILE, encoding="utf-8") as f:
        cfg = json.load(f)["cities"][slug]
    CITY, CITY_CFG = slug, cfg
    TZ = ZoneInfo(cfg["timezone"])
    CENTER = tuple(cfg["center"])
    RADIUS_KM = cfg.get("radius_km", 20)
    DAYS_AHEAD = cfg.get("days_ahead", 180)
    VENUES = {k: (v["name"], v.get("address"), v.get("lat"), v.get("lon"), v.get("aliases", []))
              for k, v in cfg.get("venues", {}).items()}
    return cfg

CATS = ("konsert", "sport", "massa", "teater", "ovrigt")
# uppskattad langd (minuter) nar sluttid saknas
DUR = {"konsert": 165, "teater": 150, "sport": 120, "massa": None, "ovrigt": 120}

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()

def match_venue(*names):
    for n in names:
        nn = norm(n)
        if not nn:
            continue
        # langsta alias forst ("gamla ullevi" fore "ullevi")
        best = None
        for slug, v in VENUES.items():
            for a in v[4]:
                if re.search(r"\b" + re.escape(a) + r"\b", nn) and (best is None or len(a) > best[1]):
                    best = (slug, len(a))
        if best:
            return best[0]
    return None

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

_last = [0.0]
def http(url, data=None, headers=None, as_json=True):
    wait = DELAY - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    h = {"User-Agent": UA, "Accept": "application/json" if as_json else "text/html"}
    h.update(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=h, method="POST" if body else "GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8", "replace")
    finally:
        _last[0] = time.time()
    if not as_json:
        return raw
    d = json.loads(raw)
    if isinstance(d, str):            # Got Event svarar ibland med JSON-i-en-strang
        d = json.loads(d)
    return d

def local(dt_str):
    """'2026-10-24T19:30[:00[.0000]]' (lokal tid utan zon) -> aware datetime."""
    s = dt_str.strip().replace(" ", "T")[:19]
    fmt = "%Y-%m-%dT%H:%M:%S" if len(s) >= 19 else "%Y-%m-%dT%H:%M"
    return datetime.strptime(s, fmt).replace(tzinfo=TZ)

def ev(source, sid, title, cat, starts, ends=None, venue=None, venue_name=None,
       address=None, lat=None, lon=None, url=None, time_unknown=False):
    est = False
    if ends is None and not time_unknown:
        if cat == "massa":
            ends = starts.replace(hour=17, minute=0)
            est = True
        else:
            mins = DUR.get(cat) or 120
            if cat == "sport" and re.search(r"\b(hc|shl|chl|sdhl|hockey|frolunda)\b", norm(title)):
                mins = 150
            ends = starts + timedelta(minutes=mins)
            est = True
    v = VENUES.get(venue) if venue else None
    return {
        "city": CITY, "source": source, "source_event_id": str(sid), "title": title.strip(),
        "category": cat if cat in CATS else "ovrigt",
        "venue_slug": venue, "tz": CITY_CFG.get("timezone"), "venue_name": (v[0] if v else venue_name) or None,
        "address": (v[1] if v else address) or None,
        "lat": v[2] if v else lat, "lon": v[3] if v else lon,
        "starts_at": starts.isoformat(), "ends_at": ends.isoformat() if ends else None,
        "ends_estimated": est, "time_unknown": time_unknown, "url": url,
    }

# ---------- 1. goteborg.com ----------
GE_CAT = [(2401, "sport"), (65604, "massa"), (2463, "konsert"), (8683, "konsert"), (2479, "teater")]

def fetch_goteborg(limit_pages=None, log=print):
    out, page, pages = [], 1, 1
    while page <= pages and (limit_pages is None or page <= limit_pages):
        c = CITY_CFG["sources"]["goteborg_com"]
        d = http(f"{c['base']}?lang={c.get('lang','sv')}&per_page=100&page={page}&order_by=eventdate")
        pages = int((d.get("paging") or {}).get("pages") or 1)
        items = d.get("events") or d.get("data") or []
        log(f"  goteborg.com sida {page}/{pages}: {len(items)} st")
        for e in items:
            info = e.get("information") or {}
            cats = e.get("categories") or []
            cat = next((c for i, c in GE_CAT if i in cats), "ovrigt")
            place = info.get("place") if isinstance(info.get("place"), dict) else {}
            loc = ((info.get("contact") or {}).get("location")) or {}
            lat, lon = loc.get("lat"), loc.get("lng")
            if lat and lon and km(CENTER, (float(lat), float(lon))) > RADIUS_KM:
                continue
            title = html.unescape(((e.get("title") or {}).get("rendered")) or "")
            venue = match_venue(place.get("title"), loc.get("address"))
            for dd in info.get("dates") or []:
                if not isinstance(dd, dict) or not dd.get("start"):
                    continue
                try:
                    st = local(dd["start"])
                    en = local(dd["end"]) if dd.get("end") else None
                except ValueError:
                    continue
                if en and en <= st:
                    en = None
                if en and (en - st) > timedelta(days=3) and cat != "massa":
                    continue          # langa perioder (utstallningar m.m.) - ointressant for taxi
                tu = (st.hour, st.minute) == (0, 0)
                out.append(ev("goteborg_com", e.get("id"), title, cat, st, en, venue,
                              place.get("title"), loc.get("address"), lat, lon, e.get("link"),
                              time_unknown=tu and en is None))
        page += 1
    return out

# ---------- 2. Got Event ----------
TEATER_RX = r"(tomten ar far|musikal|teater|revy)"
OVRIGT_RX = r"(disney on ice)"
SPORT_RX = r"\b(hc|if|ifk|bk|gais|orgryte|shl|chl|sdhl|herr|dam|vm|em|horse show|uts|gala|sverige|landskamp|champions league)\b"

def got_cat(title):
    n = norm(title)
    if re.search(TEATER_RX, n): return "teater"
    if re.search(OVRIGT_RX, n): return "ovrigt"
    if re.search(SPORT_RX, n) or "–" in title: return "sport"
    return "konsert"

def fetch_gotevent(log=print):
    base = CITY_CFG["sources"]["gotevent"]["base"]
    hdr = {"x-language": "sv"}
    d = http(base + "/api/v2/event/GetEventsTeasers",
             {"categories": [], "arenas": [], "dates": [], "searchWord": "", "skip": 0, "take": 200}, hdr)
    cards = ((d.get("teaserCards") or {}).get("$values")) or []
    log(f"  Got Event: {len(cards)} evenemang")
    out = []
    for c in cards:
        path = ((c.get("toPageUrl") or {}).get("url")) or ""
        url = base + path
        title, cat = c.get("title") or "", got_cat(c.get("title") or "")
        venue = match_venue(c.get("arena"), (c.get("arenaInfo") or {}).get("streetAddress"))
        dates = []
        try:
            page = http(url, as_json=False)
            m = re.search(r'value="(\d+)"\s+id="currentNodeId"|id="currentNodeId"[^>]*value="(\d+)"', page)
            node = m and (m.group(1) or m.group(2))
            if node:
                dl = http(f"{base}/api/v2/event/GetEventDateswithAccessibility?id={node}", headers=hdr)
                dates = [x.get("date") for x in dl if isinstance(x, dict) and x.get("date")]
        except (urllib.error.URLError, ValueError) as err:
            log(f"    ! {title}: {err}")
        if not dates and c.get("eventStartDate"):
            dates = [c["eventStartDate"]]
        for s in dates:
            st = local(s)
            tu = (st.hour, st.minute) == (0, 0)
            out.append(ev("gotevent", path.strip("/").split("/")[-1], title, cat, st, None, venue,
                          c.get("arena"), (c.get("arenaInfo") or {}).get("streetAddress"), url=url,
                          time_unknown=tu))
    return out

# ---------- 3. Svenska Massan ----------
SM_SKIP = re.compile(r"(dj:s with a view|after ?work|\baw\b|cocktail hour|fridays at corner|brunch|quiz|"
                     r"konstutst|the gallery|se fotbolls-vm|market by gothia|after dark|after ride|lobby|trubadur)", re.I)
SM_SKIP_VENUE = {"the gallery", "heaven 23", "west coast", "lobbybarerna", "corner"}

def fetch_massan(years, log=print):
    out = []
    for y in years:
        sc = CITY_CFG["sources"]["svenskamassan"]
        d = http(sc["url"],
                 {"fair": 1, "event": 1, "month": "", "year": str(y)})
        cals = [c for m in (d or []) if isinstance(m, dict) for c in (m.get("calendars") or [])]
        log(f"  Svenska Mässan {y}: {len(cals)} poster")
        for c in cals:
            name = (c.get("se_event_name") or "").strip()
            vname = (c.get("se_venue") or "").strip()
            if not name or SM_SKIP.search(name) or norm(vname) in SM_SKIP_VENUE:
                continue
            try:
                d0 = datetime.strptime(c["ev200_evt_start_date"][:10], "%Y-%m-%d").date()
                d1 = datetime.strptime((c.get("ev200_evt_end_date") or c["ev200_evt_start_date"])[:10], "%Y-%m-%d").date()
            except (KeyError, ValueError):
                continue
            if d1 < d0:
                d1 = d0
            home = sc.get("venue")
            venue = match_venue(vname) if vname else home
            cat = "massa" if venue == home else ("teater" if venue == "lorensbergsteatern" else "konsert")
            hhmm = c.get("calendar_time_desc")
            day = d0
            n = 0
            while day <= d1 and n < 10:
                if cat == "massa":
                    st = datetime(day.year, day.month, day.day, 9, 0, tzinfo=TZ)
                    tu = False
                elif hhmm:
                    h, _, mm = str(hhmm).replace(":", ".").partition(".")
                    mm = (mm + "0")[:2] if mm else "00"
                    st = datetime(day.year, day.month, day.day, int(h), int(mm), tzinfo=TZ)
                    tu = False
                else:
                    st = datetime(day.year, day.month, day.day, 0, 0, tzinfo=TZ)
                    tu = True
                out.append(ev("svenskamassan", c.get("calendarid"), name, cat, st, None, venue,
                              vname or (VENUES.get(home) or [None])[0], url=c.get("se_url"), time_unknown=tu))
                day += timedelta(days=1)
                n += 1
    return out

# ---------- sammanslagning ----------
PRIO = {"gotevent": 0, "goteborg_com": 1, "svenskamassan": 2}

def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.6

def _tokens(t):
    return {w for w in norm(t).split() if len(w) >= 4 and not w.isdigit()}

def is_dup(e, k):
    st, ks = datetime.fromisoformat(e["starts_at"]), datetime.fromisoformat(k["starts_at"])
    if st.date() != ks.date():
        return False
    unknown = e["time_unknown"] or k["time_unknown"]
    diff = abs((ks - st).total_seconds())
    same_venue = bool(e["venue_slug"]) and e["venue_slug"] == k["venue_slug"]
    either_unmapped = not (e["venue_slug"] and k["venue_slug"])
    if (same_venue or either_unmapped) and (unknown or diff <= 1800) and similar(e["title"], k["title"]):
        return True
    # t.ex. "BK Hacken - Allsvenskan 2026" 14:00 vs "BK Hacken Herr" 15:00 pa samma arena
    if same_venue and (unknown or diff <= 5400) and _tokens(e["title"]) & _tokens(k["title"]):
        return True
    return False

def score(e):
    """Hogre = battre post att behalla."""
    return (not e["time_unknown"], not e["ends_estimated"], -PRIO.get(e["source"], 9))

def dedup(events):
    events.sort(key=lambda e: (e["starts_at"], PRIO.get(e["source"], 9)))
    by_day, kept = {}, []
    for e in events:
        day = e["starts_at"][:10]
        bucket = by_day.setdefault(day, [])
        dup = next((k for k in bucket if is_dup(e, k)), None)
        if not dup:
            e["also"] = []
            bucket.append(e); kept.append(e)
            continue
        if score(e) > score(dup):
            e["also"] = dup["also"] + [{"source": dup["source"], "url": dup["url"]}]
            bucket[bucket.index(dup)] = e
            kept[kept.index(dup)] = e
        else:
            dup["also"].append({"source": e["source"], "url": e["url"]})
    kept.sort(key=lambda e: e["starts_at"])
    return kept

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="events_dryrun.json")
    ap.add_argument("--upload", action="store_true", help="skicka till Supabase (annars bara fil)")
    ap.add_argument("--city", default="goteborg", help="stad i kalender_cities.json")
    ap.add_argument("--sources", default=None, help="kommaseparerat, standard = alla i stadens config")
    ap.add_argument("--max-pages", type=int, default=None)
    a = ap.parse_args()
    load_city(a.city)
    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    horizon = today + timedelta(days=DAYS_AHEAD)
    registry = {"goteborg_com": lambda: fetch_goteborg(a.max_pages),
                "gotevent": fetch_gotevent,
                "svenskamassan": lambda: fetch_massan(sorted({today.year, horizon.year}))}
    src = a.sources.split(",") if a.sources else list(CITY_CFG.get("sources", {}))
    allev, errors = [], []
    for name in src:
        fn = registry.get(name)
        if not fn:
            errors.append(f"{name}: okand kalla"); continue
        print(f"Hamtar {name} ...", flush=True)
        try:
            allev += fn()
        except Exception as err:      # en trasig kalla far inte stoppa de andra
            errors.append(f"{name}: {err}")
            print(f"  ! {name} misslyckades: {err}", file=sys.stderr)
    allev = [e for e in allev if today <= datetime.fromisoformat(e["starts_at"]) < horizon]
    raw_n = len(allev)
    events = dedup(allev)
    res = {"city": CITY, "city_name": CITY_CFG.get("name"), "country": CITY_CFG.get("country"),
           "timezone": CITY_CFG.get("timezone"), "generated_at": datetime.now(TZ).isoformat(timespec="seconds"), "user_agent": UA,
           "count": len(events), "raw_count": raw_n, "errors": errors,
           "venues": [{"slug": s, "name": v[0], "address": v[1], "lat": v[2], "lon": v[3]} for s, v in VENUES.items()],
           "events": events}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    by = {}
    for e in events:
        by[e["category"]] = by.get(e["category"], 0) + 1
    print(f"Klart: {len(events)} evenemang ({raw_n} fore dubblettrensning) -> {a.out}  {by}")
    if a.upload:
        url, key, ik = (os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "EVENTS_INGEST_KEY"))
        if not (url and key and ik):
            print("Saknar SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / EVENTS_INGEST_KEY - laddar inte upp.")
            return 0
        req = urllib.request.Request(url.rstrip("/") + "/rest/v1/rpc/events_ingest",
                                     data=json.dumps({"p_key": ik, "p_city": CITY, "p_events": events}).encode(),
                                     headers={"apikey": key, "Authorization": "Bearer " + key,
                                              "Content-Type": "application/json", "User-Agent": UA}, method="POST")
        with urllib.request.urlopen(req, timeout=60) as r:
            print("Uppladdat:", r.read().decode()[:300])
    return 1 if errors and not events else 0

if __name__ == "__main__":
    sys.exit(main())
