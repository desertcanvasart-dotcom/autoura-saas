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
          Go to <strong>Itineraries</strong> in the sidebar. At the top, you see six status cards:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Total</strong> &mdash; All itineraries, regardless of status</li>
          <li><strong>Draft</strong> &mdash; Still being prepared</li>
          <li><strong>Sent</strong> &mdash; Sent to the client</li>
          <li><strong>Confirmed</strong> &mdash; Client accepted</li>
          <li><strong>Completed</strong> &mdash; Trip is over</li>
          <li><strong>Cancelled</strong> &mdash; Client declined</li>
        </ul>
        <p className="text-gray-600">Click any status card to filter the list. Use the search bar to find by client name, trip name, or itinerary code. Each row also has an inline status dropdown, so you can change an itinerary&apos;s status directly from the list.</p>
        <DocScreenshot src="/docs/itineraries/itinerary-list.jpg" alt="Itineraries list page with six status cards, search bar, and inline status dropdowns" />
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a New Itinerary</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Itinerary</strong></li>
          <li>Fill in:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Trip Name</strong> (required, e.g., &ldquo;6-Day Egypt Private Tour&rdquo;)</li>
              <li><strong>Client Name</strong> (required)</li>
              <li><strong>Start Date</strong> and <strong>End Date</strong> (required &mdash; total days calculated automatically)</li>
              <li><strong>Adults</strong></li>
              <li><strong>Children</strong> (0&ndash;50)</li>
              <li><strong>Currency</strong> (EUR, USD, or GBP)</li>
            </ul>
          </li>
          <li>Click <strong>Create Itinerary</strong></li>
        </ol>
        <DocScreenshot src="/docs/itineraries/new-itinerary.jpg" alt="New itinerary form with trip name, client name, dates, adults, children, and currency" />
      </section>

      {/* Editing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing an Itinerary</h2>
        <p className="text-gray-600 mb-4">
          From the itinerary detail page, click the <strong>Edit</strong> button (pencil icon). The editor shows a workflow status bar across the top &mdash; <strong>AI Generated &rarr; Edit Content &rarr; Calculate Pricing &rarr; Download PDF</strong> &mdash; so you always know which step the itinerary is at. (The pricing step&apos;s button is labeled <strong>Price in Grid</strong>.)
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Working with Days</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Each day has a <strong>city</strong>, <strong>title</strong> (e.g., &ldquo;Arrival in Cairo&rdquo;), and <strong>description</strong></li>
          <li>Set the <strong>overnight city</strong> (where the client sleeps)</li>
          <li>Reorder days by <strong>drag and drop</strong> &mdash; use the &ldquo;Drag to reorder&rdquo; handle on each day card</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Adding Services to Each Day</h3>
        <ol className="list-decimal list-inside space-y-1 text-gray-700 mb-4">
          <li>Click <strong>Add Service</strong> under any day</li>
          <li>Choose the type: Hotel, Guide, Transportation, Entrance Fee, Meal, Activity, Tips, or other</li>
          <li>Enter the service name, quantity, and rates</li>
        </ol>
        <DocScreenshot src="/docs/itineraries/editor.jpg" alt="Itinerary editor showing the workflow status bar, draggable day cards, and the Price in Grid button" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Pricing the Itinerary</h3>
        <p className="text-gray-600 mb-3">
          Click <strong>Price in Grid</strong> to open the itinerary in the pricing grid, where every service is matched to your rate tables and the quote recalculates live. See <Link href="/docs/b2c-pricing" className="text-primary-600 hover:text-primary-700">B2C Pricing</Link> for the full flow.
        </p>
        <Tip>
          <strong>Tip:</strong> Keep your rates database up to date so the grid prices every slot automatically &mdash; you only edit the slots you want to change.
        </Tip>
      </section>

      {/* Viewing Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Itinerary Detail Page</h2>
        <p className="text-gray-600 mb-3">The detail page shows everything in a clean layout:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Client Info</strong> &mdash; Name, email, phone</li>
          <li><strong>Trip Summary</strong> &mdash; Dates, total days, travelers, total cost</li>
          <li><strong>Assigned Resources</strong> &mdash; Guide, vehicle, pickup details</li>
          <li><strong>Day-by-Day Breakdown</strong> &mdash; Click any day to expand services</li>
          <li><strong>Expenses</strong> &mdash; Costs logged against this itinerary</li>
          <li><strong>Profit &amp; Loss</strong> &mdash; Revenue vs. costs breakdown</li>
        </ul>
        <p className="text-gray-600">
          The detail page also has an <strong>Auto / Manual</strong> cost mode toggle. In <strong>Auto</strong> mode, costs come from the pricing calculation. Switch to <strong>Manual</strong> to edit each service&apos;s cost inline, right on the detail page.
        </p>
        <DocScreenshot src="/docs/itineraries/detail.jpg" alt="Itinerary detail page with client info, trip summary, and day-by-day breakdown" />
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Itinerary Actions</h2>
        <p className="text-gray-600 mb-3">The action bar at the top of the detail page offers:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What It Does</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Send Quote</td><td className="px-4 py-2.5">Opens a modal with WhatsApp and Email options &mdash; each option is disabled if the client has no phone or email on file</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Invoice</td><td className="px-4 py-2.5">Creates an invoice from this itinerary; once one exists, the button becomes a link named after the invoice</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Commissions</td><td className="px-4 py-2.5">Calculates commissions for all services</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Generate Documents</td><td className="px-4 py-2.5">Creates trip documents from the itinerary</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Contract</td><td className="px-4 py-2.5">Opens the contract page for this itinerary</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Share</td><td className="px-4 py-2.5">Creates a public share link for the client (see below)</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">PDF</td><td className="px-4 py-2.5">Creates a professional PDF document you can share</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Add Expense</td><td className="px-4 py-2.5">Logs a cost against this itinerary</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Edit</td><td className="px-4 py-2.5">Opens the itinerary editor</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Share Link */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sharing with the Client</h2>
        <p className="text-gray-600 mb-3">
          The <strong>Share</strong> action generates a private, token-protected web page for the itinerary &mdash; a link like <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/share/&lt;token&gt;</code> that you can send to the client instead of (or alongside) a PDF:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Branded</strong> &mdash; The page carries your logo and brand colors</li>
          <li><strong>Client-safe</strong> &mdash; Shows the client total only, never your costs or margin</li>
          <li><strong>Always current</strong> &mdash; The page always shows the latest version of the itinerary, so edits appear without re-sending</li>
          <li><strong>Tracked</strong> &mdash; You see the view count and when the client last viewed it</li>
          <li><strong>Revocable</strong> &mdash; Disable the link at any time to cut off access</li>
        </ul>
        <ScreenshotPlaceholder caption="Public shared itinerary page with operator branding, day-by-day plan, and client total" />
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
