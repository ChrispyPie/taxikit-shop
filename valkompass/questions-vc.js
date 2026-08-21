window.partyQuestions = window.partyQuestions || {};
Object.assign(window.partyQuestions, {
  v: [
    {
      id: "q-v01a",
      text: "Bör vinster i välfärden (skola, vård, omsorg) förbjudas?",
      options: [
        { label: "Ja, förbjudas helt", scores: { v: 2, s: 1, mp: 2, nyans: 1, c: -1, l: -2, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Nej, vinster är okej om kvaliteten är hög", scores: { v: -2, s: -1, mp: -2, nyans: -1, c: 1, l: 2, m: 2, kd: 1, sd: 0, med: 2, afs: 0 } },
        { label: "Kraftigt begränsas, men inte förbjudas", scores: { v: 1, s: 1, mp: 1, nyans: 0, c: 0, l: -1, m: -1, kd: 0, sd: 0, med: -1, afs: 0 } }
      ]
    },
    {
      id: "q-v02b",
      text: "Bör skatten på de högsta inkomsterna höjas tydligt?",
      options: [
        { label: "Ja", scores: { v: 2, s: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: -1, med: -2, afs: -1 } },
        { label: "Nej", scores: { v: -2, s: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "Bara marginellt", scores: { v: 0, s: 1, mp: 0, nyans: 0, c: 1, l: 0, m: -1, kd: 0, sd: 0, med: -1, afs: 0 } }
      ]
    },
    {
      id: "q-v03c",
      text: "Hur starkt ska anställningsskyddet vara?",
      options: [
        { label: "Starkare än idag – svårare att säga upp", scores: { v: 2, s: 2, mp: 1, nyans: 1, c: -1, l: -1, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Svagare – företagen behöver mer flexibilitet", scores: { v: -2, s: -2, mp: -1, nyans: -1, c: 1, l: 1, m: 2, kd: 1, sd: 0, med: 2, afs: 1 } },
        { label: "Ungefär som idag", scores: { v: 0, s: 1, mp: 0, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-v04d",
      text: "Bör Sverige bygga ut kärnkraften?",
      options: [
        { label: "Ja, kraftigt", scores: { v: -2, mp: -2, s: 0, nyans: 0, c: 0, l: 1, m: 2, kd: 2, sd: 2, med: 2, afs: 1 } },
        { label: "Nej, fokusera på vind, sol och lagring", scores: { v: 2, mp: 2, s: 1, nyans: 0, c: 1, l: 0, m: -2, kd: -1, sd: -2, med: -2, afs: -2 } },
        { label: "Behåll befintlig men bygg inte ut kraftigt", scores: { v: 0, mp: -1, s: 1, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 1, afs: 0 } }
      ]
    },
    {
      id: "q-v05e",
      text: "Hur generös bör asyl- och invandringspolitiken vara?",
      options: [
        { label: "Mer generös än idag", scores: { v: 2, mp: 2, s: 1, nyans: 2, c: 1, l: 0, m: -1, kd: -1, sd: -2, med: -2, afs: -2 } },
        { label: "Tydligt mer restriktiv", scores: { v: -2, mp: -2, s: -1, nyans: -1, c: -1, l: 0, m: 1, kd: 1, sd: 2, med: 2, afs: 2 } },
        { label: "Ungefär som idag", scores: { v: 0, mp: 0, s: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 0, sd: -1, med: -1, afs: -1 } }
      ]
    },
    {
      id: "q-v06f",
      text: "Bör staten ta över fler företag inom viktiga samhällssektorer (t.ex. el, tåg, apotek)?",
      options: [
        { label: "Ja, mer offentlig ägande", scores: { v: 2, s: 1, mp: 1, nyans: 0, c: -1, l: -2, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Nej, privat ägande fungerar bättre", scores: { v: -2, s: -1, mp: -1, nyans: 0, c: 1, l: 2, m: 2, kd: 1, sd: 0, med: 2, afs: 1 } },
        { label: "Bara i vissa fall där marknaden misslyckas", scores: { v: 0, s: 1, mp: 1, nyans: 0, c: 1, l: 0, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-v07g",
      text: "Hur högt ska priset på koldioxidutsläpp vara?",
      options: [
        { label: "Tydligt högre – klimatet går före kortsiktiga jobb", scores: { v: 2, mp: 2, s: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 0, sd: -1, med: -1, afs: -2 } },
        { label: "Lägre – jobb och konkurrenskraft är viktigare just nu", scores: { v: -2, mp: -2, s: -1, nyans: 0, c: 0, l: 0, m: 1, kd: 1, sd: 2, med: 2, afs: 2 } },
        { label: "Ungefär som idag", scores: { v: 0, mp: 0, s: 1, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-v08h",
      text: "Bör det bli svårare att hyra ut i andra hand och spekulera i bostäder?",
      options: [
        { label: "Ja, strängare regler mot spekulation", scores: { v: 2, s: 1, mp: 1, nyans: 0, c: 0, l: -1, m: -1, kd: 0, sd: 0, med: -1, afs: 0 } },
        { label: "Nej, fri marknad ger fler bostäder", scores: { v: -2, s: -1, mp: -1, nyans: 0, c: 1, l: 1, m: 2, kd: 0, sd: 0, med: 2, afs: 1 } },
        { label: "Vissa begränsningar, men inte för hårda", scores: { v: 0, s: 1, mp: 0, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-v09i",
      text: "Hur ska Sverige främst minska klyftorna mellan rika och fattiga?",
      options: [
        { label: "Högre skatter på kapital och höga inkomster + mer bidrag", scores: { v: 2, s: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: -1, med: -2, afs: -1 } },
        { label: "Främst genom mer jobb och lägre skatt på arbete", scores: { v: -2, s: -1, mp: -1, nyans: 0, c: 1, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "En blandning av båda", scores: { v: 0, s: 1, mp: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 0, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-v10j",
      text: "Bör militärutgifterna öka de kommande åren?",
      options: [
        { label: "Ja, tydligt", scores: { v: -2, mp: -1, s: 0, nyans: 0, c: 1, l: 1, m: 2, kd: 2, sd: 2, med: 1, afs: 1 } },
        { label: "Nej, pengarna behövs mer till välfärd", scores: { v: 2, mp: 1, s: 1, nyans: 1, c: 0, l: 0, m: -1, kd: -1, sd: -1, med: -1, afs: 0 } },
        { label: "Måttlig ökning", scores: { v: 0, mp: 0, s: 1, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 1, afs: 0 } }
      ]
    }
  ],
  c: [
    {
      id: "q-c01a",
      text: "Bör det bli enklare att starta och driva företag på landsbygden genom färre regler?",
      options: [
        { label: "Ja, kraftigt", scores: { c: 2, m: 2, l: 1, med: 2, kd: 1, sd: 1, afs: 1, s: -1, v: -2, mp: -1, nyans: 0 } },
        { label: "Nej, reglerna behövs", scores: { c: -2, m: -2, l: -1, med: -2, kd: -1, sd: -1, afs: -1, s: 1, v: 2, mp: 2, nyans: 1 } },
        { label: "Ja, men med behållna skydd för miljö och anställda", scores: { c: 1, m: 1, l: 1, med: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-c02b",
      text: "Hur viktigt är det att Sverige stannar i EU och behåller det mesta av samarbetet?",
      options: [
        { label: "Mycket viktigt – EU är bra för Sverige", scores: { c: 2, l: 2, m: 1, s: 1, mp: 1, kd: 1, v: 0, nyans: 0, sd: -2, med: -1, afs: -2 } },
        { label: "Vi bör lämna EU eller kraftigt minska samarbetet", scores: { c: -2, l: -2, m: -1, s: -1, mp: -1, kd: -1, v: 0, nyans: 0, sd: 2, med: 1, afs: 2 } },
        { label: "Stanna, men flytta tillbaka mer makt till Sverige", scores: { c: 0, l: 0, m: 1, s: 0, mp: 0, kd: 1, v: 0, nyans: 0, sd: 1, med: 1, afs: 1 } }
      ]
    },
    {
      id: "q-c03c",
      text: "Bör arbetskraftsinvandring underlättas för yrken där det råder brist?",
      options: [
        { label: "Ja, tydligt", scores: { c: 2, l: 2, m: 1, med: 1, kd: 0, s: 0, mp: 1, v: 0, nyans: 1, sd: -2, afs: -2 } },
        { label: "Nej, fokusera på dem som redan bor här", scores: { c: -2, l: -1, m: 0, med: 0, kd: 1, s: 1, mp: 0, v: 1, nyans: 0, sd: 2, afs: 2 } },
        { label: "Ja, men med tydliga krav på lön och villkor", scores: { c: 1, l: 1, m: 1, med: 1, kd: 1, s: 1, mp: 1, v: 0, nyans: 0, sd: 0, afs: -1 } }
      ]
    },
    {
      id: "q-c04d",
      text: "Hur ska Sverige främst öka produktionen av mat och energi i hela landet?",
      options: [
        { label: "Mer stöd till bönder och landsbygd + lokal produktion", scores: { c: 2, kd: 1, s: 1, mp: 1, v: 1, m: 0, l: 0, sd: 1, med: 0, afs: 0, nyans: 0 } },
        { label: "Främst genom friare marknad och mindre regler", scores: { c: 1, m: 2, l: 1, med: 2, kd: 0, s: -1, mp: -1, v: -2, sd: 0, afs: 0, nyans: 0 } },
        { label: "Staten ska styra mer och satsa på stora projekt", scores: { c: -1, m: -1, l: -1, med: -2, kd: 0, s: 1, mp: 1, v: 2, sd: 0, afs: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-c05e",
      text: "Bör vinster i friskolor och privat vård tillåtas?",
      options: [
        { label: "Ja", scores: { c: 2, l: 2, m: 2, med: 2, kd: 1, sd: 0, afs: 0, s: -2, v: -2, mp: -2, nyans: -1 } },
        { label: "Nej, vinster bör förbjudas", scores: { c: -2, l: -2, m: -2, med: -2, kd: -1, sd: 0, afs: 0, s: 2, v: 2, mp: 2, nyans: 1 } },
        { label: "Ja, men med tydliga kvalitetskrav", scores: { c: 1, l: 1, m: 1, med: 0, kd: 1, sd: 1, afs: 0, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-c06f",
      text: "Hur viktig är kärnkraften för Sveriges elförsörjning?",
      options: [
        { label: "Mycket viktig – den bör byggas ut", scores: { c: 1, m: 2, kd: 2, sd: 2, med: 2, l: 1, afs: 1, s: 0, v: -2, mp: -2, nyans: 0 } },
        { label: "Vi bör fasa ut den till förmån för förnybart", scores: { c: -1, m: -2, kd: -1, sd: -2, med: -2, l: 0, afs: -2, s: 1, v: 1, mp: 2, nyans: 0 } },
        { label: "Behåll den, men prioritera också vind och sol", scores: { c: 2, m: 1, kd: 1, sd: 1, med: 1, l: 1, afs: 0, s: 1, v: 0, mp: -1, nyans: 0 } }
      ]
    },
    {
      id: "q-c07g",
      text: "Bör mer makt och pengar flyttas från staten till kommuner och regioner?",
      options: [
        { label: "Ja, tydligt", scores: { c: 2, m: 1, l: 1, kd: 1, med: 1, sd: 0, afs: 0, s: -1, v: -1, mp: 0, nyans: 0 } },
        { label: "Nej, staten behöver ha mer kontroll", scores: { c: -2, m: -1, l: -1, kd: -1, med: -1, sd: 0, afs: 0, s: 1, v: 2, mp: 1, nyans: 0 } },
        { label: "En viss förskjutning, men inte för långt", scores: { c: 1, m: 1, l: 1, kd: 1, med: 0, sd: 1, afs: 0, s: 1, v: 0, mp: 1, nyans: 0 } }
      ]
    },
    {
      id: "q-c08h",
      text: "Hur generös bör familjeåterföreningen vara för den som fått uppehållstillstånd?",
      options: [
        { label: "Generös", scores: { c: 1, l: 1, s: 1, mp: 2, v: 2, nyans: 1, m: -1, kd: -1, sd: -2, med: -2, afs: -2 } },
        { label: "Mycket restriktiv", scores: { c: -1, l: 0, s: -1, mp: -2, v: -2, nyans: -1, m: 1, kd: 1, sd: 2, med: 2, afs: 2 } },
        { label: "Måttlig – make/maka och minderåriga barn under tydliga villkor", scores: { c: 2, l: 1, s: 1, mp: 0, v: 0, nyans: 0, m: 1, kd: 1, sd: 0, med: 0, afs: -1 } }
      ]
    },
    {
      id: "q-c09i",
      text: "Bör skatten på arbete sänkas för att göra det mer lönsamt att anställa och jobba?",
      options: [
        { label: "Ja, tydligt", scores: { c: 2, m: 2, l: 1, med: 2, kd: 1, sd: 1, afs: 0, s: -2, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, välfärden behöver pengarna", scores: { c: -2, m: -2, l: -1, med: -2, kd: -1, sd: -1, afs: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "Bara marginellt", scores: { c: 1, m: 1, l: 1, med: 1, kd: 1, sd: 0, afs: 0, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-c10j",
      text: "Hur ska Sverige hantera varg och andra rovdjur?",
      options: [
        { label: "Mer skyddsjakt och lägre vargstam – bönder och landsbygd först", scores: { c: 2, kd: 1, sd: 1, m: 1, med: 1, afs: 1, s: 0, l: 0, v: -1, mp: -2, nyans: 0 } },
        { label: "Starkare skydd för vargen – naturen går före", scores: { c: -2, kd: -1, sd: -1, m: -1, med: -1, afs: -1, s: 0, l: 0, v: 1, mp: 2, nyans: 0 } },
        { label: "Balans mellan skyddsjakt och bevarande", scores: { c: 1, kd: 1, sd: 0, m: 1, med: 0, afs: 0, s: 1, l: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    }
  ],
  kd: [
    {
      id: "q-kd01",
      text: "Hur ska Sverige främst stärka familjerna?",
      options: [
        { label: "Högre barnbidrag och mer stöd till föräldrar som stannar hemma", scores: { kd: 2, sd: 1, s: 1, c: 1, m: 0, l: 0, v: 0, mp: 0, med: -1, afs: 0, nyans: 0 } },
        { label: "Mer förskola och att båda föräldrarna jobbar", scores: { kd: -1, sd: -1, s: 1, c: 0, m: 0, l: 1, v: 1, mp: 2, med: 0, afs: -1, nyans: 0 } },
        { label: "Lägre skatt så familjerna får mer pengar kvar", scores: { kd: 1, sd: 1, s: -1, c: 1, m: 2, l: 1, v: -2, mp: -1, med: 2, afs: 1, nyans: 0 } }
      ]
    },
    {
      id: "q-kd02",
      text: "Bör vården prioritera kortare köer och mer valfrihet för patienten?",
      options: [
        { label: "Ja, tydligt", scores: { kd: 2, m: 2, l: 1, c: 1, med: 2, sd: 1, s: 0, v: -1, mp: 0, afs: 0, nyans: 0 } },
        { label: "Nej, mer offentlig styrning och lika för alla", scores: { kd: -2, m: -2, l: -1, c: -1, med: -2, sd: 0, s: 2, v: 2, mp: 1, afs: 0, nyans: 1 } },
        { label: "En blandning", scores: { kd: 1, m: 1, l: 1, c: 1, med: 0, sd: 1, s: 1, v: 0, mp: 1, afs: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-kd03",
      text: "Hur viktigt är det att skolan förmedlar kristna och traditionella värderingar?",
      options: [
        { label: "Mycket viktigt", scores: { kd: 2, sd: 1, afs: 1, m: 0, c: 0, s: -1, l: -1, v: -2, mp: -2, med: 0, nyans: -1 } },
        { label: "Skolan ska vara neutral i trosfrågor", scores: { kd: -2, sd: -1, afs: -1, m: 0, c: 1, s: 1, l: 1, v: 1, mp: 2, med: 1, nyans: 1 } },
        { label: "Viss plats för traditioner, men utan att styra trosfrågor", scores: { kd: 1, sd: 1, afs: 0, m: 1, c: 1, s: 1, l: 1, v: 0, mp: 0, med: 1, nyans: 0 } }
      ]
    },
    {
      id: "q-kd04",
      text: "Bör straffen för vålds- och sexualbrott skärpas?",
      options: [
        { label: "Ja, tydligt", scores: { kd: 2, sd: 2, m: 2, med: 2, afs: 2, l: 1, c: 0, s: 0, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, mer fokus på rehabilitering", scores: { kd: -2, sd: -2, m: -1, med: -2, afs: -2, l: 0, c: 0, s: 1, v: 2, mp: 1, nyans: 1 } },
        { label: "Viss skärpning, men inte extremt", scores: { kd: 1, sd: 0, m: 1, med: 0, afs: 0, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-kd05",
      text: "Hur generös bör invandringspolitiken vara?",
      options: [
        { label: "Tydligt mer restriktiv", scores: { kd: 2, sd: 2, m: 1, med: 2, afs: 2, l: 0, c: -1, s: -1, v: -2, mp: -2, nyans: -1 } },
        { label: "Mer generös än idag", scores: { kd: -2, sd: -2, m: -1, med: -2, afs: -2, l: 0, c: 1, s: 1, v: 2, mp: 2, nyans: 2 } },
        { label: "Ungefär som idag, men med tydligare krav på integration", scores: { kd: 1, sd: 0, m: 1, med: 0, afs: -1, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-kd06",
      text: "Bör äldreomsorgen få mer resurser även om det betyder högre skatt eller mindre till annat?",
      options: [
        { label: "Ja", scores: { kd: 2, s: 1, c: 1, v: 1, mp: 1, m: 0, l: 0, sd: 0, med: -1, afs: 0, nyans: 0 } },
        { label: "Nej, andra områden är viktigare just nu", scores: { kd: -1, s: -1, c: 0, v: -1, mp: -1, m: 1, l: 1, sd: 1, med: 1, afs: 1, nyans: 0 } },
        { label: "Mer till äldreomsorg, men främst genom effektivisering", scores: { kd: 1, s: 1, c: 1, v: 0, mp: 0, m: 1, l: 1, sd: 1, med: 1, afs: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-kd07",
      text: "Hur ska Sverige se på kön och identitet i lag och skola?",
      options: [
        { label: "Biologiskt kön ska vara grunden – könsbyte för minderåriga bör stoppas", scores: { kd: 2, sd: 2, afs: 2, med: 1, m: 1, c: 0, l: 0, s: -1, v: -2, mp: -2, nyans: -1 } },
        { label: "Barn och unga ska få stöd att byta kön om de vill", scores: { kd: -2, sd: -2, afs: -2, med: -1, m: -1, c: 0, l: 1, s: 1, v: 2, mp: 2, nyans: 1 } },
        { label: "Försiktig linje – utredning och åldersgränser, inte förbud", scores: { kd: 0, sd: 0, afs: -1, med: 0, m: 1, c: 1, l: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-kd08",
      text: "Bör det bli lättare för friskolor med konfessionell inriktning (t.ex. kristna skolor)?",
      options: [
        { label: "Ja", scores: { kd: 2, sd: 0, m: 0, c: 0, l: 0, med: 0, s: -1, v: -2, mp: -1, afs: 0, nyans: 1 } },
        { label: "Nej, skolan ska vara helt icke-konfessionell", scores: { kd: -2, sd: 0, m: 0, c: 0, l: 1, med: 1, s: 1, v: 2, mp: 2, afs: 0, nyans: -1 } },
        { label: "Okej om de följer läroplanen och inte diskriminerar", scores: { kd: 1, sd: 1, m: 1, c: 1, l: 1, med: 1, s: 1, v: 0, mp: 0, afs: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-kd09",
      text: "Hur viktigt är det att Sverige bygger ut kärnkraften?",
      options: [
        { label: "Mycket viktigt", scores: { kd: 2, m: 2, sd: 2, med: 2, l: 1, afs: 1, c: 1, s: 0, v: -2, mp: -2, nyans: 0 } },
        { label: "Nej, fokusera på förnybart", scores: { kd: -2, m: -2, sd: -2, med: -2, l: 0, afs: -2, c: -1, s: 1, v: 1, mp: 2, nyans: 0 } },
        { label: "Behåll och komplettera, men inte bara kärnkraft", scores: { kd: 1, m: 1, sd: 1, med: 1, l: 1, afs: 0, c: 2, s: 1, v: 0, mp: -1, nyans: 0 } }
      ]
    },
    {
      id: "q-kd10",
      text: "Bör civilsamhället (kyrkor, ideella organisationer) få mer ansvar och stöd i välfärden?",
      options: [
        { label: "Ja, tydligt", scores: { kd: 2, c: 1, m: 1, sd: 0, l: 0, s: 0, v: -1, mp: 0, med: 0, afs: 0, nyans: 0 } },
        { label: "Nej, välfärden ska skötas av det offentliga", scores: { kd: -2, c: -1, m: -1, sd: 0, l: 0, s: 1, v: 2, mp: 1, med: 0, afs: 0, nyans: 0 } },
        { label: "Viss roll, men det offentliga ska ha huvudansvaret", scores: { kd: 1, c: 1, m: 1, sd: 1, l: 1, s: 1, v: 0, mp: 1, med: 1, afs: 0, nyans: 0 } }
      ]
    }
  ]
});
