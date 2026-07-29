import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact & Pilot Application',
  description:
    'Apply for the Autoura assisted pilot or ask us anything. We respond within 24 hours.',
  alternates: { canonical: '/contact' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
