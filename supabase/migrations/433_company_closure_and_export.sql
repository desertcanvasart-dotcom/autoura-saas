-- ============================================
-- 433: closing a company, deleting it 30 days later, and exporting its data
-- ============================================
-- The Terms (6.3) promise "you may export Your Data at any time … upon
-- termination, you will have 30 days to export Your Data before it is
-- deleted", and the privacy policy promises deletion and a portable export.
-- None of it existed. This adds what the server needs:
--
--   tenant_closures      an owner's request to close the company, and when the
--                        data goes. Written only by the server
--                        (app/api/account/company), so an admin cannot
--                        schedule — or bring forward — a deletion directly.
--   company_deletions    the record that a company was deleted and when. It
--                        has no foreign key on purpose: it outlives the company.
--   tenant_data_tables() every table holding company data and its columns, so
--                        the export follows the schema instead of a list
--                        someone has to remember to update.
--   purge_tenant()       deletes everything a company owns, in the order the
--                        schema needs (see below).

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_closures (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_after TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS tenant_closures_purge_after ON public.tenant_closures (purge_after);

ALTER TABLE public.tenant_closures ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_closures FROM anon, authenticated;

DROP POLICY IF EXISTS "Members see their company's closure" ON public.tenant_closures;
CREATE POLICY "Members see their company's closure" ON public.tenant_closures
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE TABLE IF NOT EXISTS public.company_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  former_tenant_id UUID NOT NULL,
  company_name TEXT,
  requested_by UUID,
  requested_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.company_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_deletions FROM anon, authenticated;

-- Every base table in public with a tenant_id, and its columns in order.
CREATE OR REPLACE FUNCTION public.tenant_data_tables()
RETURNS TABLE (table_name TEXT, column_names TEXT[])
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.table_name::text, array_agg(c.column_name::text ORDER BY c.ordinal_position)
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns k
      WHERE k.table_schema = 'public' AND k.table_name = c.table_name AND k.column_name = 'tenant_id'
    )
  GROUP BY c.table_name
  ORDER BY c.table_name;
$$;

REVOKE ALL ON FUNCTION public.tenant_data_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_data_tables() TO service_role;

-- The columns of named tables, for the exports of rows keyed some other way
-- (a person's own settings; a company's child rows with no tenant_id).
CREATE OR REPLACE FUNCTION public.data_table_columns(p_tables TEXT[])
RETURNS TABLE (table_name TEXT, column_names TEXT[])
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.table_name::text, array_agg(c.column_name::text ORDER BY c.ordinal_position)
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = ANY (p_tables)
  GROUP BY c.table_name;
$$;

REVOKE ALL ON FUNCTION public.data_table_columns(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_table_columns(TEXT[]) TO service_role;

-- Deletes a company and everything it owns. Almost every table cascades from
-- tenants; the exceptions are handled here:
--   bookings.itinerary_id is ON DELETE RESTRICT (100), checked row by row, so
--     the cascade fails if it reaches an itinerary before its bookings —
--     bookings go first;
--   a few tables carry tenant_id with no foreign key (commissions,
--     rate_audit_log …) — they go last, after the cascade, because deleting
--     the rates writes audit rows into rate_audit_log on the way out.
CREATE OR REPLACE FUNCTION public.purge_tenant(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'purge_tenant: no company given';
  END IF;

  DELETE FROM bookings WHERE tenant_id = p_tenant_id;
  DELETE FROM tenants WHERE id = p_tenant_id;

  FOR t IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint k
        WHERE k.conrelid = c.oid AND k.contype = 'f'
          AND k.confrelid = 'public.tenants'::regclass AND a.attnum = ANY (k.conkey)
      )
  LOOP
    EXECUTE format('DELETE FROM %s WHERE tenant_id = $1', t.tbl) USING p_tenant_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_tenant(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_tenant(UUID) TO service_role;

COMMIT;
