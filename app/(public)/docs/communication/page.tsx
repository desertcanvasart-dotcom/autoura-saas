import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

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
        Everything you use to talk with clients lives in the <strong>Communicate</strong> group, second in the sidebar right under Home: Conversations, Inbox (email), WhatsApp, Concierge Leads, Copilot and its knowledge base, Message Templates, Email Signatures, and the Content Library.
      </p>

      {/* Conversations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Conversations (Unified View)</h2>
        <p className="text-gray-600">
          <strong>Conversations</strong> is the first item in the Communicate group. It brings your WhatsApp chats and email threads together in one box, so you can see every exchange with a client regardless of channel. Use it when you want the full picture; use the dedicated WhatsApp and Inbox pages when you&apos;re working a single channel.
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
          <li>Go to <strong>WhatsApp</strong> in the sidebar (under Communicate)</li>
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

      {/* Parse to the Pricing Grid */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Parse a Request into the Pricing Grid</h2>
        <p className="text-gray-600 mb-4">
          Every email and WhatsApp conversation has a <strong>Parse</strong> button. It sends the conversation straight to the <strong>Pricing Grid</strong> &mdash; the pricing engine &mdash; which reads it, lays out the trip day by day and prices every day from your rate sheets.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">How to Use It</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the email or WhatsApp conversation and click <strong>Parse</strong></li>
          <li>The Pricing Grid opens and parses the conversation: days, cities, travellers, start date and nationality are filled in for you</li>
          <li>Review each day, adjust services, tier and margin, then <strong>Save</strong></li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The Client in your CRM</h3>
        <p className="text-gray-600 mb-4">
          The saved itinerary and quote always land on a CRM client. If the conversation is already linked to a client, that client is used (a green <strong>CRM client</strong> tag shows in the grid). Otherwise the grid matches a client by email, then phone. If none exists, a new <strong>Lead</strong> is created from the name and contact details &mdash; and for WhatsApp, the chat is linked to that Lead too.
        </p>
        <Tip>
          Changing the email or phone in the grid points the save at whoever owns the new details; correcting the spelling of the name keeps the same client.
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
        <DocScreenshot src="/docs/communication/email-inbox.jpg" alt="Email inbox showing the message list with sender, subject, and preview for each email" />
      </section>

      {/* Copilot */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot (AI-Drafted Replies)</h2>
        <p className="text-gray-600 mb-3">
          Copilot drafts replies to incoming messages for you &mdash; you always review and send; nothing goes out automatically. The suite has four pages; the first two sit in the Communicate group, Copilot Settings under Settings (admins), and Copilot Analytics under Home:
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
          Inquiries submitted through your concierge intake form arrive as briefs under <strong>Concierge Leads</strong> (in the Communicate group). Treat it as another inbound channel: review each brief, then follow up by WhatsApp or email.
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
