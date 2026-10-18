import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/message-templates')

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
        Create, manage, and send pre-designed messages to clients, partners, suppliers, and team members via email, WhatsApp, or SMS. Templates save time by letting you reuse common messages with placeholders that fill in real data.
      </p>

      {/* Viewing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Templates</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Message Templates</strong> in the sidebar (Communicate group). Each card shows the template&apos;s name, category and subcategory, a channel icon, its language flag, the start of the message, and a <strong>v2</strong>, <strong>v3</strong>&hellip; badge once it has been edited.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Search templates&hellip;</strong> finds templates by name, description, or content</li>
          <li>Filter by category: <strong>All Templates</strong>, <strong>Customer</strong>, <strong>Supplier</strong>, <strong>B2B Partner</strong>, <strong>Internal</strong></li>
          <li>Filter by channel: <strong>All Channels</strong>, <strong>Email</strong>, <strong>WhatsApp</strong>, <strong>SMS</strong>, <strong>Both</strong> (a template for every channel shows under each)</li>
        </ul>
        <DocScreenshot src="/docs/message-templates/templates-list.jpg" alt="Message Templates list with search, category and channel filters, and template cards with Send buttons" />
      </section>

      {/* Starter */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Starter Templates</h2>
        <p className="text-gray-600">
          <strong>Load starter templates</strong> (in the header, and on an empty page) adds 37 ready-made English templates &mdash; quotes, confirmations, payment reminders, hotel and transport bookings, partner offers, team handovers &mdash; for email and WhatsApp, already written with the placeholders below. It skips any you already have, so it is safe to click again. Edit them to your own wording.
        </p>
      </section>

      {/* Creating a Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Template</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Template</strong></li>
          <li>Enter a <strong>Name</strong> (e.g., &ldquo;Booking Confirmation&rdquo;) and, if you like, a <strong>Description</strong></li>
          <li>Choose the <strong>Category</strong>:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Customer (B2C Travelers)</strong> &mdash; For client-facing messages</li>
              <li><strong>Supplier (Hotels, Cruises, Guides)</strong> &mdash; For hotels, cruises, transport and guides</li>
              <li><strong>B2B Partner (Tour Operators)</strong> &mdash; For the agencies you sell through</li>
              <li><strong>Internal (Team)</strong> &mdash; For team communications</li>
            </ul>
          </li>
          <li>Optionally set a <strong>Subcategory</strong>. For supplier templates it decides which list you send to: <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">cruise_hold</code> or <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">cruise_voucher</code> &rarr; Nile cruises; <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">transport_booking</code> or <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">transport_voucher</code> &rarr; transport; <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">guide_booking</code> or <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">guide_voucher</code> &rarr; guides; anything else &rarr; hotels. Type it exactly like that.</li>
          <li>Choose the <strong>Channel</strong>:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Email</strong> &mdash; Includes a subject line and body</li>
              <li><strong>WhatsApp</strong> &mdash; Body text only</li>
              <li><strong>SMS</strong> &mdash; Body text only</li>
              <li><strong>All Channels</strong> &mdash; You pick the channel when sending</li>
            </ul>
          </li>
          <li>Choose the <strong>Language</strong></li>
          <li>Write the <strong>Subject (Email)</strong> for email templates, and the <strong>Body</strong>. The <strong>Quick Insert Placeholders</strong> chips add a placeholder to the end of the body; the <strong>Live Preview</strong> highlights every placeholder you used.</li>
          <li>Click <strong>Create Template</strong> (<strong>Update Template</strong> when editing)</li>
        </ol>
        <ScreenshotPlaceholder caption="Template creation form with name, category, subcategory, channel, language, body, and live preview" />
      </section>

      {/* Placeholders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Placeholders</h2>
        <p className="text-gray-600 mb-4">
          A placeholder is a word in double braces, such as <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{'{{client_first_name}}'}</code>. When you send, it is replaced with real data &mdash; exactly as written, so spelling and capitals matter.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Placeholders That Fill Themselves</h3>
        <p className="text-gray-600 mb-3">
          Which ones fill depends on the template&apos;s category and the recipient you pick. Customer templates also take the trip and payment details from the client&apos;s <strong>most recent itinerary</strong>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Template</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Placeholders</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Every template (the sender)</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{agent_name}}'} {'{{company_name}}'} {'{{company_phone}}'} {'{{company_email}}'}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Customer &mdash; the client</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{client_name}}'} {'{{client_first_name}}'} {'{{client_email}}'} {'{{client_phone}}'}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Customer &mdash; their latest trip</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{trip_name}}'} {'{{itinerary_code}}'} {'{{booking_ref}}'} {'{{confirmation_number}}'} {'{{start_date}}'} {'{{end_date}}'} {'{{trip_dates}}'} {'{{total_days}}'} {'{{num_adults}}'} {'{{num_children}}'} {'{{total_travelers}}'}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Customer &mdash; money</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{total}}'} {'{{deposit}}'} {'{{balance}}'} {'{{total_paid}}'} {'{{currency}}'} {'{{payment_status}}'} {'{{deposit_due_date}}'} {'{{final_payment_due}}'}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">B2B Partner</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{partner_company}}'} {'{{partner_name}}'}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Supplier</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{supplier_name}}'} &mdash; and {'{{HotelName}}'}, {'{{CruiseName}}'}, {'{{GuideName}}'} or {'{{TransportCompany}}'} by subcategory</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Internal</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{team_member_name}}'}</td>
              </tr>
              <tr className=" bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Any template</td>
                <td className="px-4 py-2.5 font-mono text-xs">{'{{today}}'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Tip>
          Any other placeholder &mdash; a pickup time, a room type, a hotel&apos;s check-in date &mdash; gets a box under <strong>Fill Placeholders</strong> when you send, for you to type in. A placeholder left empty is sent as it is, braces and all, so fill every box. Put placeholders in the body: one that only appears in the email subject gets no box.
        </Tip>
      </section>

      {/* Sending a Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending a Template</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Send</strong> on a template card, or open <strong>Preview</strong> (the eye icon) and click <strong>Send This Template</strong></li>
          <li>The recipient list follows the template&apos;s category &mdash; <strong>Select Client</strong>, <strong>Select B2B Partner</strong>, <strong>Select Team Member</strong>, or for a supplier template the hotel, Nile cruise, transport or guide list its subcategory names</li>
          <li>Pick the recipient; the placeholders in the table above fill in</li>
          <li>Type anything still empty under <strong>Fill Placeholders</strong>. The <strong>Preview</strong> shows the message as it will go out.</li>
          <li>For a template on all channels, choose <strong>Send via</strong>: WhatsApp, SMS or Email. If the template has translations, choose the <strong>Language</strong>.</li>
          <li>Click <strong>Send WhatsApp</strong>, <strong>Send SMS</strong> or <strong>Send Email</strong></li>
        </ol>
        <p className="text-gray-600 mt-3">
          Email goes out from your own connected Gmail (connect it under <strong>Settings &rarr; Email</strong>); WhatsApp from your company&apos;s WhatsApp number.
        </p>
        <ScreenshotPlaceholder caption="Send template dialog with recipient selection, Fill Placeholders, and the preview" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Sending to Several People</h3>
        <p className="text-gray-600">
          Tick <strong>Bulk</strong>, select the recipients (or <strong>Select All</strong>), and click <strong>Send to N Recipients</strong>. Each one gets the message with their own details, and a progress bar shows it going out. Recipients without an email or phone for the chosen channel cannot be selected.
        </p>
      </section>

      {/* Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Templates in the Inbox</h2>
        <p className="text-gray-600">
          When you compose or reply in the email <strong>Inbox</strong>, the <strong>Templates</strong> menu lists your Customer, B2B Partner and Internal templates. Pick one, fill its placeholders from the client, partner or itinerary, and click <strong>Apply Template</strong>. WhatsApp-only templates are greyed out there.
        </p>
      </section>

      {/* Languages */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Languages and Translations</h2>
        <p className="text-gray-600">
          A template can be in English, Arabic, Spanish, French, German, Italian, Portuguese, Russian, Chinese or Japanese. <strong>Add Translation</strong> (from a template&apos;s menu) makes a copy in another language linked to the original; when you send, you choose the language.
        </p>
      </section>

      {/* Analytics */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Template Analytics</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Analytics</strong> in the header to open <strong>Template Analytics</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Templates</strong></li>
          <li><strong>Messages Sent</strong> &mdash; In the last 30 days</li>
          <li><strong>Success rate</strong> &mdash; The share of those sends that went out without error</li>
          <li><strong>Scheduled</strong> &mdash; Scheduled sending is not available yet, so this stays at 0</li>
          <li><strong>Most Used Templates</strong> &mdash; Your five most-used templates, with how many times each was used</li>
          <li><strong>Templates by Channel</strong> &mdash; How many templates you have for each channel</li>
        </ul>
        <ScreenshotPlaceholder caption="Template Analytics: Total Templates, Messages Sent, success rate, Most Used Templates and Templates by Channel" />
      </section>

      {/* Managing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Templates</h2>
        <p className="text-gray-600 mb-3">From a template card you can:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Copy</strong> &mdash; Copies the message to your clipboard</li>
          <li><strong>Preview</strong> &mdash; View the full template</li>
          <li>From the card&apos;s menu: <strong>Edit</strong>, <strong>Duplicate</strong> (a copy named &ldquo;&lt;name&gt; (Copy)&rdquo;), <strong>Add Translation</strong>, or <strong>Delete</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">Each send or copy counts as a use in the analytics.</p>
      </section>

      {/* Example Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Example Template</h2>
        <p className="text-gray-600 mb-3">A customer template where every placeholder fills itself from the client and their latest itinerary:</p>
        <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
          <p className="text-sm font-medium text-gray-900 mb-2">Booking Confirmation (WhatsApp, Customer)</p>
          <div className="text-sm text-gray-700 space-y-2 font-mono">
            <p>Hello {'{{client_first_name}}'},</p>
            <p>Your booking for {'{{trip_name}}'} is confirmed!</p>
            <p>Dates: {'{{trip_dates}}'}<br />
            Travelers: {'{{total_travelers}}'}<br />
            Reference: {'{{itinerary_code}}'}</p>
            <p>Total: {'{{total}}'}<br />
            Deposit: {'{{deposit}}'} by {'{{deposit_due_date}}'}</p>
            <p>Best regards,<br />{'{{agent_name}}'}<br />{'{{company_name}}'}</p>
          </div>
        </div>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/message-templates" />
    </div>
  )
}
