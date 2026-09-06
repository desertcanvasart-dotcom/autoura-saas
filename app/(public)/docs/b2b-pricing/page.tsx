import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function B2BPricingPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2B Pricing</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2B Pricing</h1>
      <p className="text-gray-600 mb-8">
        The B2B Price Calculator prices a tour variation from your live rates database. It calculates a full cost breakdown for a specific group size, with or without a tour leader, and generates a multi-pax rate sheet you can export and share with tour operator partners.
      </p>

      {/* Accessing the Calculator */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accessing the Calculator</h2>
        <p className="text-gray-600 mb-3">
          The calculator has no sidebar entry of its own &mdash; you reach it from other pages:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>From the <strong>Tour Manager</strong> (Tours &rarr; Tour Manager): click the calculator icon on any variation</li>
          <li>Automatically, after saving a B2B quote in the <strong>Pricing Grid</strong> &mdash; the app redirects you straight to the calculator for the newly created variation</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The calculator always prices a <strong>tour variation</strong>. Each variation defines a specific version of a template&apos;s itinerary with its own day-by-day services.
        </p>
        <Tip>
          <strong>Manager only:</strong> The calculator &mdash; along with B2B Quotes and Partners &mdash; is restricted to admin and manager roles. Other users see an &ldquo;Access Denied&rdquo; screen.
        </Tip>
        <ScreenshotPlaceholder caption="B2B Price Calculator with the Calculate Price input panel and View Saved Quotes header link" />
      </section>

      {/* Input Parameters */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Parameters</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Number of Passengers</strong> &mdash; The group size to price (1-50)</li>
          <li><strong>Tour Leader</strong> &mdash; +0 (no tour leader) or +1 (with tour leader)</li>
          <li><strong>Travel Date</strong> &mdash; For seasonal rate matching</li>
          <li><strong>Passport Type</strong> &mdash; European or Non-European (affects entrance fees)</li>
          <li><strong>Profit Margin (%)</strong> &mdash; Your markup percentage</li>
          <li><strong>Include optional extras</strong> &mdash; Toggle for optional add-on services</li>
        </ul>
      </section>

      {/* Single Price Calculation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Single Price Calculation</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Calculate Price</strong> to get a detailed result for the selected number of passengers:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Summary Card</strong> &mdash; Total cost, margin, selling price, per-person price, and a season badge</li>
          <li><strong>Single Supplement</strong> &mdash; The additional charge per person for single room occupancy</li>
          <li><strong>Cost Breakdown</strong> &mdash; A line-by-line table of every service in the calculation</li>
          <li><strong>Tour Leader Cost</strong> &mdash; If +1 is enabled, the leader&apos;s costs (meals, entrances, single room) are shown separately and distributed across the paying guests</li>
        </ul>
        <ScreenshotPlaceholder caption="Price calculation result with summary cards, single supplement banner, and cost breakdown table" />
      </section>

      {/* Cost Breakdown */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost Breakdown Table</h2>
        <p className="text-gray-600 mb-3">
          The cost breakdown is a flat table with one row per service:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Service</strong> &mdash; The service name</li>
          <li><strong>Source</strong> &mdash; A badge showing where the rate came from (stored rate, manual, etc.)</li>
          <li><strong>Mode</strong> &mdash; How the quantity is counted</li>
          <li><strong>Qty / Unit / Total</strong> &mdash; Quantity, unit cost, and line total</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The table footer sums the subtotal, tour leader cost (if any), margin, and final selling price.
        </p>
      </section>

      {/* Incomplete Pricing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Incomplete Pricing Warning</h2>
        <p className="text-gray-600 mb-3">
          If any service in the variation has no matching rate, the result shows a red banner: <strong>&ldquo;&#9888; Incomplete pricing &mdash; N item(s) have no rate&rdquo;</strong>, followed by a list of exactly which items could not be priced.
        </p>
        <Tip>
          Add the missing rates in <strong>Rates</strong> before sending a rate sheet or quote to a partner &mdash; the calculator never invents a price for a missing rate.
        </Tip>
      </section>

      {/* Rate Sheet */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rate Sheet Generation</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Generate Rate Sheet (1-10 pax)</strong> to build a pricing table covering group sizes 1 through 10. For each group size the table shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Pax</strong> &mdash; Number of paying guests</li>
          <li><strong>Cost</strong> &mdash; Total supplier cost</li>
          <li><strong>Margin</strong> &mdash; Your profit amount</li>
          <li><strong>Selling</strong> &mdash; Total selling price</li>
          <li><strong>Per Person</strong> &mdash; Price per paying guest</li>
        </ul>
        <Tip>
          <strong>Export:</strong> Click <strong>Export CSV</strong> to download the rate sheet as a spreadsheet file, ready to share with partners.
        </Tip>
        <ScreenshotPlaceholder caption="Rate sheet table for 1-10 pax with the Export CSV button" />
      </section>

      {/* Pricing Model */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How B2B Pricing Works</h2>
        <p className="text-gray-600 mb-3">
          The pricing engine categorizes costs into three types:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Fixed Costs</strong> &mdash; Same regardless of group size: guide fees, tipping, airport services</li>
          <li><strong>Per-Pax Costs</strong> &mdash; Scale with the number of guests: accommodation, entrance fees, meals</li>
          <li><strong>Transport Costs</strong> &mdash; Vehicle rates that step up by vehicle tier as the group grows (sedan &rarr; minivan &rarr; minibus &rarr; bus)</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Per-unit and tiered activity behavior is driven by <strong>Activities &amp; Add-ons</strong> (Rates &rarr; Activities); transport vehicle-tier stepping is driven by the <strong>Transport Packages</strong> page (Tours &rarr; Transport Packages). See <Link href="/docs/b2b-pricing-rules" className="text-primary-600 hover:underline">Transport Packages</Link> for details.
        </p>
        <p className="text-gray-600 mt-3">
          For the <strong>+1 Tour Leader</strong> scenario, the leader&apos;s costs (single room, entrances, meals) are distributed across the paying guests, increasing the per-person price slightly.
        </p>
        <Tip>
          <strong>Partner margins:</strong> Each partner on the Partners page can carry a default margin percentage. When you price an itinerary for that partner, their default margin overrides the margin you enter manually.
        </Tip>
      </section>

      {/* Save as Quote */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Save as Quote</h2>
        <p className="text-gray-600 mb-3">
          After calculating a price, click <strong>Save as Quote</strong> to create a B2B quote. A green confirmation banner appears with the quote reference number and a <strong>View Quote</strong> link. You can also open the full list at any time via the <strong>View Saved Quotes</strong> link in the calculator header.
        </p>
        <p className="text-gray-600">
          See the <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link> documentation for details on managing and exporting quotes.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/b2c-pricing" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          B2C Pricing
        </Link>
        <Link href="/docs/tour-programs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Tour Programs Manager
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
