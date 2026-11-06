-- Mjuk undo: behåll alla skickade meddelanden och läskvitton. Kör efter frontend-revert.
-- Nya funktioner finns kvar för återstart; klientroller förlorar all åtkomst.
revoke all on function public.message_recipients(text) from anon, authenticated;
revoke all on function public.message_list(text, text, bigint) from anon, authenticated;
revoke all on function public.message_send(text, text, text) from anon, authenticated;
revoke all on function public.message_read(text, bigint) from anon, authenticated;
revoke all on function public.payroll_month(text, date) from anon, authenticated;
revoke all on function messaging_private.message_recipients(text) from anon, authenticated;
revoke all on function messaging_private.message_list(text, text, bigint) from anon, authenticated;
revoke all on function messaging_private.message_send(text, text, text) from anon, authenticated;
revoke all on function messaging_private.message_read(text, bigint) from anon, authenticated;
revoke all on function messaging_private.payroll_month(text, date) from anon, authenticated;
revoke usage on schema messaging_private from anon, authenticated;
