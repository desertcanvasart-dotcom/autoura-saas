import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/dashboard')

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
        The dashboard is your home base: what departs soon, what clients owe, what is waiting for a reply, and what must be
        fixed before a group travels. Dates are counted in your company&rsquo;s timezone (Settings &rsaquo; Organization &rsaquo; Company).
      </p>

      <DocScreenshot src="/docs/dashboard/full-dashboard.jpg" alt="Dashboard with greeting, four action cards, list panels, and quick action buttons" />

      {/* Action Cards */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Action cards</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Departing in 14 days</strong> &mdash; live bookings (not completed or cancelled) leaving today or in the next 14 days, with the next date. Opens <strong>Bookings</strong>.</li>
          <li><strong>Outstanding</strong> &mdash; what clients still owe on sent, viewed, part-paid and overdue invoices, totalled <em>per currency</em> (an EGP invoice and a USD invoice show as two amounts, never added together), with how many are overdue. Opens <strong>Invoices</strong>.</li>
          <li><strong>Needs a reply</strong> &mdash; new, unanswered messages in the Inbox, across email and WhatsApp.</li>
          <li><strong>Quotes awaiting client</strong> &mdash; B2C quotes sent or viewed and not yet answered, with how many have had no reply for 5 days or more, or have expired.</li>
        </ul>
        <Tip>
          A figure that could not be loaded shows a dash (&mdash;), never a zero, and a banner names it.
        </Tip>
      </section>

      {/* Needs attention */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Needs attention</h2>
        <p className="text-gray-600 mb-3">
          The things to fix before a group travels, for departures in the next 45 days, each with a link to the screen that fixes it:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>a balance unpaid with its deadline reached or within 14 days;</li>
          <li>travellers with passport details or date of birth missing;</li>
          <li>no guide assigned on the trip&rsquo;s itinerary;</li>
          <li>a change request or extra from the traveller portal still pending;</li>
          <li>a conversation where the client has waited more than 24 hours for a reply (urgent after 48).</li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>Dismiss</strong> hides an item for the whole team until something about it changes; <strong>Undo</strong> brings it back.
        </p>
      </section>

      {/* Other panels */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Panels</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Expiring contracts</strong> (managers and admins) &mdash; supplier contracts expiring in the next 60 days or expired in the last 30.</li>
          <li><strong>Today on the ground</strong> &mdash; every trip running today with its latest check-in from the staff on it; <strong>ops view</strong> opens the full view.</li>
          <li><strong>Departing soon</strong> &mdash; the next five departures, with any balance due.</li>
          <li><strong>Clients reading their proposal</strong> &mdash; the five itineraries most recently opened from a shared link, with how many times and when. Trips already confirmed, completed or cancelled are left out. A good moment to call.</li>
          <li><strong>Largest balances owed</strong> &mdash; the five largest open invoice balances, each in its own currency, red when overdue.</li>
          <li><strong>Waiting on your reply</strong> &mdash; the three newest unanswered messages; click to open the Inbox.</li>
        </ul>
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick actions</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>New Quote</strong> &mdash; start a new itinerary.</li>
          <li><strong>Rates Hub</strong> (opens the Rates overview) and <strong>B2B Packages</strong> &mdash; managers and admins.</li>
          <li><strong>Clients</strong> &mdash; your client list, with the total.</li>
        </ul>
      </section>

      {/* Roles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What each role sees</h2>
        <p className="text-gray-600">
          Members see everything except Expiring contracts. Viewers see the departure, reply and quote counts and the panels
          without money &mdash; no Outstanding, no balances, no Needs attention &mdash; and nothing links to pages they cannot open.
        </p>
      </section>

      {/* Analytics */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reports</h2>
        <p className="text-gray-600">
          The dashboard is deliberately focused on what needs action <em>today</em>. For trends and totals &mdash; revenue, bookings, and performance over time &mdash; open <strong>Reports</strong> in the sidebar (just under Dashboard); it opens on the <strong>Analytics</strong> tab. See <Link href="/docs/analytics-reports" className="text-primary-600 hover:underline">Reports</Link>.
        </p>
        <DocScreenshot src="/docs/dashboard/analytics.jpg" alt="Reports, Analytics tab, with revenue and booking trend charts" />
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/dashboard" />
    </div>
  )
}
