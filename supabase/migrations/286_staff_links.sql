-- ============================================================================
-- 286 — staff_links: no-login tap-links for the people on the ground
-- ============================================================================
--
-- The driver doesn't have a login and never will. What Ahmed gets is a URL —
-- one per assignment — that opens big Departed / Arrived / Picked-up buttons
-- and writes trip_events. Same trust model as itinerary_shares: the token IS
-- the credential, the page is service-role behind middleware, and revoking
-- kills the only URL that exists.
--
-- Deliberately a separate table, not a column on itinerary_resources: that
-- table's policies are role {public} (tenant-qual'd, but broad), and a
-- credential deserves the tightest surface we know how to write. Lifecycle
-- still follows the assignment — ON DELETE CASCADE — because a link to a
-- removed assignment is a door to nowhere that still opens.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS staff_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  itinerary_resource_id UUID NOT NULL REFERENCES itinerary_resources(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Revoke, never delete: the row stays as the record that a link existed.
  revoked_at TIMESTAMPTZ
);

-- One ACTIVE link per assignment — POST is idempotent against this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_links_active
  ON staff_links (itinerary_resource_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_links_tenant ON staff_links (tenant_id);

ALTER TABLE staff_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_links_tenant ON staff_links;
CREATE POLICY staff_links_tenant ON staff_links
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS staff_links_service_role ON staff_links;
CREATE POLICY staff_links_service_role ON staff_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- Post-check: structure, then behaviour — a link must round-trip, a second
-- ACTIVE link for the same assignment must be refused, and a revoked one
-- must not block a new one.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  a_tenant UUID; an_itin UUID; a_res UUID;
  l1 UUID := gen_random_uuid(); l2 UUID := gen_random_uuid();
  dup_refused BOOLEAN := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_links'
                   AND policyname = 'staff_links_tenant') THEN
    RAISE EXCEPTION 'tenant policy missing';
  END IF;

  SELECT r.tenant_id, r.itinerary_id, r.id INTO a_tenant, an_itin, a_res
    FROM itinerary_resources r LIMIT 1;
  IF a_res IS NULL THEN
    RAISE NOTICE 'no assignment to probe with — structure asserted only';
  ELSE
    INSERT INTO staff_links (id, tenant_id, itinerary_id, itinerary_resource_id, token)
    VALUES (l1, a_tenant, an_itin, a_res, 'zzprobe-' || l1::text);

    BEGIN
      INSERT INTO staff_links (id, tenant_id, itinerary_id, itinerary_resource_id, token)
      VALUES (l2, a_tenant, an_itin, a_res, 'zzprobe-' || l2::text);
    EXCEPTION WHEN unique_violation THEN dup_refused := true;
    END;
    IF NOT dup_refused THEN
      RAISE EXCEPTION 'two active links for one assignment were accepted';
    END IF;

    -- Revoked link must not block a fresh one.
    UPDATE staff_links SET revoked_at = NOW() WHERE id = l1;
    INSERT INTO staff_links (id, tenant_id, itinerary_id, itinerary_resource_id, token)
    VALUES (l2, a_tenant, an_itin, a_res, 'zzprobe-' || l2::text);

    DELETE FROM staff_links WHERE id IN (l1, l2);
    RAISE NOTICE 'probe: round-trip ok, active-dup refused, revoke frees the slot';
  END IF;
END $$;

COMMIT;
