import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'

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
        The AI Copilot drafts replies to incoming WhatsApp and email messages so your team reviews and sends them instead of typing from scratch. A Copilot draft never reaches a customer until someone on your team sends it. (WhatsApp <strong>AI auto-reply</strong> is a separate feature that answers on its own &mdash; see Copilot Settings below.)
      </p>

      {/* Review Queue */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Review Queue</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Copilot</strong> in the sidebar (Communicate group). Conversations waiting for a reply are listed on the left &mdash; those with the most drafts to review first, then the most recent. Each shows:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Urgency dot</strong> &mdash; red for urgent, amber for high, grey otherwise</li>
          <li><strong>Channel icon</strong> &mdash; WhatsApp or email</li>
          <li><strong>The client</strong> (or their number or address), the subject, how long ago, and a snippet of the message</li>
          <li><strong>&ldquo;N drafts to review&rdquo;</strong> when drafts are waiting</li>
        </ul>
        <p className="text-gray-600 mt-3">
          In the header, choose your <strong>Tone</strong> &mdash; professional, friendly, or formal &mdash; for the drafts you ask for; it is saved for you. The refresh button reloads the queue. When nothing is waiting: <em>&ldquo;No threads awaiting review.&rdquo;</em>
        </p>
        <DocScreenshot src="/docs/copilot/review-queue.jpg" alt="The Copilot page: the review queue on the left, the review panel on the right, and the Tone selector in the header" />
      </section>

      {/* Reviewing a Draft */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reviewing a Draft</h2>
        <p className="text-gray-600 mb-3">
          Click a conversation to open it on the right:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Customer message</strong> &mdash; The latest message to answer, with a link to the client</li>
          <li><strong>Context card</strong> (collapsible) &mdash; The client&apos;s details with a VIP star, contact, nationality and language, and their <strong>Recent trips</strong>, <strong>Invoices</strong> and <strong>Payments</strong></li>
          <li><strong>AI draft reply</strong> &mdash; The draft, which you can edit, with a <strong>high</strong>, <strong>medium</strong> or <strong>low confidence</strong> badge</li>
          <li><strong>A red banner</strong> &mdash; <em>&ldquo;AI flagged this for escalation&rdquo;</em>, with the reason, when the message needs a person before anything is sent: a complaint, a refund or cancellation demand, an emergency, a legal threat</li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The Actions</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Reject</strong> &mdash; Dismisses the draft</li>
          <li><strong>Regenerate</strong> &mdash; Opens an optional instruction (&ldquo;offer a 10% discount&rdquo;); click <strong>Generate</strong> for a new draft</li>
          <li><strong>Approve</strong> &mdash; Saves the draft with your edits, without sending it</li>
          <li><strong>Send</strong> (WhatsApp) &mdash; Sends the text in the editor straight away and marks the conversation resolved</li>
          <li><strong>Approve &amp; hand off</strong> (email) &mdash; Email drafts are sent from <strong>Conversations</strong>, so the reply stays in the email thread: click <strong>Open conversation</strong>, and the reply box is already filled in with the approved draft and its subject. Check it and send.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A conversation with no draft says <em>&ldquo;No AI draft yet for this thread.&rdquo;</em> Drafts are written in advance only when <strong>Proactive draft pre-generation</strong> is on (Copilot Settings); otherwise ask for one with <strong>Suggest Reply</strong> in the WhatsApp page or Conversations.
        </p>
        <ScreenshotPlaceholder caption="Review panel showing the customer message, expanded context card with client details, an editable AI draft with confidence badge, and the Reject / Regenerate / Approve / Send actions" />
      </section>

      {/* Inline */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot in WhatsApp and Conversations</h2>
        <p className="text-gray-600 mb-3">
          The <strong>WhatsApp</strong> page and <strong>Conversations</strong> have an <strong>AI Copilot</strong> panel above the message box (the email <strong>Inbox</strong> does not):
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Suggest Reply</strong> &mdash; Copilot writes two options, <strong>Option 1</strong> and <strong>Option 2</strong>, with its confidence and reasoning. A draft written in advance shows straight away, marked <strong>ready</strong>.</li>
          <li><strong>Use</strong> puts an option in the message box to edit and send; the <strong>&times;</strong> dismisses it</li>
          <li><strong>Regenerate</strong> asks again; <strong>Dismiss all</strong> clears them</li>
        </ol>
      </section>

      {/* Knowledge */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot Knowledge</h2>
        <p className="text-gray-600 mb-3">
          <strong>Copilot Knowledge</strong> (Communicate group) is the <strong>Copilot Knowledge Base</strong>: the facts Copilot draws on when drafting.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Types</strong> &mdash; <strong>FAQ</strong>, <strong>Policy</strong>, <strong>Tour</strong> and <strong>Other</strong>, with filter pills showing each count</li>
          <li><strong>Add entry</strong> &mdash; Pick the type and a title; an FAQ has a question and its answer</li>
          <li><strong>Enable</strong> / <strong>Disable</strong>, <strong>Edit</strong> or <strong>Delete</strong> each entry; a disabled entry is not used</li>
          <li><strong>Bulk import</strong> &mdash; Paste a document (at least 20 characters). <strong>AI-structured</strong> splits it into typed entries (up to 40); <strong>As a single entry</strong> keeps it whole, with the type and title you choose. Long text is split into chunks automatically. The result reads &ldquo;Imported X of Y entries&rdquo;.</li>
          <li><strong>Your copilot tone</strong> &mdash; The same tone choice as on the Copilot page</li>
        </ul>
        <DocScreenshot src="/docs/copilot/knowledge.jpg" alt="Copilot Knowledge Base page with the FAQ, Policy, Tour and Other filter pills and their counts" />
      </section>

      {/* Settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot Settings</h2>
        <p className="text-gray-600 mb-3">
          <strong>Copilot Settings</strong> is in the Settings section of the sidebar, for admins. It has two switches for the whole company:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Proactive draft pre-generation</strong> (off by default) &mdash; Copilot drafts a reply as soon as a WhatsApp or email message arrives, so it is waiting in the review queue. Drafts written this way use the professional tone. Nothing is sent.</li>
          <li><strong>WhatsApp AI auto-reply</strong> (off by default, marked dangerous) &mdash; The AI answers incoming WhatsApp messages by itself, with no review. The same switch is under <strong>Settings &rarr; WhatsApp</strong>, and it only works once the Autoura team has enabled AI replies for the platform.</li>
        </ul>
        <ScreenshotPlaceholder caption="Copilot Settings: the Proactive draft pre-generation switch and the WhatsApp AI auto-reply switch marked dangerous" />
      </section>

      {/* Analytics */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Copilot Analytics</h2>
        <p className="text-gray-600 mb-3">
          <strong>Copilot Analytics</strong> is in the <strong>Home</strong> section of the sidebar, for admins and managers. Choose <strong>Last 7d</strong>, <strong>Last 30d</strong> (the default), <strong>Last 90d</strong> or <strong>All time</strong>:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Drafts generated</strong>, <strong>Sent to customers</strong>, <strong>Dismissed</strong> and <strong>Pending review</strong></li>
          <li><strong>Accept rate</strong>, <strong>Edit rate</strong> (how often a sent draft was changed first), <strong>RAG hit rate</strong> (how often the knowledge base was used) and <strong>Pre-generated</strong></li>
          <li><strong>Daily volume</strong>, and breakdowns <strong>By channel</strong>, <strong>By tone</strong> and <strong>Confidence</strong></li>
          <li><strong>Top-retrieved knowledge</strong> &mdash; The entries Copilot uses most</li>
          <li><strong>Per-user activity</strong> &mdash; Drafts each person reviewed and sent, and their accept rate</li>
        </ul>
        <ScreenshotPlaceholder caption="Copilot Analytics: the period buttons, the draft counts, the rates, the daily volume chart and the breakdowns" />
      </section>

      {/* Who */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <p className="text-gray-600">
          Copilot and Copilot Knowledge are open to admins, managers and members (members can edit the knowledge base). Copilot Analytics is for admins and managers; Copilot Settings for admins.
        </p>
        <Tip>
          Keep the knowledge base current &mdash; your policies, prices and FAQs &mdash; and Copilot&apos;s drafts get better with it. Disable an entry instead of deleting it while you check whether it is still true.
        </Tip>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/copilot" />
    </div>
  )
}
