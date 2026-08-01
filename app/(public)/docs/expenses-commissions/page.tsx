import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function ExpensesCommissionsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Expenses &amp; Commissions</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Expenses &amp; Commissions</h1>

      {/* Expenses */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding an Expense</h2>
        <p className="text-gray-600 mb-3">Track every cost associated with running trips.</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Expenses</strong> in the sidebar</li>
          <li>Click <strong>Add Expense</strong></li>
          <li>Fill in:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Category</strong> &mdash; one of 18: Tour Guide, Driver, Hotel/Accommodation, Transportation, Entrance Fees, Meals, Airport Staff, Hotel Staff, Ground Handler, Tipping, Permits/Permissions, Toll Fees, Parking, Fuel, Office Expenses, Marketing, Software/Subscriptions, or Other</li>
              <li><strong>Description</strong> of the expense</li>
              <li><strong>Amount</strong> and <strong>currency</strong></li>
              <li><strong>Expense date</strong></li>
              <li><strong>Supplier name</strong> (who you paid) and <strong>Supplier Type</strong> &mdash; Tour Guide, Driver, Hotel, Restaurant, Transport Company, Airport Staff, Hotel Staff, Ground Handler, Government/Authority, or Other</li>
              <li><strong>Link to itinerary</strong> (optional &mdash; connects the expense to a specific trip for P&amp;L)</li>
              <li><strong>Receipt</strong> (upload or paste URL)</li>
              <li><strong>Status</strong> &mdash; Pending, Approved, Paid, Rejected</li>
              <li><strong>Payment method</strong> &mdash; Cash, Bank Transfer, Credit Card, Wise, PayPal, Company Card</li>
            </ul>
          </li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <DocScreenshot src="/docs/expenses-commissions/expenses-list.jpg" alt="Expenses page with add expense form, filters, and expense list" />
      </section>

      {/* Managing Expenses */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Expenses</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Filters</strong> &mdash; Search, plus filters by status, category, supplier type, and date range</li>
          <li><strong>Category breakdown</strong> &mdash; A panel showing spend per category, alongside status summary tiles</li>
          <li><strong>CSV export</strong> &mdash; Export the expense list for your accountant</li>
          <li><strong>Quick mark-as-paid</strong> &mdash; Mark an expense as paid directly from the list</li>
          <li><strong>Expense detail page</strong> &mdash; Click an expense to open its detail page with a built-in receipt viewer</li>
        </ul>
      </section>

      {/* Why Link */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Why Link Expenses to Itineraries?</h2>
        <p className="text-gray-600">
          When you link an expense to an itinerary, it appears in that itinerary&apos;s <strong>Profit &amp; Loss</strong> section. This lets you see the true profit for each trip by comparing revenue (what the client pays) to costs (what you pay suppliers).
        </p>
        <Tip>
          Always link trip-related expenses to the relevant itinerary for accurate profit tracking.
        </Tip>
      </section>

      {/* Commissions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Commissions</h2>
        <p className="text-gray-600 mb-3">
          Track money earned from partners and money owed to suppliers.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-5 mb-3">Commission Types</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Receivable</strong> &mdash; Commissions you earn FROM partners (e.g., a hotel pays you a commission for bookings)</li>
          <li><strong>Payable</strong> &mdash; Commissions you owe TO suppliers or agents</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding a Commission</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Commissions</strong> in the sidebar</li>
          <li>Click <strong>Add Commission</strong></li>
          <li>Choose <strong>Receivable</strong> or <strong>Payable</strong></li>
          <li>Select the <strong>Category</strong> (Hotel, Shopping, Restaurant, Transport, Cruise, Attraction, and more)</li>
          <li>Enter the <strong>base amount</strong> and <strong>commission rate (%)</strong></li>
          <li>The commission amount is calculated automatically</li>
          <li>Link to a supplier or itinerary</li>
          <li>Set the status &mdash; Pending, Invoiced, Received, Paid, Cancelled, or Disputed</li>
        </ol>
        <DocScreenshot src="/docs/expenses-commissions/commissions-list.jpg" alt="Commission Tracking page with summary cards, filters, and commission list" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tracking Commissions</h3>
        <p className="text-gray-600 mb-3">
          Summary cards at the top show <strong>Receivable</strong>, <strong>Payable</strong>, <strong>Pending In</strong>, <strong>Pending Out</strong>, <strong>Received</strong>, <strong>Paid Out</strong>, and <strong>Net</strong> totals. Filter the list by type, category, or status (the status filter offers Pending, Invoiced, Received, Paid, and Cancelled).
        </p>
        <p className="text-gray-600">
          When a commission settles, use the one-click <strong>Mark as Received</strong> (receivables) or <strong>Mark as Paid</strong> (payables) action right from the list.
        </p>
      </section>

      {/* AR/AP pointer */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Receivables, Payables &amp; Supplier Invoices</h2>
        <p className="text-gray-600">
          For day-to-day accounts receivable and payable work &mdash; aging reports, payment reminders, and supplier invoice matching &mdash; use the <strong>Receivables</strong>, <strong>Payables</strong>, and <strong>Supplier Invoices</strong> pages in the Finance section. They are covered in <Link href="/docs/invoices-payments" className="text-primary-600 underline hover:text-primary-700">Invoices &amp; Payments</Link>.
        </p>
      </section>

      {/* Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reports</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Reports</strong> in the sidebar (admin/manager only) for the financial reports dashboard. Pick a year from the period dropdown, then work through five tabs:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Overview</strong> &mdash; Headline figures and an expense breakdown by category</li>
          <li><strong>Revenue</strong> &mdash; Quarterly and monthly revenue views</li>
          <li><strong>Cash Flow</strong> &mdash; Monthly cash flow, including accounts receivable and accounts payable figures</li>
          <li><strong>Tax Summary</strong> &mdash; Estimated VAT/tax summary (14%)</li>
          <li><strong>Commissions</strong> &mdash; Commissions by type and by recipient</li>
        </ul>
        <p className="mt-3 text-gray-600">
          Every table has a CSV export button.
        </p>
        <DocScreenshot src="/docs/profit-loss/financial-reports.jpg" alt="Reports page with Overview, Revenue, Cash Flow, Tax Summary, and Commissions tabs" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/invoices-payments"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Invoices &amp; Payments
        </Link>
        <Link
          href="/docs/profit-loss"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Profit &amp; Loss
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
