import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

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
        Track the financial health of your business with per-trip and aggregate profit &amp; loss reports. Compare expenses against client revenue and monitor your margins across all trips.
      </p>

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>Profit &amp; Loss</strong> in the sidebar. Eight summary cards sit at the top:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Trips</strong></li>
          <li><strong>Total Revenue</strong></li>
          <li><strong>Total Expenses</strong></li>
          <li><strong>Net Commission</strong> &mdash; with a sub-line splitting commission in vs. out (disputed receivable commissions are excluded)</li>
          <li><strong>Gross Profit</strong></li>
          <li><strong>Avg Margin</strong></li>
          <li><strong>Profitable</strong> &mdash; count of trips in the black</li>
          <li><strong>Loss-Making</strong> &mdash; count of trips in the red</li>
        </ul>
        <p className="mt-3 text-gray-600 mb-3">
          Below the cards, every trip is listed with its revenue, expenses, and profit/loss. A collapsible filter panel lets you set a custom <strong>start and end date</strong> and filter by trip status (Draft, Sent, Confirmed, Completed, Cancelled). You can sort by date, profit, or margin, and the list is paginated.
        </p>
        <DocScreenshot src="/docs/profit-loss/pl-overview.jpg" alt="Profit & Loss overview with eight summary cards, filters, and trip list" />
      </section>

      {/* Per-Trip P&L */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Per-Trip Breakdown</h2>
        <p className="text-gray-600 mb-3">
          Click on any trip to see its detailed P&amp;L. The page is built around a single equation &mdash; <strong>Revenue &minus; Expenses &plusmn; Commission = Profit/Loss</strong> &mdash; with one margin badge for the trip.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Revenue</strong> &mdash; What has been invoiced for the trip, with a separate figure for what has actually been paid. If nothing has been invoiced yet, the quoted amount is used instead and flagged with a <strong>Quoted amount</strong> badge.</li>
          <li><strong>Expenses</strong> &mdash; Expenses linked to the trip, with a sub-figure for pending (not yet paid) expenses.</li>
          <li><strong>Commission</strong> &mdash; Net effect of receivable and payable commissions on the trip.</li>
        </ul>
        <p className="mt-3 text-gray-600 mb-3">
          Below the equation, panels show the <strong>Expense Breakdown</strong> by category, the full <strong>Expenses</strong> list, the <strong>Invoices</strong> list, and <strong>Trip Details</strong>.
        </p>
        <DocScreenshot src="/docs/profit-loss/trip-pl.jpg" alt="Per-trip P&L page with the Revenue − Expenses ± Commission equation, margin badge, and breakdown panels" />
      </section>

      {/* Multi-currency */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Multi-Currency &amp; Data Provenance</h2>
        <p className="text-gray-600 mb-3">
          All totals are shown in a single reporting currency. When your trips involve multiple currencies, a provenance banner explains exactly how the numbers were produced and warns you about:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Amounts converted at today&apos;s rate</strong> &mdash; historic transactions converted with the current exchange rate, not the rate on the transaction date</li>
          <li><strong>Amounts excluded entirely</strong> &mdash; when no exchange rate exists for a currency, those amounts are left out, which means the margin shown is better than reality</li>
          <li><strong>Untranslated trips</strong> &mdash; trips that could not be brought into the reporting currency</li>
          <li><strong>Unavailable commissions</strong> &mdash; commissions that could not be included</li>
        </ul>
        <Tip>
          Disputed receivable commissions are deliberately excluded from margin calculations &mdash; money you may never receive should not inflate your profit.
        </Tip>
      </section>

      {/* Data Sources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where the Numbers Come From</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Revenue</strong> &mdash; From invoices created for the trip (falling back to the quoted amount when nothing is invoiced)</li>
          <li><strong>Payments Received</strong> &mdash; From the payments module (actual cash received)</li>
          <li><strong>Expenses</strong> &mdash; From expenses linked to the itinerary</li>
          <li><strong>Commissions</strong> &mdash; From the commissions module (receivable and payable)</li>
        </ul>
        <Tip>
          <strong>Accuracy Tip:</strong> For the most accurate P&amp;L, record all expenses against the correct itinerary and keep invoice amounts up to date.
        </Tip>
      </section>

      {/* Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reports</h2>
        <p className="text-gray-600 mb-3">
          In addition to the P&amp;L page, the <strong>Reports</strong> page (admin/manager only) provides aggregate views across five tabs:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Overview</strong> &mdash; including an expense breakdown by category</li>
          <li><strong>Revenue</strong> &mdash; quarterly and monthly views</li>
          <li><strong>Cash Flow</strong> &mdash; including receivable and payable figures</li>
          <li><strong>Tax Summary</strong></li>
          <li><strong>Commissions</strong></li>
        </ul>
        <p className="mt-3 text-gray-600">
          Every table offers a CSV export.
        </p>
        <DocScreenshot src="/docs/profit-loss/financial-reports.jpg" alt="Reports page with Overview, Revenue, Cash Flow, Tax Summary, and Commissions tabs" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/expenses-commissions" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Expenses &amp; Commissions
        </Link>
        <Link href="/docs/followups-reminders" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Follow-ups &amp; Reminders
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
