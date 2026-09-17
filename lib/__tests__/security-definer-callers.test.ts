import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Server-only SECURITY DEFINER functions (migration 361)
// ============================================
// These functions take a tenant or quote id as an argument and run past RLS.
// Migration 361 revoked EXECUTE from anon and authenticated, so a call on a
// signed-in user's client now fails. Every call must go through the
// service-role client, in a file that has been checked to derive the id
// server-side. A new call site fails here until it is reviewed and listed.

const ROOT = path.join(__dirname, '..', '..')

const ALLOWED_CALLERS: Record<string, string[]> = {
  log_activity: ['lib/billing-middleware.ts', 'app/api/billing/webhook/route.ts'],
  increment_usage: ['lib/usage-enforcement.ts'],
  get_tenant_agent_memories: ['lib/agent-memory.ts'],
  create_b2b_quote_version: ['app/api/quotes/b2b/[id]/route.ts'],
  create_b2c_quote_version: ['app/api/quotes/b2c/[id]/route.ts'],
  revert_b2b_quote_to_version: ['app/api/quotes/[type]/[id]/versions/revert/route.ts'],
  revert_b2c_quote_to_version: ['app/api/quotes/[type]/[id]/versions/revert/route.ts'],
  purge_expired_agent_memories: ['app/api/cron/process-agent-memory/route.ts'],
  seed_tenant_vocabulary: [],
  get_tenant_subscription: [],
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const files = ['app', 'lib', 'components', 'scripts']
  .flatMap(d => sourceFiles(path.join(ROOT, d)))
  .map(f => ({ rel: path.relative(ROOT, f), src: readFileSync(f, 'utf8') }))

describe('server-only SECURITY DEFINER functions are called only from reviewed files', () => {
  for (const [fn, allowed] of Object.entries(ALLOWED_CALLERS)) {
    it(`${fn}`, () => {
      // The name as a quoted string literal: .rpc('fn') and the revert
      // route's ternary of names both count as a call site. Backticks are
      // left out: comments cite function names in markdown backticks.
      const pattern = new RegExp(`['"]${fn}['"]`)
      const callers = files.filter(f => pattern.test(f.src)).map(f => f.rel).sort()
      expect(callers, `unreviewed caller of ${fn}; it must use the service-role client`).toEqual(
        [...allowed].sort()
      )
    })
  }
})

describe('the helpers that wrap them default to the service-role client', () => {
  const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

  it('logActivity', () => {
    const src = read('lib/billing-middleware.ts')
    expect(src).toMatch(/const admin = client \?\? createAdminClient\(\)/)
    expect(src).toMatch(/admin as any\)\.rpc\('log_activity'/)
  })

  it('incrementVolumeUsage', () => {
    expect(read('lib/usage-enforcement.ts')).toMatch(/\(client \?\? createAdminClient\(\)\)\.rpc\('increment_usage'/)
  })

  it('getMemoriesForPrompt', () => {
    const src = read('lib/agent-memory.ts')
    expect(src).toMatch(/const supabase = params\.client \?\? createAdminClient\(\)/)
  })

  it('the files calling on their own client use an admin client for the call', () => {
    expect(read('app/api/billing/webhook/route.ts')).toMatch(/getSupabaseAdmin\(\) as any\)\.rpc\('log_activity'/)
    expect(read('app/api/quotes/b2b/[id]/route.ts')).toMatch(/supabaseAdmin\.rpc\('create_b2b_quote_version'/)
    expect(read('app/api/quotes/b2c/[id]/route.ts')).toMatch(/supabaseAdmin\.rpc\('create_b2c_quote_version'/)
    expect(read('app/api/quotes/[type]/[id]/versions/revert/route.ts')).toMatch(/supabaseAdmin\s*\n?\s*\.rpc\(functionName/)
    expect(read('app/api/cron/process-agent-memory/route.ts')).toMatch(/supabaseAdmin\.rpc\(\s*\n?\s*'purge_expired_agent_memories'/)
  })
})
