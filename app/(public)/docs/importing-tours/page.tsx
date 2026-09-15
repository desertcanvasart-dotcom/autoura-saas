import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function ImportingToursPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Importing Tours</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Importing Tours from Spreadsheets</h1>
      <p className="text-gray-600 mb-8">
        A tour is <strong>two sheets</strong>, not one: the tour itself, and its day-by-day itinerary.
        They are linked by the tour&rsquo;s code. This page is the whole procedure &mdash; what goes in
        each file, the order to upload them, and the rules the import enforces so that what lands is
        exactly what you wrote.
      </p>

      {/* Two sheets */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Two sheets, one tour</h2>
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Sheet</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Buttons</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">What it carries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Template sheet</td>
                <td className="px-4 py-3 text-gray-700">Sample CSV &middot; Export &middot; Import</td>
                <td className="px-4 py-3 text-gray-700">The tour itself: code, name, type, theme, duration, cities, highlights, main attractions, inclusions, exclusions, descriptions, image, pickup, featured and active flags.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Days sheet</td>
                <td className="px-4 py-3 text-gray-700">Sample Days &middot; Export Days &middot; Import Days</td>
                <td className="px-4 py-3 text-gray-700">The itinerary: <strong>one row per day</strong> &mdash; city, accommodation, the three meals, attractions, travel mode, and the airport / hotel / guide flags.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mb-3">
          Why two? A day is a record in its own right &mdash; three meal states, a bed, attractions, a
          travel mode, five flags &mdash; and a tour has several of them. That does not fit into one
          row of a spreadsheet without inventing a code inside a cell that nobody can edit reliably.
          Suppliers have a separate properties sheet for the same reason.
        </p>
        <Tip>
          A template sheet on its own imports a tour with <strong>no days</strong>. No days means no
          nights, no meals and nothing for pricing to work from &mdash; the tour will show a
          &ldquo;no itinerary&rdquo; hole rather than a price until its days arrive.
        </Tip>
        <ScreenshotPlaceholder caption="The Tour Manager header: Sample CSV / Export / Import for the tour, and Sample Days / Export Days / Import Days for its itinerary" />
      </section>

      {/* Procedure */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The procedure</h2>
        <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-4">
          <li>
            <strong>Get both files.</strong> For new tours, download <strong>Sample CSV</strong> and{' '}
            <strong>Sample Days</strong> &mdash; each has one example row, and both use the same
            placeholder code. For existing tours, download <strong>Export</strong> and{' '}
            <strong>Export Days</strong>.
          </li>
          <li>
            <strong>Fill them in.</strong> Give the tour a real code in the <em>Code</em> column of the
            template sheet and put the <em>same</em> code in the <em>Template Code</em> column of every
            one of its day rows. That code is the link.
          </li>
          <li>
            <strong>Import the template sheet first</strong>, with <strong>Import</strong>.
          </li>
          <li>
            <strong>Then import the days</strong>, with <strong>Import Days</strong>. Order matters: a
            days sheet never creates a tour, it only fills one that already exists.
          </li>
        </ol>
        <p className="text-gray-600">
          Open the tour afterwards and check the <strong>Details</strong> tab: the day count, and each
          day&rsquo;s meals, should read exactly as your sheet said.
        </p>
      </section>

      {/* Template sheet */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The template sheet</h2>
        <p className="text-gray-600 mb-3">
          Required columns are <strong>Code</strong>, <strong>Name</strong>, <strong>Type</strong> and{' '}
          <strong>Duration Days</strong>. Everything else is optional. Lists &mdash; cities, highlights,
          attractions, inclusions, exclusions, best-for &mdash; are separated with a semicolon.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>
            <strong>Type, Theme, Physical Level, Best For</strong> come from{' '}
            <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">your vocabulary</Link>.
            You may type either the word you see on the form (&ldquo;Day Tour&rdquo;) or its key
            (<code>day_tour</code>). A value that matches nothing in your vocabulary is refused by name,
            with your valid options listed &mdash; never stored as something the form cannot show.
          </li>
          <li>
            <strong>Meals Included</strong> is written on export and <em>ignored on import</em>. It is
            derived from the days, so it can describe the tour but never contradict it. Meals belong on
            the days sheet.
          </li>
          <li>
            Column headers are forgiving (&ldquo;Tour Code&rdquo;, &ldquo;Days&rdquo; are accepted) and
            order does not matter. A column the import does not read is <strong>named</strong> in the
            result, never silently dropped.
          </li>
        </ul>
      </section>

      {/* Days sheet */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The days sheet</h2>
        <p className="text-gray-600 mb-3">
          Required columns are <strong>Template Code</strong> and <strong>Day</strong>. Days for one
          tour must run <strong>1, 2, 3 &hellip;</strong> with no gaps or repeats (row order does not
          matter; the set must be whole).
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-2">Every meal, every day, stated</h3>
        <p className="text-gray-600 mb-3">
          A meal is a cost line and part of the agreement with the customer, so each of{' '}
          <strong>Breakfast</strong>, <strong>Lunch</strong> and <strong>Dinner</strong> must be one of
          three words on every row. A blank cell is refused, not read as &ldquo;none&rdquo;.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Value</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Meaning</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Priced?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr><td className="px-4 py-3 font-mono text-gray-900">included</td><td className="px-4 py-3 text-gray-700">In the hotel or cruise rate (board basis)</td><td className="px-4 py-3 text-gray-700">Inside the room rate</td></tr>
              <tr><td className="px-4 py-3 font-mono text-gray-900">external</td><td className="px-4 py-3 text-gray-700">You take the group to a restaurant</td><td className="px-4 py-3 text-gray-700"><strong>Yes</strong> &mdash; per person, from your meal rates</td></tr>
              <tr><td className="px-4 py-3 font-mono text-gray-900">none</td><td className="px-4 py-3 text-gray-700">Not provided; the customer&rsquo;s own arrangement</td><td className="px-4 py-3 text-gray-700">No</td></tr>
            </tbody>
          </table>
        </div>
        <Tip>
          <strong>external is a cost, not &ldquo;own expense&rdquo;</strong> &mdash; own expense is{' '}
          <code>none</code>. Any meal can be at a restaurant, breakfast included: guests who land
          before check-in eat somewhere.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-2">Other columns</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Accommodation</strong> &mdash; <code>hotel</code>, <code>cruise</code> or <code>none</code>. Nights are counted from these, not from Duration Nights. A departure day is <code>none</code>.</li>
          <li><strong>Transport</strong> &mdash; <code>road</code>, <code>flight</code>, <code>train</code> or <code>sleeping_train</code>. A flight or train runs from the <em>previous</em> day&rsquo;s city into this one.</li>
          <li><strong>Attractions</strong> &mdash; names, semicolon-separated. They are matched to your attraction rates by name.</li>
          <li><strong>Airport Arrival / Departure, Hotel Check-in / Check-out, Guide</strong> &mdash; <code>true</code> or <code>false</code>.</li>
        </ul>
      </section>

      {/* Rules */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the import will and will not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Template rows update by code.</strong> An existing code is updated; a new code is created. Re-importing never touches days you have already built.</li>
          <li><strong>A days sheet replaces the whole itinerary</strong> of every tour it names, and leaves every tour it does not name alone. Export fresh before editing rather than reusing an old file.</li>
          <li><strong>Nothing is guessed.</strong> A row with a problem is refused and the reason names the row, the column and the value. The rest of the file still imports.</li>
          <li><strong>The example row is skipped.</strong> Any code beginning <code>EXAMPLE-</code> is ignored, so uploading a sample unedited creates nothing &mdash; and if <em>every</em> row is still an example, the import says so rather than reporting &ldquo;nothing to do&rdquo;.</li>
          <li><strong>Codes are yours.</strong> Two organizations can use the same tour code without colliding.</li>
        </ul>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/tour-programs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Tour Manager
        </Link>
        <Link href="/docs/bulk-csv" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Bulk Import (CSV)
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
