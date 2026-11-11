-- Ångra städningen av testdata: återställ tillfälliga arrival_watches för förare 710022
-- som skapades 2026-11-11 runt 07:54 Europe/Stockholm (tåg 437, 439, 441, 443).
-- Inga personuppgifter. Kör bara om städningen behöver backas.
insert into public.arrival_watches (id, driver_id, kind, ident, sched, label, sub, state, created_at, expires_at)
values
  (81, '710022', 'tag', '437', '2026-11-11 16:47:00+00', 'Stockholm C', 'SJ Snabbtåg', '{"arrived":false,"canceled":false}'::jsonb, '2026-11-11 06:54:09.577292+00', '2026-11-11 19:47:00+00'),
  (83, '710022', 'tag', '439', '2026-11-11 17:47:00+00', 'Stockholm C', 'SJ Snabbtåg', '{"arrived":false,"canceled":false}'::jsonb, '2026-11-11 06:54:20.268046+00', '2026-11-11 20:47:00+00'),
  (84, '710022', 'tag', '441', '2026-11-11 18:47:00+00', 'Stockholm C', 'SJ Snabbtåg', '{"arrived":false,"canceled":false}'::jsonb, '2026-11-11 06:54:47.565945+00', '2026-11-11 21:47:00+00'),
  (85, '710022', 'tag', '443', '2026-11-11 19:47:00+00', 'Stockholm C', 'SJ Snabbtåg', '{"arrived":false,"canceled":false}'::jsonb, '2026-11-11 06:54:50.509084+00', '2026-11-11 22:47:00+00')
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.arrival_watches','id'), (select max(id) from public.arrival_watches));
