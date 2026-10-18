-- ============================================
-- 434: a failing company deletion steps aside; exports page on the real key
-- ============================================
-- (1) The nightly purge (app/api/cron/purge-closed-companies) took the five
--     oldest due closures. One that failed every night (a timeout, a bad
--     row) kept its place, so five such companies blocked every deletion
--     behind them. Each attempt is now recorded; the job takes the ones
--     tried least recently first, and the error is kept for whoever looks.
-- (2) The export (lib/account/data-export.ts) paged a table with no `id`
--     column on its first column — tenant_id, the same for every row — so
--     rows could fall between pages. The table functions now return the
--     primary key, and the export orders on all of it.

BEGIN;

ALTER TABLE public.tenant_closures ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.tenant_closures ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.tenant_closures ADD COLUMN IF NOT EXISTS last_error TEXT;

-- The return type changes, so the functions are dropped and made again.
DROP FUNCTION IF EXISTS public.tenant_data_tables();
DROP FUNCTION IF EXISTS public.data_table_columns(TEXT[]);

CREATE FUNCTION public.tenant_data_tables()
RETURNS TABLE (table_name TEXT, column_names TEXT[], key_columns TEXT[])
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.relname::text,
    (SELECT array_agg(a.attname::text ORDER BY a.attnum)
       FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
    (SELECT array_agg(a.attname::text ORDER BY array_position(k.conkey, a.attnum))
       FROM pg_constraint k
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.conrelid = c.oid AND k.contype = 'p')
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    )
  ORDER BY c.relname;
$$;

CREATE FUNCTION public.data_table_columns(p_tables TEXT[])
RETURNS TABLE (table_name TEXT, column_names TEXT[], key_columns TEXT[])
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.relname::text,
    (SELECT array_agg(a.attname::text ORDER BY a.attnum)
       FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
    (SELECT array_agg(a.attname::text ORDER BY array_position(k.conkey, a.attnum))
       FROM pg_constraint k
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.conrelid = c.oid AND k.contype = 'p')
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY (p_tables);
$$;

REVOKE ALL ON FUNCTION public.tenant_data_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_data_tables() TO service_role;
REVOKE ALL ON FUNCTION public.data_table_columns(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_table_columns(TEXT[]) TO service_role;

COMMIT;
