-- 2026-11-12svar1: låt ägare/admin och föraren skriva i en felanmälan (Bilen står / Behövs) igen.
-- 20261107135140_inkorg_v2_bookings_contacts.sql tog bort execute på car_issue_message från anon/authenticated
-- ("legacy ... never writable from old cached clients"). Ärenden (mailbox-ui.js) använder nu den RPC:n igen,
-- så den behöver vara anropbar. Själva funktionen ändras inte: den kontrollerar token, åkeri, admin eller
-- rapportör, 1000 tecken och 100/dygn, och ändrar inte status.
grant execute on function public.car_issue_message(text, bigint, text) to anon, authenticated;
