-- 20261104g: zonguide anropar private.require_sadmin + private.log (skriver), men var STABLE
-- => "cannot execute UPDATE in a read-only transaction". Gör den VOLATILE.
alter function public.zonguide(text, integer, integer, integer) volatile;
