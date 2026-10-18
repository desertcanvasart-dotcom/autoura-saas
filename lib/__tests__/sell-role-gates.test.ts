import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { roleAllows, roleDenied } from '@/lib/api-role-gate'
import { ROUTE_PERMISSIONS, permissionRouteFor } from '@/middleware'

const ROOT = path.join(__dirname, '..', '..')
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

describe('who may change what — the two levels', () => {
  it('staff is everyone but viewers; manage is managers, admins and owners', () => {
    expect(['owner', 'admin', 'manager', 'member'].every(r => roleAllows(r, 'staff'))).toBe(true)
    expect(roleAllows('viewer', 'staff')).toBe(false)
    expect(roleAllows('member', 'manage')).toBe(false)
    expect(roleAllows('owner', 'manage')).toBe(true)
    expect(roleAllows(null, 'staff')).toBe(false)
    expect(roleDenied('viewer', 'staff')?.status).toBe(403)
    expect(roleDenied('manager', 'manage')).toBeNull()
  })
})

// Each route answered anyone signed in to the tenant (sell-bugs, 2026-10-11).
const GATED: Record<string, string> = {
  'app/api/extras-catalogue/route.ts': "roleDenied(authResult.role, 'manage')",
  'app/api/extras-catalogue/[id]/route.ts': "roleDenied(authResult.role, 'manage')",
  'app/api/bookings/[id]/extras/route.ts': "roleDenied(auth.role, 'staff')",
  'app/api/bookings/[id]/extras/[eid]/route.ts': "decision.status === 'confirmed' || extra.status === 'confirmed'",
  'app/api/bookings/[id]/passengers/route.ts': "roleDenied(authResult.role, 'staff')",
  'app/api/bookings/[id]/portal-link/route.ts': "roleDenied(authResult.role, 'staff')",
  'app/api/bookings/[id]/suppliers/route.ts': "roleDenied(authResult.role, 'manage')",
  'app/api/bookings/[id]/sync-suppliers/route.ts': "'manage'",
  'app/api/bookings/from-quote/route.ts': "if (quote_type === 'b2b') {",
  'app/api/b2b/quotes/route.ts': "'manage'",
  'app/api/b2b/calculate-price/route.ts': "'manage'",
  'app/api/b2b/calculator-init/route.ts': "'manage'",
  'app/api/b2b/quote-from-itinerary/route.ts': "'manage'",
  'app/api/b2b/create-template-from-itinerary/route.ts': "'manage'",
  'app/api/b2b/partners/route.ts': "'manage'",
  'app/api/b2b/partners/[id]/route.ts': "gateRole('manage')",
  'app/api/b2b/transport-packages/route.ts': "'manage'",
  'app/api/b2b/transport-packages/[id]/route.ts': "'manage'",
  'app/api/quotes/b2b/route.ts': "'manage'",
  'app/api/quotes/b2b/[id]/route.ts': "gateRole('manage')",
  'app/api/quotes/b2b/[id]/generate-pdf/route.ts': "gateRole('manage')",
  'app/api/quotes/b2b/bulk-update/route.ts': "gateRole('manage')",
  'app/api/quotes/b2b/bulk-delete/route.ts': "gateRole('manage')",
  'app/api/quotes/b2c/bulk-update/route.ts': "gateRole('staff')",
  'app/api/quotes/b2c/from-itinerary/route.ts': "'staff'",
  'app/api/quotes/[type]/[id]/send/route.ts': "gateRole(type === 'b2b' ? 'manage' : 'staff')",
  'app/api/quotes/[type]/[id]/send-whatsapp/route.ts': "gateRole(type === 'b2b' ? 'manage' : 'staff')",
  'app/api/quotes/[type]/[id]/pdf/route.ts': "type === 'b2b' ? await gateRole('manage') : null",
}

describe('the Sell APIs check the role', () => {
  for (const [file, marker] of Object.entries(GATED)) {
    it(file, () => expect(src(file)).toContain(marker))
  }
})

describe('the Sell pages are gated as the sidebar shows them', () => {
  it('quotes and bookings for the sales team; B2B for managers and admins', () => {
    expect(ROUTE_PERMISSIONS[permissionRouteFor('/quotes/b2c/abc')!]).toEqual(['admin', 'manager', 'member'])
    expect(ROUTE_PERMISSIONS[permissionRouteFor('/quotes/b2b/abc')!]).toEqual(['admin', 'manager'])
    expect(ROUTE_PERMISSIONS[permissionRouteFor('/b2b/calculator/x')!]).toEqual(['admin', 'manager'])
    expect(ROUTE_PERMISSIONS[permissionRouteFor('/bookings/x')!]).toEqual(['admin', 'manager', 'member'])
  })

  it('buttons the API refuses are not shown', () => {
    const booking = src('app/bookings/[id]/page.tsx')
    expect(booking).toContain("{(isAdmin || isManager) && booking.quote_type !== 'b2b'")
    expect(booking).toContain('{(isAdmin || isManager) && (\n              <button\n                onClick={() => setShowAddPayment(true)}')
    const extras = src('components/BookingExtrasPanel.tsx')
    expect(extras).toContain("{canConfirm && (e.status === 'offered' || e.status === 'accepted') && (")
    expect(src('app/pricing-grid/components/GridHeader.tsx')).toContain("disabled={!canB2b && config.clientType === 'b2c'}")
  })
})
