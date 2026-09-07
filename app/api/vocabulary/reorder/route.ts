// POST /api/vocabulary/reorder — { kind, ids: [...] } sets rank 1..n in the
// given order. Admin-only; RLS keeps the update inside the caller's tenant,
// and the kind filter keeps a stray id from another list untouched.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { isVocabularyKind } from '@/lib/vocabulary'
import { WRITE_ROLES, WRITE_DENIED } from '../route'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, role } = auth
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: WRITE_DENIED }, { status: 403 })

    const body = await request.json().catch(() => ({})) as { kind?: unknown; ids?: unknown }
    if (!isVocabularyKind(body.kind)) return NextResponse.json({ success: false, error: 'Unknown vocabulary kind' }, { status: 400 })
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (ids.length === 0) return NextResponse.json({ success: false, error: 'ids are required' }, { status: 400 })

    const now = new Date().toISOString()
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from('tenant_vocabularies')
        .update({ rank: i + 1, updated_at: now })
        .eq('id', ids[i])
        .eq('kind', body.kind)
      if (error) throw error
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('reorder vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
