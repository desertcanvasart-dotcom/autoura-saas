import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { DocScreenshot } from '../layout'
import { DocPager } from '../pager'

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
        Trips for your direct clients are priced in the <strong>Quote Builder</strong> (Sell &rarr; Quote Builder): every service is looked up in your rates, your markup is added, and the price updates as you change the trip. Building the trip itself is covered in <Link href="/docs/itinerary-creation" className="text-primary-600 hover:underline">Itinerary Creation</Link>.
      </p>

      {/* How */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How the Price Is Built</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Group services</strong> &mdash; transport, guide, tipping, boat rides and other group costs &mdash; are shared among the travellers</li>
          <li><strong>Per-person services</strong> &mdash; accommodation, entrance fees, flights, experiences, meals, water, cruise &mdash; are counted for each traveller</li>
          <li>Airport services, hotel services and activities follow their rate&apos;s own basis: per group, per person, or per unit (for example per car)</li>
          <li>Your <strong>Markup %</strong> is added to the cost per person: Sell/PP = Cost/PP &times; (1 + markup)</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The price updates as you change anything. When you <strong>save</strong>, every service is priced again from your rates as they are then, and you are told about any that changed.
        </p>
      </section>

      {/* Sources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where the Rates Come From</h2>
        <p className="text-gray-600 mb-3">
          From your rates in <strong>Suppliers &amp; Rates</strong> (managers and admins), filtered to each day&apos;s city:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Hotels</strong> &mdash; At the trip&apos;s tier, priced from the rate period that covers the start date</li>
          <li><strong>Nile Cruises</strong> &mdash; At the trip&apos;s tier, per person per night, by cabin</li>
          <li><strong>Transportation</strong> &mdash; By route and vehicle; cruise transport packages are offered on cruise days</li>
          <li><strong>Tour Guides</strong> &mdash; By language and type of guide</li>
          <li><strong>Attractions</strong> &mdash; EU and non-EU prices, by the trip&apos;s passport setting</li>
          <li><strong>Meals</strong>, <strong>Activities</strong>, <strong>Flights</strong>, <strong>Airport</strong> and <strong>Hotel Services</strong>, and <strong>Tipping</strong> (by who the tip is for)</li>
          <li><strong>Water</strong> &mdash; From the Water Bottle fixed cost</li>
        </ul>
      </section>

      {/* Accommodation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Accommodation</h2>
        <p className="text-gray-600">
          Hotels and cruises are priced per person in a double room (PPD), for each day you pick one. A hotel&apos;s <strong>Single Supplement</strong> is charged when the trip is for one traveller.
        </p>
      </section>

      {/* Margin */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Markup</h2>
        <p className="text-gray-600">
          <strong>Markup %</strong> in the header starts at 25% for B2C and 10% for B2B (switching resets it; in B2B a partner&apos;s default margin applies). Admins can set their own starting margin as the <strong>Default Profit Margin</strong> in Settings.
        </p>
      </section>

      {/* Results */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading the Results</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Live Quote</strong> (header) &mdash; Cost/PP, Total Cost, Margin, Sell/PP and Sell Total, once something is priced</li>
          <li><strong>The bottom bar</strong> &mdash; Cost / person, Total cost, Margin, Selling / person and Selling total, beside the save button</li>
          <li><strong>Each day</strong> &mdash; Its own cost, also in the day bar</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The <strong>Currency</strong> setting shows the prices in any of 12 currencies.
        </p>
        <DocScreenshot src="/docs/b2c-pricing/pricing-grid.jpg" alt="The Quote Builder" />
      </section>

      {/* B2C quotes */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">B2C Quotes</h2>
        <p className="text-gray-600 mb-3">
          Saving a B2C trip makes its quote, or reprices the open one. They are in <strong>Sell &rarr; B2C Quotes</strong>:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Quotes</strong>, <strong>Drafts</strong>, <strong>Sent/Viewed</strong> and <strong>Accepted</strong>; the status filter counts every status</li>
          <li><strong>Search</strong> by quote number, client name or trip, and <strong>Filters</strong> by tier, currency, created date and validity</li>
          <li>Tick quotes to change their status, export them as CSV, or delete them</li>
          <li><strong>New Quote</strong> opens the Quote Builder</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A quote has <strong>Quote PDF</strong>, <strong>Send Email</strong>, <strong>WhatsApp</strong>, its status, and <strong>Convert to Booking</strong> once accepted. <strong>Edit</strong> changes the base cost and margin; the selling price and price per person are worked out for you.
        </p>
        <DocScreenshot src="/docs/b2c-pricing/b2c-quotes.jpg" alt="The B2C Quotes list with its stats, search, filters and the New Quote button" />
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/b2c-pricing" />
    </div>
  )
}
