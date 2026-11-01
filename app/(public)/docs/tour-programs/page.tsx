import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/tour-programs')

export default function TourProgramsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tour Manager</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Tour Manager</h1>
      <p className="text-gray-600 mb-8">
        The Tour Manager (titled <strong>Tour Programs Manager</strong> on the page) holds your
        catalogue: reusable tours with their day-by-day programme, and the variations that price them
        for partners. Find it under <strong>Products &rarr; Tours</strong> in the sidebar (admins and managers).
      </p>

      {/* Concepts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Concepts</h2>
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-1">Tour (template)</h3>
            <p className="text-sm text-gray-600">
              The programme itself: a name, a code, type, theme, duration, cities, and the day-by-day
              itinerary that pricing reads &mdash; each day&rsquo;s city, night, meals, sightseeing and
              travel. Example: &ldquo;4-Day Cairo &amp; Alexandria&rdquo;.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-1">Variation</h3>
            <p className="text-sm text-gray-600">
              One way of selling the tour: one of your service tiers (from your vocabulary), private or
              shared, with a passenger range. A tour has at most one variation per tier.
            </p>
          </div>
        </div>
        <Tip>
          <strong>Flow:</strong> Tour &rarr; Variation &rarr; B2B Calculator &rarr; partner quote. The tour
          holds the days; the variation says at what tier and for how many it is priced.
        </Tip>
      </section>

      {/* Viewing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Stat cards</strong> &mdash; total tours, variations, active and featured (over all tours, not just the filtered ones)</li>
          <li><strong>Search</strong> &mdash; matches a tour&rsquo;s name, code or city</li>
          <li><strong>Filters</strong> &mdash; <strong>Theme</strong> and <strong>Type</strong> (your vocabulary), and an <strong>Active Only / Show All</strong> toggle</li>
          <li><strong>Views</strong> &mdash; table, cards or compact list</li>
          <li><strong>Header</strong> &mdash; <strong>Add Template</strong>, the <strong>Import / Export</strong> menu, <strong>Browse Tours</strong> (opens Tour Inventory) and <strong>&larr; Rates Hub</strong> (opens the Rates overview)</li>
        </ul>
        <p className="text-gray-600 mb-3">
          The table has the columns <strong>Template, Type, Duration, Cities, Variations, Status,
          Actions</strong>. Each tour&rsquo;s actions are <strong>Edit days</strong> (the calendar icon),{' '}
          <strong>Edit</strong>, <strong>Duplicate</strong> and <strong>Delete</strong>; the card and
          compact views offer the same.
        </p>
        <ScreenshotPlaceholder caption="Tour Programs Manager: stat cards, search, Theme/Type filters, and the tour table" />
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a tour</h2>
        <h3 className="text-lg font-medium text-gray-900 mb-2">1. Add Template</h3>
        <p className="text-gray-600 mb-3">
          <strong>Add Template</strong> opens a form in three steps:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Basic Info</strong> &mdash; name, code (made for you if left blank), type, theme, duration, cities, physical level, short and long description, Featured and Active.</li>
          <li><strong>Details</strong> &mdash; highlights, main attractions (searchable), the <strong>Day-by-Day Itinerary</strong>, inclusions and exclusions, and who it is best for.</li>
          <li><strong>Variations</strong> &mdash; tick the tiers to start with, private or shared for each.</li>
        </ol>
        <p className="text-gray-600 mb-4">
          <strong>Create Template &amp; Variations</strong> saves the tour and its first variations
          together. A tour has no image field: pictures arrive through the tours sheet (Image URL,
          Gallery URLs).
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-2">2. Duplicate an existing tour</h3>
        <p className="text-gray-600 mb-4">
          <strong>Duplicate</strong> copies a tour&rsquo;s details and days under a new code, named
          &ldquo;&hellip; (Copy)&rdquo;. Its variations are not copied: add them to the copy.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-2">3. From a B2B quote in the Quote Builder</h3>
        <p className="text-gray-600 mb-3">
          Saving a trip in the <strong>Quote Builder</strong> in <strong>B2B</strong> mode makes a tour
          from it once the B2B quote is saved, with a variation at the trip&rsquo;s tier, and opens the
          B2B Calculator on that variation (see{' '}
          <Link href="/docs/b2b-import" className="text-primary-600 hover:underline">Converting Itineraries to B2B</Link>).
          There is one such tour per itinerary, coded <code>TPL-&lt;itinerary code&gt;</code>.
        </p>
        <Tip>
          <strong>Note:</strong> the tour holds the trip&rsquo;s day structure &mdash; cities, meals,
          cruise days and nights &mdash; not its hotels or prices. Saving the trip again in B2B mode
          refreshes the tour&rsquo;s days, duration and cities from the trip (the B2B quote is priced
          from them); its name, type, description and Active / Featured stay as you set them here. Saving
          at another tier adds a variation for it.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-2">4. From a spreadsheet</h3>
        <p className="text-gray-600 mb-3">
          Many tours at once come in through the <strong>Import / Export</strong> menu: a tours sheet
          (one row per tour) and a days sheet (one row per day), linked by the tour&rsquo;s code. Import
          the tours first, then their days.
        </p>
        <Tip>
          The procedure, the columns and the rules the import enforces are on{' '}
          <Link href="/docs/importing-tours" className="text-primary-600 hover:underline">Importing Tours</Link>.
          The pattern shared with suppliers and rates is in{' '}
          <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>.
        </Tip>
        <ScreenshotPlaceholder caption="The tour form's Details step with the Day-by-Day Itinerary" />
      </section>

      {/* Days */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing the days</h2>
        <p className="text-gray-600 mb-3">
          <strong>Edit days</strong> (the calendar icon) opens the tour on its <strong>Details</strong>{' '}
          step, at the <strong>Day-by-Day Itinerary</strong>. Add, edit or remove a day there; for each
          one you set:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>the <strong>city</strong> and the <strong>night</strong> &mdash; hotel, cruise, none, or in transit</li>
          <li>the three <strong>meals</strong> &mdash; included, at a restaurant, or not provided</li>
          <li><strong>attractions</strong>, picked from your entrance fees, and <strong>activities</strong></li>
          <li><strong>travel</strong> &mdash; a flight, train or sleeper and its route, a day trip from another city, the sightseeing length, and the day&rsquo;s transport</li>
          <li>a <strong>hotel per tier</strong> when the tour names its hotels</li>
        </ul>
        <p className="text-gray-600 mb-3">
          <strong>Fill from a block</strong> starts a day from one of your{' '}
          <strong>Day blocks</strong> (Settings &rsaquo; Catalog &rsaquo; Day blocks). A preview shows what the day&rsquo;s
          transport will cost. Press <strong>Update Template</strong> to save.
        </p>
      </section>

      {/* Variations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Variations</h2>
        <p className="text-gray-600 mb-3">
          In the table view, expand a tour to see its variations. Each shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>the <strong>variation name</strong>, coloured by its tier</li>
          <li><strong>private or shared</strong>, and the <strong>passenger range</strong></li>
          <li>an <strong>edit</strong> icon &mdash; change or delete the variation</li>
          <li>a <strong>calculator</strong> icon &mdash; opens the B2B Calculator on this variation</li>
          <li><strong>Options</strong> &mdash; the optional services and upgrades this variation sells</li>
        </ul>
        <p className="text-gray-600 mb-3">
          <strong>Add Variation</strong> (or <strong>Add Variations</strong> on a tour with none) opens
          a list of your tiers: tick one or several, choose private or shared for each, and create them.
          Passenger range, vehicle, accommodation and meal level come from each tier&rsquo;s defaults. A
          tier the tour already has is skipped, and the message says so.
        </p>
        <p className="text-gray-600">
          The <strong>edit</strong> icon on a variation changes its name, private or shared, passenger
          range and Active, or deletes it (its options and pricing go with it). If B2B quotes or
          departures were made from it, you are told how many and asked again: they keep their own
          prices but no longer link to it. The tier cannot be changed &mdash; add a variation at the
          other tier instead.
        </p>
      </section>

      {/* Status */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Active and Featured</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Active</strong> &mdash; listed in Tour Inventory and offered when you create a departure.</li>
          <li><strong>Inactive</strong> &mdash; left out of both, and hidden here until you switch <strong>Active Only</strong> to <strong>Show All</strong>. Its variations can still be priced in the B2B Calculator.</li>
          <li><strong>Featured</strong> &mdash; a star badge, counted in the Featured card, and listed first in Tour Inventory.</li>
        </ul>
      </section>

      {/* Tour Inventory */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tour Inventory</h2>
        <p className="text-gray-600 mb-3">
          <strong>Products &rarr; Inventory</strong> (or <strong>Browse Tours</strong>) is the
          catalogue as the team browses it &mdash; inside the app, not a public page. It lists your
          active tours, featured first, with cards for the number of packages, how many have a price,
          the categories, and the lowest starting price.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>Search by name, description or city; filter by tier (your tiers) and category (theme).</li>
          <li>Each card shows the cities, tiers, passenger range and duration; its price loads a moment later, in your currency.</li>
          <li><strong>View Details</strong> opens the tour: description, highlights, the day-by-day itinerary, what is and is not included, and a price for the number of travellers, travel date and passport type you choose (worked out by the B2B Calculator).</li>
        </ul>
      </section>

      {/* Departures */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Scheduling Departures</h2>
        <p className="text-gray-600">
          A tour is the <em>what</em>; <strong>Departures</strong> (Operate &rarr; Departures)
          is the <em>when</em>. A departure is created on one of your active tours (or under a name of
          its own). See <Link href="/docs/tasks-departures" className="text-primary-600 hover:underline">Tasks, Departures &amp; Capacity</Link>.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/tour-programs" />
    </div>
  )
}
