'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import { 
  Calendar, MessageSquare, Phone, Mail, FileText, MapPin,
  CheckCircle, Clock, AlertCircle, Users
} from 'lucide-react'

const supabase = createClient()

interface TimelineEvent {
  id: string
  type: 'communication' | 'booking' | 'note' | 'followup' | 'created'
  date: string
  title: string
  description: string
  icon: any
  color: string
  details?: any
}

interface ClientTimelineProps {
  clientId: string
}

export default function ClientTimeline({ clientId }: ClientTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadTimeline()
  }, [clientId])

  const loadTimeline = async () => {
    setIsLoading(true)

    try {
      // Fetch client creation
      const { data: client } = await supabase
        .from('clients')
        .select('created_at, first_name, last_name')
        .eq('id', clientId)
        .single()

      // Fetch communications (error captured — a silent empty timeline is
      // indistinguishable from a client nobody has spoken to).
      const { data: communications, error: commError } = await supabase
        .from('communication_history')
        .select('*')
        .eq('client_id', clientId)
        .order('communication_date', { ascending: false })
      if (commError) console.error('Failed to load communications:', commError)

      // Fetch bookings/itineraries
      const { data: bookings } = await supabase
        .from('itineraries')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

      // Fetch notes
      const { data: notes } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

      // Fetch follow-ups
      const { data: followups } = await supabase
        .from('client_followups')
        .select('*')
        .eq('client_id', clientId)
        .order('due_date', { ascending: false })

      // Combine all events
      const allEvents: TimelineEvent[] = []

      // Client created event
      if (client) {
        allEvents.push({
          id: 'created',
          type: 'created',
          date: client.created_at,
          title: 'Client Created',
          description: `${client.first_name} ${client.last_name} was added to the system`,
          icon: Users,
          color: 'blue'
        })
      }

      // Communication events
      communications?.forEach((comm) => {
        const iconMap: any = {
          'whatsapp': MessageSquare,
          'email': Mail,
          'phone': Phone,
          'meeting': Users
        }

        allEvents.push({
          id: comm.id,
          type: 'communication',
          date: comm.communication_date,
          title: `${comm.communication_type.toUpperCase()} - ${comm.direction}`,
          description: comm.subject || comm.content?.substring(0, 100) || '',
          icon: iconMap[comm.communication_type] || MessageSquare,
          color: comm.direction === 'inbound' ? 'green' : 'purple',
          details: comm
        })
      })

      // Booking events
      bookings?.forEach((booking) => {
        const statusColor: any = {
          'draft': 'gray',
          'sent': 'blue',
          'confirmed': 'green',
          'completed': 'emerald',
          'cancelled': 'red'
        }

        allEvents.push({
          id: booking.id,
          type: 'booking',
          date: booking.created_at,
          title: `Booking: ${booking.trip_name}`,
          description: `${booking.itinerary_code} • €${booking.total_cost} • ${booking.status}`,
          icon: MapPin,
          color: statusColor[booking.status] || 'gray',
          details: booking
        })
      })

      // Note events
      // Note events
      notes?.forEach((note) => {
      allEvents.push({
      id: note.id,
      type: 'note',
      date: note.created_at,
      title: note.note_type === 'internal' ? 'Internal Note' : 'Note',
      description: note.content?.substring(0, 100) || '',  // ← Changed to content
      icon: FileText,
      color: note.is_important ? 'orange' : 'yellow',  // ← Changed to is_important
      details: note
    })
  })

      // Follow-up events
      followups?.forEach((followup) => {
        const statusIcon: any = {
          'pending': Clock,
          'completed': CheckCircle,
          'cancelled': AlertCircle
        }

        allEvents.push({
          id: followup.id,
          type: 'followup',
          date: followup.due_date,
          title: `Follow-up: ${followup.followup_type}`,
          description: followup.notes || 'No notes',
          icon: statusIcon[followup.status] || Clock,
          color: followup.status === 'completed' ? 'green' : 
                 followup.status === 'cancelled' ? 'red' : 'yellow',
          details: followup
        })
      })

      // Sort by date (newest first)
      allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setEvents(allEvents)
    } catch (error) {
      console.error('Error loading timeline:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.type === filter)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  }

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getColorClasses = (color: string) => {
    const colors: any = {
      blue: 'bg-blue-100 text-blue-600 border-blue-200',
      green: 'bg-green-100 text-green-600 border-green-200',
      purple: 'bg-purple-100 text-purple-600 border-purple-200',
      red: 'bg-red-100 text-red-600 border-red-200',
      yellow: 'bg-yellow-100 text-yellow-600 border-yellow-200',
      orange: 'bg-orange-100 text-orange-600 border-orange-200',
      gray: 'bg-gray-100 text-gray-600 border-gray-200',
      emerald: 'bg-emerald-100 text-emerald-600 border-emerald-200'
    }
    return colors[color] || colors.gray
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Client Timeline</h2>
        <div className="text-sm text-gray-600">
          {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Events
        </button>
        <button
          onClick={() => setFilter('communication')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'communication'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Communications
        </button>
        <button
          onClick={() => setFilter('booking')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'booking'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Bookings
        </button>
        <button
          onClick={() => setFilter('note')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'note'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Notes
        </button>
        <button
          onClick={() => setFilter('followup')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'followup'
              ? 'bg-yellow-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Follow-ups
        </button>
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-2">
            <Calendar className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-gray-600">No events in timeline yet</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

          {/* Events */}
          <div className="space-y-6">
            {filteredEvents.map((event) => {
              const Icon = event.icon
              return (
                <div key={event.id} className="relative pl-16">
                  {/* Icon */}
                  <div className={`absolute left-0 w-12 h-12 rounded-full border-4 border-white flex items-center justify-center ${getColorClasses(event.color)}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">{formatDate(event.date)}</div>
                        <div className="text-xs text-gray-400">{formatFullDate(event.date)}</div>
                      </div>
                    </div>

                    {/* Additional Details */}
                    {event.details && event.type === 'booking' && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-gray-500">Dates</div>
                            <div className="font-medium">{event.details.start_date} - {event.details.end_date}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Travelers</div>
                            <div className="font-medium">{event.details.num_adults} adults</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Status</div>
                            <div className={`font-medium capitalize ${
                              event.details.status === 'confirmed' ? 'text-green-600' :
                              event.details.status === 'completed' ? 'text-emerald-600' :
                              event.details.status === 'cancelled' ? 'text-red-600' :
                              'text-gray-600'
                            }`}>
                              {event.details.status}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {event.details && event.type === 'communication' && event.details.content && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-sm text-gray-600 line-clamp-2">
                          {event.details.content}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}