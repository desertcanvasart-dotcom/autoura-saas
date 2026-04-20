import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

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
        B2B Quotes are saved pricing snapshots that you can share with tour operator partners. Each quote captures a specific pricing calculation with all service details, ready for PDF export and partner distribution.
      </p>

      {/* Creating a Quote */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Quote</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to the <strong>B2B Price Calculator</strong> and calculate a price</li>
          <li>Click <strong>Save as Quote</strong></li>
          <li>Optionally fill in:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Partner</strong> &mdash; Select the B2B partner (tour operator) from your contacts</li>
              <li><strong>Client Name</strong> &mdash; End client name if known</li>
              <li><strong>Email &amp; Phone</strong> &mdash; Client contact details</li>
              <li><strong>Nationality</strong> &mdash; For passport-type reference</li>
              <li><strong>Notes</strong> &mdash; Special requests or conditions</li>
            </ul>
          </li>
          <li>Click <strong>Save Quote</strong></li>
        </ol>
        <p className="text-gray-600 mt-3">
          The quote is assigned a unique reference code and captures the full pricing snapshot: services, rates, margin, and the rate sheet.
        </p>
        <ScreenshotPlaceholder caption="Save as Quote dialog with partner selection and client details" />
      </section>

      {/* Viewing Quotes */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Quotes</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>B2B Quotes</strong> from the sidebar. The quotes page shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Quote List</strong> &mdash; All saved quotes with reference, tour name, partner, date, pax, and price</li>
          <li><strong>Status Badges</strong> &mdash; Draft, Sent, Confirmed, Expired</li>
          <li><strong>Search</strong> &mdash; Filter by reference code, tour name, or partner name</li>
          <li><strong>Quick Actions</strong> &mdash; View, download PDF, or open in calculator</li>
        </ul>
        <DocScreenshot src="/docs/b2b-quotes/quotes-list.jpg" alt="B2B Quotes list page with quote cards and action buttons" />
      </section>

      {/* Quote Details */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quote Details</h2>
        <p className="text-gray-600 mb-3">
          Click on a quote to see its full details:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Tour Information</strong> &mdash; Tour name, variation, duration, cities</li>
          <li><strong>Pricing Summary</strong> &mdash; Number of pax, total cost, margin, selling price, per person</li>
          <li><strong>Service Snapshot</strong> &mdash; Complete service breakdown as calculated at quote time</li>
          <li><strong>Rate Sheet</strong> &mdash; If generated, the full pax pricing table</li>
          <li><strong>Client &amp; Partner Info</strong> &mdash; Contact details and notes</li>
        </ul>
      </section>

      {/* PDF Export */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">PDF Export</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Download PDF</strong> to generate a professional B2B quote document. The PDF includes:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Company branding and logo</li>
          <li>Quote reference number and date</li>
          <li>Tour details and itinerary summary</li>
          <li>Pricing table with rate sheet</li>
          <li>Single supplement information</li>
          <li>Terms and conditions</li>
        </ul>
        <Tip>
          <strong>Japanese Support:</strong> The PDF generator supports Japanese text, so quotes for Japanese partners will render correctly with proper fonts.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/tour-programs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Tour Programs Manager
        </Link>
        <Link href="/docs/bookings" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Bookings
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
