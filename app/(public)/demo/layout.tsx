import { buildPageMetadata } from '@/lib/seo/site'

export const metadata = buildPageMetadata({
  title: 'Watch the Demo',
  description:
    'See Autoura in action: how a tour operator takes a client enquiry from WhatsApp to a priced itinerary, branded quote, booking and invoice in one place.',
  path: '/demo',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
