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
          <li><strong>Your words</strong> &mdash; The cities you sell, what you call your service tiers, and the kinds of suppliers you work with. Egypt&apos;s defaults are pre-filled; every dropdown in the app follows your choices, and an admin can change them any time in Settings &rarr; Your Vocabulary</li>
          <li><strong>Branding</strong> &mdash; Logo and colors used on your documents</li>
          <li><strong>Team</strong> &mdash; Invite your teammates: each gets an invitation email (if one cannot be sent, you are shown the link to pass on). Optional &mdash; you can invite people later from User Management</li>
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
          One login can belong to several companies, with a different role in each. When it does, a <strong>Company</strong>
          picker appears in the sidebar under your role: choose a company and Autoura reloads in it &mdash; its clients, trips,
          rates, settings and your role there. Autoura remembers your choice the next time you sign in.
        </p>
        <p className="text-gray-600">
          If you are deactivated in the company you chose, you are taken to your next company automatically.
        </p>
        <p className="text-gray-600 mt-3">
          Your Gmail is connected per company: in each company, connect the mailbox you use for it under
          <strong> Settings &rarr; Email</strong> (it can be the same address). The Inbox, replies and the mail sync use the
          current company&rsquo;s mailbox, and disconnecting in one company leaves the others connected.
        </p>
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
                <td className="px-4 py-3 text-gray-600">Everything, including the admin-only Settings area: organization, vocabulary, destinations, WhatsApp, Copilot, billing and user management</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">Manager</td>
                <td className="px-4 py-3 text-gray-600">All day-to-day operations plus Rates, Finance, Suppliers, Itineraries, Tour Departures, Team Members, and Tasks</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">Member</td>
                <td className="px-4 py-3 text-gray-600">Day-to-day selling and service: Inbox and WhatsApp, the Quote Builder, B2C Quotes, Bookings, the Booking Calendar, Follow-ups, Clients, and Invoices, Payments, Receipts and Expenses (adding and editing, not deleting). Itineraries and Tasks open from the links in their work (a quote, a booking, a notification) but are not in their sidebar. No Rates, Suppliers, Tours, B2B, Partners, Team Members, Documents, Reports, Receivables, Payables, Commissions or P&amp;L; in Settings, only their own profile, email and signatures</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Viewer</td>
                <td className="px-4 py-3 text-gray-600">The Dashboard (without money), Analytics, Notifications and their own profile</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DocScreenshot src="/docs/getting-started/user-management.jpg" alt="User management page listing team members with their assigned roles" />
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
