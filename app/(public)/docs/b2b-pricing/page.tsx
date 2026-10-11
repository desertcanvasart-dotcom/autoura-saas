import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder } from '../layout'
import { DocPager } from '../pager'

export default function B2BPricingPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2B Pricing</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2B Pricing</h1>
      <p className="text-gray-600 mb-8">
        The B2B Calculator prices a tour programme for your partners from your live rates: the cost of every service, your margin, and a rate sheet for groups of 1 to 10 &mdash; with or without a tour leader.
      </p>

      {/* Access */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Opening the Calculator</h2>
        <p className="text-gray-600 mb-3">
          The calculator has no sidebar entry of its own. Open it from:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Tours &rarr; Tour Manager</strong> &mdash; the calculator icon (<em>Calculate Price</em>) on any variation</li>
          <li><strong>The Quote Builder</strong> &mdash; after a B2B save, it opens on the new programme (see <Link href="/docs/b2b-import" className="text-primary-600 hover:underline">Converting Itineraries to B2B</Link>)</li>
        </ul>
        <p className="text-gray-600 mt-3">
          It always prices one variation of a tour programme, at that variation&apos;s tier. It is for managers and admins; others see <em>&ldquo;Access Denied&rdquo;</em>.
        </p>
        <ScreenshotPlaceholder caption="The calculator's inputs and the View Saved Quotes link" />
      </section>

      {/* Inputs */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Inputs</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Number of Passengers</strong> &mdash; 1 to 50</li>
          <li><strong>Tour Leader</strong> &mdash; <strong>+0 (No TL)</strong> or <strong>+1 (With TL)</strong>; the leader&apos;s costs are shared among the paying guests</li>
          <li><strong>Guide</strong> &mdash; <strong>Spot</strong> (a guide on the sightseeing days) or <strong>Throughout (+1)</strong> (one guide travels the whole trip: a fee every day, a bed each night at the property&apos;s guide rate, meals for small groups, one more vehicle seat); the <strong>Guide language</strong> (a language with no rate is marked <em>no rate</em>); and the <strong>grade</strong> &mdash; one of your own guide grades, the first being the default</li>
          <li><strong>Travel Date</strong> &mdash; Picks the dated hotel and cruise rates, and your seasonal premium (added to the margin and to every row of the rate sheet)</li>
          <li><strong>Passport Type</strong> &mdash; <strong>European Passport</strong> or <strong>Non-European Passport</strong>, for entrance fees</li>
          <li><strong>Profit Margin (%)</strong> &mdash; 25% to start</li>
          <li><strong>Extras</strong> &mdash; Tick the extras from your <Link href="/docs/extras" className="text-primary-600 hover:underline">Extras list</Link> to include</li>
        </ul>
      </section>

      {/* Results */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Calculating a Price</h2>
        <p className="text-gray-600 mb-3">Click <strong>Calculate Price</strong>:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Summary</strong> &mdash; <strong>Total Cost</strong>, <strong>Margin</strong>, <strong>Selling Price</strong> and <strong>Per Person</strong>, with the season and tour leader badges</li>
          <li><strong>Single Supplement</strong> &mdash; The extra per person for a single room, when the programme has one</li>
          <li><strong>Options for this programme</strong> &mdash; The programme&apos;s optional services (set in Tour Manager); tick the ones the partner is buying and the price updates</li>
          <li><strong>Check this</strong> &mdash; Notes worth a look that do not stop the price, such as a cruise whose sailing days do not match the date</li>
        </ul>
        <ScreenshotPlaceholder caption="Price summary cards, the single supplement and the cost breakdown by day" />
      </section>

      {/* Breakdown */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Cost Breakdown</h2>
        <p className="text-gray-600">
          Every service, grouped by <strong>Day</strong> (and <strong>Whole trip</strong>), with its Source, Mode, Qty, Unit and Total. Extras and options are marked <strong>Extra</strong> or <strong>Option</strong>. The foot shows the Subtotal, the tour leader&apos;s cost, the Margin and the Total.
        </p>
      </section>

      {/* Incomplete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Incomplete Pricing</h2>
        <p className="text-gray-600 mb-3">
          The calculator never makes up a price. A service with no rate shows in its day in red, marked <strong>no rate</strong>, at 0, and a banner lists them: <em>&ldquo;&#9888; Incomplete pricing &mdash; N item(s) have no rate &hellip; Add the missing rates before sending this rate sheet to a partner.&rdquo;</em>
        </p>
      </section>

      {/* Rate sheet */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Rate Sheet</h2>
        <p className="text-gray-600 mb-3">
          <strong>Generate Rate Sheet (1-10 pax)</strong> prices the same programme for every group size from 1 to 10: Pax, Cost, Margin, Selling and Per Person (marked <strong>(+1)</strong> with a tour leader). <strong>Export CSV</strong> downloads it. When you save the quote, this sheet becomes the partner&apos;s price table.
        </p>
        <ScreenshotPlaceholder caption="Rate sheet for 1-10 pax with the Export CSV button" />
      </section>

      {/* How */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How the Price Grows with the Group</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Per-person costs</strong> (hotels, entrances, meals) are multiplied by the travellers</li>
          <li><strong>Group costs</strong> (the guide) are shared among them</li>
          <li><strong>Transport</strong> steps up through your vehicle sizes as the group grows &mdash; by default sedan, minivan, van, minibus and bus, or your own sizes from Your Vocabulary</li>
          <li><strong>Activities</strong> with group-size tiers (Suppliers &amp; Rates &rarr; Guides &amp; Services &rarr; Activities) use the tier for the group</li>
          <li><strong>A tour leader</strong>&apos;s costs are shared among the paying guests</li>
        </ul>
      </section>

      {/* Save */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Saving the Quote</h2>
        <p className="text-gray-600">
          <strong>Save as Quote</strong> saves it as a draft B2B quote for a partner, valid for 30 days &mdash; see <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link>. <strong>View Saved Quotes</strong> lists them.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/b2b-pricing" />
    </div>
  )
}
