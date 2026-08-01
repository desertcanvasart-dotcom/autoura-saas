import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

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
        The Content group in the sidebar (admins and managers) holds the building blocks the AI uses to write your itineraries &mdash; reusable content, prompt templates, and house-style rules &mdash; plus the Documents hub for customer and supplier paperwork.
      </p>

      {/* Content Library */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Library</h2>
        <p className="text-gray-600 mb-3">
          <strong>Content Library</strong> stores reusable destination, attraction, and hotel content that feeds AI-generated itineraries:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Category Pills</strong> &mdash; Entries are grouped by category, each pill showing a count</li>
          <li><strong>Search</strong> &mdash; Find entries by name, description, or location</li>
          <li><strong>Cards</strong> &mdash; Each shows the category, name, location or duration, tags, the number of variations, and which tiers are still missing (tiers: Budget, Standard, Deluxe, Luxury)</li>
          <li><strong>Add Content</strong> &mdash; Create a new entry; existing entries can be viewed, edited, or deleted</li>
        </ul>
        <ScreenshotPlaceholder caption="Content Library page with category pills showing counts, the search bar, and content cards showing name, location/duration, tags, variation count and missing tiers" />
        <Tip>
          <strong>Tiers matter:</strong> An entry with variations for every tier (Budget, Standard, Deluxe, Luxury) lets the AI describe the same attraction or hotel appropriately at any comfort level. The cards flag missing tiers so you know what to fill in.
        </Tip>
      </section>

      {/* AI Prompts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Prompts</h2>
        <p className="text-gray-600 mb-3">
          <strong>AI Prompts</strong> holds the prompt templates behind each kind of AI generation, grouped by purpose: full itinerary, day description, site description, email, WhatsApp, summary, and transfer. Each template stores:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>A system prompt and a user prompt template with <code>{'{{variables}}'}</code></li>
          <li>The model and temperature to use</li>
          <li>An active flag and a version number</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A star marks the default template for each purpose. Templates can be viewed, edited, copied, or deleted.
        </p>
        <ScreenshotPlaceholder caption="AI Prompts page with templates grouped by purpose, a starred default template visible, and a template showing its model, temperature, active flag and version" />
      </section>

      {/* Writing Rules */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Writing Rules</h2>
        <p className="text-gray-600 mb-3">
          <strong>Writing Rules</strong> define the house style the AI follows when generating content. Each rule has:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Category</strong> &mdash; Tone, vocabulary, structure, formatting, or brand</li>
          <li><strong>Rule Type</strong> &mdash; Must Follow, Preferred, or Avoid, each with good and bad examples</li>
          <li><strong>Priority and Scope</strong> &mdash; Rules can apply everywhere or only to itineraries, email, or WhatsApp</li>
          <li><strong>Active Flag</strong> &mdash; Turn rules on and off without deleting them</li>
        </ul>
        <ScreenshotPlaceholder caption="Writing Rules page showing rules with their category, Must Follow / Preferred / Avoid type, good/bad examples, priority, scope, and active toggles" />
      </section>

      {/* Documents */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Documents</h2>
        <p className="text-gray-600 mb-3">
          <strong>Documents</strong> is a hub page that points you to where each kind of paperwork is generated &mdash; it is not a document list:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Customer Documents</strong> &mdash; Contracts and invoices, generated from an itinerary via <Link href="/docs/itineraries" className="text-primary-600 hover:underline">Itineraries</Link></li>
          <li><strong>Supplier Documents</strong> &mdash; Six types: hotel voucher, transport voucher, cruise voucher, activity voucher, guide assignment, and service order</li>
        </ul>
        <p className="text-gray-600 mt-3">
          To generate supplier documents, open any itinerary and use its <strong>Documents</strong> button &mdash; services are automatically grouped by supplier. Vouchers can be sent by Email or WhatsApp, and you can track each one&rsquo;s confirmation status.
        </p>
        <ScreenshotPlaceholder caption="Documents hub page showing the Customer Documents section (contracts, invoices) and the Supplier Documents section listing the six document types" />
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
