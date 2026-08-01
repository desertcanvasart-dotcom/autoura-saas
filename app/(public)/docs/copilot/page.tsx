import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function CopilotPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">AI Copilot</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">AI Copilot</h1>
      <p className="text-gray-600 mb-8">
        The AI Copilot drafts replies to incoming WhatsApp and email messages so your team reviews and approves instead of typing from scratch. Every draft goes through a human before it reaches a customer &mdash; unless you deliberately enable auto-reply.
      </p>

      {/* Review Queue */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Review Queue</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Copilot</strong> in the sidebar (Communication group). The page is a review queue with a thread list on the left and a review panel on the right:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Thread List</strong> &mdash; Each thread shows an urgency dot, a channel icon (WhatsApp or email), the client, a message snippet, and an &ldquo;N drafts to review&rdquo; badge</li>
          <li><strong>Tone Selector</strong> &mdash; In the header, pick your preferred drafting tone: professional, friendly, or formal (saved per user)</li>
          <li><strong>Refresh</strong> &mdash; Reloads the queue to pick up new threads and drafts</li>
        </ul>
        <ScreenshotPlaceholder caption="Copilot review queue: thread list on the left with urgency dots, channel icons and draft badges; review panel on the right; Tone selector and Refresh in the header" />
      </section>

      {/* Review Panel */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reviewing a Draft</h2>
        <p className="text-gray-600 mb-3">
          Select a thread to open the review panel. It shows:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Latest Customer Message</strong> &mdash; What the AI is responding to</li>
          <li><strong>Context Card</strong> &mdash; A collapsible card with the linked client (VIP star when applicable), contact details, nationality and language, recent itineraries, invoices, and payments</li>
          <li><strong>Escalation Banner</strong> &mdash; A red banner appears when the AI flags the conversation for escalation to a human</li>
          <li><strong>Editable Draft</strong> &mdash; The AI&rsquo;s suggested reply with a confidence badge (high, medium, or low). Edit it freely before sending</li>
        </ul>
        <p className="text-gray-600 mb-3 mt-4">
          For each draft you can:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Reject</strong> &mdash; Dismiss the draft</li>
          <li><strong>Regenerate</strong> &mdash; Ask for a new draft, with a free-text instruction telling the AI what to change</li>
          <li><strong>Approve</strong> &mdash; Accept the draft, including any edits you made</li>
          <li><strong>Send</strong> &mdash; Deliver the approved reply</li>
        </ul>
        <ScreenshotPlaceholder caption="Review panel showing the customer message, expanded context card with client details, an editable AI draft with confidence badge, and the Reject / Regenerate / Approve / Send actions" />
        <Tip>
          <strong>Channel behavior:</strong> WhatsApp replies send immediately through your connected WhatsApp number and resolve the thread. Email drafts are never auto-sent from Copilot &mdash; approving hands the draft off to the Inbox composer, where you finish and send it yourself.
        </Tip>
      </section>

      {/* Knowledge */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot Knowledge</h2>
        <p className="text-gray-600 mb-3">
          The Copilot grounds its drafts in your own knowledge base. Open <strong>Copilot Knowledge</strong> in the sidebar to manage it:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Four Entry Types</strong> &mdash; FAQs, Policies, Tours, and Custom, with per-type filter pills and counts</li>
          <li><strong>Per-Entry Controls</strong> &mdash; Enable or disable each entry, edit it, or delete it</li>
          <li><strong>Bulk Import</strong> &mdash; Paste long text and choose <em>AI extract</em> (the AI splits it into typed entries) or <em>as-is</em> (one entry). Long content is automatically chunked, and the result reports how many entries were created or failed</li>
        </ul>
        <ScreenshotPlaceholder caption="Copilot Knowledge page with type filter pills (FAQs, Policies, Tours, Custom) showing counts, a list of entries with enable/disable toggles, and the bulk import dialog with AI extract vs as-is modes" />
      </section>

      {/* Settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot Settings</h2>
        <p className="text-gray-600 mb-3">
          Under <strong>Settings &rarr; Copilot</strong> you&rsquo;ll find two tenant-wide toggles. Only admins can change them; managers and agents see them read-only:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Background Draft Pre-Generation</strong> &mdash; Prepares a draft automatically whenever a new WhatsApp or email message arrives, so a suggestion is already waiting in the queue. This is <em>not</em> auto-reply &mdash; nothing is sent without review</li>
          <li><strong>WhatsApp Auto-Reply</strong> &mdash; A clearly-marked dangerous option that lets the bot answer WhatsApp messages without human review. It is off by default</li>
        </ul>
        <ScreenshotPlaceholder caption="Copilot Settings page showing the background draft pre-generation toggle and the danger-marked WhatsApp auto-reply toggle" />
        <Tip>
          <strong>Caution:</strong> Leave WhatsApp auto-reply off unless you fully trust the bot with your customers. With it off, every message still gets a human review before anything is sent.
        </Tip>
      </section>

      {/* Analytics */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot Analytics</h2>
        <p className="text-gray-600 mb-3">
          <strong>Settings &rarr; Copilot Analytics</strong> shows how well the Copilot is performing. Filter by period (7d, 30d, 90d, or all):
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Volume Cards</strong> &mdash; Drafts generated, sent, dismissed, and pending</li>
          <li><strong>Quality Metrics</strong> &mdash; Accept rate, edit rate, knowledge (RAG) hit rate, and the share of drafts that were pre-generated</li>
          <li><strong>Daily Volume Chart</strong> &mdash; Draft activity over time</li>
          <li><strong>Breakdowns</strong> &mdash; By channel, tone, and confidence level</li>
          <li><strong>Top Knowledge Entries</strong> &mdash; Which knowledge base entries the AI retrieves most</li>
          <li><strong>Per-User Table</strong> &mdash; Drafts reviewed, sent, and accept rate for each team member</li>
        </ul>
        <ScreenshotPlaceholder caption="Copilot Analytics with period filter, cards for drafts generated/sent/dismissed/pending, accept and edit rate metrics, daily volume chart, and breakdowns by channel, tone, and confidence" />
      </section>

      {/* Inline suggestions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot in the Inbox</h2>
        <p className="text-gray-600 mb-3">
          You don&rsquo;t have to work from the review queue &mdash; Copilot suggestions also appear inline in the WhatsApp inbox composer and the unified Conversations composer. See <Link href="/docs/communication" className="text-primary-600 hover:underline">Communication</Link> for how the inboxes work, and <Link href="/docs/message-templates" className="text-primary-600 hover:underline">Message Templates</Link> for reusable manual replies.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
      </div>
    </div>
  )
}
