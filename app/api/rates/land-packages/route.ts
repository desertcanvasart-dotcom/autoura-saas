// /api/rates/land-packages — Rates → Land packages (migration 462).
// GET every package of the caller's company; POST one new package.
// Managers and up only: these are supplier costs (#797).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { LAND_PACKAGE_COLS, validateLandPackage } from '@/lib/rates/land-package-input'
import type { Json } from '@/types/database.types'

export const dynamic = 'force-dynamic'

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status })

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return fail(auth.error, auth.status)
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase } = auth
  if (!supabase) return fail('Authentication failed', 401)
  const { data, error } = await supabase.from('land_packages').select(LAND_PACKAGE_COLS).order('package_name').order('id')
  if (error) {
    console.error('GET land_packages error:', error.message)
    return fail('Could not load the land packages.', 500)
  }
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return fail(auth.error, auth.status)
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { supabase, tenant_id } = auth
  if (!supabase || !tenant_id) return fail('Authentication failed', 401)

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const check = validateLandPackage(body)
  if (!check.ok) return fail(check.error, 400)

  const { data, error } = await supabase
    .from('land_packages')
    .insert({
      ...rateCurrencyWriteField(body),
      ...check.row,
      meals: check.row.meals as unknown as Json,
      service_code: check.row.service_code ?? `PKG-${Date.now().toString(36).toUpperCase()}`,
      tenant_id,
    })
    .select(LAND_PACKAGE_COLS)
    .single()
  if (error) {
    console.error('POST land_packages error:', error.message)
    return fail('Could not save the package.', 500)
  }
  return NextResponse.json({ success: true, data }, { status: 201 })
}
