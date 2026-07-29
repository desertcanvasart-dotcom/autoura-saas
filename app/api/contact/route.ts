import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendSystemEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'

// Public marketing contact / pilot-application endpoint.
//
// No session (that is the point — the sender is a prospect). Self-auth
// mechanisms, registered in the route-auth sweep:
//   * contactRateLimit — per-IP rate limit so the open endpoint cannot be
//     used to flood the inbox
//   * website_hp — honeypot field; bots that fill every input are dropped
//     with a fake 200 so they learn nothing
//
// The previous contact form did not submit anywhere at all: it awaited a
// 1.5s timer and showed a success message. Every lead it ever "captured"
// was silently discarded.

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().max(300).optional().default(''),
  whatsapp: z.string().trim().max(50).optional().default(''),
  monthly_bookings: z.string().trim().max(50).optional().default(''),
  message: z.string().trim().min(1).max(5000),
  // Attribution — captured client-side, forwarded verbatim
  source_page: z.string().trim().max(500).optional().default(''),
  referrer: z.string().trim().max(1000).optional().default(''),
  utm: z.record(z.string(), z.string().max(500)).optional().default({}),
  // First-touch attribution (sessionStorage): the campaign that originally
  // brought the visitor this session, surviving navigation to /contact.
  first_touch: z
    .object({
      utm: z.record(z.string(), z.string().max(500)).optional().default({}),
      landing_page: z.string().trim().max(500).optional().default(''),
      referrer: z.string().trim().max(1000).optional().default(''),
      captured_at: z.string().trim().max(50).optional().default(''),
    })
    .optional(),
  // Honeypot: humans never see this field
  website_hp: z.string().optional().default(''),
})

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limited = checkRateLimit(ip, 'contact')
  if (!limited.success) {
    return NextResponse.json(
      { success: false, error: 'Too many requests — please try again in a minute.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }

  const parsed = ContactSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Please fill in your name, a valid email, and a message.' },
      { status: 400 }
    )
  }
  const d = parsed.data

  // Honeypot filled → almost certainly a bot. Pretend success; send nothing.
  if (d.website_hp) {
    return NextResponse.json({ success: true })
  }

  const to = process.env.CONTACT_INBOX_EMAIL || process.env.BUSINESS_EMAIL
  if (!to) {
    console.error('Contact form: CONTACT_INBOX_EMAIL / BUSINESS_EMAIL not configured')
    return NextResponse.json(
      { success: false, error: 'Message could not be delivered — please email us directly.' },
      { status: 500 }
    )
  }

  const utmRows = Object.entries(d.utm)
    .map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('')

  const result = await sendSystemEmail({
    to,
    replyTo: d.email,
    subject: `Pilot application / contact — ${d.name}${d.company ? ` (${d.company})` : ''}`,
    html: `
      <h2 style="margin:0 0 12px">New website inquiry</h2>
      <table cellpadding="4" style="font-size:14px">
        <tr><td style="color:#666">Name</td><td><strong>${esc(d.name)}</strong></td></tr>
        <tr><td style="color:#666">Email</td><td>${esc(d.email)}</td></tr>
        <tr><td style="color:#666">Company</td><td>${esc(d.company) || '—'}</td></tr>
        <tr><td style="color:#666">WhatsApp</td><td>${esc(d.whatsapp) || '—'}</td></tr>
        <tr><td style="color:#666">Monthly bookings</td><td>${esc(d.monthly_bookings) || '—'}</td></tr>
      </table>
      <h3 style="margin:16px 0 6px">Message</h3>
      <p style="white-space:pre-wrap;font-size:14px">${esc(d.message)}</p>
      <h3 style="margin:16px 0 6px">Attribution</h3>
      <table cellpadding="4" style="font-size:12px">
        <tr><td style="color:#666">Page</td><td>${esc(d.source_page) || '—'}</td></tr>
        <tr><td style="color:#666">Referrer</td><td>${esc(d.referrer) || '—'}</td></tr>
        ${utmRows}
      </table>
      ${
        d.first_touch
          ? `<h3 style="margin:16px 0 6px">First touch (this session)</h3>
      <table cellpadding="4" style="font-size:12px">
        <tr><td style="color:#666">Landing page</td><td>${esc(d.first_touch.landing_page) || '—'}</td></tr>
        <tr><td style="color:#666">Referrer</td><td>${esc(d.first_touch.referrer) || '—'}</td></tr>
        <tr><td style="color:#666">Captured</td><td>${esc(d.first_touch.captured_at) || '—'}</td></tr>
        ${Object.entries(d.first_touch.utm)
          .map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`)
          .join('')}
      </table>`
          : ''
      }
    `,
  })

  if (!result.sent) {
    console.error('Contact form delivery failed:', result.error || 'RESEND not configured')
    return NextResponse.json(
      { success: false, error: 'Message could not be delivered — please email us directly.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true })
}
