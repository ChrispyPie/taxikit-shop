-- Ångra 20261112c_arende_felanmalan_svar: samma läge som efter 20261107135140 (bara läsning).
revoke execute on function public.car_issue_message(text, bigint, text) from public, anon, authenticated;
revoke execute on function public.set_car_issue_status(text, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.set_car_issue_kind(text, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.move_car_issue_to_maint(text, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.save_car_issue(text, bigint, text, bigint, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.save_car_maintenance(text, bigint, bigint, text, text, date, integer, integer, integer, text) from public, anon, authenticated;
