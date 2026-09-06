import Link from 'next/link'
import {
  Rocket,
  LayoutDashboard,
  Users,
  Map,
  CalendarCheck,
  FileText,
  Wallet,
  MessageCircle,
  Globe,
  FolderOpen,
  Settings,
  Lightbulb,
  MailPlus,
  Wand2,
  Calculator,
  Briefcase,
  ClipboardList,
  FileCheck,
  Bell,
  TrendingUp,
  BarChart3,
  Receipt,
  CreditCard,
  Building2,
  Calendar,
  CheckSquare,
  BookOpen,
  Link2,
  Languages,
  BellRing,
  PackageSearch,
  Truck,
  BarChart,
  FileInput,
  Sparkles,
  ConciergeBell,
  Library,
  Activity,
} from 'lucide-react'

interface DocItem {
  href: string
  icon: typeof Rocket
  title: string
  description: string
}

interface DocCategory {
  label: string
  items: DocItem[]
}

const CATEGORIES: DocCategory[] = [
  {
    label: 'Getting Started',
    items: [
      { href: '/docs/getting-started', icon: Rocket, title: 'Getting Started', description: 'Sign up or accept an invitation, complete onboarding, and understand your role.' },
      { href: '/docs/dashboard', icon: LayoutDashboard, title: 'Dashboard', description: 'Your home base: departures, outstanding balances, replies needed, and quotes awaiting clients.' },
      { href: '/docs/analytics-reports', icon: BarChart3, title: 'Analytics & Reports', description: 'KPIs, revenue forecast, booking pipeline, and financial reports with CSV export.' },
    ],
  },
  {
    label: 'Communication & CRM',
    items: [
      { href: '/docs/communication', icon: MessageCircle, title: 'Communication', description: 'Conversations, WhatsApp inbox with AI translation, email inbox, and the AI parser.' },
      { href: '/docs/copilot', icon: Sparkles, title: 'AI Copilot', description: 'Review and send AI-drafted replies, manage the knowledge base, and track copilot analytics.' },
      { href: '/docs/concierge-leads', icon: ConciergeBell, title: 'Concierge Leads', description: 'Triage planning briefs from the AI Concierge and turn them into itineraries.' },
      { href: '/docs/clients', icon: Users, title: 'Clients (CRM)', description: 'Add, search, and manage client profiles, notes, and follow-ups.' },
    ],
  },
  {
    label: 'Itineraries & Pricing',
    items: [
      { href: '/docs/itinerary-creation', icon: Wand2, title: 'Itinerary Creation', description: 'AI-powered itinerary generation from WhatsApp conversations and the Pricing Grid.' },
      { href: '/docs/itineraries', icon: Map, title: 'Itineraries', description: 'Build day-by-day trip plans with drag-and-drop reordering, shareable client links, and PDF export.' },
      { href: '/docs/b2c-pricing', icon: Calculator, title: 'B2C Pricing', description: 'Price itineraries interactively in the pricing grid with automatic rate lookup.' },
    ],
  },
  {
    label: 'B2B',
    items: [
      { href: '/docs/b2b-pricing', icon: Briefcase, title: 'B2B Pricing', description: 'B2B price calculator with rate sheets, pax tables, and single supplement.' },
      { href: '/docs/b2b-pricing-rules', icon: PackageSearch, title: 'Transport Packages', description: 'Route packages with five vehicle tiers (sedan to bus) and automatic vehicle stepping.' },
      { href: '/docs/tour-programs', icon: ClipboardList, title: 'Tour Manager', description: 'Create and manage tour templates, variations, and the template-to-pricing flow.' },
      { href: '/docs/b2b-quotes', icon: FileCheck, title: 'B2B Quotes', description: 'Save, manage, and export B2B quotes with PDF generation.' },
      { href: '/docs/b2b-import', icon: FileInput, title: 'Converting Itineraries to B2B', description: 'Turn standard itineraries into B2B quotes, templates, and partner rate sheets.' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/docs/bookings', icon: CalendarCheck, title: 'Bookings', description: 'Convert quotes to bookings, manage passengers, and track payments and status.' },
      { href: '/docs/suppliers', icon: Building2, title: 'Suppliers', description: 'Your supplier directory: hotels, transport, guides, cruises, and property hierarchies.' },
      { href: '/docs/tasks-departures', icon: CheckSquare, title: 'Tasks, Departures & Capacity', description: 'Kanban task boards, scheduled group departures, and the capacity calendar.' },
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
    label: 'Rates & Content',
    items: [
      { href: '/docs/tours-rates', icon: Globe, title: 'Tours & Rates', description: 'Ready-made packages and rate management across 14 categories.' },
      { href: '/docs/resources-documents', icon: FolderOpen, title: 'Resources & Documents', description: 'Manage operational resources and generate vouchers, contracts, and supplier documents.' },
      { href: '/docs/content-library', icon: Library, title: 'Content Library & Documents', description: 'Reusable destination content, AI prompts, and house writing rules for generated itineraries.' },
    ],
  },
  {
    label: 'Messaging & Follow-ups',
    items: [
      { href: '/docs/message-templates', icon: MailPlus, title: 'Message Templates', description: 'Create and send pre-designed messages via WhatsApp, email, and SMS with placeholder auto-fill.' },
      { href: '/docs/followups-reminders', icon: Bell, title: 'Follow-ups & Reminders', description: 'Client follow-ups from the CRM and automated invoice payment reminders.' },
    ],
  },
  {
    label: 'Settings & Integrations',
    items: [
      { href: '/docs/team-settings', icon: Settings, title: 'Team & Settings', description: 'Team management, user roles, organization branding, billing, and preferences.' },
      { href: '/docs/activity-summary', icon: Activity, title: 'Team Activity', description: 'Optional, transparent activity summaries: last seen, focused time, and work counts per member.' },
      { href: '/integrations', icon: Link2, title: 'Integrations', description: 'WhatsApp Business API and Gmail OAuth, both live today. Accounting sync (Xero, QuickBooks) is on the roadmap for Q3 2026.' },
      { href: '/docs/workflows', icon: Lightbulb, title: 'Workflows & Tips', description: 'Step-by-step workflows and productivity shortcuts.' },
    ],
  },
]

export default function DocsHub() {
  return (
    <>
      {/* Hero Section */}
      <section className="pt-16 pb-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Documentation
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Everything you need to know about using Autoura. From getting started to advanced workflows, find step-by-step guides for every feature.
          </p>
        </div>
      </section>

      {/* Categorized Cards */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-10">
          {CATEGORIES.map((category) => (
            <div key={category.label}>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 px-1">
                {category.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {category.items.map((section) => {
                  const Icon = section.icon
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      className="group border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-primary-300 transition-all duration-200"
                    >
                      <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-colors">
                        <Icon className="w-5 h-5 text-primary-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">
                        {section.title}
                      </h3>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {section.description}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
