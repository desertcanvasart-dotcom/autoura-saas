// POST /api/vocabulary/reset — { kind } returns one kind to the Egypt preset
// for the caller's tenant (reset_tenant_vocabulary, migration 334: deletes
// the tenant's entries of that kind and reseeds). Admin-only.

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

    const body = await request.json().catch(() => ({})) as { kind?: unknown }
    if (!isVocabularyKind(body.kind)) return NextResponse.json({ success: false, error: 'Unknown vocabulary kind' }, { status: 400 })

    const { data, error } = await supabase.rpc('reset_tenant_vocabulary', { p_kind: body.kind })
    if (error) throw error
    return NextResponse.json({ success: true, data: { seeded: data } })
  } catch (error) {
    console.error('reset vocabulary error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
