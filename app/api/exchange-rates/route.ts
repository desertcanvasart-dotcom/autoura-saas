import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// Tenant and role come from requireAuth(): its own .single() lookups on
// tenant_members errored for anyone in two companies, and the GET one had no
// status filter at all.

// GET - Fetch exchange rates (system-level + tenant overrides)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase } = auth
    const memberData = { tenant_id: auth.tenant_id }

    // Fetch system-level rates (tenant_id IS NULL)
    const { data: systemRates, error: systemError } = await supabase
      .from('exchange_rates')
      .select('*')
      .is('tenant_id', null)
      .eq('is_active', true)

    if (systemError) {
      console.error('Error fetching system rates:', systemError)
    }

    // Fetch tenant-specific overrides
    const { data: tenantRates, error: tenantError } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('tenant_id', memberData.tenant_id)
      .eq('is_active', true)

    if (tenantError) {
      console.error('Error fetching tenant rates:', tenantError)
    }

    // Merge rates: tenant overrides take priority over system rates
    const ratesMap = new Map<string, any>()

    // Add system rates first
    for (const rate of (systemRates || [])) {
      const key = `${rate.base_currency}_${rate.target_currency}`
      ratesMap.set(key, {
        ...rate,
        is_system_rate: true,
        is_override: false
      })
    }

    // Override with tenant-specific rates
    for (const rate of (tenantRates || [])) {
      const key = `${rate.base_currency}_${rate.target_currency}`
      ratesMap.set(key, {
        ...rate,
        is_system_rate: false,
        is_override: true
      })
    }

    // Convert map to sorted array
    const mergedRates = Array.from(ratesMap.values())
      .sort((a, b) => {
        if (a.base_currency !== b.base_currency) {
          return a.base_currency.localeCompare(b.base_currency)
        }
        return a.target_currency.localeCompare(b.target_currency)
      })

    // Get last API fetch time
    const lastApiFetch = systemRates?.find(r => r.api_fetched_at)?.api_fetched_at

    return NextResponse.json({
      success: true,
      data: mergedRates,
      lastApiFetch,
      systemRatesCount: systemRates?.length || 0,
      tenantOverridesCount: tenantRates?.length || 0
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update or create exchange rates
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase } = auth
    const body = await request.json()
    const memberData = { tenant_id: auth.tenant_id, role: auth.role }

    if (!['owner', 'admin'].includes(memberData.role)) {
      return NextResponse.json(
        { success: false, error: 'Only admins can update exchange rates' },
        { status: 403 }
      )
    }

    const { rates } = body

    if (!rates || !Array.isArray(rates)) {
      return NextResponse.json(
        { success: false, error: 'Invalid rates data' },
        { status: 400 }
      )
    }

    // Upsert all rates as tenant overrides
    const upsertPromises = rates.map(async (rate: any) => {
      const rateData = {
        tenant_id: memberData.tenant_id,
        base_currency: rate.base_currency || 'EUR',
        target_currency: rate.target_currency,
        rate: parseFloat(rate.rate),
        source: 'manual', // Tenant overrides are always manual
        is_active: true,
        last_updated_at: new Date().toISOString()
      }

      // Check if tenant override exists
      const { data: existing } = await supabase
        .from('exchange_rates')
        .select('id')
        .eq('tenant_id', memberData.tenant_id)
        .eq('base_currency', rateData.base_currency)
        .eq('target_currency', rateData.target_currency)
        .single()

      if (existing) {
        return supabase
          .from('exchange_rates')
          .update(rateData)
          .eq('id', existing.id)
      } else {
        return supabase
          .from('exchange_rates')
          .insert(rateData)
      }
    })

    await Promise.all(upsertPromises)

    // Fetch updated rates
    const { data: updatedRates, error: fetchError } = await supabase
      .from('exchange_rates')
      .select('*')
      .eq('tenant_id', memberData.tenant_id)
      .eq('is_active', true)
      .order('base_currency', { ascending: true })
      .order('target_currency', { ascending: true })

    if (fetchError) {
      throw fetchError
    }

    return NextResponse.json({
      success: true,
      data: updatedRates
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
