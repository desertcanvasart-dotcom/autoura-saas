import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function ToursRatesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tours &amp; Rates</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Tours &amp; Rates</h1>

      {/* Ready Made Packages */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Ready Made Packages</h2>
        <p className="text-gray-600 mb-4">
          Pre-built tour packages you can browse and price instantly.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Browsing Tours</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>B2B &rarr; Ready Made Packages</strong> in the sidebar</li>
          <li>Filter by <strong>Tier</strong> or <strong>Category</strong>, or search &mdash; the search matches tour names, descriptions, and cities</li>
          <li>Click a tour to see the full details</li>
        </ol>
        <DocScreenshot src="/docs/tours-rates/tours-list.jpg" alt="Ready Made Packages page with tier and category filters and tour cards" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Detail Page</h3>
        <p className="text-gray-600 mb-3">Each tour shows:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Description</strong> and key <strong>highlights</strong></li>
          <li><strong>Day-by-day itinerary</strong> with cities, activities, and meals</li>
          <li><strong>What&apos;s included</strong> and <strong>what&apos;s not included</strong></li>
          <li><strong>Instant price calculator</strong> &mdash; enter the number of travelers and passport type for an immediate price</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Tiers</h3>
        <p className="text-gray-600 mb-3">Tours come in up to four tiers:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Budget</strong> &mdash; Basic accommodation and services</li>
          <li><strong>Standard</strong> &mdash; Mid-range quality</li>
          <li><strong>Deluxe</strong> &mdash; Premium options</li>
          <li><strong>Luxury</strong> &mdash; Top-tier everything</li>
        </ul>
        <ScreenshotPlaceholder caption="Tour detail page with the instant price calculator and day-by-day breakdown" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Managing Tour Templates</h3>
        <p className="text-gray-600">
          Packages are created and edited in the <strong>Tour Builder</strong> (B2B &rarr; Tour Builder), where you manage templates, variations, and day-by-day itineraries. See <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Builder</Link> for the full guide. To schedule dated departures on a template, use <strong>Operations &rarr; Tour Departures</strong>.
        </p>
      </section>

      {/* Rates Management */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rates &amp; Pricing</h2>
        <p className="text-gray-600 mb-4">
          All your buying rates live under the <strong>Rates &amp; Pricing</strong> sidebar group. The <strong>Rates Hub</strong> entry opens the Rate Management overview, and each of the 14 rate categories has its own page beneath it.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Rate Categories</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Category</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What It Covers</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Hotels</td><td className="px-4 py-2.5">Room rates by city and tier</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Nile Cruises</td><td className="px-4 py-2.5">Cruise rates by ship and cabin</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Sleeping Trains</td><td className="px-4 py-2.5">Overnight train rates by cabin type</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Flights</td><td className="px-4 py-2.5">Domestic flight rates</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Trains</td><td className="px-4 py-2.5">Regular (daytime) train rates</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Meals</td><td className="px-4 py-2.5">Lunch and dinner rates by quality tier</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Attractions</td><td className="px-4 py-2.5">Entrance fees, with European and non-European prices</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Tour Guides</td><td className="px-4 py-2.5">Guide rates by language and specialty</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Activities</td><td className="px-4 py-2.5">Optional activities and excursions</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Transportation</td><td className="px-4 py-2.5">Vehicle rates by type and group size</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Airport Services</td><td className="px-4 py-2.5">Meet &amp; greet, transfers, and similar services</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Hotel Services</td><td className="px-4 py-2.5">Extra services provided at hotels</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Tipping</td><td className="px-4 py-2.5">Tipping rates by service type</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Fixed Costs</td><td className="px-4 py-2.5">Fixed per-tour cost items</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Rate Management Overview</h3>
        <p className="text-gray-600 mb-3">
          <strong>Rates Hub</strong> opens the Rate Management page: a tabbed table view of all your rates with stats cards, search, and city/category/tier filters. From here you can also <strong>export to CSV</strong> or <strong>print</strong> the current view.
        </p>
        <DocScreenshot src="/docs/tours-rates/rates-hub.jpg" alt="Rate Management page with stats cards, category tabs, filters, and the rates table" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding or Editing a Rate</h3>
        <p className="text-gray-600 mb-3">
          Adding and editing happens on the individual category pages, not the overview:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the relevant category from the sidebar (e.g., Rates &amp; Pricing &rarr; Hotels)</li>
          <li>Add a new rate or click an existing rate to edit</li>
          <li>Fill in the details and save</li>
        </ol>
        <Tip>
          Rates power pricing across the app: itineraries in <strong>Auto</strong> cost mode, and &mdash; most importantly &mdash; the <strong>New Quote</strong> pricing grid and the <strong>B2B Price Calculator</strong>. Keep them up to date; the pricing engine flags any service it cannot find a rate for instead of inventing a price.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">EU vs Non-EU Pricing</h3>
        <p className="text-gray-600">
          Some rates (notably attraction entrance fees) have different prices for European and non-European passport holders. Make sure to set both when adding rates.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Suppliers &amp; Rates</h3>
        <p className="text-gray-600">
          Supplier records live in <strong>Operations &rarr; Suppliers</strong>. Each supplier has its own <strong>Rates</strong> tab, so you can see and manage the rates tied to a specific hotel, transport company, or other provider in one place. See <Link href="/docs/resources-documents" className="text-primary-600 hover:underline">Resources &amp; Documents</Link> for the full Suppliers guide.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/expenses-commissions"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Expenses &amp; Commissions
        </Link>
        <Link
          href="/docs/resources-documents"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Resources &amp; Documents
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
