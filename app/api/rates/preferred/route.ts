import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { clearPreferredSiblings, describeScope, isPreferredTable, PREFERRED_SCOPES } from '@/lib/rates/preferred'

// ============================================
// POST /api/rates/preferred — the star toggle
// ============================================
// { table, id, preferred } → flags ONE row as the engine's default in its
// city/tier scope, clearing the flag on its siblings first so the
// one-per-scope index (migration 354) is never tripped from the UI.

type Row = Record<string, unknown>
interface DynamicQuery {
  eq(column: string, value: unknown): DynamicQuery
  select(columns: string): DynamicQuery
  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }>
  single(): Promise<{ data: Row | null; error: { message: string } | null }>
}
interface DynamicClient {
  from(table: string): {
    select(columns: string): DynamicQuery
    update(values: Row): DynamicQuery
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { table, id, preferred } = body as { table?: unknown; id?: unknown; preferred?: unknown }
    if (!isPreferredTable(table)) return NextResponse.json({ success: false, error: 'Unknown rate table' }, { status: 400 })
    if (typeof id !== 'string' || !id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    if (typeof preferred !== 'boolean') return NextResponse.json({ success: false, error: 'preferred must be true or false' }, { status: 400 })

    const scope = PREFERRED_SCOPES[table]
    // The table is chosen at runtime from an allowlist, so the typed client's
    // per-table overloads cannot apply — a minimal structural view instead.
    const db = supabase as unknown as DynamicClient
    const { data: row, error: readError } = await db
      .from(table)
      .select(['id', 'tenant_id', scope.nameColumn, ...scope.columns].join(', '))
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()
    if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 })
    // Global catalog rows (tenant_id NULL) are read-only for tenants — a
    // preference on them is not the tenant's to set.
    if (!row) return NextResponse.json({ success: false, error: 'Rate not found in your workspace' }, { status: 404 })

    if (preferred) {
      const cleared = await clearPreferredSiblings(supabase, table, tenant_id, row, id)
      if (cleared.error) return NextResponse.json({ success: false, error: cleared.error }, { status: 500 })
    }

    const { data, error } = await db
      .from(table)
      .update({ is_preferred: preferred, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select('id, is_preferred')
      .single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      data,
      name: row[scope.nameColumn] ?? null,
      scope: describeScope(table, row),
    })
  } catch (err) {
    console.error('[rates/preferred]', err)
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
