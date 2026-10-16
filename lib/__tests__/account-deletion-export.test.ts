import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import JSZip from 'jszip'
import { csvCell, toCsv, collectCompanyData, collectPersonalData, buildExportZip } from '@/lib/account/data-export'
import { deletionBlocker } from '@/lib/account/deletion-rules'
import { purgeDateFrom, CLOSURE_GRACE_DAYS } from '@/lib/account/company-closure'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// A stand-in for the admin client that records what is asked of it.
type Call = { table: string; columns: string; filters: Array<[string, string, unknown]> }
function fakeDb(rows: Record<string, Array<Record<string, unknown>>>, tables: Array<{ table_name: string; column_names: string[] }>) {
  const calls: Call[] = []
  const db = {
    rpc: async (fn: string, args?: { p_tables?: string[] }) => {
      if (fn === 'tenant_data_tables') return { data: tables, error: null }
      if (fn === 'data_table_columns') {
        return {
          data: (args?.p_tables ?? []).map(t => ({ table_name: t, column_names: Object.keys(rows[t]?.[0] ?? { id: 1 }) })),
          error: null,
        }
      }
      return { data: null, error: { message: 'unknown rpc' } }
    },
    from: (table: string) => ({
      select: (columns: string) => {
        const call: Call = { table, columns, filters: [] }
        calls.push(call)
        const q = {
          eq: (c: string, v: string) => { call.filters.push(['eq', c, v]); return q },
          in: (c: string, v: string[]) => { call.filters.push(['in', c, v]); return q },
          order: () => ({
            range: async (from: number) => {
              let data = rows[table] ?? []
              for (const [op, c, v] of call.filters) {
                data = data.filter(r => (op === 'eq' ? r[c] === v : (v as string[]).includes(String(r[c]))))
              }
              const keep = columns.split(',')
              return { data: from === 0 ? data.map(r => Object.fromEntries(keep.map(k => [k, r[k]]))) : [], error: null }
            },
          }),
        }
        return q
      },
    }),
  }
  return { db, calls }
}

describe('CSV cells', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(null)).toBe('')
  })
  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1 555')).toBe("'+1 555")
  })
  it('writes objects as JSON and a header row', () => {
    expect(toCsv([{ id: 1, meta: { a: 1 } }])).toBe('id,meta\r\n1,"{""a"":1}"\r\n')
    expect(toCsv([])).toBe('')
  })
})

describe('company export', () => {
  const T = 'tenant-1'
  const rows = {
    clients: [
      { id: 'c1', tenant_id: T, name: 'Ada' },
      { id: 'c2', tenant_id: 'other', name: 'Not ours' },
    ],
    booking_portal_links: [{ id: 'p1', tenant_id: T, token: 'SECRET', booking_id: 'b1' }],
    gmail_tokens: [{ id: 'g1', tenant_id: T, refresh_token: 'SECRET' }],
    tenants: [{ id: T, company_name: 'Probe Tours' }],
    email_client_links: [{ id: 'l1', client_id: 'c1', message_id: 'm1' }, { id: 'l2', client_id: 'c2', message_id: 'm2' }],
  }
  const tables = [
    { table_name: 'clients', column_names: ['id', 'tenant_id', 'name'] },
    { table_name: 'booking_portal_links', column_names: ['id', 'tenant_id', 'token', 'booking_id'] },
    { table_name: 'gmail_tokens', column_names: ['id', 'tenant_id', 'refresh_token'] },
  ]

  it('reads only this company, never secrets, and reaches child rows through their parent', async () => {
    const { db, calls } = fakeDb(rows, tables)
    const out = await collectCompanyData(db, T)
    expect(out.get('clients')).toEqual([{ id: 'c1', tenant_id: T, name: 'Ada' }])
    expect(out.get('booking_portal_links')).toEqual([{ id: 'p1', tenant_id: T, booking_id: 'b1' }])
    expect(out.has('gmail_tokens')).toBe(false)
    expect(calls.some(c => c.table === 'gmail_tokens')).toBe(false)
    expect(calls.every(c => !c.columns.split(',').includes('token'))).toBe(true)
    expect(out.get('tenants')).toEqual([{ id: T, company_name: 'Probe Tours' }])
    expect(out.get('email_client_links')).toEqual([{ id: 'l1', client_id: 'c1', message_id: 'm1' }])
  })

  it('zips a README, one CSV and one JSON per table', async () => {
    const { db } = fakeDb(rows, tables)
    const zip = await JSZip.loadAsync(await buildExportZip(await collectCompanyData(db, T), 'Hello'))
    const names = Object.keys(zip.files)
    expect(names).toContain('README.txt')
    expect(names).toContain('csv/clients.csv')
    expect(names).toContain('json/clients.json')
    expect(await zip.file('README.txt')!.async('string')).toMatch(/clients: 1 row/)
    expect(JSON.parse(await zip.file('json/clients.json')!.async('string'))).toHaveLength(1)
  })

  it('a person gets their own rows only', async () => {
    const { db, calls } = fakeDb({ user_settings: [{ id: 's1', user_id: 'u1' }, { id: 's2', user_id: 'u2' }] }, [])
    const out = await collectPersonalData(db, { id: 'u1', email: 'a@b.c' })
    expect(out.get('account')).toEqual([{ id: 'u1', email: 'a@b.c', created_at: null, last_sign_in_at: null }])
    expect(out.get('user_settings')).toEqual([{ id: 's1', user_id: 'u1' }])
    expect(calls.every(c => c.filters.some(([, , v]) => v === 'u1'))).toBe(true)
  })
})

describe('deleting your own account never orphans a company', () => {
  const owner = { tenant_id: 't1', role: 'owner', status: 'active', company: 'Probe Tours' }
  it('the only member closes the company instead', () => {
    expect(deletionBlocker([owner], new Map())?.code).toBe('sole_member')
  })
  it('the last owner hands over first', () => {
    const others = new Map([['t1', [{ role: 'admin', status: 'active' }]]])
    expect(deletionBlocker([owner], others)?.code).toBe('last_owner')
  })
  it('with another owner, or as a plain member, deletion goes ahead', () => {
    expect(deletionBlocker([owner], new Map([['t1', [{ role: 'owner', status: 'active' }]]]))).toBeNull()
    expect(deletionBlocker([{ ...owner, role: 'member' }], new Map())).toBeNull()
  })
  it('an inactive co-owner does not count', () => {
    expect(deletionBlocker([owner], new Map([['t1', [{ role: 'owner', status: 'inactive' }]]]))?.code).toBe('sole_member')
  })
})

describe('closing a company', () => {
  it('deletes 30 days after the request', () => {
    expect(CLOSURE_GRACE_DAYS).toBe(30)
    expect(purgeDateFrom(new Date('2026-10-16T00:00:00Z')).toISOString()).toBe('2026-11-15T00:00:00.000Z')
  })

  it('owners only, with the company name typed back; asking twice keeps the first date', () => {
    const src = read('app/api/account/company/route.ts')
    expect(src).toContain("auth.role !== 'owner'")
    expect(src).toContain('confirm_name')
    expect(src).toContain('ignoreDuplicates: true')
  })

  it('the closure table is written by the server only', () => {
    const sql = read('supabase/migrations/433_company_closure_and_export.sql')
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.tenant_closures FROM anon, authenticated/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.purge_tenant\(UUID\) FROM PUBLIC, anon, authenticated/)
  })

  it('the daily runner calls the purge, and a failed purge fails the run', () => {
    const runner = read('scripts/cron-reminders.mjs')
    expect(runner).toContain('/api/cron/purge-closed-companies')
    expect(runner).toMatch(/invoices && tasks && purge && closed \? 0 : 1/)
  })
})

describe('purgeCompany', () => {
  it('removes files before rows, deletes only logins left with no company, never a super admin', async () => {
    vi.resetModules()
    vi.doMock('@/lib/gmail-revoke', () => ({ revokeAndForgetMailbox: async () => ({ revoked: 1, error: null }) }))
    const prev = process.env.SUPER_ADMIN_EMAILS
    process.env.SUPER_ADMIN_EMAILS = 'boss@autoura.test'
    const { purgeCompany } = await import('@/lib/account/company-closure')

    const order: string[] = []
    const members = [{ user_id: 'solo' }, { user_id: 'elsewhere' }, { user_id: 'boss' }]
    const stillMember = new Set(['elsewhere'])
    const emails: Record<string, string> = { solo: 'solo@x.test', elsewhere: 'e@x.test', boss: 'boss@autoura.test' }
    const deleted: string[] = []
    const result = (data: unknown) => {
      const r: Record<string, unknown> = { data, error: null, count: 0 }
      const chain = new Proxy(r, {
        get: (target, key) => {
          if (key === 'then') return (res: (v: unknown) => void) => res({ data, error: null })
          if (key === 'maybeSingle') return async () => ({ data, error: null })
          return () => chain
        },
      })
      return chain
    }
    const admin = {
      from: (table: string) => ({
        select: (_cols: string, opts?: { head?: boolean }) => {
          if (table === 'tenant_members' && opts?.head) {
            return { eq: async (_c: string, id: string) => ({ count: stillMember.has(id) ? 1 : 0, error: null }) }
          }
          if (table === 'tenant_members') return result(members)
          if (table === 'tenants') return result({ company_name: 'Probe Tours' })
          if (table === 'booking_passenger_documents') return result([{ storage_path: 'b1/p1/passport.jpg' }])
          return result(null)
        },
        insert: async () => { order.push(`insert:${table}`); return { error: null } },
      }),
      storage: {
        from: (bucket: string) => ({
          list: async (folder: string) => ({
            data: bucket === 'quote-pdfs' && folder === 't1' ? [{ id: 'f', name: 'q.pdf' }] : [],
            error: null,
          }),
          remove: async (paths: string[]) => { order.push(`remove:${bucket}:${paths.join('|')}`); return { error: null } },
        }),
      },
      rpc: async (fn: string) => { order.push(`rpc:${fn}`); return { error: null } },
      auth: {
        admin: {
          getUserById: async (id: string) => ({ data: { user: { id, email: emails[id] } } }),
          deleteUser: async (id: string) => { deleted.push(id); return { error: null } },
        },
      },
    }

    const summary = await purgeCompany(admin as never, 't1')
    process.env.SUPER_ADMIN_EMAILS = prev
    vi.doUnmock('@/lib/gmail-revoke')

    const purgeAt = order.indexOf('rpc:purge_tenant')
    expect(purgeAt).toBeGreaterThan(-1)
    expect(order.indexOf('remove:quote-pdfs:t1/q.pdf')).toBeLessThan(purgeAt)
    expect(order.indexOf('remove:traveller-documents:b1/p1/passport.jpg')).toBeLessThan(purgeAt)
    expect(order[order.length - 1]).toBe('insert:company_deletions')
    expect(deleted).toEqual(['solo'])
    expect(summary.logins_deleted).toBe(1)
    expect(summary.files_removed).toBe(2)
    expect(summary.gmail_revoked).toBe(3)
  })
})
