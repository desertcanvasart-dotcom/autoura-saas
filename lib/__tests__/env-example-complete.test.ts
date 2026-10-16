import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Every variable the app reads is documented in .env.example, so whoever
// deploys it can see what exists. About 40 were missing (2026-10 review).

const ROOT = process.cwd()
const DIRS = ['app', 'lib', 'components', 'hooks', 'scripts']
const FILES = ['middleware.ts', 'instrumentation.ts', 'next.config.js']
// Set by Node, the OS or the host — nobody configures these.
const PLATFORM = new Set(['NODE_ENV', 'PATH', 'PORT', 'TZ', 'NEXT_RUNTIME', 'CI', 'HOME'])
const isPlatform = (v: string) => PLATFORM.has(v) || v.startsWith('RAILWAY_') || v.startsWith('VITEST')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('.env.example', () => {
  it('documents every environment variable the code reads', () => {
    const files = [...DIRS.flatMap(d => walk(join(ROOT, d))), ...FILES.map(f => join(ROOT, f))]
    const used = new Set<string>()
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) {
        used.add(m[1] ?? m[2])
      }
    }
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8')
    const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]))
    const missing = [...used].filter(v => !isPlatform(v) && !documented.has(v)).sort()
    expect(missing, 'Add these to .env.example with a one-line note').toEqual([])
  })
})
