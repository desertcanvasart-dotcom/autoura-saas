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
        The dashboard is your home base. When you log in, you see everything at a glance.
      </p>

      <DocScreenshot src="/docs/dashboard/full-dashboard.jpg" alt="Full dashboard view with stats cards, quick actions, and recent activity" />

      {/* Quick Stats */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Stats</h2>
        <p className="text-gray-600 mb-3">Four cards at the top showing:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Clients</strong> in the system</li>
          <li><strong>Pending Follow-ups</strong> that need your attention</li>
          <li><strong>Client Quotes</strong> you have created</li>
          <li><strong>Upcoming Trips</strong> in the next 30 days</li>
        </ul>
        <DocScreenshot src="/docs/dashboard/quick-stats.jpg" alt="Quick stats cards showing client count, follow-ups, quotes, and upcoming trips" />
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <p className="text-gray-600 mb-3">Four buttons for the most common tasks:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Parse WhatsApp</strong> &mdash; Paste a WhatsApp conversation and let AI extract client details and trip requirements</li>
          <li><strong>New Quote</strong> &mdash; Create a new itinerary/quote from scratch</li>
          <li><strong>Rates Hub</strong> &mdash; View and update your pricing</li>
          <li><strong>B2B Packages</strong> &mdash; Browse ready-made tour packages</li>
        </ul>
        <Tip>
          <strong>Tip:</strong> The Parse WhatsApp button is the fastest way to turn a client inquiry into a professional quote.
        </Tip>
      </section>

      {/* Recent Activity */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-gray-600">
          A list of your latest itineraries and actions, so you can quickly pick up where you left off.
        </p>
      </section>

      {/* System Status */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">System Status</h2>
        <p className="text-gray-600">
          Small indicators showing whether the AI Parser, B2B Packages, and Email Service are online and working.
        </p>
        <DocScreenshot src="/docs/dashboard/system-status.jpg" alt="Quick Actions, Recent Activity, Today's Summary, and System Status indicators" />
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
