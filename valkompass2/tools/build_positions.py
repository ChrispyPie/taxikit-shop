#!/usr/bin/env python3
"""Verifierar och lägger in partipositioner i valkompass2/data/positions.json.
Varje källa hämtas, citatet måste finnas ordagrant (efter normalisering av blanksteg) och datum läses från sidan när möjligt."""
import json, re, sys, subprocess, html
from bs4 import BeautifulSoup

def fetch(url):
    r = subprocess.run(["curl","-sL","-A","Mozilla/5.0","-w","\n%{http_code}","--max-time","30",url],capture_output=True,text=True)
    body, code = r.stdout.rsplit("\n",1)
    return int(code), body

def norm(s):
    s = html.unescape(s).replace("\u00a0"," ").replace("’","'").replace("”",'"').replace("“",'"')
    return re.sub(r"\s+"," ",s).strip()

def check(entry, cache):
    url = entry["url"]
    if url not in cache: cache[url] = fetch(url)
    code, body = cache[url]
    if code != 200: return f"HTTP {code}"
    text = norm(BeautifulSoup(body,"html.parser").get_text(" "))
    if norm(entry["quote"]) not in text: return "citat hittades inte"
    if not entry.get("date"):
        m = re.search(r'"dateModified":"(\d{4}-\d{2}-\d{2})', body) or re.search(r'"datePublished":"(\d{4}-\d{2}-\d{2})', body)
        entry["date"] = m.group(1) if m else None
    return None

if __name__ == "__main__":
    posfile, newfile = sys.argv[1], sys.argv[2]
    pos = json.load(open(posfile)); new = json.load(open(newfile))
    cache = {}; errors = []
    for e in new:
        e.setdefault("reviewedByParty", False)
        e.setdefault("accessed", __import__("datetime").date.today().isoformat())
        if e["value"] is None: continue
        err = check(e, cache)
        if err: errors.append((e["statementId"], err, e["url"]))
    if errors:
        for x in errors: print("FEL", *x)
        sys.exit(1)
    party = new[0]["party"]
    pos["positions"] = [p for p in pos["positions"] if p["party"] != party] + new
    json.dump(pos, open(posfile,"w"), ensure_ascii=False, indent=2); open(posfile,"a").write("\n")
    from collections import Counter
    print(party, len(new), Counter(e["confidence"] for e in new))
