-- ============================================================================
-- 335 — tier and supplier-type values come from the tenant's vocabulary
-- ============================================================================
-- Ten CHECK constraints pinned tier columns to the four preset words
-- (budget / standard / deluxe / luxury) and suppliers.supplier_type to the
-- platform's list. Since 334 each agency defines its own tiers and supplier
-- types (Settings → Your vocabulary) and since step 2 every form offers
-- them — but the database would still refuse a "5_star" quote or a
-- "fleet_partner" supplier. The CHECKs go; in their place one trigger asks
-- the tenant's vocabulary.
--
-- The trigger validates a value only when it is SET or CHANGED. Rows that
-- already carry a word the agency has since removed stay editable — a
-- deleted tier must never make an old quote unsaveable — and only re-filing
-- under an unknown key is refused. Tables without tenant_id (user
-- preferences, content variations) resolve the tenant from the session;
-- when no tenant can be resolved (service-role maintenance) the check is
-- skipped rather than blocking.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION assert_vocabulary_key()
RETURNS TRIGGER AS $$
DECLARE
  v_kind   TEXT := TG_ARGV[0];
  v_column TEXT := TG_ARGV[1];
  v_new    TEXT;
  v_old    TEXT;
  v_tenant UUID;
  v_ok     BOOLEAN;
BEGIN
  v_new := to_jsonb(NEW) ->> v_column;
  IF v_new IS NULL OR btrim(v_new) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD) ->> v_column;
    IF v_old IS NOT DISTINCT FROM v_new THEN
      RETURN NEW; -- unchanged: never re-judge an existing row
    END IF;
  END IF;

  v_tenant := (to_jsonb(NEW) ->> 'tenant_id')::uuid;
  IF v_tenant IS NULL THEN
    BEGIN
      v_tenant := get_user_tenant_id();
    EXCEPTION WHEN OTHERS THEN
      v_tenant := NULL;
    END;
  END IF;
  IF v_tenant IS NULL THEN
    RETURN NEW; -- no tenant to ask: cannot validate, do not block
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM tenant_vocabularies
    WHERE tenant_id = v_tenant AND kind = v_kind AND key = v_new
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION '% "%" is not in this agency''s vocabulary (Settings → Your vocabulary)', v_kind, v_new
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Tiers ──────────────────────────────────────────────────────────────────
ALTER TABLE itineraries         DROP CONSTRAINT IF EXISTS itineraries_tier_check;
ALTER TABLE b2c_quotes          DROP CONSTRAINT IF EXISTS b2c_quotes_tier_check;
ALTER TABLE b2b_quotes          DROP CONSTRAINT IF EXISTS b2b_quotes_tier_check;
ALTER TABLE tour_variations     DROP CONSTRAINT IF EXISTS tour_variations_tier_check;
ALTER TABLE user_preferences    DROP CONSTRAINT IF EXISTS user_preferences_default_tier_check;
ALTER TABLE restaurant_contacts DROP CONSTRAINT IF EXISTS restaurant_contacts_tier_check;
ALTER TABLE hotel_contacts      DROP CONSTRAINT IF EXISTS hotel_contacts_tier_check;
ALTER TABLE client_preferences  DROP CONSTRAINT IF EXISTS client_preferences_preferred_tier_check;
ALTER TABLE content_variations  DROP CONSTRAINT IF EXISTS content_variations_tier_check;

DROP TRIGGER IF EXISTS trg_vocab_tier ON itineraries;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON itineraries
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON b2c_quotes;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON b2c_quotes
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON b2b_quotes;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON b2b_quotes
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON tour_variations;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON tour_variations
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON user_preferences;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'default_tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON restaurant_contacts;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON restaurant_contacts
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON hotel_contacts;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON hotel_contacts
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON client_preferences;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON client_preferences
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'preferred_tier');
DROP TRIGGER IF EXISTS trg_vocab_tier ON content_variations;
CREATE TRIGGER trg_vocab_tier BEFORE INSERT OR UPDATE ON content_variations
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('tier', 'tier');

-- ── Supplier types ─────────────────────────────────────────────────────────
-- `type` is what the app writes; sync_supplier_type mirrors it to
-- supplier_type. Validate the one the app writes.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check;
DROP TRIGGER IF EXISTS trg_vocab_supplier_type ON suppliers;
CREATE TRIGGER trg_vocab_supplier_type BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION assert_vocabulary_key('supplier_type', 'type');

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-check:
--   SELECT conname FROM pg_constraint WHERE conname LIKE '%tier_check';   -- 0 rows
--   SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_vocab_%';     -- 10
