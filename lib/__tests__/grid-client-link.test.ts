import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveGridClient, escapeLike, phoneVariants, splitName } from '@/lib/grid-client-link'

// Minimal in-memory Supabase: the query shapes resolveGridClient uses —
// eq / ilike / in / is filters, limit, maybeSingle / single, insert, update.
type Row = Record<string, unknown>
function fakeSupabase(seed: Record<string, Row[]>) {
  const store: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(seed)) store[k] = v.map(r => ({ ...r }))
  let seq = 0
  const likeToRegex = (p: string) =>
    new RegExp('^' + p.replace(/\\([\\%_])|([%_])|([.*+?^${}()|[\]])/g,
      (_m, esc, wild, rx) => esc ? `\\${esc}` : wild ? (wild === '%' ? '.*' : '.') : `\\${rx}`) + '$', 'i')
  class Q {
    filters: ((r: Row) => boolean)[] = []
    op: 'select' | 'insert' | 'update' = 'select'
    payload: Row | null = null
    constructor(public table: string) { store[table] ??= [] }
    select() { return this }
    insert(r: Row) { this.op = 'insert'; this.payload = r; return this }
    update(r: Row) { this.op = 'update'; this.payload = r; return this }
    eq(c: string, v: unknown) { this.filters.push(r => String(r[c]) === String(v)); return this }
    ilike(c: string, p: string) { const re = likeToRegex(p); this.filters.push(r => re.test(String(r[c] ?? ''))); return this }
    in(c: string, vs: unknown[]) { this.filters.push(r => vs.includes(r[c])); return this }
    is(c: string, v: unknown) { this.filters.push(r => (r[c] ?? null) === v); return this }
    limit() { return this }
    private run() {
      if (this.op === 'insert') {
        const row = { id: `${this.table}-${++seq}`, ...this.payload }
        store[this.table].push(row)
        return { data: row, error: null }
      }
      const rows = store[this.table].filter(r => this.filters.every(f => f(r)))
      if (this.op === 'update') rows.forEach(r => Object.assign(r, this.payload))
      return { data: rows, error: null }
    }
    maybeSingle() { const { data } = this.run(); return Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }) }
    single() { return this.maybeSingle() }
    then<A, B = never>(res?: (v: { data: unknown; error: null }) => A, rej?: (e: unknown) => B) { return Promise.resolve(this.run()).then(res, rej) }
  }
  return { store, client: { from: (t: string) => new Q(t) } as unknown as SupabaseClient }
}

const T = 'tenant-a'
const seed = () => ({
  clients: [
    { id: 'c-anna', tenant_id: T, email: 'Anna_B@Example.com', phone: '+201001112222' },
    { id: 'c-other-tenant', tenant_id: 'tenant-b', email: 'bob@example.com', phone: '+441234' },
  ],
  whatsapp_conversations: [
    { id: 'wa-1', tenant_id: T, phone_number: '201009998888', client_id: null },
  ],
})

describe('resolveGridClient — which CRM client a grid save lands on', () => {
  it('uses the client the grid was opened for', async () => {
    const { client } = fakeSupabase(seed())
    const r = await resolveGridClient(client, T, { clientId: 'c-anna', allowCreate: true })
    expect(r).toEqual({ clientId: 'c-anna', how: 'given' })
  })

  it("ignores another tenant's client id and matches by details instead", async () => {
    const { client } = fakeSupabase(seed())
    const r = await resolveGridClient(client, T, { clientId: 'c-other-tenant', email: 'bob@example.com', allowCreate: false })
    expect(r).toEqual({ clientId: null, how: 'none' })
  })

  it('matches email case-insensitively, and _ is not a wildcard', async () => {
    const { client } = fakeSupabase(seed())
    expect(await resolveGridClient(client, T, { email: 'anna_b@example.COM', allowCreate: true }))
      .toEqual({ clientId: 'c-anna', how: 'email' })
    // "annaxb" would match an unescaped anna_b pattern
    const r = await resolveGridClient(client, T, { email: 'annaXb@example.com', allowCreate: false })
    expect(r.how).toBe('none')
  })

  it('matches a phone with or without the leading +', async () => {
    const { client } = fakeSupabase(seed())
    expect(await resolveGridClient(client, T, { phone: '201001112222', allowCreate: true }))
      .toEqual({ clientId: 'c-anna', how: 'phone' })
  })

  it('creates a Lead for a new traveller, and links their WhatsApp chat', async () => {
    const { client, store } = fakeSupabase(seed())
    const r = await resolveGridClient(client, T, {
      name: 'Maria  de la Cruz', phone: '+201009998888', source: 'whatsapp', allowCreate: true,
    })
    expect(r.how).toBe('created')
    const lead = store.clients.find(c => c.id === r.clientId)!
    expect(lead).toMatchObject({
      tenant_id: T, first_name: 'Maria', last_name: 'de la Cruz', full_name: 'Maria de la Cruz',
      status: 'lead', client_source: 'whatsapp', phone: '+201009998888', email: null,
    })
    expect(store.whatsapp_conversations[0].client_id).toBe(r.clientId)
  })

  it('never creates for B2B, without a name, or without a way to reach them', async () => {
    const { client, store } = fakeSupabase(seed())
    for (const who of [
      { name: 'Partner Guest', email: 'g@x.com', allowCreate: false },
      { email: 'g@x.com', allowCreate: true },
      { name: 'No Contact', allowCreate: true },
    ]) {
      expect((await resolveGridClient(client, T, who)).how).toBe('none')
    }
    expect(store.clients).toHaveLength(2)
  })
})

describe('helpers', () => {
  it('escapeLike escapes LIKE wildcards', () => {
    expect(escapeLike('a_b%c\\d')).toBe('a\\_b\\%c\\\\d')
  })
  it('phoneVariants strips formatting and yields both spellings', () => {
    expect(phoneVariants('+20 (100) 111-2222')).toEqual(['+201001112222', '201001112222'])
    expect(phoneVariants('')).toEqual([])
  })
  it('splitName repeats a single name as the last name (DB needs both)', () => {
    expect(splitName('Cher')).toEqual({ first_name: 'Cher', last_name: 'Cher' })
  })
})
