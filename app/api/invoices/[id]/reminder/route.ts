import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// Reuse the email generation from the main route
function generateReminderEmail(invoice: any, reminderType: string): { subject: string; html: string } {
  const currencySymbol = ({ EUR: '€', USD: '$', GBP: '£' } as Record<string, string>)[invoice.currency] || invoice.currency
  const balanceDue = `${currencySymbol}${Number(invoice.balance_due).toFixed(2)}`
  const totalAmount = `${currencySymbol}${Number(invoice.total_amount).toFixed(2)}`
  const dueDate = new Date(invoice.due_date).toLocaleDateString('en-GB', { 
    day: 'numeric', month: 'long', year: 'numeric' 
  })
  
  const daysOverdue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))
  
  let subject = `Payment Reminder: Invoice ${invoice.invoice_number}`
  let urgencyMessage = `This is a reminder about your outstanding invoice.`
  let urgencyColor = '#f59e0b'

  if (daysOverdue > 0) {
    subject = `Payment Overdue: Invoice ${invoice.invoice_number}`
    urgencyMessage = `Your payment is ${daysOverdue} days overdue. Please arrange payment as soon as possible.`
    urgencyColor = '#ef4444'
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <tr>
            <td style="background-color: #647C47; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Travel2Egypt</h1>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: ${urgencyColor}; padding: 15px 40px;">
              <p style="margin: 0; color: #ffffff; font-size: 14px; text-align: center; font-weight: 500;">
                ${urgencyMessage}
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px;">
                Dear ${invoice.client_name},
              </p>
              
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px;">
                We are writing regarding the following invoice:
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 25px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;"><span style="color: #6b7280; font-size: 14px;">Invoice Number:</span></td>
                        <td style="padding: 8px 0; text-align: right;"><span style="color: #111827; font-size: 14px; font-weight: 600;">${invoice.invoice_number}</span></td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><span style="color: #6b7280; font-size: 14px;">Due Date:</span></td>
                        <td style="padding: 8px 0; text-align: right;"><span style="color: ${daysOverdue > 0 ? '#ef4444' : '#111827'}; font-size: 14px;">${dueDate}</span></td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;"><span style="color: #6b7280; font-size: 14px;">Total Amount:</span></td>
                        <td style="padding: 8px 0; text-align: right;"><span style="color: #111827; font-size: 14px;">${totalAmount}</span></td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 15px; border-top: 1px solid #e5e7eb;">
                          <table width="100%">
                            <tr>
                              <td style="padding-top: 10px;"><span style="color: #111827; font-size: 16px; font-weight: 600;">Balance Due:</span></td>
                              <td style="padding-top: 10px; text-align: right;"><span style="color: #ef4444; font-size: 20px; font-weight: 700;">${balanceDue}</span></td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px;">
                Please arrange payment at your earliest convenience. If you have already made this payment, please disregard this reminder.
              </p>
              
              ${invoice.payment_instructions ? `
              <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px 20px; margin-bottom: 30px;">
                <p style="margin: 0 0 5px; color: #166534; font-size: 14px; font-weight: 600;">Payment Instructions</p>
                <p style="margin: 0; color: #15803d; font-size: 14px;">${invoice.payment_instructions}</p>
              </div>
              ` : ''}
              
              <p style="margin: 30px 0 0; color: #374151; font-size: 16px;">
                Best regards,<br><strong>Travel2Egypt Team</strong>
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f9fafb; padding: 25px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                This is an automated payment reminder from Travel2Egypt.
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

// POST: Send reminder for a specific invoice
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user and get Supabase client
    const authResult = await requireAuth()

    if (authResult.error) {
      return NextResponse.json({
        success: false,
        error: authResult.error
      }, { status: authResult.status })
    }

    const { supabase } = authResult
    const { id } = await params

    // Get invoice - RLS automatically filters by tenant
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (!invoice.client_email) {
      return NextResponse.json(
        { success: false, error: 'Invoice has no client email' },
        { status: 400 }
      )
    }

    if (Number(invoice.balance_due) <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invoice has no balance due' },
        { status: 400 }
      )
    }

    const { subject, html } = generateReminderEmail(invoice, 'manual')

    // Send email via your email service
    const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: invoice.client_email,
        subject,
        html,
        type: 'payment_reminder'
      })
    })

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json()
      
      // Log failed attempt
      await supabase
        .from('invoice_reminders')
        .insert({
          invoice_id: id,
          reminder_type: 'manual',
          recipient_email: invoice.client_email,
          subject,
          status: 'failed',
          error_message: errorData.error || 'Failed to send'
        })

      return NextResponse.json(
        { success: false, error: errorData.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    // Update invoice
    const nextReminderDate = new Date()
    nextReminderDate.setDate(nextReminderDate.getDate() + 7)

    await supabase
      .from('invoices')
      .update({
        last_reminder_sent: new Date().toISOString(),
        reminder_count: (invoice.reminder_count || 0) + 1,
        next_reminder_date: nextReminderDate.toISOString().split('T')[0]
      })
      .eq('id', id)

    // Log reminder
    await supabase
      .from('invoice_reminders')
      .insert({
        invoice_id: id,
        reminder_type: 'manual',
        recipient_email: invoice.client_email,
        subject,
        status: 'sent'
      })

    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${invoice.client_email}`,
      invoice_number: invoice.invoice_number
    })

  } catch (error: any) {
    console.error('Error sending reminder:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// GET: Get reminder history for an invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { id } = await params

    // Query with RLS - automatically filters by tenant
    const { data: reminders, error } = await supabase
      .from('invoice_reminders')
      .select('*')
      .eq('invoice_id', id)
      .order('sent_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      reminders: reminders || []
    })

  } catch (error: any) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
} 