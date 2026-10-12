// ============================================
// The docs table of contents — ONE list, two renderers
// ============================================
// The index page (/docs) rendered its own grouped CATEGORIES and the sidebar
// (layout.tsx) rendered its own flat NAV_ITEMS. Two copies drift: they were
// already in different orders, grouped differently, and NAV_ITEMS had dropped
// the Integrations entry the index still showed. Same cure as travel-ops-pro:
// one list here, every renderer reads it.
//
// The groups mirror the app sidebar (components/Sidebar.tsx) — Home ·
// Communicate · Sell · Operate · Tours · Suppliers & Rates · People · Finance ·
// Settings — so the operator reads the same map in the docs and in the app.
// Communicate sits second, straight under Home, as it does in the app, and
// holds Concierge Leads as the app does. Getting Started is the one docs-only
// group. Each page's previous / next links are read from this order
// (pager.tsx).
//
// app/(public)/docs/__tests__/docs-toc.test.ts pins the /docs entries to the
// page directories on disk, in both directions.

import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarRange,
  CheckSquare,
  ClipboardList,
  ConciergeBell,
  FileCheck,
  FileInput,
  FileText,
  FolderOpen,
  Globe,
  Handshake,
  LayoutDashboard,
  Library,
  Lightbulb,
  Link2,
  MailPlus,
  Map,
  MessageCircle,
  PackageSearch,
  Rocket,
  Settings,
  Sparkles,
  TrendingUp,
  Upload,
  UserCog,
  Users,
  Wallet,
  Wand2,
} from 'lucide-react'

export interface DocItem {
  href: string
  icon: typeof Rocket
  title: string
  description: string
  /** Shorter sidebar label where the full title would crowd it. */
  navLabel?: string
}

export interface DocCategory {
  label: string
  items: DocItem[]
}

export const CATEGORIES: DocCategory[] = [
  {
    label: 'Getting Started',
    items: [
      { href: '/docs/getting-started', icon: Rocket, title: 'Getting Started', description: 'Sign up or accept an invitation, complete onboarding, and understand your role.' },
      { href: '/docs/workflows', icon: Lightbulb, title: 'Workflows & Tips', description: 'End-to-end workflows across the sidebar pipeline — Sell, Operate, Suppliers & Rates, Finance — and the shortcuts that speed each one.' },
    ],
  },
  {
    label: 'Home',
    items: [
      { href: '/docs/dashboard', icon: LayoutDashboard, title: 'Dashboard', description: 'Your home base: departures, outstanding balances, replies needed, and quotes awaiting clients.' },
      { href: '/docs/analytics-reports', icon: BarChart3, title: 'Analytics & Reports', description: 'KPIs, revenue forecast, booking pipeline, and financial reports with CSV export.' },
    ],
  },
  {
    label: 'Communicate',
    items: [
      { href: '/docs/communication', icon: MessageCircle, title: 'Communication', description: 'Conversations, the WhatsApp inbox with AI translation, the Gmail inbox, email signatures, and parsing a request into the Quote Builder.' },
      { href: '/docs/concierge-leads', icon: ConciergeBell, title: 'Concierge Leads', description: 'Triage planning briefs from the AI Concierge and turn them into itineraries.' },
      { href: '/docs/copilot', icon: Sparkles, title: 'AI Copilot', description: 'Review and send AI-drafted replies, manage the knowledge base, and track copilot analytics.' },
      { href: '/docs/content-library', icon: Library, title: 'Content Library', description: 'Reusable destination content, AI prompts, and house writing rules for generated itineraries.' },
      { href: '/docs/message-templates', icon: MailPlus, title: 'Message Templates', description: 'Create and send pre-designed messages via WhatsApp, email, and SMS with placeholder auto-fill.' },
    ],
  },
  {
    label: 'Sell',
    items: [
      { href: '/docs/itinerary-creation', icon: Wand2, title: 'Itinerary Creation', description: 'Build and price trips in the Quote Builder: paste a request, upload a file, or load an itinerary, and the AI lays out the days.' },
      { href: '/docs/itineraries', icon: Map, title: 'Itineraries', description: 'Build day-by-day trip plans with drag-and-drop reordering, shareable client links, and PDF export.' },
      { href: '/docs/b2c-pricing', icon: Calculator, title: 'B2C Pricing', description: 'How the Quote Builder prices a trip from your rates and markup, and the B2C quotes it makes.' },
      { href: '/docs/b2b-pricing', icon: Briefcase, title: 'B2B Pricing', description: 'The B2B Calculator: price a tour programme for partners, with a rate sheet for 1–10 travellers, tour leader and single supplement.' },
      { href: '/docs/b2b-quotes', icon: FileCheck, title: 'B2B Quotes', description: 'Partner rate sheets: save, send by email or WhatsApp, export as PDF, and convert to bookings.' },
      { href: '/docs/b2b-import', icon: FileInput, title: 'Converting Itineraries to B2B', description: 'Turn standard itineraries into B2B quotes, templates, and partner rate sheets.' },
      { href: '/docs/bookings', icon: CalendarCheck, title: 'Bookings', description: 'Bookings from accepted quotes or confirmed itineraries: travellers, payments, suppliers, extras and the traveller portal.' },
      { href: '/docs/extras', icon: Sparkles, title: 'Extras & Upgrades', description: 'Add-ons and upgrades on top of a trip — at a set price or cost plus margin, on B2B quotes and bookings, and requested from the traveller portal.' },
    ],
  },
  {
    label: 'Operate',
    items: [
      { href: '/docs/tasks-departures', icon: CheckSquare, title: 'Tasks, Departures & Capacity', description: 'The task board and operations tasks from a trip, scheduled group departures, and the capacity calendar the WhatsApp AI reads.' },
      { href: '/docs/followups-reminders', icon: Bell, title: 'Follow-ups & Reminders', description: 'Follow-ups scheduled on a client, and the weekly payment reminder emails for unpaid invoices.' },
      { href: '/docs/resources-documents', icon: FolderOpen, title: 'Resources & Documents', description: 'Assign guides, drivers, vehicles and hotels to a trip, and generate and send vouchers and service orders.' },
    ],
  },
  {
    label: 'Tours',
    items: [
      { href: '/docs/tour-programs', icon: ClipboardList, title: 'Tour Manager', description: 'Your tour catalogue: create, duplicate or import tours, edit their days, add variations by tier, and browse them in Tour Inventory.' },
      { href: '/docs/importing-tours', icon: Upload, title: 'Importing Tours', description: 'The two-sheet procedure — the tour and its day-by-day itinerary — in order, with the rules the import enforces: every meal and every day\'s sightseeing stated, nothing guessed.' },
      { href: '/docs/b2b-pricing-rules', icon: PackageSearch, title: 'Transport Packages', description: 'One price per vehicle for a cruise, a day tour or a multi-day road journey, from your own vehicle types; the group size picks the vehicle.' },
    ],
  },
  {
    label: 'Suppliers & Rates',
    items: [
      { href: '/docs/suppliers', icon: Building2, title: 'Suppliers', description: 'Your supplier directory: several roles per supplier, a SUP-#### code each, their hotels, ships and trains, contracts, and import / export that updates by code.' },
      { href: '/docs/tours-rates', icon: Globe, title: 'Tours & Rates', description: 'The fourteen rate pages and the Rates Hub: what each rate holds, its currency, EU and non-EU prices, and CSV import.' },
      { href: '/docs/bulk-csv', icon: Upload, title: 'Bulk Import (CSV)', description: 'Sample, export, import — and how the supplier, property and rate sheets each match rows, treat blank cells and refuse what they cannot read.' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/docs/clients', icon: Users, title: 'Clients (CRM)', description: 'Your travellers: leads and customers, the New Client wizard, the profile with its trips, notes, follow-ups and communication log, and who may edit or delete.' },
      { href: '/docs/partners', icon: Handshake, title: 'Partners', description: 'The tour operators and agencies you sell to: a code, a currency and a default margin each, which the B2B Calculator and Quote Builder apply.' },
      { href: '/docs/team-members', icon: UserCog, title: 'Team Members', description: 'Your staff directory — the guides, drivers and office staff trips, tasks and chats are assigned to. Not logins.' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/docs/invoices-payments', icon: FileText, title: 'Invoices & Payments', description: 'Invoices and their statuses, payments, receipts, what clients owe and what you owe suppliers — and supplier bills read by AI, matched to expenses, approved and paid.' },
      { href: '/docs/expenses-commissions', icon: Wallet, title: 'Expenses & Commissions', description: 'Trip and office expenses, approvals and CSV export; commissions generated from a trip or added by hand; and the yearly Reports.' },
      { href: '/docs/profit-loss', icon: TrendingUp, title: 'Profit & Loss', description: 'What each trip earned (invoices net of tax, or the quote), cost and paid in commission — trip by trip and in your agency’s currency.' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/docs/team-settings', icon: Settings, title: 'Team & Settings', description: 'Team management, user roles, organization branding, billing, and the preferences that reach across the app — Vocabulary, Extras and Seasonal Premiums.' },
      { href: '/docs/vocabulary', icon: BookOpen, title: 'Your Vocabulary', description: 'Relabel the product in your own words — the built-in terms, per tenant — without renaming anything under the hood.' },
      { href: '/docs/seasonal-premiums', icon: CalendarRange, title: 'Seasonal Premiums', description: 'Your high-demand dates as a premium on the whole price after margin — set the dated windows once and every quote in them lifts automatically.' },
      { href: '/docs/activity-summary', icon: Activity, title: 'Team Activity', description: 'Optional, transparent activity summaries: last seen, focused time, and work counts per member.' },
      { href: '/integrations', icon: Link2, title: 'Integrations', description: 'WhatsApp Business API and Gmail OAuth, both live today. Accounting sync (Xero, QuickBooks) is on the roadmap for Q3 2026.' },
    ],
  },
]
