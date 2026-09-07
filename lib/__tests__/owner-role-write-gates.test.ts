// The tenant's owner is its first admin. Three API gates named only 'admin'
// and silently locked the owner out (Settings → Your vocabulary could not be
// edited by the person who created the agency). This scans every role gate
// under app/api: wherever 'admin' is granted, 'owner' must be too.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('owner is granted wherever admin is', () => {
  const files = walk(join(ROOT, 'app', 'api'))
  it('role arrays that grant admin also grant owner', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const line of src.split('\n')) {
        // Only GATES: a *_ROLES constant, or an array tested against the
        // caller's role. Lists of roles one may ASSIGN (invites, onboarding)
        // legitimately omit owner and are not checked.
        const isGate = /_ROLES\s*=|\.includes\(\s*(role|auth\.role|authResult\.role|currentMember\.role)/.test(line)
        if (isGate) {
          for (const m of line.matchAll(/\[\s*((?:'[a-z_]+'\s*,\s*)*'[a-z_]+')\s*\]/g)) {
            const roles = m[1].split(',').map(r => r.trim().replace(/'/g, ''))
            // A list that grants viewers is a list of ASSIGNABLE roles (the
            // invite form validating its input), never a write gate.
            if (roles.includes('viewer')) continue
            if (roles.includes('admin') && !roles.includes('owner')) offenders.push(`${file.slice(ROOT.length + 1)}: [${roles.join(', ')}]`)
          }
        }
        // Inline comparisons: role !== 'admin' / role === 'admin' with no owner on the line.
        if (/role\s*[!=]==\s*'admin'/.test(line) && !line.includes("'owner'")) offenders.push(`${file.slice(ROOT.length + 1)}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
  it('the vocabulary write gate names both', () => {
    expect(readFileSync(join(ROOT, 'app', 'api', 'vocabulary', 'route.ts'), 'utf8')).toMatch(/WRITE_ROLES = \['owner', 'admin'\]/)
  })
})
