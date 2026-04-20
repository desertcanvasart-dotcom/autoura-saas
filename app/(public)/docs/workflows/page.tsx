import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function WorkflowsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Workflows &amp; Tips</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Workflows &amp; Tips</h1>

      {/* WhatsApp to Booking */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">From WhatsApp Inquiry to Confirmed Booking</h2>
        <p className="text-gray-600 mb-4">
          The complete end-to-end workflow for handling a new client inquiry:
        </p>
        <ol className="list-decimal list-inside space-y-3 text-gray-700">
          <li><strong>Receive inquiry</strong> &mdash; Client messages on WhatsApp. The message appears in your WhatsApp Inbox.</li>
          <li><strong>Parse with AI</strong> &mdash; Copy the conversation and use the WhatsApp Parser. AI extracts all trip details.</li>
          <li><strong>Create itinerary</strong> &mdash; Click &ldquo;Create Itinerary&rdquo; from the parser results. A complete day-by-day plan with pricing is generated.</li>
          <li><strong>Review and edit</strong> &mdash; Open the itinerary editor. Adjust days, services, hotels, and pricing as needed.</li>
          <li><strong>Send to client</strong> &mdash; Download as PDF and send via WhatsApp or email.</li>
          <li><strong>Client confirms</strong> &mdash; Update the itinerary status to &ldquo;Confirmed.&rdquo;</li>
          <li><strong>Generate invoice</strong> &mdash; Click &ldquo;Generate Invoice&rdquo; to create the billing document.</li>
          <li><strong>Send invoice</strong> &mdash; Send via WhatsApp or email. Set up reminders for payment.</li>
          <li><strong>Create booking</strong> &mdash; The system creates a booking when you confirm the itinerary.</li>
          <li><strong>Confirm suppliers</strong> &mdash; In the booking, track each supplier&apos;s confirmation status.</li>
          <li><strong>Record payments</strong> &mdash; As the client pays, record payments on the invoice.</li>
          <li><strong>Generate tasks</strong> &mdash; Use AI to create operational tasks for your team.</li>
          <li><strong>Complete trip</strong> &mdash; After the trip, mark the booking as completed and review the P&amp;L.</li>
        </ol>
        <ScreenshotPlaceholder caption="Flow diagram showing the complete journey from WhatsApp message to completed booking" />
      </section>

      {/* Quick Quote */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Quote (Under 5 Minutes)</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Dashboard &gt; <strong>New Quote</strong></li>
          <li>Enter client name, dates, and number of travelers</li>
          <li>Use <strong>Auto</strong> cost mode to let the system price everything</li>
          <li>Add the days and services</li>
          <li>Click <strong>Download PDF</strong></li>
          <li>Send to the client</li>
        </ol>
        <Tip>
          Auto cost mode uses your rates database to calculate prices instantly. Keep your rates updated for the most accurate quotes.
        </Tip>
      </section>

      {/* Recording Expense */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording an Expense Against a Trip</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the itinerary</li>
          <li>Click <strong>Add Expense</strong></li>
          <li>Enter the category, amount, and supplier</li>
          <li>The expense automatically appears in the itinerary&apos;s P&amp;L</li>
        </ol>
      </section>

      {/* Payment Reminder */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending a Payment Reminder</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Invoices</strong></li>
          <li>Find the overdue invoice</li>
          <li>Click on it</li>
          <li>Click <strong>Send Reminder</strong></li>
          <li>Choose WhatsApp or Email</li>
        </ol>
      </section>

      {/* B2B */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working with B2B Partners</h2>
        <p className="text-gray-600 mb-3">
          Manage business-to-business relationships with other travel companies:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Partners</strong> &mdash; Go to <strong>B2B &gt; Partners</strong> to add partner companies, set pricing rules, and track performance</li>
          <li><strong>B2B Quotes</strong> &mdash; Create quotes with net pricing, apply partner-specific rules, and generate B2B PDFs</li>
          <li><strong>Pricing Rules</strong> &mdash; Set up partner-specific discounts, commission structures, and markup rules</li>
        </ul>
      </section>

      {/* Tasks */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Tasks</h2>
        <p className="text-gray-600 mb-3">
          Switch between three views using the buttons at the top of the Tasks page:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Kanban Board</strong> &mdash; Drag tasks between columns (To Do, In Progress, Done)</li>
          <li><strong>Table View</strong> &mdash; Spreadsheet-style list with sorting</li>
          <li><strong>List View</strong> &mdash; Simple list with filters</li>
        </ul>
        <DocScreenshot src="/docs/workflows/tasks.jpg" alt="Task management page showing Kanban board with draggable task cards" />
        <Tip>
          Use <strong>Generate Tasks</strong> from an itinerary to let AI create operational tasks automatically. For example, it will create tasks like &ldquo;Confirm hotel reservation&rdquo; and &ldquo;Book airport transfer.&rdquo;
        </Tip>
      </section>

      {/* Tips */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tips &amp; Shortcuts</h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Status cards are clickable</strong> &mdash; On any list page, click the status cards at the top to quickly filter</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Auto-pricing saves time</strong> &mdash; Keep your rates database updated and use Auto cost mode for instant pricing</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Link everything</strong> &mdash; Link expenses to itineraries, tasks to clients, and commissions to services for a complete picture</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Use AI for tasks</strong> &mdash; After building an itinerary, click &ldquo;Generate Tasks&rdquo; to automatically create your to-do list</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>PDF downloads are instant</strong> &mdash; PDFs are generated in your browser, no waiting for server processing</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>WhatsApp is two-way</strong> &mdash; Clients can reply to your WhatsApp messages and those replies appear in your inbox</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>The search bar works everywhere</strong> &mdash; Every list page has a search bar that searches across multiple fields</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Expand days for details</strong> &mdash; On itinerary pages, click a day to expand it and see all services</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Check for conflicts</strong> &mdash; When assigning guides or vehicles, the system warns you about scheduling conflicts</span>
          </li>
        </ul>
      </section>

      {/* Need Help */}
      <section className="mb-10 bg-gray-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Need Help?</h2>
        <p className="text-gray-600 mb-3">
          If you run into any issues or have questions:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Contact your system administrator</li>
          <li>Check this documentation for step-by-step instructions</li>
          <li>The system shows helpful error messages when something goes wrong</li>
        </ul>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link
          href="/docs/team-settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Team &amp; Settings
        </Link>
      </div>
    </div>
  )
}
