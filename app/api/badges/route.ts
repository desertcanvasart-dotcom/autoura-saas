import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET /api/badges
// The counts the sidebar badges: WhatsApp messages nobody has read yet, and
// concierge leads still waiting for review. Both are the tenant's, not the
// user's — anyone on the team can pick them up. (The email count is per user,
// from their own Gmail: POST /api/gmail/poll.)
//
// Each count matches what its page shows: WhatsApp counts active, un-hidden
// conversations (the list's default view); concierge counts the "Needs review"
// tab. A count that can't be read comes back null — the badge hides — never 0.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth

  const [wa, cb] = await Promise.all([
    supabase
      .from('whatsapp_conversations')
      .select('unread_count')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')
      .or('is_hidden.is.null,is_hidden.eq.false')
      .gt('unread_count', 0),
    supabase
      .from('concierge_briefs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('review_status', 'needs_review'),
  ])

  if (wa.error) console.error('badges: whatsapp count failed:', wa.error.message)
  if (cb.error) console.error('badges: concierge count failed:', cb.error.message)

  return NextResponse.json({
    whatsappUnread: wa.error
      ? null
      : (wa.data ?? []).reduce((sum, c) => sum + (c.unread_count || 0), 0),
    conciergeNew: cb.error ? null : cb.count ?? 0,
  })
}
