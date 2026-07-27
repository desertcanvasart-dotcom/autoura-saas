// NOTE: four legacy message builders (sendQuoteViaWhatsApp, sendStatusUpdate,
// sendTourReminder, sendPaymentReminder) were removed 2026-07-27: zero callers,
// and each hardcoded one operator's identity. The live builders are per-route
// and read the tenant.
// ============================================
// AUTOURA - TWILIO WHATSAPP SERVICE
// ============================================
// Core service for sending WhatsApp messages via Twilio
// Handles: Quote sending, Status updates, Templates
// Version: 1.0
// ============================================

import twilio from 'twilio'

// Types
export interface WhatsAppMessage {
  to: string // Phone number in international format: +201234567890
  body: string
  mediaUrl?: string // Optional: PDF or image URL
}

export interface QuoteMessage {
  clientName: string
  clientPhone: string
  itineraryId: string
  tourName: string
  startDate: string
  endDate: string
  adults: number
  children: number
  totalCost: number
  pdfUrl?: string
}

export interface StatusUpdate {
  clientName: string
  clientPhone: string
  itineraryId: string
  tourName: string
  status: 'confirmed' | 'cancelled' | 'pending_payment' | 'paid' | 'completed'
  notes?: string
}

// ============================================
// TWILIO CLIENT SETUP
// ============================================

let twilioClient: twilio.Twilio | null = null

function getTwilioClient() {
  if (twilioClient) return twilioClient

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const apiKey = process.env.TWILIO_API_KEY
  const apiSecret = process.env.TWILIO_API_SECRET

  if (!accountSid || !apiKey || !apiSecret) {
    throw new Error('Missing Twilio credentials in environment variables')
  }

  // Create client with API Key (more secure than Auth Token)
  twilioClient = twilio(apiKey, apiSecret, { accountSid })
  return twilioClient
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format phone number for WhatsApp
 * Converts various formats to: whatsapp:+201234567890
 */
export function formatWhatsAppNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '')

  // Add + if not present
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned
  }

  // Ensure it starts with country code
  if (cleaned.length < 10) {
    throw new Error('Invalid phone number: too short')
  }

  return `whatsapp:${cleaned}`
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return `€${amount.toFixed(2)}`
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-GB', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  })
}

// ============================================
// CORE MESSAGING FUNCTIONS
// ============================================

/**
 * Send a basic WhatsApp message
 */
export async function sendWhatsAppMessage({
  to,
  body,
  mediaUrl
}: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string; warning?: string }> {
  try {
    const client = getTwilioClient()
    const from = process.env.TWILIO_WHATSAPP_FROM

    if (!from) {
      throw new Error('TWILIO_WHATSAPP_FROM not configured')
    }

    const formattedTo = formatWhatsAppNumber(to)

    const message = await client.messages.create({
      from,
      to: formattedTo,
      body,
      ...(mediaUrl && { mediaUrl: [mediaUrl] })
    })



    // Check if message might be blocked by 24-hour window
    const warning = message.status === 'queued' 
      ? 'Message queued. If customer hasn\'t messaged in 24hrs, delivery may fail.'
      : undefined

    return {
      success: true,
      messageId: message.sid,
      warning
    }
  } catch (error: any) {
    console.error('❌ Failed to send WhatsApp message:', error)

    // Handle specific Twilio errors
    if (error.code === 63016) {
      return {
        success: false,
        error: 'Customer must message first (24-hour window). Use a template message to initiate.'
      }
    }

    return {
      success: false,
      error: error.message
    }
  }
}

// ============================================
// QUOTE MESSAGING
// ============================================

/**
 * Send a quote to a client via WhatsApp
 */




export async function testWhatsAppConnection(
  testPhone: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await sendWhatsAppMessage({
      to: testPhone,
      body: '✅ Success! Your WhatsApp integration is working correctly. This is a test message from Autoura.'
    })

    if (result.success) {
      return {
        success: true,
        message: 'Test message sent successfully! Check your WhatsApp.'
      }
    } else {
      return {
        success: false,
        message: result.error || 'Failed to send test message'
      }
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message
    }
  }
}

// ============================================
// EXPORTS
// ============================================

export default {
  sendWhatsAppMessage,
  testWhatsAppConnection,
  formatWhatsAppNumber
}