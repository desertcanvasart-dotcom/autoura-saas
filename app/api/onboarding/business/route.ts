import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

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

    // Update tenant with business configuration
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({
        business_type: body.business_type,
        default_currency: body.default_currency,
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

    // Update tenant features (B2C/B2B enabled based on business type)
    const b2cEnabled = ['b2c_only', 'b2c_and_b2b'].includes(body.business_type)
    const b2bEnabled = ['b2b_only', 'b2c_and_b2b'].includes(body.business_type)

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
