import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ============================================
// One membership rule, everywhere
// ============================================
// tenant_members is unique per (tenant, user) PAIR, so one person can belong
// to several companies — an existing user who accepts an invitation gains a
// second row (app/api/invitations/accept, 'linked_existing'). Every lookup of
// "the user's membership" that is NOT already scoped to a tenant must:
//   * never use .single() — it errors on 2+ rows, which turned into a 403 on
//     every requireAuth() route for such a user;
//   * pick the same row as every other layer: oldest joined_at, then lowest
//     tenant_id (joined_at can tie), limit 1.
// Lookups scoped with .eq('tenant_id', …) check one known membership and are
// out of scope.

const ROOT = path.join(__dirname, '..', '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

// The query chain that starts at each .from('tenant_members'): everything up
// to the end of the statement (a line that does not continue the chain).
function chains(src: string): string[] {
  const out: string[] = []
  const re = /\.from\((['"])tenant_members\1\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const lines = src.slice(m.index).split('\n')
    const chain = [lines[0]]
    for (const line of lines.slice(1)) {
      if (!/^\s*\./.test(line)) break
      chain.push(line)
    }
    out.push(chain.join('\n'))
  }
  return out
}

const files = [
  ...['app', 'lib', 'components'].flatMap(d => sourceFiles(path.join(ROOT, d))),
  path.join(ROOT, 'middleware.ts'),
].map(f => ({ rel: path.relative(ROOT, f), src: readFileSync(f, 'utf8') }))

const userLookups = files.flatMap(f =>
  chains(f.src)
    .filter(c => /\.eq\(\s*['"]user_id['"]/.test(c) && !/\.eq\(\s*['"]tenant_id['"]/.test(c))
    // A select that reads the user's memberships as a LIST (no single row) is
    // not "the membership" — only single-row reads are held to the rule.
    .filter(c => /\.(single|maybeSingle)\(\)/.test(c))
    .map(chain => ({ file: f.rel, chain }))
)

describe('membership lookup rule', () => {
  // Since migration 414 the rule lives in ONE place, get_user_tenant_id():
  // the person's chosen company while they are an active member of it, else
  // the oldest active membership. Every layer asks it (lib/current-membership)
  // rather than re-implementing it, so the page, the API and RLS agree.
  it('every layer asks the database which company is current', () => {
    for (const f of [
      'lib/supabase-server.ts',
      'middleware.ts',
      'app/contexts/AuthContext.tsx',
      'app/contexts/TenantContext.tsx',
      'app/page.tsx',
    ]) {
      const src = files.find(x => x.rel === f)!.src
      expect(src, f).toMatch(/currentMembership(<[^>]*>)?\(/)
    }
    const helper = files.find(x => x.rel === 'lib/current-membership.ts')!.src
    expect(helper).toMatch(/rpc\('get_user_tenant_id'\)/)
    expect(helper).toMatch(/\.eq\('status', 'active'\)/)
  })

  it('nothing picks "the" membership by its own rule any more', () => {
    // A single-row read of the user's memberships not pinned to a company.
    expect(userLookups.map(l => `${l.file}:\n${l.chain}`)).toEqual([])
  })

  it('no user membership lookup uses .single()', () => {
    const bad = userLookups.filter(l => /\.single\(\)/.test(l.chain)).map(l => l.file)
    expect(bad).toEqual([])
  })

  it('routes that call requireAuth() do not look the membership up a second time', () => {
    const bad = files
      .filter(f => f.rel.startsWith('app/api/') && /requireAuth\(\)/.test(f.src))
      .filter(f => userLookups.some(l => l.file === f.rel))
      .map(f => f.rel)
    expect(bad).toEqual([])
  })
})
