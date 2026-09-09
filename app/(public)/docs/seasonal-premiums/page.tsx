import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function SeasonalPremiumsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Seasonal Premiums</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Seasonal Premiums</h1>
      <p className="text-gray-600 mb-8">
        Some dates are simply worth more &mdash; Christmas, New Year, cherry-blossom week, a local
        festival. A seasonal premium is your way of saying &ldquo;anything travelling in this window
        costs a bit more&rdquo; without touching a single supplier rate.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A premium on the whole price</h2>
        <p className="text-gray-600 mb-3">
          A seasonal premium is applied to the <strong>whole trip price, after your margin</strong>
          &mdash; not to the underlying costs. Set a window and a percentage in{' '}
          <strong>Settings &rarr; Seasonal Premiums</strong>, and any quote whose travel dates fall
          in that window is lifted by that percentage automatically.
        </p>
        <p className="text-gray-600">
          This is deliberately different from a hotel or cruise rate period, which changes what a
          specific supplier <em>costs</em> on a given date. A rate period is the supplier&rsquo;s
          contract; a seasonal premium is your commercial decision on top of it.
        </p>
        <ScreenshotPlaceholder caption="Seasonal premium windows with their dates and percentages" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Dated windows</h2>
        <p className="text-gray-600 mb-3">
          Each premium is a dated window &mdash; a From date, a To date and a percentage &mdash; and
          you can add as many as the year needs. The dates carry the year, so a premium written for
          this year&rsquo;s peak does not silently apply to next year&rsquo;s.
        </p>
        <Tip>
          A trip is matched by its travel date, not the date you quote it. Quote a Christmas trip in
          July and it still picks up the December premium.
        </Tip>
      </section>
    </div>
  )
}
