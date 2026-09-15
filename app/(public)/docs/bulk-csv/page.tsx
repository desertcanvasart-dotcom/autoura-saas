import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function BulkCsvPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Bulk Import (CSV)</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Bulk Import (CSV)</h1>
      <p className="text-gray-600 mb-8">
        Several parts of the app let you load many records from a spreadsheet instead of typing them
        one at a time &mdash; suppliers, rates, and tour templates. They all work the same way, so
        once you have done one you have done them all.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sample &rarr; Export &rarr; Import</h2>
        <p className="text-gray-600 mb-3">Wherever bulk import lives, you get the same three buttons:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Sample CSV</strong> &mdash; downloads a sheet with the right column headers and one filled-in example row, so you never have to guess the shape.</li>
          <li><strong>Export</strong> &mdash; downloads what is already in the app, in the same shape. Edit it and re-import to make changes in bulk.</li>
          <li><strong>Import</strong> &mdash; reads a filled-in sheet back in.</li>
        </ul>
        <ScreenshotPlaceholder caption="The Sample / Export / Import buttons in the Tour Manager" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Import upserts by code</h2>
        <p className="text-gray-600 mb-3">
          Each row is matched on its stable code &mdash; a supplier&rsquo;s{' '}
          <Link href="/docs/suppliers" className="text-primary-600 hover:underline">SUP-#### code</Link>,
          a template code, a rate&rsquo;s key. If the code already exists the row updates it; if it is
          new the row creates it. Running the same file twice is safe. Everything imports into your
          own organization&rsquo;s data and nowhere else.
        </p>
        <Tip>
          The example row in a Sample CSV uses an <code>EXAMPLE-</code> code, and import quietly skips
          those. So you can download a sample, import it unchanged to prove the round-trip, and
          nothing is created.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a sheet does and does not carry</h2>
        <p className="text-gray-600 mb-3">
          A row carries flat facts &mdash; names, types, durations, contact details, prices, and
          semicolon-separated lists. It cannot carry a <em>nested</em> record. So where a thing has
          children of its own, the children get a sheet of their own, one row each: a supplier&rsquo;s
          properties, and a tour&rsquo;s days. Import writes only the columns in the sheet, so
          re-importing a tour never wipes the days you have already built.
        </p>
        <Tip>
          Tours are the clearest case: the tour is one sheet, its day-by-day itinerary is another, and
          they are linked by the tour code. See{' '}
          <Link href="/docs/importing-tours" className="text-primary-600 hover:underline">Importing Tours</Link>{' '}
          for the order and the rules.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Nothing is guessed</h2>
        <p className="text-gray-600 mb-3">The same rules apply to every sheet:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Headers are forgiving.</strong> Column order does not matter, and common variants of a name are accepted. A required column that is genuinely missing is reported once, about the file, with the columns it found instead.</li>
          <li><strong>Unknown columns are named.</strong> A column the import does not read is listed in the result rather than silently dropped, so you can tell &ldquo;it was never read&rdquo; from &ldquo;it did not import&rdquo;.</li>
          <li><strong>Vocabulary values accept words or keys.</strong> Type what you see on the form or the key behind it; a value that matches nothing in your vocabulary is refused by name with your valid options listed.</li>
          <li><strong>A bad row is refused, not repaired.</strong> The reason names the row, the column and the value. Good rows in the same file still import.</li>
          <li><strong>The example row is skipped.</strong> Any <code>EXAMPLE-</code> code is ignored, so a sample imported unedited creates nothing &mdash; and if every row is still an example, the import tells you that is why.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rates and the supplier code</h2>
        <p className="text-gray-600 mb-3">
          Rate sheets carry a <strong>supplier code</strong> column so each rate re-attaches to the
          right supplier. If a rate names a code that does not exist in your organization, that row is
          reported and skipped rather than guessed &mdash; import the supplier first (or fix the
          code), then re-run. This is what lets a set of rates move cleanly between installs; the full
          story is in <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>.
        </p>
      </section>
    </div>
  )
}
