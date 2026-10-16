import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logoFileProblem, LOGO_ACCEPT } from '@/lib/logo-file'

describe('company logo files', () => {
  it('takes PNG and JPEG — the formats the PDFs can show', () => {
    expect(logoFileProblem({ type: 'image/png', size: 1000 })).toBeNull()
    expect(logoFileProblem({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('refuses SVG (can carry script; the bucket is public) and WebP (vanishes from PDFs)', () => {
    expect(logoFileProblem({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG or JPEG/)
    expect(logoFileProblem({ type: 'image/webp', size: 1000 })).toMatch(/PNG or JPEG/)
  })

  it('refuses over 2MB', () => {
    expect(logoFileProblem({ type: 'image/png', size: 2 * 1024 * 1024 + 1 })).toMatch(/2MB/)
  })

  it('both upload screens use it', () => {
    for (const f of ['app/settings/tenant/page.tsx', 'app/onboarding/steps/BrandingStep.tsx']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).toContain('logoFileProblem(file)')
      expect(src, f).toContain('accept={LOGO_ACCEPT}')
      expect(src, f).not.toMatch(/SVG/)
    }
    expect(LOGO_ACCEPT).toBe('image/png,image/jpeg')
  })

  it('migration 426 limits the bucket and lets only owners and admins change logos', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/426_tenant_logos_png_jpeg_admins.sql'), 'utf8')
    expect(sql).toContain("allowed_mime_types = ARRAY['image/png', 'image/jpeg']")
    expect(sql.match(/role IN \('owner', 'admin'\)/g)?.length).toBe(4) // insert, update x2, delete
  })
})
