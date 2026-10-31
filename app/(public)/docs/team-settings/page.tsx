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
        Autoura separates your <strong>staff directory</strong> (people you assign work to) from <strong>user access</strong> (who can log in and what they can do). This page covers both, your own settings, and the rest of the <strong>Settings</strong> area.
      </p>

      {/* Settings area */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Settings area</h2>
        <p className="text-gray-600 mb-4">
          Settings is its own area of the app, with its own menu on the left. Open it from <strong>Settings</strong> at the bottom of the main sidebar, or from the <strong>account menu</strong> (your initials, top right). <strong>&larr; Back to app</strong> at the top of its menu returns you to the page you were on. On a phone the menu is a single page picker above the page.
        </p>
        <p className="text-gray-600 mb-3">
          The menu is grouped, and everyone sees only the pages their role may open. Pages marked <strong>Admins only</strong> are for admins:
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Group</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Pages</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">Account</td>
                <td className="px-4 py-2.5">Profile &middot; Email &amp; signature &middot; Notifications &mdash; your own, every role</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">Organization</td>
                <td className="px-4 py-2.5">Company (admins) &middot; Departments &middot; Team &amp; roles (admins) &middot; Staff directory &middot; Supplier network &middot; Billing &amp; plan (admins)</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">Pricing</td>
                <td className="px-4 py-2.5">Pricing defaults (admins) &middot; Currencies &amp; rates (admins) &middot; Seasonal premiums</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">Catalog</td>
                <td className="px-4 py-2.5">Destinations &middot; Day blocks &middot; Attraction names &middot; Vocabulary &mdash; all admins</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">Messaging</td>
                <td className="px-4 py-2.5">Message templates &middot; WhatsApp (admins)</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">Content &amp; AI</td>
                <td className="px-4 py-2.5">Content library &middot; Writing rules &middot; AI prompts &middot; Copilot knowledge &middot; Copilot settings (admins)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600">
          Pages not marked for admins are open to admins and managers, except the Account group and Message templates, which members use too. Old bookmarks to the former Settings tabs, User Management, Team Members and Message Templates open their new pages.
        </p>
        <Tip>
          Press <strong>&#8984;K</strong> (Ctrl&nbsp;K on Windows), or click the search box in the top bar, and type a setting&apos;s name to jump straight to it. The same box finds any page, rate sheet or client by name.
        </Tip>
      </section>

      {/* Personal settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Account: your own settings (every role)</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Profile</strong> &mdash; account menu &rarr; <strong>Profile</strong>, or Settings &rsaquo; Account &rsaquo; Profile. Change your name, phone and photo, change your password, and see <strong>Your Activity</strong> (when your company has Activity Summaries on). Your email and role are shown, not edited here.</li>
          <li><strong>Email &amp; signature</strong> (admins, managers and members) &mdash; one page with three tabs: <strong>Connection</strong> connects your own Gmail, used to read and reply to client email in the Inbox; <strong>Signatures</strong> holds your signatures (the default one is added to the reply composer); <strong>Templates</strong> holds your email templates.</li>
          <li><strong>Notifications</strong> &mdash; what you are told about, and where:
            <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
              <li><strong>Email</strong> and <strong>In the app</strong> (under the bell in the top bar) switches for your notifications.</li>
              <li><strong>Task due soon</strong> (24 hours before) and <strong>Task overdue</strong> reminders follow their switches.</li>
              <li><strong>Task assigned</strong> &mdash; when a task is assigned or reassigned to you (not when you assign it to yourself). <strong>Task completed</strong> &mdash; when a task you created is completed by someone else. Both by email and in the app, as the two switches above allow.</li>
            </ul>
          </li>
        </ul>
        <p className="text-gray-600 mt-3">
          Someone who works for more than one company on Autoura switches between them from <strong>Switch company</strong> in the account menu.
        </p>
      </section>

      {/* Team & roles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team &amp; roles</h2>
        <p className="text-gray-600 mb-4">
          <strong>Settings &rsaquo; Organization &rsaquo; Team &amp; roles</strong> (admins and owners; formerly User Management) controls who can log in to your workspace:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Invite User</strong> &mdash; enter an email and pick a role. You can give a role below your own: an admin invites managers, members and viewers, and an owner can also invite admins. Nobody is invited as an owner. Each invite takes a seat on your plan, and an invite is refused when the plan is full.</li>
          <li>If the invitation email could not be sent, the page says so and gives you the link to pass on yourself.</li>
          <li><strong>Pending</strong> and <strong>Expired</strong> invites can be resent (with a fresh link and a new expiry date) or revoked.</li>
          <li>Change a user&rsquo;s role from the dropdown, or deactivate them. You cannot change your own role or deactivate yourself, only an owner acts on an owner, and the last active owner or admin cannot be deactivated or demoted.</li>
          <li>Deactivating someone removes their access to <em>this</em> workspace only; any other company they work with is untouched.</li>
          <li>Someone who already works for another company on Autoura accepts with their usual password; they switch between companies from <strong>Switch company</strong> in the account menu.</li>
        </ul>
        <DocScreenshot src="/docs/getting-started/user-management.jpg" alt="Team & roles page with users, roles, and invitation management" />
        <Tip>
          What each role can see is in{' '}
          <Link href="/docs/getting-started" className="text-primary-600 underline hover:text-primary-700">Getting Started</Link>.
        </Tip>
      </section>

      {/* Staff directory */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Staff directory</h2>
        <p className="text-gray-600 mb-4">
          <strong>Settings &rsaquo; Organization &rsaquo; Staff directory</strong> (admins and managers; formerly Team Members) is also the <strong>Team</strong> link in the sidebar&apos;s Contacts section. It lists the people you assign tasks to. Adding someone here does <strong>not</strong> give them a login.
        </p>
        <p className="text-gray-600 mb-3">
          Its role is a job title, not a permission, and its staff type is what the guide and driver pickers read.
          The whole page is in <Link href="/docs/team-members" className="text-primary-600 underline hover:text-primary-700">Staff Directory</Link>.
        </p>
        <DocScreenshot src="/docs/team-settings/team-members.jpg" alt="Staff directory with job-title roles, departments, and filters" />
      </section>

      {/* Pricing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pricing defaults and Currencies &amp; rates (admins)</h2>
        <p className="text-gray-600 mb-3">
          These used to be each person&rsquo;s own Preferences; they are now set once for the whole company. Changes wait in a bar at the bottom of the page until you click <strong>Save</strong>.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mb-3">Pricing defaults</h3>
        <p className="text-gray-600 mb-3">Used for every new quote and itinerary; each itinerary can still override them.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Cost calculation</strong> &mdash; the mode a new itinerary starts in: <strong>Auto-calculate</strong> (costs from your rates) or <strong>Manual entry</strong> (staff type each cost). Each itinerary&rsquo;s own switch still changes one trip.</li>
          <li><strong>Default service tier</strong> &mdash; one of your tiers (from Your Vocabulary), preselected for new quotes; Copilot picks suppliers of this tier for new itineraries.</li>
          <li><strong>Markup on supplier cost</strong> &mdash; your house markup, added to the total supplier cost to make the selling price. An example shows the selling price and the profit margin it gives. A margin typed on a quote always wins; 0% is allowed. Until it is set, new quotes start at the platform default.</li>
          <li>A link to <strong>Seasonal premiums</strong>, applied after markup.</li>
        </ul>
        <DocScreenshot src="/docs/team-settings/settings-preferences.jpg" alt="Pricing defaults: cost mode, service tier and markup (screenshot from the earlier Preferences tab)" />
        <h3 className="text-lg font-medium text-gray-900 mb-3">Currencies &amp; rates</h3>
        <p className="text-gray-600 mb-3">Clients are charged in your agency currency. These settings only change how a quote is <em>shown</em> in another currency:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Default quote currency</strong> &mdash; new quotes start in this currency; staff can switch per quote.</li>
          <li><strong>Conversion buffer</strong> &mdash; 0 to 20%, added to prices shown in another currency, to protect you if the rate moves between quote and payment. Never applied to the amount charged. 0 means off.</li>
          <li><strong>Exchange rates</strong> &mdash; one row per currency: <strong>In use</strong> (whether quote pickers offer it), the market <strong>API rate</strong>, and <strong>Your rate</strong> if you want to override it. A rate you set shows who set it and when.</li>
        </ul>
      </section>

      {/* Lists and pricing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Catalog: your words, places and standard days (admins)</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Destinations</strong> &mdash; the countries you operate and the cities you sell. Every city dropdown follows this list. A country or city the catalogue lacks can be added (names are matched without regard to capitals, so &ldquo;luxor&rdquo; finds Luxor); additions join the shared catalogue.</li>
          <li><strong>Day blocks</strong> &mdash; your standard days, kept once: what each includes and where its night is. Export the sheet, edit it in Excel or Google Sheets and import it back; you see what would change before anything is saved. A paid sight with no fee behind it is flagged.</li>
          <li><strong>Attraction names</strong> &mdash; your tours name a sight one way, your entrance-fee sheet may name it another. Say which fee a wording means and every tour using it is priced from that fee. The top panel lists every wording in your tours that reaches no fee &mdash; each is a gap in the price.</li>
          <li><strong><Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link></strong> &mdash; the 40 lists behind your dropdowns: tiers, supplier types, vehicles, meal types and more.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong><Link href="/docs/seasonal-premiums" className="text-primary-600 hover:underline">Seasonal premiums</Link></strong> (admins and managers) is in the Pricing group. <strong><Link href="/docs/extras" className="text-primary-600 hover:underline">Extras</Link></strong>, the add-ons you sell on top of a trip, is in the main sidebar under Products.
        </p>
        <p className="text-gray-600 mt-3">Changes to lists and destinations reach every open screen within five minutes, or at once on a reload.</p>
      </section>

      {/* Other admin pages */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Company, Billing &amp; the rest</h2>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Company</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Basic Information</strong> &mdash; company name and contact email; your minimum margin and deposit percentages and the days a deposit is due (left blank, the platform defaults apply); the company timezone; the country you operate in and the governing law for contracts; your agency currency; and the <strong>rates currency</strong> your supplier rates are kept in (changing it asks you to confirm, as existing rates are not converted). Your markup is shown here and set in Pricing defaults.</li>
          <li><strong>Limits</strong> &mdash; set by your plan.</li>
          <li><strong>Team Activity</strong> &mdash; switch on <Link href="/docs/activity-summary" className="text-primary-600 hover:underline">Activity Summaries</Link>.</li>
          <li><strong>Branding</strong> &mdash; logo and primary and secondary colours, used on your documents. If the logo fails to upload, nothing is saved.</li>
          <li><strong>Document header &amp; footer</strong> &mdash; tagline, phone, website, address, licence and tax numbers, and a footer note.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Billing &amp; plan</h3>
        <p className="text-gray-600 mb-4">
          Your plan, its price and your usage against its limits; <strong>Upgrade</strong> opens the plans; <strong>Manage Billing</strong> opens the Stripe portal for cards and invoices.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Departments</h3>
        <p className="text-gray-600 mb-4">
          (Admins and managers.) The teams tasks are routed to: each department names the kinds of service it handles, and the tasks generated for a trip go to the department that claims them.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Supplier network</h3>
        <p className="text-gray-600 mb-4">
          (Admins change it; managers can read it.) Where your agency books suppliers from &mdash; your own list, the Autoura network, or both &mdash; and the suppliers waiting for you to confirm their sign-in. The sign-in requests also show on <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>, where you meet them day to day.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Copilot settings</h3>
        <p className="text-gray-600 mb-4">
          (Content &amp; AI.) <strong>Proactive draft pre-generation</strong> drafts replies in the background so they are ready when someone opens the thread; they still need a person to send them.
          <strong> WhatsApp AI auto-reply</strong> lets the bot answer WhatsApp messages on its own, with no review &mdash; leave it off unless you have decided to; it can only be switched on once the Autoura team has enabled it for your workspace.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">WhatsApp</h3>
        <p className="text-gray-600 mb-4">
          (Messaging.) WhatsApp runs on Autoura&rsquo;s WhatsApp account; your number is connected by the Autoura support team, not entered here. The page shows whether it is set up, sends a test message, and holds the same AI auto-reply switch.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Capacity calendar</h3>
        <p className="text-gray-600 mb-4">
          Not in Settings: it is the <strong>Capacity</strong> view of <strong>Departures</strong> (sidebar, Operate; admins). A month view of your departures and your limit of groups per day. Set the <strong>default</strong> for every day (blank = no limit) and change single days, or close one. A day&rsquo;s groups are your live bookings on the ground that day plus any you enter as booked outside Autoura. A booking that would go over a day&rsquo;s limit, or fall on a closed day &mdash; from a quote or by confirming an itinerary &mdash; is refused with the days named; a manager or admin can book it anyway. The WhatsApp assistant&rsquo;s availability answers count the same way. See <Link href="/docs/tasks-departures" className="text-primary-600 hover:underline">Tasks &amp; Departures</Link>.
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
