#!/usr/bin/env python3
"""För varje votering i ett betänkande: URL och den ordagranna raden 'Utskottets förslag mot reservation …'."""
import sys,re,subprocess
from bs4 import BeautifulSoup
g=lambda u: subprocess.run(["curl","-sL","-A","Mozilla/5.0","--max-time","40",u],capture_output=True,text=True).stdout
b=g(sys.argv[1])
for u in sorted(set(re.findall(r'"(https://www.riksdagen.se/sv/dokument-och-lagar/dokument/[^"]*omrostning/[^"]+~[0-9a-f-]+/)"',b))):
    if len(sys.argv)>2 and not any(k in u for k in sys.argv[2:]): continue
    t=re.sub(r"\s+"," ",BeautifulSoup(g(u),"html.parser").get_text(" "))
    m=re.search(r"Omröstning i sakfrågan (Utskottets förslag mot [^.]*?\))",t)
    print(u); print("   ", m.group(1) if m else "?")
