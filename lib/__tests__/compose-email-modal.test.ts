import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// The compose dialog (Communications, the itinerary's client card) posted
// `user_id`; /api/gmail/send reads `userId` and requires a subject, so every
// send from it failed with "Missing required fields".
describe('the compose dialog speaks the send route\'s language', () => {
  const modal = readFileSync(join(process.cwd(), 'components/unified/ComposeEmailModal.tsx'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/gmail/send/route.ts'), 'utf8')

  it('the route reads userId, to, subject and body', () => {
    expect(route).toMatch(/userId, to, subject, body/)
    expect(route).toContain('if (!userId || !to || !subject || !body)')
  })

  it('the dialog sends userId (not user_id) and requires a subject', () => {
    expect(modal).not.toMatch(/user_id:\s*userId/)
    expect(modal).toMatch(/body: JSON\.stringify\(\{\s*userId,/)
    expect(modal).toContain("!subject.trim()")
  })
})
