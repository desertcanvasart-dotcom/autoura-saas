import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { gateStructural } from '@/lib/usage-enforcement'
import { roleDenied } from '@/lib/api-role-gate'
import { parsePartnerWrite, nextPartnerCode } from '@/lib/b2b/partner-fields'
import { orIlikeContains } from '@/lib/postgrest-search'

// ============================================
// B2B PARTNERS API
// File: app/api/b2b/partners/route.ts
// ============================================

export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const active_only = searchParams.get('active_only') !== 'false'

    let query = supabase
      .from('b2b_partners')
      .select('*')
      .order('company_name')

    if (active_only) {
      query = query.eq('is_active', true)
    }

    if (search) {
      const pattern = orIlikeContains(search)
      query = query.or(`company_name.ilike.${pattern},partner_code.ilike.${pattern},contact_name.ilike.${pattern}`)
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
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    // Plan limit: B2B partners. Structural — a live count of what exists, and
    // a hard block at 100%: adding a partner is a planned decision, not
    // something done mid-quote, so blocking cannot strand anyone.
    const gate = await gateStructural(supabase, tenant_id!, 'b2b_partners', 'B2B partners')
    if (!gate.ok) return gate.response!

    const parsed = parsePartnerWrite(await request.json(), 'create')
    if ('error' in parsed) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const partner = parsed.data

    // The code, if not given: the next free one for this agency. The currency,
    // if not given: the agency's rates currency (it was always EUR).
    if (!partner.partner_code || !partner.currency) {
      const [{ data: codes }, { data: tenantRow }] = await Promise.all([
        supabase.from('b2b_partners').select('partner_code').eq('tenant_id', tenant_id),
        supabase.from('tenants').select('rates_currency').eq('id', tenant_id).maybeSingle(),
      ])
      if (!partner.partner_code) partner.partner_code = nextPartnerCode(partner.company_name ?? '', (codes ?? []).map(c => c.partner_code))
      if (!partner.currency) partner.currency = (tenantRow as { rates_currency?: string | null } | null)?.rates_currency || 'EUR'
    }

    const { data, error } = await supabase
      .from('b2b_partners')
      .insert({ ...partner, tenant_id } as never)
      .select()
      .single()

    if (error) {
      console.error('Error creating partner:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/b2b/partners:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}