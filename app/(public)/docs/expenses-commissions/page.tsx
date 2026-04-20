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
              <li><strong>Category</strong> &mdash; Guide, Driver, Hotel, Transportation, Entrance Fees, Meals, Airport Staff, Permits, Fuel, Office, Marketing, Software, etc.</li>
              <li><strong>Description</strong> of the expense</li>
              <li><strong>Amount</strong> and <strong>currency</strong></li>
              <li><strong>Expense date</strong></li>
              <li><strong>Supplier name</strong> (who you paid)</li>
              <li><strong>Link to itinerary</strong> (optional &mdash; connects the expense to a specific trip for P&amp;L)</li>
              <li><strong>Receipt</strong> (upload or paste URL)</li>
              <li><strong>Status</strong> &mdash; Pending, Approved, Paid, Rejected</li>
              <li><strong>Payment method</strong> &mdash; Cash, Bank Transfer, Credit Card, Wise, PayPal, Company Card</li>
            </ul>
          </li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <DocScreenshot src="/docs/expenses-commissions/expenses-list.jpg" alt="Add expense form with category, amount, supplier, and itinerary link fields" />
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
          <li>Select the <strong>Category</strong> (Hotel, Shopping, Restaurant, Transport, Cruise, Attraction, etc.)</li>
          <li>Enter the <strong>base amount</strong> and <strong>commission rate (%)</strong></li>
          <li>The commission amount is calculated automatically</li>
          <li>Link to a supplier or itinerary</li>
          <li>Set the status (Pending, Invoiced, Received/Paid, Cancelled, Disputed)</li>
        </ol>
        <DocScreenshot src="/docs/expenses-commissions/commissions-list.jpg" alt="Add commission form with type selection, base amount, rate, and calculated commission" />

        <p className="mt-4 text-gray-600">
          The summary cards at the top show your total receivables, payables, and net commission position.
        </p>
      </section>

      {/* Financial Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Financial Reports</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Financial Reports</strong> (admin/manager only) to see:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Revenue</strong> by month, quarter, and year</li>
          <li><strong>Expenses</strong> broken down by category</li>
          <li><strong>Profit margins</strong> over time</li>
          <li><strong>Accounts Receivable</strong> &mdash; Money clients owe you</li>
          <li><strong>Accounts Payable</strong> &mdash; Money you owe suppliers</li>
          <li><strong>Profit &amp; Loss</strong> &mdash; Overall and per-itinerary breakdowns</li>
        </ul>
        <ScreenshotPlaceholder caption="Financial reports dashboard with revenue chart, expense breakdown, and P&L summary" />
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
