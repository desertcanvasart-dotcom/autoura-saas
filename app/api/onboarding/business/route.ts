import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
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

    // Update tenant with business configuration. (`workspace_mode` is no
    // longer accepted: every tenant sees the whole product — migration 342.)
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({
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


    const { error: featuresError } = await supabase
      .from('tenant_features')
      .update({
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
