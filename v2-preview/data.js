/* TaxiKit v2 – PROTOTYP. Alla produkter och priser här är EXEMPELDATA, inte riktiga erbjudanden. */
window.TK_DATA = {
  cars: [
    { id: 'alla', name: 'Ingen bil vald' },
    { id: 'corolla', name: 'Toyota Corolla' },
    { id: 'rav4', name: 'Toyota RAV4' },
    { id: 'modely', name: 'Tesla Model Y' },
    { id: 'id4', name: 'VW ID.4' },
    { id: 'xc60', name: 'Volvo XC60' },
    { id: 'vklass', name: 'Mercedes V-klass (storbil)' },
    { id: 'caravelle', name: 'VW Caravelle (storbil)' }
  ],
  cats: [
    { id: 'jobb', name: 'Jobbverktyg', en: 'Work tools', icon: '📱', hint: 'Mobilhållare, laddare, kvittorullar' },
    { id: 'bil', name: 'Bilen inuti', en: 'Car interior', icon: '🚕', hint: 'Organizer, skydd, mattor' },
    { id: 'rent', name: 'Rent & fräscht', en: 'Clean & fresh', icon: '🧽', hint: 'Rengöring, doft, spypåsar' },
    { id: 'forare', name: 'Föraren', en: 'The driver', icon: '🧍', hint: 'Rygg, termos, kläder' },
    { id: 'kund', name: 'Kundservice', en: 'Passenger care', icon: '🍬', hint: 'Mints, kablar, paraply' },
    { id: 'syns', name: 'Synas & skyltar', en: 'Signs & branding', icon: '🪧', hint: 'Visitkort, magnetskyltar' },
    { id: 'trygg', name: 'Trygghet', en: 'Safety', icon: '🦺', hint: 'Första hjälpen, lampa, väst' }
  ],
  // price = exempelpris i kr inkl. moms. INTE riktiga priser.
  products: [
    { id: 'mobilhallare', cat: 'jobb', icon: '📱', name: 'Mobilhållare med MagSafe-laddning', price: 349, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: ['mobil'], desc: 'Sitter stadigt i luftintaget. Laddar trådlöst så mobilen klarar hela skiftet.' },
    { id: 'laddare', cat: 'jobb', icon: '🔌', name: 'Billaddare 2×USB-C 65 W', price: 199, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: ['mobil','kundladd'], desc: 'Snabbladdar både din mobil och taxametertelefonen samtidigt.' },
    { id: 'kvittorulle', cat: 'jobb', icon: '🧾', name: 'Kvittorullar 57 mm, 10-pack', price: 129, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: [], consumable: true, every: 4, desc: 'Termorullar som passar de vanligaste kvittoskrivarna.' },
    { id: 'organizer', cat: 'bil', icon: '🗂️', name: 'Organizer mellan stolarna', price: 249, fits: ['corolla','rav4','xc60','id4','modely'], shifts: ['natt','dag','flyg'], pains: ['stok'], desc: 'Plats för växelkassa, papper och laddkablar. Glider inte runt.' },
    { id: 'organizer-storbil', cat: 'bil', icon: '🧳', name: 'Organizer för storbil (skena)', price: 399, fits: ['vklass','caravelle'], shifts: ['storbil','flyg'], pains: ['stok'], desc: 'Fästs i golvskenan. Gjord för storbilar med flyttbara säten.' },
    { id: 'sateskydd', cat: 'bil', icon: '💺', name: 'Sätesskydd baksäte, tvättbart', price: 299, fits: ['alla'], shifts: ['natt','storbil','fard'], pains: ['spy','stok'], desc: 'Skyddar mot väta, smuts och värre saker på fredagsnätter.' },
    { id: 'gummimattor', cat: 'bil', icon: '🟫', name: 'Gummimattor, passformade', price: 449, fits: ['corolla','rav4','modely','id4','xc60','vklass','caravelle'], shifts: ['natt','dag','flyg','storbil','fard'], pains: ['stok'], desc: 'Höga kanter som håller kvar snö och grus. Välj din bil så får du rätt passform.' },
    { id: 'spypasar', cat: 'rent', icon: '🤢', name: 'Spypåsar med förslutning, 50-pack', price: 149, fits: ['alla'], shifts: ['natt','storbil'], pains: ['spy'], consumable: true, every: 4, desc: 'Täta, luktfria och diskreta. Ligger i dörrfacket.' },
    { id: 'rengoring', cat: 'rent', icon: '🧽', name: 'Rengöringskit för skiftet', price: 229, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: ['spy','stok'], desc: 'Spray, mikrofiberdukar och fläckborttagning i en väska.' },
    { id: 'vatservetter', cat: 'rent', icon: '🧻', name: 'Våtservetter interiör, 3-pack', price: 99, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: ['spy','stok'], consumable: true, every: 2, desc: 'Torka ratt, skärm och handtag mellan körningarna.' },
    { id: 'doft', cat: 'rent', icon: '🌲', name: 'Neutral bildoft, 3-pack', price: 89, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: ['spy'], consumable: true, every: 4, desc: 'Diskret och fräsch. Inte den där gröna granen.' },
    { id: 'ryggstod', cat: 'forare', icon: '🪑', name: 'Ländryggsstöd i memoryskum', price: 399, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: ['rygg'], desc: 'För dig som sitter 10–13 timmar per skift.' },
    { id: 'termos', cat: 'forare', icon: '☕', name: 'Termosmugg som passar i hållaren', price: 249, fits: ['alla'], shifts: ['natt','flyg'], pains: [], desc: 'Kaffet är varmt klockan 04. Läcker inte i kurvorna.' },
    { id: 'mints', cat: 'kund', icon: '🍬', name: 'Mintburkar med TaxiKit-logga, 20 st', price: 179, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: [], consumable: true, every: 4, desc: 'Bjud kunden på en mint. Litet, men folk minns det.' },
    { id: 'kundkabel', cat: 'kund', icon: '🔋', name: 'Laddkabel 3-i-1 för baksätet', price: 149, fits: ['alla'], shifts: ['natt','dag','flyg','storbil'], pains: ['kundladd'], desc: 'USB-C, Lightning och micro-USB. Svaret på "har du laddare?".' },
    { id: 'paraply', cat: 'kund', icon: '☂️', name: 'Stort paraply för dörren', price: 199, fits: ['alla'], shifts: ['dag','flyg','storbil'], pains: [], desc: 'Håll kunden torr från dörren till bilen.' },
    { id: 'visitkort', cat: 'syns', icon: '💳', name: 'Visitkort med din QR-kod, 250 st', price: 199, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: [], desc: 'Två nivåer: papper eller lyxig plast. Kunden bokar dig direkt.' },
    { id: 'magnetskylt', cat: 'syns', icon: '🪧', name: 'Magnetskylt för dörren, par', price: 349, fits: ['alla'], shifts: ['dag','storbil','fard'], pains: [], desc: 'Sätt på och ta av på sekunder. Med din text.' },
    { id: 'forstahjalpen', cat: 'trygg', icon: '🩹', name: 'Första hjälpen-kit för bil', price: 249, fits: ['alla'], shifts: ['natt','dag','flyg','storbil','fard'], pains: [], desc: 'Kompakt kit som får plats under sätet.' },
    { id: 'ficklampa', cat: 'trygg', icon: '🔦', name: 'Uppladdningsbar ficklampa', price: 179, fits: ['alla'], shifts: ['natt'], pains: [], desc: 'För tappade plånböcker i baksätet klockan 03.' }
  ],
  shifts: [
    { id: 'natt', name: 'Nattskift', icon: '🌙', hint: 'Krogkörningar, långa nätter' },
    { id: 'dag', name: 'Dagskift', icon: '☀️', hint: 'Jobbresor, sjukhus, stan' },
    { id: 'flyg', name: 'Flyg & tåg', icon: '✈️', hint: 'Landvetter, Centralen, bagage' },
    { id: 'storbil', name: 'Storbil & grupp', icon: '🚐', hint: 'Grupper, svensexor, rullstol' },
    { id: 'fard', name: 'Färdtjänst', icon: '♿', hint: 'Samåkning, hjälp in och ut' }
  ],
  pains: [
    { id: 'rygg', name: 'Trött rygg' },
    { id: 'stok', name: 'Stökig bil' },
    { id: 'spy', name: 'Spyor & lukt' },
    { id: 'mobil', name: 'Mobilen dör' },
    { id: 'kundladd', name: 'Kunder vill ladda' }
  ]
};
