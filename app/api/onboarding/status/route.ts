import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult

    // Get tenant features to check onboarding status
    const { data: features, error: featuresError } = await supabase
      .from('tenant_features')
      .select('onboarding_completed, onboarding_step')
      .eq('tenant_id', tenant_id)
      .single()

    if (featuresError) {
      console.error('Error fetching onboarding status:', featuresError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch onboarding status' },
        { status: 500 }
      )
    }

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('company_name, business_type, default_currency, services_offered, company_website, company_phone, tagline')
      .eq('id', tenant_id)
      .single()

    if (tenantError) {
      console.error('Error fetching tenant:', tenantError)
    }

    return NextResponse.json({
      success: true,
      data: {
        onboarding_completed: features?.onboarding_completed || false,
        onboarding_step: features?.onboarding_step || 0,
        tenant: tenant || {}
      }
    })
  } catch (error) {
    console.error('Error in onboarding status GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
