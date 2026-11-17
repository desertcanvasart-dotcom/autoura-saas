import { describe, it, expect } from 'vitest'
import {
  buildPolishPrompt, parsePolishReply, cleanWhatsAppFormat, unsourcedNumbers, polishStyle, POLISH_STYLES,
} from '@/lib/whatsapp/polish-reply'

const chat = [
  { direction: 'inbound' as const, text: 'Bonjour, est-ce possible de voir les six sites en une journée le 11 janvier 2027 ?' },
]

describe('buildPolishPrompt', () => {
  it('writes in the language of the customer\'s last message when there is one', () => {
    const p = buildPolishPrompt({ businessName: 'Travel2Egypt', style: 'friendly', notes: 'yes, 330 euro for 2', messages: chat })
    expect(p.system).toContain("language of the CUSTOMER's most recent message")
    expect(p.user).toContain('CUSTOMER: Bonjour')
    expect(p.user).toContain('yes, 330 euro for 2')
  })

  it('no customer message yet: the language of the notes', () => {
    const p = buildPolishPrompt({ businessName: 'X', style: 'short', notes: 'hello', messages: [] })
    expect(p.system).toContain('language of the notes')
    expect(p.user).toContain('(no messages yet)')
  })

  it('carries the picked style and the no-new-facts rule', () => {
    const p = buildPolishPrompt({ businessName: 'X', style: 'formal', notes: 'n', messages: chat })
    expect(p.system).toContain('STYLE: Formal')
    expect(p.system).toContain('Never add, guess or change one')
  })

  it('an unknown style falls back to Professional & friendly', () => {
    expect(polishStyle('shouty').key).toBe('friendly')
    expect(POLISH_STYLES.map(s => s.key)).toEqual(['friendly', 'short', 'detailed', 'formal'])
  })
})

describe('parsePolishReply', () => {
  it('reads the JSON, with or without a code fence', () => {
    expect(parsePolishReply('{"language":"French","message":"Bonjour Aki"}')).toEqual({ message: 'Bonjour Aki', language: 'French' })
    expect(parsePolishReply('```json\n{"language":"French","message":"Salut"}\n```')?.message).toBe('Salut')
  })
  it('null when there is no message', () => {
    expect(parsePolishReply('{"language":"French","message":""}')).toBeNull()
    expect(parsePolishReply('not json')).toBeNull()
  })
})

describe('cleanWhatsAppFormat', () => {
  it('markdown bold and headings become WhatsApp bold; blank runs collapse', () => {
    expect(cleanWhatsAppFormat('## Programme\n\n\n\n**330 EUR**')).toBe('*Programme*\n\n*330 EUR*')
  })
})

describe('unsourcedNumbers', () => {
  const notes = 'yes all 6 sites, 330 euro for 2, pickup 7am, back 4.45pm'
  it('numbers from the notes or the chat are fine, in any time format', () => {
    const msg = 'Bonjour ! Les 6 sites le 11 janvier 2027 : 330 EUR pour 2. Prise en charge à 07h00, retour vers 16h45 / 4:45.'
    // 16h45 = the 24-hour form of 4.45pm.
    expect(unsourcedNumbers(msg, [notes, chat[0].text])).toEqual([])
  })
  it('flags a price the notes never gave', () => {
    expect(unsourcedNumbers('Le prix est de 350 EUR pour 2.', [notes])).toEqual(['350'])
  })
  it('decimals match with a comma or a point', () => {
    expect(unsourcedNumbers('12,50 EUR', ['12.50 euro'])).toEqual([])
  })
})
