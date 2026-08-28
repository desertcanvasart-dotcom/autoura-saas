import { describe, it, expect } from 'vitest'
import { bearerMatches } from '../support/probe-auth'

// /api/health/deep sits under the '/api/health' prefix, which middleware lets
// through WITHOUT a session. bearerMatches is therefore the only thing standing
// in front of it, which is why "fails closed" is the first test here.

describe('bearerMatches', () => {
  it('accepts the configured secret', () => {
    expect(bearerMatches('Bearer s3cret-value', 's3cret-value')).toBe(true)
  })

  it('FAILS CLOSED when no secret is configured', () => {
    // The dangerous reading is "nothing to check against, so let them in".
    for (const secret of [undefined, '', '   ']) {
      expect(bearerMatches('Bearer anything', secret)).toBe(false)
      expect(bearerMatches(null, secret)).toBe(false)
    }
  })

  it('rejects a missing or malformed header', () => {
    expect(bearerMatches(null, 's3cret')).toBe(false)
    expect(bearerMatches(undefined, 's3cret')).toBe(false)
    expect(bearerMatches('s3cret', 's3cret')).toBe(false)          // no scheme
    expect(bearerMatches('Basic s3cret', 's3cret')).toBe(false)    // wrong scheme
    expect(bearerMatches('bearer s3cret', 's3cret')).toBe(false)   // case matters
  })

  it('rejects a wrong secret of the same length', () => {
    expect(bearerMatches('Bearer aaaaaaaa', 'bbbbbbbb')).toBe(false)
  })

  it('rejects a prefix of the real secret', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret-value')).toBe(false)
  })

  it('does not throw on unusual input', () => {
    expect(bearerMatches('Bearer 🔑', '🔑')).toBe(true)
    expect(() => bearerMatches('Bearer ' + 'x'.repeat(10000), 'y')).not.toThrow()
  })
})
