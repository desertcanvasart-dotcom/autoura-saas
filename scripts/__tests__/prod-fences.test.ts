import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Scripts that can write to the live database stay fenced
// ============================================
// .env.local on this project points at the LIVE Supabase project, and the
// sibling's e2e seed once stamped a real client into a test org. These
// scripts each carry a fence (A-item 23); this scan keeps the fences from
// being refactored away. setup-stripe-plans.mjs --live is the house
// pattern being copied.

const SCRIPTS = path.join(__dirname, '..')
const read = (f: string) => readFileSync(path.join(SCRIPTS, f), 'utf8')

describe('prod fences on .env.local-reading scripts', () => {
  it('seed-concierge-mappings is read-only unless --apply', () => {
    const src = read('seed-concierge-mappings.mjs')
    expect(src).toMatch(/!process\.argv\.includes\('--apply'\)/)
    // The old inverted default: apply unless --list. Never again.
    expect(src).not.toMatch(/listOnly = process\.argv\.includes\('--list'\)/)
  })

  it('verify-rls cleans up its sentinel in a finally block', () => {
    const src = read('verify-rls.mjs')
    const finallyIdx = src.indexOf('} finally {')
    expect(finallyIdx).toBeGreaterThan(-1)
    expect(src.slice(finallyIdx)).toMatch(/zz-rls-verify%/)
  })

  it('smoke-pricing-grid refuses SMOKE_WRITE against a non-local host without --live', () => {
    const src = read('smoke-pricing-grid.mjs')
    expect(src).toMatch(/DO_WRITE && !isLocalTarget && !process\.argv\.includes\('--live'\)/)
  })

  it('sync-plans only writes implicitly in a deploy environment', () => {
    const src = read('sync-plans.mjs')
    expect(src).toMatch(/RAILWAY_ENVIRONMENT/)
    expect(src).toMatch(/!CHECK_ONLY && !onRailway && !process\.argv\.includes\('--live'\)/)
  })

  it('seed scripts announce their target host before writing', () => {
    for (const f of ['seed-rates.mjs', 'seed-message-templates.mjs', 'seed-concierge-mappings.mjs']) {
      expect(read(f), `${f} must print its target`).toMatch(/target: \$\{new URL\(url\)\.host\}/)
    }
  })
})
