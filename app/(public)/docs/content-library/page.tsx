import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'

export default function ContentLibraryPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Content Library &amp; Documents</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Content Library &amp; Documents</h1>
      <p className="text-gray-600 mb-8">
        <strong>Content Library</strong>, <strong>AI Prompts</strong> and <strong>Writing Rules</strong> sit in the sidebar&rsquo;s Communicate group, for admins and managers. The Content Library and Writing Rules shape how the AI writes your itineraries. The <strong>Documents</strong> hub, for customer and supplier paperwork, is in the Operate group.
      </p>

      {/* Content Library */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Library</h2>
        <p className="text-gray-600 mb-3">
          <strong>Content Library</strong> stores your own descriptions of sites, hotels, experiences, restaurants, cruises, transfers, day structures and phrases &mdash; written once, at every comfort level:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Category pills</strong> &mdash; <strong>All</strong> and one pill per category, each with its count</li>
          <li><strong>Search</strong> &mdash; Find entries by name, description, or location</li>
          <li><strong>Cards</strong> &mdash; The category, name, location, short description and tags, with <strong>All tiers</strong> or <strong>2/4 tiers</strong> and a badge per tier (grey when that tier is still missing)</li>
          <li><strong>Add Content</strong> &mdash; Opens the editor; click an entry&apos;s name or the pencil to edit it, or the bin to delete it with all its tiers</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The Editor</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Basic information</strong> &mdash; Category, Name, Short Description, Location and Tags</li>
          <li><strong>Category details</strong> &mdash; Fields that suit the category, such as a hotel&apos;s star rating and room types or a restaurant&apos;s cuisine and dress code</li>
          <li><strong>One tab per tier</strong> (your tier names, from Your Vocabulary) &mdash; Title, Description, Highlights, Inclusions (for some categories) and Internal Notes, which never appear in itineraries. Only tiers with a description are saved.</li>
        </ul>
        <ScreenshotPlaceholder caption="Content Library with category pills and counts, the search bar, and content cards with their tier badges" />
        <Tip>
          <strong>Tiers matter:</strong> When the AI writes an itinerary, it uses the entries that match the trip&apos;s cities and interests, in the variation for the trip&apos;s tier. An entry with every tier filled can be used for any trip; the cards show which tiers are missing.
        </Tip>
      </section>

      {/* AI Prompts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Prompts</h2>
        <p className="text-gray-600 mb-3">
          <strong>AI Prompts</strong> (<strong>AI Prompt Templates</strong>) keeps your own prompts for AI writing, grouped by purpose: Full Itinerary, Day Description, Site Description, Email, WhatsApp, Summary, and Transfer. <strong>New Template</strong> asks for:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>A <strong>Name</strong>, <strong>Purpose</strong> and <strong>Description</strong></li>
          <li>A <strong>System Prompt</strong> and a <strong>User Prompt Template</strong>, with <code>{'{{variable}}'}</code> placeholders</li>
          <li>The <strong>Model</strong>, <strong>Temperature</strong> (0&ndash;2) and <strong>Max Tokens</strong></li>
          <li><strong>Set as default for this purpose</strong> &mdash; the default is marked with a star; there is one per purpose, and it cannot be deleted</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Each template can be viewed (the eye icon), edited, or deleted, and the copy icon copies its prompt text. These templates are a reference for your team: itinerary generation does not read them yet.
        </p>
        <ScreenshotPlaceholder caption="AI Prompt Templates grouped by purpose, with the default marked by a star" />
      </section>

      {/* Writing Rules */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Writing Rules</h2>
        <p className="text-gray-600 mb-3">
          <strong>Writing Rules</strong> are your house style. <strong>Add Rule</strong> asks for:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Rule Name</strong> and <strong>Description</strong> &mdash; what the AI reads</li>
          <li><strong>Category</strong> &mdash; Tone, Vocabulary, Structure, Formatting, or Brand (also the filter pills at the top)</li>
          <li><strong>Rule Type</strong> &mdash; Must Follow, Preferred, or Avoid</li>
          <li><strong>Priority</strong> from 1 (low) to 10 (high), and <strong>Applies To</strong>: All, Itineraries, Emails, WhatsApp</li>
          <li><strong>Bad Examples</strong> and <strong>Good Examples</strong> &mdash; shown as &ldquo;Avoid&rdquo; and &ldquo;Better&rdquo; when you expand a rule</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Rules are listed by type and priority. A rule you no longer want is deleted; there is no on/off switch.
        </p>
        <Tip>
          The AI follows your rules when it writes an itinerary &mdash; your highest-priority ones: up to 5 Must Follow, 3 Preferred and 5 Avoid. It reads each rule&apos;s name and description; the examples and <strong>Applies To</strong> are for your team and are not used by the AI yet.
        </Tip>
        <ScreenshotPlaceholder caption="Writing Rules with the category pills, rules grouped by Must Follow / Preferred / Avoid, and one rule expanded with its Avoid / Better examples" />
      </section>

      {/* Documents */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents</h2>
        <p className="text-gray-600 mb-3">
          <strong>Documents</strong> (Operate group) is a hub that points you to where each kind of paperwork is made:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Customer Contracts</strong> &mdash; Made from an itinerary: its <strong>Documents</strong> menu has the itinerary PDF, the contract and the invoice (see <Link href="/docs/itineraries" className="text-primary-600 hover:underline">Itineraries</Link>)</li>
          <li><strong>Supplier documents</strong> &mdash; Five kinds: Hotel Vouchers, Transport Vouchers, Cruise Vouchers, Guide Assignments, and Service Orders (meals and entrance tickets)</li>
        </ul>
        <p className="text-gray-600 mt-3">
          To make supplier documents, open an itinerary and click <strong>Supplier docs</strong> &mdash; its services are grouped by supplier for you. <strong>All Supplier Documents</strong> lists them by status (Draft, Sent, Confirmed, Completed, Cancelled); from a document, send it by <strong>Email</strong> or <strong>WhatsApp</strong> and <strong>Mark Confirmed</strong> when the supplier confirms.
        </p>
        <ScreenshotPlaceholder caption="Documents hub with Customer Contracts and the five supplier document types" />
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/content-library" />
    </div>
  )
}
