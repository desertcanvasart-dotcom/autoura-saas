import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function CommunicationPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Communication</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Communication</h1>

      {/* WhatsApp Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp Inbox</h2>
        <p className="text-gray-600 mb-4">
          Manage all your WhatsApp business conversations in one place. When a client sends a message to your business WhatsApp number, it appears in the inbox automatically.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Using the Inbox</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>WhatsApp Inbox</strong> in the sidebar</li>
          <li>The left panel shows all conversations with the latest message preview</li>
          <li>Click a conversation to open the full chat on the right</li>
          <li>Type your reply at the bottom and press <strong>Send</strong></li>
        </ol>
        <DocScreenshot src="/docs/communication/whatsapp-inbox.jpg" alt="WhatsApp inbox with conversation list on left and active chat on right" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Features</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Assign to Agent</strong> &mdash; Route the conversation to a specific team member</li>
          <li><strong>Quick Replies</strong> &mdash; Use pre-written responses for common questions</li>
          <li><strong>Language</strong> &mdash; Select the reply language for multilingual clients</li>
          <li><strong>Link Client</strong> &mdash; Connect the conversation to an existing client record</li>
          <li><strong>Create Client</strong> &mdash; Create a new client directly from the conversation</li>
          <li><strong>Send Documents</strong> &mdash; Send quotes, invoices, contracts, and receipts</li>
        </ul>
        <Tip>
          WhatsApp is two-way: clients can reply to your messages and those replies appear in your inbox automatically.
        </Tip>
      </section>

      {/* WhatsApp Parser */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp Parser (AI)</h2>
        <p className="text-gray-600 mb-4">
          The AI parser reads a WhatsApp conversation and extracts all the trip details automatically. This is the fastest way to turn a client inquiry into a professional quote.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">How to Use It</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>From the Dashboard, click <strong>Parse WhatsApp</strong> (or go to <strong>WhatsApp Parser</strong> in the sidebar)</li>
          <li>Paste the WhatsApp conversation text</li>
          <li>Click <strong>Parse</strong></li>
          <li>The AI extracts:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li>Client name, email, phone</li>
              <li>Nationality and passport type</li>
              <li>Desired travel dates</li>
              <li>Number of travelers (adults, children, infants)</li>
              <li>Destinations and interests</li>
              <li>Budget range</li>
              <li>Special requests</li>
            </ul>
          </li>
          <li>Review the extracted information</li>
          <li>Click <strong>Create Itinerary</strong> to generate a complete itinerary with pricing</li>
        </ol>
        <ScreenshotPlaceholder caption="WhatsApp Parser showing pasted conversation on left and AI-extracted trip details on right" />
      </section>

      {/* Email Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Inbox</h2>
        <p className="text-gray-600 mb-4">
          Manage your business emails directly within Autoura.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Connecting Gmail</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Settings &gt; Email</strong></li>
          <li>Click <strong>Connect Gmail</strong></li>
          <li>Sign in with your Google account and grant access</li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Using the Inbox</h3>
        <p className="text-gray-600 mb-3">
          Go to <strong>Inbox</strong> in the sidebar to see your emails. You can:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Read and reply with a rich text editor (formatting, links, images)</li>
          <li>Send new emails</li>
          <li>View email threads</li>
          <li>Use Gmail labels for organization</li>
          <li>Download attachments</li>
          <li>Link emails to client records</li>
        </ul>
        <ScreenshotPlaceholder caption="Email inbox showing email list and compose window with rich text editor" />
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link
          href="/docs/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Dashboard
        </Link>
        <Link
          href="/docs/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          Next: Clients
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
