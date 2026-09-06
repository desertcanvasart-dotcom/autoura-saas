import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, DocScreenshot, Tip } from '../layout'

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
          <li>Go to your Autoura URL (e.g., <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">https://autoura.net</code>)</li>
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
          If your company is new to Autoura, you can sign up directly &mdash; no invitation needed. After you create your account, a guided onboarding wizard walks you through setting up your workspace in seven steps:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-gray-700">
          <li><strong>Welcome</strong> &mdash; A quick introduction</li>
          <li><strong>Business</strong> &mdash; Your company details</li>
          <li><strong>Your words</strong> &mdash; The cities you sell, what you call your service tiers, and the kinds of suppliers you work with. Egypt&apos;s defaults are pre-filled; every dropdown in the app follows your choices, and you can change them any time in Settings &rarr; Your vocabulary</li>
          <li><strong>Branding</strong> &mdash; Logo and colors used on your documents</li>
          <li><strong>Team</strong> &mdash; Invite your teammates</li>
          <li><strong>Tour</strong> &mdash; A short tour of the app</li>
          <li><strong>Complete</strong> &mdash; You&apos;re ready to work</li>
        </ol>
        <Tip>
          The onboarding wizard is resumable &mdash; if you leave partway through, you&apos;ll pick up where you left off the next time you log in.
        </Tip>
      </section>

      {/* First-Time Setup */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Joining by Invitation</h2>
        <p className="text-gray-600 mb-3">If you received an invitation email from your team admin:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click the invitation link in the email</li>
          <li>Enter a <strong>Password</strong> and <strong>Confirm Password</strong> (minimum 8 characters)</li>
          <li>You will be taken to the dashboard</li>
        </ol>
        <Tip>
          <strong>Tip:</strong> Check your spam folder if you don&apos;t see the invitation email within a few minutes.
        </Tip>
      </section>

      {/* Roles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Role</h2>
        <p className="text-gray-600 mb-4">
          Your admin assigns you a role. Each role determines what you can see and do:
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
                <td className="px-4 py-3 font-medium text-gray-900">Administrator</td>
                <td className="px-4 py-3 text-gray-600">Everything, including the admin-only Settings area: organization settings, team management, WhatsApp configuration, billing, and user management</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">Manager</td>
                <td className="px-4 py-3 text-gray-600">All day-to-day operations plus Rates, Finance, Suppliers, Itineraries, Tour Departures, Team Members, and Tasks</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">Member</td>
                <td className="px-4 py-3 text-gray-600">Works on the clients and tasks assigned to them &mdash; communication, quotes, and bookings. Does not see Rates, Finance, or the operations management pages</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Viewer</td>
                <td className="px-4 py-3 text-gray-600">View-only access</td>
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

      {/* Next Page */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link
          href="/docs/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Dashboard
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
