// ============================================
// Copilot — the RATES block an email draft may quote from
// ============================================
// The email copilot quotes only prices it is handed. This builds what it is
// handed, for the tours an enquiry concerns (lib/copilot-match.ts):
//
//   Tour: <name> (template <id>)
//   Public rate, per person, EUR, lowest season: 2 pax 95 · 3 pax 82 · 4 pax 74 · 5–6 pax 66 · 7–8 pax 61
//   Date-specific (13 Mar 2027, 4 pax): 78
//
// The public line is the tour's ONE approved public rate (publish_pages
// .public_rate, lib/publish/public-rate.ts) — never the engine's live answer,
// which is nationality-specific. No approved rate = no lines for that tour.
//
// The date-specific line is the engine for that date and party, on both
// nationality bases, keeping the HIGHER — the same rule runEngine applies to
// the public rate, at the approved rate's tier and the house margin.
//
// A per-car pickup surcharge line is not written: no setting for one exists
// in Autoura yet, and the system prompt treats a missing line as unavailable.

import { calculateAutoPricing } from '@/lib/auto-pricing-service'
import { houseMarginPercent, priceFor, readSavedRate, type Band } from '@/lib/publish/public-rate'

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/** The party sizes the public line lists. */
export const RATE_PAX = [2, 3, 4, 5, 6, 7, 8] as const

/** A whole number stays whole; anything else keeps two decimals. */
export function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/**
 * The listed party sizes with their per-person price, adjacent identical
 * prices joined into a range ("5–6 pax 66"). A size outside the bands is
 * left out, and a gap breaks a range.
 */
export function paxPriceRuns(bands: Band[], paxList: readonly number[] = RATE_PAX): Array<{ from: number; to: number; price: number }> {
  const runs: Array<{ from: number; to: number; price: number }> = []
  for (const pax of paxList) {
    const price = priceFor(bands, pax)
    if (price === null) continue
    const last = runs[runs.length - 1]
    if (last && last.price === price && last.to === pax - 1) last.to = pax
    else runs.push({ from: pax, to: pax, price })
  }
  return runs
}

export function publicRateLine(currency: string, bands: Band[]): string | null {
  const runs = paxPriceRuns(bands)
  if (!runs.length) return null
  const parts = runs.map(r => `${r.from === r.to ? r.from : `${r.from}–${r.to}`} pax ${formatAmount(r.price)}`)
  return `Public rate, per person, ${currency}, lowest season: ${parts.join(' · ')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 2027-03-13 → "13 Mar 2027". */
export function formatRateDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

/**
 * The per-person price for a date and party, both nationality bases, the
 * higher kept — null when either basis does not price completely (a figure
 * from one basis alone could sell below cost).
 */
export async function publicRateForDate(db: Db, input: {
  tenantId: string
  templateId: string
  tier: string
  travelDate: string
  pax: number
  /** Injected in tests; the engine otherwise. */
  price?: typeof calculateAutoPricing
}): Promise<{ perPerson: number; currency: string } | null> {
  const price = input.price ?? calculateAutoPricing
  const marginPercent = await houseMarginPercent(db, input.tenantId)
  const base = {
    templateId: input.templateId, tenantId: input.tenantId, tier: input.tier,
    numPax: input.pax, travelDate: input.travelDate, marginPercent,
  }
  const [eu, other] = await Promise.all([
    price({ ...base, isEurPassport: true }),
    price({ ...base, isEurPassport: false }),
  ])
  const ok = (r: Awaited<ReturnType<typeof calculateAutoPricing>>) =>
    r && r.success && r.complete && Number.isFinite(r.pricePerPerson) && r.pricePerPerson > 0
  if (!ok(eu) || !ok(other)) return null
  if (eu.currency !== other.currency) return null
  return { perPerson: Math.max(eu.pricePerPerson, other.pricePerPerson), currency: eu.currency }
}

/**
 * The RATES block for these tours — '' when none has an approved public rate.
 * A tour that cannot be read is left out, never guessed.
 */
export async function buildRatesBlock(db: Db, input: {
  tenantId: string
  templateIds: string[]
  travelDate?: string | null
  pax?: number | null
  price?: typeof calculateAutoPricing
}): Promise<string> {
  const blocks: string[] = []
  for (const templateId of [...new Set(input.templateIds)].slice(0, 3)) {
    try {
      const [{ data: template }, { data: page }] = await Promise.all([
        db.from('tour_templates').select('id, template_name')
          .eq('id', templateId).eq('tenant_id', input.tenantId).maybeSingle(),
        db.from('publish_pages').select('public_rate, public_rate_approved_at')
          .eq('tenant_id', input.tenantId).eq('tour_template_id', templateId)
          .not('public_rate_approved_at', 'is', null)
          .order('public_rate_approved_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (!template) continue
      const saved = page?.public_rate_approved_at ? readSavedRate(page.public_rate) : null
      if (!saved) continue
      const publicLine = publicRateLine(saved.currency, saved.bands)
      if (!publicLine) continue

      const lines = [`Tour: ${template.template_name} (template ${templateId})`, publicLine]
      if (input.travelDate && input.pax && input.pax > 0) {
        try {
          const dated = await publicRateForDate(db, {
            tenantId: input.tenantId, templateId, tier: saved.tier,
            travelDate: input.travelDate, pax: input.pax, price: input.price,
          })
          if (dated && dated.currency === saved.currency) {
            lines.push(`Date-specific (${formatRateDate(input.travelDate)}, ${input.pax} pax): ${formatAmount(dated.perPerson)}`)
          }
        } catch (err) {
          console.error('[copilot-rates] date-specific price failed:', err instanceof Error ? err.message : err)
        }
      }
      blocks.push(lines.join('\n'))
    } catch (err) {
      console.error('[copilot-rates] tour left out of RATES:', templateId, err instanceof Error ? err.message : err)
    }
  }
  return blocks.join('\n\n')
}
