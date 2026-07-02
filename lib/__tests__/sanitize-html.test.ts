import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from '@/lib/sanitize-html'

describe('sanitizeEmailHtml', () => {
  it('strips <script> tags', () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script>')
    expect(out).toContain('hi')
    expect(out.toLowerCase()).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  it('strips inline event handlers', () => {
    const out = sanitizeEmailHtml('<img src=x onerror="alert(1)">')
    expect(out.toLowerCase()).not.toContain('onerror')
  })

  it('strips javascript: URLs', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')
    expect(out.toLowerCase()).not.toContain('javascript:')
  })

  it('keeps ordinary formatting and links', () => {
    const out = sanitizeEmailHtml('<p><strong>Bold</strong> and <a href="https://example.com">link</a></p>')
    expect(out).toContain('<strong>Bold</strong>')
    expect(out).toContain('href="https://example.com"')
  })

  it('forces external links to open safely (target/rel)', () => {
    const out = sanitizeEmailHtml('<a href="https://example.com">x</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('returns empty string for empty/null input', () => {
    expect(sanitizeEmailHtml('')).toBe('')
    expect(sanitizeEmailHtml(null)).toBe('')
    expect(sanitizeEmailHtml(undefined)).toBe('')
  })
})
