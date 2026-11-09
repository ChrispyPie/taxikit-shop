#!/usr/bin/env python3
import sys,re,subprocess
from bs4 import BeautifulSoup
b=subprocess.run(["curl","-sL","-A","Mozilla/5.0",sys.argv[1]],capture_output=True,text=True).stdout
links=sorted(set(re.findall(r'"(https://www.riksdagen.se/sv/dokument-och-lagar/dokument/[^"]*omrostning/[^"]+~[0-9a-f-]+/)"',b)))
for u in links:
    if sys.argv[2] not in u: continue
    t=BeautifulSoup(subprocess.run(["curl","-sL","-A","Mozilla/5.0",u],capture_output=True,text=True).stdout,"html.parser").get_text(" ")
    t=re.sub(r"\s+"," ",t); i=t.find("Omröstning i sakfrågan")
    j=t.find("Förslagspunkt"); 
    print(u); print(t[max(0,i-900):i+160]); print()
