import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

export default function FollowupsRemindersPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Follow-ups &amp; Reminders</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Follow-ups &amp; Reminders</h1>
      <p className="text-gray-600 mb-8">
        Two separate tools keep you on schedule: <strong>Follow-ups</strong> track your commitments to clients (calls, quotes, feedback requests), while <strong>Payment Reminders</strong> chase unpaid invoices on a fixed schedule. This page covers both.
      </p>

      {/* Follow-ups */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Follow-ups (CRM)</h2>
        <p className="text-gray-600 mb-3">
          Follow-ups are always attached to a client and are created from the client&apos;s profile. To schedule one:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
          <li>Open the client&apos;s profile and use the <strong>Add Follow-up</strong> quick action</li>
          <li>Choose the <strong>Type</strong> &mdash; Phone Call, Email, WhatsApp Message, Meeting, Send Quote, Booking Confirmation, Payment Reminder, Request Feedback, or Other</li>
          <li>Enter a <strong>Description</strong> of what needs to happen</li>
          <li>Pick the <strong>Due Date</strong> (date only &mdash; no time of day)</li>
          <li>Set the <strong>Priority</strong> &mdash; Low, Medium, High, or Urgent</li>
          <li>Add optional <strong>Notes</strong> with extra context</li>
          <li>Click <strong>Schedule Follow-up</strong></li>
        </ol>
        <Tip>
          Follow-ups are created only from a client profile &mdash; there is no create button on the Follow-ups page itself, and follow-ups are not linked to itineraries.
        </Tip>
      </section>

      {/* Follow-ups Dashboard */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Follow-ups Dashboard</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>Follow-ups</strong> in the sidebar (under Operate). The page is a dashboard of everything pending:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Four clickable stat cards</strong> &mdash; <strong>Due Today</strong>, <strong>This Week</strong>, <strong>Overdue</strong>, and <strong>All Pending</strong>. Click a card to filter the list</li>
          <li><strong>Filters</strong> &mdash; Narrow the list by priority and by type</li>
          <li><strong>Mark complete</strong> &mdash; Tick off a follow-up when it&apos;s done</li>
          <li><strong>Edit and delete</strong> &mdash; Update any follow-up, or delete it (with a confirmation prompt)</li>
        </ul>
        <p className="text-gray-600">
          A follow-up counts as <strong>overdue</strong> automatically once its due date has passed without being completed &mdash; there is no separate status to set.
        </p>
        <DocScreenshot src="/docs/followups-reminders/followups.jpg" alt="Follow-ups dashboard with Due Today, This Week, Overdue, and All Pending stat cards and the pending list" />
      </section>

      {/* Payment Reminders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Reminders</h2>
        <p className="text-gray-600 mb-3">
          Payment Reminders handle one job: chasing unpaid invoices. The page has no sidebar entry &mdash; open it from an invoice&apos;s <strong>Reminder History</strong> link. It shows two tabs, <strong>Pending</strong> and <strong>History</strong>, plus stat tiles for <strong>Pending</strong>, <strong>Overdue</strong>, <strong>Due Soon</strong>, <strong>Paused</strong>, and <strong>Selected</strong>.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">The Reminder Schedule</h3>
        <p className="text-gray-600 mb-3">
          Each invoice follows a fixed schedule relative to its due date:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Before due</strong> &mdash; 7 days and 3 days before</li>
          <li><strong>On the due date</strong></li>
          <li><strong>After due</strong> &mdash; 7, 14, and 30 days overdue</li>
          <li><strong>Manual</strong> &mdash; Send an extra reminder at any time</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Sending and Managing</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Batch send</strong> &mdash; Multi-select pending reminders and send them together; you get a sent/failed result for each one</li>
          <li><strong>Pause / resume</strong> &mdash; Stop reminders for a specific invoice (e.g., while negotiating) and restart them later</li>
          <li><strong>History</strong> &mdash; The History tab lists every reminder sent, filterable by status</li>
        </ul>
        <Tip>
          Payment Reminders cover invoices only &mdash; for anything else (a callback, a supplier deadline, a feedback request), schedule a follow-up from the client&apos;s profile instead.
        </Tip>
        <DocScreenshot src="/docs/followups-reminders/reminders.jpg" alt="Payment Reminders page with Pending/History tabs, stat tiles, and batch-send selection" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/profit-loss" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Profit &amp; Loss
        </Link>
        <Link href="/docs/tours-rates" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Tours &amp; Rates
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
