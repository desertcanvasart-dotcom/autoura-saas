// ============================================
// Re-derive a supplier bill's match from what is linked to it
// ============================================
// Shared by the match route and the dispute route's "resolve".

import type { SupabaseClient } from '@supabase/supabase-js'
import { MATCHABLE, matchState } from '@/lib/supplier-invoices/match-state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recomputeMatch(supabase: SupabaseClient<any, any, any>, id: string) {
  const { data: invoice } = await supabase.from('supplier_invoices').select('amount').eq('id', id).single()
  const { data: matches } = await supabase.from('supplier_invoice_expenses').select('matched_amount').eq('supplier_invoice_id', id)
  const state = matchState(invoice?.amount, (matches || []).map((m: { matched_amount: unknown }) => m.matched_amount))
  // Guarded on the status too: a bill approved or disputed meanwhile keeps it.
  const { error } = await supabase.from('supplier_invoices').update({
    ...state,
    updated_at: new Date().toISOString(),
  }).eq('id', id).in('status', MATCHABLE)
  if (error) console.error('[supplier-invoices] recompute match:', error.message)

  return { matched_amount: state.matched_amount, discrepancy_amount: state.discrepancy_amount, match_status: state.match_status, error: error?.message ?? null }
}
