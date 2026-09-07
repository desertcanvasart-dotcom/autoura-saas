// A refused vocabulary write must say WHO can change the lists and WHAT to
// do, from every route, in the same words the page shows read-only viewers —
// never a bare "Admin access required" that reads as a broken app.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const API = join(ROOT, 'app', 'api', 'vocabulary')
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) walk(f, out)
    else if (f.endsWith('.ts')) out.push(f)
  }
  return out
}

describe('vocabulary write refusal', () => {
  it('every role gate answers with the shared WRITE_DENIED message', () => {
    for (const file of walk(API)) {
      const src = readFileSync(file, 'utf8')
      const gates = src.match(/WRITE_ROLES\.includes\(/g)?.length ?? 0
      const denials = src.match(/error: WRITE_DENIED/g)?.length ?? 0
      expect(denials, file.slice(ROOT.length + 1)).toBe(gates)
      expect(src).not.toMatch(/Admin access required'/)
    }
  })
  it('the message names owner and admin and what to do', () => {
    const src = readFileSync(join(API, 'route.ts'), 'utf8')
    const msg = src.match(/export const WRITE_DENIED = '([^']+)'/)?.[1] ?? ''
    expect(msg).toMatch(/owner or an admin/)
    expect(msg).toMatch(/User Management/)
  })
  it('the page tells read-only viewers the same thing', () => {
    const page = readFileSync(join(ROOT, 'app', 'settings', 'vocabulary', 'page.tsx'), 'utf8')
    expect(page).toMatch(/Only the agency owner or an admin can/)
    expect(page).toMatch(/href="\/users"/)
  })
})
