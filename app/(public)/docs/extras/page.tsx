import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/extras')

export default function ExtrasPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Extras &amp; Upgrades</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Extras &amp; Upgrades</h1>
      <p className="text-gray-600 mb-8">
        The things a traveller can add on top of the trip &mdash; airport fast-track, extra luggage, a late
        check-out, a balloon ride. You keep them in one list, <strong>Sell &rarr; Extras</strong> (admins and
        managers), and add them to a B2B quote or to a booking.
      </p>

      {/* Catalogue */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Extras List</h2>
        <p className="text-gray-600 mb-3">
          <strong>Add extra</strong> asks for:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Name</strong> and <strong>Category</strong></li>
          <li><strong>What it costs us</strong> &mdash; your supplier cost. Left blank, the extra is <em>not priced</em>, not free.</li>
          <li><strong>What we charge</strong> &mdash; optional. Set a price and that <em>is</em> what the customer pays, with no margin added. Leave it blank and the price is the cost plus your margin.</li>
          <li><strong>Per person</strong> or <strong>Per booking</strong> &mdash; a per-person extra is charged for every traveller</li>
          <li><strong>Offer this extra</strong> &mdash; switch it off to stop offering it without deleting it</li>
        </ul>
        <p className="text-gray-600">
          Amounts are in your rates currency. The list shows Name, Category, Cost, Price and Charged; search it,
          duplicate or delete a row, or import and export it as CSV like your other rates.
        </p>
        <ScreenshotPlaceholder caption="The Extras list: Name, Category, Cost, Price and Charged for each extra" />
        <Tip>
          An extra with neither a cost nor a price, or with a price but no cost, makes a quote incomplete &mdash; fill
          in the cost so the margin is right.
        </Tip>
      </section>

      {/* B2B */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">On a B2B Quote</h2>
        <p className="text-gray-600">
          In the <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B calculator</Link>, tick
          extras in the <strong>Extras</strong> list. Each shows its price (&ldquo;30 set&rdquo;, &ldquo;20 cost +
          margin&rdquo;, or &ldquo;not priced&rdquo;) and whether it is per person or per booking. The chosen extras
          appear as lines marked <strong>Extra</strong> (or <strong>Extra &middot; set price</strong>) and are included
          in the quote&apos;s price, at every group size of the rate sheet.
        </p>
      </section>

      {/* Booking */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">On a Booking</h2>
        <p className="text-gray-600 mb-3">
          A booking&apos;s <strong>Extras and upgrades</strong> panel holds everything sold on top of the trip.
          <strong> Add</strong> offers two tabs:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>From the catalogue</strong> &mdash; your extras, the <strong>Options in this programme</strong> (the optional services set on the tour in Tour Manager), and attraction extras. Each has <strong>Add</strong> and <strong>As upgrade</strong>.</li>
          <li><strong>Type it in</strong> &mdash; a one-off, as an <strong>Add-on</strong> or an <strong>Upgrade</strong></li>
        </ul>
        <p className="text-gray-600 mb-3">
          An <strong>upgrade</strong> is priced as the <strong>difference</strong> &mdash; what the traveller pays on top
          of what is already included, not the new price. Prices are in the booking&apos;s currency: a set price is
          converted from your rates currency, and a cost is marked up by your default margin.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">From Request to Sold</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Awaiting a price</strong> &mdash; a traveller asked for it; <strong>Price it</strong></li>
          <li><strong>With the customer</strong> &mdash; you offered it at a price</li>
          <li><strong>Customer accepted</strong> &mdash; they said yes</li>
          <li><strong>Sold</strong> &mdash; you clicked <strong>Confirm</strong></li>
        </ol>
        <p className="text-gray-600 mt-3">
          Only <strong>Confirm</strong> changes what is owed: the extra is added to the trip total and balance (the
          deposit stays as it was &mdash; extras settle with the balance) and to the supplier manifest. An extra can
          also be <strong>Declined</strong> or <strong>Withdrawn</strong>; a sold extra is withdrawn, not deleted.
          Confirming, and withdrawing a sold extra, are for managers and admins; members price, offer and decline.
        </p>
        <Tip>
          A confirmed extra in a different currency from the booking is not added to the trip total &mdash; the panel
          says so. Invoice it separately.
        </Tip>
      </section>

      {/* Invoices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">On Invoices and the Trip Page</h2>
        <p className="text-gray-600">
          Confirmed extras not yet invoiced are added to the next invoice as their own lines (&ldquo;(upgrade)&rdquo;
          for an upgrade) &mdash; never to a deposit invoice, and only in the invoice&apos;s currency. Once invoiced,
          an extra can no longer be changed. The client&apos;s shared trip page includes confirmed extras in its total.
        </p>
      </section>

      {/* Portal */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">In the Traveller Portal</h2>
        <p className="text-gray-600">
          Travellers see your offers under <strong>Options and upgrades</strong> and answer <strong>Yes, add it</strong> or
          <strong> No thanks</strong> &mdash; a yes is &ldquo;Customer accepted&rdquo;, and nothing is charged until you
          confirm. They can also ask for something else (<strong>Send request</strong>), which reaches you as
          &ldquo;Awaiting a price&rdquo; with a notification. Once you lock the booking&apos;s details, new requests are
          refused, but offers you already made can still be answered.
        </p>
      </section>

      <DocPager href="/docs/extras" />
    </div>
  )
}
