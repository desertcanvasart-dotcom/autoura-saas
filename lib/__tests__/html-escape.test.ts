import { describe, it, expect } from 'vitest'
import { escapeHtml, safeUrl } from '@/lib/html-escape'

// ============================================================================
// These guard a server-side script execution hole, not a cosmetic one: the
// two PDF routes hand hand-built HTML to Puppeteer running --no-sandbox, so a
// breakout runs code in the server's network position during someone else's
// render. The payloads below are the actual shapes that reach those strings.
// ============================================================================

describe('escapeHtml', () => {
  it('neutralises the attribute-breakout payload from the audit', () => {
    const payload = `x" onerror="fetch('http://169.254.169.254/latest/meta-data/')`
    const out = escapeHtml(payload)
    // The quote is what ends the attribute — it must not survive.
    expect(out).not.toContain('"')
    expect(out).toContain('&quot;')
    expect(`<img src="${out}" />`.match(/"/g)?.length).toBe(2) // only the two we wrote
  })

  it('neutralises tag injection in a text context', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml("</h1><img src=x onerror=alert(1)>"))
      .not.toContain('<')
  })

  it('escapes & first so entities are not double-escaped', () => {
    expect(escapeHtml('Sawa & Co <tours>')).toBe('Sawa &amp; Co &lt;tours&gt;')
    // If & ran last this would read &amp;lt;
    expect(escapeHtml('<')).toBe('&lt;')
  })

  it('handles the null/undefined/number cases the callers actually pass', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(0)).toBe('0')
    expect(escapeHtml(2400)).toBe('2400')
  })

  it('leaves ordinary operator text intact', () => {
    // Escaping must not visibly change real content — no HTML exists in the
    // live data (checked before this shipped), and normal words stay normal.
    expect(escapeHtml('Pyramids of Giza, Cairo')).toBe('Pyramids of Giza, Cairo')
    expect(escapeHtml('Afford Egypt')).toBe('Afford Egypt')
  })
})

describe('safeUrl', () => {
  it('passes real logo URLs through, escaped', () => {
    expect(safeUrl('https://cdn.example.com/logo.png'))
      .toBe('https://cdn.example.com/logo.png')
    expect(safeUrl('http://example.com/a.png?v=1&x=2'))
      .toContain('&amp;')
  })

  it('rejects every scheme that is not http(s)', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'JAVASCRIPT:alert(1)',
    ]) {
      expect(safeUrl(bad), bad).toBe('')
    }
  })

  it('rejects protocol-relative URLs and scheme-in-disguise', () => {
    expect(safeUrl('//evil.example.com/logo.png')).toBe('')
    expect(safeUrl('javascript:void')).toBe('')
  })

  it('allows relative paths, which cannot carry a scheme', () => {
    expect(safeUrl('/uploads/logo.png')).toBe('/uploads/logo.png')
  })

  it('rejects the breakout payload outright rather than escaping it', () => {
    expect(safeUrl(`x" onerror="alert(1)`)).toBe('')
  })

  it('returns empty for empty input', () => {
    for (const v of ['', null, undefined, '   ']) {
      expect(safeUrl(v as string), String(v)).toBe('')
    }
  })
})
