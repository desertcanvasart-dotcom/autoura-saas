import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { roleAllows } from '@/lib/api-role-gate'
import { toLocalDateString } from '@/lib/today'
import { ROUTE_PERMISSIONS, permissionRouteFor } from '@/middleware'

const ROOT = path.join(__dirname, '..', '..')
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

// Operate-group bugs, 2026-10-11.
describe('1. the Payment Reminders page', () => {
  it('does not shadow the currency helper with one that calls itself', () => {
    const page = src('app/reminders/page.tsx')
    expect(page).not.toMatch(/const getCurrencySymbol = /)
    expect(page).toContain("import { getCurrencySymbol } from '@/lib/currency'")
  })
  it('states the schedule the daily job keeps', () => {
    const page = src('app/reminders/page.tsx')
    expect(page).not.toContain('9:00 AM')
    expect(page).toContain('Then one every 7 days until it is paid or paused')
  })
})

describe('2. the Capacity Calendar', () => {
  it('a day’s date is its local date, east of UTC too', () => {
    // A local midnight in Cairo is 22:00 the day before in UTC.
    const d = new Date(2026, 9, 15)
    expect(toLocalDateString(d)).toBe('2026-10-15')
    const page = src('app/departures/capacity/page.tsx')
    expect(page).toContain('const formatDate = (date: Date): string => toLocalDateString(date)')
    expect(page).not.toContain("toISOString().split('T')[0]")
  })
})

describe('3. Resource Management deletes nothing it does not show', () => {
  const page = src('app/resources/page.tsx')
  it('no Delete on a vehicle (a supplier), a guide (a supplier) or a hotel (rates)', () => {
    expect(page).not.toContain('fetch(`/api/suppliers/${vehicle.id}`, { method: \'DELETE\' })')
    expect(page).not.toContain('fetch(`/api/guides/${guide.id}`, { method: \'DELETE\' })')
    expect(page).not.toMatch(/handleDeleteHotel\(/)
  })
  it('hotels are one row per hotel; transport rows say they are companies', () => {
    expect(page).toContain("fetch('/api/resources/hotels/assignable')")
    expect(page).toContain('Edit in Suppliers')
    expect(page).toContain('(resource as any).is_active !== false')
  })
})

describe('4. follow-up priority', () => {
  it('offers only what the table accepts', () => {
    expect(src('components/AddFollowupModal.tsx')).not.toContain('<option value="urgent">')
    expect(src('supabase/migrations/035_create_client_followups.sql')).toContain("CHECK (priority IN ('low', 'medium', 'high'))")
  })
})

describe('5. Operate roles at the API and the page', () => {
  it('admin is owners and admins', () => {
    expect(roleAllows('admin', 'admin')).toBe(true)
    expect(roleAllows('owner', 'admin')).toBe(true)
    expect(roleAllows('manager', 'admin')).toBe(false)
  })

  const GATED: Record<string, string[]> = {
    'app/api/capacity/route.ts': ["gateRole('admin')"],
    'app/api/capacity/[date]/route.ts': ["gateRole('admin')"],
    'app/api/departures/route.ts': ["gateRole('manage')"],
    'app/api/departures/[id]/route.ts': ["gateRole('manage')"],
    'app/api/tasks/route.ts': ["gateRole('staff')"],
    'app/api/tasks/[id]/route.ts': ["gateRole('staff')"],
    'app/api/invoices/reminders/route.ts': ["gateRole('staff')"],
    'app/api/invoices/[id]/reminder/route.ts': ["gateRole('staff')"],
    'app/api/invoices/[id]/pause/route.ts': ["gateRole('staff')"],
    'app/api/supplier-documents/route.ts': ["gateRole('staff')"],
    'app/api/supplier-documents/[id]/route.ts': ["gateRole('staff')", "gateRole('manage')"],
    'app/api/itineraries/[id]/generate-documents/route.ts': ["gateRole('staff')"],
    'app/api/send-supplier-document/route.ts': ["gateRole('staff')"],
    'app/api/itinerary-resources/route.ts': ["gateRole('staff')", "gateRole('manage')"],
    'app/api/suppliers/[id]/route.ts': ["gateRole('manage')"],
    'app/api/guides/[id]/route.ts': ["gateRole('manage')"],
    'app/api/resources/hotels/[id]/route.ts': ["gateRole('manage')"],
    'app/api/resources/restaurants/[id]/route.ts': ["gateRole('manage')"],
  }
  for (const [file, markers] of Object.entries(GATED)) {
    it(file, () => { for (const m of markers) expect(src(file)).toContain(m) })
  }

  it('the pages are gated as the sidebar shows them', () => {
    for (const page of ['/departures', '/suppliers/x', '/resources', '/airport-staff']) {
      expect(ROUTE_PERMISSIONS[permissionRouteFor(page)!], page).toEqual(['admin', 'manager'])
    }
  })

  it('a refused delete or status change says so on the documents list', () => {
    const page = src('app/documents/supplier/page.tsx')
    expect(page).toContain("showToast('error', body.error || 'Could not delete the document')")
    expect(page).toContain("showToast('error', body.error || 'Could not change the status')")
  })
})
