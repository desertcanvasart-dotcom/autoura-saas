import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const page = readFileSync(join(process.cwd(), 'app/signup/signup-content.tsx'), 'utf8')
const auth = readFileSync(join(process.cwd(), 'app/contexts/AuthContext.tsx'), 'utf8')

describe('sign-up', () => {
  it('asks for agreement to the Terms and Privacy Policy, and records when', () => {
    expect(page).toContain('id="signup-terms"')
    expect(page).toContain('href="/terms"')
    expect(page).toContain('href="/privacy"')
    expect(page).toContain('if (!acceptedTerms)')
    expect(page).toContain('new Date().toISOString())')
    expect(auth).toContain('terms_accepted_at: termsAcceptedAt')
  })

  it('every label names its field', () => {
    const labels = page.match(/<label[^>]*>/g) ?? []
    expect(labels.length).toBeGreaterThanOrEqual(6)
    for (const l of labels) expect(l).toMatch(/htmlFor="signup-/)
  })

  it('wears the brand, not the old blue "A"', () => {
    expect(page).toContain('<BrandMark')
    expect(page).not.toMatch(/bg-blue-600|from-blue-50/)
  })
})
