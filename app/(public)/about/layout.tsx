import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Autoura is built by tour operators, for tour operators — the operating system that takes an inquiry from WhatsApp to invoice.',
  alternates: { canonical: '/about' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
