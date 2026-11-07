-- Roll back the front end before removing the scalar endpoint. No user data is modified.
revoke all on function public.shell_badge_counts(text) from anon,authenticated;
drop function public.shell_badge_counts(text);
