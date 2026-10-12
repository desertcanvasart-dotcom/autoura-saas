-- ============================================================================
-- 411 — a client's passport type as the forms write it; full_name follows a rename
-- ============================================================================
--
-- passport_type. Migration 129 declared CHECK (passport_type IN ('normal',
-- 'diplomatic','service','official','other')), while the New Client wizard and
-- the Edit page offer Euro Passport / Other Passport ('euro_passport',
-- 'other_passport') — the values the quote engine reads. Where the CHECK is
-- in place, every wizard save failed. The older words stay allowed, so no
-- stored row is changed.
--
-- full_name. The 129 trigger filled full_name only when it was blank, so
-- renaming a client left the list, the search and every document under the
-- old name. Now a change to first or last name recomputes it, unless the same
-- write sets full_name itself.
--
-- Constraints are found by column, not name. Idempotent.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'clients'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%passport_type%'
  LOOP
    EXECUTE format('ALTER TABLE clients DROP CONSTRAINT %I', c);
    RAISE NOTICE '[411] dropped % on clients', c;
  END LOOP;
END $$;

ALTER TABLE clients
  ADD CONSTRAINT clients_passport_type_check
  CHECK (passport_type IS NULL OR passport_type IN
    ('euro_passport', 'other_passport', 'normal', 'diplomatic', 'service', 'official', 'other'));

CREATE OR REPLACE FUNCTION update_client_full_name()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.full_name IS NULL OR NEW.full_name = '')
     AND (NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL) THEN
    NEW.full_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  ELSIF TG_OP = 'UPDATE'
     AND (NEW.first_name IS DISTINCT FROM OLD.first_name OR NEW.last_name IS DISTINCT FROM OLD.last_name)
     AND NEW.full_name IS NOT DISTINCT FROM OLD.full_name THEN
    NEW.full_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
