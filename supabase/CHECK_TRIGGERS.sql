-- Check for triggers on multi-tenant tables that might cause recursion

SELECT
  t.tgname AS trigger_name,
  c.relname AS table_name,
  p.proname AS function_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname IN ('tenants', 'tenant_members', 'tenant_features', 'tenant_invitations')
  AND NOT t.tgisinternal  -- Exclude internal triggers
ORDER BY c.relname, t.tgname;

-- If this returns any triggers, they might be causing the stack overflow
