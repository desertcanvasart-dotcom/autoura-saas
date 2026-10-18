import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCsp } = require('../security/csp.js') as typeof import('../security/csp.js')
import { summariseCspReport, shouldLogCspViolation } from '@/lib/security/csp-report'

describe('Content-Security-Policy', () => {
  const prod = buildCsp({ supabaseUrl: 'https://abc.supabase.co', growthWidgetUrl: 'https://growth.getautoura.net/widget' })

  it('enforces only the directives that cannot break a page', () => {
    expect(prod.enforced).toBe("object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
  })

  it('the report-only policy covers what the app loads', () => {
    const p = prod.reportOnly
    expect(p).toContain("default-src 'self'")
    expect(p).toContain('https://abc.supabase.co wss://abc.supabase.co') // data + realtime
    expect(p).toContain('https://www.googletagmanager.com')
    expect(p).toContain('https://unpkg.com') // leaflet css
    expect(p).toContain('https://www.youtube.com') // home page video
    expect(p).toContain('https://growth.getautoura.net') // origin only, not the path
    expect(p).not.toContain('/widget')
    expect(p).toContain('report-uri /api/csp-report')
    expect(p).not.toContain('unsafe-eval') // dev only
  })

  it('development allows eval and the dev-server socket', () => {
    const dev = buildCsp({ dev: true })
    expect(dev.reportOnly).toContain("'unsafe-eval'")
    expect(dev.reportOnly).toContain('wss://*.supabase.co')
  })

  it('next.config sends both headers', () => {
    const cfg = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8')
    expect(cfg).toContain("key: 'Content-Security-Policy', value: csp.enforced")
    expect(cfg).toContain("key: 'Content-Security-Policy-Report-Only', value: csp.reportOnly")
  })
})

describe('violation reports', () => {
  it('keeps the directive and the blocked ORIGIN, never a query string', () => {
    const v = summariseCspReport({ 'csp-report': {
      'document-uri': 'https://app.test/bookings/1?token=secret',
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'https://connect.facebook.net/en_US/fbevents.js?id=123',
    } })
    expect(v).toEqual({ directive: 'script-src-elem', blocked: 'https://connect.facebook.net', page: '/bookings/1' })
  })

  it('reads the Reporting API shape too, and ignores junk', () => {
    expect(summariseCspReport([{ body: { effectiveDirective: 'img-src', blockedURL: 'inline', documentURL: 'https://a.test/' } }]))
      .toEqual({ directive: 'img-src', blocked: 'inline', page: '/' })
    expect(summariseCspReport({ nope: 1 })).toBeNull()
    expect(summariseCspReport(null)).toBeNull()
  })

  it('logs each distinct violation once an hour', () => {
    const v = { directive: 'frame-src', blocked: `https://x${Math.random()}.test`, page: '/' }
    expect(shouldLogCspViolation(v, 0)).toBe(true)
    expect(shouldLogCspViolation(v, 1000)).toBe(false)
    expect(shouldLogCspViolation(v, 60 * 60 * 1000)).toBe(true)
  })
})
