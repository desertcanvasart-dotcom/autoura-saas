import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { alertText, errorSignature, reportServerError, shouldAlert, ALERT_THROTTLE_MS } from '@/lib/monitoring/error-alerts'
import { jobsNeedAttention } from '@/lib/support/job-health'
import { staleAfterHours, STALE_AFTER_HOURS } from '@/lib/support/bundle'

afterEach(() => { vi.restoreAllMocks(); delete process.env.ALERT_WEBHOOK_URL })

describe('server error alerts', () => {
  it('one alert per distinct error per window, not per request', () => {
    const sig = errorSignature(new Error('boom 123'), { routePath: '/api/x' })
    expect(errorSignature(new Error('boom 456'), { routePath: '/api/x' })).toBe(sig) // numbers do not split it
    expect(shouldAlert(sig, 1_000)).toBe(true)
    expect(shouldAlert(sig, 2_000)).toBe(false)
    expect(shouldAlert(sig, 1_000 + ALERT_THROTTLE_MS)).toBe(true)
  })

  it('scrubs what it sends', () => {
    const text = alertText(new Error('failed for jane.doe@example.com'), { method: 'POST', routePath: '/api/clients' })
    expect(text).toContain('POST /api/clients')
    expect(text).not.toContain('jane.doe@example.com')
  })

  it('posts to the webhook when one is set, and never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/abc'
    await reportServerError(new Error(`unique ${Math.random()}`), { routePath: `/api/r${Math.random()}` })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRejectedValueOnce(new Error('down'))
    await expect(reportServerError(new Error(`other ${Math.random()}`), { routePath: '/api/z' })).resolves.toBeUndefined()
  })

  it('instrumentation.ts wires onRequestError to it', () => {
    const src = readFileSync(join(process.cwd(), 'instrumentation.ts'), 'utf8')
    expect(src).toContain('export const onRequestError')
    expect(src).toContain('reportServerError(')
  })
})

describe('each job has its own staleness limit', () => {
  it('frequent jobs go stale in hours, the rest after two days', () => {
    expect(staleAfterHours('scheduled-send')).toBe(1)
    expect(staleAfterHours('gmail-sync')).toBe(2)
    expect(staleAfterHours('exchange-rates')).toBe(STALE_AFTER_HOURS)
  })

  it('strict health lists stopped, failed and unfinished jobs only', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    const ago = (h: number) => new Date(now - h * 3600000).toISOString()
    expect(jobsNeedAttention([
      { name: 'scheduled-send', lastRun: ago(3), lastOutcome: 'ok' },   // stale for a 5-minute job
      { name: 'exchange-rates', lastRun: ago(3), lastOutcome: 'ok' },   // fine for a daily one
      { name: 'reminders', lastRun: ago(1), lastOutcome: 'failed' },
      { name: 'agent-memory', lastRun: null, lastOutcome: null },        // never run: a setup finding
    ], now)).toEqual(['scheduled-send', 'reminders'])
  })
})
