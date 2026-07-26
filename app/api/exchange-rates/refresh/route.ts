import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { refreshExchangeRates } from '@/lib/exchange-rate-refresh'

function getSupabaseAdmin() {
  return createAdminClient()
}

/**
 * Authorize either a logged-in user session OR a cron caller presenting
 * the x-cron-secret header. Fails closed if CRON_SECRET is unset.
 * Returns null when authorized, or an error response otherwise.
 */
async function authorizeSessionOrCron(request: NextRequest): Promise<NextResponse | null> {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')
  if (cronSecret && headerSecret === cronSecret) {
    return null
  }

  const authResult = await requireAuth()
  if (authResult.error) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }
  return null
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
    const authError = await authorizeSessionOrCron(request)
    if (authError) {
      return authError
    }

    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    // Shared job body — see lib/exchange-rate-refresh.ts. The scheduled
    // counterpart is POST /api/cron/refresh-exchange-rates, which runs the
    // same function behind CRON_SECRET (this route sits behind the session
    // gate in middleware.ts and is not reachable by a cron caller).
    const result = await refreshExchangeRates(getSupabaseAdmin(), {
      force,
      apiKey: process.env.EXCHANGE_RATE_API_KEY,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || result.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      fetchedAt: result.fetchedAt,
      snapshotsWritten: result.snapshotsWritten,
      ...(result.snapshotError ? { snapshotError: result.snapshotError } : {}),
      rates: result.rates,
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
export async function GET(request: NextRequest) {
  try {
    const authError = await authorizeSessionOrCron(request)
    if (authError) {
      return authError
    }

    const { data: rates, error } = await (getSupabaseAdmin() as any)
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
