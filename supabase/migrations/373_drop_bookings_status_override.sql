-- ============================================
-- 373: bookings.status_override goes — it was never this app's column
-- ============================================
-- Found on 2026-09-21, when regenerating types after migration 370 turned up a
-- column NO migration in this repo creates. It is the sibling product's
-- (travel-ops-pro) `20261022_booking_status_override.sql`:
--
--     ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status_override jsonb;
--
-- pasted into THIS project's SQL editor at some point — the column comment on
-- production is that migration's, word for word, and no sibling migration
-- name is in this database's ledger, so it did not come through a runner. It
-- was valid against both schemas, so it went in silently.
--
-- The feature it serves ("an operator confirmed a status its supplier rows do
-- not back") lives in the sibling. Nothing here reads or writes the column.
-- Checked on production before writing this: zero bookings, zero values, and
-- nothing depends on it — no default, constraint, index, view, function,
-- policy or trigger.
--
-- If that feature is ever ported, it arrives with its own migration, in this
-- repo, like everything else. A column with no migration behind it is a
-- database that cannot be rebuilt from its own history.
--
-- No ordering constraint (no code names it). Idempotent.
ALTER TABLE public.bookings DROP COLUMN IF EXISTS status_override;

NOTIFY pgrst, 'reload schema';
