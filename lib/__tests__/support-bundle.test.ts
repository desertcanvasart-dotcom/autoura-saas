import { describe, it, expect } from 'vitest'
import {
  reportEnv,
  redactText,
  redactErrorLines,
  buildBundle,
  bundleFindings,
  KNOWN_ENV_KEYS,
  type SupportBundle,
} from '../support/bundle'

// ============================================
// What these lock in:
//
//   1. No VALUE of any environment variable can reach the bundle.
//   2. No row content — names, emails, passports, ids — can reach it either.
//   3. A customer's own variables are invisible, not merely unreported.
//
// A bundle that leaks is worse than no bundle, so these are the tests that
// matter more than the shape ones below them.
// ============================================

describe('reportEnv', () => {
  it('reports names, never values', () => {
    const report = reportEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret.signature',
    })
    const serialised = JSON.stringify(report)
    expect(serialised).not.toContain('abc.supabase.co')
    expect(serialised).not.toContain('eyJ')
    expect(report.set).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('does not report a customer variable at all — not even its name', () => {
    const report = reportEnv({ ACME_INTERNAL_API_KEY: 'x', THEIR_DB_HOST: 'db.acme.internal' })
    expect(JSON.stringify(report)).not.toContain('ACME')
    expect(JSON.stringify(report)).not.toContain('THEIR_DB_HOST')
  })

  it('counts a present-but-empty variable as missing', () => {
    // `STRIPE_SECRET_KEY=` in a .env file is one somebody meant to fill in.
    const report = reportEnv({ STRIPE_SECRET_KEY: '   ' })
    expect(report.missing).toContain('STRIPE_SECRET_KEY')
    expect(report.set).not.toContain('STRIPE_SECRET_KEY')
  })

  it('separates the variables that stop the app from the ones that disable a feature', () => {
    const report = reportEnv({ NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y' })
    expect(report.missingRequired).toEqual(['SUPABASE_SERVICE_ROLE_KEY'])
    expect(report.missing).toContain('STRIPE_SECRET_KEY')       // missing, but not fatal
    expect(report.missingRequired).not.toContain('STRIPE_SECRET_KEY')
  })

  it('accounts for every known key, one way or the other', () => {
    const report = reportEnv({})
    expect(report.set.length + report.missing.length).toBe(KNOWN_ENV_KEYS.length)
  })
})

describe('redactText', () => {
  it('removes a Supabase key', () => {
    const out = redactText('auth failed with eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdef123456')
    expect(out).not.toContain('eyJ')
    expect(out).toContain('[jwt]')
  })

  it('removes the password from a connection string', () => {
    const out = redactText('could not connect: postgres://postgres:hunter2@db.abc.supabase.co:5432/postgres')
    expect(out).not.toContain('hunter2')
    expect(out).toContain('[credentials]')
    // The host survives, because which host failed is the useful half.
    expect(out).toContain('db.abc.supabase.co')
  })

  it('removes vendor keys whatever the vendor', () => {
    for (const key of ['sk_live_51H8xQ2abcdefghij', 'whsec_9aBcDeFgHiJkLmNoPq', 'sk-ant-api03-abcdefghijkl', 'xoxb-1234567890-abcdefgh']) {
      expect(redactText(`using ${key} now`)).not.toContain(key)
    }
  })

  it('removes a traveller email address', () => {
    const out = redactText('failed to send to tanaka.yuki@example.co.jp')
    expect(out).not.toContain('tanaka.yuki')
    expect(out).toContain('[email]')
  })

  it('removes uuids, which identify a person as surely as a name', () => {
    const out = redactText('booking c2a44a06-cec9-4c1e-892b-c856a1060b78 failed')
    expect(out).not.toContain('c2a44a06')
    expect(out).toContain('[id]')
  })

  it('removes anything passport-shaped', () => {
    expect(redactText('passport TR1234567 rejected')).not.toContain('TR1234567')
  })

  it('removes an authorization header however it is spelled', () => {
    for (const line of ['Authorization: Bearer abc123def456', 'apikey=abc123def456', 'token: abc123def456']) {
      expect(redactText(line)).not.toContain('abc123def456')
    }
  })

  it('keeps the part that is actually useful', () => {
    const out = redactText('PATCH /api/bookings/c2a44a06-cec9-4c1e-892b-c856a1060b78 → 500 column "base_total_cost" does not exist')
    expect(out).toContain('PATCH /api/bookings')
    expect(out).toContain('500')
    expect(out).toContain('base_total_cost')
  })

  it('survives non-strings rather than throwing', () => {
    expect(redactText(null)).toBe('')
    expect(redactText(undefined)).toBe('')
    expect(redactText(42)).toBe('42')
  })
})

describe('redactErrorLines', () => {
  it('keeps the most recent lines', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `error ${i}`)
    const out = redactErrorLines(lines, 3)
    expect(out).toEqual(['error 47', 'error 48', 'error 49'])
  })

  it('truncates a line long enough to be a rendered payload', () => {
    // Words, not one giant token — a single 5000-character run is caught by the
    // secret-shaped rule and replaced outright, which is the case below.
    const [out] = redactErrorLines([Array.from({ length: 900 }, () => 'stack frame at').join(' ')])
    expect(out.length).toBeLessThan(420)
    expect(out.endsWith('…')).toBe(true)
  })

  it('replaces one enormous token rather than truncating it', () => {
    const [out] = redactErrorLines(['x'.repeat(5000)])
    expect(out).toBe('[redacted]')
  })

  it('scrubs every line, not just the first', () => {
    const out = redactErrorLines(['a@b.com', 'c@d.com'])
    expect(out.join(' ')).not.toContain('@b.com')
    expect(out.join(' ')).not.toContain('@d.com')
  })
})

describe('buildBundle', () => {
  const parts = {
    generatedAt: '2026-08-28T18:00:00.000Z',
    version: '2026.08.29',
    sha: 'ab39887',
    node: 'v20.11.1',
    uptimeSeconds: 84213,
    database: { reachable: true, latencyMs: 41, migrationsApplied: 189, migrationsPending: [] },
    env: { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' },
    counts: { tenants: 3, bookings: 88 },
    errors: ['failed for yuki@example.co.jp'],
  }

  it('scrubs errors on the way in, so a caller cannot skip it', () => {
    const bundle = buildBundle(parts)
    expect(JSON.stringify(bundle)).not.toContain('yuki@example.co.jp')
  })

  it('scrubs a database error too — connection strings live there', () => {
    const bundle = buildBundle({
      ...parts,
      database: { reachable: false, latencyMs: null, migrationsApplied: null, migrationsPending: null,
        error: 'postgres://postgres:hunter2@db.abc.supabase.co:5432 refused' },
    })
    expect(JSON.stringify(bundle)).not.toContain('hunter2')
  })

  it('carries no environment VALUE anywhere in the finished bundle', () => {
    expect(JSON.stringify(buildBundle(parts))).not.toContain('abc.supabase.co')
  })

  it('says in the file what it redacted', () => {
    expect(buildBundle(parts).redaction.length).toBeGreaterThan(0)
  })

  it('discloses that hostnames survive, because they do', () => {
    // A pg failure reads "getaddrinfo ENOTFOUND db.acme.internal", and which
    // host failed IS the diagnosis. It is kept on purpose — so the notice has
    // to say so rather than let the customer assume otherwise.
    const bundle = buildBundle({
      ...parts,
      database: { reachable: false, latencyMs: 12, migrationsApplied: null, migrationsPending: null,
        error: 'getaddrinfo ENOTFOUND db.acme.internal' },
    })
    expect(bundle.database.error).toContain('db.acme.internal')
    expect(bundle.redaction.join(' ')).toMatch(/HOSTNAMES CAN APPEAR/)
  })
})

describe('bundleFindings', () => {
  const healthy: SupportBundle = buildBundle({
    generatedAt: '2026-08-28T18:00:00.000Z',
    version: '2026.08.29', sha: 'ab39887', node: 'v20.11.1',
    database: { reachable: true, latencyMs: 40, migrationsApplied: 189, migrationsPending: [] },
    env: { NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's' },
  })

  it('says so plainly when nothing is wrong', () => {
    expect(bundleFindings(healthy)).toEqual(['No problems found by these checks.'])
  })

  it('leads with a missing required variable', () => {
    const bundle = { ...healthy, env: { set: [], missing: ['SUPABASE_SERVICE_ROLE_KEY'], missingRequired: ['SUPABASE_SERVICE_ROLE_KEY'] } }
    expect(bundleFindings(bundle)[0]).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('names the pending migration and the command that applies it', () => {
    const bundle = { ...healthy, database: { ...healthy.database, migrationsPending: ['307_x.sql', '308_y.sql'] } }
    const [finding] = bundleFindings(bundle)
    expect(finding).toContain('307_x.sql')
    expect(finding).toContain('migrate.mjs')
  })

  it('flags a job that has never run on this install', () => {
    const bundle = { ...healthy, crons: [{ name: 'exchange-rates', lastRun: null, lastOutcome: null }] }
    expect(bundleFindings(bundle).join(' ')).toMatch(/never run/)
  })

  it('flags an unknown commit, because we cannot support a version we cannot name', () => {
    expect(bundleFindings({ ...healthy, app: { ...healthy.app, sha: 'unknown' } }).join(' ')).toMatch(/unknown/)
  })
})
