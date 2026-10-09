// ============================================
// What a travel contract says
// ============================================
// One source for the contract's terms, used by the contract page, its PDF
// (lib/contract-pdf-generator.ts) and the WhatsApp send. They used to
// disagree: the page let the operator edit the deposit, payment terms,
// inclusions, exclusions and cancellation terms, and the PDF printed none of
// it — a fixed "10% deposit", its own lists and no cancellation section.
//
// Nothing here names a country. Every contract said "upon arrival in Egypt",
// "Egyptologist", visas "for travel to Egypt" and arbitration "under Egyptian
// law", whoever the operator was. The country and the governing law now come
// from Settings → Organization (tenants.operating_country,
// tenants.contract_governing_law; migration 403); left blank, the sentence
// says nothing about a country.

import { formatMoney } from '@/lib/currency-totals'
import { DEFAULT_DEPOSIT_PERCENT } from '@/lib/bookings/deposit-rule'

export interface ContractSettings {
  /** Where the operator runs its trips, e.g. "Egypt". */
  operatingCountry?: string | null
  /** e.g. "Egyptian law" or "the laws of England and Wales". */
  governingLaw?: string | null
  /** Settings → Organization → deposit; the contract's default. */
  depositPercent?: number | null
}

export interface ContractTerms {
  depositPercentage: number
  paymentTerms: string
  inclusions: string[]
  exclusions: string[]
  cancellation45Days: string
  cancellation44to30Days: string
  cancellation29to15Days: string
  cancellation14to0Days: string
  flightCancellation: string
  noShowPolicy: string
  forceMajeure: string
  specialNotes: string
}

// The same default a booking's deposit falls back to, so the contract asks for
// what the booking will (it said 10% while bookings asked 30%).
export { DEFAULT_DEPOSIT_PERCENT }

const clean = (s: string | null | undefined) => (s ?? '').trim()

/** The settings as the tenant row holds them (select('*') or a narrower read). */
export function contractSettingsFromTenant(t: {
  operating_country?: string | null
  contract_governing_law?: string | null
  deposit_percent?: number | string | null
} | null | undefined): ContractSettings {
  const deposit = t?.deposit_percent
  return {
    operatingCountry: typeof t?.operating_country === 'string' ? t.operating_country : null,
    governingLaw: typeof t?.contract_governing_law === 'string' ? t.contract_governing_law : null,
    depositPercent: deposit === null || deposit === undefined || deposit === '' ? null : Number(deposit),
  }
}

export function contractDepositPercent(s: ContractSettings): number {
  const p = s.depositPercent
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100 ? p : DEFAULT_DEPOSIT_PERCENT
}

/** The default payment-terms sentence for a deposit and the operator's country. */
export function paymentTermsText(depositPercent: number, s: ContractSettings): string {
  const country = clean(s.operatingCountry)
  const balance = country
    ? `The remaining balance is to be paid upon arrival in ${country}.`
    : 'The remaining balance is to be paid before the tour starts.'
  return `A ${depositPercent}% deposit is required at the time of booking to secure the reservation. ${balance}`
}

export function defaultContractTerms(s: ContractSettings): ContractTerms {
  const deposit = contractDepositPercent(s)
  return {
    depositPercentage: deposit,
    paymentTerms: paymentTermsText(deposit, s),
    inclusions: [
      'Private transportation throughout: all airport transfers',
      'Licensed private guiding for sightseeing',
      'Entrance fees to all sites listed',
      'Accommodation as specified in the itinerary',
      'Domestic flights as per itinerary',
      'Meals as specified in the itinerary',
      'All taxes and service charges',
    ],
    exclusions: [
      'International flights',
      'Meals not specified in the itinerary',
      'Gratuities for your guide (appreciated but not obligatory)',
      'Travel insurance',
      'Personal expenses',
      'Visa fees (if applicable)',
      'Optional activities not mentioned in the itinerary',
    ],
    cancellation45Days: 'Cancellations received 45 days before travel date are totally refundable.',
    cancellation44to30Days: 'Cancellations received 44 days to 30 days before travel date are subject to 15% cancellation fees.',
    cancellation29to15Days: 'Cancellations received 29 days to 15 days before travel date are subject to 40% cancellation fees.',
    cancellation14to0Days: 'Cancellations received 14 days to 0 days before travel date are subject to 100% cancellation fees.',
    flightCancellation: 'Any ticket cancellation (domestic and/or international) will be subject to a 50% fee from the flight price from day 1 of booking.',
    noShowPolicy: 'Clients who fail to show up for departure without prior notification will forfeit 100% of the tour cost.',
    forceMajeure: 'In case of cancellation due to force majeure events (natural disasters, political unrest, pandemic restrictions, etc.), the Service Provider will work with clients to reschedule or provide credit for future travel, subject to supplier policies.',
    specialNotes: 'Safety & Comfort: Meet & assist at all airports, trusted vetted teams, 24/7 WhatsApp support.\nPractical: Bottled water provided daily, restaurants chosen for cleanliness and hygiene.',
  }
}

/** The cancellation section, as both the page and the PDF print it. */
export function cancellationLines(t: Pick<ContractTerms, 'cancellation45Days' | 'cancellation44to30Days' | 'cancellation29to15Days' | 'cancellation14to0Days'>): string[] {
  return [
    'Domestic tickets are the only non-refundable part of the trip from day 1.',
    t.cancellation45Days,
    t.cancellation44to30Days,
    t.cancellation29to15Days,
    t.cancellation14to0Days,
    'Cancellation fees will be applied on accommodation portions only.',
  ].filter(l => clean(l))
}

/** The fixed terms and conditions, numbered as the page shows them. */
export function standardTerms(provider: string, s: ContractSettings): { title: string; text: string[] }[] {
  const who = clean(provider) || 'The Service Provider'
  const country = clean(s.operatingCountry)
  const law = clean(s.governingLaw)
  return [
    { title: 'Booking confirmation', text: [`This contract becomes binding upon receipt of the required deposit and signed contract by ${who}.`] },
    {
      title: 'Travel documents',
      text: [`Clients are responsible for ensuring they have valid passports, visas, and any required health documentation for travel${country ? ` to ${country}` : ''}.`],
    },
    {
      title: 'Health and safety',
      text: [
        'Clients must disclose any medical conditions that may affect their ability to participate in tour activities',
        'Travel insurance is strongly recommended and may be required',
        'Clients participate in all activities at their own risk',
      ],
    },
    {
      title: 'Changes to itinerary',
      text: [`${who} reserves the right to modify the itinerary due to circumstances beyond our control. Every effort will be made to provide suitable alternatives of equal value. No refunds will be provided for missed activities due to client's personal circumstances.`],
    },
    {
      title: 'Liability limitations',
      text: [`${who}'s liability is limited to the cost of the tour package. We are not responsible for delays, cancellations, or changes made by third-party suppliers.`],
    },
    {
      title: 'Dispute resolution',
      text: [law
        ? `Any disputes arising from this contract shall be resolved through arbitration under ${law}.`
        : 'Any disputes arising from this contract shall be resolved through arbitration under the law of the country in which the Service Provider is registered.'],
    },
    {
      title: 'Data protection',
      text: ['Client information will be used solely for the purpose of providing travel services and will be handled in accordance with applicable privacy laws.'],
    },
  ]
}

/** The closing line under the signatures. */
export function governingLawNote(s: ContractSettings): string {
  const law = clean(s.governingLaw)
  return law
    ? `This contract is governed by ${law}, and any disputes will be subject to the jurisdiction of its courts.`
    : 'This contract is governed by the law of the country in which the Service Provider is registered.'
}

/** "To be confirmed" for a trip with no price — never "NaN" or a crash. */
export function contractPrice(total: number | null | undefined, currency: string | null | undefined): string {
  if (typeof total !== 'number' || !Number.isFinite(total)) return 'To be confirmed'
  // The currency's decimals and separators, the same on every reader's
  // screen — toLocaleString() followed the browser's locale and dropped the
  // cents ("EUR 1.234,5").
  return currency ? formatMoney(total, currency) : total.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// ============================================
// Edits sent to the server (WhatsApp send)
// ============================================
// The page sends what is on screen so the client receives the contract the
// operator edited. Only these fields, only strings and lists of strings, and
// bounded — the rest of the contract (parties, recipient) comes from the
// database.

const TEXT_FIELDS = [
  'paymentTerms', 'cancellation45Days', 'cancellation44to30Days', 'cancellation29to15Days',
  'cancellation14to0Days', 'flightCancellation', 'noShowPolicy', 'forceMajeure', 'specialNotes',
  'tourName', 'destinations',
] as const
const MAX_TEXT = 2000
const MAX_ITEMS = 40

export type ContractEdits = Partial<ContractTerms> & { tourName?: string; destinations?: string; totalCost?: number | null }

export function sanitizeContractEdits(input: unknown): ContractEdits {
  const out: ContractEdits = {}
  if (!input || typeof input !== 'object') return out
  const src = input as Record<string, unknown>
  for (const f of TEXT_FIELDS) {
    if (typeof src[f] === 'string') (out as Record<string, unknown>)[f] = (src[f] as string).slice(0, MAX_TEXT)
  }
  for (const f of ['inclusions', 'exclusions'] as const) {
    const v = src[f]
    if (Array.isArray(v)) {
      out[f] = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, MAX_ITEMS).map(x => x.slice(0, 500))
    }
  }
  const dep = src.depositPercentage
  if (typeof dep === 'number' && Number.isFinite(dep) && dep >= 0 && dep <= 100) out.depositPercentage = dep
  const total = src.totalCost
  if (total === null || (typeof total === 'number' && Number.isFinite(total) && total >= 0)) out.totalCost = total
  return out
}
