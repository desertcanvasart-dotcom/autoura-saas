import { describe, it, expect } from 'vitest'
import { senderName } from '@/lib/email-sender-name'

describe('senderName — who a new-email notification says it is from', () => {
  it.each([
    ['Jane Doe <jane@x.com>', 'Jane Doe'],
    ['"Doe, Jane" <jane@x.com>', 'Doe, Jane'],
    ['<jane@x.com>', 'jane@x.com'],
    ['jane@x.com', 'jane@x.com'],
    ['', 'someone'],
  ])('%s → %s', (from, want) => {
    expect(senderName(from)).toBe(want)
  })
})
