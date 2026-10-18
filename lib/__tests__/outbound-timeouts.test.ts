import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A call to another service with no timeout holds the request (and a server
// worker) for as long as that service hangs.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('outbound calls are bounded', () => {
  it('the Anthropic client has a timeout and does not stack retries', () => {
    const src = read('lib/ai/anthropic-client.ts')
    expect(src).toMatch(/new Anthropic\(\{[^}]*timeout: \d/)
    expect(src).toMatch(/new Anthropic\(\{[^}]*maxRetries: 1/)
  })

  it('the OpenAI clients have timeouts', () => {
    for (const f of ['lib/embeddings.ts', 'lib/translate.ts', 'app/api/translate/route.ts']) {
      expect(read(f), f).toMatch(/new OpenAI\(\{ apiKey, timeout: \d/)
    }
  })

  it('every server fetch to another service carries an AbortSignal timeout', () => {
    const counts: Record<string, number> = {
      'lib/whatsapp-cloud-api.ts': 3,
      'lib/exchange-rate-api.ts': 1,
      'lib/currency-service.ts': 1,
      'lib/company-identity.ts': 2,
      'app/api/templates/send/route.ts': 2,
      'app/api/gmail/send/route.ts': 1,
      'lib/monitoring/error-alerts.ts': 1,
    }
    for (const [f, n] of Object.entries(counts)) {
      expect((read(f).match(/AbortSignal\.timeout\(/g) ?? []).length, f).toBeGreaterThanOrEqual(n)
    }
  })

  it('logo fetches never follow a redirect past the SSRF check', () => {
    expect((read('lib/company-identity.ts').match(/redirect: 'error'/g) ?? []).length).toBe(2)
  })
})
