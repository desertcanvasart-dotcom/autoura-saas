import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'

export default function ConciergeLeadsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Concierge Leads</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Concierge Leads</h1>
      <p className="text-gray-600 mb-8">
        When a visitor chats with the AI Concierge on your website, the conversation is distilled into a structured planning brief and delivered straight to your team. The Concierge Leads page is where you triage those briefs and respond.
      </p>

      {/* Setup */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Before Your First Lead</h2>
        <p className="text-gray-600">
          The AI Concierge is switched on for your account by the Autoura team, who also connect it to your website. Until then the page stays empty: <em>&ldquo;No briefs in this view&rdquo;</em>. Ask the Autoura team if you expect leads and none arrive.
        </p>
      </section>

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Concierge Leads</strong> in the sidebar &mdash; in the <strong>Communicate</strong> group, below Conversations, Inbox and WhatsApp. Briefs arrive automatically &mdash; there is nothing to import. The page is organized into tabs, each with its count:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Needs Review</strong> (opens first) &mdash; New briefs nobody has picked up yet, and briefs the visitor has since <strong>updated</strong> (an update reopens the lead)</li>
          <li><strong>In Progress</strong> &mdash; Briefs someone is actively working</li>
          <li><strong>Responded</strong> &mdash; Briefs you have answered</li>
          <li><strong>Archived</strong> &mdash; Briefs you have set aside</li>
          <li><strong>All</strong> &mdash; Everything in one list</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The page shows the 200 most recent briefs. The counts reflect the list as it was loaded &mdash; refresh the page to see briefs that arrived since.
        </p>
        <DocScreenshot src="/docs/concierge-leads/briefs-list.jpg" alt="Concierge Leads page with the Needs Review / In Progress / Responded / Archived / All tabs and their counts, and a list of brief cards" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">When a Lead Arrives</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Everyone on the team gets a <strong>bell notification</strong> &mdash; &ldquo;New concierge lead from &hellip;&rdquo;, or &ldquo;Concierge lead updated: &hellip;&rdquo; when a visitor revises their brief &mdash; and a <strong>push notification</strong> if they turned push on</li>
          <li>The sidebar shows a <strong>badge</strong> with the number of leads waiting for review, and a &ldquo;New concierge lead&rdquo; message pops up on other pages</li>
          <li>The visitor is found among your <strong>clients</strong> by email, then phone &mdash; or added as a new <strong>Lead</strong> &mdash; and their interests, special needs and an internal note with the brief are added to the client</li>
          <li>The brief also appears in <Link href="/docs/copilot" className="text-primary-600 hover:underline">Copilot</Link>, so a reply can be drafted on the visitor&rsquo;s preferred channel</li>
        </ul>
        <p className="text-gray-600 mt-3">No email is sent for a new lead.</p>
      </section>

      {/* Cards */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading a Brief Card</h2>
        <p className="text-gray-600 mb-3">
          Each card summarizes a brief at a glance:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Visitor &amp; Status</strong> &mdash; The visitor&rsquo;s name (or &ldquo;Concierge Lead&rdquo;) and a status badge; a red <strong>No contact</strong> badge when the visitor left neither email nor phone, and <strong>rev 2</strong>, <strong>rev 3</strong>&hellip; when they updated their brief</li>
          <li><strong>Response deadline</strong> &mdash; <strong>Overdue 3h</strong> in red once the committed response time has passed; <strong>Due in 45m</strong> in amber when 2 hours or less remain, or in green with more time. It disappears once the lead is responded or archived.</li>
          <li><strong>Contact Details</strong> &mdash; Email and phone, and when the brief was received</li>
          <li><strong>Trip Facts</strong> &mdash; Travelers, dates (or a travel window, or a number of days), destinations, and comfort level</li>
          <li><strong>Summary &amp; Chips</strong> &mdash; A short summary plus chips for interests and any dietary, mobility, religious, or medical constraints</li>
          <li><strong>Details</strong> opens the full brief; <strong>Client</strong> opens the visitor&rsquo;s client record</li>
        </ul>
        <ScreenshotPlaceholder caption="A single brief card showing visitor name, status and deadline badges, contact details, trip facts (travelers, dates, destinations, comfort level), summary, interest chips, and constraint chips" />
      </section>

      {/* Status flow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Moving Briefs Through the Flow</h2>
        <p className="text-gray-600 mb-3">
          Each status offers the next steps on the card and in the details drawer:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Needs review</strong> &rarr; <strong>Start review</strong> or <strong>Archive</strong></li>
          <li><strong>In progress</strong> &rarr; <strong>Mark responded</strong> or <strong>Archive</strong></li>
          <li><strong>Responded</strong> &rarr; <strong>Reopen</strong> (back to Needs Review) or <strong>Archive</strong></li>
          <li><strong>Archived</strong> &rarr; <strong>Reopen</strong>, or &mdash; for managers and admins &mdash; <strong>Delete</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>Delete</strong> (<strong>Delete permanently</strong> in the drawer) removes an archived lead and its conversation for good; the client record stays in Clients. Only an archived lead can be deleted.
        </p>
        <Tip>
          <strong>Deadline Tip:</strong> The clock stops when you mark a brief responded &mdash; not when you start reviewing it. Keep an eye on the amber &ldquo;Due in&rdquo; badges to stay inside your committed response window.
        </Tip>
      </section>

      {/* Details drawer */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Details Drawer</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Details</strong> on a card to see everything the Concierge captured. The header repeats the status, deadline and No contact badges (a green <strong>Responded</strong> once answered), with the summary below:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Contact</strong> &mdash; Email, phone, preferred channel, timezone, nationality, and language</li>
          <li><strong>Trip</strong> &mdash; Travelers, dates, origin city, and international flights</li>
          <li><strong>Preferences</strong> &mdash; Comfort level, destinations, interests, must-see and must-avoid</li>
          <li><strong>Constraints</strong> &mdash; Dietary, mobility, religious, and medical needs (when there are any)</li>
          <li><strong>Response window</strong> &mdash; <strong>Committed by</strong> in your own local time, the Cairo and visitor times the Concierge stated, and when it was received</li>
          <li><strong>Transcript</strong> &mdash; The full Concierge conversation as chat bubbles</li>
          <li><strong>Meta</strong> &mdash; The conversation reference, revision and flags</li>
        </ul>
        <ScreenshotPlaceholder caption="Details drawer open on a brief: contact, trip, preferences, constraints, response window, and the chat transcript rendered as bubbles" />
      </section>

      {/* Create itinerary */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Turning a Brief into an Itinerary</h2>
        <p className="text-gray-600 mb-3">
          The drawer footer reads <strong>No itinerary yet</strong> with a <strong>Create itinerary</strong> button. It creates a <strong>draft itinerary</strong> (code <strong>CON-&hellip;</strong>) for the visitor&rsquo;s client, filled from the brief: the trip name from its destinations, the dates, the number of travelers, and the summary in the notes. Where the brief is missing something it uses placeholders &mdash; a start 30 days from today, 7 days, 2 adults &mdash; so check them. The days themselves are not planned yet.
        </p>
        <p className="text-gray-600 mb-3">
          It is safe to click once &mdash; it will not create duplicates, and afterwards it becomes <strong>View itinerary (CODE)</strong> linking to the itinerary it created. <strong>View client</strong> opens the visitor&rsquo;s client record.
        </p>
        <ScreenshotPlaceholder caption="Details drawer footer showing the Create itinerary button (and the View itinerary state after creation) plus the View client button" />
        <p className="text-gray-600">
          From there, continue in <Link href="/docs/itineraries" className="text-primary-600 hover:underline">Itineraries</Link> to plan the days and price the trip, and use <Link href="/docs/communication" className="text-primary-600 hover:underline">Communication</Link> to reply to the visitor on their preferred channel.
        </p>
      </section>

      {/* Who */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <p className="text-gray-600">
          Admins, managers and members see Concierge Leads; viewers do not. Only managers and admins can delete a lead.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/concierge-leads" />
    </div>
  )
}
