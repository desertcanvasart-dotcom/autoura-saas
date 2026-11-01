import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/tours-rates')

const CATEGORIES: Array<{ group: string; name: string; what: string }> = [
  { group: 'Accommodation', name: 'Hotels', what: 'By city, tier and board basis. Prices are dated rate periods (up to six): per person in a double, single supplement, triple reduction — each for EU and non-EU passports — and optional room supplements (a view, a meal plan) with low, high and peak prices, offered in the Quote Builder under Hotel Services on that hotel’s nights. One hotel per city and tier can be starred Preferred.' },
  { group: 'Accommodation', name: 'Nile Cruises', what: 'By ship and cabin, with the sailing lengths and days it runs, embark and disembark cities, meals and sightseeing, in dated periods. One preferred ship per tier.' },
  { group: 'Accommodation', name: 'Sleeping Trains', what: 'By route and cabin: one-way and round-trip fares, a guide fare, times and season.' },
  { group: 'Accommodation', name: 'Hotel Services', what: 'Porter, check-in and check-out help and the like, by hotel category; priced per group, per person or per unit.' },
  { group: 'Transport & Tickets', name: 'Transportation', what: 'One route — a day tour, half day, airport or intercity transfer — with a rate and a passenger range per vehicle (your vehicle types).' },
  { group: 'Transport & Tickets', name: 'Flights', what: 'Domestic and international fares by route, airline and cabin: base fare and tax, baggage, flight number and times, a guide fare.' },
  { group: 'Transport & Tickets', name: 'Trains', what: 'Day trains by route and class, with a guide fare.' },
  { group: 'Transport & Tickets', name: 'Airport Services', what: 'Meet & greet and other assistance, by airport (any IATA code) and direction; per group, per person or per unit.' },
  { group: 'Guides & Services', name: 'Tour Guides', what: 'By language, grade (your own grades — the first is the default a quote asks for), city and day type (full day, half day, meet & greet), for a spot or a throughout guide.' },
  { group: 'Guides & Services', name: 'Meals', what: 'Per restaurant, meal type, city and tier; one preferred restaurant per tier and meal.' },
  { group: 'Guides & Services', name: 'Attractions', what: 'Entrance fees: one price, child and student discounts. An Add-on stays out of the automatic price; Sell as extra lets travellers add it after booking.' },
  { group: 'Guides & Services', name: 'Activities', what: 'The Activities & Add-ons catalogue: per person, per unit (a boat for six), a flat price, or tiered by group size.' },
  { group: 'Costs', name: 'Tipping', what: 'By role, context (day tour, cruise …), optional city and unit (per day, service, night, cruise or person). A city row wins over the any-city row.' },
  { group: 'Costs', name: 'Fixed Costs', what: 'Per-person costs per sightseeing day. Pricing reads the water cost; your own row replaces the shared default.' },
]

export default function ToursRatesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tours &amp; Rates</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Tours &amp; Rates</h1>

      {/* Tour Inventory */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tour Inventory</h2>
        <p className="text-gray-600">
          Ready-made tours are browsed in <strong>Products &rarr; Inventory</strong> (Tour Inventory) and created and
          edited in the <strong>Tour Manager</strong> (<strong>Products &rarr; Tours</strong>) &mdash; both described on{' '}
          <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Manager</Link>.
          To schedule dated departures on a tour, use <strong>Operate &rarr; Departures</strong>.
        </p>
        <DocScreenshot src="/docs/tours-rates/tours-list.jpg" alt="Tour Inventory page with tier and category filters and tour cards" />
      </section>

      {/* Rates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rates</h2>
        <p className="text-gray-600 mb-4">
          Your buying rates live under <strong>Suppliers &amp; rates</strong> in the sidebar (admins and managers):
          fourteen rate sheets in four groups &mdash; Accommodation, Transport &amp; tickets, Guides &amp; services, Costs.
          There are three ways to reach a sheet:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>The sidebar</strong> &mdash; each group is a foldable heading under <strong>Rates overview</strong> and <strong>Rates check</strong>; open it to see its sheets. A group you open stays open.</li>
          <li><strong>The Rates menu</strong> &mdash; every rate sheet has a menu beside it: <strong>Overview</strong>, then the fourteen sheets by group, each with its count of rates. On a phone it is a picker at the top.</li>
          <li><strong>&#8984;K</strong> &mdash; type the sheet&apos;s name (&ldquo;hotels&rdquo;, &ldquo;tipping&rdquo;) and press Enter.</li>
        </ul>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Page</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What a rate holds</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {CATEGORIES.map((c, i) => (
                <tr key={c.name} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-medium align-top whitespace-nowrap">{c.name}<div className="text-xs font-normal text-gray-400">{c.group}</div></td>
                  <td className="px-4 py-2.5">{c.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding and editing</h3>
        <p className="text-gray-600 mb-3">
          Rates are added and changed on their own page: <strong>Add</strong> opens the form, the pencil
          edits a rate, <strong>Duplicate</strong> starts a new one from it. A rate can be switched off
          (Active) rather than deleted; the pages have search and filters, and a switch to show the
          inactive rates too. Most pages link a rate to its <Link href="/docs/suppliers" className="text-primary-600 hover:underline">supplier</Link>{' '}
          &mdash; and, for hotels, ships and trains, to the supplier&rsquo;s property.
        </p>
        <Tip>
          Rates price everything: the <strong>Quote Builder</strong>, tours priced from their days, and
          the <strong>B2B Calculator</strong>. A service with no rate is shown as a gap in the price,
          never filled in with a guess.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Currency</h3>
        <p className="text-gray-600">
          Amounts are in your rates currency (Settings &rsaquo; Organization &rsaquo; Company) unless a rate says otherwise:
          each form&rsquo;s <strong>Rate currency</strong> lets one contract be entered in, say, EUR while
          the rest are in EGP. The amount is stored as you typed it; pricing converts it with your
          exchange rates.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">EU and non-EU passports</h3>
        <p className="text-gray-600">
          Hotels and Nile cruises have separate prices for EU and non-EU passport holders. Every other
          rate has one price, used for both.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The Rates Overview</h3>
        <p className="text-gray-600 mb-3">
          <strong>Rates overview</strong> (the page called <strong>Rates</strong>, formerly the Rates Hub) shows what is on file at a glance:
          <strong> Rates on file</strong>, <strong>Expiring in 30 days</strong> and <strong>Flagged by Rates check</strong> (click it
          to open the check), then each group with its sheets &mdash; how many rates each holds, when it last changed, and how
          many expire soon. Click a sheet to open it. <strong>Import sheet</strong> and <strong>Add rate</strong> ask which sheet
          you mean, since each sheet has its own columns. If the counts cannot be loaded, the page says so rather than showing zeros.
          The buttons on some sheets and in the Tour Manager that read <strong>&larr; Rates Hub</strong> open this page.
        </p>
        <DocScreenshot src="/docs/tours-rates/rates-hub.jpg" alt="Earlier Rates Hub page with stats cards, category tabs, filters, and the rates table (now the Rates overview)" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Importing rates from a spreadsheet</h3>
        <p className="text-gray-600">
          Every rate page has <strong>Sample CSV</strong>, <strong>Export CSV</strong> and{' '}
          <strong>Import CSV</strong>. Rate sheets that link a supplier carry a <strong>supplier code</strong>{' '}
          column (Tipping and Fixed Costs have none), so each rate re-attaches to its supplier; a code your
          agency does not have is reported and that row skipped. See{' '}
          <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Labels in your own words</h3>
        <p className="text-gray-600">
          The choices in the forms and the words in the tables &mdash; tiers, vehicles, cabins, meal and
          service types, seasons &mdash; come from your{' '}
          <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link>.
          Rename one there and every rate page reads it. The page and column titles themselves are fixed.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/tours-rates" />
    </div>
  )
}
