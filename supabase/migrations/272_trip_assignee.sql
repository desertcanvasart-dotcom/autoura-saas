-- =====================================================================
-- 272 — Trip ownership: assign a team member to an itinerary / booking
-- =====================================================================
-- Until now nothing recorded WHO is responsible for a trip. Staff could
-- only be attached to a trip indirectly, one task at a time, via
-- tasks.assigned_to + tasks.linked_id (see 008 / 214). The existing
-- itineraries.assigned_* columns point at SUPPLIER records (guides,
-- vehicles, hotels), not at staff, so they can't answer "what is Sara
-- working on".
--
-- One owner per record, on both objects deliberately: the itinerary is
-- the pre-sale artifact and the booking is the post-confirmation
-- operational one, and in a tour operator the seller is usually not the
-- operator. Independent columns let a trip be handed over at
-- confirmation without rewriting who built it.
--
--   - References team_members (the tenant-scoped staff roster), NOT
--     auth.users and NOT tenant_members — this matches tasks.assigned_to
--     and unified_conversations.assigned_team_member_id, and it is what
--     the notifications table is keyed by.
--   - Nullable: unassigned is the normal starting state, and every row
--     that exists today is unassigned.
--   - ON DELETE SET NULL: removing a staff member must never cascade
--     into trip history. The trip survives, it just loses its owner.
--
-- NOTE ON TENANT SAFETY: a Postgres FK check does not run RLS, so this
-- constraint alone would happily accept a team_members id belonging to
-- another tenant. The API layer validates that the assignee is an
-- active member of the caller's tenant before writing; the trigger
-- below is the backstop for any path that forgets.
-- =====================================================================

ALTER TABLE itineraries
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN itineraries.assigned_to IS
  'Team member responsible for this itinerary (pre-sale owner). References team_members, not auth.users.';
COMMENT ON COLUMN bookings.assigned_to IS
  'Team member responsible for operating this booking (post-confirmation owner). May differ from the itinerary owner.';

-- =====================================================================
-- INDEXES — the driving query is "everything assigned to member X in
-- this tenant", so lead with tenant_id and skip unassigned rows.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_itineraries_assigned_to
  ON itineraries (tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_to
  ON bookings (tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;

-- =====================================================================
-- CROSS-TENANT GUARD — the FK proves the team member exists, not that
-- they belong to this row's tenant. Reject the mismatch loudly instead
-- of silently letting one tenant name another tenant's staff.
-- =====================================================================

CREATE OR REPLACE FUNCTION assert_assignee_in_tenant()
RETURNS TRIGGER AS $$
DECLARE
  assignee_tenant UUID;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO assignee_tenant
  FROM team_members
  WHERE id = NEW.assigned_to;

  IF assignee_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'assigned_to % belongs to a different tenant than % row %',
      NEW.assigned_to, TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_itineraries_assignee_tenant ON itineraries;
CREATE TRIGGER trigger_itineraries_assignee_tenant
  BEFORE INSERT OR UPDATE OF assigned_to ON itineraries
  FOR EACH ROW
  EXECUTE FUNCTION assert_assignee_in_tenant();

DROP TRIGGER IF EXISTS trigger_bookings_assignee_tenant ON bookings;
CREATE TRIGGER trigger_bookings_assignee_tenant
  BEFORE INSERT OR UPDATE OF assigned_to ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION assert_assignee_in_tenant();

DO $$
BEGIN
  RAISE NOTICE 'Migration 272 complete — assigned_to on itineraries + bookings, with cross-tenant guard';
END $$;
