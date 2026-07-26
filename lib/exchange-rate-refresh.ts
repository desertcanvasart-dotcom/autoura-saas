// ============================================
// EXCHANGE RATE REFRESH — shared job body
// ============================================
// Fetches current market rates and writes them to BOTH rate tables:
//
//   exchange_rates            upserted — one live row per pair, "what is the
//                             rate now". Backs the admin UI and live display.
//   exchange_rate_snapshots   appended — immutable history, "what was the rate
//                             on the day this hotel was paid". Backs the
//                             per-trip P&L, analytics and financial reports.
//
// Extracted from the route handler so two callers can share one implementation:
//   - POST /api/exchange-rates/refresh        (admin UI, session-authenticated)
//   - POST /api/cron/refresh-exchange-rates   (scheduled, CRON_SECRET)
//
// The second exists because middleware.ts gates every /api/* route behind a
// session except a small self-authenticating allowlist, and `/api/cron/` is
// the registered prefix for secret-authenticated jobs. A cron caller hitting
// the admin route is rejected by the gate before the handler runs.

import { fetchAllExchangeRates } from './exchange-rate-api'
import { buildSnapshotRows } from './currency-service'

/** Don't re-hit the upstream API if the live rates are younger than this. */
const FRESHNESS_HOURS = 1

export interface RefreshResult {
  success: boolean
  skipped: boolean
  message: string
  fetchedAt?: string
  /** Pairs written to the live table. */
  ratesRefreshed: number
  /** Rows appended to the immutable history. 0 means the P&L gained nothing. */
  snapshotsWritten: number
  /** Set when the history write failed — the refresh still counts as success. */
  snapshotError?: string
  rates?: unknown[]
  error?: string
}

/** Minimal shape of the service-role client this job needs. */
type AdminClient = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Run one refresh cycle.
 *
 * Never throws for an upstream/database problem — returns a result object so
 * both callers can shape their own HTTP response and a cron run can log a
 * precise reason.
 */
export async function refreshExchangeRates(
  supabaseAdmin: AdminClient,
  options: { force?: boolean; apiKey?: string } = {}
): Promise<RefreshResult> {
  const { force = false, apiKey } = options

  try {
    // ---------- Freshness guard ----------
    if (!force) {
      const { data: existingRates } = await supabaseAdmin
        .from('exchange_rates')
        .select('api_fetched_at')
        .is('tenant_id', null)
        .order('api_fetched_at', { ascending: false })
        .limit(1)
        .single()

      if (existingRates?.api_fetched_at) {
        const lastFetch = new Date(existingRates.api_fetched_at)
        const hoursSince = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60)

        if (hoursSince < FRESHNESS_HOURS) {
          return {
            success: true,
            skipped: true,
            message: 'Rates are fresh, no refresh needed',
            fetchedAt: lastFetch.toISOString(),
            ratesRefreshed: 0,
            snapshotsWritten: 0,
          }
        }
      }
    }

    // ---------- Fetch ----------
    const fetchedRates = await fetchAllExchangeRates(apiKey)

    if (fetchedRates.length === 0) {
      return {
        success: false,
        skipped: false,
        message: 'No rates fetched from API',
        ratesRefreshed: 0,
        snapshotsWritten: 0,
        error: 'No rates fetched from API',
      }
    }

    const now = new Date().toISOString()

    // ---------- Live table (upsert) ----------
    await Promise.all(
      fetchedRates.map(async rate => {
        const { data: existing } = await supabaseAdmin
          .from('exchange_rates')
          .select('id')
          .is('tenant_id', null)
          .eq('base_currency', rate.base_currency)
          .eq('target_currency', rate.target_currency)
          .single()

        if (existing) {
          return supabaseAdmin
            .from('exchange_rates')
            .update({
              rate: rate.rate,
              source: 'api',
              api_fetched_at: now,
              last_updated_at: now,
            })
            .eq('id', existing.id)
        }

        return supabaseAdmin.from('exchange_rates').insert({
          tenant_id: null,
          base_currency: rate.base_currency,
          target_currency: rate.target_currency,
          rate: rate.rate,
          source: 'api',
          api_fetched_at: now,
          is_active: true,
        })
      })
    )

    // ---------- History (append) ----------
    // Best-effort: a failure here must not fail the refresh, because the live
    // rates are already updated and useful. But it IS reported, because a
    // silent failure here degrades every future margin calculation.
    const snapshotRows = buildSnapshotRows(fetchedRates, now, 'er-api')
    let snapshotsWritten = 0
    let snapshotError: string | undefined

    if (snapshotRows.length > 0) {
      const { error } = await supabaseAdmin
        .from('exchange_rate_snapshots')
        // Same pair at the same instant is the same observation — a double run
        // must not create duplicate history.
        .upsert(snapshotRows, {
          onConflict: 'base_currency,target_currency,captured_at',
          ignoreDuplicates: true,
        })

      if (error) {
        snapshotError = error.message || String(error)
        console.error('⚠️ Failed to persist exchange rate snapshots:', error)
      } else {
        snapshotsWritten = snapshotRows.length
      }
    }

    // ---------- Read back ----------
    const { data: updatedRates, error: readError } = await supabaseAdmin
      .from('exchange_rates')
      .select('*')
      .is('tenant_id', null)
      .eq('is_active', true)
      .order('base_currency')
      .order('target_currency')

    if (readError) {
      // The write succeeded; only the read-back failed.
      console.error('Error reading back exchange rates:', readError)
    }

    return {
      success: true,
      skipped: false,
      message: `Successfully refreshed ${fetchedRates.length} exchange rates`,
      fetchedAt: now,
      ratesRefreshed: fetchedRates.length,
      snapshotsWritten,
      snapshotError,
      rates: updatedRates || undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error refreshing exchange rates:', error)
    return {
      success: false,
      skipped: false,
      message: 'Failed to refresh rates',
      ratesRefreshed: 0,
      snapshotsWritten: 0,
      error: message,
    }
  }
}
