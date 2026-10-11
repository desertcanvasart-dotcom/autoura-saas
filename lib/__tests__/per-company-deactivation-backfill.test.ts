import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Migration 407: people switched off under the old account-wide rule become
// deactivated per company. A super admin's disable (which bans the login)
// must be left alone, and nobody may gain access.

const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/407_per_company_deactivation_backfill.sql'), 'utf8')
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

describe('migration 407', () => {
  it('converts only accounts switched off without a login ban', () => {
    expect(code).toContain('p.is_active = false')
    expect(code).toContain('u.banned_until IS NULL OR u.banned_until <= now()')
  })

  it('deactivates only memberships that are active — invited and suspended stay as they are', () => {
    expect(code).toMatch(/SET status = 'deactivated'[\s\S]*AND m\.status = 'active'/)
  })

  it('switches the account flag back on only for those converted', () => {
    expect(code).toMatch(/UPDATE public\.user_profiles p\s+SET is_active = true\s+WHERE p\.id IN \(SELECT id FROM _old_deactivated\)/)
  })

  it('runs as one transaction', () => {
    expect(code.trim().startsWith('BEGIN;')).toBe(true)
    expect(code.trim().endsWith('COMMIT;')).toBe(true)
  })
})
