import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function B2BPricingRulesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2B Pricing Rules</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2B Pricing Rules</h1>
      <p className="text-gray-600 mb-8">
        The <strong>Pricing Rules</strong> page (sidebar: <strong>B2B</strong> group, admin and manager roles) is where you manage tiered pricing, boat sizes, and transport packages &mdash; the configuration the B2B price calculator uses to price line items and pick vehicles. The page has two collapsible sections, each with a count badge and its own Add button: <strong>Activity Pricing Rules</strong> and <strong>Transport Packages</strong>.
      </p>

      {/* Activity Pricing Rules */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Activity Pricing Rules</h2>
        <p className="text-gray-600 mb-3">
          Each rule covers one service &mdash; it has a service name, a service category (<strong>activity</strong>, <strong>transportation</strong>, <strong>entrance</strong>, or <strong>meal</strong>), and one of three pricing models:
        </p>
        <div className="space-y-4 mb-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Per person</h3>
            <p className="text-sm text-gray-600">
              A fixed rate per traveler. The simplest model &mdash; the line total is rate &times; pax.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Per unit</h3>
            <p className="text-sm text-gray-600">
              A flat rate for a whole unit &mdash; a boat, vehicle, table, or room &mdash; with a capacity. When the group exceeds the capacity, the pricing engine automatically adds another unit. Ideal for felucca rides, private boats, and anything else priced per craft rather than per head.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Tiered</h3>
            <p className="text-sm text-gray-600">
              A volume discount across up to 4 pax tiers. Each tier has a minimum and maximum pax, a EUR rate, and a label &mdash; the defaults are <strong>Small (1&ndash;8)</strong> and <strong>Large (9&ndash;35)</strong>. The engine picks the tier the group size falls into.
            </p>
          </div>
        </div>
        <p className="text-gray-600 mb-3">
          Rules can be deactivated when a service is out of rotation, and each rule carries a notes field. On the page, tiers render as colored chips showing the pax range and rate, so a rule&rsquo;s full price ladder is readable at a glance.
        </p>
        <DocScreenshot src="/docs/b2b-pricing-rules/pricing-rules.jpg" alt="B2B Pricing Rules page with the Activity Pricing Rules section expanded, showing rules with their category, pricing model, and tier chips with pax ranges and EUR rates" />
        <ScreenshotPlaceholder caption="Add/edit Activity Pricing Rule form on /b2b/pricing-rules with the tiered model selected, showing up to 4 tiers with min/max pax, EUR rate, and label fields" />
      </section>

      {/* Transport Packages */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Transport Packages</h2>
        <p className="text-gray-600 mb-3">
          Transport Packages define your routes and their vehicle pricing. Each package has:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Code and name</strong></li>
          <li><strong>Package type</strong> &mdash; cruise sightseeing, cruise transfer, multi-day, or day tour</li>
          <li><strong>Origin and destination city</strong>, plus duration</li>
          <li><strong>Description and includes</strong></li>
          <li><strong>Five vehicle tiers</strong>, each with a rate and a capacity: sedan, minivan, van, minibus, and bus</li>
        </ul>
        <p className="text-gray-600 mb-3">
          When pricing a group, the engine automatically picks the <strong>cheapest vehicle that fits the group</strong> &mdash; 3 pax gets the sedan, 14 pax steps up to a minibus, and so on. You never assign vehicles by hand in a quote.
        </p>
        <ScreenshotPlaceholder caption="Transport Packages section on /b2b/pricing-rules — a package showing its code, type, origin/destination, and the five vehicle tiers (sedan, minivan, van, minibus, bus) with rates and capacities" />
      </section>

      {/* How they're used */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where These Rules Are Used</h2>
        <p className="text-gray-600 mb-3">
          These rules are consumed directly by the <strong>B2B price calculator</strong>: they are the configuration behind per-unit and tiered line items and behind automatic vehicle stepping. When you build a rate sheet or price a variation, the calculator reads the active rules and packages from this page.
        </p>
        <Tip>
          <strong>See it in action:</strong> the calculator itself &mdash; and how these rules turn into partner rate sheets &mdash; is documented in <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>. Quotes generated from it are covered in <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link>.
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
