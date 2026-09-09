import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function ExtrasPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Extras &amp; Upgrades</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Extras &amp; Upgrades</h1>
      <p className="text-gray-600 mb-8">
        The things a traveller can add on top of the trip &mdash; a balloon ride, a room upgrade, a
        private car for a day, travel insurance. You define them once in{' '}
        <strong>Sell &rarr; Extras</strong> and attach them to any itinerary.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Three shapes</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Add-ons</strong> &mdash; an extra bought alongside the trip (a balloon ride, an extra excursion).</li>
          <li><strong>Upgrades</strong> &mdash; paying up from what is included (a higher room category, a better cabin).</li>
          <li><strong>Options</strong> &mdash; a choice between alternatives at the same tier.</li>
        </ul>
        <ScreenshotPlaceholder caption="The Extras list, with add-ons, upgrades and options" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Priced off-margin</h2>
        <p className="text-gray-600 mb-3">
          Extras are priced <strong>off-margin</strong> &mdash; the price you set is the price the
          traveller pays, not a cost the app then marks up. That keeps a clean, published price for a
          balloon ride the same whether it rides on a high-margin trip or a low-margin one.
        </p>
        <p className="text-gray-600">
          Each row carries its <strong>own currency</strong>, so an insurance product priced in yen
          and an excursion priced in dollars can sit side by side and each bills in its own money.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Attaching them to a trip</h2>
        <p className="text-gray-600 mb-3">
          From an <Link href="/docs/itineraries" className="text-primary-600 hover:underline">itinerary</Link>,
          pick the extras the traveller wants; they appear on the quote and the invoice as their own
          lines, separate from the trip price.
        </p>
        <Tip>
          Because extras sit outside the margin maths, they are the right home for anything you resell
          at a fixed published price &mdash; insurance especially.
        </Tip>
      </section>
    </div>
  )
}
