-- Migration 327: Localize the built-in departments
--
-- Migration 214 seeded 4 GLOBAL departments (tenant_id NULL) that every
-- tenant reads and none may write (218's RLS). Result: the departments a
-- tenant actually starts with are the ones they can never edit — no
-- renaming, no custom service types (B-item 5), no deactivating. The
-- shadow/override dance the catalog tables use is overkill for 4 rows of
-- plain text, so the duality is retired instead:
--
--   1. Every tenant gets its OWN copy of each global department (skipped
--      when a same-named tenant department already exists).
--   2. team_members / tasks rows pointing at a global department are
--      re-pointed to their tenant's copy BEFORE the global rows go, so
--      nothing is silently un-filed (the FKs are ON DELETE SET NULL).
--   3. The global rows are deleted.
--   4. New tenants are seeded by an AFTER INSERT trigger on tenants —
--      not by widening the fragile signup function — so every creation
--      path (signup trigger, super-admin, future imports) gets them.
--
-- Idempotent: re-running finds no NULL-tenant rows and no missing seeds.

-- 1. Copy each global department into every tenant lacking that name.
INSERT INTO departments (tenant_id, name, description, service_types, is_active)
SELECT t.id, g.name, g.description, g.service_types, g.is_active
FROM tenants t
CROSS JOIN departments g
WHERE g.tenant_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM departments d WHERE d.tenant_id = t.id AND d.name = g.name
  );

-- 2. Re-point references from the global row to the tenant's own copy
--    (matched by name — the copy above guarantees one exists).
UPDATE team_members tm
SET department_id = d.id
FROM departments g
JOIN departments d ON d.name = g.name AND d.tenant_id IS NOT NULL
WHERE g.tenant_id IS NULL
  AND tm.department_id = g.id
  AND d.tenant_id = tm.tenant_id;

UPDATE tasks tk
SET department_id = d.id
FROM departments g
JOIN departments d ON d.name = g.name AND d.tenant_id IS NOT NULL
WHERE g.tenant_id IS NULL
  AND tk.department_id = g.id
  AND d.tenant_id = tk.tenant_id;

-- 3. The global rows go. Anything still pointing at them (there should be
--    nothing after step 2) is SET NULL by the FKs, not orphaned.
DELETE FROM departments WHERE tenant_id IS NULL;

-- 4. Seed future tenants. SECURITY DEFINER with a pinned search_path (the
--    228 lesson) so RLS on departments — WITH CHECK tenant_id =
--    get_user_tenant_id(), which cannot resolve mid-signup — does not
--    block the seed.
CREATE OR REPLACE FUNCTION seed_tenant_departments()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO departments (tenant_id, name, description, service_types)
  VALUES
    (NEW.id, 'Reservation', 'Hotels, cruises, restaurants, vehicles & transport', ARRAY['accommodation','cruise','meal','transportation']::text[]),
    (NEW.id, 'Aviation',    'Flight ticket bookings',                              ARRAY['flight']::text[]),
    (NEW.id, 'Execution',   'Guides, entrance tickets, airport services, hotel porterage', ARRAY['guide','entrance','airport_service','hotel_service']::text[]),
    (NEW.id, 'Accounting',  'Invoices, payments, commissions',                     ARRAY['invoice','payment','commission']::text[])
  ON CONFLICT (tenant_id, name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_tenant_departments ON tenants;
CREATE TRIGGER trg_seed_tenant_departments
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION seed_tenant_departments();
