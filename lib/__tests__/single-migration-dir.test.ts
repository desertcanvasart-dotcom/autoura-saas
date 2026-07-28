import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// ============================================================================
// This repo grew a SECOND migration directory. Two files sat in /migrations
// for a month, never applied, while supabase/migrations/ was the real one.
// Nothing recorded which was canonical, so "is this migration live?" had no
// answer — and one of the orphans defined record_booking_payment, which the
// booking-payments route calls, so that route 500'd the whole time.
//
// One directory, enforced. A stray .sql outside it fails the build.
// ============================================================================

const ROOT = path.resolve(__dirname, '../..')

describe('there is exactly one migration directory', () => {
  it('supabase/migrations exists and holds the migrations', () => {
    const dir = path.join(ROOT, 'supabase/migrations')
    expect(fs.existsSync(dir)).toBe(true)
    expect(fs.readdirSync(dir).filter(f => f.endsWith('.sql')).length).toBeGreaterThan(100)
  })

  it('there is no second migrations directory at the repo root', () => {
    // The exact mistake this guards: /migrations alongside supabase/migrations.
    expect(fs.existsSync(path.join(ROOT, 'migrations'))).toBe(false)
  })

  it('no tracked .sql sits at the repo root or in a second migrations dir', () => {
    // git's view, not the working tree: CI checks out only tracked files, and
    // gitignored local scratch must not fail this. This guards the exact split
    // this PR closes — a second /migrations directory, and loose .sql at the
    // top level. It deliberately does NOT yet cover the 39 ad-hoc files under
    // supabase/*.sql (CHECK_*, FIX_*, CREATE_*): several contain real DDL and
    // whether they are live is unknown. Untangling those is its own task, not
    // something to bury in the RPC fix.
    const tracked = execSync('git ls-files "*.sql"', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    const strays = tracked.filter(
      (f) => f === path.basename(f) || f.startsWith('migrations/'),
    )
    expect(strays, `tracked .sql at repo root or in a second migrations/ dir: ${strays.join(', ')}`).toEqual([])
  })
})
