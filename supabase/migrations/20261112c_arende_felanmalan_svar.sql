-- 2026-11-12svar1: låt ägare/admin och föraren skriva i en felanmälan (Bilen står / Behövs) igen,
-- och återställ skrivrättigheter i Bil & verkstad som 20261107135140 tog bort
-- ("legacy ... never writable from old cached clients"). Funktionen själva ändras inte:
-- de kontrollerar token, åkeri, admin eller rapportör, längd och dagsgräns.
grant execute on function public.car_issue_message(text, bigint, text) to anon, authenticated;
grant execute on function public.set_car_issue_status(text, bigint, text, text) to anon, authenticated;
grant execute on function public.set_car_issue_kind(text, bigint, text, text) to anon, authenticated;
grant execute on function public.move_car_issue_to_maint(text, bigint, text, text) to anon, authenticated;
grant execute on function public.save_car_issue(text, bigint, text, bigint, text, text, boolean, text) to anon, authenticated;
grant execute on function public.save_car_maintenance(text, bigint, bigint, text, text, date, integer, integer, integer, text) to anon, authenticated;
