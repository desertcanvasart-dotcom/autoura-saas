import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchAllExchangeRates } from '@/lib/exchange-rate-api'

// Lazy-initialized Supabase admin client (avoids build-time errors when env vars unavailable)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

/**
 * POST /api/exchange-rates/refresh
 *
 * Fetches latest exchange rates from ExchangeRate-API and updates system-level rates.
 * Can be called:
 * - Manually from admin UI
 * - By a cron job (e.g., daily)
 * - On-demand when rates are stale
 *
 * Query params:
 * - force=true: Force refresh even if rates are fresh
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    // Check if we need to refresh (unless forced)
    if (!force) {
      const { data: existingRates } = await getSupabaseAdmin()
        .from('exchange_rates')
        .select('api_fetched_at')
        .is('tenant_id', null)
        .order('api_fetched_at', { ascending: false })
        .limit(1)
        .single()

      if (existingRates?.api_fetched_at) {
        const lastFetch = new Date(existingRates.api_fetched_at)
        const hoursSinceLastFetch = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60)

        // Don't refresh if less than 1 hour old (to stay within free tier limits)
        if (hoursSinceLastFetch < 1) {
          return NextResponse.json({
            success: true,
            message: 'Rates are fresh, no refresh needed',
            lastFetched: lastFetch.toISOString(),
            hoursSinceLastFetch: hoursSinceLastFetch.toFixed(2)
          })
        }
      }
    }

    // Fetch rates from API
    console.log('Fetching exchange rates from API...')
    const apiKey = process.env.EXCHANGE_RATE_API_KEY // Optional
    const fetchedRates = await fetchAllExchangeRates(apiKey)

    if (fetchedRates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No rates fetched from API' },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()

    // Upsert system-level rates
    const upsertPromises = fetchedRates.map(async (rate) => {
      // First try to update existing
      const { data: existing } = await getSupabaseAdmin()
        .from('exchange_rates')
        .select('id')
        .is('tenant_id', null)
        .eq('base_currency', rate.base_currency)
        .eq('target_currency', rate.target_currency)
        .single()

      if (existing) {
        // Update existing
        return (getSupabaseAdmin() as any)
          .from('exchange_rates')
          .update({
            rate: rate.rate,
            source: 'api',
            api_fetched_at: now,
            last_updated_at: now
          })
          .eq('id', existing.id)
      } else {
        // Insert new
        return (getSupabaseAdmin() as any)
          .from('exchange_rates')
          .insert({
            tenant_id: null,
            base_currency: rate.base_currency,
            target_currency: rate.target_currency,
            rate: rate.rate,
            source: 'api',
            api_fetched_at: now,
            is_active: true
          })
      }
    })

    await Promise.all(upsertPromises)

    // Fetch updated rates to return
    const { data: updatedRates, error } = await getSupabaseAdmin()
      .from('exchange_rates')
      .select('*')
      .is('tenant_id', null)
      .eq('is_active', true)
      .order('base_currency')
      .order('target_currency')

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: `Successfully refreshed ${fetchedRates.length} exchange rates`,
      fetchedAt: now,
      rates: updatedRates
    })
  } catch (error: any) {
    console.error('Error refreshing exchange rates:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to refresh rates' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/exchange-rates/refresh
 *
 * Check the status of exchange rates (when last fetched, etc.)
 */
export async function GET() {
  try {
    const { data: rates, error } = await getSupabaseAdmin()
      .from('exchange_rates')
      .select('*')
      .is('tenant_id', null)
      .eq('is_active', true)
      .order('base_currency')
      .order('target_currency')

    if (error) {
      throw error
    }

    const lastFetched = rates?.[0]?.api_fetched_at
    const hoursSinceLastFetch = lastFetched
      ? (Date.now() - new Date(lastFetched).getTime()) / (1000 * 60 * 60)
      : null

    return NextResponse.json({
      success: true,
      lastFetched,
      hoursSinceLastFetch: hoursSinceLastFetch?.toFixed(2),
      needsRefresh: !lastFetched || hoursSinceLastFetch! >= 24,
      ratesCount: rates?.length || 0,
      rates
    })
  } catch (error: any) {
    console.error('Error checking exchange rates:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
