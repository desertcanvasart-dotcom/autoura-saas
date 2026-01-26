-- Create tenant_invitations table for team member invitations

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invitation_token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON tenant_invitations(email);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token ON tenant_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_status ON tenant_invitations(status);

-- Enable RLS
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Tenant members can view invitations for their tenant
CREATE POLICY "Tenant members can view their tenant invitations"
ON tenant_invitations
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Tenant admins/owners can create invitations
CREATE POLICY "Tenant admins can create invitations"
ON tenant_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- Tenant admins can update invitations (e.g., revoke)
CREATE POLICY "Tenant admins can update invitations"
ON tenant_invitations
FOR UPDATE
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- Tenant admins can delete invitations
CREATE POLICY "Tenant admins can delete invitations"
ON tenant_invitations
FOR DELETE
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- Verify table was created
SELECT
  'tenant_invitations table created successfully' as message,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenant_invitations';
