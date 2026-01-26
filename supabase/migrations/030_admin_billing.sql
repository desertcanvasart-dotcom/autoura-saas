-- =====================================================
-- Migration 030: Tenant Admin Dashboard & Billing Integration
-- =====================================================
-- This migration adds:
-- 0. Prerequisite helper functions (if not exists)
-- 1. Tenant invitations system
-- 2. Activity logging
-- 3. Subscription plans and management
-- 4. Usage tracking
-- 5. Billing invoices

-- =====================================================
-- 0. PREREQUISITE HELPER FUNCTIONS
-- =====================================================

-- Note: These functions already exist, but we ensure they have the correct implementation
-- Using CREATE OR REPLACE to update them without breaking existing RLS policies

-- Function to get current user's tenant ID
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM tenant_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_tenant_id IS 'Returns the tenant_id for the current authenticated user';

-- Function to check if user has a specific role
-- Drop only the specific signature that conflicts, then create new one
DO $$
BEGIN
  -- Try to drop the VARCHAR[] version if it exists
  BEGIN
    DROP FUNCTION IF EXISTS user_has_role(VARCHAR[]);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore errors
  END;
END $$;

CREATE OR REPLACE FUNCTION user_has_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role
  FROM tenant_members
  WHERE user_id = auth.uid()
  AND tenant_id = get_user_tenant_id()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN v_user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_has_role(TEXT[]) IS 'Check if current user has one of the specified roles';

-- =====================================================
-- 1. TENANT INVITATIONS
-- =====================================================

CREATE TABLE tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invitation_token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenant_invitations_tenant ON tenant_invitations(tenant_id);
CREATE INDEX idx_tenant_invitations_email ON tenant_invitations(email);
CREATE INDEX idx_tenant_invitations_token ON tenant_invitations(invitation_token);
CREATE INDEX idx_tenant_invitations_status ON tenant_invitations(status);

COMMENT ON TABLE tenant_invitations IS 'Stores pending invitations to join tenants';
COMMENT ON COLUMN tenant_invitations.invitation_token IS 'Unique token for accepting invitation';
COMMENT ON COLUMN tenant_invitations.expires_at IS 'Invitation expires 7 days after creation';

-- RLS Policies for tenant_invitations
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invitations for their tenant"
  ON tenant_invitations FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can manage invitations"
  ON tenant_invitations FOR ALL
  USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role(ARRAY['owner', 'admin'])
  );

-- =====================================================
-- 2. TENANT ACTIVITY LOGS
-- =====================================================

CREATE TABLE tenant_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_tenant ON tenant_activity_logs(tenant_id);
CREATE INDEX idx_activity_logs_user ON tenant_activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON tenant_activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_action ON tenant_activity_logs(action_type);
CREATE INDEX idx_activity_logs_resource ON tenant_activity_logs(resource_type, resource_id);

COMMENT ON TABLE tenant_activity_logs IS 'Audit log of all tenant actions';
COMMENT ON COLUMN tenant_activity_logs.action_type IS 'Action like user.invited, quote.created, settings.updated';
COMMENT ON COLUMN tenant_activity_logs.details IS 'JSON object with action-specific details';

-- RLS Policies for tenant_activity_logs
ALTER TABLE tenant_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity logs for their tenant"
  ON tenant_activity_logs FOR SELECT
  USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role(ARRAY['owner', 'admin'])
  );

CREATE POLICY "System can insert activity logs"
  ON tenant_activity_logs FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- 3. ENHANCE TENANTS TABLE
-- =====================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#3B82F6',
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#10B981',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{
    "notifications": {
      "email_enabled": true,
      "whatsapp_enabled": true,
      "daily_digest": false
    },
    "integrations": {
      "gmail_enabled": false,
      "whatsapp_enabled": true
    },
    "preferences": {
      "default_quote_validity_days": 14,
      "auto_assign_conversations": true
    }
  }'::jsonb;

COMMENT ON COLUMN tenants.logo_url IS 'URL to tenant logo for branding';
COMMENT ON COLUMN tenants.primary_color IS 'Hex color code for primary brand color';
COMMENT ON COLUMN tenants.secondary_color IS 'Hex color code for secondary brand color';
COMMENT ON COLUMN tenants.settings IS 'JSON object for tenant-specific settings';

-- =====================================================
-- 4. SUBSCRIPTION PLANS
-- =====================================================

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly VARCHAR(255),
  stripe_product_id VARCHAR(255),

  -- Limits (NULL = unlimited)
  max_quotes_per_month INTEGER,
  max_team_members INTEGER,
  max_whatsapp_messages INTEGER,
  max_gmail_accounts INTEGER,
  max_storage_mb INTEGER,

  -- Features (JSON array of feature slugs)
  features JSONB NOT NULL DEFAULT '[]'::jsonb,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active);

COMMENT ON TABLE subscription_plans IS 'Available subscription plans with pricing and limits';
COMMENT ON COLUMN subscription_plans.slug IS 'URL-friendly identifier (starter, professional, enterprise)';
COMMENT ON COLUMN subscription_plans.features IS 'Array of feature slugs like ["custom_branding", "api_access"]';
COMMENT ON COLUMN subscription_plans.max_quotes_per_month IS 'NULL means unlimited';

-- Insert default plans
INSERT INTO subscription_plans (
  name, slug, description, price_monthly, price_yearly,
  max_quotes_per_month, max_team_members, max_whatsapp_messages, max_gmail_accounts, max_storage_mb,
  features
) VALUES
(
  'Starter',
  'starter',
  'Perfect for small travel agencies',
  49.00,
  490.00,
  50,
  2,
  100,
  1,
  1000,
  '["basic_support", "7_day_history"]'::jsonb
),
(
  'Professional',
  'professional',
  'For growing travel businesses',
  149.00,
  1490.00,
  200,
  10,
  500,
  5,
  10000,
  '["priority_support", "unlimited_history", "custom_branding", "api_access"]'::jsonb
),
(
  'Enterprise',
  'enterprise',
  'For large agencies with advanced needs',
  399.00,
  3990.00,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  '["dedicated_support", "unlimited_history", "custom_branding", "api_access", "advanced_analytics", "custom_integrations", "sla"]'::jsonb
);

-- =====================================================
-- 5. TENANT SUBSCRIPTIONS
-- =====================================================

CREATE TABLE tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),

  -- Stripe data
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_payment_method_id VARCHAR(255),

  -- Billing
  status VARCHAR(50) NOT NULL DEFAULT 'active'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),

  -- Dates
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX idx_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_stripe_customer ON tenant_subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription ON tenant_subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON tenant_subscriptions(status);
CREATE INDEX idx_subscriptions_plan ON tenant_subscriptions(plan_id);

COMMENT ON TABLE tenant_subscriptions IS 'Active subscriptions for tenants';
COMMENT ON COLUMN tenant_subscriptions.status IS 'Stripe subscription status';
COMMENT ON COLUMN tenant_subscriptions.ends_at IS 'When subscription ends (for canceled subscriptions)';

-- RLS Policies for tenant_subscriptions
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant subscription"
  ON tenant_subscriptions FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Owners can manage subscription"
  ON tenant_subscriptions FOR ALL
  USING (
    tenant_id = get_user_tenant_id()
    AND user_has_role(ARRAY['owner'])
  );

-- =====================================================
-- 6. TENANT USAGE TRACKING
-- =====================================================

CREATE TABLE tenant_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,

  -- Current billing period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Usage metrics
  quotes_created INTEGER DEFAULT 0,
  whatsapp_messages_sent INTEGER DEFAULT 0,
  gmail_emails_fetched INTEGER DEFAULT 0,
  pdfs_generated INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,

  -- Storage (in MB)
  storage_used INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, period_start)
);

CREATE INDEX idx_usage_tenant ON tenant_usage(tenant_id);
CREATE INDEX idx_usage_subscription ON tenant_usage(subscription_id);
CREATE INDEX idx_usage_period ON tenant_usage(period_start, period_end);
CREATE INDEX idx_usage_tenant_period_end ON tenant_usage(tenant_id, period_end DESC);

COMMENT ON TABLE tenant_usage IS 'Usage metrics per billing period';
COMMENT ON COLUMN tenant_usage.period_start IS 'Start of current billing period';
COMMENT ON COLUMN tenant_usage.period_end IS 'End of current billing period';

-- RLS Policies for tenant_usage
ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant usage"
  ON tenant_usage FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "System can update usage"
  ON tenant_usage FOR UPDATE
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "System can insert usage"
  ON tenant_usage FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- 7. BILLING INVOICES
-- =====================================================

CREATE TABLE billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id),

  -- Stripe data
  stripe_invoice_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_payment_intent_id VARCHAR(255),

  -- Invoice details
  invoice_number VARCHAR(100),
  amount_due DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,

  status VARCHAR(50) NOT NULL
    CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),

  -- Dates
  invoice_date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- URLs
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,

  -- Line items (from Stripe)
  line_items JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_billing_invoices_tenant ON billing_invoices(tenant_id);
CREATE INDEX idx_billing_invoices_subscription ON billing_invoices(subscription_id);
CREATE INDEX idx_billing_invoices_stripe ON billing_invoices(stripe_invoice_id);
CREATE INDEX idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX idx_billing_invoices_date ON billing_invoices(invoice_date DESC);

COMMENT ON TABLE billing_invoices IS 'Invoice history from Stripe';
COMMENT ON COLUMN billing_invoices.line_items IS 'JSON array of invoice line items from Stripe';

-- RLS Policies for billing_invoices
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant invoices"
  ON billing_invoices FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Function to get current tenant subscription
CREATE OR REPLACE FUNCTION get_tenant_subscription(p_tenant_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_slug VARCHAR(50),
  plan_name VARCHAR(100),
  status VARCHAR(50),
  max_quotes_per_month INTEGER,
  max_team_members INTEGER,
  max_whatsapp_messages INTEGER,
  max_gmail_accounts INTEGER,
  features JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.id,
    sp.slug,
    sp.name,
    ts.status,
    sp.max_quotes_per_month,
    sp.max_team_members,
    sp.max_whatsapp_messages,
    sp.max_gmail_accounts,
    sp.features
  FROM tenant_subscriptions ts
  JOIN subscription_plans sp ON ts.plan_id = sp.id
  WHERE ts.tenant_id = p_tenant_id
  AND ts.status IN ('trialing', 'active')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_tenant_subscription IS 'Returns active subscription details for a tenant';

-- Function to check if tenant has reached usage limit
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_tenant_id UUID,
  p_metric VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
  v_subscription RECORD;
BEGIN
  -- Get subscription details
  SELECT * INTO v_subscription
  FROM get_tenant_subscription(p_tenant_id);

  -- If no subscription, deny access
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get limit based on metric
  CASE p_metric
    WHEN 'quotes' THEN
      v_limit := v_subscription.max_quotes_per_month;
    WHEN 'whatsapp_messages' THEN
      v_limit := v_subscription.max_whatsapp_messages;
    WHEN 'team_members' THEN
      v_limit := v_subscription.max_team_members;
    WHEN 'gmail_accounts' THEN
      v_limit := v_subscription.max_gmail_accounts;
    ELSE
      RETURN FALSE;
  END CASE;

  -- NULL limit means unlimited
  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Get current usage
  IF p_metric = 'team_members' THEN
    SELECT COUNT(*) INTO v_current
    FROM tenant_members
    WHERE tenant_id = p_tenant_id;
  ELSIF p_metric = 'gmail_accounts' THEN
    SELECT COUNT(*) INTO v_current
    FROM gmail_tokens
    WHERE user_id IN (
      SELECT user_id FROM tenant_members WHERE tenant_id = p_tenant_id
    );
  ELSE
    -- For time-based metrics (quotes, whatsapp), check current period
    SELECT
      CASE p_metric
        WHEN 'quotes' THEN COALESCE(quotes_created, 0)
        WHEN 'whatsapp_messages' THEN COALESCE(whatsapp_messages_sent, 0)
        ELSE 0
      END INTO v_current
    FROM tenant_usage
    WHERE tenant_id = p_tenant_id
    AND period_end > NOW()
    ORDER BY period_start DESC
    LIMIT 1;

    -- If no usage record exists, allow
    IF NOT FOUND THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Return whether under limit
  RETURN v_current < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_usage_limit IS 'Returns TRUE if tenant is under limit for specified metric';

-- Function to increment usage counter
CREATE OR REPLACE FUNCTION increment_usage(
  p_tenant_id UUID,
  p_metric VARCHAR(50),
  p_amount INTEGER DEFAULT 1
) RETURNS VOID AS $$
DECLARE
  v_subscription_id UUID;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_column_name TEXT;
BEGIN
  -- Get active subscription
  SELECT id, current_period_start, current_period_end
  INTO v_subscription_id, v_period_start, v_period_end
  FROM tenant_subscriptions
  WHERE tenant_id = p_tenant_id
  AND status IN ('trialing', 'active')
  LIMIT 1;

  -- If no subscription, skip
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Map metric to column name
  CASE p_metric
    WHEN 'quotes' THEN v_column_name := 'quotes_created';
    WHEN 'whatsapp_messages' THEN v_column_name := 'whatsapp_messages_sent';
    WHEN 'gmail_emails' THEN v_column_name := 'gmail_emails_fetched';
    WHEN 'pdfs' THEN v_column_name := 'pdfs_generated';
    WHEN 'api_calls' THEN v_column_name := 'api_calls';
    ELSE RETURN;
  END CASE;

  -- Insert or update usage record
  EXECUTE format('
    INSERT INTO tenant_usage (tenant_id, subscription_id, period_start, period_end, %I)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, period_start)
    DO UPDATE SET %I = tenant_usage.%I + $5, updated_at = NOW()
  ', v_column_name, v_column_name, v_column_name)
  USING p_tenant_id, v_subscription_id, v_period_start, v_period_end, p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_usage IS 'Increments usage counter for specified metric';

-- Function to log activity
CREATE OR REPLACE FUNCTION log_activity(
  p_tenant_id UUID,
  p_user_id UUID,
  p_action_type VARCHAR(100),
  p_resource_type VARCHAR(100) DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO tenant_activity_logs (
    tenant_id,
    user_id,
    action_type,
    resource_type,
    resource_id,
    details,
    ip_address,
    user_agent
  ) VALUES (
    p_tenant_id,
    p_user_id,
    p_action_type,
    p_resource_type,
    p_resource_id,
    p_details,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_activity IS 'Creates an activity log entry';

-- =====================================================
-- 9. TRIGGERS
-- =====================================================

-- Trigger to auto-expire invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tenant_invitations
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
  AND expires_at < NOW();

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_expire_invitations
AFTER INSERT OR UPDATE ON tenant_invitations
FOR EACH STATEMENT
EXECUTE FUNCTION expire_old_invitations();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_invitations_updated_at
BEFORE UPDATE ON tenant_invitations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_subscription_plans_updated_at
BEFORE UPDATE ON subscription_plans
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_tenant_subscriptions_updated_at
BEFORE UPDATE ON tenant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_tenant_usage_updated_at
BEFORE UPDATE ON tenant_usage
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_billing_invoices_updated_at
BEFORE UPDATE ON billing_invoices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 10. GRANT PERMISSIONS
-- =====================================================

-- Grant authenticated users access to view subscription plans
GRANT SELECT ON subscription_plans TO authenticated;

-- Grant authenticated users access to their own data via RLS
GRANT ALL ON tenant_invitations TO authenticated;
GRANT ALL ON tenant_activity_logs TO authenticated;
GRANT ALL ON tenant_subscriptions TO authenticated;
GRANT ALL ON tenant_usage TO authenticated;
GRANT ALL ON billing_invoices TO authenticated;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Insert migration record (if you have a migrations tracking table)
-- INSERT INTO schema_migrations (version, name) VALUES ('030', 'admin_billing');
