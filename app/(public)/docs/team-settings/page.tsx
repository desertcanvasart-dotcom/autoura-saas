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
          <li><strong>Language</strong> &mdash; Choose between English and Japanese for the interface</li>
        </ul>
        <DocScreenshot src="/docs/team-settings/settings-preferences.jpg" alt="Settings page showing preferences section with cost mode, currency, tier, and language options" />
      </section>

      {/* Multilingual */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Multilingual Support</h2>
        <p className="text-gray-600 mb-4">
          Autoura supports creating content in multiple languages (currently English and Japanese).
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Switching the Interface Language</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Settings &gt; Preferences</strong></li>
          <li>Change <strong>Language</strong> to your preferred language</li>
          <li>The entire interface (menus, buttons, labels) switches to that language</li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Creating Translated Itineraries</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open an itinerary</li>
          <li>You see language tabs at the top: <strong>English</strong> and <strong>Japanese</strong></li>
          <li>Click the <strong>Japanese</strong> tab</li>
          <li>If no Japanese version exists, choose:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Create from Scratch</strong> &mdash; Start with a blank Japanese version</li>
              <li><strong>Copy &amp; Translate</strong> &mdash; Automatically translate the English content using AI</li>
            </ul>
          </li>
          <li>All day titles, descriptions, service names, inclusions, and exclusions are translated</li>
        </ol>
        <ScreenshotPlaceholder caption="Itinerary page with language tabs showing English and Japanese, with Copy & Translate button" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Re-translating</h3>
        <p className="text-gray-600 mb-3">If the translation needs to be redone:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Switch to the Japanese tab</li>
          <li>Click <strong>Re-translate from English</strong></li>
          <li>Confirm in the dialog</li>
          <li>The system creates a fresh translation</li>
        </ol>
        <Tip>
          When editing rates while in Japanese mode, translated names are saved separately &mdash; the English names are never overwritten.
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
