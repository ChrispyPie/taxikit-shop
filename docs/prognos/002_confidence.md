# Confidence + block-tracking (t329u)

Additive SQL already applied on project `lpfdryvukqmjlgenuzpb`:

```sql
alter table public.prognos_bookings
  add column if not exists confidence text not null default 'trolig'
    check (confidence in ('saker','trolig','osaker')),
  add column if not exists current_block int;

-- RPCs: prognos_svc_insert_booking(..., p_confidence),
--        prognos_svc_update_booking(p_id, p_est, p_block, p_confidence),
--        prognos_svc_open_bookings(p_zone, p_cat),
--        prognos_list_bookings returns confidence.
```

Edge `prognos-sync` v4 implements snap-to-5, FIFO boundary crossings (2→1 = +80 säker, 1→0 = +40 säker), new block-2 = +120 trolig, new block-1/0 without fall from farther = osäker, unexplained falls = canceled.
