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
      { href: '/docs/getting-started', icon: Rocket, title: 'Getting Started', description: 'Log in, set up your account, and understand your role.' },
      { href: '/docs/dashboard', icon: LayoutDashboard, title: 'Dashboard', description: 'Your home base with quick stats, actions, and recent activity.' },
      { href: '/docs/analytics', icon: BarChart, title: 'Analytics', description: 'Visual charts and metrics across bookings, revenue, and team performance.' },
    ],
  },
  {
    label: 'Communication & CRM',
    items: [
      { href: '/docs/communication', icon: MessageCircle, title: 'Communication', description: 'WhatsApp inbox, AI parser, and email management.' },
      { href: '/docs/clients', icon: Users, title: 'Clients (CRM)', description: 'Add, search, and manage client profiles, notes, and follow-ups.' },
      { href: '/docs/notifications', icon: BellRing, title: 'Notifications', description: 'In-app notifications for tasks, payments, bookings, and team activity.' },
    ],
  },
  {
    label: 'Itineraries & Pricing',
    items: [
      { href: '/docs/itinerary-creation', icon: Wand2, title: 'Itinerary Creation', description: 'AI-powered itinerary generation from WhatsApp conversations and emails.' },
      { href: '/docs/itineraries', icon: Map, title: 'Itineraries', description: 'Build day-by-day trip plans with drag-and-drop reordering, pricing, services, and PDF export.' },
      { href: '/docs/b2c-pricing', icon: Calculator, title: 'B2C Pricing', description: 'Calculate itinerary pricing with automatic rate lookup and service costing.' },
      { href: '/docs/pricing-grid', icon: BarChart3, title: 'Pricing Grid', description: 'Interactive pricing calculator for comparing rates across tiers, dates, and group sizes.' },
      { href: '/docs/multi-language', icon: Languages, title: 'Multi-Language', description: 'Copy and translate itineraries and B2B quotes between English and Japanese with one click.' },
    ],
  },
  {
    label: 'B2B',
    items: [
      { href: '/docs/b2b-pricing', icon: Briefcase, title: 'B2B Pricing', description: 'B2B price calculator with rate sheets, pax tables, and single supplement.' },
      { href: '/docs/b2b-pricing-rules', icon: PackageSearch, title: 'B2B Pricing Rules', description: 'Partner-specific margin rules, volume discounts, and date-based pricing overrides.' },
      { href: '/docs/tour-programs', icon: ClipboardList, title: 'Tour Programs Manager', description: 'Create and manage tour templates, variations, and the template-to-pricing flow.' },
      { href: '/docs/b2b-quotes', icon: FileCheck, title: 'B2B Quotes', description: 'Save, manage, and export B2B quotes with PDF generation.' },
      { href: '/docs/b2b-import', icon: FileInput, title: 'B2B Import', description: 'Convert standard itineraries into B2B packages for partner distribution.' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/docs/bookings', icon: CalendarCheck, title: 'Bookings', description: 'Track supplier confirmations, payments, and operational status.' },
      { href: '/docs/calendar', icon: Calendar, title: 'Calendar', description: 'Month, week, and timeline views of all tours. Drag-to-reschedule, resource conflict detection, and team-wide visibility.' },
      { href: '/docs/tasks', icon: CheckSquare, title: 'Tasks', description: 'Kanban board, table, and list views for managing operational tasks with priorities and assignments.' },
      { href: '/docs/suppliers', icon: Building2, title: 'Suppliers', description: 'Manage supplier profiles, contact details, commission rates, and type-specific fields for guides, hotels, and transport.' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/docs/invoices-payments', icon: FileText, title: 'Invoices & Payments', description: 'Create standard, deposit, and final invoices. Record payments via bank transfer, card, Wise, Stripe, and more.' },
      { href: '/docs/invoice-reminders', icon: BellRing, title: 'Invoice Reminders', description: 'Automated reminder scheduling with escalating urgency at 7, 3, and 0 days before due, plus overdue follow-ups.' },
      { href: '/docs/receipts', icon: Receipt, title: 'Receipts', description: 'Generate branded receipt PDFs for payments and send them via WhatsApp or email.' },
      { href: '/docs/accounts-receivable', icon: Wallet, title: 'Accounts Receivable', description: 'Client-level aging analysis (current, 30, 60, 90+ days), outstanding balances, and payment reminder triggers.' },
      { href: '/docs/accounts-payable', icon: CreditCard, title: 'Accounts Payable', description: 'Supplier-level aging reports, expense grouping by supplier, and payment approval workflows.' },
      { href: '/docs/supplier-invoices', icon: FileCheck, title: 'Supplier Invoices', description: 'Three-way matching: supplier invoice \u2192 expense \u2192 payment. Upload documents, match, approve, pay, or dispute.' },
      { href: '/docs/expenses', icon: Wallet, title: 'Expenses', description: 'Track expenses by category with supplier linking, receipt uploads, and approval workflows.' },
      { href: '/docs/commissions', icon: Truck, title: 'Commissions', description: 'Track receivable and payable commissions by category. Auto-generate from itineraries.' },
      { href: '/docs/profit-loss', icon: TrendingUp, title: 'Profit & Loss', description: 'Per-trip and aggregate P&L reports with supplier cost vs. client revenue analysis.' },
      { href: '/docs/financial-reports', icon: BarChart3, title: 'Financial Reports', description: 'Monthly and quarterly revenue, cash flow analysis, tax summaries, commission reports, and year-over-year comparisons.' },
    ],
  },
  {
    label: 'Rates & Content',
    items: [
      { href: '/docs/tours-rates', icon: Globe, title: 'Tours & Rates', description: 'Pre-built tour templates and comprehensive rate management across 15 categories.' },
      { href: '/docs/content-library', icon: BookOpen, title: 'Content Library', description: 'Reusable attraction and activity descriptions with per-tier variations, AI prompts, and writing rules.' },
      { href: '/docs/resources-documents', icon: FolderOpen, title: 'Resources & Documents', description: 'Manage guides, vehicles, hotels, restaurants, and airport staff. Generate invoices, contracts, vouchers, and receipts.' },
    ],
  },
  {
    label: 'Messaging & Follow-ups',
    items: [
      { href: '/docs/message-templates', icon: MailPlus, title: 'Message Templates', description: 'Create and send pre-designed messages via WhatsApp and email with placeholder auto-fill.' },
      { href: '/docs/followups-reminders', icon: Bell, title: 'Follow-ups & Reminders', description: 'Schedule follow-ups, set reminders, and never miss a client touchpoint.' },
    ],
  },
  {
    label: 'Settings & Integrations',
    items: [
      { href: '/docs/team-settings', icon: Settings, title: 'Team & Settings', description: 'Invite team members, assign roles, configure email signatures, and manage preferences.' },
      { href: '/docs/integrations', icon: Link2, title: 'Integrations', description: 'Connect Xero or QuickBooks for push-only accounting sync. WhatsApp Business and Gmail OAuth setup.' },
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
