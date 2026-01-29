// ============================================
// WHATSAPP AI AGENT SERVICE
// ============================================
// Intelligent auto-reply agent for WhatsApp messages
// Uses Claude API to generate context-aware responses
// Version: 1.0
// ============================================

import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

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
}

// ============================================
// AI AGENT CLASS
// ============================================

export class WhatsAppAIAgent {
  private anthropic: Anthropic
  private businessName: string
  private businessEmail: string
  private modelId: string

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    this.anthropic = new Anthropic({ apiKey })
    this.businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    this.businessEmail = process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'
    this.modelId = process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514'
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
1. If asked about specific pricing or availability, say you'll have the team prepare a detailed quote
2. If asked to make changes to bookings, say you'll pass this to the team
3. For urgent matters (same-day tours, emergencies), advise them to call directly
4. Always be helpful but don't make promises you can't keep
5. If unsure, say you'll have a team member follow up
6. Respond in the same language the customer uses

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
  // GENERATE RESPONSE
  // ============================================

  async generateResponse(
    incomingMessage: string,
    context: ConversationContext
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

      // Call Claude API
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
  incomingMessage: string
): Promise<AIAgentResponse> {
  try {
    const agent = getWhatsAppAIAgent()

    // Check if we should auto-respond
    const { shouldRespond, reason } = agent.shouldAutoRespond(incomingMessage)
    if (!shouldRespond) {
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

    // Generate response
    return await agent.generateResponse(incomingMessage, context)

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
