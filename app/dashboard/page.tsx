'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import {
  Users,
  CheckSquare,
  FileText,
  TrendingUp,
  Clock,
  ArrowRight,
  AlertCircle,
  Calendar,
  MessageSquare,
  DollarSign,
  Activity,
  Sparkles,
  MapPin,
  Mail,
  CheckCircle,
  Package,
  CalendarDays,
  Layers
} from 'lucide-react'

const supabase = createClient()

interface DashboardStats {
  totalClients: number
  activeClients: number
  pendingFollowups: number
  overdueFollowups: number
  totalQuotes: number
  quotesSent: number
  quotesConfirmed: number
  upcomingTrips: number
  recentActivity: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    activeClients: 0,
    pendingFollowups: 0,
    overdueFollowups: 0,
    totalQuotes: 0,
    quotesSent: 0,
    quotesConfirmed: 0,
    upcomingTrips: 0,
    recentActivity: 0
  })
  const [recentClients, setRecentClients] = useState<any[]>([])
  const [upcomingFollowups, setUpcomingFollowups] = useState<any[]>([])
  const [recentQuotes, setRecentQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      // Get client stats
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

      const totalClients = clients?.length || 0
      const activeClients = clients?.filter(c => c.status === 'active').length || 0

      // Get followup stats
      const { data: followups } = await supabase
        .from('client_followups')
        .select('*')
        .eq('status', 'pending')

      const pendingFollowups = followups?.length || 0
      const overdueFollowups = followups?.filter(f => 
        new Date(f.due_date) < new Date()
      ).length || 0

      // Get itinerary/quote stats (B2C)
      const quotesRes = await fetch('/api/itineraries')
      const quotesData = await quotesRes.json()
      const quotes = quotesData.data || []

      // Get upcoming trips (next 30 days)
      const today = new Date()
      const thirtyDaysLater = new Date()
      thirtyDaysLater.setDate(today.getDate() + 30)
      
      // Try to get from itineraries with start_date
      const upcomingTrips = quotes.filter((q: any) => {
        if (!q.start_date) return false
        const startDate = new Date(q.start_date)
        return startDate >= today && startDate <= thirtyDaysLater && q.status === 'confirmed'
      }).length

      // Get recent clients
      const recentClients = clients?.slice(0, 5) || []

      // Get upcoming followups
      const { data: upcoming } = await supabase
        .from('client_followups')
        .select(`
          *,
          clients (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('status', 'pending')
        .gte('due_date', new Date().toISOString())
        .order('due_date', { ascending: true })
        .limit(5)

      // Get recent quotes
      const recentQuotes = quotes.slice(0, 5).map((q: any) => ({
        id: q.id,
        action: `Quote ${q.itinerary_code} for ${q.client_name}`,
        time: new Date(q.created_at).toLocaleString(),
        status: q.status
      }))

      setStats({
        totalClients,
        activeClients,
        pendingFollowups,
        overdueFollowups,
        totalQuotes: quotes.length,
        quotesSent: quotes.filter((q: any) => q.status === 'sent' || q.status === 'confirmed').length,
        quotesConfirmed: quotes.filter((q: any) => q.status === 'confirmed').length,
        upcomingTrips,
        recentActivity: 0
      })
      setRecentClients(recentClients)
      setUpcomingFollowups(upcoming || [])
      setRecentQuotes(recentQuotes)
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome Back, Islam! 👋</h1>
        <p className="text-sm text-gray-600 mt-1">
          Here's what's happening with your travel operations today.
        </p>
      </div>

      {/* Quick Stats - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Clients */}
        <StatCard
          title="Total Clients"
          value={stats.totalClients}
          icon={Users}
          trend="+12%"
          trendUp={true}
          href="/clients"
          color="primary"
        />

        {/* Pending Follow-ups */}
        <StatCard
          title="Pending Follow-ups"
          value={stats.pendingFollowups}
          icon={CheckSquare}
          badge={stats.overdueFollowups > 0 ? `${stats.overdueFollowups} overdue` : undefined}
          badgeColor="danger"
          href="/followups"
          color="warning"
        />

        {/* Client Quotes (B2C) */}
        <StatCard
          title="Client Quotes"
          value={stats.totalQuotes}
          icon={FileText}
          trend="+8%"
          trendUp={true}
          href="/itineraries"
          color="purple"
        />

        {/* Upcoming Trips */}
        <StatCard
          title="Upcoming Trips"
          value={stats.upcomingTrips}
          icon={CalendarDays}
          subtitle="Next 30 days"
          href="/calendar"
          color="orange"
        />
      </div>

      {/* Quick Stats - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Quotes Sent */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-gray-600">Quotes Sent</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <Mail className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.quotesSent}</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.totalQuotes > 0 
              ? `${Math.round((stats.quotesSent / stats.totalQuotes) * 100)}% sent rate`
              : '0% sent rate'
            }
          </p>
        </div>

        {/* Confirmed Bookings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-gray-600">Confirmed</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
            </div>
            <CheckCircle className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.quotesConfirmed}</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.quotesSent > 0
              ? `${Math.round((stats.quotesConfirmed / stats.quotesSent) * 100)}% conversion`
              : '0% conversion'
            }
          </p>
        </div>

        {/* Active Clients */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-gray-600">Active Clients</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.activeClients}</p>
          <p className="text-xs text-gray-500 mt-1">Engaged customers</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickActionButton
            icon={MessageSquare}
            label="Parse WhatsApp"
            href="/whatsapp-parser"
            description="AI-powered conversation parser"
            color="bg-success"
          />
          <QuickActionButton
            icon={Sparkles}
            label="New Quote"
            href="/itineraries/new"
            description="Create itinerary from scratch"
            color="bg-purple-500"
          />
          <QuickActionButton
            icon={Layers}
            label="Rates Hub"
            href="/rates"
            description="Manage hotels, guides & services"
            color="bg-primary-600"
          />
          <QuickActionButton
            icon={Package}
            label="B2B Packages"
            href="/tours"
            description="Ready-made tour packages"
            color="bg-warning"
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity - 2 columns */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                Recent Activity
              </h3>
              <Link
                href="/itineraries"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {recentQuotes.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">No quotes yet</p>
                <Link
                  href="/whatsapp-parser"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Create Your First Quote
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentQuotes.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="p-1.5 bg-white rounded-lg border border-gray-200">
                      <FileText className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                    <Link 
                      href={`/itineraries/${activity.id}`}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap"
                    >
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Follow-ups */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                Upcoming Follow-ups
              </h3>
              <Link
                href="/followups"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {upcomingFollowups.length === 0 ? (
              <div className="text-center py-6">
                <CheckSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No upcoming follow-ups</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingFollowups.map((followup) => (
                  <FollowupCard key={followup.id} followup={followup} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-4">
          {/* Today's Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-bold text-gray-900">Today's Summary</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Quotes Created</span>
                <span className="font-bold text-lg text-gray-900">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Quotes Sent</span>
                <span className="font-bold text-lg text-gray-900">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Bookings</span>
                <span className="font-bold text-lg text-gray-900">0</span>
              </div>
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">💡 Quick Tips</h3>
            <div className="space-y-2 text-xs text-gray-700">
              <p>• Use AI parser to extract client details from WhatsApp in seconds</p>
              <p>• Check the Rates Hub for hotel and guide pricing</p>
              <p>• Send quotes via WhatsApp or Email with one click</p>
              <p>• Track your conversion rates in Analytics</p>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">System Status</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">AI Parser</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-xs font-medium text-gray-700">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">B2B Packages</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-xs font-medium text-gray-700">Active</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Email Service</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-xs font-medium text-gray-700">Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  trend?: string
  trendUp?: boolean
  badge?: string
  badgeColor?: 'primary' | 'danger'
  href: string
  color?: 'primary' | 'warning' | 'purple' | 'orange'
  subtitle?: string
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendUp, 
  badge, 
  badgeColor = 'primary',
  href,
  color = 'primary',
  subtitle
}: StatCardProps) {
  
  const dotColors = {
    primary: 'bg-primary-600',
    warning: 'bg-warning',
    purple: 'bg-purple-600',
    orange: 'bg-orange-600'
  }

  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-gray-600">{title}</p>
              <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {trend && (
              <p className={`text-xs mt-1 ${trendUp ? 'text-success' : 'text-danger'}`}>
                {trend} from last month
              </p>
            )}
            {subtitle && (
              <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
            )}
            {badge && (
              <span className={`
                inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-xs font-medium
                ${badgeColor === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary-50 text-primary-700'}
              `}>
                <AlertCircle className="w-3 h-3 mr-1" />
                {badge}
              </span>
            )}
          </div>
          <Icon className="w-4 h-4 text-gray-400" />
        </div>
      </div>
    </Link>
  )
}

// Quick Action Button
function QuickActionButton({ icon: Icon, label, href, description, color }: any) {
  const dotColors: Record<string, string> = {
    'bg-success': 'bg-success',
    'bg-purple-500': 'bg-purple-600',
    'bg-primary-600': 'bg-primary-600',
    'bg-warning': 'bg-warning'
  }

  return (
    <Link
      href={href}
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color] || 'bg-gray-400'}`} />
      </div>
      <h3 className="text-base font-bold text-gray-900">{label}</h3>
      <p className="text-xs text-gray-600 mt-1">{description}</p>
      <p className="text-xs text-gray-500 mt-2 group-hover:text-primary-600">Start now →</p>
    </Link>
  )
}

// Followup Card
function FollowupCard({ followup }: any) {
  const daysUntil = Math.ceil(
    (new Date(followup.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <Link
      href={`/clients/${followup.client_id}`}
      className="block p-3 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/50 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 group-hover:text-primary-700">
            {followup.clients?.first_name} {followup.clients?.last_name}
          </p>
          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
            {followup.description}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">
              {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
            </p>
            <span className={`
              inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium
              ${followup.priority === 'high' ? 'bg-danger/10 text-danger' : ''}
              ${followup.priority === 'medium' ? 'bg-warning/10 text-warning' : ''}
              ${followup.priority === 'low' ? 'bg-gray-200 text-gray-700' : ''}
            `}>
              {followup.priority}
            </span>
          </div>
          <Clock className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors" />
        </div>
      </div>
    </Link>
  )
}