import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function InvoicesPaymentsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Invoices &amp; Payments</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Invoices &amp; Payments</h1>

      {/* Viewing Invoices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Invoices</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Invoices</strong> in the sidebar. Summary cards at the top show Paid and Overdue totals plus deposit and final invoice counts. Filter by status: Draft, Sent, Partial, Paid, Overdue, or Cancelled. (Invoices also show a &ldquo;Viewed&rdquo; status once the client has opened them, though it is not a filter option.)
        </p>
        <p className="text-gray-600">
          Each invoice shows: invoice number, client name, type, issue date, due date, amount, amount paid, balance due, and status.
        </p>
        <DocScreenshot src="/docs/invoices-payments/invoices-list.jpg" alt="Invoices list page with summary cards, status filters, and invoice table" />
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating an Invoice</h2>
        <p className="text-gray-600 mb-3">The easiest way to create an invoice is from an itinerary:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the itinerary</li>
          <li>Click the invoice icon button (the tooltip reads <strong>Generate Invoice</strong>, or <strong>View</strong> plus the invoice number if one already exists)</li>
          <li>The invoice is created with all line items from the itinerary</li>
        </ol>
        <Tip>
          You can also create invoices manually from the Invoices page by clicking <strong>New Invoice</strong>.
        </Tip>
      </section>

      {/* Invoice Types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Types</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Standard</strong> &mdash; Full amount invoice</li>
          <li><strong>Deposit</strong> &mdash; Partial payment (typically 30%)</li>
          <li><strong>Final</strong> &mdash; Remaining balance after deposit</li>
        </ul>
        <p className="mt-3 text-gray-600">
          Deposit and final invoices are cross-linked: each one shows a banner linking to its counterpart.
        </p>
      </section>

      {/* Invoice Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Detail Page</h2>
        <p className="text-gray-600 mb-3">The detail page shows:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Invoice number and status</li>
          <li>Client information</li>
          <li>Line items with quantities, prices, and totals</li>
          <li>Tax calculation (if applicable)</li>
          <li>Discount (if applicable)</li>
          <li><strong>Amount Paid</strong> and <strong>Balance Due</strong> figures</li>
          <li>Payment history with dates, amounts, and methods &mdash; each completed payment offers a receipt download</li>
          <li>A read-only <strong>Reminder History</strong> linking to the Payment Reminders page (see <Link href="/docs/followups-reminders" className="text-primary-600 underline hover:text-primary-700">Follow-ups &amp; Reminders</Link>)</li>
        </ul>
        <ScreenshotPlaceholder caption="Invoice detail page with line items, Amount Paid / Balance Due, payment history, and Reminder History" />
      </section>

      {/* Invoice Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Actions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What It Does</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Send via WhatsApp</td><td className="px-4 py-2.5">Sends the invoice on WhatsApp</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Download PDF</td><td className="px-4 py-2.5">Creates a professional invoice PDF</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Mark as Sent</td><td className="px-4 py-2.5">Moves a draft invoice to Sent status (drafts only)</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Create Final Invoice</td><td className="px-4 py-2.5">Creates the final balance invoice from a deposit invoice</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Record Payment</td><td className="px-4 py-2.5">Record a payment received against the invoice</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Recording Payment */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording a Payment</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the invoice</li>
          <li>Click <strong>Record Payment</strong></li>
          <li>Enter:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li>Amount</li>
              <li>Payment date</li>
              <li>Payment method (Bank Transfer, Airwallex, Tab, Credit Card, Cash, PayPal, Stripe, Wise)</li>
              <li>Transaction reference (optional)</li>
              <li>Notes (optional)</li>
            </ul>
          </li>
          <li>Click <strong>Record Payment</strong> to save</li>
        </ol>
        <Tip>
          The invoice status updates automatically based on payments received. Partial payments change the status to &ldquo;Partial&rdquo;, full payment changes it to &ldquo;Paid&rdquo;.
        </Tip>
        <ScreenshotPlaceholder caption="Record Payment dialog with amount, date, method, and reference fields" />
      </section>

      {/* Payments Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Tracking</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Payments</strong> in the sidebar to open the <strong>Payment Tracking</strong> page &mdash; a unified list of both invoice payments and itinerary payments. You can:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Search payments</li>
          <li>Filter by <strong>Source</strong> (Invoice Payments or Itinerary Payments)</li>
          <li>Filter by <strong>Payment Method</strong></li>
          <li>Create a new standalone payment</li>
          <li>Jump to the linked invoice or itinerary</li>
        </ul>
        <DocScreenshot src="/docs/invoices-payments/payments-list.jpg" alt="Payment Tracking page with unified invoice and itinerary payments, source and method filters" />
      </section>

      {/* Receipts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Receipts</h2>
        <p className="text-gray-600 mb-3">
          The <strong>Receipts</strong> page lists a receipt for every completed payment, with totals cards, search, and a download for each receipt. You can also download a receipt for an individual payment directly from the invoice detail page.
        </p>
        <DocScreenshot src="/docs/invoices-payments/receipts.jpg" alt="Receipts page with totals cards, search, and per-payment receipt downloads" />
      </section>

      {/* Receivables */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Receivables</h2>
        <p className="text-gray-600 mb-3">
          <strong>Receivables</strong> is an accounts receivable aging report of what clients owe you, bucketed into <strong>Current</strong>, <strong>1-30 Days</strong>, <strong>31-60 Days</strong>, and <strong>90+ Days</strong>. Filter by aging bucket, and use the <strong>Send Reminder</strong> action to email a payment reminder for an outstanding invoice.
        </p>
        <DocScreenshot src="/docs/invoices-payments/accounts-receivable.jpg" alt="Accounts Receivable aging report with Current, 1-30, 31-60, and 90+ day buckets" />
      </section>

      {/* Payables */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payables</h2>
        <p className="text-gray-600 mb-3">
          <strong>Payables</strong> is the mirror view: an accounts payable aging report of what you owe suppliers, with filters by supplier type and status.
        </p>
        <DocScreenshot src="/docs/invoices-payments/accounts-payable.jpg" alt="Accounts Payable aging report with supplier type and status filters" />
      </section>

      {/* Supplier Invoices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supplier Invoices</h2>
        <p className="text-gray-600 mb-3">
          On the <strong>Supplier Invoices</strong> page, upload a PDF or image of a supplier&apos;s invoice and the details are auto-extracted with AI. Each supplier invoice moves through a status workflow &mdash; received, matched, approved, paid, disputed, or cancelled &mdash; and carries a match status against your records: unmatched, partial, matched, or discrepancy.
        </p>
        <DocScreenshot src="/docs/invoices-payments/supplier-invoices.jpg" alt="Supplier Invoices page with upload, AI auto-extraction, status workflow, and match states" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/bookings"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Bookings
        </Link>
        <Link
          href="/docs/expenses-commissions"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Expenses &amp; Commissions
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
