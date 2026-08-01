import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function CommunicationPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Communication</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Communication</h1>
      <p className="text-gray-600 mb-8">
        Everything you use to talk with clients lives in the <strong>Communication</strong> group in the sidebar: Conversations, Inbox (email), WhatsApp, the Copilot suite, Email Signatures, and Message Templates.
      </p>

      {/* Conversations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Conversations (Unified View)</h2>
        <p className="text-gray-600">
          <strong>Conversations</strong> is the first item in the Communication group. It brings your WhatsApp chats and email threads together in one box, so you can see every exchange with a client regardless of channel. Use it when you want the full picture; use the dedicated WhatsApp and Inbox pages when you&apos;re working a single channel.
        </p>
      </section>

      {/* WhatsApp Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp</h2>
        <p className="text-gray-600 mb-4">
          Manage all your WhatsApp business conversations in one place. When a client sends a message to your business WhatsApp number, it appears here automatically.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Using the Inbox</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>WhatsApp</strong> in the sidebar (under Communication)</li>
          <li>The left panel lists conversations with the latest message preview. Use the <strong>All</strong>, <strong>Mine</strong>, and <strong>Unassigned</strong> tabs to filter by assignment.</li>
          <li>Click a conversation to open the full chat on the right</li>
          <li>Type your reply at the bottom and send</li>
        </ol>
        <DocScreenshot src="/docs/communication/whatsapp-inbox.jpg" alt="WhatsApp inbox with All/Mine/Unassigned tabs, conversation list on the left, and an open chat with translation controls on the right" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Features</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Two-way AI translation</strong> &mdash; Set the customer&apos;s language and your own, then toggle <strong>Translation</strong> ON or OFF. Incoming messages can be translated per message (<strong>Translate</strong> / <strong>Show Original</strong>), and when you type a reply you see a <strong>&ldquo;Will send:&rdquo;</strong> preview of the translated text before it goes out.</li>
          <li><strong>Assignment</strong> &mdash; Claim a conversation or assign it to a specific team member, then filter with the All/Mine/Unassigned tabs</li>
          <li><strong>Copilot suggestions</strong> &mdash; An AI-suggested reply appears in the composer panel; review and use it, or ignore it and write your own</li>
          <li><strong>Client / Create buttons</strong> &mdash; In the conversation header, <strong>Client</strong> opens the linked client&apos;s profile, and <strong>Create</strong> starts a new client record with the phone number already filled in</li>
          <li><strong>Activity History</strong> &mdash; See what has happened on the conversation over time</li>
          <li><strong>Start a new chat</strong> &mdash; Open an outbound conversation to a new number</li>
          <li><strong>Delete conversation</strong> &mdash; Remove a conversation you no longer need</li>
        </ul>
        <Tip>
          WhatsApp is two-way: clients can reply to your messages and those replies appear in your inbox automatically. Sending an invoice over WhatsApp is done from the invoice&apos;s detail page, not from the inbox.
        </Tip>
      </section>

      {/* WhatsApp Parser */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp Parser (AI)</h2>
        <p className="text-gray-600 mb-4">
          The AI parser reads a WhatsApp conversation and extracts all the trip details automatically. This is the fastest way to turn a client inquiry into a professional quote &mdash; no copying and pasting needed.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">How to Use It</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the conversation in the WhatsApp inbox and click <strong>Parse</strong> &mdash; the parser opens with the conversation already loaded</li>
          <li><strong>Step 1 &mdash; Analyze:</strong> Click <strong>Analyze with AI</strong>. The AI extracts:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li>Client name, email, phone</li>
              <li>Nationality</li>
              <li>Desired travel dates and duration</li>
              <li>Number of travelers (adults and children)</li>
              <li>Cities and interests</li>
              <li>Budget tier</li>
              <li>Special requests</li>
            </ul>
          </li>
          <li><strong>Step 2 &mdash; Configure:</strong> Review the extracted details, pick the budget tier, and choose the output: a <strong>B2C quote</strong>, a <strong>B2B quote</strong>, both together, or an <strong>itinerary only</strong> (add quotes later)</li>
          <li><strong>Step 3 &mdash; Confirm Client:</strong> Match the inquiry to an existing client, or review the new client details and click <strong>Create Client &amp; Generate</strong></li>
          <li><strong>Step 4 &mdash; Generate:</strong> Click <strong>Quick Generate</strong> to build the itinerary in one go, or <strong>Generate &amp; Edit</strong> to open it in the editor straight away</li>
        </ol>
        <ScreenshotPlaceholder caption="WhatsApp Parser opened from a conversation, showing the 4-step wizard (Analyze, Configure, Confirm Client, Generate) with extracted trip details" />
        <Tip>
          If the client already sent you a day-by-day plan, the parser detects the structured itinerary and can follow it exactly instead of designing its own.
        </Tip>
      </section>

      {/* Email Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Inbox</h2>
        <p className="text-gray-600 mb-4">
          Manage your business emails directly within Autoura.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Connecting Gmail</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Settings</strong> and open the <strong>Email</strong> tab</li>
          <li>Click <strong>Connect Gmail</strong></li>
          <li>Sign in with your Google account and grant access</li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Using the Inbox</h3>
        <p className="text-gray-600 mb-3">
          Go to <strong>Inbox</strong> in the sidebar to see your emails. You can:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Read and reply with a rich text editor (formatting, links, images)</li>
          <li>Send new emails</li>
          <li>Insert a message template from the templates dropdown when composing</li>
          <li>Have your default email signature applied automatically</li>
          <li>View email threads</li>
          <li>Use Gmail labels for organization</li>
          <li>Download attachments</li>
          <li>Link emails to client records</li>
        </ul>
        <ScreenshotPlaceholder caption="Email inbox showing the email list and a compose window with the rich text editor, templates dropdown, and signature" />
      </section>

      {/* Copilot */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot (AI-Drafted Replies)</h2>
        <p className="text-gray-600 mb-3">
          Copilot drafts replies to incoming messages for you &mdash; you always review and send; nothing goes out automatically. The suite has four pages in the Communication group:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Copilot</strong> &mdash; The review queue: read each drafted reply, edit it if needed, and send or dismiss it</li>
          <li><strong>Copilot Knowledge</strong> &mdash; The facts and documents Copilot draws on when drafting</li>
          <li><strong>Copilot Settings</strong> &mdash; Control how and when Copilot drafts</li>
          <li><strong>Copilot Analytics</strong> &mdash; See how much Copilot is helping</li>
        </ul>
      </section>

      {/* Signatures & Concierge */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Signatures</h2>
        <p className="text-gray-600">
          Set up personal and team email signatures under <strong>Email Signatures</strong> in the sidebar. Your default signature is added automatically when you compose or reply from the Inbox.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Concierge Leads</h2>
        <p className="text-gray-600">
          Inquiries submitted through your concierge intake form arrive as briefs under <strong>Concierge Leads</strong> (in the CRM group). Treat it as another inbound channel: review each brief, then follow up by WhatsApp or email.
        </p>
      </section>

      {/* Support */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Need Help?</h2>
        <p className="text-gray-600">
          Use the floating <strong>Support Chat</strong> widget (bottom corner of every page) to message the Autoura support team &mdash; replies land back in the widget and you&apos;re notified by email.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Dashboard
        </Link>
        <Link
          href="/docs/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Clients
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
