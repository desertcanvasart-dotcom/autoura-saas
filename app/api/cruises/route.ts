// app/api/cruises/route.ts

import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)

    const isActive = searchParams.get('is_active')
    const cruiseType = searchParams.get('cruise_type')
    const route = searchParams.get('route')

    let query = supabase
      .from('nile_cruises')
      .select('*')
      // Tenant rows plus legacy/global rows created before tenant scoping
      .or(`tenant_id.eq.${authResult.tenant_id},tenant_id.is.null`)
      .order('ship_name', { ascending: true })

    if (isActive === 'true') {
      query = query.eq('is_active', true)
    } else if (isActive === 'false') {
      query = query.eq('is_active', false)
    }

    if (cruiseType) {
      query = query.eq('ship_category', cruiseType)
    }

    if (route) {
      query = query.eq('route_name', route)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching cruises:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cruises' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const supabase = createAdminClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('nile_cruises')
      .insert({ ...body, tenant_id: authResult.tenant_id })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error creating cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create cruise' },
      { status: 500 }
    )
  }
}
