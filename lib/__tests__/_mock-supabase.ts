// In-memory Supabase mock for hermetic pricing-engine tests.
//
// Reproduces just enough of the supabase-js query builder for
// lib/auto-pricing-service.ts: from/select/eq/ilike/contains/or/order/limit
// plus the terminal forms (.single(), .maybeSingle(), and awaiting the
// builder directly -> { data: rows[], error }).
//
// Tests set the dataset with setMockTables({ table: rows }) before invoking
// the engine. See docs/PRICING-HARNESS-PLAN.md (Layer 0).

type Row = Record<string, any>
export type MockTables = Record<string, Row[]>

let currentTables: MockTables = {}

/** Install the dataset the next engine call will read from. */
export function setMockTables(tables: MockTables): void {
  currentTables = tables
}

// Parse a PostgREST `.or()` expression like "direction.eq.arrival,direction.eq.both"
// or "tenant_id.eq.X,tenant_id.is.null" and keep rows matching ANY clause.
// `is.null` matches null AND absent columns — fixture rows carry no tenant_id,
// which mirrors prod's global catalog rows (tenant_id IS NULL).
function applyOr(rows: Row[], expr: string): Row[] {
  const clauses = expr.split(',').map((c) => {
    const [col, op, ...rest] = c.split('.')
    return { col, op, val: rest.join('.') }
  })
  return rows.filter((r) =>
    clauses.some((cl) =>
      (cl.op === 'eq' && String(r[cl.col]) === cl.val) ||
      (cl.op === 'is' && cl.val === 'null' && r[cl.col] == null)
    )
  )
}

function makeQuery(rows: Row[]) {
  let filtered = [...rows]

  const builder: any = {
    select() {
      return builder
    },
    eq(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] === val)
      return builder
    },
    ilike(col: string, pattern: string) {
      const needle = String(pattern).replace(/%/g, '').toLowerCase()
      filtered = filtered.filter((r) =>
        String(r[col] ?? '').toLowerCase().includes(needle)
      )
      return builder
    },
    contains(col: string, arr: any[]) {
      filtered = filtered.filter(
        (r) => Array.isArray(r[col]) && arr.every((a) => r[col].includes(a))
      )
      return builder
    },
    or(expr: string) {
      filtered = applyOr(filtered, expr)
      return builder
    },
    order(col: string, opts: { ascending?: boolean } = {}) {
      const asc = opts.ascending !== false
      filtered = [...filtered].sort((a, b) => {
        const av = a[col]
        const bv = b[col]
        if (av === bv) return 0
        const cmp = av > bv ? 1 : -1
        return asc ? cmp : -cmp
      })
      return builder
    },
    limit(n: number) {
      filtered = filtered.slice(0, n)
      return builder
    },
    single() {
      return Promise.resolve(
        filtered.length
          ? { data: filtered[0], error: null }
          : { data: null, error: { message: 'No rows found' } }
      )
    },
    maybeSingle() {
      return Promise.resolve({ data: filtered[0] ?? null, error: null })
    },
    // Make the builder awaitable: `await query` -> { data: rows[], error: null }
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve({ data: filtered, error: null }).then(
        onFulfilled,
        onRejected
      )
    },
  }

  return builder
}

/** Drop-in replacement for supabase-js `createClient`. */
export function createMockClient() {
  return {
    from: (table: string) => makeQuery(currentTables[table] ?? []),
  }
}
