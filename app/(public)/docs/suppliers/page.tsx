import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/suppliers')

export default function SuppliersPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Suppliers</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Suppliers</h1>
      <p className="text-gray-600 mb-8">
        The Suppliers page is your directory of every company and person you buy from &mdash; hotels,
        transport companies, guides, cruise lines, restaurants and more. Find it under{' '}
        <strong>Suppliers &amp; rates &rarr; Suppliers</strong> in the sidebar (admins and managers).
      </p>

      {/* Tabs */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">My suppliers and Network</h2>
        <p className="text-gray-600 mb-3">The page has two tabs:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>My suppliers</strong> &mdash; your own directory, described on the rest of this page. It is the tab Suppliers opens on.</li>
          <li>
            <strong>Network</strong> &mdash; the shared Autoura network: verified suppliers who chose to be found by other agencies.
            Search by <strong>City</strong>, <strong>Language</strong> and <strong>Words</strong> (name or about), then{' '}
            <strong>Add to my suppliers</strong>; a supplier already added shows <strong>On your list</strong>. Once added, ask them
            like any supplier and agree each price with them &mdash; other agencies never see your rates or notes, and you never see theirs.
            The <strong>Supplier network</strong> link in the sidebar opens this tab directly, and old links to Network Suppliers land here.
          </li>
        </ul>
        <p className="text-gray-600">
          Whether you book from your own list, the network, or both is set in{' '}
          <strong>Settings &rsaquo; Organization &rsaquo; Supplier network</strong> (admins change it, managers can read it). The same
          page lists suppliers waiting for you to confirm their sign-in. If network search is switched off for your agency, the Network
          tab says so and links to Settings.
        </p>
      </section>

      {/* Types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supplier types</h2>
        <p className="text-gray-600 mb-3">
          The types are <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">your own</Link>{' '}
          (Settings &rsaquo; Catalog &rsaquo; Vocabulary &rarr; Supplier types). The starter list has Hotel,
          Transport Company, Driver, Guide, Cruise, Train Operator, Airline, Activity Provider,
          Attraction, Tour Operator, Ground Handler, Restaurant, Shop and Other; rename, hide or add
          your own. A supplier can fill <strong>several</strong> roles &mdash; a ground handler that
          also runs a cruise &mdash; and what each role can own (ships, hotels, trains) follows from it.
        </p>
        <p className="text-gray-600">
          Each supplier has a status &mdash; <strong>active</strong>, <strong>inactive</strong> or{' '}
          <strong>pending</strong> &mdash; so old contacts stay on record without crowding the list.
        </p>
      </section>

      {/* Browsing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The directory</h2>
        <p className="text-gray-600 mb-3">On the <strong>My suppliers</strong> tab:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Views</strong> &mdash; grid, table and list, with pages of 12 or more</li>
          <li><strong>Type tabs</strong> &mdash; the chosen type is kept in the address, so a filtered view can be bookmarked</li>
          <li><strong>Search</strong> &mdash; name, contact name, email and city; and a <strong>status</strong> filter</li>
          <li><strong>Sort</strong> (table view) &mdash; by name, type, city or status</li>
          <li><strong>Select</strong> several and <strong>Delete Selected</strong>; WhatsApp, email and phone links on each supplier</li>
        </ul>
        <p className="text-gray-600">
          The header has <strong>Add Supplier</strong>, the <strong>Import / Export</strong> menu and{' '}
          <strong>Reconcile Codes</strong> (below).
        </p>
        <ScreenshotPlaceholder caption="Suppliers directory: type tabs, search, status filter, and the Import / Export menu" />
      </section>

      {/* Adding */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a supplier</h2>
        <p className="text-gray-600 mb-3">
          <strong>Add Supplier</strong> asks for the name and at least one type, then the contact
          details (contact name, email, phone, a second phone, WhatsApp, website, address, city), the
          commission &mdash; a rate, and whether you receive it or pay it &mdash; payment terms, status
          and notes. The form is the same for every type. The country is your agency&rsquo;s operating
          country (Settings &rsaquo; Organization &rsaquo; Company); the cities are your destination cities.
        </p>
        <p className="text-gray-600">
          Saving a hotel, cruise company or train operator opens its <strong>Properties</strong> tab, so
          you can add its hotels, ships or trains straight away.
        </p>
      </section>

      {/* Code */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The supplier code (SUP-####)</h2>
        <p className="text-gray-600 mb-3">
          Every new supplier is given the next code of your agency &mdash; <strong>SUP-0001</strong>,{' '}
          <strong>SUP-0002</strong> and so on &mdash; shown on its Details tab. A code that arrives in an
          import is kept as it is, so you can bring your own numbering. Codes are unique within your
          agency; another agency&rsquo;s SUP-0001 is its own.
        </p>
        <p className="text-gray-600">
          The code is what makes rates <em>portable</em>: a rate sheet names its supplier by code, so
          rates exported here and imported elsewhere re-attach to the supplier with the same code instead
          of arriving unlinked. <strong>Reconcile Codes</strong> stamps the codes from another
          install&rsquo;s supplier export onto your suppliers, matching them by email or phone, after a
          preview.
        </p>
      </section>

      {/* CSV */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Importing &amp; exporting suppliers</h2>
        <p className="text-gray-600 mb-3">
          The <strong>Import / Export</strong> menu has two sheets.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mb-2">The suppliers sheet</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Sample sheet</strong>, <strong>Export suppliers</strong>, <strong>Import suppliers</strong>.</li>
          <li>
            Import <strong>updates</strong> the supplier a row matches &mdash; by its <strong>Code</strong>{' '}
            (whatever the letter case), else by its <strong>Name</strong> &mdash; and <strong>creates</strong>{' '}
            the rest, each with a new code when the row has none. A renamed supplier is found by its
            code. A row whose name belongs to a supplier with a different code is refused.
          </li>
          <li>
            On an update, the cells a row fills in are written; a blank cell leaves the stored value.
            A row with no Type keeps the supplier&rsquo;s roles (a new one lands as Other, and is reported).
          </li>
          <li>
            The <strong>Type</strong> cell may list several roles (<code>hotel | transport_company</code>),
            in your words or keys. <strong>Commission</strong> is a number (<code>10</code> or{' '}
            <code>10%</code>). A <strong>Properties</strong> cell (<code>hotel:Nile Star | ship:MS Hapi</code>)
            adds the hotels, ships or trains the supplier does not have yet.
          </li>
          <li>
            Refused, not guessed: an unknown type, a commission that is not a number, a name or code
            twice in one file. The rest still imports. The sample&rsquo;s example row (code{' '}
            <code>EXAMPLE-SUP-0001</code>) is skipped.
          </li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mb-2">The properties sheet</h3>
        <p className="text-gray-600 mb-3">
          <strong>Export properties</strong> and <strong>Import properties</strong>: one row per hotel,
          ship or train, under its supplier (by Supplier Code, else name). A row updates the property
          with its Property ID, else the one with the same supplier, kind and name, and creates the rest.
          A blank cell clears that field; a column the sheet does not have is left alone. Nothing is
          ever deleted &mdash; retire a property with Active = false.
        </p>
        <Tip>
          Import suppliers <em>before</em> their rates. A rate whose supplier code is not in your
          agency is reported and skipped &mdash; so suppliers first, then rates. The shared CSV rules
          are in <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>.
        </Tip>
      </section>

      {/* Viewing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A supplier&rsquo;s tabs</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Details</strong> &mdash; contacts, code, status, commission and payment terms, notes.</li>
          <li><strong>Rates</strong> &mdash; for transport companies and drivers: the transport rates priced with them.</li>
          <li>
            <strong>Properties</strong> &mdash; for a supplier that runs hotels, ships or trains. A hotel
            also carries its accommodation type (from your vocabulary), which its hotel rates inherit.
            Renaming a property renames it on its rates too; a property its rates still use cannot be
            deleted &mdash; mark it inactive instead.
          </li>
          <li>
            <strong>Documents</strong> &mdash; contracts, rate sheets, allotments, licences and insurance:
            a PDF, image, .docx or .xlsx file with its validity dates, optionally tied to one property.
            Documents ending within 60 days are flagged <em>Expiring soon</em>; files open through a
            short-lived private link.
          </li>
        </ul>
        <ScreenshotPlaceholder caption="A supplier's Details, Rates, Properties and Documents tabs" />
      </section>

      {/* Delete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting a supplier</h2>
        <p className="text-gray-600">
          Deleting a supplier deletes its properties and documents with it. If rates are priced on one
          of its hotels, ships or trains, the delete is refused and says how many &mdash; delete those
          rates first, or mark the supplier inactive.
        </p>
      </section>

      {/* Finance */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Suppliers and money</h2>
        <p className="text-gray-600">
          What suppliers bill you is recorded on the <strong>Bills</strong> tab of <strong>Supplier bills</strong> and what you owe
          on its <strong>Payables</strong> tab (both in the sidebar&rsquo;s Finance section) &mdash; see{' '}
          <Link href="/docs/invoices-payments" className="text-primary-600 hover:underline">Invoices &amp; Payments</Link>.
          Their rates are on the rate pages of this group &mdash; see{' '}
          <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Tours &amp; Rates</Link>.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/suppliers" />
    </div>
  )
}
