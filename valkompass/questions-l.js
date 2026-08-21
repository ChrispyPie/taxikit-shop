window.partyQuestions = window.partyQuestions || {};
Object.assign(window.partyQuestions, {
  l: [
    {
      id: "q-l01",
      text: "Hur viktig är individens frihet jämfört med kollektivets beslut?",
      options: [
        { label: "Individens frihet ska väga tyngst", scores: { l: 2, med: 2, m: 1, c: 1, kd: 0, sd: 0, afs: 0, s: -1, v: -2, mp: 0, nyans: 0 } },
        { label: "Kollektivet och gemensamma beslut är viktigare", scores: { l: -2, med: -2, m: -1, c: 0, kd: 0, sd: 0, afs: 0, s: 2, v: 2, mp: 1, nyans: 1 } },
        { label: "En balans mellan båda", scores: { l: 1, med: 0, m: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 1, nyans: 0 } }
      ]
    },
    {
      id: "q-l02",
      text: "Bör skolan fokusera mer på kunskap och betyg än på elevens välmående och sociala mål?",
      options: [
        { label: "Ja, mer kunskap och tydliga krav", scores: { l: 2, m: 2, kd: 1, med: 1, sd: 1, c: 1, s: 0, v: -1, mp: -1, afs: 1, nyans: 0 } },
        { label: "Nej, välmående och inkludering är lika viktigt", scores: { l: -1, m: -1, kd: 0, med: -1, sd: 0, c: 0, s: 1, v: 2, mp: 2, afs: 0, nyans: 1 } },
        { label: "Båda behövs i ungefär samma utsträckning", scores: { l: 1, m: 1, kd: 1, med: 0, sd: 1, c: 1, s: 1, v: 0, mp: 0, afs: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-l03",
      text: "Hur viktigt är det att Sverige stannar i EU?",
      options: [
        { label: "Mycket viktigt", scores: { l: 2, c: 2, m: 1, s: 1, mp: 1, kd: 1, v: 0, nyans: 0, sd: -2, med: -1, afs: -2 } },
        { label: "Vi bör lämna eller kraftigt minska samarbetet", scores: { l: -2, c: -2, m: -1, s: -1, mp: -1, kd: -1, v: 0, nyans: 0, sd: 2, med: 1, afs: 2 } },
        { label: "Stanna, men flytta tillbaka mer makt till Sverige", scores: { l: 0, c: 0, m: 1, s: 0, mp: 0, kd: 1, v: 0, nyans: 0, sd: 1, med: 1, afs: 1 } }
      ]
    },
    {
      id: "q-l04",
      text: "Bör det krävas godkänd svenska och egen försörjning för [[permanent uppehållstillstånd]]?",
      options: [
        { label: "Ja, tydliga krav", scores: { l: 2, m: 2, kd: 1, med: 2, sd: 2, afs: 2, c: 1, s: 0, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, det bör inte krävas", scores: { l: -2, m: -1, kd: -1, med: -2, sd: -2, afs: -2, c: 0, s: 1, v: 2, mp: 2, nyans: 1 } },
        { label: "Krav på språk, men mer flexibelt kring försörjning", scores: { l: 1, m: 1, kd: 1, med: 0, sd: 0, afs: -1, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-l05",
      text: "Bör vinster i friskolor tillåtas så länge kvaliteten är hög?",
      options: [
        { label: "Ja", scores: { l: 2, m: 2, c: 2, med: 2, kd: 1, sd: 0, afs: 0, s: -2, v: -2, mp: -2, nyans: -1 } },
        { label: "Nej, vinster bör förbjudas", scores: { l: -2, m: -2, c: -1, med: -2, kd: -1, sd: 0, afs: 0, s: 2, v: 2, mp: 2, nyans: 1 } },
        { label: "Ja, men med tydliga kvalitetskrav och begränsningar", scores: { l: 1, m: 1, c: 1, med: 0, kd: 1, sd: 1, afs: 0, s: 0, v: -1, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-l06",
      text: "Hur ska Sverige se på HBTQ-personers rättigheter?",
      options: [
        { label: "Stärka och skydda dem tydligt i lag", scores: { l: 2, mp: 2, v: 1, s: 1, c: 1, m: 0, kd: -1, sd: -1, med: 0, afs: -2, nyans: 0 } },
        { label: "Nuvarande nivå räcker, ingen särskild förstärkning", scores: { l: 0, mp: 0, v: 0, s: 0, c: 0, m: 1, kd: 1, sd: 1, med: 1, afs: 1, nyans: 0 } },
        { label: "För mycket fokus – biologiskt kön bör väga tyngre i vissa frågor", scores: { l: -1, mp: -2, v: -2, s: -1, c: 0, m: 1, kd: 2, sd: 2, med: 1, afs: 2, nyans: 0 } }
      ]
    },
    {
      id: "q-l07",
      text: "Bör det bli enklare att starta företag och anställa genom färre regler?",
      options: [
        { label: "Ja, kraftigt", scores: { l: 2, m: 2, med: 2, c: 1, kd: 1, sd: 1, afs: 1, s: -1, v: -2, mp: -1, nyans: 0 } },
        { label: "Nej, reglerna behövs för anställda och miljö", scores: { l: -2, m: -2, med: -2, c: 0, kd: -1, sd: -1, afs: -1, s: 1, v: 2, mp: 2, nyans: 1 } },
        { label: "Ja, men med behållna skydd", scores: { l: 1, m: 1, med: 1, c: 1, kd: 1, sd: 1, afs: 0, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-l08",
      text: "Hur viktig är kärnkraften för Sveriges elförsörjning?",
      options: [
        { label: "Mycket viktig – den bör byggas ut", scores: { l: 2, m: 2, kd: 2, sd: 2, med: 2, afs: 1, c: 1, s: 0, v: -2, mp: -2, nyans: 0 } },
        { label: "Fasa ut till förmån för förnybart", scores: { l: -1, m: -2, kd: -1, sd: -2, med: -2, afs: -2, c: -1, s: 1, v: 1, mp: 2, nyans: 0 } },
        { label: "Behåll och komplettera med förnybart", scores: { l: 1, m: 1, kd: 1, sd: 1, med: 1, afs: 0, c: 2, s: 1, v: 0, mp: -1, nyans: 0 } }
      ]
    },
    {
      id: "q-l09",
      text: "Bör straffen för våldsbrott skärpas?",
      options: [
        { label: "Ja, tydligt", scores: { l: 1, m: 2, kd: 2, sd: 2, med: 2, afs: 2, c: 0, s: 0, v: -2, mp: -1, nyans: -1 } },
        { label: "Nej, mer fokus på rehabilitering", scores: { l: 0, m: -1, kd: -1, sd: -2, med: -2, afs: -2, c: 0, s: 1, v: 2, mp: 1, nyans: 1 } },
        { label: "Viss skärpning, särskilt vid upprepade brott", scores: { l: 2, m: 1, kd: 1, sd: 1, med: 1, afs: 0, c: 1, s: 1, v: 0, mp: 0, nyans: 0 } }
      ]
    },
    {
      id: "q-l10",
      text: "Hur generös bör arbetskraftsinvandringen vara för yrken med brist?",
      options: [
        { label: "Generös – Sverige behöver kompetensen", scores: { l: 2, c: 2, m: 1, med: 1, s: 0, mp: 1, v: 0, nyans: 1, kd: 0, sd: -2, afs: -2 } },
        { label: "Restriktiv – fokusera på dem som redan bor här", scores: { l: -1, c: -2, m: 0, med: 0, s: 1, mp: 0, v: 1, nyans: 0, kd: 1, sd: 2, afs: 2 } },
        { label: "Ja, men med tydliga krav på lön och villkor", scores: { l: 1, c: 1, m: 1, med: 1, s: 1, mp: 1, v: 0, nyans: 0, kd: 1, sd: 0, afs: -1 } }
      ]
    }
  ]
});
