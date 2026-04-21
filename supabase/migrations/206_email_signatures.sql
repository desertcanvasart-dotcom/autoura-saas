-- ============================================
-- MIGRATION 206: email_signatures table (tenant-scoped)
-- ============================================
-- Per-user signatures for the email reply composer. Tenant-scoped so a
-- super-admin impersonation or a teammate with view access cannot see
-- other tenants' signatures.
-- ============================================

CREATE TABLE IF NOT EXISTS email_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,            -- HTML or plain text
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_signatures_user   ON email_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_email_signatures_tenant ON email_signatures(tenant_id);

-- At most one default per (tenant, user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_signatures_default
  ON email_signatures(tenant_id, user_id) WHERE is_default;

ALTER TABLE email_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own signatures"   ON email_signatures;
DROP POLICY IF EXISTS "Users insert own signatures" ON email_signatures;
DROP POLICY IF EXISTS "Users update own signatures" ON email_signatures;
DROP POLICY IF EXISTS "Users delete own signatures" ON email_signatures;

CREATE POLICY "Users read own signatures"
  ON email_signatures FOR SELECT
  USING (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users insert own signatures"
  ON email_signatures FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users update own signatures"
  ON email_signatures FOR UPDATE
  USING (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users delete own signatures"
  ON email_signatures FOR DELETE
  USING (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_email_signatures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_signatures_updated_at ON email_signatures;
CREATE TRIGGER trg_email_signatures_updated_at
  BEFORE UPDATE ON email_signatures
  FOR EACH ROW EXECUTE FUNCTION update_email_signatures_updated_at();
