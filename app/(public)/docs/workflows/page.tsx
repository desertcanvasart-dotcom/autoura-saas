import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/workflows')

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
          <li><strong>Receive inquiry</strong> &mdash; The client messages on WhatsApp. The conversation appears on the Inbox&apos;s <strong>WhatsApp</strong> tab.</li>
          <li><strong>Parse</strong> &mdash; Open the conversation and click <strong>Parse</strong>. The <strong>Quote Builder</strong> opens with the chat loaded, reads the trip from it and prices every day from your rates.</li>
          <li><strong>Review and adjust</strong> &mdash; Check the days, services, hotels and margin in the grid.</li>
          <li><strong>Save</strong> &mdash; <strong>Save as Itinerary</strong> creates the itinerary and its B2C quote; for a partner, <strong>Save as B2B Quote</strong>.</li>
          <li><strong>Send to client</strong> &mdash; Share the itinerary link, or send the quote PDF by WhatsApp or email.</li>
          <li><strong>Client accepts</strong> &mdash; Either set the itinerary&rsquo;s status to <strong>Confirmed</strong>, which creates its booking, or open the quote under <strong>Quotes</strong> (the B2C quotes tab, or B2B quotes for partners), set its status to <strong>Accepted</strong> and click <strong>Convert to Booking</strong>. Each quote converts once.</li>
          <li><strong>Confirm suppliers</strong> &mdash; In the booking, track each supplier&apos;s confirmation status.</li>
          <li><strong>Invoice and get paid</strong> &mdash; Create the invoice, send it, and record payments as they arrive.</li>
          <li><strong>Complete trip</strong> &mdash; After the trip, mark the booking as completed; managers and admins review its P&amp;L.</li>
        </ol>
      </section>

      {/* Quote pipeline */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working the Quote Pipeline</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Quotes</strong> (Sell section) &mdash; the <strong>B2C quotes</strong> tab &mdash; to see every quote and its status</li>
          <li>Chase the ones the client hasn&apos;t answered &mdash; the dashboard&apos;s <strong>Quotes awaiting client</strong> card takes you to the same list</li>
          <li>When a client says yes, open the quote, set it to <strong>Accepted</strong> and click <strong>Convert to Booking</strong></li>
        </ol>
        <Tip>
          Confirming an itinerary also creates its booking. Use one way or the other for a trip, not both.
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
          <li>Go to <strong>Leads</strong> (Communicate section) to see inbound briefs from your intake form</li>
          <li>Open a brief to review the trip request</li>
          <li>Follow up by WhatsApp or email &mdash; each brief already has its client in <strong>Clients</strong>, created when it arrived</li>
        </ol>
      </section>

      {/* Copilot replies */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Replying Faster with Copilot</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open <strong>Copilot</strong> in the sidebar, or the <strong>Copilot</strong> button in the top bar, to see AI-drafted replies to incoming messages</li>
          <li>Review each draft, edit if needed, then send &mdash; nothing is sent without your approval, unless an admin has switched on WhatsApp AI auto-reply</li>
          <li>On the Inbox&apos;s WhatsApp tab, Copilot suggestions also appear right in the composer</li>
          <li>Improve future drafts by adding facts to <strong>Copilot knowledge</strong> (Settings &rsaquo; Content &amp; AI, admins and managers); admins tune <strong>Copilot settings</strong></li>
        </ol>
      </section>

      {/* Quick Quote */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Quote (Under 5 Minutes)</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>On the Dashboard, click <strong>New Quote</strong> &mdash; this opens a simple new-itinerary form</li>
          <li>Enter the client, dates, and number of travelers, then create the itinerary</li>
          <li>Open <strong>&#8943;</strong> &rarr; <strong>Edit itinerary</strong> to add days and services, then <strong>Price in Grid</strong> to price them from your rates</li>
          <li>Open <strong>Documents</strong> &rarr; <strong>Itinerary PDF</strong> to download it, or <strong>Send</strong> &rarr; <strong>Send quote</strong> to send it to the client</li>
        </ol>
        <Tip>
          <strong>New Quote</strong> on the Dashboard opens the new-itinerary form. Most quotes start in the <strong>Quote Builder</strong> (Sell section): <strong>Parse</strong> a WhatsApp or email straight into it and it prices every day from your rates.
        </Tip>
      </section>

      {/* Recording Expense */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording an Expense Against a Trip</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the itinerary</li>
          <li>Open <strong>&#8943;</strong> &rarr; <strong>Add expense</strong></li>
          <li>Enter the category, amount, and supplier</li>
          <li>The expense automatically appears in the itinerary&apos;s P&amp;L</li>
        </ol>
      </section>

      {/* Payment Reminder */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Chasing Payments</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Receivables</strong> (Finance section; managers and admins) &mdash; the <strong>Unpaid</strong> tab of Invoices &mdash; to see everything clients still owe</li>
          <li>Click the <strong>Send Reminder</strong> mail action on an overdue item &mdash; it opens a reminder email in your own mail program, to send yourself</li>
          <li>The app also emails reminders by itself, weekly from a week before the due date: open the invoice and click <strong>View All</strong> on its <strong>Reminder History</strong> for the Payment Reminders page</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The invoice detail page itself gives you <strong>Send via WhatsApp</strong>, <strong>Download PDF</strong>, <strong>Mark as Sent</strong>, and <strong>Record Payment</strong>.
        </p>
      </section>

      {/* B2B */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working with B2B Partners</h2>
        <p className="text-gray-600 mb-3">
          Selling to tour operators and agencies:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Partners</strong> &mdash; under <strong>Contacts &rarr; Partners</strong>: each partner&rsquo;s contact, currency and default margin. See <Link href="/docs/partners" className="text-primary-600 hover:underline">Partners</Link>.</li>
          <li><strong>B2B Calculator</strong> &mdash; a rate sheet for a tour programme, at the partner&rsquo;s margin. See <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>.</li>
          <li><strong>B2B quotes</strong> (a tab of Quotes) &mdash; quotes for partners from the Quote Builder in B2B mode, with their PDFs. See <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link>.</li>
          <li><strong>Transport Packages</strong> &mdash; one price per vehicle for a cruise, a day tour or a road journey, which the calculator and Quote Builder apply. See <Link href="/docs/b2b-pricing-rules" className="text-primary-600 hover:underline">Transport Packages</Link>.</li>
        </ul>
      </section>

      {/* Tasks */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Tasks</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Tasks</strong> (Operate section). Managers and admins see every task; members see the tasks assigned to them and the unassigned ones. Client follow-ups are on the page&apos;s <strong>Follow-ups</strong> tab. Switch between three views with the icons at the top of the Tasks tab:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Kanban Board</strong> &mdash; columns To Do, In Progress and Done; move a card with its <strong>Start</strong> and <strong>Complete</strong> buttons</li>
          <li><strong>Table View</strong> &mdash; Spreadsheet-style list with sorting</li>
          <li><strong>List View</strong> &mdash; Simple list with filters</li>
        </ul>
        <DocScreenshot src="/docs/workflows/tasks.jpg" alt="Tasks page, Tasks tab, showing Kanban board with draggable task cards" />
      </section>

      {/* Tips */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tips &amp; Shortcuts</h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Status cards filter</strong> &mdash; On list pages such as Invoices and Bookings, click a status card at the top to filter</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Auto-pricing saves time</strong> &mdash; Keep your rates up to date and price in the Quote Builder (or <strong>Price in Grid</strong> from an itinerary): every day is priced from them</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Link everything</strong> &mdash; Link expenses to itineraries, tasks to clients, and commissions to services for a complete picture</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>WhatsApp is two-way</strong> &mdash; Clients can reply to your WhatsApp messages and those replies appear in your Inbox</span>
          </li>
          <li className="flex items-start gap-3 text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0" />
            <span><strong>Search</strong> &mdash; List pages have a search bar that looks across several fields, and <strong>&#8984;K</strong> (Ctrl&nbsp;K) anywhere jumps to any page, rate sheet, setting or client by name</span>
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

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/workflows" />
    </div>
  )
}
