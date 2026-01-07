import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// Email service - adjust based on your setup (Resend, SendGrid, etc.)
// This example uses a generic sendEmail function - replace with your actual implementation
async function sendReminderEmail(params: {
  to: string
  subject: string
  html: string
  invoiceNumber: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Option 1: If using Resend
    // const resend = new Resend(process.env.RESEND_API_KEY)
    // await resend.emails.send({
    //   from: 'Travel2Egypt <invoices@travel2egypt.com>',
    //   to: params.to,
    //   subject: params.subject,
    //   html: params.html
    // })

    // Option 2: If using SendGrid
    // const sgMail = require('@sendgrid/mail')
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY)
    // await sgMail.send({
    //   to: params.to,
    //   from: 'invoices@travel2egypt.com',
    //   subject: params.subject,
    //   html: params.html
    // })

    // Option 3: If using your existing /api/send-email endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/send-email`, {
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
      return { success: false, error: error.message || 'Failed to send email' }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error sending reminder email:', error)
    return { success: false, error: error.message }
  }
}

function generateReminderEmail(invoice: any, reminderType: string): { subject: string; html: string } {
  const currencySymbol = ({ EUR: '€', USD: '$', GBP: '£' } as Record<string, string>)[invoice.currency] || invoice.currency
  const balanceDue = `${currencySymbol}${Number(invoice.balance_due).toFixed(2)}`
  const totalAmount = `${currencySymbol}${Number(invoice.total_amount).toFixed(2)}`
  const dueDate = new Date(invoice.due_date).toLocaleDateString('en-GB', { 
    day: 'numeric', month: 'long', year: 'numeric' 
  })
  
  const daysOverdue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))
  
  let subject: string
  let urgencyMessage: string
  let urgencyColor: string

  switch (reminderType) {
    case 'before_due_7':
      subject = `Upcoming Payment Due: Invoice ${invoice.invoice_number}`
      urgencyMessage = `This is a friendly reminder that your invoice is due in 7 days.`
      urgencyColor = '#3b82f6' // blue
      break
    case 'before_due_3':
      subject = `Payment Reminder: Invoice ${invoice.invoice_number} due in 3 days`
      urgencyMessage = `Your invoice payment is due in 3 days.`
      urgencyColor = '#f59e0b' // amber
      break
    case 'on_due':
      subject = `Payment Due Today: Invoice ${invoice.invoice_number}`
      urgencyMessage = `Your invoice payment is due today.`
      urgencyColor = '#f59e0b' // amber
      break
    case 'overdue_7':
      subject = `Payment Overdue: Invoice ${invoice.invoice_number}`
      urgencyMessage = `Your payment is now ${daysOverdue} days overdue. Please arrange payment as soon as possible.`
      urgencyColor = '#ef4444' // red
      break
    case 'overdue_14':
      subject = `Second Notice: Invoice ${invoice.invoice_number} is overdue`
      urgencyMessage = `Your payment is now ${daysOverdue} days overdue. This is your second reminder.`
      urgencyColor = '#ef4444' // red
      break
    case 'overdue_30':
      subject = `Final Notice: Invoice ${invoice.invoice_number} - Immediate Payment Required`
      urgencyMessage = `Your payment is now ${daysOverdue} days overdue. This is your final notice before further action may be taken.`
      urgencyColor = '#dc2626' // dark red
      break
    default:
      subject = `Payment Reminder: Invoice ${invoice.invoice_number}`
      urgencyMessage = `This is a reminder about your outstanding invoice.`
      urgencyColor = '#6b7280' // gray
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #647C47; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Travel2Egypt</h1>
            </td>
          </tr>
          
          <!-- Urgency Banner -->
          <tr>
            <td style="background-color: ${urgencyColor}; padding: 15px 40px;">
              <p style="margin: 0; color: #ffffff; font-size: 14px; text-align: center; font-weight: 500;">
                ${urgencyMessage}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Dear ${invoice.client_name},
              </p>
              
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                We are writing regarding the following invoice:
              </p>
              
              <!-- Invoice Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 25px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">Invoice Number:</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #111827; font-size: 14px; font-weight: 600;">${invoice.invoice_number}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">Invoice Date:</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #111827; font-size: 14px;">${new Date(invoice.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">Due Date:</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: ${daysOverdue > 0 ? '#ef4444' : '#111827'}; font-size: 14px; font-weight: ${daysOverdue > 0 ? '600' : '400'};">${dueDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">Total Amount:</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #111827; font-size: 14px;">${totalAmount}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 15px; border-top: 1px solid #e5e7eb; margin-top: 10px;">
                          <table width="100%">
                            <tr>
                              <td style="padding-top: 10px;">
                                <span style="color: #111827; font-size: 16px; font-weight: 600;">Balance Due:</span>
                              </td>
                              <td style="padding-top: 10px; text-align: right;">
                                <span style="color: #ef4444; font-size: 20px; font-weight: 700;">${balanceDue}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Please arrange payment at your earliest convenience. If you have already made this payment, please disregard this reminder.
              </p>
              
              <!-- Payment Instructions -->
              ${invoice.payment_instructions ? `
              <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px 20px; margin-bottom: 30px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 5px; color: #166534; font-size: 14px; font-weight: 600;">Payment Instructions</p>
                <p style="margin: 0; color: #15803d; font-size: 14px; line-height: 1.5;">${invoice.payment_instructions}</p>
              </div>
              ` : ''}
              
              <p style="margin: 0 0 10px; color: #374151; font-size: 16px; line-height: 1.6;">
                If you have any questions about this invoice, please don't hesitate to contact us.
              </p>
              
              <p style="margin: 30px 0 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Best regards,<br>
                <strong>Travel2Egypt Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 25px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 13px; text-align: center;">
                Travel2Egypt | Cairo, Egypt
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                This is an automated payment reminder. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  return { subject, html }
}

// GET: Fetch invoices due for reminders (preview)
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const preview = searchParams.get('preview') === 'true'

    // Get invoices that need reminders
    const today = new Date().toISOString().split('T')[0]
    
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .not('status', 'in', '("paid","cancelled")')
      .gt('balance_due', 0)
      .eq('reminder_paused', false)
      .or(`next_reminder_date.lte.${today},next_reminder_date.is.null`)
      .not('client_email', 'is', null)
      .order('due_date', { ascending: true })

    if (error) throw error

    // Categorize by reminder type
    const reminders = (invoices || []).map(invoice => {
      const dueDate = new Date(invoice.due_date)
      const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      
      let reminderType: string
      if (daysUntilDue > 5) reminderType = 'before_due_7'
      else if (daysUntilDue > 1) reminderType = 'before_due_3'
      else if (daysUntilDue >= 0) reminderType = 'on_due'
      else if (daysUntilDue >= -7) reminderType = 'overdue_7'
      else if (daysUntilDue >= -14) reminderType = 'overdue_14'
      else reminderType = 'overdue_30'

      return {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        balance_due: invoice.balance_due,
        currency: invoice.currency,
        due_date: invoice.due_date,
        days_until_due: daysUntilDue,
        reminder_type: reminderType,
        reminder_count: invoice.reminder_count || 0,
        last_reminder_sent: invoice.last_reminder_sent
      }
    })

    return NextResponse.json({
      success: true,
      count: reminders.length,
      reminders,
      preview
    })

  } catch (error: any) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST: Process and send reminders
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { invoiceIds, sendAll = false } = body

    // Get invoices to process
    let query = supabase
      .from('invoices')
      .select('*')
      .not('status', 'in', '("paid","cancelled")')
      .gt('balance_due', 0)
      .eq('reminder_paused', false)
      .not('client_email', 'is', null)

    if (invoiceIds && invoiceIds.length > 0) {
      query = query.in('id', invoiceIds)
    } else if (sendAll) {
      const today = new Date().toISOString().split('T')[0]
      query = query.or(`next_reminder_date.lte.${today},next_reminder_date.is.null`)
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide invoiceIds or set sendAll=true' },
        { status: 400 }
      )
    }

    const { data: invoices, error } = await query

    if (error) throw error

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No invoices to process',
        sent: 0,
        failed: 0
      })
    }

    const results = {
      sent: 0,
      failed: 0,
      details: [] as any[]
    }

    for (const invoice of invoices) {
      const dueDate = new Date(invoice.due_date)
      const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      
      let reminderType: string
      if (daysUntilDue > 5) reminderType = 'before_due_7'
      else if (daysUntilDue > 1) reminderType = 'before_due_3'
      else if (daysUntilDue >= 0) reminderType = 'on_due'
      else if (daysUntilDue >= -7) reminderType = 'overdue_7'
      else if (daysUntilDue >= -14) reminderType = 'overdue_14'
      else reminderType = 'overdue_30'

      const { subject, html } = generateReminderEmail(invoice, reminderType)

      // Send email
      const emailResult = await sendReminderEmail({
        to: invoice.client_email,
        subject,
        html,
        invoiceNumber: invoice.invoice_number
      })

      if (emailResult.success) {
        // Update invoice
        const nextReminderDate = new Date()
        nextReminderDate.setDate(nextReminderDate.getDate() + 7) // Next reminder in 7 days

        await supabase
          .from('invoices')
          .update({
            last_reminder_sent: new Date().toISOString(),
            reminder_count: (invoice.reminder_count || 0) + 1,
            next_reminder_date: nextReminderDate.toISOString().split('T')[0]
          })
          .eq('id', invoice.id)

        // Log reminder
        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'sent'
          })

        results.sent++
        results.details.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_email: invoice.client_email,
          status: 'sent',
          reminder_type: reminderType
        })
      } else {
        // Log failed reminder
        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'failed',
            error_message: emailResult.error
          })

        results.failed++
        results.details.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_email: invoice.client_email,
          status: 'failed',
          error: emailResult.error
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${invoices.length} invoices`,
      ...results
    })

  } catch (error: any) {
    console.error('Error processing reminders:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}