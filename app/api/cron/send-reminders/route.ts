import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// Verify cron secret for security
const CRON_SECRET = process.env.CRON_SECRET

// Email sending function - reused from main route
async function sendReminderEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        html: params.html,
        type: 'payment_reminder'
      })
    })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.message || 'Failed to send' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function generateReminderEmail(invoice: any, reminderType: string): { subject: string; html: string } {
  const currencySymbol = ({ EUR: '€', USD: '$', GBP: '£' } as Record<string, string>)[invoice.currency] || invoice.currency
  const balanceDue = `${currencySymbol}${Number(invoice.balance_due).toFixed(2)}`
  const dueDate = new Date(invoice.due_date).toLocaleDateString('en-GB', { 
    day: 'numeric', month: 'long', year: 'numeric' 
  })
  const daysOverdue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))
  
  let subject: string
  let urgencyMessage: string
  let urgencyColor: string

  if (daysOverdue <= -7) {
    subject = `Upcoming Payment Due: Invoice ${invoice.invoice_number}`
    urgencyMessage = `Your invoice is due in ${Math.abs(daysOverdue)} days.`
    urgencyColor = '#3b82f6'
  } else if (daysOverdue <= 0) {
    subject = `Payment Due: Invoice ${invoice.invoice_number}`
    urgencyMessage = daysOverdue === 0 ? 'Your invoice payment is due today.' : `Your invoice is due in ${Math.abs(daysOverdue)} days.`
    urgencyColor = '#f59e0b'
  } else if (daysOverdue <= 14) {
    subject = `Payment Overdue: Invoice ${invoice.invoice_number}`
    urgencyMessage = `Your payment is ${daysOverdue} days overdue.`
    urgencyColor = '#ef4444'
  } else {
    subject = `Urgent: Invoice ${invoice.invoice_number} - ${daysOverdue} Days Overdue`
    urgencyMessage = `Your payment is ${daysOverdue} days overdue. Please arrange immediate payment.`
    urgencyColor = '#dc2626'
  }

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#647C47;padding:30px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:24px;">Travel2Egypt</h1>
</td></tr>
<tr><td style="background:${urgencyColor};padding:15px 40px;">
<p style="margin:0;color:#fff;text-align:center;font-size:14px;">${urgencyMessage}</p>
</td></tr>
<tr><td style="padding:40px;">
<p style="color:#374151;font-size:16px;">Dear ${invoice.client_name},</p>
<table width="100%" style="background:#f9fafb;border-radius:8px;margin:20px 0;">
<tr><td style="padding:20px;">
<p style="margin:5px 0;"><strong>Invoice:</strong> ${invoice.invoice_number}</p>
<p style="margin:5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
<p style="margin:15px 0 0;font-size:18px;"><strong>Balance Due: <span style="color:#ef4444;">${balanceDue}</span></strong></p>
</td></tr>
</table>
<p style="color:#374151;">Please arrange payment at your earliest convenience.</p>
<p style="color:#374151;margin-top:30px;">Best regards,<br><strong>Travel2Egypt Team</strong></p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="margin:0;color:#9ca3af;font-size:12px;">Automated reminder from Travel2Egypt</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, html }
}

export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    console.log('🔔 Starting automated reminder processing...')

    // Get invoices due for reminders today
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .not('status', 'in', '("paid","cancelled")')
      .gt('balance_due', 0)
      .eq('reminder_paused', false)
      .lte('next_reminder_date', today)
      .not('client_email', 'is', null)
      .limit(50) // Process max 50 per run

    if (error) throw error

    if (!invoices || invoices.length === 0) {
      console.log('✅ No reminders to send today')
      return NextResponse.json({
        success: true,
        message: 'No reminders to send',
        processed: 0
      })
    }

    console.log(`📧 Processing ${invoices.length} reminders...`)

    let sent = 0
    let failed = 0

    for (const invoice of invoices) {
      const daysOverdue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))
      
      let reminderType = 'reminder'
      if (daysOverdue <= -7) reminderType = 'before_due_7'
      else if (daysOverdue <= 0) reminderType = 'on_due'
      else if (daysOverdue <= 14) reminderType = 'overdue_14'
      else reminderType = 'overdue_30'

      const { subject, html } = generateReminderEmail(invoice, reminderType)

      const result = await sendReminderEmail({
        to: invoice.client_email,
        subject,
        html
      })

      if (result.success) {
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + 7)

        await supabase
          .from('invoices')
          .update({
            last_reminder_sent: new Date().toISOString(),
            reminder_count: (invoice.reminder_count || 0) + 1,
            next_reminder_date: nextDate.toISOString().split('T')[0]
          })
          .eq('id', invoice.id)

        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'sent'
          })

        sent++
        console.log(`✅ Sent reminder for ${invoice.invoice_number}`)
      } else {
        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'failed',
            error_message: result.error
          })

        failed++
        console.log(`❌ Failed to send reminder for ${invoice.invoice_number}: ${result.error}`)
      }
    }

    console.log(`🔔 Reminder processing complete: ${sent} sent, ${failed} failed`)

    return NextResponse.json({
      success: true,
      message: `Processed ${invoices.length} reminders`,
      sent,
      failed,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Cron error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
} 