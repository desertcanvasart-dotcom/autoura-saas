// Approved narrative, with each fact slot filled from today's facts. The
// GetAutoura app sends only parts whose slots can be filled (lib/publish/
// narrative.ts), so a slot here always has its fact; if one ever did not,
// the whole text is dropped rather than shown with a hole in it.

import type { PageNarrative, TourFacts } from '@/lib/publish/contract'
import { countOf, t } from '../../i18n/strings'
import { formatDate, formatPrice, formatWeekdays } from './format'

type Seg = NonNullable<PageNarrative['overview']>[number]

export function slotText(slot: string, facts: TourFacts, lang: string): string | null {
  switch (slot) {
    case 'price_from': {
      const p = facts.price
      return p.status === 'available' && p.from ? `${formatPrice(p.from.perPerson, p.currency, lang)} ${t(lang, 'perPerson')}` : null
    }
    case 'duration':
      return facts.durationNights > 0
        ? `${countOf(lang, facts.durationDays, 'day')} / ${countOf(lang, facts.durationNights, 'night')}`
        : countOf(lang, facts.durationDays, 'day')
    case 'group_size': {
      const g = facts.groupSize
      if (!g || (g.min === null && g.max === null)) return null
      const n = g.min !== null && g.max !== null ? (g.min === g.max ? `${g.min}` : `${g.min}–${g.max}`) : g.max !== null ? `${t(lang, 'upTo')} ${g.max}` : `${g.min}+`
      return `${n} ${t(lang, 'travellers')}`
    }
    case 'departure_days':
      return facts.departureDays.length ? formatWeekdays(facts.departureDays, lang) : null
    case 'next_departure': {
      const next = facts.departures.find(d => d.status !== 'full')
      return next ? formatDate(next.date, lang) : null
    }
    case 'cancellation': {
      const c = facts.cancellation
      if (!c || c.tiers.length === 0) return null
      return c.tiers.map(tier => `${tier.daysBefore === 0 ? t(lang, 'onDeparture') : `${tier.daysBefore} ${t(lang, 'daysBeforeDeparture')}`}: ${tier.chargePercent}% ${t(lang, 'cancellationCharge')}`).join('; ')
    }
    default:
      return null
  }
}

/** The text of some segments, slots filled; null if any slot cannot be. */
export function narrativeText(segments: Seg[] | null | undefined, facts: TourFacts | null, lang: string): string | null {
  if (!segments || segments.length === 0 || !facts) return null
  const parts: string[] = []
  for (const s of segments) {
    if (s.type === 'text') parts.push(s.text)
    else {
      const v = slotText(s.slot, facts, lang)
      if (v === null) return null
      parts.push(v)
    }
  }
  // Join with a space, but not before punctuation the next segment starts with.
  return parts.reduce((acc, p) => (acc && !/^[,.;:!?)]/.test(p) ? `${acc} ${p}` : `${acc}${p}`), '').replace(/[ \t]+\n/g, '\n').trim()
}

/** Paragraphs, split on the blank lines the engine writes between them. */
export const paragraphs = (text: string | null): string[] => (text ? text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean) : [])
