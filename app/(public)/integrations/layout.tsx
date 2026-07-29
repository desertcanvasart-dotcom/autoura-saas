import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Integrations',
  description:
    'Autoura connects WhatsApp (Twilio), Gmail, and Stripe — the tools tour operators already run their business on.',
  alternates: { canonical: '/integrations' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
