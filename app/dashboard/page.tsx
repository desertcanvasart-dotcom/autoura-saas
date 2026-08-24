'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Plane, Wallet, Inbox, Eye, FileText, Users, AlertCircle, Activity,
  ArrowRight, Layers, Sparkles,
} from 'lucide-react'
import { createClient } from '@/app/supabase'
import { useTenant } from '@/app/contexts/TenantContext'
import TodayOnTheGround from '@/app/components/TodayOnTheGround'

// ============================================
// THE OPERATOR'S DAY
// ============================================
// This dashboard answers the questions an operator actually opens the app
// with — what departs soon, who owes me money, what needs a reply, who has
// read my proposal, which quotes are going cold — rather than "how big is my
// database?".
//
// It replaced a version whose "Upcoming Trips" card was literally
// `upcomingTrips: 0, // Legacy field`: hardcoded, querying nothing, and so
// reading 0 forever even with trips departing tomorrow. `recentActivity` was
// hardcoded 0 too, which is why "Recent Activity" was permanently empty.
//
// Every figure now comes from /api/dashboard, which reports per-card query
// failures. A number we could not fetch is HIDDEN, never rendered as 0 —
// because an operator acts on these.

interface DashboardData {
  windowDays: number
  departures: {
    count: number
    items: { id: string; reference: string; tripName: string; startDate: string; status: string; balanceDue: number }[]
  }
  outstanding: {
    total: number
    count: number
    overdueCount: number
    overdueTotal: number
    items: { id: string; reference: string; clientName: string; balanceDue: number; dueDate: string | null }[]
  }
  inbox: {
    count: number
    items: { id: string; threadId: string | null; sender: string; snippet: string; channel: string; receivedAt: string }[]
  }
  proposals: {
    count: number
    items: { id: string; itineraryId: string; tripName: string; clientName: string | null; viewCount: number; lastViewedAt: string | null }[]
  }
  quotes: { staleCount: number; expiredCount: number; awaitingCount: number }
  clients: { total: number }
  degraded: { card: string; reason: string }[]
}

const supabase = createClient()

export default function DashboardPage() {
  // Workspace mode is a free preference on every tier, not an entitlement:
  // a B2C-only operator should not be offered B2B entry points. The previous
  // dashboard gated these and dropping that would have been a quiet
  // regression.
  const { showsB2bWorkspace, showsB2cWorkspace } = useTenant()
  const [data, setData] = useState<DashboardData | null>(null)
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const [profile, dashRes] = await Promise.all([
        (async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return null
          const { data } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle()
          return data
        })(),
        fetch('/api/dashboard').then((r) => r.json()),
      ])

      if (profile) {
        const full = profile.full_name || ''
        setUserName(full.split(' ')[0] || '')
      }
      if (!dashRes?.success) throw new Error(dashRes?.error || 'Could not load your dashboard')
      setData(dashRes as DashboardData)
    } catch (e) {
      console.error('Dashboard load failed:', e)
      setError(e instanceof Error ? e.message : 'We couldn’t load your dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[120px] bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-md mx-auto mt-12 bg-white rounded-lg shadow-sm border border-danger/30 p-6 text-center">
          <AlertCircle className="w-10 h-10 text-danger mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Couldn’t load your dashboard</h2>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => { setLoading(true); load() }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Activity className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { departures, outstanding, inbox, proposals, quotes, clients, degraded } = data
  const failed = (card: string) => degraded.some((d) => d.card === card)
  const money = (n: number) =>
    `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome Back{userName ? `, ${userName}` : ''}! 👋
        </h1>
        <p className="text-sm text-gray-600 mt-1">Here’s what needs you today.</p>
      </div>

      {degraded.length > 0 && (
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
          <p className="text-xs text-gray-700">
            Some figures couldn’t be loaded ({degraded.map((d) => d.card).join(', ')}), so they’re
            shown as “—” rather than zero. Refresh to try again.
          </p>
        </div>
      )}

      {/* The four questions an operator opens the app with */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title={`Departing in ${data.windowDays} days`}
          value={failed('departures') ? '—' : departures.count}
          icon={Plane}
          href="/bookings"
          color="primary"
          subtitle={
            failed('departures') ? 'Unavailable'
              : departures.items[0] ? `Next: ${fmtDate(departures.items[0].startDate)}`
              : 'Nothing scheduled'
          }
        />
        <StatCard
          title="Outstanding"
          value={failed('outstanding') ? '—' : money(outstanding.total)}
          icon={Wallet}
          href="/invoices"
          color={outstanding.overdueCount > 0 ? 'orange' : 'primary'}
          subtitle={
            failed('outstanding') ? 'Unavailable'
              : outstanding.overdueCount > 0
                ? `${outstanding.overdueCount} overdue · ${money(outstanding.overdueTotal)}`
                : outstanding.count > 0
                  ? `${outstanding.count} open invoice${outstanding.count === 1 ? '' : 's'}`
                  : 'All settled'
          }
        />
        <StatCard
          title="Needs a reply"
          value={failed('inbox') ? '—' : inbox.count}
          icon={Inbox}
          href="/inbox"
          color="purple"
          subtitle={failed('inbox') ? 'Unavailable' : inbox.count === 0 ? 'Inbox clear' : 'Unanswered messages'}
        />
        <StatCard
          title="Quotes awaiting client"
          value={failed('quotes') ? '—' : quotes.awaitingCount}
          icon={FileText}
          href="/quotes/b2c"
          color="warning"
          subtitle={
            failed('quotes') ? 'Unavailable'
              : quotes.staleCount > 0 ? `${quotes.staleCount} with no reply in 5+ days`
              : quotes.expiredCount > 0 ? `${quotes.expiredCount} expired`
              : 'Nothing waiting'
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* The execution layer's cross-trip view: every trip running today
            with its latest checkpoint (staff tap-links / trip_events). */}
        <TodayOnTheGround />
        <Panel
          title="Departing soon"
          icon={Plane}
          href="/bookings"
          empty={departures.items.length === 0}
          emptyIcon={Plane}
          emptyTitle={`No trips in the next ${data.windowDays} days`}
          emptyHint="Confirmed bookings appear here as their departure approaches."
        >
          {departures.items.map((d) => {
            const days = daysFromToday(d.startDate)
            return (
              <Link key={d.id} href={`/bookings/${d.id}`} className="flex items-center justify-between py-2.5 px-1 hover:bg-gray-50 rounded transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.tripName}</p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(d.startDate)}
                    {days !== null && ` · ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`}
                  </p>
                </div>
                {d.balanceDue > 0 && (
                  <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2 py-1 rounded shrink-0 ml-3">
                    {money(d.balanceDue)} due
                  </span>
                )}
              </Link>
            )
          })}
        </Panel>

        {/* The signal nothing else in the app surfaces: itinerary_shares
            records view_count and last_viewed_at, and until now nothing read
            them. Knowing a client opened their proposal three times tells a
            salesperson exactly who to call. */}
        <Panel
          title="Clients reading their proposal"
          icon={Eye}
          href="/itineraries"
          empty={proposals.items.length === 0}
          emptyIcon={Eye}
          emptyTitle="No proposals opened yet"
          emptyHint="Share an itinerary link and you’ll see here when the client opens it."
        >
          {proposals.items.map((p) => (
            <Link key={p.id} href={`/itineraries/${p.itineraryId}`} className="flex items-center justify-between py-2.5 px-1 hover:bg-gray-50 rounded transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.tripName}</p>
                <p className="text-xs text-gray-500 truncate">
                  {p.clientName ? `${p.clientName} · ` : ''}
                  opened {p.viewCount}×{p.lastViewedAt ? ` · ${timeAgo(p.lastViewedAt)}` : ''}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 ml-3" />
            </Link>
          ))}
        </Panel>

        <Panel
          title="Largest balances owed"
          icon={Wallet}
          href="/invoices"
          empty={outstanding.items.length === 0}
          emptyIcon={Wallet}
          emptyTitle="Nothing outstanding"
          emptyHint="You’re all paid up — unpaid invoices will appear here."
        >
          {outstanding.items.map((i) => {
            const d = i.dueDate ? daysFromToday(i.dueDate) : null
            const overdue = d !== null && d < 0
            return (
              <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between py-2.5 px-1 hover:bg-gray-50 rounded transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{i.clientName || i.reference}</p>
                  <p className="text-xs text-gray-500">{i.dueDate ? `Due ${fmtDate(i.dueDate)}` : 'No due date'}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ml-3 ${overdue ? 'text-red-700 bg-red-50' : 'text-gray-700 bg-gray-100'}`}>
                  {money(i.balanceDue)}
                </span>
              </Link>
            )
          })}
        </Panel>

        <Panel
          title="Waiting on your reply"
          icon={Inbox}
          href="/inbox"
          empty={inbox.items.length === 0}
          emptyIcon={Inbox}
          emptyTitle="Inbox clear"
          emptyHint="New client messages land here across email and WhatsApp."
        >
          {inbox.items.map((m) => (
            <Link key={m.id} href="/inbox" className="flex items-start justify-between py-2.5 px-1 hover:bg-gray-50 rounded transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.sender || 'Unknown sender'}</p>
                <p className="text-xs text-gray-500 truncate">{m.snippet}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0 ml-3 mt-0.5">
                {m.channel}
              </span>
            </Link>
          ))}
        </Panel>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            href={showsB2cWorkspace ? '/itineraries/new' : '/tours/manage'}
            icon={Sparkles}
            title="New Quote"
            hint={showsB2cWorkspace ? 'Create an itinerary' : 'Create a B2B package'}
          />
          <QuickAction href="/rates" icon={Layers} title="Rates Hub" hint="Hotels, guides & services" />
          {showsB2bWorkspace && (
            <QuickAction href="/tours/manage" icon={FileText} title="B2B Packages" hint="Ready-made tours" />
          )}
          <QuickAction href="/clients" icon={Users} title="Clients" hint={`${clients.total} total`} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// Presentation helpers
// ============================================

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Mirrors lib/dashboard-metrics.daysUntil: UTC-anchored, null-safe, no NaN. */
function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return null
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const target = new Date(t); target.setUTCHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const mins = Math.floor((Date.now() - t) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatCard({
  title, value, icon: Icon, href, color = 'primary', subtitle,
}: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  href: string
  color?: 'primary' | 'warning' | 'purple' | 'orange'
  subtitle?: string
}) {
  const dotColors = {
    primary: 'bg-primary-600',
    warning: 'bg-warning',
    purple: 'bg-purple-600',
    orange: 'bg-orange-600',
  }
  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow h-full min-h-[120px] flex flex-col">
        <div className="flex items-start justify-between flex-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-gray-600">{title}</p>
              <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
            {subtitle && <p className="text-xs text-gray-600 mt-1 truncate">{subtitle}</p>}
          </div>
          <Icon className="w-5 h-5 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0 ml-2" />
        </div>
      </div>
    </Link>
  )
}

function Panel({
  title, icon: Icon, href, children, empty, emptyIcon: EmptyIcon, emptyTitle, emptyHint,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  children: React.ReactNode
  empty: boolean
  emptyIcon: React.ComponentType<{ className?: string }>
  emptyTitle: string
  emptyHint: string
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        <Link href={href} className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* An empty state names what to do next. A tenant with no data yet should
          learn the next step, not read a wall of zeros that looks broken. */}
      {empty ? (
        <div className="text-center py-8">
          <EmptyIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{emptyTitle}</p>
          <p className="text-xs text-gray-400 mt-1">{emptyHint}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">{children}</div>
      )}
    </div>
  )
}

function QuickAction({
  href, icon: Icon, title, hint,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint: string
}) {
  return (
    <Link href={href} className="border border-gray-200 rounded-lg p-3 hover:border-primary-300 hover:bg-gray-50 transition-colors group">
      <Icon className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors mb-2" />
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500">{hint}</p>
    </Link>
  )
}
