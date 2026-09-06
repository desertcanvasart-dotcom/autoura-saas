import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

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

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Concierge Leads</strong> in the sidebar (Operate group). Briefs arrive automatically &mdash; there is nothing to import. The page is organized into tabs with live counts:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Needs Review</strong> &mdash; New briefs nobody has picked up yet</li>
          <li><strong>In Progress</strong> &mdash; Briefs someone is actively working</li>
          <li><strong>Responded</strong> &mdash; Briefs you have answered</li>
          <li><strong>Archived</strong> &mdash; Briefs you have set aside</li>
          <li><strong>All</strong> &mdash; Everything in one list</li>
        </ul>
        <DocScreenshot src="/docs/concierge-leads/briefs-list.jpg" alt="Concierge Leads page with the Needs Review / In Progress / Responded / Archived / All tabs showing live counts, and a list of brief cards" />
      </section>

      {/* Cards */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading a Brief Card</h2>
        <p className="text-gray-600 mb-3">
          Each card summarizes a brief at a glance:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Visitor &amp; Status</strong> &mdash; The visitor&rsquo;s name and a status badge; a red &ldquo;No contact&rdquo; badge appears when the visitor left no contact info, and a revision number when the visitor updated their brief</li>
          <li><strong>SLA Badge</strong> &mdash; Shows <em>overdue</em> when the committed response time has passed, <em>soon</em> when 2 hours or less remain, and <em>met</em> once you&rsquo;ve responded</li>
          <li><strong>Contact Details</strong> &mdash; How to reach the visitor</li>
          <li><strong>Trip Facts</strong> &mdash; Travelers, dates (or a travel window), destinations, and comfort level</li>
          <li><strong>Summary &amp; Chips</strong> &mdash; A short summary plus chips for interests and any dietary, mobility, religious, or medical constraints</li>
        </ul>
        <ScreenshotPlaceholder caption="A single brief card showing visitor name, status and SLA badges, contact details, trip facts (travelers, dates, destinations, comfort level), summary, interest chips, and constraint chips" />
      </section>

      {/* Status flow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Moving Briefs Through the Flow</h2>
        <p className="text-gray-600 mb-3">
          Each status offers the next steps directly on the card:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Needs review</strong> &rarr; <strong>Start review</strong> or <strong>Archive</strong></li>
          <li><strong>In progress</strong> &rarr; <strong>Mark responded</strong> or <strong>Archive</strong></li>
          <li><strong>Responded</strong> &rarr; <strong>Reopen</strong> or <strong>Archive</strong></li>
          <li><strong>Archived</strong> &rarr; <strong>Reopen</strong></li>
        </ul>
        <Tip>
          <strong>SLA Tip:</strong> The SLA clock stops when you mark a brief responded &mdash; not when you start reviewing it. Keep an eye on the &ldquo;soon&rdquo; badges to stay inside your committed response window.
        </Tip>
      </section>

      {/* Details drawer */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Details Drawer</h2>
        <p className="text-gray-600 mb-3">
          Open a brief to see everything the Concierge captured:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Full Contact</strong> &mdash; Preferred channel, timezone, nationality, and language</li>
          <li><strong>Trip Details</strong> &mdash; Including origin city and international flights</li>
          <li><strong>Preferences</strong> &mdash; Must-see and must-avoid lists</li>
          <li><strong>Constraints</strong> &mdash; Dietary, mobility, religious, and medical needs</li>
          <li><strong>Response Window</strong> &mdash; The committed-by time, shown in Cairo time and the visitor&rsquo;s local time</li>
          <li><strong>Chat Transcript</strong> &mdash; The full Concierge conversation as chat bubbles, plus metadata</li>
        </ul>
        <ScreenshotPlaceholder caption="Details drawer open on a brief: full contact section, trip details, preferences, constraints, response window in two timezones, and the chat transcript rendered as bubbles" />
      </section>

      {/* Create itinerary */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Turning a Brief into an Itinerary</h2>
        <p className="text-gray-600 mb-3">
          The drawer footer has a <strong>Create itinerary</strong> button that builds an itinerary directly from the brief. It is safe to click once &mdash; it will not create duplicates, and afterwards it becomes <strong>View itinerary (CODE)</strong> linking to the itinerary it created. When the visitor is linked to a client record, a <strong>View client</strong> button appears alongside it.
        </p>
        <ScreenshotPlaceholder caption="Details drawer footer showing the Create itinerary button (and the View itinerary state after creation) plus the View client button" />
        <p className="text-gray-600">
          From there, continue in <Link href="/docs/itineraries" className="text-primary-600 hover:underline">Itineraries</Link> to price and refine the trip, and use <Link href="/docs/communication" className="text-primary-600 hover:underline">Communication</Link> to reply to the visitor on their preferred channel.
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
