import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'
import { DocPager } from '../pager'

export default function ClientsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Clients</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Clients</h1>
      <p className="text-gray-600 mb-8">
        Your travellers, under <strong>People &rarr; Clients</strong>. The tour operators and agencies you
        sell to are kept apart, under <Link href="/docs/partners" className="text-primary-600 hover:underline">Partners</Link>;
        your own staff are under <Link href="/docs/team-members" className="text-primary-600 hover:underline">Team Members</Link>.
      </p>

      {/* Stages */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Lead, Customer, Inactive, Blocked</h2>
        <p className="text-gray-600 mb-3">Every client has a stage:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Lead</strong> &mdash; has asked, nothing booked yet. A client created from an inbound email, a WhatsApp message or a concierge brief starts here.</li>
          <li><strong>Customer</strong> &mdash; has booked at least once. The first booking moves a lead here by itself.</li>
          <li><strong>Inactive</strong> and <strong>Blocked</strong> &mdash; set by hand on the Edit page.</li>
        </ul>
      </section>

      {/* The list */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The client list</h2>
        <p className="text-gray-600 mb-3">
          Five counts sit at the top: <strong>Total Clients</strong>, <strong>Customers</strong>,{' '}
          <strong>VIP Clients</strong>, <strong>New (This Month)</strong> and <strong>Leads</strong>. Below them each
          client shows its name and code, contact, type and stage, lead source, number of bookings and revenue.
        </p>
        <DocScreenshot src="/docs/clients/client-list.jpg" alt="Client list with stats cards, search, filters, and columns for client, contact, type and status, lead source, bookings, and revenue" />
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-4">
          <li><strong>Search</strong> matches name, email, phone or client code.</li>
          <li><strong>Filters</strong> narrow by stage, client type, lead source, VIP, or the date the client was added. <strong>Clear</strong> resets them.</li>
          <li><strong>Sort</strong> by most recent, oldest, name, revenue (high or low) or most bookings.</li>
          <li>
            <strong>Bookings</strong> counts the client&rsquo;s bookings that are not cancelled. <strong>Revenue</strong>{' '}
            totals them in your agency&rsquo;s currency; it shows &mdash; when a booking is in a currency that
            cannot be converted, rather than a total that leaves it out.
          </li>
          <li>
            <strong>Lead source</strong> is the one picked on the client. When none was picked, it is the source the
            client arrived through (WhatsApp, email, concierge).
          </li>
        </ul>
      </section>

      {/* Adding */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a client</h2>
        <p className="text-gray-600 mb-3">
          <strong>New Client</strong> opens a five-step form. You can jump between steps or save from the last one.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Basic Info</strong> &mdash; name, email, phones, nationality, passport type (<strong>Euro Passport</strong> or <strong>Other Passport</strong>, which decides the entrance-fee prices a quote uses), date of birth, language.</li>
          <li><strong>Contact</strong> &mdash; preferred contact method, best time, timezone (your agency&rsquo;s to start with), address.</li>
          <li><strong>Preferences</strong> &mdash; accommodation level, dietary and accessibility needs, interests.</li>
          <li><strong>Business</strong> &mdash; company, job title, whether they are a travel agent and their commission, preferred currency (your agency&rsquo;s to start with).</li>
          <li><strong>Classification</strong> &mdash; client type, VIP, lead source, marketing consents, tags, internal notes.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          Only the <strong>first name</strong> is required &mdash; a lead from a phone call may have no surname or email
          yet. If it is missing when you save, the form goes back to step 1 and says so. An email that is not an
          email address is refused.
        </p>
        <DocScreenshot src="/docs/clients/new-client-wizard.jpg" alt="New Client wizard on the Basic Info step, showing First Name, Last Name, nationality, and passport type fields" />
        <Tip>
          From a WhatsApp chat, <strong>Create</strong> in the conversation header opens this form with the phone filled
          in and WhatsApp as the lead source, and links the chat to the new client when you save.
        </Tip>
      </section>

      {/* Profile */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The client profile</h2>
        <p className="text-gray-600 mb-3">Click a client to open their profile. It has five tabs:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Overview</strong> &mdash; their details, VIP, bookings, revenue and average booking value, interests and tags.</li>
          <li><strong>Communications</strong> &mdash; the emails linked to them from the inbox, and the calls, meetings and messages logged with them.</li>
          <li><strong>Trips</strong> &mdash; every itinerary for them, newest first, with dates, travellers and the trip&rsquo;s total as the trip page shows it. <strong>New Trip</strong> opens the Quote Builder for them.</li>
          <li><strong>Notes</strong> &mdash; internal notes, for your team only.</li>
          <li><strong>Follow-ups</strong> &mdash; reminders linked to them; tick one off when done.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The quick actions &mdash; <strong>Log Communication</strong>, <strong>Add Follow-up</strong>, <strong>Add Note</strong>{' '}
          &mdash; are at the side of the Overview tab.
        </p>
        <ScreenshotPlaceholder caption="Client profile with the Overview tab" />
      </section>

      {/* Edit / delete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing and deleting</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Edit Client</strong> changes the details, stage, VIP, lead source, interests and tags. Renaming a client renames them everywhere &mdash; the list, the search and documents.</li>
          <li>
            <strong>Delete</strong> (on the list or the profile) removes the client with their notes, follow-ups, preferences
            and communication log. A client with trips, bookings, invoices, payments or email history cannot be deleted
            &mdash; the message says which. Their WhatsApp chat is kept and unlinked.
          </li>
        </ul>
      </section>

      {/* Roles */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who can do what</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Members, managers and admins</strong> add and edit clients.</li>
          <li><strong>Managers and admins</strong> delete them.</li>
          <li><strong>Viewers</strong> see clients and change nothing.</li>
        </ul>
        <Tip>
          Keep preferences &mdash; dietary needs, hotel likes, interests &mdash; on the client, so the next trip starts from them.
        </Tip>
      </section>

      {/* Previous / next — from the docs order (pager.tsx) */}
      <DocPager href="/docs/clients" />
    </div>
  )
}
