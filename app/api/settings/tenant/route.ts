import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
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
      logo_url,
      primary_color,
      secondary_color,
      rates_currency,
    } = body

    // Update tenant basic info
    const tenantUpdates: any = {}
    if (company_name !== undefined) tenantUpdates.company_name = company_name
    if (contact_email !== undefined) tenantUpdates.contact_email = contact_email
    if (logo_url !== undefined) tenantUpdates.logo_url = logo_url
    // Run currency (C3.4): the currency ALL this tenant's stored rates are
    // read in. Changing it reinterprets stored numbers — the UI warns.
    if (rates_currency !== undefined) {
      const rc = rates_currency === null || rates_currency === '' ? null : String(rates_currency).toUpperCase()
      if (rc !== null && !(SUPPORTED_CURRENCIES as readonly string[]).includes(rc)) {
        return NextResponse.json(
          { success: false, error: `rates_currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}` },
          { status: 400 }
        )
      }
      tenantUpdates.rates_currency = rc
    }
    // Branding is tenant identity — tenants table, same as the logo (mig 255).
    if (primary_color !== undefined) tenantUpdates.primary_color = primary_color
    if (secondary_color !== undefined) tenantUpdates.secondary_color = secondary_color
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
    // Plan limits are NOT stored per tenant any more. They live in
    // lib/pricing-config.ts, are enforced from subscription_plans, and were
    // only ever decorative here — a fourth copy that nothing read.

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
