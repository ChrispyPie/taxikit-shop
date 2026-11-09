#!/usr/bin/env python3
"""Listar huvudvoteringar för ett betänkande på riksdagen.se med röster per parti (Ja/Nej/Avstår).
Användning: omr.py <betänkande-URL på riksdagen.se>"""
import sys, re, json, subprocess, collections
def get(u): return subprocess.run(["curl","-sL","-A","Mozilla/5.0","--max-time","40",u],capture_output=True,text=True).stdout
b = get(sys.argv[1])
links = sorted(set(re.findall(r'"(https://www.riksdagen.se/sv/dokument-och-lagar/dokument/[^"]*omrostning/[^"]+~([0-9a-f-]+)/)"', b)))
for u, guid in links:
    d = json.loads(get(f"https://data.riksdagen.se/votering/{guid.upper()}/json"))
    v = d["votering"]["dokvotering"]["votering"]
    c = collections.defaultdict(collections.Counter)
    for x in v: c[x["parti"]][x["rost"]] += 1
    p = v[0]
    print(u.split("omrostning/")[1].split("~")[0], p.get("punkt"), p.get("datum","")[:10])
    print("   ", "  ".join(f"{k}: J{c[k]['Ja']}/N{c[k]['Nej']}/A{c[k]['Avstår']}" for k in ["S","SD","M","V","C","KD","MP","L"]))
