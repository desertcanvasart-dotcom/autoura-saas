import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// GET /api/leads — the people who asked, outside the concierge
// ============================================
// Email sync (lib/email/create-leads), the WhatsApp webhook and the website
// enquiry form each file a person as a client with their own client_source.
// Until now they were only findable under Clients; the Leads page lists them
// beside the concierge briefs. Concierge-made clients are left out here: the
// page shows those through their brief, which carries the trip.
//
// Both stages come back — Lead and Customer (status 'active', set by the
// booking trigger, migration 352) — so the page can show who turned into a
// customer. Inactive and blocked are not leads in any sense and are left out.

const LEAD_SOURCES = ['email', 'whatsapp', 'website'] as const

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, full_name, email, phone, whatsapp, status, client_source, notes, created_at')
    .eq('tenant_id', tenant_id)
    .in('client_source', [...LEAD_SOURCES])
    .in('status', ['lead', 'prospect', 'active'])
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) {
    console.error('Error fetching leads:', error.message)
    return NextResponse.json({ success: false, error: 'Could not load leads' }, { status: 500 })
  }

  // The conversation each one came from, so the card can open it in the
  // Inbox. Latest first: the newest thread is the one worth reading.
  const ids = (clients || []).map(c => c.id)
  const conversationByClient = new Map<string, { id: string; preview: string | null; at: string | null }>()
  if (ids.length > 0) {
    const { data: convs } = await supabase
      .from('unified_conversations')
      .select('id, client_id, last_message_preview, last_message_at')
      .eq('tenant_id', tenant_id)
      .in('client_id', ids)
      .order('last_message_at', { ascending: false, nullsFirst: false })
    for (const c of convs || []) {
      if (c.client_id && !conversationByClient.has(c.client_id)) {
        conversationByClient.set(c.client_id, { id: c.id, preview: c.last_message_preview, at: c.last_message_at })
      }
    }
  }

  // The website form's own record: the page the visitor sent it from, the
  // dates and party, and what they wrote. Newest first; the card shows the
  // latest and how many there were.
  const enquiriesByClient = new Map<string, Array<Record<string, unknown>>>()
  if (ids.length > 0) {
    const { data: enqs } = await supabase
      .from('publish_enquiries')
      .select('client_id, landing_url, dates, travellers, adults, children, message, utm, language, created_at')
      .eq('tenant_id', tenant_id)
      .in('client_id', ids)
      .order('created_at', { ascending: false })
    for (const e of enqs || []) {
      if (!e.client_id) continue
      const list = enquiriesByClient.get(e.client_id) ?? []
      list.push(e)
      enquiriesByClient.set(e.client_id, list)
    }
  }

  const data = (clients || []).map(c => {
    const conv = conversationByClient.get(c.id)
    const enquiries = enquiriesByClient.get(c.id) ?? []
    return {
      ...c,
      conversation_id: conv?.id ?? null,
      last_message_preview: conv?.preview ?? null,
      last_message_at: conv?.at ?? null,
      enquiry: enquiries[0] ?? null,
      enquiry_count: enquiries.length,
    }
  })

  return NextResponse.json({ success: true, data })
}
