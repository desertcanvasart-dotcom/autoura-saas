import type { Metadata } from 'next'
import { Inter } from "next/font/google"
import "./globals.css"
import ClientShell from './ClientShell'

const inter = Inter({ subsets: ["latin"] })

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://getautoura.net'

// Server root layout so site-wide metadata exists at all. Chrome selection
// and the provider tree live in ClientShell (client component).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Autoura — Tour Operator Software, from WhatsApp to Invoice',
    template: '%s · Autoura',
  },
  description:
    'Autoura turns WhatsApp conversations into priced itineraries, branded quotes, bookings and invoices — the operating system for tour operators and DMCs.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Autoura',
    title: 'Autoura — Tour Operator Software, from WhatsApp to Invoice',
    description:
      'Turn WhatsApp conversations into priced itineraries, branded quotes, bookings and invoices.',
    url: SITE_URL,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Autoura — from WhatsApp to invoice' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Autoura — Tour Operator Software',
    description:
      'Turn WhatsApp conversations into priced itineraries, branded quotes, bookings and invoices.',
    images: ['/og.png'],
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Autoura',
      url: SITE_URL,
      logo: `${SITE_URL}/get-autoura-logo.png`,
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Autoura',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Operating system for tour operators and DMCs: WhatsApp intake, AI itineraries, pricing, quotes, bookings and invoicing.',
      offers: {
        '@type': 'Offer',
        price: '69',
        priceCurrency: 'USD',
        description: 'Solo plan, monthly. 14-day free trial, no card required.',
      },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  )
}
