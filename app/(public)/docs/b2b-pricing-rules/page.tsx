import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function TransportPackagesDocsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Transport Packages</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Transport Packages</h1>
      <p className="text-gray-600 mb-8">
        The <strong>Transport Packages</strong> page (sidebar: <strong>Tours</strong> group, admin and manager roles) defines your routes and their vehicle pricing &mdash; the configuration the B2B price calculator uses to pick vehicles automatically. Activity pricing lives elsewhere: see the note below.
      </p>

      <Tip>
        <strong>Looking for activity pricing?</strong> Per-person, per-unit, flat, and tiered (volume-discount) rates for activities and add-ons are managed under Activities &amp; Add-ons (Suppliers &amp; Rates &rarr; Guides &amp; Services &rarr; Activities) &mdash; the single catalog the whole app prices from. See <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Tours &amp; Rates</Link>. The old &ldquo;Activity Pricing Rules&rdquo; section has been retired in favor of it.
      </Tip>

      {/* Transport Packages */}
      <section className="mb-10 mt-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a package holds</h2>
        <p className="text-gray-600 mb-3">
          Each package has:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Code and name</strong></li>
          <li><strong>Package type</strong> &mdash; cruise sightseeing, cruise transfer, multi-day, or day tour</li>
          <li><strong>Origin and destination city</strong>, plus duration</li>
          <li><strong>Description and includes</strong></li>
          <li><strong>Five vehicle tiers</strong>, each with a rate and a capacity: sedan, minivan, van, minibus, and bus</li>
        </ul>
        <p className="text-gray-600 mb-3">
          When pricing a group, the engine automatically picks the <strong>cheapest vehicle that fits the group</strong> &mdash; 3 pax gets the sedan, 14 pax steps up to a minibus, and so on. You never assign vehicles by hand in a quote.
        </p>
        <ScreenshotPlaceholder caption="Transport Packages section on /b2b/pricing-rules — a package showing its code, type, origin/destination, and the five vehicle tiers (sedan, minivan, van, minibus, bus) with rates and capacities" />
      </section>

      {/* How they're used */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where Packages Are Used</h2>
        <p className="text-gray-600 mb-3">
          Packages are consumed directly by the <strong>B2B price calculator</strong>: they drive automatic vehicle stepping for cruise sightseeing and transfer line items. When you build a rate sheet or price a variation, the calculator reads the active packages from this page.
        </p>
        <Tip>
          <strong>See it in action:</strong> the calculator itself &mdash; and how pricing turns into partner rate sheets &mdash; is documented in <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>. Quotes generated from it are covered in <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link>.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
      </div>
    </div>
  )
}
