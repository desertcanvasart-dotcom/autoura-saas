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
        Create, manage, and send pre-designed messages to clients, partners, and suppliers via WhatsApp or email. Templates save time by letting you reuse common messages with smart placeholders that auto-fill with real data.
      </p>

      {/* Viewing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Templates</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Templates</strong> in the sidebar. You will see all your message templates with their name, category, channel, and usage count.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>Use the <strong>Search</strong> bar to find templates by name, description, or content</li>
          <li>Filter by <strong>Category</strong> (Customer, Partner, Supplier, Internal)</li>
          <li>Filter by <strong>Channel</strong> (Email, WhatsApp, or Both)</li>
        </ul>
        <DocScreenshot src="/docs/message-templates/templates-list.jpg" alt="Message templates list page with search, category filter, and template cards" />
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
          <li>Choose the <strong>Channel</strong>:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Email</strong> &mdash; Includes subject line and body</li>
              <li><strong>WhatsApp</strong> &mdash; Body text only</li>
              <li><strong>Both</strong> &mdash; You pick the channel when sending</li>
            </ul>
          </li>
          <li>Write the <strong>Subject</strong> (for email templates)</li>
          <li>Write the <strong>Body</strong> using placeholders for dynamic content</li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <ScreenshotPlaceholder caption="Template creation form with name, category, channel, subject, and body fields" />
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
                <td className="px-4 py-2.5 font-medium">Guest Info</td>
                <td className="px-4 py-2.5">Name, email, phone, nationality, group size</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Trip Details</td>
                <td className="px-4 py-2.5">Trip name, dates, booking reference, cities, duration</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Accommodation</td>
                <td className="px-4 py-2.5">Hotel name, room type, meal plans</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Transportation</td>
                <td className="px-4 py-2.5">Guide/driver name, vehicle type, pickup times</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Financial</td>
                <td className="px-4 py-2.5">Total price, deposit amount, balance due, payment deadlines</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium">Company</td>
                <td className="px-4 py-2.5">Agent name, company name, ops manager contact</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Tip>
          The system automatically detects all placeholders in your template body. You don&apos;t need to register them &mdash; just type them in double curly braces.
        </Tip>
      </section>

      {/* Sending a Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending a Template</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the template you want to send</li>
          <li>Click <strong>Send</strong></li>
          <li>Select the <strong>Recipient</strong> &mdash; choose a client, partner, or supplier</li>
          <li>Optionally link an <strong>Itinerary</strong> to auto-fill trip-related placeholders</li>
          <li>Review the <strong>Live Preview</strong> &mdash; all placeholders are replaced with real data</li>
          <li>Edit the message if needed (you can override any auto-filled text)</li>
          <li>Choose the channel (if the template supports both Email and WhatsApp)</li>
          <li>Click <strong>Send</strong></li>
        </ol>
        <ScreenshotPlaceholder caption="Send template dialog with recipient selection, itinerary link, and live preview of auto-filled message" />
        <Tip>
          The system tracks how many times each template has been sent and when it was last used, so you can see which templates your team uses most.
        </Tip>
      </section>

      {/* Managing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Templates</h2>
        <p className="text-gray-600 mb-3">From the templates list, you can:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Edit</strong> &mdash; Update the name, content, or settings of any template</li>
          <li><strong>Preview</strong> &mdash; View the full template content before sending</li>
          <li><strong>Copy</strong> &mdash; Copy the template text to your clipboard for manual use</li>
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
            <p>Dates: {'{{StartDate}}'} &ndash; {'{{EndDate}}'}<br />
            Travelers: {'{{GroupSize}}'}<br />
            Reference: {'{{BookingReference}}'}</p>
            <p>Your guide {'{{GuideName}}'} will meet you at {'{{PickupLocation}}'} at {'{{PickupTime}}'}.</p>
            <p>Total: {'{{TotalPrice}}'}<br />
            Deposit paid: {'{{DepositAmount}}'}<br />
            Balance due: {'{{BalanceDue}}'} by {'{{PaymentDeadline}}'}</p>
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
