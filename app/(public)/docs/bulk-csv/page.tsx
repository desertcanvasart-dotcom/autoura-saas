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
          A flat sheet carries the flat facts &mdash; names, types, durations, contact details,
          prices. It does <strong>not</strong> carry the nested things a spreadsheet cannot hold: a
          tour&rsquo;s day-by-day itinerary, its hotels, or its variations. Importing tour rows
          creates the <em>shells</em>; you build each itinerary in the editor afterwards. Crucially,
          import writes only the columns in the sheet, so re-importing a template never wipes an
          itinerary you have already built.
        </p>
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
