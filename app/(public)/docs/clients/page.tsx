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
          Go to <strong>Clients</strong> in the sidebar. Stats cards at the top summarize your client base, and below them the list shows each client in columns: <strong>Client</strong>, <strong>Contact</strong>, <strong>Type &amp; Status</strong>, <strong>Lead Source</strong>, <strong>Bookings</strong>, <strong>Revenue</strong>, and <strong>Actions</strong>.
        </p>
        <DocScreenshot src="/docs/clients/client-list.jpg" alt="Client list with stats cards, search, filters, and columns for client, contact, type and status, lead source, bookings, and revenue" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Finding a Client</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Type in the <strong>Search</strong> bar (searches name, email, phone, or client code)</li>
          <li>Use the <strong>Filters</strong> to narrow by stage, client type, lead source, VIP status, or a date range</li>
          <li>Every client has a <strong>stage</strong>: a <strong>Lead</strong> has asked but not booked (that is how an inbound email, WhatsApp or concierge brief starts); the first booking makes them a <strong>Customer</strong> automatically. Inactive and Blocked are set by hand.</li>
          <li><strong>Sort</strong> by Most Recent, Oldest First, Name A-Z / Z-A, Revenue (high or low), or Bookings (Most)</li>
        </ul>
        <Tip>
          When filters are active, a count of applied filters appears with a <strong>Clear Filters</strong> button so you can reset the list in one click.
        </Tip>
      </section>

      {/* Adding a Client */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a New Client</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>New Client</strong> (top right). The form is a 5-step wizard:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Basic Info</strong> &mdash; First Name and Last Name (both required), plus nationality and passport type (<strong>Euro Passport</strong> or <strong>Other Passport</strong> &mdash; this affects entrance fee pricing)</li>
          <li><strong>Contact</strong> &mdash; Email, phone, and address details</li>
          <li><strong>Preferences</strong> &mdash; Travel preferences to help you personalize trips</li>
          <li><strong>Business</strong> &mdash; Company details for corporate clients</li>
          <li><strong>Classification</strong> &mdash; Client type, status, and lead source (WhatsApp, Email, Website, Referral, Phone, Social Media, Trade Show, or Other)</li>
        </ol>
        <p className="text-gray-600 mt-3">
          Click <strong>Create Client</strong> on the final step to save.
        </p>
        <DocScreenshot src="/docs/clients/new-client-wizard.jpg" alt="New Client wizard on the Basic Info step, showing First Name, Last Name, nationality, and passport type fields" />
        <Tip>
          Coming from WhatsApp? In the WhatsApp inbox, the <strong>Create</strong> button in a conversation header opens this form with the client&apos;s phone number already filled in.
        </Tip>
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
        <p className="text-gray-600 mt-3">
          The detail page is also where you can <strong>delete</strong> a client if a record was created by mistake.
        </p>
        <ScreenshotPlaceholder caption="Client detail page with Overview tab selected showing client info, bookings count, and revenue" />
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <p className="text-gray-600 mb-3">From the client detail page, you can:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Log Communication</strong> &mdash; Record a phone call, meeting, or other interaction</li>
          <li><strong>Add Follow-up</strong> &mdash; Create a reminder to call or email the client</li>
          <li><strong>Add Note</strong> &mdash; Write an internal note</li>
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
