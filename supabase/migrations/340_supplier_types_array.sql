-- ============================================================================
-- 340 — a supplier can fill several roles
-- ============================================================================
-- A ground-services company does airport assistance AND hotel assistance; a
-- hotel runs its own transfer fleet; a cruise line also handles the ground.
-- One `type` forced two supplier records for one company — two contact
-- cards, two places for contracts. `types` is the full list; `type` stays as
-- the PRIMARY role (types[1]) so every reader of `type` keeps working. The
-- two columns are kept in step by trigger; every element is validated
-- against the tenant's supplier-type vocabulary (334/335).
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS types TEXT[] NOT NULL DEFAULT '{}';

UPDATE suppliers SET types = ARRAY[type]
WHERE (types IS NULL OR cardinality(types) = 0) AND type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_types ON suppliers USING GIN (types);

-- Keep `type` (primary) and `types` in step, and validate the list. Named to
-- fire FIRST among the BEFORE triggers (alphabetical), so sync_supplier_type
-- then mirrors type → supplier_type and trg_vocab_supplier_type validates it.
CREATE OR REPLACE FUNCTION a_sync_supplier_types()
RETURNS TRIGGER AS $$
DECLARE
  bad TEXT;
BEGIN
  -- Empty list + a type: the list is that type.
  IF (NEW.types IS NULL OR cardinality(NEW.types) = 0) THEN
    IF NEW.type IS NOT NULL THEN NEW.types := ARRAY[NEW.type]; END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.type IS DISTINCT FROM OLD.type AND NEW.types = OLD.types THEN
    -- Only the primary changed: it moves to the front of the list.
    NEW.types := array_prepend(NEW.type, array_remove(NEW.types, NEW.type));
  END IF;
  -- The primary is the first of the list.
  IF cardinality(NEW.types) > 0 AND NEW.type IS DISTINCT FROM NEW.types[1] THEN
    NEW.type := NEW.types[1];
    NEW.supplier_type := NEW.types[1];
  END IF;

  -- Every NEW element must be in this agency's supplier-type vocabulary.
  IF TG_OP = 'INSERT' OR NEW.types IS DISTINCT FROM OLD.types THEN
    SELECT t INTO bad
    FROM unnest(NEW.types) AS t
    WHERE (TG_OP = 'INSERT' OR NOT (t = ANY (OLD.types)))
      AND NOT EXISTS (
        SELECT 1 FROM tenant_vocabularies v
        WHERE v.tenant_id = NEW.tenant_id AND v.kind = 'supplier_type' AND v.key = t
      )
    LIMIT 1;
    IF bad IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
      RAISE EXCEPTION 'supplier_type "%" is not in this agency''s vocabulary (Settings → Your vocabulary)', bad
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS a_sync_supplier_types_trigger ON suppliers;
CREATE TRIGGER a_sync_supplier_types_trigger
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION a_sync_supplier_types();

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT count(*) FROM suppliers WHERE cardinality(types) = 0;  -- 0
--   SELECT count(*) FROM suppliers WHERE type <> types[1];         -- 0
