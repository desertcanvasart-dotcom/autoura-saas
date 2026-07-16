// ============================================
// API: CAPACITY FEED (Autoura -> Sawa)
// ============================================
// GET /api/integrations/capacity?brand=sawa-tours&days=120
//
// The westbound half of the departure-mirror integration: Sawa fetches
// the mapped tenant's operator blackout/limited dates and uses them to
// fence which dates travelers can start (operating days say "Mondays";
// this feed says "but not THAT Monday").
//
// Auth: exact-match shared secret in the `x-sync-secret` header
// (SAWA_SYNC_SECRET — same pair as the departures webhook), compared in
// constant time. Server-to-server over TLS; same pattern as CRON_SECRET.
// Fails closed when the secret is unset.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { normalizeBrandKey } from '@/lib/concierge-brief-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function secretMatches(provided: string | null): boolean {
  const candidates = [process.env.SAWA_SYNC_SECRET, process.env.SAWA_SYNC_SECRET_PREVIOUS].filter(Boolean) as string[]
  if (!provided || candidates.length === 0) return false
  const given = Buffer.from(provided)
  return candidates.some((s) => {
    const want = Buffer.from(s)
    return given.length === want.length && timingSafeEqual(given, want)
  })
}

export async function GET(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-sync-secret'))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const brandKey = normalizeBrandKey(url.searchParams.get('brand'))
  if (!brandKey) {
    return NextResponse.json({ success: false, error: 'brand query parameter is required.' }, { status: 400 })
  }
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get('days')) || 120))

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: mapping } = await supabase
    .from('concierge_brand_mappings')
    .select('tenant_id, active')
    .eq('brand_key', brandKey)
    .maybeSingle()
  if (!mapping || !mapping.active) {
    return NextResponse.json(
      { success: false, error: `No active tenant mapping for brand "${brandKey}".`, code: 'unknown_brand' },
      { status: 422 }
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('operator_capacity')
    .select('date, status')
    .eq('tenant_id', mapping.tenant_id)
    .gte('date', today)
    .lte('date', until)
    .in('status', ['blackout', 'limited', 'busy'])
  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to read capacity.' }, { status: 500 })
  }

  const iso = (d: unknown) => String(d).slice(0, 10)
  return NextResponse.json({
    success: true,
    brand: brandKey,
    horizon_days: days,
    // blackout = date must not be offered; busy/limited = advisory
    blackouts: (data || []).filter((r) => r.status === 'blackout').map((r) => iso(r.date)),
    busy: (data || []).filter((r) => r.status !== 'blackout').map((r) => iso(r.date)),
  })
}
