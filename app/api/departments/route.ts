import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET /api/departments
// List active departments (tenant-aware via RLS)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('departments')
      .select('id, name, description, service_types, is_active')
      .eq('is_active', true)
      .order('name')

    if (error) {
      // Table may not exist yet — return empty
      console.error('Error fetching departments:', error)
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in departments GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
