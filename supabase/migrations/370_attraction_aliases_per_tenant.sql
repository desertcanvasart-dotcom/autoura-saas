-- ============================================
-- 370: an attraction alias belongs to the agency whose fee it names
-- ============================================
-- An alias says "when a tour says X, the fee is the one my sheet calls Y".
-- Y is a name on ONE agency's entrance-fee sheet. Migration 331 retired the
-- shared rate catalogue — every company enters its own fees, under its own
-- names — and left these aliases global on the grounds that they were "only
-- vocabulary". They are not: they point INTO a sheet.
--
-- Checked on production, 2026-09-20. Nine of the 27 global aliases pointed at
-- a name that is on NOBODY's sheet ("Valley of the Kings", "Sphinx Area",
-- "Pyramids of Giza", "Citadel of Saladin", "Edfu Temple"), so they took
-- wording that was right and made it wrong: Sawa Tours wrote "Valley Of
-- Kings", exactly as their sheet has it, and the alias rewrote it into a
-- miss. And a global row is one agency's wording imposed on every other —
-- an agency that renames a fee would have its pricing broken by a row it
-- cannot see or edit. That is not white label.
--
-- So: every alias is a tenant's own. The globals that WORK for an agency are
-- handed to that agency, unchanged in effect; the ones that work for nobody
-- go; and the column can no longer hold a global.
--
-- A NEW agency gets none. It starts with an empty fee sheet (331), and an
-- alias into an empty sheet is exactly the fault described above.
--
-- Idempotent: re-running copies nothing twice and deletes nothing more.

-- --------------------------------------------------------------------
-- 1. Does this canonical land on exactly one fee of THIS agency's sheet?
--    The engine's own rule (lib/pricing/entrance-fee-match.ts): a fee whose
--    name IS the wording, else exactly one fee that contains it. ' + ' joins
--    a combo ticket; every part must land. Kept as a function: it is what a
--    Settings screen will need to flag an alias that has stopped working.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attraction_alias_resolves(p_tenant uuid, p_canonical text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(bool_and(
    (SELECT count(*) FROM entrance_fees f
      WHERE f.tenant_id = p_tenant AND f.is_active
        AND lower(btrim(f.attraction_name)) = lower(btrim(part.name))) = 1
    OR (
      (SELECT count(*) FROM entrance_fees f
        WHERE f.tenant_id = p_tenant AND f.is_active
          AND lower(btrim(f.attraction_name)) = lower(btrim(part.name))) = 0
      AND
      (SELECT count(*) FROM entrance_fees f
        WHERE f.tenant_id = p_tenant AND f.is_active
          AND position(lower(btrim(part.name)) IN lower(f.attraction_name)) > 0) = 1
    )
  ), false)
  FROM regexp_split_to_table(p_canonical, ' \+ ') AS part(name)
  WHERE btrim(part.name) <> ''
$$;

-- --------------------------------------------------------------------
-- 2. Hand each agency the global aliases that work on ITS sheet. An alias
--    the agency already defined for itself wins, as it always did.
-- --------------------------------------------------------------------
INSERT INTO attraction_aliases (tenant_id, alias, canonical)
SELECT t.id, g.alias, g.canonical
  FROM attraction_aliases g
 CROSS JOIN tenants t
 WHERE g.tenant_id IS NULL
   AND g.is_active
   AND public.attraction_alias_resolves(t.id, g.canonical)
ON CONFLICT (tenant_id, lower(alias)) WHERE tenant_id IS NOT NULL DO NOTHING;

-- --------------------------------------------------------------------
-- 3. The spellings the tours actually use, against the names the sheets
--    actually have — every line checked against live data. Same place, a
--    different spelling; nothing here decides which TICKET covers a sight
--    (those need the operator's yes and are not in this migration).
--    Given only to an agency whose sheet has the fee.
-- --------------------------------------------------------------------
INSERT INTO attraction_aliases (tenant_id, alias, canonical)
SELECT t.id, a.alias, a.canonical
  FROM (VALUES
    ('Valley of the Kings',          'Valley Of Kings'),
    ('Temple of Hatshepsut',         'Hatshepsut Temple'),
    ('Step Pyramid of Djoser',       'Step Pyramid of Zoser'),
    ('Citadel of Saladin',           'Salah Eldin Citadel'),
    ('Saladin Citadel',              'Salah Eldin Citadel'),
    ('Citadel',                      'Salah Eldin Citadel'),
    ('Abu Simbel Temples',           'Abu Simbel Temple'),
    ('Abu Simbel',                   'Abu Simbel Temple'),
    ('Al-Muizz Street',              'Al Muizz Street'),
    ('Temple of Horus at Edfu',      'The Temple Of Horus'),
    ('Edfu Temple',                  'The Temple Of Horus'),
    ('Edfu',                         'The Temple Of Horus'),
    ('Deir el-Medina',               'Deir El Madina'),
    ('El Kab',                       'El-Kab Tombs'),
    ('Wadi El Hitan',                'Wadi Al-Hitan / Whale Valley'),
    ('Whale Valley',                 'Wadi Al-Hitan / Whale Valley'),
    ('Qarun Lake',                   'Lake Qarun'),
    ('Catacombs of Kom El Shoqafa',  'Catacombs')
  ) AS a(alias, canonical)
 CROSS JOIN tenants t
 WHERE public.attraction_alias_resolves(t.id, a.canonical)
ON CONFLICT (tenant_id, lower(alias)) WHERE tenant_id IS NOT NULL DO NOTHING;

-- --------------------------------------------------------------------
-- 4. The globals go, and cannot come back.
-- --------------------------------------------------------------------
DELETE FROM attraction_aliases WHERE tenant_id IS NULL;

DROP POLICY IF EXISTS attraction_aliases_global_read ON attraction_aliases;
DROP INDEX IF EXISTS uq_attraction_aliases_global;
ALTER TABLE attraction_aliases ALTER COLUMN tenant_id SET NOT NULL;

-- Post-check, in the manner of 331.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM attraction_aliases WHERE tenant_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'attraction_aliases still has % global rows', n; END IF;
END $$;
