import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// The app's input styles (app/globals.css) apply to input[type="text"],
// [type="tel"], … only. An input with no type rendered with no border on the
// supplier sign-in, reply and profile pages — invisible on a white card
// (operator, 2026-11-01).

const FILES = [
  'app/supplier-login/SignInForm.tsx',
  'app/supplier-home/NetworkJoin.tsx',
  'app/reply/[token]/ReplyButtons.tsx',
  'components/DaysOffEditor.tsx',
]

describe('supplier-facing inputs', () => {
  it.each(FILES)('%s: every input says its type', f => {
    const inputs = readFileSync(f, 'utf8').match(/<input\b[^>]*>/g) ?? []
    expect(inputs.length).toBeGreaterThan(0)
    for (const i of inputs) expect(i).toMatch(/\btype=/)
  })

  it('the sign-in page has the logo, one card, the brand button and a way to staff sign-in', () => {
    const page = readFileSync('app/supplier-login/page.tsx', 'utf8')
    expect(page).toContain('/get-autoura-logo.png')
    expect(page).toContain('href="/login"')
    expect(readFileSync('app/supplier-login/SignInForm.tsx', 'utf8')).toContain('bg-[#263A29]')
  })
})
