import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function BookingsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Bookings</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Bookings</h1>
      <p className="text-gray-600 mb-8">
        When a client confirms an itinerary, you convert it into a booking. Bookings track the operational side: supplier confirmations, payments, and status.
      </p>

      {/* Viewing Bookings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Bookings</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Bookings</strong> in the sidebar. Status cards at the top show:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Pending</strong> &mdash; Just created, waiting on suppliers</li>
          <li><strong>Supplier Confirmed</strong> &mdash; All suppliers confirmed</li>
          <li><strong>Payment Received</strong> &mdash; Client has paid</li>
          <li><strong>Ready</strong> &mdash; Everything is set for the trip</li>
          <li><strong>In Progress</strong> &mdash; Client is currently traveling</li>
          <li><strong>Completed</strong> &mdash; Trip finished</li>
          <li><strong>Cancelled</strong></li>
        </ul>
        <DocScreenshot src="/docs/bookings/bookings-list.jpg" alt="Bookings list page with status cards and booking rows" />
      </section>

      {/* Booking Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Booking Detail Page</h2>
        <p className="text-gray-600 mb-3">Click any booking to see:</p>

        <h3 className="text-lg font-medium text-gray-900 mt-5 mb-3">Suppliers Tab</h3>
        <p className="text-gray-600 mb-3">
          Each service (hotel, guide, transport, etc.) has a confirmation status:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Pending</strong> &mdash; Not yet contacted</li>
          <li><strong>Requested</strong> &mdash; Confirmation requested</li>
          <li><strong>Confirmed</strong> &mdash; Supplier confirmed with a confirmation number</li>
          <li><strong>Issues</strong> &mdash; Problems that need attention</li>
          <li><strong>Rejected / Cancelled</strong></li>
        </ul>
        <Tip>
          Click <strong>Sync from Itinerary</strong> to automatically pull in all services from the linked itinerary.
        </Tip>
        <ScreenshotPlaceholder caption="Booking detail page showing Suppliers tab with confirmation statuses" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Payments Tab</h3>
        <p className="text-gray-600">
          View all payments received for this booking and link to the invoice.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Notes Tab</h3>
        <p className="text-gray-600">
          Add internal operational notes for your team.
        </p>
      </section>

      {/* Updating Supplier Status */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Updating Supplier Status</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the booking</li>
          <li>Go to the <strong>Suppliers</strong> tab</li>
          <li>Click on a supplier</li>
          <li>Update the status (e.g., Pending to Confirmed)</li>
          <li>Enter the <strong>confirmation number</strong> if applicable</li>
          <li>Add any notes</li>
        </ol>
        <ScreenshotPlaceholder caption="Supplier status update dialog with status dropdown and confirmation number field" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/itineraries"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Itineraries
        </Link>
        <Link
          href="/docs/invoices-payments"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Invoices &amp; Payments
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
