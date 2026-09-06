import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function ResourcesDocumentsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Resources &amp; Documents</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Resources &amp; Documents</h1>

      {/* Suppliers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Suppliers</h2>
        <p className="text-gray-600 mb-4">
          The <strong>Suppliers</strong> page (Operations &rarr; Suppliers) is where you manage the companies and people you work with: hotels, transport companies, guides, restaurants, cruise operators, and more &mdash; 12 supplier types in total.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Views</strong> &mdash; Switch between grid, table, and list layouts, and filter by supplier type or status</li>
          <li><strong>Add Supplier</strong> &mdash; Create a supplier with contact details and type</li>
          <li><strong>Supplier Modal</strong> &mdash; Open any supplier to work across four tabs: <strong>Details</strong>, <strong>Rates</strong> (the rates tied to this supplier), <strong>Properties</strong>, and <strong>Documents</strong></li>
          <li><strong>Property Hierarchy</strong> &mdash; Hotels, restaurants, and cruises support parent/child records, so a chain can hold its individual properties</li>
          <li><strong>CSV Export</strong> &mdash; Download your supplier list as a spreadsheet</li>
        </ul>
        <DocScreenshot src="/docs/resources-documents/suppliers.jpg" alt="Suppliers page with type filters, view switcher, and supplier cards" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The Resources Page</h3>
        <p className="text-gray-600">
          There is also a <strong>Resources</strong> overview page (not in the sidebar) with tabs for Guides, Vehicles, Hotels, Restaurants, Airport Staff, and Hotel Staff. Use it to browse; for adding and editing resources, use the <strong>Suppliers</strong> page above, and for pricing use the <strong>Rates</strong> category pages.
        </p>
      </section>

      {/* Documents */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents</h2>
        <p className="text-gray-600 mb-4">
          The <strong>Documents</strong> page is a hub of link cards in two groups:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Customer Documents</strong> &mdash; Contracts and invoices for clients, generated from the itinerary pages</li>
          <li><strong>Supplier Documents</strong> &mdash; Vouchers and service orders, browsable by type</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Supplier Document Types</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Document</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Hotel Vouchers</td><td className="px-4 py-2.5">Accommodation confirmations</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Transport Vouchers</td><td className="px-4 py-2.5">Transfer and transportation orders</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Cruise Vouchers</td><td className="px-4 py-2.5">Nile cruise booking confirmations</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Activity Vouchers</td><td className="px-4 py-2.5">Tours and excursion confirmations</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Guide Assignments</td><td className="px-4 py-2.5">Guide briefings and assignments</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Service Orders</td><td className="px-4 py-2.5">General service instructions</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Generating &amp; Sending Documents</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Generate supplier documents from any itinerary using its <strong>Documents</strong> button &mdash; documents are auto-grouped by supplier from the itinerary&apos;s services</li>
          <li>Send vouchers directly to suppliers via <strong>Email</strong> or <strong>WhatsApp</strong></li>
          <li>Track the confirmation status of each document</li>
        </ul>
        <Tip>
          Main documents (itineraries, vouchers, quotes) are generated on the server for consistent, branded output; payment receipts are generated instantly in your browser.
        </Tip>
        <DocScreenshot src="/docs/resources-documents/documents.jpg" alt="Documents hub with Customer Documents and Supplier Documents link cards" />
      </section>

      {/* Content Library */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Library</h2>
        <p className="text-gray-600 mb-4">
          The Content Library stores reusable descriptions of your destinations, attractions, and hotels. Each entry can hold per-tier variations (budget, standard, deluxe, luxury) so the right wording flows into the right tier of itinerary. Browse with the category pills and search, and use <strong>Add Content</strong> to create entries. The <strong>AI Prompts</strong> and <strong>Writing Rules</strong> subpages let you tune how AI-generated content matches your brand voice.
        </p>
        <Tip>
          Looking for email templates? Those live in <strong>Message Templates</strong>, not the Content Library.
        </Tip>
        <p className="text-gray-600">
          See <Link href="/docs/content-library" className="text-primary-600 hover:underline">Content Library</Link> for the full guide.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/tours-rates"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Tours &amp; Rates
        </Link>
        <Link
          href="/docs/message-templates"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Message Templates
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
