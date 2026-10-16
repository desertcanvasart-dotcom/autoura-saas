// Addresses Resend reported as bounced or complained (migration 437,
// app/api/webhooks/resend). Mail to them is not sent again.

import { createAdminClient } from '@/lib/supabase-server'

export const normaliseAddress = (a: string) => a.trim().toLowerCase()

/** Which of these addresses are suppressed. Fails open: if the table cannot
 *  be read, nothing is withheld (a send is not blocked by our own outage). */
export async function suppressedAmong(addresses: string[]): Promise<Set<string>> {
  const wanted = [...new Set(addresses.map(normaliseAddress).filter(Boolean))]
  if (wanted.length === 0) return new Set()
  try {
    const { data, error } = await createAdminClient()
      .from('email_suppressions')
      .select('email')
      .in('email', wanted)
    if (error) return new Set()
    return new Set((data ?? []).map(r => r.email))
  } catch {
    return new Set()
  }
}

export async function suppressAddress(email: string, reason: 'bounced' | 'complained', detail: string | null): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await createAdminClient()
    .from('email_suppressions')
    .upsert({ email: normaliseAddress(email), reason, detail, last_event_at: now }, { onConflict: 'email' })
  if (error) throw new Error(error.message)
}
