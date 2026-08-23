import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// gmail_tokens secret-column sweep — locks what migration 273 relies on.
//
// 273 revokes SELECT on access_token/refresh_token from `authenticated`,
// because RLS is row-level: an own-row SELECT policy necessarily hands the
// user's Google refresh token to their own browser, so any XSS is a mailbox
// takeover.
//
// That revoke is only safe while every read of those columns goes through a
// service-role client. If someone adds one back on the RLS-bound client it
// does not fail at build or type-check — it fails in production, as a route
// that suddenly cannot send or sync mail.
//
// Migration 249's own comment asserted "the gmail/* routes use the admin
// client". It was true of five of the six; app/api/gmail/emails read tokens
// with the authenticated client and `select('*')`. Trusting the comment would
// have shipped the break. Hence a test, not a comment.
// ============================================================================

const ROOT = path.resolve(__dirname, '../../..')
const SECRET_COLUMNS = ['access_token', 'refresh_token']

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}

/** Identifiers in this file that hold a service-role client. */
function adminIdentifiers(src: string): Set<string> {
  const names = new Set<string>(['createAdminClient'])
  // Local factories that build a client from the service-role key.
  for (const m of src.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g)) {
    if (m[2].includes('SUPABASE_SERVICE_ROLE_KEY')) names.add(m[1])
  }
  // const x = createAdminClient() / getSupabaseAdmin() / ...
  let grew = true
  while (grew) {
    grew = false
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(?:await\s+)?(\w+)\s*\(/g)) {
      if (names.has(m[2]) && !names.has(m[1])) { names.add(m[1]); grew = true }
    }
  }
  return names
}

/** Every `.from('gmail_tokens')` read, with its receiver and selected columns. */
function tokenReads(src: string) {
  const reads: { receiver: string; columns: string }[] = []
  for (const m of src.matchAll(/\.from\(['"]gmail_tokens['"]\)/g)) {
    const before = src.slice(Math.max(0, m.index! - 160), m.index!).replace(/\s+/g, ' ')
    const after = src.slice(m.index!, m.index! + 400)

    // Receiver: the expression the .from() hangs off. Take everything after
    // the nearest `await`, so a cast like `(getSupabase() as any)` is kept
    // whole — matching the bare trailing identifier would read that as `any`.
    const at = before.lastIndexOf('await ')
    const receiver = at === -1 ? before.slice(-80) : before.slice(at + 6)

    // Only SELECTs can leak a column; update/delete/upsert cannot.
    const sel = after.match(/\.select\(\s*['"]([^'"]*)['"]/)
    if (!sel) continue
    reads.push({ receiver, columns: sel[1] })
  }
  return reads
}

describe('gmail_tokens secret columns', () => {
  const files = sourceFiles(path.join(ROOT, 'app'))
    .concat(sourceFiles(path.join(ROOT, 'lib')))
    .filter((f) => fs.readFileSync(f, 'utf8').includes("from('gmail_tokens')"))

  it('finds the reads at all (a silent zero would pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(0)
    const total = files.reduce((n, f) => n + tokenReads(fs.readFileSync(f, 'utf8')).length, 0)
    expect(total).toBeGreaterThanOrEqual(10)
  })

  it('never selects a token column through an RLS-bound client', () => {
    const offenders: string[] = []

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      const admins = adminIdentifiers(src)

      for (const { receiver, columns } of tokenReads(src)) {
        const wantsSecret =
          columns.trim() === '*' || SECRET_COLUMNS.some((c) => columns.includes(c))
        if (!wantsSecret) continue

        const isAdmin = [...admins].some((n) => receiver.includes(n))
        if (!isAdmin) {
          offenders.push(
            `${path.relative(ROOT, file)} — select('${columns}') via '${receiver}', ` +
              `which is not a service-role client`
          )
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
