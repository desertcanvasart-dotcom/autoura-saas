import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple pricing for tour operators: Solo $69, Studio $189, Agency $449. Every plan includes the full product — 14-day free trial, no card required.',
  alternates: { canonical: '/pricing' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
