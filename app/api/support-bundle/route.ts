// ============================================
// GET /api/support-bundle — what a self-hosted install can safely send us
// ============================================
// S1 of docs/plans/self-hosted-support.md. On an install we do not run, this is
// the thing that crosses the gap: the customer's OWN super-admin generates it,
// reads it, and emails it.
//
// Gated on super-admin — theirs, not ours. We have no account on their server
// and never will; this is something they operate, not something we reach into.
//
// Every field goes through lib/support/bundle.ts, which is where the redaction
// lives and where it is tested. Nothing is assembled here by hand.
//
// WHAT THIS CANNOT SEE, and scripts/doctor.mjs can:
//   * which migrations are PENDING — that needs the migration files, which are
//     not in the built image. The applied count is here; the diff is there.
//   * anything at all when the app will not start, which is exactly when it
//     matters most. The script answers both.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '@/lib/super-admin'
import { buildBundle, bundleFindings, type SupportBundle } from '@/lib/support/bundle'
import { version as appVersion } from '../../../package.json'

export const dynamic = 'force-dynamic'

/** Configured-but-unprobed is its own answer: a support check must not spend
 *  money or take seconds calling a vendor's API. */
function integrationState(...keys: string[]): 'configured' | 'unconfigured' {
  return keys.every(k => (process.env[k] ?? '').trim() !== '') ? 'configured' : 'unconfigured'
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const database: SupportBundle['database'] = {
    reachable: false,
    latencyMs: null,
    migrationsApplied: null,
    // Needs the migration FILES, which are not in the built image — see the
    // header. Null means "not measured here", and bundleFindings skips it.
    migrationsPending: null,
  }

  const counts: Record<string, number> = {}
  const integrations: SupportBundle['integrations'] = {
    supabase: 'unconfigured',
    anthropic: integrationState('ANTHROPIC_API_KEY'),
    stripe: integrationState('STRIPE_SECRET_KEY'),
    resend: integrationState('RESEND_API_KEY'),
    google: integrationState('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
    whatsapp:
      integrationState('TWILIO_ACCOUNT_SID') === 'configured'
        ? 'configured'
        : integrationState('META_WHATSAPP_ACCESS_TOKEN'),
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
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
      } else {
        database.reachable = true
        database.migrationsApplied = count ?? null
        integrations.supabase = 'ok'
      }
    } catch (err) {
      database.latencyMs = Date.now() - started
      database.error = err instanceof Error ? err.message : 'unreachable'
      integrations.supabase = 'failed'
    }

    if (database.reachable) {
      // COUNTS, NEVER ROWS. head:true returns no data at all, so there is
      // nothing here to leak even by accident.
      for (const table of ['tenants', 'itineraries', 'bookings', 'invoices', 'clients']) {
        const { count: n, error } = await admin.from(table).select('id', { head: true, count: 'exact' })
        if (!error && typeof n === 'number') counts[table] = n
      }
    }
  }

  const bundle = buildBundle({
    generatedAt: new Date().toISOString(),
    version: appVersion,
    sha: process.env.GIT_SHA || 'unknown',
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    database,
    env: process.env as Record<string, string | undefined>,
    integrations,
    counts,
    // No error store exists yet. scripts/doctor.mjs --logs <file> scrubs a log
    // the customer points it at, which is where these come from until there is
    // somewhere to keep them.
    errors: [],
  })

  return NextResponse.json({ success: true, findings: bundleFindings(bundle), bundle })
}
