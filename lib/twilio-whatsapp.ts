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

    console.log('✅ WhatsApp message sent:', message.sid, 'Status:', message.status)

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
export async function sendQuoteViaWhatsApp({
  clientName,
  clientPhone,
  itineraryId,
  tourName,
  startDate,
  endDate,
  adults,
  children,
  totalCost,
  pdfUrl
}: QuoteMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    // Build message body
    let message = `🌟 *${businessName}* 🌟\n\n`
    message += `Dear ${clientName},\n\n`
    message += `Thank you for your interest in exploring Egypt with us! 🇪🇬\n\n`
    message += `📋 *Your Tour Quote*\n`
    message += `━━━━━━━━━━━━━━━━━━━━\n`
    message += `🎯 *Tour:* ${tourName}\n`
    message += `📅 *Dates:* ${formatDate(startDate)} - ${formatDate(endDate)}\n`
    message += `👥 *Travelers:* ${adults} adult${adults > 1 ? 's' : ''}`
    
    if (children > 0) {
      message += `, ${children} child${children > 1 ? 'ren' : ''}`
    }
    
    message += `\n💰 *Total Cost:* ${formatCurrency(totalCost)}\n\n`
    
    message += `✨ What's Included:\n`
    message += `✅ Professional tour guide\n`
    message += `✅ All entrance fees\n`
    message += `✅ Private transportation\n`
    message += `✅ Meals as specified\n`
    message += `✅ Hotel pickups\n\n`
    
    message += `📄 Your detailed itinerary is attached as a PDF.\n\n`
    
    message += `💳 *Ready to Book?*\n`
    message += `Reply to this message or contact us:\n`
    message += `📧 ${process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'}\n`
    message += `🌐 ${process.env.BUSINESS_WEBSITE || 'travel2egypt.org'}\n\n`
    
    message += `We look forward to creating unforgettable memories with you! 🐪✨\n\n`
    message += `Best regards,\n`
    message += `${businessName} Team`

    // Send message with PDF attachment
    return await sendWhatsAppMessage({
      to: clientPhone,
      body: message,
      mediaUrl: pdfUrl
    })
  } catch (error: any) {
    console.error('❌ Failed to send quote:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// ============================================
// STATUS UPDATE MESSAGING
// ============================================

/**
 * Get status update message template
 */
function getStatusMessage(
  clientName: string,
  tourName: string,
  status: StatusUpdate['status'],
  notes?: string
): string {
  const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
  const emoji = {
    confirmed: '✅',
    cancelled: '❌',
    pending_payment: '💳',
    paid: '✅',
    completed: '🎉'
  }[status]

  const statusText = {
    confirmed: 'Booking Confirmed',
    cancelled: 'Booking Cancelled',
    pending_payment: 'Payment Pending',
    paid: 'Payment Received',
    completed: 'Tour Completed'
  }[status]

  let message = `${emoji} *${businessName}* ${emoji}\n\n`
  message += `Dear ${clientName},\n\n`

  switch (status) {
    case 'confirmed':
      message += `Great news! Your booking for *${tourName}* has been confirmed! 🎉\n\n`
      message += `We're excited to show you the wonders of Egypt! Your guide will contact you 24 hours before your tour with pickup details.\n\n`
      message += `If you have any questions, feel free to reach out anytime.`
      break

    case 'cancelled':
      message += `Your booking for *${tourName}* has been cancelled as requested.\n\n`
      if (notes) {
        message += `Note: ${notes}\n\n`
      }
      message += `If you'd like to reschedule or book another tour, we're here to help!`
      break

    case 'pending_payment':
      message += `Your booking for *${tourName}* is confirmed! We're just waiting for your payment to finalize everything.\n\n`
      message += `💳 Payment details have been sent to your email.\n\n`
      message += `Once payment is received, you're all set! 🎯`
      break

    case 'paid':
      message += `Thank you! We've received your payment for *${tourName}*. ✅\n\n`
      message += `Everything is confirmed and ready to go! Your guide will contact you 24 hours before your tour.\n\n`
      message += `Get ready for an amazing adventure! 🐪✨`
      break

    case 'completed':
      message += `Thank you for choosing ${businessName} for your *${tourName}*! 🎉\n\n`
      message += `We hope you had an incredible experience exploring Egypt! 🇪🇬\n\n`
      message += `We'd love to hear your feedback. If you enjoyed your tour, please consider leaving us a review!\n\n`
      message += `We hope to see you again soon! 🌟`
      break
  }

  message += `\n\nBest regards,\n${businessName} Team`

  return message
}

/**
 * Send status update to client
 */
export async function sendStatusUpdate({
  clientName,
  clientPhone,
  itineraryId,
  tourName,
  status,
  notes
}: StatusUpdate): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Check if auto-updates are enabled
    const autoUpdatesEnabled = process.env.ENABLE_WHATSAPP_STATUS_UPDATES === 'true'
    
    if (!autoUpdatesEnabled) {
      console.log('ℹ️ WhatsApp status updates are disabled. Set ENABLE_WHATSAPP_STATUS_UPDATES=true to enable.')
      return {
        success: false,
        error: 'WhatsApp status updates are disabled'
      }
    }

    const message = getStatusMessage(clientName, tourName, status, notes)

    return await sendWhatsAppMessage({
      to: clientPhone,
      body: message
    })
  } catch (error: any) {
    console.error('❌ Failed to send status update:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// ============================================
// REMINDER MESSAGES
// ============================================

/**
 * Send tour reminder (day before)
 */
export async function sendTourReminder(
  clientName: string,
  clientPhone: string,
  tourName: string,
  pickupTime: string,
  pickupLocation: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    
    const message = `⏰ *${businessName}* ⏰\n\n` +
      `Dear ${clientName},\n\n` +
      `This is a friendly reminder about your tour tomorrow! 🎯\n\n` +
      `📋 *Tour:* ${tourName}\n` +
      `🕐 *Pickup Time:* ${pickupTime}\n` +
      `📍 *Pickup Location:* ${pickupLocation}\n\n` +
      `✅ *Please be ready 5-10 minutes early*\n` +
      `✅ *Bring your booking confirmation*\n` +
      `✅ *Comfortable shoes recommended*\n` +
      `✅ *Don't forget your camera!* 📸\n\n` +
      `Your guide will contact you shortly before pickup.\n\n` +
      `If you have any questions or need to make changes, please contact us immediately.\n\n` +
      `Looking forward to showing you Egypt's wonders! 🇪🇬✨\n\n` +
      `Best regards,\n${businessName} Team`

    return await sendWhatsAppMessage({
      to: clientPhone,
      body: message
    })
  } catch (error: any) {
    console.error('❌ Failed to send reminder:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// ============================================
// PAYMENT REMINDERS
// ============================================

/**
 * Send payment reminder
 */
export async function sendPaymentReminder(
  clientName: string,
  clientPhone: string,
  tourName: string,
  amountDue: number,
  dueDate: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    
    const message = `💳 *${businessName}* 💳\n\n` +
      `Dear ${clientName},\n\n` +
      `This is a friendly reminder about your pending payment.\n\n` +
      `📋 *Tour:* ${tourName}\n` +
      `💰 *Amount Due:* ${formatCurrency(amountDue)}\n` +
      `📅 *Due Date:* ${formatDate(dueDate)}\n\n` +
      `To secure your booking, please complete your payment at your earliest convenience.\n\n` +
      `📧 Payment details: ${process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'}\n\n` +
      `If you've already paid, please disregard this message or send us your payment confirmation.\n\n` +
      `Thank you!\n\n` +
      `Best regards,\n${businessName} Team`

    return await sendWhatsAppMessage({
      to: clientPhone,
      body: message
    })
  } catch (error: any) {
    console.error('❌ Failed to send payment reminder:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Test WhatsApp connection
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
  sendQuoteViaWhatsApp,
  sendStatusUpdate,
  sendTourReminder,
  sendPaymentReminder,
  testWhatsAppConnection,
  formatWhatsAppNumber
}