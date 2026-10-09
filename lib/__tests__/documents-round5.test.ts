import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isFirstReminderDue } from '@/lib/invoice-dates'
import { quoteSentUpdate } from '@/lib/quotes/quote-sent-update'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('isFirstReminderDue', () => {
  it('sends an invoice already on the ladder', () => {
    expect(isFirstReminderDue('2026-10-01', -30)).toBe(true)
  })
  it('starts a never-reminded invoice a week before it is due', () => {
    expect(isFirstReminderDue(null, -8)).toBe(false)
    expect(isFirstReminderDue(null, -7)).toBe(true)
    expect(isFirstReminderDue(null, 12)).toBe(true)
  })
  it('the cron picks up never-reminded invoices', () => {
    expect(src('app/api/cron/send-reminders/route.ts')).toContain('next_reminder_date.is.null')
  })
})

describe('client quote PDF', () => {
  // cost_breakdown is the operator's net cost per category; the table printed
  // it, summing to total_cost, right above the selling price.
  it('prints no amount from cost_breakdown', () => {
    const pdf = src('components/pdf/B2CQuotePDF.tsx')
    expect(pdf).not.toMatch(/costBreakdownEntries\.map/)
    expect(pdf).not.toContain('{value.toLocaleString()}')
  })
})

describe('WhatsApp AI agent quote tool', () => {
  const agent = src('lib/whatsapp-ai-agent.ts')
  it('returns no net costs', () => {
    expect(agent).not.toContain('cost_breakdown: quote.cost_breakdown')
  })
  it('refuses a quote when the sender is no known client', () => {
    expect(agent).toContain('if (!this.clientId || quote.client_id !== this.clientId)')
  })
  it('records a WhatsApp AI send without demoting an accepted quote', () => {
    expect(quoteSentUpdate('b2c', 'accepted', 'whatsapp_ai', new Date('2026-10-09T00:00:00Z')))
      .toEqual({ sent_at: '2026-10-09T00:00:00.000Z', sent_via: 'whatsapp_ai' })
  })
})

describe('template email send', () => {
  it('passes the sender to /api/gmail/send (which refuses a request without userId)', () => {
    expect(src('app/api/templates/send/route.ts')).toMatch(/JSON\.stringify\(\{\s*userId,/)
  })
})

describe('mark-sent', () => {
  it('only moves a quote-stage trip to sent', () => {
    expect(src('app/api/itineraries/[id]/mark-sent/route.ts')).toContain("status.is.null,status.in.(")
  })
})
