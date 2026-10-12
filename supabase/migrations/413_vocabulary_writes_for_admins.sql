-- ============================================================================
-- 413 — only owners and admins change a company's vocabulary
-- ============================================================================
--
-- The vocabulary routes allow owners and admins only, but the database did
-- not: the table policy (migration 334) was FOR ALL to any signed-in member of
-- the company, and reset_tenant_vocabulary() — SECURITY DEFINER, executable by
-- every signed-in user — checked no role. A member or viewer could wipe and
-- reseed the company's tiers, vehicle types or supplier types straight from
-- the browser, repricing quotes and breaking records that use those keys.
--
-- Reading stays open to the whole company (every dropdown reads it). Writing,
-- and the reset, need owner or admin. Idempotent.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS tenant_vocabularies_tenant ON tenant_vocabularies;
DROP POLICY IF EXISTS tenant_vocabularies_read ON tenant_vocabularies;
DROP POLICY IF EXISTS tenant_vocabularies_write ON tenant_vocabularies;

CREATE POLICY tenant_vocabularies_read ON tenant_vocabularies
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY tenant_vocabularies_write ON tenant_vocabularies
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND user_has_role(ARRAY['owner', 'admin']::TEXT[]))
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_has_role(ARRAY['owner', 'admin']::TEXT[]));

CREATE OR REPLACE FUNCTION reset_tenant_vocabulary(p_kind TEXT)
RETURNS INTEGER AS $$
DECLARE
  t UUID := get_user_tenant_id();
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'no tenant for caller';
  END IF;
  IF NOT user_has_role(ARRAY['owner', 'admin']::TEXT[]) THEN
    RAISE EXCEPTION 'Only owners and admins can reset the vocabulary' USING ERRCODE = '42501';
  END IF;
  DELETE FROM tenant_vocabularies WHERE tenant_id = t AND kind = p_kind;
  RETURN seed_tenant_vocabulary(t, p_kind);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION reset_tenant_vocabulary(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_tenant_vocabulary(TEXT) TO authenticated;

COMMIT;
