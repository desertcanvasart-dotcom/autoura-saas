import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/tasks-departures')

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
        Three tools in the sidebar&apos;s <strong>Operate</strong> group: <strong>Tasks</strong> and <strong>Tour Departures</strong> for managers and admins, and the <strong>Capacity Calendar</strong> for admins.
      </p>

      {/* Tasks */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tasks</h2>
        <p className="text-gray-600 mb-3">
          The team&apos;s to-do board. Three views, by the icons at the top right: <strong>Kanban</strong> (the default, columns To Do, In Progress and Done), <strong>Table</strong> and <strong>List</strong>.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Cards</strong> &mdash; Total, To Do, In Progress, Done, Overdue, Due Today, High Priority (high and urgent) and Archived, across all tasks</li>
          <li><strong>Search tasks&hellip;</strong>, the quick filters <strong>Overdue</strong>, <strong>Due Today</strong> and <strong>This Week</strong> (the next seven days), and <strong>Filters</strong> for status, priority, who it is assigned to and due date</li>
          <li><strong>Table</strong> sorts by title, status, priority, due date or assignee; Table and List show 10 to 100 per page</li>
          <li>Overdue tasks are tinted red; a task due today has an amber date</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding a Task</h3>
        <p className="text-gray-600 mb-3">
          <strong>+ Add Task</strong> asks for a <strong>Title</strong>, <strong>Description</strong>, <strong>Due Date</strong>, <strong>Priority</strong> (Low, Medium, High, Urgent), <strong>Assign To</strong>, <strong>Link To</strong> (a client or itinerary from a list; an invoice or expense by its ID) and <strong>Notes</strong>. A new task starts in To Do. The person it is assigned to is notified in the app and by email, with the due date &mdash; and again if it is reassigned to someone else.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Working Through Tasks</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Start</strong>, <strong>Complete</strong> and <strong>Reopen</strong> on a card; <strong>Mark Complete</strong> in the table; in List, click the status icon</li>
          <li><strong>Archive</strong> puts any task away; <strong>Archive Done</strong> archives every finished one at once. <strong>Show Archived</strong> shows them, and <strong>Unarchive</strong> brings one back.</li>
          <li><strong>Delete</strong> removes a task for good, after asking</li>
          <li>The person assigned is reminded the day before a task is due, and again while it is overdue (every three days), as your notification settings allow</li>
          <li>When a task someone else created is completed, they are told (their <strong>Task Completed</strong> setting decides how)</li>
        </ul>
        <DocScreenshot src="/docs/tasks-departures/tasks.jpg" alt="Tasks page in Kanban view with metric cards across the top, the filter bar, and the To Do / In Progress / Done columns" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Operations Tasks from a Trip</h3>
        <p className="text-gray-600 mb-3">
          On an itinerary, the <strong>Tasks</strong> card (<strong>Create tasks</strong> / <strong>Sync tasks</strong>) or <strong>&#8943; &rarr; Operations tasks</strong> turns the trip&apos;s services into one task per kind &mdash; Accommodation, Flights, Transportation, Guides, Airport services, Hotel services, Meals, Entrance tickets, Other services &mdash; each for the department that books it:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>Each is due a set number of days before the trip (two weeks for hotels and flights, a week for transport and guides, fewer for the rest), and goes to the person you pick for each department</li>
          <li>The task holds a <strong>Checklist</strong>: day, date, city, service and supplier for each line, with a box to tick and the supplier&apos;s confirmation number. Its status follows the ticks.</li>
          <li><strong>Sync tasks</strong> after the trip changes: new lines are added, ticks and confirmation numbers are kept, and a line that left the trip is marked <em>&ldquo;No longer on the itinerary &mdash; cancel this booking&rdquo;</em> until you mark it <strong>Cancelled</strong></li>
          <li>Kinds with no department set up are skipped, and said so</li>
        </ul>
      </section>

      {/* Departures */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tour Departures</h2>
        <p className="text-gray-600 mb-3">
          Scheduled group departures &mdash; a tour on a date that travellers join. The list opens on <strong>Upcoming</strong>; the filter also offers All, Open, Limited, Full, Guaranteed and Cancelled, and <strong>Search tours&hellip;</strong> finds a tour by name or code. Each row shows the tour, its date and length, <strong>booked/max (N left)</strong> with a bar (yellow from 80%, red when full), the price per person, and its status.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Status</strong> &mdash; change it from the row. As bookings come in it turns <strong>Limited</strong> at 80% and <strong>Full</strong> at 100% by itself, and <strong>Guaranteed</strong> once a guaranteed departure reaches its minimum.</li>
          <li><strong>Clone</strong> &mdash; the same tour on a new date</li>
          <li><strong>Delete</strong> &mdash; only while it has no pending or confirmed bookings</li>
        </ul>
        <DocScreenshot src="/docs/tasks-departures/departures.jpg" alt="Departures list with rows showing status badges, booked/max capacity with spots remaining, occupancy bars, and price per person" />
        <p className="text-gray-600 mt-3">
          <strong>New Departure</strong> asks for the <strong>Tour Template</strong> (or a <strong>Tour Name</strong> and <strong>Duration</strong> without one), the <strong>Start Date</strong>, <strong>Max Pax</strong> and <strong>Min Pax</strong>, the <strong>Price per Person</strong>, and the <strong>Status</strong>: <em>Draft (not visible)</em> or <em>Open (accepting bookings)</em>. One departure per tour per date.
        </p>
        <DocScreenshot src="/docs/tasks-departures/new-departure-modal.jpg" alt="New Departure modal showing template, name, start date, duration, max/min pax, price per person, and status fields" />
        <Tip>
          The WhatsApp AI offers group tours from your departures that are Open, Limited or Guaranteed, have room for the party, and start after the booking cutoff.
        </Tip>
      </section>

      {/* Capacity */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Capacity Calendar</h2>
        <p className="text-gray-600 mb-3">
          A month calendar of how much you can take on each day, read by the WhatsApp AI. Two views: <strong>General Capacity</strong> and <strong>Tour Departures</strong>.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">General Capacity</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>Click a date (today or later). <strong>Quick Status</strong> sets it <strong>Available</strong>, <strong>Limited</strong>, <strong>Busy</strong> or <strong>Blackout</strong>.</li>
          <li><strong>Edit Capacity</strong> sets its <strong>Max Groups</strong>, the groups <strong>Booked outside Autoura</strong> (your bookings here count by themselves: each live booking counts on every day from its start to its end), a <strong>Reason</strong> for a blackout, and <strong>Notes</strong></li>
          <li><strong>Default Settings</strong> &mdash; the limit for any day without its own entry; <strong>Save</strong> keeps it. Blank means no limit.</li>
          <li>A booking that would go over a day&rsquo;s limit, or fall on a Blackout day, is refused with the days named &mdash; from a quote or by confirming an itinerary (the itinerary is still confirmed). A manager or admin can <strong>Book anyway</strong>.</li>
          <li>Changed dates are marked; <strong>Save N Changes</strong> saves them all. Leaving the page before saving loses them.</li>
        </ul>
        <DocScreenshot src="/docs/tasks-departures/capacity.jpg" alt="Capacity calendar in General Capacity view showing a month with date statuses (available/limited/busy/blackout) and per-date capacity settings" />
        <Tip>
          <strong>What the WhatsApp AI does with it:</strong> on a <strong>Blackout</strong> date it tells the client you are not operating, with your reason; when a date is full (its groups at its limit) it says the dates are busy and offers others; otherwise it says the dates work. For a trip starting within three days it does not check the calendar and answers that the notice is short.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Departures</h3>
        <p className="text-gray-600">
          Pick a tour or an itinerary from <strong>Select a tour or itinerary&hellip;</strong>. For a tour, the calendar shows its departures in the month, with the days each one runs; click a date for <strong>Departures on &hellip;</strong> with the seats booked and left. For an itinerary, it marks the trip&apos;s start and each of its days.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/tasks-departures" />
    </div>
  )
}
