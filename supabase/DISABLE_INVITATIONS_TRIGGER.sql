-- Disable the trigger causing stack overflow on tenant_invitations

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_expire_invitations ON tenant_invitations;

-- Also drop the other trigger on tenant_invitations to be safe
DROP TRIGGER IF EXISTS trigger_tenant_invitations_updated_at ON tenant_invitations;

-- Verify triggers are removed
SELECT
  t.tgname AS trigger_name,
  c.relname AS table_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'tenant_invitations'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Should return 0 rows
