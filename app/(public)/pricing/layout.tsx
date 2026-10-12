import JsonLd from '@/components/seo/JsonLd'
import { PRICING_FAQ } from '@/lib/marketing/pricing-faq'
import { TRIAL_DAYS } from '@/lib/pricing-config'
import { breadcrumbs, buildPageMetadata } from '@/lib/seo/site'

export const metadata = buildPageMetadata({
  title: 'Pricing',
  description: `Pricing for tour operators: Solo $69 and Studio $189 a month; Agency and Enterprise on request. Every plan has the full product and a ${TRIAL_DAYS}-day free trial.`,
  path: '/pricing',
})

// The FAQ is published as FAQPage data from the same list the page renders.
const faqPage = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: PRICING_FAQ.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={[faqPage, breadcrumbs([{ name: 'Pricing', path: '/pricing' }])]} />
      {children}
    </>
  )
}
