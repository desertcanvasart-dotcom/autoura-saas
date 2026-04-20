import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

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
        Track the financial health of your business with per-trip and aggregate profit &amp; loss reports. Compare supplier costs against client revenue and monitor your margins across all trips.
      </p>

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>Profit &amp; Loss</strong> in the sidebar. The page shows:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Summary Cards</strong> &mdash; Total revenue, total costs, total profit, and average margin</li>
          <li><strong>Trip List</strong> &mdash; Every trip with its revenue, cost, and profit/loss</li>
          <li><strong>Date Filters</strong> &mdash; Filter by month, quarter, year, or custom date range</li>
          <li><strong>Status Filters</strong> &mdash; View all trips or only confirmed/completed ones</li>
        </ul>
        <DocScreenshot src="/docs/profit-loss/pl-overview.jpg" alt="Profit & Loss overview with summary cards and trip list" />
      </section>

      {/* Per-Trip P&L */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Per-Trip Breakdown</h2>
        <p className="text-gray-600 mb-3">
          Click on any trip to see its detailed P&amp;L breakdown:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Client Revenue</strong> &mdash; Total amount invoiced to the client</li>
          <li><strong>Supplier Costs</strong> &mdash; Sum of all supplier payments and expenses linked to this trip</li>
          <li><strong>Gross Profit</strong> &mdash; Revenue minus supplier costs</li>
          <li><strong>Commissions</strong> &mdash; Any agent or partner commissions paid or received</li>
          <li><strong>Net Profit</strong> &mdash; Final profit after all costs and commissions</li>
          <li><strong>Margin %</strong> &mdash; Net profit as a percentage of revenue</li>
        </ul>
        <ScreenshotPlaceholder caption="Per-trip P&L breakdown showing revenue, costs, commissions, and net profit" />
      </section>

      {/* Data Sources */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where the Numbers Come From</h2>
        <p className="text-gray-600 mb-3">
          The P&amp;L report pulls data from across the platform:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Revenue</strong> &mdash; From invoices created for the trip</li>
          <li><strong>Payments Received</strong> &mdash; From the payments module (actual cash received)</li>
          <li><strong>Supplier Costs</strong> &mdash; From expenses linked to the itinerary</li>
          <li><strong>Commissions</strong> &mdash; From the commissions module (receivable and payable)</li>
        </ul>
        <Tip>
          <strong>Accuracy Tip:</strong> For the most accurate P&amp;L, make sure to record all expenses against the correct itinerary and keep invoice amounts up to date.
        </Tip>
      </section>

      {/* Financial Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Financial Reports</h2>
        <p className="text-gray-600 mb-3">
          In addition to the P&amp;L page, the <strong>Financial Reports</strong> section provides aggregate views:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Monthly revenue and profit trends</li>
          <li>Top-performing trips by profit margin</li>
          <li>Supplier cost analysis</li>
          <li>Outstanding receivables and payables</li>
        </ul>
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
