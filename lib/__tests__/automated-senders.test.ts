import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isAutomatedSender, waitingSince } from '@/lib/email/automated-senders'

// ============================================
// Nobody is waiting behind a no-reply address
// ============================================
// Live check on 2026-09-18: the inbox showed 12 conversations "waiting on us",
// and the five oldest were donotreply@twilio.com, noreply@twilio.com,
// ads-noreply@google.com and verifymyaccount@twilio.zendesk.com. The oldest
// had been "waiting" 38 days. A list that cries wolf is a list nobody reads.

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

describe('isAutomatedSender', () => {
  it('knows the addresses found in the live inbox', () => {
    for (const address of [
      'donotreply@twilio.com',
      'noreply@twilio.com',
      'ads-noreply@google.com',
      'verifymyaccount@twilio.zendesk.com',
    ]) {
      expect(isAutomatedSender(address), address).toBe(true)
    }
  })

  it('knows the usual spellings, whatever the punctuation or case', () => {
    for (const address of [
      'no-reply@example.com',
      'No_Reply@Example.com',
      'do.not.reply@example.com',
      'MAILER-DAEMON@example.com',
      'postmaster@example.com',
      'bounces@example.com',
      'notifications@example.com',
      'newsletter@example.com',
      'billing@example.com',
      'someone@mailer.example.com',
      'hello@notifications.example.com',
    ]) {
      expect(isAutomatedSender(address), address).toBe(true)
    }
  })

  it('knows the services found on the dashboard on 2026-10-05', () => {
    for (const address of [
      'support@supabase.com',
      'ant@supabase.io',
      'hello@mail.app.supabase.io',
      'info@egymonuments.gov.eg',
      'tickets@egymonuments.com',
      'contact@visit-gem.com',
      'gem@tickets.gem.gov.eg',
    ]) {
      expect(isAutomatedSender(address), address).toBe(true)
    }
  })

  it('knows booking systems that confirm rather than ask', () => {
    for (const address of [
      'gem-portal@example.com',
      'portal@example.com',
      'autoreply@example.com',
      'auto-confirm@example.com',
      'confirmation@example.com',
      'receipts@example.com',
    ]) {
      expect(isAutomatedSender(address), address).toBe(true)
    }
  })

  it('does not mistake a lookalike domain for a service', () => {
    for (const address of [
      'ada@notsupabase.com',      // shares a suffix, not the domain
      'ada@supabase.com.evil.io', // contains the name, is somewhere else
      'ada@visit-gem.co',
    ]) {
      expect(isAutomatedSender(address), address).toBe(false)
    }
  })

  it('leaves a person alone', () => {
    for (const address of [
      'ada@example.com',
      'ada.lovelace@gmail.com',
      'reservations@hotel.com',
      'rese.eatabe@aracan.ca',   // a hotel's reservations desk is a person
      'reservation.cairo@hotel.com',
      'portalis@example.com',    // a surname, not a "portal"
      'support@egymonuments-tours.com', // a tour company, not the ticket system
      'nora@example.com',      // starts with "no", is not a no-reply
      'newton@example.com',    // starts with "new", is not a newsletter
      'systemaxx@example.com', // begins with "system" but is a company name
    ]) {
      expect(isAutomatedSender(address), address).toBe(false)
    }
  })

  it('says nothing about what is not an address', () => {
    expect(isAutomatedSender(null)).toBe(false)
    expect(isAutomatedSender(undefined)).toBe(false)
    expect(isAutomatedSender('')).toBe(false)
    expect(isAutomatedSender('noreply')).toBe(false)
  })
})

describe('waitingSince', () => {
  const STAMP = '2026-09-18T09:00:00Z'

  it('a customer is waiting', () => {
    expect(waitingSince('ada@example.com', STAMP)).toBe(STAMP)
  })

  it('a robot is not', () => {
    expect(waitingSince('donotreply@twilio.com', STAMP)).toBeNull()
  })

  it('an answered conversation is not', () => {
    expect(waitingSince('ada@example.com', null)).toBeNull()
  })
})

describe('one implementation', () => {
  // Three surfaces read the same column: the inbox badge, the "waiting on us"
  // filter and the dashboard item. They must not be able to disagree.
  it('every reader of awaiting_reply_since goes through waitingSince', () => {
    for (const file of [
      'app/api/conversations/route.ts',
      'app/api/email/conversations/route.ts',
      'lib/dashboard/attention.ts',
    ]) {
      const src = read(file)
      expect(src, file).toMatch(/waitingSince\(/)
      // Nothing may hand the raw column onwards as the answer.
      expect(src, file).not.toMatch(/awaiting_reply_since:\s*c\.awaiting_reply_since/)
    }
  })

  it('lead detection shares the same list', () => {
    expect(read('lib/email/email-leads.ts')).toMatch(/isAutomatedSender/)
  })
})
