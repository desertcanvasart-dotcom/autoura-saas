import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { toPermissionRole, MEMBERSHIP_ROLES } from '@/lib/roles'
import { ROUTE_PERMISSIONS } from '@/middleware'

// ============================================================================
// One source of truth for permissions: tenant_members.role. These tests guard
// the seam where the workspace-scoped vocabulary ('owner' included) is folded
// into the vocabulary ROUTE_PERMISSIONS and the sidebar are written in.
// ============================================================================

describe('the membership vocabulary matches the database', () => {
  it('covers exactly the values the CHECK constraint permits', () => {
    // If someone adds a role to the constraint and not to lib/roles.ts, every
    // holder of it silently becomes a 'viewer'. This is the tripwire.
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/002_phase1b_multi_tenancy.sql'),
      'utf8'
    )
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS tenant_members'))
    const check = table.match(/CHECK \(role IN \(([^)]*)\)\)/)
    expect(check, 'could not find the role CHECK constraint').not.toBeNull()

    const fromDb = check![1]
      .split(',')
      .map((v) => v.trim().replace(/'/g, ''))
      .sort()

    expect([...MEMBERSHIP_ROLES].sort()).toEqual(fromDb)
  })

  it('maps every one of them to a real permission role', () => {
    for (const role of MEMBERSHIP_ROLES) {
      const mapped = toPermissionRole(role)
      // Only an actual viewer may land on 'viewer' — anything else doing so
      // is the silent-downgrade failure this guards against.
      if (role !== 'viewer') expect(mapped, role).not.toBe('viewer')
    }
  })
})

describe('owner is the reason this mapping exists', () => {
  it('folds owner into admin', () => {
    expect(toPermissionRole('owner')).toBe('admin')
  })

  it('and ROUTE_PERMISSIONS really does not know the word', () => {
    // The moment this stops being true the fold could be reconsidered; until
    // then, handing a raw membership role to the gate locks out every owner.
    const allowed = new Set(Object.values(ROUTE_PERMISSIONS).flat())
    expect(allowed.has('owner')).toBe(false)
  })
})

describe('anything unrecognised fails closed', () => {
  it.each([null, undefined, '', 'agent', 'root', 'ADMIN'])('%s becomes viewer', (value) => {
    // 'agent' is the old user_profiles default and was never a real permission
    // level; 'ADMIN' proves the match is not case-insensitive by accident.
    expect(toPermissionRole(value as string | null | undefined)).toBe('viewer')
  })
})

describe('nothing reads the retired profile role for permissions', () => {
  // PR 2 drops user_profiles.role. Anything still gating on it would start
  // failing closed at that moment instead of at this test.
  const files = ['middleware.ts', 'hooks/useRole.tsx']

  it('neither gate mentions it', () => {
    for (const f of files) {
      const code = fs
        .readFileSync(path.join(process.cwd(), f), 'utf8')
        .split('\n')
        .filter((l) => {
          const t = l.trim()
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
        })
        .join('\n')
      expect(code, f).not.toMatch(/profile\??\.role/)
    }
  })

  it('the dead parallel auth helper is gone', () => {
    // lib/supabase-secure.ts carried a second UserRole union and its own
    // profile-role gate, imported by nothing.
    expect(fs.existsSync(path.join(process.cwd(), 'lib/supabase-secure.ts'))).toBe(false)
  })
})
