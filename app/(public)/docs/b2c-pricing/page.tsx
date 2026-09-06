import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

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
        B2C pricing happens in the <strong>pricing grid</strong> (sidebar: Operations &rarr; <strong>Pricing Grid</strong>). The grid looks up hotel rates, guide fees, transport costs, entrance fees, meals, and more from your rate database, applies your profit margin, and recalculates the quote live as you edit.
      </p>

      {/* How It Works */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How It Works</h2>
        <p className="text-gray-600 mb-3">
          From the itinerary editor, click <strong>Price in Grid</strong>. The itinerary opens in the pricing grid at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/pricing-grid?itinerary=&lt;id&gt;</code> with every day and service loaded. From there:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Each day&apos;s service slots (transport, guide, accommodation, meals, entrance fees, and more) are matched to rates by city, tier, and season</li>
          <li>The settings bar controls the calculation &mdash; <strong>PAX</strong>, <strong>start date</strong>, <strong>passport</strong> toggle, <strong>tier</strong>, <strong>guide</strong> toggle, <strong>B2C/B2B</strong> mode, <strong>currency</strong>, and <strong>margin</strong></li>
          <li>Group costs (vehicle, guide, tipping) are divided by pax; per-person costs (accommodation, entrance fees, meals) are multiplied by pax</li>
          <li>Your margin is applied to the aggregated cost to get the client selling price</li>
          <li>Every change &mdash; a different hotel, one more traveler, a new margin &mdash; recalculates the quote instantly</li>
        </ol>
        <DocScreenshot src="/docs/b2c-pricing/pricing-grid.jpg" alt="Pricing grid with settings bar, live quote strip, and day-by-day service slots" />
      </section>

      {/* Rate Sources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rate Sources</h2>
        <p className="text-gray-600 mb-3">
          Pricing pulls from the rate tables managed under <strong>Rates</strong> in the sidebar (start at the <strong>Rates Hub</strong>). The 14 categories are:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Hotels</strong> &mdash; Per-person per night by city, tier (budget/standard/deluxe/luxury), and season</li>
          <li><strong>Nile Cruises</strong> &mdash; Per-person by cabin type and season</li>
          <li><strong>Sleeping Trains</strong> &mdash; Overnight train cabins</li>
          <li><strong>Flights</strong> &mdash; Domestic flight fares</li>
          <li><strong>Trains</strong> &mdash; Day train fares</li>
          <li><strong>Meals</strong> &mdash; Lunch and dinner rates per person by tier</li>
          <li><strong>Attractions</strong> &mdash; Entrance fees per person by attraction and passport type (EU / Non-EU)</li>
          <li><strong>Tour Guides</strong> &mdash; Daily rate by language and tier</li>
          <li><strong>Activities</strong> &mdash; Excursions, experiences, and boat rides</li>
          <li><strong>Transportation</strong> &mdash; Vehicle rates by type, capacity, and route area</li>
          <li><strong>Airport Services</strong> &mdash; Arrival/departure assistance per service</li>
          <li><strong>Hotel Services</strong> &mdash; Hotel staff services</li>
          <li><strong>Tipping</strong> &mdash; Daily tipping allowance per tier</li>
          <li><strong>Fixed Costs</strong> &mdash; Recurring flat costs</li>
        </ul>
      </section>

      {/* Accommodation Model */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accommodation Pricing Model</h2>
        <p className="text-gray-600 mb-3">
          All accommodation (hotels and cruises) uses the <strong>Per Person Double (PPD)</strong> model:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Double Rate</strong> &mdash; Base rate per person when sharing a double room</li>
          <li><strong>Single Supplement</strong> &mdash; Extra charge for a traveler in a single room, added on top of the per-person total</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Accommodation is aggregated per person: each overnight day contributes one night at that day&apos;s per-person rate, and the per-person accommodation total is then multiplied by the number of travelers. The number of nights comes from the days marked with an overnight stay &mdash; not simply from the trip length.
        </p>
      </section>

      {/* Profit Margin */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Profit Margin</h2>
        <p className="text-gray-600 mb-3">
          Margin is applied <strong>once</strong>, to the aggregated per-person cost &mdash; not to each line item:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Sell/PP</strong> = Cost/PP + (Cost/PP &times; Margin %)</li>
          <li>The grid defaults to <strong>25%</strong> in B2C mode and <strong>10%</strong> in B2B mode</li>
          <li>Your personal default margin is a user preference in <strong>Settings</strong> (25% out of the box)</li>
          <li>The margin input is clamped to a sensible range, so a typo can&apos;t produce a broken quote</li>
        </ul>
      </section>

      {/* Viewing Results */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading the Results</h2>
        <p className="text-gray-600 mb-3">
          Two areas of the grid summarize the money:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Live Quote strip</strong> &mdash; Always visible at the top: <strong>Cost/PP</strong>, <strong>Total Cost</strong>, <strong>Margin</strong>, <strong>Sell/PP</strong>, and <strong>Sell Total</strong>, updating with every edit</li>
          <li><strong>Grand Summary card</strong> &mdash; Below the day cards: the whole trip totaled by category, so you can see where the money goes</li>
        </ul>
        <p className="text-gray-600 mb-3">
          Switch the <strong>currency</strong> (EUR, USD, GBP, or EGP) at any time &mdash; every figure converts instantly.
        </p>
        <Tip>
          <strong>Completeness gate:</strong> The grid blocks saving while mandatory components are still unpriced, based on each day&apos;s day type. Fill or clear the flagged slots and the save buttons unlock.
        </Tip>
        <DocScreenshot src="/docs/b2c-pricing/grand-summary.jpg" alt="Pricing grid scrolled to the Grand Summary showing per-category totals, cost, margin, and sell price" />
      </section>

      {/* B2C Quotes */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">B2C Quotes Page</h2>
        <p className="text-gray-600 mb-3">
          Saved B2C quotes live under <strong>B2C Quotes</strong> in the sidebar. The page shows status counts &mdash; <strong>draft</strong>, <strong>sent</strong>, <strong>viewed</strong>, <strong>accepted</strong>, <strong>rejected</strong>, and <strong>expired</strong> &mdash; with search and filters to find any quote, and an export option for your records. The <strong>New Quote</strong> button here opens the WhatsApp Parser to start a fresh quote.
        </p>
        <DocScreenshot src="/docs/b2c-pricing/b2c-quotes.jpg" alt="B2C Quotes page with status counts, search and filters, and the New Quote button" />
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
