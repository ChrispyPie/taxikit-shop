# Ljud för bevakningar

Filerna `tag.mp3`, `flyg.mp3` och `bat.mp3` är inspelningar som Christian valt
och skickat till appen (november 2026). De spelas när en bevakning slår till
medan appen är öppen, och när man trycker Testa ljud.

För appen är de lätt trimmade (tystnad i början/slutet), normaliserade i
ljudstyrka och sparade som mono cirka 80 kbit/s, så de blir små att hämta på
telefonen. Originalen ändras inte här.

Byt en fil genom att lägga en ny `tag.mp3`, `flyg.mp3` eller `bat.mp3` med
samma namn och höja cache-versionen (`?v=`) på sökvägen i `bevakning-ljud.js`.
Saknas en fil används en reservton (Web Audio) i stället.
