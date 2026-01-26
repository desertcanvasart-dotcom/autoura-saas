-- Fix RLS policies for tenant_features to allow INSERT

-- Allow admins to insert tenant features
DROP POLICY IF EXISTS "Admins can insert features" ON tenant_features;
CREATE POLICY "Admins can insert features" ON tenant_features
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_has_role('admin'));

-- Comment
COMMENT ON POLICY "Admins can insert features" ON tenant_features IS
  'Allows admins to create tenant_features records for their tenant';
