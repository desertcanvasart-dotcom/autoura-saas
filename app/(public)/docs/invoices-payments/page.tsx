import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/invoices-payments')

const ACTIONS: Array<[string, string]> = [
  ['Send via WhatsApp', 'Sends the invoice to the client on WhatsApp. A draft becomes Sent.'],
  ['Download PDF', 'The invoice as a PDF, with your branding.'],
  ['Mark as Sent', 'A draft becomes Sent (an invoice with payments keeps the status they give it).'],
  ['Record Payment', 'Money received against the invoice. Not offered on a draft or a cancelled invoice.'],
  ['Create Final Invoice', 'On a deposit invoice that is paid, and only once: the final invoice for the rest.'],
]

export default function InvoicesPaymentsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Invoices &amp; Payments</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Invoices &amp; Payments</h1>
      <p className="text-gray-600 mb-8">
        The money in &mdash; invoices, payments, receipts, what clients owe &mdash; and the money out to suppliers:
        their invoices and what you owe them. Finance is in the sidebar for managers and admins. Members open an
        invoice or a payment from their own trips, and can create and send invoices and record payments; deleting
        any of them is for managers and admins. Viewers see none of it.
      </p>

      {/* Invoices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The invoice list</h2>
        <p className="text-gray-600 mb-3">
          Seven cards at the top: <strong>Total</strong> invoices, <strong>Deposits</strong>, <strong>Finals</strong>,{' '}
          <strong>Billed</strong>, <strong>Paid</strong>, <strong>Outstanding</strong> and <strong>Overdue</strong>. Money is
          shown per currency, never added across currencies. Billed and Outstanding count what was sent: drafts and
          cancelled invoices are left out.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Columns: invoice number, type, client, issue date, due date, total, balance and status.</li>
          <li>Filter by <strong>type</strong> (Standard, Deposit, Final) and by <strong>status</strong>: Draft, Sent, Part paid, Paid, Overdue, Cancelled.</li>
          <li><strong>Overdue</strong> is worked out from the due date: a sent invoice with a balance after its due date. A draft is never overdue.</li>
          <li>Search by invoice number, client name or email.</li>
        </ul>
        <DocScreenshot src="/docs/invoices-payments/invoices-list.jpg" alt="Invoices list page with summary cards, status filters, and invoice table" />
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating an invoice</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>From a trip</strong> &mdash; on the itinerary, <strong>Documents &rarr; Create invoice</strong>. It makes one
            line for the whole trip total, in the trip&rsquo;s currency. The trip&rsquo;s client is used, found by email or
            name &mdash; and added as a client if there is none. Once it exists, the same menu opens it.
          </li>
          <li>
            <strong>On the Invoices page</strong> &mdash; <strong>New Invoice</strong>: pick the client, link a trip if you like,
            add the lines, tax and discount. The currency starts as your agency&rsquo;s. A total of 0 or less is refused.
          </li>
        </ul>
        <p className="text-gray-600 mt-3">A new invoice is a <strong>Draft</strong> until it is sent.</p>
      </section>

      {/* Types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Standard, deposit and final</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Standard</strong> &mdash; the whole amount.</li>
          <li><strong>Deposit</strong> &mdash; a share of the trip. The percentage starts from your deposit rule in <strong>Settings &rarr; Payment terms</strong>, and can be changed on the invoice.</li>
          <li><strong>Final</strong> &mdash; the rest, created from the deposit invoice once the deposit is paid.</li>
        </ul>
        <p className="mt-3 text-gray-600">A deposit and its final invoice show a banner linking each to the other.</p>
      </section>

      {/* Statuses */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Statuses</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Draft</strong>, <strong>Sent</strong> and <strong>Cancelled</strong> are set by you.</li>
          <li><strong>Part paid</strong> and <strong>Paid</strong> follow the payments: record one and the status moves; delete one and it moves back.</li>
          <li>An invoice with payments cannot be cancelled &mdash; delete the payments first.</li>
        </ul>
      </section>

      {/* Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The invoice page</h2>
        <p className="text-gray-600 mb-3">
          The client, the lines, tax and discount, <strong>Amount Paid</strong> and <strong>Balance Due</strong>, the payments
          with their dates and methods &mdash; each with a receipt download and, for managers, Delete &mdash; and the{' '}
          <strong>Reminder History</strong> (see <Link href="/docs/followups-reminders" className="text-primary-600 underline hover:text-primary-700">Follow-ups &amp; Reminders</Link>).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What it does</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {ACTIONS.map(([a, d], i) => (
                <tr key={a} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">{a}</td>
                  <td className="px-4 py-2.5">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ScreenshotPlaceholder caption="Invoice page with lines, Amount Paid / Balance Due, payments and Reminder History" />
      </section>

      {/* Recording a payment */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording a payment</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>On the invoice, click <strong>Record Payment</strong>.</li>
          <li>Enter the amount, the date, the method (Bank Transfer, Tab, Credit Card, Cash, PayPal, Stripe or Other), and a reference or notes if you like.</li>
          <li>Click <strong>Record Payment</strong>.</li>
        </ol>
        <Tip>
          A payment is in the invoice&rsquo;s currency, and cannot be more than the balance due.
        </Tip>
      </section>

      {/* Payments */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payments</h2>
        <p className="text-gray-600 mb-3">
          <strong>Payments</strong> lists every payment in one place: those recorded on invoices and those recorded on
          trips. Each row shows the date, where it came from, the invoice or trip, the client, the amount, the method
          and the reference, and opens the invoice or the trip.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Filter by source (invoice or trip payments) and by method; search.</li>
          <li><strong>Total Received</strong> and <strong>This Month</strong> count completed payments only &mdash; not pending, failed or refunded ones.</li>
          <li><strong>New Payment</strong> records a payment against an invoice or a trip (one or the other is needed).</li>
        </ul>
        <DocScreenshot src="/docs/invoices-payments/payments-list.jpg" alt="Payment Tracking page with unified invoice and itinerary payments, source and method filters" />
      </section>

      {/* Receipts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Receipts</h2>
        <p className="text-gray-600 mb-3">
          <strong>Receipts</strong> lists a receipt for every invoice payment and every completed trip payment, with{' '}
          <strong>Total Receipts</strong>, <strong>Total Received</strong> and <strong>Received This Month</strong>. Download a
          receipt, or send it on WhatsApp when the client has a phone number. A receipt can also be downloaded from
          the invoice page.
        </p>
        <DocScreenshot src="/docs/invoices-payments/receipts.jpg" alt="Receipts page with totals cards, search, and per-payment receipt downloads" />
      </section>

      {/* Receivables */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Receivables</h2>
        <p className="text-gray-600 mb-3">
          What clients owe: every sent invoice with a balance, grouped <strong>By Client</strong> or listed{' '}
          <strong>By Invoice</strong>. Drafts are not owed yet and are left out.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Aged by days past the due date: <strong>Current</strong> (not due), <strong>1-30 Days</strong>, <strong>31-60 Days</strong> and <strong>Over 60 Days</strong>. An invoice with no due date is current.</li>
          <li>Filter by aging, search, and open a client to see their invoices.</li>
          <li><strong>Send Reminder</strong> opens a reminder email in your own mail program (the app&rsquo;s own reminders are on the Payment Reminders page).</li>
        </ul>
        <DocScreenshot src="/docs/invoices-payments/accounts-receivable.jpg" alt="Accounts Receivable aging report with aging buckets" />
      </section>

      {/* Payables */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payables</h2>
        <p className="text-gray-600 mb-3">
          What you owe suppliers, read from your <Link href="/docs/expenses-commissions" className="text-primary-600 hover:underline">expenses</Link>{' '}
          that are pending or approved. A supplier invoice that no expense is linked to does not appear here &mdash; see
          the next section.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            An expense is due on its linked supplier invoice&rsquo;s due date, or 14 days after the expense date when it
            has none. Aging counts days past that: <strong>Not due yet</strong>, <strong>1-30</strong>, <strong>31-60</strong> and{' '}
            <strong>60+ days overdue</strong>.
          </li>
          <li>Three views: <strong>By Supplier</strong>, <strong>By Expense</strong> and <strong>Payment History</strong> (the last 50 paid expenses).</li>
          <li>Filter by aging, supplier type and status (Pending Approval, Approved); search suppliers or expenses.</li>
          <li><strong>Approve</strong> a pending expense, then <strong>Mark as Paid</strong>. Marking an expense paid here does not mark its supplier invoice paid &mdash; pay the supplier invoice on its own page, which pays its expenses too.</li>
        </ul>
        <DocScreenshot src="/docs/invoices-payments/accounts-payable.jpg" alt="Accounts Payable aging report with supplier type and status filters" />
      </section>

      {/* Supplier invoices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supplier invoices</h2>
        <p className="text-gray-600 mb-3">
          The bills your suppliers send you, matched against your expenses, approved and paid.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-2">Adding one</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>New Invoice</strong>, then either type the details or upload the bill (PDF, PNG, JPG, WebP or GIF, up to
            20&nbsp;MB) and AI fills in the supplier, number, dates, amount, tax and currency. Review them, then{' '}
            <strong>Create</strong>; the uploaded document is attached to the new invoice.
          </li>
          <li>A currency the AI cannot read is left for you to pick &mdash; it is never guessed. The form starts in your agency&rsquo;s currency.</li>
          <li>The amount must be above 0; dates are checked.</li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-2">Matching, approving, paying</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>
            <strong>Link expenses</strong> &mdash; the expenses this bill covers. Only pending or approved expenses in the
            bill&rsquo;s currency, and each expense on one bill only. When they add up to the bill (to the cent), it is{' '}
            <strong>Matched</strong>; otherwise the match is <strong>Partial</strong> or a <strong>Discrepancy</strong>.
          </li>
          <li><strong>Approve</strong> &mdash; a matched bill, or a partial or mismatched one after you confirm. A bill with nothing linked cannot be approved.</li>
          <li><strong>Mark paid</strong> &mdash; an approved bill, with an optional reference. Its linked expenses are marked paid with it; if they cannot be, the page says so.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          Linking and unlinking are open while the bill is received or matched. <strong>Dispute</strong> a bill that is not
          yet paid; a disputed bill can be <strong>resolved</strong> (back to received) or <strong>cancelled</strong>. Any bill not
          yet paid can be cancelled.
        </p>
        <Tip>The cards count every bill, with the total per currency.</Tip>
        <DocScreenshot src="/docs/invoices-payments/supplier-invoices.jpg" alt="Supplier Invoices page with upload, AI extraction, statuses and match states" />
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/invoices-payments" />
    </div>
  )
}
