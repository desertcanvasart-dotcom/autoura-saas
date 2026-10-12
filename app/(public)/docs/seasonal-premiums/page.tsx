import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'
import { DocPager } from '../pager'

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
        Some dates sell out &mdash; Christmas, New Year, Easter, a local festival. A seasonal premium is the extra you
        decide to charge for travelling then, without touching a single supplier rate.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A premium on the selling price</h2>
        <p className="text-gray-600 mb-3">
          The premium is a percentage of the <strong>whole selling price, after your margin</strong> &mdash; it never
          touches costs. That is different from a hotel or cruise rate period, which is what the supplier charges you on a
          date and is already in their rate. A rate period is the supplier&rsquo;s contract; a premium is your own decision on top.
        </p>
        <p className="text-gray-600">
          In the <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Calculator</Link>, a departure in a
          season shows the premium as its own line, with the season&rsquo;s name, and the total includes it. Your margin is
          reported without it. Quotes built from an itinerary and B2C prices do not apply premiums yet.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Setting up a season</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Settings &rarr; Seasonal Premiums</strong> (the <strong>Demand calendar</strong>; admins and managers):
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Add a <strong>season</strong> &mdash; a name (e.g. &ldquo;New Year&rdquo;) and a premium between 0 and 200%.</li>
          <li>Give it one or more <strong>dated windows</strong>: From, To and an optional label (e.g. &ldquo;New Year 2026/27&rdquo;). The dates carry the year, so add next year&rsquo;s window when you know it.</li>
          <li><strong>Edit</strong> changes the premium or the name; windows and seasons can be removed.</li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Which trips it applies to</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>The departure date</strong> decides. A trip that leaves before a window and runs into it is an ordinary departure.</li>
          <li><strong>Overlapping windows</strong> &mdash; the higher premium wins; they are never added together.</li>
          <li>The date you quote does not matter: a Christmas trip quoted in July still takes the December premium.</li>
        </ul>
        <Tip>
          Keep a broad &ldquo;Winter peak&rdquo; at a small premium and a short &ldquo;New Year&rdquo; window at a higher one: departures
          in the New Year window take the higher premium, the rest of winter the lower.
        </Tip>
      </section>

      <DocPager href="/docs/seasonal-premiums" />
    </div>
  )
}
