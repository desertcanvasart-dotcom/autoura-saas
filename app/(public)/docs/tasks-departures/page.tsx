import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { DocScreenshot, Tip } from '../layout'

export default function TasksDeparturesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tasks, Departures &amp; Capacity</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Tasks, Departures &amp; Capacity</h1>
      <p className="text-gray-600 mb-8">
        Three tools keep day-to-day operations on track: <strong>Tasks</strong> for team to-dos, <strong>Tour Departures</strong> for scheduled group departures, and the <strong>Capacity</strong> calendar for controlling how much your operation takes on per date. All three live in the sidebar under <strong>Operate</strong> &mdash; Tasks and Departures for admin and manager roles, the <strong>Capacity Calendar</strong> (right under Tour Departures) admin-only.
      </p>

      {/* Tasks */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tasks</h2>
        <p className="text-gray-600 mb-3">
          The Tasks page (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/tasks</code>) tracks your team&rsquo;s work in three views &mdash; <strong>Kanban</strong>, <strong>Table</strong>, and <strong>List</strong>. Every task has:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Status</strong> &mdash; To Do, In Progress, or Done</li>
          <li><strong>Priority</strong> &mdash; low, medium, high, or urgent</li>
          <li><strong>Assignee and due date</strong> &mdash; who does it and by when</li>
        </ul>
        <p className="text-gray-600 mb-3">
          Metric cards at the top show the totals at a glance: total tasks, overdue, due today, and high priority. Below them you can filter by search, status, priority, assignee, and due date, plus a <strong>Show archived</strong> toggle. The table view supports sorting and pagination.
        </p>
        <DocScreenshot src="/docs/tasks-departures/tasks.jpg" alt="Tasks page in Kanban view with metric cards across the top, the filter bar, and the To Do / In Progress / Done columns" />

        <h3 className="text-lg font-medium text-gray-900 mb-2">Linking tasks to records</h3>
        <p className="text-gray-600 mb-3">
          A task can be linked to an <strong>itinerary</strong>, <strong>client</strong>, <strong>invoice</strong>, or <strong>expense</strong>. The linked record shows on the task row and links straight through, so &ldquo;chase payment for invoice X&rdquo; is one click from the invoice itself.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-2">Assignment notifications</h3>
        <p className="text-gray-600 mb-3">
          Assigning a task to a team member notifies them with an in-app notification that includes the due date, so nothing relies on someone remembering to check the board.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-2">Archiving and deleting</h3>
        <p className="text-gray-600">
          Finished tasks are <strong>soft-archived</strong> rather than destroyed &mdash; use the <strong>Show archived</strong> toggle to bring them back into view, and the bulk action to <strong>archive all done tasks</strong> in one go. Hard delete is also available and asks for confirmation first.
        </p>
      </section>

      {/* Departures */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tour Departures</h2>
        <p className="text-gray-600 mb-3">
          The Departures page (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/departures</code>) lists your scheduled group-tour departures, each optionally linked to a tour template (see <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Programs</Link>). Every departure carries a status with a colored badge:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {['Draft', 'Open', 'Limited', 'Full', 'Guaranteed', 'Cancelled'].map((s) => (
            <div key={s} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 text-center">{s}</div>
          ))}
        </div>
        <p className="text-gray-600 mb-3">
          The list defaults to the <strong>Upcoming</strong> filter and can be searched by tour name. Each row shows the start date, duration, tour code, capacity as booked/max with spots remaining, an occupancy bar (yellow at 80% or more, red at 100% or more), and the price per person. You can change status inline from a dropdown on the row (hidden once a departure is cancelled or full) and delete with a confirmation.
        </p>
        <DocScreenshot src="/docs/tasks-departures/departures.jpg" alt="Departures list with rows showing status badges, booked/max capacity with spots remaining, occupancy bars, and price per person" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Creating a departure</h3>
        <p className="text-gray-600">
          The <strong>New Departure</strong> modal takes a tour template, name, start date, duration, maximum and minimum pax, price per person, and the initial status.
        </p>
        <DocScreenshot src="/docs/tasks-departures/new-departure-modal.jpg" alt="New Departure modal showing template, name, start date, duration, max/min pax, price per person, and status fields" />
      </section>

      {/* Capacity */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Capacity Calendar</h2>
        <p className="text-gray-600 mb-3">
          The Capacity page (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/settings/capacity</code>, admin-only) is a month calendar with two views &mdash; <strong>General Capacity</strong> and <strong>Tours</strong>.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mb-2">General Capacity</h3>
        <p className="text-gray-600 mb-3">
          Each date gets a status &mdash; <strong>available</strong>, <strong>limited</strong>, <strong>busy</strong>, or <strong>blackout</strong> &mdash; plus per-date limits for maximum groups, guides, and vehicles, and a blackout reason where relevant. Edits are staged as you click through dates, then written all at once with the <strong>Save N Changes</strong> button.
        </p>
        <DocScreenshot src="/docs/tasks-departures/capacity.jpg" alt="Capacity calendar in General Capacity view showing a month with date statuses (available/limited/busy/blackout) and per-date capacity settings" />
        <Tip>
          <strong>The WhatsApp AI reads this calendar.</strong> When a client asks about dates, the assistant answers according to the date status: <strong>available</strong> &rarr; confirms the dates; <strong>limited</strong> &rarr; suggests booking soon; <strong>busy</strong> &rarr; suggests alternative dates; <strong>blackout</strong> &rarr; says you&rsquo;re unavailable. Hotel availability still needs separate confirmation &mdash; the calendar covers your own operation&rsquo;s capacity only.
        </Tip>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Tours view</h3>
        <p className="text-gray-600">
          The <strong>Tours</strong> view overlays your departures on the same calendar, listing the departures on each date and linking through to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/departures</code>.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
      </div>
    </div>
  )
}
