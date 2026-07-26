import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

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

      {/* Team Members */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Members</h2>
        <p className="text-gray-600 mb-4">
          Go to <strong>Team Members</strong> (admin/manager only) to manage your team.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Viewing Your Team</h3>
        <p className="text-gray-600 mb-3">
          See all team members with their roles and departments. You can see who is active and who is deactivated.
        </p>
        <DocScreenshot src="/docs/team-settings/team-members.jpg" alt="Team members page showing member list with roles, departments, and status" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Inviting a New Team Member</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Invite Member</strong></li>
          <li>Enter their email address</li>
          <li>Select their <strong>role</strong> (Admin, Manager, Agent, or Viewer)</li>
          <li>Assign a <strong>department</strong> (optional)</li>
          <li>Click <strong>Send Invitation</strong></li>
        </ol>
        <p className="mt-3 text-gray-600">
          They receive an email with a link to set up their account.
        </p>
        <ScreenshotPlaceholder caption="Invite team member dialog with email, role selection, and department fields" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Changing Roles</h3>
        <p className="text-gray-600">
          Click on a team member and update their role. Role changes take effect immediately.
        </p>
        <Tip>
          Refer to the <Link href="/docs/getting-started" className="text-primary-600 underline hover:text-primary-700">Getting Started</Link> page for a full breakdown of what each role can access.
        </Tip>
      </section>

      {/* Settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Settings</h2>
        <p className="text-gray-600 mb-4">
          Go to <strong>Settings</strong> in the sidebar to customize your account.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Profile</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Update your name, phone, and avatar</li>
          <li>View your role</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Email</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Connect or disconnect your Gmail account</li>
          <li>Set up your email signature</li>
          <li>Configure auto-reply settings</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">WhatsApp</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>View WhatsApp connection status</li>
          <li>Configure message settings</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Preferences</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Default Cost Mode</strong> &mdash; Choose Auto (use rates database) or Manual (enter costs by hand)</li>
          <li><strong>Default Currency</strong> &mdash; Set your preferred currency (EUR, USD, etc.)</li>
          <li><strong>Default Tier</strong> &mdash; Set a default quality tier for new itineraries</li>
          <li><strong>Default Margin</strong> &mdash; Set a default markup percentage</li>
        </ul>
        <DocScreenshot src="/docs/team-settings/settings-preferences.jpg" alt="Settings page showing preferences section with cost mode, currency, tier, and language options" />
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
