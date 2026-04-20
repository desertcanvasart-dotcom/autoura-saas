import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function ClientsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Clients</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Clients</h1>

      {/* Viewing Clients */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Your Clients</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Clients</strong> in the sidebar. You will see a list of all your clients with their name, email, phone, nationality, total bookings, and total revenue.
        </p>
        <DocScreenshot src="/docs/clients/client-list.jpg" alt="Client list page with search, filters, and client rows" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Finding a Client</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Type in the <strong>Search</strong> bar (searches name, email, phone, or client code)</li>
          <li>Use the <strong>Filters</strong> to narrow by status, client type, lead source, or VIP status</li>
          <li><strong>Sort</strong> by name, revenue, number of bookings, or date added</li>
        </ul>
      </section>

      {/* Adding a Client */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a New Client</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click the <strong>Add New Client</strong> button (top right)</li>
          <li>Fill in the client details:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li>Name (required)</li>
              <li>Email</li>
              <li>Phone number</li>
              <li>Nationality</li>
              <li>Passport type (EU or Non-EU &mdash; this affects entrance fee pricing)</li>
            </ul>
          </li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <ScreenshotPlaceholder caption="Add new client form with name, email, phone, and passport type fields" />
      </section>

      {/* Client Details */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Client Details</h2>
        <p className="text-gray-600 mb-3">
          Click on any client name to see their full profile. The client page has these tabs:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Overview</strong> &mdash; All client information, VIP status, total bookings, revenue, tags</li>
          <li><strong>Communications</strong> &mdash; Every email, WhatsApp message, phone call logged with this client</li>
          <li><strong>Bookings</strong> &mdash; All itineraries and bookings linked to this client</li>
          <li><strong>Notes</strong> &mdash; Internal notes visible only to your team</li>
          <li><strong>Follow-ups</strong> &mdash; Tasks and reminders linked to this client</li>
        </ul>
        <ScreenshotPlaceholder caption="Client detail page with Overview tab selected showing client info, bookings count, and revenue" />
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <p className="text-gray-600 mb-3">From the client detail page, you can:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Add Follow-up</strong> &mdash; Create a reminder to call or email the client</li>
          <li><strong>Add Note</strong> &mdash; Write an internal note</li>
          <li><strong>Log Communication</strong> &mdash; Record a phone call, meeting, or other interaction</li>
        </ul>
        <Tip>
          <strong>Tip:</strong> Keep detailed notes on client preferences (dietary requirements, hotel preferences, etc.) so you can personalize future trips.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/communication"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Communication
        </Link>
        <Link
          href="/docs/itineraries"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Itineraries
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
