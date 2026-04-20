import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

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
        Itineraries are the heart of Autoura. An itinerary is a day-by-day trip plan with pricing that you send to clients as a quote.
      </p>

      {/* Viewing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Itineraries</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Itineraries</strong> in the sidebar. At the top, you see status cards:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Draft</strong> &mdash; Still being prepared</li>
          <li><strong>Sent</strong> &mdash; Sent to the client</li>
          <li><strong>Confirmed</strong> &mdash; Client accepted</li>
          <li><strong>Completed</strong> &mdash; Trip is over</li>
          <li><strong>Cancelled</strong> &mdash; Client declined</li>
        </ul>
        <p className="text-gray-600">Click any status card to filter the list. Use the search bar to find by client name, trip name, or itinerary code.</p>
        <DocScreenshot src="/docs/itineraries/itinerary-list.jpg" alt="Itineraries list page with status cards and search bar" />
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a New Itinerary</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Itinerary</strong></li>
          <li>Fill in:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Client Name</strong> (required)</li>
              <li><strong>Client Email</strong> and <strong>Phone</strong></li>
              <li><strong>Trip Name</strong> (e.g., &ldquo;6-Day Egypt Private Tour&rdquo;)</li>
              <li><strong>Start Date</strong> and <strong>End Date</strong> (total days calculated automatically)</li>
              <li><strong>Number of Adults</strong> (default: 2)</li>
              <li><strong>Number of Children</strong> ages 4-12 (50% discount)</li>
              <li><strong>Number of Infants</strong> ages 0-3 (free except flights)</li>
              <li><strong>Currency</strong> (EUR by default)</li>
              <li><strong>Notes</strong> (optional)</li>
            </ul>
          </li>
          <li>Click <strong>Create Itinerary</strong></li>
        </ol>
        <ScreenshotPlaceholder caption="New itinerary creation form with client info, dates, and traveler counts" />
      </section>

      {/* Editing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing an Itinerary</h2>
        <p className="text-gray-600 mb-4">
          From the itinerary detail page, click the <strong>Edit</strong> button (pencil icon).
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Adding Days</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Each day has a <strong>city</strong>, <strong>title</strong> (e.g., &ldquo;Arrival in Cairo&rdquo;), and <strong>description</strong></li>
          <li>Set the <strong>overnight city</strong> (where the client sleeps)</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Adding Services to Each Day</h3>
        <ol className="list-decimal list-inside space-y-1 text-gray-700 mb-4">
          <li>Click <strong>Add Service</strong> under any day</li>
          <li>Choose the type: Hotel, Guide, Transportation, Entrance Fee, Meal, Activity, Tips, Supplies, or other</li>
          <li>Enter the service name, quantity, and rates</li>
          <li>Costs calculate automatically in <strong>Auto</strong> mode</li>
        </ol>
        <ScreenshotPlaceholder caption="Itinerary edit page showing days with services, cost mode toggle, and add service button" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Cost Modes</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Auto</strong> &mdash; The system looks up your rates database and calculates costs automatically</li>
          <li><strong>Manual</strong> &mdash; You enter costs by hand for each service</li>
        </ul>
        <Tip>
          <strong>Tip:</strong> Keep your rates database up to date and use Auto cost mode for instant, accurate pricing.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Inclusions &amp; Exclusions</h3>
        <p className="text-gray-600">
          Add items that are included in the trip (e.g., &ldquo;All entrance fees&rdquo;, &ldquo;Private air-conditioned vehicle&rdquo;) and items that are NOT included (e.g., &ldquo;International flights&rdquo;, &ldquo;Travel insurance&rdquo;).
        </p>
      </section>

      {/* Viewing Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Itinerary Detail Page</h2>
        <p className="text-gray-600 mb-3">The detail page shows everything in a clean layout:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Client Info</strong> &mdash; Name, email, phone</li>
          <li><strong>Trip Summary</strong> &mdash; Dates, total days, travelers, total cost</li>
          <li><strong>Assigned Resources</strong> &mdash; Guide, vehicle, pickup details</li>
          <li><strong>Day-by-Day Breakdown</strong> &mdash; Click any day to expand services</li>
          <li><strong>Inclusions &amp; Exclusions</strong></li>
          <li><strong>Expenses</strong> &mdash; Costs logged against this itinerary</li>
          <li><strong>Profit &amp; Loss</strong> &mdash; Revenue vs. costs breakdown</li>
        </ul>
        <ScreenshotPlaceholder caption="Itinerary detail page with client info, trip summary, and day-by-day breakdown" />
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Itinerary Actions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What It Does</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Download PDF</td><td className="px-4 py-2.5">Creates a professional PDF document you can share</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Send via WhatsApp</td><td className="px-4 py-2.5">Sends the itinerary to the client on WhatsApp</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Send Email</td><td className="px-4 py-2.5">Emails the itinerary to the client</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Generate Invoice</td><td className="px-4 py-2.5">Creates an invoice from this itinerary</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Create Booking</td><td className="px-4 py-2.5">Converts confirmed itinerary into a booking</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Generate Commissions</td><td className="px-4 py-2.5">Calculates commissions for all services</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Generate Tasks</td><td className="px-4 py-2.5">Uses AI to create operational tasks</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Generate Documents</td><td className="px-4 py-2.5">Creates contracts and other documents</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Assigning Resources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Assigning Resources</h2>
        <p className="text-gray-600 mb-3">On the itinerary detail page, you can assign:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>A <strong>Guide</strong> from your guides database (with language spoken, daily rate)</li>
          <li>A <strong>Vehicle</strong> from your transportation database</li>
          <li><strong>Pickup location</strong> and <strong>pickup time</strong></li>
        </ul>
        <Tip>
          The system checks for scheduling conflicts and warns you if a guide or vehicle is already booked on those dates.
        </Tip>
        <ScreenshotPlaceholder caption="Resource assignment section showing guide and vehicle selection with conflict warnings" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Clients
        </Link>
        <Link
          href="/docs/bookings"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Bookings
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
