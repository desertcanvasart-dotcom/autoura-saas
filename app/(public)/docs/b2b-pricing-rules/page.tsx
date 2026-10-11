import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'
import { DocPager } from '../pager'

export default function TransportPackagesDocsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Transport Packages</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Transport Packages</h1>
      <p className="text-gray-600 mb-8">
        A transport package is one price per vehicle for a stretch of a trip: the vehicle that stays
        with a cruise group for its sightseeing, the transfers around a sailing, a day tour, or a
        multi-day road journey. Find it under{' '}
        <strong>Tours &rarr; Transport Packages</strong> (admins and managers). Ordinary transfers and
        day tours are priced from <strong>Rates &rarr; Transportation</strong> instead (see{' '}
        <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Tours &amp; Rates</Link>).
      </p>

      <Tip>
        <strong>Looking for activity pricing?</strong> Per-person, per-unit, flat and tiered rates for
        activities and add-ons live under <strong>Suppliers &amp; Rates &rarr; Guides &amp; Services &rarr;
        Activities</strong> (the <strong>Activities &amp; Add-ons</strong> page), the one catalogue the
        whole app prices from. The old &ldquo;Activity Pricing Rules&rdquo; were retired in its favour.
      </Tip>

      {/* What a package holds */}
      <section className="mb-10 mt-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a package holds</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Add Package</strong>, or the edit icon on a package, and fill in:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Package name</strong> (required). A code is given automatically.</li>
          <li><strong>Package type</strong> &mdash; Cruise Sightseeing, Cruise Transfer, Multi-Day Tour or Day Tour</li>
          <li><strong>Origin and destination city</strong>, and the <strong>duration</strong> in days</li>
          <li><strong>Includes</strong> &mdash; what the price covers, in your words</li>
          <li><strong>Vehicle rates</strong> &mdash; one rate box for each vehicle in your vocabulary</li>
          <li><strong>Active</strong> &mdash; an inactive package stays on the list, dimmed, and is never priced</li>
        </ul>
        <p className="text-gray-600 mb-3">
          The vehicles are <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">your
          own vehicle types</Link> (Settings &rarr; Vocabulary), with your names and the passenger range
          each one carries. Rates are in your rates currency. Leave a vehicle blank if the package does
          not offer it: a blank is not a zero.
        </p>
        <ScreenshotPlaceholder caption="Transport Packages: a package with its type, route, duration, and one rate per vehicle from your vocabulary" />
      </section>

      {/* Which vehicle */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Which vehicle a group gets</h2>
        <p className="text-gray-600 mb-3">
          The vehicle comes from the group size, never from a choice in the quote. Your vocabulary says
          which vehicle carries how many passengers; the package gives that vehicle&rsquo;s rate. With
          the starter vehicle list, for example, 3 travellers ride in an SUV and 14 in a van. Rename the
          vehicles or change their ranges in your vocabulary, and every package follows.
        </p>
        <Tip>
          <strong>No rate for the group&rsquo;s vehicle?</strong> The line is reported as a missing rate,
          not priced at zero and not moved up to a bigger vehicle. A package with no vehicle rates at all
          is flagged on the list.
        </Tip>
      </section>

      {/* Where used */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where packages are priced</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>
            <strong>Tour prices built from the days</strong> (a tour&rsquo;s rate sheet, the B2B
            Calculator for a day-built programme): a sailing takes the active{' '}
            <strong>Cruise Sightseeing</strong> package as long as the sailing (its nights aboard plus
            the day you leave the ship). The package covers those days&rsquo; transport; with no package
            of that length the per-day transport rates apply. If two packages share the length, the
            price shows a gap rather than choosing one.
          </li>
          <li>
            <strong>The Quote Builder</strong>: on a cruise day, the transport list offers each active
            package by vehicle, and the right vehicle is picked again whenever the number of travellers
            changes.
          </li>
          <li>
            <strong>The B2B Calculator, on a variation that lists its own services</strong>: a transport
            line named &ldquo;sightseeing&rdquo; takes a Cruise Sightseeing package, and one named
            &ldquo;transfer&rdquo; or &ldquo;airport&rdquo; a Cruise Transfer package. The package must
            be on the tour&rsquo;s route (its origin and destination among the tour&rsquo;s cities). If
            none is, or more than one is, the line is priced from your vehicles instead.
          </li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-2">Day Tour and Multi-Day Tour packages</h3>
        <p className="text-gray-600 mb-3">
          These price road days the same way, wherever a tour is priced from its days and in the Quote
          Builder (offered on road days that start in the package&rsquo;s origin):
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>
            A <strong>Day Tour</strong> package covers one day with sightseeing in its origin city
            &mdash; or, with a destination, a day trip from the origin to there.
          </li>
          <li>
            A <strong>Multi-Day Tour</strong> package covers as many consecutive road days as its
            duration: the first in the origin (or leaving it), the last in the destination.
          </li>
          <li>
            The covered days take the package&rsquo;s vehicle price instead of their per-day transport
            rates, listed once on the first day with &ldquo;Included&rdquo; on the others. A cruise
            night, a flight or train day, or a day with its own transport list breaks the stretch.
          </li>
          <li>Two packages fitting the same days show a gap rather than one being chosen.</li>
        </ul>
        <Tip>
          <strong>See it in action:</strong> the calculator and its partner rate sheets are on{' '}
          <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>;
          the quotes it makes are on{' '}
          <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B Quotes</Link>.
        </Tip>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/b2b-pricing-rules" />
    </div>
  )
}
