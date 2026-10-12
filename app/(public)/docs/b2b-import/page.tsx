import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/b2b-import')

export default function B2BImportPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Converting Itineraries to B2B</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Converting Itineraries to B2B</h1>
      <p className="text-gray-600 mb-8">
        Any trip you build in the <strong>Quote Builder</strong> (the pricing grid) &mdash; including one that started as a B2C itinerary &mdash; can become a B2B offer for your partners: a B2B quote with a price for every group size, and a tour template you can price again in the B2B Calculator. There is no separate import: it happens when you save the grid in B2B mode.
      </p>

      {/* Flow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">From the Quote Builder</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open <strong>Quote Builder</strong> (Sell group) &mdash; or <strong>New Quote</strong> on the B2B Quotes page, which opens it in B2B mode</li>
          <li>In the <strong>Pricing</strong> group of the header, switch <strong>B2C</strong> to <strong>B2B</strong>. The markup resets to 10%. Optionally <strong>Select Partner&hellip;</strong> &mdash; the partner&apos;s default margin is then used for the quote.</li>
          <li>Build the trip, or load an existing itinerary</li>
          <li>Click <strong>Save as B2B Quote</strong> (<strong>Update B2B Quote</strong> once the itinerary has been saved)</li>
        </ol>
        <ScreenshotPlaceholder caption="Quote Builder in B2B mode with a partner selected, the Margin figure, and the Save as B2B Quote button" />
      </section>

      {/* What happens */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What Saving Does</h2>
        <ol className="list-decimal list-inside space-y-3 text-gray-700">
          <li>
            <strong>Saves the itinerary</strong>, pricing every line from your rates as they are today.
          </li>
          <li>
            <strong>Creates the B2B quote</strong> &mdash; or, when the trip already has one in Draft or Sent, reprices that one (the quote&apos;s history keeps the earlier version). Lines the grid priced keep their cost; any line without one is looked up in your rates. The quote&apos;s partner price list covers 2, 4, 6, 8, 10, 12, 15, 20, 25 and 30 travellers plus the trip&apos;s own group size, each priced from your rates at the quote&apos;s margin. The season is set from the start date: December&ndash;April high, July&ndash;August peak, otherwise low.
          </li>
          <li>
            <strong>Creates a tour template and variation</strong> (once per trip; saving again updates the same template) at the trip&apos;s tier, in <strong>Tours &rarr; Tour Manager</strong>: the day structure &mdash; cities, meals (breakfast included; lunch and dinner from the meal services), cruise days, and each night&apos;s hotel or cruise. The specific hotels and prices are not copied.
          </li>
          <li>
            <strong>Opens the B2B Calculator</strong> on the variation and on this quote (its button reads <strong>Update Quote</strong>, and saving there reprices the same quote), a second later, with the message <em>&ldquo;Saved as &hellip; + B2B Quote &hellip; &mdash; Redirecting to B2B Calculator&hellip;&rdquo;</em>. See <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>.
          </li>
        </ol>
        <ScreenshotPlaceholder caption="The save message: Saved as … + B2B Quote … — Redirecting to B2B Calculator, with the View B2B Quote link" />
      </section>

      {/* Failures */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">When It Stops Short</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>A line has no rate</strong> &mdash; The itinerary is saved, but no quote is made: <em>&ldquo;B2B quote not created: Incomplete pricing &mdash; N item(s) have no usable rate&rdquo;</em>, with the lines listed. Add the missing rates and save again.</li>
          <li><strong>The template could not be made</strong> &mdash; The itinerary and quote are saved; the message ends <em>&ldquo;(template creation: &hellip;)&rdquo;</em> and there is no redirect.</li>
        </ul>
      </section>

      {/* From B2C */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Converting an Existing Itinerary</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>In the itinerary editor, click <strong>Price in Grid</strong>. The itinerary is saved and opens in the Quote Builder.</li>
          <li>Switch to <strong>B2B</strong>, pick a partner if you like, and click <strong>Update B2B Quote</strong></li>
        </ol>
        <p className="text-gray-600 mt-3">The itinerary itself is updated; its B2C quote stays as it was.</p>
        <ScreenshotPlaceholder caption="Itinerary editor showing the Price in Grid button" />
      </section>

      {/* Where */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where to Find It</h2>
        <p className="text-gray-600">
          The quote is in <strong>Sell &rarr; B2B Quotes</strong>, with the quotes saved from the calculator; the template is in <strong>Tours &rarr; Tour Manager</strong>. Both, and the B2B Calculator, are for managers and admins.
        </p>
        <Tip>
          A trip has one B2B quote and one template: saving again updates them while the quote is a Draft or Sent. Once it is Accepted, Rejected or Expired, the next save makes a new quote.
        </Tip>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/b2b-import" />
    </div>
  )
}
