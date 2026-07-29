// ============================================
// API: SUPER ADMIN — CONCIERGE BRAND MAPPINGS
// ============================================
// Manages concierge_brand_mappings (brand_key -> tenant), the routing
// table the concierge webhook uses to deliver briefs per brand.
//
//   GET    /api/super-admin/concierge-brands            list mappings
//   POST   /api/super-admin/concierge-brands            upsert { brand_key, tenant_id, active? }
//   DELETE /api/super-admin/concierge-brands?brand_key= remove a mapping
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { normalizeBrandKey, BRAND_KEY_MAX_LENGTH } from '@/lib/concierge-brief-schema'

export async function GET() {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

    const { data, error } = await auth.adminClient!
      .from('concierge_brand_mappings')
      // NB: the tenants column is company_name (tenants(name) does not exist —
      // this join 500'd untouched until the UI page first exercised it).
      .select('id, brand_key, tenant_id, active, created_at, updated_at, tenants(company_name)')
      .order('brand_key', { ascending: true })
    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const body = await request.json()
    const brandKey = normalizeBrandKey(body.brand_key)
    if (!brandKey || brandKey.length > BRAND_KEY_MAX_LENGTH) {
      return NextResponse.json(
        { success: false, error: `brand_key must be a non-empty string of at most ${BRAND_KEY_MAX_LENGTH} characters.` },
        { status: 400 }
      )
    }
    if (typeof body.tenant_id !== 'string' || !body.tenant_id) {
      return NextResponse.json({ success: false, error: 'tenant_id is required.' }, { status: 400 })
    }

    // Reject unknown tenants explicitly (clearer than an FK error).
    const { data: tenant } = await admin.from('tenants').select('id').eq('id', body.tenant_id).maybeSingle()
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'tenant_id does not match an existing tenant.' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('concierge_brand_mappings')
      .upsert(
        { brand_key: brandKey, tenant_id: body.tenant_id, active: body.active !== false },
        { onConflict: 'brand_key' }
      )
      .select('id, brand_key, tenant_id, active')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

    const brandKey = normalizeBrandKey(new URL(request.url).searchParams.get('brand_key'))
    if (!brandKey) {
      return NextResponse.json({ success: false, error: 'brand_key query parameter is required.' }, { status: 400 })
    }

    const { data, error } = await auth.adminClient!
      .from('concierge_brand_mappings')
      .delete()
      .eq('brand_key', brandKey)
      .select('id')
    if (error) throw error
    if (!data?.length) {
      return NextResponse.json({ success: false, error: `No mapping found for brand "${brandKey}".` }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
