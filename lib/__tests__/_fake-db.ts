// A small in-memory stand-in for the supabase-js query builder: enough for
// routes that select / insert / update with eq, in, lt, lte, gte, order and
// limit, awaited directly or via single / maybeSingle. Filters apply to both
// reads and writes, so "update … where status = 'pending'" claims a row only
// once, as the database would.

type Row = Record<string, unknown>

export function fakeDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(initial)) tables[k] = v.map(r => ({ ...r }))
  let idSeq = 0

  function from(table: string) {
    const rows = (tables[table] ||= [])
    const filters: Array<(r: Row) => boolean> = []
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
    let patch: Row = {}
    let inserted: Row[] = []
    let limitN: number | null = null
    let order: { col: string; asc: boolean } | null = null

    const run = (): { data: unknown; error: null } => {
      if (op === 'insert') return { data: inserted, error: null }
      let hit = rows.filter(r => filters.every(f => f(r)))
      if (op === 'update') {
        for (const r of hit) Object.assign(r, patch)
      } else if (op === 'delete') {
        tables[table] = rows.filter(r => !hit.includes(r))
      }
      if (order) {
        const { col, asc } = order
        hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
      }
      if (limitN !== null) hit = hit.slice(0, limitN)
      return { data: hit.map(r => ({ ...r })), error: null }
    }

    const q: Record<string, unknown> = {
      select: () => q,
      insert: (r: Row | Row[]) => {
        op = 'insert'
        inserted = (Array.isArray(r) ? r : [r]).map(x => ({ id: `id-${++idSeq}`, ...x }))
        rows.push(...inserted)
        return q
      },
      update: (p: Row) => { op = 'update'; patch = p; return q },
      delete: () => { op = 'delete'; return q },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
      neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return q },
      in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return q },
      lt: (c: string, v: string) => { filters.push(r => r[c] != null && String(r[c]) < v); return q },
      lte: (c: string, v: string) => { filters.push(r => r[c] != null && String(r[c]) <= v); return q },
      gte: (c: string, v: string) => { filters.push(r => r[c] != null && String(r[c]) >= v); return q },
      is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return q },
      order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return q },
      limit: (n: number) => { limitN = n; return q },
      single: async () => { const { data } = run(); const a = data as Row[]; return { data: a[0] ?? null, error: a[0] ? null : { message: 'no rows' } } },
      maybeSingle: async () => { const { data } = run(); return { data: (data as Row[])[0] ?? null, error: null } },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return q
  }
  return { from, tables }
}
