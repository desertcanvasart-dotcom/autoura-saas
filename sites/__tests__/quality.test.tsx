import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { iconSvg } from '../lib/icon'
import { GET as favicon } from '../app/favicon.ico/route'
import { PALETTE_PRESETS, contrastRatio, readableOn } from '@/lib/publish/brand'

// ============================================================================
// Quality guards from the redesign audit (Lighthouse, 2026-10-28: performance
// 97–98, accessibility 100, best practices 100 on the Modern home and tour
// pages in three palettes). What would quietly undo it:
//   · footer text fixed to white — unreadable on an agency's light colour;
//   · faded small text on the footer (the audit's one contrast failure);
//   · a missing tab icon (the audit's console error).
// ============================================================================

/** The footer's background: the main colour, darkened 8% (theme.module.css .footer). */
function footerBackground(primary: string): string {
  const mix = (i: number) => Math.round(parseInt(primary.slice(i, i + 2), 16) * 0.92).toString(16).padStart(2, '0')
  return `#${mix(1)}${mix(3)}${mix(5)}`
}

describe('the footer stays readable in every palette', () => {
  const css = readFileSync(join(__dirname, '../themes/modern/theme.module.css'), 'utf8')
  const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{[^}]*\\}`))?.[0] ?? ''

  it('takes the brand layer\'s readable colour, never a fixed white', () => {
    expect(rule('footer')).toContain('color: var(--brand-on-primary)')
    expect(rule('footer')).not.toMatch(/color: #fff\b/)
  })
  it('does not fade its small print', () => {
    expect(rule('licence')).not.toContain('opacity')
    expect(rule('footerTagline')).not.toContain('opacity')
  })
  it('every ready-made palette, and a light agency colour, read at AA on the footer', () => {
    for (const primary of [...PALETTE_PRESETS.map(p => p.palette.primary), '#ffd400', '#e8f0ff']) {
      const bg = footerBackground(primary)
      expect(contrastRatio(readableOn(primary), bg), primary).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the tab icon', () => {
  it('is the agency\'s initial in its own colours, escaped', () => {
    const svg = iconSvg('Horizon Egypt', '#1e2a78', '#ffffff')
    expect(svg).toContain('fill="#1e2a78"')
    expect(svg).toContain('>H</text>')
    expect(iconSvg('<script>', '#000000', '#ffffff')).not.toContain('<script>')
    expect(iconSvg('  émeraude', '#000000', '#ffffff')).toContain('>É</text>')
  })
  it('/favicon.ico sends browsers to it on the same hostname', () => {
    const res = favicon()
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/icon.svg')
  })
})
