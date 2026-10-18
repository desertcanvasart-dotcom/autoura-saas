import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { refreshExchangeRates } from '@/lib/exchange-rate-refresh'
import { secretMatches } from '@/lib/support/probe-auth'
import { isSuperAdmin } from '@/lib/super-admin-shared'
import { roleDenied } from '@/lib/api-role-gate'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'
import { rateLimitResponse } from '@/lib/rate-limit'

function getSupabaseAdmin() {
  return createAdminClient()
}

/**
 * Who may refresh the SHARED system rates: the cron (x-cron-secret, compared
 * in constant time), a platform admin, or a company owner/admin. Only the
 * first two may force a refresh: a forced refresh spends the paid
 * ExchangeRate-API quota every call, and one script looping on it would
 * leave every company on stale rates. Everyone else gets the normal
 * "only when stale" refresh, which is a no-op while the rates are fresh.
 */
async function authorize(request: NextRequest): Promise<{ denied: NextResponse | null; mayForce: boolean }> {
  if (secretMatches(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return { denied: null, mayForce: true }
  }
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return { denied: NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status }), mayForce: false }
  }
  if (isSuperAdmin(authResult.user.email ?? '')) return { denied: null, mayForce: true }
  const denied = roleDenied(authResult.role, 'admin')
  if (denied) return { denied, mayForce: false }
  const limited = await checkSharedRateLimit(authResult.tenant_id, 'heavy')
  if (!limited.success) return { denied: rateLimitResponse(limited), mayForce: false }
  return { denied: null, mayForce: false }
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
    const { denied, mayForce } = await authorize(request)
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const force = mayForce && searchParams.get('force') === 'true'

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
    // Reading the shared rates' status: the cron or anyone signed in.
    if (!secretMatches(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
      const authResult = await requireAuth()
      if (authResult.error !== null) {
        return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
      }
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
