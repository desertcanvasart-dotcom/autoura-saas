import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'

export default function ResourcesDocumentsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Resources &amp; Documents</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Resources &amp; Documents</h1>
      <p className="text-gray-600 mb-8">
        Running a trip: who is assigned to it &mdash; guides, drivers, vehicles, hotels and more &mdash; and the vouchers and service orders that tell each supplier what to provide. Your suppliers themselves are covered in <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>.
      </p>

      {/* Assigning */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Assigning Resources to a Trip</h2>
        <p className="text-gray-600 mb-3">
          On an itinerary, open the <strong>Operations</strong> tab.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Coverage</strong> &mdash; what each day needs, from its services, and who is assigned: each cell shows the person, <em>Needed</em>, or nothing needed; the header says how many gaps are left, or <em>All covered</em></li>
          <li><strong>Resource Assignment</strong> &mdash; tabs for Guides, Vehicles, Drivers, Hotels, Restaurants, Nile Cruises, Airport Staff and Hotel Staff (<strong>More types</strong> shows the rest). Add one with its dates, a quantity (rooms or vehicles) and notes; the lists can be narrowed by city, airport or route. A driver or staff member not in your lists can be typed in for this trip.</li>
          <li><strong>Conflicts</strong> &mdash; when someone is also confirmed on another trip on the same days, a <em>Scheduling Conflicts Detected</em> banner names them and the other trip</li>
          <li>For each person assigned: <strong>Send brief</strong> (WhatsApp or email), a <strong>Staff link</strong> to copy, and <strong>Change dates</strong> or <strong>Remove</strong></li>
        </ul>
        <p className="text-gray-600">
          The <strong>Trip timeline</strong> is below. Changing or removing an assignment is for managers and admins.
        </p>
      </section>

      {/* Generating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supplier Documents</h2>
        <p className="text-gray-600 mb-3">
          On an itinerary, <strong>Supplier docs</strong> generates the paperwork for its services (the <strong>Documents</strong> menu beside it is the client&apos;s: itinerary PDF, contract and invoice). <strong>Generate All</strong>, or one kind:
        </p>
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Document</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Number</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">For</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Hotel Voucher</td><td className="px-4 py-2.5">HV-</td><td className="px-4 py-2.5">Each stay at a hotel (consecutive nights)</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Transport Voucher</td><td className="px-4 py-2.5">TV-</td><td className="px-4 py-2.5">Transfers and drives</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Guide Assignment</td><td className="px-4 py-2.5">GA-</td><td className="px-4 py-2.5">Each guide assigned, with their languages</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Service Order</td><td className="px-4 py-2.5">SO-</td><td className="px-4 py-2.5">Meals, entrance fees and activities</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Cruise Voucher</td><td className="px-4 py-2.5">CV-</td><td className="px-4 py-2.5">Each sailing</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mb-3">
          Services are grouped by their supplier; a service with none is grouped by kind and place (&ldquo;Cairo Transportation&rdquo;). Tips, water, flights and service fees go on no document. Generating again makes only what is missing, and a trip without a deliverable price cannot generate.
        </p>
      </section>

      {/* List */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Documents Hub</h2>
        <p className="text-gray-600 mb-3">
          <strong>Documents</strong> (Operate, managers and admins) opens <strong>Customer Contracts</strong> &mdash; made from an itinerary &mdash; and the supplier documents by type, or <strong>All Supplier Documents</strong>:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>Grouped by trip, with <strong>Show only these</strong> and <strong>Open itinerary &rarr;</strong></li>
          <li>Cards for Total, Draft, Sent, Confirmed and Completed; type pills; <strong>Search by document #, supplier, client&hellip;</strong> and a status filter</li>
          <li>A trip whose documents are behind its services says so: <em>&ldquo;N documents are not generated yet&rdquo;</em> (<strong>Generate missing</strong>) or <em>&ldquo;N documents no longer match the trip&rdquo;</em></li>
          <li>On each: <strong>View</strong>, <strong>Edit</strong>, and the next step &mdash; <strong>Mark as Sent</strong>, <strong>Mark as Confirmed</strong>, <strong>Mark as Completed</strong> &mdash; or <strong>Revert to Draft</strong>. <strong>Delete</strong> is for managers and admins.</li>
        </ul>
        <p className="text-gray-600 mb-3">
          A document moves Draft &rarr; Sent &rarr; Confirmed &rarr; Completed; <strong>Cancelled</strong> is set from its edit page.
        </p>
        <DocScreenshot src="/docs/resources-documents/documents.jpg" alt="Documents hub with Customer Documents and Supplier Documents link cards" />
      </section>

      {/* Sending */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending a Document</h2>
        <p className="text-gray-600 mb-3">
          Open a document for its branded preview, with <strong>Edit</strong>, <strong>Download PDF</strong>, <strong>Print</strong>, <strong>Email</strong>, <strong>WhatsApp</strong> and, once sent, <strong>Mark Confirmed</strong>:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Email</strong> sends the PDF to the supplier from your connected Gmail (Settings &rarr; Email) and marks it Sent</li>
          <li><strong>WhatsApp</strong> opens a chat with the supplier with the details as a message &mdash; attach the PDF yourself &mdash; then asks whether to mark it Sent</li>
          <li>Each appears when the document has the supplier&apos;s email or phone</li>
        </ul>
        <p className="text-gray-600">
          <strong>Edit</strong> changes the supplier and guest details, dates (check-in and check-out, or service date and pickup time), pickup and drop-off for transport, special requests, notes, cost and payment terms, and on a service order its entrance fees (<strong>Add Attraction</strong>). <strong>Save Changes</strong> keeps it.
        </p>
        <Tip>
          Vouchers, contracts, invoices, receipts and the itinerary PDF are made in your browser as you open them; quote PDFs are made on the server.
        </Tip>
      </section>

      {/* Resources page */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Resource Management Page</h2>
        <p className="text-gray-600">
          <strong>Manage Resources</strong> on Settings &rarr; Profile opens <strong>Resource Management</strong>: your guides, vehicles, hotels, restaurants, airport staff and hotel staff in tabs, with <strong>Filter by City</strong>, <strong>Show Inactive</strong> and <strong>Export</strong>. To add or change a supplier, use <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>; the content you write about them is in the <Link href="/docs/content-library" className="text-primary-600 hover:underline">Content Library</Link>.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/resources-documents" />
    </div>
  )
}
