window.partyQuestions = window.partyQuestions || {};
Object.assign(window.partyQuestions, {
  med: [
    {
      id: "q-med01",
      text: "Bör skatten på arbete och företag sänkas tydligt?",
      options: [
        { label: "Ja", scores: { med: 2, m: 2, l: 1, c: 1, kd: 1, sd: 1, afs: 0, s: -2, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, välfärden behöver pengarna", scores: { med: -2, m: -2, l: -1, c: -1, kd: -1, sd: -1, afs: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "Bara marginellt", scores: { med: 1, m: 1, l: 1, c: 1, kd: 1, sd: 0, afs: 0, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med02",
      text: "Hur mycket ska staten styra marknaden och företagen?",
      options: [
        { label: "Så lite som möjligt – fri marknad", scores: { med: 2, m: 1, l: 1, c: 1, kd: 0, sd: 0, afs: 0, s: -2, v: -2, mp: -1, nyans: 0 } },
        { label: "Staten ska styra mer för rättvisa och miljö", scores: { med: -2, m: -1, l: -1, c: 0, kd: 0, sd: 0, afs: 0, s: 2, v: 2, mp: 2, nyans: 1 } },
        { label: "Viss reglering behövs, men inte för mycket", scores: { med: 0, m: 1, l: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med03",
      text: "Bör invandringen begränsas till personer som kan försörja sig och följa svenska lagar?",
      options: [
        { label: "Ja, tydligt", scores: { med: 2, sd: 2, m: 1, afs: 2, kd: 1, l: 1, c: 0, s: -1, v: -2, mp: -2, nyans: -1 } },
        { label: "Nej, mer generös asyl och anhöriginvandring", scores: { med: -2, sd: -2, m: -1, afs: -2, kd: -1, l: 0, c: 1, s: 1, v: 2, mp: 2, nyans: 2 } },
        { label: "Begränsning, men humanitära undantag kvar", scores: { med: 1, sd: 0, m: 1, afs: -1, kd: 1, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med04",
      text: "Hur viktigt är det att motverka identitetspolitik och särbehandling utifrån grupp?",
      options: [
        { label: "Mycket viktigt – individen, inte gruppen", scores: { med: 2, l: 1, m: 1, sd: 1, afs: 1, kd: 0, c: 0, s: -1, v: -2, mp: -1, nyans: -2 } },
        { label: "Grupper behöver särskilda rättigheter och stöd", scores: { med: -2, l: 0, m: -1, sd: -1, afs: -2, kd: 0, c: 0, s: 1, v: 2, mp: 1, nyans: 2 } },
        { label: "Viss hänsyn till grupper, men inte särlagar", scores: { med: 0, l: 1, m: 1, sd: 0, afs: -1, kd: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med05",
      text: "Bör Sverige bygga ut kärnkraften?",
      options: [
        { label: "Ja, kraftigt", scores: { med: 2, m: 2, kd: 2, sd: 2, l: 2, afs: 1, c: 1, s: 0, v: -2, mp: -2, nyans: 0 } },
        { label: "Nej, fokusera på förnybart", scores: { med: -2, m: -2, kd: -1, sd: -2, l: -1, afs: -2, c: -1, s: 1, v: 1, mp: 2, nyans: 0 } },
        { label: "Behåll och komplettera", scores: { med: 1, m: 1, kd: 1, sd: 1, l: 1, afs: 0, c: 2, s: 1, v: 0, mp: -1, nyans: 0 } }
      ]
    },
    {
      id: "q-med06",
      text: "Hur ska Sverige förhålla sig till EU?",
      options: [
        { label: "Minska Bryssels makt kraftigt eller lämna", scores: { med: 2, sd: 2, afs: 2, m: 0, kd: 0, l: -2, c: -2, s: -1, v: 0, mp: -1, nyans: 0 } },
        { label: "Stanna och fördjupa samarbetet", scores: { med: -2, sd: -2, afs: -2, m: 1, kd: 1, l: 2, c: 2, s: 1, v: 0, mp: 1, nyans: 0 } },
        { label: "Stanna, men flytta tillbaka mer makt till Sverige", scores: { med: 1, sd: 1, afs: 1, m: 1, kd: 1, l: 0, c: 0, s: 0, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med07",
      text: "Bör fackens särställning och [[kollektivavtal]]ens roll minska?",
      options: [
        { label: "Ja – friare avtal mellan arbetsgivare och anställd", scores: { med: 2, m: 1, l: 1, c: 0, kd: 0, sd: 0, afs: 0, s: -2, v: -2, mp: -1, nyans: 0 } },
        { label: "Nej – kollektivavtalen ska stärkas", scores: { med: -2, m: -1, l: -1, c: 0, kd: 0, sd: 0, afs: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "Behåll nuvarande balans", scores: { med: 0, m: 1, l: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med08",
      text: "Hur viktigt är klimatet jämfört med billig energi och jobb?",
      options: [
        { label: "Billig energi och jobb väger tyngre just nu", scores: { med: 2, sd: 2, afs: 2, m: 1, kd: 1, l: 0, c: 0, s: -1, v: -2, mp: -2, nyans: 0 } },
        { label: "Klimatet går före kortsiktiga kostnader", scores: { med: -2, sd: -2, afs: -2, m: 0, kd: 0, l: 1, c: 1, s: 1, v: 2, mp: 2, nyans: 0 } },
        { label: "Båda viktiga – pragmatisk linje", scores: { med: 1, sd: 0, afs: 0, m: 1, kd: 1, l: 1, c: 2, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med09",
      text: "Bör straffen för vålds- och sexualbrott skärpas?",
      options: [
        { label: "Ja, tydligt", scores: { med: 2, sd: 2, m: 2, kd: 2, afs: 2, l: 1, c: 0, s: 0, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, mer rehabilitering", scores: { med: -2, sd: -2, m: -1, kd: -1, afs: -2, l: 0, c: 0, s: 1, v: 2, mp: 1, nyans: 1 } },
        { label: "Viss skärpning", scores: { med: 1, sd: 1, m: 1, kd: 1, afs: 0, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-med10",
      text: "Bör det offentliga fokusera på kärnuppgifter och skära i övrigt?",
      options: [
        { label: "Ja", scores: { med: 2, m: 1, l: 1, c: 0, kd: 0, sd: 1, afs: 1, s: -2, v: -2, mp: -1, nyans: 0 } },
        { label: "Nej, staten ska ha ett brett ansvar", scores: { med: -2, m: -1, l: -1, c: 0, kd: 0, sd: 0, afs: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "Viss effektivisering, men behåll bred välfärd", scores: { med: 0, m: 1, l: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    }
  ],
  afs: [
    {
      id: "q-afs01",
      text: "Bör Sverige aktivt främja återvandring av invandrare som inte integrerats?",
      options: [
        { label: "Ja", scores: { afs: 2, sd: 1, med: 1, m: 0, kd: 0, l: -1, c: -1, s: -2, v: -2, mp: -2, nyans: -2 } },
        { label: "Nej", scores: { afs: -2, sd: -1, med: -1, m: 0, kd: 0, l: 1, c: 1, s: 1, v: 2, mp: 2, nyans: 2 } },
        { label: "Bara för dem som begått brott eller saknar rätt att stanna", scores: { afs: 1, sd: 2, med: 1, m: 1, kd: 1, l: 1, c: 0, s: 0, v: -1, mp: -1, nyans: -1 } }
      ]
    },
    {
      id: "q-afs02",
      text: "Hur generös bör asyl- och invandringspolitiken vara?",
      options: [
        { label: "Minimal – i princip stopp för asylinvandring", scores: { afs: 2, sd: 1, med: 1, m: 0, kd: 0, l: -1, c: -2, s: -2, v: -2, mp: -2, nyans: -2 } },
        { label: "Mer generös än idag", scores: { afs: -2, sd: -2, med: -2, m: -1, kd: -1, l: 0, c: 1, s: 1, v: 2, mp: 2, nyans: 2 } },
        { label: "Tydligt mer restriktiv än idag, men inte totalstopp", scores: { afs: 1, sd: 2, med: 2, m: 1, kd: 1, l: 1, c: 0, s: -1, v: -2, mp: -2, nyans: -1 } }
      ]
    },
    {
      id: "q-afs03",
      text: "Bör byggandet av nya moskéer stoppas eller kraftigt begränsas?",
      options: [
        { label: "Ja", scores: { afs: 2, sd: 1, med: 0, m: 0, kd: 0, l: -1, c: -1, s: -1, v: -2, mp: -1, nyans: -2 } },
        { label: "Nej – religionsfrihet gäller alla", scores: { afs: -2, sd: -1, med: 0, m: 0, kd: 0, l: 1, c: 1, s: 1, v: 1, mp: 1, nyans: 2 } },
        { label: "Begränsa utländsk finansiering, men tillåt i övrigt", scores: { afs: 1, sd: 2, med: 1, m: 1, kd: 1, l: 1, c: 0, s: 0, v: -1, mp: 0, nyans: -1 } }
      ]
    },
    {
      id: "q-afs04",
      text: "Hur viktigt är det att bevara svensk kultur och traditioner i offentligheten?",
      options: [
        { label: "Mycket viktigt – ska prioriteras", scores: { afs: 2, sd: 2, kd: 1, med: 1, m: 0, l: 0, c: 0, s: -1, v: -2, mp: -1, nyans: -2 } },
        { label: "Sverige ska vara mångkulturellt utan särskild svensk prägel", scores: { afs: -2, sd: -2, kd: -1, med: -1, m: 0, l: 1, c: 1, s: 1, v: 2, mp: 1, nyans: 2 } },
        { label: "Viss plats för traditioner, men öppet för andra influenser", scores: { afs: 0, sd: 1, kd: 1, med: 0, m: 1, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-afs05",
      text: "Bör Sverige lämna EU?",
      options: [
        { label: "Ja", scores: { afs: 2, sd: 1, med: 1, m: -1, kd: -1, l: -2, c: -2, s: -1, v: 0, mp: -1, nyans: 0 } },
        { label: "Nej, EU är bra för Sverige", scores: { afs: -2, sd: -2, med: -1, m: 1, kd: 1, l: 2, c: 2, s: 1, v: 0, mp: 1, nyans: 0 } },
        { label: "Stanna men kraftigt minska Bryssels makt", scores: { afs: 1, sd: 2, med: 2, m: 1, kd: 1, l: 0, c: 0, s: 0, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-afs06",
      text: "Hur hårda ska straffen vara för gängrelaterad brottslighet?",
      options: [
        { label: "Mycket hårdare – långa fängelsestraff och utvisning", scores: { afs: 2, sd: 2, med: 2, m: 2, kd: 2, l: 1, c: 0, s: 0, v: -2, mp: -1, nyans: -1 } },
        { label: "Mer fokus på sociala insatser och rehabilitering", scores: { afs: -2, sd: -2, med: -2, m: -1, kd: -1, l: 0, c: 0, s: 1, v: 2, mp: 1, nyans: 1 } },
        { label: "Hårdare straff, men också förebyggande arbete", scores: { afs: 1, sd: 1, med: 1, m: 1, kd: 1, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-afs07",
      text: "Bör medborgarskap kunna återkallas vid allvarlig brottslighet?",
      options: [
        { label: "Ja", scores: { afs: 2, sd: 2, med: 1, m: 1, kd: 1, l: 0, c: 0, s: -1, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej", scores: { afs: -2, sd: -1, med: -1, m: 0, kd: 0, l: 1, c: 1, s: 1, v: 2, mp: 1, nyans: 1 } },
        { label: "Bara i extrema fall och under stränga villkor", scores: { afs: 1, sd: 1, med: 1, m: 1, kd: 1, l: 1, c: 1, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-afs08",
      text: "Hur ska Sverige se på kön och identitet i lag och skola?",
      options: [
        { label: "Biologiskt kön är grunden – stoppa könsbyte för minderåriga", scores: { afs: 2, sd: 2, kd: 2, med: 1, m: 1, c: 0, l: 0, s: -1, v: -2, mp: -2, nyans: -1 } },
        { label: "Stödja den som vill byta kön, även unga", scores: { afs: -2, sd: -2, kd: -2, med: -1, m: -1, c: 0, l: 1, s: 1, v: 2, mp: 2, nyans: 1 } },
        { label: "Försiktig linje med åldersgränser", scores: { afs: 0, sd: 0, kd: 0, med: 0, m: 1, c: 1, l: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-afs09",
      text: "Bör bidrag till invandrare som inte arbetar minskas kraftigt?",
      options: [
        { label: "Ja", scores: { afs: 2, sd: 2, med: 2, m: 1, kd: 1, l: 0, c: -1, s: -2, v: -2, mp: -1, nyans: -2 } },
        { label: "Nej – samma stöd som till alla andra", scores: { afs: -2, sd: -2, med: -2, m: -1, kd: -1, l: 0, c: 0, s: 2, v: 2, mp: 1, nyans: 2 } },
        { label: "Krav på aktivitet och integration, men inte drakoniska nedskärningar", scores: { afs: 0, sd: 1, med: 1, m: 1, kd: 1, l: 1, c: 1, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-afs10",
      text: "Hur ska Sverige hantera kriminalitet kopplad till invandring?",
      options: [
        { label: "Utvisning så fort det är juridiskt möjligt", scores: { afs: 2, sd: 2, med: 1, m: 1, kd: 1, l: 0, c: 0, s: -1, v: -2, mp: -1, nyans: -2 } },
        { label: "Integration och sociala insatser först", scores: { afs: -2, sd: -1, med: -1, m: 0, kd: 0, l: 1, c: 1, s: 1, v: 2, mp: 1, nyans: 2 } },
        { label: "Både hårdare straff/utvisning och bättre integration", scores: { afs: 1, sd: 1, med: 1, m: 1, kd: 1, l: 1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    }
  ],
  nyans: [
    {
      id: "q-ny01",
      text: "Hur generös bör asyl- och anhöriginvandringen vara?",
      options: [
        { label: "Mer generös än idag", scores: { nyans: 2, v: 2, mp: 2, s: 1, c: 1, l: 0, m: -1, kd: -1, med: -2, sd: -2, afs: -2 } },
        { label: "Tydligt mer restriktiv", scores: { nyans: -2, v: -2, mp: -2, s: -1, c: -1, l: 0, m: 1, kd: 1, med: 2, sd: 2, afs: 2 } },
        { label: "Ungefär som idag", scores: { nyans: 0, v: 0, mp: 0, s: 1, c: 1, l: 1, m: 0, kd: 0, med: -1, sd: -1, afs: -1 } }
      ]
    },
    {
      id: "q-ny02",
      text: "Bör det finnas särskilda satsningar mot diskriminering av muslimer och andra minoriteter?",
      options: [
        { label: "Ja, tydligt", scores: { nyans: 2, v: 1, mp: 1, s: 1, c: 0, l: 0, m: -1, kd: 0, med: -2, sd: -2, afs: -2 } },
        { label: "Nej – samma regler för alla, ingen särbehandling", scores: { nyans: -2, v: -1, mp: 0, s: 0, c: 0, l: 1, m: 1, kd: 1, med: 2, sd: 2, afs: 2 } },
        { label: "Bekämpa diskriminering generellt, utan gruppsärskilda lagar", scores: { nyans: 0, v: 1, mp: 1, s: 1, c: 1, l: 1, m: 1, kd: 1, med: 1, sd: 0, afs: -1 } }
      ]
    },
    {
      id: "q-ny03",
      text: "Hur ska Sverige se på religiösa symboler i offentligheten (t.ex. slöja i skola och vård)?",
      options: [
        { label: "Tillåtet – religionsfrihet", scores: { nyans: 2, v: 1, mp: 1, s: 1, c: 1, l: 1, m: 0, kd: 0, med: -1, sd: -2, afs: -2 } },
        { label: "Förbjud i skola, vård och andra offentliga verksamheter", scores: { nyans: -2, v: -1, mp: 0, s: 0, c: 0, l: 0, m: 1, kd: 1, med: 1, sd: 2, afs: 2 } },
        { label: "Tillåtet för vuxna, restriktioner för barn i skolan", scores: { nyans: 0, v: 0, mp: 0, s: 1, c: 1, l: 1, m: 1, kd: 1, med: 1, sd: 1, afs: 0 } }
      ]
    },
    {
      id: "q-ny04",
      text: "Bör polisen och rättsväsendet granskas hårdare för misstänkt rasism?",
      options: [
        { label: "Ja", scores: { nyans: 2, v: 2, mp: 1, s: 1, c: 0, l: 0, m: -1, kd: 0, med: -1, sd: -2, afs: -2 } },
        { label: "Nej – fokusera på att bekämpa brott", scores: { nyans: -2, v: -1, mp: 0, s: 0, c: 0, l: 1, m: 1, kd: 1, med: 1, sd: 2, afs: 2 } },
        { label: "Granska all maktutövning, men utan att försvaga brottsbekämpningen", scores: { nyans: 1, v: 1, mp: 1, s: 1, c: 1, l: 1, m: 1, kd: 1, med: 0, sd: 0, afs: -1 } }
      ]
    },
    {
      id: "q-ny05",
      text: "Hur generös bör [[familjeåterförening]]en vara?",
      options: [
        { label: "Generös", scores: { nyans: 2, v: 2, mp: 2, s: 1, c: 1, l: 1, m: -1, kd: -1, med: -2, sd: -2, afs: -2 } },
        { label: "Mycket restriktiv", scores: { nyans: -2, v: -2, mp: -2, s: -1, c: -1, l: 0, m: 1, kd: 1, med: 2, sd: 2, afs: 2 } },
        { label: "Måttlig – nära anhöriga under tydliga villkor", scores: { nyans: 0, v: 0, mp: 0, s: 1, c: 2, l: 1, m: 1, kd: 1, med: 0, sd: 0, afs: -1 } }
      ]
    },
    {
      id: "q-ny06",
      text: "Bör det bli lättare att få [[permanent uppehållstillstånd]] och medborgarskap?",
      options: [
        { label: "Ja", scores: { nyans: 2, v: 1, mp: 1, s: 1, c: 0, l: 0, m: -1, kd: -1, med: -2, sd: -2, afs: -2 } },
        { label: "Nej – tuffare krav på språk, arbete och skötsamhet", scores: { nyans: -2, v: -1, mp: -1, s: 0, c: 0, l: 1, m: 2, kd: 1, med: 2, sd: 2, afs: 2 } },
        { label: "Nuvarande nivå, men tydligare och snabbare processer", scores: { nyans: 1, v: 1, mp: 1, s: 1, c: 1, l: 1, m: 0, kd: 0, med: 0, sd: -1, afs: -1 } }
      ]
    },
    {
      id: "q-ny07",
      text: "Hur ska Sverige se på islamofobi som samhällsproblem?",
      options: [
        { label: "Det är ett allvarligt problem som måste bekämpas aktivt", scores: { nyans: 2, v: 1, mp: 1, s: 1, c: 0, l: 0, m: -1, kd: 0, med: -1, sd: -2, afs: -2 } },
        { label: "Begreppet används för att tysta legitima kritik", scores: { nyans: -2, v: -1, mp: 0, s: 0, c: 0, l: 0, m: 1, kd: 1, med: 1, sd: 2, afs: 2 } },
        { label: "Diskriminering ska bekämpas, men kritik av religion måste få finnas", scores: { nyans: 0, v: 1, mp: 1, s: 1, c: 1, l: 1, m: 1, kd: 1, med: 1, sd: 0, afs: -1 } }
      ]
    },
    {
      id: "q-ny08",
      text: "Bör mer resurser gå till utsatta förorter och integration?",
      options: [
        { label: "Ja, tydligt", scores: { nyans: 2, v: 2, s: 2, mp: 1, c: 1, l: 0, m: 0, kd: 0, med: -1, sd: -1, afs: -2 } },
        { label: "Nej – fokusera på krav och ansvar hos individen", scores: { nyans: -2, v: -1, s: -1, mp: 0, c: 0, l: 1, m: 1, kd: 1, med: 2, sd: 2, afs: 2 } },
        { label: "Både mer stöd och tydligare krav", scores: { nyans: 1, v: 1, s: 1, mp: 1, c: 1, l: 1, m: 1, kd: 1, med: 0, sd: 0, afs: -1 } }
      ]
    },
    {
      id: "q-ny09",
      text: "Hur ska Sverige se på halal och religiösa matregler i skola och offentlig verksamhet?",
      options: [
        { label: "Erbjud alternativ – respekt för religion", scores: { nyans: 2, v: 1, mp: 1, s: 1, c: 0, l: 0, m: 0, kd: 0, med: -1, sd: -1, afs: -2 } },
        { label: "Ingen särskild anpassning – samma mat till alla", scores: { nyans: -2, v: 0, mp: 0, s: 0, c: 0, l: 1, m: 1, kd: 1, med: 1, sd: 2, afs: 2 } },
        { label: "Vegetariskt alternativ räcker för de flesta behov", scores: { nyans: 0, v: 1, mp: 1, s: 1, c: 1, l: 1, m: 1, kd: 1, med: 1, sd: 1, afs: 0 } }
      ]
    },
    {
      id: "q-ny10",
      text: "Bör partier som SD och AFS behandlas som vilket annat parti som helst i debatten?",
      options: [
        { label: "Nej – deras politik är farlig och bör motarbetas", scores: { nyans: 2, v: 2, mp: 1, s: 1, c: 0, l: 0, m: -1, kd: 0, med: -1, sd: -2, afs: -2 } },
        { label: "Ja – alla partier ska bemötas i sak", scores: { nyans: -1, v: -1, mp: 0, s: 0, c: 1, l: 1, m: 1, kd: 1, med: 1, sd: 2, afs: 2 } },
        { label: "Saklig kritik är okej, men inte isolering från demokratiska processer", scores: { nyans: 1, v: 1, mp: 1, s: 1, c: 1, l: 1, m: 1, kd: 1, med: 0, sd: 0, afs: -1 } }
      ]
    }
  ]
});
