#!/usr/bin/env python3
"""Hämta öppna RSS-flöden och skriv en kort JSON-cache.

Körs av GitHub Action ett par gånger i timmen. Hämtar bara rubrik,
kort sammanfattning, källa, tid och länk – aldrig hela artiklar.
"""
from __future__ import annotations

import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parents[1] / "skiftlogg/feed/nyheter.json"
UA = "TaxiData/1.0 (https://taxikit.shop; nyheter-cache)"
MAX_ITEMS = 15
SUMMARY_LEN = 220

FEEDS = [
    {
        "id": "goteborg",
        "label": "Göteborg",
        "source": "SVT Väst",
        "url": "https://www.svt.se/nyheter/lokalt/vast/rss.xml",
    },
    {
        "id": "politik",
        "label": "Politik",
        "source": "SR Studio Ett",
        "url": "https://api.sr.se/api/rss/program/1637",
    },
    {
        "id": "sport",
        "label": "Sport",
        "source": "SVT Sport",
        "url": "https://www.svt.se/sport/rss.xml",
    },
    {
        "id": "sverige",
        "label": "Sverige",
        "source": "SVT Inrikes",
        "url": "https://www.svt.se/nyheter/inrikes/rss.xml",
    },
    {
        "id": "noje",
        "label": "Nöje",
        "source": "SVT Kultur",
        "url": "https://www.svt.se/kultur/rss.xml",
    },
]

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "dc": "http://purl.org/dc/elements/1.1/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}


def fetch(url: str) -> bytes:
    req = Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            "Accept-Encoding": "gzip",
        },
    )
    with urlopen(req, timeout=18) as res:
        raw = res.read()
        enc = (res.headers.get("Content-Encoding") or "").lower()
        if enc == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return raw


def text_of(el) -> str:
    if el is None:
        return ""
    if el.text:
        s = el.text
    else:
        s = "".join(el.itertext())
    return unescape(s).strip()


def unescape(s: str) -> str:
    s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", s)
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clip(s: str, n: int = SUMMARY_LEN) -> str:
    s = unescape(s)
    if len(s) <= n:
        return s
    cut = s[: n + 1]
    sp = cut.rfind(" ")
    if sp >= int(n * 0.6):
        cut = cut[:sp]
    return cut.rstrip(" ,;:-") + "…"


def iso_time(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    try:
        dt = parsedate_to_datetime(raw)
    except (TypeError, ValueError, IndexError):
        try:
            if raw.endswith("Z"):
                raw = raw[:-1] + "+00:00"
            dt = datetime.fromisoformat(raw)
        except ValueError:
            return raw
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local(tag: str) -> str:
    return tag.split("}", 1)[-1].lower()


def child(el, names):
    want = {n.lower() for n in names}
    for c in list(el):
        if local(c.tag) in want:
            return c
    return None


def link_of(el) -> str:
    # RSS <link>text</link> or Atom <link href>
    for c in list(el):
        if local(c.tag) != "link":
            continue
        href = (c.get("href") or "").strip()
        typ = (c.get("rel") or "alternate").lower()
        if href and typ in ("alternate", ""):
            return href
        if href and not typ:
            return href
        t = text_of(c)
        if t.startswith("http"):
            return t
        if href:
            return href
    return ""


def parse_items(xml_bytes: bytes, source: str) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []
    for el in root.iter():
        tag = local(el.tag)
        if tag not in ("item", "entry"):
            continue
        title = text_of(child(el, ["title"]))
        url = link_of(el)
        if not url:
            guid = child(el, ["guid", "id"])
            g = text_of(guid)
            if g.startswith("http"):
                url = g
        desc = text_of(child(el, ["description", "summary", "subtitle"]))
        if not desc:
            desc = text_of(child(el, ["content"]))
        published = iso_time(text_of(child(el, ["pubdate", "published", "updated", "date"])))
        if not title or not url:
            continue
        if url.startswith("http://"):
            url = "https://" + url[7:]
        items.append(
            {
                "title": title,
                "summary": clip(desc) if desc and desc != title else "",
                "source": source,
                "published": published,
                "url": url,
            }
        )
        if len(items) >= MAX_ITEMS:
            break
    return items


def main() -> int:
    feeds = {}
    errors = []
    for spec in FEEDS:
        try:
            raw = fetch(spec["url"])
            items = parse_items(raw, spec["source"])
            if not items:
                raise RuntimeError("inga poster")
            feeds[spec["id"]] = {
                "id": spec["id"],
                "label": spec["label"],
                "source": spec["source"],
                "url": spec["url"],
                "items": items,
            }
            print(f"ok {spec['id']}: {len(items)} poster ({spec['source']})")
        except (HTTPError, URLError, OSError, ET.ParseError, RuntimeError) as e:
            errors.append(f"{spec['id']}: {e}")
            print(f"fel {spec['id']}: {e}", file=sys.stderr)

    if not feeds:
        print("Inget flöde kunde hämtas", file=sys.stderr)
        return 1

    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feeds": feeds,
    }
    if errors:
        out["errors"] = errors

    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    # Behåll föregående fil om den nya är identisk bortsett från updated
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
            a = json.dumps(prev.get("feeds"), ensure_ascii=False, separators=(",", ":"))
            b = json.dumps(out["feeds"], ensure_ascii=False, separators=(",", ":"))
            if a == b and not errors:
                print("Ingen innehållsändring")
                return 0
        except Exception:
            pass
    OUT.write_text(tmp + "\n", encoding="utf-8")
    print("skrev", OUT, "bytes", OUT.stat().st_size)
    return 0 if not errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
