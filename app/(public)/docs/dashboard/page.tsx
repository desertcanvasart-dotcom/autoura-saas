import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function DashboardPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Dashboard</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <p className="text-gray-600 mb-8">
        The dashboard is your home base. It greets you by name and shows the things that need your attention today: trips about to depart, money still owed, messages waiting for a reply, and quotes your clients haven&apos;t answered yet.
      </p>

      <DocScreenshot src="/docs/dashboard/full-dashboard.jpg" alt="Dashboard with greeting, four action cards, list panels, and quick action buttons" />

      {/* Action Cards */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Action Cards</h2>
        <p className="text-gray-600 mb-3">Four cards at the top summarize what needs attention. Click a card to jump straight to the relevant page:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Departing in N days</strong> &mdash; Bookings with upcoming departure dates. Click through to <strong>Bookings</strong>.</li>
          <li><strong>Outstanding</strong> &mdash; The total amount clients still owe you. Click through to <strong>Invoices</strong>.</li>
          <li><strong>Needs a reply</strong> &mdash; Conversations waiting on you. Click through to the <strong>Inbox</strong>.</li>
          <li><strong>Quotes awaiting client</strong> &mdash; Quotes sent but not yet answered. Click through to <strong>B2C Quotes</strong>.</li>
        </ul>
        <Tip>
          If a figure can&apos;t be loaded, the card shows a dash (&mdash;) instead of a misleading zero, and a warning banner appears at the top of the page.
        </Tip>
      </section>

      {/* List Panels */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">List Panels</h2>
        <p className="text-gray-600 mb-3">Below the cards, four panels list the specific items behind the numbers:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Departing soon</strong> &mdash; The next trips to depart, so nothing sneaks up on you</li>
          <li><strong>Clients reading their proposal</strong> &mdash; Clients who have opened the itinerary link you shared with them. This is proposal open/view tracking &mdash; a great signal for a well-timed follow-up call.</li>
          <li><strong>Largest balances owed</strong> &mdash; The invoices with the biggest outstanding amounts</li>
          <li><strong>Waiting on your reply</strong> &mdash; Conversations where the client spoke last</li>
        </ul>
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <p className="text-gray-600 mb-3">Shortcut buttons for the most common tasks:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>New Quote</strong> &mdash; Start a new itinerary/quote. On B2B-only workspaces this opens the Tour Manager instead.</li>
          <li><strong>Rates Hub</strong> &mdash; View and update your pricing</li>
          <li><strong>B2B Packages</strong> &mdash; Browse ready-made tour packages (hidden on B2C-only workspaces)</li>
          <li><strong>Clients</strong> &mdash; Jump to your client list</li>
        </ul>
      </section>

      {/* Analytics */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Analytics</h2>
        <p className="text-gray-600">
          The dashboard is deliberately focused on what needs action <em>today</em>. For trends and totals &mdash; revenue, bookings, and performance over time &mdash; open <strong>Analytics</strong> in the sidebar (just under Dashboard).
        </p>
        <DocScreenshot src="/docs/dashboard/analytics.jpg" alt="Analytics page with revenue and booking trend charts" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/getting-started"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Getting Started
        </Link>
        <Link
          href="/docs/communication"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Communication
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
