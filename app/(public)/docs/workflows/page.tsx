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
          <li><strong>Receive inquiry</strong> &mdash; The client messages on WhatsApp. The conversation appears in your WhatsApp inbox.</li>
          <li><strong>Parse with AI</strong> &mdash; Open the conversation and click <strong>Parse</strong>. The parser opens with the chat already loaded &mdash; no copying and pasting. Click <strong>Analyze with AI</strong> to extract the trip details.</li>
          <li><strong>Configure and confirm</strong> &mdash; Review the extracted details, choose the output (B2C quote, B2B quote, or itinerary only), and confirm the client (or click <strong>Create Client &amp; Generate</strong> for a new one).</li>
          <li><strong>Generate</strong> &mdash; Click <strong>Quick Generate</strong> for a one-shot itinerary, or <strong>Generate &amp; Edit</strong> to open it straight in the editor.</li>
          <li><strong>Review and edit</strong> &mdash; Adjust days, services, hotels, and pricing as needed.</li>
          <li><strong>Send to client</strong> &mdash; Share the itinerary link or download the PDF and send it via WhatsApp or email.</li>
          <li><strong>Client accepts</strong> &mdash; Open the quote&apos;s detail page (under <strong>B2C Quotes</strong>, or B2B Quotes for partners) and click <strong>Convert to Booking</strong>. Each quote can be converted once.</li>
          <li><strong>Confirm suppliers</strong> &mdash; In the booking, track each supplier&apos;s confirmation status.</li>
          <li><strong>Invoice and get paid</strong> &mdash; Create the invoice, send it, and record payments as they arrive.</li>
          <li><strong>Complete trip</strong> &mdash; After the trip, mark the booking as completed and review the P&amp;L.</li>
        </ol>
        <ScreenshotPlaceholder caption="Flow diagram showing the complete journey from WhatsApp message to completed booking" />
      </section>

      {/* Quote pipeline */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working the Quote Pipeline</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>B2C Quotes</strong> to see every quote and its status</li>
          <li>Chase the ones the client hasn&apos;t answered &mdash; the dashboard&apos;s <strong>Quotes awaiting client</strong> card takes you to the same list</li>
          <li>When a client says yes, open the quote and click <strong>Convert to Booking</strong></li>
        </ol>
        <Tip>
          Bookings are always created from a quote&apos;s detail page &mdash; convert the quote rather than looking for a booking button elsewhere.
        </Tip>
      </section>

      {/* Follow up on opened proposals */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Following Up When a Client Reads Their Proposal</h2>
        <p className="text-gray-600 mb-3">
          When you share an itinerary link, Autoura tracks when the client opens it. The dashboard&apos;s <strong>Clients reading their proposal</strong> panel shows who has been looking &mdash; the perfect moment to follow up:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Check the <strong>Clients reading their proposal</strong> panel on the dashboard</li>
          <li>If a client opened the proposal recently, message or call them while the trip is fresh in their mind</li>
          <li>Log the touchpoint on the client&apos;s profile</li>
        </ol>
      </section>

      {/* Concierge Leads */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Triaging Concierge Leads</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Concierge Leads</strong> (CRM group) to see inbound briefs from your intake form</li>
          <li>Open a brief to review the trip request</li>
          <li>Follow up by WhatsApp or email, and create a client record for promising leads</li>
        </ol>
      </section>

      {/* Copilot replies */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Replying Faster with Copilot</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open <strong>Copilot</strong> in the sidebar to see AI-drafted replies to incoming messages</li>
          <li>Review each draft, edit if needed, then send &mdash; nothing is ever sent without your approval</li>
          <li>In the WhatsApp inbox, Copilot suggestions also appear right in the composer</li>
          <li>Improve future drafts by adding facts to <strong>Copilot Knowledge</strong> and tuning <strong>Copilot Settings</strong></li>
        </ol>
      </section>

      {/* Quick Quote */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Quote (Under 5 Minutes)</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>On the Dashboard, click <strong>New Quote</strong> &mdash; this opens a simple new-itinerary form</li>
          <li>Enter the client, dates, and number of travelers, then create the itinerary</li>
          <li>On the itinerary&apos;s detail page, add days and services, and use the <strong>Auto</strong>/<strong>Manual</strong> cost toggle &mdash; Auto prices everything from your rates database</li>
          <li>Click <strong>Download PDF</strong> and send it to the client</li>
        </ol>
        <Tip>
          Two different &ldquo;New Quote&rdquo; buttons: the <strong>Dashboard</strong> quick action opens the plain new-itinerary form, while <strong>New Quote in the sidebar</strong> (Operations group) opens the <strong>Pricing Grid</strong> &mdash; the spreadsheet-style quoting surface. Use whichever fits the job.
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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Chasing Payments</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Receivables</strong> (Finance group) to see everything clients still owe</li>
          <li>Click the <strong>Send Reminder</strong> mail action on an overdue item &mdash; the reminder goes out by email</li>
          <li>To review past and scheduled reminders for an invoice, open the invoice and follow its <strong>Reminder History</strong> to the Payment Reminders page</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The invoice detail page itself gives you <strong>Send via WhatsApp</strong>, <strong>Download PDF</strong>, <strong>Mark as Sent</strong>, and <strong>Record Payment</strong>.
        </p>
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
            <span><strong>Auto-pricing saves time</strong> &mdash; Keep your rates database updated and use Auto cost mode on the itinerary page for instant pricing</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Link everything</strong> &mdash; Link expenses to itineraries, tasks to clients, and commissions to services for a complete picture</span>
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
          <li>Message the Autoura team via the floating <strong>Support Chat</strong> widget on any page &mdash; you&apos;ll be notified by email when they reply</li>
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
