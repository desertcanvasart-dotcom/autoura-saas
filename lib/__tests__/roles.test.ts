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

describe('migration 357 retires the column without touching anything else', () => {
  const m357 = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/357_drop_user_profiles_role.sql'), 'utf8')
  const m356 = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/356_invited_signup_keeps_its_tenant.sql'), 'utf8')

  // Strip SQL comments before comparing: these assertions are about the
  // STATEMENTS, and a migration is entitled to explain itself differently.
  const norm = (v: string) =>
    v.split('\n').map((l) => l.replace(/--.*$/, '')).join(' ').replace(/\s+/g, ' ').trim()
  const stmt = (sql: string, start: string, end: string) => {
    const i = sql.indexOf(start)
    expect(i, `not found: ${start}`).toBeGreaterThan(-1)
    return norm(sql.slice(i, sql.indexOf(end, i)))
  }

  it('leaves the tenant, membership and features writes byte-identical', () => {
    // Everything except the profile INSERT must survive untouched. A new
    // customer getting no tenant is a far worse bug than the one being fixed.
    for (const [from, to] of [
      ['INSERT INTO tenants (company_name, contact_email)', 'INSERT INTO tenant_members'],
      ['INSERT INTO tenant_members (tenant_id, user_id, role', 'INSERT INTO user_profiles'],
      ['INSERT INTO tenant_features (', 'RETURN NEW;'],
    ]) {
      expect(stmt(m357, from, to), from).toBe(stmt(m356, from, to))
    }
  })

  it('writes the profile without a role', () => {
    expect(m357).toContain('INSERT INTO user_profiles (id, email, full_name, company_name, is_active)')
    // 356's column list, which the DROP would turn into a runtime error at
    // the next real signup — plpgsql does not resolve columns until then.
    expect(m357).not.toContain('is_active, role')
    expect(m357).not.toContain("true, 'admin')")
  })

  it('drops the column without CASCADE', () => {
    expect(m357).toContain('ALTER TABLE user_profiles DROP COLUMN IF EXISTS role;')
    expect(m357).not.toMatch(/DROP COLUMN[^;]*CASCADE/i)
  })

  it('keeps 356\'s invitation gate', () => {
    // This migration rewrites the whole function, so the gate that stops an
    // invitee being handed a company of their own has to be carried forward.
    const fn = m357.slice(
      m357.indexOf('CREATE OR REPLACE FUNCTION handle_new_user_signup'),
      m357.indexOf('ALTER TABLE user_profiles')
    )
    expect(fn).toContain("raw_user_meta_data ? 'invited_to_tenant'")
    expect(fn).toContain('pending_invitation_tenant(NEW.email)')
    const inviteeBranch = fn.slice(0, fn.indexOf('-- ---- ordinary signup'))
    expect(inviteeBranch).not.toContain('INSERT INTO tenant_members')
  })

  it('scans for functions that would still write the dropped column', () => {
    // A bare search for 'role' would match half the schema, so the migration
    // shapes its scan to the two ways a function can write THIS column.
    expect(m357).toContain('INTO\\s+user_profiles\\s*\\([^)]*\\mrole\\M')
    expect(m357).toContain('UPDATE\\s+user_profiles\\s+SET[^;]*\\mrole\\M\\s*=')
  })
})

describe('no application code reads the retired column', () => {
  it('nothing selects role off user_profiles', () => {
    const roots = ['app', 'lib', 'hooks', 'components']
    const walk = (dir: string): string[] => {
      const full = path.join(process.cwd(), dir)
      if (!fs.existsSync(full)) return []
      return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) => {
        const rel = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel)
        return /\.tsx?$/.test(e.name) ? [rel] : []
      })
    }
    const offenders: string[] = []
    for (const f of [...roots.flatMap(walk), 'middleware.ts']) {
      const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
      let i = src.indexOf("from('user_profiles')")
      while (i > -1) {
        // The select() immediately following the table, not the whole file.
        const window = src.slice(i, i + 160)
        const select = window.match(/\.select\(\s*['"`]([^'"`]*)['"`]/)
        if (select && /\brole\b/.test(select[1])) offenders.push(`${f}: ${select[1]}`)
        i = src.indexOf("from('user_profiles')", i + 1)
      }
    }
    expect(offenders).toEqual([])
  })
})
