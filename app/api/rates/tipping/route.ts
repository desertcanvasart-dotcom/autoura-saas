// app/api/rates/tipping/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { validateRatePayload } from '@/lib/rate-validation'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'

export async function GET() {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    let supabase
    try {
      supabase = await createAuthenticatedClient()
    } catch (authError) {
      console.error('Auth error creating client:', authError)
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Every page: PostgREST stops a plain select at 1000 rows without an
    // error, so rows past that could not be found to edit or deactivate.
    // `id` last keeps the paging stable between pages.
    const { data, error } = await fetchAllPages((from, to) =>
      supabase
        .from('tipping_rates')
        .select('*')
        .order('role_type')
        .order('context')
        .order('id')
        .range(from, to),
    )

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    // Rates and suppliers are the managers' area (the sidebar's Suppliers &
    // Rates group); RLS checks only the tenant, so the role is checked here.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid rate values', violations: rateCheck.errors },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('tipping_rates')
      .insert([{ ...body, tenant_id }])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
