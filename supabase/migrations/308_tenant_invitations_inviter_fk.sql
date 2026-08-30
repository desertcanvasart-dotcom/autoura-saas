-- 308: the foreign key tenant_invitations.invited_by -> user_profiles.id
--
-- It was never created. PostgREST resolves an embedded relationship
-- (`inviter:user_profiles!invited_by(...)`) from foreign keys alone, so both
-- invitation routes answered PGRST200 on every request:
--
--   GET  /api/invitations         -> 500, and the page rendered
--                                    "No pending invitations" regardless
--   GET  /api/invitations/verify  -> treated as a bad token, so every invited
--                                    person was told "Invalid invitation token"
--
-- The visible symptom was an invitation that did not appear in the list yet
-- still blocked a re-invite as a duplicate -- the duplicate check runs no
-- embed, so it alone saw the truth.
--
-- Both routes now fetch the inviter separately and no longer depend on this
-- constraint. It is added anyway because it is correct: invited_by is a
-- user_profiles id and nothing enforced that.

DO $$
DECLARE
  orphans BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_invitations_invited_by_fkey'
      AND table_name = 'tenant_invitations'
  ) THEN
    RAISE NOTICE '308: tenant_invitations_invited_by_fkey already present';
    RETURN;
  END IF;

  -- An invited_by pointing at no profile would make the constraint
  -- unaddable. Null those rows rather than fail the migration: the
  -- invitation itself is still valid, only its attribution is unknown.
  SELECT COUNT(*) INTO orphans
  FROM tenant_invitations ti
  WHERE ti.invited_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = ti.invited_by);

  IF orphans > 0 THEN
    RAISE NOTICE '308: nulling % orphaned invited_by value(s)', orphans;
    UPDATE tenant_invitations ti
    SET invited_by = NULL
    WHERE ti.invited_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = ti.invited_by);
  END IF;

  ALTER TABLE tenant_invitations
    ADD CONSTRAINT tenant_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES user_profiles(id) ON DELETE SET NULL;

  RAISE NOTICE '308: added tenant_invitations_invited_by_fkey';
END $$;
