import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/expenses-commissions')

const CATEGORIES = [
  'Tour Guide', 'Driver', 'Hotel/Accommodation', 'Nile Cruise', 'Transportation', 'Flights', 'Entrance Fees', 'Meals',
  'Activities & Tours', 'Airport Staff', 'Hotel Staff', 'Ground Handler', 'Tipping', 'Permits/Permissions', 'Toll Fees',
  'Parking', 'Fuel', 'Office Expenses', 'Marketing', 'Software/Subscriptions', 'Other',
]

export default function ExpensesCommissionsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Expenses &amp; Commissions</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Expenses &amp; Commissions</h1>
      <p className="text-gray-600 mb-8">
        What a trip costs you, and the commissions you earn or owe on it. Both feed each trip&rsquo;s{' '}
        <Link href="/docs/profit-loss" className="text-primary-600 hover:underline">Profit &amp; Loss</Link>.
      </p>

      {/* Adding an expense */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding an expense</h2>
        <p className="text-gray-600 mb-3">
          On <strong>Expenses</strong>, click <strong>Add Expense</strong> &mdash; or on a trip, <strong>Add expense</strong>,
          which links it to that trip. Then:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Category</strong> &mdash; one of {CATEGORIES.length}: {CATEGORIES.join(', ')}.</li>
          <li><strong>Supplier</strong> &mdash; for categories paid to a supplier, pick one of your suppliers that fills that role (your restaurants for a meal, your hotels for a hotel); otherwise type a name. The supplier type is set from the category.</li>
          <li><strong>Amount</strong> (above 0) and <strong>currency</strong> &mdash; every supported currency, starting from your agency&rsquo;s.</li>
          <li><strong>Expense date</strong>, <strong>description</strong> and <strong>notes</strong>.</li>
          <li><strong>Trip</strong> &mdash; optional; link it so the cost counts in that trip&rsquo;s P&amp;L.</li>
          <li><strong>Receipt link</strong> &mdash; a web link (http or https) to the receipt, e.g. in Google Drive. Receipts are not uploaded into the app.</li>
          <li><strong>Status</strong> &mdash; Pending, Approved, Paid or Rejected. Once Approved or Paid, the payment method (Cash, Bank Transfer, Credit Card, PayPal, Company Card), date and reference appear. A Paid expense with no payment date gets today&rsquo;s.</li>
        </ul>
        <p className="text-gray-600 mt-3">Click <strong>Add Expense</strong> (or <strong>Update Expense</strong> when editing).</p>
        <DocScreenshot src="/docs/expenses-commissions/expenses-list.jpg" alt="Expenses page with add expense form, filters, and expense list" />
      </section>

      {/* Managing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing expenses</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Filters</strong> &mdash; search, status, category, supplier type and a date range.</li>
          <li><strong>Views</strong> &mdash; a list, a grid, and a chart of spend per category (per currency).</li>
          <li><strong>Mark as paid</strong> &mdash; on an approved expense in the list. A pending one is approved first.</li>
          <li><strong>Export CSV</strong> &mdash; the list as it is filtered, ready for Excel (non-Latin text included).</li>
          <li><strong>The expense page</strong> &mdash; click an expense for its details, its trip, and the link to its receipt; <strong>Edit</strong> opens the form.</li>
        </ul>
      </section>

      {/* Roles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who can do what</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Members</strong> add and edit expenses (on their trips, or on the Expenses page).</li>
          <li><strong>Managers and admins</strong> approve, pay, reject and delete them, and have Commissions.</li>
          <li><strong>Viewers</strong> see neither.</li>
        </ul>
        <Tip>
          Link every trip cost to its trip: an unlinked expense is in your totals, but in no trip&rsquo;s P&amp;L.
        </Tip>
      </section>

      {/* Commissions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Commissions</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Receivable</strong> &mdash; commission paid to you, e.g. by a hotel or a shop for the guests you bring.</li>
          <li><strong>Payable</strong> &mdash; commission you owe, e.g. to an agent or a partner who sold the trip.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Generated from a trip</h3>
        <p className="text-gray-600">
          On an itinerary, <strong>Generate commissions</strong> creates them from its services and their suppliers&rsquo;
          commission settings: a supplier who pays you is a receivable on what the service costs from them; a supplier
          you pay is a payable on your profit on the service; and a service marked as sold by someone pays that seller
          their rate of your profit. A service is generated once &mdash; running it again adds nothing. Services that
          cannot be worked out (no rate, no cost, no profit) are listed with the reason.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Added by hand</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>On <strong>Commissions</strong>, click <strong>Add Commission</strong>.</li>
          <li>Choose <strong>Receivable</strong> or <strong>Payable</strong> and a category: Hotel, Shopping, Restaurant, Transport, Cruise, Attraction, Optional Tour, Activity, Show/Event, Spa/Wellness, Agent Referral, Partner or Other.</li>
          <li>Enter the base amount and rate &mdash; the amount is worked out &mdash; or the amount itself, and its currency (your agency&rsquo;s to start with).</li>
          <li>Link a supplier and a trip if you like; set the dates, the source and the status: Pending, Invoiced, Received, Paid, Cancelled or Disputed.</li>
        </ol>
        <p className="text-gray-600 mt-3">Every field can be changed with <strong>Edit</strong>.</p>
        <DocScreenshot src="/docs/expenses-commissions/commissions-list.jpg" alt="Commission Tracking page with summary cards, filters, and commission list" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tracking them</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Cards: <strong>Receivable</strong>, <strong>Payable</strong>, <strong>Pending In</strong>, <strong>Pending Out</strong>, <strong>Received</strong>, <strong>Paid Out</strong> and <strong>Net</strong>, per currency. Cancelled commissions are left out; anything not yet received or paid is pending.</li>
          <li>Filter by type, category or status; search by source, description, supplier or trip.</li>
          <li>The check mark settles a pending, invoiced or disputed commission: <strong>Mark as Received</strong> for a receivable, <strong>Mark as Paid</strong> for a payable.</li>
        </ul>
      </section>

      {/* Pointer */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Receivables, Payables &amp; Supplier Invoices</h2>
        <p className="text-gray-600">
          Aging of what clients owe and what you owe, and matching supplier bills to expenses, are in{' '}
          <Link href="/docs/invoices-payments" className="text-primary-600 underline hover:text-primary-700">Invoices &amp; Payments</Link>.
        </p>
      </section>

      {/* Reports */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reports</h2>
        <p className="text-gray-600 mb-3">
          <strong>Reports</strong> (Home, managers and admins) is the yearly financial dashboard. Pick a year, then:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Overview</strong> &mdash; headline figures and spend by category</li>
          <li><strong>Revenue</strong> &mdash; by quarter and by month</li>
          <li><strong>Cash Flow</strong> &mdash; month by month, with receivables and payables</li>
          <li><strong>Tax Summary</strong> &mdash; revenue, expenses and taxable income; VAT collected is the tax on your invoices. VAT you paid is not tracked (expenses carry no tax line), so it is shown as not available rather than estimated.</li>
          <li><strong>Commissions</strong> &mdash; by type and by recipient</li>
        </ul>
        <p className="mt-3 text-gray-600">Every table has a CSV export button.</p>
        <DocScreenshot src="/docs/profit-loss/financial-reports.jpg" alt="Reports page with Overview, Revenue, Cash Flow, Tax Summary, and Commissions tabs" />
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/expenses-commissions" />
    </div>
  )
}
