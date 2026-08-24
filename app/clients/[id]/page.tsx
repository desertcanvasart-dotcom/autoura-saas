'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import { useParams, useRouter } from 'next/navigation'
import ClientTimeline from '@/components/ClientTimeline'
import AddFollowupModal from '@/components/AddFollowupModal'
import AddNoteModal from '@/components/AddNoteModal'
import LogCommunicationModal from '@/components/LogCommunicationModal'

import Link from 'next/link'
import {
  User, Mail, Phone, MapPin, Calendar, Star, TrendingUp, MessageSquare,
  FileText, Clock, AlertCircle, CheckCircle, Edit, Trash2, Plus, ArrowLeft,
  Building, Globe, CreditCard, Tag, Bell, Heart
} from 'lucide-react'
import RequireFeature from '@/components/RequireFeature'
import { useTenant } from '@/app/contexts/TenantContext'
import { formatCurrency } from '@/lib/currency'

interface Client {
  id: string
  client_code: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone?: string | null
  nationality?: string | null
  passport_type?: string | null
  preferred_language?: string | null
  preferred_contact_method?: string | null
  client_type: string | null
  vip_status: boolean | null
  status: string | null
  total_bookings_count: number | null
  total_revenue_generated: number | null
  average_booking_value: number | null
  created_at: string | null
  last_contacted_at?: string | null
  internal_notes?: string | null
  company_name?: string | null
  special_interests?: string[] | null
  tags?: string[] | null
}

interface LinkedEmail {
  id: string
  message_id: string
  email_address: string | null
  subject: string | null
  snippet: string | null
  sent_at: string | null
  auto_linked: boolean
  created_at: string
}

interface Communication {
  id: string
  communication_type: string
  direction: string
  subject?: string | null
  content?: string
  communication_date: string
  status: string
}

interface Followup {
  id: string
  due_date: string
  status: string
  priority: string
  description: string
  notes: string | null
}

interface Note {
  id: string
  note_type: string
  note_text: string
  created_at: string | null
  created_by?: string | null
}
const supabase = createClient()

export default function ClientProfilePage() {
  const params = useParams()
  const { tenant } = useTenant()

  // The agency's billing currency. Falls back to EUR only while the tenant is
  // still loading (useTenant returns a null tenant during SSR) — NOT as a
  // default, because tenants genuinely differ and one already bills in USD.
  const tenantCurrency = tenant?.default_currency || 'EUR'

  const router = useRouter()
  const clientId = params?.id as string

  const [client, setClient] = useState<Client | null>(null)
  // Revenue over bookings. null when there is nothing to divide, or when the
  // revenue itself could not be computed — never a fabricated 0.
  const avgBookingValue: number | null = (() => {
    const rev = client?.total_revenue_generated
    const n = client?.total_bookings_count
    if (rev === null || rev === undefined || !n) return null
    return Number(rev) / n
  })()
  const [communications, setCommunications] = useState<Communication[]>([])
  // Emails linked to this client from the inbox (email_client_links). Rendered
  // from the snapshot stored on the link — message ids are per-mailbox, so
  // fetching from Gmail here would only work for whoever synced the mailbox.
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmail[]>([])
  const [followups, setFollowups] = useState<Followup[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'communications' | 'bookings' | 'notes' | 'followups'>('overview')
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false)
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false) 
  const [isCommunicationModalOpen, setIsCommunicationModalOpen] = useState(false)  
  const [editingFollowup, setEditingFollowup] = useState<any>(null)
  const [editingNote, setEditingNote] = useState<any>(null)
  const [editingCommunication, setEditingCommunication] = useState<any>(null) 

  const reloadFollowups = () => {
    fetchClientData()
  }
  
  const reloadNotes = () => {
    fetchClientData()
    
  }

  const reloadCommunications = () => {
    fetchClientData()
  }

  // Mark followup as complete
  const markFollowupComplete = async (followupId: string) => {
    try {
      const { error } = await supabase
        .from('client_followups')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', followupId)

      if (error) throw error
      
      fetchClientData() // Reload data
    } catch (error) {
      console.error('Error marking followup complete:', error)
    }
  }

  useEffect(() => {
    if (clientId) {
      fetchClientData()
    }
  }, [clientId])

  const fetchClientData = async () => {
    try {
      setLoading(true)

      // Fetch client details
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

      if (clientError) throw clientError
      setClient(clientData)

      // Fetch communications. The error used to be discarded, so when the
      // table did not exist this panel showed "no communications" on every
      // client rather than a failure — which is why nobody noticed for months.
      const { data: commData, error: commError } = await supabase
        .from('communication_history')
        .select('*')
        .eq('client_id', clientId)
        .order('communication_date', { ascending: false })
        .limit(10)
      if (commError) console.error('Failed to load communications:', commError)
      setCommunications(commData || [])

      // Linked emails go through the API: the table is service-role-only, so a
      // browser read would silently return nothing (the gmail_tokens lesson).
      try {
        const linksRes = await fetch(`/api/email/links?clientId=${clientId}`)
        const linksJson = await linksRes.json()
        setLinkedEmails(linksJson.links || [])
      } catch (err) {
        console.error('Failed to load linked emails:', err)
      }

      // Fetch follow-ups
      const { data: followupData } = await supabase
        .from('client_followups')
        .select('*')
        .eq('client_id', clientId)
        .order('due_date', { ascending: true })
      setFollowups(followupData || [])

      // Fetch notes
      const { data: notesData } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      setNotes(notesData || [])

      // Fetch bookings
      const { data: bookingsData } = await supabase
        .from('itineraries')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      setBookings(bookingsData || [])

    } catch (error) {
      console.error('Error fetching client data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-3 text-sm text-gray-600">Loading client profile...</p>
        </div>
      </div>
    )
  }
  
  if (!client) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Client Not Found</h2>
          <p className="text-sm text-gray-600 mb-4">The client you're looking for doesn't exist.</p>
          <Link
            href="/clients"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Clients
          </Link>
        </div>
      </div>
    )
  }
  
  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'prospect': return 'bg-blue-100 text-blue-800'
      case 'blacklisted': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  
  const pendingFollowups = followups.filter(f => f.status === 'pending')
  const overdueFollowups = pendingFollowups.filter(f => new Date(f.due_date) < new Date())

  return (
    <RequireFeature feature="b2c">
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/clients"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Clients
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={`/clients/${clientId}/edit`}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
              >
                <Edit className="w-4 h-4" />
                Edit Client
              </Link>
              <button className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>

          {/* Client Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* Avatar - Smaller */}
              <div className="flex-shrink-0">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-xl font-bold text-white">
                    {client.first_name?.[0]}{client.last_name?.[0]}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {client.first_name} {client.last_name}
                  </h1>
                  {client.vip_status && (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(client.status)}`}>
                    {client.status}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                    {client.client_type}
                  </span>
                  <span className="px-2 py-0.5 text-xs text-gray-600 bg-gray-100 rounded-full">
                    {client.client_code}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3 h-3" />
                    <a href={`mailto:${client.email}`} className="hover:text-blue-600">
                      {client.email}
                    </a>
                  </div>
                  {client.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-3 h-3" />
                      <a href={`tel:${client.phone}`} className="hover:text-blue-600">
                        {client.phone}
                      </a>
                    </div>
                  )}
                  {client.nationality && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Globe className="w-3 h-3" />
                      {client.nationality}
                    </div>
                  )}
                  {client.company_name && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Building className="w-3 h-3" />
                      {client.company_name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats - Compact */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 text-center">
                <div className="text-xl font-bold text-blue-600">
                  {client.total_bookings_count}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Bookings</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 text-center">
                <div className="text-xl font-bold text-green-600">
                  {/*
                    NULL means migration 284 could not compute this — a booking
                    in a currency with no conversion path. Rendering it as 0
                    would say "this client generated nothing", which is the
                    unset-vs-zero conflation the whole schema work removed.
                  */}
                  {client.total_revenue_generated === null || client.total_revenue_generated === undefined
                    ? <span className="text-gray-400" title="Some bookings are in a currency with no exchange rate">&mdash;</span>
                    : formatCurrency(Number(client.total_revenue_generated), tenantCurrency)}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Revenue</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 text-center">
                <div className="text-xl font-bold text-purple-600">
                  {/*
                    DERIVED, not read. clients.average_booking_value is a column
                    nothing has ever written — 0 on every row — so it rendered
                    as a zero amount beside a real revenue figure. Revenue over bookings
                    is exact and cannot drift from the two values shown next to
                    it, so there is nothing to store.
                  */}
                  {avgBookingValue === null
                    ? <span className="text-gray-400">&mdash;</span>
                    : formatCurrency(avgBookingValue, tenantCurrency)}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Avg Value</div>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {overdueFollowups.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-800 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span className="font-semibold">
                  {overdueFollowups.length} overdue follow-up{overdueFollowups.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-6">
            {[
              { id: 'overview', label: 'Overview', icon: User },
              { id: 'communications', label: 'Communications', icon: MessageSquare, count: communications.length },
              { id: 'bookings', label: 'Bookings', icon: Calendar, count: bookings.length },
              { id: 'notes', label: 'Notes', icon: FileText, count: notes.length },
              { id: 'followups', label: 'Follow-ups', icon: Clock, count: pendingFollowups.length }
            ].map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 px-2 border-b-2 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                      activeTab === tab.id
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-4">
            {/* Main Info */}
            <div className="col-span-2 space-y-4">
              {/* Personal Information */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold mb-3">Personal Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Preferred Language</label>
                    <p className="text-sm font-medium">{client.preferred_language || 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Passport Type</label>
                    <p className="text-sm font-medium">{client.passport_type || 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Preferred Contact</label>
                    <p className="text-sm font-medium">{client.preferred_contact_method || 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Member Since</label>
                    <p className="text-sm font-medium">{client.created_at ? new Date(client.created_at).toLocaleDateString() : 'Not specified'}</p>
                  </div>
                </div>
              </div>

              {/* Interests & Preferences */}
              {client.special_interests && client.special_interests.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-base font-semibold mb-3">Special Interests</h3>
                  <div className="flex flex-wrap gap-2">
                    {client.special_interests.map((interest, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Internal Notes */}
              {client.internal_notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                    Internal Notes
                  </h3>
                  <p className="text-sm text-gray-700">{client.internal_notes}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold mb-3">Quick Actions</h3>
                <div className="space-y-2">
                <Link
               href={`/whatsapp-parser?clientId=${clientId}`}
               className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 text-sm rounded-lg hover:bg-blue-100"
                 >
                <Plus className="w-4 h-4" />
                New Booking
                </Link>
                <button 
                   onClick={() => setIsCommunicationModalOpen(true)}
                   className="w-full flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 text-sm rounded-lg hover:bg-green-100"
                   >
                   <MessageSquare className="w-4 h-4" />
                   Log Communication
                    </button>
                  <button 
                   onClick={() => setIsFollowupModalOpen(true)}
                   className="w-full flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 text-sm rounded-lg hover:bg-purple-200"
                    >
                  <Clock className="w-4 h-4" />
                  Add Follow-up
                   </button>
                   <button 
                   onClick={() => setIsNoteModalOpen(true)}
                   className="w-full flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 text-sm rounded-lg hover:bg-orange-100"
                     >
                   <FileText className="w-4 h-4" />
                  Add Note
                   </button>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold mb-3">Recent Activity</h3>
                <div className="space-y-2">
                  {client.last_contacted_at && (
                    <div className="text-sm">
                      <p className="text-xs text-gray-600">Last Contact</p>
                      <p className="font-medium">
                        {new Date(client.last_contacted_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {communications.length > 0 && (
                    <div className="text-sm">
                      <p className="text-xs text-gray-600">Last Communication</p>
                      <p className="font-medium">{communications[0].communication_type}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(communications[0].communication_date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              {client.tags && client.tags.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {client.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Communications Tab */}
        {activeTab === 'communications' && (
          <div>
            {/* Emails linked from the inbox. Shown from the stored snapshot;
                a link made before migration 251 has no snapshot and renders
                its address and link date instead — relink to backfill. */}
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-4">Emails</h2>
              {linkedEmails.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
                  <Mail className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    No emails linked yet. In the Inbox, open an email and use
                    &ldquo;Link to Client&rdquo;.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedEmails.map((em) => (
                    <div key={em.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {em.subject || '(no subject captured — relink this email to refresh)'}
                          </p>
                          {em.snippet && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{em.snippet}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {em.email_address || 'unknown sender'}
                            {' · '}
                            {new Date(em.sent_at || em.created_at).toLocaleString()}
                          </p>
                        </div>
                        {em.auto_linked && (
                          <span className="shrink-0 text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            auto-linked
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Communication History</h2>
              <button 
              onClick={() => {
            setEditingCommunication(null)
            setIsCommunicationModalOpen(true)
      }}
           className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
            <Plus className="w-4 h-4" />
              Log Communication
              </button>
            </div>

            {communications.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No communications logged yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {communications.map((comm) => (
                  <div key={comm.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${
                          comm.communication_type === 'whatsapp' ? 'bg-green-100' :
                          comm.communication_type === 'email' ? 'bg-blue-100' :
                          comm.communication_type === 'phone_call' ? 'bg-purple-100' :
                          'bg-gray-100'
                        }`}>
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold capitalize">{comm.communication_type.replace('_', ' ')}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              comm.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {comm.direction}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {new Date(comm.communication_date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          comm.status === 'completed' ? 'bg-green-100 text-green-800' :
                          comm.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {comm.status}
                        </span>
                        <button
                          onClick={() => {
                            setEditingCommunication(comm)
                            setIsCommunicationModalOpen(true)
                          }}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit communication"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {comm.subject && (
                      <h4 className="text-sm font-semibold mb-2">{comm.subject}</h4>
                    )}
                    {comm.content && (
                      <p className="text-sm text-gray-700">{comm.content}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bookings Tab */}
        {activeTab === 'bookings' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Booking History</h2>
              <Link
               href={`/whatsapp-parser?clientId=${clientId}`}
               className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
               >
              <Plus className="w-4 h-4" />
              New Booking
               </Link>
            </div>

            {bookings.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-3">No bookings yet</p>
                <Link
                href={`/whatsapp-parser?clientId=${clientId}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                 >
                <Plus className="w-4 h-4" />
               Create First Booking
                 </Link>  
              </div>
            ) : (
              <div className="grid gap-3">
                {bookings.map((booking) => (
                  <div key={booking.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold mb-2">{booking.tour_name}</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            {booking.start_date && new Date(booking.start_date).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3" />
                            {booking.number_of_people} people
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600">
                          {/*
                            Each itinerary carries its OWN currency column, and
                            `select('*')` already fetches it. A hard-coded symbol here
                            labelled a USD trip in euros. Falls back to the
                            agency's currency only when the row has none.
                          */}
                          {formatCurrency(Number(booking.total_cost ?? 0), booking.currency || tenantCurrency)}
                        </div>
                        <Link
                          href={`/view-itinerary/${booking.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-block"
                        >
                          View Details →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Client Notes</h2>
              <button 
                onClick={() => {
                  setEditingNote(null)
                  setIsNoteModalOpen(true)
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Note
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No notes added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          note.note_type === 'warning' ? 'bg-red-100 text-red-800' :
                          note.note_type === 'compliment' ? 'bg-green-100 text-green-800' :
                          note.note_type === 'complaint' ? 'bg-orange-100 text-orange-800' :
                          note.note_type === 'preference' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {note.note_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {note.created_at && new Date(note.created_at).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => {
                            setEditingNote(note)
                            setIsNoteModalOpen(true)
                          }}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit note"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700">{note.note_text}</p>
                    {note.created_by && (
                      <p className="text-xs text-gray-500 mt-2">By: {note.created_by}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

         {/* Follow-ups Tab */}
        {activeTab === 'followups' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Follow-ups & Reminders</h2>
              <button 
                onClick={() => {
                  setEditingFollowup(null)
                  setIsFollowupModalOpen(true)
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Follow-up
              </button>
            </div>

            {followups.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600">No follow-ups scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {followups.map((followup) => {
                  const isOverdue = followup.status === 'pending' && new Date(followup.due_date) < new Date()
                  return (
                    <div
                      key={followup.id}
                      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${
                        isOverdue ? 'border-l-4 border-red-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-sm font-semibold">{followup.description}</h4>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                              followup.status === 'completed' ? 'bg-green-100 text-green-800' :
                              followup.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              followup.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {followup.status}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                              followup.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                              followup.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                              followup.priority === 'normal' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {followup.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                                Due: {new Date(followup.due_date).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {followup.notes && (
                            <p className="text-xs text-gray-700 mt-2 bg-gray-50 p-2 rounded-lg">
                              {followup.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {followup.status === 'pending' && (
                            <>
                              <button 
                                onClick={() => markFollowupComplete(followup.id)}
                                className="px-2 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs font-medium"
                              >
                                Mark Complete
                              </button>
                              <button
                                onClick={() => {
                                  setEditingFollowup(followup)
                                  setIsFollowupModalOpen(true)
                                }}
                                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
       </div> 
      {/* Client Timeline */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <ClientTimeline clientId={clientId} />
      </div>
      {/* Add Follow-up Modal */}
      <AddFollowupModal
        isOpen={isFollowupModalOpen}
        onClose={() => {
          setIsFollowupModalOpen(false)
          setEditingFollowup(null)
        }}
        clientId={clientId}
        clientName={`${client?.first_name} ${client?.last_name}`}
        onSuccess={reloadFollowups}
        editFollowup={editingFollowup}
      />

      {/* Add Note Modal */}
      <AddNoteModal
        isOpen={isNoteModalOpen}
        onClose={() => {
          setIsNoteModalOpen(false)
          setEditingNote(null)
        }}
        clientId={clientId}
        clientName={`${client?.first_name} ${client?.last_name}`}
        onSuccess={reloadNotes}
        editNote={editingNote}
      />

      {/* Log Communication Modal */}
      <LogCommunicationModal
  isOpen={isCommunicationModalOpen}
  onClose={() => {
    setIsCommunicationModalOpen(false)
    setEditingCommunication(null)
  }}
  clientId={clientId}
  clientName={`${client?.first_name} ${client?.last_name}`}
  onSuccess={reloadCommunications}
  editCommunication={editingCommunication}
/>

    </div>
    </RequireFeature>
  )
}