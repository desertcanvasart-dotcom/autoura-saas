import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot, ScreenshotPlaceholder } from '../layout'

export default function TeamSettingsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Team &amp; Settings</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Team &amp; Settings</h1>
      <p className="text-gray-600 mb-8">
        Autoura separates your <strong>staff directory</strong> (people you assign work to) from <strong>user access</strong> (who can log in and what they can do). This page covers both, plus the Settings area.
      </p>

      {/* Team Members */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Members (Staff Directory)</h2>
        <p className="text-gray-600 mb-4">
          Go to <strong>Team Members</strong> under Operations (admin/manager only). This is your staff directory &mdash; the people you assign tasks to. Adding someone here does <strong>not</strong> give them a login.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>Click <strong>Add Member</strong> and fill in their details directly &mdash; no invitation email is sent</li>
          <li><strong>Role</strong> here is a job title: Owner, Manager, Coordinator, Sales, Tour Guide, Driver, or Staff</li>
          <li>Optionally assign a <strong>department</strong></li>
          <li>Filter the directory by role or department</li>
          <li>Members can be edited or deleted at any time</li>
        </ul>
        <DocScreenshot src="/docs/team-settings/team-members.jpg" alt="Team Members staff directory with job-title roles, departments, and filters" />
      </section>

      {/* User Management */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">User Management</h2>
        <p className="text-gray-600 mb-4">
          <strong>User Management</strong> (admin only) is the single place to control who can log in to your workspace:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>Click <strong>Invite User</strong>, enter their email, and pick an access role &mdash; they receive an email to set up their account</li>
          <li>Access roles are <strong>Administrator</strong> (full access), <strong>Manager</strong> (clients, tasks, and reports), <strong>Member</strong> (assigned work), and <strong>Viewer</strong> (read-only)</li>
          <li>Change a user&apos;s role from the inline dropdown, or deactivate a user to revoke access</li>
          <li><strong>Pending Invites</strong> and <strong>Expired Invites</strong> sections let you resend or revoke invitations</li>
          <li>A <strong>Role Permissions</strong> reference table at the bottom of the page shows what each role can do</li>
        </ul>
        <DocScreenshot src="/docs/getting-started/user-management.jpg" alt="User Management page with users, roles, and invitation management" />
        <Tip>
          Refer to the <Link href="/docs/getting-started" className="text-primary-600 underline hover:text-primary-700">Getting Started</Link> page for a full breakdown of what each access role can do.
        </Tip>
      </section>

      {/* Team Activity */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Activity (optional)</h2>
        <p className="text-gray-600 mb-4">
          Activity Summaries give admins and managers a light-touch view of how the team uses Autoura. For each member with a login you can see their <strong>last login</strong>, <strong>last seen</strong>, approximate <strong>focused time</strong> per day, and work counts &mdash; tasks completed, itineraries touched, and copilot drafts reviewed and sent.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Off by default</strong> &mdash; an admin turns it on in <strong>Organization</strong> settings, after confirming the team has been informed; everyone gets an in-app notice when it is enabled</li>
          <li>Open a member&apos;s summary from the <strong>Activity</strong> button on their card in Team Members (only members with a login have one)</li>
          <li>Members always see their <strong>own summary</strong> on their Profile page &mdash; the same numbers a manager sees</li>
        </ul>
        <ScreenshotPlaceholder caption="Team member Activity modal showing focused-time bars and work counts" />
        <Tip>
          Activity reflects work inside Autoura only. Phone calls, meetings, and off-app work are not captured &mdash; treat summaries as context, never as a complete picture of someone&apos;s day.
        </Tip>
      </section>

      {/* Settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Settings</h2>
        <p className="text-gray-600 mb-4">
          Go to <strong>Settings</strong> (the Settings group is admin-only). The page has four tabs:
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Profile</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Update your name and upload an avatar</li>
          <li>View your role</li>
          <li>Set your <strong>Timezone</strong> and <strong>Company Name</strong></li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Email</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Connect or disconnect your Gmail account</li>
          <li>Email signatures are managed on their own page &mdash; follow the <strong>Manage signatures</strong> link (rich and HTML signatures; your default signature auto-appears in the reply composer)</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Notifications</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Master toggles for email and in-app notifications</li>
          <li>Per-event toggles: Task Assigned, Task Due Soon, Task Overdue, Task Completed</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Preferences</h3>
        <p className="text-gray-600 mb-3">Titled <strong>Itinerary Preferences</strong> &mdash; defaults for new itineraries:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Default Cost Mode</strong> &mdash; Auto-Calculate (use rates database) or Manual Entry (enter costs by hand)</li>
          <li><strong>Default Tier</strong> &mdash; Budget, Standard, Deluxe, or Luxury</li>
          <li><strong>Default Margin</strong> &mdash; Default markup percentage</li>
          <li><strong>Default Currency</strong> &mdash; Your preferred currency (EUR, USD, etc.)</li>
        </ul>
        <DocScreenshot src="/docs/team-settings/settings-preferences.jpg" alt="Settings page Preferences tab with cost mode, tier, margin, and currency defaults" />
        <p className="mt-4 text-gray-600">
          WhatsApp is configured on its own admin page &mdash; <strong>WhatsApp</strong> in the Settings group &mdash; not as a Settings tab.
        </p>
      </section>

      {/* Other admin pages */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Organization, Billing &amp; Capacity</h2>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Organization</h3>
        <p className="text-gray-600 mb-4">
          <strong>Organization</strong> (Settings group) holds your company profile: upload your logo and set primary and secondary brand colors, which flow into your generated documents (quotes, invoices, and more). A Features section controls which platform features are enabled.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Billing and Subscriptions</h3>
        <p className="text-gray-600 mb-4">
          <strong>Billing and Subscriptions</strong> shows your current plan and usage against plan limits, links to the plans page, and opens the Stripe customer portal to manage payment details.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Capacity</h3>
        <p className="text-gray-600 mb-4">
          <strong>Capacity</strong> provides a capacity calendar: set default daily capacity and edit individual dates.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Support Chat</h3>
        <p className="text-gray-600">
          A floating support chat widget is available on every page &mdash; use it to message the Autoura support team directly, and replies arrive both in the widget and by email.
        </p>
      </section>

      {/* Multilingual */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working in Other Languages</h2>
        <p className="text-gray-600 mb-4">
          Autoura handles client <strong>messaging</strong> in 29 languages. Client-facing
          <strong> documents</strong> &mdash; quotes, invoices, receipts, vouchers &mdash; are
          generated in English today; additional document languages are on the roadmap.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Translating a Conversation</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open a WhatsApp or email conversation</li>
          <li>Open the <strong>translation panel</strong> on the message</li>
          <li>The language is detected automatically; pick a different one if the detection is wrong</li>
          <li>Use <strong>Re-translate</strong> if you want another pass</li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Replying in the Client&apos;s Language</h3>
        <p className="text-gray-600 mb-3">
          The AI copilot drafts replies in whatever language the client wrote in. You review and
          approve every draft before it is sent &mdash; nothing goes out automatically.
        </p>

        <Tip>
          The staff interface is English. Language settings affect how you communicate with
          clients, not how the app is labelled.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/message-templates"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Message Templates
        </Link>
        <Link
          href="/docs/workflows"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Workflows &amp; Tips
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
