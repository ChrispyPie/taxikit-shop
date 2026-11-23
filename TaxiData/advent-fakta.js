/* 24 verifierade taxifakta till adventskalendern. Varje lucka har källa.
 * Egen text, inga avskrifter av upphovsrättsskyddat material. */
(function () {
  'use strict';
  window.ADVENT_FAKTA = [
    {
      dag: 1,
      titel: 'Sveriges första taxibil',
      text: 'Hösten 1899 köpte kronprins Gustaf (senare kung Gustaf V) en tysk Daimler. Bilen var för klen i backarna, så den såldes vidare till AB Taxameter i Stockholm och togs i trafik som droska nr 304 vid Gustav Adolfs torg – Sveriges första motordrivna taxi. Stockholmarna köade för att åka med nymodigheten, även om bilen ofta gick sönder.',
      kalla: 'SvD, “Med taxi genom historien”; Taxi Stockholm, historik; Automobilhistoriska Klubben.',
      url: 'https://www.svd.se/a/8b499346-24ab-334a-8eff-adf71db183ad/med-taxi-genom-historien',
      bild: 'advent-bilder/01-daimler.svg',
      bildalt: 'Illustration av en tidig taxibil från slutet av 1800-talet',
      bildtyp: 'illustration'
    },
    {
      dag: 2,
      titel: 'Taxameterplikt 1899',
      text: 'Redan 1897 provades 15 importerade tyska taxametrar i Stockholm. Polisen tyckte om dem, och 1899 blev taxameter obligatorisk för både häst- och bildroskor i staden. Samma år kom en svensk modell från Halda ut på marknaden.',
      kalla: 'Tekniska museet / DigitaltMuseum; Taxi Stockholm, historik.',
      url: 'https://digitaltmuseum.se/021026329957/taxameter',
      bild: 'advent-bilder/02-taxameter.svg',
      bildalt: 'Illustration av en taxameter med siffor',
      bildtyp: 'illustration'
    },
    {
      dag: 3,
      titel: 'Halda och “kolonistugan”',
      text: 'Den svenska taxametern konstruerades av Henning Hammarlund i Svängsta. Tillverkningen av Halda-taxametern kom igång 1902. Modell 2, från omkring 1907, vägde rejält och kallades av droskkuskarna för “kolonistugan” för att den var så stor.',
      kalla: 'Tekniska museet / DigitaltMuseum, Halda taxameter Modell 2.',
      url: 'https://digitaltmuseum.se/021026329957/taxameter',
      bild: 'advent-bilder/03-halda.svg',
      bildalt: 'Illustration av en Halda-taxameter som en liten stuga',
      bildtyp: 'illustration'
    },
    {
      dag: 4,
      titel: 'Stockholms Droskägareförening',
      text: 'Den 6 december 1899 bildades Stockholms Droskägareförening, ursprunget till dagens Taxi Stockholm. Vid starten fanns 129 registrerade droskägare, 175 droskor och 1 390 hästar. Man började också använda telefonen för att samla beställningar.',
      kalla: 'Taxi Stockholm, “Taxi Stockholms historia”.',
      url: 'https://www.taxistockholm.se/sv/hjalpcenter/om-oss/taxi-stockholms-historia/',
      bild: 'advent-bilder/04-forening.svg',
      bildalt: 'Illustration av ett föreningsvapen och ett handslag',
      bildtyp: 'illustration'
    },
    {
      dag: 5,
      titel: 'Droska och ordet taxi',
      text: 'Ordet taxi kommer från taxameter (taxa + mätare). I Sverige levde ordet droska kvar länge. Enligt Vi Bilägare slog “taxi” igenom först i slutet av 1930-talet, även om bilarna då redan hade rullat i flera decennier.',
      kalla: 'Vi Bilägare, “Svenska taxibilar genom tiderna” (15 maj 2021).',
      url: 'https://www.vibilagare.se/backspegeln/svenska-taxibilar-genom-tiderna-baltesbom-och-skoltaxi',
      bild: 'advent-bilder/05-ord.svg',
      bildalt: 'Illustration med orden taxi och droska',
      bildtyp: 'illustration'
    },
    {
      dag: 6,
      titel: 'Tänd lykta betydde ledigt',
      text: 'Redan på hästdroskornas tid fanns en föregångare till takskylten. En tänd lykta betydde att vagnen var ledig. Senare taxametrar fick en fällbar ledigskylt som kunde stå i lägen som Ledig, olika taxor och Kassa.',
      kalla: 'Vi Bilägare, 15 maj 2021; Tekniska museet, Halda Modell 2.',
      url: 'https://www.vibilagare.se/backspegeln/svenska-taxibilar-genom-tiderna-baltesbom-och-skoltaxi',
      bild: 'advent-bilder/06-lykta.svg',
      bildalt: 'Illustration av en tänd drosklykta',
      bildtyp: 'illustration'
    },
    {
      dag: 7,
      titel: 'Gästgiveri redan 1636',
      text: 'Åkeriyrket är äldre än bilen. År 1636 ålades svenska krögare och värdshusvärdar att hålla stall, häst och kärra så att gästerna kunde ta sig vidare. Det är ett av de tidigaste spåren av organiserad personbefordring i Sverige.',
      kalla: 'Översikt i Taxi Göteborgs historik (Wikipedia, avsnittet Historia).',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/07-gastgiveri.svg',
      bildalt: 'Illustration av ett gästgiveri',
      bildtyp: 'illustration'
    },
    {
      dag: 8,
      titel: 'Taxi i Göteborg 1761',
      text: '1761 utfärdade borgmästaren i Göteborg en förordning om en skjutsinrättning. Då fanns redan ett par vagnar som rika köpmän delade på. I slutet av 1700-talet kunde taxan ligga på 1 riksdaler – och resan kunde ta flera timmar.',
      kalla: 'Taxi Göteborgs historik (Wikipedia, avsnittet Historia).',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/08-goteborg.svg',
      bildalt: 'Illustration av ett segelfartyg och en krona',
      bildtyp: 'illustration'
    },
    {
      dag: 9,
      titel: 'Sleipner vid Hotellplatsen',
      text: '1907 startade Anders Skog och ingenjör Siewens företaget Sleipner i Göteborg, med bilar som komplement till hästdroskorna. I oktober 1907 öppnade de stadens första taxistation vid Hotellplatsen, med fyra bilar: två täckta och två öppna.',
      kalla: 'Taxi Göteborgs historik; Kjell Hjern, Ett svunnet Göteborg (1964).',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/09-sleipner.svg',
      bildalt: 'Illustration av hästen Sleipner',
      bildtyp: 'illustration'
    },
    {
      dag: 10,
      titel: 'Taxi Göteborg bildas 1922',
      text: 'I mars 1922 bildades Göteborgs Droskägareförening u.p.a. när Sleipner gick samman med flera enmansföretag. Det är ursprunget till dagens Taxi Göteborg, som fortfarande är en ekonomisk förening där medlemmarna driver åkerierna.',
      kalla: 'Taxi Göteborgs historik; föreningens egen frågesport om 90 år (bildad 1 mars 1922).',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/10-taxigbg.svg',
      bildalt: 'Illustration av en taxi-bricka från 1922',
      bildtyp: 'illustration'
    },
    {
      dag: 11,
      titel: 'Första taxameterkörningen i Göteborg',
      text: 'Den första taxameterkörningen i Göteborg gjordes 1901, med en hästdroska. Hyrverket, som konkurrerade med Sleipner, hade då köpt in 60 taxametrar från Tyskland. Tekniken kom alltså hit innan bilarna blev vanliga på gatorna.',
      kalla: 'Taxi Göteborg, frågesport “Om Göteborg & Taxi Göteborg under 90 år”.',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/11-korning.svg',
      bildalt: 'Illustration av en tidig taxibil med taxameter',
      bildtyp: 'illustration'
    },
    {
      dag: 12,
      titel: 'Fyra taxizoner 1952',
      text: 'År 1952 delade Länsstyrelsen i Göteborgs och Bohus län in Göteborg i fyra taxizoner. Zontänkandet är alltså inte en modern appidé – förare och växel har arbetat med zoner i staden i över sjuttio år.',
      kalla: 'Taxi Göteborgs historik (Wikipedia, avsnittet Historia).',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/12-zoner.svg',
      bildalt: 'Illustration av fyra taxizoner som ringar på en karta',
      bildtyp: 'illustration'
    },
    {
      dag: 13,
      titel: 'Datoriserad beställning 1980',
      text: '1980 införde Taxi Göteborg en datoriserad beställningsfunktion. Bolaget har själv beskrivit det som att de var först i världen med det. Oavsett just den rangordningen var det ett tidigt kliv från telefonväxel mot den digitala dirigering förare använder i dag.',
      kalla: 'Taxi Göteborg, frågesport “Om Göteborg & Taxi Göteborg under 90 år”.',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/13-dator.svg',
      bildalt: 'Illustration av en dator från 1980-talet',
      bildtyp: 'illustration'
    },
    {
      dag: 14,
      titel: 'T-Ford och 1920-talets uppsving',
      text: 'Det verkliga uppsvinget för taxirörelsen i Sverige kom i början av 1920-talet. Första världskriget var över och den pålitliga T-Forden kunde köpas till ett överkomligt pris. Många nya taxiföretag startade, och typen av trafik började likna den vi känner i dag.',
      kalla: 'Gert Ekström, intervjuad i SvD, “Med taxi genom historien”.',
      url: 'https://www.svd.se/a/8b499346-24ab-334a-8eff-adf71db183ad/med-taxi-genom-historien',
      bild: 'advent-bilder/14-tford.svg',
      bildalt: 'Illustration av en T-Ford',
      bildtyp: 'illustration'
    },
    {
      dag: 15,
      titel: 'Namnanropet Droskstation',
      text: 'Efter att droskägarna i Stockholm slagit sig samman sattes stolpar med direkttelefon upp i staden, där vagnarna kunde vänta på körning. Den 21 maj 1901 infördes namnanropet “Droskstation” i telefonnätet, så att kunder slippa ringa runt till enskilda åkare.',
      kalla: 'Wikipedia, Taxi Stockholm (Historia); Taxi Stockholm, historik.',
      url: 'https://sv.wikipedia.org/wiki/Taxi_Stockholm',
      bild: 'advent-bilder/15-station.svg',
      bildalt: 'Illustration av en skylt med texten Droskstation',
      bildtyp: 'illustration'
    },
    {
      dag: 16,
      titel: 'Radiodirigering på 1950-talet',
      text: 'På 1950-talet inledde Taxi Trafikförening i Stockholm prov med att dirigera bilarna via radio. Det var ett stort steg från fasta telefonstolpar: växeln kunde nu nå bilar i rörelse, ungefär som dagens digitala tilldelning – bara med mer knaster.',
      kalla: 'Taxi Stockholm, “Taxi Stockholms historia”.',
      url: 'https://www.taxistockholm.se/sv/hjalpcenter/om-oss/taxi-stockholms-historia/',
      bild: 'advent-bilder/16-radio.svg',
      bildalt: 'Illustration av en radioapparat från 1950-talet',
      bildtyp: 'illustration'
    },
    {
      dag: 17,
      titel: 'Elektronisk taxameter',
      text: 'De första elektroniska taxametrarna kom på 1970-talet. Dessförinnan var apparaterna mekaniska urverk med räkneverk bakom glas. I dag är taxametern datoriserad och en del av samma kedja som kortterminal och kvitton.',
      kalla: 'SvD, “Med taxi genom historien”; Vi Bilägare, 15 maj 2021.',
      url: 'https://www.svd.se/a/8b499346-24ab-334a-8eff-adf71db183ad/med-taxi-genom-historien',
      bild: 'advent-bilder/17-elektronisk.svg',
      bildalt: 'Illustration av en elektronisk taxameter',
      bildtyp: 'illustration'
    },
    {
      dag: 18,
      titel: 'Äldre än bilen: räkneverk i Rom',
      text: 'Redan under romarriket fanns hyrvagnar med räkneverk som visade hur långt kunden hade rest. Den moderna taxametern uppfanns 1891. Alltså: att mäta resan och ta betalt efter väg är en idé med ungefär två tusen år på nacken.',
      kalla: 'SvD, “Med taxi genom historien”.',
      url: 'https://www.svd.se/a/8b499346-24ab-334a-8eff-adf71db183ad/med-taxi-genom-historien',
      bild: 'advent-bilder/18-rom.svg',
      bildalt: 'Illustration av antika pelare och ett tidigt räkneverk',
      bildtyp: 'illustration'
    },
    {
      dag: 19,
      titel: 'Volvosuggan i taxitrafik',
      text: 'Under lång tid dominerade 1938 års modeller av Volvo “suggan” bland svenska droskbilar. Innan dess hade gatorna setts med allt från Daimler och Cadillac till Minerva. En typisk taxibil var alltså länge en Volvo, inte en specialbyggd “taxibil” från början.',
      kalla: 'Taxi Stockholm, “Taxi Stockholms historia”.',
      url: 'https://www.taxistockholm.se/sv/hjalpcenter/om-oss/taxi-stockholms-historia/',
      bild: 'advent-bilder/19-volvo.svg',
      bildalt: 'Illustration av en Volvo PV, kallad suggan',
      bildtyp: 'illustration'
    },
    {
      dag: 20,
      titel: 'Krig, bensinbrist och rekvisition',
      text: 'Under andra världskriget blev det ont om både bensin och däck. Dessutom hade staten rätt att infordra taxibilar som ansågs lämpliga för militärt bruk. Många åkare fick ställa av – ett bakslag som kom efter 1930-talets depression och konkurrens från bussen.',
      kalla: 'Gert Ekström i SvD, “Med taxi genom historien”.',
      url: 'https://www.svd.se/a/8b499346-24ab-334a-8eff-adf71db183ad/med-taxi-genom-historien',
      bild: 'advent-bilder/20-krig.svg',
      bildalt: 'Illustration av en taxi med nedbländad lampa i mörker',
      bildtyp: 'illustration'
    },
    {
      dag: 21,
      titel: 'Landvetter invigs 1977',
      text: 'Göteborg Landvetter Airport invigdes officiellt den 1 oktober 1977 av kung Carl XVI Gustaf. Den 3 oktober klockan 06:00 lyfte det första planet, och samma dag stängdes Torslanda flygplats efter 54 år. För Göteborgs taxiförare blev Landvetter snabbt en av de viktigaste målpunkterna.',
      kalla: 'Swedavia, “Landvetter 40 år”; LFV historik.',
      url: 'https://www.swedavia.se/landvetter/landvetter40/',
      bild: 'advent-bilder/21-landvetter.svg',
      bildalt: 'Illustration av ett flygplan och en taxi vid Landvetter',
      bildtyp: 'illustration'
    },
    {
      dag: 22,
      titel: 'Varför heter det Landvetter?',
      text: 'Flygplatsen ligger i Härryda kommun, inte i Landvetter. Namnet valdes ändå eftersom grannsocknen Landvetters namn ansågs vara lättare att uttala, särskilt internationellt. Första planet som landade den 3 oktober 1977 var SAS DC-9-41 Are Viking, på väg mot Stockholm.',
      kalla: 'Swedavia, “Landvetter 40 år”.',
      url: 'https://www.swedavia.se/landvetter/landvetter40/',
      bild: 'advent-bilder/22-namn.svg',
      bildalt: 'Illustration av en gård och ett flygplan',
      bildtyp: 'illustration'
    },
    {
      dag: 23,
      titel: 'Hög hatt i kupén',
      text: 'De tidiga droskbilarna byggdes ofta efter hästvagnmakarnas tradition: inte alltid med väggar och dörrar, men med mattor, gardiner och askkopp. Takhöjden skulle räcka för att kunderna skulle kunna sitta kvar med hög hatt. Bekvämlighet var en del av yrket redan då.',
      kalla: 'Gert Ekström i SvD, “Med taxi genom historien”.',
      url: 'https://www.svd.se/a/8b499346-24ab-334a-8eff-adf71db183ad/med-taxi-genom-historien',
      bild: 'advent-bilder/23-hatt.svg',
      bildalt: 'Illustration av en hög hatt',
      bildtyp: 'illustration'
    },
    {
      dag: 24,
      titel: 'Förening, inte en enda ägare',
      text: 'Taxi Göteborg är en ekonomisk förening. Det är medlemmarna som driver åkerierna, äger bilarna och anställer förare. Samma idé – att åkare går samman om växel, varumärke och regler – går tillbaka till droskägareföreningarna som bildades för drygt hundra år sedan.',
      kalla: 'Taxi Göteborgs historik (Wikipedia); föreningens egen beskrivning av medlemsmodellen.',
      url: 'https://sv.wikipedia.org/wiki/Taxi_G%C3%B6teborg',
      bild: 'advent-bilder/24-kooperativ.svg',
      bildalt: 'Illustration av flera personer i en förening',
      bildtyp: 'illustration'
    }
  ];
})();
