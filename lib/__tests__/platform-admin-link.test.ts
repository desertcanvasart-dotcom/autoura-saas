import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'

vi.mock('@/app/contexts/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: false }) }))

import { jumpEntriesFor } from '@/components/nav/CommandPalette'
import { PLATFORM_ADMIN_LINK } from '@/lib/nav/config'

// Operator, 2026-11-01: the old Super Admin button was missed after the menu
// moved. Platform admin is now also above Settings in the sidebar and in ⌘K —
// for platform staff only.

describe('Platform admin link', () => {
  it('goes to the platform panel', () => {
    expect(PLATFORM_ADMIN_LINK.href).toBe('/super-admin')
  })

  it('is in ⌘K for platform staff, and for nobody else — whatever their role', () => {
    expect(jumpEntriesFor('admin', { platformStaff: true }).some(e => e.href === '/super-admin')).toBe(true)
    for (const role of ['admin', 'manager', 'member', 'viewer'] as const) {
      expect(jumpEntriesFor(role).some(e => e.href === '/super-admin')).toBe(false)
    }
  })

  it('the sidebar shows it only when the login is platform staff', () => {
    const sidebar = readFileSync('components/Sidebar.tsx', 'utf8')
    expect(sidebar).toContain('{isSuperAdmin && (')
    expect(sidebar).toContain('href={PLATFORM_ADMIN_LINK.href}')
  })
})
