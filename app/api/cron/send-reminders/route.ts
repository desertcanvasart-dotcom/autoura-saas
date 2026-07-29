import { NextRequest, NextResponse } from 'next/server'
import { daysOverdueOrNull } from '@/lib/invoice-dates'
import { createAdminClient } from '@/lib/supabase-server'
import { sendMail } from '@/lib/email-send'
import { resolveSender } from '@/lib/tenant-email-domain'

// Verify cron secret for security
const CRON_SECRET = process.env.CRON_SECRET

// Email sending function — sends directly via the shared mail helper.
async function sendReminderEmail(params: {
  to: string
  subject: string
  html: string
  /** The operator this invoice belongs to — replies must reach them, not the platform. */
  from?: string
  replyTo?: string
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendMail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.from ? { from: params.from } : {}),
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  })
  return { success: result.success, error: result.error }
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
  // Verify authorization. Fail closed: if no secret is configured, or the
  // header doesn't match, reject. Never run unauthenticated.
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Service role, deliberately: this sweep spans EVERY tenant, and the
    // route authenticates by CRON_SECRET above rather than by session.
    // It previously used the browser (anon-key) client, so `invoices` RLS —
    // tenant_id = get_user_tenant_id(), NULL without a JWT — matched nothing.
    // Every run reported "No reminders to send" and no dunning email has
    // ever gone out.
    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]



    // Get invoices due for reminders today
    const { data: invoices, error } = await supabase
      .from('invoices')
      // The tenant is joined so each reminder can be sent AS that operator with
      // replies routed to them. This cron spans every tenant, so a single
      // platform reply-to would send every client's answer to the wrong place.
      .select('*, tenant:tenants(company_name, contact_email, email_domain, email_from_local, email_domain_status)')
      .not('status', 'in', '("paid","cancelled")')
      .gt('balance_due', 0)
      .eq('reminder_paused', false)
      .lte('next_reminder_date', today)
      .not('client_email', 'is', null)
      .limit(50) // Process max 50 per run

    if (error) throw error

    if (!invoices || invoices.length === 0) {

      return NextResponse.json({
        success: true,
        message: 'No reminders to send',
        processed: 0
      })
    }



    let sent = 0
    let failed = 0
    let skipped = 0

    for (const invoice of invoices) {
      // due_date is nullable. new Date(null).getTime() is NaN, every
      // comparison below is false, and the ladder falls through to the
      // harshest rung — the client receives "Final Notice ... now NaN days
      // overdue". Skip instead: no due date means nothing is owed *yet*.
      const daysOverdue = daysOverdueOrNull(invoice.due_date)
      if (daysOverdue === null) {
        skipped++
        continue
      }

      // The query filters `client_email not is null`, but the column is
      // nullable so re-check before addressing an email to it.
      if (!invoice.client_email) {
        skipped++
        continue
      }

      let reminderType = 'reminder'
      if (daysOverdue <= -7) reminderType = 'before_due_7'
      else if (daysOverdue <= 0) reminderType = 'on_due'
      else if (daysOverdue <= 14) reminderType = 'overdue_14'
      else reminderType = 'overdue_30'

      const { subject, html } = generateReminderEmail(invoice, reminderType)

      const result = await sendReminderEmail({
        to: invoice.client_email,
        subject,
        html,
        // Sent as the operator's own verified domain when they have one;
        // resolveSender falls back to the platform sender otherwise.
        from: resolveSender(invoice.tenant, process.env.RESEND_FROM_EMAIL || '').from,
        replyTo: invoice.tenant?.contact_email ?? undefined,
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
            tenant_id: invoice.tenant_id,
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'sent'
          })

        sent++

      } else {
        await supabase
          .from('invoice_reminders')
          .insert({
            tenant_id: invoice.tenant_id,
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'failed',
            error_message: result.error
          })

        failed++

      }
    }



    return NextResponse.json({
      success: true,
      message: `Processed ${invoices.length} reminders`,
      sent,
      failed,
      skipped,
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