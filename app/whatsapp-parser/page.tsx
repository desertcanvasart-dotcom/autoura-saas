import { redirect } from 'next/navigation'

// The old WhatsApp/email parser wizard is retired: the Pricing Grid is the
// pricing engine, and every "Parse" / "New quote" / "New booking" opens it.
// This redirect keeps old bookmarks and links working, carrying their
// conversation / clientId / contact params across.
export default async function WhatsappParserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === 'string' && v) params.set(k, v)
  }
  const qs = params.toString()
  redirect(qs ? `/pricing-grid?${qs}` : '/pricing-grid')
}
