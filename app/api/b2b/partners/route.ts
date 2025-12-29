import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B PARTNERS API
// File: app/api/b2b/partners/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const active_only = searchParams.get('active_only') !== 'false'

    let query = supabaseAdmin
      .from('b2b_partners')
      .select('*')
      .order('company_name')

    if (active_only) {
      query = query.eq('is_active', true)
    }

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,partner_code.ilike.%${search}%,contact_name.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching partners:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('Error in GET /api/b2b/partners:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.partner_code) {
      const prefix = (body.company_name || 'PARTNER').substring(0, 3).toUpperCase()
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
      body.partner_code = `${prefix}-${random}`
    }

    const { data, error } = await supabaseAdmin
      .from('b2b_partners')
      .insert(body)
      .select()
      .single()

    if (error) {
      console.error('Error creating partner:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/b2b/partners:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}