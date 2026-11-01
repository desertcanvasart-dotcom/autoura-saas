import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/followups-reminders')

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
        Two separate tools keep you on schedule: <strong>Follow-ups</strong> are your own commitments to a client (a call, a quote, a feedback request), and <strong>Payment Reminders</strong> are the emails that chase unpaid invoices.
      </p>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Scheduling a Follow-up</h2>
        <p className="text-gray-600 mb-3">
          A follow-up belongs to a client. Open the client and click <strong>Add Follow-up</strong> &mdash; in <strong>Quick Actions</strong> on the Overview tab, or on the <strong>Follow-ups</strong> tab. In <strong>Add Follow-up</strong>:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Follow-up Type</strong> &mdash; Phone Call, Email, WhatsApp Message, Meeting, Send Quote, Booking Confirmation, Payment Reminder, Request Feedback, or Other. It becomes the follow-up&apos;s title, with the client&apos;s name.</li>
          <li><strong>Due Date</strong> &mdash; a day, today or later</li>
          <li><strong>Priority</strong> &mdash; Low, Medium or High</li>
          <li><strong>Assigned to</strong> &mdash; who on the team should do it (leave it unassigned for anyone to pick up)</li>
          <li><strong>Notes (Optional)</strong> &mdash; any details or context</li>
          <li>Click <strong>Schedule Follow-up</strong></li>
        </ol>
        <p className="text-gray-600">
          The client&apos;s <strong>Follow-ups</strong> tab lists all of them, done ones included. The pencil on a pending one opens <strong>Edit Follow-up</strong> (<strong>Update Follow-up</strong>, or <strong>Delete</strong>), and <strong>Mark Complete</strong> closes it. A client with overdue follow-ups shows a red alert at the top of the profile, and follow-ups appear in the client&apos;s timeline.
        </p>
      </section>

      {/* Dashboard */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Follow-ups Tab</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Tasks</strong> in the sidebar (Operate) and choose the <strong>Follow-ups</strong> tab: the <strong>Follow-up Dashboard</strong> of everything still pending. Managers and admins see every follow-up and can reassign one; members see the ones assigned to them, the ones they created, and the unassigned ones. It opens on today&apos;s:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Due Today</strong>, <strong>This Week</strong> (the next seven days), <strong>Overdue</strong> and <strong>All Pending</strong> &mdash; click one to show it</li>
          <li><strong>Filters</strong> by priority and by type (Phone Call, Email, WhatsApp, Meeting, Send Quote)</li>
          <li><strong>Each follow-up</strong> &mdash; the client (click to open), priority, type, due date (marked Today or Overdue), who it is assigned to, notes, and the client&apos;s phone and email to call or write</li>
          <li><strong>Complete</strong>, <strong>Snooze 1 day</strong> or <strong>Snooze 1 week</strong> (from today), and <strong>Delete</strong></li>
        </ul>
        <p className="text-gray-600">
          New follow-ups are made from the client, not here. A follow-up is overdue once its day has passed &mdash; there is no status to set. With nothing to show: <em>&ldquo;All Caught Up!&rdquo;</em>
        </p>
        <DocScreenshot src="/docs/followups-reminders/followups.jpg" alt="Tasks page, Follow-ups tab: the Follow-up Dashboard with Due Today, This Week, Overdue, and All Pending stat cards and the pending list" />
      </section>

      {/* Payment Reminders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Reminders</h2>
        <p className="text-gray-600 mb-3">
          Payment Reminders email clients about unpaid invoices. The page has no sidebar entry: open an invoice and click <strong>View All</strong> on its <strong>Reminder History</strong> card.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Which Invoices, and When</h3>
        <p className="text-gray-600 mb-3">
          An invoice is reminded while it is Sent, Viewed, Partially Paid or Overdue, has a due date and a balance, and the client has an email. Once a day:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>The <strong>first reminder</strong> goes 7 days before the due date &mdash; or straight away, for an invoice already closer to its due date or past it</li>
          <li>Then <strong>one every 7 days</strong> until the invoice is paid, paused, or no longer awaiting payment. A reminder that fails to send is tried again the next day.</li>
          <li>The email&apos;s wording follows where the invoice stands: upcoming, due, overdue, and &mdash; long overdue &mdash; urgent</li>
        </ul>
        <p className="text-gray-600 mb-4">
          Reminders are emails, sent from your company&apos;s address with replies going to your contact email. The days follow your company&apos;s time zone (<strong>Settings &rsaquo; Organization &rsaquo; Company</strong>).
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">The Pending Tab</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Pending</strong>, <strong>Overdue</strong>, <strong>Due Soon</strong> (within 7 days), <strong>Paused</strong> and <strong>Selected</strong></li>
          <li>Each invoice: client, balance, due date, the next reminder&apos;s type, how many have been sent, and <strong>Active</strong> or <strong>Paused</strong></li>
          <li><strong>Send Reminder</strong> sends one now; the next automatic one is then a week later</li>
          <li><strong>Pause Reminders</strong> / <strong>Resume Reminders</strong> stops and restarts them for that invoice; a paused one is left out of bulk sends</li>
          <li><strong>Select All Active</strong>, then <strong>Send Selected</strong> &mdash; or <strong>Send All Active</strong> &mdash; and the result says how many were sent and how many failed</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">The History Tab</h3>
        <p className="text-gray-600 mb-3">
          Every reminder sent or attempted: date and time, invoice, recipient, type, <strong>Sent</strong> or <strong>Failed</strong> (with the reason), and subject. Show <strong>All Reminders</strong>, <strong>Sent Only</strong> or <strong>Failed Only</strong>; <strong>Load More</strong> shows older ones. Each invoice&apos;s own reminders are also on its <strong>Reminder History</strong> card.
        </p>
        <Tip>
          <strong>Send Reminder</strong> on the <strong>Unpaid</strong> tab of Invoices opens an email draft in your own mail program; it is not sent or recorded by the app. Payment Reminders are for invoices only &mdash; for anything else, schedule a follow-up on the client.
        </Tip>
        <DocScreenshot src="/docs/followups-reminders/reminders.jpg" alt="Payment Reminders page with Pending/History tabs, stat tiles, and batch-send selection" />
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/followups-reminders" />
    </div>
  )
}
