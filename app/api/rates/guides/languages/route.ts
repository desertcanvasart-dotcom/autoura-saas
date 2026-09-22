// GET /api/rates/guides/languages — the agency's guide languages (Settings →
// Vocabulary), each with whether a guide rate exists for it. For the
// calculator's language picker (sibling #459): a language with no rate is
// shown but cannot be chosen, so a quote is never asked for a guide the
// agency cannot price.
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { loadVocabulary } from '@/lib/vocabulary-server'
import { languagesWithRates } from '@/lib/guides/guide-language'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { supabase } = auth
  const [items, { data: rows, error }] = await Promise.all([
    loadVocabulary(supabase, 'guide_language'),
    supabase.from('guide_rates').select('id, guide_language, city, full_day_rate, base_rate_eur').eq('is_active', true),
  ])
  if (error) return NextResponse.json({ success: false, error: 'Could not read the guide rates' }, { status: 500 })
  return NextResponse.json({ success: true, data: languagesWithRates(items.filter(i => i.is_active).map(i => ({ key: i.key, label: i.label })), rows ?? []) })
}
