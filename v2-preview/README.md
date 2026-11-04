# TaxiKit v2 – designkoncept "Nattskift" (PROTOTYP)

Klickbar statisk prototyp, mobil först. **Allt är exempeldata – inga riktiga produkter eller priser.** `noindex` på alla sidor.

Sidor: `index.html` (hem) · `kategori.html` · `produkt.html?id=…` · `kit.html` (skift-kit-byggare) · `bagage.html` (varukorg).

- Palett: Asfalt `#0E1114`, Kantsten `#171C22`, Taklampa `#FFC83D`, LEDIG-grön `#2EE6A6` (köpknappar), Bromsljus `#FF5B4F`, Dimma `#EEF1F4` (dagläge)
- Typsnitt: Space Grotesk (rubriker), Inter (text), JetBrains Mono (priser, taxameterkänsla)
- Anpassa (⚙️): min bil, auto/natt/dag, SV/EN, priser inkl./exkl. moms – sparas i webbläsaren (localStorage, prefix `tk2_`)
- URL-parametrar för test: `?theme=natt|dag`, `?car=corolla`, `?settings=1`, `kit.html?step=1`

Rör inte TaxiData, skiftlogg, valkompass eller api/. Denna mapp är fristående och kan raderas utan påverkan.
