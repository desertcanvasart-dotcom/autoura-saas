import type { Metadata } from 'next'
import { Inter } from "next/font/google"
import "./globals.css"
import ClientShell from './ClientShell'
import JsonLd from '@/components/seo/JsonLd'
import { SITE_URL, siteGraph } from '@/lib/seo/site'

const inter = Inter({ subsets: ["latin"] })

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
    url: '/',
    locale: 'en_US',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <JsonLd data={siteGraph()} />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  )
}
