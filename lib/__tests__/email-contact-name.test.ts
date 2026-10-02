/* eslint-disable @typescript-eslint/no-explicit-any -- a hand-rolled query-builder fake */
import { describe, it, expect } from 'vitest'
import { contactNameFromThread, conversationTitle, fillMissingContactNames } from '@/lib/email/contact-name'
import { syncSummary } from '@/lib/email/sync-summary'

const msg = (headers: Record<string, string>) => ({
  payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
})

describe('contactNameFromThread', () => {
  it('finds the customer name in a later reply when the office wrote first to a bare address', () => {
    const thread = [
      msg({ From: 'Rabab <rabab@travel2egypt.org>', To: 'ayesha@legendtours.co.za' }),
      msg({ From: 'Ayesha Khan <ayesha@legendtours.co.za>', To: 'rabab@travel2egypt.org' }),
    ]
    expect(contactNameFromThread(thread, 'ayesha@legendtours.co.za')).toBe('Ayesha Khan')
  })

  it('reads To and Cc lists, quoted names with commas included', () => {
    const thread = [msg({ From: 'x@office.com', To: 'a@b.com, "Maschke, Jutta" <Jutta.Maschke@googlemail.com>' })]
    expect(contactNameFromThread(thread, 'jutta.maschke@googlemail.com')).toBe('Maschke, Jutta')
  })

  it('returns null when no header names the address, or the name is the address again', () => {
    expect(contactNameFromThread([msg({ To: 'bruneel.luc1@telenet.be' })], 'bruneel.luc1@telenet.be')).toBeNull()
    expect(contactNameFromThread([msg({ From: '"bruneel.luc1@telenet.be" <bruneel.luc1@telenet.be>' })], 'bruneel.luc1@telenet.be')).toBeNull()
  })
})

describe('conversationTitle', () => {
  it('falls back to the client on record, then the address — not "Unknown"', () => {
    expect(conversationTitle({ contact_name: 'Jamie', contact_email: 'j@x.com' })).toBe('Jamie')
    expect(conversationTitle({ contact_name: null, contact_email: 'j@x.com', client: { full_name: 'Jamie Leibert' } })).toBe('Jamie Leibert')
    expect(conversationTitle({ contact_name: null, contact_email: 'ayesha@legendtours.co.za' })).toBe('ayesha@legendtours.co.za')
    expect(conversationTitle({})).toBe('Unknown')
  })
})

describe('fillMissingContactNames', () => {
  function fakeDb(rows: { conversations: any[]; from: any[]; to: any[] }) {
    const updates: Array<{ id: string; patch: any }> = []
    const db = {
      from(table: string) {
        let mode = ''
        let patch: any = null
        const q: any = {
          select(cols: string) { mode = cols; return q },
          update(p: any) { patch = p; return q },
          eq(col: string, val: string) { if (patch && col === 'id') updates.push({ id: val, patch }); return q },
          is() { return q }, not() { return q }, in() { return q }, order() { return q },
          limit() { return q },
          then(resolve: (v: any) => void) {
            if (patch) return resolve({ error: null })
            if (table === 'unified_conversations') return resolve({ data: rows.conversations, error: null })
            return resolve({ data: mode.startsWith('from') ? rows.from : rows.to, error: null })
          },
        }
        return q
      },
    }
    return { db, updates }
  }

  it('names unnamed conversations from stored From names first, then To names', async () => {
    const { db, updates } = fakeDb({
      conversations: [{ id: 'c1', contact_email: 'ayesha@legendtours.co.za' }, { id: 'c2', contact_email: 'rese@aracan.ca' }, { id: 'c3', contact_email: 'nobody@x.com' }],
      from: [{ from_email: 'ayesha@legendtours.co.za', from_name: 'Ayesha Khan' }],
      to: [{ to_email: 'rese@aracan.ca', to_name: 'Rese Eatabe' }],
    })
    expect(await fillMissingContactNames(db, 't1')).toBe(2)
    expect(updates).toEqual([
      { id: 'c1', patch: { contact_name: 'Ayesha Khan' } },
      { id: 'c2', patch: { contact_name: 'Rese Eatabe' } },
    ])
  })
})

describe('syncSummary', () => {
  it('says why a refused sync was refused', () => {
    expect(syncSummary(false, { success: false, error: 'Gmail not connected' })).toMatchObject({ kind: 'error', text: expect.stringMatching(/No Gmail account is connected/) })
    expect(syncSummary(false, { success: false, error: 'invalid_grant' }).text).toMatch(/Reconnect Gmail/)
  })

  it('reports a partial run as a warning, not success', () => {
    const s = syncSummary(true, { success: true, messages_created: 2, warning: '1 message(s) could not be downloaded' })
    expect(s.kind).toBe('warning')
    expect(s.text).toMatch(/2 new messages.*could not be downloaded/)
  })

  it('tells "nothing new" apart from new mail and reopened conversations', () => {
    expect(syncSummary(true, { success: true, messages_created: 0 }).kind).toBe('info')
    expect(syncSummary(true, { success: true, messages_created: 1, conversations_reopened: 1 }).text).toBe('Synced: 1 new message, 1 moved back from Archived.')
  })
})
