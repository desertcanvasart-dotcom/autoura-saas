// ============================================
// Copilot context builder — assembles the client snapshot shown in the
// review panel's context card (client + recent itineraries / invoices /
// payments). Read-only; each section is independently fault-tolerant so a
// schema difference in one table never blanks the whole card.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CopilotContext,
  CopilotContextClient,
  CopilotContextItinerary,
  CopilotContextInvoice,
  CopilotContextPayment,
} from '@/app/types/copilot'

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function buildCopilotContext(
  supabase: SupabaseClient,
  clientId: string | null
): Promise<CopilotContext> {
  const empty: CopilotContext = { client: null, itineraries: [], invoices: [], payments: [] }
  if (!clientId) return empty

  // --- client ---
  let client: CopilotContextClient | null = null
  try {
    const { data } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle()
    if (data) {
      const c = data as any
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.full_name || c.name || null
      client = {
        id: c.id,
        name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        nationality: c.nationality ?? null,
        language: c.preferred_language ?? c.language ?? null,
        vip: !!c.vip_status,
      }
    }
  } catch { /* non-blocking */ }

  // --- recent itineraries ---
  let itineraries: CopilotContextItinerary[] = []
  try {
    const { data } = await supabase
      .from('itineraries')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(3)
    itineraries = (data || []).map((i: any) => ({
      reference: i.itinerary_code ?? null,
      trip_name: i.trip_name ?? null,
      start_date: i.start_date ?? null,
      end_date: i.end_date ?? null,
      status: i.status ?? null,
      total: num(i.total_cost),
      currency: i.currency ?? null,
    }))
  } catch { /* non-blocking */ }

  // --- recent invoices (AR / client invoices) ---
  let invoices: CopilotContextInvoice[] = []
  try {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5)
    invoices = (data || []).map((v: any) => ({
      number: v.invoice_number ?? null,
      total: num(v.total_amount ?? v.amount ?? v.total),
      status: v.status ?? null,
      due_date: v.due_date ?? null,
    }))
  } catch { /* non-blocking */ }

  // --- recent payments ---
  let payments: CopilotContextPayment[] = []
  try {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5)
    payments = (data || []).map((p: any) => ({
      amount: num(p.amount),
      currency: p.currency ?? null,
      status: p.status ?? null,
      date: p.paid_at ?? p.payment_date ?? p.created_at ?? null,
    }))
  } catch { /* non-blocking */ }

  return { client, itineraries, invoices, payments }
}
