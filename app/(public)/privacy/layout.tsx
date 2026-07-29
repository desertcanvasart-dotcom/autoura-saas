import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Autoura collects, uses, and protects your data.',
  alternates: { canonical: '/privacy' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
