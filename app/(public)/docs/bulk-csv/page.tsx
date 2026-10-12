import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/bulk-csv')

const ROWS: Array<{ what: string; suppliers: string; properties: string; rates: string }> = [
  {
    what: 'Where',
    suppliers: 'Suppliers → Import / Export: Sample sheet · Export suppliers · Import suppliers',
    properties: 'Suppliers → Import / Export: Export properties · Import properties (no sample: start from an export)',
    rates: 'Every rate page: Sample CSV · Export CSV · Import CSV',
  },
  {
    what: 'A row matches',
    suppliers: 'its Code, else its Name',
    properties: 'its Property ID, else the same supplier, kind and name',
    rates: 'its key — the Service Code on most sheets; Cruise Code on cruises; route, service type, city and vehicle on transportation; Name on extras; Cost Type on fixed costs',
  },
  {
    what: 'Matched',
    suppliers: 'updated',
    properties: 'updated',
    rates: 'updated',
  },
  {
    what: 'Not matched',
    suppliers: 'created, with the next SUP-#### if it has no code',
    properties: 'created under its supplier',
    rates: 'created. A row with no code is matched on what identifies the rate (a hotel by name, city, tier and board; a meal by restaurant, meal, city and tier …) and updates it',
  },
  {
    what: 'A blank cell',
    suppliers: 'leaves the stored value',
    properties: 'clears the field (a column the sheet lacks is left alone)',
    rates: 'leaves the stored value',
  },
  {
    what: 'A row with a problem',
    suppliers: 'refused; the rest import',
    properties: 'refused; the rest import',
    rates: 'the whole file is refused — fix every row first; the preview lists them',
  },
  {
    what: 'Preview before import',
    suppliers: 'no',
    properties: 'no',
    rates: 'yes',
  },
]

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
        Suppliers, their properties, every rate table and your tours can be loaded from a spreadsheet
        instead of typed one at a time. The pattern is the same everywhere &mdash; download a sample or
        an export, fill it in, import it &mdash; and the differences that matter are in the table below.
        Everything imports into your own agency&rsquo;s data and nowhere else, and only admins and
        managers can import.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sample &rarr; Export &rarr; Import</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Sample</strong> &mdash; the right column headers and an example row, so you never guess the shape.</li>
          <li><strong>Export</strong> &mdash; what is in the app now, in the same shape. Edit it and import it to change many records at once.</li>
          <li><strong>Import</strong> &mdash; reads a filled-in sheet back in.</li>
        </ul>
        <ScreenshotPlaceholder caption="The Import / Export menu on the Suppliers directory" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How each sheet imports</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-900 border-b border-gray-200"></th>
                <th className="text-left px-3 py-2 font-semibold text-gray-900 border-b border-gray-200">Suppliers</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-900 border-b border-gray-200">Supplier properties</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-900 border-b border-gray-200">Rates</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {ROWS.map((r, i) => (
                <tr key={r.what} className={`border-b border-gray-100 align-top ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{r.what}</td>
                  <td className="px-3 py-2">{r.suppliers}</td>
                  <td className="px-3 py-2">{r.properties}</td>
                  <td className="px-3 py-2">{r.rates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mt-3">
          Codes and keys match whatever their letter case. Tours have their own two sheets and rules
          &mdash; see <Link href="/docs/importing-tours" className="text-primary-600 hover:underline">Importing Tours</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a sheet does and does not carry</h2>
        <p className="text-gray-600">
          A row carries flat facts &mdash; names, types, contact details, prices, and lists separated
          with semicolons. A record with children of its own gets a second sheet for them, one row each:
          a supplier&rsquo;s properties, a tour&rsquo;s days. Some lists fit in one cell: a
          supplier&rsquo;s several roles (<code>hotel | transport_company</code>), its properties&rsquo;
          names (<code>hotel:Nile Star | ship:MS Hapi</code>), an activity&rsquo;s group-size bands
          (<code>1-4:25; 5-8:40</code>), a cruise&rsquo;s sailing days (<code>mon;fri</code>).
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Nothing is guessed</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Words from your vocabulary</strong> (types, tiers, board basis, vehicles, seasons) may be
            written as you see them on the form or as the key behind them. One that matches nothing is refused.
          </li>
          <li>
            <strong>Numbers and yes/no cells</strong> are checked: &ldquo;ten&rdquo; or &ldquo;ture&rdquo; is
            refused, not stored as 0 or false. Yes/no accepts true/false, yes/no, y/n and 1/0.
          </li>
          <li>
            <strong>Duplicates are refused.</strong> Two rows with the same code or key in one file, or a rate
            key that two of your stored rates share (one row would overwrite both).
          </li>
          <li>
            <strong>Headers.</strong> The supplier and property sheets accept common variants of a column name;
            rate sheets want the column names as the sample and export write them. Columns an import does not
            read are ignored.
          </li>
          <li>
            <strong>The example row is skipped.</strong> The sample&rsquo;s example row (a code beginning{' '}
            <code>EXAMPLE-</code>) is never imported, so a sample uploaded unedited creates nothing &mdash; and
            a rates file holding only the example says so.
          </li>
          <li>
            <strong>Preferred.</strong> A rate sheet that stars a hotel, ship or restaurant as Preferred takes
            the star from the one that had it, as the star on the page does.
          </li>
        </ul>
        <Tip>
          Export from the app you are importing into before you edit. A rate export is your agency&rsquo;s own
          rates only &mdash; the shared catalogue rows are not in it, so importing it back never copies them.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rates and the supplier code</h2>
        <p className="text-gray-600">
          Rate sheets that link a supplier carry a <strong>supplier code</strong> column, so each rate
          re-attaches to the right supplier. A code your agency does not have is reported and that row
          skipped &mdash; import the supplier first (or fix the code), then import again. A row with no code
          but a supplier name is linked by the name when exactly one supplier has it, and reported when not.
          Why codes matter: <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/bulk-csv" />
    </div>
  )
}
