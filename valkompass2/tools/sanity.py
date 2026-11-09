#!/usr/bin/env python3
"""Sanity-kontroll: varje partis egna positioner som användarsvar ska ge 100 % för just det partiet
och det partiet ska hamna först. Matchning = snitt av 1 - |svar - parti| / 4 över påståenden där båda har värde."""
import json, collections, os
base = os.path.join(os.path.dirname(__file__), "..", "data")
pos = json.load(open(os.path.join(base, "positions.json")))["positions"]
P = collections.defaultdict(dict)
for p in pos:
    if p["value"] is not None: P[p["party"]][p["statementId"]] = p["value"]
def match(user, party):
    common = [s for s in user if s in P[party]]
    if not common: return None
    return round(100 * sum(1 - abs(user[s] - P[party][s]) / 4 for s in common) / len(common), 1)
ok = True
for a in P:
    res = sorted(((match(P[a], b), b) for b in P), reverse=True)
    print(f"{a} som användare:", ", ".join(f"{b} {m}%" for m, b in res))
    if res[0][1] != a or res[0][0] != 100.0: ok = False
print("OK" if ok else "FEL: något parti matchar inte sig självt till 100 % först")
