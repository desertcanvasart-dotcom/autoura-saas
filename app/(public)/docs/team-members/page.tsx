import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/team-members')

export default function TeamMembersDocPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Staff Directory</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Staff Directory</h1>
      <p className="text-gray-600 mb-8">
        Your staff directory (formerly Team Members): <strong>Team</strong> in the sidebar&rsquo;s Contacts section, or <strong>Settings &rsaquo; Organization &rsaquo; Staff directory</strong> &mdash; the same page. It lists the guides, drivers and office staff
        that trips, tasks and WhatsApp chats are assigned to. Adding someone here does <strong>not</strong> give them a
        login &mdash; logins and their permissions are in <strong>Settings &rsaquo; Team &amp; roles</strong> (see{' '}
        <Link href="/docs/team-settings" className="text-primary-600 hover:underline">Team &amp; Settings</Link>).
        Admins and managers see and edit the directory.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The directory</h2>
        <p className="text-gray-600 mb-3">
          The counts at the top give the active members and how many hold each role. Search by name or email, filter by role or
          department, and tick <strong>Show inactive</strong> to see deactivated members. <strong>Manage departments</strong>{' '}
          opens the department list (<strong>Settings &rsaquo; Organization &rsaquo; Departments</strong>).
        </p>
        <DocScreenshot src="/docs/team-settings/team-members.jpg" alt="Staff directory with job-title roles, departments, and filters" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or editing a member</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Name</strong> &mdash; the only required field.</li>
          <li><strong>Email</strong> &mdash; optional, but two members cannot share one; the form says so if they do.</li>
          <li><strong>Phone</strong> &mdash; with the country code (+20 &hellip;).</li>
          <li><strong>Role</strong> &mdash; a job title: Owner, Manager, Coordinator, Sales, Tour Guide, Driver or Staff. It is not a permission.</li>
          <li>
            <strong>Staff type</strong> &mdash; Office, Guide, Driver, Airport staff or Hotel staff. This is what the
            assignment pickers read: a trip or vehicle that needs a driver offers your Drivers. Choosing the role
            Tour Guide or Driver sets it to Guide or Driver; you can still change it. A new member is Office staff
            unless you pick otherwise.
          </li>
        </ul>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-2">
          <li><strong>Department</strong> and <strong>Notes</strong> &mdash; optional.</li>
        </ul>
        <p className="text-gray-600 mt-3">If a save is refused, the reason shows at the top of the form.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Members who also log in</h2>
        <p className="text-gray-600">
          A member whose email is the same as a user&rsquo;s login is linked to that user. Change the email and the link
          follows the new address. When Activity Summaries are on, a linked member shows an <strong>Activity</strong>{' '}
          button &mdash; see <Link href="/docs/activity-summary" className="text-primary-600 hover:underline">Team Activity</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deactivating</h2>
        <p className="text-gray-600">
          <strong>Deactivate</strong> takes a member out of the directory and the pickers without deleting them, so the
          tasks and trips they worked on keep their name. <strong>Reactivate</strong> brings them back.
        </p>
        <Tip>Keep the staff type right for guides and drivers &mdash; it is how they are offered when you assign a trip.</Tip>
      </section>

      <DocPager href="/docs/team-members" />
    </div>
  )
}
