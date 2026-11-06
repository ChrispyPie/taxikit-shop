-- Mjuk undo: behåll trådar och meddelanden. Kör före 20261106g-undo om båda ska stängas.
revoke all on function public.conversation_create(text,text,text,text) from anon,authenticated;
revoke all on function messaging_private.conversation_create(text,text,text,text) from anon,authenticated;
revoke all on function public.conversation_reply(text,bigint,text) from anon,authenticated;
revoke all on function messaging_private.conversation_reply(text,bigint,text) from anon,authenticated;
revoke all on function public.conversation_list(text,bigint) from anon,authenticated;
revoke all on function messaging_private.conversation_list(text,bigint) from anon,authenticated;
revoke all on function public.conversation_get(text,bigint) from anon,authenticated;
revoke all on function messaging_private.conversation_get(text,bigint) from anon,authenticated;
