// ============================================
// API: /api/health — application health probe
// ============================================
// Public (middleware-allowlisted), unauthenticated, secret-free. Complements
// /api/version: version says WHAT is deployed, health says whether it WORKS.
// Checked by scripts/verify-deploy.mjs and usable by any uptime monitor.
//
// 200 = every check passed; 503 = at least one failed (body says which).
// Deliberately minimal surface: pass/fail + latency only — no table names,
// no error internals, nothing an anonymous caller can use for recon.
// ============================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface Check {
  ok: boolean
  latencyMs?: number
  error?: string
}

// Lazy service-role client: constructing at module scope crashes `next build`
// ("Collecting page data" evaluates every route module) when env vars aren't
// present at build time. Matches lib/supabase-server's build-safe convention.
let _admin: ReturnType<typeof createClient> | null = null
function admin(): ReturnType<typeof createClient> | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return _admin
}

async function checkDatabase(): Promise<Check> {
  const client = admin()
  if (!client) return { ok: false, error: 'unconfigured' }

  const started = Date.now()
  try {
    // Cheapest real round-trip: HEAD count, no rows returned.
    const { error } = await client
      .from('user_profiles')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
    const latencyMs = Date.now() - started
    if (error) {
      // supabase-js surfaces network failures as an error object, not a throw.
      const network = /fetch failed|ENOTFOUND|ECONN|timeout/i.test(error.message)
      return { ok: false, latencyMs, error: network ? 'unreachable' : 'query failed' }
    }
    return { ok: true, latencyMs }
  } catch {
    return { ok: false, latencyMs: Date.now() - started, error: 'unreachable' }
  }
}

export async function GET() {
  const db = await checkDatabase()
  const ok = db.ok

  return NextResponse.json(
    {
      ok,
      checks: { db },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  )
}
