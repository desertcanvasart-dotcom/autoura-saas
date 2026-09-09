// ============================================
// The docs table of contents — ONE list, two renderers
// ============================================
// The index page (/docs) rendered its own grouped CATEGORIES and the sidebar
// (layout.tsx) rendered its own flat NAV_ITEMS. Two copies drift: they were
// already in different orders, grouped differently, and NAV_ITEMS had dropped
// the Integrations entry the index still showed. Same cure as travel-ops-pro:
// one list here, every renderer reads it.
//
// The groups mirror the app sidebar (components/Sidebar.tsx), which uses a
// pipeline model — Home · Sell · Operate · Tours · Suppliers & Rates · People ·
// Communicate · Finance · Settings — so the operator reads the same map in the
// docs and in the app. Getting Started is the one docs-only group.
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
    label: 'Sell',
    items: [
      { href: '/docs/itinerary-creation', icon: Wand2, title: 'Itinerary Creation', description: 'AI-powered itinerary generation from WhatsApp conversations and the Pricing Grid.' },
      { href: '/docs/itineraries', icon: Map, title: 'Itineraries', description: 'Build day-by-day trip plans with drag-and-drop reordering, shareable client links, and PDF export.' },
      { href: '/docs/b2c-pricing', icon: Calculator, title: 'B2C Pricing', description: 'Price itineraries interactively in the pricing grid with automatic rate lookup.' },
      { href: '/docs/b2b-pricing', icon: Briefcase, title: 'B2B Pricing', description: 'B2B price calculator with rate sheets, pax tables (1–40), and single supplement.' },
      { href: '/docs/b2b-quotes', icon: FileCheck, title: 'B2B Quotes', description: 'Save, manage, and export B2B quotes with PDF generation.' },
      { href: '/docs/b2b-import', icon: FileInput, title: 'Converting Itineraries to B2B', description: 'Turn standard itineraries into B2B quotes, templates, and partner rate sheets.' },
      { href: '/docs/bookings', icon: CalendarCheck, title: 'Bookings', description: 'Convert quotes to bookings, manage passengers, and track payments and status.' },
      { href: '/docs/extras', icon: Sparkles, title: 'Extras & Upgrades', description: 'Add-ons, upgrades and options offered on top of a trip — priced off-margin, per-row currency, and attached from the itinerary.' },
    ],
  },
  {
    label: 'Operate',
    items: [
      { href: '/docs/tasks-departures', icon: CheckSquare, title: 'Tasks, Departures & Capacity', description: 'Kanban task boards, scheduled group departures, and the capacity calendar.' },
      { href: '/docs/followups-reminders', icon: Bell, title: 'Follow-ups & Reminders', description: 'Client follow-ups from the CRM and automated invoice payment reminders.' },
      { href: '/docs/concierge-leads', icon: ConciergeBell, title: 'Concierge Leads', description: 'Triage planning briefs from the AI Concierge and turn them into itineraries.' },
      { href: '/docs/resources-documents', icon: FolderOpen, title: 'Resources & Documents', description: 'Manage operational resources and generate vouchers, contracts, and supplier documents.' },
    ],
  },
  {
    label: 'Tours',
    items: [
      { href: '/docs/tour-programs', icon: ClipboardList, title: 'Tour Manager', description: 'Create tour templates one at a time or bulk-create them from a Sample CSV, manage variations, and feed the template into pricing.' },
      { href: '/docs/b2b-pricing-rules', icon: PackageSearch, title: 'Transport Packages', description: 'Route packages with five vehicle tiers (sedan to bus) and automatic vehicle stepping.' },
    ],
  },
  {
    label: 'Suppliers & Rates',
    items: [
      { href: '/docs/suppliers', icon: Building2, title: 'Suppliers', description: 'Supplier directory with contact details and a portable SUP-#### code, CSV import/export, and property hierarchies for hotels, transport, guides and cruises.' },
      { href: '/docs/tours-rates', icon: Globe, title: 'Tours & Rates', description: 'Ready-made packages and rate management across every category, with per-rate CSV import and your own vocabulary on the labels.' },
      { href: '/docs/bulk-csv', icon: Upload, title: 'Bulk Import (CSV)', description: 'The shared CSV pattern — download a sample, fill a row per record, import. How it upserts by code, what it never overwrites, and why an unknown supplier code is skipped.' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/docs/clients', icon: Users, title: 'Clients (CRM)', description: 'Add, search, and manage client profiles, notes, and follow-ups.' },
    ],
  },
  {
    label: 'Communicate',
    items: [
      { href: '/docs/communication', icon: MessageCircle, title: 'Communication', description: 'Conversations, WhatsApp inbox with AI translation, email inbox, and the AI parser.' },
      { href: '/docs/copilot', icon: Sparkles, title: 'AI Copilot', description: 'Review and send AI-drafted replies, manage the knowledge base, and track copilot analytics.' },
      { href: '/docs/content-library', icon: Library, title: 'Content Library', description: 'Reusable destination content, AI prompts, and house writing rules for generated itineraries.' },
      { href: '/docs/message-templates', icon: MailPlus, title: 'Message Templates', description: 'Create and send pre-designed messages via WhatsApp, email, and SMS with placeholder auto-fill.' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/docs/invoices-payments', icon: FileText, title: 'Invoices & Payments', description: 'Invoices, payments, receipts, receivables, payables, and supplier invoices with AI extraction.' },
      { href: '/docs/expenses-commissions', icon: Wallet, title: 'Expenses & Commissions', description: 'Record trip expenses, track commissions, and export financial data.' },
      { href: '/docs/profit-loss', icon: TrendingUp, title: 'Profit & Loss', description: 'Per-trip and aggregate P&L with multi-currency reporting and margin analysis.' },
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
