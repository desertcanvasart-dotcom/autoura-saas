'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
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

interface Client {
  id: string
  client_code: string
  first_name: string
  last_name: string
  email: string
  phone?: string
  nationality?: string
  passport_type?: string
  preferred_language?: string
  preferred_contact_method?: string
  client_type: string
  vip_status: boolean
  status: string
  total_bookings_count: number
  total_revenue_generated: number
  average_booking_value: number
  created_at: string
  last_contacted_at?: string
  internal_notes?: string
  company_name?: string
  special_interests?: string[]
  tags?: string[]
}

interface Communication {
  id: string
  communication_type: string
  direction: string
  subject?: string
  content?: string
  communication_date: string
  handled_by?: string
  status: string
}

interface Followup {
  id: string
  followup_type: string
  title: string
  due_date: string
  status: string
  priority: string
  description: string
}

interface Note {
  id: string
  note_type: string
  title?: string
  content: string
  is_important: boolean
  created_at: string
  created_by?: string
}
const supabase = createClient()

export default function ClientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params?.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [communications, setCommunications] = useState<Communication[]>([])
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

      // Fetch communications
      const { data: commData } = await supabase
        .from('communication_history')
        .select('*')
        .eq('client_id', clientId)
        .order('communication_date', { ascending: false })
        .limit(10)
      setCommunications(commData || [])

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
  
  const getStatusColor = (status: string) => {
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
                    {client.first_name[0]}{client.last_name[0]}
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
                  €{client.total_revenue_generated.toLocaleString()}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">Revenue</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 text-center">
                <div className="text-xl font-bold text-purple-600">
                  €{client.average_booking_value.toLocaleString()}
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
                    <p className="text-sm font-medium">{new Date(client.created_at).toLocaleDateString()}</p>
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
                          €{booking.total_cost?.toLocaleString()}
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
                  <div key={note.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${
                    note.is_important ? 'border-l-4 border-yellow-500' : ''
                  }`}>
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
                        {note.is_important && (
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {new Date(note.created_at).toLocaleDateString()}
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
                    {note.title && (
                      <h4 className="text-sm font-semibold mb-2">{note.title}</h4>
                    )}
                    <p className="text-sm text-gray-700">{note.content}</p>
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
                            <h4 className="text-sm font-semibold">{followup.title}</h4>
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
                            <div className="flex items-center gap-1 capitalize">
                              <Clock className="w-3 h-3" />
                              {followup.followup_type.replace('_', ' ')}
                            </div>
                          </div>
                          {followup.description && (
                            <p className="text-xs text-gray-700 mt-2 bg-gray-50 p-2 rounded-lg">
                              {followup.description}
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