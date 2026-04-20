import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, DocScreenshot, Tip } from '../layout'

export default function ItineraryCreationPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Itinerary Creation</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Itinerary Creation</h1>
      <p className="text-gray-600 mb-8">
        Autoura offers two connected paths for creating itineraries. The <strong>WhatsApp Parser</strong> extracts client details from a conversation and hands off to the <strong>Pricing Grid</strong>, where you build the full day-by-day itinerary with services, rates, and live pricing.
      </p>

      {/* Two Paths */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Two Entry Points</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">WhatsApp Parser</h3>
            <p className="text-sm text-gray-600 mb-2">Paste a conversation to extract client metadata &mdash; name, nationality, dates, group size, and budget level. The parser then redirects to the Pricing Grid with the conversation pre-loaded.</p>
            <p className="text-xs text-gray-400">Sidebar: Communication &rarr; WhatsApp Parser</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Pricing Grid</h3>
            <p className="text-sm text-gray-600 mb-2">The full itinerary builder. Accepts text, file uploads, or existing itineraries. AI parses input into a day-by-day grid with 14+ service slots, each linked to your rate tables.</p>
            <p className="text-xs text-gray-400">Sidebar: Operations &rarr; Pricing Grid</p>
          </div>
        </div>
        <Tip>
          <strong>Quick start:</strong> You can go directly to the Pricing Grid without the WhatsApp Parser. Paste text, upload a file, or load an existing itinerary &mdash; the Grid handles all three.
        </Tip>
      </section>

      {/* Settings Bar */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Trip Settings</h2>
        <p className="text-gray-600 mb-3">
          The settings bar at the top of the Pricing Grid controls all pricing calculations:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Setting</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What It Does</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">PAX</td>
                <td className="px-4 py-2 text-gray-600">Number of travelers. Affects vehicle selection, per-person costs, and accommodation splits.</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2 font-medium text-gray-900">Start Date</td>
                <td className="px-4 py-2 text-gray-600">Trip start date. Determines seasonal pricing (low, high, peak) for hotels and cruises.</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">Passport Type</td>
                <td className="px-4 py-2 text-gray-600">EU or Non-EU. Entrance fees and some services have different rates by passport.</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2 font-medium text-gray-900">Tier</td>
                <td className="px-4 py-2 text-gray-600">Budget, Standard, Deluxe, or Luxury. Controls which hotels, restaurants, and service levels are used.</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">Pricing Mode</td>
                <td className="px-4 py-2 text-gray-600">B2C (direct to client) or B2B (for partner). B2B mode enables partner selection and rate sheet generation.</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2 font-medium text-gray-900">Currency</td>
                <td className="px-4 py-2 text-gray-600">EUR, USD, GBP, or EGP. All rates are converted and displayed in the selected currency.</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium text-gray-900">Markup %</td>
                <td className="px-4 py-2 text-gray-600">Your profit margin. Applied to the total cost to calculate the selling price.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          Changing any setting instantly recalculates the live quote &mdash; cost per person, total cost, margin, sell per person, and sell total.
        </p>
      </section>

      {/* Input Methods */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Three Input Methods</h2>
        <p className="text-gray-600 mb-4">
          At the bottom of the Pricing Grid, three input methods are available side by side:
        </p>

        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">1. Paste Text</h3>
            <p className="text-sm text-gray-600">
              Paste a WhatsApp conversation, email, or tour operator shorthand. The AI reads the text, identifies cities, activities, and services, and builds a day-by-day grid with each service slot mapped to actual rates from your database.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">2. Upload File</h3>
            <p className="text-sm text-gray-600">
              Drag and drop a PDF, image (PNG, JPG, WebP), or DOCX file. The AI extracts text using vision and then parses it into the same grid format. Useful for scanned tour requests or emailed itineraries.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">3. Load / Build</h3>
            <p className="text-sm text-gray-600">
              Enter an itinerary ID to load an existing itinerary for editing or repricing. Or click <strong>+</strong> to add days manually and build from scratch without AI.
            </p>
          </div>
        </div>

        <DocScreenshot src="/docs/itinerary-creation/parser-review.jpg" alt="Pricing Grid showing trip settings, live quote, client details, and the three input methods" />
      </section>

      {/* Service Slots */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Day-by-Day Service Slots</h2>
        <p className="text-gray-600 mb-3">
          After AI parses the input, each day is displayed as an expandable card with up to 14 service slots:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Route</strong> &mdash; Transportation between cities</li>
          <li><strong>Guide</strong> &mdash; Tour guide for the day</li>
          <li><strong>Accommodation</strong> &mdash; Hotel or cruise cabin for overnight</li>
          <li><strong>Meals</strong> &mdash; Lunch and dinner by tier</li>
          <li><strong>Entrance Fees</strong> &mdash; Attraction tickets (EU/Non-EU rates)</li>
          <li><strong>Activities</strong> &mdash; Optional excursions and experiences</li>
          <li><strong>Flights</strong> &mdash; Domestic flights between cities</li>
          <li><strong>Cruise</strong> &mdash; Nile cruise rates by cabin type and season</li>
          <li><strong>Airport Services</strong> &mdash; Meet and greet, VIP lounge</li>
          <li><strong>Tipping</strong> &mdash; Tips for guide, driver, and staff</li>
          <li><strong>Supplies</strong> &mdash; Water and sundries</li>
        </ul>
        <p className="text-gray-600">
          Each slot shows the selected rate from your database. Click any slot to expand it, change the selection, or override the price manually.
        </p>
        <Tip>
          <strong>Auto-pricing:</strong> The AI maps each service to the best matching rate in your database. You only need to edit slots where the AI guessed wrong or where you want a different option.
        </Tip>
      </section>

      {/* Live Pricing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Live Pricing</h2>
        <p className="text-gray-600 mb-3">
          The quote bar updates in real time as you edit. It shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Cost/PP</strong> &mdash; Total supplier cost per person</li>
          <li><strong>Total Cost</strong> &mdash; Cost for all travelers</li>
          <li><strong>Margin</strong> &mdash; Your profit based on the markup percentage</li>
          <li><strong>Sell/PP</strong> &mdash; Selling price per person</li>
          <li><strong>Sell Total</strong> &mdash; Total selling price for the group</li>
        </ul>
        <p className="text-sm text-gray-500 mt-3">
          Change PAX, tier, dates, or currency and the entire quote recalculates instantly.
        </p>
      </section>

      {/* Saving */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Saving the Itinerary</h2>
        <p className="text-gray-600 mb-3">
          When you&apos;re satisfied with the itinerary and pricing, saving creates:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>An <strong>itinerary record</strong> with a unique code (e.g., ITN-S-2026-024)</li>
          <li>All <strong>days and services</strong> stored in the database for future editing</li>
          <li>A <strong>client record</strong> created or linked automatically</li>
        </ul>

        <h3 className="font-semibold text-gray-900 mt-4 mb-2">B2B Output</h3>
        <p className="text-gray-600">
          When pricing mode is set to B2B with a partner selected, saving also creates a <strong>B2B quote</strong> and <strong>tour template</strong>, then redirects to the B2B Calculator for rate sheet generation (1&ndash;40 pax).
        </p>
      </section>

      {/* Supported Formats */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the AI Understands</h2>
        <p className="text-gray-600 mb-3">
          The parser handles a wide range of input formats:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>WhatsApp conversations</strong> &mdash; Copy-paste directly, including multi-message threads</li>
          <li><strong>Emails</strong> &mdash; Full email text including headers</li>
          <li><strong>Tour operator shorthand</strong> &mdash; &ldquo;3NTS CAI + 4NTS CRZ + 2NTS HRG&rdquo;</li>
          <li><strong>Structured day plans</strong> &mdash; &ldquo;D1 CAI/ALX/CAI&rdquo;, &ldquo;D2 CAI - Pyramids&rdquo;</li>
          <li><strong>PDF itineraries</strong> &mdash; Scanned or digital PDFs via file upload</li>
          <li><strong>Photos of handwritten requests</strong> &mdash; Images parsed via AI vision</li>
        </ul>
        <Tip>
          <strong>200+ abbreviations:</strong> The system automatically decodes travel abbreviations &mdash; CAI (Cairo), ALX (Alexandria), ASW (Aswan), LXR (Luxor), HRG (Hurghada), CRZ (Cruise), VoK (Valley of the Kings), BB (Bed &amp; Breakfast), and many more.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/clients" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Clients (CRM)
        </Link>
        <Link href="/docs/itineraries" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Itineraries
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
