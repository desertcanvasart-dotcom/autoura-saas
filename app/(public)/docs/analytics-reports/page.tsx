import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { DocScreenshot, Tip } from '../layout'
import { DocPager } from '../pager'

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
          Open <strong>Analytics</strong> in the sidebar (Home group) and pick a time range: Last 7, 30, or 90 Days, or Last Year. Key things to know about the numbers:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>One Reporting Currency</strong> &mdash; Revenue is converted using historical exchange rates. An amber provenance banner explains any trips converted at today&rsquo;s rate or excluded because a rate was missing</li>
          <li><strong>Booked Revenue</strong> &mdash; only confirmed and completed trips count, at what each trip&rsquo;s itinerary shows (its services&rsquo; client total)</li>
          <li><strong>Which trips</strong> &mdash; trips <em>created</em> in the range are counted, not trips travelling in it. Growth compares with the same length of time just before.</li>
          <li><strong>Who sees it</strong> &mdash; every role, viewers included</li>
        </ul>
        <DocScreenshot src="/docs/analytics-reports/analytics-overview.jpg" alt="Analytics page top: time range selector and the four KPI cards (Total Revenue, Total Bookings, Total Clients, Conversion Rate) with sparklines" />
      </section>

      {/* KPI + panels */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What&rsquo;s on the Analytics Page</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>KPI cards</strong> &mdash; Total Revenue (with growth); Total Bookings (confirmed, sent and awaiting the client, cancelled and completed &mdash; drafts are not bookings); <strong>New Clients</strong> (clients added in the range, split into leads and customers); and Conversion Rate (trips confirmed or completed, out of every trip started, drafts included)</li>
          <li><strong>Revenue Forecast</strong> &mdash; a projection with a confidence percentage and trend, from a regression over every week of the range (a week with no bookings counts as 0)</li>
          <li><strong>Booking Pipeline</strong> &mdash; your leads (all time) and open follow-ups, then the range&rsquo;s trips by stage: pending, cancelled, confirmed, completed</li>
          <li><strong>Highlights</strong> &mdash; for the selected range: new leads, quotes pending, average deal size, top destination and open follow-ups</li>
          <li><strong>Revenue Trend &amp; Forecast</strong> &mdash; revenue week by week (weeks start on Monday, UTC), with the projection</li>
          <li><strong>Top Destinations</strong> &mdash; with a dropdown filter</li>
          <li><strong>Booking Status</strong> and <strong>Revenue by Destination</strong></li>
          <li><strong>Quick Actions</strong> &mdash; shortcuts to common pages</li>
        </ul>
        <p className="text-gray-600 mt-3">
          If Analytics cannot load, it says so instead of showing zeros; if only some figures fail, a banner names them.
        </p>
        <DocScreenshot src="/docs/analytics-reports/analytics-forecast.jpg" alt="Analytics page scrolled to the Revenue Forecast card with confidence %, Booking Pipeline, Highlights This Month, and the Revenue Trend & Forecast chart" />
      </section>

      {/* Financial Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Financial Reports</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Reports</strong> in the sidebar (Home group; admins and managers only). The page is headed <strong>Financial Reports</strong>, with a year selector and five tabs:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Overview</strong> &mdash; Summary cards including profit margin, collection rate, and average trip value, plus Quarterly Performance and Monthly Revenue vs Expenses</li>
          <li><strong>Revenue</strong> &mdash; A monthly revenue table</li>
          <li><strong>Cash Flow</strong> &mdash; Inflows, Outflows, Net, Pending Receivables, Pending Payables, and Projected Cash, with a monthly table</li>
          <li><strong>Tax Summary</strong> &mdash; Taxable income, VAT collected (the tax on your invoices) and an expense breakdown by category. VAT you paid is not tracked, so it is shown as not tracked rather than estimated</li>
          <li><strong>Commissions</strong> &mdash; Totals, breakdown by type, and a per-recipient table</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Every table exports to CSV, and the same FX provenance banner from Analytics appears here so you always know how currencies were converted.
        </p>
        <DocScreenshot src="/docs/analytics-reports/financial-reports-overview.jpg" alt="Financial Reports page with year selector and the five tabs, Overview tab active showing summary cards and Quarterly Performance" />
        <DocScreenshot src="/docs/analytics-reports/financial-reports-cashflow.jpg" alt="Financial Reports Cash Flow tab showing Inflows, Outflows, Net, Pending Receivables, Pending Payables, Projected Cash, and the monthly table" />
        <Tip>
          <strong>Looking for per-trip numbers?</strong> The <Link href="/docs/profit-loss" className="text-primary-600 hover:underline">Profit &amp; Loss</Link> page breaks down revenue, supplier costs, commissions, and margin for each individual trip. Keep <Link href="/docs/expenses-commissions" className="text-primary-600 hover:underline">Expenses &amp; Commissions</Link> up to date so the reports here stay accurate.
        </Tip>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/analytics-reports" />
    </div>
  )
}
