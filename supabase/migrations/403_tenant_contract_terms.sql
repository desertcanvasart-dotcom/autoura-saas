-- ============================================================================
-- 403 — the country and the law a travel contract names
-- ============================================================================
--
-- Every contract said the balance was paid "upon arrival in Egypt", visas were
-- "for travel to Egypt" and disputes went to arbitration "under Egyptian law",
-- whoever the operator was. Both now come from Settings → Organization:
--
--   operating_country       where the operator runs its trips ("Egypt")
--   contract_governing_law  the law the contract is under ("Egyptian law")
--
-- NULL = the contract names no country (lib/contract-terms.ts). Additive and
-- replay-safe.
-- ============================================================================

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS operating_country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contract_governing_law VARCHAR(255);

COMMENT ON COLUMN tenants.operating_country IS
  'Where the operator runs its trips, as travel contracts name it ("Egypt"). NULL = no country named.';
COMMENT ON COLUMN tenants.contract_governing_law IS
  'The law travel contracts are governed by ("Egyptian law"). NULL = the law of the operator''s country of registration.';

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_name = 'tenants'
         AND column_name IN ('operating_country', 'contract_governing_law')) <> 2 THEN
    RAISE EXCEPTION 'tenants.operating_country / contract_governing_law missing';
  END IF;
END $$;

COMMIT;
