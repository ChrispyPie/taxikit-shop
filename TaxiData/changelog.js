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
 * Ett fjärde fält (valfritt) är texten som alla andra ser i stället. Utan det ser de inte raden alls.
 * En dag där ingen rad syns för föraren visas inte, och ger ingen prick eller notis.
 */
window.CHANGELOG = [
  { datum: '2026-10-28', id: '2026-10-28x', rader: [
    ['Fixat', 'Prognos: en ny förbokning långt fram (80–120 minuter) kunde saknas i schemat i upp till 7 minuter, fast den redan syntes i originalprognosen. Det hände med en storbil på Landvetter i kväll. Nu syns den direkt, längst ner i schemat.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28w', rader: [
    ['Förbättrat', 'Notiser: när ett flyg eller tåg du bevakar ändrar status, eller när en ny förbokning du bevakar kommer in i Prognos, sparas notisen nu direkt under Notiser. Den finns där även om du missade den på telefonen eller har stängt av notiser i telefonen. Tryck på den för att komma dit den gäller: rätt flik i Ankomster (Flyg eller Tåg), eller rätt zon i Prognos med förbokningen markerad i schemat.'],
    ['Förbättrat', 'Notiser: den lilla rutan som visas en kort stund när en notis kommer går nu att trycka på (Visa ›). Den öppnar samma ställe som notisen, t.ex. Prognos på zonen där förbokningen kom in. Samma sak när du trycker på notisen i telefonen.'],
    ['Nytt', 'Notiser: en liten flik med en pil i högra kanten av skärmen visar att panelen finns. Tryck på fliken eller dra från kanten för att öppna den. En röd prick på fliken betyder att du har olästa notiser.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28vb', rader: [
    ['Ändrat', 'Namn visas nu kortare i hela appen: förnamn och första bokstaven i efternamnet, till exempel Christian P eller Bernt N. Det gäller i topplistor, forumet, kalendern, Bil & verkstad, Åkeridata och admin. Väldigt långa förnamn kortas av. Hela namnet syns bara i din egen profil.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28va', rader: [
    ['Förbättrat', 'Bil & verkstad: i tråden på en anmälan står det nu vem som skrev eller ändrade status, med namn (eller förar-id om namn saknas) och roll under, till exempel Förare, Ägare eller S admin. Förut kunde det stå Ägaren fast någon annan hade skrivit.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28s', rader: [
    ['Förbättrat', 'Lönekoll och Körpassdata öppnas snabbare. Appen hämtar nu bara dina egna körningar, och hämtningen börjar redan när startsidan visas. Byter du sida används det som redan är hämtat, så sidan syns direkt och uppdateras sedan tyst i bakgrunden.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28r', rader: [
    ['Nytt', 'Notiser: alla notiser sparas nu i appen, så att de inte försvinner. Tryck på 🔔 uppe till höger eller dra in panelen från högra kanten av skärmen. Där ser du notiser om bevakade flyg och tåg, Prognos, Bil & verkstad, Forum, Kalender och nyheter i appen, med hur länge sedan de kom.'],
    ['Nytt', 'Notiser: tryck på en notis för att komma dit den gäller. Den markeras då som läst. Med Markera alla som lästa tar du bort alla markeringar på en gång. Siffran på 🔔 visar hur många som är olästa.']
  ] },
  { datum: '2026-10-28', id: '2026-10-28q', rader: [
    ['Nytt', 'Åkeridata: uppe till höger väljer du nu Åkeri, Bil eller Chaufför. Väljer du Bil eller Chaufför väljer du sedan vilken bil eller förare. Alla siffror, målet och listan med körpass visas då bara för den bilen eller föraren, med samma flikar som förut. Valet sparas till nästa gång.', 'agare'],
    ['Nytt', 'Åkeridata › Bil: du ser vilka förare som har kört bilen, med timmar och inkört, och hur många dagar bilen inte körts i perioden. Målet är målet för en bil. Bilar som inte finns i bilregistret men har körningar visas med texten (ej i bilregistret).', 'agare'],
    ['Nytt', 'Åkeridata › Chaufför: du ser vilka bilar föraren har kört. Här visas inget mål, eftersom målen gäller per bil.', 'agare']
  ] },
  { datum: '2026-10-28', id: '2026-10-28p', rader: [
    ['Nytt', 'Bil & verkstad: nu kan du och ägaren skriva till varandra på ett ärende, till exempel när något behövs till bilen eller när du har anmält ett fel. Ägaren kan svara utan att ändra status, och du kan svara tillbaka. Alla meddelanden syns i en tråd på ärendet med namn och tid.'],
    ['Nytt', 'När den andra har svarat syns "Nytt svar" på ärendet och en siffra på fliken och på Bil & verkstad på startsidan. Markeringen försvinner när du har tittat på ärendet.'],
    ['Förbättrat', 'Admin › Bil & verkstad: knappen "Skicka meddelande" ligger bredvid Pågår och Åtgärdad. Kommentaren du skriver när du ändrar status syns också i tråden. Det går att skriva även efter att ärendet är åtgärdat.', 'agare']
  ] },
  { datum: '2026-10-28', id: '2026-10-28o', rader: [
    ['Nytt', 'Admin › Önskemål och idéer: ägaren kan skriva vad som ska ändras eller läggas till i appen. Christian går igenom allt innan något ändras. Inget ändras automatiskt när man skickar.', 'agare'],
    ['Nytt', 'Där syns också tidigare önskemål med datum, status (Ny, Läst, Planerad, Klar eller Inte nu) och svar från Christian. Ett önskemål går att ta bort så länge det har status Ny.', 'agare']
  ] },
  { datum: '2026-10-27', id: '2026-10-27c', rader: [
    ['Fixat', 'Admin › Chaufförer: en förare som inte har aktiverat sitt konto får inte längre texten "logga in med lösenordet du valde". Den texten skickas bara till förare som verkligen har valt lösenord. Alla andra får en aktiveringslänk.', 'admin'],
    ['Förbättrat', 'Admin › Chaufförer: bjud in med ett tryck. Tryck Dela inbjudan så aktiveras kontot och du får direkt texten med aktiveringslänken att skicka. Trycker du två gånger skapas ingen extra länk, och om något går fel visas ett fel i stället för fel text.', 'admin'],
    ['Förbättrat', 'Admin › Chaufförer: du ser hela texten innan du skickar den, och kan kopiera eller dela den.', 'admin']
  ] },
  { datum: '2026-10-27', id: '2026-10-27b', rader: [
    ['Förbättrat', 'Demokonton: den som tittar ser inte längre vems siffror det är. Förarens namn och förar-ID visas som Demoförare och bilarna som Demobil 1, 2 och så vidare. Siffrorna är fortfarande riktiga. Det döljs även i det som skickas till telefonen.', 'admin'],
    ['Fixat', 'Åkeridata blir inte längre blek om servern behöver använda reservvägen. Siffrorna visas som vanligt.', 'agare']
  ] },
  { datum: '2026-10-27', id: '2026-10-27a', rader: [
    ['Förbättrat', 'Åkeridata: sidan hämtar nu bara den period du tittar på (dag, vecka, månad eller år) i stället för hela året på en gång. Den öppnar snabbare och drar mindre mobildata. Siffrorna räknas på samma sätt som förut, och äldre år fungerar som vanligt. När du tittar på ett helt år hämtas resorna i ett körpass först när du fäller ut passet.', 'agare']
  ] },
  { datum: '2026-10-26', id: '2026-10-26o', rader: [
    ['Fixat', 'Appen fastnar inte längre på inloggningssidan när mobilnätet hackar. Om servern inte svarar inom 10 sekunder går appen vidare ändå.']
  ] },
  { datum: '2026-10-26', id: '2026-10-26n', rader: [
    ['Nytt', 'Admin › Bil & verkstad: ägaren ser allt som behövs till bilarna och alla felanmälningar, sorterat per bil. Där kan ägaren markera Pågår eller Åtgärdad, skriva ett meddelande till föraren eller ta bort. Admin-rutan visar en siffra när något nytt har kommit in.', 'agare']
  ] },
  { datum: '2026-10-26', id: '2026-10-26i', rader: [
    ['Nytt', 'Körpassdata, Åkeridata och Topplistor: äldre år (2025) hämtas nu automatiskt när du bläddrar dit, till exempel från januari i år bakåt till december. Första gången tar det en kort stund. När du tittar på i år hämtas inget extra, och inget sparas i telefonen.', 'agare', 'Körpassdata och Topplistor: äldre år (2025) hämtas nu automatiskt när du bläddrar dit, till exempel från januari i år bakåt till december. Första gången tar det en kort stund. När du tittar på i år hämtas inget extra, och inget sparas i telefonen.'],
  ] },
  { datum: '2026-10-26', id: '2026-10-26h', rader: [
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
