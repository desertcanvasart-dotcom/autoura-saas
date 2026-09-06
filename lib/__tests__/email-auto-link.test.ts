import { describe, it, expect } from 'vitest'
import { matchEmailsToClients } from '@/lib/email-auto-link'

// The pure half of the auto-link pass that runs after every email sync:
// which synced messages belong to which client on record.
describe('matchEmailsToClients', () => {
  const clients = [
    { id: 'c1', email: 'David.Camer@orange.fr' },
    { id: 'c2', email: 'jenni@example.com' },
    { id: 'c3', email: null },
  ]

  it('matches the sender case-insensitively and carries the thread and address', () => {
    const out = matchEmailsToClients([{ messageId: 'm1', threadId: 't1', fromEmail: 'david.camer@orange.fr' }], clients, new Set())
    expect(out).toEqual([{ messageId: 'm1', threadId: 't1', clientId: 'c1', emailAddress: 'david.camer@orange.fr' }])
  })

  it('falls back to a recipient for outbound mail', () => {
    const out = matchEmailsToClients([{ messageId: 'm2', fromEmail: 'me@agency.com', toEmails: ['x@nowhere.com', 'JENNI@example.com'] }], clients, new Set())
    expect(out.map(o => o.clientId)).toEqual(['c2'])
  })

  it('skips strangers and messages already linked', () => {
    const out = matchEmailsToClients(
      [{ messageId: 'm3', fromEmail: 'stranger@x.com' }, { messageId: 'm4', fromEmail: 'jenni@example.com' }],
      clients, new Set(['m4'])
    )
    expect(out).toEqual([])
  })

  it('a client without an address never matches', () => {
    expect(matchEmailsToClients([{ messageId: 'm5', fromEmail: '' }], clients, new Set())).toEqual([])
  })
})
