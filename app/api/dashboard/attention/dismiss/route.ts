import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// "Needs attention", dismissed (migration 397)
// ============================================
// POST   { key, fingerprint }  — hide this row while its state holds
// DELETE { key }               — undo: show it again
//
// The key and fingerprint come from lib/dashboard/attention.ts, computed on
// the item the panel was shown. A fingerprint that no longer matches the
// item's state simply stops hiding it, so a stale or forged one can only
// ever show the operator their own row again. RLS scopes every write to the
// caller's tenant; the panel is the office's shared list, so a dismissal is
// tenant-wide.

const MAX_KEY = 500
const MAX_FINGERPRINT = 2000

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({} as Record<string, unknown>))
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const body = await readBody(request)
  const key = typeof body.key === 'string' ? body.key : ''
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : ''
  if (!key || key.length > MAX_KEY || fingerprint.length > MAX_FINGERPRINT) {
    return NextResponse.json({ success: false, error: 'A valid item key is required' }, { status: 400 })
  }

  const { error } = await auth.supabase!
    .from('dashboard_attention_dismissals')
    .upsert(
      {
        tenant_id: auth.tenant_id!,
        item_key: key,
        fingerprint,
        dismissed_by: auth.user!.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,item_key' }
    )

  if (error) {
    console.error('attention dismiss failed:', error.message)
    return NextResponse.json({ success: false, error: 'Could not dismiss this item' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const body = await readBody(request)
  const key = typeof body.key === 'string' ? body.key : ''
  if (!key || key.length > MAX_KEY) {
    return NextResponse.json({ success: false, error: 'A valid item key is required' }, { status: 400 })
  }

  const { error } = await auth.supabase!
    .from('dashboard_attention_dismissals')
    .delete()
    .eq('tenant_id', auth.tenant_id!)
    .eq('item_key', key)

  if (error) {
    console.error('attention undismiss failed:', error.message)
    return NextResponse.json({ success: false, error: 'Could not restore this item' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
