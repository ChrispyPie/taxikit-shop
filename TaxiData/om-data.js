/* Texterna på sidan "Om appen". Ändra fritt här: version, text och frågor/svar.
 * Svaren är vanlig text (ingen HTML). Ny rad i ett svar: skriv \n.
 */
window.OM_DATA = {
  version: '2026.10.25',
  intro: 'TaxiData är förarappen för oss som kör för Taxi Göteborg. Här ser du dina pass och resor och annat som hjälper dig i jobbet.',
  features: [
    ['🚗', 'Körpassdata', 'dina pass, resor och belopp'],
    ['✈️', 'Ankomster', 'tåg till Göteborg C och flyg till Landvetter'],
    ['🏆', 'Topplistor', 'hur du ligger till jämfört med andra (anonymt)'],
    ['🛠️', 'Bil & verkstad', 'felanmälan, sånt som behövs till bilen och verkstadstimmar'],
    ['📅', 'Kalender', 'konserter, matcher, mässor och andra evenemang'],
    ['💬', 'Forum', 'frågor, tips, förslag och buggar'],
    ['🤖', 'Hjälpbot', 'liten hjälpare längst ner på skärmen']
  ],
  builder: 'Appen byggs av Christian (S admin) och är under utveckling. Saker kan ändras, och ibland blir något fel.',
  report: 'Hittar du ett fel eller har en idé? Skriv i Forum under Buggar eller Förslag. Där ser du också när det händer något med ditt inlägg.',
  faq: [
    { q: 'Var kommer mina pass och resor ifrån?',
      a: 'De hämtas automatiskt från servern, samma system som taxametern skickar till. Du behöver inte skriva in något själv.' },
    { q: 'Hur ofta uppdateras siffrorna?',
      a: 'Ungefär en gång i timmen. Det kan ta en stund efter att ett pass eller en resa är klar innan den syns.' },
    { q: 'Varför syns inte passet jag kör just nu?',
      a: 'Ett pass syns först när det är avslutat. Servern har inte sluttid, arbetad tid och antal resor förrän passet är slut.' },
    { q: 'Varför har ett kvitto -02 i slutet, och var tog -01 vägen?',
      a: 'Ett kvitto som slutar på -02 är en rättad version av samma kvitto (-01). Appen räknar bara den senaste versionen, så att resan inte räknas två gånger.' },
    { q: 'Vem ser mitt namn i Topplistor?',
      a: 'Andra förare ser bara placering och värde, inte namn. Din egen rad visas som "Du". Bara ägaren ser namn.' },
    { q: 'Vem ser mina felanmälningar i Bil & verkstad?',
      a: 'Du ser dina egna anmälningar. Ägaren och S admin ser alla, så att felet kan åtgärdas. Andra förare ser inte dina anmälningar.' },
    { q: 'Vem ser det jag skriver i Forum?',
      a: 'Alla förare i företaget. Ditt namn visas som förnamn och första bokstaven i efternamnet, t.ex. "Anna S.". Du kan ändra eller ta bort det du har skrivit.' },
    { q: 'Hur byter jag profilbild?',
      a: 'Tryck på den runda knappen uppe till höger och välj "Lägg till profilbild" eller "Byt profilbild". Där kan du också ta bort bilden.' },
    { q: 'Hur loggar jag in första gången?',
      a: 'Du får en aktiveringslänk av din åkare. Öppna den, skriv ditt förar-ID och välj ett lösenord (minst 6 tecken). Sedan loggar du in med förar-ID och lösenord.' },
    { q: 'Jag har glömt mitt lösenord. Vad gör jag?',
      a: 'Tryck på "Glömt lösenord?" på inloggningssidan och skriv ditt förar-ID. Finns en e-postadress i din profil får du en länk där du väljer ett nytt lösenord. Ingen e-post? Ring din åkare, så kan hen nollställa lösenordet.' },
    { q: 'Hur ändrar jag mina uppgifter?',
      a: 'Tryck på den runda knappen uppe till höger och välj "Profil".' }
  ]
};
