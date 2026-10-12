import { buildPageMetadata } from '@/lib/seo/site'

export const metadata = buildPageMetadata({
  title: 'About',
  description:
    'Autoura is built by tour operators, for tour operators and DMCs: one system that takes an enquiry from WhatsApp to itinerary, quote, booking and invoice.',
  path: '/about',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
