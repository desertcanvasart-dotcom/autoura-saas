import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'

// Operator, 2026-11-01: Copilot lives in the sidebar (Communicate) only, and
// the notifications panel must stay on screen.

describe('top bar', () => {
  it('has no Copilot button or panel — the sidebar link is enough', () => {
    const bar = readFileSync('components/nav/TopBar.tsx', 'utf8')
    expect(bar).not.toMatch(/Copilot/)
    expect(existsSync('components/nav/CopilotPanel.tsx')).toBe(false)
    expect(readFileSync('lib/nav/config.ts', 'utf8')).toContain("{ label: 'Copilot', href: '/copilot'")
  })

  it('opens the notifications panel leftwards from the bell, full width on a phone', () => {
    const bell = readFileSync('components/NotificationBell.tsx', 'utf8')
    expect(bell).toContain('sm:right-0')
    expect(bell).toContain('fixed inset-x-2')
    expect(bell).not.toContain('top-full left-0')
  })
})
