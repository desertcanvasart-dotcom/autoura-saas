// /api/rates/land-packages/[id] — change or delete one land package.
// Managers and up only. RLS keeps it to the caller's company.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { LAND_PACKAGE_COLS, validateLandPackage } from '@/lib/rates/land-package-input'
import type { Json } from '@/types/database.types'

export const dynamic = 'force-dynamic'

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status })

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return fail(auth.error, auth.status)
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase } = auth
  if (!supabase) return fail('Authentication failed', 401)
  const { id } = await params
  const { data } = await supabase.from('land_packages').select(LAND_PACKAGE_COLS).eq('id', id).maybeSingle()
  if (!data) return fail('Package not found', 404)
  return NextResponse.json({ success: true, data })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return fail(auth.error, auth.status)
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase } = auth
  if (!supabase) return fail('Authentication failed', 401)
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const check = validateLandPackage(body)
  if (!check.ok) return fail(check.error, 400)

  // A blank code keeps the stored one.
  const { service_code, ...fields } = check.row
  const { data, error } = await supabase
    .from('land_packages')
    .update({ ...rateCurrencyWriteField(body), ...fields, meals: fields.meals as unknown as Json, ...(service_code ? { service_code } : {}) })
    .eq('id', id)
    .select(LAND_PACKAGE_COLS)
    .maybeSingle()
  if (error) {
    console.error('PUT land_packages error:', error.message)
    return fail('Could not save the package.', 500)
  }
  if (!data) return fail('Package not found', 404)
  return NextResponse.json({ success: true, data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return fail(auth.error, auth.status)
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase } = auth
  if (!supabase) return fail('Authentication failed', 401)
  const { id } = await params
  // A trip or a day block pointing at it keeps working: the block's link is
  // cleared (ON DELETE SET NULL) and a trip naming it shows a gap, never a
  // silent price.
  const { error, count } = await supabase.from('land_packages').delete({ count: 'exact' }).eq('id', id)
  if (error) {
    console.error('DELETE land_packages error:', error.message)
    return fail('Could not delete the package.', 500)
  }
  if (!count) return fail('Package not found', 404)
  return NextResponse.json({ success: true })
}
