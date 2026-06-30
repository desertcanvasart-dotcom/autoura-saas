// Write-recording in-memory Supabase fake for tests.
//
// The repo's _mock-supabase.ts is read-only (built for the pricing engine).
// This one RECORDS inserts/updates in `store` so a test can assert exactly
// what was written, and serves seeded `select().eq()` reads. It enforces no
// constraints/RLS — deliberately minimal, just enough for the query shapes our
// modules use: `from(t).insert(row).select().single()`, bare `from(t).insert(row)`
// (awaited), `from(t).select('*').eq(col,val)` (awaited), `update().eq()`, and
// `single()/maybeSingle()`.

type Row = Record<string, any>

export function makeWriteMockSupabase(seed: Record<string, Row[]> = {}) {
  const store: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(seed)) store[k] = v.map((r) => ({ ...r }))

  let idSeq = 0
  const nextId = (t: string) => `${t}-${++idSeq}`

  class Query {
    table: string
    filters: [string, any][] = []
    op: 'select' | 'insert' | 'update' = 'select'
    payload: Row | null = null
    wantCount = false
    constructor(table: string) {
      this.table = table
      if (!store[table]) store[table] = []
    }
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.count) this.wantCount = true
      return this
    }
    insert(row: Row) {
      this.op = 'insert'
      this.payload = row
      return this
    }
    update(row: Row) {
      this.op = 'update'
      this.payload = row
      return this
    }
    eq(col: string, val: any) {
      this.filters.push([col, val])
      return this
    }
    private match(): Row[] {
      return store[this.table].filter((r) =>
        this.filters.every(([c, v]) => String(r[c]) === String(v))
      )
    }
    private run(): { data: any; error: any; count?: number } {
      if (this.op === 'insert') {
        const row = { id: nextId(this.table), ...this.payload }
        store[this.table].push(row)
        return { data: row, error: null }
      }
      if (this.op === 'update') {
        for (const r of this.match()) Object.assign(r, this.payload)
        return { data: null, error: null }
      }
      const matched = this.match()
      if (this.wantCount) return { data: null, error: null, count: matched.length }
      return { data: matched, error: null }
    }
    single() {
      const res = this.run()
      const row = Array.isArray(res.data) ? res.data[0] : res.data
      return Promise.resolve(
        row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      )
    }
    maybeSingle() {
      const res = this.run()
      const row = Array.isArray(res.data) ? res.data[0] ?? null : res.data
      return Promise.resolve({ data: row, error: null })
    }
    then(resolve: (v: any) => void) {
      resolve(this.run())
    }
  }

  return {
    store,
    from(table: string) {
      return new Query(table)
    },
  }
}
