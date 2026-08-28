// ============================================
// Gathering the state of an install
// ============================================
// Shared by GET /api/support-bundle (the artifact a customer sends us) and
// GET /api/health/deep (the probe their monitoring watches). One collector, so
// the two cannot disagree about whether this install is healthy — which they
// would within about two changes if each did its own gathering.
//
// Everything here is COUNTS AND STATES. No row ever leaves these functions:
// `head: true` returns no data at all, so there is nothing to leak even by
// accident. See lib/support/bundle.ts for the rules this obeys.

import { createClient } from '@supabase/supabase-js'
import { latestJobRuns } from '@/lib/support/job-runs'
import type { SupportBundle } from '@/lib/support/bundle'

/** Tables worth counting: enough to tell a fresh install from a live one, and
 *  to spot the case where a migration wiped something. */
const COUNTED_TABLES = ['tenants', 'itineraries', 'bookings', 'invoices', 'clients'] as const

export interface CollectedState {
  database: SupportBundle['database']
  integrations: SupportBundle['integrations']
  counts: Record<string, number>
  crons: SupportBundle['crons']
}

/**
 * Configured-but-unprobed is its own answer.
 *
 * A support check must not spend money or take seconds calling a vendor's API,
 * so having the keys is reported as `configured` and nothing more. Only the
 * database, which we must talk to anyway, gets probed.
 */
export function integrationState(
  env: NodeJS.ProcessEnv,
  ...keys: string[]
): 'configured' | 'unconfigured' {
  return keys.every(k => (env[k] ?? '').trim() !== '') ? 'configured' : 'unconfigured'
}

export function integrationStates(env: NodeJS.ProcessEnv): SupportBundle['integrations'] {
  return {
    supabase: 'unconfigured', // replaced by the real probe below
    anthropic: integrationState(env, 'ANTHROPIC_API_KEY'),
    stripe: integrationState(env, 'STRIPE_SECRET_KEY'),
    resend: integrationState(env, 'RESEND_API_KEY'),
    google: integrationState(env, 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
    whatsapp:
      integrationState(env, 'TWILIO_ACCOUNT_SID') === 'configured'
        ? 'configured'
        : integrationState(env, 'META_WHATSAPP_ACCESS_TOKEN'),
  }
}

export async function collectState(env: NodeJS.ProcessEnv = process.env): Promise<CollectedState> {
  const database: SupportBundle['database'] = {
    reachable: false,
    latencyMs: null,
    migrationsApplied: null,
    // Needs the migration FILES, which are not in a built image. Null means
    // "not measured here"; scripts/doctor.mjs measures it. bundleFindings
    // skips it rather than guessing.
    migrationsPending: null,
  }
  const integrations = integrationStates(env)
  const counts: Record<string, number> = {}
  let crons: SupportBundle['crons'] = []

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    database.error = 'Supabase is not configured'
    return { database, integrations, counts, crons }
  }

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const started = Date.now()
  try {
    const { count, error } = await admin
      .from('schema_migrations')
      .select('name', { head: true, count: 'exact' })
    database.latencyMs = Date.now() - started
    if (error) {
      database.error = error.message
      integrations.supabase = 'failed'
      return { database, integrations, counts, crons }
    }
    database.reachable = true
    database.migrationsApplied = count ?? null
    integrations.supabase = 'ok'
  } catch (err) {
    database.latencyMs = Date.now() - started
    database.error = err instanceof Error ? err.message : 'unreachable'
    integrations.supabase = 'failed'
    return { database, integrations, counts, crons }
  }

  for (const table of COUNTED_TABLES) {
    const { count, error } = await admin.from(table).select('id', { head: true, count: 'exact' })
    if (!error && typeof count === 'number') counts[table] = count
  }

  // "Have the scheduled jobs ever run on this box?" — the question a
  // self-hosted install cannot otherwise answer, since the scheduler is theirs.
  crons = await latestJobRuns(admin)

  return { database, integrations, counts, crons }
}
