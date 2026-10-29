/* Nyheter i appen (visas på sidan "Om appen").
 * Lätt att ändra: lägg en ny rad överst i listan för varje dag.
 *   typ: 'Nytt', 'Förbättrat' eller 'Fixat'
 * Texten är vanlig text (ingen HTML). Nyast först.
 * Ny omgång samma dag som redan finns? Lägg en ny dag överst med id: '2026-10-26c' (så får förarna 'Ny' igen).
 * Det förarna senast sett sparas per förare på servern (tabell changelog_seen).
 * Äldre historik (före 24 okt 2026) är återskapad i efterhand och ungefärlig.
 * Vem som ser raden (tredje fältet, valfritt). Utan fält ser alla raden.
 *   'admin' = de som har Admin-rutan (admin, ägare, S admin), t.ex. Admin › Chaufförer och demokonton
 *   'agare' = ägaren (och tillfälligt S admin), t.ex. Åkeridata, Admin › Bil & verkstad, Önskemål och idéer
 *   'flagga:sjuk' = bara de som har funktionsflaggan 'sjuk' (test av nya funktioner, private.feature_flags)
 * Ett fjärde fält (valfritt) är texten som alla andra ser i stället. Utan det ser de inte raden alls.
 * En dag där ingen rad syns för föraren visas inte, och ger ingen prick eller notis.
 * tid (valfritt): klockslaget då raden gick live, svensk tid 'HH:MM', t.ex. tid: '22:48'.
 *   Används i notisflödet ("5 min sedan"). Utan tid visas bara dagen ("i dag", "i går", "12/10").
 */
window.CHANGELOG = [
  { datum: '2026-10-29', id: '2026-10-29k', tid: '19:09', rader: [
    ['Nytt', 'Admin › Bilar: bilbesiktning, plombering av taxametern och alkolås/alkotest. Fyll i när det senast gjordes under Ändra bil och kalkyl. Nästa datum räknas som ett år senare, eller så skriver du in ett eget datum. Du får en notis en månad och en vecka innan, och när datumet har passerat. I listan syns det med orange (snart) eller rött (passerat).', 'agare'],
    ['Nytt', 'Önskemål och idéer: nu kan du lägga till bilder, till exempel ett foto av dina anteckningar. Högst 4 bilder per önskemål. Bara du och Christian ser bilderna.', 'agare']
  ] },
  { datum: '2026-10-29', id: '2026-10-29j', tid: '06:43', rader: [
    ['Förbättrat', 'Admin › Bilar har nya bilder: vita bilar, som i vår flotta. Biltypen Special heter nu Miljöbil (en vit elbil med ett grönt löv) och det finns en ny biltyp, Executive (en svart SUV). Det finns också bilder för Toyota Mirai och Renault Trafic. Står Mirai, Trafic eller Transporter i bilmodellen väljs den bilden av sig själv, men du kan alltid välja en annan. Bilar som hade Special har nu Miljöbil. Kryssrutan Specialfordon finns kvar som förut.', 'agare']
  ] },
  { datum: '2026-10-29', id: '2026-10-29i', tid: '06:12', rader: [
    ['Nytt', 'Ankomster › Tåg: Mina tågnotiser. Välj vilka tåg du alltid vill ha notis om, till exempel snabbtågen från Stockholm, och bara de tider du jobbar, till exempel 17:00–05:00 måndag till fredag. Du får notis före ankomsten (till exempel 20 min före), när tåget blir försenat och om det ställs in. Notiserna kommer även när appen är stängd, om notiser är påslagna. Tåg som matchar får en liten klocka 🔔 i listan.'],
    ['Nytt', 'Admin › Chaufförer › Logg: ändringar i Mina tågnotiser syns under Notiser och bevakningar.', 'admin']
  ] },
  { datum: '2026-10-29', id: '2026-10-29h', tid: '06:07', rader: [
    ['Nytt', 'Admin › Bilar visar nu om varje bil går plus eller minus. Listan har en bild för biltypen, bilnummer, reg.nr och vinst eller förlust i kronor, grönt för plus och rött för minus. Tryck på en bil för att se uträkningen: inkört, förarlön, avgifter, bilkostnader och vinst eller förlust, allt utan moms och för de senaste 12 månaderna. Inkört och körda mil hämtas från resdatan för bilen. Fyll i bilens kostnader under Ändra: inköpspris, livslängd, räntor, skatt, service, försäkring, taxiavgift, tvätt, mil per år och datum för besiktning, plombering och alkotest. Saknas resdata kan du fylla i intäkten själv.', 'agare']
  ] },
  { datum: '2026-10-29', id: '2026-10-29g', tid: '04:24', rader: [
    ['Nytt', 'Test: i listan Förarnas sjukperioder ser du nu alla sjukanmälningar, även dina egna. Då kan du testa både förarens och ägarens sida själv, till exempel godkänna eller begära läkarintyg på din egen. Det här är tillfälligt och tas bort när testet är klart.', 'flagga:sjuk_se_allt']
  ] },
  { datum: '2026-10-29', id: '2026-10-29f', tid: '04:15', rader: [
    ['Nytt', 'Test: Bil & verkstad heter nu Anmälningar & ärenden och har fliken 🤒 Sjuk. Där sjukanmäler du dig, friskanmäler dig och laddar upp läkarintyg. Ägaren får en notis och kan godkänna, begära läkarintyg eller avslå. Appen räknar sjukdagarna och visar vad som gäller dag 1, dag 2–14 och efter dag 14. Bara du, ägaren och S admin ser din sjukanmälan. Just nu syns det här bara för Christian och Berra.', 'flagga:sjuk']
  ] },
  { datum: '2026-10-29', id: '2026-10-29d', tid: '03:51', rader: [
    ['Förbättrat', 'Säkerhet: inloggningar och ändringar loggas nu med IP-adress och enhet, så att missbruk går att utreda. Loggen sparas i 13 månader. Det står också på inloggningssidan och under Om appen.'],
    ['Nytt', 'Admin › Chaufförer › Logg: varje rad visar nu enhet och webbläsare, till exempel Chrome på Android. Ägare och S admin ser också IP-adressen. Tryck på en IP-adress eller enhet för att se allt från den, eller sök i rutan överst.', 'admin']
  ] },
  { datum: '2026-10-29', id: '2026-10-29c', tid: '03:09', rader: [
    ['Fixat', 'Inloggning: säkrare. Huvudlösenordet är borttaget, så bara ditt eget lösenord fungerar för ditt förar-ID. Om förar-ID eller lösenord är fel får alla samma meddelande, så ingen kan se vilka konton som finns.'],
    ['Fixat', 'Glömt lösenord: försök med påhittade förar-ID kan inte längre stoppa riktiga förare från att få en återställningslänk.', 'admin']
  ] },
  { datum: '2026-10-29', id: '2026-10-29b', tid: '02:58', rader: [
    ['Förbättrat', 'Forumet: förar-ID står nu bredvid namnet på inlägg och kommentarer, till exempel Anna S · 179890. Förar-ID står på taxilegitimationen, så det blir lättare att se vem som skrev.'],
    ['Förbättrat', 'Admin › Chaufförer: alla som har Admin-rutan ser nu förnamn och första bokstaven i efternamnet i förarlistan, till exempel Anna S · 179890. Övriga uppgifter visas fortfarande bara för ägaren.', 'admin'],
    ['Nytt', 'Admin › Chaufförer › Logg: loggen visar nu mycket mer. Där står vem som ändrade en förares uppgifter och vilka fält, men inte vad som skrevs. Där syns också utloggningar, forum, kalender, notiser och ny resdata. Överst väljer du vad som ska visas, och valet sparas i telefonen. Längst ner finns knappen Visa fler.', 'admin']
  ] },
  { datum: '2026-10-29', id: '2026-10-29a', tid: '01:30', rader: [
    ['Förbättrat', 'Profil: ditt förar-ID står nu överst i din profil och under ditt namn i profilmenyn, även när du har fyllt i ditt namn.'],
    ['Förbättrat', 'Admin › Chaufförer: förar-ID står nu bredvid namnet i förarlistan, till exempel Anna S · 179890, och överst när du redigerar en förare.', 'admin']
  ] },
  { datum: '2026-10-28', id: '2026-10-28z', tid: '23:33', rader: [
    ['Fixat', 'Notiser: Nyheter i appen visar nu rätt tid, till exempel "5 min sedan", i stället för "11 tim sedan".']
  ] },
  { datum: '2026-10-28', id: '2026-10-28y', tid: '22:48', rader: [
    ['Nytt', 'Om appen: längst ner står nu en copyrightrad, © 2026 Christian Parsa.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28x', tid: '22:41', rader: [
    ['Fixat', 'Prognos: en ny förbokning långt fram (80–120 minuter) kunde saknas i schemat i upp till 7 minuter, fast den redan syntes i originalprognosen. Det hände med en storbil på Landvetter i kväll. Nu syns den direkt, längst ner i schemat.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28w', tid: '16:05', rader: [
    ['Förbättrat', 'Notiser: när ett flyg eller tåg du bevakar ändrar status, eller när en ny förbokning du bevakar kommer in i Prognos, sparas notisen nu direkt under Notiser. Den finns där även om du missade den på telefonen eller har stängt av notiser i telefonen. Tryck på den för att komma dit den gäller: rätt flik i Ankomster (Flyg eller Tåg), eller rätt zon i Prognos med förbokningen markerad i schemat.'],
    ['Förbättrat', 'Notiser: den lilla rutan som visas en kort stund när en notis kommer går nu att trycka på (Visa ›). Den öppnar samma ställe som notisen, t.ex. Prognos på zonen där förbokningen kom in. Samma sak när du trycker på notisen i telefonen.'],
    ['Nytt', 'Notiser: en liten flik med en pil i högra kanten av skärmen visar att panelen finns. Tryck på fliken eller dra från kanten för att öppna den. En röd prick på fliken betyder att du har olästa notiser.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28vb', tid: '15:52', rader: [
    ['Ändrat', 'Namn visas nu kortare i hela appen: förnamn och första bokstaven i efternamnet, till exempel Christian P eller Bernt N. Det gäller i topplistor, forumet, kalendern, Bil & verkstad, Åkeridata och admin. Väldigt långa förnamn kortas av. Hela namnet syns bara i din egen profil.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28va', tid: '15:52', rader: [
    ['Förbättrat', 'Bil & verkstad: i tråden på en anmälan står det nu vem som skrev eller ändrade status, med namn (eller förar-id om namn saknas) och roll under, till exempel Förare, Ägare eller S admin. Förut kunde det stå Ägaren fast någon annan hade skrivit.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28s', tid: '15:03', rader: [
    ['Förbättrat', 'Lönekoll och Körpassdata öppnas snabbare. Appen hämtar nu bara dina egna körningar, och hämtningen börjar redan när startsidan visas. Byter du sida används det som redan är hämtat, så sidan syns direkt och uppdateras sedan tyst i bakgrunden.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28r', tid: '15:00', rader: [
    ['Nytt', 'Notiser: alla notiser sparas nu i appen, så att de inte försvinner. Tryck på 🔔 uppe till höger eller dra in panelen från högra kanten av skärmen. Där ser du notiser om bevakade flyg och tåg, Prognos, Bil & verkstad, Forum, Kalender och nyheter i appen, med hur länge sedan de kom.'],
    ['Nytt', 'Notiser: tryck på en notis för att komma dit den gäller. Den markeras då som läst. Med Markera alla som lästa tar du bort alla markeringar på en gång. Siffran på 🔔 visar hur många som är olästa.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28q', tid: '05:15', rader: [
    ['Nytt', 'Åkeridata: uppe till höger väljer du nu Åkeri, Bil eller Chaufför. Väljer du Bil eller Chaufför väljer du sedan vilken bil eller förare. Alla siffror, målet och listan med körpass visas då bara för den bilen eller föraren, med samma flikar som förut. Valet sparas till nästa gång.', 'agare'],
    ['Nytt', 'Åkeridata › Bil: du ser vilka förare som har kört bilen, med timmar och inkört, och hur många dagar bilen inte körts i perioden. Målet är målet för en bil. Bilar som inte finns i bilregistret men har körningar visas med texten (ej i bilregistret).', 'agare'],
    ['Nytt', 'Åkeridata › Chaufför: du ser vilka bilar föraren har kört. Här visas inget mål, eftersom målen gäller per bil.', 'agare']
  ] },
  { datum: '2026-10-28', id: '2026-10-28p', tid: '05:15', rader: [
    ['Nytt', 'Bil & verkstad: nu kan du och ägaren skriva till varandra på ett ärende, till exempel när något behövs till bilen eller när du har anmält ett fel. Ägaren kan svara utan att ändra status, och du kan svara tillbaka. Alla meddelanden syns i en tråd på ärendet med namn och tid.'],
    ['Nytt', 'När den andra har svarat syns "Nytt svar" på ärendet och en siffra på fliken och på Bil & verkstad på startsidan. Markeringen försvinner när du har tittat på ärendet.'],
    ['Förbättrat', 'Admin › Bil & verkstad: knappen "Skicka meddelande" ligger bredvid Pågår och Åtgärdad. Kommentaren du skriver när du ändrar status syns också i tråden. Det går att skriva även efter att ärendet är åtgärdat.', 'agare']
  ] },
  { datum: '2026-10-28', id: '2026-10-28o', tid: '03:57', rader: [
    ['Nytt', 'Admin › Önskemål och idéer: ägaren kan skriva vad som ska ändras eller läggas till i appen. Christian går igenom allt innan något ändras. Inget ändras automatiskt när man skickar.', 'agare'],
    ['Nytt', 'Där syns också tidigare önskemål med datum, status (Ny, Läst, Planerad, Klar eller Inte nu) och svar från Christian. Ett önskemål går att ta bort så länge det har status Ny.', 'agare']
  ] },
  { datum: '2026-10-27', id: '2026-10-27c', tid: '21:45', rader: [
    ['Fixat', 'Admin › Chaufförer: en förare som inte har aktiverat sitt konto får inte längre texten "logga in med lösenordet du valde". Den texten skickas bara till förare som verkligen har valt lösenord. Alla andra får en aktiveringslänk.', 'admin'],
    ['Förbättrat', 'Admin › Chaufförer: bjud in med ett tryck. Tryck Dela inbjudan så aktiveras kontot och du får direkt texten med aktiveringslänken att skicka. Trycker du två gånger skapas ingen extra länk, och om något går fel visas ett fel i stället för fel text.', 'admin'],
    ['Förbättrat', 'Admin › Chaufförer: du ser hela texten innan du skickar den, och kan kopiera eller dela den.', 'admin']
  ] },
  { datum: '2026-10-27', id: '2026-10-27b', tid: '01:19', rader: [
    ['Förbättrat', 'Demokonton: den som tittar ser inte längre vems siffror det är. Förarens namn och förar-ID visas som Demoförare och bilarna som Demobil 1, 2 och så vidare. Siffrorna är fortfarande riktiga. Det döljs även i det som skickas till telefonen.', 'admin'],
    ['Fixat', 'Åkeridata blir inte längre blek om servern behöver använda reservvägen. Siffrorna visas som vanligt.', 'agare']
  ] },
  { datum: '2026-10-27', id: '2026-10-27a', tid: '00:22', rader: [
    ['Förbättrat', 'Åkeridata: sidan hämtar nu bara den period du tittar på (dag, vecka, månad eller år) i stället för hela året på en gång. Den öppnar snabbare och drar mindre mobildata. Siffrorna räknas på samma sätt som förut, och äldre år fungerar som vanligt. När du tittar på ett helt år hämtas resorna i ett körpass först när du fäller ut passet.', 'agare']
  ] },
  { datum: '2026-10-26', id: '2026-10-26o', tid: '23:55', rader: [
    ['Fixat', 'Appen fastnar inte längre på inloggningssidan när mobilnätet hackar. Om servern inte svarar inom 10 sekunder går appen vidare ändå.']
  ] },
  { datum: '2026-10-26', id: '2026-10-26n', tid: '22:37', rader: [
    ['Nytt', 'Admin › Bil & verkstad: ägaren ser allt som behövs till bilarna och alla felanmälningar, sorterat per bil. Där kan ägaren markera Pågår eller Åtgärdad, skriva ett meddelande till föraren eller ta bort. Admin-rutan visar en siffra när något nytt har kommit in.', 'agare']
  ] },
  { datum: '2026-10-26', id: '2026-10-26i', tid: '22:30', rader: [
    ['Nytt', 'Körpassdata, Åkeridata och Topplistor: äldre år (2025) hämtas nu automatiskt när du bläddrar dit, till exempel från januari i år bakåt till december. Första gången tar det en kort stund. När du tittar på i år hämtas inget extra, och inget sparas i telefonen.', 'agare', 'Körpassdata och Topplistor: äldre år (2025) hämtas nu automatiskt när du bläddrar dit, till exempel från januari i år bakåt till december. Första gången tar det en kort stund. När du tittar på i år hämtas inget extra, och inget sparas i telefonen.'],
  ] },
  { datum: '2026-10-26', id: '2026-10-26h', tid: '22:28', rader: [
    ['Förbättrat', 'Chaufförer: varje förare visar när den senast körde, och listan sorteras med den som kört senast överst. Förare som inte kört på 60 dagar visas gråare.', 'admin'],
    ['Nytt', 'Demokonto: ägaren kan bjuda in någon att titta på appen i 3 dagar. Personen skriver sitt namn och väljer eget lösenord, och kan bara titta.', 'admin'],
    ['Nytt', 'Demokonto: välj Förare eller Ägare. Ägar-demot visar adminpanelen med påhittade exempeluppgifter, aldrig åkeriets riktiga.', 'admin'],
    ['Nytt', 'Chaufförer: demokonton visas i en egen grupp Demo, där du kan skapa nya, se när de går ut och avsluta dem i förtid.', 'admin'],
    ['Förbättrat', 'Demokonton syns inte bland förarna och ser inga andra förares namn eller bilder.', 'admin'],
    ['Fixat', 'Forum: rättat stavfel i forumreglerna (Roxx och uthängningar).'],
    ['Nytt', 'Prognos: en röd siffra på Prognos-rutan visar hur många nya bokningar som kommit sedan du tittade sist.'],
    ['Nytt', 'Verkstadstimmar: ägaren kan ställa frågor och föraren svara innan beslut.'],
    ['Nytt', 'Verkstadstimmar: ägaren ser godkända timmar per månad och kan ladda ner dem.', 'agare'],
    ['Förbättrat', 'Topplistor: listan för arbetstimmar är borttagen.'],
    ['Nytt', 'Forum: regler för god ton. Du godkänner dem första gången du öppnar forumet.'],
    ['Nytt', 'Prognos: se kommande bokningar per zon, i tider var 5:e minut och per bilkategori. Uppdateras varje minut.'],
    ['Nytt', 'Prognos: fliken Morgon visar morgonprognosen till Landvetter kl. 04–09, och hur många som är kvar under timmen som pågår.'],
    ['Nytt', 'Prognos: fliken Original visar prognosen som på Taxi Göteborgs egen sida, utan att du behöver logga in där.'],
    ['Nytt', 'Prognos: notiser med ljud för de zoner och bilkategorier du väljer, även när telefonen är låst.'],
    ['Nytt', 'Prognos: knappen Rapportera fel skapar ett ifyllt inlägg i Forum under Buggar.'],
    ['Förbättrat', 'Prognos: zonnummer på flikarna så att allt får plats, summa efter varje kategori, kortare rubriker (Barnst., Babysk.) och Magasinet borttaget.'],
    ['Nytt', 'Inställningar: välj Ljust, Mörkt eller Följ telefonen, och större eller mindre text.'],
    ['Nytt', 'Inställningar: välj hur startskärmen ser ut (2 eller 3 i bredd, eller lista).'],
    ['Nytt', 'Lönekoll: ungefär vad du får i lön för det du kört in.'],
    ['Förbättrat', 'Startskärmen: ny ordning med 3 rutor i bredd på telefonen.'],
    ['Fixat', 'Prognos: visade ingen data för inloggade förare, och kunde skriva över startsidan.']
  ]},
  { datum: '2026-10-25', rader: [
    ['Nytt', 'Forum: inlägg, kommentarer, gilla och foton. Gemensamt för alla åkerier, plus en egen del för ditt åkeri.'],
    ['Nytt', 'Om appen: beskrivning av appen och vanliga frågor.'],
    ['Nytt', 'Profilbild: lägg till, byt eller ta bort din bild.'],
    ['Nytt', 'Bil & verkstad: felanmälan, sånt som behövs till bilen, underhåll och verkstadstimmar.'],
    ['Nytt', 'Ankomster: bevaka flyg och tåg och få notis när de kommer och när sista väskan är ute.'],
    ['Förbättrat', 'Ankomster: tåg sorterade efter varifrån de kommer (Stockholm, Köpenhamn, Oslo) och lista över stationer.'],
    ['Nytt', 'Kalender: Åbytravet och Åbymässan finns med.'],
    ['Förbättrat', 'Knapprader: går att svepa åt sidan när de inte får plats.'],
    ['Fixat', 'Körpassdata: försöker igen själv om hämtningen misslyckas, i stället för att visa nollor.'],
    ['Förbättrat', 'Menyn: tomma sidor (Statistik, Kommunikation) borttagna.']
  ]},
  { datum: '2026-10-24', rader: [
    ['Nytt', 'Appen: flyttade till taxikit.shop/TaxiData.'],
    ['Nytt', 'Ankomster: tåg till Göteborg C och flyg till Landvetter.'],
    ['Nytt', 'Kalender: konserter, matcher, mässor och andra evenemang, med påminnelser.'],
    ['Nytt', 'Topplistor: se hur du ligger till jämfört med andra, anonymt.'],
    ['Nytt', 'Hjälpbot: en liten figur som hjälper dig. Välj figur under Inställningar.'],
    ['Nytt', 'Verkstadstimmar: registrera tid på verkstaden, ägaren godkänner.'],
    ['Nytt', 'Profil: fyll i och ändra dina uppgifter och byt lösenord.'],
    ['Nytt', 'Aktiveringslänk: nya förare väljer sitt eget lösenord. Glömt lösenord via e-post.'],
    ['Nytt', 'Körpassdata och Topplistor: ny flik År.'],
    ['Förbättrat', 'Körpassdata: lampa som visar om servern fungerar, och när datan senast hämtades.'],
    ['Fixat', 'Körpassdata: resor och pass räknas rätt även när samma nummer används igen.']
  ]},
  { datum: '2026-10-19', ungefar: true, rader: [
    ['Förbättrat', 'Appen: förarappen och adminsidan blev en app, med meny som beror på din roll.'],
    ['Förbättrat', 'Körpassdata: körda kilometer tas från passet. Pass som går över midnatt blir rätt.']
  ]},
  { datum: '2026-10-18', ungefar: true, rader: [
    ['Nytt', 'Appen: startskärm med ikoner, profilmeny och inloggning mot servern.'],
    ['Nytt', 'Admin: lista över förare, uppdelad på kategori.', 'admin'],
    ['Nytt', 'Körpassdata: välj egen period med kalender.']
  ]},
  { datum: '2026-10-16', ungefar: true, rader: [
    ['Nytt', 'Körpassdata: första versionen med dina pass och resor per dag, vecka och månad, med betalsätt och mål.'],
    ['Nytt', 'Inloggning: logga in med ditt förar-ID.']
  ]}
];
