// Frågebanker per parti
// Lägg till fler partier här när vi bygger ut testet

const partyQuestions = {
  sd: [
    {
      text: "En person kör rattfull och dödar en annan människa. Vad bör minimistraffet vara?",
      options: [
        { label: "4 år", scores: { sd: -1, afs: -1, m: 0, kd: 0, med: 0, l: 1, c: 1, s: 1, mp: 1, v: 1, nyans: 1 } },
        { label: "8 år eller mer", scores: { sd: 2, afs: 2, m: 2, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "2 år", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -1, l: 0, c: 0, s: 1, mp: 1, v: 2, nyans: 1 } },
        { label: "6 år", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 0, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } }
      ]
    },
    {
      text: "En asylsökande reser tillbaka till det land hen säger sig ha flytt från medan ansökan prövas. Vad bör hända?",
      options: [
        { label: "Det bör vägas in negativt", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } },
        { label: "Det ska inte påverka", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Ansökan ska avslås", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } }
      ]
    },
    {
      text: "En person som fått svenskt medborgarskap begår grova våldsbrott. Bör medborgarskapet kunna återkallas?",
      options: [
        { label: "Nej", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Ja, vid allvarliga våldsbrott", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "Ja, men bara i extrema fall", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } }
      ]
    },
    {
      text: "När vårdköerna är långa, vem bör prioriteras först?",
      options: [
        { label: "Alla lika", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -1, l: 1, c: 1, s: 2, mp: 2, v: 2, nyans: 1 } },
        { label: "Svenska medborgare", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 1, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "De som bott längst i Sverige", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 0, c: 0, s: 0, mp: -1, v: -1, nyans: 0 } }
      ]
    },
    {
      text: "Bör det krävas godkänd svenska för att få permanent uppehållstillstånd?",
      options: [
        { label: "Ja, men lågt krav", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } },
        { label: "Nej", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: -1, c: 0, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Ja, relativt högt krav", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 1, c: 0, s: -1, mp: -2, v: -2, nyans: -1 } }
      ]
    },
    {
      text: "Ekonomiska bidrag till nyanlända jämfört med en låginkomsttagare som arbetat länge i Sverige bör vara:",
      options: [
        { label: "Högre under en etableringsperiod", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Tydligt lägre", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "Ungefär samma", scores: { sd: 0, afs: -1, m: 0, kd: 0, med: 0, l: 1, c: 1, s: 1, mp: 1, v: 1, nyans: 1 } }
      ]
    },
    {
      text: "Bör det vara tillåtet att bygga moskéer som finansieras av stater som Saudiarabien, Qatar eller Turkiet?",
      options: [
        { label: "Ja, fritt", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 1, v: 1, nyans: 2 } },
        { label: "Nej", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -1, v: -1, nyans: -2 } },
        { label: "Ja, men med stränga krav på öppenhet", scores: { sd: 0, afs: -1, m: 1, kd: 1, med: 0, l: 1, c: 1, s: 1, mp: 1, v: 1, nyans: 0 } }
      ]
    },
    {
      text: "Bör skolan aktivt främja svenska traditioner och högtider (jul, midsommar, påsk) även när det finns elever från andra kulturer?",
      options: [
        { label: "I viss mån", scores: { sd: 1, afs: 1, m: 1, kd: 1, med: 1, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } },
        { label: "Nej, skolan ska vara neutral", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -1, l: 0, c: 0, s: 0, mp: 2, v: 1, nyans: 1 } },
        { label: "Ja, det bör vara självklart", scores: { sd: 2, afs: 2, m: 1, kd: 2, med: 1, l: 0, c: 0, s: 0, mp: -2, v: -1, nyans: -1 } }
      ]
    },
    {
      text: "En person utan svenskt medborgarskap är aktiv i ett kriminellt nätverk. Vad bör vara huvudregeln?",
      options: [
        { label: "Behandling och rehabilitering i Sverige", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 0, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Utvisning först efter avtjänat straff", scores: { sd: 0, afs: 0, m: 1, kd: 1, med: 0, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } },
        { label: "Utvisning så fort det är juridiskt möjligt", scores: { sd: 2, afs: 2, m: 2, kd: 1, med: 2, l: 1, c: 0, s: -1, mp: -2, v: -2, nyans: -1 } }
      ]
    },
    {
      text: "Hur generös bör rätten vara för den som fått uppehållstillstånd att ta hit sina anhöriga (familjeåterförening)?",
      options: [
        { label: "Generös", scores: { sd: -2, afs: -2, m: -1, kd: -1, med: -2, l: 0, c: 1, s: 1, mp: 2, v: 2, nyans: 1 } },
        { label: "Mycket restriktiv", scores: { sd: 2, afs: 2, m: 1, kd: 1, med: 2, l: 0, c: -1, s: -1, mp: -2, v: -2, nyans: -1 } },
        { label: "Måttlig", scores: { sd: 0, afs: 0, m: 1, kd: 1, med: 0, l: 1, c: 1, s: 1, mp: 0, v: 0, nyans: 0 } }
      ]
    }
  ],

  s: [
    {
      text: "Bör skatten på höga inkomster höjas för att finansiera mer välfärd?",
      options: [
        { label: "Ja, tydligt", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: -1, med: -2, afs: -2 } },
        { label: "Nej, skatten är redan hög nog", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "Bara marginellt", scores: { s: 1, v: 1, mp: 1, nyans: 0, c: 1, l: 0, m: -1, kd: 0, sd: 0, med: -1, afs: 0 } }
      ]
    },
    {
      text: "Hur viktig är den svenska modellen med starka fackförbund och kollektivavtal?",
      options: [
        { label: "Mycket viktig, den ska stärkas", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -1, kd: 0, sd: 0, med: -2, afs: -1 } },
        { label: "Den fungerar men behöver moderniseras", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 0, afs: 0 } },
        { label: "Den är föråldrad och begränsar företagen", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 0, sd: 0, med: 2, afs: 1 } }
      ]
    },
    {
      text: "Bör vinster i välfärden (skola, vård, omsorg) begränsas kraftigt eller förbjudas?",
      options: [
        { label: "Ja, vinster bör förbjudas eller kraftigt begränsas", scores: { s: 2, v: 2, mp: 2, nyans: 1, c: -1, l: -1, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Nej, valfrihet och konkurrens är bra", scores: { s: -2, v: -2, mp: -2, nyans: -1, c: 1, l: 2, m: 2, kd: 1, sd: 0, med: 2, afs: 0 } },
        { label: "Vinster är okej om kvaliteten är hög", scores: { s: 0, v: -1, mp: 0, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 1, afs: 1 } }
      ]
    },
    {
      text: "Hur generös bör a-kassan och sjukförsäkringen vara?",
      options: [
        { label: "Högre ersättningsnivåer än idag", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: -1, med: -2, afs: -1 } },
        { label: "Nuvarande nivå är ungefär lagom", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } },
        { label: "Lägre ersättning och mer krav på aktivitet", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } }
      ]
    },
    {
      text: "Bör staten ta ett större ansvar för att skapa jobb i områden med hög arbetslöshet?",
      options: [
        { label: "Ja, genom offentliga investeringar och subventionerade jobb", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: 0, m: -1, kd: 0, sd: 0, med: -2, afs: -1 } },
        { label: "Nej, marknaden och sänkta skatter är bättre", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 0, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "En blandning av båda", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      text: "Hur ska Sverige hantera klimatet – hur högt ska priset på utsläpp vara?",
      options: [
        { label: "Högre än idag, även om det kostar jobb på kort sikt", scores: { s: 1, v: 1, mp: 2, nyans: 0, c: 1, l: 1, m: 0, kd: 0, sd: -1, med: -1, afs: -2 } },
        { label: "Nuvarande nivå är lagom", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 0, afs: 0 } },
        { label: "Lägre – konkurrenskraft och jobb är viktigare just nu", scores: { s: -1, v: -1, mp: -2, nyans: 0, c: 0, l: 0, m: 1, kd: 1, sd: 2, med: 2, afs: 2 } }
      ]
    },
    {
      text: "Bör det vara lättare eller svårare att säga upp anställda?",
      options: [
        { label: "Svårare – anställningstryggheten ska stärkas", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: -1, l: -1, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Lättare – företagen behöver mer flexibilitet", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 1, l: 1, m: 2, kd: 1, sd: 0, med: 2, afs: 1 } },
        { label: "Nuvarande balans är ungefär rätt", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      text: "Hur mycket ska staten styra över boendet (hyresreglering, byggkrav, bostadsbidrag)?",
      options: [
        { label: "Mer styrning för att hålla hyror nere och bygga mer hyresrätter", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: -1, m: -2, kd: -1, sd: 0, med: -2, afs: 0 } },
        { label: "Mindre styrning – marknaden ska styra mer", scores: { s: -2, v: -2, mp: -1, nyans: -1, c: 1, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "En blandning", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    },
    {
      text: "Bör föräldraledigheten vara mer jämnt delad mellan mammor och pappor (mer öronmärkta månader)?",
      options: [
        { label: "Ja, mer ska vara öronmärkt för respektive förälder", scores: { s: 2, v: 1, mp: 2, nyans: 0, c: 1, l: 1, m: 0, kd: -1, sd: -1, med: 0, afs: -2 } },
        { label: "Nej, familjerna ska få bestämma själva", scores: { s: -1, v: -1, mp: -1, nyans: 0, c: 0, l: 0, m: 1, kd: 2, sd: 2, med: 1, afs: 2 } },
        { label: "Nuvarande nivå är lagom", scores: { s: 1, v: 0, mp: 0, nyans: 0, c: 1, l: 1, m: 1, kd: 1, sd: 1, med: 1, afs: 0 } }
      ]
    },
    {
      text: "Hur viktigt är det att behålla och utveckla den generella välfärden (samma system för alla) istället för mer behovsprövade bidrag?",
      options: [
        { label: "Mycket viktigt – generella system skapar sammanhållning", scores: { s: 2, v: 2, mp: 1, nyans: 1, c: 0, l: 0, m: -1, kd: 0, sd: 0, med: -1, afs: -1 } },
        { label: "Mer behovsprövning är bättre – pengarna ska gå till dem som verkligen behöver", scores: { s: -1, v: -1, mp: 0, nyans: 0, c: 1, l: 1, m: 2, kd: 1, sd: 1, med: 2, afs: 1 } },
        { label: "En blandning av båda", scores: { s: 1, v: 0, mp: 1, nyans: 0, c: 1, l: 1, m: 0, kd: 1, sd: 1, med: 0, afs: 0 } }
      ]
    }
  ]
};
