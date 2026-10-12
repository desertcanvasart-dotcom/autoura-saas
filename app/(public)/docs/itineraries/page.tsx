import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/itineraries')

export default function ItinerariesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Itineraries</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Itineraries</h1>
      <p className="text-gray-600 mb-8">
        An itinerary is a trip: its days, services and price, and everything that follows &mdash; sending, booking, invoicing and running it. Most start in the <Link href="/docs/itinerary-creation" className="text-primary-600 hover:underline">Quote Builder</Link>.
      </p>

      {/* List */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Itineraries List</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Itineraries</strong> (Sell group, managers and admins):
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Status cards</strong> &mdash; Total, Draft, Sent, Confirmed, Completed and Cancelled; click one to filter</li>
          <li><strong>N need attention</strong> &mdash; Shows only the trips with something to do</li>
          <li><strong>Search</strong> by client name, trip name or code</li>
          <li>Each row has a <strong>status menu</strong> and View, Edit and Delete. Setting a trip to <strong>Confirmed</strong> creates its booking. A trip with bookings, invoices, payments, commissions or sent quotes cannot be deleted.</li>
        </ul>
        <DocScreenshot src="/docs/itineraries/itinerary-list.jpg" alt="Itineraries list with status cards, search, and itinerary rows" />
      </section>

      {/* Create */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating an Itinerary by Hand</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Itinerary</strong></li>
          <li>Enter the <strong>Trip Name</strong>, <strong>Client Name</strong>, and the <strong>Start</strong> and <strong>End Date</strong> (the number of days is worked out)</li>
          <li>Add the <strong>Email Address</strong> and <strong>Phone Number</strong> &mdash; needed later to send the quote</li>
          <li>Set the <strong>Number of Adults</strong> and <strong>Children</strong>, the <strong>Currency</strong> (EUR, USD or GBP), and any notes</li>
          <li>Click <strong>Create Itinerary</strong>, then add the days in the editor</li>
        </ol>
        <DocScreenshot src="/docs/itineraries/new-itinerary.jpg" alt="New itinerary form with trip, client, date, traveller and currency fields" />
      </section>

      {/* Edit */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing an Itinerary</h2>
        <p className="text-gray-600 mb-3">
          Open the editor from the itinerary&apos;s <strong>&#8943;</strong> menu &rarr; <strong>Edit itinerary</strong>, or the pencil in the list.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Days</strong> &mdash; Each has a title; click <strong>Edit</strong> on a day for its city, description and where the night is spent (<strong>Overnight in</strong>, or <strong>No overnight</strong>). A night with a hotel booked takes the hotel&apos;s city.</li>
          <li><strong>Reorder</strong> &mdash; Drag a day card by its grip; the dates follow the new order when you save</li>
          <li><strong>Add Another Day</strong> and <strong>Remove this day</strong></li>
          <li><strong>Services &amp; Pricing</strong> &mdash; <strong>Add Service</strong> on a day: Transportation, Guide, Entrance Fee, Meal, Accommodation, Activity, Tips, Supplies or Service Fee, with its supplier, quantity and rate</li>
          <li><strong>Price in Grid</strong> &mdash; Saves and opens the trip in the Quote Builder, which prices every service from your rates</li>
          <li><strong>Save Changes</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">
          The client&apos;s details, the dates, travellers and currency are changed in the Quote Builder.
        </p>
        <ScreenshotPlaceholder caption="The itinerary editor with its day cards and the Price in Grid button" />
      </section>

      {/* Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Itinerary Page</h2>
        <p className="text-gray-600 mb-3">
          Across the top, the trip&apos;s <strong>stage</strong>: Quoted, Confirmed, Booked, Invoiced, Paid, Operated, Closed &mdash; and a list of what needs attention. Beside it:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Client</strong> &mdash; With Email, WhatsApp and Messages</li>
          <li><strong>Price</strong> &mdash; The total, days and travellers, what is paid and due, the costs recorded and the profit so far</li>
          <li><strong>Assigned to</strong> and the trip&apos;s <strong>Tasks</strong></li>
        </ul>
        <p className="text-gray-600 mt-3 mb-3">Four tabs, opening on the one that fits where the trip is:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Itinerary</strong> &mdash; The days and their services (<strong>Expand All</strong> / <strong>Collapse All</strong>), with each day&apos;s total and overnight. Costs follow your rates automatically; <strong>switch to manual</strong> lets you click a cost to change it.</li>
          <li><strong>Operations</strong> &mdash; Who covers each day, resource assignment, and the trip timeline</li>
          <li><strong>Finance</strong> &mdash; Invoices and payments, extra expenses, commissions, and profit &amp; loss</li>
          <li><strong>Messages</strong> &mdash; WhatsApp messages to the client, pickup details, and traveller chat</li>
        </ul>
        <ScreenshotPlaceholder caption="An itinerary page: the stage strip, the Client and Price panels, and the four tabs" />
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What You Can Do</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Menu</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What&apos;s in it</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Send</td>
                <td className="px-4 py-2.5"><strong>Send quote</strong> by WhatsApp or email (needs the client&apos;s phone or email; a draft becomes Sent), and <strong>Create</strong>, <strong>Copy</strong> or <strong>Revoke share link</strong></td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Documents</td>
                <td className="px-4 py-2.5"><strong>Itinerary PDF</strong> (a preview to download, print or email, with or without the price breakdown), <strong>Contract</strong>, and <strong>Create invoice</strong> &mdash; then the invoice itself</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Supplier docs</td>
                <td className="px-4 py-2.5">Hotel, transport and cruise vouchers, guide assignments and service orders, grouped by supplier</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">&#8943;</td>
                <td className="px-4 py-2.5">Edit itinerary, Add expense, Operations tasks, Generate commissions, Duplicate, Cancel trip / Reopen trip</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium">Main button</td>
                <td className="px-4 py-2.5">The next step for the trip&apos;s stage: Send quote, Convert to booking, Create invoice, Record payment, Assign resources, Close out trip&hellip;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Share */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sharing with the Client</h2>
        <p className="text-gray-600 mb-3">
          A share link opens a page for the client, under your brand, showing the trip day by day and the total for the travellers &mdash; never your costs. It always shows the latest version. A draft or unpriced itinerary cannot be shared.
        </p>
        <p className="text-gray-600 mb-3">
          The client&apos;s page also has live updates during the trip, their guide&apos;s and driver&apos;s contacts, a trip chat, and <strong>Report a problem</strong>. When they open it, the Dashboard shows it under <strong>Clients reading their proposal</strong>.
        </p>
        <ScreenshotPlaceholder caption="The client's shared itinerary page with your branding and the trip day by day" />
      </section>

      {/* Resources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Assigning Resources</h2>
        <p className="text-gray-600">
          In the <strong>Operations</strong> tab, assign guides (with their languages), drivers, vehicles, hotels, restaurants, Nile cruises, and airport and hotel staff. The coverage grid shows which days still need someone. If a guide or vehicle is also confirmed on another trip at the same time, a conflict warning names it. Pickup times and places are sent from the <strong>Messages</strong> tab (<strong>Pickup details</strong>).
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/itineraries" />
    </div>
  )
}
