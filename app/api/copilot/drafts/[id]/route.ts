// PATCH /api/copilot/drafts/[id] — approve | reject a draft (saving any edits).
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

type Action = 'approve' | 'reject'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const action: Action | undefined = body.action
    const edited_body: string | undefined = body.edited_body
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'action must be approve | reject' }, { status: 400 })
    }

    const { data: draft, error: dErr } = await supabase
      .from('communication_drafts')
      .select('id, tenant_id, status')
      .eq('id', id)
      .single()
    if (dErr || !draft || draft.tenant_id !== tenant_id) {
      return NextResponse.json({ success: false, error: 'Draft not found' }, { status: 404 })
    }
    if (draft.status === 'sent') {
      return NextResponse.json({ success: false, error: 'Draft already sent' }, { status: 409 })
    }

    const nowIso = new Date().toISOString()
    const patch: Record<string, any> = {
      reviewed_by: user.id,
      reviewed_at: nowIso,
      status: action === 'approve' ? 'approved' : 'rejected',
    }
    if (action === 'approve' && edited_body && edited_body.trim()) {
      patch.edited_body = edited_body.trim()
      patch.was_edited = true
    }

    const { data: updated, error: uErr } = await supabase
      .from('communication_drafts')
      .update(patch)
      .eq('id', id)
      .select('id, status, edited_body, was_edited, reviewed_at')
      .single()
    if (uErr) {
      return NextResponse.json({ success: false, error: uErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, draft: updated })
  } catch (e: any) {
    console.error('copilot draft PATCH error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
