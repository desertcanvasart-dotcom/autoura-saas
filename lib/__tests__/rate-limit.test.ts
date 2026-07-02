import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getClientIdentifier, getRateLimitIdentifier } from '@/lib/rate-limit'

// Minimal NextRequest stand-in: only headers.get is used by the code.
function req(headers: Record<string, string>): any {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { headers: { get: (name: string) => lower[name.toLowerCase()] ?? null } }
}

describe('getClientIdentifier — X-Forwarded-For spoof resistance', () => {
  const original = process.env.TRUSTED_PROXY_COUNT
  beforeEach(() => { delete process.env.TRUSTED_PROXY_COUNT })
  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_COUNT
    else process.env.TRUSTED_PROXY_COUNT = original
  })

  it('ignores a client-prepended spoofed IP and takes the proxy-appended one', () => {
    // Client sent "1.1.1.1"; the trusted edge appended the real client IP.
    expect(getClientIdentifier(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('honors TRUSTED_PROXY_COUNT for multiple trusted hops', () => {
    process.env.TRUSTED_PROXY_COUNT = '2'
    // [spoofed prepend, real client, one trusted-proxy entry] — with 2 trusted
    // hops the client is the 2nd entry from the right.
    expect(getClientIdentifier(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9')
  })

  it('rejects a non-IP token and falls back to unknown', () => {
    expect(getClientIdentifier(req({ 'x-forwarded-for': 'not-an-ip' }))).toBe('unknown')
  })

  it('falls back to x-real-ip when no forwarded-for', () => {
    expect(getClientIdentifier(req({ 'x-real-ip': '192.0.2.5' }))).toBe('192.0.2.5')
  })

  it('returns unknown when nothing usable is present', () => {
    expect(getClientIdentifier(req({}))).toBe('unknown')
  })
})

describe('getRateLimitIdentifier', () => {
  it('prefers the authenticated user id (un-spoofable)', () => {
    expect(getRateLimitIdentifier(req({ 'x-forwarded-for': '1.1.1.1' }), 'user-123')).toBe('user:user-123')
  })

  it('falls back to the hardened IP when anonymous', () => {
    expect(getRateLimitIdentifier(req({ 'x-forwarded-for': '203.0.113.9' }), null)).toBe('ip:203.0.113.9')
  })
})
