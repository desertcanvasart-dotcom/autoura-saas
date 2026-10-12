-- ============================================================================
-- 409 — a supplier code is unique within an agency, not across the platform
-- ============================================================================
--
-- suppliers.supplier_code was declared UNIQUE with no tenant in it
-- (migration 000) and never revised — the same bug migration 360 fixed for
-- tour codes. One agency holding SUP-0001 took it from every other agency, so
-- a second workspace importing a supplier sheet failed its whole insert on
-- "duplicate key value violates unique constraint", and Reconcile Codes could
-- not stamp a code another agency already had.
--
-- The application has always wanted per-agency codes: every lookup of a
-- supplier_code is scoped by tenant_id (app/api/suppliers/import,
-- app/api/rates/bulk/import, app/api/suppliers/reconcile-codes), and codes are
-- now given out per agency in order (lib/suppliers/supplier-code.ts).
--
-- WIDENING, NOT NARROWING: (tenant_id, supplier_code) is weaker than
-- (supplier_code), so every row that satisfies the old constraint satisfies
-- the new one. No data can fail this, and nothing is rewritten. NULL codes stay
-- allowed (a UNIQUE constraint never compares NULLs).
--
-- The old constraint is found by its COLUMNS, not its name. Idempotent.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  c TEXT;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'suppliers'::regclass
     AND contype = 'u'
     AND conkey = ARRAY[(
           SELECT attnum FROM pg_attribute
            WHERE attrelid = 'suppliers'::regclass AND attname = 'supplier_code'
         )]::smallint[];

  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE suppliers DROP CONSTRAINT %I', c);
    RAISE NOTICE '[409] dropped % on suppliers(supplier_code)', c;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'suppliers'::regclass AND contype = 'u'
       AND conname = 'suppliers_tenant_supplier_code_key'
  ) THEN
    ALTER TABLE suppliers
      ADD CONSTRAINT suppliers_tenant_supplier_code_key UNIQUE (tenant_id, supplier_code);
    RAISE NOTICE '[409] added suppliers_tenant_supplier_code_key on suppliers(tenant_id, supplier_code)';
  END IF;
END $$;

-- Post-checks, inside the transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'suppliers'::regclass AND contype = 'u'
       AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                            WHERE attrelid = 'suppliers'::regclass AND attname = 'supplier_code')]::smallint[]
  ) THEN
    RAISE EXCEPTION 'suppliers.supplier_code is still globally unique';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'suppliers'::regclass AND c.contype = 'u'
       AND (SELECT array_agg(x ORDER BY x) FROM unnest(c.conkey) AS x) =
           (SELECT array_agg(a.attnum ORDER BY a.attnum)
              FROM pg_attribute a
             WHERE a.attrelid = 'suppliers'::regclass AND a.attname IN ('tenant_id', 'supplier_code'))
  ) THEN
    RAISE EXCEPTION 'suppliers(tenant_id, supplier_code) is not unique';
  END IF;
END $$;

COMMIT;
