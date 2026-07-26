import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { workspaceModeFromBusinessType, legacyWorkspaceFields, type WorkspaceMode } from '@/lib/workspace-mode'

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role } = authResult

    // Only admins and owners can update tenant settings
    if (!['owner', 'admin'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()
    const body = await request.json()

    const {
      company_name,
      contact_email,
      business_type,
      workspace_mode,
      logo_url,
      // Features
      b2c_enabled,
      b2b_enabled,
      whatsapp_integration,
      email_integration,
      pdf_generation,
      analytics_enabled,
      max_users,
      max_quotes_per_month,
      max_partners,
      primary_color,
      secondary_color,
    } = body

    // Update tenant basic info
    const tenantUpdates: any = {}
    if (company_name !== undefined) tenantUpdates.company_name = company_name
    if (contact_email !== undefined) tenantUpdates.contact_email = contact_email
    // Workspace visibility. `workspace_mode` is the source of truth
    // (migration 239); the legacy columns are written alongside it until the
    // cutover migration drops them, so a deploy running older code still sees
    // a consistent answer.
    const resolvedMode: WorkspaceMode | undefined =
      workspace_mode !== undefined
        ? (workspace_mode as WorkspaceMode)
        : business_type !== undefined
          ? workspaceModeFromBusinessType(business_type)
          : undefined

    if (resolvedMode !== undefined) {
      tenantUpdates.workspace_mode = resolvedMode
      tenantUpdates.business_type = legacyWorkspaceFields(resolvedMode).business_type
    }
    if (logo_url !== undefined) tenantUpdates.logo_url = logo_url
    tenantUpdates.updated_at = new Date().toISOString()

    const { error: tenantError } = await adminClient
      .from('tenants')
      .update(tenantUpdates)
      .eq('id', tenant_id)

    if (tenantError) {
      console.error('Error updating tenant:', tenantError)
      return NextResponse.json(
        { success: false, error: 'Failed to update tenant settings' },
        { status: 500 }
      )
    }

    // Update tenant features
    const featureUpdates: any = {}
    // Legacy mirror of workspace_mode — kept in sync rather than written
    // independently, which is how the two sources drifted in the first place.
    if (resolvedMode !== undefined) {
      const legacy = legacyWorkspaceFields(resolvedMode)
      featureUpdates.b2c_enabled = legacy.b2c_enabled
      featureUpdates.b2b_enabled = legacy.b2b_enabled
    } else {
      if (b2c_enabled !== undefined) featureUpdates.b2c_enabled = b2c_enabled
      if (b2b_enabled !== undefined) featureUpdates.b2b_enabled = b2b_enabled
    }
    if (whatsapp_integration !== undefined) featureUpdates.whatsapp_integration = whatsapp_integration
    if (email_integration !== undefined) featureUpdates.email_integration = email_integration
    if (pdf_generation !== undefined) featureUpdates.pdf_generation = pdf_generation
    if (analytics_enabled !== undefined) featureUpdates.analytics_enabled = analytics_enabled
    if (max_users !== undefined) featureUpdates.max_users = max_users
    if (max_quotes_per_month !== undefined) featureUpdates.max_quotes_per_month = max_quotes_per_month
    if (max_partners !== undefined) featureUpdates.max_partners = max_partners
    if (primary_color !== undefined) featureUpdates.primary_color = primary_color
    if (secondary_color !== undefined) featureUpdates.secondary_color = secondary_color
    featureUpdates.updated_at = new Date().toISOString()

    if (Object.keys(featureUpdates).length > 1) { // More than just updated_at
      const { error: featuresError } = await adminClient
        .from('tenant_features')
        .update(featureUpdates)
        .eq('tenant_id', tenant_id)

      if (featuresError) {
        console.error('Error updating features:', featuresError)
        return NextResponse.json(
          { success: false, error: 'Failed to update tenant features' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully'
    })
  } catch (error: any) {
    console.error('Error in tenant settings PATCH:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
