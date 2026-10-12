import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/team-settings')

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
        Autoura separates your <strong>staff directory</strong> (people you assign work to) from <strong>user access</strong> (who can log in and what they can do). This page covers both, your own settings, and the admin-only Settings group.
      </p>

      {/* Team Members */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Members (Staff Directory)</h2>
        <p className="text-gray-600 mb-4">
          Go to <strong>Team Members</strong> under People (admin/manager only). This is your staff directory &mdash; the people you assign tasks to. Adding someone here does <strong>not</strong> give them a login.
        </p>
        <p className="text-gray-600 mb-3">
          Its role is a job title, not a permission, and its staff type is what the guide and driver pickers read.
          The whole page is in <Link href="/docs/team-members" className="text-primary-600 underline hover:text-primary-700">Team Members</Link>.
        </p>
        <DocScreenshot src="/docs/team-settings/team-members.jpg" alt="Team Members staff directory with job-title roles, departments, and filters" />
      </section>

      {/* User Management */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">User Management</h2>
        <p className="text-gray-600 mb-4">
          <strong>User Management</strong> (admins and owners) controls who can log in to your workspace:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Invite User</strong> &mdash; enter an email and pick a role. You can give a role below your own: an admin invites managers, members and viewers, and an owner can also invite admins. Nobody is invited as an owner. Each invite takes a seat on your plan, and an invite is refused when the plan is full.</li>
          <li>If the invitation email could not be sent, the page says so and gives you the link to pass on yourself.</li>
          <li><strong>Pending</strong> and <strong>Expired</strong> invites can be resent (with a fresh link and a new expiry date) or revoked.</li>
          <li>Change a user&rsquo;s role from the dropdown, or deactivate them. You cannot change your own role or deactivate yourself, only an owner acts on an owner, and the last active owner or admin cannot be deactivated or demoted.</li>
          <li>Deactivating someone removes their access to <em>this</em> workspace only; any other company they work with is untouched.</li>
          <li>Someone who already works for another company on Autoura accepts with their usual password; they switch between companies from the <strong>Company</strong> picker in the sidebar.</li>
        </ul>
        <DocScreenshot src="/docs/getting-started/user-management.jpg" alt="User Management page with users, roles, and invitation management" />
        <Tip>
          What each role can see is in{' '}
          <Link href="/docs/getting-started" className="text-primary-600 underline hover:text-primary-700">Getting Started</Link>.
        </Tip>
      </section>

      {/* Personal settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your own settings (every role)</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>My profile</strong> &mdash; click your name at the bottom of the sidebar. Change your name, phone, company name and photo, change your password, and see <strong>Your Activity</strong> (when your company has Activity Summaries on).</li>
          <li><strong>Email</strong> (<code>/settings/email</code>; admins, managers and members) &mdash; connect your own Gmail, used to read and reply to client email in the Inbox.</li>
          <li><strong>Email Signatures</strong> (Communication group) &mdash; your signatures; the default one is added to the reply composer.</li>
        </ul>
      </section>

      {/* Settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Settings page (admins)</h2>
        <p className="text-gray-600 mb-4">
          <strong>Settings</strong>, at the top of the Settings group, has four tabs:
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Profile</h3>
        <p className="text-gray-600 mb-4">Your name, phone and photo; your email and role are shown, not edited here.</p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Email</h3>
        <p className="text-gray-600 mb-4">Your Gmail connection, and a link to <strong>Email Signatures</strong>.</p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Notifications</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Email</strong> and <strong>in-app</strong> switches for your notifications.</li>
          <li><strong>Task Due Soon</strong> (24 hours before) and <strong>Task Overdue</strong> reminders follow their switches.</li>
          <li><strong>Task Assigned</strong> &mdash; when a task is assigned or reassigned to you (not when you assign it to yourself). <strong>Task Completed</strong> &mdash; when a task you created is completed by someone else. Both by email and in the app, as the two switches above allow.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Preferences</h3>
        <p className="text-gray-600 mb-3">Your own starting points, plus shortcuts to the settings below:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Default Service Tier</strong>, <strong>Default Currency</strong> &mdash; preselected in the Pricing Grid; the currency is also the one figures are shown in.</li>
          <li><strong>Default Profit Margin</strong> &mdash; your margin on new quotes. It comes before your company&rsquo;s house margin; a margin typed on a quote always wins. 0% is allowed.</li>
          <li><strong>Cost Calculation Mode</strong> &mdash; the mode a new itinerary you create starts in: Auto-Calculate (costs from your rates) or Manual Entry (costs editable, with the rates&rsquo; figures filled in). Each itinerary&rsquo;s own switch still changes one trip.</li>
          <li><strong>Exchange Rates</strong> &mdash; your company&rsquo;s rates. <strong>Refresh from API</strong> loads the market rates; a rate you change is marked <strong>Custom</strong>, and only the rates you change are saved.</li>
        </ul>
        <DocScreenshot src="/docs/team-settings/settings-preferences.jpg" alt="Settings page Preferences tab with cost mode, tier, margin, and currency defaults" />
      </section>

      {/* Lists and pricing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your words, places and standard days (admins)</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong><Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Your Vocabulary</Link></strong> &mdash; the 40 lists behind your dropdowns: tiers, supplier types, vehicles, meal types and more.</li>
          <li><strong>Attraction Names</strong> &mdash; your tours name a sight one way, your entrance-fee sheet may name it another. Say which fee a wording means and every tour using it is priced from that fee. The top panel lists every wording in your tours that reaches no fee &mdash; each is a gap in the price.</li>
          <li><strong>Day Blocks</strong> &mdash; your standard days, kept once: what each includes and where its night is. Export the sheet, edit it in Excel or Google Sheets and import it back; you see what would change before anything is saved. A paid sight with no fee behind it is flagged.</li>
          <li><strong>Destinations</strong> &mdash; the countries you operate and the cities you sell. Every city dropdown follows this list. A country or city the catalogue lacks can be added (names are matched without regard to capitals, so &ldquo;luxor&rdquo; finds Luxor); additions join the shared catalogue.</li>
          <li><strong><Link href="/docs/seasonal-premiums" className="text-primary-600 hover:underline">Seasonal Premiums</Link></strong> (admins and managers) &mdash; your peak dates and the premium you charge on them.</li>
          <li><strong><Link href="/docs/extras" className="text-primary-600 hover:underline">Extras &amp; Upgrades</Link></strong> &mdash; the add-ons you sell on top of a trip.</li>
        </ul>
        <p className="text-gray-600 mt-3">Changes to lists and destinations reach every open screen within five minutes, or at once on a reload.</p>
      </section>

      {/* Other admin pages */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Organization, Billing &amp; the rest</h2>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Organization</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Basic Information</strong> &mdash; company name and contact email; your house, minimum and deposit percentages and the days a deposit is due (left blank, the platform defaults apply); the company timezone; the country you operate in and the governing law for contracts; and the <strong>rates currency</strong> your supplier rates are kept in (changing it asks you to confirm, as existing rates are not converted).</li>
          <li><strong>Limits</strong> &mdash; set by your plan.</li>
          <li><strong>Team Activity</strong> &mdash; switch on <Link href="/docs/activity-summary" className="text-primary-600 hover:underline">Activity Summaries</Link>.</li>
          <li><strong>Branding</strong> &mdash; logo and primary and secondary colours, used on your documents. If the logo fails to upload, nothing is saved.</li>
          <li><strong>Document header &amp; footer</strong> &mdash; tagline, phone, website, address, licence and tax numbers, and a footer note.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Billing and Subscriptions</h3>
        <p className="text-gray-600 mb-4">
          Your plan, its price and your usage against its limits; <strong>Upgrade</strong> opens the plans; <strong>Manage Billing</strong> opens the Stripe portal for cards and invoices.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Departments</h3>
        <p className="text-gray-600 mb-4">
          The teams tasks are routed to: each department names the kinds of service it handles, and the tasks generated for a trip go to the department that claims them.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Copilot Settings</h3>
        <p className="text-gray-600 mb-4">
          <strong>Proactive draft pre-generation</strong> drafts replies in the background so they are ready when someone opens the thread; they still need a person to send them.
          <strong> WhatsApp AI auto-reply</strong> lets the bot answer WhatsApp messages on its own, with no review &mdash; leave it off unless you have decided to; it can only be switched on once the Autoura team has enabled it for your workspace.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">WhatsApp</h3>
        <p className="text-gray-600 mb-4">
          WhatsApp runs on Autoura&rsquo;s WhatsApp account; your number is connected by the Autoura support team, not entered here. The page shows whether it is set up, sends a test message, and holds the same AI auto-reply switch.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Capacity Calendar</h3>
        <p className="text-gray-600 mb-4">
          (Operations group; admins.) A month view of your departures and your limit of groups per day. Set the <strong>default</strong> for every day (blank = no limit) and change single days, or close one. A day&rsquo;s groups are your live bookings on the ground that day plus any you enter as booked outside Autoura. A booking that would go over a day&rsquo;s limit, or fall on a closed day &mdash; from a quote or by confirming an itinerary &mdash; is refused with the days named; a manager or admin can book it anyway. The WhatsApp assistant&rsquo;s availability answers count the same way.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Support Chat</h3>
        <p className="text-gray-600">
          The chat button on every page messages the Autoura support team; replies arrive in the widget and by email.
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
          approve every draft before it is sent &mdash; nothing goes out automatically, unless an
          admin has switched on WhatsApp AI auto-reply.
        </p>

        <Tip>
          The staff interface is English. Language settings affect how you communicate with
          clients, not how the app is labelled.
        </Tip>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/team-settings" />
    </div>
  )
}
