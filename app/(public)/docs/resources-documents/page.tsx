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

      {/* Resources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Resources</h2>
        <p className="text-gray-600 mb-4">
          Manage your operational contacts: guides, vehicles, hotels, restaurants, attractions, and airport staff.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Guides</h3>
        <p className="text-gray-600 mb-3">
          Go to <strong>Resources</strong> (or <strong>Rates &gt; Guides</strong>) to manage your guides:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Name, phone, email</li>
          <li>Languages spoken</li>
          <li>Specialties (e.g., Egyptology, adventure tours)</li>
          <li>Certifications</li>
          <li>Daily and hourly rates</li>
          <li>Availability</li>
        </ul>
        <DocScreenshot src="/docs/resources-documents/suppliers.jpg" alt="Guides management page showing guide profiles with languages, rates, and availability" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Transportation</h3>
        <p className="text-gray-600 mb-3">Manage transport suppliers:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Company name</li>
          <li>Vehicle types available</li>
          <li>Driver information</li>
          <li>Contact details</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Other Resources</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Hotels</strong> &mdash; Property contacts and details</li>
          <li><strong>Restaurants</strong> &mdash; Restaurant information for meal bookings</li>
          <li><strong>Attractions</strong> &mdash; Contact info for attractions and sites</li>
          <li><strong>Airport Staff</strong> &mdash; Personnel for airport services</li>
        </ul>
        <ScreenshotPlaceholder caption="Resources overview page with tabs for Guides, Vehicles, Hotels, Restaurants, Attractions" />
      </section>

      {/* Documents */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents</h2>
        <p className="text-gray-600 mb-4">
          Generate and manage professional documents for your travel business.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Document Types</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Document</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Itinerary PDF</td><td className="px-4 py-2.5">Day-by-day trip plan to send to clients</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Invoice PDF</td><td className="px-4 py-2.5">Professional billing document</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Contract</td><td className="px-4 py-2.5">Booking agreement with terms and conditions</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Receipt</td><td className="px-4 py-2.5">Payment confirmation</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Supplier Documents</td><td className="px-4 py-2.5">Vouchers and confirmations for suppliers</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Generating Documents</h3>
        <p className="text-gray-600 mb-3">
          Most documents are generated from within other pages:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Itinerary PDF</strong> &mdash; From the itinerary detail page, click <strong>Download PDF</strong></li>
          <li><strong>Invoice PDF</strong> &mdash; From the invoice page, click <strong>Download PDF</strong></li>
          <li><strong>Contract</strong> &mdash; From the itinerary, click <strong>Generate Documents</strong></li>
        </ul>
        <Tip>
          PDFs are generated in your browser &mdash; no waiting for server processing. You can also go to <strong>Documents</strong> in the sidebar to see all generated documents in one place.
        </Tip>
        <DocScreenshot src="/docs/resources-documents/documents.jpg" alt="Documents page showing list of generated PDFs, contracts, and receipts with download buttons" />
      </section>

      {/* Content Library */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Library</h2>
        <p className="text-gray-600 mb-4">
          Store and reuse frequently used content:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Tour descriptions</strong> &mdash; Reusable descriptions for popular destinations</li>
          <li><strong>Email templates</strong> &mdash; Pre-written emails for common scenarios</li>
          <li><strong>Itinerary text blocks</strong> &mdash; Standard day descriptions you use repeatedly</li>
          <li><strong>AI Prompts</strong> &mdash; Custom prompts for generating content</li>
          <li><strong>Writing Rules</strong> &mdash; Style guidelines so AI-generated content matches your brand voice</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-3">Using the Content Library</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Content Library</strong> in the sidebar</li>
          <li>Browse or search for content</li>
          <li>Click to view or edit</li>
          <li>Copy content into itineraries, emails, or other documents</li>
        </ol>
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
