// ============================================
// A booking confirmation — what the client is sent, and to where
// ============================================
// "Send Email" / "WhatsApp" on a booking built this text and never sent it
// ("integration pending"), and refused every booking made by confirming an
// itinerary (quote_type NULL). (Compared with travel-ops-pro, 2026-09-25.)
// One message for both channels, in the operator's name; the recipient is
// the booking's CRM client, else the itinerary's own contact — a direct
// booking often has no client row (live BK-2026-0003).

import { escapeHtml } from '@/lib/html-escape'

export interface ConfirmationBooking {
  booking_number: string
  trip_name?: string | null
  start_date?: string | null
  end_date?: string | null
  num_travelers?: number | null
  currency?: string | null
  total_amount?: number | string | null
  total_paid?: number | string | null
  balance_due?: number | string | null
  deposit_amount?: number | string | null
  payment_deadline?: string | null
  special_requests?: string | null
  clients?: { full_name?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null } | null
  itineraries?: { client_name?: string | null; client_email?: string | null; client_phone?: string | null } | null
}

export interface ConfirmationRecipient {
  name: string | null
  email: string | null
  /** WhatsApp number: the client's WhatsApp, else their phone. */
  whatsapp: string | null
}

const clean = (v: string | null | undefined) => (v ?? '').trim() || null

export function confirmationRecipient(b: ConfirmationBooking): ConfirmationRecipient {
  const c = b.clients
  const i = b.itineraries
  return {
    name: clean(c?.full_name) ?? clean(i?.client_name),
    email: clean(c?.email) ?? clean(i?.client_email),
    whatsapp: clean(c?.whatsapp) ?? clean(c?.phone) ?? clean(i?.client_phone),
  }
}

const money = (currency: string, v: unknown) => `${currency} ${(Number(v) || 0).toFixed(2)}`
const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null

/** The facts, as lines — shared by the WhatsApp text and the email. */
export function confirmationLines(b: ConfirmationBooking): { label: string; value: string }[] {
  const cur = b.currency || ''
  const paid = Number(b.total_paid) || 0
  const balance = Number(b.balance_due) || 0
  const deposit = Number(b.deposit_amount) || 0
  const from = day(b.start_date)
  const to = day(b.end_date)
  const lines: { label: string; value: string }[] = [
    { label: 'Booking number', value: b.booking_number },
  ]
  if (b.trip_name) lines.push({ label: 'Trip', value: b.trip_name })
  if (from) lines.push({ label: 'Dates', value: to && to !== from ? `${from} – ${to}` : from })
  if (b.num_travelers) lines.push({ label: 'Travellers', value: String(b.num_travelers) })
  lines.push({ label: 'Total', value: money(cur, b.total_amount) })
  lines.push({ label: 'Paid', value: money(cur, paid) })
  if (balance > 0) {
    lines.push({ label: 'Balance due', value: money(cur, balance) })
    // Before the deposit is in, what they owe NOW is the deposit.
    if (paid < deposit) lines.push({ label: 'Deposit due now', value: money(cur, deposit - paid) })
    const due = day(b.payment_deadline)
    if (due) lines.push({ label: 'Payment due by', value: due })
  }
  return lines
}

export function confirmationText(b: ConfirmationBooking, company: string): string {
  const r = confirmationRecipient(b)
  const head = company ? `*${company}*\n\n` : ''
  const facts = confirmationLines(b).map(l => `${l.label}: ${l.value}`).join('\n')
  const requests = clean(b.special_requests) ? `\n\nYour requests: ${clean(b.special_requests)}` : ''
  return `${head}Dear ${r.name || 'traveller'},\n\nThank you — your booking is confirmed.\n\n${facts}${requests}\n\nWe look forward to welcoming you.\n\n${company ? `${company} team` : 'Your travel team'}`
}

export function confirmationEmail(b: ConfirmationBooking, company: string): { subject: string; html: string } {
  const r = confirmationRecipient(b)
  const rows = confirmationLines(b)
    .map(l => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280">${escapeHtml(l.label)}</td><td style="padding:6px 0;color:#111827;font-weight:600">${escapeHtml(l.value)}</td></tr>`)
    .join('')
  const requests = clean(b.special_requests)
    ? `<p style="margin:16px 0 0;color:#374151"><strong>Your requests:</strong> ${escapeHtml(b.special_requests)}</p>`
    : ''
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">
<h2 style="margin:0 0 16px">${escapeHtml(company || 'Booking confirmation')}</h2>
<p>Dear ${escapeHtml(r.name || 'traveller')},</p>
<p>Thank you — your booking is confirmed.</p>
<table style="border-collapse:collapse;margin:16px 0">${rows}</table>${requests}
<p style="margin-top:24px">We look forward to welcoming you.</p>
<p>${escapeHtml(company ? `${company} team` : 'Your travel team')}</p>
</div>`
  return { subject: `Booking confirmed — ${b.booking_number}${b.trip_name ? ` · ${b.trip_name}` : ''}`, html }
}

/** "Name <address>" with the operator's name on the platform's verified address. */
export function fromWithCompany(company: string, configured: string | undefined): string {
  const fallback = 'notifications@getautoura.net'
  const address = configured?.match(/<([^>]+)>/)?.[1] ?? (configured?.includes('@') ? configured.trim() : fallback)
  const name = company.replace(/[<>"\r\n]/g, '').trim()
  return name ? `${name} <${address}>` : address
}
