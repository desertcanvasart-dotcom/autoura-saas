import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/bookings')

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
        A booking is a sold trip: its travellers, payments, suppliers and extras in one place. A trip has one booking.
      </p>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Booking</h2>
        <p className="text-gray-600 mb-3">A booking is created in one of two ways:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>From an accepted quote</strong> &mdash; Open the B2C or B2B quote, set its status to <strong>Accepted</strong>, then click <strong>Convert to Booking</strong> and confirm <strong>Create booking</strong>. The button stays disabled until the quote is accepted.</li>
          <li><strong>From an itinerary</strong> &mdash; Confirming an itinerary creates its booking. On the itinerary page, <strong>Convert to Booking</strong> confirms it; <strong>Create Booking</strong> books an itinerary that is already confirmed; once booked, <strong>Go to Booking BK-&hellip;</strong> opens it. These bookings are marked <strong>DIRECT</strong>.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A new booking starts as <strong>Pending Deposit</strong>, with the deposit set by your company&apos;s deposit rule. A conversion is refused &mdash; and says why &mdash; when the quote has unpriced services, no price or no traveller count, when its itinerary has no dates, or when the trip is already booked.
        </p>
        <Tip>
          A quote converts only once: afterwards the button reads <strong>View booking BK-&hellip;</strong> and opens it. A quote with services that have no price asks first, and books it as it is if you choose <strong>Book as it is</strong>.
        </Tip>
      </section>

      {/* List */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Bookings List</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Bookings</strong> in the sidebar (Sell group):
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Tabs</strong> &mdash; <strong>All Bookings</strong>, <strong>B2C (Direct Clients)</strong> and <strong>B2B (Partners)</strong>. Bookings made from an itinerary show under All Bookings.</li>
          <li><strong>Stat cards</strong> &mdash; Total Bookings, Pending Deposit, Confirmed (including paid in full), In Progress and Completed</li>
          <li><strong>Search</strong> by booking number, client name or trip, and the <strong>status filter</strong></li>
        </ul>
        <DocScreenshot src="/docs/bookings/bookings-list.jpg" alt="The Bookings list with its tabs, stat cards, search and status filter" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Statuses</h3>
        <p className="text-gray-600 mb-3">Three follow the payments by themselves:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Pending Deposit</strong> &mdash; Less than the deposit has been paid</li>
          <li><strong>Confirmed</strong> &mdash; The deposit is paid (or any payment, when there is no deposit). A refund on a fully paid booking brings it back here.</li>
          <li><strong>Paid in Full</strong> &mdash; Everything is paid</li>
        </ul>
        <p className="text-gray-600 mt-3 mb-3">
          Managers and admins set the other three from the status menu at the top of the booking:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>In progress</strong> and <strong>Completed</strong> &mdash; The app checks that every supplier is confirmed first; <strong>Go ahead anyway</strong> moves on and records how many were</li>
          <li><strong>Cancelled</strong> &mdash; After you confirm <strong>Cancel booking</strong></li>
          <li><strong>Active (follows payments)</strong> &mdash; Reopens the booking and lets the payments decide again</li>
        </ul>
      </section>

      {/* Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Booking Page</h2>
        <p className="text-gray-600 mb-3">A booking has five tabs.</p>

        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-3">Overview</h3>
        <p className="text-gray-600">
          <strong>Booking Information</strong> (client, trip, dates, quote type) and the <strong>Payment Summary</strong> &mdash; total, paid, balance due and a bar with the share paid. Choose who on the team looks after the booking, and sell add-ons and upgrades in <strong>Extras and upgrades</strong> (see <Link href="/docs/extras" className="text-primary-600 hover:underline">Extras &amp; Upgrades</Link>).
        </p>
        <ScreenshotPlaceholder caption="Booking Overview: Booking Information, the Payment Summary bar, and Extras and upgrades" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Suppliers</h3>
        <p className="text-gray-600">
          Every supplier on the trip, by date: <strong>Sync from itinerary</strong> fills the list. For each, track the status (Pending, Contacted, Confirmed, No response, Not needed) and the confirmation number. Confirming a supplier adds its cost as a pending expense. Each cost is shown with its currency: the supplier&rsquo;s own (EGP for a guide, USD for a Nile cruise) when its itinerary lines were priced in it, otherwise the trip&rsquo;s &mdash; and the expense is recorded in that currency, as the supplier is paid. Changing a status or a confirmed cost never changes a row&rsquo;s currency.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Passengers</h3>
        <p className="text-gray-600 mb-3">
          The travellers on the booking. <strong>Add Passenger</strong> asks for the first and last name, passport number, type (Adult, Child or Infant) and whether they are the <strong>Lead Passenger</strong>. The rest &mdash; date of birth, nationality, passport details &mdash; travellers fill in themselves through the portal.
        </p>
        <p className="text-gray-600">
          <strong>Portal link</strong> creates the booking&apos;s traveller portal link (or reuses it) and copies it for you to send to the lead traveller.
        </p>
        <ScreenshotPlaceholder caption="Passengers tab with the passenger list, Add Passenger and Portal link" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Payments</h3>
        <p className="text-gray-600">
          Every payment with its number, type, status, amount, method, date, reference and notes. <strong>Record Payment</strong> (managers and admins) asks for the amount, the type (Deposit, Installment, Balance, Full Payment), the method (Bank Transfer, Credit Card, Cash, PayPal), a reference and notes. The booking&apos;s status updates with each payment.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Documents</h3>
        <p className="text-gray-600">
          <strong>Traveller uploads</strong>: the passport scans and documents travellers sent through the portal. Open each with <strong>View</strong>; the links are short-lived, and the files are deleted automatically after the trip.
        </p>
      </section>

      {/* Portal */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Traveller Portal</h2>
        <p className="text-gray-600 mb-3">
          The portal link lets travellers do their own paperwork. After confirming who they are, they:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Fill in each traveller&apos;s details and upload passports and other documents</li>
          <li>(The lead traveller) <strong>Invite your co-travellers</strong> with their own private links</li>
          <li>Ask to bring more people, which reaches you as a change request</li>
          <li>Answer the options and upgrades you offer, and ask for others</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A request to add travellers shows on the <strong>Passengers</strong> tab: <strong>Approve</strong> re-prices it per person and adds empty passenger rows; <strong>Reject</strong> declines it.
        </p>
        <p className="text-gray-600 mt-3">
          Once the details are final, <strong>Lock details</strong> (beside <strong>Portal link</strong>) stops changes: travellers still see the portal but can no longer edit their details, upload documents or ask for extras. <strong>Unlock details</strong> opens it again.
        </p>
      </section>

      {/* Confirmations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending the Confirmation</h2>
        <p className="text-gray-600">
          On a B2C or direct booking, <strong>Send Email</strong> and <strong>WhatsApp</strong> in the header send the client their booking confirmation (managers and admins). Each appears when there is somewhere to send it &mdash; the client&apos;s email, or their WhatsApp number or phone, from the client record or the itinerary. A B2B booking is confirmed to the partner instead.
        </p>
      </section>

      {/* Calendar */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Booking Calendar</h2>
        <p className="text-gray-600">
          <strong>Booking Calendar</strong> (Sell group) shows your trips by month, by week or as a timeline, with filters, stats and an export. Drag a trip to move its dates, and assign guides and vehicles &mdash; the calendar warns about overlaps.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/bookings" />
    </div>
  )
}
