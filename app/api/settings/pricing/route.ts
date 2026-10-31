import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'

// ============================================
// /api/settings/pricing — the company's pricing defaults (migration 456)
// ============================================
// Cost calculation mode, default service tier and markup on supplier cost,
// used for every new quote and itinerary (each can still override them).
// Everyone who works reads them; only owners and admins change them.

const MAX_MARKUP = 200 // the Quote Builder's own clamp (calculator.ts)

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase, tenant_id } = auth
  const { data, error } = await supabase
    .from('tenants')
    // The quote currency rides along for the Quote Builder's fresh grid.
    .select('default_cost_mode, default_tier, default_margin_percent, default_quote_currency')
    .eq('id', tenant_id)
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'admin')
  if (denied) return denied
  const { supabase, tenant_id } = auth

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ success: false, error: 'Nothing to save' }, { status: 400 })

  const patch: { default_cost_mode?: string; default_tier?: string | null; default_margin_percent?: number | null } = {}
  if ('default_cost_mode' in body) {
    if (body.default_cost_mode !== 'auto' && body.default_cost_mode !== 'manual') {
      return NextResponse.json({ success: false, error: 'Cost calculation is auto or manual' }, { status: 400 })
    }
    patch.default_cost_mode = body.default_cost_mode
  }
  if ('default_tier' in body) {
    const t = body.default_tier
    if (t !== null && (typeof t !== 'string' || t.trim() === '' || t.length > 64)) {
      return NextResponse.json({ success: false, error: 'Choose a service tier' }, { status: 400 })
    }
    patch.default_tier = t === null ? null : t.trim()
  }
  if ('default_margin_percent' in body) {
    const m = body.default_margin_percent
    if (m !== null && (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || m > MAX_MARKUP)) {
      return NextResponse.json({ success: false, error: `The markup must be between 0 and ${MAX_MARKUP}%` }, { status: 400 })
    }
    patch.default_margin_percent = m === null ? null : Math.round(m * 100) / 100
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(patch)
    .eq('id', tenant_id)
    .select('default_cost_mode, default_tier, default_margin_percent')
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
