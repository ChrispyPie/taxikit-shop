/* Texterna på sidan "Om appen". Ändra fritt här: version, text och frågor/svar.
 * Svaren är vanlig text (ingen HTML). Ny rad i ett svar: skriv \n.
 */
window.OM_DATA = {
  version: '2026.10.26',
  intro: 'TaxiData är förarappen för oss som kör för Taxi Göteborg. Här ser du dina pass och resor och annat som hjälper dig i jobbet.',
  features: [
    ['🚗', 'Körpassdata', 'dina pass, resor och belopp'],
    ['💰', 'Lönekoll', 'ungefär vad du får i lön för det du kört in'],
    ['✈️', 'Ankomster', 'tåg till Göteborg C, flyg till Landvetter och båtar från Fredrikshamn och Kiel'],
    ['🏆', 'Topplistor', 'hur du ligger till jämfört med andra (anonymt)'],
    ['✉️', 'Meddelanden och Ärenden', 'privata meddelanden, felanmälan, verkstadstid och sjukanmälan'],
    ['📅', 'Kalender', 'konserter, matcher, mässor och andra evenemang'],
    ['💬', 'Forum', 'Hjälp & guider, Frågor & svar, Allmänt, Önskemål, Buggar, Mitt åkeri'],
    ['📌', 'Mina bevakningar', 'bevakade tåg, flyg och båtar, kalenderhändelser och bokade tider i en tidslinje eller lista', 'mina-bevakningar'],
    ['🔮', 'Prognos', 'kommande bokningar per zon och morgonprognos'],
    ['🤖', 'Hjälpbot', 'liten hjälpare på startskärmen']
  ],
  builder: 'Appen byggs av Christian (superadmin) och är under utveckling. Saker kan ändras, och ibland blir något fel.',
  builder_demo: 'Appen är under utveckling. Saker kan ändras, och ibland blir något fel.',   // demokonton: inget namn
  report: 'Hittar du ett fel eller har en idé? Skriv i Forum under Buggar eller Önskemål & förslag. Där ser du också status (Ny / Pågår / Planerad / Klar).',
  faq: [
    { q: 'Vad loggas när jag använder appen?',
      a: 'Inloggningar och ändringar loggas med IP-adress och enhet för säkerhetens skull. Loggen sparas i 13 månader. Loggen visar till exempel när någon loggar in, byter lösenord eller ändrar uppgifter. Den används bara för att upptäcka och utreda missbruk. Enheten är ett slumpat nummer som appen sparar i telefonen, inte telefonens namn eller nummer.' },
    { q: 'Hur räknar Lönekoll ut min lön?',
      a: 'Lönekoll tar det du kört in i månaden, drar bort BOM, moms och avgifter och räknar sedan provision, semesterersättning och skatt, på samma sätt som lönebeskedet. Skatten tas från Skatteverkets skattetabell för 2026 och anpassas efter hur hög bruttolönen är den månaden. Semesterersättningen är förvalt inbakad i månadslönen; under Inställningar kan du välja att räkna utan den, och då visas intjänad semester för månaden och totalt för den period det finns kördata för. Tabell och kolumn, eller en fast procent, och övriga avdrag kan du ändra själv. Det är en uppskattning, lönebeskedet gäller. Obs: rättade kvitton från Taxi Göteborg kommer in den 16:e varje månad, så lönen här kan visa lite fel fram till dess.' },
    { q: 'Var kommer mina pass och resor ifrån?',
      a: 'De hämtas automatiskt från servern, samma system som taxametern skickar till. Du behöver inte skriva in något själv.' },
    { q: 'Hur ofta uppdateras siffrorna?',
      a: 'Ungefär en gång i timmen. Det kan ta en stund efter att ett pass eller en resa är klar innan den syns.' },
    { q: 'Varför syns inte passet jag kör just nu?',
      a: 'Ett pass syns först när det är avslutat. Servern har inte sluttid, arbetad tid och antal resor förrän passet är slut.' },
    { q: 'Varför har ett kvitto -02 i slutet, och var tog -01 vägen?',
      a: 'Ett kvitto som slutar på -02 (eller -03, -04 …) är en rättad version av samma kvitto. Appen räknar bara den senaste versionen, så att resan inte räknas två gånger. De äldre versionerna ligger kvar under kvittot, överstrukna och nedtonade.' },
    { q: 'Vem ser mitt namn i Topplistor?',
      a: 'Andra förare ser bara placering och värde, inte namn. Din egen rad visas som "Du". Bara ägaren ser namn.' },
    { q: 'Vem ser mina felanmälningar?',
      a: 'Du ser dina egna anmälningar. Ägaren och superadmin ser alla, så att felet kan åtgärdas. Andra förare ser inte dina anmälningar.' },
    { q: 'Vem ser det jag skriver i Forum?',
      a: 'Allmänt, Önskemål & förslag och Buggar är gemensamma: där ser förare från alla anslutna åkerier det du skriver, med ditt åkeris namn bredvid ditt namn. Mitt åkeri ser bara förarna i ditt eget åkeri. Admin-sektionen syns bara för ägare och superadmin. Ditt namn visas som förnamn och första bokstaven i efternamnet, t.ex. "Anna S.".' },
    { q: 'Hur byter jag profilbild?',
      a: 'Tryck på den runda knappen uppe till höger och välj "Lägg till profilbild" eller "Byt profilbild". Där kan du också ta bort bilden.' },
    { q: 'Hur loggar jag in första gången?',
      a: 'Du får en aktiveringslänk av din åkare. Öppna den, skriv ditt förar-ID och välj ett lösenord (minst 6 tecken). Sedan loggar du in med förar-ID och lösenord.' },
    { q: 'Jag har glömt mitt lösenord. Vad gör jag?',
      a: 'Tryck på "Glömt lösenord?" på inloggningssidan och skriv ditt förar-ID. Finns en e-postadress i din profil får du en länk där du väljer ett nytt lösenord. Ingen e-post? Ring din åkare, så kan åkaren nollställa lösenordet.' },
    { q: 'Hur ändrar jag mina uppgifter?',
      a: 'Tryck på den runda knappen uppe till höger och välj "Profil".' }
  ]
};
