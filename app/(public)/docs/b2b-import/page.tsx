import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

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
        Any itinerary you build in the pricing grid &mdash; including one that started life as a B2C quote &mdash; can be converted into the full B2B stack: a B2B quote, a tour template with a variation, and a partner rate sheet. There is no separate import wizard; the conversion happens when you save the grid in B2B mode.
      </p>

      {/* The flow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Conversion Flow</h2>
        <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-4">
          <li>
            <strong>Open the Pricing Grid</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/pricing-grid</code>) &mdash; the same grid documented in <Link href="/docs/itinerary-creation" className="text-primary-600 hover:underline">Itinerary Creation</Link>.
          </li>
          <li>
            <strong>Set Client Type to B2B.</strong> Optionally pick a partner &mdash; the partner&rsquo;s default margin percentage is applied to the quote.
          </li>
          <li>
            <strong>Build or load the itinerary</strong> day by day, as you would for any quote.
          </li>
          <li>
            <strong>Click Save as B2B Quote.</strong>
          </li>
        </ol>
        <ScreenshotPlaceholder caption="Pricing grid at /pricing-grid with Client Type set to B2B and a partner selected — showing the partner's margin applied and the Save as B2B Quote button" />
        <p className="text-gray-600 mb-3">On save, the system does three things:</p>
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">1. Re-prices against B2B rates</h3>
            <p className="text-sm text-gray-600">
              Every service is re-priced against the B2B rate tables and a B2B quote is created, with the season derived from the travel date.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">2. Creates a tour template + variation</h3>
            <p className="text-sm text-gray-600">
              The itinerary&rsquo;s days and services are converted into a tour template with a variation at the tier you chose. Meals are inferred from meal services, cruise days from cruise services, and the accommodation type is set per day. See <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Programs</Link> for what templates and variations are.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">3. Redirects to the B2B Calculator</h3>
            <p className="text-sm text-gray-600">
              A confirmation appears &mdash; &ldquo;Saved as &hellip; + B2B Quote &hellip; &mdash; Redirecting to B2B Calculator&rdquo; &mdash; and the B2B Calculator opens for the new variation, so you can generate partner rate sheets straight away. The calculator is documented in <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>.
            </p>
          </div>
        </div>
        <ScreenshotPlaceholder caption="Save confirmation on /pricing-grid after Save as B2B Quote — the 'Saved as … + B2B Quote … — Redirecting to B2B Calculator' message with the link to the created quote" />
      </section>

      {/* Converting an existing B2C itinerary */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Converting an Existing B2C Itinerary</h2>
        <p className="text-gray-600 mb-3">
          You don&rsquo;t have to build from scratch. Load an existing B2C itinerary into the grid in either of two ways, then follow the same flow &mdash; switch Client Type to B2B and Save as B2B Quote:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>From the itinerary editor, click <strong>Price in Grid</strong> &mdash; the grid opens with the itinerary pre-loaded.</li>
          <li>In the grid&rsquo;s input panel, enter the itinerary&rsquo;s ID to load it.</li>
        </ul>
        <ScreenshotPlaceholder caption="Itinerary editor showing the Price in Grid button that opens the pricing grid with the itinerary pre-loaded" />
      </section>

      {/* Caveats */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Two Things to Know</h2>
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Where the quote lands</h3>
            <p className="text-sm text-gray-600">
              Quotes created this way appear at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/quotes/b2b</code> &mdash; reachable from the save confirmation, not from the sidebar. They do <strong>not</strong> appear under <strong>B2B &rarr; Quotes</strong>, which lists only quotes saved from the B2B Calculator itself. See <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link> for that list.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">If template creation fails</h3>
            <p className="text-sm text-gray-600">
              If the tour template can&rsquo;t be created, the save message says so and no redirect happens. Your itinerary and the B2B quote still exist &mdash; only the template step failed.
            </p>
          </div>
        </div>
        <Tip>
          <strong>Keep the confirmation open</strong> until you&rsquo;ve followed its links &mdash; it&rsquo;s the direct route to both the new quote at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/quotes/b2b</code> and the B2B Calculator for the new variation.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
      </div>
    </div>
  )
}
