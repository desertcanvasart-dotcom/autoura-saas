import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net'

// Marketing pages only — the app and traveller share links are not for
// crawlers. Doc pages are enumerated statically; add new ones here.
const DOC_PAGES = [
  'getting-started', 'dashboard', 'clients', 'bookings', 'itineraries',
  'itinerary-creation', 'tour-programs', 'tours-rates', 'b2b-pricing',
  'b2b-quotes', 'b2c-pricing', 'invoices-payments', 'expenses-commissions',
  'profit-loss', 'communication', 'message-templates', 'followups-reminders',
  'resources-documents', 'team-settings', 'workflows',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const top = ['', '/pricing', '/about', '/contact', '/integrations', '/docs'].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.8,
  }))
  const legal = ['/privacy', '/terms'].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
  }))
  const docs = DOC_PAGES.map((d) => ({
    url: `${SITE_URL}/docs/${d}`,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))
  return [...top, ...legal, ...docs]
}
