-- SEED — applicera INTE automatiskt. Kör manuellt efter 20261106a när guider ska finnas live.
-- Skapar 3 fästa trådar i sektionen "Hjälp & guider" + 1 FAQ-tråd.
-- Författare: sätt v_author / v_company nedan till en ägare/superadmin som finns i drivers.
-- Innehåll baserat på TaxiData-kod (om-data.js, prognos.js, zonguide-admin.js, topplistor.js, verkstad).

do $seed$
declare
  v_author  text := null;  -- <-- fyll i förar-id (ägare/superadmin), t.ex. '710022'
  v_company text := null;  -- <-- fyll i company_id
  v_tid bigint;
  v_rid bigint;
begin
  if v_author is null or v_company is null then
    raise notice 'Hoppar över seed: sätt v_author och v_company i 20261106c_forum_guides_seed.sql först.';
    return;
  end if;
  if not exists (select 1 from public.forum_sections where id = 'hjalp') then
    raise exception 'Sektionen hjalp saknas — kör 20261106a först';
  end if;

  -- 1) Prognos
  insert into public.forum_threads (section_id, company_id, author_id, title, sticky, reply_count, last_activity_at)
  values ('hjalp', v_company, v_author, 'Guide: Prognos', true, 1, clock_timestamp())
  returning id into v_tid;
  insert into public.forum_replies (thread_id, author_id, company_id, body) values (v_tid, v_author, v_company, $b$
Vad är Prognos?
Prognos visar kommande förbokningar per zon (t.ex. Landvetter, Essity, Astra) och en morgonprognos. Du hittar den under Jobb nu / Prognos i menyn.

Så använder du den
1. Öppna Prognos.
2. Välj zonflik högst upp.
3. Se listan med förbokningar för zonen.
4. Tryck på en kategori för att bevaka den — då får du notis när något nytt dyker upp i den zonen.

Bra att veta
• Siffrorna kommer från servern och uppdateras löpande.
• Bevakningar sparas per förare.
• Hittar du fel i en zon: använd "Rapportera fel" — det öppnar Forum › Buggar med texten ifylld.
• Vissa zoner kan vara dolda i appen; gamla bevakningar på dolda zoner stängs av tyst.

(Den här guiden beskriver appen som den fungerar i koden. Detaljer kan ändras.)
$b$);

  -- 2) Zonguide + Topplistor
  insert into public.forum_threads (section_id, company_id, author_id, title, sticky, reply_count, last_activity_at)
  values ('hjalp', v_company, v_author, 'Guide: Zonguide och Topplistor', true, 1, clock_timestamp())
  returning id into v_tid;
  insert into public.forum_replies (thread_id, author_id, company_id, body) values (v_tid, v_author, v_company, $b$
Zonguide (test, bara superadmin)
Zonguide ligger under S admin-panelen. Den visar var åkeriets resor oftast har startat en viss veckodag och timme, baserat på historik (t.ex. 8/12/26 veckor). Magasinet (zon 290) räknas inte. Guiden är i test — den måste utvärderas när det finns fler åkerier och mer data. Vanliga förare ser den inte.

Topplistor
Topplistor visar hur du ligger till jämfört med andra, anonymt: andra ser placering och värde, inte namn. Din egen rad visas som "Du". Bara ägaren ser namn. Listorna bygger på kördata från servern (samma källa som Körpassdata).

Tips
• Öppna Topplistor från huvudmenyn (🏆).
• Siffrorna uppdateras ungefär varje timme, samma takt som övrig kördata.
$b$);

  -- 3) Anmälningar & ärenden
  insert into public.forum_threads (section_id, company_id, author_id, title, sticky, reply_count, last_activity_at)
  values ('hjalp', v_company, v_author, 'Guide: Anmälningar & ärenden', true, 1, clock_timestamp())
  returning id into v_tid;
  insert into public.forum_replies (thread_id, author_id, company_id, body) values (v_tid, v_author, v_company, $b$
Vad finns under Anmälningar & ärenden?
Här anmäler du saker som rör bilen och dig själv:
• Fel på bilen
• Sånt som behövs till bilen
• Underhåll / verkstad
• Verkstadstimmar (ägare godkänner)
• Sjukanmälan (anmälan, friskanmälan, eventuellt läkarintyg)

Vem ser vad?
• Du ser dina egna anmälningar.
• Ägaren och superadmin ser åkeriets anmälningar så att de kan åtgärdas.
• Andra förare ser inte dina anmälningar.

Status
Fel/behövs går ofta Ny → Pågår → Klar. Klara poster kan vara ihopfällda så att listan blir lugnare.

Svar från ägare
När ägare eller admin svarar i ett öppet ärende hamnar meddelandet i din Inkorg (under profilikonen). Klockan får samtidigt en kort notis som länkar dit. När du läser svaret rensas markeringen på båda ställena.
$b$);

  -- 4) FAQ (fäst)
  insert into public.forum_threads (section_id, company_id, author_id, title, sticky, reply_count, last_activity_at)
  values ('hjalp', v_company, v_author, 'FAQ — vanliga frågor', true, 1, clock_timestamp())
  returning id into v_tid;
  insert into public.forum_replies (thread_id, author_id, company_id, body) values (v_tid, v_author, v_company, $b$
Hur loggar jag in första gången?
Du får en aktiveringslänk av din åkare. Öppna den, skriv ditt förar-ID och välj ett lösenord (minst 6 tecken). Sedan loggar du in med förar-ID och lösenord.

Jag har glömt lösenordet
Tryck på "Glömt lösenord?" på inloggningssidan och skriv ditt förar-ID. Finns e-post i profilen får du en länk. Annars: ring åkaren så kan lösenordet nollställas.

Var kommer pass och resor ifrån?
De hämtas automatiskt från servern (samma system som taxametern skickar till). Du behöver inte skriva in något. Ett pågående pass syns först när det är avslutat. Uppdatering ungefär en gång i timmen.

Hur räknar Lönekoll?
Lönekoll tar det du kört in, drar BOM/moms/avgifter och räknar provision, semesterersättning och skatt ungefär som lönebeskedet. Det är en uppskattning — lönebeskedet gäller. Procent och avdrag kan du ändra själv.

Vem ser det jag skriver i Forum?
Allmänt, Önskemål & förslag, Buggar och Frågor & svar är gemensamma för anslutna åkerier (med åkerinamn). Mitt åkeri syns bara i ditt åkeri. Admin syns bara för ägare och superadmin. Hjälp & guider kan alla läsa; nya guider skapas av ägare/superadmin.

Fler frågor?
Öppna en tråd under Frågor & svar. När du fått ett bra svar kan du (eller ägare/superadmin) markera det som Löst ✓.
$b$);

  raise notice 'Seed klar: 4 fästa trådar i Hjälp & guider.';
end $seed$;
