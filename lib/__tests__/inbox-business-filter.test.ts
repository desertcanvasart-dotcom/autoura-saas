import { describe, it, expect } from 'vitest'
import { addressOf, isBusinessEmail, isMachineSender, syncQueries, NOISE_CATEGORY_QUERY } from '@/lib/inbox-business-filter'

describe('what counts as business mail', () => {
  const known = new Set(['david.camer@orange.fr'])

  it('reads the address out of a display-name header', () => {
    expect(addressOf('Camer David <David.Camer@orange.fr>')).toBe('david.camer@orange.fr')
    expect(addressOf('jenni@example.com')).toBe('jenni@example.com')
    expect(addressOf(null)).toBe('')
  })

  it('a known sender is business whatever Gmail filed them under', () => {
    expect(isBusinessEmail({ from: 'Camer David <david.camer@orange.fr>', labelIds: ['CATEGORY_PROMOTIONS'] }, known)).toBe(true)
  })

  it("Gmail's promotions, social and forums are noise; updates and primary are not", () => {
    expect(isBusinessEmail({ from: 'Facebook <friends@facebookmail.com>', labelIds: ['CATEGORY_SOCIAL', 'INBOX'] }, known)).toBe(false)
    expect(isBusinessEmail({ from: 'Shop <deals@shop.com>', labelIds: ['CATEGORY_PROMOTIONS'] }, known)).toBe(false)
    expect(isBusinessEmail({ from: 'Hotel <reservations@hilton.com>', labelIds: ['CATEGORY_UPDATES'] }, known)).toBe(true)
    expect(isBusinessEmail({ from: 'Jenni <jenni@example.com>', labelIds: ['INBOX'] }, known)).toBe(true)
  })

  it('machine senders are noise unless on record', () => {
    expect(isMachineSender('noreply@mail.instagram.com')).toBe(true)
    expect(isMachineSender('no-reply@supabase.io')).toBe(true)
    expect(isMachineSender('notifications+abc@github.com')).toBe(true)
    expect(isMachineSender('reservations@hilton.com')).toBe(false)
    expect(isBusinessEmail({ from: 'Supabase <noreply@supabase.io>', labelIds: ['CATEGORY_UPDATES'] }, known)).toBe(false)
    expect(isBusinessEmail({ from: 'noreply@supabase.io', labelIds: [] }, new Set(['noreply@supabase.io']))).toBe(true)
  })

  it('an email with no labels at all is business (never hide on missing data)', () => {
    expect(isBusinessEmail({ from: 'someone@somewhere.com' }, known)).toBe(true)
  })
})

describe('sync queries', () => {
  it('the main query drops the noise categories', () => {
    expect(syncQueries('after:2026/08/01', []).main).toBe(`after:2026/08/01 ${NOISE_CATEGORY_QUERY}`)
    expect(syncQueries('', []).main).toBe(NOISE_CATEGORY_QUERY)
  })

  it('known senders are rescued from those categories, in chunks, deduplicated', () => {
    const addrs = Array.from({ length: 45 }, (_, i) => `c${i}@x.com`).concat(['C1@x.com', 'not-an-address'])
    const { rescues } = syncQueries('after:2026/08/01', addrs, 20)
    expect(rescues).toHaveLength(3)
    expect(rescues[0]).toContain('(category:promotions OR category:social OR category:forums)')
    expect(rescues[0]).toContain('from:c0@x.com OR from:c1@x.com')
    expect(rescues.join(' ')).not.toContain('not-an-address')
    expect(rescues.join(' ').match(/from:c1@x\.com/g)).toHaveLength(1)
  })
})
