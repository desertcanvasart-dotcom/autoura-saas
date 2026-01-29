// ============================================
// WHATSAPP AI AGENT SERVICE
// ============================================
// Intelligent auto-reply agent for WhatsApp messages
// Uses Claude API to generate context-aware responses
// Version: 2.0 - With Tool Calling Support
// ============================================

import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

// ============================================
// TYPES
// ============================================

export interface ConversationContext {
  clientId: string | null
  clientName: string | null
  phoneNumber: string
  conversationId: string
  recentMessages: Array<{
    direction: 'inbound' | 'outbound'
    content: string
    timestamp: string
  }>
  clientInfo?: {
    fullName: string
    email: string | null
    nationality: string | null
    preferredLanguage: string | null
  }
  activeItineraries?: Array<{
    id: string
    tripName: string
    startDate: string
    endDate: string
    status: string
    totalDays: number
  }>
  activeQuotes?: Array<{
    id: string
    quoteNumber: string
    sellingPrice: number
    currency: string
    status: string
    validUntil: string | null
  }>
}

export interface AIAgentResponse {
  success: boolean
  reply?: string
  shouldRespond: boolean
  confidence: number
  reasoning?: string
  error?: string
  toolsUsed?: string[]
  actionsPerformed?: Array<{
    tool: string
    result: string
    data?: any
  }>
}

// ============================================
// TOOL DEFINITIONS FOR CLAUDE
// ============================================

interface ToolResult {
  success: boolean
  data?: any
  error?: string
  message?: string
}

const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'search_customer_trips',
    description: 'Search for existing itineraries/trips and quotes for the current customer. Use this when the customer asks about their bookings, trips, or quotes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status_filter: {
          type: 'string',
          enum: ['all', 'active', 'upcoming', 'past'],
          description: 'Filter trips by status. "active" = draft/confirmed/in_progress, "upcoming" = future start date, "past" = completed'
        }
      },
      required: []
    }
  },
  {
    name: 'get_quote_details',
    description: 'Get detailed information about a specific quote including pricing breakdown. Use this when customer asks about a specific quote.',
    input_schema: {
      type: 'object' as const,
      properties: {
        quote_number: {
          type: 'string',
          description: 'The quote number (e.g., Q-2024-0001)'
        }
      },
      required: ['quote_number']
    }
  },
  {
    name: 'create_trip_inquiry',
    description: 'Create a new trip inquiry/request based on customer requirements. Use this when customer wants to plan a new trip to Egypt.',
    input_schema: {
      type: 'object' as const,
      properties: {
        trip_name: {
          type: 'string',
          description: 'Descriptive name for the trip (e.g., "7-Day Cairo & Luxor Adventure")'
        },
        destinations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cities/places they want to visit (e.g., ["Cairo", "Luxor", "Aswan"])'
        },
        start_date: {
          type: 'string',
          description: 'Preferred start date in YYYY-MM-DD format'
        },
        duration_days: {
          type: 'number',
          description: 'Number of days for the trip'
        },
        num_adults: {
          type: 'number',
          description: 'Number of adult travelers (default 2)'
        },
        num_children: {
          type: 'number',
          description: 'Number of children (default 0)'
        },
        interests: {
          type: 'array',
          items: { type: 'string' },
          description: 'Customer interests (e.g., ["pyramids", "temples", "cruise", "history"])'
        },
        budget_level: {
          type: 'string',
          enum: ['budget', 'standard', 'deluxe', 'luxury'],
          description: 'Budget preference'
        },
        special_requests: {
          type: 'string',
          description: 'Any special requests or notes'
        }
      },
      required: ['trip_name', 'destinations', 'duration_days']
    }
  },
  {
    name: 'request_quote_for_trip',
    description: 'Request that a quote be generated for an existing trip inquiry. Use this after creating a trip inquiry or for existing itineraries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        itinerary_id: {
          type: 'string',
          description: 'The itinerary ID to generate a quote for'
        },
        tier: {
          type: 'string',
          enum: ['budget', 'standard', 'deluxe', 'luxury'],
          description: 'Service tier for pricing'
        }
      },
      required: ['itinerary_id']
    }
  },
  {
    name: 'send_quote_to_customer',
    description: 'Send an existing quote PDF to the customer via WhatsApp. Only use this when customer explicitly requests to receive a quote.',
    input_schema: {
      type: 'object' as const,
      properties: {
        quote_id: {
          type: 'string',
          description: 'The quote ID to send'
        }
      },
      required: ['quote_id']
    }
  },
  {
    name: 'check_availability',
    description: 'Check availability for a specific date range or tour. Use this when customer asks if specific dates are available or about group tour departures.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format'
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format'
        },
        num_travelers: {
          type: 'number',
          description: 'Number of travelers'
        },
        tour_name: {
          type: 'string',
          description: 'Name of specific tour to check (e.g., "Nile Cruise", "Cairo Pyramids"). Use this when customer asks about a specific tour.'
        },
        check_group_tours: {
          type: 'boolean',
          description: 'If true, check for scheduled group tour departures'
        }
      },
      required: ['start_date']
    }
  },
  {
    name: 'escalate_to_human',
    description: 'Flag this conversation for human follow-up. Use this for complex requests, complaints, or when customer explicitly requests to speak with a person.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for escalation'
        },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Urgency level'
        }
      },
      required: ['reason']
    }
  }
]

// ============================================
// TOOL EXECUTOR CLASS
// ============================================

class ToolExecutor {
  private supabase: SupabaseClient
  private clientId: string | null
  private phoneNumber: string
  private conversationId: string
  private tenantId: string | null

  constructor(
    supabase: SupabaseClient,
    clientId: string | null,
    phoneNumber: string,
    conversationId: string,
    tenantId: string | null
  ) {
    this.supabase = supabase
    this.clientId = clientId
    this.phoneNumber = phoneNumber
    this.conversationId = conversationId
    this.tenantId = tenantId
  }

  async execute(toolName: string, toolInput: any): Promise<ToolResult> {
    console.log(`🔧 Executing tool: ${toolName}`, toolInput)

    switch (toolName) {
      case 'search_customer_trips':
        return this.searchCustomerTrips(toolInput)
      case 'get_quote_details':
        return this.getQuoteDetails(toolInput)
      case 'create_trip_inquiry':
        return this.createTripInquiry(toolInput)
      case 'request_quote_for_trip':
        return this.requestQuoteForTrip(toolInput)
      case 'send_quote_to_customer':
        return this.sendQuoteToCustomer(toolInput)
      case 'check_availability':
        return this.checkAvailability(toolInput)
      case 'escalate_to_human':
        return this.escalateToHuman(toolInput)
      default:
        return { success: false, error: `Unknown tool: ${toolName}` }
    }
  }

  // ============================================
  // TOOL: Search Customer Trips
  // ============================================
  private async searchCustomerTrips(input: { status_filter?: string }): Promise<ToolResult> {
    try {
      if (!this.clientId) {
        return {
          success: true,
          message: 'No customer record found. This appears to be a new customer.',
          data: { itineraries: [], quotes: [] }
        }
      }

      const filter = input.status_filter || 'all'

      // Build itinerary query
      let itinQuery = this.supabase
        .from('itineraries')
        .select('id, itinerary_code, trip_name, start_date, end_date, total_days, status, num_adults, num_children')
        .eq('client_id', this.clientId)
        .order('start_date', { ascending: false })
        .limit(5)

      // Apply status filter
      if (filter === 'active') {
        itinQuery = itinQuery.in('status', ['draft', 'confirmed', 'in_progress'])
      } else if (filter === 'upcoming') {
        itinQuery = itinQuery.gte('start_date', new Date().toISOString().split('T')[0])
      } else if (filter === 'past') {
        itinQuery = itinQuery.eq('status', 'completed')
      }

      const { data: itineraries, error: itinError } = await itinQuery

      if (itinError) {
        console.error('Error searching itineraries:', itinError)
        return { success: false, error: 'Failed to search trips' }
      }

      // Get quotes for this customer
      const { data: quotes, error: quoteError } = await this.supabase
        .from('b2c_quotes')
        .select('id, quote_number, selling_price, price_per_person, currency, status, valid_until, tier, num_travelers')
        .eq('client_id', this.clientId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (quoteError) {
        console.error('Error searching quotes:', quoteError)
      }

      return {
        success: true,
        data: {
          itineraries: itineraries || [],
          quotes: quotes || [],
          customer_id: this.clientId
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // TOOL: Get Quote Details
  // ============================================
  private async getQuoteDetails(input: { quote_number: string }): Promise<ToolResult> {
    try {
      const { data: quote, error } = await this.supabase
        .from('b2c_quotes')
        .select(`
          *,
          itineraries (
            id, trip_name, start_date, end_date, total_days
          )
        `)
        .eq('quote_number', input.quote_number)
        .single()

      if (error || !quote) {
        return { success: false, error: `Quote ${input.quote_number} not found` }
      }

      // Verify this quote belongs to the customer (if we have a client_id)
      if (this.clientId && quote.client_id !== this.clientId) {
        return { success: false, error: 'Quote not found for this customer' }
      }

      return {
        success: true,
        data: {
          quote_number: quote.quote_number,
          trip_name: quote.itineraries?.trip_name,
          dates: `${quote.itineraries?.start_date} to ${quote.itineraries?.end_date}`,
          duration: quote.itineraries?.total_days,
          travelers: quote.num_travelers,
          tier: quote.tier,
          total_price: `${quote.currency} ${quote.selling_price}`,
          price_per_person: `${quote.currency} ${quote.price_per_person}`,
          status: quote.status,
          valid_until: quote.valid_until,
          cost_breakdown: quote.cost_breakdown
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // TOOL: Create Trip Inquiry
  // ============================================
  private async createTripInquiry(input: {
    trip_name: string
    destinations: string[]
    start_date?: string
    duration_days: number
    num_adults?: number
    num_children?: number
    interests?: string[]
    budget_level?: string
    special_requests?: string
  }): Promise<ToolResult> {
    try {
      // Calculate end date if start date provided
      let endDate = null
      if (input.start_date) {
        const start = new Date(input.start_date)
        const end = new Date(start)
        end.setDate(end.getDate() + input.duration_days - 1)
        endDate = end.toISOString().split('T')[0]
      }

      // Generate itinerary code
      const year = new Date().getFullYear()
      const random = Math.floor(Math.random() * 9000) + 1000
      const itineraryCode = `ITN-${year}-${random}`

      // Create the itinerary as a draft
      const itineraryData: any = {
        itinerary_code: itineraryCode,
        trip_name: input.trip_name,
        start_date: input.start_date || null,
        end_date: endDate,
        total_days: input.duration_days,
        num_adults: input.num_adults || 2,
        num_children: input.num_children || 0,
        status: 'draft',
        source: 'whatsapp_ai',
        client_id: this.clientId,
        tenant_id: this.tenantId,
        // Store metadata in notes
        internal_notes: JSON.stringify({
          destinations: input.destinations,
          interests: input.interests || [],
          budget_level: input.budget_level || 'standard',
          special_requests: input.special_requests || '',
          created_via: 'whatsapp_ai_agent',
          conversation_id: this.conversationId
        }),
        total_cost: 0,
        currency: 'EUR'
      }

      const { data: itinerary, error } = await this.supabase
        .from('itineraries')
        .insert(itineraryData)
        .select()
        .single()

      if (error) {
        console.error('Error creating itinerary:', error)
        return { success: false, error: 'Failed to create trip inquiry' }
      }

      // Store a notification for the team
      await this.supabase.from('whatsapp_messages').insert({
        conversation_id: this.conversationId,
        direction: 'system',
        message_body: `🤖 AI created trip inquiry: ${input.trip_name} (${itineraryCode})`,
        status: 'delivered',
        sent_at: new Date().toISOString(),
        metadata: {
          type: 'ai_action',
          action: 'create_trip_inquiry',
          itinerary_id: itinerary.id
        }
      })

      return {
        success: true,
        message: 'Trip inquiry created successfully',
        data: {
          itinerary_id: itinerary.id,
          itinerary_code: itineraryCode,
          trip_name: input.trip_name,
          destinations: input.destinations,
          duration: input.duration_days,
          start_date: input.start_date || 'To be confirmed',
          travelers: (input.num_adults || 2) + (input.num_children || 0)
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // TOOL: Request Quote for Trip
  // ============================================
  private async requestQuoteForTrip(input: {
    itinerary_id: string
    tier?: string
  }): Promise<ToolResult> {
    try {
      // Get the itinerary
      const { data: itinerary, error: itinError } = await this.supabase
        .from('itineraries')
        .select('*')
        .eq('id', input.itinerary_id)
        .single()

      if (itinError || !itinerary) {
        return { success: false, error: 'Itinerary not found' }
      }

      // Mark itinerary as needing quote
      await this.supabase
        .from('itineraries')
        .update({
          status: 'pending_quote',
          updated_at: new Date().toISOString()
        })
        .eq('id', input.itinerary_id)

      // Store notification for team
      await this.supabase.from('whatsapp_messages').insert({
        conversation_id: this.conversationId,
        direction: 'system',
        message_body: `🤖 AI requested quote for: ${itinerary.trip_name} (${itinerary.itinerary_code})`,
        status: 'delivered',
        sent_at: new Date().toISOString(),
        metadata: {
          type: 'ai_action',
          action: 'request_quote',
          itinerary_id: input.itinerary_id,
          tier: input.tier || 'standard'
        }
      })

      return {
        success: true,
        message: 'Quote request submitted. Our team will prepare a detailed quote shortly.',
        data: {
          itinerary_id: input.itinerary_id,
          itinerary_code: itinerary.itinerary_code,
          trip_name: itinerary.trip_name,
          tier: input.tier || 'standard',
          status: 'pending_quote'
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // TOOL: Send Quote to Customer
  // ============================================
  private async sendQuoteToCustomer(input: { quote_id: string }): Promise<ToolResult> {
    try {
      // Get the quote with related data
      const { data: quote, error: quoteError } = await this.supabase
        .from('b2c_quotes')
        .select(`
          *,
          itineraries (
            id, trip_name, start_date, end_date, total_days
          )
        `)
        .eq('id', input.quote_id)
        .single()

      if (quoteError || !quote) {
        return { success: false, error: 'Quote not found' }
      }

      // Verify this quote can be sent to this customer
      if (this.clientId && quote.client_id !== this.clientId) {
        return { success: false, error: 'Quote does not belong to this customer' }
      }

      // Check if PDF exists
      if (!quote.pdf_url) {
        return {
          success: false,
          error: 'Quote PDF not ready yet. Please ask the team to generate the PDF first.'
        }
      }

      // Build message
      const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
      const message = `🌟 *${businessName}* 🌟\n\n` +
        `Here's your quote for ${quote.itineraries?.trip_name}!\n\n` +
        `📋 *Quote ${quote.quote_number}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⏱️ Duration: ${quote.itineraries?.total_days} days\n` +
        `👥 Travelers: ${quote.num_travelers}\n` +
        `🏆 Service: ${quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}\n\n` +
        `💰 *Total: ${quote.currency} ${quote.selling_price.toLocaleString()}*\n` +
        `💵 Per Person: ${quote.currency} ${quote.price_per_person.toLocaleString()}\n\n` +
        `📄 Detailed quote attached as PDF.\n\n` +
        `Reply to this message if you have any questions! 🐪✨`

      // Send via WhatsApp
      const result = await sendWhatsAppMessage({
        to: this.phoneNumber,
        body: message,
        mediaUrl: quote.pdf_url
      })

      if (!result.success) {
        return { success: false, error: result.error || 'Failed to send WhatsApp message' }
      }

      // Update quote status
      await this.supabase
        .from('b2c_quotes')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_via: 'whatsapp_ai'
        })
        .eq('id', input.quote_id)

      // Store the outbound message
      await this.supabase.from('whatsapp_messages').insert({
        conversation_id: this.conversationId,
        message_sid: result.messageId,
        direction: 'outbound',
        message_body: message,
        media_url: quote.pdf_url,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: {
          ai_action: 'send_quote',
          quote_id: input.quote_id,
          quote_number: quote.quote_number
        }
      })

      return {
        success: true,
        message: 'Quote sent successfully via WhatsApp',
        data: {
          quote_number: quote.quote_number,
          message_id: result.messageId
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // TOOL: Check Availability
  // ============================================
  private async checkAvailability(input: {
    start_date: string
    end_date?: string
    num_travelers?: number
    tour_name?: string
    check_group_tours?: boolean
  }): Promise<ToolResult> {
    try {
      const startDate = new Date(input.start_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Normalize to start of day
      const numTravelers = input.num_travelers || 1

      // Check if the date is in the past
      if (startDate < today) {
        return {
          success: true,
          data: {
            available: false,
            reason: 'Requested dates are in the past',
            message: 'Those dates have already passed. Would you like to check availability for upcoming dates?'
          }
        }
      }

      const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      // ============================================
      // CHECK TOUR DEPARTURES (Group Tours)
      // ============================================
      if (this.tenantId && (input.tour_name || input.check_group_tours)) {
        try {
          // Build query for tour departures
          let departureQuery = this.supabase
            .from('tour_departures')
            .select('id, tour_name, tour_code, start_date, end_date, duration_days, status, max_pax, booked_pax, price_per_person, currency, cutoff_days')
            .eq('tenant_id', this.tenantId)
            .in('status', ['open', 'limited', 'guaranteed'])
            .gte('start_date', today.toISOString().split('T')[0])
            .order('start_date', { ascending: true })

          // Filter by tour name if provided
          if (input.tour_name) {
            departureQuery = departureQuery.ilike('tour_name', `%${input.tour_name}%`)
          }

          // Filter by date range - look for departures within 2 weeks of requested date
          const twoWeeksBefore = new Date(startDate)
          twoWeeksBefore.setDate(twoWeeksBefore.getDate() - 14)
          const twoWeeksAfter = new Date(startDate)
          twoWeeksAfter.setDate(twoWeeksAfter.getDate() + 14)

          departureQuery = departureQuery
            .gte('start_date', twoWeeksBefore < today ? today.toISOString().split('T')[0] : twoWeeksBefore.toISOString().split('T')[0])
            .lte('start_date', twoWeeksAfter.toISOString().split('T')[0])
            .limit(5)

          const { data: departures, error: depError } = await departureQuery

          if (!depError && departures && departures.length > 0) {
            // Filter departures that have enough spots and are before cutoff
            const bookableDepartures = departures.filter(dep => {
              const availableSpots = dep.max_pax - dep.booked_pax
              const cutoffDate = new Date(dep.start_date)
              cutoffDate.setDate(cutoffDate.getDate() - (dep.cutoff_days || 3))
              const isBeforeCutoff = today < cutoffDate
              return availableSpots >= numTravelers && isBeforeCutoff
            })

            if (bookableDepartures.length > 0) {
              // Format departure info
              const departureInfo = bookableDepartures.map(dep => ({
                tour_name: dep.tour_name,
                start_date: dep.start_date,
                end_date: dep.end_date,
                duration_days: dep.duration_days,
                available_spots: dep.max_pax - dep.booked_pax,
                price_per_person: dep.price_per_person,
                currency: dep.currency || 'EUR',
                status: dep.status
              }))

              const firstDep = bookableDepartures[0]
              const spotsText = (firstDep.max_pax - firstDep.booked_pax) === 1 ? '1 spot' : `${firstDep.max_pax - firstDep.booked_pax} spots`

              if (bookableDepartures.length === 1) {
                return {
                  success: true,
                  data: {
                    available: true,
                    type: 'group_tour',
                    departures: departureInfo,
                    message: `Great news! We have a ${firstDep.tour_name} departing on ${this.formatDateShort(firstDep.start_date)} with ${spotsText} available.${firstDep.price_per_person ? ` Price: ${firstDep.currency || 'EUR'} ${firstDep.price_per_person} per person.` : ''} Would you like to join this group?`
                  }
                }
              } else {
                const datesList = bookableDepartures.slice(0, 3).map(d =>
                  `${this.formatDateShort(d.start_date)} (${d.max_pax - d.booked_pax} spots)`
                ).join(', ')

                return {
                  success: true,
                  data: {
                    available: true,
                    type: 'group_tour',
                    departures: departureInfo,
                    message: `We have ${bookableDepartures.length} departures available: ${datesList}. Which date works best for you?`
                  }
                }
              }
            } else if (departures.length > 0) {
              // Have departures but none with enough spots
              return {
                success: true,
                data: {
                  available: false,
                  type: 'group_tour',
                  message: `We have ${input.tour_name || 'group tours'} scheduled, but they don't have enough spots for ${numTravelers} traveler${numTravelers > 1 ? 's' : ''}. Would you like a private tour instead, or shall I check if we can add you to a waitlist?`
                }
              }
            }
          }

          // No group departures found - offer private tour option
          if (input.tour_name || input.check_group_tours) {
            return {
              success: true,
              data: {
                available: true,
                type: 'private_tour',
                message: input.tour_name
                  ? `We don't have a scheduled group departure for "${input.tour_name}" around those dates, but we can arrange a private tour for you. Would you like me to create a custom quote?`
                  : `We don't have group tours scheduled for those dates, but we can arrange a private tour. Would you like me to help you plan one?`
              }
            }
          }
        } catch (depError) {
          console.warn('Departure check failed:', depError)
          // Fall through to capacity check
        }
      }

      // ============================================
      // CHECK OPERATOR CAPACITY (General Availability)
      // ============================================
      if (daysUntilStart < 3) {
        return {
          success: true,
          data: {
            available: true,
            notice: 'short_notice',
            message: 'That\'s quite short notice! Let me check if we can accommodate. We\'ll need to confirm with our team quickly.',
            days_until_start: daysUntilStart
          }
        }
      }

      if (this.tenantId) {
        try {
          const { data: capacityData, error } = await this.supabase
            .from('operator_capacity')
            .select('date, status, max_groups, booked_groups, notes, reason')
            .eq('tenant_id', this.tenantId)
            .gte('date', input.start_date)
            .lte('date', input.end_date || input.start_date)
            .order('date', { ascending: true })

          if (!error && capacityData && capacityData.length > 0) {
            const capacityMap = new Map<string, { status: string; available_slots: number; reason?: string }>()

            capacityData.forEach(entry => {
              capacityMap.set(entry.date, {
                status: entry.status,
                available_slots: entry.max_groups - entry.booked_groups,
                reason: entry.reason
              })
            })

            // Generate all dates in range
            const dates: string[] = []
            const current = new Date(input.start_date)
            const end = new Date(input.end_date || input.start_date)

            while (current <= end) {
              dates.push(current.toISOString().split('T')[0])
              current.setDate(current.getDate() + 1)
            }

            const blackoutDates = dates.filter(d => capacityMap.get(d)?.status === 'blackout')
            const busyDates = dates.filter(d => {
              const cap = capacityMap.get(d)
              return cap?.status === 'busy' && cap.available_slots <= 0
            })
            const limitedDates = dates.filter(d => capacityMap.get(d)?.status === 'limited')

            if (blackoutDates.length > 0) {
              const blackoutReason = capacityMap.get(blackoutDates[0])?.reason
              return {
                success: true,
                data: {
                  available: false,
                  status: 'blackout',
                  blackout_dates: blackoutDates,
                  message: `We're not operating on ${blackoutDates.length > 1 ? 'some of those dates' : blackoutDates[0]}${blackoutReason ? ` (${blackoutReason})` : ''}. Would you like to check alternative dates?`
                }
              }
            }

            if (busyDates.length > 0) {
              return {
                success: true,
                data: {
                  available: false,
                  status: 'busy',
                  busy_dates: busyDates,
                  message: `We're fully booked on ${busyDates.length > 1 ? 'some dates in that range' : busyDates[0]}. Would you like me to suggest alternative dates?`
                }
              }
            }

            if (limitedDates.length > 0) {
              return {
                success: true,
                data: {
                  available: true,
                  status: 'limited',
                  message: 'Those dates work for us, though we have limited availability. I recommend booking soon to secure your spot. We\'ll confirm hotel availability once you proceed.'
                }
              }
            }
          }
        } catch (capacityError) {
          console.warn('Capacity check failed, falling back to basic check:', capacityError)
        }
      }

      // Fallback: Basic availability check
      const month = startDate.getMonth() + 1
      const isPeakSeason = [10, 11, 12, 1, 2, 3, 4].includes(month)

      return {
        success: true,
        data: {
          available: true,
          start_date: input.start_date,
          end_date: input.end_date,
          status: 'available',
          peak_season: isPeakSeason,
          message: isPeakSeason
            ? 'Great news! Those dates work on our end. This is peak season, so I recommend booking early. We\'ll confirm hotel and service availability once you\'re ready to proceed.'
            : 'Those dates work on our end. We\'ll confirm hotel availability and finalize the booking details once you\'re ready to proceed.',
          days_until_start: daysUntilStart
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // Helper to format dates nicely
  private formatDateShort(dateStr: string): string {
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // ============================================
  // TOOL: Escalate to Human
  // ============================================
  private async escalateToHuman(input: {
    reason: string
    urgency?: string
  }): Promise<ToolResult> {
    try {
      // Update conversation to flag for human follow-up
      await this.supabase
        .from('whatsapp_conversations')
        .update({
          status: 'needs_attention',
          updated_at: new Date().toISOString()
        })
        .eq('id', this.conversationId)

      // Store escalation note
      await this.supabase.from('whatsapp_messages').insert({
        conversation_id: this.conversationId,
        direction: 'system',
        message_body: `⚠️ ESCALATION: ${input.reason} (Urgency: ${input.urgency || 'medium'})`,
        status: 'delivered',
        sent_at: new Date().toISOString(),
        metadata: {
          type: 'escalation',
          reason: input.reason,
          urgency: input.urgency || 'medium',
          escalated_by: 'ai_agent'
        }
      })

      return {
        success: true,
        message: 'Conversation flagged for human follow-up',
        data: {
          reason: input.reason,
          urgency: input.urgency || 'medium',
          status: 'needs_attention'
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}

// ============================================
// AI AGENT CLASS
// ============================================

export class WhatsAppAIAgent {
  private anthropic: Anthropic
  private businessName: string
  private businessEmail: string
  private modelId: string
  private toolsEnabled: boolean
  private maxToolIterations: number

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    this.anthropic = new Anthropic({ apiKey })
    this.businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    this.businessEmail = process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'
    this.modelId = process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514'
    this.toolsEnabled = process.env.WHATSAPP_AI_TOOLS_ENABLED === 'true'
    this.maxToolIterations = 3 // Prevent infinite loops
  }

  // ============================================
  // GATHER CONTEXT
  // ============================================

  async gatherContext(
    supabase: SupabaseClient,
    conversationId: string,
    clientId: string | null,
    phoneNumber: string
  ): Promise<ConversationContext> {
    const context: ConversationContext = {
      clientId,
      clientName: null,
      phoneNumber,
      conversationId,
      recentMessages: []
    }

    // Get recent messages (last 10)
    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('direction, message_body, sent_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(10)

    if (messages) {
      context.recentMessages = messages
        .reverse()
        .map(m => ({
          direction: m.direction as 'inbound' | 'outbound',
          content: m.message_body || '',
          timestamp: m.sent_at
        }))
    }

    // Get client info if available
    if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('full_name, email, nationality, preferred_language')
        .eq('id', clientId)
        .single()

      if (client) {
        context.clientName = client.full_name
        context.clientInfo = {
          fullName: client.full_name,
          email: client.email,
          nationality: client.nationality,
          preferredLanguage: client.preferred_language
        }
      }

      // Get active itineraries
      const { data: itineraries } = await supabase
        .from('itineraries')
        .select('id, trip_name, start_date, end_date, status, total_days')
        .eq('client_id', clientId)
        .in('status', ['draft', 'confirmed', 'in_progress'])
        .order('start_date', { ascending: true })
        .limit(3)

      if (itineraries) {
        context.activeItineraries = itineraries.map(i => ({
          id: i.id,
          tripName: i.trip_name,
          startDate: i.start_date,
          endDate: i.end_date,
          status: i.status,
          totalDays: i.total_days
        }))
      }

      // Get active quotes
      const { data: quotes } = await supabase
        .from('b2c_quotes')
        .select('id, quote_number, selling_price, currency, status, valid_until')
        .eq('client_id', clientId)
        .in('status', ['draft', 'sent', 'pending'])
        .order('created_at', { ascending: false })
        .limit(3)

      if (quotes) {
        context.activeQuotes = quotes.map(q => ({
          id: q.id,
          quoteNumber: q.quote_number,
          sellingPrice: q.selling_price,
          currency: q.currency,
          status: q.status,
          validUntil: q.valid_until
        }))
      }
    }

    return context
  }

  // ============================================
  // BUILD SYSTEM PROMPT
  // ============================================

  private buildSystemPrompt(context: ConversationContext): string {
    const currentTime = new Date().toLocaleString('en-US', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'full',
      timeStyle: 'short'
    })

    let systemPrompt = `You are ${this.businessName}'s friendly WhatsApp assistant for travel inquiries to Egypt.

CURRENT TIME: ${currentTime} (Cairo time)

YOUR ROLE:
- Help customers with travel inquiries about Egypt tours
- Provide information about their existing bookings and quotes
- Answer general questions about Egypt travel
- Be warm, helpful, and professional
- Keep responses concise (suitable for WhatsApp - max 2-3 short paragraphs)
- Use appropriate emojis sparingly to be friendly

IMPORTANT GUIDELINES:
1. If asked about specific pricing or availability, use your tools to check or create a quote request
2. If a customer wants to plan a new trip, use the create_trip_inquiry tool to capture their requirements
3. For urgent matters (same-day tours, emergencies), use escalate_to_human tool
4. Always be helpful but don't make promises you can't keep
5. If you need human help, use the escalate_to_human tool
6. Respond in the same language the customer uses

TOOL USAGE GUIDELINES:
- Use search_customer_trips to find customer's existing bookings and quotes
- Use create_trip_inquiry when customer describes a new trip they want to take
- Use request_quote_for_trip after creating an inquiry or for existing itineraries
- Use send_quote_to_customer ONLY when customer explicitly asks for their quote
- Use check_availability to verify dates work
- Use escalate_to_human for complex issues or explicit human requests

CONTACT FOR URGENT MATTERS:
Email: ${this.businessEmail}

`

    // Add customer context
    if (context.clientInfo) {
      systemPrompt += `\nCUSTOMER INFORMATION:
- Name: ${context.clientInfo.fullName}
- Email: ${context.clientInfo.email || 'Not provided'}
- Nationality: ${context.clientInfo.nationality || 'Unknown'}
- Preferred Language: ${context.clientInfo.preferredLanguage || 'English'}
`
    } else {
      systemPrompt += `\nCUSTOMER: New/Unknown customer (phone: ${context.phoneNumber})
`
    }

    // Add itinerary info
    if (context.activeItineraries && context.activeItineraries.length > 0) {
      systemPrompt += `\nACTIVE BOOKINGS:\n`
      context.activeItineraries.forEach(it => {
        const startDate = new Date(it.startDate).toLocaleDateString('en-GB')
        const endDate = new Date(it.endDate).toLocaleDateString('en-GB')
        systemPrompt += `- ${it.tripName} (${startDate} - ${endDate}, ${it.totalDays} days, Status: ${it.status})\n`
      })
    }

    // Add quote info
    if (context.activeQuotes && context.activeQuotes.length > 0) {
      systemPrompt += `\nPENDING QUOTES:\n`
      context.activeQuotes.forEach(q => {
        const validUntil = q.validUntil
          ? new Date(q.validUntil).toLocaleDateString('en-GB')
          : 'No expiry'
        systemPrompt += `- ${q.quoteNumber}: ${q.currency} ${q.sellingPrice.toLocaleString()} (Status: ${q.status}, Valid until: ${validUntil})\n`
      })
    }

    // Add conversation history summary
    if (context.recentMessages.length > 0) {
      systemPrompt += `\nRECENT CONVERSATION (for context - do not repeat information already given):\n`
    }

    return systemPrompt
  }

  // ============================================
  // GENERATE RESPONSE (WITH OPTIONAL TOOL SUPPORT)
  // ============================================

  async generateResponse(
    incomingMessage: string,
    context: ConversationContext,
    supabase?: SupabaseClient,
    tenantId?: string | null
  ): Promise<AIAgentResponse> {
    try {
      // Check if AI responses are enabled
      if (process.env.WHATSAPP_AI_ENABLED !== 'true') {
        return {
          success: true,
          shouldRespond: false,
          confidence: 0,
          reasoning: 'AI responses disabled via WHATSAPP_AI_ENABLED'
        }
      }

      const systemPrompt = this.buildSystemPrompt(context)

      // Build messages array with conversation history
      const messages: Anthropic.Messages.MessageParam[] = []

      // Add recent messages as conversation history
      for (const msg of context.recentMessages.slice(-6)) { // Last 6 messages for context
        messages.push({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
          content: msg.content
        })
      }

      // Add the new incoming message
      messages.push({
        role: 'user',
        content: incomingMessage
      })

      // Check if tools should be used
      const useTools = this.toolsEnabled && supabase

      if (useTools) {
        return await this.generateResponseWithTools(
          messages,
          systemPrompt,
          context,
          supabase!,
          tenantId || null
        )
      }

      // Call Claude API without tools (legacy mode)
      const response = await this.anthropic.messages.create({
        model: this.modelId,
        max_tokens: 500,
        system: systemPrompt,
        messages
      })

      // Extract the response text
      const reply = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as Anthropic.Messages.TextBlock).text)
        .join('\n')

      // Determine confidence based on stop reason
      const confidence = response.stop_reason === 'end_turn' ? 0.9 : 0.7

      return {
        success: true,
        reply,
        shouldRespond: true,
        confidence,
        reasoning: `Generated response using ${this.modelId}`
      }

    } catch (error: any) {
      console.error('AI Agent error:', error)
      return {
        success: false,
        shouldRespond: false,
        confidence: 0,
        error: error.message
      }
    }
  }

  // ============================================
  // GENERATE RESPONSE WITH TOOL CALLING
  // ============================================

  private async generateResponseWithTools(
    messages: Anthropic.Messages.MessageParam[],
    systemPrompt: string,
    context: ConversationContext,
    supabase: SupabaseClient,
    tenantId: string | null
  ): Promise<AIAgentResponse> {
    const toolsUsed: string[] = []
    const actionsPerformed: Array<{ tool: string; result: string; data?: any }> = []

    // Create tool executor
    const toolExecutor = new ToolExecutor(
      supabase,
      context.clientId,
      context.phoneNumber,
      context.conversationId,
      tenantId
    )

    let currentMessages = [...messages]
    let iterations = 0

    try {
      while (iterations < this.maxToolIterations) {
        iterations++

        // Call Claude API with tools
        const response = await this.anthropic.messages.create({
          model: this.modelId,
          max_tokens: 1024,
          system: systemPrompt,
          messages: currentMessages,
          tools: AGENT_TOOLS
        })

        console.log(`🤖 AI Response (iteration ${iterations}):`, {
          stopReason: response.stop_reason,
          contentTypes: response.content.map(c => c.type)
        })

        // Check if the model wants to use a tool
        if (response.stop_reason === 'tool_use') {
          // Process each tool use
          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
          )

          // Add the assistant's response to messages
          currentMessages.push({
            role: 'assistant',
            content: response.content
          })

          // Process each tool and collect results
          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

          for (const toolUse of toolUseBlocks) {
            console.log(`🔧 Tool called: ${toolUse.name}`, toolUse.input)
            toolsUsed.push(toolUse.name)

            // Execute the tool
            const result = await toolExecutor.execute(toolUse.name, toolUse.input)

            actionsPerformed.push({
              tool: toolUse.name,
              result: result.success ? 'success' : 'failed',
              data: result.data
            })

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            })
          }

          // Add tool results to messages
          currentMessages.push({
            role: 'user',
            content: toolResults
          })

          // Continue the loop to get the final response
          continue
        }

        // Model has finished (no more tool calls)
        // Extract the final text response
        const textBlocks = response.content.filter(
          (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
        )

        const reply = textBlocks.map(block => block.text).join('\n')

        // Determine confidence based on stop reason and tool usage
        let confidence = response.stop_reason === 'end_turn' ? 0.9 : 0.7
        if (toolsUsed.length > 0) {
          confidence = Math.min(confidence + 0.05, 0.95) // Boost confidence if tools were used successfully
        }

        return {
          success: true,
          reply,
          shouldRespond: true,
          confidence,
          reasoning: `Generated response using ${this.modelId} with ${toolsUsed.length} tool calls`,
          toolsUsed,
          actionsPerformed
        }
      }

      // Max iterations reached
      console.warn('⚠️ Max tool iterations reached')
      return {
        success: true,
        reply: "I apologize, but I'm having some difficulty processing your request right now. Let me connect you with our team who can help you better. 🙏",
        shouldRespond: true,
        confidence: 0.5,
        reasoning: 'Max tool iterations reached',
        toolsUsed,
        actionsPerformed
      }

    } catch (error: any) {
      console.error('Tool execution error:', error)
      return {
        success: false,
        shouldRespond: false,
        confidence: 0,
        error: error.message,
        toolsUsed,
        actionsPerformed
      }
    }
  }

  // ============================================
  // SHOULD AUTO-RESPOND CHECK
  // ============================================

  shouldAutoRespond(message: string): { shouldRespond: boolean; reason: string } {
    const lowerMessage = message.toLowerCase().trim()

    // Don't respond to very short messages that might be accidental
    if (lowerMessage.length < 2) {
      return { shouldRespond: false, reason: 'Message too short' }
    }

    // Don't respond to media-only messages (handled separately)
    if (!message || message.trim() === '') {
      return { shouldRespond: false, reason: 'Empty or media-only message' }
    }

    // Don't respond to messages that look like they're meant for a human
    const humanRequestPatterns = [
      /speak.*human/i,
      /real.*person/i,
      /talk.*agent/i,
      /talk.*someone/i,
      /human.*please/i,
      /not.*bot/i,
      /stop.*bot/i
    ]

    for (const pattern of humanRequestPatterns) {
      if (pattern.test(message)) {
        return { shouldRespond: false, reason: 'Customer requested human agent' }
      }
    }

    // Check for sensitive topics that need human handling
    const sensitivePatterns = [
      /complaint/i,
      /refund/i,
      /cancel.*booking/i,
      /urgent/i,
      /emergency/i,
      /angry/i,
      /frustrated/i,
      /disappointed/i
    ]

    for (const pattern of sensitivePatterns) {
      if (pattern.test(message)) {
        return { shouldRespond: false, reason: 'Sensitive topic - needs human handling' }
      }
    }

    return { shouldRespond: true, reason: 'Standard inquiry' }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let agentInstance: WhatsAppAIAgent | null = null

export function getWhatsAppAIAgent(): WhatsAppAIAgent {
  if (!agentInstance) {
    agentInstance = new WhatsAppAIAgent()
  }
  return agentInstance
}

// ============================================
// CONVENIENCE FUNCTION
// ============================================

export async function processIncomingMessage(
  supabase: SupabaseClient,
  conversationId: string,
  clientId: string | null,
  phoneNumber: string,
  incomingMessage: string,
  tenantId?: string | null
): Promise<AIAgentResponse> {
  try {
    const agent = getWhatsAppAIAgent()

    // Check if we should auto-respond
    const { shouldRespond, reason } = agent.shouldAutoRespond(incomingMessage)
    if (!shouldRespond) {
      // Even if we shouldn't auto-respond, check if we should escalate
      const shouldEscalate = /speak.*human|real.*person|talk.*agent/i.test(incomingMessage)
      if (shouldEscalate && tenantId) {
        // Create escalation note
        await supabase.from('whatsapp_messages').insert({
          conversation_id: conversationId,
          direction: 'system',
          message_body: `⚠️ Customer requested human agent. Auto-reply skipped.`,
          status: 'delivered',
          sent_at: new Date().toISOString(),
          metadata: { type: 'escalation_request', reason: reason }
        })

        // Update conversation status
        await supabase
          .from('whatsapp_conversations')
          .update({ status: 'needs_attention', updated_at: new Date().toISOString() })
          .eq('id', conversationId)
      }

      return {
        success: true,
        shouldRespond: false,
        confidence: 0,
        reasoning: reason
      }
    }

    // Gather context
    const context = await agent.gatherContext(
      supabase,
      conversationId,
      clientId,
      phoneNumber
    )

    // Generate response (with tools if enabled)
    return await agent.generateResponse(incomingMessage, context, supabase, tenantId)

  } catch (error: any) {
    console.error('Error processing message with AI:', error)
    return {
      success: false,
      shouldRespond: false,
      confidence: 0,
      error: error.message
    }
  }
}
