import { describe, it, expect } from 'vitest'
import { worthJudging, leadName, readJudgement } from '@/lib/email/email-leads'
import { officeRule } from '@/lib/email/office-addresses'

// ============================================
// A travel request becomes a Lead
// ============================================
// Mail is judged once, when its conversation first appears. The value is in
// what is NEVER judged and what is never created: a CRM full of newsletters
// and suppliers is worse than no detection at all.

const OFFICE = officeRule(['info@agency.com'], [])
const context = (over: Partial<{ known: string[]; dismissed: string[] }> = {}) => ({
  office: OFFICE,
  knownClientEmails: new Set(over.known ?? []),
  dismissedEmails: new Set(over.dismissed ?? []),
})

describe('worthJudging', () => {
  it('judges a stranger who wrote in', () => {
    expect(worthJudging({ fromEmail: 'ada@example.com' }, context())).toBe(true)
  })

  it('never judges the office itself — including a colleague on our domain', () => {
    expect(worthJudging({ fromEmail: 'info@agency.com' }, context())).toBe(false)
    expect(worthJudging({ fromEmail: 'hello@agency.com' }, context())).toBe(false)
  })

  it('never judges somebody already on record', () => {
    expect(worthJudging({ fromEmail: 'ada@example.com' }, context({ known: ['ada@example.com'] }))).toBe(false)
  })

  it('never judges a sender told "not a lead" — or the same wrong lead returns', () => {
    expect(worthJudging({ fromEmail: 'news@supplier.com' }, context({ dismissed: ['news@supplier.com'] }))).toBe(false)
  })

  it('never judges an address no human writes from', () => {
    for (const from of [
      'no-reply@booking.com', 'noreply@hotel.com', 'do-not-reply@airline.com',
      'mailer-daemon@mail.test', 'postmaster@mail.test', 'bounces@sendgrid.net',
      'notifications@app.test', 'newsletter@supplier.com', 'billing@supplier.com',
    ]) {
      expect(worthJudging({ fromEmail: from }, context()), from).toBe(false)
    }
  })

  it('never judges something that is not an address', () => {
    for (const from of ['', 'not an address', 'Name Only']) {
      expect(worthJudging({ fromEmail: from }, context()), from).toBe(false)
    }
  })
})

describe('leadName', () => {
  it('uses the display name', () => {
    expect(leadName({ fromEmail: 'ada@example.com', fromName: 'Ada Lovelace' }))
      .toEqual({ first_name: 'Ada', last_name: 'Lovelace' })
  })

  it('falls back to the address, never to nothing', () => {
    expect(leadName({ fromEmail: 'ada.lovelace@example.com', fromName: null }))
      .toEqual({ first_name: 'ada.lovelace' })
    expect(leadName({ fromEmail: 'ada@example.com', fromName: '   ' }).first_name).toBe('ada')
  })

  it('keeps a long name whole', () => {
    expect(leadName({ fromEmail: 'x@y.com', fromName: 'Maria del Carmen Ruiz' }))
      .toEqual({ first_name: 'Maria', last_name: 'del Carmen Ruiz' })
  })
})

describe('readJudgement', () => {
  const reply = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' })

  it('reads a yes and a no', () => {
    expect(readJudgement(reply('{"isRequest": true, "reason": "asks about a Nile cruise"}')))
      .toEqual({ isRequest: true, reason: 'asks about a Nile cruise' })
    expect(readJudgement(reply('{"isRequest": false, "reason": "supplier invoice"}'))?.isRequest).toBe(false)
  })

  it('finds the JSON when the model wraps it in prose', () => {
    expect(readJudgement(reply('Sure!\n\n{"isRequest": true, "reason": "wants a quote"}\n'))?.isRequest).toBe(true)
  })

  it('reads past a thinking block', () => {
    const withThinking = {
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'text', text: '{"isRequest": true, "reason": "asks for dates"}' },
      ],
      stop_reason: 'end_turn',
    }
    expect(readJudgement(withThinking)?.isRequest).toBe(true)
  })

  it('creates NOTHING when the answer cannot be read', () => {
    for (const bad of [reply(''), reply('no idea'), reply('{"isRequest": "yes"}'), reply('{broken'), {}, null]) {
      expect(readJudgement(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})
