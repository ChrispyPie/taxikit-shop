/* Berra: en stillastående figur längst ner på startskärmen, under rutorna.
 * Inte valbar, syns för alla, ingen inställning för att ta bort honom.
 * Han säger bara något när man trycker. Rörelse bara om Animationer är på. */
(function () {
  'use strict';
  if (window.BERRA) return;

  var W = 48, H = 52, MARGIN = 10;
  var KEY_BAG = 'td_berra_bag';
  var BUBBLE_MS = 30000;
  var K = '#1a1a1a', SKIN = '#f6d2b3';
  var HAIR = '#e4c45a', HAIR_DARK = '#c9a84a';
  var SHIRT = '#6d7a88', PANTS = '#3d4550';
  var EYE = '#7ec8e8', EYE_IN = '#3a7ca5';

  var JOKES = [
    'Berra sover inte på natten. Natten tar rast när Berra kör.',
    'När Berra tar en storbil backar de andra undan av ren vana.',
    'Berra behöver ingen GPS. Göteborg frågar honom om vägen.',
    'När Berra spelar klart en bana ber sista bossen om en returmatch.',
    'Klockan frågar Berra när det är natt.',
    'Berra räknar inte poäng. Spelet räknar Berra.',
    'En storbil får mer plats när Berra sätter sig. Inte tvärtom.',
    'När Berra blinkar i mörkret tänds gatlyktorna.',
    'Berra har inte högsta rekordet. Rekordet har Berra.',
    'Taxikön flyttar på sig när Berra kommer till hållplatsen.',
    'Berra laddar inte ner kartor. Kartorna laddar ner Berra.',
    'Berra pausar inte spelet. Spelet väntar på Berra.',
    'Berra behöver ingen ficklampa. Natten ser honom ändå.',
    'Chefer brukar kalla in folk. På Taxi Göteborg ringer folk till Berra.',
    'Berra dör inte i spelet. Spelet tar en paus.',
    'Berra spelar inte på lätt. Lätt läget spelar på Berra.',
    'En natt utan Berra är bara tretton timmar lång.',
    'Berra hämtar inte på adressen. Adressen kommer ut.',
    'Berra läser inte instruktioner. Instruktionerna tar anteckningar.',
    'Berra loggar inte in i spelet. Spelet loggar in hos Berra.',
    'Andra tar rast efter natten. Natten tar rast efter Berra.',
    'När Berra backar en storbil flyttar hörnet på sig.',
    'Berra trycker inte på start. Start trycker på Berra.',
    'I rusningen tar andra den korta vägen. Berra tar den rätta.',
    'Berra sparar inte spelet. Spelet sparar sig när Berra reser sig.',
    'En bokning klockan tre på natten ser sig glad ut när Berra tar den.',
    'När Berra tar en kaffe på natten blir den extra stark av respekt.',
    'I ett race kommer mållinjen mot Berra.',
    'Berra fattar beslut så snabbt att datorn får be om en stund.',
    'En storbil får inte plats i en liten lucka. Utom när Berra visar hur.',
    'När radion sprakar på natten är det Göteborg som säger hej till Berra.',
    'Berra har inga favoritbanor. Banorna har en favoritchaufför.',
    'Berra förlorar inte en duell i spelet. Motståndaren får en lärorik kväll.',
    'Berra behöver ingen högtalare i bilen. Storbilen lyssnar ändå.',
    'På natten är det Berra som bestämmer vilken väg som är öppen.',
    'När Berra är i tjänst håller tidtabellen andan.',
    'Berra tar inte en genväg i spelet. Genvägen tar Berra.',
    'När det är rusning kör de andra runt Berra. Inte för att han är långsam.',
    'Berra väcker inte natten. Natten är redan vaken när han kommer.',
    'En storbil har många säten. När Berra kör räcker de till.',
    'Berra frågar inte om highscore. Highscore frågar om Berra.',
    'När Berra blinkar till vänster lyssnar hela leden.',
    'Berra behöver ingen pausmeny. Världen väntar tills han är klar.',
    'På Taxi Göteborg börjar nattskiftet när Berra sätter sig.',
    'När Berra kör mot Landvetter flyttar landningsbanan lite närmare.',
    'Flygledningen på Landvetter väntar in Berra, inte tvärtom.',
    'Bagaget går av sig självt när Berra står vid Landvetter.',
    'Ett försenat flyg skyndar sig när det hör att Berra väntar.',
    'Berra hämtar inte vid terminalen. Terminalen rullar fram.',
    'På Landvetter räknas ankomsttid från när Berra är på plats.',
    'När Berra tar en landningskörning landar planet i tid av respekt.',
    'Berra behöver ingen skylt i hallen. Folk hittar honom ändå.',
    'Dimman på Landvetter ber Berra om sikten innan den lägger sig.',
    'Parkeringshuset vid Landvetter hittar en lucka när Berra rullar in.',
    'Skylten Arrivals blinkar vänligt när den ser Berra.',
    'Berra känner igen terminalsiffrorna. De känner igen honom tillbaka.',
    'Flygbussen möter Berra vid hållplatsen, inte tvärtom.',
    'När Berra står i ankomsthallen slår skärmarna om till rätt band.',
    'En försening på Landvetter kortas ner när Berra är i hallen.',
    'Berra hämtar i tid. Flyget anpassar sig efter det.',
    'Berra blandar inte ihop terminaler. Terminalerna håller sig isär.',
    'En lång resa slutar mjukt när Berra väntar vid dörren.',
    'När det är fullt vid taxikön på Landvetter öppnas en lucka åt Berra.',
    'Regnet i Göteborg faller snett för att inte träffa Berras ruta.',
    'Halkan ber Berra om lov innan den sätter sig på vägen.',
    'När Berra kör i blåst håller västvinden sig lite tystare.',
    'Snön i Göteborg väntar med att lägga sig tills Berra har parkerat.',
    'Dimman bakom Berra skingras av ren vana.',
    'SMHI ringer Berra när de är osäkra på natten.',
    'Isen på bron backar undan när Berra rullar ut.',
    'Ett oväder runt Järntorget tar omvägen när Berra är i tjänst.',
    'Berra sätter inte på torkarna. Regnet torkar sig självt.',
    'Solen över Göteborg väntar med att gå upp tills Berra är klar.',
    'Lövhalkan håller sig på sin kant när Berra svänger.',
    'Vinden längs Avenyn håller andan när Berra passerar.',
    'Frosten på rutan släpper när Berra tar i handtaget.',
    'Berra kollar inte vädret. Vädret kollar när Berra kör ut.',
    'Berra sätter inte på dimljusen. Dimman backar undan först.',
    'Västvinden längs hamnen håller mössan på när Berra kör förbi.',
    'En solig morgon väntar in att Berra har parkerat.',
    'Regnrocken i bilen får vila. Skuren väntar ut Berra.',
    'Tåget kan ställas in. Berras natt ställs inte in.',
    'Berras kaffe behöver ingen mikro. Den är redan vaken.',
    'När automaten på natten ser Berra kokar den en extra kopp.',
    'Sockret rör om sig självt när Berra har bråttom.',
    'En kall kopp blir varm bara Berra tittar på den.',
    'Baristan på natten frågar Berra hur starkt. Svaret är ja.',
    'Berras termos håller värmen av respekt, inte av isolering.',
    'Berra spiller inte kaffe. Kaffet håller sig i muggen.',
    'Automaten i garaget ger dubbel espresso när den ser Berra.',
    'Berra rör om kaffet med blicken.',
    'När bakjouren kokar kaffe står Berras kopp framme först.',
    'Berras kopp är aldrig tom länge. Natten fyller på.',
    'Mjölken skummar sig när Berra har fem minuter över.',
    'Berra tar kaffet svart. Kaffet tackar för förtroendet.',
    'En termos i storbilen håller tre pass. För Berra räcker en.',
    'Kaffemaskinen på kontoret ramlar i kö när Berra är i närheten.',
    'En kaffe i Berras mugg slutar aldrig att räcka hela ronden.',
    'Höjden på en viadukt räknar efter när Berra kommer i storbil.',
    'Berra bokar inte storbil. Storbilen bokar kvällen hos Berra.',
    'En barnvagn, tre väskor och en rullstol. Berras storbil nickar bara.',
    'När Berra parkerar en storbil blir rutan större.',
    'Backkameran i storbilen ber Berra om råd.',
    'En storbil i Berras tjänst svänger snävare än måttet tillåter.',
    'Berra behöver ingen ramplista. Storbilen minns höjderna.',
    'När Berra lastar en storbil går packningen rätt första gången.',
    'En stol i storbilen fälls av sig själv när Berra nickar.',
    'Höjdgränsen på huset läser om skylten när Berra kommer.',
    'En storbil i rusning är i vägen. Med Berra är den en lösning.',
    'När det är fullt i en vanlig bil räcker Berras storbil ändå till.',
    'Storbilens dörrar håller upp sig när Berra har kunder med väskor.',
    'Berra backar med speglarna i vila. Omvärlden backar först.',
    'Kantstenen sänker sig en centimeter när Berra rampar.',
    'Parkering på Heden ordnar en lucka åt Berras storbil.',
    'En storbil med Berra tar kurvan nästan som en personbil.',
    'Berra tar inte hjälp när han vänder. Vakterna tittar bara på.',
    'Storbilen piper inte när Berra backar. Den litar på honom.',
    'Barnstolen i storbilen sätter sig rätt innan Berra har bett om det.',
    'När Berra öppnar bakluckan finns det alltid en lucka till.',
    'På morgonmötet väntar tavlan in vad Berra har att säga.',
    'Berra lämnar inte rapport. Rapporten lämnar sig hos Berra.',
    'I garaget på Taxi Göteborg startar bilarna när Berra går förbi.',
    'Trafikledningen frågar Berra vilken zon som gäller i natt.',
    'När kontoret är stängt har Berra fortfarande nyckeln till natten.',
    'En ny förare får kartan. Berra får en nick från chefen.',
    'Berra stämplar inte in. Klockan stämplar in hos Berra.',
    'Schemat på väggen rättar sig när Berra har kört klart.',
    'Berra tar inte rast i personalrummet. Rummet tar rast.',
    'En ny zon skickas först till Berra, sedan till kartan.',
    'När någon frågar efter chefen på natten pekar de mot Berras bil.',
    'Berra fyller inte i körjournalen. Journalen fyller i sig.',
    'På Taxi Göteborg är "fråga Berra" ett godkänt arbetssätt.',
    'Berra har ingen reservnyckel. Låset känner igen honom.',
    'Morgonskiftet hälsar på det som är kvar av natten: Berra.',
    'Berra lämnar bilen ren. Damm väntar till efter passet.',
    'När typen är slut får andra höra det av Berra, inte av tavlan.',
    'Chefen på dagen ringer trafikledningen. På natten ringer de Berra.',
    'Ett schemahål på natten fylls när Berra säger att det går.',
    'Berra har inget fack för nycklar. Nycklarna har ett fack för Berra.',
    'När Berra råkar ut för lagg väntar servern på honom.',
    'Laddningsskärmen skippar sig när Berra tittar på den.',
    'Berra samlar inte loot. Lootet lägger sig i en hög bredvid honom.',
    'Berra läser inte patch notes. Patchen läser Berra först.',
    'När Berra tar fram handkontrollen ber knapparna om en stund.',
    'Ett DLC väntar med att släppas tills Berra har tid.',
    'Lagget i spelet ber Berra om ursäkt och rätar ut sig.',
    'När Berra speedrunar tar klockan en omväg runt tiden.',
    'En tutorial stänger sig när den ser att det är Berra.',
    'Berra craftar inte. Recepten lägger sig i rätt ordning.',
    'I lobbyn startar matchen när Berra sätter sig.',
    'Berra använder inte fusk. Fuskkoderna tar ledigt den kvällen.',
    'När texten är för liten zoomar skärmen in av respekt för Berra.',
    'Berra slår inte på ljudet. Spelet sänker musiken åt honom.',
    'En sidequest avslutar sig när Berra råkar gå förbi.',
    'När laddningen når nittionio väntar den in Berra.',
    'I ett strategispel ger motståndaren upp när de ser namnet Berra.',
    'Ett achievement poppar upp i förväg när Berra sätter sig.',
    'Berra behöver ingen walkthrough. Walkthroughen tar en kaffe.',
    'När servern startar om ber den Berra att vänta, inte tvärtom.',
    'En cutscene kortar sig när Berra redan förstått handlingen.',
    'Berra stänger inte av skärmen. Skärmen vilar när han reser sig.',
    'Lagkamraterna i chatten skriver bara att det är Berra.',
    'Berra har inget inventory. Inventoryt har en hylla för Berra.',
    'I ett co-op blir de andra biroller när Berra ansluter.',
    'Berra bindar inte makro. Makrot antecknar efter Berra.',
    'Berra spelar inte med mods. Moddarna är redan godkända.',
    'Berra har ingen andra skärm. Den första räcker till.',
    'När Avenyn töms efter stängning tar Berra sista vinkningen.',
    'Nattbussen i Göteborg väntar in Berra vid hållplatsen.',
    'Ett last call på Avenyn räcker tills Berra har fått kunden.',
    'Vid Liseberg sent på natten lyser bara det Berra behöver se.',
    'På Hisingen i otid känner gatorna igen Berras ljus.',
    'När det är tomt vid Centralen har Berra redan varit där.',
    'Berra tar sista körningen. Den sista körningen vet det redan.',
    'Klockan fyra i Göteborg är det högtrafik i Berras kalender.',
    'En nattöppen kiosk på Linné håller öppet tills Berra fått kaffe.',
    'Efter sista ronden på Andra Lång vet Berra vägen hem.',
    'Berra möter inte gryningen. Gryningen möter honom vid sista adressen.',
    'När det är svart över älven räcker Berras ljus till båda broarna.',
    'Kunder som vinkar klockan två vet redan att det blir Berra.',
    'När nattvakten i garaget somnar har Berra redan rullat ut.',
    'Berra äter inte nattmat. Korvkiosken håller typen varm till honom.',
    'En tyst gata i Majorna håller tempot efter Berra.',
    'Ett nattpass utan radio är tyst. Ett nattpass med Berra räcker.',
    'Berra kör natt i Gårda när bara lastbilarna är vakna. Och han.',
    'När skatterna gått ur Masthugget är Berras ljus det som syns.',
    'Efter evenemang på Ullevi vet gatorna att Berra är i tjänst.',
    'En tyst natt över Slottskogen släpper fram bara Berras bil.',
    'Kön på Älvsborgsbron kortar sig när Berra är i den.',
    'Tingstadstunneln håller ett fält ledigt åt Berra, av gammal vana.',
    'En omledning i stan går den väg Berra redan valt.',
    'Hisingsbron väntar med att öppna tills Berra är över.',
    'Ett vägarbete flyttar konerna när Berra behöver utrymme.',
    'På Oscarsleden rätar kurvan ut sig lite när Berra kommer.',
    'Kön i Götatunneln andas ut när Berra har passerat.',
    'Berra kör över älven. Älven håller sig stilla under bron.',
    'En rondell i Lundby snurrar åt rätt håll när Berra går in.',
    'Morgonkön till stan nickar tyst när Berra kör mot sängen.',
    'När det är evenemangskö runt Korsvägen tar den en annan form runt Berra.',
    'Ett tillfälligt körfält dyker upp när Berra behöver det.',
    'Berra kör inte vilse i typen. Typen rättar sig efter honom.',
    'På Södra Vägen håller tempot jämnt så fort Berra är med.',
    'En buss vid hållplatsen väntar in att Berra har släppt av.',
    'Skylten mot Mölndal behövs inte. Berra har redan svängt rätt.',
    'När det är stopp vid Svingeln frågar kön Berra om nästa steg.',
    'Parkeringen vid Svenska Mässan lämnar en lucka åt Berra.',
    'Berra tar inte omvägen via Allén. Allén tar sig tid för Berra.',
    'Kösystemet i stan räknar med en extra lucka när Berra är i tjänst.',
    'När det är tätt vid Järntorget luckrar det upp sig kring Berra.',
    'Berra kör inte mer än en fil. Filerna håller sig på sin kant.',
    'En taxificka som ser full ut har alltid plats för Berra.',
    'När GPS:en vill en annan väg ber den Berra om ursäkt och följer efter.',
    'Berra tankar inte ofta. Bilen räcker längre när han kör.',
    'En laddstolpe i stan blir ledig precis när Berra behöver den.',
    'Berra tvättar inte bilen på natten. Smutsen väntar till morgonen.',
    'När Berra stänger dörren låter det som att passet redan är klart.',
    'Kunder glömmer inte saker hos Berra. Saker minns att följa med ut.',
    'Berra hittar rätt portkod. Porten har hört att han är på väg.',
    'En hiss i ett höghus väntar på bottenplan när Berra rullar fram.',
    'Berra ringer inte på. Kunden är redan i dörren.',
    'När Berra säger hej i backspegeln räcker det som kvitto på att allt är bra.',
    'En tom tank i någon annans bil är ett problem. I Berras är den ett undantag.',
    'Berra tar inte fel på namn. Namnen tar inte fel på Berra.',
    'När adressen är en bakgata finns det ändå ljus nog för Berra.',
    'Berra behöver ingen anteckning på sätet. Sätet minns vems väska det är.',
    'En omväg för andra är för Berra bara en väg som också funkar.',
    'När det är tyst i radion är det för att natten lyssnar på Berra.',
    'Berra vinkar inte av kunder. De vinkar av sig själva, nöjda.',
    'En lång körning blir kort i klockan när Berra håller i ratten.',
    'Berra tappas inte bort i telefonväxeln. Växeln kopplar honom först.',
    'Berra tar inte fel avfart vid Åbro. Avfarten väntar in honom.',
    'I Kållered rätar cirkulationsplatsen ut sig ett snäpp för Berra.',
    'När det är marknad på Heden känner berget av bilar igen Berras ruta.',
    'Berra kör förbi typen utan att typen klagar. Den vet vem det är.',
    'En nattdagg på huven torkar av sig när Berra startar.',
    'Berra behöver ingen extra spegel. De han har räcker till hela leden.',
    'När en kund säger "det är runt här" har Berra redan stannat rätt.',
    'Berra ber inte om kvitto i kaffekön. Kön ber om att få gå före honom, och får nej.',
    'En stolpe med fel skylt rättar texten när Berra tittar upp.',
    'Berra tar natten som den är. Natten tar Berra som han är.',
    'När det är ljust igen har Berra redan lämnat stan i bättre skick.'
  ]

  var el = {}, hideT = 0, lastAt = 0;

  function animOn() {
    try { return !!(window.ANIMATIONER && ANIMATIONER.isOn && ANIMATIONER.isOn()); } catch (e) { return false; }
  }
  function reduceMotion() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function onHome() {
    var app = document.getElementById('app');
    return !!(app && app.classList.contains('is-home') && app.style.display !== 'none');
  }

  function svg() {
    // Blond mycket kort hår med lätt sidbena, isblå ögon, stort leende,
    // lätt rund mage men fortfarande atletisk. Ingen skäggstubb, inga glasögon, inga kläddetaljer.
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' +
      '<rect x="21" y="55.5" width="8.5" height="5.5" rx="2" fill="' + K + '"/>' +
      '<rect x="34.5" y="55.5" width="8.5" height="5.5" rx="2" fill="' + K + '"/>' +
      '<path d="M22.5 51 h8 l0.8 5.5 h-8.2 z M33.5 51 h8 l0.2 5.5 h-8.5 z" fill="' + PANTS + '"/>' +
      // Bredare axlar, lätt rundad mage, slät tröja utan märke.
      '<path d="M18.2 40.2 q0 -2.8 5.2 -4 h17.2 q5.2 1.2 5.2 4 q1 5.6 -1.4 10.2 q-2.2 3.2 -11.4 3.2 q-9.2 0 -11.4 -3.2 q-2.4 -4.6 -1.4 -10.2 z" fill="' + SHIRT + '"/>' +
      '<path d="M47.2 43 L51.8 50.2" stroke-width="5"/><path d="M47.2 43 L51.8 50.2" stroke="' + SHIRT + '" stroke-width="3"/>' +
      '<circle cx="52.3" cy="51.2" r="2.5" fill="' + SKIN + '"/>' +
      '<g class="td-berra-arm"><path d="M18.6 42.8 L11.6 34.6" stroke-width="5"/><path d="M18.6 42.8 L11.6 34.6" stroke="' + SHIRT + '" stroke-width="3"/>' +
      '<circle cx="10.8" cy="33.3" r="2.6" fill="' + SKIN + '"/></g>' +
      // Hals bakom huvudet, ingen skugglinje som liknar skägg.
      '<path d="M27.5 36 v4 q4.5 1.6 9 0 v-4" fill="' + SKIN + '" stroke="none"/>' +
      // Kort blont hår som täcker hjässan, lätt sidbena.
      '<ellipse cx="32" cy="24.2" rx="13.2" ry="13.6" fill="' + HAIR + '"/>' +
      '<ellipse cx="32" cy="22.8" rx="11.5" ry="7.5" fill="' + HAIR_DARK + '" opacity="0.2"/>' +
      '<circle cx="32" cy="28.2" r="11.7" fill="' + SKIN + '"/>' +
      '<path d="M29.2 12.8 q-0.2 5.2 0.5 9.4" fill="none" stroke="' + SKIN + '" stroke-width="1.45"/>' +
      '<circle cx="20.2" cy="28.6" r="2.25" fill="' + SKIN + '"/>' +
      '<circle cx="43.8" cy="28.6" r="2.25" fill="' + SKIN + '"/>' +
      // Isblå ögon, inga glasögon.
      '<g class="td-berra-eyes" stroke="none">' +
      '<circle cx="27.1" cy="28.6" r="2.5" fill="#eef8fc"/><circle cx="36.9" cy="28.6" r="2.5" fill="#eef8fc"/>' +
      '<circle cx="27.1" cy="28.7" r="1.65" fill="' + EYE + '"/><circle cx="36.9" cy="28.7" r="1.65" fill="' + EYE + '"/>' +
      '<circle cx="27.1" cy="28.7" r="0.74" fill="' + EYE_IN + '"/><circle cx="36.9" cy="28.7" r="0.74" fill="' + EYE_IN + '"/>' +
      '<circle cx="27.55" cy="28.15" r="0.55" fill="#fff"/><circle cx="37.35" cy="28.15" r="0.55" fill="#fff"/>' +
      '</g>' +
      // Stort leende.
      '<path d="M23.2 34.4 q8.8 8.4 17.6 0" fill="none" stroke="' + K + '" stroke-width="2.1"/>' +
      '</g></svg>';
  }

  function css() {
    if (document.getElementById('td-berra-css')) return;
    var s = document.createElement('style');
    s.id = 'td-berra-css';
    s.textContent =
      '.td-berra-slot{display:flex;justify-content:flex-start;align-items:flex-end;padding:8px 2px 16px;box-sizing:border-box;pointer-events:none}' +
      '.td-berra{position:relative;width:' + W + 'px;height:' + H + 'px;margin:0;padding:0;border:0;background:none;cursor:pointer;' +
      'pointer-events:auto;flex:0 0 auto;-webkit-tap-highlight-color:transparent;overflow:visible;z-index:2}' +
      '.td-berra svg{width:' + W + 'px;height:' + H + 'px;display:block;overflow:visible;transform-origin:50% 100%}' +
      '.td-berra.td-berra-poke svg{animation:td-berra-poke .45s ease-out}' +
      '@keyframes td-berra-poke{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-5px) rotate(-7deg)}62%{transform:translateY(-1px) rotate(4deg)}100%{transform:translateY(0) rotate(0)}}' +
      '@media (prefers-reduced-motion:reduce){.td-berra.td-berra-poke svg{animation:none}}' +
      '.td-berra-bubble{position:fixed;width:max-content;max-width:min(260px,calc(100vw - 16px));z-index:46;background:var(--surface);color:var(--text);' +
      'border:2px solid var(--text);border-radius:16px;padding:7px 10px 8px;font-size:calc(14px * min(var(--font-scale,1),1.15));line-height:1.3;' +
      'box-shadow:0 3px 10px rgba(0,0,0,.18);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .2s;box-sizing:border-box}' +
      '.td-berra-bubble.show{opacity:1;visibility:visible}' +
      '.td-berra-bubble-txt{position:relative;z-index:1}' +
      '.td-berra-bubble-tail{position:absolute;width:12px;height:12px;background:var(--surface);border:2px solid var(--text);' +
      'left:var(--tail-left,50%);transform:translateX(-50%) rotate(45deg);pointer-events:none}' +
      '.td-berra-bubble[data-side="above"] .td-berra-bubble-tail{bottom:-7px;border-top:0;border-left:0}' +
      '.td-berra-bubble[data-side="below"] .td-berra-bubble-tail{top:-7px;border-bottom:0;border-right:0}';
    document.head.appendChild(s);
  }

  function berraBox() {
    if (!el.btn || el.btn.style.display === 'none') return null;
    var r = el.btn.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return r;
  }

  function sizeSlot() {
    if (!el.slot) return;
    el.slot.style.minHeight = '0px';
    var rect = el.slot.getBoundingClientRect();
    var topDoc = rect.top + (window.scrollY || window.pageYOffset || 0);
    // Fyll ut utrymmet under rutorna så Berra sitter längst ner på startskärmen.
    // Om innehållet redan är högre än skärmen räcker det med plats för figuren —
    // då når man honom genom att skrolla ner.
    var leftover = window.innerHeight - topDoc;
    var h = Math.max(H + 32, leftover);
    el.slot.style.minHeight = h + 'px';
  }

  function unmount() {
    if (el.slot && el.slot.parentNode) el.slot.parentNode.removeChild(el.slot);
    if (el.btn) el.btn.style.display = 'none';
  }

  function place() {
    if (!el.btn) return;
    if (!onHome()) {
      unmount();
      hideBubble();
      return;
    }
    var content = document.getElementById('content');
    if (!content) return;
    if (!el.slot) {
      el.slot = document.createElement('div');
      el.slot.className = 'td-berra-slot';
    }
    if (el.btn.parentNode !== el.slot) el.slot.appendChild(el.btn);
    if (el.slot.parentNode !== content || content.lastElementChild !== el.slot) content.appendChild(el.slot);
    el.btn.style.display = '';
    el.btn.style.transform = '';
    sizeSlot();
    if (el.bubble && el.bubble.classList.contains('show')) placeBubble();
  }

  function placeBubble() {
    var r = berraBox();
    if (!el.bubble || !r) return;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8, tail = 8;
    var bw = Math.min(260, vw - pad * 2);
    el.bubble.style.width = bw + 'px';
    el.bubble.style.maxWidth = bw + 'px';
    var bh = el.bubble.offsetHeight || 48;
    var cx = r.left + r.width / 2;
    var aboveTop = r.top - bh - tail - 4;
    var belowTop = r.bottom + tail + 4;
    var side, top;
    var header = document.querySelector('#app > header');
    var headerY = header ? Math.ceil(header.getBoundingClientRect().bottom) + 4 : 56;
    if (aboveTop >= Math.max(pad, headerY)) { top = aboveTop; side = 'above'; }
    else if (belowTop + bh <= vh - pad) { top = belowTop; side = 'below'; }
    else { top = Math.max(pad, Math.min(vh - pad - bh, aboveTop)); side = 'above'; }
    if (top < pad) top = pad;
    if (top + bh > vh - pad) top = Math.max(pad, vh - pad - bh);
    var left = cx - bw / 2;
    if (left < pad) left = pad;
    if (left + bw > vw - pad) left = Math.max(pad, vw - pad - bw);
    el.bubble.style.top = top + 'px';
    el.bubble.style.left = left + 'px';
    el.bubble.setAttribute('data-side', side);
    var tailX = cx - left;
    if (tailX < 16) tailX = 16;
    if (tailX > bw - 16) tailX = bw - 16;
    el.bubble.style.setProperty('--tail-left', tailX + 'px');
  }

  function bagKey() {
    try { return KEY_BAG + '_' + (localStorage.getItem('taxi_driver') || 'x'); } catch (e) { return KEY_BAG; }
  }
  function shuffleAll() {
    var a = [], i, j, tmp;
    for (i = 0; i < JOKES.length; i++) a.push(i);
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function loadBag() {
    try {
      var v = JSON.parse(localStorage.getItem(bagKey()) || 'null');
      if (v && v.n === JOKES.length && Array.isArray(v.left) && v.left.length) return v.left.slice();
    } catch (e) {}
    return shuffleAll();
  }
  function saveBag(left) {
    try { localStorage.setItem(bagKey(), JSON.stringify({ n: JOKES.length, left: left })); } catch (e) {}
  }
  function pickJoke() {
    var left = loadBag();
    if (!left.length) left = shuffleAll();
    var ix = left.pop();
    saveBag(left);
    return JOKES[ix];
  }

  function hideBubble() {
    clearTimeout(hideT);
    if (el.bubble) el.bubble.classList.remove('show');
  }

  function say(text) {
    if (!el.bubble || !el.txt) return;
    el.txt.textContent = text;
    el.bubble.classList.add('show');
    placeBubble();
    clearTimeout(hideT);
    hideT = setTimeout(hideBubble, BUBBLE_MS);
  }

  function poke() {
    if (!onHome() || !el.btn || el.btn.style.display === 'none') return;
    if (Date.now() - lastAt < 400) return;
    lastAt = Date.now();
    if (animOn() && !reduceMotion()) {
      el.btn.classList.remove('td-berra-poke');
      void el.btn.offsetWidth;
      el.btn.classList.add('td-berra-poke');
      setTimeout(function () { if (el.btn) el.btn.classList.remove('td-berra-poke'); }, 500);
    }
    say(pickJoke());
  }

  function build() {
    css();
    el.btn = document.createElement('button');
    el.btn.type = 'button';
    el.btn.className = 'td-berra';
    el.btn.setAttribute('aria-label', 'Berra');
    el.btn.innerHTML = svg();
    el.btn.style.display = 'none';
    el.bubble = document.createElement('div');
    el.bubble.className = 'td-berra-bubble';
    el.bubble.setAttribute('role', 'status');
    el.bubble.setAttribute('aria-live', 'polite');
    el.txt = document.createElement('div');
    el.txt.className = 'td-berra-bubble-txt';
    el.tail = document.createElement('span');
    el.tail.className = 'td-berra-bubble-tail';
    el.tail.setAttribute('aria-hidden', 'true');
    el.bubble.appendChild(el.txt);
    el.bubble.appendChild(el.tail);
    document.body.appendChild(el.bubble);
    el.btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      poke();
    });
  }

  function tick() { place(); }

  function start() {
    build();
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', function () {
      if (el.bubble && el.bubble.classList.contains('show')) placeBubble();
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') hideBubble();
      else place();
    });
    setInterval(tick, 1000);
    var app = document.getElementById('app');
    if (app && window.MutationObserver) {
      new MutationObserver(function () { place(); }).observe(app, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    var content = document.getElementById('content');
    if (content && window.MutationObserver) {
      new MutationObserver(function () { place(); }).observe(content, { childList: true });
    }
  }

  window.BERRA = {
    jokes: function () { return JOKES.slice(); },
    pickJoke: pickJoke,
    poke: poke,
    place: place,
    preview: function (text) {
      place();
      say(text || pickJoke());
      return true;
    },
    _pos: function () {
      var r = berraBox();
      return r ? { x: r.left, y: r.top } : null;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
