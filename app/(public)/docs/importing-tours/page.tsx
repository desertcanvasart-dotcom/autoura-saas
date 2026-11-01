import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/importing-tours')

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
        <p className="text-gray-600 mb-3">
          Both live in the <strong>Import / Export</strong> menu at the top of the Tour Manager
          (Products &rarr; Tours).
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Sheet</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Menu items</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">What it carries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Tours sheet</td>
                <td className="px-4 py-3 text-gray-700">Sample sheet &middot; Export tours &middot; Import tours</td>
                <td className="px-4 py-3 text-gray-700">The tour itself, one row per tour: code, name, type, durations, cities, theme, highlights, inclusions, descriptions, images, flags.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Days sheet</td>
                <td className="px-4 py-3 text-gray-700">Sample days sheet &middot; Export days &middot; Import days &mdash; replaces itineraries</td>
                <td className="px-4 py-3 text-gray-700">The itinerary: <strong>one row per day</strong> &mdash; city, night, the three meals, attractions, travel, sightseeing and the service flags.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mb-3">
          Why two? A day is a record in its own right &mdash; three meals, a night, attractions, travel,
          several flags &mdash; and a tour has several of them. That does not fit into one row of a
          spreadsheet without inventing a code inside a cell that nobody can edit reliably. Suppliers
          have a separate properties sheet for the same reason.
        </p>
        <Tip>
          A tours sheet on its own imports a tour with <strong>no days</strong>. No days means no
          nights, no meals and nothing to price from: the tour shows a &ldquo;no day-by-day
          itinerary&rdquo; gap instead of a price until its days arrive.
        </Tip>
        <ScreenshotPlaceholder caption="The Tour Manager's Import / Export menu: the tours sheet items above, the days sheet items below" />
      </section>

      {/* Procedure */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The procedure</h2>
        <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-4">
          <li>
            <strong>Get both files.</strong> For new tours, download <strong>Sample sheet</strong> and{' '}
            <strong>Sample days sheet</strong> &mdash; each has one example row, and both use the same
            placeholder code. For existing tours, use <strong>Export tours</strong> and{' '}
            <strong>Export days</strong>.
          </li>
          <li>
            <strong>Fill them in.</strong> Give the tour a real code in the <em>Code</em> column of the
            tours sheet and put the <em>same</em> code in the <em>Template Code</em> column of every
            one of its day rows. That code is the link.
          </li>
          <li>
            <strong>Import the tours sheet first</strong>, with <strong>Import tours</strong>.
          </li>
          <li>
            <strong>Then import the days</strong>, with <strong>Import days</strong>. Order matters: a
            days sheet never creates a tour, it only fills one that already exists. Before anything is
            replaced, the import shows how many tours and days the file holds, how many rows it will
            skip and why, and any columns it will not read &mdash; and asks you to confirm.
          </li>
        </ol>
        <p className="text-gray-600">
          Open the tour afterwards (the calendar button on its row) and check the{' '}
          <strong>Day-by-Day Itinerary</strong> on the <strong>Details</strong> tab: the day count, and
          each day&rsquo;s meals, should read exactly as your sheet said.
        </p>
      </section>

      {/* Tours sheet */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The tours sheet</h2>
        <p className="text-gray-600 mb-3">
          Required columns are <strong>Code</strong>, <strong>Name</strong>, <strong>Type</strong> and{' '}
          <strong>Duration Days</strong>. The rest are optional: Duration Nights, Duration Hours,
          Accommodation Nights, Cities, Destinations, Theme, Physical Level, Age Suitability, Best For,
          Highlights, Main Attractions, Inclusions, Exclusions, Short and Long Description, Image URL,
          Gallery URLs, Default Transport Service, Transport City, Pickup Required, Featured and Active.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>
            <strong>Lists</strong> &mdash; cities, highlights, attractions, inclusions, best-for and the
            like &mdash; are separated with a semicolon (a <code>|</code> also splits, so keep it out of
            the text).
          </li>
          <li>
            <strong>Type, Theme, Physical Level, Best For</strong> come from{' '}
            <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">your vocabulary</Link>.
            You may type either the word you see on the form (&ldquo;Day Tour&rdquo;) or its key
            (<code>day_tour</code>). A value that matches nothing is refused by name, with your valid
            options listed &mdash; never stored as something the form cannot show.
          </li>
          <li>
            <strong>Numbers</strong> are whole numbers; <strong>Featured, Active, Pickup Required</strong>{' '}
            take <code>true</code> or <code>false</code> (yes / no and 1 / 0 also work). Anything else
            &mdash; &ldquo;two&rdquo;, &ldquo;2.5&rdquo;, &ldquo;ture&rdquo; &mdash; refuses the row
            rather than being read as nothing or as false.
          </li>
          <li>
            <strong>Image URL and Gallery URLs</strong> are the only way to give a tour pictures: the
            Tour Manager form has no image field.
          </li>
          <li>
            <strong>Meals Included</strong> is written on export and <em>ignored on import</em>. It is
            worked out from the days, so it can describe the tour but never contradict it. Meals belong
            on the days sheet.
          </li>
          <li>
            Column headers are forgiving (&ldquo;Tour Code&rdquo;, &ldquo;Days&rdquo; are accepted) and
            order does not matter. Columns the import does not read are <strong>named</strong> in the
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

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-2">Every day says whether it has sightseeing</h3>
        <p className="text-gray-600 mb-3">
          A day lists its <strong>Attractions</strong>, sets <strong>Guide</strong> to true, or puts{' '}
          <code>none</code> in <strong>Sightseeing</strong>. A day that does none of these is refused
          &mdash; a departure day included, so give it <code>none</code>. Saying <code>none</code> while
          listing attractions or a guide is refused too. A day in the air is exempt. (A sheet saved
          before the Sightseeing column existed is not held to this rule.)
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-2">The other columns</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Title</strong> and <strong>Description</strong> &mdash; the day&rsquo;s heading and text.</li>
          <li><strong>City</strong> &mdash; one city. &ldquo;Cairo; Luxor&rdquo; is refused: a day that travels is in the city it ends in.</li>
          <li><strong>Accommodation</strong> &mdash; <code>hotel</code>, <code>cruise</code>, <code>none</code>, or <code>in_the_air</code> for an overnight flight. Nights are counted from these, not from Duration Nights. A departure day is <code>none</code>. A blank means the day does not say, and pricing works it out.</li>
          <li><strong>Attractions</strong> &mdash; names, semicolon-separated, matched to your attraction rates by name.</li>
          <li><strong>Transport</strong> &mdash; <code>road</code> (the default), <code>flight</code>, <code>train</code> or <code>sleeping_train</code>. A flight or day train runs from the <em>previous</em> day&rsquo;s city into this one; a sleeping train leaves this day&rsquo;s city for the next. <strong>Leg From / Leg To</strong> give a ticket its own route, and are refused on a road day.</li>
          <li><strong>Assist At Departure / Arrival</strong> &mdash; <code>yes</code> or <code>no</code>, airport assistance on a flight day only.</li>
          <li><strong>Transport Lines, Road Transfers, Cruise Boarding Assist, Cruise Leaving Assist, Local Transfer, Day Trip From, Sightseeing Length</strong> &mdash; the same settings as the day editor in the Tour Manager. Blank leaves them to the usual rules.</li>
          <li><strong>Airport Arrival / Departure, Hotel Check-in / Check-out, Guide</strong> &mdash; <code>true</code> or <code>false</code> (yes / no and 1 / 0 also work). Anything else refuses the row.</li>
        </ul>
      </section>

      {/* Rules */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the import will and will not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Tour rows update by code.</strong> An existing code is updated; a new code is created. Codes match whatever their letter case. Re-importing never touches days you have already built.</li>
          <li><strong>A blank cell clears the field; a missing column leaves it alone.</strong> Clear Image URL in an exported sheet and the tour loses its image; leave the column out of the sheet and the image stays. (A blank Duration Nights reads as 0; a blank yes/no column keeps its value.)</li>
          <li><strong>A days sheet replaces the whole itinerary</strong> of every tour it names, and leaves every tour it does not name alone. Export fresh before editing rather than reusing an old file.</li>
          <li><strong>One refused day refuses its whole tour.</strong> Writing the other days would delete the refused one, so that tour keeps its current itinerary until the sheet is fixed.</li>
          <li><strong>Nothing is guessed.</strong> A row with a problem is refused with the reason, and the rest of the file still imports. The result names the first reason; fix it and import again to see the next.</li>
          <li><strong>The example row is skipped.</strong> Any code beginning <code>EXAMPLE-</code> is ignored, so uploading a sample unedited creates nothing &mdash; and if <em>every</em> row is still an example, the import says so rather than reporting &ldquo;nothing to do&rdquo;.</li>
          <li><strong>A code may appear once</strong> in a tours sheet; a repeat is refused.</li>
          <li><strong>Codes are yours.</strong> Two organizations can use the same tour code without colliding.</li>
          <li><strong>Who can import:</strong> admins and managers, like the rest of the Tour Manager.</li>
        </ul>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/importing-tours" />
    </div>
  )
}
