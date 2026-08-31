-- 310: correct what 308 assumed about tenant_invitations.invited_by
--
-- 308 meant to add a foreign key invited_by -> user_profiles(id) so PostgREST
-- could resolve the `inviter:user_profiles!invited_by` embed. It guarded on
-- the CONSTRAINT NAME only:
--
--   IF EXISTS (SELECT 1 FROM information_schema.table_constraints
--              WHERE constraint_name = 'tenant_invitations_invited_by_fkey')
--     ... RETURN;
--
-- A constraint by that exact name already existed -- pointing at auth.users,
-- not user_profiles -- so 308 recorded itself as applied and did nothing. A
-- name-based guard cannot tell two different constraints apart; it should
-- have checked what the key REFERENCES.
--
-- 308 was also wrong on its own terms: invited_by is NOT NULL, so its
-- ON DELETE SET NULL and its "null the orphans" rescue would both have
-- failed had the guard not skipped them.
--
-- Nothing is broken by this. The invitation routes stopped using the embed in
-- the same change, and integrity is already enforced by the auth.users key.
-- What this migration fixes is DETERMINISM: on an install lacking the
-- auth.users constraint, 308 would have created a user_profiles one, leaving
-- two installs with different schemas -- and a column carrying foreign keys
-- to two different tables makes every PostgREST embed on it ambiguous.
--
-- The settled shape: invited_by references auth.users, and nothing else.

DO $$
DECLARE
  conname_to_drop TEXT;
BEGIN
  -- Drop a user_profiles key on invited_by if 308 created one here.
  SELECT c.conname INTO conname_to_drop
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'tenant_invitations'::regclass
    AND c.contype = 'f'
    AND a.attname = 'invited_by'
    AND c.confrelid = 'user_profiles'::regclass
  LIMIT 1;

  IF conname_to_drop IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tenant_invitations DROP CONSTRAINT %I', conname_to_drop);
    RAISE NOTICE '310: dropped %, invited_by references auth.users only', conname_to_drop;
  END IF;

  -- And make sure the intended key is there. Checked by what it REFERENCES,
  -- which is the mistake 308 made.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'tenant_invitations'::regclass
      AND c.contype = 'f'
      AND a.attname = 'invited_by'
      AND c.confrelid = 'auth.users'::regclass
  ) THEN
    ALTER TABLE tenant_invitations
      ADD CONSTRAINT tenant_invitations_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES auth.users(id);
    RAISE NOTICE '310: added invited_by -> auth.users';
  ELSE
    RAISE NOTICE '310: invited_by -> auth.users already correct';
  END IF;
END $$;
