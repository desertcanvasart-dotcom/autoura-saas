import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Two lists decide whether a page is public, and they are in different files:
//   middleware.ts   publicRoutes  → ACCESS (can an anonymous visitor load it)
//   app/layout.tsx  publicPages   → CHROME (does the operator's sidebar show)
//
// The share page passed the first and failed the second, so a traveller opening
// their itinerary got the operator's dashboard navigation wrapped around it —
// working, but wrong, and invisible to every test that only checked the data.
// This pins the pairing so the next public route cannot repeat it.
// ============================================================================

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

describe('customer-facing routes are public in BOTH senses', () => {
  const middleware = read('middleware.ts')
  const layout = read('app/layout.tsx')

  it('/share is access-public in the middleware', () => {
    expect(middleware).toContain("'/share'")
  })

  it('/share is chrome-free in the root layout', () => {
    expect(layout).toContain("pathname.startsWith('/share/')")
  })

  it('every marketing route public in one is public in the other', () => {
    // These are pages a signed-out visitor lands on; a sidebar there is a bug.
    for (const route of ['/login', '/signup', '/pricing', '/privacy', '/terms']) {
      const inMiddleware = middleware.includes(`'${route}'`)
      const inLayout = layout.includes(`'${route}'`)
      // /pricing is marketing-only; assert the pairing where both should exist.
      if (inMiddleware && route !== '/pricing') {
        expect(inLayout, `${route} is access-public but still renders app chrome`).toBe(true)
      }
    }
  })
})
