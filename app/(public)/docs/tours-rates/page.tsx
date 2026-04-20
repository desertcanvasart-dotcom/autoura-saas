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

      {/* Tour Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tour Templates</h2>
        <p className="text-gray-600 mb-4">
          Pre-built tour packages you can use as starting points for itineraries.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Browsing Tours</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Tours</strong> in the sidebar</li>
          <li>Browse available packages by destination, duration, or category</li>
          <li>Click a tour to see the full details</li>
        </ol>
        <DocScreenshot src="/docs/tours-rates/tours-list.jpg" alt="Tours list page showing tour cards with destination, duration, and pricing" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Detail Page</h3>
        <p className="text-gray-600 mb-3">Each tour shows:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Description</strong> and key <strong>highlights</strong></li>
          <li><strong>Day-by-day itinerary</strong> with cities, activities, and meals</li>
          <li><strong>What&apos;s included</strong> and <strong>what&apos;s not included</strong></li>
          <li><strong>Pricing calculator</strong> &mdash; enter the number of travelers and passport type for an instant price</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Tiers</h3>
        <p className="text-gray-600 mb-3">Most tours come in multiple tiers:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Budget</strong> &mdash; Basic accommodation and services</li>
          <li><strong>Standard</strong> &mdash; Mid-range quality</li>
          <li><strong>Deluxe</strong> &mdash; Premium options</li>
          <li><strong>Luxury</strong> &mdash; Top-tier everything</li>
        </ul>
        <ScreenshotPlaceholder caption="Tour detail page with tier selection, pricing calculator, and day-by-day breakdown" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Managing Tour Templates</h3>
        <p className="text-gray-600 mb-3">
          Go to <strong>Tours &gt; Manage</strong> (admin/manager only) to:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Create new tour templates</li>
          <li>Edit existing tours</li>
          <li>Add/modify variations and pricing</li>
          <li>Set up daily itinerary details</li>
          <li>Auto-price tours from your rates database</li>
        </ul>
      </section>

      {/* Rates Management */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rates Management</h2>
        <p className="text-gray-600 mb-4">
          Manage all your pricing in one place. Go to <strong>Rates</strong> in the sidebar.
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
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Hotels</td><td className="px-4 py-2.5">Room rates by city, tier, and per person</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Transportation</td><td className="px-4 py-2.5">Vehicle rates by type, service type, and group size</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Guides</td><td className="px-4 py-2.5">Daily and hourly rates, by language and specialty</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Entrance Fees</td><td className="px-4 py-2.5">Attraction tickets with EU and non-EU prices</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Meals</td><td className="px-4 py-2.5">Lunch and dinner rates by quality tier</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Activities</td><td className="px-4 py-2.5">Optional activities and excursions</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Cruises</td><td className="px-4 py-2.5">Nile cruise rates by ship and cabin type</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Airport Services</td><td className="px-4 py-2.5">Meet &amp; greet, VIP lounge, etc.</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Sleeping Trains</td><td className="px-4 py-2.5">Overnight train rates by cabin type</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Flights</td><td className="px-4 py-2.5">Domestic flight rates</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Tipping</td><td className="px-4 py-2.5">Recommended tipping rates by service type</td></tr>
            </tbody>
          </table>
        </div>
        <DocScreenshot src="/docs/tours-rates/rates-hub.jpg" alt="Rates hub showing rate category cards with counts and quick access links" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding or Editing a Rate</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to the relevant rate category</li>
          <li>Click <strong>Add New</strong> or click an existing rate to edit</li>
          <li>Fill in the details (prices, descriptions, supplier info)</li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <Tip>
          Rates are used by the auto-pricing engine when you build itineraries in <strong>Auto</strong> cost mode. Keep them up to date for accurate quotes.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">EU vs Non-EU Pricing</h3>
        <p className="text-gray-600">
          Many rates (especially entrance fees and transportation) have different prices for European passport holders and non-European passport holders. Make sure to set both when adding rates.
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
