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
  { datum: '2026-11-12', id: '2026-11-12zon2', tid: '13:42', rader: [
    ['Nytt', 'Prognos: när en zon du bevakar får en ny förbokning visas zonens märke över skärmen, samtidigt som notisen. Landvetter: ett plan som sveper förbi, och när appen är öppen låter notisen som säkerhetsbältessignalen i stället för pipet. Essity, Astra, Volvo och Hotell Draken: loggan glider in, stannar några sekunder och glider ut. Andra zoner låter som förut.'],
    ['Ändrat', 'Ankomster: när ett bevakat flyg har landat visas nu ett plan som landar på en bana. När en båt har ankommit visas en Stenafärja. Tåget är som förut. Animationen körs fortfarande bara vid själva ankomsten.'],
    ['Nytt', 'Under Inställningar, Animationer kan du prova alla animationer, även Landvetter med ljudet. Animationerna stängs av där, ljudet påverkas inte.'],
    ['Ändrat', 'Alla animationer kommer nu in från höger och rör sig åt vänster. Plan, tåg och färja pekar åt det håll de åker.']
  ]},
  { datum: '2026-11-12', id: '2026-11-12anim5', tid: '06:45', rader: [
    ['Förbättrat', 'När ett bevakat tåg, flyg eller båt ankommer visas en stor figur över hela skärmen i ungefär fem sekunder, så att du hinner se det. Animationen körs inte vid försening eller andra statusuppdateringar.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11datatid1', tid: '22:35', rader: [
    ['Rättat', 'I Prognos på Landvetter visar tiden när flygdata senast hämtades från Swedavia, inte när appen öppnades. Är uppgifterna mer än 30 minuter gamla syns det i texten. Tiden för själva prognosen visas också.'],
    ['Rättat', 'I Ankomster visar "uppdaterad" när tåg, flyg och båtar senast hämtades från källan, inte när du öppnade sidan.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11hopp1', tid: '22:20', rader: [
    ['Ändrat', 'Om hjälpboten just gått in i en ikon på startskärmen och du öppnar samma verktyg, hoppar den ut genom hemknappen (🏠) uppe till vänster och försvinner, ungefär en sekund. I övrigt syns den inte inne i verktygen. På startskärmen är den tillbaka som vanligt.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11pgbot1', tid: '22:15', rader: [
    ['Nytt', 'I Prognos, när du trycker på ett flyg på Landvetter, finns en stjärna i rutan med uppgifter. Den gör en tillfällig bevakning, samma som stjärnan på Ankomster.'],
    ['Ändrat', 'Hjälpboten och pratbubblorna syns bara på startskärmen, så de inte är i vägen i andra verktyg. Den kan fortfarande gå in i och ur ikonerna där. Går du in i ett verktyg den just tittat in i hoppar den ut på startskärmen när du kommer tillbaka. Laddstation och sminkbord syns bara på startskärmen. Berra är som tidigare.'],
    ['Rättat', 'Tåglistan i Ankomster hoppar inte längre ner till slutet när tiderna uppdateras, till exempel på platta i liggande läge.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11bat1', tid: '19:30', rader: [
    ['Nytt', 'Under Ankomster finns nu fliken Båt. Där ser du Stenas ankomster till Göteborg från Fredrikshamn och Kiel, med terminal och möjlighet att bevaka precis som tåg och flyg.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11delad3', tid: '18:30', rader: [
    ['Rättat', 'På en delad platta märks sessionen redan när du loggar in. Öppnar du appen igen loggas du ut om passet har avslutats, även om skärmen varit av.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11bubble1', tid: '12:35', rader: [
    ['Förbättrat', 'Pratbubblan från hjälpboten stängs när du trycker på den eller på figuren. Kommentarer och reaktioner försvinner efter ungefär åtta sekunder. Tips och Berra är som tidigare.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11poke1', tid: '12:25', rader: [
    ['Nytt', 'När du trycker på hjälpboten öppnas ingen ruta. Den gör en kort reaktion och kan säga något. Hjälp finns under frågetecknet.'],
    ['Förbättrat', 'Pratbubblor från hjälpboten och Berra stannar tills du lämnar sidan, trycker igen eller trettio sekunder har gått.'],
    ['Förbättrat', 'Berra har fått många nya skämt. Du hör alla innan något upprepas.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11maps1', tid: '12:20', rader: [
    ['Nytt', 'Vid platser i Kalendern och vid stationer och flygplatser i Ankomster finns en liten länk till vägbeskrivning i Google Maps.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11nyheter1', tid: '12:15', rader: [
    ['Nytt', 'Under Moduler finns Nyheter. Där läser du korta nyheter från Göteborg, och kan lägga till Politik, Sport, Sverige och Nöje. Tryck på en rad för att öppna artikeln hos källan.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11berra1', tid: '11:55', rader: [
    ['Nytt', 'På startskärmen finns Berra. Tryck på honom så säger han ett kort skämt.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11tipguide1', tid: '11:45', rader: [
    ['Förbättrat', 'När hjälpboten tipsar om verkstadstimmar går den fram till profilikonen och visar vägen. Trycker du på pratbubblan öppnas Meddelanden.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11tips1', tid: '11:15', rader: [
    ['Nytt', 'Hjälpboten kan visa ett kort tips om var du rapporterar verkstadstimmar: under Meddelanden i din profil. Tipset försvinner när du har varit där, och visas högst tre gånger.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11moduler1', tid: '10:50', rader: [
    ['Nytt', 'På startskärmen heter den sista rutan Moduler. Där ser du alla verktyg med en bild och en kort beskrivning, och kan installera eller avinstallera dem.'],
    ['Nytt', 'Ett långt tryck på en ikon öppnar en liten meny med Modulinfo, Flytta, Hjälp och Avinstallera. Modulinfo visar storlek och version, och du kan rensa bara den modulens cache. Inställningar, Om appen och Admin går inte att ta bort.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11tryck1', tid: '10:25', rader: [
    ['Rättat', 'När du trycker på ett verktyg på startskärmen följer återkopplingen ikonen, utan en fyrkantig ram runt rutan.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11plus1', tid: '10:30', rader: [
    ['Förbättrat', 'Verktygen på startskärmen sitter högst upp. En liten skiftnyckel vid rutnätet låter dig flytta och ändra dem.'],
    ['Nytt', 'Du kan ta bort verktyg du sällan använder och lägga tillbaka dem med plusknappen. Inställningar, Om appen och Admin stannar kvar. Valen sparas på ditt konto.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11ordna1', tid: '10:15', rader: [
    ['Nytt', 'På startskärmen kan du trycka på Ordna och flytta verktygen. Tryck Klar när du är nöjd. Ordningen sparas på ditt konto, och Återställ tar tillbaka standardordningen.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11hjalp1', tid: '10:05', rader: [
    ['Nytt', 'Ett frågetecken uppe till höger öppnar en kort hjälptext för sidan du är på.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11karta1', tid: '09:50', rader: [
    ['Nytt', 'Under Väder på hemskärmen finns en karta över Västsverige. Du kan visa nederbörd, blixt, vind och temperatur. Uppgifterna kommer från SMHI och Open-Meteo.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11botfix1', tid: '09:35', rader: [
    ['Rättat', 'Hjälpboten syns igen i appen och går fritt över skärmen, utan en egen list längst ner. Den skymmer inte knapparna.'],
    ['Förbättrat', 'Verktygen på hemskärmen visas luftigare, bara ikon och namn, så mer får plats.'],
    ['Rättat', 'Texten på Inloggade enheter syns tydligt i mörkt läge.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11land1', tid: '09:20', rader: [
    ['Nytt', 'När ett flyg landar i Prognos gör planet en kort landningsrörelse vid sin plats i flygspalten. Det styrs av samma val Animationer under Inställningar.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11anim1', tid: '09:05', rader: [
    ['Nytt', 'När en bevakning slår till medan appen är öppen flyger en kort figur över skärmen: ett flygplan, ett tåg eller en båt. Du slår av eller på det under Inställningar, Animationer. Det påverkar inte ljudet.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11delad2', tid: '09:02', rader: [
    ['Rättat', 'Det röda meddelandet om automatisk utloggning visas när du loggar in igen på samma konto, inte på inloggningsskärmen. Nästa förare ser det inte.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11fly1', tid: '09:00', rader: [
    ['Rättat', 'I prognosens liggande läge pekar flygplanen åt vänster, mot strecket för nu. I stående läge pekar de uppåt, mot nu.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11pwa1', tid: '08:55', rader: [
    ['Nytt', 'Du kan lägga TaxiData på hemskärmen. Då öppnas appen utan webbläsarens adressrad. Där står taxikit.shop litet längst ner, och knappen bredvid Hem öppnar samma sida i vanliga webbläsaren. Vill du ha adressraden hela tiden använder du appen i Chrome som vanligt.'],
    ['Förbättrat', 'Knappen bredvid Hem byter ikon när du är i helskärm eller när appen är tillagd på hemskärmen. Då visas Gå ur helskärm, med pilar inåt.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11pg6', tid: '08:45', rader: [
    ['Förbättrat', 'Diagrammet i Prognos visas alltid, även när det inte finns några bokningar. Då ser du rutnätet med nollor och en liten text Inga bokningar just nu.'],
    ['Rättat', 'I liggande läge på telefonen visas prognosens liggande rutnät även utan helskärm. När du vrider tillbaka till stående läge stängs helskärmen av. Helskärmsknappen används fortfarande för att gå in i helskärm.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11delad1', tid: '08:35', rader: [
    ['Rättat', 'På en delad platta loggas du ut när passet är slut, även om skärmen varit av. Om servern inte har uppdaterats på 1 timme loggas du också ut, även mitt i passet. Ett meddelande skickas till dina andra inloggade enheter, och den utloggade enheten visar ett rött meddelande på inloggningssidan.'],
    ['Nytt', 'På startsidan syns dina inloggade enheter, till exempel Telefon eller Platta, med senast använd. Tryck på en annan enhet för att logga ut den.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11bev3', tid: '08:15', rader: [
    ['Förbättrat', 'När du bevakar något slås notiserna på automatiskt. Du behöver inte en extra knapp på Ankomster.'],
    ['Nytt', 'I Notiser kan du filtrera med små knappar högst upp: Tåg, Flyg, Båt, Evenemang, Uppdateringar och andra typer som finns. Tryck för att visa eller dölja. Valet sparas i telefonen.'],
    ['Rättat', 'Etiketterna under Bevakar på Ankomster är silver för tillfälliga bevakningar. Guld används bara för fasta.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11bev2', tid: '08:00', rader: [
    ['Rättat', 'En tillfällig bevakning på Ankomster visas med en silverstjärna, inte guld. Guldstjärnan används bara för fasta bevakningar, som du gör i Mina bevakningar med ett långt tryck.'],
    ['Rättat', 'Ett tåg som inte har gått visar inte längre en slutstation från gårdagens tåg med samma nummer. Senast sedd gäller bara den här turen och bara stationer på vägen. Har tåget inte avgått står det Ej avgått.'],
    ['Rättat', 'Stjärnan på Ankomster gör bara en tillfällig bevakning. Tar du bort den där försvinner den också från Mina bevakningar. En fast bevakning (guld) gör du bara med ett långt tryck i Mina bevakningar.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11bev1', tid: '07:30', rader: [
    ['Nytt', 'Stjärnan på en ankomst i Tåg, Flyg eller Båt gör en tillfällig bevakning (silverstjärna). Den syns i Mina bevakningar och som en liten etikett högst upp på sidan, och försvinner cirka en halvtimme efter ankomst.'],
    ['Nytt', 'I Mina bevakningar kan du hålla fingret på en tillfällig tåg-, flyg- eller båtbevakning för att göra den fast (guldstjärna). Den gäller samma tur och ungefär samma klockslag, så den följer med även om tågnumret ändras. Kugghjulet ställer in tid och dagar, till exempel mån–fre 05:40. En fast bevakning görs tillfällig bara här, inte på Ankomster. Konserter och andra evenemang kan bara vara tillfälliga.'],
    ['Förbättrat', 'Ljudet för tåg, flyg och båt är inspelningar. Du slår på eller av varje ljud och kan testa det på Ankomster och i Mina bevakningar. Valet sparas i telefonen. Om en fil saknas används en reservton. Rutan Ljud för bevakningar är borttagen från Inställningar.'],
    ['Förbättrat', 'De extra korten Bevakningar under Tåg och Flyg är borttagna. Notislistan, Schema och Tidslinjen är kvar. Knappar och etiketter är mindre så listan får plats bättre på telefonen.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11ljud1', rader: [
    ['Nytt', 'När en bevakning slår till medan appen är öppen spelas ett kort ljud: ett tåghorn för tåg, ett flygljud för flyg och en båtsignal för båt. Under Inställningar finns Ljud för bevakningar, där du kan slå av allt eller en typ i taget, och prova hur det låter. Valet sparas i telefonen.'],
    ['Förbättrat', 'Mina bevakningar visar tydligare status på varje ankomst: I tid, försenad, ankommen eller inställd. Listan heter Schema och är tätare, så dagens och kommande ankomster är lätta att läsa på telefonen.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11pr2', rader: [
    ['Rättat', 'Passrapporten öppnas när du trycker på den lilla rems-ikonen. Plusknappen och resten av raden fäller ut passet som förut. Samma sak för resor och kvittokopian.'],
    ['Rättat', 'I dagsvyn syns även körpass som började kvällen innan och pågick in på den dagen.'],
    ['Rättat', 'Passrapporten gick inte att öppna. Det är lagat, och Stäng-knappen sitter kvar på rapporten.'],
    ['Förbättrat', 'I Körpassdata går raderna närmare kanten på telefonen, så att pass och resor får mer plats.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11pr1', rader: [
    ['Nytt', 'Varje körpass i Inkört har en liten passrapport-ikon. Trycker du på ikonen eller på passraden öppnas en kopia av körpassrapporten, som en termoremsa, med Taxi Göteborgs logo och de uppgifter som finns för just det passet. Plusknappen visar fortfarande resorna i passet.']
  ]},
  { datum: '2026-11-11', id: '2026-11-11kv1', rader: [
    ['Nytt', 'Varje resa i Körpassdata och Åkeridata har en liten kvittoikon. Trycker du på ikonen eller på raden öppnas en kvittokopia i Taxi Göteborgs utseende, med de uppgifter som finns för just den resan. Plusknappen visar fortfarande den korta sammanfattningen.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10hl3', rader: [
    ['Rättat', 'Headern tar mindre plats i sidled: ikonerna sitter tätare och marginalerna är mindre, så titeln (t.ex. Prognos) syns i sin helhet även med stor text på en smal skärm. Notispricken med antal ligger på klockikonen i stället för bredvid den. Helskärmsknappen ligger kvar bredvid hemknappen.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10hl2', rader: [
    ['Rättat', 'Helskärmsknappen (⛶) sitter nu bredvid hemknappen till vänster i headern, på både telefon och platta. Titeln i mitten krockar inte längre med klockan eller profilikonen, även med stor text på en smal skärm.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10hl1', rader: [
    ['Nytt', 'På Inställningar finns ett nytt val för startsidan: Fyll bredd (stor skärm). Det är samma läge som när inget val var sparat, med mindre ikoner som radas upp så att de fyller bredden utan att man behöver skrolla i sidled. Det valet är förvalt tills du väljer något annat.'],
    ['Ändrat', 'Prognos (Schema): den dubbla Morgonprognos-raden längst ner är borttagen. Fliken Morgon högst upp fungerar som förut.'],
    ['Förbättrat', 'Helskärm finns nu på alla sidor via en knapp (⛶), också när du redan är i helskärm. Du kan byta sida i appen utan att lämna läget, och knappen för att gå ur syns alltid. Chromes adressrad döljs. I Prognos rullas vyn fortfarande längst ner när helskärm slås på.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10pg5', rader: [
    ['Förbättrat', 'Prognos i liggande läge sitter längst ner på skärmen, så du kan rulla upp till zoner och filter. Helskärm öppnas längst ner med schemat i fokus. Texten "10 min: går ut" är borttagen i både liggande och stående läge; en linje räcker. I helskärm döljs appens toppmeny, men zoner och filter når du genom att rulla upp.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10de1', rader: [
    ['Nytt', 'På Inställningar finns Delad enhet, av som standard. På en platta som flera delar kan du slå på den: när timkörningen har registrerat att ditt pass är slut loggas du ut automatiskt, med meddelandet "Passet är avslutat – du har loggats ut". Din egen telefon påverkas inte.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10pg4', rader: [
    ['Nytt', 'Prognos i liggande läge visar tiderna vågrätt upptill, med flygraden överst, och kategorierna som rader till vänster. Linjen vid 10 min står lodrätt. Flygikoner och flightnummer fungerar som i stående läge. En liten helskärmsknapp döljer menyn så bara schemat syns.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10pg3', rader: [
    ['Fixat', 'Prognos: flygikoner och flightnummer ligger som etiketter med tunna linjer ovanpå tabellen, så tidraderna håller samma höjd. Kolumnerna fyller skärmbredden, och kategorinamnen vrids bara så mycket att de ryms (så plant som möjligt). Sidmarginalen och Tid-kolumnen är smala så antalsbubblorna får mer plats.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10pg2', rader: [
    ['Fixat', 'Prognos: antalsbubblorna och de lodräta kolumnnamnen har egna ytor, så de inte längre krockar med varandra eller med raden Snart. Flygspalten visar planet ovanför numret, utan ram, och flera flyg i samma tid får överlappa lite så bolagskoden syns.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10pg', rader: [
    ['Nytt', 'Prognos på Landvetter visar en linje vid 10 min (då bokningarna går ut) och en flygspalt med ankomster till Landvetter i varje tid. Tryck på ett flyg för mer uppgifter. Kolumnrubrikerna står lodrätt så spalterna får plats även på en smal skärm.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10fly', rader: [
    ['Nytt', 'Du kan nu lägga fasta Bevakningar även för flyg till Landvetter, under Ankomster › Flyg. De syns på sidan Mina bevakningar som Bevakning (flyg).']
  ]},
  { datum: '2026-11-10', id: '2026-11-10ref', rader: [
    ['Förbättrat', 'Ankomster: uppdatera-knappen är borttagen, listan uppdateras av sig själv. Stationsväljaren och klockan ryms oftare på samma rad; om klockan hamnar på raden under står den till vänster.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10row', rader: [
    ['Förbättrat', 'Ankomster: stationsväljaren och klockan för senast uppdaterad står på samma rad när det får plats, annars hamnar klockan på raden under.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10bev', rader: [
    ['Förbättrat', 'De fasta tågbevakningarna heter nu Bevakningar. Du hittar dem under Mina bevakningar på Ankomster › Tåg, och tåg som passar en bevakning syns också på sidan Mina bevakningar.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10upd', rader: [
    ['Förbättrat', 'Ankomster visar klockslaget för senast uppdaterad med sekunder, så du ser när listan senast hämtades (ungefär var 15:e sekund).']
  ]},
  { datum: '2026-11-10', id: '2026-11-10sel', rader: [
    ['Förbättrat', 'Ankomster: stationsväljaren är mer kompakt. Stängd tar den inte hela bredden; öppen är det en vanlig lista med vanliga stationer i fetstil högst upp.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10delta', rader: [
    ['Förbättrat', 'Ankomster uppdaterar tågen oftare (ungefär var 15:e sekund) så länge sidan är öppen, och sparar på datamängden när den inte syns.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10ank2', rader: [
    ['Fixat', 'Ankomster: den orange raden för senast sedd station syns tydligt även i ljust tema.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10ank', rader: [
    ['Förbättrat', 'Ankomster: välj station i en tydligare lista högst upp. Vanliga stationer ligger först, därefter alla andra. Du kan rulla eller börja skriva (även å, ä och ö) så filtreras listan med en gång.'],
    ['Förbättrat', 'I den utfällda stationslistan för ett tåg syns senast sedd plats med orange markering, fullt stationsnamn och klockslag. Passerade stationer får blå bock.']
  ]},
  { datum: '2026-11-10', id: '2026-11-10ersatta', rader: [
    ['Nytt', 'När ett kvitto rättas (till exempel -02 eller -03) syns de äldre versionerna under kvittot, överstrukna och nedtonade.'],
    ['Nytt', 'Lönekoll visar en påminnelse att rättade kvitton från Taxi Göteborg kommer in den 16:e varje månad, så lönen kan visa lite fel fram till dess.'],
    ['Fixat', 'I Meddelanden försvinner inte längre texten i svarsrutan en kort stund när du accepterar en bokad tid.']
  ]},
  { datum: '2026-11-08', id: '2026-11-08stations', tid: '00:34', rader: [
    ['Nytt', 'Ankomster: välj station för tågen, till exempel Mölndal, Gamlestaden eller Kungsbacka. Ditt stationsval sparas.']
  ]},
  { datum: '2026-11-07', id: '2026-11-07k', tid: '22:26', rader: [
    ['Förbättrat', 'Verktygen laddas först när du öppnar dem. Efter en uppdatering kommer du tillbaka till samma vy.']
  ]},
  { datum: '2026-11-07', id: '2026-11-07j', rader: [
    ['Nytt', 'Meddelanden: markera flera rader för att nåla fast, markera som oläst eller radera från din vy. Om admin svarar visas hela tråden igen.'],
    ['Nytt', 'Admin › Ärenden: raderade trådar hamnar i åkeriets papperskorg. Ägaren kan återställa eller radera permanent. Föraren kan läsa en stängd tråd, men inte svara förrän den återställs.', 'admin']
  ]},
  { datum: '2026-11-07', id: '2026-11-07i', rader: [
    ['Förbättrat', 'Admin › Ärenden har kategorier och grupper: ohanterade eller väntar på svar, pågående och avslutade.', 'admin'],
    ['Förbättrat', 'Inkorg heter nu Meddelanden. I en tråd kan du välja Markera som oläst för att påminna dig själv.']
  ]},
  // Christian godkände kör 2026-11-07; svensk go-live-tid.
  { datum: '2026-11-07', id: '2026-11-07g', tid: '16:23', rader: [
    ['Nytt', 'Inkorg samlar Meddelande till admin, Sjuk och Verkstadstimmar. Kategoriikoner på en rad och rubrik för vald kategori. Äldre samtal och bilärenden finns kvar att läsa.'],
    ['Nytt', 'Bokad tid: ett Typ-fält blir rubriken, datum väljs i kalendern och visas ÅÅÅÅ-MM-DD, med tid i 24-timmarsformat. Ett frivilligt meddelande kan följa med. Välj åkeriets bil eller Nej. Avböj använder texten i den vanliga svarsrutan; tom ruta ger en röd varning. Väntande tider visas grå i Mina bevakningar.'],
    ['Nytt', 'Lägg till bilar i profilen. Biltelefonerna visas för åkeriet. Vid din vanliga kontakttelefon väljer du Ägare, Åkeriet eller Alla (inom Taxi Göteborg).'],
    ['Förbättrat', 'Admin › Ärenden: Meddelande och Bokad tid till åkeriets chaufförer. Önskemål finns bara under Önskemål och idéer. Sjukanmälan och intyg är fortsatt skyddade.', 'admin']
  ]},
  { datum: '2026-11-07', id: '2026-11-07f', tid: '03:05', rader: [
    ['Nytt', 'Admin › Ärenden: Ändra finns nu på felanmälan, Behövs, underhåll, uppgifter och verkstadstid som väntar på beslut. Den öppnar samma formulär som i appen, och när du sparar eller trycker Avbryt kommer du tillbaka till ärendet.', 'admin']
  ] },
  { datum: '2026-11-07', id: '2026-11-07e', tid: '03:03', rader: [
    ['Nytt', 'Admin › Ärenden: på en öppen felanmälan eller Behövs finns nu Ändra kategori under Adminverktyg. Välj Felanmälan, Behövs eller Underhåll och tryck Byt kategori. Där finns också en knapp för att öppna anmälan i Bil & verkstad.', 'admin']
  ] },
  { datum: '2026-11-07', id: '2026-11-07d', tid: '03:02', rader: [
    ['Förbättrat', 'Profil: välj år och månad för din taxistart. Hemmazon och favoritzon är nummer 1–999. Lägg till språk med nivå, välj körkortsbehörigheter och kryssa i Serviceresor. Dina synlighetsval finns kvar.']
  ] },
  { datum: '2026-11-07', id: '2026-11-07c', tid: '02:35', rader: [
    ['Nytt', 'Bil & verkstad: under Kategori när du ändrar en anmälan finns nu också Underhåll. Välj typ av underhåll, så flyttas anmälan dit som förslag. Foton följer med och tråden finns kvar på den stängda anmälan.', 'admin']
  ] },
  { datum: '2026-11-07', id: '2026-11-07b', tid: '02:33', rader: [
    ['Ändrat', 'Sjukanmälan: när du laddar upp ett läkarintyg som ägaren bett om går ärendet tillbaka till ägaren (Behöver ditt svar).'],
    ['Nytt', 'Sjukanmälan: ärendet visar nu en historik med datum och tid – när den anmäldes, varje intyg som laddats upp och varje statusbyte, och vem som gjorde det.'],
    ['Ändrat', 'Ärenden › Adminverktyg: Godkänn, Avslå, Öppna igen och de andra knapparna ser likadana ut (ingen ifylld färg), så det inte ser ut som att ärendet redan är godkänt. Bara statusen har färg.', 'admin']
  ] },
  { datum: '2026-11-07', id: '2026-11-07a', tid: '02:30', rader: [
    ['Nytt', 'Bil & verkstad: när admin eller ägare trycker Ändra på en anmälan finns nu Kategori under Bil. Där kan du byta mellan Felanmälan och Behövs. Bytet skrivs i ärendets tråd.', 'admin'],
    ['Ändrat', 'När du öppnar en anmälan eller ett ärende för att ändra den visas bara den. Flikarna och bilraden döljs. Avbryt, Spara, ‹ Ärenden eller svep bakåt tar dig tillbaka till listan.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06n', tid: '23:15', rader: [
    ['Nytt', 'Ankomster: tryck på ett inställt eller borttaget tåg eller flyg för att se orsaken, till exempel banarbete. Finns ingen orsak står det så.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06m', tid: '23:09', rader: [
    ['Nytt', 'Mina bevakningar på hemskärmen visar tåg, flyg och kalenderhändelser som en tidslinje med klockslag, nu-linje och lediga luckor. Välj dag eller växla till Lista. Tryck på ett block för att öppna det, eller på ⋯ för att sluta bevaka.'],
    ['Nytt', 'I Kalender kan du slå på Visa mina bevakningar för att se dina tåg och flyg som rader och prickar. Valet sparas på telefonen.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06l', tid: '22:58', rader: [
    ['Förbättrat', 'Ankomster, tåg: inställda tåg visas som flygen, med överstruken tid och "Inställt" i röd text. Inställda och borttagna tåg och flyg är dessutom gråa, så att de syns mindre.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06k', tid: '22:55', rader: [
    ['Förbättrat', 'Ankomster: inställda och borttagna flyg och tåg har inte längre röd ruta. Tiden är överstruken och statusen står i röd text.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06j', tid: '22:39', rader: [
    ['Förbättrat', 'Nyheter: Visa alla lägger till äldre nyheter nedåt och du stannar där du var.'],
    ['Förbättrat', 'Ankomster: Tidigare lägger de tidigare flygen och tågen ovanför, så vyn stannar på nuvarande tid. Skrolla upp för att se dem.'],
    ['Förbättrat', 'Backa-swipen fungerar nu från vänstra halvan av skärmen, du behöver inte nå kanten. Dra tydligt åt höger.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06i', tid: '22:27', rader: [
    ['Nytt', 'Backa en sida genom att dra med tummen från vänsterkanten åt höger. Det fungerar på alla sidor, som telefonens bakåtknapp.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06h', tid: '22:30', rader: [
    ['Fixat', 'Körpassdata: notiserna går nu att öppna där också, både med klockan högst upp och genom att dra fram panelen från högra kanten.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06g', tid: '22:20', rader: [
    ['Förbättrat', 'Ärenden: ärenden som behöver ditt svar har inte längre ljus bakgrund, så texten är lätt att läsa. De ligger kvar överst i en egen grupp med etiketten ✋ Behöver ditt svar.', 'admin']
  ] },
  { datum: '2026-11-06', id: '2026-11-06f', tid: '20:43', rader: [
    ['Fixat', 'Läkarintyg går nu att öppna i dina Ärenden och för ägare/superadmin i Admin › Ärenden. Filerna är fortfarande privata och öppnas med kortlivade, säkra länkar.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06e', tid: '20:29', rader: [
    ['Nytt', 'Meddelanden och Ärenden under profilikonen. Växla på samma sida: privata samtal med ämne och svarstråd, eller dina pågående och avslutade ärenden.'],
    ['Nytt', 'Skicka meddelande på en profil öppnar ett nytt privat meddelande med mottagaren förvald.'],
    ['Nytt', 'Admin har en gemensam, kompakt Ärenden-lista med typ- och statusfilter. Klara ligger kvar under Visa klara.', 'admin'],
    ['Nytt', 'Löner (verktyg & underlag) samlar timpris och verkstadstid per förare och månad. Bara ägaren och superadmin ser löneunderlag och andras sjukanmälningar.', 'agare']
  ] },
  { datum: '2026-11-06', id: '2026-11-06d', tid: '19:45', rader: [
    ['Nytt', 'Topplistor har fått ett Rekord-läge. Tryck på Rekord högst upp för att se den bästa dagen, veckan, månaden eller året för varje förare sedan 2025. Listan är anonym och din egen plats är markerad med "Du".'],
    ['Nytt', 'Välj vad du vill se i listan överst: Inkört, Dricks, Kr/mil, Kr/timme, Km, Antal resor, Kr/körning, Kr/pass, Dricks %, Flygresor, Km/körning, Belopp/körning och Körningar/pass. Hela listan visas, störst först. Läs nerifrån om du vill se de minsta.'],
    ['Förbättrat', 'Vid snitt, till exempel Kr/körning, står antalet körningar inom parentes, så här: 312 kr (25 st). I Rekord krävs ett minsta antal körningar för snitt: 5 på en dag, 15 på en vecka, 20 på en månad och 100 på ett år.'],
    ['Ändrat', 'Dricks räknas bara på kort, eftersom kontantdricks saknas i datan. Timmar och Verkstadstimmar finns inte längre i Topplistor.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06c', tid: '19:39', rader: [
    ['Nytt', 'Inkorg: tryck på profilikonen uppe till höger och välj Inkorg. Där ser du dina ärenden, till exempel felanmälan, verkstadstid och uppgifter, och svaren på dem. Ärenden där någon väntar på ditt svar är markerade med "Behöver ditt svar".'],
    ['Nytt', 'Klockan visar en kort notis när ägaren svarar på ett av dina ärenden. Tryck på den så öppnas svaret i Inkorgen. När du har läst svaret försvinner både notisen och pricken.'],
    ['Förbättrat', 'Samma statusord överallt: Ny, Pågår, Väntar på svar och Klar. Klara ärenden är ihopfällda under "Visa klara", så att listan blir kortare. Inget tas bort.'],
    ['Nytt', 'Admin › Ärenden: en gemensam lista med alla ärenden i åkeriet. Nya och olösta ligger först. Tryck på ett ärende för att läsa det, svara och ändra status.', 'agare']
  ] },
  { datum: '2026-11-06', id: '2026-11-06b', tid: '18:48', rader: [
    ['Nytt', 'Profil: menyn Profil öppnar en riktig profilsida. Där syns bil, forumstatistik, galleri och gästbok. Tryck på Redigera profil för frivilliga fält (hemmazon, favoritzon, pass, språk, bio, hobbyer, behörigheter, Uber/Bolt, tipset, startår) och välj om varje fält syns för alla eller bara för ditt åkeri. Personuppgifter och lösenord ligger bakom Redigera profil. Antal trådar och svar går att trycka på. Skicka meddelande kommer snart.']
  ] },
  { datum: '2026-11-06', id: '2026-11-06a', tid: '17:35', rader: [
    ['Nytt', 'Forum: klassisk layout med sektioner (Hjälp & guider, Frågor & svar, Allmänt, Önskemål & förslag, Buggar, Mitt åkeri, Admin). Önskemål och Buggar har status Ny / Pågår / Planerad / Klar. I Frågor & svar kan du markera svar som Löst.']
  ] },
  { datum: '2026-11-05', id: '2026-11-05c', tid: '01:11', rader: [
    ['Förbättrat', 'Körpassdata har nu samma meny högst upp som de andra sidorna: hemknapp, notiser och profil. Den gamla bakåtpilen och förarnumret är borta.']
  ] },
  { datum: '2026-11-05', id: '2026-11-05b', tid: '01:07', rader: [
    ['Förbättrat', 'Ankomster, flyg: statusraden visar nu "Landat kl" och sedan bagaget, till exempel "Landat kl 00:01 · Bagage ca kl 00:26". "Planerad" skrivs aldrig eftersom klockslaget redan syns. Flyg som Swedavia har tagit bort ur tidtabellen visas nu som "Borttagen" i stället för att försvinna. Skickar Swedavia andra lägen visas de också, till exempel "Avgått/på väg", "Inställt" eller "Omdirigerad".']
  ] },
  { datum: '2026-11-05', id: '2026-11-05a', tid: '00:50', rader: [
    ['Förbättrat', 'Ankomster, flyg: terminal och bagageband visas inte längre. Under flyget står bara bagagestatus: "Bagage ca kl", "Första bagage kl" eller "Sista bagage kl". Finns ingen info är raden tom.']
  ] },
  { datum: '2026-11-04', id: '2026-11-04i', tid: '23:40', rader: [
    ['Nytt', 'Kalender: ny vy "År" bredvid Dag, Vecka och Månad. Där ser du hela året med färgade prickar för evenemangen. Tryck på en dag för att se den, eller på månadens namn för att öppna månaden.']
  ] },
  { datum: '2026-11-04', id: '2026-11-04h', tid: '23:28', rader: [
    ['Förbättrat', 'Headern med hemknapp, rubrik, notiser och profil står nu kvar högst upp när du skrollar, så du slipper skrolla upp för att gå hem. Ikonerna visas utan ruta och ram.']
  ] },
  { datum: '2026-11-04', id: '2026-11-04g', tid: '23:25', rader: [
    ['Fixat', 'Topplistor, Bil: du ser nu bara din egen bil (den du kör nu eller körde senast), med din placering, till exempel "plats 3 av 7". Andra bilar visas inte.']
  ] },
  { datum: '2026-11-04', id: '2026-11-04e', tid: '23:22', rader: [
    ['Nytt', 'Topplistor: ny växlare högst upp, Förare eller Bil. Väljer du Bil visas alla listor per bil i stället för per förare, till exempel Bästa bil (mest inkört), kr/timme och flest körningar. Bilar du har kört är markerade. Appen kommer ihåg ditt val.']
  ] },
  { datum: '2026-11-04', id: '2026-11-04d', tid: '23:17', rader: [
    ['Fixat', 'Prognos: likadana bokningar i förklaringsrutan slås ihop till en rad, till exempel "Kombi 6 st", i stället för samma text flera gånger. Det går också att skrolla i rutan utan att den stängs.']
  ] },
  { datum: '2026-11-04', id: '2026-11-04c', tid: '04:46', rader: [
    ['Nytt', 'S admin: ny utvärdering, Prognostid: utskick eller kund? Den visar om prognosens tid ligger närmast när bokningen går ut till bil eller kundens beställda tid. Stan visas samlat och per zon, Landvetter för sig. Där finns också verifierade fall och en testknapp i Prognos som visar kundens tid (prognostid + offset per zon). Förarnas prognos och notiser ändras inte.', 'superadmin']
  ] },
  { datum: '2026-11-04', id: '2026-11-04b', tid: '00:38', rader: [
    ['Nytt', 'S admin-panel: en egen ruta 🛡️ S admin på startsidan. Där finns Zonguiden (test) och en ny rapport, Prognos mot resor, som jämför prognosen med åkeriets resor. Landvetter visas för sig. Underlaget är tunt än så länge. Servern släpper bara in S admin, inte demokonton eller master-inloggning.', 'superadmin'],
    ['Förbättrat', 'Zonguiden (test) har flyttat från Admin till S admin medan vi testar den. Den ska utvärderas när det finns fler åkerier och mer data.', 'agare']
  ] },
  { datum: '2026-11-04', id: '2026-11-04a', tid: '00:28', rader: [
    ['Förbättrat', 'Prognos: håll fingret på en ruta i schemat så får du en förklaring. Du ser kategori, om bokningen är säker, trolig eller osäker och varför, när den först syntes och ungefär när den kommer. Rutan försvinner när du släpper. Ett kort tryck fungerar också.'],
    ['Förbättrat', 'Prognos: barnstol och babyskydd sitter nu ihop med en bil. Bilens ruta får en liten rosa prick, och spalterna Barnstol och Babyskydd visar bilarna som har tillvalet. Antalet på zonflikarna räknar bara bilar. Bevakar du barnstol eller babyskydd får du notis när en bil med det tillvalet dyker upp.'],
    ['Förbättrat', 'Prognos: färre falska notiser. Bokningar som försvinner en minut och kommer tillbaka ger inte ny notis, och ett tomt svar från prognosen tömmer inte schemat.'],
    ['Förbättrat', 'Prognos: bättre tider för bokningar med kort varsel. Övriga brukar komma inom ca 10 min. Osäkra bokningar 40–80 min fram visas som "om 40–80 min". En bokning vars tid har passerat ligger kvar under Snart så länge prognosen har den.'],
    ['Nytt', 'Prognos › Landvetter: ✈ på en ruta betyder att flyg runt den tiden är försenade, så tiden kan ändras. Håll på rutan för att se vilka flyg.']
  ] },
  // tid: sätt klockslaget när Zonguiden går live (Christians "kör"), t.ex. tid: '14:05'. Byt datum och id om det inte blir 31 okt.
  { datum: '2026-10-31', id: '2026-10-31a', tid: '21:28', rader: [
    ['Nytt', 'Admin › Zonguide (test): se i vilka zoner åkeriets resor oftast startar en viss veckodag och timme, de senaste 12 veckorna. Sidan visar topp 5 just nu och hela passet 06–05. Den visar också hur mycket underlag det finns. Magasinet räknas inte. Bara du och S admin ser sidan, förarna ser den inte än.', 'agare']
  ] },
  { datum: '2026-10-30', id: '2026-10-30b', tid: '04:25', rader: [
    ['Nytt', 'Sjukanmälan finns nu för alla förare. Bil & verkstad heter nu Anmälningar & ärenden och har fliken 🤒 Sjuk. Där sjukanmäler du dig, friskanmäler dig och laddar upp ett foto av läkarintyget. Ägaren får en notis och svarar dig i appen. Tryck på 💰 Beräknad sjuklön så ser du ungefär hur mycket sjuklön det blir. Ingen diagnos eller orsak behövs. Bara du, ägaren och S admin ser din sjukanmälan.']
  ] },
  { datum: '2026-10-30', id: '2026-10-30a', tid: '04:23', rader: [
    ['Förbättrat', 'Admin › Bilar: förarlönen i bilkalkylen räknas nu med hela lönekostnaden. Utöver arbetsgivaravgiften 31,42 % kommer pension 4,4 %, löneskatt 1,067 % och övriga försäkringar 0,26 %. Det står i uträkningen för varje bil. Du kan ändra procentsatserna själv under Ändra lönekostnad och sjuklön, längst ner på sidan Bilar.', 'agare'],
    ['Nytt', 'Sjukanmälan: tryck på 💰 Beräknad sjuklön på en sjukperiod. Appen räknar ut ungefär hur mycket sjuklön det blir: 80 % av din snittlön de senaste 6 månaderna, från resdatan i appen, minus karensavdrag. Du ser också hur det är uträknat. Ägaren ser samma sak.']
  ] },
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
    ['Nytt', 'Test: Bil & verkstad heter nu Anmälningar & ärenden och har fliken 🤒 Sjuk. Där sjukanmäler du dig, friskanmäler dig och laddar upp läkarintyg. Ägaren får en notis och kan godkänna, begära läkarintyg eller avslå. Appen räknar sjukdagarna och visar vad som gäller dag 1, dag 2–14 och efter dag 14. Bara du, ägaren och S admin ser din sjukanmälan. Just nu syns det här bara för Christian och Berra.', 'agare']
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
