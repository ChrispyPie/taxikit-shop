// Frågebanker per parti
// Varje fråga har ett opakt id (t.ex. q-41ae) – klicka på koden i appen för att kopiera
// Syntax för förklaringar: [[ord|förklaringstext]]  eller  [[ord]] (slår upp i glossary.js)

window.partyQuestions = {
  sd: [
    {
      id: "q-41ae",
      text: "En person kör rattfull och dödar en annan människa. Vad bör minimistraffet vara?",
      options: [
        { label: "2 år", scores: { sd: -2, afs: -2, m: -2, kd: -2, med: -2, l: -1, c: 0, s: 0, mp: 1, v: 2, nyans: 1 } },
        { label: "4 år", scores: { sd: -1, afs: -1, m: -1, kd: 0, med: -1, l: 0, c: 1, s: 2, mp: 2, v: 1, nyans: 1 } },
        { label: "6 år", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } },
        { label: "8 år eller mer", scores: { sd: 2, afs: 2, m: 2, kd: 2, med: 2, l: 1, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } }
      ]
    },
    {
      id: "q-26ee",
      text: "En asylsökande reser tillbaka till det land denne säger sig ha flytt från medan ansökan prövas. Vad bör hända?",
      options: [
        { label: "Ansökan ska avslås", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "Det ska vägas in, men inte automatiskt leda till avslag", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } },
        { label: "Det ska inte påverka alls", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } }
      ]
    },
    {
      id: "q-bef9",
      text: "En person som fått svenskt medborgarskap begår grova våldsbrott. Bör medborgarskapet kunna återkallas?",
      options: [
        { label: "Nej, medborgarskap ska inte kunna återkallas", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Ja, vid grova våldsbrott (t.ex. mord, grov misshandel)", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "Ja, men bara vid terrorbrott eller liknande", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } }
      ]
    },
    {
      id: "q-db00",
      text: "När vårdköerna är långa, vem bör prioriteras först?",
      options: [
        { label: "Alla lika", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -1, l: 1, c: 1, s: 2, mp: 2, v: 2, nyans: 1 } },
        { label: "Svenska medborgare", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 1, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "De som bott längst i Sverige", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 0, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } }
      ]
    },
    {
      id: "q-d13f",
      text: "Bör det krävas godkänd svenska för att få [[permanent uppehållstillstånd]]?",
      options: [
        { label: "Nej, språkkunskap ska inte krävas", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: -1, c: 0, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Ja, grundläggande svenska ([[A2]])", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } },
        { label: "Ja, god svenska ([[B1]] eller högre)", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 1, c: 0, s: -1, mp: -2, v: -2, nyans: -1 } }
      ]
    },
    {
      id: "q-83d3",
      text: "Ekonomiskt bistånd till nyanlända jämfört med riksnormen för övriga bör vara:",
      options: [
        { label: "Högre under en [[etableringsperiod]]", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Ungefär samma", scores: { sd: 0, afs: -1, m: 0, kd: 0, med: 0, l: 1, c: 1, s: 1, mp: 1, v: 1, nyans: 1 } },
        { label: "Tydligt lägre", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } }
      ]
    },
    {
      id: "q-ce13",
      text: "Bör det vara tillåtet att bygga moskéer som finansieras av stater som Saudiarabien, Qatar eller Turkiet?",
      options: [
        { label: "Ja, fritt", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 1, v: 1, nyans: 2 } },
        { label: "Nej", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -1, v: -1, nyans: -2 } },
        { label: "Ja, men med stränga krav på öppenhet", scores: { sd: 0, afs: -1, m: 1, kd: 1, med: 0, l: 1, c: 1, s: 1, mp: 1, v: 1, nyans: 0 } }
      ]
    },
    {
      id: "q-8274",
      text: "Bör skolan aktivt främja svenska traditioner och högtider (jul, midsommar, påsk) även när det finns elever från andra kulturer?",
      options: [
        { label: "I viss mån", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } },
        { label: "Nej, skolan ska vara neutral", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -1, l: 0, c: 0, s: 0, mp: 2, v: 1, nyans: 1 } },
        { label: "Ja, det bör vara självklart", scores: { sd: 2, afs: 2, m: 1, kd: 2, med: 1, l: 0, c: 0, s: 0, mp: -2, v: -1, nyans: -1 } }
      ]
    },
    {
      id: "q-24e6",
      text: "En person utan svenskt medborgarskap är aktiv i ett kriminellt nätverk. Vad bör vara huvudregeln?",
      options: [
        { label: "Behandling och rehabilitering i Sverige", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 0, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Utvisning först efter avtjänat straff", scores: { sd: 0, afs: 0, m: 1, kd: 1, med: 0, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } },
        { label: "Utvisning så fort det är juridiskt möjligt", scores: { sd: 2, afs: 2, m: 2, kd: 1, med: 2, l: 1, c: 0, s: -1, mp: -2, v: -2, nyans: -1 } }
      ]
    },
    {
      id: "q-c9c6",
      text: "Hur generös bör rätten vara för den som fått uppehållstillstånd att ta hit sina anhöriga ([[familjeåterförening]])?",
      options: [
        { label: "Generös", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Mycket restriktiv", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "Måttlig", scores: { sd: 0, afs: 0, m: 1, kd: 1, med: 0, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } }
      ]
    }
  ],

  s: [
    {
      id: "q-fd8a",
      text: "Bör skatten på höga inkomster höjas för att finansiera mer välfärd?",
      options: [
        { label: "Ja, tydligt", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: -1, med: -2, afs: -2 } },
        { label: "Nej, skatten är redan hög nog", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "Bara marginellt", scores: { s: 1, v: 1, mp: 1, nyans: 0, c: 1, l: 0, m: -1, kd: 0, sd: 0, med: -1, afs: 0 } }
      ]
    },
    {
      id: "q-ea2a",
      text: "Hur viktig är den svenska modellen med starka fackförbund och kollektivavtal?",
      options: [
        { label: "Mycket viktig, den ska stärkas", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -1, kd: 0, sd: 0, med: -2, afs: -1 } },
        { label: "Den fungerar men behöver moderniseras", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 0, afs: 0 } },
        { label: "Den är föråldrad och begränsar företagen", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 0, sd: 0, med: 2, afs: 1 } }
      ]
    },
    {
      id: "q-8f0b",
      text: "Bör vinster i välfärden (skola, vård, omsorg) begränsas kraftigt eller förbjudas?",
      options: [
        { label: "Ja, vinster bör förbjudas eller kraftigt begränsas", scores: { s: 2, v: 2, mp: 2, nyans: 1, c: -1, l: -1, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Nej, valfrihet och konkurrens är bra", scores: { s: -2, v: -2, mp: -2, nyans: -1, c: 1, l: 2, m: 2, kd: 1, sd: 0, med: 2, afs: 0 } },
        { label: "Vinster är okej om kvaliteten är hög", scores: { s: 0, v: -1, mp: 0, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 1, afs: 1 } }
      ]
    },
    {
      id: "q-39eb",
      text: "Hur generös bör [[a-kassan]] och sjukförsäkringen vara?",
      options: [
        { label: "Högre ersättningsnivåer än idag", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: -1, med: -2, afs: -1 } },
        { label: "Nuvarande nivå är ungefär lagom", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } },
        { label: "Lägre ersättning och mer krav på aktivitet", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } }
      ]
    },
    {
      id: "q-ab58",
      text: "Bör staten ta ett större ansvar för att skapa jobb i områden med hög arbetslöshet?",
      options: [
        { label: "Ja, genom offentliga investeringar och subventionerade jobb", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: 0, m: -1, kd: 0, sd: 0, med: -2, afs: -1 } },
        { label: "Nej, marknaden och sänkta skatter är bättre", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "En blandning av båda", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-f8c2",
      text: "Hur ska Sverige hantera klimatet – hur högt ska priset på utsläpp vara?",
      options: [
        { label: "Högre än idag, även om det kostar jobb på kort sikt", scores: { s: 1, v: 1, mp: 2, nyans: 0, c: 1, l: 1, m: 0, kd: 0, sd: -1, med: -1, afs: -2 } },
        { label: "Nuvarande nivå är lagom", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 0, afs: 0 } },
        { label: "Lägre – konkurrenskraft och jobb är viktigare just nu", scores: { s: -1, v: -1, mp: -2, nyans: 0, c: 0, l: 0, m: 1, kd: 1, sd: 2, med: 2, afs: 2 } }
      ]
    },
    {
      id: "q-fbbd",
      text: "Bör det vara lättare eller svårare att säga upp anställda?",
      options: [
        { label: "Svårare – anställningstryggheten ska stärkas", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: -1, l: -1, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Lättare – företagen behöver mer flexibilitet", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 1, l: 1, m: 2, kd: 1, sd: 0, med: 2, afs: 1 } },
        { label: "Nuvarande balans är ungefär rätt", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-f294",
      text: "Hur mycket ska staten styra över boendet ([[hyresreglering]], byggkrav, bostadsbidrag)?",
      options: [
        { label: "Mer styrning för att hålla hyror nere och bygga mer hyresrätter", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Mindre styrning – marknaden ska styra mer", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 1, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "En blandning", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      id: "q-1815",
      text: "Bör föräldraledigheten vara mer jämnt delad mellan mammor och pappor (mer öronmärkta månader)?",
      options: [
        { label: "Ja, mer ska vara öronmärkt för respektive förälder", scores: { s: 2, v: 1, mp: 2, nyans: 0, c: 1, l: 1, m: 0, kd: -1, sd: -1, med: 0, afs: -2 } },
        { label: "Nej, familjerna ska få bestämma själva", scores: { s: -1, v: -1, mp: -1, nyans: 0, c: 0, l: 0, m: 1, kd: 2, sd: 2, med: 1, afs: 2 } },
        { label: "Nuvarande nivå är lagom", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 1, afs: 0 } }
      ]
    },
    {
      id: "q-7d9e",
      text: "Hur viktigt är det att behålla och utveckla den generella välfärden (samma system för alla) istället för mer [[behovsprövade bidrag]]?",
      options: [
        { label: "Mycket viktigt – generella system skapar sammanhållning", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: 0, m: -1, kd: 0, sd: 0, med: -1, afs: -1 } },
        { label: "Mer behovsprövning är bättre – pengarna ska gå till dem som verkligen behöver", scores: { s: -1, v: -1, mp: 0, nyans: 0, c: 1, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "En blandning av båda", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    }
  ],

  m: [
    {
      id: "q-bb3c",
      text: "Bör skatten på arbete sänkas även om det innebär att vissa välfärdstjänster får mindre pengar på kort sikt?",
      options: [
        { label: "Ja, tydligt", scores: { m: 2, med: 2, l: 1, kd: 1, c: 1, sd: 1, afs: 0, s: -2, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, välfärden måste gå före", scores: { m: -2, med: -2, l: -1, kd: -1, c: 0, sd: -1, afs: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "Bara marginellt", scores: { m: 1, med: 1, l: 1, kd: 1, c: 1, sd: 0, afs: 0, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-1538",
      text: "Hur ska Sverige främst säkra elproduktionen de kommande 20 åren?",
      options: [
        { label: "Bygga ut kärnkraft kraftigt", scores: { m: 2, kd: 2, sd: 2, med: 2, afs: 1, l: 1, c: 0, s: 0, v: -2, mp: -2, nyans: 0 } },
        { label: "Främst vind, sol och lagring", scores: { m: -2, kd: -1, sd: -2, med: -2, afs: -2, l: 0, c: 1, s: 1, v: 1, mp: 2, nyans: 0 } },
        { label: "En blandning där kärnkraft behålls och kompletteras", scores: { m: 1, kd: 1, sd: 1, med: 1, afs: 0, l: 1, c: 1, s: 1, v: 0, mp: -1, nyans: 0 } }
      ]
    },
    {
      id: "q-f8aa",
      text: "Bör det vara tillåtet att göra vinst i friskolor så länge kvaliteten är hög?",
      options: [
        { label: "Ja", scores: { m: 2, l: 2, c: 1, med: 2, kd: 1, sd: 0, afs: 0, s: -2, v: -2, mp: -2, nyans: -1 } },
        { label: "Nej, vinster bör förbjudas", scores: { m: -2, l: -2, c: -1, med: -2, kd: -1, sd: 0, afs: 0, s: 2, v: 2, mp: 2, nyans: 1 } },
        { label: "Ja, men med tydliga kvalitetskrav och begränsningar", scores: { m: 1, l: 1, c: 1, med: 0, kd: 1, sd: 1, afs: 0, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-64b4",
      text: "En person döms för grovt våldsbrott för tredje gången. Vad bör minimistraffet vara?",
      options: [
        { label: "2 år", scores: { m: -2, sd: -2, kd: -1, med: -2, afs: -2, l: -1, c: 0, s: 1, v: 2, mp: 1, nyans: 1 } },
        { label: "4 år", scores: { m: 0, sd: -1, kd: 0, med: 0, afs: -1, l: 0, c: 1, s: 1, v: 1, mp: 1, nyans: 1 } },
        { label: "8 år", scores: { m: 2, sd: 2, kd: 2, med: 2, afs: 2, l: 1, c: 0, s: -1, v: -2, mp: -1, nyans: -1 } },
        { label: "12 år eller mer", scores: { m: 1, sd: 2, kd: 1, med: 2, afs: 2, l: 0, c: -1, s: -2, v: -2, mp: -2, nyans: -1 } }
      ]
    },
    {
      id: "q-4021",
      text: "Bör det krävas att den som får uppehållstillstånd snabbare kommer i arbete, annars riskerar tillståndet att påverkas?",
      options: [
        { label: "Ja, tydliga krav och konsekvenser", scores: { m: 2, sd: 2, kd: 1, med: 2, afs: 2, l: 1, c: 0, s: -1, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, det bör inte kopplas till uppehållstillståndet", scores: { m: -2, sd: -2, kd: -1, med: -2, afs: -2, l: 0, c: 0, s: 1, v: 2, mp: 1, nyans: 1 } },
        { label: "Krav på aktivitet, men utan att dra in tillståndet lättvindigt", scores: { m: 1, sd: 0, kd: 1, med: 1, afs: 0, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-7671",
      text: "Om Sverige måste välja: vad prioriterar du främst de kommande åren?",
      options: [
        { label: "Starkare försvar, även om det betyder högre skatt eller mindre till annat", scores: { m: 2, kd: 2, sd: 2, med: 1, afs: 1, l: 1, c: 1, s: 1, v: -1, mp: -1, nyans: 0 } },
        { label: "Lägre skatt och mer fokus på ekonomi och jobb", scores: { m: 1, med: 2, l: 1, c: 1, kd: 0, sd: 0, afs: 0, s: -1, v: -2, mp: -1, nyans: 0 } },
        { label: "Mer till vård, skola och socialt stöd", scores: { m: -1, kd: 0, sd: 0, med: -1, afs: 0, l: 0, c: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "Ungefär som nu – ingen stor förändring", scores: { m: 0, kd: 0, sd: 0, med: 0, afs: 0, l: 0, c: 0, s: 1, v: 1, mp: 1, nyans: 0 } }
      ]
    },
    {
      id: "q-66c8",
      text: "Bör det bli enklare att starta och driva företag genom att minska regler och tillståndskrav?",
      options: [
        { label: "Ja, kraftigt", scores: { m: 2, med: 2, l: 1, c: 1, kd: 1, sd: 1, afs: 1, s: -1, v: -2, mp: -1, nyans: 0 } },
        { label: "Nej, reglerna behövs för miljö, arbetsmiljö och rättvisa", scores: { m: -2, med: -2, l: -1, c: 0, kd: -1, sd: -1, afs: -1, s: 1, v: 2, mp: 2, nyans: 1 } },
        { label: "Ja, men med behållna skydd för miljö och anställda", scores: { m: 1, med: 1, l: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-3d14",
      text: "[[Hyresregleringen]] ([[bruksvärdessystemet]]) bör:",
      options: [
        { label: "Avskaffas eller kraftigt luckras upp", scores: { m: 2, med: 2, l: 1, c: 1, kd: 0, sd: 0, afs: 0, s: -2, v: -2, mp: -1, nyans: -1 } },
        { label: "Behållas ungefär som idag", scores: { m: -1, med: -1, l: 0, c: 0, kd: 0, sd: 0, afs: 0, s: 1, v: 1, mp: 1, nyans: 1 } },
        { label: "Behållas men moderniseras", scores: { m: 1, med: 0, l: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-37f9",
      text: "Bör det bli lättare för arbetsgivare att anställa på prov och säga upp vid arbetsbrist?",
      options: [
        { label: "Ja", scores: { m: 2, med: 2, l: 1, c: 1, kd: 1, sd: 0, afs: 0, s: -2, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, anställningsskyddet ska vara starkt", scores: { m: -2, med: -2, l: -1, c: -1, kd: -1, sd: 0, afs: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "Något enklare än idag, men med skydd kvar", scores: { m: 1, med: 1, l: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-3a93",
      text: "När elpriserna är höga, vad bör staten prioritera?",
      options: [
        { label: "Långsiktig utbyggnad av planerbar el (t.ex. kärnkraft)", scores: { m: 2, kd: 2, sd: 2, med: 2, afs: 1, l: 1, c: 0, s: 0, v: -1, mp: -2, nyans: 0 } },
        { label: "Stöd till hushåll och mer förnybart", scores: { m: -1, kd: 0, sd: -1, med: -1, afs: -1, l: 0, c: 1, s: 2, v: 1, mp: 2, nyans: 1 } },
        { label: "Både utbyggnad av planerbar el och tillfälliga stöd", scores: { m: 1, kd: 1, sd: 1, med: 1, afs: 0, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    }
  ]
};
