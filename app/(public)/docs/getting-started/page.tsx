import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, DocScreenshot, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/getting-started')

export default function GettingStartedPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Getting Started</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Getting Started</h1>

      {/* Logging In */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Logging In</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to your Autoura URL (e.g., <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">https://getautoura.net</code>)</li>
          <li>Enter your email and password</li>
          <li>Click <strong>Sign In</strong></li>
        </ol>
        <p className="mt-3 text-gray-600">
          Forgot your password? Use the <strong>Forgot password</strong> link on the login page to reset it by email.
        </p>
        <DocScreenshot src="/docs/getting-started/login-page.jpg" alt="Login page with email and password fields and a Forgot password link" />
      </section>

      {/* Creating an Account */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a New Account</h2>
        <p className="text-gray-600 mb-3">
          If your company is new to Autoura, click <strong>Sign up</strong> on the login page &mdash; no invitation needed. Enter
          your details, then confirm your address from the email we send. The first time you sign in, a wizard sets up your
          company in seven steps:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-gray-700">
          <li><strong>Welcome</strong> &mdash; A quick introduction</li>
          <li><strong>Business</strong> &mdash; Your company details</li>
          <li><strong>Your words</strong> &mdash; The cities you sell, what you call your service tiers, and the kinds of suppliers you work with. Egypt&apos;s defaults are pre-filled; every dropdown in the app follows your choices, and an admin can change them any time in Settings &rsaquo; Catalog &rsaquo; Vocabulary</li>
          <li><strong>Branding</strong> &mdash; Logo and colors used on your documents</li>
          <li><strong>Team</strong> &mdash; Invite your teammates: each gets an invitation email (if one cannot be sent, you are shown the link to pass on). Optional &mdash; you can invite people later from Settings &rsaquo; Team &amp; roles</li>
          <li><strong>Tour</strong> &mdash; A short tour of the app</li>
          <li><strong>Complete</strong> &mdash; You&apos;re ready to work</li>
        </ol>
        <Tip>
          The wizard is the owner&rsquo;s and admins&rsquo;: if you leave partway through, you pick up at the next step the next time you sign in. Teammates who sign in before it is finished go straight to the dashboard.
        </Tip>
      </section>

      {/* First-Time Setup */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Joining by Invitation</h2>
        <p className="text-gray-600 mb-3">If you received an invitation email (it names the company and your role):</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click the invitation link in the email. It is valid for 7 days; an admin can resend it with a fresh link.</li>
          <li>Enter your <strong>Full Name</strong>, a <strong>Password</strong> and <strong>Confirm Password</strong> (minimum 8 characters)</li>
          <li>You are taken to the dashboard &mdash; no separate confirmation email is needed; the invitation link already proves it is your address</li>
        </ol>
        <Tip>
          <strong>Tip:</strong> Check your spam folder if you don&apos;t see the invitation email within a few minutes.
          Already on Autoura with another company? Use the same link and sign in with your usual password: the new company is
          added to your login and opens straight away.
        </Tip>
      </section>

      {/* Several companies */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working for Several Companies</h2>
        <p className="text-gray-600 mb-3">
          One login can belong to several companies, with a different role in each. When it does, the account menu (your initials, top
          right) lists them under <strong>Switch company</strong>: choose a company and Autoura reloads in it &mdash; its clients, trips,
          rates, settings and your role there. Autoura remembers your choice the next time you sign in.
        </p>
        <p className="text-gray-600">
          If you are deactivated in the company you chose, you are taken to your next company automatically.
        </p>
        <p className="text-gray-600 mt-3">
          Your Gmail is connected per company: in each company, connect the mailbox you use for it under
          <strong> Settings &rsaquo; Account &rsaquo; Email &amp; signature</strong> (it can be the same address). The Inbox, replies and the mail sync use the
          current company&rsquo;s mailbox, and disconnecting in one company leaves the others connected.
        </p>
      </section>

      {/* Finding your way */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Finding Your Way</h2>
        <p className="text-gray-600 mb-3">
          The <strong>sidebar</strong> on the left holds your daily work, in sections. You see only the links your role may open:
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Section</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Links</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">(top)</td>
                <td className="px-4 py-2.5">Dashboard &middot; Reports</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">Communicate</td>
                <td className="px-4 py-2.5">Inbox &middot; Email &middot; WhatsApp &middot; Leads &middot; Copilot &middot; Message templates</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">Sell</td>
                <td className="px-4 py-2.5">Quote Builder &middot; Quotes &middot; Itineraries &middot; Bookings &middot; Calendar</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">Operate</td>
                <td className="px-4 py-2.5">Tasks &middot; Departures &middot; Documents</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">Products</td>
                <td className="px-4 py-2.5">Tours &middot; Inventory &middot; Transport packages &middot; Extras &middot; Website</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">Suppliers &amp; rates</td>
                <td className="px-4 py-2.5">Suppliers &middot; Supplier network &middot; Rates overview &middot; Rates check, then the rate sheets in four foldable groups (Accommodation; Transport &amp; tickets; Guides &amp; services; Costs)</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">Contacts</td>
                <td className="px-4 py-2.5">Clients &middot; Partners &middot; Team</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">Finance</td>
                <td className="px-4 py-2.5">Invoices &middot; Receivables &middot; Payments &middot; Receipts &middot; Supplier bills &middot; Payables &middot; Expenses &middot; Commissions &middot; Profit &amp; loss</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mb-3">
          <strong>Settings</strong> is pinned at the bottom of the sidebar and opens the Settings area, with its own grouped menu (see{' '}
          <Link href="/docs/team-settings" className="text-primary-600 hover:underline">Team &amp; Settings</Link>). Several pages have
          tabs &mdash; Reports, Inbox, Quotes, Tasks, Departures, Suppliers, Invoices, Payments and Supplier bills &mdash; and some
          sidebar links open a tab directly (Receivables is the Unpaid tab of Invoices, for example). Each tab has its own address,
          so you can bookmark it. Old bookmarks from before the menu changed still work: they open the page or tab that took over.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The Top Bar</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Search or jump to</strong> &mdash; click it or press <strong>&#8984;K</strong> (Ctrl&nbsp;K on Windows), anywhere in the app, Settings included. Type a few letters to jump to any page you may open, any rate sheet, any setting, or a client by name. It also knows old names: &ldquo;analytics&rdquo; finds Reports, &ldquo;follow-ups&rdquo; finds the Follow-ups tab of Tasks.</li>
          <li><strong>Copilot</strong> &mdash; opens the AI Copilot&apos;s review queue in a panel over the page you are on (see <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link>)</li>
          <li><strong>The bell</strong> &mdash; your notifications</li>
          <li><strong>Account menu</strong> &mdash; your initials: <strong>Profile</strong>, <strong>Settings</strong>, <strong>Switch company</strong> (when you work for more than one) and <strong>Sign out</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">On a phone, the menu button at the top left opens the sidebar.</p>
      </section>

      {/* Roles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Role</h2>
        <p className="text-gray-600 mb-4">
          Your role is set when you are invited (admins invite managers, members and viewers; owners can also invite admins). It decides what you can see and do:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What You Can Do</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">Owner</td>
                <td className="px-4 py-3 text-gray-600">Everything an administrator can do. Only an owner can make someone an owner, change an owner&rsquo;s role or deactivate an owner</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">Administrator</td>
                <td className="px-4 py-3 text-gray-600">Everything, including the admin-only Settings pages: company, team &amp; roles, billing, pricing defaults, currencies, destinations, vocabulary, WhatsApp and Copilot settings</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">Manager</td>
                <td className="px-4 py-3 text-gray-600">All day-to-day operations plus Rates, all of Finance, Suppliers, Itineraries, Departures, Tours, Partners, the Team directory, Documents and the Finance and Copilot tabs of Reports; in Settings, the Organization, Pricing and Content &amp; AI pages not marked for admins</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">Member</td>
                <td className="px-4 py-3 text-gray-600">Day-to-day selling and service: the Inbox (Email and WhatsApp), Leads, Copilot, Message templates, the Quote Builder, B2C quotes, Bookings, the Calendar, Tasks (their own and unassigned ones) and Follow-ups, Clients, Website, the Analytics tab of Reports, and Invoices, Payments, Receipts and Expenses (adding and editing, not deleting). Itineraries open from the links in their work (a quote, a booking, a notification) but are not in their sidebar. No Rates, Suppliers, Tours, B2B quotes, Partners, Team, Departures, Documents, Receivables, Supplier bills, Payables, Commissions or P&amp;L; in Settings, the Account group (profile, email &amp; signature, notifications) and Message templates</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Viewer</td>
                <td className="px-4 py-3 text-gray-600">The Dashboard (without money), the Analytics tab of Reports, the Calendar, notifications, and their own profile and notification settings</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DocScreenshot src="/docs/getting-started/user-management.jpg" alt="Team & roles page listing users with their assigned roles" />
      </section>

      {/* Getting Help */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Getting Help</h2>
        <p className="text-gray-600">
          Every page in the app has a floating <strong>Support Chat</strong> widget in the corner. Use it to message the Autoura support team directly &mdash; you&apos;ll get an email notification when they reply, and the full conversation stays in the widget.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/getting-started" />
    </div>
  )
}
