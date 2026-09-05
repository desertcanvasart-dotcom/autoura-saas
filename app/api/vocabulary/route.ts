// ============================================
// /api/vocabulary — the agency's own words (migration 334)
// ============================================
// GET  — every entry of every kind for the caller's tenant (hidden included;
//        the hook filters). Feeds all dropdowns, one fetch per session.
// POST — add an entry { kind, label, key?, description?, behavior?, meta? }
//
// Reads are for any signed-in user; writes are admin-only, like the
// destination manager. RLS scopes everything to the caller's tenant.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import type { Json } from '@/types/database.types'
import {
  isVocabularyKind,
  nextRank,
  slugifyKey,
  uniqueKey,
  validateVocabularyItem,
  KEY_PATTERN,
} from '@/lib/vocabulary'

export const dynamic = 'force-dynamic'

export const WRITE_ROLES = ['admin']
export const COLS = 'id, tenant_id, kind, key, label, description, behavior, rank, meta, is_active, created_at, updated_at'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase } = auth
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { data, error } = await supabase
      .from('tenant_vocabularies')
      .select(COLS)
      .order('kind')
      .order('rank')
      .order('label')
    if (error) {
      // 42P01 = migration 334 not applied: empty, and every form keeps its
      // built-in list.
      if (error.code === '42P01') return NextResponse.json({ success: true, data: [] })
      throw error
    }
    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    console.error('GET vocabulary error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load vocabulary' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const kind = String(body.kind ?? '')
    if (!isVocabularyKind(kind)) return NextResponse.json({ success: false, error: 'Unknown vocabulary kind' }, { status: 400 })
    const label = String(body.label ?? '').trim()

    const { data: existing, error: readError } = await supabase
      .from('tenant_vocabularies')
      .select('id, key, rank, is_active')
      .eq('kind', kind)
    if (readError) throw readError

    // The key: the caller's, or derived from the label; unique within the kind.
    const requested = String(body.key ?? '').trim()
    const base = requested ? requested : slugifyKey(label)
    if (requested && !KEY_PATTERN.test(requested)) {
      return NextResponse.json({ success: false, error: 'The key must be lowercase letters, digits and underscores' }, { status: 400 })
    }
    const key = requested ? requested : uniqueKey(base, (existing ?? []).map(e => e.key))
    if (requested && (existing ?? []).some(e => e.key === requested)) {
      return NextResponse.json({ success: false, error: `"${requested}" is already used in this list` }, { status: 409 })
    }

    const behavior = kind === 'supplier_type' ? String(body.behavior ?? '') || null : null
    const meta = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) ? body.meta as Record<string, unknown> : {}
    const verdict = validateVocabularyItem({ kind, key, label, behavior, meta })
    if (!verdict.ok) return NextResponse.json({ success: false, error: verdict.error }, { status: 400 })

    const { data, error } = await supabase
      .from('tenant_vocabularies')
      .insert({
        tenant_id,
        kind,
        key,
        label,
        description: String(body.description ?? '').trim() || null,
        behavior,
        // Validated above as a plain object; the generated column type is Json.
        meta: meta as Json,
        rank: nextRank(existing ?? []),
        is_active: true,
      })
      .select(COLS)
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, error: `"${key}" is already used in this list` }, { status: 409 })
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
