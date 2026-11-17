import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { microphoneErrorMessage } from '@/lib/whatsapp/microphone-error'

describe('the site lets its own pages use the microphone', () => {
  it('Permissions-Policy allows microphone=(self) — microphone=() blocked WhatsApp voice notes on every page', async () => {
    const require = createRequire(import.meta.url)
    const config = require('../../next.config.js')
    const routes = await config.headers()
    const values = routes.flatMap((r: { headers: { key: string; value: string }[] }) => r.headers)
      .filter((h: { key: string }) => h.key.toLowerCase() === 'permissions-policy')
      .map((h: { value: string }) => h.value)
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) {
      expect(v).toContain('microphone=(self)')
      expect(v).not.toMatch(/microphone=\(\)/)
    }
  })
})

describe('microphoneErrorMessage', () => {
  it('names the cause', () => {
    expect(microphoneErrorMessage({ name: 'NotAllowedError' })).toContain('blocked for this site')
    expect(microphoneErrorMessage({ name: 'NotFoundError' })).toContain('No microphone was found')
    expect(microphoneErrorMessage({ name: 'NotReadableError' })).toContain('busy')
    expect(microphoneErrorMessage(new Error('x'))).toContain('could not be opened')
  })
})
