import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { hotelTierFindings, transportTypeFindings } from '@/lib/rates/rate-checks'
import { RATE_TABLES, isoDatePlus, type RateCategorySummary, type RatesSummary } from '@/lib/rates/rate-categories'

// ============================================
// GET /api/rates/summary — the Rates page's menu counts and Overview
// ============================================
// Per category: active rates, when one was last changed, and how many run out
// in the next 30 days; plus how many the Rates check flags. Read-only; RLS
// keeps every read to the caller's company. Managers and admins, as the
// rate sheets themselves.

// The generated client types each table's builder separately; the summary
// runs the same three reads on fourteen of them, so it talks to a builder
// through this narrow shape instead of a union of fourteen.
interface CountQuery extends PromiseLike<{ count: number | null; error: { message: string } | null }> {
  eq(column: string, value: unknown): CountQuery
  gte(column: string, value: unknown): CountQuery
  lte(column: string, value: unknown): CountQuery
}
interface LatestQuery extends PromiseLike<{ data: Array<{ updated_at: string | null }> | null; error: { message: string } | null }> {
  eq(column: string, value: unknown): LatestQuery
  not(column: string, op: string, value: unknown): LatestQuery
  order(column: string, opts: { ascending: boolean }): LatestQuery
  limit(n: number): LatestQuery
}
interface Table {
  select(columns: string, opts: { count: 'exact'; head: true }): CountQuery
  select(columns: 'updated_at'): LatestQuery
}

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const denied = roleDenied(auth.role, 'manage')
    if (denied) return denied
    const { supabase } = auth
    const from = (table: string) => (supabase as unknown as { from(t: string): Table }).from(table)

    const today = isoDatePlus(new Date(), 0)
    const in30 = isoDatePlus(new Date(), 30)

    const entries = await Promise.all(
      Object.entries(RATE_TABLES).map(async ([slug, { table, dated }]) => {
        const [count, latest, expiring] = await Promise.all([
          from(table).select('id', { count: 'exact', head: true }).eq('is_active', true),
          from(table).select('updated_at').eq('is_active', true).not('updated_at', 'is', null)
            .order('updated_at', { ascending: false }).limit(1),
          dated
            ? from(table).select('id', { count: 'exact', head: true }).eq('is_active', true)
                .gte('rate_valid_to', today).lte('rate_valid_to', in30)
            : Promise.resolve({ count: 0, error: null }),
        ])
        const error = count.error ?? latest.error ?? expiring.error
        if (error) throw new Error(`${table}: ${error.message}`)
        const summary: RateCategorySummary = {
          count: count.count ?? 0,
          updatedAt: latest.data?.[0]?.updated_at ?? null,
          expiring: expiring.count ?? 0,
        }
        return [slug, summary] as const
      }),
    )

    // The same reads and rules as GET /api/rates/check.
    const [hotels, transport] = await Promise.all([
      fetchAllPages((f, t) => supabase
        .from('accommodation_rates')
        .select('id, property_name, hotel_name, city, tier, star_rating')
        .eq('is_active', true)
        .order('id')
        .range(f, t)),
      fetchAllPages((f, t) => supabase
        .from('transportation_rates')
        .select('id, route_name, service_type, vehicle_type, city, origin_city, destination_city')
        .eq('is_active', true)
        .order('id')
        .range(f, t)),
    ])
    const checkError = hotels.error ?? transport.error
    if (checkError) throw new Error(checkError.message)

    const data: RatesSummary = {
      categories: Object.fromEntries(entries),
      flagged: hotelTierFindings(hotels.data).length + transportTypeFindings(transport.data).length,
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('GET /api/rates/summary error:', error)
    return NextResponse.json({ success: false, error: 'Could not count the rates' }, { status: 500 })
  }
}
