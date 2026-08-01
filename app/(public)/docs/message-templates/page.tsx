import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function MessageTemplatesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Message Templates</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Message Templates</h1>
      <p className="text-gray-600 mb-8">
        Create, manage, and send pre-designed messages to clients, partners, suppliers, and team members via email, WhatsApp, or SMS. Templates save time by letting you reuse common messages with smart placeholders that auto-fill with real data.
      </p>

      {/* Viewing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Templates</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Message Templates</strong> in the sidebar. You will see all your message templates with their name, category, subcategory badge, channel, and usage count.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>Use the <strong>Search</strong> bar to find templates by name, description, or content</li>
          <li>Filter by <strong>Category</strong> (Customer, Partner, Supplier, Internal)</li>
          <li>Filter by <strong>Channel</strong> (Email, WhatsApp, SMS, or Both)</li>
        </ul>
        <DocScreenshot src="/docs/message-templates/templates-list.jpg" alt="Message Templates list with search, category and channel filters, subcategory badges, and per-card Send buttons" />
      </section>

      {/* Creating a Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Template</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Template</strong></li>
          <li>Enter a <strong>Name</strong> for the template (e.g., &ldquo;Booking Confirmation&rdquo;)</li>
          <li>Add an optional <strong>Description</strong></li>
          <li>Choose the <strong>Category</strong>:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Customer</strong> &mdash; For client-facing messages</li>
              <li><strong>Partner</strong> &mdash; For B2B travel agency partners</li>
              <li><strong>Supplier</strong> &mdash; For hotels, transport, guides, etc.</li>
              <li><strong>Internal</strong> &mdash; For team communications</li>
            </ul>
          </li>
          <li>Optionally set a <strong>Subcategory</strong> (e.g., booking confirmation, transport booking, guide booking) &mdash; shown as a badge on the template card</li>
          <li>Choose the <strong>Channel</strong>:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Email</strong> &mdash; Includes subject line and body</li>
              <li><strong>WhatsApp</strong> &mdash; Body text only</li>
              <li><strong>SMS</strong> &mdash; Body text only</li>
              <li><strong>Both</strong> &mdash; You pick the channel when sending</li>
            </ul>
          </li>
          <li>Write the <strong>Subject</strong> (for email templates)</li>
          <li>Write the <strong>Body</strong> using placeholders for dynamic content &mdash; a live preview updates as you type</li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <ScreenshotPlaceholder caption="Template creation form with name, category, subcategory, channel, body, and live preview" />
      </section>

      {/* Placeholders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Smart Placeholders</h2>
        <p className="text-gray-600 mb-4">
          Placeholders are written as <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{'{{PlaceholderName}}'}</code> and are automatically replaced with real data when you send the message.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Available Placeholders</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Category</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Placeholders</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Guest</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{GuestName}}'} {'{{PaxCount}}'} {'{{Nationality}}'} {'{{ClientPhone}}'} {'{{ClientEmail}}'}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Trip</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{TripName}}'} {'{{TripDates}}'} {'{{BookingRef}}'} {'{{Cities}}'}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Hotel</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{HotelName}}'} {'{{RoomType}}'} {'{{MealPlan}}'}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Guide / Driver</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{GuideName}}'} {'{{GuidePhone}}'} {'{{DriverName}}'} {'{{VehicleType}}'}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Schedule</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{PickupTime}}'} {'{{PickupPoint}}'} {'{{Date}}'}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Financial</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{TotalPrice}}'} {'{{Currency}}'} {'{{DepositAmount}}'} {'{{DepositDeadline}}'} {'{{PaymentLink}}'}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium">Operations</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{OpsManagerName}}'} {'{{OpsManagerPhone}}'} {'{{AgentName}}'} {'{{CompanyName}}'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Tip>
          The system detects every <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{'{{...}}'}</code> placeholder in your body text, but only the registered placeholders above auto-fill from the recipient&apos;s record &mdash; anything else stays for you to fill in manually before sending.
        </Tip>
      </section>

      {/* Sending a Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending a Template</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Send</strong> on a template card, or open <strong>Preview</strong> and click <strong>Send This Template</strong></li>
          <li>The recipient type (client, partner, supplier, or team member) is pre-selected from the template&apos;s category &mdash; supplier templates even pick the right supplier list, so a hotel template fills <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{'{{HotelName}}'}</code>, a guide template fills <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{'{{GuideName}}'}</code>, and so on</li>
          <li>Select the <strong>Recipient</strong> &mdash; their name, phone, email, and other known fields auto-fill the placeholders</li>
          <li>Fill in trip-specific fields (dates, prices, pickup times) manually &mdash; these are not linked to an itinerary</li>
          <li>Review the <strong>Live Preview</strong> and edit the message if needed</li>
          <li>Choose the channel (if the template supports more than one)</li>
          <li>Click <strong>Send</strong></li>
        </ol>
        <ScreenshotPlaceholder caption="Send template dialog with recipient selection, auto-filled placeholders, and live preview" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Bulk and Scheduled Sending</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Bulk send</strong> &mdash; Select multiple recipients and send the same template to all of them, with live progress as each message goes out</li>
          <li><strong>Scheduled send</strong> &mdash; Pick a future date and time instead of sending immediately</li>
        </ul>
        <Tip>
          The system tracks how many times each template has been sent and when it was last used, so you can see which templates your team uses most.
        </Tip>
      </section>

      {/* Analytics */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Template Analytics</h2>
        <p className="text-gray-600 mb-3">
          The analytics panel on the templates page summarizes usage across your team:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Totals</strong> &mdash; Templates and messages sent overall</li>
          <li><strong>Sends in the last 30 days</strong></li>
          <li><strong>Success rate</strong> &mdash; Share of sends delivered without error</li>
          <li><strong>Top templates</strong> &mdash; Your most-used templates</li>
          <li><strong>Channel distribution</strong> &mdash; How sends split across email, WhatsApp, and SMS</li>
        </ul>
        <DocScreenshot src="/docs/message-templates/analytics-panel.jpg" alt="Templates page with the analytics panel showing totals, 30-day sends, success rate, top templates, and channel distribution" />
      </section>

      {/* Managing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Templates</h2>
        <p className="text-gray-600 mb-3">From the templates list, you can:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Edit</strong> &mdash; Update the name, content, or settings of any template</li>
          <li><strong>Preview</strong> &mdash; View the full template content before sending</li>
          <li><strong>Duplicate</strong> &mdash; Create a copy (named &ldquo;&lt;name&gt; (Copy)&rdquo;) to use as a starting point</li>
          <li><strong>Delete</strong> &mdash; Remove templates you no longer need</li>
        </ul>
      </section>

      {/* Example Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Example Template</h2>
        <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
          <p className="text-sm font-medium text-gray-900 mb-2">Booking Confirmation (WhatsApp)</p>
          <div className="text-sm text-gray-700 space-y-2 font-mono">
            <p>Hello {'{{GuestName}}'},</p>
            <p>Your booking for {'{{TripName}}'} has been confirmed!</p>
            <p>Dates: {'{{TripDates}}'}<br />
            Travelers: {'{{PaxCount}}'}<br />
            Reference: {'{{BookingRef}}'}</p>
            <p>Your guide {'{{GuideName}}'} will meet you at {'{{PickupPoint}}'} at {'{{PickupTime}}'}.</p>
            <p>Total: {'{{TotalPrice}}'} {'{{Currency}}'}<br />
            Deposit: {'{{DepositAmount}}'} {'{{Currency}}'} by {'{{DepositDeadline}}'}<br />
            Pay here: {'{{PaymentLink}}'}</p>
            <p>Best regards,<br />{'{{AgentName}}'}<br />{'{{CompanyName}}'}</p>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/resources-documents"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Resources &amp; Documents
        </Link>
        <Link
          href="/docs/team-settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Team &amp; Settings
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
