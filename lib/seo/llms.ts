// ============================================
// /llms.txt and /llms-full.txt — the site, summarised for AI assistants
// ============================================
// The llms.txt convention: a short markdown file at the site root that tells
// a language model what the site is and which pages to read. /llms.txt is the
// curated summary; /llms-full.txt adds every docs page and published post.
//
// Plans and prices are read from lib/pricing-config.ts and the docs list
// from the docs table of contents, so this file cannot drift from the pages
// it summarises. Only what the public pages already say goes here.

import { PRICING_TIERS, TIER_ORDER, TRIAL_DAYS, type PricingTier } from '@/lib/pricing-config'
import { CATEGORIES } from '@/app/(public)/docs/toc'
import type { BlogPostSummary } from '@/lib/blog/posts-shared'
import { absoluteUrl, BRAND } from './site'

const fmtLimit = (v: number | null) => (v === null ? 'unlimited' : v.toLocaleString('en-US'))

function planLine(t: PricingTier): string {
  const price = t.publiclyPriced && t.monthlyPrice !== null
    ? `$${t.monthlyPrice}/month${t.annualPrice !== null ? ` or $${t.annualPrice.toLocaleString('en-US')}/year` : ''}${t.onboardingFeeUsd !== null ? `, plus $${t.onboardingFeeUsd.toLocaleString('en-US')} one-time onboarding` : ''}`
    : 'priced on request'
  const limits = t.limits.users === null && t.limits.itinerariesPerYear === null
    ? 'Unlimited team members and itineraries.'
    : `Up to ${fmtLimit(t.limits.users)} team members and ${fmtLimit(t.limits.itinerariesPerYear)} itineraries a year.`
  return `- ${t.name} — ${price}. ${t.description} ${limits}`
}

const PAGES: Array<[string, string, string]> = [
  ['Home', '/', 'What Autoura does, end to end'],
  ['Pricing', '/pricing', 'Plans, limits, what is and is not included, and pricing questions'],
  ['Demo', '/demo', 'A walkthrough video of the product'],
  ['Integrations', '/integrations', 'What connects today and what is planned'],
  ['Documentation', '/docs', 'Step-by-step guides for every part of the app'],
  ['Blog', '/blog', 'Product news and operations how-tos, in English and Japanese'],
  ['About', '/about', 'Who builds Autoura and why'],
  ['Contact', '/contact', 'Apply for the assisted pilot or ask a question'],
]

function header(): string {
  return [
    `# ${BRAND.name}`,
    '',
    `> ${BRAND.description}`,
    '',
    'Autoura is a web application (software as a service) used by tour operators, destination management companies (DMCs) and travel agencies to run their business. It is not a travel agency: it does not sell trips to travellers.',
    '',
    '## What it does',
    '',
    '- One inbox for client WhatsApp and Gmail conversations; AI pulls dates, travellers and preferences out of the messages you choose.',
    '- Drafts day-by-day itineraries from a conversation, then prices them from the operator’s own rate sheets (hotels, cruises, guides, transport, entrance fees, meals) for 1–40 travellers.',
    '- Flags missing rates instead of guessing, so an incomplete quote cannot be sent.',
    '- Branded quotes for direct (B2C) clients and rate sheets and quotes for B2B travel partners.',
    '- Bookings, supplier confirmations, departures, tasks and team assignments.',
    '- Invoices, payments, receipts, receivables, supplier invoices, expenses, commissions and per-trip profit and loss.',
    '- Client messaging in 29 languages. The blog is published in English and Japanese.',
    '',
    '## What it does not do',
    '',
    '- No GDS connection: flights are recorded, not booked.',
    '- No channel manager and no OTA connectivity (Booking.com, Expedia).',
    '- Clients cannot pay by card inside the app yet; payments made elsewhere are recorded.',
    '- Accounting sync (Xero, QuickBooks) is on the roadmap, not available today.',
    '',
    '## Plans',
    '',
    ...TIER_ORDER.map(k => planLine(PRICING_TIERS[k])),
    '',
    `Every plan includes the full product. A ${TRIAL_DAYS}-day free trial needs no card. Current prices: ${absoluteUrl('/pricing')}`,
    '',
    '## Pages',
    '',
    ...PAGES.map(([name, path, what]) => `- [${name}](${absoluteUrl(path)}): ${what}`),
    '',
    '## Contact',
    '',
    `- Sales and pilots: ${BRAND.email} or ${absoluteUrl('/contact')}`,
    `- Customer support: ${BRAND.supportEmail}`,
  ].join('\n')
}

/** /llms.txt — the curated summary. */
export function llmsTxt(): string {
  return [
    header(),
    '',
    '## Optional',
    '',
    `- [Full index](${absoluteUrl('/llms-full.txt')}): every documentation page and blog post, with summaries`,
    `- [Sitemap](${absoluteUrl('/sitemap.xml')})`,
    '',
  ].join('\n')
}

/** /llms-full.txt — the summary plus every docs page and published post. */
export function llmsFullTxt(posts: BlogPostSummary[]): string {
  const docs = CATEGORIES.flatMap(c => [
    '',
    `### ${c.label}`,
    '',
    ...c.items.map(i => `- [${i.title}](${absoluteUrl(i.href)}): ${i.description}`),
  ])
  const blog = posts.length
    ? posts.map(p => {
        const date = p.published_at ? ` (${p.published_at.slice(0, 10)}${p.language === 'ja' ? ', Japanese' : ''})` : ''
        const summary = (p.seo_description || p.excerpt || '').replace(/\s+/g, ' ').trim()
        return `- [${p.title}](${absoluteUrl(`/blog/${p.slug}`)})${date}${summary ? `: ${summary}` : ''}`
      })
    : ['- No posts published yet.']
  return [
    header(),
    '',
    '## Documentation',
    ...docs,
    '',
    '## Blog posts',
    '',
    ...blog,
    '',
  ].join('\n')
}
