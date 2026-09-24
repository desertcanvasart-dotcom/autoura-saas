import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Concierge Leads: Archive did nothing (live 2026-09-24). Migration 218 —
// which gave tenant users an UPDATE policy on concierge_briefs — is recorded
// as applied on production but none of its policies exist, so every triage
// PATCH updated zero rows and the page ignored the 404. Migration 386
// re-applies 218 and adds DELETE; the API deletes archived leads only.
// ============================================================================

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('migration 386', () => {
  const m386 = read('supabase/migrations/386_reapply_218_and_delete_concierge_leads.sql')
  it('recreates EVERY policy migration 218 defines, idempotently', () => {
    const in218 = [...read('supabase/migrations/218_fix_rls_write_policies.sql')
      .matchAll(/CREATE POLICY (\w+) ON (\w+)/g)].map(m => `${m[1]} ON ${m[2]}`)
    expect(in218).toHaveLength(10)
    for (const p of in218) {
      expect(m386).toContain(`DROP POLICY IF EXISTS ${p};\nCREATE POLICY ${p}`)
    }
  })
  it('lets a tenant delete only its own briefs', () => {
    expect(m386).toMatch(/CREATE POLICY concierge_briefs_tenant_delete ON concierge_briefs\s+FOR DELETE\s+USING \(tenant_id = get_user_tenant_id\(\)\)/)
  })
})

// ---- DELETE /api/concierge-briefs/[id] ----
let role = 'manager'
let stored: { id: string; review_status: string } | null = null
let deleteReturns: { id: string }[] = []
const deleted: string[] = []

function chain() {
  let op: 'select' | 'delete' = 'select'
  const c = {
    select() { return c },
    delete() { op = 'delete'; return c },
    eq() { return c },
    maybeSingle: async () => ({ data: stored, error: null }),
    then(res: (v: unknown) => unknown) {
      if (op === 'delete') { deleted.push(stored?.id ?? '?'); return Promise.resolve({ data: deleteReturns, error: null }).then(res) }
      return Promise.resolve({ data: stored, error: null }).then(res)
    },
  }
  return c
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, role, supabase: { from: chain } }),
  createAuthenticatedClient: async () => ({}),
}))
vi.mock('@/lib/notifications', () => ({ markTeamNotificationsRead: async () => {} }))

async function del() {
  const { DELETE } = await import('@/app/api/concierge-briefs/[id]/route')
  const res = await DELETE(new Request('http://x', { method: 'DELETE' }) as never, { params: Promise.resolve({ id: 'b1' }) })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  role = 'manager'; stored = { id: 'b1', review_status: 'archived' }; deleteReturns = [{ id: 'b1' }]; deleted.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DELETE a concierge lead', () => {
  it('deletes an archived lead for a manager', async () => {
    const r = await del()
    expect(r.status).toBe(200)
    expect(deleted).toEqual(['b1'])
  })
  it('refuses a lead that is not archived — archive first', async () => {
    stored = { id: 'b1', review_status: 'needs_review' }
    const r = await del()
    expect(r.status).toBe(409)
    expect(deleted).toEqual([])
  })
  it('refuses a member', async () => {
    role = 'member'
    expect((await del()).status).toBe(403)
    expect(deleted).toEqual([])
  })
  it('never reports a delete the database refused (zero rows)', async () => {
    deleteReturns = []
    const r = await del()
    expect(r.status).toBe(403)
    expect(r.body.success).toBe(false)
  })
})

describe('the page says when an action fails', () => {
  it('updateStatus reports a refused PATCH instead of ignoring it', () => {
    const page = read('app/concierge-briefs/page.tsx')
    const fn = page.slice(page.indexOf('const updateStatus'), page.indexOf('const deleteBrief'))
    expect(fn).toMatch(/if \(!res\.ok\) \{[\s\S]*showToast\('error'/)
  })
})
