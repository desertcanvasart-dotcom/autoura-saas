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
        When a client accepts a quote, you convert it into a booking. Bookings track the operational side of a confirmed trip: passenger details, payments, and status from deposit through completion.
      </p>

      {/* Creating a Booking */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Booking</h2>
        <p className="text-gray-600 mb-3">
          Bookings are created from quotes, not from itineraries:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the quote detail page (B2C or B2B)</li>
          <li>Click <strong>Convert to Booking</strong></li>
          <li>The booking is created and linked to the quote</li>
        </ol>
        <Tip>
          Each quote can be converted to a booking only once. After conversion, the quote links through to its booking.
        </Tip>
      </section>

      {/* Viewing Bookings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Bookings</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>All Bookings</strong> in the sidebar. Stat cards at the top show <strong>Total Bookings</strong>, <strong>Pending Deposit</strong>, <strong>Confirmed</strong>, <strong>In Progress</strong>, and <strong>Completed</strong> counts. Use the status filter dropdown to narrow the list, and if your account has both B2C and B2B workspaces, tabs let you switch between them.
        </p>
        <p className="text-gray-600 mb-3">A booking moves through six statuses:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Pending Deposit</strong> &mdash; Created, waiting for the first payment</li>
          <li><strong>Confirmed</strong> &mdash; Deposit received, trip is confirmed</li>
          <li><strong>Paid in Full</strong> &mdash; The full amount has been paid</li>
          <li><strong>In Progress</strong> &mdash; Client is currently traveling</li>
          <li><strong>Completed</strong> &mdash; Trip finished</li>
          <li><strong>Cancelled</strong></li>
        </ul>
        <DocScreenshot src="/docs/bookings/bookings-list.jpg" alt="All Bookings list page with stat cards, status filter, and booking rows" />
      </section>

      {/* Booking Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Booking Detail Page</h2>
        <p className="text-gray-600 mb-3">
          Click any booking to open it. The detail page has four tabs:
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-5 mb-3">Overview Tab</h3>
        <p className="text-gray-600 mb-3">
          Shows the core booking information alongside a <strong>Payment Summary</strong> with a progress bar indicating the percentage paid so far.
        </p>
        <ScreenshotPlaceholder caption="Booking detail Overview tab with booking information and Payment Summary progress bar" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Passengers Tab</h3>
        <p className="text-gray-600 mb-3">
          The full passenger manifest. Add, edit, or remove passengers with:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>Title, first name, and last name</li>
          <li>Date of birth and nationality</li>
          <li>Passport number</li>
          <li>Passenger type (adult, child, etc.)</li>
          <li>Lead-passenger flag</li>
          <li>Contact details</li>
        </ul>
        <ScreenshotPlaceholder caption="Passengers tab with the manifest list and add-passenger form" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Payments Tab</h3>
        <p className="text-gray-600 mb-3">
          Every payment recorded against the booking, with payment number, type, status, amount, method, date, reference, and notes. Payment types are <strong>deposit</strong>, <strong>installment</strong>, <strong>balance</strong>, and <strong>full payment</strong>.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Documents Tab</h3>
        <p className="text-gray-600">
          A placeholder for now &mdash; document management for bookings will be available soon.
        </p>
      </section>

      {/* Confirmations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending Booking Confirmations</h2>
        <p className="text-gray-600 mb-3">
          For B2C bookings, the header offers <strong>Send Email</strong> and <strong>WhatsApp</strong> actions to send the client a booking confirmation.
        </p>
        <Tip>
          The WhatsApp option requires a phone number on the client record.
        </Tip>
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
