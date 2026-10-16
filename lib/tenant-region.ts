// ============================================
// Where a company runs its trips — for AI prompts
// ============================================
// The Quote Builder's parser and the email lead detector told the model it
// worked for an operator "in Egypt" whoever the company was: a Moroccan
// operator's inquiry came back as an Egypt itinerary. The country comes from
// Settings → Organization (tenants.operating_country); blank means the prompt
// names no country at all.

export async function operatingCountryOf(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null
  try {
    const { createAdminClient } = await import('@/lib/supabase-server')
    const { data } = await createAdminClient().from('tenants').select('operating_country').eq('id', tenantId).maybeSingle()
    const c = String((data as { operating_country?: string | null } | null)?.operating_country ?? '').trim()
    return c || null
  } catch {
    return null
  }
}

/** "an Egypt" / "a Morocco" style adjective phrase, or a neutral one. */
export function regionTravelPhrase(country: string | null): string {
  return country ? `${country} travel` : 'travel'
}

export function isEgypt(country: string | null): boolean {
  return !!country && /egypt/i.test(country)
}
