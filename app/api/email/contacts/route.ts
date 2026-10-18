import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { orIlikeContains } from '@/lib/postgrest-search'
import { rankSuggestions, type AddressCandidate } from '@/lib/email/address-suggestions'

// GET /api/email/contacts?q=ann&exclude=a@x.com,b@y.com
// Address suggestions for the composer's To / Cc / Bcc: people this company
// has emailed, its clients and its team — never another company's.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100)
  if (q.length < 1) return NextResponse.json({ suggestions: [] })
  const exclude = (request.nextUrl.searchParams.get('exclude') || '').split(',').filter(Boolean)
  const db = auth.supabase!
  const tenantId = auth.tenant_id!
  const like = orIlikeContains(q)

  const [conversations, clients, team] = await Promise.all([
    db.from('unified_conversations')
      .select('contact_email, contact_name, last_message_at')
      .eq('tenant_id', tenantId)
      .not('contact_email', 'is', null)
      .or(`contact_email.ilike.${like},contact_name.ilike.${like}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(25),
    db.from('clients')
      .select('email, full_name')
      .eq('tenant_id', tenantId)
      .not('email', 'is', null)
      .or(`email.ilike.${like},full_name.ilike.${like}`)
      .limit(25),
    db.from('team_members')
      .select('email, name')
      .eq('tenant_id', tenantId)
      .not('email', 'is', null)
      .or(`email.ilike.${like},name.ilike.${like}`)
      .limit(25),
  ])

  type Conv = { contact_email: string | null; contact_name: string | null; last_message_at: string | null }
  type Cli = { email: string | null; full_name: string | null }
  type Team = { email: string | null; name: string | null }
  const candidates: AddressCandidate[] = [
    ...((conversations.data ?? []) as Conv[]).map(c => ({ email: c.contact_email ?? '', name: c.contact_name, source: 'emailed' as const, lastAt: c.last_message_at })),
    ...((clients.data ?? []) as Cli[]).map(c => ({ email: c.email ?? '', name: c.full_name, source: 'client' as const })),
    ...((team.data ?? []) as Team[]).map(t => ({ email: t.email ?? '', name: t.name, source: 'team' as const })),
  ]
  return NextResponse.json({ suggestions: rankSuggestions(candidates, q, exclude) })
}
