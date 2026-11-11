# TaxiData på hemskärmen och “Gå ur helskärm”

TaxiData har redan en webbapp-manifest (`TaxiData/manifest.webmanifest`) med `display: standalone`, `start_url` och `scope` `/TaxiData/`, samt ikoner. Service workern `TaxiData/sw.js` sköter bara push-notiser och cachar inte sidor – den är oförändrad.

När appen är tillagd på hemskärmen öppnas den utan webbläsarens adressrad. Vill man ha adressraden använder man TaxiData i Chrome som vanligt.

## Knappen bredvid Hem

- I en vanlig Chrome-flik växlar ⛶ fortfarande helskärm via Fullscreen API (som tidigare). Ikonen byts till “gå ur helskärm” (pilar inåt) när läget är på, och tillbaka när det är av. Text vid skärmläsare: **Helskärm** / **Gå ur helskärm**.
- I installerad PWA (`display-mode: standalone` eller `fullscreen`) är adressraden redan borta. Samma knapp visar då “gå ur helskärm” och öppnar **samma sida i vanliga webbläsaren**.

Ikonen uppdateras vid `fullscreenchange` och när `display-mode` ändras.

## Hur “öppna i webbläsaren” fungerar

Det går inte alltid att tvinga en installerad Android-PWA att öppna en *full* Chrome-flik med flikväxlaren. Chrome behandlar ofta en utgång som en Custom Tab (adressrad och stäng-knapp, men inte alltid flikväxlaren). Det är den begränsningen vi känner till 2026.

**Android Chrome**

1. Knappen skapar en riktig `<a href="intent://…">` och klickar på den. Enbart `location.href = 'intent://…'` räcker inte – Android skickar `intent://` till systemet bara vid vanlig länknavigering.
2. Intentet pekar på `package=com.android.chrome`, med `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_MULTIPLE_TASK | FLAG_ACTIVITY_NEW_DOCUMENT`.
3. `S.browser_fallback_url` går till `/oppna-taxidata.html?u=…` som ligger **utanför** PWA-scopet `/TaxiData/`. Den sidan släpper bara vidare till samma ursprung och sökvägar som börjar med `/TaxiData/`, så man hamnar i webbläsaren och sedan i TaxiData.

Vi har inte kört detta på en fysisk Android-telefon i den här omgången. Lösningen följer det som visat sig fungera i tester av samma mönster (intent via riktigt länk-klick). Räkna med adressrad (Custom Tab eller flik), inte nödvändigtvis en full flikväxlare.

**iOS**

`window.open` från en knapptryckning kan öppna Safari. Om det blockeras används `x-safari-https://`.

**Dator**

`window.open` av samma adress. Om popup blockeras används samma hopp-sida utanför scopet.

Service worker, push och bevakningsnotiser är orörda.
