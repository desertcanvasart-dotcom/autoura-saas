import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function SuppliersPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Suppliers</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Suppliers</h1>
      <p className="text-gray-600 mb-8">
        The Suppliers page is your central directory of every company and individual you work with &mdash; hotels, transport companies, guides, cruises, restaurants, and more. You&rsquo;ll find it in the sidebar under <strong>Operations</strong>; it&rsquo;s available to admin and manager roles.
      </p>

      {/* Supplier Types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supplier Types</h2>
        <p className="text-gray-600 mb-3">
          Every supplier belongs to one of 12 types:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {['Hotel', 'Transport Company', 'Driver', 'Guide', 'Cruise', 'Train Operator', 'Activity Provider', 'Attraction', 'Tour Operator', 'Ground Handler', 'Restaurant', 'Shop', 'Other'].map((type) => (
            <div key={type} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 text-center">{type}</div>
          ))}
        </div>
        <p className="text-gray-600 mb-3">
          Each supplier also carries a status &mdash; <strong>active</strong>, <strong>inactive</strong>, or <strong>pending</strong> &mdash; so you can keep old contacts on record without them cluttering your working list.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Parent companies and properties</h3>
        <p className="text-gray-600">
          Hotels, restaurants, and cruises are hierarchical: a parent company can own child properties. For example, a hotel chain is stored once as the parent company, with each individual hotel added as a property under it. The supplier form includes a parent-company selector for this, and the directory has <strong>properties only</strong> / <strong>companies only</strong> toggles to filter by level.
        </p>
      </section>

      {/* Browsing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Browsing the Directory</h2>
        <p className="text-gray-600 mb-3">
          The directory offers three views &mdash; <strong>grid</strong>, <strong>table</strong>, and <strong>list</strong> &mdash; with pagination for large directories. You can:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Sort</strong> by name, type, city, status, or commission</li>
          <li><strong>Filter by type</strong> &mdash; the selected type is mirrored in the URL, so you can bookmark or share a filtered view</li>
          <li><strong>Search</strong> across supplier name, contact name, and contact email</li>
          <li><strong>Toggle</strong> between properties only and companies only</li>
        </ul>
        <p className="text-gray-600">
          The header carries two actions: <strong>Export</strong> downloads the directory as CSV, and <strong>Add Supplier</strong> opens the creation form.
        </p>
        <DocScreenshot src="/docs/suppliers/suppliers-grid.jpg" alt="Suppliers directory in grid view with the type filter, search bar, and the Export and Add Supplier buttons in the header" />
      </section>

      {/* Adding */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Supplier</h2>
        <p className="text-gray-600 mb-3">
          The supplier form adapts to the type you pick. Type-specific fields draw on canned lists so data stays consistent:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Egyptian cities</strong> for locations</li>
          <li><strong>Vehicle types</strong> for transport companies and drivers</li>
          <li><strong>Guide languages</strong> for guides</li>
          <li><strong>Cuisine types</strong> for restaurants</li>
          <li><strong>Nile cruise routes</strong> for cruises</li>
        </ul>
        <p className="text-gray-600">
          For hotels, restaurants, and cruises, use the parent-company selector to attach a property to the company that owns it.
        </p>
        <DocScreenshot src="/docs/suppliers/supplier-form.jpg" alt="Add Supplier form with the type selector and type-specific fields" />
      </section>

      {/* Viewing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing a Supplier</h2>
        <p className="text-gray-600 mb-3">
          Opening a supplier shows a view modal with four tabs:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Details</strong> &mdash; Contact information, type, status, and commission</li>
          <li><strong>Rates</strong> &mdash; Rates associated with this supplier</li>
          <li><strong>Properties</strong> &mdash; Child properties, for parent companies</li>
          <li><strong>Documents</strong> &mdash; The contracts, rate sheets, allotment agreements, licences and insurance you hold with the supplier. Upload a PDF, image, Word or Excel file, set its validity dates, and optionally tie it to one of the supplier&rsquo;s properties (a specific ship or hotel). Documents ending within 60 days are flagged <em>Expiring soon</em>; files open through a short-lived private link, never a permanent URL.</li>
        </ul>
        <ScreenshotPlaceholder caption="Supplier view modal on /suppliers showing the Details, Rates, Properties, and Documents tabs" />
        <Tip>
          <strong>Rates live in their own section:</strong> supplier rate tables (hotels, transport, entrance fees, and more) are managed under Tours &amp; Rates &mdash; see <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Tours &amp; Rates</Link>.
        </Tip>
      </section>

      {/* Finance */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Suppliers and Money</h2>
        <p className="text-gray-600">
          The financial side of your supplier relationships lives elsewhere: record what suppliers bill you under <strong>Supplier Invoices</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/supplier-invoices</code>) and track what you owe under <strong>Payables</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/accounts-payable</code>). Both are documented in <Link href="/docs/invoices-payments" className="text-primary-600 hover:underline">Invoices &amp; Payments</Link>. Supplier costs on trips are covered in <Link href="/docs/expenses-commissions" className="text-primary-600 hover:underline">Expenses &amp; Commissions</Link>.
        </p>
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
