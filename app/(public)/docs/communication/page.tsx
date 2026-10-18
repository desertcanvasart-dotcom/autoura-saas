import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/communication')

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
      <p className="text-gray-600 mb-4">
        Everything you use to talk with clients lives in the <strong>Communicate</strong> group, second in the sidebar right under Home. It holds, in order:
      </p>
      <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
        <li><strong>Conversations</strong> &mdash; WhatsApp, email and trip chat in one place</li>
        <li><strong>Inbox</strong> &mdash; your connected Gmail</li>
        <li><strong>WhatsApp</strong> &mdash; the WhatsApp inbox</li>
        <li><strong>Concierge Leads</strong> &mdash; briefs from the AI Concierge (<Link href="/docs/concierge-leads" className="text-primary-600 hover:underline">guide</Link>)</li>
        <li><strong>Copilot</strong> and <strong>Copilot Knowledge</strong> &mdash; AI-drafted replies (<Link href="/docs/copilot" className="text-primary-600 hover:underline">guide</Link>)</li>
        <li><strong>Message Templates</strong> (<Link href="/docs/message-templates" className="text-primary-600 hover:underline">guide</Link>)</li>
        <li><strong>Email Signatures</strong></li>
        <li><strong>Content Library</strong>, <strong>AI Prompts</strong> and <strong>Writing Rules</strong> &mdash; admins and managers (<Link href="/docs/content-library" className="text-primary-600 hover:underline">guide</Link>)</li>
      </ul>
      <p className="text-gray-600 mb-8">
        Viewers do not see the Communicate group.
      </p>

      {/* Conversations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Conversations (Unified View)</h2>
        <p className="text-gray-600 mb-4">
          <strong>Conversations</strong> brings your WhatsApp chats, email threads and <strong>trip chat</strong> (messages travellers send from their shared trip page) together in one list, so you see every exchange with a client whatever the channel.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Filter</strong> by channel (All Channels, WhatsApp Only, Email Only, Trip Chat Only) and by status (Active, Archived, All), or <strong>search</strong> conversations</li>
          <li><strong>Star</strong> the ones to come back to; unread conversations carry a badge</li>
          <li><strong>Sync Emails</strong> pulls in the latest mail from your connected Gmail</li>
          <li><strong>Reply</strong> from the composer at the bottom: plain text on WhatsApp; on email a rich-text editor with your signatures and attachments. Both offer Copilot&apos;s suggested reply.</li>
          <li><strong>View Client</strong> opens the linked client&apos;s profile</li>
        </ul>
        <Tip>
          To parse a request into the Quote Builder, open it in the WhatsApp page or the Inbox &mdash; Conversations has no Parse button.
        </Tip>
      </section>

      {/* WhatsApp Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp</h2>
        <p className="text-gray-600 mb-4">
          When a client messages your business WhatsApp number, the conversation appears here automatically and the team is notified.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Using the Inbox</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>WhatsApp</strong> in the sidebar (under Communicate)</li>
          <li>The left panel lists conversations with the latest message, its time, an unread count and who it is assigned to. Use <strong>search</strong> to find one, or the <strong>All</strong>, <strong>Mine</strong> (assigned to you) and <strong>Unassigned</strong> tabs to filter.</li>
          <li>Click a conversation to open the chat on the right; it is marked read</li>
          <li>Type your reply in <strong>Type a message&hellip;</strong> and send. Each message you send shows whether it was sent, delivered, read or failed.</li>
        </ol>
        <p className="text-gray-600 mt-3">The list refreshes by itself every 15 seconds; the refresh button updates it at once.</p>
        <DocScreenshot src="/docs/communication/whatsapp-inbox.jpg" alt="WhatsApp inbox with the conversation list on the left and an open chat with translation controls on the right" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">In a Conversation</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Two-way AI translation</strong> &mdash; Pick the client&apos;s language under <strong>Send in:</strong> and yours under <strong>Read in:</strong>, then click <strong>Translate</strong> (it reads <strong>Translation ON</strong> while active). Incoming messages are translated for you, with the original underneath, and each can be switched with <strong>Translate</strong> / <strong>Show Original</strong>. As you type, a <strong>Will send:</strong> preview shows the translated text that goes out.</li>
          <li><strong>Assignment</strong> &mdash; From the header, <strong>Claim for myself</strong>, <strong>Assign to</strong> a team member, or <strong>Unassign</strong>. <strong>Manage Agents</strong> (top of the list) adds the team members who take WhatsApp conversations and marks them Available or Away. To claim conversations and use <strong>Mine</strong>, you must be one of them: add yourself with the email you sign in with.</li>
          <li><strong>AI Copilot</strong> &mdash; A draft already prepared for the latest message shows in the composer panel; otherwise click <strong>Suggest Reply</strong>. <strong>Use</strong> puts it in the composer to edit and send, or dismiss it.</li>
          <li><strong>Client</strong> / <strong>Create</strong> &mdash; <strong>Client</strong> opens the linked client&apos;s profile; <strong>Create</strong> starts a new client with the phone number filled in</li>
          <li><strong>Parse</strong> &mdash; Sends the whole chat to the Quote Builder (see below)</li>
          <li><strong>Activity History</strong> &mdash; The history icon shows what has happened on the conversation</li>
          <li><strong>New conversation</strong> &mdash; The green <strong>+</strong> opens <strong>New Conversation</strong>: enter the phone number and click <strong>Start Chat</strong></li>
          <li><strong>Delete</strong> &mdash; Hides the conversation from the inbox. If the client writes again, it comes back.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Photos and files a client sends are not shown in the inbox yet &mdash; ask them to email documents you need to see.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Your WhatsApp Number</h3>
        <p className="text-gray-600 mb-3">
          <strong>Settings &rarr; WhatsApp</strong> (admins) shows the number your clients see under <strong>Your WhatsApp number</strong>:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Your own number</strong> &mdash; Every message to it reaches your company, even from someone who has never written before: they are added to your clients as a new <strong>Lead</strong>, and everything you send goes out from your number. The Autoura team sets it up for you.</li>
          <li><strong>The shared platform number</strong> &mdash; Replies from your existing clients reach you, but someone writing to it for the first time cannot be matched to your company. Ask the Autoura team for your own number.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The same page has <strong>Test Connection</strong>, which sends a test message from your number, and <strong>AI Auto-Reply</strong>: when it is on, the AI answers incoming WhatsApp messages by itself.
        </p>
        <Tip>
          Invoices, quotes, receipts and reminders are sent over WhatsApp from their own pages (for an invoice, its detail page) &mdash; not from the inbox.
        </Tip>
      </section>

      {/* Parse to the Quote Builder */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Parse a Request into the Quote Builder</h2>
        <p className="text-gray-600 mb-4">
          A client&apos;s request can go straight to the <strong>Quote Builder</strong> (the pricing grid), which reads it, lays out the trip day by day and prices every day from your rates.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">How to Use It</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>In a WhatsApp conversation, click <strong>Parse</strong>. In the Inbox, click the purple sparkles icon on the email (<strong>Parse and price in the Pricing Grid</strong>).</li>
          <li>The Quote Builder opens and reads the request: the days and their cities, the number of travellers, start date, nationality, tour name and client name are filled in for you</li>
          <li>Review each day, adjust services, tier and margin, then <strong>Save</strong></li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The Client in your CRM</h3>
        <p className="text-gray-600 mb-4">
          When you save, the itinerary and quote land on a CRM client. If the conversation is already linked to a client, that client is used (a green <strong>CRM client</strong> tag shows in the grid). Otherwise the grid looks for a client with the same email, then the same phone. If there is none, a new <strong>Lead</strong> is created from the name and the email or phone &mdash; and a WhatsApp chat with no client yet is linked to it. B2B quotes never create a Lead.
        </p>
        <Tip>
          Changing the email or phone in the grid points the save at whoever owns the new details; correcting the spelling of the name keeps the same client. Your own office address is never saved as the client&apos;s email.
        </Tip>
      </section>

      {/* Email Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Inbox</h2>
        <p className="text-gray-600 mb-4">
          The <strong>Inbox</strong> is your company&apos;s Gmail, inside Autoura.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Connecting Gmail</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Settings &rarr; Email</strong> (admins), or click <strong>Connect Your Gmail</strong> in an empty Inbox</li>
          <li>On the <strong>Connection</strong> tab, click <strong>Connect Gmail</strong></li>
          <li>Sign in with your Google account and allow every permission asked for</li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Using the Inbox</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Folders</strong> &mdash; Inbox, Sent and Drafts, plus your own folders (your Gmail labels). <strong>New Folder</strong> creates one; <strong>Move to folder</strong> files an email.</li>
          <li><strong>Filters</strong> &mdash; <strong>Business</strong> (the default: leaves out Gmail&apos;s Promotions, Social and Forums and automatic senders such as no-reply addresses &mdash; mail from your clients, partners and suppliers always shows), <strong>Everything</strong>, <strong>Unread</strong> and <strong>Starred</strong>; or <strong>Search emails</strong></li>
          <li><strong>Actions</strong> &mdash; Archive, Delete (moves the email to Gmail&apos;s Trash), mark read or unread, and star</li>
          <li><strong>Compose</strong>, <strong>Reply</strong> and <strong>Forward</strong> in a rich-text editor (formatting, links, images)</li>
          <li><strong>Templates</strong> &mdash; Insert a message template while composing; its placeholders are filled from the client, partner or itinerary</li>
          <li><strong>Signatures</strong> &mdash; Your default signature is added automatically; pick another from the Signatures menu</li>
          <li><strong>Attachments</strong> &mdash; Download what a client sent</li>
          <li><strong>Link to Client</strong> &mdash; Attach the email to a client record</li>
        </ul>
        <DocScreenshot src="/docs/communication/email-inbox.jpg" alt="Email inbox showing the message list with sender, subject, and preview for each email" />
      </section>

      {/* Copilot */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot (AI-Drafted Replies)</h2>
        <p className="text-gray-600 mb-3">
          Copilot drafts replies to incoming messages; you review each one before it goes out. Its pages:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Copilot</strong> (Communicate) &mdash; The review queue: <strong>Approve</strong> and <strong>Send</strong> a WhatsApp draft (an email draft is <strong>Approve &amp; hand off</strong>: it opens in Conversations, filled in, for you to send), <strong>Regenerate</strong> it, or <strong>Reject</strong> it. Choose the tone: professional, friendly or formal.</li>
          <li><strong>Copilot Knowledge</strong> (Communicate) &mdash; The FAQs, policies and tour facts Copilot draws on</li>
          <li><strong>Copilot Settings</strong> (Settings, admins) &mdash; Including drafting replies in advance as messages arrive</li>
          <li><strong>Copilot Analytics</strong> (Home) &mdash; Draft volume and how many are accepted</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Copilot never sends by itself. Only WhatsApp <strong>AI Auto-Reply</strong>, when an admin turns it on, answers without review. See the <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot guide</Link>.
        </p>
      </section>

      {/* Signatures */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Signatures</h2>
        <p className="text-gray-600">
          <strong>Email Signatures</strong> holds your personal signatures. The one marked default is added automatically when you compose or reply in the Inbox or Conversations.
        </p>
      </section>

      {/* Concierge */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Concierge Leads</h2>
        <p className="text-gray-600">
          Planning briefs from your website&apos;s <strong>AI Concierge</strong> arrive under <strong>Concierge Leads</strong>. Work each one through Needs Review, In Progress and Responded, and turn it into an itinerary with <strong>Create itinerary</strong>. See the <Link href="/docs/concierge-leads" className="text-primary-600 hover:underline">Concierge Leads guide</Link>.
        </p>
      </section>

      {/* Support */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Need Help?</h2>
        <p className="text-gray-600">
          Use the floating <strong>Support Chat</strong> button (bottom right of every page) to message the Autoura support team &mdash; we reply in the chat and by email.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/communication" />
    </div>
  )
}
