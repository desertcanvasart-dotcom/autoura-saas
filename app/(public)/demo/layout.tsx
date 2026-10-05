import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Watch the Demo',
  description:
    'See Autoura in action — how tour operators take an inquiry from WhatsApp to itinerary, quote, booking and invoice in one place.',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'Autoura — Watch the Demo',
    description:
      'See how tour operators run inquiries, itineraries, bookings and invoices in one place with Autoura.',
    url: '/demo',
    type: 'video.other',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
