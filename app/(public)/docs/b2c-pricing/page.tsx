import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function B2CPricingPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2C Pricing</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2C Pricing</h1>
      <p className="text-gray-600 mb-8">
        B2C pricing calculates the total cost and client price for an itinerary based on your rate database. It automatically looks up hotel rates, guide fees, transport costs, entrance fees, meals, and more &mdash; then applies your profit margin.
      </p>

      {/* How It Works */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How It Works</h2>
        <p className="text-gray-600 mb-3">
          When you click <strong>Calculate Pricing</strong> on an itinerary, the system:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Reads each day&apos;s services (guide, transport, hotel, meals, entrances)</li>
          <li>Looks up current rates from your rates database based on city, tier, and season</li>
          <li>Calculates per-person costs (all accommodation rates are per-person, double occupancy)</li>
          <li>Applies your profit margin to get the client selling price</li>
          <li>Generates a full service breakdown with supplier costs and client prices</li>
        </ol>
        <DocScreenshot src="/docs/b2c-pricing/pricing-grid.jpg" alt="Itinerary pricing calculation with service breakdown" />
      </section>

      {/* Rate Sources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rate Sources</h2>
        <p className="text-gray-600 mb-3">
          Pricing pulls from these rate tables (managed under <strong>Tours &amp; Rates</strong>):
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Hotels</strong> &mdash; Per-person per night (double occupancy). Matched by city and tier (budget/standard/deluxe/luxury)</li>
          <li><strong>Nile Cruises</strong> &mdash; Per-person for entire trip. Single/double/triple rates available</li>
          <li><strong>Transportation</strong> &mdash; Vehicle rates by type, capacity, and route area</li>
          <li><strong>Guides</strong> &mdash; Daily rate by language and tier</li>
          <li><strong>Entrance Fees</strong> &mdash; Per-person by attraction and passport type (European / non-European)</li>
          <li><strong>Meals</strong> &mdash; Lunch and dinner rates per person by tier</li>
          <li><strong>Airport Services</strong> &mdash; Per service (arrival/departure assistance)</li>
          <li><strong>Tipping</strong> &mdash; Daily tipping allowance per tier</li>
        </ul>
        <Tip>
          <strong>Preferred Suppliers:</strong> Hotels and services marked as &ldquo;preferred&rdquo; in your rates database will be selected first during pricing.
        </Tip>
      </section>

      {/* Accommodation Model */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accommodation Pricing Model</h2>
        <p className="text-gray-600 mb-3">
          All accommodation (hotels and cruises) uses the <strong>Per Person Double (PPD)</strong> model:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Double Rate</strong> &mdash; Base rate per person when sharing a double room</li>
          <li><strong>Single Supplement</strong> &mdash; Extra charge for a single room = single rate minus double rate</li>
          <li><strong>Triple Reduction</strong> &mdash; Discount for triple occupancy = double rate minus triple rate</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The total accommodation cost = per-person rate &times; number of guests &times; number of nights.
        </p>
      </section>

      {/* Profit Margin */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Profit Margin</h2>
        <p className="text-gray-600 mb-3">
          The system applies your configured margin percentage to the total supplier cost:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Client Price</strong> = Supplier Cost + (Supplier Cost &times; Margin %)</li>
          <li>Margin is applied per service line item</li>
          <li>The default margin is set in your team settings</li>
        </ul>
      </section>

      {/* Viewing Results */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Pricing Results</h2>
        <p className="text-gray-600 mb-3">
          After calculation, you can see:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Service Breakdown</strong> &mdash; Each service with supplier cost and client price</li>
          <li><strong>Day-by-Day Summary</strong> &mdash; Costs grouped by day</li>
          <li><strong>Total Summary</strong> &mdash; Total supplier cost, margin amount, and selling price</li>
          <li><strong>Per Person</strong> &mdash; Price per person based on number of travelers</li>
        </ul>
        <ScreenshotPlaceholder caption="Pricing results showing service breakdown, totals, and per-person price" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/itineraries" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Itineraries
        </Link>
        <Link href="/docs/b2b-pricing" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: B2B Pricing
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
