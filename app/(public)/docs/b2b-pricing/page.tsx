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
        The B2B Price Calculator generates comprehensive pricing tables for tour operators and travel partners. It calculates per-person rates across multiple group sizes (1-40 pax), with and without a tour leader, and includes single supplement information.
      </p>

      {/* Accessing the Calculator */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accessing the Calculator</h2>
        <p className="text-gray-600 mb-3">
          There are two ways to reach the B2B Price Calculator:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>From the sidebar: <strong>B2B Calculator</strong></li>
          <li>From the <strong>Tour Programs Manager</strong>: Click the calculator icon on any variation</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The calculator requires a <strong>tour variation</strong> to price. Each variation defines a specific itinerary with day-by-day services.
        </p>
        <ScreenshotPlaceholder caption="B2B Price Calculator page with input form" />
      </section>

      {/* Input Parameters */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Parameters</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Number of Passengers</strong> &mdash; For single price calculation (1-40)</li>
          <li><strong>Tour Leader</strong> &mdash; +0 (no tour leader) or +1 (with tour leader)</li>
          <li><strong>Travel Date</strong> &mdash; For seasonal rate matching</li>
          <li><strong>Passport Type</strong> &mdash; European or Non-European (affects entrance fees)</li>
          <li><strong>Profit Margin (%)</strong> &mdash; Your markup percentage</li>
          <li><strong>Include Optional Extras</strong> &mdash; Toggle for optional add-on services</li>
        </ul>
      </section>

      {/* Single Price Calculation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Single Price Calculation</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Calculate Price</strong> to get a detailed breakdown for the selected number of passengers:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Summary Card</strong> &mdash; Total cost, margin, selling price, per-person price</li>
          <li><strong>Single Supplement</strong> &mdash; The additional charge for solo travelers (fixed per tour)</li>
          <li><strong>Cost Breakdown</strong> &mdash; Collapsible day-by-day view showing every service with unit cost, quantity, and line total</li>
          <li><strong>Tour Leader Cost</strong> &mdash; If enabled, shows the additional cost for the tour leader (accommodation + single supplement + per-pax services)</li>
        </ul>
        <ScreenshotPlaceholder caption="Price calculation results with summary, single supplement, and day-grouped cost breakdown" />
      </section>

      {/* Cost Breakdown */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Day-Grouped Cost Breakdown</h2>
        <p className="text-gray-600 mb-3">
          The cost breakdown groups services by day with collapsible sections:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Each day header shows the service count and day subtotal</li>
          <li>Click a day to expand/collapse its services</li>
          <li>Use <strong>Expand All / Collapse All</strong> to toggle all days</li>
          <li>Pricing notes show the rate source and calculation details</li>
          <li>Services without a specific day appear under &ldquo;General Services&rdquo;</li>
        </ul>
      </section>

      {/* Rate Sheet */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rate Sheet Generation</h2>
        <p className="text-gray-600 mb-3">
          The rate sheet generates a multi-pax pricing table:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Set the <strong>From</strong> and <strong>To</strong> pax range (1-40)</li>
          <li>Click <strong>Generate Rate Sheet</strong></li>
          <li>The table shows for each group size:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Pax</strong> &mdash; Number of paying guests</li>
              <li><strong>Cost</strong> &mdash; Total supplier cost</li>
              <li><strong>Margin</strong> &mdash; Your profit amount</li>
              <li><strong>Selling</strong> &mdash; Total selling price</li>
              <li><strong>Per Person</strong> &mdash; Price per paying guest</li>
              <li><strong>Single Supplement</strong> &mdash; Fixed per-tour supplement amount</li>
            </ul>
          </li>
        </ol>
        <Tip>
          <strong>Export:</strong> Click <strong>Export CSV</strong> to download the rate sheet as a spreadsheet file, ready to share with partners.
        </Tip>
        <ScreenshotPlaceholder caption="Rate sheet table with pax range 1-20, costs, and single supplement column" />
      </section>

      {/* Pricing Model */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How B2B Pricing Works</h2>
        <p className="text-gray-600 mb-3">
          The auto-pricing engine categorizes costs into three types:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Fixed Costs</strong> &mdash; Same regardless of group size: guide fees, tipping, airport services</li>
          <li><strong>Per-Pax Costs</strong> &mdash; Scale with the number of guests: accommodation (PPD), entrance fees, meals, water</li>
          <li><strong>Transport Costs</strong> &mdash; Vehicle rates that step up based on group size (sedan &rarr; minivan &rarr; minibus &rarr; bus)</li>
        </ul>
        <p className="text-gray-600 mt-3">
          For the <strong>+1 Tour Leader</strong> scenario, the leader&apos;s costs (single room, entrances, meals) are distributed across the paying guests, increasing the per-person price slightly.
        </p>
      </section>

      {/* Save as Quote */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Save as Quote</h2>
        <p className="text-gray-600 mb-3">
          After calculating a price, click <strong>Save as Quote</strong> to create a B2B quote. See the <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link> documentation for details on managing and exporting quotes.
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
