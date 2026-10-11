import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, DocScreenshot } from '../layout'
import { DocPager } from '../pager'

export default function B2BQuotesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2B Quotes</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2B Quotes</h1>
      <p className="text-gray-600 mb-8">
        B2B quotes are rate sheets for your partners: what a trip costs at each group size. They are made in the B2B Calculator, from a trip in the Quote Builder, or by the AI itinerary builder, and all of them land in <strong>Sell &rarr; B2B Quotes</strong> (managers and admins).
      </p>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Saving a Quote from the Calculator</h2>
        <p className="text-gray-600 mb-3">
          The calculator is opened from <strong>Tours &rarr; Tour Manager</strong> (the calculator icon on a variation), or after a B2B save in the Quote Builder.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Calculate the price (see <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>), and generate the rate sheet if the partner should see several group sizes</li>
          <li>Click <strong>Save as Quote</strong></li>
          <li>In <strong>Save Quote</strong>, choose the <strong>Partner</strong> (or <em>No partner / Direct client</em>), and add client details and notes for your own reference</li>
          <li>Click <strong>Save Quote</strong></li>
        </ol>
        <p className="text-gray-600 mt-3">
          The server prices the quote again from the inputs you calculated &mdash; if a rate changed meanwhile, the banner says so and shows the price saved. The quote starts as a draft, valid for 30 days; <strong>View Quote</strong> opens it.
        </p>
        <ScreenshotPlaceholder caption="Save Quote dialog with the partner, client details and notes" />
      </section>

      {/* Partners */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Partners</h2>
        <p className="text-gray-600">
          Your partners (tour operators and agencies) are in <strong>People &rarr; Partners</strong>, apart from your clients. Each has a <strong>Default Margin (%)</strong>, used when you make a B2B quote for them from the Quote Builder.
        </p>
        <DocScreenshot src="/docs/b2b-quotes/partners.jpg" alt="The B2B Partners page" />
      </section>

      {/* List */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Quotes List</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Stats</strong> &mdash; Total Quotes, Drafts, Sent, Accepted</li>
          <li><strong>Search</strong> by quote number, partner or trip; filter by status (Draft, Sent, Accepted, Rejected, Expired, each with its count); <strong>Filters</strong> adds tier, currency, tour leader, created date and validity</li>
          <li><strong>Each quote</strong> shows its number, status, tier, partner, trip and start date, and its lowest per-person price (<strong>From</strong>). Click it to open it.</li>
          <li><strong>Tick quotes</strong> to <strong>Change Status&hellip;</strong>, <strong>Export CSV</strong> or <strong>Delete</strong> them together</li>
          <li><strong>New Quote</strong> opens the Quote Builder in B2B mode</li>
        </ul>
        <DocScreenshot src="/docs/b2b-quotes/quotes-list.jpg" alt="The B2B Quotes list with its stats, search and status filter" />
      </section>

      {/* Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A Quote</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Header</strong> &mdash; Quote number, status (click it to change: Draft, Sent, Accepted, Rejected, Expired), tour leader and guide badges, service tier and season</li>
          <li><strong>Partner Information</strong> and, for a quote made from a trip, the <strong>Linked Itinerary</strong></li>
          <li><strong>Multi-Pax Pricing Table</strong> &mdash; The partner&apos;s price per person and total at each group size, and the single supplement</li>
          <li><strong>Services in this quote</strong>, by day, and the <strong>Cost Breakdown</strong></li>
          <li><strong>Validity</strong>, <strong>Internal Notes</strong> and <strong>Terms &amp; Conditions</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">
          A quote with unpriced services shows a warning; its PDF, sending and booking ask you to confirm first.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Actions</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Quote PDF</strong> &mdash; Downloads the <strong>B2B Rate Sheet</strong>: your branding, partner information, trip details, the multi-pax table with the single supplement, validity, and your terms if set</li>
          <li><strong>Send Email</strong> &mdash; Emails it to the partner with the PDF attached (needs the partner&apos;s email)</li>
          <li><strong>WhatsApp</strong> &mdash; Sends the partner a link to the PDF</li>
          <li><strong>Convert to Booking</strong> &mdash; Once the quote is <strong>Accepted</strong>; a quote converts once</li>
          <li><strong>Edit</strong> &mdash; Tier, currency, tour leader, the cost components, status, validity, notes and terms. Saving these does not change the partner&apos;s price table: to change partner prices, make a new quote.</li>
        </ul>
        <p className="text-gray-600 mt-3">Sending by email or WhatsApp moves a draft to <strong>Sent</strong>.</p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/b2b-quotes" />
    </div>
  )
}
