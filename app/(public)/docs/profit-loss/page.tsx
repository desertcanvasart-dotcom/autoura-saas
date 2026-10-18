import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/profit-loss')

export default function ProfitLossPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Profit &amp; Loss</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Profit &amp; Loss</h1>
      <p className="text-gray-600 mb-8">
        What each trip actually made: what it earns, less what it cost, plus or minus its commissions &mdash; trip by
        trip and across all of them. <strong>Profit &amp; Loss</strong> is in Finance, for managers and admins.
      </p>

      {/* What a trip earns */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a trip earns</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Its invoices</strong>, net of tax, once a standard or final invoice exists. VAT is collected for the state, not earned.</li>
          <li><strong>Its quote</strong> (plus the extras sold on the booking) while nothing is invoiced, or only deposits &mdash; a 20% deposit is not the trip&rsquo;s revenue. If the deposits come to more than the quote, the deposits. Shown with a <strong>quoted</strong> mark.</li>
          <li><strong>A cancelled trip</strong> earns only what was invoiced. With nothing invoiced it earns nothing, and any costs on it are a loss.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Cancelled invoices are left out. Drafts count &mdash; issue or cancel them to keep the figure right.
        </p>
      </section>

      {/* What it cost */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it cost, and its commissions</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Expenses</strong> linked to the trip, paid or not. Rejected expenses are left out.</li>
          <li><strong>Extras sold</strong> on the trip&rsquo;s booking: what they cost from the supplier counts as a cost.</li>
          <li><strong>Commissions</strong> on the trip: receivable ones add to profit, payable ones take from it. A disputed receivable is left out (money you may never see); a disputed payable is still counted (you will probably pay it). Cancelled commissions are left out.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Supplier invoices are not read: their cost is in the expenses they are matched to.
        </p>
      </section>

      {/* The list */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The P&amp;L page</h2>
        <p className="text-gray-600 mb-3">Eight cards at the top:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Trips</strong>, <strong>Total Revenue</strong>, <strong>Total Expenses</strong> (extras&rsquo; supplier cost included)</li>
          <li><strong>Net Commission</strong> &mdash; with the commission in and out beneath it</li>
          <li><strong>Gross Profit</strong> and <strong>Avg Margin</strong> &mdash; profit over revenue across the trips shown</li>
          <li><strong>Profitable</strong> and <strong>Loss-Making</strong> &mdash; how many trips are in the black and the red</li>
        </ul>
        <p className="mt-3 text-gray-600 mb-3">
          Below, every trip with its revenue, costs, commission, profit and margin, 15 to a page. Search; filter by trip
          status and dates &mdash; a trip is in the range when any of its days are; sort by date, profit or margin.
          Profit sorts in your agency&rsquo;s currency, so trips in different currencies compare.
        </p>
        <DocScreenshot src="/docs/profit-loss/pl-overview.jpg" alt="Profit & Loss overview with eight summary cards, filters, and trip list" />
      </section>

      {/* Per-trip */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">One trip&rsquo;s P&amp;L</h2>
        <p className="text-gray-600 mb-3">
          Click a trip. The page is one equation &mdash; <strong>Revenue &minus; Expenses &plusmn; Commission = Profit</strong>{' '}
          &mdash; and its margin.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Revenue</strong> &mdash; as above, marked when it is the quote; what has been paid beneath it.</li>
          <li><strong>Expenses</strong> &mdash; with what is still pending, and the extras&rsquo; supplier cost when there is one.</li>
          <li><strong>Commission</strong> &mdash; the net, with in and out beneath it.</li>
        </ul>
        <p className="mt-3 text-gray-600">
          Below it: spend by category, the trip&rsquo;s expenses and invoices (each in its own currency), and the trip&rsquo;s details.
        </p>
        <DocScreenshot src="/docs/profit-loss/trip-pl.jpg" alt="Per-trip P&L page with the Revenue − Expenses ± Commission equation, margin badge, and breakdown panels" />
      </section>

      {/* Currency */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Currencies</h2>
        <p className="text-gray-600 mb-3">
          Each trip is worked out in its own currency: an expense, invoice or commission in another currency is converted
          at the rate on its date (the payment date when paid). The cards convert every trip into{' '}
          <strong>your agency&rsquo;s currency</strong>, at the rate on the trip&rsquo;s start date. A banner says when the figures are
          not exact:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Converted at today&rsquo;s rate</strong> &mdash; no rate was on file for the date</li>
          <li><strong>Left out</strong> &mdash; no rate at all for that currency, so the margin shown is better than reality; the trip is marked</li>
          <li><strong>Trips not converted</strong> &mdash; left out of the cards</li>
          <li><strong>Commissions unavailable</strong> &mdash; they could not be read</li>
        </ul>
        <Tip>
          If invoices or expenses cannot be read, the report says so and shows nothing, rather than figures without them.
        </Tip>
      </section>

      {/* Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reports</h2>
        <p className="text-gray-600">
          The yearly financial dashboard &mdash; Overview, Revenue, Cash Flow, Tax Summary and Commissions, each with CSV
          export &mdash; is <strong>Reports</strong>, described in{' '}
          <Link href="/docs/expenses-commissions" className="text-primary-600 hover:underline">Expenses &amp; Commissions</Link>.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/profit-loss" />
    </div>
  )
}
