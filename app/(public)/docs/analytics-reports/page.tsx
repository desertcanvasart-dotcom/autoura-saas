import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function AnalyticsReportsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Analytics &amp; Reports</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Analytics &amp; Reports</h1>
      <p className="text-gray-600 mb-8">
        Two surfaces cover your numbers: <strong>Analytics</strong> for business performance at a glance (visible to everyone), and <strong>Reports</strong> for detailed financial reporting (admins and managers). Both consolidate revenue into a single reporting currency.
      </p>

      {/* Analytics */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Analytics</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Analytics</strong> in the sidebar (Main group) and pick a time range: Last 7, 30, or 90 Days, or Last Year. Key things to know about the numbers:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>One Reporting Currency</strong> &mdash; Revenue is converted using historical exchange rates. An amber provenance banner explains any trips converted at today&rsquo;s rate or excluded because a rate was missing</li>
          <li><strong>Booked Revenue</strong> &mdash; Only confirmed and completed trips count</li>
        </ul>
        <ScreenshotPlaceholder caption="Analytics page top: time range selector, amber FX provenance banner, and the four KPI cards (Total Revenue, Total Bookings, Total Clients, Conversion Rate) with sparklines" />
      </section>

      {/* KPI + panels */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What&rsquo;s on the Analytics Page</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>KPI Cards with Sparklines</strong> &mdash; Total Revenue (with growth vs the previous period), Total Bookings (confirmed/pending split), Total Clients, and Conversion Rate</li>
          <li><strong>Revenue Forecast</strong> &mdash; A next-period projection with a confidence percentage and trend, computed by a regression over your weekly revenue</li>
          <li><strong>Booking Pipeline</strong> &mdash; Where your bookings sit right now</li>
          <li><strong>Highlights This Month</strong> &mdash; New clients, pending bookings, average deal size, top destination, and best channel</li>
          <li><strong>Revenue Trend &amp; Forecast</strong> &mdash; Revenue over time with the projection</li>
          <li><strong>Top Destinations</strong> &mdash; With a dropdown filter</li>
          <li><strong>Booking Status and Revenue by Destination</strong> &mdash; Distribution panels</li>
          <li><strong>Quick Actions</strong> &mdash; A grid of shortcuts to common tasks</li>
        </ul>
        <ScreenshotPlaceholder caption="Analytics page scrolled to show the Revenue Forecast card with confidence %, Booking Pipeline, Highlights This Month, Revenue Trend & Forecast chart, and Top Destinations panel" />
      </section>

      {/* Financial Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Financial Reports</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Reports</strong> in the sidebar (Reports group; admins and managers only). The page is headed <strong>Financial Reports</strong>, with a year selector and five tabs:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Overview</strong> &mdash; Summary cards including profit margin, collection rate, and average trip value, plus Quarterly Performance and Monthly Revenue vs Expenses</li>
          <li><strong>Revenue</strong> &mdash; A monthly revenue table</li>
          <li><strong>Cash Flow</strong> &mdash; Inflows, Outflows, Net, Pending Receivables, Pending Payables, and Projected Cash, with a monthly table</li>
          <li><strong>Tax Summary</strong> &mdash; Taxable income, a VAT summary estimated at 14%, and an expense breakdown by category</li>
          <li><strong>Commissions</strong> &mdash; Totals, breakdown by type, and a per-recipient table</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Every table exports to CSV, and the same FX provenance banner from Analytics appears here so you always know how currencies were converted.
        </p>
        <ScreenshotPlaceholder caption="Financial Reports page with year selector, the five tabs (Overview, Revenue, Cash Flow, Tax Summary, Commissions), Overview tab active showing summary cards and Quarterly Performance" />
        <ScreenshotPlaceholder caption="Financial Reports Cash Flow tab showing Inflows, Outflows, Net, Pending Receivables, Pending Payables, Projected Cash, and the monthly table with its CSV export" />
        <Tip>
          <strong>Looking for per-trip numbers?</strong> The <Link href="/docs/profit-loss" className="text-primary-600 hover:underline">Profit &amp; Loss</Link> page breaks down revenue, supplier costs, commissions, and margin for each individual trip. Keep <Link href="/docs/expenses-commissions" className="text-primary-600 hover:underline">Expenses &amp; Commissions</Link> up to date so the reports here stay accurate.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
      </div>
    </div>
  )
}
