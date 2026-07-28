# Ad-hoc SQL checks

Hand-run verification queries — **not migrations**. Nothing here is applied
automatically, and nothing here should ever contain schema changes.

They live in their own directory because the repo previously had loose `.sql`
files at the root alongside a second, never-applied `migrations/` directory
(see migration 258). When "is this file a migration?" is ambiguous, the answer
eventually becomes "nobody knows" — and in that case a route that called a
function from an unapplied file returned 500 for a month.

Migrations live in exactly one place: `supabase/migrations/`.

`test-client-followups.sql` INSERTs sample rows — read it before running it
against anything you care about.
