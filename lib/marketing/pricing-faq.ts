// ============================================
// The pricing page's questions — one list, two readers
// ============================================
// Rendered by the pricing page and published as FAQPage structured data by
// the pricing layout. Both read this list, so the schema can never say
// something the page does not.

import { TRIAL_DAYS } from '@/lib/pricing-config'

export const PRICING_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What happens when I hit a limit?',
    a: `Nothing disappears. Team members and B2B partners stop at the plan limit — you add a seat by upgrading. Itineraries and AI generations are softer: you get a warning at 80%, you keep working past 100%, and only well beyond it does creation pause. Everything you have already created stays fully available and editable at every point.`,
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes, in either direction. Moving down while over a limit does not delete anything — your records stay exactly as they are, you simply cannot create more until you are back under the limit or move up again.',
  },
  {
    q: 'What does onboarding involve?',
    a: 'The work is your rate sheets. Hotels, cruises, guides, transport, entrance fees — the numbers you already keep in spreadsheets get loaded so the pricing engine can quote from them. That is what makes a quote calculated rather than estimated, and it is the part worth doing carefully.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: `No. The ${TRIAL_DAYS}-day trial runs without one.`,
  },
  {
    q: 'Why do Agency and Enterprise not show a price?',
    a: 'Because they are shaped around how you work — how many brands, how much volume, what your onboarding needs to cover. A conversation gets you a straight answer faster than a table would.',
  },
]
