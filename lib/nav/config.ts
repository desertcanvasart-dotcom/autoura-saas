import type { LucideIcon } from 'lucide-react'
import {
  House,
  Receipt,
  HandCoins,
  Inbox,
  ChartColumn,
  Star,
  LayoutGrid,
  File,
  Map,
  BookOpen,
  Check,
  CalendarDays,
  Folder,
  Mountain,
  Package,
  Bus,
  Plus,
  Globe,
  Truck,
  Tag,
  ScanLine,
  User,
  Handshake,
  ReceiptText,
  CreditCard,
  FileText,
  Wallet,
  Percent,
  ChartLine,
  Settings,
  Sparkles,
  Hotel,
  Ship,
  BedDouble,
  ConciergeBell,
  Plane,
  TrainFront,
  Users,
  UtensilsCrossed,
  Landmark,
  Ticket,
  Coins,
  Calculator,
  MessageSquare,
  MessageCircle,
  CalendarRange,
  Bell,
  Mail,
  Building,
  Network,
  UserCog,
  Blocks,
  Signpost,
  BookA,
  Library,
  PenLine,
  Brain,
  Bot,
  Banknote,
  Clock,
} from 'lucide-react'
import type { PermissionRole } from '@/lib/roles'

// ============================================
// THE NAVIGATION, IN ONE PLACE
// ============================================
//
// The main sidebar, the Settings area's sidebar, the Rates page's category
// menu and the ⌘K jump-to all read this file — nothing hand-writes a link
// list. Each entry carries who may see it; the middleware's ROUTE_PERMISSIONS
// enforces the same on the server (lib/__tests__/nav-config.test.ts keeps the
// two in step).
//
// The main sidebar holds the daily work only. Setup — rate sheets, catalog
// words, templates, AI content — lives in Settings or the Rates page's own
// menu, and every page stays one ⌘K away.

/** Everyone who works in the app ("all" in the brief). Viewers are added per item. */
const ALL: PermissionRole[] = ['admin', 'manager', 'member']
const ALL_AND_VIEWER: PermissionRole[] = ['admin', 'manager', 'member', 'viewer']
const AM: PermissionRole[] = ['admin', 'manager']
const A: PermissionRole[] = ['admin']

// ============================================
// RATES PAGE CATEGORY MENU
// ============================================

export interface RateCategory {
  label: string
  /** Sub-route under /rates. */
  slug: string
  icon: LucideIcon
}

export interface RateGroup {
  key: string
  title: string
  categories: RateCategory[]
}

export const RATE_GROUPS: RateGroup[] = [
  {
    key: 'accommodation',
    title: 'Accommodation',
    categories: [
      { label: 'Hotels', slug: 'hotels', icon: Hotel },
      { label: 'Cruises', slug: 'cruises', icon: Ship },
      { label: 'Sleeping trains', slug: 'sleeping-train', icon: BedDouble },
      { label: 'Hotel services', slug: 'hotel-services', icon: ConciergeBell },
    ],
  },
  {
    key: 'transport',
    title: 'Transport & tickets',
    categories: [
      { label: 'Transportation', slug: 'transportation', icon: Truck },
      { label: 'Flights', slug: 'flights', icon: Plane },
      { label: 'Trains', slug: 'trains', icon: TrainFront },
      { label: 'Airport services', slug: 'airport-services', icon: Plane },
    ],
  },
  {
    key: 'services',
    title: 'Guides & services',
    categories: [
      { label: 'Tour guides', slug: 'guides', icon: Users },
      { label: 'Meals', slug: 'meals', icon: UtensilsCrossed },
      { label: 'Attractions', slug: 'attractions', icon: Landmark },
      { label: 'Activities', slug: 'activities', icon: Ticket },
    ],
  },
  {
    key: 'costs',
    title: 'Costs',
    categories: [
      { label: 'Tipping', slug: 'tipping', icon: Coins },
      { label: 'Fixed costs', slug: 'fixed-costs', icon: Coins },
    ],
  },
]

export type NavBadge = 'email' | 'whatsapp' | 'leads'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles: PermissionRole[]
  badge?: NavBadge
  /**
   * Other paths this entry is "the current page" for — the pages a merge will
   * fold into it, reached meanwhile through this link.
   */
  match?: string[]
  /** Extra words ⌘K matches on (old names, synonyms). */
  keywords?: string[]
}

/** A foldable group inside a section (the rate sheets). */
export interface NavGroup {
  key: string
  title: string
  items: NavItem[]
}

export interface NavSection {
  key: string
  /** No title: the top group (Dashboard, Reports). */
  title?: string
  items: NavItem[]
  /** Folded until opened; an opened group stays open (per login). */
  groups?: NavGroup[]
}

// The menu the operator approved on 2026-10-31, after the first cut hid
// pages used every day: Communicate is back as its own section (Inbox and
// each channel), every rate sheet is in the sidebar again (folded under
// its group), and each finance list has its own link. Setup stays in
// Settings; Message templates is in both places.
export const MAIN_NAV: NavSection[] = [
  {
    key: 'top',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: House, roles: ALL_AND_VIEWER, keywords: ['home'] },
      {
        label: 'Reports', href: '/reports', icon: ChartColumn, roles: ALL_AND_VIEWER,
        keywords: ['analytics', 'financial reports', 'copilot analytics'],
      },
    ],
  },
  {
    key: 'communicate',
    title: 'Communicate',
    items: [
      {
        label: 'Inbox', href: '/inbox?channel=all', icon: Inbox, roles: ALL,
        match: ['/communications'],
        keywords: ['all conversations', 'messages'],
      },
      { label: 'Email', href: '/inbox?channel=email', icon: Mail, roles: ALL, badge: 'email', keywords: ['gmail'] },
      { label: 'WhatsApp', href: '/inbox?channel=whatsapp', icon: MessageCircle, roles: ALL, badge: 'whatsapp' },
      {
        label: 'Leads', href: '/concierge-briefs', icon: Star, roles: ALL, badge: 'leads',
        keywords: ['concierge', 'briefs'],
      },
      { label: 'Copilot', href: '/copilot', icon: Sparkles, roles: ALL, keywords: ['drafts', 'review'] },
      { label: 'Message templates', href: '/settings/message-templates', icon: MessageSquare, roles: ALL, keywords: ['templates'] },
    ],
  },
  {
    key: 'sell',
    title: 'Sell',
    items: [
      { label: 'Quote Builder', href: '/pricing-grid', icon: LayoutGrid, roles: ALL, keywords: ['pricing grid', 'new quote'] },
      { label: 'Quotes', href: '/quotes', icon: File, roles: ALL, keywords: ['b2c', 'b2b'] },
      { label: 'Itineraries', href: '/itineraries', icon: Map, roles: AM },
      { label: 'Bookings', href: '/bookings', icon: BookOpen, roles: ALL },
      // Kept apart from Bookings: it plots itineraries and the guides and
      // vehicles assigned to them, not the bookings table.
      { label: 'Calendar', href: '/calendar', icon: CalendarRange, roles: ALL_AND_VIEWER, keywords: ['booking calendar', 'schedule'] },
    ],
  },
  {
    key: 'operate',
    title: 'Operate',
    items: [
      { label: 'Tasks', href: '/tasks', icon: Check, roles: ALL, keywords: ['follow-ups', 'to do'] },
      {
        label: 'Departures', href: '/departures', icon: CalendarDays, roles: AM,
        keywords: ['tour departures', 'capacity calendar'],
      },
      { label: 'Documents', href: '/documents', icon: Folder, roles: AM, keywords: ['contracts', 'vouchers'] },
    ],
  },
  {
    key: 'products',
    title: 'Products',
    items: [
      { label: 'Tours', href: '/tours/manage', icon: Mountain, roles: AM, keywords: ['tour manager'] },
      { label: 'Inventory', href: '/tours', icon: Package, roles: AM, keywords: ['tour inventory'] },
      { label: 'Transport packages', href: '/b2b/pricing-rules', icon: Bus, roles: AM },
      { label: 'Extras', href: '/rates/extras', icon: Plus, roles: AM, keywords: ['add-ons'] },
      { label: 'Website', href: '/publish', icon: Globe, roles: ALL, keywords: ['publish', 'site'] },
    ],
  },
  {
    key: 'suppliers',
    title: 'Suppliers & rates',
    items: [
      {
        label: 'Suppliers', href: '/suppliers', icon: Truck, roles: AM,
        match: ['/resources', '/airport-staff'],
        keywords: ['network suppliers'],
      },
      // The shared Autoura network, where an agency finds more suppliers
      // (operator, 2026-10-31: it must be visible, not only a tab).
      {
        label: 'Supplier network', href: '/suppliers?tab=network', icon: Network, roles: AM,
        keywords: ['network suppliers', 'find suppliers'],
      },
      { label: 'Rates overview', href: '/rates', icon: Tag, roles: AM, keywords: ['rates', 'rates hub', 'rate sheets'] },
      { label: 'Rates check', href: '/rates/check', icon: ScanLine, roles: AM },
    ],
    groups: RATE_GROUPS.map(g => ({
      key: `rates-${g.key}`,
      title: g.title,
      items: g.categories.map(c => ({ label: c.label, href: `/rates/${c.slug}`, icon: c.icon, roles: AM, keywords: ['rates'] })),
    })),
  },
  {
    key: 'contacts',
    title: 'Contacts',
    items: [
      { label: 'Clients', href: '/clients', icon: User, roles: ALL, keywords: ['customers', 'crm'] },
      { label: 'Partners', href: '/b2b/partners', icon: Handshake, roles: AM, keywords: ['b2b'] },
      {
        label: 'Team', href: '/settings/staff-directory', icon: Users, roles: AM,
        keywords: ['staff directory', 'team members', 'guides', 'drivers'],
      },
    ],
  },
  {
    key: 'finance',
    title: 'Finance',
    items: [
      { label: 'Invoices', href: '/invoices', icon: ReceiptText, roles: ALL },
      // The Unpaid tab of Invoices (was /accounts-receivable).
      { label: 'Receivables', href: '/invoices?tab=unpaid', icon: Wallet, roles: AM, keywords: ['unpaid invoices'] },
      { label: 'Payments', href: '/payments', icon: CreditCard, roles: ALL },
      // The Receipts tab of Payments (was /receipts).
      { label: 'Receipts', href: '/payments?tab=receipts', icon: Receipt, roles: ALL },
      { label: 'Supplier bills', href: '/supplier-bills', icon: FileText, roles: AM, match: ['/supplier-invoices'], keywords: ['supplier invoices'] },
      // The Payables tab of Supplier bills (was /accounts-payable).
      { label: 'Payables', href: '/supplier-bills?tab=payables', icon: HandCoins, roles: AM, keywords: ['unpaid costs'] },
      { label: 'Expenses', href: '/expenses', icon: Wallet, roles: ALL },
      { label: 'Commissions', href: '/commissions', icon: Percent, roles: AM },
      { label: 'Profit & loss', href: '/profit-loss', icon: ChartLine, roles: AM, keywords: ['p&l'] },
    ],
  },
]

/** Pinned at the bottom of the main sidebar. Everyone has the Account group. */
export const SETTINGS_LINK: NavItem = {
  label: 'Settings', href: '/settings/profile', icon: Settings, roles: ALL_AND_VIEWER,
  match: ['/settings'],
}

// ============================================
// SETTINGS AREA
// ============================================

export interface SettingsItem extends NavItem {
  /** The one-line description under the page's H1. */
  description: string
  /** Shows the "Admins only" badge. */
  adminOnly?: boolean
}

export interface SettingsGroup {
  key: string
  title: string
  items: SettingsItem[]
}

export const SETTINGS_NAV: SettingsGroup[] = [
  {
    key: 'account',
    title: 'Account',
    items: [
      {
        label: 'Profile', href: '/settings/profile', icon: User, roles: ALL_AND_VIEWER,
        description: 'Your name, photo and password.',
      },
      {
        label: 'Email & signature', href: '/settings/email', icon: Mail, roles: ALL,
        match: ['/settings/email-signatures'], keywords: ['gmail', 'email signatures'],
        description: 'Connect your Gmail and manage the signatures your replies carry.',
      },
      {
        label: 'Notifications', href: '/settings/notifications', icon: Bell, roles: ALL_AND_VIEWER,
        description: 'What you are told about, and where.',
      },
    ],
  },
  {
    key: 'organization',
    title: 'Organization',
    items: [
      {
        label: 'Company', href: '/settings/company', icon: Building, roles: A, adminOnly: true,
        keywords: ['organization', 'tenant', 'logo', 'branding'],
        description: 'Your company’s name, brand and contact details.',
      },
      {
        label: 'Departments', href: '/settings/departments', icon: Network, roles: AM,
        description: 'Group staff by the work they handle, and route generated tasks to them.',
      },
      {
        label: 'Team & roles', href: '/settings/team', icon: UserCog, roles: A, adminOnly: true,
        keywords: ['users', 'user management', 'invite', 'roles'],
        description: 'Who can sign in, and what each person may do.',
      },
      {
        // Not the logins: guides, drivers and office staff tasks are assigned
        // to, most of whom never sign in. Managers keep it, as before.
        label: 'Staff directory', href: '/settings/staff-directory', icon: Users, roles: AM,
        keywords: ['team members', 'guides', 'drivers'],
        description: 'The people work is assigned to: office staff, guides and drivers, with or without a login.',
      },
      {
        // Where the agency books suppliers from, and suppliers waiting to have
        // their sign-in confirmed (operator, 2026-10-31: it was hard to find).
        label: 'Supplier network', href: '/settings/supplier-network', icon: Network, roles: AM,
        keywords: ['supplier sourcing', 'network suppliers', 'supplier sign-in'],
        description: 'Where you book suppliers from, and suppliers waiting to have their sign-in confirmed.',
      },
      {
        label: 'Billing & plan', href: '/settings/billing', icon: CreditCard, roles: A, adminOnly: true,
        keywords: ['subscription', 'invoices', 'plan'],
        description: 'Your plan, usage and invoices from Autoura.',
      },
    ],
  },
  {
    key: 'pricing',
    title: 'Pricing',
    items: [
      {
        label: 'Pricing defaults', href: '/settings/pricing', icon: Calculator, roles: A, adminOnly: true,
        keywords: ['markup', 'margin', 'tier', 'cost mode', 'preferences'],
        description: 'Used for every new quote and itinerary. Each itinerary can still override them.',
      },
      {
        label: 'Currencies & rates', href: '/settings/currencies', icon: Banknote, roles: A, adminOnly: true,
        keywords: ['exchange rates', 'currency', 'conversion buffer'],
        description: 'Clients are charged in EUR. These rates convert quotes shown in other currencies.',
      },
      {
        label: 'Seasonal premiums', href: '/settings/seasons', icon: CalendarRange, roles: AM,
        keywords: ['demand calendar', 'peak dates', 'seasons'],
        description: 'Your own peak dates, and the premium you charge on them.',
      },
    ],
  },
  {
    key: 'catalog',
    title: 'Catalog',
    items: [
      {
        label: 'Destinations', href: '/settings/destinations', icon: Globe, roles: A, adminOnly: true,
        keywords: ['countries', 'cities'],
        description: 'The countries you operate and the cities you sell. Every city dropdown follows this list.',
      },
      {
        label: 'Day blocks', href: '/settings/day-blocks', icon: Blocks, roles: A, adminOnly: true,
        description: 'Your standard days, kept once: what each includes and where its night is.',
      },
      {
        label: 'Attraction names', href: '/settings/attraction-names', icon: Signpost, roles: A, adminOnly: true,
        keywords: ['aliases'],
        description: 'Which entrance fee each way of naming a sight means.',
      },
      {
        label: 'Vocabulary', href: '/settings/vocabulary', icon: BookA, roles: A, adminOnly: true,
        keywords: ['your vocabulary', 'tiers', 'vehicle types', 'dropdowns'],
        description: 'The words your agency works with. Every dropdown in the app follows them.',
      },
    ],
  },
  {
    key: 'messaging',
    title: 'Messaging',
    items: [
      {
        label: 'Message templates', href: '/settings/message-templates', icon: MessageSquare, roles: ALL,
        keywords: ['templates'],
        description: 'Ready-made messages for email and WhatsApp. Composers offer them through “Insert template”.',
      },
      {
        label: 'WhatsApp', href: '/settings/whatsapp', icon: MessageCircle, roles: A, adminOnly: true,
        description: 'Your WhatsApp Business connection.',
      },
    ],
  },
  {
    key: 'content',
    title: 'Content & AI',
    items: [
      {
        label: 'Content library', href: '/settings/content-library', icon: Library, roles: AM,
        description: 'The descriptions the Copilot and the itinerary writer draw on.',
      },
      {
        label: 'Writing rules', href: '/settings/writing-rules', icon: PenLine, roles: AM,
        description: 'How your content should read: the style every generated text follows.',
      },
      {
        label: 'AI prompts', href: '/settings/ai-prompts', icon: Sparkles, roles: AM,
        keywords: ['prompt templates'],
        description: 'The prompts used to generate content.',
      },
      {
        label: 'Copilot knowledge', href: '/settings/copilot-knowledge', icon: Brain, roles: AM,
        keywords: ['knowledge base'],
        description: 'Everything the Copilot draws on when drafting replies.',
      },
      {
        label: 'Copilot settings', href: '/settings/copilot', icon: Bot, roles: A, adminOnly: true,
        description: 'Workspace-wide Copilot behaviour.',
      },
    ],
  },
]

/** Who may open the rate sheets (same as the Rates link). */
export const RATES_ROLES: PermissionRole[] = AM

// ============================================
// PAGES ONLY ⌘K LISTS
// ============================================
//
// Reached from inside another page (a tab, a button) rather than a link of
// their own. Until each merge lands they are also how the folded pages stay
// one keystroke away.

export interface JumpPage {
  label: string
  href: string
  icon: LucideIcon
  roles: PermissionRole[]
  /** Shown beside the label: where the page lives. */
  hint: string
  keywords?: string[]
}

export const JUMP_ONLY_PAGES: JumpPage[] = [
  { label: 'Financial reports', href: '/reports?tab=finance', icon: ChartColumn, roles: AM, hint: 'Reports' },
  { label: 'Copilot analytics', href: '/reports?tab=copilot', icon: ChartColumn, roles: AM, hint: 'Reports' },
  { label: 'B2C quotes', href: '/quotes?tab=b2c', icon: File, roles: ALL, hint: 'Quotes' },
  { label: 'B2B quotes', href: '/quotes?tab=b2b', icon: File, roles: AM, hint: 'Quotes' },
  { label: 'New itinerary', href: '/itineraries/new', icon: Map, roles: ALL, hint: 'Itineraries' },
  { label: 'Follow-ups', href: '/tasks?type=follow-up', icon: Clock, roles: ALL, hint: 'Tasks', keywords: ['reminders'] },
  { label: 'Capacity calendar', href: '/departures?view=capacity', icon: CalendarRange, roles: A, hint: 'Departures' },
]

/** Where Settings' "← Back to app" goes: the last page opened outside it. */
export const LAST_APP_PATH_KEY = 'autoura-last-app-path'

// ============================================
// HELPERS
// ============================================

export function canSee(roles: PermissionRole[], role: PermissionRole): boolean {
  return roles.includes(role)
}

/** The main sidebar for one role: hidden items dropped, empty sections dropped. */
export function mainNavFor(role: PermissionRole): NavSection[] {
  return MAIN_NAV
    .map(section => ({
      ...section,
      items: section.items.filter(i => canSee(i.roles, role)),
      groups: section.groups
        ?.map(g => ({ ...g, items: g.items.filter(i => canSee(i.roles, role)) }))
        .filter(g => g.items.length > 0),
    }))
    .filter(section => section.items.length > 0 || (section.groups?.length ?? 0) > 0)
}

/** Every link in a section, its groups' included. */
export function sectionItems(section: NavSection): NavItem[] {
  return [...section.items, ...(section.groups ?? []).flatMap(g => g.items)]
}

export function settingsNavFor(role: PermissionRole): SettingsGroup[] {
  return SETTINGS_NAV
    .map(group => ({ ...group, items: group.items.filter(i => canSee(i.roles, role)) }))
    .filter(group => group.items.length > 0)
}

function covers(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/**
 * The one entry that is "the current page": the longest href (or match path)
 * covering the path wins, so /tours/manage is Tours, not Inventory, and
 * /rates/check is Rates check, not Rates. Entries sharing a path (Inbox,
 * Email and WhatsApp are all /inbox?channel=…) are told apart by the query:
 * the one whose parameters the address carries; with none of them, the
 * first listed (Inbox — the page's default tab).
 */
export function activeHref<T extends Pick<NavItem, 'href' | 'match'>>(items: T[], pathname: string, search = ''): string | null {
  const here = new URLSearchParams(search)
  let best: { href: string; len: number; query: number } | null = null
  for (const item of items) {
    for (const target of [item.href, ...(item.match ?? [])]) {
      const [path, query = ''] = target.split('?')
      if (!covers(path, pathname)) continue
      const wanted = [...new URLSearchParams(query)]
      if (wanted.some(([k, v]) => here.has(k) && here.get(k) !== v)) continue
      const score = wanted.filter(([k, v]) => here.get(k) === v).length
      if (!best || path.length > best.len || (path.length === best.len && score > best.query)) {
        best = { href: item.href, len: path.length, query: score }
      }
    }
  }
  return best?.href ?? null
}

/** The settings entry (and its group) a path belongs to. */
export function settingsEntryFor(pathname: string): { group: SettingsGroup; item: SettingsItem } | null {
  const all = SETTINGS_NAV.flatMap(group => group.items.map(item => ({ group, item })))
  const href = activeHref(all.map(e => e.item), pathname)
  return href ? all.find(e => e.item.href === href) ?? null : null
}

export function rateCategoryHref(slug: string): string {
  return `/rates/${slug}`
}
