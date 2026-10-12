import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/partners')

export default function PartnersDocPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Partners</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Partners</h1>
      <p className="text-gray-600 mb-8">
        The tour operators and travel agencies you sell to, under <strong>People &rarr; Partners</strong>. They are
        kept apart from your <Link href="/docs/clients" className="text-primary-600 hover:underline">clients</Link>, the
        travellers themselves. Admins and managers see and edit partners; others do not.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The partner list</h2>
        <p className="text-gray-600 mb-3">
          Four counts at the top &mdash; <strong>Total Partners</strong>, <strong>Active</strong>,{' '}
          <strong>Countries</strong> and <strong>Avg Margin</strong> &mdash; and each partner&rsquo;s name and code,
          contact, country, default margin and status below. Search by name or code. The list shows active partners;
          the <strong>Active Only</strong> button switches to every partner.
        </p>
        <DocScreenshot src="/docs/b2b-quotes/partners.jpg" alt="The B2B Partners page" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or editing a partner</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Company Name</strong> &mdash; the only required field.</li>
          <li>
            <strong>Partner Code</strong> &mdash; leave it blank and the next free code is given: the company&rsquo;s first
            three letters and a number (<code>NIL-001</code>, then <code>NIL-002</code> for the next &ldquo;Nile &hellip;&rdquo;).
          </li>
          <li><strong>Contact Name</strong>, <strong>Email</strong>, <strong>Phone</strong>.</li>
          <li><strong>Country</strong> &mdash; type any country; common ones are suggested.</li>
          <li><strong>Currency</strong> &mdash; the currency the partner deals in, your agency&rsquo;s unless you pick another. It is a record on the partner; it does not change the currency quotes are priced in.</li>
          <li><strong>Default Margin (%)</strong> &mdash; from 0 to 100; 0% is a real margin (at cost). See below.</li>
          <li><strong>Payment Terms</strong>, <strong>Credit Limit</strong>, <strong>Notes</strong> &mdash; for your records.</li>
          <li><strong>Partner is active</strong> &mdash; untick it to retire a partner without deleting it.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The default margin</h2>
        <p className="text-gray-600 mb-3">The margin a partner&rsquo;s prices start from:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            In the <strong>B2B Calculator</strong>, pick the partner beside <strong>Profit Margin</strong> before you
            calculate &mdash; their margin is put in. Pick a partner only in the Save dialog and, if the quote was
            priced at a different margin, the dialog says so.
          </li>
          <li>In the <strong>Quote Builder</strong> in B2B mode, picking the partner puts their margin in.</li>
          <li>A margin you change after that is the one the quote uses.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          More: <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link> and{' '}
          <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting a partner</h2>
        <p className="text-gray-600">
          A partner with quotes, bookings or trips cannot be deleted &mdash; the message says how many; untick{' '}
          <strong>Partner is active</strong> instead. A partner with none is deleted.
        </p>
        <Tip>Deactivated partners drop out of the pickers but keep their quotes, bookings and trips.</Tip>
      </section>

      <DocPager href="/docs/partners" />
    </div>
  )
}
