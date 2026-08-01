import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function TourProgramsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tour Builder</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Tour Builder</h1>
      <p className="text-gray-600 mb-8">
        The Tour Builder (labeled <strong>Tour Programs Manager</strong> on the page itself) lets you create and manage reusable tour templates and their variations. Templates define the core itinerary, while variations represent specific versions (budget tier, group type, pax range) that feed into B2B pricing. Find it in the sidebar under <strong>B2B &rarr; Tour Builder</strong>.
      </p>

      {/* Concepts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Concepts</h2>
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-1">Tour Template</h3>
            <p className="text-sm text-gray-600">
              The master tour program with a name, code, duration, cities covered, theme, and a day-by-day itinerary. Example: &ldquo;4-Day Cairo &amp; Alexandria Luxury Tour&rdquo;.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-1">Tour Variation</h3>
            <p className="text-sm text-gray-600">
              A specific pricing version of a template. Each variation has its own budget tier (Budget, Standard, Deluxe, or Luxury), group type, and min&ndash;max pax range. One template can have multiple variations.
            </p>
          </div>
        </div>
        <Tip>
          <strong>Flow:</strong> Template &rarr; Variation &rarr; B2B Calculator &rarr; Quote. The template holds the itinerary structure, the variation defines the pricing parameters.
        </Tip>
      </section>

      {/* Viewing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Templates</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>B2B &rarr; Tour Builder</strong> in the sidebar. The page shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Stats Cards</strong> &mdash; Totals for templates, variations, active, and featured</li>
          <li><strong>Search</strong> &mdash; Matches template name, code, or city</li>
          <li><strong>Filters</strong> &mdash; Separate <strong>Theme</strong> and <strong>Type</strong> dropdowns, plus an <strong>Active Only / Show All</strong> toggle</li>
          <li><strong>View Modes</strong> &mdash; Table, card grid, or compact list</li>
          <li><strong>Browse Tours</strong> &mdash; A header link that jumps to the public-facing Ready Made Packages page</li>
        </ul>
        <p className="text-gray-600">
          The table view shows one row per template with columns: <strong>Template, Type, Duration, Cities, Variations, Status, Actions</strong>.
        </p>
        <ScreenshotPlaceholder caption="Tour Programs Manager with stats cards, search bar, Theme/Type filters, and the template table" />
      </section>

      {/* Creating a Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Template</h2>
        <h3 className="text-lg font-medium text-gray-900 mb-2">1. Manual Creation</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
          <li>Click <strong>Add Template</strong></li>
          <li>Fill in: template name, tour type, duration, cities covered, theme</li>
          <li>Open the day builder (<strong>Edit Days</strong>) to define the day-by-day itinerary &mdash; you can search your attractions database and add sites directly to each day</li>
          <li>Save the template</li>
        </ol>
        <h3 className="text-lg font-medium text-gray-900 mb-2">2. Duplicate an Existing Template</h3>
        <p className="text-gray-600 mb-4">
          Use the <strong>Duplicate</strong> action on any template to create a copy with a new code automatically assigned &mdash; the fastest way to create a similar program.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mb-2">3. Auto-Created from New Quote</h3>
        <p className="text-gray-600 mb-3">
          When you build a quote in <strong>New Quote</strong> with the client type set to <strong>B2B</strong>, saving it automatically creates a tour template and its first variation, then redirects you to the B2B Price Calculator for that variation.
        </p>
        <Tip>
          <strong>Note:</strong> The WhatsApp Parser&apos;s B2B mode creates a B2B quote record only &mdash; it does not create a template. Templates are auto-created via the New Quote flow described above.
        </Tip>
        <ScreenshotPlaceholder caption="Template creation form with name, type, duration fields and the Edit Days day builder" />
      </section>

      {/* Managing Variations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Variations</h2>
        <p className="text-gray-600 mb-3">
          Expand any template to see its variations. Each variation chip shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Variation Name</strong></li>
          <li><strong>Budget Tier</strong> &mdash; Budget, Standard, Deluxe, or Luxury</li>
          <li><strong>Group Type</strong> and <strong>min&ndash;max pax</strong> range</li>
          <li><strong>Calculator Link</strong> &mdash; Click the calculator icon to open the B2B Price Calculator for this variation</li>
        </ul>
        <p className="text-gray-600">
          Use <strong>Add Variation</strong> to add a single variation. If a template has no variations yet, the empty state offers a bulk-add that creates all four tiers (Budget, Standard, Deluxe, Luxury) in one click.
        </p>
      </section>

      {/* Template Status */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Template Status</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Active</strong> &mdash; Available for pricing and quoting</li>
          <li><strong>Inactive</strong> &mdash; Hidden by default; switch the toggle from <strong>Active Only</strong> to <strong>Show All</strong> to see them</li>
          <li><strong>Featured</strong> &mdash; Starred templates get a star badge and are counted in the Featured stat card</li>
        </ul>
      </section>

      {/* Departures */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Scheduling Departures</h2>
        <p className="text-gray-600">
          Templates define the <em>what</em>; <strong>Tour Departures</strong> (Operations &rarr; Tour Departures) defines the <em>when</em>. Create dated departures on top of a template to schedule and operate actual trips. See <Link href="/docs/tasks-departures" className="text-primary-600 hover:underline">Tour Departures</Link> for details.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/b2b-pricing" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          B2B Pricing
        </Link>
        <Link href="/docs/b2b-quotes" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: B2B Quotes
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
