import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { failureReason } from '@/lib/whatsapp-outbound'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('WhatsApp delivery failures reach the sender (migration 430)', () => {
  it('every successful send is recorded by the central sender', () => {
    const src = read('lib/whatsapp.ts')
    expect(src).toContain('recordOutboundWhatsApp({ tenantId: message.tenantId, messageSid: result.messageId')
  })
  it('both providers’ delivery callbacks update the record', () => {
    expect(read('app/api/whatsapp/status-callback/route.ts')).toContain('applyOutboundStatus({ messageSid, status, errorCode, errorMessage })')
    expect(read('app/api/whatsapp/webhook/route.ts')).toContain('applyOutboundStatus({ messageSid: s.messageSid')
  })
  it('explains the 24-hour window in words', () => {
    expect(failureReason('63016', null)).toMatch(/24 hours/)
    expect(failureReason('131047', null)).toMatch(/24 hours/)
    expect(failureReason('63003', null)).toMatch(/not on WhatsApp/)
    expect(failureReason(null, 'Some provider text')).toBe('Some provider text')
  })
})
