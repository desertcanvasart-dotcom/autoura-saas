import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

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
        Keep track of every client interaction with scheduled follow-ups and automated reminders. Never miss a callback, a quote follow-up, or an important deadline.
      </p>

      {/* Follow-ups */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Follow-ups</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>Follow-ups</strong> in the sidebar. The follow-ups page lets you:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Schedule Follow-ups</strong> &mdash; Set a date and time to follow up with a client</li>
          <li><strong>Link to Client or Itinerary</strong> &mdash; Attach the follow-up to a specific client profile or itinerary</li>
          <li><strong>Set Priority</strong> &mdash; Mark follow-ups as low, normal, or high priority</li>
          <li><strong>Add Notes</strong> &mdash; Record what needs to be discussed or actioned</li>
          <li><strong>Track Status</strong> &mdash; Mark as pending, completed, or overdue</li>
        </ul>
        <DocScreenshot src="/docs/followups-reminders/followups.jpg" alt="Follow-ups list with scheduled dates, client names, and status indicators" />
      </section>

      {/* Creating a Follow-up */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Follow-up</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Follow-up</strong> or create one from a client profile</li>
          <li>Select the <strong>Client</strong> from the dropdown</li>
          <li>Choose the <strong>Follow-up Date</strong></li>
          <li>Select the <strong>Type</strong> (call, email, meeting, quote follow-up)</li>
          <li>Add <strong>Notes</strong> with context about the follow-up</li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <Tip>
          <strong>Quick Follow-up:</strong> You can also create follow-ups directly from the client profile page or from an itinerary detail page.
        </Tip>
      </section>

      {/* Reminders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reminders</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>Reminders</strong> in the sidebar. Reminders are broader notifications that can be set for:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Payment Due Dates</strong> &mdash; Remind you when a payment is expected</li>
          <li><strong>Trip Start Dates</strong> &mdash; Alert before a client&apos;s trip begins</li>
          <li><strong>Supplier Deadlines</strong> &mdash; Booking confirmation deadlines</li>
          <li><strong>General Tasks</strong> &mdash; Any custom reminder you need</li>
        </ul>
        <ScreenshotPlaceholder caption="Reminders page with upcoming reminders sorted by date" />
      </section>

      {/* Dashboard Integration */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Dashboard Integration</h2>
        <p className="text-gray-600 mb-3">
          Your upcoming follow-ups and reminders appear on the <strong>Dashboard</strong> for quick access. Overdue items are highlighted in red so you can prioritize them immediately.
        </p>
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
