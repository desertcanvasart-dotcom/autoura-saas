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
          You can also sign in with your Google account by clicking the Google button.
        </p>
        <DocScreenshot src="/docs/getting-started/login-page.jpg" alt="Login page with email, password fields, and Google sign-in button" />
      </section>

      {/* First-Time Setup */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">First-Time Setup</h2>
        <p className="text-gray-600 mb-3">If you received an invitation email from your team admin:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click the invitation link in the email</li>
          <li>Set your password</li>
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
                <td className="px-4 py-3 font-medium text-gray-900">Admin</td>
                <td className="px-4 py-3 text-gray-600">Everything: settings, users, rates, finances, and all operations</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">Manager</td>
                <td className="px-4 py-3 text-gray-600">Rates, team members, financial reports, clients, itineraries, invoices, tours</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">Agent</td>
                <td className="px-4 py-3 text-gray-600">Clients, itineraries, invoices, payments, tasks, inbox, WhatsApp, tours</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">Viewer</td>
                <td className="px-4 py-3 text-gray-600">View-only: dashboard, analytics, calendar, notifications</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DocScreenshot src="/docs/getting-started/user-management.jpg" alt="User management page showing roles and permissions" />
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
