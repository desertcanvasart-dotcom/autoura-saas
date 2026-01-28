import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const cuisineType = searchParams.get('cuisine_type')
    const tier = searchParams.get('tier')
    const activeOnly = searchParams.get('active_only') === 'true'

    // Query restaurant_contacts (correct table) - RLS filters by tenant
    let query = supabase
      .from('restaurant_contacts')
      .select('*')
      .order('name')

    if (city) query = query.eq('city', city)
    if (cuisineType) query = query.eq('cuisine_type', cuisineType)
    if (tier) query = query.eq('tier', tier)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching restaurants:', error)
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching restaurants:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Don't allow tenant_id to be set manually (auto-populate trigger handles it)
    delete body.tenant_id

    // Insert into restaurant_contacts (correct table) - RLS + trigger handles tenant_id
    const { data, error } = await supabase
      .from('restaurant_contacts')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('Error creating restaurant:', error)
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating restaurant:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}