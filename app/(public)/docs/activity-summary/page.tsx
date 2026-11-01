import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { DocScreenshot, Tip } from '../layout'
import { DocPager } from '../pager'
import { docMetadata } from '../seo'

export const metadata = docMetadata('/docs/activity-summary')

export default function ActivitySummaryDocs() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Team Activity</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Team Activity</h1>
      <p className="text-gray-600 mb-8">
        Team Activity gives admins and managers an honest picture of how engaged each team member is inside Autoura:
        when they last logged in, roughly how much focused time they spent, and what they actually produced &mdash; tasks,
        itineraries, messages, quotes, and invoices. It is <strong>off by default</strong>, <strong>transparent by design</strong>
        (every member sees exactly the numbers their manager sees), and measures <strong>output over presence</strong>.
      </p>

      {/* Enabling */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Enabling It</h2>
        <p className="text-gray-600 mb-4">
          An admin turns the feature on from <strong>Organization</strong> settings (the <strong>Team Activity</strong> card):
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-3">
          <li>Switch the toggle on &mdash; a confirmation appears</li>
          <li>Tick <strong>&ldquo;My team has been informed that activity summaries will be visible&rdquo;</strong> &mdash; enabling is blocked until you confirm</li>
          <li>Click <strong>Enable</strong> &mdash; every active team member receives an in-app notice that activity summaries are on</li>
        </ol>
        <p className="text-gray-600 mb-3">
          Turning it off takes effect immediately: nothing is shown and no new presence or focused time is recorded while it is off. Last login always comes from the sign-in records, and only admins and managers see other people&rsquo;s.
        </p>
        <DocScreenshot src="/docs/activity-summary/team-activity-settings.jpg" alt="Organization settings with the Team Activity card and informed-confirmation flow" />
      </section>

      {/* What it shows */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Shows</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Last login</strong> &mdash; from the sign-in records; accurate from day one</li>
          <li><strong>Last seen</strong> &mdash; refreshed every 5 minutes while an Autoura tab is open, and only recorded while summaries are on</li>
          <li><strong>Focused time</strong> &mdash; an estimate in 5-minute steps, counted only while the tab is visible <em>and</em> the person has used it in the last 5 minutes; a tab left open in the background accrues nothing, and several tabs count once</li>
          <li><strong>Output counts</strong> for the selected range (Today / 7 days / 30 days, whole days counted in UTC): tasks completed (tasks assigned to the person and completed in the range), itineraries touched, messages sent (WhatsApp + email), quotes created, invoices issued, and Copilot drafts reviewed/sent</li>
        </ul>
        <Tip>
          Automated replies never count &mdash; messages sent by the WhatsApp auto-reply or the AI agent are not attributed
          to anyone. Message, quote, and invoice counts start from August 2026; earlier records are not per-user attributed.
        </Tip>
      </section>

      {/* Where to find it */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where To Find It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Staff directory</strong> (the <strong>Team</strong> link, or Settings &rsaquo; Staff directory) &mdash; members with a login show an <strong>Activity</strong> button (admins and managers) that opens the summary</li>
          <li><strong>Your profile</strong> &mdash; account menu (your initials, top right) &rarr; <strong>Profile</strong>: every member sees their own <strong>Your Activity</strong> card, with the same numbers their manager sees</li>
        </ul>
        <DocScreenshot src="/docs/activity-summary/activity-modal.jpg" alt="Activity summary for a team member: last login and last seen, focused-time bars, and output tiles" />
        <DocScreenshot src="/docs/activity-summary/your-activity.jpg" alt="The Your Activity self-view on the profile page" />
      </section>

      {/* Honest limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>It only sees work <strong>inside Autoura</strong> &mdash; phone calls, meetings, supplier visits, and messages sent from personal devices are invisible to it</li>
          <li>No screenshots, keystroke logging, webcam access, or tracking outside the app tab &mdash; ever</li>
          <li>It is not a productivity score &mdash; low app time is not evidence someone isn&apos;t working</li>
        </ul>
        <Tip>
          Read the numbers as context, not verdicts. &ldquo;What did this person produce this week?&rdquo; is a fair question;
          &ldquo;why was their focused time low on Tuesday?&rdquo; usually is not &mdash; much of a tour operator&apos;s real work
          happens off-app.
        </Tip>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/activity-summary" />
    </div>
  )
}
