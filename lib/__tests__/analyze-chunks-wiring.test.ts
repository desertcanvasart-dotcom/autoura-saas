// ============================================
// `npm run analyze` must actually produce something (2026-09-14)
// ============================================
// It used to be `ANALYZE=true next build`, wrapping @next/bundle-analyzer.
// That plugin hooks `config.webpack`; Next 16 builds this app with Turbopack,
// so it was never called. The command exited 0 and wrote no report at all — and
// it is the tool check-bundle-budget.mjs points you at when the budget fails,
// so the escape hatch from a red CI silently did nothing.
//
// This pins the replacement in place. It does not run the analyzer (that needs
// a production build); it proves the wiring cannot quietly revert.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe('npm run analyze', () => {
  it('runs the Turbopack-native script, not a webpack-only build', () => {
    expect(pkg.scripts.analyze).toBe('node scripts/analyze-chunks.mjs')
    expect(existsSync(join(ROOT, 'scripts', 'analyze-chunks.mjs'))).toBe(true)
  })

  it('the webpack-only analyzer is gone from the dependency tree', () => {
    // Reinstalling it would not make it work — Turbopack never calls the hook.
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps['@next/bundle-analyzer']).toBeUndefined()
    expect(read('next.config.js')).not.toMatch(/require\(['"]@next\/bundle-analyzer/)
  })

  it('refuses to run without a build instead of reporting an empty bundle', () => {
    // A missing .next must be an error, never "0 KB across 0 files" — the whole
    // defect being fixed here was a quiet no-op that looked like success.
    const script = read('scripts', 'analyze-chunks.mjs')
    expect(script).toMatch(/run `npm run build` first/)
    expect(script).toMatch(/process\.exit\(1\)/)
  })

  it('never reduces a scoped package to a generic word', () => {
    // '@react-email/render' fingerprinted as 'render' matched every chunk, and
    // the first run duly reported react-email inside jspdf. Sizes are exact;
    // library names must stay evidence, not noise wearing a library's name.
    const script = read('scripts', 'analyze-chunks.mjs')
    expect(script).toMatch(/name\.startsWith\('@'\) \? name\.slice\(1\)\.split\('\/'\)\[0\] : name/)
    expect(script).toMatch(/GENERIC = new Set\(\[[^\]]*'render'/)
    expect(script).toMatch(/no library signature/)
  })
})
