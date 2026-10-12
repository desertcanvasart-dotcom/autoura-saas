import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/itinerary-creation')

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
        Trips are built and priced in one place: the <strong>Quote Builder</strong> (Sell &rarr; Quote Builder). Paste a client&apos;s request, upload a file, or load an itinerary; the AI lays out the days, and every day is priced from your rates as you go.
      </p>

      {/* Entry points */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Ways In</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Parse</strong> on a WhatsApp conversation, or the purple sparkles icon on an email in the Inbox &mdash; the Quote Builder opens and reads the conversation</li>
          <li><strong>New Quote</strong> on the B2C or B2B Quotes page &mdash; opens it in that mode</li>
          <li>From a client&apos;s page &mdash; opens it for that client</li>
          <li><strong>Price in Grid</strong> in the itinerary editor &mdash; opens that itinerary</li>
          <li><strong>Quote Builder</strong> in the sidebar</li>
        </ul>
        <Tip>
          Your work in the Quote Builder is kept in this browser until you save, so a closed tab does not lose it.
        </Tip>
      </section>

      {/* Settings */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Trip Settings</h2>
        <p className="text-gray-600 mb-3">The header holds the settings the whole trip is priced with:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Pax</strong> &mdash; The number of travellers</li>
          <li><strong>Start</strong> &mdash; The start date: hotels are priced from the rate period that covers it</li>
          <li><strong>EU</strong> / <strong>Non-EU</strong> &mdash; Passport, for entrance fees (Non-EU to start)</li>
          <li><strong>Tier</strong> &mdash; Your tiers (Budget, Standard, Deluxe, Luxury, or your own names); it picks the hotels and cruises offered</li>
          <li><strong>Guide</strong> / <strong>No Guide</strong> &mdash; No Guide removes the guide and the guide&apos;s tips. <strong>Spot</strong> or <strong>Throughout +1</strong> (one guide for the whole trip, with his bed, meals and flight seats), and the <strong>Guide language</strong>, which every day&apos;s guide follows.</li>
          <li><strong>B2C</strong> / <strong>B2B</strong> (Pricing) &mdash; Switching resets the markup to 25% or 10%; in B2B, <strong>Select Partner&hellip;</strong> takes the partner&apos;s default margin</li>
          <li><strong>Currency</strong> &mdash; Shows the prices in any of 12 currencies; the trip is saved in your rates&apos; currency</li>
          <li><strong>Markup %</strong> &mdash; Your margin on cost</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Below it, <strong>Client &amp; Trip Details</strong> hold the tour name and the client&apos;s name, email, phone and nationality, with a <strong>CRM client</strong> tag when the trip is linked to a client.
        </p>
      </section>

      {/* Input */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Starting the Days</h2>
        <p className="text-gray-600 mb-3">
          First choose the <strong>Package Type</strong> &mdash; Day Trips, Tours Only, Land Package, Full Package, Cruise + Land, or Shore Excursions &mdash; so the AI knows what the client is buying. Then:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Paste Text</strong> &mdash; Paste the request and click <strong>Parse &amp; Generate Quote</strong>. A vague request gets an AI-suggested trip, marked so, for you to review.</li>
          <li><strong>Upload</strong> &mdash; A PDF, an image (PNG, JPG, WebP) or a Word file (.docx), up to 32 MB; click <strong>Extract &amp; Generate Quote</strong></li>
          <li><strong>Load / Build</strong> &mdash; Load a saved itinerary by its ID, add a day, or start a <strong>Day from block</strong> &mdash; one of your saved day blocks</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The AI fills in the days and their cities, the travellers, start date, nationality, tour name and client name. It reads WhatsApp messages, emails, day-by-day plans, PDFs and photos, and the common travel shorthand.
        </p>
        <DocScreenshot src="/docs/itinerary-creation/parser-review.jpg" alt="The Quote Builder with its settings header and the Paste Text, Upload and Load / Build inputs" />
      </section>

      {/* Slots */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Days and Their Services</h2>
        <p className="text-gray-600 mb-3">Each day has fifteen services:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>For the group</strong> &mdash; Transport, Guide, Airport services, Hotel services, Tipping, Boat rides, Other (Group)</li>
          <li><strong>Per person</strong> &mdash; Accommodation, Entrance fees, Flights, Experiences, Meals, Water, Nile cruise, Other (PP)</li>
        </ul>
        <p className="text-gray-600 mt-3 mb-3">
          Empty services are hidden: <strong>Add service</strong> brings one in, <strong>Show all services</strong> shows them all. Pick a rate from the list (filtered to the day&apos;s city), or remove it; <strong>Other (Group)</strong> and <strong>Other (PP)</strong> take a typed amount. Picking a hotel adds its meals by its board basis.
        </p>
        <p className="text-gray-600">
          Each day has a type &mdash; arrival, sightseeing, travel, cruise, free or departure &mdash; and can be saved as a day block to reuse. <strong>Expand All</strong> / <strong>Collapse All</strong> and the day bar move you around the trip.
        </p>
      </section>

      {/* Writing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Writing the Days</h2>
        <p className="text-gray-600 mb-3">
          Each day&apos;s title and description are what the client reads in the itinerary, the share page and the PDF. <strong>Write descriptions</strong> (above the days) writes them from what each day includes and your <Link href="/docs/content-library" className="text-primary-600 hover:underline">Content Library</Link>, in your Writing Rules:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It writes only the days with no description, so your own words stay. A title you chose is kept; &ldquo;Day 3&rdquo; or just the city is replaced.</li>
          <li><strong>Rewrite from library</strong> under a day&apos;s description writes that day again, after asking.</li>
          <li>After <strong>Parse</strong>, the days carry the parser&apos;s brief descriptions, and you are offered to write them all from your library instead.</li>
          <li>Under each written day, <em>From your library</em> names the entries it used. Anything picked that your library has no entry for is listed above the days, to add to the Content Library.</li>
          <li>The text never mentions prices, and only describes what the day includes. Edit it freely; <strong>Save</strong> stores it. Each run counts as one AI generation.</li>
        </ul>
      </section>

      {/* Pricing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Price</h2>
        <p className="text-gray-600">
          Once something is priced, the <strong>Live Quote</strong> strip shows Cost/PP, Total Cost, the Margin, Sell/PP and Sell Total, and the bar at the bottom repeats them beside the save button. How the price is built: <Link href="/docs/b2c-pricing" className="text-primary-600 hover:underline">B2C Pricing</Link>.
        </p>
      </section>

      {/* Saving */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Saving</h2>
        <p className="text-gray-600 mb-3">
          <strong>Save as Itinerary</strong> (B2C) or <strong>Save as B2B Quote</strong> saves the trip as an itinerary (code <strong>ITN-S-2026-&hellip;</strong>) with its days and services. When you save:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Every service is priced from your rates as they are now. If a rate changed since you picked it, the trip is saved at today&apos;s rate and you are told which; a line whose rate is gone keeps its price, and you are told that too.</li>
          <li>In B2C, the client is linked or added to your clients as a Lead, and a <strong>B2C quote</strong> is made &mdash; or the itinerary&apos;s open quote is repriced</li>
          <li>In B2B, the B2B quote and a tour template are made and the B2B Calculator opens (see <Link href="/docs/b2b-import" className="text-primary-600 hover:underline">Converting Itineraries to B2B</Link>)</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Afterwards the button reads <strong>Update itinerary &amp; quote</strong> (with the price change) or <strong>Update B2B Quote</strong>, and links such as <strong>View Itinerary</strong> and <strong>View quote</strong> take you there.
        </p>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/itinerary-creation" />
    </div>
  )
}
