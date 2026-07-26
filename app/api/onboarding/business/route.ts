import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { workspaceModeFromBusinessType, legacyWorkspaceFields, type WorkspaceMode } from '@/lib/workspace-mode'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    const SUPPORTED_LOCALES = ['en', 'fr', 'es']
    if (body.locale !== undefined && !SUPPORTED_LOCALES.includes(body.locale)) {
      return NextResponse.json(
        { success: false, error: `locale must be one of: ${SUPPORTED_LOCALES.join(', ')}` },
        { status: 400 }
      )
    }

    // Both workspaces default ON: onboarding OFFERS the choice rather than
    // assuming one, so a tenant who skips the question keeps the whole product.
    const onboardingMode: WorkspaceMode = body.workspace_mode
      ?? workspaceModeFromBusinessType(body.business_type)

    // Update tenant with business configuration
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({
        // workspace_mode is the source of truth; business_type is written
        // alongside it until the cutover migration drops it.
        workspace_mode: onboardingMode,
        business_type: legacyWorkspaceFields(onboardingMode).business_type,
        default_currency: body.default_currency,
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        services_offered: body.services_offered,
        company_phone: body.company_phone,
        company_website: body.company_website,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenant_id)

    if (tenantError) {
      console.error('Error updating tenant business config:', tenantError)
      return NextResponse.json(
        { success: false, error: 'Failed to update business configuration' },
        { status: 500 }
      )
    }

    // Legacy mirror, derived from the same value rather than recomputed.
    const { b2c_enabled: b2cEnabled, b2b_enabled: b2bEnabled } = legacyWorkspaceFields(onboardingMode)

    const { error: featuresError } = await supabase
      .from('tenant_features')
      .update({
        b2c_enabled: b2cEnabled,
        b2b_enabled: b2bEnabled,
        onboarding_step: Math.max(1, body.current_step || 1),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenant_id)

    if (featuresError) {
      console.error('Error updating tenant features:', featuresError)
    }

    return NextResponse.json({
      success: true,
      message: 'Business configuration saved successfully'
    })
  } catch (error) {
    console.error('Error in onboarding business POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
