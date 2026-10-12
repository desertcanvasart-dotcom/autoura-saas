import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'

// ============================================
// /api/capacity/default — the company's default groups per day
// ============================================
// GET  — { default_max_groups: number | null } (null = no limit)
// PUT  — { default_max_groups: number | null } (admins), 0–1000 or null
//
// The limit for a day with no entry of its own on the Capacity Calendar;
// bookings are checked against it (lib/capacity/booking-capacity.ts). The
// field on the calendar page was never saved before (migration 417).

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { data, error } = await createAdminClient()
    .from('tenants')
    .select('default_max_groups_per_day')
    .eq('id', auth.tenant_id!)
    .maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: { default_max_groups: data?.default_max_groups_per_day ?? null } })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'admin')
  if (denied) return denied

  const body = await request.json().catch(() => ({})) as { default_max_groups?: unknown }
  const raw = body.default_max_groups
  let value: number | null
  if (raw === null || raw === '' || raw === undefined) value = null
  else {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      return NextResponse.json({ success: false, error: 'The default must be a whole number from 0 to 1000, or blank for no limit' }, { status: 400 })
    }
    value = n
  }

  const { error } = await createAdminClient()
    .from('tenants')
    .update({ default_max_groups_per_day: value })
    .eq('id', auth.tenant_id!)
  if (error) {
    const missing = (error.code === '42703' || error.code === 'PGRST204') && String(error.message).includes('default_max_groups_per_day')
    return NextResponse.json(
      { success: false, error: missing ? 'Saving the default needs a database update (migration 417).' : error.message },
      { status: missing ? 503 : 500 },
    )
  }
  return NextResponse.json({ success: true, data: { default_max_groups: value } })
}
